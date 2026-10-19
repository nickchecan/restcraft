import { buttonIcons } from './buttonIcons';

export function workbenchMarkup(escapedExtensionVersion: string): string {
	return `
	<h1 class="request-title" id="request-title-container">
		<span class="request-title-text" id="request-title">RestCraft Request</span>
		<input class="request-title-input hidden" id="request-title-input" aria-label="Request title">
		<svg class="request-title-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M12 20h9"></path>
			<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
		</svg>
	</h1>
	<div class="request-description-area">
		<div class="description-display" id="description-display">
			<div id="request-description-text">Add description…</div>
			<div class="description-actions">
				<button id="request-description-edit" type="button" aria-label="Edit description" title="Edit description"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg></button>
				<button id="request-description-toggle" class="hidden" type="button" aria-expanded="false" aria-controls="request-description-text">Show more ▾</button>
			</div>
		</div>
		<textarea class="hidden" id="request-description" aria-label="Request description" rows="3" placeholder="Add description…"></textarea>
	</div>
	<div class="section-divider">
			<button class="section-collapse" id="request-collapse" type="button" aria-expanded="true" aria-controls="request-section" aria-label="Collapse request" title="Collapse request"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg></button>
			Request
		</div>
	<div id="request-section">
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
		<button id="send" type="submit" disabled title="Checking workspace trust...">${buttonIcons.send}<span>Send</span></button>
		</form>
		<section class="request-panel" aria-label="Request configuration area">
			<div class="request-tabs-toolbar">
			<div class="request-tabs" role="tablist" aria-label="Request sections">
				<button class="request-tab active" id="request-params-tab" type="button" role="tab" aria-selected="true" aria-controls="request-params-panel">Params <span class="request-tab-count" hidden></span></button>
				<button class="request-tab" id="request-authorization-tab" type="button" role="tab" aria-selected="false" aria-controls="request-authorization-panel">Authorization</button>
				<button class="request-tab" id="request-headers-tab" type="button" role="tab" aria-selected="false" aria-controls="request-headers-panel">Headers <span class="request-tab-count" hidden></span></button>
				<button class="request-tab" id="request-body-tab" type="button" role="tab" aria-selected="false" aria-controls="request-body-panel">Body</button>
				<button class="request-tab" id="request-automation-tab" type="button" role="tab" aria-selected="false" aria-controls="request-automation-panel">Automations <span class="request-tab-count" hidden></span></button>
				<button class="request-tab" id="request-settings-tab" type="button" role="tab" aria-selected="false" aria-controls="request-settings-panel">Settings</button>
			</div>
			<button class="section-collapse" id="request-config-collapse" type="button" aria-expanded="true" aria-controls="request-config-content" aria-label="Collapse request configuration" title="Collapse request configuration"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg></button>
			</div>
			<div id="request-config-content">
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
				<button class="request-header-add" id="add-request-param" type="button">${buttonIcons.add}<span>Add Param</span></button>
			</div>
			<div class="request-panel-content hidden" id="request-authorization-panel" role="tabpanel" aria-labelledby="request-authorization-tab">
				<div class="authorization-layout" id="authorization-layout">
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
                    <label class="oauth-code-field hidden" for="oauth-redirect-url">Redirect URL</label>
                    <div class="authorization-secret-control oauth-code-field hidden">
                        <input class="authorization-input" id="oauth-redirect-url" type="text" readonly placeholder="Preparing callback URL…">
                        <button id="oauth-copy-redirect" type="button" disabled>${buttonIcons.copy}<span>Copy</span></button>
                    </div>
                    <label class="oauth-code-field hidden" for="oauth-authorization-url">Authorization URL</label>
                    <input class="authorization-input oauth-code-field hidden" id="oauth-authorization-url" type="text" autocomplete="off">
					<label class="oauth-client-field hidden" for="oauth-url">Access Token URL</label>
					<input class="authorization-input oauth-client-field hidden" id="oauth-url" type="text" autocomplete="off">
                    <label class="oauth-code-field hidden" for="oauth-client-authentication">Client Authentication</label>
                    <select class="oauth-code-field hidden" id="oauth-client-authentication">
                        <option value="none">None (public client)</option>
                        <option value="basic">HTTP Basic</option>
                        <option value="body">Send credentials in body</option>
                    </select>
					<label class="oauth-client-field hidden" for="oauth-client-id">Client ID</label>
					<input class="authorization-input oauth-client-field hidden" id="oauth-client-id" type="text" autocomplete="off">
					<label class="oauth-client-field hidden" for="oauth-client-secret">Client Secret</label>
					<div class="authorization-secret-control oauth-client-field hidden">
						<input class="authorization-input" id="oauth-client-secret" type="password" autocomplete="off">
						<button id="oauth-secret-toggle" type="button" aria-controls="oauth-client-secret" aria-label="Show client secret" aria-pressed="false">${buttonIcons.eye}<span>Show</span></button>
					</div>
					<label class="oauth-client-field hidden" for="oauth-scope">Scope</label>
					<input class="authorization-input oauth-client-field hidden" id="oauth-scope" type="text" autocomplete="off">
                    <label class="oauth-code-field hidden" for="oauth-state">State</label>
                    <div class="authorization-secret-control oauth-code-field hidden">
                        <input class="authorization-input" id="oauth-state" type="text" autocomplete="off" spellcheck="false">
                        <button id="oauth-generate-state" type="button" aria-label="Generate a new state">${buttonIcons.wand}<span>Generate</span></button>
                    </div>
                    <label class="oauth-code-field hidden" for="oauth-pkce">Use PKCE</label>
                    <input class="oauth-code-field hidden" id="oauth-pkce" type="checkbox" checked aria-describedby="oauth-pkce-description">
                    <span class="oauth-code-field oauth-storage-description hidden" id="oauth-pkce-description">Uses S256 with a new verifier for each authorization attempt.</span>
					<div class="authorization-divider oauth-client-field hidden" role="separator" aria-hidden="true"></div>
					<label class="oauth-client-field hidden" for="oauth-update-header">Update header</label>
					<input class="oauth-client-field hidden" id="oauth-update-header" type="checkbox" aria-describedby="oauth-update-header-description" checked>
					<span class="oauth-client-field oauth-storage-description hidden" id="oauth-update-header-description">Getting a new access token will update the Authorization header value.</span>
					<label class="oauth-client-field hidden" for="oauth-store-token">Save token to .env</label>
					<input class="oauth-client-field hidden" id="oauth-store-token" type="checkbox" aria-describedby="oauth-store-token-description">
					<span class="oauth-client-field oauth-storage-description hidden" id="oauth-store-token-description">Save each retrieved token to the selected environment variable.</span>
					<label class="oauth-storage-field hidden" for="oauth-token-variable">Variable Name</label>
					<input class="authorization-input oauth-storage-field hidden" id="oauth-token-variable" aria-describedby="oauth-token-variable-description" type="text" value="ACCESS_TOKEN" placeholder="ACCESS_TOKEN" autocomplete="off" spellcheck="false">
					<span class="oauth-storage-field oauth-storage-description hidden" id="oauth-token-variable-description">If this variable does not exist, it will be created in .env when you get a new access token.</span>
                    <div class="oauth-token-actions oauth-client-field hidden">
                        <button id="oauth-get-token" type="button">${buttonIcons.key}<span>Get new access token</span></button>
                        <button class="request-cancel" id="oauth-cancel-token" type="button" disabled>Cancel</button>
                    </div>
					<span class="oauth-client-field hidden" id="oauth-status" role="status" aria-live="polite"></span>
					<label class="bearer-authorization-field hidden" for="bearer-token">Token</label>
					<input class="authorization-input bearer-authorization-field hidden" id="bearer-token" name="bearer-token" type="text" autocomplete="off">
					<label class="basic-authorization-field hidden" for="basic-auth-username">Username</label>
					<input class="authorization-input basic-authorization-field hidden" id="basic-auth-username" name="basic-auth-username" type="text" autocomplete="off">
					<label class="basic-authorization-field hidden" for="basic-auth-password">Password</label>
					<div class="authorization-secret-control basic-authorization-field hidden">
						<input class="authorization-input" id="basic-auth-password" name="basic-auth-password" type="password" autocomplete="off">
						<button id="basic-password-toggle" type="button" aria-controls="basic-auth-password" aria-label="Show password" aria-pressed="false">${buttonIcons.eye}<span>Show</span></button>
					</div>
				</div>
				<div class="oauth-token-panel hidden" id="oauth-token-panel">
                    <div class="authorization-resizer" id="authorization-resizer" role="separator" tabindex="0" aria-label="Resize authorization inputs and token output" aria-orientation="vertical" aria-controls="authorization-layout" title="Drag or use arrow keys to resize. Double-click to reset."></div>
					<div class="oauth-token-options" role="group" aria-label="Access token views">
						<label><input id="oauth-raw-option" type="radio" name="oauth-token-view" value="raw" aria-controls="oauth-raw-panel" checked> Access Token</label>
						<label><input id="oauth-decoded-option" type="radio" name="oauth-token-view" value="decoded" aria-controls="oauth-decoded-panel"> Decoded Token</label>
						<label><input id="oauth-hidden-option" type="radio" name="oauth-token-view" value="hidden"> Hidden</label>
					</div>
					<div class="oauth-token-content" id="oauth-raw-panel" role="region" aria-label="Access Token">
						<textarea id="oauth-access-token" readonly spellcheck="false" aria-label="OAuth access token" placeholder="No access token configured."></textarea>
					</div>
					<div class="oauth-token-content hidden" id="oauth-decoded-panel" role="region" aria-label="Decoded Token">
						<p>JWT header and payload. Signature is not verified.</p>
						<pre class="response-content" id="oauth-decoded-token" tabindex="0" aria-label="Decoded OAuth access token">No access token configured.</pre>
					</div>
                    <button id="oauth-copy-token" type="button" disabled aria-label="Copy access token">${buttonIcons.copy}<span>Copy Access Token</span></button>
				</div>
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
				<button class="request-header-add" id="add-request-header" type="button">${buttonIcons.add}<span>Add Header</span></button>
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
					<button class="request-header-add" id="add-request-body-form-row" type="button">${buttonIcons.add}<span>Add Pair</span></button>
				</div>
			</div>
			<div class="request-panel-content hidden" id="request-automation-panel" role="tabpanel" aria-labelledby="request-automation-tab">
				<p>After each completed request, copy response headers to the selected .env file. Header names are case-insensitive. Missing headers leave variables unchanged. All HTTP status codes apply.</p>
				<table class="request-headers-table" aria-label="Response header automation">
					<thead><tr><th scope="col"><span class="sr-only">Enabled</span></th><th scope="col">Response header</th><th scope="col">Environment variable</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
					<tbody id="automation-rows"></tbody>
				</table>
				<button class="request-header-add" id="automation-add" type="button">${buttonIcons.add}<span>Add Mapping</span></button>
			</div>
			<div class="request-panel-content hidden" id="request-settings-panel" role="tabpanel" aria-labelledby="request-settings-tab">
				<div class="request-env-options" role="group" aria-label="Environment file selection">
					<label><input id="request-env-nearest" type="radio" name="request-env-mode" value="nearest" checked> Use nearest .env</label>
					<label><input id="request-env-manual" type="radio" name="request-env-mode" value="manual"> Set up .env manually</label>
				</div>
				<div class="request-env-row">
					<label for="request-env-path">Environment File</label>
					<input id="request-env-path" type="text" readonly aria-label="Environment file path">
					<button id="request-env-choose" class="hidden" type="button">${buttonIcons.folder}<span>Browse…</span></button>
					<button id="request-env-open" type="button" disabled>${buttonIcons.linkExternal}<span>Open</span></button>
				</div>
				<div id="request-env-error" role="status" aria-live="polite"></div>
                <label class="request-auto-authorize" for="request-authorize-before-send">
                    <input id="request-authorize-before-send" type="checkbox" aria-describedby="request-auto-authorize-description">
                    Authorize before sending
                </label>
                <p class="request-auto-authorize-description" id="request-auto-authorize-description">Get a new OAuth 2.0 access token before sending this request. Uses the Update header and Save token to .env options.</p>


			</div>
			</div>
		</section>
		</div>
		<div class="section-divider response-divider">
			<button class="section-collapse" id="response-collapse" type="button" aria-expanded="true" aria-controls="response-section" aria-label="Collapse response" title="Collapse response"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg></button>
			Response
		</div>
		<section class="response-panel" id="response-section" aria-label="Response area">
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
					<div class="stream-events hidden" id="stream-events">
						<div class="stream-tools">
							<button type="button" id="stream-expand">Expand all</button>
							<button type="button" id="stream-collapse">Collapse all</button>
							<span id="stream-count" aria-live="polite"></span>
						</div>
						<div id="stream-event-list"></div>
					</div>
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
			<button class="editor-footer-icon" id="footer-history-button" type="button" aria-label="Open RestCraft network history" title="Open RestCraft network history">
				<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M3 11a9 9 0 1 1 2.7 7.4"></path>
					<path d="M3 4v7h7"></path>
					<path d="M12 7v5l3 2"></path>
				</svg>
			</button>
			<button class="editor-footer-icon" id="footer-log-button" type="button" aria-label="Open RestCraft log console" title="Open RestCraft log console">
                ${buttonIcons.debugConsole}
            </button>
			<span class="editor-footer-separator" aria-hidden="true"></span>
			<button class="editor-footer-icon" id="footer-repository-link" type="button" aria-label="Open RestCraft repository" title="Open RestCraft repository">
				<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
					<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.6 7.6 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path>
				</svg>
			</button>
			<button class="editor-footer-icon" id="footer-x-link" type="button" aria-label="Open Nick Checan on X" title="Nick Checan on X">
				<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
					<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
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

	`;
}
