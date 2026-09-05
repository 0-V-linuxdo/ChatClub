import {
  MODEL_PREFERENCE_LABEL_MAX_CHARS,
  customModelPreferenceId,
  modelPreferenceTextKey
} from "./model-preference-selection.js";

function target(id, label, aliases = []) {
  return Object.freeze({
    id,
    label,
    aliases: Object.freeze([...aliases])
  });
}

export const NOTION_MODEL_TARGETS = Object.freeze({
  auto: target("auto", "Auto", ["Automatic"]),
  sonnet46: target("sonnet46", "Claude Sonnet 4.6", ["Sonnet 4.6"]),
  sonnet5: target("sonnet5", "Claude Sonnet 5", ["Sonnet 5"]),
  opus47: target("opus47", "Claude Opus 4.7", ["Opus 4.7"]),
  opus48: target("opus48", "Claude Opus 4.8", ["Opus 4.8"]),
  opus5: target("opus5", "Claude Opus 5", ["Opus 5", "Opus 5 New", "Opus5New"]),
  fable5: target("fable5", "Claude Fable 5", ["Fable 5", "Fable 5 Beta", "Fable5Beta"]),
  fable51: target("fable51", "Claude Fable 5.1", ["Fable 5.1", "Fable 5.1 Beta", "Fable5.1Beta"]),
  gemini31pro: target("gemini31pro", "Gemini 3.1 Pro"),
  gemini35flash: target("gemini35flash", "Gemini 3.5 Flash"),
  gpt56sol: target("gpt56sol", "GPT-5.6 Sol", ["GPT 5.6 Sol"]),
  gpt56terra: target("gpt56terra", "GPT-5.6 Terra", ["GPT 5.6 Terra"]),
  gpt52: target("gpt52", "GPT-5.2", ["GPT 5.2"]),
  gpt54: target("gpt54", "GPT-5.4", ["GPT 5.4"]),
  gpt55: target("gpt55", "GPT-5.5", ["GPT 5.5"]),
  gpt6astra: target("gpt6astra", "GPT-6 Astra", ["GPT 6 Astra", "GPT-6Astra"]),
  grok43: target("grok43", "Grok 4.3"),
  grok45: target("grok45", "Grok 4.5"),
  grokBuild01: target("grokBuild01", "Grok Build 0.1", ["Grok Build 01"]),
  kimi26: target("kimi26", "Kimi K2.6"),
  kimi27code: target("kimi27code", "Kimi K2.7 Code"),
  kimi3: target("kimi3", "Kimi K3"),
  deepseekV4Pro: target("deepseekV4Pro", "DeepSeek V4 Pro"),
  glm52: target("glm52", "GLM 5.2", ["GLM-5.2"])
});

export const NOTION_MODEL_PREFERENCE_TARGETS = Object.freeze([
  Object.freeze({ id: "", label: "" }),
  ...Object.values(NOTION_MODEL_TARGETS).map((item) => Object.freeze({
    id: item.id,
    label: item.label,
    aliases: item.aliases
  }))
]);

function resolveNotionShippedModelId(label) {
  const key = modelPreferenceTextKey(label);
  if (!key) return "";
  for (const item of Object.values(NOTION_MODEL_TARGETS)) {
    const labels = [item.id, item.label, ...(item.aliases || [])];
    if (labels.some((candidate) => modelPreferenceTextKey(candidate) === key)) return item.id;
  }
  return "";
}

export function resolveNotionApplyTarget(modelId, modelLabel = "") {
  const requestedId = String(modelId || "").trim();
  const label = String(modelLabel || "").trim().slice(0, MODEL_PREFERENCE_LABEL_MAX_CHARS);
  const shippedId = NOTION_MODEL_TARGETS[requestedId]
    ? requestedId
    : resolveNotionShippedModelId(label);
  if (shippedId) {
    return Object.freeze({
      id: shippedId,
      known: true,
      custom: false,
      targets: NOTION_MODEL_TARGETS
    });
  }
  if (!label) {
    return Object.freeze({
      id: requestedId,
      known: false,
      custom: false,
      targets: NOTION_MODEL_TARGETS
    });
  }
  const customId = customModelPreferenceId(label);
  const custom = Object.freeze({
    id: customId,
    label,
    aliases: Object.freeze([])
  });
  return Object.freeze({
    id: customId,
    known: true,
    custom: true,
    targets: Object.freeze({ ...NOTION_MODEL_TARGETS, [customId]: custom })
  });
}
