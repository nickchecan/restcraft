import * as assert from 'assert';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { parseEnvFile, resolveRequestVariables } from '../../src/request/environment';
import { parseRequestFile } from '../../src/request/requestFile';
import { executeRequest } from '../../src/request/requestRunner';

suite('Request execution with a local HTTP server', () => {
	let server: Server;
	let baseUrl: string;

	setup(async () => {
		server = createServer((request, response) => {
			if (request.url === '/redirect') {
				response.writeHead(302, { Location: '/echo' });
				response.end();
				return;
			}
			const chunks: Buffer[] = [];
			request.on('data', (chunk: Buffer) => chunks.push(chunk));
			request.on('end', () => {
				response.writeHead(201, { 'Content-Type': 'application/json', 'X-Restcraft-Test': 'true' });
				response.end(
					JSON.stringify({
						method: request.method,
						token: request.headers.authorization,
						body: Buffer.concat(chunks).toString(),
					}),
				);
			});
		});
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	teardown(async () => {
		if (!server.listening) {
			return;
		}
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	});

	test('resolves environment values and sends the resulting request using real HTTP', async () => {
		// Arrange
		const environment = parseEnvFile(`BASE_URL=${baseUrl}\nTOKEN=fixture-token`);
		const request = resolveRequestVariables(
			{
				method: 'POST',
				url: '{{BASE_URL}}/echo',
				headers: { Authorization: 'Bearer {{TOKEN}}' },
				body: '{"value":42}',
			},
			environment,
		);

		// Act
		const response = await executeRequest(request);

		// Assert
		assert.strictEqual(response.status, 201);
		assert.strictEqual(response.headers['x-restcraft-test'], 'true');
		assert.deepStrictEqual(JSON.parse(response.body), {
			method: 'POST',
			token: 'Bearer fixture-token',
			body: '{"value":42}',
		});
	});

	test('follows redirects by default and rejects them for token-style execution', async () => {
		// Arrange
		const request = { method: 'GET', url: `${baseUrl}/redirect` };

		// Act
		const response = await executeRequest(request);
		const redirectedTokenRequest = executeRequest(request, 30000, undefined, 'error');

		// Assert
		assert.strictEqual(response.status, 201);
		await assert.rejects(redirectedTokenRequest);
	});

	test('omits disabled authorization headers when executing a parsed request file', async () => {
		// Arrange
		const file = JSON.stringify({
			name: 'Disabled credentials',
			method: 'GET',
			url: `${baseUrl}/echo`,
			headerState: [{ name: 'Authorization', value: 'Bearer must-not-send', enabled: false }],
		});

		// Act
		const parsed = parseRequestFile(file);
		const response = await executeRequest({ method: parsed.method, url: parsed.url, headers: parsed.headers });

		// Assert
		assert.strictEqual(response.status, 201);
		assert.strictEqual(JSON.parse(response.body).token, undefined);
		assert.strictEqual(parsed.headerState[0].value, 'Bearer must-not-send');
		assert.strictEqual(parsed.headerState[0].enabled, false);
	});

	test('returns no response body for HEAD', async () => {
		// Arrange
		const request = { method: 'HEAD', url: `${baseUrl}/echo` };

		// Act
		const response = await executeRequest(request);

		// Assert
		assert.strictEqual(response.status, 201);
		assert.strictEqual(response.body, '');
	});
});
