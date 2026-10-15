# Contributing to RestCraft

Install dependencies with `npm ci`, then run `npm run check` to check lint
(including warnings), Prettier formatting, and TypeScript types. Fix formatting
with `npm run format`. Generated files, binary assets, and the npm lockfile are
excluded from formatting checks.

Installing dependencies also installs Husky's local Git hooks. Before a commit,
`pre-commit` runs `npm run check` against the working directory; `commit-msg`
runs `scripts/commit.sh --message-file` against the pending commit message.
Either failing check prevents the commit. Checks include unstaged changes;
these hooks do not stage or reformat files. Run `npm run prepare` to reinstall
the hooks in an existing checkout. CI and production installs skip hook setup.
Required CI checks provide the final enforcement on pull requests.

Run `./scripts/commit.sh origin/main HEAD` to validate every commit introduced by
your branch relative to its merge base with main. You can supply other base and
head refs as arguments. Commit subjects must use `type: summary` or
`type(scope): summary`, with one of `build`, `chore`, `ci`, `docs`, `feat`, `fix`,
`perf`, `refactor`, `revert`, `style`, or `test`. Use a `BREAKING CHANGE:` footer
for breaking changes with the Angular semantic-release preset. Ordinary merge
subjects and `fixup!` subjects fail validation; rebase or squash them before
submitting the final branch history.

Pull request CI runs `commits` and `verify` in parallel. The `verify` job checks
lint, formatting, and types, then runs extension tests and builds the production
bundle. Its status check is named **Verify extension**. The final **CI gate**
fails if either job fails, is cancelled, or is skipped. Configure **CI gate** as a required status
check in the main branch ruleset to block merging when any of these checks fails.

## Build and debug

Use Node.js 22.18 or later for local development (CI uses Node 22; releases use Node 24).
Run `npm run compile` to build the extension or `npm run watch` during development.
In VS Code, use the **Run Extension** launch configuration to open an Extension Host.
The launch configuration starts the watch task automatically.

`npm run package` creates the production JavaScript bundle; it does not create a `.vsix`.
Release publishing is automated from `main` with semantic-release. Use `fix:` for a patch
or `feat:` for a minor release. Do not use `npm run release` as a verification command:
it can publish the extension.

## Badges on corporate networks

The previous release and semantic-release badges both loaded images from `img.shields.io`.
If both disappear on a corporate network while GitHub-hosted badges load, a proxy,
content filter, or domain policy affecting that shared hostname is a likely cause.
An HTTP 200 response outside the restricted environment confirms availability there;
it does not establish what the corporate proxy allows.

The README uses GitHub-hosted workflow badges and ordinary release and semantic-release
links so those links remain useful without Shields images. If a GitHub badge still
fails, open its image URL and inspect the browser network error or ask your network
administrator whether `github.com` image requests are permitted. Compare the same URL
on an unrestricted network to distinguish a network policy from a broken workflow URL.

## Tests

Tests live in `test/unit/` and `test/integration/` and use `// Arrange`, `// Act`,
and `// Assert` sections to make setup, behavior, and expectations easy to follow.

- `npm test` compiles and runs both suites in a VS Code Extension Host.
- `npm run test:unit` runs unit tests using mocked boundary data such as fetch responses,
  browser actions, and DOM behavior.
- `npm run test:integration` runs actual modules together, including request parsing,
  environment resolution, persistence, VS Code filesystem/editor behavior, and local HTTP.

Integration tests use temporary files and loopback servers; they do not require external
API credentials. Both suites use the VS Code test runner, which may download VS Code on
the first run. Linux requires a display; CI uses `xvfb-run -a npm test`. A failed download
or Extension Host launch is an infrastructure failure, not a passing test run.

Run `npm run check`, `npm test`, and `npm run package` before handing off a code change.
The CI verification job runs the same checks and production build.
