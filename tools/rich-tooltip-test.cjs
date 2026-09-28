#!/usr/bin/env node

// The rich variant of the global tooltip (`data-tooltip-rich`) that Settings
// (i) help uses: a structured card that the pointer can reach, a click pins,
// and Escape or an outside press dismisses. Plain label tooltips are unchanged.

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const hovered = new Set();

class FakeNode {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.nodeName = this.tagName;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = new Map();
    this.style = { setProperty: (name, value) => { this.style[name] = value; } };
    this.rect = { top: 0, left: 0, width: 0, height: 0 };
    this._text = "";
    this._classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classes.add(name)),
      remove: (...names) => names.forEach((name) => this._classes.delete(name)),
      contains: (name) => this._classes.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this._classes.has(name) : Boolean(force);
        if (enabled) this._classes.add(name);
        else this._classes.delete(name);
        return enabled;
      }
    };
  }

  get className() { return [...this._classes].join(" "); }
  set className(value) { this._classes = new Set(String(value || "").split(/\s+/).filter(Boolean)); }
  get textContent() {
    if (this.tagName === "#TEXT" || this._text) return this._text;
    return this.children.map((child) => child.textContent).join("");
  }
  set textContent(value) {
    this.replaceChildren();
    this._text = String(value ?? "");
  }
  append(...children) {
    for (const child of children) {
      if (child == null) continue;
      assert.ok(child instanceof FakeNode, `append() received a non-node: ${String(child)}`);
      child.parentElement = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    this.children = [];
    this._text = "";
    this.append(...children);
  }
  contains(node) {
    for (let current = node; current; current = current.parentElement) {
      if (current === this) return true;
    }
    return false;
  }
  setAttribute(name, value) { this.attributes.set(String(name), String(value)); }
  getAttribute(name) { return this.attributes.get(String(name)) ?? null; }
  removeAttribute(name) { this.attributes.delete(String(name)); }
  getClientRects() { return this.parentElement || this.tagName === "HTML" ? [this.rect] : []; }
  getBoundingClientRect() {
    const { top, left, width, height } = this.rect;
    return { top, left, width, height, right: left + width, bottom: top + height, x: left, y: top };
  }
  matches(selector) {
    return String(selector).split(",").some((part) => this.matchesCompound(part.trim()));
  }
  matchesCompound(compound) {
    const pseudo = compound.match(/:([\w-]+)$/)?.[1];
    if (pseudo === "hover") return hovered.has(this);
    if (pseudo) return false;
    const tag = compound.match(/^[a-z]+/i)?.[0];
    if (tag && tag.toUpperCase() !== this.tagName) return false;
    const classes = [...compound.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
    const attributes = [...compound.matchAll(/\[([\w-]+)\]/g)].map((match) => match[1]);
    return classes.every((name) => this._classes.has(name)) && attributes.every((name) => this.attributes.has(name));
  }
  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (current.matches(selector)) return current;
    }
    return null;
  }
  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

const documentListeners = new Map();
const windowListeners = new Map();
const listen = (registry) => (type, listener) => {
  registry.set(type, [...(registry.get(type) || []), listener]);
};
const documentElement = new FakeNode("html");
const body = new FakeNode("body");
documentElement.append(body);

globalThis.Node = FakeNode;
globalThis.Element = FakeNode;
globalThis.document = {
  documentElement,
  body,
  createElement: (tagName) => new FakeNode(tagName),
  createTextNode: (value) => {
    const node = new FakeNode("#text");
    node._text = String(value);
    return node;
  },
  querySelectorAll: (selector) => documentElement.querySelectorAll(selector),
  addEventListener: listen(documentListeners)
};
globalThis.window = { innerWidth: 1440, innerHeight: 900, addEventListener: listen(windowListeners) };
globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };

function dispatch(type, target, extra = {}) {
  const event = { type, target, relatedTarget: null, key: "", isComposing: false, keyCode: 0, ...extra };
  for (const listener of documentListeners.get(type) || []) listener(event);
}

function trigger({ text, rich = "", title = "", tone = "", rect }) {
  const node = new FakeNode("button");
  node.className = "tooltip-trigger";
  node.setAttribute("data-tooltip", text);
  node.setAttribute("aria-label", title || text);
  if (rich) node.setAttribute("data-tooltip-rich", rich);
  if (title) node.setAttribute("data-tooltip-title", title);
  if (tone) node.setAttribute("data-tooltip-tone", tone);
  node.rect = rect;
  body.append(node);
  return node;
}

function hover(node, from = null) {
  if (from) {
    hovered.delete(from);
    dispatch("pointerout", from, { relatedTarget: node });
  }
  hovered.add(node);
  dispatch("pointerover", node);
}

(async () => {
  const { installGlobalTooltips } = await import(pathToFileURL(path.join(root, "ui/tooltip.js")).href);
  installGlobalTooltips();

  const plain = trigger({ text: "Close", rect: { top: 100, left: 1200, width: 24, height: 24 } });
  const richList = trigger({
    text: "Settings exports include API profile keys.\nPocket exports include saved chat content.",
    rich: "list",
    title: "Sensitive export contents",
    tone: "warning",
    rect: { top: 180, left: 575, width: 24, height: 24 }
  });
  const richText = trigger({
    text: "First paragraph.\nSecond paragraph.",
    rich: "text",
    rect: { top: 100, left: 1380, width: 24, height: 24 }
  });
  const outside = new FakeNode("div");
  outside.rect = { top: 600, left: 600, width: 200, height: 40 };
  body.append(outside);

  hover(plain);
  const host = documentElement.querySelector(".global-tooltip");
  const label = host.querySelector(".global-tooltip-label");
  assert.ok(host.classList.contains("is-visible"));
  assert.equal(host.classList.contains("is-rich"), false, "a plain label tooltip must keep the label skin");
  assert.equal(label.textContent, "Close");
  assert.equal(label.children.length, 0);

  // Rich list card: title plus one bullet per \n line, card-skinned.
  label.rect = { top: 0, left: 0, width: 340, height: 180 };
  host.rect = label.rect;
  hover(richList, plain);
  assert.ok(host.classList.contains("is-visible"));
  assert.ok(host.classList.contains("is-rich"));
  assert.ok(host.classList.contains("is-warning"));
  assert.equal(label.querySelector(".global-tooltip-title").textContent, "Sensitive export contents");
  assert.deepEqual(
    label.querySelectorAll("li").map((item) => item.textContent),
    ["Settings exports include API profile keys.", "Pocket exports include saved chat content."]
  );
  assert.equal(host.dataset.side, "right", "a card with room beside its (i) must not cover the title line below it");
  assert.equal(host.style.left, `${575 + 24 + 8}px`);
  assert.equal(host.style.top, `${180 + 12 - 22}px`, "the arrow points at the trigger from the first text line");
  assert.equal(host.style["--tooltip-arrow-top"], "22px");

  // WCAG 1.4.13 hoverable: the pointer can leave the (i) for the card.
  hovered.delete(richList);
  dispatch("pointerout", richList, { relatedTarget: label });
  hovered.add(host);
  hovered.add(label);
  dispatch("pointerover", label);
  assert.ok(host.classList.contains("is-visible"), "moving onto the card must keep it open");
  hovered.delete(host);
  hovered.delete(label);
  dispatch("pointerover", outside);
  assert.equal(host.classList.contains("is-visible"), false, "leaving the card must close it");
  assert.ok(host.classList.contains("is-rich"), "a closing card keeps its skin through the fade-out");

  // A click pins it (touch has no hover); pressing the (i) must not wipe it first.
  hover(richList);
  dispatch("pointerdown", richList);
  assert.ok(host.classList.contains("is-visible"), "pressing a rich (i) must not dismiss its card");
  dispatch("click", richList);
  hovered.delete(richList);
  dispatch("pointerout", richList, { relatedTarget: outside });
  dispatch("pointerover", outside);
  assert.ok(host.classList.contains("is-visible"), "a pinned card outlives the pointer");
  dispatch("keydown", outside, { key: "Escape" });
  assert.equal(host.classList.contains("is-visible"), false, "Escape dismisses a pinned card");

  dispatch("pointerdown", richList);
  dispatch("click", richList);
  assert.ok(host.classList.contains("is-visible"));
  dispatch("pointerdown", outside);
  assert.equal(host.classList.contains("is-visible"), false, "an outside press dismisses a pinned card");

  dispatch("pointerdown", richList);
  dispatch("click", richList);
  dispatch("pointerdown", richList);
  dispatch("click", richList);
  assert.equal(host.classList.contains("is-visible"), false, "a second click on the (i) closes its card");

  // Paragraph card with no room on the right drops below, start-aligned and clamped.
  hover(richText);
  assert.ok(host.classList.contains("is-rich"));
  assert.equal(host.classList.contains("is-warning"), false);
  assert.equal(label.querySelector(".global-tooltip-title"), null);
  assert.deepEqual(
    label.querySelectorAll("p").map((item) => item.textContent),
    ["First paragraph.", "Second paragraph."]
  );
  assert.equal(host.dataset.side, "bottom");
  assert.equal(host.style.top, `${100 + 24 + 8}px`);
  assert.equal(host.style.left, `${1440 - 340 - 8}px`);

  // Back to a plain tooltip: the label skin and plain text return.
  hover(plain, richText);
  assert.equal(host.classList.contains("is-rich"), false);
  assert.equal(label.textContent, "Close");
  assert.equal(label.children.length, 0);
  dispatch("pointerdown", plain);
  assert.equal(host.classList.contains("is-visible"), false, "pressing a plain trigger still clears its tooltip");

  console.log("rich tooltip tests passed");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
