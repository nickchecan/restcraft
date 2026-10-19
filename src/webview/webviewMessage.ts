import { isResponseHeaderMappings } from '../request/automation';
import { isEnvironmentFileSettings } from '../request/environmentSettings';
import { isOAuthAuthorization } from '../request/oauth';
import {
	EnvironmentFileSettings,
	OAuthAuthorizationDefinition,
	RequestHeaderDefinition,
	RequestParamDefinition,
	ResponseHeaderMapping,
} from '../request/types';
import { isRecord, isStringRecord } from '../shared/object';

export interface SendRequestMessage {
	automation?: ResponseHeaderMapping[];
	type: 'sendRequest';
	requestId: number;
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: string;
}

export interface RequestChangedMessage {
	automation?: ResponseHeaderMapping[];
	authorizeBeforeSend?: boolean;
	description?: string;
	type: 'requestChanged';
	environment?: EnvironmentFileSettings;
	authorization?: OAuthAuthorizationDefinition;
	name: string;
	method: string;
	url: string;
	params: RequestParamDefinition[];
	headerState: RequestHeaderDefinition[];
	headers: Record<string, string>;
	body: string;
}

export interface ResolveEnvironmentVariableMessage {
	type: 'resolveEnvironmentVariable';
	requestId: number;
	name: string;
}

export interface CheckEnvironmentVariablesMessage {
	type: 'checkEnvironmentVariables';
	requestId: number;
	names: string[];
}

interface GetOAuthTokenMessage {
	type: 'getOAuthToken';
	requestId: number;
	url: string;
	clientId: string;
	clientSecret: string;
	scope: string;
	grantType?: 'client_credentials' | 'authorization_code';
	authorizationUrl?: string;
	clientAuthentication?: 'none' | 'basic' | 'body';
	usePkce?: boolean;
	state?: string;
	storeAccessToken?: boolean;
	accessTokenVariable?: string;
}

export type WebviewMessage =
	| { type: 'webviewReady' }
	| { type: 'getOAuthRedirect' }
	| { type: 'copyOAuthToken'; token: string }
	| { type: 'copyOAuthRedirect' }
	| { type: 'getConfiguredOAuthToken'; requestId: number; authorization: string }
	| { type: 'getEnvironmentFile'; requestId: number; environment?: EnvironmentFileSettings }
	| { type: 'chooseEnvironmentFile'; requestId: number }
	| { type: 'openEnvironmentFile' }
	| RequestChangedMessage
	| { type: 'cancelOAuthToken' }
	| { type: 'cancelRequest'; requestId: number }
	| { type: 'openXProfile' }
	| { type: 'openRepository' }
	| { type: 'openIssues' }
	| { type: 'openNetworkLog' }
	| { type: 'openNetworkHistory' }
	| { type: 'openSettings' }
	| ResolveEnvironmentVariableMessage
	| CheckEnvironmentVariablesMessage
	| GetOAuthTokenMessage
	| SendRequestMessage;

/** Parses one untrusted webview message. Invalid messages are ignored by the caller. */
export function readWebviewMessage(message: unknown): WebviewMessage | undefined {
	if (!isRecord(message)) {
		return undefined;
	}

	switch (message.type) {
		case 'webviewReady':
		case 'getOAuthRedirect':
		case 'copyOAuthRedirect':
		case 'openEnvironmentFile':
		case 'cancelOAuthToken':
		case 'openXProfile':
		case 'openRepository':
		case 'openIssues':
		case 'openNetworkLog':
		case 'openNetworkHistory':
		case 'openSettings':
			return { type: message.type };
		case 'copyOAuthToken':
			return typeof message.token === 'string' && message.token.length > 0
				? { type: 'copyOAuthToken', token: message.token }
				: undefined;
		case 'getConfiguredOAuthToken':
			return isSafeRequestId(message.requestId) && typeof message.authorization === 'string'
				? { type: 'getConfiguredOAuthToken', requestId: message.requestId, authorization: message.authorization }
				: undefined;
		case 'getEnvironmentFile':
			if (!isSafeRequestId(message.requestId) || !isOptionalEnvironment(message.environment)) {
				return undefined;
			}
			return message.environment === undefined
				? { type: 'getEnvironmentFile', requestId: message.requestId }
				: { type: 'getEnvironmentFile', requestId: message.requestId, environment: message.environment };
		case 'chooseEnvironmentFile':
			return isSafeRequestId(message.requestId)
				? { type: 'chooseEnvironmentFile', requestId: message.requestId }
				: undefined;
		case 'cancelRequest':
			return isSafeRequestId(message.requestId) ? { type: 'cancelRequest', requestId: message.requestId } : undefined;
		case 'resolveEnvironmentVariable':
			return isResolveEnvironmentVariableMessage(message) ? message : undefined;
		case 'checkEnvironmentVariables':
			return isCheckEnvironmentVariablesMessage(message) ? message : undefined;
		case 'requestChanged':
			return isRequestChangedMessage(message) ? message : undefined;
		case 'getOAuthToken':
			return isGetOAuthTokenMessage(message) ? message : undefined;
		case 'sendRequest':
			return isSendRequestMessage(message) ? message : undefined;
		default:
			return undefined;
	}
}

function isSafeRequestId(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value);
}

function isOptionalEnvironment(value: unknown): value is EnvironmentFileSettings | undefined {
	return value === undefined || isEnvironmentFileSettings(value);
}

function isVariableName(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function isRequestField(value: unknown): value is RequestParamDefinition {
	return (
		isRecord(value) &&
		typeof value.name === 'string' &&
		typeof value.value === 'string' &&
		typeof value.enabled === 'boolean'
	);
}

function isResolveEnvironmentVariableMessage(
	message: Record<string, unknown>,
): message is Record<string, unknown> & ResolveEnvironmentVariableMessage {
	return isSafeRequestId(message.requestId) && isVariableName(message.name);
}

function isCheckEnvironmentVariablesMessage(
	message: Record<string, unknown>,
): message is Record<string, unknown> & CheckEnvironmentVariablesMessage {
	return (
		isSafeRequestId(message.requestId) &&
		Array.isArray(message.names) &&
		message.names.length <= 100 &&
		message.names.every(isVariableName)
	);
}

function isRequestChangedMessage(
	message: Record<string, unknown>,
): message is Record<string, unknown> & RequestChangedMessage {
	return (
		(message.environment === undefined || isEnvironmentFileSettings(message.environment)) &&
		(message.authorization === undefined || isOAuthAuthorization(message.authorization)) &&
		(message.automation === undefined || isResponseHeaderMappings(message.automation)) &&
		(message.authorizeBeforeSend === undefined || typeof message.authorizeBeforeSend === 'boolean') &&
		(message.description === undefined || typeof message.description === 'string') &&
		typeof message.name === 'string' &&
		typeof message.method === 'string' &&
		typeof message.url === 'string' &&
		typeof message.body === 'string' &&
		Array.isArray(message.params) &&
		message.params.every(isRequestField) &&
		Array.isArray(message.headerState) &&
		message.headerState.every(isRequestField) &&
		isStringRecord(message.headers)
	);
}

function isGetOAuthTokenMessage(
	message: Record<string, unknown>,
): message is Record<string, unknown> & GetOAuthTokenMessage {
	return (
		isSafeRequestId(message.requestId) &&
		message.requestId >= 0 &&
		typeof message.url === 'string' &&
		typeof message.clientId === 'string' &&
		typeof message.clientSecret === 'string' &&
		typeof message.scope === 'string' &&
		(message.grantType === undefined ||
			message.grantType === 'client_credentials' ||
			message.grantType === 'authorization_code') &&
		(message.authorizationUrl === undefined || typeof message.authorizationUrl === 'string') &&
		(message.state === undefined || typeof message.state === 'string') &&
		(message.usePkce === undefined || typeof message.usePkce === 'boolean') &&
		(message.clientAuthentication === undefined ||
			message.clientAuthentication === 'none' ||
			message.clientAuthentication === 'basic' ||
			message.clientAuthentication === 'body') &&
		(message.storeAccessToken === undefined || typeof message.storeAccessToken === 'boolean') &&
		(message.accessTokenVariable === undefined || typeof message.accessTokenVariable === 'string')
	);
}

function isSendRequestMessage(
	message: Record<string, unknown>,
): message is Record<string, unknown> & SendRequestMessage {
	return (
		(message.automation === undefined || isResponseHeaderMappings(message.automation)) &&
		isSafeRequestId(message.requestId) &&
		typeof message.method === 'string' &&
		typeof message.url === 'string' &&
		(message.body === undefined || typeof message.body === 'string') &&
		(message.headers === undefined || isStringRecord(message.headers))
	);
}
