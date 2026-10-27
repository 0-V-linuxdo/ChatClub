// Official incremental rules (v2 06 §9): data-only selector updates, signed, with anti-rollback watermarks.
// Pure functions shared by the background checker, the settings section and the tests.

export const STATE_KEY = "chatclubOfficialRulesStateV1";
export const BLOB_PREFIX = "chatclubOfficialRulesBlobV1:";
export const RULES_API_VERSION = 1;

export const LIMITS = { channel: 32 * 1024, catalog: 64 * 1024, component: 64 * 1024, signature: 1024, release: 512 * 1024, selector: 512, perSlot: 8, perComponent: 64 };
export const DOMAINS = { channel: "chatclub-official-rules/channel/v1", catalog: "chatclub-official-rules/catalog/v1", component: "chatclub-official-rules/component/v1" };

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const BACKOFF_MS = [60 * 60 * 1000, 3 * 60 * 60 * 1000, 12 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];

export const FEATURES = {
  summary: {
    capability: "summary",
    slots: ["conversationRoot", "messageRoot", "userRoot", "assistantRoot", "cleanup", "actionBar", "messageCopy", "userRoleSignal", "assistantRoleSignal", "nestedCodeAction", "referenceAction"],
    parameters: { waitMs: [0, 60000] },
  },
  messageNavigator: {
    capability: "navigator",
    slots: ["conversationRoot", "message", "userRole", "assistantRole", "content", "effectTarget", "exclude", "composer"],
    parameters: { summaryMaxChars: [20, 400] },
  },
  delete: {
    capability: "delete",
    slots: ["scope", "conversationLink", "conversationRow", "menuTrigger", "menuRoot", "deleteCandidate", "dialog", "confirmCandidate", "completionLinks"],
    parameters: { timeoutMs: [5000, 45000] },
  },
};
export const STATUSES = ["idle", "checking", "applying", "updateAvailable", "upToDate", "needsExtensionUpdate", "needsRecovery", "error"];

// Field names that hint at code or actions are refused anywhere in a document (rules are data only).
const FORBIDDEN_NAME = /(exec|function|func|click|coord|command|cmd|import|expr|eval|script|code|handler|callback)/i;

export const componentKey = (feature, siteId) => `${feature}/${siteId}`;

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isStrList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Recursively rejects code-like field names. */
export function forbiddenField(value, path = "") {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = forbiddenField(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_NAME.test(k)) return `${path}${path ? "." : ""}${k}`;
    const hit = forbiddenField(v, `${path}${path ? "." : ""}${k}`);
    if (hit) return hit;
  }
  return null;
}

const isPointer = (p) => isPlainObject(p) && typeof p.url === "string" && typeof p.signatureUrl === "string" && Number.isInteger(p.size) && p.size > 0 && /^[0-9a-f]{64}$/.test(String(p.sha256)) && typeof p.keyId === "string";

export function validateChannel(doc) {
  if (!isPlainObject(doc)) return "notObject";
  const bad = forbiddenField(doc);
  if (bad) return `forbiddenField:${bad}`;
  if (doc.schemaVersion !== 1) return "schemaVersion";
  if (typeof doc.channel !== "string" || !doc.channel) return "channel";
  if (!Number.isInteger(doc.sequence) || doc.sequence < 1) return "sequence";
  if (typeof doc.rulesVersion !== "string") return "rulesVersion";
  if (doc.rulesApiVersion !== RULES_API_VERSION) return "rulesApiVersion";
  if (typeof doc.minExtensionVersion !== "string") return "minExtensionVersion";
  if (!isPointer(doc.catalog)) return "catalog";
  return null;
}

export function validateCatalog(doc, channel) {
  if (!isPlainObject(doc)) return "notObject";
  const bad = forbiddenField(doc);
  if (bad) return `forbiddenField:${bad}`;
  if (doc.schemaVersion !== 1) return "schemaVersion";
  if (doc.sequence !== channel.sequence) return "sequence";
  if (!Array.isArray(doc.components)) return "components";
  const seen = new Set();
  let total = 0;
  for (const c of doc.components) {
    if (!isPointer(c) || !FEATURES[c.feature] || typeof c.siteId !== "string" || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(c.siteId) || !Number.isInteger(c.revision) || c.revision < 1) return "componentPointer";
    const key = componentKey(c.feature, c.siteId);
    if (seen.has(key)) return "duplicateComponent";
    seen.add(key);
    total += c.size;
  }
  if (total > LIMITS.release) return "releaseTooLarge";
  return null;
}

/** Validates a component document against its catalog pointer. */
export function validateComponent(doc, pointer) {
  if (!isPlainObject(doc)) return "notObject";
  const bad = forbiddenField(doc);
  if (bad) return `forbiddenField:${bad}`;
  const spec = FEATURES[doc.feature];
  if (doc.schemaVersion !== 1 || doc.rulesApiVersion !== RULES_API_VERSION) return "version";
  if (!spec) return "feature";
  if (pointer && (doc.feature !== pointer.feature || doc.siteId !== pointer.siteId || doc.revision !== pointer.revision)) return "pointerMismatch";
  if (!["active", "disabled", "retired"].includes(doc.status)) return "status";
  if (!isStrList(doc.hosts ?? []) || !isStrList(doc.pathPrefixes ?? [])) return "hosts";
  if (!isPlainObject(doc.selectors ?? {})) return "selectors";
  let count = 0;
  for (const [slot, list] of Object.entries(doc.selectors ?? {})) {
    if (!spec.slots.includes(slot)) return `slot:${slot}`;
    if (!isStrList(list) || list.length > LIMITS.perSlot) return `slotList:${slot}`;
    if (list.some((s) => !s.trim() || s.length > LIMITS.selector)) return `selector:${slot}`;
    count += list.length;
  }
  if (count > LIMITS.perComponent) return "tooManySelectors";
  for (const [name, v] of Object.entries(doc.parameters ?? {})) {
    const range = spec.parameters[name];
    if (!range) return `parameter:${name}`;
    if (typeof v !== "number" || !Number.isFinite(v) || v < range[0] || v > range[1]) return `parameterRange:${name}`;
  }
  return null;
}

// ------------------------------------------------------------------ bytes, hashes, signatures

const enc = new TextEncoder();
export const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function sha256Hex(bytes) {
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}
export function base64urlDecode(s) {
  const b64 = String(s).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(s).length / 4) * 4, "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export function base64urlEncode(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** Domain-separated signing input: domain bytes, one zero byte, then the raw document bytes. */
export function signingInput(kind, bytes) {
  const d = enc.encode(DOMAINS[kind]);
  const out = new Uint8Array(d.length + 1 + bytes.length);
  out.set(d, 0);
  out[d.length] = 0;
  out.set(bytes, d.length + 1);
  return out;
}
export async function jwkFingerprint(jwk) {
  if (!jwk) return "";
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return sha256Hex(enc.encode(canonical));
}
/** Verifies an ECDSA P-256 / SHA-256 IEEE-P1363 signature file against the built-in keys. */
export async function verifySignature(keys, kind, bytes, sigDoc) {
  if (!isPlainObject(sigDoc) || sigDoc.schemaVersion !== 1 || sigDoc.algorithm !== "ES256" || typeof sigDoc.signature !== "string") return { ok: false, reason: "signatureFormat" };
  const jwk = Object.values(keys ?? {}).find((k) => k && k.kid === sigDoc.keyId);
  if (!jwk) return { ok: false, reason: "unknownKey" };
  const sig = base64urlDecode(sigDoc.signature);
  if (sig.length !== 64) return { ok: false, reason: "signatureLength" };
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, signingInput(kind, bytes));
  return ok ? { ok: true, keyId: sigDoc.keyId } : { ok: false, reason: "badSignature" };
}

// ------------------------------------------------------------------ versions and watermarks

export function compareVersions(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export const emptyWatermark = () => ({ sequence: 0, revisions: {}, hashes: {} });

/** Rejects a release whose channel sequence or any component revision is below what was already accepted. */
export function checkWatermark(watermark, sequence, pointers = []) {
  const wm = watermark ?? emptyWatermark();
  if (sequence < wm.sequence) return "sequenceRollback";
  for (const p of pointers) {
    const key = componentKey(p.feature, p.siteId);
    const rev = wm.revisions?.[key] ?? 0;
    if (p.revision < rev) return `revisionRollback:${key}`;
    if (p.revision === rev && wm.hashes?.[key] && wm.hashes[key] !== p.sha256) return `hashChanged:${key}`;
  }
  return null;
}

export function raiseWatermark(watermark, sequence, components) {
  const wm = { ...emptyWatermark(), ...(watermark ?? {}) };
  wm.sequence = Math.max(wm.sequence ?? 0, sequence);
  wm.revisions = { ...(wm.revisions ?? {}) };
  wm.hashes = { ...(wm.hashes ?? {}) };
  for (const [key, c] of Object.entries(components)) {
    if ((wm.revisions[key] ?? 0) <= c.revision) {
      wm.revisions[key] = c.revision;
      wm.hashes[key] = c.sha256;
    }
  }
  return wm;
}

// ------------------------------------------------------------------ state

export function defaultState() {
  return {
    version: 1,
    mode: "undecided",
    status: "idle",
    lastCheckAt: 0,
    lastAppliedAt: 0,
    lastError: "",
    failures: 0,
    jitterMs: Math.floor(Math.random() * 60 * 60 * 1000),
    watermark: emptyWatermark(),
    current: null,
    candidate: null,
    snapshot: null,
    rolledBack: {},
    deleteAliases: {},
  };
}

export function normalizeState(raw) {
  if (!isPlainObject(raw)) return defaultState();
  const s = { ...defaultState(), ...raw };
  if (!["undecided", "auto", "manual"].includes(s.mode)) s.mode = "undecided";
  if (!STATUSES.includes(s.status)) s.status = "idle";
  if (!isPlainObject(s.watermark)) s.watermark = emptyWatermark();
  if (!isPlainObject(s.rolledBack)) s.rolledBack = {};
  if (!isPlainObject(s.deleteAliases)) s.deleteAliases = {};
  if (s.current && !isPlainObject(s.current.components)) {
    s.current = null;
    s.status = "needsRecovery";
  }
  return s;
}

/** When the next automatic check is due (interval + per-install jitter, or the failure backoff). */
export function nextCheckAt(state) {
  if (state.mode !== "auto") return null;
  const base = state.lastCheckAt || 0;
  const delay = state.failures > 0 ? BACKOFF_MS[Math.min(state.failures, BACKOFF_MS.length) - 1] : CHECK_INTERVAL_MS + (state.jitterMs ?? 0);
  return base + delay;
}

const blank = (v) => v === undefined || v === null || (Array.isArray(v) && !v.length) || (isPlainObject(v) && !Object.keys(v).length);
const sameJson = (a, b) => (blank(a) && blank(b)) || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Field-by-field change list between two versions of a component (null = absent). */
export function componentDiff(before, after) {
  const changes = [];
  const push = (field, a, b) => {
    if (!sameJson(a, b)) changes.push({ field, before: a ?? null, after: b ?? null });
  };
  push("status", before?.status, after?.status);
  push("hosts", before?.hosts, after?.hosts);
  push("pathPrefixes", before?.pathPrefixes, after?.pathPrefixes);
  const slots = new Set([...Object.keys(before?.selectors ?? {}), ...Object.keys(after?.selectors ?? {})]);
  for (const slot of slots) push(`selectors.${slot}`, before?.selectors?.[slot], after?.selectors?.[slot]);
  const params = new Set([...Object.keys(before?.parameters ?? {}), ...Object.keys(after?.parameters ?? {})]);
  for (const p of params) push(`parameters.${p}`, before?.parameters?.[p], after?.parameters?.[p]);
  return changes;
}

/** Applies the candidate atomically: every changed component at once, with a snapshot to roll back to. */
export function applyCandidate(state, now = Date.now()) {
  const cand = state.candidate;
  if (!cand) return state;
  const components = { ...(state.current?.components ?? {}), ...cand.components };
  for (const key of cand.removed ?? []) delete components[key];
  const current = { sequence: cand.sequence, rulesVersion: cand.rulesVersion, keyId: cand.keyId, releaseNotes: cand.releaseNotes, publishedAt: cand.publishedAt, components };
  return {
    ...state,
    current,
    candidate: null,
    snapshot: { current: state.current, rolledBack: state.rolledBack, appliedAt: now },
    rolledBack: {},
    watermark: raiseWatermark(state.watermark, cand.sequence, cand.components),
    lastAppliedAt: now,
    status: "upToDate",
    lastError: "",
  };
}

/** Restores the snapshot taken before the last apply. Watermarks stay. */
export function rollbackLast(state) {
  if (!state.snapshot) return state;
  return { ...state, current: state.snapshot.current, rolledBack: state.snapshot.rolledBack ?? {}, snapshot: null, status: "idle" };
}

/** Effective official component for a key: null = use the extension's built-in data. */
export function effectiveComponent(state, key) {
  if (state.rolledBack?.[key]) return state.snapshot?.current?.components?.[key] ?? null;
  const c = state.current?.components?.[key] ?? null;
  return c && c.status === "active" ? c : null;
}

/** Delete-feature hosts that are new compared with the built-in list must be approved one by one. */
export function pendingDeleteHosts(state, builtinHosts) {
  const known = new Set(builtinHosts);
  const out = [];
  for (const [key, c] of Object.entries(state.current?.components ?? {})) {
    if (!key.startsWith("delete/")) continue;
    for (const host of c.hosts ?? []) if (!known.has(host)) out.push({ key, host, approved: state.deleteAliases?.[host] === "approved" });
  }
  return out;
}

/**
 * Merges an official component into a feature's built-in site config (user overrides are applied later by the
 * feature itself, so their priority stays above the official layer).
 */
export function overlayConfig(feature, base, component, { approvedHosts = new Set() } = {}) {
  if (!component) return base;
  const sel = component.selectors ?? {};
  const out = { ...base, officialRevision: component.revision };
  const hosts = component.hosts?.length ? component.hosts : null;
  if (feature === "summary") {
    out.officialRuleHints = { ...(base.officialRuleHints ?? {}), ...sel };
    if (component.parameters?.waitMs != null) out.officialRuleWaitMs = component.parameters.waitMs;
    if (hosts) out.hosts = hosts;
  } else if (feature === "messageNavigator") {
    const join = (v) => (Array.isArray(v) ? v.join(", ") : v);
    if (sel.message) out.messageSelector = join(sel.message);
    if (sel.userRole) out.userSelector = join(sel.userRole);
    if (sel.assistantRole) out.assistantSelector = join(sel.assistantRole);
    if (sel.exclude) out.textCleanupSelectors = [...sel.exclude];
    out.officialSlots = { ...sel };
    if (component.parameters?.summaryMaxChars != null) out.summaryMaxChars = component.parameters.summaryMaxChars;
    if (hosts) out.hosts = hosts;
  } else if (feature === "delete") {
    const slots = { ...(base.slots ?? {}) };
    for (const [k, v] of Object.entries(sel)) slots[k] = v.join(", ");
    out.slots = slots;
    if (component.parameters?.timeoutMs != null) out.timeoutMs = component.parameters.timeoutMs;
    if (hosts) {
      const known = new Set(base.hosts ?? []);
      out.hosts = hosts.filter((x) => known.has(x) || approvedHosts.has(x));
      if (!out.hosts.length) out.hosts = base.hosts;
    }
  }
  if (component.pathPrefixes?.length) out.pathPrefixes = component.pathPrefixes;
  return out;
}
