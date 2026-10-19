import * as assert from 'assert';
import { readWebviewMessage } from '../../src/webview/webviewMessage';

const changed = {
	type: 'requestChanged' as const,
	name: 'List users',
	method: 'GET',
	url: 'https://example.com/users',
	params: [{ name: 'q', value: '1', enabled: false }],
	headerState: [{ name: 'Accept', value: 'application/json', enabled: true }],
	headers: { Accept: 'application/json' },
	body: '',
};

const oauth = {
	type: 'getOAuthToken' as const,
	requestId: 4,
	url: 'https://example.com/token',
	clientId: 'client',
	clientSecret: 'secret',
	scope: 'read',
};

suite('Webview message boundary', () => {
	test('accepts the messages the workbench sends and keeps their fields', () => {
		const accepted = [
			{ type: 'webviewReady' },
			{ type: 'getOAuthRedirect' },
			{ type: 'copyOAuthRedirect' },
			{ type: 'copyOAuthToken', token: 'access-token' },
			{ type: 'openEnvironmentFile' },
			{ type: 'cancelOAuthToken' },
			{ type: 'openXProfile' },
			{ type: 'openRepository' },
			{ type: 'openIssues' },
			{ type: 'openNetworkLog' },
			{ type: 'openNetworkHistory' },
			{ type: 'openSettings' },
			{ type: 'sendRequest', requestId: 0, method: 'GET', url: 'https://example.com' },
			{
				type: 'sendRequest',
				requestId: 1,
				method: 'POST',
				url: 'https://example.com',
				body: '{}',
				headers: { Accept: 'application/json' },
			},
			{ type: 'cancelRequest', requestId: 1 },
			{ type: 'chooseEnvironmentFile', requestId: 2 },
			{ type: 'getConfiguredOAuthToken', requestId: 3, authorization: 'Bearer {{TOKEN}}' },
			{ type: 'getEnvironmentFile', requestId: 3 },
			{ type: 'getEnvironmentFile', requestId: 3, environment: { mode: 'manual', path: '.env' } },
			{ type: 'resolveEnvironmentVariable', requestId: 5, name: 'TOKEN' },
			{ type: 'checkEnvironmentVariables', requestId: 5, names: ['TOKEN', 'BASE_URL'] },
			changed,
			{ ...oauth, grantType: 'authorization_code', clientAuthentication: 'basic', usePkce: false },
			oauth,
		];

		for (const message of accepted) {
			assert.deepStrictEqual(readWebviewMessage(message), message, JSON.stringify(message));
		}
	});

	test('ignores malformed messages instead of treating them as a send', () => {
		const names = Array.from({ length: 101 }, () => 'TOKEN');
		const rejected = [
			null,
			[],
			'webviewReady',
			{ type: 'nope' },
			{ type: 'sendRequest' },
			{ type: 'sendRequest', requestId: 1.5, method: 'GET', url: 'https://example.com' },
			{ type: 'sendRequest', requestId: Number.NaN, method: 'GET', url: 'https://example.com' },
			{ type: 'sendRequest', requestId: 1, method: 'GET', url: 'https://example.com', headers: { Accept: 1 } },
			{ type: 'copyOAuthToken' },
			{ type: 'copyOAuthToken', token: '' },
			{ ...oauth, requestId: -1 },
			{ ...oauth, clientAuthentication: 'bearer' },
			{ type: 'resolveEnvironmentVariable', requestId: 1, name: '1TOKEN' },
			{ type: 'checkEnvironmentVariables', requestId: 1, names },
			{ type: 'checkEnvironmentVariables', requestId: 1, names: ['ok', 'bad-name'] },
			{ type: 'getEnvironmentFile', requestId: 1, environment: { mode: 'remote', path: '.env' } },
			{ ...changed, params: [{ name: 'q', value: '1' }] },
			{ ...changed, body: null },
			{ ...changed, headers: { Accept: 1 } },
		];

		for (const message of rejected) {
			assert.strictEqual(readWebviewMessage(message), undefined, JSON.stringify(message));
		}
	});
});
