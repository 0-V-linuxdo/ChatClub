#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const contentSource = fs.readFileSync(path.join(root, "content/content.js"), "utf8");
const postMessageSource = fs.readFileSync(path.join(root, "shared/post-message.js"), "utf8");

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const nextMarkers = [`async function ${nextName}(`, `function ${nextName}(`];
  const end = nextMarkers
    .map((marker) => source.indexOf(marker, start))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? -1;
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end).trim();
}

const clickFunctionSource = extractFunction(contentSource, "clickPromptSubmit", "waitForPromptSubmitReady");
const context = vm.createContext({
  MouseEvent: class MouseEvent {
    constructor(type) { this.type = type; }
  },
  window: {}
});
vm.runInContext(`${clickFunctionSource}; globalThis.clickPromptSubmit = clickPromptSubmit;`, context);

const activations = [];
const button = {
  scrollIntoView() {},
  focus() {},
  click() { activations.push("click"); },
  dispatchEvent(event) { activations.push(event.type); return true; }
};

assert.equal(context.clickPromptSubmit(button), true);
assert.deepEqual(activations, ["click"], "one submit call must produce exactly one click activation");

const fallbackActivations = [];
const fallbackButton = {
  scrollIntoView() {},
  focus() {},
  dispatchEvent(event) { fallbackActivations.push(event.type); return true; }
};
assert.equal(context.clickPromptSubmit(fallbackButton), true);
assert.deepEqual(fallbackActivations, ["click"], "fallback activation must also dispatch exactly one click");

const contentSendSource = contentSource.match(/const SEND_TEXT_POST_MESSAGE_SOURCE = "([^"]+)";/)?.[1];
const parentSendSource = postMessageSource.match(/export const SEND_TEXT_POST_MESSAGE_SOURCE = "([^"]+)";/)?.[1];
assert.ok(contentSendSource, "content send source must exist");
assert.equal(contentSendSource, parentSendSource, "parent and content send channel versions must stay synchronized");
assert.match(
  contentSource,
  /if \(versionedSendTextRequest && !contentBridgeIsCurrent\(\)\) return;/,
  "superseded content bridges must ignore sendText requests"
);
assert.match(
  contentSource,
  /window\.__CHATCLUB_SEND_TEXT_REQUEST_CACHE__ = sendTextRequestCache;/,
  "send request deduplication cache must survive bridge reinjection"
);

console.log("send-text single-submit regression: ok");
