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
  "headers": {
    "Authorization": "Bearer {{API_TOKEN}}",
    "Accept": "application/json",
    "X-Debug": "1"
  },
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
| `headers` | No | JSON object where each header value is a string. |
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
  "headers": {
    "Authorization": "Bearer {{API_TOKEN}}",
    "Content-Type": "application/json"
  },
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
