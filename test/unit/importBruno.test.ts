import * as assert from 'assert';
import * as vscode from 'vscode';
import { selectBrunoSource } from '../../src/commands/importBruno';

suite('Unified Bruno source picker', () => {
	test('macOS allows choosing a request or collection in the same dialog', async () => {
		for (const name of ['request.yml', 'collection']) {
			const source = vscode.Uri.file(`/examples/${name}`);
			const actual = await selectBrunoSource('darwin', {
				chooseKind: async () => {
					throw new Error('macOS should not need a kind prompt.');
				},
				open: async (options) => {
					assert.strictEqual(options.canSelectFiles, true);
					assert.strictEqual(options.canSelectFolders, true);
					assert.strictEqual(options.canSelectMany, false);
					assert.deepStrictEqual(options.filters, { 'Bruno requests': ['bru', 'yml', 'yaml'] });
					return [source];
				},
			});
			assert.strictEqual(actual, source);
		}
	});

	for (const platform of ['win32', 'linux'] as const) {
		for (const kind of ['Request file', 'Collection folder']) {
			test(`${platform} opens a supported native dialog for ${kind}`, async () => {
				const source = vscode.Uri.file('/examples/source');
				const actual = await selectBrunoSource(platform, {
					chooseKind: async () => kind,
					open: async (options) => {
						assert.strictEqual(options.canSelectFiles, kind === 'Request file');
						assert.strictEqual(options.canSelectFolders, kind === 'Collection folder');
						return [source];
					},
				});
				assert.strictEqual(actual, source);
			});
		}
	}

	test('cancelling the kind prompt does not open a dialog', async () => {
		assert.strictEqual(
			await selectBrunoSource('win32', {
				chooseKind: async () => undefined,
				open: async () => {
					throw new Error('No dialog expected after cancellation.');
				},
			}),
			undefined,
		);
	});

	test('cancelling the native dialog returns no source', async () => {
		assert.strictEqual(
			await selectBrunoSource('darwin', {
				chooseKind: async () => undefined,
				open: async () => undefined,
			}),
			undefined,
		);
	});
});
