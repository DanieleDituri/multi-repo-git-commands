# Multi Repo Git Commands

Run a Git command across all repositories in your current VS Code workspace roots. Great for checking status, fetching, or pulling changes in many projects at once.

## Features

- Runs a chosen Git command in each workspace folder that is a Git repository
- Detects nested Git repositories inside workspace folders (configurable depth)
- **Tree View UI** in the Activity Bar: see all discovered repos at a glance
- **Quick Actions** on each repo: Status, Fetch, Pull, Custom command
- **Toolbar buttons** to run commands on all repos
- Presets for common actions: Status, Fetch, Pull
- Custom command support: enter any git arguments (without the leading `git`)
- Output Channel with per-repo logs and exit codes
- Progress notification with cancellation

## Using the Tree View

1. Click the **Multi Repo Git** icon in the Activity Bar (left sidebar).
2. The "Repositories" view lists all discovered Git repositories.
3. Use the inline action buttons on each repo:
   - **Info** icon: Status
   - **Cloud** icon: Fetch
   - **Pull** icon: Pull (rebase)
   - **Terminal** icon: Run custom command
4. Use the toolbar at the top to run commands on **all** repos:
   - Refresh icon: Reload the repository list
   - Status All / Fetch All / Pull All / Run Command

## Commands

- Multi-Repo Git: Run Command
- Multi-Repo Git: Run Custom…
- Multi-Repo Git: Status All
- Multi-Repo Git: Fetch All
- Multi-Repo Git: Pull All (rebase)

Open the Command Palette and type the command name to run it. Output appears in the "Multi Repo Git" output channel.

## Requirements

- Git must be installed and available on your PATH.
- The command runs only on workspace root folders that are Git repositories.

## Notes

- Commands execute sequentially to keep logs readable and avoid overwhelming remotes.
- Folders that are not Git repositories are skipped with a note in the output.
- You can configure nested repo discovery under Settings → Extensions → Multi Repo Git Commands.

### Settings

- `multiRepoGit.scanNested` (boolean, default true): Scans for `.git` in subfolders.
- `multiRepoGit.maxDepth` (number, default 2): Depth for scanning subfolders (0 = solo la root, 1 = un livello, ecc.).
- `multiRepoGit.excludeFolders` (string[], default common build/cache dirs): Folder names to skip during scanning.

## Known limitations

- Only workspace roots are considered; nested repositories inside a single root are not discovered automatically yet.

## Release Notes

### 0.0.1

- Initial preview: presets, custom command, output channel, progress.
