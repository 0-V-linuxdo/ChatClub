import { PROMPT_HISTORY_LIVE_CURSOR } from "./composer/history.js";

export function createAppState() {
  return {
    options: null,
    customConfig: [],
    promptLibrary: [],
    promptSendHistory: [],
    promptHistoryCursor: PROMPT_HISTORY_LIVE_CURSOR,
    promptHistoryDraft: "",
    pocketEntries: [],
    shortcutConfig: null,
    groups: [],
    activeTabs: {},
    frameLoadingInstanceIds: [],
    temporaryLayoutPreset: null,
    fullscreenGroupId: null,
    promptText: "",
    promptImages: [],
    promptSendInFlight: false,
    promptSelection: { start: 0, end: 0, direction: "none" },
    preferredModelGateState: "bootstrapping",
    preferredModelGateReason: "",
    preferredModelGatePendingCount: 0,
    preferredModelGateFailedCount: 0,
    preferredModelGateFailedAppIds: [],
    summaryOpen: false,
    summaryMaximized: false,
    summarySize: null,
    summaryBusy: false,
    summaryStatus: "",
    summaryError: "",
    summaryNotice: "",
    summaryLoadingPhase: "",
    summaryPreviewItems: [],
    summaryPreviewRefreshingKeys: [],
    summaryContexts: [],
    summaryDiagnostics: [],
    summaryExpandedKeys: [],
    summaryResult: "",
    summaryQuestion: "",
    summaryComposing: false,
    summaryView: "preview",
    summarySettingsTab: "ai",
    faviconCache: {},
    shortcutDraftConfig: null,
    shortcutRecordingAction: "",
    shortcutSettingsTab: "topbar",
    summaryCollectorEditingId: "",
    summaryCollectorDragId: "",
    messageNavigatorSiteExpandedId: "",
    messageNavigatorSettingsTab: "effects",
    topicDeleteSiteExpandedId: "",
    settingsAppsTab: "builtIn",
    settingsPromptTemplateDragId: "",
    settingsPromptLibraryDragId: "",
    settingsProfileDragId: "",
    settingsBuiltinAppDragId: "",
    settingsCustomAppDragId: "",
    settingsAppearanceTab: "workspace",
    settingsAppearanceTopbarTab: "placeholder",
    settingsTopbarPromptPlaceholderDraft: "",
    settingsTopbarPromptPlaceholderEditingIndex: -1,
    settingsTopbarPromptPlaceholderDragIndex: "",
    settingsTabGroupButtonPlacementDraft: null,
    settingsTabGroupButtonOrderDraft: null,
    settingsTabGroupButtonDragId: "",
    modelPreferenceDraft: null,
    topbarEditMode: false,
    topbarEditLayoutDraft: null,
    topbarEditDragId: ""
  };
}

function stateAccess(read = [], write = [], objects = {}) {
  return Object.freeze({
    read: Object.freeze([...new Set(read)]),
    write: Object.freeze([...new Set(write)]),
    objects: Object.freeze({ ...objects })
  });
}

function objectStateAccess(read = [], write = []) {
  return Object.freeze({
    read: Object.freeze([...new Set(read)]),
    write: Object.freeze([...new Set(write)])
  });
}

const APPEARANCE_OPTION_ACCESS = objectStateAccess([
  "colMaxCount", "frameLoadingOverlayOpacity", "frameToastPosition", "language", "primaryColor", "primaryColorCustom",
  "tabGroupButtonOrder", "tabGroupButtonPlacement", "tabGroupButtonsMode", "themeMode", "tooltipDisabledIds",
  "topbarPromptPlaceholderConfig"
], [
  "colMaxCount", "frameLoadingOverlayOpacity", "frameToastPosition", "language", "primaryColor", "primaryColorCustom",
  "tabGroupButtonOrder", "tabGroupButtonPlacement", "tabGroupButtonsMode", "themeMode", "tooltipDisabledIds",
  "topbarPromptPlaceholderConfig"
]);
const PROFILE_OPTION_ACCESS = objectStateAccess(
  ["apiProfiles", "optimizeApiProfileId", "summaryApiProfileId"],
  ["apiProfiles", "optimizeApiProfileId", "summaryApiProfileId"]
);
const APP_OPTION_ACCESS = objectStateAccess(["builtinChatAppOrder"], ["builtinChatAppOrder"]);
const MODEL_OPTION_ACCESS = objectStateAccess(
  ["modelPreferenceOrder", "modelPreferences"],
  ["modelPreferenceOrder", "modelPreferences"]
);
const SUMMARY_OPTION_ACCESS = objectStateAccess([
  "apiProfiles", "summaryApiProfileId", "summaryPromptTemplateId", "summaryPromptTemplates", "summarySiteConfigs"
], ["summaryApiProfileId", "summaryPromptTemplateId", "summaryPromptTemplates", "summarySiteConfigs"]);
const MESSAGE_NAVIGATION_OPTION_ACCESS = objectStateAccess(
  ["messageNavigatorEffectMode", "messageNavigatorSiteConfigs"],
  ["messageNavigatorEffectMode", "messageNavigatorSiteConfigs"]
);
const TOPIC_DELETION_OPTION_ACCESS = objectStateAccess(["topicDeleteSiteConfigs"], ["topicDeleteSiteConfigs"]);
const OPTIMIZE_OPTION_ACCESS = objectStateAccess([
  "apiProfiles", "optimizeApiProfileId", "optimizePromptTemplateId", "optimizePromptTemplates"
], ["optimizeApiProfileId", "optimizePromptTemplateId", "optimizePromptTemplates"]);

export const COMPOSER_STATE_ACCESS = stateAccess([
  "options", "promptHistoryCursor", "promptHistoryDraft", "promptImages", "promptLibrary", "promptSelection",
  "promptSendHistory", "promptSendInFlight", "promptText", "shortcutConfig"
], [
  "promptHistoryCursor", "promptHistoryDraft", "promptImages", "promptSelection", "promptSendHistory",
  "promptSendInFlight", "promptText"
]);

export const PREFERRED_MODEL_STATE_ACCESS = stateAccess([
  "activeTabs", "frameLoadingInstanceIds", "groups", "modelPreferenceDraft", "options", "preferredModelGateFailedAppIds",
  "preferredModelGateFailedCount", "preferredModelGatePendingCount", "preferredModelGateReason",
  "preferredModelGateState", "promptImages", "promptSelection", "promptSendInFlight", "promptText"
], [
  "preferredModelGateFailedAppIds", "preferredModelGateFailedCount", "preferredModelGatePendingCount",
  "preferredModelGateReason", "preferredModelGateState", "promptImages", "promptSelection", "promptText"
]);

export const TOPBAR_STATE_ACCESS = stateAccess([
  "activeTabs", "fullscreenGroupId", "groups", "options", "preferredModelGateFailedAppIds",
  "preferredModelGateFailedCount", "preferredModelGatePendingCount", "preferredModelGateReason",
  "preferredModelGateState", "promptImages", "promptSendInFlight", "promptText", "shortcutConfig", "summaryOpen",
  "promptLibrary", "temporaryLayoutPreset", "topbarEditDragId", "topbarEditLayoutDraft", "topbarEditMode"
], ["options", "topbarEditDragId", "topbarEditLayoutDraft", "topbarEditMode"]);

export const FAVICON_STATE_ACCESS = stateAccess(
  ["customConfig", "faviconCache", "options"],
  ["faviconCache"]
);

export const SETTINGS_STATE_SECTION_IDS = Object.freeze([
  "appearance",
  "profiles",
  "apps",
  "models",
  "summary",
  "messageNavigation",
  "topicDeletion",
  "optimize",
  "prompts",
  "history",
  "shortcuts",
  "io",
  "about",
  "shell"
]);

export const SETTINGS_UI_SECTION_STATE_PORT = Object.freeze({
  appearance: "appearance",
  profiles: "profiles",
  apps: "apps",
  models: "models",
  summary: "summary",
  messageNavigation: "messageNavigation",
  topicDeletion: "topicDeletion",
  optimize: "optimize",
  prompts: "prompts",
  promptHistory: "history",
  shortcuts: "shortcuts",
  io: "io",
  about: "about"
});

export const SETTINGS_SECTION_STATE_ACCESS = Object.freeze({
  appearance: stateAccess([
    "options", "settingsAppearanceTab", "settingsAppearanceTopbarTab", "settingsTabGroupButtonDragId",
    "settingsTabGroupButtonOrderDraft", "settingsTabGroupButtonPlacementDraft", "settingsTopbarPromptPlaceholderDraft",
    "settingsTopbarPromptPlaceholderDragIndex", "settingsTopbarPromptPlaceholderEditingIndex", "topbarEditLayoutDraft"
  ], [
    "options", "settingsAppearanceTab", "settingsAppearanceTopbarTab", "settingsTabGroupButtonDragId",
    "settingsTabGroupButtonOrderDraft", "settingsTabGroupButtonPlacementDraft", "settingsTopbarPromptPlaceholderDraft",
    "settingsTopbarPromptPlaceholderDragIndex", "settingsTopbarPromptPlaceholderEditingIndex", "topbarEditLayoutDraft"
  ], { options: APPEARANCE_OPTION_ACCESS }),
  profiles: stateAccess(
    ["options", "settingsProfileDragId"],
    ["options", "settingsProfileDragId"],
    { options: PROFILE_OPTION_ACCESS }
  ),
  apps: stateAccess([
    "customConfig", "options", "settingsAppsTab", "settingsBuiltinAppDragId", "settingsCustomAppDragId"
  ], ["customConfig", "options", "settingsAppsTab", "settingsBuiltinAppDragId", "settingsCustomAppDragId"], {
    options: APP_OPTION_ACCESS
  }),
  models: stateAccess(
    ["modelPreferenceDraft", "options"],
    ["modelPreferenceDraft", "options"],
    { options: MODEL_OPTION_ACCESS }
  ),
  summary: stateAccess([
    "options", "settingsPromptTemplateDragId", "summaryCollectorDragId", "summaryCollectorEditingId", "summarySettingsTab"
  ], ["options", "settingsPromptTemplateDragId", "summaryCollectorDragId", "summaryCollectorEditingId", "summarySettingsTab"], {
    options: SUMMARY_OPTION_ACCESS
  }),
  messageNavigation: stateAccess([
    "messageNavigatorSettingsTab", "messageNavigatorSiteExpandedId", "options"
  ], ["messageNavigatorSettingsTab", "messageNavigatorSiteExpandedId", "options"], {
    options: MESSAGE_NAVIGATION_OPTION_ACCESS
  }),
  topicDeletion: stateAccess(
    ["options", "topicDeleteSiteExpandedId"],
    ["options", "topicDeleteSiteExpandedId"],
    { options: TOPIC_DELETION_OPTION_ACCESS }
  ),
  optimize: stateAccess(
    ["options", "settingsPromptTemplateDragId"],
    ["options", "settingsPromptTemplateDragId"],
    { options: OPTIMIZE_OPTION_ACCESS }
  ),
  prompts: stateAccess([
    "promptLibrary", "promptSelection", "promptText", "settingsPromptLibraryDragId"
  ], ["promptLibrary", "promptSelection", "promptText", "settingsPromptLibraryDragId"]),
  history: stateAccess([
    "promptHistoryCursor", "promptHistoryDraft", "promptSelection", "promptSendHistory", "promptText"
  ], ["promptHistoryCursor", "promptHistoryDraft", "promptSelection", "promptSendHistory", "promptText"]),
  shortcuts: stateAccess([
    "shortcutConfig", "shortcutDraftConfig", "shortcutRecordingAction", "shortcutSettingsTab"
  ], ["shortcutConfig", "shortcutDraftConfig", "shortcutRecordingAction", "shortcutSettingsTab"]),
  io: stateAccess([
    "customConfig", "options", "pocketEntries", "promptLibrary", "promptSendHistory", "shortcutConfig"
  ], ["customConfig", "options", "pocketEntries", "promptLibrary", "promptSendHistory", "shortcutConfig"]),
  about: stateAccess(),
  shell: stateAccess()
});

export const FEATURE_STATE_ACCESS = Object.freeze({
  workspace: stateAccess(
    ["activeTabs", "customConfig", "frameLoadingInstanceIds", "fullscreenGroupId", "groups", "options", "temporaryLayoutPreset"],
    ["activeTabs", "frameLoadingInstanceIds", "fullscreenGroupId", "groups", "options", "temporaryLayoutPreset"]
  ),
  summary: stateAccess(
    ["options", "summaryBusy", "summaryComposing", "summaryContexts", "summaryDiagnostics", "summaryError", "summaryExpandedKeys", "summaryLoadingPhase", "summaryMaximized", "summaryNotice", "summaryOpen", "summaryPreviewItems", "summaryPreviewRefreshingKeys", "summaryQuestion", "summaryResult", "summarySize", "summaryStatus", "summaryView"],
    ["summaryBusy", "summaryComposing", "summaryContexts", "summaryDiagnostics", "summaryError", "summaryExpandedKeys", "summaryLoadingPhase", "summaryMaximized", "summaryNotice", "summaryOpen", "summaryPreviewItems", "summaryPreviewRefreshingKeys", "summaryQuestion", "summaryResult", "summarySize", "summaryStatus", "summaryView"]
  ),
  pocket: stateAccess(
    ["groups", "options", "pocketEntries", "summaryPreviewItems"],
    ["options", "pocketEntries"]
  ),
  optimize: stateAccess(
    ["options", "promptSelection", "promptText"],
    ["promptSelection", "promptText"]
  ),
  composer: COMPOSER_STATE_ACCESS,
  preferredModel: PREFERRED_MODEL_STATE_ACCESS,
  topbar: TOPBAR_STATE_ACCESS,
  favicon: FAVICON_STATE_ACCESS
});

function readonlyStateValue(value, feature, key, cache) {
  if (!value || typeof value !== "object") return value;
  const cached = cache.get(value);
  if (cached) return cached;
  const fail = () => {
    throw new TypeError(`${feature} cannot mutate read-only app state.${String(key)}`);
  };
  const proxy = new Proxy(value, {
    get(target, childKey, receiver) {
      return readonlyStateValue(Reflect.get(target, childKey, receiver), feature, `${String(key)}.${String(childKey)}`, cache);
    },
    set: fail,
    defineProperty: fail,
    deleteProperty: fail,
    setPrototypeOf: fail
  });
  cache.set(value, proxy);
  return proxy;
}

function stateValuesEquivalent(left, right, seen = new WeakMap()) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const previous = seen.get(left);
  if (previous) return previous === right;
  seen.set(left, right);
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  const rightKeySet = new Set(rightKeys);
  return leftKeys.every((key) => rightKeySet.has(key) && stateValuesEquivalent(left[key], right[key], seen));
}

function validateScopedObjectReplacement(current, next, feature, key, objectAccess) {
  if (!next || typeof next !== "object" || Array.isArray(next)) {
    throw new TypeError(`${feature} must assign an object to app state.${String(key)}`);
  }
  const currentValue = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  const writable = new Set(objectAccess.write);
  for (const childKey of new Set([...Object.keys(currentValue), ...Object.keys(next)])) {
    if (writable.has(childKey)) continue;
    if (!stateValuesEquivalent(currentValue[childKey], next[childKey])) {
      throw new TypeError(`${feature} cannot mutate app state.${String(key)}.${String(childKey)}`);
    }
  }
}

function scopedStateObjectValue(value, feature, key, objectAccess, readonlyCache, scopedCache) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const cached = scopedCache.get(value);
  if (cached) return cached;
  const readable = new Set(objectAccess.read);
  const writable = new Set(objectAccess.write);
  const proxy = new Proxy(Object.create(null), {
    get(_target, childKey) {
      if (typeof childKey === "symbol") return value[childKey];
      if (!readable.has(childKey)) throw new TypeError(`${feature} cannot read app state.${String(key)}.${String(childKey)}`);
      const childValue = value[childKey];
      return writable.has(childKey)
        ? childValue
        : readonlyStateValue(childValue, feature, `${String(key)}.${String(childKey)}`, readonlyCache);
    },
    set(_target, childKey, childValue) {
      if (!writable.has(childKey)) throw new TypeError(`${feature} cannot mutate app state.${String(key)}.${String(childKey)}`);
      value[childKey] = childValue;
      return true;
    },
    defineProperty(_target, childKey, descriptor) {
      if (!writable.has(childKey)) throw new TypeError(`${feature} cannot mutate app state.${String(key)}.${String(childKey)}`);
      Object.defineProperty(value, childKey, descriptor);
      return true;
    },
    deleteProperty(_target, childKey) {
      if (!writable.has(childKey)) throw new TypeError(`${feature} cannot mutate app state.${String(key)}.${String(childKey)}`);
      return delete value[childKey];
    },
    setPrototypeOf() {
      throw new TypeError(`${feature} cannot mutate app state.${String(key)}.__proto__`);
    },
    has(_target, childKey) {
      return readable.has(childKey) && childKey in value;
    },
    ownKeys() {
      return objectAccess.read.filter((childKey) => Object.prototype.hasOwnProperty.call(value, childKey));
    },
    getOwnPropertyDescriptor(_target, childKey) {
      return readable.has(childKey) && Object.prototype.hasOwnProperty.call(value, childKey)
        ? { enumerable: true, configurable: true }
        : undefined;
    }
  });
  scopedCache.set(value, proxy);
  return proxy;
}

function createScopedStatePort(rootState, feature, access) {
  if (!rootState || typeof rootState !== "object") throw new TypeError("Feature state requires a root state object");
  if (!access) throw new TypeError(`Unknown feature state: ${feature}`);
  const readable = new Set(access.read);
  const writable = new Set(access.write);
  const readonlyCache = new WeakMap();
  const scopedObjectCaches = new Map();
  return new Proxy(Object.create(null), {
    get(_target, key) {
      if (typeof key === "symbol") return rootState[key];
      if (!readable.has(key)) throw new TypeError(`${feature} cannot read app state.${key}`);
      const objectAccess = access.objects?.[key];
      if (objectAccess) {
        if (!scopedObjectCaches.has(key)) scopedObjectCaches.set(key, new WeakMap());
        return scopedStateObjectValue(
          rootState[key],
          feature,
          key,
          objectAccess,
          readonlyCache,
          scopedObjectCaches.get(key)
        );
      }
      return writable.has(key) ? rootState[key] : readonlyStateValue(rootState[key], feature, key, readonlyCache);
    },
    set(_target, key, value) {
      if (!writable.has(key)) throw new TypeError(`${feature} cannot mutate app state.${String(key)}`);
      const objectAccess = access.objects?.[key];
      if (objectAccess) validateScopedObjectReplacement(rootState[key], value, feature, key, objectAccess);
      rootState[key] = value;
      return true;
    },
    has(_target, key) {
      return readable.has(key);
    },
    ownKeys() {
      return [...readable];
    },
    getOwnPropertyDescriptor(_target, key) {
      return readable.has(key) ? { enumerable: true, configurable: true } : undefined;
    }
  });
}

function combinedSettingsAccess() {
  const read = [];
  const write = [];
  for (const section of SETTINGS_STATE_SECTION_IDS) {
    read.push(...SETTINGS_SECTION_STATE_ACCESS[section].read);
    write.push(...SETTINGS_SECTION_STATE_ACCESS[section].write);
  }
  return stateAccess(read, write);
}

const SETTINGS_CONTROLLER_STATE_ACCESS = combinedSettingsAccess();

export function createSettingsSectionStatePorts(rootState) {
  return Object.freeze(Object.fromEntries(SETTINGS_STATE_SECTION_IDS.map((section) => [
    section,
    createScopedStatePort(rootState, `settings.${section}`, SETTINGS_SECTION_STATE_ACCESS[section])
  ])));
}

export function createSettingsControllerStatePort(rootState) {
  // Compatibility facade for the current lazy settings controller. Its access is
  // mechanically composed from the section capabilities above; section modules
  // should receive their individual port instead of this facade.
  return createScopedStatePort(rootState, "settings", SETTINGS_CONTROLLER_STATE_ACCESS);
}

export function settingsStatePortForUiSection(sectionPorts, sectionId) {
  const portId = SETTINGS_UI_SECTION_STATE_PORT[String(sectionId || "")];
  if (!portId || !sectionPorts?.[portId]) throw new TypeError(`Unknown settings section: ${sectionId}`);
  return sectionPorts[portId];
}

export function createFeatureStatePort(rootState, feature) {
  if (feature === "settings") return createSettingsControllerStatePort(rootState);
  return createScopedStatePort(rootState, feature, FEATURE_STATE_ACCESS[feature]);
}

export function createComposerStatePort(rootState) {
  return createFeatureStatePort(rootState, "composer");
}

export function createPreferredModelStatePort(rootState) {
  return createFeatureStatePort(rootState, "preferredModel");
}

export function createTopbarStatePort(rootState) {
  return createFeatureStatePort(rootState, "topbar");
}

export function createFaviconStatePort(rootState) {
  return createFeatureStatePort(rootState, "favicon");
}

export function createFeatureStatePorts(rootState) {
  const ports = Object.fromEntries(
    Object.keys(FEATURE_STATE_ACCESS).map((feature) => [feature, createFeatureStatePort(rootState, feature)])
  );
  ports.settings = createSettingsControllerStatePort(rootState);
  ports.settingsSections = createSettingsSectionStatePorts(rootState);
  return Object.freeze(ports);
}
