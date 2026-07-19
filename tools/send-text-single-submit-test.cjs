#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sendCapabilitySource = fs.readFileSync(path.join(root, "content-src/capabilities/send-runtime.js"), "utf8");
const contentEntrySource = fs.readFileSync(path.join(root, "content-src/content.js"), "utf8");
const frameCommandsSource = fs.readFileSync(path.join(root, "shared/frame-commands.js"), "utf8");
const frameRpcSource = fs.readFileSync(path.join(root, "shared/frame-rpc.js"), "utf8");
const protocolSource = fs.readFileSync(path.join(root, "shared/protocol.js"), "utf8");

function protocolString(source, name, declaration) {
  const match = source.match(new RegExp(`${declaration}\\s*("(?:[^"\\\\]|\\\\.)*")`));
  assert.ok(match, `${name} must exist in its protocol source`);
  return JSON.parse(match[1]);
}

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

const clickFunctionSource = extractFunction(sendCapabilitySource, "clickPromptSubmit", "waitForPromptSubmitReady");
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

const sendTextSource = protocolString(
  protocolSource,
  "SEND_TEXT_POST_MESSAGE_SOURCE",
  "(?:export\\s+)?const SEND_TEXT_POST_MESSAGE_SOURCE\\s*=\\s*"
);
assert.equal(typeof sendTextSource, "string");
assert.match(
  contentEntrySource,
  /import\s*\{\s*CONTENT_PROTOCOL\s*\}\s*from "\.\.\/shared\/protocol\.js";/,
  "isolated content source must import the shared protocol"
);
assert.match(
  contentEntrySource,
  /const SEND_TEXT_POST_MESSAGE_SOURCE = PROTOCOL\.SEND_TEXT_POST_MESSAGE_SOURCE;/,
  "isolated content source must consume the shared send channel"
);
assert.match(frameCommandsSource, /sendText:\s*command\(\{[^}]*mutating:\s*true/, "sendText must be an exactly-once frame command");
assert.match(frameRpcSource, /BACKGROUND_REQUEST_ACTIONS\.SEND_FRAME_COMMAND/, "parent messaging must use typed authenticated Frame RPC");
assert.doesNotMatch(frameRpcSource, /action:\s*"sendFrameCommand"/, "Frame RPC must not bypass the typed background client");
assert.match(
  contentEntrySource,
  /if \(!contentBridgeIsCurrent\(\)\) return;/,
  "superseded content bridges must ignore every parent-window request"
);
assert.match(
  contentEntrySource,
  /runtimes\.install\("parent-window-rpc", CONTENT_BRIDGE_VERSION/,
  "parent-window requests must use the disposable runtime registry"
);
assert.match(
  sendCapabilitySource,
  /window\.__CHATCLUB_SEND_TEXT_REQUEST_CACHE__ = sendTextRequestCache;/,
  "send request deduplication cache must survive bridge reinjection"
);

console.log("send-text single-submit regression: ok");
