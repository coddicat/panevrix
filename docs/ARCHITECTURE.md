# Architecture and local API

## Components

- `bin/panevrix.js`: CLI parsing, browser launch, lifecycle; `.cmd`/`.sh` portable launchers.
- `server.js`: IPv4 loopback HTTP, session token/origin/Host validation, filesystem and shell endpoints.
- `lib/operations.js`: serial task queue, streaming transfer/hash/comparison, cancellation and cleanup.
- `lib/logging.js`: timestamped stdout/stderr events and 500-entry memory buffer.
- `lib/system.js`: OS-specific system/process collectors.
- `public/app.js`: two-panel state, virtual rows, keyboard handling, details, dialogs, task polling and viewers.

There are no runtime dependencies or build step. Files are read by Node with the launching account's permissions. Browser local storage stores tabs, preferences, favorites and activity; server state stores jobs and logs. The server does not watch filesystem changes automatically.

## API contract

All endpoints use POST JSON at the printed local URL, with `X-Commander-Token` from the served page's `commander-token` meta element. The token is regenerated each server process. Do not expose this API remotely. Responses are JSON; failures include `error` and, where applicable, `code` and `path`. Session failures return 403 `SESSION_EXPIRED`; permission errors return 403; other operation failures return 400.

| Route | Input / response |
| --- | --- |
| `/api/config` | Runtime paths, platform, roots, separator |
| `/api/list` | `{path}` → folder, parent, file metadata, disk |
| `/api/details` | `{path}` → item metadata, immediate folder summary |
| `/api/task-start` | `{type, ...fields}` → `{id}`; type `copy`/`move` (`sources`, `destination`, `conflict`), `hash` (`path`), `compare`/`folders` (`left`, `right`) |
| `/api/task` | `{id}` → state, phase, bytes, total, processed/items, current, cancelable, timestamps and final result/error |
| `/api/task-cancel` | `{id}` → current snapshot; cooperative, cancellation may still be settling |
| `/api/tasks` | `{tasks:[...]}` newest first |
| `/api/logs` | `{entries:[{id,time,level,message}]}` |
| `/api/copy`, `/api/move` | Legacy synchronous transfer with default stop-on-conflict; UI uses task endpoints |
| `/api/rename` | `{path,name}` |
| `/api/mkdir`, `/api/create` | `{path,name}`; exclusive creation |
| `/api/delete`, `/api/trash`, `/api/restore` | `{sources}`, no fields, `{id}` |
| `/api/read`, `/api/write` | `{path}`; `{path,text,modified}` protects ordinary external edits |
| `/api/hex` | `{path,offset,length,size?,modified?}`; length 1–65,536 |
| `/api/hex-search` | `{path,offset,pattern,size?,modified?}` → found offset or next chunk |
| `/api/search` | `{path,query}`; bounded recursive filename search |
| `/api/system` | System/process snapshot |
| `/api/permissions`, `/api/open` | `{path}`; launches local OS UI/application |
| `/api/command` | `{path,command}` → bounded output and success flag |

Task states: `queued → running → completed/failed/canceled`; queued cancellation immediately ends the task. Closing a progress dialog stops detailed polling, not execution. A lightweight task-list poll keeps the toolbar count/progress and completion notifications current. Job cancelation uses its own controller, independent of the initiating HTTP connection. Navigations use per-tab request cancellation and revision guards. Logs omit polling routes.

## Limits and safety

Transfers accept 1–10,000 top-level sources, scan up to 256 folder levels, copy in 1 MB chunks, and use exclusive output creation. Scanned tree metadata stays in memory, so extremely large recursive trees remain a limitation. Hashing uses 1 MB; comparison uses two 64 KB buffers and stops at the first differing byte. Folder comparison displays up to 5,000 entries and is not recursive.

Text editing is limited to 2 MB. Hex UI pages contain 1 KB; searches read 8 MB plus overlap per request. Filename search stops at 500 results, 20,000 entries or 15 levels. Directory rows are virtualized but all listing metadata and client sorting/filtering still live in memory. No guarantees are made about performance on slow network filesystems.

Host/origin checks, per-process tokens and CSP reduce cross-site access. This is not a sandbox for untrusted local users or code. Concurrent filesystem changes cannot be eliminated by metadata checks; tasks are not durable transactions. See [security](../SECURITY.md) and [user guide](USER_GUIDE.md).
