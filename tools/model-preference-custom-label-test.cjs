#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => `${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}`;

async function main() {
  const {
    MODEL_PREFERENCE_CUSTOM_KIND,
    MODEL_PREFERENCE_CUSTOM_SELECT_VALUE,
    MODEL_PREFERENCE_LABEL_MAX_CHARS,
    customModelPreferenceId,
    isModelPreferenceCustomId,
    isModelPreferenceLabel,
    modelPreferenceIdentityKey,
    modelPreferenceSelectValue,
    normalizeModelPreferenceValue,
    preferredModelApplyIdentity
  } = await import(moduleUrl("shared/model-preference-selection.js"));
  const { dehydrateOptions, normalizeOptions } = await import(moduleUrl("shared/storage-schema.js"));
  const { MODEL_PREFERENCE_SECONDARY_ENABLED_KEY, MODEL_PREFERENCE_SECONDARY_KEYS, MODEL_PREFERENCE_TARGETS } = await import(
    moduleUrl("shared/constants.js")
  );
  const { preferredModelTargetLabel } = await import(
    moduleUrl("app/preferred-model/selection-overlay-controller.js")
  );

  const notionTargets = MODEL_PREFERENCE_TARGETS.NotionAI;

  assert.equal(normalizeModelPreferenceValue("bogus", notionTargets, { allowCustom: true }), "");
  assert.equal(normalizeModelPreferenceValue("opus5", notionTargets, { allowCustom: true }), "opus5");
  assert.equal(
    normalizeModelPreferenceValue("fable51", notionTargets, { allowCustom: true }),
    "fable51"
  );
  assert.deepEqual(
    normalizeModelPreferenceValue(
      { kind: MODEL_PREFERENCE_CUSTOM_KIND, label: "GPT-7 Nova" },
      notionTargets,
      { allowCustom: true }
    ),
    { kind: "label", label: "GPT-7 Nova" }
  );
  assert.equal(
    normalizeModelPreferenceValue(
      { kind: MODEL_PREFERENCE_CUSTOM_KIND, label: "Fable 5.1 Beta" },
      notionTargets,
      { allowCustom: true }
    ),
    "fable51",
    "a custom label that matches a shipped alias must coerce to that id"
  );
  assert.equal(
    normalizeModelPreferenceValue(
      { kind: MODEL_PREFERENCE_CUSTOM_KIND, label: "GPT-6 Astra" },
      notionTargets,
      { allowCustom: true }
    ),
    "gpt6astra"
  );
  assert.equal(
    normalizeModelPreferenceValue(
      { kind: MODEL_PREFERENCE_CUSTOM_KIND, label: "Auto" },
      notionTargets,
      { allowCustom: true }
    ),
    "auto",
    "typing Auto must become the shipped Auto row, not a custom router pool"
  );
  assert.equal(
    normalizeModelPreferenceValue(
      { kind: MODEL_PREFERENCE_CUSTOM_KIND, label: "GPT-7 Nova" },
      notionTargets,
      { allowCustom: false }
    ),
    ""
  );
  assert.equal(
    normalizeModelPreferenceValue("not-a-real-id", notionTargets, { allowCustom: true }),
    "",
    "unknown shipped ids must still wipe even when custom labels are allowed"
  );
  assert.equal(
    normalizeModelPreferenceValue(
      { kind: MODEL_PREFERENCE_CUSTOM_KIND, label: "   " },
      notionTargets,
      { allowCustom: true }
    ),
    ""
  );
  const longLabel = "N".repeat(MODEL_PREFERENCE_LABEL_MAX_CHARS + 8);
  assert.equal(
    normalizeModelPreferenceValue(
      { kind: MODEL_PREFERENCE_CUSTOM_KIND, label: longLabel },
      notionTargets,
      { allowCustom: true }
    ).label.length,
    MODEL_PREFERENCE_LABEL_MAX_CHARS
  );

  const stored = normalizeOptions({
    modelPreferences: {
      NotionAI: { kind: "label", label: "GPT-7 Nova" },
      Gemini: { kind: "label", label: "Hidden custom" }
    }
  }).modelPreferences;
  assert.deepEqual(stored.NotionAI, { kind: "label", label: "GPT-7 Nova" });
  assert.equal(stored.Gemini, "", "custom labels must not persist for platforms that cannot apply them");
  assert.equal(
    normalizeOptions({ modelPreferences: { NotionAI: "not-a-real-id" } }).modelPreferences.NotionAI,
    ""
  );

  const rehydrated = normalizeOptions(JSON.parse(JSON.stringify(dehydrateOptions({
    modelPreferences: { NotionAI: { kind: "label", label: "GPT-7 Nova" } }
  })))).modelPreferences;
  assert.deepEqual(rehydrated.NotionAI, { kind: "label", label: "GPT-7 Nova" });

  const duplicateSecondary = normalizeOptions({
    modelPreferences: {
      NotionAI: { kind: "label", label: "GPT-7 Nova" },
      [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: true,
      [MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI]: { kind: "label", label: "GPT-7Nova" }
    }
  }).modelPreferences;
  assert.deepEqual(duplicateSecondary.NotionAI, { kind: "label", label: "GPT-7 Nova" });
  assert.equal(
    duplicateSecondary[MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI],
    "",
    "primary and secondary custom names that share an identity must wipe secondary"
  );

  const distinctSecondary = normalizeOptions({
    modelPreferences: {
      NotionAI: { kind: "label", label: "GPT-7 Nova" },
      [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: true,
      [MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI]: "fable51"
    }
  }).modelPreferences;
  assert.equal(distinctSecondary[MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI], "fable51");

  const coercedSecondary = normalizeOptions({
    modelPreferences: {
      NotionAI: "fable51",
      [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: true,
      [MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI]: { kind: "label", label: "Fable 5.1 Beta" }
    }
  }).modelPreferences;
  assert.equal(
    coercedSecondary[MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI],
    "",
    "a custom secondary that coerces to the primary shipped id must wipe"
  );

  const identity = preferredModelApplyIdentity(
    { kind: "label", label: "GPT-7 Nova" },
    notionTargets,
    { allowCustom: true }
  );
  assert.equal(identity.modelId, customModelPreferenceId("GPT-7 Nova"));
  assert.equal(identity.modelLabel, "GPT-7 Nova");
  assert.equal(isModelPreferenceCustomId(identity.modelId), true);
  assert.equal(isModelPreferenceLabel(stored.NotionAI), true);
  assert.equal(modelPreferenceSelectValue(stored.NotionAI), MODEL_PREFERENCE_CUSTOM_SELECT_VALUE);
  assert.equal(modelPreferenceIdentityKey(stored.NotionAI), "label:gpt-7nova");
  assert.equal(
    preferredModelTargetLabel({
      appId: "NotionAI",
      modelId: identity.modelId,
      modelLabel: identity.modelLabel
    }),
    "GPT-7 Nova",
    "the apply overlay must show the exact picker name for a custom label"
  );
  assert.equal(
    preferredModelTargetLabel({ appId: "NotionAI", modelId: "fable51" }),
    "Claude Fable 5.1"
  );
  console.log("model-preference custom labels: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
