import * as assert from 'assert';

import { executeRequest } from '../src/request/requestRunner';

suite('Request runner', () => {
	const originalFetch = globalThis.fetch;

	teardown(() => {
		globalThis.fetch = originalFetch;
	});

	test('normalizes request fields before sending', async () => {
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

		const response = await executeRequest({
			method: ' post ',
			url: ' https://example.com/users ',
			headers: {
				Accept: 'application/json',
			},
			body: '{"name":"Ada"}',
		});

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
		const sentBodies: unknown[] = [];

		globalThis.fetch = async (_input, init) => {
			sentBodies.push(init?.body);

			return new Response('ignored', {
				status: 200,
				statusText: 'OK',
			});
		};

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

		assert.deepStrictEqual(sentBodies, [undefined, undefined]);
		assert.strictEqual(headResponse.body, '');
	});

	test('reports unsupported methods before sending', async () => {
		let fetchWasCalled = false;

		globalThis.fetch = async () => {
			fetchWasCalled = true;
			return new Response();
		};

		await assert.rejects(
			() => executeRequest({
				method: 'TRACE',
				url: 'https://example.com',
			}),
			/Unsupported HTTP method: TRACE/,
		);
		assert.strictEqual(fetchWasCalled, false);
	});
});
