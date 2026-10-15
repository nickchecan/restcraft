import * as assert from 'assert';
import {
	AuthorizationCodeCallbacks,
	AuthorizationCodeFields,
	buildAuthorizationUrl,
	buildAuthorizationCodeTokenRequest,
	createPkce,
	pkceChallenge,
	retrieveAuthorizationCodeToken,
} from '../../src/request/authorizationCode';
import { executeRequest } from '../../src/request/requestRunner';

suite('OAuth Authorization Code', () => {
	const fields: AuthorizationCodeFields = {
		url: 'https://provider.example/token',
		authorizationUrl: 'https://provider.example/authorize',
		clientId: 'public-client',
		clientSecret: '',
		scope: 'api read',
		state: 'user-state',
		usePkce: true,
		clientAuthentication: 'none',
	};
	const redirect = 'vscode://nickchecan.restcraft/oauth/callback?windowId=4';
	const browserCallback = (url: string, code: string) =>
		new URLSearchParams({
			state: new URL(url).searchParams.get('state')!,
			code,
		}).toString();

	test('PKCE matches the standard S256 example and generates fresh URL-safe verifiers', () => {
		// Arrange
		// Inputs are supplied directly to the operation below.

		// Act
		const actual = pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');

		// Assert
		assert.strictEqual(actual, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
		const first = createPkce();
		const second = createPkce();
		assert.match(first.verifier, /^[A-Za-z0-9_-]{43}$/);
		assert.notStrictEqual(first.verifier, second.verifier);
		assert.strictEqual(first.challenge, pkceChallenge(first.verifier));
	});

	test('authorization URL preserves provider options, overrides protocol values, and excludes secrets', () => {
		// Arrange
		// Act
		const url = new URL(
			buildAuthorizationUrl(
				{
					...fields,
					clientSecret: 'private',
					authorizationUrl:
						fields.authorizationUrl + '?audience=api&state=old&client_secret=old&response_mode=form_post',
				},
				redirect,
				'challenge',
			),
		);
		// Assert
		assert.strictEqual(url.searchParams.get('audience'), 'api');
		assert.strictEqual(url.searchParams.get('redirect_uri'), redirect);
		assert.strictEqual(url.searchParams.get('state'), fields.state);
		assert.strictEqual(url.searchParams.get('response_type'), 'code');
		assert.strictEqual(url.searchParams.get('response_mode'), 'query');
		assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256');
		assert.strictEqual(url.searchParams.get('code_challenge'), 'challenge');
		assert.ok(!url.searchParams.has('client_secret'));
		const nestedRedirect = 'https://callback.example/oauth?windowId=4&route=a%2Bb';
		const encoded = new URL(buildAuthorizationUrl({ ...fields, state: 'a-b_c.~' }, nestedRedirect, 'challenge'));
		assert.strictEqual(encoded.searchParams.get('redirect_uri'), nestedRedirect);
		assert.strictEqual(encoded.searchParams.get('state'), 'a-b_c.~');
		const emptyState = new URL(buildAuthorizationUrl({ ...fields, state: '' }, redirect, 'challenge'));
		assert.ok(!emptyState.searchParams.has('state'));
	});

	test('code exchange supports None, Basic, and body authentication with the exact callback URI', () => {
		// Arrange
		// Act
		for (const clientAuthentication of ['none', 'basic', 'body'] as const) {
			const request = buildAuthorizationCodeTokenRequest(
				{ ...fields, clientAuthentication, clientSecret: 's:e+c' },
				redirect,
				'returned-code',
				'verifier',
			);
			const body = new URLSearchParams(request.body);
			assert.strictEqual(body.get('grant_type'), 'authorization_code');
			assert.strictEqual(body.get('redirect_uri'), redirect);
			assert.strictEqual(body.get('code'), 'returned-code');
			assert.strictEqual(body.get('code_verifier'), 'verifier');
			if (clientAuthentication === 'basic') {
				assert.ok(request.headers?.Authorization.startsWith('Basic '));
				assert.ok(!body.has('client_secret'));
				assert.strictEqual(
					Buffer.from(request.headers!.Authorization.slice(6), 'base64').toString(),
					'public-client:s%3Ae%2Bc',
				);
			} else {
				assert.strictEqual(body.get('client_id'), fields.clientId);
				assert.strictEqual(body.get('client_secret'), clientAuthentication === 'body' ? 's:e+c' : null);
				assert.ok(!request.headers?.Authorization);
			}
		}
		const noPkce = buildAuthorizationCodeTokenRequest({ ...fields, usePkce: false }, redirect, 'code');
		// Assert
		assert.ok(!new URLSearchParams(noPkce.body).has('code_verifier'));
	});

	test('body authentication allows an empty secret and omits it from the token request', () => {
		const publicFields = { ...fields, clientAuthentication: 'body' as const, clientSecret: '' };
		assert.doesNotThrow(() => buildAuthorizationUrl(publicFields, redirect, 'challenge'));
		const request = buildAuthorizationCodeTokenRequest(publicFields, redirect, 'code', 'verifier');
		const body = new URLSearchParams(request.body);
		assert.strictEqual(body.get('client_id'), fields.clientId);
		assert.strictEqual(body.has('client_secret'), false);
		assert.strictEqual(body.get('code'), 'code');
		assert.strictEqual(body.get('code_verifier'), 'verifier');
		assert.strictEqual(request.headers?.Authorization, undefined);
	});

	test('invalid fields fail before opening a browser or exchanging codes', () => {
		// Arrange
		// Act
		// Assert
		for (const invalid of [
			{ url: 'http://provider.example/token' },
			{ authorizationUrl: 'invalid' },
			{ clientId: '' },
			{ clientAuthentication: 'basic' as const, clientSecret: '' },
			{ usePkce: false, state: '' },
			{ state: 'a+b & c' },
		]) {
			assert.throws(() => buildAuthorizationUrl({ ...fields, ...invalid }, redirect, 'challenge'));
		}
	});

	test('callbacks match state, reject ambiguous parameters, and consume codes once', async () => {
		// Arrange
		const callbacks = new AuthorizationCodeCallbacks();
		const controller = new AbortController();
		// Act
		const pending = callbacks.waitForCode('expected', controller.signal);
		// Assert
		assert.strictEqual(callbacks.handleCallback('state=wrong&code=secret-code'), false);
		assert.strictEqual(callbacks.handleCallback('state=expected&state=other&code=secret-code'), false);
		assert.strictEqual(callbacks.handleCallback('state=expected&code=accepted-code'), true);
		assert.strictEqual(await pending, 'accepted-code');
		assert.strictEqual(callbacks.handleCallback('state=expected&code=replayed'), false);
		callbacks.dispose();
	});

	test('provider failures, cancellation, timeout, malformed callbacks, and duplicate states clean up attempts', async () => {
		// Arrange
		const callbacks = new AuthorizationCodeCallbacks();
		let controller = new AbortController();
		// Act
		let pending = callbacks.waitForCode('state', controller.signal);
		// Assert
		assert.throws(() => callbacks.waitForCode('state', new AbortController().signal), /Another authorization/);
		callbacks.handleCallback('state=state&error=access_denied&error_description=secret');
		await assert.rejects(
			pending,
			(error) => error instanceof Error && /denied/.test(error.message) && !error.message.includes('secret'),
		);
		pending = callbacks.waitForCode('state', controller.signal);
		controller.abort();
		await assert.rejects(pending, /cancelled/);
		controller = new AbortController();
		pending = callbacks.waitForCode('state', controller.signal);
		callbacks.handleCallback('state=state&code=retry-code');
		assert.strictEqual(await pending, 'retry-code');
		await assert.rejects(callbacks.waitForCode('fresh-state', controller.signal, 5), /timed out/);
		pending = callbacks.waitForCode('fresh-state', controller.signal);
		callbacks.handleCallback('state=fresh-state&code=a&code=b');
		await assert.rejects(pending, /valid code/);
		pending = callbacks.waitForCode('fresh-state', controller.signal);
		callbacks.dispose();
		await assert.rejects(pending, /cancelled/);
	});

	test('browser callback and token exchange use matching PKCE and callback URL without real network calls', async () => {
		// Arrange
		const callbacks = new AuthorizationCodeCallbacks();
		let challenge = '';
		let exchanged = false;
		// Act
		const token = await retrieveAuthorizationCodeToken(
			fields,
			{
				callbacks,
				getRedirectUri: async () => redirect,
				openBrowser: async (url) => {
					const params = new URL(url).searchParams;
					challenge = params.get('code_challenge')!;
					assert.strictEqual(params.get('redirect_uri'), redirect);
					callbacks.handleCallback(browserCallback(url, 'test-code'));
					return true;
				},
				exchange: async (request) => {
					exchanged = true;
					const body = new URLSearchParams(request.body);
					assert.strictEqual(body.get('redirect_uri'), redirect);
					assert.strictEqual(pkceChallenge(body.get('code_verifier')!), challenge);
					assert.strictEqual(body.get('code'), 'test-code');
					return {
						status: 200,
						statusText: 'OK',
						headers: {},
						body: '{"access_token":"test-token","token_type":"Bearer"}',
					};
				},
			},
			new AbortController().signal,
		);
		// Assert
		assert.strictEqual(token, 'test-token');
		assert.strictEqual(exchanged, true);
		assert.strictEqual(callbacks.handleCallback('state=user-state&code=replay'), false);
	});

	test('configured empty state stays empty; browser failure and cancellation release callbacks', async () => {
		// Arrange
		const callbacks = new AuthorizationCodeCallbacks();
		const dependencies = {
			callbacks,
			getRedirectUri: async () => redirect,
			openBrowser: async () => false,
			exchange: async () => {
				throw new Error('Must not exchange');
			},
		};
		// Act
		const actionUnderTest = retrieveAuthorizationCodeToken(
			{ ...fields, state: '' },
			dependencies,
			new AbortController().signal,
		);

		// Assert
		await assert.rejects(actionUnderTest, /open the browser/);
		assert.strictEqual(callbacks.handleCallback('code=late'), false);
		const controller = new AbortController();
		await assert.rejects(
			retrieveAuthorizationCodeToken(
				fields,
				{
					...dependencies,
					openBrowser: async () => {
						controller.abort();
						return true;
					},
				},
				controller.signal,
			),
			/cancelled/,
		);
		assert.strictEqual(callbacks.handleCallback('state=user-state&code=late'), false);
	});

	test('continuing browser login after Cancel ignores the callback and never exchanges a code', async () => {
		// Arrange
		const callbacks = new AuthorizationCodeCallbacks();
		const controller = new AbortController();
		let opened = () => {};
		const browserOpened = new Promise<void>((resolve) => {
			opened = resolve;
		});
		let exchanges = 0;
		let cancelledQuery = '';
		// Act
		const pending = retrieveAuthorizationCodeToken(
			fields,
			{
				callbacks,
				getRedirectUri: async () => redirect,
				openBrowser: async (url) => {
					cancelledQuery = browserCallback(url, 'late-browser-code');
					opened();
					return true;
				},
				exchange: async () => {
					exchanges++;
					throw new Error('A cancelled attempt must not exchange its code');
				},
			},
			controller.signal,
		);
		await browserOpened;
		controller.abort();
		// Assert
		assert.strictEqual(callbacks.handleCallback(cancelledQuery), false);
		await assert.rejects(pending, /cancelled/);
		assert.strictEqual(exchanges, 0);
		assert.strictEqual(callbacks.handleCallback('state=user-state&code=even-later'), false);
		let newQuery = '';
		const retriedToken = await retrieveAuthorizationCodeToken(
			fields,
			{
				callbacks,
				getRedirectUri: async () => redirect,
				openBrowser: async (url) => {
					newQuery = browserCallback(url, 'new-browser-code');
					assert.notStrictEqual(newQuery, cancelledQuery);
					assert.strictEqual(callbacks.handleCallback(cancelledQuery), false);
					assert.strictEqual(callbacks.handleCallback(newQuery), true);
					return true;
				},
				exchange: async (request) => {
					assert.strictEqual(new URLSearchParams(request.body).get('code'), 'new-browser-code');
					return {
						status: 200,
						statusText: 'OK',
						headers: {},
						body: '{"access_token":"retry-token","token_type":"Bearer"}',
					};
				},
			},
			new AbortController().signal,
		);
		assert.strictEqual(retriedToken, 'retry-token');
		assert.strictEqual(fields.state, 'user-state');
	});

	test('retries work with empty State or PKCE disabled without changing configured fields', async () => {
		// Arrange
		// Act
		// Assert
		for (const options of [
			{ state: '', usePkce: true },
			{ state: 'manual-state', usePkce: false },
		]) {
			const configured = { ...fields, ...options };
			const callbacks = new AuthorizationCodeCallbacks();
			const controller = new AbortController();
			let oldQuery = '';
			await assert.rejects(
				retrieveAuthorizationCodeToken(
					configured,
					{
						callbacks,
						getRedirectUri: async () => redirect,
						openBrowser: async (url) => {
							oldQuery = browserCallback(url, 'cancelled-code');
							controller.abort();
							return true;
						},
						exchange: async () => {
							throw new Error('Must not exchange cancelled code');
						},
					},
					controller.signal,
				),
				/cancelled/,
			);
			const token = await retrieveAuthorizationCodeToken(
				configured,
				{
					callbacks,
					getRedirectUri: async () => redirect,
					openBrowser: async (url) => {
						assert.strictEqual(callbacks.handleCallback(oldQuery), false);
						assert.strictEqual(callbacks.handleCallback(browserCallback(url, 'retry-code')), true);
						return true;
					},
					exchange: async (request) => {
						const body = new URLSearchParams(request.body);
						assert.strictEqual(body.get('code'), 'retry-code');
						assert.strictEqual(body.has('code_verifier'), options.usePkce);
						return {
							status: 200,
							statusText: 'OK',
							headers: {},
							body: '{"access_token":"new-token","token_type":"Bearer"}',
						};
					},
				},
				new AbortController().signal,
			);
			assert.strictEqual(token, 'new-token');
			assert.strictEqual(configured.state, options.state);
			callbacks.dispose();
		}
	});

	test('cancellation during token exchange discards a response even if the transport ignores abort', async () => {
		// Arrange
		const callbacks = new AuthorizationCodeCallbacks();
		const controller = new AbortController();
		// Act
		const actionUnderTest = retrieveAuthorizationCodeToken(
			fields,
			{
				callbacks,
				getRedirectUri: async () => redirect,
				openBrowser: async (url) => {
					callbacks.handleCallback(browserCallback(url, 'code'));
					return true;
				},
				exchange: async () => {
					controller.abort();
					return {
						status: 200,
						statusText: 'OK',
						headers: {},
						body: '{"access_token":"late-token","token_type":"Bearer"}',
					};
				},
			},
			controller.signal,
		);

		// Assert
		await assert.rejects(actionUnderTest, /cancelled/);
	});

	test('token endpoint exchange uses POST, rejects redirects, and passes cancellation to fetch', async () => {
		// Arrange
		const original = globalThis.fetch;
		const callbacks = new AuthorizationCodeCallbacks();
		// Act
		// Assert
		try {
			globalThis.fetch = async (url, init) => {
				assert.strictEqual(url, fields.url);
				assert.strictEqual(init?.method, 'POST');
				assert.strictEqual(init?.redirect, 'error');
				assert.ok(init?.signal instanceof AbortSignal);
				assert.strictEqual(new URLSearchParams(String(init?.body)).get('code'), 'fake-code');
				return new Response('{"access_token":"fake-token","token_type":"Bearer"}');
			};
			const token = await retrieveAuthorizationCodeToken(
				fields,
				{
					callbacks,
					getRedirectUri: async () => redirect,
					openBrowser: async (url) => {
						callbacks.handleCallback(browserCallback(url, 'fake-code'));
						return true;
					},
					exchange: (request, signal) => executeRequest(request, 1000, signal, 'error'),
				},
				new AbortController().signal,
			);
			assert.strictEqual(token, 'fake-token');
		} finally {
			globalThis.fetch = original;
			callbacks.dispose();
		}
	});
});
