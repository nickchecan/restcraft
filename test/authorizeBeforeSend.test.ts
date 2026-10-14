import * as assert from 'assert';
import type * as vscode from 'vscode';
import { runInNewContext } from 'vm';
import { getWebviewHtml } from '../src/webview/getWebviewHtml';

suite('Authorize before sending', () => {
	const html = getWebviewHtml({} as vscode.Webview, '1.0.0');
	const submitStart = html.indexOf("form.addEventListener('submit', async");
	const submitEnd = html.indexOf("window.addEventListener('message'", submitStart);

	function setup(enabled = true, authType = 'oauth2') {
		let submit = async (_event: { preventDefault: () => void }) => {};
		let finishAuthorization: (error: string) => void = () => {};
		const messages: { type: string; headers?: Record<string, string> }[] = [];
		let header = 'Bearer old-token';
		let authorizations = 0;
		let cancellations = 0;
		const context = {
			form: {
				addEventListener: (_event: string, callback: typeof submit) => {
					submit = callback;
				},
			},
			authorizationBeforeSendPending: false,
			requestInProgress: false,
			authorizeBeforeSend: { checked: enabled },
			authorizationType: { value: authType },
			send: { disabled: false, textContent: '', innerHTML: '', classList: { add: () => {}, remove: () => {} } },
			buttonIcons: { send: '' },
			workspaceTrusted: true,
			setResponseStatus: () => {},
			authorizeForSend: () => {
				authorizations++;
				return new Promise<string>((resolve) => {
					finishAuthorization = (error) => {
						if (!error) {
							header = 'Bearer new-token';
						}
						resolve(error);
					};
				});
			},
			document: {
				getElementById: () => ({
					click: () => {
						cancellations++;
						finishAuthorization('Token request cancelled.');
					},
				}),
			},
			latestRequestUrl: '',
			activeRequestId: 0,
			startRequestTimer: () => {},
			responseSize: { textContent: '' },
			responseHeaders: { textContent: '' },
			setRawContent: () => {},
			setBodyContent: () => {},
			setPreviewContent: () => {},
			readEnabledRequestUrl: () => 'https://example.com/',
			method: { value: 'GET' },
			readEnabledRequestHeaders: () => ({ Authorization: header }),
			readRequestBodyForSend: () => '',
			vscode: {
				postMessage: (message: { type: string; headers?: Record<string, string> }) => {
					messages.push(message);
				},
			},
		};
		runInNewContext(html.slice(submitStart, submitEnd), context);
		return {
			context,
			messages,
			submit: () => submit({ preventDefault: () => {} }),
			finish: (error = '') => finishAuthorization(error),
			authorizations: () => authorizations,
			cancellations: () => cancellations,
		};
	}

	test('waits for authorization and then sends using the updated header', async () => {
		const state = setup();
		const pending = state.submit();
		assert.strictEqual(state.authorizations(), 1);
		assert.strictEqual(state.messages.length, 0);
		assert.strictEqual(state.context.authorizationBeforeSendPending, true);
		state.finish();
		await pending;
		assert.strictEqual(state.messages.length, 1);
		assert.strictEqual(state.messages[0].type, 'sendRequest');
		assert.strictEqual(state.messages[0].headers?.Authorization, 'Bearer new-token');
		assert.strictEqual(state.context.authorizationBeforeSendPending, false);
	});

	test('does not send when authorization fails or is cancelled', async () => {
		for (const error of ['Invalid Client ID.', 'Token request cancelled.']) {
			const state = setup();
			const pending = state.submit();
			state.finish(error);
			await pending;
			assert.strictEqual(state.messages.length, 0);
			assert.strictEqual(state.context.requestInProgress, false);
			assert.strictEqual(state.context.authorizationBeforeSendPending, false);
		}
	});

	test('clicking Send again while authorizing cancels instead of starting another attempt', async () => {
		const state = setup();
		const pending = state.submit();
		await state.submit();
		await pending;
		assert.strictEqual(state.authorizations(), 1);
		assert.strictEqual(state.cancellations(), 1);
		assert.strictEqual(state.messages.length, 0);
	});

	test('unchecked setting and other authentication types send without fetching a token', async () => {
		for (const [enabled, type] of [
			[false, 'oauth2'],
			[true, 'none'],
			[true, 'basic'],
			[true, 'bearer'],
		] as const) {
			const state = setup(enabled, type);
			await state.submit();
			assert.strictEqual(state.authorizations(), 0);
			assert.strictEqual(state.messages.length, 1);
			assert.strictEqual(state.messages[0].headers?.Authorization, 'Bearer old-token');
		}
	});

	test('token completion resolves after the header update even though the button has already been enabled', async () => {
		const start = html.indexOf('function authorizeForSend()');
		const end = html.indexOf("form.addEventListener('submit'", start);
		const resultStart = html.indexOf("if (message.type === 'oauthTokenResult')");
		const resultEnd = html.indexOf("if (message.type === 'requestComplete')", resultStart);
		for (const outcome of ['success', 'error', 'cancel']) {
			let header = 'old-token';
			const context = {
				oauthPending: false,
				oauthRequestId: 7,
				oauthSendWaiter: undefined as unknown,
				oauthGetToken: {
					disabled: false,
					click: () => {
						context.oauthRequestId++;
						context.oauthPending = true;
						context.oauthGetToken.disabled = true;
					},
				},
				message: {
					type: 'oauthTokenResult',
					requestId: 8,
					token: outcome === 'success' ? 'new-token' : undefined,
					error: outcome === 'error' ? 'Failed' : undefined,
				},
				configuredOAuthTokenRequestId: 0,
				oauthStatus: { textContent: '' },
				authorizationType: { value: 'oauth2' },
				displayedOAuthToken: '',
				oauthToken: '',
				oauthUpdateHeader: { checked: true },
				applyRetrievedOAuthHeader: (token: string) => {
					header = token;
				},
				updateOAuthTokenDisplay: () => {},
				notifyRequestChanged: () => {},
				refreshEnvironmentFile: () => {},
			};
			const pending: Promise<string> = runInNewContext(html.slice(start, end) + '; authorizeForSend();', context);
			if (outcome === 'cancel') {
				context.oauthRequestId++;
				context.oauthPending = false;
				context.oauthGetToken.disabled = false;
			}
			runInNewContext('(function () {' + html.slice(resultStart, resultEnd) + '})();', context);
			assert.strictEqual(
				await pending,
				outcome === 'success' ? '' : outcome === 'error' ? 'Failed' : 'Token request cancelled.',
			);
			assert.strictEqual(header, outcome === 'success' ? 'new-token' : 'old-token');
			assert.strictEqual(context.oauthGetToken.disabled, false);
			assert.strictEqual(context.oauthSendWaiter, undefined);
		}
	});
});
