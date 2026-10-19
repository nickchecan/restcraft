# AGENTS.md

## Project Purpose

`restcraft` is a Visual Studio Code extension that provides a Postman-like interface for creating, managing, and executing API requests from file-based definitions inside VS Code.

The extension supports `.api.json` request files, a custom request editor, an API Workbench webview, environment file selection and substitution, OAuth 2.0 client credentials and authorization code flows, and user-triggered HTTP execution through the extension host.

## Architecture Overview

This repository is a TypeScript VS Code extension bundled with esbuild.

- VS Code loads the extension from `dist/extension.js`.
- The source entry point is `src/extension.ts`.
- `src/extension.ts` exports `activate` and `deactivate`.
- Commands are contributed in `package.json` and implemented through VS Code's command API.
- Request parsing, environment resolution, and request execution live under `src/request/`.
- Shared low-level helpers live under `src/shared/`.
- Webview panel/editor code lives under `src/webview/`.
- Tests are TypeScript Mocha tests in `test/unit/` and `test/integration/`, compiled to `out/test/`, and run with `vscode-test`.
- Bundling is handled by `esbuild.js`.

There is not yet a persistent storage layer beyond workspace files, a broader domain model, or a separate frontend framework for Webviews.

## Important Files and Folders

- `package.json`: VS Code extension manifest, contributed commands, npm scripts, and dev dependencies.
- `src/extension.ts`: Extension activation entry point and command registration.
- `src/request/types.ts`: Request/response types and supported HTTP method helpers.
- `src/request/requestFile.ts`: `.api.json` request parser and validation.
- `src/request/environment.ts`: `.env` parsing and `{{VARIABLE}}` substitution.
- `src/request/environmentSettings.ts`: nearest/manual environment selection validation.
- `src/request/oauth.ts` and `src/request/authorizationCode.ts`: OAuth token requests, PKCE, and authorization code helpers.
- `src/request/requestRunner.ts`: User-triggered HTTP execution through `fetch`.
- `src/shared/object.ts`: Shared object and string-record type guards.
- `src/webview/requestEditorProvider.ts`: Custom text editor provider for `.api.json` files.
- `src/webview/requestWebview.ts`: Webview message handling and environment-aware request execution.
- `src/webview/requestDocument.ts`: request persistence and canonical header serialization.
- `src/webview/oauthCallback.ts` and `src/webview/oauthBrowser.ts`: OAuth callback lifecycle and browser authorization.
- `src/webview/getWebviewHtml.ts`: Generated Webview HTML, CSS, and client-side script.
- `test/unit/` and `test/integration/`: mocked-boundary and real-component Mocha tests compiled to `out/test/`.
- `esbuild.js`: esbuild bundling configuration for the extension runtime.
- `tsconfig.json`: TypeScript compiler settings.
- `eslint.config.mjs`: ESLint configuration.
- `.prettierrc.json` and `.prettierignore`: formatting conventions and exclusions.
- `scripts/commit.sh`: shared PR commit range and pending commit message validation.
- `.husky/`: local hooks and the TypeScript hook installer.
- `.github/workflows/ci.yml`: PR commit validation, verification, and final gate.
- `.github/workflows/release.yml` and `release.config.cjs`: release authentication and publishing.
- `.vscode/launch.json`: Debug launch configuration for the Extension Host.
- `.vscode/tasks.json`: VS Code build/watch tasks.
- `.vscode-test.mjs`: VS Code test runner configuration.
- `.vscodeignore`: Files excluded from packaged extension output.
- `README.md`: User-facing project documentation.
- `CHANGELOG.md`: Release notes.

## Install Dependencies

Use the existing lockfile:

```sh
npm ci
```

Use `npm install` when intentionally changing dependencies, and include the corresponding `package-lock.json` change. Do not run `npm audit fix --force` as incidental cleanup.

Use Node 22.18+ for the TypeScript Husky installer. PR CI uses Node 22; the release workflow uses Node 24. Check dependency engine requirements when choosing a local Node version.

## Checks, Formatting, and Local Hooks

- Run `npm run check` for lint (warnings fail), Prettier validation, and type checking. There is no `scripts/check.sh`.
- Run `npm run format:check` to check formatting and `npm run format` to fix it. Prefer formatting only the files you changed when avoiding unrelated diffs.
- Prettier uses tabs, single quotes, and a 120-character print width. Respect `.prettierignore`; do not edit generated output to fix checks.
- Dependency installation runs `prepare`, which invokes `.husky/install.ts`. `npm run prepare` reinstalls hooks in an existing checkout. CI and production installations skip hook setup.
- `.husky/pre-commit` runs `npm run check` against the working directory, including unstaged changes. It does not stage or fix files.
- `.husky/commit-msg` validates the pending message using `bash scripts/commit.sh --message-file <file>`.
- Do not bypass hooks to conceal failing checks. Report failures and fix them within the task's scope.

## Pull Request CI and Branch Rules

- `commits` (**Validate commits**) and `verify` (**Verify extension**) run in parallel.
- `commits` fetches full history and validates commits introduced by the PR relative to its merge base. Locally use `bash scripts/commit.sh origin/main HEAD`, or provide explicit base/head refs. CI supplies `PR_BASE_SHA` and `PR_HEAD_SHA`.
- `verify` runs `npm run check`, extension tests under `xvfb`, and `npm run package`.
- `gate` (**CI gate**) depends on both jobs and fails if either fails, is cancelled, or is skipped. Requiring **CI gate** in GitHub rules blocks merges on either job's failure.
- Job IDs and displayed status check names differ. Coordinate any renaming with GitHub's required checks; stale required names remain **Expected** and block merges.
- Repository rulesets are external GitHub settings. Inspect their current state before changing them; do not assume local workflow edits update protection.
- The intended sole bypass actor is the dedicated `restcraft-release-nickchecan` GitHub App, using **Always** mode for release commits. Do not add admin roles, other apps, or a general Actions bypass as a workaround.

## Build

Available build-related commands from `package.json`:

```sh
npm run compile
npm run check-types
npm run lint
npm run package
```

`npm run compile` runs type checking, linting, and esbuild.

`npm run package` runs type checking, linting, and a production esbuild bundle.

For watch mode:

```sh
npm run watch
npm run watch:esbuild
npm run watch:tsc
```

## Run Tests

Available test commands from `package.json`:

```sh
npm run compile-tests
npm run watch-tests
npm test
```

`npm test` uses `vscode-test`. The `pretest` script runs `compile-tests`, `compile`, and `lint` first.

Tests live outside `src` in the top-level `test/` folder. Imports from tests should reference source modules through `../../src/...`.

Run relevant tests for behavior changes and `npm run check` before handing off code. `npm test` launches a VS Code Extension Host and may need network access to download it; Linux needs a display such as `xvfb-run -a npm test`. If download or launch fails, report the infrastructure limitation separately from test failures. Compilation or lint alone does not establish that tests passed.

## Cursor Cloud specific instructions

The default `node` on `PATH` may be older than 22.18. On the base image, `/exec-daemon/node` can be v22.14 and win over later Node installs, and that version cannot run the TypeScript Husky installer at `.husky/install.ts`. Environment install places Node.js 22.23.3 at `/usr/local/bin/node`. When `node -v` is below 22.18, prefix `npm ci`, `npm run check`, `npm test`, and `npm run package` with `PATH="/usr/local/bin:$PATH"`.

There is no dev server to start. Linux tests use `xvfb-run -a npm test`. `xvfb` is installed by the environment setup when it is missing.

## Release and Publishing

Publishing is handled by semantic-release through `.github/workflows/release.yml`. semantic-release, `@semantic-release/exec`, `@semantic-release/git`, and `@semantic-release/github` are not project dependencies. The release workflow and `npm run release` invoke those pinned versions with `npx --yes -p`. `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, and `@semantic-release/npm` are dependencies of semantic-release and are not pinned separately. The release step runs after `npm ci` and prepends `node_modules/.bin` to `PATH` so the exec plugin can run `vsce`, which stays a devDependency.

- The release workflow runs on pushes to `main`.
- `release.config.cjs` uses the Angular conventional commit preset.
- Use `fix:` for patch releases and `feat:` for minor releases.
- Use a `BREAKING CHANGE:` footer only when a major release is intended. The current commit validator rejects `!` headers; do not assume support from other conventional commit presets.
- Allowed subject types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, and `test`, with optional scope: `type(scope): summary`. Ordinary merge subjects and `fixup!` subjects fail validation.
- `docs:`, `chore:`, and other non-release commit types usually do not trigger publishing.
- The release job verifies, packages, creates a `.vsix`, publishes with `vsce`, and requires the `VSCE_PAT` secret.
- Release authentication also requires the Actions variable `RELEASE_APP_CLIENT_ID` and Actions secret `RELEASE_APP_PRIVATE_KEY` (complete PEM). Never print, commit, or copy credential values into chat or logs.
- `actions/create-github-app-token` creates a repository-scoped token after verification, with contents, issues, and pull requests write permissions. Semantic-release receives it as `GITHUB_TOKEN`; the workflow's default token remains read-only.
- Keep checkout's `persist-credentials: false` so cached default credentials do not override the App token for pushes. The commit author `semantic-release-bot` is not the authenticated bypass actor.
- `@semantic-release/git` updates `package.json` and `package-lock.json` with `chore(release): ... [skip ci]`. Preserve the skip marker to avoid recursive workflow runs from App-authenticated pushes. Do not bump versions manually unless requested.
- `npm run package` builds the production JavaScript bundle; it does not create a `.vsix`. Running `npm run release` can publish to the Marketplace and must not be used as a verification command.
- To test the Marketplace token locally without publishing, run:

```sh
npx vsce verify-pat --pat "$VSCE_PAT" nickchecan
```

Do not commit, push, publish, or package a `.vsix` unless explicitly requested.

## Launch and Debug

Use VS Code's `Run Extension` launch configuration in `.vscode/launch.json`.

The launch configuration:

- Starts an Extension Host.
- Uses the repository as `--extensionDevelopmentPath`.
- Reads generated JavaScript from `dist/**/*.js`.
- Runs the default build task before launch.

The default build task is `watch`, defined in `.vscode/tasks.json`, and it runs:

- `npm: watch:tsc`
- `npm: watch:esbuild`

## Coding Style Expectations

- Write TypeScript with `strict` compiler settings in mind.
- Keep extension activation lightweight.
- Register disposables with `context.subscriptions`.
- Prefer small, focused modules and keep request logic separate from activation and Webview plumbing.
- Keep command IDs namespaced under `restcraft`.
- Use VS Code APIs instead of Node-only behavior when interacting with workspace files where possible.
- Keep user-facing errors clear and actionable.
- Add or update tests when adding behavior that can be validated without manual Extension Host testing.
- Follow the existing ESLint rules:
  - Import names should be camelCase or PascalCase.
  - Use curly braces for control flow.
  - Use strict equality.
  - Do not throw literals.
  - Use semicolons.

## Rules for Webview Code

- Keep Webview-specific code separate from extension activation and request execution logic.
- Do not inline large UI implementations into `src/extension.ts`.
- Use VS Code Webview security practices:
  - Restrict `localResourceRoots`.
  - Use a strict Content Security Policy.
  - Use nonces for scripts.
  - Avoid enabling scripts unless the view needs them.
- Treat all messages from the Webview as untrusted input.
- Validate message shapes before acting on them.
- Keep request execution in the extension host, not directly in the Webview.
- Use message passing for UI actions and results.
- Avoid hard-coded absolute local paths in generated Webview HTML.

## Rules for VS Code Extension APIs

- Keep `activate` fast and defer expensive work until a command or view needs it.
- Register commands in code only when they are also contributed in `package.json`, unless they are intentionally internal.
- Dispose subscriptions through `context.subscriptions`.
- Prefer `vscode.workspace.fs` and `vscode.Uri` for workspace file operations.
- Use `vscode.window.showErrorMessage`, `showWarningMessage`, or `showInformationMessage` for user-visible feedback where appropriate.
- Do not assume there is always an open workspace folder.
- Do not assume there is always an active editor.
- Avoid long-running synchronous work in the extension host.
- Keep command behavior deterministic and testable outside VS Code APIs where possible by extracting pure logic.

## Request File Structure

- Requests should be file-based and stored in the workspace.
- Request definitions should be human-readable and version-control friendly.
- The current canonical file extension is `.api.json`.
- Request files currently support:
  - `name`: non-empty string
  - `method`: one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`
  - `url`: `http` or `https` URL, including environment references
  - `params`: ordered `{ name, value, enabled }` query parameter entries
  - `headerState`: canonical ordered `{ name, value, enabled }` header entries
  - `headers`: legacy string-valued object accepted on read; canonical saves use `headerState` instead
  - `body`: any JSON value, stored as `null` when absent in the editor
  - Optional `description`, `authorization`, `environment`, and `authorizeBeforeSend` fields; follow `src/request/types.ts`, parser validation, and README examples for their shapes
- Preserve disabled parameters and headers in the saved file, but omit them from execution. Keep legacy request loading compatible.
- Environment references use `{{VARIABLE_NAME}}`. Nearest mode searches the request directory and then parents up to the containing workspace root, using the first `.env` found without merging files. Manual mode uses the selected path and does not fall back when it is missing; relative paths resolve from the request directory.
- Reading environment values, OAuth operations, and sending requests require a trusted workspace. Keep secrets out of diagnostics and generated HTML.
- Tokens may be stored in an `.env` variable or directly in the Authorization header according to the user's choice. Preserve that choice and unrelated environment entries. Prefer variable references for client secrets.
- OAuth browser callbacks must remain correlated to their attempt; cancellation and late callbacks must not authorize a different request. Keep PKCE verifiers and authorization codes transient.
- Request execution uses `restcraft.requestTimeout` (30 seconds by default; zero disables it). Preserve cancellation and timeout behavior.

Do not change the request file format without updating examples, parser behavior, tests, and user-facing documentation.

## What Not To Change Without Asking

- Do not rename the extension, publisher metadata, or command namespace without asking.
- Do not replace the build system or test runner without asking.
- Do not introduce a frontend framework for Webviews without asking.
- Do not add runtime dependencies for HTTP clients, parsers, state management, or UI without asking.
- Do not change the request file format without asking.
- Do not add network execution behavior that sends real HTTP requests without clear user-triggered action.
- Do not remove generated scaffold files such as `README.md`, `CHANGELOG.md`, or VS Code config unless the user asks for cleanup.
- Do not commit, push, publish, or package a `.vsix` unless explicitly requested.

## Scope and Handoff

- Inspect `git status` before editing and preserve unrelated user changes.
- Keep README examples and parser/persistence tests synchronized with user-facing behavior changes.
- Keep generated `dist/`, `out/`, `.vscode-test/`, and `.husky/_/` output out of source changes. Exclude development tooling from extension packages through `.vscodeignore`.
- Report what changed, which checks actually passed, and any remaining blockers. Do not claim a PR was merged, protection enabled, or a release published without verifying that external state.
- A future webview cleanup may split `getWebviewHtml.ts` into smaller modules; do not introduce a frontend framework as incidental cleanup.
