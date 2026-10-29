# Request guide

[Back to RestCraft](../README.md)

## Request file format

Request files use the `.api.json` extension and support:

| Property              | Required | Description                                                                                                                                 |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                | Yes      | Human-readable request name.                                                                                                                |
| `method`              | Yes      | One of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`.                                                                       |
| `url`                 | Yes      | An `http` or `https` URL.                                                                                                                   |
| `params`              | No       | Array of query parameters with `name`, `value`, and `enabled` fields. Disabled params stay in the editor but are omitted from the sent URL. |
| `headerState`         | No       | Array of headers with `name`, `value`, and `enabled` fields. Disabled headers stay in the editor but are omitted when sending the request.  |
| `headers`             | Legacy   | Supported for older files; converted to enabled `headerState` rows when `headerState` is absent.                                            |
| `body`                | No       | Any JSON value. Use `null` when the request does not need a body.                                                                           |
| `description`         | No       | Plain-text notes shown beneath the request title.                                                                                           |
| `authorization`       | No       | OAuth configuration; see below.                                                                                                             |
| `environment`         | No       | Nearest or manual environment selection; see below.                                                                                         |
| `authorizeBeforeSend` | No       | Retrieve an OAuth token before each send; defaults to false.                                                                                |

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

## OAuth 2.0

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
refreshed automatically. **Authorization Code** opens your browser for login,
receives the VS Code callback, and exchanges the returned code for an access token.

For Authorization Code, configure **Authorization URL**, **Access Token URL**,
**Client ID**, **Scope**, and **Client Authentication** (None, HTTP Basic, or
credentials in the body). Client Secret is shown when authentication is selected. For **Send credentials in body**, Client Secret is optional; when empty, the token request includes Client ID and omits `client_secret`. HTTP Basic client authentication still requires a secret. Switching authentication
to **None** clears the saved client secret. Editable OAuth text fields accept
`{{VARIABLE_NAME}}` references and show the same variable highlighting and
hover previews as other request fields. References are saved as entered; both
grant types resolve them from the selected environment before retrieval. The
generated Redirect URL remains read-only.
**Use PKCE** defaults to enabled with S256. **State** is editable and saved with the request. Click **Generate** (wand icon)
to replace it with a fresh cryptographically random value. By default, the State field is generated only
when you click **Generate**; an empty field stays empty. Enable the global setting
`restcraft.autoGenerateAuthorizationCodeState` to generate State when selecting
the Authorization Code grant type if the field is empty. Switching grant types
preserves existing State values, including saved values and environment references. This setting defaults to off and
does not replace saved State values when reopening requests or opening the tab.

The generated **Redirect URL** is read-only and has a **Copy** button. Register
that exact value with your OAuth provider. The Authorization tab, the authorize
request, and the token request all use the same string.

On the desktop app, including Remote SSH, WSL, Dev Containers, and Codespaces
opened in the desktop app, the redirect URI does not change between windows or
reloads. Register one URI per product you use. Many providers allow several
redirect URIs on the same client. If you previously registered a URL ending in
`?windowId=...`, replace it. Those older values no longer match.

| Product           | Redirect URI                                              |
| ----------------- | --------------------------------------------------------- |
| VS Code Stable    | `vscode://nickchecan.restcraft/oauth/callback`            |
| VS Code Insiders  | `vscode-insiders://nickchecan.restcraft/oauth/callback`   |
| VSCodium          | `vscodium://nickchecan.restcraft/oauth/callback`          |
| VSCodium Insiders | `vscodium-insiders://nickchecan.restcraft/oauth/callback` |

Other forks use their own scheme, from `vscode.env.uriScheme`. Copy the value
shown in the Authorization tab for the product you are running.

Several windows can stay open. The browser callback opens in the window that
was focused last, and the window that started sign-in finishes the token
exchange. The first time a window opens the callback, VS Code may ask **Allow
extension to open this URI?** Choose Open, and tick **Do not ask me again for
this extension**. That choice is stored per profile. To allow it in every
profile, add
`nickchecan.restcraft` to the user setting
`extensions.confirmedUriHandlerExtensionIds`.

On the web (vscode.dev, or a Codespace in the browser), the redirect URL changes
per request and cannot be pre-registered as one fixed value. The Authorization
tab says so. Copy the URL shown for the attempt you are about to start.

On Linux without a keyring, VS Code keeps secrets in memory for that window
only. Sign-in in the same window still works. A callback that arrives in a
different window cannot be handed back, and the attempt times out after five
minutes. The timeout tells you to return to the window that started sign-in, or
to focus it before approving in the browser. A system keyring, or launching
VS Code with `--password-store=basic`, restores the cross-window handoff.

Click **Get new access token**, finish login/consent in your browser, and allow
it to open VS Code when prompted. RestCraft displays the returned token and
honors **Update header** and **Save token to .env**. **Cancel** immediately stops the attempt and ignores late browser callbacks.
You can retry immediately with the same State field;
waiting for browser authorization times out after five minutes. The token
exchange uses the extension's request timeout. Codes and PKCE verifiers stay in
memory and are discarded when the attempt ends.

With PKCE enabled, the State field may be empty. Each attempt adds a unique
internal identifier to the OAuth state sent to the provider. This identifier
is never saved and does not change the State field; it prevents late callbacks
from cancelled attempts matching a retry.
When PKCE is disabled, enter State or click **Generate** before retrieval. State
accepts URL-safe letters, numbers, dots, underscores, tildes, and hyphens.
Simultaneous attempts can use the same State field, including an empty field. Token requests support no client authentication,
HTTP Basic, and credentials in the request body. Only HTTPS authorization and
token endpoints are supported. Refresh tokens and automatic renewal are not
implemented.

The optional authorization properties `authorizationUrl` (string),
`clientAuthentication` (`none`, `basic`, or `body`), `state` (string), and `usePkce` (boolean) are
saved with the request. Older files default to no client authentication and PKCE
enabled. Redirect URLs and PKCE verifiers are not persisted.

## Authorize before sending

In the request's **Settings** tab, enable **Authorize before sending** to retrieve
an OAuth 2.0 access token whenever you click **Send**. The option defaults to off
and is saved as optional `authorizeBeforeSend: true` in the request file.
It applies to both Client Credentials and Authorization Code; other authentication
types send normally. Authorization Code opens browser login before the request.

The API request sends only after authorization succeeds. Failed or cancelled
authorization prevents sending. The Send button acts as Cancel while waiting;
you can also cancel from the Authorization tab. The existing **Update header**
and **Save token to .env** choices apply to the retrieved token. If Update header
is unchecked, the existing Authorization header is retained when sending.

## Request settings

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

## Header storage and older requests

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

## Request description

An optional plain-text description appears beneath the request title. It stays
collapsed to one line; hover over the note or focus its controls to reveal the
pencil and **Show more / Show less**. Short notes do not need an expand control.
Empty requests show a subtle **Add description…** action.

Click the note or pencil to edit. Click away or press Enter to finish. Press Shift+Enter to insert a new line.
The text is saved in the optional `description` string in `.api.json`, preserving
line breaks. Clearing it removes the property. Descriptions are not sent to the
API and environment references are treated as plain text.

```json
"description": "Retrieves a demo access token.\nUse before calling the protected API."
```
