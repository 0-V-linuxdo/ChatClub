import {
  DEFAULT_OPTIONS,
  TAB_GROUP_HEADER_BUTTONS,
  TOOLTIP_TARGET_GROUPS
} from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import {
  normalizeFrameToastPosition,
  normalizePrimaryColor,
  normalizeTabGroupButtonOrder,
  normalizeTabGroupButtonPlacement
} from "../../shared/storage-schema.js";
import {
  el,
  field,
  input,
  select
} from "../../ui/dom.js";
import { FRAME_TOAST_POSITION_EVENT } from "../../ui/frame-toast.js";
import { cleanupSettingsDragRows, createSettingsKit } from "./kit.js";
import { createAppearanceAutosave } from "./appearance-autosave.js";
import { createAppearanceTopbarController } from "./appearance-topbar.js";
import {
  tabGroupButtonPlacementValue,
  tabGroupButtonsModeForPlacement
} from "./appearance-model.js";
import { requireSettingsSectionStatePort } from "./section-contract.js";
import { requireControllerContext, requireControllerFunction, validateControllerContract } from "../controller-contract.js";

export function createAppearanceSettingsSection(ctx) {
  const controllerName = "Appearance settings section";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    saveOptionsPatch: "function",
    applyTheme: "function",
    syncI18nLanguage: "function",
    syncTopbar: "function",
    syncTopbarPromptPlaceholder: "function",
    syncWorkspaceDom: "function",
    syncSummaryPanel: "function",
    enterTopbarEditMode: "function",
    closeSettingsDialog: "function"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    [
      "options",
      "settingsAppearanceTab",
      "settingsAppearanceTopbarTab",
      "settingsTabGroupButtonDragId",
      "settingsTabGroupButtonOrderDraft",
      "settingsTabGroupButtonPlacementDraft",
      "settingsTopbarPromptPlaceholderDraft",
      "settingsTopbarPromptPlaceholderDragIndex",
      "settingsTopbarPromptPlaceholderEditingIndex",
      "topbarEditLayoutDraft"
    ]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const applyTheme = requireControllerFunction(ctx, controllerName, "applyTheme");
  const syncI18nLanguage = requireControllerFunction(ctx, controllerName, "syncI18nLanguage");
  const syncTopbar = requireControllerFunction(ctx, controllerName, "syncTopbar");
  const syncTopbarPromptPlaceholder = requireControllerFunction(ctx, controllerName, "syncTopbarPromptPlaceholder");
  const syncWorkspaceDom = requireControllerFunction(ctx, controllerName, "syncWorkspaceDom");
  const syncSummaryPanel = requireControllerFunction(ctx, controllerName, "syncSummaryPanel");
  const enterTopbarEditMode = requireControllerFunction(ctx, controllerName, "enterTopbarEditMode");
  const closeSettingsDialog = requireControllerFunction(ctx, controllerName, "closeSettingsDialog");
  const {
    settingsBlock,
    settingsDragHandle,
    settingsInnerTabs
  } = createSettingsKit({ svgIcon });

  let activeTabGroupButtonDrag = null;
  let appearancePaneCleanup = () => {};
  const appearanceAutosave = createAppearanceAutosave({
    state,
    saveOptionsPatch,
    applyTheme,
    syncI18nLanguage,
    syncTopbar,
    syncWorkspaceDom,
    syncSummaryPanel
  });
  const queueAppearanceAutoSave = appearanceAutosave.queue;
  const queueAppearanceColorSave = appearanceAutosave.queueColor;
  const appearanceTopbar = createAppearanceTopbarController({
    state,
    svgIcon,
    saveOptionsPatch,
    syncTopbarPromptPlaceholder,
    enterTopbarEditMode,
    closeSettingsDialog
  });

  function preventTabGroupButtonNativeDrag(event) {
    if (!activeTabGroupButtonDrag) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function tabGroupButtonDropTargetFromPoint(clientX, clientY) {
    const pointTarget = document.elementFromPoint(clientX, clientY);
    const targetFromZone = (zone) => {
      const placement = tabGroupButtonPlacementValue(zone?.dataset?.placement);
      const rows = Array.from(zone?.querySelectorAll?.(".tab-group-button-placement-row") || [])
        .filter((row) => row.dataset?.buttonId && row.dataset.buttonId !== activeTabGroupButtonDrag?.item?.id);
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          return {
            placement,
            targetId: row.dataset.buttonId,
            targetPosition: "before"
          };
        }
      }
      const lastRow = rows[rows.length - 1];
      return {
        placement,
        targetId: lastRow?.dataset?.buttonId || "",
        targetPosition: lastRow ? "after" : "end"
      };
    };
    const zone = pointTarget?.closest?.(".tab-group-button-placement-zone");
    if (zone?.dataset?.placement === "pinned" || zone?.dataset?.placement === "menu" || zone?.dataset?.placement === "hidden") {
      return targetFromZone(zone);
    }
    const zones = Array.from(document.querySelectorAll(".tab-group-button-placement-zone"))
      .filter((node) => node.dataset?.placement === "pinned" || node.dataset?.placement === "menu" || node.dataset?.placement === "hidden");
    if (!zones.length) {
      return {
        placement: activeTabGroupButtonDrag?.targetPlacement || "pinned",
        targetId: "",
        targetPosition: "end"
      };
    }
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

  function previewTabGroupButtonDrop(clientX, clientY) {
    if (!activeTabGroupButtonDrag) return;
    const { placement, targetId, targetPosition } = tabGroupButtonDropTargetFromPoint(clientX, clientY);
    activeTabGroupButtonDrag.targetPlacement = placement;
    activeTabGroupButtonDrag.targetId = targetId;
    activeTabGroupButtonDrag.targetPosition = targetPosition;
    document.querySelectorAll(".tab-group-button-placement-row").forEach((node) => {
      node.classList.toggle("drop-before", node.dataset?.buttonId === targetId && targetPosition === "before");
      node.classList.toggle("drop-after", node.dataset?.buttonId === targetId && targetPosition === "after");
    });
    document.querySelectorAll(".tab-group-button-placement-zone").forEach((node) => {
      node.classList.toggle("drop-target", node.dataset?.placement === placement);
    });
  }

  function cleanupTabGroupButtonDrag() {
    const drag = activeTabGroupButtonDrag;
    activeTabGroupButtonDrag = null;
    state.settingsTabGroupButtonDragId = "";
    document.body.classList.remove("settings-tab-group-button-dragging");
    cleanupSettingsDragRows(".tab-group-button-placement-row");
    document.querySelectorAll(".tab-group-button-placement-zone").forEach((node) => node.classList.remove("drop-target"));
    document.removeEventListener("pointermove", handleTabGroupButtonPointerMove, true);
    document.removeEventListener("pointerup", handleTabGroupButtonPointerUp, true);
    document.removeEventListener("pointercancel", handleTabGroupButtonPointerUp, true);
    document.removeEventListener("selectstart", preventTabGroupButtonNativeDrag, true);
    document.removeEventListener("dragstart", preventTabGroupButtonNativeDrag, true);
    document.removeEventListener("dragover", preventTabGroupButtonNativeDrag, true);
    document.removeEventListener("drop", preventTabGroupButtonNativeDrag, true);
    drag?.row?.releasePointerCapture?.(drag.pointerId);
  }

  function dropTabGroupButton() {
    const drag = activeTabGroupButtonDrag;
    if (!drag || !drag.started) {
      cleanupTabGroupButtonDrag();
      return;
    }
    const sourceId = drag.item.id;
    const nextPlacement = normalizeTabGroupButtonPlacement(
      {
        ...state.settingsTabGroupButtonPlacementDraft,
        [sourceId]: drag.targetPlacement
      },
      state.options.tabGroupButtonsMode
    );
    const currentOrder = normalizeTabGroupButtonOrder(state.settingsTabGroupButtonOrderDraft);
    const withoutSource = currentOrder.filter((id) => id !== sourceId);
    let insertIndex = withoutSource.length;
    if (drag.targetId && drag.targetId !== sourceId) {
      const targetIndex = withoutSource.indexOf(drag.targetId);
      if (targetIndex >= 0) insertIndex = targetIndex + (drag.targetPosition === "after" ? 1 : 0);
    } else {
      const samePlacementIds = withoutSource.filter((id) => nextPlacement[id] === drag.targetPlacement);
      if (samePlacementIds.length) {
        insertIndex = withoutSource.indexOf(samePlacementIds[samePlacementIds.length - 1]) + 1;
      } else if (drag.targetPlacement === "pinned") {
        insertIndex = 0;
      }
    }
    const nextOrder = [
      ...withoutSource.slice(0, insertIndex),
      sourceId,
      ...withoutSource.slice(insertIndex)
    ];
    state.settingsTabGroupButtonPlacementDraft = nextPlacement;
    state.settingsTabGroupButtonOrderDraft = normalizeTabGroupButtonOrder(nextOrder);
    queueAppearanceAutoSave({
      tabGroupButtonsMode: tabGroupButtonsModeForPlacement(nextPlacement),
      tabGroupButtonPlacement: nextPlacement,
      tabGroupButtonOrder: state.settingsTabGroupButtonOrderDraft
    });
    const redraw = drag.redraw;
    cleanupTabGroupButtonDrag();
    redraw?.();
  }

  function handleTabGroupButtonPointerMove(event) {
    const drag = activeTabGroupButtonDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.started && distance < 4) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.started) {
      drag.started = true;
      state.settingsTabGroupButtonDragId = drag.item.id;
      drag.row?.classList.add("dragging");
      document.body.classList.add("settings-tab-group-button-dragging");
    }
    previewTabGroupButtonDrop(event.clientX, event.clientY);
  }

  function handleTabGroupButtonPointerUp(event) {
    const drag = activeTabGroupButtonDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    document.body.classList.remove("settings-tab-group-button-dragging");
    dropTabGroupButton();
  }

  function startTabGroupButtonDrag(event, item, redraw) {
    if (event.button !== 0) return;
    cleanupTabGroupButtonDrag();
    event.preventDefault();
    event.stopPropagation();
    globalThis.getSelection?.()?.removeAllRanges?.();
    const row = event.currentTarget?.closest?.(".tab-group-button-placement-row") || event.currentTarget;
    const currentPlacement = state.settingsTabGroupButtonPlacementDraft?.[item.id] || item.defaultPlacement || "pinned";
    activeTabGroupButtonDrag = {
      item,
      row,
      redraw,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      targetPlacement: currentPlacement === "menu" ? "menu" : "pinned",
      targetId: "",
      targetPosition: "end",
      started: false
    };
    row?.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", handleTabGroupButtonPointerMove, true);
    document.addEventListener("pointerup", handleTabGroupButtonPointerUp, true);
    document.addEventListener("pointercancel", handleTabGroupButtonPointerUp, true);
    document.addEventListener("selectstart", preventTabGroupButtonNativeDrag, true);
    document.addEventListener("dragstart", preventTabGroupButtonNativeDrag, true);
    document.addEventListener("dragover", preventTabGroupButtonNativeDrag, true);
    document.addEventListener("drop", preventTabGroupButtonNativeDrag, true);
  }

  function appearancePane(redraw = () => {}) {
    const appearanceCleanupCallbacks = [];
    let appearancePaneCleaned = false;
    appearancePaneCleanup = () => {
      if (appearancePaneCleaned) return;
      appearancePaneCleaned = true;
      for (const cleanup of appearanceCleanupCallbacks.splice(0)) {
        try { cleanup(); } catch {}
      }
      appearancePaneCleanup = () => {};
    };
    let primaryColorDraft = normalizePrimaryColor(state.options.primaryColor);
    const colorHexPattern = /^#?[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
    const appearanceTabIds = new Set(["workspace", "frameToast", "topbar", "tabGroup", "tooltips"]);
    if (!appearanceTabIds.has(state.settingsAppearanceTab)) state.settingsAppearanceTab = "workspace";
    const themeMode = select(state.options.themeMode || "system", [
      { value: "system", label: t("appearance.followSystem") },
      { value: "light", label: t("appearance.light") },
      { value: "dark", label: t("appearance.dark") }
    ], {
      onchange: () => {
        const nextThemeMode = themeMode.value || "system";
        queueAppearanceAutoSave({ themeMode: nextThemeMode });
      }
    });
    const language = select(state.options.language || "system", [
      { value: "system", label: t("appearance.followBrowser") },
      { value: "en", label: t("appearance.english") },
      { value: "zh_CN", label: t("appearance.simplifiedChinese") }
    ], {
      onchange: () => {
        const nextLanguage = language.value || "system";
        queueAppearanceAutoSave({ language: nextLanguage }, { redraw });
      }
    });
    const columnCount = select(String(state.options.colMaxCount || 0), [
      { value: "0", label: t("appearance.autoColumns") },
      { value: "1", label: t("appearance.oneColumn") },
      { value: "2", label: t("appearance.columns", { count: 2 }) },
      { value: "3", label: t("appearance.columns", { count: 3 }) },
      { value: "4", label: t("appearance.columns", { count: 4 }) }
    ], {
      onchange: () => {
        const nextColumnCount = Number(columnCount.value) || 0;
        queueAppearanceAutoSave({ colMaxCount: nextColumnCount });
      }
    });
    const normalizePercent = (value, fallback = DEFAULT_OPTIONS.frameLoadingOverlayOpacity) => {
      const number = Number(value);
      return Math.max(0, Math.min(100, Math.round(Number.isFinite(number) ? number : fallback)));
    };
    const overlayOpacityDraft = normalizePercent(state.options.frameLoadingOverlayOpacity);
    const overlayOpacityValue = el("span", { class: "appearance-range-value" }, `${overlayOpacityDraft}%`);
    const overlayOpacitySlider = el("input", {
      class: "appearance-range-slider",
      type: "range",
      min: "0",
      max: "100",
      step: "1",
      value: String(overlayOpacityDraft),
      "aria-label": t("appearance.loadingOverlay")
    });
    const syncOverlayOpacity = () => {
      const nextOpacity = normalizePercent(overlayOpacitySlider.value, overlayOpacityDraft);
      overlayOpacitySlider.value = String(nextOpacity);
      overlayOpacityValue.textContent = `${nextOpacity}%`;
      document.documentElement.style.setProperty("--frame-loading-overlay-opacity", String(nextOpacity / 100));
      queueAppearanceAutoSave({ frameLoadingOverlayOpacity: nextOpacity });
    };
    overlayOpacitySlider.addEventListener("input", syncOverlayOpacity);
    overlayOpacitySlider.addEventListener("change", syncOverlayOpacity);
    if (!state.settingsTabGroupButtonPlacementDraft) {
      state.settingsTabGroupButtonPlacementDraft = normalizeTabGroupButtonPlacement(
        state.options.tabGroupButtonPlacement,
        state.options.tabGroupButtonsMode
      );
    }
    if (!state.settingsTabGroupButtonOrderDraft) {
      state.settingsTabGroupButtonOrderDraft = normalizeTabGroupButtonOrder(state.options.tabGroupButtonOrder);
    }
    const tabGroupButtonPlacement = state.settingsTabGroupButtonPlacementDraft;
    const tabGroupButtonOrder = state.settingsTabGroupButtonOrderDraft;
    const colorPicker = el("input", {
      class: "appearance-color-picker",
      type: "color",
      value: primaryColorDraft,
      title: t("appearance.primaryColor"),
      "aria-label": t("appearance.primaryColor")
    });
    const colorText = input(primaryColorDraft, {
      class: "input appearance-color-text",
      spellcheck: "false",
      inputmode: "text",
      maxlength: "7",
      "aria-label": t("appearance.primaryColor")
    });
    const colorPreview = el("span", {
      class: "appearance-color-preview",
      style: { "--appearance-color": primaryColorDraft },
      "aria-hidden": "true"
    });
    const syncColorDraft = (value, fromPicker = false) => {
      const raw = String(value || "").trim();
      const normalized = normalizePrimaryColor(raw, primaryColorDraft);
      if (fromPicker || colorHexPattern.test(raw)) {
        primaryColorDraft = normalized;
        colorPicker.value = normalized;
        colorText.value = normalized;
        colorPreview.style.setProperty("--appearance-color", normalized);
        queueAppearanceColorSave(normalized);
      } else {
        colorText.value = raw;
      }
    };
    const restoreColorDraft = () => {
      colorPicker.value = primaryColorDraft;
      colorText.value = primaryColorDraft;
      colorPreview.style.setProperty("--appearance-color", primaryColorDraft);
    };
    colorPicker.addEventListener("input", () => syncColorDraft(colorPicker.value, true));
    colorPicker.addEventListener("change", () => syncColorDraft(colorPicker.value, true));
    colorText.addEventListener("input", () => syncColorDraft(colorText.value));
    colorText.addEventListener("blur", () => {
      if (!colorHexPattern.test(String(colorText.value || "").trim())) restoreColorDraft();
    });
    const colorControl = el("div", { class: "appearance-color-control" },
      colorPicker,
      colorText,
      colorPreview,
      el("small", { class: "appearance-color-help" }, t("appearance.primaryColorHelp"))
    );
    const overlayOpacityControl = el("div", { class: "appearance-range-control" },
      overlayOpacitySlider,
      overlayOpacityValue,
      el("small", { class: "appearance-range-help" }, t("appearance.loadingOverlayHelp"))
    );
    const appearanceRow = (node) => el("div", { class: "appearance-field-row" }, node);
    const frameToastPositionBlock = () => {
      let draft = normalizeFrameToastPosition(state.options.frameToastPosition);
      let commitSequence = 0;
      let latestCommitToken = 0;
      let deferredSettlementToken = 0;
      let layoutFrame = 0;
      let dragging = null;
      let keyboardDirty = false;
      let resizeObserver = null;
      const coordinates = el("strong", { class: "frame-toast-position-coordinates" });
      const sample = el("button", {
        class: "frame-toast-position-sample",
        type: "button",
        draggable: "false"
      },
        el("span", { class: "frame-toast-position-sample-icon", "aria-hidden": "true" }),
        el("span", { class: "frame-toast-position-sample-text" }, t("appearance.frameToastPreviewText"))
      );
      const previewBody = el("div", { class: "frame-toast-position-preview-body" }, sample);
      const preview = el("div", { class: "frame-toast-position-preview" },
        el("div", { class: "frame-toast-position-preview-header", "aria-hidden": "true" },
          el("div", { class: "frame-toast-position-preview-tab" },
            el("span", { class: "frame-toast-position-preview-tab-icon" }, svgIcon("apps")),
            el("span", { class: "frame-toast-position-preview-tab-label" }, t("appearance.frameToastPreviewTab"))
          )
        ),
        previewBody
      );

      const axisOffset = (containerSize, itemSize, percent) => {
        const available = Math.max(0, containerSize - itemSize);
        const inset = Math.min(8, available / 2);
        const target = (containerSize * percent / 100) - (itemSize / 2);
        return Math.max(inset, Math.min(available - inset, target));
      };
      const positionEquals = (left, right) => left.x === right.x && left.y === right.y;
      const layoutPreview = () => {
        layoutFrame = 0;
        if (!previewBody.isConnected || !sample.isConnected) return;
        const width = previewBody.clientWidth;
        const height = previewBody.clientHeight;
        const sampleWidth = sample.offsetWidth;
        const sampleHeight = sample.offsetHeight;
        if (width <= 0 || height <= 0 || sampleWidth <= 0 || sampleHeight <= 0) return;
        sample.style.left = `${axisOffset(width, sampleWidth, draft.x)}px`;
        sample.style.top = `${axisOffset(height, sampleHeight, draft.y)}px`;
      };
      const schedulePreviewLayout = () => {
        if (layoutFrame) return;
        layoutFrame = requestAnimationFrame(layoutPreview);
      };
      const syncDraftUi = () => {
        coordinates.textContent = t("appearance.frameToastCoordinates", draft);
        sample.setAttribute("aria-label", `${t("appearance.frameToastPreviewText")}. ${coordinates.textContent}. ${t("appearance.frameToastKeyboardHelp")}`);
        sample.setAttribute("aria-valuetext", coordinates.textContent);
        sample.dataset.x = String(draft.x);
        sample.dataset.y = String(draft.y);
        schedulePreviewLayout();
      };
      function setDraft(value) {
        const next = normalizeFrameToastPosition(value);
        if (positionEquals(next, draft)) return false;
        draft = next;
        syncDraftUi();
        return true;
      }
      function restorePersistedDraft() {
        draft = normalizeFrameToastPosition(state.options.frameToastPosition);
        syncDraftUi();
      }
      function settleCommittedDraft(token) {
        if (token !== latestCommitToken) return;
        if (dragging || keyboardDirty) {
          deferredSettlementToken = token;
          return;
        }
        deferredSettlementToken = 0;
        restorePersistedDraft();
      }
      function settleDeferredDraft() {
        if (!deferredSettlementToken || dragging || keyboardDirty) return;
        const token = deferredSettlementToken;
        deferredSettlementToken = 0;
        settleCommittedDraft(token);
      }
      function commitDraft() {
        const next = normalizeFrameToastPosition(draft);
        const saved = normalizeFrameToastPosition(state.options.frameToastPosition);
        if (positionEquals(next, saved)) {
          deferredSettlementToken = 0;
          syncDraftUi();
          return;
        }
        const token = ++commitSequence;
        latestCommitToken = token;
        deferredSettlementToken = 0;
        queueAppearanceAutoSave({ frameToastPosition: next }, {
          redraw: () => settleCommittedDraft(token)
        });
      }
      const updateDraftFromPointer = (event) => {
        const rect = previewBody.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        setDraft({
          x: Math.round((event.clientX - rect.left) / rect.width * 100),
          y: Math.round((event.clientY - rect.top) / rect.height * 100)
        });
      };
      const updateDraftFromDrag = (event) => {
        if (!dragging || dragging.source !== "sample") {
          updateDraftFromPointer(event);
          return;
        }
        const rect = previewBody.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        setDraft({
          x: dragging.start.x + Math.round((event.clientX - dragging.startClientX) / rect.width * 100),
          y: dragging.start.y + Math.round((event.clientY - dragging.startClientY) / rect.height * 100)
        });
      };
      const finishPointerDrag = (event, cancelled = false) => {
        if (!dragging || event.pointerId !== dragging.pointerId) return;
        if (!cancelled) updateDraftFromDrag(event);
        else setDraft(dragging.start);
        const pointerId = dragging.pointerId;
        dragging = null;
        previewBody.classList.remove("dragging");
        try { previewBody.releasePointerCapture(pointerId); } catch {}
        if (!cancelled) commitDraft();
        else settleDeferredDraft();
      };
      previewBody.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 && event.pointerType !== "touch") return;
        event.preventDefault();
        const source = sample.contains(event.target) ? "sample" : "canvas";
        dragging = {
          pointerId: event.pointerId,
          source,
          start: { ...draft },
          startClientX: event.clientX,
          startClientY: event.clientY
        };
        previewBody.classList.add("dragging");
        previewBody.setPointerCapture?.(event.pointerId);
        if (source === "canvas") updateDraftFromPointer(event);
        sample.focus({ preventScroll: true });
      });
      previewBody.addEventListener("pointermove", (event) => {
        if (!dragging || event.pointerId !== dragging.pointerId) return;
        event.preventDefault();
        updateDraftFromDrag(event);
      });
      previewBody.addEventListener("pointerup", (event) => finishPointerDrag(event));
      previewBody.addEventListener("pointercancel", (event) => finishPointerDrag(event, true));
      previewBody.addEventListener("lostpointercapture", (event) => {
        if (dragging && event.pointerId === dragging.pointerId) finishPointerDrag(event, true);
      });
      const arrowDelta = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1]
      };
      sample.addEventListener("keydown", (event) => {
        const delta = arrowDelta[event.key];
        if (!delta) return;
        event.preventDefault();
        const step = event.shiftKey ? 5 : 1;
        keyboardDirty = setDraft({ x: draft.x + delta[0] * step, y: draft.y + delta[1] * step }) || keyboardDirty;
      });
      sample.addEventListener("keyup", (event) => {
        if (!arrowDelta[event.key] || !keyboardDirty) return;
        keyboardDirty = false;
        commitDraft();
        settleDeferredDraft();
      });
      sample.addEventListener("blur", () => {
        if (!keyboardDirty) return;
        keyboardDirty = false;
        commitDraft();
        settleDeferredDraft();
      });
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(schedulePreviewLayout);
        resizeObserver.observe(previewBody);
        resizeObserver.observe(sample);
      }
      const syncSavedPosition = (event) => {
        if (dragging || keyboardDirty) return;
        draft = normalizeFrameToastPosition(event?.detail || state.options.frameToastPosition);
        syncDraftUi();
      };
      document.addEventListener(FRAME_TOAST_POSITION_EVENT, syncSavedPosition);
      appearanceCleanupCallbacks.push(() => {
        if (layoutFrame) cancelAnimationFrame(layoutFrame);
        layoutFrame = 0;
        resizeObserver?.disconnect?.();
        resizeObserver = null;
        document.removeEventListener(FRAME_TOAST_POSITION_EVENT, syncSavedPosition);
        if (dragging) {
          try { previewBody.releasePointerCapture(dragging.pointerId); } catch {}
          dragging = null;
        }
      });
      syncDraftUi();
      return settingsBlock("", "",
        el("div", { class: "frame-toast-position-editor" },
          el("div", { class: "frame-toast-position-preview-column" },
            preview
          ),
          el("div", { class: "frame-toast-position-details" },
            el("div", { class: "frame-toast-position-copy" },
              el("h4", {}, t("appearance.frameToastPosition")),
              el("p", {}, t("appearance.frameToastPositionDesc"))
            ),
            el("div", { class: "frame-toast-position-readout" },
              coordinates,
              el("small", {}, t("appearance.frameToastDragHelp")),
              el("small", {}, t("appearance.frameToastKeyboardHelp"))
            )
          )
        )
      );
    };
    const saveTooltipToggle = async (targetId, enabled, inputNode) => {
      const current = new Set(state.options.tooltipDisabledIds || []);
      if (enabled) current.delete(targetId);
      else current.add(targetId);
      state.options = await saveOptionsPatch({ tooltipDisabledIds: [...current] });
      inputNode.checked = !(state.options.tooltipDisabledIds || []).includes(targetId);
      document.dispatchEvent(new CustomEvent("chatclub:tooltips-updated"));
    };
    const tooltipPreviewIcon = (targetId) => ({
      "topbar.brand": "brand",
      "topbar.settings": "settings",
      "topbar.promptLibrary": "library",
      "topbar.optimizePrompt": "sparkles",
      "topbar.send": "send",
      "topbar.newChat": "edit",
      "topbar.deleteThread": "trash",
      "topbar.summary": "summary",
      "topbar.pocket": "pocket",
      "topbar.addGroup": "plus",
      "topbar.layout": "layout",
      "topbar.settingsJumpMenu": "moreTools",
      "topbar.settings.appearance": "palette",
      "topbar.settings.profiles": "key",
      "topbar.settings.apps": "apps",
      "topbar.settings.models": "model",
      "topbar.settings.summary": "summary",
      "topbar.settings.messageNavigation": "navigator",
      "topbar.settings.topicDeletion": "trash",
      "topbar.settings.optimize": "sparkles",
      "topbar.settings.prompts": "library",
      "topbar.settings.shortcuts": "keyboard",
      "topbar.settings.io": "transfer",
      "topbar.settings.about": "info",
      "topbar.customize.paletteItem": "grip",
      "topbar.customize.enter": "customizeTopbar",
      "topbar.customize.cancel": "x",
      "workspace.group.addApp": "plus",
      "workspace.group.newChat": "edit",
      "workspace.group.openInNewTab": "external",
      "workspace.group.copyLink": "copy",
      "workspace.group.goToUrl": "link",
      "workspace.group.refreshPage": "reload",
      "workspace.group.reload": "home",
      "workspace.group.messageNavigator": "navigator",
      "workspace.group.deleteThread": "trash",
      "workspace.group.fullscreen": "maximize",
      "workspace.group.remove": "x",
      "workspace.group.more": "more",
      "workspace.tab.close": "x",
      "workspace.layout.add": "plus",
      "workspace.layout.delete": "trash",
      "summary.window.fullscreen": "maximize",
      "summary.window.close": "x",
      "summary.source.refresh": "reload",
      "summary.action.pocket": "pocket",
      "summary.action.preview": "preview",
      "summary.action.summarize": "summary",
      "summary.action.ask": "send",
      "pocket.fullscreen": "maximize",
      "pocket.copyUserMessage": "copy",
      "pocket.copyAssistantMessage": "copy",
      "pocket.openChat": "external",
      "pocket.actions": "more",
      "pocket.focusMode": "focusMode",
      "pocket.exitFocusMode": "insert",
      "pocket.collapseSidebar": "sidebarCollapse",
      "pocket.expandSidebar": "sidebarExpand",
      "pocket.deleteItem": "trash",
      "optimize.retry": "reload",
      "settings.modal.close": "x",
      "settings.profiles.promotion": "external",
      "settings.action.edit": "edit",
      "settings.action.duplicate": "copy",
      "settings.action.delete": "trash",
      "settings.action.reset": "reset",
      "settings.shortcuts.record": "keyboard"
    })[targetId] || "settings";
    const tooltipPreviewButton = (target, disabled) => {
      const label = t(target.labelKey);
      const iconName = tooltipPreviewIcon(target.id);
      const sample = el("button", {
        class: `tooltip-preview-button tooltip-trigger ${disabled ? "tooltip-preview-disabled" : ""} ${iconName === "brand" ? "tooltip-preview-brand" : ""}`.trim(),
        type: "button",
        "aria-label": `${t("appearance.tooltipPreview")}: ${label}`,
        "data-tooltip": label,
        "data-tooltip-id": target.id,
        "data-tooltip-placement": "left",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
        }
      },
        iconName === "brand"
          ? [el("img", { class: "tooltip-preview-brand-logo", src: "icons/logo.svg", alt: "", draggable: "false" }), el("span", {}, "ChatClub")]
          : svgIcon(iconName),
        ["topbar.send", "topbar.newChat", "topbar.summary", "topbar.pocket", "summary.action.summarize", "summary.action.ask"].includes(target.id)
          ? el("span", {}, label)
          : null
      );
      return el("span", { class: "tooltip-preview-cell" }, sample);
    };
    const tooltipToggleRow = (target) => {
      const disabled = (state.options.tooltipDisabledIds || []).includes(target.id);
      const checkbox = el("input", {
        type: "checkbox",
        role: "switch",
        checked: !disabled,
        "aria-label": `${t(target.labelKey)} ${disabled ? t("common.disabled") : t("common.enabled")}`,
        onchange: async (event) => {
          await saveTooltipToggle(target.id, event.target.checked, event.target);
          redraw();
        }
      });
      return el("div", { class: "tooltip-toggle-row" },
        el("span", { class: "tooltip-toggle-copy" },
          el("strong", {}, t(target.labelKey)),
          el("small", {}, target.id)
        ),
        tooltipPreviewButton(target, disabled),
        el("label", { class: "tooltip-toggle-switch" },
          checkbox,
          el("span", {}, t(target.labelKey))
        )
      );
    };
    const tooltipBlock = () => settingsBlock(t("appearance.buttonTooltips"), t("appearance.buttonTooltipsDesc"),
      el("div", { class: "tooltip-settings-list" },
        TOOLTIP_TARGET_GROUPS.map((group) => el("section", { class: "tooltip-settings-group" },
          el("h5", { class: "tooltip-settings-group-title" }, t(group.labelKey)),
          el("div", { class: "tooltip-settings-rows" },
            group.targets.map(tooltipToggleRow)
          )
        ))
      )
    );
    const workspaceBlock = () => settingsBlock(t("appearance.workspace"), t("appearance.workspaceDesc"),
      el("div", { class: "appearance-workspace-layout" },
        el("div", { class: "appearance-field-list appearance-workspace-main" },
          appearanceRow(field(t("appearance.themeMode"), themeMode)),
          appearanceRow(field(t("appearance.language"), language)),
          appearanceRow(field(t("appearance.maxColumns"), columnCount))
        ),
        el("div", { class: "appearance-field-list appearance-workspace-aside" },
          appearanceRow(field(t("appearance.primaryColor"), colorControl)),
          appearanceRow(field(t("appearance.loadingOverlay"), overlayOpacityControl))
        )
      )
    );
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
    const tabGroupConfigurableButtons = () => TAB_GROUP_HEADER_BUTTONS.filter((item) => !item.requiredPinned);
    const tabGroupButtonById = new Map(tabGroupConfigurableButtons().map((item) => [item.id, item]));
    const orderedTabGroupConfigurableButtons = () => normalizeTabGroupButtonOrder(tabGroupButtonOrder)
      .map((id) => tabGroupButtonById.get(id))
      .filter(Boolean);
    const tabGroupButtonsForPlacement = (placement) => orderedTabGroupConfigurableButtons()
      .filter((item) => tabGroupButtonPlacementValue(tabGroupButtonPlacement[item.id] || item.defaultPlacement || "pinned") === placement);
    const renderTabGroupPlacementRow = (item) => el("div", {
      class: `tab-group-button-placement-row ${item.danger ? "is-danger" : ""}`.trim(),
      dataset: { buttonId: item.id },
      draggable: "false",
      onpointerdown: (event) => startTabGroupButtonDrag(event, item, redraw),
      ondragstart: preventTabGroupButtonNativeDrag,
      ondragend: cleanupTabGroupButtonDrag
    },
      settingsDragHandle(tabGroupButtonLabel(item.id)),
      el("span", { class: "tab-group-button-placement-icon", "aria-hidden": "true" }, svgIcon(item.icon)),
      el("span", { class: "tab-group-button-placement-copy" },
        el("strong", {}, tabGroupButtonLabel(item.id))
      )
    );
    const tabGroupPlacementTitle = (placement) => placement === "menu"
      ? el("span", { class: "tab-group-button-placement-title" }, svgIcon("more"), el("span", {}, t("chat.more")))
      : placement === "hidden"
        ? el("span", { class: "tab-group-button-placement-title" }, svgIcon("x"), el("span", {}, t("appearance.tabGroupButtonsHidden")))
        : el("span", { class: "tab-group-button-placement-title" }, svgIcon("layout"), el("span", {}, t("appearance.tabGroupButtonsPinned")));
    const tabGroupPlacementZone = (placement, items, emptyText) => el("section", {
      class: `tab-group-button-placement-panel is-${placement}`,
      "aria-label": placement === "menu"
        ? t("chat.more")
        : placement === "hidden"
          ? t("appearance.tabGroupButtonsHidden")
          : t("appearance.tabGroupButtonsPinned")
    },
      tabGroupPlacementTitle(placement),
      el("div", {
        class: `tab-group-button-placement-zone is-${placement}`,
        "data-placement": placement,
        ondragover: preventTabGroupButtonNativeDrag,
        ondrop: preventTabGroupButtonNativeDrag
      },
        items.length
          ? items.map(renderTabGroupPlacementRow)
          : el("div", { class: "tab-group-button-placement-empty" }, emptyText)
      )
    );
    const tabGroupBlock = () => settingsBlock(t("appearance.tabGroup"), t("appearance.tabGroupDesc"),
      el("div", { class: "appearance-field-list" },
        el("p", { class: "settings-muted-help" }, t("appearance.tabGroupButtonsHelp")),
        el("div", { class: "tab-group-button-placement-list" },
          tabGroupPlacementZone("pinned", tabGroupButtonsForPlacement("pinned"), t("appearance.tabGroupDropPinned")),
          tabGroupPlacementZone("menu", tabGroupButtonsForPlacement("menu"), t("appearance.tabGroupDropMenu")),
          tabGroupPlacementZone("hidden", tabGroupButtonsForPlacement("hidden"), t("appearance.tabGroupDropHidden"))
        )
      )
    );
    const activeAppearancePane = state.settingsAppearanceTab === "frameToast"
      ? frameToastPositionBlock()
      : state.settingsAppearanceTab === "topbar"
        ? appearanceTopbar.pane(redraw)
        : state.settingsAppearanceTab === "tabGroup"
          ? tabGroupBlock()
          : state.settingsAppearanceTab === "tooltips"
            ? tooltipBlock()
            : workspaceBlock();
    return el("div", { class: "settings-pane appearance-settings-pane" },
      settingsInnerTabs([
        ["workspace", t("appearance.workspace"), t("appearance.workspaceTabDesc")],
        ["topbar", t("topbar.customize.title"), t("topbar.customize.tabDesc")],
        ["tabGroup", t("appearance.tabGroup"), t("appearance.tabGroupTabDesc")],
        ["tooltips", t("appearance.buttonTooltips"), t("appearance.buttonTooltipsTabDesc")],
        ["frameToast", t("appearance.frameToastTab"), t("appearance.frameToastTabDesc")]
      ], state.settingsAppearanceTab, (id) => {
        state.settingsAppearanceTab = id;
        redraw();
      }),
      activeAppearancePane
    );
  }

  function flushAutosave() {
    appearanceAutosave.flush();
  }

  function autosaveBusy() {
    return appearanceAutosave.busy();
  }

  function autosaveFailed() {
    return appearanceAutosave.failed();
  }

  function clearAutosaveState() {
    appearanceAutosave.clear();
  }

  function cleanupPane() {
    appearancePaneCleanup();
  }

  function reset() {
    state.settingsAppearanceTab = "workspace";
    state.settingsAppearanceTopbarTab = "placeholder";
    state.settingsTopbarPromptPlaceholderDraft = "";
    state.settingsTopbarPromptPlaceholderEditingIndex = -1;
    state.settingsTopbarPromptPlaceholderDragIndex = "";
    state.settingsTabGroupButtonPlacementDraft = null;
    state.settingsTabGroupButtonOrderDraft = null;
    state.settingsTabGroupButtonDragId = "";
    state.topbarEditLayoutDraft = null;
    cleanupTabGroupButtonDrag();
    cleanupPane();
  }

  return Object.freeze({
    afterImport: syncTopbarPromptPlaceholder,
    autosaveBusy,
    autosaveFailed,
    clearAutosaveState,
    cleanupPane,
    flushAutosave,
    pane: appearancePane,
    reset
  });
}
