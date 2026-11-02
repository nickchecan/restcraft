import { isRecord } from '../shared/object';
import { AutomationMapping, AutomationType } from './types';
import { updateEnvValue } from './environment';

const headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const variableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Dot path with array indexes, for example `data.items[0].id`. */
export const jsonPathPattern =
	/^(?:\[(?:0|[1-9][0-9]*)\]|[A-Za-z_][A-Za-z0-9_]*(?:\[(?:0|[1-9][0-9]*)\])*)(?:\.(?:\[(?:0|[1-9][0-9]*)\]|[A-Za-z_][A-Za-z0-9_]*(?:\[(?:0|[1-9][0-9]*)\])*))*$/;

type JsonPathStep = { kind: 'key'; key: string } | { kind: 'index'; index: number };

function parseJsonPath(path: string): JsonPathStep[] | undefined {
	if (!jsonPathPattern.test(path)) {
		return undefined;
	}

	const steps: JsonPathStep[] = [];
	for (const segment of path.split('.')) {
		let rest = segment;
		if (!rest.startsWith('[')) {
			const key = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
			if (!key) {
				return undefined;
			}
			steps.push({ kind: 'key', key: key[0] });
			rest = rest.slice(key[0].length);
		}
		while (rest.startsWith('[')) {
			const index = /^\[(0|[1-9][0-9]*)\]/.exec(rest);
			if (!index) {
				return undefined;
			}
			const value = Number(index[1]);
			if (!Number.isSafeInteger(value)) {
				return undefined;
			}
			steps.push({ kind: 'index', index: value });
			rest = rest.slice(index[0].length);
		}
		if (rest) {
			return undefined;
		}
	}

	return steps.length > 0 ? steps : undefined;
}

function readJsonPath(root: unknown, path: string): { found: true; value: unknown } | undefined {
	const steps = parseJsonPath(path);
	if (!steps) {
		return undefined;
	}

	let current = root;
	for (const step of steps) {
		if (step.kind === 'key') {
			if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, step.key)) {
				return undefined;
			}
			current = current[step.key];
			continue;
		}
		if (!Array.isArray(current) || step.index >= current.length) {
			return undefined;
		}
		current = current[step.index];
	}

	return { found: true, value: current };
}

function formatJsonValue(value: unknown): string | undefined {
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' && Number.isFinite(value)) {
		return String(value);
	}
	if (typeof value === 'boolean' || value === null) {
		return String(value);
	}
	if (Array.isArray(value) || isRecord(value)) {
		return JSON.stringify(value);
	}
	return undefined;
}

function isAutomationType(value: unknown): value is AutomationType {
	return value === 'header' || value === 'json' || value === 'raw';
}

function attributeIsValid(type: AutomationType | undefined, header: string): boolean {
	if (header === '' || type === 'raw') {
		return true;
	}
	if (type === 'json') {
		return parseJsonPath(header) !== undefined;
	}
	return headerNamePattern.test(header);
}

function isAutomationMapping(value: unknown): value is AutomationMapping {
	if (
		!isRecord(value) ||
		typeof value.header !== 'string' ||
		typeof value.variable !== 'string' ||
		typeof value.enabled !== 'boolean'
	) {
		return false;
	}
	if (value.type !== undefined && !isAutomationType(value.type)) {
		return false;
	}
	if (value.variable !== '' && !variableNamePattern.test(value.variable)) {
		return false;
	}
	return attributeIsValid(isAutomationType(value.type) ? value.type : undefined, value.header);
}

/** Validates persisted mappings and untrusted webview messages, including unfinished editor rows. */
export function isAutomationMappings(value: unknown): value is AutomationMapping[] {
	return Array.isArray(value) && value.every((row) => isAutomationMapping(row));
}

/** Header rows omit `type` so existing automation files stay unchanged. */
export function automationForPersistence(mappings: AutomationMapping[]): AutomationMapping[] {
	return mappings.map((row) => {
		if (row.type === 'json' || row.type === 'raw') {
			return { enabled: row.enabled, type: row.type, header: row.header, variable: row.variable };
		}
		return { enabled: row.enabled, header: row.header, variable: row.variable };
	});
}

function parseJsonBody(body: string): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(body) as unknown };
	} catch {
		return { ok: false };
	}
}

function readAutomationValue(
	type: AutomationType,
	attribute: string,
	response: { headers: Record<string, string>; body: string },
	jsonBody: { ok: true; value: unknown } | { ok: false },
): string | undefined {
	if (type === 'raw') {
		return response.body;
	}
	if (!attribute) {
		return undefined;
	}
	if (type === 'header') {
		const entry = Object.entries(response.headers).find(([name]) => name.toLowerCase() === attribute.toLowerCase());
		return entry?.[1];
	}
	if (!jsonBody.ok) {
		return undefined;
	}
	const found = readJsonPath(jsonBody.value, attribute);
	return found ? formatJsonValue(found.value) : undefined;
}

/** Collects values for enabled rows, validating every value before any environment write. */
export function automationAssignments(
	mappings: AutomationMapping[],
	response: { headers: Record<string, string>; body: string },
): Record<string, string> {
	const values: Record<string, string> = Object.create(null);
	let jsonBody: { ok: true; value: unknown } | { ok: false } | undefined;
	for (const row of mappings) {
		if (!row.enabled || !row.variable) {
			continue;
		}
		if ((row.type ?? 'header') === 'json' && !jsonBody) {
			jsonBody = parseJsonBody(response.body);
		}
		const value = readAutomationValue(row.type ?? 'header', row.header, response, jsonBody ?? { ok: false });
		if (value === undefined) {
			continue;
		}
		updateEnvValue('', row.variable, value);
		values[row.variable] = value;
	}
	return values;
}
