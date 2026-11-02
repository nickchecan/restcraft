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
 * Pass `query` to replace the query string; omit it to keep the URL's query.
 * Origins that are not absolute until substitution, such as `{{baseUrl}}/v1`,
 * are returned unchanged when substitution would produce an http(s) URL.
 */
export function serializeRequestUrl(
	url: string,
	query: ReadonlyArray<readonly [string, string]> | undefined,
	requireHttp: boolean,
): SerializedRequestUrl {
	const tokens = new Map<string, string>();
	const shield = (value: string): string =>
		value.replace(/\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/g, (match) => {
			let token = `rc${tokens.size}var`;
			while (value.includes(token) || tokens.has(token)) {
				token += 'x';
			}
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

	let parsed: URL;
	try {
		parsed = new URL(shield(url));
	} catch {
		if (query === undefined && isSubstitutableHttpUrl(url)) {
			return { url };
		}
		return { error: 'invalid' };
	}

	if (requireHttp && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return { error: 'protocol' };
	}

	if (query !== undefined) {
		parsed.search = '';
		for (const [name, value] of query) {
			parsed.searchParams.append(shield(name), shield(value));
		}
	}

	return { url: restore(parsed.toString()) };
}
