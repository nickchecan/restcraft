import * as vscode from 'vscode';

export interface RedirectUriInfo {
	/** Exact string used for display, the authorize `redirect_uri`, and the token `redirect_uri`. */
	readonly uri: string;
	/** True on desktop (fixed, registrable). False on web, where asExternalUri changes per request. */
	readonly stable: boolean;
}

/** Desktop redirect with no query, fragment, or trailing slash. `asExternalUri` would append `windowId`. */
export function buildDesktopRedirectUri(uriScheme: string, extensionId: string): string {
	return `${uriScheme}://${extensionId}/oauth/callback`;
}

/** Desktop skips `asExternalUri`. Web keeps it, so the returned URI changes per request. */
export async function getRedirectUri(
	env: Pick<typeof vscode.env, 'uiKind' | 'uriScheme' | 'asExternalUri'>,
	extensionId: string,
): Promise<RedirectUriInfo> {
	const uri = buildDesktopRedirectUri(env.uriScheme, extensionId);
	if (env.uiKind === vscode.UIKind.Desktop) {
		return { uri, stable: true };
	}
	const external = await env.asExternalUri(vscode.Uri.parse(uri));
	return { uri: external.toString(true), stable: false };
}
