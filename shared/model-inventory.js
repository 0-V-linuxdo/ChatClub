import { normalizeApiOptions } from "./api-options.js";
import {
  API_PROFILE_ENDPOINT_DEFAULT,
  API_PROFILE_MODEL_DEFAULT,
  DEFAULT_MODEL_PREFERENCE_ORDER,
  DEFAULT_MODEL_PREFERENCES,
  MODEL_PREFERENCE_SECONDARY_ENABLED_KEY,
  MODEL_PREFERENCE_SECONDARY_KEYS,
  MODEL_PREFERENCE_TARGETS
} from "./constants.js";
import { isModelPreferenceLabel } from "./model-preference-selection.js";

const OUTBOUND_INVENTORY_SLOTS = Object.freeze([
  Object.freeze({ id: "optimize", purpose: "optimize", featureKey: "inventory.optimize" }),
  Object.freeze({ id: "summary", purpose: "summary", featureKey: "inventory.summary" }),
  Object.freeze({ id: "topicTitle", purpose: "topicTitle", featureKey: "inventory.topicTitle" })
]);

export function apiProfileModel(profile) {
  return String(profile?.model || "").trim() || API_PROFILE_MODEL_DEFAULT;
}

function apiEndpointHost(endpoint) {
  const value = String(endpoint || "").trim();
  if (!value) return "";
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//i, "").split("/")[0] || value;
  }
}

export function apiProfileSelectLabel(profile) {
  const name = String(profile?.name || profile?.id || "").trim();
  const model = apiProfileModel(profile);
  if (name && model) return `${name} · ${model}`;
  return name || model;
}

export function resolveApiProfile(options, purpose) {
  const normalized = normalizeApiOptions(options || {});
  const id = purpose === "summary"
    ? normalized.summaryApiProfileId
    : purpose === "topicTitle"
      ? normalized.topicTitleApiProfileId
      : normalized.optimizeApiProfileId;
  return normalized.apiProfiles.find((profile) => profile.id === id) || normalized.apiProfiles[0] || {
    id: "default",
    name: "Default API",
    endpoint: API_PROFILE_ENDPOINT_DEFAULT,
    apiKey: "",
    model: API_PROFILE_MODEL_DEFAULT
  };
}

function iframePreferenceLabel(stored, appId) {
  if (isModelPreferenceLabel(stored)) return String(stored.label || "").trim();
  const id = String(stored || "");
  if (!id) return "";
  const target = (MODEL_PREFERENCE_TARGETS[appId] || []).find((item) => item.id === id);
  return String(target?.label || id);
}

function iframePreferenceOrder(options = {}) {
  const requested = Array.isArray(options.modelPreferenceOrder) ? options.modelPreferenceOrder : [];
  const known = new Set(DEFAULT_MODEL_PREFERENCE_ORDER);
  const ordered = [];
  const seen = new Set();
  for (const appId of [...requested, ...DEFAULT_MODEL_PREFERENCE_ORDER]) {
    if (!known.has(appId) || seen.has(appId)) continue;
    seen.add(appId);
    ordered.push(appId);
  }
  return ordered;
}

export function listModelInventory(options = {}) {
  const outbound = OUTBOUND_INVENTORY_SLOTS.map((slot) => {
    const profile = resolveApiProfile(options, slot.purpose);
    return {
      world: "outbound",
      id: slot.id,
      purpose: slot.purpose,
      featureKey: slot.featureKey,
      profileId: String(profile.id || ""),
      profileName: String(profile.name || profile.id || ""),
      model: apiProfileModel(profile),
      host: apiEndpointHost(profile.endpoint || API_PROFILE_ENDPOINT_DEFAULT)
    };
  });
  const preferences = {
    ...DEFAULT_MODEL_PREFERENCES,
    ...(options.modelPreferences || {})
  };
  const secondaryEnabled = preferences[MODEL_PREFERENCE_SECONDARY_ENABLED_KEY] === true;
  const iframe = iframePreferenceOrder(options).map((appId) => {
    const secondaryKey = MODEL_PREFERENCE_SECONDARY_KEYS[appId];
    return {
      world: "iframe",
      id: appId,
      featureKey: `inventory.platform.${appId}`,
      primary: iframePreferenceLabel(preferences[appId], appId),
      secondary: secondaryEnabled ? iframePreferenceLabel(preferences[secondaryKey], appId) : "",
      secondaryEnabled
    };
  });
  return { outbound, iframe };
}
