# Changelog

## 1.2.0 — Unreleased

- Initial VS Code/Cursor extension 0.1.0 with an embedded dual-panel workspace, native editor opening, workspace trust, dirty-document guards, and Output logs.
- Shared browser/extension UI with cancelable message transport, nonce CSP, and no localhost server in extension mode.
- VSIX build tooling, CI artifact, and editor-host smoke tests.

This source version and the extension are not published. npm latest remains 1.1.0.

## 1.1.0

- Background task queue for copy/move with byte/item progress, cancellation and stop/skip/keep-both conflicts.
- Partial-copy cleanup, source identity/change checks and copy-before-remove moves.
- Task reopening via Tasks and Ctrl+J, with indeterminate progress for other file operations.
- SHA-256 hashing, exact file comparison, immediate folder metadata comparison.
- Virtualized file rows preserving keyboard navigation and selection.
- UTF-8, UTF-16 LE and Windows-1252 display choices for bounded byte pages.
- Live application logs in the CLI and browser.
- Portable source launchers, reproducible benchmark, user/troubleshooting/API/security/contributor/release documentation and prioritized roadmap.



## 1.0.0

Initial npm release: dual panels, tabs, selection, copy/move, temporary recovery, text/hex/ASCII viewing, search, live details, command bar and system monitor. CLI and GitHub cross-platform CI/release workflow.
