import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import { readPackageVersion } from '../../src/extensionVersion';

suite('Extension version', () => {
	test('reads the version from package.json metadata', () => {
		// Arrange
		const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };

		// Act
		const actionUnderTest = readPackageVersion(packageJson);

		// Assert
		assert.strictEqual(actionUnderTest, packageJson.version);
	});

	test('falls back when package metadata has no version', () => {
		// Arrange
		// Inputs are supplied directly to the operation below.

		// Act
		const actual = readPackageVersion({});

		// Assert
		assert.strictEqual(actual, '0.0.0');
	});
});
