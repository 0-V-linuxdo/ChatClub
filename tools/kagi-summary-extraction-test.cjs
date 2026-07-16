#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function userscriptBody() {
  const source = fs.readFileSync(path.join(root, "userscripts/kagi.js"), "utf8").replace(/\r\n?/g, "\n");
  const header = source.match(/^(?:\/\/[^\n]*\n)+\s*/);
  assert.ok(header && /Summary userscript/.test(header[0]), "userscripts/kagi.js: missing Summary userscript header");
  return source.slice(header[0].length).trim();
}

function normalize(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function merge(messages) {
  const out = [];
  for (const message of messages || []) {
    const role = message?.role === "user" ? "user" : "assistant";
    const text = normalize(message?.text || "");
    if (!text) continue;
    const previous = out[out.length - 1];
    if (previous?.role === role) previous.text = normalize(`${previous.text}\n\n${text}`);
    else out.push({ role, text });
  }
  return out;
}

function messageOwner(id, role, { explicitRole = false } = {}) {
  const className = role === "user" ? "message-user conversation-turn" : role === "assistant" ? "message-ai conversation-turn" : "conversation-turn";
  const attributes = new Map([["class", className]]);
  if (explicitRole && role) attributes.set("data-message-author-role", role);
  return {
    nodeType: 1,
    tagName: "ARTICLE",
    id,
    getAttribute(name) {
      return attributes.get(String(name)) || null;
    }
  };
}

function copyButton(id, index, label, payload, owner) {
  const attributes = new Map([["aria-label", label]]);
  return {
    nodeType: 1,
    tagName: "BUTTON",
    id,
    index,
    owner,
    copyPayload: payload,
    innerText: label,
    textContent: label,
    getAttribute(name) {
      return attributes.get(String(name)) || null;
    },
    getBoundingClientRect() {
      return { left: 100, top: index * 40, right: 132, bottom: index * 40 + 28, width: 32, height: 28 };
    },
    compareDocumentPosition(other) {
      if (this.index === other.index) return 0;
      return this.index < other.index ? 4 : 2;
    }
  };
}

async function execute(buttons) {
  const copied = [];
  const pageRoot = { nodeType: 1 };
  const api = {
    normalize,
    qs() {
      return pageRoot;
    },
    qsa(selector) {
      return selector === "button,[role=button]" ? buttons : [];
    },
    closest(node, selector) {
      return String(selector).includes("article.message-user") ? node?.owner || null : null;
    },
    visible() {
      return true;
    },
    async copy(button) {
      copied.push(button.id);
      return button.copyPayload;
    },
    async sleep() {},
    merge
  };
  const context = vm.createContext({
    document: {},
    Node: { DOCUMENT_POSITION_PRECEDING: 2, DOCUMENT_POSITION_FOLLOWING: 4 },
    getComputedStyle() {
      return { display: "block", visibility: "visible" };
    }
  });
  const runner = vm.runInContext(`(async function (api) {\n${userscriptBody()}\n})`, context, {
    filename: "userscripts/kagi.js"
  });
  const result = await runner(api);
  return { result: JSON.parse(JSON.stringify(result)), copied };
}

(async () => {
  const repeatUserOne = messageOwner("repeat-user-1", "user");
  const repeatAssistantOne = messageOwner("repeat-assistant-1", "assistant");
  const repeatUserTwo = messageOwner("repeat-user-2", "user");
  const repeatAssistantTwo = messageOwner("repeat-assistant-2", "assistant");
  const repeated = await execute([
    copyButton("repeat-user-1", 0, "Copy message", "same prompt", repeatUserOne),
    copyButton("references", 1, "Copy references to clipboard", "reference payload", repeatAssistantOne),
    copyButton("repeat-assistant-1", 2, "Copy message", "same answer", repeatAssistantOne),
    copyButton("repeat-user-2", 3, "Copy message", "same prompt", repeatUserTwo),
    copyButton("repeat-assistant-2", 4, "Copy message", "same answer", repeatAssistantTwo)
  ]);
  assert.deepEqual(repeated.copied, [
    "repeat-user-1",
    "repeat-assistant-1",
    "repeat-user-2",
    "repeat-assistant-2"
  ]);
  assert.deepEqual(repeated.result, [
    { role: "user", text: "same prompt" },
    { role: "assistant", text: "same answer" },
    { role: "user", text: "same prompt" },
    { role: "assistant", text: "same answer" }
  ]);

  const failedCopy = await execute([
    copyButton("failure-user-1", 0, "Copy message", "first prompt", messageOwner("failure-owner-1", null)),
    copyButton("failure-assistant-1", 1, "Copy message", "", messageOwner("failure-owner-2", null)),
    copyButton("failure-user-2", 2, "Copy message", "second prompt", messageOwner("failure-owner-3", null)),
    copyButton("failure-assistant-2", 3, "Copy message", "second answer", messageOwner("failure-owner-4", null))
  ]);
  assert.deepEqual(failedCopy.result, [
    { role: "user", text: "first prompt\n\nsecond prompt" },
    { role: "assistant", text: "second answer" }
  ]);

  const localized = await execute([
    copyButton("localized-user", 0, "复制消息", "中文问题", messageOwner("localized-user-owner", "user", { explicitRole: true })),
    copyButton("localized-reference", 1, "复制引用", "引用内容", messageOwner("localized-assistant-owner", "assistant")),
    copyButton("localized-assistant", 2, "拷贝讯息", "中文回答", messageOwner("localized-assistant-owner", "assistant"))
  ]);
  assert.deepEqual(localized.copied, ["localized-user", "localized-assistant"]);
  assert.deepEqual(localized.result, [
    { role: "user", text: "中文问题" },
    { role: "assistant", text: "中文回答" }
  ]);

  const responsiveUserOwner = messageOwner("responsive-user-owner", "user");
  const responsiveAssistantOwner = messageOwner("responsive-assistant-owner", "assistant");
  const responsive = await execute([
    copyButton("responsive-user-primary", 0, "Copy message", "responsive prompt", responsiveUserOwner),
    copyButton("responsive-user-clone", 1, "Copy message", "responsive prompt", responsiveUserOwner),
    copyButton("responsive-assistant-primary", 2, "Copy message", "responsive answer", responsiveAssistantOwner),
    copyButton("responsive-assistant-clone", 3, "Copy message", "responsive answer", responsiveAssistantOwner)
  ]);
  assert.deepEqual(responsive.copied, ["responsive-user-primary", "responsive-assistant-primary"]);
  assert.deepEqual(responsive.result, [
    { role: "user", text: "responsive prompt" },
    { role: "assistant", text: "responsive answer" }
  ]);

  const singleRole = await execute([
    copyButton("single-user", 0, "Copy message", "unpaired prompt", messageOwner("single-user-owner", "user"))
  ]);
  assert.deepEqual(singleRole.result, []);

  console.log("Kagi Summary owner-based extraction acceptance passed.");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
