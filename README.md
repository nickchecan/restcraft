# RestCraft for VS Code

[![Latest release](https://img.shields.io/github/v/release/nickchecan/restcraft?label=release)](https://github.com/nickchecan/restcraft/releases/latest)
[![semantic-release: angular](https://img.shields.io/badge/semantic--release-angular-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)
[![CI](https://github.com/nickchecan/restcraft/actions/workflows/ci.yml/badge.svg)](https://github.com/nickchecan/restcraft/actions/workflows/ci.yml)
[![Release](https://github.com/nickchecan/restcraft/actions/workflows/release.yml/badge.svg)](https://github.com/nickchecan/restcraft/actions/workflows/release.yml)

RestCraft brings a Postman-like request workflow directly into Visual Studio Code. It lets developers define API requests as readable `.api.json` files, edit them through a focused request UI, and send them from the editor without switching tools.

Because requests live in your workspace, they can be reviewed, shared, versioned, and kept next to the code that depends on them. RestCraft is especially useful when you want lightweight endpoint testing, team-friendly request definitions, and environment-based values without maintaining a separate API client collection.

<p align="center">
  <img src="assets/demo.gif" alt="RestCraft demo" width="860">
</p>

## Features

- Create and edit `.api.json` request files with a custom VS Code editor.
- Choose a name and location for new request files from the Command Palette.
- Open the API Workbench for a dedicated request-building experience.
- Send HTTP and HTTPS requests from inside VS Code.
- View response status, headers, and body after execution.
- Store request definitions as plain JSON files that work well with Git.
- Use sibling `.env` files to substitute values such as hosts, tokens, and credentials.
- Keep request execution in the extension host instead of the Webview.

## Why Use RestCraft?

API testing often lives outside the project, which makes requests harder to discover, review, and keep in sync with the codebase. RestCraft keeps the request workflow close to the source.

Use it to:

- Document important endpoints with executable examples.
- Share API requests through the same pull requests as application code.
- Test local, staging, or production endpoints with environment variables.
- Avoid context switching while building or debugging API integrations.

## Getting Started

1. Run `RestCraft: Open API Workbench` or `RestCraft: Create Request File` from the Command Palette.
2. Choose the request file's name and location. RestCraft adds `.api.json` if needed and opens the new file in the API Workbench editor.
3. Edit your request and save the file with `Cmd+S` (macOS) or `Ctrl+S` (Windows/Linux).
4. Send the request from the editor. You can also open an existing `.api.json` file directly in VS Code.

Example request file:

```json
{
  "name": "Get user profile",
  "method": "GET",
  "url": "https://api.example.com/users/{{USER_ID}}?include=settings",
  "params": [
    {
      "name": "include",
      "value": "settings",
      "enabled": true
    },
    {
      "name": "debug",
      "value": "1",
      "enabled": false
    }
  ],
  "headerState": [
    {
      "name": "Authorization",
      "value": "Bearer {{API_TOKEN}}",
      "enabled": true
    },
    {
      "name": "X-Debug",
      "value": "1",
      "enabled": false
    }
  ],
  "body": null
}
```

## Request File Format

Request files use the `.api.json` extension and support:

| Property | Required | Description |
| --- | --- | --- |
| `name` | Yes | Human-readable request name. |
| `method` | Yes | One of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`. |
| `url` | Yes | An `http` or `https` URL. |
| `params` | No | Array of query parameters with `name`, `value`, and `enabled` fields. Disabled params stay in the editor but are omitted from the sent URL. |
| `headerState` | No | Array of headers with `name`, `value`, and `enabled` fields. Disabled headers stay in the editor but are omitted when sending the request. |
| `headers` | Legacy | Supported for older files; converted to enabled `headerState` rows when `headerState` is absent. |
| `body` | No | Any JSON value. Use `null` when the request does not need a body. |

When `params` is omitted, RestCraft backfills enabled params from the query string in `url` for compatibility with older request files. After editing query params in the custom editor, RestCraft saves the `params` array so enabled and disabled states are remembered when the request is reopened.

When `headerState` is omitted, RestCraft backfills enabled header rows from `headers` for compatibility with older request files. After editing headers in the custom editor, RestCraft saves `headerState` so enabled and disabled header states are remembered when the request is reopened.

## Environment Variables

RestCraft resolves `{{VARIABLE_NAME}}` placeholders from the nearest `.env` file. It checks the request file's folder first, then each parent folder up to the containing VS Code workspace folder. The first `.env` found is used; files are not merged. This lets a root `.env` provide defaults for requests in child folders while a closer `.env` overrides it for requests in its folder and descendants.

For example, requests in `folder1` use the root `.env` when `folder1` has none, while requests in `folder3` use `folder3/.env` when it exists. RestCraft does not search above the workspace folder. Sending requests and reading `.env` values requires a trusted workspace.

Example `.env` file:

```sh
USER_ID=123
API_TOKEN=your-token-here
BASE_URL=https://api.example.com
```

You can use variables in URLs, headers, and request bodies:

```json
{
  "name": "Create project",
  "method": "POST",
  "url": "{{BASE_URL}}/projects",
  "params": [],
  "headerState": [
    {
      "name": "Authorization",
      "value": "Bearer {{API_TOKEN}}",
      "enabled": true
    },
    {
      "name": "Content-Type",
      "value": "application/json",
      "enabled": true
    }
  ],
  "body": {
    "name": "Launch Plan"
  }
}
```

## Commands

RestCraft contributes these commands to VS Code:

| Command | Description |
| --- | --- |
| `RestCraft: Open API Workbench` | Asks for a name and location, creates a `.api.json` request file, and opens its API Workbench editor. |
| `RestCraft: Create Request File` | Creates and opens a request file after choosing its name and location. |
| `RestCraft: Load Request File` | Loads the active `.api.json` file into the API Workbench. |

## Feedback

Found a bug or have an idea for improving RestCraft? Open an issue in the project repository.

### OAuth 2.0 (Client Credentials)

In the **Authorization** tab, choose **OAuth 2.0**, then **Client Credentials**.
Enter an HTTPS **Access Token URL**, **Client ID**, **Client Secret**, and optional
space-separated **Scope**. Click **Get new access token** to retrieve a token
and apply it as the request's `Authorization: Bearer …` header.

Token requests use HTTP Basic client authentication and a form-encoded
`grant_type=client_credentials` body. The fields support `{{VARIABLE_NAME}}`
references from the request's environment. Token retrieval requires a trusted
workspace and uses the configured request timeout.

OAuth settings are saved in the optional `authorization` object in `.api.json`.
Save the request file to keep the selected grant type and all OAuth fields when
reopening it. Empty fields are supported while configuring the request. Older
files without this object continue to infer authentication from their headers.
When **Save token to .env** is unchecked, retrieved tokens persist directly
in the request's `Authorization` header and are restored when reopened.
The read-only **Access Token** field shows the token configured for the request,
resolving environment references from its selected `.env`. This output is never
saved as an additional field in the request file. The saved Authorization
header remains available for sending requests. The output area has **Access Token**
, **Decoded Token**, and a **Hidden** radio option that hides the output area. JWT header and payload decoding happens locally;
signatures are not verified. Opaque or malformed tokens show an explanatory message.

To persist a token, enable **Save token to .env**, enter a **Variable Name**
(default `ACCESS_TOKEN`), and click **Get new access token**. Each successful
retrieval updates that variable in the closest `.env`, searching the request's
folder and then its parents up to the workspace root. If none exists, a `.env`
is created beside the request. Other variables and comments are preserved.
Save any unsaved `.env` edits before retrieving a token with storage enabled.
A request file must be saved or loaded to use token storage.

The request stores `Bearer {{ACCESS_TOKEN}}` (or your chosen variable name) rather
than the token itself. Reopened requests resolve this reference when sent.
Changing the checkbox or variable name takes effect on the next token retrieval;
it does not move or delete previously stored values.
Literal client secrets are stored as plain text in the request file; use
`{{CLIENT_SECRET}}` with your `.env` file to keep the secret out of the request.

Example OAuth configuration (alongside the existing request properties):

```json
"authorization": {
  "type": "oauth2",
  "grantType": "client_credentials",
  "accessTokenUrl": "https://demo.duendesoftware.com/connect/token",
  "clientId": "m2m",
  "clientSecret": "{{CLIENT_SECRET}}",
  "scope": "api",
  "updateAuthorizationHeader": true,
  "storeAccessToken": true,
  "accessTokenVariable": "ACCESS_TOKEN"
}
```

`grantType` accepts `client_credentials` or `authorization_code`. Tokens are not
refreshed automatically. **Authorization Code** is a placeholder for future work;
selecting it hides the token fields and retrieval button.

### Request Settings

The **Settings** tab shows the path of the existing `.env` selected for the
request as a full absolute path (or URI for remote files). Click **Open** beside the read-only path to open the file in VS Code. If no `.env` is found,
the field stays empty. Lookup starts beside the request and walks up to the
workspace root, matching request execution. Reopen the Settings tab to refresh
the path after creating or moving an environment file.

In **Settings**, **Use nearest .env** is the default. Select **Set up .env manually**
and use **Browse…** to choose an existing environment file. The picker lists
hidden `.env` and `.env.*` files in the project, including ignored files. Choose
**Enter a file path…** for a file outside the project or a different filename. The selected file is
used for variable resolution, tooltips, and OAuth token storage. **Open** opens it.
Manual mode never falls back to another file when the selected file is missing.
Save the request to persist the selection in an optional `environment` object:

```json
"environment": {
  "mode": "manual",
  "path": "../config/.env"
}
```

Manual paths are relative to the request's directory. Older files without
`environment` continue to use the nearest `.env`. Selecting nearest mode removes
the manual configuration from the saved request.

**Update header** is checked by default. Uncheck it to retrieve a
token for display (and save it to `.env` if enabled) without adding or replacing
the request's Authorization header. The choice persists in OAuth settings as
`updateAuthorizationHeader`; older requests default to enabled.

Changing **Save token to .env**, **Variable Name**, or **Update header** does not
rewrite existing header rows. A new token or environment reference is applied
only after **Get new access token** succeeds with **Update header** checked.

### Header storage and older requests

`headerState` is the canonical saved header representation. Each row stores its
`name`, `value`, and `enabled` flag. Execution derives headers from enabled rows;
disabled values remain saved but are not sent. The redundant `headers` object is
no longer written. Old files containing only `headers` remain supported: their
entries load as enabled rows and convert to `headerState` on the next editor save.
If both forms exist, `headerState` takes precedence.

In VS Code **Settings**, set **RestCraft: Default Token View**
(`restcraft.defaultTokenView`) to **raw** (Access Token, default), **decoded**
(Decoded Token), or **hidden**. This extension-wide preference applies when you open the Authorization tab.
Retrieving tokens preserves your current output selection. It is not stored in request files. Existing
per-request `defaultTokenView` fields are removed the next time the request is
edited and saved. Output radio options remain available for temporary changes.
