#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const historySource = fs.readFileSync(path.join(root, "app/settings/history.js"), "utf8");
const modelSource = fs.readFileSync(path.join(root, "app/history/model.js"), "utf8");
const panelSource = fs.readFileSync(path.join(root, "app/history/controller.js"), "utf8");
const runtimeSource = fs.readFileSync(path.join(root, "app/runtime.js"), "utf8");
const controllerSource = fs.readFileSync(path.join(root, "app/settings/controller.js"), "utf8");
const i18nSource = fs.readFileSync(path.join(root, "shared/i18n.js"), "utf8");

(async () => {
  const {
    groupPromptHistory,
    promptHistoryGroupId,
    promptHistoryMatchesSearch,
    promptHistoryMessageKey,
    promptHistoryPocketPages,
    promptHistoryPocketSaved
  } = await import(moduleUrl("app/history/model.js"));
  const now = new Date(2026, 7, 8, 12, 0, 0).getTime();
  const dateDaysAgo = (daysAgo, hour = 12) => new Date(2026, 7, 8 - daysAgo, hour, 0, 0).toISOString();

  assert.equal(promptHistoryGroupId(dateDaysAgo(0, 0), now), "today");
  assert.equal(promptHistoryGroupId(dateDaysAgo(1, 23), now), "yesterday");
  assert.equal(promptHistoryGroupId(dateDaysAgo(2), now), "pastWeek");
  assert.equal(promptHistoryGroupId(dateDaysAgo(7, 0), now), "pastWeek");
  assert.equal(promptHistoryGroupId(dateDaysAgo(8), now), "pastMonth");
  assert.equal(promptHistoryGroupId(dateDaysAgo(30, 0), now), "pastMonth");
  assert.equal(promptHistoryGroupId(dateDaysAgo(31), now), "older");
  assert.equal(promptHistoryGroupId("not-a-date", now), "older");

  const history = [
    { id: "older", createdAt: dateDaysAgo(31) },
    { id: "today", createdAt: dateDaysAgo(0) },
    { id: "week-1", createdAt: dateDaysAgo(2) },
    { id: "yesterday", createdAt: dateDaysAgo(1) },
    { id: "month", createdAt: dateDaysAgo(8) },
    { id: "week-2", createdAt: dateDaysAgo(7) },
    { id: "older-invalid", createdAt: "not-a-date" }
  ];
  assert.deepEqual(
    groupPromptHistory(history, now).map(({ id, items }) => [id, items.map((item) => item.id)]),
    [
      ["today", ["today"]],
      ["yesterday", ["yesterday"]],
      ["pastWeek", ["week-1", "week-2"]],
      ["pastMonth", ["month"]],
      ["older", ["older", "older-invalid"]]
    ],
    "history rows must render in Notion-style date groups while preserving order within each group"
  );

  assert.equal(promptHistoryMatchesSearch({ text: "Rewrite this draft" }, ""), true);
  assert.equal(promptHistoryMatchesSearch({ text: "Rewrite this draft" }, "rewrite"), true);
  assert.equal(promptHistoryMatchesSearch({ text: "Rewrite this draft" }, "summary"), false);
  assert.equal(
    promptHistoryMatchesSearch({ text: "", images: [{ name: "diagram.png" }] }, "diagram"),
    true,
    "image names must participate in Prompt History search"
  );
  assert.equal(
    promptHistoryMatchesSearch({ text: "Keep this" }, "today", ["Today"]),
    true,
    "date labels must participate in Prompt History search"
  );

  const prompt = { id: "p1", text: "  Explain closures  " };
  assert.equal(promptHistoryMessageKey(prompt.text), "Explain closures");
  assert.equal(
    promptHistoryPocketSaved(prompt, [{ userMessage: "Explain closures", assistantMessage: "A closure..." }]),
    true,
    "sidebar pocket badge must appear only when this prompt was saved to Pocket"
  );
  assert.equal(promptHistoryPocketSaved(prompt, [{ userMessage: "Something else" }]), false);
  assert.equal(promptHistoryPocketSaved({ text: "" }, [{ userMessage: "" }]), false);

  const pages = promptHistoryPocketPages(prompt, {
    store: {
      ws1: {
        workspaceId: "ws1",
        topicTitle: "JS notes",
        frames: [{
          href: "https://chatgpt.com/c/1",
          title: "ChatGPT",
          appName: "ChatGPT",
          appId: "ChatGPT",
          messages: [
            { role: "user", text: "Explain closures" },
            { role: "assistant", text: "A function that remembers its scope." },
            { role: "user", text: "Unrelated" },
            { role: "assistant", text: "Skip me" }
          ]
        }]
      }
    },
    previewItems: [{
      status: "ok",
      href: "https://claude.ai/chat/2",
      title: "Claude",
      appName: "Claude",
      messages: [
        { role: "user", text: "Explain closures" },
        { role: "assistant", text: "A closed-over binding." }
      ]
    }]
  });
  assert.equal(pages.length, 2, "History must collect matching full-text and live Preview turns for Pocket");
  assert.deepEqual(pages.map((page) => [page.href, page.messages.map((message) => message.role)]), [
    ["https://chatgpt.com/c/1", ["user", "assistant"]],
    ["https://claude.ai/chat/2", ["user", "assistant"]]
  ]);
  assert.equal(promptHistoryPocketPages({ text: "missing" }, { store: {}, previewItems: [] }).length, 0);

  assert.match(historySource, /class: "shortcut-search prompt-history-search"/);
  assert.match(historySource, /class: "shortcut-search-input prompt-history-search-input"/);
  assert.match(historySource, /headerSearch, pane, resetAfterImport/);
  assert.match(historySource, /searching \? history\.filter\(\(item\) => promptHistoryItemMatchesSearch\(item, query\)\) : history/);
  assert.match(historySource, /searching \? "promptHistory\.searchEmpty" : "promptHistory\.noHistory"/);
  assert.match(
    controllerSource,
    /active === "promptHistory"[\s\S]*promptHistorySection\.headerSearch\(redraw\)/,
    "Prompt History search must mount in the settings titlebar"
  );
  assert.match(modelSource, /export function groupPromptHistory/);
  assert.match(panelSource, /viewerModal\(t\("promptHistory\.title"\)/);
  assert.match(panelSource, /function openHistoryPanel/);
  assert.match(panelSource, /class: "ui-dialog prompt-history-dialog"/);
  assert.match(panelSource, /class: "prompt-history-sidebar"/);
  assert.match(panelSource, /class: "prompt-history-pocket-badge"/);
  assert.match(panelSource, /"data-tooltip-id": "history\.action\.pocket"/);
  assert.match(panelSource, /function saveItemToPocket/);
  assert.match(runtimeSource, /savePages: \(\.\.\.args\) => ensurePocketController\(\)\.then\(\(pocket\) => pocket\.savePagesToPocket/);
  assert.match(runtimeSource, /collectLive: \(\) => ensureSummaryController\(\)\.then\(\(summary\) => summary\.collectWorkspacePreviewItems/);
  assert.ok(i18nSource.includes('"promptHistory.searchPlaceholder": "Search prompts or image names"'));
  assert.ok(i18nSource.includes('"promptHistory.searchPlaceholder": "搜索提示词或图片名"'));
  assert.ok(i18nSource.includes('"promptHistory.searchClear": "Clear search"'));
  assert.ok(i18nSource.includes('"promptHistory.searchClear": "清除搜索"'));
  assert.ok(i18nSource.includes('"promptHistory.searchEmpty": "No matching prompts"'));
  assert.ok(i18nSource.includes('"promptHistory.searchEmpty": "没有匹配的 prompt"'));
  assert.ok(i18nSource.includes('"promptHistory.saveToPocket": "Save to Pocket"'));
  assert.ok(i18nSource.includes('"promptHistory.saveToPocket": "保存到 Pocket"'));
  assert.ok(i18nSource.includes('"promptHistory.savedToPocket": "Saved to Pocket"'));
  assert.ok(i18nSource.includes('"promptHistory.savedToPocket": "已保存到 Pocket"'));
  assert.ok(i18nSource.includes('"toast.historyPocketEmpty": "No matching conversation to save. Open the chats or enable Record Full Text, then try again."'));
  assert.ok(i18nSource.includes('"toast.historyPocketEmpty": "没有可保存的对话。打开对应聊天，或开启全文记录后再试。"'));

  console.log("prompt history grouping: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
