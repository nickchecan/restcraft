const { spawnSync } = require('node:child_process');
const path = require('node:path');

function verifyRelease(pkg, env) {
	if (!pkg.publisher) {
		throw new Error('Missing package.json publisher for VS Code Marketplace publishing.');
	}
	if (!env.VSCE_PAT) {
		throw new Error('Missing VSCE_PAT secret for VS Code Marketplace publishing.');
	}
	if (!env.GITHUB_TOKEN) {
		throw new Error('Missing GITHUB_TOKEN for GitHub publishing.');
	}
}

function releaseCommands(action, version) {
	if (!/^\d+\.\d+\.\d+$/.test(version)) {
		throw new Error('Expected a stable release version.');
	}
	const artifact = `dist/restcraft-${version}.vsix`;
	if (action === 'prepare') {
		return [
			['npm', ['run', 'package']],
			[process.execPath, [require.resolve('@vscode/vsce/vsce'), 'package', '--out', artifact]],
		];
	}
	if (action === 'publish') {
		return [[process.execPath, [require.resolve('@vscode/vsce/vsce'), 'publish', '--packagePath', artifact]]];
	}
	throw new Error('Unknown release action.');
}

if (require.main === module) {
	try {
		const [action, version] = process.argv.slice(2);
		verifyRelease(require(path.resolve('package.json')), process.env);
		if (action !== 'verify') {
			for (const [command, args] of releaseCommands(action, version)) {
				const result = spawnSync(command, args, { stdio: 'inherit' });
				if (result.error) {
					throw result.error;
				}
				if (result.status !== 0) {
					process.exit(result.status || 1);
				}
			}
		}
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}

module.exports = { verifyRelease, releaseCommands };
