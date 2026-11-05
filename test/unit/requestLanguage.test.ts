import * as assert from 'assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

suite('Request language', () => {
	const root = resolve(__dirname, '../../..');

	test('contributes the request language and JSON grammar without a JSON extension dependency', () => {
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
		assert.strictEqual(manifest.contributes.colors, undefined);
		assert.strictEqual(manifest.contributes.configuration.properties['restcraft.showMethodBadge'], undefined);
		assert.strictEqual(manifest.contributes.configuration.properties['restcraft.showMethodColor'], undefined);
		assert.ok(!manifest.extensionDependencies?.includes('vscode.json-language-features'));
		assert.deepStrictEqual(manifest.activationEvents, [
			'onCustomEditor:restcraft.requestEditor',
			'onCommand:restcraft.createRequestFile',
			'onUri',
			'onLanguage:restcraft-request',
			'workspaceContains:**/*.api.json',
		]);
		assert.strictEqual(manifest.contributes.customEditors[0].selector[0].filenamePattern, '*.api.json');
		assert.strictEqual(manifest.contributes.customEditors[0].viewType, 'restcraft.requestEditor');
		assert.strictEqual(
			manifest.contributes.configurationDefaults['[restcraft-request]']['editor.suggest.insertMode'],
			'replace',
		);
	});
});
