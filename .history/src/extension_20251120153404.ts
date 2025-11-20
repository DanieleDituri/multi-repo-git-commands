import * as vscode from 'vscode';
import { spawn, execFile } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { RepoTreeProvider, type RepoInfo } from './repoTreeProvider';

type GitPick = {
	label: string;
	description?: string;
	args: string[]; // git arguments without the leading 'git'
};

const PRESETS: GitPick[] = [
	{ label: 'Status (short)', description: 'git status -sb', args: ['status', '-sb'] },
	{ label: 'Fetch --all --prune', description: 'git fetch --all --prune', args: ['fetch', '--all', '--prune'] },
	{ label: 'Pull (rebase)', description: 'git pull --rebase', args: ['pull', '--rebase'] },
	{ label: 'Show branch', description: 'git branch --show-current', args: ['branch', '--show-current'] },
	{ label: 'Discard all changes', description: 'git reset --hard HEAD', args: ['reset', '--hard', 'HEAD'] },
];

function createOutput(): vscode.OutputChannel {
	return vscode.window.createOutputChannel('Multi Repo Git');
}

async function isGitRepo(cwd: string): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const child = execFile('git', ['rev-parse', '--is-inside-work-tree'], { cwd, timeout: 4000 }, (err) => {
			resolve(!err);
		});
		child.on('error', () => resolve(false));
	});
}

async function exists(p: string): Promise<boolean> {
	try {
		await fs.stat(p);
		return true;
	} catch {
		return false;
	}
}

async function hasDotGit(dir: string): Promise<boolean> {
	return exists(path.join(dir, '.git'));
}

function shouldSkipEntry(entry: import('node:fs').Dirent, excludeFolders: string[]): boolean {
	if (!entry.isDirectory()) {
		return true;
	}
	if (entry.name === '.' || entry.name === '..') {
		return true;
	}
	if (excludeFolders.includes(entry.name)) {
		return true;
	}
	return false;
}

async function discoverGitRepos(root: string, options: { maxDepth: number; excludeFolders: string[] }): Promise<string[]> {
	const repos = new Set<string>();

	type Item = { dir: string; depth: number };
	const stack: Item[] = [{ dir: root, depth: 0 }];

	while (stack.length > 0) {
		const { dir, depth } = stack.pop()!;

		// If current dir is a Git repo, record and do not descend into it
		if (await hasDotGit(dir)) {
			repos.add(dir);
			continue;
		}

		if (depth >= options.maxDepth) {
			continue;
		}

		let entries: import('node:fs').Dirent[] = [];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (shouldSkipEntry(entry, options.excludeFolders)) {
				continue;
			}
			const child = path.join(dir, entry.name);
			stack.push({ dir: child, depth: depth + 1 });
		}
	}

	return Array.from(repos);
}

function runGit(cwd: string, args: string[], token: vscode.CancellationToken, output: vscode.OutputChannel): Promise<number | null> {
	return new Promise<number | null>((resolve) => {
		const child = spawn('git', ['-C', cwd, ...args], { stdio: 'pipe' });

		const repoName = path.basename(cwd);
		output.appendLine(`\n=== ${repoName} » git ${args.join(' ')} ===`);

		const onData = (data: Buffer) => output.append(data.toString());
		const onErr = (data: Buffer) => output.append(data.toString());
		child.stdout.on('data', onData);
		child.stderr.on('data', onErr);

		const onCancel = () => {
			try { child.kill(); } catch { /* noop */ }
		};
		token.onCancellationRequested(onCancel);

		child.on('error', (e) => {
			output.appendLine(`Error starting git: ${String((e as any)?.message || e)}`);
			resolve(null);
		});
		child.on('close', (code) => {
			output.appendLine(`=== ${repoName} » exit code ${code} ===`);
			resolve(code);
		});
	});
}

async function pickOrPromptGitArgs(): Promise<string[] | undefined> {
	const choice = await vscode.window.showQuickPick([
		...PRESETS.map(p => ({ label: p.label, description: p.description, args: p.args } as any)),
		{ label: 'Custom…', description: 'Enter any git arguments', args: null as any },
	], { placeHolder: 'Select a Git command to run across all workspace folders' }) as (GitPick | { label: string; args: null }) | undefined;

	if (!choice) {
		return undefined;
	}
	if ((choice as any).args === null) {
		const custom = await vscode.window.showInputBox({
			title: 'Enter git arguments (without the leading "git")',
			prompt: 'Example: status -sb | pull --rebase | fetch --all --prune',
			value: 'status -sb'
		});
		if (!custom) {
			return undefined;
		}
		return custom.trim().split(/\s+/).filter(Boolean);
	}
	return (choice as GitPick).args;
}

export function activate(context: vscode.ExtensionContext) {
	const output = createOutput();

	async function getAllRepos(): Promise<RepoInfo[]> {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || folders.length === 0) {
			return [];
		}

		const config = vscode.workspace.getConfiguration('multiRepoGit');
		const scanNested = config.get<boolean>('scanNested', true);
		const maxDepth = Math.max(0, config.get<number>('maxDepth', 2));
		const excludeFolders = config.get<string[]>('excludeFolders', ['node_modules', '.git', 'dist', 'build', 'out', '.next', '.cache']);

		const repoPaths = new Set<string>();
		for (const f of folders) {
			const rootPath = f.uri.fsPath;
			if (await isGitRepo(rootPath) || await hasDotGit(rootPath)) {
				repoPaths.add(rootPath);
			}
			if (scanNested) {
				const found = await discoverGitRepos(rootPath, { maxDepth, excludeFolders });
				for (const p of found) {
					repoPaths.add(p);
				}
			}
		}

		return Array.from(repoPaths).map(p => ({ name: path.basename(p), path: p })).sort((a, b) => a.name.localeCompare(b.name));
	}

	// Tree view provider
	const treeProvider = new RepoTreeProvider(getAllRepos);
	vscode.window.createTreeView('multiRepoGitView', {
		treeDataProvider: treeProvider,
		showCollapseAll: false
	});

	// Refresh tree on workspace or config changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(() => treeProvider.refresh()),
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('multiRepoGit')) {
				treeProvider.refresh();
			}
		})
	);

	async function runAcrossRepos(args: string[], repos?: RepoInfo[]) {
		let repoList = repos;
		repoList ??= await getAllRepos();
		if (repoList.length === 0) {
			vscode.window.showWarningMessage('No Git repositories found.');
			return;
		}

		output.clear();
		output.show(true);

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Running: git ${args.join(' ')} on ${repoList.length} repo(s)`,
			cancellable: true,
		}, async (_progress, token) => {
			for (const repo of repoList) {
				if (token.isCancellationRequested) {
					break;
				}
				await runGit(repo.path, args, token, output);
			}
		});

		treeProvider.refresh();
	}

	const runPresetOrCustom = vscode.commands.registerCommand('multi-repo-git-commands.runGitAll', async () => {
		const args = await pickOrPromptGitArgs();
		if (!args) {
			return;
		}
		await runAcrossRepos(args);
	});

	const runCustom = vscode.commands.registerCommand('multi-repo-git-commands.runCustomGitAll', async () => {
		const args = await pickOrPromptGitArgs();
		if (!args) {
			return;
		}
		await runAcrossRepos(args);
	});

	const runStatus = vscode.commands.registerCommand('multi-repo-git-commands.statusAll', async () => {
		await runAcrossRepos(['status', '-sb']);
	});

	const runFetch = vscode.commands.registerCommand('multi-repo-git-commands.fetchAll', async () => {
		await runAcrossRepos(['fetch', '--all', '--prune']);
	});

	const runPull = vscode.commands.registerCommand('multi-repo-git-commands.pullAll', async () => {
		await runAcrossRepos(['pull', '--rebase']);
	});

	const runDiscard = vscode.commands.registerCommand('multi-repo-git-commands.discardAll', async () => {
		const confirm = await vscode.window.showWarningMessage(
			'This will discard ALL uncommitted changes in ALL repositories. This action cannot be undone!',
			{ modal: true },
			'Discard All Changes'
		);
		if (confirm === 'Discard All Changes') {
			await runAcrossRepos(['reset', '--hard', 'HEAD']);
			await runAcrossRepos(['clean', '-fd']);
		}
	});

	const checkoutAll = vscode.commands.registerCommand('multi-repo-git-commands.checkoutAll', async () => {
		const branchName = await vscode.window.showInputBox({
			title: 'Checkout branch on all repositories',
			prompt: 'Enter the branch name to checkout',
			placeHolder: 'main',
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'Branch name cannot be empty';
				}
				return null;
			}
		});
		if (!branchName) {
			return;
		}
		await runAcrossRepos(['checkout', branchName.trim()]);
	});

	// Tree item commands
	const openRepo = vscode.commands.registerCommand('multi-repo-git-commands.openRepo', async (item: any) => {
		const repo = item?.repo || item;
		if (!repo?.path) {
			return;
		}
		const uri = vscode.Uri.file(repo.path);
		await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false, noRecentEntry: false });
	});

	const statusRepo = vscode.commands.registerCommand('multi-repo-git-commands.statusRepo', async (item: any) => {
		const repo = item?.repo || item;
		if (!repo?.path) {
			return;
		}
		await runAcrossRepos(['status', '-sb'], [repo]);
	});

	const fetchRepo = vscode.commands.registerCommand('multi-repo-git-commands.fetchRepo', async (item: any) => {
		const repo = item?.repo || item;
		if (!repo?.path) {
			return;
		}
		await runAcrossRepos(['fetch', '--all', '--prune'], [repo]);
	});

	const pullRepo = vscode.commands.registerCommand('multi-repo-git-commands.pullRepo', async (item: any) => {
		const repo = item?.repo || item;
		if (!repo?.path) {
			return;
		}
		await runAcrossRepos(['pull', '--rebase'], [repo]);
	});

	const customRepo = vscode.commands.registerCommand('multi-repo-git-commands.customRepo', async (item: any) => {
		const repo = item?.repo || item;
		if (!repo?.path) {
			return;
		}
		const args = await pickOrPromptGitArgs();
		if (!args) {
			return;
		}
		await runAcrossRepos(args, [repo]);
	});

	const discardRepo = vscode.commands.registerCommand('multi-repo-git-commands.discardRepo', async (item: any) => {
		const repo = item?.repo || item;
		if (!repo?.path) {
			return;
		}
		const confirm = await vscode.window.showWarningMessage(
			`This will discard ALL uncommitted changes in "${repo.name}". This action cannot be undone!`,
			{ modal: true },
			'Discard Changes'
		);
		if (confirm === 'Discard Changes') {
			await runAcrossRepos(['reset', '--hard', 'HEAD'], [repo]);
			await runAcrossRepos(['clean', '-fd'], [repo]);
		}
	});

	const checkoutRepo = vscode.commands.registerCommand('multi-repo-git-commands.checkoutRepo', async (item: any) => {
		const repo = item?.repo || item;
		if (!repo?.path) {
			return;
		}
		const branchName = await vscode.window.showInputBox({
			title: `Checkout branch on ${repo.name}`,
			prompt: 'Enter the branch name to checkout',
			placeHolder: 'main',
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'Branch name cannot be empty';
				}
				return null;
			}
		});
		if (!branchName) {
			return;
		}
		await runAcrossRepos(['checkout', branchName.trim()], [repo]);
	});

	const refreshTree = vscode.commands.registerCommand('multi-repo-git-commands.refreshTree', () => {
		treeProvider.refresh();
	});

	context.subscriptions.push(
		runPresetOrCustom,
		runCustom,
		runStatus,
		runFetch,
		runPull,
		runDiscard,
		checkoutAll,
		openRepo,
		statusRepo,
		fetchRepo,
		pullRepo,
		customRepo,
		discardRepo,
		checkoutRepo,
		refreshTree,
		output
	);
}

export function deactivate() {
	// noop
}
