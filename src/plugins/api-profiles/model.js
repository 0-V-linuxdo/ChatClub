// API profile records and model resolution (v2 06 §4, 07 §2).

export const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_MODEL = "GPT5.5";
export const DEFAULT_PROFILE_ID = "default-openai";
export const DEFAULT_PROFILE = { id: DEFAULT_PROFILE_ID, name: "Default API", endpoint: DEFAULT_ENDPOINT, apiKey: "", model: DEFAULT_MODEL, models: [DEFAULT_MODEL], favoriteModels: [] };
// The promotion channel is a product decision for 2.0; none ships until one is chosen.
export const PROMOTION_CHANNELS = [];
export const PROMOTION_CHANNELS_VERSION = 2;

const uniq = (list) => [...new Set(list)];

export function normalizeProfile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
  if (!id) return null;
  const model = String(raw.model ?? "").trim();
  let models = uniq((Array.isArray(raw.models) ? raw.models : []).map((m) => String(m ?? "").trim()).filter(Boolean));
  if (model && !models.includes(model)) models = [model, ...models];
  if (model) models = [model, ...models.filter((m) => m !== model)];
  const fallback = model || models[0] || DEFAULT_MODEL;
  if (!models.length) models = [fallback];
  return {
    id,
    name: String(raw.name ?? "").trim() || id,
    endpoint: String(raw.endpoint ?? "").trim() || DEFAULT_ENDPOINT,
    apiKey: String(raw.apiKey ?? ""),
    model: fallback,
    models,
    favoriteModels: uniq((Array.isArray(raw.favoriteModels) ? raw.favoriteModels : []).filter((m) => models.includes(m))),
    ...(raw.registerUrl ? { registerUrl: String(raw.registerUrl) } : {}),
    ...(raw.promotionChannel ? { promotionChannel: true } : {}),
  };
}

export function normalizeProfiles(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const p = normalizeProfile(raw);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out.length ? out : [{ ...DEFAULT_PROFILE }];
}

/** Model a feature actually uses (06 §4.3). */
export function resolveModel(profile, wanted) {
  const w = String(wanted ?? "").trim();
  if (w) return w;
  return profile?.model || profile?.models?.[0] || DEFAULT_MODEL;
}

/** Profile a feature actually uses: its choice when it still exists, else the first one. */
export function resolveProfile(profiles, profileId) {
  return profiles.find((p) => p.id === profileId) ?? profiles[0] ?? null;
}

/** Legacy top-level optimize / summary endpoint fields become profiles (07 §2). */
export function legacyProfiles(options) {
  const out = [];
  for (const feature of ["optimize", "summary"]) {
    const endpoint = options[`${feature}Endpoint`];
    const apiKey = options[`${feature}ApiKey`];
    const model = options[`${feature}Model`];
    if (endpoint === undefined && apiKey === undefined && model === undefined) continue;
    out.push({ feature, profile: normalizeProfile({ id: `${feature}-legacy`, name: feature === "optimize" ? "Optimize" : "Summary", endpoint: endpoint || DEFAULT_ENDPOINT, apiKey: apiKey || "", model: model || DEFAULT_MODEL }) });
  }
  return out;
}

export const isUntouchedDefault = (p) =>
  p?.id === DEFAULT_PROFILE_ID && p.name === DEFAULT_PROFILE.name && p.endpoint === DEFAULT_ENDPOINT && !p.apiKey;
