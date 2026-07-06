import * as vscode from "vscode";
import * as path from "path";
import { simpleGit } from "simple-git";
import { getAllGitRepos } from "./repoDiscovery";
import { HtmlGenerator } from "./htmlGenerator";

export class MultiRepoViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "multi-repo-git-view";

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _output: vscode.OutputChannel,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = HtmlGenerator.generateWebviewHtml(
      webviewView.webview,
      this._extensionUri,
      getNonce(),
    );

    // Listen for configuration changes
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration("multiRepoGit.toolbarButtonSize")) {
          webviewView.webview.html = HtmlGenerator.generateWebviewHtml(
            webviewView.webview,
            this._extensionUri,
            getNonce(),
          );
        }
      },
    );

    let disposed = false;

    webviewView.onDidDispose(() => {
      disposed = true;
      configChangeListener.dispose();
      this._view = undefined;
    });

    webviewView.webview.onDidReceiveMessage(async (data) => {
      if (disposed) return;

      switch (data.type) {
        case "searchBranch":
          if (!disposed) await this._searchBranch(data.value);
          break;
        case "searchTag":
          if (!disposed) await this._searchTag(data.value);
          break;
        case "searchCommit":
          if (!disposed) await this._searchCommit(data.value, data.filters);
          break;
        case "pickBranchFilter":
          if (!disposed) await this._pickBranchFilter();
          break;
        case "runCommand":
          await vscode.commands.executeCommand(data.command);
          break;
        case "checkoutBranch":
          if (!disposed) await this._checkoutBranch(data.repoPath, data.branchName);
          break;
        case "checkoutTag":
          if (!disposed) await this._checkoutTag(data.repoPath, data.tagName);
          break;
      }
    });
  }

  public async updateRepoState(repoPath: string) {
    try {
      const git = simpleGit(repoPath);
      const local = await git.branchLocal();
      const currentBranch = local.current;
      this._view?.webview.postMessage({
        type: "branchUpdated",
        repoPath,
        branchName: currentBranch,
      });
    } catch (e) {
      console.error("Error updating repo state", e);
    }
  }

  private async _checkoutBranch(repoPath: string, branchName: string) {
    try {
      const git = simpleGit(repoPath);
      const repoName = path.basename(repoPath);
      this._output.appendLine(`\n=== ${repoName} » Checkout ${branchName} ===`);

      await git.checkout(branchName);

      this._output.appendLine(`✅ Checked out ${branchName}.`);
      vscode.window.showInformationMessage(
        `✅ Checked out ${branchName} in ${repoName}`,
      );

      // Notify webview to update the UI
      this._view?.webview.postMessage({
        type: "branchUpdated",
        repoPath,
        branchName,
      });
    } catch (e: any) {
      const errorMsg = e.message || String(e);
      this._output.appendLine(`❌ Error: ${errorMsg}`);
      vscode.window.showErrorMessage(
        `❌ Failed to checkout ${branchName}: ${errorMsg}`,
      );
    }
  }

  private async _checkoutTag(repoPath: string, tagName: string) {
    try {
      const git = simpleGit(repoPath);
      const repoName = path.basename(repoPath);
      this._output.appendLine(`\n=== ${repoName} » Checkout tag ${tagName} ===`);

      await git.checkout(tagName);

      this._output.appendLine(`Checked out tag ${tagName}.`);
      vscode.window.showInformationMessage(
        `Checked out tag ${tagName} in ${repoName}`,
      );
    } catch (e: any) {
      this._output.appendLine(`Error: ${e.message || e}`);
      vscode.window.showErrorMessage(
        `Failed to checkout tag ${tagName}: ${e.message || e}`,
      );
    }
  }

  private async _searchBranch(query: string) {
    if (!query) {
      return;
    }
    this._view?.webview.postMessage({ type: "started" });

    const repos = await getAllGitRepos();
    const results: {
      name: string;
      path: string;
      currentBranch: string;
      matches: { label: string; value: string; type: "branch" }[];
    }[] = [];

    await Promise.all(
      repos.map(async (repoPath) => {
        try {
          const git = simpleGit(repoPath);
          const local = await git.branchLocal();
          const currentBranch = local.current;
          const matches: { label: string; value: string; type: "branch" }[] =
            [];

          // Find all local branches
          local.all
            .filter((b) => b.includes(query))
            .forEach((b) => {
              matches.push({ label: b, value: b, type: "branch" });
            });

          const remotes = await git.branch(["-r"]);
          // Find all remote branches
          remotes.all
            .filter((b) => b.includes(query))
            .forEach((b) => {
              let branchName = b;
              // Try to strip remote name if possible (e.g. origin/feature -> feature)
              const parts = branchName.split("/");
              if (
                parts.length > 1 &&
                (parts[0] === "origin" || parts[0] === "upstream")
              ) {
                branchName = parts.slice(1).join("/");
              }
              // Avoid duplicates if local branch exists with same name
              if (!matches.find((m) => m.value === branchName)) {
                matches.push({ label: b, value: branchName, type: "branch" });
              }
            });

          if (matches.length > 0) {
            results.push({
              name: path.basename(repoPath),
              path: repoPath,
              currentBranch,
              matches,
            });
          }
        } catch (e) {
          console.error(`Error checking repo ${repoPath}:`, e);
        }
      }),
    );

    this._view?.webview.postMessage({ type: "results", results });
  }

  private async _searchTag(query: string) {
    if (!query) {
      return;
    }
    this._view?.webview.postMessage({ type: "started" });

    const repos = await getAllGitRepos();
    const results: {
      name: string;
      path: string;
      currentBranch: string;
      matches: { label: string; value: string; type: "tag" }[];
    }[] = [];

    await Promise.all(
      repos.map(async (repoPath) => {
        try {
          const git = simpleGit(repoPath);
          const local = await git.branchLocal();
          const currentBranch = local.current;
          const matches: { label: string; value: string; type: "tag" }[] = [];

          const tags = await git.tags();
          tags.all
            .filter((t) => t.includes(query))
            .forEach((t) => {
              matches.push({ label: t, value: t, type: "tag" });
            });

          if (matches.length > 0) {
            results.push({
              name: path.basename(repoPath),
              path: repoPath,
              currentBranch,
              matches,
            });
          }
        } catch (e) {
          console.error(`Error checking repo ${repoPath}:`, e);
        }
      }),
    );

    this._view?.webview.postMessage({ type: "results", results });
  }

  private async _pickBranchFilter() {
    const repos = await getAllGitRepos();
    const allBranches = new Set<string>();

    await Promise.all(
      repos.map(async (repoPath) => {
        try {
          const git = simpleGit(repoPath);
          const branches = await git.branch();
          branches.all.forEach((b) => {
            let name = b;
            if (name.startsWith("remotes/")) {
              const parts = name.split("/");
              if (parts.length > 2) {
                name = parts.slice(2).join("/");
              }
            }
            allBranches.add(name);
          });
        } catch (e) {
          console.error(`Error fetching branches for ${repoPath}:`, e);
        }
      }),
    );

    const sortedBranches = Array.from(allBranches).sort();
    const pick = await vscode.window.showQuickPick(sortedBranches, {
      placeHolder: "Select branch to filter by",
    });

    if (pick) {
      this._view?.webview.postMessage({
        type: "branchFilterSelected",
        branch: pick,
      });
    }
  }

  private async _searchCommit(
    commitTitle: string,
    filters?: {
      author?: string;
      dateFrom?: string;
      dateTo?: string;
      branch?: string;
      sha?: string;
    },
  ) {
    if (
      !commitTitle &&
      (!filters ||
        (!filters.author &&
          !filters.dateFrom &&
          !filters.dateTo &&
          !filters.branch &&
          !filters.sha))
    ) {
      return;
    }
    this._view?.webview.postMessage({ type: "started" });

    const repos = await getAllGitRepos();
    const results: {
      name: string;
      path: string;
      currentBranch: string;
      matches: {
        type: "commit";
        hash: string;
        shortHash: string;
        message: string;
        author: string;
        date: string;
        refs: string;
      }[];
    }[] = [];

    await Promise.all(
      repos.map(async (repoPath) => {
        try {
          const git = simpleGit(repoPath);
          const local = await git.branchLocal();
          const currentBranch = local.current;

          const logOptions: string[] = ["--all"];
          const sha = filters?.sha?.trim();
          if (sha) {
            const index = logOptions.indexOf("--all");
            if (index > -1) {
              logOptions.splice(index, 1);
            }
            logOptions.push(sha, "-1");
          } else {
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
              const index = logOptions.indexOf("--all");
              if (index > -1) {
                logOptions.splice(index, 1);
              }
              logOptions.push(filters.branch);
            }
          }

          // Search for commit message
          const log = await git.log(logOptions);
          if (log.total > 0) {
            const matches = log.all.map((commit) => ({
              type: "commit" as const,
              hash: commit.hash,
              shortHash: commit.hash.substring(0, 7),
              message: commit.message,
              author: commit.author_name,
              date: commit.date,
              refs: commit.refs,
            }));
            results.push({
              name: path.basename(repoPath),
              path: repoPath,
              currentBranch,
              matches,
            });
          }
        } catch (e) {
          console.error(`Error checking repo ${repoPath}:`, e);
        }
      }),
    );

    this._view?.webview.postMessage({ type: "results", results });
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
} 
