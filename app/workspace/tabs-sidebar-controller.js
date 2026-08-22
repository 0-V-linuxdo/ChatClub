import { t } from "../../shared/i18n.js";
import { isGenericTopicTitle, sanitizeTopicTitle } from "../../shared/topic-title.js";
import { workspaceSessionWorkspaceId } from "../../shared/workspace-session.js";
import {
  button,
  confirmationModal as defaultConfirmationModal,
  editorModal as defaultEditorModal,
  el,
  field,
  iconButton,
  input,
  isDismissalEscape
} from "../../ui/dom.js";
import { createSvgIcon } from "../../ui/icons.js";

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

function workspaceIdValue(value) {
  return String(value || "").trim();
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
      const workspaceId = workspaceIdValue(item?.workspaceId);
      if (!workspaceId) return null;
      const tabId = positiveTabId(item?.tabId);
      return {
        workspaceId,
        tabId,
        windowId: Number.isInteger(item.windowId) ? item.windowId : null,
        index: Number.isInteger(item.index) && item.index >= 0 ? item.index : null,
        current: item.current === true,
        live: item.live === true || tabId !== null,
        title: String(item.title || "").trim(),
        layoutName: String(item.layoutName || "").trim(),
        topicTitle: String(item.topicTitle || "").trim(),
        topicTitleCustom: item.topicTitleCustom === true,
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
  setCurrentTabTitle,
  sessionStorage = globalThis.sessionStorage,
  extensionApi,
  canDismiss,
  document: ownerDocument = globalThis.document,
  editorModal = defaultEditorModal,
  confirmationModal = defaultConfirmationModal,
  createIcon = createSvgIcon
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

  function sameItem(left = {}, right = {}) {
    return workspaceIdValue(left.workspaceId) === workspaceIdValue(right.workspaceId);
  }

  function itemLabel(item = {}, index = 0) {
    const topicTitle = String(item.topicTitle || "").trim();
    if (topicTitle && !isGenericTopicTitle(topicTitle) && !isGenericWorkspaceTabName(topicTitle)) return topicTitle;
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
      topicTitle: current?.topicTitle || "",
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

  async function activateTab(item = {}) {
    const workspaceId = workspaceIdValue(item.workspaceId);
    if (!workspaceId) return { focused: false };
    const current = items.find((entry) => sameItem(entry, item)) || item;
    if (current.current) return { focused: true, tabId: current.tabId, current: true };
    if (current.live && current.tabId !== null) {
      try {
        return await requestBackground("focusWorkspaceTab", { tabId: current.tabId });
      } catch (error) {
        toast(t("toast.workspaceTabFocusFailed"), "error");
        throw error;
      }
    }
    try {
      return await requestBackground("openWorkspaceTab", { workspaceId });
    } catch (error) {
      toast(t("toast.workspaceTabOpenFailed"), "error");
      throw error;
    }
  }

  async function focusTab(tabId) {
    const normalized = positiveTabId(tabId);
    if (normalized === null) return { focused: false };
    const item = items.find((entry) => entry.tabId === normalized);
    if (item) return activateTab(item);
    try {
      return await requestBackground("focusWorkspaceTab", { tabId: normalized });
    } catch (error) {
      toast(t("toast.workspaceTabFocusFailed"), "error");
      throw error;
    }
  }

  async function saveTabTitle(item = {}, title = "") {
    const workspaceId = workspaceIdValue(item.workspaceId);
    const tabId = positiveTabId(item.tabId);
    if (!workspaceId && tabId === null) return { updated: false };
    const next = sanitizeTopicTitle(title);
    if (item.current === true && typeof setCurrentTabTitle === "function") {
      setCurrentTabTitle(next);
      setItems(items.map((entry) => (
        sameItem(entry, item) ? { ...entry, topicTitle: next, topicTitleCustom: true } : entry
      )));
      if (lastShell?.isConnected) syncSidebar(lastShell);
      return { updated: true, workspaceId, tabId, title: next, custom: true, current: true };
    }
    try {
      const payload = { title: next, custom: true, workspaceId };
      if (tabId !== null) payload.tabId = tabId;
      const response = await requestBackground("setWorkspaceTabTitle", payload);
      setItems(items.map((entry) => (
        sameItem(entry, item) ? { ...entry, topicTitle: next, topicTitleCustom: true } : entry
      )));
      if (lastShell?.isConnected) syncSidebar(lastShell);
      return response;
    } catch (error) {
      toast(t("toast.workspaceTabTitleFailed"), "error");
      throw error;
    }
  }

  async function forgetTab(item = {}) {
    const workspaceId = workspaceIdValue(item.workspaceId);
    if (!workspaceId) return { forgotten: false };
    try {
      const response = await requestBackground("forgetRememberedWorkspaceTab", { workspaceId });
      setItems(items.filter((entry) => !sameItem(entry, item)));
      if (lastShell?.isConnected) syncSidebar(lastShell);
      return response;
    } catch (error) {
      toast(t("toast.workspaceTabDeleteFailed"), "error");
      throw error;
    }
  }

  function openTitleEditor(item = {}) {
    const titleInput = input(itemLabel(item, items.findIndex((entry) => sameItem(entry, item))), {
      placeholder: t("workspace.tabs.editPlaceholder")
    });
    let dialog;
    const close = () => dialog?.remove?.();
    const save = () => {
      saveTabTitle(item, titleInput.value).catch(() => {});
      close();
    };
    dialog = editorModal(
      t("workspace.tabs.editTitle"),
      el("div", { class: "settings-editor-form" },
        field(t("workspace.tabs.editLabel"), titleInput),
        el("div", { class: "settings-dialog-actions" },
          button(t("common.cancel"), close),
          button(t("common.save"), save, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    return dialog;
  }

  function openDeleteConfirmation(item = {}) {
    let dialog;
    let applying = false;
    const close = (force = false) => {
      if (applying && force !== true) return;
      dialog?.remove?.();
    };
    const cancelButton = button(t("common.cancel"), () => close());
    const confirmButton = button(t("common.delete"), apply, "danger");
    const setApplying = (value) => {
      applying = value;
      cancelButton.disabled = value;
      confirmButton.disabled = value;
      dialog?.querySelector?.(".modal-header .icon-button")?.toggleAttribute?.("disabled", value);
      dialog?.querySelector?.(".modal")?.setAttribute?.("aria-busy", String(value));
    };
    async function apply() {
      if (applying) return;
      setApplying(true);
      try {
        await forgetTab(item);
        close(true);
      } catch {
        setApplying(false);
      }
    }
    dialog = confirmationModal(
      t("workspace.tabs.deleteTitle"),
      el("div", { class: "workspace-tabs-delete-confirmation" },
        el("p", {}, t("workspace.tabs.deleteConfirm", { title: itemLabel(item, items.findIndex((entry) => sameItem(entry, item))) })),
        el("div", { class: "settings-dialog-actions" }, cancelButton, confirmButton)
      ),
      close,
      false,
      t("common.close")
    );
    return dialog;
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
        items.map((item, index) => el("div", {
          class: `workspace-tabs-sidebar-item${item.current ? " is-current" : ""}${item.live ? "" : " is-closed"}`,
          role: "listitem"
        },
        el("button", {
          class: "workspace-tabs-sidebar-item-focus",
          type: "button",
          "aria-current": item.current ? "page" : null,
          onclick: () => { activateTab(item).catch(() => {}); }
        },
          el("span", { class: "workspace-tabs-sidebar-item-label" }, itemLabel(item, index))
        ),
        el("div", { class: "workspace-tabs-sidebar-item-meta" },
          item.current
            ? el("span", { class: "workspace-tabs-sidebar-item-current" }, t("workspace.tabs.current"))
            : item.live
              ? null
              : el("span", { class: "workspace-tabs-sidebar-item-closed" }, t("workspace.tabs.closed")),
          iconButton(
            t("workspace.tabs.edit"),
            createIcon("edit"),
            (event) => {
              event?.preventDefault?.();
              event?.stopPropagation?.();
              openTitleEditor(item);
            },
            "workspace-tabs-sidebar-item-edit",
            t("workspace.tabs.edit"),
            "",
            "workspace.tabs.edit"
          ),
          iconButton(
            t("workspace.tabs.delete"),
            createIcon("trash"),
            (event) => {
              event?.preventDefault?.();
              event?.stopPropagation?.();
              openDeleteConfirmation(item);
            },
            "workspace-tabs-sidebar-item-delete",
            t("workspace.tabs.delete"),
            "",
            "workspace.tabs.delete"
          )
        )))
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
    activateTab,
    saveTabTitle,
    forgetTab,
    openTitleEditor,
    openDeleteConfirmation,
    toggle,
    close,
    setOpen,
    renderSidebar,
    syncSidebar,
    itemLabel
  });
}
