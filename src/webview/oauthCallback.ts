import * as vscode from 'vscode';
import {
	AuthorizationCodeCallbacks,
	AuthorizationCodeFields,
	retrieveAuthorizationCodeToken,
} from '../request/authorizationCode';
import { executeRequest } from '../request/requestRunner';
import { openOAuthBrowser } from './oauthBrowser';

const callbacks = new AuthorizationCodeCallbacks();
let extensionId = 'nickchecan.restcraft';

export function registerOAuthCallback(id: string): vscode.Disposable {
	extensionId = id;
	const handler = vscode.window.registerUriHandler({
		handleUri(uri) {
			if (uri.scheme === vscode.env.uriScheme && uri.authority === extensionId && uri.path === '/oauth/callback') {
				callbacks.handleCallback(uri.query);
			}
		},
	});
	return vscode.Disposable.from(handler, new vscode.Disposable(() => callbacks.dispose()));
}

export async function getOAuthRedirectUri(): Promise<string> {
	const uri = await vscode.env.asExternalUri(
		vscode.Uri.parse(`${vscode.env.uriScheme}://${extensionId}/oauth/callback`),
	);
	return uri.toString(true);
}

export function getAuthorizationCodeToken(
	fields: AuthorizationCodeFields,
	signal: AbortSignal,
	timeoutMs: number,
	onRedirect: (uri: string) => Promise<void>,
): Promise<string> {
	return retrieveAuthorizationCodeToken(
		fields,
		{
			callbacks,
			getRedirectUri: async () => {
				const uri = await getOAuthRedirectUri();
				await onRedirect(uri);
				return uri;
			},
			openBrowser: (url) => openOAuthBrowser(url, vscode.env.openExternal),
			exchange: (request, attemptSignal) => executeRequest(request, timeoutMs, attemptSignal, 'error'),
		},
		signal,
	);
}
