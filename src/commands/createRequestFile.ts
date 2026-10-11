import * as path from 'path';
import * as vscode from 'vscode';

import { createDefaultRequestFileContent, createRequestFileName } from '../request/createRequestFile';
import { RequestEditorProvider } from '../webview/requestEditorProvider';

/**
 * Prompts for a request's name and location, then opens its file-backed editor.
 */
export async function createAndOpenRequestFile(resource?: vscode.Uri): Promise<void> {
	try {
		const directory = await resolveRequestFileDirectory(resource);
		const selectedUri = await vscode.window.showSaveDialog({
			title: 'Create API request',
			saveLabel: 'Create Request',
			defaultUri: directory ? vscode.Uri.joinPath(directory, 'request.api.json') : undefined,
		});

		if (!selectedUri) {
			return;
		}

		const fileName = createRequestFileName(path.posix.basename(selectedUri.path));
		const fileUri = vscode.Uri.joinPath(getParentUri(selectedUri), fileName);

		if (await fileExists(fileUri)) {
			await vscode.window.showErrorMessage(`A request file named "${fileName}" already exists. Choose a different name.`);
			return;
		}

		await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(createDefaultRequestFileContent(fileName)));
		await vscode.commands.executeCommand('vscode.openWith', fileUri, RequestEditorProvider.viewType);
	} catch (error) {
		await vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Unable to create request file.');
	}
}

/**
 * Suggests a starting folder while allowing creation without an open workspace.
 */
async function resolveRequestFileDirectory(resource?: vscode.Uri): Promise<vscode.Uri | undefined> {
	if (resource) {
		const stat = await vscode.workspace.fs.stat(resource);
		return stat.type & vscode.FileType.Directory ? resource : getParentUri(resource);
	}

	const activeDocument = vscode.window.activeTextEditor?.document;
	if (activeDocument && !activeDocument.isUntitled) {
		return getParentUri(activeDocument.uri);
	}

	return vscode.workspace.workspaceFolders?.[0]?.uri;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch (error) {
		if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
			return false;
		}
		throw error;
	}
}

function getParentUri(uri: vscode.Uri): vscode.Uri {
	return uri.with({ path: path.posix.dirname(uri.path) });
}
