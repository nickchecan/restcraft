import { parseDocument } from 'yaml';
import { isRecord } from '../shared/object';
import { isHttpMethod, RequestHeaderDefinition, RequestParamDefinition } from '../request/types';
import type { BrunoImport } from './bruno';

export interface BrunoYamlSettings {
	headers: RequestHeaderDefinition[];
	auth?: unknown;
	warnings: string[];
}

/** Parses data only, rejecting duplicate keys and limiting alias expansion. */
export function readBrunoYaml(text: string): Record<string, unknown> {
	try {
		const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
		if (document.errors.length || document.warnings.length) {
			throw new Error('syntax');
		}
		const value: unknown = document.toJS({ maxAliasCount: 50 });
		if (!isRecord(value)) {
			throw new Error('shape');
		}
		return value;
	} catch {
		// Parser diagnostics can contain credentials from the source line.
		throw new Error('Invalid Bruno YAML: expected one mapping document with unique keys and supported YAML syntax.');
	}
}

function record(value: unknown, field: string): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new Error(`Bruno YAML ${field} must be an object.`);
	}
	return value;
}

function string(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`Bruno YAML ${field} must be a non-empty string.`);
	}
	return value;
}

function scalar(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (!['string', 'number', 'boolean'].includes(typeof value)) {
		throw new Error('Bruno YAML header and parameter values must be scalars.');
	}
	return String(value);
}

function rows(value: unknown, field: string): RequestParamDefinition[] {
	if (value === undefined) {
		return [];
	}
	if (!Array.isArray(value)) {
		throw new Error(`Bruno YAML ${field} must be an array.`);
	}
	return value.map((item) => {
		const row = record(item, field);
		if (row.disabled !== undefined && typeof row.disabled !== 'boolean') {
			throw new Error(`Bruno YAML ${field} disabled flags must be booleans.`);
		}
		return { name: string(row.name, `${field} name`), value: scalar(row.value), enabled: row.disabled !== true };
	});
}

function omittedWarnings(value: Record<string, unknown>): string[] {
	return ['runtime', 'settings', 'config', 'variables', 'scripts', 'assertions', 'tests']
		.filter((key) => value[key] !== undefined)
		.map((key) => `Bruno YAML ${key} was not imported.`);
}

/** Collection and folder files store inherited HTTP settings under request. */
export function readBrunoYamlSettings(value: Record<string, unknown>): BrunoYamlSettings {
	const request = value.request === undefined ? {} : record(value.request, 'request');
	return {
		headers: rows(request.headers, 'request.headers'),
		auth: request.auth,
		warnings: [...omittedWarnings(value), ...omittedWarnings(request)],
	};
}

function authType(auth: unknown): string {
	if (auth === undefined || auth === 'inherit') {
		return 'inherit';
	}
	if (auth === null || auth === 'none') {
		return 'none';
	}
	return string(record(auth, 'auth').type, 'auth.type');
}

export function convertBrunoYamlRequest(text: string, inherited: BrunoYamlSettings[] = []): BrunoImport {
	const value = readBrunoYaml(text);
	const info = record(value.info, 'info');
	const http = record(value.http, 'http');
	if (info.type !== 'http') {
		throw new Error('Expected a Bruno YAML HTTP request.');
	}
	const name = string(info.name, 'info.name');
	const method = string(http.method, 'http.method').toUpperCase();
	if (!isHttpMethod(method)) {
		throw new Error('Unsupported Bruno YAML HTTP method.');
	}
	let url = string(http.url, 'http.url');
	try {
		const resolved = new URL(url.replace(/\{\{[^{}]+\}\}/g, 'example'));
		if (!['http:', 'https:'].includes(resolved.protocol)) {
			throw new Error('protocol');
		}
	} catch {
		if (!/^\{\{[^{}]+\}\}(?:\/|$)/.test(url)) {
			throw new Error('Bruno YAML request requires a valid HTTP URL or base URL variable.');
		}
	}
	const warnings = [
		...inherited.flatMap((layer) => layer.warnings),
		...omittedWarnings(value),
		...omittedWarnings(http),
	];
	const headerState: RequestHeaderDefinition[] = [];
	const setHeader = (row: RequestHeaderDefinition) => {
		const index = headerState.findIndex((header) => header.name.toLowerCase() === row.name.toLowerCase());
		if (index >= 0) {
			headerState.splice(index, 1);
		}
		headerState.push({ ...row });
	};
	for (const header of [...inherited.flatMap((layer) => layer.headers), ...rows(http.headers, 'http.headers')]) {
		setHeader(header);
	}
	let auth = http.auth;
	if (authType(auth) === 'inherit') {
		for (const parent of [...inherited].reverse()) {
			if (authType(parent.auth) !== 'inherit') {
				auth = parent.auth;
				break;
			}
		}
		if (!inherited.length && http.auth !== undefined) {
			warnings.push('Inherited authentication requires collection import; no authentication was added.');
		}
	}
	const type = authType(auth);
	if (type === 'bearer') {
		setHeader({
			name: 'Authorization',
			value: `Bearer ${string(record(auth, 'auth').token, 'auth.token')}`,
			enabled: true,
		});
	} else if (!['none', 'inherit'].includes(type)) {
		throw new Error(`Unsupported Bruno YAML authentication: ${type}. Convert it manually before importing.`);
	}
	let params: RequestParamDefinition[] | undefined;
	if (http.params !== undefined) {
		let query: unknown;
		let path: unknown;
		if (Array.isArray(http.params)) {
			for (const param of http.params) {
				if (!isRecord(param) || !['query', 'path'].includes(String(param.type))) {
					throw new Error('Bruno YAML parameters require a query or path type.');
				}
			}
			query = http.params.filter((param) => param.type === 'query');
			path = http.params.filter((param) => param.type === 'path');
		} else {
			const groups = record(http.params, 'http.params');
			query = groups.query;
			path = groups.path;
		}
		if (query !== undefined) {
			params = rows(query, 'query parameters');
		}
		for (const param of rows(path, 'path parameters').filter((row) => row.enabled)) {
			const escaped = param.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			url = url.replace(new RegExp(`:${escaped}(?=[/?&#.]|$)`, 'g'), () => param.value);
		}
	}
	let body: unknown = null;
	if (http.body !== undefined && http.body !== null) {
		const definition = record(http.body, 'http.body');
		const bodyType = string(definition.type, 'http.body.type');
		const contentTypes: Record<string, string> = {
			json: 'application/json',
			text: 'text/plain',
			xml: 'application/xml',
			'form-urlencoded': 'application/x-www-form-urlencoded',
		};
		if (bodyType !== 'none') {
			if (!Object.hasOwn(contentTypes, bodyType)) {
				throw new Error(`Unsupported Bruno YAML body mode: ${bodyType}.`);
			}
			if (bodyType === 'form-urlencoded') {
				body = new URLSearchParams(
					rows(definition.data, 'form body')
						.filter((row) => row.enabled)
						.map((row) => [row.name, row.value]),
				).toString();
			} else {
				if (typeof definition.data !== 'string') {
					throw new Error('Bruno YAML body data must be a string.');
				}
				body = definition.data;
				if (bodyType === 'json') {
					try {
						body = JSON.parse(definition.data);
					} catch {
						warnings.push('JSON body contains variables or invalid JSON; imported as text.');
					}
				}
			}
			if (!headerState.some((row) => row.enabled && row.name.toLowerCase() === 'content-type')) {
				setHeader({ name: 'Content-Type', value: contentTypes[bodyType], enabled: true });
			}
		}
	}
	let description: string | undefined;
	if (value.docs !== undefined) {
		const docs = isRecord(value.docs) ? value.docs.content : value.docs;
		if (typeof docs !== 'string') {
			throw new Error('Bruno YAML docs must contain text.');
		}
		description = docs;
	}
	return {
		content: `${JSON.stringify({ name, method, url, ...(params ? { params } : {}), headerState, body, ...(description !== undefined ? { description } : {}) }, null, 2)}\n`,
		warnings: [...new Set(warnings)],
	};
}
