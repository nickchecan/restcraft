const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const config = require('../release.config.cjs');
const { verifyRelease, releaseCommands } = require('./release.cjs');
const whatBump = config.plugins['@release-it/conventional-changelog'].whatBump;

test('release credentials are required without including their values in errors or commands', () => {
	assert.throws(() => verifyRelease({}, {}), /publisher/);
	assert.throws(() => verifyRelease({ publisher: 'test' }, {}), /VSCE_PAT/);
	assert.throws(() => verifyRelease({ publisher: 'test' }, { VSCE_PAT: 'fake' }), /GITHUB_TOKEN/);
	verifyRelease({ publisher: 'test' }, { VSCE_PAT: 'fake', GITHUB_TOKEN: 'fake' });
	const prepare = releaseCommands('prepare', '1.2.3');
	assert.deepEqual(prepare[0], ['npm', ['run', 'package']]);
	assert.deepEqual(prepare[1][1].slice(1), ['package', '--out', 'dist/restcraft-1.2.3.vsix']);
	assert.deepEqual(releaseCommands('publish', '1.2.3')[0][1].slice(1), [
		'publish',
		'--packagePath',
		'dist/restcraft-1.2.3.vsix',
	]);
	assert.throws(() => releaseCommands('publish', '1.2.3; echo unsafe'), /stable release/);
	assert.equal(config.git.requireBranch, 'main');
	assert.equal(config.npm.publish, false);
	assert.equal(config.github.release, true);
	assert.deepEqual(config.github.assets, ['dist/restcraft-${version}.vsix']);
	assert.equal(config.hooks['after:bump'], 'node scripts/release.cjs prepare ${version}');
	assert.equal(config.hooks['after:git:release'], 'node scripts/release.cjs publish ${version}');
});

test('Git credential helper supplies only the release App credential to Git', () => {
	const helper = path.join(__dirname, 'git-askpass.sh');
	const env = { ...process.env, GITHUB_TOKEN: 'fake-test-token' };
	assert.equal(
		execFileSync('bash', [helper, 'Username for https://github.com:'], { env, encoding: 'utf8' }).trim(),
		'x-access-token',
	);
	assert.equal(
		execFileSync('bash', [helper, 'Password for https://github.com:'], { env, encoding: 'utf8' }).trim(),
		'fake-test-token',
	);
});

test('non-release commits do not trigger a release; fixes, features, reverts, and breaking changes do', async () => {
	const commit = (type, notes = []) => ({ type, notes });
	assert.equal(await whatBump([]), null);
	assert.equal(await whatBump([commit('docs'), commit('chore')]), null);
	assert.deepEqual(await whatBump([commit('fix')]), { level: 2 });
	assert.deepEqual(await whatBump([commit('perf')]), { level: 2 });
	assert.deepEqual(await whatBump([commit('revert')]), { level: 2 });
	assert.deepEqual(await whatBump([commit('fix'), commit('feat')]), { level: 1 });
	assert.deepEqual(await whatBump([commit('feat'), commit('chore', [{ title: 'BREAKING CHANGE' }])]), { level: 0 });
});

for (const [message, version] of [
	['docs: update usage', null],
	['fix: resolve a bug', '1.0.1'],
	['feat: add a capability', '1.1.0'],
	['fix: change behavior\n\nBREAKING CHANGE: remove the old behavior', '2.0.0'],
	['reverted feature', null],
]) {
	test(`release lifecycle in an isolated local repository: ${message.split('\n')[0]}`, () => {
		const root = mkdtempSync(path.join(tmpdir(), 'restcraft-release-'));
		const cwd = path.join(root, 'repo');
		mkdirSync(cwd);
		const git = (...args) =>
			execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
		try {
			execFileSync('git', ['init', '--bare', path.join(root, 'remote.git')], { stdio: 'pipe' });
			git('init', '-b', 'main');
			git('config', 'user.name', 'Release Test');
			git('config', 'user.email', 'release-test@example.invalid');
			git('config', 'core.hooksPath', path.join(root, 'no-hooks'));
			git('remote', 'add', 'origin', path.join(root, 'remote.git'));
			writeFileSync(
				path.join(cwd, 'package.json'),
				JSON.stringify({ name: 'release-test', version: '1.0.0', private: true }),
			);
			writeFileSync(
				path.join(cwd, 'package-lock.json'),
				JSON.stringify({
					name: 'release-test',
					version: '1.0.0',
					lockfileVersion: 3,
					packages: { '': { name: 'release-test', version: '1.0.0' } },
				}),
			);
			git('add', '.');
			git('commit', '-m', 'chore: initialize');
			git('tag', 'v1.0.0');
			git('push', '-u', 'origin', 'main', '--tags');
			if (message === 'reverted feature') {
				writeFileSync(path.join(cwd, 'feature.txt'), 'temporary capability');
				git('add', '.');
				git('commit', '-m', 'feat: temporary capability');
				git('revert', '--no-edit', 'HEAD');
			} else {
				git('commit', '--allow-empty', '-m', message);
			}
			const configPath = path.join(root, 'fixture.config.cjs');
			writeFileSync(
				configPath,
				`const config = require(${JSON.stringify(path.resolve(__dirname, '../release.config.cjs'))}); module.exports = { ...config, github: false, hooks: {} };`,
			);
			const before = git('rev-parse', 'HEAD');
			const cli = path.resolve(__dirname, '../node_modules/release-it/bin/release-it.js');
			execFileSync(process.execPath, [cli, '--ci', '--config', configPath], {
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				env: { ...process.env, CI: 'true' },
			});
			const actualVersion = JSON.parse(readFileSync(path.join(cwd, 'package.json'))).version;
			assert.equal(actualVersion, version || '1.0.0');
			assert.equal(JSON.parse(readFileSync(path.join(cwd, 'package-lock.json'))).version, actualVersion);
			assert.equal(git('status', '--porcelain'), '');
			if (version) {
				assert.equal(git('log', '-1', '--format=%s'), `chore(release): ${version} [skip ci]`);
				assert.equal(git('rev-parse', `v${version}^{commit}`), git('rev-parse', 'HEAD'));
				assert.equal(git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0], git('rev-parse', 'HEAD'));
				assert.match(git('ls-remote', 'origin', `refs/tags/v${version}`), /refs\/tags\/v/);
			} else {
				assert.equal(git('rev-parse', 'HEAD'), before);
				assert.equal(git('tag', '--list').split('\n').length, 1);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
}
