import { simpleGit, SimpleGit } from "simple-git";
import * as path from "node:path";
import * as vscode from "vscode";

export interface GitOperationResult {
  success: boolean;
  message: string;
  error?: string;
}

export class GitClient {
  private output: vscode.OutputChannel;
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds

  constructor(output: vscode.OutputChannel) {
    this.output = output;
  }

  private getRepoName(repoPath: string): string {
    return path.basename(repoPath);
  }

  private logOperation(repoName: string, operation: string, status: "start" | "success" | "error", message?: string): void {
    const emoji = status === "start" ? "⏳" : status === "success" ? "✅" : "❌";
    this.output.appendLine(`${emoji} [${repoName}] ${operation}: ${message || ""}`);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = this.DEFAULT_TIMEOUT): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  async status(repoPath: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Status", "start");

      const git = simpleGit(repoPath);
      const res = await this.withTimeout(git.status());

      this.output.appendLine(`On branch ${res.current}`);
      if (res.isClean()) {
        this.output.appendLine("Working tree clean");
      } else {
        res.files.forEach((f) => this.output.appendLine(`${f.working_dir} ${f.path}`));
      }

      this.logOperation(repoName, "Status", "success", "completed");
      return { success: true, message: "Status retrieved" };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Status", "error", error);
      return { success: false, message: "Status failed", error };
    }
  }

  async fetch(repoPath: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Fetch", "start");

      const git = simpleGit(repoPath);
      await this.withTimeout(git.fetch(["--all", "--prune"]));

      this.logOperation(repoName, "Fetch", "success", "completed");
      return { success: true, message: "Fetch completed" };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Fetch", "error", error);
      return { success: false, message: "Fetch failed", error };
    }
  }

  async pull(repoPath: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Pull", "start");

      const git = simpleGit(repoPath);
      await this.withTimeout(git.pull(undefined, undefined, { "--rebase": null }));

      this.logOperation(repoName, "Pull", "success", "completed");
      return { success: true, message: "Pull completed" };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Pull", "error", error);
      return { success: false, message: "Pull failed", error };
    }
  }

  async push(repoPath: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Push", "start");

      const git = simpleGit(repoPath);
      await this.withTimeout(git.push());

      this.logOperation(repoName, "Push", "success", "completed");
      return { success: true, message: "Push completed" };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Push", "error", error);
      return { success: false, message: "Push failed", error };
    }
  }

  async commit(repoPath: string, message: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Commit", "start", message);

      const git = simpleGit(repoPath);
      await this.withTimeout(git.commit(message));

      this.logOperation(repoName, "Commit", "success");
      return { success: true, message: `Committed: "${message}"` };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Commit", "error", error);
      return { success: false, message: "Commit failed", error };
    }
  }

  async stageAll(repoPath: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Stage All", "start");

      const git = simpleGit(repoPath);
      await this.withTimeout(git.add("."));

      this.logOperation(repoName, "Stage All", "success");
      return { success: true, message: "Staged all changes" };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Stage All", "error", error);
      return { success: false, message: "Stage all failed", error };
    }
  }

  async unstageAll(repoPath: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Unstage All", "start");

      const git = simpleGit(repoPath);
      await this.withTimeout(git.reset(["HEAD"]));

      this.logOperation(repoName, "Unstage All", "success");
      return { success: true, message: "Unstaged all changes" };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Unstage All", "error", error);
      return { success: false, message: "Unstage all failed", error };
    }
  }

  async discard(repoPath: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Discard", "start");

      const git = simpleGit(repoPath);
      await this.withTimeout(git.reset(["--hard", "HEAD"]));
      await this.withTimeout(git.clean("f", ["-d"]));

      this.logOperation(repoName, "Discard", "success");
      return { success: true, message: "Discarded all changes" };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Discard", "error", error);
      return { success: false, message: "Discard failed", error };
    }
  }

  async stash(repoPath: string, message?: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Stash", "start", message || "(no message)");

      const git = simpleGit(repoPath);
      if (message) {
        await this.withTimeout(git.stash(["push", "-m", message]));
      } else {
        await this.withTimeout(git.stash(["push"]));
      }

      this.logOperation(repoName, "Stash", "success");
      return { success: true, message: "Stashed changes" };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Stash", "error", error);
      return { success: false, message: "Stash failed", error };
    }
  }

  async popStash(repoPath: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Pop Stash", "start");

      const git = simpleGit(repoPath);
      await this.withTimeout(git.stash(["pop"]));

      this.logOperation(repoName, "Pop Stash", "success");
      return { success: true, message: "Popped stash" };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Pop Stash", "error", error);
      return { success: false, message: "Pop stash failed", error };
    }
  }

  async checkout(repoPath: string, branch: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Checkout", "start", branch);

      const git = simpleGit(repoPath);
      await this.withTimeout(git.checkout(branch));

      this.logOperation(repoName, "Checkout", "success", branch);
      return { success: true, message: `Checked out ${branch}` };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Checkout", "error", error);
      return { success: false, message: `Checkout failed`, error };
    }
  }

  async createBranch(repoPath: string, branch: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Create Branch", "start", branch);

      const git = simpleGit(repoPath);
      await this.withTimeout(git.checkoutLocalBranch(branch));

      this.logOperation(repoName, "Create Branch", "success", branch);
      return { success: true, message: `Created and checked out ${branch}` };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Create Branch", "error", error);
      return { success: false, message: "Create branch failed", error };
    }
  }

  async deleteBranch(repoPath: string, branch: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Delete Branch", "start", branch);

      const git = simpleGit(repoPath);
      await this.withTimeout(git.deleteLocalBranch(branch, true));

      this.logOperation(repoName, "Delete Branch", "success", branch);
      return { success: true, message: `Deleted branch ${branch}` };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Delete Branch", "error", error);
      return { success: false, message: "Delete branch failed", error };
    }
  }

  async createTag(repoPath: string, tag: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Create Tag", "start", tag);

      const git = simpleGit(repoPath);
      await this.withTimeout(git.addTag(tag));

      this.logOperation(repoName, "Create Tag", "success", tag);
      return { success: true, message: `Created tag ${tag}` };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Create Tag", "error", error);
      return { success: false, message: "Create tag failed", error };
    }
  }

  async deleteTag(repoPath: string, tag: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Delete Tag", "start", tag);

      const git = simpleGit(repoPath);
      await this.withTimeout(git.tag(["-d", tag]));

      this.logOperation(repoName, "Delete Tag", "success", tag);
      return { success: true, message: `Deleted tag ${tag}` };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Delete Tag", "error", error);
      return { success: false, message: "Delete tag failed", error };
    }
  }

  async addRemote(repoPath: string, name: string, url: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Add Remote", "start", `${name} -> ${url}`);

      const git = simpleGit(repoPath);
      await this.withTimeout(git.addRemote(name, url));

      this.logOperation(repoName, "Add Remote", "success", name);
      return { success: true, message: `Added remote ${name}` };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Add Remote", "error", error);
      return { success: false, message: "Add remote failed", error };
    }
  }

  async deleteRemote(repoPath: string, name: string): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      this.logOperation(repoName, "Delete Remote", "start", name);

      const git = simpleGit(repoPath);
      await this.withTimeout(git.removeRemote(name));

      this.logOperation(repoName, "Delete Remote", "success", name);
      return { success: true, message: `Deleted remote ${name}` };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Delete Remote", "error", error);
      return { success: false, message: "Delete remote failed", error };
    }
  }

  async raw(repoPath: string, args: string[]): Promise<GitOperationResult> {
    try {
      const repoName = this.getRepoName(repoPath);
      const command = args.join(" ");
      this.logOperation(repoName, "Custom Git", "start", command);

      const git = simpleGit(repoPath);
      const res = await this.withTimeout(git.raw(args));

      if (res) {this.output.append(res);}
      this.logOperation(repoName, "Custom Git", "success");
      return { success: true, message: "Command executed" };
    } catch (e: any) {
      const error = e.message || String(e);
      this.logOperation(this.getRepoName(repoPath), "Custom Git", "error", error);
      return { success: false, message: "Command failed", error };
    }
  }
}
