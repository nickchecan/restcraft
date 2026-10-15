import * as vscode from 'vscode';

import { createAndOpenRequestFile } from './commands/createRequestFile';
import { NetworkHistory } from './request/networkHistory';
import { registerNetworkHistory } from './webview/networkHistoryPanel';
import { setNetworkLogSink } from './request/networkLog';
import { readPackageVersion } from './extensionVersion';
import { registerOAuthCallback } from './webview/oauthCallback';
import { RequestEditorProvider } from './webview/requestEditorProvider';

/**
 * Registers RestCraft commands, the custom request editor, and OAuth callback handler.
 *
 * Activation intentionally does only lightweight setup. Work that reads files,
 * opens panels, or parses requests is deferred until the user invokes a command
 * or opens a `.api.json` document.
 */
export function activate(context: vscode.ExtensionContext) {
	const networkHistory = new NetworkHistory();
	const networkOutput = vscode.window.createOutputChannel('Restcraft Network', 'restcraft-network-log');
	setNetworkLogSink(
		(text) => networkOutput.appendLine(text),
		() => vscode.workspace.getConfiguration('restcraft').get<boolean>('redactSensitiveContentInNetworkLog', true),
		(entry) => networkHistory.update(entry),
	);
	context.subscriptions.push(
		networkOutput,
		registerNetworkHistory(networkHistory),
		new vscode.Disposable(() => setNetworkLogSink(undefined)),
		vscode.commands.registerCommand('restcraft.showNetworkLog', () => networkOutput.show(true)),
	);
	const extensionVersion = readExtensionVersion(context);

	const createRequestFile = vscode.commands.registerCommand('restcraft.createRequestFile', createAndOpenRequestFile);

	context.subscriptions.push(
		registerOAuthCallback(context.extension.id),
		createRequestFile,
		RequestEditorProvider.register(context, extensionVersion),
	);
}

/**
 * VS Code calls this when the extension is deactivated.
 *
 * VS Code disposes commands, providers, and pending OAuth callbacks through
 * `context.subscriptions`.
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
