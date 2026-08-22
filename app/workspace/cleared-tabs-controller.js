import { t } from "../../shared/i18n.js";
import { WORKSPACE_SESSION_RECOVERY_KEY } from "../../shared/workspace-session.js";
import { button, el } from "../../ui/dom.js";

export function attachWorkspaceClearedTabsController(dependencies = {}) {
  const controller = createWorkspaceClearedTabsController(dependencies);
  controller.install();
  return controller;
}

export function createWorkspaceClearedTabsController({
  requestBackground,
  toast,
  render,
  extensionApi,
  foregroundHost,
  document: ownerDocument = globalThis.document,
  window: ownerWindow = globalThis.window,
  inventoryTimeoutMs = 8000
} = {}) {
  if (typeof requestBackground !== "function") {
    throw new TypeError("Cleared tabs controller requires requestBackground().");
  }
  if (typeof toast !== "function" || typeof render !== "function") {
    throw new TypeError("Cleared tabs controller requires toast() and render().");
  }

  let items = [];
  let busy = false;
  let installed = false;
  let lastShell = null;
  let refreshRevision = 0;
  let itemsRevision = 0;
  let refreshTimer = 0;
  let retryTimer = 0;
  let refreshFailures = 0;
  let unsubscribers = [];
  const RETRY_DELAYS_MS = [250, 750, 2000, 5000, 10_000, 20_000];
  const inventoryDeadlineMs = Math.max(1, Number(inventoryTimeoutMs) || 8000);

  function countVars(count) {
    const n = Math.max(0, Number(count) || 0);
    return { count: n, plural: n === 1 ? "" : "s", were: n === 1 ? "was" : "were" };
  }

  function bannerCopy(count) {
    const marker = "\u0001";
    const text = t("workspace.clearedTabs.banner", { ...countVars(count), count: marker });
    const at = text.indexOf(marker);
    return el("span", { class: "workspace-cleared-tabs-banner-copy" },
      at < 0 ? text : text.slice(0, at),
      el("strong", { class: "workspace-cleared-tabs-banner-count" }, String(count)),
      at < 0 ? "" : text.slice(at + marker.length)
    );
  }

  function currentItems() {
    return items.slice();
  }

  function normalizeItems(next) {
    if (!Array.isArray(next)) throw new TypeError("Cleared workspace tab inventory must be an array");
    const seen = new Set();
    return next.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new TypeError(`Cleared workspace tab inventory[${index}] must be an object`);
      }
      const workspaceId = typeof item.workspaceId === "string" ? item.workspaceId.trim() : "";
      const eventId = typeof item.eventId === "string" ? item.eventId.trim() : "";
      if (!workspaceId || !eventId) {
        throw new TypeError(`Cleared workspace tab inventory[${index}] requires workspaceId and eventId`);
      }
      const key = `${workspaceId}\u0000${eventId}`;
      if (seen.has(key)) throw new TypeError(`Cleared workspace tab inventory contains duplicate event: ${eventId}`);
      seen.add(key);
      return { ...item, workspaceId, eventId };
    });
  }

  function setItems(next) {
    const normalized = normalizeItems(next);
    items = normalized;
    itemsRevision += 1;
    return currentItems();
  }

  function currentCandidateRefs() {
    return items.map(({ workspaceId, eventId }) => ({ workspaceId, eventId }));
  }

  function actionInventoryRevision() {
    return { refresh: refreshRevision, items: itemsRevision };
  }

  function applyActionItems(revision, next) {
    if (revision.refresh !== refreshRevision || revision.items !== itemsRevision) return false;
    refreshRevision += 1;
    setItems(next);
    return true;
  }

  function requestInventory() {
    let timeoutId = 0;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Cleared workspace tab inventory timed out")), inventoryDeadlineMs);
    });
    return Promise.race([
      Promise.resolve().then(() => requestBackground("listClearedWorkspaceTabs")),
      timeout
    ]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  async function refresh() {
    const revision = ++refreshRevision;
    try {
      const response = await requestInventory();
      if (revision !== refreshRevision) return currentItems();
      setItems(response?.tabs);
      refreshFailures = 0;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = 0;
      if (lastShell?.isConnected) syncBanner(lastShell);
      return currentItems();
    } catch (error) {
      if (revision === refreshRevision) {
        refreshFailures += 1;
        scheduleRefreshRetry();
      }
      throw error;
    }
  }

  function responseTabs(response) {
    for (const candidate of [
      response?.tabs,
      response?.remainingTabs,
      response?.remaining?.tabs,
      response?.remaining
    ]) {
      if (Array.isArray(candidate)) return candidate;
    }
    return null;
  }

  function openedWorkspaceIds(response) {
    return new Set((Array.isArray(response?.opened) ? response.opened : [])
      .map((item) => String(item?.workspaceId || "").trim())
      .filter(Boolean));
  }

  function renderAfterAction() {
    if (lastShell?.isConnected) syncBanner(lastShell);
    else render();
  }

  async function reconcileRestoreResponse(response, revision) {
    const remaining = responseTabs(response);
    if (remaining) {
      applyActionItems(revision, remaining);
      return currentItems();
    }
    const openedIds = openedWorkspaceIds(response);
    if (openedIds.size) {
      applyActionItems(revision, items.filter((item) => !openedIds.has(String(item?.workspaceId || ""))));
    }
    try { return await refresh(); }
    catch { return currentItems(); }
  }

  async function restore() {
    const candidates = currentCandidateRefs();
    if (busy || !candidates.length) return { restored: 0 };
    busy = true;
    const revision = actionInventoryRevision();
    try {
      const response = await requestBackground("restoreClearedWorkspaceTabs", { candidates });
      await reconcileRestoreResponse(response, revision);
      renderAfterAction();
      const restored = Number(response?.restored) || 0;
      if (restored > 0) toast(t("toast.clearedTabsRestored", countVars(restored)), "success");
      else if (items.length) toast(t("toast.clearedTabsRestoreFailed"), "error");
      return response || { restored: 0 };
    } catch (error) {
      toast(t("toast.clearedTabsRestoreFailed"), "error");
      throw error;
    } finally {
      busy = false;
    }
  }

  async function dismiss() {
    const candidates = currentCandidateRefs();
    if (busy || !candidates.length) return { dismissed: 0 };
    busy = true;
    const revision = actionInventoryRevision();
    try {
      const response = await requestBackground("dismissClearedWorkspaceTabs", { candidates });
      const remaining = responseTabs(response);
      if (!remaining) throw new TypeError("Dismissed workspace tab response requires an inventory");
      applyActionItems(revision, remaining);
      renderAfterAction();
      return response || { dismissed: 0 };
    } finally {
      busy = false;
    }
  }

  function renderBanner() {
    if (!items.length) return null;
    const count = items.length;
    return el("div", {
      class: "workspace-cleared-tabs-banner",
      role: "status"
    },
    bannerCopy(count),
    el("div", { class: "workspace-cleared-tabs-banner-actions" },
      button(t("workspace.clearedTabs.restore", countVars(count)), () => { restore().catch(() => {}); }, "primary"),
      button(t("workspace.clearedTabs.dismiss"), () => { dismiss().catch(() => {}); }, "danger")
    ));
  }

  function syncBannerHost(host, { suppressed = false } = {}) {
    const existing = host.querySelector(".workspace-cleared-tabs-banner");
    const next = renderBanner();
    host.classList.toggle("has-cleared-tabs-banner", Boolean(next));
    if (!next) {
      existing?.remove();
      return null;
    }
    if (existing) existing.replaceWith(next);
    else {
      const topbar = host.querySelector(".topbar");
      const modalHeader = host.querySelector(".modal-header");
      if (topbar) topbar.after(next);
      else if (modalHeader) modalHeader.after(next);
      else host.prepend(next);
    }
    next.inert = suppressed;
    if (suppressed) next.setAttribute("aria-hidden", "true");
    else next.removeAttribute("aria-hidden");
    return next;
  }

  function syncBanner(shell) {
    if (!shell?.isConnected) return null;
    lastShell = shell;
    let foreground = null;
    try { foreground = typeof foregroundHost === "function" ? foregroundHost() : foregroundHost; }
    catch {}
    if (foreground?.isConnected && foreground !== shell) {
      syncBannerHost(shell, { suppressed: true });
      return syncBannerHost(foreground);
    }
    return syncBannerHost(shell);
  }

  function extensionSurface(name) {
    try {
      const api = typeof extensionApi === "function" ? extensionApi() : extensionApi;
      return api?.[name] || null;
    } catch {
      return null;
    }
  }

  function scheduleRefreshRetry() {
    if (!installed || retryTimer) return;
    if (ownerDocument?.visibilityState === "hidden") return;
    const delay = RETRY_DELAYS_MS[Math.min(
      Math.max(0, refreshFailures - 1),
      RETRY_DELAYS_MS.length - 1
    )];
    retryTimer = setTimeout(() => {
      retryTimer = 0;
      refresh().then(() => {
        if (lastShell?.isConnected) syncBanner(lastShell);
      }).catch(() => {});
    }, delay);
  }

  function refreshAndSync() {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = 0;
    refreshFailures = 0;
    refreshTimer = setTimeout(() => {
      refreshTimer = 0;
      refresh().then(() => {
        if (lastShell?.isConnected) syncBanner(lastShell);
      }).catch(() => {});
    }, 80);
  }

  function onWorkspaceSessionChanged(changes, areaName) {
    if (areaName && areaName !== "local") return;
    if (!Object.prototype.hasOwnProperty.call(changes || {}, WORKSPACE_SESSION_RECOVERY_KEY)) return;
    refreshAndSync();
  }

  function listen(eventRef, listener) {
    if (typeof eventRef?.addListener !== "function") return;
    eventRef.addListener(listener);
    unsubscribers.push(() => eventRef.removeListener?.(listener));
  }

  function listenDom(target, type, listener) {
    if (typeof target?.addEventListener !== "function") return;
    target.addEventListener(type, listener);
    unsubscribers.push(() => target.removeEventListener?.(type, listener));
  }

  function install() {
    if (installed) return false;
    installed = true;
    const tabs = extensionSurface("tabs");
    listen(tabs?.onCreated, refreshAndSync);
    listen(tabs?.onRemoved, refreshAndSync);
    listen(tabs?.onUpdated, refreshAndSync);
    listen(extensionSurface("storage")?.onChanged, onWorkspaceSessionChanged);
    listenDom(ownerDocument, "visibilitychange", refreshAndSync);
    listenDom(ownerWindow, "pageshow", refreshAndSync);
    return true;
  }

  function detach() {
    if (!installed) return false;
    installed = false;
    for (const unsubscribe of unsubscribers) {
      try { unsubscribe(); } catch {}
    }
    unsubscribers = [];
    if (refreshTimer) clearTimeout(refreshTimer);
    if (retryTimer) clearTimeout(retryTimer);
    refreshTimer = 0;
    retryTimer = 0;
    refreshFailures = 0;
    refreshRevision += 1;
    lastShell = null;
    return true;
  }

  return Object.freeze({
    currentItems,
    setItems,
    refresh,
    restore,
    dismiss,
    renderBanner,
    syncBanner,
    install,
    detach
  });
}
