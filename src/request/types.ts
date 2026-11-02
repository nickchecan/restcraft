export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ApiRequest {
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: string;
}

export interface ApiResponse {
	status: number;
	statusText: string;
	headers: Record<string, string>;
	body: string;
}

export interface RequestParamDefinition {
	name: string;
	value: string;
	enabled: boolean;
}

export interface RequestHeaderDefinition {
	name: string;
	value: string;
	enabled: boolean;
}

export interface OAuthAuthorizationDefinition {
	type: 'oauth2';
	grantType: 'client_credentials' | 'authorization_code';
	accessTokenUrl: string;
	clientId: string;
	clientSecret: string;
	scope: string;
	authorizationUrl?: string;
	clientAuthentication?: 'none' | 'basic' | 'body';
	usePkce?: boolean;
	state?: string;
	updateAuthorizationHeader?: boolean;
	storeAccessToken?: boolean;
	accessTokenVariable?: string;
}

export interface EnvironmentFileSettings {
	mode: 'nearest' | 'manual';
	path: string;
}

export type TokenView = 'raw' | 'decoded' | 'hidden';

export type AutomationType = 'header' | 'json' | 'raw';

/**
 * One Automations row.
 *
 * `type` is omitted for headers so older files stay valid. `header` is the
 * response attribute: a header name, a JSON path, or ignored text for `raw`.
 */
export interface AutomationMapping {
	type?: AutomationType;
	header: string;
	variable: string;
	enabled: boolean;
}

export interface RequestFileDefinition {
	automation?: AutomationMapping[];
	authorizeBeforeSend?: boolean;
	description?: string;
	name: string;
	method: HttpMethod;
	url: string;
	params: RequestParamDefinition[];
	headerState: RequestHeaderDefinition[];
	headers: Record<string, string>;
	body: unknown;
	authorization?: OAuthAuthorizationDefinition;
	environment?: EnvironmentFileSettings;
}

/**
 * HTTP verbs supported by request files, the workbench UI, and execution.
 *
 * Keep this list in sync with package/UI affordances when adding a method.
 */
export const supportedMethods: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/**
 * Runtime guard for user-provided methods.
 *
 * Request files and webview messages are untrusted until validated, even though
 * the TypeScript types describe the canonical in-memory shape.
 */
export function isHttpMethod(method: string): method is HttpMethod {
	return supportedMethods.includes(method as HttpMethod);
}
