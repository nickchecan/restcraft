import * as assert from 'assert';
import { runInNewContext } from 'vm';

import { parseEnvFile, resolveRequestVariables } from '../../src/request/environment';
import { parseRequestFile } from '../../src/request/requestFile';
import { readQueryParamsFromUrl, serializeRequestUrl } from '../../src/request/requestUrl';
import { workbenchScript } from '../../src/webview/workbenchScript';

const variables = parseEnvFile('baseUrl=https://api.example.com\nAPI_HOST=edge.example.com\nUserId=42\n');

suite('Environment variable name case', () => {
	test('resolves mixed-case and uppercase names in a template URL, headers, and body', () => {
		// Arrange
		const parsed = parseRequestFile(
			JSON.stringify({
				name: 'Template origin',
				method: 'POST',
				url: '{{baseUrl}}/v1/{{API_HOST}}/users/{{UserId}}',
				headerState: [
					{ name: 'X-Host', value: '{{API_HOST}}', enabled: true },
					{ name: 'X-User', value: '{{UserId}}', enabled: true },
				],
				body: { host: '{{API_HOST}}', user: '{{UserId}}', base: '{{baseUrl}}' },
			}),
		);
		const formBody = new URLSearchParams([
			['user', '{{UserId}}'],
			['host', '{{API_HOST}}'],
		]).toString();

		// Act
		const resolved = resolveRequestVariables(
			{
				method: parsed.method,
				url: parsed.url,
				headers: parsed.headers,
				body: JSON.stringify(parsed.body),
			},
			variables,
		);
		const form = resolveRequestVariables(
			{
				method: 'POST',
				url: parsed.url,
				headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Base': '{{baseUrl}}' },
				body: formBody,
			},
			variables,
		);

		// Assert
		assert.strictEqual(parsed.url, '{{baseUrl}}/v1/{{API_HOST}}/users/{{UserId}}');
		assert.strictEqual(resolved.url, 'https://api.example.com/v1/edge.example.com/users/42');
		assert.strictEqual(resolved.headers?.['X-Host'], 'edge.example.com');
		assert.strictEqual(resolved.headers?.['X-User'], '42');
		assert.strictEqual(resolved.body, '{"host":"edge.example.com","user":"42","base":"https://api.example.com"}');
		assert.strictEqual(form.headers?.['X-Base'], 'https://api.example.com');
		assert.deepStrictEqual(Array.from(new URLSearchParams(form.body).entries()), [
			['user', '42'],
			['host', 'edge.example.com'],
		]);
	});

	test('keeps host and path variable case and does not match a different case', () => {
		// Arrange
		const parsed = parseRequestFile(
			JSON.stringify({
				name: 'Absolute',
				method: 'GET',
				url: 'https://{{API_HOST}}/v1/{{baseUrl}}',
				params: [],
				headerState: [{ name: 'Authorization', value: 'Bearer {{API_HOST}}', enabled: true }],
				body: { path: '{{baseUrl}}', host: '{{API_HOST}}' },
			}),
		);

		// Act
		const resolved = resolveRequestVariables(
			{
				method: parsed.method,
				url: parsed.url,
				headers: parsed.headers,
				body: JSON.stringify(parsed.body),
			},
			variables,
		);
		const missing = () =>
			resolveRequestVariables({ method: 'GET', url: parsed.url }, { api_host: 'lower.example', baseurl: 'lower-path' });

		// Assert
		assert.strictEqual(parsed.url, 'https://{{API_HOST}}/v1/{{baseUrl}}');
		assert.strictEqual(resolved.url, 'https://edge.example.com/v1/https://api.example.com');
		assert.strictEqual(resolved.headers?.Authorization, 'Bearer edge.example.com');
		assert.strictEqual(resolved.body, '{"path":"https://api.example.com","host":"edge.example.com"}');
		assert.throws(missing, /Missing environment variables: API_HOST, baseUrl/);
	});

	test('keeps variable case when the workbench rebuilds the request URL', () => {
		// Arrange
		const script = workbenchScript();
		const serializerStart = script.indexOf('const serializeRequestUrl = ');
		const serializer =
			serializerStart === -1
				? ''
				: script.slice(serializerStart, script.indexOf('function readEnabledRequestUrl()', serializerStart));
		const readEnabled = script.slice(
			script.indexOf('function readEnabledRequestUrl()'),
			script.indexOf('function readParamRows'),
		);
		const updateUrl = script.slice(
			script.indexOf('function updateUrlFromParams()'),
			script.indexOf('function updateRequestTabIndicators'),
		);
		const context = {
			url: { value: 'https://{{API_HOST}}/v1/{{baseUrl}}?old=1' },
			readParamRows: () => [['user', '{{UserId}}']],
			URL,
		};

		// Act
		const rebuilt = runInNewContext(
			`${serializer}\n${readEnabled}\n${updateUrl}\nconst sentUrl = readEnabledRequestUrl();\nupdateUrlFromParams();\n({ sent: sentUrl, saved: url.value })`,
			context,
		) as { sent: string; saved: string };

		// Assert
		assert.strictEqual(rebuilt.sent, 'https://{{API_HOST}}/v1/{{baseUrl}}?user={{UserId}}');
		assert.strictEqual(rebuilt.saved, 'https://{{API_HOST}}/v1/{{baseUrl}}?user={{UserId}}');
		const resolved = resolveRequestVariables(
			{
				method: 'GET',
				url: rebuilt.sent,
				headers: { 'X-User': '{{UserId}}' },
				body: '{"user":"{{UserId}}","host":"{{API_HOST}}"}',
			},
			variables,
		);
		assert.strictEqual(resolved.url, 'https://edge.example.com/v1/https://api.example.com?user=42');
		assert.strictEqual(resolved.headers?.['X-User'], '42');
		assert.strictEqual(resolved.body, '{"user":"42","host":"edge.example.com"}');
	});

	test('drops a disabled query row on a variable-first URL and reloads the table', () => {
		// Arrange
		const url = '{{baseUrl}}/x?a=1&b=2';
		const script = workbenchScript();
		const helpers = script.slice(
			script.indexOf('const serializeRequestUrl = '),
			script.indexOf('function readEnabledRequestUrl()'),
		);
		const readEnabled = script.slice(
			script.indexOf('function readEnabledRequestUrl()'),
			script.indexOf('function readParamRows'),
		);
		const readParams = script.slice(
			script.indexOf('function readParamsFromUrl()'),
			script.indexOf('function updateUrlFromParams()'),
		);
		const updateUrl = script.slice(
			script.indexOf('function updateUrlFromParams()'),
			script.indexOf('function updateRequestTabIndicators'),
		);
		const context = {
			url: { value: url },
			readParamRows: () => [['a', '1']],
			URL,
		};

		// Act
		const sent = serializeRequestUrl(url, [['a', '1']], false);
		const parsed = parseRequestFile(JSON.stringify({ name: 'Query', method: 'GET', url }));
		const workbench = runInNewContext(
			`${helpers}\n${readEnabled}\n${readParams}\n${updateUrl}\nconst loaded = readParamsFromUrl();\nconst sentUrl = readEnabledRequestUrl();\nupdateUrlFromParams();\n({ loaded, sentUrl, saved: url.value })`,
			context,
		) as { loaded: Array<[string, string]>; sentUrl: string; saved: string };

		// Assert
		assert.deepStrictEqual(sent, { url: '{{baseUrl}}/x?a=1' });
		assert.deepStrictEqual(parsed.params, [
			{ name: 'a', value: '1', enabled: true },
			{ name: 'b', value: '2', enabled: true },
		]);
		assert.deepStrictEqual(JSON.parse(JSON.stringify(workbench.loaded)) as Array<[string, string]>, [
			['a', '1'],
			['b', '2'],
		]);
		assert.strictEqual(workbench.sentUrl, '{{baseUrl}}/x?a=1');
		assert.strictEqual(workbench.saved, '{{baseUrl}}/x?a=1');
		assert.deepStrictEqual(readQueryParamsFromUrl(url), [
			['a', '1'],
			['b', '2'],
		]);
	});

	test('does not restore a placeholder onto a literal rc0var in the host, path, or query', () => {
		// Arrange
		const url = 'https://RC0VAR.example.com/rc0var/{{path}}';

		// Act
		const serialized = serializeRequestUrl(
			url,
			[
				['q', 'rc0var'],
				['v', '{{a}}'],
			],
			false,
		);
		const resolved = resolveRequestVariables(
			{ method: 'GET', url: serialized.url ?? '' },
			{ path: 'items', a: 'alpha' },
		);

		// Assert
		assert.strictEqual(serialized.url, 'https://rc0var.example.com/rc0var/{{path}}?q=rc0var&v={{a}}');
		assert.strictEqual(resolved.url, 'https://rc0var.example.com/rc0var/items?q=rc0var&v=alpha');
	});

	test('canonicalizes ordinary URLs and still rejects non-http URLs', () => {
		// Arrange
		// Act
		const origin = serializeRequestUrl('https://example.com', undefined, true);
		const query = serializeRequestUrl('https://example.com/users?a=1', [['b', '2']], true);
		const spaced = serializeRequestUrl('https://{{ API_HOST }}/{{ UserId }}', undefined, true);

		// Assert
		assert.deepStrictEqual(origin, { url: 'https://example.com/' });
		assert.deepStrictEqual(query, { url: 'https://example.com/users?b=2' });
		assert.deepStrictEqual(spaced, { url: 'https://{{ API_HOST }}/{{ UserId }}' });
		assert.deepStrictEqual(serializeRequestUrl('file:///tmp/example', undefined, true), { error: 'protocol' });
		assert.deepStrictEqual(serializeRequestUrl('not a url', undefined, true), { error: 'invalid' });
		assert.throws(
			() =>
				parseRequestFile(
					JSON.stringify({ name: 'Local file', method: 'GET', url: 'file:///tmp/example', headers: {}, body: null }),
				),
			/must use http or https/,
		);
	});
});
