import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { simpleGit } from 'simple-git';

export async function isGitRepo(cwd: string): Promise<boolean> {
    try {
        const git = simpleGit(cwd);
        return await git.checkIsRepo();
    } catch {
        return false;
    }
}

export async function hasDotGit(dir: string): Promise<boolean> {
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

export async function discoverGitRepos(root: string, options: { maxDepth: number; excludeFolders: string[] }): Promise<string[]> {
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

export async function getAllGitRepos(): Promise<string[]> {
    const config = vscode.workspace.getConfiguration('multiRepoGit');
    const scanNested = config.get<boolean>('scanNested', true);
    const maxDepth = config.get<number>('maxDepth', 2);
    const excludeFolders = config.get<string[]>('excludeFolders', ['node_modules', '.git', 'dist', 'build', 'out']);

    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
        return [];
    }

    const allRepos: string[] = [];
    for (const folder of folders) {
        const root = folder.uri.fsPath;
        if (scanNested) {
            const repos = await discoverGitRepos(root, { maxDepth, excludeFolders });
            allRepos.push(...repos);
        } else {
            if (await isGitRepo(root)) {
                allRepos.push(root);
            }
        }
    }
    return [...new Set(allRepos)];
}
