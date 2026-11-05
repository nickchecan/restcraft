import * as assert from 'assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { decoratedMethods, methodColorId, readMethodDecoration } from '../../src/request/methodDecoration';

suite('Request method decorations', () => {
	const root = resolve(__dirname, '../../..');
	const badges: Record<string, string> = {
		GET: 'GT',
		POST: 'PO',
		PUT: 'PU',
		DELETE: 'DE',
		QUERY: 'QU',
		PATCH: 'PA',
		HEAD: 'HE',
		OPTIONS: 'OP',
	};

	test('maps each known method to a two-letter badge and theme color', () => {
		// Arrange
		// Act
		// Assert
		assert.deepStrictEqual(decoratedMethods, Object.keys(badges));
		for (const [method, badge] of Object.entries(badges)) {
			const decoration = readMethodDecoration(JSON.stringify({ method }));
			assert.ok(decoration);
			assert.strictEqual(decoration.method, method);
			assert.strictEqual(decoration.badge, badge);
			assert.strictEqual(decoration.badge.length, 2);
			assert.strictEqual(decoration.colorId, methodColorId(method));
			assert.strictEqual(decoration.colorId, `restcraft.method.${method.toLowerCase()}`);
		}
	});

	test('accepts method casing and surrounding whitespace', () => {
		// Arrange
		const decoration = readMethodDecoration('{ "name": "Lookup", "method": " pAtCh " }');

		// Act
		// Assert
		assert.deepStrictEqual(decoration, {
			method: 'PATCH',
			badge: 'PA',
			colorId: 'restcraft.method.patch',
		});
	});

	test('returns no decoration for invalid JSON, a missing method, or an unknown method', () => {
		// Arrange
		const contents = [
			'',
			'{',
			'{ "method": "GET" ',
			'[]',
			'null',
			'"GET"',
			'{ "name": "Lookup" }',
			'{ "method": null }',
			'{ "method": 1 }',
			'{ "method": "" }',
			'{ "method": "   " }',
			'{ "method": "TRACE" }',
			'{ "method": "GETS" }',
			'{ "request": { "method": "GET" } }',
			'{ "method": "GET" } trailing',
		];

		// Act
		// Assert
		for (const content of contents) {
			assert.strictEqual(readMethodDecoration(content), undefined, content);
		}
	});

	test('contributes the request language, JSON grammar, colors, and independent settings', () => {
		// Arrange
		const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
		const language = manifest.contributes.languages.find((item: { id: string }) => item.id === 'restcraft-request');
		const grammar = manifest.contributes.grammars.find(
			(item: { language: string }) => item.language === 'restcraft-request',
		);
		const grammarDocument = JSON.parse(readFileSync(resolve(root, grammar.path), 'utf8'));
		const configuration = JSON.parse(readFileSync(resolve(root, language.configuration), 'utf8'));

		// Act
		// Assert
		assert.ok(language);
		assert.deepStrictEqual(language.extensions, ['.api.json']);
		assert.deepStrictEqual(language.icon, {
			light: './media/request-icon-light.svg',
			dark: './media/request-icon-dark.svg',
		});
		assert.ok(existsSync(resolve(root, language.icon.light)));
		assert.ok(existsSync(resolve(root, language.icon.dark)));
		assert.ok(configuration.brackets);
		assert.strictEqual(grammar.scopeName, grammarDocument.scopeName);
		assert.strictEqual(grammarDocument.patterns[0].include, 'source.json');
		assert.deepStrictEqual(manifest.contributes.jsonLanguageParticipants, [{ languageId: 'restcraft-request' }]);
		assert.strictEqual(manifest.contributes.jsonValidation, undefined);
		assert.ok(!manifest.extensionDependencies?.includes('vscode.json-language-features'));
		assert.deepStrictEqual(manifest.activationEvents.slice(0, 3), [
			'onCustomEditor:restcraft.requestEditor',
			'onCommand:restcraft.createRequestFile',
			'onUri',
		]);
		assert.strictEqual(manifest.contributes.customEditors[0].selector[0].filenamePattern, '*.api.json');
		assert.strictEqual(manifest.contributes.customEditors[0].viewType, 'restcraft.requestEditor');

		const colors = new Map(
			manifest.contributes.colors.map((color: { id: string; defaults: Record<string, string> }) => [
				color.id,
				color.defaults,
			]),
		);
		for (const method of decoratedMethods) {
			const defaults = colors.get(methodColorId(method)) as Record<string, string> | undefined;
			assert.ok(defaults, method);
			assert.match(defaults.dark, /^#[0-9A-Fa-f]{6}$/);
			assert.match(defaults.light, /^#[0-9A-Fa-f]{6}$/);
			assert.match(defaults.highContrast, /^#[0-9A-Fa-f]{6}$/);
		}
		assert.strictEqual(manifest.contributes.configuration.properties['restcraft.showMethodBadge'].default, true);
		assert.strictEqual(manifest.contributes.configuration.properties['restcraft.showMethodColor'].default, true);
	});
});
