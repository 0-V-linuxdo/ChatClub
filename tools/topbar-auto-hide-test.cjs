#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const autoHide = read("app/topbar/auto-hide.js");
const topbar = read("app/topbar/controller.js");
const runtime = read("app/runtime.js");
const css = read("styles/chatclub.css");
const constants = read("shared/constants.js");
const shortcuts = read("shared/shortcuts.js");
const defaultShortcuts = read("shared/default-shortcuts.js");
const i18n = read("shared/i18n.js");
const appearanceTopbar = read("app/settings/appearance-topbar.js");
const appearance = read("app/settings/appearance.js");
const statePorts = read("app/settings/state-ports.js");
const promptFocus = read("app/prompt-focus/controller.js");
const frameController = read("app/workspace/frame-controller.js");
const tabsSidebar = read("app/workspace/tabs-sidebar-controller.js");
const uiDom = read("ui/dom.js");

// The parent cannot observe a pointer that is inside a site-isolated chat frame, so the reveal must
// be driven by parent-owned pointer moves plus an idle window. A CSS `:hover` reveal or a leave
// listener would stick revealed forever after a fast move into a chat.
const autoHideCode = autoHide.replace(/^\s*\/\/.*$/gm, "");
assert.match(autoHideCode, /"pointermove"/);
assert.match(autoHide, /site-isolated|cross-site/);
assert.doesNotMatch(autoHideCode, /"(?:mouseleave|mouseout|pointerleave|pointerout)"/);
assert.doesNotMatch(autoHideCode, /:hover/);
assert.doesNotMatch(css, /topbar[^\n]*:hover[^\n]*translateY/);
assert.match(autoHide, /chatclub:chat-frame-pointer/);
assert.match(autoHide, /TOPBAR_REVEAL_IDLE_MS/);
// Reveal timings are page-only chrome behavior and must not ride along in every content bundle.
assert.match(constants, /TOPBAR_VISIBILITY_MODES = Object\.freeze\(\["always", "auto"\]\)/);
assert.doesNotMatch(constants, /TOPBAR_REVEAL_(?:ZONE_PX|DWELL_MS|HIDE_GRACE_MS|IDLE_MS)/);

// A collapsed bar keeps its node: the docked composer owns the draft, the images and the send queue,
// its textarea must stay measurable, and Tab must still reach the bar so focus can reveal it.
assert.match(css, /\.app-shell\.topbar-collapsed:not\(\.topbar-editing-mode\)\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\)/);
assert.match(css, /\.app-shell\.topbar-collapsed:not\(\.topbar-editing-mode\)\s*\{[^}]*--workspace-tabs-sidebar-top: 0px/);
assert.match(css, /\.app-shell\.topbar-collapsed:not\(\.topbar-editing-mode\) \.topbar\s*\{[^}]*transform: translateY\(-100%\)/);
assert.match(css, /\.app-shell\.topbar-collapsed:not\(\.topbar-editing-mode\) \.topbar\s*\{[^}]*pointer-events: none/);
assert.doesNotMatch(css, /\.app-shell\.topbar-collapsed:not\(\.topbar-editing-mode\) \.topbar\s*\{[^}]*display: none/);
// Reveal and collapse resize the workspace; animating that transform would drag every chat frame
// through a relayout on each peek.
assert.doesNotMatch(css, /\.app-shell\.topbar-collapsed:not\(\.topbar-editing-mode\) \.topbar\s*\{[^}]*transition/);

// One source of truth for the geometry: the topbar sync applies it after every redraw.
assert.match(topbar, /from "\.\/auto-hide\.js"/);
assert.match(topbar, /createTopbarAutoHideController\(/);
assert.match(functionSource(topbar, "sync"), /autoHide\.sync\(\)/);
assert.match(functionSource(topbar, "runShortcutAction"), /autoHide\.toggle\(\)/);
// An accidental hide (the shortcut sits beside the sidebar toggle) must say how to undo itself, and a
// failed write must not leave the geometry and storage disagreeing.
assert.match(functionSource(topbar, "runShortcutAction"), /toast\(t\("toast\.topbarAutoHideEnabled"\), "info"\)/);
assert.match(topbar, /topbarVisibility === "auto" \? "always" : "auto"/);
assert.match(topbar, /autoHide\.sync\(\)[\s\S]{0,120}toast\(t\("toast\.appearanceAutoSaveFailed"\), "error"\)/);
// A collapsed bar has no on-screen anchor rect, so a menu shortcut peeks first.
assert.match(functionSource(topbar, "runShortcutAction"), /autoHide\.reveal\(\)[\s\S]*querySelector/);
assert.match(runtime, /action === "toggleTopbar"/);

// Focusing a docked prompt in a hidden bar reveals that bar, so every focus guard declines it through
// one predicate. The three guards that need it sit in three App domains that may not import each other
// or this module, so the predicate lives with the rest of caret ownership in ui/dom.js and the mode
// class name travels with it instead of being spelled out at four call sites.
assert.match(uiDom, /export const AUTO_HIDE_TOPBAR_CLASS = "topbar-auto-hide"/);
assert.match(uiDom, /export function isInsideAutoHiddenTopbar\(/);
assert.match(autoHide, /import \{ AUTO_HIDE_TOPBAR_CLASS \} from "\.\.\/\.\.\/ui\/dom\.js"/);
assert.match(autoHide, /const MODE_CLASS = AUTO_HIDE_TOPBAR_CLASS/);
for (const [name, source] of [["prompt focus", promptFocus], ["workspace frame", frameController]]) {
  assert.match(source, /isInsideAutoHiddenTopbar/, `${name} must use the shared auto-hidden-bar predicate`);
  assert.doesNotMatch(source, /topbar-auto-hide/, `${name} must not copy the mode class selector`);
  assert.doesNotMatch(source, /topbar\/auto-hide\.js/, `${name} must not reach across App domains for it`);
}
assert.equal(
  (promptFocus.match(/isInsideAutoHiddenTopbar\(prompt\)/g) || []).length,
  2,
  "both the initial restore loop and the frame-load restore must decline an auto-hidden bar"
);
// The `data-p` initial lock arms every first-load frame, so the first chat frame to finish loading
// focused that prompt ~1.6 s in and reopened the bar.
assert.match(functionSource(frameController, "armPromptFocusRestore"), /isInsideAutoHiddenTopbar\(prompt\)/);

// The sidebar follows the workspace grid's real top and knows nothing about auto-hide; a measured 0 is a
// real answer, so the old `top > 0` test that fell back to the 69px literal must not come back.
assert.match(functionSource(tabsSidebar, "alignSidebar"), /top >= 0 \? top : 69/);
assert.match(tabsSidebar, /^\s{4}alignSidebar,$/m);
assert.match(functionSource(topbar, "createTopbarController"), /alignSidebar: \(\) => actions\.alignWorkspaceTabsSidebar\?\.\(\)/);
assert.match(runtime, /alignWorkspaceTabsSidebar: \(\) => workspaceTabsSidebarController\.alignSidebar\(\)/);

// Explicit toggling is the discoverable path, so the action is a real shortcut with default keys.
assert.match(shortcuts, /"toggleTopbar"/);
assert.match(defaultShortcuts, /toggleTopbar: \{ disabled: false, command: false, control: false, option: true, shift: true, code: "KeyB" \}/);
assert.match(defaultShortcuts, /toggleTopbar: \{ disabled: false, control: false, alt: true, shift: true, code: "KeyB" \}/);
for (const key of [
  "topbar.visibility.title",
  "topbar.visibility.desc",
  "topbar.visibility.mode",
  "topbar.visibility.always",
  "topbar.visibility.auto",
  "topbar.visibility.help",
  "topbar.visibility.composerHint",
  "toast.topbarAutoHideEnabled",
  "shortcut.toggleTopbar.label",
  "shortcut.toggleTopbar.desc"
]) {
  assert.equal(
    (i18n.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")) || []).length,
    2,
    `${key} must be translated in en and zh_CN`
  );
}

// The setting lives in the existing Appearance -> Top Bar -> Layout pane, on the hug-row grammar the
// Input tab already uses, and it is the only writer of the preference besides the shortcut.
assert.match(appearanceTopbar, /function topbarVisibilityBlock\(/);
assert.match(appearanceTopbar, /queueAppearanceAutoSave\(\{ topbarVisibility: next \}/);
assert.match(appearanceTopbar, /value: "auto", label: t\("topbar\.visibility\.auto"\)/);
assert.match(appearanceTopbar, /topbarVisibilityBlock\(redraw\)/);
assert.match(appearanceTopbar, /appearance-overlay-row/);
// A docked composer would hide with the bar, so that pane points at the center float instead of
// silently moving the input.
assert.match(appearanceTopbar, /topbar\.visibility\.composerHint/);
assert.match(appearanceTopbar, /normalizeComposerPlacement\(state\.options\.composerPlacement\) === "topbar"/);
assert.match(statePorts, /"topbarVisibility"/);
assert.match(constants, /id: "settings\.appearance\.topbarVisibility", labelKey: "topbar\.visibility\.title"/);
assert.match(appearance, /"settings\.appearance\.topbarVisibility": "info"/);

class FakeElement {
  constructor(className = "", tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.attributes = Object.create(null);
    this.children = [];
    this.parentNode = null;
    this.rect = { top: 0, bottom: 51 };
  }

  get classList() {
    const self = this;
    const values = () => new Set(String(self.className || "").split(/\s+/).filter(Boolean));
    return {
      contains: (name) => values().has(name),
      add(name) {
        const next = values();
        next.add(name);
        self.className = [...next].join(" ");
      },
      remove(name) {
        const next = values();
        next.delete(name);
        self.className = [...next].join(" ");
      },
      toggle(name, force) {
        if (force) this.add(name);
        else this.remove(name);
      }
    };
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  contains(node) {
    if (!node) return false;
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  // Present so a collapse that tried to blur its way out of a caret hold would be observable here
  // instead of silently passing against a node without the method.
  blur() {
    if (globalThis.document?.activeElement === this) globalThis.document.activeElement = null;
  }

  matchesOne(selector) {
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)="([^"]*)"\]$/);
    if (attribute) return this.attributes[attribute[1]] === attribute[2];
    return false;
  }

  querySelector(selector) {
    const parts = selector.split(",").map((part) => part.trim()).filter(Boolean);
    for (const child of this.children) {
      if (parts.some((part) => child.matchesOne(part))) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

function createEventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type, event = {}) {
      for (const handler of [...(listeners.get(type) || [])]) handler(event);
    },
    count(type) {
      return listeners.get(type)?.size || 0;
    }
  };
}

(async () => {
  const { DEFAULT_OPTIONS } = await import(pathToFileURL(path.join(root, "shared/constants.js")).href);
  const { normalizeOptions, normalizeTopbarVisibility } = await import(
    pathToFileURL(path.join(root, "shared/storage-schema.js")).href
  );
  // Auto-hide is opt-in: an untouched install keeps the bar it has always had.
  assert.equal(DEFAULT_OPTIONS.topbarVisibility, "always");
  assert.equal(normalizeTopbarVisibility("auto"), "auto");
  assert.equal(normalizeTopbarVisibility("hover"), "always");
  assert.equal(normalizeTopbarVisibility(undefined), "always");
  assert.equal(normalizeOptions({ topbarVisibility: "auto" }).topbarVisibility, "auto");
  assert.equal(normalizeOptions({ topbarVisibility: "sometimes" }).topbarVisibility, "always");

  const shell = new FakeElement("app-shell");
  const bar = new FakeElement("topbar");
  shell.appendChild(bar);
  const control = new FakeElement("top-icon-action", "button");
  bar.appendChild(control);

  const fakeDocument = Object.assign(createEventTarget(), {
    activeElement: null,
    querySelector(selector) {
      if (selector === ".app-shell") return shell;
      if (selector === ".topbar") return bar;
      return shell.querySelector(selector);
    }
  });
  const fakeWindow = createEventTarget();

  let now = 0;
  const timers = new Map();
  let nextTimerId = 1;
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (handler, delay = 0) => {
    const id = nextTimerId++;
    timers.set(id, { at: now + Number(delay), handler });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  const advance = (ms) => {
    const target = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].handler();
    }
    now = target;
  };

  globalThis.document = fakeDocument;
  globalThis.window = fakeWindow;

  const { createTopbarAutoHideController } = await import(
    pathToFileURL(path.join(root, "app/topbar/auto-hide.js")).href
  );

  const persisted = [];
  const aligned = [];
  const state = { options: { ...DEFAULT_OPTIONS }, topbarEditMode: false };
  const controller = createTopbarAutoHideController({
    state,
    alignSidebar: () => aligned.push(shell.classList.contains("topbar-collapsed")),
    persistVisibility: async (value) => {
      persisted.push(value);
      state.options = { ...state.options, topbarVisibility: value };
    }
  });

  // "Always visible" must not pay for the feature: nothing is bound and nothing is collapsed.
  controller.sync();
  assert.equal(shell.classList.contains("topbar-collapsed"), false);
  assert.equal(fakeWindow.count("pointermove"), 0);

  state.options.topbarVisibility = "auto";
  controller.sync();
  assert.equal(shell.classList.contains("topbar-collapsed"), true, "auto-hide gives the strip to the chats");
  assert.equal(fakeWindow.count("pointermove"), 1);
  assert.equal(controller.isCollapsed(), true);
  // The ChatClub Tabs sidebar measures the workspace grid's real top once per render, so the row this
  // class collapses has to tell it to measure again or it leaves a dead strip above a hidden bar.
  assert.deepEqual(aligned, [true], "collapsing re-aligns the sidebar to the bar's real height");

  // A cursor only passing along the top edge must not displace the workspace.
  fakeWindow.dispatch("pointermove", { clientY: 2 });
  advance(200);
  assert.equal(shell.classList.contains("topbar-collapsed"), true, "the reveal waits out the dwell window");
  fakeWindow.dispatch("pointermove", { clientY: 400 });
  advance(1000);
  assert.equal(shell.classList.contains("topbar-collapsed"), true, "leaving the band cancels the pending reveal");

  fakeWindow.dispatch("pointermove", { clientY: 1 });
  advance(400);
  assert.equal(shell.classList.contains("topbar-collapsed"), false, "dwelling at the top edge peeks the bar");
  assert.equal(controller.isCollapsed(), false);
  assert.deepEqual(aligned, [true, false], "and a peek re-aligns it back under the revealed bar");

  // Inside the revealed bar the peek holds, and each move restarts the idle window.
  fakeWindow.dispatch("pointermove", { clientY: 30 });
  advance(1500);
  fakeWindow.dispatch("pointermove", { clientY: 30 });
  advance(1500);
  assert.equal(shell.classList.contains("topbar-collapsed"), false, "a pointer inside the bar keeps it revealed");

  // Moving down into the workspace collapses after the grace window.
  fakeWindow.dispatch("pointermove", { clientY: 300 });
  advance(200);
  assert.equal(shell.classList.contains("topbar-collapsed"), false, "the collapse waits out the grace window");
  advance(400);
  assert.equal(shell.classList.contains("topbar-collapsed"), true);

  // Measured in Chromium 149: a pointer that jumps straight from the bar into a cross-site frame
  // sends the parent no event at all, so only the idle window can end that peek.
  fakeWindow.dispatch("pointermove", { clientY: 0 });
  advance(400);
  assert.equal(shell.classList.contains("topbar-collapsed"), false);
  advance(2100);
  assert.equal(shell.classList.contains("topbar-collapsed"), true, "the idle window is the guaranteed way back");

  // The child shield reports the trusted pointer the parent never sees, which ends the peek at once.
  fakeWindow.dispatch("pointermove", { clientY: 0 });
  advance(400);
  assert.equal(shell.classList.contains("topbar-collapsed"), false);
  fakeDocument.dispatch("chatclub:chat-frame-pointer", {});
  assert.equal(shell.classList.contains("topbar-collapsed"), true, "a click inside a chat hands the strip back");

  // Focus is the keyboard path in and a hard hold while it stays: Tab must never leave a caret
  // inside a bar that is off screen.
  fakeDocument.activeElement = control;
  fakeWindow.dispatch("focusin", { target: control });
  assert.equal(shell.classList.contains("topbar-collapsed"), false, "focus reveals the bar");
  advance(6000);
  assert.equal(shell.classList.contains("topbar-collapsed"), false, "focus inside the bar holds the peek");
  // Tab between two bar controls is still work inside the bar.
  fakeWindow.dispatch("focusout", { target: control, relatedTarget: control });
  advance(1000);
  assert.equal(shell.classList.contains("topbar-collapsed"), false);
  fakeDocument.activeElement = null;
  fakeWindow.dispatch("focusout", { target: control, relatedTarget: null });
  advance(500);
  assert.equal(shell.classList.contains("topbar-collapsed"), true, "focus leaving the bar collapses it");

  // An open menu is a hard hold; a tooltip is a soft hold, because a pointer that jumped into a
  // frame never sends its trigger a leave event either.
  fakeWindow.dispatch("pointermove", { clientY: 0 });
  advance(400);
  const menu = new FakeElement("topbar-settings-popover");
  control.attributes["aria-haspopup"] = "menu";
  control.attributes["aria-expanded"] = "true";
  shell.appendChild(menu);
  advance(6000);
  assert.equal(shell.classList.contains("topbar-collapsed"), false, "an open menu holds the peek");
  delete control.attributes["aria-haspopup"];
  control.attributes["aria-expanded"] = "false";
  menu.remove();
  advance(2100);
  assert.equal(shell.classList.contains("topbar-collapsed"), true);

  // The ChatClub Tabs toggle is a two-state disclosure for a panel that is not in this bar, and it stays
  // expanded for as long as the sidebar is open. Treating a bare `aria-expanded="true"` as a menu held the
  // bar open for the whole session, so a real menu trigger must also carry `aria-haspopup`.
  const sidebarToggle = new FakeElement("workspace-tabs-sidebar-toggle top-icon-action", "button");
  sidebarToggle.attributes["aria-expanded"] = "true";
  bar.appendChild(sidebarToggle);
  fakeWindow.dispatch("pointermove", { clientY: 0 });
  advance(400);
  assert.equal(shell.classList.contains("topbar-collapsed"), false);
  advance(2100);
  assert.equal(shell.classList.contains("topbar-collapsed"), true, "an open sidebar cannot hold the bar open");
  sidebarToggle.remove();

  fakeWindow.dispatch("pointermove", { clientY: 0 });
  advance(400);
  const tooltip = new FakeElement("tooltip-open", "button");
  bar.appendChild(tooltip);
  advance(2100);
  assert.equal(shell.classList.contains("topbar-collapsed"), false, "a visible tooltip buys one idle window");
  advance(2100);
  assert.equal(shell.classList.contains("topbar-collapsed"), true, "a stuck tooltip cannot hold the bar forever");
  tooltip.remove();

  // Edit mode keeps the bar in flow: its palette is taller than the bar and belongs in the layout.
  state.topbarEditMode = true;
  controller.sync();
  assert.equal(shell.classList.contains("topbar-collapsed"), false);
  assert.equal(fakeWindow.count("pointermove"), 0, "edit mode unbinds the reveal");
  state.topbarEditMode = false;
  controller.sync();
  assert.equal(shell.classList.contains("topbar-collapsed"), true);

  // The shortcut is explicit intent, so it moves the stored preference; a peek never does.
  await controller.toggle();
  assert.deepEqual(persisted, ["always"]);
  assert.equal(state.options.topbarVisibility, "always");
  assert.equal(shell.classList.contains("topbar-collapsed"), false);
  assert.equal(fakeWindow.count("pointermove"), 0);
  await controller.toggle();
  assert.deepEqual(persisted, ["always", "auto"]);
  assert.equal(shell.classList.contains("topbar-collapsed"), true);

  // A caret in the bar cannot be resolved by blurring it: a focused `.prompt-input` owns the page-caret
  // lease and `ui/dom.js` re-claims it after a body blur on purpose. So turning auto-hide on over a
  // focused control starts revealed and collapses once the caret leaves on the user's terms.
  await controller.toggle();
  assert.equal(shell.classList.contains("topbar-collapsed"), false);
  fakeDocument.activeElement = control;
  await controller.toggle();
  assert.equal(shell.classList.contains("topbar-collapsed"), false, "the toggle never hides a focused control");
  assert.equal(fakeDocument.activeElement, control, "and it does not fight the caret owner for that caret");
  advance(6000);
  assert.equal(shell.classList.contains("topbar-collapsed"), false, "the caret keeps holding");
  fakeDocument.activeElement = null;
  fakeWindow.dispatch("focusout", { target: control, relatedTarget: null });
  advance(500);
  assert.equal(shell.classList.contains("topbar-collapsed"), true, "leaving the bar hands the strip back");

  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  delete globalThis.document;
  delete globalThis.window;
  console.log("topbar auto-hide: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
