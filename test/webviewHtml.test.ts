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
            setOAuthSecretVisible: () => {}, setBasicPasswordVisible: () => {}, vscode: { postMessage: () => {} }, bearerToken: { value: '' },
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
            oauthDecodedToken: { value: '' }, TextDecoder, atob,
			oauthTokenPanel: { classList: { toggle: () => {} } }, authorizationLayout: { classList: { toggle: () => {} } } };
		runInNewContext(html.slice(start, end) + '; updateOAuthTokenDisplay();', context);
		assert.strictEqual(context.oauthAccessToken.value, '');
		context.retrievedOAuthToken = 'new-token';
		runInNewContext('updateOAuthTokenDisplay();', context);
		assert.strictEqual(context.oauthAccessToken.value, 'new-token');
	});
	test('keeps unchecked OAuth header rows saved but excludes them from sending', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function readRequestHeaders()');
		const end = html.indexOf('// Returns the executable value for a header row.', start);
		assert.ok(start >= 0 && end > start);
		const rows = [
			{ name: 'authorization', value: 'Bearer {{MY_TOKEN}}', enabled: false },
			{ name: 'Accept', value: 'application/json', enabled: true },
		].map(header => ({ querySelector: () => ({ checked: header.enabled }),
			querySelectorAll: () => [{ value: header.name }, { value: header.value }] }));
		const context = { authorizationType: { value: 'oauth2' }, oauthStoreToken: { checked: true },
			oauthGrantType: { value: 'client_credentials' }, oauthTokenVariable: { value: 'MY_TOKEN' },
			requestHeadersTable: { querySelectorAll: () => rows },
			readHeaderRowValue: (_name: string, value: string) => value };
		const result = runInNewContext(html.slice(start, end) + '; ({ state: readRequestHeaderState(), sent: readEnabledRequestHeaders() });', context);
		const state = result.state.find((header: { name: string }) => header.name === 'Authorization');
		assert.strictEqual(state.enabled, false);
		assert.strictEqual(state.value, 'Bearer {{MY_TOKEN}}');
		assert.strictEqual(result.sent.authorization, undefined);
		assert.strictEqual(result.sent.Accept, 'application/json');
	});
	test('decodes JWT header and UTF-8 payload locally and handles opaque or malformed tokens', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function decodeOAuthToken(token)');
		const end = html.indexOf('// Hides or shows an authorization field', start);
		const context = { TextDecoder, atob, token: '' };
		const header = { alg: 'RS256', typ: 'JWT' };
		const payload = { name: 'José', scope: 'api', text: '<script>alert(1)</script>' };
		context.token = [header, payload].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.signature';
		const decoded = runInNewContext(html.slice(start, end) + '; decodeOAuthToken(token);', context);
		assert.deepStrictEqual(JSON.parse(decoded), { header, payload });
		for (const token of ['', 'opaque-token', 'bad.invalid.signature']) {
			context.token = token;
			const result = runInNewContext('decodeOAuthToken(token);', context);
			assert.strictEqual(result, token ? (token.includes('.')
				? 'Unable to decode this access token. It may be opaque or malformed.'
				: 'This access token is not a readable JWT.') : '');
		}
	});

	test('token radio buttons update checked state and show the matching content panel', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function showOAuthTokenView(decoded)');
		const end = html.indexOf('// Decodes locally;', start);
		const element = () => {
			const classes: Record<string, boolean> = {};
			const attributes: Record<string, string> = {};
			return { classes, attributes, checked: false,
				classList: { toggle: (name: string, value: boolean) => { classes[name] = value; } },
				setAttribute: (name: string, value: string) => { attributes[name] = value; } };
		};
		const context = { oauthRawOption: element(), oauthDecodedOption: element(), oauthRawPanel: element(), oauthDecodedPanel: element() };
		runInNewContext(html.slice(start, end) + '; showOAuthTokenView(true);', context);
		assert.strictEqual(context.oauthRawPanel.classes.hidden, true);
		assert.strictEqual(context.oauthDecodedPanel.classes.hidden, false);
		assert.strictEqual(context.oauthDecodedOption.checked, true);
		assert.strictEqual(context.oauthRawOption.checked, false);
		runInNewContext('showOAuthTokenView(false);', context);
		assert.strictEqual(context.oauthRawPanel.classes.hidden, false);
		assert.strictEqual(context.oauthDecodedPanel.classes.hidden, true);
	});
	test('toggles client secret visibility and accessible button labels', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function setOAuthSecretVisible(visible)');
		const end = html.indexOf('function setBasicPasswordVisible', start);
		const attributes: Record<string, string> = {};
		const context = { oauthClientSecret: { type: 'password', value: 'unchanged' },
			oauthSecretToggle: { textContent: 'Show', setAttribute: (name: string, value: string) => { attributes[name] = value; } } };
		runInNewContext(html.slice(start, end) + '; setOAuthSecretVisible(true);', context);
		assert.strictEqual(context.oauthClientSecret.type, 'text');
		assert.strictEqual(context.oauthSecretToggle.textContent, 'Hide');
		assert.strictEqual(attributes['aria-pressed'], 'true');
		runInNewContext('setOAuthSecretVisible(false);', context);
		assert.strictEqual(context.oauthClientSecret.type, 'password');
		assert.strictEqual(attributes['aria-label'], 'Show client secret');
		assert.strictEqual(context.oauthClientSecret.value, 'unchanged');
	});
	test('Basic Auth password starts masked and supports showing and hiding', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		assert.match(html, /id="basic-auth-password"[^>]*type="password"/);
		const start = html.indexOf('function setBasicPasswordVisible(visible)');
		const end = html.indexOf('// Shows the authorization inputs', start);
		const attributes: Record<string, string> = {};
		const context = { basicAuthPassword: { type: 'password', value: 'unchanged' },
			basicPasswordToggle: { textContent: 'Show', setAttribute: (name: string, value: string) => { attributes[name] = value; } } };
		runInNewContext(html.slice(start, end) + '; setBasicPasswordVisible(true);', context);
		assert.strictEqual(context.basicAuthPassword.type, 'text');
		assert.strictEqual(context.basicPasswordToggle.textContent, 'Hide');
		runInNewContext('setBasicPasswordVisible(false);', context);
		assert.strictEqual(context.basicAuthPassword.type, 'password');
		assert.strictEqual(attributes['aria-label'], 'Show password');
		assert.strictEqual(attributes['aria-pressed'], 'false');
		assert.strictEqual(context.basicAuthPassword.value, 'unchanged');
	});
});
