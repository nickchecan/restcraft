import { isRecord } from '../shared/object';

/**
 * Two-letter Explorer badges for request methods, including QUERY.
 *
 * QUERY is decorated when a file contains it, but it is not a method the
 * request editor can author. Unknown methods produce no badge.
 */
const methodBadges: Readonly<Record<string, string>> = {
	GET: 'GT',
	POST: 'PO',
	PUT: 'PU',
	DELETE: 'DE',
	QUERY: 'QU',
	PATCH: 'PA',
	HEAD: 'HE',
	OPTIONS: 'OP',
};

/** Theme color contributed for each decorated method. */
export function methodColorId(method: string): string {
	return `restcraft.method.${method.toLowerCase()}`;
}

export interface MethodDecoration {
	method: string;
	badge: string;
	colorId: string;
}

/**
 * Reads a top-level method from request-file text.
 *
 * Invalid JSON, a missing method, and an unknown method return no decoration.
 * Callers must not surface those cases as errors.
 */
export function readMethodDecoration(content: string): MethodDecoration | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return undefined;
	}

	if (!isRecord(parsed) || typeof parsed.method !== 'string') {
		return undefined;
	}

	const method = parsed.method.trim().toUpperCase();
	const badge = methodBadges[method];
	if (!badge) {
		return undefined;
	}

	return {
		method,
		badge,
		colorId: methodColorId(method),
	};
}

/** Methods that receive a badge and a contributed color, in display order. */
export const decoratedMethods: readonly string[] = Object.keys(methodBadges);
