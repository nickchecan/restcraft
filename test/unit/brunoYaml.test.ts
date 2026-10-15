import * as assert from 'assert';
import { convertBrunoYamlRequest, readBrunoYaml, readBrunoYamlSettings } from '../../src/import/brunoYaml';

suite('Bruno YAML conversion', () => {
	const request = (http = '', extra = '') =>
		`info:\n  name: Example\n  type: http\nhttp:\n  method: GET\n  url: https://example.com/:id/:identifier\n${http}\n${extra}`;
	test('supports aliases, scalar values, disabled entries and grouped parameters', () => {
		const result = JSON.parse(
			convertBrunoYamlRequest(
				request(`  headers:
    - &header
      name: X-Test
      value: true
      disabled: true
    - *header
  params:
    path:
      - name: id
        value: 42
    query:
      - name: limit
        value: 10
      - name: debug
        value: false
        disabled: true`),
			).content,
		);
		assert.strictEqual(result.url, 'https://example.com/42/:identifier');
		assert.deepStrictEqual(result.params, [
			{ name: 'limit', value: '10', enabled: true },
			{ name: 'debug', value: 'false', enabled: false },
		]);
		assert.deepStrictEqual(result.headerState, [{ name: 'X-Test', value: 'true', enabled: false }]);
	});

	test('inherits headers and bearer auth and respects explicit no auth', () => {
		const parents = [
			readBrunoYamlSettings(
				readBrunoYaml(
					'request:\n  auth:\n    type: bearer\n    token: "{{TOKEN}}"\n  headers:\n    - name: Accept\n      value: application/json\n',
				),
			),
		];
		const inherited = JSON.parse(convertBrunoYamlRequest(request('  auth: inherit'), parents).content);
		assert.ok(inherited.headerState.some((header: { value: string }) => header.value === 'Bearer {{TOKEN}}'));
		const disabled = JSON.parse(convertBrunoYamlRequest(request('  auth: none'), parents).content);
		assert.ok(!disabled.headerState.some((header: { name: string }) => header.name === 'Authorization'));
	});

	test('preserves multiline text and JSON bodies and documentation', () => {
		const result = JSON.parse(
			convertBrunoYamlRequest(
				request(
					'  body:\n    type: text\n    data: |\n      first line\n      second line',
					'docs:\n  content: "Example docs"\n  type: text/markdown',
				),
			).content,
		);
		assert.strictEqual(result.body, 'first line\nsecond line\n');
		assert.strictEqual(result.description, 'Example docs');
		const json = JSON.parse(
			convertBrunoYamlRequest(
				request('  body:\n    type: json\n    data: \'{"name":"{{NAME}}","nested":{"active":true}}\''),
			).content,
		);
		assert.deepStrictEqual(json.body, { name: '{{NAME}}', nested: { active: true } });
	});

	test('encodes form values while omitting disabled rows', () => {
		const result = JSON.parse(
			convertBrunoYamlRequest(
				request(`  body:
    type: form-urlencoded
    data:
      - name: name
        value: Ada Lovelace
      - name: debug
        value: yes
        disabled: true`),
			).content,
		);
		assert.strictEqual(result.body, 'name=Ada+Lovelace');
	});

	test('warns about omitted behavior without executing scripts', () => {
		const result = convertBrunoYamlRequest(
			request(
				'',
				'runtime:\n  scripts:\n    - type: before-request\n      code: throw new Error("never run")\nsettings:\n  timeout: 0',
			),
		);
		assert.ok(result.warnings.some((warning) => warning.includes('runtime')));
		assert.ok(result.warnings.some((warning) => warning.includes('settings')));
	});

	test('rejects invalid YAML and malformed or unsupported requests without exposing source values', () => {
		for (const text of [
			'http: [',
			'info: one\ninfo: secret-value',
			'---\ninfo: one\n---\ninfo: two',
			'!!js/function "secret-value"',
			'[]',
		]) {
			assert.throws(
				() => readBrunoYaml(text),
				(error: unknown) => error instanceof Error && !error.message.includes('secret-value'),
			);
		}
		for (const http of [
			'  auth:\n    type: digest',
			'  body:\n    type: multipart-form',
			'  headers:\n    - name: X-Test\n      disabled: "true"',
			'  params:\n    - name: id\n      type: unknown',
		]) {
			assert.throws(() => convertBrunoYamlRequest(request(http)));
		}
		assert.throws(() => convertBrunoYamlRequest(request().replace('type: http', 'type: grpc')));
	});
});
