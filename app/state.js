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

const FEATURE_STATE_ACCESS = Object.freeze({
  workspace: Object.freeze({
    read: ["activeTabs", "customConfig", "frameLoadingInstanceIds", "fullscreenGroupId", "groups", "options", "temporaryLayoutPreset"],
    write: ["activeTabs", "frameLoadingInstanceIds", "fullscreenGroupId", "groups", "options", "temporaryLayoutPreset"]
  }),
  summary: Object.freeze({
    read: ["options", "summaryBusy", "summaryComposing", "summaryContexts", "summaryDiagnostics", "summaryError", "summaryExpandedKeys", "summaryLoadingPhase", "summaryMaximized", "summaryNotice", "summaryOpen", "summaryPreviewItems", "summaryPreviewRefreshingKeys", "summaryQuestion", "summaryResult", "summarySize", "summaryStatus", "summaryView"],
    write: ["summaryBusy", "summaryComposing", "summaryContexts", "summaryDiagnostics", "summaryError", "summaryExpandedKeys", "summaryLoadingPhase", "summaryMaximized", "summaryNotice", "summaryOpen", "summaryPreviewItems", "summaryPreviewRefreshingKeys", "summaryQuestion", "summaryResult", "summarySize", "summaryStatus", "summaryView"]
  }),
  pocket: Object.freeze({
    read: ["groups", "options", "pocketEntries", "summaryPreviewItems"],
    write: ["options", "pocketEntries"]
  }),
  optimize: Object.freeze({
    read: ["options", "promptSelection", "promptText"],
    write: ["promptSelection", "promptText"]
  }),
  settings: Object.freeze({
    read: [
    "customConfig", "messageNavigatorSettingsTab", "messageNavigatorSiteExpandedId", "modelPreferenceDraft", "options", "pocketEntries",
    "promptHistoryCursor", "promptHistoryDraft", "promptLibrary", "promptSelection", "promptSendHistory", "promptText",
    "settingsAppearanceTab", "settingsAppearanceTopbarTab", "settingsAppsTab", "settingsBuiltinAppDragId", "settingsCustomAppDragId",
    "settingsProfileDragId", "settingsPromptLibraryDragId", "settingsPromptTemplateDragId", "settingsTabGroupButtonDragId",
    "settingsTabGroupButtonOrderDraft", "settingsTabGroupButtonPlacementDraft", "settingsTopbarPromptPlaceholderDraft",
    "settingsTopbarPromptPlaceholderDragIndex", "settingsTopbarPromptPlaceholderEditingIndex", "shortcutConfig", "shortcutDraftConfig",
    "shortcutRecordingAction", "shortcutSettingsTab", "summaryCollectorDragId", "summaryCollectorEditingId", "summarySettingsTab",
    "topbarEditLayoutDraft", "topicDeleteSiteExpandedId"
    ],
    write: [
      "customConfig", "messageNavigatorSettingsTab", "messageNavigatorSiteExpandedId", "modelPreferenceDraft", "options", "pocketEntries",
      "promptHistoryCursor", "promptHistoryDraft", "promptLibrary", "promptSelection", "promptSendHistory", "promptText",
      "settingsAppearanceTab", "settingsAppearanceTopbarTab", "settingsAppsTab", "settingsBuiltinAppDragId", "settingsCustomAppDragId",
      "settingsProfileDragId", "settingsPromptLibraryDragId", "settingsPromptTemplateDragId", "settingsTabGroupButtonDragId",
      "settingsTabGroupButtonOrderDraft", "settingsTabGroupButtonPlacementDraft", "settingsTopbarPromptPlaceholderDraft",
      "settingsTopbarPromptPlaceholderDragIndex", "settingsTopbarPromptPlaceholderEditingIndex", "shortcutConfig", "shortcutDraftConfig",
      "shortcutRecordingAction", "shortcutSettingsTab", "summaryCollectorDragId", "summaryCollectorEditingId", "summarySettingsTab",
      "topbarEditLayoutDraft", "topicDeleteSiteExpandedId"
    ]
  })
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

export function createFeatureStatePort(rootState, feature) {
  if (!rootState || typeof rootState !== "object") throw new TypeError("Feature state requires a root state object");
  const access = FEATURE_STATE_ACCESS[feature];
  if (!access) throw new TypeError(`Unknown feature state: ${feature}`);
  const readable = new Set(access.read);
  const writable = new Set(access.write);
  const readonlyCache = new WeakMap();
  return new Proxy(Object.create(null), {
    get(_target, key) {
      if (typeof key === "symbol") return rootState[key];
      if (!readable.has(key)) throw new TypeError(`${feature} cannot read app state.${key}`);
      return writable.has(key) ? rootState[key] : readonlyStateValue(rootState[key], feature, key, readonlyCache);
    },
    set(_target, key, value) {
      if (!writable.has(key)) throw new TypeError(`${feature} cannot mutate app state.${String(key)}`);
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

export function createFeatureStatePorts(rootState) {
  return Object.freeze(Object.fromEntries(
    Object.keys(FEATURE_STATE_ACCESS).map((feature) => [feature, createFeatureStatePort(rootState, feature)])
  ));
}
