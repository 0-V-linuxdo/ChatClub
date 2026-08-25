#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function nodeWithClass(className, parent = null) {
  const node = {
    classList: {
      contains(name) {
        return className.split(/\s+/).includes(name);
      }
    },
    closest(selector) {
      const names = String(selector || "").split(",").map((part) => part.trim().replace(/^\./, ""));
      for (let current = node; current; current = current.parent) {
        if (names.some((name) => current.classList.contains(name))) return current;
      }
      return null;
    },
    parent
  };
  return node;
}

(async () => {
  const previousDocument = global.document;
  const previousWindow = global.window;
  const fakeDocument = {
    body: {},
    activeElement: null,
    hasFocus() {
      return fakeDocument._hasFocus === true;
    },
    _hasFocus: false
  };
  global.document = fakeDocument;
  global.window = { document: fakeDocument };

  try {
    const moduleUrl = `${pathToFileURL(path.join(root, "ui/dom.js")).href}?frame-isolation=${Date.now()}`;
    const { isChatFrameNode, scheduleFrameOwnedBlurDismissal } = await import(moduleUrl);

    const iframe = nodeWithClass("chat-frame");
    const wrap = nodeWithClass("chat-frame-wrap");
    const inner = nodeWithClass("other", wrap);
    const button = nodeWithClass("tab-add");

    assert.equal(isChatFrameNode(iframe), true, "the iframe element itself is frame-owned");
    assert.equal(isChatFrameNode(wrap), true, "the frame wrap is frame-owned");
    assert.equal(isChatFrameNode(inner), true, "descendants of the frame wrap are frame-owned");
    assert.equal(isChatFrameNode(button), false, "plugin chrome is not frame-owned");
    assert.equal(isChatFrameNode(fakeDocument), false);
    assert.equal(isChatFrameNode(global.window), false);
    assert.equal(isChatFrameNode(null), false);

    fakeDocument._hasFocus = true;
    fakeDocument.activeElement = iframe;
    let dismissed = false;
    scheduleFrameOwnedBlurDismissal(() => true, () => { dismissed = true; });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.equal(dismissed, false, "nested iframe focus must keep the parent window focused");

    fakeDocument._hasFocus = false;
    fakeDocument.activeElement = iframe;
    dismissed = false;
    scheduleFrameOwnedBlurDismissal(() => true, () => { dismissed = true; });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.equal(dismissed, false, "activeElement in an iframe must not look like a real window blur");

    fakeDocument._hasFocus = false;
    fakeDocument.activeElement = button;
    dismissed = false;
    scheduleFrameOwnedBlurDismissal(() => true, () => { dismissed = true; });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.equal(dismissed, true, "leaving the window entirely must still dismiss popovers");
  } finally {
    global.document = previousDocument;
    global.window = previousWindow;
  }

  const workspaceSource = read("app/workspace/view-controller.js");
  assert.match(workspaceSource, /function closePopoverOnWindowBlur\(/);
  assert.match(workspaceSource, /function armWorkspacePopoverDismissal\(/);
  assert.doesNotMatch(
    workspaceSource,
    /window\.addEventListener\("blur", closePopovers/,
    "workspace popovers must not close on raw window blur from iframe navigation"
  );

  const css = read("styles/chatclub.css");
  assert.match(
    css,
    /body\.tab-dragging iframe,\s*body\.workspace-popover-open iframe\s*\{\s*pointer-events: none;/,
    "an open workspace popover must reuse the drag pointer shield"
  );

  console.log("workspace popover frame isolation: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
