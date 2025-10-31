import * as vscode from 'vscode';
import * as path from 'node:path';

export interface RepoInfo {
    name: string;
    path: string;
}

export class RepoTreeItem extends vscode.TreeItem {
    constructor(
        public readonly repo: RepoInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(repo.name, collapsibleState);
        this.tooltip = repo.path;
        this.description = path.dirname(repo.path);
        this.contextValue = 'gitRepo';
        this.iconPath = new vscode.ThemeIcon('repo');
        // No command on click - use context menu instead
    }
}

export class RepoTreeProvider implements vscode.TreeDataProvider<RepoTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<RepoTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private getRepos: () => Promise<RepoInfo[]>) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: RepoTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: RepoTreeItem): Promise<RepoTreeItem[]> {
        if (element) {
            return [];
        }
        const repos = await this.getRepos();
        return repos.map(r => new RepoTreeItem(r, vscode.TreeItemCollapsibleState.None));
    }
}
