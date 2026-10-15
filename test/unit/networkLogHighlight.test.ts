import * as assert from 'assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { setNetworkLogSink, startNetworkLog } from '../../src/request/networkLog';

interface LogGrammar {
	scopeName: string;
	patterns: { name?: string; match: string; captures?: Record<string, { name: string }> }[];
}

suite('Network log syntax highlighting', () => {
	const root = resolve(__dirname, '../../..');
	const grammar: LogGrammar = JSON.parse(
		readFileSync(resolve(root, 'syntaxes/restcraft-network-log.tmLanguage.json'), 'utf8'),
	);

	teardown(() => setNetworkLogSink(undefined));

	test('contributes the output language and its packaged grammar', () => {
		const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
		const contribution = manifest.contributes.grammars.find(
			(item: { language: string }) => item.language === 'restcraft-network-log',
		);
		assert.ok(contribution);
		assert.ok(manifest.contributes.languages.some((item: { id: string }) => item.id === contribution.language));
		assert.strictEqual(contribution.scopeName, grammar.scopeName);
		assert.strictEqual(
			resolve(root, contribution.path),
			resolve(root, 'syntaxes/restcraft-network-log.tmLanguage.json'),
		);
	});

	test('highlights the full request, response, and failure indicator lines produced by the logger', () => {
		const output: string[] = [];
		setNetworkLogSink((text) => output.push(text));
		for (const result of [
			'cancelled',
			'timeout',
			'failed',
			{ status: 200, statusText: 'OK', headers: {}, body: '{}' },
		] as const) {
			const finish = startNetworkLog({ method: 'GET', url: 'https://example.com/resource' });
			finish(result);
		}
		const indicator = new RegExp(grammar.patterns[0].match);
		assert.strictEqual(output.length, 8);
		for (const entry of output) {
			const firstLine = entry.split('\n')[0];
			assert.strictEqual(indicator.exec(firstLine)?.[0], firstLine);
		}
		assert.strictEqual(grammar.patterns[0].name, 'entity.name.function.restcraft-network-log');
		assert.strictEqual(indicator.test('A normal response body line'), false);
	});

	test('colors section labels without coloring their values or JSON keys', () => {
		const label = new RegExp(grammar.patterns[1].match);
		for (const text of ['Headers: {', 'Body:', 'Body: (empty)']) {
			const match = label.exec(text);
			assert.ok(match);
			assert.ok(['Headers', 'Body'].includes(match[1]));
			assert.strictEqual(match[0], match[1] + ':');
		}
		for (const text of ['  "Body": "value"', '  "Headers": {}', 'A response contains Body: text', 'Body:content']) {
			assert.strictEqual(label.test(text), false);
		}
		assert.strictEqual(grammar.patterns[1].captures?.['1'].name, 'keyword.control.restcraft-network-log');
	});
});
