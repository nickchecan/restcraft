import * as assert from 'assert';
import { setNetworkLogSink } from '../../src/request/networkLog';
import { executeRequest } from '../../src/request/requestRunner';

suite('Network output logging', () => {
	const originalFetch = globalThis.fetch;
	let entries: string[];
	setup(() => {
		entries = [];
		setNetworkLogSink((text) => entries.push(text));
	});
	teardown(() => {
		setNetworkLogSink(undefined);
		globalThis.fetch = originalFetch;
	});

	test('logs token and API calls with paired IDs and masks structured secrets', async () => {
		globalThis.fetch = async () =>
			new Response('{"access_token":"private-token","expires_in":3600}', {
				headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'private-cookie' },
			});
		const result = await executeRequest({
			method: 'POST',
			url: 'https://example.com/token?api_key=private-key',
			headers: { Authorization: 'Basic private-auth', 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'client_secret=private-secret&grant_type=client_credentials',
		});
		await executeRequest({ method: 'GET', url: 'https://example.com/data', body: 'omitted-body' });
		assert.strictEqual(JSON.parse(result.body).access_token, 'private-token');
		assert.strictEqual(entries.length, 4);
		const ids = entries.map((entry) => entry.match(/#\d+/)?.[0]);
		assert.strictEqual(ids[0], ids[1]);
		assert.strictEqual(ids[2], ids[3]);
		assert.notStrictEqual(ids[0], ids[2]);
		const log = entries.join('\n');
		for (const secret of [
			'private-token',
			'private-cookie',
			'private-key',
			'private-auth',
			'private-secret',
			'omitted-body',
		]) {
			assert.ok(!log.includes(secret), secret);
		}
		assert.ok(log.includes('client_credentials'));
		assert.ok(log.includes('3600'));
		assert.ok(log.includes('RESPONSE 200'));
	});

	test('applies redaction setting changes to new calls without changing actual responses', async () => {
		let enabled = false;
		setNetworkLogSink(
			(text) => entries.push(text),
			() => enabled,
		);
		const body = '{"access_token":"private-token"}';
		globalThis.fetch = async () =>
			new Response(body, {
				headers: { 'Set-Cookie': 'private-cookie' },
			});
		const request = {
			method: 'POST',
			url: 'https://example.com/token?api_key=private-key',
			headers: { Authorization: 'Basic private-auth', 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'client_secret=private-secret',
		};
		assert.strictEqual((await executeRequest(request)).body, body);
		const unredacted = entries.join('\n');
		for (const secret of ['private-token', 'private-cookie', 'private-key', 'private-auth', 'private-secret']) {
			assert.ok(unredacted.includes(secret), secret);
		}
		assert.ok(entries[1].includes(body));
		enabled = true;
		entries = [];
		assert.strictEqual((await executeRequest(request)).body, body);
		assert.ok(!entries.join('\n').includes('private-'));
		assert.ok(entries.join('\n').includes('[REDACTED]'));
	});

	test('records failures without exposing potentially sensitive exception messages', async () => {
		globalThis.fetch = async () => {
			throw new Error('private-error');
		};
		await assert.rejects(executeRequest({ method: 'GET', url: 'https://example.com' }), /private-error/);
		assert.ok(entries[1].includes('FAILED'));
		assert.ok(!entries.join('').includes('private-error'));
	});

	test('output failures do not affect successful requests', async () => {
		setNetworkLogSink(() => {
			throw new Error('disposed output');
		});
		globalThis.fetch = async () => new Response('complete response');
		assert.strictEqual((await executeRequest({ method: 'GET', url: 'https://example.com' })).body, 'complete response');
	});
});
