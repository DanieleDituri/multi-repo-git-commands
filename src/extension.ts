import * as vscode from "vscode";
import * as path from "node:path";
import { simpleGit, SimpleGit } from "simple-git";
import { getAllGitRepos } from "./repoDiscovery";
import { MultiRepoViewProvider } from "./multiRepoViewProvider";

export type RepoInfo = { name: string; path: string };

type GitPick = {
  label: string;
  description?: string;
  args: string[]; // git arguments without the leading 'git'
};

const PRESETS: GitPick[] = [
  {
    label: "Status (short)",
    description: "git status -sb",
    args: ["status", "-sb"],
  },
  {
    label: "Fetch --all --prune",
    description: "git fetch --all --prune",
    args: ["fetch", "--all", "--prune"],
  },
  {
    label: "Pull (rebase)",
    description: "git pull --rebase",
    args: ["pull", "--rebase"],
  },
  { label: "Push", description: "git push", args: ["push"] },
  {
    label: "Show branch",
    description: "git branch --show-current",
    args: ["branch", "--show-current"],
  },
  {
    label: "Discard all changes",
    description: "git reset --hard HEAD",
    args: ["reset", "--hard", "HEAD"],
  },
];

function createOutput(): vscode.OutputChannel {
  return vscode.window.createOutputChannel("Multi Repo Git");
}

async function pickOrPromptGitArgs(): Promise<string[] | undefined> {
  const choice = (await vscode.window.showQuickPick(
    [
      ...PRESETS.map(
        (p) =>
          ({ label: p.label, description: p.description, args: p.args }) as any,
      ),
      {
        label: "Custom…",
        description: "Enter any git arguments",
        args: null as any,
      },
    ],
    { placeHolder: "Select a Git command to run across all workspace folders" },
  )) as (GitPick | { label: string; args: null }) | undefined;

  if (!choice) {
    return undefined;
  }
  if ((choice as any).args === null) {
    const custom = await vscode.window.showInputBox({
      title: 'Enter git arguments (without the leading "git")',
      prompt: "Example: status -sb | pull --rebase | fetch --all --prune",
      value: "status -sb",
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
  const provider = new MultiRepoViewProvider(context.extensionUri, output);

  // --- Git Extension Integration for Real-time Updates ---
  // Activate git extension asynchronously (non-blocking)
  const gitExtension = vscode.extensions.getExtension("vscode.git");
  if (gitExtension && !gitExtension.isActive) {
    Promise.resolve(gitExtension.activate()).then(() => {
      try {
        const gitApi = gitExtension.exports.getAPI(1);

        const subscribeToRepo = (repo: any) => {
          // Subscribe to state changes (branch changes, commits, etc.)
          repo.state.onDidChange(() => {
            provider.updateRepoState(repo.rootUri.fsPath);
          });
        };

        // Subscribe to existing repos
        gitApi.repositories.forEach(subscribeToRepo);

        // Subscribe to new repos
        gitApi.onDidOpenRepository(subscribeToRepo);
      } catch (e) {
        console.error("Failed to hook into VS Code Git extension:", e);
      }
    }).catch(() => {
      // Ignore activation errors silently
    });
  } else if (gitExtension && gitExtension.isActive) {
    try {
      const gitApi = gitExtension.exports.getAPI(1);

      const subscribeToRepo = (repo: any) => {
        // Subscribe to state changes (branch changes, commits, etc.)
        repo.state.onDidChange(() => {
          provider.updateRepoState(repo.rootUri.fsPath);
        });
      };

      // Subscribe to existing repos
      gitApi.repositories.forEach(subscribeToRepo);

      // Subscribe to new repos
      gitApi.onDidOpenRepository(subscribeToRepo);
    } catch (e) {
      console.error("Failed to hook into VS Code Git extension:", e);
    }
  }

  async function getAllRepos(): Promise<RepoInfo[]> {
    const repoPaths = await getAllGitRepos();
    return repoPaths
      .map((p) => ({ name: path.basename(p), path: p }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Tree View removed

  async function runGitOperation(
    operationName: string,
    repos: RepoInfo[] | undefined,
    action: (git: SimpleGit, repoName: string) => Promise<any>,
  ) {
    let repoList = repos;
    repoList ??= await getAllRepos();
    if (repoList.length === 0) {
      vscode.window.showWarningMessage("No Git repositories found.");
      return;
    }

    output.clear();
    output.clear();
    // output.show(true); // Keep background execution

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${operationName} on ${repoList.length} repo(s)`,
        cancellable: true,
      },
      async (_progress, token) => {
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
      },
    );

    // treeProvider.refresh();
  }

  // --- Command Implementations ---

  const runCustom = async (repos?: RepoInfo[]) => {
    const args = await pickOrPromptGitArgs();
    if (!args) return;
    await runGitOperation(
      `git ${args.join(" ")}`,
      repos,
      async (git, repoName) => {
        const res = await git.raw(args);
        if (res) output.append(res);
        output.appendLine(`=== ${repoName} » Done ===`);
      },
    );
  };

  const runStatus = async (repos?: RepoInfo[]) => {
    await runGitOperation("Status", repos, async (git) => {
      const res = await git.status();
      output.appendLine(`On branch ${res.current}`);
      if (res.isClean()) {
        output.appendLine("nothing to commit, working tree clean");
      } else {
        res.files.forEach((f) =>
          output.appendLine(`${f.working_dir} ${f.path}`),
        );
      }
    });
  };

  const runFetch = async (repos?: RepoInfo[]) => {
    await runGitOperation("Fetch", repos, async (git) => {
      await git.fetch(["--all", "--prune"]);
      output.appendLine("Fetch completed.");
    });
  };

  const runPull = async (repos?: RepoInfo[]) => {
    await runGitOperation("Pull (rebase)", repos, async (git) => {
      await git.pull(undefined, undefined, { "--rebase": null });
      output.appendLine("Pull completed.");
    });
  };

  const runPush = async (repos?: RepoInfo[]) => {
    await runGitOperation("Push", repos, async (git) => {
      await git.push();
      output.appendLine("Push completed.");
    });
  };

  const runCommit = async (repos?: RepoInfo[]) => {
    const message = await vscode.window.showInputBox({
      prompt: "Enter commit message",
    });
    if (!message) return;
    await runGitOperation("Commit", repos, async (git) => {
      await git.commit(message);
      output.appendLine(`Committed: "${message}"`);
    });
  };

  const runStageAll = async (repos?: RepoInfo[]) => {
    await runGitOperation("Stage All", repos, async (git) => {
      await git.add(".");
      output.appendLine("Staged all changes.");
    });
  };

  const runUnstageAll = async (repos?: RepoInfo[]) => {
    await runGitOperation("Unstage All", repos, async (git) => {
      await git.reset(["HEAD"]);
      output.appendLine("Unstaged all changes.");
    });
  };

  const runDiscard = async (repos?: RepoInfo[]) => {
    const confirm = await vscode.window.showWarningMessage(
      "Discard ALL uncommitted changes? This cannot be undone!",
      { modal: true },
      "Discard",
    );
    if (confirm !== "Discard") return;

    await runGitOperation("Discard Changes", repos, async (git) => {
      await git.reset(["--hard", "HEAD"]);
      await git.clean("f", ["-d"]);
      output.appendLine("Discarded all changes.");
    });
  };

  const runStash = async (repos?: RepoInfo[]) => {
    const message = await vscode.window.showInputBox({
      prompt: "Stash message (optional)",
    });
    await runGitOperation("Stash", repos, async (git) => {
      if (message) {
        await git.stash(["push", "-m", message]);
      } else {
        await git.stash(["push"]);
      }
      output.appendLine("Stashed changes.");
    });
  };

  const runPopStash = async (repos?: RepoInfo[]) => {
    await runGitOperation("Pop Stash", repos, async (git) => {
      await git.stash(["pop"]);
      output.appendLine("Popped stash.");
    });
  };

  const runCheckout = async (repos?: RepoInfo[]) => {
    let targetRepos = repos;
    if (!targetRepos) {
      targetRepos = await getAllRepos();
    }

    if (targetRepos.length === 0) {
      vscode.window.showWarningMessage("No Git repositories found.");
      return;
    }

    const allBranches = new Set<string>();
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Fetching branches...",
        cancellable: false,
      },
      async () => {
        await Promise.all(
          targetRepos!.map(async (repo) => {
            try {
              const git = simpleGit(repo.path);
              const branches = await git.branch(["-a"]); // Fetch all branches including remotes
              branches.all.forEach((b) => {
                let name = b;
                if (name.startsWith("remotes/")) {
                  // Strip 'remotes/origin/' or similar
                  const parts = name.split("/");
                  if (parts.length > 2) {
                    name = parts.slice(2).join("/");
                  }
                }
                allBranches.add(name);
              });
            } catch {
              // ignore
            }
          }),
        );
      },
    );

    const sortedBranches = Array.from(allBranches).sort();
    const pick = await vscode.window.showQuickPick(sortedBranches, {
      placeHolder: "Select branch to checkout",
    });

    if (!pick) return;

    await runGitOperation(`Checkout ${pick}`, targetRepos, async (git) => {
      await git.checkout(pick);
      output.appendLine(`Checked out ${pick}.`);
    });
  };

  const runCreateBranch = async (repos?: RepoInfo[]) => {
    const branch = await vscode.window.showInputBox({
      prompt: "New branch name",
    });
    if (!branch) return;
    await runGitOperation(`Create Branch ${branch}`, repos, async (git) => {
      await git.checkoutLocalBranch(branch);
      output.appendLine(`Created and checked out ${branch}.`);
    });
  };

  const runDeleteBranch = async (repos?: RepoInfo[]) => {
    const branch = await vscode.window.showInputBox({
      prompt: "Branch name to delete",
    });
    if (!branch) return;
    await runGitOperation(`Delete Branch ${branch}`, repos, async (git) => {
      await git.deleteLocalBranch(branch, true); // force delete
      output.appendLine(`Deleted branch ${branch}.`);
    });
  };

  const runCreateTag = async (repos?: RepoInfo[]) => {
    const tag = await vscode.window.showInputBox({ prompt: "Tag name" });
    if (!tag) return;
    await runGitOperation(`Create Tag ${tag}`, repos, async (git) => {
      await git.addTag(tag);
      output.appendLine(`Created tag ${tag}.`);
    });
  };

  const runDeleteTag = async (repos?: RepoInfo[]) => {
    const tag = await vscode.window.showInputBox({
      prompt: "Tag name to delete",
    });
    if (!tag) return;
    await runGitOperation(`Delete Tag ${tag}`, repos, async (git) => {
      await git.tag(["-d", tag]);
      output.appendLine(`Deleted tag ${tag}.`);
    });
  };

  const runCreateRemote = async (repos?: RepoInfo[]) => {
    const name = await vscode.window.showInputBox({
      prompt: "Remote name",
      value: "origin",
    });
    if (!name) return;
    const url = await vscode.window.showInputBox({ prompt: "Remote URL" });
    if (!url) return;
    await runGitOperation(`Add Remote ${name}`, repos, async (git) => {
      await git.addRemote(name, url);
      output.appendLine(`Added remote ${name}.`);
    });
  };

  const runDeleteRemote = async (repos?: RepoInfo[]) => {
    const name = await vscode.window.showInputBox({
      prompt: "Remote name to delete",
    });
    if (!name) return;
    await runGitOperation(`Delete Remote ${name}`, repos, async (git) => {
      await git.removeRemote(name);
      output.appendLine(`Deleted remote ${name}.`);
    });
  };

  const runResetWorkspace = async (repos?: RepoInfo[]) => {
    const confirm = await vscode.window.showWarningMessage(
      "Reset workspace? This will discard all changes, fetch and pull. This cannot be undone!",
      { modal: true },
      "Reset",
    );
    if (confirm !== "Reset") return;

    let repoList = repos;
    repoList ??= await getAllRepos();
    if (repoList.length === 0) {
      vscode.window.showWarningMessage("No Git repositories found.");
      return;
    }

    output.clear();

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Resetting workspace on ${repoList.length} repo(s)`,
        cancellable: true,
      },
      async (_progress, token) => {
        for (const repo of repoList) {
          if (token.isCancellationRequested) {
            break;
          }
          const repoName = path.basename(repo.path);
          output.appendLine(`\n=== ${repoName} » Reset Workspace ===`);

          try {
            const git = simpleGit(repo.path);

            // Step 1: Discard
            output.appendLine("Discarding changes...");
            await git.reset(["--hard", "HEAD"]);
            await git.clean("f", ["-d"]);
            output.appendLine("✓ Changes discarded");

            // Step 2: Fetch
            output.appendLine("Fetching...");
            await git.fetch(["--all", "--prune"]);
            output.appendLine("✓ Fetch completed");

            // Step 3: Pull
            output.appendLine("Pulling...");
            await git.pull(undefined, undefined, { "--rebase": null });
            output.appendLine("✓ Pull completed");

            output.appendLine(`=== ${repoName} » Done ===`);
          } catch (e: any) {
            output.appendLine(`Error: ${e.message || e}`);
          }
        }
      },
    );
  };

  // --- Registration ---

  // General / All
  context.subscriptions.push(
    vscode.commands.registerCommand("multi-repo-git-commands.runGitAll", () =>
      runCustom(),
    ),
    vscode.commands.registerCommand(
      "multi-repo-git-commands.runCustomGitAll",
      () => runCustom(),
    ),
    vscode.commands.registerCommand("multi-repo-git-commands.statusAll", () =>
      runStatus(),
    ),
    vscode.commands.registerCommand("multi-repo-git-commands.fetchAll", () =>
      runFetch(),
    ),
    vscode.commands.registerCommand("multi-repo-git-commands.pullAll", () =>
      runPull(),
    ),
    vscode.commands.registerCommand("multi-repo-git-commands.pushAll", () =>
      runPush(),
    ),
    vscode.commands.registerCommand("multi-repo-git-commands.commitAll", () =>
      runCommit(),
    ),
    vscode.commands.registerCommand("multi-repo-git-commands.stageAll", () =>
      runStageAll(),
    ),
    vscode.commands.registerCommand("multi-repo-git-commands.unstageAll", () =>
      runUnstageAll(),
    ),
    vscode.commands.registerCommand("multi-repo-git-commands.discardAll", () =>
      runDiscard(),
    ),
    vscode.commands.registerCommand("multi-repo-git-commands.stashAll", () =>
      runStash(),
    ),
    vscode.commands.registerCommand("multi-repo-git-commands.popStashAll", () =>
      runPopStash(),
    ),
    vscode.commands.registerCommand("multi-repo-git-commands.checkoutAll", () =>
      runCheckout(),
    ),
    vscode.commands.registerCommand(
      "multi-repo-git-commands.createBranchAll",
      () => runCreateBranch(),
    ),
    vscode.commands.registerCommand(
      "multi-repo-git-commands.deleteBranchAll",
      () => runDeleteBranch(),
    ),
    vscode.commands.registerCommand(
      "multi-repo-git-commands.createTagAll",
      () => runCreateTag(),
    ),
    vscode.commands.registerCommand(
      "multi-repo-git-commands.deleteTagAll",
      () => runDeleteTag(),
    ),
    vscode.commands.registerCommand(
      "multi-repo-git-commands.createRemoteAll",
      () => runCreateRemote(),
    ),
    vscode.commands.registerCommand(
      "multi-repo-git-commands.deleteRemoteAll",
      () => runDeleteRemote(),
    ),
    vscode.commands.registerCommand(
      "multi-repo-git-commands.resetWorkspace",
      () => runResetWorkspace(),
    ),
  );

  // Single Repo (SCM Context Menu)
  const singleRepoWrapper =
    (fn: (repos?: RepoInfo[]) => Promise<void>) =>
    async (item: vscode.SourceControl) => {
      if (item && item.rootUri) {
        const repo: RepoInfo = {
          name: path.basename(item.rootUri.fsPath),
          path: item.rootUri.fsPath,
        };
        await fn([repo]);
      }
    };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "multi-repo-git-commands.customRepo",
      singleRepoWrapper(runCustom),
    ),
    vscode.commands.registerCommand(
      "multi-repo-git-commands.openRepo",
      async (item: vscode.SourceControl) => {
        if (item && item.rootUri) {
          await vscode.commands.executeCommand(
            "vscode.openFolder",
            item.rootUri,
            { forceNewWindow: false, noRecentEntry: false },
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MultiRepoViewProvider.viewType,
      provider,
    ),
  );

  context.subscriptions.push(output);
}

export function deactivate() {}
