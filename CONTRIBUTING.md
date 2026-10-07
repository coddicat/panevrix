# Contributing

Use Node.js 20+ and a current browser. Clone the repository and run `npm start`; no dependency installation is required.

Before submitting changes run `npm run check`, `npm test`, and `npm pack`. The package smoke test requires the standard `tar` utility. Use `npm run benchmark -- 10000` for repeatable local-directory measurements; report OS, Node, storage type and file count. CI checks Windows, Linux and macOS with Node 20/22/24.

Test mutations using owned temporary fixtures, never users' real data. Important cases include cancellation, partial failure, conflicts, changing sources, symlinks, paths containing spaces, permission errors, stale sessions and independent panel state. Frontend navigation/virtualization tests run with Node's VM; browser verification is still needed for layout, focus and OS shortcut behavior.

Keep backend and UI error messages actionable. Distinguish indeterminate work from measured progress. Add documentation for shortcuts, limits and recovery behavior. New platform-specific subprocesses must avoid shell interpolation of filenames and hide helper windows on Windows.

Open a focused pull request describing the problem, resulting behavior and validation. Priorities are in [the roadmap](docs/ROADMAP.md). Never publish npm packages, create release tags or change trusted publishing configuration as part of routine development.
