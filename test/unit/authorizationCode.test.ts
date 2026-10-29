import * as assert from 'assert';
import * as vscode from 'vscode';
import {
	AuthorizationCodeCallbacks,
	AuthorizationCodeFields,
	buildAuthorizationUrl,
	buildAuthorizationCodeTokenRequest,
	createPkce,
	pkceChallenge,
	retrieveAuthorizationCodeToken,
} from '../../src/request/authorizationCode';
import { ApiResponse } from '../../src/request/types';
import { executeRequest } from '../../src/request/requestRunner';
import { createSecretRelay, relayKey, type CallbackRelay, type RelayStore } from '../../src/webview/oauthRelay';

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
	const redirect = 'vscode://nickchecan.restcraft/oauth/callback';
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
		const nestedRedirect = 'https://vscode.dev/redirect?vscode-reqid=4&route=a%2Bb';
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
		assert.strictEqual(callbacks.handleCallback('state=wrong&code=secret-code'), 'not-owned');
		assert.strictEqual(callbacks.handleCallback('state=expected&state=other&code=secret-code'), 'rejected');
		assert.strictEqual(callbacks.handleCallback('state=expected&code=accepted-code'), 'completed');
		assert.strictEqual(await pending, 'accepted-code');
		assert.strictEqual(callbacks.handleCallback('state=expected&code=replayed'), 'already-completed');
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
		await assert.rejects(
			callbacks.waitForCode('fresh-state', controller.signal, 5),
			(error: unknown) =>
				error instanceof Error && /timed out/.test(error.message) && /window that started sign-in/.test(error.message),
		);
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
		assert.strictEqual(callbacks.handleCallback('state=user-state&code=replay'), 'not-owned');
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
		assert.strictEqual(callbacks.handleCallback('code=late'), 'not-owned');
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
		assert.strictEqual(callbacks.handleCallback('state=user-state&code=late'), 'not-owned');
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
		assert.strictEqual(callbacks.handleCallback(cancelledQuery), 'already-completed');
		await assert.rejects(pending, /cancelled/);
		assert.strictEqual(exchanges, 0);
		assert.strictEqual(callbacks.handleCallback('state=user-state&code=even-later'), 'not-owned');
		let newQuery = '';
		const retriedToken = await retrieveAuthorizationCodeToken(
			fields,
			{
				callbacks,
				getRedirectUri: async () => redirect,
				openBrowser: async (url) => {
					newQuery = browserCallback(url, 'new-browser-code');
					assert.notStrictEqual(newQuery, cancelledQuery);
					assert.strictEqual(callbacks.handleCallback(cancelledQuery), 'already-completed');
					assert.strictEqual(callbacks.handleCallback(newQuery), 'completed');
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
						assert.strictEqual(callbacks.handleCallback(oldQuery), 'already-completed');
						assert.strictEqual(callbacks.handleCallback(browserCallback(url, 'retry-code')), 'completed');
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

	test('a local callback and a relay entry complete one exchange', async () => {
		const harness = createRelayHarness();
		const callbacks = new AuthorizationCodeCallbacks();
		let exchanges = 0;
		let query = '';
		try {
			const token = await retrieveAuthorizationCodeToken(
				fields,
				{
					callbacks,
					relay: harness.relay,
					getRedirectUri: async () => redirect,
					openBrowser: async (url) => {
						query = browserCallback(url, 'once-code');
						await harness.relay.publish(query);
						await new Promise((resolve) => setTimeout(resolve, 0));
						assert.strictEqual(callbacks.handleCallback(query), 'already-completed');
						return true;
					},
					exchange: async (request) => {
						exchanges++;
						assert.strictEqual(new URLSearchParams(request.body).get('code'), 'once-code');
						assert.strictEqual(new URLSearchParams(request.body).get('redirect_uri'), redirect);
						return tokenResponse();
					},
				},
				new AbortController().signal,
			);
			assert.strictEqual(token, 'relay-token');
			assert.strictEqual(exchanges, 1);
			assert.strictEqual(callbacks.handleCallback(query), 'already-completed');
			assert.strictEqual(harness.store.values.has(relayKey(new URLSearchParams(query).get('state')!)), false);
			assert.strictEqual(harness.active(), 0);
		} finally {
			harness.dispose();
		}
	});

	test('cancel and timeout clear the relay key and stop polling', async () => {
		const harness = createRelayHarness();
		const cleared: string[] = [];
		const relay: Pick<CallbackRelay, 'subscribe' | 'clear'> = {
			subscribe: (state, signal) => harness.relay.subscribe(state, signal),
			clear: async (state) => {
				cleared.push(state);
				await harness.relay.clear(state);
			},
		};
		const callbacks = new AuthorizationCodeCallbacks();
		try {
			const controller = new AbortController();
			const pending = callbacks.waitForCode('to-cancel', controller.signal, 30_000, relay);
			assert.strictEqual(harness.active(), 1);
			controller.abort();
			await assert.rejects(pending, /cancelled/);
			assert.deepStrictEqual(cleared, ['to-cancel']);
			assert.strictEqual(harness.active(), 0);

			const timedOut = callbacks.waitForCode('to-timeout', new AbortController().signal, 20, relay);
			assert.strictEqual(harness.active(), 1);
			await assert.rejects(timedOut, /window that started sign-in/);
			assert.deepStrictEqual(cleared, ['to-cancel', 'to-timeout']);
			assert.strictEqual(harness.active(), 0);
		} finally {
			callbacks.dispose();
			harness.dispose();
		}
	});

	test('a state mismatch never completes and duplicate state is rejected on both paths', async () => {
		const harness = createRelayHarness();
		const callbacks = new AuthorizationCodeCallbacks();
		const controller = new AbortController();
		try {
			const pending = callbacks.waitForCode('owner.suffix', controller.signal, 40, harness.relay);
			assert.strictEqual(callbacks.handleCallback('state=other.suffix&code=nope'), 'not-owned');
			await harness.relay.publish('state=other.suffix&code=nope&error_description=secret');
			harness.fire();
			assert.strictEqual(callbacks.handleCallback('state=owner.suffix&state=extra&code=nope'), 'rejected');
			await harness.store.store(
				relayKey('owner.suffix'),
				JSON.stringify({
					v: 1,
					state: 'owner.suffix',
					query: 'state=owner.suffix&state=extra&code=nope',
					createdAt: harness.now(),
				}),
			);
			await assert.rejects(pending, /timed out/);
			assert.strictEqual(harness.store.values.has(relayKey('other.suffix')), true);
		} finally {
			controller.abort();
			callbacks.dispose();
			harness.dispose();
		}
	});

	test('a failing relay publish does not break the same-window exchange', async () => {
		const emitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
		const store: RelayStore = {
			get: async () => {
				throw new Error('secret-code unavailable');
			},
			store: async () => {
				throw new Error('cannot store secret-code');
			},
			delete: async () => {
				throw new Error('cannot delete secret-code');
			},
			onDidChange: emitter.event,
		};
		const interval = createFakeInterval();
		const relay = createSecretRelay(store, () => 1, interval.setIntervalFn, interval.clearIntervalFn);
		const callbacks = new AuthorizationCodeCallbacks();
		try {
			await assert.doesNotReject(relay.publish('code=secret-code&state=owned&access_token=tok'));
			const token = await retrieveAuthorizationCodeToken(
				fields,
				{
					callbacks,
					relay,
					getRedirectUri: async () => redirect,
					openBrowser: async (url) => {
						assert.strictEqual(callbacks.handleCallback(browserCallback(url, 'local-code')), 'completed');
						return true;
					},
					exchange: async (request) => {
						assert.strictEqual(new URLSearchParams(request.body).get('code'), 'local-code');
						return tokenResponse('local-token');
					},
				},
				new AbortController().signal,
			);
			assert.strictEqual(token, 'local-token');
			assert.strictEqual(interval.active(), 0);
		} finally {
			callbacks.dispose();
			relay.dispose();
			emitter.dispose();
		}
	});
});

function tokenResponse(token = 'relay-token'): ApiResponse {
	return {
		status: 200,
		statusText: 'OK',
		headers: {},
		body: JSON.stringify({ access_token: token, token_type: 'Bearer' }),
	};
}

function createFakeInterval(): {
	setIntervalFn: typeof setInterval;
	clearIntervalFn: typeof clearInterval;
	fire(): void;
	active(): number;
} {
	const callbacks = new Map<number, () => void>();
	let nextId = 1;
	const setIntervalFn = ((handler: () => void) => {
		const id = nextId++;
		callbacks.set(id, () => {
			if (typeof handler === 'function') {
				handler();
			}
		});
		return id as unknown as ReturnType<typeof setInterval>;
	}) as typeof setInterval;
	const clearIntervalFn = ((id?: ReturnType<typeof setInterval>) => {
		if (id !== undefined) {
			callbacks.delete(id as unknown as number);
		}
	}) as typeof clearInterval;
	return {
		setIntervalFn,
		clearIntervalFn,
		fire() {
			for (const callback of [...callbacks.values()]) {
				callback();
			}
		},
		active: () => callbacks.size,
	};
}

function createRelayHarness() {
	const values = new Map<string, string>();
	const emitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
	let fireEvents = true;
	const interval = createFakeInterval();
	let now = 1_700_000_000_000;
	const store: RelayStore & { values: Map<string, string> } = {
		values,
		get: (key) => Promise.resolve(values.get(key)),
		store: (key, value) => {
			values.set(key, value);
			if (fireEvents) {
				emitter.fire({ key });
			}
			return Promise.resolve();
		},
		delete: (key) => {
			values.delete(key);
			if (fireEvents) {
				emitter.fire({ key });
			}
			return Promise.resolve();
		},
		keys: () => Promise.resolve([...values.keys()]),
		onDidChange: emitter.event,
	};
	const relay = createSecretRelay(store, () => now, interval.setIntervalFn, interval.clearIntervalFn);
	return {
		store,
		relay,
		now: () => now,
		fire: () => interval.fire(),
		active: () => interval.active(),
		dispose() {
			relay.dispose();
			emitter.dispose();
		},
	};
}
