// CI validates commits and code in dedicated jobs; release commits skip local hooks.
async function installHooks(): Promise<void> {
	if (process.env.CI === 'true' || process.env.NODE_ENV === 'production') {
		return;
	}
	const { default: husky } = await import('husky');
	const error = husky();
	if (error) {
		throw new Error(error);
	}
}

installHooks().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
