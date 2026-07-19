import { t } from "../../shared/i18n.js";
import { button, clear, editorModal, el, field, input, textarea, toast, viewerModal } from "../../ui/dom.js";

export function createPromptLibraryController(ctx) {
  const {
    state,
    createId,
    savePromptLibrary,
    syncPromptInputNode,
    ensurePromptInputReady = () => true,
    settingsActions,
    settingsDragHandle,
    settingsEmptyRow,
    settingsIconAction,
    settingsList,
    settingsListDropPlacement,
    settingsPrimaryAction,
    cleanupSettingsDragRows,
    moveListItem
  } = ctx;

  function reset() {
    state.settingsPromptLibraryDragId = "";
    cleanupSettingsDragRows(".prompt-library-row");
  }

  function promptLibraryManager(redraw, options = {}) {
    const className = options.className || "prompt-library-list";
    const rows = state.promptLibrary.length
      ? state.promptLibrary.map((prompt) => promptLibraryRow(prompt, redraw, options))
      : settingsEmptyRow(t("prompts.noPrompts"));
    return [
      settingsActions(
        settingsPrimaryAction(t("prompts.add"), "plus", () => openPromptLibraryEditor(null, redraw))
      ),
      settingsList(["", t("prompts.promptTitle"), t("prompts.promptContent"), t("apps.action")], rows, `settings-edit-list ${className}`)
    ];
  }

  function openPromptLibraryDialog() {
    const existing = document.querySelector(".prompt-library-backdrop .modal.prompt-library-modal");
    if (existing) return existing.closest?.(".modal-backdrop") || existing.parentElement;
    const host = el("div", { class: "ui-dialog prompt-library-dialog" });
    let dialog;
    const position = () => positionPromptLibraryDialog(dialog);
    const close = () => {
      window.removeEventListener("resize", position);
      reset();
      dialog.remove();
    };
    const redraw = () => {
      clear(host);
      host.append(...promptLibraryManager(redraw, {
        className: "prompt-library-list prompt-library-dialog-list",
        onUse: close
      }));
    };
    dialog = viewerModal(t("prompts.title"), host, close, true, t("common.close"));
    dialog.classList.add("prompt-library-backdrop");
    dialog.querySelector(".modal")?.classList.add("prompt-library-modal");
    position();
    window.addEventListener("resize", position);
    redraw();
  }

  function positionPromptLibraryDialog(dialog) {
    if (!dialog) return;
    const promptRect = document.querySelector(".prompt-shell")?.getBoundingClientRect();
    const topbarRect = document.querySelector(".topbar")?.getBoundingClientRect();
    const top = Math.max(8, Math.round(promptRect?.bottom || topbarRect?.bottom || 52));
    dialog.style.setProperty("--prompt-library-top", `${top}px`);
  }

  function promptLibraryRow(prompt, redraw, options = {}) {
    return el("div", {
      class: "ui-list-row settings-list-row settings-manager-row prompt-library-row",
      dataset: { promptId: prompt.id },
      draggable: "true",
      ondragstart: (event) => startPromptLibraryDrag(event, prompt),
      ondragover: (event) => previewPromptLibraryDrop(event, prompt),
      ondragleave: (event) => {
        event.currentTarget.classList.remove("drop-before", "drop-after");
      },
      ondrop: (event) => dropPromptLibraryItem(event, prompt, redraw),
      ondragend: cleanupPromptLibraryDrag
    },
      settingsDragHandle(t("prompts.title")),
      el("strong", { class: "settings-main-cell" }, prompt.title || t("common.untitledPrompt")),
      el("span", { class: "prompt-library-preview" }, prompt.prompt || ""),
      el("div", { class: "settings-row-action-group" },
        settingsIconAction(t("common.edit"), "edit", () => openPromptLibraryEditor(prompt, redraw)),
        settingsIconAction(t("common.delete"), "trash", () => deletePromptLibraryItem(prompt, redraw), "danger"),
        settingsIconAction(t("prompts.insert"), "insert", () => insertPromptFromLibrary(prompt, options.onUse))
      )
    );
  }

  function startPromptLibraryDrag(event, prompt) {
    state.settingsPromptLibraryDragId = prompt.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-prompt-library", prompt.id);
    event.dataTransfer?.setData("text/plain", prompt.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function cleanupPromptLibraryDrag() {
    state.settingsPromptLibraryDragId = "";
    cleanupSettingsDragRows(".prompt-library-row");
  }

  function previewPromptLibraryDrop(event, prompt) {
    const sourceId = state.settingsPromptLibraryDragId || event.dataTransfer?.getData("application/x-chatclub-prompt-library") || "";
    if (!sourceId || sourceId === prompt.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", settingsListDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", settingsListDropPlacement(event) !== "after");
  }

  async function dropPromptLibraryItem(event, targetPrompt, redraw) {
    const sourceId = state.settingsPromptLibraryDragId || event.dataTransfer?.getData("application/x-chatclub-prompt-library") || event.dataTransfer?.getData("text/plain") || "";
    if (!sourceId || sourceId === targetPrompt.id) return;
    event.preventDefault();
    const prompts = moveListItem(state.promptLibrary, sourceId, targetPrompt.id, settingsListDropPlacement(event));
    cleanupPromptLibraryDrag();
    state.promptLibrary = await savePromptLibrary(prompts);
    redraw();
    toast(t("toast.promptOrderSaved"), "success");
  }

  function insertTextIntoPrompt(text) {
    if (!ensurePromptInputReady()) return false;
    const current = state.promptText || "";
    const selection = state.promptSelection || {};
    const start = Number.isFinite(selection.start) ? Math.max(0, Math.min(selection.start, current.length)) : current.length;
    const end = Number.isFinite(selection.end) ? Math.max(start, Math.min(selection.end, current.length)) : start;
    state.promptText = `${current.slice(0, start)}${text}${current.slice(end)}`;
    state.promptHistoryCursor = -1;
    state.promptHistoryDraft = "";
    const nextCursor = start + text.length;
    state.promptSelection = { start: nextCursor, end: nextCursor, direction: "none" };
    const inputNode = syncPromptInputNode({ focus: true });
    try { inputNode?.setSelectionRange(nextCursor, nextCursor, "none"); } catch {}
    return true;
  }

  function insertPromptFromLibrary(prompt, afterInsert) {
    if (!prompt?.prompt) return;
    if (!insertTextIntoPrompt(prompt.prompt)) return;
    if (typeof afterInsert === "function") afterInsert();
    toast(t("toast.promptInserted"), "success");
  }

  function promptLibraryPromptList() {
    return state.promptLibrary.map((prompt) => ({
      ...prompt,
      title: prompt.title || t("common.untitledPrompt"),
      prompt: prompt.prompt || ""
    }));
  }

  async function savePromptLibraryList(prompts, redraw, message = t("toast.promptLibrarySaved")) {
    state.promptLibrary = await savePromptLibrary(prompts);
    redraw();
    if (message) toast(message, "success");
  }

  function replacePromptLibraryItem(draft, nextPrompt, editing) {
    return editing
      ? promptLibraryPromptList().map((item) => item.id === draft.id ? nextPrompt : item)
      : [...promptLibraryPromptList(), nextPrompt];
  }

  function normalizePromptLibraryDraft(draft, titleInput, promptInput) {
    return {
      ...draft,
      title: titleInput.value.trim(),
      prompt: promptInput.value.trim()
    };
  }

  function countedField(label, node, max) {
    node.maxLength = max;
    const counter = el("span", { class: "settings-character-counter" }, `${String(node.value || "").length} / ${max}`);
    node.addEventListener("input", () => {
      counter.textContent = `${String(node.value || "").length} / ${max}`;
    });
    return field(label, el("div", { class: "settings-character-field" }, node, counter));
  }

  function openPromptLibraryEditor(prompt, redraw) {
    const editing = Boolean(prompt);
    const draft = structuredClone(prompt || { id: createId("prompt"), title: "", prompt: "" });
    const titleInput = input(draft.title || "", { placeholder: t("prompts.promptTitle") });
    const promptInput = textarea(draft.prompt || "", { placeholder: t("prompts.promptContent") });
    promptInput.classList.add("settings-large-textarea");
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const nextPrompt = normalizePromptLibraryDraft(draft, titleInput, promptInput);
      if (!nextPrompt.title) return toast(t("prompts.titleRequired"), "error");
      if (!nextPrompt.prompt) return toast(t("prompts.contentRequired"), "error");
      await savePromptLibraryList(replacePromptLibraryItem(draft, nextPrompt, editing), redraw, editing ? t("toast.promptUpdated") : t("toast.promptAdded"));
      close();
    };
    dialog = editorModal(editing ? t("prompts.editTitle") : t("prompts.addTitle"),
      el("div", { class: "settings-editor-form prompt-library-editor" },
        countedField(t("prompts.promptTitle"), titleInput, 100),
        countedField(t("prompts.promptContent"), promptInput, 2000),
        el("div", { class: "settings-dialog-actions" },
          button(t("common.cancel"), close),
          button(t("common.ok"), save, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal", "prompt-library-editor-modal");
  }

  async function deletePromptLibraryItem(prompt, redraw) {
    if (!window.confirm(t("prompts.deleteConfirm", { name: prompt.title || t("common.untitledPrompt") }))) return;
    state.promptLibrary = await savePromptLibrary(state.promptLibrary.filter((item) => item.id !== prompt.id));
    redraw();
    toast(t("toast.promptDeleted"), "success");
  }

  return {
    reset,
    insertTextIntoPrompt,
    openPromptLibraryDialog,
    promptLibraryManager
  };
}
