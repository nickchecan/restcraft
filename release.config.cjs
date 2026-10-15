module.exports = {
	git: {
		requireBranch: 'main',
		requireUpstream: false,
		commitMessage: 'chore(release): ${version} [skip ci]\n\n${changelog}',
		tagName: 'v${version}',
	},
	npm: { publish: false, versionArgs: ['--ignore-scripts'] },
	github: {
		release: true,
		releaseName: 'v${version}',
		assets: ['dist/restcraft-${version}.vsix'],
	},
	plugins: {
		'@release-it/conventional-changelog': {
			preset: { name: 'angular' },
			infile: false,
			async whatBump(commits) {
				const { filterRevertedCommitsSync } = await import('conventional-commits-filter');
				commits = Array.from(filterRevertedCommitsSync(commits));
				if (commits.some((commit) => commit.notes.some((note) => note.title === 'BREAKING CHANGE'))) {
					return { level: 0 };
				}
				if (commits.some((commit) => commit.type === 'feat')) {
					return { level: 1 };
				}
				if (commits.some((commit) => ['fix', 'perf', 'revert'].includes(commit.type) || commit.revert)) {
					return { level: 2 };
				}
				return null;
			},
		},
	},
	hooks: {
		'before:init': 'node scripts/release.cjs verify',
		'after:bump': 'node scripts/release.cjs prepare ${version}',
		'after:git:release': 'node scripts/release.cjs publish ${version}',
	},
};
