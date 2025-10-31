import * as assert from 'node:assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Commands are registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const expected = [
			'multi-repo-git-commands.runGitAll',
			'multi-repo-git-commands.runCustomGitAll',
			'multi-repo-git-commands.statusAll',
			'multi-repo-git-commands.fetchAll',
			'multi-repo-git-commands.pullAll',
		];
		for (const cmd of expected) {
			assert.ok(commands.includes(cmd), `Command not found: ${cmd}`);
		}
	});
});
