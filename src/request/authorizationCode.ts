import { createHash, randomBytes } from 'node:crypto';
import { ApiRequest, ApiResponse } from './types';
import { OAuthTokenFields, readOAuthAccessToken } from './oauth';

export interface AuthorizationCodeFields extends OAuthTokenFields {
	authorizationUrl: string;
	clientAuthentication: 'none' | 'basic' | 'body';
	state: string;
	usePkce: boolean;
}

/** PKCE secrets are per-attempt memory, never request-file settings. */
export function createPkce() {
	const verifier = randomBytes(32).toString('base64url');
	return { verifier, challenge: pkceChallenge(verifier) };
}

export function pkceChallenge(verifier: string): string {
	return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

function endpoint(value: string, label: string): URL {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new Error(`Enter a valid ${label}.`);
	}
	if (url.protocol !== 'https:') {
		throw new Error(`${label} must use HTTPS.`);
	}
	if (url.username || url.password || url.hash) {
		throw new Error(`${label} must not contain credentials or a fragment.`);
	}
	return url;
}

export function validateAuthorizationCodeFields(fields: AuthorizationCodeFields): void {
	endpoint(fields.authorizationUrl, 'Authorization URL');
	endpoint(fields.url, 'Access Token URL');
	if (!fields.clientId.trim()) {
		throw new Error('Enter a Client ID.');
	}
	if (fields.clientAuthentication === 'basic' && !fields.clientSecret) {
		throw new Error('Enter a Client Secret.');
	}
	// VS Code decodes callback URI components before delivering them. URL-safe
	// state avoids losing parameter boundaries or confusing literal '+' with space.
	if (fields.state && !/^[A-Za-z0-9._~-]+$/.test(fields.state)) {
		throw new Error(
			'State must use letters, numbers, dots, underscores, tildes, or hyphens. Click Generate for a valid value.',
		);
	}
	if (!fields.usePkce && !fields.state) {
		throw new Error('Enter or generate State when PKCE is disabled.');
	}
}

export function buildAuthorizationUrl(
	fields: AuthorizationCodeFields,
	redirectUri: string,
	challenge?: string,
): string {
	validateAuthorizationCodeFields(fields);
	const url = endpoint(fields.authorizationUrl, 'Authorization URL');
	// Override protocol parameters while preserving provider-specific query options.
	for (const name of [
		'state',
		'scope',
		'code_challenge',
		'code_challenge_method',
		'client_secret',
		'code_verifier',
		'response_mode',
	]) {
		url.searchParams.delete(name);
	}
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('response_mode', 'query');
	url.searchParams.set('client_id', fields.clientId.trim());
	url.searchParams.set('redirect_uri', redirectUri);
	if (fields.scope.trim()) {
		url.searchParams.set('scope', fields.scope.trim());
	}
	if (fields.state) {
		url.searchParams.set('state', fields.state);
	}
	if (fields.usePkce) {
		if (!challenge) {
			throw new Error('Unable to prepare PKCE.');
		}
		url.searchParams.set('code_challenge', challenge);
		url.searchParams.set('code_challenge_method', 'S256');
	}
	return url.toString();
}

export function buildAuthorizationCodeTokenRequest(
	fields: AuthorizationCodeFields,
	redirectUri: string,
	code: string,
	verifier?: string,
): ApiRequest {
	validateAuthorizationCodeFields(fields);
	if (!code) {
		throw new Error('The authorization callback did not include a code.');
	}
	const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
	const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
	if (fields.clientAuthentication === 'basic') {
		const encode = (value: string) => new URLSearchParams({ value }).toString().slice(6);
		headers.Authorization = `Basic ${Buffer.from(`${encode(fields.clientId.trim())}:${encode(fields.clientSecret)}`).toString('base64')}`;
	} else {
		body.set('client_id', fields.clientId.trim());
		if (fields.clientAuthentication === 'body' && fields.clientSecret) {
			body.set('client_secret', fields.clientSecret);
		}
	}
	if (fields.usePkce) {
		if (!verifier) {
			throw new Error('Unable to prepare PKCE.');
		}
		body.set('code_verifier', verifier);
	}
	return { method: 'POST', url: endpoint(fields.url, 'Access Token URL').toString(), headers, body: body.toString() };
}

interface PendingCallback {
	complete: (code?: string, error?: Error) => void;
}

/** Routes callbacks only to live attempts with matching state; codes are single-use. */
export class AuthorizationCodeCallbacks {
	private readonly pending = new Map<string, PendingCallback>();

	waitForCode(state: string, signal: AbortSignal, timeoutMs = 300000): Promise<string> {
		if (signal.aborted) {
			throw new Error('Token request cancelled.');
		}
		if (this.pending.has(state)) {
			throw new Error('Another authorization attempt is using this State. Cancel it or generate a new State.');
		}
		return new Promise((resolve, reject) => {
			const abort = () => this.cancelState(state);
			const timer = setTimeout(
				() => complete(undefined, new Error('Authorization timed out. Try getting a new access token.')),
				timeoutMs,
			);
			const complete = (code?: string, error?: Error) => {
				if (this.pending.get(state)?.complete !== complete) {
					return;
				}
				this.pending.delete(state);
				clearTimeout(timer);
				signal.removeEventListener('abort', abort);
				if (error) {
					reject(error);
				} else {
					resolve(code!);
				}
			};
			this.pending.set(state, { complete });
			signal.addEventListener('abort', abort, { once: true });
		});
	}

	/** Cancels only the pending attempt identified by its internal state. */
	cancelState(state: string): void {
		this.pending.get(state)?.complete(undefined, new Error('Token request cancelled.'));
	}

	handleCallback(query: string): boolean {
		const params = new URLSearchParams(query);
		if (params.getAll('state').length > 1) {
			return false;
		}
		const pending = this.pending.get(params.get('state') ?? '');
		if (!pending) {
			return false;
		}
		if (params.has('error')) {
			pending.complete(undefined, new Error('Authorization was denied or failed. Try again.'));
		} else if (params.getAll('code').length !== 1 || !params.get('code')) {
			pending.complete(undefined, new Error('The authorization callback did not include a valid code.'));
		} else {
			pending.complete(params.get('code')!);
		}
		return true;
	}

	dispose(): void {
		for (const pending of this.pending.values()) {
			pending.complete(undefined, new Error('Token request cancelled.'));
		}
	}
}

export interface AuthorizationCodeDependencies {
	callbacks: AuthorizationCodeCallbacks;
	getRedirectUri: () => Promise<string>;
	openBrowser: (url: string) => PromiseLike<boolean>;
	exchange: (request: ApiRequest, signal: AbortSignal) => Promise<ApiResponse>;
}

/** External effects are injected so the entire browser/callback/exchange flow is testable. */
export async function retrieveAuthorizationCodeToken(
	fields: AuthorizationCodeFields,
	dependencies: AuthorizationCodeDependencies,
	signal: AbortSignal,
): Promise<string> {
	validateAuthorizationCodeFields(fields);
	const controller = new AbortController();
	const abort = () => controller.abort();
	signal.addEventListener('abort', abort, { once: true });
	try {
		if (signal.aborted) {
			controller.abort();
		}
		const redirectUri = await dependencies.getRedirectUri();
		if (controller.signal.aborted) {
			throw new Error('Token request cancelled.');
		}
		const pkce = fields.usePkce ? createPkce() : undefined;
		// Keep the user's State field untouched. A fresh internal suffix on the
		// protocol state isolates retries, even when the configured State is empty
		// or reused. An old browser callback cannot consume a newer attempt.
		const attemptFields = {
			...fields,
			state: (fields.state ? fields.state + '.' : '') + randomBytes(32).toString('base64url'),
		};
		const url = buildAuthorizationUrl(attemptFields, redirectUri, pkce?.challenge);
		const codePromise = dependencies.callbacks.waitForCode(attemptFields.state, controller.signal);
		void codePromise.catch(() => {});
		if (!(await dependencies.openBrowser(url))) {
			throw new Error('Unable to open the browser for authorization.');
		}
		const code = await codePromise;
		if (controller.signal.aborted) {
			throw new Error('Token request cancelled.');
		}
		const request = buildAuthorizationCodeTokenRequest(fields, redirectUri, code, pkce?.verifier);
		const response = await dependencies.exchange(request, controller.signal);
		if (controller.signal.aborted) {
			throw new Error('Token request cancelled.');
		}
		return readOAuthAccessToken(response);
	} finally {
		controller.abort();
		signal.removeEventListener('abort', abort);
	}
}
