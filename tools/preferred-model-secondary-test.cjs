#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

async function waitUntil(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  assert.fail(message);
}

const previousGlobals = {
  consoleWarn: console.warn,
  document: globalThis.document,
  window: globalThis.window
};
console.warn = () => {};
globalThis.document = {
  addEventListener() {},
  querySelectorAll() { return []; }
};
globalThis.window = {
  setTimeout: globalThis.setTimeout.bind(globalThis)
};

(async () => {
  const { createPreferredModelController } = await import(moduleUrl("app/preferred-model/controller.js"));
  const {
    GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
    MODEL_PREFERENCE_SECONDARY_ENABLED_KEY,
    MODEL_PREFERENCE_SECONDARY_KEYS,
    NOTION_ALL_SOURCES_PREFERENCE_KEY
  } = await import(moduleUrl("shared/constants.js"));

  async function runScenario({ appId = "NotionAI", preferences = {}, respond }) {
    const calls = [];
    const anomalies = [];
    const iframe = {
      isConnected: true,
      contentWindow: {},
      dataset: {
        instanceId: `instance-${appId}`,
        preferredModelDocumentId: `document-${appId}`,
        preferredModelContentBridgeVersion: "test-bridge"
      },
      closest() { return null; }
    };
    const app = { id: appId, name: appId, url: `https://${appId.toLowerCase()}.example/` };
    const state = {
      frameLoadingInstanceIds: [],
      modelPreferenceDraft: { ...preferences },
      options: {
        frameToastPosition: { x: 50, y: 50 },
        modelPreferences: { ...preferences }
      },
      preferredModelGateFailedAppIds: [],
      preferredModelGateFailedCount: 0,
      preferredModelGatePendingCount: 0,
      preferredModelGateReason: "",
      preferredModelGateState: "bootstrapping"
    };
    const controller = createPreferredModelController({
      state,
      workspace: {
        currentFrames: () => [iframe],
        frameApp: (candidate) => candidate === iframe ? app : null
      },
      framePort: {
        async request(candidate, command, data, options) {
          assert.equal(candidate, iframe);
          assert.equal(command, "applyPreferredModel");
          assert.equal(options.expectedDocumentId, iframe.dataset.preferredModelDocumentId);
          const call = { ...data };
          calls.push(call);
          const values = await respond(call, calls.length - 1);
          return {
            appId: call.appId,
            modelId: call.modelId,
            runId: call.runId,
            ...values
          };
        }
      },
      appRoot: {},
      verifiedCurrentContentFrameRegistration: async () => ({
        documentId: iframe.dataset.preferredModelDocumentId
      }),
      prepareContentFrameRuntime: async () => ({ ok: false }),
      recordFunctionalAnomaly: async (anomaly) => { anomalies.push(anomaly); }
    });
    controller.finishBootstrapping();
    const record = controller.schedulePreferredModelApplyToFrame(iframe, { immediate: true });
    assert.ok(record, "a configured preferred model must create one logical apply record");
    const readiness = await waitUntil(() => {
      const current = controller.preferredModelFrameReadiness(iframe);
      return ["ready", "failed"].includes(current.state) ? current : null;
    }, `${appId} preferred-model scenario did not settle`);
    await new Promise((resolve) => { setImmediate(resolve); });
    return { calls, anomalies, iframe, readiness };
  }

  const explicitlyUnavailable = {
    ok: true,
    skipped: true,
    unavailable: true,
    fallbackEligible: true,
    selectionActivated: false,
    menuClosed: true,
    interactionCount: 1,
    reason: ""
  };

  {
    const outcome = await runScenario({
      preferences: {
        NotionAI: "opus47",
        [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: true,
        [MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI]: "fable5",
        [NOTION_ALL_SOURCES_PREFERENCE_KEY]: "enabled"
      },
      respond: (_call, index) => index === 0
        ? explicitlyUnavailable
        : { ok: true, changed: true, interactionCount: 1, reason: "" }
    });
    assert.equal(outcome.readiness.state, "ready");
    assert.equal(outcome.readiness.requestedModelId, "opus47");
    assert.equal(outcome.readiness.appliedModelId, "fable5");
    assert.equal(outcome.readiness.fallbackAttempted, true);
    assert.equal(outcome.readiness.fallbackUsed, true);
    assert.deepEqual(outcome.calls.map((call) => call.modelId), ["opus47", "fable5"]);
    assert.notEqual(
      outcome.calls[0].runId,
      outcome.calls[1].runId,
      "the secondary attempt must receive a fresh correlation id"
    );
    assert.ok(
      outcome.calls.every((call) => call.allSourcesState === "enabled"),
      "Notion All sources desired state must survive both model attempts"
    );
    assert.ok(
      outcome.calls.every((call) => !("secondaryModelId" in call)),
      "content frames must receive exactly one attempted model per command"
    );
    assert.match(outcome.readiness.frameKey, /:secondary=fable5:/);
    assert.equal(outcome.anomalies.length, 0, "a successful secondary attempt must not record an anomaly");
  }

  {
    const outcome = await runScenario({
      preferences: {
        NotionAI: "opus47",
        [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: false,
        [MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI]: "fable5"
      },
      respond: () => explicitlyUnavailable
    });
    assert.equal(outcome.readiness.state, "failed");
    assert.equal(outcome.calls.length, 1, "a configured secondary model must remain inactive while the feature is off");
    assert.equal(outcome.readiness.fallbackAttempted, false);
    assert.equal(outcome.readiness.fallbackUsed, false);
    assert.doesNotMatch(outcome.readiness.frameKey, /secondary=/);
    assert.equal(outcome.anomalies.length, 1);
  }

  for (const [name, primaryResult] of [
    ["selection did not settle", {
      ok: false,
      reason: "selection did not settle",
      interactionCount: 1
    }],
    ["menu cleanup failed", {
      ...explicitlyUnavailable,
      fallbackEligible: false,
      menuClosed: false
    }],
    ["selection was activated", {
      ...explicitlyUnavailable,
      selectionActivated: true
    }],
    ["reason text alone", {
      ok: false,
      reason: "model unavailable",
      interactionCount: 0
    }]
  ]) {
    const outcome = await runScenario({
      preferences: {
        NotionAI: "opus47",
        [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: true,
        [MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI]: "fable5"
      },
      respond: () => primaryResult
    });
    assert.equal(outcome.readiness.state, "failed", `${name} must fail without secondary activation`);
    assert.equal(outcome.calls.length, 1, `${name} must not issue a secondary command`);
    assert.equal(outcome.readiness.fallbackAttempted, false);
  }

  {
    const outcome = await runScenario({
      preferences: {
        NotionAI: "opus47",
        [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: true,
        [MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI]: "fable5"
      },
      respond: (_call, index) => index === 0
        ? explicitlyUnavailable
        : { ok: false, reason: "secondary selection failed", interactionCount: 1 }
    });
    assert.equal(outcome.readiness.state, "failed");
    assert.equal(outcome.readiness.fallbackAttempted, true);
    assert.equal(outcome.readiness.fallbackUsed, false);
    assert.equal(outcome.calls.length, 2);
    assert.match(outcome.readiness.reason, /unavailable/i);
    assert.match(outcome.readiness.reason, /secondary selection failed/i);
    assert.equal(
      outcome.anomalies.length,
      1,
      "failure handling and anomaly reporting must wait until both model attempts fail"
    );
  }

  {
    const outcome = await runScenario({
      preferences: {
        NotionAI: "opus47",
        [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: true,
        [MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI]: "fable5"
      },
      respond: (_call, index) => index === 0
        ? {
            ok: false,
            reason: "selection did not settle",
            fallbackEligible: true,
            selectionActivated: true,
            selectionUnsettled: true,
            menuClosed: true,
            interactionCount: 1
          }
        : { ok: true, changed: true, interactionCount: 1, reason: "" }
    });
    assert.equal(outcome.readiness.state, "ready");
    assert.equal(outcome.readiness.requestedModelId, "opus47");
    assert.equal(outcome.readiness.appliedModelId, "fable5");
    assert.equal(outcome.readiness.fallbackAttempted, true);
    assert.equal(outcome.readiness.fallbackUsed, true);
    assert.deepEqual(outcome.calls.map((call) => call.modelId), ["opus47", "fable5"]);
  }

  {
    const outcome = await runScenario({
      appId: "Gemini",
      preferences: {
        Gemini: "fast",
        [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: true,
        [MODEL_PREFERENCE_SECONDARY_KEYS.Gemini]: "pro",
        [GEMINI_THINKING_LEVEL_PREFERENCE_KEY]: "extended"
      },
      respond: (_call, index) => index === 0
        ? explicitlyUnavailable
        : { ok: true, changed: true, interactionCount: 1, reason: "" }
    });
    assert.equal(outcome.readiness.state, "ready");
    assert.equal(outcome.calls[0].modelId, "fast");
    assert.equal("thinkingLevel" in outcome.calls[0], false, "non-Pro attempts must not receive thinking level");
    assert.equal(outcome.calls[1].modelId, "pro");
    assert.equal(
      outcome.calls[1].thinkingLevel,
      "extended",
      "Gemini thinking level must be computed for the actual secondary Pro attempt"
    );
  }

  console.log("preferred-model secondary fallback controller: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
}).finally(() => {
  for (const [key, value] of Object.entries(previousGlobals)) {
    if (key === "consoleWarn") {
      console.warn = value;
      continue;
    }
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});
