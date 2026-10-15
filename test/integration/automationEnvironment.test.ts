import * as assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { initializeRequestWebview } from '../../src/webview/requestWebview';

suite('Automation environment selection', () => {
	for (const scenario of ['saved manual', 'changed in Settings', 'nearest', 'missing manual'] as const) {
		test(`uses request environment settings: ${scenario}`, async () => {
			const directory = await mkdtemp(path.join(tmpdir(), 'restcraft-automation-'));
			const root = vscode.Uri.file(directory);
			const requestUri = vscode.Uri.joinPath(root, 'request.api.json');
			const nearest = vscode.Uri.joinPath(root, '.env');
			const selected = vscode.Uri.joinPath(root, '.env.selected');
			const manual = { mode: 'manual', path: scenario === 'missing manual' ? '.env.missing' : '.env.selected' };
			const write = (uri: vscode.Uri, text: string) => vscode.workspace.fs.writeFile(uri, Buffer.from(text));
			const read = async (uri: vscode.Uri) => new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
			const events = new vscode.EventEmitter<unknown>();
			let complete: (message: { type: string }) => void = () => {};
			const result = new Promise<{ type: string }>((resolve) => {
				complete = resolve;
			});
			const webview = {
				html: '',
				cspSource: 'test',
				onDidReceiveMessage: events.event,
				postMessage: async (message: { type: string }) => {
					if (message.type === 'requestComplete' || message.type === 'requestError') {
						complete(message);
					}
					return true;
				},
			} as unknown as vscode.Webview;
			let subscription: vscode.Disposable | undefined;
			try {
				await write(nearest, '# nearest\nSESSION=old\n');
				await write(selected, '# selected\nSESSION=old\nOTHER=keep\n');
				await write(
					requestUri,
					JSON.stringify({
						name: 'Test',
						method: 'GET',
						url: 'https://example.com/',
						...(scenario === 'saved manual' || scenario === 'missing manual' ? { environment: manual } : {}),
					}),
				);
				subscription = initializeRequestWebview(webview, {
					onGetRequestUri: () => requestUri,
					onSendRequest: async () => ({
						status: 200,
						statusText: 'OK',
						headers: { 'x-session': 'new-value' },
						body: '',
					}),
				});
				if (scenario === 'changed in Settings') {
					// Settings updates the current selection before the backing request document is saved.
					events.fire({ type: 'getEnvironmentFile', requestId: 1, environment: manual });
				}
				events.fire({
					type: 'sendRequest',
					requestId: 2,
					method: 'GET',
					url: 'https://example.com/',
					automation: [{ header: 'X-Session', variable: 'SESSION', enabled: true }],
				});
				assert.strictEqual((await result).type, 'requestComplete');
				assert.strictEqual(
					await read(nearest),
					scenario === 'nearest' ? '# nearest\nSESSION="new-value"\n' : '# nearest\nSESSION=old\n',
				);
				assert.strictEqual(
					await read(selected),
					scenario === 'saved manual' || scenario === 'changed in Settings'
						? '# selected\nSESSION="new-value"\nOTHER=keep\n'
						: '# selected\nSESSION=old\nOTHER=keep\n',
				);
				if (scenario === 'missing manual') {
					await assert.rejects(Promise.resolve(vscode.workspace.fs.stat(vscode.Uri.joinPath(root, '.env.missing'))));
				}
			} finally {
				subscription?.dispose();
				events.dispose();
				await rm(directory, { recursive: true, force: true });
			}
		});
	}
});
