import * as assert from 'assert';

import { executeRequest } from '../../src/request/requestRunner';

suite('Request runner', () => {
	const originalFetch = globalThis.fetch;

	teardown(() => {
		globalThis.fetch = originalFetch;
	});

	test('delivers SSE before completion and decodes split UTF-8 without changing raw text', async () => {
		let transport!: ReadableStreamDefaultController<Uint8Array>;
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				transport = controller;
			},
		});
		globalThis.fetch = async () =>
			new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
		const raw = 'data: {"text":"café"}\n\n';
		const bytes = new TextEncoder().encode(raw);
		const split = bytes.indexOf(0xc3) + 1;
		const chunks: string[] = [];
		let received!: () => void;
		const firstChunk = new Promise<void>((resolve) => {
			received = resolve;
		});
		const pending = executeRequest({ method: 'GET', url: 'https://example.com' }, 0, undefined, 'follow', (update) => {
			chunks.push(update.chunk);
			if (update.chunk) {
				received();
			}
		});
		transport.enqueue(bytes.slice(0, split));
		await firstChunk;
		assert.strictEqual(chunks.join(''), 'data: {"text":"caf');
		transport.enqueue(bytes.slice(split));
		transport.close();
		assert.strictEqual((await pending).body, raw);
		assert.strictEqual(chunks.join(''), raw);
	});

	test('cancelling a live stream retains delivered chunks and reports cancellation', async () => {
		const abort = new AbortController();
		globalThis.fetch = async (_input, init) =>
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode('data: first\n\n'));
						init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
					},
				}),
				{ headers: { 'Content-Type': 'text/event-stream' } },
			);
		const chunks: string[] = [];
		await assert.rejects(
			executeRequest({ method: 'GET', url: 'https://example.com' }, 0, abort.signal, 'follow', (update) => {
				if (update.chunk) {
					chunks.push(update.chunk);
					abort.abort();
				}
			}),
			/Request cancelled/,
		);
		assert.deepStrictEqual(chunks, ['data: first\n\n']);
	});

	test('times out while waiting for the next event and keeps delivered chunks', async () => {
		globalThis.fetch = async (_input, init) =>
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode('data: first\n\n'));
						init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
					},
				}),
				{ headers: { 'Content-Type': 'text/event-stream' } },
			);
		const chunks: string[] = [];
		await assert.rejects(
			executeRequest({ method: 'GET', url: 'https://example.com' }, 10, undefined, 'follow', (update) => {
				if (update.chunk) {
					chunks.push(update.chunk);
				}
			}),
			/Request timed out after 10 ms/,
		);
		assert.deepStrictEqual(chunks, ['data: first\n\n']);
	});

	test('ordinary JSON responses remain buffered even when a stream listener is provided', async () => {
		globalThis.fetch = async () => new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
		let updates = 0;
		const response = await executeRequest({ method: 'GET', url: 'https://example.com' }, 0, undefined, 'follow', () => {
			updates++;
		});
		assert.strictEqual(response.body, '{"ok":true}');
		assert.strictEqual(updates, 0);
	});

	test('normalizes request fields before sending', async () => {
		// Arrange
		let capturedInput: string | URL | Request | undefined;
		let capturedInit: RequestInit | undefined;

		globalThis.fetch = async (input, init) => {
			capturedInput = input;
			capturedInit = init;

			return new Response('{"ok":true}', {
				status: 201,
				statusText: 'Created',
				headers: {
					'Content-Type': 'application/json',
				},
			});
		};

		// Act
		const response = await executeRequest({
			method: ' post ',
			url: ' https://example.com/users ',
			headers: {
				Accept: 'application/json',
			},
			body: '{"name":"Ada"}',
		});

		// Assert
		assert.strictEqual(capturedInput, 'https://example.com/users');
		assert.strictEqual(capturedInit?.method, 'POST');
		assert.deepStrictEqual(capturedInit?.headers, {
			Accept: 'application/json',
		});
		assert.strictEqual(capturedInit?.body, '{"name":"Ada"}');
		assert.ok(capturedInit?.signal instanceof AbortSignal);
		assert.deepStrictEqual(response, {
			status: 201,
			statusText: 'Created',
			headers: {
				'content-type': 'application/json',
			},
			body: '{"ok":true}',
		});
	});

	test('does not send a body for GET or HEAD requests', async () => {
		// Arrange
		const sentBodies: unknown[] = [];

		globalThis.fetch = async (_input, init) => {
			sentBodies.push(init?.body);

			return new Response('ignored', {
				status: 200,
				statusText: 'OK',
			});
		};

		// Act
		await executeRequest({
			method: 'GET',
			url: 'https://example.com',
			body: 'ignored',
		});
		const headResponse = await executeRequest({
			method: 'HEAD',
			url: 'https://example.com',
			body: 'ignored',
		});

		// Assert
		assert.deepStrictEqual(sentBodies, [undefined, undefined]);
		assert.strictEqual(headResponse.body, '');
	});

	test('reports unsupported methods before sending', async () => {
		// Arrange
		let fetchWasCalled = false;

		globalThis.fetch = async () => {
			fetchWasCalled = true;
			return new Response();
		};

		// Act
		const actionUnderTest = () =>
			executeRequest({
				method: 'TRACE',
				url: 'https://example.com',
			});

		// Assert
		await assert.rejects(actionUnderTest, /Unsupported HTTP method: TRACE/);
		assert.strictEqual(fetchWasCalled, false);
	});
});

suite('Request runner failure and cancellation boundaries', () => {
	const originalFetch = globalThis.fetch;

	teardown(() => {
		globalThis.fetch = originalFetch;
	});

	test('rejects invalid URLs before invoking the transport', async () => {
		// Arrange
		let calls = 0;
		globalThis.fetch = async () => {
			calls += 1;
			return new Response();
		};

		// Act
		const results = await Promise.allSettled(
			['', 'not a url', 'file:///tmp/request'].map((url) => executeRequest({ method: 'GET', url })),
		);

		// Assert
		assert.strictEqual(calls, 0);
		assert.deepStrictEqual(
			results.map((result) => (result.status === 'rejected' ? (result.reason as Error).message : '')),
			['Enter a request URL.', 'Enter a valid request URL.', 'Only http and https URLs are supported.'],
		);
	});

	test('reports timeout distinctly from caller cancellation', async () => {
		// Arrange
		globalThis.fetch = async (_input, init) =>
			new Promise<Response>((_resolve, reject) => {
				const signal = init?.signal;
				if (signal?.aborted) {
					reject(new Error('Transport aborted'));
				} else {
					signal?.addEventListener('abort', () => reject(new Error('Transport aborted')), { once: true });
				}
			});
		const cancelled = new AbortController();
		cancelled.abort();

		// Act
		const results = await Promise.allSettled([
			executeRequest({ method: 'GET', url: 'https://example.com' }, 5),
			executeRequest({ method: 'GET', url: 'https://example.com' }, 0, cancelled.signal),
		]);

		// Assert
		assert.deepStrictEqual(
			results.map((result) => (result.status === 'rejected' ? (result.reason as Error).message : '')),
			['Request timed out after 5 ms.', 'Request cancelled.'],
		);
	});

	test('forwards redirects and permits a disabled timeout without changing transport failures', async () => {
		// Arrange
		const failure = new Error('Connection unavailable');
		let redirect: RequestInit['redirect'];
		globalThis.fetch = async (_input, init) => {
			redirect = init?.redirect;
			throw failure;
		};

		// Act
		const result = executeRequest({ method: 'POST', url: 'https://example.com', body: '' }, 0, undefined, 'error');

		// Assert
		await assert.rejects(result, (error) => error === failure);
		assert.strictEqual(redirect, 'error');
	});
});
