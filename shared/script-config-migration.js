import { SUMMARY_SITE_CONFIGS, loadBuiltInSummarySource } from "./summary-sites.js";
import { TOPIC_DELETE_SITE_CONFIGS, loadBuiltInTopicDeleteSource } from "./topic-delete-sites.js";

function copyOptions(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return {
    ...raw,
    summarySiteConfigs: Array.isArray(raw.summarySiteConfigs)
      ? raw.summarySiteConfigs.map((item) => item && typeof item === "object" ? { ...item } : item)
      : raw.summarySiteConfigs,
    topicDeleteSiteConfigs: Array.isArray(raw.topicDeleteSiteConfigs)
      ? raw.topicDeleteSiteConfigs.map((item) => item && typeof item === "object" ? { ...item } : item)
      : raw.topicDeleteSiteConfigs
  };
}

function normalizedSource(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function userscriptVersion(source) {
  return normalizedSource(source).match(/^\s*\/\/\s*@version\s+(.+?)\s*$/m)?.[1]?.trim() || "";
}

function generatedDeleteSource(id, source, currentSource) {
  const normalized = normalizedSource(source);
  if (!normalized) return false;
  if (normalized === normalizedSource(currentSource)) return true;
  const legacy = {
    kagi: [
      "return api.deleteKagiThread(data);",
      `if (!api.dispatchDeleteKeyboardShortcut()) {
  return api.result(false, "kagi", "delete shortcut dispatch failed");
}
await api.sleep(240);
await api.clickDeleteConfirmIfPresent(1800);
return api.result(true, "kagi");`
    ],
    grok: ["return api.deleteGrokThread(data);"],
    grokMirror: ["return api.deleteGrokThread(data);"],
    notion: ["return api.deleteNotionThread(data);"],
    deepseek: ["return api.deleteDeepSeekThread(data);"]
  };
  if ((legacy[id] || []).some((item) => normalizedSource(item) === normalized)) return true;
  if (!/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(normalized)) return false;
  if (!/@namespace\s+https:\/\/chatclub\.local\/delete-sites/.test(normalized)) return false;
  if (!/@name\s+ChatClub Delete Site\b/.test(normalized)) return false;
  const version = userscriptVersion(normalized);
  const currentVersion = userscriptVersion(currentSource);
  if (!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(version) || !currentVersion || version === currentVersion) return false;
  const escapedId = String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`const\\s+SITE_ID\\s*=\\s*["']${escapedId}["']\\s*;`).test(normalized)) return false;
  return [
    'const GLOBAL_NAME = "ChatClubDeleteSites";',
    "function dispatchReady",
    "function handleRequest",
    "function clickDeleteConfirmIfPresent",
    "const runners = {",
    "registry[SITE_ID]"
  ].every((marker) => normalized.includes(marker));
}

function explicitlyCustomEntry(item) {
  return Boolean(item && typeof item === "object" && (
    item.sourceMode === "custom"
    || typeof item.customUserscript === "string"
    || item.userscriptOverride === true
  ));
}

function migrateEntry(item, isPackagedCopy) {
  if (!item || typeof item !== "object") return item;
  const next = { ...item };
  const legacySource = typeof next.userscript === "string" ? next.userscript : "";
  const explicitCustom = explicitlyCustomEntry(next);
  delete next.userscript;
  delete next.userscriptOverride;
  if (explicitCustom) {
    next.sourceMode = "custom";
    if (typeof next.customUserscript !== "string" && legacySource) next.customUserscript = legacySource;
    return next;
  }
  if (!legacySource) return next;
  if (isPackagedCopy) {
    next.sourceMode = "builtIn";
    delete next.customUserscript;
  } else {
    next.sourceMode = "custom";
    next.customUserscript = legacySource;
  }
  return next;
}

export async function migrateLegacyScriptConfig(raw = {}) {
  const options = copyOptions(raw);
  const summaryById = new Map(SUMMARY_SITE_CONFIGS.map((item) => [item.id, item]));
  const deleteById = new Map(TOPIC_DELETE_SITE_CONFIGS.map((item) => [item.id, item]));

  if (Array.isArray(options.summarySiteConfigs)) {
    options.summarySiteConfigs = await Promise.all(options.summarySiteConfigs.map(async (item) => {
      const descriptor = summaryById.get(String(item?.id || ""));
      const legacySource = typeof item?.userscript === "string" ? item.userscript : "";
      if (!descriptor || !legacySource || explicitlyCustomEntry(item)) return migrateEntry(item, false);
      let packaged = false;
      try { packaged = normalizedSource(legacySource) === normalizedSource(await loadBuiltInSummarySource(descriptor.id)); }
      catch { packaged = false; }
      return migrateEntry(item, packaged);
    }));
  }

  if (Array.isArray(options.topicDeleteSiteConfigs)) {
    options.topicDeleteSiteConfigs = await Promise.all(options.topicDeleteSiteConfigs.map(async (item) => {
      const descriptor = deleteById.get(String(item?.id || ""));
      const legacySource = typeof item?.userscript === "string" ? item.userscript : "";
      if (!descriptor || !legacySource || explicitlyCustomEntry(item)) return migrateEntry(item, false);
      let packaged = false;
      try { packaged = generatedDeleteSource(descriptor.id, legacySource, await loadBuiltInTopicDeleteSource(descriptor.id)); }
      catch { packaged = false; }
      return migrateEntry(item, packaged);
    }));
  }
  return options;
}
