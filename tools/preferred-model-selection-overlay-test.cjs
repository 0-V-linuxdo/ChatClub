#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { functionSource } = require("./function-source.cjs");

const viewController = read("app/workspace/view-controller.js");
const overlayView = read("app/workspace/preferred-model-selection-overlay.js");
const preferredModelController = read("app/preferred-model/controller.js");
const overlayController = read("app/preferred-model/selection-overlay-controller.js");
const frameToast = read("ui/frame-toast.js");
const restartAttention = functionSource(overlayView, "restartPreferredModelSelectionOverlayAttention");
const suppressInteraction = functionSource(overlayView, "suppressPreferredModelSelectionOverlayInteraction");
const handlePointerDown = functionSource(overlayView, "handlePreferredModelSelectionOverlayPointerDown");
const renderOverlay = functionSource(overlayView, "renderPreferredModelSelectionOverlay");
const renderChatGroup = functionSource(viewController, "renderChatGroup");

assert.match(viewController, /import \{ renderPreferredModelSelectionOverlay \} from "\.\/preferred-model-selection-overlay\.js";/);

assert.match(renderOverlay, /class: "preferred-model-selection-overlay"/);
assert.match(renderOverlay, /role: "note"/);
assert.match(renderOverlay, /tabindex: "-1"/);
assert.match(renderOverlay, /hidden: true/);
assert.match(renderOverlay, /class: "preferred-model-selection-overlay-indicator"/);
assert.match(renderOverlay, /class: "preferred-model-selection-overlay-spinner"/);
assert.match(renderOverlay, /"aria-hidden": "true"/);
assert.match(renderOverlay, /class: "preferred-model-selection-overlay-text"/);
assert.match(renderOverlay, /onpointerdown:/);
assert.match(renderOverlay, /onclick: suppressPreferredModelSelectionOverlayInteraction/);
assert.match(renderOverlay, /oncontextmenu: suppressPreferredModelSelectionOverlayInteraction/);
assert.match(renderOverlay, /onwheel: suppressPreferredModelSelectionOverlayInteraction/);
assert.match(renderChatGroup, /renderFrameLoadingStatus\([^)]*\),\s*renderPreferredModelSelectionOverlay\(\)/);
assert.match(
  preferredModelController,
  /const visibleFrames = preferredModelSelectionOverlayController\.sync\(\);[\s\S]*?statusToast\?\.setSuppressed\?\.\(visibleFrames\.has\(iframe\)\)/,
  "only preferred-model records covered by a visible overlay may suppress their Toast"
);
assert.match(
  preferredModelController,
  /const payload = preferredModelPayloadForApp\(activeWorkspace\(\)\.frameApp\(iframe\) \|\| \{\}\);[\s\S]*?preferredModelRememberedFallback\(payload\)[\s\S]*?preferredModelAttemptPayload\(payload, payload\.secondaryModelId\)/,
  "a remembered secondary model must own the first overlay frame before a new apply record exists"
);
assert.match(frameToast, /function setSuppressed\(nextSuppressed\)/);
assert.match(frameToast, /item\.classList\.toggle\("frame-submit-toast-suppressed", suppressed\)/);
assert.match(frameToast, /item\.setAttribute\("aria-hidden", "true"\)/);
assert.match(overlayController, /!toast\.classList\?\.contains\?\.\("frame-submit-toast-suppressed"\)/);

const operations = [];
const indicator = {
  classList: {
    remove(value) { operations.push(["remove", value]); },
    add(value) { operations.push(["add", value]); }
  },
  get offsetWidth() {
    operations.push(["reflow"]);
    return 120;
  }
};
const context = vm.createContext({});
vm.runInContext(`
  ${restartAttention}
  ${suppressInteraction}
  ${handlePointerDown}
  globalThis.handle = handlePreferredModelSelectionOverlayPointerDown;
  globalThis.suppress = suppressPreferredModelSelectionOverlayInteraction;
`, context);

function pointerEvent({ button = 0, pointerType = "mouse" } = {}) {
  return {
    button,
    pointerType,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; }
  };
}

const primaryPointer = pointerEvent();
context.handle(primaryPointer, indicator);
assert.equal(primaryPointer.defaultPrevented, true);
assert.equal(primaryPointer.propagationStopped, true);
assert.deepEqual(operations, [
  ["remove", "preferred-model-selection-overlay-attention"],
  ["reflow"],
  ["add", "preferred-model-selection-overlay-attention"]
]);

context.handle(primaryPointer, indicator);
assert.equal(operations.length, 6, "every primary press must restart the attention animation");

const secondaryPointer = pointerEvent({ button: 2 });
context.handle(secondaryPointer, indicator);
assert.equal(secondaryPointer.defaultPrevented, false);
assert.equal(secondaryPointer.propagationStopped, false);
assert.equal(operations.length, 6, "secondary mouse presses must not trigger attention");

const touchPointer = pointerEvent({ button: -1, pointerType: "touch" });
context.handle(touchPointer, indicator);
assert.equal(touchPointer.defaultPrevented, true);
assert.equal(touchPointer.propagationStopped, true);
assert.equal(operations.length, 9, "touch presses must restart the attention animation regardless of button reporting");

const trailingClick = pointerEvent();
context.suppress(trailingClick);
assert.equal(trailingClick.defaultPrevented, true);
assert.equal(trailingClick.propagationStopped, true);
assert.equal(operations.length, 9, "the trailing click must not replay the attention animation");

const css = read("styles/chatclub.css");
assert.match(css, /\.appearance-toggle-control\s*\{[^}]*display: flex;[^}]*cursor: pointer;/s);
assert.match(css, /\.appearance-toggle-copy\s*\{[^}]*display: grid;/s);
assert.match(css, /\.appearance-toggle-control input\s*\{[^}]*accent-color: var\(--primary\);/s);
const overlayCssStart = css.indexOf(".preferred-model-selection-overlay {");
const overlayCssEnd = css.indexOf(".chat-frame {", overlayCssStart);
assert.ok(overlayCssStart >= 0 && overlayCssEnd > overlayCssStart, "overlay styles must be present beside frame styles");
const overlayCss = css.slice(overlayCssStart, overlayCssEnd);

assert.match(overlayCss, /position: absolute;/);
assert.match(overlayCss, /inset: 0;/);
assert.match(overlayCss, /z-index: var\(--overlay-z-frame-status\);/);
assert.match(overlayCss, /grid-template-columns: minmax\(0, 1fr\);/);
assert.match(overlayCss, /pointer-events: auto;/);
assert.match(overlayCss, /touch-action: none;/);
assert.match(overlayCss, /overscroll-behavior: contain;/);
assert.match(overlayCss, /\.preferred-model-selection-overlay\[hidden\]\s*\{\s*display: none;/);
assert.match(
  overlayCss,
  /\.preferred-model-selection-overlay::before\s*\{[\s\S]*?opacity: var\(--preferred-model-selection-overlay-opacity, 0\.7\);/,
  "only the backdrop pseudo-element should consume the configured opacity"
);
const indicatorCss = overlayCss.slice(
  overlayCss.indexOf(".preferred-model-selection-overlay-indicator {"),
  overlayCss.indexOf(".preferred-model-selection-overlay-spinner {")
);
assert.doesNotMatch(indicatorCss, /preferred-model-selection-overlay-opacity/);
assert.match(indicatorCss, /translate: var\(--preferred-model-selection-overlay-offset-x/);
assert.match(indicatorCss, /max-width: min\(100%, 520px\);/);
assert.match(indicatorCss, /border-radius: var\(--overlay-radius\);/);
assert.match(overlayCss, /\.preferred-model-selection-overlay-text\s*\{[^}]*display: flex;[^}]*flex-direction: column;/s);
assert.match(overlayCss, /\.preferred-model-selection-overlay-line\s*\{[^}]*display: block;/s);
assert.match(overlayCss, /\.preferred-model-selection-overlay-line-primary\s*\{[^}]*-webkit-line-clamp: 2;/s);
assert.match(
  overlayCss,
  /\.preferred-model-selection-overlay-line-status\s*\{[^}]*color: var\(--muted\);[^}]*font-size: var\(--font-size-sm\);[^}]*font-weight: var\(--font-weight-normal\);/s
);
assert.match(overlayCss, /\.preferred-model-selection-overlay-line-model\s*\{[^}]*-webkit-line-clamp: 2;/s);
assert.match(
  overlayCss,
  /\.preferred-model-selection-overlay-line-detail\s*\{[^}]*color: var\(--text\);[^}]*font-size: 14px;[^}]*font-weight: var\(--font-weight-medium\);[^}]*line-height: 1\.4;/s,
  "every applied setting row should share the model row's visual emphasis"
);
assert.match(overlayCss, /@keyframes preferred-model-selection-overlay-attention/);
assert.match(
  overlayCss,
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*?preferred-model-selection-overlay-attention-pulse/,
  "reduced motion must replace displacement with a highlight pulse"
);

const loadingOverlayCss = css.slice(css.indexOf(".chat-frame-wrap::after"), css.indexOf(".chat-frame-loading-status"));
assert.match(loadingOverlayCss, /z-index: var\(--overlay-z-frame-loading\);/);
const frameToastCss = css.slice(css.indexOf(".frame-submit-toast {"), css.indexOf(".chat-frame.active + .frame-submit-toast"));
assert.match(frameToastCss, /z-index: var\(--overlay-z-frame-toast\);/);
assert.match(
  css,
  /\.chat-frame\.active \+ \.frame-submit-toast\.frame-submit-toast-suppressed\s*\{[^}]*visibility: hidden;/s,
  "a visible selection overlay must consolidate and suppress its duplicate progress Toast"
);
assert.match(
  css,
  /\.frame-submit-toast\.show:not\(\.frame-submit-toast-suppressed\)\[data-frame-toast-bottom-right="true"\]/,
  "a consolidated progress Toast must not move the global Toast host"
);

console.log("preferred model selection overlay: ok");
