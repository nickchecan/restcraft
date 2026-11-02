import { ApiRequest } from './types';

const variablePattern = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/**
 * Parses the simple `.env` format used beside `.api.json` request files.
 *
 * Supported lines are `NAME=value`, with blank lines and `#` comments ignored.
 * Single-quoted and unquoted values are literal. Double quotes decode `\n`,
 * `\r`, `\t`, `\"`, `\\`, `\u2028`, and `\u2029`; any other backslash sequence stays as written.
 */
export function parseEnvFile(content: string): Record<string, string> {
	const values: Record<string, string> = {};

	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();

		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		const separatorIndex = trimmed.indexOf('=');

		if (separatorIndex === -1) {
			continue;
		}

		const name = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim();

		if (!name) {
			continue;
		}

		values[name] = decodeEnvValue(value);
	}

	return values;
}

/**
 * Substitutes `{{VARIABLE_NAME}}` references in URL, headers, and body.
 *
 * Missing variables are collected across the whole request so the caller can
 * show one actionable error. Basic auth credentials and form URL encoded bodies
 * need special handling because their serialized forms differ from what users
 * edit in the UI.
 */
export function resolveRequestVariables(request: ApiRequest, variables: Record<string, string>): ApiRequest {
	const missing = new Set<string>();
	const resolvedHeaders: Record<string, string> = {};

	for (const [name, value] of Object.entries(request.headers ?? {})) {
		resolvedHeaders[resolveVariables(name, variables, missing)] = resolveHeaderValue(name, value, variables, missing);
	}

	const resolved: ApiRequest = {
		method: request.method,
		url: resolveVariables(request.url, variables, missing),
		headers: resolvedHeaders,
	};

	if (request.body !== undefined) {
		resolved.body = resolveBody(request.body, resolvedHeaders, variables, missing);
	}

	if (missing.size > 0) {
		throw new Error(`Missing environment variable${missing.size === 1 ? '' : 's'}: ${Array.from(missing).join(', ')}`);
	}

	return resolved;
}

/**
 * Resolves a body after the headers have been resolved.
 *
 * Form URL encoded payloads are parsed as key/value pairs so variables inside
 * field names and values are substituted before the body is serialized again.
 */
function resolveBody(
	body: string,
	headers: Record<string, string>,
	variables: Record<string, string>,
	missing: Set<string>,
): string {
	if (!isFormUrlEncoded(headers)) {
		return resolveVariables(body, variables, missing);
	}

	const params = new URLSearchParams();

	for (const [name, value] of new URLSearchParams(body).entries()) {
		params.append(resolveVariables(name, variables, missing), resolveVariables(value, variables, missing));
	}

	return params.toString();
}

/**
 * Resolves a header value, preserving Basic auth wire format.
 *
 * The editor stores Basic auth as a base64 header value. To support variables in
 * the username/password fields, the credentials are decoded, resolved, and then
 * re-encoded before execution.
 */
function resolveHeaderValue(
	name: string,
	value: string,
	variables: Record<string, string>,
	missing: Set<string>,
): string {
	if (name.toLowerCase() !== 'authorization' || !value.startsWith('Basic ')) {
		return resolveVariables(value, variables, missing);
	}

	const encodedCredentials = value.slice('Basic '.length);
	const credentials = decodeBase64(encodedCredentials);
	const resolvedCredentials = resolveVariables(credentials, variables, missing);

	return `Basic ${encodeBase64(resolvedCredentials)}`;
}

/**
 * Replaces all variable placeholders and records unresolved names.
 */
function resolveVariables(value: string, variables: Record<string, string>, missing: Set<string>): string {
	return value.replace(variablePattern, (_match, name: string) => {
		if (Object.prototype.hasOwnProperty.call(variables, name)) {
			return variables[name];
		}

		missing.add(name);
		return '';
	});
}

/**
 * Detects whether headers declare a form URL encoded request body.
 */
function isFormUrlEncoded(headers: Record<string, string>): boolean {
	for (const [name, value] of Object.entries(headers)) {
		if (name.toLowerCase() === 'content-type') {
			return value.toLowerCase().includes('application/x-www-form-urlencoded');
		}
	}

	return false;
}

/** Backslash followed by a sequence this reader turns into a character. */
const recognizedEscape = /\\(?:\\|n|r|t|")/;

function decodeEnvValue(value: string): string {
	if (value.length < 2) {
		return value;
	}

	const quote = value[0];
	const last = value[value.length - 1];
	if (quote !== last || (quote !== '"' && quote !== "'")) {
		return value;
	}

	const inner = value.slice(1, -1);
	// Single quotes stay literal, matching files written before escape decoding.
	if (quote === "'") {
		return inner;
	}

	return decodeDoubleQuoted(inner);
}

/**
 * Decodes only the escapes we write.
 *
 * `\T` and `\x` stay as two characters so an unknown sequence is not rewritten.
 */
function decodeDoubleQuoted(value: string): string {
	let decoded = '';
	for (let index = 0; index < value.length; index++) {
		const current = value[index];
		const next = value[index + 1];
		if (current !== '\\' || next === undefined) {
			decoded += current;
			continue;
		}
		const unicode = value.slice(index + 1, index + 6);
		if (unicode === 'u2028' || unicode === 'u2029') {
			decoded += unicode === 'u2028' ? '\u2028' : '\u2029';
			index += 5;
			continue;
		}
		if (next === 'n') {
			decoded += '\n';
		} else if (next === 'r') {
			decoded += '\r';
		} else if (next === 't') {
			decoded += '\t';
		} else if (next === '"') {
			decoded += '"';
		} else if (next === '\\') {
			decoded += '\\';
		} else {
			decoded += `\\${next}`;
		}
		index++;
	}
	return decoded;
}

/**
 * Printable values keep the previous quoting so rewritten files do not churn.
 *
 * A double-quoted value is escaped when it contains a sequence the reader
 * decodes; single quotes can still hold a raw backslash.
 */
function isLegacyQuotedValue(value: string): boolean {
	if (!/^[\x20-\x7e]*$/.test(value) || (value.includes('"') && value.includes("'"))) {
		return false;
	}
	if (value.includes('"')) {
		return true;
	}
	return !recognizedEscape.test(value);
}

function encodeDotenvDoubleQuoted(value: string): string {
	let encoded = '';
	for (const character of value) {
		if (character === '\\') {
			encoded += '\\\\';
		} else if (character === '"') {
			encoded += '\\"';
		} else if (character === '\n') {
			encoded += '\\n';
		} else if (character === '\r') {
			encoded += '\\r';
		} else if (character === '\t') {
			encoded += '\\t';
		} else if (character === '\u2028') {
			encoded += '\\u2028';
		} else if (character === '\u2029') {
			encoded += '\\u2029';
		} else {
			encoded += character;
		}
	}
	return `"${encoded}"`;
}

function encodeEnvAssignment(name: string, value: string): string {
	if (isLegacyQuotedValue(value)) {
		const quote = value.includes('"') ? "'" : '"';
		return `${name}=${quote}${value}${quote}`;
	}

	return `${name}=${encodeDotenvDoubleQuoted(value)}`;
}

/**
 * Encodes UTF-8 text for Basic auth credentials.
 */
function encodeBase64(value: string): string {
	return Buffer.from(value, 'utf8').toString('base64');
}

/**
 * Decodes UTF-8 Basic auth credentials.
 */
function decodeBase64(value: string): string {
	return Buffer.from(value, 'base64').toString('utf8');
}

/** Updates a single .env key, preserving unrelated lines and line endings. */
export function updateEnvValue(content: string, name: string, value: string): string {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
		throw new Error('Enter a valid environment variable name (letters, numbers, and underscores).');
	}
	const assignment = encodeEnvAssignment(name, value);
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	const lines = content.split(/\r?\n/);
	let found = false;
	const updated = lines.map((line) => {
		const trimmed = line.trim();
		if (trimmed.startsWith('#') || trimmed.slice(0, trimmed.indexOf('=')).trim() !== name || !trimmed.includes('=')) {
			return line;
		}
		found = true;
		return assignment;
	});
	if (found) {
		return updated.join(eol);
	}
	return content + (content && !content.endsWith('\n') ? eol : '') + assignment + eol;
}
