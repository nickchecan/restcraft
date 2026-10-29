import { createHash } from 'node:crypto';
import * as vscode from 'vscode';

export const RELAY_KEY_PREFIX = 'restcraft.oauthRelay.';
export const RELAY_TTL_MS = 60_000;
export const RELAY_POLL_MS = 1_000;

export interface RelayEntry {
	v: 1;
	state: string;
	query: string;
	createdAt: number;
}

export function relayKey(state: string): string {
	const digest = createHash('sha256').update(state, 'utf8').digest('base64url');
	return RELAY_KEY_PREFIX + digest;
}

/** Keeps only code, state, and error. Repeated keys stay so duplicate-state checks still apply. */
export function sanitizeCallbackQuery(query: string): { state: string; query: string } | undefined {
	const params = new URLSearchParams(query);
	const states = params.getAll('state');
	if (states.length === 0) {
		return undefined;
	}
	const kept = new URLSearchParams();
	for (const [key, value] of params) {
		if (key === 'code' || key === 'state' || key === 'error') {
			kept.append(key, value);
		}
	}
	return { state: states[0], query: kept.toString() };
}

export interface CallbackRelay extends vscode.Disposable {
	/** Called by a window that received a callback whose state it does not own. Never throws. */
	publish(query: string): Promise<void>;
	/** Resolves once with the sanitized query, then deletes the entry. */
	subscribe(state: string, signal: AbortSignal): Promise<string>;
	/** Delete the entry for `state` (completion, cancel, or timeout). Idempotent. */
	clear(state: string): Promise<void>;
	/** Remove entries older than the TTL. */
	sweep(now?: number): Promise<void>;
}

export interface RelayStore {
	get(key: string): Thenable<string | undefined>;
	store(key: string, value: string): Thenable<void>;
	delete(key: string): Thenable<void>;
	keys?(): Thenable<string[]>;
	onDidChange: vscode.Event<vscode.SecretStorageChangeEvent>;
}

function logRelayFailure(action: string): void {
	console.error(`RestCraft OAuth callback relay could not ${action}.`);
}

function parseRelayEntry(raw: string): RelayEntry | undefined {
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== 'object' || value === null) {
			return undefined;
		}
		const entry = value as Partial<RelayEntry>;
		if (entry.v !== 1 || typeof entry.state !== 'string' || typeof entry.query !== 'string') {
			return undefined;
		}
		if (typeof entry.createdAt !== 'number' || !Number.isFinite(entry.createdAt)) {
			return undefined;
		}
		return { v: 1, state: entry.state, query: entry.query, createdAt: entry.createdAt };
	} catch {
		return undefined;
	}
}

function isExpired(entry: RelayEntry, now: number): boolean {
	return entry.createdAt + RELAY_TTL_MS < now;
}

/**
 * Cross-window OAuth callback handoff. The PKCE verifier and token exchange stay in the owner window.
 * `clearIntervalFn` is injectable so tests can pair it with a fake `setInterval`.
 */
export function createSecretRelay(
	store: RelayStore,
	clock: () => number = Date.now,
	setIntervalFn: typeof setInterval = setInterval,
	clearIntervalFn: typeof clearInterval = clearInterval,
): CallbackRelay {
	const knownKeys = new Set<string>();
	const pollers = new Map<string, Set<() => void>>();
	let interval: ReturnType<typeof setInterval> | undefined;

	function startPolling(): void {
		if (interval !== undefined || pollers.size === 0) {
			return;
		}
		const timer = setIntervalFn(() => {
			for (const group of pollers.values()) {
				for (const check of [...group]) {
					check();
				}
			}
		}, RELAY_POLL_MS);
		if (typeof (timer as { unref?: () => void }).unref === 'function') {
			(timer as { unref: () => void }).unref();
		}
		interval = timer;
	}

	function stopPolling(): void {
		if (pollers.size > 0 || interval === undefined) {
			return;
		}
		clearIntervalFn(interval);
		interval = undefined;
	}

	function addPoller(state: string, check: () => void): () => void {
		let group = pollers.get(state);
		if (!group) {
			group = new Set();
			pollers.set(state, group);
		}
		const listeners = group;
		listeners.add(check);
		startPolling();
		return () => {
			listeners.delete(check);
			if (listeners.size === 0) {
				pollers.delete(state);
			}
			stopPolling();
		};
	}

	async function listKeys(): Promise<readonly string[]> {
		if (!store.keys) {
			return [...knownKeys];
		}
		try {
			return await store.keys();
		} catch {
			logRelayFailure('list entries');
			return [...knownKeys];
		}
	}

	async function deleteKey(key: string): Promise<void> {
		await store.delete(key);
		knownKeys.delete(key);
	}

	async function sweep(now = clock()): Promise<void> {
		try {
			const keys = await listKeys();
			for (const key of keys) {
				if (!key.startsWith(RELAY_KEY_PREFIX)) {
					continue;
				}
				let raw: string | undefined;
				try {
					raw = await store.get(key);
				} catch {
					logRelayFailure('sweep');
					continue;
				}
				if (raw === undefined) {
					knownKeys.delete(key);
					continue;
				}
				const entry = parseRelayEntry(raw);
				// A pending state is still wanted. createdAt belongs to the publisher's
				// machine, which may not match this host across a remote window.
				if (!entry || (isExpired(entry, now) && !pollers.has(entry.state))) {
					try {
						await deleteKey(key);
					} catch {
						logRelayFailure('sweep');
					}
				}
			}
		} catch {
			logRelayFailure('sweep');
		}
	}

	return {
		async publish(query: string): Promise<void> {
			try {
				const sanitized = sanitizeCallbackQuery(query);
				if (!sanitized) {
					return;
				}
				await sweep();
				const key = relayKey(sanitized.state);
				const entry: RelayEntry = {
					v: 1,
					state: sanitized.state,
					query: sanitized.query,
					createdAt: clock(),
				};
				knownKeys.add(key);
				await store.store(key, JSON.stringify(entry));
			} catch {
				logRelayFailure('publish');
			}
		},

		subscribe(state: string, signal: AbortSignal): Promise<string> {
			if (signal.aborted) {
				return Promise.reject(new Error('Authorization relay cancelled.'));
			}
			const key = relayKey(state);
			return new Promise((resolve, reject) => {
				let settled = false;
				let chain: Promise<void> = Promise.resolve();
				let removePoll = () => {};
				let eventSubscription: vscode.Disposable | undefined;

				const cleanup = () => {
					removePoll();
					eventSubscription?.dispose();
					signal.removeEventListener('abort', onAbort);
				};

				const fail = (error: Error) => {
					if (settled) {
						return;
					}
					settled = true;
					cleanup();
					reject(error);
				};

				const onAbort = () => fail(new Error('Authorization relay cancelled.'));

				const read = () => {
					chain = chain
						.then(async () => {
							if (settled) {
								return;
							}
							let raw: string | undefined;
							try {
								raw = await store.get(key);
							} catch {
								logRelayFailure('subscribe');
								return;
							}
							// A delete also fires onDidChange. Nothing to deliver until a later store.
							if (settled || raw === undefined) {
								return;
							}
							const entry = parseRelayEntry(raw);
							// The owner is waiting on this state, so do not apply the TTL here.
							// createdAt is the publisher's clock and can be minutes off on Remote SSH, WSL, or a Dev Container.
							if (!entry || entry.state !== state) {
								try {
									await deleteKey(key);
								} catch {
									logRelayFailure('subscribe');
								}
								return;
							}
							const sanitized = sanitizeCallbackQuery(entry.query);
							if (!sanitized) {
								try {
									await deleteKey(key);
								} catch {
									logRelayFailure('subscribe');
								}
								return;
							}
							settled = true;
							cleanup();
							try {
								await deleteKey(key);
							} catch {
								logRelayFailure('subscribe');
							}
							resolve(sanitized.query);
						})
						.catch(() => {
							logRelayFailure('subscribe');
						});
				};

				removePoll = addPoller(state, read);
				eventSubscription = store.onDidChange((event) => {
					if (event.key === key) {
						read();
					}
				});
				signal.addEventListener('abort', onAbort, { once: true });
				if (signal.aborted) {
					fail(new Error('Authorization relay cancelled.'));
				}
			});
		},

		async clear(state: string): Promise<void> {
			try {
				await deleteKey(relayKey(state));
			} catch {
				logRelayFailure('clear');
			}
			await sweep();
		},

		sweep,

		dispose(): void {
			pollers.clear();
			if (interval !== undefined) {
				clearIntervalFn(interval);
				interval = undefined;
			}
		},
	};
}
