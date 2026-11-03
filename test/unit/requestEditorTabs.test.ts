import * as assert from 'assert';
import * as vscode from 'vscode';
import { runInNewContext } from 'vm';

import { getWebviewHtml } from '../../src/webview/getWebviewHtml';

function errorText(error: unknown): string {
	if (error instanceof Error) {
		return error.stack ?? error.message;
	}
	return String(error);
}

const savedRequest = {
	name: 'Get Token through SSO',
	method: 'GET',
	url: '',
	params: [],
	headerState: [{ name: 'Authorization', value: 'Bearer {{OKTA_ACCESS_TOKEN}}', enabled: true }],
	authorization: {
		type: 'oauth2',
		grantType: 'authorization_code',
		accessTokenUrl: 'https://sso.example.com/oauth2/x/v1/token',
		clientId: 'abc',
		clientSecret: '',
		scope: '',
		authorizationUrl: 'https://sso.example.com/oauth2/x/v1/authorize',
		clientAuthentication: 'body',
		state: '953ef624',
		usePkce: true,
		updateAuthorizationHeader: true,
		storeAccessToken: true,
		accessTokenVariable: 'OKTA_ACCESS_TOKEN',
	},
	body: null,
	description: 'Retrieve an access token',
};

const voidElements = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'source',
	'track',
	'wbr',
]);

suite('Request editor tabs', () => {
	test('switches Authorization, Headers, and Body after loading an empty-URL OAuth request', () => {
		// Arrange
		const html = getWebviewHtml({ cspSource: 'test' } as vscode.Webview, '1.12.2');
		const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1];
		assert.ok(script, 'Workbench document must include its script');
		const page = createWorkbenchPage(html);

		// Act
		let initError: unknown;
		try {
			runInNewContext(script, page.sandbox, { filename: 'workbench.js' });
		} catch (error) {
			initError = error;
		}
		let loadError: unknown;
		try {
			page.dispatch({ type: 'loadRequest', request: savedRequest });
		} catch (error) {
			loadError = error;
		}

		// Assert
		assert.ok(initError === undefined, errorText(initError));
		assert.ok(loadError === undefined, errorText(loadError));
		assert.strictEqual(page.value('url'), '');
		assert.strictEqual(page.value('authorization-type'), 'oauth2');
		assert.strictEqual(page.value('oauth-grant-type'), 'authorization_code');
		assert.strictEqual(page.value('request-body'), '');
		for (const id of ['request-authorization-tab', 'request-headers-tab', 'request-body-tab']) {
			page.click(id);
			const tab = page.tab(id);
			assert.strictEqual(tab.selected, 'true', id);
			assert.strictEqual(tab.hidden, false, id);
		}
	});
});

interface WorkbenchDocument {
	byId: Map<string, WorkbenchElement>;
	root: WorkbenchElement;
}

class ClassList {
	private names = new Set<string>();

	public constructor(private readonly element: WorkbenchElement) {}

	public syncFrom(className: string): void {
		this.names = new Set(className.split(/\s+/).filter((name) => name.length > 0));
	}

	public add(...names: string[]): void {
		for (const name of names) {
			this.names.add(name);
		}
		this.write();
	}

	public remove(...names: string[]): void {
		for (const name of names) {
			this.names.delete(name);
		}
		this.write();
	}

	public toggle(name: string, force?: boolean): boolean {
		const next = force === undefined ? !this.names.has(name) : force;
		if (next) {
			this.names.add(name);
		} else {
			this.names.delete(name);
		}
		this.write();
		return next;
	}

	public contains(name: string): boolean {
		return this.names.has(name);
	}

	private write(): void {
		this.element.className = [...this.names].join(' ');
	}
}

class WorkbenchElement {
	public readonly tagName: string;
	public readonly attributes = new Map<string, string>();
	public readonly classList: ClassList;
	public readonly style = { setProperty: () => undefined };
	public children: WorkbenchElement[] = [];
	public parentElement: WorkbenchElement | null = null;
	public checked = false;
	public disabled = false;
	public hidden = false;
	public innerHTML = '';
	public type = '';
	public id = '';
	public scrollTop = 0;
	public scrollLeft = 0;
	public clientWidth = 800;
	public clientHeight = 600;
	public scrollWidth = 800;
	public offsetTop = 0;
	private text = '';
	private storedValue = '';
	private storedClassName = '';
	private readonly listeners = new Map<string, Array<(event: { type: string; target: WorkbenchElement }) => void>>();

	public constructor(
		tag: string,
		private readonly doc: WorkbenchDocument,
	) {
		this.tagName = tag.toUpperCase();
		this.classList = new ClassList(this);
	}

	public get firstChild(): WorkbenchElement | undefined {
		return this.children[0];
	}

	public get className(): string {
		return this.storedClassName;
	}

	public set className(value: string) {
		this.storedClassName = value;
		this.classList.syncFrom(value);
		this.attributes.set('class', value);
	}

	public get value(): string {
		if (this.tagName === 'SELECT' && this.storedValue === '') {
			const selected = this.children.find((child) => child.attributes.has('selected')) ?? this.children[0];
			return selected?.getAttribute('value') ?? '';
		}
		return this.storedValue;
	}

	public set value(value: string) {
		this.storedValue = String(value);
	}

	public get textContent(): string {
		return this.text + this.children.map((child) => child.textContent).join('');
	}

	public set textContent(value: string) {
		this.text = String(value);
		this.children = [];
	}

	public setAttribute(name: string, value: string): void {
		this.attributes.set(name, String(value));
		if (name === 'id') {
			this.id = String(value);
			this.doc.byId.set(this.id, this);
		}
		if (name === 'class') {
			this.className = String(value);
		}
		if (name === 'value') {
			this.value = String(value);
		}
		if (name === 'type') {
			this.type = String(value);
		}
	}

	public getAttribute(name: string): string | null {
		return this.attributes.has(name) ? (this.attributes.get(name) ?? null) : null;
	}

	public addEventListener(type: string, handler: (event: { type: string; target: WorkbenchElement }) => void): void {
		const handlers = this.listeners.get(type) ?? [];
		handlers.push(handler);
		this.listeners.set(type, handlers);
	}

	public click(): void {
		for (const handler of this.listeners.get('click') ?? []) {
			handler({ type: 'click', target: this });
		}
	}

	public append(...nodes: WorkbenchElement[]): void {
		for (const node of nodes) {
			this.adopt(node);
		}
	}

	public appendChild(node: WorkbenchElement): WorkbenchElement {
		this.adopt(node);
		return node;
	}

	public insertBefore(node: WorkbenchElement, reference: WorkbenchElement | null): void {
		if (node.parentElement) {
			node.remove();
		}
		const index = reference ? this.children.indexOf(reference) : this.children.length;
		this.children.splice(index < 0 ? this.children.length : index, 0, node);
		node.parentElement = this;
	}

	public remove(): void {
		if (!this.parentElement) {
			return;
		}
		this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
		this.parentElement = null;
	}

	public replaceChildren(...nodes: WorkbenchElement[]): void {
		for (const child of [...this.children]) {
			child.parentElement = null;
		}
		this.children = [];
		this.text = '';
		for (const node of nodes) {
			this.adopt(node);
		}
	}

	public querySelector(selector: string): WorkbenchElement | null {
		return this.querySelectorAll(selector)[0] ?? null;
	}

	public querySelectorAll(selector: string): WorkbenchElement[] {
		if (selector.includes(',')) {
			return selector.split(',').flatMap((part) => this.querySelectorAll(part.trim()));
		}
		const matches: WorkbenchElement[] = [];
		const visit = (node: WorkbenchElement): void => {
			for (const child of node.children) {
				if (elementMatches(child, selector)) {
					matches.push(child);
				}
				visit(child);
			}
		};
		visit(this);
		return matches;
	}

	public closest(selector: string): WorkbenchElement | null {
		let node: WorkbenchElement | null = this;
		while (node) {
			if (elementMatches(node, selector)) {
				return node;
			}
			node = node.parentElement;
		}
		return null;
	}

	public getBoundingClientRect(): {
		top: number;
		bottom: number;
		left: number;
		right: number;
		width: number;
		height: number;
	} {
		return { top: 0, bottom: 40, left: 0, right: 400, width: 400, height: 40 };
	}

	public focus(): void {}

	public select(): void {}

	public addText(value: string): void {
		this.text += value;
	}

	private adopt(node: WorkbenchElement): void {
		if (node.parentElement) {
			node.remove();
		}
		node.parentElement = this;
		this.children.push(node);
	}
}

function elementMatches(element: WorkbenchElement, selector: string): boolean {
	let rest = selector.trim();
	if (!rest) {
		return false;
	}
	let tag: string | undefined;
	if (!rest.startsWith('.') && !rest.startsWith('#') && !rest.startsWith('[')) {
		const match = /^[a-zA-Z0-9-]+/.exec(rest);
		if (!match) {
			return false;
		}
		tag = match[0].toUpperCase();
		rest = rest.slice(match[0].length);
	}
	const classes: string[] = [];
	let id: string | undefined;
	const attributes: string[] = [];
	while (rest) {
		if (rest.startsWith('.')) {
			const match = /^\.([^.#\[]+)/.exec(rest);
			if (!match) {
				return false;
			}
			classes.push(match[1]);
			rest = rest.slice(match[0].length);
		} else if (rest.startsWith('#')) {
			const match = /^#([^.#\[]+)/.exec(rest);
			if (!match) {
				return false;
			}
			id = match[1];
			rest = rest.slice(match[0].length);
		} else if (rest.startsWith('[')) {
			const match = /^\[([^\]]+)\]/.exec(rest);
			if (!match) {
				return false;
			}
			attributes.push(match[1]);
			rest = rest.slice(match[0].length);
		} else {
			break;
		}
	}
	if (tag && element.tagName !== tag) {
		return false;
	}
	if (id && element.id !== id) {
		return false;
	}
	if (classes.some((name) => !element.classList.contains(name))) {
		return false;
	}
	return attributes.every((attribute) => {
		const match = /^([^=]+)="([^"]*)"$/.exec(attribute);
		return match !== null && element.getAttribute(match[1]) === match[2];
	});
}

function parseWorkbenchHtml(html: string): WorkbenchDocument {
	const doc = { byId: new Map<string, WorkbenchElement>(), root: undefined as unknown as WorkbenchElement };
	doc.root = new WorkbenchElement('document', doc);
	const stack = [doc.root];
	const source = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
	const tokens = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)>|<([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
	let match: RegExpExecArray | null;
	while ((match = tokens.exec(source))) {
		if (match[1]) {
			const tag = match[1].toUpperCase();
			for (let index = stack.length - 1; index > 0; index -= 1) {
				const node = stack.pop();
				if (node?.tagName === tag) {
					break;
				}
			}
			continue;
		}
		if (match[2]) {
			const element = new WorkbenchElement(match[2], doc);
			const attrs = match[3] ?? '';
			const attrTokens = /([^\s=]+)(?:="([^"]*)")?/g;
			let attr: RegExpExecArray | null;
			while ((attr = attrTokens.exec(attrs))) {
				if (attr[1] === '/') {
					continue;
				}
				element.setAttribute(attr[1], attr[2] ?? '');
				if (attr[1] === 'checked') {
					element.checked = true;
				}
				if (attr[1] === 'disabled') {
					element.disabled = true;
				}
				if (attr[1] === 'hidden') {
					element.hidden = true;
				}
			}
			stack[stack.length - 1].append(element);
			const selfClosing = attrs.trim().endsWith('/') || voidElements.has(match[2].toLowerCase());
			if (!selfClosing) {
				stack.push(element);
			}
			continue;
		}
		if (match[4]?.trim()) {
			stack[stack.length - 1].addText(match[4].replace(/\s+/g, ' '));
		}
	}
	return doc;
}

function createWorkbenchPage(html: string): {
	sandbox: Record<string, unknown>;
	dispatch: (message: unknown) => void;
	click: (id: string) => void;
	value: (id: string) => string;
	tab: (id: string) => { selected: string | null; hidden: boolean };
} {
	const doc = parseWorkbenchHtml(html);
	const windowListeners = new Map<string, Array<(event: { data?: unknown }) => void>>();
	const listen = (type: string, handler: (event: { data?: unknown }) => void): void => {
		const handlers = windowListeners.get(type) ?? [];
		handlers.push(handler);
		windowListeners.set(type, handlers);
	};
	const document = {
		getElementById: (id: string) => doc.byId.get(id) ?? null,
		querySelector: (selector: string) => doc.root.querySelector(selector),
		querySelectorAll: (selector: string) => doc.root.querySelectorAll(selector),
		createElement: (tag: string) => new WorkbenchElement(tag, doc),
		addEventListener: listen,
	};
	const sandbox: Record<string, unknown> = {
		URL,
		URLSearchParams,
		TextEncoder,
		TextDecoder,
		atob,
		btoa,
		setTimeout,
		clearTimeout,
		setInterval,
		clearInterval,
		performance: { now: () => 0 },
		crypto: {
			getRandomValues: (values: Uint8Array) => {
				values.fill(1);
				return values;
			},
		},
		ResizeObserver: class {
			public observe(): void {}
			public unobserve(): void {}
			public disconnect(): void {}
		},
		MutationObserver: class {
			public observe(): void {}
			public disconnect(): void {}
		},
		acquireVsCodeApi: () => ({
			postMessage: () => undefined,
			getState: () => ({}),
			setState: () => undefined,
		}),
		document,
		requestAnimationFrame: (callback: () => void) => {
			callback();
			return 0;
		},
		getComputedStyle: () => ({
			font: '16px sans-serif',
			fontSize: '16px',
			lineHeight: '20px',
			paddingLeft: '0',
			paddingTop: '0',
			paddingRight: '0',
		}),
		innerWidth: 1200,
		innerHeight: 800,
		addEventListener: listen,
	};
	sandbox.window = sandbox;
	return {
		sandbox,
		dispatch: (message) => {
			for (const handler of windowListeners.get('message') ?? []) {
				handler({ data: message });
			}
		},
		click: (id) => {
			const element = doc.byId.get(id);
			assert.ok(element, `Missing #${id}`);
			element.click();
		},
		value: (id) => doc.byId.get(id)?.value ?? '',
		tab: (id) => {
			const element = doc.byId.get(id);
			assert.ok(element, `Missing #${id}`);
			const panelId = element.getAttribute('aria-controls');
			const panel = panelId ? doc.byId.get(panelId) : undefined;
			assert.ok(panel, `Missing panel for #${id}`);
			return { selected: element.getAttribute('aria-selected'), hidden: panel.classList.contains('hidden') };
		},
	};
}
