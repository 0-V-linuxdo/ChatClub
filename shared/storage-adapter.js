import { STORAGE_KEYS } from "./constants.js";
import { storageLocalGet, storageLocalRemove, storageLocalSet } from "./extension-api.js";
import {
  dedupePocketHistory,
  dehydrateOptions,
  exportConfigBundle,
  isStorageQuotaError,
  normalizeConfigBundleKeys,
  normalizeCustomConfig,
  normalizeOptions,
  normalizePocketHistory,
  normalizePromptLibrary,
  normalizePromptSendHistory,
  normalizeShortcutConfig
} from "./storage-schema.js";
import { migrateLegacyScriptConfig } from "./script-config-migration.js";

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasField(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasLegacyUserscript(value) {
  if (!plainObject(value)) return false;
  return [value.summarySiteConfigs, value.topicDeleteSiteConfigs].some((items) => (
    Array.isArray(items) && items.some((item) => plainObject(item) && hasField(item, "userscript"))
  ));
}

async function migrateOptionsIfNeeded(value) {
  if (!hasLegacyUserscript(value)) return value;
  return migrateLegacyScriptConfig(value);
}

export async function storageGet(key) {
  return (await storageLocalGet(key))[key];
}

export async function storageSet(key, value) {
  await storageLocalSet({ [key]: value });
}

export async function storageRemove(key) {
  await storageLocalRemove(key);
}

export async function loadOptions() {
  const raw = await storageGet(STORAGE_KEYS.options);
  const options = normalizeOptions(await migrateOptionsIfNeeded(raw));
  await storageSet(STORAGE_KEYS.options, dehydrateOptions(options));
  return options;
}

export async function saveOptions(options) {
  const normalized = normalizeOptions(options);
  await storageSet(STORAGE_KEYS.options, dehydrateOptions(normalized));
  return normalized;
}

export async function loadCustomConfig() {
  const custom = normalizeCustomConfig(await storageGet(STORAGE_KEYS.customConfig));
  await storageSet(STORAGE_KEYS.customConfig, custom);
  return custom;
}

export async function saveCustomConfig(customConfig) {
  const normalized = normalizeCustomConfig(customConfig);
  await storageSet(STORAGE_KEYS.customConfig, normalized);
  return normalized;
}

export async function loadPromptLibrary() {
  const prompts = normalizePromptLibrary(await storageGet(STORAGE_KEYS.promptLibrary));
  await storageSet(STORAGE_KEYS.promptLibrary, prompts);
  return prompts;
}

export async function savePromptLibrary(promptLibrary) {
  const normalized = normalizePromptLibrary(promptLibrary);
  await storageSet(STORAGE_KEYS.promptLibrary, normalized);
  return normalized;
}

export async function loadPromptSendHistory() {
  const history = normalizePromptSendHistory(await storageGet(STORAGE_KEYS.promptSendHistory));
  await storageSet(STORAGE_KEYS.promptSendHistory, history);
  return history;
}

export async function savePromptSendHistory(promptSendHistory) {
  let normalized = normalizePromptSendHistory(promptSendHistory);
  while (true) {
    try {
      await storageSet(STORAGE_KEYS.promptSendHistory, normalized);
      return normalized;
    } catch (error) {
      if (!isStorageQuotaError(error) || normalized.length <= 1) throw error;
      normalized = normalized.slice(0, -1);
    }
  }
}

export async function readPocketHistory() {
  return normalizePocketHistory(await storageGet(STORAGE_KEYS.pocketHistory));
}

export async function loadPocketHistory() {
  const history = await readPocketHistory();
  await storageSet(STORAGE_KEYS.pocketHistory, history);
  return history;
}

export async function savePocketHistory(pocketHistory) {
  const normalized = normalizePocketHistory(pocketHistory);
  await storageSet(STORAGE_KEYS.pocketHistory, normalized);
  return normalized;
}

export async function loadShortcutConfig() {
  const config = normalizeShortcutConfig(await storageGet(STORAGE_KEYS.shortcutConfig));
  await storageSet(STORAGE_KEYS.shortcutConfig, config);
  return config;
}

export async function saveShortcutConfig(shortcutConfig) {
  const normalized = normalizeShortcutConfig(shortcutConfig);
  await storageSet(STORAGE_KEYS.shortcutConfig, normalized);
  return normalized;
}

export async function readConfigBundleState(selectedKeys, fallbackState = {}) {
  const selected = new Set(normalizeConfigBundleKeys(selectedKeys));
  const source = plainObject(fallbackState) ? fallbackState : {};
  const state = { ...source };
  if (selected.has("options")) state.options = normalizeOptions(await migrateOptionsIfNeeded(await storageGet(STORAGE_KEYS.options)));
  if (selected.has("customConfig")) state.customConfig = normalizeCustomConfig(await storageGet(STORAGE_KEYS.customConfig));
  if (selected.has("promptLibrary")) state.promptLibrary = normalizePromptLibrary(await storageGet(STORAGE_KEYS.promptLibrary));
  if (selected.has("promptSendHistory")) state.promptSendHistory = normalizePromptSendHistory(await storageGet(STORAGE_KEYS.promptSendHistory));
  if (selected.has("shortcutConfig")) state.shortcutConfig = normalizeShortcutConfig(await storageGet(STORAGE_KEYS.shortcutConfig));
  if (selected.has("pocketHistory")) state.pocketEntries = await readPocketHistory();
  return state;
}

export function loadConfigBundleState(selectedKeys, fallbackState = {}) {
  return readConfigBundleState(selectedKeys, fallbackState);
}

export async function exportStoredConfigBundle(selectedKeys, fallbackState = {}) {
  return exportConfigBundle(await readConfigBundleState(selectedKeys, fallbackState), selectedKeys);
}

export async function saveImportedConfigPatch(patch = {}) {
  const source = plainObject(patch) ? patch : {};
  const updates = {};
  const normalized = {};
  if (hasField(source, "options")) {
    normalized.options = normalizeOptions(await migrateOptionsIfNeeded(source.options));
    updates[STORAGE_KEYS.options] = dehydrateOptions(normalized.options);
  }
  if (hasField(source, "customConfig")) {
    normalized.customConfig = normalizeCustomConfig(source.customConfig);
    updates[STORAGE_KEYS.customConfig] = normalized.customConfig;
  }
  if (hasField(source, "promptLibrary")) {
    normalized.promptLibrary = normalizePromptLibrary(source.promptLibrary);
    updates[STORAGE_KEYS.promptLibrary] = normalized.promptLibrary;
  }
  if (hasField(source, "promptSendHistory")) {
    normalized.promptSendHistory = normalizePromptSendHistory(source.promptSendHistory);
    updates[STORAGE_KEYS.promptSendHistory] = normalized.promptSendHistory;
  }
  if (hasField(source, "shortcutConfig")) {
    normalized.shortcutConfig = normalizeShortcutConfig(source.shortcutConfig);
    updates[STORAGE_KEYS.shortcutConfig] = normalized.shortcutConfig;
  }
  if (hasField(source, "pocketHistory")) {
    normalized.pocketHistory = dedupePocketHistory(source.pocketHistory);
    updates[STORAGE_KEYS.pocketHistory] = normalized.pocketHistory;
  }
  if (Object.keys(updates).length) await storageLocalSet(updates);
  return normalized;
}
