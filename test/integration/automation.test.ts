import * as assert from 'assert';
import { automationAssignments, automationForPersistence, isAutomationMappings } from '../../src/request/automation';
import { parseEnvFile, updateEnvValue } from '../../src/request/environment';
import { parseRequestFile } from '../../src/request/requestFile';
import { createUpdatedRequestDocumentText } from '../../src/webview/requestDocument';

suite('Response automation', () => {
	const automation = [{ header: 'X-Session', variable: 'SESSION', enabled: true }];
	const response = (headers: Record<string, string>, body = '') => ({ headers, body });

	test('matches headers case-insensitively and skips absent and disabled headers', () => {
		assert.deepStrictEqual(
			Object.entries(
				automationAssignments(
					[
						...automation,
						{ header: 'Missing', variable: 'OLD', enabled: true },
						{ header: 'X-Session', variable: 'DISABLED', enabled: false },
					],
					response({ 'x-session': 'session value' }),
				),
			),
			[['SESSION', 'session value']],
		);
	});

	test('reads nested JSON values and skips a missing path', () => {
		const body = JSON.stringify({
			data: {
				count: 2,
				ok: false,
				items: [{ id: 'abc', meta: { n: null }, tags: ['a'], note: "it's" }],
			},
		});
		const values = automationAssignments(
			[
				{ type: 'json', header: 'data.items[0].id', variable: 'ITEM_ID', enabled: true },
				{ type: 'json', header: 'data.count', variable: 'COUNT', enabled: true },
				{ type: 'json', header: 'data.ok', variable: 'OK', enabled: true },
				{ type: 'json', header: 'data.items[0].meta', variable: 'META', enabled: true },
				{ type: 'json', header: 'data.items[0].tags', variable: 'TAGS', enabled: true },
				{ type: 'json', header: 'data.items[0].meta.n', variable: 'N', enabled: true },
				{ type: 'json', header: 'data.items[0].note', variable: 'NOTE', enabled: true },
				{ type: 'json', header: 'data.items[3].id', variable: 'MISSING', enabled: true },
				{ type: 'json', header: 'data.nope', variable: 'ALSO_MISSING', enabled: true },
			],
			response({}, body),
		);
		assert.strictEqual(values.ITEM_ID, 'abc');
		assert.strictEqual(values.COUNT, '2');
		assert.strictEqual(values.OK, 'false');
		assert.strictEqual(values.META, '{"n":null}');
		assert.strictEqual(values.TAGS, '["a"]');
		assert.strictEqual(values.N, 'null');
		assert.strictEqual(values.NOTE, "it's");
		assert.strictEqual(values.MISSING, undefined);
		assert.strictEqual(values.ALSO_MISSING, undefined);
		const item = automationAssignments(
			[{ type: 'json', header: 'data.items[0]', variable: 'ITEM', enabled: true }],
			response({}, body),
		).ITEM;
		assert.strictEqual(parseEnvFile(updateEnvValue('', 'ITEM', item)).ITEM, item);
		assert.strictEqual(
			automationAssignments(
				[{ type: 'json', header: '[0].id', variable: 'FIRST', enabled: true }],
				response({}, JSON.stringify([{ id: 'first' }])),
			).FIRST,
			'first',
		);
	});

	test('keeps JSON integer text above 2^53', () => {
		const id = '12345678901234567890';
		const body = `{"data":{"items":[{"id":${id}}],"other":1}}`;
		const values = automationAssignments(
			[
				{ type: 'json', header: 'data.items[0].id', variable: 'ID', enabled: true },
				{ type: 'json', header: 'data.other', variable: 'OTHER', enabled: true },
			],
			response({}, body),
		);
		assert.strictEqual(values.ID, id);
		assert.notStrictEqual(values.ID, String(JSON.parse(body).data.items[0].id));
		assert.strictEqual(values.OTHER, '1');
		assert.strictEqual(
			automationAssignments(
				[{ type: 'json', header: 'id', variable: 'NEG', enabled: true }],
				response({}, '{"id":-12345678901234567890}'),
			).NEG,
			'-12345678901234567890',
		);
	});

	test('skips JSON mappings when the body is not JSON and still applies headers', () => {
		const values = automationAssignments(
			[
				{ header: 'X-Session', variable: 'SESSION', enabled: true },
				{ type: 'json', header: 'data.items[0].id', variable: 'ITEM_ID', enabled: true },
			],
			response({ 'X-Session': 'kept' }, '<html>not json</html>'),
		);
		assert.deepStrictEqual(Object.entries(values), [['SESSION', 'kept']]);
	});

	test('assigns a multiline raw body without adding env keys', () => {
		const body = 'hello\r\nworld "quoted"\npath\\end';
		const values = automationAssignments(
			[{ type: 'raw', header: 'ignored', variable: 'BODY', enabled: true }],
			response({ 'X-Session': 'nope' }, body),
		);
		assert.strictEqual(values.BODY, body);
		assert.strictEqual(
			automationAssignments([{ type: 'raw', header: '', variable: 'BODY', enabled: true }], response({}, '')).BODY,
			'',
		);
		const text = updateEnvValue('# keep\nOTHER=untouched\n', 'BODY', values.BODY);
		assert.strictEqual(text.includes('\nOTHER=untouched\n'), true);
		assert.strictEqual(text.includes('\nINJECT='), false);
		assert.strictEqual(parseEnvFile(text).BODY, body);
		assert.strictEqual(parseEnvFile(text).OTHER, 'untouched');
	});

	test('treats a saved row with no type as a header', () => {
		const content = JSON.stringify({
			name: 'Session',
			method: 'GET',
			url: 'https://example.com/',
			automation,
		});
		assert.strictEqual(parseRequestFile(content).automation?.[0].type, undefined);
		assert.deepStrictEqual(
			Object.entries(
				automationAssignments(parseRequestFile(content).automation ?? [], response({ 'x-session': 'old' })),
			),
			[['SESSION', 'old']],
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
		assert.strictEqual(JSON.parse(saved).automation[0].type, undefined);
		assert.strictEqual(JSON.parse(saved).custom, true);
		const explicitHeader = createUpdatedRequestDocumentText(saved, {
			...message,
			automation: [{ type: 'header' as const, header: 'X-Session', variable: 'SESSION', enabled: true }],
		});
		assert.strictEqual(JSON.parse(explicitHeader).automation[0].type, undefined);
		assert.deepStrictEqual(automationForPersistence(message.automation), automation);
		const typed = createUpdatedRequestDocumentText(saved, {
			...message,
			automation: [
				{ type: 'json' as const, header: 'data.items[0].id', variable: 'ITEM_ID', enabled: true },
				{ type: 'raw' as const, header: '', variable: 'BODY', enabled: false },
			],
		});
		assert.deepStrictEqual(JSON.parse(typed).automation, [
			{ enabled: true, type: 'json', header: 'data.items[0].id', variable: 'ITEM_ID' },
			{ enabled: false, type: 'raw', header: '', variable: 'BODY' },
		]);
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
			[{ type: 'body', header: 'X', variable: 'SESSION', enabled: true }],
			[{ type: 'json', header: 'bad path', variable: 'SESSION', enabled: true }],
		]) {
			assert.strictEqual(isAutomationMappings(value), false);
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
		for (const [name, value] of Object.entries(automationAssignments(automation, response({ 'X-Session': 'a b' })))) {
			text = updateEnvValue(text, name, value);
		}
		assert.strictEqual(text, '# keep\r\nOTHER=untouched\r\nSESSION="a b"\r\n');
		assert.strictEqual(parseEnvFile(text).SESSION, 'a b');
		assert.strictEqual(parseEnvFile(updateEnvValue(text, 'SESSION', '')).SESSION, '');
	});

	test('stores multiline header values without creating extra env keys', () => {
		const values = automationAssignments(automation, response({ 'x-session': 'secret\nINJECT=yes' }));
		const text = updateEnvValue('OTHER=keep\n', 'SESSION', values.SESSION);
		assert.strictEqual(text.includes('\nINJECT='), false);
		assert.strictEqual(parseEnvFile(text).SESSION, 'secret\nINJECT=yes');
		assert.strictEqual(parseEnvFile(text).INJECT, undefined);
		assert.strictEqual(parseEnvFile(text).OTHER, 'keep');
	});
});
