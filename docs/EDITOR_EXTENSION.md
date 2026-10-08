# VS Code and Cursor extension

Panevrix's initial editor extension is version **0.1.0**, bundled with source app **1.2.0 (unreleased)**. The npm release remains 1.1.0. Building this extension does not publish either package.

## Install and launch

From the repository root:

```sh
npm run extension:package
```

This prepares a fresh runtime and uses the official VSCE 4.0.0 packager. Packaging requires Node 22+; the app and running extension require Node 20+. The first packaging run downloads the development packager; there are no extension runtime dependencies.

In either editor use Command Palette → **Extensions: Install from VSIX…** and select `extensions/vscode/panevrix-0.1.0.vsix`. Then run **Panevrix: Open File Workspace**. Explorer and editor context menus also offer **Panevrix: Open Here**. This opens a webview editor tab. Opening a file through Panevrix's Enter/default-open action uses the editor; F3/F4 keep the app's internal viewer/editor.

Manual installation is recommended for testing before publishing. The VS Code and Open VSX publisher identities must be set up separately; the manifest's `coddicat` publisher is intended, not proof of an existing registered publisher. No marketplace publication has been performed.

## Backend and resource model

The extension invokes the shared `server.api` directly inside its Node extension host. Webview requests use a correlated message bridge rather than HTTP. Allowed routes, payload sizes, concurrent request counts and workspace trust are checked before dispatch. Abort messages cancel pending directory requests; background tasks use independent job controllers and continue after the panel closes. The app's HTTP safeguards are still used in normal CLI/browser mode.

Only packaged public assets are exposed through `asWebviewUri` and `localResourceRoots`. Nonce-based script CSP allows the two packaged scripts and denies network connections. The editor API object is kept inside a closure. The extension does not start a browser, bind a port, download runtime code on activation, or override global editor shortcuts.

## Permissions and caveats

Trusted real-filesystem workspaces are required. The backend can access any filesystem paths accessible to its extension host; it is not confined to the current project. It is a workspace extension, so Remote SSH/WSL/container workspaces run it on their workspace host. Remote operation has not been manually verified. System details, shell commands and OS permission helpers refer to that host; permission helpers may be unavailable without a desktop.

Save dirty editor documents before changing them through Panevrix. Its guard checks writes and affected source trees for moves, deletion and renames. It does not intercept arbitrary shell commands or external writers. Normal copy/move/editor safety limits still apply. Closing a Panevrix tab discards its UI state and any unsaved internal-editor text; hiding the tab retains it. Open Here asks before reloading and refuses reload during unfinished jobs. Finish/cancel jobs before shutting down the extension host because restart recovery is not durable.

## Tests

`npm test` builds the runtime and runs bridge validation/cancellation, CSP, dirty-document and existing app tests. For a real editor smoke test after building:

```powershell
node scripts/editor-smoke.js "C:\Users\YOUR_USER\AppData\Local\Programs\Microsoft VS Code\Code.exe"
node scripts/editor-smoke.js "C:\Program Files\cursor\Cursor.exe"
```

Use the actual executable path on your system. The runner launches an isolated profile and disposable workspace, activates the extension, opens its panel, waits for the webview's configuration request to reach the backend, and removes its own fixture. It does not modify your regular editor profile or install the extension globally.

Verified locally with VS Code 1.104.2 / Node 22.18.0 and Cursor's VS Code 1.128.0 runtime / Node 24.18.1. Smoke tests confirm activation and initial webview communication; manual checks of layout, shortcuts and interactive file operations remain necessary. CI builds the VSIX as a downloadable artifact alongside the normal nine OS/runtime combinations.

## Useful references

- [VS Code webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Workspace trust](https://code.visualstudio.com/api/extension-guides/workspace-trust)
- [VS Code packaging and publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Cursor extension distribution](https://prod.cursor.com/help/customization/extensions)
