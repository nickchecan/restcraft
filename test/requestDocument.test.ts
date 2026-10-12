import * as assert from 'assert';
import { createUpdatedRequestDocumentText } from '../src/webview/requestDocument';
import { parseRequestFile } from '../src/request/requestFile';
import type { RequestChangedMessage } from '../src/webview/requestWebview';

suite('OAuth request document persistence', () => {
	const message: RequestChangedMessage = {
		type: 'requestChanged', name: 'OAuth', method: 'GET', url: 'https://example.com/', params: [], body: '',
		headers: { Authorization: 'Bearer sensitive-token', Accept: 'application/json' },
		headerState: [{ name: 'Authorization', value: 'Bearer sensitive-token', enabled: true }],
		authorization: { type: 'oauth2', grantType: 'client_credentials', accessTokenUrl: 'https://example.com/token',
			clientId: 'client', clientSecret: '{{SECRET}}', scope: 'api', storeAccessToken: true, accessTokenVariable: 'MY_TOKEN' },
	};

	test('saves the env reference in both header representations and restores it after parsing', () => {
		const text = createUpdatedRequestDocumentText('{"custom":"preserved"}', message);
		const saved = JSON.parse(text);
		assert.strictEqual(saved.headers.Authorization, 'Bearer {{MY_TOKEN}}');
		assert.deepStrictEqual(saved.headerState, [{ name: 'Authorization', value: 'Bearer {{MY_TOKEN}}', enabled: true }]);
		assert.strictEqual(saved.custom, 'preserved');
		assert.strictEqual(saved.headers.Accept, 'application/json');
		assert.ok(!text.includes('sensitive-token'));
		assert.strictEqual(parseRequestFile(text).headers.Authorization, 'Bearer {{MY_TOKEN}}');
		assert.strictEqual(createUpdatedRequestDocumentText(text, message), text);
	});

	test('persists literal tokens when storage is unchecked', () => {
		const text = createUpdatedRequestDocumentText('{}', { ...message,
			authorization: { ...message.authorization!, storeAccessToken: false } });
		assert.strictEqual(JSON.parse(text).headers.Authorization, 'Bearer sensitive-token');
		assert.deepStrictEqual(JSON.parse(text).headerState, message.headerState);
		assert.strictEqual(parseRequestFile(text).headers.Authorization, 'Bearer sensitive-token');
	});
});
