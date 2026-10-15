import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import * as vscode from 'vscode';
import { importBrunoCollection, importBrunoRequest } from '../../src/import/brunoFiles';
import { parseRequestFile } from '../../src/request/requestFile';

suite('Bruno import with real files and VS Code filesystem', () => {
	let temporary: string;
	const fixture = vscode.Uri.file(path.resolve(__dirname, '../../../test/fixtures/bruno'));
	setup(async () => {
		temporary = await mkdtemp(path.join(os.tmpdir(), 'restcraft-bruno-'));
	});
	teardown(async () => {
		await rm(temporary, { recursive: true, force: true });
	});
	async function load(uri: vscode.Uri) {
		return parseRequestFile(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)));
	}
	test('imports a standalone nested JSON request as canonical .api.json', async () => {
		const destination = vscode.Uri.file(path.join(temporary, 'create.api.json'));
		await importBrunoRequest(vscode.Uri.joinPath(fixture, 'Users', 'Nested', 'create.bru'), destination);
		const request = await load(destination);
		assert.strictEqual(request.method, 'POST');
		assert.deepStrictEqual(request.body, { name: 'Ada', profile: { roles: ['admin'], template: '{{ROLE}}' } });
		assert.strictEqual(request.headers['Content-Type'], 'application/json');
		const persisted = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(destination)));
		assert.strictEqual(persisted.headers, undefined);
	});

	test('imports all requests preserving directories, inheritance, and disabled entries', async () => {
		const destination = vscode.Uri.file(path.join(temporary, 'Imported'));
		const result = await importBrunoCollection(fixture, destination);
		assert.strictEqual(result.count, 2);
		const list = await load(vscode.Uri.joinPath(destination, 'Users', 'list.api.json'));
		assert.strictEqual(list.headers.Authorization, 'Bearer {{API_TOKEN}}');
		assert.strictEqual(list.headers.Accept, 'application/json');
		assert.strictEqual(list.headers['X-Resource'], 'users');
		assert.strictEqual(list.headers['X-Debug'], undefined);
		assert.strictEqual(list.headerState.find((row) => row.name === 'X-Debug')?.enabled, false);
		assert.deepStrictEqual(list.params, [
			{ name: 'page', value: '1', enabled: true },
			{ name: 'debug', value: 'true', enabled: false },
		]);
		assert.strictEqual(list.description, 'List active users.');
		const create = await load(vscode.Uri.joinPath(destination, 'Users', 'Nested', 'create.api.json'));
		assert.strictEqual(create.headers.Authorization, undefined);
		assert.strictEqual(create.headers.Accept, 'application/json');
		assert.ok(result.warnings.some((warning) => warning.includes('environments')));
	});

	test('refuses existing targets without changing their contents', async () => {
		const destination = vscode.Uri.file(path.join(temporary, 'existing.api.json'));
		await vscode.workspace.fs.writeFile(destination, Buffer.from('user content'));
		await assert.rejects(
			importBrunoRequest(vscode.Uri.joinPath(fixture, 'Users', 'list.bru'), destination),
			/already exists/,
		);
		assert.strictEqual(new TextDecoder().decode(await vscode.workspace.fs.readFile(destination)), 'user content');
	});

	test('refuses to merge a collection into an existing destination', async () => {
		const destination = vscode.Uri.file(path.join(temporary, 'existing'));
		await vscode.workspace.fs.createDirectory(destination);
		await assert.rejects(importBrunoCollection(fixture, destination), /already exists/);
		assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(destination), []);
	});

	test('invalid collection requests fail before writing any output', async () => {
		const source = vscode.Uri.file(path.join(temporary, 'source'));
		await vscode.workspace.fs.copy(fixture, source);
		await vscode.workspace.fs.writeFile(
			vscode.Uri.joinPath(source, 'invalid.bru'),
			Buffer.from('meta {\n  name: Broken\n}\n'),
		);
		const destination = vscode.Uri.file(path.join(temporary, 'output'));
		await assert.rejects(importBrunoCollection(source, destination), /invalid.bru/);
		await assert.rejects(async () => vscode.workspace.fs.stat(destination));
	});
});

suite('Bruno YAML import with real files and VS Code filesystem', () => {
	let temporary: string;
	const fixture = vscode.Uri.file(path.resolve(__dirname, '../../../test/fixtures/bruno-yaml'));
	setup(async () => {
		temporary = await mkdtemp(path.join(os.tmpdir(), 'restcraft-bruno-yaml-'));
	});
	teardown(async () => {
		await rm(temporary, { recursive: true, force: true });
	});
	async function load(uri: vscode.Uri) {
		return parseRequestFile(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)));
	}

	test('imports a standalone .yaml request and round-trips its nested JSON', async () => {
		const destination = vscode.Uri.file(path.join(temporary, 'create.api.json'));
		await importBrunoRequest(vscode.Uri.joinPath(fixture, 'Users', 'Nested', 'create.yaml'), destination);
		const request = await load(destination);
		assert.strictEqual(request.method, 'POST');
		assert.deepStrictEqual(request.body, { name: 'Ada', profile: { roles: ['admin'], template: '{{ROLE}}' } });
		assert.strictEqual(request.headers['Content-Type'], 'application/json');
	});

	test('imports .yml and .yaml in nested folders, applying inheritance and preserving disabled/repeated rows', async () => {
		const destination = vscode.Uri.file(path.join(temporary, 'Imported'));
		const result = await importBrunoCollection(fixture, destination);
		assert.strictEqual(result.count, 2);
		const list = await load(vscode.Uri.joinPath(destination, 'Users', 'list.api.json'));
		assert.strictEqual(list.url, 'https://api.example.com/users/42?page=1');
		assert.strictEqual(list.headers.Authorization, 'Bearer {{API_TOKEN}}');
		assert.strictEqual(list.headers.accept, 'application/problem+json');
		assert.strictEqual(list.headers.Accept, undefined);
		assert.strictEqual(list.headers['X-Resource'], 'users');
		assert.strictEqual(list.headers['X-Debug'], undefined);
		assert.strictEqual(list.headerState.find((row) => row.name === 'X-Debug')?.enabled, false);
		assert.deepStrictEqual(
			list.params.map((row) => [row.name, row.value, row.enabled]),
			[
				['page', '1', true],
				['tag', 'a', true],
				['tag', 'b', true],
				['debug', 'true', false],
			],
		);
		assert.strictEqual(list.description, 'List active users.');
		const create = await load(vscode.Uri.joinPath(destination, 'Users', 'Nested', 'create.api.json'));
		assert.strictEqual(create.headers.Authorization, undefined);
		assert.strictEqual(create.headers['X-Resource'], 'users');
		assert.ok(result.warnings.some((warning) => warning.includes('runtime')));
		assert.ok(result.warnings.some((warning) => warning.includes('environments')));
		await assert.rejects(async () => vscode.workspace.fs.stat(vscode.Uri.joinPath(destination, 'environments')));
	});

	test('malformed YAML or unsupported authentication fails before any collection output is written', async () => {
		const source = vscode.Uri.file(path.join(temporary, 'source'));
		await vscode.workspace.fs.copy(fixture, source);
		const invalid = vscode.Uri.joinPath(source, 'invalid.yml');
		for (const content of [
			'http: [',
			'info:\n  name: Digest\n  type: http\nhttp:\n  method: GET\n  url: https://example.com\n  auth:\n    type: digest',
		]) {
			await vscode.workspace.fs.writeFile(invalid, Buffer.from(content));
			const destination = vscode.Uri.file(path.join(temporary, 'output'));
			await assert.rejects(importBrunoCollection(source, destination), /invalid.yml/);
			await assert.rejects(async () => vscode.workspace.fs.stat(destination));
		}
	});

	test('rejects .yml/.yaml filename collisions before writing', async () => {
		const source = vscode.Uri.file(path.join(temporary, 'source'));
		await vscode.workspace.fs.copy(fixture, source);
		await vscode.workspace.fs.copy(
			vscode.Uri.joinPath(source, 'Users', 'list.yml'),
			vscode.Uri.joinPath(source, 'Users', 'list.yaml'),
		);
		const destination = vscode.Uri.file(path.join(temporary, 'output'));
		await assert.rejects(importBrunoCollection(source, destination), /same destination/);
		await assert.rejects(async () => vscode.workspace.fs.stat(destination));
	});

	test('standalone .yml import refuses to overwrite an existing request', async () => {
		const destination = vscode.Uri.file(path.join(temporary, 'existing.api.json'));
		await vscode.workspace.fs.writeFile(destination, Buffer.from('user content'));
		await assert.rejects(
			importBrunoRequest(vscode.Uri.joinPath(fixture, 'Users', 'list.yml'), destination),
			/already exists/,
		);
		assert.strictEqual(new TextDecoder().decode(await vscode.workspace.fs.readFile(destination)), 'user content');
	});
});
