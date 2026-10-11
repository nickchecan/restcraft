import {
	HttpMethod,
	isHttpMethod,
	RequestFileDefinition,
	RequestHeaderDefinition,
	RequestParamDefinition,
	supportedMethods,
} from './types';
import { isOAuthAuthorization, readOAuthAuthorization } from './oauth';
import { isRecord } from '../shared/object';

/**
 * Parses and validates the canonical `.api.json` request file format.
 *
 * The returned shape is normalized for the UI: methods are uppercase, URLs are
 * serialized through `URL`, missing headers become `{}`, missing body becomes
 * `null`, and query params/header state are derived for older files that only
 * contain `url` or `headers`.
 */
export function parseRequestFile(content: string): RequestFileDefinition {
	let parsed: unknown;

	try {
		parsed = JSON.parse(content);
	} catch (error) {
		const detail = error instanceof Error ? error.message : 'Unknown JSON parse error.';
		throw new Error(`Invalid JSON: ${detail}`);
	}

	if (!isRecord(parsed)) {
		throw new Error('Request file must contain a JSON object.');
	}

	const url = readUrl(parsed);
	if (parsed.authorization !== undefined && !isOAuthAuthorization(parsed.authorization)) {
		throw new Error('Request file property "authorization" must contain valid OAuth 2.0 settings.');
	}

	return {
		name: readRequiredString(parsed, 'name'),
		method: readMethod(parsed),
		url,
		params: readParams(parsed, url),
		headerState: readHeaderState(parsed),
		headers: readHeaders(parsed),
		body: parsed.body ?? null,
		...(isOAuthAuthorization(parsed.authorization) ? { authorization: readOAuthAuthorization(parsed.authorization) } : {}),
	};
}

/**
 * Detects request definition files by the current canonical extension.
 */
export function isRequestFileName(fileName: string): boolean {
	return fileName.endsWith('.api.json');
}

/**
 * Reads a required non-empty string property from parsed JSON.
 */
function readRequiredString(value: Record<string, unknown>, property: string): string {
	const candidate = value[property];

	if (typeof candidate !== 'string' || !candidate.trim()) {
		throw new Error(`Request file property "${property}" must be a non-empty string.`);
	}

	return candidate.trim();
}

/**
 * Reads and validates the HTTP method property.
 */
function readMethod(value: Record<string, unknown>): HttpMethod {
	const method = readRequiredString(value, 'method').toUpperCase();

	if (!isHttpMethod(method)) {
		throw new Error(`Request file property "method" must be one of: ${supportedMethods.join(', ')}.`);
	}

	return method as HttpMethod;
}

/**
 * Reads, validates, and serializes the request URL.
 */
function readUrl(value: Record<string, unknown>): string {
	const url = readRequiredString(value, 'url');

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error('Request file property "url" must be a valid URL.');
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('Request file property "url" must use http or https.');
	}

	return parsed.toString();
}

/**
 * Reads a request header map from the file, defaulting absent headers to `{}`.
 */
function readHeaders(value: Record<string, unknown>): Record<string, string> {
	const headers = value.headers;

	if (headers === undefined || headers === null) {
		return {};
	}

	if (!isRecord(headers)) {
		throw new Error('Request file property "headers" must be an object when provided.');
	}

	const normalized: Record<string, string> = {};

	for (const [name, headerValue] of Object.entries(headers)) {
		if (!name.trim()) {
			throw new Error('Request file header names must be non-empty strings.');
		}

		if (typeof headerValue !== 'string') {
			throw new Error(`Request file header "${name}" must have a string value.`);
		}

		normalized[name] = headerValue;
	}

	return normalized;
}

/**
 * Reads persisted header UI state, falling back to enabled headers for files
 * created before header enable/disable state existed.
 */
function readHeaderState(value: Record<string, unknown>): RequestHeaderDefinition[] {
	const headerState = value.headerState;

	if (headerState === undefined || headerState === null) {
		return Object.entries(readHeaders(value)).map(([name, headerValue]) => ({
			name,
			value: headerValue,
			enabled: true,
		}));
	}

	if (!Array.isArray(headerState)) {
		throw new Error('Request file property "headerState" must be an array when provided.');
	}

	return headerState.map(readHeaderStateEntry);
}

/**
 * Validates one persisted header row.
 */
function readHeaderStateEntry(header: unknown): RequestHeaderDefinition {
	if (!isRecord(header)) {
		throw new Error('Request file headerState entries must be objects.');
	}

	if (typeof header.name !== 'string' || !header.name.trim()) {
		throw new Error('Request file headerState names must be non-empty strings.');
	}

	if (typeof header.value !== 'string') {
		throw new Error(`Request file headerState "${header.name}" must have a string value.`);
	}

	if (typeof header.enabled !== 'boolean') {
		throw new Error(`Request file headerState "${header.name}" must have a boolean enabled flag.`);
	}

	return {
		name: header.name.trim(),
		value: header.value,
		enabled: header.enabled,
	};
}

/**
 * Reads persisted query param UI state, falling back to enabled params parsed
 * from the URL for files created before param state was stored separately.
 */
function readParams(value: Record<string, unknown>, url: string): RequestParamDefinition[] {
	const params = value.params;

	if (params === undefined || params === null) {
		return readParamsFromUrl(url);
	}

	if (!Array.isArray(params)) {
		throw new Error('Request file property "params" must be an array when provided.');
	}

	return params.map(readParam);
}

/**
 * Validates one persisted query parameter row.
 */
function readParam(param: unknown): RequestParamDefinition {
	if (!isRecord(param)) {
		throw new Error('Request file params must be objects.');
	}

	if (typeof param.name !== 'string' || !param.name.trim()) {
		throw new Error('Request file param names must be non-empty strings.');
	}

	if (typeof param.value !== 'string') {
		throw new Error(`Request file param "${param.name}" must have a string value.`);
	}

	if (typeof param.enabled !== 'boolean') {
		throw new Error(`Request file param "${param.name}" must have a boolean enabled flag.`);
	}

	return {
		name: param.name.trim(),
		value: param.value,
		enabled: param.enabled,
	};
}

/**
 * Derives enabled query parameter rows from the request URL.
 */
function readParamsFromUrl(url: string): RequestParamDefinition[] {
	return Array.from(new URL(url).searchParams.entries()).map(([name, value]) => ({
		name,
		value,
		enabled: true,
	}));
}
