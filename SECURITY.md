# Security policy

## Supported versions

Security fixes target the latest published RestCraft release. Older releases do not
receive separate security backports. Update through the Visual Studio Code
Marketplace before checking whether an issue still occurs.

## Report a vulnerability

Please report suspected vulnerabilities privately using GitHub's
[Report a vulnerability form](https://github.com/nickchecan/restcraft/security/advisories/new).
Private vulnerability reporting is enabled for this repository. Do not open a public
issue containing exploit details, credentials, tokens, or private request data.

Include the following when possible:

- RestCraft and VS Code versions, operating system, and whether the workspace is
  local, remote, or running in a container.
- A description of the issue, its potential impact, and any required conditions.
- Minimal reproduction steps and a sanitized `.api.json` file or proof of concept.
- For dependency findings, the advisory URL, affected package and version, and the
  dependency path from `npm ls` or `npm audit`.

Use placeholder credentials and endpoints you control. Redact secrets from request
files, environment files, screenshots, responses, and logs. Never include a real
access token, client secret, authorization code, or PKCE verifier.

Maintainers will assess reports and coordinate fixes and disclosure through the
private report. Response and remediation times depend on availability and severity;
this project does not offer a guaranteed response time or a bug bounty. Please keep
vulnerability details private while a fix and disclosure are coordinated.

Use [public issues](https://github.com/nickchecan/restcraft/issues) for ordinary bugs
and feature requests that do not expose a security vulnerability.

## Security boundaries

RestCraft executes user-triggered HTTP requests from the VS Code extension host.
Reports involving the following areas are especially relevant:

- Bypassing Workspace Trust restrictions on request execution, environment reads,
  or OAuth operations.
- Unvalidated webview messages, script injection, or unintended file access.
- Credentials leaking into generated HTML, diagnostics, unrelated requests, or
  files other than the selected storage destination.
- OAuth callback correlation, cancellation, state validation, or PKCE handling.
- Requests or OAuth operations occurring without the user's intended action.

Request definitions and API responses can contain sensitive data. Only trust
workspaces and request files you have reviewed. Use HTTPS for credentials and API
traffic. Keep `.env` files containing secrets out of version control.

Request files are plain text. If you choose to save a token directly in an
Authorization header or enter a literal client secret, it can be saved in the
`.api.json` file. Tokens saved to `.env` are also plain text. Environment hover
previews and token output can reveal values on screen; adjust RestCraft's settings
when sharing your screen. Decoding a JWT does not verify its signature or claims.

## Dependency findings

Dependabot and CodeQL help identify potential issues; their presence does not
guarantee the absence of vulnerabilities. Reports about development and release
tooling are welcome as well as findings affecting the shipped extension.

A dependency advisory does not by itself establish that the extension is exploitable.
Include the affected dependency path and how the vulnerable behavior can be reached
when known. Some transitive or bundled dependency fixes require an upstream release.
See the [development guide](docs/development.md#dependency-security-limitations) for
known tooling constraints and how to inspect them.
