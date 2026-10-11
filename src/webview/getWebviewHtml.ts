import * as vscode from 'vscode';

/**
 * Generates the complete API Workbench webview document.
 *
 * The UI is intentionally bundled into this string today because the extension
 * has no separate frontend build pipeline. Keep the nonce and CSP aligned with
 * VS Code webview security requirements whenever scripts or resources change.
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
	<style>
		:root {
			color-scheme: light dark;
		}

		html,
		body {
			min-height: 100%;
			overflow-x: hidden;
			overflow-y: auto;
		}

		body {
			box-sizing: border-box;
			min-height: 100vh;
			margin: 0;
			padding: 20px 20px 72px;
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
		}

		.request-title {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			margin: 0 0 12px;
			font-size: 20px;
			font-weight: 600;
			line-height: 1.3;
			color: var(--vscode-editor-foreground);
		}

		.request-title-text {
			cursor: text;
		}

		.request-title-input {
			width: min(520px, 80vw);
			height: auto;
			padding: 0;
			color: var(--vscode-editor-foreground);
			background: transparent;
			border: 0;
			border-bottom: 1px solid var(--vscode-focusBorder);
			font: inherit;
		}

		.request-title-input:focus {
			outline: none;
		}

		.request-title-icon {
			width: 16px;
			height: 16px;
			color: var(--vscode-descriptionForeground);
			opacity: 0;
			transition: opacity 120ms ease;
		}

		.request-title:hover .request-title-icon,
		.request-title:focus-within .request-title-icon {
			opacity: 0.65;
		}

		.section-divider {
			display: flex;
			align-items: center;
			gap: 12px;
			margin: 18px 0 12px;
			color: var(--vscode-descriptionForeground);
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0;
			line-height: 1;
			text-transform: uppercase;
		}

		.section-divider::after {
			content: "";
			flex: 1;
			height: 1px;
			background: var(--vscode-panel-border);
		}

		.section-divider:first-of-type {
			margin-top: 0;
		}

		.request-bar {
			display: grid;
			grid-template-columns: minmax(110px, 140px) minmax(180px, 1fr) auto;
			gap: 8px;
			align-items: center;
		}

		select,
		input,
		button {
			height: 32px;
			box-sizing: border-box;
			font: inherit;
		}

		select,
		input {
			width: 100%;
			color: var(--vscode-input-foreground);
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			padding: 0 8px;
		}

		.variable-input-wrapper {
			display: block;
			position: relative;
			width: 100%;
		}

		.authorization-field .variable-input-wrapper {
			max-width: 420px;
		}

		.variable-highlight-overlay {
			display: none;
			position: absolute;
			inset: 0;
			box-sizing: border-box;
			padding: 0 8px;
			align-items: center;
			overflow: hidden;
			white-space: pre;
			color: var(--vscode-input-foreground);
			background: transparent;
			border: 1px solid transparent;
			font: inherit;
			pointer-events: none;
		}

		.variable-input-wrapper.has-secret-reference .variable-highlight-overlay {
			display: flex;
		}

		.variable-input-wrapper.has-secret-reference input {
			color: transparent;
			caret-color: var(--vscode-input-foreground);
			background: var(--vscode-input-background);
		}

		button {
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
			border: 0;
			padding: 0 14px;
			cursor: pointer;
		}

		button:hover {
			background: var(--vscode-button-hoverBackground);
		}

		button.request-cancel {
			color: var(--vscode-inputValidation-errorForeground, #fff);
			background: var(--vscode-inputValidation-errorBackground, #a1260d);
		}

		button.request-cancel:hover {
			background: var(--vscode-inputValidation-errorBorder, #c72e0f);
		}

			button:disabled {
				opacity: 0.7;
				cursor: wait;
			}

			.request-panel {
				margin-top: 16px;
				border: 1px solid var(--vscode-panel-border);
				background: var(--vscode-editor-inactiveSelectionBackground);
			}

			.request-tabs {
				display: flex;
				background: var(--vscode-sideBarSectionHeader-background);
				border-bottom: 1px solid var(--vscode-panel-border);
			}

			.request-tab {
				height: 34px;
				color: var(--vscode-editor-foreground);
				background: transparent;
				border: 0;
				border-right: 1px solid var(--vscode-panel-border);
				padding: 0 14px;
				cursor: pointer;
			}

			.request-tab:hover {
				background: var(--vscode-list-hoverBackground);
			}

			.request-tab.active {
				background: var(--vscode-editor-inactiveSelectionBackground);
				box-shadow: inset 0 -2px 0 var(--vscode-focusBorder);
			}

			.request-panel-content {
				padding: 12px;
			}

			.request-headers-table {
				width: 100%;
				border-collapse: collapse;
			}

			.request-headers-table th {
				padding: 0 8px 8px 0;
				text-align: left;
				font-weight: 600;
				color: var(--vscode-descriptionForeground);
			}

			.request-headers-table td {
				padding: 0 8px 8px 0;
			}

			.request-headers-table .request-header-enabled-cell {
				width: 1%;
				vertical-align: middle;
			}

			.request-headers-table td:last-child,
			.request-headers-table th:last-child {
				width: 1%;
				padding-right: 0;
			}

			.request-header-enabled {
				width: 16px;
				height: 16px;
				margin: 0;
				vertical-align: middle;
			}

			.request-header-disabled .request-header-input {
				opacity: 0.65;
			}

			.request-header-input {
				width: 100%;
				min-width: 0;
			}

			.request-header-remove {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 32px;
				padding: 0;
			}

			.request-header-remove svg {
				width: 16px;
				height: 16px;
				pointer-events: none;
			}

			.request-header-add {
				margin-top: 4px;
			}

			.request-body-toolbar {
				display: flex;
				align-items: center;
				gap: 8px;
				margin-bottom: 8px;
				color: var(--vscode-descriptionForeground);
			}

			.authorization-field {
				display: grid;
				grid-template-columns: minmax(120px, 180px) minmax(180px, 320px);
				gap: 8px;
				align-items: center;
			}

			.authorization-field label {
				font-weight: 600;
				color: var(--vscode-descriptionForeground);
			}

			.authorization-input {
				max-width: 420px;
			}

			.secret-reference {
				color: var(--vscode-charts-yellow, var(--vscode-editorWarning-foreground, var(--vscode-editor-foreground)));
				background: transparent;
			}

			.secret-reference.is-missing,
			.environment-variable-tooltip.is-missing {
				color: var(--vscode-errorForeground, var(--vscode-editorError-foreground, #f14c4c));
			}

			.authorization-divider {
				grid-column: 1 / -1;
				height: 1px;
				margin: 4px 0;
				background: var(--vscode-panel-border);
			}

			.request-body-type-label {
				font-weight: 600;
			}

			.request-body-type {
				width: auto;
				min-width: 180px;
			}

			.request-body-toolbar-spacer {
				flex: 1;
			}

			.request-body-beautify {
				height: 28px;
			}

			.request-body-editor {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr);
				position: relative;
				--hover-line-height: 0px;
				--hover-line-top: 0px;
				background: var(--vscode-editor-background);
			}

			.request-body-editor.line-hover::before,
			.response-body-content.line-hover::before {
				content: "";
				position: absolute;
				top: var(--hover-line-top);
				left: 0;
				right: 0;
				height: var(--hover-line-height);
				background: var(--vscode-editor-lineHighlightBackground, var(--vscode-list-hoverBackground));
				pointer-events: none;
				z-index: 1;
			}

			.request-body-line-numbers {
				margin: 0;
				grid-column: 1;
				grid-row: 1;
				min-width: 44px;
				padding: 12px 8px;
				box-sizing: border-box;
				text-align: right;
				user-select: none;
				white-space: pre-wrap;
				overflow: hidden;
				color: var(--vscode-editorLineNumber-foreground);
				background: var(--vscode-editorGutter-background);
				border-right: 1px solid var(--vscode-panel-border);
				font-family: var(--vscode-editor-font-family);
				font-size: var(--vscode-editor-font-size);
				line-height: 1.45;
				position: relative;
				z-index: 2;
			}

			.request-body-highlight {
				display: block;
				grid-column: 2;
				grid-row: 1;
				margin: 0;
				width: 100%;
				min-height: 140px;
				padding: 12px;
				box-sizing: border-box;
				overflow: hidden;
				white-space: pre-wrap;
				overflow-wrap: anywhere;
				color: var(--vscode-editor-foreground);
				background: transparent;
				border: 0;
				font-family: var(--vscode-editor-font-family);
				font-size: var(--vscode-editor-font-size);
				line-height: 1.45;
				pointer-events: none;
				position: relative;
				z-index: 2;
			}

			.request-body-editor:not(.json-highlight) .request-body-highlight {
				display: none;
			}

			.request-body-editor.variable-highlight .request-body-highlight {
				display: block;
			}

			.json-highlight .request-body-input,
			.variable-highlight .request-body-input {
				color: transparent;
				caret-color: var(--vscode-editor-foreground);
			}

			.json-highlight .request-body-input::placeholder {
				color: var(--vscode-input-placeholderForeground);
			}

			.json-token-key {
				color: var(--vscode-textLink-foreground, var(--vscode-editor-foreground));
			}

			.json-token-string {
				color: var(--vscode-charts-green, var(--vscode-editor-foreground));
			}

			.json-token-number {
				color: var(--vscode-charts-orange, var(--vscode-editor-foreground));
			}

			.json-token-literal {
				color: var(--vscode-charts-purple, var(--vscode-editor-foreground));
			}

			.request-body-input {
				display: block;
				grid-column: 2;
				grid-row: 1;
				width: 100%;
				min-height: 140px;
				padding: 12px;
				box-sizing: border-box;
				resize: vertical;
				color: var(--vscode-editor-foreground);
				background: transparent;
				border: 0;
				font-family: var(--vscode-editor-font-family);
				font-size: var(--vscode-editor-font-size);
				line-height: 1.45;
				position: relative;
				z-index: 2;
			}

			.request-body-input:focus {
				outline: 1px solid var(--vscode-focusBorder);
				outline-offset: -1px;
			}

			.request-body-input:disabled {
				opacity: 0.65;
				cursor: not-allowed;
			}

			.request-body-message {
				margin-top: 8px;
				color: var(--vscode-errorForeground);
			}

			.request-body-form {
				background: transparent;
			}

			.response-divider {
				margin-top: 22px;
			}

			.response-panel {
				margin-top: 12px;
				border: 1px solid var(--vscode-panel-border);
				background: transparent;
			}

			.response-tabs {
				display: flex;
				align-items: center;
				background: var(--vscode-sideBarSectionHeader-background);
				border-bottom: 1px solid var(--vscode-panel-border);
			}

			.response-tab-list {
				display: flex;
			}

			.response-tab {
				height: 34px;
				color: var(--vscode-editor-foreground);
				background: transparent;
				border: 0;
				border-right: 1px solid var(--vscode-panel-border);
				padding: 0 14px;
				cursor: pointer;
			}

			.response-tab:hover {
				background: var(--vscode-list-hoverBackground);
			}

			.response-tab.active {
				background: var(--vscode-editor-background);
				box-shadow: inset 0 -2px 0 var(--vscode-focusBorder);
			}

			.response-status {
				margin-left: auto;
				padding: 0 12px;
				color: var(--vscode-descriptionForeground);
				white-space: nowrap;
			}

			.response-time,
			.response-size {
				font-variant-numeric: tabular-nums;
			}

			.response-time:not(:empty)::after,
			.response-size:not(:empty)::after {
				content: " | ";
				color: var(--vscode-descriptionForeground);
			}

			.response-status-badge {
				display: inline-flex;
				align-items: center;
				min-height: 22px;
				padding: 2px 8px;
				border-radius: 999px;
				box-sizing: border-box;
				font-weight: 600;
				line-height: 1.2;
			}

			.response-status-badge.success {
				color: #ffffff;
				background: #16825d;
			}

			.response-status-badge.error {
				color: #ffffff;
				background: #c73636;
			}

			.response-panel-content {
				min-height: 0;
			}

			.response-content,
			.response-line-numbers {
				margin: 0;
				box-sizing: border-box;
				white-space: pre-wrap;
				font-family: var(--vscode-editor-font-family);
				font-size: var(--vscode-editor-font-size);
				line-height: 1.45;
			}

			.response-content {
				padding: 12px;
				color: var(--vscode-editor-foreground);
			}

			.response-body-content {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr);
				min-height: 160px;
				max-height: max(160px, var(--response-area-max-height, calc(100vh - 320px)));
				overflow: auto;
				position: relative;
				--hover-line-height: 0px;
				--hover-line-top: 0px;
				background: var(--vscode-editor-background);
				cursor: text;
			}

			.response-line-numbers {
				min-width: 44px;
				padding: 12px 8px;
				text-align: right;
				user-select: none;
				color: var(--vscode-editorLineNumber-foreground);
				background: var(--vscode-editorGutter-background);
				border-right: 1px solid var(--vscode-panel-border);
				position: relative;
				z-index: 2;
			}

			.response-body-content .response-content {
				min-width: 0;
				overflow: visible;
				background: transparent;
				cursor: text;
				user-select: text;
				position: relative;
				z-index: 2;
			}

			.response-headers-content {
				min-height: 160px;
				max-height: max(160px, var(--response-area-max-height, calc(100vh - 320px)));
				overflow: auto;
				background: var(--vscode-editor-inactiveSelectionBackground);
			}

			.response-header-name {
				color: var(--vscode-symbolIcon-propertyForeground, var(--vscode-textLink-foreground));
				font-weight: 600;
			}

			#preview-panel {
				min-height: 0;
			}

			.response-preview {
				display: block;
				width: 100%;
				min-height: 160px;
				height: max(160px, var(--response-area-max-height, max(360px, calc(100vh - 260px))));
				max-height: max(160px, var(--response-area-max-height, max(360px, calc(100vh - 260px))));
				border: 0;
				background: #ffffff;
			}

			#response-preview-empty {
				min-height: 160px;
				max-height: max(160px, var(--response-area-max-height, 360px));
				overflow: auto;
			}

			.editor-footer {
				display: flex;
				align-items: center;
				gap: 16px;
				position: fixed;
				right: 0;
				bottom: 0;
				left: 0;
				z-index: 10;
				box-sizing: border-box;
				padding: 8px 20px;
				color: var(--vscode-descriptionForeground);
				background: var(--vscode-editor-background);
				border-top: 1px solid var(--vscode-panel-border);
				font-size: 12px;
				line-height: 1.4;
			}

			.editor-footer-brand {
				margin-left: auto;
				color: var(--vscode-editor-foreground);
				font-weight: 600;
			}

			.editor-footer-icon {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 24px;
				height: 24px;
				flex: 0 0 auto;
				padding: 0;
				color: var(--vscode-editor-foreground);
				background: transparent;
				border: 0;
				border-radius: 4px;
				cursor: pointer;
			}

			.editor-footer-icon:hover,
			.editor-footer-icon:focus {
				background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
			}

			.editor-footer-icon:focus {
				outline: 1px solid var(--vscode-focusBorder);
				outline-offset: 2px;
			}

			.editor-footer-icon svg {
				width: 16px;
				height: 16px;
				pointer-events: none;
			}

			.editor-footer-version {
				display: inline-flex;
				align-items: center;
				min-height: 20px;
				padding: 2px 8px;
				color: var(--vscode-descriptionForeground);
				background: var(--vscode-editor-inactiveSelectionBackground);
				border: 1px solid var(--vscode-panel-border);
				border-radius: 999px;
				box-sizing: border-box;
				font-size: 11px;
				font-weight: 600;
			}

			.environment-variable-tooltip {
				position: fixed;
				z-index: 20;
				max-width: min(480px, calc(100vw - 24px));
				padding: 6px 9px;
				color: var(--vscode-editorWidget-foreground, var(--vscode-editor-foreground));
				background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
				border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
				border-radius: 4px;
				box-shadow: 0 2px 8px var(--vscode-widget-shadow);
				font: 12px/1.4 var(--vscode-font-family);
				white-space: pre-wrap;
				overflow-wrap: anywhere;
				pointer-events: none;
			}

			.hidden {
				display: none;
			}

		.sr-only {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border: 0;
		}

		@media (max-width: 640px) {
			.request-bar {
				grid-template-columns: 1fr;
			}

			.editor-footer {
				align-items: flex-start;
				gap: 8px;
			}
		}
	</style>
</head>
<body>
	<h1 class="request-title" id="request-title-container">
		<span class="request-title-text" id="request-title">RestCraft Request</span>
		<input class="request-title-input hidden" id="request-title-input" aria-label="Request title">
		<svg class="request-title-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M12 20h9"></path>
			<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
		</svg>
	</h1>
	<div class="section-divider">Request</div>
	<form class="request-bar" id="request-form">
		<label>
			<span class="sr-only">HTTP method</span>
			<select id="method" name="method" aria-label="HTTP method">
				<option value="GET">GET</option>
				<option value="POST">POST</option>
				<option value="PUT">PUT</option>
				<option value="PATCH">PATCH</option>
				<option value="DELETE">DELETE</option>
				<option value="HEAD">HEAD</option>
				<option value="OPTIONS">OPTIONS</option>
			</select>
		</label>
		<label>
			<span class="sr-only">Request URL</span>
			<input id="url" name="url" type="text" placeholder="https://api.example.com/resource" aria-label="Request URL">
		</label>
		<button id="send" type="submit" disabled title="Checking workspace trust...">Send</button>
		</form>
		<section class="request-panel" aria-label="Request configuration area">
			<div class="request-tabs" role="tablist" aria-label="Request sections">
				<button class="request-tab active" id="request-params-tab" type="button" role="tab" aria-selected="true" aria-controls="request-params-panel">Params</button>
				<button class="request-tab" id="request-authorization-tab" type="button" role="tab" aria-selected="false" aria-controls="request-authorization-panel">Authorization</button>
				<button class="request-tab" id="request-headers-tab" type="button" role="tab" aria-selected="false" aria-controls="request-headers-panel">Headers</button>
				<button class="request-tab" id="request-body-tab" type="button" role="tab" aria-selected="false" aria-controls="request-body-panel">Body</button>
			</div>
			<div class="request-panel-content" id="request-params-panel" role="tabpanel" aria-labelledby="request-params-tab">
				<table class="request-headers-table" aria-label="Request query parameters">
					<thead>
						<tr>
							<th scope="col"><span class="sr-only">Enabled</span></th>
							<th scope="col">Key</th>
							<th scope="col">Value</th>
							<th scope="col"><span class="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody id="request-params-table"></tbody>
				</table>
				<button class="request-header-add" id="add-request-param" type="button">Add Param</button>
			</div>
			<div class="request-panel-content hidden" id="request-authorization-panel" role="tabpanel" aria-labelledby="request-authorization-tab">
				<div class="authorization-field">
					<label for="authorization-type">Type</label>
					<select id="authorization-type" name="authorization-type">
						<option value="none" selected>None</option>
						<option value="bearer">Bearer Token</option>
						<option value="basic">Basic Auth</option>
						<option value="oauth2">OAuth 2.0</option>
					</select>
					<div class="authorization-divider" role="separator" aria-hidden="true"></div>
					<label class="oauth-authorization-field hidden" for="oauth-grant-type">Grant Type</label>
					<select class="oauth-authorization-field hidden" id="oauth-grant-type">
						<option value="client_credentials">Client Credentials</option>
						<option value="authorization_code">Authorization Code</option>
					</select>
					<label class="oauth-client-field hidden" for="oauth-url">Access Token URL</label>
					<input class="authorization-input oauth-client-field hidden" id="oauth-url" type="text" autocomplete="off">
					<label class="oauth-client-field hidden" for="oauth-client-id">Client ID</label>
					<input class="authorization-input oauth-client-field hidden" id="oauth-client-id" type="text" autocomplete="off">
					<label class="oauth-client-field hidden" for="oauth-client-secret">Client Secret</label>
					<input class="authorization-input oauth-client-field hidden" id="oauth-client-secret" type="password" autocomplete="off">
					<label class="oauth-client-field hidden" for="oauth-scope">Scope</label>
					<input class="authorization-input oauth-client-field hidden" id="oauth-scope" type="text" autocomplete="off">
					<button class="oauth-client-field hidden" id="oauth-get-token" type="button">Get new access token</button>
					<span class="oauth-client-field hidden" id="oauth-status" role="status" aria-live="polite"></span>
					<label class="bearer-authorization-field hidden" for="bearer-token">Token</label>
					<input class="authorization-input bearer-authorization-field hidden" id="bearer-token" name="bearer-token" type="text" autocomplete="off">
					<label class="basic-authorization-field hidden" for="basic-auth-username">Username</label>
					<input class="authorization-input basic-authorization-field hidden" id="basic-auth-username" name="basic-auth-username" type="text" autocomplete="off">
					<label class="basic-authorization-field hidden" for="basic-auth-password">Password</label>
					<input class="authorization-input basic-authorization-field hidden" id="basic-auth-password" name="basic-auth-password" type="text" autocomplete="off">
				</div>
			</div>
			<div class="request-panel-content hidden" id="request-headers-panel" role="tabpanel" aria-labelledby="request-headers-tab">
				<table class="request-headers-table" aria-label="Request headers">
					<thead>
						<tr>
							<th scope="col"><span class="sr-only">Enabled</span></th>
							<th scope="col">Key</th>
							<th scope="col">Value</th>
							<th scope="col"><span class="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody id="request-headers-table"></tbody>
				</table>
				<button class="request-header-add" id="add-request-header" type="button">Add Header</button>
			</div>
			<div class="request-panel-content hidden" id="request-body-panel" role="tabpanel" aria-labelledby="request-body-tab">
				<div class="request-body-toolbar">
					<label class="request-body-type-label" for="request-body-type">Type</label>
					<select class="request-body-type" id="request-body-type">
						<option value="none">None</option>
						<option value="raw" selected>Raw</option>
						<option value="json">JSON</option>
						<option value="text">Text</option>
						<option value="xml">XML</option>
						<option value="html">HTML</option>
						<option value="form">Form URL Encoded</option>
					</select>
					<span class="request-body-toolbar-spacer"></span>
					<button class="request-body-beautify hidden" id="request-body-beautify" type="button">Beautify</button>
				</div>
				<div class="request-body-editor" id="request-body-editor">
					<pre class="request-body-line-numbers" id="request-body-lines" aria-hidden="true">1</pre>
					<pre class="request-body-highlight" id="request-body-highlight" aria-hidden="true"></pre>
					<textarea class="request-body-input" id="request-body" spellcheck="false" placeholder="{&#10;  &quot;example&quot;: true&#10;}"></textarea>
				</div>
				<div class="request-body-message hidden" id="request-body-message" aria-live="polite"></div>
				<div class="request-body-form hidden" id="request-body-form">
					<table class="request-headers-table" aria-label="Request form URL encoded body">
						<thead>
							<tr>
								<th scope="col">Key</th>
								<th scope="col">Value</th>
								<th scope="col"><span class="sr-only">Actions</span></th>
							</tr>
						</thead>
						<tbody id="request-body-form-table"></tbody>
					</table>
					<button class="request-header-add" id="add-request-body-form-row" type="button">Add Pair</button>
				</div>
			</div>
		</section>
		<div class="section-divider response-divider">Response</div>
		<section class="response-panel" aria-label="Response area">
			<div class="response-tabs">
				<div class="response-tab-list" role="tablist" aria-label="Response sections">
					<button class="response-tab active" id="body-tab" type="button" role="tab" aria-selected="true" aria-controls="body-panel">Body</button>
					<button class="response-tab" id="headers-tab" type="button" role="tab" aria-selected="false" aria-controls="headers-panel">Headers</button>
					<button class="response-tab" id="raw-tab" type="button" role="tab" aria-selected="false" aria-controls="raw-panel">Raw</button>
					<button class="response-tab" id="preview-tab" type="button" role="tab" aria-selected="false" aria-controls="preview-panel">Preview</button>
				</div>
				<div class="response-status" aria-live="polite">
					<span class="response-time" id="response-time"></span><span class="response-size" id="response-size"></span><span id="response-status" class="response-status-text">No response yet.</span>
				</div>
			</div>
			<div class="response-panel-content" id="body-panel" role="tabpanel" aria-labelledby="body-tab">
				<div class="response-body-content" id="response-body-content">
					<pre class="response-line-numbers" id="response-body-lines" aria-hidden="true">1</pre>
					<pre class="response-content" id="response-body">(empty)</pre>
				</div>
			</div>
			<div class="response-panel-content hidden" id="headers-panel" role="tabpanel" aria-labelledby="headers-tab">
				<pre class="response-content response-headers-content" id="response-headers">(none)</pre>
			</div>
			<div class="response-panel-content hidden" id="raw-panel" role="tabpanel" aria-labelledby="raw-tab">
				<div class="response-body-content" id="response-raw-content">
					<pre class="response-line-numbers" id="response-raw-lines" aria-hidden="true">1</pre>
					<pre class="response-content" id="response-raw">(empty)</pre>
				</div>
			</div>
			<div class="response-panel-content hidden" id="preview-panel" role="tabpanel" aria-labelledby="preview-tab">
				<iframe class="response-preview hidden" id="response-preview" sandbox="" title="HTML response preview"></iframe>
				<pre class="response-content" id="response-preview-empty">HTML preview is available for HTML responses.</pre>
			</div>
		</section>
		<div class="environment-variable-tooltip hidden" id="environment-variable-tooltip" role="tooltip"></div>
		<footer class="editor-footer" aria-label="Editor summary">
			<button class="editor-footer-icon" id="footer-settings-button" type="button" aria-label="Settings" title="Settings">
				<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 2.75v2.1m0 14.3v2.1m9.25-9.25h-2.1m-14.3 0h-2.1m15.79-6.54-1.49 1.49M6.95 17.05l-1.49 1.49m13.08 0-1.49-1.49M6.95 6.95 5.46 5.46"></path>
					<circle cx="12" cy="12" r="7.25"></circle>
					<circle cx="12" cy="12" r="2.75"></circle>
				</svg>
			</button>
			<button class="editor-footer-icon" id="footer-repository-link" type="button" aria-label="Open RestCraft repository" title="Open RestCraft repository">
				<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
					<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.6 7.6 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path>
				</svg>
			</button>
			<button class="editor-footer-icon" id="footer-issues-link" type="button" aria-label="Open RestCraft issues" title="Open RestCraft issues">
				<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="m8 2 1.88 1.88"></path>
					<path d="M14.12 3.88 16 2"></path>
					<path d="M9 7.13v-1a3 3 0 0 1 6 0v1"></path>
					<path d="M12 20c-3.3 0-6-2.7-6-6v-3a6 6 0 0 1 12 0v3c0 3.3-2.7 6-6 6Z"></path>
					<path d="M4 13H2"></path>
					<path d="M22 13h-2"></path>
					<path d="M4.5 8.5 3 7"></path>
					<path d="m21 7-1.5 1.5"></path>
					<path d="M12 20v-9"></path>
					<path d="M8 11h8"></path>
				</svg>
			</button>
			<div class="editor-footer-brand">RestCraft</div>
			<span class="editor-footer-version" aria-label="RestCraft version">v${escapedExtensionVersion}</span>
		</footer>

	<script nonce="${nonce}">
			const vscode = acquireVsCodeApi();
			const form = document.getElementById('request-form');
			const requestTitleContainer = document.getElementById('request-title-container');
			const requestTitle = document.getElementById('request-title');
			const requestTitleInput = document.getElementById('request-title-input');
				const method = document.getElementById('method');
				const url = document.getElementById('url');
				const send = document.getElementById('send');
				let activeRequestId = 0;
				let requestInProgress = false;
			const environmentVariableTooltip = document.getElementById('environment-variable-tooltip');
				const requestParamsTab = document.getElementById('request-params-tab');
				const requestAuthorizationTab = document.getElementById('request-authorization-tab');
				const requestHeadersTab = document.getElementById('request-headers-tab');
				const requestBodyTab = document.getElementById('request-body-tab');
				const requestParamsPanel = document.getElementById('request-params-panel');
				const requestAuthorizationPanel = document.getElementById('request-authorization-panel');
				const requestHeadersPanel = document.getElementById('request-headers-panel');
				const requestBodyPanel = document.getElementById('request-body-panel');
				const authorizationType = document.getElementById('authorization-type');
                const oauthGrantType = document.getElementById('oauth-grant-type');
                const oauthGetToken = document.getElementById('oauth-get-token');
                const oauthStatus = document.getElementById('oauth-status');
                let oauthToken = '';
                let oauthRequestId = 0;
                let oauthPending = false;
                oauthGrantType.addEventListener('change', () => {
                    oauthToken = '';
                    oauthStatus.textContent = '';
                    oauthRequestId++;
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    applyAuthorizationType();
                    syncAuthorizationHeader();
                    notifyRequestChanged();
                });
                ['oauth-url', 'oauth-client-id', 'oauth-client-secret', 'oauth-scope'].forEach((id) => {
                    document.getElementById(id).addEventListener('input', () => {
                        oauthRequestId++;
                        oauthPending = false;
                        oauthGetToken.disabled = false;
                        oauthToken = '';
                        oauthStatus.textContent = '';
                        if (authorizationType.value === 'oauth2') {
                            syncAuthorizationHeader();
                        }
                        notifyRequestChanged();
                    });
                });
                oauthGetToken.addEventListener('click', () => {
                    if (oauthPending || authorizationType.value !== 'oauth2' || oauthGrantType.value !== 'client_credentials') { return; }
                    oauthPending = true;
                    oauthGetToken.disabled = true;
                    oauthStatus.textContent = 'Getting access token…';
                    vscode.postMessage({
                        type: 'getOAuthToken', requestId: ++oauthRequestId,
                        url: document.getElementById('oauth-url').value,
                        clientId: document.getElementById('oauth-client-id').value,
                        clientSecret: document.getElementById('oauth-client-secret').value,
                        scope: document.getElementById('oauth-scope').value,
                    });
                });

				const bearerToken = document.getElementById('bearer-token');
				const bearerAuthorizationFields = Array.from(document.querySelectorAll('.bearer-authorization-field'));
				const basicAuthUsername = document.getElementById('basic-auth-username');
				const basicAuthPassword = document.getElementById('basic-auth-password');
				const basicAuthorizationFields = Array.from(document.querySelectorAll('.basic-authorization-field'));
				const requestParamsTable = document.getElementById('request-params-table');
				const requestHeadersTable = document.getElementById('request-headers-table');
				const addRequestParam = document.getElementById('add-request-param');
				const addRequestHeader = document.getElementById('add-request-header');
				const requestBodyEditor = document.getElementById('request-body-editor');
				const requestBodyForm = document.getElementById('request-body-form');
				const requestBodyFormTable = document.getElementById('request-body-form-table');
				const addRequestBodyFormRow = document.getElementById('add-request-body-form-row');
				const requestBodyType = document.getElementById('request-body-type');
				const requestBodyBeautify = document.getElementById('request-body-beautify');
				const requestBodyMessage = document.getElementById('request-body-message');
				const requestBodyHighlight = document.getElementById('request-body-highlight');
				const requestBodyLines = document.getElementById('request-body-lines');
				const requestBody = document.getElementById('request-body');
				const bodyTab = document.getElementById('body-tab');
				const headersTab = document.getElementById('headers-tab');
				const rawTab = document.getElementById('raw-tab');
				const previewTab = document.getElementById('preview-tab');
			const bodyPanel = document.getElementById('body-panel');
			const headersPanel = document.getElementById('headers-panel');
			const rawPanel = document.getElementById('raw-panel');
			const previewPanel = document.getElementById('preview-panel');
			const responseStatus = document.getElementById('response-status');
			const responseTime = document.getElementById('response-time');
			const responseSize = document.getElementById('response-size');
			const responseHeaders = document.getElementById('response-headers');
			const responseRawContent = document.getElementById('response-raw-content');
			const responseRawLines = document.getElementById('response-raw-lines');
			const responseRaw = document.getElementById('response-raw');
			const responsePreview = document.getElementById('response-preview');
			const responsePreviewEmpty = document.getElementById('response-preview-empty');
			const footerRepositoryLink = document.getElementById('footer-repository-link');
			const footerIssuesLink = document.getElementById('footer-issues-link');
			const footerSettingsButton = document.getElementById('footer-settings-button');
			const editorFooter = document.querySelector('.editor-footer');
				const responseBodyContent = document.getElementById('response-body-content');
				const responseBodyLines = document.getElementById('response-body-lines');
				const responseBody = document.getElementById('response-body');
				let requestStartedAt = 0;
				let requestTimer = undefined;
				let latestRequestUrl = '';
				let hoveredEnvironmentVariable = '';
				let environmentVariableRequestId = 0;
				let environmentCheckRequestId = 0;
				let environmentCheckTimer;
				let environmentCheckNames = [];
				let environmentValueTooltipEnabled = false;
				let workspaceTrusted = false;
				const missingEnvironmentVariables = new Set();
				let textMeasureContext;
				let activeAuthorizationType = 'none';
				let activeRequestBodyType = 'raw';
				renderRequestParamsFromUrl();
				renderRequestHeaders({});
				updateResponseAreaBounds();
				window.addEventListener('resize', updateResponseAreaBounds);

				document.addEventListener('pointermove', showHoveredEnvironmentVariable);
				document.addEventListener('input', scheduleEnvironmentVariableCheck);
				window.addEventListener('blur', clearHoveredEnvironmentVariable);
				window.addEventListener('pointerleave', clearHoveredEnvironmentVariable);

				footerRepositoryLink.addEventListener('click', () => {
					vscode.postMessage({
						type: 'openRepository',
					});
				});

				footerIssuesLink.addEventListener('click', () => {
					vscode.postMessage({
						type: 'openIssues',
					});
				});

				footerSettingsButton.addEventListener('click', () => {
					vscode.postMessage({
						type: 'openSettings',
					});
				});

				requestTitleContainer.addEventListener('click', (event) => {
					if (event.target === requestTitleInput) {
						return;
					}

					startTitleEdit();
				});

				requestTitleInput.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						commitTitleEdit();
					}

					if (event.key === 'Escape') {
						event.preventDefault();
						cancelTitleEdit();
					}
				});

				requestTitleInput.addEventListener('blur', () => {
					commitTitleEdit();
				});

				requestParamsTab.addEventListener('click', () => {
					showRequestTab('params');
				});

				requestAuthorizationTab.addEventListener('click', () => {
					showRequestTab('authorization');
				});

				requestHeadersTab.addEventListener('click', () => {
					showRequestTab('headers');
				});

				requestBodyTab.addEventListener('click', () => {
					showRequestTab('body');
				});

				requestBodyType.addEventListener('change', () => {
					clearRequestBodyMessage();
					activeRequestBodyType = requestBodyType.value;
					applyRequestBodyType(requestBodyType.value);
					setRequestBodyContent('');
					renderRequestBodyFormRows('');
					updateResponseAreaBounds();
					notifyRequestChanged();
				});

				authorizationType.addEventListener('change', () => {
                    oauthRequestId++;
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    oauthStatus.textContent = '';
					applyAuthorizationType();
					syncAuthorizationHeader();
					notifyRequestChanged();
				});

				bearerToken.addEventListener('input', () => {
					updateSecretReferenceState(bearerToken);
					syncAuthorizationHeader();
					notifyRequestChanged();
				});

				basicAuthUsername.addEventListener('input', () => {
					updateSecretReferenceState(basicAuthUsername);
					syncAuthorizationHeader();
					notifyRequestChanged();
				});

				basicAuthPassword.addEventListener('input', () => {
					updateSecretReferenceState(basicAuthPassword);
					syncAuthorizationHeader();
					notifyRequestChanged();
				});

				addRequestParam.addEventListener('click', () => {
					addRequestParamRow('', '');
					updateResponseAreaBounds();
				});

				addRequestHeader.addEventListener('click', () => {
					addRequestHeaderRow('', '');
					updateResponseAreaBounds();
				});

				addRequestBodyFormRow.addEventListener('click', () => {
					addBodyFormRow('', '');
					updateResponseAreaBounds();
				});

				requestBodyBeautify.addEventListener('click', () => {
					beautifyJsonRequestBody();
				});

				method.addEventListener('change', () => {
					notifyRequestChanged();
				});

				url.addEventListener('input', () => {
					updateSecretReferenceState(url);
					renderRequestParamsFromUrl();
					notifyRequestChanged();
				});

				requestBody.addEventListener('input', () => {
					clearRequestBodyMessage();
					updateSecretReferenceState(requestBody);
					updateRequestBodyLineNumbers();
					updateRequestBodyHighlight();
					notifyRequestChanged();
				});

				requestBody.addEventListener('scroll', () => {
					requestBodyLines.scrollTop = requestBody.scrollTop;
					requestBodyHighlight.scrollTop = requestBody.scrollTop;
					clearHoverLine(requestBodyEditor);
				});

				requestBody.addEventListener('mousemove', (event) => {
					updateTextareaHoverLine(requestBodyEditor, requestBody, event);
				});

				requestBody.addEventListener('mouseleave', () => {
					clearHoverLine(requestBodyEditor);
				});

			bodyTab.addEventListener('click', () => {
				showResponseTab('body');
			});

			headersTab.addEventListener('click', () => {
				showResponseTab('headers');
			});

			rawTab.addEventListener('click', () => {
				showResponseTab('raw');
			});

			previewTab.addEventListener('click', () => {
				showResponseTab('preview');
			});

				responseBodyContent.addEventListener('mousemove', (event) => {
					updateScrollablePreHoverLine(responseBodyContent, responseBody, event);
				});

				responseBodyContent.addEventListener('mouseleave', () => {
					clearHoverLine(responseBodyContent);
				});

			responseBodyContent.addEventListener('scroll', () => {
				clearHoverLine(responseBodyContent);
			});

				responseRawContent.addEventListener('mousemove', (event) => {
					updateScrollablePreHoverLine(responseRawContent, responseRaw, event);
				});

				responseRawContent.addEventListener('mouseleave', () => {
					clearHoverLine(responseRawContent);
				});

				responseRawContent.addEventListener('scroll', () => {
					clearHoverLine(responseRawContent);
				});

			form.addEventListener('submit', (event) => {
				event.preventDefault();
				if (requestInProgress) {
					send.disabled = true;
					setResponseStatus('Cancelling...');
					vscode.postMessage({ type: 'cancelRequest', requestId: activeRequestId });
					return;
				}
				latestRequestUrl = readEnabledRequestUrl();
				activeRequestId += 1;
				requestInProgress = true;
				send.disabled = false;
				send.textContent = 'Cancel';
				send.classList.add('request-cancel');
				startRequestTimer();
				setResponseStatus('Sending...');
				responseSize.textContent = '';
				responseHeaders.textContent = '(none)';
				setRawContent('(empty)');
				setBodyContent('(empty)');
				setPreviewContent('', false);

			vscode.postMessage({
						type: 'sendRequest',
					requestId: activeRequestId,
						method: method.value,
						url: latestRequestUrl,
						headers: readEnabledRequestHeaders(),
						body: readRequestBodyForSend(),
					});
		});

		window.addEventListener('message', (event) => {
			const message = event.data;

				if (message.type === 'oauthTokenResult') {
                    if (message.requestId !== oauthRequestId) { return; }
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    oauthStatus.textContent = message.error || 'Access token ready.';
                    if (typeof message.token === 'string' && authorizationType.value === 'oauth2' && oauthGrantType.value === 'client_credentials') {
                        oauthToken = message.token;
                        syncAuthorizationHeader();
                        notifyRequestChanged();
                    }
                    return;
                }
                if (message.type === 'requestComplete') {
				requestInProgress = false;
				send.textContent = 'Send';
				send.classList.remove('request-cancel');
				send.disabled = !workspaceTrusted;
				stopRequestTimer();
				renderResponse(message.response);
				updateResponseAreaBounds();
				return;
			}

				if (message.type === 'requestError') {
				requestInProgress = false;
				send.textContent = 'Send';
				send.classList.remove('request-cancel');
				send.disabled = !workspaceTrusted;
					stopRequestTimer();
				setResponseStatus(message.cancelled ? 'Request cancelled' : 'Request failed', message.cancelled ? '' : 'error');
					responseSize.textContent = '';
					responseHeaders.textContent = '(none)';
					setRawContent(message.message);
					setBodyContent(message.message);
					setPreviewContent('', false);
					updateResponseAreaBounds();
					return;
				}

				if (message.type === 'workspaceTrust') {
					workspaceTrusted = message.isTrusted === true;
					send.disabled = requestInProgress ? send.disabled : !message.isTrusted;
					send.title = message.isTrusted ? '' : 'Sending requests requires a trusted workspace.';
					if (message.isTrusted) {
						scheduleEnvironmentVariableCheck();
					} else {
						missingEnvironmentVariables.clear();
						refreshVariableHighlights();
					}
					return;
				}

				if (message.type === 'environmentTooltipSetting') {
					environmentValueTooltipEnabled = message.isEnabled === true;
					if (!environmentValueTooltipEnabled) {
						clearHoveredEnvironmentVariable();
						missingEnvironmentVariables.clear();
						refreshVariableHighlights();
					} else {
						scheduleEnvironmentVariableCheck();
					}
					return;
				}

				if (message.type === 'environmentVariablesChecked') {
					if (message.requestId !== environmentCheckRequestId || !Array.isArray(message.definedNames)) {
						return;
					}
					if (typeof message.error === 'string') {
						return;
					}
					const definedNames = new Set(message.definedNames);
					missingEnvironmentVariables.clear();
					for (const name of environmentCheckNames) {
						if (!definedNames.has(name)) {
							missingEnvironmentVariables.add(name);
						}
					}
					refreshVariableHighlights();
					return;
				}

				if (message.type === 'environmentVariableResolved') {
					if (message.requestId !== environmentVariableRequestId || message.name !== hoveredEnvironmentVariable) {
						return;
					}

					if (typeof message.error === 'string') {
						environmentVariableTooltip.classList.remove('is-missing');
						environmentVariableTooltip.textContent = message.error;
					} else if (typeof message.value === 'string') {
						missingEnvironmentVariables.delete(message.name);
						environmentVariableTooltip.classList.remove('is-missing');
						environmentVariableTooltip.textContent = message.value;
					} else {
						missingEnvironmentVariables.add(message.name);
						environmentVariableTooltip.classList.add('is-missing');
						environmentVariableTooltip.textContent = '{{' + message.name + '}} is not defined in the sibling .env file.';
					}
					refreshVariableHighlights();
					return;
				}

				if (message.type === 'loadRequest') {
						setRequestTitle(message.request.name);
						method.value = message.request.method;
						url.value = message.request.url;
						updateSecretReferenceState(url);
						if (Array.isArray(message.request.params)) {
							renderRequestParams(message.request.params);
							updateUrlFromParams();
						} else {
							renderRequestParamsFromUrl();
						}
						if (Array.isArray(message.request.headerState)) {
							renderRequestHeaderState(message.request.headerState);
						} else {
							renderRequestHeaders(message.request.headers || {});
						}
                        // Loading another request invalidates pending token results and clears old credentials.
                        oauthRequestId++;
                        oauthPending = false;
                        oauthGetToken.disabled = false;
                        oauthStatus.textContent = '';
                        oauthToken = '';
                        activeAuthorizationType = 'none';
                        const savedAuthorization = message.request.authorization;
                        oauthGrantType.value = savedAuthorization?.grantType || 'client_credentials';
                        document.getElementById('oauth-url').value = savedAuthorization?.accessTokenUrl || '';
                        document.getElementById('oauth-client-id').value = savedAuthorization?.clientId || '';
                        document.getElementById('oauth-client-secret').value = savedAuthorization?.clientSecret || '';
                        document.getElementById('oauth-scope').value = savedAuthorization?.scope || '';
                        readAuthorizationFromHeaders(message.request.headers || {});
                        if (savedAuthorization?.type === 'oauth2') {
                            authorizationType.value = 'oauth2';
                            activeAuthorizationType = 'oauth2';
                            const header = readHeaderValue(message.request.headers || {}, 'Authorization');
                            oauthToken = header.startsWith('Bearer ') ? header.slice(7) : '';
                            applyAuthorizationType();
                            syncAuthorizationHeader();
                        }
						setRequestBodyContent(message.request.body === null || message.request.body === undefined
							? ''
							: formatBody(message.request.body));
						renderRequestBodyFormRows(requestBody.value);
						setRequestBodyType(inferRequestBodyType(message.request.headers || {}, requestBody.value, activeRequestBodyType));
						scheduleEnvironmentVariableCheck();
						updateResponseAreaBounds();
				}
			});

		function showHoveredEnvironmentVariable(event) {
			if (!environmentValueTooltipEnabled) {
				clearHoveredEnvironmentVariable();
				return;
			}

			const target = event.target;
			if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
				|| target.type === 'checkbox' || target.type === 'submit'
				|| !target.closest('.request-bar, .request-panel')) {
				clearHoveredEnvironmentVariable();
				return;
			}

			const value = target.value;
			const rect = target.getBoundingClientRect();
			const style = window.getComputedStyle(target);
			const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
			const paddingTop = Number.parseFloat(style.paddingTop) || 0;
			if (!value) {
				clearHoveredEnvironmentVariable();
				return;
			}

			textMeasureContext ??= document.createElement('canvas').getContext('2d');
			if (!textMeasureContext) {
				clearHoveredEnvironmentVariable();
				return;
			}
			textMeasureContext.font = style.font;
			const pointerX = event.clientX - rect.left - paddingLeft + target.scrollLeft;
			let sourceLine = value;
			let sourceLineStart = 0;
			if (target instanceof HTMLTextAreaElement) {
				const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) || 16;
				const paddingRight = Number.parseFloat(style.paddingRight) || 0;
				const lineWidth = Math.max(1, target.clientWidth - paddingLeft - paddingRight);
				const visualLines = [];
				let sourceOffset = 0;
				for (const hardLine of value.split('\\n')) {
					if (!hardLine) {
						visualLines.push({ text: '', start: sourceOffset });
					} else {
						let rowStart = 0;
						for (let index = 1; index <= hardLine.length; index += 1) {
							if (textMeasureContext.measureText(hardLine.slice(rowStart, index)).width > lineWidth && index - 1 > rowStart) {
								visualLines.push({ text: hardLine.slice(rowStart, index - 1), start: sourceOffset + rowStart });
								rowStart = index - 1;
							}
						}
						visualLines.push({ text: hardLine.slice(rowStart), start: sourceOffset + rowStart });
					}
					sourceOffset += hardLine.length + 1;
				}

				const visualLineIndex = Math.max(0, Math.floor((event.clientY - rect.top - paddingTop + target.scrollTop) / lineHeight));
			const visualLine = visualLines[visualLineIndex];
			if (!visualLine) {
				clearHoveredEnvironmentVariable();
				return;
			}
			sourceLine = visualLine.text;
			sourceLineStart = visualLine.start;
		}

			let characterIndex = 0;
				while (characterIndex < sourceLine.length
				&& textMeasureContext.measureText(sourceLine.slice(0, characterIndex + 1)).width < pointerX) {
				characterIndex += 1;
			}

			const tokenPattern = /\\{\\{([A-Za-z_][A-Za-z0-9_]*)\\}\\}/g;
			let match;
			let variableName = '';
			const sourceCharacterIndex = sourceLineStart + characterIndex;
			while ((match = tokenPattern.exec(value)) !== null) {
				if (sourceCharacterIndex >= match.index && sourceCharacterIndex <= match.index + match[0].length) {
					variableName = match[1];
					break;
				}
			}

			if (!variableName) {
				clearHoveredEnvironmentVariable();
				return;
			}

			environmentVariableTooltip.style.left = Math.max(8, Math.min(event.clientX + 12, window.innerWidth - 488)) + 'px';
			environmentVariableTooltip.style.top = Math.max(8, Math.min(event.clientY + 16, window.innerHeight - 80)) + 'px';
			environmentVariableTooltip.classList.remove('hidden');
			if (variableName !== hoveredEnvironmentVariable) {
				hoveredEnvironmentVariable = variableName;
				environmentVariableRequestId += 1;
					environmentVariableTooltip.classList.remove('is-missing');
				environmentVariableTooltip.textContent = 'Looking up {{' + variableName + '}}…';
				vscode.postMessage({
					type: 'resolveEnvironmentVariable',
					requestId: environmentVariableRequestId,
					name: variableName,
				});
			}
		}

		function clearHoveredEnvironmentVariable() {
			if (hoveredEnvironmentVariable) {
				hoveredEnvironmentVariable = '';
				environmentVariableRequestId += 1;
			}
			environmentVariableTooltip.classList.add('hidden');
			environmentVariableTooltip.classList.remove('is-missing');
		}

		function scheduleEnvironmentVariableCheck() {
			if (!environmentValueTooltipEnabled || !workspaceTrusted) {
				return;
			}
			window.clearTimeout(environmentCheckTimer);
			environmentCheckTimer = window.setTimeout(() => {
				const variableNames = new Set();
				for (const field of document.querySelectorAll('.request-bar input, .request-panel input, .request-panel textarea')) {
					const pattern = /\\{\\{\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\}\\}/g;
					let match;
					while ((match = pattern.exec(field.value)) !== null) {
						variableNames.add(match[1]);
					}
				}

				environmentCheckNames = Array.from(variableNames);
				environmentCheckRequestId += 1;
				if (environmentCheckNames.length === 0) {
					missingEnvironmentVariables.clear();
					refreshVariableHighlights();
					return;
				}
				vscode.postMessage({
					type: 'checkEnvironmentVariables',
					requestId: environmentCheckRequestId,
					names: environmentCheckNames,
				});
			}, 120);
		}

		function refreshVariableHighlights() {
			for (const input of document.querySelectorAll('.variable-input-wrapper input')) {
				updateSecretReferenceState(input);
			}
			updateRequestBodyHighlight();
		}

		vscode.postMessage({
			type: 'webviewReady',
		});

				// Renders response metadata, body, headers, raw text, and preview.
				function renderResponse(result) {
					setResponseStatus(
						'Status: ' + result.status + ' ' + result.statusText,
						isSuccessStatus(result.status) ? 'success' : 'error',
					);
					responseSize.textContent = formatResponseSize(result.body || '');
					renderResponseHeaders(result.headers);
					setRawContent(result.body || '(empty)');
					setFormattedBodyContent(result.body || '(empty)', result.headers);
					setPreviewContent(result.body || '', hasHtmlContentType(result.headers));
					updateResponseAreaBounds();
				}

				// Sizes the active response panel to fit above the fixed footer.
				function updateResponseAreaBounds() {
					const activeResponsePanel = readActiveResponsePanel();

					if (!activeResponsePanel || !editorFooter) {
						return;
					}

					const panelTop = activeResponsePanel.getBoundingClientRect().top;
					const footerTop = editorFooter.getBoundingClientRect().top;
					const availableHeight = Math.max(0, Math.floor(footerTop - panelTop - 12));
					const nextHeight = availableHeight + 'px';

					responseBodyContent.style.setProperty('--response-area-max-height', nextHeight);
					responseHeaders.style.setProperty('--response-area-max-height', nextHeight);
					responseRawContent.style.setProperty('--response-area-max-height', nextHeight);
					responsePreview.style.setProperty('--response-area-max-height', nextHeight);
					responsePreviewEmpty.style.setProperty('--response-area-max-height', nextHeight);
				}

				// Returns the currently visible response content element.
				function readActiveResponsePanel() {
					if (!bodyPanel.classList.contains('hidden')) {
						return responseBodyContent;
					}

					if (!rawPanel.classList.contains('hidden')) {
						return responseRawContent;
					}

					if (!headersPanel.classList.contains('hidden')) {
						return responseHeaders;
					}

					if (!previewPanel.classList.contains('hidden')) {
						return responsePreview.classList.contains('hidden') ? responsePreviewEmpty : responsePreview;
					}

					return undefined;
				}

				// Updates the response status text and optional success/error badge.
				function setResponseStatus(text, badgeType) {
					responseStatus.textContent = text;
					responseStatus.className = badgeType
						? 'response-status-badge ' + badgeType
						: 'response-status-text';
				}

				// Detects 2xx HTTP statuses for badge styling.
				function isSuccessStatus(status) {
					return status >= 200 && status < 300;
				}

				// Starts the elapsed-time counter while a request is in flight.
				function startRequestTimer() {
					requestStartedAt = performance.now();
					updateRequestTimer();

					if (requestTimer !== undefined) {
						clearInterval(requestTimer);
					}

					requestTimer = setInterval(updateRequestTimer, 100);
				}

				// Stops the elapsed-time counter after request completion.
				function stopRequestTimer() {
					if (requestTimer !== undefined) {
						clearInterval(requestTimer);
						requestTimer = undefined;
					}

					updateRequestTimer();
				}

				// Writes the current elapsed request time into the response header.
				function updateRequestTimer() {
					responseTime.textContent = formatDuration(performance.now() - requestStartedAt);
				}

				// Positions the hover-line highlight for the editable body textarea.
				function updateTextareaHoverLine(container, textEditor, event) {
					const editorRect = textEditor.getBoundingClientRect();

					if (event.clientY < editorRect.top || event.clientY > editorRect.bottom) {
						clearHoverLine(container);
						return;
					}

					const metrics = getTextMetrics(textEditor);
					const y = event.clientY - editorRect.top + textEditor.scrollTop - metrics.paddingTop;

					if (y < 0) {
						clearHoverLine(container);
						return;
					}

					const lineIndex = Math.floor(y / metrics.lineHeight);
					const top = textEditor.offsetTop + metrics.paddingTop + (lineIndex * metrics.lineHeight) - textEditor.scrollTop;
					setHoverLine(container, top, metrics.lineHeight);
				}

				// Positions the hover-line highlight for scrollable response blocks.
				function updateScrollablePreHoverLine(container, textEditor, event) {
					const editorRect = textEditor.getBoundingClientRect();

					if (event.clientY < editorRect.top || event.clientY > editorRect.bottom) {
						clearHoverLine(container);
						return;
					}

					const metrics = getTextMetrics(textEditor);
					const y = event.clientY - editorRect.top - metrics.paddingTop;

					if (y < 0) {
						clearHoverLine(container);
						return;
					}

					const lineIndex = Math.floor(y / metrics.lineHeight);
					const top = textEditor.offsetTop + metrics.paddingTop + (lineIndex * metrics.lineHeight);
					setHoverLine(container, top, metrics.lineHeight);
				}

				// Applies hover-line CSS variables to a code-like container.
				function setHoverLine(container, top, height) {
					container.style.setProperty('--hover-line-top', top + 'px');
					container.style.setProperty('--hover-line-height', height + 'px');
					container.classList.add('line-hover');
				}

				// Removes the hover-line state from a code-like container.
				function clearHoverLine(container) {
					container.classList.remove('line-hover');
				}

				// Reads text layout metrics used for line hover calculations.
				function getTextMetrics(element) {
					const style = getComputedStyle(element);
					const fontSize = parseFloat(style.fontSize);
					const parsedLineHeight = parseFloat(style.lineHeight);

					return {
						lineHeight: Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.45,
						paddingTop: parseFloat(style.paddingTop) || 0,
					};
				}

				// Switches between request configuration tabs.
				function showRequestTab(tabName) {
					const showParams = tabName === 'params';
					const showAuthorization = tabName === 'authorization';
					const showHeaders = tabName === 'headers';
					const showBody = tabName === 'body';

					requestParamsTab.classList.toggle('active', showParams);
					requestAuthorizationTab.classList.toggle('active', showAuthorization);
					requestHeadersTab.classList.toggle('active', showHeaders);
					requestBodyTab.classList.toggle('active', showBody);
					requestParamsTab.setAttribute('aria-selected', String(showParams));
					requestAuthorizationTab.setAttribute('aria-selected', String(showAuthorization));
					requestHeadersTab.setAttribute('aria-selected', String(showHeaders));
					requestBodyTab.setAttribute('aria-selected', String(showBody));
					requestParamsPanel.classList.toggle('hidden', !showParams);
					requestAuthorizationPanel.classList.toggle('hidden', !showAuthorization);
					requestHeadersPanel.classList.toggle('hidden', !showHeaders);
					requestBodyPanel.classList.toggle('hidden', !showBody);
					updateResponseAreaBounds();
				}

				// Switches between response display tabs.
				function showResponseTab(tabName) {
					const showBody = tabName === 'body';
					const showHeaders = tabName === 'headers';
					const showRaw = tabName === 'raw';
					const showPreview = tabName === 'preview';

				bodyTab.classList.toggle('active', showBody);
				headersTab.classList.toggle('active', showHeaders);
				rawTab.classList.toggle('active', showRaw);
				previewTab.classList.toggle('active', showPreview);
				bodyTab.setAttribute('aria-selected', String(showBody));
				headersTab.setAttribute('aria-selected', String(showHeaders));
				rawTab.setAttribute('aria-selected', String(showRaw));
				previewTab.setAttribute('aria-selected', String(showPreview));
					bodyPanel.classList.toggle('hidden', !showBody);
					headersPanel.classList.toggle('hidden', !showHeaders);
					rawPanel.classList.toggle('hidden', !showRaw);
					previewPanel.classList.toggle('hidden', !showPreview);
					updateResponseAreaBounds();
				}

				// Rebuilds request parameter rows from the current URL query string.
				function renderRequestParamsFromUrl() {
					renderRequestParams(readParamsFromUrl().map(([name, value]) => ({
						name,
						value,
						enabled: true,
					})));
				}

				// Renders the full request parameter table.
				function renderRequestParams(params) {
					requestParamsTable.textContent = '';

					if (params.length === 0) {
						addRequestParamRow('', '');
						return;
					}

					for (const param of params) {
						addParamRow(param.name, param.value, param.enabled);
					}
				}

				// Renders headers as enabled header rows.
				function renderRequestHeaders(headers) {
					renderRequestHeaderState(Object.entries(headers).map(([name, value]) => ({
						name,
						value,
						enabled: true,
					})));
				}

				// Renders header rows with their persisted enabled state.
				function renderRequestHeaderState(headerState) {
					requestHeadersTable.textContent = '';

					if (headerState.length === 0) {
						addRequestHeaderRow('', '');
						return;
					}

					for (const header of headerState) {
						addHeaderRow(header.name, header.value, header.enabled);
					}
				}

				// Adds a new enabled query parameter row.
				function addRequestParamRow(name, value) {
					addParamRow(name, value, true);
				}

				// Adds a new enabled request header row.
				function addRequestHeaderRow(name, value) {
					addHeaderRow(name, value, true);
				}

				// Creates one query parameter row and wires its edit handlers.
				function addParamRow(name, value, enabled) {
					const row = document.createElement('tr');
					const enabledCell = document.createElement('td');
					const nameCell = document.createElement('td');
					const valueCell = document.createElement('td');
					const actionCell = document.createElement('td');
					const enabledInput = document.createElement('input');
					const nameInput = document.createElement('input');
					const valueInput = document.createElement('input');
					const removeButton = document.createElement('button');

					enabledCell.className = 'request-header-enabled-cell';
					enabledInput.className = 'request-header-enabled';
					enabledInput.type = 'checkbox';
					enabledInput.checked = enabled;
					enabledInput.ariaLabel = 'Include param';
					nameInput.className = 'request-header-input';
					nameInput.placeholder = 'Param name';
					nameInput.value = name;
					valueInput.className = 'request-header-input';
					valueInput.placeholder = 'Param value';
					valueInput.value = value;
					updateSecretReferenceState(nameInput);
					updateSecretReferenceState(valueInput);
					removeButton.className = 'request-header-remove';
					removeButton.type = 'button';
					removeButton.ariaLabel = 'Remove param';
					removeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
					updateRequestRowEnabledState(row, enabledInput.checked);

					enabledInput.addEventListener('change', () => {
						updateRequestRowEnabledState(row, enabledInput.checked);
						updateUrlFromParams();
						notifyRequestChanged();
					});
					nameInput.addEventListener('input', () => {
						updateSecretReferenceState(nameInput);
						updateUrlFromParams();
						notifyRequestChanged();
					});
					valueInput.addEventListener('input', () => {
						updateSecretReferenceState(valueInput);
						updateUrlFromParams();
						notifyRequestChanged();
					});
					removeButton.addEventListener('click', () => {
						row.remove();

						if (requestParamsTable.children.length === 0) {
							addParamRow('', '', true);
						}

						updateUrlFromParams();
						notifyRequestChanged();
					});

					enabledCell.append(enabledInput);
					nameCell.append(nameInput);
					valueCell.append(valueInput);
					actionCell.append(removeButton);
					row.append(enabledCell, nameCell, valueCell, actionCell);
					requestParamsTable.append(row);
					updateSecretReferenceState(nameInput);
					updateSecretReferenceState(valueInput);
				}

				// Creates one request header row and wires its edit handlers.
				function addHeaderRow(name, value, enabled) {
					const row = document.createElement('tr');
					const enabledCell = document.createElement('td');
					const nameCell = document.createElement('td');
					const valueCell = document.createElement('td');
					const actionCell = document.createElement('td');
					const enabledInput = document.createElement('input');
					const nameInput = document.createElement('input');
					const valueInput = document.createElement('input');
					const removeButton = document.createElement('button');

					enabledCell.className = 'request-header-enabled-cell';
					enabledInput.className = 'request-header-enabled';
					enabledInput.type = 'checkbox';
					enabledInput.checked = enabled;
					enabledInput.ariaLabel = 'Include header';
					nameInput.className = 'request-header-input';
					nameInput.placeholder = 'Header name';
					nameInput.value = name;
					valueInput.className = 'request-header-input';
					valueInput.placeholder = 'Header value';
					valueInput.value = value;
					updateSecretReferenceState(nameInput);
					updateSecretReferenceState(valueInput);
					removeButton.className = 'request-header-remove';
					removeButton.type = 'button';
					removeButton.ariaLabel = 'Remove header';
					removeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
					updateRequestRowEnabledState(row, enabledInput.checked);

					enabledInput.addEventListener('change', () => {
						updateRequestRowEnabledState(row, enabledInput.checked);
						notifyRequestChanged();
					});
					nameInput.addEventListener('input', () => {
						updateSecretReferenceState(nameInput);
						notifyRequestChanged();
					});
					valueInput.addEventListener('input', () => {
						updateSecretReferenceState(valueInput);
						notifyRequestChanged();
					});
					removeButton.addEventListener('click', () => {
						row.remove();

						if (requestHeadersTable.children.length === 0) {
							addHeaderRow('', '', true);
						}

						notifyRequestChanged();
					});

					enabledCell.append(enabledInput);
					nameCell.append(nameInput);
					valueCell.append(valueInput);
					actionCell.append(removeButton);
					row.append(enabledCell, nameCell, valueCell, actionCell);
					requestHeadersTable.append(row);
					updateSecretReferenceState(nameInput);
					updateSecretReferenceState(valueInput);
				}

				// Renders form URL encoded body pairs from the serialized body.
				function renderRequestBodyFormRows(body) {
					requestBodyFormTable.textContent = '';

					const entries = readBodyFormEntries(body);

					if (entries.length === 0) {
						addBodyFormRow('', '');
						return;
					}

					for (const [name, value] of entries) {
						addBodyFormRow(name, value);
					}
				}

				// Creates one form URL encoded body row and wires its edit handlers.
				function addBodyFormRow(name, value) {
					const row = document.createElement('tr');
					const nameCell = document.createElement('td');
					const valueCell = document.createElement('td');
					const actionCell = document.createElement('td');
					const nameInput = document.createElement('input');
					const valueInput = document.createElement('input');
					const removeButton = document.createElement('button');

					nameInput.className = 'request-header-input';
					nameInput.placeholder = 'Field name';
					nameInput.value = name;
					valueInput.className = 'request-header-input';
					valueInput.placeholder = 'Field value';
					valueInput.value = value;
					updateSecretReferenceState(nameInput);
					updateSecretReferenceState(valueInput);
					removeButton.className = 'request-header-remove';
					removeButton.type = 'button';
					removeButton.ariaLabel = 'Remove form pair';
					removeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';

					nameInput.addEventListener('input', () => {
						updateSecretReferenceState(nameInput);
						syncRequestBodyFromFormRows();
						notifyRequestChanged();
					});
					valueInput.addEventListener('input', () => {
						updateSecretReferenceState(valueInput);
						syncRequestBodyFromFormRows();
						notifyRequestChanged();
					});
					removeButton.addEventListener('click', () => {
						row.remove();

						if (requestBodyFormTable.children.length === 0) {
							addBodyFormRow('', '');
						}

						syncRequestBodyFromFormRows();
						notifyRequestChanged();
					});

					nameCell.append(nameInput);
					valueCell.append(valueInput);
					actionCell.append(removeButton);
					row.append(nameCell, valueCell, actionCell);
					requestBodyFormTable.append(row);
					updateSecretReferenceState(nameInput);
					updateSecretReferenceState(valueInput);
				}

				// Serializes form rows back into the hidden body textarea.
				function syncRequestBodyFromFormRows() {
					requestBody.value = readBodyFormValue();
					updateRequestBodyLineNumbers();
				}

				// Reads form body rows as an application/x-www-form-urlencoded string.
				function readBodyFormValue() {
					const params = new URLSearchParams();

					for (const [name, value] of readBodyFormRows()) {
						params.append(name, value);
					}

					return params.toString();
				}

				// Reads non-empty form body rows from the DOM.
				function readBodyFormRows() {
					const values = [];

					for (const row of requestBodyFormTable.querySelectorAll('tr')) {
						const inputs = row.querySelectorAll('.request-header-input');
						const name = inputs[0].value.trim();

						if (name) {
							values.push([name, inputs[1].value]);
						}
					}

					return values;
				}

				// Parses a serialized form body into editable key/value entries.
				function readBodyFormEntries(body) {
					const entries = [];

					for (const [name, value] of new URLSearchParams(body).entries()) {
						entries.push([name, value]);
					}

					return entries;
				}

				// Reflects an enabled checkbox on a request row's visual state.
				function updateRequestRowEnabledState(row, enabled) {
					row.classList.toggle('request-header-disabled', !enabled);
				}

				// Selects and applies the active body editor mode.
				function setRequestBodyType(nextType) {
					requestBodyType.value = nextType;
					applyRequestBodyType(nextType);
				}

				// Updates body controls and Content-Type header for a body mode.
				function applyRequestBodyType(nextType) {
					const hasTextBody = nextType !== 'none' && nextType !== 'form';
					const hasFormBody = nextType === 'form';

					requestBodyEditor.classList.toggle('hidden', !hasTextBody);
					requestBodyForm.classList.toggle('hidden', !hasFormBody);
					requestBodyBeautify.classList.toggle('hidden', nextType !== 'json');
					requestBodyEditor.classList.toggle('json-highlight', nextType === 'json');
					requestBody.disabled = !hasTextBody;
					requestBody.placeholder = readBodyTypePlaceholder(nextType);
					updateRequestBodyHighlight();

					if (hasFormBody && requestBodyFormTable.children.length === 0) {
						renderRequestBodyFormRows(requestBody.value);
					}

					const contentType = readBodyTypeContentType(nextType);

					if (contentType) {
						setHeaderValue('Content-Type', contentType);
					} else if (nextType === 'none' || nextType === 'raw') {
						removeHeaderValue('Content-Type');
					}
				}

				// Maps a body mode to its default Content-Type value.
				function readBodyTypeContentType(nextType) {
					const contentTypes = {
						json: 'application/json',
						text: 'text/plain',
						xml: 'application/xml',
						html: 'text/html',
						form: 'application/x-www-form-urlencoded',
					};

					return contentTypes[nextType] || '';
				}

				// Initializes authorization controls from an Authorization header.
				function readAuthorizationFromHeaders(headers) {
					const authorization = readHeaderValue(headers, 'Authorization');

					if (authorization.startsWith('Bearer ')) {
						authorizationType.value = activeAuthorizationType === 'oauth2' && authorization === 'Bearer ' + oauthToken ? 'oauth2' : 'bearer';
						activeAuthorizationType = authorizationType.value;
						bearerToken.value = authorization.slice('Bearer '.length);
						basicAuthUsername.value = '';
						basicAuthPassword.value = '';
					} else if (authorization.startsWith('Basic ')) {
						authorizationType.value = 'basic';
						activeAuthorizationType = 'basic';
						bearerToken.value = '';
						readBasicAuthorizationCredentials(authorization.slice('Basic '.length));
					} else {
						authorizationType.value = activeAuthorizationType;
					}

					applyAuthorizationType();
					updateAuthorizationSecretStates();
					syncAuthorizationHeader();
				}

				// Shows the authorization inputs for the selected auth type.
				function applyAuthorizationType() {
					const showBearerToken = authorizationType.value === 'bearer';
					const showBasicAuth = authorizationType.value === 'basic';
                    const showOAuth = authorizationType.value === 'oauth2';
                    document.querySelectorAll('.oauth-authorization-field').forEach((field) => setAuthorizationFieldHidden(field, !showOAuth));
                    document.querySelectorAll('.oauth-client-field').forEach((field) => setAuthorizationFieldHidden(field, !showOAuth || oauthGrantType.value !== 'client_credentials'));

					bearerAuthorizationFields.forEach((field) => {
						setAuthorizationFieldHidden(field, !showBearerToken);
					});

					basicAuthorizationFields.forEach((field) => {
						setAuthorizationFieldHidden(field, !showBasicAuth);
					});
				}

				// Hides or shows an authorization field and its variable wrapper.
				function setAuthorizationFieldHidden(field, hidden) {
					field.classList.toggle('hidden', hidden);

					if (field.parentElement?.classList.contains('variable-input-wrapper')) {
						field.parentElement.classList.toggle('hidden', hidden);
					}
				}

				// Writes authorization control state back to the header table.
				function syncAuthorizationHeader() {
					activeAuthorizationType = authorizationType.value;
					const headerValue = readAuthorizationHeaderValue();

					if (headerValue) {
						setHeaderValue('Authorization', readAuthorizationHeaderDisplayValue(headerValue));
						return;
					}

					removeHeaderValue('Authorization');
				}

				// Builds the executable Authorization header value.
				function readAuthorizationHeaderValue() {
					if (authorizationType.value === 'oauth2' && oauthGrantType.value === 'client_credentials' && oauthToken) {
                        return 'Bearer ' + oauthToken;
                    }
                    if (authorizationType.value === 'bearer' && bearerToken.value) {
						return 'Bearer ' + bearerToken.value;
					}

					if (authorizationType.value === 'basic' && (basicAuthUsername.value || basicAuthPassword.value)) {
						return 'Basic ' + encodeBase64(basicAuthUsername.value + ':' + basicAuthPassword.value);
					}

					return '';
				}

				// Masks variable-backed credentials in the visible header table.
				function readAuthorizationHeaderDisplayValue(headerValue) {
					if (authorizationType.value === 'bearer' && hasVariableReference(bearerToken.value)) {
						return 'Bearer ***';
					}

					if (
						authorizationType.value === 'basic'
						&& (hasVariableReference(basicAuthUsername.value) || hasVariableReference(basicAuthPassword.value))
					) {
						return 'Basic ***';
					}

					return headerValue;
				}

				// Detects RestCraft environment variable placeholders.
				function hasVariableReference(value) {
					return /\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/.test(value);
				}

				// Highlights variable placeholders without exposing secret values.
				function updateSecretReferenceState(element) {
					if (element === requestBody) {
						requestBodyEditor.classList.toggle(
							'variable-highlight',
							!requestBodyEditor.classList.contains('json-highlight') && hasVariableReference(element.value),
						);
						return;
					}

					const wrapper = readVariableInputWrapper(element);

					if (!wrapper) {
						return;
					}

					const overlay = wrapper.querySelector('.variable-highlight-overlay');
					const hasSecretReference = hasVariableReference(element.value);

					wrapper.classList.toggle('has-secret-reference', hasSecretReference);
					overlay.innerHTML = hasSecretReference ? formatSecretHighlight(element.value) : '';
				}

				// Refreshes variable highlighting for authorization fields.
				function updateAuthorizationSecretStates() {
					updateSecretReferenceState(bearerToken);
					updateSecretReferenceState(basicAuthUsername);
					updateSecretReferenceState(basicAuthPassword);
				}

				// Ensures an input has an overlay wrapper for variable highlighting.
				function readVariableInputWrapper(element) {
					if (element.parentElement?.classList.contains('variable-input-wrapper')) {
						return element.parentElement;
					}

					if (!element.parentElement) {
						return undefined;
					}

					const wrapper = document.createElement('span');
					const overlay = document.createElement('span');

					wrapper.className = 'variable-input-wrapper';
					overlay.className = 'variable-highlight-overlay';
					element.parentElement.insertBefore(wrapper, element);
					wrapper.append(overlay, element);
					wrapper.classList.toggle('hidden', element.classList.contains('hidden'));

					return wrapper;
				}

				// Produces highlighted HTML for variable placeholders.
				function formatSecretHighlight(content) {
					return escapeHtml(content).replace(
						/\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/g,
					(match) => {
						const variableName = match.match(/[A-Za-z_][A-Za-z0-9_]*/)?.[0];
						const missingClass = variableName && missingEnvironmentVariables.has(variableName) ? ' is-missing' : '';
						return '<span class="secret-reference' + missingClass + '">' + match + '</span>';
					},
					);
				}

				// Decodes a Basic auth header into username/password inputs.
				function readBasicAuthorizationCredentials(encodedCredentials) {
					const credentials = decodeBase64(encodedCredentials);
					const separatorIndex = credentials.indexOf(':');

					if (separatorIndex === -1) {
						basicAuthUsername.value = credentials;
						basicAuthPassword.value = '';
						return;
					}

					basicAuthUsername.value = credentials.slice(0, separatorIndex);
					basicAuthPassword.value = credentials.slice(separatorIndex + 1);
				}

				// Encodes UTF-8 text for browser-side Basic auth.
				function encodeBase64(value) {
					const bytes = new TextEncoder().encode(value);
					let binary = '';

					bytes.forEach((byte) => {
						binary += String.fromCharCode(byte);
					});

					return btoa(binary);
				}

				// Decodes UTF-8 text from browser-side Basic auth.
				function decodeBase64(value) {
					try {
						const binary = atob(value);
						const bytes = new Uint8Array(binary.length);

						for (let i = 0; i < binary.length; i++) {
							bytes[i] = binary.charCodeAt(i);
						}

						return new TextDecoder().decode(bytes);
					} catch {
						return '';
					}
				}

				// Returns placeholder text for the selected body type.
				function readBodyTypePlaceholder(nextType) {
					const placeholders = {
						raw: 'Raw request body',
						json: '{\\n  "example": true\\n}',
						text: 'Plain text request body',
						xml: '<example>true</example>',
						html: '<p>Request body</p>',
					};

					return placeholders[nextType] || '';
				}

				// Infers the body editor mode from headers and current body content.
				function inferRequestBodyType(headers, body, fallbackType) {
					const contentType = readHeaderValue(headers, 'Content-Type').toLowerCase();

					if (contentType.includes('application/json')) {
						return 'json';
					}

					if (contentType.includes('text/plain')) {
						return 'text';
					}

					if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
						return 'xml';
					}

					if (contentType.includes('text/html')) {
						return 'html';
					}

					if (contentType.includes('application/x-www-form-urlencoded')) {
						return 'form';
					}

					if (!body) {
						return fallbackType;
					}

					return 'raw';
				}

				// Reads the request body exactly as it should be sent.
				function readRequestBodyForSend() {
					if (requestBodyType.value === 'none') {
						return '';
					}

					if (requestBodyType.value === 'form') {
						return readBodyFormValue();
					}

					return requestBody.value;
				}

				// Formats the JSON request body or shows a validation message.
				function beautifyJsonRequestBody() {
					try {
						setRequestBodyContent(JSON.stringify(JSON.parse(requestBody.value), null, 2));
						clearRequestBodyMessage();
						notifyRequestChanged();
					} catch {
						setRequestBodyMessage('Invalid JSON body');
					}
				}

				// Shows request body validation feedback.
				function setRequestBodyMessage(message) {
					requestBodyMessage.textContent = message;
					requestBodyMessage.classList.remove('hidden');
				}

				// Clears request body validation feedback.
				function clearRequestBodyMessage() {
					requestBodyMessage.textContent = '';
					requestBodyMessage.classList.add('hidden');
				}

				// Creates or updates a header row by case-insensitive name.
				function setHeaderValue(name, value) {
					let row = findHeaderRow(name);

					if (!row) {
						row = findEmptyHeaderRow();

						if (!row) {
							addHeaderRow(name, value, true);
							return;
						}
					}

					const enabledInput = row.querySelector('.request-header-enabled');
					const inputs = row.querySelectorAll('.request-header-input');
					const enabled = enabledInput.checked;

					inputs[0].value = name;
					inputs[1].value = value;
					updateSecretReferenceState(inputs[0]);
					updateSecretReferenceState(inputs[1]);
					updateRequestRowEnabledState(row, enabled);
				}

				// Removes a header row by case-insensitive name.
				function removeHeaderValue(name) {
					const row = findHeaderRow(name);

					if (row) {
						row.remove();
					}

					if (requestHeadersTable.children.length === 0) {
						addHeaderRow('', '', true);
					}
				}

				// Finds a header row by case-insensitive name.
				function findHeaderRow(name) {
					const normalizedName = name.toLowerCase();

					for (const row of requestHeadersTable.querySelectorAll('tr')) {
						const inputs = row.querySelectorAll('.request-header-input');

						if (inputs[0].value.trim().toLowerCase() === normalizedName) {
							return row;
						}
					}

					return undefined;
				}

				// Finds a blank header row that can be reused.
				function findEmptyHeaderRow() {
					for (const row of requestHeadersTable.querySelectorAll('tr')) {
						const inputs = row.querySelectorAll('.request-header-input');

						if (!inputs[0].value.trim() && !inputs[1].value) {
							return row;
						}
					}

					return undefined;
				}

				// Reads a header value by case-insensitive name from an object map.
				function readHeaderValue(headers, name) {
					const normalizedName = name.toLowerCase();

					for (const [headerName, value] of Object.entries(headers)) {
						if (headerName.toLowerCase() === normalizedName) {
							return value;
						}
					}

					return '';
				}

				// Reads all request headers from the editor rows.
				function readRequestHeaders() {
					return readHeaderRows(false);
				}

				// Reads header rows including enabled/disabled state for persistence.
				function readRequestHeaderState() {
					const values = [];

					for (const row of requestHeadersTable.querySelectorAll('tr')) {
						const enabledInput = row.querySelector('.request-header-enabled');
						const inputs = row.querySelectorAll('.request-header-input');
						const name = inputs[0].value.trim();

						if (name) {
							values.push({
								name,
								value: readHeaderRowValue(name, inputs[1].value),
								enabled: enabledInput.checked,
							});
						}
					}

					return values;
				}

				// Reads only enabled headers for request execution.
				function readEnabledRequestHeaders() {
					return readHeaderRows(true);
				}

				// Reads header rows, optionally filtering to enabled rows.
				function readHeaderRows(onlyEnabled) {
					const values = {};

					for (const row of requestHeadersTable.querySelectorAll('tr')) {
						const enabledInput = row.querySelector('.request-header-enabled');
						const inputs = row.querySelectorAll('.request-header-input');
						const name = inputs[0].value.trim();

						if ((!onlyEnabled || enabledInput.checked) && name) {
							values[name] = readHeaderRowValue(name, inputs[1].value);
						}
					}

					return values;
				}

				// Returns the executable value for a header row.
				function readHeaderRowValue(name, value) {
					if (name.toLowerCase() === 'authorization') {
						return readAuthorizationHeaderValue() || value;
					}

					return value;
				}

				// Reads query parameter rows including enabled/disabled state.
				function readRequestParamState() {
					const values = [];

					for (const row of requestParamsTable.querySelectorAll('tr')) {
						const enabledInput = row.querySelector('.request-header-enabled');
						const inputs = row.querySelectorAll('.request-header-input');
						const name = inputs[0].value.trim();

						if (name) {
							values.push({
								name,
								value: inputs[1].value,
								enabled: enabledInput.checked,
							});
						}
					}

					return values;
				}

				// Builds the executable URL using only enabled query parameters.
				function readEnabledRequestUrl() {
					let parsed;
					try {
						parsed = new URL(url.value);
					} catch {
						return url.value;
					}

					parsed.search = '';

					for (const [name, value] of readParamRows(true)) {
						parsed.searchParams.append(name, value);
					}

					return parsed.toString();
				}

				// Reads query parameter rows, optionally filtering to enabled rows.
				function readParamRows(onlyEnabled) {
					const values = [];

					for (const row of requestParamsTable.querySelectorAll('tr')) {
						const enabledInput = row.querySelector('.request-header-enabled');
						const inputs = row.querySelectorAll('.request-header-input');
						const name = inputs[0].value.trim();

						if ((!onlyEnabled || enabledInput.checked) && name) {
							values.push([name, inputs[1].value]);
						}
					}

					return values;
				}

				// Parses query parameters from the current URL input.
				function readParamsFromUrl() {
					try {
						return Array.from(new URL(url.value).searchParams.entries());
					} catch {
						return [];
					}
				}

				// Rewrites the URL query string from enabled parameter rows.
				function updateUrlFromParams() {
					let parsed;
					try {
						parsed = new URL(url.value);
					} catch {
						return;
					}

					parsed.search = '';

					for (const [name, value] of readParamRows(true)) {
						parsed.searchParams.append(name, value);
					}

					url.value = parsed.toString();
				}

				// Posts the current editor state to the extension host for syncing.
				function notifyRequestChanged() {
					vscode.postMessage({
						type: 'requestChanged',
                        authorization: authorizationType.value === 'oauth2' ? {
                            type: 'oauth2', grantType: oauthGrantType.value,
                            accessTokenUrl: document.getElementById('oauth-url').value,
                            clientId: document.getElementById('oauth-client-id').value,
                            clientSecret: document.getElementById('oauth-client-secret').value,
                            scope: document.getElementById('oauth-scope').value,
                        } : undefined,
						name: requestTitle.textContent || 'Untitled Request',
						method: method.value,
						url: url.value,
						params: readRequestParamState(),
						headerState: readRequestHeaderState(),
						headers: readRequestHeaders(),
						body: readRequestBodyForSend(),
					});
				}

				// Normalizes and renders the request title.
				function setRequestTitle(value) {
					const title = value.trim() || 'Untitled Request';

					requestTitle.textContent = title;
					requestTitleInput.value = title;
				}

				// Enters inline request title editing mode.
				function startTitleEdit() {
					requestTitleInput.value = requestTitle.textContent || '';
					requestTitle.classList.add('hidden');
					requestTitleInput.classList.remove('hidden');
					requestTitleInput.focus();
					requestTitleInput.select();
				}

				// Saves inline request title edits.
				function commitTitleEdit() {
					if (requestTitleInput.classList.contains('hidden')) {
						return;
					}

					setRequestTitle(requestTitleInput.value);
					requestTitleInput.classList.add('hidden');
					requestTitle.classList.remove('hidden');
					notifyRequestChanged();
				}

				// Discards inline request title edits.
				function cancelTitleEdit() {
					requestTitleInput.value = requestTitle.textContent || '';
					requestTitleInput.classList.add('hidden');
					requestTitle.classList.remove('hidden');
				}

				// Sets request body text and refreshes editor adornments.
				function setRequestBodyContent(content) {
					requestBody.value = content;
					updateSecretReferenceState(requestBody);
					updateRequestBodyLineNumbers();
					updateRequestBodyHighlight();
				}

				// Syncs line numbers with the request body textarea.
				function updateRequestBodyLineNumbers() {
					requestBodyLines.textContent = formatLineNumbers(requestBody.value || ' ');
				}

				// Refreshes JSON or variable highlighting for the request body.
				function updateRequestBodyHighlight() {
					requestBodyEditor.classList.remove('variable-highlight');

					if (!requestBodyEditor.classList.contains('json-highlight')) {
						if (hasVariableReference(requestBody.value)) {
							requestBodyEditor.classList.add('variable-highlight');
							requestBodyHighlight.innerHTML = formatSecretHighlight(requestBody.value || ' ');
						} else {
							requestBodyHighlight.textContent = '';
						}

						return;
					}

					requestBodyHighlight.innerHTML = formatJsonHighlight(requestBody.value || ' ');
					requestBodyHighlight.scrollTop = requestBody.scrollTop;
				}

				// Converts JSON-like text into escaped syntax-highlighted HTML.
				function formatJsonHighlight(content) {
					const tokenPattern = /("(?:\\\\.|[^"\\\\])*"\\s*:?)|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?/g;
					let result = '';
					let lastIndex = 0;
					let match = tokenPattern.exec(content);

					while (match) {
						const token = match[0];
						const className = readJsonTokenClass(token);

						result += escapeHtml(content.slice(lastIndex, match.index));
						result += '<span class="' + className + '">' + escapeHtml(token) + '</span>';
						lastIndex = match.index + token.length;
						match = tokenPattern.exec(content);
					}

					result += escapeHtml(content.slice(lastIndex));

					return result;
				}

				// Chooses the highlight class for one JSON token.
				function readJsonTokenClass(token) {
					if (token.startsWith('"')) {
						return token.trimEnd().endsWith(':') ? 'json-token-key' : 'json-token-string';
					}

					if (token === 'true' || token === 'false' || token === 'null') {
						return 'json-token-literal';
					}

					return 'json-token-number';
				}

				// Escapes text before inserting it as HTML.
				function escapeHtml(content) {
					return content
						.replace(/&/g, '&amp;')
						.replace(/</g, '&lt;')
						.replace(/>/g, '&gt;');
				}

			// Sets formatted response body text and line numbers.
			function setBodyContent(content, highlightJson) {
				if (highlightJson) {
					responseBody.innerHTML = formatJsonHighlight(content);
				} else {
					responseBody.textContent = content;
				}

				responseBodyLines.textContent = formatLineNumbers(content);
			}

			// Sets raw response body text and line numbers.
			function setRawContent(content) {
				responseRaw.textContent = content;
				responseRawLines.textContent = formatLineNumbers(content);
			}

			// Formats and renders response body content based on headers.
			function setFormattedBodyContent(content, headers) {
				const formatted = formatResponseBody(content, headers);

				setBodyContent(formatted.content, formatted.highlightJson);
			}

			// Chooses formatted JSON response output when possible.
			function formatResponseBody(content, headers) {
				const jsonBody = formatJsonResponseBody(content, headers);

				if (jsonBody) {
					return {
						content: jsonBody,
						highlightJson: true,
					};
				}

				return {
					content,
					highlightJson: false,
				};
			}

			// Pretty-prints JSON responses when content type or shape supports it.
			function formatJsonResponseBody(content, headers) {
				if (!hasJsonContentType(headers) && !looksLikeJson(content)) {
					return '';
				}

				try {
					return JSON.stringify(JSON.parse(content), null, 2);
				} catch {
					return '';
				}
			}

			// Heuristically detects JSON bodies without a JSON content type.
			function looksLikeJson(content) {
				const trimmed = content.trim();

				return trimmed.startsWith('{') || trimmed.startsWith('[');
			}

			// Detects JSON response content types.
			function hasJsonContentType(headers) {
				return readHeaderValue(headers, 'Content-Type').toLowerCase().includes('json');
			}

			// Detects HTML response content types for preview rendering.
			function hasHtmlContentType(headers) {
				const contentType = readHeaderValue(headers, 'Content-Type').toLowerCase();

				return contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
			}

			// Shows or clears the sandboxed HTML response preview.
			function setPreviewContent(content, canPreview) {
				responsePreview.classList.toggle('hidden', !canPreview);
				responsePreviewEmpty.classList.toggle('hidden', canPreview);

				if (canPreview) {
					responsePreview.srcdoc = createPreviewDocument(content);
					responsePreviewEmpty.textContent = '';
					return;
				}

				responsePreview.removeAttribute('srcdoc');
				responsePreviewEmpty.textContent = 'HTML preview is available for HTML responses.';
			}

			// Builds an inert preview document that cannot load external resources or run scripts.
			function createPreviewDocument(content) {
				const previewPolicy = "default-src 'none'; script-src 'none'; form-action 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; img-src data:; style-src 'unsafe-inline';";
				const previewHead = '<meta http-equiv="Content-Security-Policy" content="' + previewPolicy + '"><style>a, button, input, select, textarea, label, summary, [role="button"], [onclick] { pointer-events: none !important; } form { pointer-events: none !important; }</style>';

				if (/<head[\\s>]/i.test(content)) {
					return content.replace(/<head([^>]*)>/i, '<head$1>' + previewHead);
				}

				return '<!DOCTYPE html><html><head>' + previewHead + '</head><body>' + content + '</body></html>';
			}

			// Returns line numbers matching the provided text content.
			function formatLineNumbers(content) {
				const lineCount = content.split('\\n').length;

				return Array.from({ length: lineCount }, (_item, index) => String(index + 1)).join('\\n');
			}

		// Renders response headers with theme-aware emphasis on each header name.
		function renderResponseHeaders(headers) {
			const entries = Object.entries(headers);
			responseHeaders.replaceChildren();

			if (entries.length === 0) {
				responseHeaders.textContent = '(none)';
				return;
			}

			entries.forEach(([name, value], index) => {
				const nameElement = document.createElement('span');
				nameElement.className = 'response-header-name';
				nameElement.textContent = name;
				responseHeaders.append(nameElement, document.createTextNode(': ' + value));

				if (index < entries.length - 1) {
					responseHeaders.append(document.createTextNode('\\n'));
				}
			});
		}

		// Formats request duration for the response metadata row.
		function formatDuration(durationMs) {
			if (durationMs < 1000) {
				return Math.round(durationMs) + ' ms';
			}

			return (durationMs / 1000).toFixed(2) + ' s';
		}

		// Formats response body byte size for the response metadata row.
		function formatResponseSize(content) {
			const bytes = new TextEncoder().encode(content).length;

			if (bytes < 1024) {
				return bytes + ' B';
			}

			if (bytes < 1024 * 1024) {
				return (bytes / 1024).toFixed(1) + ' KB';
			}

			return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
		}

		// Formats a loaded request body for the body editor.
		function formatBody(body) {
			if (typeof body === 'string') {
				return body || '(empty)';
			}

			return JSON.stringify(body, null, 2);
		}
	</script>
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
	return content
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
