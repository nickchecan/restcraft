import * as assert from 'assert';
import * as vscode from 'vscode';
import { runInNewContext } from 'vm';

import { buttonIcons } from '../src/webview/buttonIcons';
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
        let configuredTokenRefreshes = 0;
		const context = { document: { getElementById: (id: string) => fields[id] },
			oauthRequestId: 1, oauthPending: true, oauthGetToken: { disabled: true },
            setOAuthSecretVisible: () => {}, setBasicPasswordVisible: () => {}, showOAuthTokenView: () => {}, vscode: { postMessage: () => {} }, bearerToken: { value: '' },
            oauthUpdateHeader: { checked: true }, oauthStoreToken: { checked: false }, oauthTokenVariable: { value: 'ACCESS_TOKEN' },
			oauthStatus: { textContent: 'Getting token' }, oauthToken: 'old', displayedOAuthToken: 'old',
			activeAuthorizationType: 'none', oauthGrantType: { value: '' }, authorizationType,
			readAuthorizationFromHeaders: () => { authorizationType.value = 'none'; },
			readHeaderValue: (headers: Record<string, string>, name: string) => headers[name] || '',
            hasVariableReference: (value: string) => value.includes('{{'),
			applyAuthorizationType: () => {}, syncAuthorizationHeader: () => {},
            refreshConfiguredOAuthToken: () => { configuredTokenRefreshes++; },
            updateRequestTabIndicators: () => {},
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
            assert.strictEqual(context.displayedOAuthToken, '', 'Reopening must clear the token output');
			assert.strictEqual(context.oauthPending, false);
            assert.ok(configuredTokenRefreshes > 0, 'Loading OAuth settings must resolve the configured token for output');
		}
		context.message.request = { headers: {} };
		runInNewContext('{ ' + html.slice(start, end) + ' }', context);
		assert.strictEqual(authorizationType.value, 'none');
		assert.strictEqual(context.oauthToken, '');
		assert.ok(Object.values(fields).every(field => field.value === ''));
	});
	test('token output renders resolved display state independently of the saved header', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function updateOAuthTokenDisplay()');
		const end = html.indexOf('// Hides or shows an authorization field', start);
		const context = { authorizationType: { value: 'oauth2' }, oauthGrantType: { value: 'client_credentials' },
			oauthToken: 'saved-token', displayedOAuthToken: '', oauthAccessToken: { value: '' },
            oauthDecodedToken: { value: '' }, TextDecoder, atob,
			oauthTokenPanel: { classList: { toggle: () => {} } }, authorizationLayout: { classList: { toggle: () => {} } } };
		runInNewContext(html.slice(start, end) + '; updateOAuthTokenDisplay();', context);
		assert.strictEqual(context.oauthAccessToken.value, '');
		context.displayedOAuthToken = 'new-token';
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
		const context = { authorizationType: { value: 'oauth2' }, oauthUpdateHeader: { checked: true }, oauthStoreToken: { checked: true },
			oauthGrantType: { value: 'client_credentials' }, oauthTokenVariable: { value: 'MY_TOKEN' },
			requestHeadersTable: { querySelectorAll: () => rows },
			readHeaderRowValue: (_name: string, value: string) => value };
		const result = runInNewContext(html.slice(start, end) + '; ({ state: readRequestHeaderState(), sent: readEnabledRequestHeaders() });', context);
		const state = result.state.find((header: { name: string }) => header.name.toLowerCase() === 'authorization');
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
		const start = html.indexOf('function showOAuthTokenView(view)');
		const end = html.indexOf('// Decodes locally;', start);
		const element = () => {
			const classes: Record<string, boolean> = {};
			const attributes: Record<string, string> = {};
			return { classes, attributes, checked: false,
				classList: { toggle: (name: string, value: boolean) => { classes[name] = value; } },
				setAttribute: (name: string, value: string) => { attributes[name] = value; } };
		};
		const context = { oauthHiddenOption: element(), oauthRawOption: element(), oauthDecodedOption: element(), oauthRawPanel: element(), oauthDecodedPanel: element() };
		runInNewContext(html.slice(start, end) + "; showOAuthTokenView('decoded');", context);
		assert.strictEqual(context.oauthRawPanel.classes.hidden, true);
		assert.strictEqual(context.oauthDecodedPanel.classes.hidden, false);
		assert.strictEqual(context.oauthDecodedOption.checked, true);
		assert.strictEqual(context.oauthRawOption.checked, false);
		runInNewContext("showOAuthTokenView('raw');", context);
		assert.strictEqual(context.oauthRawPanel.classes.hidden, false);
		assert.strictEqual(context.oauthDecodedPanel.classes.hidden, true);
        runInNewContext("showOAuthTokenView('hidden');", context);
        assert.strictEqual(context.oauthHiddenOption.checked, true);
        assert.strictEqual(context.oauthRawPanel.classes.hidden, true);
        assert.strictEqual(context.oauthDecodedPanel.classes.hidden, true);
	});
	test('toggles client secret visibility and accessible button labels', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function setOAuthSecretVisible(visible)');
		const end = html.indexOf('function setBasicPasswordVisible', start);
		const attributes: Record<string, string> = {};
		const context = { buttonIcons, oauthClientSecret: { type: 'password', value: 'unchanged' },
			oauthSecretToggle: { innerHTML: '', setAttribute: (name: string, value: string) => { attributes[name] = value; } } };
		runInNewContext(html.slice(start, end) + '; setOAuthSecretVisible(true);', context);
		assert.strictEqual(context.oauthClientSecret.type, 'text');
		assert.ok(context.oauthSecretToggle.innerHTML.includes(buttonIcons.eyeClosed));
		assert.ok(context.oauthSecretToggle.innerHTML.includes('Hide'));
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
		const context = { buttonIcons, basicAuthPassword: { type: 'password', value: 'unchanged' },
			basicPasswordToggle: { innerHTML: '', setAttribute: (name: string, value: string) => { attributes[name] = value; } } };
		runInNewContext(html.slice(start, end) + '; setBasicPasswordVisible(true);', context);
		assert.strictEqual(context.basicAuthPassword.type, 'text');
		assert.ok(context.basicPasswordToggle.innerHTML.includes(buttonIcons.eyeClosed));
		assert.ok(context.basicPasswordToggle.innerHTML.includes('Hide'));
		runInNewContext('setBasicPasswordVisible(false);', context);
		assert.strictEqual(context.basicAuthPassword.type, 'password');
		assert.strictEqual(attributes['aria-label'], 'Show password');
		assert.strictEqual(attributes['aria-pressed'], 'false');
		assert.strictEqual(context.basicAuthPassword.value, 'unchanged');
	});
	test('request and response sections collapse independently without clearing content', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		for (const name of ['request', 'response']) {
			assert.ok(html.includes(`aria-controls="${name}-section"`));
			const attributes: Record<string, string> = { 'aria-expanded': 'true' };
			let hidden = false;
			let resizeCount = 0;
			const context = { name, button: { title: '', getAttribute: (key: string) => attributes[key],
				setAttribute: (key: string, value: string) => { attributes[key] = value; } },
				section: { value: 'preserved', classList: { toggle: (_key: string, value: boolean) => { hidden = value; } } },
				updateResponseAreaBounds: () => { resizeCount++; } };
			const start = html.indexOf('function toggleRequestSection(button, section, name)');
			const end = html.indexOf('// Sizes the active response panel', start);
			runInNewContext(html.slice(start, end) + '; toggleRequestSection(button, section, name);', context);
			assert.strictEqual(hidden, true);
			assert.strictEqual(attributes['aria-expanded'], 'false');
			assert.strictEqual(attributes['aria-label'], 'Expand ' + name);
			runInNewContext('toggleRequestSection(button, section, name);', context);
			assert.strictEqual(hidden, false);
			assert.strictEqual(attributes['aria-expanded'], 'true');
			assert.strictEqual(context.section.value, 'preserved');
			assert.strictEqual(resizeCount, 2);
		}
	});
	test('Settings displays environment paths, remains empty when missing, and ignores stale results', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		assert.ok(html.includes('id="request-settings-tab"'));
		assert.ok(html.includes("type: 'openEnvironmentFile'"));
		const start = html.indexOf("if (message.type === 'environmentFile')");
		const end = html.indexOf("if (message.type === 'oauthTokenResult')", start);
		const context = { environmentFileRequestId: 2, updateRequestTabIndicators: () => {},
			requestEnvPath: { value: '' }, requestEnvOpen: { disabled: true },
			requestEnvError: { textContent: '' }, message: { type: 'environmentFile', requestId: 2, path: '/workspace/.env' } };
		const code = '(function () {' + html.slice(start, end) + '})();';
		runInNewContext(code, context);
		assert.strictEqual(context.requestEnvPath.value, '/workspace/.env');
		assert.strictEqual(context.requestEnvOpen.disabled, false);
		context.message.path = '';
		runInNewContext(code, context);
		assert.strictEqual(context.requestEnvPath.value, '');
		assert.strictEqual(context.requestEnvOpen.disabled, true);
		context.message.requestId = 1;
		context.message.path = '/old/.env';
		runInNewContext(code, context);
		assert.strictEqual(context.requestEnvPath.value, '');
	});
	test('configured token results refresh the output without persisting a resolved token', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("if (message.type === 'configuredOAuthToken')");
		const end = html.indexOf("if (message.type === 'environmentFileSelected')", start);
		let displayed = '';
		const context = { configuredOAuthTokenRequestId: 2, displayedOAuthToken: '', oauthStatus: { textContent: 'Choose an environment file in Request Settings.' },
			message: { type: 'configuredOAuthToken', requestId: 2, token: 'resolved-env-token' },
			updateOAuthTokenDisplay: () => { displayed = context.displayedOAuthToken; } };
		const code = '(function () {' + html.slice(start, end) + '})();';
		runInNewContext(code, context);
		assert.strictEqual(displayed, 'resolved-env-token');
		assert.strictEqual(context.oauthStatus.textContent, '', 'A successful nearest-env lookup clears manual-mode errors');
		assert.ok(!html.slice(start, end).includes('notifyRequestChanged'));
		context.message.requestId = 1;
		context.message.token = 'stale-token';
		runInNewContext(code, context);
		assert.strictEqual(displayed, 'resolved-env-token');
	});
	test('refreshing OAuth output clears old environment errors even without a token', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function refreshConfiguredOAuthToken()');
		const end = html.indexOf('// Displays the current OAuth token', start);
		const context = { configuredOAuthTokenRequestId: 1, displayedOAuthToken: '',
			oauthStatus: { textContent: 'Choose an environment file in Request Settings.' },
            oauthUpdateHeader: { checked: true },
			authorizationType: { value: 'oauth2' }, oauthGrantType: { value: 'client_credentials' },
			readAuthorizationHeaderValue: () => '' };
		runInNewContext(html.slice(start, end) + '; refreshConfiguredOAuthToken();', context);
		assert.strictEqual(context.oauthStatus.textContent, '');
		assert.strictEqual(context.configuredOAuthTokenRequestId, 2);
	});
	test('retrieval displays tokens without changing authorization when Update Authorization Header is unchecked', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("if (message.type === 'oauthTokenResult')");
		const end = html.indexOf("if (message.type === 'requestComplete')", start);
		let headerUpdates = 0;
		let renders = 0;
        let selectedView = '';
		const context = { defaultTokenView: 'raw', showOAuthTokenView: (view: string) => { selectedView = view; }, message: { type: 'oauthTokenResult', requestId: 1, token: 'new-token', stored: true },
			oauthRequestId: 1, configuredOAuthTokenRequestId: 0, oauthPending: true, oauthGetToken: { disabled: true },
			oauthStatus: { textContent: '' }, authorizationType: { value: 'oauth2' }, oauthGrantType: { value: 'client_credentials' },
			oauthUpdateHeader: { checked: false }, oauthToken: 'existing-token', displayedOAuthToken: '',
			refreshEnvironmentFile: () => {}, notifyRequestChanged: () => {},
			applyRetrievedOAuthHeader: () => { headerUpdates++; }, updateOAuthTokenDisplay: () => { renders++; } };
		const code = '(function () {' + html.slice(start, end) + '})();';
		runInNewContext(code, context);
		assert.strictEqual(context.displayedOAuthToken, 'new-token');
		assert.strictEqual(context.oauthToken, 'existing-token');
		assert.strictEqual(headerUpdates, 0);
		assert.strictEqual(renders, 1);
        for (const view of ['raw', 'decoded', 'hidden']) {
            context.defaultTokenView = view;
            runInNewContext(code, context);
            assert.strictEqual(selectedView, '', 'Retrieving tokens must not switch the current output view');
        }
		context.oauthUpdateHeader.checked = true;
		runInNewContext(code, context);
		assert.strictEqual(headerUpdates, 1);
		assert.strictEqual(context.oauthToken, 'new-token');
	});
	test('explains that a missing token variable will be created on retrieval', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function formatConfiguredOAuthError(error)');
		const end = html.indexOf('// This output is separate', start);
		const context = { oauthStoreToken: { checked: true }, oauthTokenVariable: { value: 'ACCESS_TOKENASD' },
			error: 'Missing environment variable: ACCESS_TOKENASD' };
		const formatted = runInNewContext(html.slice(start, end) + '; formatConfiguredOAuthError(error);', context);
		assert.match(formatted, /will be created in .env when you get a new access token/);
		context.error = 'Missing environment variable: CLIENT_SECRET';
		assert.strictEqual(runInNewContext('formatConfiguredOAuthError(error);', context), context.error);
		context.oauthStoreToken.checked = false;
		context.error = 'Missing environment variable: ACCESS_TOKENASD';
		assert.strictEqual(runInNewContext('formatConfiguredOAuthError(error);', context), context.error);
	});
	test('successful retrieval applies a token or env reference using the chosen storage option', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function applyRetrievedOAuthHeader(token)');
		const end = html.indexOf('// Writes authorization control state', start);
		let header = '';
		const context = { oauthStoreToken: { checked: true }, oauthTokenVariable: { value: 'NEW_TOKEN' },
			setHeaderValue: (_name: string, value: string) => { header = value; } };
		runInNewContext(html.slice(start, end) + "; applyRetrievedOAuthHeader('new-token');", context);
		assert.strictEqual(header, 'Bearer {{NEW_TOKEN}}');
		context.oauthStoreToken.checked = false;
		runInNewContext("applyRetrievedOAuthHeader('new-token');", context);
		assert.strictEqual(header, 'Bearer new-token');
	});
	test('preserves Bearer variable references in the header display when loading requests', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function readAuthorizationHeaderDisplayValue(headerValue)');
		const end = html.indexOf('// Detects RestCraft environment variable placeholders.', start);
		for (const type of ['bearer', 'oauth2']) {
			const context = { authorizationType: { value: type }, bearerToken: { value: '{{ACCESS_TOKEN}}' },
				header: 'Bearer {{ACCESS_TOKEN}}' };
			const displayed = runInNewContext(html.slice(start, end) + '; readAuthorizationHeaderDisplayValue(header);', context);
			assert.strictEqual(displayed, 'Bearer {{ACCESS_TOKEN}}');
		}
	});
	test('configured token refresh resolves literal and env headers without modifying saved rows', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function refreshConfiguredOAuthToken()');
		const end = html.indexOf('// Displays the current OAuth token', start);
		for (const authorization of ['Bearer saved-token', 'Bearer {{ACCESS_TOKEN}}']) {
			let posted: { type: string; authorization: string } | undefined;
			const context = { configuredOAuthTokenRequestId: 0, displayedOAuthToken: '', oauthStatus: { textContent: '' },
				authorizationType: { value: 'oauth2' }, oauthGrantType: { value: 'client_credentials' },
				oauthUpdateHeader: { checked: true }, readAuthorizationHeaderValue: () => authorization,
				vscode: { postMessage: (message: { type: string; authorization: string }) => { posted = message; } } };
			runInNewContext(html.slice(start, end) + '; refreshConfiguredOAuthToken();', context);
			assert.strictEqual(posted?.type, 'getConfiguredOAuthToken');
			assert.strictEqual(posted?.authorization, authorization);
		}
	});
	test('switching grant types re-resolves the configured token without updating the header', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const listenerStart = html.indexOf("oauthGrantType.addEventListener('change', () => {");
		const listenerEnd = html.indexOf("['oauth-url'", listenerStart);
		const refreshStart = html.indexOf('function refreshConfiguredOAuthToken()');
		const refreshEnd = html.indexOf('// Displays the current OAuth token', refreshStart);
		for (const header of ['Bearer configured-token', 'Bearer {{ACCESS_TOKEN}}']) {
			let change = () => {};
			const messages: { type: string; authorization?: string }[] = [];
			const context = { oauthGrantType: { value: 'authorization_code', addEventListener: (_event: string, callback: () => void) => { change = callback; } },
				authorizationType: { value: 'oauth2' }, oauthUpdateHeader: { checked: true }, oauthToken: '', displayedOAuthToken: '',
				oauthStatus: { textContent: '' }, oauthRequestId: 0, configuredOAuthTokenRequestId: 0, oauthPending: false,
				oauthGetToken: { disabled: false }, applyAuthorizationType: () => {}, notifyRequestChanged: () => {},
				readAuthorizationHeaderValue: () => header,
				vscode: { postMessage: (message: { type: string; authorization?: string }) => { messages.push(message); } } };
			runInNewContext(html.slice(refreshStart, refreshEnd) + html.slice(listenerStart, listenerEnd), context);
			change();
			assert.strictEqual(messages.filter(message => message.type === 'getConfiguredOAuthToken').length, 0);
			context.oauthGrantType.value = 'client_credentials';
			change();
			assert.strictEqual(messages.find(message => message.type === 'getConfiguredOAuthToken')?.authorization, header);
			assert.strictEqual(context.readAuthorizationHeaderValue(), header);
		}
	});
	test('request tabs show dots for populated sections and clear them when emptied', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function updateRequestTabIndicators()');
		const end = html.indexOf('// Posts the current editor state', start);
		const tab = (name: string) => ({ textContent: name, populated: false, label: '',
			classList: { toggle: (_name: string, _value: boolean) => {} }, setAttribute: (_name: string, _value: string) => {} });
		const tabs = ['Params', 'Authorization', 'Headers', 'Body', 'Settings'].map(name => {
			const item = tab(name);
			item.classList.toggle = (_name, value) => { item.populated = value; };
			item.setAttribute = (_name, value) => { item.label = value; };
			return item;
		});
		let values = ['partial'];
		const table = { querySelectorAll: () => values.map(value => ({ value })) };
		const context = { requestParamsTab: tabs[0], requestAuthorizationTab: tabs[1], requestHeadersTab: tabs[2],
			requestBodyTab: tabs[3], requestSettingsTab: tabs[4], requestParamsTable: table, requestHeadersTable: table,
			requestBodyFormTable: table, requestBody: { value: '' }, authorizationType: { value: 'oauth2' },
			requestEnvManual: { checked: true }, manualEnvironmentPath: '../custom/.env', requestEnvPath: { value: '' } };
		runInNewContext(html.slice(start, end) + '; updateRequestTabIndicators();', context);
		assert.ok(tabs.every(item => item.populated));
		assert.ok(tabs.every(item => item.label.includes('contains values')));
        context.manualEnvironmentPath = '';
        context.requestEnvPath.value = '/project/.env';
        runInNewContext('updateRequestTabIndicators();', context);
        assert.strictEqual(tabs[4].populated, false);
        context.manualEnvironmentPath = '../custom/.env';
        context.requestEnvManual.checked = false;
        runInNewContext('updateRequestTabIndicators();', context);
        assert.strictEqual(tabs[4].populated, false);
		values = ['   '];
		context.authorizationType.value = 'none';
		context.requestEnvManual.checked = false;
		runInNewContext('updateRequestTabIndicators();', context);
		assert.ok(tabs.every(item => !item.populated));
	});
	test('extension setting updates the retrieval preference without changing the current output', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		assert.ok(!html.includes('id="default-token-view"'));
		const start = html.indexOf("if (message.type === 'tokenViewSetting')");
		const end = html.indexOf("if (message.type === 'configuredOAuthToken')", start);
		const context = { defaultTokenView: 'raw', message: { type: 'tokenViewSetting', value: 'hidden' } };
		const code = '(function () {' + html.slice(start, end) + '})();';
		runInNewContext(code, context);
		assert.strictEqual(context.defaultTokenView, 'hidden');
		context.message.value = 'invalid';
		runInNewContext(code, context);
		assert.strictEqual(context.defaultTokenView, 'raw');
	});
	test('opening Authorization applies the extension preference while clicking the active tab preserves the view', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("requestAuthorizationTab.addEventListener('click'");
		const end = html.indexOf("requestHeadersTab.addEventListener('click'", start);
		let click = () => {};
		let active = false;
		let selectedView = 'raw';
		const context = { defaultTokenView: 'hidden', requestAuthorizationTab: {
			getAttribute: () => String(active), addEventListener: (_event: string, callback: () => void) => { click = callback; } },
			showOAuthTokenView: (view: string) => { selectedView = view; }, showRequestTab: () => { active = true; },
			refreshConfiguredOAuthToken: () => {}, updateOAuthTokenDisplay: () => {} };
		runInNewContext(html.slice(start, end), context);
		click();
		assert.strictEqual(selectedView, 'hidden');
		selectedView = 'decoded';
		click();
		assert.strictEqual(selectedView, 'decoded');
	});
	test('description renders compact plain text and offers expansion only when needed', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function renderDescription()');
		const end = html.indexOf('function startDescriptionEdit()', start);
		let toggleHidden = true;
		const attributes: Record<string, string> = {};
		const context = { descriptionExpanded: false, requestDescription: { value: 'First line\nSecond line' },
			requestDescriptionText: { textContent: '', scrollWidth: 10, clientWidth: 100 },
			descriptionDisplay: { classList: { toggle: () => {} } },
			requestDescriptionToggle: { textContent: '', setAttribute: (name: string, value: string) => { attributes[name] = value; },
				classList: { toggle: (_name: string, value: boolean) => { toggleHidden = value; } } },
			requestAnimationFrame: (callback: () => void) => callback(), updateResponseAreaBounds: () => {} };
		runInNewContext(html.slice(start, end) + '; renderDescription();', context);
		assert.strictEqual(toggleHidden, false);
		assert.strictEqual(attributes['aria-expanded'], 'false');
        assert.strictEqual(context.requestDescriptionText.textContent, 'First line...');
		context.descriptionExpanded = true;
		runInNewContext('renderDescription();', context);
		assert.strictEqual(context.requestDescriptionToggle.textContent, 'Show less ▴');
        assert.strictEqual(context.requestDescriptionText.textContent, 'First line\nSecond line');
		context.descriptionExpanded = false;
		context.requestDescription.value = 'First line\r\nSecond line';
        runInNewContext('renderDescription();', context);
        assert.strictEqual(context.requestDescriptionText.textContent, 'First line...');
        assert.strictEqual(context.requestDescription.value, 'First line\r\nSecond line');
		context.requestDescription.value = 'Short note';
		runInNewContext('renderDescription();', context);
		assert.strictEqual(toggleHidden, true);
		context.requestDescription.value = '';
		runInNewContext('renderDescription();', context);
		assert.strictEqual(context.requestDescriptionText.textContent, 'Add description…');
		assert.strictEqual(toggleHidden, true);
	});
	test('Enter finishes description editing while Shift+Enter preserves newline entry', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("requestDescription.addEventListener('keydown'");
		const end = html.indexOf("window.addEventListener('resize', renderDescription)", start);
		let handler = (_event: { key: string; shiftKey: boolean; isComposing: boolean; preventDefault: () => void }) => {};
		let blurred = false;
		let prevented = false;
		const context = { requestDescription: { addEventListener: (_name: string, callback: typeof handler) => { handler = callback; },
			blur: () => { blurred = true; } } };
		runInNewContext(html.slice(start, end), context);
		for (const [shiftKey, isComposing, finish] of [[false, false, true], [true, false, false], [false, true, false]]) {
			blurred = false;
			prevented = false;
			handler({ key: 'Enter', shiftKey, isComposing, preventDefault: () => { prevented = true; } });
			assert.strictEqual(blurred, finish);
			assert.strictEqual(prevented, finish);
		}
	});
});
