import { OFFICIAL_RULES_COMPONENT_KEYS } from "./official-rules-baseline.js";

export const OFFICIAL_RULE_USER_OVERRIDE_FIELDS = Object.freeze({
  summary: Object.freeze([
    "name", "enabled", "hosts", "pathPrefixes", "fallbackMode", "userscriptRunMode",
    "userscriptTimeoutMs", "copyTimeoutMs", "userscriptFallbackDelayMs"
  ]),
  messageNavigator: Object.freeze([
    "name", "enabled", "appIds", "hosts", "pathPrefixes", "adapter", "messageSelector",
    "userSelector", "assistantSelector", "textCleanupSelectors", "summaryMaxChars"
  ]),
  delete: Object.freeze([
    "name", "enabled", "appIds", "hosts", "pathPrefixes", "userscriptTimeoutMs"
  ])
});

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function inspectOfficialRuleOverrides(value) {
  const overrides = {};
  const errors = [];
  if (value !== undefined && value !== null && !plainObject(value)) {
    errors.push("officialOverrides must be an object");
    return Object.freeze({ valid: false, value: Object.freeze(overrides), errors: Object.freeze(errors) });
  }
  for (const [key, override] of Object.entries(plainObject(value) ? value : {})) {
    const [feature, siteId, extra] = key.split("/");
    const allowedFields = new Set(OFFICIAL_RULE_USER_OVERRIDE_FIELDS[feature] || []);
    if (!siteId || extra || !OFFICIAL_RULES_COMPONENT_KEYS.includes(key)) {
      errors.push(`officialOverrides.${key} is not an official component`);
      continue;
    }
    if (!plainObject(override)) {
      errors.push(`officialOverrides.${key} must be an object`);
      continue;
    }
    const accepted = {};
    for (const [field, fieldValue] of Object.entries(override)) {
      if (!allowedFields.has(field)) {
        errors.push(`officialOverrides.${key}.${field} is read-only or unsupported`);
        continue;
      }
      accepted[field] = clone(fieldValue);
    }
    if (Object.keys(accepted).length) overrides[key] = accepted;
  }
  return Object.freeze({
    valid: errors.length === 0,
    value: Object.freeze(overrides),
    errors: Object.freeze(errors)
  });
}

export function canonicalizeOfficialRuleOverrides(value) {
  return clone(inspectOfficialRuleOverrides(value).value);
}
