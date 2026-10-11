import * as vscode from 'vscode';

import { parseEnvFile, resolveRequestVariables } from '../request/environment';
import { executeRequest } from '../request/requestRunner';
import { ApiResponse, RequestFileDefinition, RequestHeaderDefinition, RequestParamDefinition } from '../request/types';
import { isRecord, isStringRecord } from '../shared/object';
import { getWebviewHtml } from './getWebviewHtml';

export interface SendRequestMessage {
	type: 'sendRequest';
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: string;
}

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

export interface RequestChangedMessage {
	type: 'requestChanged';
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
	onReady?: () => void;
	onRequestChanged?: (message: RequestChangedMessage) => void;
	onSendRequest?: (message: SendRequestMessage) => Promise<ApiResponse>;
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

	webview.html = getWebviewHtml(webview, handlers.extensionVersion ?? '0.0.0');

	return webview.onDidReceiveMessage((message: unknown) => {
		if (isWebviewReadyMessage(message)) {
			handlers.onReady?.();
			return;
		}

		if (isRequestChangedMessage(message)) {
			handlers.onRequestChanged?.(message);
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

		void handleMessage(webview, message, handlers);
	});
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
): Promise<void> {
	if (!isSendRequestMessage(message)) {
		return;
	}

	try {
		const response = handlers.onSendRequest ? await handlers.onSendRequest(message) : await executeRequest({
			method: message.method,
			url: message.url,
			headers: message.headers,
			body: message.body,
		}, getRequestTimeout());

		await webview.postMessage({
			type: 'requestComplete',
			response,
		});
	} catch (error) {
		await webview.postMessage({
			type: 'requestError',
			message: error instanceof Error ? error.message : 'Request failed.',
		});
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
): Promise<ApiResponse> {
	const variables = requestUri ? await readEnvironmentVariables(requestUri) : {};
	const request = resolveRequestVariables({
		method: message.method,
		url: message.url,
		headers: message.headers,
		body: message.body,
	}, variables);
	await confirmInsecureCredentialRequest(request.url, request.headers);

	return executeRequest(request, getRequestTimeout());
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
 * Reads the optional sibling `.env` file for a request document.
 */
async function readEnvironmentVariables(requestUri: vscode.Uri): Promise<Record<string, string>> {
	const envUri = vscode.Uri.joinPath(readRequestDirectory(requestUri), '.env');

	try {
		const content = await vscode.workspace.fs.readFile(envUri);
		return parseEnvFile(new TextDecoder().decode(content));
	} catch (error) {
		if (isFileNotFoundError(error)) {
			return {};
		}

		throw error;
	}
}

/**
 * Returns the directory URI that contains a request file.
 */
function readRequestDirectory(requestUri: vscode.Uri): vscode.Uri {
	const directoryPath = requestUri.path.replace(/\/[^/]*$/, '') || '/';

	return requestUri.with({ path: directoryPath });
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
		&& typeof candidate.method === 'string'
		&& typeof candidate.url === 'string'
		&& (candidate.body === undefined || typeof candidate.body === 'string')
		&& (candidate.headers === undefined || isStringRecord(candidate.headers));
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

/**
 * Validates a request edit message before syncing it to the text document.
 */
function isRequestChangedMessage(message: unknown): message is RequestChangedMessage {
	if (!isRecord(message)) {
		return false;
	}

	const candidate = message as Partial<RequestChangedMessage>;

	return candidate.type === 'requestChanged'
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
