import { APP_NAME } from "../shared/constants.js";
import { buildDynamicDnrRules, contentScriptMatches } from "../shared/dnr.js";
import { getAllChatApps, loadCustomConfig, loadOptions, saveOptions } from "../shared/storage.js";

const PRELOAD_SCRIPT_ID = "chatclub-preload";
const SUMMARY_PAGE_SCRIPT_ID = "chatclub-summary-userscripts-main";
const SUMMARY_SCRIPT_ID = "chatclub-summary-userscripts";
const CONTENT_SCRIPT_ID = "chatclub-content";

function openableTabUrl(href) {
  try {
    const parsed = new URL(String(href || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function normalizeOpenerTab(tab) {
  if (!tab || typeof tab.id !== "number") return null;
  return {
    id: tab.id,
    windowId: typeof tab.windowId === "number" ? tab.windowId : undefined,
    index: typeof tab.index === "number" ? tab.index : undefined
  };
}

async function resolveExplicitTab(openerTab) {
  const info = normalizeOpenerTab(openerTab);
  if (!info) return null;
  try {
    return await chrome.tabs.get(info.id);
  } catch {
    return info;
  }
}

async function resolveTargetTab(sender, openerTab) {
  const explicitTab = await resolveExplicitTab(openerTab);
  if (explicitTab?.id) return explicitTab;
  if (sender?.tab?.id) return sender.tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs?.[0] || null;
  } catch {
    return null;
  }
}

function openTabCreateOptions(url, targetTab) {
  const createOptions = { url, active: true };
  if (targetTab?.windowId) {
    createOptions.windowId = targetTab.windowId;
    if (typeof targetTab.index === "number") createOptions.index = targetTab.index + 1;
    if (typeof targetTab.id === "number") createOptions.openerTabId = targetTab.id;
  }
  return createOptions;
}

async function focusCreatedTab(tab) {
  if (tab?.id) {
    try { await chrome.tabs.update(tab.id, { active: true }); } catch {}
  }
  if (tab?.windowId && chrome.windows?.update) {
    try { await chrome.windows.update(tab.windowId, { focused: true }); } catch {}
  }
}

async function openExternalTab(url, sender, openerTab) {
  const targetTab = await resolveTargetTab(sender, openerTab);
  try {
    const tab = await chrome.tabs.create(openTabCreateOptions(url, targetTab));
    await focusCreatedTab(tab);
    return tab;
  } catch {}
  if (targetTab?.id) {
    try {
      const duplicate = await chrome.tabs.duplicate(targetTab.id);
      if (duplicate?.id) {
        await chrome.tabs.update(duplicate.id, { url, active: true });
        await focusCreatedTab(duplicate);
        return duplicate;
      }
    } catch {}
  }
  const tab = await chrome.tabs.create({ url, active: true });
  await focusCreatedTab(tab);
  return tab;
}

async function currentChatApps() {
  const customConfig = await loadCustomConfig();
  return getAllChatApps(customConfig);
}

function summaryCollectorContentTargets(options = {}) {
  return (options.summarySiteConfigs || [])
    .filter((config) => config?.enabled !== false && Array.isArray(config.hosts) && config.hosts.length)
    .map((config) => ({
      id: `summary-${config.id || config.name || "collector"}`,
      name: config.name || config.id || "Summary Collector",
      url: "",
      hosts: config.hosts
    }));
}

function topicDeleteContentTargets(options = {}) {
  return (options.topicDeleteSiteConfigs || [])
    .filter((config) => config?.enabled !== false && Array.isArray(config.hosts) && config.hosts.length)
    .map((config) => ({
      id: `topic-delete-${config.id || config.name || "site"}`,
      name: config.name || config.id || "Topic Delete Site",
      url: "",
      hosts: config.hosts
    }));
}

async function currentContentScriptTargets() {
  const customConfig = await loadCustomConfig();
  const options = await loadOptions();
  return [...getAllChatApps(customConfig), ...summaryCollectorContentTargets(options), ...topicDeleteContentTargets(options)];
}

async function updateDnrRules() {
  const chatApps = await currentChatApps();
  const extensionHost = new URL(chrome.runtime.getURL("")).hostname;
  const rules = buildDynamicDnrRules(chatApps, extensionHost);
  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRules.map((rule) => rule.id),
    addRules: rules
  });
}

async function registerContentScripts() {
  const matches = contentScriptMatches(await currentContentScriptTargets());
  try {
    const registered = await chrome.scripting.getRegisteredContentScripts();
    const ownIds = registered
      .map((script) => script.id)
      .filter((id) => id === PRELOAD_SCRIPT_ID || id === SUMMARY_PAGE_SCRIPT_ID || id === SUMMARY_SCRIPT_ID || id === CONTENT_SCRIPT_ID);
    if (ownIds.length) await chrome.scripting.unregisterContentScripts({ ids: ownIds });
  } catch (error) {
    console.warn(`[${APP_NAME}] Failed to unregister content scripts`, error);
  }

  await chrome.scripting.registerContentScripts([
    {
      id: PRELOAD_SCRIPT_ID,
      matches,
      js: ["content/preload.js"],
      allFrames: true,
      runAt: "document_start",
      world: "MAIN"
    },
    {
      id: SUMMARY_PAGE_SCRIPT_ID,
      matches,
      js: ["content/summary-userscripts-main.js"],
      allFrames: true,
      runAt: "document_idle",
      world: "MAIN"
    },
    {
      id: SUMMARY_SCRIPT_ID,
      matches,
      js: ["content/summary-userscripts.js"],
      allFrames: true,
      runAt: "document_idle"
    },
    {
      id: CONTENT_SCRIPT_ID,
      matches,
      js: ["content/content.js"],
      allFrames: true,
      runAt: "document_idle"
    }
  ]);
}

let runtimeConfigReloadChain = Promise.resolve();

function reloadRuntimeConfig() {
  runtimeConfigReloadChain = runtimeConfigReloadChain
    .catch(() => {})
    .then(() => Promise.all([updateDnrRules(), registerContentScripts()]));
  return runtimeConfigReloadChain;
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.remove(["clientId", "sessionData"]);
  await loadOptions();
  await reloadRuntimeConfig();
});

chrome.runtime.onStartup?.addListener(() => {
  reloadRuntimeConfig().catch((error) => console.error(`[${APP_NAME}] startup reload failed`, error));
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("chatClub.html") });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source !== "chatclub") return false;
  (async () => {
    if (message.action === "reloadConfigs") {
      await reloadRuntimeConfig();
      sendResponse({ success: true });
      return;
    }
    if (message.action === "getConfigInfo") {
      sendResponse({
        options: await loadOptions(),
        customConfig: await loadCustomConfig(),
        contentScripts: await chrome.scripting.getRegisteredContentScripts()
      });
      return;
    }
    if (message.action === "resetConfig") {
      await chrome.storage.local.clear();
      const options = await saveOptions({});
      await reloadRuntimeConfig();
      sendResponse({ success: true, options });
      return;
    }
    if (message.action === "openTab") {
      const url = openableTabUrl(message.url);
      if (!url) {
        sendResponse({ success: false, error: "Invalid tab URL" });
        return;
      }
      await openExternalTab(url, sender, message.openerTab);
      sendResponse({ success: true });
      return;
    }
    sendResponse({ success: false, error: `Unknown action: ${message.action}` });
  })().catch((error) => sendResponse({ success: false, error: error.message || String(error) }));
  return true;
});

reloadRuntimeConfig().catch((error) => console.error(`[${APP_NAME}] initial reload failed`, error));
