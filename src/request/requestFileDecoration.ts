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
			watcher.onDidCreate((uri) => this.onDidChangeFileDecorationsEmitter.fire(uri)),
			watcher.onDidChange((uri) => this.onDidChangeFileDecorationsEmitter.fire(uri)),
			watcher.onDidDelete((uri) => this.onDidChangeFileDecorationsEmitter.fire(uri)),
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration(showMethodBadgeSetting) || event.affectsConfiguration(showMethodColorSetting)) {
					this.onDidChangeFileDecorationsEmitter.fire(undefined);
				}
			}),
		);
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

		let content: Uint8Array;
		try {
			content = await vscode.workspace.fs.readFile(uri);
		} catch {
			return undefined;
		}
		if (token.isCancellationRequested) {
			return undefined;
		}

		const decoration = readMethodDecoration(new TextDecoder().decode(content));
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
