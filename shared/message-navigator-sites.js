import { configMatchesHref, normalizeHostList } from "./url-match.js";

export const MESSAGE_NAVIGATOR_EFFECT_MODES = Object.freeze(["none", "border", "pulse", "fade", "jiggle"]);
export const DEFAULT_MESSAGE_NAVIGATOR_EFFECT_MODE = "border";

export const MESSAGE_NAVIGATOR_SITE_CONFIGS = Object.freeze([
  Object.freeze({
    id: "chatgpt",
    name: "ChatGPT",
    enabled: true,
    builtIn: true,
    configVersion: 2,
    appIds: Object.freeze(["ChatGPT"]),
    hosts: Object.freeze(["chatgpt.com", "*.chatgpt.com", "chat.openai.com", "*.chat.openai.com"]),
    pathPrefixes: Object.freeze([]),
    adapter: "chatgpt",
    messageSelector: "[data-message-author-role='user'], [data-message-author-role='assistant'], article[data-testid^='conversation-turn-'], article[data-testid*='conversation-turn'], article[data-turn-id], article[data-turn], [data-testid^='conversation-turn'], [data-testid*='conversation-turn']",
    textCleanupSelectors: Object.freeze([".sr-only", "header", "footer", "form", "button", "svg", "img", "[role='toolbar']", "[data-testid*='action']"]),
    summaryMaxChars: 60
  }),
  Object.freeze({
    id: "claude",
    name: "Claude",
    enabled: true,
    builtIn: true,
    configVersion: 1,
    appIds: Object.freeze(["Claude"]),
    hosts: Object.freeze(["claude.ai", "*.claude.ai"]),
    pathPrefixes: Object.freeze(["/chat", "/new"]),
    adapter: "claude",
    messageSelector: "div[data-testid='user-message'], .font-claude-response, .font-claude-response-body, [data-testid='assistant-message']",
    textCleanupSelectors: Object.freeze(["button", "svg", "header", "footer", "[data-testid*='action']", "[aria-label*='Copy' i]"]),
    summaryMaxChars: 60
  }),
  Object.freeze({
    id: "gemini",
    name: "Gemini",
    enabled: true,
    builtIn: true,
    configVersion: 1,
    appIds: Object.freeze(["Gemini"]),
    hosts: Object.freeze(["gemini.google.com", "*.gemini.google.com", "bard.google.com", "*.bard.google.com"]),
    pathPrefixes: Object.freeze([]),
    adapter: "gemini",
    messageSelector: "user-query, .user-query, model-response, .model-response, [data-test-id*='user-query'], [data-testid*='user-query'], [data-test-id*='model-response'], [data-testid*='model-response']",
    textCleanupSelectors: Object.freeze(["button", "svg", "mat-icon", "header", "footer", "[role='toolbar']", ".response-footer", ".actions-container"]),
    summaryMaxChars: 60
  }),
  Object.freeze({
    id: "deepseek",
    name: "DeepSeek",
    enabled: true,
    builtIn: true,
    configVersion: 1,
    appIds: Object.freeze(["DeepSeek"]),
    hosts: Object.freeze(["deepseek.com", "*.deepseek.com"]),
    pathPrefixes: Object.freeze(["/a/chat", "/chat"]),
    adapter: "deepseek",
    messageSelector: ".ds-message, [role='assistant'], [role='user']",
    textCleanupSelectors: Object.freeze(["button", "svg", ".ds-think-content", "[class*='copy']", "[class*='action']"]),
    summaryMaxChars: 60
  }),
  Object.freeze({
    id: "grok",
    name: "Grok",
    enabled: true,
    builtIn: true,
    configVersion: 1,
    appIds: Object.freeze(["Grok"]),
    hosts: Object.freeze(["grok.com", "*.grok.com", "grok.x.ai", "*.grok.x.ai", "x.com", "*.x.com"]),
    pathPrefixes: Object.freeze([]),
    adapter: "grok",
    messageSelector: "article, section, [role='article'], [data-message-author-role], [data-testid*='message'], [data-testid*='conversation'], [class*='message' i], [class*='Message'], [class*='response' i], [class*='Response']",
    textCleanupSelectors: Object.freeze(["button", "svg", "img", "header", "footer", "nav", "aside", "form", "textarea", "[contenteditable='true']", "[class*='source' i]", "[class*='citation' i]", "[class*='action' i]"]),
    summaryMaxChars: 60
  }),
  Object.freeze({
    id: "grokMirror",
    name: "Grok Mirror",
    enabled: true,
    builtIn: true,
    configVersion: 1,
    appIds: Object.freeze(["GrokMirror"]),
    hosts: Object.freeze(["gk.dairoot.cn", "*.gk.dairoot.cn"]),
    pathPrefixes: Object.freeze([]),
    adapter: "grok",
    messageSelector: "article, section, [role='article'], [data-message-author-role], [data-testid*='message'], [data-testid*='conversation'], [class*='message' i], [class*='Message'], [class*='response' i], [class*='Response']",
    textCleanupSelectors: Object.freeze(["button", "svg", "img", "header", "footer", "nav", "aside", "form", "textarea", "[contenteditable='true']", "[class*='source' i]", "[class*='citation' i]", "[class*='action' i]"]),
    summaryMaxChars: 60
  }),
  Object.freeze({
    id: "kagi",
    name: "Kagi Assistant",
    enabled: true,
    builtIn: true,
    configVersion: 3,
    appIds: Object.freeze(["Kagi"]),
    hosts: Object.freeze(["assistant.kagi.com", "kagi.com", "*.kagi.com"]),
    pathPrefixes: Object.freeze([]),
    adapter: "kagi",
    messageSelector: ".chat_bubble[role='article'], .chat_bubble, main [role='article'], main [data-message-author-role], main [data-testid*='message']",
    textCleanupSelectors: Object.freeze(["button", "svg", "header", "footer", "nav", "aside", "[aria-label*='Copy references' i]", "[aria-label*='References' i]", "[aria-label*='sources' i]", "[class*='references' i]", "[class*='sources' i]"]),
    summaryMaxChars: 60
  }),
  Object.freeze({
    id: "notion",
    name: "Notion AI",
    enabled: true,
    builtIn: true,
    configVersion: 2,
    appIds: Object.freeze(["NotionAI"]),
    hosts: Object.freeze(["app.notion.com", "notion.so", "www.notion.so", "*.notion.so"]),
    pathPrefixes: Object.freeze(["/chat", "/ai"]),
    adapter: "notion",
    messageSelector: "#notion-app [data-message-author-role], #notion-app [role='article'], #notion-app [data-testid*='message'], main [data-message-author-role], main [role='article'], main [data-testid*='message']",
    textCleanupSelectors: Object.freeze(["button", "svg", "header", "footer", "nav", "aside", "form", "textarea", "[contenteditable='true']", "[aria-label*='Delete' i]", "[aria-label*='history' i]", "[class*='toolbar' i]"]),
    summaryMaxChars: 60
  }),
  Object.freeze({
    id: "poe",
    name: "Poe",
    enabled: true,
    builtIn: true,
    configVersion: 1,
    appIds: Object.freeze(["Poe"]),
    hosts: Object.freeze(["poe.com", "*.poe.com"]),
    pathPrefixes: Object.freeze([]),
    adapter: "poe",
    messageSelector: ".ChatMessage_chatMessage__xkgHx[data-complete='true'], [class*='ChatMessage_chatMessage'][data-complete='true'], [class*='ChatMessage_chatMessage']",
    textCleanupSelectors: Object.freeze(["button", "svg", "header", "footer", "[class*='Message_actions']", "[class*='ChatMessageFooter']"]),
    summaryMaxChars: 60
  }),
  Object.freeze({
    id: "aiStudio",
    name: "AI Studio",
    enabled: true,
    builtIn: true,
    configVersion: 1,
    appIds: Object.freeze([]),
    hosts: Object.freeze(["aistudio.google.com"]),
    pathPrefixes: Object.freeze([]),
    adapter: "aiStudio",
    messageSelector: "ms-chat-turn[id^='turn-'], ms-chat-turn, [data-turn-role], .chat-turn-container",
    textCleanupSelectors: Object.freeze(["button", "svg", "mat-icon", "ms-thought-chunk", "[class*='thought' i]", "[class*='source' i]", "[jslog]"]),
    summaryMaxChars: 60
  }),
  Object.freeze({
    id: "lechat",
    name: "LeChat",
    enabled: true,
    builtIn: true,
    configVersion: 1,
    appIds: Object.freeze([]),
    hosts: Object.freeze(["chat.mistral.ai"]),
    pathPrefixes: Object.freeze([]),
    adapter: "lechat",
    messageSelector: "div[data-message-author-role], [data-message-part-type='answer'].markdown-container-style, .markdown-container-style",
    textCleanupSelectors: Object.freeze(["button", "svg", "header", "footer", "[class*='action']"]),
    summaryMaxChars: 60
  }),
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

export function normalizeMessageNavigatorEffectMode(value) {
  return MESSAGE_NAVIGATOR_EFFECT_MODES.includes(value) ? value : DEFAULT_MESSAGE_NAVIGATOR_EFFECT_MODE;
}

function normalizeMessageNavigatorSiteConfig(item = {}, fallback = {}, index = 0) {
  const builtIn = Boolean(fallback.builtIn || item.builtIn);
  return {
    ...fallback,
    ...item,
    id: text(item.id || fallback.id, `message-navigator-${index + 1}`),
    name: text(item.name || fallback.name, `Message Navigator ${index + 1}`),
    enabled: item.enabled !== false,
    builtIn,
    configVersion: boundedNumber(item.configVersion ?? fallback.configVersion, 1, 1, 9999),
    appIds: uniqueStrings(item.appIds ?? fallback.appIds),
    hosts: normalizeHostList(item.hosts ?? fallback.hosts),
    pathPrefixes: uniqueStrings(item.pathPrefixes ?? fallback.pathPrefixes),
    adapter: text(item.adapter || fallback.adapter, "generic") || "generic",
    messageSelector: text(item.messageSelector || fallback.messageSelector),
    userSelector: text(item.userSelector || fallback.userSelector),
    assistantSelector: text(item.assistantSelector || fallback.assistantSelector),
    textCleanupSelectors: uniqueStrings(item.textCleanupSelectors ?? fallback.textCleanupSelectors),
    summaryMaxChars: boundedNumber(item.summaryMaxChars ?? fallback.summaryMaxChars, 60, 20, 180)
  };
}

export function mergeBuiltInMessageNavigatorConfig(current = [], builtIn = MESSAGE_NAVIGATOR_SITE_CONFIGS) {
  const currentItems = (Array.isArray(current) ? current : []).filter(Boolean);
  const builtInById = new Map((builtIn || []).filter(Boolean).map((item) => [item.id, item]));
  const consumedBuiltIns = new Set();
  const merged = [];

  let customIndex = 0;
  for (const item of currentItems) {
    const id = text(item.id);
    const builtInConfig = builtInById.get(id);
    if (builtInConfig) {
      const storedVersion = Number(item.configVersion) || 0;
      const builtInVersion = Number(builtInConfig.configVersion) || 1;
      if (storedVersion < builtInVersion) {
        merged.push(normalizeMessageNavigatorSiteConfig({
          ...builtInConfig,
          enabled: item.enabled !== false
        }, builtInConfig));
        consumedBuiltIns.add(id);
        continue;
      }
      merged.push(normalizeMessageNavigatorSiteConfig({
        ...builtInConfig,
        ...item,
        id: builtInConfig.id,
        builtIn: true,
        configVersion: builtInConfig.configVersion
      }, builtInConfig));
      consumedBuiltIns.add(id);
      continue;
    }
    merged.push(normalizeMessageNavigatorSiteConfig({ ...item, builtIn: false }, {}, customIndex++));
  }

  for (const item of builtIn || []) {
    if (!item || consumedBuiltIns.has(item.id)) continue;
    merged.push(normalizeMessageNavigatorSiteConfig(item, item));
  }

  return merged.filter((item) => item.id && item.id !== "chathub" && item.adapter !== "chathub");
}

export function messageNavigatorConfigMatchesPayload(config, payload = {}) {
  if (!config || config.enabled === false) return false;
  const payloadApps = uniqueStrings([payload.appId, payload.appName]).map((item) => item.toLowerCase());
  const configApps = uniqueStrings([...(config.appIds || []), config.id, config.name]).map((item) => item.toLowerCase());
  if (payloadApps.some((app) => configApps.includes(app))) return true;
  const hrefs = typeof payload === "string"
    ? [payload]
    : uniqueStrings([payload.currentThreadHref, payload.currentHref, payload.href]);
  return hrefs.some((href) => configMatchesHref(config, href));
}

export function findMessageNavigatorSiteConfig(configs = [], payload = {}) {
  const configured = Array.isArray(configs) ? configs : [];
  const matched = configured.find((config) => messageNavigatorConfigMatchesPayload(config, payload));
  if (matched) return matched;
  if (configured.length) return null;
  return MESSAGE_NAVIGATOR_SITE_CONFIGS.find((config) => messageNavigatorConfigMatchesPayload(config, payload)) || null;
}
