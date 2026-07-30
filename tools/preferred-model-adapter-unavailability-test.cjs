#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const grokSource = fs.readFileSync(
  path.join(root, "content-src/capabilities/preferred-grok.js"),
  "utf8"
);
const applyGrokSource = functionSource(grokSource, "applyGrokPreferredModel");

async function runGrokScenario({ menuClosed = true, unavailable = true, itemPresent = true } = {}) {
  const context = vm.createContext({
    scenario: { menuClosed, unavailable, itemPresent }
  });
  vm.runInContext(`
    const GROK_MODEL_TARGETS = Object.freeze({ heavy: Object.freeze({ id: "heavy" }) });
    const root = Object.freeze({ id: "model-menu" });
    const item = Object.freeze({ id: "heavy-model-item" });
    let selectionActivations = 0;
    let settlementWaits = 0;
    let dismissals = 0;
    function assertPreferredModelRun() {}
    function currentGrokModelId() { return ""; }
    async function openGrokModelMenu() { return root; }
    function findGrokModelItem() { return scenario.itemPresent ? item : null; }
    function grokModelItemLooksUnavailable() { return scenario.unavailable; }
    function grokModelMenuRoot() { return root; }
    async function dismissPreferredModelMenu() {
      dismissals += 1;
      return scenario.menuClosed;
    }
    function preferredModelActivate() {
      selectionActivations += 1;
      return true;
    }
    async function waitGrokModelSettled() {
      settlementWaits += 1;
      return false;
    }
    function preferredModelResult(_context, ok, appId, modelId, reason = "", extra = {}) {
      return { ok, appId, modelId, reason, ...extra };
    }
    ${applyGrokSource}
    globalThis.run = () => applyGrokPreferredModel({}, "heavy");
    globalThis.counts = () => ({ selectionActivations, settlementWaits, dismissals });
  `, context);
  const result = await context.run();
  return { result: { ...result }, counts: { ...context.counts() } };
}

(async () => {
  {
    const { result, counts } = await runGrokScenario();
    assert.equal(result.ok, true);
    assert.equal(result.unavailable, true);
    assert.equal(result.fallbackEligible, true);
    assert.equal(result.selectionActivated, false);
    assert.equal(result.menuClosed, true);
    assert.deepEqual(counts, { selectionActivations: 0, settlementWaits: 0, dismissals: 1 });
  }

  {
    const { result, counts } = await runGrokScenario({ menuClosed: false });
    assert.equal(result.unavailable, true);
    assert.equal(result.fallbackEligible, false, "an open Grok model menu must prevent fallback activation");
    assert.equal(result.selectionActivated, false);
    assert.equal(result.menuClosed, false, "Grok must report the actual failed menu cleanup");
    assert.deepEqual(counts, { selectionActivations: 0, settlementWaits: 0, dismissals: 1 });
  }

  {
    const { result, counts } = await runGrokScenario({ itemPresent: false });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "target model item not found");
    assert.notEqual(result.unavailable, true);
    assert.notEqual(result.fallbackEligible, true);
    assert.deepEqual(counts, { selectionActivations: 0, settlementWaits: 0, dismissals: 1 });
  }

  {
    const { result, counts } = await runGrokScenario({ unavailable: false });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "selection did not settle");
    assert.notEqual(result.unavailable, true);
    assert.notEqual(result.fallbackEligible, true, "post-activation settlement failure must remain ineligible");
    assert.deepEqual(counts, { selectionActivations: 1, settlementWaits: 1, dismissals: 1 });
  }

  console.log("preferred-model adapter typed unavailability: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
