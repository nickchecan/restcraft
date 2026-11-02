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

/**
 * Reads the original digits for an integer JSON.parse cannot keep.
 *
 * Values above 2^53 are rounded before a reviver runs, so the token is taken
 * from the raw body instead.
 */
function rawIntegerText(source: string, path: string): string | undefined {
	const steps = parseJsonPath(path);
	if (!steps) {
		return undefined;
	}
	let index = 0;
	const length = source.length;
	const skipSpace = () => {
		while (index < length) {
			const character = source[index];
			if (character !== ' ' && character !== '\n' && character !== '\r' && character !== '\t') {
				break;
			}
			index++;
		}
	};
	const readString = (): string | undefined => {
		if (source[index] !== '"') {
			return undefined;
		}
		index++;
		let text = '';
		while (index < length) {
			const character = source[index++];
			if (character === '"') {
				return text;
			}
			if (character !== '\\') {
				text += character;
				continue;
			}
			const escaped = source[index++];
			if (escaped === 'u') {
				const hex = source.slice(index, index + 4);
				if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
					return undefined;
				}
				text += String.fromCharCode(Number.parseInt(hex, 16));
				index += 4;
			} else if (escaped === '"' || escaped === '\\' || escaped === '/') {
				text += escaped;
			} else if (escaped === 'n') {
				text += '\n';
			} else if (escaped === 'r') {
				text += '\r';
			} else if (escaped === 't') {
				text += '\t';
			} else if (escaped === 'b' || escaped === 'f') {
				text += escaped;
			} else {
				return undefined;
			}
		}
		return undefined;
	};
	const skipNumber = () => {
		if (source[index] === '-') {
			index++;
		}
		const start = index;
		while (source[index] >= '0' && source[index] <= '9') {
			index++;
		}
		if (index === start) {
			return false;
		}
		if (source[index] === '.') {
			index++;
			while (source[index] >= '0' && source[index] <= '9') {
				index++;
			}
		}
		if (source[index] === 'e' || source[index] === 'E') {
			index++;
			if (source[index] === '+' || source[index] === '-') {
				index++;
			}
			while (source[index] >= '0' && source[index] <= '9') {
				index++;
			}
		}
		return true;
	};
	const readNumber = (): string | undefined => {
		const start = index;
		return skipNumber() ? source.slice(start, index) : undefined;
	};
	const skipValue = (): boolean => {
		skipSpace();
		const character = source[index];
		if (character === '"') {
			return readString() !== undefined;
		}
		if (character === '{') {
			return skipObject();
		}
		if (character === '[') {
			return skipArray();
		}
		if (character === 't' || character === 'n') {
			index += 4;
			return true;
		}
		if (character === 'f') {
			index += 5;
			return true;
		}
		if (character === '-' || (character >= '0' && character <= '9')) {
			return skipNumber();
		}
		return false;
	};
	const skipObject = (): boolean => {
		index++;
		skipSpace();
		if (source[index] === '}') {
			index++;
			return true;
		}
		while (index < length) {
			skipSpace();
			if (readString() === undefined) {
				return false;
			}
			skipSpace();
			if (source[index] !== ':') {
				return false;
			}
			index++;
			if (!skipValue()) {
				return false;
			}
			skipSpace();
			if (source[index] === ',') {
				index++;
				continue;
			}
			if (source[index] === '}') {
				index++;
				return true;
			}
			return false;
		}
		return false;
	};
	const skipArray = (): boolean => {
		index++;
		skipSpace();
		if (source[index] === ']') {
			index++;
			return true;
		}
		while (index < length) {
			if (!skipValue()) {
				return false;
			}
			skipSpace();
			if (source[index] === ',') {
				index++;
				continue;
			}
			if (source[index] === ']') {
				index++;
				return true;
			}
			return false;
		}
		return false;
	};
	const walk = (depth: number): string | undefined => {
		skipSpace();
		if (depth === steps.length) {
			const literal = readNumber();
			if (literal !== undefined) {
				return literal;
			}
			skipValue();
			return undefined;
		}
		const step = steps[depth];
		if (step.kind === 'key') {
			if (source[index] !== '{') {
				return undefined;
			}
			index++;
			skipSpace();
			let found: string | undefined;
			if (source[index] === '}') {
				index++;
				return undefined;
			}
			while (index < length) {
				skipSpace();
				const key = readString();
				if (key === undefined) {
					return undefined;
				}
				skipSpace();
				if (source[index] !== ':') {
					return undefined;
				}
				index++;
				if (key === step.key) {
					const match = walk(depth + 1);
					if (match !== undefined) {
						found = match;
					}
				} else if (!skipValue()) {
					return undefined;
				}
				skipSpace();
				if (source[index] === ',') {
					index++;
					continue;
				}
				if (source[index] === '}') {
					index++;
					return found;
				}
				return undefined;
			}
			return undefined;
		}
		if (source[index] !== '[') {
			return undefined;
		}
		index++;
		skipSpace();
		let item = 0;
		let found: string | undefined;
		if (source[index] === ']') {
			index++;
			return undefined;
		}
		while (index < length) {
			if (item === step.index) {
				const match = walk(depth + 1);
				if (match !== undefined) {
					found = match;
				}
			} else if (!skipValue()) {
				return undefined;
			}
			item++;
			skipSpace();
			if (source[index] === ',') {
				index++;
				continue;
			}
			if (source[index] === ']') {
				index++;
				return found;
			}
			return undefined;
		}
		return undefined;
	};
	return walk(0);
}

function formatJsonValue(value: unknown, rawBody?: string, path?: string): string | undefined {
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' && Number.isFinite(value)) {
		if (Number.isInteger(value) && !Number.isSafeInteger(value) && rawBody !== undefined && path !== undefined) {
			const literal = rawIntegerText(rawBody, path);
			if (literal) {
				return literal;
			}
		}
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
	return found ? formatJsonValue(found.value, response.body, attribute) : undefined;
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
