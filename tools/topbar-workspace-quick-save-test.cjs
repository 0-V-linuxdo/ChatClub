#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const { functionSource } = require("./function-source.cjs");

const runtimeSource = read("app/runtime.js");
const topbarSource = read("app/topbar/controller.js");
const topbarView = read("app/topbar/view.js");
const quickSaveSource = read("app/topbar/workspace-quick-save.js");
const i18nSource = read("shared/i18n.js");

function previewItem({ href, user, assistant, status = "ok", appName = "ChatGPT" }) {
  return {
    status,
    siteName: appName,
    href,
    page: {
      href,
      title: appName,
      siteName: appName,
      messages: [
        { role: "user", text: user },
        { role: "assistant", text: assistant }
      ]
    }
  };
}

(async () => {
  const {
    createTopbarWorkspaceQuickSave
  } = await import(moduleUrl("app/topbar/workspace-quick-save.js"));

  const workspaceId = "page-abcdefghijkl";
  const liveItem = previewItem({
    href: "https://chatgpt.com/c/live",
    user: "Explain closures",
    assistant: "A function that remembers its scope."
  });
  const storedStore = {
    [workspaceId]: {
      workspaceId,
      topicTitle: "Stored desk",
      frames: [{
        href: "https://claude.ai/chat/stored",
        appName: "Claude",
        messages: [
          { role: "user", text: "Stored prompt" },
          { role: "assistant", text: "Stored reply" }
        ]
      }]
    }
  };

  function harness(overrides = {}) {
    const calls = [];
    const history = { value: overrides.history || [] };
    const controller = createTopbarWorkspaceQuickSave({
      collectLive: async () => {
        calls.push("collectLive");
        return overrides.liveItems || [];
      },
      loadFullText: async () => {
        calls.push("loadFullText");
        return overrides.store || {};
      },
      savePagesToPocket: async (pages) => {
        calls.push({ savePagesToPocket: pages });
        return { saved: true, count: pages.length };
      },
      persistFullText: async (payload) => {
        calls.push({ persistFullText: payload });
        return overrides.persistResult || { saved: true, workspaceId };
      },
      savePromptSendHistory: async (next) => {
        calls.push({ savePromptSendHistory: next });
        history.value = next;
        return next;
      },
      getHistory: () => history.value,
      setHistory: (next) => { history.value = next; },
      workspaceId: () => workspaceId,
      topicTitle: () => "Live desk",
      notifyHistory: (payload) => { calls.push({ notifyHistory: payload }); },
      toast: (message, kind) => { calls.push({ toast: message, kind }); },
      t: (key, vars = {}) => `${key}:${vars.count ?? ""}`,
      ...overrides
    });
    return { calls, history, controller };
  }

  {
    const { calls, controller } = harness({ liveItems: [liveItem] });
    const result = await controller.saveToPocket();
    assert.equal(result.saved, true);
    assert.equal(result.source, "live");
    assert.equal(calls.includes("loadFullText"), false, "live Pocket capture must not wait on stored full text");
    const saved = calls.find((call) => call.savePagesToPocket);
    assert.equal(saved.savePagesToPocket[0].href, "https://chatgpt.com/c/live");
    assert.equal(calls.some((call) => call.persistFullText), false, "Pocket must not persist full text itself");
  }

  {
    const { calls, controller } = harness({ liveItems: [], store: storedStore });
    const result = await controller.saveToPocket();
    assert.equal(result.saved, true);
    assert.equal(result.source, "fulltext");
    assert.ok(calls.includes("collectLive"), "Pocket must try live collect even when stored full text exists");
    assert.equal(calls.find((call) => call.savePagesToPocket).savePagesToPocket[0].href, "https://claude.ai/chat/stored");
  }

  {
    const { calls, controller } = harness({ liveItems: [], store: {} });
    const result = await controller.saveToPocket();
    assert.equal(result.saved, false);
    assert.equal(result.source, "empty");
    assert.equal(calls.some((call) => call.savePagesToPocket), false);
    assert.equal(calls.find((call) => call.toast)?.toast, "toast.workspacePocketEmpty:");
  }

  {
    const { calls, history, controller } = harness({ liveItems: [liveItem] });
    const result = await controller.saveToHistory();
    assert.equal(result.saved, true);
    assert.equal(result.persisted, true);
    assert.equal(result.count, 1);
    assert.equal(history.value[0].text, "Explain closures");
    assert.equal(calls.find((call) => call.persistFullText).persistFullText.workspaceId, workspaceId);
    const notified = calls.find((call) => call.notifyHistory);
    assert.equal(notified.notifyHistory.persistSaved, true);
    assert.equal(notified.notifyHistory.items.length, 1);
    assert.equal(notified.notifyHistory.incomingIds.length, 1);
    assert.equal(notified.notifyHistory.incomingIds[0], history.value[0].id);
    assert.equal(calls.find((call) => call.toast)?.kind, "success");
    assert.equal(calls.find((call) => call.toast)?.toast, "toast.historyWorkspaceSaved:1");
  }

  {
    const { calls, history, controller } = harness({
      liveItems: [liveItem],
      persistResult: { saved: false }
    });
    const result = await controller.saveToHistory();
    assert.equal(result.saved, true, "History upsert is success even when persist reports saved:false");
    assert.equal(result.persisted, false, "persist {saved:false} must not be treated as persist success");
    assert.equal(history.value[0].text, "Explain closures");
    assert.equal(calls.filter((call) => call.notifyHistory).length, 1);
    assert.equal(calls.find((call) => call.notifyHistory).notifyHistory.persistSaved, false);
    assert.equal(calls.find((call) => call.notifyHistory).notifyHistory.items.length, 1);
  }

  {
    const { calls, history, controller } = harness({ liveItems: [], store: storedStore });
    const result = await controller.saveToHistory();
    assert.equal(result.saved, true);
    assert.equal(result.source, "fulltext");
    assert.equal(history.value[0].text, "Stored prompt");
    assert.equal(calls.some((call) => call.persistFullText), false, "fallback History must not re-persist stored full text");
    assert.equal(calls.find((call) => call.notifyHistory).notifyHistory.persistSaved, false);
    assert.equal(calls.find((call) => call.notifyHistory).notifyHistory.incomingIds[0], history.value[0].id);
  }

  {
    const { calls, controller } = harness({
      liveItems: [{
        status: "ok",
        page: { messages: [{ role: "user", text: "orphan" }] }
      }],
      persistResult: { saved: true, workspaceId }
    });
    const result = await controller.saveToHistory();
    assert.equal(result.saved, false, "persist without user/assistant pairs is not a History save");
    assert.equal(result.persisted, true);
    assert.equal(calls.find((call) => call.toast)?.kind, "error");
    assert.equal(calls.some((call) => call.notifyHistory), false, "orphan persist must not notify History");
  }

  {
    const { controller, calls } = harness({ liveItems: [liveItem] });
    const first = controller.saveToPocket();
    const second = await controller.saveToPocket();
    assert.equal(second.busy, true);
    await first;
    assert.equal(calls.filter((call) => call === "collectLive").length, 1, "re-entry must not start a second collect");
  }

  {
    const hrefLessLive = [{
      status: "ok",
      siteName: "ChatGPT",
      page: {
        messages: [
          { role: "user", text: "Href-less prompt" },
          { role: "assistant", text: "Href-less reply" }
        ]
      }
    }];
    const { calls, controller } = harness({ liveItems: hrefLessLive, store: storedStore });
    const result = await controller.saveToPocket();
    assert.equal(result.saved, true);
    assert.equal(result.source, "fulltext", "Pocket must fall back when live turns have no saveable URL");
    assert.ok(calls.includes("loadFullText"));
  }

  {
    const twoTurns = previewItem({
      href: "https://chatgpt.com/c/two",
      user: "First",
      assistant: "A"
    });
    twoTurns.page.messages.push(
      { role: "user", text: "Second" },
      { role: "assistant", text: "B" }
    );
    const { history, controller } = harness({ liveItems: [twoTurns] });
    const result = await controller.saveToHistory();
    assert.equal(result.saved, true);
    assert.equal(history.value[0].text, "Second", "captured History rows must keep newest prompt first");
    assert.equal(history.value[1].text, "First");
  }

  {
    const existingHistory = [{
      id: "prompt-history-existing",
      text: "Explain closures",
      images: [],
      createdAt: "2026-01-01T00:00:00.000Z"
    }];
    const { calls, history, controller } = harness({
      liveItems: [liveItem],
      history: existingHistory
    });
    const result = await controller.saveToHistory();
    assert.equal(result.saved, true);
    assert.equal(result.added, 0);
    assert.equal(calls.some((call) => call.savePromptSendHistory), false, "identical USER text must refresh without rewriting History rows");
    assert.equal(history.value[0].id, "prompt-history-existing");
    assert.equal(calls.find((call) => call.toast)?.toast, "toast.historyWorkspaceRefreshed:1");
    assert.deepEqual(calls.find((call) => call.notifyHistory).notifyHistory.incomingIds, ["prompt-history-existing"]);
  }

  {
    const existingHistory = [{
      id: "prompt-history-existing",
      text: "First",
      images: [],
      createdAt: "2026-01-01T00:00:00.000Z"
    }];
    const mixedTurns = previewItem({
      href: "https://chatgpt.com/c/mixed",
      user: "First",
      assistant: "A"
    });
    mixedTurns.page.messages.push(
      { role: "user", text: "Second" },
      { role: "assistant", text: "B" }
    );
    const { calls, history, controller } = harness({
      liveItems: [mixedTurns],
      history: existingHistory
    });
    const result = await controller.saveToHistory();
    assert.equal(result.saved, true);
    assert.equal(result.added, 1);
    assert.equal(history.value[0].text, "Second");
    assert.equal(history.value[1].id, "prompt-history-existing");
    assert.equal(calls.find((call) => call.toast)?.toast, "toast.historyWorkspaceSaved:1", "mixed add+refresh must toast the added count");
    assert.equal(calls.find((call) => call.notifyHistory).notifyHistory.incomingIds[0], history.value[0].id);
  }

  assert.match(quickSaveSource, /pocketPagesFromPreviewItems/);
  assert.match(quickSaveSource, /pocketPagesFromWorkspaceFullText/);
  assert.match(quickSaveSource, /persistFullText/);
  assert.doesNotMatch(quickSaveSource, /scheduleIdle|recordFullText|openPocket|openHistory/);
  assert.match(runtimeSource, /createTopbarWorkspaceQuickSave/);
  assert.match(runtimeSource, /savePocketFromWorkspace/);
  assert.match(runtimeSource, /saveHistoryFromWorkspace/);
  assert.match(
    runtimeSource,
    /collectLive:\s*\(\)\s*=>\s*ensureSummaryController\(\)\.then\(\(summary\) => summary\.collectWorkspacePreviewItems\(\)\)/
  );
  assert.match(
    functionSource(runtimeSource, "savePocketFromWorkspace", true),
    /saveToPocket/
  );
  assert.match(
    functionSource(runtimeSource, "saveHistoryFromWorkspace", true),
    /saveToHistory/
  );
  assert.match(topbarSource, /savePocketFromWorkspace/);
  assert.match(topbarSource, /saveHistoryFromWorkspace/);
  assert.match(functionSource(topbarView, "bindWorkspaceQuickSave"), /contextmenu/);
  assert.match(functionSource(topbarView, "bindWorkspaceQuickSave"), /preventDefault/);
  assert.match(functionSource(topbarView, "bindWorkspaceQuickSave"), /topbarEditMode/);
  assert.match(topbarView, /item\.id === "pocket"[\s\S]*bindWorkspaceQuickSave\([\s\S]*savePocketFromWorkspace/);
  assert.match(topbarView, /item\.id === "history"[\s\S]*bindWorkspaceQuickSave\([\s\S]*saveHistoryFromWorkspace/);
  assert.match(functionSource(topbarView, "renderFoldedMenuButton"), /savePocketFromWorkspace/);
  assert.match(functionSource(topbarView, "renderFoldedMenuButton"), /saveHistoryFromWorkspace/);
  assert.match(functionSource(topbarView, "settingsMenuButton"), /oncontextmenu/);
  assert.match(
    functionSource(runtimeSource, "topbarWorkspaceQuickSave"),
    /notifyHistory:\s*\(payload\)\s*=>\s*ensureHistoryController\(\)\.then\(\(history\) => history\?\.notifyWorkspaceSaved\?\.\(payload\)\)\.catch\(\(\) => \{\}\)/
  );
  assert.doesNotMatch(
    functionSource(runtimeSource, "topbarWorkspaceQuickSave"),
    /historyController\?\.notifyFullTextChanged/
  );
  assert.ok(i18nSource.includes('"toast.workspacePocketEmpty": "No conversation to save. Wait for the chats to load, then try again."'));
  assert.ok(i18nSource.includes('"toast.workspacePocketEmpty": "没有可保存的对话。等聊天加载完成后再试。"'));
  assert.ok(i18nSource.includes('"toast.workspaceHistoryEmpty": "No conversation to save. Wait for the chats to load, then try again."'));
  assert.ok(i18nSource.includes('"toast.workspaceHistoryEmpty": "没有可保存的对话。等聊天加载完成后再试。"'));
  assert.ok(i18nSource.includes('"toast.historyWorkspaceSaved": "Saved {count} prompt{plural} to History"'));
  assert.ok(i18nSource.includes('"toast.historyWorkspaceSaved": "已保存 {count} 条 Prompt 到历史记录"'));
  assert.ok(i18nSource.includes('"toast.historyWorkspaceRefreshed": "Refreshed {count} prompt{plural} in History"'));
  assert.ok(i18nSource.includes('"toast.historyWorkspaceRefreshed": "已刷新历史记录中的 {count} 条 Prompt"'));

  console.log("topbar workspace quick save: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
