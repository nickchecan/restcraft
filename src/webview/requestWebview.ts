import { responseHeaderAssignments } from '../request/automation';
import * as vscode from 'vscode';
import { isAbsolute, posix } from 'path';
import { isEnvironmentFileSettings, copyEnvironmentFileSettings, isTokenView } from '../request/environmentSettings';

import { parseEnvFile, resolveRequestVariables, updateEnvValue } from '../request/environment';
import { buildOAuthTokenRequest, readOAuthAccessToken } from '../request/oauth';
import { executeRequest, StreamListener } from '../request/requestRunner';
import { AuthorizationCodeFields } from '../request/authorizationCode';
import { getAuthorizationCodeToken, getOAuthRedirectUri } from './oauthCallback';
import type { RedirectUriInfo } from './oauthRedirect';
import {
	ApiResponse,
	EnvironmentFileSettings,
	RequestFileDefinition,
	RequestHeaderDefinition,
	RequestParamDefinition,
} from '../request/types';
import { isRecord } from '../shared/object';
import { getWebviewHtml } from './getWebviewHtml';
import {
	CheckEnvironmentVariablesMessage,
	readWebviewMessage,
	RequestChangedMessage,
	ResolveEnvironmentVariableMessage,
	SendRequestMessage,
} from './webviewMessage';

export type { RequestChangedMessage, SendRequestMessage };

export interface RequestWebviewHandlers {
	extensionVersion?: string;
	onGetRequestUri?: () => vscode.Uri | undefined;
	onReady?: () => void;
	onRequestChanged?: (message: RequestChangedMessage) => void;
	onSendRequest?: (message: SendRequestMessage, signal: AbortSignal, onStream?: StreamListener) => Promise<ApiResponse>;
	onResolveEnvironmentVariable?: (name: string) => Promise<string | undefined>;
	onCheckEnvironmentVariables?: (names: string[]) => Promise<string[]>;
}

/**
 * Initializes a request webview and wires all trusted extension-host handlers.
 *
 * Every message received from the webview is validated before use. Callers can
 * opt into document sync and environment-aware sending by providing handlers,
 * while the workbench panel can use the default request execution path.
 */
export function initializeRequestWebview(
	webview: vscode.Webview,
	handlersOrOnReady?: RequestWebviewHandlers | (() => void),
): vscode.Disposable {
	const handlers = typeof handlersOrOnReady === 'function' ? { onReady: handlersOrOnReady } : (handlersOrOnReady ?? {});
	const activeRequests = new Map<number, AbortController>();
	let oauthRedirectUrl = '';
	let preparingOAuthRedirect = false;

	webview.html = getWebviewHtml(webview, handlers.extensionVersion ?? '0.0.0');

	const messageSubscription = webview.onDidReceiveMessage((message: unknown) => {
		dispatchWebviewMessage(message);
	});

	function dispatchWebviewMessage(message: unknown): void {
		const command = readWebviewMessage(message);
		if (!command) {
			return;
		}

		switch (command.type) {
			case 'webviewReady':
				void webview.postMessage({
					type: 'workspaceTrust',
					isTrusted: vscode.workspace.isTrusted,
				});
				void postEnvironmentTooltipSetting(webview);
				void postTokenViewSetting(webview);
				void postAutoGenerateStateSetting(webview);
				handlers.onReady?.();
				return;
			case 'getOAuthRedirect':
				if (!preparingOAuthRedirect) {
					preparingOAuthRedirect = true;
					void getOAuthRedirectUri()
						.then(
							(info) => {
								oauthRedirectUrl = info.uri;
								return webview.postMessage({ type: 'oauthRedirect', url: info.uri, stable: info.stable });
							},
							() => {
								oauthRedirectUrl = '';
								return webview.postMessage({ type: 'oauthRedirect', error: 'Unable to prepare the callback URL.' });
							},
						)
						.then(() => {
							preparingOAuthRedirect = false;
						});
				}
				return;
			case 'copyOAuthToken':
				void vscode.env.clipboard.writeText(command.token);
				return;
			case 'copyOAuthRedirect':
				if (oauthRedirectUrl) {
					void vscode.env.clipboard.writeText(oauthRedirectUrl);
				}
				return;
			case 'getConfiguredOAuthToken':
				void postConfiguredOAuthToken(webview, handlers.onGetRequestUri?.(), command.requestId, command.authorization);
				return;
			case 'getEnvironmentFile': {
				const uri = handlers.onGetRequestUri?.();
				if (uri) {
					environmentSelections.set(uri.toString(), command.environment);
				}
				void postEnvironmentFile(webview, handlers.onGetRequestUri?.(), command.requestId);
				return;
			}
			case 'chooseEnvironmentFile':
				void chooseEnvironmentFile(webview, handlers.onGetRequestUri?.(), command.requestId);
				return;
			case 'openEnvironmentFile':
				void openEnvironmentFile(handlers.onGetRequestUri?.());
				return;
			case 'requestChanged': {
				const uri = handlers.onGetRequestUri?.();
				if (uri) {
					environmentSelections.set(uri.toString(), command.environment);
				}
				handlers.onRequestChanged?.(command);
				return;
			}
			case 'cancelOAuthToken':
				for (const [key, controller] of activeRequests) {
					if (key < 0) {
						controller.abort();
					}
				}
				return;
			case 'cancelRequest':
				activeRequests.get(command.requestId)?.abort();
				return;
			case 'openXProfile':
				void vscode.env.openExternal(vscode.Uri.parse('https://x.com/nickchecan'));
				return;
			case 'openRepository':
				void vscode.env.openExternal(vscode.Uri.parse('https://github.com/nickchecan/restcraft'));
				return;
			case 'openIssues':
				void vscode.env.openExternal(vscode.Uri.parse('https://github.com/nickchecan/restcraft/issues'));
				return;
			case 'openNetworkLog':
				void vscode.commands.executeCommand('restcraft.showNetworkLog');
				return;
			case 'openNetworkHistory':
				void vscode.commands.executeCommand('restcraft.showNetworkHistory');
				return;
			case 'openSettings':
				void vscode.commands.executeCommand('workbench.action.openSettings', '@ext:nickchecan.restcraft');
				return;
			case 'resolveEnvironmentVariable':
				void handleResolveEnvironmentVariable(webview, command, handlers);
				return;
			case 'checkEnvironmentVariables':
				void handleCheckEnvironmentVariables(webview, command, handlers);
				return;
			case 'getOAuthToken':
				void handleOAuthToken(
					webview,
					{
						url: command.url,
						clientId: command.clientId,
						clientSecret: command.clientSecret,
						scope: command.scope,
						grantType: command.grantType === 'authorization_code' ? 'authorization_code' : 'client_credentials',
						authorizationUrl: command.authorizationUrl ?? '',
						clientAuthentication:
							command.clientAuthentication === 'basic' || command.clientAuthentication === 'body'
								? command.clientAuthentication
								: 'none',
						state: command.state ?? '',
						usePkce: command.usePkce !== false,
					},
					command.requestId,
					handlers,
					activeRequests,
					command.storeAccessToken === true,
					command.accessTokenVariable ?? 'ACCESS_TOKEN',
					(info) => {
						oauthRedirectUrl = info.uri;
					},
				);
				return;
			case 'sendRequest':
				void handleMessage(webview, command, handlers, activeRequests);
				return;
			default: {
				const unreachable: never = command;
				return unreachable;
			}
		}
	}
	const trustSubscription = vscode.workspace.onDidGrantWorkspaceTrust(() => {
		void webview.postMessage({
			type: 'workspaceTrust',
			isTrusted: true,
		});
	});
	const settingsSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('restcraft.autoGenerateAuthorizationCodeState')) {
			void postAutoGenerateStateSetting(webview);
		}
		if (event.affectsConfiguration('restcraft.defaultTokenView')) {
			void postTokenViewSetting(webview);
		}
		if (event.affectsConfiguration('restcraft.showEnvironmentVariableValues')) {
			void postEnvironmentTooltipSetting(webview);
		}
	});

	return vscode.Disposable.from(
		messageSubscription,
		trustSubscription,
		settingsSubscription,
		new vscode.Disposable(() => {
			for (const controller of activeRequests.values()) {
				controller.abort();
			}
			activeRequests.clear();
		}),
	);
}

/** Updates the preference without changing an already-open request's State. */
async function postAutoGenerateStateSetting(webview: vscode.Webview): Promise<void> {
	const value = vscode.workspace
		.getConfiguration('restcraft')
		.get<boolean>('autoGenerateAuthorizationCodeState', false);
	await webview.postMessage({ type: 'autoGenerateStateSetting', value: value === true });
}

/** Sends the extension-wide token output preference to each open webview. */
async function postTokenViewSetting(webview: vscode.Webview): Promise<void> {
	const configured = vscode.workspace.getConfiguration('restcraft').get<string>('defaultTokenView', 'raw');
	await webview.postMessage({ type: 'tokenViewSetting', value: isTokenView(configured) ? configured : 'raw' });
}

/** Sends the current environment-value tooltip preference into the webview. */
async function postEnvironmentTooltipSetting(webview: vscode.Webview): Promise<void> {
	const isEnabled = vscode.workspace.getConfiguration('restcraft').get<boolean>('showEnvironmentVariableValues', true);
	await webview.postMessage({
		type: 'environmentTooltipSetting',
		isEnabled,
	});
}

/** Resolves only the single environment variable the user is hovering over. */
async function handleResolveEnvironmentVariable(
	webview: vscode.Webview,
	message: ResolveEnvironmentVariableMessage,
	handlers: RequestWebviewHandlers,
): Promise<void> {
	try {
		if (!vscode.workspace.isTrusted) {
			throw new Error('Environment values are only available in a trusted workspace.');
		}
		if (!vscode.workspace.getConfiguration('restcraft').get<boolean>('showEnvironmentVariableValues', true)) {
			return;
		}

		const value = await handlers.onResolveEnvironmentVariable?.(message.name);
		await webview.postMessage({
			type: 'environmentVariableResolved',
			requestId: message.requestId,
			name: message.name,
			value,
		});
	} catch (error) {
		await webview.postMessage({
			type: 'environmentVariableResolved',
			requestId: message.requestId,
			name: message.name,
			error: error instanceof Error ? error.message : 'Unable to resolve environment variable.',
		});
	}
}

/** Checks which referenced variable names exist without sending their values. */
async function handleCheckEnvironmentVariables(
	webview: vscode.Webview,
	message: CheckEnvironmentVariablesMessage,
	handlers: RequestWebviewHandlers,
): Promise<void> {
	try {
		if (!vscode.workspace.isTrusted) {
			throw new Error('Environment values are only available in a trusted workspace.');
		}
		if (!vscode.workspace.getConfiguration('restcraft').get<boolean>('showEnvironmentVariableValues', true)) {
			await webview.postMessage({
				type: 'environmentVariablesChecked',
				requestId: message.requestId,
				definedNames: [],
			});
			return;
		}

		const definedNames = (await handlers.onCheckEnvironmentVariables?.(message.names)) ?? [];
		await webview.postMessage({
			type: 'environmentVariablesChecked',
			requestId: message.requestId,
			definedNames,
		});
	} catch (error) {
		await webview.postMessage({
			type: 'environmentVariablesChecked',
			requestId: message.requestId,
			definedNames: [],
			error: error instanceof Error ? error.message : 'Unable to check environment variables.',
		});
	}
}

/**
 * Pushes a request model into the webview.
 *
 * Custom editors may pass draft param/header state so user edits are preserved
 * while the backing text document is being rewritten.
 */
export async function loadRequestInWebview(
	webview: vscode.Webview,
	request: RequestFileDefinition,
	params?: RequestParamDefinition[],
	headerState?: RequestHeaderDefinition[],
): Promise<void> {
	await webview.postMessage({
		type: 'loadRequest',
		request: {
			...request,
			params: params ?? request.params,
			headerState: headerState ?? request.headerState,
		},
	});
}

/**
 * Handles a validated send request and posts either a completion or error event
 * back to the webview UI.
 */
async function handleMessage(
	webview: vscode.Webview,
	message: SendRequestMessage,
	handlers: RequestWebviewHandlers,
	activeRequests: Map<number, AbortController>,
): Promise<void> {
	let controller: AbortController | undefined;
	try {
		if (!vscode.workspace.isTrusted) {
			throw new Error('Sending requests and resolving .env variables requires a trusted workspace.');
		}

		const requestUri = handlers.onGetRequestUri?.();
		controller = new AbortController();
		activeRequests.set(message.requestId, controller);
		const onStream: StreamListener = (update) => {
			void webview.postMessage({ type: 'requestStream', requestId: message.requestId, update });
		};
		const response = handlers.onSendRequest
			? await handlers.onSendRequest(message, controller.signal, onStream)
			: await executeRequest(
					{
						method: message.method,
						url: message.url,
						headers: message.headers,
						body: message.body,
					},
					getRequestTimeout(),
					controller.signal,
					'follow',
					onStream,
				);

		let automationError: string | undefined;
		try {
			const assignments = responseHeaderAssignments(message.automation ?? [], response.headers);
			if (Object.keys(assignments).length) {
				const uri = requestUri;
				if (!uri) {
					throw new Error('Save or load a request file before running automation.');
				}
				await storeEnvironmentValues(uri, assignments, controller.signal);
			}
		} catch (error) {
			automationError = error instanceof Error ? error.message : 'Unable to update environment variables.';
		}
		if (automationError) {
			void vscode.window.showWarningMessage('Response received, but automation failed: ' + automationError);
		}
		await webview.postMessage({
			type: 'requestComplete',
			requestId: message.requestId,
			response,
		});
	} catch (error) {
		await webview.postMessage({
			type: 'requestError',
			requestId: message.requestId,
			message: error instanceof Error ? error.message : 'Request failed.',
			cancelled: controller?.signal.aborted === true,
		});
	} finally {
		activeRequests.delete(message.requestId);
	}
}

/**
 * Executes a request after resolving variables from a sibling `.env` file.
 *
 * If the request has no associated file URI, variable resolution uses an empty
 * environment map and unresolved variables will be reported by the resolver.
 */
export async function executeRequestWithEnvironment(
	message: SendRequestMessage,
	requestUri: vscode.Uri | undefined,
	signal?: AbortSignal,
	onStream?: StreamListener,
): Promise<ApiResponse> {
	if (!vscode.workspace.isTrusted) {
		throw new Error('Sending requests and resolving .env variables requires a trusted workspace.');
	}

	const variables = requestUri ? await readEnvironmentVariables(requestUri) : {};
	const request = resolveRequestVariables(
		{
			method: message.method,
			url: message.url,
			headers: message.headers,
			body: message.body,
		},
		variables,
	);
	await confirmInsecureCredentialRequest(request.url, request.headers);

	return executeRequest(request, getRequestTimeout(), signal, 'follow', onStream);
}

/** Reads one environment value for an explicit hover lookup. */
export async function resolveEnvironmentVariable(
	name: string,
	requestUri: vscode.Uri | undefined,
): Promise<string | undefined> {
	if (!vscode.workspace.isTrusted) {
		throw new Error('Environment values are only available in a trusted workspace.');
	}

	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
		return undefined;
	}

	const variables = requestUri ? await readEnvironmentVariables(requestUri) : {};
	return variables[name];
}

/** Returns which requested variable names are defined in the sibling .env. */
export async function findDefinedEnvironmentVariables(
	names: string[],
	requestUri: vscode.Uri | undefined,
): Promise<string[]> {
	if (!vscode.workspace.isTrusted || !requestUri || names.length === 0) {
		return [];
	}

	const variables = await readEnvironmentVariables(requestUri);
	return names.filter((name) => Object.prototype.hasOwnProperty.call(variables, name));
}

/** Warns before credentials are sent to a remote host over plain HTTP. */
async function confirmInsecureCredentialRequest(
	url: string,
	headers: Record<string, string> | undefined,
): Promise<void> {
	if (vscode.workspace.getConfiguration('restcraft').get<boolean>('suppressInsecureCredentialWarning', false)) {
		return;
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url);
	} catch {
		return;
	}

	if (
		parsedUrl.protocol !== 'http:' ||
		isLocalHost(parsedUrl.hostname) ||
		!hasAuthenticationCredentials(headers, parsedUrl)
	) {
		return;
	}

	const sendOnce = 'Send once';
	const dontShowAgain = "Don't show this again";
	const choice = await vscode.window.showWarningMessage(
		`This request sends authentication credentials to ${parsedUrl.hostname} over unencrypted HTTP. The credentials could be read by others on the network.`,
		{ modal: true },
		sendOnce,
		dontShowAgain,
	);

	if (choice === dontShowAgain) {
		await vscode.workspace
			.getConfiguration('restcraft')
			.update('suppressInsecureCredentialWarning', true, vscode.ConfigurationTarget.Global);
		return;
	}

	if (choice !== sendOnce) {
		throw new Error('Request cancelled.');
	}
}

/** Recognizes common authentication and API-key request headers. */
function hasAuthenticationCredentials(headers: Record<string, string> | undefined, url: URL): boolean {
	if (url.username.length > 0 || url.password.length > 0) {
		return true;
	}

	return Object.entries(headers ?? {}).some(([name, value]) => {
		const normalizedName = name.toLowerCase();
		return (
			value.length > 0 &&
			(normalizedName === 'authorization' ||
				normalizedName === 'proxy-authorization' ||
				normalizedName === 'cookie' ||
				normalizedName === 'x-api-key' ||
				normalizedName === 'api-key' ||
				normalizedName === 'x-auth-token')
		);
	});
}

/** Keeps loopback and local development hosts warning-free. */
function isLocalHost(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
	return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/** Reads the user's configured request timeout, in milliseconds. */
function getRequestTimeout(): number {
	const timeout = vscode.workspace.getConfiguration('restcraft').get<number>('requestTimeout', 30000);
	return Number.isFinite(timeout) && timeout >= 0 ? timeout : 30000;
}

/**
 * Reads the closest `.env` file at or above a request document's directory,
 * stopping at the containing VS Code workspace folder.
 */
async function readEnvironmentVariables(requestUri: vscode.Uri): Promise<Record<string, string>> {
	const file = await findEnvironmentFile(requestUri);
	return parseEnvFile(file.content);
}

const environmentSelections = new Map<string, EnvironmentFileSettings | undefined>();

async function readEnvironmentSelection(requestUri: vscode.Uri): Promise<EnvironmentFileSettings | undefined> {
	if (environmentSelections.has(requestUri.toString())) {
		return environmentSelections.get(requestUri.toString());
	}
	try {
		const document = vscode.workspace.textDocuments.find(
			(document) => document.uri.toString() === requestUri.toString(),
		);
		const content = document?.getText() ?? new TextDecoder().decode(await vscode.workspace.fs.readFile(requestUri));
		const parsed: unknown = JSON.parse(content);
		if (isRecord(parsed) && isEnvironmentFileSettings(parsed.environment)) {
			return copyEnvironmentFileSettings(parsed.environment);
		}
	} catch (error) {
		if (!(error instanceof SyntaxError) && !isFileNotFoundError(error)) {
			throw error;
		}
	}
	return undefined;
}

/** Uses the same closest-file lookup for reading and writing tokens. */
async function findEnvironmentFile(
	requestUri: vscode.Uri,
): Promise<{ uri: vscode.Uri; content: string; exists: boolean }> {
	const selection = await readEnvironmentSelection(requestUri);
	if (selection?.mode === 'manual') {
		if (!selection.path.trim()) {
			throw new Error('Choose an environment file in Request Settings.');
		}
		const uri = vscode.Uri.joinPath(readRequestDirectory(requestUri), selection.path);
		const content = await vscode.workspace.fs.readFile(uri);
		return { uri, content: new TextDecoder().decode(content), exists: true };
	}
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(requestUri);
	const workspaceRoot = workspaceFolder?.uri ?? readRequestDirectory(requestUri);
	let directory = readRequestDirectory(requestUri);

	while (isDirectoryWithinWorkspace(directory, workspaceRoot)) {
		const envUri = vscode.Uri.joinPath(directory, '.env');
		try {
			const content = await vscode.workspace.fs.readFile(envUri);
			return { uri: envUri, content: new TextDecoder().decode(content), exists: true };
		} catch (error) {
			if (!isFileNotFoundError(error)) {
				throw error;
			}
		}

		if (sameDirectory(directory, workspaceRoot)) {
			break;
		}

		const parentDirectory = readParentDirectory(directory);
		if (sameDirectory(directory, parentDirectory)) {
			break;
		}
		directory = parentDirectory;
	}

	return { uri: vscode.Uri.joinPath(readRequestDirectory(requestUri), '.env'), content: '', exists: false };
}

/**
 * Returns the directory URI that contains a request file.
 */
function readRequestDirectory(requestUri: vscode.Uri): vscode.Uri {
	const directoryPath = requestUri.path.replace(/\/[^/]*$/, '') || '/';

	return requestUri.with({ path: directoryPath });
}

/** Returns the parent directory URI without crossing URI authorities. */
function readParentDirectory(directory: vscode.Uri): vscode.Uri {
	const normalizedPath = normalizeDirectoryPath(directory.path);
	const parentPath = normalizedPath === '/' ? '/' : normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) || '/';

	return directory.with({ path: parentPath });
}

/** Checks whether a candidate directory is inside the workspace root. */
function isDirectoryWithinWorkspace(directory: vscode.Uri, workspaceRoot: vscode.Uri): boolean {
	if (directory.scheme !== workspaceRoot.scheme || directory.authority !== workspaceRoot.authority) {
		return false;
	}

	const directoryPath = normalizeDirectoryPath(directory.path);
	const rootPath = normalizeDirectoryPath(workspaceRoot.path);
	return directoryPath === rootPath || directoryPath.startsWith(rootPath === '/' ? '/' : rootPath + '/');
}

/** Compares two directory URIs after removing trailing path separators. */
function sameDirectory(left: vscode.Uri, right: vscode.Uri): boolean {
	return (
		left.scheme === right.scheme &&
		left.authority === right.authority &&
		normalizeDirectoryPath(left.path) === normalizeDirectoryPath(right.path)
	);
}

function normalizeDirectoryPath(path: string): string {
	const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
	return normalized || '/';
}

/**
 * Detects missing `.env` files without hiding other filesystem errors.
 */
function isFileNotFoundError(error: unknown): boolean {
	if (!(error instanceof vscode.FileSystemError)) {
		return false;
	}

	return error.code === 'FileNotFound';
}

/** Retrieves a token only in response to the explicit webview button action. */
async function handleOAuthToken(
	webview: vscode.Webview,
	fields: AuthorizationCodeFields & { grantType: 'client_credentials' | 'authorization_code' },
	requestId: number,
	handlers: RequestWebviewHandlers,
	activeRequests: Map<number, AbortController>,
	storeAccessToken = false,
	accessTokenVariable = 'ACCESS_TOKEN',
	onRedirect: (info: RedirectUriInfo) => void = () => {},
): Promise<void> {
	// Negative IDs keep token retrieval separate from normal request cancellation IDs.
	const requestUri = handlers.onGetRequestUri?.();
	const key = -requestId - 1;
	if (activeRequests.has(key)) {
		return;
	}
	const controller = new AbortController();
	activeRequests.set(key, controller);
	try {
		if (!vscode.workspace.isTrusted) {
			throw new Error('Getting an access token requires a trusted workspace.');
		}
		if (storeAccessToken) {
			if (!requestUri) {
				throw new Error('Save or load a request file before storing an access token in .env.');
			}
			if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(accessTokenVariable)) {
				throw new Error('Enter a valid access token variable name.');
			}
		}
		if (fields.grantType === 'authorization_code' && fields.clientAuthentication === 'none') {
			fields.clientSecret = '';
		}
		const variables: Record<string, string> = requestUri ? await readEnvironmentVariables(requestUri) : {};
		for (const value of Object.values(fields)) {
			if (typeof value !== 'string') {
				continue;
			}
			for (const match of value.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)) {
				const resolved = requestUri ? variables[match[1]] : await handlers.onResolveEnvironmentVariable?.(match[1]);
				if (resolved !== undefined) {
					variables[match[1]] = resolved;
				}
			}
		}
		const resolved = resolveRequestVariables(
			{
				method: 'POST',
				url: fields.url,
				headers: {
					clientId: fields.clientId,
					clientSecret: fields.clientSecret,
					scope: fields.scope,
					...(fields.grantType === 'authorization_code'
						? { authorizationUrl: fields.authorizationUrl, state: fields.state }
						: {}),
				},
			},
			variables,
		);
		if (controller.signal.aborted) {
			throw new Error('Token request cancelled.');
		}
		const resolvedFields: AuthorizationCodeFields = {
			...fields,
			url: resolved.url,
			clientId: resolved.headers!.clientId,
			clientSecret: resolved.headers!.clientSecret,
			scope: resolved.headers!.scope,
			authorizationUrl: resolved.headers!.authorizationUrl ?? '',
			state: resolved.headers!.state ?? '',
		};
		let token: string;
		if (fields.grantType === 'authorization_code') {
			token = await getAuthorizationCodeToken(resolvedFields, controller.signal, getRequestTimeout(), async (info) => {
				onRedirect(info);
				await webview.postMessage({ type: 'oauthRedirect', url: info.uri, stable: info.stable });
			});
		} else {
			const request = buildOAuthTokenRequest({
				url: resolved.url,
				clientId: resolved.headers!.clientId,
				clientSecret: resolved.headers!.clientSecret,
				scope: resolved.headers!.scope,
			});
			const response = await executeRequest(request, getRequestTimeout(), controller.signal, 'error');
			token = readOAuthAccessToken(response);
		}
		if (controller.signal.aborted) {
			throw new Error('Token request cancelled.');
		}
		if (storeAccessToken && requestUri) {
			await storeOAuthTokenInEnvironment(requestUri, accessTokenVariable, token, controller.signal);
		}
		await webview.postMessage({ type: 'oauthTokenResult', requestId, token, stored: storeAccessToken });
	} catch (error) {
		await webview.postMessage({
			type: 'oauthTokenResult',
			requestId,
			error: error instanceof Error ? error.message : 'Unable to get an access token.',
		});
	} finally {
		controller.abort();
		activeRequests.delete(key);
	}
}

// Serializes environment writes so token retrievals in different editors do not lose updates.
const environmentWrites = new Map<string, Promise<void>>();

/** Stores a token in the exact environment selected by the request's lookup rules. */
export async function storeOAuthTokenInEnvironment(
	requestUri: vscode.Uri,
	name: string,
	token: string,
	signal?: AbortSignal,
): Promise<void> {
	return storeEnvironmentValues(requestUri, { [name]: token }, signal);
}

async function storeEnvironmentValues(
	requestUri: vscode.Uri,
	values: Record<string, string>,
	signal?: AbortSignal,
): Promise<void> {
	if (!vscode.workspace.isTrusted) {
		throw new Error('Writing environment variables requires a trusted workspace.');
	}
	const target = await findEnvironmentFile(requestUri);
	const key = target.uri.toString();
	const previous = environmentWrites.get(key) ?? Promise.resolve();
	const write = previous
		.catch(() => {})
		.then(async () => {
			if (!vscode.workspace.isTrusted) {
				throw new Error('Writing environment variables requires a trusted workspace.');
			}
			const openDocument = vscode.workspace.textDocuments.find((document) => document.uri.toString() === key);
			if (openDocument?.isDirty) {
				throw new Error('Save the .env file before writing environment variables.');
			}
			let content = '';
			try {
				content = new TextDecoder().decode(await vscode.workspace.fs.readFile(target.uri));
			} catch (error) {
				if (!isFileNotFoundError(error)) {
					throw error;
				}
			}
			if (signal?.aborted) {
				throw new Error('Environment update cancelled.');
			}
			await vscode.workspace.fs.writeFile(
				target.uri,
				new TextEncoder().encode(
					Object.entries(values).reduce((text, [name, value]) => updateEnvValue(text, name, value), content),
				),
			);
		});
	environmentWrites.set(key, write);
	try {
		await write;
	} finally {
		if (environmentWrites.get(key) === write) {
			environmentWrites.delete(key);
		}
	}
}

/** Returns the existing environment file selected by request execution, without exposing its contents. */
export async function findRequestEnvironmentUri(requestUri: vscode.Uri | undefined): Promise<vscode.Uri | undefined> {
	if (!requestUri) {
		return undefined;
	}
	const file = await findEnvironmentFile(requestUri);
	return file.exists ? file.uri : undefined;
}

async function postEnvironmentFile(
	webview: vscode.Webview,
	requestUri: vscode.Uri | undefined,
	requestId: number,
): Promise<void> {
	try {
		const uri = await findRequestEnvironmentUri(requestUri);
		await webview.postMessage({
			type: 'environmentFile',
			requestId,
			path: uri ? (uri.scheme === 'file' ? uri.fsPath : uri.toString()) : '',
		});
	} catch (error) {
		await webview.postMessage({
			type: 'environmentFile',
			requestId,
			path: '',
			error: error instanceof Error ? error.message : 'Unable to locate the environment file.',
		});
	}
}

/** Re-resolves the file in the extension host instead of trusting a webview-supplied path. */
async function openEnvironmentFile(requestUri: vscode.Uri | undefined): Promise<void> {
	try {
		const uri = await findRequestEnvironmentUri(requestUri);
		if (uri) {
			await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
		}
	} catch (error) {
		void vscode.window.showErrorMessage(
			error instanceof Error ? error.message : 'Unable to open the environment file.',
		);
	}
}

async function chooseEnvironmentFile(
	webview: vscode.Webview,
	requestUri: vscode.Uri | undefined,
	requestId: number,
): Promise<void> {
	try {
		if (!requestUri) {
			throw new Error('Save or load a request file before choosing an environment file.');
		}
		const root = vscode.workspace.getWorkspaceFolder(requestUri)?.uri ?? readRequestDirectory(requestUri);
		// VS Code's picker lists dotfiles independently of the native dialog's hidden-file setting.
		const files = await vscode.workspace.findFiles(new vscode.RelativePattern(root, '**/{.env,.env.*}'), null, 500);
		const items: (vscode.QuickPickItem & { uri?: vscode.Uri })[] = files
			.sort((left, right) => left.path.localeCompare(right.path))
			.map((uri) => ({ label: posix.basename(uri.path), description: posix.relative(root.path, uri.path), uri }));
		items.push({
			label: 'Enter a file path…',
			description: 'Select a file outside this project or another environment file',
		});
		const selected = await vscode.window.showQuickPick(items, {
			title: 'Choose environment file',
			placeHolder: 'Select an .env file, including hidden files',
			matchOnDescription: true,
		});
		if (!selected) {
			return;
		}
		let uri = selected.uri;
		if (!uri) {
			const entered = await vscode.window.showInputBox({
				title: 'Environment file path',
				prompt: 'Enter an existing file path, absolute or relative to the request folder.',
				placeHolder: '../config/.env',
			});
			if (!entered?.trim()) {
				return;
			}
			const path = entered.trim();
			uri =
				requestUri.scheme === 'file' && isAbsolute(path)
					? vscode.Uri.file(path)
					: path.startsWith('/')
						? requestUri.with({ path })
						: vscode.Uri.joinPath(readRequestDirectory(requestUri), path.replace(/\\/g, '/'));
		}
		const stat = await vscode.workspace.fs.stat(uri);
		if (!(stat.type & vscode.FileType.File)) {
			throw new Error('Choose an existing environment file, rather than a folder.');
		}
		if (uri.scheme !== requestUri.scheme || uri.authority !== requestUri.authority) {
			throw new Error('Choose a file on the same filesystem as the request.');
		}
		const path = posix.relative(readRequestDirectory(requestUri).path, uri.path);
		await webview.postMessage({ type: 'environmentFileSelected', requestId, path });
	} catch (error) {
		await webview.postMessage({
			type: 'environmentFileSelected',
			requestId,
			error: error instanceof Error ? error.message : 'Unable to choose an environment file.',
		});
	}
}

/** Resolves the effective Bearer token for display only, without updating request files. */
export async function resolveConfiguredOAuthToken(
	authorization: string,
	requestUri: vscode.Uri | undefined,
): Promise<string> {
	if (!vscode.workspace.isTrusted) {
		throw new Error('Showing access tokens requires a trusted workspace.');
	}
	if (!authorization.startsWith('Bearer ')) {
		return '';
	}
	const variables = authorization.includes('{{') && requestUri ? await readEnvironmentVariables(requestUri) : {};
	const resolved = resolveRequestVariables(
		{ method: 'GET', url: 'https://localhost/', headers: { Authorization: authorization } },
		variables,
	);
	return resolved.headers!.Authorization.slice(7);
}

async function postConfiguredOAuthToken(
	webview: vscode.Webview,
	requestUri: vscode.Uri | undefined,
	requestId: number,
	authorization: string,
): Promise<void> {
	try {
		await webview.postMessage({
			type: 'configuredOAuthToken',
			requestId,
			token: await resolveConfiguredOAuthToken(authorization, requestUri),
		});
	} catch (error) {
		await webview.postMessage({
			type: 'configuredOAuthToken',
			requestId,
			token: '',
			error: error instanceof Error ? error.message : 'Unable to resolve configured access token.',
		});
	}
}
