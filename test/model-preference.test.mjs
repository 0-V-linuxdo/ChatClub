import test from "node:test";
import assert from "node:assert/strict";
import { matchScore, resolveTarget, planFor, failurePolicy, rememberedFallback, rememberFallback, labelTarget, appKey, notionEfforts, CATALOGS } from "../src/plugins/model-preference/model.js";

test("menu labels match the right target", () => {
  const flash35 = resolveTarget("Gemini", "flash35");
  const pro = resolveTarget("Gemini", "pro");
  assert.ok(matchScore(flash35, "3.5 Flash  New") > matchScore(pro, "3.5 Flash  New"));
  assert.ok(matchScore(pro, "3.1 Pro Advanced reasoning") >= 2);
  assert.equal(matchScore(resolveTarget("Grok", "heavy"), "Expert"), 0);
  const opus5 = resolveTarget("NotionAI", "opus5");
  assert.ok(matchScore(opus5, "Claude Opus 5") >= 3);
  assert.equal(matchScore(opus5, "Claude Opus 4.8"), 0);
});

test("custom Notion labels and GrokMirror keys", () => {
  assert.deepEqual(labelTarget("  New Model X  "), { id: "label:new-model-x", label: "New Model X", aliases: ["new model x"] });
  assert.equal(resolveTarget("NotionAI", { kind: "label", label: "New Model X" }).id, "label:new-model-x");
  assert.equal(appKey("GrokMirror"), "Grok");
  assert.equal(CATALOGS.NotionAI.length, 24);
  assert.deepEqual(notionEfforts("gpt55"), ["none", "minimal", "low", "medium", "high", "xhigh"]);
});

test("plans: primary, remembered secondary, extras", () => {
  const s = { Gemini: "pro", GeminiSecondary: "fast", GeminiSecondaryModelEnabled: true, GeminiThinkingLevel: "extended" };
  const p = planFor("Gemini", s);
  assert.equal(p.target.id, "pro");
  assert.equal(p.fallback.id, "fast");
  assert.equal(p.thinking, "extended");
  const q = planFor("Gemini", s, { useSecondary: true });
  assert.equal(q.target.id, "fast");
  assert.equal(q.fallback, null);
  assert.equal(q.thinking, undefined);
  assert.equal(planFor("Grok", {}), null);
  const n = planFor("NotionAI", { NotionAI: "gpt55", NotionAIEfforts: { gpt55: "high", opus5: "bogus" }, NotionAIAllSources: "enabled" });
  assert.equal(n.effort, "high");
  assert.equal(n.allSources, "enabled");
});

test("failure policy and 5-minute fallback memory", () => {
  assert.equal(failurePolicy(undefined, {}, "Grok"), "send-current");
  assert.equal(failurePolicy("skip", { Grok: "inherit" }, "Grok"), "skip");
  assert.equal(failurePolicy("skip", { Grok: "send-current" }, "Grok"), "send-current");
  const m = rememberFallback({}, "Grok", 1000);
  assert.equal(rememberedFallback(m, "Grok", 1000 + 4 * 60 * 1000), true);
  assert.equal(rememberedFallback(m, "Grok", 1000 + 6 * 60 * 1000), false);
  assert.equal(rememberedFallback(m, "Gemini", 1000), false);
});
