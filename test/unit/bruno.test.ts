import * as assert from 'assert';
import { convertBrunoRequest, readBrunoBlocks } from '../../src/import/bruno';

suite('Bruno conversion', () => {
	const request = (extra: string, settings = '') =>
		`meta {\n  name: Example\n  type: http\n}\nget {\n  url: https://example.com/:id\n${settings}\n}\n${extra}`;
	test('preserves quoted names, repeated parameters, disabled entries and path variables', () => {
		const result = JSON.parse(
			convertBrunoRequest(
				request(
					'params:path {\n  id: {{ID}}\n}\nparams:query {\n  "filter:type": user\n  tag: a\n  tag: b\n  ~debug: true\n}\n',
				),
			).content,
		);
		assert.strictEqual(result.url, 'https://example.com/{{ID}}');
		assert.strictEqual(result.params[0].name, 'filter:type');
		assert.strictEqual(result.params.length, 4);
		assert.strictEqual(result.params[3].enabled, false);
	});
	test('converts form bodies and bearer tokens without resolving variables', () => {
		const result = JSON.parse(
			convertBrunoRequest(
				request(
					'body:form-urlencoded {\n  name: Ada Lovelace\n  ~debug: yes\n}\nauth:bearer {\n  token: {{TOKEN}}\n}\n',
					'  body: form-urlencoded\n  auth: bearer',
				),
			).content,
		);
		assert.strictEqual(result.body, 'name=Ada+Lovelace');
		assert.ok(
			result.headerState.some(
				(row: { name: string; value: string }) => row.name === 'Authorization' && row.value === 'Bearer {{TOKEN}}',
			),
		);
	});

	test('reports scripts without executing them', () => {
		const result = convertBrunoRequest(request('script:pre-request {\n  throw new Error("never run");\n}\n'));
		assert.ok(result.warnings.some((warning) => warning.includes('script:pre-request')));
	});
	test('rejects malformed syntax and unsupported bodies or authentication', () => {
		assert.throws(() => readBrunoBlocks('meta {\n'), /Unclosed/);
		assert.throws(() => convertBrunoRequest(request('', '  body: multipart-form')), /body mode/);
		assert.throws(() => convertBrunoRequest(request('', '  auth: digest')), /authentication/);
	});
});
