import * as assert from 'assert';

import { updateEnvValue, parseEnvFile, resolveRequestVariables } from '../../src/request/environment';

suite('Environment variables', () => {
	test('parses env files', () => {
		// Arrange
		// Inputs are supplied directly to the operation below.

		// Act
		const actual = parseEnvFile(
			['# API environment', 'DOMAIN=https://google.com', 'TOKEN="abc123"', "PASSWORD='secret'", ''].join('\n'),
		);

		// Assert
		assert.deepStrictEqual(actual, {
			DOMAIN: 'https://google.com',
			TOKEN: 'abc123',
			PASSWORD: 'secret',
		});
	});

	test('resolves variables in request fields', () => {
		// Arrange
		// Act
		const request = resolveRequestVariables(
			{
				method: 'POST',
				url: '{{DOMAIN}}/endpoint',
				headers: {
					Authorization: 'Bearer {{TOKEN}}',
					'X-{{HEADER_NAME}}': '{{HEADER_VALUE}}',
				},
				body: '{"domain":"{{DOMAIN}}"}',
			},
			{
				DOMAIN: 'https://google.com',
				TOKEN: 'abc123',
				HEADER_NAME: 'Request-Id',
				HEADER_VALUE: 'request-1',
			},
		);

		// Assert
		assert.deepStrictEqual(request, {
			method: 'POST',
			url: 'https://google.com/endpoint',
			headers: {
				Authorization: 'Bearer abc123',
				'X-Request-Id': 'request-1',
			},
			body: '{"domain":"https://google.com"}',
		});
	});

	test('resolves variables inside basic auth credentials before sending', () => {
		// Arrange
		// Act
		const request = resolveRequestVariables(
			{
				method: 'GET',
				url: 'https://example.com',
				headers: {
					Authorization: `Basic ${Buffer.from('postman:{{PASSWORD}}', 'utf8').toString('base64')}`,
				},
			},
			{
				PASSWORD: 'secret',
			},
		);

		// Assert
		assert.strictEqual(
			request.headers?.Authorization,
			`Basic ${Buffer.from('postman:secret', 'utf8').toString('base64')}`,
		);
	});

	test('resolves variables in form url encoded body fields', () => {
		// Arrange
		// Act
		const request = resolveRequestVariables(
			{
				method: 'POST',
				url: 'https://example.com',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					username: 'postman',
					password: '{{PASSWORD}}',
				}).toString(),
			},
			{
				PASSWORD: 'secret',
			},
		);

		// Assert
		assert.deepStrictEqual(Array.from(new URLSearchParams(request.body).entries()), [
			['username', 'postman'],
			['password', 'secret'],
		]);
	});

	test('reports missing variables', () => {
		// Arrange
		// Act
		const actionUnderTest = () =>
			resolveRequestVariables(
				{
					method: 'GET',
					url: '{{DOMAIN}}/endpoint/{{ID}}',
				},
				{},
			);

		// Assert
		assert.throws(actionUnderTest, /Missing environment variables: DOMAIN, ID/);
	});
	test('updates token values without changing unrelated env lines or CRLF endings', () => {
		// Arrange
		const content = '# Config\r\nOTHER=keep\r\nACCESS_TOKEN=old\r\nACCESS_TOKEN=duplicate\r\n';
		// Act
		const updated = updateEnvValue(content, 'ACCESS_TOKEN', 'new.token=');
		// Assert
		assert.strictEqual(updated, '# Config\r\nOTHER=keep\r\nACCESS_TOKEN="new.token="\r\nACCESS_TOKEN="new.token="\r\n');
		assert.strictEqual(parseEnvFile(updated).ACCESS_TOKEN, 'new.token=');
		assert.strictEqual(updateEnvValue('OTHER=keep', 'MY_TOKEN', 'abc'), 'OTHER=keep\nMY_TOKEN="abc"\n');
		assert.strictEqual(parseEnvFile(updateEnvValue('', 'ACCESS_TOKEN', 'abc')).ACCESS_TOKEN, 'abc');
		assert.throws(() => updateEnvValue('', 'INVALID NAME', 'abc'), /variable name/);
		assert.throws(() => updateEnvValue('', 'ACCESS_TOKEN', 'abc\nINJECT=value'), /unsupported/);
	});
});
