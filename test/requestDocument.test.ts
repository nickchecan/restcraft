import * as assert from 'assert';
import { createUpdatedRequestDocumentText } from '../src/webview/requestDocument';
import { parseRequestFile } from '../src/request/requestFile';
import type { RequestChangedMessage } from '../src/webview/requestWebview';

suite('OAuth request document persistence', () => {
	const message: RequestChangedMessage = {
		type: 'requestChanged',
		name: 'OAuth',
		method: 'GET',
		url: 'https://example.com/',
		params: [],
		body: '',
		headers: { Authorization: 'Bearer {{MY_TOKEN}}' },
		headerState: [{ name: 'Authorization', value: 'Bearer {{MY_TOKEN}}', enabled: true }],
		authorization: {
			type: 'oauth2',
			grantType: 'client_credentials',
			accessTokenUrl: 'https://example.com/token',
			clientId: 'client',
			clientSecret: '{{SECRET}}',
			scope: 'api',
			storeAccessToken: true,
			accessTokenVariable: 'MY_TOKEN',
		},
	};

	test('persists authorization before sending and removes it when unchecked', () => {
		const saved = createUpdatedRequestDocumentText('{}', { ...message, authorizeBeforeSend: true });
		assert.strictEqual(parseRequestFile(saved).authorizeBeforeSend, true);
		const unchecked = createUpdatedRequestDocumentText(saved, { ...message, authorizeBeforeSend: false });
		assert.strictEqual(parseRequestFile(unchecked).authorizeBeforeSend, undefined);
		assert.strictEqual(JSON.parse(unchecked).authorizeBeforeSend, undefined);
	});

	test('saves the env reference only in headerState and restores it after parsing', () => {
		const text = createUpdatedRequestDocumentText('{"custom":"preserved"}', message);
		const saved = JSON.parse(text);
		assert.strictEqual(saved.headers, undefined);
		assert.deepStrictEqual(saved.headerState, [{ name: 'Authorization', value: 'Bearer {{MY_TOKEN}}', enabled: true }]);
		assert.strictEqual(saved.custom, 'preserved');
		assert.strictEqual(saved.headers, undefined);
		assert.ok(!text.includes('sensitive-token'));
		assert.strictEqual(parseRequestFile(text).headers.Authorization, 'Bearer {{MY_TOKEN}}');
		assert.strictEqual(createUpdatedRequestDocumentText(text, message), text);
	});

	test('persists literal tokens when storage is unchecked', () => {
		const text = createUpdatedRequestDocumentText('{}', {
			...message,
			authorization: { ...message.authorization!, storeAccessToken: false },
			headers: { Authorization: 'Bearer sensitive-token' },
			headerState: [{ name: 'Authorization', value: 'Bearer sensitive-token', enabled: true }],
		});
		assert.strictEqual(JSON.parse(text).headers, undefined);
		assert.strictEqual(JSON.parse(text).headerState[0].value, 'Bearer sensitive-token');
		assert.strictEqual(parseRequestFile(text).headers.Authorization, 'Bearer sensitive-token');
	});
	test('preserves a disabled header value when editing a legacy request', () => {
		const legacy =
			'{"name":"Legacy","method":"GET","url":"https://example.com/","headers":{"Accept":"application/json"}}';
		const change: RequestChangedMessage = {
			...message,
			authorization: undefined,
			headers: { Accept: 'application/json' },
			headerState: [{ name: 'Accept', value: 'application/json', enabled: false }],
		};
		const saved = parseRequestFile(createUpdatedRequestDocumentText(legacy, change));
		assert.deepStrictEqual(saved.headerState, change.headerState);
		assert.strictEqual(saved.headers.Accept, undefined);
	});

	test('keeps an OAuth env header disabled after saving and reopening', () => {
		const change: RequestChangedMessage = {
			...message,
			headerState: [{ name: 'authorization', value: 'Bearer {{MY_TOKEN}}', enabled: false }],
		};
		const saved = parseRequestFile(createUpdatedRequestDocumentText('{}', change));
		assert.deepStrictEqual(saved.headerState, [
			{ name: 'authorization', value: 'Bearer {{MY_TOKEN}}', enabled: false },
		]);
		assert.strictEqual(saved.headers.Authorization, undefined);
	});
	test('saves manual file selection and removes it when returning to nearest mode', () => {
		const change: RequestChangedMessage = { ...message, environment: { mode: 'manual', path: '../config/.env' } };
		const text = createUpdatedRequestDocumentText('{}', change);
		assert.deepStrictEqual(parseRequestFile(text).environment, change.environment);
		const nearest = createUpdatedRequestDocumentText(text, message);
		assert.strictEqual(parseRequestFile(nearest).environment, undefined);
	});
	test('preserves existing headers when automatic OAuth header updates are disabled', () => {
		const change: RequestChangedMessage = {
			...message,
			authorization: { ...message.authorization!, updateAuthorizationHeader: false },
		};
		const saved = parseRequestFile(createUpdatedRequestDocumentText('{}', change));
		assert.deepStrictEqual(saved.headers, change.headers);
		assert.deepStrictEqual(saved.headerState, change.headerState);
		assert.strictEqual(saved.authorization?.updateAuthorizationHeader, false);
		const empty = parseRequestFile(createUpdatedRequestDocumentText('{}', { ...change, headers: {}, headerState: [] }));
		assert.deepStrictEqual(empty.headers, {});
		assert.deepStrictEqual(empty.headerState, []);
	});
	test('toggling token storage preserves the previously applied Authorization header', () => {
		for (const value of ['Bearer {{OLD_TOKEN}}', 'Bearer previously-retrieved-token']) {
			for (const storeAccessToken of [false, true]) {
				const change: RequestChangedMessage = {
					...message,
					headers: { Authorization: value },
					headerState: [{ name: 'Authorization', value, enabled: true }],
					authorization: { ...message.authorization!, storeAccessToken, accessTokenVariable: 'NEW_TOKEN' },
				};
				const saved = parseRequestFile(createUpdatedRequestDocumentText('{}', change));
				assert.strictEqual(saved.headers.Authorization, value);
				assert.strictEqual(saved.headerState[0].value, value);
			}
		}
	});
	test('removes old per-request token view settings when saving', () => {
		const text = createUpdatedRequestDocumentText('{"defaultTokenView":"hidden"}', message);
		assert.strictEqual(JSON.parse(text).defaultTokenView, undefined);
		assert.strictEqual(JSON.parse(text).displayedOAuthToken, undefined);
	});
	test('persists optional multiline descriptions and removes them when cleared', () => {
		const description = 'API context\n<example> {{not_a_request_variable}}';
		const text = createUpdatedRequestDocumentText('{}', { ...message, description });
		assert.strictEqual(parseRequestFile(text).description, description);
		assert.strictEqual(
			JSON.parse(createUpdatedRequestDocumentText(text, { ...message, description: '' })).description,
			undefined,
		);
		assert.throws(
			() =>
				parseRequestFile(
					JSON.stringify({ name: 'Description', method: 'GET', url: 'https://example.com/', description: 123 }),
				),
			/description/,
		);
	});
});
