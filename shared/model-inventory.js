import {
  apiProfileModel,
  apiProfileModels,
  normalizeApiOptions,
  resolveApiSlotModel
} from "./api-options.js";
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

export { apiProfileModel, apiProfileModels } from "./api-options.js";

export const OUTBOUND_INVENTORY_SLOTS = Object.freeze([
  Object.freeze({
    id: "optimize",
    purpose: "optimize",
    featureKey: "inventory.optimize",
    profileKey: "optimizeApiProfileId",
    modelKey: "optimizeApiModel",
    profileToastKey: "toast.optimizeProfileSaved",
    modelToastKey: "toast.outboundModelSaved"
  }),
  Object.freeze({
    id: "summary",
    purpose: "summary",
    featureKey: "inventory.summary",
    profileKey: "summaryApiProfileId",
    modelKey: "summaryApiModel",
    profileToastKey: "toast.summaryProfileSaved",
    modelToastKey: "toast.outboundModelSaved"
  }),
  Object.freeze({
    id: "topicTitle",
    purpose: "topicTitle",
    featureKey: "inventory.topicTitle",
    profileKey: "topicTitleApiProfileId",
    modelKey: "topicTitleApiModel",
    profileToastKey: "toast.topicTitleProfileSaved",
    modelToastKey: "toast.outboundModelSaved"
  })
]);

function readableOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) return {};
  return { ...options };
}

function requestedWorlds(worlds) {
  if (worlds == null) return { outbound: true, iframe: true };
  const list = Array.isArray(worlds) ? worlds : [worlds];
  return {
    outbound: list.includes("outbound"),
    iframe: list.includes("iframe")
  };
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

function fallbackApiProfile() {
  return {
    id: "default",
    name: "Default API",
    endpoint: API_PROFILE_ENDPOINT_DEFAULT,
    apiKey: "",
    model: API_PROFILE_MODEL_DEFAULT,
    models: [API_PROFILE_MODEL_DEFAULT]
  };
}

function outboundSlotFor(purpose) {
  return OUTBOUND_INVENTORY_SLOTS.find((slot) => slot.purpose === purpose) || OUTBOUND_INVENTORY_SLOTS[0];
}

export function apiProfileNameLabel(profile) {
  return String(profile?.name || profile?.id || "").trim();
}

export function apiProfileSelectLabel(profile) {
  const name = apiProfileNameLabel(profile);
  const model = apiProfileModel(profile);
  if (name && model) return `${name} · ${model}`;
  return name || model;
}

export function resolveApiProfile(options, purpose) {
  const normalized = normalizeApiOptions(readableOptions(options));
  const slot = outboundSlotFor(purpose);
  const profile = normalized.apiProfiles.find((item) => item.id === normalized[slot.profileKey])
    || normalized.apiProfiles[0]
    || fallbackApiProfile();
  const catalog = apiProfileModels(profile);
  const requested = resolveApiSlotModel(profile, normalized[slot.modelKey]);
  const model = requested || catalog[0] || apiProfileModel(profile);
  return { ...profile, model };
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

export function listModelInventory(options = {}, worlds) {
  const include = requestedWorlds(worlds);
  const source = readableOptions(options);
  const outbound = include.outbound
    ? OUTBOUND_INVENTORY_SLOTS.map((slot) => {
      const profile = resolveApiProfile(source, slot.purpose);
      const catalog = Array.isArray(profile.models) && profile.models.length
        ? profile.models.filter((item, index, list) => item && list.indexOf(item) === index)
        : apiProfileModels(profile);
      return {
        world: "outbound",
        id: slot.id,
        purpose: slot.purpose,
        featureKey: slot.featureKey,
        profileKey: slot.profileKey,
        modelKey: slot.modelKey,
        profileToastKey: slot.profileToastKey,
        modelToastKey: slot.modelToastKey,
        profileId: String(profile.id || ""),
        profileName: String(profile.name || profile.id || ""),
        model: apiProfileModel(profile),
        models: catalog,
        host: apiEndpointHost(profile.endpoint || API_PROFILE_ENDPOINT_DEFAULT)
      };
    })
    : [];
  if (!include.iframe) return { outbound, iframe: [] };
  const preferences = {
    ...DEFAULT_MODEL_PREFERENCES,
    ...(source.modelPreferences || {})
  };
  const secondaryEnabled = preferences[MODEL_PREFERENCE_SECONDARY_ENABLED_KEY] === true;
  const iframe = iframePreferenceOrder(source).map((appId) => {
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
