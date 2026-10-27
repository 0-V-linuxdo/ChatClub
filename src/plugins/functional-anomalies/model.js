// Functional anomaly records (v2 06 §12): redaction at write time, fingerprint merging, the 200-entry cap.

export const MAX_RECORDS = 200;
export const MERGE_WINDOW_MS = 5 * 60 * 1000;
export const KEY = "functionalAnomalies";

const LIMITS = { feature: 80, operation: 120, appId: 128, appName: 120, errorName: 120, errorCode: 120, reason: 500, message: 1000, appVersion: 80, surface: 80, host: 253 };
const REDACTED = "[redacted]";

/** Removes secrets, stack lines and address paths from free text (06 §12.2). */
export function redactText(value) {
  let s = String(value ?? "");
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  s = s.split(/\r?\n/).filter((line) => !/^\s*at\s/.test(line)).join("\n");
  s = s.replace(/\b(data|blob):[^\s"'<>]+/gi, "[$1-url]");
  s = s.replace(/\bfile:\/\/[^\s"'<>]+/gi, "[local-path]");
  s = s.replace(/(^|[\s("'=])(?:[A-Za-z]:\\|\/(?:Users|home|private|var|tmp)\/)[^\s"'<>]*/g, "$1[local-path]");
  s = s.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`);
  s = s.replace(/\bsk-[A-Za-z0-9_-]{8,}/g, REDACTED);
  s = s.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED);
  s = s.replace(/\b(api[_ -]?key|authorization|cookie|set-cookie|token|access[_ -]?token|secret|password|passwd)(\s*[:=]\s*|\s+)("?)[^\s",;]+\3/gi, (_m, label, sep) => `${label}${sep}${REDACTED}`);
  s = s.replace(/\b(https?|wss?):\/\/([^/\s"'<>?#]+)[^\s"'<>]*/gi, (_m, proto, host) => `${proto}://${host.replace(/^[^@]*@/, "")}`);
  s = s.replace(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s"'<>]+)/gi, "$1");
  return s;
}

export function hostOnly(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  try {
    return new URL(s.includes("://") ? s : `https://${s}`).hostname;
  } catch {
    return "";
  }
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) : s);

/** Short stable hash (FNV-1a, hex). */
export function shortHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Sanitized record fields from whatever a feature reported. */
export function sanitize(input = {}) {
  const out = {};
  for (const [k, n] of Object.entries(LIMITS)) {
    if (k === "host") continue;
    const v = input[k];
    out[k] = v == null ? "" : clip(redactText(v), n);
  }
  out.host = clip(hostOnly(input.host ?? input.url ?? ""), LIMITS.host);
  out.delivered = input.delivered === true ? true : input.delivered === false ? false : null;
  out.severity = ["error", "warning", "info"].includes(input.severity) ? input.severity : "error";
  out.fingerprint = shortHash([out.feature, out.operation, out.appId, out.host, out.errorName, out.errorCode, out.reason].join("␟"));
  return out;
}

/** Adds one report to the list (newest first), merging the same fingerprint within 5 minutes. */
export function addRecord(list, input, { now = Date.now(), uuid = () => crypto.randomUUID() } = {}) {
  const records = Array.isArray(list) ? list.filter((r) => r && typeof r === "object" && r.id) : [];
  const fields = sanitize(input);
  const i = records.findIndex((r) => r.fingerprint === fields.fingerprint && now - Number(r.updatedAt || 0) <= MERGE_WINDOW_MS);
  let record;
  if (i >= 0) {
    record = { ...records[i], ...fields, count: Number(records[i].count || 1) + 1, updatedAt: now };
    records.splice(i, 1);
  } else {
    record = { id: `fa-${uuid()}`, schemaVersion: 1, createdAt: now, updatedAt: now, count: 1, ...fields };
  }
  records.unshift(record);
  records.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  return { records: records.slice(0, MAX_RECORDS), record };
}

/** Plain-text export of records for "copy". */
export function recordText(r) {
  const lines = [
    `${new Date(r.updatedAt).toISOString()} · ${r.feature}${r.operation ? ` / ${r.operation}` : ""}${r.count > 1 ? ` · ×${r.count}` : ""}`,
    ...["appId", "appName", "host", "errorName", "errorCode", "delivered", "severity", "reason", "message", "appVersion", "surface"]
      .filter((k) => r[k] !== "" && r[k] != null)
      .map((k) => `${k}: ${r[k]}`),
  ];
  return lines.join("\n");
}
