import * as assert from 'assert';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { RequestEditorProvider } from '../../src/webview/requestEditorProvider';
import { RequestChangedMessage } from '../../src/webview/requestWebview';

suite('Request editor document synchronization', () => {
	for (const eol of ['\n', '\r\n']) {
		test(`preserves rows through the first edit and save (${eol === '\n' ? 'LF' : 'CRLF'})`, async () => {
			// Arrange
			// Act
			const directory = vscode.Uri.file(await mkdtemp(path.join(tmpdir(), 'restcraft-editor-')));
			const uri = vscode.Uri.joinPath(directory, 'request.api.json');
			const request = { name: 'Request', method: 'GET', url: 'https://example.com/', headers: {}, body: null };
			await vscode.workspace.fs.writeFile(
				uri,
				Buffer.from(`${JSON.stringify(request, null, 2)}\n`.replace(/\n/g, eol)),
			);
			const document = await vscode.workspace.openTextDocument(uri);
			const messages = new vscode.EventEmitter<unknown>();
			const disposal = new vscode.EventEmitter<void>();
			const loads: unknown[] = [];
			const webview = {
				options: {},
				html: '',
				cspSource: 'test',
				onDidReceiveMessage: messages.event,
				postMessage: async (message: { type: string }) => {
					if (message.type === 'loadRequest') {
						loads.push(message);
					}
					return true;
				},
			} as unknown as vscode.Webview;
			const panel = { webview, title: '', onDidDispose: disposal.event } as unknown as vscode.WebviewPanel;
			const provider = new RequestEditorProvider(directory, '1.0.0');
			const cancellation = new vscode.CancellationTokenSource();
			provider.resolveCustomTextEditor(document, panel, cancellation.token);

			// Assert
			try {
				messages.fire({ type: 'webviewReady' });
				assert.strictEqual(loads.length, 1);
				assert.strictEqual(document.isDirty, false);

				// Blank draft rows are UI-only. Toggling one still syncs the request,
				// but must not reload the tables and discard those unfinished rows.
				const change: RequestChangedMessage = {
					type: 'requestChanged',
					...request,
					body: '',
					params: [],
					headerState: [],
				};
				await waitForContentChange(document, () => messages.fire(change));
				assert.strictEqual(document.isDirty, true);
				assert.strictEqual(loads.length, 1, 'The first edit must not reload the webview');

				change.params = [{ name: 'page', value: '1', enabled: false }];
				change.headerState = [{ name: 'Accept', value: 'application/json', enabled: false }];
				change.headers = { Accept: 'application/json' };
				change.authorization = {
					type: 'oauth2',
					grantType: 'client_credentials',
					accessTokenUrl: 'https://demo.duendesoftware.com/connect/token',
					clientId: 'm2m',
					clientSecret: '{{CLIENT_SECRET}}',
					scope: 'api',
				};
				await waitForContentChange(document, () => messages.fire(change));
				const saved = JSON.parse(document.getText());
				assert.deepStrictEqual(saved.params, change.params);
				assert.deepStrictEqual(saved.headerState, change.headerState);
				assert.deepStrictEqual(saved.authorization, change.authorization);
				assert.strictEqual(saved.headers, undefined);
				assert.strictEqual(loads.length, 1, 'Local edits must not reload the webview');

				await document.save();
				await new Promise((resolve) => setTimeout(resolve, 50));
				assert.strictEqual(document.isDirty, false);
				assert.strictEqual(loads.length, 1, 'Saving without changing text must not reload the webview');

				// Real edits from another editor must still update the webview.
				const externalEdit = new vscode.WorkspaceEdit();
				externalEdit.insert(uri, new vscode.Position(0, 0), ' ');
				await vscode.workspace.applyEdit(externalEdit);
				await new Promise((resolve) => setTimeout(resolve, 50));
				assert.strictEqual(loads.length, 2, 'External content edits must reload the webview once');
				assert.deepStrictEqual(
					(loads[1] as { request: { authorization: unknown } }).request.authorization,
					change.authorization,
				);
				// A fresh webview initializes from the persisted document settings.
				messages.fire({ type: 'webviewReady' });
				assert.deepStrictEqual(
					(loads[2] as { request: { authorization: unknown } }).request.authorization,
					change.authorization,
				);
				delete change.authorization;
				await waitForContentChange(document, () => messages.fire(change));
				assert.strictEqual(JSON.parse(document.getText()).authorization, undefined);
			} finally {
				disposal.fire();
				messages.dispose();
				disposal.dispose();
				cancellation.dispose();
				await document.save();
				await new Promise((resolve) => setTimeout(resolve, 100));
				await vscode.workspace.fs.delete(directory, { recursive: true });
			}
		});
	}
});

async function waitForContentChange(document: vscode.TextDocument, action: () => void): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			subscription.dispose();
			reject(new Error('Timed out waiting for the request document edit'));
		}, 2000);
		const subscription = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.uri.toString() === document.uri.toString() && event.contentChanges.length > 0) {
				clearTimeout(timeout);
				subscription.dispose();
				resolve();
			}
		});
		action();
	});
	await new Promise((resolve) => setTimeout(resolve, 50));
}
