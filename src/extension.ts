import { importFromBruno } from './commands/importBruno';
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
export async function activate(context: vscode.ExtensionContext) {
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
	await activateJsonLanguageFeatures();

	context.subscriptions.push(
		vscode.commands.registerCommand('restcraft.importBruno', importFromBruno),
		registerOAuthCallback(context),
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

/**
 * Starts the built-in JSON language service so request files can be validated
 * and formatted without opening a separate JSON document.
 *
 * RestCraft does not depend on that extension. A disabled or missing service
 * is ignored so the rest of the extension still activates.
 */
async function activateJsonLanguageFeatures(): Promise<void> {
	const extension = vscode.extensions.getExtension('vscode.json-language-features');
	if (!extension) {
		return;
	}
	try {
		await extension.activate();
	} catch (error) {
		console.error('RestCraft could not activate the JSON language service.', error);
	}
}
