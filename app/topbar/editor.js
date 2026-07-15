import { createId } from "../../shared/storage-schema.js";
import {
  DEFAULT_TOPBAR_LAYOUT,
  TOPBAR_BUILTIN_ITEMS,
  TOPBAR_REQUIRED_ITEMS,
  normalizeTopbarLayout,
  topbarSettingsItemForSection
} from "../../shared/topbar.js";
import { validateControllerContract } from "../controller-contract.js";

function cleanupDragRows(selector) {
  document.querySelectorAll(selector).forEach((row) => {
    row.classList.remove("dragging", "drop-before", "drop-after");
  });
}

export function createTopbarEditor(dependencies = {}) {
  const {
    state,
    settingsSections,
    syncTopbar,
    openSettingsMenu,
    closeSettingsMenu,
    openEditorSettingsMenu
  } = validateControllerContract(dependencies, "Topbar editor", {
    state: "object",
    settingsSections: "any",
    syncTopbar: "function",
    openSettingsMenu: "function",
    closeSettingsMenu: "function",
    openEditorSettingsMenu: "function"
  });
  if (!Array.isArray(settingsSections)) throw new TypeError("Topbar editor requires settingsSections to be an array.");
  let activePointerDrag = null;
  let suppressPaletteClick = false;

  function activeTopbarEditLayout() {
    if (!state.topbarEditLayoutDraft) {
      state.topbarEditLayoutDraft = normalizeTopbarLayout(state.options?.topbarLayout);
    }
    return normalizeTopbarLayout(state.topbarEditLayoutDraft);
  }

  function topbarLayoutMenuIndex(layout) {
    return layout.findIndex((entry) => entry.type === "item" && entry.id === "settingsJumpMenu");
  }

  function visibleTopbarLayoutItems(layout) {
    const menuIndex = topbarLayoutMenuIndex(layout);
    return menuIndex < 0 ? layout : layout.slice(0, menuIndex + 1);
  }

  function foldedTopbarLayoutItems(layout) {
    const menuIndex = topbarLayoutMenuIndex(layout);
    return menuIndex < 0 ? [] : layout.slice(menuIndex + 1);
  }

  function topbarLayoutItemIds(layout) {
    return new Set(layout
      .filter((item) => item.type === "item")
      .map((item) => item.id));
  }

  function topbarSettingsSectionItemIds() {
    return settingsSections
      .map(([id]) => topbarSettingsItemForSection(id))
      .filter(Boolean);
  }

  function ensureTopbarSettingsMenuItems(layout) {
    const normalized = normalizeTopbarLayout(layout);
    const existing = topbarLayoutItemIds(normalized);
    const settingsIds = topbarSettingsSectionItemIds();
    const missingSettingsIds = settingsIds.filter((id) => !existing.has(id));
    if (!missingSettingsIds.length) return normalized;
    let menuIndex = topbarLayoutMenuIndex(normalized);
    const base = [...normalized];
    if (menuIndex < 0) {
      base.push({ type: "item", id: "settingsJumpMenu" });
      menuIndex = base.length - 1;
    }
    const settingsOrder = new Map(settingsIds.map((id, index) => [id, index]));
    const missingSettings = new Set(missingSettingsIds);
    const mergedFoldedItems = [];
    const appendMissingBefore = (orderLimit) => {
      for (const id of settingsIds) {
        if (!missingSettings.has(id)) continue;
        if (settingsOrder.get(id) >= orderLimit) continue;
        mergedFoldedItems.push({ type: "item", id });
        missingSettings.delete(id);
      }
    };
    for (const item of base.slice(menuIndex + 1)) {
      const order = item.type === "item" ? settingsOrder.get(item.id) : undefined;
      if (typeof order === "number") appendMissingBefore(order);
      mergedFoldedItems.push(item);
    }
    appendMissingBefore(Number.POSITIVE_INFINITY);
    return [
      ...base.slice(0, menuIndex + 1),
      ...mergedFoldedItems
    ];
  }

  function setTopbarEditLayoutDraft(layout) {
    state.topbarEditLayoutDraft = normalizeTopbarLayout(layout);
    syncTopbar();
  }

  function insertTopbarItemBeforeSettingsMenu(layout, item) {
    const menuIndex = topbarLayoutMenuIndex(layout);
    const insertIndex = menuIndex >= 0 ? menuIndex : layout.length;
    return [
      ...layout.slice(0, insertIndex),
      item,
      ...layout.slice(insertIndex)
    ];
  }

  function addTopbarEditFlexSpace() {
    setTopbarEditLayoutDraft(insertTopbarItemBeforeSettingsMenu(activeTopbarEditLayout(), {
      type: "flex",
      id: createId("topbar-flex"),
      weight: 1
    }));
  }

  function insertTopbarPaletteItem(item, flexTemplate = false) {
    const layout = activeTopbarEditLayout();
    if (flexTemplate || item.type === "flex") {
      setTopbarEditLayoutDraft(insertTopbarItemBeforeSettingsMenu(layout, {
        type: "flex",
        id: createId("topbar-flex"),
        weight: item.weight || 1
      }));
      return;
    }
    if (layout.some((entry) => entry.type === "item" && entry.id === item.id)) return;
    setTopbarEditLayoutDraft(insertTopbarItemBeforeSettingsMenu(layout, { type: "item", id: item.id }));
  }

  function topbarEditItemIsRequired(item) {
    return item?.type === "item" && TOPBAR_REQUIRED_ITEMS.includes(item.id);
  }

  function removeTopbarEditItem(item) {
    if (!item || topbarEditItemIsRequired(item)) return;
    setTopbarEditLayoutDraft(activeTopbarEditLayout().filter((entry) => entry.id !== item.id));
  }

  function resetTopbarEditLayout() {
    setTopbarEditLayoutDraft(DEFAULT_TOPBAR_LAYOUT);
  }

  function addPointerDragGuards() {
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", cancelPointerDrag, true);
    document.addEventListener("selectstart", preventNativeDrag, true);
    document.addEventListener("dragstart", preventNativeDrag, true);
    document.addEventListener("dragover", preventNativeDrag, true);
    document.addEventListener("drop", preventNativeDrag, true);
  }

  function removePointerDragGuards() {
    document.removeEventListener("pointermove", handlePointerMove, true);
    document.removeEventListener("pointerup", handlePointerUp, true);
    document.removeEventListener("pointercancel", cancelPointerDrag, true);
    document.removeEventListener("selectstart", preventNativeDrag, true);
    document.removeEventListener("dragstart", preventNativeDrag, true);
    document.removeEventListener("dragover", preventNativeDrag, true);
    document.removeEventListener("drop", preventNativeDrag, true);
  }

  function preventNativeDrag(event) {
    if (!state.topbarEditMode && !activePointerDrag) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
  }

  function startPointerDrag(event, item, source = "toolbar", command = null) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    globalThis.getSelection?.()?.removeAllRanges?.();
    cleanupPointerDrag();
    const slot = event.currentTarget.closest(".topbar-edit-slot, .topbar-settings-menu-slot, .topbar-palette-item") || event.currentTarget;
    state.topbarEditDragId = item.id;
    document.body.classList.add("topbar-edit-gesture-active");
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    activePointerDrag = {
      id: item.id,
      item,
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      targetId: item.id,
      placement: "before",
      dropZone: "toolbar",
      removeTarget: false,
      slot,
      started: false,
      command
    };
    addPointerDragGuards();
  }

  function beginPointerDrag(drag) {
    if (drag.started) return;
    drag.started = true;
    document.body.classList.add("topbar-edit-dragging");
    drag.slot?.classList.add("dragging");
  }

  function cleanupPointerDrag() {
    const drag = activePointerDrag;
    removePointerDragGuards();
    activePointerDrag = null;
    state.topbarEditDragId = "";
    document.body.classList.remove("topbar-edit-gesture-active", "topbar-edit-dragging");
    drag?.slot?.classList?.remove("dragging");
    cleanupDragRows(".topbar-edit-slot");
    cleanupDragRows(".topbar-settings-menu-slot");
    document.querySelectorAll(".topbar-settings-popover.drop-empty").forEach((node) => node.classList.remove("drop-empty"));
    document.querySelectorAll(".topbar-customize-palette.is-remove-target").forEach((node) => node.classList.remove("is-remove-target"));
  }

  function cancelPointerDrag(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    cleanupPointerDrag();
  }

  function handlePointerMove(event) {
    const drag = activePointerDrag;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.started) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < 4) return;
      beginPointerDrag(drag);
    }
    previewPointerDrop(event.clientX, event.clientY, drag);
  }

  function handlePointerUp(event) {
    const drag = activePointerDrag;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.started && drag.source === "toolbar" && drag.item?.id === "settingsJumpMenu") {
      const anchor = drag.slot?.querySelector?.(".top-icon-action, button");
      cleanupPointerDrag();
      if (anchor?.isConnected) openSettingsMenu(anchor, { forceOpen: true, editing: true });
      return;
    }
    if (!drag.started && typeof drag.command === "function") {
      const command = drag.command;
      cleanupPointerDrag();
      command(event);
      return;
    }
    if (drag.started && drag.source !== "toolbar") suppressPaletteClick = true;
    const shouldRemove = drag.started && drag.removeTarget && drag.source !== "palette" && drag.source !== "flex-template" && !topbarEditItemIsRequired(drag.item);
    const shouldFoldIntoMenu = drag.started && drag.dropZone === "settings-menu" && drag.item?.type === "item" && !topbarEditItemIsRequired(drag.item);
    const shouldPlaceOnToolbar = drag.started && drag.targetId && drag.dropZone === "toolbar" && drag.source !== "toolbar";
    const shouldMove = drag.started && drag.targetId && drag.dropZone === "toolbar" && drag.source === "toolbar" && drag.targetId !== drag.id;
    let layout = null;
    if (shouldRemove) {
      layout = activeTopbarEditLayout().filter((entry) => entry.id !== drag.id);
    } else if (shouldFoldIntoMenu) {
      layout = placeTopbarItemInSettingsMenu(activeTopbarEditLayout(), drag.item, drag.targetId, drag.placement);
    } else if (shouldPlaceOnToolbar) {
      layout = placeTopbarItemOnToolbar(activeTopbarEditLayout(), drag.item, drag.targetId, drag.placement, drag.source === "flex-template");
    } else if (shouldMove) {
      layout = placeTopbarItemOnToolbar(activeTopbarEditLayout(), drag.item, drag.targetId, drag.placement);
    }
    const shouldReopenSettingsMenu = Boolean(layout && state.topbarEditMode && document.querySelector(".topbar-settings-popover"));
    cleanupPointerDrag();
    if (layout) {
      if (shouldReopenSettingsMenu) closeSettingsMenu();
      setTopbarEditLayoutDraft(layout);
      if (shouldReopenSettingsMenu) requestAnimationFrame(openEditorSettingsMenu);
    }
  }

  function previewPointerDrop(clientX, clientY, drag) {
    document.querySelectorAll(".topbar-customize-palette.is-remove-target").forEach((node) => node.classList.remove("is-remove-target"));
    const elementAtPoint = document.elementFromPoint(clientX, clientY);
    const palette = elementAtPoint?.closest?.(".topbar-customize-palette");
    cleanupDragRows(".topbar-edit-slot");
    cleanupDragRows(".topbar-settings-menu-slot");
    drag.slot?.classList.add("dragging");
    drag.dropZone = "";
    drag.removeTarget = Boolean(palette && drag.source !== "palette" && drag.source !== "flex-template" && !topbarEditItemIsRequired(drag.item));
    if (palette) {
      if (drag.removeTarget) palette.classList.add("is-remove-target");
      drag.targetId = "";
      return;
    }
    const menuSlot = settingsMenuSlotFromPoint(clientX, clientY);
    if (menuSlot && drag.item?.type === "item" && !topbarEditItemIsRequired(drag.item)) {
      const targetId = menuSlot.dataset?.topbarItemId || "";
      drag.targetId = targetId;
      drag.placement = targetId ? dropPlacement(menuSlot, clientX) : "after";
      drag.dropZone = "settings-menu";
      if (targetId) {
        menuSlot.classList.toggle("drop-after", drag.placement === "after");
        menuSlot.classList.toggle("drop-before", drag.placement !== "after");
      } else {
        menuSlot.classList.add("drop-empty");
      }
      return;
    }
    const targetSlot = editSlotFromPoint(clientX, clientY);
    if (!targetSlot) return;
    const targetId = targetSlot.dataset?.topbarItemId || "";
    drag.targetId = targetId;
    drag.placement = dropPlacement(targetSlot, clientX);
    drag.dropZone = "toolbar";
    if (!targetId || targetId === drag.id) return;
    targetSlot.classList.toggle("drop-after", drag.placement === "after");
    targetSlot.classList.toggle("drop-before", drag.placement !== "after");
  }

  function dropItemEntry(item, flexTemplate = false) {
    if (flexTemplate || item.type === "flex") {
      return { type: "flex", id: createId("topbar-flex"), weight: item.weight || 1 };
    }
    return { type: "item", id: item.id };
  }

  function removeDropItem(layout, item, flexTemplate = false) {
    if (flexTemplate) return layout;
    if (item.type === "item") return layout.filter((entry) => !(entry.type === "item" && entry.id === item.id));
    return layout.filter((entry) => entry.id !== item.id);
  }

  function placeTopbarItemOnToolbar(layout, item, targetId, placement, flexTemplate = false) {
    const nextItem = dropItemEntry(item, flexTemplate);
    const base = removeDropItem(layout, item, flexTemplate);
    const targetIndex = base.findIndex((entry) => entry.id === targetId);
    if (targetIndex < 0) return [...base, nextItem];
    const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
    return [
      ...base.slice(0, insertIndex),
      nextItem,
      ...base.slice(insertIndex)
    ];
  }

  function placeTopbarItemInSettingsMenu(layout, item, targetId, placement) {
    if (item.type !== "item" || topbarEditItemIsRequired(item)) return layout;
    const base = removeDropItem(layout, item);
    let menuIndex = topbarLayoutMenuIndex(base);
    if (menuIndex < 0) {
      base.push({ type: "item", id: "settingsJumpMenu" });
      menuIndex = base.length - 1;
    }
    const targetIndex = base.findIndex((entry, index) => index > menuIndex && entry.id === targetId);
    const insertIndex = targetIndex >= 0
      ? targetIndex + (placement === "after" ? 1 : 0)
      : menuIndex + 1;
    return [
      ...base.slice(0, insertIndex),
      { type: "item", id: item.id },
      ...base.slice(insertIndex)
    ];
  }

  function settingsMenuSlotFromPoint(clientX, clientY) {
    const direct = document.elementFromPoint(clientX, clientY)?.closest?.(".topbar-settings-menu-slot");
    if (direct) return direct;
    const menu = document.elementFromPoint(clientX, clientY)?.closest?.(".topbar-settings-popover.is-editing");
    if (!menu) return null;
    const slots = [...menu.querySelectorAll(".topbar-settings-menu-slot")];
    if (!slots.length) return menu;
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const slot of slots) {
      const rect = slot.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const distance = Math.abs(clientY - centerY);
      if (distance < bestDistance) {
        best = slot;
        bestDistance = distance;
      }
    }
    return best;
  }

  function editSlotFromPoint(clientX, clientY) {
    const direct = document.elementFromPoint(clientX, clientY)?.closest?.(".topbar-edit-slot");
    if (direct) return direct;
    const slots = [...document.querySelectorAll(".topbar-edit-slot")];
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const slot of slots) {
      const rect = slot.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(clientX - centerX, clientY - centerY);
      if (distance < bestDistance) {
        best = slot;
        bestDistance = distance;
      }
    }
    return best;
  }

  function dropPlacement(slot, clientX) {
    const rect = slot.getBoundingClientRect();
    return clientX > rect.left + rect.width / 2 ? "after" : "before";
  }

  function consumePaletteClickSuppression() {
    if (!suppressPaletteClick) return false;
    suppressPaletteClick = false;
    return true;
  }

  function paletteCandidateIds() {
    return TOPBAR_BUILTIN_ITEMS.filter((id) => !TOPBAR_REQUIRED_ITEMS.includes(id));
  }

  return Object.freeze({
    activeTopbarEditLayout,
    addTopbarEditFlexSpace,
    cleanupPointerDrag,
    consumePaletteClickSuppression,
    ensureTopbarSettingsMenuItems,
    foldedTopbarLayoutItems,
    insertTopbarPaletteItem,
    paletteCandidateIds,
    preventNativeDrag,
    removeTopbarEditItem,
    resetTopbarEditLayout,
    startPointerDrag,
    topbarEditItemIsRequired,
    visibleTopbarLayoutItems
  });
}
