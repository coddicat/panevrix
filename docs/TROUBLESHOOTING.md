# Troubleshooting

| Symptom | What to check |
| --- | --- |
| `EPERM` / `EACCES` creating or editing | Verify the path and your account's write access. Use the displayed system-permissions action when available. A development sandbox requires launching Panevrix from your own terminal; permission changes cannot bypass the sandbox. |
| Windows permission action | The app opens Properties. Check read-only status and Security permissions. Any administrator approval is handled by Windows; Panevrix does not silently elevate or change ACLs. |
| `Unexpected token F ... Forbidden` | Current source handles stale sessions and plain server errors. Restart the current source and reload. Confirm the browser URL is localhost and not a proxy website. |
| Port already in use | Use `panevrix --port 0` or choose another fixed port. |
| Browser did not launch | Open the printed URL manually; Linux needs a desktop/browser launcher for automatic opening. |
| Slow folder | Network shares and OS calls can stall. Loading is indeterminate until complete; cancel retains the previous listing. Metadata batches and virtualized rows reduce queued work and browser DOM size. |
| Progress stays at scanning | The source tree is still being enumerated. Cancel requests are honored between OS calls. Byte totals are unknown until scanning finishes. |
| Transfer fails | Read the task error, completed count and any retained cleanup paths. Inspect source and destination before retrying. Free disk space, disconnected volumes, changed sources and conflicting names can stop a task. |
| Missing progress after closing a window | Open Tasks / Ctrl+J. A server restart discards history; inspect destination files before retrying. |
| New features missing from `npx` | Source 1.1.0 is unreleased. `npx panevrix@latest` runs the published version; use `npm start` in the source checkout for these changes. |
| Browser intercepts shortcut | Use the visible toolbar action; do not rely on Alt+function-key shortcuts on Windows. |
| Blank process details / window names | OS permissions and collectors vary. Windows exposes process window titles; Unix tools report available process information. |
| Strange decoded text | Select the correct encoding. Pages can split multibyte characters. Hex preserves exact bytes; the editor handles UTF-8 only. |
| Cannot restore a deleted item | The original path may be occupied, or OS temp cleanup may have removed recovery files. Existing files are preserved. |

For an issue report, include OS, Node version (`node --version`), Panevrix version (`panevrix --version`), steps and a sanitized error/log excerpt. Avoid posting tokens, private paths or file contents. Describe whether the app was launched from a regular terminal or a sandbox.
