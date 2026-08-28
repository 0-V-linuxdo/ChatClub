#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const load = (file) => import(`${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}`);

function fakeNode(props = {}) {
  const width = props.width || 120;
  const height = props.height || 40;
  const top = props.top ?? 0;
  const left = props.left ?? 0;
  return {
    style: {
      visibility: "",
      setProperty(name, value) { this[name] = String(value); },
      removeProperty(name) { this[name] = ""; }
    },
    scrollLeft: 0,
    scrollTop: 0,
    scrollHeight: props.scrollHeight || 800,
    scrollWidth: props.scrollWidth || 400,
    clientHeight: props.clientHeight || 400,
    clientWidth: props.clientWidth || 400,
    getBoundingClientRect: () => ({
      width,
      height,
      top,
      left,
      bottom: top + height,
      right: left + width
    }),
    ...props
  };
}

(async () => {
  const { createCaptureRuntime } = await load("content-src/shared/capture-runtime.js");
  const scroller = fakeNode({
    scrollHeight: 1200,
    clientHeight: 400,
    width: 400,
    height: 400
  });
  const sticky = fakeNode({ width: 80, height: 40, top: 0, left: 0 });
  const chrome = fakeNode({ width: 400, height: 48, top: 0, left: 0 });
  const modal = fakeNode({ width: 280, height: 240, top: 80, left: 60 });
  const win = {
    innerHeight: 400,
    innerWidth: 400,
    scrollX: 12,
    scrollY: 80,
    devicePixelRatio: 2,
    scrollTo(x, y) { win.scrollX = x; win.scrollY = y; scroller.scrollLeft = x; scroller.scrollTop = y; },
    getComputedStyle(node) {
      if (node === chrome) return { position: "fixed", overflowY: "visible" };
      if (node === sticky) return { position: "sticky", overflowY: "visible" };
      if (node === modal) return { position: "fixed", overflowY: "visible" };
      if (node === scroller) return { position: "static", overflowY: "scroll" };
      return { position: "static", overflowY: "visible" };
    },
    document: {
      scrollingElement: scroller,
      documentElement: scroller,
      body: scroller,
      querySelectorAll(selector) {
        if (selector.includes("role='log'")) return [scroller];
        return [chrome, sticky, modal, scroller];
      }
    }
  };
  const runtime = createCaptureRuntime(win);
  const start = runtime.captureStart();
  assert.equal(start.scrollY, 0);
  assert.equal(start.overlapPx, 64);
  assert.equal(chrome.style.visibility, "hidden");
  assert.equal(sticky.style.visibility, "");
  assert.equal(modal.style.visibility, "");
  const first = runtime.triggerScroll();
  assert.equal(first.scrollY, 336);
  const end = runtime.captureEnd();
  assert.equal(end.restored, true);
  assert.equal(win.scrollY, 80);
  assert.equal(chrome.style.visibility, "");
  console.log("capture runtime: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
