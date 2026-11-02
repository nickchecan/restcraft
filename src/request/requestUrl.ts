export interface SerializedRequestUrl {
	url?: string;
	error?: 'invalid' | 'protocol';
}

/**
 * Canonicalizes a request URL without changing `{{variable}}` names.
 *
 * `URL` serialization lowercases the host and percent-encodes braces in paths
 * and in query values assigned through `searchParams`. Placeholders are swapped
 * for stable lowercase tokens around that step and written back exactly.
 * The token is chosen from the lowercased URL and query text, because host
 * canonicalization lowercases literals before those tokens are restored.
 * Pass `query` to replace the query string; omit it to keep the URL's query.
 * Origins that are not absolute until substitution, such as `{{baseUrl}}/v1`,
 * are parsed against a fixed stand-in origin when the query is being rebuilt,
 * then the stand-in is removed. With no query replacement, that original text
 * is returned unchanged when substitution would produce an http(s) URL.
 */
export function serializeRequestUrl(
	url: string,
	query: ReadonlyArray<readonly [string, string]> | undefined,
	requireHttp: boolean,
): SerializedRequestUrl {
	const tokens = new Map<string, string>();
	const haystack = [url, ...(query ?? []).flatMap(([name, value]) => [name, value])].join('\n').toLowerCase();
	let serial = 0;
	const shield = (value: string): string =>
		value.replace(/\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/g, (match) => {
			let token = '';
			do {
				token = `rc${serial}var`;
				serial += 1;
			} while (haystack.includes(token) || tokens.has(token));
			tokens.set(token, match);
			return token;
		});
	const restore = (value: string): string => {
		const ordered = [...tokens.entries()].sort((left, right) => right[0].length - left[0].length);
		return ordered.reduce((current, [token, original]) => current.split(token).join(original), value);
	};

	const isSubstitutableHttpUrl = (value: string): boolean => {
		const substituted = value.replace(/\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/g, 'https://placeholder.invalid');
		if (substituted === value) {
			return false;
		}
		try {
			const candidate = new URL(substituted);
			return candidate.protocol === 'http:' || candidate.protocol === 'https:';
		} catch {
			return false;
		}
	};

	// Kept inside this function so the webview copy does not close over module state.
	const standInOrigin = 'https://rc-base.invalid/';
	const shieldedUrl = shield(url);
	let parsed: URL;
	let relative = false;
	try {
		parsed = new URL(shieldedUrl);
	} catch {
		const placeholderOrigin = [...tokens.keys()].some((token) => shieldedUrl.startsWith(token));
		if (!placeholderOrigin || query === undefined) {
			if (query === undefined && isSubstitutableHttpUrl(url)) {
				return { url };
			}
			return { error: 'invalid' };
		}
		try {
			parsed = new URL(shieldedUrl, standInOrigin);
		} catch {
			return { error: 'invalid' };
		}
		relative = true;
	}

	if (!relative && requireHttp && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return { error: 'protocol' };
	}

	if (query !== undefined) {
		parsed.search = '';
		for (const [name, value] of query) {
			parsed.searchParams.append(shield(name), shield(value));
		}
	}

	let serialized = parsed.toString();
	if (relative) {
		if (!serialized.startsWith(standInOrigin)) {
			return { error: 'invalid' };
		}
		serialized = serialized.slice(standInOrigin.length);
	}
	return { url: restore(serialized) };
}

/**
 * Reads query pairs from a request URL, including one whose origin is still a
 * `{{variable}}`. Those values are not absolute, so they are parsed against the
 * same stand-in origin used when rebuilding their query string.
 */
export function readQueryParamsFromUrl(url: string): Array<[string, string]> {
	const standInOrigin = 'https://rc-base.invalid/';
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		if (!/^\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/.test(url)) {
			return [];
		}
		try {
			parsed = new URL(url, standInOrigin);
		} catch {
			return [];
		}
	}
	return Array.from(parsed.searchParams.entries());
}
