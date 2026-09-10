import { t } from "../../shared/i18n.js";
import {
  fullTextTextsOverlap,
  pocketPagesFromWorkspaceFullText,
  pocketPairsFromMessages
} from "../../shared/workspace-tab-fulltext.js";
import { button, claimOverlaySearchCaret, clear, el, input, pinOverlaySearchCaret, releaseOverlaySearchCaret, viewerModal } from "../../ui/dom.js";
import { createViewerWindowChrome } from "../../ui/viewer-window.js";
import { renderChatFavicon, renderChatFaviconStack, uniqueChatFaviconSources } from "../../ui/favicon.js";
import {
  optionalControllerFunction,
  optionalControllerObject,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";
import {
  collectWorkspaceSearchRecords,
  groupWorkspaceSearchRecords,
  highlightQuery,
  loadRecordFullTextEnabled,
  loadWorkspaceTabFullTextStore,
  workspaceSearchRecordTime
} from "./tab-search.js";

const SEARCH_PANEL_SIZE_KEY = "chatclub.tabsSearchPanelSize.v1";
const SEARCH_PANEL_MIN_WIDTH = 720;
const SEARCH_PANEL_MIN_HEIGHT = 420;
const SEARCH_PANEL_FULLSCREEN_CLASS = "workspace-tabs-search-modal-fullscreen";
const SEARCH_CARD_GAP = 12;

export function createTabSearchController(ctx) {
  const controllerName = "Tabs search controller";
  ctx = validateControllerContract(ctx, controllerName, {
    requestBackground: "function",
    toast: "function",
    svgIcon: "function",
    compactIconButton: "function",
    setFramePointerBlockedForOverlay: "function?",
    faviconPort: "object?",
    inferAppName: "function?",
    appById: "function?",
    currentWorkspace: "function?",
    loadFullText: "function?",
    loadRecordFullText: "function?"
  });
  const requestBackground = requireControllerFunction(ctx, controllerName, "requestBackground");
  const toastFn = requireControllerFunction(ctx, controllerName, "toast");
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const compactIconButton = requireControllerFunction(ctx, controllerName, "compactIconButton");
  const setFramePointerBlockedForOverlay = optionalControllerFunction(ctx, "setFramePointerBlockedForOverlay", () => {});
  const faviconPort = optionalControllerObject(ctx, "faviconPort");
  const inferAppName = optionalControllerFunction(ctx, "inferAppName", (app) => app?.name || app?.id || "");
  const appById = optionalControllerFunction(ctx, "appById", (id) => ({ id }));
  const currentWorkspace = optionalControllerFunction(ctx, "currentWorkspace", () => null);
  const loadFullText = optionalControllerFunction(ctx, "loadFullText", loadWorkspaceTabFullTextStore);
  const loadRecordFullText = optionalControllerFunction(ctx, "loadRecordFullText", loadRecordFullTextEnabled);
  let searchQuery = "";
  let searchFocused = true;
  let searchComposing = false;
  let searchSelection = { start: 0, end: 0 };
  let items = [];
  let fullTextStore = {};
  let recordFullTextEnabled = false;
  let activeWorkspaceId = "";
  let opening = false;
  let currentRedraw = null;
  const viewerWindow = createViewerWindowChrome({
    fullscreenClass: SEARCH_PANEL_FULLSCREEN_CLASS,
    sizeKey: SEARCH_PANEL_SIZE_KEY,
    minWidth: SEARCH_PANEL_MIN_WIDTH,
    minHeight: SEARCH_PANEL_MIN_HEIGHT,
    buttonClass: "icon-button tooltip-trigger workspace-tabs-search-window-button overlay-window-button",
    t,
    svgIcon,
    onChange: () => currentRedraw?.(),
    onPointerBlock: (blocked) => setFramePointerBlockedForOverlay(blocked, "tabs-search")
  });

  function overlayCurrent(item = {}) {
    if (item?.current !== true) return item;
    let current = null;
    try { current = currentWorkspace(); } catch { return item; }
    if (!current || typeof current !== "object") return item;
    const appIds = Array.isArray(current.appIds) && current.appIds.length
      ? current.appIds.map((id) => String(id || "").trim()).filter(Boolean)
      : item.appIds;
    return {
      ...item,
      topicTitle: String(current.topicTitle || "").trim() || item.topicTitle,
      layoutName: String(current.layoutName || "").trim() || item.layoutName,
      appIds: Array.isArray(appIds) && appIds.length ? appIds : item.appIds
    };
  }

  function recordTitle(item = {}, index = 0) {
    const topicTitle = String(item.topicTitle || item.title || "").trim();
    if (topicTitle) return topicTitle;
    const names = (Array.isArray(item.appIds) ? item.appIds : [])
      .map((appId) => String(inferAppName(appById(appId)) || appId || "").trim())
      .filter(Boolean);
    return names.join(" · ") || t("workspace.tabs.untitled", { index: index + 1 });
  }

  function visibleRecords() {
    return collectWorkspaceSearchRecords({
      items: items.map(overlayCurrent),
      store: fullTextStore,
      query: searchQuery,
      fullTextEnabled: recordFullTextEnabled,
      labelOf: recordTitle
    });
  }

  function activeRecord(records = visibleRecords()) {
    const selected = records.find((record) => record.workspaceId === activeWorkspaceId);
    if (selected) return selected;
    activeWorkspaceId = records[0]?.workspaceId || "";
    return records[0] || null;
  }

  function searchCaretOptions() {
    return {
      getSelection: () => searchSelection,
      composing: () => searchComposing,
      onLeave: () => { searchFocused = false; }
    };
  }

  function restoreSearchField() {
    requestAnimationFrame(() => {
      const field = document.querySelector(".workspace-tabs-search-modal .workspace-tabs-search-input");
      if (!field) return;
      if (searchFocused) {
        claimOverlaySearchCaret(field, searchCaretOptions());
        field.focus();
      }
      try {
        const start = Number(searchSelection.start);
        const end = Number(searchSelection.end);
        field.setSelectionRange(
          Number.isFinite(start) ? start : field.value.length,
          Number.isFinite(end) ? end : field.value.length
        );
      } catch {
        /* selection restoration is best-effort after redraw */
      }
    });
  }

  function searchPlaceholder() {
    return recordFullTextEnabled
      ? t("workspace.tabs.searchPlaceholderFullText")
      : t("workspace.tabs.searchPlaceholder");
  }

  function syncSearchChrome(root) {
    const query = searchQuery;
    const placeholder = searchPlaceholder();
    const field = root?.querySelector?.(".workspace-tabs-search-input");
    const clearButton = root?.querySelector?.(".shortcut-search-clear");
    if (field) {
      if (field.value !== query) field.value = query;
      field.placeholder = placeholder;
      field.setAttribute("aria-label", placeholder);
    }
    if (clearButton) clearButton.hidden = !String(query || "").trim();
  }

  function applySearchQuery(value, { composing = false, redraw } = {}) {
    searchQuery = String(value || "");
    const field = document.querySelector(".workspace-tabs-search-modal .workspace-tabs-search-input");
    searchSelection = {
      start: Number(field?.selectionStart) || searchQuery.length,
      end: Number(field?.selectionEnd) || searchQuery.length
    };
    if (composing || searchComposing) return;
    redraw();
  }

  function clearSearch(redraw) {
    searchQuery = "";
    searchSelection = { start: 0, end: 0 };
    searchFocused = true;
    const field = document.querySelector(".workspace-tabs-search-modal .workspace-tabs-search-input");
    if (field) field.value = "";
    redraw();
  }

  function faviconDeps() {
    return {
      appFaviconUrl: faviconPort.app,
      effectiveFaviconUrl: faviconPort.effective,
      fallbackFaviconUrl: faviconPort.fallback,
      browserFaviconUrl: faviconPort.browserUrl || faviconPort.browser,
      siteFaviconUrls: faviconPort.siteUrls,
      networkFaviconUrls: faviconPort.networkUrls,
      candidateFaviconUrls: typeof faviconPort.candidates === "function"
        ? (href, logoUrl, options) => faviconPort.candidates(href, logoUrl, options)
        : undefined,
      rememberDecodedFavicon: typeof faviconPort.rememberDecoded === "function"
        ? (href, image) => faviconPort.rememberDecoded(href, image)
        : undefined
    };
  }

  function pageFavicons(pages = [], stackClass = "") {
    return renderChatFaviconStack(uniqueChatFaviconSources(pages, (page) => {
      const href = page?.href || page?.url || "";
      return {
        href,
        logoUrl: page?.logoUrl || "",
        appId: page?.appId || href,
        title: page?.siteName || page?.name || page?.title || ""
      };
    }), { ...faviconDeps(), omitTitle: true, stackClass });
  }

  function recordFavicons(record, pages = []) {
    if (pages.length) return pageFavicons(pages, "workspace-tabs-search-favicons");
    const ids = Array.isArray(record?.appIds) ? record.appIds : [];
    return renderChatFaviconStack(uniqueChatFaviconSources(ids, (appId) => {
      const app = appById(appId) || { id: appId };
      return { app, appId, href: app?.url || "", title: inferAppName(app) || appId };
    }), { ...faviconDeps(), omitTitle: true, stackClass: "workspace-tabs-search-favicons" });
  }

  function timeLabel(value) {
    const ms = workspaceSearchRecordTime({ viewedAt: value, updatedAt: value });
    if (ms == null) return "";
    try {
      return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  }

  function previewPages(record) {
    return pocketPagesFromWorkspaceFullText(fullTextStore, record?.workspaceId);
  }

  function previewEntries(pages = []) {
    const entries = [];
    for (const page of pages) {
      for (const pair of pocketPairsFromMessages(page.messages)) {
        entries.push({
          title: page.title || page.pageTitle || page.siteName || page.name,
          appName: page.siteName || page.name,
          chatUrl: page.href || page.url,
          appId: page.appId,
          logoUrl: page.logoUrl,
          userMessage: pair.userMessage,
          assistantMessage: pair.assistantMessage
        });
      }
    }
    return entries;
  }

  function clusterEntries(entries = []) {
    const list = Array.isArray(entries) ? entries : [];
    const used = new Set();
    const clusters = [];
    let loose = [];
    const flush = () => {
      if (!loose.length) return;
      clusters.push({ merged: false, entries: loose });
      loose = [];
    };
    for (let index = 0; index < list.length; index += 1) {
      if (used.has(index)) continue;
      const seed = list[index];
      const seedUser = String(seed?.userMessage || "").trim();
      if (!seedUser) {
        flush();
        clusters.push({ merged: false, entries: [seed] });
        used.add(index);
        continue;
      }
      const group = [seed];
      const groupIndexes = [index];
      for (let next = index + 1; next < list.length; next += 1) {
        if (used.has(next)) continue;
        if (!fullTextTextsOverlap(seedUser, list[next]?.userMessage)) continue;
        group.push(list[next]);
        groupIndexes.push(next);
      }
      if (group.length > 1) {
        flush();
        groupIndexes.forEach((groupIndex) => used.add(groupIndex));
        clusters.push({
          userMessage: group.reduce((longest, entry) => (
            String(entry.userMessage || "").length > String(longest || "").length ? entry.userMessage : longest
          ), seedUser),
          entries: group,
          merged: true
        });
        continue;
      }
      used.add(index);
      loose.push(seed);
    }
    flush();
    return clusters;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      toastFn(t("toast.pocketCopied"), "success");
    } catch (error) {
      console.warn("[ChatClub] Failed to copy Tabs search message", error);
      toastFn(t("toast.copyFailed"), "error");
    }
  }

  function conversationTurn(message = {}) {
    const role = message.role === "assistant" ? "assistant" : "user";
    const text = String(message.text || "");
    if (!text.trim() && role !== "assistant") return null;
    const copyLabel = role === "assistant" ? t("pocket.copyAssistantMessage") : t("pocket.copyUserMessage");
    return el("section", { class: `pocket-message pocket-message-${role}` },
      el("div", { class: "pocket-message-head" },
        el("span", { class: "pocket-message-label" }, t(role === "assistant" ? "common.assistant" : "common.user")),
        compactIconButton(copyLabel, "copy", (event) => {
          event.preventDefault();
          copyText(text);
        }, "pocket-message-copy", copyLabel, "", role === "assistant" ? "pocket.copyAssistantMessage" : "pocket.copyUserMessage")
      ),
      el("p", { class: "pocket-message-body pocket-message-plain" }, ...highlightQuery(text, searchQuery))
    );
  }

  function entryFavicon(entry = {}) {
    return renderChatFavicon({
      href: entry.chatUrl || "",
      logoUrl: entry.logoUrl || "",
      appId: entry.appId || "",
      title: ""
    }, { ...faviconDeps(), className: "pocket-entry-favicon", omitTitle: true })
      || svgIcon("search");
  }

  function entryRow(entry, options = {}) {
    const assistantOnly = Boolean(options.assistantOnly);
    const title = entry.title || entry.appName || t("workspace.tabs.untitled", { index: 1 });
    return el("article", { class: `ui-card pocket-entry${assistantOnly ? " pocket-entry-assistant-only" : ""}` },
      el("header", { class: "pocket-entry-header" },
        el("div", { class: "pocket-entry-titleblock" },
          el("div", { class: "pocket-entry-title" },
            entryFavicon(entry),
            el("strong", {}, ...highlightQuery(title, searchQuery))
          ),
          entry.chatUrl ? el("div", { class: "pocket-entry-url" }, entry.chatUrl) : null
        ),
        entry.appName ? el("div", { class: "pocket-entry-meta" },
          el("span", { class: "pocket-entry-source" }, entry.appName)
        ) : null
      ),
      el("div", { class: "pocket-message-grid" },
        assistantOnly ? null : conversationTurn({ role: "user", text: entry.userMessage }),
        conversationTurn({ role: "assistant", text: entry.assistantMessage })
      )
    );
  }

  function entryCluster(cluster) {
    const entryCount = Math.max(1, cluster.entries.length);
    return el("section", {
      class: `pocket-entry-cluster${cluster.merged ? " pocket-entry-cluster-merged" : ""}`,
      dataset: { entryCount }
    },
      cluster.merged
        ? el("div", { class: "pocket-shared-user-message" }, conversationTurn({ role: "user", text: cluster.userMessage }))
        : null,
      el("div", { class: "pocket-batch-row" },
        cluster.entries.map((entry) => entryRow(entry, { assistantOnly: cluster.merged }))
      )
    );
  }

  function applyCardWidth(host) {
    const width = 460;
    host?.style?.setProperty("--pocket-card-width", `${width}px`);
    host?.querySelectorAll?.(".pocket-entry-cluster[data-entry-count]").forEach((cluster) => {
      const count = Math.max(1, Number(cluster.dataset.entryCount) || 1);
      cluster.style.setProperty("--pocket-cluster-row-width", `${Math.round((count * width) + ((count - 1) * SEARCH_CARD_GAP))}px`);
    });
  }

  function preview(record, host) {
    if (!record) {
      return el("div", { class: "ui-empty-state pocket-empty workspace-tabs-search-empty" },
        svgIcon("search"),
        el("strong", {}, t("workspace.tabs.searchPreviewEmpty"))
      );
    }
    const pages = previewPages(record);
    const clusters = clusterEntries(previewEntries(pages));
    if (!clusters.length) {
      return el("div", { class: "ui-empty-state pocket-empty workspace-tabs-search-empty" },
        svgIcon("search"),
        el("strong", {}, t(recordFullTextEnabled ? "workspace.tabs.searchPreviewEmpty" : "workspace.tabs.fullTextDisabled"))
      );
    }
    const node = el("div", { class: "workspace-tabs-search-preview" },
      clusters.map((cluster) => entryCluster(cluster))
    );
    applyCardWidth(host);
    return node;
  }

  function headerSearch(redraw, close) {
    const placeholder = searchPlaceholder();
    const field = input(searchQuery, {
      class: "shortcut-search-input workspace-tabs-search-input",
      type: "search",
      size: "1",
      placeholder,
      "aria-label": placeholder,
      autocomplete: "off",
      spellcheck: "false"
    });
    field.value = searchQuery;
    field.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape" && searchQuery) {
        event.preventDefault();
        event.stopPropagation();
        clearSearch(redraw);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const records = visibleRecords();
        if (!records.length) return;
        const index = Math.max(0, records.findIndex((record) => record.workspaceId === activeWorkspaceId));
        const next = event.key === "ArrowDown"
          ? records[Math.min(records.length - 1, index + 1)]
          : records[Math.max(0, index - 1)];
        if (next) {
          activeWorkspaceId = next.workspaceId;
          redraw();
        }
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      openActiveTab(close);
    });
    field.addEventListener("compositionstart", () => { searchComposing = true; });
    field.addEventListener("compositionend", (event) => {
      searchComposing = false;
      applySearchQuery(String(event?.target?.value || ""), { redraw });
      pinOverlaySearchCaret();
    });
    field.addEventListener("input", (event) => {
      applySearchQuery(String(event?.target?.value || ""), {
        composing: Boolean(event?.isComposing),
        redraw
      });
    });
    field.addEventListener("focus", () => {
      searchFocused = true;
      claimOverlaySearchCaret(field, searchCaretOptions());
    });
    field.addEventListener("blur", (event) => {
      if (event.target?.isConnected === false) {
        releaseOverlaySearchCaret(field);
        return;
      }
      const pin = () => pinOverlaySearchCaret();
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(pin);
      else setTimeout(pin, 0);
    });
    return el("div", {
      class: "shortcut-search workspace-tabs-search-field",
      onclick: (event) => {
        if (event.target.closest(".shortcut-search-clear")) return;
        field.focus();
      }
    },
      svgIcon("search"),
      field,
      el("button", {
        class: "shortcut-search-clear",
        type: "button",
        hidden: !String(searchQuery || "").trim(),
        "aria-label": t("workspace.tabs.searchClear"),
        onpointerdown: (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          clearSearch(redraw);
        }
      }, svgIcon("x"))
    );
  }

  async function openActiveTab(close) {
    const record = activeRecord();
    if (!record || opening) return { opened: false };
    if (record.current) {
      close?.();
      return { opened: true, current: true };
    }
    opening = true;
    try {
      if (record.live && record.tabId != null) {
        try {
          await requestBackground("focusWorkspaceTab", { tabId: record.tabId });
        } catch {
          await requestBackground("openWorkspaceTab", { workspaceId: record.workspaceId });
        }
      } else {
        await requestBackground("openWorkspaceTab", { workspaceId: record.workspaceId });
      }
      close?.();
      return { opened: true };
    } catch {
      toastFn(t("toast.workspaceTabOpenFailed"), "error");
      return { opened: false };
    } finally {
      opening = false;
    }
  }

  function listItem(record, active, redraw, close) {
    return el("div", {
      class: `workspace-tabs-search-item${active ? " active" : ""}`
    },
      el("button", {
        class: "workspace-tabs-search-item-focus",
        type: "button",
        "aria-current": active ? "true" : null,
        onclick: () => {
          activeWorkspaceId = record.workspaceId;
          redraw();
        },
        ondblclick: (event) => {
          event.preventDefault();
          activeWorkspaceId = record.workspaceId;
          openActiveTab(close);
        }
      },
        el("span", { class: "workspace-tabs-search-item-title" }, ...highlightQuery(record.title || t("workspace.tabs.untitled", { index: 1 }), searchQuery)),
        el("span", { class: "workspace-tabs-search-item-foot" },
          recordFavicons(record, previewPages(record)),
          timeLabel(record.viewedAt || record.updatedAt || record.createdAt || record.detachedAt)
            ? el("time", { class: "workspace-tabs-search-item-time" }, timeLabel(record.viewedAt || record.updatedAt || record.createdAt || record.detachedAt))
            : null
        )
      )
    );
  }

  function sidebar(records, active, redraw, close) {
    const searching = Boolean(String(searchQuery || "").trim());
    const groups = groupWorkspaceSearchRecords(records);
    return el("aside", {
      class: "workspace-tabs-search-sidebar",
      "aria-label": t("workspace.tabs.searchSidebar")
    },
      records.length
        ? el("div", { class: "workspace-tabs-search-list", role: "list" },
          groups.flatMap((group) => [
            el("div", { class: "workspace-tabs-search-group", role: "heading", "aria-level": "5" }, t(group.labelKey)),
            ...group.items.map((record) => el("div", { class: "workspace-tabs-search-list-item", role: "listitem" },
              listItem(record, record.workspaceId === active?.workspaceId, redraw, close)
            ))
          ])
        )
        : el("div", { class: "workspace-tabs-search-sidebar-empty pocket-sidebar-empty" },
          t(searching ? "workspace.tabs.searchEmpty" : "workspace.tabs.empty")
        )
    );
  }

  function syncHeader(panel, redraw, close) {
    const titlebar = panel?.querySelector(".workspace-tabs-search-header-titlebar");
    if (!titlebar) return;
    const active = activeRecord();
    if (!titlebar.querySelector(".workspace-tabs-search-field")) {
      titlebar.append(
        headerSearch(redraw, close),
        el("div", { class: "workspace-tabs-search-header-actions" },
          button(t("workspace.tabs.searchOpenTab"), () => openActiveTab(close), "secondary")
        )
      );
    }
    syncSearchChrome(titlebar);
    const openButton = titlebar.querySelector(".workspace-tabs-search-header-actions .button");
    if (openButton) openButton.disabled = !active || opening;
  }

  function installHeader(panel) {
    const header = panel?.querySelector(".modal-header");
    const title = header?.querySelector("h2");
    const closeButton = header?.querySelector(".icon-button");
    if (!header || !title || !closeButton) return;
    if (header.querySelector(".workspace-tabs-search-header-sidebar")) return;
    closeButton.classList.add("workspace-tabs-search-window-button", "overlay-window-button");
    closeButton.replaceChildren(svgIcon("x"));
    title.before(el("div", { class: "workspace-tabs-search-header-sidebar" },
      el("span", { class: "workspace-tabs-search-title-icon", "aria-hidden": "true" }, svgIcon("search")),
      el("strong", { class: "workspace-tabs-search-chrome-title" }, t("workspace.tabs.searchTitle"))
    ));
    header.append(
      el("div", { class: "workspace-tabs-search-header-titlebar" }),
      el("div", { class: "workspace-tabs-search-window-actions" }, viewerWindow.fullscreenButton(panel), closeButton)
    );
  }

  function renderSearch(host, redraw, close) {
    const records = visibleRecords();
    const active = activeRecord(records);
    const panel = host.closest?.(".modal.workspace-tabs-search-modal");
    syncHeader(panel, redraw, close);
    clear(host);
    host.append(
      el("div", { class: "workspace-tabs-search-shell" },
        sidebar(records, active, redraw, close),
        el("main", { class: "workspace-tabs-search-main" }, preview(active, host))
      )
    );
    applyCardWidth(host);
  }

  async function refresh(redraw) {
    const [tabs, enabled, store] = await Promise.all([
      requestBackground("listLiveWorkspaceTabs").catch(() => ({ tabs: [] })),
      loadRecordFullText().catch(() => false),
      loadFullText().catch(() => ({}))
    ]);
    items = Array.isArray(tabs?.tabs) ? tabs.tabs : [];
    recordFullTextEnabled = enabled === true;
    fullTextStore = store || {};
    redraw?.();
  }

  function notifyFullTextChanged() {
    if (!currentRedraw) return;
    loadFullText().then((store) => {
      fullTextStore = store || {};
      currentRedraw?.();
    }).catch(() => currentRedraw?.());
  }

  function openSearchPanel(options = {}) {
    const seed = options && typeof options === "object" ? options : {};
    const seedQuery = String(seed.query || "");
    const seedWorkspaceId = String(seed.workspaceId || "");
    const existing = document.querySelector(".modal.workspace-tabs-search-modal");
    searchFocused = true;
    if (existing) {
      if (seedQuery) searchQuery = seedQuery;
      if (seedWorkspaceId) activeWorkspaceId = seedWorkspaceId;
      restoreSearchField();
      refresh(currentRedraw).catch(() => currentRedraw?.());
      return existing.closest(".modal-backdrop") || existing.parentElement;
    }
    searchQuery = seedQuery;
    searchComposing = false;
    searchSelection = { start: 0, end: 0 };
    activeWorkspaceId = seedWorkspaceId;
    const host = el("div", { class: "ui-dialog workspace-tabs-search-dialog" });
    let dialog;
    const close = () => {
      if (currentRedraw === redraw) currentRedraw = null;
      releaseOverlaySearchCaret(document.querySelector(".workspace-tabs-search-modal .workspace-tabs-search-input"));
      dialog?.remove();
    };
    const redraw = () => renderSearch(host, redraw, close);
    currentRedraw = redraw;
    dialog = viewerModal(t("workspace.tabs.searchTitle"), host, close, true, t("common.close"));
    dialog.classList.add("workspace-tabs-search-overlay");
    const panel = dialog.querySelector(".modal");
    panel?.classList.add("workspace-tabs-search-modal");
    installHeader(panel);
    viewerWindow.attachResize(panel);
    refresh(redraw).catch(() => redraw());
    redraw();
    restoreSearchField();
    return dialog;
  }

  return Object.freeze({
    openSearchPanel,
    notifyFullTextChanged
  });
}
