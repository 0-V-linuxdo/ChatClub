import { t } from "../../shared/i18n.js";
import { createActionButton } from "../../ui/components.js";
import { el } from "../../ui/dom.js";

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
      if (restored > 0) toast(t("toast.clearedTabsRestored", { count: restored }), "success");
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
    el("span", { class: "workspace-cleared-tabs-banner-copy" }, t("workspace.clearedTabs.banner", { count })),
    el("div", { class: "workspace-cleared-tabs-banner-actions" },
      createActionButton({
        label: t("workspace.clearedTabs.restore"),
        variant: "primary",
        onClick: () => { restore().catch(() => {}); }
      }),
      createActionButton({
        label: t("workspace.clearedTabs.dismiss"),
        onClick: () => { dismiss().catch(() => {}); }
      })
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
