import { t } from "../../shared/i18n.js";
import { savePromptSendHistory } from "../../shared/storage-adapter.js";
import { normalizePocketIcon } from "../../shared/storage-schema.js";
import { createSettingsIconAction } from "../../ui/components.js";
import { clear, el, input, toast, viewerModal } from "../../ui/dom.js";
import {
  optionalControllerObject,
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";
import {
  uniqueChatFaviconSources,
  renderChatFaviconStack
} from "../../ui/favicon.js";
import {
  groupPromptHistory,
  promptHistoryImageCountLabel,
  promptHistoryItemMatchesSearch,
  promptHistoryMessageKey,
  promptHistoryConversationPages,
  promptHistoryConversationEntries,
  promptHistoryEntryClusters,
  promptHistoryPocketPages,
  promptHistoryPocketSaved,
  promptHistoryPreview,
  promptHistoryTimeLabel
} from "./model.js";

export function createHistoryController(ctx) {
  const controllerName = "History controller";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    setPromptImages: "function",
    syncPromptInputNode: "function",
    pocketPort: "object?",
    conversationPort: "object?",
    faviconPort: "object?"
  });
  const state = requireControllerContext(ctx, controllerName, "state");
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const setPromptImages = requireControllerFunction(ctx, controllerName, "setPromptImages");
  const syncPromptInputNode = requireControllerFunction(ctx, controllerName, "syncPromptInputNode");
  const pocketPort = optionalControllerObject(ctx, "pocketPort");
  const conversationPort = optionalControllerObject(ctx, "conversationPort");
  const faviconPort = optionalControllerObject(ctx, "faviconPort");
  const pocketDisplayIcon = () => normalizePocketIcon(state.options?.pocketIcon);
  const savePagesToPocket = typeof pocketPort.savePages === "function"
    ? pocketPort.savePages
    : async () => ({ saved: false, count: 0 });
  const loadPocketEntries = typeof pocketPort.loadEntries === "function"
    ? pocketPort.loadEntries
    : async () => [];
  const loadFullTextStore = typeof conversationPort.loadFullText === "function"
    ? conversationPort.loadFullText
    : async () => ({});
  const collectLivePreviewItems = typeof conversationPort.collectLive === "function"
    ? conversationPort.collectLive
    : async () => [];
  let searchQuery = "";
  let searchFocused = false;
  let searchComposing = false;
  let searchSelection = { start: 0, end: 0 };
  let activeItemId = "";
  let pocketEntries = [];
  let pocketBusy = false;
  let fullTextStore = {};
  let livePreviewItems = [];
  let livePreviewTried = false;
  let livePreviewPending = false;
  let workspacePreviewPinned = false;
  let historyCurrentRedraw = null;

  function items() {
    return Array.isArray(state.promptSendHistory) ? state.promptSendHistory : [];
  }

  function resetCursor() {
    state.promptHistoryCursor = -1;
    state.promptHistoryDraft = "";
  }

  function resetSearch() {
    searchQuery = "";
    searchFocused = false;
    searchComposing = false;
    searchSelection = { start: 0, end: 0 };
  }

  async function refreshPocketEntries() {
    try {
      pocketEntries = await loadPocketEntries();
    } catch {
      pocketEntries = [];
    }
    return pocketEntries;
  }

  async function refreshFullTextStore() {
    try {
      fullTextStore = await loadFullTextStore();
    } catch {
      fullTextStore = {};
    }
    return fullTextStore;
  }

  function conversationPages(item) {
    return promptHistoryConversationPages(item, {
      store: fullTextStore,
      previewItems: livePreviewItems,
      pocketEntries
    });
  }

  async function refreshConversationSources(redraw, options = {}) {
    await refreshFullTextStore();
    const history = items();
    const active = history.find((entry) => entry.id === activeItemId) || history[0] || null;
    const hasPages = Boolean(active && conversationPages(active).length);
    if (options.retryLive && !hasPages && !livePreviewPending) livePreviewTried = false;
    const shouldCollect = !livePreviewTried && !livePreviewPending && active && !hasPages;
    if (shouldCollect) {
      livePreviewTried = true;
      livePreviewPending = true;
    }
    redraw();
    if (!shouldCollect) return;
    try {
      livePreviewItems = await collectLivePreviewItems();
    } catch {
      livePreviewItems = [];
    } finally {
      livePreviewPending = false;
    }
    redraw();
  }

  function refreshOpenHistory(options) {
    if (!historyCurrentRedraw) return;
    refreshConversationSources(historyCurrentRedraw, options).catch(() => historyCurrentRedraw());
  }

  async function save(history, redraw, message) {
    state.promptSendHistory = await savePromptSendHistory(history);
    resetCursor();
    redraw();
    if (message) toast(message, "success");
  }

  function insert(item, close) {
    if (!item?.text && !item?.images?.length) return;
    state.promptText = String(item.text || "");
    state.promptSelection = {
      start: state.promptText.length,
      end: state.promptText.length,
      direction: "none"
    };
    resetCursor();
    setPromptImages(item.images || [], { focus: false });
    const inputNode = syncPromptInputNode({ focus: true });
    try { inputNode?.setSelectionRange(state.promptText.length, state.promptText.length, "none"); } catch {}
    toast(t("toast.promptHistoryInserted"), "success");
    close?.();
  }

  async function remove(item, redraw) {
    const images = Array.isArray(item?.images) ? item.images : [];
    const label = promptHistoryPreview(item?.text, 80) || promptHistoryImageCountLabel(images) || t("promptHistory.thisPrompt");
    if (!window.confirm(t("promptHistory.deleteConfirm", { prompt: label }))) return;
    if (activeItemId === item.id) activeItemId = "";
    await save(items().filter((entry) => entry.id !== item.id), redraw, t("toast.promptHistoryDeleted"));
  }

  async function clearHistory(redraw) {
    if (!items().length || !window.confirm(t("promptHistory.clearConfirm"))) return;
    activeItemId = "";
    await save([], redraw, t("toast.promptHistoryCleared"));
  }

  async function saveItemToPocket(item, redraw) {
    if (pocketBusy || !promptHistoryMessageKey(item?.text)) return;
    pocketBusy = true;
    redraw();
    try {
      let pages = promptHistoryPocketPages(item, { store: await loadFullTextStore() });
      if (!pages.length) {
        pages = promptHistoryPocketPages(item, { previewItems: await collectLivePreviewItems() });
      }
      if (!pages.length) {
        toast(t("toast.historyPocketEmpty"), "error");
        return;
      }
      const result = await savePagesToPocket(pages);
      if (result?.saved) await refreshPocketEntries();
    } catch (error) {
      console.warn("[ChatClub] Failed to save History item to Pocket", error);
      toast(t("toast.noValidPocketContent"), "error");
    } finally {
      pocketBusy = false;
      redraw();
    }
  }

  function restoreSearchField() {
    requestAnimationFrame(() => {
      const field = document.querySelector(".prompt-history-modal .prompt-history-panel-search-input");
      if (!field) return;
      if (searchFocused) field.focus();
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

  function applySearchQuery(value, { composing = false, redraw } = {}) {
    searchQuery = String(value || "");
    const field = document.querySelector(".prompt-history-modal .prompt-history-panel-search-input");
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
    redraw();
  }

  function headerSearch(redraw) {
    const placeholder = t("promptHistory.searchPlaceholder");
    const query = searchQuery;
    const searching = Boolean(String(query || "").trim());
    const field = input(query, {
      class: "shortcut-search-input prompt-history-search-input prompt-history-panel-search-input",
      type: "search",
      size: "1",
      placeholder,
      "aria-label": placeholder,
      autocomplete: "off",
      spellcheck: "false"
    });
    field.value = query;
    restoreSearchField();
    field.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key !== "Escape" || !query) return;
      event.preventDefault();
      event.stopPropagation();
      clearSearch(redraw);
    });
    field.addEventListener("compositionstart", () => { searchComposing = true; });
    field.addEventListener("compositionend", (event) => {
      searchComposing = false;
      applySearchQuery(String(event?.target?.value || ""), { redraw });
    });
    field.addEventListener("input", (event) => {
      applySearchQuery(String(event?.target?.value || ""), {
        composing: Boolean(event?.isComposing),
        redraw
      });
    });
    field.addEventListener("focus", () => { searchFocused = true; });
    field.addEventListener("blur", () => { searchFocused = false; });
    return el("div", {
      class: "shortcut-search prompt-history-search prompt-history-panel-search",
      onclick: (event) => {
        if (event.target.closest(".shortcut-search-clear")) return;
        field.focus();
      }
    },
      svgIcon("search"),
      el("span", { class: "shortcut-search-sizer", "aria-hidden": "true" }, query || placeholder),
      field,
      searching
        ? el("button", {
          class: "shortcut-search-clear",
          type: "button",
          "aria-label": t("promptHistory.searchClear"),
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
        : null
    );
  }

  function rowAction(label, iconName, onClick, extraClass = "", tooltipId = "") {
    return createSettingsIconAction({
      label,
      icon: svgIcon(iconName),
      onClick,
      className: `tooltip-trigger ${extraClass}`.trim(),
      tooltipId
    });
  }

  function pageFaviconSources(pages = []) {
    return uniqueChatFaviconSources(pages, (page) => {
      const appId = String(page?.appId || "").trim();
      const app = appId && typeof faviconPort.appById === "function" ? faviconPort.appById(appId) : null;
      return {
        href: page?.href || page?.url || "",
        logoUrl: page?.logoUrl || "",
        app,
        appId,
        title: page?.siteName || page?.name || page?.title || ""
      };
    });
  }

  function pageFavicons(pages = [], stackClass = "") {
    return renderChatFaviconStack(pageFaviconSources(pages), {
      appFaviconUrl: faviconPort.app,
      browserFaviconUrl: faviconPort.browser,
      fallbackFaviconUrl: faviconPort.fallback,
      effectiveFaviconUrl: faviconPort.effective,
      stackClass
    });
  }

  function conversationFavicons(item, stackClass = "") {
    return pageFavicons(conversationPages(item), stackClass);
  }

  function resolveActiveItem(visible) {
    const selected = visible.find((item) => item.id === activeItemId);
    if (selected) return selected;
    activeItemId = visible[0]?.id || "";
    return visible[0] || null;
  }

  function sidebarItem(item, active, redraw) {
    const images = Array.isArray(item.images) ? item.images : [];
    const imageLabel = promptHistoryImageCountLabel(images);
    const preview = promptHistoryPreview(item.text, 80) || imageLabel || t("promptHistory.emptyPrompt");
    const pocketSaved = promptHistoryPocketSaved(item, pocketEntries);
    const pocketLabel = pocketSaved ? t("promptHistory.savedToPocket") : t("promptHistory.saveToPocket");
    return el("div", {
      class: `prompt-history-sidebar-item${active ? " active" : ""}`
    },
      el("button", {
        class: "prompt-history-sidebar-item-focus",
        type: "button",
        "aria-current": active ? "true" : null,
        onclick: () => {
          activeItemId = item.id;
          refreshConversationSources(redraw).catch(() => redraw());
        }
      },
        el("span", { class: "prompt-history-sidebar-item-top" },
          conversationFavicons(item, "prompt-history-sidebar-favicons"),
          el("span", { class: "prompt-history-sidebar-preview" }, preview)
        ),
        el("time", { class: "prompt-history-sidebar-time", datetime: item.createdAt || "" }, promptHistoryTimeLabel(item.createdAt))
      ),
      pocketSaved
        ? el("span", {
          class: "prompt-history-pocket-badge",
          title: pocketLabel,
          "aria-label": pocketLabel
        }, svgIcon(pocketDisplayIcon()))
        : el("button", {
          class: "icon-button tooltip-trigger prompt-history-sidebar-pocket",
          type: "button",
          "aria-label": pocketLabel,
          "data-tooltip": pocketLabel,
          "data-tooltip-id": "history.action.pocket",
          disabled: pocketBusy || !promptHistoryMessageKey(item?.text),
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            activeItemId = item.id;
            saveItemToPocket(item, redraw);
          }
        }, svgIcon(pocketDisplayIcon()))
    );
  }

  function sidebar(visible, activeItem, redraw) {
    const searching = Boolean(String(searchQuery || "").trim());
    return el("aside", {
      class: "prompt-history-sidebar",
      "aria-label": t("promptHistory.sidebar")
    },
      visible.length
        ? el("div", { class: "prompt-history-sidebar-list", role: "list" },
          groupPromptHistory(visible).flatMap((group) => [
            el("div", { class: "prompt-history-group", role: "heading", "aria-level": "5" }, t(group.labelKey)),
            ...group.items.map((item) => el("div", { class: "prompt-history-sidebar-list-item", role: "listitem" },
              sidebarItem(item, item.id === activeItem?.id, redraw)
            ))
          ])
        )
        : el("div", { class: "prompt-history-sidebar-empty" }, t(searching ? "promptHistory.searchEmpty" : "promptHistory.noHistory"))
    );
  }

  function detailImages(images, imageLabel) {
    if (!images.length) return null;
    return el("span", { class: "prompt-history-images" },
      images.slice(0, 8).map((image) => el("img", {
        src: image.dataUrl,
        alt: image.name || "",
        title: image.name || imageLabel
      })),
      images.length > 8 ? el("span", { class: "prompt-history-image-more" }, `+${images.length - 8}`) : null
    );
  }

  function conversationTurn(message = {}) {
    const role = message.role === "assistant" ? "assistant" : "user";
    const text = String(message.text || "");
    if (!text.trim()) return null;
    return el("section", { class: `pocket-message pocket-message-${role} prompt-history-turn prompt-history-turn-${role}` },
      el("div", { class: "pocket-message-head prompt-history-turn-head" },
        el("span", { class: "pocket-message-label prompt-history-turn-label" }, t(role === "assistant" ? "common.assistant" : "common.user"))
      ),
      el("p", { class: "pocket-message-body pocket-message-plain prompt-history-turn-text" }, text)
    );
  }

  function historyEntryFavicon(entry = {}) {
    const chatUrl = String(entry.chatUrl || "");
    const stored = String(entry.logoUrl || "").trim();
    const resolved = stored
      || (typeof faviconPort.effective === "function" ? String(faviconPort.effective(chatUrl, stored) || "").trim() : "");
    if (!resolved) return null;
    return el("img", {
      class: "pocket-entry-favicon",
      src: resolved,
      alt: "",
      loading: "lazy",
      decoding: "async",
      referrerpolicy: "no-referrer",
      onerror: (event) => {
        const image = event.currentTarget;
        if (image.dataset.fallback === "1") {
          image.hidden = true;
          return;
        }
        image.dataset.fallback = "1";
        const fallbackUrl = typeof faviconPort.effective === "function"
          ? String(faviconPort.effective(chatUrl, "") || "").trim()
          : "";
        if (fallbackUrl && image.src !== fallbackUrl) {
          image.src = fallbackUrl;
          return;
        }
        image.hidden = true;
      }
    });
  }

  function historyEntryRow(entry, options = {}) {
    const assistantOnly = Boolean(options.assistantOnly);
    const title = entry.title || entry.appName || "";
    return el("article", { class: `ui-card pocket-entry prompt-history-conversation${assistantOnly ? " pocket-entry-assistant-only" : ""}` },
      title || entry.chatUrl
        ? el("header", { class: "pocket-entry-header prompt-history-conversation-head" },
          el("div", { class: "pocket-entry-titleblock" },
            el("div", { class: "pocket-entry-title" },
              historyEntryFavicon(entry),
              title ? el("strong", {}, title) : null
            ),
            entry.chatUrl ? el("span", { class: "pocket-entry-url prompt-history-conversation-url", title: entry.chatUrl }, entry.chatUrl) : null
          ),
          entry.appName && entry.appName !== title
            ? el("div", { class: "pocket-entry-meta" }, el("span", { class: "pocket-entry-source" }, entry.appName))
            : null
        )
        : null,
      el("div", { class: "pocket-message-grid prompt-history-conversation-turns" },
        assistantOnly ? null : conversationTurn({ role: "user", text: entry.userMessage }),
        conversationTurn({ role: "assistant", text: entry.assistantMessage })
      )
    );
  }

  function historyEntryCluster(cluster) {
    const entryCount = Math.max(1, cluster.entries.length);
    return el("section", {
      class: `pocket-entry-cluster prompt-history-conversation-cluster${cluster.merged ? " pocket-entry-cluster-merged" : ""}`,
      dataset: { entryCount }
    },
      cluster.merged
        ? el("div", { class: "pocket-shared-user-message" }, conversationTurn({ role: "user", text: cluster.userMessage }))
        : null,
      el("div", { class: "pocket-batch-row prompt-history-conversations" },
        cluster.entries.map((entry) => historyEntryRow(entry, { assistantOnly: cluster.merged }))
      )
    );
  }

  function syncHistoryClusterWidths(host) {
    const width = 460;
    const gap = 12;
    host?.querySelectorAll?.(".pocket-entry-cluster[data-entry-count]").forEach((cluster) => {
      const count = Math.max(1, Number(cluster.dataset.entryCount) || 1);
      cluster.style.setProperty("--pocket-cluster-row-width", `${Math.round((count * width) + ((count - 1) * gap))}px`);
    });
  }

  function historyHeaderActions(item, redraw, close) {
    const actions = [];
    if (item) {
      const canPocket = Boolean(promptHistoryMessageKey(item.text)) && !pocketBusy;
      actions.push(
        el("button", {
          class: "button button-secondary prompt-history-pocket-button tooltip-trigger",
          type: "button",
          "aria-label": t("promptHistory.saveToPocket"),
          "data-tooltip": t("promptHistory.saveToPocket"),
          "data-tooltip-id": "history.action.pocket",
          disabled: !canPocket,
          onclick: () => saveItemToPocket(item, redraw)
        }, svgIcon(pocketDisplayIcon()), el("span", {}, t("promptHistory.saveToPocket"))),
        rowAction(t("promptHistory.insert"), "insert", () => insert(item, close), "", "settings.action.insert"),
        rowAction(t("common.delete"), "trash", () => remove(item, redraw), "danger", "settings.action.delete")
      );
    }
    if (items().length) {
      actions.push(el("button", {
        class: "button button-secondary prompt-history-panel-clear",
        type: "button",
        onclick: () => clearHistory(redraw)
      }, svgIcon("trash"), el("span", {}, t("promptHistory.clear"))));
    }
    return actions.length ? el("div", { class: "prompt-history-header-actions" }, ...actions) : null;
  }

  function detail(item) {
    const images = Array.isArray(item.images) ? item.images : [];
    const imageLabel = promptHistoryImageCountLabel(images);
    const entries = promptHistoryConversationEntries(item, {
      store: fullTextStore,
      previewItems: livePreviewItems,
      pocketEntries
    });
    const clusters = promptHistoryEntryClusters(entries);
    const loading = !entries.length && (livePreviewPending || !livePreviewTried);
    return el("article", { class: "prompt-history-detail" },
      entries.length
        ? el("div", { class: "prompt-history-conversation-clusters" }, clusters.map((cluster) => historyEntryCluster(cluster)))
        : el("div", {
          class: `prompt-history-detail-fallback${loading ? " is-loading" : ""}`,
          "aria-busy": loading ? "true" : null
        },
          el("p", { class: "prompt-history-detail-status" }, t(loading ? "promptHistory.conversationLoading" : "promptHistory.conversationEmpty")),
          el("pre", { class: "prompt-history-detail-text" }, item.text || t("promptHistory.emptyPrompt"))
        ),
      detailImages(images, imageLabel)
    );
  }

  function renderHistory(host, redraw, close) {
    const history = items();
    const query = searchQuery;
    const searching = Boolean(String(query || "").trim());
    const visible = searching ? history.filter((item) => promptHistoryItemMatchesSearch(item, query)) : history;
    const activeItem = resolveActiveItem(visible);
    syncHistoryModalHeader(activeItem, redraw, close);
    clear(host);
    host.append(
      el("div", { class: "prompt-history-shell" },
        sidebar(visible, activeItem, redraw),
        el("main", { class: "prompt-history-main" },
          activeItem
            ? detail(activeItem)
            : el("div", { class: "ui-empty-state prompt-history-main-empty" }, t(searching ? "promptHistory.searchEmpty" : "promptHistory.noHistory"))
        )
      )
    );
    syncHistoryClusterWidths(host);
  }

  function installHistoryPanelHeader(panel) {
    const header = panel?.querySelector(".modal-header");
    const title = header?.querySelector("h2");
    const closeButton = header?.querySelector(".icon-button");
    if (!header || !title || !closeButton) return;
    if (header.querySelector(".prompt-history-header-sidebar")) return;
    title.before(el("div", { class: "prompt-history-header-sidebar" },
      el("span", { class: "prompt-history-modal-title-icon", "aria-hidden": "true" }, svgIcon("history")),
      el("strong", { class: "prompt-history-sidebar-chrome-title" }, t("promptHistory.title"))
    ));
    closeButton.classList.add("prompt-history-window-button");
    closeButton.replaceChildren(svgIcon("x"));
    header.append(
      el("div", { class: "prompt-history-header-titlebar" }),
      el("div", { class: "prompt-history-window-actions" }, closeButton)
    );
  }

  function syncHistoryModalHeader(activeItem, redraw, close) {
    const titlebar = document.querySelector(".prompt-history-modal .prompt-history-header-titlebar");
    if (!titlebar) return;
    const preview = promptHistoryPreview(activeItem?.text, 72);
    const titleText = preview || t("promptHistory.title");
    const fullText = preview ? String(activeItem?.text || "").replace(/\s+/g, " ").trim() : titleText;
    clear(titlebar);
    titlebar.append(
      el("div", { class: "prompt-history-header-title" },
        el("strong", { title: fullText }, titleText),
        activeItem?.createdAt ? el("span", {}, promptHistoryTimeLabel(activeItem.createdAt)) : null
      ),
      headerSearch(redraw),
      historyHeaderActions(activeItem, redraw, close)
    );
  }

  function openHistoryPanel() {
    const existing = document.querySelector(".modal.prompt-history-modal");
    const pinned = workspacePreviewPinned;
    workspacePreviewPinned = false;
    if (existing) {
      refreshOpenHistory({ retryLive: !pinned });
      return existing.closest(".modal-backdrop") || existing.parentElement;
    }
    resetSearch();
    if (!pinned) {
      activeItemId = "";
      livePreviewItems = [];
      livePreviewTried = false;
      livePreviewPending = false;
    }
    const host = el("div", { class: "ui-dialog prompt-history-dialog" });
    let dialog;
    const close = () => {
      if (historyCurrentRedraw === redraw) historyCurrentRedraw = null;
      dialog?.remove();
    };
    const redraw = () => renderHistory(host, redraw, close);
    historyCurrentRedraw = redraw;
    dialog = viewerModal(t("promptHistory.title"), host, close, true, t("common.close"));
    dialog.classList.add("prompt-history-backdrop");
    const panel = dialog.querySelector(".modal");
    panel?.classList.add("prompt-history-modal");
    installHistoryPanelHeader(panel);
    Promise.all([
      refreshPocketEntries().then(redraw).catch(() => {}),
      refreshConversationSources(redraw)
    ]).catch(() => redraw());
    redraw();
    return dialog;
  }

  function notifyFullTextChanged() {
    refreshOpenHistory({ retryLive: true });
  }

  function applyWorkspacePreview(payload = {}) {
    const previewItems = Array.isArray(payload.items) ? payload.items : [];
    if (previewItems.length) {
      livePreviewItems = previewItems;
      livePreviewTried = true;
      livePreviewPending = false;
    }
    const incomingIds = Array.isArray(payload.incomingIds) ? payload.incomingIds : [];
    const history = items();
    activeItemId = incomingIds.find((id) => history.some((entry) => entry.id === id)) || history[0]?.id || "";
    workspacePreviewPinned = true;
  }

  function notifyWorkspaceSaved(payload = {}) {
    applyWorkspacePreview(payload);
    if (!historyCurrentRedraw) return;
    workspacePreviewPinned = false;
    const redraw = historyCurrentRedraw;
    if (payload.persistSaved) {
      refreshFullTextStore().then(redraw).catch(() => redraw());
      return;
    }
    redraw();
  }

  return {
    openHistoryPanel,
    notifyFullTextChanged,
    notifyWorkspaceSaved
  };
}
