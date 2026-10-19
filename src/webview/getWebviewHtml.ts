import * as vscode from 'vscode';
import { workbenchMarkup } from './workbenchMarkup';
import { workbenchScript } from './workbenchScript';
import { workbenchStyles } from './workbenchStyles';

/**
 * Assembles the API Workbench document.
 *
 * The nonce and Content Security Policy stay on this render so the inline script cannot be reused.
 */
export function getWebviewHtml(webview: vscode.Webview, extensionVersion: string): string {
	const nonce = getNonce();
	const cspSource = webview.cspSource;
	const escapedExtensionVersion = escapeHtmlContent(extensionVersion);

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<title>API Workbench</title>
	<style>${workbenchStyles}</style>
</head>
<body>${workbenchMarkup(escapedExtensionVersion)}<script nonce="${nonce}">${workbenchScript()}</script>
</body>
</html>`;
}

/**
 * Creates a per-render nonce for the inline webview script.
 */
function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return text;
}

/**
 * Escapes text embedded into HTML content nodes.
 */
function escapeHtmlContent(content: string): string {
	return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
