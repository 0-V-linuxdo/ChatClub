// Summary site configs: built-ins from site adapters + the user's overrides and custom entries (v2 04 §1.2, §1.8; 07 §2).

import { hostMatchesList } from "../../lib/conversation.js";

/** Fields a user may change on a built-in entry without turning it into a custom one. */
const OVERRIDABLE = ["enabled", "name", "hosts", "pathPrefixes", "userscriptRunMode", "userscriptTimeoutMs", "userscriptFallbackDelayMs", "copyTimeoutMs", "fallbackMode", "officialRuleWaitMs"];

export function isCustomEntry(c) {
  return c?.sourceMode === "custom" || c?.builtIn === false || !!c?.customUserscript || !!c?.userscriptOverride;
}

/**
 * Stored `summarySiteConfigs` holds custom entries and sparse overrides of built-ins (`{ id, builtIn: true, ...changed }`).
 * Returns the effective list: built-ins (overrides applied) in adapter order, then custom entries.
 */
export function effectiveConfigs(builtins, stored) {
  const saved = Array.isArray(stored) ? stored.filter((c) => c && typeof c === "object" && c.id) : [];
  const byId = new Map(saved.map((c) => [c.id, c]));
  const out = builtins.map((b) => {
    const o = byId.get(b.id);
    if (!o) return { ...b, overridden: false };
    if (isCustomEntry(o)) return { ...b, ...o, builtIn: true, overridden: true, sourceMode: "custom" };
    const merged = { ...b };
    for (const k of OVERRIDABLE) if (o[k] !== undefined) merged[k] = o[k];
    merged.overridden = OVERRIDABLE.some((k) => o[k] !== undefined && JSON.stringify(o[k]) !== JSON.stringify(b[k]));
    return merged;
  });
  const builtinIds = new Set(builtins.map((b) => b.id));
  for (const c of saved) if (!builtinIds.has(c.id)) out.push({ enabled: true, fallbackMode: "structuredOnly", officialRuleHints: {}, ...c, builtIn: false, sourceMode: "custom" });
  return out;
}

/** Inverse of effectiveConfigs: what to store for a list edited in the settings UI. */
export function storedConfigs(builtins, effective) {
  const byId = new Map(builtins.map((b) => [b.id, b]));
  const out = [];
  for (const c of effective) {
    const b = byId.get(c.id);
    const { overridden, ...rest } = c;
    void overridden;
    if (!b) {
      out.push({ ...rest, builtIn: false, sourceMode: "custom" });
      continue;
    }
    if (rest.sourceMode === "custom" && rest.customUserscript) {
      out.push({ id: c.id, builtIn: true, sourceMode: "custom", userscriptOverride: true, customUserscript: rest.customUserscript, ...pickChanged(b, rest) });
      continue;
    }
    const diff = pickChanged(b, rest);
    if (Object.keys(diff).length) out.push({ id: c.id, builtIn: true, ...diff });
  }
  return out;
}

function pickChanged(base, next) {
  const diff = {};
  for (const k of OVERRIDABLE) if (next[k] !== undefined && JSON.stringify(next[k]) !== JSON.stringify(base[k])) diff[k] = next[k];
  return diff;
}

export function configMatches(config, href) {
  if (!config?.enabled) return false;
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(url.protocol)) return false;
  if (!hostMatchesList(url.hostname, config.hosts ?? [])) return false;
  const prefixes = config.pathPrefixes ?? [];
  return !prefixes.length || prefixes.some((p) => url.pathname.startsWith(p));
}

export function findConfig(configs, href) {
  return configs.find((c) => configMatches(c, href)) ?? null;
}

const hasSlots = (c) => Object.values(c?.officialRuleHints ?? {}).some((v) => (Array.isArray(v) ? v : [v]).some((s) => typeof s === "string" && s.trim()));

/** A config "has a collector" (04 §1.2 rule 3). */
export function hasCollector(config) {
  if (!config) return false;
  if (config.fallbackMode === "allowPageText") return true;
  if (isCustomEntry(config) && config.customUserscript) return true;
  return !!config.userscriptFile || hasSlots(config);
}

/** Start pages that are skipped before collecting (04 §1.3 step 2 table). Returns a reason key or null. */
export function blankPageReason(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const bare = !url.search && !url.hash;
  const on = (...hosts) => hostMatchesList(host, hosts);
  if (on("chatgpt.com", "chat.openai.com") && path === "/" && bare) return "blank.chatgpt";
  if (on("assistant.kagi.com") && path === "/" && bare) return "blank.kagi";
  if (on("deepseek.com") && path === "/" && bare) return "blank.deepseek";
  if (on("grok.com", "grok.x.ai", "gk.dairoot.cn") && path === "/" && bare) return "blank.grok";
  if (on("gemini.google.com", "bard.google.com") && path === "/app") return "blank.gemini";
  if (on("app.lobehub.com") && path === "/" && bare) return "blank.lobehub";
  if (on("app.notion.com", "notion.so") && (path === "/ai" || (path === "/chat" && !url.searchParams.get("t")))) return "blank.notion";
  if (on("claude.ai") && path === "/new" && bare) return "blank.claude";
  return null;
}

const BRANDS = [
  [/kagi/i, "Kagi"],
  [/grok|dairoot/i, "Grok"],
  [/notion/i, "Notion"],
  [/chatgpt|openai/i, "ChatGPT"],
  [/claude/i, "Claude"],
  [/gemini|bard/i, "Gemini"],
  [/deepseek/i, "DeepSeek"],
  [/lobehub/i, "LobeHub"],
  [/typingmind|typingcloud/i, "TypingMind"],
  [/manus/i, "Manus"],
];

/** Brand name from site id, name, title or address (04 §2.3); falls back to the config name. */
export function brandOf({ siteId = "", siteName = "", title = "", href = "" } = {}) {
  for (const value of [siteId, siteName, href, title]) {
    for (const [re, brand] of BRANDS) if (re.test(String(value))) return brand;
  }
  return siteName || "";
}

/** The config sent into the frame: everything except script bodies. */
export function frameConfig(config) {
  const { customUserscript, ...rest } = config;
  void customUserscript;
  return rest;
}
