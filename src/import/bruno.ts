import { isHttpMethod, RequestHeaderDefinition } from '../request/types';

export interface BrunoImport {
	content: string;
	warnings: string[];
}

type Blocks = Map<string, string>;

/** Reads BRU blocks using their outer, unindented closing delimiter. */
export function readBrunoBlocks(text: string): Blocks {
	const blocks: Blocks = new Map();
	const lines = text
		.replace(/^\uFEFF/, '')
		.replace(/\r\n/g, '\n')
		.split('\n');
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (!line.trim() || line.trimStart().startsWith('//')) {
			continue;
		}
		const start = /^([\w:-]+)\s*\{\s*$/.exec(line);
		if (!start || blocks.has(start[1])) {
			throw new Error('Invalid or duplicate Bruno block. Expected a BRU request file.');
		}
		const body: string[] = [];
		while (++index < lines.length && lines[index] !== '}') {
			body.push(lines[index]);
		}
		if (index === lines.length) {
			throw new Error(`Unclosed Bruno block: ${start[1]}.`);
		}
		blocks.set(start[1], body.join('\n'));
	}
	return blocks;
}

function rows(text = ''): RequestHeaderDefinition[] {
	return text.split('\n').flatMap((line) => {
		if (!line.trim() || line.trimStart().startsWith('@') || line.trimStart().startsWith('//')) {
			return [];
		}
		const pair = /^\s*(~)?("(?:[^"\\]|\\.)*"|[^:]+):\s*(.*)$/.exec(line);
		if (!pair) {
			throw new Error('Unsupported Bruno property syntax.');
		}
		return [
			{ name: pair[2].startsWith('"') ? JSON.parse(pair[2]) : pair[2].trim(), value: pair[3], enabled: !pair[1] },
		];
	});
}

function properties(text?: string): Record<string, string> {
	return Object.fromEntries(
		rows(text)
			.filter((row) => row.enabled)
			.map((row) => [row.name, row.value]),
	);
}

/** Converts HTTP BRU requests without running scripts, resolving secrets, or sending requests. */
export function convertBrunoRequest(text: string, inherited: Blocks[] = []): BrunoImport {
	const blocks = readBrunoBlocks(text);
	const metaText = blocks.get('meta') ?? '';
	// Tags are metadata and may be expressed as multiline arrays.
	const meta = properties(metaText.replace(/^\s*tags:\s*\[[\s\S]*?^\s*\]/m, ''));
	const methodBlock = [...blocks.keys()].filter((key) => isHttpMethod(key.toUpperCase()));
	if (meta.type !== 'http' || methodBlock.length !== 1 || !meta.name) {
		throw new Error('Expected a named Bruno HTTP request with one supported HTTP method.');
	}
	const method = methodBlock[0];
	const settings = properties(blocks.get(method));
	let url = settings.url;
	if (!url || !/^https?:\/\//.test(url.replace(/\{\{[^{}]+\}\}/g, 'https://example.com'))) {
		throw new Error('Bruno request requires an HTTP URL.');
	}
	try {
		const resolved = new URL(url.replace(/\{\{[^{}]+\}\}/g, 'example'));
		if (!['http:', 'https:'].includes(resolved.protocol)) {
			throw new Error('protocol');
		}
	} catch {
		if (!url.startsWith('{{')) {
			throw new Error('Bruno request requires a valid HTTP URL.');
		}
	}
	for (const row of rows(blocks.get('params:path')).filter((row) => row.enabled)) {
		url = url.replaceAll(`:${row.name}`, row.value);
	}
	const layers = [...inherited, blocks];
	const headerState: RequestHeaderDefinition[] = [];
	for (const layer of layers) {
		for (const row of rows(layer.get('headers'))) {
			const previous = headerState.findIndex((header) => header.name.toLowerCase() === row.name.toLowerCase());
			if (previous >= 0) {
				headerState.splice(previous, 1);
			}
			headerState.push(row);
		}
	}
	const warnings: string[] = [];
	for (const layer of layers) {
		for (const key of layer.keys()) {
			if (/^(script|tests|assert|vars|settings)/.test(key)) {
				warnings.push(`Bruno ${key} was not imported.`);
			}
		}
	}
	if (settings.auth === 'inherit' && inherited.length === 0) {
		warnings.push('Inherited authentication requires collection import; no authentication was added.');
	}
	let auth = settings.auth;
	let authLayer = blocks;
	if (!auth || auth === 'inherit') {
		for (const layer of [...inherited].reverse()) {
			const candidate = properties(layer.get('auth')).mode;
			if (candidate && candidate !== 'inherit') {
				auth = candidate;
				authLayer = layer;
				break;
			}
		}
	}
	if (auth && auth !== 'none' && auth !== 'inherit') {
		if (auth !== 'bearer') {
			throw new Error(`Unsupported Bruno authentication: ${auth}. Convert it manually before importing.`);
		}
		const token = properties(authLayer.get('auth:bearer')).token;
		if (!token) {
			throw new Error('Bruno bearer authentication requires a token.');
		}
		const index = headerState.findIndex((row) => row.name.toLowerCase() === 'authorization');
		if (index >= 0) {
			headerState.splice(index, 1);
		}
		headerState.push({ name: 'Authorization', value: `Bearer ${token}`, enabled: true });
	}
	let body: unknown = null;
	const bodyMode = settings.body ?? 'none';
	const contentTypes: Record<string, string> = {
		json: 'application/json',
		text: 'text/plain',
		xml: 'application/xml',
		'form-urlencoded': 'application/x-www-form-urlencoded',
	};
	if (bodyMode !== 'none') {
		const raw = blocks.get(`body:${bodyMode}`);
		if (raw === undefined || !(bodyMode in contentTypes)) {
			throw new Error(`Unsupported Bruno body mode: ${bodyMode}.`);
		}
		body = raw.replace(/^  /gm, '');
		if (bodyMode === 'json') {
			try {
				body = JSON.parse(body as string);
			} catch {
				warnings.push('JSON body contains variables or invalid JSON; imported as text.');
			}
		} else if (bodyMode === 'form-urlencoded') {
			body = new URLSearchParams(
				rows(raw)
					.filter((row) => row.enabled)
					.map((row) => [row.name, row.value]),
			).toString();
		}
		if (!headerState.some((row) => row.enabled && row.name.toLowerCase() === 'content-type')) {
			headerState.push({ name: 'Content-Type', value: contentTypes[bodyMode], enabled: true });
		}
	}
	const params = blocks.has('params:query') ? rows(blocks.get('params:query')) : undefined;
	const content = `${JSON.stringify({ name: meta.name, method: method.toUpperCase(), url, ...(params ? { params } : {}), headerState, body, ...(blocks.has('docs') ? { description: blocks.get('docs')!.replace(/^  /gm, '') } : {}) }, null, 2)}\n`;
	return { content, warnings: [...new Set(warnings)] };
}
