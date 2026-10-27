import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHistory, addToHistory, dateBucket, matchConversations, userMessagesAsItems, filterHistory } from "../src/plugins/prompt-history/model.js";

test("history: dedupe keeps newest position, cap 100", () => {
  let list = [];
  for (let i = 0; i < 120; i += 1) list = addToHistory(list, { text: `p${i}`, images: [], createdAt: new Date().toISOString() });
  assert.equal(list.length, 100);
  list = addToHistory(list, { text: "p50", images: [], createdAt: new Date().toISOString() });
  assert.equal(list[0].text, "p50");
  assert.equal(list.filter((x) => x.text === "p50").length, 1);
  assert.equal(normalizeHistory([{ text: " " }]).length, 0);
});

test("date buckets and filter", () => {
  const now = new Date("2026-10-22T12:00:00");
  assert.equal(dateBucket("2026-10-22T01:00:00", now), "today");
  assert.equal(dateBucket("2026-10-21T23:00:00", now), "yesterday");
  assert.equal(dateBucket("2026-10-17T10:00:00", now), "lastWeek");
  assert.equal(dateBucket("2026-10-01T10:00:00", now), "lastMonth");
  assert.equal(dateBucket("2025-10-01T10:00:00", now), "earlier");
  const items = normalizeHistory([{ text: "hello", images: [{ name: "cat.png" }], createdAt: now }]);
  assert.equal(filterHistory(items, "CAT").length, 1);
});

test("matching conversations and quick-save items", () => {
  const sources = [
    { appId: "A", appName: "A", href: "https://a/c/1", messages: [{ role: "user", text: "What is 2+2?" }, { role: "assistant", text: "4" }, { role: "user", text: "other" }, { role: "assistant", text: "x" }] },
    { appId: "B", appName: "B", href: "https://b/c/1", messages: [{ role: "user", text: "nothing" }, { role: "assistant", text: "y" }] },
  ];
  const m = matchConversations("What is 2+2?", sources);
  assert.equal(m.length, 1);
  assert.equal(m[0].pairs[0].assistant, "4");
  const items = userMessagesAsItems(sources, normalizeHistory([{ text: "other", createdAt: new Date() }]));
  assert.deepEqual(items.map((x) => x.text), ["What is 2+2?", "nothing"]);
});
