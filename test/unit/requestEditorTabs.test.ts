import * as assert from 'assert';
import { runInNewContext } from 'vm';

import { workbenchMarkup } from '../../src/webview/workbenchMarkup';
import { workbenchScript } from '../../src/webview/workbenchScript';
import { workbenchStyles } from '../../src/webview/workbenchStyles';

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
		const page = createWorkbenchPage(workbenchMarkup('1.12.2'));

		// Act
		let initError: unknown;
		try {
			runInNewContext(workbenchScript(), page.sandbox, { filename: 'workbench.js' });
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

suite('Response line alignment', () => {
	test('keeps each body and raw line number, code text, and hover on one row', () => {
		// Arrange
		const page = createWorkbenchPage(workbenchMarkup('1.12.3'));
		const payload = {
			id: 7,
			short: 'ok',
			token: `T${'X'.repeat(220)}`,
			sentence: `${'alpha '.repeat(12).trim()} end`,
			nested: { a: 1, b: false },
		};
		const rawBody = JSON.stringify(payload);
		const pretty = JSON.stringify(payload, null, 2);
		const plain = `short\n\n${'y'.repeat(240)}`;

		// Act
		let initError: unknown;
		try {
			runInNewContext(workbenchScript(), page.sandbox, { filename: 'workbench.js' });
		} catch (error) {
			initError = error;
		}
		let renderError: unknown;
		try {
			page.dispatch({
				type: 'requestComplete',
				response: {
					status: 200,
					statusText: 'OK',
					headers: { 'Content-Type': 'application/json' },
					body: rawBody,
				},
			});
		} catch (error) {
			renderError = error;
		}

		// Assert
		assert.ok(initError === undefined, errorText(initError));
		assert.ok(renderError === undefined, errorText(renderError));
		assertResponseRows(page.element('response-body'), pretty.split('\n'), true);
		assertResponseRows(page.element('response-raw'), rawBody.split('\n'), false);
		const sharedStart = workbenchStyles.indexOf('.response-line-number,');
		const sharedRule = workbenchStyles.slice(sharedStart, workbenchStyles.indexOf('}', sharedStart));
		assert.ok(sharedRule.includes('.response-line-code'));
		assert.ok(sharedRule.includes('font-family: var(--vscode-editor-font-family)'));
		assert.ok(sharedRule.includes('font-size: var(--vscode-editor-font-size)'));
		assert.ok(sharedRule.includes('line-height: 1.45'));
		assert.ok(workbenchStyles.includes('.response-line:hover {'));
		const highlighted = page
			.element('response-body')
			.querySelectorAll('.response-line-code')
			.find((code) => code.innerHTML.includes('json-token-string'));
		assert.ok(highlighted, 'Expected JSON token highlighting inside a response line.');

		page.dispatch({
			type: 'requestComplete',
			response: {
				status: 200,
				statusText: 'OK',
				headers: { 'Content-Type': 'text/plain' },
				body: plain,
			},
		});
		assertResponseRows(page.element('response-body'), plain.split('\n'), false);
		assertResponseRows(page.element('response-raw'), plain.split('\n'), false);
		assert.strictEqual(
			page.element('response-body').querySelectorAll('.response-line')[1].querySelector('.response-line-code')
				?.textContent,
			'',
		);
		assert.strictEqual(
			page.element('response-body').querySelectorAll('.response-line')[2].querySelector('.response-line-code')
				?.textContent,
			'y'.repeat(240),
		);
	});
});

function assertResponseRows(host: WorkbenchElement, lines: string[], highlighted: boolean): void {
	const rows = host.querySelectorAll('.response-line');
	assert.strictEqual(rows.length, lines.length);
	rows.forEach((row, index) => {
		const number = row.querySelector('.response-line-number');
		const code = row.querySelector('.response-line-code');
		assert.ok(number, `Missing line number on row ${index + 1}`);
		assert.ok(code, `Missing line code on row ${index + 1}`);
		assert.strictEqual(number.getAttribute('aria-hidden'), 'true');
		assert.strictEqual(number.textContent, String(index + 1));
		assert.strictEqual(
			row.children.filter(
				(child) => child.classList.contains('response-line-number') || child.classList.contains('response-line-code'),
			).length,
			2,
		);
		if (!highlighted) {
			assert.strictEqual(code.textContent, lines[index]);
		}
	});
}

interface WorkbenchDocument {
	byId: Map<string, WorkbenchElement>;
	root: WorkbenchElement;
}

class ClassList {
	private names = new Set<string>();

	public constructor(private readonly element: WorkbenchElement) {}

	public syncFrom(className: string): void {
		const names: string[] = [];
		let current = '';
		for (const char of className) {
			if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
				if (current.length > 0) {
					names.push(current);
					current = '';
				}
			} else {
				current += char;
			}
		}
		if (current.length > 0) {
			names.push(current);
		}
		this.names = new Set(names);
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

	public removeAttribute(name: string): void {
		this.attributes.delete(name);
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

function isMarkupSpace(char: string): boolean {
	return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function collapseWhitespace(value: string): string {
	let collapsed = '';
	let previousSpace = false;
	for (const char of value) {
		if (isMarkupSpace(char)) {
			if (!previousSpace) {
				collapsed += ' ';
			}
			previousSpace = true;
			continue;
		}
		previousSpace = false;
		collapsed += char;
	}
	return collapsed;
}

function readAttributes(element: WorkbenchElement, source: string): void {
	let index = 0;
	while (index < source.length) {
		while (index < source.length && isMarkupSpace(source[index])) {
			index += 1;
		}
		if (index >= source.length || source[index] === '/') {
			return;
		}
		const nameStart = index;
		while (index < source.length && !isMarkupSpace(source[index]) && source[index] !== '=') {
			index += 1;
		}
		const name = source.slice(nameStart, index);
		let value = '';
		if (source[index] === '=') {
			index += 1;
			if (source[index] === '"') {
				const end = source.indexOf('"', index + 1);
				value = source.slice(index + 1, end === -1 ? source.length : end);
				index = end === -1 ? source.length : end + 1;
			} else {
				const valueStart = index;
				while (index < source.length && !isMarkupSpace(source[index])) {
					index += 1;
				}
				value = source.slice(valueStart, index);
			}
		}
		element.setAttribute(name, value);
		if (name === 'checked') {
			element.checked = true;
		}
		if (name === 'disabled') {
			element.disabled = true;
		}
		if (name === 'hidden') {
			element.hidden = true;
		}
	}
}

function parseWorkbenchHtml(markup: string): WorkbenchDocument {
	const doc = { byId: new Map<string, WorkbenchElement>(), root: undefined as unknown as WorkbenchElement };
	doc.root = new WorkbenchElement('document', doc);
	const stack = [doc.root];
	let cursor = 0;
	while (cursor < markup.length) {
		const open = markup.indexOf('<', cursor);
		if (open === -1) {
			const text = collapseWhitespace(markup.slice(cursor));
			if (text.trim()) {
				stack[stack.length - 1].addText(text);
			}
			break;
		}
		if (open > cursor) {
			const text = collapseWhitespace(markup.slice(cursor, open));
			if (text.trim()) {
				stack[stack.length - 1].addText(text);
			}
		}
		if (markup.startsWith('<!--', open)) {
			const end = markup.indexOf('-->', open + 4);
			cursor = end === -1 ? markup.length : end + 3;
			continue;
		}
		const close = markup.indexOf('>', open + 1);
		const raw = markup.slice(open + 1, close === -1 ? markup.length : close);
		cursor = close === -1 ? markup.length : close + 1;
		if (raw.startsWith('/')) {
			const tag = raw.slice(1).trim().toUpperCase();
			for (let index = stack.length - 1; index > 0; index -= 1) {
				const node = stack.pop();
				if (node?.tagName === tag) {
					break;
				}
			}
			continue;
		}
		const selfClosing = raw.endsWith('/');
		const body = (selfClosing ? raw.slice(0, -1) : raw).trim();
		let nameEnd = 0;
		while (nameEnd < body.length && !isMarkupSpace(body[nameEnd])) {
			nameEnd += 1;
		}
		const name = body.slice(0, nameEnd);
		const element = new WorkbenchElement(name, doc);
		readAttributes(element, body.slice(nameEnd));
		stack[stack.length - 1].append(element);
		if (!selfClosing && !voidElements.has(name.toLowerCase())) {
			stack.push(element);
		}
	}
	return doc;
}

function createWorkbenchPage(html: string): {
	sandbox: Record<string, unknown>;
	dispatch: (message: unknown) => void;
	click: (id: string) => void;
	value: (id: string) => string;
	element: (id: string) => WorkbenchElement;
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
		createTextNode: (text: string) => {
			const node = new WorkbenchElement('#text', doc);
			node.textContent = text;
			return node;
		},
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
		element: (id) => {
			const element = doc.byId.get(id);
			assert.ok(element, `Missing #${id}`);
			return element;
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
