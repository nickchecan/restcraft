# RestCraft for VS Code

[![CI](https://github.com/nickchecan/restcraft/actions/workflows/ci.yml/badge.svg)](https://github.com/nickchecan/restcraft/actions/workflows/ci.yml)
[![Release](https://github.com/nickchecan/restcraft/actions/workflows/release.yml/badge.svg)](https://github.com/nickchecan/restcraft/actions/workflows/release.yml)
[![Dependabot Updates](https://github.com/nickchecan/restcraft/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/nickchecan/restcraft/actions/workflows/dependabot/dependabot-updates)
[![CodeQL](https://github.com/nickchecan/restcraft/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/nickchecan/restcraft/actions/workflows/github-code-scanning/codeql)

[Latest release](https://github.com/nickchecan/restcraft/releases/latest) · [Automated releases with semantic-release](https://github.com/semantic-release/semantic-release)

Create, save, and send HTTP API requests inside Visual Studio Code. RestCraft gives you a Postman-like API client with readable `.api.json` files you can share and review in Git alongside your code.

<p align="center">
  <img src="assets/demo.gif" alt="Create and send an API request in RestCraft" width="860">
</p>

## What you can do

- Build REST API requests with query parameters, headers, JSON bodies, and request descriptions.
- Keep disabled parameters and headers saved for later without sending them.
- Inspect response status, headers, and body in the API Workbench.
- Use `{{VARIABLE}}` references with the nearest `.env` or a manually selected environment file.
- Authenticate with Basic auth, Bearer tokens, or OAuth 2.0 client credentials and authorization code with PKCE. Authorization Code allows an optional client secret when sending credentials in the body.
- Save OAuth tokens in `.env` and optionally authorize before each request.
- Cancel requests and configure a request timeout.

## Network history

Run **RestCraft: Show Network History** from the Command Palette to open a live panel of API calls and OAuth token exchanges. Select a call to inspect its request, response, timestamps, status, and duration. Filter by method, URL, or status, and use **Clear history** to remove recorded calls. Calls appear individually in chronological order, newest first, and keep collecting while the panel is closed.

History keeps the latest 100 calls in memory for the current extension session. Each request and response preview is limited to 100,000 characters, with truncation marked; the Output channel retains the full logged text. History uses the same redaction setting as the network log and stores the displayed content only. Changing the setting affects new calls; it does not change existing entries. Clearing history does not clear the Output channel. Browser login traffic and intermediate redirects are not captured.

## Network log

Click the **Open RestCraft log console** (debug-console) button immediately after History in the request editor footer, run **RestCraft: Show Network Log** from the Command Palette, or select **Restcraft Network** in VS Code's Output panel. Requests are logged automatically while RestCraft is active, including OAuth token exchanges before an API request. Each call has a matching request/response ID, timestamps, duration, method, resolved URL, headers, and response body. Failed, cancelled, and timed-out calls are recorded too.

Authorization and cookie headers and common secret fields (including tokens, client secrets, passwords, and API keys) are masked in headers, query parameters, JSON bodies, and form-encoded bodies. The **Restcraft: Redact Sensitive Content In Network Log** setting (`restcraft.redactSensitiveContentInNetworkLog`) is enabled by default. Uncheck it to log full URLs, headers, and bodies, including credentials and tokens. Changes apply to new requests without reloading VS Code; existing output is unchanged. Other content is logged in full; arbitrary text and custom secret field names may still contain sensitive data. Review logs before sharing them. JSON is formatted for readability. Request/response indicator lines (including timestamps and status) and the **Headers:** and **Body:** labels use theme-aware syntax highlighting in the Output panel.

The channel is session output, not persistent request history. Use the Output panel's Clear Output action to clear it. It captures the input supplied to the HTTP runtime and the returned response, rather than exact wire bytes, runtime-added headers, intermediate redirects, or browser login traffic. Bodies are text, consistent with the response viewer.

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

## Settings

Open VS Code Settings and search for **RestCraft**.

| Setting                                        | Default | Purpose                                                                             |
| ---------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `restcraft.requestTimeout`                     | `30000` | Request timeout in milliseconds; `0` disables it.                                   |
| `restcraft.showEnvironmentVariableValues`      | `true`  | Show resolved environment values in hover tooltips.                                 |
| `restcraft.defaultTokenView`                   | `raw`   | Show raw, decoded, or hidden token output. JWT decoding does not verify signatures. |
| `restcraft.autoGenerateAuthorizationCodeState` | `false` | Generate state when selecting Authorization Code if the field is empty.             |
| `restcraft.suppressInsecureCredentialWarning`  | `false` | Suppress the warning about credentials sent to remote servers over HTTP.            |

## More help

- [Request format, environments, and OAuth guide](https://github.com/nickchecan/restcraft/blob/main/docs/request-guide.md)
- [Report a bug or request a feature](https://github.com/nickchecan/restcraft/issues)
- [Release notes](https://github.com/nickchecan/restcraft/releases)
- [Development and testing](https://github.com/nickchecan/restcraft/blob/main/docs/development.md)
