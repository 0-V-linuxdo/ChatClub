#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const {
    framesFromSummaryPreviewItems,
    fullTextMessagesHavePair,
    fullTextMessagesMatchPrompt,
    fullTextTextsOverlap,
    matchesFullTextQuery,
    mergeWorkspaceTabFullTextFrames,
    normalizeWorkspaceTabFullTextStore,
    pocketPagesFromPreviewItems,
    pocketPagesFromWorkspaceFullText,
    pocketPairsFromMessages,
    removeWorkspaceTabFullText,
    searchWorkspaceTabFullTextHits,
    uniqueWorkspaceTabFullTextHits,
    leftoverWorkspaceTabFullTextHits,
    upsertWorkspaceTabFullText,
    workspaceIdsMatchingFullText,
    workspaceTabFullTextFramesEqual
  } = await import(pathToFileURL(path.join(root, "shared/workspace-tab-fulltext.js")).href);

  const workspaceId = "page-abcdefghijkl";
  const messages = [
    { role: "user", text: "Compare ChatGPT and Claude" },
    { role: "assistant", text: "Claude is stronger at long documents." },
    { role: "user", text: "What about Gemini?" },
    { role: "page", text: "ignored" }
  ];
  assert.deepEqual(pocketPairsFromMessages(messages).map((item) => item.userMessage), [
    "Compare ChatGPT and Claude"
  ]);
  const frames = framesFromSummaryPreviewItems([
    {
      status: "ok",
      siteName: "ChatGPT",
      title: "Research",
      href: "https://chatgpt.com/c/1",
      page: { messages, href: "https://chatgpt.com/c/1", title: "Research", logoUrl: "https://chatgpt.com/favicon.ico" }
    },
    { status: "failed", page: { messages: [{ role: "user", text: "skip" }] } }
  ]);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].messages.length, 3);
  assert.equal(frames[0].logoUrl, "https://chatgpt.com/favicon.ico");

  let store = upsertWorkspaceTabFullText({}, {
    workspaceId,
    topicTitle: "Research desk",
    frames
  });
  assert.equal(store[workspaceId].frames[0].appName, "ChatGPT");
  const pocketPages = pocketPagesFromWorkspaceFullText(store, workspaceId);
  assert.equal(pocketPages.length, 1);
  assert.equal(pocketPages[0].href, "https://chatgpt.com/c/1");
  assert.equal(pocketPagesFromPreviewItems([{
    status: "ok",
    appId: "ChatGPT",
    href: "https://chatgpt.com/c/1",
    page: { href: "https://chatgpt.com/c/1", messages }
  }])[0].appId, "ChatGPT");
  assert.equal(matchesFullTextQuery("claude", ["Claude is stronger at long documents."]), true);
  assert.deepEqual(workspaceIdsMatchingFullText(store, "long documents"), [workspaceId]);
  const hits = searchWorkspaceTabFullTextHits(store, "Claude", [
    { workspaceId, topicTitle: "Research desk", live: true }
  ]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].userMessage, "Compare ChatGPT and Claude");
  assert.equal(hits[0].title, "Research desk");
  store = removeWorkspaceTabFullText(store, workspaceId);
  assert.deepEqual(store, {});
  assert.deepEqual(normalizeWorkspaceTabFullTextStore({ bogus: true }), {});

  const prompt = "Compare ChatGPT and Claude";
  assert.equal(fullTextTextsOverlap("搜索：科幻作家 七月 \n出版的小说/小说集", "搜索:科幻作家七月出版的小说/小说集"), true);
  assert.equal(fullTextMessagesHavePair([{ role: "user", text: prompt }]), false);
  assert.equal(fullTextMessagesHavePair([
    { role: "user", text: prompt },
    { role: "assistant", text: "Claude is stronger at long documents." }
  ]), true);
  assert.equal(fullTextMessagesMatchPrompt([{ role: "user", text: prompt }], prompt), false, "a user turn without an assistant pair must not match");
  assert.equal(fullTextMessagesMatchPrompt([
    { role: "user", text: prompt },
    { role: "assistant", text: "Claude is stronger at long documents." }
  ], prompt), true);
  assert.equal(fullTextMessagesMatchPrompt([
    { role: "user", text: `Title\n${prompt}` },
    { role: "assistant", text: "done" }
  ], prompt), true, "extracted USER text may wrap the sent prompt");
  assert.equal(fullTextMessagesMatchPrompt([
    { role: "user", text: "Compare ChatGPT" },
    { role: "assistant", text: "done" }
  ], prompt), true, "a truncated USER prefix must still match idle capture");
  assert.equal(fullTextMessagesMatchPrompt([
    { role: "user", text: "搜索:科幻作家七月出版的小说/小说集" },
    { role: "assistant", text: "七月的代表作包括《…" }
  ], "搜索：科幻作家 七月 \n出版的小说/小说集"), true, "NFKC punctuation and CJK spacing must not block idle capture");
  assert.equal(fullTextMessagesMatchPrompt([
    { role: "user", text: prompt },
    { role: "assistant", text: "done" }
  ], "unrelated prompt"), false);
  assert.equal(fullTextMessagesMatchPrompt([
    { role: "user", text: prompt },
    { role: "assistant", text: "historical complete" },
    { role: "user", text: "a newer prompt" },
    { role: "assistant", text: "partial" }
  ], prompt), false, "a historical pair must not count as the current send");
  assert.equal(fullTextMessagesMatchPrompt([
    { role: "user", text: "older question" },
    { role: "assistant", text: "older answer" },
    { role: "user", text: prompt },
    { role: "assistant", text: "current answer" }
  ], prompt), true, "only the latest prompt/assistant pair may complete a send capture");
  assert.equal(fullTextMessagesMatchPrompt([
    { role: "user", text: prompt },
    { role: "assistant", text: "historical complete" },
    { role: "user", text: prompt }
  ], prompt), false, "skipping the live last assistant must not match via an older pair");

  const merged = mergeWorkspaceTabFullTextFrames([
    {
      instanceId: "chatgpt-1",
      href: "https://chatgpt.com/c/1",
      appName: "ChatGPT",
      messages: [{ role: "user", text: "old" }, { role: "assistant", text: "reply" }]
    }
  ], [
    {
      instanceId: "claude-1",
      href: "https://claude.ai/chat/2",
      appName: "Claude",
      messages: [{ role: "user", text: prompt }, { role: "assistant", text: "later frame" }]
    }
  ]);
  assert.equal(merged.length, 2, "a later iframe must merge instead of replacing earlier frames");
  assert.equal(merged[0].instanceId, "chatgpt-1");
  assert.equal(merged[1].instanceId, "claude-1");

  const replaced = mergeWorkspaceTabFullTextFrames(merged, [{
    instanceId: "chatgpt-1",
    href: "https://chatgpt.com/c/1",
    appName: "ChatGPT",
    messages: [{ role: "user", text: prompt }, { role: "assistant", text: "updated" }]
  }]);
  assert.equal(replaced.length, 2);
  assert.equal(replaced[0].messages.length, 4, "a later turn on the same conversation href must append instead of wiping history");
  assert.equal(replaced[0].messages[1].text, "reply");
  assert.equal(replaced[0].messages[3].text, "updated");
  assert.equal(replaced[1].instanceId, "claude-1");
  assert.equal(workspaceTabFullTextFramesEqual(merged, merged), true);
  assert.equal(workspaceTabFullTextFramesEqual(merged, replaced), false, "updated messages must not compare equal");
  assert.equal(
    workspaceTabFullTextFramesEqual(replaced, mergeWorkspaceTabFullTextFrames(replaced, [{
      instanceId: "chatgpt-1",
      href: "https://chatgpt.com/c/1",
      appName: "ChatGPT",
      messages: [{ role: "user", text: prompt }, { role: "assistant", text: "updated" }]
    }])),
    true,
    "re-merging the same messages must be a no-op for persist"
  );

  const reloaded = mergeWorkspaceTabFullTextFrames(replaced, [{
    instanceId: "chatgpt-after-reload",
    href: "https://chatgpt.com/c/1",
    appName: "ChatGPT",
    messages: [{ role: "user", text: prompt }, { role: "assistant", text: "updated" }]
  }]);
  assert.equal(reloaded.length, 2, "a new iframe instanceId after reload must not duplicate the same conversation href");
  assert.equal(reloaded[0].instanceId, "chatgpt-after-reload");
  assert.equal(reloaded[0].messages.length, 4);

  const lastTwo = mergeWorkspaceTabFullTextFrames([{
    instanceId: "kagi-old",
    href: "https://assistant.kagi.com/c/star-wars",
    appName: "Kagi Assistant",
    messages: [
      { role: "user", text: "older kagi turn" },
      { role: "assistant", text: "older kagi answer" },
      { role: "user", text: prompt },
      { role: "assistant", text: "kagi star wars" }
    ]
  }], [{
    instanceId: "kagi-new",
    href: "https://assistant.kagi.com/c/star-wars",
    appName: "Kagi Assistant",
    messages: [{ role: "user", text: prompt }, { role: "assistant", text: "kagi star wars" }]
  }]);
  assert.equal(lastTwo.length, 1, "idle last-2 must merge onto the existing Kagi conversation");
  assert.equal(lastTwo[0].messages.length, 4, "idle last-2 must not wipe earlier Kagi turns");
  assert.equal(lastTwo[0].messages[1].text, "older kagi answer");
  assert.equal(lastTwo[0].messages[3].text, "kagi star wars");

  const rationalTitle = "the rational male 系列";
  const rationalStore = upsertWorkspaceTabFullText({}, {
    workspaceId: "page-rationalone1",
    topicTitle: rationalTitle,
    frames: [
      {
        appName: "Grok",
        title: rationalTitle,
        href: "https://grok.com/c/1",
        messages: [
          { role: "user", text: "介绍一下： the rational male 系列" },
          { role: "assistant", text: "Grok 回复。" }
        ]
      },
      {
        appName: "Notion AI",
        title: rationalTitle,
        href: "https://notion.so/chat/2",
        messages: [
          { role: "user", text: "介绍一下： the rational male 系列" },
          { role: "assistant", text: "Notion 回复。" },
          { role: "user", text: "继续" },
          { role: "assistant", text: "Notion 第二轮。" }
        ]
      },
      {
        appName: "Kagi Assistant",
        title: rationalTitle,
        href: "https://kagi.com/assistant/3",
        messages: [
          { role: "user", text: "介绍一下： the rational male 系列" },
          { role: "assistant", text: "Kagi 回复。" }
        ]
      }
    ]
  });
  const pairHits = searchWorkspaceTabFullTextHits(rationalStore, "rational");
  assert.ok(pairHits.length > 1, "pair search still matches every overlapping turn");
  const uniqueHits = uniqueWorkspaceTabFullTextHits(rationalStore, "rational");
  assert.equal(uniqueHits.length, 1, "one chat must appear at most once");
  assert.equal(uniqueHits[0].workspaceId, "page-rationalone1");
  assert.deepEqual(uniqueHits[0].appNames, ["Grok", "Notion AI", "Kagi Assistant"]);
  assert.equal(
    leftoverWorkspaceTabFullTextHits(rationalStore, "rational", [{ workspaceId: "page-rationalone1" }]).length,
    0,
    "Full text leftover must omit workspaces already listed in TODAY"
  );

  const second = upsertWorkspaceTabFullText(rationalStore, {
    workspaceId: "page-rationaltwo1",
    topicTitle: rationalTitle,
    frames: [{
      appName: "ChatGPT",
      title: rationalTitle,
      href: "https://chatgpt.com/c/9",
      messages: [
        { role: "user", text: "the rational male" },
        { role: "assistant", text: "another desk" }
      ]
    }]
  });
  const twoChats = uniqueWorkspaceTabFullTextHits(second, "rational");
  assert.equal(twoChats.length, 2, "different workspaceId values with the same title stay two rows");
  assert.deepEqual(twoChats.map((hit) => hit.workspaceId).sort(), ["page-rationalone1", "page-rationaltwo1"]);
  const leftover = leftoverWorkspaceTabFullTextHits(second, "rational", [{ workspaceId: "page-rationalone1" }]);
  assert.equal(leftover.length, 1);
  assert.equal(leftover[0].workspaceId, "page-rationaltwo1");

  const unpairedStore = upsertWorkspaceTabFullText({}, {
    workspaceId: "page-unpairedzxq1",
    topicTitle: "ZXQIDLE1406",
    frames: [{
      appName: "Notion",
      href: "https://app.notion.com/chat/orphan",
      messages: [{ role: "user", text: "ZXQIDLE1406 星球大战 小说" }]
    }]
  });
  assert.deepEqual(
    workspaceIdsMatchingFullText(unpairedStore, "ZXQIDLE1406"),
    [],
    "user-only full-text must not become a Tabs search hit"
  );
  assert.equal(
    leftoverWorkspaceTabFullTextHits(unpairedStore, "ZXQIDLE1406").length,
    0,
    "user-only full-text must not appear as a leftover tab"
  );

  console.log("workspace tab full text: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
