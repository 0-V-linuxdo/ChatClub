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
const waitSource = functionSource(grokSource, "waitGrokModelSettled");

async function runSettlement({ menuCloses = true, currentId = "" } = {}) {
  const context = vm.createContext({
    scenario: { menuCloses, currentId }
  });
  vm.runInContext(`
    const root = Object.freeze({ id: "model-menu" });
    let menuOpen = true;
    let now = 0;
    let sleeps = 0;
    Date.now = () => now;
    function assertPreferredModelRun() {}
    function currentGrokModelId() { return scenario.currentId; }
    function grokModelMenuRoot() { return menuOpen ? root : null; }
    async function preferredModelSleep() {
      sleeps += 1;
      now += scenario.menuCloses ? 120 : 2200;
      if (scenario.menuCloses) menuOpen = false;
    }
    ${waitSource}
    globalThis.run = () => waitGrokModelSettled({}, "fast");
    globalThis.state = () => ({ sleeps });
  `, context);
  const result = await context.run();
  return { result, state: { ...context.state() } };
}

(async () => {
  {
    const { result, state } = await runSettlement();
    assert.equal(result, true, "a successfully activated closed picker is settled");
    assert.deepEqual(state, { sleeps: 1 });
  }

  {
    const { result, state } = await runSettlement({ currentId: "fast" });
    assert.equal(result, true, "an explicit current model remains settled");
    assert.deepEqual(state, { sleeps: 0 });
  }

  {
    const { result } = await runSettlement({ menuCloses: false });
    assert.equal(result, false, "an open picker without a current model is not settled");
  }

  console.log("preferred-model Grok settlement: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
