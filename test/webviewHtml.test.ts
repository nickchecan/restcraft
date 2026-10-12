import * as assert from 'assert';
import * as vscode from 'vscode';
import { runInNewContext } from 'vm';

import { getWebviewHtml } from '../src/webview/getWebviewHtml';

suite('Webview HTML', () => {
	test('renders the supplied extension version in the footer', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');

		assert.match(html, /<span class="editor-footer-version" aria-label="RestCraft version">v1\.2\.3<\/span>/);
	});
	test('includes OAuth grant choices and valid client-side JavaScript', () => {
        const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
        assert.ok(html.includes('<option value="oauth2">OAuth 2.0</option>'));
        assert.ok(html.includes('<option value="client_credentials">Client Credentials</option>'));
        assert.ok(html.includes('<option value="authorization_code">Authorization Code</option>'));
        const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
        assert.ok(script);
        assert.doesNotThrow(() => new Function(script));
    });
	test('restores saved OAuth controls and clears them when loading a legacy request', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('// Loading another request invalidates pending token results');
		const end = html.indexOf('setRequestBodyContent(message.request.body', start);
		assert.ok(start >= 0 && end > start);
		const fields: Record<string, { value: string }> = {};
		for (const id of ['oauth-url', 'oauth-client-id', 'oauth-client-secret', 'oauth-scope']) {
			fields[id] = { value: 'previous request' };
		}
		const authorizationType = { value: 'none' };
		const context = { document: { getElementById: (id: string) => fields[id] },
			oauthRequestId: 1, oauthPending: true, oauthGetToken: { disabled: true },
            vscode: { postMessage: () => {} }, bearerToken: { value: '' },
            oauthStoreToken: { checked: false }, oauthTokenVariable: { value: 'ACCESS_TOKEN' },
			oauthStatus: { textContent: 'Getting token' }, oauthToken: 'old', retrievedOAuthToken: 'old',
			activeAuthorizationType: 'none', oauthGrantType: { value: '' }, authorizationType,
			readAuthorizationFromHeaders: () => { authorizationType.value = 'none'; },
			readHeaderValue: (headers: Record<string, string>, name: string) => headers[name] || '',
            hasVariableReference: (value: string) => value.includes('{{'),
			applyAuthorizationType: () => {}, syncAuthorizationHeader: () => {},
			message: { request: {} as Record<string, unknown> } };
		for (const grantType of ['client_credentials', 'authorization_code']) {
			context.message.request = { authorization: { type: 'oauth2', grantType,
				accessTokenUrl: 'https://example.com/token', clientId: 'client',
				clientSecret: '{{SECRET}}', scope: 'api' }, headers: { Authorization: 'Bearer saved' } };
			runInNewContext('{ ' + html.slice(start, end) + ' }', context);
			assert.strictEqual(authorizationType.value, 'oauth2');
			assert.strictEqual(context.oauthGrantType.value, grantType);
			assert.strictEqual(fields['oauth-url'].value, 'https://example.com/token');
			assert.strictEqual(fields['oauth-client-id'].value, 'client');
			assert.strictEqual(fields['oauth-client-secret'].value, '{{SECRET}}');
			assert.strictEqual(fields['oauth-scope'].value, 'api');
			assert.strictEqual(context.oauthToken, 'saved');
            assert.strictEqual(context.retrievedOAuthToken, '', 'Reopening must clear the token output');
			assert.strictEqual(context.oauthPending, false);
		}
		context.message.request = { headers: {} };
		runInNewContext('{ ' + html.slice(start, end) + ' }', context);
		assert.strictEqual(authorizationType.value, 'none');
		assert.strictEqual(context.oauthToken, '');
		assert.ok(Object.values(fields).every(field => field.value === ''));
	});
	test('uses the env reference for the header table and execution after token retrieval', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function syncAuthorizationHeader()');
		const end = html.indexOf('// Detects RestCraft environment variable placeholders.', start);
		const headers: Record<string, string> = {};
		const context = {
			authorizationType: { value: 'oauth2' }, oauthGrantType: { value: 'client_credentials' },
			oauthStoreToken: { checked: true }, oauthTokenVariable: { value: 'MY_TOKEN' }, oauthToken: 'sensitive-token',
			activeAuthorizationType: 'oauth2', updateOAuthTokenDisplay: () => {},
			setHeaderValue: (name: string, value: string) => { headers[name] = value; },
			removeHeaderValue: (name: string) => { delete headers[name]; },
		};
		runInNewContext(html.slice(start, end) + '; syncAuthorizationHeader();', context);
		assert.strictEqual(headers.Authorization, 'Bearer {{MY_TOKEN}}');
		context.oauthTokenVariable.value = 'NEW_TOKEN';
		runInNewContext('syncAuthorizationHeader();', context);
		assert.strictEqual(headers.Authorization, 'Bearer {{NEW_TOKEN}}');
		context.oauthStoreToken.checked = false;
		runInNewContext('syncAuthorizationHeader();', context);
		assert.strictEqual(headers.Authorization, 'Bearer sensitive-token');
	});
	test('token output shows only a token retrieved in the current editor session', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function updateOAuthTokenDisplay()');
		const end = html.indexOf('// Hides or shows an authorization field', start);
		const context = { authorizationType: { value: 'oauth2' }, oauthGrantType: { value: 'client_credentials' },
			oauthToken: 'saved-token', retrievedOAuthToken: '', oauthAccessToken: { value: '' },
			oauthTokenPanel: { classList: { toggle: () => {} } }, authorizationLayout: { classList: { toggle: () => {} } } };
		runInNewContext(html.slice(start, end) + '; updateOAuthTokenDisplay();', context);
		assert.strictEqual(context.oauthAccessToken.value, '');
		context.retrievedOAuthToken = 'new-token';
		runInNewContext('updateOAuthTokenDisplay();', context);
		assert.strictEqual(context.oauthAccessToken.value, 'new-token');
	});
});
