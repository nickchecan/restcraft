import * as assert from 'assert';
import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import { AuthorizationCodeCallbacks } from '../../src/request/authorizationCode';
import {
	RELAY_KEY_PREFIX,
	RELAY_TTL_MS,
	createSecretRelay,
	relayKey,
	sanitizeCallbackQuery,
	type RelayStore,
} from '../../src/webview/oauthRelay';

suite('OAuth callback relay', () => {
	test('relay keys are the sha256 prefix and callback queries keep only code, state, and error', () => {
		const state = 'user.suffix';
		assert.strictEqual(
			relayKey(state),
			RELAY_KEY_PREFIX + createHash('sha256').update(state, 'utf8').digest('base64url'),
		);
		assert.ok(!relayKey(state).includes(state));

		const sanitized = sanitizeCallbackQuery(
			'code=c&state=s&error=access_denied&access_token=tok&id_token=id&error_description=desc&foo=bar',
		);
		assert.strictEqual(sanitized?.state, 's');
		const params = new URLSearchParams(sanitized?.query);
		assert.deepStrictEqual(params.getAll('code'), ['c']);
		assert.deepStrictEqual(params.getAll('state'), ['s']);
		assert.deepStrictEqual(params.getAll('error'), ['access_denied']);
		assert.ok(!params.has('access_token'));
		assert.ok(!params.has('id_token'));
		assert.ok(!params.has('error_description'));
		assert.ok(!params.has('foo'));
		assert.strictEqual(sanitizeCallbackQuery('code=only'), undefined);

		const duplicates = sanitizeCallbackQuery('state=a&code=1&state=b&code=2&token=nope');
		assert.strictEqual(duplicates?.state, 'a');
		assert.deepStrictEqual(new URLSearchParams(duplicates?.query).getAll('state'), ['a', 'b']);
		assert.deepStrictEqual(new URLSearchParams(duplicates?.query).getAll('code'), ['1', '2']);
		assert.ok(!duplicates?.query.includes('token'));
	});

	test('the receiving window publishes and the owner resolves from the change event', async () => {
		const harness = createRelayHarness();
		const owner = new AuthorizationCodeCallbacks();
		const receiver = new AuthorizationCodeCallbacks();
		const controller = new AbortController();
		try {
			const waiting = owner.waitForCode('state-a', controller.signal, 30_000, harness.relay);
			const query = 'code=from-b&state=state-a&access_token=secret-token&error_description=hidden';
			assert.strictEqual(receiver.handleCallback(query), 'not-owned');
			await harness.relay.publish(query);
			assert.strictEqual(await waiting, 'from-b');
			assert.strictEqual(owner.handleCallback(query), 'already-completed');
			assert.strictEqual(harness.values.has(relayKey('state-a')), false);
			const stored = harness.published.find((entry) => entry.includes('state-a'));
			assert.ok(stored);
			assert.ok(!stored.includes('secret-token'));
			assert.ok(!stored.includes('hidden'));
			assert.ok(!stored.includes('access_token'));
			assert.strictEqual(harness.active(), 0);
		} finally {
			controller.abort();
			owner.dispose();
			harness.dispose();
		}
	});

	test('subscribe resolves on the next poll when the store does not fire changes', async () => {
		const harness = createRelayHarness();
		harness.setFireEvents(false);
		const controller = new AbortController();
		try {
			const pending = harness.relay.subscribe('abc', controller.signal);
			assert.strictEqual(harness.active(), 1);
			const query = 'state=abc&code=from-poll';
			await harness.store.store(
				relayKey('abc'),
				JSON.stringify({ v: 1, state: 'abc', query, createdAt: harness.now() }),
			);
			let settled = false;
			void pending.then(() => {
				settled = true;
			});
			await new Promise((resolve) => setImmediate(resolve));
			assert.strictEqual(settled, false);
			harness.fire();
			assert.strictEqual(await pending, query);
			assert.strictEqual(harness.values.has(relayKey('abc')), false);
			assert.strictEqual(harness.active(), 0);
		} finally {
			controller.abort();
			harness.dispose();
		}
	});

	test('an unknown state is removed by sweep after the TTL and nothing throws', async () => {
		const harness = createRelayHarness();
		try {
			await assert.doesNotReject(
				harness.relay.publish('code=c&state=nobody&error=access_denied&error_description=hidden&access_token=tok'),
			);
			const raw = harness.values.get(relayKey('nobody'));
			assert.ok(raw);
			assert.ok(!raw.includes('access_token'));
			assert.ok(!raw.includes('tok'));
			assert.ok(!raw.includes('hidden'));
			assert.ok(!raw.includes('error_description'));
			const entry = JSON.parse(raw) as { v: number; state: string; query: string; createdAt: number };
			assert.strictEqual(entry.v, 1);
			assert.strictEqual(entry.state, 'nobody');
			harness.advance(RELAY_TTL_MS);
			await harness.relay.sweep(harness.now());
			assert.strictEqual(harness.values.has(relayKey('nobody')), true);
			harness.advance(1);
			await harness.relay.sweep(harness.now());
			assert.strictEqual(harness.values.has(relayKey('nobody')), false);
			assert.strictEqual(harness.active(), 0);
		} finally {
			harness.dispose();
		}
	});

	test('a delete event is ignored until a later store', async () => {
		const harness = createRelayHarness();
		const controller = new AbortController();
		try {
			const pending = harness.relay.subscribe('s', controller.signal);
			await harness.store.delete(relayKey('s'));
			await new Promise((resolve) => setImmediate(resolve));
			let done = false;
			void pending.then(
				() => {
					done = true;
				},
				() => {
					done = true;
				},
			);
			await new Promise((resolve) => setImmediate(resolve));
			assert.strictEqual(done, false);
			await harness.store.store(
				relayKey('s'),
				JSON.stringify({ v: 1, state: 's', query: 'state=s&code=later', createdAt: harness.now() }),
			);
			assert.strictEqual(await pending, 'state=s&code=later');
		} finally {
			controller.abort();
			harness.dispose();
		}
	});

	test('polling runs only while a subscription is pending', async () => {
		const harness = createRelayHarness();
		assert.strictEqual(harness.active(), 0);
		const first = new AbortController();
		const second = new AbortController();
		try {
			const pendingFirst = harness.relay.subscribe('one', first.signal);
			const pendingSecond = harness.relay.subscribe('two', second.signal);
			assert.strictEqual(harness.active(), 1);
			first.abort();
			await assert.rejects(pendingFirst, /cancelled/);
			assert.strictEqual(harness.active(), 1);
			second.abort();
			await assert.rejects(pendingSecond, /cancelled/);
			assert.strictEqual(harness.active(), 0);
		} finally {
			first.abort();
			second.abort();
			harness.dispose();
		}
	});

	test('sweep uses keys recorded locally when the store has no keys method', async () => {
		const values = new Map<string, string>();
		const emitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
		const interval = createFakeInterval();
		let now = 50;
		const store: RelayStore = {
			get: (key) => Promise.resolve(values.get(key)),
			store: (key, value) => {
				values.set(key, value);
				return Promise.resolve();
			},
			delete: (key) => {
				values.delete(key);
				return Promise.resolve();
			},
			onDidChange: emitter.event,
		};
		const relay = createSecretRelay(store, () => now, interval.setIntervalFn, interval.clearIntervalFn);
		try {
			await relay.publish('code=c&state=old');
			assert.strictEqual(values.has(relayKey('old')), true);
			now += RELAY_TTL_MS + 1;
			await relay.sweep();
			assert.strictEqual(values.has(relayKey('old')), false);
			assert.strictEqual(interval.active(), 0);
		} finally {
			relay.dispose();
			emitter.dispose();
		}
	});
});

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
	const published: string[] = [];
	const emitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
	let fireEvents = true;
	const interval = createFakeInterval();
	let now = 1_700_000_000_000;
	const store: RelayStore = {
		get: (key) => Promise.resolve(values.get(key)),
		store: (key, value) => {
			values.set(key, value);
			published.push(value);
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
		values,
		published,
		now: () => now,
		advance(ms: number) {
			now += ms;
		},
		setFireEvents(value: boolean) {
			fireEvents = value;
		},
		fire: () => interval.fire(),
		active: () => interval.active(),
		dispose() {
			relay.dispose();
			emitter.dispose();
		},
	};
}
