import { isRecord } from '../shared/object';
import { ResponseHeaderMapping } from './types';
import { updateEnvValue } from './environment';

/** Validates persisted mappings and untrusted webview messages, including unfinished editor rows. */
export function isResponseHeaderMappings(value: unknown): value is ResponseHeaderMapping[] {
	return (
		Array.isArray(value) &&
		value.every(
			(row) =>
				isRecord(row) &&
				typeof row.header === 'string' &&
				(row.header === '' || /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(row.header)) &&
				typeof row.variable === 'string' &&
				(row.variable === '' || /^[A-Za-z_][A-Za-z0-9_]*$/.test(row.variable)) &&
				typeof row.enabled === 'boolean',
		)
	);
}

/** Collects present headers, validating every value before any environment write. */
export function responseHeaderAssignments(
	mappings: ResponseHeaderMapping[],
	headers: Record<string, string>,
): Record<string, string> {
	const values: Record<string, string> = Object.create(null);
	for (const row of mappings) {
		if (!row.enabled || !row.header || !row.variable) {
			continue;
		}
		const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === row.header.toLowerCase());
		if (entry) {
			updateEnvValue('', row.variable, entry[1]);
			values[row.variable] = entry[1];
		}
	}
	return values;
}
