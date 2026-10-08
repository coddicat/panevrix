# Prioritized roadmap

Panevrix targets developers and advanced users who want a keyboard-driven file workspace and local system inspection. Reliability and responsiveness take precedence over feature count. This is a plan, not a release schedule.

| Priority | Objective | Delivered in 1.1.0 | Remaining work / acceptance criteria |
| --- | --- | --- | --- |
| P0 | Trustworthy operations | Queued tasks, byte/item progress, cancellation, conflict policies, exclusive destination creation, partial-copy cleanup, source-change checks, copy-before-remove moves | Durable task journals and restart recovery; stronger protection against concurrent directory replacement; fault injection for disk-full and disconnected volumes; atomic editor saves |
| P0 | Visibility and diagnosis | CLI startup/request/error/task logs; live application log window; task history and reopening progress | Optional file logging, retention controls, export with privacy review; cancelable shell execution |
| P1 | Large directories | Virtualized rows, bounded metadata batches, canceled navigation, reproducible listing benchmark | Incremental directory delivery and filter workers; measure 10k/100k entries and network drives; keep keyboard navigation responsive during filtering |
| P1 | Developer inspection | Streamed SHA-256, exact byte comparison and first difference, bounded decoded text with encoding selection | Side-by-side text diff, line/regex search for large logs, context across encoding boundaries, bookmarks |
| P2 | Installation | npm CLI, portable source archive and Windows/POSIX launchers, nine-platform/runtime CI combinations | Standalone signed Windows/macOS/Linux distributions with embedded Node runtime and update policy; validate on clean machines without Node |
| P2 | Local integrations | Immediate folder name/type/size/date comparison | Archive listing then extraction with traversal, symlink, overwrite and decompression limits; recursive comparison with optional hashes and cancelation |
| P3 | Remote workflows | Architecture keeps filesystem operations on local backend | SFTP with explicit host-key verification, scoped credentials and progress; no credential storage until a secure policy is defined |
| P3 | Extension ecosystem | Dependency-free modular backend | Design stable plugin contracts after file operations and security boundaries are mature |

## Release gate

Before releasing 1.1.0: syntax, file-operation/recovery tests, package smoke test and the Windows/Linux/macOS matrix must pass. Review documented safety limits. Perform browser verification of task progress, cancel, background navigation, modal errors, and virtualized keyboard navigation. Publication requires explicit release authorization; a source push alone never publishes.

## Product position

Differentiate through a portable local developer workspace: file management, large binary inspection, system monitoring, and transparent task execution. Established file managers have deeper archive, remote, and plugin support. The immediate goal is a dependable focused tool, rather than claiming feature parity with all competitors.
