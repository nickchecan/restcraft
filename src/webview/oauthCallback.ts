import * as vscode from 'vscode';
import {
	AuthorizationCodeCallbacks,
	AuthorizationCodeFields,
	retrieveAuthorizationCodeToken,
} from '../request/authorizationCode';
import { executeRequest } from '../request/requestRunner';
import { openOAuthBrowser } from './oauthBrowser';
import { createSecretRelay, type CallbackRelay } from './oauthRelay';
import { getRedirectUri, type RedirectUriInfo } from './oauthRedirect';

const callbacks = new AuthorizationCodeCallbacks();
let extensionId = 'nickchecan.restcraft';
let relay: CallbackRelay | undefined;

export function registerOAuthCallback(context: vscode.ExtensionContext): vscode.Disposable {
	extensionId = context.extension.id;
	// Create the relay before the URI handler so a buffered onUri callback can publish during activation.
	relay = createSecretRelay(context.secrets);
	void relay.sweep();
	const handler = vscode.window.registerUriHandler({
		handleUri(uri) {
			if (uri.scheme === vscode.env.uriScheme && uri.authority === extensionId && uri.path === '/oauth/callback') {
				if (callbacks.handleCallback(uri.query) === 'not-owned') {
					void relay?.publish(uri.query);
				}
			}
		},
	});
	const activeRelay = relay;
	return vscode.Disposable.from(
		handler,
		new vscode.Disposable(() => callbacks.dispose()),
		new vscode.Disposable(() => activeRelay.dispose()),
	);
}

export function getOAuthRedirectUri(): Promise<RedirectUriInfo> {
	return getRedirectUri(vscode.env, extensionId);
}

export function getAuthorizationCodeToken(
	fields: AuthorizationCodeFields,
	signal: AbortSignal,
	timeoutMs: number,
	onRedirect: (info: RedirectUriInfo) => Promise<void>,
): Promise<string> {
	return retrieveAuthorizationCodeToken(
		fields,
		{
			callbacks,
			relay,
			getRedirectUri: async () => {
				const info = await getOAuthRedirectUri();
				await onRedirect(info);
				return info.uri;
			},
			openBrowser: (url) => openOAuthBrowser(url, vscode.env.openExternal),
			exchange: (request, attemptSignal) => executeRequest(request, timeoutMs, attemptSignal, 'error'),
		},
		signal,
	);
}
