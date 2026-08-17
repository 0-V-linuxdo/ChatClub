import { t } from "../../shared/i18n.js";
import { workspaceSessionWorkspaceId } from "../../shared/workspace-session.js";
import { el, isDismissalEscape } from "../../ui/dom.js";

const WORKSPACE_TABS_SIDEBAR_ID = "workspace-tabs-sidebar";
const WORKSPACE_TABS_SIDEBAR_OPEN_KEY = "chatclubWorkspaceTabsSidebarOpenV1";
const GENERIC_WORKSPACE_TAB_NAME = /^(?:chatclub(?:\s+\d+)?|prompt)$/i;

function storageGet(storage, key) {
  try {
    return storage?.getItem?.(key) || "";
  } catch {
    return "";
  }
}

function storageSet(storage, key, value) {
  try {
    if (value) storage?.setItem?.(key, value);
    else storage?.removeItem?.(key);
  } catch {}
}

function positiveTabId(value) {
  const tabId = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(tabId) && tabId > 0 ? tabId : null;
}

function isGenericWorkspaceTabName(value) {
  return GENERIC_WORKSPACE_TAB_NAME.test(String(value || "").trim());
}

function appIdsFromGroups(groups = []) {
  const ids = [];
  const seen = new Set();
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const chat of Array.isArray(group?.chatApps) ? group.chatApps : []) {
      const appId = String(chat?.appId || "").trim();
      if (!appId || seen.has(appId)) continue;
      seen.add(appId);
      ids.push(appId);
    }
  }
  return ids;
}

function normalizeItems(next = []) {
  return (Array.isArray(next) ? next : [])
    .map((item) => {
      const tabId = positiveTabId(item?.tabId);
      if (tabId === null) return null;
      return {
        tabId,
        windowId: Number.isInteger(item.windowId) ? item.windowId : null,
        index: Number.isInteger(item.index) && item.index >= 0 ? item.index : null,
        workspaceId: String(item.workspaceId || "").trim(),
        current: item.current === true,
        title: String(item.title || "").trim(),
        layoutName: String(item.layoutName || "").trim(),
        appIds: Array.isArray(item.appIds) ? item.appIds.map((id) => String(id || "").trim()).filter(Boolean) : []
      };
    })
    .filter(Boolean);
}

export function attachWorkspaceTabsSidebarController(dependencies = {}) {
  return createWorkspaceTabsSidebarController(dependencies);
}

export function createWorkspaceTabsSidebarController({
  requestBackground,
  toast,
  render,
  inferAppName,
  appById,
  currentWorkspace,
  sessionStorage = globalThis.sessionStorage,
  extensionApi,
  canDismiss,
  document: ownerDocument = globalThis.document
} = {}) {
  if (typeof requestBackground !== "function") {
    throw new TypeError("Workspace tabs sidebar requires requestBackground().");
  }
  if (typeof toast !== "function" || typeof render !== "function") {
    throw new TypeError("Workspace tabs sidebar requires toast() and render().");
  }

  let open = storageGet(sessionStorage, WORKSPACE_TABS_SIDEBAR_OPEN_KEY) === "1";
  let items = [];
  let lastShell = null;
  let tabUnsubscribers = [];
  let escapeInstalled = false;
  let refreshTimer = 0;

  function currentItems() {
    return items.slice();
  }

  function setItems(next = []) {
    items = normalizeItems(next);
    return currentItems();
  }

  function isOpen() {
    return open;
  }

  function persistOpen(next) {
    open = next === true;
    storageSet(sessionStorage, WORKSPACE_TABS_SIDEBAR_OPEN_KEY, open ? "1" : "");
    return open;
  }

  function itemLabel(item = {}, index = 0) {
    const layoutName = String(item.layoutName || "").trim();
    if (layoutName && !isGenericWorkspaceTabName(layoutName)) return layoutName;
    const names = (Array.isArray(item.appIds) ? item.appIds : []).map((appId) => {
      if (typeof inferAppName !== "function") return appId;
      try {
        return String(inferAppName(typeof appById === "function" ? appById(appId) : { id: appId }) || "").trim() || appId;
      } catch {
        return appId;
      }
    }).filter(Boolean);
    const unique = [...new Set(names)];
    if (unique.length) return unique.join(" · ");
    const title = String(item.title || "").trim();
    if (title && !isGenericWorkspaceTabName(title)) return title;
    return t("workspace.tabs.untitled", { index: index + 1 });
  }

  function syncPageTitle() {
    if (typeof currentWorkspace !== "function" || !ownerDocument) return;
    let current = null;
    try { current = currentWorkspace(); }
    catch { current = null; }
    const label = itemLabel({
      layoutName: current?.layoutName || "",
      appIds: Array.isArray(current?.appIds) ? current.appIds : appIdsFromGroups(current?.groups),
      title: ""
    }, 0);
    ownerDocument.title = isGenericWorkspaceTabName(label) ? "ChatClub" : label;
  }

  function alignSidebar(shell, sidebar) {
    const grid = shell?.querySelector?.(".main-grid");
    if (!sidebar?.style || !grid) return;
    const top = Number(grid.offsetTop);
    sidebar.style.top = `${Number.isFinite(top) && top > 0 ? top : 51}px`;
  }

  async function refresh() {
    const response = await requestBackground("listLiveWorkspaceTabs");
    setItems(response?.tabs);
    return currentItems();
  }

  async function focusTab(tabId) {
    const normalized = positiveTabId(tabId);
    if (normalized === null) return { focused: false };
    const item = items.find((entry) => entry.tabId === normalized);
    if (item?.current) return { focused: true, tabId: normalized, current: true };
    try {
      return await requestBackground("focusWorkspaceTab", { tabId: normalized });
    } catch (error) {
      toast(t("toast.workspaceTabFocusFailed"), "error");
      throw error;
    }
  }

  function renderSidebar() {
    if (!open) return null;
    return el("aside", {
      id: WORKSPACE_TABS_SIDEBAR_ID,
      class: "workspace-tabs-sidebar",
      "aria-label": t("workspace.tabs.title")
    },
    el("header", { class: "workspace-tabs-sidebar-header" },
      el("h2", { class: "workspace-tabs-sidebar-title" }, t("workspace.tabs.title"))
    ),
    items.length
      ? el("div", { class: "workspace-tabs-sidebar-list", role: "list" },
        items.map((item, index) => el("button", {
          class: `workspace-tabs-sidebar-item${item.current ? " is-current" : ""}`,
          type: "button",
          role: "listitem",
          "aria-current": item.current ? "page" : null,
          onclick: () => { focusTab(item.tabId).catch(() => {}); }
        },
        el("span", { class: "workspace-tabs-sidebar-item-label" }, itemLabel(item, index)),
        item.current
          ? el("span", { class: "workspace-tabs-sidebar-item-current" }, t("workspace.tabs.current"))
          : null
        ))
      )
      : el("div", { class: "workspace-tabs-sidebar-empty" }, t("workspace.tabs.empty")));
  }

  function refreshAndSync() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = 0;
      refresh().then(() => {
        if (lastShell?.isConnected) syncSidebar(lastShell);
      }).catch(() => {});
    }, 80);
  }

  function extensionSurface(name) {
    try {
      const api = typeof extensionApi === "function" ? extensionApi() : extensionApi;
      return api?.[name] || null;
    } catch {
      return null;
    }
  }

  function onWorkspaceSessionChanged(changes, areaName) {
    if (areaName && areaName !== "local") return;
    const keys = changes && typeof changes === "object" ? Object.keys(changes) : [];
    if (!keys.some((key) => workspaceSessionWorkspaceId(key))) return;
    refreshAndSync();
  }

  function syncTabListeners(shouldListen) {
    for (const unsubscribe of tabUnsubscribers) {
      try { unsubscribe(); } catch {}
    }
    tabUnsubscribers = [];
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = 0;
    }
    if (!shouldListen) return;
    const tabs = extensionSurface("tabs");
    const listenChrome = (eventRef, listener = refreshAndSync) => {
      if (!eventRef?.addListener) return;
      eventRef.addListener(listener);
      tabUnsubscribers.push(() => eventRef.removeListener?.(listener));
    };
    listenChrome(tabs?.onCreated);
    listenChrome(tabs?.onRemoved);
    listenChrome(tabs?.onUpdated);
    listenChrome(tabs?.onActivated);
    listenChrome(extensionSurface("storage")?.onChanged, onWorkspaceSessionChanged);
    if (ownerDocument?.addEventListener) {
      ownerDocument.addEventListener("visibilitychange", refreshAndSync);
      tabUnsubscribers.push(() => ownerDocument.removeEventListener("visibilitychange", refreshAndSync));
    }
  }

  function onEscapeKeydown(event) {
    if (!open || !isDismissalEscape(event)) return;
    if (typeof canDismiss === "function" && !canDismiss()) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    close();
  }

  function syncEscapeListener() {
    if (!ownerDocument?.addEventListener) return;
    if (open && !escapeInstalled) {
      ownerDocument.addEventListener("keydown", onEscapeKeydown, true);
      escapeInstalled = true;
      return;
    }
    if (!open && escapeInstalled) {
      ownerDocument.removeEventListener("keydown", onEscapeKeydown, true);
      escapeInstalled = false;
    }
  }

  function syncSidebar(shell) {
    syncPageTitle();
    if (!shell?.isConnected) return null;
    lastShell = shell;
    const existing = shell.querySelector(".workspace-tabs-sidebar");
    const next = renderSidebar();
    shell.classList.toggle("has-workspace-tabs-sidebar", Boolean(next));
    if (!next) {
      existing?.remove();
      syncTabListeners(false);
      syncEscapeListener();
      return null;
    }
    if (existing) existing.replaceWith(next);
    else {
      const grid = shell.querySelector(".main-grid");
      if (grid) grid.before(next);
      else shell.append(next);
    }
    alignSidebar(shell, next);
    syncTabListeners(true);
    syncEscapeListener();
    return next;
  }

  function setOpen(next) {
    const wasOpen = open;
    persistOpen(next);
    if (open && !wasOpen) {
      refresh().catch(() => {}).finally(() => { render(); });
      return open;
    }
    render();
    return open;
  }

  function toggle() {
    return setOpen(!open);
  }

  function close() {
    if (!open) return false;
    setOpen(false);
    return true;
  }

  return Object.freeze({
    isOpen,
    currentItems,
    setItems,
    refresh,
    focusTab,
    toggle,
    close,
    setOpen,
    renderSidebar,
    syncSidebar,
    itemLabel
  });
}
