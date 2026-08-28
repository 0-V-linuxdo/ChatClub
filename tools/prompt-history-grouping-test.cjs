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
const stylesheetSource = fs.readFileSync(path.join(root, "styles/chatclub.css"), "utf8");

(async () => {
  const {
    groupPromptHistory,
    promptHistoryGroupId,
    promptHistoryMatchesSearch,
    promptHistoryMessageKey,
    promptHistoryConversationPages,
    promptHistoryConversationEntries,
    promptHistoryEntryClusters,
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

  const wrappedPages = promptHistoryPocketPages({ text: "搜索：科幻作家 七月\n出版的小说/小说集" }, {
    store: {
      ws2: {
        workspaceId: "ws2",
        topicTitle: "July novels",
        frames: [{
          href: "https://chatgpt.com/c/wrap",
          title: "ChatGPT",
          appName: "ChatGPT",
          messages: [
            { role: "user", text: "请根据下面的问题回答。\n搜索：科幻作家 七月 出版的小说/小说集" },
            { role: "assistant", text: "七月出版过《...'s小说集。" }
          ]
        }]
      }
    }
  });
  assert.equal(wrappedPages.length, 1, "History must show stored turns even when the USER wrap includes the sent prompt");
  assert.deepEqual(wrappedPages[0].messages.map((message) => message.role), ["user", "assistant"]);
  assert.equal(
    promptHistoryPocketSaved(
      { text: "搜索：科幻作家 七月\n出版的小说/小说集" },
      [{ userMessage: "请根据下面的问题回答。\n搜索：科幻作家 七月 出版的小说/小说集" }]
    ),
    false,
    "sidebar pocket badge must stay exact USER match"
  );

  const truncatedPages = promptHistoryConversationPages({ text: "搜索：科幻作家 七月\n出版的小说/小说集" }, {
    store: {
      ws3: {
        workspaceId: "ws3",
        frames: [{
          href: "https://kimi.com/c/1",
          appName: "Kimi",
          messages: [
            { role: "user", text: "搜索：科幻作家 七月" },
            { role: "assistant", text: "七月的代表作包括《…" }
          ]
        }]
      }
    }
  });
  assert.equal(truncatedPages.length, 1, "History must show stored turns when a captured USER is a prefix of the sent prompt");
  assert.equal(truncatedPages[0].messages[1].text, "七月的代表作包括《…");
  const punctuatedPages = promptHistoryConversationPages({ text: "搜索：科幻作家 七月 \n出版的小说/小说集" }, {
    store: {
      wsPunct: {
        workspaceId: "wsPunct",
        frames: [{
          href: "https://kagi.com/c/punct",
          appName: "Kagi Assistant",
          messages: [
            { role: "user", text: "搜索:科幻作家七月出版的小说/小说集" },
            { role: "assistant", text: "七月出版过短篇集。" }
          ]
        }]
      }
    }
  });
  assert.equal(punctuatedPages.length, 1, "History must match extracted USER turns after NFKC punctuation and CJK spacing");
  const pocketPages = promptHistoryConversationPages({ text: "搜索：科幻作家 七月 \n出版的小说/小说集" }, {
    pocketEntries: [{
      chatUrl: "https://grok.com/c/pocket",
      appName: "Grok",
      userMessage: "搜索:科幻作家七月出版的小说/小说集",
      assistantMessage: "来自 Pocket 的回复。"
    }]
  });
  assert.equal(pocketPages.length, 1, "History must show matching Pocket turns when live/full-text sources are empty");
  assert.equal(pocketPages[0].href, "https://grok.com/c/pocket");
  assert.equal(pocketPages[0].messages[1].text, "来自 Pocket 的回复。");
  const hrefLess = promptHistoryConversationPages({ text: "Explain closures" }, {
    store: {
      ws4: {
        workspaceId: "ws4",
        frames: [{
          appName: "ChatGPT",
          instanceId: "gpt-1",
          messages: [
            { role: "user", text: "Explain closures" },
            { role: "assistant", text: "A function that remembers its scope." }
          ]
        }]
      }
    }
  });
  assert.equal(hrefLess.length, 1, "History detail must render stored turns even when the frame has no href");
  assert.equal(hrefLess[0].messages[1].text, "A function that remembers its scope.");
  assert.equal(promptHistoryPocketPages({ text: "Explain closures" }, {
    store: {
      ws4: {
        workspaceId: "ws4",
        frames: [{
          appName: "ChatGPT",
          instanceId: "gpt-1",
          messages: [
            { role: "user", text: "Explain closures" },
            { role: "assistant", text: "A function that remembers its scope." }
          ]
        }]
      }
    }
  }).length, 0, "href-less frames must not be saved to Pocket");

  const assistantPages = promptHistoryConversationPages({ text: "Explain closures" }, {
    store: {
      ws5: {
        workspaceId: "ws5",
        frames: [{
          href: "https://chatgpt.com/c/5",
          appName: "ChatGPT",
          messages: [
            { role: "user", text: "Please help with this homework." },
            { role: "assistant", text: "Sure. Explain closures: a function that remembers its scope." }
          ]
        }]
      }
    }
  });
  assert.equal(assistantPages.length, 1, "History must show stored turns when the prompt appears in the assistant reply");
  assert.equal(assistantPages[0].messages[0].text, "Please help with this homework.");
  assert.equal(assistantPages[0].messages[1].text, "Sure. Explain closures: a function that remembers its scope.");

  const liveLogoPages = promptHistoryConversationPages({ text: "介绍一下： the rational male 系列" }, {
    previewItems: [{
      status: "ok",
      siteName: "Grok",
      href: "https://grok.com/c/1",
      logoUrl: "https://grok.com/favicon.ico",
      page: {
        href: "https://grok.com/c/1",
        title: "Grok",
        logoUrl: "https://grok.com/favicon.ico",
        messages: [{ role: "user", text: "介绍一下： the rational male 系列" }]
      }
    }]
  });
  assert.equal(liveLogoPages[0].logoUrl, "https://grok.com/favicon.ico", "History pages must keep the live site favicon");

  const storedThenLiveLogo = promptHistoryConversationPages({ text: "介绍一下： the rational male 系列" }, {
    store: {
      wsLogo: {
        workspaceId: "wsLogo",
        frames: [{
          href: "https://grok.com/c/1",
          appName: "Grok",
          messages: [{ role: "user", text: "介绍一下： the rational male 系列" }]
        }]
      }
    },
    previewItems: [{
      status: "ok",
      href: "https://grok.com/c/1",
      page: {
        href: "https://grok.com/c/1",
        logoUrl: "https://grok.com/favicon.ico",
        messages: [{ role: "user", text: "介绍一下： the rational male 系列" }]
      }
    }]
  });
  assert.equal(storedThenLiveLogo.length, 1);
  assert.equal(
    storedThenLiveLogo[0].logoUrl,
    "https://grok.com/favicon.ico",
    "History must keep the live site favicon when a stored frame of the same chat has none"
  );

  const mergedClusters = promptHistoryEntryClusters(promptHistoryConversationEntries(
    { text: "介绍一下： the rational male 系列" },
    {
      previewItems: [
        {
          status: "ok",
          siteName: "Grok",
          href: "https://grok.com/c/1",
          logoUrl: "https://grok.com/favicon.ico",
          page: {
            href: "https://grok.com/c/1",
            siteName: "Grok",
            logoUrl: "https://grok.com/favicon.ico",
            messages: [{ role: "user", text: "介绍一下： the rational male 系列" }]
          }
        },
        {
          status: "ok",
          siteName: "Notion",
          href: "https://app.notion.com/chat/2",
          logoUrl: "https://www.notion.so/images/favicon.ico",
          page: {
            href: "https://app.notion.com/chat/2",
            siteName: "Notion",
            logoUrl: "https://www.notion.so/images/favicon.ico",
            messages: [{ role: "user", text: "介绍一下： the rational male 系列" }]
          }
        }
      ]
    }
  ));
  assert.equal(mergedClusters.length, 1, "History must merge the same USER prompt across site cards");
  assert.equal(mergedClusters[0].merged, true);
  assert.equal(mergedClusters[0].entries.length, 2);
  assert.equal(mergedClusters[0].userMessage, "介绍一下： the rational male 系列");

  const whatsNew = { text: "What's new" };
  const whatsNewStored = {
    href: "https://grok.com/c/whats-new",
    title: "What's new",
    appName: "Grok",
    messages: [
      { role: "user", text: "What's new" },
      { role: "assistant", text: "I currently don't have any previously saved memory of you." },
      { role: "user", text: "Follow up" },
      { role: "assistant", text: "Here's What's new in the product this week." }
    ]
  };
  const whatsNewEntries = promptHistoryConversationEntries(whatsNew, {
    store: {
      wsGrok: {
        workspaceId: "wsGrok",
        frames: [whatsNewStored]
      }
    },
    previewItems: [{
      status: "ok",
      href: "https://grok.com/c/whats-new",
      title: "What's new",
      appName: "Grok",
      messages: [{ role: "user", text: "What's new" }]
    }]
  });
  assert.equal(whatsNewEntries.length, 1, "History must not add an empty live card next to a stored Grok conversation");
  assert.equal(whatsNewEntries[0].assistantMessage, "I currently don't have any previously saved memory of you.");
  assert.equal(
    promptHistoryConversationEntries(whatsNew, {
      previewItems: [{
        status: "ok",
        href: "https://grok.com/c/empty",
        title: "What's new",
        appName: "Grok",
        messages: [
          { role: "user", text: "What's new" },
          { role: "assistant", text: "   " }
        ]
      }]
    }).length,
    1,
    "a USER-only capture may still render, but empty assistant text must not invent a second card"
  );
  assert.deepEqual(
    promptHistoryEntryClusters([
      { userMessage: "What's new", assistantMessage: "I currently don't have any previously saved memory of you." },
      { userMessage: "", assistantMessage: "" },
      { userMessage: "   ", assistantMessage: "\n" }
    ]).map((cluster) => cluster.entries.map((entry) => entry.assistantMessage)),
    [["I currently don't have any previously saved memory of you."]],
    "empty History turns must not become blank conversation cards"
  );

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
  assert.doesNotMatch(panelSource, /prompt-history-panel-clear/);
  assert.doesNotMatch(panelSource, /function clearHistory\(/);
  assert.match(panelSource, /function openHistoryPanel/);
  assert.match(panelSource, /class: "ui-dialog prompt-history-dialog"/);
  assert.match(panelSource, /class: "prompt-history-sidebar"/);
  assert.match(panelSource, /class: "prompt-history-pocket-badge"/);
  assert.match(panelSource, /prompt-history-sidebar-pocket/);
  assert.match(panelSource, /"data-tooltip-id": "history\.action\.pocket"/);
  assert.match(panelSource, /conversationFavicons/);
  assert.match(panelSource, /pageFavicons/);
  assert.match(panelSource, /from "\.\.\/\.\.\/ui\/favicon\.js"/);
  assert.match(panelSource, /function saveItemToPocket/);
  assert.match(panelSource, /function refreshFullTextStore/);
  assert.match(panelSource, /function refreshConversationSources/);
  assert.match(panelSource, /function syncHistoryModalHeader/);
  assert.match(panelSource, /class: "prompt-history-header-sidebar"/);
  assert.match(panelSource, /class: "prompt-history-header-titlebar"/);
  assert.match(panelSource, /headerSearch\(redraw\)/);
  assert.doesNotMatch(panelSource, /headerSearch\(host/);
  assert.doesNotMatch(panelSource, /prompt-history-panel-toolbar/);
  assert.doesNotMatch(panelSource, /prompt-history-detail-header/);
  assert.match(panelSource, /document\.querySelector\("\.prompt-history-modal \.prompt-history-panel-search-input"\)/);
  assert.match(panelSource, /function refreshOpenHistory/);
  assert.match(panelSource, /function notifyFullTextChanged/);
  assert.match(panelSource, /function applyWorkspacePreview/);
  assert.match(panelSource, /function notifyWorkspaceSaved/);
  assert.match(panelSource, /workspacePreviewPinned/);
  assert.match(panelSource, /refreshOpenHistory\(\{ retryLive: !pinned \}\)/);
  assert.match(panelSource, /if \(!pinned\) \{\s*activeItemId = ""/);
  assert.match(panelSource, /livePreviewItems = previewItems/);
  assert.match(panelSource, /incomingIds\.find\(\(id\) => history\.some\(\(entry\) => entry\.id === id\)\)/);
  assert.match(panelSource, /livePreviewTried/);
  assert.match(panelSource, /livePreviewPending/);
  assert.match(panelSource, /retryLive/);
  assert.match(panelSource, /hasLiveSnapshot/);
  assert.match(panelSource, /!hasPages && !hasLiveSnapshot/);
  assert.match(panelSource, /promptHistoryConversationPages/);
  assert.match(panelSource, /collectLivePreviewItems\(\)/);
  assert.match(panelSource, /refreshConversationSources\(redraw\)/);
  assert.match(panelSource, /refreshOpenHistory\(\{ retryLive: true \}\)/);
  assert.match(panelSource, /class: "pocket-batch-row prompt-history-conversations"/);
  assert.match(panelSource, /if \(!text\.trim\(\)\) return null;/);
  assert.doesNotMatch(panelSource, /role !== "assistant"\) return null/);
  assert.match(panelSource, /if \(!userTurn && !assistantTurn\) return null;/);
  assert.match(panelSource, /promptHistoryPreview\(activeItem\?\.text, 72\)/);
  assert.match(panelSource, /ui-card pocket-entry prompt-history-conversation/);
  assert.match(panelSource, /pocket-shared-user-message/);
  assert.match(panelSource, /pocket-entry-cluster-merged/);
  assert.match(panelSource, /class: "pocket-entry-favicon"/);
  assert.match(panelSource, /renderMarkdown/);
  assert.match(panelSource, /pocket-message-markdown summary-preview-text-markdown/);
  assert.match(panelSource, /www\.google\.com\/s2\/favicons/);
  assert.doesNotMatch(panelSource, /faviconPort\.appById/);
  assert.match(panelSource, /pocket-message-copy/);
  assert.match(panelSource, /copyHistoryMessage/);
  assert.match(panelSource, /loadHistoryEntry/);
  assert.match(panelSource, /el\("button", \{\s*class: "pocket-entry-url prompt-history-conversation-url"/);
  assert.match(panelSource, /attachHistoryPanelResize/);
  assert.match(panelSource, /toggleOpenHistoryPanelFullscreen/);
  assert.match(panelSource, /promptHistory\.emptyTitle/);
  assert.match(panelSource, /pocket-empty prompt-history-main-empty/);
  assert.match(panelSource, /pocket-sidebar-empty/);
  assert.match(panelSource, /prompt-history-sidebar-meta/);
  assert.match(modelSource, /export function promptHistorySourceMeta/);
  assert.match(panelSource, /entry\.appName\s*\n\s*\? el\("span", \{ class: "pocket-entry-source"/);
  assert.match(panelSource, /toggleHistoryPanelFocusMode/);
  assert.match(panelSource, /pocket\.cardHeight/);
  assert.match(panelSource, /pocket-actions-panel/);
  assert.match(panelSource, /prompt-history-modal-fullscreen/);
  assert.match(panelSource, /prompt-history-modal-focus/);
  assert.match(panelSource, /promptHistoryConversationEntries/);
  assert.match(panelSource, /promptHistoryEntryClusters/);
  assert.doesNotMatch(panelSource, /pageFavicons\(\[page\]/);
  assert.match(panelSource, /conversationPages\(item\)/);
  assert.match(panelSource, /promptHistory\.conversationLoading/);
  assert.match(panelSource, /promptHistory\.conversationEmpty/);
  assert.match(panelSource, /prompt-history-detail-fallback/);
  assert.match(modelSource, /fullTextTextsOverlap/);
  assert.match(modelSource, /pocketFramesMatchingPromptHistory/);
  assert.match(panelSource, /pocketEntries/);
  assert.match(
    stylesheetSource,
    /\.prompt-history-conversations\s*\{[\s\S]*?display:\s*flex/,
    "History conversation cards must sit in a Pocket-style horizontal row"
  );
  assert.match(stylesheetSource, /prompt-history-modal-fullscreen/);
  assert.match(stylesheetSource, /prompt-history-shell-focus/);
  assert.match(stylesheetSource, /\.prompt-history-main:has\(\.pocket-active-header\)/);
  assert.match(stylesheetSource, /--prompt-history-card-width:\s*460px/);
  assert.match(stylesheetSource, /\.prompt-history-header-titlebar\s*\{/);
  assert.match(
    stylesheetSource,
    /\.prompt-history-modal \.modal-header \{[\s\S]*?grid-template-columns:\s*minmax\(220px/,
    "History header must use Pocket-style sidebar-aligned columns"
  );
  assert.match(stylesheetSource, /\.prompt-history-header-title strong \{[\s\S]*?text-overflow:\s*ellipsis/);
  assert.match(stylesheetSource, /\.prompt-history-sidebar-pocket/);
  assert.match(stylesheetSource, /\.chat-favicon-stack/);
  assert.match(stylesheetSource, /\.prompt-history-turn-text\s*\{/);
  assert.match(stylesheetSource, /\.prompt-history-detail-fallback\s*\{/);
  assert.match(stylesheetSource, /\.prompt-history-detail-status\s*\{/);
  assert.match(
    stylesheetSource,
    /\.prompt-history-modal \.modal-header h2 \{[\s\S]*?text-overflow:\s*ellipsis/,
    "History modal title must ellipsize the selected prompt"
  );
  assert.match(runtimeSource, /savePages: \(\.\.\.args\) => ensurePocketController\(\)\.then\(\(pocket\) => pocket\.savePagesToPocket/);
  assert.match(runtimeSource, /collectLive: \(\) => ensureSummaryController\(\)\.then\(\(summary\) => summary\.collectWorkspacePreviewItems/);
  assert.match(runtimeSource, /result\?\.saved && result\.unchanged !== true/);
  assert.match(runtimeSource, /historyController\?\.notifyFullTextChanged/);
  assert.match(
    runtimeSource,
    /notifyHistory:\s*\(payload\)\s*=>\s*ensureHistoryController\(\)\.then\(\(history\) => history\?\.notifyWorkspaceSaved\?\.\(payload\)\)/
  );
  assert.doesNotMatch(
    runtimeSource,
    /notifyHistory:\s*\(\)\s*=>\s*historyController\?\.notifyFullTextChanged/
  );
  assert.ok(i18nSource.includes('"promptHistory.searchPlaceholder": "Search prompts or image names"'));
  assert.ok(i18nSource.includes('"promptHistory.searchPlaceholder": "搜索提示词或图片名"'));
  assert.ok(i18nSource.includes('"promptHistory.searchClear": "Clear search"'));
  assert.ok(i18nSource.includes('"promptHistory.searchClear": "清除搜索"'));
  assert.ok(i18nSource.includes('"promptHistory.searchEmpty": "No matching prompts"'));
  assert.ok(i18nSource.includes('"promptHistory.searchEmpty": "没有匹配的 prompt"'));
  assert.ok(i18nSource.includes('"promptHistory.saveToPocket": "Save to Pocket"'));
  assert.ok(i18nSource.includes('"promptHistory.saveToPocket": "保存到收藏"'));
  assert.ok(i18nSource.includes('"promptHistory.savedToPocket": "Saved to Pocket"'));
  assert.ok(i18nSource.includes('"promptHistory.savedToPocket": "已保存到收藏"'));
  assert.ok(i18nSource.includes('"promptHistory.conversationLoading": "Collecting the matching conversation…"'));
  assert.ok(i18nSource.includes('"promptHistory.conversationLoading": "正在采集匹配的对话…"'));
  assert.ok(i18nSource.includes('"promptHistory.conversationEmpty": "No matching conversation. Open the chats or enable Record Full Text, then try again."'));
  assert.ok(i18nSource.includes('"promptHistory.conversationEmpty": "没有匹配的对话。打开对应聊天，或开启全文记录后再试。"'));
  assert.ok(i18nSource.includes('"toast.historyPocketEmpty": "No matching conversation to save. Open the chats or enable Record Full Text, then try again."'));
  assert.ok(i18nSource.includes('"toast.historyPocketEmpty": "没有可保存的对话。打开对应聊天，或开启全文记录后再试。"'));

  console.log("prompt history grouping: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
