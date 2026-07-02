import { configMatchesHref } from "./url-match.js";

const KAGI_DELETE_USERSCRIPT = `return api.deleteKagiThread(data);
`;

const GROK_DELETE_USERSCRIPT = `const labels = ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"];
const trigger = api.topRightMenuTrigger({
  labels: ["More", "More actions", "Menu", "Options", "更多", "菜单"]
});
if (!trigger) return api.result(false, "grok", "conversation menu trigger not found");
if (!await api.openTriggerAndClickDelete(trigger, labels)) {
  return api.result(false, "grok", "delete menu item not found");
}
await api.clickDeleteConfirmIfPresent(3600);
return api.result(true, "grok");
`;

const GROK_MIRROR_DELETE_USERSCRIPT = `const labels = ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"];
const trigger = api.topRightMenuTrigger({
  labels: ["More", "More actions", "Menu", "Options", "更多", "菜单"]
});
if (!trigger) return api.result(false, "grokMirror", "conversation menu trigger not found");
if (!await api.openTriggerAndClickDelete(trigger, labels)) {
  return api.result(false, "grokMirror", "delete menu item not found");
}
await api.clickDeleteConfirmIfPresent(3600);
return api.result(true, "grokMirror");
`;

const NOTION_DELETE_USERSCRIPT = `if (api.findDeleteConfirmButton()) {
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
return api.result(true, "notion");
`;

const DEEPSEEK_DELETE_USERSCRIPT = `if (!await api.ensureDeepSeekSidebarOpen()) {
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
return api.result(true, "deepseek");
`;

function userscriptMeta(userscriptFile, userscript, userscriptTimeoutMs = 15000) {
  const source = String(userscript || "").trim();
  return {
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
    pathPrefixes: Object.freeze(["/chat/"]),
    ...userscriptMeta("topic-delete-userscripts/kagi.js", KAGI_DELETE_USERSCRIPT, 15000)
  }),
  Object.freeze({
    id: "grok",
    name: "Grok",
    appIds: Object.freeze(["Grok"]),
    hosts: Object.freeze(["grok.com", "*.grok.com", "grok.x.ai", "*.grok.x.ai"]),
    pathPrefixes: Object.freeze(["/c/", "/chat/"]),
    ...userscriptMeta("topic-delete-userscripts/grok.js", GROK_DELETE_USERSCRIPT, 15000)
  }),
  Object.freeze({
    id: "grokMirror",
    name: "Grok Mirror",
    appIds: Object.freeze(["GrokMirror"]),
    hosts: Object.freeze(["gk.dairoot.cn", "*.gk.dairoot.cn"]),
    pathPrefixes: Object.freeze(["/c/", "/chat/"]),
    ...userscriptMeta("topic-delete-userscripts/grok-mirror.js", GROK_MIRROR_DELETE_USERSCRIPT, 15000)
  }),
  Object.freeze({
    id: "notion",
    name: "Notion AI",
    appIds: Object.freeze(["NotionAI"]),
    hosts: Object.freeze(["app.notion.com", "notion.so", "www.notion.so", "*.notion.so"]),
    pathPrefixes: Object.freeze(["/chat"]),
    ...userscriptMeta("topic-delete-userscripts/notion.js", NOTION_DELETE_USERSCRIPT, 15000)
  }),
  Object.freeze({
    id: "deepseek",
    name: "DeepSeek",
    appIds: Object.freeze(["DeepSeek"]),
    hosts: Object.freeze(["deepseek.com", "*.deepseek.com"]),
    pathPrefixes: Object.freeze(["/a/chat", "/chat"]),
    ...userscriptMeta("topic-delete-userscripts/deepseek.js", DEEPSEEK_DELETE_USERSCRIPT, 36000)
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

function normalizeTopicDeleteSiteConfig(item = {}, fallback = {}, index = 0) {
  const userscript = String(item.userscript ?? fallback.userscript ?? "").trim();
  return {
    ...fallback,
    ...item,
    id: text(item.id || fallback.id, `topic-delete-${index + 1}`),
    name: text(item.name || fallback.name, `Delete Site ${index + 1}`),
    appIds: uniqueStrings(item.appIds ?? fallback.appIds),
    hosts: uniqueStrings(item.hosts ?? fallback.hosts),
    pathPrefixes: uniqueStrings(item.pathPrefixes ?? fallback.pathPrefixes),
    builtIn: Boolean(fallback.builtIn || item.builtIn),
    enabled: item.enabled !== false,
    userscriptFile: text(item.userscriptFile ?? fallback.userscriptFile),
    userscript,
    userscriptLength: userscript.length,
    userscriptTimeoutMs: boundedNumber(item.userscriptTimeoutMs, fallback.userscriptTimeoutMs || 15000, 5000, 45000),
    userscriptOverride: Boolean(item.userscriptOverride)
  };
}

export function mergeBuiltInTopicDeleteConfig(current = [], builtIn = TOPIC_DELETE_SITE_CONFIGS) {
  const byId = new Map((Array.isArray(current) ? current : []).filter(Boolean).map((item, index) => [text(item.id, `topic-delete-${index + 1}`), item]));
  const merged = [];
  for (const item of builtIn || []) {
    const existing = byId.get(item.id) || {};
    const userscript = String(existing.userscript || item.userscript || "").trim();
    const defaultUserscript = String(item.userscript || "").trim();
    const userscriptOverride = Boolean(existing.userscript && userscript !== defaultUserscript);
    const existingTimeoutMs = Number(existing.userscriptTimeoutMs);
    const userscriptTimeoutMs = !userscriptOverride && item.id === "deepseek" && existingTimeoutMs === 24000
      ? item.userscriptTimeoutMs
      : existing.userscriptTimeoutMs ?? item.userscriptTimeoutMs;
    merged.push(normalizeTopicDeleteSiteConfig({
      ...item,
      ...existing,
      id: item.id,
      name: existing.name || item.name,
      builtIn: true,
      enabled: existing.enabled !== false,
      userscript,
      userscriptTimeoutMs,
      userscriptOverride
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
