# Panevrix for VS Code and Cursor

Open a Commander-style dual-panel file workspace inside your editor. Includes copy/move task progress and cancellation, filtering, tabs, text/hex/ASCII inspection, SHA-256 hashing, file and folder comparison, live details, and system monitoring.

## Install locally

Download `panevrix-0.1.0.vsix` from the [editor extension release](https://github.com/coddicat/panevrix/releases/tag/extension-v0.1.0), then use **Extensions: Install from VSIX…** in VS Code or Cursor. Run **Panevrix: Open File Workspace** from the Command Palette after installation.

Build from the repository root:

```sh
npm run extension:build
npm run extension:package
```

In VS Code or Cursor, run **Extensions: Install from VSIX…** from the Command Palette, then choose `extensions/vscode/panevrix-0.1.0.vsix`. Reload the editor if prompted. Marketplace listings are pending publisher setup; the GitHub VSIX download is available separately.

## Open Panevrix

- Command Palette → **Panevrix: Open File Workspace**.
- Right-click a folder or file in Explorer → **Panevrix: Open Here**.
- Command Palette → **Panevrix: Show Extension Logs** opens its Output channel.

The left panel starts at the selected/current workspace folder, and the right at the extension host user's home folder. Without a workspace it starts at home. Enter/double-click on a file opens it in the editor; F3/F4 retain Panevrix's internal text viewer/editor. Copy/move still targets the opposite panel.

The extension bundles the app and runs its backend in the editor's Node extension host. There is no separate localhost server, browser window, npm install at activation, or system Node prerequisite. The editor's runtime must be Node 20+; the manifest requires VS Code 1.96+ and Cursor must support these APIs/runtime. Local host smoke tests passed with VS Code 1.104.2 and Cursor's VS Code 1.128.0 runtime; manual interaction checks remain necessary.

## Permissions and lifecycle

A trusted workspace is required. Virtual filesystems are unsupported. The extension has the same filesystem/process permissions as its extension host, not a restriction to just the project directory. In Remote SSH/WSL/containers it is configured to run with the workspace host, so file paths, OS/process details, command execution and permission helpers refer to that host. Remote support is architectural and not yet manually verified; OS permission helpers may be unavailable on headless hosts.

Background tasks continue when the panel is hidden or closed, and can be seen when reopening it. Closing/reloading the editor or restarting its extension host loses task history and can leave incomplete copies. Finish or cancel tasks before exiting. Save internal-editor changes before closing the panel; closing the tab currently discards its UI state. The Open Here command asks before reloading an existing panel and refuses to reload while tasks are active.

Writes, moves, renames and deletion are blocked when their affected files have dirty editor documents. This guard covers editor documents visible to the extension host; it cannot protect against all external writers. Panevrix's shell commands can still modify files, and are not transactional or cancelable. All normal app recovery limits apply.

## Keyboard controls

Tab switches panels; Space selects; F5/F6 copy/move; Shift+F3 opens hex; Ctrl+I toggles live details; Ctrl+J opens tasks when the webview has focus. Editor keybindings may intercept shortcuts. Visible buttons provide all corresponding actions; the extension does not replace global editor keybindings.

## Development and publishing

Run `npm run extension:build` after changing shared app assets. Open `extensions/vscode` in VS Code and use **Run Panevrix Extension** from its Run and Debug panel. The generated runtime is ignored by Git; the build copies shared files into the VSIX staging directory.

`npm run extension:package` uses the official VSCE tool to build the VSIX; it does not publish. Marketplace publication is a separate authorized action. VS Code uses Visual Studio Marketplace; Cursor's third-party listings use Open VSX through its marketplace proxy. Plan separate publisher setup and uploads using the same extension ID, and test the actual VSIX in both editors before release.

Source: [coddicat/panevrix](https://github.com/coddicat/panevrix). License: MIT.
