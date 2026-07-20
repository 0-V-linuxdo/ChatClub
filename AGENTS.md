# Agent Notes

## Branch Policy

- This repository must keep exactly one Git branch locally and on `origin`: `main`.
- Work directly on `main`. Do not create, check out, publish, or leave behind any other branch, including `codex/*`, feature, release, temporary, or worktree branches.
- Before changing files, switch to `main`, fetch `origin`, and update only with a fast-forward. If local and remote `main` have diverged, stop and ask the user instead of creating a reconciliation branch or force-pushing.
- Push only `main` and never force-push it. A workflow that requires a pull-request branch needs an explicit user override of this policy.
- If a non-`main` branch is created accidentally, integrate any intended work safely into `main`, then delete that branch locally and on `origin` before finishing.
- At handoff, verify that the working tree is clean, `main` matches `origin/main`, and both local and remote branch inventories contain no branch other than `main`.

## Browser Verification

### Manual target browsers

- Arc
- Zen
- Firefox Nightly
- Dia
- Tabbit

Use DevTools for real-site console probes, DOM inspection, network inspection, and runtime verification.

- Do not use `javascript:` bookmarklets.
- Do not use `osascript`.
- Do not use the Codex in-app browser for page inspection or verification.
- Do not generalize one branded browser's behavior to every browser using the same engine.

Manual compatibility observation recorded 2026-07-16; the exact browser version numbers were not recorded with these observations:

- Before verifying changed extension code in Arc, first reload the unpacked extension at `arc://extensions/?id=kplgajidbllaeekcfpcdcbocbhppbind`, then reload or reopen the preserved ChatClub tab. Reloading the ChatClub page alone is not proof that Arc is running the current extension code.
- Arc and Dia preserve the ChatClub extension tab across extension reloads.
- Tabbit closes that tab on extension reload, so workspace restoration across extension reload is not supported there.
- This reload behavior has not been recorded for every other manual target; verify it in the affected browser when changing workspace recovery.

### Automated engine baselines

The automated baselines are separate from the manual branded-browser matrix:

- Repository-pinned Playwright Chromium, currently major 149 through `playwright@1.61.1`.
- Chrome for Testing 120, the packaged Chromium minimum.
- Firefox 136.
- Latest Firefox Nightly.

Each local smoke invocation tests exactly one selected browser binary; it does not run the four-baseline matrix.

- Chromium requires `EXPECTED_CHROMIUM_MAJOR`. Set `CHROMIUM_BINARY` when testing Chrome for Testing 120 or another non-Playwright binary.
- Set an explicit `FIREFOX_BINARY` for the Firefox 136 and Nightly baselines. Set `EXPECTED_FIREFOX_MAJOR=136` when testing the fixed minimum; the rolling Nightly job intentionally does not pin a major.
- GitHub Actions runs four smoke invocations across three browser jobs in `.github/workflows/ci.yml`: the Chromium job runs Playwright Chromium 149 and Chrome for Testing 120 sequentially, while Firefox 136 and Firefox Nightly each have their own job.

Run the relevant `npm run smoke:chromium` or `npm run smoke:firefox` invocation after cross-browser runtime, manifest, content-injection, frame-routing, or packaging changes. An engine smoke pass does not replace a manual check in an affected branded browser.

## Overlay Dismissal Policy

Classify overlays by interaction type instead of adding one-off close flags at call sites.

- Application code must use `editorModal`, `taskModal`, `confirmationModal`, or `viewerModal`. Keep the raw `modal()` helper only as a backward-compatible UI primitive and for its own regression tests.
- Editors, tasks, and confirmations must ignore backdrop clicks and Escape. They close only through their visible header/footer actions or after a successful primary action.
- Viewers may close from the backdrop as well as their visible close actions because they do not own unsaved input or in-flight work.
- While a task or confirmation is applying a mutation, guard every close path and disable its close controls until the operation settles. Programmatic success may force the final close.
- Popovers and menus may close on outside interaction or Escape. Their teardown must be owner-scoped; one component must not remove another component's popover, backdrop, anchor class, or listeners through generic selectors.
- Persistent non-modal panels, such as Summary, may close through their own close action or Escape only while no modal or popover is in front of them; outside clicks do not dismiss them.
- Escape affects only the topmost eligible overlay. A foreground modal or popover must prevent a background panel from closing, and composition events (`isComposing` or key code 229) must not trigger dismissal.

## Release Versioning

Use Node.js 22 or 24 for generation, verification, and packaging. The repository `.nvmrc` pins Node 24; run `nvm use` and confirm `node --version` before `npm ci` or release-related scripts. `package.json` permits 22.x or 24.x. Generation, static verification, Node regression tests, package verification, local CI, GitHub CI, and release packaging all reject unsupported majors.

Every changed Chromium or Firefox release payload must receive a new release version. Documentation- or tooling-only changes outside the package plan do not require a release bump.

- Set `shared/constants.js` `APP_VERSION` from the Asia/Shanghai local release time, exactly as `「YYYY-MM-DD｜HH:MM:SS」`.
- Keep `manifest.json` `version_name` exactly equal to `APP_VERSION`.
- Keep `package-info.json` `version`, `versionName`, and `label` exactly equal to `APP_VERSION`.
- Set `package-info.json` `packagedAt` to the canonical UTC representation of the same instant.
- Keep `manifest.json` `version` as exactly four numeric components in `YYYY.M.D.N` form.
- Each numeric component must be in the Chrome extension range `0..65535` without a leading zero.
- The first three numeric components must match the Asia/Shanghai release date.
- Increment `N` for every changed release payload on the same date. Reset it only after the date advances.
- Never move `APP_VERSION` or the numeric version backwards, and never reuse or retain either version after the release payload changes.

After all intended source and generated changes are present:

1. Update both display and numeric versions.
2. Run `npm run generate`.
3. Run `npm run version:snapshot`.
4. Run `npm run check` and `npm test`.
5. Run `npm run verify:pack`, or `npm run ci` for the complete local static, Node-regression, and package-plan gate.
6. Run the relevant browser smoke and manual branded-browser checks for runtime-facing changes.
7. Build both `npm run pack` and `npm run pack:firefox` for a release.

The complete automated engine-baseline gate is the GitHub Actions workflow, not `npm run ci` by itself. It does not replace manual checks in Arc, Zen, Firefox Nightly, Dia, or Tabbit when a branded-browser behavior is affected.

Do not refresh `version-state.json` to hide a missing version or site-config bump. Fix the version first, then regenerate the snapshot.
Treat `version-state.json` as a generated release snapshot; update it only with `npm run version:snapshot` after the required version changes.

## Generated Artifacts and Author Sources

Do not hand-edit generated files.

### Content bundles

- Author entry points and local modules: `content-src/**`
- Transitive imported author inputs: `shared/**` modules, especially protocol, frame-command, constants, and shortcuts
- Separately generated virtual-registry inputs: `chatclub:summary-registry`, derived from `userscripts/index.json`, the referenced `userscripts/*.js` bodies, and `shared/protocol.js` `CONTENT_BRIDGE_VERSION`
- Generated outputs: `content/*.js`
- Generated Firefox fallback: `background/firefox-content-fallbacks.generated.js`

Run `npm run generate` after changing an entry point or any transitive content-bundle input. Use `npm run verify:generated` to check freshness without writing.

### Built-in Summary scripts

- Script bodies: `userscripts/*.js`
- Canonical site metadata: `userscripts/index.json`
- Lightweight runtime catalog mirror: `shared/summary-sites.js`; generation verification must compare all serializable metadata fields, not only version and length
- Global shipped-config version: `shared/constants.js` `SUMMARY_SITE_CONFIG_VERSION`
- Generated registries/bundles: `content/summary-userscripts.js` and `content/summary-userscripts-main.js`
- Generated Firefox fallback containing those bundles: `background/firefox-content-fallbacks.generated.js`

When a built-in Summary script or shipped Summary config changes:

1. Inspect the real site and validate the proposed selectors and turn logic in DevTools Console.
2. Edit the appropriate `userscripts/*.js` body. Site metadata belongs in `userscripts/index.json` and its runtime mirror, not in the body.
3. Keep every site metadata field synchronized between `userscripts/index.json` and `shared/summary-sites.js`, and increment that site's `configVersion` in both when shipped behavior or metadata changes.
4. Increment `SUMMARY_SITE_CONFIG_VERSION` and the index's matching global version.
5. Run `npm run generate`. The generator owns the computed `userscriptLength` in `userscripts/index.json`; if the lightweight catalog reports drift, copy the computed length into `shared/summary-sites.js` and rerun generation.
6. Run the site-specific regression test when one exists. Otherwise add targeted coverage or record the live DevTools acceptance performed.
7. Run `npm run verify:generated`, `npm run check`, and `npm test`.

The per-file Summary header is descriptive only. Do not treat a legacy `global config version` header comment as authoritative; `SUMMARY_SITE_CONFIG_VERSION` and `userscripts/index.json` own the shipped global value.

Do not patch only an embedded generated copy.

### Built-in Delete Site behavior

Normal built-in execution prefers the native runner. Standalone userscripts are independent userscript/custom/compatibility assets, not the normal built-in execution path.

Site algorithms and standalone assets have multiple author paths that must stay aligned:

- Isolated-world native runners: `content-src/content.js`
- DeepSeek MAIN-world bridge: `content-src/preload/deepseek-delete.js`
- Standalone userscript source/template: `build-src/topic-delete-userscript-sources.js`
- Standalone descriptors, versions, lengths, hosts, paths, and timeouts: `shared/topic-delete-sites.js`
- Generated standalone outputs: `topic-delete-userscripts/*.user.js`

Runtime and transport changes may also require updates to:

- Orchestration and completion verification: `app/topic-delete/runtime.js`
- Custom injection and trusted input: `background/runtime.js` and `background/trusted-input.js`
- Frame commands, Frame RPC, protocol events, content registration, injection, and relay: `shared/frame-commands.js`, `shared/frame-rpc.js`, `shared/protocol.js`, `background/content-registration.js`, `background/frame-injection.js`, and `background/frame-relay.js`

When built-in Delete Site behavior changes:

1. Validate the current page structure and proposed interaction in DevTools before editing.
2. Update every affected author path; do not edit a generated `.user.js`.
3. When a standalone body changes, bump its author-source version constant in `build-src/topic-delete-userscript-sources.js` and every affected descriptor `scriptVersion`. Most sites share `DELETE_USERSCRIPT_VERSION`; Gemini uses `GEMINI_DELETE_USERSCRIPT_VERSION`, so a shared engine change can affect multiple outputs.
4. Run `npm run generate` to produce the standalone outputs. The first run may intentionally stop after writing them when the still-old descriptor version or length is detected as drift.
5. Update every affected descriptor `userscriptLength` to the generated source's normalized, trimmed length, and correct any reported descriptor `scriptVersion` drift.
6. Rerun `npm run generate`, verify that every descriptor `scriptVersion` equals its generated `@version`, then run `npm run verify:generated`, `npm run check`, and `npm test`.
7. Keep target identity, explicit destructive-action selection, and completion/fail-closed safety semantics aligned across native, MAIN-world bridge, and standalone paths. Their DOM heuristics and trusted-input capabilities need not be implementation-equivalent.

## Settings List Ordering

Any Settings list whose order is explicitly user-configurable must provide:

- A leading drag handle.
- Visible `drop-before` and `drop-after` feedback.
- Saved order after drop.

Verify, where each lifecycle applies, that the order survives normalization, dehydration and rehydration, redraw, Settings reopen, storage reload, and extension reload.

For built-in entries merged with stored user configuration, preserve stored user order and append newly introduced built-ins afterward. An explicit, versioned migration may replace a recognized untouched historical default only once; persist a migration marker, document and regression-test the migration, and do not repeatedly reinterpret a current saved order as a historical default. If untouched historical defaults cannot be distinguished from genuine customization, preserve the user's saved order.

The drag requirement does not apply to read-only or derived views, search/filter projections whose order is not persisted, lists with fixed semantic or protocol order, chronological histories, or controls that are not ordered lists.

## Delete Sites Runtime Safety

Unless explicitly labeled as implementation inventory, these are stable safety invariants rather than site-specific selector observations.

### Frame command delivery

- Extension page to iframe commands use authenticated Frame RPC bound to the exact registered frame and document.
- `deleteThread` is a mutating command. If a failure may have been delivered, including any `TIMEOUT`, never resend it automatically.
- Bridge repair and one retry are allowed only for explicit pre-delivery failures: `delivered === false` with `NOT_REGISTERED`, `STALE_DOCUMENT`, or `INJECTION_FAILED`.
- The same rule applies inside a content command that delegates to a mutating MAIN-world bridge: fall back to a native runner only after an explicit pre-delivery result that proves no destructive action was activated. A bridge timeout, malformed response, unknown delivery state, or failure after activating Delete/Confirm must not start another runner.
- Before a pre-delivery retry, prepare and revalidate the content bridge successfully.
- Current packaged content-script bridge inventory (generated outputs, not author sources or the complete transport path): `content/preload.js`, `content/grok-cookie-bridge.js`, `content/message-navigator.js`, and `content/content.js`.
- Keep registration/injection failures distinct from site deletion failures in diagnostics and user messages.
- Revalidate the exact direct-child frame, browser document, and binding immediately before privileged injection or trusted input. Trusted-input coordinates from an earlier document must never be replayed after navigation or frame replacement.

### Script source and migration

- Normal schema-v3 built-ins store metadata, not a persisted built-in body. Stale packaged-body detection applies to stored records or imported data that still carry the legacy `userscript` field, regardless of their declared schema version.
- Legacy generated copies must not be identified by source length alone; use constrained provenance markers and known legacy fingerprints.
- Explicit custom intent always wins over semantic built-in detection. Preserve `sourceMode: "custom"`, any string `customUserscript`, and legacy `userscriptOverride: true`, including edits based on an older generated version.
- For custom standalone execution, load and inject the current stored source before resolving its `ChatClubDeleteSites` entry.
- ChatClub-generated standalone templates dispose their prior same-site entry even when an edited source retains the same `@version`. The central executor does not currently evict arbitrary custom registry entries; do not add broad global deletion. Any future central invalidation must be ownership-bound to the exact custom script and site.
- Prefer the direct standalone registry API. If an event fallback is required, bind it to the expected script and version; generic legacy listeners are compatibility paths, not the primary transport.

### Completion and trusted input

- A userscript result of `{ ok: true }` is not proof that deletion finished.
- Require both a successful execution path, including any required trusted finalization, and a successful post-run completion-state probe before showing success. A failed or unavailable probe is an uncertain failure, never success.
- The generic delete path requires a stable current-conversation identity before it mutates anything. Without one, fail closed unless a future site-specific authenticated completion proof is explicitly implemented.
- Treat the completion response as a versioned, fail-closed contract. Require at least two consecutive valid complete samples spanning the configured minimum stability window; reset the count and window after a malformed response, probe error, visible confirmation, or target reappearance.
- Confirm that every delete-confirmation dialog has closed and require the exact captured identity to be both no longer current and absent from conversation links throughout the successful samples.
- If a confirmation remains visible, treat the operation as unfinished. The orchestration-level trusted-input fallback is allowed only from an instruction owned by this attempt and bound to the same document, identity, route, and destructive phase; otherwise return an uncertain/manual failure. This rule does not by itself attest to every site's synthetic handling of a dialog that was already open when its runner began; audit that entry condition separately.
- Click only an explicit destructive action such as `Delete` or `删除`.
- Never select an unverified conversation row only by position, click a conversation link as a navigation-based deletion fallback, or navigate merely to make deletion appear successful. A trusted focus click inside an already verified current row is allowed when it cannot select a different conversation.
- Treat a MAIN-world attempt ID as correlation, not authentication. Before forwarding MAIN-proposed trusted hover, click, or key input, the isolated world must independently revalidate the current route, exact target row, document, and coordinates inside the verified current-row region. It must also canonicalize the action semantics: bound the point inventory and timing, allow only the exact expected key sequence, and reject modifiers or extra keys.
- Prefer a safe failure over activating an ambiguous link, title, row, or menu.
- The ChatClub Firefox build does not ship the Chromium `debugger` permission. When trusted hover, click, or key input is required there, report the unfinished state and let the user complete it manually.

## Volatile Delete Site Observations

These observations were documented in commit `be263e1` on 2026-07-03 and compared with the implementation during a 2026-07-16 review. That review date records neither live revalidation nor a guarantee that every current execution path is aligned with the safety rules below. Re-probe the site in DevTools and re-audit every affected native, MAIN-world, and standalone path before changing selectors or relying on them.

### Notion

- The Delete menu item can open the confirmation dialog while a synthetic click on the final Confirm button is ignored.
- Diagnose menu opening and final confirmation as separate phases.
- A still-visible confirmation dialog means deletion is incomplete.

### Kagi

- Prefer the native delete shortcut path.
- If it fails, do not fall back to sidebar thread links or title/link menus; those can navigate instead of delete.

### DeepSeek

- A non-destructive Arc 1.155.1 DevTools probe on 2026-07-16 found that a saved `/a/chat/s/{id}` route had exactly one identity-matching history link, but that link and its ancestors were `0×0` in the tested responsive/device layout while a visible `34×34` top-right header action remained. No menu, Delete action, or confirmation was activated. Treat those dimensions and controls as a volatile observation, not a permanent selector contract.
- Require a stable `/chat/s/{id}` or `/a/chat/s/{id}` route identity before attempting deletion. Selected/current styling may corroborate that identity but must never replace it.
- Treat a container as the sidebar only if it contains visible conversation links. Resolve a row only inside that verified sidebar and require its link identity to equal the current route; do not search unrelated matching links elsewhere in the document.
- When that exact row is usable, promote a text-width link to its same-line visual row and probe around the row's right edge.
- The row menu may require trusted pointer movement and activation before it appears.
- A single synthetic click can focus the `...` trigger without opening its menu. Use an activate-until-menu sequence and verify that an explicit `Delete`/`删除` item appeared after every attempt.
- In embedded layouts with no verified usable row, a header-menu fallback is allowed only while the same stable route identity remains current and opening that header action exposes an explicit `Delete`/`删除` item.

## Kagi Summary Extraction

Live structure was revalidated in Arc DevTools on 2026-07-16; the Arc version was not recorded. The observed message-level `Copy message` actions belonged to `article.message-user` and `article.message-ai`; reference-count and `Copy references to clipboard` controls were also present within the conversation UI. Re-probe before changing these selectors or role signals.

- Kagi can expose reference, source, or citation copy controls inside or before message actions.
- Accept only explicit message-copy actions such as `Copy message` and localized equivalents.
- Explicitly reject reference, source, and citation copy controls.
- Do not alternate roles across an unfiltered global Copy-control list.
- If parity is used as a role fallback, derive it from each filtered message action's stable position or turn identity, not from the number of successfully emitted or globally unique texts.
- A failed, empty, or repeated real turn must not shift the roles of later actions. De-duplicate by owning action/turn identity rather than global role-plus-text.
- Regression coverage must include reference controls, localized labels, an intermediate Copy failure, and repeated identical real turns.
- `tools/kagi-summary-extraction-test.cjs` is the acceptance test for owner-based roles, reference filtering, localized labels, failed-copy stability, repeated real turns, responsive clones, and single-role fail-closed behavior.
- These rules apply to Summary copy extraction. Message Navigator has a separate DOM-first adapter and must be reviewed independently.

## Grok Summary Extraction

The production action-bar implementation was updated on 2026-07-15, and its synthetic fixtures were expanded on 2026-07-16. A later live Grok DOM verification date is not recorded. The structures below are previously observed and fixture-backed expectations, not a fresh claim about the current third-party DOM; re-probe before changing or relying on the selectors.

- Use the message-level action bar as the primary turn and role signal. The previously observed and fixture-backed Grok structure is `Edit + Copy` for a user message and `Copy + Like` for an assistant message; the assistant bar may also contain Share, Dislike, Regenerate, and More actions.
- Never infer Grok roles by globally scanning Copy buttons and alternating `user -> assistant`. A code-block Copy inserted between the real message actions shifts every later role and can still produce a superficially valid but incorrect conversation.
- Resolve each Copy control to its smallest owning message action bar. The current adapter and fixtures target a previously observed `div.action-buttons` container; classify one canonical Copy per bar and derive the role from the companion action in that same bar.
- Do not require Copy and its companion action to be adjacent or within a small horizontal distance. The previously observed and fixture-backed `justify-between` layout can place the assistant Copy and Like controls far apart while they still belong to the same action bar.
- Action controls can be `button`, `[role=button]`, nested wrappers, or icon-only controls. Build signatures from accessible text, `aria-*`, `title`, tooltip/test IDs, classes/data-icon values, and SVG metadata. Treat Like/thumbs-up/upvote as the positive assistant signal only after explicitly excluding Dislike/thumbs-down/downvote/点踩.
- Historical message actions can have `opacity: 0` until the message is hovered. A control with a non-zero layout box and usable `display`/`visibility` must remain eligible even when transparent; reveal and hover its turn/action bar before attempting Copy.
- A Grok code-block Copy can live in a header toolbar that is a sibling of `<pre>/<code>`, so `button.closest("pre,code")` is not a sufficient exclusion. Reject explicit Copy-code/table/link/source controls, and reject generic Copy controls that do not belong to either the `Edit + Copy` or `Copy + Like` message-action signature.
- Code-card toolbars commonly contain Collapse/Wrap/Copy controls. They are nested content actions, not message turns, and must never change role state or be clicked by the conversation extractor.
- Preserve pure-code assistant answers: the message-level `Copy + Like` action remains authoritative even when its clipboard text is identical to the nested code block. Distinguish it structurally rather than rejecting it by text equality.
- De-duplicate by owning action bar, stable turn identity, or DOM root, not by global message text. Two distinct turns may legitimately contain identical text; nested controls or responsive clones of the same bar should still run only once.
- Do not use `Thought for ...`, `Worked for ...`, `思考了...`, or `工作了...` to identify or count Summary turns. These are optional reasoning-state controls, can be absent from normal answers, and can be repeated through nested wrappers.
- The current Summary userscript recognizes safe action-bar signatures; it does not currently have an explicit role-metadata fallback. If a future metadata path is added, it must establish both roles and receive equivalent regression coverage.
- If neither a safe action-bar signature nor a separately verified explicit role path establishes both user and assistant turns, return no structured Summary conversation. Do not fall back to reasoning markers, parity guessing, or broad Copy-button collection.
- Regression coverage must include prose plus code, multiple code cards, pure-code answers, hidden historical actions, widely separated `justify-between` controls, Chinese and English labels, Dislike exclusion, repeated identical real turns, nested control wrappers, icon-only controls, and safe failure for an unaccompanied Copy or a single-role result.

These rules apply to the Grok Summary userscripts. Message Navigator has a separate DOM-targeting adapter and must not be assumed to satisfy these Summary invariants.

## Grok iframe Session Cookies

The Chromium Cookie bridge is a narrowly scoped authentication compatibility path. Its implementation and synthetic regression tests were added on 2026-07-15; that does not constitute a fresh live-site authentication verification.

- A working top-level `https://grok.com/` tab does not prove that embedded Grok has the same session. A Grok iframe inside a `chrome-extension://` page can use the extension origin as its Cookie partition key.
- Storage Access and Cookie partitioning are separate. `document.hasStorageAccess() === true` does not copy the top-level Cookie jar into the extension partition, and `document.cookie` cannot migrate HttpOnly session Cookies.
- Mirror only `sso`, `sso-rw`, and `grok_device_id` from the unpartitioned Grok jar.
- Never modify or delete the unpartitioned source Cookies.
- Force mirrored copies to `Secure` and `SameSite=None`, while preserving host/domain, path, HttpOnly, session/expiry, and cookie-store semantics.
- Never log, durably persist, or return Cookie values. Persist ownership metadata only.
- Attempt the bounded Chromium Cookie preflight before assigning the URL when the real Grok iframe is initially created or replaced. It is not a preflight for every later same-frame navigation. If it times out, mark the fallback and allow the frame to load.
- After the real frame exists, validate its partition with `chrome.cookies.getPartitionKey({ tabId, frameId, documentId })` when available.
- Repair only managed mirrors in the validated partition and perform only the guarded reload required by a changed or fallback sync.
- Do not overwrite a non-matching unowned partitioned Cookie.
- An unowned target that exactly matches the bridge's canonical mirrored projection of the source Cookie may be adopted into the metadata ledger; after adoption it may follow later source rotation.
- Remove managed mirrors when the corresponding unpartitioned source disappears.
- Ignore bridge-owned `cookies.onChanged` events.
- When an external change removes a managed partitioned `sso` or `sso-rw` Cookie with cause `explicit` or `expired_overwrite`, release ownership and record a tombstone so the bridge does not immediately recreate that authentication Cookie. Do not describe every partitioned Cookie removal as a verified iframe logout; `grok_device_id` removal is not tombstoned.
- Do not apply the Chromium mirror path to `moz-extension://` pages. Retain the Storage Access path as the cross-browser fallback.
- Keep extension-origin DNR request-header rewriting limited to document navigation resource types. Do not broaden it to WebSocket, XHR/fetch, scripts, images, or other subresources.

The observed failure signature was an empty embedded Grok conversation, no history, and repeated `wss://grok.com/ws/mgw/` failures while top-level Grok still worked. Treat it as a diagnostic clue, not proof by itself.

Manual live acceptance requires a clean managed-mirror state, an extension reload, rendered Grok history, and `/ws/mgw` completing with HTTP `101 Switching Protocols`. A rendered page shell alone is not proof.

## Final Verification

Before committing:

- `npm run verify:generated`
- `npm run check`
- `npm test`
- `npm run verify:pack`

Prefer the repository checks over ad hoc syntax commands; they validate module context, generated ownership, static browser-target constraints, version state, and source/output freshness. These commands do not launch a browser.

For cross-browser, frame-injection, Cookie, manifest, or packaging changes, also run the relevant browser smoke tests. Record manual branded-browser verification in the PR description, commit notes, or delivery report with the browser/version and behavior checked.
