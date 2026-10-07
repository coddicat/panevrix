# Publishing Panevrix

Public repository: https://github.com/coddicat/panevrix

**Current source: 1.1.0 (unreleased). npm publication is paused. Do not create a release or dispatch publishing until publication is explicitly resumed.**

Every push and pull request runs checks on Windows, Linux, and macOS with Node.js 20, 22, and 24. Publishing a stable GitHub release runs the same checks for its tag, then publishes to npm through `.github/workflows/publish.yml`.

## Automated npm publishing setup

After the first manual npm publication, open https://www.npmjs.com/package/panevrix/access and configure a GitHub Actions trusted publisher:

| Field | Value |
| --- | --- |
| Organization or user | `coddicat` |
| Repository | `panevrix` |
| Workflow filename | `publish.yml` |
| Environment | Leave blank |
| Allowed actions | Enable direct publishing with `npm publish` |

No npm token or repository secret is needed. Current npm publisher configurations allow staged publication by default, so explicitly allow direct publication for this workflow. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

For later releases, increase the version on `main`, push its commit and tag, then publish the matching GitHub release:

```sh
# Version 1.1.0 is already set in the source; commit and push verified changes.
git tag v1.1.0
git push origin main
git push origin --tags
gh release create v1.1.0 --title "Panevrix 1.1.0" --generate-notes
```

Replace `v1.1.0` with the actual version. The workflow requires a stable `vX.Y.Z` tag matching `package.json` and a commit in `main` history. It tests all nine OS/Node combinations, builds and smoke-tests the archive, publishes with OIDC and provenance, and attaches the archive to the GitHub release. Ordinary pushes and pull requests do not publish. The workflow also supports manual dispatch with an existing tag, for retrying after configuration changes. Published npm versions cannot be reused.

## GitHub

The repository is already created and the local `origin` points to it. Push future source changes with:

```sh
git push -u origin main
```

Package metadata already points to `coddicat/panevrix`.

## Manual npm publishing

The package is configured for a public release with the MIT license. Enable npm two-factor authentication and complete the browser authorization when prompted. Before retrying an interrupted publication, check `npm view panevrix versions` to avoid reusing a version that was already accepted by the registry.

```sh
npm run check
npm test
npm pack --dry-run
npm login
npx --yes --package=npm@11 npm publish --access public
```

Complete npm authentication as prompted. The `prepack` script checks syntax and runs tests before creating the package. `postpack` extracts the generated archive to a temporary folder and verifies the packaged CLI, browser assets, and system monitor API; it uses the standard `tar` utility available on current Windows, macOS, and Linux installations. The package allowlist ships only the CLI, server, library modules, browser assets, portable launchers, license, README, user documentation, and required package metadata. Tests, GitHub configuration, and local files are excluded.

An already-published version cannot be reused. Use `npm version patch`, `npm version minor`, or `npm version major` for subsequent releases, then use the GitHub release workflow described above.

## Run after publication

```sh
npx panevrix@latest
```

Or install it once:

```sh
npm install -g panevrix
panevrix
```

For a scoped package use `npx --package @YOUR_USER/panevrix panevrix`, or `npm install -g @YOUR_USER/panevrix` followed by `panevrix`.

Both routes run a local Node server and open your browser. Files remain on your machine. Stop with Ctrl+C. To use different folders or a free port:

```sh
panevrix . ../another-folder --port 0
```
