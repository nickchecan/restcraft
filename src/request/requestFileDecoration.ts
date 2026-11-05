import * as vscode from 'vscode';

import { readMethodDecoration } from './methodDecoration';

export const showMethodBadgeSetting = 'restcraft.showMethodBadge';
export const showMethodColorSetting = 'restcraft.showMethodColor';

/**
 * Shows a method badge and color on `.api.json` files in the Explorer and tabs.
 *
 * The badge and color follow their own settings. Files that are missing, not
 * JSON, or have no known top-level method stay undecorated.
 */
export class RequestFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
	private readonly onDidChangeFileDecorationsEmitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
	public readonly onDidChangeFileDecorations = this.onDidChangeFileDecorationsEmitter.event;
	private readonly disposable: vscode.Disposable;
	private disposed = false;

	public constructor() {
		const watcher = vscode.workspace.createFileSystemWatcher('**/*.api.json');
		this.disposable = vscode.Disposable.from(
			this.onDidChangeFileDecorationsEmitter,
			watcher,
			watcher.onDidCreate((uri) => this.refresh(uri)),
			watcher.onDidChange((uri) => this.refresh(uri)),
			watcher.onDidDelete((uri) => this.refresh(uri)),
			vscode.workspace.onDidOpenTextDocument((document) => this.refresh(document.uri)),
			vscode.workspace.onDidChangeTextDocument((event) => this.refresh(event.document.uri)),
			vscode.workspace.onDidSaveTextDocument((document) => this.refresh(document.uri)),
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration(showMethodBadgeSetting) || event.affectsConfiguration(showMethodColorSetting)) {
					this.onDidChangeFileDecorationsEmitter.fire(undefined);
				}
			}),
		);
	}

	/**
	 * The workspace file watcher does not see request files outside a workspace
	 * folder. Open documents still need a badge, including unsaved edits.
	 */
	private refresh(uri: vscode.Uri): void {
		if (uri.path.toLowerCase().endsWith('.api.json')) {
			this.onDidChangeFileDecorationsEmitter.fire(uri);
		}
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.disposable.dispose();
	}

	public async provideFileDecoration(
		uri: vscode.Uri,
		token: vscode.CancellationToken,
	): Promise<vscode.FileDecoration | undefined> {
		if (!uri.path.toLowerCase().endsWith('.api.json')) {
			return undefined;
		}

		const configuration = vscode.workspace.getConfiguration('restcraft', uri);
		const showBadge = configuration.get<boolean>('showMethodBadge', true);
		const showColor = configuration.get<boolean>('showMethodColor', true);
		if (!showBadge && !showColor) {
			return undefined;
		}

		const openDocument = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
		let text: string;
		if (openDocument) {
			text = openDocument.getText();
		} else {
			try {
				text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
			} catch {
				return undefined;
			}
		}
		if (token.isCancellationRequested) {
			return undefined;
		}

		const decoration = readMethodDecoration(text);
		if (!decoration) {
			return undefined;
		}

		return new vscode.FileDecoration(
			showBadge ? decoration.badge : undefined,
			decoration.method,
			showColor ? new vscode.ThemeColor(decoration.colorId) : undefined,
		);
	}
}
