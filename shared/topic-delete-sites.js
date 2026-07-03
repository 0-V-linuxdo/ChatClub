import { configMatchesHref } from "./url-match.js";
import {
  DEEPSEEK_DELETE_USERSCRIPT,
  GROK_DELETE_USERSCRIPT,
  GROK_MIRROR_DELETE_USERSCRIPT,
  KAGI_DELETE_USERSCRIPT,
  NOTION_DELETE_USERSCRIPT
} from "./topic-delete-userscript-sources.js";

const LEGACY_KAGI_SHORTCUT_USERSCRIPT = `if (!api.dispatchDeleteKeyboardShortcut()) {
  return api.result(false, "kagi", "delete shortcut dispatch failed");
}
await api.sleep(240);
await api.clickDeleteConfirmIfPresent(1800);
return api.result(true, "kagi");`;

const LEGACY_TOPIC_DELETE_USERSCRIPTS = Object.freeze({
  kagi: Object.freeze([
    "return api.deleteKagiThread(data);",
    LEGACY_KAGI_SHORTCUT_USERSCRIPT
  ]),
  grok: Object.freeze([
    "return api.deleteGrokThread(data);",
    `const labels = ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"];
const trigger = api.topRightMenuTrigger({
  labels: ["More", "More actions", "Menu", "Options", "更多", "菜单"]
});
if (!trigger) return api.result(false, "grok", "conversation menu trigger not found");
if (!await api.openTriggerAndClickDelete(trigger, labels)) {
  return api.result(false, "grok", "delete menu item not found");
}
await api.clickDeleteConfirmIfPresent(3600);
return api.result(true, "grok");`
  ]),
  grokMirror: Object.freeze([
    "return api.deleteGrokThread(data);",
    `const labels = ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"];
const trigger = api.topRightMenuTrigger({
  labels: ["More", "More actions", "Menu", "Options", "更多", "菜单"]
});
if (!trigger) return api.result(false, "grokMirror", "conversation menu trigger not found");
if (!await api.openTriggerAndClickDelete(trigger, labels)) {
  return api.result(false, "grokMirror", "delete menu item not found");
}
await api.clickDeleteConfirmIfPresent(3600);
return api.result(true, "grokMirror");`
  ]),
  notion: Object.freeze([
    "return api.deleteNotionThread(data);",
    `if (api.findDeleteConfirmButton()) {
  const confirmedExisting = await api.clickDeleteConfirmIfPresent(6500);
  return confirmedExisting
    ? api.result(true, "notion")
    : api.result(false, "notion", "delete confirmation did not close");
}
const labels = ["Delete", "Delete topic", "删除", "删除话题"];
const trigger = api.findNotionDeleteMenuTrigger();
if (!trigger) return api.result(false, "notion", "conversation menu trigger not found");
if (!await api.openTriggerAndClickDelete(trigger, labels)) {
  return api.result(false, "notion", "delete menu item not found");
}
const confirmed = await api.clickDeleteConfirmIfPresent(6500);
if (!confirmed && api.deleteDialogRoots().length) {
  return api.result(false, "notion", "delete confirmation did not close");
}
return api.result(true, "notion");`
  ]),
  deepseek: Object.freeze([
    "return api.deleteDeepSeekThread(data);",
    `if (!await api.ensureDeepSeekSidebarOpen()) {
  return api.result(false, "deepseek", "sidebar could not be opened");
}
const bridged = await api.requestDeepSeekDeleteBridge(10500);
if (bridged?.ok) return api.result(true, "deepseek");
const bridgeReason = bridged?.reason || "";
if (bridgeReason && !/bridge timeout|bridge failed/i.test(bridgeReason)) {
  const confirmedAfterBridge = await api.clickDeleteConfirmIfPresent(1800);
  if (confirmedAfterBridge) return api.result(true, "deepseek");
}
const root = api.deepSeekSidebarRoot();
const hints = api.deepSeekDeleteHints(data);
const row = api.deepSeekTopicRows(root, hints)[0] || null;
if (!row) return api.result(false, "deepseek", bridgeReason || "current topic row not found");
const moreButton = await api.waitFor(() => api.deepSeekTopicMoreButton(row), 1600, 100);
if (!moreButton) return api.result(false, "deepseek", bridgeReason || "topic menu trigger not found");
const labels = ["Delete", "删除"];
if (!await api.openTriggerAndClickDelete(moreButton, labels, { timeoutMs: 2600, allowHiddenTrigger: true })) {
  return api.result(false, "deepseek", bridgeReason || "delete menu item not found");
}
const confirmed = await api.clickDeleteConfirmIfPresent(6500);
if (!confirmed) return api.result(false, "deepseek", bridgeReason || "delete confirmation button not found");
return api.result(true, "deepseek");`
  ])
});

function userscriptVersion(source) {
  const match = String(source || "").match(/^\s*\/\/\s*@version\s+(.+?)\s*$/m);
  return match ? String(match[1] || "").trim() : "";
}

function userscriptMeta(userscriptFile, userscript, userscriptTimeoutMs = 15000) {
  const source = String(userscript || "").trim();
  return {
    builtIn: true,
    scriptType: "topic-delete",
    scriptId: userscriptFile.replace(/^topic-delete-userscripts\//, "").replace(/\.user\.js$/i, ""),
    scriptVersion: userscriptVersion(source),
    sourceMode: "builtIn",
    userscriptFile,
    userscript: source,
    userscriptLength: source.length,
    userscriptTimeoutMs
  };
}

export const TOPIC_DELETE_SITE_CONFIGS = Object.freeze([
  Object.freeze({
    id: "kagi",
    name: "Kagi Assistant",
    appIds: Object.freeze(["Kagi"]),
    hosts: Object.freeze(["assistant.kagi.com"]),
    pathPrefixes: Object.freeze([]),
    ...userscriptMeta("topic-delete-userscripts/kagi.user.js", KAGI_DELETE_USERSCRIPT, 15000)
  }),
  Object.freeze({
    id: "grok",
    name: "Grok",
    appIds: Object.freeze(["Grok"]),
    hosts: Object.freeze(["grok.com", "*.grok.com", "grok.x.ai", "*.grok.x.ai"]),
    pathPrefixes: Object.freeze(["/c/", "/chat/"]),
    ...userscriptMeta("topic-delete-userscripts/grok.user.js", GROK_DELETE_USERSCRIPT, 15000)
  }),
  Object.freeze({
    id: "grokMirror",
    name: "Grok Mirror",
    appIds: Object.freeze(["GrokMirror"]),
    hosts: Object.freeze(["gk.dairoot.cn", "*.gk.dairoot.cn"]),
    pathPrefixes: Object.freeze(["/c/", "/chat/"]),
    ...userscriptMeta("topic-delete-userscripts/grok-mirror.user.js", GROK_MIRROR_DELETE_USERSCRIPT, 15000)
  }),
  Object.freeze({
    id: "notion",
    name: "Notion AI",
    appIds: Object.freeze(["NotionAI"]),
    hosts: Object.freeze(["app.notion.com", "notion.so", "www.notion.so", "*.notion.so"]),
    pathPrefixes: Object.freeze([]),
    ...userscriptMeta("topic-delete-userscripts/notion.user.js", NOTION_DELETE_USERSCRIPT, 15000)
  }),
  Object.freeze({
    id: "deepseek",
    name: "DeepSeek",
    appIds: Object.freeze(["DeepSeek"]),
    hosts: Object.freeze(["deepseek.com", "*.deepseek.com"]),
    pathPrefixes: Object.freeze(["/a/chat", "/chat"]),
    ...userscriptMeta("topic-delete-userscripts/deepseek.user.js", DEEPSEEK_DELETE_USERSCRIPT, 36000)
  })
]);

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function uniqueStrings(value = []) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(value) ? value : []) {
    const normalized = text(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeUserscriptSource(value) {
  return String(value || "").trim().replace(/\r\n?/g, "\n");
}

function isKnownLegacyBuiltInUserscript(id, userscript) {
  const source = normalizeUserscriptSource(userscript);
  return Boolean(source && (LEGACY_TOPIC_DELETE_USERSCRIPTS[id] || []).some((item) => normalizeUserscriptSource(item) === source));
}

function isKnownStandaloneBuiltInUserscript(id, userscript, currentUserscript = "", options = {}) {
  const source = normalizeUserscriptSource(userscript);
  if (!source) return false;
  if (source === normalizeUserscriptSource(currentUserscript)) return true;
  if (!/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(source)) return false;
  if (!/@namespace\s+https:\/\/chatclub\.local\/delete-sites/.test(source)) return false;
  if (!/@name\s+ChatClub Delete Site\b/.test(source)) return false;
  const sourceVersion = userscriptVersion(source);
  const currentVersion = userscriptVersion(currentUserscript);
  if (!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(sourceVersion)) return false;
  const escapedId = String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`const\\s+SITE_ID\\s*=\\s*["']${escapedId}["']\\s*;`).test(source)) return false;
  if (source === normalizeUserscriptSource(currentUserscript)) return true;
  if (currentVersion && sourceVersion === currentVersion) return false;
  if (options.allowSemantic === false) return false;
  return looksLikeGeneratedStandaloneBuiltInUserscript(id, source);
}

function looksLikeGeneratedStandaloneBuiltInUserscript(id, source) {
  const sharedMarkers = [
    'const REQUEST_EVENT = "chatclub:delete-site:request";',
    'const RESULT_EVENT = "chatclub:delete-site:result";',
    'const PING_EVENT = "chatclub:delete-site:ping";',
    'const READY_EVENT = "chatclub:delete-site:ready";',
    'const GLOBAL_NAME = "ChatClubDeleteSites";',
    'function dispatchReady',
    'function handleRequest',
    'function clickDeleteConfirmIfPresent',
    'function resultWithTrustedDeleteConfirm',
    'const runners = {',
    'registry[SITE_ID]'
  ];
  if (!sharedMarkers.every((marker) => source.includes(marker))) return false;
  const siteMarkers = {
    kagi: ['kagi: deleteKagi', 'async function deleteKagi'],
    grok: ['grok: deleteGrok', 'async function deleteGrok'],
    grokMirror: ['grokMirror: deleteGrok', 'async function deleteGrok'],
    notion: ['notion: deleteNotion', 'async function deleteNotion'],
    deepseek: ['deepseek: deleteDeepSeek', 'async function deleteDeepSeek']
  };
  return (siteMarkers[id] || []).every((marker) => source.includes(marker));
}

export function topicDeleteUserscriptLooksLikeBuiltIn(id, userscript, currentUserscript = "", options = {}) {
  return isKnownLegacyBuiltInUserscript(id, userscript)
    || isKnownStandaloneBuiltInUserscript(id, userscript, currentUserscript, options);
}

function normalizeTopicDeleteSiteConfig(item = {}, fallback = {}, index = 0) {
  const fallbackUserscript = String(fallback.userscript || "").trim();
  const customUserscript = String(item.customUserscript ?? item.userscript ?? "").trim();
  const builtIn = Boolean(fallback.builtIn || item.builtIn);
  const sourceMode = item.sourceMode === "custom" || (!builtIn && customUserscript)
    ? "custom"
    : "builtIn";
  const userscript = sourceMode === "custom" ? customUserscript : fallbackUserscript;
  const config = {
    ...fallback,
    ...item,
    id: text(item.id || fallback.id, `topic-delete-${index + 1}`),
    name: text(item.name || fallback.name, `Delete Site ${index + 1}`),
    appIds: uniqueStrings(item.appIds ?? fallback.appIds),
    hosts: uniqueStrings(item.hosts ?? fallback.hosts),
    pathPrefixes: uniqueStrings(item.pathPrefixes ?? fallback.pathPrefixes),
    builtIn,
    enabled: item.enabled !== false,
    userscriptFile: text(item.userscriptFile ?? fallback.userscriptFile),
    scriptType: text(item.scriptType || fallback.scriptType, "topic-delete"),
    scriptId: text(item.scriptId || fallback.scriptId || item.id || fallback.id, `topic-delete-${index + 1}`),
    scriptVersion: sourceMode === "custom"
      ? userscriptVersion(userscript)
      : text(fallback.scriptVersion || userscriptVersion(fallbackUserscript)),
    sourceMode,
    userscript,
    userscriptLength: userscript.length,
    userscriptTimeoutMs: boundedNumber(item.userscriptTimeoutMs, fallback.userscriptTimeoutMs || 15000, 5000, 45000),
    userscriptOverride: Boolean(builtIn && sourceMode === "custom")
  };
  if (sourceMode === "custom") config.customUserscript = userscript;
  else delete config.customUserscript;
  return config;
}

export function mergeBuiltInTopicDeleteConfig(current = [], builtIn = TOPIC_DELETE_SITE_CONFIGS) {
  const byId = new Map((Array.isArray(current) ? current : []).filter(Boolean).map((item, index) => [text(item.id, `topic-delete-${index + 1}`), item]));
  const merged = [];
  for (const item of builtIn || []) {
    const existing = byId.get(item.id) || {};
    const existingUserscript = String(existing.customUserscript || existing.userscript || "").trim();
    const legacyBuiltInUserscript = isKnownLegacyBuiltInUserscript(item.id, existingUserscript);
    const standaloneBuiltInUserscript = isKnownStandaloneBuiltInUserscript(item.id, existingUserscript, item.userscript, {
      allowSemantic: true
    });
    const knownBuiltInUserscript = legacyBuiltInUserscript || standaloneBuiltInUserscript;
    const explicitCustom = existing.sourceMode === "custom" || Boolean(existing.customUserscript);
    const sourceMode = explicitCustom || Boolean(existing.userscriptOverride && existingUserscript && !knownBuiltInUserscript)
      ? "custom"
      : "builtIn";
    const userscript = sourceMode === "custom" ? existingUserscript : String(item.userscript || "").trim();
    const existingTimeoutMs = Number(existing.userscriptTimeoutMs);
    const userscriptTimeoutMs = sourceMode !== "custom" && item.id === "deepseek" && existingTimeoutMs === 24000
      ? item.userscriptTimeoutMs
      : existing.userscriptTimeoutMs ?? item.userscriptTimeoutMs;
    merged.push(normalizeTopicDeleteSiteConfig({
      ...item,
      ...existing,
      id: item.id,
      name: existing.name || item.name,
      appIds: existing.appIds ?? item.appIds,
      hosts: existing.hosts ?? item.hosts,
      pathPrefixes: existing.pathPrefixes ?? item.pathPrefixes,
      userscriptFile: item.userscriptFile,
      scriptType: item.scriptType,
      scriptId: item.scriptId,
      scriptVersion: item.scriptVersion,
      builtIn: true,
      enabled: existing.enabled !== false,
      sourceMode,
      userscript,
      customUserscript: sourceMode === "custom" ? userscript : "",
      userscriptTimeoutMs,
      userscriptOverride: sourceMode === "custom"
    }, item));
    byId.delete(item.id);
  }
  let customIndex = 0;
  for (const item of byId.values()) {
    if (!item) continue;
    merged.push(normalizeTopicDeleteSiteConfig({
      ...item,
      builtIn: false
    }, {}, customIndex++));
  }
  return merged.filter((item) => item.id);
}

export function topicDeleteConfigMatchesPayload(config, payload = {}) {
  if (!config) return false;
  const payloadApps = uniqueStrings([payload.appId, payload.appName]).map((item) => item.toLowerCase());
  const configApps = uniqueStrings([...(config.appIds || []), config.id, config.name]).map((item) => item.toLowerCase());
  if (payloadApps.some((app) => configApps.includes(app))) return true;
  const hrefs = uniqueStrings([
    payload.currentThreadHref,
    payload.currentHref
  ]);
  return hrefs.some((href) => configMatchesHref(config, href));
}

export function findTopicDeleteSiteConfig(configs = [], payload = {}) {
  const configured = Array.isArray(configs) ? configs : [];
  const matched = configured.find((config) => topicDeleteConfigMatchesPayload(config, payload));
  if (matched) return matched;
  if (configured.length) return null;
  return TOPIC_DELETE_SITE_CONFIGS.find((config) => topicDeleteConfigMatchesPayload(config, payload)) || null;
}

export function topicDeleteTimeoutMs(config = {}, payload = {}) {
  const base = boundedNumber(config?.userscriptTimeoutMs, 15000, 5000, 45000);
  const app = `${config?.id || ""} ${config?.name || ""} ${payload?.appId || ""} ${payload?.appName || ""}`.toLowerCase();
  return /deepseek/.test(app) ? Math.max(base, 36000) : base;
}
