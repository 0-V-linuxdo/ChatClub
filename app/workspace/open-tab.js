export function openableTabUrl(href) {
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

  function captureCurrentExtensionTab(callback) {
    try {
      if (!globalThis.chrome?.tabs?.getCurrent) {
        callback(currentExtensionTabInfo);
        return false;
      }
      globalThis.chrome.tabs.getCurrent((tab) => {
        const info = globalThis.chrome?.runtime?.lastError ? null : normalizeExtensionTabInfo(tab);
        if (info) currentExtensionTabInfo = info;
        callback(info || currentExtensionTabInfo);
      });
      return true;
    } catch {
      callback(currentExtensionTabInfo);
      return false;
    }
  }

  function refreshCurrentExtensionTabInfo() {
    captureCurrentExtensionTab(() => {});
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
      if (!globalThis.chrome?.runtime?.sendMessage) return false;
      captureCurrentExtensionTab((openerTab) => {
        globalThis.chrome.runtime.sendMessage({ source: "chatclub", action: "openTab", url: href, openerTab }, (response) => {
          if (!globalThis.chrome?.runtime?.lastError && response?.success !== false) return;
          try {
            window.open(href, "_blank", "noopener,noreferrer");
          } catch {}
        });
      });
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

  function openTabViaChromeApi(href) {
    try {
      if (!globalThis.chrome?.tabs?.create) return false;
      captureCurrentExtensionTab((openerTab) => {
        globalThis.chrome.tabs.create(tabCreateOptions(href, openerTab), (tab) => {
          if (globalThis.chrome?.runtime?.lastError) {
            openTabViaBackground(href) || openTabWindow(href);
            return;
          }
          if (tab?.id) {
            try { globalThis.chrome.tabs.update(tab.id, { active: true }); } catch {}
          }
          if (tab?.windowId && globalThis.chrome?.windows?.update) {
            try { globalThis.chrome.windows.update(tab.windowId, { focused: true }); } catch {}
          }
        });
      });
      return true;
    } catch {
      return false;
    }
  }

  function openTabUrl(href) {
    href = openableTabUrl(href);
    if (!href) return false;
    if (openTabViaChromeApi(href)) return true;
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
