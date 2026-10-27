// Workspace: the multi-column chat area (v2 02 §1–§5, §8). Groups are columns, each with a strip of
// tabs; every tab owns one chat iframe that stays loaded while hidden. Everything around it
// (presets, app picker, session memory, new chat, sidebar) plugs in through services and extension points.

import { runLegacyMigration } from "../../lib/legacy.js";
import { h, clear, icon, uid } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { createStateStore } from "../../kernel/state-ports.js";
import { GROUP_BUTTON_ORDER, CONTEXT_MENU_ORDER } from "./index.js";
import { DEFAULT_LAYOUT_APPS } from "../apps/catalog.js";
import { appIconImg } from "../../lib/app-icon.js";
import { restorableHref } from "../../lib/route-safety.js";
import { zoneBoard } from "../../lib/zone-board.js";

// The two default placements shipped by older builds (07 §2).
const LEGACY_FULLSCREEN_PINNED = { addApp: "pinned", reload: "pinned", messageNavigator: "pinned", deleteThread: "pinned", fullscreen: "pinned", openInNewTab: "menu", copyLink: "menu", removeGroup: "menu", more: "pinned" };
const LEGACY_HOME_PINNED = { addApp: "pinned", newChat: "pinned", refreshPage: "pinned", reload: "pinned", messageNavigator: "pinned", deleteThread: "pinned", fullscreen: "menu", openInNewTab: "menu", copyLink: "menu", removeGroup: "menu", more: "pinned" };

const MAX_VISIBLE = 4;
const MIN_COL_WIDTH = 280;
const DRAG_THRESHOLD = 6;
const NEW_TOPIC_FADE_MS = 900;

export const isHttpUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname;
  } catch {
    return false;
  }
};

/** URL dialog normalization (02 §3.2). Returns a URL string or null. */
export function normalizeUserUrl(raw) {
  let value = String(raw || "").trim();
  if (!value) return null;
  if (value.startsWith("//")) value = `https:${value}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  return isHttpUrl(value) ? new URL(value).href : null;
}

/** "New topic" when the URL is the app home or a known empty-conversation address (02 §2.6). */
export function isNewTopicUrl(app, href) {
  if (!app || !href) return true;
  let url;
  let home;
  try {
    url = new URL(href);
    home = new URL(app.url);
  } catch {
    return false;
  }
  const strip = (u) => `${u.origin}${u.pathname.replace(/\/+$/, "") || "/"}${u.search}`;
  if (strip(url) === strip(home)) return true;
  if (!app.builtin || url.host !== home.host) return false;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (app.id === "NotionAI") return path === "/ai" || (path === "/chat" && !url.searchParams.get("t"));
  return (app.newChatPaths ?? []).includes(path) && !url.search;
}

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const shell = ctx.services.get("shell");
    const apps = ctx.services.get("apps");
    const frames = ctx.services.get("frames");
    const groupButtons = ctx.extensionPoint("tabGroup.button");
    const contextMenuEntries = ctx.extensionPoint("tab.contextMenu");
    const contentProviders = ctx.extensionPoint("workspace.contentProvider");
    const fullscreenTargets = ctx.extensionPoint("fullscreen.target");

    if (shell.page !== "workspace") {
      ctx.services.provide("workspace", null);
      return;
    }

    // ---- legacy group-button data (07 §2)
    const storedOption = (key) => ctx.host.settings.optionsBag?.data?.[key];
    runLegacyMigration(ctx, "tabGroupButtonOrderMigrationVersion", 1, (s) => {
      const savedPlacement = storedOption("tabGroupButtonPlacement");
      const stored = savedPlacement && typeof savedPlacement === "object" ? { ...savedPlacement } : null;
      if (s.tabGroupButtonsMode === "hidden") {
        const placement = { ...(s.tabGroupButtonPlacement ?? {}) };
        for (const id of GROUP_BUTTON_ORDER) if (!(id in placement)) placement[id] = "menu";
        s.tabGroupButtonPlacement = placement;
      }
      // A placement equal to one of the two old default sets moves reload (and fullscreen) into More.
      if (stored) {
        const matches = (set) => Object.entries(set).every(([id, value]) => id === "more" || stored[id] === value);
        const next = { ...(s.tabGroupButtonPlacement ?? {}) };
        if (matches(LEGACY_FULLSCREEN_PINNED)) {
          next.fullscreen = "menu";
          next.reload = "menu";
          s.tabGroupButtonPlacement = next;
        } else if (matches(LEGACY_HOME_PINNED)) {
          next.reload = "menu";
          s.tabGroupButtonPlacement = next;
        }
      }
      if (storedOption("tabContextMenuOrder") === undefined && Array.isArray(storedOption("tabGroupButtonOrder"))) {
        const fromGroup = storedOption("tabGroupButtonOrder").filter((id) => id !== "removeGroup" && id !== "more" && CONTEXT_MENU_ORDER.includes(id));
        s.tabContextMenuOrder = [...fromGroup, ...CONTEXT_MENU_ORDER.filter((id) => !fromGroup.includes(id))];
      }
    });

    // ------------------------------------------------------------ state
    /** @type {{id:string, tabs:any[], activeIndex:number}[]} */
    let groups = [];
    let fullscreenGroupId = null;
    let layoutInfo = { type: "preset", presetId: null };
    let topic = { title: "", custom: false };
    let booted = false;
    let lastActiveGroupId = null;
    const store = createStateStore({ groups: [], fullscreenGroupId: null, workspaceId: null, booted: false });
    ctx.state.register("workspace", store);

    const readWorkspaceId = () => {
      const match = /(?:^|[#&])workspace=([^&]+)/.exec(location.hash);
      return match ? decodeURIComponent(match[1]) : null;
    };
    const newWorkspaceId = () => `page-${crypto.randomUUID()}`;
    let workspaceId = readWorkspaceId();
    const setWorkspaceId = (id) => {
      workspaceId = id;
      try {
        history.replaceState(history.state, "", `${location.pathname}${location.search}#workspace=${encodeURIComponent(id)}`);
      } catch (error) {
        ctx.logger.warn("Couldn't update the workspace id in the address:", error);
        return false;
      }
      publish("workspaceId");
      return true;
    };

    const appOf = (tab) => apps.get(tab.appId);
    const findTab = (tabId) => {
      for (const group of groups) {
        const index = group.tabs.findIndex((tab) => tab.id === tabId);
        if (index >= 0) return { group, tab: group.tabs[index], index };
      }
      return null;
    };
    const findByFrame = (frameKey) => {
      for (const group of groups) for (const tab of group.tabs) if (tab.frameKey === frameKey) return { group, tab };
      return null;
    };
    const activeTab = (group) => group?.tabs[group.activeIndex] ?? group?.tabs[0] ?? null;
    const groupById = (id) => groups.find((g) => g.id === id) ?? null;

    const publicTab = (tab) => ({ id: tab.id, appId: tab.appId, frameKey: tab.frameKey, href: currentHrefSync(tab), loading: tab.loading, pendingNewChat: !!tab.pendingNewChat, homeIntent: !!tab.homeIntent });
    const publicGroups = () => groups.map((g) => ({ id: g.id, activeIndex: g.activeIndex, tabs: g.tabs.map(publicTab) }));

    let publishQueued = false;
    let pendingReasons = new Set();
    let structuralChange = false;
    /** Coalesces changes into one state update and one "Workspace:changed" event per frame. */
    const publish = (reason = "update", { structural = false } = {}) => {
      pendingReasons.add(reason);
      if (structural) structuralChange = true;
      if (publishQueued) return;
      publishQueued = true;
      queueMicrotask(() => {
        publishQueued = false;
        const reasons = [...pendingReasons];
        const structuralNow = structuralChange;
        pendingReasons = new Set();
        structuralChange = false;
        store.update((s) => {
          s.groups = publicGroups();
          s.fullscreenGroupId = fullscreenGroupId;
          s.workspaceId = workspaceId;
          s.booted = booted;
        });
        ctx.events.emit("Workspace:changed", { reasons, structural: structuralNow, workspaceId });
      });
    };

    if (!workspaceId) setWorkspaceId(newWorkspaceId());

    // ------------------------------------------------------------ DOM
    const root = h("div.cc-ws", { attrs: { role: "region", "aria-label": "Workspace" } });
    shell.workspaceSlot.append(root);
    ctx.onDispose(() => root.remove());

    const supportsMoveBefore = typeof Element.prototype.moveBefore === "function";
    const moveNode = (parent, node, before = null) => {
      if (node.parentNode && supportsMoveBefore && node.isConnected && parent.isConnected) {
        try {
          parent.moveBefore(node, before);
          return;
        } catch {
          // Fall back to a plain insert (the iframe may reload; accepted degradation, 02 §5).
        }
      }
      parent.insertBefore(node, before);
    };

    const layoutColumns = () => {
      const visible = Math.max(1, Math.min(MAX_VISIBLE, groups.length, Number(ctx.settings.colMaxCount) || MAX_VISIBLE));
      const width = Math.max(MIN_COL_WIDTH, Math.floor(root.clientWidth / visible));
      for (const group of groups) if (group.col) group.col.style.width = fullscreenGroupId ? "" : `${width}px`;
    };
    const resizeObserver = new ResizeObserver(() => layoutColumns());
    resizeObserver.observe(root);
    ctx.onDispose(() => resizeObserver.disconnect());

    const applyOverlayOpacity = () => {
      const on = ctx.settings.frameLoadingOverlayEnabled !== false;
      root.style.setProperty("--overlay-opacity", `${on ? Number(ctx.settings.frameLoadingOverlayOpacity ?? 82) : 0}%`);
    };
    applyOverlayOpacity();
    ctx.onDispose(ctx.plugin.settings.use(["frameLoadingOverlayEnabled", "frameLoadingOverlayOpacity"], applyOverlayOpacity));

    // ------------------------------------------------------------ iframes
    const frameAttributes = (app, url) => apps.iframeAttributes(app.id, url) ?? { allow: null, sandbox: null, referrerPolicy: "no-referrer", attributes: [] };

    const setLoading = (tab, on, { newTopic = false } = {}) => {
      tab.loading = on;
      clearTimeout(tab.fadeTimer);
      if (on) {
        tab.overlay?.remove();
        const label = newTopic ? t("workspace.newTopic") : t("workspace.restoring");
        const overlay = h("div.cc-ws-overlay", { class: newTopic ? "new-topic" : "", attrs: { "aria-hidden": "true" } },
          h("div.cc-ws-status", ui.spinner(), h("span", label)));
        overlay.hidden = tab.iframe?.hidden ?? false;
        tab.overlay = overlay;
        tab.body?.append(overlay);
        tab.iframe?.setAttribute("inert", "");
      } else if (tab.overlay) {
        const overlay = tab.overlay;
        tab.overlay = null;
        tab.iframe?.removeAttribute("inert");
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (overlay.classList.contains("new-topic") && !reduced) {
          overlay.classList.add("fading");
          overlay.querySelector(".cc-ws-status")?.remove();
          tab.fadeTimer = setTimeout(() => overlay.remove(), NEW_TOPIC_FADE_MS);
        } else overlay.remove();
      }
      renderHeads();
      publish("loading");
    };

    /** Creates (or recreates) the iframe for a tab and points it at url. */
    const mountFrame = (tab, url, { newTopic } = {}) => {
      const app = appOf(tab);
      if (!app) return;
      if (tab.frameKey) frames.release(tab.frameKey);
      tab.iframe?.remove();
      const identity = frames.createIdentity(app.id);
      tab.frameKey = identity.frameKey;
      const attrs = frameAttributes(app, url);
      const iframe = h("iframe", {
        attrs: {
          name: identity.name,
          title: app.name,
          "data-tab-id": tab.id,
          "data-app-id": app.id,
        },
      });
      for (const { name, value } of attrs.attributes) iframe.setAttribute(name, value);
      if (attrs.allow !== null) iframe.setAttribute("allow", attrs.allow);
      if (attrs.referrerPolicy !== null) iframe.setAttribute("referrerpolicy", attrs.referrerPolicy);
      if (attrs.sandbox !== null) iframe.setAttribute("sandbox", attrs.sandbox);
      iframe.setAttribute("inert", "");
      iframe.hidden = !isActive(tab);
      tab.iframe = iframe;
      tab.href = url;
      tab.attrsKey = JSON.stringify(attrs);
      frames.attach(tab.frameKey, iframe);
      iframe.addEventListener("load", () => onFrameLoad(tab, iframe));
      (tab.body ?? root).append(iframe);
      navigateFrame(tab, url, { newTopic: newTopic ?? isNewTopicUrl(app, url), fresh: true });
    };

    const onFrameLoad = (tab, iframe) => {
      if (tab.iframe !== iframe || !iframe.getAttribute("src")) return;
      setLoading(tab, false);
      if (tab.pendingNewChat && tab.pendingNewChatUntilLoad) {
        tab.pendingNewChat = false;
        tab.pendingNewChatUntilLoad = false;
      }
      ctx.events.emit("Workspace:tabLoaded", { tabId: tab.id, frameKey: tab.frameKey, appId: tab.appId });
      publish("tabLoaded");
    };

    let navigationSeq = 0;
    /** Navigates a tab's iframe (prepare network rules first, then set the address). */
    const navigateFrame = async (tab, url, { newTopic = false, replace = false, fresh = false } = {}) => {
      const seq = ++navigationSeq;
      tab.navSeq = seq;
      const app = appOf(tab);
      // A different set of iframe attributes (e.g. leaving the app's hosts) needs a new iframe.
      if (!fresh && app && JSON.stringify(frameAttributes(app, url)) !== tab.attrsKey) {
        mountFrame(tab, url, { newTopic });
        return;
      }
      setLoading(tab, true, { newTopic });
      if (!fresh) frames.markUnloaded(tab.frameKey);
      tab.href = url;
      try {
        await frames.prepare(url);
      } catch (error) {
        ctx.logger.warn("Frame preparation failed; loading anyway:", error?.message || error);
      }
      if (tab.navSeq !== seq || !tab.iframe) return;
      if (replace && tab.iframe.getAttribute("src")) {
        try {
          tab.iframe.contentWindow.location.replace(url);
          return;
        } catch {
          // Fall through to src.
        }
      }
      tab.iframe.src = url;
      publish("navigate");
    };

    // ------------------------------------------------------------ group buttons
    const shortcutLabel = (action) => {
      if (!action) return "";
      try {
        return ctx.services.get("shortcuts")?.labelFor(action) ?? "";
      } catch {
        return "";
      }
    };
    const withShortcut = (label, action) => {
      const keys = shortcutLabel(action);
      return keys ? `${label} (${keys})` : label;
    };

    const groupCtx = (group, anchor, extra = {}) => {
      const tab = activeTab(group);
      return { host: ctx.host, ui: shellUi, t, group, groupId: group.id, tab, tabId: tab?.id, app: tab ? appOf(tab) : null, frameKey: tab?.frameKey, anchor, workspace: api, ...extra };
    };
    const evaluate = (value, gctx, fallback) => {
      try {
        return typeof value === "function" ? value(gctx) : value ?? fallback;
      } catch (error) {
        ctx.logger.warn("Group button state failed:", error);
        return fallback;
      }
    };
    const labelOf = (entry, gctx) => {
      const key = evaluate(entry.labelKey, gctx, entry.id);
      return evaluate(entry.label, gctx, null) ?? t(key);
    };

    const placementOf = (entry) => {
      if (entry.id === "more") return "pinned";
      const stored = ctx.settings.tabGroupButtonPlacement?.[entry.id];
      if (stored === "pinned" || stored === "menu" || stored === "hidden") return stored;
      return entry.defaultPlacement ?? "pinned";
    };
    const orderedEntries = (registry, order) => {
      const all = registry.sorted();
      const pos = new Map((Array.isArray(order) ? order : []).map((id, i) => [id, i]));
      return all
        .map((entry, i) => ({ entry, rank: pos.has(entry.id) ? pos.get(entry.id) : 1000 + i }))
        .sort((a, b) => a.rank - b.rank)
        .map((x) => x.entry);
    };
    const groupEntries = () => orderedEntries(groupButtons, ctx.settings.tabGroupButtonOrder ?? GROUP_BUTTON_ORDER).filter((e) => e.id !== "more");

    const runEntry = (entry, gctx) => {
      try {
        const result = entry.onClick?.(gctx);
        result?.catch?.((error) => {
          ctx.logger.error(`Group button "${entry.id}" failed:`, error);
          shellUi.toast(String(error?.message || error), "error");
        });
      } catch (error) {
        ctx.logger.error(`Group button "${entry.id}" failed:`, error);
      }
    };

    /** Menu items for a list of entries: normal first, then danger ones after a separator; disabled ones hidden. */
    const menuItemsFor = (entries, gctx) => {
      const normal = [];
      const danger = [];
      for (const entry of entries) {
        if (evaluate(entry.disabled, gctx, false) || evaluate(entry.hidden, gctx, false)) continue;
        const item = {
          label: labelOf(entry, gctx),
          icon: evaluate(entry.icon, gctx, "dot"),
          hint: shortcutLabel(entry.shortcutAction),
          checked: entry.toggle ? !!evaluate(entry.active, gctx, false) : undefined,
          danger: !!entry.danger,
          onSelect: () => runEntry(entry, gctx),
        };
        (entry.danger ? danger : normal).push(item);
      }
      return danger.length && normal.length ? [...normal, "separator", ...danger] : [...normal, ...danger];
    };

    const openMoreMenu = (group, anchor) => {
      const gctx = groupCtx(group, anchor);
      const items = menuItemsFor(groupEntries().filter((e) => placementOf(e) === "menu"), gctx);
      if (!items.length) return;
      shellUi.openMenu({ anchor, items, align: "end" });
    };

    const openTabContextMenu = (group, tab, anchor, point) => {
      const gctx = groupCtx(group, anchor, { contextTab: tab });
      const hidden = new Set(ctx.settings.tabContextMenuHiddenIds ?? []);
      const fromButtons = groupEntries().filter((e) => e.id !== "removeGroup" && e.contextMenu !== false);
      const own = contextMenuEntries.sorted();
      const merged = new Map();
      for (const entry of [...fromButtons, ...own]) if (!merged.has(entry.id)) merged.set(entry.id, entry);
      const order = ctx.settings.tabContextMenuOrder ?? CONTEXT_MENU_ORDER;
      const pos = new Map(order.map((id, i) => [id, i]));
      const entries = [...merged.values()]
        .filter((e) => !hidden.has(e.id))
        .map((e, i) => ({ e, rank: pos.has(e.id) ? pos.get(e.id) : 1000 + i }))
        .sort((a, b) => a.rank - b.rank)
        .map((x) => x.e);
      const items = menuItemsFor(entries, gctx);
      if (!items.length) return;
      shellUi.openMenu({ anchor, items, align: "start", className: "cc-ws-context-menu", point });
    };

    // ------------------------------------------------------------ rendering
    const isActive = (tab) => {
      const found = findTab(tab.id);
      return !!found && activeTab(found.group) === tab;
    };

    const applyVisibility = (group) => {
      const active = activeTab(group);
      for (const tab of group.tabs) {
        const on = tab === active;
        if (tab.iframe) tab.iframe.hidden = !on;
        if (tab.overlay) tab.overlay.hidden = !on;
      }
    };

    const ensureColumn = (group) => {
      if (group.col) return;
      group.strip = h("div.cc-ws-tabs", { attrs: { role: "tablist" } });
      group.buttons = h("div.cc-ws-buttons");
      group.head = h("div.cc-ws-head", group.strip, group.buttons);
      group.body = h("div.cc-ws-body");
      group.col = h("section.cc-ws-col", { dataset: { groupId: group.id } }, group.head, group.body);
      group.head.addEventListener("pointerdown", (event) => onHeadPointerDown(event, group));
    };

    const renderTab = (group, tab, index) => {
      const app = appOf(tab);
      const name = app?.name ?? tab.appId;
      const selected = index === group.activeIndex;
      const fallback = icon("globe", { className: "fallback" });
      const img = app ? appIconImg(ctx.host, app, { pageIcon: tab.pageIcon }) : fallback;
      const close = h("button.close", {
        type: "button",
        "aria-label": t("workspace.closeTab", { name }),
        dataset: { tip: withShortcut(t("workspace.closeTab", { name }), "closeChat") },
        onclick: (event) => {
          event.stopPropagation();
          closeTab(tab.id);
        },
      }, icon("x", { size: 13 }));
      const el = h("div.cc-ws-tab", {
        attrs: { role: "tab", tabindex: selected ? "0" : "-1", "aria-selected": String(selected), draggable: "false" },
        dataset: { tabId: tab.id },
      }, img, h("span.name", name), close);
      el.addEventListener("click", () => {
        if (dragState?.suppressClick) return;
        setActive(group.id, tab.id);
      });
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setActive(group.id, tab.id);
        }
      });
      el.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        setActive(group.id, tab.id);
        const rect = el.getBoundingClientRect();
        openTabContextMenu(group, tab, el, { x: rect.left, y: rect.bottom + 5 });
      });
      tab.tabEl = el;
      return el;
    };

    const renderButtons = (group) => {
      clear(group.buttons);
      const gctx = groupCtx(group, null);
      const entries = groupEntries();
      for (const entry of entries) {
        if (placementOf(entry) !== "pinned" || evaluate(entry.hidden, gctx, false)) continue;
        if (entry.id === "addApp") continue; // rendered at the end of the tab strip
        const label = labelOf(entry, gctx);
        const btn = ui.iconButton({
          icon: evaluate(entry.icon, gctx, "dot"),
          compact: true,
          label,
          tip: withShortcut(label, entry.shortcutAction),
          tipId: entry.tipId ?? `workspace.group.${entry.id === "removeGroup" ? "remove" : entry.id}`,
          disabled: evaluate(entry.disabled, gctx, false),
          className: entry.danger ? "danger" : "",
        });
        if (entry.toggle) btn.setAttribute("aria-pressed", String(!!evaluate(entry.active, gctx, false)));
        if (evaluate(entry.busy, gctx, false)) btn.setAttribute("aria-busy", "true");
        btn.dataset.groupButton = entry.id;
        btn.addEventListener("click", () => runEntry(entry, groupCtx(group, btn)));
        group.buttons.append(btn);
      }
      const hasMenu = entries.some((e) => placementOf(e) === "menu" && !evaluate(e.disabled, gctx, false) && !evaluate(e.hidden, gctx, false));
      const more = ui.iconButton({ icon: "more", compact: true, label: t("workspace.group.more"), tipId: "workspace.group.more", disabled: !hasMenu });
      more.dataset.groupButton = "more";
      more.setAttribute("aria-haspopup", "menu");
      more.addEventListener("click", () => openMoreMenu(group, more));
      group.buttons.append(more);
    };

    const renderHead = (group) => {
      ensureColumn(group);
      clear(group.strip);
      group.tabs.forEach((tab, index) => group.strip.append(renderTab(group, tab, index)));
      const add = groupButtons.get("addApp");
      if (add && placementOf(add) === "pinned") {
        const gctx = groupCtx(group, null);
        const label = labelOf(add, gctx);
        const btn = ui.iconButton({ icon: "plus", compact: true, label, tip: withShortcut(label, add.shortcutAction), tipId: "workspace.group.addApp", className: "cc-ws-add" });
        btn.dataset.groupButton = "addApp";
        btn.addEventListener("click", () => runEntry(add, groupCtx(group, btn)));
        group.strip.append(btn);
      }
      renderButtons(group);
    };

    let headsQueued = false;
    const renderHeads = () => {
      if (headsQueued) return;
      headsQueued = true;
      queueMicrotask(() => {
        headsQueued = false;
        for (const group of groups) if (group.col) renderHead(group);
      });
    };

    /** Places the columns and iframes in the DOM without reloading existing iframes. */
    const renderAll = () => {
      for (const group of groups) {
        ensureColumn(group);
        group.col.dataset.fullscreen = String(group.id === fullscreenGroupId);
        for (const tab of group.tabs) {
          tab.body = group.body;
          if (tab.iframe && tab.iframe.parentNode !== group.body) moveNode(group.body, tab.iframe, null);
          if (tab.overlay && tab.overlay.parentNode !== group.body) group.body.append(tab.overlay);
        }
        applyVisibility(group);
      }
      // Column order.
      let cursor = root.firstChild;
      for (const group of groups) {
        if (group.col === cursor) {
          cursor = cursor.nextSibling;
          continue;
        }
        moveNode(root, group.col, cursor);
      }
      // Remove columns that no longer exist.
      const live = new Set(groups.map((g) => g.col));
      for (const child of [...root.children]) if (!live.has(child)) child.remove();
      root.dataset.fullscreen = String(!!fullscreenGroupId);
      shell.setFullscreen(!!fullscreenGroupId);
      for (const group of groups) renderHead(group);
      layoutColumns();
    };

    // ------------------------------------------------------------ model operations
    const makeTab = (appId, href) => ({ id: uid("tab"), appId, frameKey: null, iframe: null, href: href || "", loading: false, overlay: null, body: null });

    const changed = (reason) => {
      renderAll();
      publish(reason, { structural: true });
    };

    const destroyTab = (tab) => {
      clearTimeout(tab.fadeTimer);
      tab.overlay?.remove();
      tab.iframe?.remove();
      if (tab.frameKey) frames.release(tab.frameKey);
      tab.iframe = null;
      tab.frameKey = null;
    };

    const startTab = (group, tab, url) => {
      ensureColumn(group);
      tab.body = group.body;
      const app = appOf(tab);
      const target = isHttpUrl(url) ? url : app?.url;
      mountFrame(tab, target, { newTopic: isNewTopicUrl(app, target) });
    };

    const clearAll = () => {
      for (const group of groups) {
        for (const tab of group.tabs) destroyTab(tab);
        group.col?.remove();
      }
      groups = [];
      fullscreenGroupId = null;
    };

    /** Builds the workspace from [{tabs:[{appId,currentHref}], activeIndex}] (snapshot-style groups). */
    const build = (specGroups, { fullscreenGroupIndex = null, reason = "build" } = {}) => {
      clearAll();
      for (const spec of specGroups ?? []) {
        const tabs = (spec.tabs ?? []).filter((tb) => apps.get(tb.appId));
        if (!tabs.length) continue;
        // The active index moves to the nearest kept tab after it, else the last one (02 §12.1).
        const original = spec.tabs ?? [];
        let activeIndex = 0;
        const wanted = Number.isInteger(spec.activeIndex) ? spec.activeIndex : 0;
        const keptBefore = original.slice(0, wanted).filter((tb) => apps.get(tb.appId)).length;
        activeIndex = original[wanted] && apps.get(original[wanted].appId) ? keptBefore : Math.min(keptBefore, tabs.length - 1);
        const group = { id: uid("grp"), tabs: tabs.map((tb) => makeTab(tb.appId, tb.currentHref)), activeIndex };
        groups.push(group);
      }
      if (!groups.length) {
        const first = apps.list()[0];
        if (first) groups.push({ id: uid("grp"), tabs: [makeTab(first.id)], activeIndex: 0 });
      }
      if (Number.isInteger(fullscreenGroupIndex) && groups[fullscreenGroupIndex]) fullscreenGroupId = groups[fullscreenGroupIndex].id;
      renderAll();
      for (const group of groups) for (const tab of group.tabs) startTab(group, tab, tab.href);
      publish(reason, { structural: true });
    };

    const fromAppIdGroups = (appIdGroups) => (appIdGroups ?? []).map((ids) => ({ tabs: (ids ?? []).map((appId) => ({ appId })), activeIndex: 0 }));

    const setActive = (groupId, tabId) => {
      const group = groupById(groupId);
      if (!group) return false;
      const index = group.tabs.findIndex((tb) => tb.id === tabId);
      if (index < 0) return false;
      lastActiveGroupId = group.id;
      if (group.activeIndex !== index) {
        group.activeIndex = index;
        applyVisibility(group);
        renderHead(group);
        publish("activate");
      }
      return true;
    };

    const addTab = (groupId, appId, { url, activate = true, index } = {}) => {
      const group = groupById(groupId);
      if (!group || !apps.get(appId)) return null;
      const tab = makeTab(appId, url);
      const at = Number.isInteger(index) ? Math.max(0, Math.min(index, group.tabs.length)) : group.tabs.length;
      group.tabs.splice(at, 0, tab);
      if (activate) group.activeIndex = at;
      else if (at <= group.activeIndex) group.activeIndex += 1;
      startTab(group, tab, url);
      changed("addTab");
      return tab.id;
    };

    const addGroup = (appId, { url, index } = {}) => {
      if (!apps.get(appId)) return null;
      const group = { id: uid("grp"), tabs: [makeTab(appId, url)], activeIndex: 0 };
      const at = Number.isInteger(index) ? Math.max(0, Math.min(index, groups.length)) : groups.length;
      groups.splice(at, 0, group);
      ensureColumn(group);
      startTab(group, group.tabs[0], url);
      changed("addGroup");
      requestAnimationFrame(() => group.col?.scrollIntoView({ inline: "nearest", block: "nearest" }));
      return group.id;
    };

    const removeGroup = (groupId) => {
      if (groups.length <= 1) return false;
      const index = groups.findIndex((g) => g.id === groupId);
      if (index < 0) return false;
      const [group] = groups.splice(index, 1);
      for (const tab of group.tabs) destroyTab(tab);
      group.col?.remove();
      if (fullscreenGroupId === groupId) fullscreenGroupId = null;
      changed("removeGroup");
      return true;
    };

    const closeTab = (tabId) => {
      const found = findTab(tabId);
      if (!found) return false;
      const { group, tab, index } = found;
      if (group.tabs.length === 1) {
        if (groups.length === 1) return false; // keep at least one column with one tab
        return removeGroup(group.id);
      }
      group.tabs.splice(index, 1);
      destroyTab(tab);
      if (index < group.activeIndex) group.activeIndex -= 1;
      else if (index === group.activeIndex) group.activeIndex = Math.min(index, group.tabs.length - 1);
      changed("closeTab");
      return true;
    };

    const toggleFullscreen = (groupId) => {
      fullscreenGroupId = fullscreenGroupId === groupId ? null : groupById(groupId) ? groupId : null;
      renderAll();
      publish("fullscreen");
    };

    /** Detaches a tab (keeping its iframe alive) so it can be inserted elsewhere. */
    const detachTab = (tabId) => {
      const found = findTab(tabId);
      if (!found) return null;
      const { group, index } = found;
      const wasActive = index === group.activeIndex;
      group.tabs.splice(index, 1);
      if (!group.tabs.length) {
        const gi = groups.indexOf(group);
        groups.splice(gi, 1);
        group.col?.remove();
        if (fullscreenGroupId === group.id) fullscreenGroupId = null;
      } else if (index < group.activeIndex || (wasActive && group.activeIndex >= group.tabs.length)) {
        group.activeIndex = Math.max(0, group.activeIndex - (index < group.activeIndex ? 1 : 0));
        group.activeIndex = Math.min(group.activeIndex, group.tabs.length - 1);
      }
      return found.tab;
    };

    const moveTab = (tabId, targetGroupId, targetIndex) => {
      const found = findTab(tabId);
      const target = groupById(targetGroupId);
      if (!found || !target) return false;
      if (found.group === target) {
        const from = found.index;
        let to = Math.max(0, Math.min(targetIndex, target.tabs.length));
        if (to > from) to -= 1;
        if (to === from) return false;
        const activeId = activeTab(target).id;
        target.tabs.splice(from, 1);
        target.tabs.splice(to, 0, found.tab);
        target.activeIndex = target.tabs.findIndex((tb) => tb.id === activeId);
      } else {
        const tab = detachTab(tabId);
        const at = Math.max(0, Math.min(targetIndex, target.tabs.length));
        target.tabs.splice(at, 0, tab);
        target.activeIndex = at;
      }
      changed("moveTab");
      return true;
    };

    const moveTabToNewGroup = (tabId) => {
      const found = findTab(tabId);
      if (!found) return null;
      if (found.group.tabs.length === 1) {
        // Already alone: move its column to the end.
        groups.splice(groups.indexOf(found.group), 1);
        groups.push(found.group);
        changed("moveGroup");
        return found.group.id;
      }
      const tab = detachTab(tabId);
      const group = { id: uid("grp"), tabs: [tab], activeIndex: 0 };
      groups.push(group);
      changed("moveTab");
      return group.id;
    };

    const moveGroup = (groupId, toIndex) => {
      const from = groups.findIndex((g) => g.id === groupId);
      if (from < 0) return false;
      let to = Math.max(0, Math.min(toIndex, groups.length));
      if (to > from) to -= 1;
      if (to === from) return false;
      const [group] = groups.splice(from, 1);
      groups.splice(to, 0, group);
      changed("moveGroup");
      return true;
    };

    // ------------------------------------------------------------ addresses
    const currentHrefSync = (tab) => {
      const app = appOf(tab);
      if (tab.pendingNewChat) return app?.url ?? "";
      const reported = tab.frameKey ? frames.lastUrl(tab.frameKey) : "";
      for (const candidate of [reported, tab.href, tab.iframe?.getAttribute("src"), app?.url]) if (isHttpUrl(candidate)) return candidate;
      return "";
    };
    /** Live address of a tab: ask the content script first (02 §3.1). */
    const currentHref = async (tabId) => {
      const found = findTab(tabId);
      if (!found) return "";
      const { tab } = found;
      if (tab.frameKey && frames.isRegistered(tab.frameKey)) {
        try {
          const response = await ctx.services.get("frames.transport").send(tab.frameKey, { capability: "base", command: "getLocationHref" }, { timeoutMs: 1200 });
          const href = response?.result ?? response?.href ?? response;
          if (isHttpUrl(href)) return href;
        } catch {
          // fall back
        }
      }
      return currentHrefSync(tab);
    };

    const navigateTab = (tabId, url, opts = {}) => {
      const found = findTab(tabId);
      if (!found || !isHttpUrl(url)) return false;
      if (!opts.keepPendingNewChat) found.tab.pendingNewChat = false;
      navigateFrame(found.tab, url, { newTopic: opts.newTopic ?? isNewTopicUrl(appOf(found.tab), url), replace: !!opts.replace });
      return true;
    };
    const refreshTab = async (tabId) => {
      const href = await currentHref(tabId);
      return navigateTab(tabId, href, { newTopic: false, keepPendingNewChat: true });
    };
    const homeTab = (tabId, { pendingNewChat = false } = {}) => {
      const found = findTab(tabId);
      if (!found) return false;
      const app = appOf(found.tab);
      if (!app) return false;
      if (pendingNewChat) {
        found.tab.pendingNewChat = true;
        found.tab.pendingNewChatUntilLoad = true;
      }
      // The user asked for the home page: session memory must not bring the old conversation back.
      found.tab.homeIntent = true;
      navigateFrame(found.tab, app.url, { newTopic: true });
      publish("home");
      return true;
    };

    // ------------------------------------------------------------ current group rule (02 §8)
    const currentGroup = (source) => {
      if (source?.kind === "frame" && source.frameKey) {
        const hit = findByFrame(source.frameKey);
        if (hit) return hit.group;
      }
      if (fullscreenGroupId) return groupById(fullscreenGroupId);
      const focused = document.activeElement;
      if (focused?.tagName === "IFRAME") {
        const hit = groups.find((g) => g.tabs.some((tb) => tb.iframe === focused));
        if (hit) return hit;
      }
      return groupById(lastActiveGroupId) ?? groups[0] ?? null;
    };

    // ------------------------------------------------------------ URL dialog (02 §3.2)
    const openGoToUrl = async (group) => {
      const tab = activeTab(group);
      if (!tab) return;
      const initial = await currentHref(tab.id);
      shellUi.openModal(({ onClose }) => {
        const input = ui.textInput({ value: initial, placeholder: "https://" });
        input.setAttribute("aria-label", "URL");
        const go = () => {
          const url = normalizeUserUrl(input.value);
          if (!url) {
            input.setAttribute("aria-invalid", "true");
            shellUi.toast(t("workspace.goto.invalid"), "error");
            input.focus();
            return;
          }
          navigateTab(tab.id, url, { replace: true });
          onClose("go");
        };
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !event.isComposing) {
            event.preventDefault();
            go();
          }
        });
        input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
        requestAnimationFrame(() => input.select());
        return shellUi.modalLayout({
          title: t("workspace.goto.title"),
          body: [input],
          footer: [
            h("button.cc-btn.tall", { type: "button", onclick: () => onClose("cancel") }, t("common.cancel")),
            h("button.cc-btn.tall.primary", { type: "button", onclick: go }, t("workspace.goto.go")),
          ],
          onClose,
        });
      }, { key: "workspace-goto", kind: "editor", initialFocus: "input" });
    };

    // ------------------------------------------------------------ built-in group buttons (02 §3)
    const builtin = [
      {
        id: "refreshPage", icon: "reload", labelKey: "workspace.group.refreshPage", defaultPlacement: "pinned", shortcutAction: "refreshPage",
        busy: (g) => !!g.tab?.loading,
        onClick: (g) => g.tab && refreshTab(g.tab.id),
      },
      {
        id: "reload", icon: "home", labelKey: "workspace.group.reload", defaultPlacement: "menu", shortcutAction: "reloadChat",
        onClick: (g) => g.tab && homeTab(g.tab.id),
      },
      {
        id: "fullscreen", icon: (g) => (fullscreenGroupId === g.groupId ? "minimize" : "maximize"),
        labelKey: (g) => (fullscreenGroupId === g.groupId ? "workspace.group.exitFullscreen" : "workspace.group.fullscreen"),
        defaultPlacement: "menu", shortcutAction: "enterFullscreen",
        onClick: (g) => toggleFullscreen(g.groupId),
      },
      {
        id: "copyLink", icon: "copy", labelKey: "workspace.group.copyLink", defaultPlacement: "menu",
        async onClick(g) {
          if (!g.tab) return;
          const href = await currentHref(g.tab.id);
          try {
            await navigator.clipboard.writeText(href);
            shellUi.toast(t("workspace.linkCopied"), "success");
          } catch {
            shellUi.toast(t("workspace.copyFailed"), "error");
          }
        },
      },
      {
        id: "openInNewTab", icon: "external", labelKey: "workspace.group.openInNewTab", defaultPlacement: "menu",
        async onClick(g) {
          if (!g.tab) return;
          const href = await currentHref(g.tab.id);
          try {
            if (!isHttpUrl(href)) throw new Error("bad url");
            await chrome.tabs.create({ url: href, active: true });
          } catch {
            shellUi.toast(t("workspace.openFailed"), "error");
          }
        },
      },
      {
        id: "goToUrl", icon: "link", labelKey: "workspace.group.goToUrl", defaultPlacement: "menu",
        onClick: (g) => openGoToUrl(g.group),
      },
      {
        id: "removeGroup", icon: "x", labelKey: "workspace.group.remove", defaultPlacement: "menu", danger: true, contextMenu: false,
        disabled: () => groups.length <= 1,
        onClick: (g) => removeGroup(g.groupId),
      },
    ];
    builtin.forEach((entry, order) => ctx.contribute("tabGroup.button", { ...entry, order: (order + 1) * 10 }));
    ctx.contribute("tab.contextMenu", {
      id: "closeTab", icon: "x", labelKey: "workspace.closeTabMenu", danger: true, order: 1000,
      disabled: (g) => groups.length === 1 && g.group.tabs.length === 1,
      onClick: (g) => closeTab(g.contextTab?.id ?? g.tabId),
    });

    // ------------------------------------------------------------ shortcuts
    const groupFor = (source) => currentGroup(source);
    ctx.contribute("shortcut.action", {
      id: "closeChat", labelKey: "workspace.shortcut.closeChat",
      run: (_m, source) => {
        const tab = activeTab(groupFor(source));
        if (tab) closeTab(tab.id);
      },
    });
    ctx.contribute("shortcut.action", {
      id: "refreshPage", labelKey: "workspace.shortcut.refreshPage",
      run: (_m, source) => {
        const tab = activeTab(groupFor(source));
        if (tab) refreshTab(tab.id);
      },
    });
    ctx.contribute("shortcut.action", {
      id: "reloadChat", labelKey: "workspace.shortcut.reloadChat",
      run: (_m, source) => {
        const tab = activeTab(groupFor(source));
        if (tab) homeTab(tab.id);
      },
    });
    ctx.contribute("shortcut.action", {
      id: "enterFullscreen", labelKey: "workspace.shortcut.enterFullscreen",
      run: (_m, source) => {
        // Open panels (share, summary, history, pocket) take the toggle first (06 §2.2).
        for (const target of fullscreenTargets.sorted()) {
          try {
            if (target.isOpen?.()) return target.toggle();
          } catch (error) {
            ctx.logger.warn(`Fullscreen target "${target.id}" failed:`, error);
          }
        }
        const group = groupFor(source);
        if (group) toggleFullscreen(group.id);
      },
    });
    ctx.contribute("shortcut.action", {
      id: "switchPlatformTab", labelKey: "workspace.shortcut.switchPlatformTab",
      run: (match, source) => {
        const group = groupFor(source);
        const n = Number(match?.digit ?? match);
        const tab = group?.tabs[n - 1];
        if (tab) setActive(group.id, tab.id);
      },
    });

    // ------------------------------------------------------------ drag and drop (02 §5)
    let dragState = null;
    const onHeadPointerDown = (event, group) => {
      if (event.button !== 0) return;
      const tabEl = event.target.closest?.(".cc-ws-tab");
      if (!tabEl || event.target.closest("button")) return;
      const tabId = tabEl.dataset.tabId;
      dragState = { tabId, groupId: group.id, startX: event.clientX, startY: event.clientY, started: false, pointerId: event.pointerId, suppressClick: false, drop: null };
      const onMove = (e) => onDragMove(e);
      const onUp = (e) => finish(e.type === "pointercancel");
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(true);
        }
      };
      const finish = (cancelled) => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        window.removeEventListener("keydown", onKey, true);
        endDrag(cancelled);
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
      window.addEventListener("keydown", onKey, true);
    };

    const clearDropMarks = () => {
      root.querySelectorAll(".drop-left, .drop-right, .drop-target, .drop-before, .drop-after, .dragging-col, .drag-ghost").forEach((el) => el.classList.remove("drop-left", "drop-right", "drop-target", "drop-before", "drop-after", "dragging-col", "drag-ghost"));
      document.querySelectorAll("[data-ws-drop].drop-hover").forEach((el) => el.classList.remove("drop-hover"));
    };

    const onDragMove = (event) => {
      if (!dragState) return;
      if (!dragState.started) {
        if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < DRAG_THRESHOLD) return;
        dragState.started = true;
        root.classList.add("dragging");
        findTab(dragState.tabId)?.tab.tabEl?.classList.add("drag-ghost");
      }
      clearDropMarks();
      findTab(dragState.tabId)?.tab.tabEl?.classList.add("drag-ghost");
      dragState.drop = computeDrop(event.clientX, event.clientY);
      const drop = dragState.drop;
      if (!drop) return;
      if (drop.kind === "tab") {
        const target = groupById(drop.groupId);
        target?.strip.classList.add("drop-target");
        const tabs = target?.tabs ?? [];
        if (drop.index < tabs.length) tabs[drop.index].tabEl?.classList.add("drop-left");
        else tabs[tabs.length - 1]?.tabEl?.classList.add("drop-right");
      } else if (drop.kind === "newGroup") {
        drop.el.classList.add("drop-hover");
      } else if (drop.kind === "column") {
        const source = groupById(dragState.groupId);
        source?.col.classList.add("dragging-col");
        const ref = groups[drop.index] ?? null;
        if (ref) ref.col.classList.add("drop-before");
        else groups[groups.length - 1]?.col.classList.add("drop-after");
      }
    };

    const computeDrop = (x, y) => {
      const newGroupEl = [...document.querySelectorAll('[data-ws-drop="new-group"]')].find((el) => {
        const r = el.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      });
      if (newGroupEl) return { kind: "newGroup", el: newGroupEl };
      const tolerance = 8;
      for (const group of groups) {
        if (!group.col || group.col.offsetParent === null) continue;
        const r = group.head.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top - tolerance || y > r.bottom + tolerance) continue;
        let index = group.tabs.length;
        for (let i = 0; i < group.tabs.length; i += 1) {
          const tr = group.tabs[i].tabEl?.getBoundingClientRect();
          if (tr && x < tr.left + tr.width / 2) {
            index = i;
            break;
          }
        }
        return { kind: "tab", groupId: group.id, index };
      }
      const source = groupById(dragState.groupId);
      if (source && source.tabs.length === 1) {
        let index = groups.length;
        for (let i = 0; i < groups.length; i += 1) {
          const r = groups[i].col.getBoundingClientRect();
          if (x < r.left + r.width / 2) {
            index = i;
            break;
          }
        }
        return { kind: "column", index };
      }
      return null;
    };

    const endDrag = (cancelled) => {
      const state = dragState;
      clearDropMarks();
      root.classList.remove("dragging");
      if (!state) return;
      if (state.started) {
        // Swallow the click that follows the drag.
        state.suppressClick = true;
        setTimeout(() => {
          if (dragState === state) dragState = null;
        }, 0);
      } else dragState = null;
      if (!state.started || cancelled || !state.drop) return;
      const drop = state.drop;
      if (drop.kind === "tab") moveTab(state.tabId, drop.groupId, drop.index);
      else if (drop.kind === "newGroup") moveTabToNewGroup(state.tabId);
      else if (drop.kind === "column") moveGroup(state.groupId, drop.index);
      ctx.events.emit("Workspace:dragFinished", {});
    };

    // ------------------------------------------------------------ frame events
    ctx.events.on("Frames:location", ({ frameKey, href }) => {
      const hit = findByFrame(frameKey);
      if (!hit || !isHttpUrl(href)) return;
      if (hit.tab.pendingNewChat && !hit.tab.pendingNewChatUntilLoad) hit.tab.pendingNewChat = false;
      hit.tab.href = href;
      if (hit.tab.homeIntent && !isNewTopicUrl(appOf(hit.tab), href)) hit.tab.homeIntent = false;
      publish("location");
    });
    // Icons the chat pages declared themselves, remembered per app address so lists (app picker, settings)
    // can show them before a page of that app is open; the browser favicon service is only a fallback.
    // Site icon cache (07 §1.3): v8 is current; v4–v7 belong to old versions and are dropped on sight.
    const PAGE_ICONS_KEY = "chatclub.faviconCache.v8";
    try {
      for (const v of [4, 5, 6, 7]) localStorage.removeItem(`chatclub.faviconCache.v${v}`);
      const early = localStorage.getItem("chatclub.appPageIcons");
      if (early !== null) {
        if (localStorage.getItem(PAGE_ICONS_KEY) === null) localStorage.setItem(PAGE_ICONS_KEY, early);
        localStorage.removeItem("chatclub.appPageIcons");
      }
    } catch {
      // storage unavailable
    }
    const readPageIcons = () => {
      try {
        const v = JSON.parse(localStorage.getItem(PAGE_ICONS_KEY) || "{}");
        return v && typeof v === "object" ? v : {};
      } catch {
        return {};
      }
    };
    let pageIcons = readPageIcons();
    ctx.services.provide("favicons", { cached: (appUrl) => (appUrl && pageIcons[appUrl]) || "" });
    ctx.events.on("Frames:favicon", ({ frameKey, href }) => {
      const hit = findByFrame(frameKey);
      if (!hit || !isHttpUrl(href) || hit.tab.pageIcon === href) return;
      hit.tab.pageIcon = href;
      const appUrl = appOf(hit.tab)?.url;
      if (appUrl && pageIcons[appUrl] !== href) {
        pageIcons = { ...readPageIcons(), [appUrl]: href };
        try {
          localStorage.setItem(PAGE_ICONS_KEY, JSON.stringify(pageIcons));
        } catch {
          // storage unavailable: keep the in-memory copy
        }
      }
      renderHead(hit.group);
    });
    ctx.events.on("frameRegistered", () => renderHeads());
    ctx.events.on("Frames:capability", () => renderHeads());
    ctx.events.on("Frames:userClickedFrame", ({ frameKey }) => {
      // A click inside a chat frame closes page menus, like a click anywhere else.
      const hit = findByFrame(frameKey);
      if (!hit) return;
      lastActiveGroupId = hit.group.id;
      shellUi.closeMenus?.();
    });

    // Apps removed from the catalog: drop their tabs, keep the rest (02 §6.3).
    ctx.events.on("Apps:changed", () => {
      if (!booted) return;
      let touched = false;
      for (const group of [...groups]) {
        const kept = group.tabs.filter((tb) => apps.get(tb.appId));
        if (kept.length === group.tabs.length) continue;
        touched = true;
        const active = activeTab(group);
        for (const tb of group.tabs) if (!apps.get(tb.appId)) destroyTab(tb);
        group.tabs = kept;
        group.activeIndex = Math.max(0, kept.indexOf(active));
        if (!kept.length) {
          groups.splice(groups.indexOf(group), 1);
          group.col?.remove();
        }
      }
      if (!groups.length) {
        const first = apps.list()[0];
        if (first) {
          const group = { id: uid("grp"), tabs: [makeTab(first.id)], activeIndex: 0 };
          groups.push(group);
          startTab(group, group.tabs[0]);
        }
      }
      // Saved iframe permissions take effect right away: rebuild frames whose attributes differ (06 §5.4).
      for (const group of groups) {
        for (const tb of group.tabs) {
          const app = apps.get(tb.appId);
          if (!app || !tb.iframe || !tb.href) continue;
          if (JSON.stringify(frameAttributes(app, tb.href)) !== tb.attrsKey) mountFrame(tb, tb.href, { newTopic: false });
        }
      }
      if (touched) changed("appsChanged");
      else renderHeads();
    });

    ctx.onDispose(groupButtons.subscribe(() => renderHeads()));
    ctx.onDispose(contextMenuEntries.subscribe(() => {}));
    ctx.onDispose(ctx.plugin.settings.use(["tabGroupButtonPlacement", "tabGroupButtonOrder"], () => renderHeads()));
    ctx.onDispose(ctx.plugin.settings.use(["colMaxCount"], () => layoutColumns()));
    ctx.events.on("I18n:languageChanged", () => renderHeads());
    ctx.events.on("Shortcuts:changed", () => renderHeads());

    // ------------------------------------------------------------ frame toast
    const FRAME_TOAST_INSET = 12;
    const shellStore = () => ctx.host.plugins.AppShell?.settings?.store;
    // Same lengths as the page toasts (06 §3.3); errors stay twice as long. 0 keeps a toast until dismissed.
    const STAY_MS = { short: 1600, default: 3200, long: 32000 };
    const frameToast = (groupOrFrame, text, { type = "message", spinner = false, duration } = {}) => {
      const group = groupById(groupOrFrame) ?? findByFrame(groupOrFrame)?.group ?? currentGroup();
      if (!group?.body) return () => {};
      const stay = STAY_MS[shellStore()?.toastStay] ?? STAY_MS.default;
      if (duration !== 0) duration = type === "error" ? stay * 2 : stay;
      const position = shellStore()?.frameToastPosition ?? {};
      const el = h("div.cc-ws-frame-toast", { dataset: { type }, attrs: { role: "status" } },
        spinner ? ui.spinner() : type === "success" ? icon("check", { size: 14 }) : type === "error" ? icon("circleAlert", { size: 14 }) : null,
        h("span", text));
      const pct = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : d);
      // The point is where the toast sits inside the column: 0/0 is the top-left corner, 100/100 the
      // bottom-right; the toast is shifted by the same share of its own size so it never leaves the column.
      const x = pct(position.x, 100);
      const y = pct(position.y, 100);
      el.style.left = `calc(${FRAME_TOAST_INSET}px + (100% - ${2 * FRAME_TOAST_INSET}px) * ${x / 100})`;
      el.style.top = `calc(${FRAME_TOAST_INSET}px + (100% - ${2 * FRAME_TOAST_INSET}px) * ${y / 100})`;
      el.style.transform = `translate(-${x}%, -${y}%)`;
      group.body.append(el);
      let timer = duration > 0 ? setTimeout(() => el.remove(), duration) : null;
      return () => {
        clearTimeout(timer);
        timer = null;
        el.remove();
      };
    };

    // Appearance → Site toast: drag the sample toast inside a small column preview (06 §3.3).
    ctx.contribute("appearance.group", {
      id: "Workspace:frameToast",
      tab: "workspace",
      order: 40,
      titleKey: "workspace.toast.card",
      render(container, gctx) {
        const store = shellStore();
        if (!store) return;
        const pct = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : d);
        let pos = { x: pct(store.frameToastPosition?.x, 100), y: pct(store.frameToastPosition?.y, 100) };
        const sample = h("div.cc-ws-frame-toast.cc-ws-toast-sample", { dataset: { type: "success" } }, icon("check", { size: 14 }), h("span", t("workspace.toast.sample")));
        const preview = h("div.cc-ws-toast-preview", { attrs: { tabindex: "0", role: "slider", "aria-label": t("workspace.toast.position") } }, h("div.cc-ws-toast-preview-head"), sample);
        const coords = h("span.cc-ws-toast-coords");
        const place = () => {
          sample.style.left = `calc(${FRAME_TOAST_INSET}px + (100% - ${2 * FRAME_TOAST_INSET}px) * ${pos.x / 100})`;
          sample.style.top = `calc(${FRAME_TOAST_INSET}px + (100% - ${2 * FRAME_TOAST_INSET}px) * ${pos.y / 100})`;
          sample.style.transform = `translate(-${pos.x}%, -${pos.y}%)`;
          coords.textContent = t("workspace.toast.coords", { x: pos.x, y: pos.y });
          preview.setAttribute("aria-valuetext", coords.textContent);
        };
        const save = () => (store.frameToastPosition = { ...pos });
        const fromPointer = (e) => {
          const r = preview.getBoundingClientRect();
          pos = { x: pct(((e.clientX - r.left) / r.width) * 100, pos.x), y: pct(((e.clientY - r.top) / r.height) * 100, pos.y) };
          place();
        };
        preview.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          preview.setPointerCapture?.(e.pointerId);
          preview.focus();
          fromPointer(e);
          const move = (ev) => fromPointer(ev);
          const up = () => {
            preview.removeEventListener("pointermove", move);
            preview.removeEventListener("pointerup", up);
            preview.removeEventListener("pointercancel", up);
            save();
          };
          preview.addEventListener("pointermove", move);
          preview.addEventListener("pointerup", up);
          preview.addEventListener("pointercancel", up);
        });
        preview.addEventListener("keydown", (e) => {
          const step = e.shiftKey ? 5 : 1;
          const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
          if (!d) return;
          e.preventDefault();
          pos = { x: pct(pos.x + d[0], pos.x), y: pct(pos.y + d[1], pos.y) };
          place();
          save();
        });
        const reset = ui.button({ label: t("workspace.toast.reset"), onClick: () => {
          pos = { x: 100, y: 100 };
          place();
          save();
        } });
        place();
        container.append(
          ui.field({ label: t("workspace.toast.position"), desc: t("workspace.toast.position.desc"), control: h("div.cc-ws-toast-setting", preview, h("div.cc-ws-toast-meta", coords, reset)) }),
          ui.field({
            label: t("appShell.toastStay"),
            desc: t("appShell.toastStay.description"),
            control: ui.select({
              value: store.toastStay ?? "default",
              options: ["short", "default", "long"].map((v) => ({ value: v, label: t(`appShell.toastStay.${v}`) })),
              onChange: (v) => (store.toastStay = v),
            }),
          }),
        );
        void gctx;
      },
    });

    // Appearance → Tab Group (06 §3.4): group buttons in three zones, the tab context menu in two.
    ctx.contribute("appearance.group", {
      id: "Workspace:tabGroupButtons",
      tab: "tabGroup",
      order: 0,
      titleKey: "workspace.zones.buttonsCard",
      render(container) {
        const probe = {};
        const items = [
          ...groupEntries().map((e) => ({ id: e.id, label: labelOf(e, probe), icon: evaluate(e.icon, probe, null) })),
          { id: "more", label: t("workspace.group.more"), icon: "more", locked: "pinned" },
        ];
        container.append(
          h("p.cc-zones-desc", t("workspace.zones.buttonsDesc")),
          zoneBoard({
            zones: [
              { id: "pinned", label: t("workspace.zones.pinned") },
              { id: "menu", label: t("workspace.zones.menu"), note: t("workspace.zones.menuNote") },
              { id: "hidden", label: t("workspace.zones.hidden") },
            ],
            items,
            zoneOf: (id) => (id === "more" ? "pinned" : placementOf({ id, defaultPlacement: groupButtons.sorted().find((e) => e.id === id)?.defaultPlacement })),
            order: ctx.settings.tabGroupButtonOrder ?? GROUP_BUTTON_ORDER,
            emptyText: t("workspace.zones.empty"),
            lockedTip: t("workspace.zones.moreLocked"),
            onChange: (placement, order) => {
              delete placement.more;
              ctx.settings.tabGroupButtonPlacement = placement;
              ctx.settings.tabGroupButtonOrder = order.filter((id) => id !== "more");
            },
          }),
        );
      },
    });
    ctx.contribute("appearance.group", {
      id: "Workspace:tabContextMenu",
      tab: "tabGroup",
      order: 10,
      titleKey: "workspace.zones.menuCard",
      render(container) {
        const probe = {};
        const merged = new Map();
        for (const e of [...groupEntries().filter((x) => x.id !== "removeGroup" && x.contextMenu !== false), ...contextMenuEntries.sorted()]) if (!merged.has(e.id)) merged.set(e.id, e);
        const hidden = new Set(ctx.settings.tabContextMenuHiddenIds ?? []);
        container.append(
          h("p.cc-zones-desc", t("workspace.zones.menuDesc")),
          zoneBoard({
            zones: [{ id: "shown", label: t("workspace.zones.shown") }, { id: "hidden", label: t("workspace.zones.hidden") }],
            items: [...merged.values()].map((e) => ({ id: e.id, label: labelOf(e, probe), icon: evaluate(e.icon, probe, null) })),
            zoneOf: (id) => (hidden.has(id) ? "hidden" : "shown"),
            order: ctx.settings.tabContextMenuOrder ?? CONTEXT_MENU_ORDER,
            emptyText: t("workspace.zones.empty"),
            onChange: (placement, order) => {
              ctx.settings.tabContextMenuHiddenIds = Object.keys(placement).filter((id) => placement[id] === "hidden");
              ctx.settings.tabContextMenuOrder = order;
            },
          }),
        );
      },
    });

    // ------------------------------------------------------------ snapshot (02 §12.1)
    const getSnapshot = () => {
      const fsIndex = groups.findIndex((g) => g.id === fullscreenGroupId);
      return {
        schemaVersion: 1,
        generation: null,
        layout: { ...layoutInfo },
        groups: groups.map((g) => ({ tabs: g.tabs.map((tb) => ({ appId: tb.appId, currentHref: restorableHref(currentHrefSync(tb), appOf(tb)?.url) })), activeIndex: g.activeIndex })),
        fullscreenGroupIndex: fsIndex >= 0 ? fsIndex : null,
        topicTitle: topic.title,
        topicTitleCustom: topic.custom,
      };
    };
    const applySnapshot = (snapshot, { reason = "restore" } = {}) => {
      if (!snapshot || !Array.isArray(snapshot.groups)) return false;
      if (snapshot.layout && typeof snapshot.layout === "object") layoutInfo = { ...snapshot.layout };
      topic = { title: String(snapshot.topicTitle ?? ""), custom: !!snapshot.topicTitleCustom };
      build(snapshot.groups.map((g) => ({ tabs: (g.tabs ?? []).map((tb) => ({ appId: tb.appId, currentHref: isHttpUrl(tb.currentHref) ? restorableHref(tb.currentHref, apps?.get?.(tb.appId)?.url) : undefined })), activeIndex: g.activeIndex })), {
        fullscreenGroupIndex: snapshot.fullscreenGroupIndex,
        reason,
      });
      ctx.events.emit("Workspace:topicChanged", { ...topic });
      return true;
    };

    const waitForFramesLoaded = (timeoutMs = 45000) =>
      new Promise((resolve) => {
        const done = () => groups.every((g) => g.tabs.every((tb) => !tb.loading));
        if (done()) return resolve(true);
        const timer = setTimeout(() => {
          off();
          resolve(false);
        }, timeoutMs);
        const off = store.subscribe(() => {
          if (!done()) return;
          clearTimeout(timer);
          off();
          resolve(true);
        });
      });

    // ------------------------------------------------------------ service
    const api = {
      workspaceId: () => workspaceId,
      setWorkspaceId,
      newWorkspaceId,
      isBooted: () => booted,
      groups: publicGroups,
      getSnapshot,
      applySnapshot,
      buildFromAppGroups: (appIdGroups, { layout, reason = "layout" } = {}) => {
        if (layout) layoutInfo = { ...layout };
        build(fromAppIdGroups(appIdGroups), { reason });
      },
      appIdGroups: () => groups.map((g) => g.tabs.map((tb) => tb.appId)),
      getLayoutInfo: () => ({ ...layoutInfo }),
      setLayoutInfo: (info) => {
        layoutInfo = { ...info };
        publish("layoutInfo");
      },
      getTopic: () => ({ ...topic }),
      setTopic: ({ title = "", custom = false } = {}) => {
        topic = { title: String(title), custom: !!custom };
        ctx.events.emit("Workspace:topicChanged", { ...topic });
        publish("topic");
      },
      /** Active tab of every column: what the composer sends to. */
      activeTargets: () => groups.map((g) => {
        const tab = activeTab(g);
        return tab ? { groupId: g.id, tabId: tab.id, appId: tab.appId, frameKey: tab.frameKey, registered: !!tab.frameKey && frames.isRegistered(tab.frameKey), loading: tab.loading } : null;
      }).filter(Boolean),
      /** Displayed tabs: every column's active tab, or only the fullscreen column's (04 §1.2). */
      displayedTargets: () => api.activeTargets().filter((tg) => !fullscreenGroupId || tg.groupId === fullscreenGroupId),
      iframeOf: (tabId) => findTab(tabId)?.tab.iframe ?? null,
      /** Briefly outlines a tab's iframe so the user sees which column a card refers to. */
      highlightTab: (tabId) => {
        const hit = findTab(tabId);
        if (!hit) return false;
        if (activeTab(hit.group) !== hit.tab) setActive(hit.group.id, hit.tab.id);
        const el = hit.group.col;
        if (!el) return false;
        el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        el.classList.remove("cc-highlight");
        void el.offsetWidth;
        el.classList.add("cc-highlight");
        setTimeout(() => el.classList.remove("cc-highlight"), 1600);
        return true;
      },
      tabByFrame: (frameKey) => {
        const hit = findByFrame(frameKey);
        return hit ? { groupId: hit.group.id, ...publicTab(hit.tab) } : null;
      },
      tab: (tabId) => {
        const hit = findTab(tabId);
        return hit ? { groupId: hit.group.id, index: hit.index, ...publicTab(hit.tab) } : null;
      },
      addGroup,
      addTab,
      closeTab,
      removeGroup,
      setActive,
      moveTab,
      moveGroup,
      moveTabToNewGroup,
      navigateTab,
      refreshTab,
      homeTab,
      currentHref,
      currentHrefSync: (tabId) => {
        const hit = findTab(tabId);
        return hit ? currentHrefSync(hit.tab) : "";
      },
      clearPendingNewChat: (tabId) => {
        const hit = findTab(tabId);
        if (hit) hit.tab.pendingNewChat = false;
      },
      currentGroup: (source) => {
        const group = currentGroup(source);
        return group ? { id: group.id, activeTabId: activeTab(group)?.id ?? null } : null;
      },
      fullscreenGroupId: () => fullscreenGroupId,
      toggleFullscreen,
      isNewTopicUrl: (appId, href) => isNewTopicUrl(apps.get(appId), href),
      frameToast,
      waitForFramesLoaded,
      refreshButtons: () => renderHeads(),
      groupColumn: (groupId) => groupById(groupId)?.col ?? null,
      root,
    };
    ctx.services.provide("workspace", api);

    // ------------------------------------------------------------ boot
    const boot = async () => {
      // Wait for every domReady plugin (content providers, presets) even if we were started early as a dependency.
      await ctx.host.whenPhaseDone("domReady");
      let restored = false;
      for (const provider of contentProviders.sorted()) {
        try {
          const snapshot = await provider.provide({ workspaceId, workspace: api });
          if (snapshot && applySnapshot(snapshot, { reason: `restore:${provider.id}` })) {
            restored = true;
            break;
          }
        } catch (error) {
          ctx.logger.warn(`Workspace content provider "${provider.id}" failed:`, error);
        }
      }
      if (!restored) {
        const presets = ctx.services.get("layoutPresets");
        const initial = presets?.current?.() ?? null;
        if (initial) {
          layoutInfo = { type: "preset", presetId: initial.id };
          build(fromAppIdGroups(initial.chatAppIdGroups), { reason: "preset" });
        } else {
          build(fromAppIdGroups(DEFAULT_LAYOUT_APPS), { reason: "default" });
        }
      }
      booted = true;
      publish("booted", { structural: false });
      ctx.events.emit("Workspace:ready", { workspaceId, restored });
      ctx.host.fireWorkspaceReady();
    };
    boot().catch((error) => {
      ctx.logger.error("Workspace boot failed:", error);
      shellUi.showFatal?.(String(error?.message || error));
    });

    ctx.onDispose(() => clearAll());
  },
};
