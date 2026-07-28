#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "content-src/preload.js"), "utf8");
const cleanupSource = functionSource(source, "stripNotionFrameLoadNonceFromLocation");
const NONCE = `ccn-${"a".repeat(32)}`;
const PARAM = "__chatclub_frame_load_nonce";

function run(href, { framed = true } = {}) {
  const calls = [];
  let patchedCalls = 0;
  function History() {}
  const location = { href };
  History.prototype.replaceState = function nativeReplaceState(state, title, url) {
    calls.push({ owner: this, state, title, url });
    location.href = String(url);
  };
  const history = new History();
  history.state = { preserved: true };
  history.replaceState = () => { patchedCalls += 1; };
  const window = {};
  window.parent = framed ? {} : window;
  const context = vm.createContext({ History, Object, Reflect, URL, history, location, window });
  vm.runInContext(`${cleanupSource}\nglobalThis.result = stripNotionFrameLoadNonceFromLocation();`, context);
  return { calls, href: location.href, patchedCalls, result: context.result };
}

{
  const result = run(`https://app.notion.com/ai?mode=new&${PARAM}=${NONCE}&keep=1#composer`);
  assert.equal(result.result, true);
  assert.equal(result.calls.length, 1);
  assert.equal(result.patchedCalls, 0, "cleanup must call the native History prototype method");
  assert.equal(result.calls[0].state.preserved, true);
  assert.equal(result.calls[0].title, "");
  assert.equal(result.href, "https://app.notion.com/ai?mode=new&keep=1#composer");
}

for (const [label, href, options] of [
  ["top-level page", `https://app.notion.com/ai?${PARAM}=${NONCE}`, { framed: false }],
  ["wrong host", `https://www.notion.so/ai?${PARAM}=${NONCE}`],
  ["host suffix", `https://app.notion.com.evil.test/ai?${PARAM}=${NONCE}`],
  ["wrong protocol", `http://app.notion.com/ai?${PARAM}=${NONCE}`],
  ["invalid nonce", `https://app.notion.com/ai?${PARAM}=ccn-short`],
  ["duplicate nonce", `https://app.notion.com/ai?${PARAM}=${NONCE}&${PARAM}=${NONCE}`],
  ["missing nonce", "https://app.notion.com/ai?mode=new"]
]) {
  const result = run(href, options);
  assert.equal(result.result, false, `${label} must not rewrite history`);
  assert.equal(result.calls.length, 0);
}

assert.ok(
  source.indexOf('if (framed && host === "app.notion.com") stripNotionFrameLoadNonceFromLocation()')
    < source.indexOf('runtimes.install("preload-root"'),
  "the nonce must be removed before preload activation and the location bridge"
);
assert.ok(
  source.indexOf('if (framed && host === "app.notion.com") stripNotionFrameLoadNonceFromLocation()')
    < source.indexOf("installMainWorldLocationBridge();"),
  "the location bridge must initialize from the clean logical URL"
);

console.log("Notion frame document-start nonce cleanup: ok");
