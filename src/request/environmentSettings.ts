import { isRecord } from '../shared/object';
import { EnvironmentFileSettings } from './types';

export function isEnvironmentFileSettings(value: unknown): value is EnvironmentFileSettings {
	return isRecord(value) && (value.mode === 'nearest' || value.mode === 'manual') && typeof value.path === 'string';
}

export function copyEnvironmentFileSettings(value: EnvironmentFileSettings): EnvironmentFileSettings {
	return { mode: value.mode, path: value.path };
}
