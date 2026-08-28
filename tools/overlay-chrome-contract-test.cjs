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
assert.match(css, /\.summary-panel \{[^}]*max-width:\s*calc\(100vw - var\(--overlay-gutter-panel\)\);/s);
assert.match(css, /\.popover-menu \{[^}]*max-width:\s*min\(260px, calc\(100vw - var\(--overlay-gutter-tight\)\)\);/s);
assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.toast,\s*\n\s*\.toast\.show,/);

assert.match(css, /\.overlay-window-button,\s*\n\.settings-window-button,/);
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
assert.match(dom, /class: `modal overlay-surface \$\{wide \? "modal-wide" : ""\}`/);
assert.match(dom, /role: modalType === "confirmation" \? "alertdialog" : "dialog"/);
assert.match(dom, /"aria-modal": "true"/);
assert.match(dom, /"aria-labelledby": titleId/);
assert.match(dom, /bindModalDescription\(panel, body, modalType\)/);
assert.match(dom, /hoistModalFooter\(panel, body\)/);
assert.match(dom, /role: isError \? "alert" : "status"/);
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
