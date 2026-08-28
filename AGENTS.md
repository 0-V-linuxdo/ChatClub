# Agent Notes

## Branch Policy

- This repository must keep exactly one Git branch locally and on `origin`: `main`.
- Work directly on `main`. Do not create, check out, publish, or leave behind any other branch, including `codex/*`, feature, release, temporary, or worktree branches.
- Before changing files, switch to `main`, fetch `origin`, and update only with a fast-forward. If local and remote `main` have diverged, stop and ask the user instead of creating a reconciliation branch or force-pushing.
- Push only `main` and never force-push it. A workflow that requires a pull-request branch needs an explicit user override of this policy.
- GitHub SSH must use port 443 via `ssh.github.com`. Port 22 to `github.com` is blocked here; do not retry it or fall back to an interactive HTTPS username prompt.
- If a non-`main` branch is created accidentally, integrate any intended work safely into `main`, then delete that branch locally and on `origin` before finishing.
- At handoff, verify that the working tree is clean, `main` matches `origin/main`, and both local and remote branch inventories contain no branch other than `main`.

## Browser Verification

### Manual target browsers

- Arc

Unless the user explicitly requests another branded browser, perform manual browser verification only in Arc.

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

Unpacked-extension reload vs Remove, recorded 2026-08-28 while verifying Prompt History in Arc:

- Prefer the extensions-page Reload (and, if needed, disable/enable) so `chrome.storage` survives. Prompt History, Record Full Text / `workspaceTabFullText`, Pocket, and other local extension settings live under Arc `Local Extension Settings/kplgajidbllaeekcfpcdcbocbhppbind`.
- The details-page Reload control can leave Chromium serving the previous unpacked `manifest.json` `version` / `version_name`. That is not proof the on-disk files were not written.
- Do not Remove the unpacked extension and Load unpacked again just to force a manifest reread when those records must be kept. Remove wipes that `Local Extension Settings` directory even if Load unpacked restores the same id `kplgajidbllaeekcfpcdcbocbhppbind`. Old Prompt History and full-text captures will not come back.
- Load unpacked must select the ChatClub repository root, the folder that contains `manifest.json`. Selecting a parent such as `Cursor Workspace`, or another unpacked dist, fails with `Could not load manifest` / `Failed to load extension`.

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

## Overlay Chrome Contract

The popup problem is not “not modern enough.” The same forest-green 8px system grew private frames, radii, close buttons, widths, and z-indexes across six overlay families. Keep one chrome contract; do not grow another at a call site.

Families: typed modals (`editorModal` / `viewerModal` / `taskModal` / `confirmationModal`), persistent panels (Summary / Share), popovers, toasts (page + in-frame), frame overlays, global tooltip.

Page stack, low → high, via CSS tokens in `styles/chatclub.css`:

- persistent panels: `--overlay-z-panel` (Summary), `--overlay-z-panel-raised` (Share)
- typed modals: `--overlay-z-modal`
- popovers: `--overlay-z-popover-backdrop`, `--overlay-z-popover`
- toasts: `--overlay-z-toast`
- global tooltip: `--overlay-z-tooltip`

Frame-local stack inside `.chat-frame-wrap`: `--overlay-z-frame-loading`, `--overlay-z-frame-status`, `--overlay-z-frame-toast`. Do not lift frame overlays onto the page stack.

Chrome tokens: `--overlay-radius` (= `--ui-radius`), `--overlay-border` / `--overlay-border-color`, `--overlay-shadow`, `--overlay-close-size`, `--overlay-width` / `--overlay-width-compact` / `--overlay-width-wide` / `--overlay-width-task` / `--overlay-width-workspace`. Surfaces use `.overlay-surface`. Window close/maximize controls use `.overlay-window-button`.

Motion: `--overlay-motion` opacity fade on transient overlays (modal backdrop, popover). Do not animate `transform` on positioned panels, and do not replay enter motion on persistent-panel redraws.

Do not migrate to native `<dialog>` without an overlay-policy audit. Overlay Dismissal Policy above is closed: do not add one-off close flags. History may share Pocket focus/fullscreen/resize/restore window chrome; that shared viewer-window chrome is allowed and is not drift. Do not grow a third window-chrome dialect at either call site.

## New Chat Workspace Preserve

New Chat must not overwrite the current conversation workspace in place. The 2026-08-29 failure was that the live page kept the old workspace id while the conversation href was replaced, so clicking the original Tabs row was a no-op.

- Call `preserveCurrentWorkspaceForNewChat` before `startNewChatInFrame`. Preserve only when the leaving hrefs are conversations and the captured snapshot still has a conversation. Home/root URLs skip preserve.
- Persist the snapshot under the current workspace id, then `flush()`. Adopt a new workspace session id onto the live page only after that flush succeeds. Clear `topicTitle` / `topicTitleCustom` on the rebound page. If flush or adopt fails, leave the old id in place.
- Background persist of the rebound workspace must detach the previous workspace as a remembered Tabs row, not as crash recovery. `tab.url` still showing the old `#workspace=` hash after `replaceState` must not block that detach.
- `listLiveWorkspaceTabs` must still list the frozen conversation so the original sidebar row can reopen it. Do not put the frozen row on the recovery path, and do not copy Pocket window chrome onto it.

Acceptance: `tools/workspace-new-chat-preserve-test.cjs`.
