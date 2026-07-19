import { BACKGROUND_REQUEST_ACTIONS } from "../../shared/background-requests.js";
import {
  extensionApi,
  requestBackground,
  tabsCreate,
  tabsGetCurrent,
  tabsUpdate,
  windowsUpdate
} from "../../shared/extension-api.js";

function openableTabUrl(href) {
  try {
    const parsed = new URL(String(href || ""), location.href);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function normalizeExtensionTabInfo(tab) {
  if (!tab || typeof tab.id !== "number") return null;
  return {
    id: tab.id,
    windowId: typeof tab.windowId === "number" ? tab.windowId : undefined,
    index: typeof tab.index === "number" ? tab.index : undefined
  };
}

export function createWorkspaceOpenTabs() {
  let currentExtensionTabInfo = null;

  async function captureCurrentExtensionTab() {
    try {
      if (!extensionApi()?.tabs?.getCurrent) return currentExtensionTabInfo;
      const info = normalizeExtensionTabInfo(await tabsGetCurrent());
      if (info) currentExtensionTabInfo = info;
      return info || currentExtensionTabInfo;
    } catch {
      return currentExtensionTabInfo;
    }
  }

  function refreshCurrentExtensionTabInfo() {
    captureCurrentExtensionTab().catch(() => {});
  }

  function tabCreateOptions(href, openerTab = currentExtensionTabInfo) {
    const options = { url: href, active: true };
    if (openerTab?.windowId) options.windowId = openerTab.windowId;
    if (typeof openerTab?.index === "number") options.index = openerTab.index + 1;
    if (typeof openerTab?.id === "number") options.openerTabId = openerTab.id;
    return options;
  }

  function openTabViaBackground(href) {
    try {
      if (!extensionApi()?.runtime?.sendMessage) return false;
      (async () => {
        const openerTab = await captureCurrentExtensionTab();
        await requestBackground(BACKGROUND_REQUEST_ACTIONS.OPEN_TAB, {
          url: href,
          ...(openerTab ? { openerTab } : {})
        });
      })().catch(() => openTabWindow(href));
      return true;
    } catch {
      return false;
    }
  }

  function openTabWindow(href) {
    try {
      return Boolean(window.open(href, "_blank", "noopener,noreferrer"));
    } catch {
      return false;
    }
  }

  function openTabViaExtensionApi(href) {
    try {
      if (!extensionApi()?.tabs?.create) return false;
      (async () => {
        const openerTab = await captureCurrentExtensionTab();
        const tab = await tabsCreate(tabCreateOptions(href, openerTab));
        if (tab?.id) await tabsUpdate(tab.id, { active: true }).catch(() => {});
        if (tab?.windowId && extensionApi()?.windows?.update) {
          await windowsUpdate(tab.windowId, { focused: true }).catch(() => {});
        }
      })().catch(() => {
        openTabViaBackground(href) || openTabWindow(href);
      });
      return true;
    } catch {
      return false;
    }
  }

  function openTabUrl(href) {
    href = openableTabUrl(href);
    if (!href) return false;
    if (openTabViaExtensionApi(href)) return true;
    if (openTabViaBackground(href)) return true;
    const opened = openTabWindow(href);
    if (opened) return true;
    return false;
  }

  return Object.freeze({
    openableTabUrl,
    openTabUrl,
    refreshCurrentExtensionTabInfo
  });
}
