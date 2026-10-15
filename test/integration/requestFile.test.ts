import * as assert from 'assert';

import { createDefaultRequestFileContent, createRequestFileName } from '../../src/request/createRequestFile';
import { isRequestFileName, parseRequestFile } from '../../src/request/requestFile';

suite('Request file parser', () => {
	for (const grantType of ['client_credentials', 'authorization_code']) {
		test(`round-trips OAuth settings for ${grantType}`, () => {
			// Arrange
			const authorization = {
				type: 'oauth2',
				grantType,
				accessTokenUrl: '',
				clientId: 'm2m',
				clientSecret: '{{CLIENT_SECRET}}',
				scope: 'api',
				storeAccessToken: true,
				accessTokenVariable: 'MY_TOKEN',
			};
			const content = { name: 'OAuth', method: 'GET', url: 'https://example.com/', authorization };
			// Act
			const request = parseRequestFile(JSON.stringify(content));
			// Assert
			assert.deepStrictEqual(request.authorization, authorization);
			assert.deepStrictEqual(parseRequestFile(JSON.stringify(request)).authorization, authorization);
		});
	}

	test('round-trips Authorization Code options without transient callback values', () => {
		// Arrange
		const authorization = {
			type: 'oauth2',
			grantType: 'authorization_code',
			accessTokenUrl: 'https://example.com/token',
			clientId: 'public-client',
			clientSecret: '',
			scope: 'api',
			authorizationUrl: 'https://example.com/authorize',
			clientAuthentication: 'none',
			usePkce: true,
			state: 'my-custom-state',
		};
		const request = {
			name: 'Code',
			method: 'GET',
			url: 'https://example.com/',
			authorization: { ...authorization, redirectUrl: 'vscode://temporary', codeVerifier: 'temporary' },
		};
		// Act
		const actionUnderTest = parseRequestFile(JSON.stringify(request)).authorization;

		// Assert
		assert.deepStrictEqual(actionUnderTest, authorization);
		assert.deepStrictEqual(
			parseRequestFile(JSON.stringify(parseRequestFile(JSON.stringify(request)))).authorization,
			authorization,
		);
		for (const invalid of [
			{ authorizationUrl: 12 },
			{ clientAuthentication: 'invalid' },
			{ usePkce: 'true' },
			{ state: 123 },
		]) {
			assert.throws(
				() => parseRequestFile(JSON.stringify({ ...request, authorization: { ...authorization, ...invalid } })),
				/authorization/,
			);
		}
	});

	test('round-trips the request authorization-before-send flag and rejects invalid values', () => {
		// Arrange
		const request = { name: 'Automatic auth', method: 'GET', url: 'https://example.com/' };
		// Act
		for (const authorizeBeforeSend of [true, false]) {
			assert.strictEqual(
				parseRequestFile(JSON.stringify({ ...request, authorizeBeforeSend })).authorizeBeforeSend,
				authorizeBeforeSend,
			);
		}
		// Assert
		assert.strictEqual(parseRequestFile(JSON.stringify(request)).authorizeBeforeSend, undefined);
		for (const authorizeBeforeSend of ['true', 1, null]) {
			assert.throws(() => parseRequestFile(JSON.stringify({ ...request, authorizeBeforeSend })), /authorizeBeforeSend/);
		}
	});

	test('rejects malformed OAuth settings', () => {
		// Arrange
		const authorization = {
			type: 'oauth2',
			grantType: 'client_credentials',
			accessTokenUrl: '',
			clientId: '',
			clientSecret: '',
			scope: '',
		};
		// Act
		// Assert
		for (const invalid of [
			null,
			{},
			{ ...authorization, grantType: 'password' },
			{ ...authorization, clientSecret: 123 },
			{ ...authorization, scope: null },
		]) {
			assert.throws(
				() =>
					parseRequestFile(
						JSON.stringify({ name: 'OAuth', method: 'GET', url: 'https://example.com/', authorization: invalid }),
					),
				/authorization/,
			);
		}
	});

	test('round-trips manual environment selection and rejects invalid settings', () => {
		// Arrange
		const request = {
			name: 'Manual env',
			method: 'GET',
			url: 'https://example.com/',
			environment: { mode: 'manual', path: '../config/.env' },
		};
		// Act
		const parsed = parseRequestFile(JSON.stringify(request));
		// Assert
		assert.deepStrictEqual(parsed.environment, request.environment);
		assert.deepStrictEqual(parseRequestFile(JSON.stringify(parsed)).environment, request.environment);
		for (const environment of [null, { mode: 'unknown', path: '' }, { mode: 'manual', path: 123 }]) {
			assert.throws(() => parseRequestFile(JSON.stringify({ ...request, environment })), /environment/);
		}
	});

	test('derives execution headers from enabled state and ignores redundant legacy values', () => {
		// Arrange
		// Act
		const parsed = parseRequestFile(
			JSON.stringify({
				name: 'Headers',
				method: 'GET',
				url: 'https://example.com/',
				headers: { Authorization: 'outdated' },
				headerState: [
					{ name: 'Authorization', value: 'Bearer {{TOKEN}}', enabled: false },
					{ name: 'Accept', value: 'application/json', enabled: true },
				],
			}),
		);
		// Assert
		assert.deepStrictEqual(parsed.headers, { Accept: 'application/json' });
		assert.strictEqual(parsed.headerState[0].value, 'Bearer {{TOKEN}}');
		const content = createDefaultRequestFileContent('new.api.json');
		assert.strictEqual(JSON.parse(content).headers, undefined);
	});

	test('parses a valid request file', () => {
		// Arrange
		// Act
		const request = parseRequestFile(
			JSON.stringify({
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
			}),
		);

		// Assert
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
		// Arrange
		// Act
		const request = parseRequestFile(
			JSON.stringify({
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
			}),
		);

		// Assert
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
		// Arrange
		// Act
		const request = parseRequestFile(
			JSON.stringify({
				name: 'Create User',
				method: 'POST',
				url: 'https://api.example.com/users',
				params: [],
				headers: {
					Accept: 'application/json',
					'X-Trace': 'abc',
				},
				body: null,
			}),
		);

		// Assert
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
		// Arrange
		// Act
		const request = parseRequestFile(
			JSON.stringify({
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
			}),
		);

		// Assert
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
		// Arrange
		// Act
		const request = parseRequestFile(
			JSON.stringify({
				name: 'Search Users',
				method: 'GET',
				url: 'https://api.example.com/users?page=1&sort=name',
				headers: {},
				body: null,
			}),
		);

		// Assert
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
		// Arrange
		// Act
		const actionUnderTest = () =>
			parseRequestFile(
				JSON.stringify({
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
				}),
			);

		// Assert
		assert.throws(actionUnderTest, /must have a boolean enabled flag/);
	});

	test('reports invalid JSON clearly', () => {
		// Arrange
		// Act
		const actionUnderTest = () => parseRequestFile('{ "name": ');

		// Assert
		assert.throws(actionUnderTest, /Invalid JSON:/);
	});

	test('requires http or https URLs', () => {
		// Arrange
		// Act
		const actionUnderTest = () =>
			parseRequestFile(
				JSON.stringify({
					name: 'Local file',
					method: 'GET',
					url: 'file:///tmp/example',
					headers: {},
					body: null,
				}),
			);

		// Assert
		assert.throws(actionUnderTest, /must use http or https/);
	});

	test('matches request file names', () => {
		// Arrange
		// Inputs are supplied directly to the operation below.

		// Act
		const actual = isRequestFileName('/workspace/get-users.api.json');

		// Assert
		assert.strictEqual(actual, true);
		assert.strictEqual(isRequestFileName('/workspace/get-users.json'), false);
	});

	test('creates canonical request file names from user input', () => {
		// Arrange
		// Inputs are supplied directly to the operation below.

		// Act
		const actual = createRequestFileName('get-users');

		// Assert
		assert.strictEqual(actual, 'get-users.api.json');
		assert.strictEqual(createRequestFileName(' get-users.api.json '), 'get-users.api.json');
	});

	test('rejects path-like request file names', () => {
		// Arrange
		// Act
		const actionUnderTest = () => createRequestFileName('requests/get-users');

		// Assert
		assert.throws(actionUnderTest, /cannot include path separators/);
	});

	test('creates parseable default request file content', () => {
		// Arrange
		// Act
		const request = parseRequestFile(createDefaultRequestFileContent('get-users.api.json'));

		// Assert
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
