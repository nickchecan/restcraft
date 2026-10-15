import { startNetworkLog } from './networkLog';
import { ApiRequest, ApiResponse, isHttpMethod } from './types';

export type StreamUpdate = Omit<ApiResponse, 'body'> & { chunk: string };
export type StreamListener = (update: StreamUpdate) => void;

/**
 * Executes a validated API request using the extension host's fetch runtime.
 *
 * The runner accepts the same lightweight request shape used by the webview
 * bridge, then normalizes method and URL before any network activity. Bodies are
 * omitted for GET and HEAD to match fetch/HTTP expectations.
 */
export async function executeRequest(
	request: ApiRequest,
	timeoutMs = 30000,
	signal?: AbortSignal,
	redirect: 'follow' | 'error' = 'follow',
	onStream?: StreamListener,
): Promise<ApiResponse> {
	const method = normalizeMethod(request.method);
	const url = normalizeUrl(request.url);
	const controller = new AbortController();
	let didTimeout = false;
	const abortFromCaller = () => controller.abort();
	if (signal?.aborted) {
		controller.abort();
	} else {
		signal?.addEventListener('abort', abortFromCaller, { once: true });
	}
	const timeout =
		timeoutMs > 0
			? setTimeout(() => {
					didTimeout = true;
					controller.abort();
				}, timeoutMs)
			: undefined;

	const body = shouldSendBody(method, request.body) ? request.body : undefined;
	const completeLog = startNetworkLog({ method, url, headers: request.headers, body });
	try {
		const response = await fetch(url, {
			method,
			redirect,
			headers: request.headers,
			body,
			signal: controller.signal,
		});

		const metadata = {
			status: response.status,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries()),
		};
		let responseBody = '';
		if (
			method !== 'HEAD' &&
			onStream &&
			response.body &&
			response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'text/event-stream'
		) {
			onStream({ ...metadata, chunk: '' });
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			try {
				while (true) {
					const { done, value } = await reader.read();
					const chunk = done ? decoder.decode() : decoder.decode(value, { stream: true });
					responseBody += chunk;
					if (chunk) {
						onStream({ ...metadata, chunk });
					}
					if (done) {
						break;
					}
				}
			} finally {
				reader.releaseLock();
			}
		} else if (method !== 'HEAD') {
			responseBody = await response.text();
		}
		const result: ApiResponse = { ...metadata, body: responseBody };
		completeLog(result);
		return result;
	} catch (error) {
		completeLog(controller.signal.aborted ? (didTimeout ? 'timeout' : 'cancelled') : 'failed');
		if (controller.signal.aborted) {
			throw new Error(didTimeout ? `Request timed out after ${timeoutMs} ms.` : 'Request cancelled.');
		}

		throw error;
	} finally {
		if (timeout !== undefined) {
			clearTimeout(timeout);
		}
		signal?.removeEventListener('abort', abortFromCaller);
	}
}

/**
 * Determines whether the HTTP method may carry the provided body.
 */
function shouldSendBody(method: string, body: string | undefined): body is string {
	return method !== 'GET' && method !== 'HEAD' && body !== undefined && body.length > 0;
}

/**
 * Normalizes and validates an HTTP method before `fetch` sees it.
 */
function normalizeMethod(method: string): string {
	const normalized = method.trim().toUpperCase();

	if (!isHttpMethod(normalized)) {
		throw new Error(`Unsupported HTTP method: ${method}`);
	}

	return normalized;
}

/**
 * Normalizes and validates a request URL before network execution.
 */
function normalizeUrl(url: string): string {
	const trimmed = url.trim();

	if (!trimmed) {
		throw new Error('Enter a request URL.');
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error('Enter a valid request URL.');
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('Only http and https URLs are supported.');
	}

	return parsed.toString();
}
