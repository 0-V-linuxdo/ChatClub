import { TAB_CONTEXT_MENU_ITEMS, TAB_GROUP_HEADER_BUTTONS } from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import {
  normalizeTabContextMenuHiddenIds,
  normalizeTabContextMenuOrder,
  normalizeTabGroupButtonOrder,
  normalizeTabGroupButtonPlacement
} from "../../shared/storage-schema.js";
import { el } from "../../ui/dom.js";
import { cleanupSettingsDragRows, createSettingsKit } from "./kit.js";
import {
  tabGroupButtonPlacementValue,
  tabGroupButtonsModeForPlacement
} from "./appearance-model.js";
import { validateControllerContract } from "../controller-contract.js";

const TAB_GROUP_SETTINGS_TABS = Object.freeze(["buttons", "contextMenu"]);

export function createAppearanceTabGroupController(dependencies = {}) {
  const { state, svgIcon, queueAppearanceAutoSave } = validateControllerContract(
    dependencies,
    "Appearance Tab Group settings",
    {
      state: "object",
      svgIcon: "function",
      queueAppearanceAutoSave: "function"
    }
  );
  const { settingsBlock, settingsDragHandle, settingsInnerTabs } = createSettingsKit({ svgIcon });
  let activeDrag = null;

  const tabGroupButtonLabel = (id) => ({
    addApp: t("chat.addApp"),
    newChat: t("topbar.newChat"),
    refreshPage: t("chat.refreshPage"),
    reload: t("chat.home"),
    messageNavigator: t("chat.messageNavigator"),
    deleteThread: t("chat.deleteThreadInGroup"),
    fullscreen: t("chat.fullscreen"),
    openInNewTab: t("common.openInNewTab"),
    copyLink: t("common.copyLink"),
    goToUrl: t("chat.goToUrl"),
    removeGroup: t("chat.removeGroup"),
    more: t("chat.more")
  })[id] || id;

  const tabContextMenuLabel = (id) => ({
    addApp: t("chat.addApp"),
    refreshPage: t("chat.refreshPage"),
    newChat: t("topbar.newChat"),
    messageNavigator: t("chat.messageNavigator"),
    deleteThread: t("chat.deleteThreadInGroup"),
    reload: t("chat.home"),
    fullscreen: t("chat.fullscreen"),
    copyLink: t("common.copyLink"),
    openInNewTab: t("common.openInNewTab"),
    goToUrl: t("chat.goToUrl"),
    closeTab: t("chat.closeTab")
  })[id] || id;

  const tabGroupConfigurableButtons = () => TAB_GROUP_HEADER_BUTTONS.filter((item) => !item.requiredPinned);
  const tabGroupButtonById = new Map(tabGroupConfigurableButtons().map((item) => [item.id, item]));
  const tabContextMenuButtonById = new Map(TAB_CONTEXT_MENU_ITEMS.map((item) => [item.id, item]));

  function ensureDrafts() {
    if (!state.settingsTabGroupButtonPlacementDraft) {
      state.settingsTabGroupButtonPlacementDraft = normalizeTabGroupButtonPlacement(
        state.options.tabGroupButtonPlacement,
        state.options.tabGroupButtonsMode
      );
    }
    if (!Array.isArray(state.settingsTabGroupButtonOrderDraft)) {
      state.settingsTabGroupButtonOrderDraft = normalizeTabGroupButtonOrder(state.options.tabGroupButtonOrder);
    }
    if (!Array.isArray(state.settingsTabContextMenuOrderDraft)) {
      state.settingsTabContextMenuOrderDraft = normalizeTabContextMenuOrder(state.options.tabContextMenuOrder);
    }
    if (!Array.isArray(state.settingsTabContextMenuHiddenIdsDraft)) {
      state.settingsTabContextMenuHiddenIdsDraft = normalizeTabContextMenuHiddenIds(state.options.tabContextMenuHiddenIds);
    }
    if (!TAB_GROUP_SETTINGS_TABS.includes(state.settingsTabGroupTab)) state.settingsTabGroupTab = "buttons";
  }

  function dragConfig(kind) {
    if (kind === "contextMenu") {
      return {
        kind,
        rowSelector: ".tab-context-menu-placement-row",
        zoneSelector: ".tab-context-menu-placement-zone",
        draggingClass: "settings-tab-context-menu-dragging",
        dragStateKey: "settingsTabContextMenuDragId",
        currentPlacement: (item) => state.settingsTabContextMenuHiddenIdsDraft.includes(item.id) ? "hidden" : "visible"
      };
    }
    return {
      kind: "tabGroup",
      rowSelector: ".tab-group-button-placement-row",
      zoneSelector: ".tab-group-button-placement-zone",
      draggingClass: "settings-tab-group-button-dragging",
      dragStateKey: "settingsTabGroupButtonDragId",
      currentPlacement: (item) => state.settingsTabGroupButtonPlacementDraft[item.id] || item.defaultPlacement || "pinned"
    };
  }

  function preventNativeDrag(event) {
    if (!activeDrag) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function dropTargetFromPoint(clientX, clientY) {
    const drag = activeDrag;
    if (!drag) return null;
    const config = dragConfig(drag.kind);
    const targetFromZone = (zone) => {
      const placement = drag.kind === "contextMenu"
        ? (zone?.dataset?.placement === "hidden" ? "hidden" : "visible")
        : tabGroupButtonPlacementValue(zone?.dataset?.placement);
      const rows = Array.from(zone?.querySelectorAll?.(config.rowSelector) || [])
        .filter((row) => row.dataset?.buttonId && row.dataset.buttonId !== drag.item?.id);
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          return { placement, targetId: row.dataset.buttonId, targetPosition: "before" };
        }
      }
      const lastRow = rows[rows.length - 1];
      return {
        placement,
        targetId: lastRow?.dataset?.buttonId || "",
        targetPosition: lastRow ? "after" : "end"
      };
    };
    const pointTarget = document.elementFromPoint(clientX, clientY);
    const pointZone = pointTarget?.closest?.(config.zoneSelector);
    if (pointZone) return targetFromZone(pointZone);
    const zones = Array.from(document.querySelectorAll(config.zoneSelector));
    if (!zones.length) return { placement: drag.targetPlacement, targetId: "", targetPosition: "end" };
    const zoneRects = zones.map((node) => ({ node, rect: node.getBoundingClientRect() }));
    const zonesAreSideBySide = zoneRects.some((entry, index) => zoneRects.some((other, otherIndex) => (
      index !== otherIndex && Math.min(entry.rect.bottom, other.rect.bottom) > Math.max(entry.rect.top, other.rect.top)
    )));
    const distanceToRect = ({ rect }) => {
      const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
      const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      return zonesAreSideBySide ? dx * 4 + dy : dy * 4 + dx;
    };
    zoneRects.sort((a, b) => distanceToRect(a) - distanceToRect(b));
    return targetFromZone(zoneRects[0]?.node || zones[0]);
  }

  function previewDrop(clientX, clientY) {
    if (!activeDrag) return;
    const target = dropTargetFromPoint(clientX, clientY);
    if (!target) return;
    activeDrag.targetPlacement = target.placement;
    activeDrag.targetId = target.targetId;
    activeDrag.targetPosition = target.targetPosition;
    const config = dragConfig(activeDrag.kind);
    document.querySelectorAll(config.rowSelector).forEach((node) => {
      node.classList.toggle("drop-before", node.dataset?.buttonId === target.targetId && target.targetPosition === "before");
      node.classList.toggle("drop-after", node.dataset?.buttonId === target.targetId && target.targetPosition === "after");
    });
    document.querySelectorAll(config.zoneSelector).forEach((node) => {
      node.classList.toggle("drop-target", node.dataset?.placement === target.placement);
    });
  }

  function cleanupDrag() {
    const drag = activeDrag;
    activeDrag = null;
    state.settingsTabGroupButtonDragId = "";
    state.settingsTabContextMenuDragId = "";
    document.body.classList.remove("settings-tab-group-button-dragging", "settings-tab-context-menu-dragging");
    cleanupSettingsDragRows(".tab-group-button-placement-row, .tab-context-menu-placement-row");
    document.querySelectorAll(".tab-group-button-placement-zone, .tab-context-menu-placement-zone").forEach((node) => {
      node.classList.remove("drop-target");
    });
    document.removeEventListener("pointermove", handlePointerMove, true);
    document.removeEventListener("pointerup", handlePointerUp, true);
    document.removeEventListener("pointercancel", handlePointerUp, true);
    document.removeEventListener("selectstart", preventNativeDrag, true);
    document.removeEventListener("dragstart", preventNativeDrag, true);
    document.removeEventListener("dragover", preventNativeDrag, true);
    document.removeEventListener("drop", preventNativeDrag, true);
    drag?.row?.releasePointerCapture?.(drag.pointerId);
  }

  function reorderItems(order, sourceId, targetId, targetPosition, placementOf, targetPlacement) {
    const withoutSource = order.filter((id) => id !== sourceId);
    let insertIndex = withoutSource.length;
    if (targetId && targetId !== sourceId) {
      const targetIndex = withoutSource.indexOf(targetId);
      if (targetIndex >= 0) insertIndex = targetIndex + (targetPosition === "after" ? 1 : 0);
    } else {
      const samePlacementIds = withoutSource.filter((id) => placementOf(id) === targetPlacement);
      if (samePlacementIds.length) {
        insertIndex = withoutSource.indexOf(samePlacementIds[samePlacementIds.length - 1]) + 1;
      } else if (targetPlacement === "pinned" || targetPlacement === "visible") {
        insertIndex = 0;
      }
    }
    return [
      ...withoutSource.slice(0, insertIndex),
      sourceId,
      ...withoutSource.slice(insertIndex)
    ];
  }

  function dropDrag() {
    const drag = activeDrag;
    if (!drag || !drag.started) {
      cleanupDrag();
      return;
    }
    const sourceId = drag.item.id;
    const redraw = drag.redraw;
    if (drag.kind === "contextMenu") {
      const nextHiddenIds = normalizeTabContextMenuHiddenIds(
        state.settingsTabContextMenuHiddenIdsDraft.filter((id) => id !== sourceId)
          .concat(drag.targetPlacement === "hidden" ? sourceId : [])
      );
      const nextOrder = normalizeTabContextMenuOrder(reorderItems(
        normalizeTabContextMenuOrder(state.settingsTabContextMenuOrderDraft),
        sourceId,
        drag.targetId,
        drag.targetPosition,
        (id) => nextHiddenIds.includes(id) ? "hidden" : "visible",
        drag.targetPlacement
      ));
      state.settingsTabContextMenuHiddenIdsDraft = nextHiddenIds;
      state.settingsTabContextMenuOrderDraft = nextOrder;
      queueAppearanceAutoSave({
        tabContextMenuOrder: nextOrder,
        tabContextMenuHiddenIds: nextHiddenIds
      });
    } else {
      const nextPlacement = normalizeTabGroupButtonPlacement(
        { ...state.settingsTabGroupButtonPlacementDraft, [sourceId]: drag.targetPlacement },
        state.options.tabGroupButtonsMode
      );
      const nextOrder = normalizeTabGroupButtonOrder(reorderItems(
        normalizeTabGroupButtonOrder(state.settingsTabGroupButtonOrderDraft),
        sourceId,
        drag.targetId,
        drag.targetPosition,
        (id) => nextPlacement[id],
        drag.targetPlacement
      ));
      state.settingsTabGroupButtonPlacementDraft = nextPlacement;
      state.settingsTabGroupButtonOrderDraft = nextOrder;
      queueAppearanceAutoSave({
        tabGroupButtonsMode: tabGroupButtonsModeForPlacement(nextPlacement),
        tabGroupButtonPlacement: nextPlacement,
        tabGroupButtonOrder: nextOrder
      });
    }
    cleanupDrag();
    redraw?.();
  }

  function handlePointerMove(event) {
    const drag = activeDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.started && distance < 4) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.started) {
      drag.started = true;
      state[dragConfig(drag.kind).dragStateKey] = drag.item.id;
      drag.row?.classList.add("dragging");
      document.body.classList.add(dragConfig(drag.kind).draggingClass);
    }
    previewDrop(event.clientX, event.clientY);
  }

  function handlePointerUp(event) {
    const drag = activeDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    document.body.classList.remove(dragConfig(drag.kind).draggingClass);
    dropDrag();
  }

  function startDrag(event, item, redraw, kind) {
    if (event.button !== 0) return;
    cleanupDrag();
    ensureDrafts();
    event.preventDefault();
    event.stopPropagation();
    globalThis.getSelection?.()?.removeAllRanges?.();
    const config = dragConfig(kind);
    const row = event.currentTarget?.closest?.(config.rowSelector) || event.currentTarget;
    activeDrag = {
      kind,
      item,
      row,
      redraw,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      targetPlacement: config.currentPlacement(item),
      targetId: "",
      targetPosition: "end",
      started: false
    };
    row?.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handlePointerUp, true);
    document.addEventListener("selectstart", preventNativeDrag, true);
    document.addEventListener("dragstart", preventNativeDrag, true);
    document.addEventListener("dragover", preventNativeDrag, true);
    document.addEventListener("drop", preventNativeDrag, true);
  }

  function renderPlacementRow(item, redraw, kind) {
    const contextMenu = kind === "contextMenu";
    const rowClass = contextMenu ? "tab-context-menu-placement-row" : "tab-group-button-placement-row";
    const iconClass = contextMenu ? "tab-context-menu-placement-icon" : "tab-group-button-placement-icon";
    const copyClass = contextMenu ? "tab-context-menu-placement-copy" : "tab-group-button-placement-copy";
    const label = contextMenu ? tabContextMenuLabel(item.id) : tabGroupButtonLabel(item.id);
    return el("div", {
      class: `${rowClass} ${item.danger ? "is-danger" : ""}`.trim(),
      dataset: { buttonId: item.id },
      draggable: "false",
      onpointerdown: (event) => startDrag(event, item, redraw, kind),
      ondragstart: preventNativeDrag,
      ondragend: cleanupDrag
    },
      settingsDragHandle(label),
      el("span", { class: iconClass, "aria-hidden": "true" }, svgIcon(item.icon)),
      el("span", { class: copyClass }, el("strong", {}, label))
    );
  }

  function placementZone(placement, items, emptyText, redraw, kind) {
    const contextMenu = kind === "contextMenu";
    const panelClass = contextMenu ? "tab-context-menu-placement-panel" : "tab-group-button-placement-panel";
    const zoneClass = contextMenu ? "tab-context-menu-placement-zone" : "tab-group-button-placement-zone";
    const title = contextMenu
      ? placement === "hidden"
        ? ["x", t("appearance.tabContextMenuHidden")]
        : ["layout", t("appearance.tabContextMenuVisible")]
      : placement === "menu"
        ? ["more", t("chat.more")]
        : placement === "hidden"
          ? ["x", t("appearance.tabGroupButtonsHidden")]
          : ["layout", t("appearance.tabGroupButtonsPinned")];
    return el("section", {
      class: `${panelClass} is-${placement}`,
      "aria-label": title[1]
    },
      el("span", { class: "tab-group-button-placement-title" }, svgIcon(title[0]), el("span", {}, title[1])),
      el("div", {
        class: `${zoneClass} is-${placement}`,
        "data-placement": placement,
        ondragover: preventNativeDrag,
        ondrop: preventNativeDrag
      },
        items.length
          ? items.map((item) => renderPlacementRow(item, redraw, kind))
          : el("div", { class: "tab-group-button-placement-empty" }, emptyText)
      )
    );
  }

  function tabGroupButtonsPane(redraw) {
    const placement = state.settingsTabGroupButtonPlacementDraft;
    const order = normalizeTabGroupButtonOrder(state.settingsTabGroupButtonOrderDraft);
    const byId = tabGroupButtonById;
    const ordered = order.map((id) => byId.get(id)).filter(Boolean);
    const itemsFor = (value) => ordered.filter((item) => tabGroupButtonPlacementValue(placement[item.id] || item.defaultPlacement) === value);
    return settingsBlock(t("appearance.tabGroup"), t("appearance.tabGroupDesc"),
      el("div", { class: "appearance-field-list" },
        el("p", { class: "settings-muted-help" }, t("appearance.tabGroupButtonsHelp")),
        el("div", { class: "tab-group-button-placement-list" },
          placementZone("pinned", itemsFor("pinned"), t("appearance.tabGroupDropPinned"), redraw, "tabGroup"),
          placementZone("menu", itemsFor("menu"), t("appearance.tabGroupDropMenu"), redraw, "tabGroup"),
          placementZone("hidden", itemsFor("hidden"), t("appearance.tabGroupDropHidden"), redraw, "tabGroup")
        )
      )
    );
  }

  function tabContextMenuPane(redraw) {
    const hiddenIds = new Set(state.settingsTabContextMenuHiddenIdsDraft);
    const order = normalizeTabContextMenuOrder(state.settingsTabContextMenuOrderDraft);
    const ordered = order.map((id) => tabContextMenuButtonById.get(id)).filter(Boolean);
    const itemsFor = (placement) => ordered.filter((item) => (hiddenIds.has(item.id) ? "hidden" : "visible") === placement);
    return settingsBlock(t("appearance.tabContextMenu"), t("appearance.tabContextMenuDesc"),
      el("div", { class: "appearance-field-list" },
        el("p", { class: "settings-muted-help" }, t("appearance.tabContextMenuHelp")),
        el("div", { class: "tab-context-menu-placement-list" },
          placementZone("visible", itemsFor("visible"), t("appearance.tabContextMenuDropVisible"), redraw, "contextMenu"),
          placementZone("hidden", itemsFor("hidden"), t("appearance.tabContextMenuDropHidden"), redraw, "contextMenu")
        )
      )
    );
  }

  function pane(redraw = () => {}) {
    ensureDrafts();
    const activeTab = state.settingsTabGroupTab;
    const innerTabs = settingsInnerTabs([
      ["buttons", t("appearance.tabGroup"), t("appearance.tabGroupTabDesc")],
      ["contextMenu", t("appearance.tabContextMenu"), t("appearance.tabContextMenuTabDesc")]
    ], activeTab, (id) => {
      state.settingsTabGroupTab = id;
      redraw();
    });
    innerTabs.setAttribute("aria-label", t("appearance.tabGroupTabsLabel"));
    return el("div", { class: `appearance-tab-group-pane is-${activeTab}` },
      innerTabs,
      activeTab === "contextMenu" ? tabContextMenuPane(redraw) : tabGroupButtonsPane(redraw)
    );
  }

  function reset() {
    state.settingsTabGroupTab = "buttons";
    state.settingsTabGroupButtonPlacementDraft = null;
    state.settingsTabGroupButtonOrderDraft = null;
    state.settingsTabGroupButtonDragId = "";
    state.settingsTabContextMenuOrderDraft = null;
    state.settingsTabContextMenuHiddenIdsDraft = null;
    state.settingsTabContextMenuDragId = "";
    cleanupDrag();
  }

  return Object.freeze({ cleanup: cleanupDrag, pane, reset });
}
