#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { validateControllerContract } = await import("../app/controller-contract.js");
  const contract = { state: "object", run: "function", cancel: "function?" };
  const valid = validateControllerContract({ state: {}, run() {} }, "Probe", contract);
  assert.ok(Object.isFrozen(valid));
  assert.throws(() => validateControllerContract({ state: {} }, "Probe", contract), /requires run/);
  assert.throws(() => validateControllerContract({ state: {}, run: 1 }, "Probe", contract), /run to be function/);
  assert.throws(() => validateControllerContract({ state: {}, run() {}, extra: true }, "Probe", contract), /extra dependencies field extra/);
  console.log("controller contract validation: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
