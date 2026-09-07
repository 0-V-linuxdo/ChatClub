import { t } from "../../shared/i18n.js";
import { API_PROFILE_MODEL_DEFAULT } from "../../shared/constants.js";
import {
  apiProfileModels,
  apiProfileNameLabel,
  listModelInventory,
  OUTBOUND_INVENTORY_SLOTS
} from "../../shared/model-inventory.js";
import { createId } from "../../shared/storage-schema.js";
import { button, editorModal, el, field, input, openConfirmationAction, select, toast } from "../../ui/dom.js";
import {
  cleanupSettingsDragRows,
  createSettingsKit,
  moveListItem,
  moveListItemByDelta
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
    ["options", "settingsProfileDragId", "settingsProfilesTab"]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const notifyConfigReload = requireControllerFunction(ctx, controllerName, "notifyConfigReload");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const openTabUrl = requireControllerFunction(ctx, controllerName, "openTabUrl");
  const {
    settingsBlock,
    settingsInnerTabs,
    settingsReorderHandle,
    settingsEmptyRow,
    settingsIconAction,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar,
    settingsPrimaryAction
  } = createSettingsKit({ svgIcon });

  function outboundSlot(purpose) {
    return OUTBOUND_INVENTORY_SLOTS.find((slot) => slot.purpose === purpose) || OUTBOUND_INVENTORY_SLOTS[0];
  }

  function profileOptions() {
    return state.options.apiProfiles.map((profile) => ({
      value: profile.id,
      label: apiProfileNameLabel(profile) || profile.id
    }));
  }

  function pane(redraw) {
    const activeTab = state.settingsProfilesTab === "inventory" ? "inventory" : "providers";
    state.settingsProfilesTab = activeTab;
    const tabs = [
      ["providers", t("profiles.providersTab"), t("profiles.providersTabDesc")],
      ["inventory", t("profiles.inventoryTab"), t("profiles.inventoryTabDesc")]
    ];
    const tabBar = settingsInnerTabs(tabs, activeTab, (id) => {
      state.settingsProfilesTab = id;
      redraw();
    });
    Array.from(tabBar.children).forEach((tab, index) => {
      tab.dataset.profilesTabId = tabs[index]?.[0] || "";
    });
    return el("div", { class: "settings-pane settings-manager-pane" },
      tabBar,
      activeTab === "inventory" ? inventoryBlock(redraw) : providersBlock(redraw)
    );
  }

  function providersBlock(redraw) {
    const rows = state.options.apiProfiles.length
      ? state.options.apiProfiles.map((profile) => profileRow(profile, redraw))
      : settingsEmptyRow(t("profiles.noProfiles"));
    return el("div", {},
      settingsPaneToolbar(t("profiles.manage"),
        settingsPrimaryAction(t("profiles.add"), "plus", () => openEditor(null, redraw))
      ),
      settingsList(["", t("profiles.provider"), t("profiles.model"), t("profiles.usage"), t("profiles.actions")], rows, "settings-manager-list api-profile-list")
    );
  }

  function inventoryValue(value, emptyKey) {
    return value || t(emptyKey);
  }

  function modelOptions(models) {
    return (models || []).map((model) => ({ value: model, label: model }));
  }

  function inventoryBlock(redraw) {
    const { outbound } = listModelInventory(state.options, ["outbound"]);
    return settingsBlock(t("inventory.title"), t("inventory.desc"),
      el("div", { class: "model-inventory-group", dataset: { modelInventoryWorld: "outbound" } },
        el("p", { class: "model-inventory-heading" }, t("inventory.outbound")),
        settingsList(
          [t("inventory.feature"), t("inventory.profile"), t("inventory.model"), t("inventory.host")],
          outbound.map((row) => el("div", {
            class: "ui-list-row settings-list-row model-inventory-row",
            dataset: { modelInventoryId: row.id, modelInventoryWorld: "outbound" }
          },
            el("strong", { class: "settings-main-cell" }, t(row.featureKey)),
            select(row.profileId, profileOptions(), {
              "aria-label": `${t(row.featureKey)} ${t("inventory.profile")}`,
              dataset: { outboundSlot: row.id, outboundField: "profile" },
              onchange: (event) => { void saveOutboundProfile(row.purpose, event.target.value, redraw); }
            }),
            select(row.model, modelOptions(row.models), {
              "aria-label": `${t(row.featureKey)} ${t("inventory.model")}`,
              dataset: { outboundSlot: row.id, outboundField: "model" },
              onchange: (event) => { void saveOutboundModel(row.purpose, event.target.value, redraw); }
            }),
            el("span", { class: "settings-muted-cell" }, inventoryValue(row.host, "inventory.none"))
          )),
          "model-inventory-list model-inventory-outbound"
        )
      )
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
    if (state.options.topicTitleApiProfileId === profile.id) usages.push(t("profiles.topicTitleSettings"));
    if (!usages.length) usages.push(t("profiles.notAssigned"));
    return el("div", { class: "settings-usage-chips" },
      usages.map((usage) => el("span", {
        class: `settings-usage-chip ${usage === t("profiles.notAssigned") ? "muted" : ""}`.trim()
      }, usage))
    );
  }

  function profileModelLabel(profile) {
    const models = apiProfileModels(profile);
    if (!models.length) return t("profiles.noModel");
    if (models.length === 1) return models[0];
    return t("profiles.modelCatalogCount", { model: models[0], count: models.length - 1 });
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
      settingsReorderHandle(t("profiles.provider"), {
        ids: state.options.apiProfiles.map((item) => item.id),
        id: profile.id,
        onMove: (delta) => {
          saveProfiles(moveListItemByDelta(state.options.apiProfiles, profile.id, delta), redraw, t("toast.apiProfileOrderSaved"), { reloadRuntime: false });
        }
      }),
      el("strong", { class: "settings-main-cell" }, profile.name || profile.id),
      el("span", { class: "settings-muted-cell" }, profileModelLabel(profile)),
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

  function slotModelPatch(apiProfiles) {
    const byId = new Map(apiProfiles.map((profile) => [profile.id, profile]));
    const fallbackId = apiProfiles[0]?.id || "";
    const patch = {};
    for (const slot of OUTBOUND_INVENTORY_SLOTS) {
      const profileId = byId.has(state.options[slot.profileKey]) ? state.options[slot.profileKey] : fallbackId;
      const profile = byId.get(profileId);
      const catalog = apiProfileModels(profile);
      const current = String(state.options[slot.modelKey] || "").trim();
      patch[slot.profileKey] = profileId;
      patch[slot.modelKey] = catalog.includes(current) ? current : "";
    }
    return patch;
  }

  async function saveProfiles(apiProfiles, redraw, message = t("toast.apiProfilesSaved"), options = {}) {
    state.options = await saveOptionsPatch({
      apiProfiles,
      ...slotModelPatch(apiProfiles)
    });
    if (options.reloadRuntime !== false) await notifyConfigReload();
    redraw();
    if (message) toast(message, "success");
  }

  async function saveOutboundSlot(purpose, patch, redraw, toastKey) {
    const slot = outboundSlot(purpose);
    state.options = await saveOptionsPatch(patch);
    await notifyConfigReload();
    redraw();
    toast(t(toastKey || slot.profileToastKey), "success");
  }

  async function saveOutboundProfile(purpose, profileId, redraw) {
    const slot = outboundSlot(purpose);
    const profile = state.options.apiProfiles.find((item) => item.id === profileId);
    const catalog = apiProfileModels(profile);
    const current = String(state.options[slot.modelKey] || "").trim();
    await saveOutboundSlot(purpose, {
      [slot.profileKey]: profileId,
      [slot.modelKey]: catalog.includes(current) ? current : ""
    }, redraw, slot.profileToastKey);
  }

  async function saveOutboundModel(purpose, model, redraw) {
    const slot = outboundSlot(purpose);
    await saveOutboundSlot(purpose, { [slot.modelKey]: model }, redraw, slot.modelToastKey);
  }

  function createModelCatalogEditor(models) {
    const values = models.length ? models.slice() : [API_PROFILE_MODEL_DEFAULT];
    const list = el("div", { class: "api-profile-model-list" });
    const render = () => {
      list.replaceChildren();
      const multiple = values.length > 1;
      values.forEach((value, index) => {
        const isDefault = index === 0;
        const modelInput = input(value, {
          placeholder: t("profiles.model"),
          "aria-label": multiple && isDefault ? t("profiles.defaultModel") : t("profiles.model"),
          oninput: (event) => { values[index] = event.target.value; }
        });
        list.append(el("div", {
          class: `api-profile-model-row${multiple ? "" : " api-profile-model-row-solo"}${multiple && isDefault ? " api-profile-model-row-default" : ""}`.trim()
        },
          modelInput,
          multiple && isDefault
            ? el("span", {
              class: "api-profile-model-default tooltip-trigger",
              "data-tooltip": t("profiles.defaultModelHint"),
              "data-tooltip-wrap": "true"
            }, t("profiles.defaultModel"))
            : null,
          multiple && !isDefault
            ? settingsIconAction(t("profiles.setDefaultModel"), "star", () => {
              const [selected] = values.splice(index, 1);
              values.unshift(selected);
              render();
            })
            : null,
          multiple
            ? settingsIconAction(t("common.delete"), "trash", () => {
              values.splice(index, 1);
              render();
            }, "danger", false, "settings.action.delete")
            : null
        ));
      });
    };
    const add = () => {
      values.push("");
      render();
      list.querySelector(".api-profile-model-row:last-child .input")?.focus();
    };
    render();
    return {
      node: el("div", { class: "api-profile-models" }, list),
      add,
      read() {
        return values.map((value) => String(value || "").trim()).filter(Boolean);
      }
    };
  }

  function createSecretInput(value) {
    const keyInput = input(value, {
      placeholder: t("profiles.apiKey"),
      type: "password",
      autocomplete: "off",
      spellcheck: "false"
    });
    let visible = false;
    const toggle = el("button", {
      class: "icon-button tooltip-trigger api-profile-secret-toggle",
      type: "button",
      "aria-label": t("profiles.showApiKey"),
      "data-tooltip": t("profiles.showApiKey"),
      onclick: () => {
        visible = !visible;
        keyInput.type = visible ? "text" : "password";
        const label = visible ? t("profiles.hideApiKey") : t("profiles.showApiKey");
        toggle.setAttribute("aria-label", label);
        toggle.setAttribute("data-tooltip", label);
        toggle.replaceChildren(svgIcon(visible ? "eyeOff" : "eye"));
      }
    }, svgIcon("eye"));
    return {
      node: el("div", { class: "api-profile-secret" }, keyInput, toggle),
      input: keyInput
    };
  }

  function openEditor(profile, redraw) {
    const editing = Boolean(profile);
    const draft = structuredClone(profile || {
      id: createId("api"),
      name: "New API",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "",
      model: API_PROFILE_MODEL_DEFAULT,
      models: [API_PROFILE_MODEL_DEFAULT]
    });
    const nameInput = input(draft.name, { placeholder: t("profiles.providerName") });
    const endpointInput = input(draft.endpoint, { placeholder: "https://api.openai.com/v1/chat/completions" });
    const secret = createSecretInput(draft.apiKey);
    const catalog = createModelCatalogEditor(apiProfileModels(draft));
    const identityName = el("strong", { class: "api-profile-editor-identity-name" },
      String(draft.name || "").trim() || t("profiles.providerName")
    );
    nameInput.addEventListener("input", () => {
      identityName.textContent = nameInput.value.trim() || t("profiles.providerName");
    });
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const models = catalog.read();
      const nextProfile = {
        ...draft,
        name: nameInput.value.trim() || "API Profile",
        endpoint: endpointInput.value.trim(),
        apiKey: secret.input.value,
        model: models[0] || "",
        models
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
        el("div", { class: "api-profile-editor-identity" },
          el("span", { class: "api-profile-editor-identity-label" }, t("profiles.provider")),
          identityName
        ),
        el("div", { class: "api-profile-editor-layout" },
          el("div", { class: "api-profile-editor-credentials" },
            field(t("profiles.provider"), nameInput),
            field(t("profiles.endpoint"), endpointInput),
            field(t("profiles.apiKey"), secret.node)
          ),
          el("div", { class: "field api-profile-models-field" },
            el("span", {}, t("profiles.models")),
            el("p", { class: "api-profile-models-hint" }, t("profiles.defaultModelHint")),
            catalog.node,
            el("button", {
              class: "api-profile-model-add",
              type: "button",
              onclick: () => catalog.add()
            }, svgIcon("plus"), el("span", {}, t("profiles.addModel")))
          )
        ),
        el("div", { class: "modal-footer" },
          button(t("common.cancel"), close),
          button(editing ? t("profiles.save") : t("profiles.add"), save, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal", "api-profile-editor-modal");
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

  function remove(profile, redraw) {
    if (state.options.apiProfiles.length <= 1) {
      toast(t("profiles.keepOne"), "error");
      return;
    }
    openConfirmationAction({
      title: t("profiles.deleteTitle", { name: profile.name || "this API profile" }),
      body: t("profiles.deleteConfirm"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      closeLabel: t("common.close"),
      tone: "neutral",
      onConfirm: () => saveProfiles(
        state.options.apiProfiles.filter((item) => item.id !== profile.id),
        redraw,
        t("toast.apiProfileDeleted")
      )
    });
  }

  return Object.freeze({ pane, reset });
}
