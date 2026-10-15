import * as assert from 'assert';
import { NetworkHistory, NetworkHistoryEntry } from '../../src/request/networkHistory';
import { setNetworkLogSink } from '../../src/request/networkLog';
import { executeRequest } from '../../src/request/requestRunner';
import { getNetworkHistoryHtml } from '../../src/webview/networkHistoryHtml';
import { runInNewContext } from 'vm';

suite('Network history', () => {
	const entry = (id: number): NetworkHistoryEntry => ({
		id,
		started: 'now',
		method: 'GET',
		url: 'https://example.com',
		request: 'request',
		status: 'Pending',
		redacted: true,
	});

	test('limits entries, updates in place, and isolates snapshots', () => {
		const history = new NetworkHistory(2);
		let changes = 0;
		const subscription = history.onChange(() => changes++);
		history.update(entry(1));
		history.update(entry(2));
		history.update(entry(3));
		history.update({ ...entry(2), response: 'response', status: '200' });
		assert.deepStrictEqual(
			history.getEntries().map((e) => e.id),
			[3, 2],
		);
		const snapshot = history.getEntries();
		snapshot[0].request = 'mutated';
		assert.strictEqual(history.getEntries()[0].request, 'request');
		assert.strictEqual(history.getEntries()[1].response, 'response');
		assert.strictEqual(changes, 4);
		subscription.dispose();
		history.clear();
		assert.strictEqual(changes, 4);
	});

	test('clear and eviction do not resurrect calls that finish later', () => {
		const history = new NetworkHistory(1);
		history.update(entry(1));
		history.update(entry(2));
		history.update({ ...entry(1), response: 'late' });
		assert.deepStrictEqual(
			history.getEntries().map((e) => e.id),
			[2],
		);
		history.clear();
		history.update({ ...entry(2), response: 'late' });
		assert.deepStrictEqual(history.getEntries(), []);
	});

	test('captures pending calls and sanitized responses without retaining raw secrets', async () => {
		const history = new NetworkHistory();
		const originalFetch = globalThis.fetch;
		setNetworkLogSink(
			undefined,
			() => true,
			(e) => history.update(e),
		);
		globalThis.fetch = async () => {
			assert.strictEqual(history.getEntries()[0].status, 'Pending');
			return new Response('{"access_token":"private-token","data":"ok"}');
		};
		try {
			await executeRequest({
				method: 'POST',
				url: 'https://example.com?api_key=private-key',
				headers: { Authorization: 'private-auth' },
			});
			const recorded = JSON.stringify(history.getEntries());
			assert.ok(!recorded.includes('private-'));
			assert.ok(recorded.includes('REDACTED'));
			assert.ok(recorded.includes('ok'));
			assert.ok(history.getEntries()[0].durationMs !== undefined);
		} finally {
			setNetworkLogSink(undefined);
			globalThis.fetch = originalFetch;
		}
	});

	test('the shared redaction setting controls new history entries in both directions', async () => {
		const history = new NetworkHistory();
		const originalFetch = globalThis.fetch;
		let enabled = true;
		setNetworkLogSink(
			undefined,
			() => enabled,
			(e) => history.update(e),
		);
		globalThis.fetch = async () => new Response('{"access_token":"private-token"}');
		const request = {
			method: 'POST',
			url: 'https://example.com?api_key=private-key',
			headers: { Authorization: 'private-auth' },
			body: '{"client_secret":"private-secret"}',
		};
		try {
			await executeRequest(request);
			enabled = false;
			await executeRequest(request);
			enabled = true;
			await executeRequest(request);
			const entries = history.getEntries();
			assert.deepStrictEqual(
				entries.map((e) => e.redacted),
				[true, false, true],
			);
			for (const secret of ['private-token', 'private-key', 'private-auth', 'private-secret']) {
				assert.ok(JSON.stringify(entries[1]).includes(secret), secret);
				assert.ok(!JSON.stringify(entries[0]).includes(secret), secret);
				assert.ok(!JSON.stringify(entries[2]).includes(secret), secret);
			}
		} finally {
			setNetworkLogSink(undefined);
			globalThis.fetch = originalFetch;
		}
	});

	test('webview renders hostile network data as text and wires selection, filtering and clearing', () => {
		class Element {
			textContent = '';
			value = '';
			dataset: Record<string, string> = {};
			children: Element[] = [];
			listeners: Record<string, () => void> = {};
			attributes: Record<string, string> = {};
			addEventListener(name: string, listener: () => void) {
				this.listeners[name] = listener;
			}
			replaceChildren() {
				this.children = [];
			}
			append(child: Element) {
				this.children.push(child);
			}
			setAttribute(name: string, value: string) {
				this.attributes[name] = value;
			}
			focus() {}
		}
		const elements = Object.fromEntries(
			['calls', 'filter', 'summary', 'request', 'response', 'clear'].map((id) => [id, new Element()]),
		);
		const sent: unknown[] = [];
		let receive: (event: unknown) => void = () => {};
		const html = getNetworkHistoryHtml('testnonce');
		const script = html.match(/<script nonce="testnonce">([\s\S]*?)<\/script>/)?.[1];
		assert.ok(script);
		runInNewContext(script, {
			acquireVsCodeApi: () => ({ postMessage: (message: unknown) => sent.push(message) }),
			document: {
				activeElement: null,
				getElementById: (id: string) => elements[id],
				createElement: () => new Element(),
			},
			window: {
				addEventListener: (_name: string, listener: typeof receive) => {
					receive = listener;
				},
			},
		});
		const hostile = '<script>alert(1)</script>';
		receive({ data: { type: 'history', entries: [{ ...entry(1), request: hostile, response: hostile }, entry(2)] } });
		assert.strictEqual(elements.request.textContent, hostile);
		assert.strictEqual(elements.response.textContent, hostile);
		elements.calls.children[1].listeners.click();
		assert.strictEqual(elements.request.textContent, 'request');
		elements.filter.value = 'no match';
		elements.filter.listeners.input();
		assert.strictEqual(elements.calls.textContent, 'No matching calls.');
		elements.clear.listeners.click();
		assert.strictEqual(JSON.stringify(sent), '[{"type":"ready"},{"type":"clear"}]');
		assert.ok(html.includes("default-src 'none'"));
		assert.ok(!script.includes('innerHTML'));
	});
});
