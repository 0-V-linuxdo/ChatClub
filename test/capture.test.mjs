import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { conversationKey, pairMessages, textsOverlap, hash64, mergeAdjacent } from "../src/lib/conversation.js";
import { renderMarkdown } from "../src/lib/markdown.js";
import { effectiveConfigs, storedConfigs, blankPageReason, hasCollector, brandOf } from "../src/plugins/summary/sites.js";
import { buildSummaryContext } from "../src/plugins/summary/panel.js";

test("conversation keys (04 §5.2)", () => {
  assert.equal(conversationKey("https://chatgpt.com/c/abc"), "chatgpt:abc");
  assert.equal(conversationKey("https://chatgpt.com/g/g-1/c/xyz"), "chatgpt:xyz");
  assert.equal(conversationKey("https://chatgpt.com/"), null);
  assert.equal(conversationKey("https://chatgpt.com/library"), null);
  assert.equal(conversationKey("https://app.notion.com/chat?t=42"), "notion:42");
  assert.equal(conversationKey("https://chat.deepseek.com/a/chat/s/77"), "deepseek:77");
  assert.equal(conversationKey("https://poe.com/chat/abc"), "poe.com/chat/abc");
  assert.equal(conversationKey("https://x.test/chat?id=9&z=1"), "x.test/chat?id=9");
  assert.equal(conversationKey("https://x.test/chat"), null);
  assert.equal(conversationKey("https://x.test/#abcdefgh12"), "x.test#abcdefgh12");
  assert.equal(conversationKey("chrome://settings"), null);
});

test("pairing, overlap, merge and hash", () => {
  const pairs = pairMessages([{ role: "assistant", text: "orphan" }, { role: "user", text: "a" }, { role: "user", text: "b" }, { role: "assistant", text: "B" }, { role: "page", text: "x" }]);
  assert.deepEqual(pairs, [{ user: "b", assistant: "B" }]);
  assert.ok(textsOverlap("Hello   world", "hello world") === false);
  assert.ok(textsOverlap("Hello   world", "Hello world"));
  assert.ok(textsOverlap("a b c", "abc"));
  assert.ok(textsOverlap("longer text here", "this has longer text here inside"));
  assert.ok(!textsOverlap("short", "a short one"));
  assert.deepEqual(mergeAdjacent([{ role: "user", text: "a" }, { role: "user", text: "b" }, { role: "assistant", text: " " }]), [{ role: "user", text: "a\n\nb" }]);
  assert.match(hash64("x"), /^[0-9a-f]{16}$/);
  assert.equal(hash64("x"), hash64("x"));
  assert.notEqual(hash64("x"), hash64("y"));
});

test("markdown renderer never creates HTML from content (04 §2.6)", () => {
  const { window } = new JSDOM("");
  const doc = window.document;
  const el = renderMarkdown("# T\n\n<script>alert(1)</script> **b** [x](javascript:alert(1)) [ok](https://a.test)\n\n```js\n<b>\n```\n\n| a | b |\n|:-|-:|\n| 1 | 2 |\n\n- i\n- j\n\n1. k", doc);
  assert.equal(el.querySelectorAll("script").length, 0);
  assert.equal(el.querySelector("h1").textContent, "T");
  assert.match(el.querySelector("p").textContent, /<script>/);
  const links = [...el.querySelectorAll("a")];
  assert.deepEqual(links.map((a) => a.getAttribute("href")), ["https://a.test"]);
  assert.equal(links[0].rel, "noopener noreferrer");
  assert.equal(el.querySelector("pre code").textContent, "<b>");
  assert.equal(el.querySelector("pre code").dataset.lang, "js");
  assert.equal(el.querySelectorAll("td").length, 2);
  assert.equal(el.querySelector("td:last-child").style.textAlign, "right");
  assert.equal(el.querySelectorAll("ul li").length, 2);
  assert.equal(el.querySelectorAll("ol li").length, 1);
  assert.equal(renderMarkdown("", doc).innerHTML, "<p></p>");
});

test("summary site configs: sparse overrides and custom entries round-trip", () => {
  const builtins = [{ id: "a", name: "A", enabled: true, hosts: ["a.test"], userscriptFile: "a", fallbackMode: "structuredOnly", officialRuleHints: {} }];
  let eff = effectiveConfigs(builtins, []);
  assert.equal(eff[0].overridden, false);
  eff[0] = { ...eff[0], enabled: false };
  eff.push({ id: "c1", name: "C", hosts: ["c.test"], customUserscript: "return []", enabled: true });
  const stored = storedConfigs(builtins, eff);
  assert.deepEqual(stored[0], { id: "a", builtIn: true, enabled: false });
  assert.equal(stored[1].sourceMode, "custom");
  eff = effectiveConfigs(builtins, stored);
  assert.equal(eff[0].enabled, false);
  assert.equal(eff[0].overridden, true);
  assert.equal(eff[1].builtIn, false);
  assert.equal(hasCollector(eff[1]), true);
  assert.equal(hasCollector({ id: "x", officialRuleHints: {} }), false);
  assert.equal(hasCollector({ id: "x", officialRuleHints: { userRoot: [".u"] } }), true);
});

test("blank pages and brands (04 §1.3, §2.3)", () => {
  assert.equal(blankPageReason("https://chatgpt.com/"), "blank.chatgpt");
  assert.equal(blankPageReason("https://chatgpt.com/c/1"), null);
  assert.equal(blankPageReason("https://gemini.google.com/app"), "blank.gemini");
  assert.equal(blankPageReason("https://app.notion.com/chat"), "blank.notion");
  assert.equal(blankPageReason("https://app.notion.com/chat?t=1"), null);
  assert.equal(blankPageReason("https://claude.ai/new"), "blank.claude");
  assert.equal(brandOf({ siteId: "grok-dairoot" }), "Grok");
  assert.equal(brandOf({ siteName: "Foo" }), "Foo");
});

test("summary request context format (04 §2.5)", () => {
  const sources = [
    { status: "ok", title: "T1", messages: [{ role: "user", text: "q" }, { role: "assistant", text: "a" }] },
    { status: "skipped" },
    { status: "ok", href: "https://x", messages: [{ role: "user", text: "q2" }] },
  ];
  assert.equal(buildSummaryContext(sources), "Context:\n# T1\n\nuser: q\n\nassistant: a\n\n---\n\n# https://x\n\nuser: q2");
  assert.ok(buildSummaryContext(sources, " why? ").startsWith("Question:\nwhy?\n\nContext:\n# T1"));
});

import { buildBatch, normalizeList, clusters, restorePlan, restorableUrl, mergeImport, normalizeCardSize } from "../src/plugins/pocket/model.js";

test("pocket batches, clusters and restore plans (04 §3)", () => {
  let n = 0;
  const rid = () => String((n += 1));
  const groups = [{ id: "g1", tabs: [{ id: "t1", appId: "A" }] }, { id: "g2", tabs: [{ id: "t2", appId: "B" }, { id: "t3", appId: "C" }] }];
  const src = (id, appId, msgs, order) => ({ key: id, instanceId: id, appId, href: `https://${appId}.test/c/1`, title: appId, brand: appId, order, messages: msgs });
  const q = [{ role: "user", text: "same q" }, { role: "assistant", text: "a" }];
  const batch = buildBatch([src("t3", "C", q, 2), src("t1", "A", q, 0), src("t2", "B", [{ role: "user", text: "other" }, { role: "assistant", text: "b" }], 1), { ...src("x", "N", q, 3), href: "https://app.notion.com/chat" }], { groups, rid, now: new Date("2026-01-01T00:00:00Z") });
  assert.equal(batch.length, 3);
  assert.deepEqual(batch.map((e) => [e.groupIndex, e.tabIndex]), [[1, 1], [0, 0], [1, 0]]);
  const cl = clusters(batch);
  assert.equal(cl[0].merged, true);
  assert.deepEqual(cl[0].entries.map((e) => e.appId), ["A", "C"]);
  assert.equal(cl[1].merged, false);
  const plan = restorePlan(batch);
  assert.deepEqual(plan.map((g) => g.map((x) => x.appId)), [["A"], ["B", "C"]]);
  assert.equal(restorableUrl("NotionAI", "https://app.notion.com/chat?t=9&x=1"), "https://app.notion.com/chat?t=9");
  assert.equal(restorableUrl("NotionAI", "https://app.notion.com/page"), null);
  const dup = normalizeList([...batch, ...batch, { url: "https://u", siteName: "S", userMessage: "u", assistantMessage: "v", groupIndex: -2 }]);
  assert.equal(dup.length, 4);
  assert.equal(dup[3].chatUrl, "https://u");
  assert.equal(dup[3].appName, "S");
  assert.equal(dup[3].batchId, "legacy");
  assert.equal(dup[3].groupIndex, 0);
  assert.equal(mergeImport(batch, [...batch, { userMessage: "new", assistantMessage: "x", batchId: "z" }])[0].userMessage, "new");
  assert.deepEqual(normalizeCardSize({ width: 999, height: 500 }), { width: 460, height: 500 });
});
