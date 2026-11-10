import * as assert from 'assert';
import * as vscode from 'vscode';

import { buttonIcons } from '../../src/webview/buttonIcons';
import { initializeRequestWebview } from '../../src/webview/requestWebview';

suite('Response copy', () => {
	test('places a disabled empty-state copy button on Body and copies text from the extension host', async () => {
		// Arrange
		const previous = await vscode.env.clipboard.readText();
		const events = new vscode.EventEmitter<unknown>();
		const posted: unknown[] = [];
		const webview = {
			html: '',
			cspSource: 'vscode-webview:',
			onDidReceiveMessage: events.event,
			postMessage: async (message: unknown) => {
				posted.push(message);
				return true;
			},
		} as unknown as vscode.Webview;
		const subscription = initializeRequestWebview(webview);
		const formatted = '{\n  "id": 1,\n  "name": "Leanne Graham"\n}';
		const raw = '{"id":1,"name":"Leanne Graham"}';

		// Act
		try {
			const copyAt = webview.html.indexOf('<button class="response-copy"');
			const statusAt = webview.html.indexOf('class="response-status"', copyAt);
			const header = webview.html.slice(copyAt, statusAt);

			// Assert
			assert.ok(copyAt > webview.html.indexOf('id="body-tab"'));
			assert.ok(statusAt > copyAt);
			assert.match(header, /class="response-copy"/);
			assert.doesNotMatch(header, /response-copy hidden/);
			assert.match(header, /<button class="response-copy"[^>]* disabled/);
			assert.match(header, /data-copy-state="copy">/);
			assert.match(header, /class="response-copy-label">Copy<\/span>/);
			assert.match(header, /id="response-copy-live" class="sr-only" aria-live="polite"/);
			assert.ok(header.includes(buttonIcons.copy));
			assert.match(webview.html, /\.response-copy \{[\s\S]*?border-radius: 9px;[\s\S]*?background: transparent;/);
			assert.match(webview.html, /\.response-copy:hover,[\s\S]*?background: transparent;/);
			assert.match(webview.html, /\.response-copy:focus-visible \{[\s\S]*?--vscode-focusBorder/);
			events.fire({ type: 'copyResponse', text: formatted, attempt: 1 });
			await waitForClipboard(formatted);
			assert.deepStrictEqual(posted.at(-1), { type: 'responseCopied', ok: true, attempt: 1 });
			events.fire({ type: 'copyResponse', text: raw, attempt: 2 });
			await waitForClipboard(raw);
			assert.deepStrictEqual(posted.at(-1), { type: 'responseCopied', ok: true, attempt: 2 });
			events.fire({ type: 'copyResponse', text: '' });
			events.fire({ type: 'copyResponse' });
			await waitForClipboard(raw);
		} finally {
			subscription.dispose();
			events.dispose();
			await vscode.env.clipboard.writeText(previous);
		}
	});
});

async function waitForClipboard(expected: string): Promise<void> {
	const deadline = Date.now() + 2000;
	let actual = '';
	while (Date.now() < deadline) {
		actual = await vscode.env.clipboard.readText();
		if (actual === expected) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	assert.strictEqual(actual, expected);
}
