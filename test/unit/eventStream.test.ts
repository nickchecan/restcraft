import * as assert from 'assert';
import { createEventStreamParser } from '../../src/webview/eventStream';

suite('Event stream parser', () => {
	test('handles every chunk boundary, CRLF, multiline data, comments and inherited IDs', () => {
		const input =
			'\uFEFF: keepalive\r\nid: abc\r\nevent: update\r\ndata: {"ok":\r\ndata: true}\r\n\r\ndata: [DONE]\n\n';
		for (let split = 0; split <= input.length; split++) {
			const events: unknown[] = [];
			const parse = createEventStreamParser((event) => events.push(event));
			parse(input.slice(0, split));
			parse(input.slice(split));
			parse('', true);
			assert.deepStrictEqual(events, [
				{ type: 'update', id: 'abc', data: '{"ok":\ntrue}' },
				{ type: 'message', id: 'abc', data: '[DONE]' },
			]);
		}
	});

	test('handles single-character chunks and discards unterminated events', () => {
		const events: unknown[] = [];
		const parse = createEventStreamParser((event) => events.push(event));
		for (const character of 'id: old\rid: bad\0id\rdata\r\rid:\ndata: text\n\ndata: incomplete') {
			parse(character);
		}
		parse('', true);
		assert.deepStrictEqual(events, [
			{ type: 'message', id: 'old', data: '' },
			{ type: 'message', id: '', data: 'text' },
		]);
	});
});
