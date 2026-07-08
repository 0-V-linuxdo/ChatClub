import { t } from "../../shared/i18n.js";
import {
  CONFIG_BUNDLE_KEYS,
  exportConfigBundle,
  migrateImportedConfig,
  mergePocketHistory,
  saveCustomConfig,
  saveOptions,
  savePocketHistory,
  savePromptLibrary,
  savePromptSendHistory,
  saveShortcutConfig
} from "../../shared/storage.js";
import { downloadText, el, modal, readFileAsText, toast } from "../../ui/dom.js";

const IMPORT_EXPORT_ITEMS = Object.freeze([
  Object.freeze({ key: "options", labelKey: "io.item.options", descKey: "io.item.optionsDesc" }),
  Object.freeze({ key: "customConfig", labelKey: "io.item.customConfig", descKey: "io.item.customConfigDesc" }),
  Object.freeze({ key: "promptLibrary", labelKey: "io.item.promptLibrary", descKey: "io.item.promptLibraryDesc" }),
  Object.freeze({ key: "promptSendHistory", labelKey: "io.item.promptSendHistory", descKey: "io.item.promptSendHistoryDesc" }),
  Object.freeze({ key: "shortcutConfig", labelKey: "io.item.shortcutConfig", descKey: "io.item.shortcutConfigDesc" }),
  Object.freeze({ key: "pocketHistory", labelKey: "io.item.pocketHistory", descKey: "io.item.pocketHistoryDesc" })
]);

const IMPORT_EXPORT_ITEM_KEYS = IMPORT_EXPORT_ITEMS.map((item) => item.key);

export function createImportExportSettings(ctx) {
  const {
    state,
    svgIcon,
    notifyConfigReload,
    hydrateGroups,
    syncI18nLanguage,
    render
  } = ctx;

  function itemValueCount(value) {
    if (Array.isArray(value)) return value.length;
    return value ? 1 : 0;
  }

  function itemMetaText(key, value, available) {
    if (!available) return t("io.itemMissing");
    if (Array.isArray(value)) return t("io.itemCount", { count: value.length });
    if (key === "options" || key === "shortcutConfig") return t("io.itemAvailable");
    return t("io.itemCount", { count: itemValueCount(value) });
  }

  function availableImportKeys(imported) {
    return IMPORT_EXPORT_ITEM_KEYS.filter((key) => imported[key] !== null);
  }

  function normalizedSelection(imported, selectedKeys) {
    const available = new Set(availableImportKeys(imported));
    const source = selectedKeys == null ? [...available] : selectedKeys;
    const keys = Array.isArray(source)
      ? source
      : source && typeof source !== "string" && typeof source[Symbol.iterator] === "function"
        ? [...source]
        : [];
    return keys.filter((key, index) =>
      available.has(key) && keys.indexOf(key) === index
    );
  }

  async function applyImportedConfig(imported, selectedKeys, pocketMode = "merge") {
    const selected = new Set(normalizedSelection(imported, selectedKeys));
    if (!selected.size) {
      toast(t("toast.importNoSelection"), "error");
      return false;
    }
    if (selected.has("options")) state.options = await saveOptions(imported.options);
    if (selected.has("customConfig")) state.customConfig = await saveCustomConfig(imported.customConfig);
    if (selected.has("promptLibrary")) state.promptLibrary = await savePromptLibrary(imported.promptLibrary);
    if (selected.has("promptSendHistory")) state.promptSendHistory = await savePromptSendHistory(imported.promptSendHistory);
    if (selected.has("shortcutConfig")) state.shortcutConfig = await saveShortcutConfig(imported.shortcutConfig);
    if (selected.has("pocketHistory")) {
      const nextPocketHistory = pocketMode === "replace"
        ? imported.pocketHistory
        : mergePocketHistory(state.pocketEntries || [], imported.pocketHistory);
      state.pocketEntries = await savePocketHistory(nextPocketHistory);
    }
    await notifyConfigReload();
    hydrateGroups();
    syncI18nLanguage();
    render();
    toast(t("toast.configImported"), "success");
    return true;
  }

  async function importConfigText(text, choices = {}) {
    const imported = migrateImportedConfig(JSON.parse(text));
    const selectedKeys = choices.selectedKeys == null ? availableImportKeys(imported) : choices.selectedKeys;
    return applyImportedConfig(imported, selectedKeys, choices.pocketMode || "merge");
  }

  function createChoiceRow(item, options = {}) {
    const {
      checked = true,
      disabled = false,
      meta = "",
      onchange = null
    } = options;
    const checkbox = el("input", {
      type: "checkbox",
      checked,
      disabled,
      "aria-label": t(item.labelKey)
    });
    if (onchange) checkbox.addEventListener("change", () => onchange(checkbox.checked));
    return {
      checkbox,
      row: el("label", {
        class: `io-choice-row${disabled ? " io-choice-row-disabled" : ""}`.trim()
      },
        checkbox,
        el("span", { class: "io-choice-copy" },
          el("strong", {}, t(item.labelKey)),
          el("span", {}, t(item.descKey))
        ),
        el("span", { class: "io-choice-meta" }, meta)
      )
    };
  }

  function openImportConfirmDialog(imported) {
    const availableKeys = availableImportKeys(imported);
    if (!availableKeys.length) {
      toast(t("toast.importNoData"), "error");
      return;
    }
    const selectedKeys = new Set(availableKeys);
    let pocketMode = "merge";
    let dialog = null;
    let confirmButton = null;
    let pocketModePanel = null;

    const updateState = () => {
      const hasSelection = selectedKeys.size > 0;
      if (confirmButton) confirmButton.disabled = !hasSelection;
      if (pocketModePanel) pocketModePanel.hidden = !selectedKeys.has("pocketHistory");
    };

    const close = () => dialog?.remove();
    const confirm = async () => {
      if (!selectedKeys.size) return toast(t("toast.importNoSelection"), "error");
      if (confirmButton) confirmButton.disabled = true;
      try {
        const ok = await applyImportedConfig(imported, [...selectedKeys], pocketMode);
        if (ok) close();
      } catch (error) {
        toast(error.message || t("toast.importFailed"), "error");
        updateState();
      }
    };

    const rows = IMPORT_EXPORT_ITEMS.map((item) => {
      const available = imported[item.key] !== null;
      const { row } = createChoiceRow(item, {
        checked: available,
        disabled: !available,
        meta: itemMetaText(item.key, imported[item.key], available),
        onchange: (checked) => {
          if (checked) selectedKeys.add(item.key);
          else selectedKeys.delete(item.key);
          updateState();
        }
      });
      return row;
    });

    const mergeInput = el("input", { type: "radio", name: "io-pocket-mode", value: "merge", checked: true });
    const replaceInput = el("input", { type: "radio", name: "io-pocket-mode", value: "replace" });
    mergeInput.addEventListener("change", () => { if (mergeInput.checked) pocketMode = "merge"; });
    replaceInput.addEventListener("change", () => { if (replaceInput.checked) pocketMode = "replace"; });
    pocketModePanel = el("div", { class: "io-pocket-mode-panel" },
      el("strong", {}, t("io.pocketModeTitle")),
      el("label", { class: "io-radio-row" },
        mergeInput,
        el("span", {},
          el("strong", {}, t("io.pocketModeMerge")),
          el("span", {}, t("io.pocketModeMergeDesc"))
        )
      ),
      el("label", { class: "io-radio-row" },
        replaceInput,
        el("span", {},
          el("strong", {}, t("io.pocketModeReplace")),
          el("span", {}, t("io.pocketModeReplaceDesc"))
        )
      )
    );

    confirmButton = el("button", {
      class: "button button-primary",
      type: "button",
      onclick: confirm
    }, t("io.importSelected"));

    dialog = modal(t("io.importConfirmTitle"),
      el("div", { class: "ui-dialog io-import-dialog" },
        el("p", { class: "io-dialog-lead" }, t("io.importConfirmDesc")),
        el("div", { class: "io-choice-list io-import-choice-list" }, rows),
        pocketModePanel,
        el("div", { class: "settings-dialog-actions" },
          el("button", { class: "button button-secondary", type: "button", onclick: close }, t("common.cancel")),
          confirmButton
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("io-import-modal");
    updateState();
  }

  function importExportPane() {
    const selectedExportKeys = new Set(CONFIG_BUNDLE_KEYS);
    const fileInput = el("input", { class: "settings-file-input", type: "file", accept: "application/json" });
    let exportButton = null;
    let exportNotice = null;

    const updateExportState = () => {
      const hasSelection = selectedExportKeys.size > 0;
      if (exportButton) exportButton.disabled = !hasSelection;
      if (exportNotice) exportNotice.hidden = hasSelection;
    };

    const exportRows = IMPORT_EXPORT_ITEMS.map((item) => {
      const { row } = createChoiceRow(item, {
        checked: true,
        meta: "",
        onchange: (checked) => {
          if (checked) selectedExportKeys.add(item.key);
          else selectedExportKeys.delete(item.key);
          updateExportState();
        }
      });
      return row;
    });

    exportNotice = el("p", { class: "io-no-selection", hidden: true }, t("io.noExportSelection"));

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const imported = migrateImportedConfig(JSON.parse(await readFileAsText(file)));
        openImportConfirmDialog(imported);
      } catch (error) {
        toast(error.message || t("toast.importFailed"), "error");
      } finally {
        fileInput.value = "";
      }
    });
    exportButton = el("button", {
      class: "settings-config-button",
      type: "button",
      onclick: () => {
        const selectedKeys = [...selectedExportKeys];
        if (!selectedKeys.length) return toast(t("toast.exportNoSelection"), "error");
        const bundle = exportConfigBundle(state, selectedKeys);
        downloadText(`chatclub-config-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bundle, null, 2));
      }
    }, svgIcon("fileDown"), el("span", {}, t("common.export")));

    updateExportState();

    return el("div", { class: "settings-pane import-export-pane" },
      el("section", { class: "settings-manage-card" },
        el("div", { class: "settings-manage-title" },
          svgIcon("fileCog"),
          el("div", {},
            el("h4", {}, t("io.manageTitle")),
            el("p", {}, t("io.manageDesc"))
          )
        ),
        el("div", { class: "io-choice-list io-export-choice-list" }, exportRows),
        exportNotice,
        el("div", { class: "settings-config-actions" },
          exportButton,
          el("button", {
            class: "settings-config-button",
            type: "button",
            onclick: () => fileInput.click()
          }, svgIcon("fileUp"), el("span", {}, t("common.import"))),
          fileInput
        )
      )
    );
  }

  return Object.freeze({
    importConfigText,
    importExportPane
  });
}
