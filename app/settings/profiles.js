import { t } from "../../shared/i18n.js";
import { API_PROFILE_MODEL_DEFAULT } from "../../shared/constants.js";
import {
  apiProfileFavoriteModels,
  apiProfileModels,
  apiProfileNameLabel,
  listModelInventory,
  OUTBOUND_INVENTORY_SLOTS
} from "../../shared/model-inventory.js";
import { createId } from "../../shared/storage-schema.js";
import { button, bindLinearMenuKeyboard, claimTopmostPopoverEscape, editorModal, el, field, input, openConfirmationAction, select, toast } from "../../ui/dom.js";
import { createMenuButton } from "../../ui/components.js";
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
      settingsList(["", t("profiles.provider"), t("profiles.models"), t("profiles.usage"), t("profiles.actions")], rows, "settings-manager-list api-profile-list")
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
          [t("inventory.feature"), t("inventory.profile"), t("inventory.model"), t("profiles.provider")],
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
            el("span", { class: "settings-muted-cell" }, inventoryValue(row.profileName, "inventory.none"))
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

  function profileModelCell(profile) {
    const models = apiProfileModels(profile);
    if (!models.length) {
      return el("span", { class: "settings-muted-cell api-profile-models-cell is-empty" }, t("profiles.noModel"));
    }
    if (models.length === 1) {
      return el("span", { class: "settings-muted-cell api-profile-models-cell is-solo" }, models[0]);
    }
    return el("div", { class: "api-profile-models-cell is-multiple" },
      models.map((model) => el("span", { class: "settings-usage-chip" }, model))
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
      settingsReorderHandle(t("profiles.provider"), {
        ids: state.options.apiProfiles.map((item) => item.id),
        id: profile.id,
        onMove: (delta) => {
          saveProfiles(moveListItemByDelta(state.options.apiProfiles, profile.id, delta), redraw, t("toast.apiProfileOrderSaved"), { reloadRuntime: false });
        }
      }),
      el("strong", { class: "settings-main-cell" }, profile.name || profile.id),
      profileModelCell(profile),
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

  function createModelCatalogEditor(models, favorites, onChange) {
    const values = models.length ? models.slice() : [API_PROFILE_MODEL_DEFAULT];
    const favoriteModels = Array.isArray(favorites) ? favorites.slice() : [];
    const list = el("div", { class: "api-profile-model-list" });
    const notify = () => onChange?.();
    const favoriteKey = (value) => String(value || "").trim();
    const isFavorite = (value) => favoriteModels.some((item) => favoriteKey(item) === favoriteKey(value));
    let menuCleanup = () => {};
    const closeModelMenu = () => {
      menuCleanup();
      menuCleanup = () => {};
    };
    const runMenuAction = (action) => {
      closeModelMenu();
      action();
      render();
      notify();
    };
    const openModelMenu = (event, index) => {
      event.preventDefault();
      event.stopPropagation();
      const anchor = event.currentTarget;
      if (anchor.getAttribute("aria-expanded") === "true") {
        closeModelMenu();
        return;
      }
      closeModelMenu();
      const isFallback = index === 0;
      const starred = isFavorite(values[index]);
      anchor.setAttribute("aria-expanded", "true");
      const rect = anchor.getBoundingClientRect();
      const menuWidth = 220;
      const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
      const top = Math.min(rect.bottom + 6, window.innerHeight - 8);
      const backdrop = el("div", {
        class: "popover-backdrop api-profile-model-menu-backdrop",
        onpointerdown: (pointerEvent) => {
          pointerEvent.preventDefault();
          closeModelMenu();
        }
      });
      const menu = el("div", {
        class: "popover-menu overlay-surface api-profile-model-menu",
        role: "menu",
        "aria-label": t("profiles.modelActions"),
        style: { top: `${top}px`, left: `${left}px` },
        onpointerdown: (pointerEvent) => pointerEvent.stopPropagation(),
        onclick: (pointerEvent) => pointerEvent.stopPropagation()
      },
        createMenuButton({
          label: isFallback ? t("profiles.fallbackModel") : t("profiles.setFallbackModel"),
          icon: svgIcon("shield"),
          disabled: isFallback,
          onClick: () => {
            if (isFallback) return;
            runMenuAction(() => {
              const [selected] = values.splice(index, 1);
              values.unshift(selected);
            });
          }
        }),
        createMenuButton({
          label: starred ? t("profiles.removeFavoriteModel") : t("profiles.setFavoriteModel"),
          icon: svgIcon(starred ? "star" : "starOff"),
          onClick: () => {
            runMenuAction(() => {
              const key = favoriteKey(values[index]);
              if (!key) return;
              const at = favoriteModels.findIndex((item) => favoriteKey(item) === key);
              if (at >= 0) favoriteModels.splice(at, 1);
              else favoriteModels.unshift(key);
            });
          }
        }),
        createMenuButton({
          label: t("common.delete"),
          icon: svgIcon("trash"),
          variant: "danger",
          onClick: () => {
            runMenuAction(() => {
              const key = favoriteKey(values[index]);
              values.splice(index, 1);
              const at = favoriteModels.findIndex((item) => favoriteKey(item) === key);
              if (at >= 0) favoriteModels.splice(at, 1);
            });
          }
        })
      );
      document.body.append(backdrop, menu);
      bindLinearMenuKeyboard(menu, { dismiss: closeModelMenu, trigger: anchor });
      const onKeydown = (keyEvent) => {
        if (!claimTopmostPopoverEscape(keyEvent, ".api-profile-model-menu")) return;
        closeModelMenu();
      };
      const onViewport = () => closeModelMenu();
      document.addEventListener("keydown", onKeydown, true);
      window.addEventListener("resize", onViewport, true);
      window.addEventListener("scroll", onViewport, true);
      menuCleanup = () => {
        document.removeEventListener("keydown", onKeydown, true);
        window.removeEventListener("resize", onViewport, true);
        window.removeEventListener("scroll", onViewport, true);
        backdrop.remove();
        menu.remove();
        anchor.setAttribute("aria-expanded", "false");
      };
    };
    const render = () => {
      closeModelMenu();
      list.replaceChildren();
      const multiple = values.length > 1;
      values.forEach((value, index) => {
        const isFallback = index === 0;
        const modelInput = input(value, {
          placeholder: t("profiles.model"),
          "aria-label": multiple && isFallback ? t("profiles.fallbackModel") : t("profiles.model"),
          oninput: (event) => {
            const previous = values[index];
            const next = event.target.value;
            values[index] = next;
            const favIndex = favoriteModels.findIndex((item) => favoriteKey(item) === favoriteKey(previous));
            if (favIndex >= 0) favoriteModels[favIndex] = next;
            notify();
          }
        });
        const moreButton = multiple
          ? settingsIconAction(t("profiles.modelActions"), "moreVertical", (event) => openModelMenu(event, index), "api-profile-model-more")
          : null;
        if (moreButton) {
          moreButton.setAttribute("aria-haspopup", "menu");
          moreButton.setAttribute("aria-expanded", "false");
        }
        list.append(el("div", {
          class: `api-profile-model-row${multiple ? "" : " api-profile-model-row-solo"}${multiple && isFallback ? " api-profile-model-row-fallback" : ""}`.trim()
        },
          modelInput,
          moreButton
        ));
      });
    };
    const add = () => {
      values.push("");
      render();
      notify();
      list.querySelector(".api-profile-model-row:last-child .input")?.focus();
    };
    render();
    return {
      node: el("div", { class: "api-profile-models" }, list),
      add,
      close: closeModelMenu,
      live() {
        return values.slice();
      },
      favorites() {
        const catalog = new Set(values.map((value) => favoriteKey(value)).filter(Boolean));
        const ordered = [];
        const seen = new Set();
        for (const item of favoriteModels) {
          const key = favoriteKey(item);
          if (!key || !catalog.has(key) || seen.has(key)) continue;
          seen.add(key);
          ordered.push(key);
        }
        return ordered;
      },
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
    let syncSave = () => {};
    const catalog = createModelCatalogEditor(
      apiProfileModels(draft),
      apiProfileFavoriteModels(draft),
      () => syncSave()
    );
    const identityName = el("strong", { class: "api-profile-editor-identity-name" },
      String(draft.name || "").trim() || t("profiles.providerName")
    );
    const initialSnapshot = JSON.stringify({
      name: String(draft.name || "").trim() || "API Profile",
      endpoint: String(draft.endpoint || "").trim(),
      apiKey: String(draft.apiKey || ""),
      models: apiProfileModels(draft),
      favoriteModels: apiProfileFavoriteModels(draft)
    });
    const formSnapshot = () => JSON.stringify({
      name: nameInput.value.trim() || "API Profile",
      endpoint: endpointInput.value.trim(),
      apiKey: secret.input.value,
      models: catalog.live(),
      favoriteModels: catalog.favorites()
    });
    nameInput.addEventListener("input", () => {
      identityName.textContent = nameInput.value.trim() || t("profiles.providerName");
      syncSave();
    });
    endpointInput.addEventListener("input", () => syncSave());
    secret.input.addEventListener("input", () => syncSave());
    let dialog;
    const close = () => {
      catalog.close();
      dialog.remove();
    };
    const save = async () => {
      const models = catalog.read();
      const favoriteModels = catalog.favorites();
      const nextProfile = {
        ...draft,
        name: nameInput.value.trim() || "API Profile",
        endpoint: endpointInput.value.trim(),
        apiKey: secret.input.value,
        model: models[0] || "",
        models,
        favoriteModels
      };
      if (!favoriteModels.length) delete nextProfile.favoriteModels;
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
    const saveButton = button(editing ? t("profiles.save") : t("profiles.add"), save, "primary");
    syncSave = () => {
      const models = catalog.read();
      const valid = Boolean(endpointInput.value.trim() && models[0]);
      const dirty = !editing || formSnapshot() !== initialSnapshot;
      saveButton.disabled = !valid || !dirty;
    };
    syncSave();
    dialog = editorModal(editing ? t("profiles.edit") : t("profiles.addTitle"),
      el("div", { class: "settings-editor-form" },
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
          saveButton
        )
      ),
      close,
      false,
      t("common.close")
    );
    const panel = dialog.querySelector(".modal");
    panel?.classList.add("settings-editor-modal", "api-profile-editor-modal");
    panel?.querySelector(".modal-header h2")?.after(
      el("div", { class: "api-profile-editor-identity" }, identityName)
    );
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
      title: t("profiles.deleteTitle", { name: profile.name || t("profiles.provider") }),
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
