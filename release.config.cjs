module.exports = {
	branches: ['main'],
	tagFormat: 'v${version}',
	plugins: [
		[
			'@semantic-release/commit-analyzer',
			{
				preset: 'angular',
			},
		],
		[
			'@semantic-release/release-notes-generator',
			{
				preset: 'angular',
			},
		],
		[
			'@semantic-release/npm',
			{
				npmPublish: false,
			},
		],
		[
			'@semantic-release/exec',
			{
				verifyConditionsCmd:
					"node -e \"const pkg = require('./package.json'); if (!pkg.publisher) { console.error('Missing package.json publisher for VS Code Marketplace publishing.'); process.exit(1); } if (!process.env.VSCE_PAT) { console.error('Missing VSCE_PAT secret for VS Code Marketplace publishing.'); process.exit(1); }\"",
				prepareCmd: 'npm run package && vsce package --out dist/restcraft-${nextRelease.version}.vsix',
				publishCmd: 'vsce publish --packagePath dist/restcraft-${nextRelease.version}.vsix --pat "$VSCE_PAT"',
			},
		],
		[
			'@semantic-release/git',
			{
				assets: ['package.json', 'package-lock.json'],
				message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
			},
		],
		[
			'@semantic-release/github',
			{
				assets: [
					{
						path: 'dist/restcraft-*.vsix',
						label: 'RestCraft VS Code extension',
					},
				],
			},
		],
	],
};
