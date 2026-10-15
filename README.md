# RestCraft for VS Code

[![CI](https://github.com/nickchecan/restcraft/actions/workflows/ci.yml/badge.svg)](https://github.com/nickchecan/restcraft/actions/workflows/ci.yml)
[![Release](https://github.com/nickchecan/restcraft/actions/workflows/release.yml/badge.svg)](https://github.com/nickchecan/restcraft/actions/workflows/release.yml)
[![Dependabot Updates](https://github.com/nickchecan/restcraft/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/nickchecan/restcraft/actions/workflows/dependabot/dependabot-updates)
[![CodeQL](https://github.com/nickchecan/restcraft/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/nickchecan/restcraft/actions/workflows/github-code-scanning/codeql)

[Latest release](https://github.com/nickchecan/restcraft/releases/latest) · [Request guide](https://github.com/nickchecan/restcraft/blob/main/docs/request-guide.md) · [Report an issue](https://github.com/nickchecan/restcraft/issues)

Create, save, and send HTTP API requests inside Visual Studio Code. RestCraft gives you a Postman-like API client with readable `.api.json` files you can share and review in Git alongside your code.

<p align="center">
  <img src="assets/demo.gif" alt="Create and send an API request in RestCraft" width="860">
</p>

## Features

- **File-based requests:** create and share readable `.api.json` files with names and descriptions, right beside your code.
- **Request editor:** GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS; ordered query parameters and headers; saved disabled entries; tab counts and indicators for configured fields.
- **Flexible bodies:** raw, JSON, text, XML, HTML, and form URL encoded, with JSON beautification.
- **Response inspection:** status, duration, size, formatted body, headers, raw text, and a sandboxed HTML preview.
- **Live server-sent events:** collapsible event cards with types, IDs, formatted JSON, and expand/collapse controls. Raw text and received events remain available after cancellation or timeout.
- **Environments:** `{{VARIABLE}}` references, variable highlighting and hover values, and nearest or manually selected `.env` files.
- **Authentication:** Basic, Bearer, and OAuth 2.0 Client Credentials or browser-based Authorization Code with PKCE. View, copy, decode, or hide tokens; save them in `.env` or the Authorization header; optionally authorize before sending.
- **Network tools:** searchable session history and a highlighted Output log for API calls and OAuth token exchanges, with sensitive-content redaction enabled by default.
- **Bruno import:** bring individual requests or whole BRU/OpenCollection YAML collections into RestCraft.
- **Request control:** cancel in-flight requests and configure timeouts, including long-lived streams.

## Start in a minute

Requires VS Code **1.118.0 or later**.

1. Install **RestCraft** from the VS Code Extensions view.
2. Open the Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Windows/Linux) and run **RestCraft: Create Request File**.
3. Choose a name and location. RestCraft adds `.api.json` and opens the request editor.
4. Enter a URL, choose a method, and click **Send**. Save with `Cmd+S` / `Ctrl+S` to keep your changes.

Existing `.api.json` files open directly in the API Workbench. To edit the JSON, right-click the editor tab and choose **Reopen Editor With… → Text Editor**.

Here is a request you can save as `get-user.api.json`:

```json
{
	"name": "Get user",
	"method": "GET",
	"url": "{{BASE_URL}}/users/{{USER_ID}}",
	"params": [],
	"headerState": [
		{
			"name": "Authorization",
			"value": "Bearer {{API_TOKEN}}",
			"enabled": true
		}
	],
	"body": null
}
```

Create a `.env` beside it with your own API values:

```dotenv
BASE_URL=https://api.example.com
USER_ID=123
API_TOKEN=your-token
```

RestCraft searches from the request's directory up to the workspace root and uses the first `.env` it finds. To switch environments, open the request's **Settings** tab and select **Set up .env manually**. Add files containing secrets to `.gitignore`.

Sending requests, reading environment values, and retrieving OAuth tokens require a trusted workspace. Keep client secrets in environment variables: literal secrets and tokens saved directly in request files are plain text.

In the **Authorization** tab with **OAuth 2.0** selected, drag the vertical divider to give the inputs or token output up to 120px more space. You can also focus the divider and use the Left/Right arrow keys. Double-click it or press Home to reset. On narrow screens, the sections stack without a draggable divider.

## Import from Bruno

Run **RestCraft: Import from Bruno** in the Command Palette and select a request file or collection folder. On Windows/Linux, choose the import type first.

- **Request:** import a `.bru`, `.yml`, or `.yaml` file as `.api.json` and open it in the editor.
- **Collection:** select a folder containing `bruno.json` or `opencollection.yml` / `opencollection.yaml`, then choose a destination parent folder. RestCraft creates a new folder and preserves the request folder structure.

Imports preserve names, methods, URLs, query parameters, disabled entries, headers, documentation, JSON/text/XML/form-urlencoded bodies, and bearer authentication. Collection imports also apply inherited collection and folder headers and bearer auth. Existing files are never overwritten, and importing never sends requests.

BRU and OpenCollection 1.0.0 YAML are supported; JSON collection exports are not. Configure `.env` files after import: Bruno environments, scripts, tests, assertions, runtime variables, and settings are not migrated. Warnings identify omissions; unsupported authentication or body modes stop the import. Use collection import when requests depend on inherited settings.

Try the [sample Bruno collections](https://github.com/nickchecan/restcraft/blob/main/examples/bruno/README.md).

## Network history and logs

Open **History** or **Open RestCraft log console** from the request editor footer, or run **RestCraft: Show Network History** / **RestCraft: Show Network Log** in the Command Palette.

**Network History** collects the latest 100 API calls and OAuth token exchanges during the extension session, even when its panel is closed. Filter by method, URL, or status, then select a call to inspect request/response details, timestamps, and duration. Previews are limited to 100,000 characters each; truncation is marked.

**Restcraft Network** in VS Code's Output panel includes full logged text, formatted JSON, highlighted headers, matching request/response IDs, and failed, cancelled, or timed-out calls. Clear history and Clear Output work independently. Neither view persists across extension sessions or captures browser login traffic or intermediate redirects.

Both views mask authorization/cookie headers and common secret fields by default. Disable `restcraft.redactSensitiveContentInNetworkLog` to include credentials and tokens in new entries; existing entries stay unchanged. Custom secret names and arbitrary text may still contain sensitive data, so review before sharing.

## Settings

Open VS Code Settings and search for **RestCraft**.

| Setting                                        | Default | Purpose                                                                             |
| ---------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `restcraft.requestTimeout`                     | `30000` | Timeout in milliseconds, including streams; `0` disables it.                        |
| `restcraft.redactSensitiveContentInNetworkLog` | `true`  | Mask common secrets in new network log and history entries.                         |
| `restcraft.showEnvironmentVariableValues`      | `true`  | Show resolved environment values in hover tooltips.                                 |
| `restcraft.defaultTokenView`                   | `raw`   | Show raw, decoded, or hidden token output. JWT decoding does not verify signatures. |
| `restcraft.autoGenerateAuthorizationCodeState` | `false` | Generate state when selecting Authorization Code if the field is empty.             |
| `restcraft.suppressInsecureCredentialWarning`  | `false` | Suppress the warning about credentials sent to remote servers over HTTP.            |

## More help

- [Request format, environments, and OAuth guide](https://github.com/nickchecan/restcraft/blob/main/docs/request-guide.md)
- [Report a bug or request a feature](https://github.com/nickchecan/restcraft/issues)
- [Release notes](https://github.com/nickchecan/restcraft/releases)
- [Development and testing](https://github.com/nickchecan/restcraft/blob/main/docs/development.md)

### Response header automation

In a request's **Automations** tab, add mappings from response header names (for example,
`X-Session-Token`) to environment variable names (for example, `SESSION_TOKEN`). Each enabled,
complete mapping runs after a user-triggered request finishes, for any HTTP status code. Header
names match without regard to case; missing headers leave existing variables unchanged.
Use `{{SESSION_TOKEN}}` in subsequent requests.

Mappings are saved with the request as an optional `automation` array:

```json
"automation": [
  { "header": "X-Session-Token", "variable": "SESSION_TOKEN", "enabled": true }
]
```

Writes use the request's environment selection in **Settings**: the nearest `.env` or the selected
manual file. In nearest mode, a missing `.env` is created beside the request; manual mode never
falls back to another file. Save or load a request file first. Automation requires a trusted
workspace and refuses to overwrite an environment file with unsaved edits. Existing comments,
unrelated variables, and line endings are preserved. Empty header values clear the mapped value;
values that cannot safely round-trip through the `.env` parser are rejected. A write failure
shows a warning while keeping the received response available.
