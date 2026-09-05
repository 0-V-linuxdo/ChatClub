#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function userscriptBody() {
  const source = read("userscripts/chatgpt.js");
  const header = source.match(/^(?:\/\/[^\n]*\n)+\s*/);
  assert.ok(header && /Summary userscript/.test(header[0]), "userscripts/chatgpt.js: missing Summary userscript header");
  return source.slice(header[0].length).trim();
}

function merge(messages) {
  const out = [];
  for (const message of messages || []) {
    const role = message?.role === "user" ? "user" : "assistant";
    const text = String(message?.text || "").trim();
    if (!text) continue;
    const previous = out[out.length - 1];
    if (previous?.role === role) previous.text = `${previous.text}\n\n${text}`;
    else out.push({ role, text });
  }
  return out;
}

function turnNode(id, role, top) {
  return {
    id,
    nodeType: 1,
    tagName: "DIV",
    getAttribute(name) {
      return name === "data-message-author-role" ? role : "";
    },
    contains(other) {
      return this === other;
    },
    getBoundingClientRect() {
      return { left: 0, top, right: 400, bottom: top + 80, width: 400, height: 80 };
    }
  };
}

function copyButton(id, role, payload, owner, top) {
  return {
    id,
    owner,
    copyPayload: payload,
    getAttribute(name) {
      if (name === "data-testid") return "copy-turn-action-button";
      if (name === "aria-label") return role === "user" ? "Copy message" : "Copy response";
      return "";
    },
    getBoundingClientRect() {
      return { left: 24, top: top + 48, right: 56, bottom: top + 76, width: 32, height: 28 };
    }
  };
}

async function runChatgpt({ generating = false } = {}) {
  const user = turnNode("user-1", "user", 0);
  const assistant = turnNode("assistant-1", "assistant", 120);
  const userCopy = copyButton("copy-user", "user", "Explain idle capture", user, 0);
  const assistantCopy = copyButton("copy-assistant", "assistant", "partial stream", assistant, 120);
  const copied = [];
  const api = {
    normalize: (value) => String(value || "").trim(),
    qsa(selector) {
      if (String(selector).includes("data-message-author-role")) return [user, assistant];
      if (String(selector).includes("copy-turn-action-button")) return [userCopy, assistantCopy];
      return [];
    },
    closest() {
      return null;
    },
    visible() {
      return true;
    },
    conversationIsGenerating() {
      return generating;
    },
    reveal() {},
    async sleep() {},
    async copy(button) {
      copied.push(button.id);
      return button.copyPayload;
    },
    merge
  };
  const context = vm.createContext({ document: {}, api });
  const runner = vm.runInContext(`(async function (api) {\n${userscriptBody()}\n})`, context, {
    filename: "userscripts/chatgpt.js"
  });
  const result = await runner(api);
  return { result: JSON.parse(JSON.stringify(result)), copied };
}

(async () => {
  const idle = await runChatgpt({ generating: false });
  assert.deepEqual(idle.copied, ["copy-user", "copy-assistant"]);
  assert.deepEqual(idle.result, [
    { role: "user", text: "Explain idle capture" },
    { role: "assistant", text: "partial stream" }
  ]);

  const streaming = await runChatgpt({ generating: true });
  assert.deepEqual(streaming.copied, ["copy-user"], "streaming last assistant must not click Copy");
  assert.deepEqual(streaming.result, []);

  const runtime = read("content-src/shared/summary-runtime.js");
  const chatgpt = read("userscripts/chatgpt.js");
  assert.match(runtime, /function conversationIsGenerating/);
  assert.match(runtime, /function controlLooksLikeStopGenerating/);
  assert.match(runtime, /function nodeLooksLikeStreamingTurn/);
  assert.match(runtime, /function controlLayoutVisible/);
  assert.match(runtime, /function conversationToolActivityIsActive/);
  assert.match(runtime, /function liveBusyStatusLine/);
  assert.match(runtime, /loading web page/);
  assert.match(runtime, /searching the web/);
  const toolActivityStart = runtime.indexOf("function conversationToolActivityFromLines");
  const toolActivityEnd = runtime.indexOf("function conversationToolActivityIsActive");
  assert.ok(toolActivityStart >= 0 && toolActivityEnd > toolActivityStart, "conversationToolActivityFromLines must exist");
  const toolActivitySrc = runtime.slice(toolActivityStart, toolActivityEnd);
  assert.doesNotMatch(toolActivitySrc, /aria-busy/, "header aria-busy leftover must not block idle capture");
  assert.match(toolActivitySrc, /slice\(-12\)/, "historical Loading traces must not use a 48-line generating window");
  assert.match(runtime, /if \(conversationIsGenerating\(\)\) return null;/);
  assert.match(runtime, /data-testid='stop-button'/);
  assert.match(runtime, /aria-label\*='stop' i/);
  assert.match(runtime, /result-streaming/);
  assert.match(runtime, /shouldRefuseLiveAssistantCopy\(button\)/);
  assert.match(chatgpt, /conversationIsGenerating/);
  assert.match(chatgpt, /lastAssistantNode/);
  const isolatedSummary = read("content-src/capabilities/summary-runtime.js");
  const mainSummary = read("content-src/summary-userscripts-main.js");
  assert.match(isolatedSummary, /stage: "generating"/);
  assert.match(mainSummary, /stage: "generating"/);
  const notion = read("userscripts/notion.js");
  assert.match(notion, /conversationIsGenerating\(\)\) return \[\]/);

  console.log("conversation generation probe: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
