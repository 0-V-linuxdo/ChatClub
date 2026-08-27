#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const {
    framesFromSummaryPreviewItems,
    fullTextMessagesMatchPrompt,
    matchesFullTextQuery,
    mergeWorkspaceTabFullTextFrames,
    normalizeWorkspaceTabFullTextStore,
    pocketPairsFromMessages,
    removeWorkspaceTabFullText,
    searchWorkspaceTabFullTextHits,
    upsertWorkspaceTabFullText,
    workspaceIdsMatchingFullText
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
      page: { messages, href: "https://chatgpt.com/c/1", title: "Research" }
    },
    { status: "failed", page: { messages: [{ role: "user", text: "skip" }] } }
  ]);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].messages.length, 3);

  let store = upsertWorkspaceTabFullText({}, {
    workspaceId,
    topicTitle: "Research desk",
    frames
  });
  assert.equal(store[workspaceId].frames[0].appName, "ChatGPT");
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
    { role: "user", text: prompt },
    { role: "assistant", text: "done" }
  ], "unrelated prompt"), false);

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
  assert.equal(replaced[0].messages[1].text, "updated");
  assert.equal(replaced[1].instanceId, "claude-1");

  console.log("workspace tab full text: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
