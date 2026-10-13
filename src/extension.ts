import * as vscode from 'vscode';

import { createAndOpenRequestFile } from './commands/createRequestFile';
import { readPackageVersion } from './extensionVersion';
import { RequestEditorProvider } from './webview/requestEditorProvider';

/**
 * Registers RestCraft commands and the custom request editor.
 *
 * Activation intentionally does only lightweight setup. Work that reads files,
 * opens panels, or parses requests is deferred until the user invokes a command
 * or opens a `.api.json` document.
 */
export function activate(context: vscode.ExtensionContext) {
	const extensionVersion = readExtensionVersion(context);

	const createRequestFile = vscode.commands.registerCommand('restcraft.createRequestFile', createAndOpenRequestFile);

	context.subscriptions.push(createRequestFile, RequestEditorProvider.register(context, extensionVersion));
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
