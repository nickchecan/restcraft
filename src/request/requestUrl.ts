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
 * The token is chosen from the lowercased raw and percent-decoded URL and query
 * text, because host parsing decodes and lowercases literals before restore.
 * Pass `query` to replace the query string; omit it to keep the URL's query.
 * A URL whose origin is still a `{{variable}}` is not parsed as a path: `..`
 * would remove that variable, and `{{baseUrl}}:8080` would be read as a scheme.
 * Only the query is rebuilt. The text before `?` and any `#` fragment stay as written.
 */
export function serializeRequestUrl(
	url: string,
	query: ReadonlyArray<readonly [string, string]> | undefined,
	requireHttp: boolean,
): SerializedRequestUrl {
	const trimmed = url.trim();
	const tokens = new Map<string, string>();
	const parts = [trimmed, ...(query ?? []).flatMap(([name, value]) => [name, value])];
	// Host parsing percent-decodes and applies IDNA before restore. A stray `%`
	// makes decodeURIComponent throw for the whole string, so also record the
	// URL the parser would actually serialize after placeholders are removed.
	let normalized = '';
	try {
		normalized = new URL(trimmed.replace(/\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/g, '')).href;
	} catch {
		normalized = '';
	}
	const haystack = parts
		.flatMap((part) => {
			try {
				return [part, decodeURIComponent(part)];
			} catch {
				return [part];
			}
		})
		.concat(normalized)
		.join('\n')
		.toLowerCase();
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
	const replaceQuery = (value: string): string => {
		const hashIndex = value.indexOf('#');
		const hash = hashIndex === -1 ? '' : value.slice(hashIndex);
		const beforeHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
		const queryIndex = beforeHash.indexOf('?');
		const before = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
		const params = new URLSearchParams();
		for (const [name, item] of query ?? []) {
			params.append(shield(name), shield(item));
		}
		const search = restore(params.toString());
		return before + (search ? `?${search}` : '') + hash;
	};

	const shieldedUrl = shield(trimmed);
	// A leading token is the unresolved origin, not an absolute URL.
	if ([...tokens.keys()].some((token) => shieldedUrl.startsWith(token))) {
		// A variable port such as {{host}}:{{port}} is not a valid URL yet.
		// Reject that only when storing the URL. Query rows are still edited
		// from the text, so rebuild the query instead of leaving disabled rows in place.
		if (query === undefined && !isSubstitutableHttpUrl(trimmed)) {
			return { error: 'invalid' };
		}
		return { url: query === undefined ? trimmed : replaceQuery(trimmed) };
	}

	let parsed: URL;
	try {
		parsed = new URL(shieldedUrl);
	} catch {
		// Query rows are read from the text even when the URL is not absolute.
		// Rebuild that query without requiring the parser to accept the rest.
		if (query !== undefined) {
			return { url: replaceQuery(trimmed) };
		}
		if (isSubstitutableHttpUrl(trimmed)) {
			return { url: trimmed };
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

/**
 * Reads query pairs from a request URL.
 *
 * The query is taken from the text before `#` and after the first `?`, so a
 * `{{variable}}` origin, a port after that variable, or `..` in the path is
 * not resolved away. Surrounding whitespace is ignored, matching file parsing.
 */
export function readQueryParamsFromUrl(url: string): Array<[string, string]> {
	const trimmed = url.trim();
	const hashIndex = trimmed.indexOf('#');
	const beforeHash = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
	const queryIndex = beforeHash.indexOf('?');
	if (queryIndex === -1) {
		return [];
	}
	return Array.from(new URLSearchParams(beforeHash.slice(queryIndex + 1)).entries());
}
