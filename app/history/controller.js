import { t } from "../../shared/i18n.js";
import { savePromptSendHistory } from "../../shared/storage-adapter.js";
import { normalizePocketCardSize, normalizePocketIcon } from "../../shared/storage-schema.js";
import { createSettingsIconAction } from "../../ui/components.js";
import { clear, el, input, openConfirmationAction, toast, viewerModal } from "../../ui/dom.js";
import { createViewerWindowChrome } from "../../ui/viewer-window.js";
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
import { renderMarkdown } from "../summary/markdown.js";
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
  promptHistoryTimeLabel,
  promptHistorySourceMeta
} from "./model.js";

const HISTORY_PANEL_SIZE_KEY = "chatclub.historyPanelSize.v1";
const HISTORY_PANEL_MIN_WIDTH = 720;
const HISTORY_PANEL_MIN_HEIGHT = 420;
const HISTORY_PANEL_FULLSCREEN_CLASS = "prompt-history-modal-fullscreen";
const HISTORY_PANEL_FOCUS_CLASS = "prompt-history-modal-focus";
const HISTORY_CARD_GAP = 12;
const HISTORY_CARD_SIZE_LIMITS = Object.freeze({
  width: Object.freeze({ min: 360, max: 760, step: 20 }),
  height: Object.freeze({ min: 420, max: 820, step: 20 })
});

export function createHistoryController(ctx) {
  const controllerName = "History controller";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    compactIconButton: "function",
    setPromptImages: "function",
    syncPromptInputNode: "function",
    saveOptions: "function?",
    pocketPort: "object?",
    conversationPort: "object?",
    faviconPort: "object?",
    workspacePort: "object?"
  });
  const state = requireControllerContext(ctx, controllerName, "state");
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const compactIconButton = requireControllerFunction(ctx, controllerName, "compactIconButton");
  const setPromptImages = requireControllerFunction(ctx, controllerName, "setPromptImages");
  const syncPromptInputNode = requireControllerFunction(ctx, controllerName, "syncPromptInputNode");
  const saveOptions = typeof ctx.saveOptions === "function" ? ctx.saveOptions : async (options) => options;
  const pocketPort = optionalControllerObject(ctx, "pocketPort");
  const conversationPort = optionalControllerObject(ctx, "conversationPort");
  const faviconPort = optionalControllerObject(ctx, "faviconPort");
  const workspacePort = optionalControllerObject(ctx, "workspacePort");
  const loadPocketEntryInFrame = typeof workspacePort.loadEntry === "function"
    ? workspacePort.loadEntry
    : () => false;
  const setFramePointerBlockedForOverlay = typeof workspacePort.setFramePointerBlocked === "function"
    ? workspacePort.setFramePointerBlocked
    : () => {};
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
  const viewerWindow = createViewerWindowChrome({
    fullscreenClass: HISTORY_PANEL_FULLSCREEN_CLASS,
    focusClass: HISTORY_PANEL_FOCUS_CLASS,
    sizeKey: HISTORY_PANEL_SIZE_KEY,
    minWidth: HISTORY_PANEL_MIN_WIDTH,
    minHeight: HISTORY_PANEL_MIN_HEIGHT,
    buttonClass: "icon-button tooltip-trigger prompt-history-window-button overlay-window-button",
    t,
    svgIcon,
    onChange: () => historyCurrentRedraw?.(),
    onPointerBlock: (blocked) => setFramePointerBlockedForOverlay(blocked, "history")
  });
  let historyCardSizeSaveTimer = 0;
  let historyActionsExpanded = false;
  let historySidebarCollapsed = false;

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
    const hasLiveSnapshot = Array.isArray(livePreviewItems) && livePreviewItems.length > 0;
    if (options.retryLive && !hasPages && !hasLiveSnapshot && !livePreviewPending) livePreviewTried = false;
    const shouldCollect = !livePreviewTried && !livePreviewPending && active && !hasPages && !hasLiveSnapshot;
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

  function remove(item, redraw) {
    const images = Array.isArray(item?.images) ? item.images : [];
    const label = promptHistoryPreview(item?.text, 80) || promptHistoryImageCountLabel(images) || t("promptHistory.thisPrompt");
    openConfirmationAction({
      title: t("promptHistory.deleteTitle"),
      body: t("promptHistory.deleteConfirm", { prompt: label }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      closeLabel: t("common.close"),
      tone: "neutral",
      onConfirm: () => {
        if (activeItemId === item.id) activeItemId = "";
        return save(items().filter((entry) => entry.id !== item.id), redraw, t("toast.promptHistoryDeleted"));
      }
    });
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

  function historyCardSize() {
    return normalizePocketCardSize(state.options?.pocketCardSize);
  }

  function applyHistoryCardSize(host, size = historyCardSize()) {
    host?.style?.setProperty("--pocket-card-width", `${size.width}px`);
    host?.style?.setProperty("--pocket-card-height", `${size.height}px`);
    host?.style?.setProperty("--prompt-history-card-width", `${size.width}px`);
    host?.querySelectorAll?.(".pocket-entry-cluster[data-entry-count]").forEach((cluster) => {
      const count = Math.max(1, Number(cluster.dataset.entryCount) || 1);
      cluster.style.setProperty("--pocket-cluster-row-width", `${Math.round((count * size.width) + ((count - 1) * HISTORY_CARD_GAP))}px`);
    });
    return size;
  }

  function scheduleHistoryCardSizeSave(size) {
    clearTimeout(historyCardSizeSaveTimer);
    historyCardSizeSaveTimer = setTimeout(async () => {
      try {
        state.options = await saveOptions({ ...state.options, pocketCardSize: size });
      } catch (error) {
        console.warn("[ChatClub] Failed to save History card size", error);
      }
    }, 180);
  }

  function updateHistoryCardSize(host, patch, options = {}) {
    const size = normalizePocketCardSize({ ...historyCardSize(), ...patch });
    state.options = { ...state.options, pocketCardSize: size };
    applyHistoryCardSize(host, size);
    if (options.immediate) {
      clearTimeout(historyCardSizeSaveTimer);
      historyCardSizeSaveTimer = 0;
      saveOptions({ ...state.options, pocketCardSize: size }).then((next) => {
        state.options = next;
      }).catch((error) => console.warn("[ChatClub] Failed to save History card size", error));
    } else {
      scheduleHistoryCardSizeSave(size);
    }
    return size;
  }

  function historySizeControl(host, field, label, value) {
    const limit = HISTORY_CARD_SIZE_LIMITS[field];
    const output = el("span", { class: "pocket-size-value" }, `${value}px`);
    const slider = el("input", {
      class: "pocket-size-slider",
      type: "range",
      min: limit.min,
      max: limit.max,
      step: limit.step,
      value,
      "aria-label": label,
      oninput: (event) => {
        const next = updateHistoryCardSize(host, { [field]: event.currentTarget.value });
        output.textContent = `${next[field]}px`;
      },
      onchange: (event) => {
        const next = updateHistoryCardSize(host, { [field]: event.currentTarget.value }, { immediate: true });
        output.textContent = `${next[field]}px`;
      }
    });
    return el("label", { class: "pocket-size-control" },
      el("span", { class: "pocket-size-label" }, label),
      slider,
      output
    );
  }

  function historySizeControls(host, size) {
    return el("div", { class: "pocket-size-controls" },
      historySizeControl(host, "width", t("pocket.cardWidth"), size.width),
      historySizeControl(host, "height", t("pocket.cardHeight"), size.height)
    );
  }

  function historyPanelIsFocusMode(panel) {
    return viewerWindow.isFocusMode(panel);
  }

  function toggleHistoryPanelFocusMode(panel) {
    viewerWindow.toggleFocusMode(panel);
  }

  function historyFullscreenButton(panel) {
    return viewerWindow.fullscreenButton(panel);
  }

  function toggleOpenHistoryPanelFullscreen() {
    const panel = document.querySelector(".modal.prompt-history-modal");
    if (!panel) return false;
    const button = panel.querySelector('[data-tooltip-id="viewer.fullscreen"]');
    viewerWindow.toggleFullscreen(panel, button);
    return true;
  }

  function attachHistoryPanelResize(panel) {
    viewerWindow.attachResize(panel);
  }

  function loadHistoryEntry(entry) {
    const loaded = loadPocketEntryInFrame(entry);
    if (!loaded) toast(t("toast.pocketLoadFailed"), "error");
    return loaded;
  }

  async function copyHistoryMessage(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      toast(t("toast.pocketCopied"), "success");
    } catch (error) {
      console.warn("[ChatClub] Failed to copy History message", error);
      toast(t("toast.copyFailed"), "error");
    }
  }

  function googleFaviconUrl(href = "") {
    try {
      const page = new URL(String(href || ""));
      if (page.protocol !== "http:" && page.protocol !== "https:") return "";
      const iconUrl = new URL("https://www.google.com/s2/favicons");
      iconUrl.searchParams.set("domain", page.hostname);
      iconUrl.searchParams.set("sz", "64");
      return iconUrl.href;
    } catch {
      return "";
    }
  }

  function historyLogoUrl(href = "", logoUrl = "") {
    const stored = String(logoUrl || "").trim();
    if (stored && !stored.includes("/_favicon/")) return stored;
    const pageHref = String(href || "").trim();
    const effective = typeof faviconPort.effective === "function"
      ? String(faviconPort.effective(pageHref, stored) || "").trim()
      : "";
    if (effective && !effective.includes("/_favicon/")) return effective;
    return googleFaviconUrl(pageHref) || effective || stored;
  }

  function pageFaviconSources(pages = []) {
    return uniqueChatFaviconSources(pages, (page) => {
      const href = page?.href || page?.url || "";
      return {
        href,
        logoUrl: historyLogoUrl(href, page?.logoUrl || ""),
        appId: page?.appId || href,
        title: page?.siteName || page?.name || page?.title || ""
      };
    });
  }

  function pageFavicons(pages = [], stackClass = "") {
    return renderChatFaviconStack(pageFaviconSources(pages), {
      effectiveFaviconUrl: faviconPort.effective,
      omitTitle: true,
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
    const sourceMeta = promptHistorySourceMeta(conversationPages(item));
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
          el("span", { class: "prompt-history-sidebar-preview" }, preview)
        )
      ),
      el("div", { class: "prompt-history-sidebar-item-foot" },
        conversationFavicons(item, "prompt-history-sidebar-favicons"),
        el("time", { class: "prompt-history-sidebar-time", datetime: item.createdAt || "" }, promptHistoryTimeLabel(item.createdAt)),
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
          }, svgIcon(pocketDisplayIcon())),
        sourceMeta ? el("span", { class: "prompt-history-sidebar-meta" }, sourceMeta) : null
      )
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
        : el("div", { class: "prompt-history-sidebar-empty pocket-sidebar-empty" }, t(searching ? "promptHistory.searchEmpty" : "promptHistory.noHistory"))
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
    if (!text.trim() && role !== "assistant") return null;
    const copyLabel = role === "assistant" ? t("pocket.copyAssistantMessage") : t("pocket.copyUserMessage");
    return el("section", { class: `pocket-message pocket-message-${role} prompt-history-turn prompt-history-turn-${role}` },
      el("div", { class: "pocket-message-head prompt-history-turn-head" },
        el("span", { class: "pocket-message-label prompt-history-turn-label" }, t(role === "assistant" ? "common.assistant" : "common.user")),
        compactIconButton(copyLabel, "copy", (event) => {
          event.preventDefault();
          copyHistoryMessage(text);
        }, "pocket-message-copy", copyLabel, "", role === "assistant" ? "pocket.copyAssistantMessage" : "pocket.copyUserMessage")
      ),
      role === "assistant"
        ? el("div", { class: "pocket-message-body pocket-message-markdown summary-preview-text-markdown prompt-history-turn-text" }, renderMarkdown(text))
        : el("p", { class: "pocket-message-body pocket-message-plain prompt-history-turn-text" }, text)
    );
  }

  function historyEntryFavicon(entry = {}) {
    const chatUrl = String(entry.chatUrl || "");
    const resolved = historyLogoUrl(chatUrl, entry.logoUrl || "");
    if (!resolved) return svgIcon("history");
    return el("img", {
      class: "pocket-entry-favicon",
      src: resolved,
      alt: "",
      loading: "lazy",
      decoding: "async",
      referrerpolicy: "no-referrer",
      onerror: (event) => {
        const image = event.currentTarget;
        if (image.dataset.google === "1") {
          image.hidden = true;
          return;
        }
        image.dataset.google = "1";
        const googleUrl = googleFaviconUrl(chatUrl);
        if (googleUrl && image.src !== googleUrl) {
          image.src = googleUrl;
          return;
        }
        image.hidden = true;
      }
    });
  }

  function historyEntryRow(entry, options = {}) {
    const assistantOnly = Boolean(options.assistantOnly);
    const title = entry.title || entry.appName || t("pocket.savedChat");
    return el("article", { class: `ui-card pocket-entry prompt-history-conversation${assistantOnly ? " pocket-entry-assistant-only" : ""}` },
      el("header", { class: "pocket-entry-header prompt-history-conversation-head" },
        el("div", { class: "pocket-entry-titleblock" },
          el("div", { class: "pocket-entry-title" },
            historyEntryFavicon(entry),
            el("strong", {}, title)
          ),
          entry.chatUrl
            ? el("button", {
              class: "pocket-entry-url prompt-history-conversation-url",
              type: "button",
              title: entry.chatUrl,
              onclick: (event) => {
                event.preventDefault();
                loadHistoryEntry(entry);
              }
            }, entry.chatUrl)
            : null
        ),
        el("div", { class: "pocket-entry-meta" },
          entry.appName
            ? el("span", { class: "pocket-entry-source" }, entry.appName)
            : null,
          entry.chatUrl
            ? compactIconButton(t("pocket.openChat"), "insert", (event) => {
              event.preventDefault();
              loadHistoryEntry(entry);
            }, "pocket-entry-action", t("pocket.openChat"), "", "pocket.openChat")
            : null
        )
      ),
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
    const toggleLabel = historyActionsExpanded ? t("pocket.hideActions") : t("pocket.showActions");
    actions.push(el("button", {
      class: "button button-secondary pocket-action-toggle tooltip-trigger",
      type: "button",
      "aria-label": toggleLabel,
      "aria-expanded": historyActionsExpanded ? "true" : "false",
      "data-tooltip": toggleLabel,
      "data-tooltip-id": "pocket.actions",
      onclick: (event) => {
        event.preventDefault();
        historyActionsExpanded = !historyActionsExpanded;
        redraw();
      }
    }, svgIcon("menu"), el("span", {}, t("pocket.actions"))));
    return el("div", { class: "prompt-history-header-actions" }, ...actions);
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
    const panel = host.closest?.(".modal.prompt-history-modal");
    const focusMode = historyPanelIsFocusMode(panel);
    const sidebarCollapsed = !focusMode && historySidebarCollapsed;
    panel?.classList?.toggle("prompt-history-modal-sidebar-collapsed", sidebarCollapsed);
    syncHistorySidebarTitlebar(panel, host, redraw);
    syncHistoryFocusLeftbar(panel, host, redraw);
    syncHistoryModalHeader(activeItem, redraw, close);
    clear(host);
    host.append(
      el("div", {
        class: `prompt-history-shell${focusMode ? " prompt-history-shell-focus" : ""}${sidebarCollapsed ? " prompt-history-shell-sidebar-collapsed" : ""}`
      },
        focusMode || sidebarCollapsed ? null : sidebar(visible, activeItem, redraw),
        el("main", { class: "prompt-history-main" },
          historyActionsExpanded && activeItem
            ? el("section", { class: "pocket-active-header" },
              el("div", { class: "pocket-actions-panel" }, historySizeControls(host, applyHistoryCardSize(host)))
            )
            : null,
          activeItem
            ? detail(activeItem)
            : el("div", { class: "ui-empty-state pocket-empty prompt-history-main-empty" },
              svgIcon("history"),
              el("strong", {}, t(searching ? "promptHistory.searchEmpty" : "promptHistory.emptyTitle")),
              searching ? null : el("span", {}, t("promptHistory.emptyDesc"))
            )
        )
      )
    );
    applyHistoryCardSize(host);
  }

  function installHistoryPanelHeader(panel) {
    const header = panel?.querySelector(".modal-header");
    const title = header?.querySelector("h2");
    const closeButton = header?.querySelector(".icon-button");
    if (!header || !title || !closeButton) return;
    if (header.querySelector(".prompt-history-header-sidebar")) return;
    title.before(el("div", { class: "pocket-focus-leftbar prompt-history-focus-leftbar", hidden: true }));
    title.before(el("div", { class: "prompt-history-header-sidebar" },
      el("span", { class: "prompt-history-modal-title-icon", "aria-hidden": "true" }, svgIcon("history")),
      el("div", { class: "pocket-sidebar-titlebar prompt-history-sidebar-titlebar" })
    ));
    closeButton.classList.add("prompt-history-window-button", "overlay-window-button");
    closeButton.replaceChildren(svgIcon("x"));
    header.append(
      el("div", { class: "prompt-history-header-titlebar" }),
      el("div", { class: "prompt-history-window-actions" }, historyFullscreenButton(panel), closeButton)
    );
  }

  function historyFocusModeButton(host, redraw) {
    const panel = host?.closest?.(".modal.prompt-history-modal");
    const focusMode = historyPanelIsFocusMode(panel);
    const label = focusMode ? t("pocket.exitFocusMode") : t("pocket.focusMode");
    return el("button", {
      class: "icon-button tooltip-trigger pocket-focus-mode-button",
      type: "button",
      "aria-label": label,
      "aria-pressed": focusMode ? "true" : "false",
      "data-tooltip": label,
      "data-tooltip-id": "pocket.focusMode",
      onclick: (event) => {
        event.preventDefault();
        toggleHistoryPanelFocusMode(host?.closest?.(".modal.prompt-history-modal"));
        redraw();
      }
    }, svgIcon("focusMode"));
  }

  function historySidebarCollapseButton(redraw) {
    const collapsed = historySidebarCollapsed;
    const label = collapsed ? t("pocket.expandSidebar") : t("pocket.collapseSidebar");
    return el("button", {
      class: `icon-button tooltip-trigger pocket-sidebar-collapse-button ${collapsed ? "pocket-sidebar-collapse-button-expand" : "pocket-sidebar-collapse-button-collapse"}`,
      type: "button",
      "aria-label": label,
      "aria-pressed": collapsed ? "true" : "false",
      "data-tooltip": label,
      "data-tooltip-id": "pocket.sidebar",
      onclick: (event) => {
        event.preventDefault();
        historySidebarCollapsed = !historySidebarCollapsed;
        redraw();
      }
    }, svgIcon(collapsed ? "sidebarExpand" : "sidebarCollapse"));
  }

  function syncHistorySidebarTitlebar(panel, host, redraw) {
    const titlebar = panel?.querySelector(".prompt-history-sidebar-titlebar");
    if (!titlebar) return;
    clear(titlebar);
    if (historyPanelIsFocusMode(panel)) {
      titlebar.hidden = true;
      titlebar.setAttribute("hidden", "");
      return;
    }
    titlebar.hidden = false;
    titlebar.removeAttribute("hidden");
    titlebar.append(
      el("strong", { class: "prompt-history-sidebar-chrome-title" }, t("promptHistory.title")),
      el("div", { class: "pocket-sidebar-titlebar-actions" },
        historySidebarCollapseButton(redraw),
        historyFocusModeButton(host, redraw)
      )
    );
  }

  function syncHistoryFocusLeftbar(panel, host, redraw) {
    const titlebar = panel?.querySelector(".prompt-history-focus-leftbar");
    if (!titlebar) return;
    clear(titlebar);
    if (!historyPanelIsFocusMode(panel)) {
      titlebar.hidden = true;
      titlebar.setAttribute("hidden", "");
      return;
    }
    titlebar.hidden = false;
    titlebar.removeAttribute("hidden");
    const label = t("pocket.exitFocusMode");
    titlebar.append(
      el("span", { class: "prompt-history-modal-title-icon", "aria-hidden": "true" }, svgIcon("history")),
      el("button", {
        class: "icon-button tooltip-trigger pocket-exit-focus-button",
        type: "button",
        "aria-label": label,
        "data-tooltip": label,
        "data-tooltip-id": "pocket.focusMode",
        onclick: (event) => {
          event.preventDefault();
          toggleHistoryPanelFocusMode(host?.closest?.(".modal.prompt-history-modal"));
          redraw();
        }
      }, svgIcon("insert"))
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
    historyActionsExpanded = false;
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
    attachHistoryPanelResize(panel);
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
    notifyWorkspaceSaved,
    toggleOpenHistoryPanelFullscreen
  };
}
