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
const icons = read("ui/icons.js");
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
assert.match(composer, /class: "composer-center-mark top-icon-action tooltip-trigger"/);
assert.match(composer, /"data-tooltip-id": "composer.open"/);
assert.match(composer, /"aria-expanded": "false"/);
assert.match(composer, /createSvgIcon\("keyboard"\)/);
assert.doesNotMatch(composer, /composer-center-mark-label/);
assert.doesNotMatch(composer, /createSvgIcon\("edit"\)/);
assert.match(icons, /\bkeyboard:\s*\[/);
assert.match(icons, /x: "2", y: "4", width: "20", height: "16"/);
assert.match(icons, /d: "M7 16h10"/);
assert.match(icons, /d: "M18 8h\.01"/);
assert.doesNotMatch(icons, /x: "3", y: "5", width: "18", height: "14"/);
assert.match(icons, /\bsplit:\s*\[/);
assert.match(icons, /M12 22v-8\.3a4 4 0 0 0-1\.172-2\.872L3 3/);
assert.doesNotMatch(composer, /composer-center-launcher/);
assert.doesNotMatch(composer, /COMPOSER_CENTER_LAUNCHER_ID/);
assert.match(composer, /prompt-pin-button/);
assert.match(composer, /let centerPinned = false/);
assert.match(composer, /function showCenterHost\(/);
assert.match(composer, /function hideCenterHost\(/);
assert.match(composer, /function openComposerTooltip\(/);
assert.match(composer, /function syncCenterMark\(/);
assert.match(functionSource(composer, "openComposerTooltip"), /formatShortcut\(/);
assert.match(functionSource(composer, "openComposerTooltip"), /focusInput/);
assert.match(functionSource(composer, "syncCenterMark"), /aria-expanded/);
assert.doesNotMatch(composer, /function syncCenterLauncher\(/);
assert.match(composer, /CHAT_FRAME_POINTER_EVENT/);
assert.match(composer, /host\.hidden = true/);
assert.match(functionSource(composer, "focusInput"), /showCenterHost\(/);
assert.match(functionSource(composer, "enterSearchMode"), /showCenterHost\(/);
assert.match(functionSource(composer, "showCenterHost"), /syncCenterMark/);
assert.match(functionSource(composer, "hideCenterHost"), /syncCenterMark/);
assert.doesNotMatch(functionSource(composer, "showCenterHost"), /syncCenterLauncher/);
assert.doesNotMatch(functionSource(composer, "hideCenterHost"), /syncCenterLauncher/);
assert.match(functionSource(composer, "applyPlacement"), /if \(centerPinned\) centerHost\.hidden = false/);
assert.match(functionSource(composer, "applyPlacement"), /syncCenterMark/);
assert.doesNotMatch(functionSource(composer, "applyPlacement"), /syncCenterLauncher/);
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
assert.match(agents, /child of `\.prompt-input-row` immediately before `\.prompt-send-button`/);
assert.match(agents, /never overlaid on `\.prompt-input`/);
assert.match(agents, /must never grow `--topbar-height`/);
assert.match(composer, /class: "prompt-input-row"/);
assert.match(composer, /class: "prompt-input-row"[\s\S]*prompt-model-gate-status[\s\S]*prompt-send-button/);
assert.doesNotMatch(composer, /tabindex: \(gateApplying \|\| gateFailed\) \? "0"/);
assert.match(css, /\.prompt-model-gate-status\.tooltip-trigger \{[\s\S]*?position:\s*static;[\s\S]*?grid-column:\s*5;/);
assert.doesNotMatch(css, /top:\s*calc\(100% \+ var\(--space-1\)\)/);
assert.doesNotMatch(css, /--prompt-model-gate-reserve/);
assert.doesNotMatch(css, /--prompt-model-gate-width/);
assert.doesNotMatch(css, /--topbar-height:\s*calc\(51px/);
assert.match(css, /\.composer-center-host \{[\s\S]*z-index:\s*var\(--overlay-z-panel\)/);
assert.doesNotMatch(css, /--overlay-z-composer/);
assert.match(i18n, /"topbar\.input\.placement": "Placement"/);
assert.match(i18n, /"topbar\.input\.placement": "位置"/);
assert.match(i18n, /"topbar\.input\.placementCenter": "Center"/);
assert.match(i18n, /"topbar\.input\.placementCenter": "居中"/);
assert.match(i18n, /"composer\.pin": "Pin composer"/);
assert.match(i18n, /"composer\.pin": "固定弹层"/);
assert.match(i18n, /"composer\.unpin": "Unpin composer"/);
assert.match(i18n, /"composer\.unpin": "取消固定"/);
assert.match(i18n, /"composer\.open": "Open composer"/);
assert.match(i18n, /"composer\.open": "打开输入框"/);
assert.match(i18n, /"shortcut\.focusInput\.label": "Open composer"/);
assert.match(i18n, /"shortcut\.focusInput\.label": "打开输入框"/);
assert.match(agents, /host starts hidden unless pinned/);
assert.match(agents, /`\.prompt-pin-button`/);
assert.match(agents, /`\.composer-center-mark`/);
assert.match(agents, /icon-only `top-icon-action`/);
assert.match(agents, /tooltip carries `focusInput`/);
assert.doesNotMatch(agents, /composer-center-launcher/);
assert.match(css, /\.prompt-pin-button\s*\{[\s\S]*?grid-column:\s*7/);
assert.match(css, /\.prompt-pin-button\s*\{[\s\S]*?display:\s*none/);
assert.match(css, /\.composer-center-host \.prompt-pin-button\s*\{[\s\S]*?display:\s*inline-grid/);
{
  // The pin carries the shared .compact-icon utility, whose display: inline-grid
  // sits later in the cascade than .prompt-pin-button { display: none } and
  // therefore re-showed the pin inside the topbar pill. A two-class hide must
  // outrank that utility, and the center-host show must still come after it.
  const hidden = css.search(/\.prompt-pin-button\.compact-icon\s*\{[^}]*display:\s*none/);
  const shown = css.search(/\.composer-center-host \.prompt-pin-button\s*\{[^}]*display:\s*inline-grid/);
  assert.ok(hidden >= 0, "the topbar-slot pin must stay hidden even with the .compact-icon utility applied");
  assert.ok(shown > hidden, "the center-host pin rule must follow the compact-icon hide so the popup still shows the pin");
}
assert.match(css, /\.composer-center-host \.prompt-pin-button\.is-pinned[\s\S]*?background:\s*var\(--primary\)/);
assert.match(css, /\.composer-center-mark\s*\{[\s\S]*?width:\s*var\(--ui-chrome-height\)/);
assert.match(css, /\.composer-center-mark\s*\{[^}]*border-radius:\s*var\(--ui-radius\)/);
assert.doesNotMatch(css, /\.composer-center-mark\s*\{[^}]*border-radius:\s*var\(--ui-radius-pill\)/);
assert.doesNotMatch(css, /composer-center-mark-label/);
assert.doesNotMatch(css, /composer-center-launcher/);
assert.match(css, /\.composer-center-host \{[\s\S]*?--composer-center-top:\s*calc\(var\(--topbar-height\) \+ var\(--workspace-tab-row-height, 40px\) \+ var\(--space-3\)\)/);
assert.match(css, /\.composer-center-host \{[\s\S]*?top:\s*var\(--composer-center-top\)/);
assert.match(css, /\.composer-center-host \{[\s\S]*?transform:\s*translateX\(-50%\)/);
assert.doesNotMatch(css, /--composer-center-top:\s*calc\(50vh - 28px\)/);
assert.doesNotMatch(css, /--composer-center-top:\s*calc\(var\(--topbar-height\) \+ var\(--space-2\)\)/);
assert.doesNotMatch(css, /--composer-center-top:\s*calc\(var\(--topbar-height\) \+ var\(--overlay-gutter\) \* 2\)/);
assert.doesNotMatch(css, /\.composer-center-host \{[^}]*translate\(-50%, -50%\)/);
assert.match(css, /--prompt-collapsed-height:\s*40px;/);
// The topbar is 6px padding + 38px pill + 6px padding + 1px border = 51px, the
// same bar the 34px icon actions were sized for. The 2026-09-10 composer
// restyle grew the pill to 56px and pushed the bar to 69px; that was the
// "stretched header" regression, so a taller pill must never lift the bar.
assert.match(css, /--topbar-height:\s*51px;/);
assert.doesNotMatch(css, /--topbar-height:\s*(?:6\d|7\d)px;/, "the topbar must not grow past 51px to fit a taller composer pill");
assert.match(css, /^\.topbar \{[^}]*height:\s*var\(--topbar-height\)/m);
assert.match(css, /^\.topbar \{[^}]*padding:\s*6px var\(--space-2\)/m);
assert.match(css, /\.topbar \.composer:not\(\.composer-center-slot\)\s*\{[\s\S]*?--prompt-collapsed-height:\s*38px/);
assert.match(css, /\.topbar \.composer:not\(\.composer-center-slot\) \.prompt-shell\s*\{[\s\S]*?--prompt-collapsed-height:\s*38px/);
assert.doesNotMatch(css, /\.topbar \.composer:not\(\.composer-center-slot\)[^{]*\{[^}]*--prompt-collapsed-height:\s*56px/, "the topbar slot pill must not return to the 56px height that stretched the bar");
assert.match(css, /\.prompt-send-button \{[\s\S]*?height:\s*var\(--ui-accessory-height\)/, "the send control must fit the 38px pill like the other 28px accessories");
assert.match(css, /\.composer-center-host \{[\s\S]*?--prompt-collapsed-height:\s*40px/);
assert.match(css, /^\.prompt-shell \{[^}]*--prompt-collapsed-height:\s*40px/m);
assert.doesNotMatch(css, /^\.prompt-shell \{[^}]*--prompt-collapsed-height:\s*56px/m);
assert.match(css, /^\.composer \{[^}]*height:\s*var\(--prompt-collapsed-height\)/m);
assert.doesNotMatch(css, /^\.composer \{[^}]*height:\s*56px/m);
assert.match(functionSource(composer, "resizeInput"), /promptCollapsedHeightFor\(inputNode\)/);
assert.match(functionSource(composer, "resizeInput"), /empty = !String\(inputNode\.value \|\| ""\)\.trim\(\)/);
assert.match(functionSource(composer, "resizeInput"), /if \(grow && !empty\)/);
assert.match(functionSource(composer, "resizeInput"), /collapsedHeight,\s*empty/);
assert.match(functionSource(composer, "resizeInput"), /measurePromptScrollHeight/);
assert.match(functionSource(composer, "resizeInput"), /prompt-shell-stacked/);
assert.match(functionSource(composer, "measurePromptScrollHeight"), /height = "auto"/);
assert.doesNotMatch(functionSource(composer, "measurePromptScrollHeight"), /height = "0px"/);
assert.match(agents, /topbar slot uses 38px/);
assert.match(css, /\.composer-center-host \.prompt-shell-search \.prompt-input-row\s*\{[\s\S]*?max-height:\s*none/);
assert.match(functionSource(composer, "resizeInput"), /closest\?\.\("#composer-center-host"\)/);
assert.match(functionSource(composer, "enterSearchMode"), /resizeInput\(field, true\)/);
assert.match(functionSource(composer, "handleInput"), /resizeInput\(event\.target, true\)/);
assert.match(agents, /--composer-center-top/);
assert.match(agents, /var\(--topbar-height\) \+ var\(--workspace-tab-row-height, 40px\) \+ var\(--space-3\)/);
assert.match(agents, /grow with `scrollHeight` downward/);
assert.match(agents, /Collapsed composer height is 40px/);

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
    function syncCenterMark() {}
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
