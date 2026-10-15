import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
	{
		label: 'unit',
		files: 'out/test/unit/**/*.test.js',
	},
	{
		label: 'integration',
		files: 'out/test/integration/**/*.test.js',
	},
]);
