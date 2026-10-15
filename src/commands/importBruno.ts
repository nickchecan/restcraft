import * as vscode from 'vscode';
import * as path from 'path';
import { importBrunoCollection, importBrunoRequest } from '../import/brunoFiles';
import { RequestEditorProvider } from '../webview/requestEditorProvider';

export async function importFromBruno(collection: boolean): Promise<void> {
	try {
		const selected = await vscode.window.showOpenDialog({
			title: collection ? 'Select Bruno collection folder' : 'Select Bruno request',
			canSelectFiles: !collection,
			canSelectFolders: collection,
			canSelectMany: false,
			...(!collection ? { filters: { 'Bruno requests': ['bru', 'yml', 'yaml'] } } : {}),
		});
		if (!selected?.[0]) {
			return;
		}
		const source = selected[0];
		let warnings: string[];
		if (collection) {
			const folders = await vscode.window.showOpenDialog({
				title: 'Select parent folder for imported collection',
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
			});
			if (!folders?.[0]) {
				return;
			}
			const result = await importBrunoCollection(
				source,
				vscode.Uri.joinPath(folders[0], path.posix.basename(source.path)),
			);
			warnings = result.warnings;
			await vscode.window.showInformationMessage(`Imported ${result.count} Bruno requests.`);
		} else {
			const destination = await vscode.window.showSaveDialog({
				title: 'Import Bruno request',
				defaultUri: vscode.Uri.joinPath(
					vscode.workspace.workspaceFolders?.[0]?.uri ?? source.with({ path: path.posix.dirname(source.path) }),
					`${path.posix.basename(source.path).replace(/\.(bru|ya?ml)$/i, '')}.api.json`,
				),
			});
			if (!destination) {
				return;
			}
			const target = destination.path.endsWith('.api.json')
				? destination
				: destination.with({ path: `${destination.path}.api.json` });
			warnings = (await importBrunoRequest(source, target)).warnings;
			await vscode.commands.executeCommand('vscode.openWith', target, RequestEditorProvider.viewType);
		}
		if (warnings.length) {
			await vscode.window.showWarningMessage(warnings.join(' '));
		}
	} catch (error) {
		await vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Unable to import Bruno requests.');
	}
}
