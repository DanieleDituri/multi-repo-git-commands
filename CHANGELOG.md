# Change Log

## [1.0.6] - 2026-02-10

### Fixed

- Toolbar buttons remain fixed-size when resizing the sidebar
- Enforced 50px minimum toolbar button size

## [1.0.5] - 2026-02-10

### Added

- Commit search now supports searching by SHA hash
- Commit search now supports searching by tag name

### Fixed

- Fixed icons not displaying correctly in the webview interface

## [1.0.4] - 2026-01-30

### Fixed

- Restored webview script execution after CSP changes
- Rewired button handlers to avoid inline scripts (commands work again)
- Restored dynamic icons in search results

## [1.0.3] - 2026-01-29

### Fixed

- Added Content Security Policy to allow codicon fonts to load properly in webview
- Fixed missing icons in commit search results (author, calendar, tag icons)

## [1.0.2] - 2026-01-29

### Changed

- Corrected and completed changelog history with all previous releases

## [1.0.1] - 2026-01-29

- Added Reset Workspace action (discard + fetch + pull) with a dedicated toolbar button.
- Toolbar buttons now use standard Git codicons and are always square.
- Added configurable toolbar button size in settings.
- Removed Source Control menu entries and command icons.
- Fixed packaging to include icons in published builds.

## [1.0.0] - 2025-12-15

- New Dashboard UI: dedicated Side Bar view with a modern Webview interface.
- Global Toolbar: quick access buttons for all major Git operations.
- Advanced Search:
  - Branch search with checkout capabilities.
  - Commit search with filters (Author, Date, Branch).
- Real-time Reactivity: UI updates instantly when repository state changes.
- Improved UX: better visual feedback, icons, and expandable result lists.

## [0.1.0] - 2025-11-20

- Integrated into Source Control view.
- Added basic bulk commands.

## [0.0.2] - 2025-11-10

- Bug fixes and stability improvements.

## [0.0.1] - 2025-10-31

- Initial preview release: run Git commands across all workspace roots with presets and custom input. Output channel and progress support.
