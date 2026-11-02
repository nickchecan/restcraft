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
		const injected = updateEnvValue('', 'ACCESS_TOKEN', 'abc\nINJECT=value');
		assert.strictEqual(injected, 'ACCESS_TOKEN="abc\\nINJECT=value"\n');
		assert.strictEqual(parseEnvFile(injected).ACCESS_TOKEN, 'abc\nINJECT=value');
		assert.strictEqual(parseEnvFile(injected).INJECT, undefined);
	});

	test('round-trips dotenv escapes and leaves other values literal', () => {
		const pretty = '{\n  "id": "abc"\n}\n';
		const prettyStored = updateEnvValue('', 'BODY', pretty);
		assert.strictEqual(prettyStored, 'BODY="{\\n  \\"id\\": \\"abc\\"\\n}\\n"\n');
		assert.strictEqual(parseEnvFile(prettyStored).BODY, pretty);
		assert.strictEqual(prettyStored.split('\n').length, 2);

		const quoted = 'say "hi"';
		assert.strictEqual(updateEnvValue('', 'TOKEN', quoted), 'TOKEN=\'say "hi"\'\n');
		assert.strictEqual(parseEnvFile(updateEnvValue('', 'TOKEN', quoted)).TOKEN, quoted);

		const bothQuotes = 'it\'s "fine"';
		const bothStored = updateEnvValue('', 'TOKEN', bothQuotes);
		assert.strictEqual(bothStored, 'TOKEN="it\'s \\"fine\\""\n');
		assert.strictEqual(parseEnvFile(bothStored).TOKEN, bothQuotes);

		const slashed = 'C:\\temp\\';
		const slashStored = updateEnvValue('', 'PATH_X', slashed);
		assert.strictEqual(slashStored, 'PATH_X="C:\\\\temp\\\\"\n');
		assert.strictEqual(parseEnvFile(slashStored).PATH_X, slashed);
		assert.strictEqual(updateEnvValue('', 'PATH_X', 'end\\'), 'PATH_X="end\\"\n');
		assert.strictEqual(parseEnvFile(updateEnvValue('', 'PATH_X', 'end\\')).PATH_X, 'end\\');

		const spaced = 'a\tb\r\nc';
		const spacedStored = updateEnvValue('', 'BODY', spaced);
		assert.strictEqual(spacedStored, 'BODY="a\\tb\\r\\nc"\n');
		assert.strictEqual(parseEnvFile(spacedStored).BODY, spaced);

		assert.strictEqual(updateEnvValue('', 'TOKEN', 'abc'), 'TOKEN="abc"\n');
		assert.strictEqual(updateEnvValue('', 'TOKEN', 'a b'), 'TOKEN="a b"\n');
		assert.strictEqual(updateEnvValue('', 'TOKEN', "it's"), 'TOKEN="it\'s"\n');
		assert.strictEqual(updateEnvValue('', 'PATH_X', 'C:\\Users'), 'PATH_X="C:\\Users"\n');
		assert.strictEqual(parseEnvFile('PATH_X="C:\\Users"\n').PATH_X, 'C:\\Users');
		assert.strictEqual(parseEnvFile('FOO="a\\Tb\\xc"\n').FOO, 'a\\Tb\\xc');
		assert.strictEqual(parseEnvFile('PATH_X="C:\\temp"\n').PATH_X, 'C:\temp');
		assert.strictEqual(parseEnvFile('PATH_X="C:\\new"\n').PATH_X, 'C:\new');
		assert.strictEqual(parseEnvFile("FOO='C:\\temp'\nBAR=C:\\temp\nBAZ='a\\nb'\n").FOO, 'C:\\temp');
		assert.strictEqual(parseEnvFile("FOO='C:\\temp'\nBAR=C:\\temp\nBAZ='a\\nb'\n").BAR, 'C:\\temp');
		assert.strictEqual(parseEnvFile("FOO='C:\\temp'\nBAR=C:\\temp\nBAZ='a\\nb'\n").BAZ, 'a\\nb');
		assert.strictEqual(parseEnvFile(updateEnvValue('', 'BODY', 'café')).BODY, 'café');
		assert.strictEqual(updateEnvValue('', 'BODY', 'café'), 'BODY="café"\n');
		const separators = 'a\u2028b\u2029c';
		const separatorStored = updateEnvValue('', 'BODY', separators);
		assert.strictEqual(separatorStored, 'BODY="a\\u2028b\\u2029c"\n');
		assert.strictEqual(separatorStored.includes('\u2028'), false);
		assert.strictEqual(separatorStored.includes('\u2029'), false);
		assert.strictEqual(parseEnvFile(separatorStored).BODY, separators);
	});
});
