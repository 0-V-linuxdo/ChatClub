import { normalizeTopbarPromptPlaceholderConfig } from "../../shared/storage-schema.js";
import { saveOptions } from "../../shared/storage-adapter.js";
import { normalizeTopbarLayout, topbarSettingsSectionForItem } from "../../shared/topbar.js";
import { t } from "../../shared/i18n.js";
import { claimTopmostPopoverEscape, toast } from "../../ui/dom.js";
import { createControllerMethodValidator, validateControllerContract } from "../controller-contract.js";
import { createTopbarEditor } from "./editor.js";
import { createTopbarPlaceholderController } from "./placeholder.js";
import { createTopbarView } from "./view.js";

const requireMethods = createControllerMethodValidator("Topbar");

export function createTopbarController(dependencies = {}) {
  const { state, composer, workspace, preferredModel, settingsSections, actions } = validateControllerContract(
    dependencies,
    "Topbar controller",
    {
      state: "object",
      composer: "object",
      workspace: "object",
      preferredModel: "object",
      settingsSections: "any",
      actions: "object"
    }
  );
  requireMethods(composer, "composer", ["closeActionsMenu", "focusInput", "render", "syncInputNode"]);
  requireMethods(workspace, "workspace port", [
    "closePopovers",
    "closePopoversAnchoredWithin",
    "openAppPicker",
    "openLayoutMenu"
  ]);
  requireMethods(preferredModel, "Preferred Model port", ["syncPreferredModelInputGate"]);
  requireMethods(actions, "actions", [
    "deleteThread",
    "formatShortcutTooltip",
    "newChat",
    "openPocket",
    "openSettings",
    "openSummary"
  ]);

  let node = null;
  let editSavePending = false;
  let settingsMenuReopenFrame = 0;

  const placeholderController = createTopbarPlaceholderController({
    state,
    normalizeConfig: normalizeTopbarPromptPlaceholderConfig,
    saveOptions,
    syncTopbar: sync,
    translate: t
  });
  const editor = createTopbarEditor({
    state,
    settingsSections,
    syncTopbar: sync,
    openSettingsMenu
  });
  const view = createTopbarView({
    state,
    composer,
    editor,
    settingsSections,
    actions: {
      ...actions,
      openAppPicker: (anchor) => workspace.openAppPicker(anchor, { mode: "group" }),
      openLayoutMenu: (anchor) => workspace.openLayoutMenu(anchor),
      openSettingsMenu
    },
    editLifecycle: {
      exit: exitEditMode,
      isSavePending: () => editSavePending,
      save: saveEditLayout,
      scheduleEnter: scheduleEnterEditMode
    }
  });

  function closeSettingsMenu() {
    if (settingsMenuReopenFrame) cancelAnimationFrame(settingsMenuReopenFrame);
    settingsMenuReopenFrame = 0;
    document.querySelectorAll(".topbar-settings-backdrop, .topbar-settings-popover").forEach((item) => item.remove());
    document.querySelectorAll(".topbar-settings-anchor").forEach((item) => item.classList.remove("topbar-settings-anchor"));
    document.removeEventListener("keydown", closeSettingsMenuOnKeydown, true);
    window.removeEventListener("resize", closeSettingsMenu, true);
    window.removeEventListener("scroll", closeSettingsMenu, true);
    window.removeEventListener("blur", closeSettingsMenu, true);
  }

  function closeSettingsMenuOnKeydown(event) {
    if (claimTopmostPopoverEscape(event, ".topbar-settings-popover")) closeSettingsMenu();
  }

  function runMenuItem(item, event) {
    if (!item || item.type !== "item") return;
    const settingsSectionId = topbarSettingsSectionForItem(item.id);
    if (settingsSectionId) {
      closeSettingsMenu();
      actions.openSettings(settingsSectionId);
      return;
    }
    if (item.id === "brand") {
      closeSettingsMenu();
      actions.openSettings("about");
      return;
    }
    if (item.id === "composer") {
      closeSettingsMenu();
      composer.focusInput();
      return;
    }
    if (item.id === "newChat") {
      closeSettingsMenu();
      actions.newChat();
      return;
    }
    if (item.id === "deleteThread") {
      closeSettingsMenu();
      actions.deleteThread();
      return;
    }
    if (item.id === "summary") {
      closeSettingsMenu();
      actions.openSummary();
      return;
    }
    if (item.id === "pocket") {
      closeSettingsMenu();
      actions.openPocket();
      return;
    }
    if (item.id === "addGroup") {
      workspace.openAppPicker(event?.currentTarget, { mode: "group" });
      closeSettingsMenu();
      return;
    }
    if (item.id === "layout") {
      workspace.openLayoutMenu(event?.currentTarget);
      closeSettingsMenu();
    }
  }

  function openSettingsMenu(anchor, options = {}) {
    const forceOpen = Boolean(options.forceOpen);
    const editing = Boolean(options.editing ?? state.topbarEditMode);
    const persistent = editing && state.topbarEditMode;
    if (!forceOpen && anchor.classList.contains("topbar-settings-anchor") && document.querySelector(".topbar-settings-popover")) {
      if (persistent) return;
      closeSettingsMenu();
      return;
    }
    closeSettingsMenu();
    composer.closeActionsMenu();
    workspace.closePopovers();
    anchor.classList.add("topbar-settings-anchor");
    const layout = editing
      ? editor.ensureTopbarSettingsMenuItems(editor.activeTopbarEditLayout())
      : editor.ensureTopbarSettingsMenuItems(state.options?.topbarLayout);
    const rendered = view.renderSettingsMenu({
      editing,
      persistent,
      layout,
      rect: anchor.getBoundingClientRect(),
      closeMenu: closeSettingsMenu,
      runItem: runMenuItem
    });
    if (rendered.backdrop) document.body.append(rendered.backdrop);
    document.body.append(rendered.menu);
    document.addEventListener("keydown", closeSettingsMenuOnKeydown, true);
    if (!persistent) {
      window.addEventListener("resize", closeSettingsMenu, true);
      window.addEventListener("scroll", closeSettingsMenu, true);
      window.addEventListener("blur", closeSettingsMenu, true);
    }
  }

  function openEditSettingsMenu() {
    if (!state.topbarEditMode) return;
    const anchor = document.querySelector(".topbar-edit-slot-settingsJumpMenu .top-icon-action, .topbar-edit-slot-settingsJumpMenu button");
    if (anchor) openSettingsMenu(anchor, { forceOpen: true, editing: true });
  }

  function sync(shell) {
    const targetShell = shell || node?.parentElement;
    if (!targetShell) return null;
    const restorePersistentSettingsMenu = Boolean(
      state.topbarEditMode
      && (settingsMenuReopenFrame || document.querySelector(".topbar-settings-popover.is-editing"))
    );
    composer.closeActionsMenu();
    closeSettingsMenu();
    workspace.closePopoversAnchoredWithin(node);
    targetShell.classList.toggle("topbar-editing-mode", Boolean(state.topbarEditMode));
    const nextNode = view.render({ placeholder: placeholderController.placeholder() });
    if (node?.isConnected) node.replaceWith(nextNode);
    else targetShell.prepend(nextNode);
    node = nextNode;
    composer.syncInputNode();
    preferredModel.syncPreferredModelInputGate();
    if (restorePersistentSettingsMenu) {
      settingsMenuReopenFrame = requestAnimationFrame(() => {
        settingsMenuReopenFrame = 0;
        openEditSettingsMenu();
      });
    }
    return node;
  }

  function enterEditMode() {
    closeSettingsMenu();
    state.topbarEditMode = true;
    state.topbarEditDragId = "";
    state.topbarEditLayoutDraft = editor.ensureTopbarSettingsMenuItems(state.options?.topbarLayout);
    sync();
    requestAnimationFrame(openEditSettingsMenu);
  }

  function scheduleEnterEditMode() {
    requestAnimationFrame(enterEditMode);
  }

  function exitEditMode() {
    editor.cleanupPointerDrag();
    closeSettingsMenu();
    state.topbarEditMode = false;
    state.topbarEditLayoutDraft = null;
    state.topbarEditDragId = "";
    sync();
  }

  async function saveEditLayout(event) {
    if (editSavePending) return;
    editSavePending = true;
    const saveButton = event?.currentTarget;
    const controls = saveButton?.closest?.(".topbar-customize-controls");
    const actionButtons = [...(controls?.querySelectorAll?.("button") || [])];
    actionButtons.forEach((buttonNode) => { buttonNode.disabled = true; });
    saveButton?.setAttribute?.("aria-busy", "true");
    try {
      state.options = await saveOptions({
        ...state.options,
        topbarLayout: normalizeTopbarLayout(state.topbarEditLayoutDraft)
      });
      editor.cleanupPointerDrag();
      closeSettingsMenu();
      state.topbarEditMode = false;
      state.topbarEditLayoutDraft = null;
      state.topbarEditDragId = "";
      sync();
      toast(t("toast.appearanceSaved"), "success");
    } finally {
      editSavePending = false;
      actionButtons.forEach((buttonNode) => { buttonNode.disabled = false; });
      saveButton?.removeAttribute?.("aria-busy");
    }
  }

  return Object.freeze({
    closeSettingsMenu,
    enterEditMode,
    initializePlaceholder: (...args) => placeholderController.initialize(...args),
    openSettingsMenu,
    sync,
    syncPlaceholder: (...args) => placeholderController.sync(...args)
  });
}
