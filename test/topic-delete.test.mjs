import test from "node:test";
import assert from "node:assert/strict";
import { topicIdentity, clampTimeout, failedBeforeDelivery, createCompletionJudge, effectiveConfigs, resolveConfig } from "../src/plugins/topic-delete/model.js";

test("topic identity per site (05 §4.2)", () => {
  assert.deepEqual(topicIdentity("chatgpt", "https://chatgpt.com/c/68a1b2c3-d4e5"), { site: "chatgpt", id: "68a1b2c3-d4e5" });
  assert.deepEqual(topicIdentity("chatgpt", "https://chatgpt.com/g/g-abc/c/abcdef12"), { site: "chatgpt", id: "abcdef12" });
  assert.equal(topicIdentity("chatgpt", "https://chatgpt.com/"), null);
  assert.equal(topicIdentity("claude", "https://claude.ai/new"), null);
  assert.equal(topicIdentity("claude", "https://claude.ai/chat/0f1e2d3c-4b5a").id, "0f1e2d3c-4b5a");
  assert.equal(topicIdentity("gemini", "https://gemini.google.com/app/abc123def").id, "abc123def");
  assert.equal(topicIdentity("gemini", "https://gemini.google.com/app"), null);
  assert.equal(topicIdentity("notion", "https://app.notion.com/chat?t=abcdef123").id, "abcdef123");
  assert.equal(topicIdentity("notion", "https://app.notion.com/chat"), null);
  assert.equal(topicIdentity("deepseek", "https://chat.deepseek.com/a/chat/s/abc-123-def").id, "abc-123-def");
  assert.equal(topicIdentity("grokMirror", "https://gk.dairoot.cn/chat/abcdef1").id, "abcdef1");
  assert.equal(topicIdentity("custom", "http://127.0.0.1/del.html?c=abc123", "^/del\\.html\\?c=([A-Za-z0-9_-]{6,})").id, "abc123");
});

test("timeouts are clamped, DeepSeek at least 36 s", () => {
  assert.equal(clampTimeout("chatgpt"), 15000);
  assert.equal(clampTimeout("gemini"), 24000);
  assert.equal(clampTimeout("chatgpt", 1000), 5000);
  assert.equal(clampTimeout("chatgpt", 99000), 45000);
  assert.equal(clampTimeout("deepseek", 10000), 36000);
});

test("only pre-delivery failures may be retried", () => {
  assert.equal(failedBeforeDelivery(new Error("frame not registered")), true);
  assert.equal(failedBeforeDelivery(new Error("Could not establish connection. Receiving end does not exist.")), true);
  assert.equal(failedBeforeDelivery(new Error("timed out")), false);
  assert.equal(failedBeforeDelivery(new Error("no response")), false);
});

test("completion needs two done samples at least 600 ms apart", () => {
  const done = { version: 1, present: false, target: { current: false, present: true } };
  const open = { version: 1, present: true, target: { current: true, present: true } };
  const j = createCompletionJudge();
  assert.equal(j(done, 0), false);
  assert.equal(j(done, 300), false);
  assert.equal(j(open, 560), false);
  assert.equal(j(done, 820), false);
  assert.equal(j(done, 1500), true);
  // Sidebar hidden from the start: only leaving the address counts.
  const hidden = createCompletionJudge({ listedAtStart: false });
  const stay = { version: 1, present: false, target: { current: true, present: false } };
  assert.equal(hidden(stay, 0), false);
  assert.equal(hidden(stay, 900), false);
});

test("configs resolve by app id or host; disabled reports skip", () => {
  const list = effectiveConfigs([{ id: "claude", name: "Claude", appIds: ["Claude"], hosts: ["claude.ai"] }], [{ id: "claude", builtIn: true, enabled: false }]);
  assert.deepEqual(resolveConfig(list, { appId: "Claude", href: "https://claude.ai/chat/abcdef" }), { config: null, disabled: true });
  assert.deepEqual(resolveConfig(list, { appId: "X", href: "https://x.com/" }), { config: null, disabled: false });
});
