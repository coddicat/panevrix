# Panevrix user guide

## Start and stop

Install Node.js 20 or newer. For the published release, run `npx panevrix@latest`. For the current source, run `npm start` from the repository. `npm start -- --port 0 --no-open` selects a free port and prints the URL. Keep the terminal open; Ctrl+C stops the server. Tabs and preferences persist in this browser's local storage. Explicit folder arguments override saved tabs.

Use `panevrix "C:\Work" "D:\Backup"` on Windows or `panevrix ~/work ~/backup` on macOS/Linux. The same interface runs on each OS with the permissions of its launching account. This application requires its local server; hosting its static pages on a website does not give them access to your computer's filesystem.

## Navigate and select

Click a panel or press Tab to activate it. Enter opens the cursor folder or opens a file in the default application. Backspace goes up. Arrow keys, Home/End and Page Up/Down move the cursor. Space/Insert selects an item and advances. Ctrl-click toggles an item; Shift-click or Shift+arrows extends a selection. Ctrl+A selects visible items.

Type to filter names; Ctrl+F focuses the filter and Escape clears it. Ctrl+L edits the folder path. Ctrl+T/Ctrl+W creates/closes folder tabs. Alt+Left/Right navigates history. Browser or OS shortcuts may take priority; all file actions have visible buttons.

Information (Ctrl+I) replaces the inactive panel with live cursor-item details. Select `..` to see current folder details. Counts cover immediate children, not the entire tree. Tab moves the information panel to the other side; toggling it off restores saved folders and tabs. Copy/move still targets that saved opposite folder.

## Tasks and recovery

F5 copies and F6 moves selected items to the other panel's folder. Change the destination in the dialog if needed. Conflict policy:

- **Stop before copying:** reject existing names found during preflight. A collision appearing later can still stop the operation.
- **Skip existing names:** leave matching top-level source/destination items alone; does not merge folders.
- **Keep both:** create a numbered destination name; does not overwrite or merge.

The progress window shows scanning, copied bytes, completed entries, current source and state. Totals become available after scanning, so the initial indicator is indeterminate. Total bytes describe ordinary file content; symlinks and folders contribute entries but not content bytes. Percentages are byte-based, not time estimates.

Close the window to keep browsing. Click Tasks or Ctrl+J to reopen an operation and cancel it. Up to eight unfinished tasks may be queued; only one runs at a time. The Tasks button shows the unfinished count and current byte percentage. Completed transfers trigger a panel refresh and a completion notification even with the progress window closed. Hashing and comparison use the same queue.

Cancel stops between filesystem calls or chunks. A pending OS call may take time to return. Completed top-level items remain completed. The incomplete current copy is removed where possible; cleanup failures report paths left behind. Sources are retained until a complete copy is available. During a move's source-removal phase cancellation is disabled briefly. If source removal fails, the complete destination remains and some source items may already have been removed. Inspect both locations before retrying.

Tasks are not transactional across multiple source items. Basic regular-file permissions and timestamps are preserved; ACLs, ownership, extended attributes, sparse allocation and hard-link relationships are not guaranteed. Special files are rejected. Symlinks are copied as links; Windows may require Developer Mode or permission to create them. Avoid editing/replacing source or destination trees during operations. Same-volume moves currently copy data as well, so they take more time and free space than an OS rename.

Task history is in server memory, bounded to 100 records with older finished records pruned when new tasks start. A restart loses task history and can leave an incomplete destination because shutdown is not durable recovery. There is no automatic resume. Before stopping the server, finish or cancel running tasks and wait for their final state.

Delete (F8) moves items into Panevrix's temporary recovery folder, not the OS Recycle Bin. Restore via Trash. OS temp cleanup can permanently remove recovery files. Delete and restore show an indeterminate operation indicator; these short operations do not support task cancellation.

## Inspect files and folders

F3 views UTF-8 text and F4 edits files up to 2 MB. Ctrl+S saves; externally modified files are rejected and unsaved text is retained. Editing writes directly to the file and is not an atomic replacement. Binary/large files open in the read-only byte viewer.

Shift+F3 opens any regular file in Hex view. Read 1 KB pages, jump to decimal/hex byte offsets, and search 1–256 hex bytes. Hex mode includes an ASCII column. ASCII text preserves tabs/newlines. The encoding menu offers UTF-8, UTF-16 LE and Windows-1252; decoded pages can show replacement characters at boundaries and do not provide exact byte hover/search highlighting. Hex and ASCII do. These are display settings, not file conversion.

Open Properties with Shift+Enter/right-click, then SHA-256 to hash a regular file. Compare files accepts one path from each panel or manually entered absolute paths. Results state exact equality or the first differing byte, including a length-only difference. Reads are streamed; size/mtime checks detect ordinary concurrent edits but cannot guarantee a consistent snapshot against every concurrent writer.

Switch Compare to Current folders to compare immediate names, types, sizes and dates. Equal size/date does not prove equal contents. Folders are not traversed, link targets are not compared, and at most 5,000 result rows are displayed. Name comparison is case-sensitive even on case-insensitive filesystems.

## Monitor and logs

System monitor shows OS/runtime, memory, CPU history, interfaces, process details and local activity. Available details depend on OS permissions and system tools; protected processes may omit fields. It does not terminate processes.

Application logs displays the last 500 timestamped server events and refreshes every second while open. The launch terminal shows the same events. Startup, requests, task states and errors are logged; polling endpoints are suppressed to avoid log spam. Request bodies, session tokens and shell commands are not deliberately logged. Paths and error messages can be sensitive. Logs remain in memory until exit; redirect CLI output if a persistent local log is needed:

```powershell
panevrix --no-open *> panevrix.log
```

```sh
panevrix --no-open > panevrix.log 2>&1
```

Use a writable location and inspect logs before sharing. Output redirection hides the printed URL; use the selected fixed port or inspect the log.

## Shell commands

F10 opens the command bar. Each command runs in a fresh PowerShell process on Windows or `/bin/sh` on macOS/Linux, in the active folder. Output is bounded to 2 MB and execution to 30 seconds. Interactive input, persistent shell state, streaming command output and command cancellation are not supported. An indeterminate progress bar and running status are shown until completion. Filename search also shows indeterminate progress while results are gathered. Commands inherit your account's permissions.
