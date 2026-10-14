import type * as vscode from 'vscode';

/** Opens an already-encoded OAuth URL without re-encoding nested query values. */
export function openOAuthBrowser(url: string, openExternal: typeof vscode.env.openExternal): Thenable<boolean> {
	// The VS Code runtime intentionally accepts a string and preserves it through
	// ExtHostWindow.openUri/MainThreadWindow.$openUri. Its public typings expose
	// only Uri. Passing a Uri instead applies encodeURI again in OpenerService,
	// corrupting encoded redirect_uri values (%3A becomes %253A).
	// https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/extHostWindow.ts
	return openExternal(url as unknown as vscode.Uri);
}
