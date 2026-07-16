import { customUserscriptSource, isCustomUserscriptConfig } from "./userscript-config.js";
import { configMatchesHref, normalizeHostList } from "./url-match.js";

function descriptor(value) {
  return Object.freeze({
    builtIn: true,
    scriptType: "topic-delete",
    sourceMode: "builtIn",
    ...value
  });
}

// Metadata only. Standalone userscript bodies are generated into
// topic-delete-userscripts/ and loaded only when explicitly requested.
export const TOPIC_DELETE_SITE_CONFIGS = Object.freeze([
  descriptor({ id: "chatgpt", name: "ChatGPT", appIds: ["ChatGPT"], hosts: ["chatgpt.com", "*.chatgpt.com", "chat.openai.com", "*.chat.openai.com"], pathPrefixes: [], scriptId: "chatgpt", scriptVersion: "2026.07.16.1", userscriptFile: "topic-delete-userscripts/chatgpt.user.js", userscriptLength: 79317, userscriptTimeoutMs: 15000 }),
  descriptor({ id: "gemini", name: "Gemini", appIds: ["Gemini"], hosts: ["gemini.google.com", "*.gemini.google.com"], pathPrefixes: ["/app"], scriptId: "gemini", scriptVersion: "2026.07.16.1", userscriptFile: "topic-delete-userscripts/gemini.user.js", userscriptLength: 115741, userscriptTimeoutMs: 24000 }),
  descriptor({ id: "kagi", name: "Kagi Assistant", appIds: ["Kagi"], hosts: ["assistant.kagi.com"], pathPrefixes: [], scriptId: "kagi", scriptVersion: "2026.07.16.1", userscriptFile: "topic-delete-userscripts/kagi.user.js", userscriptLength: 79217, userscriptTimeoutMs: 15000 }),
  descriptor({ id: "grok", name: "Grok", appIds: ["Grok"], hosts: ["grok.com", "*.grok.com", "grok.x.ai", "*.grok.x.ai"], pathPrefixes: ["/c/", "/chat/"], scriptId: "grok", scriptVersion: "2026.07.16.1", userscriptFile: "topic-delete-userscripts/grok.user.js", userscriptLength: 79286, userscriptTimeoutMs: 15000 }),
  descriptor({ id: "grokMirror", name: "Grok Mirror", appIds: ["GrokMirror"], hosts: ["gk.dairoot.cn", "*.gk.dairoot.cn"], pathPrefixes: ["/c/", "/chat/"], scriptId: "grok-mirror", scriptVersion: "2026.07.16.1", userscriptFile: "topic-delete-userscripts/grok-mirror.user.js", userscriptLength: 79268, userscriptTimeoutMs: 15000 }),
  descriptor({ id: "notion", name: "Notion AI", appIds: ["NotionAI"], hosts: ["app.notion.com", "notion.so", "www.notion.so", "*.notion.so"], pathPrefixes: [], scriptId: "notion", scriptVersion: "2026.07.16.1", userscriptFile: "topic-delete-userscripts/notion.user.js", userscriptLength: 79315, userscriptTimeoutMs: 15000 }),
  descriptor({ id: "deepseek", name: "DeepSeek", appIds: ["DeepSeek"], hosts: ["deepseek.com", "*.deepseek.com"], pathPrefixes: ["/a/chat", "/chat"], scriptId: "deepseek", scriptVersion: "2026.07.16.1", userscriptFile: "topic-delete-userscripts/deepseek.user.js", userscriptLength: 79240, userscriptTimeoutMs: 36000 })
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
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function normalizeTopicDeleteSiteConfig(item = {}, fallback = {}, index = 0) {
  const builtIn = Boolean(fallback.builtIn || item.builtIn);
  const customSource = typeof item.customUserscript === "string"
    ? item.customUserscript
    : typeof item.userscript === "string" ? item.userscript : "";
  const custom = isCustomUserscriptConfig(item) || typeof item.userscript === "string";
  const sourceMode = custom ? "custom" : "builtIn";
  const config = {
    ...fallback,
    ...item,
    id: text(item.id || fallback.id, `topic-delete-${index + 1}`),
    name: text(item.name || fallback.name, `Delete Site ${index + 1}`),
    appIds: uniqueStrings(item.appIds ?? fallback.appIds),
    hosts: normalizeHostList(item.hosts ?? fallback.hosts),
    pathPrefixes: uniqueStrings(item.pathPrefixes ?? fallback.pathPrefixes),
    builtIn,
    enabled: item.enabled !== false,
    userscriptFile: builtIn ? text(fallback.userscriptFile) : text(item.userscriptFile),
    scriptType: "topic-delete",
    scriptId: text((builtIn ? fallback.scriptId : item.scriptId) || item.id || fallback.id, `topic-delete-${index + 1}`),
    scriptVersion: sourceMode === "custom" ? text(item.scriptVersion) : text(fallback.scriptVersion),
    sourceMode,
    userscriptLength: sourceMode === "custom" ? customSource.length : Number(fallback.userscriptLength) || 0,
    userscriptTimeoutMs: boundedNumber(item.userscriptTimeoutMs, fallback.userscriptTimeoutMs || 15000, 5000, 45000)
  };
  delete config.userscript;
  delete config.userscriptOverride;
  if (sourceMode === "custom") config.customUserscript = customSource;
  else delete config.customUserscript;
  return config;
}

export function mergeBuiltInTopicDeleteConfig(current = [], builtIn = TOPIC_DELETE_SITE_CONFIGS) {
  const builtInById = new Map(builtIn.map((item) => [item.id, item]));
  const consumed = new Set();
  const merged = [];
  let customIndex = 0;
  for (const raw of Array.isArray(current) ? current.filter(Boolean) : []) {
    const fallback = builtInById.get(text(raw.id));
    if (fallback) {
      consumed.add(fallback.id);
      const existingTimeout = Number(raw.userscriptTimeoutMs);
      const migrateTimeout = !isCustomUserscriptConfig(raw) && ((fallback.id === "deepseek" && existingTimeout === 24000) || (fallback.id === "gemini" && existingTimeout === 18000));
      merged.push(normalizeTopicDeleteSiteConfig({
        ...raw,
        id: fallback.id,
        name: raw.name || fallback.name,
        builtIn: true,
        userscriptTimeoutMs: migrateTimeout ? fallback.userscriptTimeoutMs : raw.userscriptTimeoutMs
      }, fallback));
    } else {
      merged.push(normalizeTopicDeleteSiteConfig({ ...raw, builtIn: false }, {}, customIndex++));
    }
  }
  for (const item of builtIn) {
    if (!consumed.has(item.id)) merged.push(normalizeTopicDeleteSiteConfig(item, item));
  }
  return merged.filter((item) => item.id);
}

export async function loadBuiltInTopicDeleteSource(idOrFile, options = {}) {
  const key = String(idOrFile || "");
  const descriptorItem = TOPIC_DELETE_SITE_CONFIGS.find((item) => item.id === key || item.userscriptFile === key);
  if (!descriptorItem) throw new Error(`Unknown built-in Delete Site userscript: ${key}`);
  const url = new URL(`../${descriptorItem.userscriptFile}`, import.meta.url);
  const fetchSource = options.fetchSource || (async (sourceUrl) => {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Failed to load ${descriptorItem.userscriptFile}: HTTP ${response.status}`);
    return response.text();
  });
  const source = String(await fetchSource(url, descriptorItem)).replace(/\r\n?/g, "\n").trim();
  if (source.length !== descriptorItem.userscriptLength) {
    throw new Error(`${descriptorItem.userscriptFile}: expected ${descriptorItem.userscriptLength} bytes, received ${source.length}`);
  }
  return source;
}

export function topicDeleteConfigMatchesPayload(config, payload = {}) {
  if (!config) return false;
  const payloadApps = uniqueStrings([payload.appId, payload.appName]).map((item) => item.toLowerCase());
  const configApps = uniqueStrings([...(config.appIds || []), config.id, config.name]).map((item) => item.toLowerCase());
  if (payloadApps.some((app) => configApps.includes(app))) return true;
  return uniqueStrings([payload.currentThreadHref, payload.currentHref]).some((href) => configMatchesHref(config, href));
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
