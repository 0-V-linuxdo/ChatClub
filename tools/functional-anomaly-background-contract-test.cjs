#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

(async () => {
  const requests = await import("../shared/background-requests.js");
  const { BACKGROUND_REQUEST_ACTIONS: actions, BACKGROUND_REQUEST_SPECS: specs } = requests;
  const cases = [
    [actions.RECORD_FUNCTIONAL_ANOMALIES, true, ["record", "records"]],
    [actions.LIST_FUNCTIONAL_ANOMALIES, false, ["records"]],
    [actions.REMOVE_FUNCTIONAL_ANOMALIES, true, ["records"]],
    [actions.CLEAR_FUNCTIONAL_ANOMALIES, true, ["records"]]
  ];
  assert.equal(new Set(cases.map(([action]) => action)).size, 4);
  for (const [action, mutates, responseFields] of cases) {
    const spec = specs[action];
    assert.ok(spec, `missing contract for ${action}`);
    assert.equal(spec.senderClass, "extension-page");
    assert.equal(spec.authorize, "verifyExtensionPage");
    assert.equal(spec.mutates, mutates);
    assert.deepEqual(Object.keys(spec.response.required), responseFields);
  }
  assert.equal(specs[actions.REMOVE_FUNCTIONAL_ANOMALIES].payload.required.id, "string");
  assert.equal(Object.hasOwn(specs[actions.RECORD_FUNCTIONAL_ANOMALIES].payload.optional, "href"), false);
  assert.equal(specs[actions.RECORD_FUNCTIONAL_ANOMALIES].payload.optional.delivered, "boolean");

  const runtime = read("background/runtime.js");
  assert.match(runtime, /createFunctionalAnomalyStore\(chrome\)/);
  for (const name of [
    "RECORD_FUNCTIONAL_ANOMALIES",
    "LIST_FUNCTIONAL_ANOMALIES",
    "REMOVE_FUNCTIONAL_ANOMALIES",
    "CLEAR_FUNCTIONAL_ANOMALIES"
  ]) {
    assert.match(runtime, new RegExp(`\\[REQUEST\\.${name},`), `missing background handler for ${name}`);
  }
  assert.doesNotMatch(read("shared/storage-adapter.js"), /functionalAnomalies/);

  console.log("functional anomaly extension-page contracts and background ownership: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
