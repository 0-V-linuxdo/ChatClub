#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { createAppState, createFeatureStatePorts } = await import("../app/state.js");
  const {
    createFunctionalAnomalyController,
    settledOperationFailure
  } = await import("../app/functional-anomalies/controller.js");
  const { BACKGROUND_REQUEST_ACTIONS: actions } = await import("../shared/background-requests.js");

  const rootState = createAppState();
  const ports = createFeatureStatePorts(rootState);
  assert.deepEqual(rootState.functionalAnomalyRecords, []);
  assert.ok(ports.functionalAnomalies);
  assert.throws(() => ports.functionalAnomalies.promptText, /functionalAnomalies cannot read/);
  assert.equal(settledOperationFailure({ status: "fulfilled", value: true }, "failed"), null);
  assert.match(settledOperationFailure({ status: "fulfilled", value: false }, "did not start").message, /did not start/);
  const rejectedFailure = new Error("rejected");
  assert.equal(settledOperationFailure({ status: "rejected", reason: rejectedFailure }, "failed"), rejectedFailure);

  const calls = [];
  let failAction = "";
  const serverRecords = [{
    id: "record-1",
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    count: 1,
    fingerprint: "internal",
    feature: "topic-delete",
    operation: "confirm",
    host: "gemini.google.com"
  }];
  async function requestBackground(action, payload) {
    calls.push({ action, payload });
    if (action === failAction) throw new Error("transport failed");
    if (action === actions.RECORD_FUNCTIONAL_ANOMALIES) return { record: serverRecords[0], records: serverRecords };
    if (action === actions.LIST_FUNCTIONAL_ANOMALIES) return { records: serverRecords };
    if (action === actions.REMOVE_FUNCTIONAL_ANOMALIES) return { records: [] };
    if (action === actions.CLEAR_FUNCTIONAL_ANOMALIES) return { records: [] };
    throw new Error(`Unexpected action: ${action}`);
  }

  const controller = createFunctionalAnomalyController({
    state: ports.functionalAnomalies,
    requestBackground,
    appVersion: "test-version",
    surface: "Tabbit"
  });
  assert.equal(Object.isFrozen(controller), true);
  assert.deepEqual(Object.keys(controller), ["record", "refresh", "remove", "clear", "snapshot", "subscribe", "exportText"]);

  const notifications = [];
  const unsubscribe = controller.subscribe((records) => notifications.push(records));
  const error = Object.assign(new Error("delete failed"), {
    code: "REMOTE_ERROR",
    delivered: true,
    reason: "confirmation remained visible",
    stack: "private stack"
  });
  const recorded = await controller.record({
    feature: "topic-delete",
    operation: "confirm",
    appId: "gemini",
    appName: "Gemini",
    href: "https://gemini.google.com/app/private?id=secret#hash",
    error,
    severity: "error",
    prompt: "private prompt",
    cookies: "private cookies",
    apiKey: "private key"
  });
  assert.equal(recorded.id, "record-1");
  const recordCall = calls.at(-1);
  assert.equal(recordCall.action, actions.RECORD_FUNCTIONAL_ANOMALIES);
  assert.equal(recordCall.payload.host, "gemini.google.com");
  assert.equal(recordCall.payload.errorName, "Error");
  assert.equal(recordCall.payload.errorCode, "REMOTE_ERROR");
  assert.equal(recordCall.payload.delivered, true);
  assert.equal(recordCall.payload.reason, "confirmation remained visible");
  assert.equal(recordCall.payload.message, "delete failed");
  assert.equal(recordCall.payload.appVersion, "test-version");
  assert.equal(recordCall.payload.surface, "Tabbit");
  for (const forbidden of ["href", "error", "stack", "prompt", "cookies", "apiKey"]) {
    assert.equal(Object.hasOwn(recordCall.payload, forbidden), false, `${forbidden} must not cross the logging request`);
  }
  assert.equal(rootState.functionalAnomalyRecords.length, 1);
  assert.equal(notifications.length, 1);

  const providerError = new Error('{"message":"Your prompt was My medical chat"}');
  providerError.code = 422;
  Object.defineProperty(providerError, "functionalAnomalyMessage", {
    value: "API request failed with HTTP 400"
  });
  await controller.record({
    feature: "summary",
    operation: "generate",
    error: providerError,
    message: providerError.message
  });
  assert.equal(calls.at(-1).payload.message, "API request failed with HTTP 400");
  assert.equal(calls.at(-1).payload.errorCode, "422");
  assert.doesNotMatch(JSON.stringify(calls.at(-1).payload), /My medical chat/);

  const snapshot = controller.snapshot();
  snapshot[0].feature = "mutated clone";
  assert.equal(rootState.functionalAnomalyRecords[0].feature, "topic-delete");
  assert.doesNotMatch(controller.exportText(), /fingerprint|internal/);
  assert.equal(JSON.parse(controller.exportText([serverRecords[0]])).records.length, 1);

  await controller.refresh();
  await controller.remove("record-1");
  await controller.clear();
  assert.equal(notifications.length, 5);
  unsubscribe();
  await controller.refresh();
  assert.equal(notifications.length, 5);

  failAction = actions.RECORD_FUNCTIONAL_ANOMALIES;
  assert.equal(await controller.record({ error: new Error("ignored") }), null, "recording failures must be swallowed");
  failAction = actions.LIST_FUNCTIONAL_ANOMALIES;
  await assert.rejects(() => controller.refresh(), /transport failed/);

  console.log("functional anomaly state port and frozen controller API: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
