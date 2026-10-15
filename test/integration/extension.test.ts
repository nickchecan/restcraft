import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension activation', () => {
	test('activates the installed extension and registers its request command', async () => {
		// Arrange
		const extension = vscode.extensions.getExtension('nickchecan.restcraft');
		assert.ok(extension, 'The development extension must be installed in the Extension Host.');

		// Act
		await extension.activate();
		const commands = await vscode.commands.getCommands(true);

		// Assert
		assert.strictEqual(extension.isActive, true);
		assert.ok(commands.includes('restcraft.createRequestFile'));
		assert.ok(commands.includes('restcraft.importBruno'));
		assert.ok(!commands.includes('restcraft.importBrunoRequest'));
		assert.ok(!commands.includes('restcraft.importBrunoCollection'));
		const contributed = extension.packageJSON.contributes.commands as { command: string }[];
		assert.deepStrictEqual(
			contributed.filter((entry) => entry.command.startsWith('restcraft.importBruno')).map((entry) => entry.command),
			['restcraft.importBruno'],
		);
		assert.ok(commands.includes('restcraft.showNetworkHistory'));
		assert.ok(commands.includes('restcraft.showNetworkLog'));
	});
});
