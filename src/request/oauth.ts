import { ApiRequest, ApiResponse, OAuthAuthorizationDefinition } from './types';
import { isRecord } from '../shared/object';

export interface OAuthTokenFields {
	url: string;
	clientId: string;
	clientSecret: string;
	scope: string;
}

/** Builds a client credentials grant using OAuth's HTTP Basic client authentication. */
export function buildOAuthTokenRequest(fields: OAuthTokenFields): ApiRequest {
	if (!fields.clientId.trim() || !fields.clientSecret) {
		throw new Error('Enter a Client ID and Client Secret.');
	}
	let url: URL;
	try { url = new URL(fields.url.trim()); } catch { throw new Error('Enter a valid Access Token URL.'); }
	if (url.protocol !== 'https:') {
		throw new Error('Access Token URL must use HTTPS.');
	}
	if (url.username || url.password || url.hash) {
		throw new Error('Access Token URL must not contain credentials or a fragment.');
	}
	const encode = (value: string) => new URLSearchParams({ value }).toString().slice('value='.length);
	const credentials = Buffer.from(`${encode(fields.clientId)}:${encode(fields.clientSecret)}`, 'utf8').toString('base64');
	const body = new URLSearchParams({ grant_type: 'client_credentials' });
	if (fields.scope.trim()) { body.set('scope', fields.scope.trim()); }
	return {
		method: 'POST', url: url.toString(),
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${credentials}` },
		body: body.toString(),
	};
}

/** Rejects malformed responses without exposing token endpoint response bodies. */
export function readOAuthAccessToken(response: ApiResponse): string {
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`Token request failed (HTTP ${response.status}). Check the token URL, credentials, and scope.`);
	}
	let data: unknown;
	try { data = JSON.parse(response.body); } catch { throw new Error('Token endpoint returned invalid JSON.'); }
	if (!isRecord(data) || typeof data.access_token !== 'string' || !/^[\x21-\x7e]+$/.test(data.access_token)
		|| typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer') {
		throw new Error('Token endpoint must return an access_token and Bearer token_type.');
	}
	return data.access_token;
}

/** Validates saved OAuth editor settings, allowing unfinished input fields. */
export function isOAuthAuthorization(value: unknown): value is OAuthAuthorizationDefinition {
	return isRecord(value) && value.type === 'oauth2'
		&& (value.grantType === 'client_credentials' || value.grantType === 'authorization_code')
		&& typeof value.accessTokenUrl === 'string' && typeof value.clientId === 'string'
		&& typeof value.clientSecret === 'string' && typeof value.scope === 'string';
}

/** Copies only known settings out of untrusted file or webview input. */
export function readOAuthAuthorization(value: OAuthAuthorizationDefinition): OAuthAuthorizationDefinition {
	return { type: 'oauth2', grantType: value.grantType, accessTokenUrl: value.accessTokenUrl,
		clientId: value.clientId, clientSecret: value.clientSecret, scope: value.scope };
}
