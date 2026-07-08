import {
  API_PROMOTION_CHANNELS_VERSION,
  API_PROFILE_ENDPOINT_DEFAULT,
  API_PROFILE_MODEL_DEFAULT,
  BUILTIN_CHAT_APPS,
  DEFAULT_POCKET_CARD_SIZE,
  DEFAULT_GEMINI_THINKING_LEVEL,
  DEFAULT_MODEL_PREFERENCE_ORDER,
  DEFAULT_MODEL_PREFERENCES,
  DEFAULT_PROMOTION_API_PROFILES,
  DEFAULT_TAB_GROUP_BUTTON_ORDER,
  DEFAULT_TAB_GROUP_BUTTON_PLACEMENT,
  DEFAULT_OPTIONS,
  GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
  GEMINI_THINKING_LEVEL_TARGETS,
  MODEL_PREFERENCE_TARGETS,
  SCRIPT_CONFIG_SCHEMA_VERSION,
  STORAGE_KEYS,
  TAB_GROUP_HEADER_BUTTONS,
  TOOLTIP_TARGET_IDS
} from "./constants.js";
import { SUMMARY_SITE_CONFIGS } from "./summary-sites.js";
import {
  MESSAGE_NAVIGATOR_SITE_CONFIGS,
  mergeBuiltInMessageNavigatorConfig,
  normalizeMessageNavigatorEffectMode
} from "./message-navigator-sites.js";
import { normalizeShortcutConfig as normalizeShortcutShape } from "./shortcuts.js";
import { TOPIC_DELETE_SITE_CONFIGS, mergeBuiltInTopicDeleteConfig } from "./topic-delete-sites.js";
import { normalizeTopbarLayout } from "./topbar.js";

export function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const CONFIG_BUNDLE_KEYS = Object.freeze([
  "options",
  "customConfig",
  "promptLibrary",
  "promptSendHistory",
  "shortcutConfig",
  "pocketHistory"
]);

const CONFIG_BUNDLE_KEY_SET = new Set(CONFIG_BUNDLE_KEYS);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function plainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

export function normalizePrimaryColor(value, fallback = DEFAULT_OPTIONS.primaryColor) {
  const raw = text(value, fallback).replace(/^#?/, "#");
  const short = raw.match(/^#([0-9a-f]{3})$/i);
  if (short) return `#${short[1].split("").map((char) => `${char}${char}`).join("")}`.toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  return fallback;
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function normalizePocketCardSize(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    width: boundedNumber(source.width, DEFAULT_POCKET_CARD_SIZE.width, 360, 760),
    height: boundedNumber(source.height, DEFAULT_POCKET_CARD_SIZE.height, 420, 820)
  };
}

export function normalizeTooltipDisabledIds(value = []) {
  const validIds = new Set(TOOLTIP_TARGET_IDS);
  const ordered = [];
  for (const id of Array.isArray(value) ? value : []) {
    const normalized = text(id);
    if (!validIds.has(normalized) || ordered.includes(normalized)) continue;
    ordered.push(normalized);
  }
  return ordered;
}

function normalizeStoredPrimaryColor(raw, fallback) {
  const color = normalizePrimaryColor(raw.primaryColor, fallback);
  const custom = raw.primaryColorCustom === true;
  return {
    primaryColor: !custom && color === "#1677ff" ? fallback : color,
    primaryColorCustom: custom
  };
}

export function normalizeTabGroupButtonsMode(value) {
  return value === "hidden" ? "hidden" : "pinned";
}

const LEGACY_TAB_GROUP_BUTTON_PLACEMENT_FULLSCREEN_PINNED = Object.freeze({
  addApp: "pinned",
  reload: "pinned",
  messageNavigator: "pinned",
  deleteThread: "pinned",
  fullscreen: "pinned",
  openInNewTab: "menu",
  copyLink: "menu",
  removeGroup: "menu",
  more: "pinned"
});

const LEGACY_TAB_GROUP_BUTTON_PLACEMENT_HOME_PINNED = Object.freeze({
  addApp: "pinned",
  newChat: "pinned",
  refreshPage: "pinned",
  reload: "pinned",
  messageNavigator: "pinned",
  deleteThread: "pinned",
  fullscreen: "menu",
  openInNewTab: "menu",
  copyLink: "menu",
  removeGroup: "menu",
  more: "pinned"
});

function tabGroupPlacementLooksLikeDefault(raw = {}, expected = {}) {
  const legacyIds = Object.keys(expected);
  const configurableLegacyIds = TAB_GROUP_HEADER_BUTTONS
    .filter((item) => legacyIds.includes(item.id) && !item.requiredPinned)
    .map((item) => item.id);
  if (!configurableLegacyIds.every((id) => Object.prototype.hasOwnProperty.call(raw, id))) return false;
  return TAB_GROUP_HEADER_BUTTONS
    .filter((item) => legacyIds.includes(item.id))
    .every((item) => {
      const expectedPlacement = expected[item.id] || "pinned";
      const saved = raw[item.id];
      return (saved === "menu" || saved === "pinned" || saved === "hidden" ? saved : expectedPlacement) === expectedPlacement;
    });
}

export function normalizeTabGroupButtonPlacement(value = {}, legacyMode = "pinned") {
  const legacyHidden = normalizeTabGroupButtonsMode(legacyMode) === "hidden";
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const migrateFullscreenPinnedDefault = tabGroupPlacementLooksLikeDefault(raw, LEGACY_TAB_GROUP_BUTTON_PLACEMENT_FULLSCREEN_PINNED);
  const migrateHomeMenuDefault = tabGroupPlacementLooksLikeDefault(raw, LEGACY_TAB_GROUP_BUTTON_PLACEMENT_HOME_PINNED);
  return Object.fromEntries(TAB_GROUP_HEADER_BUTTONS.map((item) => {
    if (item.requiredPinned) return [item.id, "pinned"];
    const saved = raw[item.id];
    const placement = saved === "menu" || saved === "pinned" || saved === "hidden"
      ? saved
      : legacyHidden
        ? "menu"
        : DEFAULT_TAB_GROUP_BUTTON_PLACEMENT[item.id] || "pinned";
    if (migrateFullscreenPinnedDefault && item.id === "fullscreen") return [item.id, "menu"];
    if ((migrateFullscreenPinnedDefault || migrateHomeMenuDefault) && item.id === "reload") return [item.id, "menu"];
    return [item.id, placement === "menu" || placement === "hidden" ? placement : "pinned"];
  }));
}

const LEGACY_TAB_GROUP_BUTTON_DEFAULT_ORDERS = Object.freeze([
  Object.freeze(["addApp", "reload", "messageNavigator", "deleteThread", "fullscreen", "openInNewTab", "copyLink", "removeGroup"]),
  Object.freeze(["addApp", "reload", "messageNavigator", "deleteThread", "fullscreen", "openInNewTab", "copyLink", "removeGroup", "newChat"]),
  Object.freeze(["addApp", "reload", "messageNavigator", "deleteThread", "fullscreen", "openInNewTab", "copyLink", "removeGroup", "newChat", "refreshPage"]),
  Object.freeze(["addApp", "newChat", "reload", "messageNavigator", "deleteThread", "fullscreen", "openInNewTab", "copyLink", "removeGroup"]),
  Object.freeze(["addApp", "newChat", "reload", "messageNavigator", "deleteThread", "fullscreen", "openInNewTab", "copyLink", "removeGroup", "refreshPage"]),
  Object.freeze(["addApp", "newChat", "refreshPage", "reload", "messageNavigator", "deleteThread", "fullscreen", "openInNewTab", "copyLink", "removeGroup"])
]);

function normalizeTabGroupButtonOrderItems(value = [], valid = new Set()) {
  const ordered = [];
  for (const id of Array.isArray(value) ? value : []) {
    if (valid.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

function tabGroupButtonOrderLooksLikeLegacyDefault(value = [], valid = new Set()) {
  if (!Array.isArray(value)) return false;
  const ordered = normalizeTabGroupButtonOrderItems(value, valid);
  return LEGACY_TAB_GROUP_BUTTON_DEFAULT_ORDERS.some((legacyOrder) => {
    const legacy = normalizeTabGroupButtonOrderItems(legacyOrder, valid);
    return legacy.length === ordered.length && legacy.every((id, index) => id === ordered[index]);
  });
}

export function normalizeTabGroupButtonOrder(value = []) {
  const configurableIds = TAB_GROUP_HEADER_BUTTONS
    .filter((item) => !item.requiredPinned)
    .map((item) => item.id);
  const valid = new Set(configurableIds);
  const source = tabGroupButtonOrderLooksLikeLegacyDefault(value, valid)
    ? DEFAULT_TAB_GROUP_BUTTON_ORDER
    : Array.isArray(value)
      ? value
      : DEFAULT_TAB_GROUP_BUTTON_ORDER;
  const ordered = normalizeTabGroupButtonOrderItems(source, valid);
  for (const id of configurableIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

function inferCustomName(item, index) {
  const rawName = text(item.name || item.displayName);
  const provider = text(item.provider || item.company);
  const url = text(item.url);
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {}
  const inferred = [
    [/assistant\.kagi\.com$/, "Kagi Assistant"],
    [/gk\.dairoot\.cn$/, "Grok Mirror"],
    [/(^|\.)grok\.com$/, "Grok"],
    [/(^|\.)chatgpt\.com$|chat\.openai\.com$/, "ChatGPT"],
    [/(^|\.)claude\.ai$/, "Claude"],
    [/gemini\.google\.com$/, "Gemini"],
    [/(^|\.)deepseek\.com$/, "DeepSeek"],
    [/app\.notion\.com|notion\.so$/, "Notion AI"],
    [/(^|\.)lobehub\.com$/, "LobeHub"],
    [/(^|\.)typingcloud\.com$/, "TypingMind"]
  ].find(([pattern]) => pattern.test(host))?.[1];
  if (!rawName || /^custom(?:\s+\d+)?$/i.test(rawName) || rawName === host) {
    return inferred || (provider && !/^custom$/i.test(provider) ? provider : host || `Custom ${index + 1}`);
  }
  return rawName;
}

function normalizeProfile(profile, index) {
  const registerUrl = text(profile?.registerUrl || profile?.signupUrl || profile?.url);
  return {
    id: text(profile?.id) || createId("api"),
    name: text(profile?.name, `API Profile ${index + 1}`) || `API Profile ${index + 1}`,
    endpoint: text(profile?.endpoint, API_PROFILE_ENDPOINT_DEFAULT) || API_PROFILE_ENDPOINT_DEFAULT,
    apiKey: text(profile?.apiKey),
    model: text(profile?.model, API_PROFILE_MODEL_DEFAULT) || API_PROFILE_MODEL_DEFAULT,
    ...(registerUrl ? { registerUrl } : {}),
    ...(profile?.promotionChannel === true ? { promotionChannel: true } : {})
  };
}

function sameApiHost(left, right) {
  try {
    return new URL(left).hostname === new URL(right).hostname;
  } catch {
    return false;
  }
}

function isPromotionApiProfile(profile, promoted) {
  if (!profile || !promoted) return false;
  if (profile.id === promoted.id) return true;
  if (text(profile.registerUrl) === promoted.registerUrl) return true;
  return sameApiHost(profile.endpoint, promoted.endpoint);
}

function preferredPromotionProfileIndex(apiProfiles, promoted, selectedIds) {
  const indexes = apiProfiles
    .map((profile, index) => isPromotionApiProfile(profile, promoted) ? index : -1)
    .filter((index) => index >= 0);
  return indexes.find((index) => selectedIds.has(apiProfiles[index].id))
    ?? indexes.find((index) => apiProfiles[index].id !== promoted.id && text(apiProfiles[index].apiKey))
    ?? indexes.find((index) => apiProfiles[index].id !== promoted.id)
    ?? indexes[0]
    ?? -1;
}

function mergePromotionApiProfiles(apiProfiles, raw = {}, addMissing = false) {
  const selectedIds = new Set([text(raw.optimizeApiProfileId), text(raw.summaryApiProfileId)].filter(Boolean));
  let next = [...apiProfiles];
  for (const promoted of DEFAULT_PROMOTION_API_PROFILES) {
    const preferredIndex = preferredPromotionProfileIndex(next, promoted, selectedIds);
    const hasPromotionDuplicate = preferredIndex >= 0
      && next.some((profile, index) => index !== preferredIndex && isPromotionApiProfile(profile, promoted));
    if (preferredIndex >= 0) {
      const preferred = next[preferredIndex];
      const removablePreferred = !addMissing
        && preferred.id === promoted.id
        && !preferred.promotionChannel
        && !text(preferred.apiKey)
        && !selectedIds.has(preferred.id)
        && next.length > 1;
      if (removablePreferred && !hasPromotionDuplicate) {
        next = next.filter((_, index) => index !== preferredIndex);
        continue;
      }
      next[preferredIndex] = normalizeProfile({
        ...promoted,
        ...preferred,
        registerUrl: text(preferred.registerUrl) || promoted.registerUrl
      }, preferredIndex);
      next = next.filter((profile, index) => {
        if (index === preferredIndex) return true;
        const removableBlank = profile.id === promoted.id
          && !text(profile.apiKey)
          && !selectedIds.has(profile.id)
          && next.length > 1;
        return !(removableBlank && (hasPromotionDuplicate || profile.promotionChannel !== true));
      });
    }
  }
  if (!addMissing) return next;
  for (const profile of DEFAULT_PROMOTION_API_PROFILES) {
    const index = preferredPromotionProfileIndex(next, profile, selectedIds);
    if (index >= 0) continue;
    next.push(normalizeProfile(profile, next.length));
  }
  return next;
}

function hasStoredOptions(raw) {
  return !!raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length > 0;
}

function topbarLayoutHasItem(layout, id) {
  return Array.isArray(layout) && layout.some((item) => item?.type === "item" && item.id === id);
}

function migrateDeleteThreadTopbarLayout(raw = {}) {
  const normalized = normalizeTopbarLayout(raw.topbarLayout);
  if (raw.topbarDeleteThreadMigrated === true || topbarLayoutHasItem(normalized, "deleteThread")) return normalized;
  const newChatIndex = normalized.findIndex((item) => item.type === "item" && item.id === "newChat");
  if (newChatIndex < 0) return normalized;
  const insertIndex = newChatIndex + 1;
  return [
    ...normalized.slice(0, insertIndex),
    { type: "item", id: "deleteThread" },
    ...normalized.slice(insertIndex)
  ];
}

function withoutPromotionApiProfiles(apiProfiles) {
  return apiProfiles.filter((profile) => !DEFAULT_PROMOTION_API_PROFILES.some((promoted) => profile.id === promoted.id));
}

export function normalizeModelPreferences(raw = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const normalized = { ...DEFAULT_MODEL_PREFERENCES };
  for (const [appId, targets] of Object.entries(MODEL_PREFERENCE_TARGETS)) {
    const value = text(source[appId]);
    const allowed = new Set((targets || []).map((target) => target.id));
    normalized[appId] = allowed.has(value) ? value : "";
  }
  const thinkingLevel = text(source[GEMINI_THINKING_LEVEL_PREFERENCE_KEY], DEFAULT_GEMINI_THINKING_LEVEL);
  const allowedThinkingLevels = new Set(GEMINI_THINKING_LEVEL_TARGETS.map((target) => target.id));
  normalized[GEMINI_THINKING_LEVEL_PREFERENCE_KEY] = allowedThinkingLevels.has(thinkingLevel)
    ? thinkingLevel
    : DEFAULT_GEMINI_THINKING_LEVEL;
  return normalized;
}

export function normalizeModelPreferenceOrder(raw = []) {
  const validIds = new Set(Object.keys(MODEL_PREFERENCE_TARGETS));
  const ordered = [];
  for (const id of Array.isArray(raw) ? raw : DEFAULT_MODEL_PREFERENCE_ORDER) {
    const normalized = text(id);
    if (validIds.has(normalized) && !ordered.includes(normalized)) ordered.push(normalized);
  }
  for (const id of DEFAULT_MODEL_PREFERENCE_ORDER) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

function legacyProfile(raw, kind) {
  const prefix = kind === "summary" ? "summary" : "optimize";
  const endpoint = text(raw?.[`${prefix}Endpoint`]);
  const apiKey = text(raw?.[`${prefix}ApiKey`]);
  const model = text(raw?.[`${prefix}Model`]);
  if (!endpoint && !apiKey && !model) return null;
  return normalizeProfile({
    id: `${prefix}-legacy`,
    name: kind === "summary" ? "Summary API" : "Optimize Prompt",
    endpoint: endpoint || API_PROFILE_ENDPOINT_DEFAULT,
    apiKey,
    model: model || API_PROFILE_MODEL_DEFAULT
  }, 0);
}

function normalizeTemplate(template, fallback, prefix, index) {
  return {
    id: text(template?.id) || createId(prefix),
    title: text(template?.title || template?.name, `${fallback.title} ${index + 1}`),
    prompt: text(template?.prompt || template?.template || template?.content, fallback.prompt),
    builtIn: Boolean(template?.builtIn)
  };
}

function normalizeUserscriptSource(value) {
  return String(value || "").trim().replace(/\r\n?/g, "\n");
}

function summaryScriptId(item = {}, fallback = {}) {
  const file = text(item.userscriptFile || fallback.userscriptFile);
  return text(item.scriptId || fallback.scriptId || (file ? file.replace(/\.js$/i, "") : "") || item.id || fallback.id);
}

function summarySourceLooksLikeBuiltIn(id, source, currentSource = "") {
  const normalized = normalizeUserscriptSource(source);
  if (!normalized) return false;
  if (normalized === normalizeUserscriptSource(currentSource)) return true;
  const markerSets = {
    chatgpt: ["copy-turn-action-button", "data-message-author-role"],
    claude: ["Claude responded", "Copy message"],
    gemini: ["Gemini said", "copy prompt"],
    deepseek: ['const site = "deepseek"', "findDeepSeekTurns"],
    grok: ['const site = "grok"', "grokCopyButtonMessages"],
    grokMirror: ['const site = "grok"', "grokCopyButtonMessages"],
    "grok-dairoot": ['const site = "grok"', "grokCopyButtonMessages"],
    kagi: ["messageCopyButton", "referenceCopyButton"],
    notion: ["notion", "copy-message-button"],
    lobeHub: ["lobe", "message"],
    lobehub: ["lobe", "message"],
    typingMind: ["TypingMind", "copy"],
    typingmind: ["TypingMind", "copy"]
  };
  const markers = markerSets[id] || [];
  return Boolean(markers.length && markers.every((marker) => normalized.includes(marker)));
}

function normalizeSummarySiteConfig(item, fallback = {}, index = 0) {
  const builtIn = Boolean(fallback.builtIn || item?.builtIn);
  const fallbackUserscript = String(fallback.userscript || "").trim();
  const customUserscript = String(item?.customUserscript ?? item?.userscript ?? "").trim();
  const sourceMode = item?.sourceMode === "custom" || (!builtIn && customUserscript)
    ? "custom"
    : "builtIn";
  const userscript = sourceMode === "custom" ? customUserscript : fallbackUserscript;
  const copyTimeoutMs = boundedNumber(item?.copyTimeoutMs, 0, 300, 10000);
  const config = {
    ...fallback,
    ...item,
    enabled: item?.enabled !== false,
    fallbackMode: item?.fallbackMode === "allowPageText" ? "allowPageText" : "structuredOnly",
    hosts: Array.isArray(item?.hosts) ? item.hosts.map((host) => text(host)).filter(Boolean) : [],
    pathPrefixes: Array.isArray(item?.pathPrefixes) ? item.pathPrefixes.map((prefix) => text(prefix)).filter(Boolean) : [],
    userscriptRunMode: item?.userscriptRunMode === "pageWorldFirst" ? "pageWorldFirst" : "serial",
    userscriptTimeoutMs: boundedNumber(item?.userscriptTimeoutMs, fallback.userscriptTimeoutMs || 24000, 5000, 45000),
    id: text(item?.id || fallback.id) || createId("summary-collector"),
    name: text(item?.name || fallback.name, `Summary Collector ${index + 1}`),
    builtIn,
    scriptType: text(item?.scriptType || fallback.scriptType, "summary"),
    scriptId: summaryScriptId(item, fallback) || `summary-${index + 1}`,
    scriptVersion: sourceMode === "custom"
      ? text(item?.scriptVersion)
      : text(fallback.configVersion ?? fallback.scriptVersion),
    sourceMode,
    userscript,
    userscriptLength: userscript.length,
    userscriptOverride: Boolean(builtIn && sourceMode === "custom")
  };
  if (sourceMode === "custom") config.customUserscript = userscript;
  else delete config.customUserscript;
  if (copyTimeoutMs) config.copyTimeoutMs = copyTimeoutMs;
  else delete config.copyTimeoutMs;
  return config;
}

function mergeBuiltInSummaryConfig(current, builtIn) {
  const byId = new Map((current || []).filter(Boolean).map((item) => [item.id, item]));
  const merged = [];
  for (const item of builtIn || []) {
    const existing = byId.get(item.id) || {};
    const existingUserscript = String(existing.customUserscript || existing.userscript || "").trim();
    const knownBuiltInUserscript = summarySourceLooksLikeBuiltIn(item.id, existingUserscript, item.userscript);
    const explicitCustom = existing.sourceMode === "custom" || Boolean(existing.customUserscript);
    const sourceMode = explicitCustom || Boolean(existing.userscriptOverride && existingUserscript && !knownBuiltInUserscript)
      ? "custom"
      : "builtIn";
    const userscript = sourceMode === "custom" ? existingUserscript : String(item.userscript || "").trim();
    const normalized = normalizeSummarySiteConfig({
      ...item,
      ...existing,
      id: item.id,
      name: existing.name || item.name,
      builtIn: true,
      configVersion: item.configVersion,
      enabled: existing.enabled !== false,
      scriptType: "summary",
      scriptId: summaryScriptId(item),
      scriptVersion: item.configVersion,
      sourceMode,
      userscript,
      customUserscript: sourceMode === "custom" ? userscript : "",
      userscriptOverride: sourceMode === "custom"
    }, item);
    merged.push(normalized);
    byId.delete(item.id);
  }
  let customIndex = 0;
  for (const item of byId.values()) {
    if (!item) continue;
    merged.push(normalizeSummarySiteConfig({
      ...item,
      builtIn: false
    }, {}, customIndex++));
  }
  return merged.filter((item) => item.id !== "chathub");
}

export function normalizeOptions(raw = {}) {
  const base = clone(DEFAULT_OPTIONS);
  const storedOptions = hasStoredOptions(raw);
  const hadProfiles = Array.isArray(raw.apiProfiles);
  let apiProfiles = hadProfiles ? raw.apiProfiles.filter(Boolean).map(normalizeProfile) : [];
  if (!apiProfiles.length) {
    const optimize = legacyProfile(raw, "optimize");
    const summary = legacyProfile(raw, "summary");
    apiProfiles = [optimize, summary].filter(Boolean);
  }
  if (!apiProfiles.length) {
    apiProfiles = storedOptions ? withoutPromotionApiProfiles(clone(base.apiProfiles)) : clone(base.apiProfiles);
  }
  const fallbackProfileIds = apiProfiles.map((profile) => profile.id);
  apiProfiles = mergePromotionApiProfiles(apiProfiles, raw, !storedOptions);

  const profileIds = new Set(apiProfiles.map((profile) => profile.id));
  const optimizeFallback = profileIds.has(base.optimizeApiProfileId)
    ? base.optimizeApiProfileId
    : fallbackProfileIds[0] || apiProfiles[0]?.id || "";
  const summaryFallback = profileIds.has(base.summaryApiProfileId)
    ? base.summaryApiProfileId
    : fallbackProfileIds[1] || fallbackProfileIds[0] || apiProfiles[1]?.id || optimizeFallback;

  const optimizeDefault = base.optimizePromptTemplates[0];
  const summaryDefault = base.summaryPromptTemplates[0];
  const optimizePromptTemplates = Array.isArray(raw.optimizePromptTemplates)
    ? raw.optimizePromptTemplates.filter(Boolean).map((item, index) => normalizeTemplate(item, optimizeDefault, "optimize-template", index))
    : [optimizeDefault];
  const summaryPromptTemplates = Array.isArray(raw.summaryPromptTemplates)
    ? raw.summaryPromptTemplates.filter(Boolean).map((item, index) => normalizeTemplate(item, summaryDefault, "summary-template", index))
    : [summaryDefault];

  const layoutPresets = Array.isArray(raw.layoutPresets) && raw.layoutPresets.length
    ? raw.layoutPresets
    : base.layoutPresets;
  const activeLayoutPresetId = layoutPresets.some((preset) => preset.id === raw.activeLayoutPresetId)
    ? raw.activeLayoutPresetId
    : layoutPresets[0]?.id || "default";

  const primaryColorState = normalizeStoredPrimaryColor(raw, base.primaryColor);

  const tabGroupButtonsMode = normalizeTabGroupButtonsMode(raw.tabGroupButtonsMode);

  return {
    ...base,
    ...raw,
    scriptConfigSchemaVersion: SCRIPT_CONFIG_SCHEMA_VERSION,
    layoutPresets,
    activeLayoutPresetId,
    tabGroupButtonsMode,
    tabGroupButtonPlacement: normalizeTabGroupButtonPlacement(raw.tabGroupButtonPlacement, tabGroupButtonsMode),
    tabGroupButtonOrder: normalizeTabGroupButtonOrder(raw.tabGroupButtonOrder),
    tooltipDisabledIds: normalizeTooltipDisabledIds(raw.tooltipDisabledIds),
    topbarLayout: migrateDeleteThreadTopbarLayout(raw),
    topbarDeleteThreadMigrated: true,
    pocketCardSize: normalizePocketCardSize(raw.pocketCardSize),
    frameLoadingOverlayOpacity: boundedNumber(raw.frameLoadingOverlayOpacity, base.frameLoadingOverlayOpacity, 0, 100),
    ...primaryColorState,
    apiProfiles,
    apiPromotionChannelsVersion: Math.max(Number(raw.apiPromotionChannelsVersion) || 0, API_PROMOTION_CHANNELS_VERSION),
    optimizeApiProfileId: profileIds.has(raw.optimizeApiProfileId) ? raw.optimizeApiProfileId : optimizeFallback,
    summaryApiProfileId: profileIds.has(raw.summaryApiProfileId) ? raw.summaryApiProfileId : summaryFallback,
    optimizePromptTemplates,
    optimizePromptTemplateId: optimizePromptTemplates.some((item) => item.id === raw.optimizePromptTemplateId)
      ? raw.optimizePromptTemplateId
      : optimizePromptTemplates[0]?.id || optimizeDefault.id,
    summaryPromptTemplates,
    summaryPromptTemplateId: summaryPromptTemplates.some((item) => item.id === raw.summaryPromptTemplateId)
      ? raw.summaryPromptTemplateId
      : summaryPromptTemplates[0]?.id || summaryDefault.id,
    modelPreferences: normalizeModelPreferences(raw.modelPreferences),
    modelPreferenceOrder: normalizeModelPreferenceOrder(raw.modelPreferenceOrder),
    messageNavigatorEffectMode: normalizeMessageNavigatorEffectMode(raw.messageNavigatorEffectMode),
    messageNavigatorSiteConfigs: mergeBuiltInMessageNavigatorConfig(raw.messageNavigatorSiteConfigs, MESSAGE_NAVIGATOR_SITE_CONFIGS),
    summarySiteConfigs: mergeBuiltInSummaryConfig(raw.summarySiteConfigs, SUMMARY_SITE_CONFIGS),
    topicDeleteSiteConfigs: mergeBuiltInTopicDeleteConfig(raw.topicDeleteSiteConfigs, TOPIC_DELETE_SITE_CONFIGS)
  };
}

export function normalizeCustomConfig(raw = []) {
  return (Array.isArray(raw) ? raw : []).filter(Boolean).map((item, index) => ({
    id: text(item.id) || createId("custom-app"),
    name: inferCustomName(item, index),
    provider: text(item.provider || item.company, "Custom"),
    url: text(item.url, "https://www.example.com/"),
    inputSelector: text(item.inputSelector),
    sendButtonSelector: text(item.sendButtonSelector),
    hosts: Array.isArray(item.hosts) ? item.hosts : []
  })).filter((item) => item.name && item.url);
}

export function normalizePromptLibrary(raw = []) {
  return (Array.isArray(raw) ? raw : []).filter(Boolean).map((item, index) => ({
    id: text(item.id) || createId("prompt"),
    title: text(item.title || item.name, `Prompt ${index + 1}`),
    prompt: String(item.prompt || item.content || "")
  })).filter((item) => item.title && item.prompt);
}

export function normalizePromptSendHistory(raw = []) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).filter(Boolean).map((item) => {
    const value = typeof item === "string" ? item : item?.text || item?.prompt || item?.content;
    return {
      id: text(item?.id) || createId("prompt-history"),
      text: text(value),
      createdAt: text(item?.createdAt) || new Date().toISOString()
    };
  }).filter((item) => {
    if (!item.text || seen.has(item.text)) return false;
    seen.add(item.text);
    return true;
  }).slice(0, 100);
}

function normalizePocketHistoryItems(raw = []) {
  const wholeNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
  };
  return (Array.isArray(raw) ? raw : []).filter(Boolean).map((item, index) => {
    const chatUrl = text(item.chatUrl || item.url || item.href);
    const appId = text(item.appId);
    const appName = text(item.appName || item.siteName || item.name);
    const instanceId = text(item.instanceId);
    const batchId = text(item.batchId) || "legacy";
    const createdAt = text(item.createdAt) || new Date().toISOString();
    const batchCreatedAt = text(item.batchCreatedAt) || createdAt;
    const sourceId = text(item.sourceId) || instanceId || [appId || appName, chatUrl].filter(Boolean).join("\n");
    return {
      id: text(item.id) || createId("pocket"),
      batchId,
      batchCreatedAt,
      sourceId,
      chatUrl,
      title: text(item.title || item.pageTitle),
      appName,
      appId,
      groupId: text(item.groupId),
      instanceId,
      groupIndex: wholeNumber(item.groupIndex, 0),
      tabIndex: wholeNumber(item.tabIndex, index),
      userMessage: text(item.userMessage || item.user),
      assistantMessage: text(item.assistantMessage || item.assistant),
      createdAt
    };
  }).filter((item) => item.chatUrl && item.userMessage && item.assistantMessage);
}

export function dedupePocketHistory(raw = []) {
  const seen = new Set();
  return normalizePocketHistoryItems(raw).filter((item) => {
    const key = [item.batchId || "legacy", item.chatUrl, item.userMessage, item.assistantMessage].join("\n");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 300);
}

export function mergePocketHistory(existing = [], incoming = []) {
  return dedupePocketHistory([...existing, ...incoming]);
}

export function normalizePocketHistory(raw = []) {
  return normalizePocketHistoryItems(raw).slice(0, 300);
}

export function normalizeShortcutConfig(raw = {}) {
  return normalizeShortcutShape(raw);
}

export function getAllChatApps(customConfig = []) {
  const custom = normalizeCustomConfig(customConfig);
  const ids = new Set();
  return [...custom, ...BUILTIN_CHAT_APPS].filter((app) => {
    if (!app.id || ids.has(app.id)) return false;
    ids.add(app.id);
    return true;
  });
}

export async function storageGet(key) {
  return (await chrome.storage.local.get(key))[key];
}

export async function storageSet(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

function dehydrateSummarySiteConfig(config = {}) {
  const sourceMode = config.sourceMode === "custom" || config.builtIn === false ? "custom" : "builtIn";
  const out = { ...config, sourceMode };
  out.scriptType = out.scriptType || "summary";
  out.scriptId = summaryScriptId(out);
  if (sourceMode === "custom") {
    out.customUserscript = String(config.customUserscript || config.userscript || "").trim();
    out.userscriptOverride = Boolean(out.builtIn);
  } else {
    delete out.customUserscript;
    delete out.userscriptOverride;
  }
  delete out.userscript;
  delete out.userscriptLength;
  return out;
}

function dehydrateTopicDeleteSiteConfig(config = {}) {
  const sourceMode = config.sourceMode === "custom" || config.builtIn === false ? "custom" : "builtIn";
  const out = { ...config, sourceMode };
  out.scriptType = out.scriptType || "topic-delete";
  out.scriptId = text(out.scriptId || out.id);
  if (sourceMode === "custom") {
    out.customUserscript = String(config.customUserscript || config.userscript || "").trim();
    out.userscriptOverride = Boolean(out.builtIn);
  } else {
    delete out.customUserscript;
    delete out.userscriptOverride;
  }
  delete out.userscript;
  delete out.userscriptLength;
  return out;
}

function dehydrateMessageNavigatorSiteConfig(config = {}) {
  return {
    ...config,
    textCleanupSelectors: Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : []
  };
}

export function dehydrateOptions(options = {}) {
  const normalized = normalizeOptions(options);
  return {
    ...normalized,
    scriptConfigSchemaVersion: SCRIPT_CONFIG_SCHEMA_VERSION,
    messageNavigatorSiteConfigs: (normalized.messageNavigatorSiteConfigs || []).map(dehydrateMessageNavigatorSiteConfig),
    summarySiteConfigs: (normalized.summarySiteConfigs || []).map(dehydrateSummarySiteConfig),
    topicDeleteSiteConfigs: (normalized.topicDeleteSiteConfigs || []).map(dehydrateTopicDeleteSiteConfig)
  };
}

export async function loadOptions() {
  const options = normalizeOptions(await storageGet(STORAGE_KEYS.options));
  await storageSet(STORAGE_KEYS.options, dehydrateOptions(options));
  return options;
}

export async function saveOptions(options) {
  const normalized = normalizeOptions(options);
  await storageSet(STORAGE_KEYS.options, dehydrateOptions(normalized));
  return normalized;
}

export async function loadCustomConfig() {
  const custom = normalizeCustomConfig(await storageGet(STORAGE_KEYS.customConfig));
  await storageSet(STORAGE_KEYS.customConfig, custom);
  return custom;
}

export async function saveCustomConfig(customConfig) {
  const normalized = normalizeCustomConfig(customConfig);
  await storageSet(STORAGE_KEYS.customConfig, normalized);
  return normalized;
}

export async function loadPromptLibrary() {
  const prompts = normalizePromptLibrary(await storageGet(STORAGE_KEYS.promptLibrary));
  await storageSet(STORAGE_KEYS.promptLibrary, prompts);
  return prompts;
}

export async function savePromptLibrary(promptLibrary) {
  const normalized = normalizePromptLibrary(promptLibrary);
  await storageSet(STORAGE_KEYS.promptLibrary, normalized);
  return normalized;
}

export async function loadPromptSendHistory() {
  const history = normalizePromptSendHistory(await storageGet(STORAGE_KEYS.promptSendHistory));
  await storageSet(STORAGE_KEYS.promptSendHistory, history);
  return history;
}

export async function savePromptSendHistory(promptSendHistory) {
  const normalized = normalizePromptSendHistory(promptSendHistory);
  await storageSet(STORAGE_KEYS.promptSendHistory, normalized);
  return normalized;
}

export async function loadPocketHistory() {
  const history = normalizePocketHistory(await storageGet(STORAGE_KEYS.pocketHistory));
  await storageSet(STORAGE_KEYS.pocketHistory, history);
  return history;
}

export async function savePocketHistory(pocketHistory) {
  const normalized = normalizePocketHistory(pocketHistory);
  await storageSet(STORAGE_KEYS.pocketHistory, normalized);
  return normalized;
}

export async function loadShortcutConfig() {
  const config = normalizeShortcutConfig(await storageGet(STORAGE_KEYS.shortcutConfig));
  await storageSet(STORAGE_KEYS.shortcutConfig, config);
  return config;
}

export async function saveShortcutConfig(shortcutConfig) {
  const normalized = normalizeShortcutConfig(shortcutConfig);
  await storageSet(STORAGE_KEYS.shortcutConfig, normalized);
  return normalized;
}

function hasBundleField(bundle, key) {
  return Object.prototype.hasOwnProperty.call(bundle, key);
}

function hasBundleObjectField(bundle, key) {
  return hasBundleField(bundle, key) && plainObject(bundle[key]);
}

function hasBundleArrayField(bundle, key) {
  return hasBundleField(bundle, key) && Array.isArray(bundle[key]);
}

function hasBundleNonEmptyObjectField(bundle, key) {
  return hasBundleObjectField(bundle, key) && Object.keys(bundle[key]).length > 0;
}

function normalizeImportArrayField(raw, normalize, validItem) {
  if (!Array.isArray(raw)) return null;
  if (!raw.length) return normalize([]);
  const validItems = raw.filter(validItem);
  return validItems.length ? normalize(validItems) : null;
}

function validImportedCustomConfigItem(item) {
  return plainObject(item) && !!text(item.url);
}

function validImportedPromptLibraryItem(item) {
  return plainObject(item) && !!text(item.prompt || item.content);
}

function validImportedPromptSendHistoryItem(item) {
  if (typeof item === "string") return !!text(item);
  return plainObject(item) && !!text(item.text || item.prompt || item.content);
}

function validImportedPocketHistoryItem(item) {
  return plainObject(item)
    && !!text(item.chatUrl || item.url || item.href)
    && !!text(item.userMessage || item.user)
    && !!text(item.assistantMessage || item.assistant);
}

export function normalizeConfigBundleKeys(selectedKeys = CONFIG_BUNDLE_KEYS) {
  const source = selectedKeys == null ? CONFIG_BUNDLE_KEYS : selectedKeys;
  const keys = Array.isArray(source)
    ? source
    : source && typeof source !== "string" && typeof source[Symbol.iterator] === "function"
      ? [...source]
      : [];
  return keys.filter((key, index) =>
    CONFIG_BUNDLE_KEY_SET.has(key) && keys.indexOf(key) === index
  );
}

export function exportConfigBundle(state = {}, selectedKeys = CONFIG_BUNDLE_KEYS) {
  const selected = new Set(normalizeConfigBundleKeys(selectedKeys));
  const bundle = {
    schema: "chatclub.config.v1",
    exportedAt: new Date().toISOString()
  };
  if (selected.has("options")) bundle.options = dehydrateOptions(state.options);
  if (selected.has("customConfig")) bundle.customConfig = normalizeCustomConfig(state.customConfig);
  if (selected.has("promptLibrary")) bundle.promptLibrary = normalizePromptLibrary(state.promptLibrary);
  if (selected.has("promptSendHistory")) bundle.promptSendHistory = normalizePromptSendHistory(state.promptSendHistory);
  if (selected.has("shortcutConfig")) bundle.shortcutConfig = normalizeShortcutConfig(state.shortcutConfig);
  if (selected.has("pocketHistory")) bundle.pocketHistory = dedupePocketHistory(state.pocketEntries || state.pocketHistory);
  return bundle;
}

export function migrateImportedConfig(raw) {
  const bundle = plainObject(raw) ? raw : {};
  return {
    options: hasBundleNonEmptyObjectField(bundle, "options") ? normalizeOptions(bundle.options) : null,
    customConfig: hasBundleArrayField(bundle, "customConfig")
      ? normalizeImportArrayField(bundle.customConfig, normalizeCustomConfig, validImportedCustomConfigItem)
      : null,
    promptLibrary: hasBundleArrayField(bundle, "promptLibrary")
      ? normalizeImportArrayField(bundle.promptLibrary, normalizePromptLibrary, validImportedPromptLibraryItem)
      : null,
    promptSendHistory: hasBundleArrayField(bundle, "promptSendHistory")
      ? normalizeImportArrayField(bundle.promptSendHistory, normalizePromptSendHistory, validImportedPromptSendHistoryItem)
      : null,
    shortcutConfig: hasBundleNonEmptyObjectField(bundle, "shortcutConfig") ? normalizeShortcutConfig(bundle.shortcutConfig) : null,
    pocketHistory: hasBundleArrayField(bundle, "pocketHistory")
      ? normalizeImportArrayField(bundle.pocketHistory, dedupePocketHistory, validImportedPocketHistoryItem)
      : null
  };
}

export async function saveImportedConfigPatch(patch = {}) {
  const source = plainObject(patch) ? patch : {};
  const updates = {};
  const normalized = {};
  if (hasBundleField(source, "options")) {
    normalized.options = normalizeOptions(source.options);
    updates[STORAGE_KEYS.options] = dehydrateOptions(normalized.options);
  }
  if (hasBundleField(source, "customConfig")) {
    normalized.customConfig = normalizeCustomConfig(source.customConfig);
    updates[STORAGE_KEYS.customConfig] = normalized.customConfig;
  }
  if (hasBundleField(source, "promptLibrary")) {
    normalized.promptLibrary = normalizePromptLibrary(source.promptLibrary);
    updates[STORAGE_KEYS.promptLibrary] = normalized.promptLibrary;
  }
  if (hasBundleField(source, "promptSendHistory")) {
    normalized.promptSendHistory = normalizePromptSendHistory(source.promptSendHistory);
    updates[STORAGE_KEYS.promptSendHistory] = normalized.promptSendHistory;
  }
  if (hasBundleField(source, "shortcutConfig")) {
    normalized.shortcutConfig = normalizeShortcutConfig(source.shortcutConfig);
    updates[STORAGE_KEYS.shortcutConfig] = normalized.shortcutConfig;
  }
  if (hasBundleField(source, "pocketHistory")) {
    normalized.pocketHistory = dedupePocketHistory(source.pocketHistory);
    updates[STORAGE_KEYS.pocketHistory] = normalized.pocketHistory;
  }
  if (Object.keys(updates).length) {
    await chrome.storage.local.set(updates);
  }
  return normalized;
}
