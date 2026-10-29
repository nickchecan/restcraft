import * as assert from 'assert';
import * as vscode from 'vscode';
import {
	AuthorizationCodeCallbacks,
	AuthorizationCodeFields,
	retrieveAuthorizationCodeToken,
} from '../../src/request/authorizationCode';
import { buildDesktopRedirectUri, getRedirectUri } from '../../src/webview/oauthRedirect';

suite('OAuth redirect URI', () => {
	test('desktop redirect is the exact product URI with no query, fragment, or trailing slash', () => {
		const cases = [
			['vscode', 'vscode://nickchecan.restcraft/oauth/callback'],
			['vscode-insiders', 'vscode-insiders://nickchecan.restcraft/oauth/callback'],
			['vscodium', 'vscodium://nickchecan.restcraft/oauth/callback'],
			['vscodium-insiders', 'vscodium-insiders://nickchecan.restcraft/oauth/callback'],
		] as const;
		for (const [scheme, expected] of cases) {
			const uri = buildDesktopRedirectUri(scheme, 'nickchecan.restcraft');
			assert.strictEqual(uri, expected);
			assert.ok(!uri.includes('?'));
			assert.ok(!uri.includes('#'));
			assert.ok(!uri.endsWith('/'));
		}
	});

	test('desktop does not call asExternalUri and web does', async () => {
		let desktopCalls = 0;
		const desktop = await getRedirectUri(
			{
				uiKind: vscode.UIKind.Desktop,
				uriScheme: 'vscode',
				asExternalUri: async (uri) => {
					desktopCalls++;
					return uri;
				},
			},
			'nickchecan.restcraft',
		);
		assert.strictEqual(desktopCalls, 0);
		assert.strictEqual(desktop.stable, true);
		assert.strictEqual(desktop.uri, 'vscode://nickchecan.restcraft/oauth/callback');

		let seen = '';
		const web = await getRedirectUri(
			{
				uiKind: vscode.UIKind.Web,
				uriScheme: 'vscode-insiders',
				asExternalUri: async (uri) => {
					seen = uri.toString(true);
					return vscode.Uri.parse('https://insiders.vscode.dev/redirect?vscode-reqid=attempt');
				},
			},
			'nickchecan.restcraft',
		);
		assert.strictEqual(seen, 'vscode-insiders://nickchecan.restcraft/oauth/callback');
		assert.strictEqual(web.stable, false);
		assert.strictEqual(web.uri, 'https://insiders.vscode.dev/redirect?vscode-reqid=attempt');
	});

	test('display, authorize, and token requests share getRedirectUri().uri', async () => {
		let externalCalls = 0;
		const env = {
			uiKind: vscode.UIKind.Desktop,
			uriScheme: 'vscode',
			asExternalUri: async (uri: vscode.Uri) => {
				externalCalls++;
				return uri;
			},
		};
		const info = await getRedirectUri(env, 'nickchecan.restcraft');
		const fields: AuthorizationCodeFields = {
			url: 'https://provider.example/token',
			authorizationUrl: 'https://provider.example/authorize',
			clientId: 'public-client',
			clientSecret: '',
			scope: 'api',
			state: 'user-state',
			usePkce: true,
			clientAuthentication: 'none',
		};
		const callbacks = new AuthorizationCodeCallbacks();
		let onRedirect = '';
		try {
			const token = await retrieveAuthorizationCodeToken(
				fields,
				{
					callbacks,
					getRedirectUri: async () => {
						const current = await getRedirectUri(env, 'nickchecan.restcraft');
						onRedirect = current.uri;
						return current.uri;
					},
					openBrowser: async (url) => {
						assert.strictEqual(new URL(url).searchParams.get('redirect_uri'), info.uri);
						const state = new URL(url).searchParams.get('state');
						callbacks.handleCallback(new URLSearchParams({ state: state!, code: 'shared-code' }).toString());
						return true;
					},
					exchange: async (request) => {
						assert.strictEqual(new URLSearchParams(request.body).get('redirect_uri'), info.uri);
						assert.strictEqual(new URLSearchParams(request.body).get('code'), 'shared-code');
						return {
							status: 200,
							statusText: 'OK',
							headers: {},
							body: '{"access_token":"shared-token","token_type":"Bearer"}',
						};
					},
				},
				new AbortController().signal,
			);
			assert.strictEqual(token, 'shared-token');
			assert.strictEqual(onRedirect, info.uri);
			assert.strictEqual(externalCalls, 0);
			assert.strictEqual(info.stable, true);
		} finally {
			callbacks.dispose();
		}
	});
});
