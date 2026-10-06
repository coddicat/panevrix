# Publishing Panevrix

Nothing is published automatically. GitHub CI only checks and packs the project.

## GitHub

Create an empty repository named `panevrix` in your GitHub account. Do not initialize it with another README or license. From this project directory, replace YOUR_USER with your real GitHub username:

```sh
git remote add origin https://github.com/YOUR_USER/panevrix.git
git push -u origin main
```

Add the actual GitHub URLs to package metadata before npm publication:

```sh
npm pkg set "repository.type=git" "repository.url=git+https://github.com/YOUR_USER/panevrix.git" "homepage=https://github.com/YOUR_USER/panevrix#readme" "bugs.url=https://github.com/YOUR_USER/panevrix/issues"
```

Commit this metadata change and push it.

## npm

The package is configured for a public release with the MIT license. Confirm that this license suits your release. The unscoped package name has not been reserved; verify availability with `npm view panevrix`. A registry 404 means no package is currently returned under that name, but does not guarantee you can publish it. If necessary, choose a scoped name such as `@YOUR_USER/panevrix`; the executable command remains `panevrix`.

```sh
npm run check
npm test
npm pack --dry-run
npm login
npm publish --access public
```

Complete npm authentication as prompted. The `prepack` script checks syntax and runs tests before creating the package. `postpack` extracts the generated archive to a temporary folder and verifies the packaged CLI, browser assets, and system monitor API; it uses the standard `tar` utility available on current Windows, macOS, and Linux installations. The package allowlist ships only the CLI, server, system collector, browser assets, license, README, and required package metadata. Tests, GitHub configuration, and local files are excluded.

An already-published version cannot be reused. Use `npm version patch`, `npm version minor`, or `npm version major` for subsequent releases, then push the commit and tag and run `npm publish` again.

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
