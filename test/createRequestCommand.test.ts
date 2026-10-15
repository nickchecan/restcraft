import * as assert from 'assert';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { createAndOpenRequestFile } from '../src/commands/createRequestFile';
import { parseRequestFile } from '../src/request/requestFile';
import { RequestEditorProvider } from '../src/webview/requestEditorProvider';

suite('Create request command', () => {
	let directory: vscode.Uri;
	let selectedUri: vscode.Uri | undefined;
	let dialogOptions: vscode.SaveDialogOptions | undefined;
	let opened: { command: string; args: unknown[] }[];
	let errors: string[];
	const showSaveDialog = vscode.window.showSaveDialog;
	const executeCommand = vscode.commands.executeCommand;
	const showErrorMessage = vscode.window.showErrorMessage;

	setup(async () => {
		directory = vscode.Uri.file(await mkdtemp(path.join(tmpdir(), 'restcraft-create-')));
		selectedUri = undefined;
		dialogOptions = undefined;
		opened = [];
		errors = [];
		vscode.window.showSaveDialog = async (options) => {
			dialogOptions = options;
			return selectedUri;
		};
		vscode.commands.executeCommand = async <T>(command: string, ...args: unknown[]): Promise<T> => {
			opened.push({ command, args });
			return undefined as T;
		};
		vscode.window.showErrorMessage = (async (message: string) => {
			errors.push(message);
			return undefined;
		}) as typeof showErrorMessage;
	});

	teardown(async () => {
		vscode.window.showSaveDialog = showSaveDialog;
		vscode.commands.executeCommand = executeCommand;
		vscode.window.showErrorMessage = showErrorMessage;
		await vscode.workspace.fs.delete(directory, { recursive: true });
	});

	test('creates a canonical request in the selected location and opens its file editor', async () => {
		selectedUri = vscode.Uri.joinPath(directory, 'get-users');
		await createAndOpenRequestFile(directory);

		const expectedUri = vscode.Uri.joinPath(directory, 'get-users.api.json');
		const content = await vscode.workspace.fs.readFile(expectedUri);
		assert.strictEqual(parseRequestFile(new TextDecoder().decode(content)).name, 'get-users');
		assert.strictEqual(
			dialogOptions?.defaultUri?.toString(),
			vscode.Uri.joinPath(directory, 'request.api.json').toString(),
		);
		assert.strictEqual(opened.length, 1);
		assert.strictEqual(opened[0].command, 'vscode.openWith');
		assert.strictEqual((opened[0].args[0] as vscode.Uri).toString(), expectedUri.toString());
		assert.strictEqual(opened[0].args[1], RequestEditorProvider.viewType);
		assert.deepStrictEqual(errors, []);
	});

	test('canceling creates no file and opens no editor', async () => {
		await createAndOpenRequestFile(directory);
		assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(directory), []);
		assert.deepStrictEqual(opened, []);
		assert.deepStrictEqual(errors, []);
	});

	test('does not overwrite an existing file after adding the canonical suffix', async () => {
		const existingUri = vscode.Uri.joinPath(directory, 'get-users.api.json');
		const original = new TextEncoder().encode('existing request');
		await vscode.workspace.fs.writeFile(existingUri, original);
		selectedUri = vscode.Uri.joinPath(directory, 'get-users');
		await createAndOpenRequestFile(directory);

		assert.strictEqual(new TextDecoder().decode(await vscode.workspace.fs.readFile(existingUri)), 'existing request');
		assert.deepStrictEqual(opened, []);
		assert.strictEqual(errors.length, 1);
		assert.match(errors[0], /already exists/);
	});
});
