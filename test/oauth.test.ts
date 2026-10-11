import * as assert from 'assert';
import { buildOAuthTokenRequest, readOAuthAccessToken } from '../src/request/oauth';
import { ApiResponse } from '../src/request/types';

suite('OAuth client credentials', () => {
	const fields = { url: 'https://example.com/token', clientId: 'client:+ ä', clientSecret: 'secret:&+', scope: 'read write' };
	const response = (body: string, status = 200): ApiResponse => ({ status, body, statusText: '', headers: {} });

	test('encodes credentials separately and includes optional scope', () => {
		const request = buildOAuthTokenRequest(fields);
		assert.strictEqual(request.method, 'POST');
		assert.strictEqual(request.headers?.['Content-Type'], 'application/x-www-form-urlencoded');
		const credentials = Buffer.from(request.headers!.Authorization.slice(6), 'base64').toString('utf8');
		assert.strictEqual(credentials, 'client%3A%2B+%C3%A4:secret%3A%26%2B');
		assert.strictEqual(request.body, 'grant_type=client_credentials&scope=read+write');
		assert.strictEqual(buildOAuthTokenRequest({ ...fields, scope: '' }).body, 'grant_type=client_credentials');
	});

	test('rejects insecure URLs and missing credentials before execution', () => {
		assert.throws(() => buildOAuthTokenRequest({ ...fields, url: 'http://example.com/token' }), /HTTPS/);
		assert.throws(() => buildOAuthTokenRequest({ ...fields, clientSecret: '' }), /Client Secret/);
		assert.throws(() => buildOAuthTokenRequest({ ...fields, url: 'invalid' }), /valid Access Token URL/);
	});

	test('accepts bearer tokens and rejects unusable responses without exposing their body', () => {
		assert.strictEqual(readOAuthAccessToken(response('{"access_token":"abc", "token_type":"Bearer"}')), 'abc');
		assert.throws(() => readOAuthAccessToken(response('secret details', 401)), /HTTP 401/);
		assert.throws(() => readOAuthAccessToken(response('not JSON')), /invalid JSON/);
		for (const body of ['{}', '{"access_token":"", "token_type":"bearer"}', '{"access_token":"abc", "token_type":"mac"}']) {
			assert.throws(() => readOAuthAccessToken(response(body)), /access_token/);
		}
	});
});
