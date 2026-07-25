#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sendCapabilitySource = fs.readFileSync(path.join(root, "content-src/capabilities/send-runtime.js"), "utf8");
const notionSendSource = fs.readFileSync(path.join(root, "content-src/preload/notion-send.js"), "utf8");
const notionUtilsSource = fs.readFileSync(path.join(root, "content-src/preload/notion-utils.js"), "utf8");
const composerSource = fs.readFileSync(path.join(root, "app/composer/controller.js"), "utf8");
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
  return source.slice(start, end).trim().replace(/\bexport\s*$/, "");
}

function extractConstFunction(source, name, nextName) {
  const start = source.indexOf(`const ${name} =`);
  const end = source.indexOf(`const ${nextName} =`, start);
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

const notionClickFunctionSource = extractConstFunction(notionSendSource, "clickElement", "pressEnter");
const notionClickContext = vm.createContext({
  MouseEvent: class MouseEvent {
    constructor(type) { this.type = type; }
  },
  window: {}
});
vm.runInContext(`${notionClickFunctionSource}; globalThis.clickElement = clickElement;`, notionClickContext);
const notionEvents = [];
let notionSemanticClicks = 0;
const notionButton = {
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 40, height: 40 }),
  scrollIntoView() {},
  dispatchEvent(event) { notionEvents.push(event.type); return true; },
  click() { notionSemanticClicks += 1; }
};
assert.equal(notionClickContext.clickElement(notionButton), true);
assert.equal(notionSemanticClicks, 1, "Notion button activation must call click() exactly once");
assert.equal(notionEvents.filter((type) => type === "click").length, 0, "Notion hover preparation must not dispatch a second click event");
const notionFallbackEvents = [];
assert.equal(notionClickContext.clickElement({
  getBoundingClientRect: notionButton.getBoundingClientRect,
  scrollIntoView() {},
  dispatchEvent(event) { notionFallbackEvents.push(event.type); return true; }
}), true);
assert.equal(notionFallbackEvents.filter((type) => type === "click").length, 1, "Notion fallback activation must dispatch one click");

const genericDeadlineContext = vm.createContext({ Date: { now: () => 1000 } });
vm.runInContext(`${extractFunction(sendCapabilitySource, "sendDeadlineAt", "remainingDeadlineMs")}; globalThis.deadline = sendDeadlineAt;`, genericDeadlineContext);
assert.equal(genericDeadlineContext.deadline({ deadlineAt: 500 }, 10000), 500, "an expired generic deadline must not be renewed");
assert.equal(genericDeadlineContext.deadline({}, 10000), 11000, "a missing generic deadline may use the bounded fallback");
const notionDeadlineContext = vm.createContext({ Date: { now: () => 1000 } });
vm.runInContext(`${extractFunction(notionUtilsSource, "deadlineFromPayload", "remainingDeadlineMs")}; globalThis.deadline = deadlineFromPayload;`, notionDeadlineContext);
assert.equal(notionDeadlineContext.deadline({ deadlineAt: 500 }, 10000), 500, "an expired Notion deadline must not be renewed");
assert.equal(notionDeadlineContext.deadline({}, 10000), 11000, "a missing Notion deadline may use the bounded fallback");

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
assert.match(
  sendCapabilitySource,
  /let deliveryState = "not-sent";[\s\S]*deliveryState = "unknown";[\s\S]*deliveryState: "sent"/,
  "generic send must distinguish pre-activation failure, uncertain activation, and accepted activation"
);
assert.match(
  notionSendSource,
  /withDeliveryState\("not-sent"[\s\S]*sendNotionMessage[\s\S]*withDeliveryState\("unknown"/,
  "Notion must report pre-activation failures separately from post-activation verification failures"
);
assert.match(
  sendCapabilitySource,
  /preparePromptComposerForRun\([\s\S]*clearPromptAttachments\([\s\S]*waitForPromptAttachmentsCleared\([\s\S]*setInputValue\(input, ""\)/,
  "every generic queued send must clear residual attachments and text before applying its frozen snapshot"
);
assert.match(
  sendCapabilitySource,
  /function promptTextSnapshot\([\s\S]*replace\(\/\\u00a0\/g[\s\S]*replace\(\/\\r\\n\?\/g[\s\S]*\.trim\(\)/,
  "generic sends must compare pasted text without discarding case or internal whitespace"
);
assert.doesNotMatch(
  sendCapabilitySource,
  /compareText/,
  "frozen prompt checks must not use the case-and-whitespace-insensitive Summary comparator"
);
assert.match(
  notionSendSource,
  /const prepareComposerForRun = async[\s\S]*clearAttachments\(editor\)[\s\S]*attachmentSnapshot\(editor\)[\s\S]*!hasNotionUploadInProgress\(editor\)[\s\S]*clearEditorText\(editor\)[\s\S]*!editorText\(editor\)/,
  "Notion composer preparation must verify that residual attachments and text were removed"
);
assert.match(
  notionSendSource,
  /const sendNotionText = async[\s\S]*prepareComposerForRun\(editor, deadlineAt\)[\s\S]*setEditorText\(editor, text\)/,
  "Notion text-only sends must prepare the same isolated composer state as image sends"
);
assert.match(
  composerSource,
  /result\?\.sent === true && result\?\.deliveryState === "sent"[\s\S]*result\?\.sent === false && result\?\.deliveryState === "not-sent"[\s\S]*SEND_REJECTED[\s\S]*SEND_DELIVERY_UNKNOWN/,
  "Composer must accept only explicit sent delivery and continue a frame queue only after explicit not-sent delivery"
);

console.log("send-text single-submit regression: ok");
