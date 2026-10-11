import * as vscode from 'vscode';

import { RequestFileDefinition } from '../request/types';
import { executeRequestWithEnvironment, findDefinedEnvironmentVariables, initializeRequestWebview, loadRequestInWebview, resolveEnvironmentVariable } from './requestWebview';

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

	/**
	 * Creates the panel wrapper and connects request execution callbacks.
	 */
	private constructor(panel: vscode.WebviewPanel, extensionVersion: string) {
		this.panel = panel;
		initializeRequestWebview(this.panel.webview, {
			extensionVersion,
			onSendRequest: (message, signal) => executeRequestWithEnvironment(message, this.requestUri, signal),
			onResolveEnvironmentVariable: (name) => resolveEnvironmentVariable(name, this.requestUri),
			onCheckEnvironmentVariables: (names) => findDefinedEnvironmentVariables(names, this.requestUri),
		});

		this.panel.onDidDispose(() => {
			ApiWorkbenchPanel.currentPanel = undefined;
		});
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
