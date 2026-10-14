import { RequestFileDefinition } from './types';

const requestFileExtension = '.api.json';

/**
 * Converts user input into the canonical request file name.
 *
 * The command accepts a friendly base name, but storing request definitions with
 * the `.api.json` suffix keeps them discoverable by the custom editor.
 */
export function createRequestFileName(input: string): string {
	const fileName = input.trim();

	if (!fileName) {
		throw new Error('Enter a request file name.');
	}

	if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0')) {
		throw new Error('Request file names cannot include path separators.');
	}

	if (fileName === '.' || fileName === '..') {
		throw new Error('Request file name must be a file, not a directory reference.');
	}

	return fileName.endsWith(requestFileExtension) ? fileName : `${fileName}${requestFileExtension}`;
}

/**
 * Creates the starter content for a new request definition.
 */
export function createDefaultRequestFileContent(fileName: string): string {
	const request: RequestFileDefinition = {
		name: removeRequestFileExtension(fileName),
		method: 'GET',
		url: 'https://example.com/',
		params: [],
		headerState: [],
		headers: {},
		body: null,
	};

	const { headers: _headers, ...persisted } = request;
	return `${JSON.stringify(persisted, null, '\t')}\n`;
}

/**
 * Converts a request file name back into the default display name.
 */
function removeRequestFileExtension(fileName: string): string {
	return fileName.endsWith(requestFileExtension) ? fileName.slice(0, -requestFileExtension.length) : fileName;
}
