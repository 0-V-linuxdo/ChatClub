import {
  BUILTIN_CHAT_APPS,
  PROMPT_IMAGE_PASTE_STRATEGY_BATCH,
  PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL
} from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import {
  createId,
  normalizeBuiltinChatAppOrder,
  normalizePromptImagePasteStrategy
} from "../../shared/storage-schema.js";
import { saveCustomConfig } from "../../shared/storage-adapter.js";
import {
  button,
  editorModal,
  el,
  field,
  input,
  select,
  toast,
  viewerModal
} from "../../ui/dom.js";
import {
  cleanupSettingsDragRows,
  createSettingsKit,
  moveListItem
} from "./kit.js";
import { requireSettingsSectionStatePort } from "./section-contract.js";
import {
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";

export function createAppsSettingsSection(ctx) {
  const controllerName = "Apps settings section";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    notifyConfigReload: "function",
    saveOptionsPatch: "function",
    reconcileAppCatalog: "function",
    syncSummaryPanel: "function",
    syncWorkspaceDom: "function"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    ["customConfig", "options", "settingsAppsTab", "settingsBuiltinAppDragId", "settingsCustomAppDragId"]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const notifyConfigReload = requireControllerFunction(ctx, controllerName, "notifyConfigReload");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const reconcileAppCatalog = requireControllerFunction(ctx, controllerName, "reconcileAppCatalog");
  const syncSummaryPanel = requireControllerFunction(ctx, controllerName, "syncSummaryPanel");
  const syncWorkspaceDom = requireControllerFunction(ctx, controllerName, "syncWorkspaceDom");
  const {
    settingsDragHandle,
    settingsEmptyRow,
    settingsIconAction,
    settingsInnerTabs,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar,
    settingsPrimaryAction
  } = createSettingsKit({ svgIcon });

  function imagePasteStrategyOptions() {
    return [
      { value: PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL, label: t("apps.imageStrategySequential") },
      { value: PROMPT_IMAGE_PASTE_STRATEGY_BATCH, label: t("apps.imageStrategyBatch") }
    ];
  }

  function imagePasteStrategyLabel(strategy) {
    return normalizePromptImagePasteStrategy(strategy) === PROMPT_IMAGE_PASTE_STRATEGY_BATCH
      ? t("apps.imageStrategyBatch")
      : t("apps.imageStrategySequential");
  }

  function builtInAppIsNotion(app = {}) {
    const id = String(app?.id || "").trim().toLowerCase();
    const name = String(app?.name || "").trim().toLowerCase();
    let host = "";
    try { host = new URL(String(app?.url || "")).hostname.toLowerCase(); } catch {}
    return id === "notionai"
      || /\bnotion\b/.test(name)
      || host === "app.notion.com"
      || host === "notion.so"
      || host === "www.notion.so"
      || host.endsWith(".notion.so");
  }

  function builtInImagePasteStrategyLabel(app) {
    return builtInAppIsNotion(app)
      ? t("apps.imageStrategyNotionBridge")
      : imagePasteStrategyLabel(app?.imagePasteStrategy);
  }

  function pane(redraw) {
    const activeTab = state.settingsAppsTab === "custom" ? "custom" : "builtIn";
    return el("div", { class: "settings-pane settings-manager-pane apps-settings-pane" },
      settingsInnerTabs([
        ["builtIn", t("apps.tabBuiltIn"), t("apps.tabBuiltInDesc")],
        ["custom", t("apps.tabCustom"), t("apps.tabCustomDesc")]
      ], activeTab, (tabId) => {
        state.settingsAppsTab = tabId;
        redraw?.();
      }),
      activeTab === "custom" ? customPane(redraw) : builtInPane(redraw)
    );
  }

  function reset() {
    state.settingsBuiltinAppDragId = "";
    state.settingsCustomAppDragId = "";
    cleanupSettingsDragRows(".built-in-config-row");
    cleanupSettingsDragRows(".custom-config-row");
  }

  function builtInPane(redraw) {
    const rows = orderedBuiltInApps().map((app) => builtInRow(app, redraw));
    return el("div", { class: "settings-apps-tab-panel" },
      settingsPaneToolbar(t("apps.builtInManage")),
      settingsList([
        "", t("apps.platformName"), t("apps.platformUrl"), t("apps.imagePasteStrategy"), t("apps.action")
      ], rows, "settings-manager-list built-in-config-list")
    );
  }

  function orderedBuiltInApps(order = state.options?.builtinChatAppOrder) {
    const appById = new Map(BUILTIN_CHAT_APPS.map((app) => [app.id, app]));
    return normalizeBuiltinChatAppOrder(order).map((id) => appById.get(id)).filter(Boolean);
  }

  function builtInRow(app, redraw) {
    return el("div", {
      class: "ui-list-row settings-list-row settings-manager-row built-in-config-row",
      draggable: "true",
      dataset: { builtInAppId: app.id },
      ondragstart: (event) => startBuiltInDrag(event, app),
      ondragend: cleanupBuiltInDrag,
      ondragover: (event) => previewBuiltInDrop(event, app),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropBuiltIn(event, app, redraw)
    },
      settingsDragHandle(t("apps.platformName")),
      el("strong", { class: "settings-main-cell" }, app.name || app.id),
      el("a", { class: "settings-url-link", href: app.url, target: "_blank", rel: "noreferrer" }, app.url),
      el("span", { class: "settings-strategy-cell" }, builtInImagePasteStrategyLabel(app)),
      el("div", { class: "settings-row-action-group" },
        settingsIconAction(t("apps.viewDetails"), "preview", () => openBuiltInDetails(app), "", false, "settings.action.view")
      )
    );
  }

  function detailField(label, content) {
    return el("div", { class: "field settings-detail-field" }, el("span", {}, label), content);
  }

  function detailValue(value) {
    return el("span", { class: "settings-detail-value" }, value || t("apps.default"));
  }

  function detailCode(value) {
    return el("code", { class: "settings-detail-code" }, String(value || t("apps.default")));
  }

  function builtInHostsText(app) {
    if (Array.isArray(app.hosts) && app.hosts.length) return app.hosts.join("\n");
    try { return new URL(app.url || "").hostname || t("apps.default"); } catch { return t("apps.default"); }
  }

  function openBuiltInDetails(app) {
    let dialog;
    const close = () => dialog?.remove();
    dialog = viewerModal(t("apps.builtInDetailsTitle", { name: app.name || app.id }),
      el("div", { class: "settings-editor-form built-in-detail-form" },
        el("div", { class: "settings-dialog-grid built-in-detail-grid" },
          detailField(t("apps.platformName"), detailValue(app.name || app.id)),
          detailField(t("apps.provider"), detailValue(app.provider || t("apps.default"))),
          detailField(t("apps.platformUrl"),
            el("a", { class: "settings-detail-link", href: app.url, target: "_blank", rel: "noreferrer" }, app.url || t("apps.default"))
          ),
          detailField(t("apps.hosts"), detailCode(builtInHostsText(app))),
          detailField(t("apps.inputSelector"), detailCode(app.inputSelector)),
          detailField(t("apps.sendButtonSelector"), detailCode(app.sendButtonSelector)),
          detailField(t("apps.imagePasteStrategy"), detailValue(builtInImagePasteStrategyLabel(app)))
        ),
        el("div", { class: "settings-dialog-actions" }, button(t("common.close"), close, "primary"))
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  function startBuiltInDrag(event, app) {
    state.settingsBuiltinAppDragId = app.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-builtin-app", app.id);
    event.dataTransfer?.setData("text/plain", app.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function cleanupBuiltInDrag() {
    state.settingsBuiltinAppDragId = "";
    cleanupSettingsDragRows(".built-in-config-row");
  }

  function previewBuiltInDrop(event, app) {
    const sourceId = state.settingsBuiltinAppDragId || event.dataTransfer?.getData("application/x-chatclub-builtin-app") || "";
    if (!sourceId || sourceId === app.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const placement = settingsListDropPlacement(event);
    event.currentTarget.classList.toggle("drop-after", placement === "after");
    event.currentTarget.classList.toggle("drop-before", placement !== "after");
  }

  async function dropBuiltIn(event, targetApp, redraw) {
    const sourceId = state.settingsBuiltinAppDragId
      || event.dataTransfer?.getData("application/x-chatclub-builtin-app")
      || event.dataTransfer?.getData("text/plain")
      || "";
    if (!sourceId || sourceId === targetApp.id) return;
    event.preventDefault();
    const currentOrder = normalizeBuiltinChatAppOrder(state.options?.builtinChatAppOrder).map((id) => ({ id }));
    const builtinChatAppOrder = moveListItem(
      currentOrder,
      sourceId,
      targetApp.id,
      settingsListDropPlacement(event)
    ).map((item) => item.id);
    cleanupBuiltInDrag();
    state.options = await saveOptionsPatch({ builtinChatAppOrder });
    syncWorkspaceDom();
    redraw?.();
    toast(t("toast.builtinAppOrderSaved"), "success");
  }

  function customPane(redraw) {
    const rows = state.customConfig.length
      ? state.customConfig.map((app) => customRow(app, redraw))
      : settingsEmptyRow(t("apps.noApps"));
    return el("div", { class: "settings-apps-tab-panel" },
      settingsPaneToolbar(t("apps.manage"),
        settingsPrimaryAction(t("apps.add"), "plus", () => openCustomEditor(null, redraw))
      ),
      settingsList([
        "", t("apps.platformName"), t("apps.platformUrl"), t("apps.imagePasteStrategy"), t("apps.action")
      ], rows, "settings-manager-list custom-config-list")
    );
  }

  function customRow(app, redraw) {
    return el("div", {
      class: "ui-list-row settings-list-row settings-manager-row custom-config-row",
      draggable: "true",
      dataset: { customAppId: app.id },
      ondragstart: (event) => startCustomDrag(event, app),
      ondragend: cleanupCustomDrag,
      ondragover: (event) => previewCustomDrop(event, app),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropCustom(event, app, redraw)
    },
      settingsDragHandle(t("apps.platformName")),
      el("strong", { class: "settings-main-cell" }, app.name || app.id),
      el("a", { class: "settings-url-link", href: app.url, target: "_blank", rel: "noreferrer" }, app.url),
      el("span", { class: "settings-strategy-cell" }, imagePasteStrategyLabel(app.imagePasteStrategy)),
      el("div", { class: "settings-row-action-group" },
        settingsIconAction(t("common.edit"), "edit", () => openCustomEditor(app, redraw), "", false, "settings.action.edit"),
        settingsIconAction(t("common.delete"), "trash", () => removeCustom(app, redraw), "danger", false, "settings.action.delete")
      )
    );
  }

  function startCustomDrag(event, app) {
    state.settingsCustomAppDragId = app.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-custom-app", app.id);
    event.dataTransfer?.setData("text/plain", app.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function cleanupCustomDrag() {
    state.settingsCustomAppDragId = "";
    cleanupSettingsDragRows(".custom-config-row");
  }

  function normalizeCustomUrl(value) {
    try {
      const parsed = new URL(String(value || "").trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function previewCustomDrop(event, app) {
    const sourceId = state.settingsCustomAppDragId || event.dataTransfer?.getData("application/x-chatclub-custom-app") || "";
    if (!sourceId || sourceId === app.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const placement = settingsListDropPlacement(event);
    event.currentTarget.classList.toggle("drop-after", placement === "after");
    event.currentTarget.classList.toggle("drop-before", placement !== "after");
  }

  async function dropCustom(event, targetApp, redraw) {
    const sourceId = state.settingsCustomAppDragId
      || event.dataTransfer?.getData("application/x-chatclub-custom-app")
      || event.dataTransfer?.getData("text/plain")
      || "";
    if (!sourceId || sourceId === targetApp.id) return;
    event.preventDefault();
    const customConfig = moveListItem(
      state.customConfig,
      sourceId,
      targetApp.id,
      settingsListDropPlacement(event)
    );
    cleanupCustomDrag();
    await saveCustomList(customConfig, redraw, t("toast.customConfigOrderSaved"), {
      syncWorkspace: false,
      reloadRuntime: false
    });
  }

  async function saveCustomList(customConfig, redraw, message = t("toast.customConfigSaved"), options = {}) {
    const previousCustomConfig = state.customConfig;
    state.customConfig = await saveCustomConfig(customConfig);
    if (options.reloadRuntime !== false) await notifyConfigReload();
    if (options.syncWorkspace !== false) {
      await reconcileAppCatalog(previousCustomConfig);
      syncSummaryPanel();
    }
    redraw?.();
    if (message) toast(message, "success");
  }

  function openCustomEditor(app, redraw) {
    const editing = Boolean(app);
    const draft = structuredClone(app || {
      id: createId("custom-app"),
      name: "Custom App",
      provider: "Custom",
      url: "https://www.example.com/",
      inputSelector: "",
      sendButtonSelector: "",
      imagePasteStrategy: PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL
    });
    const nameInput = input(draft.name, { placeholder: t("apps.platformName") });
    const providerInput = input(draft.provider, { placeholder: t("apps.provider") });
    const urlInput = input(draft.url, { placeholder: "https://example.com/" });
    const inputSelectorInput = input(draft.inputSelector, { placeholder: t("apps.inputSelector") });
    const sendSelectorInput = input(draft.sendButtonSelector, { placeholder: t("apps.sendButtonSelector") });
    const strategyInput = select(normalizePromptImagePasteStrategy(draft.imagePasteStrategy), imagePasteStrategyOptions());
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const rawUrl = urlInput.value.trim();
      const nextApp = {
        ...draft,
        name: nameInput.value.trim(),
        provider: providerInput.value.trim() || "Custom",
        url: normalizeCustomUrl(rawUrl),
        inputSelector: inputSelectorInput.value.trim(),
        sendButtonSelector: sendSelectorInput.value.trim(),
        imagePasteStrategy: normalizePromptImagePasteStrategy(strategyInput.value)
      };
      if (!nextApp.name || !rawUrl) {
        toast(t("apps.nameUrlRequired"), "error");
        return;
      }
      if (!nextApp.url) {
        toast(t("apps.invalidUrl"), "error");
        return;
      }
      const customConfig = editing
        ? state.customConfig.map((item) => item.id === draft.id ? nextApp : item)
        : [...state.customConfig, nextApp];
      await saveCustomList(customConfig, redraw, editing ? t("toast.customPlatformUpdated") : t("toast.customPlatformAdded"));
      close();
    };
    dialog = editorModal(editing ? t("apps.editTitle") : t("apps.addTitle"),
      el("div", { class: "settings-editor-form" },
        el("div", { class: "settings-dialog-grid" },
          field(t("apps.platformName"), nameInput),
          field(t("apps.provider"), providerInput),
          field(t("apps.platformUrl"), urlInput),
          field(t("apps.inputSelector"), inputSelectorInput),
          field(t("apps.sendButtonSelector"), sendSelectorInput),
          field(t("apps.imagePasteStrategy"), strategyInput)
        ),
        el("div", { class: "settings-dialog-actions" },
          button(t("common.cancel"), close),
          button(editing ? t("apps.save") : t("apps.addTitle"), save, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  async function removeCustom(app, redraw) {
    if (!window.confirm(t("apps.deleteConfirm", { name: app.name || "this custom platform" }))) return;
    await saveCustomList(
      state.customConfig.filter((item) => item.id !== app.id),
      redraw,
      t("toast.customPlatformDeleted")
    );
  }

  return Object.freeze({ pane, reset, openCustomAppEditor: openCustomEditor });
}
