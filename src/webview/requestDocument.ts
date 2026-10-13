import { headersForPersistence, readOAuthAuthorization } from '../request/oauth';
import { copyEnvironmentFileSettings } from '../request/environmentSettings';
import { isRecord } from '../shared/object';
import type { RequestChangedMessage } from './requestWebview';

/** Serializes editor changes consistently for custom editors and loaded workbench panels. */
export function createUpdatedRequestDocumentText(content: string, message: RequestChangedMessage, useCrLf = false): string {
		const parsed = readDocumentObject(content);

		parsed.name = message.name.trim() || 'Untitled Request';
		parsed.method = message.method;
		parsed.url = message.url;
		parsed.params = message.params;
		delete parsed.defaultTokenView;
		if (message.environment) { parsed.environment = copyEnvironmentFileSettings(message.environment); }
		else { delete parsed.environment; }
		const persisted = headersForPersistence(message.headers, message.headerState, message.authorization);
		parsed.headerState = persisted.headerState;
		delete parsed.headers;
		if (message.authorization) {
			parsed.authorization = readOAuthAuthorization(message.authorization);
		} else {
			delete parsed.authorization;
		}
		parsed.body = message.body.trim() ? readBodyValue(message.body) : null;

		const serialized = `${JSON.stringify(parsed, null, 2)}\n`;
		// applyEdit uses the document's line endings; the pending-text check
		// must compare against the same representation for CRLF files too.
		return useCrLf ? serialized.replace(/\n/g, '\r\n') : serialized;
}

/**
 * Preserves valid JSON body values and falls back to raw text.
 */
function readBodyValue(body: string): unknown {
	try {
		return JSON.parse(body);
	} catch {
		return body;
	}
}


function readDocumentObject(content: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(content);
		if (isRecord(parsed)) { return parsed; }
	} catch { /* An unfinished document is replaced with the current editor state. */ }
	return {};
}
