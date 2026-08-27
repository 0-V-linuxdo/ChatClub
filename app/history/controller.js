import { t } from "../../shared/i18n.js";
import { savePromptSendHistory } from "../../shared/storage-adapter.js";
import { createSettingsIconAction, createSettingsList } from "../../ui/components.js";
import { clear, el, input, toast, viewerModal } from "../../ui/dom.js";
import { requireControllerContext, requireControllerFunction, validateControllerContract } from "../controller-contract.js";
import {
  groupPromptHistory,
  promptHistoryImageCountLabel,
  promptHistoryItemMatchesSearch,
  promptHistoryPreview,
  promptHistoryTimeLabel
} from "./model.js";

export function createHistoryController(ctx) {
  const controllerName = "History controller";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    setPromptImages: "function",
    syncPromptInputNode: "function"
  });
  const state = requireControllerContext(ctx, controllerName, "state");
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const setPromptImages = requireControllerFunction(ctx, controllerName, "setPromptImages");
  const syncPromptInputNode = requireControllerFunction(ctx, controllerName, "syncPromptInputNode");
  let searchQuery = "";
  let searchFocused = false;
  let searchComposing = false;
  let searchSelection = { start: 0, end: 0 };
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
    await save(items().filter((entry) => entry.id !== item.id), redraw, t("toast.promptHistoryDeleted"));
  }

  async function clearHistory(redraw) {
    if (!items().length || !window.confirm(t("promptHistory.clearConfirm"))) return;
    await save([], redraw, t("toast.promptHistoryCleared"));
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

  function row(item, redraw, close) {
    const textPreview = promptHistoryPreview(item.text, 420);
    const images = Array.isArray(item.images) ? item.images : [];
    const imageLabel = promptHistoryImageCountLabel(images);
    return el("div", { class: "ui-list-row settings-list-row prompt-history-row" },
      el("time", { class: "prompt-history-time", datetime: item.createdAt || "" }, promptHistoryTimeLabel(item.createdAt)),
      el("span", { class: "prompt-history-preview", title: item.text || imageLabel || "" },
        textPreview || (images.length ? imageLabel : t("promptHistory.emptyPrompt")),
        images.length ? el("span", { class: "prompt-history-images" },
          images.slice(0, 4).map((image) => el("img", {
            src: image.dataUrl,
            alt: image.name || "",
            title: image.name || imageLabel
          })),
          images.length > 4 ? el("span", { class: "prompt-history-image-more" }, `+${images.length - 4}`) : null
        ) : null
      ),
      el("div", { class: "settings-row-action-group" },
        rowAction(t("promptHistory.insert"), "insert", () => insert(item, close), "", "settings.action.insert"),
        rowAction(t("common.delete"), "trash", () => remove(item, redraw), "danger", "settings.action.delete")
      )
    );
  }

  function renderHistory(host, redraw, close) {
    const history = items();
    const query = searchQuery;
    const searching = Boolean(String(query || "").trim());
    const visible = searching ? history.filter((item) => promptHistoryItemMatchesSearch(item, query)) : history;
    const rows = visible.length
      ? groupPromptHistory(visible).flatMap((group) => [
        el("div", { class: "prompt-history-group", role: "heading", "aria-level": "5" }, t(group.labelKey)),
        group.items.map((item) => row(item, redraw, close))
      ])
      : el("div", { class: "ui-empty-state settings-empty-row" }, t(searching ? "promptHistory.searchEmpty" : "promptHistory.noHistory"));
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
      el("div", { class: "prompt-history-panel-body" },
        createSettingsList({
          headers: [t("promptHistory.time"), t("promptHistory.prompt"), t("profiles.actions")],
          rows,
          className: "prompt-history-list prompt-history-panel-list"
        })
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
    if (existing) return existing.closest(".modal-backdrop") || existing.parentElement;
    resetSearch();
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
    redraw();
    return dialog;
  }

  return {
    openHistoryPanel
  };
}
