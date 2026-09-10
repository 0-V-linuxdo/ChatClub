#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const composer = read("app/composer/controller.js");
const dom = read("ui/dom.js");
const css = read("styles/chatclub.css");
const agents = read("AGENTS.md");
const i18n = read("shared/i18n.js");
const topbarView = read("app/topbar/view.js");
const topbar = read("app/topbar/controller.js");
const appearanceTopbar = read("app/settings/appearance-topbar.js");
const promptLibrary = read("app/prompt-library/controller.js");
const frame = read("app/workspace/frame-controller.js");

assert.match(composer, /composer: true/);
assert.match(composer, /mode: "overlay"/);
assert.match(composer, /stolen: composerCaretStolen/);
assert.match(composer, /shouldLeave: composerCaretShouldLeave/);
assert.doesNotMatch(composer, /mode: "page"/);
assert.match(composer, /from "\.\/search-panel\.js"/);
assert.match(composer, /enterSearchMode/);
assert.doesNotMatch(composer, /from "\.\.\/workspace\//);
assert.doesNotMatch(composer, /viewerModal|editorModal|confirmationModal|taskModal/);
assert.doesNotMatch(composer, /class: ["'`]modal/);
assert.doesNotMatch(composer, /pageCaretHoldActive/);
assert.match(composer, /function applyPlacement\(/);
assert.match(composer, /composer-center-host/);
assert.match(composer, /COMPOSER_CENTER_HOST_ID/);
assert.match(composer, /overlay-surface composer-center-host/);
assert.match(composer, /composer-center-slot/);
assert.match(composer, /composer-center-mark/);
assert.match(composer, /prompt-pin-button/);
assert.match(composer, /let centerPinned = false/);
assert.match(composer, /function showCenterHost\(/);
assert.match(composer, /function hideCenterHost\(/);
assert.match(composer, /CHAT_FRAME_POINTER_EVENT/);
assert.match(composer, /host\.hidden = true/);
assert.match(functionSource(composer, "focusInput"), /showCenterHost\(/);
assert.match(functionSource(composer, "enterSearchMode"), /showCenterHost\(/);
assert.match(functionSource(composer, "applyPlacement"), /if \(centerPinned\) centerHost\.hidden = false/);
assert.match(composer, /state\.topbarEditMode/);
assert.match(dom, /export function overlaySearchCaretComposer/);
assert.match(dom, /composer: options\.composer === true/);
assert.match(dom, /shouldLeave: typeof options\.shouldLeave === "function"/);
assert.match(dom, /overlaySearchCaretMode\(\) !== "page" && !overlaySearchCaretComposer\(\)/);
assert.match(frame, /overlaySearchCaretComposer\(\)/);
assert.match(frame, /adoptPageCaretLease\(iframe\)/);
assert.match(frame, /overlaySearchCaretMode\(\) === "page" \|\| overlaySearchCaretComposer\(\)/);
assert.match(topbarView, /composer\.applyPlacement\(\)/);
assert.match(topbar, /composer\.applyPlacement\(\)/);
assert.match(appearanceTopbar, /topbar-prompt-input-placement/);
assert.match(appearanceTopbar, /composerPlacement/);
assert.match(promptLibrary, /viewportHeight/);
assert.match(promptLibrary, /--prompt-library-top/);
assert.match(agents, /overlay-grade composer caret owner/);
assert.match(agents, /composerInert/);
assert.match(agents, /#composer-center-host\.overlay-surface/);
assert.match(agents, /Do not resurrect `pageCaretHoldActive`/);
assert.match(agents, /clamp `--prompt-library-top` from the live `\.prompt-shell`/);
assert.match(agents, /in-flow sibling of `\.prompt-input-row`/);
assert.match(agents, /never absolutely overlaid on `\.prompt-input`/);
assert.match(composer, /class: "prompt-input-row"/);
assert.doesNotMatch(composer, /tabindex: \(gateApplying \|\| gateFailed\) \? "0"/);
assert.match(css, /\.prompt-model-gate-status\.tooltip-trigger \{[\s\S]*position:\s*static;/);
assert.doesNotMatch(css, /--prompt-model-gate-reserve/);
assert.match(css, /\.composer-center-host \{[\s\S]*z-index:\s*var\(--overlay-z-panel\)/);
assert.doesNotMatch(css, /--overlay-z-composer/);
assert.match(i18n, /"topbar\.input\.placement": "Placement"/);
assert.match(i18n, /"topbar\.input\.placement": "位置"/);
assert.match(i18n, /"topbar\.input\.placementCenter": "Center"/);
assert.match(i18n, /"topbar\.input\.placementCenter": "居中"/);
assert.match(i18n, /"composer\.pin": "Pin composer"/);
assert.match(i18n, /"composer\.pin": "置顶"/);
assert.match(i18n, /"composer\.unpin": "Unpin composer"/);
assert.match(i18n, /"composer\.unpin": "取消置顶"/);
assert.match(agents, /host starts hidden unless pinned/);
assert.match(agents, /`\.prompt-pin-button`/);
assert.match(css, /\.prompt-pin-button\s*\{[\s\S]*?grid-column:\s*6/);
assert.match(css, /\.composer-center-host \.prompt-pin-button\s*\{[\s\S]*?display:\s*inline-grid/);

assert.match(functionSource(composer, "composerCaretStolen"), /chat-frame-wrap/);
// Frame chrome inside .chat-frame-wrap only receives focus programmatically (selection-overlay
// focus guard); for the composer that is a steal to reclaim, never a leave or a parking spot.
assert.doesNotMatch(functionSource(composer, "composerCaretStolen"), /preferred-model-selection-overlay|frame-toast/);
assert.match(functionSource(composer, "composerCaretShouldLeave"), /popover-menu/);
assert.doesNotMatch(functionSource(composer, "composerCaretShouldLeave"), /preferred-model-selection-overlay/);
assert.match(functionSource(composer, "composerCaretShouldLeave"), /chat-frame-wrap/);
assert.doesNotMatch(functionSource(composer, "applyPlacement"), /cloneNode|innerHTML/);

(async () => {
  const { DEFAULT_OPTIONS } = await import(pathToFileURL(path.join(root, "shared/constants.js")).href);
  const { normalizeComposerPlacement, normalizeOptions, dehydrateOptions } = await import(
    pathToFileURL(path.join(root, "shared/storage-schema.js")).href
  );
  assert.equal(DEFAULT_OPTIONS.composerPlacement, "topbar");
  assert.equal(normalizeComposerPlacement("center"), "center");
  assert.equal(normalizeComposerPlacement("topbar"), "topbar");
  assert.equal(normalizeComposerPlacement("modal"), "topbar");
  assert.equal(normalizeComposerPlacement(null), "topbar");
  assert.equal(normalizeOptions({}).composerPlacement, "topbar");
  assert.equal(normalizeOptions({ composerPlacement: "center" }).composerPlacement, "center");
  assert.equal(dehydrateOptions({ composerPlacement: "center" }).composerPlacement, "center");

  class FakeNode {
    constructor(tagName = "div") {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.className = "";
      this.id = "";
      this.hidden = false;
      this.attributes = Object.create(null);
    }

    get classList() {
      const self = this;
      return {
        contains(name) {
          return String(self.className || "").split(/\s+/).includes(name);
        },
        add(name) {
          const values = new Set(String(self.className || "").split(/\s+/).filter(Boolean));
          values.add(name);
          self.className = [...values].join(" ");
        },
        remove(name) {
          const values = new Set(String(self.className || "").split(/\s+/).filter(Boolean));
          values.delete(name);
          self.className = [...values].join(" ");
        }
      };
    }

    appendChild(node) {
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      this.children.push(node);
      return node;
    }

    append(...nodes) {
      for (const node of nodes) this.appendChild(node);
    }

    remove() {
      this.parentNode?.removeChild(this);
    }

    removeChild(node) {
      this.children = this.children.filter((child) => child !== node);
      if (node.parentNode === this) node.parentNode = null;
      return node;
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
      const matches = [];
      const visit = (node) => {
        if (selector.startsWith(".") && node.classList.contains(selector.slice(1))) matches.push(node);
        if (selector.startsWith("#") && node.id === selector.slice(1)) matches.push(node);
        for (const child of node.children) visit(child);
      };
      for (const child of this.children) visit(child);
      return matches;
    }
  }

  const body = new FakeNode("body");
  const composerNode = new FakeNode("div");
  composerNode.className = "composer topbar-item topbar-item-composer";
  const shell = new FakeNode("div");
  shell.className = "prompt-shell";
  const input = new FakeNode("textarea");
  input.className = "prompt-input";
  shell.appendChild(input);
  composerNode.appendChild(shell);
  body.appendChild(composerNode);
  const created = [];
  const document = {
    body,
    getElementById(id) {
      if (body.id === id) return body;
      return body.querySelector(`#${id}`);
    },
    querySelector(selector) {
      if (selector === ".composer.topbar-item-composer") return composerNode;
      return body.querySelector(selector);
    }
  };
  const context = vm.createContext({
    document,
    Boolean,
    String,
    state: { options: { composerPlacement: "center" }, topbarEditMode: false },
    t: (key) => key,
    el(tag, props = {}) {
      const node = new FakeNode(tag);
      if (props.id) node.id = props.id;
      if (props.class) node.className = props.class;
      if (props.role) node.attributes.role = props.role;
      created.push(node);
      return node;
    }
  });
  vm.runInContext(`
    const COMPOSER_CENTER_HOST_ID = "composer-center-host";
    let centerPinned = false;
    function syncPinButton() {}
    ${functionSource(composer, "composerPlacementValue")}
    ${functionSource(composer, "ensureComposerCenterHost")}
    ${functionSource(composer, "applyPlacement")}
    applyPlacement();
    globalThis.host = document.getElementById("composer-center-host");
  `, context);
  assert.equal(shell.parentNode.id, "composer-center-host", "center placement must reparent the live prompt shell");
  assert.equal(composerNode.classList.contains("composer-center-slot"), true);
  assert.equal(context.host.hidden, true, "center host starts hidden when unpinned");
  assert.equal(input.parentNode, shell, "reparenting must not remount the textarea");
  context.state.options.composerPlacement = "topbar";
  vm.runInContext("applyPlacement()", context);
  assert.equal(shell.parentNode, composerNode, "topbar placement must return the same shell to the required slot");
  assert.equal(composerNode.classList.contains("composer-center-slot"), false);

  console.log("composer overlay placement tests passed");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
