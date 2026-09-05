export const MODEL_PREFERENCE_CUSTOM_KIND = "label";
export const MODEL_PREFERENCE_CUSTOM_SELECT_VALUE = "__custom__";
export const MODEL_PREFERENCE_LABEL_MAX_CHARS = 80;

const MODEL_PREFERENCE_CUSTOM_ID_PREFIX = "label:";

export function modelPreferenceTextKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s\u200b\u200c\u200d]+/g, "");
}

export function isModelPreferenceCustomId(modelId) {
  return String(modelId || "").startsWith(MODEL_PREFERENCE_CUSTOM_ID_PREFIX);
}

export function customModelPreferenceId(label) {
  const key = modelPreferenceTextKey(valueLabel(label));
  return key ? `${MODEL_PREFERENCE_CUSTOM_ID_PREFIX}${key}` : "";
}

export function isModelPreferenceLabel(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && value.kind === MODEL_PREFERENCE_CUSTOM_KIND
    && valueLabel(value.label)
  );
}

export function modelPreferenceIdentityKey(value) {
  if (isModelPreferenceLabel(value)) return customModelPreferenceId(value.label);
  return String(value || "");
}

export function modelPreferenceSelectValue(value, customOpen = false) {
  if (customOpen || isModelPreferenceLabel(value)) return MODEL_PREFERENCE_CUSTOM_SELECT_VALUE;
  return String(value || "");
}

function shippedModelPreferenceId(value, targets = []) {
  const key = modelPreferenceTextKey(value);
  if (!key) return "";
  for (const target of targets || []) {
    const id = String(target?.id || "");
    if (!id) continue;
    const labels = [target.id, target.label, ...(target.aliases || [])];
    if (labels.some((label) => modelPreferenceTextKey(label) === key)) return id;
  }
  return "";
}

export function normalizeModelPreferenceValue(raw, targets = [], options = {}) {
  const allowCustom = options.allowCustom === true;
  const allowed = new Set((targets || []).map((target) => String(target?.id || "")).filter(Boolean));
  allowed.add("");
  if (raw && typeof raw === "object" && !Array.isArray(raw) && raw.kind === MODEL_PREFERENCE_CUSTOM_KIND) {
    if (!allowCustom) return "";
    const label = valueLabel(raw.label).slice(0, MODEL_PREFERENCE_LABEL_MAX_CHARS);
    if (!label) return "";
    return shippedModelPreferenceId(label, targets) || Object.freeze({
      kind: MODEL_PREFERENCE_CUSTOM_KIND,
      label
    });
  }
  const value = String(raw ?? "").trim();
  return allowed.has(value) ? value : "";
}

export function preferredModelApplyIdentity(raw, targets = [], options = {}) {
  const normalized = normalizeModelPreferenceValue(raw, targets, options);
  if (!normalized) return { modelId: "", modelLabel: "" };
  if (typeof normalized === "object") {
    return {
      modelId: customModelPreferenceId(normalized.label),
      modelLabel: normalized.label
    };
  }
  return { modelId: normalized, modelLabel: "" };
}

function valueLabel(value) {
  return String(value || "").trim();
}
