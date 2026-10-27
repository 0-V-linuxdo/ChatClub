// TopicDelete: topic identity from an address, site configs, the pre-delivery error test and the
// completion judge (v2 05 §4.2, §4.3, §4.5, §4.6).

import { hostMatchesList } from "../../lib/conversation.js";

export const TIMEOUTS = { chatgpt: 15000, claude: 15000, gemini: 24000, kagi: 15000, grok: 15000, grokMirror: 15000, notion: 15000, deepseek: 36000 };
export const TIMEOUT_LIMITS = { min: 5000, max: 45000, deepseekMin: 36000 };
export const PROBE = { intervalMs: 260, totalMs: 5200, gapMs: 600 };

const ID = "[A-Za-z0-9_-]{6,}";
const ROUTES = {
  chatgpt: [new RegExp(`^/c/(${ID})`), new RegExp(`^/g/[^/]+/c/(${ID})`)],
  claude: [new RegExp(`^/chat/(${ID})`)],
  gemini: [new RegExp(`^/app/(${ID})`), new RegExp(`^/u/\\d+/app/(${ID})`)],
  kagi: [new RegExp(`^/c/(${ID})`), new RegExp(`^/chat/(${ID})`)],
  grok: [new RegExp(`^/c/(${ID})`), new RegExp(`^/chat/(${ID})`)],
  grokMirror: [new RegExp(`^/c/(${ID})`), new RegExp(`^/chat/(${ID})`)],
  deepseek: [new RegExp(`^/chat/s/(${ID})`), new RegExp(`^/a/chat/s/(${ID})`)],
};

/** `{ site, id }` for the topic the address is on, or null (not in a topic, e.g. a new-chat page). */
export function topicIdentity(siteId, href, routePattern) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (routePattern) {
    try {
      const m = new RegExp(routePattern).exec(url.pathname + url.search);
      return m?.[1] ? { site: siteId, id: m[1] } : null;
    } catch {
      return null;
    }
  }
  if (siteId === "notion") {
    const t = url.searchParams.get("t");
    return /^\/chat\/?$/.test(url.pathname) && t && /^[A-Za-z0-9_-]{6,}$/.test(t) ? { site: siteId, id: t } : null;
  }
  for (const re of ROUTES[siteId] ?? []) {
    const m = re.exec(url.pathname);
    if (m) return { site: siteId, id: m[1] };
  }
  return null;
}

export const sameIdentity = (a, b) => !!a && !!b && a.site === b.site && a.id === b.id;

export function clampTimeout(siteId, ms) {
  const n = Math.round(Number(ms));
  const base = Number.isFinite(n) && n > 0 ? n : TIMEOUTS[siteId] ?? 15000;
  const min = siteId === "deepseek" ? TIMEOUT_LIMITS.deepseekMin : TIMEOUT_LIMITS.min;
  return Math.max(min, Math.min(TIMEOUT_LIMITS.max, base));
}

const FIELDS = ["enabled", "name", "appIds", "hosts", "pathPrefixes", "timeoutMs", "slots", "script"];
const list = (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(/[\n,]+/) : []).map((s) => String(s).trim()).filter(Boolean);

export function normalizeConfig(c, builtIn) {
  return {
    enabled: c.enabled !== false,
    ...c,
    id: String(c.id),
    name: String(c.name ?? c.id),
    appIds: list(c.appIds),
    hosts: list(c.hosts),
    pathPrefixes: list(c.pathPrefixes),
    timeoutMs: clampTimeout(c.id, c.timeoutMs),
    slots: c.slots && typeof c.slots === "object" ? c.slots : {},
    script: typeof c.script === "string" && c.script.trim() ? c.script : undefined,
    builtIn,
  };
}

/** Built-ins with the user's sparse overrides, then custom entries; stored order wins (06 §1.4, §8). */
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
    for (const k of FIELDS) if (s[k] !== undefined) merged[k] = k === "slots" ? { ...b.slots, ...s.slots } : s[k];
    const norm = normalizeConfig(merged, true);
    norm.overridden = FIELDS.some((k) => s[k] !== undefined && JSON.stringify(norm[k]) !== JSON.stringify(b[k]));
    out.push(norm);
  }
  let prev = null;
  for (const [id, b] of base) {
    if (!seen.has(id)) out.splice(prev ? out.findIndex((c) => c.id === prev) + 1 : 0, 0, { ...b, overridden: false });
    prev = id;
  }
  return out;
}

export function storedConfigs(builtins, effective) {
  const base = new Map(builtins.map((b) => [b.id, normalizeConfig(b, true)]));
  const defaultOrder = builtins.map((b) => b.id);
  const reordered = effective.filter((c) => base.has(c.id)).some((c, i) => c.id !== defaultOrder[i]) || effective.some((c, i) => !base.has(c.id) && effective.slice(i + 1).some((x) => base.has(x.id)));
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
    const norm = normalizeConfig({ ...b, ...rest }, true);
    const diff = {};
    for (const k of FIELDS) if (JSON.stringify(norm[k]) !== JSON.stringify(b[k])) diff[k] = norm[k];
    if (Object.keys(diff).length || reordered) out.push({ id: c.id, builtIn: true, ...diff });
  }
  return out;
}

/** First config (in order) that covers the tab; `disabled` when only disabled ones do. */
export function resolveConfig(configs, { appId, href }) {
  let url = null;
  try {
    url = new URL(href);
  } catch {
    url = null;
  }
  const hits = configs.filter((c) => {
    const byApp = !!appId && c.appIds.includes(appId);
    const byHost = !!url && c.hosts.length > 0 && hostMatchesList(url.hostname, c.hosts);
    return (byApp || byHost) && (!url || !c.pathPrefixes.length || c.pathPrefixes.some((p) => url.pathname.startsWith(p)));
  });
  const on = hits.find((c) => c.enabled !== false);
  return on ? { config: on } : { config: null, disabled: hits.length > 0 };
}

/** User script type marker (06 §8): inline runtime body, standalone userscript, or an old bridge snippet. */
export function scriptKind(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  if (/^\s*\/\/\s*==UserScript==/m.test(s)) return "standalone";
  if (/__chatclub\w*bridge|chatclub[:_-]?bridge|window\.postMessage\s*\(/i.test(s)) return "legacyBridge";
  return "inline";
}

export function validateConfig(c) {
  if (!String(c.name ?? "").trim()) return "del.sites.required.name";
  if (!c.appIds?.length && !c.hosts?.length) return "del.sites.required.scope";
  return null;
}

/** Errors that prove the command never reached the frame, so one retry is safe (05 §4.6 rule 1). */
export function failedBeforeDelivery(error) {
  const m = String(error?.message ?? error ?? "");
  return /unknown frame|frame not registered|frame document changed|Receiving end does not exist|Could not establish connection|unknown capability|no handler/i.test(m);
}

/**
 * Completion judge (05 §4.5): two consecutive "done" samples at least 600 ms apart.
 * A sample is done when the dialog is gone and the address left the topic or the topic left the list.
 * When the topic was not listed to begin with (sidebar hidden), only leaving the address counts.
 */
export function createCompletionJudge({ gapMs = PROBE.gapMs, listedAtStart = true } = {}) {
  let firstDoneAt = null;
  return (sample, now) => {
    const t = sample?.target;
    const gone = listedAtStart ? !t?.current || !t?.present : !t?.current;
    const done = !!sample && sample.version === 1 && !sample.present && !!t && gone;
    if (!done) {
      firstDoneAt = null;
      return false;
    }
    if (firstDoneAt == null) {
      firstDoneAt = now;
      return false;
    }
    return now - firstDoneAt >= gapMs;
  };
}
