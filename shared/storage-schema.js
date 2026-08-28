// Pure configuration schema, normalization, dehydration, and migration logic.
// Browser persistence and backup-file transport live in their dedicated modules.
import {
  API_PROMOTION_CHANNELS_VERSION,
  API_PROFILE_DEFAULT_MODEL_MIGRATION_VERSION,
  API_PROFILE_ENDPOINT_DEFAULT,
  API_PROFILE_MODEL_DEFAULT,
  BUILTIN_CHAT_APPS,
  DEFAULT_POCKET_CARD_SIZE,
  DEFAULT_POCKET_ICON,
  DEFAULT_FRAME_TOAST_POSITION,
  DEFAULT_GEMINI_THINKING_LEVEL,
  DEFAULT_MODEL_PREFERENCE_FAILURE_OVERRIDES,
  DEFAULT_MODEL_PREFERENCE_FAILURE_POLICY,
  DEFAULT_MODEL_PREFERENCE_ORDER,
  DEFAULT_MODEL_PREFERENCES,
  DEFAULT_PROMOTION_API_PROFILES,
  DEFAULT_TAB_CONTEXT_MENU_ORDER,
  DEFAULT_TAB_GROUP_BUTTON_ORDER,
  DEFAULT_TAB_GROUP_BUTTON_PLACEMENT,
  DEFAULT_TABS_SIDEBAR_BUTTON_ORDER,
  DEFAULT_TABS_SIDEBAR_BUTTON_PLACEMENT,
  DEFAULT_OPTIONS,
  GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
  GEMINI_THINKING_LEVEL_TARGETS,
  MODEL_PREFERENCE_FAILURE_OVERRIDE_POLICIES,
  MODEL_PREFERENCE_FAILURE_POLICIES,
  MODEL_PREFERENCE_SECONDARY_ENABLED_KEY,
  MODEL_PREFERENCE_SECONDARY_KEYS,
  MODEL_PREFERENCE_TARGETS,
  NOTION_ALL_SOURCES_PREFERENCE_KEY,
  NOTION_ALL_SOURCES_PREFERENCE_VALUES,
  NOTION_EFFORT_PREFERENCE_KEY,
  PROMPT_IMAGE_PASTE_STRATEGIES,
  PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL,
  SCRIPT_CONFIG_SCHEMA_VERSION,
  TAB_GROUP_BUTTON_ORDER_MIGRATION_VERSION,
  TAB_GROUP_HEADER_BUTTONS,
  TABS_SIDEBAR_HOVER_BUTTONS,
  TAB_CONTEXT_MENU_ITEMS,
  TOOLTIP_TARGET_IDS,
  TOPBAR_PROMPT_INPUT_FONT_SIZE_MAX_PX,
  TOPBAR_PROMPT_INPUT_FONT_SIZE_MIN_PX,
  TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MAX_SEC,
  TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MIN_SEC,
  TOPBAR_PROMPT_PLACEHOLDER_MAX_COUNT,
  TOPBAR_PROMPT_PLACEHOLDER_MAX_LEN
} from "./constants.js";
import {
  normalizeAppPickerAppOrders,
  normalizeAppPickerSectionOrder
} from "./app-picker-order.js";
import { normalizeNotionEffortPreferences } from "./notion-efforts.js";
import { SUMMARY_SITE_CONFIGS } from "./summary-sites.js";
import {
  MESSAGE_NAVIGATOR_SITE_CONFIGS,
  mergeBuiltInMessageNavigatorConfig,
  normalizeMessageNavigatorEffectMode
} from "./message-navigator-sites.js";
import { normalizeShortcutConfig as normalizeShortcutShape } from "./shortcuts.js";
import { TOPIC_DELETE_SITE_CONFIGS, mergeBuiltInTopicDeleteConfig } from "./topic-delete-sites.js";
import { normalizeTopbarLayout } from "./topbar.js";
import { hostMatchesPattern, normalizeHost, normalizeHostList } from "./url-match.js";
import { customUserscriptSource, isCustomUserscriptConfig } from "./userscript-config.js";
import {
  normalizeBuiltinChatAppIframeConfigs,
  normalizeIframeConfig
} from "./chat-frame-config.js";

export function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const POCKET_HISTORY_LIMIT = 300;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function plainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function coerceHttpUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return `https://${raw}`;
}

export function normalizeHttpUrl(value) {
  const raw = coerceHttpUrl(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
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

export function normalizePocketIcon(value, fallback = DEFAULT_POCKET_ICON) {
  return value === "pocket" || value === "star" ? value : fallback === "pocket" ? "pocket" : "star";
}

export function normalizeFrameToastPosition(value = {}) {
  const source = plainObject(value) ? value : {};
  const coordinate = (input, fallback) => (
    input === "" || input === null || input === undefined || typeof input === "boolean"
      ? fallback
      : boundedNumber(input, fallback, 0, 100)
  );
  return {
    x: coordinate(source.x, DEFAULT_FRAME_TOAST_POSITION.x),
    y: coordinate(source.y, DEFAULT_FRAME_TOAST_POSITION.y)
  };
}

export function normalizeModelPreferenceSelectionOverlayOpacity(
  value,
  fallback = DEFAULT_OPTIONS.modelPreferenceSelectionOverlayOpacity
) {
  if (
    (typeof value !== "number" && typeof value !== "string")
    || (typeof value === "string" && !value.trim())
  ) return fallback;
  return boundedNumber(value, fallback, 0, 100);
}

export const TOOLTIP_DISABLED_ID_ALIASES = Object.freeze({
  "pocket.collapseSidebar": "pocket.sidebar",
  "pocket.expandSidebar": "pocket.sidebar",
  "pocket.exitFocusMode": "pocket.focusMode",
  "workspace.tabs.unpin": "workspace.tabs.pin",
  "workspace.tabs.sortTime": "workspace.tabs.sortViewed"
});

function normalizeTooltipDisabledIds(value = []) {
  const validIds = new Set(TOOLTIP_TARGET_IDS);
  const ordered = [];
  for (const id of Array.isArray(value) ? value : []) {
    const raw = text(id);
    const normalized = TOOLTIP_DISABLED_ID_ALIASES[raw] || raw;
    if (!validIds.has(normalized) || ordered.includes(normalized)) continue;
    ordered.push(normalized);
  }
  return ordered;
}

export function normalizeBuiltinChatAppOrder(value = []) {
  const knownIds = BUILTIN_CHAT_APPS.map((app) => app.id).filter(Boolean);
  const known = new Set(knownIds);
  const ordered = [];
  for (const id of Array.isArray(value) ? value : []) {
    const normalized = text(id);
    if (!known.has(normalized) || ordered.includes(normalized)) continue;
    ordered.push(normalized);
  }
  for (const id of knownIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

export function normalizeTopbarPromptPlaceholderText(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TOPBAR_PROMPT_PLACEHOLDER_MAX_LEN);
}

export function normalizeTopbarPromptInputFontSize(
  value,
  fallback = DEFAULT_OPTIONS.topbarPromptInputFontSize
) {
  if (
    (typeof value !== "number" && typeof value !== "string")
    || (typeof value === "string" && !value.trim())
  ) return fallback;
  return boundedNumber(
    value,
    fallback,
    TOPBAR_PROMPT_INPUT_FONT_SIZE_MIN_PX,
    TOPBAR_PROMPT_INPUT_FONT_SIZE_MAX_PX
  );
}

function normalizeTopbarPromptPlaceholderState(value = {}, itemCount = 0) {
  const raw = plainObject(value) ? value : {};
  if (itemCount <= 0) return { index: -1, lastRandom: -1 };
  const maxIndex = Math.max(0, itemCount - 1);
  return {
    index: boundedNumber(raw.index, -1, -1, maxIndex),
    lastRandom: boundedNumber(raw.lastRandom, -1, -1, maxIndex)
  };
}

export function normalizeTopbarPromptPlaceholderConfig(value = {}) {
  const raw = plainObject(value) ? value : {};
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map(normalizeTopbarPromptPlaceholderText)
    .filter(Boolean)
    .slice(0, TOPBAR_PROMPT_PLACEHOLDER_MAX_COUNT);
  return {
    items,
    mode: raw.mode === "interval" ? "interval" : "refresh",
    order: raw.order === "random" ? "random" : "sequential",
    intervalSec: boundedNumber(
      raw.intervalSec,
      DEFAULT_OPTIONS.topbarPromptPlaceholderConfig.intervalSec,
      TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MIN_SEC,
      TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MAX_SEC
    ),
    state: normalizeTopbarPromptPlaceholderState(raw.state, items.length)
  };
}

function normalizeStoredPrimaryColor(raw, fallback) {
  const color = normalizePrimaryColor(raw.primaryColor, fallback);
  const custom = raw.primaryColorCustom === true;
  return {
    primaryColor: !custom && color === "#1677ff" ? fallback : color,
    primaryColorCustom: custom
  };
}

function normalizeTabGroupButtonsMode(value) {
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

function normalizeTabGroupButtonOrderItems(value = [], valid = new Set()) {
  const ordered = [];
  for (const id of Array.isArray(value) ? value : []) {
    if (valid.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

export function normalizeTabGroupButtonOrder(value = []) {
  const configurableIds = TAB_GROUP_HEADER_BUTTONS
    .filter((item) => !item.requiredPinned)
    .map((item) => item.id);
  const valid = new Set(configurableIds);
  // A stored array may be a deliberate custom order even when it happens to
  // equal an old default. Preserve it; only absent/invalid state gets today's default.
  const source = Array.isArray(value) ? value : DEFAULT_TAB_GROUP_BUTTON_ORDER;
  const ordered = normalizeTabGroupButtonOrderItems(source, valid);
  for (const id of configurableIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

export function normalizeTabContextMenuOrder(value = undefined, fallback = DEFAULT_TAB_CONTEXT_MENU_ORDER) {
  const valid = new Set(TAB_CONTEXT_MENU_ITEMS.map((item) => item.id));
  const source = Array.isArray(value)
    ? value
    : Array.isArray(fallback)
      ? fallback
      : DEFAULT_TAB_CONTEXT_MENU_ORDER;
  const ordered = normalizeTabGroupButtonOrderItems(source, valid);
  for (const id of TAB_CONTEXT_MENU_ITEMS.map((item) => item.id)) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

export function normalizeTabContextMenuHiddenIds(value = []) {
  const valid = new Set(TAB_CONTEXT_MENU_ITEMS.map((item) => item.id));
  const hidden = [];
  for (const id of Array.isArray(value) ? value : []) {
    if (valid.has(id) && !hidden.includes(id)) hidden.push(id);
  }
  return hidden;
}

export function normalizeTabsSidebarButtonPlacement(value = {}) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(TABS_SIDEBAR_HOVER_BUTTONS.map((item) => {
    if (item.requiredPinned) return [item.id, "pinned"];
    const saved = raw[item.id];
    const placement = saved === "menu" || saved === "pinned" || saved === "hidden"
      ? saved
      : DEFAULT_TABS_SIDEBAR_BUTTON_PLACEMENT[item.id] || "pinned";
    return [item.id, placement === "menu" || placement === "hidden" ? placement : "pinned"];
  }));
}

export function normalizeTabsSidebarButtonOrder(value = []) {
  const configurableIds = TABS_SIDEBAR_HOVER_BUTTONS
    .filter((item) => !item.requiredPinned)
    .map((item) => item.id);
  const valid = new Set(configurableIds);
  const source = Array.isArray(value) ? value : DEFAULT_TABS_SIDEBAR_BUTTON_ORDER;
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
    [/(^|\.)kimi\.ai$/, "Kimi.ai"],
    [/(^|\.)kimi\.com$/, "Kimi.com"],
    [/(^|\.)dola\.com$/, "Dola"],
    [/(^|\.)qwen\.ai$/, "Qwen"],
    [/(^|\.)qianwen\.com$/, "千问"],
    [/(^|\.)lobehub\.com$/, "LobeHub"],
    [/(^|\.)typingcloud\.com$/, "TypingMind"]
  ].find(([pattern]) => pattern.test(host))?.[1];
  if (!rawName || /^custom(?:\s+\d+)?$/i.test(rawName) || rawName === host) {
    return inferred || (provider && !/^custom$/i.test(provider) ? provider : host || `Custom ${index + 1}`);
  }
  return rawName;
}

const DEFAULT_CUSTOM_APP_NAME = "Custom App";
const DEFAULT_CUSTOM_APP_PROVIDER = "Custom";
const DEFAULT_CUSTOM_INPUT_SELECTOR = "textarea, [contenteditable='true']";
const DEFAULT_CUSTOM_SEND_SELECTOR = "button[aria-label*='Send' i], button[aria-label*='Submit' i], button[aria-label*='发送' i], button[aria-label*='提交' i]";
const GENERIC_APP_SUBDOMAINS = new Set(["www", "www2", "app", "apps", "chat", "api", "m", "web"]);

function hostnameFromHttpUrl(value) {
  try {
    return new URL(normalizeHttpUrl(value)).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

function hostLookupKeys(hostname) {
  const normalized = normalizeHost(hostname) || String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (!normalized) return [];
  const bare = normalized.replace(/^www\./, "");
  return [...new Set([normalized, bare, bare ? `www.${bare}` : ""].filter(Boolean))];
}

function chatAppHostPatterns(app = {}) {
  const hosts = [];
  for (const host of Array.isArray(app.hosts) ? app.hosts : []) {
    const normalized = normalizeHost(host);
    if (normalized) hosts.push(normalized);
  }
  const urlHost = hostnameFromHttpUrl(app.url);
  if (urlHost) {
    const normalized = normalizeHost(urlHost);
    if (normalized) hosts.push(normalized);
  }
  return [...new Set(hosts)];
}

function displayNameFromHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase().replace(/^www\./, "");
  if (!host) return "";
  const labels = host.split(".").filter(Boolean);
  if (!labels.length) return "";
  let candidate = labels[0];
  if (labels.length >= 3 && GENERIC_APP_SUBDOMAINS.has(candidate)) candidate = labels[1];
  if (!candidate) return "";
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

function preferredCatalogUrl(userHref, matched) {
  if (!matched?.url) return userHref;
  try {
    const user = new URL(userHref);
    const catalog = new URL(matched.url);
    const userKeys = new Set(hostLookupKeys(user.hostname));
    const sameHost = hostLookupKeys(catalog.hostname).some((key) => userKeys.has(key))
      || chatAppHostPatterns(matched).some((pattern) => [...userKeys].some((key) => hostMatchesPattern(pattern, key)));
    if (!sameHost) return userHref;
    if ((user.pathname === "/" || user.pathname === "") && !user.search && !user.hash) return catalog.href;
  } catch {}
  return userHref;
}

function findChatAppByHref(value, catalog = BUILTIN_CHAT_APPS) {
  const href = normalizeHttpUrl(value);
  if (!href) return null;
  const hostname = hostnameFromHttpUrl(href);
  if (!hostname) return null;
  const keys = hostLookupKeys(hostname);
  return (Array.isArray(catalog) ? catalog : []).find((app) => {
    return chatAppHostPatterns(app).some((pattern) => keys.some((key) => hostMatchesPattern(pattern, key)));
  }) || null;
}

function fieldIsReplaceable(currentValue, autofilledValue, defaults = []) {
  const raw = text(currentValue);
  if (!raw) return true;
  if (defaults.some((item) => text(item) === raw)) return true;
  if (/^custom(?:\s+\d+)?$/i.test(raw) && defaults.includes(DEFAULT_CUSTOM_APP_NAME)) return true;
  if (autofilledValue != null && text(autofilledValue) === raw) return true;
  return false;
}

export function suggestCustomAppDraft(rawUrl, options = {}) {
  const catalog = Array.isArray(options.catalog) ? options.catalog : BUILTIN_CHAT_APPS;
  const current = options.current && typeof options.current === "object" ? options.current : {};
  const autofilled = options.autofilled && typeof options.autofilled === "object" ? options.autofilled : {};
  const url = normalizeHttpUrl(rawUrl);
  if (!url) {
    return {
      ok: false,
      url: "",
      host: "",
      matched: null,
      kind: "",
      values: {},
      nextAutofilled: { ...autofilled }
    };
  }
  const matched = findChatAppByHref(url, catalog);
  const host = hostnameFromHttpUrl(url);
  const bareHost = host.replace(/^www\./, "");
  const resolvedUrl = preferredCatalogUrl(url, matched);
  const proposed = matched
    ? {
      name: text(matched.name) || displayNameFromHost(host) || DEFAULT_CUSTOM_APP_NAME,
      provider: text(matched.provider) || DEFAULT_CUSTOM_APP_PROVIDER,
      url: resolvedUrl,
      inputSelector: text(matched.inputSelector) || DEFAULT_CUSTOM_INPUT_SELECTOR,
      sendButtonSelector: text(matched.sendButtonSelector) || DEFAULT_CUSTOM_SEND_SELECTOR,
      imagePasteStrategy: normalizePromptImagePasteStrategy(matched.imagePasteStrategy),
      hosts: chatAppHostPatterns(matched)
    }
    : {
      name: displayNameFromHost(host) || DEFAULT_CUSTOM_APP_NAME,
      provider: DEFAULT_CUSTOM_APP_PROVIDER,
      url: resolvedUrl,
      inputSelector: DEFAULT_CUSTOM_INPUT_SELECTOR,
      sendButtonSelector: DEFAULT_CUSTOM_SEND_SELECTOR,
      imagePasteStrategy: PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL,
      hosts: bareHost ? [bareHost] : []
    };
  const values = { url: proposed.url, hosts: proposed.hosts };
  const nextAutofilled = { ...autofilled, url: proposed.url, hosts: proposed.hosts };
  const fields = [
    ["name", [DEFAULT_CUSTOM_APP_NAME, bareHost, host]],
    ["provider", [DEFAULT_CUSTOM_APP_PROVIDER]],
    ["inputSelector", [DEFAULT_CUSTOM_INPUT_SELECTOR]],
    ["sendButtonSelector", [DEFAULT_CUSTOM_SEND_SELECTOR]],
    ["imagePasteStrategy", [PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL]]
  ];
  for (const [key, defaults] of fields) {
    if (!fieldIsReplaceable(current[key], autofilled[key], defaults)) continue;
    values[key] = proposed[key];
    nextAutofilled[key] = proposed[key];
  }
  return {
    ok: true,
    url: proposed.url,
    host: bareHost,
    matched,
    kind: matched ? "match" : "suggest",
    values,
    nextAutofilled
  };
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

function migrateDefaultApiProfileModel(profile, migrationVersion) {
  if (migrationVersion >= API_PROFILE_DEFAULT_MODEL_MIGRATION_VERSION) return profile;
  if (
    profile.id !== "default-openai"
    || profile.name !== "Default API"
    || profile.endpoint !== API_PROFILE_ENDPOINT_DEFAULT
    || profile.apiKey
    || profile.model !== "gpt-3.5-turbo"
  ) return profile;
  return { ...profile, model: API_PROFILE_MODEL_DEFAULT };
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
  const selectedIds = new Set([
    text(raw.optimizeApiProfileId),
    text(raw.summaryApiProfileId),
    text(raw.topicTitleApiProfileId)
  ].filter(Boolean));
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

function migrateSearchTopbarLayout(raw = {}) {
  const normalized = migrateDeleteThreadTopbarLayout(raw);
  if (raw.topbarSearchMigrated === true || topbarLayoutHasItem(normalized, "search")) return normalized;
  const composerIndex = normalized.findIndex((item) => item.type === "item" && item.id === "composer");
  const insertIndex = composerIndex >= 0 ? composerIndex : normalized.length;
  return [
    ...normalized.slice(0, insertIndex),
    { type: "item", id: "search" },
    ...normalized.slice(insertIndex)
  ];
}

function migrateShareTopbarLayout(raw = {}) {
  const normalized = migrateSearchTopbarLayout(raw);
  if (raw.topbarShareMigrated === true || topbarLayoutHasItem(normalized, "share")) return normalized;
  const summaryIndex = normalized.findIndex((item) => item.type === "item" && item.id === "summary");
  const pocketIndex = normalized.findIndex((item) => item.type === "item" && item.id === "pocket");
  const insertIndex = summaryIndex >= 0 ? summaryIndex + 1 : pocketIndex >= 0 ? pocketIndex : normalized.length;
  return [
    ...normalized.slice(0, insertIndex),
    { type: "item", id: "share" },
    ...normalized.slice(insertIndex)
  ];
}

function migrateHistoryTopbarLayout(raw = {}) {
  const normalized = migrateShareTopbarLayout(raw);
  if (raw.topbarHistoryMigrated === true || topbarLayoutHasItem(normalized, "history")) return normalized;
  const pocketIndex = normalized.findIndex((item) => item.type === "item" && item.id === "pocket");
  const insertIndex = pocketIndex >= 0 ? pocketIndex + 1 : normalized.length;
  return [
    ...normalized.slice(0, insertIndex),
    { type: "item", id: "history" },
    ...normalized.slice(insertIndex)
  ];
}

function withoutPromotionApiProfiles(apiProfiles) {
  return apiProfiles.filter((profile) => !DEFAULT_PROMOTION_API_PROFILES.some((promoted) => profile.id === promoted.id));
}

function normalizeModelPreferences(raw = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const normalized = { ...DEFAULT_MODEL_PREFERENCES };
  for (const [appId, targets] of Object.entries(MODEL_PREFERENCE_TARGETS)) {
    const value = text(source[appId]);
    const allowed = new Set((targets || []).map((target) => target.id));
    normalized[appId] = allowed.has(value) ? value : "";
  }
  normalized[MODEL_PREFERENCE_SECONDARY_ENABLED_KEY] = source[MODEL_PREFERENCE_SECONDARY_ENABLED_KEY] === true;
  for (const [appId, key] of Object.entries(MODEL_PREFERENCE_SECONDARY_KEYS)) {
    const value = text(source[key]);
    const allowed = new Set((MODEL_PREFERENCE_TARGETS[appId] || []).map((target) => target.id));
    normalized[key] = allowed.has(value) && value !== normalized[appId] ? value : "";
  }
  const thinkingLevel = text(source[GEMINI_THINKING_LEVEL_PREFERENCE_KEY], DEFAULT_GEMINI_THINKING_LEVEL);
  const allowedThinkingLevels = new Set(GEMINI_THINKING_LEVEL_TARGETS.map((target) => target.id));
  normalized[GEMINI_THINKING_LEVEL_PREFERENCE_KEY] = allowedThinkingLevels.has(thinkingLevel)
    ? thinkingLevel
    : DEFAULT_GEMINI_THINKING_LEVEL;
  const allSourcesPreference = text(source[NOTION_ALL_SOURCES_PREFERENCE_KEY]);
  normalized[NOTION_ALL_SOURCES_PREFERENCE_KEY] = NOTION_ALL_SOURCES_PREFERENCE_VALUES.includes(allSourcesPreference)
    ? allSourcesPreference
    : "";
  normalized[NOTION_EFFORT_PREFERENCE_KEY] = normalizeNotionEffortPreferences(
    source[NOTION_EFFORT_PREFERENCE_KEY]
  );
  return normalized;
}

export function normalizeModelPreferenceFailurePolicy(raw) {
  const value = text(raw);
  return MODEL_PREFERENCE_FAILURE_POLICIES.includes(value)
    ? value
    : DEFAULT_MODEL_PREFERENCE_FAILURE_POLICY;
}

export function normalizeModelPreferenceFailureOverrides(raw = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const normalized = { ...DEFAULT_MODEL_PREFERENCE_FAILURE_OVERRIDES };
  for (const appId of Object.keys(MODEL_PREFERENCE_TARGETS)) {
    const value = text(source[appId]);
    normalized[appId] = MODEL_PREFERENCE_FAILURE_OVERRIDE_POLICIES.includes(value) ? value : "inherit";
  }
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

function normalizePromptTemplates(raw, fallback, prefix) {
  const templates = Array.isArray(raw)
    ? raw.filter(Boolean).map((item, index) => normalizeTemplate(item, fallback, prefix, index))
    : [];
  return templates.length ? templates : [fallback];
}

function normalizeLayoutPreset(preset = {}, fallback = {}, index = 0) {
  const source = plainObject(preset) ? preset : {};
  const groups = (Array.isArray(source.chatAppIdGroups) ? source.chatAppIdGroups : fallback.chatAppIdGroups || [])
    .map((group) => (Array.isArray(group) ? group.map((id) => text(id)).filter(Boolean) : []))
    .filter((group) => group.length);
  return {
    ...source,
    id: text(source.id || fallback.id) || createId("layout"),
    name: text(source.name || source.title || fallback.name, `Layout ${index + 1}`),
    chatAppIdGroups: groups
  };
}

function normalizeLayoutPresets(raw, fallback = []) {
  const fallbackPresets = (Array.isArray(fallback) ? fallback : []).map((item, index) => normalizeLayoutPreset(item, {}, index));
  const presets = (Array.isArray(raw) ? raw : [])
    .map((item, index) => normalizeLayoutPreset(item, fallbackPresets[index], index))
    .filter((item) => item.id && item.chatAppIdGroups.length);
  return presets.length ? presets : fallbackPresets;
}

function summaryScriptId(item = {}, fallback = {}) {
  const file = text(item.userscriptFile || fallback.userscriptFile);
  return text(item.scriptId || fallback.scriptId || (file ? file.replace(/\.js$/i, "") : "") || item.id || fallback.id);
}

const LEGACY_BUILT_IN_SUMMARY_CONFIG_FIELDS = Object.freeze([
  "domTextFallback",
  "domTextFallbackRoles",
  "messageTextSelector",
  "userTextSelector",
  "assistantTextSelector",
  "messageSelector",
  "scopeSelector",
  "userRolePattern",
  "assistantRolePattern",
  "copyButtonSelector",
  "copyButtonPattern",
  "copyMenuButtonSelector",
  "copyMenuItemPattern"
]);

function normalizeSummarySiteConfig(item, fallback = {}, index = 0) {
  const builtIn = Boolean(fallback.builtIn || item?.builtIn);
  const customUserscript = typeof item?.customUserscript === "string"
    ? item.customUserscript
    : typeof item?.userscript === "string" ? item.userscript : "";
  const sourceMode = isCustomUserscriptConfig(item) || typeof item?.userscript === "string"
    ? "custom" : "builtIn";
  const copyTimeoutMs = boundedNumber(item?.copyTimeoutMs, 0, 300, 10000);
  const config = {
    ...fallback,
    ...item,
    enabled: item?.enabled !== false,
    fallbackMode: item?.fallbackMode === "allowPageText" ? "allowPageText" : "structuredOnly",
    hosts: normalizeHostList(item?.hosts),
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
    userscriptLength: sourceMode === "custom" ? customUserscript.length : Number(fallback.userscriptLength) || 0
  };
  delete config.userscript;
  delete config.userscriptOverride;
  if (sourceMode === "custom") {
    config.customUserscript = customUserscript;
  } else {
    delete config.customUserscript;
    for (const field of LEGACY_BUILT_IN_SUMMARY_CONFIG_FIELDS) delete config[field];
  }
  if (copyTimeoutMs) config.copyTimeoutMs = copyTimeoutMs;
  else delete config.copyTimeoutMs;
  return config;
}

function mergeBuiltInSummaryConfig(current = [], builtIn = SUMMARY_SITE_CONFIGS) {
  const currentItems = (Array.isArray(current) ? current : []).filter(Boolean);
  const builtInById = new Map((builtIn || []).filter(Boolean).map((item) => [item.id, item]));
  const consumedBuiltIns = new Set();
  const merged = [];

  const mergeBuiltIn = (item, existing = {}) => {
    return normalizeSummarySiteConfig({
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
      sourceMode: isCustomUserscriptConfig(existing) ? "custom" : "builtIn"
    }, item);
  };

  let customIndex = 0;
  for (const item of currentItems) {
    if (!item) continue;
    const id = text(item.id);
    const builtInConfig = builtInById.get(id);
    if (builtInConfig) {
      merged.push(mergeBuiltIn(builtInConfig, item));
      consumedBuiltIns.add(id);
      continue;
    }
    merged.push(normalizeSummarySiteConfig({
      ...item,
      builtIn: false
    }, {}, customIndex++));
  }

  for (const item of builtIn || []) {
    if (!item || consumedBuiltIns.has(item.id)) continue;
    merged.push(mergeBuiltIn(item));
  }

  return merged.filter((item) => item.id !== "chathub");
}

export function normalizeOptions(raw = {}) {
  const base = clone(DEFAULT_OPTIONS);
  const storedOptions = hasStoredOptions(raw);
  const rawApiProfileDefaultModelMigrationVersion = Number(raw.apiProfileDefaultModelMigrationVersion);
  const apiProfileDefaultModelMigrationVersion = Number.isFinite(rawApiProfileDefaultModelMigrationVersion)
    ? Math.max(0, Math.floor(rawApiProfileDefaultModelMigrationVersion))
    : 0;
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
  apiProfiles = apiProfiles.map((profile) => (
    migrateDefaultApiProfileModel(profile, apiProfileDefaultModelMigrationVersion)
  ));
  const fallbackProfileIds = apiProfiles.map((profile) => profile.id);
  apiProfiles = mergePromotionApiProfiles(apiProfiles, raw, !storedOptions);

  const profileIds = new Set(apiProfiles.map((profile) => profile.id));
  const optimizeFallback = profileIds.has(base.optimizeApiProfileId)
    ? base.optimizeApiProfileId
    : fallbackProfileIds[0] || apiProfiles[0]?.id || "";
  const summaryFallback = profileIds.has(base.summaryApiProfileId)
    ? base.summaryApiProfileId
    : fallbackProfileIds[1] || fallbackProfileIds[0] || apiProfiles[1]?.id || optimizeFallback;
  const topicTitleFallback = profileIds.has(base.topicTitleApiProfileId)
    ? base.topicTitleApiProfileId
    : fallbackProfileIds[0] || apiProfiles[0]?.id || optimizeFallback;

  const optimizeDefault = base.optimizePromptTemplates[0];
  const summaryDefault = base.summaryPromptTemplates[0];
  const optimizePromptTemplates = normalizePromptTemplates(raw.optimizePromptTemplates, optimizeDefault, "optimize-template");
  const summaryPromptTemplates = normalizePromptTemplates(raw.summaryPromptTemplates, summaryDefault, "summary-template");

  const layoutPresets = normalizeLayoutPresets(raw.layoutPresets, base.layoutPresets);
  const activeLayoutPresetId = layoutPresets.some((preset) => preset?.id === raw.activeLayoutPresetId)
    ? raw.activeLayoutPresetId
    : layoutPresets[0]?.id || "default";

  const primaryColorState = normalizeStoredPrimaryColor(raw, base.primaryColor);

  const tabGroupButtonsMode = normalizeTabGroupButtonsMode(raw.tabGroupButtonsMode);
  const rawTabGroupButtonOrderMigrationVersion = Number(raw.tabGroupButtonOrderMigrationVersion);
  const storedTabGroupButtonOrderMigrationVersion = Number.isFinite(rawTabGroupButtonOrderMigrationVersion)
    ? Math.max(0, Math.floor(rawTabGroupButtonOrderMigrationVersion))
    : 0;

  return {
    ...base,
    ...raw,
    scriptConfigSchemaVersion: SCRIPT_CONFIG_SCHEMA_VERSION,
    layoutPresets,
    activeLayoutPresetId,
    tabGroupButtonsMode,
    topbarPromptInputFontSize: normalizeTopbarPromptInputFontSize(raw.topbarPromptInputFontSize),
    topbarPromptPlaceholderConfig: normalizeTopbarPromptPlaceholderConfig(raw.topbarPromptPlaceholderConfig),
    tabGroupButtonPlacement: normalizeTabGroupButtonPlacement(raw.tabGroupButtonPlacement, tabGroupButtonsMode),
    tabGroupButtonOrder: normalizeTabGroupButtonOrder(raw.tabGroupButtonOrder),
    tabGroupButtonOrderMigrationVersion: Math.max(
      storedTabGroupButtonOrderMigrationVersion,
      TAB_GROUP_BUTTON_ORDER_MIGRATION_VERSION
    ),
    tabContextMenuOrder: normalizeTabContextMenuOrder(raw.tabContextMenuOrder, raw.tabGroupButtonOrder),
    tabContextMenuHiddenIds: normalizeTabContextMenuHiddenIds(raw.tabContextMenuHiddenIds),
    tabsSidebarButtonPlacement: normalizeTabsSidebarButtonPlacement(raw.tabsSidebarButtonPlacement),
    tabsSidebarButtonOrder: normalizeTabsSidebarButtonOrder(raw.tabsSidebarButtonOrder),
    appPickerSectionOrder: normalizeAppPickerSectionOrder(raw.appPickerSectionOrder),
    appPickerAppOrders: normalizeAppPickerAppOrders(raw.appPickerAppOrders),
    tooltipDisabledIds: normalizeTooltipDisabledIds(raw.tooltipDisabledIds),
    topbarLayout: migrateHistoryTopbarLayout(raw),
    topbarDeleteThreadMigrated: true,
    topbarSearchMigrated: true,
    topbarShareMigrated: true,
    topbarHistoryMigrated: true,
    pocketCardSize: normalizePocketCardSize(raw.pocketCardSize),
    pocketIcon: normalizePocketIcon(raw.pocketIcon),
    frameLoadingOverlayOpacity: boundedNumber(raw.frameLoadingOverlayOpacity, base.frameLoadingOverlayOpacity, 0, 100),
    modelPreferenceSelectionOverlayEnabled: typeof raw.modelPreferenceSelectionOverlayEnabled === "boolean"
      ? raw.modelPreferenceSelectionOverlayEnabled
      : base.modelPreferenceSelectionOverlayEnabled,
    recordFullText: typeof raw.recordFullText === "boolean"
      ? raw.recordFullText
      : base.recordFullText,
    modelPreferenceSelectionOverlayOpacity: normalizeModelPreferenceSelectionOverlayOpacity(
      raw.modelPreferenceSelectionOverlayOpacity
    ),
    frameToastPosition: normalizeFrameToastPosition(raw.frameToastPosition),
    ...primaryColorState,
    apiProfiles,
    apiProfileDefaultModelMigrationVersion: Math.max(
      apiProfileDefaultModelMigrationVersion,
      API_PROFILE_DEFAULT_MODEL_MIGRATION_VERSION
    ),
    apiPromotionChannelsVersion: Math.max(Number(raw.apiPromotionChannelsVersion) || 0, API_PROMOTION_CHANNELS_VERSION),
    optimizeApiProfileId: profileIds.has(raw.optimizeApiProfileId) ? raw.optimizeApiProfileId : optimizeFallback,
    summaryApiProfileId: profileIds.has(raw.summaryApiProfileId) ? raw.summaryApiProfileId : summaryFallback,
    topicTitleApiProfileId: profileIds.has(raw.topicTitleApiProfileId) ? raw.topicTitleApiProfileId : topicTitleFallback,
    optimizePromptTemplates,
    optimizePromptTemplateId: optimizePromptTemplates.some((item) => item.id === raw.optimizePromptTemplateId)
      ? raw.optimizePromptTemplateId
      : optimizePromptTemplates[0]?.id || optimizeDefault.id,
    summaryPromptTemplates,
    summaryPromptTemplateId: summaryPromptTemplates.some((item) => item.id === raw.summaryPromptTemplateId)
      ? raw.summaryPromptTemplateId
      : summaryPromptTemplates[0]?.id || summaryDefault.id,
    builtinChatAppOrder: normalizeBuiltinChatAppOrder(raw.builtinChatAppOrder),
    builtinChatAppIframeConfigs: normalizeBuiltinChatAppIframeConfigs(
      raw.builtinChatAppIframeConfigs,
      BUILTIN_CHAT_APPS.map((app) => app.id)
    ),
    iframePermissionsSource: raw.iframePermissionsSource === "custom" ? "custom" : "builtIn",
    modelPreferences: normalizeModelPreferences(raw.modelPreferences),
    modelPreferenceOrder: normalizeModelPreferenceOrder(raw.modelPreferenceOrder),
    modelPreferenceFailurePolicy: normalizeModelPreferenceFailurePolicy(raw.modelPreferenceFailurePolicy),
    modelPreferenceFailureOverrides: normalizeModelPreferenceFailureOverrides(raw.modelPreferenceFailureOverrides),
    messageNavigatorEffectMode: normalizeMessageNavigatorEffectMode(raw.messageNavigatorEffectMode),
    messageNavigatorSiteConfigs: mergeBuiltInMessageNavigatorConfig(raw.messageNavigatorSiteConfigs, MESSAGE_NAVIGATOR_SITE_CONFIGS),
    summarySiteConfigs: mergeBuiltInSummaryConfig(raw.summarySiteConfigs, SUMMARY_SITE_CONFIGS),
    topicDeleteSiteConfigs: mergeBuiltInTopicDeleteConfig(raw.topicDeleteSiteConfigs, TOPIC_DELETE_SITE_CONFIGS)
  };
}

export function normalizeCustomConfig(raw = []) {
  const ids = new Set();
  return (Array.isArray(raw) ? raw : []).filter(Boolean).map((item, index) => {
    const url = normalizeHttpUrl(item.url);
    const iframeConfig = normalizeIframeConfig(item.iframeConfig);
    const normalized = {
      id: text(item.id) || createId("custom-app"),
      name: inferCustomName(item, index),
      provider: text(item.provider || item.company, "Custom"),
      url,
      inputSelector: text(item.inputSelector),
      sendButtonSelector: text(item.sendButtonSelector),
      imagePasteStrategy: normalizePromptImagePasteStrategy(item.imagePasteStrategy),
      hosts: normalizeHostList(item.hosts)
    };
    if (iframeConfig) normalized.iframeConfig = iframeConfig;
    return normalized;
  }).filter((item) => {
    if (!item.name || !item.url || ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });
}

export function normalizePromptLibrary(raw = []) {
  return (Array.isArray(raw) ? raw : []).filter(Boolean).map((item, index) => ({
    id: text(item.id) || createId("prompt"),
    title: text(item.title || item.name, `Prompt ${index + 1}`),
    prompt: String(item.prompt || item.content || "")
  })).filter((item) => item.title && item.prompt);
}

function inferPromptImageMimeFromDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)[;,]/i);
  return match ? match[1].toLowerCase() : "";
}

function inferPromptImageExtension(mime) {
  const value = String(mime || "").trim().toLowerCase();
  if (value === "image/jpeg") return "jpg";
  if (value === "image/png") return "png";
  if (value === "image/webp") return "webp";
  if (value === "image/gif") return "gif";
  if (value === "image/bmp") return "bmp";
  if (value === "image/svg+xml") return "svg";
  if (value === "image/avif") return "avif";
  const tail = value.split("/").pop();
  return tail ? tail.replace(/[^a-z0-9]+/gi, "") || "png" : "png";
}

function normalizePromptHistoryImage(entry, index = 0) {
  if (!plainObject(entry)) return null;
  const dataUrl = text(entry.dataUrl || entry.dataURL);
  if (!/^data:image\//i.test(dataUrl)) return null;
  const type = text(entry.type).toLowerCase() || inferPromptImageMimeFromDataUrl(dataUrl) || "image/png";
  const ext = inferPromptImageExtension(type);
  const lastModifiedRaw = Number(entry.lastModified);
  return {
    id: text(entry.id) || createId("prompt-image"),
    name: text(entry.name) || `prompt-image-${index + 1}.${ext}`,
    type,
    size: Math.max(0, Math.round(Number(entry.size) || 0)),
    lastModified: Number.isFinite(lastModifiedRaw) ? lastModifiedRaw : Date.now(),
    dataUrl
  };
}

function normalizePromptHistoryImages(raw = []) {
  const usedNames = new Set();
  return (Array.isArray(raw) ? raw : [])
    .map((entry, index) => normalizePromptHistoryImage(entry, index))
    .filter(Boolean)
    .map((entry, index) => {
      let name = entry.name.replace(/[\\/]+/g, "_");
      const fallback = `prompt-image-${index + 1}.${inferPromptImageExtension(entry.type)}`;
      if (!name) name = fallback;
      const lower = name.toLowerCase();
      if (!usedNames.has(lower)) {
        usedNames.add(lower);
        return { ...entry, name };
      }
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let counter = 2;
      while (counter < 10000) {
        const candidate = `${stem} (${counter})${ext}`;
        const key = candidate.toLowerCase();
        if (!usedNames.has(key)) {
          usedNames.add(key);
          return { ...entry, name: candidate };
        }
        counter += 1;
      }
      return { ...entry, name: fallback };
    });
}

function promptHistoryKey(item = {}) {
  const imageKey = (item.images || [])
    .map((image) => [image.name, image.type, image.size, image.dataUrl.length].join(":"))
    .join("|");
  return `${item.text || ""}\n${imageKey}`;
}

export function normalizePromptSendHistory(raw = []) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).filter(Boolean).map((item) => {
    const value = typeof item === "string" ? item : item?.text || item?.prompt || item?.content;
    const images = normalizePromptHistoryImages(typeof item === "string" ? [] : item?.images);
    return {
      id: text(item?.id) || createId("prompt-history"),
      text: text(value),
      images,
      createdAt: text(item?.createdAt) || new Date().toISOString()
    };
  }).filter((item) => {
    const key = promptHistoryKey(item);
    if ((!item.text && !item.images.length) || seen.has(key)) return false;
    seen.add(key);
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

function pocketHistoryKey(item = {}) {
  return [item.batchId || "legacy", item.chatUrl, item.userMessage, item.assistantMessage].join("\n");
}

export function dedupePocketHistory(raw = []) {
  const seen = new Set();
  return normalizePocketHistoryItems(raw).filter((item) => {
    const key = pocketHistoryKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, POCKET_HISTORY_LIMIT);
}

export function mergePocketHistory(existing = [], incoming = []) {
  const existingItems = dedupePocketHistory(existing);
  const existingKeys = new Set(existingItems.map(pocketHistoryKey));
  const incomingItems = dedupePocketHistory(incoming).filter((item) => !existingKeys.has(pocketHistoryKey(item)));
  return dedupePocketHistory([...incomingItems, ...existingItems]);
}

export function normalizePocketHistory(raw = []) {
  return normalizePocketHistoryItems(raw).slice(0, POCKET_HISTORY_LIMIT);
}

export function normalizeShortcutConfig(raw = {}) {
  return normalizeShortcutShape(raw);
}

export function normalizePromptImagePasteStrategy(value, fallback = PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL) {
  const strategy = text(value).toLowerCase();
  return PROMPT_IMAGE_PASTE_STRATEGIES.includes(strategy) ? strategy : fallback;
}

export function getAllChatApps(customConfig = [], builtinChatAppOrder = [], builtinChatAppIframeConfigs = {}) {
  const custom = normalizeCustomConfig(customConfig).map((app) => ({
    ...app,
    source: "custom",
    chatAppSource: "custom"
  }));
  const builtInOrder = normalizeBuiltinChatAppOrder(builtinChatAppOrder);
  const iframeConfigs = normalizeBuiltinChatAppIframeConfigs(
    builtinChatAppIframeConfigs,
    BUILTIN_CHAT_APPS.map((app) => app.id)
  );
  const builtInById = new Map(BUILTIN_CHAT_APPS.map((app) => [app.id, app]));
  const builtIn = builtInOrder
    .map((id) => builtInById.get(id))
    .filter(Boolean)
    .map((app) => {
      const normalized = { ...app, source: "builtin", chatAppSource: "builtin" };
      if (iframeConfigs[app.id]) normalized.iframeConfig = iframeConfigs[app.id];
      return normalized;
    });
  const ids = new Set();
  return [...custom, ...builtIn].filter((app) => {
    if (!app.id || ids.has(app.id)) return false;
    ids.add(app.id);
    return true;
  });
}

function dehydrateSummarySiteConfig(config = {}) {
  const sourceMode = config.sourceMode === "custom" || config.builtIn === false ? "custom" : "builtIn";
  const out = { ...config, sourceMode };
  out.scriptType = out.scriptType || "summary";
  out.scriptId = summaryScriptId(out);
  if (sourceMode === "custom") {
    out.customUserscript = customUserscriptSource(config);
  } else {
    delete out.customUserscript;
  }
  delete out.userscript;
  delete out.userscriptOverride;
  return out;
}

function dehydrateTopicDeleteSiteConfig(config = {}) {
  const sourceMode = config.sourceMode === "custom" || config.builtIn === false ? "custom" : "builtIn";
  const out = { ...config, sourceMode };
  out.scriptType = out.scriptType || "topic-delete";
  out.scriptId = text(out.scriptId || out.id);
  if (sourceMode === "custom") {
    out.customUserscript = customUserscriptSource(config);
  } else {
    delete out.customUserscript;
  }
  delete out.userscript;
  delete out.userscriptOverride;
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

export function isStorageQuotaError(error) {
  const message = String(error?.message || error || "");
  return /quota|QUOTA_BYTES|storage\s+area/i.test(message);
}
