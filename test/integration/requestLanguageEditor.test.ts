import * as assert from 'assert';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

suite('Request language editor', function () {
	this.timeout(20000);

	let directory: vscode.Uri;
	let previousJsonOverride: unknown;

	setup(async () => {
		directory = vscode.Uri.file(await mkdtemp(path.join(tmpdir(), 'restcraft-language-')));
		previousJsonOverride = vscode.workspace.getConfiguration().inspect('[json]')?.globalValue;
	});

	teardown(async () => {
		await vscode.workspace.getConfiguration().update('[json]', previousJsonOverride, vscode.ConfigurationTarget.Global);
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		if (directory) {
			await vscode.workspace.fs.delete(directory, { recursive: true });
		}
	});

	test('keeps built-in JSON defaults without inheriting [json] settings', async () => {
		// Arrange
		await vscode.workspace
			.getConfiguration()
			.update('[json]', { 'editor.tabSize': 7 }, vscode.ConfigurationTarget.Global);
		const requestConfiguration = vscode.workspace.getConfiguration('editor', { languageId: 'restcraft-request' });
		const jsonConfiguration = vscode.workspace.getConfiguration('editor', { languageId: 'json' });

		// Act
		const requestSuggestions = requestConfiguration.get<{ strings?: boolean }>('quickSuggestions');
		const requestInsertMode = requestConfiguration.get<string>('suggest.insertMode');
		const requestTabSize = requestConfiguration.get<number>('tabSize');
		const jsonTabSize = jsonConfiguration.get<number>('tabSize');

		// Assert
		assert.strictEqual(requestSuggestions?.strings, true);
		assert.strictEqual(requestInsertMode, 'replace');
		assert.strictEqual(jsonTabSize, 7);
		assert.notStrictEqual(requestTabSize, 7);
	});

	test('formats request files with the built-in JSON formatter', async () => {
		// Arrange
		const restcraft = vscode.extensions.getExtension('nickchecan.restcraft');
		assert.ok(restcraft, 'The development extension must be installed in the Extension Host.');
		await restcraft.activate();
		await waitForJsonLanguageFeatures();
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		assert.ok(
			!vscode.workspace.textDocuments.some((document) => document.languageId === 'json'),
			'Format Document must run without a json document open in this session.',
		);
		const uri = vscode.Uri.joinPath(directory, 'compact.api.json');
		await vscode.workspace.fs.writeFile(uri, Buffer.from('{"method":"GET","url":"https://example.com"}'));
		const document = await vscode.workspace.openTextDocument(uri);
		assert.strictEqual(document.languageId, 'restcraft-request');
		assert.ok(vscode.extensions.getExtension('vscode.json-language-features')?.isActive);

		// Act
		const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', uri, {
			tabSize: 2,
			insertSpaces: true,
		});

		// Assert
		assert.ok(edits && edits.length > 0, 'The JSON language participant should format restcraft-request documents.');
		const formatted = applyTextEdits(document, edits);
		assert.match(formatted, /\n\s+"method": "GET"/);
		assert.strictEqual(JSON.parse(formatted).url, 'https://example.com');
		assert.strictEqual(vscode.extensions.getExtension('esbenp.prettier-vscode'), undefined);
	});

	test('leaves plain JSON files on the json language', async () => {
		// Arrange
		const uri = vscode.Uri.joinPath(directory, 'notes.json');
		await vscode.workspace.fs.writeFile(uri, Buffer.from('{"method":"GET"}'));

		// Act
		const document = await vscode.workspace.openTextDocument(uri);

		// Assert
		assert.strictEqual(document.languageId, 'json');
	});
});

async function waitForJsonLanguageFeatures(): Promise<void> {
	const extension = vscode.extensions.getExtension('vscode.json-language-features');
	assert.ok(extension, 'The built-in JSON language service must be installed.');
	const deadline = Date.now() + 10000;
	while (!extension.isActive && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	assert.ok(extension.isActive, 'RestCraft should start the JSON language service.');
}

function applyTextEdits(document: vscode.TextDocument, edits: readonly vscode.TextEdit[]): string {
	const ordered = [...edits].sort((left, right) => right.range.start.compareTo(left.range.start));
	let text = document.getText();
	for (const edit of ordered) {
		const start = document.offsetAt(edit.range.start);
		const end = document.offsetAt(edit.range.end);
		text = text.slice(0, start) + edit.newText + text.slice(end);
	}
	return text;
}
