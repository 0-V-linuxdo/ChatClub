import { t } from "../../shared/i18n.js";
import { isGenericTopicTitle, sanitizeTopicTitle } from "../../shared/topic-title.js";
import { workspaceSessionWorkspaceId } from "../../shared/workspace-session.js";
import {
  pocketPagesFromPreviewItems,
  pocketPagesFromWorkspaceFullText
} from "../../shared/workspace-tab-fulltext.js";
import { createMenuButton } from "../../ui/components.js";
import {
  bindLinearMenuKeyboard,
  claimTopmostPopoverEscape,
  el,
  iconButton,
  input,
  isDismissalEscape,
  openConfirmationAction as defaultOpenConfirmationAction
} from "../../ui/dom.js";
import { createSvgIcon } from "../../ui/icons.js";
import {
  forgetWorkspaceTabFullText,
  itemMatchesTitleQuery,
  loadRecordFullTextEnabled,
  loadWorkspaceTabFullTextStore,
  renderWorkspaceTabSearchField,
  renderWorkspaceTabSearchHits,
  workspaceIdsMatchingFullText
} from "./tab-search.js";
import {
  createFolder,
  deleteFolder,
  moveFolder,
  moveTabToFolder,
  pruneFolderMembers,
  readFolders,
  removeTabFromFolder,
  renameFolder,
  serializeFolders,
  toggleFolderCollapsed,
  WORKSPACE_TABS_SIDEBAR_FOLDERS_KEY
} from "./tabs-sidebar-folders.js";
import {
  createTabsSidebarHoverMenu,
  renderTabsSidebarDivider,
  renderTabsSidebarFolder,
  renderTabsSidebarGroup,
  renderTabsSidebarItem
} from "./tabs-sidebar-item.js";
import {
  uniqueChatFaviconSources,
  renderChatFaviconStack
} from "../../ui/favicon.js";
import {
  buildSidebarTree,
  folderIdForItem,
  normalizeTabsSidebarSortMode,
  sortSidebarItems,
  TABS_SIDEBAR_SORT_LABEL_KEYS,
  TABS_SIDEBAR_SORT_MODES,
  workspaceIdValue
} from "./tabs-sidebar-sort.js";

const WORKSPACE_TABS_SIDEBAR_ID = "workspace-tabs-sidebar";
const WORKSPACE_TABS_SIDEBAR_OPEN_KEY = "chatclubWorkspaceTabsSidebarOpenV1";
const WORKSPACE_TABS_SIDEBAR_WIDTH_KEY = "chatclubWorkspaceTabsSidebarWidthV1";
const WORKSPACE_TABS_SIDEBAR_CLOSED_ORDER_KEY = "chatclubWorkspaceTabsClosedOrderV1";
const WORKSPACE_TABS_SIDEBAR_PINNED_KEY = "chatclubWorkspaceTabsPinnedV1";
const WORKSPACE_TABS_SIDEBAR_SORT_KEY = "chatclubWorkspaceTabsSidebarSortV1";
const SIDEBAR_WIDTH_MIN = 220;
const SIDEBAR_WIDTH_MAX = 560;
const SIDEBAR_WIDTH_DEFAULT = 320;
const TAB_DRAG_START_DISTANCE = 6;
const GENERIC_WORKSPACE_TAB_NAME = /^(?:chatclub(?:\s+\d+)?|prompt)$/i;
const PAGE_CLOSING_ERROR = /message port closed|receiving end does not exist|no tab with id|tab was closed/i;

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

function readIdList(storage, key) {
  try {
    const raw = JSON.parse(storageGet(storage, key) || "[]");
    return Array.isArray(raw) ? raw.map((value) => workspaceIdValue(value)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function clampSidebarWidth(value) {
  const width = Number(value);
  if (!Number.isFinite(width)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));
}

function readSidebarWidth(storage) {
  const raw = storageGet(storage, WORKSPACE_TABS_SIDEBAR_WIDTH_KEY);
  return raw ? clampSidebarWidth(raw) : SIDEBAR_WIDTH_DEFAULT;
}

function isGenericWorkspaceTabName(value) {
  return GENERIC_WORKSPACE_TAB_NAME.test(String(value || "").trim());
}

function isPageClosingError(error) {
  return PAGE_CLOSING_ERROR.test(String(error?.message || error || ""));
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

function finiteActivityTime(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeItems(next = []) {
  return (Array.isArray(next) ? next : [])
    .map((item) => {
      const workspaceId = workspaceIdValue(item?.workspaceId);
      const tabId = positiveTabId(item?.tabId);
      if (!workspaceId && tabId === null) return null;
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
        appIds: Array.isArray(item.appIds) ? item.appIds.map((id) => String(id || "").trim()).filter(Boolean) : [],
        createdAt: finiteActivityTime(item.createdAt),
        viewedAt: finiteActivityTime(item.viewedAt),
        editedAt: finiteActivityTime(item.editedAt),
        updatedAt: finiteActivityTime(item.updatedAt),
        detachedAt: finiteActivityTime(item.detachedAt)
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
  localStorage = globalThis.localStorage,
  extensionApi,
  closeCurrentTab,
  canDismiss,
  getOptions = () => ({}),
  appFaviconUrl,
  browserFaviconUrl,
  fallbackFaviconUrl,
  effectiveFaviconUrl,
  savePagesToPocket,
  collectLivePreview,
  document: ownerDocument = globalThis.document,
  openConfirmationAction = defaultOpenConfirmationAction,
  createIcon = createSvgIcon,
  openWorkspaceHistory
} = {}) {
  if (typeof requestBackground !== "function") {
    throw new TypeError("Workspace tabs sidebar requires requestBackground().");
  }
  if (typeof toast !== "function" || typeof render !== "function") {
    throw new TypeError("Workspace tabs sidebar requires toast() and render().");
  }

  let open = storageGet(sessionStorage, WORKSPACE_TABS_SIDEBAR_OPEN_KEY) === "1";
  let sidebarWidth = readSidebarWidth(localStorage);
  let items = [];
  let folders = readFolders(localStorage, storageGet);
  let sortMode = normalizeTabsSidebarSortMode(storageGet(localStorage, WORKSPACE_TABS_SIDEBAR_SORT_KEY));
  let lastShell = null;
  let tabUnsubscribers = [];
  let escapeInstalled = false;
  let refreshTimer = 0;
  let resizeDrag = null;
  let itemDrag = null;
  let suppressActivate = false;
  let editingKey = "";
  let editingDraft = "";
  let searchQuery = "";
  let searchFocused = false;
  let searchSelection = { start: 0, end: 0 };
  let searchComposing = false;
  let recordFullTextEnabled = false;
  let fullTextStore = {};
  let fullTextLoad = null;
  let sortMenuCleanup = null;
  let pocketBusy = false;

  const hover = createTabsSidebarHoverMenu({
    ownerDocument,
    createIcon,
    getOptions,
    onPin: (item) => togglePin(item),
    onPocket: (item) => saveTabToPocket(item).catch(() => {}),
    onEdit: (item, row) => startTitleEditor(item, row),
    onDelete: (item) => openDeleteConfirmation(item),
    canMove: (item, delta) => canMoveByDelta(item, delta, "tab"),
    onMove: (item, delta) => moveByDelta(item, delta, "tab")
  });

  function currentItems() {
    return items.slice();
  }

  function sortOptions() {
    return {
      mode: sortMode,
      closedOrder: readIdList(localStorage, WORKSPACE_TABS_SIDEBAR_CLOSED_ORDER_KEY),
      pinnedOrder: readIdList(localStorage, WORKSPACE_TABS_SIDEBAR_PINNED_KEY),
      getLabel: (item) => itemDisplayLabel(item, 0)
    };
  }

  function setItems(next = []) {
    const normalized = normalizeItems(next);
    folders = pruneFolderMembers(folders, normalized.map((item) => item.workspaceId));
    persistFolders();
    items = sortSidebarItems(normalized, sortOptions());
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

  function persistWidth(next) {
    sidebarWidth = clampSidebarWidth(next);
    storageSet(localStorage, WORKSPACE_TABS_SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    return sidebarWidth;
  }

  function persistIdList(key, ids) {
    const unique = [];
    const seen = new Set();
    for (const id of ids) {
      const value = workspaceIdValue(id);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      unique.push(value);
    }
    storageSet(localStorage, key, unique.length ? JSON.stringify(unique) : "");
    return unique;
  }

  function persistClosedOrder(list = items) {
    return persistIdList(
      WORKSPACE_TABS_SIDEBAR_CLOSED_ORDER_KEY,
      list.filter((item) => !item.live).map((item) => item.workspaceId)
    );
  }

  function persistPinnedFromItems(list = items) {
    const existing = readIdList(localStorage, WORKSPACE_TABS_SIDEBAR_PINNED_KEY);
    const present = [];
    const seen = new Set();
    for (const item of list) {
      const id = workspaceIdValue(item.workspaceId);
      if (!id || !item.pinned || seen.has(id)) continue;
      seen.add(id);
      present.push(id);
    }
    for (const id of existing) {
      if (!seen.has(id)) present.push(id);
    }
    return persistIdList(WORKSPACE_TABS_SIDEBAR_PINNED_KEY, present);
  }

  function persistFolders() {
    storageSet(localStorage, WORKSPACE_TABS_SIDEBAR_FOLDERS_KEY, folders.length ? serializeFolders(folders) : "");
    return folders;
  }

  function persistSortMode(next) {
    sortMode = normalizeTabsSidebarSortMode(next);
    storageSet(localStorage, WORKSPACE_TABS_SIDEBAR_SORT_KEY, sortMode);
    return sortMode;
  }

  function dropPinnedId(item = {}) {
    const id = workspaceIdValue(item.workspaceId);
    if (!id) return;
    persistIdList(
      WORKSPACE_TABS_SIDEBAR_PINNED_KEY,
      readIdList(localStorage, WORKSPACE_TABS_SIDEBAR_PINNED_KEY).filter((value) => value !== id)
    );
  }

  function sameItem(left = {}, right = {}) {
    const leftId = workspaceIdValue(left.workspaceId);
    const rightId = workspaceIdValue(right.workspaceId);
    if (leftId && rightId) return leftId === rightId;
    const leftTab = positiveTabId(left.tabId);
    const rightTab = positiveTabId(right.tabId);
    return leftTab !== null && leftTab === rightTab;
  }

  function itemKey(item = {}) {
    const workspaceId = workspaceIdValue(item.workspaceId);
    if (workspaceId) return `w:${workspaceId}`;
    const tabId = positiveTabId(item.tabId);
    return tabId !== null ? `t:${tabId}` : "";
  }

  function folderKey(folder = {}) {
    const id = String(folder?.id || "").trim();
    return id ? `f:${id}` : "";
  }

  function isEditingItem(item = {}) {
    const key = itemKey(item);
    return Boolean(key) && key === editingKey;
  }

  function isEditingFolder(folder = {}) {
    const key = folderKey(folder);
    return Boolean(key) && key === editingKey;
  }

  function visibleItems() {
    const query = searchQuery.trim();
    if (!query) return items.map(overlayCurrentWorkspace);
    const fullTextIds = recordFullTextEnabled
      ? new Set(workspaceIdsMatchingFullText(fullTextStore, query))
      : new Set();
    return items.filter((item, index) => (
      itemMatchesTitleQuery(item, query, itemDisplayLabel(item, index))
      || fullTextIds.has(workspaceIdValue(item.workspaceId))
    )).map(overlayCurrentWorkspace);
  }

  function visibleFolders() {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return folders;
    const visibleIds = new Set(visibleItems().map((item) => item.workspaceId));
    return folders.filter((folder) => (
      String(folder.name || "").toLowerCase().includes(query)
      || folder.workspaceIds.some((id) => visibleIds.has(id))
    )).map((folder) => ({
      ...folder,
      collapsed: false,
      workspaceIds: folder.workspaceIds.filter((id) => visibleIds.has(id) || String(folder.name || "").toLowerCase().includes(query))
    }));
  }

  async function refreshSearchContext() {
    const query = searchQuery.trim();
    const run = Promise.all([
      loadRecordFullTextEnabled().catch(() => false),
      loadWorkspaceTabFullTextStore().catch(() => ({}))
    ]).then(([enabled, store]) => {
      recordFullTextEnabled = enabled === true;
      fullTextStore = store || {};
      return { enabled: recordFullTextEnabled, store: fullTextStore, query };
    });
    fullTextLoad = run;
    const result = await run;
    if (fullTextLoad === run && lastShell?.isConnected && result.query === searchQuery.trim()) {
      if (!searchComposing) syncSidebar(lastShell);
    }
    return result;
  }

  function overlayCurrentWorkspace(item = {}) {
    if (item?.current !== true || typeof currentWorkspace !== "function") return item;
    let current = null;
    try { current = currentWorkspace(); } catch { return item; }
    if (!current || typeof current !== "object") return item;
    const appIds = Array.isArray(current.appIds) && current.appIds.length
      ? current.appIds.map((id) => String(id || "").trim()).filter(Boolean)
      : appIdsFromGroups(current.groups);
    return {
      ...item,
      topicTitle: String(current.topicTitle || "").trim(),
      layoutName: String(current.layoutName || "").trim(),
      appIds: appIds.length ? appIds : item.appIds
    };
  }

  function itemDisplayLabel(item = {}, index = 0) {
    return itemLabel(overlayCurrentWorkspace(item), index);
  }

  function itemLabel(item = {}, index = 0) {
    const topicTitle = String(item.topicTitle || "").trim();
    if (topicTitle && !isGenericTopicTitle(topicTitle) && !isGenericWorkspaceTabName(topicTitle)) return topicTitle;
    if (item.current === true) return t("workspace.tabs.newTab");
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
    if (!item.live && title && !isGenericWorkspaceTabName(title)) return title;
    return t("workspace.tabs.untitled", { index: index + 1 });
  }

  function syncPageTitle() {
    if (typeof currentWorkspace !== "function" || !ownerDocument) return;
    let current = null;
    try { current = currentWorkspace(); }
    catch { current = null; }
    const label = itemLabel({
      current: true,
      layoutName: current?.layoutName || "",
      appIds: Array.isArray(current?.appIds) ? current.appIds : appIdsFromGroups(current?.groups),
      topicTitle: current?.topicTitle || "",
      title: ""
    }, 0);
    ownerDocument.title = isGenericWorkspaceTabName(label) ? "ChatClub" : label;
  }

  function applySidebarWidth(shell, sidebar) {
    const width = `${sidebarWidth}px`;
    if (sidebar?.style) sidebar.style.width = width;
    if (shell?.style?.setProperty) shell.style.setProperty("--workspace-tabs-sidebar-width", width);
    else if (shell?.style) shell.style["--workspace-tabs-sidebar-width"] = width;
    const handle = sidebar?.querySelector?.(".workspace-tabs-sidebar-resize");
    handle?.setAttribute?.("aria-valuenow", String(sidebarWidth));
  }

  function alignSidebar(shell, sidebar) {
    const grid = shell?.querySelector?.(".main-grid");
    if (!sidebar?.style || !grid) return;
    const top = Number(grid.offsetTop);
    sidebar.style.top = `${Number.isFinite(top) && top > 0 ? top : 51}px`;
    applySidebarWidth(shell, sidebar);
  }

  function extensionSurface(name) {
    try {
      const api = typeof extensionApi === "function" ? extensionApi() : extensionApi;
      return api?.[name] || null;
    } catch {
      return null;
    }
  }

  async function closeCurrentBrowserTab() {
    if (typeof closeCurrentTab === "function") {
      try { return await closeCurrentTab(); }
      catch { return { closed: false }; }
    }
    const tabs = extensionSurface("tabs");
    try {
      const tab = await tabs?.getCurrent?.();
      const tabId = positiveTabId(tab?.id);
      if (tabId !== null && typeof tabs?.remove === "function") {
        await tabs.remove(tabId);
        return { closed: true, tabId };
      }
    } catch {}
    try { ownerDocument?.defaultView?.close?.(); } catch {}
    try { globalThis.close?.(); } catch {}
    return { closed: false };
  }

  async function refresh() {
    const response = await requestBackground("listLiveWorkspaceTabs");
    setItems(response?.tabs);
    refreshSearchContext().catch(() => {});
    return currentItems();
  }

  function previewSearchWorkspace(item = {}) {
    const workspaceId = workspaceIdValue(item.workspaceId);
    if (!searchQuery.trim() || !workspaceId || typeof openWorkspaceHistory !== "function") return false;
    openWorkspaceHistory({
      workspaceId,
      topicTitle: String(item.topicTitle || "").trim() || itemDisplayLabel(item)
    });
    return true;
  }

  async function requestSidebarBackground(action, payload = {}, retries = 1) {
    try {
      return await requestBackground(action, payload);
    } catch (error) {
      if (retries > 0 && isPageClosingError(error)) {
        await new Promise((resolve) => { setTimeout(resolve, 80); });
        return requestSidebarBackground(action, payload, retries - 1);
      }
      throw error;
    }
  }

  function staleLiveTabError(error) {
    return isPageClosingError(error)
      || /not a live ChatClub page|tab id is invalid/i.test(String(error?.message || error || ""));
  }

  async function openWorkspaceFromSidebar(workspaceId) {
    try {
      return await requestSidebarBackground("openWorkspaceTab", { workspaceId });
    } catch (error) {
      toast(t("toast.workspaceTabOpenFailed"), "error");
      throw error;
    }
  }

  async function activateTab(item = {}) {
    const workspaceId = workspaceIdValue(item.workspaceId);
    if (!workspaceId) return { focused: false };
    const current = items.find((entry) => sameItem(entry, item)) || item;
    if (current.current) return { focused: true, tabId: current.tabId, current: true };
    if (current.live && current.tabId !== null) {
      try {
        return await requestSidebarBackground("focusWorkspaceTab", { tabId: current.tabId });
      } catch (error) {
        if (staleLiveTabError(error)) {
          try { await refresh(); } catch {}
          return openWorkspaceFromSidebar(workspaceId);
        }
        toast(t("toast.workspaceTabFocusFailed"), "error");
        throw error;
      }
    }
    return openWorkspaceFromSidebar(workspaceId);
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

  function itemFaviconSources(item = {}) {
    const ids = Array.isArray(item.appIds) ? item.appIds : [];
    return uniqueChatFaviconSources(ids, (appId) => {
      const app = typeof appById === "function" ? appById(appId) : { id: appId };
      const title = typeof inferAppName === "function"
        ? String(inferAppName(app) || "").trim() || appId
        : appId;
      return { app, appId, href: app?.url || "", title };
    });
  }

  function itemFavicons(item = {}) {
    return renderChatFaviconStack(itemFaviconSources(item), {
      appFaviconUrl,
      browserFaviconUrl,
      fallbackFaviconUrl,
      effectiveFaviconUrl,
      stackClass: "workspace-tabs-sidebar-item-favicons"
    });
  }

  async function saveTabToPocket(item = {}) {
    if (pocketBusy || typeof savePagesToPocket !== "function") return { saved: false, count: 0 };
    const workspaceId = workspaceIdValue(item.workspaceId);
    if (!workspaceId) return { saved: false, count: 0 };
    pocketBusy = true;
    try {
      let pages = pocketPagesFromWorkspaceFullText(fullTextStore, workspaceId);
      if (!pages.length && item.current === true && typeof collectLivePreview === "function") {
        pages = pocketPagesFromPreviewItems(await collectLivePreview());
      }
      if (!pages.length) {
        toast(t("toast.tabsPocketEmpty"), "error");
        return { saved: false, count: 0 };
      }
      return await savePagesToPocket(pages);
    } catch (error) {
      console.warn("[ChatClub] Failed to save ChatClub tab to Pocket", error);
      toast(t("toast.noValidPocketContent"), "error");
      return { saved: false, count: 0 };
    } finally {
      pocketBusy = false;
    }
  }

  function otherLiveTabIds() {
    return items
      .filter((item) => item.live && item.current !== true)
      .map((item) => positiveTabId(item.tabId))
      .filter((tabId) => tabId !== null);
  }

  async function closeOtherLiveTabs() {
    if (!otherLiveTabIds().length) return { closed: 0, tabIds: [] };
    try {
      const response = await requestBackground("closeOtherLiveWorkspaceTabs");
      await refresh();
      if (lastShell?.isConnected) syncSidebar(lastShell);
      return response;
    } catch (error) {
      toast(t("toast.workspaceTabCloseOthersFailed"), "error");
      throw error;
    }
  }

  function liveMoveIndex(list = items) {
    const indexes = list
      .filter((item) => item.live)
      .map((item) => item.index)
      .filter((index) => Number.isInteger(index) && index >= 0);
    return indexes.length ? Math.min(...indexes) : 0;
  }

  async function syncLiveWindowOrder(anchor = {}) {
    const live = items.filter((item) => item.live);
    const tabIds = live.map((item) => positiveTabId(item.tabId)).filter((tabId) => tabId !== null);
    if (!tabIds.length) return { moved: 0, tabIds: [] };
    const payload = { tabIds, index: liveMoveIndex(live) };
    const windowId = Number.isInteger(anchor.windowId)
      ? anchor.windowId
      : live.find((item) => Number.isInteger(item.windowId))?.windowId;
    if (Number.isInteger(windowId)) payload.windowId = windowId;
    try {
      return await requestBackground("moveLiveWorkspaceTabs", payload);
    } catch (error) {
      toast(t("toast.workspaceTabReorderFailed"), "error");
      throw error;
    }
  }

  function relayout(nextItems = items) {
    items = sortSidebarItems(nextItems, sortOptions());
    if (lastShell?.isConnected) syncSidebar(lastShell);
    return currentItems();
  }

  function moveTab(item = {}, target = {}, place = "before") {
    if (!item || !target) return currentItems();
    if (place === "out") {
      folders = removeTabFromFolder(folders, item.workspaceId);
      persistFolders();
      return relayout(items);
    }
    if (place === "into") {
      const folderId = String(target.id || target.folderId || "").trim();
      if (!folderId) return currentItems();
      folders = moveTabToFolder(folders, item.workspaceId, folderId);
      persistFolders();
      return relayout(items);
    }
    if (sameItem(item, target)) return currentItems();
    const sourceFolder = folderIdForItem(item, folders);
    const targetFolder = folderIdForItem(target, folders);
    if (sourceFolder !== targetFolder) {
      folders = targetFolder
        ? moveTabToFolder(folders, item.workspaceId, targetFolder, place, target.workspaceId)
        : removeTabFromFolder(folders, item.workspaceId);
      persistFolders();
      if (sortMode === "open" && !targetFolder && Boolean(item.live) === Boolean(target.live)) {
        const next = items.filter((entry) => !sameItem(entry, item));
        const targetIndex = next.findIndex((entry) => sameItem(entry, target));
        if (targetIndex >= 0) next.splice(place === "after" ? targetIndex + 1 : targetIndex, 0, item);
        if (!item.live) persistClosedOrder(next);
        return relayout(next);
      }
      return relayout(items);
    }
    if (sourceFolder) {
      folders = moveTabToFolder(folders, item.workspaceId, sourceFolder, place, target.workspaceId);
      persistFolders();
      return relayout(items);
    }
    if (sortMode !== "open") return currentItems();
    if (Boolean(item.live) !== Boolean(target.live)) return currentItems();
    if (Boolean(item.pinned) !== Boolean(target.pinned)) return currentItems();
    const next = items.filter((entry) => !sameItem(entry, item));
    const targetIndex = next.findIndex((entry) => sameItem(entry, target));
    if (targetIndex < 0) return currentItems();
    next.splice(place === "after" ? targetIndex + 1 : targetIndex, 0, item);
    if (!item.live) persistClosedOrder(next);
    if (item.pinned) persistPinnedFromItems(next);
    const ordered = relayout(next);
    if (item.live) syncLiveWindowOrder(item).catch(() => {});
    return ordered;
  }

  function moveFolderRow(folder = {}, target = {}, place = "before") {
    const folderId = String(folder?.id || "").trim();
    const targetId = String(target?.id || "").trim();
    if (!folderId || !targetId || folderId === targetId) return folders;
    folders = moveFolder(folders, folderId, targetId, place);
    persistFolders();
    if (lastShell?.isConnected) syncSidebar(lastShell);
    return folders;
  }

  function reorderPeers(item = {}, kind = "tab") {
    if (kind === "folder") return folders.slice();
    const sourceFolder = folderIdForItem(item, folders);
    return items.filter((entry) => {
      if (folderIdForItem(entry, folders) !== sourceFolder) return false;
      if (sourceFolder) return true;
      if (sortMode !== "open") return false;
      if (Boolean(entry.live) !== Boolean(item.live)) return false;
      if (Boolean(entry.pinned) !== Boolean(item.pinned)) return false;
      return true;
    });
  }

  function canMoveByDelta(item = {}, delta = 0, kind = "tab") {
    const peers = reorderPeers(item, kind);
    const id = kind === "folder" ? String(item?.id || "") : workspaceIdValue(item.workspaceId);
    const index = peers.findIndex((entry) => (
      kind === "folder"
        ? String(entry?.id || "") === id
        : workspaceIdValue(entry.workspaceId) === id
    ));
    const next = index + Number(delta);
    return index >= 0 && next >= 0 && next < peers.length;
  }

  function moveByDelta(item = {}, delta = 0, kind = "tab") {
    const peers = reorderPeers(item, kind);
    const id = kind === "folder" ? String(item?.id || "") : workspaceIdValue(item.workspaceId);
    const index = peers.findIndex((entry) => (
      kind === "folder"
        ? String(entry?.id || "") === id
        : workspaceIdValue(entry.workspaceId) === id
    ));
    const target = peers[index + Number(delta)];
    if (!target) return kind === "folder" ? folders : currentItems();
    const place = Number(delta) > 0 ? "after" : "before";
    return kind === "folder" ? moveFolderRow(item, target, place) : moveTab(item, target, place);
  }

  function clearItemDropMarks(sidebar) {
    const rows = [
      ...(sidebar?.querySelectorAll?.(".workspace-tabs-sidebar-item") || []),
      ...(sidebar?.querySelectorAll?.(".workspace-tabs-sidebar-folder") || []),
      ...(sidebar?.querySelectorAll?.(".workspace-tabs-sidebar-group") || []),
      ...(sidebar?.querySelectorAll?.(".workspace-tabs-sidebar-list") || [])
    ];
    for (const row of rows) {
      row.classList?.remove?.("drop-before", "drop-after", "drop-into");
    }
  }

  function closeSortMenu() {
    sortMenuCleanup?.();
    sortMenuCleanup = null;
    [".workspace-tabs-sidebar-sort-menu", ".workspace-tabs-sidebar-sort-backdrop"].forEach((selector) => {
      ownerDocument?.querySelectorAll?.(selector)?.forEach?.((node) => node.remove?.());
    });
    ownerDocument?.querySelectorAll?.(".workspace-tabs-sidebar-sort")
      ?.forEach?.((node) => node.setAttribute?.("aria-expanded", "false"));
  }

  function closeHoverMenu() {
    hover.closeHoverMenu();
    closeSortMenu();
  }

  function endItemDrag() {
    if (!itemDrag) return;
    const sidebar = lastShell?.querySelector?.(".workspace-tabs-sidebar");
    itemDrag.row?.classList?.remove?.("dragging");
    clearItemDropMarks(sidebar);
    lastShell?.classList?.remove?.("is-dragging-workspace-tabs-sidebar");
    ownerDocument?.removeEventListener?.("pointermove", onItemPointerMove, true);
    ownerDocument?.removeEventListener?.("pointerup", onItemPointerUp, true);
    ownerDocument?.removeEventListener?.("pointercancel", onItemPointerUp, true);
    itemDrag = null;
  }

  function dragIgnored(event) {
    const className = ` ${event?.target?.className || ""} `;
    return className.includes(" workspace-tabs-sidebar-item-actions ")
      || className.includes(" workspace-tabs-sidebar-item-edit ")
      || className.includes(" workspace-tabs-sidebar-item-delete ")
      || className.includes(" workspace-tabs-sidebar-item-pin ")
      || className.includes(" workspace-tabs-sidebar-item-more ")
      || className.includes(" workspace-tabs-sidebar-item-move-up ")
      || className.includes(" workspace-tabs-sidebar-item-move-down ")
      || className.includes(" workspace-tabs-sidebar-item-editor ")
      || className.includes(" workspace-tabs-sidebar-search-input ")
      || className.includes(" workspace-tabs-sidebar-folder-edit ")
      || className.includes(" workspace-tabs-sidebar-folder-delete ")
      || className.includes(" workspace-tabs-sidebar-folder-move-up ")
      || className.includes(" workspace-tabs-sidebar-folder-move-down ")
      || className.includes(" workspace-tabs-sidebar-folder-toggle ")
      || className.includes(" workspace-tabs-sidebar-sort ")
      || className.includes(" workspace-tabs-sidebar-new-folder ");
  }

  function onItemPointerMove(event) {
    if (!itemDrag) return;
    if (!itemDrag.active && Math.abs(Number(event?.clientY) - itemDrag.startY) < TAB_DRAG_START_DISTANCE) return;
    if (!itemDrag.active) {
      itemDrag.active = true;
      closeHoverMenu();
      itemDrag.row?.classList?.add?.("dragging");
      lastShell?.classList?.add?.("is-dragging-workspace-tabs-sidebar");
    }
    event?.preventDefault?.();
    const sidebar = lastShell?.querySelector?.(".workspace-tabs-sidebar");
    clearItemDropMarks(sidebar);
    itemDrag.target = null;
    itemDrag.place = "before";
    itemDrag.targetKind = "";
    const y = Number(event?.clientY);
    const foldersRows = [...(sidebar?.querySelectorAll?.(".workspace-tabs-sidebar-folder") || [])];
    for (const row of foldersRows) {
      if (row === itemDrag.row) continue;
      const rect = row.getBoundingClientRect?.();
      if (!rect || y < rect.top || y > rect.bottom) continue;
      const folder = folders.find((entry) => entry.id === row.dataset?.folderId);
      if (!folder) continue;
      if (itemDrag.kind === "folder") {
        itemDrag.target = folder;
        itemDrag.targetKind = "folder";
        itemDrag.place = y < rect.top + rect.height / 2 ? "before" : "after";
        row.classList?.add?.(itemDrag.place === "before" ? "drop-before" : "drop-after");
      } else {
        itemDrag.target = folder;
        itemDrag.targetKind = "folder";
        itemDrag.place = "into";
        row.classList?.add?.("drop-into");
      }
      return;
    }
    if (itemDrag.kind === "folder") return;
    const rows = [...(sidebar?.querySelectorAll?.(".workspace-tabs-sidebar-item") || [])];
    for (const row of rows) {
      if (row === itemDrag.row) continue;
      const rect = row.getBoundingClientRect?.();
      if (!rect || y < rect.top || y > rect.bottom) continue;
      const target = items.find((entry) => workspaceIdValue(entry.workspaceId) === workspaceIdValue(row.dataset?.workspaceId));
      if (!target) continue;
      itemDrag.target = target;
      itemDrag.targetKind = "tab";
      itemDrag.place = y < rect.top + rect.height / 2 ? "before" : "after";
      row.classList?.add?.(itemDrag.place === "before" ? "drop-before" : "drop-after");
      return;
    }
    const groups = [...(sidebar?.querySelectorAll?.(".workspace-tabs-sidebar-group") || [])];
    for (const row of groups) {
      const rect = row.getBoundingClientRect?.();
      if (!rect || y < rect.top || y > rect.bottom) continue;
      itemDrag.target = { id: "root" };
      itemDrag.targetKind = "root";
      itemDrag.place = "out";
      row.classList?.add?.("drop-into");
      return;
    }
    const list = sidebar?.querySelector?.(".workspace-tabs-sidebar-list");
    const listRect = list?.getBoundingClientRect?.();
    if (listRect && y >= listRect.top && y <= listRect.bottom && folderIdForItem(itemDrag.item, folders)) {
      itemDrag.target = { id: "root" };
      itemDrag.targetKind = "root";
      itemDrag.place = "out";
      list.classList?.add?.("drop-into");
    }
  }

  function onItemPointerUp() {
    const drag = itemDrag;
    endItemDrag();
    if (!drag?.active || !drag.target) return;
    suppressActivate = true;
    if (drag.kind === "folder") moveFolderRow(drag.item, drag.target, drag.place);
    else moveTab(drag.item, drag.target, drag.place);
  }

  function bindItemDrag(row, item, kind = "tab") {
    if (!row?.addEventListener) return;
    row.addEventListener("pointerdown", (event) => {
      if (event?.button != null && event.button !== 0) return;
      if (dragIgnored(event) || searchQuery.trim()) return;
      if (kind === "tab" && isEditingItem(item)) return;
      if (kind === "folder" && isEditingFolder(item)) return;
      itemDrag = {
        kind,
        item,
        row,
        startY: Number(event?.clientY) || 0,
        active: false,
        target: null,
        targetKind: "",
        place: "before"
      };
      ownerDocument?.addEventListener?.("pointermove", onItemPointerMove, true);
      ownerDocument?.addEventListener?.("pointerup", onItemPointerUp, true);
      ownerDocument?.addEventListener?.("pointercancel", onItemPointerUp, true);
    });
  }

  function itemSectionIndex(item = {}) {
    const group = visibleItems();
    return Math.max(0, group.findIndex((entry) => sameItem(entry, item)));
  }

  function togglePin(item = {}) {
    const id = workspaceIdValue(item.workspaceId);
    if (!id) return currentItems();
    const ids = readIdList(localStorage, WORKSPACE_TABS_SIDEBAR_PINNED_KEY);
    const index = ids.indexOf(id);
    if (index >= 0) ids.splice(index, 1);
    else ids.unshift(id);
    persistIdList(WORKSPACE_TABS_SIDEBAR_PINNED_KEY, ids);
    const moved = relayout(items);
    const next = moved.find((entry) => sameItem(entry, item));
    if (next?.live) syncLiveWindowOrder(next).catch(() => {});
    return moved;
  }

  function dropForgottenItem(item = {}) {
    const tabId = positiveTabId(item.tabId);
    dropPinnedId(item);
    folders = removeTabFromFolder(folders, item.workspaceId);
    persistFolders();
    setItems(items.filter((entry) => !sameItem(entry, item) && (tabId === null || entry.tabId !== tabId)));
  }

  async function forgetTab(item = {}) {
    const workspaceId = workspaceIdValue(item.workspaceId);
    const tabId = positiveTabId(item.tabId);
    const isCurrent = item.current === true;
    if (!workspaceId && tabId === null && !isCurrent) return { forgotten: false };
    let response = { forgotten: false, closed: false, workspaceId };
    let forgetError = null;
    try {
      if (workspaceId) {
        const payload = { workspaceId };
        if (tabId !== null) payload.tabId = tabId;
        response = await requestBackground("forgetRememberedWorkspaceTab", payload);
      }
    } catch (error) {
      if (isPageClosingError(error)) {
        response = { forgotten: true, closed: true, workspaceId, tabId };
      } else {
        forgetError = error;
      }
    }
    dropForgottenItem(item);
    if (workspaceId) {
      fullTextStore = { ...fullTextStore };
      delete fullTextStore[workspaceId];
      forgetWorkspaceTabFullText(workspaceId).catch(() => {});
    }
    if (isCurrent) {
      const closed = await closeCurrentBrowserTab();
      if (closed?.closed || isPageClosingError(forgetError)) {
        return { forgotten: true, closed: true, workspaceId, tabId };
      }
    }
    if (lastShell?.isConnected) syncSidebar(lastShell);
    if (forgetError) {
      toast(t("toast.workspaceTabDeleteFailed"), "error");
      throw forgetError;
    }
    if (isCurrent) {
      toast(t("toast.workspaceTabDeleteFailed"), "error");
      throw new Error("Unable to close the current ChatClub tab");
    }
    return response;
  }

  function stopTitleEditor() {
    editingKey = "";
    editingDraft = "";
  }

  function focusTitleEditor(root) {
    const field = root?.querySelector?.(".workspace-tabs-sidebar-item-editor");
    try { field?.focus?.(); } catch {}
    try { field?.select?.(); } catch {}
  }

  function focusSearchField(root) {
    const field = root?.querySelector?.(".workspace-tabs-sidebar-search-input");
    if (!field) return;
    try { field.focus?.(); } catch {}
    try { field.setSelectionRange?.(searchSelection.start, searchSelection.end); } catch {}
  }

  function renderTitleEditor(item = {}, index = 0, kind = "tab") {
    const initial = editingDraft || (kind === "folder" ? (item.name || t("workspace.tabs.folderUntitled")) : itemDisplayLabel(item, index));
    const titleInput = input(initial, {
      class: "input workspace-tabs-sidebar-item-editor",
      type: "text",
      placeholder: kind === "folder" ? t("workspace.tabs.folderName") : t("workspace.tabs.editPlaceholder"),
      "aria-label": kind === "folder" ? t("workspace.tabs.renameFolder") : t("workspace.tabs.edit")
    });
    titleInput.value = initial;
    const commit = () => {
      const value = titleInput.value;
      stopTitleEditor();
      if (kind === "folder") saveFolderTitle(item, value);
      else saveTabTitle(item, value).catch(() => {});
    };
    const cancel = () => {
      stopTitleEditor();
      if (lastShell?.isConnected) syncSidebar(lastShell);
    };
    titleInput.addEventListener("input", () => {
      editingDraft = String(titleInput.value || "");
    });
    titleInput.addEventListener("keydown", (event) => {
      if (event?.key === "Enter" && !event?.isComposing && event?.keyCode !== 229) {
        event.preventDefault?.();
        event.stopPropagation?.();
        commit();
      } else if (isDismissalEscape(event)) {
        event.preventDefault?.();
        event.stopPropagation?.();
        cancel();
      }
    });
    return el("div", {
      class: `workspace-tabs-sidebar-item is-editing${kind === "folder" ? " is-folder" : ""}`,
      role: "listitem"
    },
      titleInput,
      iconButton(
        t("common.cancel"),
        createIcon("x"),
        (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          cancel();
        },
        "workspace-tabs-sidebar-item-edit-cancel",
        t("common.cancel"),
        "",
        "common.cancel"
      ),
      iconButton(
        t("common.save"),
        createIcon("check"),
        (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          commit();
        },
        "workspace-tabs-sidebar-item-edit-save",
        t("common.save"),
        "",
        "common.save"
      )
    );
  }

  function startTitleEditor(item = {}, row = null) {
    const key = itemKey(item);
    if (!key) return null;
    const index = itemSectionIndex(item);
    editingKey = key;
    editingDraft = itemDisplayLabel(item, index);
    const editor = renderTitleEditor(item, index, "tab");
    if (row?.replaceWith) row.replaceWith(editor);
    else if (lastShell?.isConnected) syncSidebar(lastShell);
    focusTitleEditor(editor);
    return editor;
  }

  function startFolderEditor(folder = {}, row = null) {
    const key = folderKey(folder);
    if (!key) return null;
    editingKey = key;
    editingDraft = folder.name || t("workspace.tabs.folderUntitled");
    const editor = renderTitleEditor(folder, 0, "folder");
    if (row?.replaceWith) row.replaceWith(editor);
    else if (lastShell?.isConnected) syncSidebar(lastShell);
    focusTitleEditor(editor);
    return editor;
  }

  function saveFolderTitle(folder, name) {
    folders = renameFolder(folders, folder.id, name, t("workspace.tabs.folderUntitled"));
    persistFolders();
    if (lastShell?.isConnected) syncSidebar(lastShell);
    return folders;
  }

  function openTitleEditor(item = {}) {
    return startTitleEditor(item);
  }

  function openDeleteConfirmation(item = {}, kind = "tab") {
    const folder = kind === "folder";
    const label = folder ? (item.name || t("workspace.tabs.folderUntitled")) : itemDisplayLabel(item, itemSectionIndex(item));
    return openConfirmationAction({
      title: folder ? t("workspace.tabs.deleteFolderTitle", { title: label }) : t("workspace.tabs.deleteTitle", { title: label }),
      body: folder ? t("workspace.tabs.deleteFolderConfirm") : t("workspace.tabs.deleteConfirm"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      closeLabel: t("common.close"),
      tone: "neutral",
      onConfirm: async () => {
        if (folder) {
          folders = deleteFolder(folders, item.id);
          persistFolders();
          relayout(items);
          return;
        }
        await forgetTab(item);
      }
    });
  }

  function setSortMode(next) {
    persistSortMode(next);
    closeSortMenu();
    return relayout(items);
  }

  function addFolder(name = "") {
    folders = createFolder(folders, name || t("workspace.tabs.folderUntitled"));
    persistFolders();
    const created = folders[folders.length - 1];
    if (lastShell?.isConnected) {
      syncSidebar(lastShell);
      if (created) startFolderEditor(created);
    }
    return folders;
  }

  function openSortMenu(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const anchor = event.currentTarget;
    if (anchor?.getAttribute?.("aria-expanded") === "true") {
      closeSortMenu();
      return;
    }
    closeHoverMenu();
    anchor?.setAttribute?.("aria-expanded", "true");
    const rect = anchor.getBoundingClientRect?.() || { bottom: 0, right: 0 };
    const view = ownerDocument.defaultView || globalThis;
    const backdrop = el("div", {
      class: "popover-backdrop workspace-tabs-sidebar-sort-backdrop",
      onpointerdown: (pointerEvent) => {
        pointerEvent.preventDefault();
        closeSortMenu();
      }
    });
    const menu = el("div", {
      class: "popover-menu overlay-surface workspace-tabs-sidebar-sort-menu",
      role: "menu", "aria-label": t("workspace.tabs.sort"),
      style: {
        top: `${Number(rect.bottom) + 5}px`,
        left: `${Math.max(8, Number(rect.left || 0))}px`
      },
      onpointerdown: (pointerEvent) => pointerEvent.stopPropagation()
    }, TABS_SIDEBAR_SORT_MODES.map((mode) => createMenuButton({
      label: t(TABS_SIDEBAR_SORT_LABEL_KEYS[mode]),
      icon: mode === sortMode ? createIcon("check") : el("span", { class: "workspace-tabs-sidebar-sort-spacer" }),
      onClick: () => setSortMode(mode),
      tooltipId: TABS_SIDEBAR_SORT_LABEL_KEYS[mode]
    })));
    (ownerDocument.body || ownerDocument.documentElement)?.append?.(backdrop, menu);
    bindLinearMenuKeyboard(menu, { dismiss: closeSortMenu, trigger: anchor });
    const onOutside = (pointerEvent) => {
      const target = pointerEvent.target;
      if (menu.contains?.(target) || anchor.contains?.(target) || anchor === target) return;
      closeSortMenu();
    };
    const onKeydown = (keyEvent) => {
      if (!claimTopmostPopoverEscape(keyEvent, ".workspace-tabs-sidebar-sort-menu")) return;
      closeSortMenu();
    };
    ownerDocument.addEventListener?.("pointerdown", onOutside, true);
    ownerDocument.addEventListener?.("keydown", onKeydown, true);
    view.addEventListener?.("resize", closeSortMenu, true);
    sortMenuCleanup = () => {
      ownerDocument.removeEventListener?.("pointerdown", onOutside, true);
      ownerDocument.removeEventListener?.("keydown", onKeydown, true);
      view.removeEventListener?.("resize", closeSortMenu, true);
    };
  }

  function renderSidebarHeader() {
    const closeOthers = iconButton(
      t("workspace.tabs.closeOthers"),
      createIcon("copyMinus"),
      (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        closeOtherLiveTabs().catch(() => {});
      },
      "workspace-tabs-sidebar-cleanup",
      t("workspace.tabs.closeOthers"),
      "",
      "workspace.tabs.closeOthers"
    );
    if (!otherLiveTabIds().length) {
      closeOthers.disabled = true;
      closeOthers.setAttribute?.("disabled", "");
    }
    const newFolder = iconButton(
      t("workspace.tabs.newFolder"),
      createIcon("folderPlus"),
      (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        addFolder();
      },
      "workspace-tabs-sidebar-new-folder",
      t("workspace.tabs.newFolder"),
      "",
      "workspace.tabs.newFolder"
    );
    const sortButton = iconButton(
      t("workspace.tabs.sort"),
      createIcon("arrowUpDown"),
      openSortMenu,
      "workspace-tabs-sidebar-sort",
      t(TABS_SIDEBAR_SORT_LABEL_KEYS[sortMode]),
      "",
      "workspace.tabs.sort"
    );
    sortButton.setAttribute?.("aria-haspopup", "menu");
    sortButton.setAttribute?.("aria-expanded", "false");
    return el("header", { class: "workspace-tabs-sidebar-header" },
      el("span", {
        class: "workspace-tabs-sidebar-count",
        "aria-label": t("workspace.tabs.count", { count: items.length })
      }, String(items.length)),
      el("h2", { class: "workspace-tabs-sidebar-title" }, t("workspace.tabs.title")),
      el("div", { class: "workspace-tabs-sidebar-header-actions" }, newFolder, sortButton, closeOthers)
    );
  }

  function renderSidebarItem(item, index, nested = false) {
    if (isEditingItem(item)) return renderTitleEditor(item, index, "tab");
    const { actionCount, actionNodes, rowRef } = hover.renderItemActions(item);
    return renderTabsSidebarItem({
      item,
      index,
      label: itemDisplayLabel(item, index),
      favicons: itemFavicons(overlayCurrentWorkspace(item)),
      createIcon,
      suppressActivate: () => {
        if (!suppressActivate) return false;
        suppressActivate = false;
        return true;
      },
      activateTab: (item) => previewSearchWorkspace(item) ? Promise.resolve() : activateTab(item),
      bindItemDrag,
      actionCount,
      actionNodes,
      rowRef,
      nested
    });
  }

  function renderFolderNode(node) {
    const nodes = [];
    if (isEditingFolder(node.folder)) {
      nodes.push(renderTitleEditor(node.folder, 0, "folder"));
      return nodes;
    }
    nodes.push(renderTabsSidebarFolder({
      folder: node.folder,
      count: node.items.length,
      createIcon,
      onToggle: (folder) => {
        folders = toggleFolderCollapsed(folders, folder.id);
        persistFolders();
        if (lastShell?.isConnected) syncSidebar(lastShell);
      },
      onRename: (folder, row) => startFolderEditor(folder, row),
      onDelete: (folder) => openDeleteConfirmation(folder, "folder"),
      canMove: (folder, delta) => canMoveByDelta(folder, delta, "folder"),
      onMove: (folder, delta) => moveByDelta(folder, delta, "folder"),
      bindItemDrag
    }));
    if (!node.folder.collapsed) {
      node.items.forEach((item, index) => nodes.push(renderSidebarItem(item, index, true)));
    }
    return nodes;
  }

  function renderSidebarList() {
    const tree = buildSidebarTree({
      items: visibleItems(),
      folders: visibleFolders(),
      ...sortOptions()
    });
    const nodes = [];
    for (const node of tree) {
      if (node.type === "folder") nodes.push(...renderFolderNode(node));
      else if (node.type === "group") {
        nodes.push(renderTabsSidebarGroup(node.labelKey));
        node.items.forEach((item, index) => nodes.push(renderSidebarItem(item, index)));
      } else if (node.type === "divider") nodes.push(renderTabsSidebarDivider(node.labelKey));
      else if (node.type === "items") node.items.forEach((item, index) => nodes.push(renderSidebarItem(item, index)));
    }
    if (!nodes.length) {
      return el("div", { class: "workspace-tabs-sidebar-empty" },
        searchQuery.trim() ? t("workspace.tabs.searchEmpty") : t("workspace.tabs.empty")
      );
    }
    return el("div", { class: "workspace-tabs-sidebar-list", role: "list" }, nodes);
  }

  function setSearchQuery(next) {
    searchComposing = false;
    searchQuery = String(next || "");
    if (lastShell?.isConnected) syncSidebar(lastShell);
    if (searchQuery.trim()) refreshSearchContext().catch(() => {});
  }

  function applySearchInput(value, composing) {
    searchQuery = String(value || "");
    const field = lastShell?.querySelector?.(".workspace-tabs-sidebar-search-input");
    searchSelection = {
      start: Number(field?.selectionStart) || searchQuery.length,
      end: Number(field?.selectionEnd) || searchQuery.length
    };
    if (composing || searchComposing) return;
    if (lastShell?.isConnected) syncSidebar(lastShell);
    refreshSearchContext().catch(() => {});
  }

  function renderSearchBar() {
    return renderWorkspaceTabSearchField({
      query: searchQuery,
      fullTextEnabled: recordFullTextEnabled,
      onInput: (value, event) => applySearchInput(value, Boolean(event?.isComposing)),
      onCompositionStart: () => { searchComposing = true; },
      onCompositionEnd: (value) => {
        searchComposing = false;
        applySearchInput(value, false);
      },
      onFocus: () => { searchFocused = true; },
      onBlur: () => { searchFocused = false; }
    });
  }

  function renderSidebar() {
    if (!open) return null;
    const query = searchQuery.trim();
    const hits = query
      ? renderWorkspaceTabSearchHits({
        query,
        store: fullTextStore,
        items,
        fullTextEnabled: recordFullTextEnabled,
        onActivate: (hit) => {
          if (previewSearchWorkspace(hit)) return;
          const item = items.find((entry) => workspaceIdValue(entry.workspaceId) === workspaceIdValue(hit.workspaceId));
          if (item) activateTab(item).catch(() => {});
        }
      })
      : null;
    return el("aside", {
      id: WORKSPACE_TABS_SIDEBAR_ID,
      class: "workspace-tabs-sidebar",
      "aria-label": t("workspace.tabs.title"),
      style: { width: `${sidebarWidth}px` }
    },
    renderSidebarHeader(),
    renderSearchBar(),
    items.length || query || folders.length
      ? renderSidebarList()
      : el("div", { class: "workspace-tabs-sidebar-empty" }, t("workspace.tabs.empty")),
    hits,
    el("div", {
      class: "workspace-tabs-sidebar-resize",
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": t("workspace.tabs.resize"),
      "aria-valuemin": String(SIDEBAR_WIDTH_MIN),
      "aria-valuemax": String(SIDEBAR_WIDTH_MAX),
      "aria-valuenow": String(sidebarWidth)
    }));
  }

  function endResize() {
    if (!resizeDrag) return;
    persistWidth(sidebarWidth);
    resizeDrag = null;
    lastShell?.classList?.remove?.("is-resizing-workspace-tabs-sidebar");
    ownerDocument?.removeEventListener?.("pointermove", onResizePointerMove, true);
    ownerDocument?.removeEventListener?.("pointerup", onResizePointerUp, true);
    ownerDocument?.removeEventListener?.("pointercancel", onResizePointerUp, true);
  }

  function onResizePointerMove(event) {
    if (!resizeDrag) return;
    event?.preventDefault?.();
    sidebarWidth = clampSidebarWidth(resizeDrag.startWidth + (Number(event?.clientX) - resizeDrag.startX));
    const sidebar = lastShell?.querySelector?.(".workspace-tabs-sidebar");
    applySidebarWidth(lastShell, sidebar);
  }

  function onResizePointerUp() {
    endResize();
  }

  function bindResizeHandle(sidebar) {
    const handle = sidebar?.querySelector?.(".workspace-tabs-sidebar-resize");
    if (!handle?.addEventListener) return;
    handle.addEventListener("pointerdown", (event) => {
      if (event?.button != null && event.button !== 0) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      resizeDrag = {
        startX: Number(event?.clientX) || 0,
        startWidth: sidebarWidth
      };
      lastShell?.classList?.add?.("is-resizing-workspace-tabs-sidebar");
      ownerDocument?.addEventListener?.("pointermove", onResizePointerMove, true);
      ownerDocument?.addEventListener?.("pointerup", onResizePointerUp, true);
      ownerDocument?.addEventListener?.("pointercancel", onResizePointerUp, true);
      handle.setPointerCapture?.(event.pointerId);
    });
  }

  function refreshAndSync() {
    if (itemDrag) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = 0;
      refresh().then(() => {
        if (lastShell?.isConnected) syncSidebar(lastShell);
      }).catch(() => {});
    }, 80);
  }

  function onWorkspaceSessionChanged(changes, areaName) {
    if (areaName && areaName !== "local") return;
    const keys = changes && typeof changes === "object" ? Object.keys(changes) : [];
    if (keys.includes("workspaceTabFullText") || keys.includes("options")) {
      refreshSearchContext().catch(() => {});
    }
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
    listenChrome(tabs?.onMoved);
    listenChrome(tabs?.onAttached);
    listenChrome(tabs?.onDetached);
    listenChrome(tabs?.onActivated);
    listenChrome(extensionSurface("storage")?.onChanged, onWorkspaceSessionChanged);
    if (ownerDocument?.addEventListener) {
      ownerDocument.addEventListener("visibilitychange", refreshAndSync);
      tabUnsubscribers.push(() => ownerDocument.removeEventListener("visibilitychange", refreshAndSync));
    }
  }

  function onEscapeKeydown(event) {
    if (claimTopmostPopoverEscape(event, ".workspace-tabs-sidebar-hover-menu")) {
      hover.closeHoverMenu();
      return;
    }
    if (claimTopmostPopoverEscape(event, ".workspace-tabs-sidebar-sort-menu")) {
      closeSortMenu();
      return;
    }
    if (!open || !isDismissalEscape(event)) return;
    if (editingKey) {
      event.preventDefault?.();
      event.stopPropagation?.();
      stopTitleEditor();
      if (lastShell?.isConnected) syncSidebar(lastShell);
      return;
    }
    if (searchQuery) {
      event.preventDefault?.();
      event.stopPropagation?.();
      searchComposing = false;
      searchQuery = "";
      if (lastShell?.isConnected) syncSidebar(lastShell);
      return;
    }
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
    closeHoverMenu();
    syncPageTitle();
    if (!shell?.isConnected) return null;
    lastShell = shell;
    if (searchComposing) return shell.querySelector(".workspace-tabs-sidebar");
    const existing = shell.querySelector(".workspace-tabs-sidebar");
    const next = renderSidebar();
    shell.classList.toggle("has-workspace-tabs-sidebar", Boolean(next));
    if (!next) {
      endResize();
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
    bindResizeHandle(next);
    syncTabListeners(true);
    syncEscapeListener();
    if (editingKey) focusTitleEditor(next);
    else if (searchFocused || searchQuery) focusSearchField(next);
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

  function openSearch() {
    searchFocused = true;
    if (!open) return setOpen(true);
    if (lastShell?.isConnected) {
      focusSearchField(lastShell);
      return open;
    }
    render();
    return open;
  }

  function close() {
    if (!open) return false;
    stopTitleEditor();
    searchComposing = false;
    searchQuery = "";
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
    closeOtherLiveTabs,
    forgetTab,
    saveTabToPocket,
    openTitleEditor,
    openDeleteConfirmation,
    moveTab,
    moveByDelta,
    moveFolderRow,
    togglePin,
    setSearchQuery,
    setSortMode,
    addFolder,
    currentFolders: () => folders.slice(),
    currentSortMode: () => sortMode,
    toggle,
    openSearch,
    close,
    setOpen,
    renderSidebar,
    syncSidebar,
    itemLabel,
    sidebarWidth: () => sidebarWidth
  });
}
