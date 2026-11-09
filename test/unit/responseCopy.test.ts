import * as assert from 'assert';

import { copyResponseText } from '../../src/webview/requestWebview';

suite('Response copy result', () => {
	test('reports a failed clipboard write without claiming the text was copied', async () => {
		// Arrange
		const posted: unknown[] = [];

		// Act
		await copyResponseText(
			() => Promise.reject(new Error('clipboard unavailable')),
			(message) => {
				posted.push(message);
				return Promise.resolve(true);
			},
			'not-copied',
			4,
		);

		// Assert
		assert.deepStrictEqual(posted, [{ type: 'responseCopied', ok: false, attempt: 4 }]);
	});

	test('reports a successful clipboard write for the same attempt', async () => {
		// Arrange
		const written: string[] = [];
		const posted: unknown[] = [];

		// Act
		await copyResponseText(
			(value) => {
				written.push(value);
				return Promise.resolve();
			},
			(message) => {
				posted.push(message);
				return Promise.resolve(true);
			},
			'copied-text',
		);

		// Assert
		assert.deepStrictEqual(written, ['copied-text']);
		assert.deepStrictEqual(posted, [{ type: 'responseCopied', ok: true }]);
	});
});
