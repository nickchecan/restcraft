import * as assert from 'assert';

import { createDefaultRequestFileContent, createRequestFileName } from '../src/request/createRequestFile';
import { isRequestFileName, parseRequestFile } from '../src/request/requestFile';

suite('Request file parser', () => {
	for (const grantType of ['client_credentials', 'authorization_code']) {
		test(`round-trips OAuth settings for ${grantType}`, () => {
			const authorization = { type: 'oauth2', grantType, accessTokenUrl: '',
				clientId: 'm2m', clientSecret: '{{CLIENT_SECRET}}', scope: 'api',
                storeAccessToken: true, accessTokenVariable: 'MY_TOKEN' };
			const content = { name: 'OAuth', method: 'GET', url: 'https://example.com/', authorization };
			const request = parseRequestFile(JSON.stringify(content));
			assert.deepStrictEqual(request.authorization, authorization);
			assert.deepStrictEqual(parseRequestFile(JSON.stringify(request)).authorization, authorization);
		});
	}

	test('rejects malformed OAuth settings', () => {
		const authorization = { type: 'oauth2', grantType: 'client_credentials', accessTokenUrl: '',
			clientId: '', clientSecret: '', scope: '' };
		for (const invalid of [null, {}, { ...authorization, grantType: 'password' },
			{ ...authorization, clientSecret: 123 }, { ...authorization, scope: null }]) {
			assert.throws(() => parseRequestFile(JSON.stringify({ name: 'OAuth', method: 'GET',
				url: 'https://example.com/', authorization: invalid })), /authorization/);
		}
	});

	test('round-trips manual environment selection and rejects invalid settings', () => {
		const request = { name: 'Manual env', method: 'GET', url: 'https://example.com/',
			environment: { mode: 'manual', path: '../config/.env' } };
		const parsed = parseRequestFile(JSON.stringify(request));
		assert.deepStrictEqual(parsed.environment, request.environment);
		assert.deepStrictEqual(parseRequestFile(JSON.stringify(parsed)).environment, request.environment);
		for (const environment of [null, { mode: 'unknown', path: '' }, { mode: 'manual', path: 123 }]) {
			assert.throws(() => parseRequestFile(JSON.stringify({ ...request, environment })), /environment/);
		}
	});

	test('parses a valid request file', () => {
		const request = parseRequestFile(JSON.stringify({
			name: 'Get Users',
			method: 'GET',
			url: 'https://jsonplaceholder.typicode.com/users',
			params: [],
			headerState: [
				{
					name: 'Accept',
					value: 'application/json',
					enabled: true,
				},
			],
			headers: {
				Accept: 'application/json',
			},
			body: null,
		}));

		assert.deepStrictEqual(request, {
			name: 'Get Users',
			method: 'GET',
			url: 'https://jsonplaceholder.typicode.com/users',
			params: [],
			headerState: [
				{
					name: 'Accept',
					value: 'application/json',
					enabled: true,
				},
			],
			headers: {
				Accept: 'application/json',
			},
			body: null,
		});
	});

	test('parses persisted request headers with enabled flags', () => {
		const request = parseRequestFile(JSON.stringify({
			name: 'Create User',
			method: 'POST',
			url: 'https://api.example.com/users',
			params: [],
			headerState: [
				{
					name: 'Accept',
					value: 'application/json',
					enabled: true,
				},
				{
					name: 'X-Debug',
					value: '1',
					enabled: false,
				},
			],
			headers: {
				Accept: 'application/json',
				'X-Debug': '1',
			},
			body: null,
		}));

		assert.deepStrictEqual(request.headerState, [
			{
				name: 'Accept',
				value: 'application/json',
				enabled: true,
			},
			{
				name: 'X-Debug',
				value: '1',
				enabled: false,
			},
		]);
	});

	test('backfills enabled header state from legacy headers', () => {
		const request = parseRequestFile(JSON.stringify({
			name: 'Create User',
			method: 'POST',
			url: 'https://api.example.com/users',
			params: [],
			headers: {
				Accept: 'application/json',
				'X-Trace': 'abc',
			},
			body: null,
		}));

		assert.deepStrictEqual(request.headerState, [
			{
				name: 'Accept',
				value: 'application/json',
				enabled: true,
			},
			{
				name: 'X-Trace',
				value: 'abc',
				enabled: true,
			},
		]);
	});

	test('parses persisted query params with enabled flags', () => {
		const request = parseRequestFile(JSON.stringify({
			name: 'Search Users',
			method: 'GET',
			url: 'https://api.example.com/users?active=true',
			params: [
				{
					name: 'active',
					value: 'true',
					enabled: true,
				},
				{
					name: 'debug',
					value: '1',
					enabled: false,
				},
			],
			headers: {},
			body: null,
		}));

		assert.deepStrictEqual(request.params, [
			{
				name: 'active',
				value: 'true',
				enabled: true,
			},
			{
				name: 'debug',
				value: '1',
				enabled: false,
			},
		]);
	});

	test('backfills enabled params from legacy URLs', () => {
		const request = parseRequestFile(JSON.stringify({
			name: 'Search Users',
			method: 'GET',
			url: 'https://api.example.com/users?page=1&sort=name',
			headers: {},
			body: null,
		}));

		assert.deepStrictEqual(request.params, [
			{
				name: 'page',
				value: '1',
				enabled: true,
			},
			{
				name: 'sort',
				value: 'name',
				enabled: true,
			},
		]);
	});

	test('requires query param enabled flags to be booleans', () => {
		assert.throws(
			() => parseRequestFile(JSON.stringify({
				name: 'Search Users',
				method: 'GET',
				url: 'https://api.example.com/users',
				params: [
					{
						name: 'debug',
						value: '1',
						enabled: 'false',
					},
				],
				headers: {},
				body: null,
			})),
			/must have a boolean enabled flag/,
		);
	});

	test('reports invalid JSON clearly', () => {
		assert.throws(
			() => parseRequestFile('{ "name": '),
			/Invalid JSON:/,
		);
	});

	test('requires http or https URLs', () => {
		assert.throws(
			() => parseRequestFile(JSON.stringify({
				name: 'Local file',
				method: 'GET',
				url: 'file:///tmp/example',
				headers: {},
				body: null,
			})),
			/must use http or https/,
		);
	});

	test('matches request file names', () => {
		assert.strictEqual(isRequestFileName('/workspace/get-users.api.json'), true);
		assert.strictEqual(isRequestFileName('/workspace/get-users.json'), false);
	});

	test('creates canonical request file names from user input', () => {
		assert.strictEqual(createRequestFileName('get-users'), 'get-users.api.json');
		assert.strictEqual(createRequestFileName(' get-users.api.json '), 'get-users.api.json');
	});

	test('rejects path-like request file names', () => {
		assert.throws(
			() => createRequestFileName('requests/get-users'),
			/cannot include path separators/,
		);
	});

	test('creates parseable default request file content', () => {
		const request = parseRequestFile(createDefaultRequestFileContent('get-users.api.json'));

		assert.deepStrictEqual(request, {
			name: 'get-users',
			method: 'GET',
			url: 'https://example.com/',
			params: [],
			headerState: [],
			headers: {},
			body: null,
		});
	});
});
