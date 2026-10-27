// Import / export file format and the options block validator (v2 06 §11).

export const SCHEMA = "chatclub.config.v1";
export const BLOCK_ORDER = ["options", "customConfig", "promptLibrary", "promptSendHistory", "shortcutConfig", "pocketHistory", "workspaceTabs"];

export function fileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `chatclub-config-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export function buildExport(blocks, now = new Date()) {
  return { schema: SCHEMA, exportedAt: now.toISOString(), ...blocks };
}

/** Parses an import file; accepts the v1 schema and older files that are just the blocks. */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "invalid-json" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "not-config" };
  if (data.schema && data.schema !== SCHEMA) return { error: "unknown-schema" };
  const blocks = {};
  for (const key of BLOCK_ORDER) if (key in data) blocks[key] = data[key];
  if (!Object.keys(blocks).length) return { error: "no-blocks" };
  return { blocks };
}

export const itemCount = (v) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : v == null ? 0 : 1);

/**
 * Checks one option value against its setting field. Returns true when it may be stored.
 * `field` is a definePluginSettings field; `isValid` may return true or an error key.
 */
export function optionValueOk(field, value) {
  if (!field || value === undefined) return false;
  let ok;
  switch (field.type) {
    case "boolean":
      ok = typeof value === "boolean";
      break;
    case "number":
      ok = typeof value === "number" && Number.isFinite(value);
      break;
    case "slider":
      ok = typeof value === "number" && Number.isFinite(value) && value >= field.min && value <= field.max;
      break;
    case "select":
      ok = (field.options ?? []).some((o) => o.value === value);
      break;
    case "string":
      ok = typeof value === "string";
      break;
    default:
      ok = value !== null && (typeof value !== "number" || Number.isFinite(value));
  }
  if (!ok) return false;
  if (typeof field.isValid === "function") {
    try {
      return field.isValid(value) === true;
    } catch {
      return false;
    }
  }
  return true;
}

/** Splits an imported options object into accepted entries and a dropped count. */
export function filterOptions(data, fieldFor) {
  const accepted = {};
  let dropped = 0;
  if (!data || typeof data !== "object" || Array.isArray(data)) return { accepted, dropped: 0, invalid: true };
  for (const [key, value] of Object.entries(data)) {
    const field = fieldFor(key);
    if (field && optionValueOk(field, value)) accepted[key] = value;
    else dropped += 1;
  }
  return { accepted, dropped };
}

/** Settings that run user code on pages (06 §11.3 warning). */
export function hasCustomScripts(options) {
  const lists = [options?.summarySiteConfigs, options?.topicDeleteSiteConfigs];
  return lists.some((l) => Array.isArray(l) && l.some((c) => c && (c.customUserscript || c.script)));
}
