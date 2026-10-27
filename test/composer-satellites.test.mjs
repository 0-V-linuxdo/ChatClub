import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig, nextIndex } from "../src/plugins/prompt-placeholder/app.js";
import { hasConversation } from "../src/plugins/new-chat/app.js";

test("placeholder config is clamped and rotates (03 §1.4)", () => {
  const cfg = normalizeConfig({ items: ["a", " ", "b".repeat(150), "c"], intervalSec: 99999, mode: "interval" });
  assert.deepEqual(cfg.items.map((s) => s.length), [1, 100, 1]);
  assert.equal(cfg.intervalSec, 3600);
  assert.equal(nextIndex(cfg), 0);
  assert.equal(nextIndex({ ...cfg, state: { index: 2, lastRandom: -1 } }), 0);
  const random = { ...cfg, order: "random", state: { index: 0, lastRandom: 1 } };
  for (const r of [0, 0.4, 0.99]) assert.notEqual(nextIndex(random, () => r), 1);
});

test("new chat keeps the old workspace only when it holds a conversation (02 §9.1)", () => {
  const isNew = (_app, href) => href.endsWith("/");
  const g = (href, extra = {}) => [{ tabs: [{ appId: "A", href, ...extra }] }];
  assert.equal(hasConversation(g("https://x.test/"), "", isNew), false);
  assert.equal(hasConversation(g("https://x.test/c/1"), "", isNew), true);
  assert.equal(hasConversation(g("https://x.test/c/1", { pendingNewChat: true }), "", isNew), false);
  assert.equal(hasConversation(g("https://x.test/"), "ChatClub 3", isNew), false);
  assert.equal(hasConversation(g("https://x.test/"), "Trip plan", isNew), true);
});

import { titleFromText, titleFromDocument } from "../src/plugins/topic-title/rules.js";

test("topic titles from prompts and documents (02 §14)", () => {
  assert.equal(titleFromText("\n\n## “Plan a trip to Kyoto”\nmore"), "Plan a trip to Kyoto");
  const long = "Explain how the borrow checker in Rust decides lifetimes for nested closures";
  const cut = titleFromText(long);
  assert.ok(cut.length <= 48 && !cut.endsWith(" "), cut);
  assert.equal(titleFromText("ChatClub 2"), "");
  assert.equal(titleFromDocument("Kyoto itinerary - ChatGPT", { appName: "ChatGPT" }), "Kyoto itinerary");
  assert.equal(titleFromDocument("Claude", { appName: "Claude" }), "");
  assert.equal(titleFromDocument("New chat | Kimi", { appName: "Kimi" }), "");
  assert.equal(titleFromDocument("Just a moment...", {}), "");
});
