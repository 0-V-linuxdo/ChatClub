const EMPTY_NOTION_EFFORT_TARGETS = Object.freeze([]);

export const NOTION_EFFORT_TARGETS = Object.freeze({
  none: Object.freeze({ id: "none", label: "No thinking", aliases: ["No thinking", "None"] }),
  minimal: Object.freeze({ id: "minimal", label: "Minimal", aliases: ["Minimal"] }),
  low: Object.freeze({ id: "low", label: "Low", aliases: ["Low"] }),
  medium: Object.freeze({ id: "medium", label: "Medium", aliases: ["Medium"] }),
  high: Object.freeze({ id: "high", label: "High", aliases: ["High"] }),
  xhigh: Object.freeze({ id: "xhigh", label: "xHigh", aliases: ["xHigh", "x-High", "Extra high"] }),
  max: Object.freeze({ id: "max", label: "Max", aliases: ["Max", "Maximum"] })
});

const NOTION_EFFORT_TARGETS_BY_MODEL = Object.freeze({
  auto: EMPTY_NOTION_EFFORT_TARGETS,
  sonnet46: Object.freeze(["low", "medium", "high", "max"]),
  sonnet5: Object.freeze(["none", "low", "medium", "high"]),
  opus47: Object.freeze(["none", "low", "medium", "high", "max"]),
  opus48: Object.freeze(["none", "low", "medium", "high", "max"]),
  opus5: Object.freeze(["none", "low", "medium", "high", "max"]),
  fable5: Object.freeze(["low", "medium", "high", "max"]),
  gemini31pro: Object.freeze(["low", "medium"]),
  gemini35flash: Object.freeze(["low", "medium", "high"]),
  gpt56sol: Object.freeze(["none", "low", "medium", "high", "xhigh", "max"]),
  gpt56terra: Object.freeze(["none", "low", "medium", "high", "xhigh", "max"]),
  gpt52: Object.freeze(["medium", "high"]),
  gpt54: Object.freeze(["medium", "high"]),
  gpt55: Object.freeze(["medium", "high"]),
  grok43: Object.freeze(["low", "medium", "high"]),
  grok45: Object.freeze(["low", "medium", "high"]),
  grokBuild01: EMPTY_NOTION_EFFORT_TARGETS,
  kimi26: EMPTY_NOTION_EFFORT_TARGETS,
  kimi27code: EMPTY_NOTION_EFFORT_TARGETS,
  kimi3: Object.freeze(["low", "high", "max"]),
  deepseekV4Pro: Object.freeze(["none", "minimal", "low", "medium", "high", "max", "xhigh"]),
  glm52: Object.freeze(["none", "high", "max"])
});

export const DEFAULT_NOTION_EFFORT_PREFERENCES = Object.freeze(
  Object.fromEntries(Object.keys(NOTION_EFFORT_TARGETS_BY_MODEL).map((modelId) => [modelId, ""]))
);

export function notionEffortTargetsForModel(modelId) {
  return NOTION_EFFORT_TARGETS_BY_MODEL[String(modelId || "")] || EMPTY_NOTION_EFFORT_TARGETS;
}

export function normalizeNotionEffortPreferences(raw = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const normalized = { ...DEFAULT_NOTION_EFFORT_PREFERENCES };
  for (const [modelId, targets] of Object.entries(NOTION_EFFORT_TARGETS_BY_MODEL)) {
    const value = String(source[modelId] ?? "").trim();
    normalized[modelId] = targets.includes(value) ? value : "";
  }
  return normalized;
}
