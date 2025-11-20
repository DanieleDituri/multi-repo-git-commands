import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
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
	{ label: 'Push', description: 'git push', args: ['push'] },
	{ label: 'Show branch', description: 'git branch --show-current', args: ['branch', '--show-current'] },
	{ label: 'Discard all changes', description: 'git reset --hard HEAD', args: ['reset', '--hard', 'HEAD'] },
];

function createOutput(): vscode.OutputChannel {
	return vscode.window.createOutputChannel('Multi Repo Git');
}

async function isGitRepo(cwd: string): Promise<boolean> {
	try {
		const git = simpleGit(cwd);
		return await git.checkIsRepo();
	} catch {
		return false;
	}
}

async function hasDotGit(dir: string): Promise<boolean> {
	try {
		await fs.stat(path.join(dir, '.git'));
		return true;
	} catch {
		return false;
	}
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

	// Tree View removed


	async function runGitOperation(
		operationName: string,
		repos: RepoInfo[] | undefined,
		action: (git: SimpleGit, repoName: string) => Promise<any>
	) {
		let repoList = repos;
		repoList ??= await getAllRepos();
		if (repoList.length === 0) {
			vscode.window.showWarningMessage('No Git repositories found.');
			return;
		}

		output.clear();
		output.clear();
		// output.show(true); // Keep background execution

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `${operationName} on ${repoList.length} repo(s)`,
			cancellable: true,
		}, async (_progress, token) => {
			for (const repo of repoList) {
				if (token.isCancellationRequested) {
					break;
				}
				const repoName = path.basename(repo.path);
				output.appendLine(`\n=== ${repoName} » ${operationName} ===`);

				try {
					const git = simpleGit(repo.path);
					await action(git, repoName);
				} catch (e: any) {
					output.appendLine(`Error: ${e.message || e}`);
				}
			}
		});

		treeProvider.refresh();
	}

	// --- Command Implementations ---

	const runCustom = async (repos?: RepoInfo[]) => {
		const args = await pickOrPromptGitArgs();
		if (!args) return;
		await runGitOperation(`git ${args.join(' ')}`, repos, async (git, repoName) => {
			const res = await git.raw(args);
			if (res) output.append(res);
			output.appendLine(`=== ${repoName} » Done ===`);
		});
	};

	const runStatus = async (repos?: RepoInfo[]) => {
		await runGitOperation('Status', repos, async (git) => {
			const res = await git.status();
			output.appendLine(`On branch ${res.current}`);
			if (res.isClean()) {
				output.appendLine('nothing to commit, working tree clean');
			} else {
				res.files.forEach(f => output.appendLine(`${f.working_dir} ${f.path}`));
			}
		});
	};

	const runFetch = async (repos?: RepoInfo[]) => {
		await runGitOperation('Fetch', repos, async (git) => {
			await git.fetch(['--all', '--prune']);
			output.appendLine('Fetch completed.');
		});
	};

	const runPull = async (repos?: RepoInfo[]) => {
		await runGitOperation('Pull (rebase)', repos, async (git) => {
			await git.pull(undefined, undefined, { '--rebase': null });
			output.appendLine('Pull completed.');
		});
	};

	const runPush = async (repos?: RepoInfo[]) => {
		await runGitOperation('Push', repos, async (git) => {
			await git.push();
			output.appendLine('Push completed.');
		});
	};

	const runCommit = async (repos?: RepoInfo[]) => {
		const message = await vscode.window.showInputBox({ prompt: 'Enter commit message' });
		if (!message) return;
		await runGitOperation('Commit', repos, async (git) => {
			await git.commit(message);
			output.appendLine(`Committed: "${message}"`);
		});
	};

	const runStageAll = async (repos?: RepoInfo[]) => {
		await runGitOperation('Stage All', repos, async (git) => {
			await git.add('.');
			output.appendLine('Staged all changes.');
		});
	};

	const runUnstageAll = async (repos?: RepoInfo[]) => {
		await runGitOperation('Unstage All', repos, async (git) => {
			await git.reset(['HEAD']);
			output.appendLine('Unstaged all changes.');
		});
	};

	const runDiscard = async (repos?: RepoInfo[]) => {
		const confirm = await vscode.window.showWarningMessage(
			'Discard ALL uncommitted changes? This cannot be undone!',
			{ modal: true }, 'Discard'
		);
		if (confirm !== 'Discard') return;

		await runGitOperation('Discard Changes', repos, async (git) => {
			await git.reset(['--hard', 'HEAD']);
			await git.clean('f', ['-d']);
			output.appendLine('Discarded all changes.');
		});
	};

	const runStash = async (repos?: RepoInfo[]) => {
		const message = await vscode.window.showInputBox({ prompt: 'Stash message (optional)' });
		await runGitOperation('Stash', repos, async (git) => {
			if (message) {
				await git.stash(['push', '-m', message]);
			} else {
				await git.stash(['push']);
			}
			output.appendLine('Stashed changes.');
		});
	};

	const runPopStash = async (repos?: RepoInfo[]) => {
		await runGitOperation('Pop Stash', repos, async (git) => {
			await git.stash(['pop']);
			output.appendLine('Popped stash.');
		});
	};

	const runCheckout = async (repos?: RepoInfo[]) => {
		let targetRepos = repos;
		if (!targetRepos) {
			targetRepos = await getAllRepos();
		}

		if (targetRepos.length === 0) {
			vscode.window.showWarningMessage('No Git repositories found.');
			return;
		}

		const allBranches = new Set<string>();
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Fetching branches...',
			cancellable: false
		}, async () => {
			await Promise.all(targetRepos!.map(async (repo) => {
				try {
					const git = simpleGit(repo.path);
					const branches = await git.branch(['-a']); // Fetch all branches including remotes
					branches.all.forEach(b => {
						let name = b;
						if (name.startsWith('remotes/')) {
							// Strip 'remotes/origin/' or similar
							const parts = name.split('/');
							if (parts.length > 2) {
								name = parts.slice(2).join('/');
							}
						}
						allBranches.add(name);
					});
				} catch {
					// ignore
				}
			}));
		});

		const sortedBranches = Array.from(allBranches).sort();
		const pick = await vscode.window.showQuickPick(sortedBranches, {
			placeHolder: 'Select branch to checkout'
		});

		if (!pick) return;

		await runGitOperation(`Checkout ${pick}`, targetRepos, async (git) => {
			await git.checkout(pick);
			output.appendLine(`Checked out ${pick}.`);
		});
	};

	const runCreateBranch = async (repos?: RepoInfo[]) => {
		const branch = await vscode.window.showInputBox({ prompt: 'New branch name' });
		if (!branch) return;
		await runGitOperation(`Create Branch ${branch}`, repos, async (git) => {
			await git.checkoutLocalBranch(branch);
			output.appendLine(`Created and checked out ${branch}.`);
		});
	};

	const runDeleteBranch = async (repos?: RepoInfo[]) => {
		const branch = await vscode.window.showInputBox({ prompt: 'Branch name to delete' });
		if (!branch) return;
		await runGitOperation(`Delete Branch ${branch}`, repos, async (git) => {
			await git.deleteLocalBranch(branch, true); // force delete
			output.appendLine(`Deleted branch ${branch}.`);
		});
	};

	const runCreateTag = async (repos?: RepoInfo[]) => {
		const tag = await vscode.window.showInputBox({ prompt: 'Tag name' });
		if (!tag) return;
		await runGitOperation(`Create Tag ${tag}`, repos, async (git) => {
			await git.addTag(tag);
			output.appendLine(`Created tag ${tag}.`);
		});
	};

	const runDeleteTag = async (repos?: RepoInfo[]) => {
		const tag = await vscode.window.showInputBox({ prompt: 'Tag name to delete' });
		if (!tag) return;
		await runGitOperation(`Delete Tag ${tag}`, repos, async (git) => {
			await git.tag(['-d', tag]);
			output.appendLine(`Deleted tag ${tag}.`);
		});
	};

	const runCreateRemote = async (repos?: RepoInfo[]) => {
		const name = await vscode.window.showInputBox({ prompt: 'Remote name', value: 'origin' });
		if (!name) return;
		const url = await vscode.window.showInputBox({ prompt: 'Remote URL' });
		if (!url) return;
		await runGitOperation(`Add Remote ${name}`, repos, async (git) => {
			await git.addRemote(name, url);
			output.appendLine(`Added remote ${name}.`);
		});
	};

	const runDeleteRemote = async (repos?: RepoInfo[]) => {
		const name = await vscode.window.showInputBox({ prompt: 'Remote name to delete' });
		if (!name) return;
		await runGitOperation(`Delete Remote ${name}`, repos, async (git) => {
			await git.removeRemote(name);
			output.appendLine(`Deleted remote ${name}.`);
		});
	};

	// --- Registration ---

	// General / All
	context.subscriptions.push(
		vscode.commands.registerCommand('multi-repo-git-commands.runGitAll', () => runCustom()),
		vscode.commands.registerCommand('multi-repo-git-commands.runCustomGitAll', () => runCustom()),
		vscode.commands.registerCommand('multi-repo-git-commands.statusAll', () => runStatus()),
		vscode.commands.registerCommand('multi-repo-git-commands.fetchAll', () => runFetch()),
		vscode.commands.registerCommand('multi-repo-git-commands.pullAll', () => runPull()),
		vscode.commands.registerCommand('multi-repo-git-commands.pushAll', () => runPush()),
		vscode.commands.registerCommand('multi-repo-git-commands.commitAll', () => runCommit()),
		vscode.commands.registerCommand('multi-repo-git-commands.stageAll', () => runStageAll()),
		vscode.commands.registerCommand('multi-repo-git-commands.unstageAll', () => runUnstageAll()),
		vscode.commands.registerCommand('multi-repo-git-commands.discardAll', () => runDiscard()),
		vscode.commands.registerCommand('multi-repo-git-commands.stashAll', () => runStash()),
		vscode.commands.registerCommand('multi-repo-git-commands.popStashAll', () => runPopStash()),
		vscode.commands.registerCommand('multi-repo-git-commands.checkoutAll', () => runCheckout()),
		vscode.commands.registerCommand('multi-repo-git-commands.createBranchAll', () => runCreateBranch()),
		vscode.commands.registerCommand('multi-repo-git-commands.deleteBranchAll', () => runDeleteBranch()),
		vscode.commands.registerCommand('multi-repo-git-commands.createTagAll', () => runCreateTag()),
		vscode.commands.registerCommand('multi-repo-git-commands.deleteTagAll', () => runDeleteTag()),
		vscode.commands.registerCommand('multi-repo-git-commands.createRemoteAll', () => runCreateRemote()),
		vscode.commands.registerCommand('multi-repo-git-commands.deleteRemoteAll', () => runDeleteRemote())
	);

	// Single Repo (SCM Context Menu)
	const singleRepoWrapper = (fn: (repos?: RepoInfo[]) => Promise<void>) => async (item: vscode.SourceControl) => {
		if (item && item.rootUri) {
			const repo: RepoInfo = {
				name: path.basename(item.rootUri.fsPath),
				path: item.rootUri.fsPath
			};
			await fn([repo]);
		}
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('multi-repo-git-commands.customRepo', singleRepoWrapper(runCustom)),
		vscode.commands.registerCommand('multi-repo-git-commands.openRepo', async (item: vscode.SourceControl) => {
			if (item && item.rootUri) {
				await vscode.commands.executeCommand('vscode.openFolder', item.rootUri, { forceNewWindow: false, noRecentEntry: false });
			}
		})
	);

	context.subscriptions.push(output);
}

export function deactivate() { }
