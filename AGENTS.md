# Agent Notes

## Browser: Arc, Zen, Firefox Nightly, Dia

- Do not use `javascript:` bookmarklets for page inspection or verification.
- Do not use `osascript`.
- Use DevTools for console probes, DOM inspection, and runtime verification.

## Plugin Versioning

- After every plugin update, update `shared/constants.js` `APP_VERSION`.
- Version format must be exactly `「YYYY-MM-DD｜HH:MM:SS」`.
- Use the local machine time when making the update.

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
