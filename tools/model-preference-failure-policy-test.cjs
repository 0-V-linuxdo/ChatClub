#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const constants = await import("../shared/constants.js");
  const {
    dehydrateOptions,
    normalizeModelPreferenceFailureOverrides,
    normalizeModelPreferenceFailurePolicy,
    normalizeOptions
  } = await import("../shared/storage-schema.js");

  assert.equal(constants.DEFAULT_MODEL_PREFERENCE_FAILURE_POLICY, "send-current");
  assert.deepEqual(constants.MODEL_PREFERENCE_FAILURE_POLICIES, ["send-current", "skip"]);
  assert.deepEqual(
    constants.MODEL_PREFERENCE_FAILURE_OVERRIDE_POLICIES,
    ["inherit", "send-current", "skip"]
  );
  assert.equal(Object.isFrozen(constants.MODEL_PREFERENCE_FAILURE_POLICIES), true);
  assert.equal(Object.isFrozen(constants.MODEL_PREFERENCE_FAILURE_OVERRIDE_POLICIES), true);
  assert.deepEqual(constants.DEFAULT_MODEL_PREFERENCE_FAILURE_OVERRIDES, {
    Gemini: "inherit",
    Grok: "inherit",
    DeepSeek: "inherit",
    NotionAI: "inherit"
  });

  assert.equal(normalizeModelPreferenceFailurePolicy("skip"), "skip");
  assert.equal(normalizeModelPreferenceFailurePolicy("send-current"), "send-current");
  for (const invalid of [undefined, null, "", "retry", {}, []]) {
    assert.equal(normalizeModelPreferenceFailurePolicy(invalid), "send-current");
  }

  assert.deepEqual(normalizeModelPreferenceFailureOverrides({
    Gemini: "skip",
    Grok: "send-current",
    DeepSeek: "invalid",
    NotionAI: "inherit",
    Unknown: "skip"
  }), {
    Gemini: "skip",
    Grok: "send-current",
    DeepSeek: "inherit",
    NotionAI: "inherit"
  });
  assert.deepEqual(
    normalizeModelPreferenceFailureOverrides(null),
    constants.DEFAULT_MODEL_PREFERENCE_FAILURE_OVERRIDES
  );

  const defaults = normalizeOptions({});
  assert.equal(defaults.modelPreferenceFailurePolicy, "send-current");
  assert.deepEqual(
    defaults.modelPreferenceFailureOverrides,
    constants.DEFAULT_MODEL_PREFERENCE_FAILURE_OVERRIDES
  );

  const normalized = normalizeOptions({
    modelPreferenceFailurePolicy: "skip",
    modelPreferenceFailureOverrides: {
      Gemini: "send-current",
      Grok: "skip",
      DeepSeek: "inherit",
      NotionAI: "skip"
    }
  });
  assert.equal(normalized.modelPreferenceFailurePolicy, "skip");
  assert.deepEqual(normalized.modelPreferenceFailureOverrides, {
    Gemini: "send-current",
    Grok: "skip",
    DeepSeek: "inherit",
    NotionAI: "skip"
  });

  const exported = dehydrateOptions(normalized);
  assert.equal(exported.modelPreferenceFailurePolicy, "skip");
  assert.deepEqual(exported.modelPreferenceFailureOverrides, normalized.modelPreferenceFailureOverrides);
  assert.deepEqual(
    normalizeOptions(JSON.parse(JSON.stringify(exported))).modelPreferenceFailureOverrides,
    normalized.modelPreferenceFailureOverrides
  );

  const invalidExport = dehydrateOptions({
    modelPreferenceFailurePolicy: "retry",
    modelPreferenceFailureOverrides: { Gemini: "retry", Grok: "skip" }
  });
  assert.equal(invalidExport.modelPreferenceFailurePolicy, "send-current");
  assert.deepEqual(invalidExport.modelPreferenceFailureOverrides, {
    Gemini: "inherit",
    Grok: "skip",
    DeepSeek: "inherit",
    NotionAI: "inherit"
  });

  console.log("preferred-model failure policy normalization and round-trip: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
