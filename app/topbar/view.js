import { APP_NAME } from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import {
  normalizeTopbarLayout,
  topbarItemIcon,
  topbarItemLabelKey,
  topbarSettingsSectionForItem
} from "../../shared/topbar.js";
import { createActionButton, createTopIconButton } from "../../ui/components.js";
import { el } from "../../ui/dom.js";
import { createSvgIcon } from "../../ui/icons.js";
import { validateControllerContract } from "../controller-contract.js";

function requireMethods(value, label, methods) {
  for (const method of methods) {
    if (typeof value?.[method] !== "function") throw new TypeError(`Topbar view ${label} requires ${method}().`);
  }
}

export function createTopbarView(dependencies = {}) {
  const { state, composer, editor, settingsSections, actions, editLifecycle } = validateControllerContract(
    dependencies,
    "Topbar view",
    {
      state: "object",
      composer: "object",
      editor: "object",
      settingsSections: "any",
      actions: "object",
      editLifecycle: "object"
    }
  );
  requireMethods(composer, "composer", ["render", "focusInput"]);
  requireMethods(editor, "editor", [
    "activeTopbarEditLayout",
    "consumePaletteClickSuppression",
    "foldedTopbarLayoutItems",
    "insertTopbarPaletteItem",
    "paletteCandidateIds",
    "preventNativeDrag",
    "startPointerDrag",
    "visibleTopbarLayoutItems"
  ]);
  requireMethods(actions, "actions", [
    "deleteThread",
    "formatShortcutTooltip",
    "newChat",
    "openAppPicker",
    "openLayoutMenu",
    "openPocket",
    "openSettings",
    "openSettingsMenu",
    "openSummary"
  ]);
  requireMethods(editLifecycle, "edit lifecycle", [
    "exit",
    "isSavePending",
    "save",
    "scheduleEnter"
  ]);

  function topbarItemClass(id) {
    return `topbar-item topbar-item-${id}`;
  }

  function actionButton(label, iconName, onClick, variant = "secondary", tooltipLabel = label, className = "", tooltipId = "") {
    return createActionButton({
      label,
      icon: createSvgIcon(iconName),
      onClick,
      variant,
      tooltipLabel,
      className,
      tooltipId
    });
  }

  function topIconButton(label, iconName, onClick, tooltipLabel = label, tooltipId = "") {
    return createTopIconButton({
      label,
      icon: createSvgIcon(iconName),
      onClick,
      tooltipLabel,
      tooltipPlacement: "left",
      tooltipId
    });
  }

  function renderFlexCells(extraClass = "") {
    return el("span", {
      class: `topbar-flex-space-cells ${extraClass}`.trim(),
      "aria-hidden": "true"
    }, el("span", { class: "topbar-flex-space-cell" }));
  }

  function tooltipIdForItem(item) {
    const id = item?.id || "";
    const settingsSectionId = topbarSettingsSectionForItem(id);
    if (settingsSectionId) return `topbar.settings.${settingsSectionId}`;
    return ({
      brand: "topbar.brand",
      newChat: "topbar.newChat",
      deleteThread: "topbar.deleteThread",
      summary: "topbar.summary",
      pocket: "topbar.pocket",
      addGroup: "topbar.addGroup",
      layout: "topbar.layout",
      settingsJumpMenu: "topbar.settingsJumpMenu"
    })[id] || "";
  }

  function renderBrand() {
    const label = t("topbar.about");
    return el("button", {
      class: `brand tooltip-trigger ${topbarItemClass("brand")}`,
      type: "button",
      "aria-label": label,
      "data-tooltip": label,
      "data-tooltip-id": "topbar.brand",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        actions.openSettings("about");
      }
    },
      el("img", { class: "brand-logo", src: "icons/logo.svg", alt: "", draggable: "false" }),
      el("div", {}, APP_NAME)
    );
  }

  function renderSettingsButton() {
    return topIconButton(t("topbar.settings"), "settings", (event) => {
      event.preventDefault();
      event.stopPropagation();
      actions.openSettings();
    }, t("topbar.settings"), "topbar.settings");
  }

  function renderSettingsMenuButton() {
    let pointerHandled = false;
    const openFromEvent = (event) => {
      if (!event?.currentTarget) return;
      event.preventDefault();
      event.stopPropagation();
      actions.openSettingsMenu(event.currentTarget);
    };
    const buttonNode = topIconButton(t("topbar.settingsJumpMenu"), "moreTools", (event) => {
      if (state.topbarEditMode) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (pointerHandled) {
        pointerHandled = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      openFromEvent(event);
    }, t("topbar.settingsJumpMenu"), "topbar.settingsJumpMenu");
    buttonNode.addEventListener("pointerdown", (event) => {
      if (state.topbarEditMode || event.button !== 0) return;
      pointerHandled = true;
      openFromEvent(event);
    });
    return buttonNode;
  }

  function renderItem(item, composerNode) {
    if (item.type === "flex") {
      return el("div", { class: "topbar-flex-space", title: t("topbar.flexSpace"), "aria-hidden": "true" }, renderFlexCells());
    }
    if (item.id === "brand") return renderBrand();
    if (item.id === "settings") return renderSettingsButton();
    if (item.id === "composer") return composerNode;
    if (item.id === "newChat") {
      return actionButton(t("topbar.newChat"), "edit", actions.newChat, "secondary", actions.formatShortcutTooltip(t("topbar.newChatAllTooltip"), "newChatAll"), "", "topbar.newChat");
    }
    if (item.id === "deleteThread") {
      return actionButton(t("topbar.deleteThread"), "trash", actions.deleteThread, "danger", actions.formatShortcutTooltip(t("topbar.deleteThread"), "deleteThread"), "", "topbar.deleteThread");
    }
    if (item.id === "summary") {
      return actionButton(t("topbar.summary"), "summary", actions.openSummary, "secondary", actions.formatShortcutTooltip(t("topbar.summary"), "openSummaryPanel"), "", "topbar.summary");
    }
    if (item.id === "pocket") {
      return actionButton(t("topbar.pocket"), "pocket", actions.openPocket, "secondary", actions.formatShortcutTooltip(t("topbar.pocket"), "openPocketPanel"), topbarItemClass("pocket"), "topbar.pocket");
    }
    if (item.id === "addGroup") {
      return topIconButton(t("topbar.addGroup"), "plus", (event) => actions.openAppPicker(event.currentTarget), t("topbar.addGroup"), "topbar.addGroup");
    }
    if (item.id === "layout") {
      return topIconButton(t("topbar.switchLayout"), "layout", (event) => actions.openLayoutMenu(event.currentTarget), actions.formatShortcutTooltip(t("topbar.switchLayout"), "switchLayout"), "topbar.layout");
    }
    if (item.id === "settingsJumpMenu") return renderSettingsMenuButton();
    const settingsSectionId = topbarSettingsSectionForItem(item.id);
    if (settingsSectionId) {
      const label = t(topbarItemLabelKey(item));
      return topIconButton(label, topbarItemIcon(item), (event) => {
        event.preventDefault();
        event.stopPropagation();
        actions.openSettings(settingsSectionId);
      }, label, `topbar.settings.${settingsSectionId}`);
    }
    return el("span", { class: "topbar-unknown-item", hidden: true });
  }

  function itemLabel(item) {
    return item?.type === "flex" ? t("topbar.flexSpace") : t(topbarItemLabelKey(item));
  }

  function renderPaletteItem(item, flexTemplate = false) {
    const label = itemLabel(item);
    return el("button", {
      class: `topbar-palette-item tooltip-trigger ${flexTemplate ? "topbar-palette-flex" : `topbar-palette-${item.id}`}`,
      type: "button",
      "aria-label": label,
      "data-tooltip": label,
      "data-tooltip-id": "topbar.customize.paletteItem",
      draggable: "false",
      dataset: { topbarItemId: item.id, topbarPalette: flexTemplate ? "flex" : "item" },
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (editor.consumePaletteClickSuppression()) return;
        editor.insertTopbarPaletteItem(item, flexTemplate);
      },
      onpointerdown: (event) => editor.startPointerDrag(event, item, flexTemplate ? "flex-template" : "palette"),
      onmousedown: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      onselectstart: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      ondragstart: editor.preventNativeDrag,
      ondragover: editor.preventNativeDrag,
      ondrop: editor.preventNativeDrag
    },
      flexTemplate ? renderFlexCells("topbar-palette-flex-preview") : createSvgIcon(topbarItemIcon(item)),
      el("span", { class: "topbar-palette-item-label" }, label)
    );
  }

  function hiddenEditItems() {
    const visible = new Set(editor.activeTopbarEditLayout()
      .filter((item) => item.type === "item")
      .map((item) => item.id));
    return editor.paletteCandidateIds()
      .filter((id) => !visible.has(id))
      .map((id) => ({ type: "item", id }));
  }

  function renderPalette() {
    const hiddenItems = hiddenEditItems();
    return el("section", {
      class: "topbar-customize-palette",
      "aria-label": t("topbar.customize.palette"),
      ondragstart: editor.preventNativeDrag,
      ondragover: editor.preventNativeDrag,
      ondrop: editor.preventNativeDrag
    },
      el("p", { class: "topbar-editing-hint" }, t("topbar.customize.dragHint")),
      el("div", { class: "topbar-customize-palette-row" },
        el("div", { class: "topbar-customize-candidates" },
          hiddenItems.map((item) => renderPaletteItem(item)),
          renderPaletteItem({ type: "flex", id: "flex-template", weight: 1 }, true),
          !hiddenItems.length ? el("div", { class: "topbar-customize-empty" }, t("topbar.customize.noHiddenItems")) : null
        )
      ),
      el("div", { class: "topbar-customize-controls" },
        el("button", {
          class: "button button-secondary topbar-edit-action topbar-edit-cancel",
          type: "button",
          onclick: editLifecycle.exit
        }, createSvgIcon("x"), el("span", {}, t("common.cancel"))),
        el("button", {
          class: "button button-primary topbar-edit-action topbar-edit-save",
          type: "button",
          disabled: editLifecycle.isSavePending(),
          onclick: editLifecycle.save
        }, createSvgIcon("check"), el("span", {}, t("common.save")))
      )
    );
  }

  function renderEditSlot(item, composerNode) {
    const label = itemLabel(item);
    return el("div", {
      class: `topbar-edit-slot ${item.type === "flex" ? "topbar-edit-slot-flex" : `topbar-edit-slot-item topbar-edit-slot-${item.id}`}`,
      role: "listitem",
      draggable: "false",
      title: label,
      "aria-label": label,
      dataset: { topbarItemId: item.id },
      onpointerdown: (event) => editor.startPointerDrag(event, item),
      onmousedown: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      onselectstart: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      ondragstart: editor.preventNativeDrag,
      ondragover: editor.preventNativeDrag,
      ondrop: editor.preventNativeDrag
    }, el("div", { class: "topbar-edit-slot-body" }, renderItem(item, composerNode)));
  }

  function gateSnapshot() {
    return {
      state: state.preferredModelGateState,
      reason: state.preferredModelGateReason,
      pendingCount: state.preferredModelGatePendingCount,
      failedCount: state.preferredModelGateFailedCount,
      failedAppIds: state.preferredModelGateFailedAppIds
    };
  }

  function render({ placeholder = "" } = {}) {
    const composerNode = composer.render({ placeholder, gate: gateSnapshot() });
    if (!state.topbarEditMode) {
      const layout = editor.visibleTopbarLayoutItems(normalizeTopbarLayout(state.options?.topbarLayout));
      return el("header", { class: "topbar" }, layout.map((item) => renderItem(item, composerNode)));
    }
    const layout = editor.visibleTopbarLayoutItems(editor.activeTopbarEditLayout());
    return el("div", { class: "topbar-customize-mode" },
      el("header", { class: "topbar topbar-editing" },
        el("div", { class: "topbar-editing-livebar" },
          el("div", {
            class: "topbar-editing-livebar-items",
            role: "list",
            "aria-label": t("topbar.customize.workbench"),
            ondragstart: editor.preventNativeDrag,
            ondragover: editor.preventNativeDrag,
            ondrop: editor.preventNativeDrag
          }, layout.map((item) => renderEditSlot(item, composerNode)))
        )
      ),
      renderPalette()
    );
  }

  function settingsMenuButton(label, iconName, onClick, variant = "secondary", disabled = false, dragItem = null, options = {}) {
    let pointerActivated = false;
    const extraClass = options.className ? ` ${options.className}` : "";
    const run = (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick?.(event);
    };
    const editModeDragProps = state.topbarEditMode && dragItem
      ? {
          onpointerdown: (event) => editor.startPointerDrag(event, dragItem, "settings-menu"),
          onmousedown: (event) => {
            event.preventDefault();
            event.stopPropagation();
          },
          onselectstart: (event) => {
            event.preventDefault();
            event.stopPropagation();
          },
          ondragstart: editor.preventNativeDrag,
          ondragover: editor.preventNativeDrag,
          ondrop: editor.preventNativeDrag
        }
      : {
          onpointerdown: (event) => {
            if (event.button !== 0 || disabled) return;
            event.preventDefault();
            event.stopPropagation();
          },
          onpointerup: (event) => {
            if (event.button !== 0 || disabled) return;
            pointerActivated = true;
            run(event);
          }
        };
    return el("button", {
      class: `button button-${variant} menu-button tooltip-trigger ${dragItem ? "menu-button-draggable" : ""}${extraClass}`.trim(),
      type: "button",
      "aria-label": label,
      "data-tooltip": label,
      "data-tooltip-id": options.tooltipId || null,
      dataset: options.dataset || {},
      disabled,
      draggable: "false",
      onclick: (event) => {
        if (event.currentTarget?.disabled) return;
        if (pointerActivated) {
          pointerActivated = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (state.topbarEditMode && dragItem) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        run(event);
      },
      ...editModeDragProps
    }, createSvgIcon(iconName), el("span", {}, label));
  }

  function renderFoldedMenuButton(item, editing, runItem) {
    const label = t(topbarItemLabelKey(item));
    const dragItem = editing && item.type === "item" ? { type: "item", id: item.id } : null;
    const buttonNode = settingsMenuButton(label, topbarItemIcon(item), (event) => runItem(item, event), "secondary", false, dragItem, {
      className: editing && item.type === "item" ? "topbar-settings-menu-button" : "",
      tooltipId: tooltipIdForItem(item)
    });
    if (!editing || item.type !== "item") return buttonNode;
    return el("div", { class: "topbar-settings-menu-slot", dataset: { topbarItemId: item.id } }, buttonNode);
  }

  function renderSettingsMenu({ editing, persistent, layout, rect, closeMenu, runItem } = {}) {
    const foldedItems = editor.foldedTopbarLayoutItems(layout)
      .filter((item) => item.type === "item" && item.id !== "settingsJumpMenu");
    const foldedSettingsItemIds = new Set(foldedItems
      .map((item) => topbarSettingsSectionForItem(item.id) ? item.id : "")
      .filter(Boolean));
    const foldedButtons = foldedItems.map((item) => renderFoldedMenuButton(item, editing, runItem));
    const settingsButtons = editing || foldedSettingsItemIds.size > 0 ? [] : settingsSections.map(([id, labelKey, , icon]) => {
      return settingsMenuButton(t(labelKey), icon, () => {
        closeMenu();
        actions.openSettings(id);
      }, "secondary", false, null, { tooltipId: `topbar.settings.${id}` });
    });
    const editControls = editing ? [] : [
      settingsMenuButton(t("topbar.customize.enter"), "customizeTopbar", () => {
        closeMenu();
        editLifecycle.scheduleEnter();
      }, "secondary", false, null, { tooltipId: "topbar.customize.enter" })
    ];
    const backdrop = persistent ? null : el("div", {
      class: "popover-backdrop topbar-settings-backdrop",
      onpointerdown: (event) => {
        event.preventDefault();
        closeMenu();
      },
      oncontextmenu: (event) => {
        event.preventDefault();
        closeMenu();
      }
    });
    const menu = el("div", {
      class: `popover-menu topbar-settings-popover ${editing ? "is-editing" : ""}`,
      role: "menu",
      style: { top: `${rect.bottom + 5}px`, right: `${Math.max(8, window.innerWidth - rect.right)}px` },
      onpointerdown: (event) => event.stopPropagation(),
      onclick: (event) => event.stopPropagation()
    },
      editControls,
      editControls.length ? el("div", { class: "menu-separator", role: "separator" }) : null,
      foldedButtons,
      foldedButtons.length && settingsButtons.length ? el("div", { class: "menu-separator", role: "separator" }) : null,
      settingsButtons
    );
    return { backdrop, menu };
  }

  return Object.freeze({ render, renderSettingsMenu });
}
