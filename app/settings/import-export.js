import { t } from "../../shared/i18n.js";
import {
  CONFIG_BUNDLE_KEYS,
  POCKET_HISTORY_LIMIT,
  inspectImportedConfig,
  isStorageQuotaError,
  mergePocketHistory
} from "../../shared/storage-schema.js";
import {
  exportStoredConfigBundle,
  readPocketHistory,
  saveImportedConfigPatch
} from "../../shared/storage-adapter.js";
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
const POCKET_IMPORT_SIZE_WARNING_BYTES = 4 * 1024 * 1024;
const EMPTY_REPLACE_IMPORT_KEYS = new Set(["customConfig", "promptLibrary", "promptSendHistory"]);

export function createImportExportSettings(ctx) {
  const {
    state,
    svgIcon,
    notifyConfigReload,
    hydrateGroups,
    syncI18nLanguage,
    render,
    prepareForConfigImport = async () => {},
    prepareForConfigExport = prepareForConfigImport,
    afterConfigImport = async () => {},
    resetAfterConfigImport = () => {}
  } = ctx;

  function itemValueCount(value) {
    if (Array.isArray(value)) return value.length;
    return value ? 1 : 0;
  }

  function importedOptionsHaveExecutableScripts(options = {}) {
    const hasCustomUserscript = (config = {}) => {
      const customMode = config?.sourceMode === "custom" || config?.userscriptOverride === true || config?.builtIn === false;
      const source = String(config?.customUserscript || (customMode ? config?.userscript : "") || "").trim();
      return customMode && Boolean(source);
    };
    return (Array.isArray(options.summarySiteConfigs) && options.summarySiteConfigs.some(hasCustomUserscript))
      || (Array.isArray(options.topicDeleteSiteConfigs) && options.topicDeleteSiteConfigs.some(hasCustomUserscript));
  }

  function importKeyIsEmptyArray(key, imported = {}) {
    return Array.isArray(imported[key]) && imported[key].length === 0;
  }

  function importKeyDefaultsChecked(key, imported = {}) {
    if (key === "options" && importedOptionsHaveExecutableScripts(imported.options || {})) return false;
    if (importKeyIsEmptyArray(key, imported)) return false;
    return true;
  }

  function defaultImportKeys(imported) {
    return availableImportKeys(imported).filter((key) => importKeyDefaultsChecked(key, imported));
  }

  function itemMetaText(key, value, available, imported = {}) {
    if (!available) return t("io.itemMissing");
    if (key === "options" && importedOptionsHaveExecutableScripts(imported.options || {})) return t("io.itemNeedsReview");
    if (Array.isArray(value) && !value.length) return t("io.itemEmpty");
    if (Array.isArray(value)) return t("io.itemCount", { count: value.length });
    if (key === "options" || key === "shortcutConfig") return t("io.itemAvailable");
    return t("io.itemCount", { count: itemValueCount(value) });
  }

  function jsonByteSize(value) {
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch {
      return JSON.stringify(value || "").length;
    }
  }

  function formatByteSize(size) {
    const number = Number(size);
    if (!Number.isFinite(number) || number <= 0) return "0 KB";
    if (number >= 1024 * 1024) return `${(number / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(number / 1024))} KB`;
  }

  function exportWarningMessages(selectedKeys, options = state.options || {}) {
    const selected = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys || []);
    const messages = [];
    if (selected.has("options")) messages.push(t("io.sensitiveWarning.options"));
    if (selected.has("options") && importedOptionsHaveExecutableScripts(options)) messages.push(t("io.sensitiveWarning.scripts"));
    if (selected.has("pocketHistory")) messages.push(t("io.sensitiveWarning.pocket"));
    if (selected.has("promptLibrary") || selected.has("promptSendHistory")) messages.push(t("io.sensitiveWarning.prompts"));
    return messages;
  }

  function importBlockLabel(key) {
    return t(IMPORT_EXPORT_ITEMS.find((item) => item.key === key)?.labelKey || key);
  }

  function pocketKey(item = {}) {
    return [item.batchId || "legacy", item.chatUrl, item.userMessage, item.assistantMessage].join("\n");
  }

  function pocketMergeStats(existing = [], imported = [], saved = []) {
    const existingKeys = new Set(existing.map(pocketKey));
    const savedKeys = new Set(saved.map(pocketKey));
    const importedKeys = [...new Set(imported.map(pocketKey))];
    const duplicateCount = importedKeys.filter((key) => existingKeys.has(key)).length;
    const addedCount = importedKeys.filter((key) => savedKeys.has(key) && !existingKeys.has(key)).length;
    const cappedCount = Math.max(0, importedKeys.length - duplicateCount - addedCount);
    return { addedCount, cappedCount, duplicateCount };
  }

  function pocketMergeOmittedExistingCount(existing = [], imported = []) {
    const existingKeys = [...new Set(existing.map(pocketKey))];
    if (!existingKeys.length) return 0;
    const mergedKeys = new Set(mergePocketHistory(existing, imported).map(pocketKey));
    return existingKeys.filter((key) => !mergedKeys.has(key)).length;
  }

  function importWarningMessages(imported, diagnostics, selectedKeys, pocketMode, pocketImportSize, pocketExistingEntries = state.pocketEntries || []) {
    const selected = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys || []);
    const messages = [];
    if (selected.has("pocketHistory") && pocketImportSize >= POCKET_IMPORT_SIZE_WARNING_BYTES) {
      messages.push(t("io.largePocketWarning", {
        count: itemValueCount(imported.pocketHistory),
        size: formatByteSize(pocketImportSize)
      }));
    }
    if (selected.has("options") && importedOptionsHaveExecutableScripts(imported.options || {})) {
      messages.push(t("io.importExecutableScriptsWarning"));
    }
    for (const key of IMPORT_EXPORT_ITEM_KEYS) {
      const dropped = diagnostics?.[key]?.droppedCount || 0;
      if (selected.has(key) && dropped > 0) {
        messages.push(t("io.importDroppedItems", { label: importBlockLabel(key), count: dropped }));
      }
      const emptyReplacement = EMPTY_REPLACE_IMPORT_KEYS.has(key) || (key === "pocketHistory" && pocketMode === "replace");
      if (selected.has(key) && emptyReplacement && importKeyIsEmptyArray(key, imported)) {
        messages.push(t("io.importEmptyReplaceWarning", { label: importBlockLabel(key) }));
      }
    }
    if (
      selected.has("pocketHistory")
      && pocketMode === "merge"
      && pocketMergeOmittedExistingCount(pocketExistingEntries, imported.pocketHistory || []) > 0
    ) {
      messages.push(t("io.pocketLimitWarning", { count: POCKET_HISTORY_LIMIT }));
    }
    return messages;
  }

  function importFailureMessage(error) {
    if (isStorageQuotaError(error)) return t("toast.importStorageQuota");
    return error?.message || t("toast.importFailed");
  }

  function exportFailureMessage(error) {
    const reason = String(error?.message || "").trim();
    return reason ? t("toast.exportFailedWithReason", { reason }) : t("toast.exportFailed");
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

  async function applyImportedConfig(imported, selectedKeys, pocketMode = "merge", options = {}) {
    const selectedList = normalizedSelection(imported, selectedKeys);
    const selected = new Set(selectedList);
    if (!selected.size) {
      toast(t("toast.importNoSelection"), "error");
      return false;
    }
    await prepareForConfigImport(selectedList);
    const patch = {};
    if (selected.has("options")) patch.options = imported.options;
    if (selected.has("customConfig")) patch.customConfig = imported.customConfig;
    if (selected.has("promptLibrary")) patch.promptLibrary = imported.promptLibrary;
    if (selected.has("promptSendHistory")) patch.promptSendHistory = imported.promptSendHistory;
    if (selected.has("shortcutConfig")) patch.shortcutConfig = imported.shortcutConfig;
    let pocketExisting = [];
    let pocketStats = null;
    if (selected.has("pocketHistory")) {
      pocketExisting = pocketMode === "replace" ? [] : await readPocketHistory();
      patch.pocketHistory = pocketMode === "replace"
        ? imported.pocketHistory
        : mergePocketHistory(pocketExisting, imported.pocketHistory);
    }
    const saved = await saveImportedConfigPatch(patch);
    if (selected.has("pocketHistory")) {
      pocketStats = pocketMergeStats(pocketExisting, imported.pocketHistory, saved.pocketHistory || []);
    }
    if ("options" in saved) state.options = saved.options;
    if ("customConfig" in saved) state.customConfig = saved.customConfig;
    if ("promptLibrary" in saved) state.promptLibrary = saved.promptLibrary;
    if ("promptSendHistory" in saved) state.promptSendHistory = saved.promptSendHistory;
    if ("shortcutConfig" in saved) state.shortcutConfig = saved.shortcutConfig;
    if ("pocketHistory" in saved) state.pocketEntries = saved.pocketHistory;
    await notifyConfigReload();
    hydrateGroups();
    syncI18nLanguage();
    resetAfterConfigImport(selectedList);
    render();
    options.redraw?.();
    await afterConfigImport(selectedList, saved);
    toast(t("toast.configImported"), "success");
    if (pocketStats?.cappedCount > 0) {
      toast(t("toast.importPocketLimit", { count: pocketStats.cappedCount }), "info");
    }
    return true;
  }

  async function importConfigText(text, choices = {}) {
    const options = choices && typeof choices === "object" ? choices : {};
    const inspected = inspectImportedConfig(JSON.parse(text));
    const imported = inspected.data;
    if (typeof options.onDiagnostics === "function") {
      options.onDiagnostics(inspected.diagnostics, imported);
    }
    const defaultSelectedKeys = options.selectedKeys == null ? defaultImportKeys(imported) : options.selectedKeys;
    const ok = await applyImportedConfig(imported, defaultSelectedKeys, options.pocketMode || "merge", options);
    if (options.returnDiagnostics) {
      return { ok, diagnostics: inspected.diagnostics, imported };
    }
    return ok;
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

  function openImportConfirmDialog(imported, diagnostics = {}, options = {}) {
    const availableKeys = availableImportKeys(imported);
    if (!availableKeys.length) {
      toast(t("toast.importNoData"), "error");
      return;
    }
    const selectedKeys = new Set(defaultImportKeys(imported));
    let pocketMode = "merge";
    let dialog = null;
    let confirmButton = null;
    let pocketModePanel = null;
    let importWarnings = null;
    let pocketExistingEntries = Array.isArray(state.pocketEntries) ? state.pocketEntries : [];
    const pocketImportSize = jsonByteSize(imported.pocketHistory || []);

    const updateState = () => {
      const hasSelection = selectedKeys.size > 0;
      if (confirmButton) confirmButton.disabled = !hasSelection;
      if (pocketModePanel) pocketModePanel.hidden = !selectedKeys.has("pocketHistory");
      if (importWarnings) {
        const messages = importWarningMessages(imported, diagnostics, selectedKeys, pocketMode, pocketImportSize, pocketExistingEntries);
        importWarnings.hidden = !messages.length;
        importWarnings.replaceChildren(...messages.map((message) => el("span", {}, message)));
      }
    };

    if (imported.pocketHistory !== null) {
      readPocketHistory().then((history) => {
        pocketExistingEntries = history;
        updateState();
      }).catch(() => {});
    }

    const close = () => dialog?.remove();
    const confirm = async () => {
      if (!selectedKeys.size) return toast(t("toast.importNoSelection"), "error");
      if (confirmButton) confirmButton.disabled = true;
      try {
        const ok = await applyImportedConfig(imported, [...selectedKeys], pocketMode, options);
        if (ok) close();
      } catch (error) {
        toast(importFailureMessage(error), "error");
        updateState();
      }
    };

    const rows = IMPORT_EXPORT_ITEMS.map((item) => {
      const available = imported[item.key] !== null;
      const { row } = createChoiceRow(item, {
        checked: available && selectedKeys.has(item.key),
        disabled: !available,
        meta: itemMetaText(item.key, imported[item.key], available, imported),
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
    mergeInput.addEventListener("change", () => {
      if (mergeInput.checked) {
        pocketMode = "merge";
        updateState();
      }
    });
    replaceInput.addEventListener("change", () => {
      if (replaceInput.checked) {
        pocketMode = "replace";
        updateState();
      }
    });
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
    importWarnings = el("div", { class: "io-sensitive-warning", hidden: true });

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
        importWarnings,
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

  function importExportPane(redraw) {
    const selectedExportKeys = new Set(CONFIG_BUNDLE_KEYS);
    const fileInput = el("input", { class: "settings-file-input", type: "file", accept: "application/json" });
    let exportButton = null;
    let exportNotice = null;
    let exportWarning = null;

    const updateExportState = () => {
      const hasSelection = selectedExportKeys.size > 0;
      if (exportButton) exportButton.disabled = !hasSelection;
      if (exportNotice) exportNotice.hidden = hasSelection;
      if (exportWarning) {
        const messages = exportWarningMessages(selectedExportKeys);
        exportWarning.hidden = !messages.length;
        exportWarning.replaceChildren(...messages.map((message) => el("span", {}, message)));
      }
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
    exportWarning = el("div", { class: "io-sensitive-warning" });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const inspected = inspectImportedConfig(JSON.parse(await readFileAsText(file)));
        openImportConfirmDialog(inspected.data, inspected.diagnostics, { redraw });
      } catch (error) {
        toast(importFailureMessage(error), "error");
      } finally {
        fileInput.value = "";
      }
    });
    exportButton = el("button", {
      class: "settings-config-button",
      type: "button",
      onclick: async () => {
        const selectedKeys = [...selectedExportKeys];
        if (!selectedKeys.length) return toast(t("toast.exportNoSelection"), "error");
        exportButton.disabled = true;
        try {
          await prepareForConfigExport(selectedKeys);
          const bundle = await exportStoredConfigBundle(selectedKeys, state);
          downloadText(`chatclub-config-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bundle, null, 2));
        } catch (error) {
          toast(exportFailureMessage(error), "error");
        } finally {
          updateExportState();
        }
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
        exportWarning,
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
