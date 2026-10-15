import { NetworkHistoryEntry } from './networkHistory';
import { ApiRequest, ApiResponse } from './types';

let sink: ((text: string) => void) | undefined;
let historySink: ((entry: NetworkHistoryEntry) => void) | undefined;
let sequence = 0;
let shouldRedact = () => true;

/** Installs the extension-owned output sink; execution also works without a logger. */
export function setNetworkLogSink(
	value: ((text: string) => void) | undefined,
	redactSensitiveContent: () => boolean = () => true,
	onHistoryEntry?: (entry: NetworkHistoryEntry) => void,
): void {
	sink = value;
	historySink = onHistoryEntry;
	shouldRedact = redactSensitiveContent;
}

const sensitive = /authorization|cookie|token|secret|password|passwd|api[-_]?key|^code$|code_verifier|^state$/i;
const hidden = '[REDACTED]';

function redact(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(redact);
	}
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? hidden : redact(item)]),
		);
	}
	return value;
}

function bodyText(body: string | undefined, headers: Record<string, string> = {}, redactContent = true): string {
	if (!body) {
		return '(empty)';
	}
	if (!redactContent) {
		return body;
	}
	try {
		return JSON.stringify(redact(JSON.parse(body)), null, 2);
	} catch {
		const contentType = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1];
		if (contentType?.includes('application/x-www-form-urlencoded')) {
			const params = new URLSearchParams(body);
			for (const key of new Set(params.keys())) {
				if (sensitive.test(key)) {
					params.set(key, hidden);
				}
			}
			return params.toString();
		}
		return body;
	}
}

function safeUrl(value: string): string {
	const url = new URL(value);
	if (url.username) {
		url.username = hidden;
	}
	if (url.password) {
		url.password = hidden;
	}
	for (const key of new Set(url.searchParams.keys())) {
		if (sensitive.test(key)) {
			url.searchParams.set(key, hidden);
		}
	}
	url.hash = '';
	return url.toString();
}

function write(text: string): void {
	try {
		sink?.(text);
	} catch {
		// Logging must never prevent a request or change its outcome.
	}
}

/** Logs the effective fetch input and returns a completion logger with the same ID. */
export function startNetworkLog(
	request: ApiRequest,
): (result: ApiResponse | 'cancelled' | 'timeout' | 'failed') => void {
	if (!sink && !historySink) {
		return () => {};
	}
	const redactContent = shouldRedact();
	const visible = (value: unknown) => (redactContent ? redact(value) : value);
	const id = ++sequence;
	const started = Date.now();
	const requestText = `[${new Date(started).toISOString()}] #${id} REQUEST ${request.method} ${redactContent ? safeUrl(request.url) : request.url}\nHeaders: ${JSON.stringify(visible(request.headers ?? {}), null, 2)}\nBody:\n${bodyText(request.body, request.headers, redactContent)}\n`;
	write(requestText);
	const entry: NetworkHistoryEntry = {
		id,
		started: new Date(started).toISOString(),
		method: request.method,
		url: redactContent ? safeUrl(request.url) : request.url,
		request: historyText(requestText),
		status: 'Pending',
		redacted: redactContent,
	};
	publishHistory(entry);
	return (result) => {
		const prefix = `[${new Date().toISOString()}] #${id} (${Date.now() - started} ms)`;
		entry.durationMs = Date.now() - started;
		if (typeof result === 'string') {
			entry.status = result.toUpperCase();
			entry.response = `${prefix} ${entry.status}\n`;
			write(entry.response);
		} else {
			entry.status = `${result.status} ${result.statusText}`;
			const responseText = `${prefix} RESPONSE ${result.status} ${result.statusText}\nHeaders: ${JSON.stringify(visible(result.headers), null, 2)}\nBody:\n${bodyText(result.body, result.headers, redactContent)}\n`;
			write(responseText);
			entry.response = historyText(responseText);
		}
		publishHistory(entry);
	};
}

function historyText(text: string): string {
	const limit = 100_000;
	return text.length > limit
		? `${text.slice(0, limit)}\n[History preview truncated at 100,000 characters; see Output for full text.]`
		: text;
}

function publishHistory(entry: NetworkHistoryEntry): void {
	try {
		historySink?.(entry);
	} catch {
		// History must not affect network execution.
	}
}
