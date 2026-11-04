import * as assert from 'assert';
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { readMethodDecoration } from '../../src/request/methodDecoration';
import {
	RequestFileDecorationProvider,
	showMethodBadgeSetting,
	showMethodColorSetting,
} from '../../src/request/requestFileDecoration';

const decorationTestLock = path.join(tmpdir(), 'restcraft-file-decoration-tests.lock');

suite('Request file decorations', function () {
	this.timeout(20000);

	// Opening a workspace starts two extension hosts that both execute tests.
	// Hold this lock so they do not change decoration settings at the same time.
	suiteSetup(async function () {
		this.timeout(60000);
		await acquireDecorationTestLock();
	});

	suiteTeardown(() => {
		releaseDecorationTestLock();
	});

	let directory!: vscode.Uri;
	let provider!: RequestFileDecorationProvider;
	let cancellation!: vscode.CancellationTokenSource;
	const events: Array<vscode.Uri | vscode.Uri[] | undefined> = [];
	let eventSubscription: vscode.Disposable | undefined;

	setup(async () => {
		events.length = 0;
		cancellation = new vscode.CancellationTokenSource();
		const root = vscode.workspace.workspaceFolders?.[0];
		assert.ok(root, 'Integration tests open a workspace folder so request-file watchers can see new files.');
		directory = vscode.Uri.file(await mkdtemp(path.join(root.uri.fsPath, 'restcraft-decorations-')));
		provider = new RequestFileDecorationProvider();
		eventSubscription = provider.onDidChangeFileDecorations((value) => events.push(value));
	});

	teardown(async () => {
		eventSubscription?.dispose();
		provider?.dispose();
		cancellation?.dispose();
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		const configuration = vscode.workspace.getConfiguration('restcraft');
		await configuration.update('showMethodBadge', undefined, vscode.ConfigurationTarget.Global);
		await configuration.update('showMethodColor', undefined, vscode.ConfigurationTarget.Global);
		if (directory) {
			await vscode.workspace.fs.delete(directory, { recursive: true });
		}
	});

	test('decorates known methods and skips invalid, missing, and unknown methods', async () => {
		// Arrange
		const methods = ['GET', 'POST', 'PUT', 'DELETE', 'QUERY', 'PATCH', 'HEAD', 'OPTIONS'];
		const files = new Map<string, vscode.Uri>();
		for (const method of methods) {
			const uri = vscode.Uri.joinPath(directory, `${method.toLowerCase()}.api.json`);
			files.set(method, uri);
			await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify({ method: method.toLowerCase() })));
		}
		const invalid = vscode.Uri.joinPath(directory, 'invalid.api.json');
		const missing = vscode.Uri.joinPath(directory, 'missing.api.json');
		const unknown = vscode.Uri.joinPath(directory, 'unknown.api.json');
		const plain = vscode.Uri.joinPath(directory, 'notes.json');
		await vscode.workspace.fs.writeFile(invalid, Buffer.from('{'));
		await vscode.workspace.fs.writeFile(missing, Buffer.from('{"name":"Draft"}'));
		await vscode.workspace.fs.writeFile(unknown, Buffer.from('{"method":"TRACE"}'));
		await vscode.workspace.fs.writeFile(plain, Buffer.from('{"method":"GET"}'));

		// Act
		const decorations = new Map<string, vscode.FileDecoration | undefined>();
		for (const [method, uri] of files) {
			decorations.set(method, await provider.provideFileDecoration(uri, cancellation.token));
		}

		// Assert
		for (const method of methods) {
			const decoration = decorations.get(method);
			const expected = readMethodDecoration(JSON.stringify({ method }));
			assert.ok(decoration);
			assert.ok(expected);
			assert.strictEqual(decoration.badge, expected.badge);
			assert.strictEqual(decoration.tooltip, method);
			assert.strictEqual(decoration.color?.id, expected.colorId);
			assert.strictEqual(decoration.propagate, undefined);
		}
		assert.strictEqual(await provider.provideFileDecoration(invalid, cancellation.token), undefined);
		assert.strictEqual(await provider.provideFileDecoration(missing, cancellation.token), undefined);
		assert.strictEqual(await provider.provideFileDecoration(unknown, cancellation.token), undefined);
		assert.strictEqual(await provider.provideFileDecoration(plain, cancellation.token), undefined);
		await vscode.workspace.fs.delete(files.get('GET')!);
		assert.strictEqual(await provider.provideFileDecoration(files.get('GET')!, cancellation.token), undefined);
	});

	test('toggles the badge and color independently and refreshes on setting changes', async () => {
		// Arrange
		const uri = vscode.Uri.joinPath(directory, 'toggle.api.json');
		await vscode.workspace.fs.writeFile(uri, Buffer.from('{"method":"POST"}'));
		const configuration = vscode.workspace.getConfiguration('restcraft');

		// Act
		const before = events.length;
		await configuration.update('showMethodBadge', false, vscode.ConfigurationTarget.Global);
		await waitForNewEvent(events, before, (value) => value === undefined);
		const colorOnly = await provider.provideFileDecoration(uri, cancellation.token);
		const colorChange = events.length;
		await configuration.update('showMethodColor', false, vscode.ConfigurationTarget.Global);
		await waitForNewEvent(events, colorChange, (value) => value === undefined);
		const neither = await provider.provideFileDecoration(uri, cancellation.token);
		await configuration.update('showMethodBadge', true, vscode.ConfigurationTarget.Global);
		const badgeOnly = await provider.provideFileDecoration(uri, cancellation.token);

		// Assert
		assert.strictEqual(colorOnly?.badge, undefined);
		assert.strictEqual(colorOnly?.color?.id, 'restcraft.method.post');
		assert.strictEqual(neither, undefined);
		assert.strictEqual(badgeOnly?.badge, 'PO');
		assert.strictEqual(badgeOnly?.color, undefined);
		assert.ok(showMethodBadgeSetting.endsWith('showMethodBadge'));
		assert.ok(showMethodColorSetting.endsWith('showMethodColor'));
	});

	test('refreshes decorations when a request file is created, changed, or deleted', async () => {
		// Arrange
		const uri = vscode.Uri.joinPath(directory, 'watched.api.json');

		// Act
		const createdAt = events.length;
		await vscode.workspace.fs.writeFile(uri, Buffer.from('{"method":"GET"}'));
		await waitForNewEvent(events, createdAt, (value) => eventIncludes(value, uri));
		const created = await provider.provideFileDecoration(uri, cancellation.token);

		const changedAt = events.length;
		await vscode.workspace.fs.writeFile(uri, Buffer.from('{"method":"DELETE"}'));
		await waitForNewEvent(events, changedAt, (value) => eventIncludes(value, uri));
		const changed = await provider.provideFileDecoration(uri, cancellation.token);

		const deletedAt = events.length;
		await vscode.workspace.fs.delete(uri);
		await waitForNewEvent(events, deletedAt, (value) => eventIncludes(value, uri));
		const deleted = await provider.provideFileDecoration(uri, cancellation.token);

		// Assert
		assert.strictEqual(created?.badge, 'GT');
		assert.strictEqual(changed?.badge, 'DE');
		assert.strictEqual(deleted, undefined);
	});

	test('keeps request files on the JSON language and leaves plain JSON files unchanged', async () => {
		// Arrange
		const requestUri = vscode.Uri.joinPath(directory, 'get-users.api.json');
		const plainUri = vscode.Uri.joinPath(directory, 'package.json');
		await vscode.workspace.fs.writeFile(requestUri, Buffer.from('{"method":"GET","url":"https://example.com"}\n'));
		await vscode.workspace.fs.writeFile(plainUri, Buffer.from('{}\n'));
		const jsonFeatures = vscode.extensions.getExtension('vscode.json-language-features');
		assert.ok(jsonFeatures, 'The built-in JSON language features extension must be installed.');

		// Act
		await jsonFeatures.activate();
		const requestDocument = await vscode.workspace.openTextDocument(requestUri);
		const plainDocument = await vscode.workspace.openTextDocument(plainUri);
		await vscode.commands.executeCommand('vscode.openWith', requestUri, 'default');
		const invalidUri = vscode.Uri.joinPath(directory, 'broken.api.json');
		await vscode.workspace.fs.writeFile(invalidUri, Buffer.from('{\n'));
		const invalidDocument = await vscode.workspace.openTextDocument(invalidUri);
		await vscode.commands.executeCommand('vscode.openWith', invalidUri, 'default');
		const diagnostics = await waitForJsonErrors(invalidUri);

		// Assert
		assert.strictEqual(requestDocument.languageId, 'restcraft-request');
		assert.strictEqual(invalidDocument.languageId, 'restcraft-request');
		assert.strictEqual(plainDocument.languageId, 'json');
		assert.match(diagnostics[0]?.message ?? '', /Expected|comma|brace/);
		const validErrors = jsonErrors(requestUri);
		assert.deepStrictEqual(validErrors, []);
	});
});

function processIsRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function acquireDecorationTestLock(): Promise<void> {
	const deadline = Date.now() + 45000;
	while (Date.now() < deadline) {
		try {
			const fd = openSync(decorationTestLock, 'wx');
			writeSync(fd, String(process.pid));
			closeSync(fd);
			return;
		} catch {
			try {
				const owner = Number(readFileSync(decorationTestLock, 'utf8'));
				if (!Number.isInteger(owner) || owner === process.pid || !processIsRunning(owner)) {
					unlinkSync(decorationTestLock);
					continue;
				}
			} catch {
				// The owner released the lock between the create attempt and this read.
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}
	throw new Error('Timed out waiting for the other extension host to finish decoration tests.');
}

function releaseDecorationTestLock(): void {
	try {
		if (readFileSync(decorationTestLock, 'utf8') === String(process.pid)) {
			unlinkSync(decorationTestLock);
		}
	} catch {
		// The lock is already gone.
	}
}

function jsonErrors(uri: vscode.Uri): readonly vscode.Diagnostic[] {
	return vscode.languages
		.getDiagnostics(uri)
		.filter((item) => item.source === 'restcraft-request' && item.severity === vscode.DiagnosticSeverity.Error);
}

function waitForJsonErrors(uri: vscode.Uri): Promise<readonly vscode.Diagnostic[]> {
	const existing = jsonErrors(uri);
	if (existing.length > 0) {
		return Promise.resolve(existing);
	}
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			subscription.dispose();
			const found = jsonErrors(uri);
			if (found.length > 0) {
				resolve(found);
				return;
			}
			reject(
				new Error(
					`No JSON syntax diagnostics for ${uri.fsPath}. Saw ${JSON.stringify(vscode.languages.getDiagnostics(uri))}.`,
				),
			);
		}, 15000);
		const subscription = vscode.languages.onDidChangeDiagnostics((event) => {
			if (!event.uris.some((item) => item.toString() === uri.toString())) {
				return;
			}
			const found = jsonErrors(uri);
			if (found.length === 0) {
				return;
			}
			clearTimeout(timer);
			subscription.dispose();
			resolve(found);
		});
	});
}

function eventIncludes(value: vscode.Uri | vscode.Uri[] | undefined, uri: vscode.Uri): boolean {
	if (!value) {
		return false;
	}
	const uris = Array.isArray(value) ? value : [value];
	return uris.some((item) => item.toString() === uri.toString());
}

async function waitForNewEvent(
	events: Array<vscode.Uri | vscode.Uri[] | undefined>,
	start: number,
	matches: (value: vscode.Uri | vscode.Uri[] | undefined) => boolean,
): Promise<void> {
	const deadline = Date.now() + 8000;
	while (Date.now() < deadline) {
		if (events.slice(start).some(matches)) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Timed out waiting for a file decoration change. Saw ${events.length - start} new events.`);
}
