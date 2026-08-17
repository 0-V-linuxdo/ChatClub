import { t } from "../../shared/i18n.js";
import { button, el } from "../../ui/dom.js";

export function attachWorkspaceClearedTabsController({
  requestBackground,
  toast,
  render
} = {}) {
  return createWorkspaceClearedTabsController({ requestBackground, toast, render });
}

export function createWorkspaceClearedTabsController({
  requestBackground,
  toast,
  render
} = {}) {
  if (typeof requestBackground !== "function") {
    throw new TypeError("Cleared tabs controller requires requestBackground().");
  }
  if (typeof toast !== "function" || typeof render !== "function") {
    throw new TypeError("Cleared tabs controller requires toast() and render().");
  }

  let items = [];
  let busy = false;

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

  function setItems(next = []) {
    items = Array.isArray(next) ? next.filter((item) => item?.workspaceId) : [];
    return currentItems();
  }

  async function refresh() {
    const response = await requestBackground("listClearedWorkspaceTabs");
    setItems(response?.tabs);
    return currentItems();
  }

  async function restore() {
    if (busy || !items.length) return { restored: 0 };
    busy = true;
    try {
      const response = await requestBackground("restoreClearedWorkspaceTabs");
      setItems([]);
      render();
      const restored = Number(response?.restored) || 0;
      if (restored > 0) toast(t("toast.clearedTabsRestored", countVars(restored)), "success");
      return response || { restored: 0 };
    } catch (error) {
      toast(t("toast.clearedTabsRestoreFailed"), "error");
      throw error;
    } finally {
      busy = false;
    }
  }

  async function dismiss() {
    if (busy) return { dismissed: 0 };
    busy = true;
    try {
      const response = await requestBackground("dismissClearedWorkspaceTabs");
      setItems([]);
      render();
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

  function syncBanner(shell) {
    if (!shell?.isConnected) return null;
    const existing = shell.querySelector(".workspace-cleared-tabs-banner");
    const next = renderBanner();
    shell.classList.toggle("has-cleared-tabs-banner", Boolean(next));
    if (!next) {
      existing?.remove();
      return null;
    }
    if (existing) existing.replaceWith(next);
    else {
      const topbar = shell.querySelector(".topbar");
      if (topbar) topbar.after(next);
      else shell.prepend(next);
    }
    return next;
  }

  return Object.freeze({
    currentItems,
    setItems,
    refresh,
    restore,
    dismiss,
    renderBanner,
    syncBanner
  });
}
