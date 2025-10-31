# Multi Repo Git Commands

Run Git commands across all repositories in your VS Code workspace. Perfect for managing multiple projects simultaneously - check status, fetch, pull, checkout branches, and more with a single click!

## Features

✨ **Tree View UI** in the Activity Bar with all discovered repositories  
🎯 **Quick Actions** on each repo: Status, Fetch, Pull, Checkout, Custom commands  
🚀 **Toolbar buttons** to run commands on all repos at once  
📦 **Nested Repository Discovery**: automatically finds Git repos in subdirectories  
⚡ **Preset Commands**: Status, Fetch, Pull, Discard Changes, Checkout Branch  
🔧 **Custom Command Support**: run any Git command you need  
📊 **Output Channel** with detailed logs and exit codes  
⚙️ **Configurable**: scan depth, excluded folders, and more

## Quick Start

1. Click the **Multi Repo Git** icon (layers icon) in the Activity Bar
2. See all your repositories listed automatically
3. Use inline buttons or toolbar actions to run Git commands

## Using the Tree View

### Inline Actions (per repository)
- **ℹ️ Status**: Check repository status
- **☁️ Fetch**: Fetch latest changes
- **⬇️ Pull**: Pull with rebase
- **⌨️ Custom**: Run any Git command
- **🌿 Checkout**: Switch to a different branch
- **🗑️ Discard**: Discard all uncommitted changes (dangerous!)

### Toolbar Actions (all repositories)
- **🔄 Refresh**: Reload repository list
- **Status All** / **Fetch All** / **Pull All** / **Checkout All** / **Discard All**
- **Run Command**: Choose from presets or enter custom Git arguments

## Commands

Available from the Command Palette:

- `Multi-Repo Git: Run Command` - Choose from presets or enter custom
- `Multi-Repo Git: Status All` - Check status on all repos
- `Multi-Repo Git: Fetch All` - Fetch from all remotes
- `Multi-Repo Git: Pull All (rebase)` - Pull with rebase on all repos
- `Multi-Repo Git: Checkout Branch (All)` - Switch branch on all repos
- `Multi-Repo Git: Discard All Changes` - Reset and clean all repos (⚠️ dangerous!)
- `Multi-Repo Git: Refresh Repositories` - Reload the repository list

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

## How It Works

The extension:
1. Scans all workspace folders for Git repositories
2. Optionally discovers nested repositories based on your settings
3. Displays them in a convenient tree view
4. Executes Git commands sequentially with detailed output
5. Shows progress notifications with cancellation support

## Use Cases

Perfect for:
- 🏢 **Monorepos** with multiple projects
- 📁 **Multi-root workspaces** with scattered repositories  
- 🔄 **Synchronized operations**: fetch/pull all projects before starting work
- 🌿 **Branch management**: checkout the same branch across all repos
- 🧹 **Cleanup**: discard changes or reset all repos to clean state

## Known Limitations

- Commands run sequentially (not in parallel) to keep output readable
- Some Git operations may require user interaction in the terminal

## Release Notes

### 0.0.1

Initial release with:
- Tree view UI in Activity Bar
- Nested repository discovery with configurable depth
- Preset commands: Status, Fetch, Pull, Checkout, Discard
- Custom command support
- Per-repo and all-repos actions
- Output channel with detailed logs
- Progress notifications with cancellation
