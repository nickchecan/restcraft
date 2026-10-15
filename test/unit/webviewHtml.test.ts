import { webcrypto } from 'node:crypto';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { runInNewContext } from 'vm';

import { buttonIcons } from '../../src/webview/buttonIcons';
import { getWebviewHtml } from '../../src/webview/getWebviewHtml';

suite('Webview HTML', () => {
	test('places the log console button after history and posts the log action when clicked', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const logButton = html.indexOf('id="footer-log-button"');
		assert.ok(logButton > html.indexOf('id="footer-history-button"'));
		assert.ok(logButton < html.indexOf('id="footer-repository-link"'));
		assert.ok(html.includes(buttonIcons.debugConsole));
		const script = html.match(/footerLogButton.addEventListener\('click', \(\) => \{([\s\S]*?)\n\s*\}\);/)?.[1];
		assert.ok(script);
		const messages: unknown[] = [];
		runInNewContext(script, { vscode: { postMessage: (message: unknown) => messages.push(message) } });
		assert.strictEqual(JSON.stringify(messages), '[{"type":"openNetworkLog"}]');
	});
	test('places the history button after settings and posts the history action when clicked', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		assert.ok(html.indexOf('id="footer-history-button"') > html.indexOf('id="footer-settings-button"'));
		assert.ok(html.indexOf('id="footer-history-button"') < html.indexOf('<div class="editor-footer-brand">'));
		const script = html.match(/footerHistoryButton.addEventListener\('click', \(\) => \{([\s\S]*?)\n\s*\}\);/)?.[1];
		assert.ok(script);
		const messages: unknown[] = [];
		runInNewContext(script, { vscode: { postMessage: (message: unknown) => messages.push(message) } });
		assert.strictEqual(JSON.stringify(messages), '[{"type":"openNetworkHistory"}]');
	});
	test('renders the supplied extension version in the footer', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');

		// Assert
		assert.match(html, /<span class="editor-footer-version" aria-label="RestCraft version">v1\.2\.3<\/span>/);
	});
	test('includes OAuth grant choices and valid client-side JavaScript', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		// Assert
		assert.ok(html.includes('<option value="oauth2">OAuth 2.0</option>'));
		assert.ok(html.includes('<option value="client_credentials">Client Credentials</option>'));
		assert.ok(html.includes('<option value="authorization_code">Authorization Code</option>'));
		const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
		assert.ok(script);
		assert.doesNotThrow(() => new Function(script));
	});
	test('OAuth text edits highlight environment references and preserve their literal values', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf(
			"['oauth-url', 'oauth-client-id', 'oauth-client-secret', 'oauth-scope', 'oauth-authorization-url', 'oauth-state'].forEach",
		);
		const end = html.indexOf("document.getElementById('oauth-client-authentication').addEventListener", start);
		const listeners: Record<string, () => void> = {};
		const fields: Record<string, { value: string; addEventListener: (event: string, callback: () => void) => void }> =
			{};
		for (const id of [
			'oauth-url',
			'oauth-client-id',
			'oauth-client-secret',
			'oauth-scope',
			'oauth-authorization-url',
			'oauth-state',
		]) {
			fields[id] = {
				value: '{{TEST_VARIABLE}}',
				addEventListener: (_event, callback) => {
					listeners[id] = callback;
				},
			};
		}
		const highlighted: unknown[] = [];
		let changes = 0;
		const context = {
			oauthCopyToken: { disabled: false },
			document: { getElementById: (id: string) => fields[id] },
			updateSecretReferenceState: (field: unknown) => {
				highlighted.push(field);
			},
			vscode: { postMessage: () => {} },
			oauthRequestId: 0,
			oauthPending: false,
			oauthGetToken: { disabled: false },
			oauthToken: '',
			displayedOAuthToken: '',
			oauthStatus: { textContent: '' },
			authorizationType: { value: 'oauth2' },
			notifyRequestChanged: () => {
				changes++;
			},
		};
		runInNewContext(html.slice(start, end), context);
		for (const [id, listener] of Object.entries(listeners)) {
			listener();
			assert.strictEqual(highlighted.at(-1), fields[id]);
			assert.strictEqual(fields[id].value, '{{TEST_VARIABLE}}');
		}
		// Assert
		assert.strictEqual(changes, 6);
	});
	test('changing client authentication to None clears the secret before saving', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("document.getElementById('oauth-client-authentication').addEventListener");
		const end = html.indexOf("document.getElementById('oauth-generate-state').addEventListener", start);
		let change = () => {};
		const authentication = {
			value: 'body',
			addEventListener: (_event: string, callback: () => void) => {
				change = callback;
			},
		};
		const secret = { value: '{{CLIENT_SECRET}}' };
		let savedSecret = '';
		const context = {
			document: { getElementById: (id: string) => (id === 'oauth-client-authentication' ? authentication : secret) },
			vscode: { postMessage: () => {} },
			oauthRequestId: 0,
			oauthPending: false,
			oauthGetToken: { disabled: false },
			oauthStatus: { textContent: '' },
			setOAuthSecretVisible: () => {},
			applyAuthorizationType: () => {},
			scheduleEnvironmentVariableCheck: () => {},
			notifyRequestChanged: () => {
				savedSecret = secret.value;
			},
		};
		runInNewContext(html.slice(start, end), context);
		change();
		// Assert
		assert.strictEqual(savedSecret, '{{CLIENT_SECRET}}');
		authentication.value = 'none';
		change();
		assert.strictEqual(secret.value, '');
		assert.strictEqual(savedSecret, '');
		authentication.value = 'basic';
		change();
		assert.strictEqual(secret.value, '');
	});
	test('Cancel immediately invalidates a queued token result without updating the header', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("document.getElementById('oauth-cancel-token').addEventListener");
		const end = html.indexOf('const oauthCancelObserver', start);
		let cancel = () => {};
		const messages: unknown[] = [];
		const context = {
			document: {
				getElementById: () => ({
					addEventListener: (_event: string, callback: () => void) => {
						cancel = callback;
					},
				}),
			},
			oauthRequestId: 4,
			oauthPending: true,
			oauthGetToken: { disabled: true },
			oauthStatus: { textContent: '' },
			vscode: {
				postMessage: (message: unknown) => {
					messages.push(message);
				},
			},
			completeOAuthBeforeSend: () => {},
			message: { type: 'oauthTokenResult', requestId: 4, token: 'cancelled-token', stored: true },
			displayedOAuthToken: 'previous-token',
			oauthToken: 'previous-token',
			refreshEnvironmentFile: () => {
				assert.fail('Must not refresh a cancelled token');
			},
			applyRetrievedOAuthHeader: () => {
				assert.fail('Must not apply a cancelled token');
			},
		};
		runInNewContext(html.slice(start, end), context);
		cancel();
		// Assert
		assert.strictEqual(context.oauthPending, false);
		assert.strictEqual(context.oauthGetToken.disabled, false);
		assert.strictEqual(context.oauthRequestId, 5);
		assert.strictEqual(context.oauthStatus.textContent, 'Token request cancelled.');
		assert.strictEqual(messages.length, 1);
		const resultStart = html.indexOf("if (message.type === 'oauthTokenResult')");
		const resultEnd = html.indexOf("if (message.type === 'requestComplete')", resultStart);
		runInNewContext('(function () {' + html.slice(resultStart, resultEnd) + '})();', context);
		assert.strictEqual(context.displayedOAuthToken, 'previous-token');
		assert.strictEqual(context.oauthToken, 'previous-token');
		assert.strictEqual(context.oauthStatus.textContent, 'Token request cancelled.');
		cancel();
		assert.strictEqual(messages.length, 1);
	});
	test('automatic State generation runs only when selecting Authorization Code with the preference enabled', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("oauthGrantType.addEventListener('change'");
		const end = html.indexOf("['oauth-url'", start);
		let change = () => {};
		let generations = 0;
		const state = { value: '' };
		const context = {
			document: { getElementById: () => state },
			autoGenerateAuthorizationCodeState: false,
			oauthGrantType: {
				value: 'authorization_code',
				addEventListener: (_event: string, callback: () => void) => {
					change = callback;
				},
			},
			authorizationType: { value: 'oauth2' },
			generateOAuthState: () => {
				generations++;
				state.value = 'generated-state';
			},
			vscode: { postMessage: () => {} },
			oauthToken: '',
			displayedOAuthToken: '',
			oauthStatus: { textContent: '' },
			oauthRequestId: 0,
			oauthPending: false,
			oauthGetToken: { disabled: false },
			refreshConfiguredOAuthToken: () => {},
			applyAuthorizationType: () => {},
			notifyRequestChanged: () => {},
		};
		runInNewContext(html.slice(start, end), context);
		change();
		// Assert
		assert.strictEqual(generations, 0);
		context.autoGenerateAuthorizationCodeState = true;
		change();
		change();
		assert.strictEqual(generations, 1);
		context.oauthGrantType.value = 'client_credentials';
		change();
		assert.strictEqual(generations, 1);
		context.oauthGrantType.value = 'authorization_code';
		change();
		assert.strictEqual(state.value, 'generated-state');
		assert.strictEqual(generations, 1);
		for (const savedState of ['saved-state', '{{OAUTH_STATE}}']) {
			state.value = savedState;
			context.oauthGrantType.value = 'client_credentials';
			change();
			context.oauthGrantType.value = 'authorization_code';
			change();
			assert.strictEqual(state.value, savedState);
			assert.strictEqual(generations, 1);
		}
		state.value = '';
		context.authorizationType.value = 'none';
		change();
		assert.strictEqual(generations, 1);
	});

	test('changing the global automatic State preference does not generate or overwrite existing State', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("if (message.type === 'autoGenerateStateSetting')");
		const end = html.indexOf("if (message.type === 'tokenViewSetting')", start);
		const context = {
			message: { type: 'autoGenerateStateSetting', value: true as unknown },
			autoGenerateAuthorizationCodeState: false,
			generateOAuthState: () => {
				assert.fail('Must wait until grant selection');
			},
		};
		runInNewContext('(function () {' + html.slice(start, end) + '})();', context);
		// Assert
		assert.strictEqual(context.autoGenerateAuthorizationCodeState, true);
		context.message.value = 'true';
		runInNewContext('(function () {' + html.slice(start, end) + '})();', context);
		assert.strictEqual(context.autoGenerateAuthorizationCodeState, false);
	});
	test('Generate State creates a fresh random value and notifies the input listener', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function generateOAuthState()');
		const end = html.indexOf("document.getElementById('oauth-pkce').addEventListener", start);
		let generate = () => {};
		let changes = 0;
		const state = {
			value: 'manually-entered',
			dispatchEvent: (event: Event) => {
				assert.strictEqual(event.type, 'input');
				assert.strictEqual(event.bubbles, true);
				changes++;
			},
		};
		const context = {
			crypto: webcrypto,
			Uint8Array,
			Event,
			document: {
				getElementById: (id: string) =>
					id === 'oauth-state'
						? state
						: {
								addEventListener: (_event: string, callback: () => void) => {
									generate = callback;
								},
							},
			},
		};
		runInNewContext(html.slice(start, end), context);
		generate();
		const first = state.value;
		// Assert
		assert.match(first, /^[a-f0-9]{64}$/);
		generate();
		assert.match(state.value, /^[a-f0-9]{64}$/);
		assert.notStrictEqual(state.value, first);
		assert.strictEqual(changes, 2);
		assert.ok(html.includes(buttonIcons.wand));
	});
	test('restores saved OAuth controls and clears them when loading a legacy request', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('// Loading another request invalidates pending token results');
		const end = html.indexOf('setRequestBodyContent(message.request.body', start);
		// Assert
		assert.ok(start >= 0 && end > start);
		const fields: Record<string, { value: string; checked?: boolean }> = {};
		for (const id of [
			'oauth-url',
			'oauth-client-id',
			'oauth-client-secret',
			'oauth-scope',
			'oauth-authorization-url',
			'oauth-client-authentication',
			'oauth-pkce',
			'oauth-state',
		]) {
			fields[id] = { value: 'previous request' };
		}
		const authorizationType = { value: 'none' };
		let configuredTokenRefreshes = 0;
		const context = {
			document: { getElementById: (id: string) => fields[id] },
			oauthRequestId: 1,
			oauthPending: true,
			oauthGetToken: { disabled: true },
			setOAuthSecretVisible: () => {},
			setBasicPasswordVisible: () => {},
			showOAuthTokenView: () => {},
			vscode: { postMessage: () => {} },
			bearerToken: { value: '' },
			authorizeBeforeSend: { checked: false },
			oauthUpdateHeader: { checked: true },
			oauthStoreToken: { checked: false },
			oauthTokenVariable: { value: 'ACCESS_TOKEN' },
			oauthStatus: { textContent: 'Getting token' },
			oauthToken: 'old',
			displayedOAuthToken: 'old',
			activeAuthorizationType: 'none',
			oauthGrantType: { value: '' },
			authorizationType,
			readAuthorizationFromHeaders: () => {
				authorizationType.value = 'none';
			},
			readHeaderValue: (headers: Record<string, string>, name: string) => headers[name] || '',
			hasVariableReference: (value: string) => value.includes('{{'),
			applyAuthorizationType: () => {},
			syncAuthorizationHeader: () => {},
			refreshConfiguredOAuthToken: () => {
				configuredTokenRefreshes++;
			},
			updateRequestTabIndicators: () => {},
			message: { request: {} as Record<string, unknown> },
		};
		for (const grantType of ['client_credentials', 'authorization_code']) {
			context.message.request = {
				authorizeBeforeSend: true,
				authorization: {
					type: 'oauth2',
					grantType,
					accessTokenUrl: 'https://example.com/token',
					clientId: 'client',
					clientSecret: '{{SECRET}}',
					scope: 'api',
					authorizationUrl: 'https://example.com/authorize',
					clientAuthentication: 'body',
					usePkce: false,
					state: 'custom-state',
				},
				headers: { Authorization: 'Bearer saved' },
			};
			runInNewContext('{ ' + html.slice(start, end) + ' }', context);
			assert.strictEqual(authorizationType.value, 'oauth2');
			assert.strictEqual(context.oauthGrantType.value, grantType);
			assert.strictEqual(context.authorizeBeforeSend.checked, true);
			assert.strictEqual(fields['oauth-url'].value, 'https://example.com/token');
			assert.strictEqual(fields['oauth-client-id'].value, 'client');
			assert.strictEqual(fields['oauth-client-secret'].value, '{{SECRET}}');
			assert.strictEqual(fields['oauth-scope'].value, 'api');
			assert.strictEqual(fields['oauth-authorization-url'].value, 'https://example.com/authorize');
			assert.strictEqual(fields['oauth-client-authentication'].value, 'body');
			assert.strictEqual(fields['oauth-pkce'].checked, false);
			assert.strictEqual(fields['oauth-state'].value, 'custom-state');
			assert.strictEqual(context.oauthToken, 'saved');
			assert.strictEqual(context.displayedOAuthToken, '', 'Reopening must clear the token output');
			assert.strictEqual(context.oauthPending, false);
			assert.ok(configuredTokenRefreshes > 0, 'Loading OAuth settings must resolve the configured token for output');
		}
		context.message.request = { headers: {} };
		runInNewContext('{ ' + html.slice(start, end) + ' }', context);
		assert.strictEqual(authorizationType.value, 'none');
		assert.strictEqual(context.oauthToken, '');
		assert.strictEqual(context.authorizeBeforeSend.checked, false);
		assert.strictEqual(fields['oauth-authorization-url'].value, '');
		assert.strictEqual(fields['oauth-client-authentication'].value, 'none');
		assert.strictEqual(fields['oauth-pkce'].checked, true);
		assert.strictEqual(fields['oauth-state'].value, '');
		for (const id of ['oauth-url', 'oauth-client-id', 'oauth-client-secret', 'oauth-scope']) {
			assert.strictEqual(fields[id].value, '');
		}
	});
	test('token output renders resolved display state independently of the saved header', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function updateOAuthTokenDisplay()');
		const end = html.indexOf('// Hides or shows an authorization field', start);
		const context = {
			authorizationType: { value: 'oauth2' },
			oauthGrantType: { value: 'client_credentials' },
			oauthToken: 'saved-token',
			displayedOAuthToken: '',
			oauthAccessToken: { value: '' },
			oauthCopyToken: { disabled: true },
			oauthDecodedToken: { textContent: '', innerHTML: '' },
			TextDecoder,
			atob,
			oauthTokenPanel: { classList: { toggle: () => {} } },
			authorizationLayout: { classList: { toggle: () => {} } },
		};
		runInNewContext(html.slice(start, end) + '; updateOAuthTokenDisplay();', context);
		// Assert
		assert.strictEqual(context.oauthAccessToken.value, '');
		assert.strictEqual(context.oauthCopyToken.disabled, true);
		context.displayedOAuthToken = 'new-token';
		runInNewContext('updateOAuthTokenDisplay();', context);
		assert.strictEqual(context.oauthAccessToken.value, 'new-token');
		assert.strictEqual(context.oauthCopyToken.disabled, false);
	});
	test('decoded token output formats and highlights JSON while escaping token contents', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function updateOAuthTokenDisplay()');
		const end = html.indexOf('// Hides or shows an authorization field', start);
		const highlightStart = html.indexOf('function formatJsonHighlight(content)');
		const highlightEnd = html.indexOf('// Sets formatted response body text', highlightStart);
		const token =
			[{ alg: 'RS256' }, { name: '<img src=x onerror=alert(1)>', count: 12, active: true, missing: null }]
				.map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
				.join('.') + '.signature';
		const context = {
			authorizationType: { value: 'oauth2' },
			displayedOAuthToken: token,
			oauthCopyToken: { disabled: true },
			oauthAccessToken: { value: '' },
			oauthDecodedToken: { innerHTML: '', textContent: '' },
			TextDecoder,
			atob,
			oauthTokenPanel: { classList: { toggle: () => {} } },
			authorizationLayout: { classList: { toggle: () => {} } },
		};
		runInNewContext(
			html.slice(highlightStart, highlightEnd) + html.slice(start, end) + '; updateOAuthTokenDisplay();',
			context,
		);
		const output = context.oauthDecodedToken.innerHTML;
		// Assert
		assert.ok(output.includes('\n  <span class="json-token-key">"header":</span>'));
		for (const type of ['key', 'string', 'number', 'literal']) {
			assert.ok(output.includes('json-token-' + type));
		}
		assert.ok(output.includes('&lt;img'));
		assert.ok(!output.includes('<img'));
		context.displayedOAuthToken = 'opaque-token';
		runInNewContext('updateOAuthTokenDisplay();', context);
		assert.strictEqual(context.oauthDecodedToken.textContent, 'This access token is not a readable JWT.');
		context.displayedOAuthToken = '';
		runInNewContext('updateOAuthTokenDisplay();', context);
		assert.strictEqual(context.oauthDecodedToken.textContent, 'No access token configured.');
	});
	test('keeps unchecked OAuth header rows saved but excludes them from sending', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function readRequestHeaders()');
		const end = html.indexOf('// Returns the executable value for a header row.', start);
		// Assert
		assert.ok(start >= 0 && end > start);
		const rows = [
			{ name: 'authorization', value: 'Bearer {{MY_TOKEN}}', enabled: false },
			{ name: 'Accept', value: 'application/json', enabled: true },
		].map((header) => ({
			querySelector: () => ({ checked: header.enabled }),
			querySelectorAll: () => [{ value: header.name }, { value: header.value }],
		}));
		const context = {
			authorizationType: { value: 'oauth2' },
			oauthUpdateHeader: { checked: true },
			oauthStoreToken: { checked: true },
			oauthGrantType: { value: 'client_credentials' },
			oauthTokenVariable: { value: 'MY_TOKEN' },
			requestHeadersTable: { querySelectorAll: () => rows },
			readHeaderRowValue: (_name: string, value: string) => value,
		};
		const result = runInNewContext(
			html.slice(start, end) + '; ({ state: readRequestHeaderState(), sent: readEnabledRequestHeaders() });',
			context,
		);
		const state = result.state.find((header: { name: string }) => header.name.toLowerCase() === 'authorization');
		assert.strictEqual(state.enabled, false);
		assert.strictEqual(state.value, 'Bearer {{MY_TOKEN}}');
		assert.strictEqual(result.sent.authorization, undefined);
		assert.strictEqual(result.sent.Accept, 'application/json');
	});
	test('decodes JWT header and UTF-8 payload locally and handles opaque or malformed tokens', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function decodeOAuthToken(token)');
		const end = html.indexOf('// Hides or shows an authorization field', start);
		const context = { TextDecoder, atob, token: '' };
		const header = { alg: 'RS256', typ: 'JWT' };
		const payload = { name: 'José', scope: 'api', text: '<script>alert(1)</script>' };
		context.token =
			[header, payload].map((value) => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') +
			'.signature';
		const decoded = runInNewContext(html.slice(start, end) + '; decodeOAuthToken(token);', context);
		// Assert
		assert.deepStrictEqual(JSON.parse(decoded), { header, payload });
		for (const token of ['', 'opaque-token', 'bad.invalid.signature']) {
			context.token = token;
			const result = runInNewContext('decodeOAuthToken(token);', context);
			assert.strictEqual(
				result,
				token
					? token.includes('.')
						? 'Unable to decode this access token. It may be opaque or malformed.'
						: 'This access token is not a readable JWT.'
					: '',
			);
		}
	});

	test('token radio buttons update checked state and show the matching content panel', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function showOAuthTokenView(view)');
		const end = html.indexOf('// Decodes locally;', start);
		const element = () => {
			const classes: Record<string, boolean> = {};
			const attributes: Record<string, string> = {};
			return {
				classes,
				attributes,
				checked: false,
				classList: {
					toggle: (name: string, value: boolean) => {
						classes[name] = value;
					},
				},
				setAttribute: (name: string, value: string) => {
					attributes[name] = value;
				},
			};
		};
		const context = {
			oauthTokenPanel: element(),
			oauthHiddenOption: element(),
			oauthRawOption: element(),
			oauthDecodedOption: element(),
			oauthRawPanel: element(),
			oauthDecodedPanel: element(),
		};
		runInNewContext(html.slice(start, end) + "; showOAuthTokenView('decoded');", context);
		// Assert
		assert.strictEqual(context.oauthRawPanel.classes.hidden, true);
		assert.strictEqual(context.oauthDecodedPanel.classes.hidden, false);
		assert.strictEqual(context.oauthDecodedOption.checked, true);
		assert.strictEqual(context.oauthRawOption.checked, false);
		runInNewContext("showOAuthTokenView('raw');", context);
		assert.strictEqual(context.oauthRawPanel.classes.hidden, false);
		assert.strictEqual(context.oauthDecodedPanel.classes.hidden, true);
		runInNewContext("showOAuthTokenView('hidden');", context);
		assert.strictEqual(context.oauthHiddenOption.checked, true);
		assert.strictEqual(context.oauthTokenPanel.classes['is-token-hidden'], true);
		runInNewContext("showOAuthTokenView('raw');", context);
		assert.strictEqual(context.oauthTokenPanel.classes['is-token-hidden'], false);
		runInNewContext("showOAuthTokenView('hidden');", context);
		assert.strictEqual(context.oauthRawPanel.classes.hidden, true);
		assert.strictEqual(context.oauthDecodedPanel.classes.hidden, true);
	});
	test('Copy uses the resolved access token and ignores empty output or other authentication types', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("oauthCopyToken.addEventListener('click'");
		const end = html.indexOf('const authorizationLayout', start);
		let copy = () => {};
		const messages: { type: string; token: string }[] = [];
		const context = {
			oauthCopyToken: {
				addEventListener: (_event: string, callback: () => void) => {
					copy = callback;
				},
			},
			authorizationType: { value: 'oauth2' },
			displayedOAuthToken: '',
			vscode: {
				postMessage: (message: { type: string; token: string }) => {
					messages.push(message);
				},
			},
		};
		runInNewContext(html.slice(start, end), context);
		copy();
		// Assert
		assert.strictEqual(messages.length, 0);
		context.displayedOAuthToken = 'resolved-env-token';
		copy();
		assert.strictEqual(messages[0].type, 'copyOAuthToken');
		assert.strictEqual(messages[0].token, 'resolved-env-token');
		context.authorizationType.value = 'none';
		copy();
		assert.strictEqual(messages.length, 1);
	});
	test('toggles client secret visibility and accessible button labels', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function setOAuthSecretVisible(visible)');
		const end = html.indexOf('function setBasicPasswordVisible', start);
		const attributes: Record<string, string> = {};
		const context = {
			buttonIcons,
			oauthClientSecret: { type: 'password', value: 'unchanged' },
			oauthSecretToggle: {
				innerHTML: '',
				setAttribute: (name: string, value: string) => {
					attributes[name] = value;
				},
			},
		};
		runInNewContext(html.slice(start, end) + '; setOAuthSecretVisible(true);', context);
		// Assert
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
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		// Assert
		assert.match(html, /id="basic-auth-password"[^>]*type="password"/);
		const start = html.indexOf('function setBasicPasswordVisible(visible)');
		const end = html.indexOf('// Shows the authorization inputs', start);
		const attributes: Record<string, string> = {};
		const context = {
			buttonIcons,
			basicAuthPassword: { type: 'password', value: 'unchanged' },
			basicPasswordToggle: {
				innerHTML: '',
				setAttribute: (name: string, value: string) => {
					attributes[name] = value;
				},
			},
		};
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
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		// Assert
		for (const name of ['request', 'response']) {
			assert.ok(html.includes(`aria-controls="${name}-section"`));
			const attributes: Record<string, string> = { 'aria-expanded': 'true' };
			let hidden = false;
			let resizeCount = 0;
			const context = {
				name,
				button: {
					title: '',
					getAttribute: (key: string) => attributes[key],
					setAttribute: (key: string, value: string) => {
						attributes[key] = value;
					},
				},
				section: {
					value: 'preserved',
					classList: {
						toggle: (_key: string, value: boolean) => {
							hidden = value;
						},
					},
				},
				updateResponseAreaBounds: () => {
					resizeCount++;
				},
			};
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
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		// Assert
		assert.ok(html.includes('id="request-settings-tab"'));
		assert.ok(html.includes("type: 'openEnvironmentFile'"));
		const start = html.indexOf("if (message.type === 'environmentFile')");
		const end = html.indexOf("if (message.type === 'oauthTokenResult')", start);
		const context = {
			environmentFileRequestId: 2,
			updateRequestTabIndicators: () => {},
			requestEnvPath: { value: '' },
			requestEnvOpen: { disabled: true },
			requestEnvError: { textContent: '' },
			message: { type: 'environmentFile', requestId: 2, path: '/workspace/.env' },
		};
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
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("if (message.type === 'configuredOAuthToken')");
		const end = html.indexOf("if (message.type === 'environmentFileSelected')", start);
		let displayed = '';
		const context = {
			configuredOAuthTokenRequestId: 2,
			displayedOAuthToken: '',
			oauthStatus: { textContent: 'Choose an environment file in Request Settings.' },
			message: { type: 'configuredOAuthToken', requestId: 2, token: 'resolved-env-token' },
			updateOAuthTokenDisplay: () => {
				displayed = context.displayedOAuthToken;
			},
		};
		const code = '(function () {' + html.slice(start, end) + '})();';
		runInNewContext(code, context);
		// Assert
		assert.strictEqual(displayed, 'resolved-env-token');
		assert.strictEqual(
			context.oauthStatus.textContent,
			'',
			'A successful nearest-env lookup clears manual-mode errors',
		);
		assert.ok(!html.slice(start, end).includes('notifyRequestChanged'));
		context.message.requestId = 1;
		context.message.token = 'stale-token';
		runInNewContext(code, context);
		assert.strictEqual(displayed, 'resolved-env-token');
	});
	test('refreshing OAuth output clears old environment errors even without a token', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function refreshConfiguredOAuthToken()');
		const end = html.indexOf('// Displays the current OAuth token', start);
		const context = {
			configuredOAuthTokenRequestId: 1,
			displayedOAuthToken: '',
			oauthStatus: { textContent: 'Choose an environment file in Request Settings.' },
			oauthUpdateHeader: { checked: true },
			authorizationType: { value: 'oauth2' },
			oauthGrantType: { value: 'client_credentials' },
			readAuthorizationHeaderValue: () => '',
		};
		runInNewContext(html.slice(start, end) + '; refreshConfiguredOAuthToken();', context);
		// Assert
		assert.strictEqual(context.oauthStatus.textContent, '');
		assert.strictEqual(context.configuredOAuthTokenRequestId, 2);
	});
	test('retrieval displays tokens without changing authorization when Update Authorization Header is unchecked', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("if (message.type === 'oauthTokenResult')");
		const end = html.indexOf("if (message.type === 'requestComplete')", start);
		let headerUpdates = 0;
		let renders = 0;
		let selectedView = '';
		const context = {
			completeOAuthBeforeSend: () => {},
			defaultTokenView: 'raw',
			showOAuthTokenView: (view: string) => {
				selectedView = view;
			},
			message: { type: 'oauthTokenResult', requestId: 1, token: 'new-token', stored: true },
			oauthRequestId: 1,
			configuredOAuthTokenRequestId: 0,
			oauthPending: true,
			oauthGetToken: { disabled: true },
			oauthStatus: { textContent: '' },
			authorizationType: { value: 'oauth2' },
			oauthGrantType: { value: 'client_credentials' },
			oauthUpdateHeader: { checked: false },
			oauthToken: 'existing-token',
			displayedOAuthToken: '',
			refreshEnvironmentFile: () => {},
			notifyRequestChanged: () => {},
			applyRetrievedOAuthHeader: () => {
				headerUpdates++;
			},
			updateOAuthTokenDisplay: () => {
				renders++;
			},
		};
		const code = '(function () {' + html.slice(start, end) + '})();';
		runInNewContext(code, context);
		// Assert
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
		context.oauthGrantType.value = 'authorization_code';
		context.oauthUpdateHeader.checked = false;
		context.displayedOAuthToken = '';
		runInNewContext(code, context);
		assert.strictEqual(context.displayedOAuthToken, 'new-token');
		assert.strictEqual(headerUpdates, 1);
		context.oauthUpdateHeader.checked = true;
		runInNewContext(code, context);
		assert.strictEqual(headerUpdates, 2);
		assert.strictEqual(context.oauthToken, 'new-token');
	});
	test('explains that a missing token variable will be created on retrieval', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function formatConfiguredOAuthError(error)');
		const end = html.indexOf('// This output is separate', start);
		const context = {
			oauthStoreToken: { checked: true },
			oauthTokenVariable: { value: 'ACCESS_TOKENASD' },
			error: 'Missing environment variable: ACCESS_TOKENASD',
		};
		const formatted = runInNewContext(html.slice(start, end) + '; formatConfiguredOAuthError(error);', context);
		// Assert
		assert.match(formatted, /will be created in .env when you get a new access token/);
		context.error = 'Missing environment variable: CLIENT_SECRET';
		assert.strictEqual(runInNewContext('formatConfiguredOAuthError(error);', context), context.error);
		context.oauthStoreToken.checked = false;
		context.error = 'Missing environment variable: ACCESS_TOKENASD';
		assert.strictEqual(runInNewContext('formatConfiguredOAuthError(error);', context), context.error);
	});
	test('successful retrieval applies a token or env reference using the chosen storage option', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function applyRetrievedOAuthHeader(token)');
		const end = html.indexOf('// Writes authorization control state', start);
		let header = '';
		const context = {
			oauthStoreToken: { checked: true },
			oauthTokenVariable: { value: 'NEW_TOKEN' },
			setHeaderValue: (_name: string, value: string) => {
				header = value;
			},
		};
		runInNewContext(html.slice(start, end) + "; applyRetrievedOAuthHeader('new-token');", context);
		// Assert
		assert.strictEqual(header, 'Bearer {{NEW_TOKEN}}');
		context.oauthStoreToken.checked = false;
		runInNewContext("applyRetrievedOAuthHeader('new-token');", context);
		assert.strictEqual(header, 'Bearer new-token');
	});
	test('preserves Bearer variable references in the header display when loading requests', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function readAuthorizationHeaderDisplayValue(headerValue)');
		const end = html.indexOf('// Detects RestCraft environment variable placeholders.', start);
		// Assert
		for (const type of ['bearer', 'oauth2']) {
			const context = {
				authorizationType: { value: type },
				bearerToken: { value: '{{ACCESS_TOKEN}}' },
				header: 'Bearer {{ACCESS_TOKEN}}',
			};
			const displayed = runInNewContext(
				html.slice(start, end) + '; readAuthorizationHeaderDisplayValue(header);',
				context,
			);
			assert.strictEqual(displayed, 'Bearer {{ACCESS_TOKEN}}');
		}
	});
	test('configured token refresh resolves literal and env headers without modifying saved rows', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function refreshConfiguredOAuthToken()');
		const end = html.indexOf('// Displays the current OAuth token', start);
		// Assert
		for (const authorization of ['Bearer saved-token', 'Bearer {{ACCESS_TOKEN}}']) {
			let posted: { type: string; authorization: string } | undefined;
			const context = {
				configuredOAuthTokenRequestId: 0,
				displayedOAuthToken: '',
				oauthStatus: { textContent: '' },
				authorizationType: { value: 'oauth2' },
				oauthGrantType: { value: 'client_credentials' },
				oauthUpdateHeader: { checked: true },
				readAuthorizationHeaderValue: () => authorization,
				vscode: {
					postMessage: (message: { type: string; authorization: string }) => {
						posted = message;
					},
				},
			};
			runInNewContext(html.slice(start, end) + '; refreshConfiguredOAuthToken();', context);
			assert.strictEqual(posted?.type, 'getConfiguredOAuthToken');
			assert.strictEqual(posted?.authorization, authorization);
		}
	});
	test('switching grant types re-resolves the configured token without updating the header', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const listenerStart = html.indexOf("oauthGrantType.addEventListener('change', () => {");
		const listenerEnd = html.indexOf("['oauth-url'", listenerStart);
		const refreshStart = html.indexOf('function refreshConfiguredOAuthToken()');
		const refreshEnd = html.indexOf('// Displays the current OAuth token', refreshStart);
		// Assert
		for (const header of ['Bearer configured-token', 'Bearer {{ACCESS_TOKEN}}']) {
			let change = () => {};
			const messages: { type: string; authorization?: string }[] = [];
			const context = {
				autoGenerateAuthorizationCodeState: false,
				oauthGrantType: {
					value: 'authorization_code',
					addEventListener: (_event: string, callback: () => void) => {
						change = callback;
					},
				},
				authorizationType: { value: 'oauth2' },
				oauthUpdateHeader: { checked: true },
				oauthToken: '',
				displayedOAuthToken: '',
				oauthStatus: { textContent: '' },
				oauthRequestId: 0,
				configuredOAuthTokenRequestId: 0,
				oauthPending: false,
				oauthGetToken: { disabled: false },
				applyAuthorizationType: () => {},
				notifyRequestChanged: () => {},
				readAuthorizationHeaderValue: () => header,
				vscode: {
					postMessage: (message: { type: string; authorization?: string }) => {
						messages.push(message);
					},
				},
			};
			runInNewContext(html.slice(refreshStart, refreshEnd) + html.slice(listenerStart, listenerEnd), context);
			change();
			assert.strictEqual(messages.filter((message) => message.type === 'getConfiguredOAuthToken').length, 1);
			context.oauthGrantType.value = 'client_credentials';
			change();
			assert.strictEqual(messages.find((message) => message.type === 'getConfiguredOAuthToken')?.authorization, header);
			assert.strictEqual(context.readAuthorizationHeaderValue(), header);
		}
	});
	test('request tabs show dots for populated sections and clear them when emptied', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function updateRequestTabIndicators()');
		const end = html.indexOf('// Posts the current editor state', start);
		const tab = (name: string) => ({
			textContent: name,
			querySelector: () => undefined,
			populated: false,
			label: '',
			classList: { toggle: (_name: string, _value: boolean) => {} },
			setAttribute: (_name: string, _value: string) => {},
		});
		const tabs = ['Params', 'Authorization', 'Headers', 'Body', 'Settings', 'Automations'].map((name) => {
			const item = tab(name);
			item.classList.toggle = (_name, value) => {
				item.populated = value;
			};
			item.setAttribute = (_name, value) => {
				item.label = value;
			};
			return item;
		});
		let values = ['partial'];
		const table = {
			querySelectorAll: (selector: string) =>
				selector === 'tr'
					? values.map((value) => ({ querySelectorAll: () => [{ value }] }))
					: values.map((value) => ({ value })),
		};
		const context = {
			requestParamsTab: tabs[0],
			requestAuthorizationTab: tabs[1],
			requestHeadersTab: tabs[2],
			requestBodyTab: tabs[3],
			requestSettingsTab: tabs[4],
			automationTab: tabs[5],
			automationRows: table,
			requestParamsTable: table,
			requestHeadersTable: table,
			requestBodyFormTable: table,
			requestBody: { value: '' },
			authorizationType: { value: 'oauth2' },
			requestEnvManual: { checked: true },
			manualEnvironmentPath: '../custom/.env',
			requestEnvPath: { value: '' },
		};
		runInNewContext(html.slice(start, end) + '; updateRequestTabIndicators();', context);
		// Assert
		assert.ok(tabs.every((item) => item.populated));
		assert.ok(tabs.every((item) => item.label.includes('contains values')));
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
		assert.ok(tabs.every((item) => !item.populated));
	});
	test('header, param, and automation counts include disabled and partial rows but exclude blank rows', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function updateRequestTabIndicators()');
		const end = html.indexOf('// Posts the current editor state', start);
		const makeTab = (name: string, withCount = false) => {
			const counter = { textContent: '', hidden: true };
			return {
				counter,
				populated: false,
				label: '',
				get textContent() {
					return name + (counter.textContent ? ' ' + counter.textContent : '');
				},
				querySelector: () => (withCount ? counter : undefined),
				classList: { toggle: (_name: string, _value: boolean) => {} },
				setAttribute: (_name: string, _value: string) => {},
			};
		};
		const headers = makeTab('Headers', true);
		const params = makeTab('Params', true);
		const automations = makeTab('Automations', true);
		for (const tab of [headers, params, automations]) {
			tab.classList.toggle = (_name, value) => {
				tab.populated = value;
			};
			tab.setAttribute = (_name, value) => {
				tab.label = value;
			};
		}
		const row = (name: string, value: string, enabled = true) => ({
			querySelectorAll: () => [{ value: name }, { value }],
			enabled,
		});
		let headerRows = [
			row('Accept', 'application/json'),
			row('X-Debug', 'true', false),
			row('', 'partial'),
			row('  ', ''),
		];
		let paramRows = [row('page', '1'), row('', '')];
		const context = {
			requestHeadersTab: headers,
			automationTab: automations,
			automationRows: { querySelectorAll: () => headerRows },
			requestParamsTab: params,
			requestAuthorizationTab: makeTab('Authorization'),
			requestBodyTab: makeTab('Body'),
			requestSettingsTab: makeTab('Settings'),
			requestHeadersTable: { querySelectorAll: () => headerRows },
			requestParamsTable: { querySelectorAll: () => paramRows },
			requestBodyFormTable: { querySelectorAll: () => [] },
			requestBody: { value: '' },
			authorizationType: { value: 'none' },
			requestEnvManual: { checked: false },
			manualEnvironmentPath: '',
		};
		runInNewContext(html.slice(start, end) + '; updateRequestTabIndicators();', context);
		assert.strictEqual(headers.counter.textContent, '3');
		assert.strictEqual(headers.counter.hidden, false);
		assert.strictEqual(headers.populated, true);
		assert.strictEqual(headers.label, 'Headers 3, contains values');
		assert.strictEqual(automations.counter.textContent, '3');
		assert.strictEqual(automations.counter.hidden, false);
		assert.strictEqual(automations.populated, true);
		assert.strictEqual(automations.label, 'Automations 3, contains values');
		assert.strictEqual(params.counter.textContent, '1');
		assert.strictEqual(params.counter.hidden, false);
		headerRows = [row('', '')];
		paramRows = [];
		runInNewContext('updateRequestTabIndicators();', context);
		for (const tab of [headers, params, automations]) {
			assert.strictEqual(tab.counter.textContent, '');
			assert.strictEqual(tab.counter.hidden, true);
			assert.strictEqual(tab.populated, false);
		}
		assert.strictEqual(headers.label, 'Headers');
		assert.ok(html.includes('font-size: 0.85em;'));
		assert.ok(html.includes('color: var(--vscode-descriptionForeground);'));
	});
	test('extension setting updates the retrieval preference without changing the current output', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		// Assert
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
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("requestAuthorizationTab.addEventListener('click'");
		const end = html.indexOf("requestHeadersTab.addEventListener('click'", start);
		let click = () => {};
		let active = false;
		let selectedView = 'raw';
		const context = {
			defaultTokenView: 'hidden',
			requestAuthorizationTab: {
				getAttribute: () => String(active),
				addEventListener: (_event: string, callback: () => void) => {
					click = callback;
				},
			},
			showOAuthTokenView: (view: string) => {
				selectedView = view;
			},
			showRequestTab: () => {
				active = true;
			},
			refreshConfiguredOAuthToken: () => {},
			updateOAuthTokenDisplay: () => {},
		};
		runInNewContext(html.slice(start, end), context);
		click();
		// Assert
		assert.strictEqual(selectedView, 'hidden');
		selectedView = 'decoded';
		click();
		assert.strictEqual(selectedView, 'decoded');
	});
	test('description renders compact plain text and offers expansion only when needed', () => {
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf('function renderDescription()');
		const end = html.indexOf('function startDescriptionEdit()', start);
		let toggleHidden = true;
		const attributes: Record<string, string> = {};
		const context = {
			descriptionExpanded: false,
			requestDescription: { value: 'First line\nSecond line' },
			requestDescriptionText: { textContent: '', scrollWidth: 10, clientWidth: 100 },
			descriptionDisplay: { classList: { toggle: () => {} } },
			requestDescriptionToggle: {
				textContent: '',
				setAttribute: (name: string, value: string) => {
					attributes[name] = value;
				},
				classList: {
					toggle: (_name: string, value: boolean) => {
						toggleHidden = value;
					},
				},
			},
			requestAnimationFrame: (callback: () => void) => callback(),
			updateResponseAreaBounds: () => {},
		};
		runInNewContext(html.slice(start, end) + '; renderDescription();', context);
		// Assert
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
		// Arrange
		// Act
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const start = html.indexOf("requestDescription.addEventListener('keydown'");
		const end = html.indexOf("window.addEventListener('resize', renderDescription)", start);
		let handler = (_event: { key: string; shiftKey: boolean; isComposing: boolean; preventDefault: () => void }) => {};
		let blurred = false;
		let prevented = false;
		const context = {
			requestDescription: {
				addEventListener: (_name: string, callback: typeof handler) => {
					handler = callback;
				},
				blur: () => {
					blurred = true;
				},
			},
		};
		runInNewContext(html.slice(start, end), context);
		// Assert
		for (const [shiftKey, isComposing, finish] of [
			[false, false, true],
			[true, false, false],
			[false, true, false],
		]) {
			blurred = false;
			prevented = false;
			handler({
				key: 'Enter',
				shiftKey,
				isComposing,
				preventDefault: () => {
					prevented = true;
				},
			});
			assert.strictEqual(blurred, finish);
			assert.strictEqual(prevented, finish);
		}
	});
});

suite('Streaming response cards', () => {
	test('formats JSON safely, retains plain text and preserves existing disclosure state', () => {
		const html = getWebviewHtml({} as vscode.Webview, '1.2.3');
		const elements = new Map<string, { textContent: string }>();
		const list = {
			children: [] as Record<string, unknown>[],
			replaceChildren() {
				this.children = [];
			},
			append(card: Record<string, unknown>) {
				this.children.push(card);
			},
		};
		const context = {
			streamBody: '',
			streamCount: 0,
			streamExpanded: true,
			streamParser: undefined,
			streamEventList: list,
			streamEvents: { classList: { remove() {} } },
			responseBodyContent: { classList: { add() {} } },
			document: {
				getElementById(id: string) {
					if (!elements.has(id)) {
						elements.set(id, { textContent: '' });
					}
					return elements.get(id);
				},
				createElement() {
					return {
						children: [] as unknown[],
						append(...children: unknown[]) {
							this.children.push(...children);
						},
					};
				},
			},
		};
		const parserStart = html.indexOf('const createEventStreamParser = ');
		const parserEnd = html.indexOf('for (const [id, expanded]', parserStart);
		const highlightStart = html.indexOf('function formatJsonHighlight(content)');
		const highlightEnd = html.indexOf('// Sets formatted response body text', highlightStart);
		const cardsStart = html.indexOf('function beginEventStream()');
		const cardsEnd = html.indexOf('// Chooses formatted JSON response output', cardsStart);
		runInNewContext(
			html.slice(parserStart, parserEnd) +
				html.slice(highlightStart, highlightEnd) +
				html.slice(cardsStart, cardsEnd) +
				'; beginEventStream();',
			context,
		);
		runInNewContext(
			'streamParser(' + JSON.stringify('event: update\ndata: {"text":"<img>","ok":true}\n\n') + ');',
			context,
		);
		assert.strictEqual(list.children.length, 1);
		const first = list.children[0];
		const children = first.children as { textContent?: string; innerHTML?: string }[];
		assert.strictEqual(children[0].textContent, 'Event 1 · update');
		assert.ok(children[1].innerHTML?.includes('&lt;img&gt;'));
		assert.ok(children[1].innerHTML?.includes('json-token-key'));
		assert.ok(children[1].innerHTML?.includes('\n  '));
		first.open = false;
		runInNewContext("streamExpanded = false; streamParser('data: [DONE]\\n\\n');", context);
		assert.strictEqual(list.children[0], first);
		assert.strictEqual(first.open, false);
		assert.strictEqual(list.children[1].open, false);
		assert.strictEqual((list.children[1].children as { textContent: string }[])[1].textContent, '[DONE]');
	});
});
