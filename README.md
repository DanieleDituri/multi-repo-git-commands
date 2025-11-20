# Multi Repo Git Commands

Run Git commands across all repositories in your VS Code workspace. Perfect for managing multiple projects simultaneously - check status, fetch, pull, checkout branches, and more with a single click!

## Features

✨ **Seamless SCM Integration**: Access commands directly from the Source Control view title and context menus  
🎯 **Quick Actions**: Status, Fetch, Pull, Push, Checkout, Stash, Tags, Remotes  
🚀 **Bulk Operations**: Run commands on all repositories at once  
📦 **Nested Repository Discovery**: Automatically finds Git repos in subdirectories  
⚡ **Background Execution**: Commands run silently with progress notifications  
🔧 **Custom Command Support**: Run any Git command you need  
🌿 **Enhanced Checkout**: View and select from all available branches (local and remote) across repos  
⚙️ **Configurable**: Scan depth, excluded folders, and more

## Quick Start

1. Open the **Source Control** view in VS Code
2. Use the **navigation bar icons** to run common commands (Status, Fetch, Pull, Push, Checkout) on all repositories
3. Click the **... (More Actions)** menu for advanced commands (Commit, Stash, Branch, Tag, Remote, etc.)
4. Right-click any repository in the list to run commands on that specific repo

## Commands

Available from the Command Palette (`Cmd+Shift+P`) or Source Control menus:

### General (All Repositories)
- **Status All**: Check status on all repos
- **Fetch All**: Fetch from all remotes
- **Pull All**: Pull with rebase on all repos
- **Push All**: Push to remote
- **Commit All**: Commit changes
- **Stash All / Pop Stash All**: Manage stashes
- **Checkout Branch (All)**: Switch branch (lists local and remote branches)
- **Create/Delete Branch (All)**: Manage branches
- **Create/Delete Tag (All)**: Manage tags
- **Create/Delete Remote (All)**: Manage remotes
- **Stage/Unstage/Discard All**: Manage changes
- **Run Custom Command**: Enter any Git arguments

### Single Repository
- **Run Custom Command**: Run any Git command on a specific repo
- **Open Repository**: Open the repository in a new window

## Settings

Configure under **Settings → Extensions → Multi Repo Git Commands**:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `multiRepoGit.scanNested` | boolean | `true` | Scan workspace folders recursively for nested repositories |
| `multiRepoGit.maxDepth` | number | `2` | Maximum directory depth to scan (0 = root only, 1 = one level deep, etc.) |
| `multiRepoGit.excludeFolders` | array | `["node_modules", ".git", "dist", "build", "out", ".next", ".cache"]` | Folder names to skip during scanning |

## Requirements

- Git must be installed and available in your PATH
- Works with both single and multi-root workspaces

## Release Notes

### 0.1.0
- **Major UI Overhaul**: Integrated into Source Control view (removed custom Activity Bar view)
- **New Commands**: Push, Commit, Stash, Tags, Remotes, Stage/Unstage
- **Enhanced Checkout**: Now lists all branches (local & remote) for easier selection
- **Background Execution**: Commands run silently without stealing focus
- **Improved Performance**: Switched to `simple-git` for more robust Git handling

### 0.0.1
- Initial release

