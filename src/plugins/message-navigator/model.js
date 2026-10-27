// Navigator site configs (v2 05 §3.1, 06 §7): built-ins from site adapters and this plugin's presets,
// the user's overrides and custom entries, ordering, and which config covers a tab.

import { hostMatchesList } from "../../lib/conversation.js";

export const ADAPTERS = ["generic", "chatgpt", "claude", "gemini", "deepseek", "grok", "kagi", "poe", "aiStudio", "lechat"];
export const SUMMARY_LIMITS = { min: 20, max: 180, fallback: 60 };

/** Presets for sites that are not built-in apps (added by the user as custom apps). */
export const EXTRA_PRESETS = [
  {
    id: "aiStudio",
    name: "AI Studio",
    adapter: "aiStudio",
    appIds: ["AIStudio"],
    hosts: ["aistudio.google.com"],
    pathPrefixes: ["/prompts"],
    messageSelector: "ms-chat-turn",
    userSelector: "[data-turn-role='User'], .user-prompt-container",
    assistantSelector: "[data-turn-role='Model'], .model-prompt-container",
    thinkingSelector: "ms-thought-chunk",
    textCleanupSelectors: ["ms-chat-turn-options", ".actions-container", ".author-label"],
    summaryMaxChars: 60,
  },
  {
    id: "lechat",
    name: "Le Chat",
    adapter: "lechat",
    appIds: ["LeChat", "Mistral"],
    hosts: ["chat.mistral.ai"],
    pathPrefixes: ["/chat"],
    messageSelector: "[data-message-author-role]",
    userSelector: "[data-message-author-role='user']",
    assistantSelector: "[data-message-author-role='assistant']",
    textCleanupSelectors: ["button"],
    summaryMaxChars: 60,
  },
];

/** Fields a user may change on a built-in entry; anything else stays with the built-in. */
const FIELDS = ["enabled", "name", "appIds", "hosts", "pathPrefixes", "adapter", "messageSelector", "userSelector", "assistantSelector", "thinkingSelector", "textCleanupSelectors", "summaryMaxChars"];

const list = (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(/[\n,]+/) : []).map((s) => String(s).trim()).filter(Boolean);

export function clampSummary(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(SUMMARY_LIMITS.min, Math.min(SUMMARY_LIMITS.max, v)) : SUMMARY_LIMITS.fallback;
}

/** Normalizes one config to the shape the frame and the settings table expect. */
export function normalizeConfig(c, builtIn = false) {
  return {
    enabled: c.enabled !== false,
    adapter: ADAPTERS.includes(c.adapter) ? c.adapter : builtIn && ADAPTERS.includes(c.id) ? c.id : "generic",
    ...c,
    id: String(c.id),
    name: String(c.name ?? c.id),
    appIds: list(c.appIds),
    hosts: list(c.hosts),
    pathPrefixes: list(c.pathPrefixes),
    messageSelector: String(c.messageSelector ?? ""),
    userSelector: String(c.userSelector ?? ""),
    assistantSelector: String(c.assistantSelector ?? ""),
    thinkingSelector: String(c.thinkingSelector ?? ""),
    textCleanupSelectors: list(c.textCleanupSelectors ?? c.cleanupSelectors),
    summaryMaxChars: clampSummary(c.summaryMaxChars ?? SUMMARY_LIMITS.fallback),
    builtIn,
  };
}

/**
 * Stored `messageNavigatorSiteConfigs` holds custom entries and sparse overrides of built-ins (`{ id, builtIn: true, ...changed }`).
 * Its order is the user's order; built-ins it does not mention are slotted in after their adapter-order predecessor.
 */
export function effectiveConfigs(builtins, stored) {
  const saved = Array.isArray(stored) ? stored.filter((c) => c && typeof c === "object" && c.id) : [];
  const base = new Map(builtins.map((b) => [b.id, normalizeConfig(b, true)]));
  const out = [];
  const seen = new Set();
  for (const s of saved) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const b = base.get(s.id);
    if (!b) {
      out.push({ ...normalizeConfig(s, false), overridden: false });
      continue;
    }
    const merged = { ...b };
    for (const k of FIELDS) if (s[k] !== undefined) merged[k] = s[k];
    const norm = normalizeConfig(merged, true);
    norm.overridden = FIELDS.some((k) => s[k] !== undefined && JSON.stringify(norm[k]) !== JSON.stringify(b[k]));
    out.push(norm);
  }
  // A built-in the stored list does not mention goes right after its predecessor in adapter order.
  let prev = null;
  for (const [id, b] of base) {
    if (!seen.has(id)) {
      const at = prev ? out.findIndex((c) => c.id === prev) + 1 : 0;
      out.splice(at, 0, { ...b, overridden: false });
    }
    prev = id;
  }
  return out;
}

/** Inverse of effectiveConfigs for a list edited (or reordered) in settings. */
export function storedConfigs(builtins, effective) {
  const base = new Map(builtins.map((b) => [b.id, normalizeConfig(b, true)]));
  const defaultOrder = builtins.map((b) => b.id);
  const builtinOrder = effective.filter((c) => base.has(c.id)).map((c) => c.id);
  const reordered = builtinOrder.some((id, i) => id !== defaultOrder[i]) || effective.some((c, i) => !base.has(c.id) && effective.slice(i + 1).some((x) => base.has(x.id)));
  const out = [];
  for (const c of effective) {
    const b = base.get(c.id);
    const { overridden, builtIn, ...rest } = c;
    void overridden;
    void builtIn;
    if (!b) {
      out.push({ ...rest, builtIn: false });
      continue;
    }
    const diff = {};
    const norm = normalizeConfig({ ...b, ...rest }, true);
    for (const k of FIELDS) if (JSON.stringify(norm[k]) !== JSON.stringify(b[k])) diff[k] = norm[k];
    if (Object.keys(diff).length || reordered) out.push({ id: c.id, builtIn: true, ...diff });
  }
  return out;
}

const pathOk = (pathname, prefixes) => !prefixes?.length || prefixes.some((p) => pathname.startsWith(p));

/** Whether a config covers this tab (App ID, or host + optional path prefix). */
export function covers(config, { appId, href }) {
  let url = null;
  try {
    url = new URL(href);
  } catch {
    url = null;
  }
  const byApp = !!appId && !!config.appIds?.includes(appId);
  const byHost = !!url && !!config.hosts?.length && hostMatchesList(url.hostname, config.hosts);
  return (byApp || byHost) && (!url || pathOk(url.pathname, config.pathPrefixes));
}

/**
 * First enabled config in list order that covers the tab (06 §1.4).
 * Returns { config } | { disabled: true } when only disabled configs match | { config: null } for the generic adapter.
 */
export function resolveConfig(configs, tab) {
  const hits = configs.filter((c) => covers(c, tab));
  const on = hits.find((c) => c.enabled !== false && c.messageSelector);
  if (on) return { config: on };
  if (hits.length) return { config: null, disabled: true };
  return { config: null };
}

/** Editor validation (06 §7): name, a selector, and App ID or hosts. Returns an error key or null. */
export function validateConfig(c) {
  if (!String(c.name ?? "").trim()) return "nav.sites.required.name";
  if (!c.appIds?.length && !c.hosts?.length) return "nav.sites.required.scope";
  if (!String(c.messageSelector ?? "").trim()) return "nav.sites.required.selector";
  return null;
}

/** The part of a config the frame needs. */
export function frameConfig(c) {
  if (!c) return null;
  const { id, messageSelector, userSelector, assistantSelector, thinkingSelector, textCleanupSelectors, summaryMaxChars } = c;
  return { id, messageSelector, userSelector, assistantSelector, thinkingSelector, textCleanupSelectors, summaryMaxChars };
}
