import { BUILTIN_CHAT_APPS, DEFAULT_OPTIONS } from "./constants.js";
import {
  inspectBuiltinChatAppIframeConfigs,
  inspectIframeConfig
} from "./chat-frame-config.js";
import {
  dedupePocketHistory,
  dehydrateOptions,
  normalizeCustomConfig,
  normalizeOptions,
  normalizePromptLibrary,
  normalizePromptSendHistory,
  normalizeShortcutConfig
} from "./storage-schema.js";
import {
  OFFICIAL_RULES_COMPONENT_KEYS,
  OFFICIAL_RULES_FEATURES
} from "./official-rules-baseline.js";
import { inspectOfficialRuleOverrides } from "./official-rules-user-config.js";

export const CONFIG_BUNDLE_KEYS = Object.freeze([
  "options",
  "customConfig",
  "promptLibrary",
  "promptSendHistory",
  "shortcutConfig",
  "pocketHistory"
]);

const CONFIG_BUNDLE_KEY_SET = new Set(CONFIG_BUNDLE_KEYS);
const STORED_OPTIONS_SCHEMA_VERSION = 4;
const STORED_OPTION_KEYS = new Set([
  ...Object.keys(DEFAULT_OPTIONS),
  "builtinChatAppOrder",
  "optionsSchemaVersion",
  "officialOrders",
  "officialOverrides"
]);
const OFFICIAL_RULES_COMPONENT_KEY_SET = new Set(OFFICIAL_RULES_COMPONENT_KEYS);
const OFFICIAL_RULES_FEATURE_SET = new Set(OFFICIAL_RULES_FEATURES);

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function prepareLegacyOptionsForBackground(value) {
  const source = jsonClone(plainObject(value) ? value : {});
  const normalized = normalizeOptions(source);
  for (const field of ["summarySiteConfigs", "messageNavigatorSiteConfigs", "topicDeleteSiteConfigs"]) {
    if (Array.isArray(source[field])) normalized[field] = source[field];
  }
  if (Object.hasOwn(source, "scriptConfigSchemaVersion")) {
    normalized.scriptConfigSchemaVersion = source.scriptConfigSchemaVersion;
  }
  return normalized;
}

function validCustomOrderToken(value, feature) {
  const prefix = `custom/${feature}/`;
  const token = String(value || "");
  return token.startsWith(prefix)
    && token.length > prefix.length
    && token.length <= 512
    && !/[\u0000-\u001f\u007f]/.test(token);
}

function sanitizeOfficialOrders(value, dropped) {
  const result = {};
  if (!plainObject(value)) {
    if (value !== undefined) dropped.push("officialOrders");
    return result;
  }
  for (const [feature, order] of Object.entries(value)) {
    if (!OFFICIAL_RULES_FEATURE_SET.has(feature) || !Array.isArray(order)) {
      dropped.push(`officialOrders.${feature}`);
      continue;
    }
    const seen = new Set();
    result[feature] = [];
    for (const rawToken of order) {
      const token = typeof rawToken === "string" ? rawToken : "";
      const valid = (OFFICIAL_RULES_COMPONENT_KEY_SET.has(token) && token.startsWith(`${feature}/`))
        || validCustomOrderToken(token, feature);
      if (!valid || seen.has(token)) {
        dropped.push(`officialOrders.${feature}`);
        continue;
      }
      seen.add(token);
      result[feature].push(token);
    }
  }
  return result;
}

function sanitizeOfficialOverrides(value, dropped) {
  const inspected = inspectOfficialRuleOverrides(value);
  dropped.push(...inspected.errors);
  return jsonClone(inspected.value);
}

function sanitizeStoredOptionsV4(value) {
  const source = plainObject(value) ? value : {};
  const droppedFields = [];
  const result = { optionsSchemaVersion: STORED_OPTIONS_SCHEMA_VERSION };
  for (const [key, fieldValue] of Object.entries(source)) {
    if (!STORED_OPTION_KEYS.has(key)) {
      droppedFields.push(key);
      continue;
    }
    if (key === "optionsSchemaVersion") continue;
    if (key === "officialOrders") {
      result.officialOrders = sanitizeOfficialOrders(fieldValue, droppedFields);
      continue;
    }
    if (key === "officialOverrides") {
      result.officialOverrides = sanitizeOfficialOverrides(fieldValue, droppedFields);
      continue;
    }
    if (fieldValue === undefined) continue;
    result[key] = jsonClone(fieldValue);
  }
  return { value: result, droppedFields };
}

function hasBundleField(bundle, key) {
  return Object.prototype.hasOwnProperty.call(bundle, key);
}

function hasBundleObjectField(bundle, key) {
  return hasBundleField(bundle, key) && plainObject(bundle[key]);
}

function hasBundleArrayField(bundle, key) {
  return hasBundleField(bundle, key) && Array.isArray(bundle[key]);
}

function hasBundleNonEmptyObjectField(bundle, key) {
  return hasBundleObjectField(bundle, key) && Object.keys(bundle[key]).length > 0;
}

function normalizeImportArrayFieldResult(raw, normalize, validItem) {
  if (!Array.isArray(raw)) {
    return { value: null, droppedCount: 0 };
  }
  if (!raw.length) {
    return { value: normalize([]), droppedCount: 0 };
  }
  const validItems = raw.filter(validItem);
  if (!validItems.length) {
    return { value: null, droppedCount: raw.length };
  }
  const value = normalize(validItems);
  const importedCount = Array.isArray(value) ? value.length : 0;
  return {
    value,
    droppedCount: Math.max(0, raw.length - importedCount)
  };
}

function validImportedCustomConfigItem(item) {
  return plainObject(item) && normalizeCustomConfig([item]).length === 1;
}

function validImportedPromptLibraryItem(item) {
  return plainObject(item) && normalizePromptLibrary([item]).length === 1;
}

function validImportedPromptSendHistoryItem(item) {
  return (typeof item === "string" || plainObject(item)) && normalizePromptSendHistory([item]).length === 1;
}

function validImportedPocketHistoryItem(item) {
  return plainObject(item) && dedupePocketHistory([item]).length === 1;
}

function inspectImportedIframeConfigs(bundle = {}) {
  const invalid = [];
  const warnings = [];
  const risks = [];
  const addInspection = (source, id, inspected) => {
    if (!inspected.valid) invalid.push({ source, id, errors: inspected.errors });
    if (inspected.warnings.length) warnings.push({ source, id, warnings: inspected.warnings });
    if (inspected.risks.length) risks.push({ source, id, risks: inspected.risks });
  };

  if (plainObject(bundle.options) && hasBundleField(bundle.options, "builtinChatAppIframeConfigs")) {
    const inspected = inspectBuiltinChatAppIframeConfigs(
      bundle.options.builtinChatAppIframeConfigs,
      BUILTIN_CHAT_APPS.map((app) => app.id)
    );
    for (const entry of inspected.invalid) invalid.push({ source: "builtin", ...entry });
    for (const entry of inspected.warnings) warnings.push({ source: "builtin", ...entry });
    for (const entry of inspected.risks) risks.push({ source: "builtin", ...entry });
  }

  if (Array.isArray(bundle.customConfig)) {
    for (let index = 0; index < bundle.customConfig.length; index += 1) {
      const item = bundle.customConfig[index];
      if (!plainObject(item) || !hasBundleField(item, "iframeConfig")) continue;
      const id = String(item.id ?? "").trim() || `#${index + 1}`;
      addInspection("custom", id, inspectIframeConfig(item.iframeConfig));
    }
  }

  return {
    droppedCount: invalid.length,
    invalid,
    warnings,
    risks
  };
}

function normalizeConfigBundleKeys(selectedKeys = CONFIG_BUNDLE_KEYS) {
  const source = selectedKeys == null ? CONFIG_BUNDLE_KEYS : selectedKeys;
  const keys = Array.isArray(source)
    ? source
    : source && typeof source !== "string" && typeof source[Symbol.iterator] === "function"
      ? [...source]
      : [];
  return keys.filter((key, index) =>
    CONFIG_BUNDLE_KEY_SET.has(key) && keys.indexOf(key) === index
  );
}

export function exportConfigBundle(state = {}, selectedKeys = CONFIG_BUNDLE_KEYS) {
  const source = plainObject(state) ? state : {};
  const selected = new Set(normalizeConfigBundleKeys(selectedKeys));
  const bundle = {
    schema: "chatclub.config.v1",
    exportedAt: new Date().toISOString()
  };
  if (selected.has("options")) {
    bundle.options = plainObject(source.storedOptions)
      && source.storedOptions.optionsSchemaVersion === STORED_OPTIONS_SCHEMA_VERSION
      ? sanitizeStoredOptionsV4(source.storedOptions).value
      : dehydrateOptions(plainObject(source.options) ? source.options : {});
  }
  if (selected.has("customConfig")) bundle.customConfig = normalizeCustomConfig(source.customConfig);
  if (selected.has("promptLibrary")) bundle.promptLibrary = normalizePromptLibrary(source.promptLibrary);
  if (selected.has("promptSendHistory")) bundle.promptSendHistory = normalizePromptSendHistory(source.promptSendHistory);
  if (selected.has("shortcutConfig")) bundle.shortcutConfig = normalizeShortcutConfig(source.shortcutConfig);
  if (selected.has("pocketHistory")) bundle.pocketHistory = dedupePocketHistory(source.pocketEntries || source.pocketHistory);
  return bundle;
}

export function inspectImportedConfig(raw) {
  const bundle = plainObject(raw) ? raw : {};
  const hasIframeConfigs = (
    hasBundleObjectField(bundle, "options")
    && hasBundleField(bundle.options, "builtinChatAppIframeConfigs")
  ) || (
    hasBundleArrayField(bundle, "customConfig")
    && bundle.customConfig.some((item) => plainObject(item) && hasBundleField(item, "iframeConfig"))
  );
  const iframeConfigs = hasIframeConfigs
    ? inspectImportedIframeConfigs(bundle)
    : {
        droppedCount: 0,
        invalid: [],
        warnings: [],
        risks: []
      };
  const customConfig = hasBundleArrayField(bundle, "customConfig")
    ? normalizeImportArrayFieldResult(bundle.customConfig, normalizeCustomConfig, validImportedCustomConfigItem)
    : null;
  const promptLibrary = hasBundleArrayField(bundle, "promptLibrary")
    ? normalizeImportArrayFieldResult(bundle.promptLibrary, normalizePromptLibrary, validImportedPromptLibraryItem)
    : null;
  const promptSendHistory = hasBundleArrayField(bundle, "promptSendHistory")
    ? normalizeImportArrayFieldResult(bundle.promptSendHistory, normalizePromptSendHistory, validImportedPromptSendHistoryItem)
    : null;
  const pocketHistory = hasBundleArrayField(bundle, "pocketHistory")
    ? normalizeImportArrayFieldResult(bundle.pocketHistory, dedupePocketHistory, validImportedPocketHistoryItem)
    : null;
  const storedOptionsV4 = hasBundleObjectField(bundle, "options")
    && bundle.options.optionsSchemaVersion === STORED_OPTIONS_SCHEMA_VERSION
    ? sanitizeStoredOptionsV4(bundle.options)
    : null;
  return {
    data: {
      options: hasBundleNonEmptyObjectField(bundle, "options")
        ? storedOptionsV4?.value || prepareLegacyOptionsForBackground(bundle.options)
        : null,
      customConfig: customConfig?.value ?? null,
      promptLibrary: promptLibrary?.value ?? null,
      promptSendHistory: promptSendHistory?.value ?? null,
      shortcutConfig: hasBundleNonEmptyObjectField(bundle, "shortcutConfig") ? normalizeShortcutConfig(bundle.shortcutConfig) : null,
      pocketHistory: pocketHistory?.value ?? null
    },
    diagnostics: {
      customConfig,
      promptLibrary,
      promptSendHistory,
      pocketHistory,
      options: storedOptionsV4
        ? { droppedCount: storedOptionsV4.droppedFields.length, droppedFields: storedOptionsV4.droppedFields }
        : { droppedCount: 0, droppedFields: [] },
      iframeConfigs
    }
  };
}
