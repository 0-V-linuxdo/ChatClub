// ModelPreference: model catalogs, settings keys, failure policy, fallback memory and retry schedules (v2 05 §5).

export const SCHEDULES = {
  immediate: [0, 700, 1600, 3200, 5200, 8000, 12000],
  ready: [1600, 3200, 5200, 8000, 12000, 16000],
  notionSourcesImmediate: [0, 800, 2000, 4200],
  notionSourcesReady: [1000, 2400, 5000],
};
export const ATTEMPT_TIMEOUT_MS = 15000;
export const NOTION_SOURCES_TIMEOUT_MS = 48000;
export const COMMAND_TIMEOUT_MS = 50000;
export const FALLBACK_MEMORY_KEY = "chatclub.preferred-model-fallback-memory";
export const FALLBACK_MEMORY_MS = 5 * 60 * 1000;
export const SUBMIT_GRACE_MS = 15000;
export const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
export const POLICIES = ["send-current", "skip"];

/** App id → settings app name (GrokMirror shares Grok's keys, 05 §5.2). */
export const appKey = (appId) => (appId === "GrokMirror" ? "Grok" : appId);

const NOTION = [
  ["auto", "Auto", ["auto", "自动"]],
  ["sonnet46", "Claude Sonnet 4.6", ["sonnet 4.6"]],
  ["sonnet5", "Claude Sonnet 5", ["sonnet 5"]],
  ["opus47", "Claude Opus 4.7", ["opus 4.7"]],
  ["opus48", "Claude Opus 4.8", ["opus 4.8"]],
  ["opus5", "Claude Opus 5", ["opus 5"]],
  ["fable5", "Claude Fable 5", ["fable 5"]],
  ["fable51", "Claude Fable 5.1", ["fable 5.1"]],
  ["gemini31pro", "Gemini 3.1 Pro", ["gemini 3.1 pro"]],
  ["gemini35flash", "Gemini 3.5 Flash", ["gemini 3.5 flash"]],
  ["gpt56sol", "GPT-5.6 Sol", ["gpt-5.6 sol", "gpt 5.6 sol"]],
  ["gpt56terra", "GPT-5.6 Terra", ["gpt-5.6 terra", "gpt 5.6 terra"]],
  ["gpt52", "GPT-5.2", ["gpt-5.2", "gpt 5.2"]],
  ["gpt54", "GPT-5.4", ["gpt-5.4", "gpt 5.4"]],
  ["gpt55", "GPT-5.5", ["gpt-5.5", "gpt 5.5"]],
  ["gpt6astra", "GPT-6 Astra", ["gpt-6 astra", "gpt 6 astra"]],
  ["grok43", "Grok 4.3", ["grok 4.3"]],
  ["grok45", "Grok 4.5", ["grok 4.5"]],
  ["grokBuild01", "Grok Build 0.1", ["grok build 0.1", "grok build"]],
  ["kimi26", "Kimi K2.6", ["kimi k2.6", "kimi 2.6"]],
  ["kimi27code", "Kimi K2.7 Code", ["kimi k2.7 code", "kimi 2.7 code"]],
  ["kimi3", "Kimi K3", ["kimi k3", "kimi 3"]],
  ["deepseekV4Pro", "DeepSeek V4 Pro", ["deepseek v4 pro", "deepseek-v4-pro"]],
  ["glm52", "GLM-5.2", ["glm-5.2", "glm 5.2"]],
];

/** Effort choices per Notion model family (05 §5.1: the implementation keeps this table). */
export function notionEfforts(modelId) {
  const id = String(modelId || "");
  if (/^(sonnet|opus|fable)/.test(id)) return ["low", "medium", "high", "max"];
  if (/^gpt/.test(id)) return ["none", "minimal", "low", "medium", "high", "xhigh"];
  if (/^gemini31pro$/.test(id)) return ["low", "high"];
  if (/^(grok45|deepseekV4Pro|kimi3|glm52)$/.test(id)) return ["low", "medium", "high"];
  return [];
}

export const CATALOGS = {
  Gemini: [
    { id: "pro", label: "3.1 Pro", aliases: ["3.1 pro", "pro"] },
    { id: "fast", label: "3.1 Flash-Lite", aliases: ["flash-lite", "flash lite", "fast", "快速"] },
    { id: "flash35", label: "3.5 Flash", aliases: ["3.5 flash"] },
  ],
  Grok: [
    { id: "auto", label: "Auto", aliases: ["auto", "自动"] },
    { id: "fast", label: "Fast", aliases: ["fast", "快速"] },
    { id: "expert", label: "Expert", aliases: ["expert", "专家"] },
    { id: "grok43", label: "Grok 4.3 beta", aliases: ["grok 4.3", "4.3"] },
    { id: "heavy", label: "Heavy", aliases: ["heavy"] },
  ],
  DeepSeek: [
    { id: "instant", label: "Instant", aliases: ["instant", "快速", "即时"] },
    { id: "expert", label: "Expert", aliases: ["expert", "专家", "深度思考", "deepthink"] },
    { id: "vision", label: "Vision", aliases: ["vision", "视觉", "识图"] },
  ],
  NotionAI: NOTION.map(([id, label, aliases]) => ({ id, label, aliases: [label.toLowerCase(), ...aliases] })),
};
export const SUPPORTED_APPS = Object.keys(CATALOGS);

export const normalizeLabel = (s) => String(s ?? "").toLowerCase().replace(/[\s_]+/g, " ").replace(/[^\p{L}\p{N} .-]/gu, "").trim();

/** Notion custom label entry: `{ kind: "label", label }` → id `label:<key>` (05 §5.1). */
export function labelTarget(label) {
  const text = String(label ?? "").trim().slice(0, 80);
  const key = normalizeLabel(text).replace(/\s+/g, "-");
  return text && key ? { id: `label:${key}`, label: text, aliases: [normalizeLabel(text)] } : null;
}

/** Catalog entry for a stored model value (string id or label entry). */
export function resolveTarget(app, value) {
  if (!value) return null;
  if (typeof value === "object" && value.kind === "label") return labelTarget(value.label);
  const id = String(value);
  if (id.startsWith("label:")) return labelTarget(id.slice(6).replace(/-/g, " "));
  return CATALOGS[app]?.find((m) => m.id === id) ?? null;
}

/**
 * Scores how well a menu label names a target: exact alias 3, alias as a whole word inside 2, else 0.
 * Longer aliases win ties so "3.5 flash" beats "flash".
 */
export function matchScore(target, text) {
  const label = normalizeLabel(text);
  if (!label || !target) return 0;
  let best = 0;
  for (const a of target.aliases) {
    const alias = normalizeLabel(a);
    if (!alias) continue;
    if (label === alias) best = Math.max(best, 3 + alias.length / 100);
    else if (new RegExp(`(^|[^\\p{L}\\p{N}.])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(label)) best = Math.max(best, 2 + alias.length / 100);
  }
  return best;
}

/** Effective failure policy for an app: per-app override or the global one (05 §5.2). */
export function failurePolicy(globalPolicy, perApp, app) {
  const own = perApp?.[app];
  if (own && own !== "inherit" && POLICIES.includes(own)) return own;
  return POLICIES.includes(globalPolicy) ? globalPolicy : "send-current";
}

/** Reads the fallback memory: true when this site fell back within the last 5 minutes. */
export function rememberedFallback(memory, app, now = Date.now()) {
  const at = Number(memory?.[app]?.at || 0);
  return at > 0 && now - at < FALLBACK_MEMORY_MS;
}

export function rememberFallback(memory, app, now = Date.now()) {
  const next = {};
  for (const [k, v] of Object.entries(memory ?? {})) if (now - Number(v?.at || 0) < FALLBACK_MEMORY_MS) next[k] = v;
  next[app] = { at: now };
  return next;
}

/** The settings of one app as a plan for the frame, or null when nothing is set. */
export function planFor(app, s, { useSecondary = false } = {}) {
  const primary = resolveTarget(app, s[app]);
  const secondaryOn = !!s[`${app}SecondaryModelEnabled`];
  const secondary = secondaryOn ? resolveTarget(app, s[`${app}Secondary`]) : null;
  if (!primary && !(useSecondary && secondary)) return null;
  const first = useSecondary && secondary ? secondary : primary;
  const plan = { app, target: first, fallback: !useSecondary && secondary && secondary.id !== first.id ? secondary : null, usingSecondary: useSecondary && !!secondary };
  if (app === "Gemini" && first.id === "pro") plan.thinking = s.GeminiThinkingLevel === "extended" ? "extended" : "standard";
  if (app === "NotionAI") {
    const efforts = s.NotionAIEfforts && typeof s.NotionAIEfforts === "object" ? s.NotionAIEfforts : {};
    const effort = efforts[first.id];
    if (effort && notionEfforts(first.id).includes(effort)) plan.effort = effort;
    if (s.NotionAIAllSources === "enabled" || s.NotionAIAllSources === "disabled") plan.allSources = s.NotionAIAllSources;
  }
  return plan;
}
