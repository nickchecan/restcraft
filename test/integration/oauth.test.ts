import * as assert from 'assert';
import { buildOAuthTokenRequest, readOAuthAccessToken, headersForPersistence } from '../../src/request/oauth';
import { ApiResponse } from '../../src/request/types';

suite('OAuth client credentials', () => {
	const fields = {
		url: 'https://example.com/token',
		clientId: 'client:+ ä',
		clientSecret: 'secret:&+',
		scope: 'read write',
	};
	const response = (body: string, status = 200): ApiResponse => ({ status, body, statusText: '', headers: {} });

	test('encodes credentials separately and includes optional scope', () => {
		// Arrange
		// Act
		const request = buildOAuthTokenRequest(fields);
		// Assert
		assert.strictEqual(request.method, 'POST');
		assert.strictEqual(request.headers?.['Content-Type'], 'application/x-www-form-urlencoded');
		const credentials = Buffer.from(request.headers!.Authorization.slice(6), 'base64').toString('utf8');
		assert.strictEqual(credentials, 'client%3A%2B+%C3%A4:secret%3A%26%2B');
		assert.strictEqual(request.body, 'grant_type=client_credentials&scope=read+write');
		assert.strictEqual(buildOAuthTokenRequest({ ...fields, scope: '' }).body, 'grant_type=client_credentials');
	});

	test('rejects insecure URLs and missing credentials before execution', () => {
		// Arrange
		// Act
		const actionUnderTest = () => buildOAuthTokenRequest({ ...fields, url: 'http://example.com/token' });

		// Assert
		assert.throws(actionUnderTest, /HTTPS/);
		assert.throws(() => buildOAuthTokenRequest({ ...fields, clientSecret: '' }), /Client Secret/);
		assert.throws(() => buildOAuthTokenRequest({ ...fields, url: 'invalid' }), /valid Access Token URL/);
	});

	test('accepts bearer tokens and rejects unusable responses without exposing their body', () => {
		// Arrange
		// Inputs are supplied directly to the operation below.

		// Act
		const actual = readOAuthAccessToken(response('{"access_token":"abc", "token_type":"Bearer"}'));

		// Assert
		assert.strictEqual(actual, 'abc');
		assert.throws(() => readOAuthAccessToken(response('secret details', 401)), /HTTP 401/);
		assert.throws(() => readOAuthAccessToken(response('not JSON')), /invalid JSON/);
		for (const body of [
			'{}',
			'{"access_token":"", "token_type":"bearer"}',
			'{"access_token":"abc", "token_type":"mac"}',
		]) {
			assert.throws(() => readOAuthAccessToken(response(body)), /access_token/);
		}
	});
	test('preserves header rows while OAuth configuration changes', () => {
		// Arrange
		const authorization = {
			type: 'oauth2' as const,
			grantType: 'client_credentials' as const,
			accessTokenUrl: '',
			clientId: '',
			clientSecret: '',
			scope: '',
		};
		const headers = { authorization: 'Bearer private-token', Accept: 'application/json' };
		const state = [{ name: 'AUTHORIZATION', value: 'Bearer private-token', enabled: true }];
		// Act
		const actionUnderTest = headersForPersistence(headers, state, authorization);

		// Assert
		assert.deepStrictEqual(actionUnderTest, {
			headers,
			headerState: state,
		});
		const persisted = headersForPersistence(headers, state, {
			...authorization,
			storeAccessToken: true,
			accessTokenVariable: 'MY_TOKEN',
		});
		assert.strictEqual(persisted.headers.authorization, 'Bearer private-token');
		assert.strictEqual(persisted.headerState[0].value, 'Bearer private-token');
		assert.deepStrictEqual(persisted, { headers, headerState: state });
		assert.deepStrictEqual(headersForPersistence(headers, state), { headers, headerState: state });
	});
});
