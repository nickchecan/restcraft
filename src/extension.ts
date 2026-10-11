import * as vscode from 'vscode';

import { createAndOpenRequestFile } from './commands/createRequestFile';
import { readPackageVersion } from './extensionVersion';
import { isRequestFileName, parseRequestFile } from './request/requestFile';
import { RequestEditorProvider } from './webview/requestEditorProvider';
import { ApiWorkbenchPanel } from './webview/requestPanel';

/**
 * Registers RestCraft commands and the custom request editor.
 *
 * Activation intentionally does only lightweight setup. Work that reads files,
 * opens panels, or parses requests is deferred until the user invokes a command
 * or opens a `.api.json` document.
 */
export function activate(context: vscode.ExtensionContext) {
	const extensionVersion = readExtensionVersion(context);

	const openApiWorkbench = vscode.commands.registerCommand('restcraft.openApiWorkbench', createAndOpenRequestFile);

	const loadRequestFile = vscode.commands.registerCommand('restcraft.loadRequestFile', async () => {
		const editor = vscode.window.activeTextEditor;

		if (!editor) {
			await vscode.window.showErrorMessage('Open a .api.json file before loading a request.');
			return;
		}

		if (!isRequestFileName(editor.document.fileName)) {
			await vscode.window.showErrorMessage('The active file must end with .api.json.');
			return;
		}

		try {
			const request = parseRequestFile(editor.document.getText());
			const panel = ApiWorkbenchPanel.createOrShow(context.extensionUri, extensionVersion);

			await panel.loadRequest(request, editor.document.uri);
		} catch (error) {
			await vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Unable to load request file.');
		}
	});

	const createRequestFile = vscode.commands.registerCommand('restcraft.createRequestFile', createAndOpenRequestFile);

	context.subscriptions.push(openApiWorkbench, loadRequestFile, createRequestFile, RequestEditorProvider.register(context, extensionVersion));
}

/**
 * VS Code calls this when the extension is deactivated.
 *
 * RestCraft currently registers disposable commands/providers only, so VS Code
 * can clean them up through `context.subscriptions` without explicit teardown.
 */
export function deactivate() {}

/**
 * Reads the extension version from VS Code's package metadata.
 *
 * The helper keeps package JSON shape handling outside activation so the entry
 * point stays focused on command and provider registration.
 */
function readExtensionVersion(context: vscode.ExtensionContext): string {
	return readPackageVersion(context.extension.packageJSON);
}
