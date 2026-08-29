#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const css = read("styles/chatclub.css");
const agents = read("AGENTS.md");
const dom = read("ui/dom.js");

const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf(":root[data-theme=\"dark\"]"));
assert.ok(rootBlock.includes(":root {"), "overlay tokens must live on :root");

const tokens = {
  "--overlay-z-frame-loading": "2",
  "--overlay-z-frame-status": "3",
  "--overlay-z-frame-toast": "4",
  "--overlay-z-panel": "70",
  "--overlay-z-panel-raised": "71",
  "--overlay-z-modal": "80",
  "--overlay-z-modal-nested": "81",
  "--overlay-z-popover-backdrop": "99",
  "--overlay-z-popover": "100",
  "--overlay-z-toast": "120",
  "--overlay-z-tooltip": "2147483000",
  "--overlay-radius": "var(--ui-radius)",
  "--overlay-close-size": "30px",
  "--overlay-motion": "160ms ease",
  "--overlay-gutter-panel": "32px",
  "--overlay-gutter-tight": "16px",
  "--overlay-header-height": "46px",
  "--overlay-panel-offset": "52px",
  "--overlay-panel-offset-raised": "64px",
  "--overlay-width": "min(720px, calc(100vw - var(--overlay-gutter)))",
  "--overlay-width-compact": "min(560px, calc(100vw - var(--overlay-gutter)))",
  "--overlay-width-wide": "min(1120px, calc(100vw - var(--overlay-gutter)))",
  "--overlay-width-task": "min(1040px, calc(100vw - var(--overlay-gutter)))",
  "--overlay-width-workspace": "min(1180px, calc(100vw - var(--overlay-gutter)))"
};

for (const [name, value] of Object.entries(tokens)) {
  assert.match(
    rootBlock,
    new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")};`),
    `overlay contract token ${name} must stay ${value}`
  );
}

assert.match(rootBlock, /--overlay-border-color:/);
assert.match(rootBlock, /--overlay-border:/);
assert.match(rootBlock, /--overlay-shadow:\s*var\(--shadow\);/);
assert.match(rootBlock, /--overlay-gutter:\s*40px;/);
assert.match(rootBlock, /--overlay-backdrop:/);
assert.match(rootBlock, /--summary-panel-border:\s*var\(--overlay-border-color\);/);

assert.match(agents, /## Overlay Chrome Contract/);
assert.match(agents, /## Overlay Dismissal Policy/);
assert.match(agents, /Do not migrate to native `<dialog>`/);
assert.match(agents, /openConfirmationAction/);
assert.match(agents, /window\.confirm/);
assert.match(dom, /export function openConfirmationAction/);
assert.match(agents, /overlay-surface/);
assert.match(agents, /overlay-surface-fullscreen/);
assert.match(agents, /ui\/viewer-window\.js/);
assert.match(agents, /Settings fullscreen is an editor special case/);

const families = [
  [".modal-backdrop", "--overlay-z-modal"],
  [".summary-panel", "--overlay-z-panel"],
  [".share-panel", "--overlay-z-panel-raised"],
  [".popover-backdrop", "--overlay-z-popover-backdrop"],
  [".popover-menu", "--overlay-z-popover"],
  [".toast-host", "--overlay-z-toast"],
  [".global-tooltip", "--overlay-z-tooltip"],
  [".preferred-model-selection-overlay", "--overlay-z-frame-status"],
  [".chat-frame-wrap::after", "--overlay-z-frame-loading"],
  [".frame-submit-toast", "--overlay-z-frame-toast"]
];

for (const [selector, token] of families) {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `${selector} must exist`);
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end + 2);
  assert.match(block, new RegExp(`z-index:\\s*var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\);`), `${selector} must consume ${token}`);
}

for (const selector of [".summary-panel", ".share-panel", ".popover-menu", ".toast", ".overlay-surface"]) {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `${selector} chrome must exist`);
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end + 2);
  assert.match(block, /border-radius:\s*var\(--overlay-radius\);/, `${selector} must share overlay radius`);
}

const modalStart = css.indexOf("\n.modal {");
assert.ok(modalStart >= 0, ".modal chrome must exist");
const modalBlock = css.slice(modalStart, css.indexOf("\n}", modalStart) + 2);
assert.match(modalBlock, /max-height:\s*calc\(100vh - var\(--overlay-gutter\)\);/);
assert.doesNotMatch(modalBlock, /border-radius:/, ".modal must inherit radius from overlay-surface");
assert.doesNotMatch(modalBlock, /background:/, ".modal must inherit surface fill from overlay-surface");

const fullscreenStart = css.indexOf("\n.overlay-surface-fullscreen {");
assert.ok(fullscreenStart >= 0, "shared fill-viewport class must exist");
const fullscreenBlock = css.slice(fullscreenStart, css.indexOf("\n}", fullscreenStart) + 2);
assert.match(fullscreenBlock, /inset:\s*0;/);
assert.match(fullscreenBlock, /border-radius:\s*0;/);
assert.match(fullscreenBlock, /box-shadow:\s*none;/);
assert.doesNotMatch(css, /\.settings-modal-fullscreen/);
assert.match(css, /\.modal-backdrop\s*~\s*\.modal-backdrop\s*\{[^}]*z-index:\s*var\(--overlay-z-modal-nested\);[^}]*background:\s*transparent;/s);
assert.match(css, /\.summary-panel \{[^}]*top:\s*var\(--overlay-panel-offset\);/s);
assert.match(css, /\.share-panel \{[^}]*top:\s*var\(--overlay-panel-offset-raised\);/s);
assert.match(css, /\.settings-modal \.modal-header \{[^}]*min-height:\s*var\(--overlay-header-height\);/s);
assert.match(css, /\.modal-footer \{/);
assert.match(css, /\.modal > \.modal-footer \{/);
assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\.toast,/);
assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\.prompt-image-remove,/);
assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\.frame-toast-position-sample/);
assert.match(css, /\.overlay-panel-resize-handle,/);
assert.match(css, /\.overlay-panel-resize-handle-left,[\s\S]*?width:\s*12px;/);
assert.doesNotMatch(css, /\.share-panel-resize-handle-left,[\s\S]*?width:\s*8px;/);
assert.match(css, /\.prompt-library-modal \{[^}]*width:\s*var\(--overlay-width-wide\);/s);
assert.match(css, /\.prompt-library-modal \{[^}]*top:\s*var\(--prompt-library-top, var\(--overlay-panel-offset\)\);/s);
assert.match(css, /\.modal\.modal-alertdialog \.modal-header h2 \{[^}]*color:\s*var\(--danger\);/s);
assert.match(css, /\.modal\.modal-alertdialog\[data-overlay-tone="warning"\] \.modal-header h2 \{[^}]*color:\s*var\(--warning\);/s);
assert.match(css, /\.modal\.modal-alertdialog\[data-overlay-tone="neutral"\] \.modal-header h2 \{[^}]*color:\s*var\(--text\);/s);
assert.match(css, /\.modal\.modal-alertdialog \{[^}]*width:\s*var\(--overlay-width-compact\);/s);
assert.match(css, /\.overlay-confirmation \{[^}]*display:\s*grid;/s);
assert.match(css, /\.overlay-warning-card,\s*\n\.io-sensitive-warning \{/);
assert.match(css, /\.overlay-confirm-ack \{/);
assert.match(agents, /data-overlay-tone/);
assert.match(agents, /overlay-warning-card/);
assert.match(dom, /function confirmationTone/);
assert.match(dom, /CONFIRMATION_TONES/);
assert.match(dom, /tone = "danger"/);
assert.match(
  css,
  /\.modal\.modal-alertdialog \.modal-footer \.button-danger \{[^}]*background:\s*var\(--danger\);[^}]*color:\s*var\(--on-primary\);/s
);
assert.match(agents, /Confirmation surfaces consume `--overlay-width-compact`/);
assert.match(agents, /`--on-primary` label/);
assert.match(css, /\.summary-panel \{[^}]*max-width:\s*calc\(100vw - var\(--overlay-gutter-panel\)\);/s);
assert.match(css, /\.popover-menu \{[^}]*max-width:\s*min\(260px, calc\(100vw - var\(--overlay-gutter-tight\)\)\);/s);
assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.toast,\s*\n\s*\.toast\.show,/);

assert.match(css, /\.overlay-window-button \{/);
assert.doesNotMatch(css, /\.overlay-window-button,\s*\n\.settings-window-button,/);
assert.match(css, /width:\s*var\(--overlay-close-size\);/);
assert.doesNotMatch(
  css.slice(css.indexOf(".summary-panel {"), css.indexOf(".summary-panel.maximized")),
  /border-radius:\s*14px/
);
assert.doesNotMatch(
  css.slice(css.indexOf(".share-panel {"), css.indexOf(".share-panel.maximized")),
  /border-radius:\s*14px/
);

assert.match(css, /\.modal-backdrop\s*\{[^}]*animation:\s*overlay-fade-in var\(--overlay-motion\);/s);
assert.match(css, /\.popover-menu\s*\{[^}]*animation:\s*overlay-fade-in var\(--overlay-motion\);/s);
assert.doesNotMatch(
  css.slice(css.indexOf(".summary-panel {"), css.indexOf(".summary-panel.maximized")),
  /overlay-fade-in/,
  "persistent Summary redraws must not replay enter motion"
);
assert.doesNotMatch(
  css.slice(css.indexOf(".share-panel {"), css.indexOf(".share-panel.maximized")),
  /overlay-fade-in/,
  "persistent Share redraws must not replay enter motion"
);

assert.match(
  dom,
  /const MODAL_TYPE_CONFIG = Object\.freeze\(\{\s*viewer: Object\.freeze\(\{ dismissOnBackdrop: true \}\),\s*editor: Object\.freeze\(\{ dismissOnBackdrop: false \}\),\s*task: Object\.freeze\(\{ dismissOnBackdrop: false \}\),\s*confirmation: Object\.freeze\(\{ dismissOnBackdrop: false \}\)\s*\}\);/s
);
assert.match(dom, /class: `modal overlay-surface \$\{wide \? "modal-wide" : ""\} \$\{modalType === "confirmation" \? "modal-alertdialog" : ""\}`/);
assert.match(dom, /role: modalType === "confirmation" \? "alertdialog" : "dialog"/);
assert.match(dom, /"aria-modal": "true"/);
assert.match(dom, /"aria-labelledby": titleId/);
assert.match(dom, /bindModalDescription\(panel, body, modalType\)/);
assert.match(dom, /hoistModalFooter\(panel, body\)/);
assert.match(dom, /syncModalBackgroundInert/);
assert.match(dom, /setNodeInert/);
assert.match(dom, /toast-live-polite/);
assert.match(dom, /toast-live-assertive/);
assert.match(dom, /announceToast/);
assert.match(dom, /export function ensureToastHost\(\)/);
assert.match(dom, /iconButton\(closeLabel, "×", onClose, "overlay-window-button"/);
assert.doesNotMatch(dom, /HTMLDialogElement|showModal\(|<dialog/);

const appSources = [
  "app/settings/controller.js",
  "app/pocket/controller.js",
  "app/history/controller.js",
  "app/summary/controller.js",
  "app/share/controller.js",
  "app/workspace/view-controller.js",
  "app/workspace/tabs-sidebar-controller.js",
  "app/workspace/tabs-sidebar-item.js",
  "app/composer/controller.js"
].map((file) => [file, read(file)]);

for (const [file, source] of appSources) {
  assert.doesNotMatch(source, /HTMLDialogElement|showModal\(|<dialog/, `${file} must not migrate to native dialog`);
}

assert.match(read("app/history/controller.js"), /viewerModal\(/);
assert.doesNotMatch(read("app/history/controller.js"), /\bmodal\s*\(/);
assert.match(read("app/summary/controller.js"), /summary-panel overlay-surface/);
assert.match(read("app/share/controller.js"), /share-panel overlay-surface/);
assert.match(read("app/summary/controller.js"), /summary-window-button overlay-window-button/);
assert.match(read("app/share/controller.js"), /share-window-button overlay-window-button/);
assert.match(read("app/settings/controller.js"), /settings-window-button overlay-window-button/);
assert.match(read("app/pocket/controller.js"), /pocket-window-button overlay-window-button/);
assert.match(read("app/pocket/controller.js"), /createViewerWindowChrome/);
assert.match(read("app/history/controller.js"), /createViewerWindowChrome/);
assert.match(read("app/history/controller.js"), /from "\.\.\/\.\.\/ui\/viewer-window\.js"/);
assert.doesNotMatch(read("app/settings/controller.js"), /viewer-window/);
assert.match(read("app/settings/controller.js"), /classList\.toggle\("overlay-surface-fullscreen"\)/);
assert.doesNotMatch(read("app/settings/controller.js"), /localStorage\.setItem\("chatclub\./);
assert.match(read("ui/viewer-window.js"), /const OVERLAY_SURFACE_FULLSCREEN_CLASS = "overlay-surface-fullscreen"/);
assert.match(read("ui/viewer-window.js"), /const VIEWER_WINDOW_FULLSCREEN_TOOLTIP_ID = "viewer\.fullscreen"/);
assert.match(read("ui/viewer-window.js"), /options\.widthVar \|\| "--overlay-viewer-width"/);
assert.match(read("ui/viewer-window.js"), /overlay-viewer-resize-handle/);
assert.doesNotMatch(read("ui/viewer-window.js"), /pocket-panel-resize-handle/);
assert.match(read("app/summary/controller.js"), /overlay-panel-resize-handle overlay-panel-resize-handle-left/);
assert.match(read("app/share/controller.js"), /overlay-panel-resize-handle overlay-panel-resize-handle-left/);
assert.match(agents, /History detail content may reuse Pocket/);
assert.match(agents, /Prompt Library is a composer-anchored/);
assert.match(agents, /Linear action menus may use `role="menu"`/);
assert.match(agents, /bindLinearMenuKeyboard/);
assert.match(agents, /toastStay/);
assert.match(agents, /Do not resurrect `\.pocket-panel-resize-handle`/);
assert.match(read("chatClub.html"), /class="toast-host"/);
assert.match(read("chatClub.html"), /toast-live-polite/);
assert.match(read("chatClub.html"), /toast-live-assertive/);
assert.match(read("options.html"), /class="toast-host"/);
assert.match(read("options.html"), /toast-live-polite/);
assert.match(read("options.html"), /toast-live-assertive/);
assert.doesNotMatch(read("chatClub.html"), /class="toast-host" aria-live/);
assert.doesNotMatch(read("options.html"), /class="toast-host" aria-live/);
assert.match(dom, /item\.addEventListener\("mouseenter"/);
assert.match(dom, /export function bindLinearMenuKeyboard/);
assert.match(dom, /export function setToastStay/);
assert.match(dom, /export function toastDurationMs/);
assert.match(dom, /createSvgIcon\("alert"\)/);
assert.match(css, /\.frame-submit-toast\.show \{[^}]*pointer-events:\s*auto;/s);
assert.doesNotMatch(css, /\.pocket-panel-resize-handle/);
assert.match(read("ui/components.js"), /role: "menuitem"/);
assert.match(read("app/topbar/view.js"), /popover-menu overlay-surface topbar-settings-popover/);
assert.match(read("app/topbar/view.js"), /aria-haspopup", "menu"/);
assert.match(read("app/composer/controller.js"), /bindLinearMenuKeyboard\(menu,/);
assert.match(read("app/workspace/view-controller.js"), /bindLinearMenuKeyboard\(menu,/);
assert.match(read("app/workspace/tabs-sidebar-controller.js"), /bindLinearMenuKeyboard\(menu,/);
assert.match(read("app/workspace/tabs-sidebar-item.js"), /bindLinearMenuKeyboard\(menu,/);
assert.match(read("app/topbar/controller.js"), /bindLinearMenuKeyboard\(rendered\.menu,/);
assert.match(read("app/composer/controller.js"), /"aria-haspopup": "menu"/);
assert.match(read("app/composer/controller.js"), /"aria-label": t\("topbar\.promptActions"\)/);
assert.match(read("app/topbar/view.js"), /"aria-label": t\("topbar\.settingsJumpMenu"\)/);
assert.match(read("app/workspace/view-controller.js"), /layout-preset-choice/);
assert.match(read("app/workspace/view-controller.js"), /role: "none"/);
assert.match(dom, /event\.key === "Tab"/);
assert.match(css, /\.overlay-window-button:focus-visible/);
assert.match(css, /\.popover-menu \.button:focus-visible/);
assert.match(css, /\.global-tooltip-label \{[^}]*border-radius:\s*var\(--overlay-radius\);/s);
assert.match(css, /\.toast-live \{/);
assert.match(agents, /inert/);
assert.match(agents, /toast-live-polite/);
assert.match(agents, /menuitem` must not wrap/);
assert.doesNotMatch(read("app/workspace/view-controller.js"), /app-picker-popover",\s*\n\s*role: "menu"/);
assert.doesNotMatch(read("ui/viewer-window.js"), /HTMLDialogElement|showModal\(|<dialog/);
assert.match(read("app/pocket/controller.js"), /widthVar: "--pocket-panel-width"/);
assert.doesNotMatch(read("app/history/controller.js"), /pocket-window-button/);
assert.match(css, /\.prompt-history-modal-focus \[data-tooltip-id="viewer\.fullscreen"\]/);
assert.match(css, /\.pocket-history-modal-focus \[data-tooltip-id="viewer\.fullscreen"\]/);
assert.doesNotMatch(css, /\[data-tooltip-id="pocket\.fullscreen"\]/);
assert.match(read("ui/frame-toast.js"), /role: kind === "error" \? "alert" : "status"/);
assert.match(read("ui/tooltip.js"), /"pocket\.fullscreen": "viewer\.fullscreen"/);
assert.match(read("ui/tooltip.js"), /aria-describedby/);
assert.match(read("app/workspace/view-controller.js"), /popover-menu overlay-surface/);

console.log("overlay chrome contract: ok");
