import * as assert from 'assert';
import {
	copyEnvironmentFileSettings,
	isEnvironmentFileSettings,
	isTokenView,
} from '../../src/request/environmentSettings';

suite('Environment settings boundary validation', () => {
	test('rejects malformed webview settings without accepting partial objects', () => {
		// Arrange
		const messages: unknown[] = [
			null,
			[],
			'manual',
			{},
			{ mode: 'manual' },
			{ mode: 'other', path: '.env' },
			{ mode: 'nearest', path: 42 },
		];

		// Act
		const accepted = messages.map(isEnvironmentFileSettings);

		// Assert
		assert.deepStrictEqual(
			accepted,
			messages.map(() => false),
		);
	});

	test('copies valid settings without carrying untrusted extra properties', () => {
		// Arrange
		const message = { mode: 'manual' as const, path: '../config/.env', unexpected: 'discard' };

		// Act
		const valid = isEnvironmentFileSettings(message);
		const copied = copyEnvironmentFileSettings(message);
		copied.path = '.env.local';

		// Assert
		assert.strictEqual(valid, true);
		assert.deepStrictEqual(copied, { mode: 'manual', path: '.env.local' });
		assert.strictEqual(message.path, '../config/.env');
	});

	test('accepts only supported token view values from configuration messages', () => {
		// Arrange
		const settings: unknown[] = ['raw', 'decoded', 'hidden', '', 'RAW', undefined, null, {}, 1];

		// Act
		const accepted = settings.map(isTokenView);

		// Assert
		assert.deepStrictEqual(accepted, [true, true, true, false, false, false, false, false, false]);
	});
});
