import {
  DEFAULT_OPTIONS,
  TOOLTIP_TARGET_GROUPS
} from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import {
  normalizeFrameToastPosition,
  normalizePrimaryColor
} from "../../shared/storage-schema.js";
import { el, input, select } from "../../ui/dom.js";
import { FRAME_TOAST_POSITION_EVENT } from "../../ui/frame-toast.js";
import { createSettingsKit } from "./kit.js";
import { createAppearanceAutosave } from "./appearance-autosave.js";
import { createModelSelectionOverlayAppearanceControls } from "./appearance-model-selection-overlay.js";
import { createAppearanceTabGroupController } from "./appearance-tab-group.js";
import { createAppearanceTopbarController } from "./appearance-topbar.js";
import { APPEARANCE_WORKSPACE_TAB_IDS, createAppearanceWorkspacePane } from "./appearance-workspace.js";
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
    syncPreferredModelSelectionOverlays: "function",
    enterTopbarEditMode: "function",
    closeSettingsDialog: "function"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    [
      "options",
      "settingsAppearancePrimaryColorDraft",
      "settingsAppearanceTab",
      "settingsAppearanceTopbarTab",
      "settingsAppearanceWorkspaceTab",
      "settingsTabContextMenuDragId",
      "settingsTabContextMenuHiddenIdsDraft",
      "settingsTabContextMenuOrderDraft",
      "settingsTabGroupButtonDragId",
      "settingsTabGroupButtonOrderDraft",
      "settingsTabGroupButtonPlacementDraft",
      "settingsTabGroupTab",
      "settingsTabsSidebarButtonDragId",
      "settingsTabsSidebarButtonOrderDraft",
      "settingsTabsSidebarButtonPlacementDraft",
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
  const syncPreferredModelSelectionOverlays = requireControllerFunction(
    ctx,
    controllerName,
    "syncPreferredModelSelectionOverlays"
  );
  const enterTopbarEditMode = requireControllerFunction(ctx, controllerName, "enterTopbarEditMode");
  const closeSettingsDialog = requireControllerFunction(ctx, controllerName, "closeSettingsDialog");
  const {
    settingsBlock,
    settingsInnerTabs
  } = createSettingsKit({ svgIcon });

  let appearancePaneCleanup = () => {};
  const appearanceAutosave = createAppearanceAutosave({
    state,
    saveOptionsPatch,
    applyTheme,
    syncI18nLanguage,
    syncTopbar,
    syncWorkspaceDom,
    syncSummaryPanel,
    syncPreferredModelSelectionOverlays
  });
  const queueAppearanceAutoSave = appearanceAutosave.queue;
  const queueAppearanceColorSave = appearanceAutosave.queueColor;
  const appearanceTopbar = createAppearanceTopbarController({
    state,
    svgIcon,
    saveOptionsPatch,
    queueAppearanceAutoSave,
    syncTopbarPromptPlaceholder,
    enterTopbarEditMode,
    closeSettingsDialog
  });
  const appearanceTabGroup = createAppearanceTabGroupController({
    state,
    svgIcon,
    queueAppearanceAutoSave
  });

  function appearancePane(redraw = () => {}) {
    const appearanceCleanupCallbacks = [];
    let appearancePaneCleaned = false;
    appearancePaneCleanup = () => {
      if (appearancePaneCleaned) return;
      appearancePaneCleaned = true;
      appearanceTabGroup.cleanup();
      for (const cleanup of appearanceCleanupCallbacks.splice(0)) {
        try { cleanup(); } catch {}
      }
      appearancePaneCleanup = () => {};
    };
    let primaryColorDraft = normalizePrimaryColor(state.settingsAppearancePrimaryColorDraft || state.options.primaryColor);
    state.settingsAppearancePrimaryColorDraft = primaryColorDraft;
    const colorHexPattern = /^#?[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
    const appearanceTabIds = new Set(["workspace", "frameToast", "topbar", "tabGroup", "tooltips"]);
    if (!appearanceTabIds.has(state.settingsAppearanceTab)) state.settingsAppearanceTab = "workspace";
    if (!APPEARANCE_WORKSPACE_TAB_IDS.includes(state.settingsAppearanceWorkspaceTab)) {
      state.settingsAppearanceWorkspaceTab = "general";
    }
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
    const selectionOverlayControls = createModelSelectionOverlayAppearanceControls({
      state, queueAppearanceAutoSave, syncPreferredModelSelectionOverlays, redraw
    });
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
        state.settingsAppearancePrimaryColorDraft = primaryColorDraft = normalized;
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
      "topbar.workspaceTabs": "sidebarCollapse",
      "topbar.brand": "brand",
      "topbar.settings": "settings",
      "topbar.search": "search",
      "topbar.promptActions": "plus",
      "topbar.promptLibrary": "library",
      "topbar.addPhotos": "paperclip",
      "topbar.clearPrompt": "x",
      "topbar.removeImage": "x",
      "topbar.optimizePrompt": "sparkles",
      "topbar.modelGateStatus": "model",
      "topbar.send": "send",
      "topbar.newChat": "edit",
      "topbar.deleteThread": "trash",
      "topbar.summary": "summary",
      "topbar.share": "share",
      "topbar.pocket": "pocket",
      "topbar.history": "history",
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
      "topbar.settings.rules": "fileCog",
      "topbar.settings.optimize": "sparkles",
      "topbar.settings.prompts": "library",
      "topbar.settings.promptHistory": "history",
      "topbar.settings.shortcuts": "keyboard",
      "topbar.settings.io": "transfer",
      "topbar.settings.functionalAnomalies": "alert",
      "topbar.settings.about": "info",
      "topbar.customize.paletteItem": "grip",
      "topbar.customize.enter": "customizeTopbar",
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
      "workspace.tab.context.close": "x",
      "workspace.tabs.pin": "pin",
      "workspace.tabs.edit": "edit",
      "workspace.tabs.delete": "trash",
      "workspace.tabs.more": "more",
      "workspace.tabs.closeOthers": "copyMinus",
      "workspace.tabs.newFolder": "folderPlus",
      "workspace.tabs.sort": "arrowUpDown",
      "workspace.tabs.sortViewed": "arrowUpDown",
      "workspace.tabs.sortEdited": "arrowUpDown",
      "workspace.tabs.sortCreated": "arrowUpDown",
      "workspace.tabs.sortOpen": "arrowUpDown",
      "workspace.tabs.sortName": "arrowUpDown",
      "workspace.tabs.renameFolder": "edit",
      "workspace.tabs.deleteFolder": "trash",
      "workspace.layout.add": "plus",
      "workspace.layout.delete": "trash",
      "appPicker.addCustom": "plus",
      "summary.window.fullscreen": "maximize",
      "summary.window.close": "x",
      "summary.source.refresh": "reload",
      "summary.action.pocket": "pocket",
      "summary.action.preview": "preview",
      "summary.action.summarize": "summary",
      "summary.action.ask": "send",
      "share.window.fullscreen": "maximize",
      "share.window.close": "x",
      "share.action.capture": "preview",
      "share.action.stop": "x",
      "share.action.copy": "copy",
      "share.action.download": "fileDown",
      "share.action.open": "external",
      "pocket.fullscreen": "maximize",
      "pocket.copyUserMessage": "copy",
      "pocket.copyAssistantMessage": "copy",
      "pocket.openChat": "external",
      "pocket.actions": "more",
      "pocket.focusMode": "focusMode",
      "pocket.sidebar": "sidebarCollapse",
      "pocket.deleteItem": "trash",
      "history.action.pocket": "pocket",
      "optimize.retry": "reload",
      "settings.modal.fullscreen": "maximize",
      "settings.modal.close": "x",
      "settings.profiles.promotion": "external",
      "settings.action.view": "preview",
      "settings.action.edit": "edit",
      "settings.action.duplicate": "copy",
      "settings.action.delete": "trash",
      "settings.action.reset": "reset",
      "settings.action.insert": "insert",
      "settings.action.copy": "copy",
      "settings.shortcuts.record": "keyboard",
      "settings.shortcuts.help": "info",
      "settings.apps.iframe.scopeHelp": "info",
      "settings.apps.iframe.edit": "edit",
      "settings.apps.iframe.reset": "reload",
      "settings.apps.iframe.removeAttribute": "trash",
      "settings.models.allSources": "info"
    })[targetId] || "settings";
    const tooltipPreviewButton = (target, disabled) => {
      const label = t(target.labelKey);
      const iconName = tooltipPreviewIcon(target.id);
      const sample = el("button", {
        class: `tooltip-preview-button ${disabled ? "tooltip-preview-disabled" : "tooltip-trigger"} ${iconName === "brand" ? "tooltip-preview-brand" : ""}`.trim(),
        type: "button",
        "aria-label": `${t("appearance.tooltipPreview")}: ${label}`,
        "data-tooltip": disabled ? null : label,
        "data-tooltip-id": disabled ? null : target.id,
        "data-tooltip-placement": disabled ? null : "left",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
        }
      },
        iconName === "brand"
          ? [el("img", { class: "tooltip-preview-brand-logo", src: "icons/logo.svg", alt: "", draggable: "false" }), el("span", {}, "ChatClub")]
          : svgIcon(iconName),
        ["topbar.send", "topbar.newChat", "topbar.summary", "topbar.pocket", "topbar.history", "summary.action.summarize", "summary.action.ask"].includes(target.id)
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
    const workspaceBlock = () => createAppearanceWorkspacePane({
      activeId: state.settingsAppearanceWorkspaceTab,
      colorControl, columnCount, language, overlayOpacityControl, selectionOverlayControls,
      settingsBlock, settingsInnerTabs, themeMode,
      onSelect: (id) => {
        state.settingsAppearanceWorkspaceTab = id;
        redraw();
      }
    });
    const activeAppearancePane = state.settingsAppearanceTab === "frameToast"
      ? frameToastPositionBlock()
      : state.settingsAppearanceTab === "topbar"
        ? appearanceTopbar.pane(redraw)
        : state.settingsAppearanceTab === "tabGroup"
          ? appearanceTabGroup.pane(redraw)
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
    appearanceTabGroup.reset();
    state.topbarEditLayoutDraft = null;
    cleanupPane();
  }

  return Object.freeze({
    afterImport: () => { state.settingsAppearancePrimaryColorDraft = ""; syncTopbarPromptPlaceholder(); },
    autosaveBusy,
    autosaveFailed,
    clearAutosaveState,
    cleanupPane,
    flushAutosave,
    pane: appearancePane,
    reset
  });
}
