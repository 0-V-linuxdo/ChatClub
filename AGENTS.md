# Agent Notes

## Browser: Arc, Zen, Firefox Nightly, Dia

- Do not use `javascript:` bookmarklets for page inspection or verification.
- Do not use `osascript`.
- Do not use the Codex in-app browser for page inspection or verification.
- Use DevTools for console probes, DOM inspection, and runtime verification.

## Plugin Versioning

- After every plugin update, update `shared/constants.js` `APP_VERSION`.
- Keep `manifest.json` `version_name` exactly equal to `APP_VERSION`; this is the version shown on the browser extension details card.
- Keep `package-info.json` `version`, `versionName`, and `label` equal to `APP_VERSION`, and update `packagedAt` to the matching UTC timestamp.
- Keep `manifest.json` `version` as a valid numeric Chrome extension version, and bump it when `version_name` moves to a new date.
- Version format must be exactly `「YYYY-MM-DD｜HH:MM:SS」`.
- Use the local machine time when making the update.

## Settings List Drag Sorting

- Any settings page list whose item order is persisted or user-visible must expose the same drag sorting affordance as the other settings lists: a leading drag handle, visible `drop-before` / `drop-after` feedback, and saved order after drop.
- When adding or changing ordered settings lists, verify the order survives normalization, dehydration, redraw, settings reopen, and extension reload.
- For built-in lists merged with stored user config, preserve the stored order first and append only newly introduced built-ins afterward; do not let normalization silently reset user ordering.

## Summary Userscript Fix Workflow

- Before editing built-in userscripts, inspect the real page structure and validate the proposed selector/turn logic in DevTools Console.
- Only after the console probe succeeds, patch the source userscript and synchronized generated assets.
- When changing built-in summary userscripts, keep these files in sync:
  - `userscripts/*.js`
  - `userscripts/index.json`
  - `shared/summary-sites.js`
  - `content/summary-userscripts.js`
  - `content/summary-userscripts-main.js`
  - `shared/constants.js` when `SUMMARY_SITE_CONFIG_VERSION` must change
- Recalculate `userscriptLength` after changing a userscript body.
- Bump the per-site `configVersion` for each changed site, and bump `SUMMARY_SITE_CONFIG_VERSION` when shipped config changes.

## Delete Sites Userscript Runtime

- Delete Sites failures can be caused by stale stored built-in userscript source, not by the current packaged `.user.js` file. Do not rely only on the editor textarea or source file; verify whether storage normalization will migrate old generated built-ins to the packaged default.
- Do not identify generated built-in Delete Site userscripts only by exact source length. Old generated copies may differ by metadata, `@match`, whitespace, or prior generated versions; use semantic markers such as ChatClub namespace, site `SITE_ID`, delete-site DOM event contract, debug hook, and site runner.
- A Delete Sites userscript result of `{ ok: true }` is not sufficient proof that deletion finished. Some sites, especially Notion, may successfully open the confirmation modal but ignore synthetic clicks on the final Confirm button.
- After a Delete Sites run, check whether a delete confirmation dialog is still visible. If it is still present, treat the operation as unfinished and use the trusted-click fallback path instead of showing a success toast.
- For Notion, the common failure point is the final confirmation dialog, not the menu trigger: the Delete menu item can work while the Confirm button remains open. Debug the confirmation state separately from the menu-opening state.
- For Kagi Delete Sites, do not fall back to clicking sidebar thread links or title/link menus after the native delete shortcut path fails. That can navigate to a thread instead of deleting; a safe failure is preferable to clicking a conversation link.
- For DeepSeek Delete Sites, do not treat a generic `aside`, `nav`, history, or main-content container as the sidebar unless it contains visible `/chat/s/` or `/a/chat/s/` conversation links. A false sidebar root leads to `topic menu trigger not found`.
- DeepSeek may show the current conversation link in the sidebar while keeping the row menu button out of the accessibility tree until real pointer hover. Synthetic `mouseover` is not enough for CSS `:hover`; use a trusted mouse-move/hover retry before concluding the topic menu is missing.
- In ChatClub's embedded DeepSeek iframe, the current sidebar conversation can be exposed as a plain `a[href*="/chat/s/"]` with no row menu button at all, while the current chat title/header exposes small unlabeled buttons near the title. In that structure, use a current-title/header menu fallback and only click a resulting explicit `Delete`/`删除` menu item; do not keep retrying only the sidebar row menu.
- In ChatClub's embedded DeepSeek iframe, the visible `...` menu may be absent from the accessibility tree even when the current `/chat/s/` link is exposed. Anchor the delete flow to the current `/chat/s/` or `/a/chat/s/` link first, then probe around that link's right edge.
- In ChatClub's embedded DeepSeek iframe, the current `/chat/s/` link can be text-width only while the visible `...` sits at the right edge of the highlighted visual row. Promote the current link to its same-line visual row before applying right-edge hover/click probes.
- DeepSeek can focus/select the sidebar `...` trigger while ignoring a single synthetic click. Do not treat "event dispatched" as success; after each pointer/native/framework activation attempt, verify that a `Delete`/`删除` menu item actually appeared before moving on.
- The working `Template_shortcuts` DeepSeek delete shortcut uses an activate-until-menu pattern: full pointer/mouse sequence first, then native/framework fallbacks, checking for the menu after each attempt. Keep ChatClub's Delete Sites DeepSeek path aligned with that behavior.
- A `[PostMessage] Timeout waiting for response: deleteThread` from a Delete Sites run means the target iframe did not answer through `content/content.js`; it is a frame runtime/injection/loaded-state problem, not proof that the site userscript logic ran and failed.
- Before concluding a Delete Sites script failed, ping the iframe content bridge and, if needed, ask the background service worker to inject `content/preload.js` and `content/content.js` into the matching web subframe. The top-level app should report bridge injection failures separately from site deletion failures.
- ChatClub-triggered Delete Sites requests must use a version-scoped request event/message, for example `chatclub:delete-site:request:<version>` and `request:<version>`. Otherwise stale already-injected listeners can receive the generic request and execute old behavior in parallel with the current textarea source.
- Delete Thread iframe `postMessage` requests also need a versioned source. Existing iframes can keep old `content/content.js` and `content/preload.js` listeners alive after reinjection; a generic `source: "chatclub"` request lets stale listeners answer first.
- For edited built-in or custom standalone Delete Sites userscripts, do not reuse an existing same-version debug registry entry before injection. Users often edit the body without changing `@version`, so the runtime must dispose stale same-site entries and inject the textarea source first.
- Do not use broad semantic built-in detection to override a Delete Sites script when `userscriptOverride` is true. Exact current source, known generated lengths, and legacy fragments are safe; broad marker matching can erase real user edits.

## Kagi Message Extraction

- Kagi Assistant places `Copy references to clipboard` inside the assistant response before the assistant `Copy message` button.
- Do not use a broad copy-button sequence scan for Kagi; it can click the References copy button and shift user/assistant roles.
- Prefer strict message-copy detection: accept `Copy message` buttons only, and explicitly exclude references, sources, and citations.

## Grok Message Extraction

- Grok and Grok mirrors can expose `Thought for ...` through multiple nested wrapper nodes.
- Do not treat every `div`, `span`, or `[role=button]` containing `Thought for` as a separate assistant turn.
- Prefer the short visible `Thought for ...` button as the marker, then de-duplicate turns by role and compacted text.
- Keep assistant-node de-duplication in place so nested wrappers do not produce repeated user or assistant messages.

## Verification

- For generated userscript bundles, run syntax checks such as:
  - `node --check content/summary-userscripts.js`
  - `node --check content/summary-userscripts-main.js`
- For `shared/summary-sites.js`, remember it is browser ESM; plain `node --check` may fail on `export` unless transformed or loaded as ESM.
- Validate that generated embedded scripts match their source userscripts before committing.
