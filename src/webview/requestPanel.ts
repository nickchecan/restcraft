import * as vscode from 'vscode';

import { createUpdatedRequestDocumentText } from './requestDocument';
import { RequestFileDefinition } from '../request/types';
import { executeRequestWithEnvironment, findDefinedEnvironmentVariables, initializeRequestWebview, loadRequestInWebview, resolveEnvironmentVariable, RequestChangedMessage } from './requestWebview';

/**
 * Singleton API Workbench panel used by the `restcraft.openApiWorkbench` command.
 *
 * The panel can be opened empty or loaded from a `.api.json` file. When a file
 * is loaded, its URI is retained so request execution can resolve sibling `.env`
 * variables.
 */
export class ApiWorkbenchPanel {
	private static currentPanel: ApiWorkbenchPanel | undefined;

	private readonly panel: vscode.WebviewPanel;
	private requestUri: vscode.Uri | undefined;
	private documentWrites: Promise<void> = Promise.resolve();

	/**
	 * Creates the panel wrapper and connects request execution callbacks.
	 */
	private constructor(panel: vscode.WebviewPanel, extensionVersion: string) {
		this.panel = panel;
		initializeRequestWebview(this.panel.webview, {
			extensionVersion,
			onRequestChanged: (message) => {
				const requestUri = this.requestUri;
				if (!requestUri) { return; }
				this.documentWrites = this.documentWrites.then(() => this.updateRequestDocument(requestUri, message)).catch(error => {
					void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Unable to update request file.');
				});
			},
			onGetRequestUri: () => this.requestUri,
			onSendRequest: (message, signal) => executeRequestWithEnvironment(message, this.requestUri, signal),
			onResolveEnvironmentVariable: (name) => resolveEnvironmentVariable(name, this.requestUri),
			onCheckEnvironmentVariables: (names) => findDefinedEnvironmentVariables(names, this.requestUri),
		});

		this.panel.onDidDispose(() => {
			ApiWorkbenchPanel.currentPanel = undefined;
		});
	}

	/** Updates the loaded request through VS Code so edits participate in save and undo. */
	private async updateRequestDocument(uri: vscode.Uri, message: RequestChangedMessage): Promise<void> {
		const document = await vscode.workspace.openTextDocument(uri);
		const content = document.getText();
		const nextText = createUpdatedRequestDocumentText(content, message, document.eol === vscode.EndOfLine.CRLF);
		if (content === nextText) { return; }
		const edit = new vscode.WorkspaceEdit();
		edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(content.length)), nextText);
		if (!await vscode.workspace.applyEdit(edit)) { throw new Error('Unable to update request file.'); }
	}

	/**
	 * Reveals the existing workbench panel or creates it on first use.
	 */
	public static createOrShow(extensionUri: vscode.Uri, extensionVersion: string): ApiWorkbenchPanel {
		if (ApiWorkbenchPanel.currentPanel) {
			ApiWorkbenchPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
			return ApiWorkbenchPanel.currentPanel;
		}

		const panel = vscode.window.createWebviewPanel(
			'apiWorkbench',
			'API Workbench',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [extensionUri],
			},
		);

		ApiWorkbenchPanel.currentPanel = new ApiWorkbenchPanel(panel, extensionVersion);
		return ApiWorkbenchPanel.currentPanel;
	}

	/**
	 * Loads a request into the workbench and remembers its source URI.
	 */
	public async loadRequest(request: RequestFileDefinition, requestUri?: vscode.Uri): Promise<void> {
		this.requestUri = requestUri;
		await loadRequestInWebview(this.panel.webview, request);
	}
}
