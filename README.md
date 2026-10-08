# Panevrix

**Two panels. Total control.**

A local, keyboard-first, dual-panel file manager inspired by Norton Commander and FAR Manager. Built with Node.js and browser-native JavaScript; no dependencies, build step, cloud service, or account.

## Install and run

Requires Node.js 20 or newer.

The current published npm release can be run with:

```sh
npx panevrix@latest
```

Or install the command globally:

```sh
npm install -g panevrix
panevrix
```

Panevrix starts a local server and opens **http://127.0.0.1:3847** in your browser. Keep the terminal running; press Ctrl+C to stop. No account or build step is needed. This is a browser interface launched by a CLI, not a terminal-screen file manager.

```sh
panevrix . ../another-folder
panevrix --port 4000
panevrix --port 0 --no-open
panevrix --help
```

Folder arguments accept relative or absolute paths. Quote paths containing spaces. `--port 0` selects a free port; `--no-open` prints the URL without launching a browser. The `PORT` environment variable also sets the default port. Explicit folder arguments override saved tabs for the respective panel. Without arguments, saved tabs are restored; a fresh session opens the current working directory on the left and your home directory on the right.

The current source version is **1.2.0 (unreleased)**; npm latest is **1.1.0**. To run the source, use `npm start` (or `npm start -- --no-open`). There are no dependencies to install. To check a locally packed release, run `npm pack`, then `npm exec --package ./panevrix-1.2.0.tgz -- panevrix --no-open`.

See [PUBLISHING.md](PUBLISHING.md) in the source repository for GitHub and npm release instructions.

## Features

If creating folders returns `EPERM` or `EACCES`, check the active panel's path and your account's write permissions. A server launched by a development sandbox inherits its filesystem restrictions; for normal local use, launch `npm start` yourself from a regular terminal in the project directory. Administrator privileges should only be needed for protected locations such as Windows system folders.

- Two independently navigable panels with folder tabs and back/forward history.
- Actual filesystem access, directory-first sorting, name/size/date sorting, hidden file preferences, folder filtering, and disk space indicators.
- Mouse, keyboard, Ctrl-click, and Shift selection; multi-file copy, move, and recoverable deletion.
- Background copy/move tasks with byte and item progress, cancellation, queued execution, and stop/skip/keep-both conflict policies. Close the progress window and reopen it through Tasks (Ctrl+J).
- Streamed SHA-256 calculations from Properties, exact byte comparison with the first differing offset, and immediate folder metadata comparison.
- Virtualized file rows: the browser renders only the visible area plus overscan, preserving keyboard navigation and selection.
- Live application logs in the CLI terminal and the Application logs window.
- Folder and empty-file creation, rename, properties, and default-application opening.
- Copy/cut/paste across panels and tabs. Copy/move dialogs default to the opposite panel.
- Favorites and tab sessions persisted in browser local storage.
- Recursive filename search, up to 500 results, 20,000 entries, and 15 folder levels.
- UTF-8 text viewer/editor up to 2 MB, Ctrl+S save, external-change detection, and unsaved-change confirmation.
- Read-only hex viewer for files of any extension, including multi-gigabyte binaries: byte offsets, hexadecimal and ASCII columns, paging, jump-to-offset, and cancellable byte-pattern search. Reads only 1 KB per page; search processes at most 8 MB plus pattern overlap per request.
- Command bar running PowerShell on Windows or the system shell elsewhere, with output and command history. Commands run in the active folder, with a fresh shell for every command and a 30-second timeout. Interactive programs and persistent shell sessions are not supported.
- Responsive dark interface with bottom function-key toolbar and shortcut reference.
- System monitor with CPU and memory history, OS/hardware/runtime details, network interface addresses, searchable and sortable process lists, process/window details, and local file-operation/command activity history.
- Configurable live refresh (5, 10, or 30 seconds, or manual) and compact file rows.

## Keyboard

| Key | Action |
| --- | --- |
| Tab | Switch panels |
| Arrow keys, Home, End, Page Up/Down | Navigate items |
| Enter | Open folder / file in default application |
| Backspace | Parent folder |
| Space / Insert | Toggle selection, advance cursor |
| Shift + arrows / Shift-click | Extend selection |
| Ctrl + A | Select visible files and folders |
| Ctrl + C / X / V | Copy / cut / paste |
| Ctrl + T / W | New / close folder tab |
| Ctrl + L / F | Focus path / filter |
| Ctrl + R | Refresh panels |
| Ctrl + I | Toggle live information in the inactive panel |
| Ctrl + J | Background tasks |
| Alt + Left / Right | Back / forward |
| Shift + F7 | Recursive search |
| Shift + Enter / right-click | Properties |
| Escape | Clear selection and filter |
| F1 | Help |
| F2 | Rename |
| F3 / F4 | View / edit text |
| Shift + F3 | View any file as hexadecimal |
| F5 / F6 | Copy / move |
| F7 | New folder |
| F8 / Delete | Move to Panevrix Trash |
| F9 | Settings |
| F10 | Command bar |

Some browser or operating-system shortcuts can take precedence over function keys; the toolbar provides the same actions.

## File safety and scope

Copy/move operations preserve existing destination files. Choose stop (default), skip, or keep both with a numbered name. Folders cannot be placed inside themselves, and overlapping sources are rejected. Tasks run sequentially. On cancellation or failure, completed top-level items stay completed; the current incomplete copy is removed where possible and originals are retained. Cleanup failures identify retained paths. Every move copies first and then removes the source; cancellation is briefly disabled during source removal. A source-removal failure keeps the complete destination copy. See [task safety and recovery](docs/USER_GUIDE.md#tasks-and-recovery) before retrying.

Deletion uses Panevrix's own recovery folder at `commander-trash` under the system temp directory, not the OS Recycle Bin. The internal recovery directory and browser storage keys retain their original names so existing deleted files, tabs, favorites, and preferences remain accessible after the rename. Restore using the sidebar Trash button. Recovery files can be removed by operating-system temporary-file cleanup. No permanent-delete UI is provided.

The server listens only on IPv4 localhost. API requests require a per-process token; external browser origins and unexpected Host headers are rejected. This is a single-user local app with the permissions of the account running Node. Keep it bound to localhost. It can run commands and access any files that account can access.

Filesystem changes from other applications appear after refreshing. Symlinks are shown separately and are not traversed by recursive search. Text editing is for UTF-8 files, not arbitrary binary formats. Archive browsing, integrated FTP/SFTP, plugins, and a persistent terminal emulator are outside this version's scope.

## Large files and binary inspection

Select a file and press **Shift+F3** or click **Hex view**. **F3** automatically uses the hex viewer for files over 2 MB or files containing null bytes. The hex viewer is read only, and never loads an entire large file into memory.

Each row shows a byte offset, 16 hexadecimal bytes, and printable ASCII characters; nonprintable bytes appear as dots. Use First/Previous/Next/Last or Page Up/Page Down/Home/End while the byte view is focused. Jump accepts decimal (`4096`) or hexadecimal (`0x1000`) offsets and highlights the requested byte. Ctrl+G focuses Jump and Ctrl+F focuses byte search when the byte view is focused.

Switch **Hex / ASCII text** inside the viewer to read the same chunk as regular ASCII text. ASCII text preserves line breaks and tabs, wraps long lines, and replaces other nonprintable or non-ASCII bytes with dots. Hover a character to see its exact byte offset and hex value. Switching views keeps the current offset and search highlights; paging, Jump, and byte-pattern search work in both modes. Choose ASCII, UTF-8, UTF-16 LE, or Windows-1252 from the encoding menu. Decoded modes display the same bounded page; page boundaries may split multibyte characters and show replacement characters. Exact byte hover details and search highlights apply to ASCII and Hex modes. Decoded modes remain read only.

Search accepts 1–256 complete hexadecimal bytes, with optional whitespace (`DE AD BE EF`). Find next starts at the displayed offset for a new pattern and advances through subsequent matches, including overlapping matches. At EOF, the next search starts at the beginning. Progress indicates the current absolute position in the file. Stop cancels further chunks; an in-flight bounded request may finish before cancellation takes effect. Closing the viewer also stops searching. If file size or modification time changes, reopen the viewer before continuing. Byte offsets use safe integers rather than 32-bit arithmetic, supporting files up to JavaScript's safe-integer size limit, subject to filesystem limits.

## System monitor

Click **System monitor** above the panels. **Overview** shows sampled CPU usage, memory use, recent usage charts, OS version, CPU model, architecture, uptime, load averages where available, and network interfaces. **Processes** filters by name, PID, or window title; click column headings to sort and a process to inspect its details. Windows window titles, thread and handle counts are provided when permitted. Linux/macOS expose parent PID and process state through `ps`. This is a read-only inspector; it does not terminate processes or change OS settings.

CPU readings depend on the platform: Windows process CPU is sampled between refreshes and initially unavailable; Linux/macOS use the values reported by `ps`. Process CPU may exceed 100% when using multiple cores. Some protected fields may be unavailable. The system CPU chart uses interval deltas. Live refresh pauses while the browser tab is hidden, and closing the monitor stops polling.

**Activity** records the latest 100 file-operation and command events in this browser, including running/completed/failed status and elapsed time. **Monitor settings** controls refresh frequency and compact file rows. These are application preferences; they do not change operating-system settings.

Process collection requires Windows PowerShell on Windows, or `ps` on Linux/macOS. No additional npm dependencies are required.

## Verification

```powershell
npm test
```

Tests cover recursive copy/move, collision protection, self-descendant rejection, recycle/restore and restore collision protection, real metadata, recursive search, editor conflict checks, binary rejection, path names, and API authentication/origin enforcement.
## Live information panel

Folder navigation and refresh show an indeterminate progress bar and **Cancel** button for each loading panel. Cancel keeps the previous listing and ignores late results. Starting another navigation cancels the previous request for that tab. Metadata is read in bounded batches, so canceled requests stop scheduling further file reads; an already running operating-system filesystem call may finish before the server releases its work.

Click **Information** or press **Ctrl+I** to replace the inactive file panel with details for the cursor item. Move with the arrow keys or select another item to update its path, type, size, dates, link target, and folder contents. When the cursor is on `..`, the panel describes the current folder. Folder counts and sizes cover immediate contents only. **Tab** swaps the active side and moves the information panel to the opposite side. **Ctrl+I** or Close restores the other file panel, keeping its folder and tabs. Copy and move continue to target that saved opposite folder.

## Editing and access recovery

If the local server restarts while an editor is open, Panevrix reconnects automatically and keeps the unsaved text. If saving returns a real filesystem access denial, the editor keeps the text and offers **Grant access in system permissions…**. This launches a local process to open Windows File Properties, reveal the item in macOS Finder, or open its containing folder on Linux. Grant only the access you intend through the operating system’s permission controls, then retry Save. Panevrix does not automatically change ownership or permissions. A sandbox restriction requires starting the app from your own terminal; file permission changes do not bypass a sandbox.


## Documentation and priorities

- [User guide](docs/USER_GUIDE.md): workflows, progress, cancellation, recovery, inspection, logs, and platform differences.
- [Troubleshooting](docs/TROUBLESHOOTING.md): permissions, stale sessions, ports, slow folders, and failed tasks.
- [Architecture and API](docs/ARCHITECTURE.md): local security model, modules, endpoints, and limits.
- [Prioritized roadmap](docs/ROADMAP.md): delivered work and remaining installation, archive, SFTP, and recovery improvements.
- [Contributing](CONTRIBUTING.md), [security](SECURITY.md), [changelog](CHANGELOG.md), and [publishing](PUBLISHING.md).

## Development and verification

Run these commands from a source checkout (development scripts and tests are not shipped in the npm package).

```sh
npm run check
npm test
npm pack
npm run benchmark -- 10000
```

`npm pack` runs syntax checks, tests, and a smoke test against the extracted package. It does not publish. CI covers Windows, Linux, and macOS on Node 20, 22, and 24. The benchmark creates and removes its own temporary fixture and reports local listing time and process memory; it does not measure browser rendering or predict network-drive performance.

The npm tarball is also a portable source distribution: extract it, then run `node package/bin/panevrix.js`. Windows users can launch `package/bin/panevrix.cmd`; macOS/Linux users can run `sh package/bin/panevrix.sh`. These launchers require Node.js 20+. Standalone installers with an embedded runtime are planned; they are not currently supplied.

## VS Code and Cursor

An initial extension opens Panevrix directly in an editor tab, with workspace paths, native file opening, task progress and logs. It requires a trusted workspace and uses the editor's Node extension host, so no separate server or browser is needed.

```sh
npm run extension:package
```

In either editor choose **Extensions: Install from VSIX…**, select `extensions/vscode/panevrix-0.1.0.vsix`, then run **Panevrix: Open File Workspace**. Packaging requires Node 22+; the running extension requires an editor with Node 20+. See [extension installation and limits](docs/EDITOR_EXTENSION.md). Extension 0.1.0 is available for local testing; it is not published to a marketplace.
