# Changelog

All notable changes to the "restcraft" extension will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic-release for versioning.

## [Unreleased]

- `.api.json` files use the `restcraft-request` language. `[json]` editor settings no longer apply. Copy them under `[restcraft-request]`. The built-in JSON formatter still formats request files. Prettier needs `editor.defaultFormatter` for `[restcraft-request]` and `**/*.api.json` in `prettier.documentSelectors`.
- Added a command for creating a new `.api.json` request file from the current directory.
- Added a README badge linking to the latest GitHub release.

## [1.2.2] - 2026-05-12

### Fixed

- Documented the publishing workflow and release process more clearly.

## [1.2.1] - 2026-05-12

### Fixed

- Added source-level documentation for extension, request, shared helper, and webview functions.

## [1.2.0] - 2026-05-12

### Added

- Persisted disabled query parameters and headers in request files so users can keep draft values without sending them.
- Added request examples that demonstrate persisted disabled params and headers.

### Fixed

- Preserved disabled query parameters when editing and sending requests from the webview.

### Changed

- Renamed the extension from API Companion to RestCraft across metadata, documentation, source code, examples, and tests.
- Updated the marketplace icon and demo GIF.

## [1.1.0] - 2026-05-12

### Added

- Added publisher metadata and validation for VS Code Marketplace publishing.

## [1.0.0] - 2026-05-11

### Added

- Added the API Workbench webview for building and sending requests inside VS Code.
- Added `.api.json` request file support, including parsing, validation, and custom editor integration.
- Added request editing for names, methods, URLs, query parameters, headers, body content, and body type controls.
- Added request execution from the editor and workbench, with response status, timing, size, headers, formatted content, raw response, and HTML preview views.
- Added bearer token and basic authentication support.
- Added sibling `.env` variable substitution for request URLs, headers, and bodies.
- Added editor footer controls and response/request layout improvements.
- Added marketplace-ready README documentation, MIT license, semantic-release setup, and VS Code Marketplace publishing workflow.
- Added CI support for running VS Code tests with `xvfb`.

### Fixed

- Preserved the selected request body type when editing requests.
- Always displayed the basic auth password field correctly.
- Fixed the esbuild watch problem matcher.

[Unreleased]: https://github.com/nickchecan/restcraft/compare/v1.2.2...HEAD
[1.2.2]: https://github.com/nickchecan/restcraft/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/nickchecan/restcraft/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/nickchecan/restcraft/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/nickchecan/restcraft/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/nickchecan/restcraft/releases/tag/v1.0.0
