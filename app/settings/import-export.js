import { t } from "../../shared/i18n.js";
import {
  exportConfigBundle,
  migrateImportedConfig,
  saveCustomConfig,
  saveOptions,
  savePromptLibrary,
  savePromptSendHistory,
  saveShortcutConfig
} from "../../shared/storage.js";
import { downloadText, el, readFileAsText, toast } from "../../ui/dom.js";

export function createImportExportSettings(ctx) {
  const {
    state,
    svgIcon,
    notifyConfigReload,
    hydrateGroups,
    syncI18nLanguage,
    render
  } = ctx;

  async function importConfigText(text) {
    const imported = migrateImportedConfig(JSON.parse(text));
    if (imported.options) state.options = await saveOptions(imported.options);
    if (imported.customConfig) state.customConfig = await saveCustomConfig(imported.customConfig);
    if (imported.promptLibrary) state.promptLibrary = await savePromptLibrary(imported.promptLibrary);
    if (imported.promptSendHistory) state.promptSendHistory = await savePromptSendHistory(imported.promptSendHistory);
    if (imported.shortcutConfig) state.shortcutConfig = await saveShortcutConfig(imported.shortcutConfig);
    await notifyConfigReload();
    hydrateGroups();
    syncI18nLanguage();
    render();
    toast(t("toast.configImported"), "success");
  }

  function importExportPane() {
    const fileInput = el("input", { class: "settings-file-input", type: "file", accept: "application/json" });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        await importConfigText(await readFileAsText(file));
      } catch (error) {
        toast(error.message || t("toast.importFailed"), "error");
      } finally {
        fileInput.value = "";
      }
    });
    return el("div", { class: "settings-pane import-export-pane" },
      el("section", { class: "settings-manage-card" },
        el("div", { class: "settings-manage-title" },
          svgIcon("fileCog"),
          el("div", {},
            el("h4", {}, t("io.manageTitle")),
            el("p", {}, t("io.manageDesc"))
          )
        ),
        el("div", { class: "settings-config-actions" },
          el("button", {
            class: "settings-config-button",
            type: "button",
            onclick: () => {
              const bundle = exportConfigBundle(state);
              downloadText(`chatclub-config-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bundle, null, 2));
            }
          }, svgIcon("fileDown"), el("span", {}, t("common.export"))),
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
