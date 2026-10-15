import * as vscode from 'vscode';
import { convertBrunoRequest, readBrunoBlocks, BrunoImport } from './bruno';
import { convertBrunoYamlRequest, readBrunoYaml, readBrunoYamlSettings, BrunoYamlSettings } from './brunoYaml';

const decoder = new TextDecoder('utf-8', { fatal: true });
async function read(uri: vscode.Uri): Promise<string> {
	return decoder.decode(await vscode.workspace.fs.readFile(uri));
}

export async function importBrunoRequest(source: vscode.Uri, destination: vscode.Uri): Promise<BrunoImport> {
	const text = await read(source);
	const result = /\.ya?ml$/i.test(source.path) ? convertBrunoYamlRequest(text) : convertBrunoRequest(text);
	await writeNew(destination, result.content);
	return result;
}

async function assertMissing(uri: vscode.Uri): Promise<void> {
	try {
		await vscode.workspace.fs.stat(uri);
	} catch (error) {
		if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
			return;
		}
		throw error;
	}
	throw new Error(`Import destination already exists: ${uri.path}`);
}

async function writeNew(uri: vscode.Uri, content: string): Promise<void> {
	await assertMissing(uri);
	await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
}

/** Plans every conversion before writing; source names alone determine destination paths. */
export async function importBrunoCollection(
	source: vscode.Uri,
	destination: vscode.Uri,
): Promise<{ count: number; warnings: string[] }> {
	const rootEntries = await vscode.workspace.fs.readDirectory(source);
	const markers = rootEntries.filter(
		([name, type]) =>
			type === vscode.FileType.File && ['bruno.json', 'opencollection.yml', 'opencollection.yaml'].includes(name),
	);
	if (markers.length !== 1) {
		throw new Error(
			'Select a Bruno collection folder with exactly one bruno.json or opencollection.yml/.yaml root file.',
		);
	}
	const marker = markers[0][0];
	const yaml = marker !== 'bruno.json';
	if (yaml) {
		const config = readBrunoYaml(await read(vscode.Uri.joinPath(source, marker)));
		if (config.opencollection !== '1.0.0') {
			throw new Error('Unsupported OpenCollection version; expected 1.0.0.');
		}
	} else {
		const config: unknown = JSON.parse(await read(vscode.Uri.joinPath(source, marker)));
		if (!config || typeof config !== 'object' || !('type' in config) || config.type !== 'collection') {
			throw new Error('Select a Bruno collection folder containing bruno.json.');
		}
	}
	await assertMissing(destination);
	const plan: { uri: vscode.Uri; result: BrunoImport }[] = [];
	async function visit(
		directory: vscode.Uri,
		relative: string[],
		parents: ReturnType<typeof readBrunoBlocks>[],
		yamlParents: BrunoYamlSettings[],
	): Promise<void> {
		const entries = await vscode.workspace.fs.readDirectory(directory);
		const layers = [...parents];
		const yamlLayers = [...yamlParents];
		const settingsFiles = yaml
			? [...(relative.length === 0 ? [marker, 'collection.yml', 'collection.yaml'] : []), 'folder.yml', 'folder.yaml']
			: ['collection.bru', 'folder.bru'];
		for (const name of settingsFiles) {
			if (entries.some(([entry, type]) => entry === name && type === vscode.FileType.File)) {
				const text = await read(vscode.Uri.joinPath(directory, name));
				if (yaml) {
					yamlLayers.push(readBrunoYamlSettings(readBrunoYaml(text)));
				} else {
					layers.push(readBrunoBlocks(text));
				}
			}
		}
		for (const [name, type] of entries.sort(([a], [b]) => a.localeCompare(b))) {
			if (type & vscode.FileType.SymbolicLink) {
				continue;
			}
			if (type === vscode.FileType.Directory && !['.git', 'node_modules', 'environments'].includes(name)) {
				await visit(vscode.Uri.joinPath(directory, name), [...relative, name], layers, yamlLayers);
			} else if (
				type === vscode.FileType.File &&
				(yaml ? /\.ya?ml$/i.test(name) : name.endsWith('.bru')) &&
				![
					'collection.bru',
					'folder.bru',
					'opencollection.yml',
					'opencollection.yaml',
					'collection.yml',
					'collection.yaml',
					'folder.yml',
					'folder.yaml',
				].includes(name)
			) {
				try {
					plan.push({
						uri: vscode.Uri.joinPath(destination, ...relative, `${name.replace(/\.(bru|ya?ml)$/i, '')}.api.json`),
						result: yaml
							? convertBrunoYamlRequest(await read(vscode.Uri.joinPath(directory, name)), yamlLayers)
							: convertBrunoRequest(await read(vscode.Uri.joinPath(directory, name)), layers),
					});
				} catch (error) {
					throw new Error(
						`Cannot import ${[...relative, name].join('/')}: ${error instanceof Error ? error.message : 'Invalid request.'}`,
					);
				}
			}
		}
	}
	await visit(source, [], [], []);
	const targets = new Set<string>();
	for (const item of plan) {
		const key = item.uri.toString().toLowerCase();
		if (targets.has(key)) {
			throw new Error(`Multiple Bruno requests map to the same destination: ${item.uri.path}`);
		}
		targets.add(key);
	}
	if (!plan.length) {
		throw new Error('No Bruno requests found in this collection.');
	}
	for (const item of plan) {
		await vscode.workspace.fs.createDirectory(
			item.uri.with({ path: item.uri.path.slice(0, item.uri.path.lastIndexOf('/')) }),
		);
		await writeNew(item.uri, item.result.content);
	}
	return {
		count: plan.length,
		warnings: [
			...new Set([
				'Bruno environments are not imported; configure RestCraft .env files for variable references.',
				...plan.flatMap((item) => item.result.warnings),
			]),
		],
	};
}
