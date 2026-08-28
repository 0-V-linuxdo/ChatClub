import { t } from "../../shared/i18n.js";
import { savePromptSendHistory } from "../../shared/storage-adapter.js";
import { createSettingsIconAction } from "../../ui/components.js";
import { clear, el, input, toast, viewerModal } from "../../ui/dom.js";
import {
  optionalControllerObject,
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";
import {
  groupPromptHistory,
  promptHistoryImageCountLabel,
  promptHistoryItemMatchesSearch,
  promptHistoryMessageKey,
  promptHistoryConversationPages,
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
    conversationPort: "object?"
  });
  const state = requireControllerContext(ctx, controllerName, "state");
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const setPromptImages = requireControllerFunction(ctx, controllerName, "setPromptImages");
  const syncPromptInputNode = requireControllerFunction(ctx, controllerName, "syncPromptInputNode");
  const pocketPort = optionalControllerObject(ctx, "pocketPort");
  const conversationPort = optionalControllerObject(ctx, "conversationPort");
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
      previewItems: livePreviewItems
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

  function restoreSearchField(host) {
    requestAnimationFrame(() => {
      const field = host?.querySelector?.(".prompt-history-panel-search-input");
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

  function applySearchQuery(host, value, { composing = false, redraw } = {}) {
    searchQuery = String(value || "");
    const field = host?.querySelector?.(".prompt-history-panel-search-input");
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

  function headerSearch(host, redraw) {
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
    restoreSearchField(host);
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
      applySearchQuery(host, String(event?.target?.value || ""), { redraw });
    });
    field.addEventListener("input", (event) => {
      applySearchQuery(host, String(event?.target?.value || ""), {
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
    return el("button", {
      class: `prompt-history-sidebar-item${active ? " active" : ""}`,
      type: "button",
      "aria-current": active ? "true" : null,
      onclick: () => {
        activeItemId = item.id;
        refreshConversationSources(redraw).catch(() => redraw());
      }
    },
      el("span", { class: "prompt-history-sidebar-item-top" },
        el("span", { class: "prompt-history-sidebar-preview" }, preview),
        pocketSaved
          ? el("span", {
            class: "prompt-history-pocket-badge",
            title: t("promptHistory.savedToPocket"),
            "aria-label": t("promptHistory.savedToPocket")
          }, svgIcon("pocket"))
          : null
      ),
      el("time", { class: "prompt-history-sidebar-time", datetime: item.createdAt || "" }, promptHistoryTimeLabel(item.createdAt))
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
    return el("section", { class: `prompt-history-turn prompt-history-turn-${role}` },
      el("div", { class: "prompt-history-turn-label" }, t(role === "assistant" ? "common.assistant" : "common.user")),
      el("pre", { class: "prompt-history-turn-text" }, message.text || "")
    );
  }

  function conversationFrame(page = {}) {
    const messages = Array.isArray(page.messages) ? page.messages : [];
    const label = page.siteName || page.name || page.title || "";
    return el("section", { class: "prompt-history-conversation" },
      label || page.href
        ? el("header", { class: "prompt-history-conversation-head" },
          label ? el("strong", {}, label) : null,
          page.href ? el("span", { class: "prompt-history-conversation-url" }, page.href) : null
        )
        : null,
      el("div", { class: "prompt-history-conversation-turns" },
        messages.map((message) => conversationTurn(message))
      )
    );
  }

  function syncHistoryModalTitle(item) {
    const title = document.querySelector(".prompt-history-modal .modal-header h2");
    if (!title) return;
    const fallback = t("promptHistory.title");
    const preview = promptHistoryPreview(item?.text, 72);
    title.textContent = preview || fallback;
    title.title = preview ? String(item?.text || "").replace(/\s+/g, " ").trim() : fallback;
  }

  function detail(item, redraw, close) {
    const images = Array.isArray(item.images) ? item.images : [];
    const imageLabel = promptHistoryImageCountLabel(images);
    const canPocket = Boolean(promptHistoryMessageKey(item.text)) && !pocketBusy;
    const pages = conversationPages(item);
    const loading = !pages.length && (livePreviewPending || !livePreviewTried);
    return el("article", { class: "prompt-history-detail" },
      el("header", { class: "prompt-history-detail-header" },
        el("div", { class: "prompt-history-detail-meta" },
          el("time", { datetime: item.createdAt || "" }, promptHistoryTimeLabel(item.createdAt)),
          imageLabel ? el("span", {}, imageLabel) : null
        ),
        el("div", { class: "prompt-history-detail-actions" },
          el("button", {
            class: "button button-secondary prompt-history-pocket-button tooltip-trigger",
            type: "button",
            "aria-label": t("promptHistory.saveToPocket"),
            "data-tooltip": t("promptHistory.saveToPocket"),
            "data-tooltip-id": "history.action.pocket",
            disabled: !canPocket,
            onclick: () => saveItemToPocket(item, redraw)
          }, svgIcon("pocket"), el("span", {}, t("promptHistory.saveToPocket"))),
          rowAction(t("promptHistory.insert"), "insert", () => insert(item, close), "", "settings.action.insert"),
          rowAction(t("common.delete"), "trash", () => remove(item, redraw), "danger", "settings.action.delete")
        )
      ),
      pages.length
        ? el("div", { class: "prompt-history-conversations" }, pages.map((page) => conversationFrame(page)))
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
    syncHistoryModalTitle(activeItem);
    clear(host);
    host.append(
      el("div", { class: "prompt-history-panel-toolbar" },
        headerSearch(host, redraw),
        history.length
          ? el("button", {
            class: "button button-secondary prompt-history-panel-clear",
            type: "button",
            onclick: () => clearHistory(redraw)
          }, svgIcon("trash"), el("span", {}, t("promptHistory.clear")))
          : null
      ),
      el("div", { class: "prompt-history-shell" },
        sidebar(visible, activeItem, redraw),
        el("main", { class: "prompt-history-main" },
          activeItem
            ? detail(activeItem, redraw, close)
            : el("div", { class: "ui-empty-state prompt-history-main-empty" }, t(searching ? "promptHistory.searchEmpty" : "promptHistory.noHistory"))
        )
      )
    );
  }

  function installHistoryPanelHeader(panel) {
    const header = panel?.querySelector(".modal-header");
    const title = header?.querySelector("h2");
    const closeButton = header?.querySelector(".icon-button");
    if (!header || !title || !closeButton) return;
    title.before(el("span", { class: "prompt-history-modal-title-icon", "aria-hidden": "true" }, svgIcon("history")));
    closeButton.replaceChildren(svgIcon("x"));
  }

  function openHistoryPanel() {
    const existing = document.querySelector(".modal.prompt-history-modal");
    if (existing) {
      refreshOpenHistory({ retryLive: true });
      return existing.closest(".modal-backdrop") || existing.parentElement;
    }
    resetSearch();
    activeItemId = "";
    livePreviewItems = [];
    livePreviewTried = false;
    livePreviewPending = false;
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

  return {
    openHistoryPanel,
    notifyFullTextChanged
  };
}
