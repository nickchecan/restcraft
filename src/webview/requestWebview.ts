import * as vscode from 'vscode';

import { parseEnvFile, resolveRequestVariables, updateEnvValue } from '../request/environment';
import { buildOAuthTokenRequest, readOAuthAccessToken, OAuthTokenFields, isOAuthAuthorization } from '../request/oauth';
import { executeRequest } from '../request/requestRunner';
import { ApiResponse, OAuthAuthorizationDefinition, RequestFileDefinition, RequestHeaderDefinition, RequestParamDefinition } from '../request/types';
import { isRecord, isStringRecord } from '../shared/object';
import { getWebviewHtml } from './getWebviewHtml';

export interface SendRequestMessage {
	type: 'sendRequest';
	requestId: number;
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: string;
}

interface CancelRequestMessage { type: 'cancelRequest'; requestId: number; }

interface WebviewReadyMessage {
	type: 'webviewReady';
}

interface OpenRepositoryMessage {
	type: 'openRepository';
}

interface OpenIssuesMessage {
	type: 'openIssues';
}

interface OpenSettingsMessage {
	type: 'openSettings';
}

interface ResolveEnvironmentVariableMessage {
	type: 'resolveEnvironmentVariable';
	requestId: number;
	name: string;
}

interface CheckEnvironmentVariablesMessage {
	type: 'checkEnvironmentVariables';
	requestId: number;
	names: string[];
}

export interface RequestChangedMessage {
	type: 'requestChanged';
	authorization?: OAuthAuthorizationDefinition;
	name: string;
	method: string;
	url: string;
	params: RequestParamDefinition[];
	headerState: RequestHeaderDefinition[];
	headers: Record<string, string>;
	body: string;
}

export interface RequestWebviewHandlers {
	extensionVersion?: string;
	onGetRequestUri?: () => vscode.Uri | undefined;
	onReady?: () => void;
	onRequestChanged?: (message: RequestChangedMessage) => void;
	onSendRequest?: (message: SendRequestMessage, signal: AbortSignal) => Promise<ApiResponse>;
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
	const handlers = typeof handlersOrOnReady === 'function'
		? { onReady: handlersOrOnReady }
		: handlersOrOnReady ?? {};
	const activeRequests = new Map<number, AbortController>();

	webview.html = getWebviewHtml(webview, handlers.extensionVersion ?? '0.0.0');

	const messageSubscription = webview.onDidReceiveMessage((message: unknown) => {
		if (isWebviewReadyMessage(message)) {
			void webview.postMessage({
				type: 'workspaceTrust',
				isTrusted: vscode.workspace.isTrusted,
			});
			void postEnvironmentTooltipSetting(webview);
			handlers.onReady?.();
			return;
		}

        if (isRecord(message) && message.type === 'getEnvironmentFile'
            && typeof message.requestId === 'number' && Number.isSafeInteger(message.requestId)) {
            void postEnvironmentFile(webview, handlers.onGetRequestUri?.(), message.requestId);
            return;
        }
        if (isRecord(message) && message.type === 'openEnvironmentFile') {
            void openEnvironmentFile(handlers.onGetRequestUri?.());
            return;
        }
		if (isRequestChangedMessage(message)) {
			handlers.onRequestChanged?.(message);
			return;
		}
        if (isRecord(message) && message.type === 'cancelOAuthToken') {
            for (const [key, controller] of activeRequests) {
                if (key < 0) { controller.abort(); }
            }
            return;
        }
		if (isCancelRequestMessage(message)) {
			activeRequests.get(message.requestId)?.abort();
			return;
		}

		if (isOpenRepositoryMessage(message)) {
			void vscode.env.openExternal(vscode.Uri.parse('https://github.com/nickchecan/restcraft'));
			return;
		}

		if (isOpenIssuesMessage(message)) {
			void vscode.env.openExternal(vscode.Uri.parse('https://github.com/nickchecan/restcraft/issues'));
			return;
		}

		if (isOpenSettingsMessage(message)) {
			void vscode.commands.executeCommand('workbench.action.openSettings', '@ext:nickchecan.restcraft');
			return;
		}

		if (isResolveEnvironmentVariableMessage(message)) {
			void handleResolveEnvironmentVariable(webview, message, handlers);
			return;
		}

		if (isCheckEnvironmentVariablesMessage(message)) {
			void handleCheckEnvironmentVariables(webview, message, handlers);
			return;
		}

        if (isRecord(message) && message.type === 'getOAuthToken') {
            if (!Number.isSafeInteger(message.requestId) || typeof message.requestId !== 'number' || message.requestId < 0
                || typeof message.url !== 'string' || typeof message.clientId !== 'string'
                || typeof message.clientSecret !== 'string' || typeof message.scope !== 'string'
                || (message.storeAccessToken !== undefined && typeof message.storeAccessToken !== 'boolean')
                || (message.accessTokenVariable !== undefined && typeof message.accessTokenVariable !== 'string')) { return; }
            void handleOAuthToken(webview, { url: message.url, clientId: message.clientId, clientSecret: message.clientSecret, scope: message.scope }, message.requestId, handlers, activeRequests, message.storeAccessToken === true, typeof message.accessTokenVariable === 'string' ? message.accessTokenVariable : 'ACCESS_TOKEN');
            return;
        }
		void handleMessage(webview, message, handlers, activeRequests);
	});
	const trustSubscription = vscode.workspace.onDidGrantWorkspaceTrust(() => {
		void webview.postMessage({
			type: 'workspaceTrust',
			isTrusted: true,
		});
	});
	const settingsSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('restcraft.showEnvironmentVariableValues')) {
			void postEnvironmentTooltipSetting(webview);
		}
	});

	return vscode.Disposable.from(messageSubscription, trustSubscription, settingsSubscription, new vscode.Disposable(() => {
		for (const controller of activeRequests.values()) { controller.abort(); }
		activeRequests.clear();
	}));
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
			await webview.postMessage({ type: 'environmentVariablesChecked', requestId: message.requestId, definedNames: [] });
			return;
		}

		const definedNames = await handlers.onCheckEnvironmentVariables?.(message.names) ?? [];
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
	message: unknown,
	handlers: RequestWebviewHandlers,
	activeRequests: Map<number, AbortController>,
): Promise<void> {
	if (!isSendRequestMessage(message)) {
		return;
	}

	let controller: AbortController | undefined;
	try {
		if (!vscode.workspace.isTrusted) {
			throw new Error('Sending requests and resolving .env variables requires a trusted workspace.');
		}

		controller = new AbortController();
		activeRequests.set(message.requestId, controller);
		const response = handlers.onSendRequest ? await handlers.onSendRequest(message, controller.signal) : await executeRequest({
			method: message.method,
			url: message.url,
			headers: message.headers,
			body: message.body,
		}, getRequestTimeout(), controller.signal);

		await webview.postMessage({
			type: 'requestComplete',
			response,
		});
	} catch (error) {
		await webview.postMessage({
			type: 'requestError',
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
): Promise<ApiResponse> {
	if (!vscode.workspace.isTrusted) {
		throw new Error('Sending requests and resolving .env variables requires a trusted workspace.');
	}

	const variables = requestUri ? await readEnvironmentVariables(requestUri) : {};
	const request = resolveRequestVariables({
		method: message.method,
		url: message.url,
		headers: message.headers,
		body: message.body,
	}, variables);
	await confirmInsecureCredentialRequest(request.url, request.headers);

	return executeRequest(request, getRequestTimeout(), signal);
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
async function confirmInsecureCredentialRequest(url: string, headers: Record<string, string> | undefined): Promise<void> {
	if (vscode.workspace.getConfiguration('restcraft').get<boolean>('suppressInsecureCredentialWarning', false)) {
		return;
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url);
	} catch {
		return;
	}

	if (parsedUrl.protocol !== 'http:' || isLocalHost(parsedUrl.hostname) || !hasAuthenticationCredentials(headers, parsedUrl)) {
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
		await vscode.workspace.getConfiguration('restcraft').update(
			'suppressInsecureCredentialWarning',
			true,
			vscode.ConfigurationTarget.Global,
		);
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
		return value.length > 0 && (
			normalizedName === 'authorization'
			|| normalizedName === 'proxy-authorization'
			|| normalizedName === 'cookie'
			|| normalizedName === 'x-api-key'
			|| normalizedName === 'api-key'
			|| normalizedName === 'x-auth-token'
		);
	});
}

/** Keeps loopback and local development hosts warning-free. */
function isLocalHost(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
	return host === 'localhost'
		|| host.endsWith('.localhost')
		|| host === '::1'
		|| /^127(?:\.\d{1,3}){3}$/.test(host);
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

/** Uses the same closest-file lookup for reading and writing tokens. */
async function findEnvironmentFile(requestUri: vscode.Uri): Promise<{ uri: vscode.Uri; content: string; exists: boolean }> {
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
	const parentPath = normalizedPath === '/'
		? '/'
		: normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) || '/';

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
	return left.scheme === right.scheme
		&& left.authority === right.authority
		&& normalizeDirectoryPath(left.path) === normalizeDirectoryPath(right.path);
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

/**
 * Validates a webview request execution message.
 */
function isSendRequestMessage(message: unknown): message is SendRequestMessage {
	if (!isRecord(message)) {
		return false;
	}

	const candidate = message as Partial<SendRequestMessage>;

	return candidate.type === 'sendRequest'
		&& typeof candidate.requestId === 'number'
		&& Number.isSafeInteger(candidate.requestId)
		&& typeof candidate.method === 'string'
		&& typeof candidate.url === 'string'
		&& (candidate.body === undefined || typeof candidate.body === 'string')
		&& (candidate.headers === undefined || isStringRecord(candidate.headers));
}

function isCancelRequestMessage(message: unknown): message is CancelRequestMessage {
	if (!isRecord(message)) { return false; }
	const candidate = message as Partial<CancelRequestMessage>;
	return candidate.type === 'cancelRequest'
		&& typeof candidate.requestId === 'number'
		&& Number.isSafeInteger(candidate.requestId);
}

/**
 * Validates the webview ready lifecycle message.
 */
function isWebviewReadyMessage(message: unknown): message is WebviewReadyMessage {
	if (!isRecord(message)) {
		return false;
	}

	const candidate = message as Partial<WebviewReadyMessage>;

	return candidate.type === 'webviewReady';
}

/**
 * Validates the footer repository link message.
 */
function isOpenRepositoryMessage(message: unknown): message is OpenRepositoryMessage {
	if (!isRecord(message)) {
		return false;
	}

	const candidate = message as Partial<OpenRepositoryMessage>;

	return candidate.type === 'openRepository';
}

/**
 * Validates the footer issues link message.
 */
function isOpenIssuesMessage(message: unknown): message is OpenIssuesMessage {
	if (!isRecord(message)) {
		return false;
	}

	const candidate = message as Partial<OpenIssuesMessage>;

	return candidate.type === 'openIssues';
}

/**
 * Validates the footer settings button message.
 */
function isOpenSettingsMessage(message: unknown): message is OpenSettingsMessage {
	if (!isRecord(message)) {
		return false;
	}

	const candidate = message as Partial<OpenSettingsMessage>;

	return candidate.type === 'openSettings';
}

/** Validates a targeted environment-variable hover lookup from the webview. */
function isResolveEnvironmentVariableMessage(message: unknown): message is ResolveEnvironmentVariableMessage {
	if (!isRecord(message)) {
		return false;
	}

	const candidate = message as Partial<ResolveEnvironmentVariableMessage>;
	return candidate.type === 'resolveEnvironmentVariable'
		&& typeof candidate.requestId === 'number'
		&& Number.isSafeInteger(candidate.requestId)
		&& typeof candidate.name === 'string'
		&& /^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate.name);
}

/** Validates environment-variable presence checks sent from the webview. */
function isCheckEnvironmentVariablesMessage(message: unknown): message is CheckEnvironmentVariablesMessage {
	if (!isRecord(message)) {
		return false;
	}

	const candidate = message as Partial<CheckEnvironmentVariablesMessage>;
	return candidate.type === 'checkEnvironmentVariables'
		&& typeof candidate.requestId === 'number'
		&& Number.isSafeInteger(candidate.requestId)
		&& Array.isArray(candidate.names)
		&& candidate.names.length <= 100
		&& candidate.names.every((name) => typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
}

/**
 * Validates a request edit message before syncing it to the text document.
 */
function isRequestChangedMessage(message: unknown): message is RequestChangedMessage {
	if (!isRecord(message)) {
		return false;
	}

	const candidate = message as Partial<RequestChangedMessage>;

	return (candidate.authorization === undefined || isOAuthAuthorization(candidate.authorization))
		&& candidate.type === 'requestChanged'
		&& typeof candidate.name === 'string'
		&& typeof candidate.method === 'string'
		&& typeof candidate.url === 'string'
		&& typeof candidate.body === 'string'
		&& Array.isArray(candidate.params)
		&& candidate.params.every(isRequestParamState)
		&& Array.isArray(candidate.headerState)
		&& candidate.headerState.every(isRequestHeaderState)
		&& isStringRecord(candidate.headers);
}

/**
 * Validates one query parameter row from the webview.
 */
function isRequestParamState(value: unknown): value is RequestParamDefinition {
	if (!isRecord(value)) {
		return false;
	}

	const candidate = value as Partial<RequestParamDefinition>;

	return typeof candidate.name === 'string'
		&& typeof candidate.value === 'string'
		&& typeof candidate.enabled === 'boolean';
}

/**
 * Validates one header row from the webview.
 */
function isRequestHeaderState(value: unknown): value is RequestHeaderDefinition {
	if (!isRecord(value)) {
		return false;
	}

	const candidate = value as Partial<RequestHeaderDefinition>;

	return typeof candidate.name === 'string'
		&& typeof candidate.value === 'string'
		&& typeof candidate.enabled === 'boolean';
}

/** Retrieves a token only in response to the explicit webview button action. */
async function handleOAuthToken(
    webview: vscode.Webview, fields: OAuthTokenFields, requestId: number,
    handlers: RequestWebviewHandlers, activeRequests: Map<number, AbortController>,
    storeAccessToken = false, accessTokenVariable = 'ACCESS_TOKEN',
): Promise<void> {
    // Negative IDs keep token retrieval separate from normal request cancellation IDs.
    const requestUri = handlers.onGetRequestUri?.();
    const key = -requestId - 1;
    if (activeRequests.has(key)) { return; }
    const controller = new AbortController();
    activeRequests.set(key, controller);
    try {
        if (!vscode.workspace.isTrusted) { throw new Error('Getting an access token requires a trusted workspace.'); }
        if (storeAccessToken) {
            if (!requestUri) { throw new Error('Save or load a request file before storing an access token in .env.'); }
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(accessTokenVariable)) { throw new Error('Enter a valid access token variable name.'); }
        }
        const variables: Record<string, string> = requestUri ? await readEnvironmentVariables(requestUri) : {};
        for (const value of Object.values(fields)) {
            for (const match of value.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)) {
                const resolved = requestUri ? variables[match[1]] : await handlers.onResolveEnvironmentVariable?.(match[1]);
                if (resolved !== undefined) { variables[match[1]] = resolved; }
            }
        }
        const resolved = resolveRequestVariables({ method: 'POST', url: fields.url,
            headers: { clientId: fields.clientId, clientSecret: fields.clientSecret, scope: fields.scope } }, variables);
        const request = buildOAuthTokenRequest({ url: resolved.url, clientId: resolved.headers!.clientId,
            clientSecret: resolved.headers!.clientSecret, scope: resolved.headers!.scope });
        const response = await executeRequest(request, getRequestTimeout(), controller.signal, 'error');
        const token = readOAuthAccessToken(response);
        if (storeAccessToken && requestUri) {
            await storeOAuthTokenInEnvironment(requestUri, accessTokenVariable, token, controller.signal);
        }
        await webview.postMessage({ type: 'oauthTokenResult', requestId, token, stored: storeAccessToken });
    } catch (error) {
        await webview.postMessage({ type: 'oauthTokenResult', requestId,
            error: error instanceof Error ? error.message : 'Unable to get an access token.' });
    } finally { activeRequests.delete(key); }
}

// Serializes environment writes so token retrievals in different editors do not lose updates.
const environmentWrites = new Map<string, Promise<void>>();

/** Stores a token in the exact environment selected by the request's lookup rules. */
export async function storeOAuthTokenInEnvironment(requestUri: vscode.Uri, name: string, token: string, signal?: AbortSignal): Promise<void> {
	if (!vscode.workspace.isTrusted) { throw new Error('Storing an access token requires a trusted workspace.'); }
	const target = await findEnvironmentFile(requestUri);
	const key = target.uri.toString();
	const previous = environmentWrites.get(key) ?? Promise.resolve();
	const write = previous.catch(() => {}).then(async () => {
		if (!vscode.workspace.isTrusted) { throw new Error('Storing an access token requires a trusted workspace.'); }
		const openDocument = vscode.workspace.textDocuments.find(document => document.uri.toString() === key);
		if (openDocument?.isDirty) { throw new Error('Save the .env file before storing an access token.'); }
		let content = '';
		try { content = new TextDecoder().decode(await vscode.workspace.fs.readFile(target.uri)); }
		catch (error) { if (!isFileNotFoundError(error)) { throw error; } }
		if (signal?.aborted) { throw new Error('Token request cancelled.'); }
		await vscode.workspace.fs.writeFile(target.uri, new TextEncoder().encode(updateEnvValue(content, name, token)));
	});
	environmentWrites.set(key, write);
	try { await write; } finally {
		if (environmentWrites.get(key) === write) { environmentWrites.delete(key); }
	}
}

/** Returns the existing environment file selected by request execution, without exposing its contents. */
export async function findRequestEnvironmentUri(requestUri: vscode.Uri | undefined): Promise<vscode.Uri | undefined> {
	if (!requestUri) { return undefined; }
	const file = await findEnvironmentFile(requestUri);
	return file.exists ? file.uri : undefined;
}

async function postEnvironmentFile(webview: vscode.Webview, requestUri: vscode.Uri | undefined, requestId: number): Promise<void> {
	try {
		const uri = await findRequestEnvironmentUri(requestUri);
		await webview.postMessage({ type: 'environmentFile', requestId, path: uri ? (uri.scheme === 'file' ? uri.fsPath : uri.toString()) : '' });
	} catch (error) {
		await webview.postMessage({ type: 'environmentFile', requestId, path: '',
			error: error instanceof Error ? error.message : 'Unable to locate the environment file.' });
	}
}

/** Re-resolves the file in the extension host instead of trusting a webview-supplied path. */
async function openEnvironmentFile(requestUri: vscode.Uri | undefined): Promise<void> {
	try {
		const uri = await findRequestEnvironmentUri(requestUri);
		if (uri) { await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri)); }
	} catch (error) {
		void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Unable to open the environment file.');
	}
}
