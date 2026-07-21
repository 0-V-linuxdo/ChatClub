const FUNCTIONAL_ANOMALY_SCHEMA_VERSION = 1;
const FUNCTIONAL_ANOMALY_MAX_RECORDS = 200;
const FUNCTIONAL_ANOMALY_MERGE_WINDOW_MS = 5 * 60 * 1000;

const SEVERITIES = new Set(["error", "warning", "info"]);
const REDACTED = "[redacted]";

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function urlHost(value) {
  const raw = boundedText(value, 4096);
  if (!raw) return "";
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return boundedText(parsed.hostname.toLowerCase(), 253);
  } catch {
    return "";
  }
}

function redactUrl(rawUrl) {
  const trailing = rawUrl.match(/[),.;:!?]+$/)?.[0] || "";
  const candidate = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
  try {
    const parsed = new URL(candidate);
    return `${parsed.protocol}//${parsed.hostname}${trailing}`;
  } catch {
    return `[url-redacted]${trailing}`;
  }
}

function sanitizeFunctionalAnomalyText(value, maxLength = 1000) {
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*at\s+(?:async\s+)?\S+/i.test(line));
  let text = lines.join("\n");
  text = text.replace(/\b(?:https?|wss?|file|chrome-extension|moz-extension):\/\/[^\s<>"'`\])}]+[\])}.,;:!?]*/gi, redactUrl);
  text = text.replace(/\b(?:data|blob):[^\s<>"'`]+/gi, "[url-redacted]");
  text = text.replace(
    /\b((?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?[/?#][^\s<>"'`\])}]*/gi,
    (_match, host) => host.toLowerCase()
  );
  text = text.replace(
    /(^|[\s("'=,])(?:[a-z]:[\\/]|\\{2})[^\s<>"'`]+/gi,
    (_match, prefix) => `${prefix}[path-redacted]`
  );
  text = text.replace(
    /(^|[\s("'=,:])(?:\.\.?\/|\/)[a-z0-9._~%-]+(?:\/[a-z0-9._~%-]+)*/gi,
    (_match, prefix) => `${prefix}[path-redacted]`
  );
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`);
  text = text.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED);
  text = text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED);
  text = text.replace(
    /(^|[\s,{;])(["']?)(api[-_ ]?key|authorization|cookie|set-cookie|(?:(?:access|refresh|id|session)[-_ ]?)?token|(?:(?:client|private)[-_ ]?)?secret|password|passwd|prompt|session|credentials?)\2\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\r\n,;}]+)/gi,
    (_match, prefix, quote, label) => `${prefix}${quote}${label}${quote}=${REDACTED}`
  );
  return boundedText(text, Math.max(0, Number(maxLength) || 0));
}

export function functionalAnomalyHost(value = {}) {
  if (typeof value === "string") return urlHost(value);
  if (!plainObject(value)) return "";
  return urlHost(value.href) || urlHost(value.host);
}

function normalizedSeverity(value) {
  const severity = boundedText(value, 20).toLowerCase();
  if (severity === "warn") return "warning";
  return SEVERITIES.has(severity) ? severity : "error";
}

function finiteTime(value, fallback) {
  const time = Number(value);
  return Number.isFinite(time) && time >= 0 ? Math.floor(time) : fallback;
}

function positiveCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : 1;
}

function safeFields(value = {}) {
  const source = plainObject(value) ? value : {};
  const delivered = typeof source.delivered === "boolean" ? source.delivered : null;
  return {
    feature: sanitizeFunctionalAnomalyText(source.feature, 80),
    operation: sanitizeFunctionalAnomalyText(source.operation, 120),
    appId: sanitizeFunctionalAnomalyText(source.appId, 128),
    appName: sanitizeFunctionalAnomalyText(source.appName, 120),
    host: functionalAnomalyHost(source),
    errorName: sanitizeFunctionalAnomalyText(source.errorName, 120),
    errorCode: sanitizeFunctionalAnomalyText(source.errorCode, 120),
    delivered,
    reason: sanitizeFunctionalAnomalyText(source.reason, 500),
    message: sanitizeFunctionalAnomalyText(source.message, 1000),
    severity: normalizedSeverity(source.severity),
    appVersion: sanitizeFunctionalAnomalyText(source.appVersion, 80),
    surface: sanitizeFunctionalAnomalyText(source.surface, 80)
  };
}

function fingerprintText(fields) {
  return [
    fields.feature,
    fields.operation,
    fields.appId,
    fields.appName,
    fields.host,
    fields.errorName,
    fields.errorCode,
    fields.delivered === null ? "" : String(fields.delivered),
    fields.reason,
    fields.message,
    fields.severity,
    fields.appVersion,
    fields.surface
  ].join("\u001f");
}

function hashFingerprint(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v${FUNCTIONAL_ANOMALY_SCHEMA_VERSION}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function fallbackId(now) {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `fa-${random}`;
  return `fa-${now}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizedRecord(value, fallbackNow = 0) {
  if (!plainObject(value) || Number(value.schemaVersion) !== FUNCTIONAL_ANOMALY_SCHEMA_VERSION) return null;
  const fields = safeFields(value);
  const createdAt = finiteTime(value.createdAt, fallbackNow);
  const updatedAt = Math.max(createdAt, finiteTime(value.updatedAt, createdAt));
  const id = boundedText(value.id, 160);
  if (!id) return null;
  return {
    id,
    schemaVersion: FUNCTIONAL_ANOMALY_SCHEMA_VERSION,
    createdAt,
    updatedAt,
    count: positiveCount(value.count),
    fingerprint: hashFingerprint(fingerprintText(fields)),
    ...fields
  };
}

function compareRecords(left, right) {
  return right.updatedAt - left.updatedAt
    || right.createdAt - left.createdAt
    || left.id.localeCompare(right.id);
}

export function normalizeFunctionalAnomalyRecords(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((record) => normalizedRecord(record))
    .filter((record) => {
      if (!record || seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    })
    .sort(compareRecords)
    .slice(0, FUNCTIONAL_ANOMALY_MAX_RECORDS);
}

export function recordFunctionalAnomaly(records, details = {}, options = {}) {
  const nowValue = typeof options.now === "function" ? options.now() : options.now;
  const now = finiteTime(nowValue, Date.now());
  const fields = safeFields(details);
  const fingerprint = hashFingerprint(fingerprintText(fields));
  const normalized = normalizeFunctionalAnomalyRecords(records);
  const mergeIndex = normalized.findIndex((record) => (
    record.fingerprint === fingerprint
    && Math.abs(now - record.updatedAt) <= FUNCTIONAL_ANOMALY_MERGE_WINDOW_MS
  ));
  let record;
  if (mergeIndex >= 0) {
    const previous = normalized[mergeIndex];
    record = {
      ...previous,
      ...fields,
      updatedAt: Math.max(previous.updatedAt, now),
      count: Math.min(Number.MAX_SAFE_INTEGER, previous.count + 1),
      fingerprint
    };
    normalized.splice(mergeIndex, 1, record);
  } else {
    const createId = typeof options.createId === "function" ? options.createId : fallbackId;
    record = {
      id: boundedText(createId(now), 160) || fallbackId(now),
      schemaVersion: FUNCTIONAL_ANOMALY_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      count: 1,
      fingerprint,
      ...fields
    };
    normalized.push(record);
  }
  const next = normalizeFunctionalAnomalyRecords(normalized);
  return {
    record: next.find((entry) => entry.id === record.id) || record,
    records: next
  };
}

function exportedRecord(record) {
  const safe = { ...record };
  delete safe.fingerprint;
  return safe;
}

export function formatFunctionalAnomalyExport(records = []) {
  return JSON.stringify({
    schemaVersion: FUNCTIONAL_ANOMALY_SCHEMA_VERSION,
    records: normalizeFunctionalAnomalyRecords(records).map(exportedRecord)
  }, null, 2);
}
