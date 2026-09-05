#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function userscriptBody() {
  const source = read("userscripts/notion.js");
  const header = source.match(/^(?:\/\/[^\n]*\n)+\s*/);
  assert.ok(header && /Summary userscript/.test(header[0]), "userscripts/notion.js: missing Summary userscript header");
  return source.slice(header[0].length).trim();
}

function visibleNode(id) {
  return {
    id,
    nodeType: 1,
    tagName: "DIV",
    getAttribute() {
      return "";
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 400, bottom: 80, width: 400, height: 80 };
    }
  };
}

async function runNotion({ generating = false } = {}) {
  const rootNode = visibleNode("root");
  const copyButton = {
    id: "copy-assistant",
    tagName: "BUTTON",
    getAttribute(name) {
      return name === "aria-label" ? "Copy response" : "";
    },
    getBoundingClientRect() {
      return { left: 24, top: 48, right: 56, bottom: 76, width: 32, height: 28 };
    },
    textContent: "Copy response"
  };
  let copied = 0;
  let revealed = 0;
  const api = {
    normalize: (value) => String(value || "").trim(),
    qsa(selector) {
      if (String(selector).includes("button")) {
        assert.equal(generating, false, "generating Notion collection must not query copy controls");
        return [copyButton];
      }
      return [rootNode];
    },
    closest(_el, selector) {
      const parts = String(selector || "").split(",").map((part) => part.trim());
      return parts.includes("table") ? { id: "table" } : null;
    },
    text() {
      return "深入搜索:\n星球大战 小说\n2 steps\nLoading web page: www.reddit.com";
    },
    conversationIsGenerating() {
      return generating;
    },
    reveal() {
      revealed += 1;
    },
    async sleep() {},
    async copy() {
      copied += 1;
      return "partial research log";
    },
    merge(messages) {
      return Array.isArray(messages) ? messages : [];
    },
    async extractNativeCopyConversation() {
      copied += 1;
      return [{ role: "user", content: "prompt" }, { role: "assistant", content: "partial research log" }];
    }
  };
  const context = vm.createContext({
    document: rootNode,
    getComputedStyle() {
      return { display: "block", visibility: "visible" };
    },
    api
  });
  const runner = vm.runInContext(`(async function (api) {\n${userscriptBody()}\n})`, context, {
    filename: "userscripts/notion.js"
  });
  const result = await runner(api);
  return { result: JSON.parse(JSON.stringify(result || [])), copied, revealed };
}

(async () => {
  const streaming = await runNotion({ generating: true });
  assert.deepEqual(streaming.result, []);
  assert.equal(streaming.copied, 0, "research/loading-web-page must not click Copy or native extract");
  assert.equal(streaming.revealed, 0, "research/loading-web-page must not hover reveal controls");

  const idle = await runNotion({ generating: false });
  assert.equal(idle.copied >= 1, true, "idle Notion collection may click Copy even next to a Fable table");
  assert.equal(idle.revealed >= 1, true, "idle Notion collection may reveal Copy");

  const fallbackApi = {
    normalize: (value) => String(value || "").trim(),
    qsa(selector) {
      if (String(selector).includes("button")) return [];
      return [visibleNode("root")];
    },
    closest() {
      return null;
    },
    text() {
      return [
        "深入搜索:",
        "ZXQIDLE1406 星球大战 小说",
        "17 steps",
        "Noodling",
        "Loaded web page: www.goodreads.com/list/show/1108",
        "Searched the web",
        "入门首选一览",
        "Heir to the Empire Timothy Zahn 4.18 (106,528)",
        "Do anything with AI..."
      ].join("\n");
    },
    conversationIsGenerating() {
      return false;
    },
    reveal() {},
    async sleep() {},
    async copy() {
      throw new Error("fallback must not copy");
    },
    merge(messages) {
      return Array.isArray(messages) ? messages : [];
    },
    async extractNativeCopyConversation() {
      return null;
    }
  };
  const fallbackContext = vm.createContext({
    document: visibleNode("root"),
    getComputedStyle() {
      return { display: "block", visibility: "visible" };
    },
    api: fallbackApi
  });
  const fallbackRunner = vm.runInContext(`(async function (api) {\n${userscriptBody()}\n})`, fallbackContext, {
    filename: "userscripts/notion.js"
  });
  const fallback = JSON.parse(JSON.stringify(await fallbackRunner(fallbackApi) || []));
  const fallbackText = (item) => String(item?.content || item?.text || "");
  assert.equal(fallback.some((item) => item.role === "user" && /ZXQIDLE1406/.test(fallbackText(item))), true);
  assert.equal(
    fallback.some((item) => item.role === "user" && /深入搜索/.test(fallbackText(item))),
    true,
    "idle Notion fallback must keep the leading 深入搜索 line with the rest of the prompt"
  );
  assert.equal(
    fallback.some((item) => item.role === "assistant" && /入门首选一览/.test(fallbackText(item)) && /106,528/.test(fallbackText(item))),
    true
  );
  assert.equal(fallback.some((item) => /Loaded web page/.test(fallbackText(item))), false, "research log lines must not become the captured answer");

  const multilineApi = {
    ...fallbackApi,
    text() {
      return [
        "深入搜索:",
        "Star Wars 小说",
        "要求：根据读者评价，给出推荐！",
        "星球大战小说推荐",
        "根据 Reddit 社区和 Goodreads 读者评价给出推荐。"
      ].join("\n");
    }
  };
  const multilineContext = vm.createContext({
    document: visibleNode("root"),
    getComputedStyle() {
      return { display: "block", visibility: "visible" };
    },
    api: multilineApi
  });
  const multilineRunner = vm.runInContext(`(async function (api) {\n${userscriptBody()}\n})`, multilineContext, {
    filename: "userscripts/notion.js"
  });
  const multiline = JSON.parse(JSON.stringify(await multilineRunner(multilineApi) || []));
  const multilineUser = fallbackText(multiline.find((item) => item.role === "user") || {});
  assert.match(multilineUser, /Star Wars 小说/);
  assert.match(multilineUser, /根据读者评价/);
  assert.equal(
    multiline.some((item) => item.role === "assistant" && /Goodreads/.test(fallbackText(item))),
    true,
    "a completed Notion page without a steps marker must still capture the assistant body"
  );

  const runtime = read("content-src/shared/summary-runtime.js");
  const liveBusyMatch = runtime.match(/function liveBusyStatusLine\(value\) \{[\s\S]*?\n\}/);
  assert.ok(liveBusyMatch, "liveBusyStatusLine must exist");
  const liveBusyStatusLine = vm.runInContext(
    `${liveBusyMatch[0]}\nliveBusyStatusLine`,
    vm.createContext({
      normalize: (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
    })
  );
  assert.equal(liveBusyStatusLine("Loading web page: www.reddit.com"), true);
  assert.equal(liveBusyStatusLine("Searching the web"), true);
  assert.equal(liveBusyStatusLine("Preparing..."), true);
  assert.equal(liveBusyStatusLine("Crafting >"), true, "live Fable Crafting must still look generating");
  assert.equal(liveBusyStatusLine("Noodling"), true);
  assert.equal(liveBusyStatusLine("Lost Stars is a good start."), false);
  assert.equal(liveBusyStatusLine("Loaded web page: www.reddit.com"), false, "completed tool traces must not look live");
  assert.equal(liveBusyStatusLine("Searched the web"), false, "completed searches must not look live");
  const toolActivityStart = runtime.indexOf("function conversationSampleRoot");
  const toolActivityEnd = runtime.indexOf("function nodeLooksLikeStreamingTurn");
  assert.ok(toolActivityStart >= 0 && toolActivityEnd > toolActivityStart, "conversation line sampling must exist");
  const toolActivitySrc = runtime.slice(toolActivityStart, toolActivityEnd);
  assert.doesNotMatch(toolActivitySrc, /aria-busy/, "finished Fable chrome must not look generating via leftover aria-busy");
  assert.match(toolActivitySrc, /slice\(-12\)/, "historical Loading traces above a finished Fable table must not occupy a 48-line window");
  assert.match(toolActivitySrc, /textContent/, "fingerprint sampling must not layout the whole Notion innerText tree");
  const streamingStart = runtime.indexOf("function lastAssistantTurnIsStreaming");
  const streamingEnd = runtime.indexOf("function conversationIsGenerating");
  assert.ok(streamingStart >= 0 && streamingEnd > streamingStart, "lastAssistantTurnIsStreaming must exist");
  assert.doesNotMatch(
    runtime.slice(streamingStart, streamingEnd),
    /querySelector/,
    "leftover nested aria-busy on a finished Fable turn must not keep generating"
  );
  const completedStart = runtime.indexOf("function completedToolStatusLine");
  assert.ok(completedStart >= 0 && completedStart < toolActivityStart, "completedToolStatusLine must exist");
  const completedSrc = runtime.slice(completedStart, toolActivityStart);
  function toolActivityFor(innerText) {
    const fn = vm.runInContext(
      `${liveBusyMatch[0]}\n${completedSrc}\n${toolActivitySrc}\nconversationToolActivityIsActive`,
      vm.createContext({
        normalize: (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(),
        qs() { return null; },
        document: { body: { innerText, textContent: innerText } }
      })
    );
    return fn();
  }
  assert.equal(
    toolActivityFor([
      "深入搜索:",
      "ZXQIDLE1406 星球大战 小说",
      "Loading web page: www.goodreads.com/list/show/1108",
      "Do you trust www.goodreads.com?",
      "Allow once"
    ].join("\n")),
    true,
    "live Loading web page plus trust dialog must still look generating"
  );
  const finishedLines = [
    "深入搜索:",
    "ZXQIDLE1406 星球大战 小说",
    "17 steps",
    "Noodling",
    "Loading web page: www.goodreads.com/list/show/1108",
    "Loaded web page: www.goodreads.com/list/show/1108",
    "Searched the web"
  ];
  for (let index = 0; index < 20; index += 1) {
    finishedLines.push(`帝国传承 Heir to the Empire Timothy Zahn 4.18 (106,528) row ${index}`);
  }
  finishedLines.push("入门首选一览", "Do anything with AI...");
  assert.equal(
    toolActivityFor(finishedLines.join("\n")),
    false,
    "historical Loading web page above a finished Fable table must not block idle capture"
  );
  assert.equal(
    toolActivityFor([
      "Loading web page: www.reddit.com",
      "Loaded web page: www.reddit.com",
      "入门首选一览",
      "Heir to the Empire Timothy Zahn 4.18 (106,528)"
    ].join("\n")),
    false,
    "a Loaded web page after Loading in the tail must not look live"
  );

  console.log("notion generation probe: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
