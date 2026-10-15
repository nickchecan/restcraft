import * as assert from 'assert';
import { isResponseHeaderMappings, responseHeaderAssignments } from '../../src/request/automation';
import { parseEnvFile, updateEnvValue } from '../../src/request/environment';
import { parseRequestFile } from '../../src/request/requestFile';
import { createUpdatedRequestDocumentText } from '../../src/webview/requestDocument';

suite('Response header automation', () => {
	const automation = [{ header: 'X-Session', variable: 'SESSION', enabled: true }];
	test('matches case-insensitively and skips absent and disabled headers', () => {
		assert.deepStrictEqual(
			Object.entries(
				responseHeaderAssignments(
					[
						...automation,
						{ header: 'Missing', variable: 'OLD', enabled: true },
						{ header: 'X-Session', variable: 'DISABLED', enabled: false },
					],
					{ 'x-session': 'session value' },
				),
			),
			[['SESSION', 'session value']],
		);
	});

	test('round-trips persistence, preserves unrelated fields, and removes cleared mappings', () => {
		const message = {
			type: 'requestChanged' as const,
			name: 'Session',
			method: 'GET',
			url: 'https://example.com/',
			params: [],
			headerState: [],
			headers: {},
			body: '',
			automation,
		};
		const saved = createUpdatedRequestDocumentText('{"custom":true}', message);
		assert.deepStrictEqual(parseRequestFile(saved).automation, automation);
		assert.strictEqual(JSON.parse(saved).custom, true);
		assert.strictEqual(
			parseRequestFile(createUpdatedRequestDocumentText(saved, { ...message, automation: [] })).automation,
			undefined,
		);
	});

	test('rejects invalid file settings and untrusted mapping shapes', () => {
		for (const value of [
			null,
			{},
			[{ header: 'bad\nheader', variable: 'SESSION', enabled: true }],
			[{ header: 'X', variable: 'BAD=KEY', enabled: true }],
		]) {
			assert.strictEqual(isResponseHeaderMappings(value), false);
			assert.throws(
				() =>
					parseRequestFile(
						JSON.stringify({ name: 'Test', method: 'GET', url: 'https://example.com', automation: value }),
					),
				/automation/,
			);
		}
	});

	test('preserves environment comments and CRLF and round-trips empty and spaced headers', () => {
		let text = '# keep\r\nOTHER=untouched\r\nSESSION=old\r\n';
		for (const [name, value] of Object.entries(responseHeaderAssignments(automation, { 'X-Session': 'a b' }))) {
			text = updateEnvValue(text, name, value);
		}
		assert.strictEqual(text, '# keep\r\nOTHER=untouched\r\nSESSION="a b"\r\n');
		assert.strictEqual(parseEnvFile(text).SESSION, 'a b');
		assert.strictEqual(parseEnvFile(updateEnvValue(text, 'SESSION', '')).SESSION, '');
	});

	test('rejects line injection before writing and leaves header values out of errors', () => {
		assert.throws(
			() => responseHeaderAssignments(automation, { 'x-session': 'secret\nINJECT=yes' }),
			(error: Error) => !error.message.includes('secret'),
		);
	});
});
