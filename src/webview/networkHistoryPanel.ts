import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { NetworkHistory } from '../request/networkHistory';
import { getNetworkHistoryHtml } from './networkHistoryHtml';

/** One reusable panel; history continues collecting while the panel is closed. */
export function registerNetworkHistory(history: NetworkHistory): vscode.Disposable {
	let panel: vscode.WebviewPanel | undefined;
	const publish = () => {
		void panel?.webview.postMessage({ type: 'history', entries: history.getEntries() });
	};
	const subscription = history.onChange(publish);
	const command = vscode.commands.registerCommand('restcraft.showNetworkHistory', () => {
		if (panel) {
			panel.reveal();
			return;
		}
		const opened = vscode.window.createWebviewPanel(
			'restcraft.networkHistory',
			'RestCraft Network History',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				localResourceRoots: [],
			},
		);
		panel = opened;
		const messages = opened.webview.onDidReceiveMessage((message: unknown) => {
			if (message === null || typeof message !== 'object' || !('type' in message)) {
				return;
			}
			if (message.type === 'ready') {
				publish();
			} else if (message.type === 'clear') {
				history.clear();
			}
		});
		opened.onDidDispose(() => {
			messages.dispose();
			panel = undefined;
		});
		opened.webview.html = getNetworkHistoryHtml(randomBytes(24).toString('hex'));
	});
	return vscode.Disposable.from(command, subscription, new vscode.Disposable(() => panel?.dispose()));
}
