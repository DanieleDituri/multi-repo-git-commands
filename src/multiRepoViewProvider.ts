import * as vscode from 'vscode';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { getAllGitRepos } from './repoDiscovery';

export class MultiRepoViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'multi-repo-git-view';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _output: vscode.OutputChannel
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'searchBranch':
                    await this._searchBranch(data.value);
                    break;
                case 'searchCommit':
                    await this._searchCommit(data.value, data.filters);
                    break;
                case 'pickBranchFilter':
                    await this._pickBranchFilter();
                    break;
                case 'runCommand':
                    await vscode.commands.executeCommand(data.command);
                    break;
                case 'checkoutBranch':
                    await this._checkoutBranch(data.repoPath, data.branchName);
                    break;
            }
        });
    }

    public async updateRepoState(repoPath: string) {
        try {
            const git = simpleGit(repoPath);
            const local = await git.branchLocal();
            const currentBranch = local.current;
            this._view?.webview.postMessage({ type: 'branchUpdated', repoPath, branchName: currentBranch });
        } catch (e) {
            console.error('Error updating repo state', e);
        }
    }

    private async _checkoutBranch(repoPath: string, branchName: string) {
        try {
            const git = simpleGit(repoPath);
            const repoName = path.basename(repoPath);
            this._output.appendLine(`\n=== ${repoName} » Checkout ${branchName} ===`);

            // Check if it's a remote branch that needs tracking
            const branches = await git.branch();
            if (!branches.all.includes(branchName)) {
                // It might be a remote branch, try to checkout as is (git handles remote tracking often)
                // or find the remote branch name
                await git.checkout(branchName);
            } else {
                await git.checkout(branchName);
            }

            this._output.appendLine(`Checked out ${branchName}.`);
            vscode.window.showInformationMessage(`Checked out ${branchName} in ${repoName}`);

            // Notify webview to update the UI
            this._view?.webview.postMessage({ type: 'branchUpdated', repoPath, branchName });
        } catch (e: any) {
            this._output.appendLine(`Error: ${e.message || e}`);
            vscode.window.showErrorMessage(`Failed to checkout ${branchName}: ${e.message || e}`);
        }
    }

    private async _searchBranch(query: string) {
        if (!query) {
            return;
        }
        this._view?.webview.postMessage({ type: 'started' });

        const repos = await getAllGitRepos();
        const results: { name: string; path: string; currentBranch: string; matches: { label: string; value: string; type: 'branch' }[] }[] = [];

        await Promise.all(repos.map(async (repoPath) => {
            try {
                const git = simpleGit(repoPath);
                const local = await git.branchLocal();
                const currentBranch = local.current;
                const matches: { label: string; value: string; type: 'branch' }[] = [];

                // Find all local branches
                local.all.filter(b => b.includes(query)).forEach(b => {
                    matches.push({ label: b, value: b, type: 'branch' });
                });

                const remotes = await git.branch(['-r']);
                // Find all remote branches
                remotes.all.filter(b => b.includes(query)).forEach(b => {
                    let branchName = b;
                    // Try to strip remote name if possible (e.g. origin/feature -> feature)
                    const parts = branchName.split('/');
                    if (parts.length > 1 && (parts[0] === 'origin' || parts[0] === 'upstream')) {
                        branchName = parts.slice(1).join('/');
                    }
                    // Avoid duplicates if local branch exists with same name
                    if (!matches.find(m => m.value === branchName)) {
                        matches.push({ label: b, value: branchName, type: 'branch' });
                    }
                });

                if (matches.length > 0) {
                    results.push({ name: path.basename(repoPath), path: repoPath, currentBranch, matches });
                }
            } catch (e) {
                console.error(`Error checking repo ${repoPath}:`, e);
            }
        }));

        this._view?.webview.postMessage({ type: 'results', results });
    }

    private async _pickBranchFilter() {
        const repos = await getAllGitRepos();
        const allBranches = new Set<string>();

        await Promise.all(repos.map(async (repoPath) => {
            try {
                const git = simpleGit(repoPath);
                const branches = await git.branch();
                branches.all.forEach(b => {
                    let name = b;
                    if (name.startsWith('remotes/')) {
                        const parts = name.split('/');
                        if (parts.length > 2) {
                            name = parts.slice(2).join('/');
                        }
                    }
                    allBranches.add(name);
                });
            } catch (e) {
                console.error(`Error fetching branches for ${repoPath}:`, e);
            }
        }));

        const sortedBranches = Array.from(allBranches).sort();
        const pick = await vscode.window.showQuickPick(sortedBranches, {
            placeHolder: 'Select branch to filter by'
        });

        if (pick) {
            this._view?.webview.postMessage({ type: 'branchFilterSelected', branch: pick });
        }
    }

    private async _searchCommit(commitTitle: string, filters?: { author?: string; dateFrom?: string; dateTo?: string; branch?: string }) {
        if (!commitTitle && (!filters || (!filters.author && !filters.dateFrom && !filters.dateTo && !filters.branch))) {
            return;
        }
        this._view?.webview.postMessage({ type: 'started' });

        const repos = await getAllGitRepos();
        const results: {
            name: string;
            path: string;
            currentBranch: string;
            matches: {
                type: 'commit';
                hash: string;
                shortHash: string;
                message: string;
                author: string;
                date: string;
                refs: string;
            }[]
        }[] = [];

        await Promise.all(repos.map(async (repoPath) => {
            try {
                const git = simpleGit(repoPath);
                const local = await git.branchLocal();
                const currentBranch = local.current;

                const logOptions: string[] = ['--all'];
                if (commitTitle) {
                    logOptions.push(`--grep=${commitTitle}`);
                }
                if (filters?.author) {
                    logOptions.push(`--author=${filters.author}`);
                }
                if (filters?.dateFrom) {
                    logOptions.push(`--since=${filters.dateFrom}`);
                }
                if (filters?.dateTo) {
                    logOptions.push(`--until=${filters.dateTo}`);
                }

                if (filters?.branch) {
                    const index = logOptions.indexOf('--all');
                    if (index > -1) {
                        logOptions.splice(index, 1);
                    }
                    logOptions.push(filters.branch);
                }

                // Search for commit message
                const log = await git.log(logOptions);
                if (log.total > 0) {
                    const matches = log.all.map(commit => ({
                        type: 'commit' as const,
                        hash: commit.hash,
                        shortHash: commit.hash.substring(0, 7),
                        message: commit.message,
                        author: commit.author_name,
                        date: commit.date,
                        refs: commit.refs
                    }));
                    results.push({ name: path.basename(repoPath), path: repoPath, currentBranch, matches });
                }
            } catch (e) {
                console.error(`Error checking repo ${repoPath}:`, e);
            }
        }));

        this._view?.webview.postMessage({ type: 'results', results });
    } private _getHtmlForWebview(webview: vscode.Webview) {
        // Inline styles for simplicity
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Multi Repo Search</title>
                <link href="${codiconsUri}" rel="stylesheet" />
				<style>
					body { padding: 10px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
					.section { margin-bottom: 20px; }
					h3 { font-size: 1.1em; margin-bottom: 8px; text-transform: uppercase; opacity: 0.8; }
					input { 
						width: 100%; 
						padding: 6px; 
						box-sizing: border-box; 
						background: var(--vscode-input-background); 
						color: var(--vscode-input-foreground); 
						border: 1px solid var(--vscode-input-border); 
                        margin-bottom: 8px;
					}
                    input:focus {
                        outline: 1px solid var(--vscode-focusBorder);
                    }
					button { 
						width: 100%; 
						padding: 6px; 
						background: var(--vscode-button-background); 
						color: var(--vscode-button-foreground); 
						border: none; 
						cursor: pointer; 
                        margin-bottom: 4px;
					}
					button:hover { background: var(--vscode-button-hoverBackground); }
                    .results { margin-top: 10px; }
                    .repo-item { 
                        padding: 8px 0; 
                        border-bottom: 1px solid var(--vscode-panel-border); 
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }
                    .repo-item:last-child { border-bottom: none; }
                    .repo-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .repo-name { font-weight: bold; }
                    .repo-current { font-size: 0.9em; opacity: 0.8; }
                    .repo-match { 
                        display: flex; 
                        flex-direction: column;
                        gap: 4px;
                        font-size: 0.9em;
                        background: var(--vscode-textBlockQuote-background);
                        padding: 4px;
                        border-radius: 4px;
                    }
                    .match-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 2px 0;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .match-item:last-child { border-bottom: none; }
                    .match-name { font-family: var(--vscode-editor-font-family); word-break: break-all; }
                    .repo-actions button {
                        width: auto;
                        padding: 2px 8px;
                        font-size: 0.9em;
                        white-space: nowrap;
                    }
                    
                    /* Commit Search Styles */
                    .commit-match {
                        padding: 8px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }
                    .commit-match:last-child { border-bottom: none; }
                    .commit-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
                    .commit-row.main { font-weight: bold; }
                    .commit-message { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                    .commit-hash { font-family: var(--vscode-editor-font-family); font-size: 0.9em; opacity: 0.8; flex-shrink: 0; }
                    .commit-row.meta { font-size: 0.85em; opacity: 0.8; }
                    .commit-refs { 
                        font-size: 0.85em; 
                        color: var(--vscode-textPreformat-foreground); 
                        background: var(--vscode-textBlockQuote-background); 
                        padding: 2px 6px; 
                        border-radius: 10px; 
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                    }

                    details { width: 100%; }
                    summary { cursor: pointer; font-weight: bold; margin-bottom: 4px; }
                    .matches-list { display: flex; flex-direction: column; gap: 2px; }
                    .loading { opacity: 0.6; font-style: italic; display: none; }
                    
                    /* Toolbar Styles */
                    .toolbar { 
                        display: grid; 
                        grid-template-columns: repeat(auto-fill, minmax(85px, 1fr));
                        gap: 10px; 
                        margin-bottom: 20px; 
                    }
                    .icon-btn {
                        width: 100%;
                        height: 75px;
                        padding: 10px 4px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        border-radius: 6px;
                        gap: 8px;
                    }
                    .icon-btn svg {
                        width: 24px;
                        height: 24px;
                        fill: currentColor;
                    }
                    .btn-label {
                        font-size: 0.9em;
                        text-align: center;
                        line-height: 1;
                        font-weight: 500;
                    }
				</style>
			</head>
			<body>
                <div class="section">
                    <h3>Global Actions</h3>
                    <div class="toolbar">
                        <button class="icon-btn" title="Fetch All" onclick="runCmd('multi-repo-git-commands.fetchAll')">
                            <svg viewBox="0 0 16 16"><path d="M2.5 7.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-3zM3 8v2h8V8H3zm-2 3.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5H1.5a.5.5 0 0 1-.5-.5v-3zM2 12v2h12v-2H2zm.5-8a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-2zM3 4v1h4V4H3z"/></svg>
                            <span class="btn-label">Fetch</span>
                        </button>
                        <button class="icon-btn" title="Pull All" onclick="runCmd('multi-repo-git-commands.pullAll')">
                            <svg viewBox="0 0 16 16"><path d="M13 6h-2v4H5V6H3l5-5 5 5zM6 12v2h4v-2H6z"/></svg>
                            <span class="btn-label">Pull</span>
                        </button>
                        <button class="icon-btn" title="Push All" onclick="runCmd('multi-repo-git-commands.pushAll')">
                            <svg viewBox="0 0 16 16"><path d="M3 10h2V6h6v4h2L8 15l-5-5zm7-6V2H6v2h4z"/></svg>
                            <span class="btn-label">Push</span>
                        </button>
                        <button class="icon-btn" title="Commit All" onclick="runCmd('multi-repo-git-commands.commitAll')">
                            <svg viewBox="0 0 16 16"><path d="M13.5 7h-2.1a3.5 3.5 0 0 0-6.8 0H2.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h2.1a3.5 3.5 0 0 0 6.8 0h2.1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5zM8 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
                            <span class="btn-label">Commit</span>
                        </button>
                        <button class="icon-btn" title="Switch Branch" onclick="runCmd('multi-repo-git-commands.checkoutAll')">
                            <svg viewBox="0 0 16 16"><path d="M8 1a3 3 0 0 1 3 3c0 1.2-.7 2.2-1.7 2.7L10 9.6a3 3 0 0 1 1.7 2.7c0 1.7-1.3 3-3 3s-3-1.3-3-3c0-1.2.7-2.2 1.7-2.7L6.8 7H5a2 2 0 0 0-2 2v4a1 1 0 0 1-2 0V9a4 4 0 0 1 4-4h1.8L6.1 3.7A3 3 0 0 1 8 1z"/></svg>
                            <span class="btn-label">Switch</span>
                        </button>
                        <button class="icon-btn" title="Stage All" onclick="runCmd('multi-repo-git-commands.stageAll')">
                            <svg viewBox="0 0 16 16"><path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/></svg>
                            <span class="btn-label">Stage</span>
                        </button>
                        <button class="icon-btn" title="Unstage All" onclick="runCmd('multi-repo-git-commands.unstageAll')">
                            <svg viewBox="0 0 16 16"><path d="M14 7v1H1V7h13z"/></svg>
                            <span class="btn-label">Unstage</span>
                        </button>
                        <button class="icon-btn" title="Stash All" onclick="runCmd('multi-repo-git-commands.stashAll')">
                            <svg viewBox="0 0 16 16"><path d="M14 4H2V3h12v1zm0 2H2v7h12V6zM3 7h10v5H3V7zm1-4h8V2H4v1z"/></svg>
                            <span class="btn-label">Stash</span>
                        </button>
                        <button class="icon-btn" title="Pop Stash All" onclick="runCmd('multi-repo-git-commands.popStashAll')">
                            <svg viewBox="0 0 16 16"><path d="M14 11v2H2v-2h12zm-1-1H3V6h10v4zM4 7v2h8V7H4zm4-5l3 3H9v3H7V5H5l3-3z"/></svg>
                            <span class="btn-label">Pop</span>
                        </button>
                        <button class="icon-btn" title="Discard All" onclick="runCmd('multi-repo-git-commands.discardAll')">
                            <svg viewBox="0 0 16 16"><path d="M11 2H9c0-.55-.45-1-1-1H8c-.55 0-1 .45-1 1H5c-.55 0-1 .45-1 1v1h8V3c0-.55-.45-1-1-1zM4 5v9c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V5H4zm2 8H5V7h1v6zm2 0H7V7h1v6zm2 0H9V7h1v6zm2 0h-1V7h1v6z"/></svg>
                            <span class="btn-label">Discard</span>
                        </button>
                    </div>
                </div>

				<div class="section">
					<h3>Search Branch</h3>
					<input type="text" id="branchInput" placeholder="e.g. feature/login" />
					<button id="searchBranchBtn">Search</button>
				</div>

				<div class="section">
					<h3>Search Commit</h3>
                    <div style="display: flex; gap: 4px; margin-bottom: 8px;">
					    <input type="text" id="commitInput" placeholder="e.g. Fix login bug" style="margin-bottom: 0; flex: 1;" />
                        <button id="toggleFiltersBtn" style="width: auto; padding: 6px 10px; margin-bottom: 0;" title="Filters">
                            <i class="codicon codicon-filter"></i>
                        </button>
                    </div>
                    
                    <div id="commitFilters" class="filters" style="display: none; margin-bottom: 8px; padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px;">
                        <div class="filter-row">
                            <input type="text" id="authorInput" placeholder="Author" />
                        </div>
                        <div class="filter-row" style="display: flex; gap: 4px;">
                            <input type="date" id="dateFromInput" title="From Date" max="9999-12-31" />
                            <input type="date" id="dateToInput" title="To Date" max="9999-12-31" />
                        </div>
                        <div class="filter-row" style="display: flex; gap: 4px;">
                            <input type="text" id="branchFilterInput" readonly placeholder="All Branches" style="flex: 1;" />
                            <button id="selectBranchFilterBtn" style="width: auto; padding: 0 8px;">Select</button>
                            <button id="clearBranchFilterBtn" style="width: auto; padding: 0 8px;" title="Clear">x</button>
                        </div>
                    </div>

					<button id="searchCommitBtn">Search</button>
				</div>

                <div id="loading" class="loading">Searching...</div>
				<div id="results" class="results"></div>

				<script>
					const vscode = acquireVsCodeApi();
                    const resultsDiv = document.getElementById('results');
                    const loadingDiv = document.getElementById('loading');
                    let currentSearchType = '';
                    let currentSearchValue = '';

                    function runCmd(command) {
                        vscode.postMessage({ type: 'runCommand', command });
                    }

                    function checkoutBranch(repoPath, branchName) {
                        vscode.postMessage({ type: 'checkoutBranch', repoPath, branchName });
                    }

                    document.getElementById('toggleFiltersBtn').addEventListener('click', () => {
                        const filters = document.getElementById('commitFilters');
                        filters.style.display = filters.style.display === 'none' ? 'block' : 'none';
                    });

                    // Enforce max year length and prevent rolling
                    ['dateFromInput', 'dateToInput'].forEach(id => {
                        const el = document.getElementById(id);
                        let lastValue = el.value;
                        let isDigit = false;

                        el.addEventListener('keydown', (e) => {
                            isDigit = /^\d$/.test(e.key);
                        });

                        el.addEventListener('input', (e) => {
                            const newVal = e.target.value;
                            if (!newVal) {
                                lastValue = '';
                                return;
                            }
                            
                            const newParts = newVal.split('-');
                            const newYear = newParts[0];
                            
                            if (!lastValue) {
                                lastValue = newVal;
                                return;
                            }

                            const oldParts = lastValue.split('-');
                            const oldYear = oldParts[0];

                            // Block if year > 4 digits OR if typing a digit causes a shift in a full year (>= 1000)
                            if (newYear.length > 4 || (isDigit && oldYear.length === 4 && oldYear[0] !== '0' && newYear !== oldYear)) {
                                e.target.value = lastValue;
                            } else {
                                lastValue = newVal;
                            }
                        });
                    });

                    document.getElementById('searchBranchBtn').addEventListener('click', () => {
                        const value = document.getElementById('branchInput').value;
                        if(value) {
                            currentSearchType = 'branch';
                            currentSearchValue = value;
                            vscode.postMessage({ type: 'searchBranch', value });
                        }
                    });

                    document.getElementById('searchCommitBtn').addEventListener('click', () => {
                        const value = document.getElementById('commitInput').value;
                        const author = document.getElementById('authorInput').value;
                        const dateFrom = document.getElementById('dateFromInput').value;
                        const dateTo = document.getElementById('dateToInput').value;
                        const branch = document.getElementById('branchFilterInput').value;

                        if(value || author || dateFrom || dateTo || branch) {
                            currentSearchType = 'commit';
                            currentSearchValue = value;
                            vscode.postMessage({ 
                                type: 'searchCommit', 
                                value,
                                filters: { author, dateFrom, dateTo, branch: branch === 'All Branches' ? '' : branch }
                            });
                        }
                    });

                    document.getElementById('selectBranchFilterBtn').addEventListener('click', () => {
                        vscode.postMessage({ type: 'pickBranchFilter' });
                    });

                    document.getElementById('clearBranchFilterBtn').addEventListener('click', () => {
                        document.getElementById('branchFilterInput').value = '';
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'branchFilterSelected':
                                document.getElementById('branchFilterInput').value = message.branch;
                                break;
                            case 'started':
                                loadingDiv.style.display = 'block';
                                resultsDiv.innerHTML = '';
                                break;
                            case 'results':
                                loadingDiv.style.display = 'none';
                                const repos = message.results;
                                if (repos.length === 0) {
                                    resultsDiv.innerHTML = '<div>No repositories found.</div>';
                                } else {
                                    resultsDiv.innerHTML = repos.map(r => {
                                        let matchHtml = '';
                                        // Escape paths for JS string
                                        const safePath = r.path.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");

                                        if (r.matches && r.matches.length > 0) {
                                            const items = r.matches.map(m => {
                                                if (m.type === 'branch') {
                                                     const safeBranch = m.value.replace(/'/g, "\\\\'");
                                                     const action = \`<div class="repo-actions"><button onclick="checkoutBranch('\${safePath}', '\${safeBranch}')">Checkout</button></div>\`;
                                                     return \`<div class="match-item">
                                                        <span class="match-name">\${m.label}</span>
                                                        \${action}
                                                    </div>\`;
                                                } else if (m.type === 'commit') {
                                                    const dateObj = new Date(m.date);
                                                    const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();
                                                    
                                                    return \`<div class="commit-match">
                                                        <div class="commit-row main">
                                                            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
                                                                <i class="codicon codicon-git-commit"></i>
                                                                <span class="commit-message" title="\${m.message}">\${m.message}</span>
                                                            </div>
                                                            <span class="commit-hash">\${m.shortHash}</span>
                                                        </div>
                                                        <div class="commit-row meta">
                                                            <span class="commit-author"><i class="codicon codicon-account"></i> \${m.author}</span>
                                                            <span class="commit-date"><i class="codicon codicon-calendar"></i> \${dateStr}</span>
                                                        </div>
                                                        \${m.refs ? \`<div class="commit-row refs"><span class="commit-refs" title="Git References (Branches/Tags)"><i class="codicon codicon-tag"></i> <strong>Refs:</strong> \${m.refs}</span></div>\` : ''}
                                                    </div>\`;
                                                }
                                            }).join('');
                                            
                                            matchHtml = \`<div class="repo-match">
                                                <details>
                                                    <summary>Found (\${r.matches.length})</summary>
                                                    <div class="matches-list">\${items}</div>
                                                </details>
                                            </div>\`;
                                        }
                                        
                                        const currentBranchHtml = r.currentBranch ? \`<span class="repo-current" data-repo-path="\${safePath}">Current: \${r.currentBranch}</span>\` : '';

                                        return \`<div class="repo-item" data-repo-path="\${safePath}">
                                            <div class="repo-header">
                                                <span class="repo-name">\${r.name}</span>
                                                \${currentBranchHtml}
                                            </div>
                                            \${matchHtml}
                                        </div>\`;
                                    }).join('');
                                }
                                break;
                            case 'branchUpdated':
                                const { repoPath, branchName } = message;
                                // Find the element and update it
                                const currentSpan = document.querySelector(\`.repo-current[data-repo-path="\${repoPath.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"') }"]\`);
                                if (currentSpan) {
                                    currentSpan.textContent = 'Current: ' + branchName;
                                }
                                break;
                        }
                    });
				</script>
			</body>
			</html>`;
    }
}
