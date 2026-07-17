import { t } from "../../shared/i18n.js";
import { createId } from "../../shared/storage-schema.js";
import { button, editorModal, el, field, input, toast } from "../../ui/dom.js";
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

export function createProfilesSettingsSection(ctx) {
  const controllerName = "Profiles settings section";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    notifyConfigReload: "function",
    saveOptionsPatch: "function",
    openTabUrl: "function"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    ["options", "settingsProfileDragId"]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const notifyConfigReload = requireControllerFunction(ctx, controllerName, "notifyConfigReload");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const openTabUrl = requireControllerFunction(ctx, controllerName, "openTabUrl");
  const {
    settingsDragHandle,
    settingsEmptyRow,
    settingsIconAction,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar,
    settingsPrimaryAction
  } = createSettingsKit({ svgIcon });

  function pane(redraw) {
    const rows = state.options.apiProfiles.length
      ? state.options.apiProfiles.map((profile) => profileRow(profile, redraw))
      : settingsEmptyRow(t("profiles.noProfiles"));
    return el("div", { class: "settings-pane settings-manager-pane" },
      settingsPaneToolbar(t("profiles.manage"),
        settingsPrimaryAction(t("profiles.add"), "plus", () => openEditor(null, redraw))
      ),
      settingsList(["", t("profiles.provider"), t("profiles.model"), t("profiles.usage"), t("profiles.actions")], rows, "settings-manager-list api-profile-list")
    );
  }

  function reset() {
    state.settingsProfileDragId = "";
    cleanupSettingsDragRows(".api-profile-row");
  }

  function usageChips(profile) {
    const usages = [];
    if (state.options.optimizeApiProfileId === profile.id) usages.push(t("profiles.optimizeSettings"));
    if (state.options.summaryApiProfileId === profile.id) usages.push(t("profiles.summarySettings"));
    if (!usages.length) usages.push(t("profiles.notAssigned"));
    return el("div", { class: "settings-usage-chips" },
      usages.map((usage) => el("span", {
        class: `settings-usage-chip ${usage === t("profiles.notAssigned") ? "muted" : ""}`.trim()
      }, usage))
    );
  }

  function profileRow(profile, redraw) {
    return el("div", {
      class: "ui-list-row settings-list-row settings-manager-row api-profile-row",
      draggable: "true",
      dataset: { profileId: profile.id },
      ondragstart: (event) => startDrag(event, profile),
      ondragend: reset,
      ondragover: (event) => previewDrop(event, profile),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => drop(event, profile, redraw)
    },
      settingsDragHandle(t("profiles.provider")),
      el("strong", { class: "settings-main-cell" }, profile.name || profile.id),
      el("span", { class: "settings-muted-cell" }, profile.model || t("profiles.noModel")),
      usageChips(profile),
      el("div", { class: "settings-row-action-group" },
        profile.registerUrl
          ? settingsIconAction(t("profiles.openPromotionChannel"), "external", () => openTabUrl(profile.registerUrl), "", false, "settings.profiles.promotion")
          : null,
        settingsIconAction(t("common.edit"), "edit", () => openEditor(profile, redraw), "", false, "settings.action.edit"),
        settingsIconAction(t("profiles.duplicate"), "copy", () => duplicate(profile, redraw), "", false, "settings.action.duplicate"),
        settingsIconAction(t("common.delete"), "trash", () => remove(profile, redraw), "danger", state.options.apiProfiles.length <= 1, "settings.action.delete")
      )
    );
  }

  function startDrag(event, profile) {
    state.settingsProfileDragId = profile.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-api-profile", profile.id);
    event.dataTransfer?.setData("text/plain", profile.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function previewDrop(event, profile) {
    const sourceId = state.settingsProfileDragId || event.dataTransfer?.getData("application/x-chatclub-api-profile") || "";
    if (!sourceId || sourceId === profile.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const placement = settingsListDropPlacement(event);
    event.currentTarget.classList.toggle("drop-after", placement === "after");
    event.currentTarget.classList.toggle("drop-before", placement !== "after");
  }

  async function drop(event, targetProfile, redraw) {
    const sourceId = state.settingsProfileDragId
      || event.dataTransfer?.getData("application/x-chatclub-api-profile")
      || event.dataTransfer?.getData("text/plain")
      || "";
    if (!sourceId || sourceId === targetProfile.id) return;
    event.preventDefault();
    const apiProfiles = moveListItem(
      state.options.apiProfiles,
      sourceId,
      targetProfile.id,
      settingsListDropPlacement(event)
    );
    reset();
    await saveProfiles(apiProfiles, redraw, t("toast.apiProfileOrderSaved"), { reloadRuntime: false });
  }

  async function saveProfiles(apiProfiles, redraw, message = t("toast.apiProfilesSaved"), options = {}) {
    const fallbackId = apiProfiles[0]?.id || "";
    const profileIds = new Set(apiProfiles.map((profile) => profile.id));
    state.options = await saveOptionsPatch({
      apiProfiles,
      optimizeApiProfileId: profileIds.has(state.options.optimizeApiProfileId)
        ? state.options.optimizeApiProfileId
        : fallbackId,
      summaryApiProfileId: profileIds.has(state.options.summaryApiProfileId)
        ? state.options.summaryApiProfileId
        : fallbackId
    });
    if (options.reloadRuntime !== false) await notifyConfigReload();
    redraw();
    if (message) toast(message, "success");
  }

  function openEditor(profile, redraw) {
    const editing = Boolean(profile);
    const draft = structuredClone(profile || {
      id: createId("api"),
      name: "New API",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "",
      model: "gpt-3.5-turbo"
    });
    const nameInput = input(draft.name, { placeholder: t("profiles.providerName") });
    const endpointInput = input(draft.endpoint, { placeholder: "https://api.openai.com/v1/chat/completions" });
    const keyInput = input(draft.apiKey, { placeholder: t("profiles.apiKey"), type: "password" });
    const modelInput = input(draft.model, { placeholder: t("profiles.model") });
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const nextProfile = {
        ...draft,
        name: nameInput.value.trim() || "API Profile",
        endpoint: endpointInput.value.trim(),
        apiKey: keyInput.value,
        model: modelInput.value.trim()
      };
      if (!nextProfile.endpoint || !nextProfile.model) {
        toast(t("profiles.endpointModelRequired"), "error");
        return;
      }
      const apiProfiles = editing
        ? state.options.apiProfiles.map((item) => item.id === draft.id ? nextProfile : item)
        : [...state.options.apiProfiles, nextProfile];
      await saveProfiles(apiProfiles, redraw, editing ? t("toast.apiProfileUpdated") : t("toast.apiProfileAdded"));
      close();
    };
    dialog = editorModal(editing ? t("profiles.edit") : t("profiles.addTitle"),
      el("div", { class: "settings-editor-form" },
        el("div", { class: "settings-dialog-grid" },
          field(t("profiles.provider"), nameInput),
          field(t("profiles.model"), modelInput),
          field(t("profiles.endpoint"), endpointInput),
          field(t("profiles.apiKey"), keyInput)
        ),
        el("div", { class: "settings-dialog-actions" },
          button(t("common.cancel"), close),
          button(editing ? t("profiles.save") : t("profiles.add"), save, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  async function duplicate(profile, redraw) {
    const index = state.options.apiProfiles.findIndex((item) => item.id === profile.id);
    const copy = {
      ...structuredClone(profile),
      id: createId("api"),
      name: `${profile.name || "API Profile"} Copy`
    };
    const apiProfiles = [...state.options.apiProfiles];
    apiProfiles.splice(index + 1, 0, copy);
    await saveProfiles(apiProfiles, redraw, t("toast.apiProfileDuplicated"));
  }

  async function remove(profile, redraw) {
    if (state.options.apiProfiles.length <= 1) {
      toast(t("profiles.keepOne"), "error");
      return;
    }
    if (!window.confirm(t("profiles.deleteConfirm", { name: profile.name || "this API profile" }))) return;
    await saveProfiles(
      state.options.apiProfiles.filter((item) => item.id !== profile.id),
      redraw,
      t("toast.apiProfileDeleted")
    );
  }

  return Object.freeze({ pane, reset });
}
