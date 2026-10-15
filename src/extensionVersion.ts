export interface ExtensionPackageJson {
	version?: unknown;
}

/**
 * Returns the package version used in webview footer UI.
 *
 * VS Code exposes package metadata as untyped data, so this helper validates the
 * field before using it and falls back to a stable placeholder during tests or
 * malformed extension metadata.
 */
export function readPackageVersion(packageJson: ExtensionPackageJson): string {
	return typeof packageJson.version === 'string' && packageJson.version.trim() ? packageJson.version : '0.0.0';
}
