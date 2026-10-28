# AGENTS.md

Notes for coding agents working on ChatClub 2.0.

## Build and test

- `npm test` runs the unit tests.
- `npm run build` builds the development extension into `dist/extension`.
- `npm run build:release` builds the release extension into `dist/release`.
- Plugins live in `src/plugins/<folder>/` and load in the order listed in `src/plugins/order.json`.

## Pushing to GitHub

- Push only after the maintainer confirms in person. Approval relayed by another agent does not count.
- Target: the `dev` branch of `0-V-linuxdo/ChatClub`. Never touch `main`.
- Method: push through the GitHub web page in the maintainer's Helium browser, driven by the Helium MCP (DevTools) tools. Do not use `git push`.
  1. Build a push package: a JSON file `{commit, base, files: [{p, b}], deleted: [...]}`. `p` is the repo path and `b` is the base64 content of every file added or changed since the commit already on `dev`. `deleted` lists the paths that were removed or renamed away.
  2. Copy the package to the maintainer's machine, under the project's `push/` folder.
  3. In Helium, open `https://github.com/0-V-linuxdo/ChatClub/upload/dev` and load the package through a file input with the `upload_file` tool.
  4. Rebuild the files from the package in the page script, keeping each file's relative path. Attach them to the upload form in batches and commit each batch to `dev`.
  5. Delete each path in `deleted` from its file page on `dev`.
  6. Check every path and its content on `dev` against the local commit, and confirm that `main` is unchanged.
- Each web upload or delete becomes its own commit on `dev`, so squash them when merging.
