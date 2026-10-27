// WorkspaceSession (page): restores the workspace at start-up and keeps its snapshot saved in two
// layers, the page's sessionStorage and the background's durable records (v2 02 §12).

import { isGenericTitle } from "../../lib/titles.js";

const PAGE_KEY = "chatclubWorkspaceSessionPageV1";
const RETRY_DELAYS = [1000, 3000, 10000, 20000];
const TABBIT_RELOAD_KEY = "chatclubTabbitRestoreReloadAt";

const isHttp = (href) => /^https?:\/\//i.test(String(href || ""));

/** Restore-time cleanup of a v1 snapshot (02 §12.1). Returns null when nothing usable remains. */
export function sanitizeSnapshot(snapshot, { knownApp, presetExists, allowHref = () => true }) {
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.groups)) return null;
  const layout = snapshot.layout && typeof snapshot.layout === "object" ? snapshot.layout : { type: "preset", presetId: null };
  if (layout.type !== "temporary" && layout.presetId && presetExists && !presetExists(layout.presetId)) return null;
  const groups = [];
  let fullscreenGroupIndex = null;
  snapshot.groups.forEach((group, gi) => {
    const original = Array.isArray(group?.tabs) ? group.tabs : [];
    const tabs = [];
    let activeIndex = null;
    const wanted = Number.isInteger(group?.activeIndex) ? group.activeIndex : 0;
    original.forEach((tab, i) => {
      if (!tab || !knownApp(tab.appId)) return;
      if (i >= wanted && activeIndex === null) activeIndex = tabs.length;
      const href = isHttp(tab.currentHref) && allowHref(tab.appId, tab.currentHref) ? tab.currentHref : undefined;
      tabs.push({ appId: tab.appId, currentHref: href });
    });
    if (!tabs.length) return;
    if (activeIndex === null) activeIndex = tabs.length - 1;
    if (snapshot.fullscreenGroupIndex === gi) fullscreenGroupIndex = groups.length;
    groups.push({ tabs, activeIndex });
  });
  if (!groups.length) return null;
  return {
    schemaVersion: 1,
    generation: snapshot.generation ?? null,
    layout,
    groups,
    fullscreenGroupIndex,
    topicTitle: typeof snapshot.topicTitle === "string" ? snapshot.topicTitle : "",
    topicTitleCustom: !!snapshot.topicTitleCustom,
  };
}

/**
 * "Keep the conversation" rule (02 §12.2): a tab that merely sits on its home page keeps the stored
 * conversation address of the same app at the same position, unless the user asked for home/new chat.
 */
export function keepConversations(next, stored, { isNewTopic, homeIntent }) {
  if (!stored?.groups) return next;
  return {
    ...next,
    groups: next.groups.map((group, gi) => ({
      ...group,
      tabs: group.tabs.map((tab, ti) => {
        const old = stored.groups[gi]?.tabs?.[ti];
        if (!old || old.appId !== tab.appId || !isHttp(old.currentHref)) return tab;
        if (homeIntent(gi, ti) || !isNewTopic(tab.appId, tab.currentHref) || isNewTopic(old.appId, old.currentHref)) return tab;
        return { ...tab, currentHref: old.currentHref };
      }),
    })),
  };
}

export default {
  start(ctx) {
    const shell = ctx.services.get("shell");
    if (shell.page !== "workspace") return;
    const workspace = ctx.services.get("workspace");
    const apps = ctx.services.get("apps");
    const presets = () => ctx.services.get("layoutPresets");
    const knownApp = (id) => !!apps.get(id);
    const isNewTopic = (appId, href) => workspace.isNewTopicUrl(appId, href);
    const allowHref = (appId, href) => ctx.services.get("siteRoutes")?.isRestorable?.(appId, href) ?? true;

    const readPage = () => {
      try {
        const raw = JSON.parse(sessionStorage.getItem(PAGE_KEY) || "null");
        return raw && typeof raw === "object" ? raw : null;
      } catch {
        return null;
      }
    };
    const writePage = (workspaceId, snapshot) => {
      try {
        sessionStorage.setItem(PAGE_KEY, JSON.stringify({ workspaceId, snapshot, savedAt: Date.now() }));
      } catch (error) {
        ctx.logger.warn("Saving the page session failed:", error);
      }
    };

    // ---- Tabbit restores extension pages as back/forward navigations with stale DOM (02 §12.4).
    try {
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      if (nav?.type === "back_forward" && document.querySelector(".cc-ws-col iframe")) {
        const last = Number(sessionStorage.getItem(TABBIT_RELOAD_KEY) || 0);
        if (Date.now() - last > 60000) {
          sessionStorage.setItem(TABBIT_RELOAD_KEY, String(Date.now()));
          document.documentElement.style.visibility = "hidden";
          location.reload();
          return;
        }
      }
    } catch {
      // ignore
    }

    let lastStored = null; // last snapshot written (for the keep-conversation rule)
    let lastStoredId = null; // ...and the workspace id it belongs to
    const memorable = (snap) =>
      !isGenericTitle(snap.topicTitle) ||
      snap.groups.some((g) => g.tabs.some((tb) => isHttp(tb.currentHref) && !isNewTopic(tb.appId, tb.currentHref)));

    const capture = () => {
      const raw = workspace.getSnapshot();
      const groups = workspace.groups();
      const next = keepConversations(raw, lastStoredId === workspace.workspaceId() ? lastStored : null, {
        isNewTopic,
        homeIntent: (gi, ti) => !!(groups[gi]?.tabs[ti]?.homeIntent || groups[gi]?.tabs[ti]?.pendingNewChat),
      });
      return next;
    };

    const persist = async (snapshot, { workspaceId = workspace.workspaceId(), edited = false } = {}) => {
      writePage(workspaceId, snapshot);
      lastStored = snapshot;
      lastStoredId = workspaceId;
      const appIds = [...new Set(snapshot.groups.flatMap((g) => g.tabs.map((tb) => tb.appId)))];
      return ctx.background.request("persist", {
        workspaceId,
        snapshot,
        memorable: memorable(snapshot),
        title: snapshot.topicTitle,
        appIds,
        browserTitle: document.title,
        edited,
      });
    };

    let queued = false;
    let edited = false;
    const schedule = (structural) => {
      if (structural) edited = true;
      if (queued || !workspace.isBooted()) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const wasEdited = edited;
        edited = false;
        persist(capture(), { edited: wasEdited }).catch((error) => ctx.logger.warn("Saving the workspace session failed:", error?.message || error));
      });
    };
    ctx.events.on("Workspace:changed", ({ structural }) => schedule(structural));
    ctx.events.on("Workspace:topicChanged", () => schedule(true));

    /** Saves right away and waits for the background to confirm (new chat, drag end). */
    const saveNow = async (workspaceId) => {
      const snapshot = capture();
      const result = await persist(snapshot, { workspaceId, edited: true });
      if (!result?.ok) throw new Error(result?.reason || "not saved");
      return snapshot;
    };
    ctx.events.on("Workspace:dragFinished", () => saveNow().catch(() => {}));
    window.addEventListener("pagehide", () => {
      if (workspace.isBooted()) writePage(workspace.workspaceId(), capture());
    });

    // ---- start-up restore (02 §12.3)
    let retryIndex = 0;
    const retryFromBackground = () => {
      if (retryIndex >= RETRY_DELAYS.length) return;
      const delay = RETRY_DELAYS[retryIndex++];
      setTimeout(async () => {
        try {
          const response = await ctx.background.request("claim", { workspaceId: workspace.workspaceId() });
          const snapshot = sanitizeSnapshot(response?.snapshot, { knownApp, presetExists: (id) => presets()?.has?.(id) ?? true, allowHref });
          if (snapshot) workspace.applySnapshot(snapshot, { reason: "restore:retry" });
          else if (!response) retryFromBackground();
        } catch {
          retryFromBackground();
        }
      }, delay);
    };

    ctx.contribute("workspace.contentProvider", {
      id: "WorkspaceSession:restore",
      order: 100,
      async provide({ workspaceId }) {
        const page = readPage();
        const opts = { knownApp, presetExists: (id) => presets()?.has?.(id) ?? true, allowHref };
        if (page?.workspaceId === workspaceId) {
          const snapshot = sanitizeSnapshot(page.snapshot, opts);
          if (snapshot) {
            lastStored = snapshot;
            lastStoredId = workspaceId;
            // Re-bind this tab in the background (refresh keeps the same id).
            ctx.background.request("claim", { workspaceId }).catch(() => {});
            return snapshot;
          }
        }
        try {
          const response = await ctx.background.request("claim", { workspaceId });
          const snapshot = sanitizeSnapshot(response?.snapshot, opts);
          if (snapshot) {
            lastStored = snapshot;
            lastStoredId = workspaceId;
          }
          return snapshot;
        } catch (error) {
          ctx.logger.warn("Background unavailable; retrying the session restore later:", error?.message || error);
          retryFromBackground();
          return null;
        }
      },
    });
    // Whatever was built (restored or fresh), save it immediately.
    ctx.events.on("Workspace:ready", () => schedule(true));

    // Remembered ChatClub tabs as an import / export block (06 §11.1, §11.3).
    ctx.contribute("dataTransfer", {
      id: "workspaceTabs",
      labelKey: "session.transfer",
      modes: [{ value: "merge", labelKey: "io.mode.merge" }, { value: "replaceClosed", labelKey: "io.mode.replaceClosed" }],
      check: (data) => {
        const list = Array.isArray(data) ? data : [];
        const valid = list.filter((r) => r && typeof r.workspaceId === "string" && r.snapshot && typeof r.snapshot === "object").length;
        return { count: valid, warnings: list.length > valid ? [ctx.t("io.warn.invalid", { n: list.length - valid })] : [] };
      },
      export: async () => (await ctx.background.request("exportMemory", {})).records ?? [],
      import: async (data, mode) => {
        const incoming = (Array.isArray(data) ? data : []).filter((r) => r && typeof r.workspaceId === "string" && r.snapshot && typeof r.snapshot === "object");
        const existing = (await ctx.background.request("exportMemory", {})).records ?? [];
        let keep = new Set(existing.map((r) => r.workspaceId));
        if (mode === "replaceClosed") {
          for (const r of existing) if (r.tabId == null) await ctx.background.request("deleteMemory", { workspaceId: r.workspaceId });
          keep = new Set(existing.filter((r) => r.tabId != null).map((r) => r.workspaceId));
        }
        return ctx.background.request("importMemory", { records: incoming.filter((r) => !keep.has(r.workspaceId)) });
      },
      reset: async () => ctx.background.request("clearAll", {}),
    });

    ctx.services.provide("workspaceSession", {
      saveNow,
      persist,
      capture,
      list: () => ctx.background.request("list", {}),
      focusTab: (tabId) => ctx.background.request("focus", { tabId }),
      openWorkspaceTab: (opts = {}) => ctx.background.request("openWorkspaceTab", opts),
      setTitle: (workspaceId, title, custom) => ctx.background.request("setTitle", { workspaceId, title, custom }),
      deleteMemory: (workspaceId) => ctx.background.request("deleteMemory", { workspaceId }),
      closeOthers: () => ctx.background.request("closeOthers", {}),
      moveTabs: (tabIds, windowId, index) => ctx.background.request("moveTabs", { tabIds, windowId, index }),
      clearAll: () => ctx.background.request("clearAll", {}),
      exportMemory: () => ctx.background.request("exportMemory", {}),
      importMemory: (records) => ctx.background.request("importMemory", { records }),
      forgetPageSnapshot: () => {
        try {
          sessionStorage.removeItem(PAGE_KEY);
        } catch {
          // ignore
        }
      },
    });
  },
};
