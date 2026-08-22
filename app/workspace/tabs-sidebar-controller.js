import { t } from "../../shared/i18n.js";
import { isGenericTopicTitle, sanitizeTopicTitle } from "../../shared/topic-title.js";
import { workspaceSessionWorkspaceId } from "../../shared/workspace-session.js";
import {
  button,
  confirmationModal as defaultConfirmationModal,
  el,
  iconButton,
  input,
  isDismissalEscape
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

const WORKSPACE_TABS_SIDEBAR_ID = "workspace-tabs-sidebar";
const WORKSPACE_TABS_SIDEBAR_OPEN_KEY = "chatclubWorkspaceTabsSidebarOpenV1";
const WORKSPACE_TABS_SIDEBAR_WIDTH_KEY = "chatclubWorkspaceTabsSidebarWidthV1";
const WORKSPACE_TABS_SIDEBAR_CLOSED_ORDER_KEY = "chatclubWorkspaceTabsClosedOrderV1";
const WORKSPACE_TABS_SIDEBAR_PINNED_KEY = "chatclubWorkspaceTabsPinnedV1";
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

function workspaceIdValue(value) {
  return String(value || "").trim();
}

function readIdList(storage, key) {
  try {
    const raw = JSON.parse(storageGet(storage, key) || "[]");
    return Array.isArray(raw) ? raw.map((value) => workspaceIdValue(value)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function applyClosedOrder(list = [], order = []) {
  if (!order.length) return list;
  const rank = new Map(order.map((id, index) => [id, index]));
  const live = [];
  const closed = [];
  for (const item of list) {
    if (item.live) live.push(item);
    else closed.push(item);
  }
  closed.sort((left, right) => {
    const leftRank = rank.has(left.workspaceId) ? rank.get(left.workspaceId) : Number.MAX_SAFE_INTEGER;
    const rightRank = rank.has(right.workspaceId) ? rank.get(right.workspaceId) : Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
  return [...live, ...closed];
}

function applyPinnedOrder(list = [], order = []) {
  const rank = new Map(order.map((id, index) => [id, index]));
  const live = [];
  const closed = [];
  for (const item of list) {
    if (item.live) live.push(item);
    else closed.push(item);
  }
  const split = (group) => {
    const pinned = [];
    const rest = [];
    for (const item of group) {
      const id = workspaceIdValue(item.workspaceId);
      if (id && rank.has(id)) pinned.push({ ...item, pinned: true });
      else rest.push({ ...item, pinned: false });
    }
    pinned.sort((left, right) => rank.get(left.workspaceId) - rank.get(right.workspaceId));
    return [...pinned, ...rest];
  };
  return [...split(live), ...split(closed)];
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
  localStorage = globalThis.localStorage,
  extensionApi,
  closeCurrentTab,
  canDismiss,
  document: ownerDocument = globalThis.document,
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
  let sidebarWidth = readSidebarWidth(localStorage);
  let items = [];
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
  let recordFullTextEnabled = false;
  let fullTextStore = {};
  let fullTextLoad = null;

  function currentItems() {
    return items.slice();
  }

  function setItems(next = []) {
    items = applyPinnedOrder(
      applyClosedOrder(normalizeItems(next), readIdList(localStorage, WORKSPACE_TABS_SIDEBAR_CLOSED_ORDER_KEY)),
      readIdList(localStorage, WORKSPACE_TABS_SIDEBAR_PINNED_KEY)
    );
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

  function isEditingItem(item = {}) {
    const key = itemKey(item);
    return Boolean(key) && key === editingKey;
  }

  function visibleItems() {
    const query = searchQuery.trim();
    if (!query) return items;
    const fullTextIds = recordFullTextEnabled
      ? new Set(workspaceIdsMatchingFullText(fullTextStore, query))
      : new Set();
    return items.filter((item, index) => (
      itemMatchesTitleQuery(item, query, itemLabel(item, index))
      || fullTextIds.has(workspaceIdValue(item.workspaceId))
    ));
  }

  function partitionedItems() {
    const live = [];
    const closed = [];
    for (const item of visibleItems()) {
      if (item.live) live.push(item);
      else closed.push(item);
    }
    return { live, closed };
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
      syncSidebar(lastShell);
    }
    return result;
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

  function moveTab(item = {}, target = {}, place = "before") {
    if (!item || !target || sameItem(item, target)) return currentItems();
    if (Boolean(item.live) !== Boolean(target.live)) return currentItems();
    if (Boolean(item.pinned) !== Boolean(target.pinned)) return currentItems();
    const next = items.filter((entry) => !sameItem(entry, item));
    const targetIndex = next.findIndex((entry) => sameItem(entry, target));
    if (targetIndex < 0) return currentItems();
    next.splice(place === "after" ? targetIndex + 1 : targetIndex, 0, item);
    if (!item.live) persistClosedOrder(next);
    if (item.pinned) persistPinnedFromItems(next);
    items = applyPinnedOrder(
      applyClosedOrder(next, readIdList(localStorage, WORKSPACE_TABS_SIDEBAR_CLOSED_ORDER_KEY)),
      readIdList(localStorage, WORKSPACE_TABS_SIDEBAR_PINNED_KEY)
    );
    if (lastShell?.isConnected) syncSidebar(lastShell);
    if (item.live) syncLiveWindowOrder(item).catch(() => {});
    return currentItems();
  }

  function clearItemDropMarks(sidebar) {
    const rows = sidebar?.querySelectorAll?.(".workspace-tabs-sidebar-item") || [];
    for (const row of rows) {
      row.classList?.remove?.("drop-before", "drop-after");
    }
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
      || className.includes(" workspace-tabs-sidebar-item-editor ")
      || className.includes(" workspace-tabs-sidebar-search-input ");
  }

  function onItemPointerMove(event) {
    if (!itemDrag) return;
    if (!itemDrag.active && Math.abs(Number(event?.clientY) - itemDrag.startY) < TAB_DRAG_START_DISTANCE) return;
    if (!itemDrag.active) {
      itemDrag.active = true;
      itemDrag.row?.classList?.add?.("dragging");
      lastShell?.classList?.add?.("is-dragging-workspace-tabs-sidebar");
    }
    event?.preventDefault?.();
    const sidebar = lastShell?.querySelector?.(".workspace-tabs-sidebar");
    const rows = [...(sidebar?.querySelectorAll?.(".workspace-tabs-sidebar-item") || [])];
    clearItemDropMarks(sidebar);
    itemDrag.target = null;
    itemDrag.place = "before";
    for (const row of rows) {
      if (row === itemDrag.row) continue;
      const rect = row.getBoundingClientRect?.();
      if (!rect) continue;
      const y = Number(event?.clientY);
      if (y < rect.top || y > rect.bottom) continue;
      const target = items.find((entry) => itemKey(entry) === row.dataset?.workspaceId
        || workspaceIdValue(entry.workspaceId) === workspaceIdValue(row.dataset?.workspaceId));
      if (!target) continue;
      if (Boolean(target.live) !== Boolean(itemDrag.item.live)) continue;
      if (Boolean(target.pinned) !== Boolean(itemDrag.item.pinned)) continue;
      itemDrag.target = target;
      itemDrag.place = y < rect.top + rect.height / 2 ? "before" : "after";
      row.classList?.add?.(itemDrag.place === "before" ? "drop-before" : "drop-after");
      break;
    }
  }

  function onItemPointerUp() {
    const drag = itemDrag;
    endItemDrag();
    if (!drag?.active || !drag.target) return;
    suppressActivate = true;
    moveTab(drag.item, drag.target, drag.place);
  }

  function bindItemDrag(row, item) {
    if (!row?.addEventListener) return;
    row.addEventListener("pointerdown", (event) => {
      if (event?.button != null && event.button !== 0) return;
      if (dragIgnored(event) || isEditingItem(item) || searchQuery.trim()) return;
      itemDrag = {
        item,
        row,
        startY: Number(event?.clientY) || 0,
        active: false,
        target: null,
        place: "before"
      };
      ownerDocument?.addEventListener?.("pointermove", onItemPointerMove, true);
      ownerDocument?.addEventListener?.("pointerup", onItemPointerUp, true);
      ownerDocument?.addEventListener?.("pointercancel", onItemPointerUp, true);
    });
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
    return el("header", { class: "workspace-tabs-sidebar-header" },
      el("span", {
        class: "workspace-tabs-sidebar-count",
        "aria-label": t("workspace.tabs.count", { count: items.length })
      }, String(items.length)),
      el("h2", { class: "workspace-tabs-sidebar-title" }, t("workspace.tabs.title")),
      closeOthers
    );
  }

  function itemSectionIndex(item = {}) {
    const { live, closed } = partitionedItems();
    const group = item.live ? live : closed;
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
    items = applyPinnedOrder(items, ids);
    if (lastShell?.isConnected) syncSidebar(lastShell);
    const moved = items.find((entry) => sameItem(entry, item));
    if (moved?.live) syncLiveWindowOrder(moved).catch(() => {});
    return currentItems();
  }

  function dropForgottenItem(item = {}) {
    const tabId = positiveTabId(item.tabId);
    dropPinnedId(item);
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

  function renderTitleEditor(item = {}, index = 0) {
    const initial = editingDraft || itemLabel(item, index);
    const titleInput = input(initial, {
      class: "input workspace-tabs-sidebar-item-editor",
      type: "text",
      placeholder: t("workspace.tabs.editPlaceholder"),
      "aria-label": t("workspace.tabs.edit")
    });
    titleInput.value = initial;
    const commit = () => {
      stopTitleEditor();
      saveTabTitle(item, titleInput.value).catch(() => {});
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
      class: "workspace-tabs-sidebar-item is-editing",
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
    editingDraft = itemLabel(item, index);
    const editor = renderTitleEditor(item, index);
    if (row?.replaceWith) row.replaceWith(editor);
    else if (lastShell?.isConnected) syncSidebar(lastShell);
    focusTitleEditor(editor);
    return editor;
  }

  function openTitleEditor(item = {}) {
    return startTitleEditor(item);
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
        el("p", {}, t("workspace.tabs.deleteConfirm", { title: itemLabel(item, itemSectionIndex(item)) })),
        el("div", { class: "settings-dialog-actions" }, cancelButton, confirmButton)
      ),
      close,
      false,
      t("common.close")
    );
    return dialog;
  }

  function renderSidebarItem(item, index) {
    if (isEditingItem(item)) return renderTitleEditor(item, index);
    const pinLabel = item.pinned ? t("workspace.tabs.unpin") : t("workspace.tabs.pin");
    const pinButton = iconButton(
      pinLabel,
      createIcon("pin"),
      (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        togglePin(item);
      },
      `workspace-tabs-sidebar-item-pin${item.pinned ? " is-pinned" : ""}`,
      pinLabel,
      "",
      item.pinned ? "workspace.tabs.unpin" : "workspace.tabs.pin"
    );
    pinButton.setAttribute?.("aria-pressed", item.pinned ? "true" : "false");
    let row;
    row = el("div", {
      class: `workspace-tabs-sidebar-item${item.current ? " is-current" : ""}${item.live ? "" : " is-closed"}${item.pinned ? " is-pinned" : ""}`,
      role: "listitem",
      dataset: {
        workspaceId: workspaceIdValue(item.workspaceId),
        pinned: item.pinned ? "1" : ""
      }
    },
      el("button", {
        class: "workspace-tabs-sidebar-item-focus",
        type: "button",
        "aria-current": item.current ? "page" : null,
        onclick: () => {
          if (suppressActivate) {
            suppressActivate = false;
            return;
          }
          activateTab(item).catch(() => {});
        }
      },
        el("span", { class: "workspace-tabs-sidebar-item-index" }, String(index + 1)),
        item.pinned
          ? el("span", {
            class: "workspace-tabs-sidebar-item-pin-mark",
            "aria-hidden": "true"
          }, createIcon("pin"))
          : null,
        el("span", { class: "workspace-tabs-sidebar-item-label" }, itemLabel(item, index))
      ),
      el("div", { class: "workspace-tabs-sidebar-item-actions" },
        pinButton,
        iconButton(
          t("workspace.tabs.edit"),
          createIcon("edit"),
          (event) => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            startTitleEditor(item, row);
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
      )
    );
    bindItemDrag(row, item);
    return row;
  }

  function renderSidebarList() {
    const { live, closed } = partitionedItems();
    const nodes = [];
    live.forEach((item, index) => nodes.push(renderSidebarItem(item, index)));
    if (closed.length) {
      nodes.push(el("div", {
        class: "workspace-tabs-sidebar-divider",
        role: "separator",
        "aria-label": t("workspace.tabs.closed")
      }, el("span", { class: "workspace-tabs-sidebar-divider-label" }, t("workspace.tabs.closed"))));
      closed.forEach((item, index) => nodes.push(renderSidebarItem(item, index)));
    }
    if (!nodes.length) {
      return el("div", { class: "workspace-tabs-sidebar-empty" },
        searchQuery.trim() ? t("workspace.tabs.searchEmpty") : t("workspace.tabs.empty")
      );
    }
    return el("div", { class: "workspace-tabs-sidebar-list", role: "list" }, nodes);
  }

  function setSearchQuery(next) {
    searchQuery = String(next || "");
    if (lastShell?.isConnected) syncSidebar(lastShell);
    if (searchQuery.trim()) refreshSearchContext().catch(() => {});
  }

  function renderSearchBar() {
    return renderWorkspaceTabSearchField({
      query: searchQuery,
      fullTextEnabled: recordFullTextEnabled,
      onInput: (value) => {
        searchQuery = value;
        const field = lastShell?.querySelector?.(".workspace-tabs-sidebar-search-input");
        searchSelection = {
          start: Number(field?.selectionStart) || value.length,
          end: Number(field?.selectionEnd) || value.length
        };
        if (lastShell?.isConnected) syncSidebar(lastShell);
        refreshSearchContext().catch(() => {});
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
    items.length || query
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
    syncPageTitle();
    if (!shell?.isConnected) return null;
    lastShell = shell;
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
    openTitleEditor,
    openDeleteConfirmation,
    moveTab,
    togglePin,
    setSearchQuery,
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
