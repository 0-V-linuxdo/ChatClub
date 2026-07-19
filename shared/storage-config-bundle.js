import { BUILTIN_CHAT_APPS } from "./constants.js";
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

export const CONFIG_BUNDLE_KEYS = Object.freeze([
  "options",
  "customConfig",
  "promptLibrary",
  "promptSendHistory",
  "shortcutConfig",
  "pocketHistory"
]);

const CONFIG_BUNDLE_KEY_SET = new Set(CONFIG_BUNDLE_KEYS);

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

export function normalizeConfigBundleKeys(selectedKeys = CONFIG_BUNDLE_KEYS) {
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
  if (selected.has("options")) bundle.options = dehydrateOptions(plainObject(source.options) ? source.options : {});
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
  return {
    data: {
      options: hasBundleNonEmptyObjectField(bundle, "options") ? normalizeOptions(bundle.options) : null,
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
      iframeConfigs
    }
  };
}
