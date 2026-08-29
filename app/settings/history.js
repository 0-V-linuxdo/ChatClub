import { t } from "../../shared/i18n.js";
import { savePromptSendHistory } from "../../shared/storage-adapter.js";
import { el, input, openConfirmationAction, toast } from "../../ui/dom.js";
import { createSettingsKit } from "./kit.js";
import { requireSettingsSectionStatePort } from "./section-contract.js";
import {
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";
import {
  groupPromptHistory,
  promptHistoryImageCountLabel,
  promptHistoryItemMatchesSearch,
  promptHistoryPreview,
  promptHistoryTimeLabel
} from "../history/model.js";

export function createPromptHistorySettingsSection(ctx) {
  const controllerName = "Prompt history settings section";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    setPromptImages: "function",
    syncPromptInputNode: "function"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    ["promptHistoryCursor", "promptHistoryDraft", "promptSelection", "promptSendHistory", "promptText"]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const setPromptImages = requireControllerFunction(ctx, controllerName, "setPromptImages");
  const syncPromptInputNode = requireControllerFunction(ctx, controllerName, "syncPromptInputNode");
  const {
    settingsBlock,
    settingsEmptyRow,
    settingsIconAction,
    settingsList,
    settingsPaneToolbar,
    settingsPrimaryAction
  } = createSettingsKit({ svgIcon });
  let searchQuery = "";
  let searchFocused = false;
  let searchComposing = false;
  let searchSelection = { start: 0, end: 0 };

  function items() {
    return Array.isArray(state.promptSendHistory) ? state.promptSendHistory : [];
  }

  async function save(history, redraw, message) {
    state.promptSendHistory = await savePromptSendHistory(history);
    resetCursor();
    redraw();
    if (message) toast(message, "success");
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

  function resetAfterImport() {
    resetCursor();
    resetSearch();
  }

  function insert(item) {
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
      onConfirm: () => save(items().filter((entry) => entry.id !== item.id), redraw, t("toast.promptHistoryDeleted"))
    });
  }

  function clear(redraw) {
    if (!items().length) return;
    openConfirmationAction({
      title: t("promptHistory.clearTitle"),
      body: t("promptHistory.clearConfirm"),
      confirmLabel: t("promptHistory.clear"),
      cancelLabel: t("common.cancel"),
      closeLabel: t("common.close"),
      onConfirm: () => save([], redraw, t("toast.promptHistoryCleared"))
    });
  }

  function restoreSearchField() {
    requestAnimationFrame(() => {
      const field = document.querySelector(".prompt-history-search-input");
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
    const field = document.querySelector(".prompt-history-search-input");
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
      class: "shortcut-search-input prompt-history-search-input",
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
      class: "shortcut-search prompt-history-search",
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

  function row(item, redraw) {
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
        settingsIconAction(t("promptHistory.insert"), "insert", () => insert(item), "", false, "settings.action.insert"),
        settingsIconAction(t("common.delete"), "trash", () => remove(item, redraw), "danger", false, "settings.action.delete")
      )
    );
  }

  function pane(redraw) {
    const history = items();
    const query = searchQuery;
    const searching = Boolean(String(query || "").trim());
    const visible = searching ? history.filter((item) => promptHistoryItemMatchesSearch(item, query)) : history;
    const rows = visible.length
      ? groupPromptHistory(visible).flatMap((group) => [
        el("div", { class: "prompt-history-group", role: "heading", "aria-level": "5" }, t(group.labelKey)),
        group.items.map((item) => row(item, redraw))
      ])
      : settingsEmptyRow(t(searching ? "promptHistory.searchEmpty" : "promptHistory.noHistory"));
    return el("div", { class: "settings-pane" },
      settingsBlock(t("promptHistory.title"), t("promptHistory.desc"),
        settingsPaneToolbar(
          t("promptHistory.manage"),
          ...(history.length ? [settingsPrimaryAction(t("promptHistory.clear"), "trash", () => clear(redraw))] : [])
        ),
        settingsList([t("promptHistory.time"), t("promptHistory.prompt"), t("profiles.actions")], rows, "prompt-history-list")
      )
    );
  }

  return Object.freeze({ headerSearch, pane, resetAfterImport });
}
