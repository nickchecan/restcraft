import * as vscode from 'vscode';
import * as path from 'path';
import { importBrunoCollection, importBrunoRequest } from '../import/brunoFiles';
import { RequestEditorProvider } from '../webview/requestEditorProvider';

interface BrunoSourcePicker {
	open(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined>;
	chooseKind(): Thenable<string | undefined>;
}

/** Native dialogs can select files and folders together only on macOS. */
export async function selectBrunoSource(
	platform: NodeJS.Platform = process.platform,
	picker: BrunoSourcePicker = {
		open: (options) => vscode.window.showOpenDialog(options),
		chooseKind: () =>
			vscode.window.showQuickPick(['Request file', 'Collection folder'], {
				title: 'Import from Bruno',
				placeHolder: 'Choose what to import',
			}),
	},
): Promise<vscode.Uri | undefined> {
	let kind: string | undefined;
	if (platform !== 'darwin') {
		kind = await picker.chooseKind();
		if (!kind) {
			return undefined;
		}
	}
	const selected = await picker.open({
		title: 'Select Bruno request file or collection folder',
		openLabel: 'Import',
		canSelectFiles: kind !== 'Collection folder',
		canSelectFolders: kind !== 'Request file',
		canSelectMany: false,
		filters: { 'Bruno requests': ['bru', 'yml', 'yaml'] },
	});
	return selected?.[0];
}

export async function importFromBruno(): Promise<void> {
	try {
		const source = await selectBrunoSource();
		if (!source) {
			return;
		}
		const stat = await vscode.workspace.fs.stat(source);
		const collection = (stat.type & vscode.FileType.Directory) !== 0;
		if (!collection && !/\.(bru|ya?ml)$/i.test(source.path)) {
			throw new Error('Select a Bruno .bru, .yml, or .yaml request file, or a collection folder.');
		}
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
