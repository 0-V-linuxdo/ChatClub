#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

const NOTION_MODEL_CASES = Object.freeze([
  Object.freeze({ id: "auto", settingsLabel: "Auto", menuLabel: "Auto" }),
  Object.freeze({ id: "sonnet46", settingsLabel: "Claude Sonnet 4.6", menuLabel: "Sonnet 4.6" }),
  Object.freeze({ id: "sonnet5", settingsLabel: "Claude Sonnet 5", menuLabel: "Sonnet 5" }),
  Object.freeze({ id: "opus47", settingsLabel: "Claude Opus 4.7", menuLabel: "Opus 4.7" }),
  Object.freeze({ id: "opus48", settingsLabel: "Claude Opus 4.8", menuLabel: "Opus 4.8" }),
  Object.freeze({ id: "opus5", settingsLabel: "Claude Opus 5", menuLabel: "Opus 5" }),
  Object.freeze({ id: "fable5", settingsLabel: "Claude Fable 5", menuLabel: "Fable 5" }),
  Object.freeze({ id: "gemini31pro", settingsLabel: "Gemini 3.1 Pro", menuLabel: "Gemini 3.1 Pro" }),
  Object.freeze({ id: "gemini35flash", settingsLabel: "Gemini 3.5 Flash", menuLabel: "Gemini 3.5 Flash" }),
  Object.freeze({ id: "gpt56sol", settingsLabel: "GPT-5.6 Sol", menuLabel: "GPT-5.6 Sol" }),
  Object.freeze({ id: "gpt56terra", settingsLabel: "GPT-5.6 Terra", menuLabel: "GPT-5.6 Terra" }),
  Object.freeze({ id: "gpt52", settingsLabel: "GPT-5.2", menuLabel: "GPT-5.2" }),
  Object.freeze({ id: "gpt54", settingsLabel: "GPT-5.4", menuLabel: "GPT-5.4" }),
  Object.freeze({ id: "gpt55", settingsLabel: "GPT-5.5", menuLabel: "GPT-5.5" }),
  Object.freeze({ id: "grok43", settingsLabel: "Grok 4.3", menuLabel: "Grok 4.3" }),
  Object.freeze({ id: "grok45", settingsLabel: "Grok 4.5", menuLabel: "Grok 4.5" }),
  Object.freeze({ id: "grokBuild01", settingsLabel: "Grok Build 0.1", menuLabel: "Grok Build 0.1" }),
  Object.freeze({ id: "kimi26", settingsLabel: "Kimi K2.6", menuLabel: "Kimi K2.6" }),
  Object.freeze({ id: "kimi27code", settingsLabel: "Kimi K2.7 Code", menuLabel: "Kimi K2.7 Code" }),
  Object.freeze({ id: "kimi3", settingsLabel: "Kimi K3", menuLabel: "Kimi K3" }),
  Object.freeze({ id: "deepseekV4Pro", settingsLabel: "DeepSeek V4 Pro", menuLabel: "DeepSeek V4 Pro" }),
  Object.freeze({ id: "glm52", settingsLabel: "GLM 5.2", menuLabel: "GLM 5.2" })
]);

function rect(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function element(id, options = {}) {
  const attributes = { ...(options.attributes || {}) };
  const node = {
    id,
    nodeType: 1,
    tagName: options.tagName || "DIV",
    className: options.className || attributes.class || "",
    innerText: options.text || "",
    textContent: options.text || "",
    parentElement: options.parentElement || null,
    children: [],
    box: options.box || rect(0, 0, 100, 32),
    getAttribute(name) {
      return attributes[name] || "";
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    hasAttribute(name) {
      return Object.hasOwn(attributes, name);
    },
    getBoundingClientRect() {
      return this.box;
    },
    contains(other) {
      for (let current = other; current; current = current.parentElement) {
        if (current === this) return true;
      }
      return false;
    },
    querySelectorAll() {
      const descendants = [];
      const visit = (current) => {
        for (const child of current?.children || []) {
          descendants.push(child);
          visit(child);
        }
      };
      visit(this);
      return descendants;
    },
    closest() {
      return null;
    }
  };
  if (node.parentElement?.children) node.parentElement.children.push(node);
  return node;
}

function createFixture({
  triggerAvailable = true,
  triggerText = "GPT-5.4",
  triggerTestId = "unified-chat-model-button",
  triggerControls = "model-menu",
  duplicateTrigger = false,
  preOpenUnrelatedMenu = false,
  duplicateOpenedMenu = false,
  distractorAvailable = false,
  composerAvailable = false,
  composerButtonAvailable = false,
  itemAvailable = true,
  targetLabel = "Gemini 3.1 Pro",
  itemDescription = "",
  itemClass = "",
  itemDisabled = false,
  duplicateItem = false,
  structuralTargetDuplicate = false,
  decorativeRightSvg = false,
  rightMarker = null,
  itemBecomesAvailableDuringWait = false,
  targetBecomesCurrentDuringItemWait = false,
  targetBecomesCurrentOnDismiss = false,
  triggerHydrationTexts = [],
  onTriggerWait = null,
  abortDuringTriggerHydration = false,
  modelMenuCloseFails = false,
  itemSelectionSettles = true,
  liveModelPicker = false,
  effortTriggerAvailable = false,
  effortTriggerText = "Change effort, currently low",
  effortItemLabel = "Medium",
  effortSelectionSettles = true
} = {}) {
  let triggerHydrationIndex = 0;
  const state = {
    menuOpen: false,
    triggerText,
    waitCalls: [],
    sleepCalls: 0,
    composerWideScans: 0,
    modelTriggerSelectorScans: 0,
    triggerClicks: 0,
    distractorTriggerClicks: 0,
    distractorClicks: 0,
    composerButtonClicks: 0,
    itemClicks: 0,
    effortTriggerClicks: 0,
    effortItemClicks: 0,
    effortMenuOpen: false,
    effortTriggerText,
    effortSelectionSettles,
    itemAvailable,
    sequence: 0,
    activeRun: null
  };
  const menu = element("model-menu", {
    attributes: { role: liveModelPicker ? "dialog" : "menu" },
    text: liveModelPicker
      ? `Auto\nFor your hardest tasks\n${targetLabel}`
      : `Select a model\nAuto\n${targetLabel}`,
    box: rect(620, 300, 320, 360)
  });
  const trigger = element("model-trigger", {
    tagName: "DIV",
    attributes: {
      ...(liveModelPicker ? {} : {
        "data-testid": triggerTestId,
        "aria-controls": triggerControls
      }),
      "aria-haspopup": "dialog",
      role: "button"
    },
    text: triggerText,
    box: rect(700, 700, 136, 28)
  });
  const secondTrigger = duplicateTrigger ? element("second-model-trigger", {
    tagName: "DIV",
    attributes: {
      "data-testid": triggerTestId,
      "aria-controls": "second-model-menu",
      "aria-haspopup": "dialog",
      role: "button"
    },
    text: triggerText,
    box: rect(500, 620, 136, 28)
  }) : null;
  const unrelatedMenu = preOpenUnrelatedMenu ? element("unrelated-model-menu", {
    attributes: { role: "menu" },
    text: `Select a model\nAuto\n${targetLabel}`,
    box: rect(40, 120, 320, 360)
  }) : null;
  const secondOpenedMenu = duplicateOpenedMenu ? element("second-opened-model-menu", {
    attributes: { role: "menu" },
    text: `Select a model\nAuto\n${targetLabel}`,
    box: rect(260, 220, 320, 360)
  }) : null;
  const distractor = element("unrelated-model-settings", {
    tagName: "BUTTON",
    attributes: { "aria-label": "Model settings", role: "button" },
    text: "Model settings",
    box: rect(820, 740, 150, 32)
  });
  const composer = element("notion-composer", {
    attributes: {
      "data-placeholder": "Do anything with AI...",
      contenteditable: "true",
      role: "textbox"
    },
    box: rect(300, 640, 620, 130)
  });
  const composerButton = element("notion-send-button", {
    tagName: "BUTTON",
    attributes: { "aria-label": "Send", role: "button" },
    text: "Send",
    parentElement: composer,
    box: rect(850, 720, 44, 36)
  });
  const effortMenu = element("notion-effort-menu", {
    attributes: { role: "menu" },
    text: `Effort\nLow\nMedium\nHigh`,
    box: rect(500, 420, 260, 220)
  });
  const effortTrigger = element("notion-effort-trigger", {
    tagName: "DIV",
    attributes: {
      "data-testid": "unified-chat-reasoning-effort-button",
      "aria-controls": "notion-effort-menu",
      "aria-label": effortTriggerText,
      "aria-haspopup": "dialog",
      role: "button"
    },
    text: "",
    parentElement: composer,
    box: rect(540, 700, 44, 32)
  });
  const effortItem = element("target-effort-item", {
    tagName: "BUTTON",
    attributes: { role: "menuitem" },
    text: effortItemLabel,
    parentElement: effortMenu,
    box: rect(520, 470, 220, 42)
  });
  const effortItemLabelNode = element("target-effort-label", {
    tagName: "SPAN",
    text: effortItemLabel,
    parentElement: effortItem,
    box: rect(536, 478, 120, 20)
  });
  const item = element("target-model-item", {
    tagName: liveModelPicker ? "DIV" : "BUTTON",
    attributes: liveModelPicker
      ? { role: "menuitem" }
      : { role: "menuitem", "aria-label": targetLabel },
    className: itemClass,
    text: itemDescription ? `${targetLabel}\nBeta\n${itemDescription}` : targetLabel,
    parentElement: menu,
    box: rect(640, 420, 280, liveModelPicker ? 28 : 40)
  });
  const itemLabel = element("target-model-label", {
    tagName: "SPAN",
    text: targetLabel,
    parentElement: item,
    box: rect(660, 426, 160, 20)
  });
  const markerConfig = rightMarker || (decorativeRightSvg ? { tagName: "SVG" } : null);
  const decorativeMarker = markerConfig ? element("target-model-decoration", {
    tagName: markerConfig.tagName || "DIV",
    attributes: markerConfig.attributes || {},
    className: markerConfig.className || "",
    text: markerConfig.text || "",
    parentElement: item,
    box: rect(890, 430, 16, 16)
  }) : null;
  const duplicate = duplicateItem ? element("duplicate-target-model-item", {
    tagName: liveModelPicker ? "DIV" : "BUTTON",
    attributes: liveModelPicker
      ? { role: "menuitem" }
      : { role: "menuitem", "aria-label": targetLabel },
    text: targetLabel,
    parentElement: menu,
    box: rect(640, 466, 280, liveModelPicker ? 28 : 40)
  }) : null;
  const duplicateLabel = duplicate ? element("duplicate-target-model-label", {
    tagName: "SPAN",
    text: targetLabel,
    parentElement: duplicate,
    box: rect(660, 472, 160, 20)
  }) : null;
  const structuralTargetDuplicateNode = structuralTargetDuplicate ? element("structural-target-model-duplicate", {
    tagName: "DIV",
    text: targetLabel,
    parentElement: menu,
    box: rect(640, 514, 280, 40)
  }) : null;

  const setTriggerText = (value) => {
    state.triggerText = String(value || "");
    trigger.innerText = state.triggerText;
    trigger.textContent = state.triggerText;
  };

  const selectorText = (selectors) => (Array.isArray(selectors) ? selectors : [selectors]).join(" ");
  const visible = (node) => {
    if (node === menu) return state.menuOpen;
    if (node === effortMenu) return state.effortMenuOpen;
    if (node === unrelatedMenu) return true;
    if (node === secondOpenedMenu) return state.menuOpen;
    if (node === item || node === itemLabel || node === decorativeMarker) return state.menuOpen && state.itemAvailable;
    if (node === duplicate || node === duplicateLabel) return state.menuOpen && state.itemAvailable;
    if (node === trigger || node === secondTrigger) return triggerAvailable;
    if (node === effortTrigger) return effortTriggerAvailable;
    if (node === effortItem || node === effortItemLabelNode) return state.effortMenuOpen;
    return Boolean(node);
  };
  const visibleSelectorElements = (selectors, queryRoot = global.document) => {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    const value = selectorText(selectors);
    if (queryRoot === global.document && value.includes("div")) state.composerWideScans += 1;
    if (queryRoot === global.document && value.includes('[role="button"][aria-haspopup="dialog"]')) {
      state.modelTriggerSelectorScans += 1;
    }
    if (queryRoot === menu) {
      return state.menuOpen && state.itemAvailable
        ? [item, itemLabel, duplicate, duplicateLabel, structuralTargetDuplicateNode].filter(Boolean)
        : [];
    }
    if (queryRoot === effortMenu) {
      return state.effortMenuOpen ? [effortItem, effortItemLabelNode] : [];
    }
    if (queryRoot === item) {
      return state.menuOpen && state.itemAvailable ? [decorativeMarker].filter(Boolean) : [];
    }
    if (value.includes("role=\"menu\"") || value.includes("role=\"listbox\"") || value.includes("role=\"dialog\"") || value.includes("role='menu'")) {
      return [
        state.menuOpen ? menu : null,
        state.effortMenuOpen ? effortMenu : null,
        unrelatedMenu,
        state.menuOpen ? secondOpenedMenu : null
      ].filter(Boolean);
    }
    if (
      value.includes('[data-testid="unified-chat-reasoning-effort-button"]')
    ) {
      return effortTriggerAvailable ? [effortTrigger] : [];
    }
    if (
      value.includes('[data-testid="agent-chat-model-button"]')
      || value.includes('[data-testid="unified-chat-model-button"]')
    ) {
      if (trigger.getAttribute("data-testid")) {
        return triggerAvailable ? [trigger, secondTrigger].filter(Boolean) : [];
      }
      if (selectorList.length <= 2) return [];
    }
    if (value.includes('[role="button"][aria-haspopup="dialog"]')) {
      return triggerAvailable ? [trigger] : [];
    }
    if (value.includes("textarea") && value.includes("contenteditable")) {
      return composerAvailable ? [composer] : [];
    }
    if (value.includes("unified-chat-model-button") || value.includes("aria-label*=") || value.includes("button")) {
      const candidates = [];
      if (triggerAvailable) candidates.push(trigger);
      if (triggerAvailable && secondTrigger) candidates.push(secondTrigger);
      if (distractorAvailable) candidates.push(distractor);
      if (composerButtonAvailable) candidates.push(composerButton);
      return candidates;
    }
    return [];
  };
  const modelElementText = (node) => {
    if (!node) return "";
    return [
      node.getAttribute?.("aria-label"),
      node.getAttribute?.("data-testid"),
      node.innerText || node.textContent || ""
    ].filter(Boolean).join(" ");
  };
  const modelRect = (node) => visible(node) ? node?.box || null : null;
  const preferredModelResult = (context, ok, appId, modelId, reason = "", extra = {}) => ({
    ...extra,
    ok,
    appId,
    modelId,
    reason,
    runId: context.runId,
    interactionCount: context.interactionCount,
    retryable: Boolean(extra.retryable)
      && (
        context.interactionCount === 0
        || (
          extra.retryableBeforeSelection === true
          && extra.selectionActivated !== true
          && extra.menuClosed === true
        )
      )
  });
  const abortActivePreferredModelRun = (reason, runId = "") => {
    const active = state.activeRun;
    if (!active || (runId && active.runId !== runId)) return false;
    active.abortReason = reason;
    active.abortKind = reason.includes("timed out") ? "timeout" : "cancel";
    active.controller.abort(reason);
    return true;
  };
  const assertPreferredModelRun = (context) => {
    if (!context?.signal?.aborted) return;
    const error = new Error(context.abortReason || "preferred model apply cancelled");
    error.preferredModelCancelled = true;
    throw error;
  };
  return {
    state,
    dependencies: {
      normalize: (value) => String(value || "").replace(/\s+/g, " ").trim(),
      modelElementText,
      visibleSelectorElements,
      modelRect,
      visible,
      isDisabledElement: (node) => itemDisabled && (node === item || node === duplicate),
      assertPreferredModelRun,
      preferredModelActivate(context, target) {
        assertPreferredModelRun(context);
        context.interactionCount += 1;
        if (target === trigger) {
          state.triggerClicks += 1;
          state.menuOpen = true;
          return true;
        }
        if (target === secondTrigger) {
          throw new Error("an ambiguous second exact Notion model trigger must never be activated");
        }
        if (target === distractor) {
          state.distractorClicks += 1;
          return true;
        }
        if (target === composerButton) {
          state.composerButtonClicks += 1;
          return true;
        }
        if (target === effortTrigger) {
          state.effortTriggerClicks += 1;
          state.effortMenuOpen = true;
          return true;
        }
        if (target === effortItem) {
          state.effortItemClicks += 1;
          if (effortSelectionSettles) {
            state.effortTriggerText = `Change effort, currently ${String(effortItemLabel || "").toLowerCase()}`;
            effortTrigger.setAttribute("aria-label", state.effortTriggerText);
          }
          state.effortMenuOpen = false;
          return true;
        }
        assert.equal(target, item, "only the exact requested Notion model row may be activated");
        state.itemClicks += 1;
        if (itemSelectionSettles) setTriggerText(targetLabel);
        state.menuOpen = false;
        return true;
      },
      async waitForPreferredModel(context, getter, timeoutMs, intervalMs) {
        assertPreferredModelRun(context);
        state.waitCalls.push({ timeoutMs, intervalMs });
        if (intervalMs === 150) onTriggerWait?.();
        if (intervalMs === 80 && timeoutMs <= 600) {
          const immediate = getter();
          if (immediate) return immediate;
          if (abortDuringTriggerHydration) {
            context.abortReason = "trigger hydration test cancelled";
            context.abortKind = "cancel";
            context.controller.abort(context.abortReason);
            assertPreferredModelRun(context);
          }
          while (triggerHydrationIndex < triggerHydrationTexts.length) {
            setTriggerText(triggerHydrationTexts[triggerHydrationIndex++]);
            const hydrated = getter();
            if (hydrated) return hydrated;
          }
        }
        if (timeoutMs === 800) {
          const immediate = getter();
          if (immediate) return immediate;
          if (itemBecomesAvailableDuringWait) state.itemAvailable = true;
          if (targetBecomesCurrentDuringItemWait) setTriggerText(targetLabel);
        }
        return getter();
      },
      modelElementArea: (node) => node?.box ? node.box.width * node.box.height : 0,
      async preferredModelSleep() {
        state.sleepCalls += 1;
      },
      async dismissPreferredModelMenu(_context, getter) {
        if (getter() && !modelMenuCloseFails) {
          state.menuOpen = false;
          state.effortMenuOpen = false;
        }
        if (targetBecomesCurrentOnDismiss) setTriggerText(targetLabel);
        return !getter();
      },
      preferredModelResult,
      alnumModelToken: (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, ""),
      closest: () => null,
      applyGeminiPreferredModel: async () => ({ ok: false }),
      applyGrokPreferredModel: async () => ({ ok: false }),
      abortActivePreferredModelRun,
      nextPreferredModelBridgeRunSequence: () => ++state.sequence,
      preferredModelState: state,
      publishPreferredModelBridgeRun(context) {
        context.bridgeToken = `notion-test-${context.bridgeGeneration}`;
      },
      preferredModelCancelled: (context) => Boolean(context?.signal?.aborted),
      preferredModelAbortReason: (context) => context?.abortReason || "preferred model apply cancelled",
      releasePreferredModelBridgeRun() {},
      modelResult: (ok, appId, modelId, reason = "", extra = {}) => ({ ok, appId, modelId, reason, ...extra })
    }
  };
}

function createSourcesFixture({
  triggerAvailable = true,
  duplicateTrigger = false,
  composerAvailable = true,
  useAriaFallback = false,
  fallbackDistractor = false,
  mySourcesAvailable = true,
  allSourcesAvailable = true,
  toggleAvailable = true,
  ambiguousToggle = false,
  toggleStateReadable = true,
  initialState = false,
  toggleChanges = true,
  toggleClosesMenus = false,
  closeMenusFail = false,
  mySourcesRowActivationWorks = true,
  mySourcesOpenAfterWaitPolls = 0,
  rightSideChildOpens = false,
  escapeCloseTarget = "root",
  settingsEscapeIgnored = false,
  submenuEscapeClosePolls = 0,
  submenuEscapeCloseDelayMs = 0,
  submenuNestedInSettings = false,
  residualClosedSubmenuPortal = false,
  collapsedAriaWhileOpen = false,
  settingsTriggerClosePolls = 0,
  triggerIgnoredWhileSubmenuOpen = false,
  duplicateAllSourcesOverlay = false,
  duplicateAllSourcesRow = false,
  toggleInSeparateRow = false,
  nestedClone = false,
  cloneState = null,
  switchOverlayAfterStateReads = 0,
  stateSequence = [],
  preopenAllSources = false,
  transparentInputToggle = false,
  transparentInputPointerEventsNone = false,
  transparentToggleProxy = true,
  decoratedMySourcesRow = false,
  legacyTrigger = false,
  abortAfterSourcesPhase = "",
  baselineSettingsOpen = false,
  modelPreference = false,
  modelInitialText = "GPT-5.4",
  modelItemDisabled = false,
  sourceTriggerMinWaitMs = 0,
  sourceTriggerMinWaitMsAfterModelSelection = 0,
  sourceToggleResetsModel = false,
  modelSelectionResetsSource = false,
  pointerSourceToggleNoop = false,
  replaceAllSourcesChildrenAfterStateReads = 0,
  replaceAllSourcesChildrenAfterToggle = false,
  replacementAllSourcesState = null,
  settingsControlsMode = "exact",
  directAllSources = false,
  settingsRootText = "",
  duplicateSettingsMenu = false,
  replaceSettingsRootAfterStateReads = 0,
  documentEscapeListener = false,
  escapeActiveElementInsideRoot = false,
  sourceIndicatorAvailable = null,
  sourceIndicatorReadable = true,
  sourceDisabledIconAvailable = true,
  sourceIndicatorDisabledLabel = "No sources",
  sourceIndicatorEnabledLabel = "All sources I can access",
  sourceIndicatorInitialState = null,
  sourceIndicatorUpdates = true,
  sourceIndicatorUpdateAfterReads = 0,
  sourceIndicatorReplacementAfterReads = 0,
  sourceIndicatorReplacementState = null,
  sourceIndicatorStateSequence = [],
  duplicateSourceIndicator = false,
  duplicateSourceDisabledIconAvailable = true,
  nonSourceMenuControl = false,
  contextMenuPopup = "menu",
  disabledIconOnNonSourceControl = false,
  preopenSettings = false,
  preopenSettingsAfterIndicatorScans = 0,
  narrowComposer = false
} = {}) {
  const state = {
    settingsOpen: preopenSettings,
    submenuOpen: preopenAllSources,
    allSourcesEnabled: initialState,
    stateSequence: [...stateSequence],
    triggerClicks: 0,
    distractorTriggerClicks: 0,
    mySourcesClicks: 0,
    mySourcesChildClicks: 0,
    toggleClicks: 0,
    pointerSourceToggleClicks: 0,
    secondToggleClicks: 0,
    dismissCalls: 0,
    waitCalls: [],
    sleepCalls: 0,
    sequence: 0,
    stateReadCount: 0,
    escapeDispatches: 0,
    submenuGeneration: 0,
    submenuEscapeGenerations: [],
    submenuCloseScheduledGeneration: 0,
    pendingSubmenuClosePolls: 0,
    pendingSettingsClosePolls: 0,
    pendingMySourcesOpenPolls: 0,
    residualSubmenuPresent: false,
    residualSubmenuClosed: false,
    submenuEscapeClosePolls,
    settingsTriggerClosePolls,
    cloneActive: false,
    abortAfterSourcesPhase,
    abortPhaseTriggered: false,
    baselineSettingsOpen,
    baselineEscapeDispatches: 0,
    modelMenuOpen: false,
    modelTriggerText: modelInitialText,
    modelTriggerClicks: 0,
    modelItemClicks: 0,
    replacementToggleClicks: 0,
    childReplacementActive: false,
    sourceTriggerWaitBudget: 0,
    sourceTriggerWaitBudgets: [],
    settingsRootReplacementPending: false,
    settingsRootReplacementScans: 0,
    settingsRootReplacementActive: false,
    documentEscapeDispatches: 0,
    baselineGlobalCloseCount: 0,
    sourceIndicatorEnabled: sourceIndicatorInitialState === null
      ? Boolean(initialState)
      : Boolean(sourceIndicatorInitialState),
    sourceIndicatorReadCount: 0,
    sourceIndicatorScanCount: 0,
    sourceIndicatorReadsSincePending: 0,
    sourceIndicatorPendingState: null,
    sourceIndicatorReplacementActive: false,
    sourceIndicatorStateSequence: [...sourceIndicatorStateSequence],
    activeRun: null
  };
  const effectiveSettingsRootText = settingsRootText || (
    directAllSources ? "All sources" : "My sources 3 Personalize"
  );
  const settingsMenuWrapper = element("settings-menu-wrapper", {
    attributes: { "data-floating-ui-portal": "" },
    text: effectiveSettingsRootText,
    box: rect(490, 300, 340, 320)
  });
  const settingsMenu = element("settings-menu", {
    attributes: { role: "menu" },
    text: effectiveSettingsRootText,
    parentElement: settingsControlsMode === "wrapper" ? settingsMenuWrapper : null,
    box: rect(500, 320, 320, 280)
  });
  const replacementSettingsMenu = element("replacement-settings-menu", {
    attributes: { role: "menu" },
    text: effectiveSettingsRootText,
    parentElement: settingsControlsMode === "wrapper" ? settingsMenuWrapper : null,
    box: rect(500, 320, 320, 280)
  });
  const staleSettingsMenu = element("stale-settings-menu", {
    attributes: { role: "menu" },
    text: "Unrelated menu",
    box: rect(40, 80, 220, 160)
  });
  const duplicateSettingsMenuNode = element("duplicate-settings-menu", {
    attributes: { role: "menu" },
    text: "My sources duplicate",
    box: rect(120, 280, 300, 240)
  });
  const submenuPortal = element("sources-submenu-portal", {
    attributes: { "data-floating-ui-portal": "" },
    parentElement: submenuNestedInSettings ? settingsMenu : null,
    box: rect(820, 320, 300, 180)
  });
  const originalSubmenuPortalGetAttribute = submenuPortal.getAttribute.bind(submenuPortal);
  const originalSubmenuPortalHasAttribute = submenuPortal.hasAttribute.bind(submenuPortal);
  submenuPortal.getAttribute = (name) => {
    if (name === "aria-hidden") return state.residualSubmenuClosed ? "true" : "false";
    if (name === "data-state") return state.residualSubmenuClosed ? "closed" : "open";
    return originalSubmenuPortalGetAttribute(name);
  };
  submenuPortal.hasAttribute = (name) => (
    name === "inert"
      ? state.residualSubmenuClosed
      : originalSubmenuPortalHasAttribute(name)
  );
  Object.defineProperty(submenuPortal, "inert", {
    configurable: true,
    get: () => state.residualSubmenuClosed
  });
  submenuPortal.style = {};
  Object.defineProperty(submenuPortal.style, "opacity", {
    configurable: true,
    get: () => state.residualSubmenuClosed ? "0" : "1"
  });
  const submenu = element("sources-submenu", {
    attributes: { role: "menu" },
    text: "All sources I can access",
    parentElement: residualClosedSubmenuPortal
      ? submenuPortal
      : (submenuNestedInSettings ? settingsMenu : null),
    box: rect(820, 320, 300, 180)
  });
  const baselineSettingsMenu = element("baseline-settings-menu", {
    attributes: { role: "menu" },
    text: "My sources archive",
    box: rect(80, 240, 260, 220)
  });
  const composer = element("notion-source-composer", {
    attributes: { role: "textbox", contenteditable: "true", "data-placeholder": "Do anything with AI..." },
    text: "Do anything with AI...",
    box: narrowComposer ? rect(16, 620, 276, 130) : rect(120, 620, 780, 130)
  });
  const sourceIndicator = element("notion-source-indicator", {
    tagName: "DIV",
    attributes: {
      role: "button",
      "aria-haspopup": "menu"
    },
    parentElement: composer,
    box: narrowComposer ? rect(240, 700, 36, 36) : rect(740, 700, 36, 36)
  });
  const replacementSourceIndicator = element("notion-source-indicator-replacement", {
    tagName: "DIV",
    attributes: {
      role: "button",
      "aria-haspopup": "menu"
    },
    parentElement: composer,
    box: narrowComposer ? rect(240, 700, 36, 36) : rect(740, 700, 36, 36)
  });
  const duplicateSourceIndicatorNode = element("notion-source-indicator-duplicate", {
    tagName: "DIV",
    attributes: {
      role: "button",
      "aria-haspopup": "menu"
    },
    parentElement: composer,
    box: narrowComposer ? rect(196, 700, 36, 36) : rect(786, 700, 36, 36)
  });
  const contextMenuControl = element("notion-context-menu-control", {
    tagName: "DIV",
    attributes: {
      "data-testid": "unified-chat-plus-menu-button",
      role: "button",
      "aria-label": "Give context",
      "aria-haspopup": contextMenuPopup
    },
    parentElement: composer,
    box: narrowComposer ? rect(48, 700, 36, 36) : rect(220, 700, 36, 36)
  });
  const createSourceDisabledIcon = (id, parentElement) => {
    const icon = element(id, {
      tagName: "SVG",
      attributes: { role: "graphics-symbol" },
      parentElement,
      box: rect(parentElement.box.left + 8, parentElement.box.top + 8, 20, 20)
    });
    icon.className = "teamspaceSlashSmall";
    return icon;
  };
  const sourceDisabledIcon = createSourceDisabledIcon("notion-source-disabled-icon", sourceIndicator);
  const contextMenuDisabledIcon = disabledIconOnNonSourceControl
    ? createSourceDisabledIcon("notion-context-menu-disabled-icon", contextMenuControl)
    : null;
  const replacementSourceDisabledIcon = createSourceDisabledIcon(
    "notion-source-disabled-icon-replacement",
    replacementSourceIndicator
  );
  const duplicateSourceDisabledIcon = createSourceDisabledIcon(
    "notion-source-disabled-icon-duplicate",
    duplicateSourceIndicatorNode
  );
  const readSourceIndicatorState = (node) => {
    state.sourceIndicatorReadCount += 1;
    state.sourceIndicatorReadsSincePending += 1;
    if (
      state.sourceIndicatorPendingState !== null
      && state.sourceIndicatorReadsSincePending >= Math.max(1, sourceIndicatorUpdateAfterReads)
    ) {
      state.sourceIndicatorEnabled = state.sourceIndicatorPendingState;
      state.sourceIndicatorPendingState = null;
    }
    if (node === replacementSourceIndicator && sourceIndicatorReplacementState !== null) {
      return Boolean(sourceIndicatorReplacementState);
    }
    return state.sourceIndicatorEnabled;
  };
  const sourceIndicatorLabel = (node) => {
    if (!sourceIndicatorReadable) return "Sources";
    return readSourceIndicatorState(node) ? sourceIndicatorEnabledLabel : sourceIndicatorDisabledLabel;
  };
  for (const indicator of [sourceIndicator, replacementSourceIndicator, duplicateSourceIndicatorNode]) {
    const originalGetAttribute = indicator.getAttribute.bind(indicator);
    indicator.getAttribute = (name) => name === "aria-label"
      ? sourceIndicatorLabel(indicator)
      : originalGetAttribute(name);
  }
  const trigger = element("sources-trigger", {
    tagName: "BUTTON",
    attributes: {
      ...(useAriaFallback ? {} : {
        "data-testid": legacyTrigger
          ? "unified-chat-search-scope-button"
          : "unified-chat-mode-menu-button"
      }),
      "aria-label": "Settings",
      "aria-haspopup": "dialog",
      ...(settingsControlsMode === "missing" ? {} : {
        "aria-controls": settingsControlsMode === "stale"
          ? "stale-settings-menu"
          : (settingsControlsMode === "wrapper" ? "settings-menu-wrapper" : "settings-menu")
      }),
      ...(collapsedAriaWhileOpen ? { "aria-expanded": "false" } : {}),
      role: "button"
    },
    parentElement: composer,
    box: narrowComposer ? rect(28, 700, 36, 36) : rect(180, 700, 36, 36)
  });
  const secondTrigger = element("duplicate-sources-trigger", {
    tagName: "BUTTON",
    attributes: {
      ...(!useAriaFallback && duplicateTrigger ? { "data-testid": "unified-chat-mode-menu-button" } : {}),
      "aria-label": "Settings",
      role: "button"
    },
    box: rect(240, 700, 36, 36)
  });
  const modelMenu = element("notion-model-menu", {
    attributes: { role: "menu" },
    text: "Select a model\nAuto\nGemini 3.1 Pro",
    box: rect(520, 260, 320, 360)
  });
  const modelTrigger = element("notion-model-trigger", {
    tagName: "BUTTON",
    attributes: {
      "data-testid": "unified-chat-model-button",
      "aria-controls": "notion-model-menu",
      "aria-haspopup": "dialog",
      role: "button"
    },
    text: modelInitialText,
    parentElement: composer,
    box: narrowComposer ? rect(76, 700, 150, 32) : rect(600, 700, 150, 32)
  });
  const modelItem = element("notion-gemini-model-item", {
    tagName: "BUTTON",
    attributes: { role: "menuitem" },
    text: "Gemini 3.1 Pro",
    parentElement: modelMenu,
    box: rect(540, 360, 280, 42)
  });
  const setModelTriggerText = (value) => {
    state.modelTriggerText = String(value || "");
    modelTrigger.innerText = state.modelTriggerText;
    modelTrigger.textContent = state.modelTriggerText;
  };
  const mySourcesRow = element("my-sources-row", {
    tagName: "BUTTON",
    attributes: {
      role: "menuitem",
      ...(decoratedMySourcesRow ? { "aria-label": "Open My sources" } : {})
    },
    text: "My sources 3",
    parentElement: settingsMenu,
    box: rect(520, 370, 280, 42)
  });
  const mySourcesLabel = element("my-sources-label", {
    tagName: "SPAN",
    text: "My sources 3",
    parentElement: mySourcesRow,
    box: rect(532, 378, 160, 26)
  });
  const mySourcesRightChild = element("my-sources-right-child", {
    tagName: "BUTTON",
    attributes: { role: "button", "aria-label": "Open My sources" },
    parentElement: mySourcesRow,
    box: rect(756, 378, 32, 26)
  });
  const allSourcesRow = element("all-sources-row", {
    tagName: "DIV",
    attributes: {},
    text: directAllSources ? "All sources" : "All sources I can access",
    parentElement: directAllSources ? settingsMenu : submenu,
    box: rect(840, 360, 260, toggleInSeparateRow ? 88 : 44)
  });
  const allSourcesLabel = element("all-sources-label", {
    tagName: "SPAN",
    text: directAllSources ? "All sources" : "All sources I can access",
    parentElement: allSourcesRow,
    box: rect(850, 364, 170, 36)
  });
  const unrelatedToggleRow = element("unrelated-toggle-row", {
    tagName: "DIV",
    text: "Some other source",
    parentElement: allSourcesRow,
    box: rect(840, 408, 260, 36)
  });
  const toggleTrack = element("all-sources-toggle-track", {
    tagName: "DIV",
    parentElement: toggleInSeparateRow ? unrelatedToggleRow : allSourcesRow,
    box: toggleInSeparateRow ? rect(1040, 414, 44, 24) : rect(1040, 370, 44, 24)
  });
  const toggle = element("all-sources-toggle", {
    tagName: transparentInputToggle ? "INPUT" : "BUTTON",
    attributes: {
      role: "switch",
      ...(transparentInputToggle ? { type: "checkbox" } : {})
    },
    parentElement: transparentInputToggle && transparentToggleProxy
      ? toggleTrack
      : (toggleInSeparateRow ? unrelatedToggleRow : allSourcesRow),
    box: toggleInSeparateRow ? rect(1040, 414, 44, 24) : rect(1040, 370, 44, 24)
  });
  if (transparentInputPointerEventsNone) {
    const styleDocument = {
      defaultView: {
        getComputedStyle(node) {
          return {
            display: "block",
            visibility: "visible",
            opacity: node === toggle ? "0" : "1",
            pointerEvents: node === toggle ? "none" : "auto"
          };
        }
      }
    };
    toggle.ownerDocument = styleDocument;
    toggleTrack.ownerDocument = styleDocument;
  }
  if (transparentInputToggle) {
    toggle.type = "checkbox";
    Object.defineProperty(toggle, "checked", {
      configurable: true,
      get() {
      state.stateReadCount += 1;
      if (state.stateSequence.length) state.allSourcesEnabled = Boolean(state.stateSequence.shift());
      if (
        replaceSettingsRootAfterStateReads > 0
        && state.stateReadCount >= replaceSettingsRootAfterStateReads
      ) state.settingsRootReplacementPending = true;
      return state.allSourcesEnabled;
      }
    });
  }
  const secondToggle = element("second-all-sources-toggle", {
    tagName: "BUTTON",
    attributes: { role: "switch" },
    parentElement: allSourcesRow,
    box: rect(990, 370, 44, 24)
  });
  const duplicateAllSourcesRowNode = element("duplicate-all-sources-row", {
    tagName: "DIV",
    attributes: { role: "menuitem" },
    text: "All sources I can access",
    parentElement: submenu,
    box: rect(840, 414, 260, 44)
  });
  const duplicateRowToggle = element("duplicate-row-toggle", {
    tagName: "INPUT",
    attributes: { role: "switch", type: "checkbox" },
    parentElement: duplicateAllSourcesRowNode,
    box: rect(1040, 424, 30, 18)
  });
  duplicateRowToggle.type = "checkbox";
  duplicateRowToggle.checked = initialState;
  const replacementAllSourcesRow = element("replacement-all-sources-row", {
    tagName: "DIV",
    text: "All sources I can access",
    parentElement: submenu,
    box: rect(840, 360, 260, 44)
  });
  const replacementAllSourcesLabel = element("replacement-all-sources-label", {
    tagName: "SPAN",
    text: "All sources I can access",
    parentElement: replacementAllSourcesRow,
    box: rect(850, 364, 170, 36)
  });
  const replacementToggle = element("replacement-all-sources-toggle", {
    tagName: "BUTTON",
    attributes: { role: "switch" },
    parentElement: replacementAllSourcesRow,
    box: rect(1040, 370, 44, 24)
  });
  const replacementToggleGetAttribute = replacementToggle.getAttribute.bind(replacementToggle);
  replacementToggle.getAttribute = (name) => name === "aria-checked"
    ? ((replacementAllSourcesState === null ? state.allSourcesEnabled : Boolean(replacementAllSourcesState)) ? "true" : "false")
    : replacementToggleGetAttribute(name);
  const cloneSubmenu = element("clone-sources-submenu", {
    attributes: { role: "menu" },
    text: "All sources I can access",
    parentElement: nestedClone ? submenu : null,
    box: rect(420, 320, 300, 180)
  });
  const cloneAllSourcesRow = element("clone-all-sources-row", {
    tagName: "DIV",
    attributes: { role: "menuitem" },
    text: "All sources I can access",
    parentElement: cloneSubmenu,
    box: rect(440, 360, 260, 44)
  });
  const cloneToggle = element("clone-all-sources-toggle", {
    tagName: "INPUT",
    attributes: { role: "switch", type: "checkbox" },
    parentElement: cloneAllSourcesRow,
    box: rect(640, 370, 30, 18)
  });
  cloneToggle.type = "checkbox";
  cloneToggle.checked = cloneState === null ? initialState : Boolean(cloneState);
  const originalToggleGetAttribute = toggle.getAttribute.bind(toggle);
  toggle.getAttribute = (name) => {
    if (name === "aria-checked") {
      if (!toggleStateReadable || transparentInputToggle) return "";
      state.stateReadCount += 1;
      if (state.stateSequence.length) state.allSourcesEnabled = Boolean(state.stateSequence.shift());
      const value = state.allSourcesEnabled ? "true" : "false";
      if (switchOverlayAfterStateReads > 0 && state.stateReadCount >= switchOverlayAfterStateReads) state.cloneActive = true;
      if (
        replaceAllSourcesChildrenAfterStateReads > 0
        && state.stateReadCount >= replaceAllSourcesChildrenAfterStateReads
      ) state.childReplacementActive = true;
      if (
        replaceSettingsRootAfterStateReads > 0
        && state.stateReadCount >= replaceSettingsRootAfterStateReads
      ) state.settingsRootReplacementPending = true;
      return value;
    }
    return originalToggleGetAttribute(name);
  };
  const originalSecondToggleGetAttribute = secondToggle.getAttribute.bind(secondToggle);
  secondToggle.getAttribute = (name) => (
    name === "aria-checked"
      ? (state.allSourcesEnabled ? "true" : "false")
      : originalSecondToggleGetAttribute(name)
  );
  const abortSourcesPhase = (phase) => {
    if (state.abortPhaseTriggered || state.abortAfterSourcesPhase !== phase) return false;
    const active = state.activeRun;
    if (!active) return false;
    state.abortPhaseTriggered = true;
    active.abortReason = `preferred model ${phase} test cancelled`;
    active.abortKind = "cancel";
    active.controller.abort(active.abortReason);
    return true;
  };
  const closeFromEscape = (target, event) => {
    state.escapeDispatches += 1;
    if (closeMenusFail || escapeCloseTarget !== "root" || event?.key !== "Escape") return true;
    if (target === submenu || target === cloneSubmenu) {
      if (event?.type === "keydown") {
        state.submenuEscapeGenerations.push(state.submenuGeneration);
      }
      if (submenuEscapeCloseDelayMs > 0) {
        const generation = state.submenuGeneration;
        if (event?.type === "keydown" && state.submenuCloseScheduledGeneration !== generation) {
          state.submenuCloseScheduledGeneration = generation;
          setTimeout(() => {
            if (state.submenuGeneration === generation) state.submenuOpen = false;
            if (state.submenuCloseScheduledGeneration === generation) {
              state.submenuCloseScheduledGeneration = 0;
            }
          }, submenuEscapeCloseDelayMs);
        }
      } else if (state.submenuEscapeClosePolls > 0) {
        state.pendingSubmenuClosePolls = state.submenuEscapeClosePolls;
      } else {
        state.submenuOpen = false;
        if (residualClosedSubmenuPortal) {
          state.residualSubmenuPresent = true;
          state.residualSubmenuClosed = true;
        }
      }
    }
    if ((target === settingsMenu || target === replacementSettingsMenu) && !settingsEscapeIgnored) {
      state.settingsOpen = false;
    }
    abortSourcesPhase("close");
    return true;
  };
  const dispatchDocumentEscape = (event, ownedAtDispatch = false) => {
    if (!documentEscapeListener || event?.key !== "Escape" || event?.type !== "keydown") return true;
    state.documentEscapeDispatches += 1;
    if (ownedAtDispatch) return true;
    if (state.submenuOpen) state.submenuOpen = false;
    else if (state.settingsOpen) state.settingsOpen = false;
    else if (state.baselineSettingsOpen) {
      state.baselineSettingsOpen = false;
      state.baselineGlobalCloseCount += 1;
    }
    return true;
  };
  const dispatchOwnedEscape = (target, event) => {
    const ownedAtDispatch = target === submenu || target === cloneSubmenu
      ? state.submenuOpen
      : state.settingsOpen;
    const dispatched = closeFromEscape(target, event);
    dispatchDocumentEscape(event, ownedAtDispatch);
    return dispatched;
  };
  settingsMenu.dispatchEvent = (event) => dispatchOwnedEscape(settingsMenu, event);
  replacementSettingsMenu.dispatchEvent = (event) => dispatchOwnedEscape(replacementSettingsMenu, event);
  submenu.dispatchEvent = (event) => dispatchOwnedEscape(submenu, event);
  cloneSubmenu.dispatchEvent = (event) => dispatchOwnedEscape(cloneSubmenu, event);
  allSourcesLabel.dispatchEvent = (event) => dispatchOwnedEscape(submenu, event);
  baselineSettingsMenu.dispatchEvent = () => {
    state.baselineEscapeDispatches += 1;
    return true;
  };

  const selectorText = (selectors) => (Array.isArray(selectors) ? selectors : [selectors]).join(" ");
  const pollClosures = () => {
    if (state.pendingMySourcesOpenPolls > 0) {
      state.pendingMySourcesOpenPolls -= 1;
      if (state.pendingMySourcesOpenPolls === 0) state.submenuOpen = true;
    }
    if (state.pendingSubmenuClosePolls > 0) {
      state.pendingSubmenuClosePolls -= 1;
      if (state.pendingSubmenuClosePolls === 0) state.submenuOpen = false;
    }
    if (state.pendingSettingsClosePolls > 0) {
      state.pendingSettingsClosePolls -= 1;
      if (state.pendingSettingsClosePolls === 0) {
        state.settingsOpen = false;
        state.submenuOpen = false;
      }
    }
  };
  const visible = (node) => {
    const sourceIndicatorRendered = sourceIndicatorAvailable === null
      ? !state.sourceIndicatorEnabled
      : Boolean(sourceIndicatorAvailable);
    if (node === sourceIndicator) {
      return sourceIndicatorRendered && !state.sourceIndicatorReplacementActive;
    }
    if (node === replacementSourceIndicator) {
      return sourceIndicatorRendered && state.sourceIndicatorReplacementActive;
    }
    if (node === duplicateSourceIndicatorNode) {
      return sourceIndicatorRendered && duplicateSourceIndicator;
    }
    if (node === contextMenuControl) return nonSourceMenuControl;
    if (node === sourceDisabledIcon) {
      return sourceDisabledIconAvailable && visible(sourceIndicator) && !state.sourceIndicatorEnabled;
    }
    if (node === contextMenuDisabledIcon) {
      return sourceDisabledIconAvailable && visible(contextMenuControl) && !state.sourceIndicatorEnabled;
    }
    if (node === replacementSourceDisabledIcon) {
      const enabled = sourceIndicatorReplacementState === null
        ? state.sourceIndicatorEnabled
        : Boolean(sourceIndicatorReplacementState);
      return sourceDisabledIconAvailable && visible(replacementSourceIndicator) && !enabled;
    }
    if (node === duplicateSourceDisabledIcon) {
      return sourceDisabledIconAvailable
        && duplicateSourceDisabledIconAvailable
        && visible(duplicateSourceIndicatorNode)
        && !state.sourceIndicatorEnabled;
    }
    if (node === trigger) {
      const minimumWaitMs = state.modelItemClicks > 0
        ? sourceTriggerMinWaitMsAfterModelSelection
        : sourceTriggerMinWaitMs;
      return triggerAvailable && (
        minimumWaitMs <= 0
        || state.sourceTriggerWaitBudget > minimumWaitMs
      );
    }
    if (node === secondTrigger) return triggerAvailable && (duplicateTrigger || fallbackDistractor);
    if (node === modelTrigger) return modelPreference;
    if (node === modelMenu) return modelPreference && state.modelMenuOpen;
    if (node === modelItem) return modelPreference && state.modelMenuOpen;
    if (node === settingsMenu) return state.settingsOpen && !state.settingsRootReplacementActive;
    if (node === replacementSettingsMenu) return state.settingsOpen && state.settingsRootReplacementActive;
    if (node === settingsMenuWrapper) return state.settingsOpen;
    if (node === duplicateSettingsMenuNode) return state.settingsOpen && duplicateSettingsMenu;
    if (node === staleSettingsMenu) return true;
    if (node === mySourcesRow || node === mySourcesLabel) {
      return state.settingsOpen
        && !state.settingsRootReplacementActive
        && (![mySourcesRow, mySourcesLabel].includes(node) || mySourcesAvailable);
    }
    if (node === mySourcesRightChild) {
      return state.settingsOpen
        && !state.settingsRootReplacementActive
        && mySourcesAvailable
        && rightSideChildOpens;
    }
    if (node === submenu) {
      return (state.submenuOpen || state.residualSubmenuPresent)
        && !(state.cloneActive && !duplicateAllSourcesOverlay);
    }
    if (node === allSourcesRow || node === allSourcesLabel || node === toggleTrack || node === toggle || node === secondToggle) {
      const allSourcesSurfaceOpen = directAllSources
        ? state.settingsOpen && !state.settingsRootReplacementActive
        : state.submenuOpen;
      if (!allSourcesSurfaceOpen || state.childReplacementActive || (state.cloneActive && !duplicateAllSourcesOverlay)) return false;
      if (node === allSourcesRow || node === allSourcesLabel) return allSourcesAvailable;
      if (node === toggleTrack) return allSourcesAvailable && toggleAvailable && (!transparentInputToggle || transparentToggleProxy);
      if (node === toggle) return allSourcesAvailable && toggleAvailable && !transparentInputToggle;
      if (node === secondToggle) return allSourcesAvailable && toggleAvailable && ambiguousToggle;
      return true;
    }
    if (node === duplicateAllSourcesRowNode || node === duplicateRowToggle) {
      return state.submenuOpen && !state.cloneActive && duplicateAllSourcesRow;
    }
    if (node === replacementAllSourcesRow || node === replacementAllSourcesLabel || node === replacementToggle) {
      return state.submenuOpen && state.childReplacementActive;
    }
    if (node === unrelatedToggleRow) return state.submenuOpen && !state.cloneActive && toggleInSeparateRow;
    if (node === cloneSubmenu || node === cloneAllSourcesRow || node === cloneToggle) {
      return state.submenuOpen && (duplicateAllSourcesOverlay || state.cloneActive);
    }
    if (node === baselineSettingsMenu) return state.baselineSettingsOpen;
    return Boolean(node);
  };
  const visibleSelectorElements = (selectors, queryRoot = global.document) => {
    pollClosures();
    const value = selectorText(selectors);
    const out = [];
    const add = (node) => {
      if (node && visible(node) && !out.includes(node)) out.push(node);
    };
    const scanSourceIndicator = () => {
      state.sourceIndicatorScanCount += 1;
      if (
        preopenSettingsAfterIndicatorScans > 0
        && state.sourceIndicatorScanCount >= preopenSettingsAfterIndicatorScans
      ) state.settingsOpen = true;
      if (state.sourceIndicatorStateSequence.length) {
        state.sourceIndicatorEnabled = Boolean(state.sourceIndicatorStateSequence.shift());
      }
      if (state.sourceIndicatorPendingState !== null) {
        state.sourceIndicatorReadsSincePending += 1;
        if (state.sourceIndicatorReadsSincePending >= Math.max(1, sourceIndicatorUpdateAfterReads)) {
          state.sourceIndicatorEnabled = state.sourceIndicatorPendingState;
          state.sourceIndicatorPendingState = null;
        }
      }
      if (
        sourceIndicatorReplacementAfterReads > 0
        && state.sourceIndicatorScanCount >= sourceIndicatorReplacementAfterReads
      ) state.sourceIndicatorReplacementActive = true;
    };
    if (queryRoot === global.document) {
      if (value.includes("teamspaceSlashSmall") || value.includes("graphics-symbol")) {
        scanSourceIndicator();
        add(sourceDisabledIcon);
        add(contextMenuDisabledIcon);
        add(replacementSourceDisabledIcon);
        add(duplicateSourceDisabledIcon);
        return out;
      }
      if (
        value.includes('aria-haspopup="menu"')
        || value.includes("aria-haspopup='menu'")
        || value.includes("No sources")
        || value.includes("Web search only")
        || value.includes("All sources I can access")
        || value.includes("[aria-label]")
      ) {
        scanSourceIndicator();
        if (value.includes('unified-chat-search-scope-button') && trigger.getAttribute("data-testid")) add(trigger);
        add(sourceIndicator);
        add(replacementSourceIndicator);
        add(duplicateSourceIndicatorNode);
        add(contextMenuControl);
        return out;
      }
      if (
        (value.includes('unified-chat-mode-menu-button') || value.includes('unified-chat-search-scope-button'))
        && !value.includes('aria-label="Settings"')
      ) {
        if (trigger.getAttribute("data-testid")) add(trigger);
        if (secondTrigger.getAttribute("data-testid")) add(secondTrigger);
        return out;
      }
      if (
        value.includes('[data-testid="agent-chat-model-button"]')
        || value.includes('[data-testid="unified-chat-model-button"]')
      ) {
        add(modelTrigger);
        return out;
      }
      if (value.includes("textarea") && value.includes("contenteditable")) {
        if (composerAvailable) add(composer);
        return out;
      }
      if (value.includes('aria-label="Settings"') || value.includes('title="Settings"')) {
        add(trigger);
        if (fallbackDistractor) add(secondTrigger);
        return out;
      }
      if (value.includes('[role="menu"]') || value.includes('[role="listbox"]') || value.includes("data-radix")) {
        if (state.settingsRootReplacementPending && !state.settingsRootReplacementActive) {
          state.settingsRootReplacementScans += 1;
          if (state.settingsRootReplacementScans >= 2) state.settingsRootReplacementActive = true;
        }
        add(baselineSettingsMenu);
        add(modelMenu);
        if (settingsControlsMode === "wrapper") add(settingsMenuWrapper);
        add(settingsMenu);
        add(replacementSettingsMenu);
        add(duplicateSettingsMenuNode);
        add(submenu);
        add(cloneSubmenu);
        return out;
      }
      return out;
    }
    if (queryRoot === composer) {
      scanSourceIndicator();
      if (value.includes("teamspaceSlashSmall") || value.includes("graphics-symbol")) {
        add(sourceDisabledIcon);
        add(contextMenuDisabledIcon);
        add(replacementSourceDisabledIcon);
        add(duplicateSourceDisabledIcon);
      } else {
        add(sourceIndicator);
        add(replacementSourceIndicator);
        add(duplicateSourceIndicatorNode);
      }
      add(contextMenuControl);
    }
    if (queryRoot === sourceIndicator) add(sourceDisabledIcon);
    if (queryRoot === contextMenuControl) add(contextMenuDisabledIcon);
    if (queryRoot === replacementSourceIndicator) add(replacementSourceDisabledIcon);
    if (queryRoot === duplicateSourceIndicatorNode) add(duplicateSourceDisabledIcon);
    if (queryRoot === settingsMenu) {
      add(mySourcesLabel);
      add(mySourcesRow);
      if (directAllSources) {
        add(allSourcesLabel);
        add(allSourcesRow);
        add(toggleTrack);
        add(toggle);
        add(secondToggle);
      }
    }
    if (queryRoot === settingsMenuWrapper) {
      add(settingsMenu);
      add(mySourcesLabel);
      add(mySourcesRow);
      if (directAllSources) {
        add(allSourcesLabel);
        add(allSourcesRow);
        add(toggleTrack);
        add(toggle);
        add(secondToggle);
      }
    }
    if (queryRoot === modelMenu) add(modelItem);
    if (queryRoot === submenu) {
      add(allSourcesLabel);
      add(allSourcesRow);
      add(unrelatedToggleRow);
      add(toggle);
      add(secondToggle);
      add(duplicateAllSourcesRowNode);
      add(duplicateRowToggle);
      add(replacementAllSourcesLabel);
      add(replacementAllSourcesRow);
      add(replacementToggle);
    }
    if (queryRoot === allSourcesRow) {
      add(toggle);
      add(secondToggle);
    }
    if (queryRoot === unrelatedToggleRow) add(toggle);
    if (queryRoot === duplicateAllSourcesRowNode) add(duplicateRowToggle);
    if (queryRoot === replacementAllSourcesRow) add(replacementToggle);
    if (queryRoot === cloneSubmenu) {
      add(cloneAllSourcesRow);
      add(cloneToggle);
    }
    if (queryRoot === cloneAllSourcesRow) add(cloneToggle);
    return out;
  };
  const modelElementText = (node) => node === modelTrigger ? state.modelTriggerText : [
    node?.getAttribute?.("aria-label"),
    node?.getAttribute?.("title"),
    node?.innerText || node?.textContent || ""
  ].filter(Boolean).join(" ");
  const scheduleSourceIndicatorState = (enabled) => {
    if (!sourceIndicatorUpdates) return;
    if (sourceIndicatorReplacementAfterReads > 0) {
      state.sourceIndicatorScanCount = 0;
      state.sourceIndicatorReplacementActive = false;
    }
    if (sourceIndicatorUpdateAfterReads > 0) {
      state.sourceIndicatorPendingState = Boolean(enabled);
      state.sourceIndicatorReadsSincePending = 0;
      return;
    }
    state.sourceIndicatorEnabled = Boolean(enabled);
    state.sourceIndicatorPendingState = null;
  };
  const modelRect = (node) => visible(node) ? node?.box || null : null;
  const assertPreferredModelRun = (context) => {
    if (!context?.signal?.aborted) return;
    const error = new Error(context.abortReason || "preferred model apply cancelled");
    error.preferredModelCancelled = true;
    throw error;
  };
  const preferredModelResult = (context, ok, appId, modelId, reason = "", extra = {}) => ({
    ...extra,
    ok,
    appId,
    modelId,
    reason,
    runId: context.runId,
    interactionCount: context.interactionCount,
    retryable: Boolean(extra.retryable) && context.interactionCount === 0
  });
  const activateSourcesTrigger = (target) => {
      state.triggerClicks += 1;
      if (target === secondTrigger) state.distractorTriggerClicks += 1;
      if (state.settingsOpen && !closeMenusFail) {
        if (triggerIgnoredWhileSubmenuOpen && state.submenuOpen) return;
        if (state.settingsTriggerClosePolls > 0) {
          state.pendingSettingsClosePolls = state.settingsTriggerClosePolls;
        } else {
          state.settingsOpen = false;
          state.submenuOpen = false;
          if (residualClosedSubmenuPortal) {
            state.residualSubmenuPresent = true;
            state.residualSubmenuClosed = true;
          }
        }
        abortSourcesPhase("close");
      } else {
        state.settingsOpen = true;
      }
  };
  trigger.click = () => activateSourcesTrigger(trigger);
  secondTrigger.click = () => activateSourcesTrigger(secondTrigger);
  const activate = (context, target) => {
    assertPreferredModelRun(context);
    context.interactionCount += 1;
    if (target === trigger || target === secondTrigger) {
      activateSourcesTrigger(target);
      if (state.settingsOpen) abortSourcesPhase("settings");
      return true;
    }
    if (target === modelTrigger) {
      state.modelTriggerClicks += 1;
      state.modelMenuOpen = true;
      return true;
    }
    if (target === modelItem) {
      state.modelItemClicks += 1;
      if (sourceTriggerMinWaitMsAfterModelSelection > 0) state.sourceTriggerWaitBudget = 0;
      setModelTriggerText("Gemini 3.1 Pro");
      state.modelMenuOpen = false;
      if (modelSelectionResetsSource) {
        state.allSourcesEnabled = initialState;
        scheduleSourceIndicatorState(initialState);
      }
      return true;
    }
    if (target === mySourcesRow) {
      state.mySourcesClicks += 1;
      if (mySourcesRowActivationWorks) {
        state.submenuGeneration += 1;
        if (mySourcesOpenAfterWaitPolls > 0) state.pendingMySourcesOpenPolls = mySourcesOpenAfterWaitPolls;
        else state.submenuOpen = true;
      }
      abortSourcesPhase("submenu");
      return true;
    }
    if (target === mySourcesRightChild) {
      state.mySourcesChildClicks += 1;
      state.submenuGeneration += 1;
      state.submenuOpen = true;
      abortSourcesPhase("submenu");
      return true;
    }
    if (target === toggle || target === toggleTrack) {
      state.toggleClicks += 1;
      if (toggleChanges) state.allSourcesEnabled = !state.allSourcesEnabled;
      if (toggleChanges) scheduleSourceIndicatorState(state.allSourcesEnabled);
      if (toggleChanges && replaceAllSourcesChildrenAfterToggle) state.childReplacementActive = true;
      if (sourceToggleResetsModel) setModelTriggerText("Auto");
      if (toggleClosesMenus) {
        state.settingsOpen = false;
        state.submenuOpen = false;
      }
      abortSourcesPhase("toggle");
      return true;
    }
    if (target === secondToggle) {
      state.secondToggleClicks += 1;
      return true;
    }
    if (target === replacementToggle) {
      state.replacementToggleClicks += 1;
      return true;
    }
    throw new Error(`unexpected source activation: ${target?.id || "unknown"}`);
  };
  const abortActivePreferredModelRun = (reason, runId = "") => {
    const active = state.activeRun;
    if (!active || (runId && active.runId !== runId)) return false;
    active.abortReason = reason;
    active.abortKind = reason.includes("timed out") ? "timeout" : "cancel";
    active.controller.abort(reason);
    return true;
  };
  return {
    state,
    nodes: Object.freeze({
      settingsMenu,
      replacementSettingsMenu,
      settingsMenuWrapper,
      staleSettingsMenu,
      duplicateSettingsMenu: duplicateSettingsMenuNode,
      submenuPortal,
      submenu,
      trigger,
      sourceIndicator,
      replacementSourceIndicator,
      duplicateSourceIndicator: duplicateSourceIndicatorNode,
      contextMenuControl,
      sourceDisabledIcon
    }),
    documentGetElementById(id) {
      if (id === "settings-menu" && state.settingsOpen) {
        return state.settingsRootReplacementActive ? replacementSettingsMenu : settingsMenu;
      }
      if (id === "settings-menu-wrapper" && state.settingsOpen) return settingsMenuWrapper;
      if (id === "stale-settings-menu") return staleSettingsMenu;
      if (id === "notion-model-menu" && state.modelMenuOpen) return modelMenu;
      return null;
    },
    installDocumentEscapeListener() {
      if (!documentEscapeListener) return () => {};
      const targets = [global.document.body, global.document.documentElement, global.document];
      const previous = targets.map((target) => ({ target, dispatchEvent: target.dispatchEvent }));
      const previousDefaultView = global.document.defaultView;
      const previousActiveElement = global.document.activeElement;
      for (const target of targets) target.dispatchEvent = (event) => dispatchDocumentEscape(event, false);
      global.document.defaultView = { dispatchEvent: (event) => dispatchDocumentEscape(event, false) };
      if (escapeActiveElementInsideRoot) global.document.activeElement = allSourcesLabel;
      return () => {
        for (const entry of previous) {
          if (entry.dispatchEvent === undefined) delete entry.target.dispatchEvent;
          else entry.target.dispatchEvent = entry.dispatchEvent;
        }
        if (previousDefaultView === undefined) delete global.document.defaultView;
        else global.document.defaultView = previousDefaultView;
        if (previousActiveElement === undefined) delete global.document.activeElement;
        else global.document.activeElement = previousActiveElement;
      };
    },
    documentElementFromPoint(x) {
      if (!state.settingsOpen || !mySourcesAvailable) return null;
      return rightSideChildOpens && x >= mySourcesRow.box.left + mySourcesRow.box.width * 0.75
        ? mySourcesRightChild
        : mySourcesRow;
    },
    dependencies: {
      normalize: (value) => String(value || "").replace(/\s+/g, " ").trim(),
      modelElementText,
      visibleSelectorElements,
      modelRect,
      visible,
      isDisabledElement: (node) => modelItemDisabled && node === modelItem,
      assertPreferredModelRun,
      preferredModelActivate: activate,
      preferredModelPointerActivate(context, target) {
        if (pointerSourceToggleNoop && (target === toggle || target === toggleTrack)) {
          assertPreferredModelRun(context);
          context.interactionCount += 1;
          state.pointerSourceToggleClicks += 1;
          return true;
        }
        return activate(context, target);
      },
      async waitForPreferredModel(context, getter, timeoutMs, intervalMs) {
        assertPreferredModelRun(context);
        state.waitCalls.push({ timeoutMs, intervalMs });
        if (intervalMs === 120) {
          state.sourceTriggerWaitBudget = Math.max(state.sourceTriggerWaitBudget, timeoutMs);
          state.sourceTriggerWaitBudgets.push(timeoutMs);
        }
        const attempts = submenuEscapeClosePolls > 0 || settingsTriggerClosePolls > 0
          ? Math.max(1, Math.ceil(timeoutMs / Math.max(1, intervalMs)))
          : 5;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          pollClosures();
          const value = getter();
          if (value) return value;
        }
        pollClosures();
        return getter();
      },
      modelElementArea: (node) => node?.box ? node.box.width * node.box.height : 0,
      modelEventConstructor: () => class TestKeyboardEvent {
        constructor(type, options = {}) {
          this.type = type;
          Object.assign(this, options);
        }
      },
      async preferredModelSleep() {
        state.sleepCalls += 1;
      },
      async dismissPreferredModelMenu(_context, getter) {
        state.dismissCalls += 1;
        if (closeMenusFail) return false;
        if (state.modelMenuOpen && getter()) state.modelMenuOpen = false;
        if (state.submenuOpen) state.submenuOpen = false;
        else if (state.settingsOpen) state.settingsOpen = false;
        return !getter();
      },
      preferredModelResult,
      alnumModelToken: (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, ""),
      closest(node) {
        for (let current = node; current; current = current.parentElement) {
          const role = String(current.getAttribute?.("role") || "").toLowerCase();
          if (String(current.tagName || "").toLowerCase() === "button" || ["button", "menuitem"].includes(role)) return current;
        }
        return null;
      },
      applyGeminiPreferredModel: async () => ({ ok: false }),
      applyGrokPreferredModel: async () => ({ ok: false }),
      abortActivePreferredModelRun,
      nextPreferredModelBridgeRunSequence: () => ++state.sequence,
      preferredModelState: state,
      publishPreferredModelBridgeRun(context) {
        context.bridgeToken = `notion-source-test-${context.bridgeGeneration}`;
      },
      preferredModelCancelled: (context) => Boolean(context?.signal?.aborted),
      preferredModelAbortReason: (context) => context?.abortReason || "preferred model apply cancelled",
      releasePreferredModelBridgeRun() {},
      modelResult: (ok, appId, modelId, reason = "", extra = {}) => ({ ok, appId, modelId, reason, ...extra })
    }
  };
}

(async () => {
  global.window = { innerWidth: 1000, innerHeight: 800 };
  global.document = {
    body: element("body", { box: rect(0, 0, 1000, 800) }),
    documentElement: { clientWidth: 1000, clientHeight: 800 },
    getElementById() {
      return null;
    }
  };
  const moduleUrl = `${pathToFileURL(path.join(root, "content-src/capabilities/preferred-notion-deepseek.js")).href}?test=${Date.now()}`;
  const source = fs.readFileSync(path.join(root, "content-src/capabilities/preferred-notion-deepseek.js"), "utf8");
  const sourcesSource = fs.readFileSync(path.join(root, "content-src/capabilities/preferred-notion-sources.js"), "utf8");
  const sourceIndicatorPath = path.join(root, "content-src/capabilities/preferred-notion-source-indicator.js");
  const sourceIndicatorSource = fs.existsSync(sourceIndicatorPath)
    ? fs.readFileSync(sourceIndicatorPath, "utf8")
    : "";
  const consoleProbeSource = fs.readFileSync(path.join(root, "tools/model-preference-console-probe.js"), "utf8");
  const controllerSource = fs.readFileSync(path.join(root, "app/preferred-model/controller.js"), "utf8");
  const sourcesImplementationSource = `${sourcesSource}\n${sourceIndicatorSource}`;
  const combinedSource = `${source}\n${sourcesImplementationSource}`;
  const { createPreferredNotionDeepSeekCapability } = await import(moduleUrl);
  const { MODEL_PREFERENCE_TARGETS } = await import(
    `${pathToFileURL(path.join(root, "shared/constants.js")).href}?test=${Date.now()}`
  );

  const runtimeTargetsBlock = source.match(
    /const NOTION_MODEL_TARGETS = Object\.freeze\(\{([\s\S]*?)\n  \}\);/
  )?.[1] || "";
  const runtimeTargets = [...runtimeTargetsBlock.matchAll(
    /^\s+(\w+): Object\.freeze\(\{ id: "([^"]+)", label: "([^"]+)", aliases: \[([^\]]*)\] \}\),?$/gm
  )].map((match) => ({
    key: match[1],
    id: match[2],
    label: match[3],
    aliases: JSON.parse(`[${match[4]}]`)
  }));
  const consoleTargetsBlock = consoleProbeSource.match(
    /const NOTION_MODEL_TARGETS = Object\.freeze\(\{([\s\S]*?)\n  \}\);/
  )?.[1] || "";
  const consoleTargetIds = [...consoleTargetsBlock.matchAll(
    /^\s+(\w+): Object\.freeze\(\{ id: "([^"]+)", label: "([^"]+)", aliases: \[([^\]]*)\] \}\),?$/gm
  )].map((match) => match[2]);
  assert.equal(runtimeTargets.length, NOTION_MODEL_CASES.length, "every current Notion model must have one runtime target");
  assert.ok(runtimeTargets.every((target) => target.key === target.id), "runtime Notion target keys and stable ids must stay identical");
  assert.deepEqual(
    MODEL_PREFERENCE_TARGETS.NotionAI.filter((target) => target.id),
    NOTION_MODEL_CASES.map(({ id, settingsLabel: label }) => ({ id, label })),
    "Settings must expose the complete Arc-observed Notion model catalog with stable ids"
  );
  assert.deepEqual(
    runtimeTargets.map(({ id }) => id),
    MODEL_PREFERENCE_TARGETS.NotionAI.filter((target) => target.id).map(({ id }) => id),
    "Settings and the Notion runtime selector must keep the exact same non-empty target ids"
  );
  assert.deepEqual(
    consoleTargetIds,
    runtimeTargets.map(({ id }) => id),
    "the DevTools acceptance probe must expose the same complete Notion model catalog"
  );
  for (const expected of NOTION_MODEL_CASES) {
    const runtime = runtimeTargets.find(({ id }) => id === expected.id);
    assert.ok(
      [runtime?.label, ...(runtime?.aliases || [])].includes(expected.menuLabel),
      `runtime target ${expected.id} must include the exact live Notion label ${expected.menuLabel}`
    );
  }

  const timeoutValue = (name) => Number(combinedSource.match(new RegExp(`const ${name} = (\\d+);`))?.[1] || 0);
  const notionSlowPathBudget = [
    "NOTION_MODEL_TRIGGER_WAIT_MS",
    "NOTION_MODEL_MENU_OPEN_WAIT_MS",
    "NOTION_MODEL_ITEM_READY_WAIT_MS",
    "NOTION_MODEL_SETTLE_WAIT_MS",
    "NOTION_MODEL_MENU_CLOSE_WAIT_MS"
  ].reduce((sum, name) => sum + timeoutValue(name), 0);
  assert.ok(notionSlowPathBudget > 0 && notionSlowPathBudget <= 9500, "the nominal Notion slow path must leave at least 2.5s inside its 12s hard deadline");
  const notionSourcesSlowPathBudget = [
    "NOTION_SOURCES_TRIGGER_WAIT_MS",
    "NOTION_SOURCES_MENU_OPEN_WAIT_MS",
    "NOTION_SOURCES_SUBMENU_WAIT_MS",
    "NOTION_SOURCES_SETTLE_WAIT_MS",
    "NOTION_SOURCES_MENU_CLOSE_WAIT_MS"
  ].reduce((sum, name) => sum + timeoutValue(name), 0);
  assert.ok(
    notionSourcesSlowPathBudget > 0 && notionSourcesSlowPathBudget <= 9500,
    "one Notion All Sources traversal must retain its bounded 9.5s ceiling"
  );
  const notionSourcesHydratedSlowPathBudget = notionSourcesSlowPathBudget
    - timeoutValue("NOTION_SOURCES_TRIGGER_WAIT_MS")
    + timeoutValue("NOTION_SOURCES_HYDRATION_TRIGGER_WAIT_MS");
  assert.ok(
    notionSourcesHydratedSlowPathBudget >= notionSourcesSlowPathBudget
      && notionSourcesHydratedSlowPathBudget <= 10800,
    "post-model composer proof may use the live 3s hydration window without reopening Settings"
  );
  assert.equal(
    timeoutValue("NOTION_SOURCES_MENU_OPEN_WAIT_MS"),
    3000,
    "Notion source settings must retain the live Template_shortcuts menu-open window"
  );
  assert.ok(
    timeoutValue("NOTION_SOURCES_TRIGGER_WAIT_MS")
      + notionSlowPathBudget
      + notionSourcesHydratedSlowPathBudget
      + 120 <= 43000,
    "the non-interactive source proof, model selection, one source write traversal, and the model sample must fit the content deadline"
  );
  assert.ok(
    notionSlowPathBudget
      + timeoutValue("NOTION_SOURCES_TRIGGER_WAIT_MS")
      + notionSourcesHydratedSlowPathBudget
      + timeoutValue("NOTION_SOURCES_MENU_CLOSE_WAIT_MS")
      + 120 <= 43000,
    "a final owned cleanup attempt must still fit the content deadline"
  );
  assert.match(
    source,
    /const defaultTimeoutMs = hasNotionSourcesPreference \? 43000 : 12000;/,
    "the combined Notion content deadline must cover every supported bounded traversal"
  );
  assert.match(
    source,
    /const maximumTimeoutMs = hasNotionSourcesPreference \? 44000 : 14000;/,
    "an explicit combined timeout must remain bounded above the default cleanup margin"
  );
  assert.doesNotMatch(
    sourcesImplementationSource,
    /prepareNotionSourcesLeaseForReopen|reopen(?:ed)?[^\n]*sources/i,
    "a delivered Sources toggle must never reopen Settings for read-only verification"
  );
  for (const scopeName of ["No sources", "Web search only", "All sources I can access"]) {
    assert.match(
      sourcesImplementationSource,
      new RegExp(scopeName),
      `the main composer indicator must recognize Notion's explicit ${scopeName} scope name`
    );
  }
  assert.match(
    sourcesImplementationSource,
    /teamspaceSlashSmall[\s\S]*graphics-symbol|graphics-symbol[\s\S]*teamspaceSlashSmall/,
    "the crossed Notion Sources icon must be the exact disabled-state signal"
  );
  assert.match(
    sourcesSource,
    /function dispatchNotionSourcesEscape\(root\)[\s\S]*connectedVisibleNotionSourcesRoot\(root\)[\s\S]*dispatchNotionSourcesEscapeEvent\(notionSourcesEscapeTarget\(root\)\)/,
    "Notion cleanup must dispatch one Escape pair from a target inside the exact owned root"
  );
  assert.doesNotMatch(
    sourcesSource,
    /const targets = \[[\s\S]*document\.body[\s\S]*document\.defaultView[\s\S]*dispatchNotionSourcesEscapeEvent/,
    "Notion cleanup must not broadcast Escape across document-global targets"
  );
  assert.match(
    controllerSource,
    /const NOTION_ALL_SOURCES_APPLY_RETRY_DELAYS = Object\.freeze\(\[0, 800, 2000, 4200\]\);/,
    "an immediate Notion source retry sequence must remain bounded"
  );
  assert.match(
    controllerSource,
    /const NOTION_ALL_SOURCES_READY_APPLY_RETRY_DELAYS = Object\.freeze\(\[1000, 2400, 5000\]\);/,
    "a newly loaded Notion frame must receive a short hydration retry window without a minute-long gate"
  );
  assert.ok(
    timeoutValue("NOTION_MODEL_TRIGGER_HYDRATION_WAIT_MS") > 0
      && timeoutValue("NOTION_MODEL_TRIGGER_HYDRATION_WAIT_MS") <= timeoutValue("NOTION_MODEL_TRIGGER_WAIT_MS"),
    "trigger hydration must consume the existing trigger deadline instead of extending the slow path"
  );
  assert.equal(timeoutValue("NOTION_MODEL_TRIGGER_HYDRATION_SAMPLES"), 2, "hydrated target detection must require two consecutive samples");
  assert.match(
    source,
    /NOTION_MODEL_DIRECT_TRIGGER_SELECTORS = Object\.freeze\(\[\s*'\[data-testid="agent-chat-model-button"\]'[\s\S]*?'\[data-testid="unified-chat-model-button"\]'\s*\]\)/,
    "only the current and legacy exact live-site test ids may bypass composer scoping"
  );
  assert.match(
    sourcesSource,
    /NOTION_SOURCES_DIRECT_TRIGGER_SELECTORS = Object\.freeze\(\[\s*'\[data-testid="unified-chat-mode-menu-button"\]'[\s\S]*?'\[data-testid="unified-chat-search-scope-button"\]'/,
    "the current and legacy exact Notion settings triggers must bypass text heuristics"
  );

  for (const modelCase of NOTION_MODEL_CASES) {
    const liveMenuLabel = {
      opus5: "Opus5New",
      fable5: "Fable5Beta"
    }[modelCase.id] || modelCase.menuLabel;
    const fixture = createFixture({
      triggerText: "Choose model",
      triggerTestId: modelCase.id === "sonnet5"
        ? "agent-chat-model-button"
        : "unified-chat-model-button",
      targetLabel: liveMenuLabel,
      itemDescription: modelCase.id === "opus5" ? "Most capable reasoning model" : ""
    });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: modelCase.id,
      runId: `notion-current-catalog-${modelCase.id}`
    });
    assert.equal(result.ok, true, `the current Notion catalog target ${modelCase.id} must be selectable`);
    assert.equal(result.changed, true);
    assert.equal(fixture.state.triggerClicks, 1);
    assert.equal(fixture.state.itemClicks, 1);
    assert.equal(
      fixture.state.composerWideScans,
      0,
      `${modelCase.id} must use an exact current/legacy model trigger without a document-wide scan`
    );
  }

  {
    const fixture = createFixture({
      triggerText: "Gemini 3.1 Pro",
      effortTriggerAvailable: true,
      effortTriggerText: "Change effort, currently low",
      effortItemLabel: "Medium"
    });
    global.document.getElementById = (id) => {
      if (id === "model-menu" && fixture.state.menuOpen) {
        return fixture.dependencies.visibleSelectorElements('[role="menu"]')[0];
      }
      if (id === "notion-effort-menu" && fixture.state.effortMenuOpen) {
        return fixture.dependencies.visibleSelectorElements('[role="menu"]')
          .find((node) => node.id === "notion-effort-menu") || null;
      }
      return null;
    };
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      effortId: "medium",
      runId: "notion-effort-medium"
    });
    assert.equal(result.ok, true, "a model-specific Effort must be selectable");
    assert.equal(result.effortId, "medium");
    assert.equal(result.changed, true);
    assert.equal(fixture.state.effortTriggerClicks, 1);
    assert.equal(fixture.state.effortItemClicks, 1);
    assert.equal(fixture.state.itemClicks, 0, "an already-selected model must not be clicked again");
  }

  {
    const fixture = createFixture({
      triggerText: "Gemini 3.1 Pro",
      effortTriggerAvailable: true
    });
    global.document.getElementById = () => null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      effortId: "max",
      runId: "notion-effort-reject-out-of-range"
    });
    assert.equal(result.ok, false, "an Effort outside the selected model range must fail closed");
    assert.match(result.reason, /unknown effort for model/);
    assert.equal(fixture.state.effortTriggerClicks, 0);
    assert.equal(fixture.state.effortItemClicks, 0);
  }

  for (const modelCase of [
    { id: "fable5", menuLabel: "Fable5Beta" },
    { id: "gpt56sol", menuLabel: "GPT-5.6Sol" },
    { id: "kimi3", menuLabel: "KimiK3" }
  ]) {
    const fixture = createFixture({
      triggerText: "Auto",
      composerAvailable: true,
      targetLabel: modelCase.menuLabel,
      liveModelPicker: true,
      duplicateItem: modelCase.id !== "fable5"
    });
    global.document.getElementById = () => null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: modelCase.id,
      runId: `notion-live-picker-${modelCase.id}`
    });
    assert.equal(result.ok, true, `${modelCase.id} must work with the updated dialog picker`);
    assert.equal(result.changed, true);
    assert.equal(fixture.state.triggerClicks, 1);
    assert.equal(fixture.state.itemClicks, 1);
    assert.ok(fixture.state.modelTriggerSelectorScans > 0, "the updated picker must use the new dialog-trigger selector");
  }

  for (const scenario of [
    {
      name: "substring",
      options: { targetLabel: "GPT-5.4 Mini", itemDisabled: true },
      message: "a longer model label must not satisfy the exact GPT-5.4 target"
    },
    {
      name: "disabled",
      options: { targetLabel: "Fable 5", itemDisabled: true },
      modelId: "fable5",
      unavailable: true,
      message: "a unique disabled exact model row must be typed as unavailable before model activation"
    },
    {
      name: "ambiguous",
      options: { targetLabel: "GPT-5.4", itemDisabled: true, duplicateItem: true },
      message: "duplicate exact model rows must fail closed"
    }
  ]) {
    const fixture = createFixture({ triggerText: "Choose model", ...scenario.options });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: scenario.modelId || "gpt54",
      runId: `notion-exact-${scenario.name}`
    });
    if (scenario.unavailable) {
      assert.equal(result.ok, true, scenario.message);
      assert.equal(result.unavailable, true);
      assert.equal(result.fallbackEligible, true);
      assert.equal(result.selectionActivated, false);
      assert.equal(result.menuClosed, true);
      assert.equal(result.reason, "");
    } else {
      assert.equal(result.ok, false, scenario.message);
      assert.equal(result.reason, "target model item not found");
      assert.notEqual(result.unavailable, true);
      assert.notEqual(result.fallbackEligible, true);
      assert.equal(result.retryable, true, `${scenario.name} may retry after its owned menu is safely closed`);
      assert.equal(result.retryableBeforeSelection, true);
      assert.equal(result.selectionActivated, false);
      assert.equal(result.menuClosed, true);
    }
    assert.equal(fixture.state.triggerClicks, 1, `${scenario.name} may open only the owned model menu`);
    assert.equal(fixture.state.itemClicks, 0, `${scenario.name} must not activate a model row`);
  }

  {
    const fixture = createFixture({
      triggerText: "Choose model",
      targetLabel: "Fable 5",
      structuralTargetDuplicate: true
    });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "fable5",
      runId: "notion-semantic-row-wins-over-structural-clone"
    });
    assert.equal(result.ok, true, "a semantic Fable 5 row must win over a duplicate structural label");
    assert.equal(result.changed, true);
    assert.equal(fixture.state.itemClicks, 1, "only the semantic Fable 5 row may be activated");
  }

  {
    const fixture = createFixture({
      triggerText: "Choose model",
      targetLabel: "Fable 5",
      itemAvailable: false,
      itemBecomesAvailableDuringWait: false
    });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const first = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "fable5",
      runId: "notion-preselection-hydration-miss"
    });
    assert.equal(first.ok, false);
    assert.equal(first.reason, "target model item not found");
    assert.equal(first.retryable, true, "a missing Fable 5 row may retry before any selection");
    assert.equal(first.retryableBeforeSelection, true);
    assert.equal(first.selectionActivated, false);
    assert.equal(first.menuClosed, true);
    assert.equal(fixture.state.itemClicks, 0);
  }

  {
    const fixture = createFixture({
      triggerText: "Choose model",
      targetLabel: "Fable 5",
      itemDisabled: true,
      modelMenuCloseFails: true
    });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "fable5",
      runId: "notion-exact-disabled-menu-remains-open"
    });
    assert.equal(result.ok, true);
    assert.equal(result.unavailable, true, "the exact disabled row remains a typed availability observation");
    assert.equal(result.fallbackEligible, false, "an open model menu must prevent fallback activation");
    assert.equal(result.selectionActivated, false);
    assert.equal(result.menuClosed, false, "the adapter must report the actual failed menu cleanup");
    assert.equal(fixture.state.triggerClicks, 1);
    assert.equal(fixture.state.itemClicks, 0, "failed menu cleanup must not activate the unavailable row");
  }

  {
    const fixture = createFixture({ triggerText: "Gemini 3.1 Pro" });
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "gemini31pro", runId: "notion-already-selected" });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true, "an immediately readable selected model must remain a no-interaction success");
    assert.equal(result.interactionCount, 0);
    assert.deepEqual(fixture.state.waitCalls, []);
    assert.equal(fixture.state.composerWideScans, 0);
  }

  {
    const fixture = createFixture({
      triggerText: "Auto",
      triggerHydrationTexts: ["Gemini 3.1 Pro", "Gemini 3.1 Pro"]
    });
    global.document.getElementById = () => null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "gemini31pro", runId: "notion-auto-hydrates-to-target" });
    assert.equal(result.ok, true, "an Auto placeholder that hydrates to the target must avoid opening the menu");
    assert.equal(result.skipped, true);
    assert.equal(result.interactionCount, 0, "trigger hydration success must remain a zero-interaction result");
    assert.equal(fixture.state.triggerClicks, 0);
    assert.equal(fixture.state.itemClicks, 0);
    assert.deepEqual(fixture.state.waitCalls, [
      { timeoutMs: 3500, intervalMs: 150 },
      { timeoutMs: 600, intervalMs: 80 }
    ]);
  }

  {
    const fixture = createFixture({
      triggerText: "Choose model",
      triggerHydrationTexts: ["Gemini 3.1 Pro", "Gemini 3.1 Pro"]
    });
    global.document.getElementById = () => null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "gemini31pro", runId: "notion-loading-hydrates-to-target" });
    assert.equal(result.ok, true, "an unreadable loading label that hydrates to the target must avoid opening the menu");
    assert.equal(result.skipped, true);
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.triggerClicks, 0);
    assert.equal(fixture.state.itemClicks, 0);
  }

  {
    const fixture = createFixture();
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "gemini31pro", runId: "notion-fast-path" });
    assert.equal(result.ok, true, "an explicit non-target trigger must be resolved through the selected menu row without hydration waiting");
    assert.equal(result.changed, true);
    assert.equal(fixture.state.triggerClicks, 1);
    assert.equal(fixture.state.itemClicks, 1);
    assert.equal(result.interactionCount, 2);
    assert.equal(fixture.state.sleepCalls, 0, "Notion must not poll an unchanged trigger label before opening its menu");
    assert.equal(fixture.state.composerWideScans, 0, "the stable Notion model test id must bypass full-page composer scans");
    assert.deepEqual(fixture.state.waitCalls, [
      { timeoutMs: 3500, intervalMs: 150 },
      { timeoutMs: 2200, intervalMs: 120 }
    ]);
  }

  {
    const fixture = createFixture({
      triggerText: "Choose model",
      decorativeRightSvg: true
    });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      runId: "notion-decorative-svg-is-not-selected"
    });
    assert.equal(result.ok, true);
    assert.equal(result.changed, true, "an unlabeled row decoration must not be treated as a selected check marker");
    assert.equal(fixture.state.itemClicks, 1, "the exact target row must still be activated");
  }

  for (const [name, rightMarker] of [
    ["aria-checked", { attributes: { "aria-checked": "true" } }],
    ["aria-pressed", { attributes: { "aria-pressed": "true" } }],
    ["aria-current", { attributes: { "aria-current": "step" } }],
    ["data-state", { attributes: { "data-state": "on" } }],
    ["aria-label", { attributes: { "aria-label": "Done" } }],
    ["title", { attributes: { title: "Check" } }],
    ["data-testid", { attributes: { "data-testid": "selected-marker" } }],
    ["class", { className: "selected-marker" }],
    ["data-icon", { tagName: "SVG", attributes: { "data-icon": "check" } }]
  ]) {
    const fixture = createFixture({ triggerText: "Choose model", rightMarker });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      runId: `notion-selected-marker-${name}`
    });
    assert.equal(result.ok, true, `${name} must remain an explicit selected-row signal`);
    assert.equal(result.skipped, true);
    assert.equal(fixture.state.itemClicks, 0);
  }

  {
    const fixture = createFixture({
      triggerText: "Choose model",
      rightMarker: { attributes: { "aria-label": "Not selected" } }
    });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      runId: "notion-not-selected-marker"
    });
    assert.equal(result.ok, true);
    assert.equal(result.changed, true, "an explicit negative marker must not masquerade as selected");
    assert.equal(fixture.state.itemClicks, 1);
  }

  for (const [name, options] of [
    ["marker-class", { rightMarker: { className: "is-not-selected" } }],
    ["row-class", { itemClass: "not-selected" }],
    ["row-not-active-class", { itemClass: "is-not_active" }]
  ]) {
    const fixture = createFixture({ triggerText: "Choose model", ...options });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      runId: `notion-negative-selected-${name}`
    });
    assert.equal(result.ok, true);
    assert.equal(result.changed, true, `${name} must remain an explicit negative selected-state signal`);
    assert.equal(fixture.state.itemClicks, 1);
  }

  {
    const fixture = createFixture({ triggerText: "Auto" });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "gemini31pro", runId: "notion-auto-remains-current" });
    assert.equal(result.ok, true, "a stable Auto trigger must still fall through to explicit target selection");
    assert.equal(result.changed, true);
    assert.equal(result.interactionCount, 2);
    assert.equal(fixture.state.triggerClicks, 1);
    assert.equal(fixture.state.itemClicks, 1);
    assert.deepEqual(fixture.state.waitCalls, [
      { timeoutMs: 3500, intervalMs: 150 },
      { timeoutMs: 600, intervalMs: 80 },
      { timeoutMs: 2200, intervalMs: 120 }
    ]);
  }

  {
    const fixture = createFixture({
      triggerText: "Auto",
      triggerHydrationTexts: ["Gemini 3.1 Pro", "Auto"]
    });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "gemini31pro", runId: "notion-target-flash-is-not-stable" });
    assert.equal(result.ok, true);
    assert.equal(result.changed, true, "one transient target sample must not be accepted as an already-selected model");
    assert.equal(Boolean(result.skipped), false);
    assert.equal(result.interactionCount, 2);
    assert.equal(fixture.state.triggerClicks, 1);
    assert.equal(fixture.state.itemClicks, 1);
  }

  {
    const originalDateNow = Date.now;
    let now = 10_000;
    try {
      Date.now = () => now;
      const fixture = createFixture({
        triggerText: "Auto",
        triggerHydrationTexts: ["Gemini 3.1 Pro", "Gemini 3.1 Pro"],
        onTriggerWait: () => { now += 3400; }
      });
      global.document.getElementById = () => null;
      const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
      const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "gemini31pro", runId: "notion-trigger-deadline-shared" });
      assert.equal(result.ok, true);
      assert.equal(result.interactionCount, 0);
      assert.deepEqual(fixture.state.waitCalls, [
        { timeoutMs: 3500, intervalMs: 150 },
        { timeoutMs: 100, intervalMs: 80 }
      ], "hydration must use only the trigger deadline remaining after trigger discovery");
    } finally {
      Date.now = originalDateNow;
    }
  }

  {
    const fixture = createFixture({ triggerText: "Auto", abortDuringTriggerHydration: true });
    global.document.getElementById = () => null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "gemini31pro", runId: "notion-trigger-hydration-cancelled" });
    assert.equal(result.ok, false);
    assert.equal(result.cancelled, true);
    assert.equal(result.interactionCount, 0, "cancelling trigger hydration must remain safe before delivery");
    assert.equal(fixture.state.triggerClicks, 0);
    assert.equal(fixture.state.itemClicks, 0);
  }

  {
    const fixture = createFixture({ itemAvailable: false, itemBecomesAvailableDuringWait: true });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "gemini31pro", runId: "notion-delayed-menu-item" });
    assert.equal(result.ok, true, "a target row that hydrates after the menu shell must still be selected");
    assert.equal(result.changed, true);
    assert.equal(fixture.state.triggerClicks, 1);
    assert.equal(fixture.state.itemClicks, 1);
    assert.equal(result.interactionCount, 2, "hydrated target selection must record trigger and target interactions");
    assert.deepEqual(fixture.state.waitCalls.at(-1), { timeoutMs: 800, intervalMs: 80 });
  }

  {
    const fixture = createFixture({
      triggerText: "Choose model",
      targetLabel: "Gemini 3.1 Pro",
      itemSelectionSettles: false
    });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      runId: "notion-selection-does-not-settle"
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "selection did not settle");
    assert.notEqual(result.unavailable, true);
    assert.equal(result.fallbackEligible, true, "a closed Notion menu makes a typed secondary attempt safe");
    assert.equal(result.selectionActivated, true);
    assert.equal(result.selectionUnsettled, true);
    assert.equal(result.menuClosed, true);
    assert.equal(fixture.state.triggerClicks, 1);
    assert.equal(fixture.state.itemClicks, 1, "the failed settlement follows one explicit model activation");
  }

  {
    const fixture = createFixture({ itemAvailable: false, targetBecomesCurrentDuringItemWait: true });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "gemini31pro", runId: "notion-current-settles-during-menu-hydration" });
    assert.equal(result.ok, true, "a late target indicator must prevent a hydrated-menu false failure");
    assert.equal(result.skipped, true);
    assert.equal(fixture.state.triggerClicks, 1);
    assert.equal(fixture.state.itemClicks, 0);
    assert.equal(result.interactionCount, 1, "late current-model settlement must retain the trigger interaction");
    assert.deepEqual(fixture.state.waitCalls.at(-1), { timeoutMs: 800, intervalMs: 80 });
  }

  {
    const fixture = createFixture({ itemAvailable: false, targetBecomesCurrentOnDismiss: true });
    global.document.getElementById = (id) => id === "model-menu" && fixture.state.menuOpen
      ? fixture.dependencies.visibleSelectorElements('[role="menu"]')[0]
      : null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "gemini31pro", runId: "notion-current-settles-on-dismiss" });
    assert.equal(result.ok, true, "the post-dismiss target indicator must prevent a false missing-item failure");
    assert.equal(result.skipped, true);
    assert.equal(result.interactionCount, 1);
    assert.equal(fixture.state.itemClicks, 0);
  }

  {
    const fixture = createFixture({
      triggerAvailable: false,
      distractorAvailable: true,
      composerAvailable: true,
      composerButtonAvailable: true
    });
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "gemini31pro", runId: "notion-no-trigger" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "model trigger not found");
    assert.equal(result.retryable, true, "a no-interaction missing trigger remains safe to retry");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.distractorClicks, 0, "an unrelated global model settings control must never be activated");
    assert.equal(fixture.state.composerButtonClicks, 0, "composer proximity alone must never turn Send into a model trigger");
    assert.equal(fixture.state.sleepCalls, 0, "the missing-trigger path must not spend a separate readability timeout first");
    assert.equal(fixture.state.composerWideScans, 0, "skeleton polling must not scan every div in the Notion document");
    assert.equal(fixture.state.waitCalls[0]?.timeoutMs, 3500, "the trigger wait must stay well inside the content-run deadline");
  }

  {
    const fixture = createFixture({
      triggerText: "Choose model",
      duplicateTrigger: true
    });
    global.document.getElementById = () => null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      runId: "notion-duplicate-exact-triggers"
    });
    assert.equal(result.ok, false, "multiple exact model controls must fail closed");
    assert.equal(result.reason, "model trigger not found");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.triggerClicks, 0);
  }

  {
    const fixture = createFixture({
      triggerText: "Choose model",
      triggerControls: "",
      preOpenUnrelatedMenu: true
    });
    global.document.getElementById = () => null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      runId: "notion-preopen-unrelated-menu"
    });
    assert.equal(result.ok, true, "a pre-open unrelated model menu must not be adopted by the target trigger");
    assert.equal(result.changed, true);
    assert.equal(fixture.state.triggerClicks, 1);
    assert.equal(fixture.state.itemClicks, 1);
  }

  {
    const fixture = createFixture({
      triggerText: "Choose model",
      triggerControls: "",
      duplicateOpenedMenu: true
    });
    global.document.getElementById = () => null;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      runId: "notion-ambiguous-opened-menus"
    });
    assert.equal(result.ok, false, "multiple newly opened model roots must fail closed");
    assert.equal(result.reason, "model menu not found");
    assert.equal(fixture.state.triggerClicks, 1);
    assert.equal(fixture.state.itemClicks, 0);
  }

  async function runSourcesFixture(options, allSourcesState, runId) {
    const previousViewportWidth = global.window.innerWidth;
    const previousClientWidth = global.document.documentElement.clientWidth;
    const requestedViewportWidth = Number(options?.viewportWidth || 0);
    if (requestedViewportWidth > 0) {
      global.window.innerWidth = requestedViewportWidth;
      global.document.documentElement.clientWidth = requestedViewportWidth;
    }
    const fixture = createSourcesFixture(options);
    global.document.getElementById = fixture.documentGetElementById;
    global.document.elementFromPoint = fixture.documentElementFromPoint;
    const restoreDocumentEscapeListener = fixture.installDocumentEscapeListener();
    try {
      const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
      const result = await api.runPreferredModelApply({ appId: "NotionAI", modelId: "", allSourcesState, runId });
      return { fixture, result };
    } finally {
      restoreDocumentEscapeListener();
      global.window.innerWidth = previousViewportWidth;
      global.document.documentElement.clientWidth = previousClientWidth;
    }
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: true },
      "enabled",
      "notion-sources-already-enabled"
    );
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true, "absence of Notion's custom-scope facepile must prove the default All Sources state");
    assert.equal(fixture.state.toggleClicks, 0, "an already-satisfied source preference must not toggle the switch");
    assert.equal(fixture.state.triggerClicks, 0, "read-only proof from the main composer must not open Settings");
    assert.equal(fixture.state.mySourcesClicks, 0);
    assert.equal(result.interactionCount, 0);
    assert.equal(result.menuClosed, true);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: true,
        sourceIndicatorAvailable: false,
        nonSourceMenuControl: true
      },
      "enabled",
      "notion-sources-ignores-give-context-menu"
    );
    assert.equal(result.ok, true, "Fable 5's Give context menu must not be mistaken for a Sources indicator");
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.triggerClicks, 0);
    assert.equal(fixture.state.mySourcesClicks, 0);
    assert.equal(fixture.state.toggleClicks, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        sourceIndicatorAvailable: false,
        nonSourceMenuControl: true,
        contextMenuPopup: "dialog",
        disabledIconOnNonSourceControl: true
      },
      "disabled",
      "notion-sources-disabled-icon-inside-give-context"
    );
    assert.equal(result.ok, true, "Fable 5's explicit Sources-off icon inside Give context must prove the disabled state");
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.triggerClicks, 0);
    assert.equal(fixture.state.mySourcesClicks, 0);
    assert.equal(fixture.state.toggleClicks, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: true, sourceIndicatorAvailable: false },
      "disabled",
      "notion-sources-fable5-disable-without-main-indicator"
    );
    assert.equal(result.ok, true, "Fable 5 must accept the owned All sources toggle proof when no main indicator is rendered");
    assert.equal(result.changed, true);
    assert.equal(fixture.state.allSourcesEnabled, false);
    assert.equal(fixture.state.toggleClicks, 1);
    assert.equal(fixture.state.triggerClicks, 2);
    assert.equal(fixture.state.mySourcesClicks, 1);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, sourceIndicatorAvailable: false },
      "disabled",
      "notion-sources-fable5-already-disabled-without-main-indicator"
    );
    assert.equal(result.ok, true, "Fable 5 must accept a stable direct All sources disabled state without a main indicator");
    assert.equal(result.skipped, true);
    assert.equal(result.changed, false);
    assert.equal(fixture.state.toggleClicks, 0, "an already-satisfied direct source state must not be toggled");
    assert.equal(fixture.state.triggerClicks, 2);
    assert.equal(fixture.state.mySourcesClicks, 1);
  }

  for (const sourceIndicatorDisabledLabel of ["No sources", "Web search only"]) {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, sourceIndicatorDisabledLabel },
      "disabled",
      `notion-sources-already-disabled-${sourceIndicatorDisabledLabel.replace(/\s+/g, "-").toLowerCase()}`
    );
    assert.equal(result.ok, true, `${sourceIndicatorDisabledLabel} must be a stable disabled-state proof`);
    assert.equal(result.skipped, true);
    assert.equal(fixture.state.triggerClicks, 0, "the crossed Sources indicator is sufficient read-only proof");
    assert.equal(fixture.state.mySourcesClicks, 0);
    assert.equal(fixture.state.toggleClicks, 0);
    assert.equal(result.interactionCount, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: true, sourceIndicatorAvailable: true },
      "enabled",
      "notion-sources-explicit-all-sources-indicator"
    );
    assert.equal(result.ok, true, "an explicit All sources composer indicator must be sufficient proof");
    assert.equal(result.skipped, true);
    assert.equal(fixture.state.triggerClicks, 0);
    assert.equal(fixture.state.mySourcesClicks, 0);
    assert.equal(fixture.state.toggleClicks, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, useAriaFallback: true, fallbackDistractor: true },
      "enabled",
      "notion-sources-composer-settings-fallback"
    );
    assert.equal(result.ok, true, "a uniquely composer-scoped Settings control must remain a safe fallback");
    assert.equal(fixture.state.triggerClicks, 2, "the composer-scoped owner trigger must open and close only its own Settings root");
    assert.equal(fixture.state.distractorTriggerClicks, 0, "the unrelated global Settings control must be ignored");
    assert.equal(fixture.state.toggleClicks, 1);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        submenuEscapeCloseDelayMs: 1100,
        settingsEscapeIgnored: true,
        triggerIgnoredWhileSubmenuOpen: true
      },
      "enabled",
      "notion-sources-result-waits-for-owned-cleanup"
    );
    assert.equal(
      result.ok,
      true,
      `a successful result must include the bounded owned cleanup: ${JSON.stringify(result)}`
    );
    assert.equal(result.menuClosed, true);
    assert.equal(
      fixture.state.triggerClicks,
      3,
      "owned cleanup may try the verified trigger once under the overlay, then close Settings after the overlay exits"
    );
    assert.equal(fixture.state.submenuOpen, false);
    assert.equal(fixture.state.settingsOpen, false);
    assert.equal(fixture.state.toggleClicks, 1);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, legacyTrigger: true },
      "enabled",
      "notion-sources-legacy-search-scope-trigger"
    );
    assert.equal(result.ok, true, "the legacy exact Notion search-scope trigger must remain supported");
    assert.equal(fixture.state.triggerClicks, 2, "the exact legacy owner trigger must close its Settings root once");
    assert.equal(fixture.state.toggleClicks, 1);
  }

  for (const settingsControlsMode of ["stale", "missing", "wrapper"]) {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, settingsControlsMode },
      "enabled",
      `notion-sources-${settingsControlsMode}-settings-controls`
    );
    assert.equal(
      result.ok,
      true,
      `${settingsControlsMode} aria-controls must fall through to the unique newly opened Settings root: ${JSON.stringify(result)}`
    );
    assert.equal(fixture.state.triggerClicks, 2, "the exact composer trigger must own both open and close");
    assert.equal(fixture.state.mySourcesClicks, 1);
    assert.equal(fixture.state.toggleClicks, 1);
    assert.equal(fixture.state.settingsOpen, false, "the newly opened Settings root must close");
    assert.equal(fixture.state.baselineEscapeDispatches, 0, "cleanup must remain bound to the newly opened root");
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: true, directAllSources: true, mySourcesAvailable: false },
      "enabled",
      "notion-sources-direct-all-sources-already-enabled"
    );
    assert.equal(result.ok, true, `the default All Sources composer state must be readable: ${JSON.stringify(result)}`);
    assert.equal(result.skipped, true);
    assert.equal(fixture.state.mySourcesClicks, 0, "read-only proof must not inspect a direct Settings row");
    assert.equal(fixture.state.toggleClicks, 0);
    assert.equal(fixture.state.triggerClicks, 0, "read-only proof must not open the direct Settings surface");
    assert.equal(fixture.state.settingsOpen, false);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, directAllSources: true, mySourcesAvailable: false },
      "enabled",
      "notion-sources-direct-all-sources-change"
    );
    assert.equal(result.ok, true, `the generic All sources label must support one desired-state change: ${JSON.stringify(result)}`);
    assert.equal(result.changed, true);
    assert.equal(fixture.state.allSourcesEnabled, true);
    assert.equal(fixture.state.mySourcesClicks, 0);
    assert.equal(fixture.state.toggleClicks, 1, "the direct switch must be changed exactly once");
    assert.equal(fixture.state.triggerClicks, 2);
    assert.equal(fixture.state.settingsOpen, false);
  }

  for (const scenario of [
    {
      name: "direct",
      options: { directAllSources: true, mySourcesAvailable: false }
    },
    {
      name: "feature-signature",
      options: { settingsRootText: "Web access Personalize Mode" }
    }
  ]) {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        replaceSettingsRootAfterStateReads: 4,
        ...scenario.options
      },
      "enabled",
      `notion-sources-${scenario.name}-settings-root-replacement`
    );
    assert.equal(
      result.ok,
      true,
      `a same-id ${scenario.name} Settings replacement must retain exact ownership: ${JSON.stringify({ result, state: fixture.state })}`
    );
    assert.equal(fixture.state.settingsRootReplacementActive, true);
    assert.equal(fixture.state.settingsOpen, false, "the rebound replacement root must be closed before success");
    assert.equal(fixture.state.baselineEscapeDispatches, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        settingsControlsMode: "missing",
        settingsRootText: "Web access Personalize Mode"
      },
      "enabled",
      "notion-sources-settings-feature-root"
    );
    assert.equal(
      result.ok,
      true,
      `Template_shortcuts Settings features must identify the unique new root even when root text omits My Sources: ${JSON.stringify(result)}`
    );
    assert.equal(fixture.state.mySourcesClicks, 1, "the verified descendant My Sources row must still open its submenu");
    assert.equal(fixture.state.toggleClicks, 1);
    assert.equal(fixture.state.settingsOpen, false);
    assert.equal(fixture.state.baselineEscapeDispatches, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        settingsControlsMode: "missing",
        duplicateSettingsMenu: true
      },
      "enabled",
      "notion-sources-ambiguous-new-settings-roots"
    );
    assert.equal(result.ok, false, "two newly visible Settings candidates must fail closed");
    assert.equal(result.reason, "sources menu not found");
    assert.equal(result.interactionCount, 1);
    assert.equal(result.menuClosed, false, "unowned ambiguous roots must not be dismissed");
    assert.equal(fixture.state.mySourcesClicks, 0);
    assert.equal(fixture.state.toggleClicks, 0);
    assert.equal(fixture.state.settingsOpen, true);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, decoratedMySourcesRow: true },
      "enabled",
      "notion-sources-decorated-my-sources-row"
    );
    assert.equal(result.ok, true, "a label seed must promote through a verified row whose accessible name prepends Open");
    assert.equal(fixture.state.mySourcesClicks, 1);
    assert.equal(fixture.state.toggleClicks, 1);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        transparentInputToggle: true,
        transparentInputPointerEventsNone: true
      },
      "enabled",
      "notion-sources-transparent-input-switch"
    );
    assert.equal(result.ok, true, "an opacity-zero, pointer-events-none checkbox must be read and activated only through its visible track");
    assert.equal(result.changed, true);
    assert.equal(fixture.state.allSourcesEnabled, true);
    assert.equal(fixture.state.toggleClicks, 1, "the transparent semantic input must still cause exactly one setting change");
    assert.equal(result.interactionCount, 3);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: true, pointerSourceToggleNoop: true },
      "disabled",
      "notion-sources-native-toggle-activation"
    );
    assert.equal(result.ok, true, "the source switch must use native activation after Notion pointer events can replace its node");
    assert.equal(result.changed, true);
    assert.equal(fixture.state.toggleClicks, 1);
    assert.equal(fixture.state.pointerSourceToggleClicks, 0, "the source switch must not use the pointer prelude");
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, transparentInputToggle: true, transparentToggleProxy: false },
      "enabled",
      "notion-sources-transparent-input-without-proxy"
    );
    assert.equal(result.ok, false, "an opacity-zero input without a tightly matching visible proxy must fail closed");
    assert.equal(result.reason, "all sources toggle could not be clicked");
    assert.equal(fixture.state.toggleClicks, 0, "the setter must never fall back to activating the whole row");
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, mySourcesOpenAfterWaitPolls: 4 },
      "enabled",
      "notion-sources-delayed-submenu-open"
    );
    assert.equal(result.ok, true, "a delivered My Sources activation must receive the full bounded portal-open wait");
    assert.equal(fixture.state.mySourcesClicks, 1, "a slow portal must never cause a second toggle-like activation");
    assert.equal(fixture.state.mySourcesChildClicks, 0);
    assert.equal(fixture.state.toggleClicks, 1);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, escapeCloseTarget: "none" },
      "enabled",
      "notion-sources-trigger-close-fallback"
    );
    assert.equal(result.ok, true, "the verified Settings trigger must close menus when target-specific Escape is ignored");
    assert.equal(fixture.state.triggerClicks, 2, "one trigger opens and one verified trigger activation closes the menu");
    assert.equal(result.interactionCount, 3, "owned-menu cleanup must not inflate the write interaction count");
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, settingsEscapeIgnored: true },
      "enabled",
      "notion-sources-submenu-escape-trigger-close"
    );
    assert.equal(result.ok, true, "closing the submenu with Escape must leave enough time for the verified trigger to close Settings");
    assert.equal(fixture.state.triggerClicks, 2, "the trigger must close the remaining Settings menu after the submenu closes");
    assert.equal(fixture.state.escapeDispatches, 0, "a successful exact-owner trigger close must avoid broad Escape dispatch");
    assert.equal(result.interactionCount, 3, "owned-menu cleanup must not inflate the write interaction count");
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        settingsEscapeIgnored: true,
        submenuEscapeClosePolls: 4,
        settingsTriggerClosePolls: 5
      },
      "enabled",
      "notion-sources-animated-close"
    );
    assert.equal(result.ok, true, "Notion's delayed submenu and Settings animations must settle inside the bounded close proof");
    assert.equal(fixture.state.triggerClicks, 2);
    assert.equal(fixture.state.submenuOpen, false);
    assert.equal(fixture.state.settingsOpen, false);
    assert.deepEqual(
      fixture.state.submenuEscapeGenerations,
      [],
      `the exact trigger's animated close must settle before Escape fallback: ${JSON.stringify(fixture.state)}`
    );
    assert.equal(fixture.state.dismissCalls, 0, "owned cleanup must not call the global menu dismiss primitive");
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        documentEscapeListener: true,
        escapeActiveElementInsideRoot: true,
        triggerIgnoredWhileSubmenuOpen: true
      },
      "enabled",
      "notion-sources-single-owned-escape"
    );
    assert.equal(result.ok, true, `owned Escape cleanup must settle: ${JSON.stringify({ result, state: fixture.state })}`);
    assert.equal(fixture.state.documentEscapeDispatches, 1, "one keydown from the active element inside the owned root must reach the document listener");
    assert.equal(fixture.state.baselineGlobalCloseCount, 0);
  }

  {
    const fixture = createSourcesFixture({
      initialState: false,
      modelPreference: true,
      modelItemDisabled: true
    });
    global.document.getElementById = fixture.documentGetElementById;
    global.document.elementFromPoint = fixture.documentElementFromPoint;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      allSourcesState: "enabled",
      runId: "notion-disabled-model-before-sources"
    });
    assert.equal(result.ok, true);
    assert.equal(result.unavailable, true);
    assert.equal(result.fallbackEligible, true);
    assert.equal(result.selectionActivated, false);
    assert.equal(result.menuClosed, true);
    assert.equal(fixture.state.modelTriggerClicks, 1, "availability proof may open only the model menu");
    assert.equal(fixture.state.modelItemClicks, 0, "an unavailable model row must never be activated");
    assert.equal(fixture.state.triggerClicks, 0, "All Sources must wait for the eventual applied model");
    assert.equal(fixture.state.toggleClicks, 0, "an unavailable primary model must not mutate Sources before fallback");
  }

  {
    const fixture = createSourcesFixture({
      initialState: false,
      modelPreference: true,
      submenuNestedInSettings: true,
      submenuEscapeCloseDelayMs: 520
    });
    global.document.getElementById = fixture.documentGetElementById;
    global.document.elementFromPoint = fixture.documentElementFromPoint;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      allSourcesState: "enabled",
      runId: "notion-sources-nested-animated-close"
    });
    assert.equal(
      result.ok,
      true,
      `a nested All Sources layer that exits after 360ms must reveal and close its owned Settings parent before continuing: ${JSON.stringify(result)}`
    );
    assert.equal(result.menuClosed, true);
    assert.equal(fixture.state.modelItemClicks, 1, "the combined transaction must apply its requested model exactly once");
    assert.equal(fixture.state.modelTriggerText, "Gemini 3.1 Pro");
    assert.equal(fixture.state.toggleClicks, 1, "the Sources write must occur exactly once before closure recovery");
    assert.equal(fixture.state.settingsOpen, false);
    assert.equal(fixture.state.submenuOpen, false);
    assert.equal(fixture.state.baselineEscapeDispatches, 0, "closure recovery must never target the baseline overlay");
    assert.equal(
      fixture.state.triggerClicks,
      2,
      "one source write must open and close its exact owned Settings root exactly once"
    );
    assert.deepEqual(
      fixture.state.submenuEscapeGenerations,
      [],
      "each newly owned Settings generation must close through its exact trigger before Escape fallback"
    );
  }

  {
    const fixture = createSourcesFixture({
      initialState: false,
      modelPreference: true,
      submenuNestedInSettings: true,
      escapeCloseTarget: "none"
    });
    global.document.getElementById = fixture.documentGetElementById;
    global.document.elementFromPoint = fixture.documentElementFromPoint;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      allSourcesState: "enabled",
      runId: "notion-sources-nested-trigger-close-fallback"
    });
    assert.equal(
      result.ok,
      true,
      `a verified trigger must close its exact owned Settings root when a nested All Sources layer ignores Escape: ${JSON.stringify({ result, state: fixture.state })}`
    );
    assert.equal(result.menuClosed, true);
    assert.equal(fixture.state.triggerClicks, 2, "one source proof must use one trigger activation to open and one to close the exact owned menu");
    assert.equal(fixture.state.modelItemClicks, 1);
    assert.equal(fixture.state.toggleClicks, 1, "trigger fallback cleanup must never replay the source toggle");
    assert.equal(fixture.state.settingsOpen, false);
    assert.equal(fixture.state.submenuOpen, false);
    assert.equal(fixture.state.baselineEscapeDispatches, 0, "trigger fallback must never target the baseline overlay");
  }

  for (const phase of ["settings", "submenu", "toggle", "close"]) {
    const fixture = createSourcesFixture({
      initialState: false,
      abortAfterSourcesPhase: phase
    });
    global.document.getElementById = fixture.documentGetElementById;
    global.document.elementFromPoint = fixture.documentElementFromPoint;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const first = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "",
      allSourcesState: "enabled",
      runId: `notion-sources-abort-${phase}`
    });
    assert.equal(first.ok, false, `${phase} cancellation must not report success`);
    assert.equal(first.cancelled, true);
    assert.equal(fixture.state.settingsOpen, false, `${phase} cancellation must close the owned Settings root`);
    assert.equal(fixture.state.submenuOpen, false, `${phase} cancellation must close the owned All Sources root`);
    assert.equal(fixture.state.baselineEscapeDispatches, 0, `${phase} cleanup must not target a baseline root`);

    fixture.state.abortAfterSourcesPhase = "";
    fixture.state.abortPhaseTriggered = false;
    const second = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "",
      allSourcesState: "enabled",
      runId: `notion-sources-after-abort-${phase}`
    });
    assert.equal(second.ok, true, `a run after ${phase} cancellation must not inherit an unowned overlay`);
    assert.equal(fixture.state.settingsOpen, false);
    assert.equal(fixture.state.submenuOpen, false);
    assert.equal(fixture.state.baselineEscapeDispatches, 0);
    if (phase === "toggle") {
      assert.equal(fixture.state.toggleClicks, 1, "settlement cleanup and the next run must never replay the toggle");
    }
  }

  {
    const fixture = createSourcesFixture({
      initialState: false,
      abortAfterSourcesPhase: "submenu",
      submenuEscapeClosePolls: 100,
      triggerIgnoredWhileSubmenuOpen: true
    });
    global.document.getElementById = fixture.documentGetElementById;
    global.document.elementFromPoint = fixture.documentElementFromPoint;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const firstPromise = api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "",
      allSourcesState: "enabled",
      runId: "notion-sources-cleanup-barrier-first"
    });
    while (fixture.state.escapeDispatches === 0) {
      await new Promise((resolve) => { setImmediate(resolve); });
    }
    fixture.state.abortAfterSourcesPhase = "";
    fixture.state.abortPhaseTriggered = false;
    const secondPromise = api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "",
      allSourcesState: "enabled",
      runId: "notion-sources-cleanup-barrier-second"
    });
    await Promise.resolve();
    assert.equal(
      fixture.state.triggerClicks,
      2,
      "the first run may open and attempt its exact cleanup trigger, while the superseding run remains blocked"
    );
    fixture.state.submenuOpen = false;
    fixture.state.settingsOpen = false;
    fixture.state.pendingSubmenuClosePolls = 0;
    fixture.state.pendingSettingsClosePolls = 0;
    fixture.state.submenuEscapeClosePolls = 0;
    fixture.state.settingsTriggerClosePolls = 0;
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    assert.equal(first.ok, false);
    assert.equal(first.cancelled, true);
    assert.equal(
      second.ok,
      true,
      `the superseding run must start only after cleanup releases its operation lease: ${JSON.stringify(second)}`
    );
    assert.equal(fixture.state.toggleClicks, 1, "the cancelled pre-toggle run must leave exactly one mutation for its successor");
  }

  {
    const fixture = createSourcesFixture({
      initialState: false,
      modelPreference: true,
      sourceToggleResetsModel: true
    });
    global.document.getElementById = fixture.documentGetElementById;
    global.document.elementFromPoint = fixture.documentElementFromPoint;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      allSourcesState: "enabled",
      runId: "notion-combined-source-change-invalidates-model"
    });
    assert.equal(result.ok, false, "combined application must fail closed if the source mutation changes the selected model");
    assert.equal(result.reason, "model changed while applying sources");
    assert.equal(fixture.state.allSourcesEnabled, true);
    assert.equal(fixture.state.modelTriggerText, "Auto");
    assert.equal(fixture.state.toggleClicks, 1, "the combined path must never replay the source toggle");
    assert.equal(fixture.state.modelTriggerClicks, 1);
    assert.equal(fixture.state.modelItemClicks, 1, "an uncertain source-induced model reset must not be repaired by replaying visible operations");
    assert.equal(fixture.state.triggerClicks, 2, "the failed combined run must still perform only one visible source traversal");
  }

  {
    const fixture = createSourcesFixture({
      initialState: true,
      modelPreference: true,
      sourceTriggerMinWaitMs: 1700
    });
    global.document.getElementById = fixture.documentGetElementById;
    global.document.elementFromPoint = fixture.documentElementFromPoint;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const first = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      allSourcesState: "enabled",
      runId: "notion-combined-delayed-source-trigger"
    });
    assert.equal(first.ok, false, "a source trigger beyond the bounded discovery window must fail without interacting");
    assert.equal(first.reason, "sources trigger not found");
    assert.equal(first.retryable, true, "the controller may safely retry a zero-interaction hydration miss");
    assert.equal(first.interactionCount, 0);
    assert.ok(
      fixture.state.sourceTriggerWaitBudgets.every((timeoutMs) => timeoutMs <= 1700),
      "source discovery must never absorb the remaining combined deadline"
    );
    assert.equal(fixture.state.modelItemClicks, 0, "the model must not be changed before the source preference is available");
    assert.equal(fixture.state.toggleClicks, 0);

    fixture.state.sourceTriggerWaitBudget = 1701;
    const retried = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      allSourcesState: "enabled",
      runId: "notion-combined-delayed-source-trigger-retry"
    });
    assert.equal(retried.ok, true, "a later zero-interaction retry must complete after Notion hydrates");
    assert.equal(fixture.state.modelItemClicks, 1, "the successful retry must apply the model exactly once");
    assert.equal(fixture.state.toggleClicks, 0);
  }

  {
    const fixture = createSourcesFixture({
      initialState: true,
      modelPreference: true,
      sourceTriggerMinWaitMsAfterModelSelection: 2500
    });
    global.document.getElementById = fixture.documentGetElementById;
    global.document.elementFromPoint = fixture.documentElementFromPoint;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      allSourcesState: "enabled",
      runId: "notion-combined-post-interaction-source-hydration"
    });
    assert.equal(
      result.ok,
      true,
      `the single post-model source proof must wait for Notion's portal hydration: ${JSON.stringify(result)}`
    );
    assert.equal(fixture.state.triggerClicks, 0, "post-model read-only proof must not open Settings");
    assert.ok(
      fixture.state.sourceTriggerWaitBudgets.includes(3000),
      "the post-model source proof must receive the dedicated 3s trigger hydration window"
    );
    assert.equal(fixture.state.toggleClicks, 0, "hydration proof must remain read-only");
  }

  {
    const fixture = createSourcesFixture({
      initialState: false,
      modelPreference: true,
      modelSelectionResetsSource: true
    });
    global.document.getElementById = fixture.documentGetElementById;
    global.document.elementFromPoint = fixture.documentElementFromPoint;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "gemini31pro",
      allSourcesState: "enabled",
      runId: "notion-combined-model-first-source-repair"
    });
    assert.equal(result.ok, true, "applying Sources after the model must repair a source scope reset in one traversal");
    assert.equal(fixture.state.allSourcesEnabled, true);
    assert.equal(fixture.state.toggleClicks, 1, "the post-model source traversal must mutate the switch at most once");
    assert.equal(fixture.state.modelItemClicks, 1);
    assert.equal(fixture.state.triggerClicks, 2, "model-first ordering must avoid a second visible Sources operation");
  }

  for (const scenario of [
    { options: { initialState: false, duplicateAllSourcesOverlay: true }, label: "duplicate-overlay", reason: "all sources overlay is ambiguous" },
    { options: { initialState: false, duplicateAllSourcesRow: true }, label: "duplicate-row", reason: "all sources overlay is ambiguous" }
  ]) {
    const { fixture, result } = await runSourcesFixture(
      scenario.options,
      "enabled",
      `notion-sources-${scenario.label}`
    );
    assert.equal(result.ok, false, "independent visible source clones must fail closed");
    assert.equal(result.reason, scenario.reason);
    assert.equal(fixture.state.toggleClicks, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, duplicateSourceIndicator: true },
      "disabled",
      "notion-sources-duplicate-main-indicator"
    );
    assert.equal(result.ok, false, "two independent main-composer source indicators must fail closed");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.triggerClicks, 0);
    assert.equal(fixture.state.mySourcesClicks, 0);
    assert.equal(fixture.state.toggleClicks, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        duplicateSourceIndicator: true,
        duplicateSourceDisabledIconAvailable: false
      },
      "disabled",
      "notion-sources-mixed-main-indicators"
    );
    assert.equal(result.ok, false, "one crossed icon must not hide an independent source popup");
    assert.equal(result.reason, "sources indicator is ambiguous");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.triggerClicks, 0);
    assert.equal(fixture.state.mySourcesClicks, 0);
    assert.equal(fixture.state.toggleClicks, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        sourceIndicatorAvailable: true,
        sourceIndicatorReplacementAfterReads: 2,
        sourceIndicatorReplacementState: false
      },
      "disabled",
      "notion-sources-cross-sample-indicator-replacement"
    );
    assert.equal(result.ok, true, "a replaced composer indicator must earn two fresh stable samples before success");
    assert.equal(result.skipped, true);
    assert.ok(fixture.state.sourceIndicatorScanCount >= 3, "replacement proof must not inherit a sample from the prior element");
    assert.equal(fixture.state.triggerClicks, 0, "read-only replacement proof must never open Settings");
    assert.equal(fixture.state.mySourcesClicks, 0);
    assert.equal(fixture.state.toggleClicks, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: true,
        sourceIndicatorReplacementAfterReads: 2,
        sourceIndicatorReplacementState: false
      },
      "disabled",
      "notion-sources-post-write-indicator-replacement"
    );
    assert.equal(result.ok, true, "a replaced post-write indicator must earn two fresh samples without reopening Settings");
    assert.equal(result.changed, true);
    assert.equal(fixture.state.toggleClicks, 1, "post-write replacement proof must never replay the switch");
    assert.equal(fixture.state.triggerClicks, 2, "post-write replacement proof must not reopen Settings");
    assert.equal(fixture.state.mySourcesClicks, 1);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, replaceAllSourcesChildrenAfterStateReads: 3 },
      "enabled",
      "notion-sources-menu-child-replacement-before-write"
    );
    assert.equal(result.ok, false, "React replacing menu children before the write must fail closed");
    assert.equal(result.reason, "all sources state was not stable");
    assert.equal(fixture.state.toggleClicks, 0, "an unstable pre-write binding must never be activated");
    assert.equal(fixture.state.replacementToggleClicks, 0, "replacement menu controls must never be adopted after delivery uncertainty");
    assert.equal(fixture.state.triggerClicks, 2, "cleanup must close the sole Settings traversal without reopening it");
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: true, replaceAllSourcesChildrenAfterToggle: true },
      "disabled",
      "notion-sources-menu-child-replacement-after-write"
    );
    assert.equal(result.ok, true, "a same-menu React replacement after the one source write must be rebound without replay");
    assert.equal(result.changed, true);
    assert.equal(fixture.state.allSourcesEnabled, false);
    assert.equal(fixture.state.toggleClicks, 1);
    assert.equal(fixture.state.replacementToggleClicks, 0, "post-write rebinding must never click the replacement toggle");
    assert.equal(fixture.state.settingsOpen, false);
  }

  for (const scenario of [
    { initialState: false, desired: "enabled", label: "enable" },
    { initialState: true, desired: "disabled", label: "disable" }
  ]) {
    const { fixture, result } = await runSourcesFixture(
      { initialState: scenario.initialState },
      scenario.desired,
      `notion-sources-${scenario.label}`
    );
    assert.equal(result.ok, true, `${scenario.label} must settle to the requested explicit state`);
    assert.equal(result.changed, true);
    assert.equal(fixture.state.allSourcesEnabled, scenario.desired === "enabled");
    assert.equal(fixture.state.toggleClicks, 1, "the destructive replay guard requires exactly one switch activation");
    assert.equal(result.interactionCount, 3);
    assert.equal(result.menuClosed, true);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, toggleClosesMenus: true },
      "enabled",
      "notion-sources-toggle-closes-menu-main-indicator-proof"
    );
    assert.equal(result.ok, true, "a menu-closing toggle must settle from the main composer without reopening Settings");
    assert.equal(result.changed, true);
    assert.equal(fixture.state.toggleClicks, 1, "main-composer verification must never toggle a second time");
    assert.equal(fixture.state.triggerClicks, 1, "the toggle closes the only Settings traversal; no proof traversal may reopen it");
    assert.equal(fixture.state.mySourcesClicks, 1);
    assert.equal(result.interactionCount, 3);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, sourceIndicatorUpdates: false },
      "enabled",
      "notion-sources-stale-main-indicator-after-write"
    );
    assert.equal(result.ok, false, "a stale main-composer source indicator must fail closed after one delivered write");
    assert.equal(fixture.state.toggleClicks, 1);
    assert.equal(fixture.state.triggerClicks, 2, "stale UI proof must not reopen Settings");
    assert.equal(fixture.state.mySourcesClicks, 1);
    assert.equal(result.retryable, false);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        sourceIndicatorAvailable: true,
        sourceIndicatorReadable: false
      },
      "enabled",
      "notion-sources-unreadable-main-indicator-after-write"
    );
    assert.equal(result.ok, false, "an unreadable composer popup after a write must fail closed");
    assert.equal(fixture.state.toggleClicks, 1);
    assert.equal(fixture.state.triggerClicks, 2, "unreadable UI proof must not reopen Settings");
    assert.equal(fixture.state.mySourcesClicks, 1);
    assert.equal(result.retryable, false);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, sourceIndicatorUpdateAfterReads: 3 },
      "enabled",
      "notion-sources-delayed-main-indicator-settle"
    );
    assert.equal(result.ok, true, "a delayed main-composer indicator update must settle within the bounded proof window");
    assert.equal(fixture.state.toggleClicks, 1);
    assert.equal(fixture.state.triggerClicks, 2, "delayed UI proof must not reopen Settings");
    assert.equal(fixture.state.mySourcesClicks, 1);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { triggerAvailable: false },
      "enabled",
      "notion-sources-no-trigger"
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "sources trigger not found");
    assert.equal(result.retryable, true, "a zero-interaction skeleton miss remains safe to retry");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.toggleClicks, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, narrowComposer: true, viewportWidth: 308 },
      "enabled",
      "notion-sources-narrow-tabbit-pane"
    );
    assert.equal(result.ok, true, "a 308px Tabbit pane must retain the exact composer-scoped Settings trigger");
    assert.equal(result.changed, true);
    assert.equal(fixture.state.triggerClicks, 2, "the narrow-pane operation must keep one owned Settings traversal");
    assert.equal(fixture.state.mySourcesClicks, 1);
    assert.equal(fixture.state.toggleClicks, 1);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, narrowComposer: true },
      "enabled",
      "notion-sources-narrow-composer-in-wide-viewport"
    );
    assert.equal(result.ok, false, "a narrow unrelated prompt in a wide page must remain outside the main-composer scope");
    assert.equal(result.reason, "sources trigger not found");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.triggerClicks, 0);
    assert.equal(fixture.state.toggleClicks, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: true, sourceIndicatorAvailable: true, sourceIndicatorReadable: false },
      "enabled",
      "notion-sources-unknown-composer-menu-popup"
    );
    assert.equal(result.ok, false, "an unknown composer menu-popup must block absence-based All Sources inference");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.triggerClicks, 0);
    assert.equal(fixture.state.mySourcesClicks, 0);
    assert.equal(fixture.state.toggleClicks, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { triggerAvailable: false, preopenAllSources: true },
      "enabled",
      "notion-sources-unowned-global-overlay"
    );
    assert.equal(result.ok, false, "a same-name global overlay without a composer-scoped trigger must not be adopted");
    assert.equal(result.reason, "sources trigger not found");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.toggleClicks, 0);
    assert.equal(fixture.state.escapeDispatches, 0, "an unowned overlay must not even be dismissed by the source setter");
    assert.equal(result.menuClosed, false);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { triggerAvailable: true, preopenAllSources: true },
      "enabled",
      "notion-sources-unowned-overlay-with-trigger"
    );
    assert.equal(result.ok, false, "a scoped trigger must not retroactively own a same-name overlay that was already open");
    assert.equal(result.reason, "unowned all sources overlay is open");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.triggerClicks, 0);
    assert.equal(fixture.state.toggleClicks, 0);
    assert.equal(fixture.state.escapeDispatches, 0);
    assert.equal(result.menuClosed, false);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, preopenSettings: true },
      "enabled",
      "notion-sources-preopen-exact-settings-root"
    );
    assert.equal(result.ok, false, "a Settings root visible before the operation is unowned even when aria-controls points to it");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.triggerClicks, 0, "the setter must not close or reopen a pre-existing exact Settings root");
    assert.equal(fixture.state.mySourcesClicks, 0, "the setter must not traverse My Sources inside an unowned root");
    assert.equal(fixture.state.toggleClicks, 0, "the setter must not mutate a switch inside an unowned root");
    assert.equal(fixture.state.escapeDispatches, 0, "cleanup must not target a pre-existing exact Settings root");
    assert.equal(fixture.state.settingsOpen, true, "the user's pre-existing Settings root must remain open");
    assert.equal(result.menuClosed, false);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        settingsControlsMode: "missing",
        preopenSettingsAfterIndicatorScans: 2
      },
      "enabled",
      "notion-sources-late-preopen-unbound-settings-root"
    );
    assert.equal(result.ok, false, "a Settings root appearing before activation remains unowned without an exact binding");
    assert.equal(result.reason, "unowned sources menu is open");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.triggerClicks, 0, "the setter must not toggle a late pre-open Settings root");
    assert.equal(fixture.state.mySourcesClicks, 0);
    assert.equal(fixture.state.toggleClicks, 0);
    assert.equal(fixture.state.escapeDispatches, 0);
    assert.equal(fixture.state.settingsOpen, true);
    assert.equal(result.menuClosed, false);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { triggerAvailable: true, composerAvailable: false },
      "enabled",
      "notion-sources-unscoped-exact-trigger"
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "sources trigger not found");
    assert.equal(result.retryable, true, "an exact-looking global control without a main-composer proof must fail before delivery");
    assert.equal(result.interactionCount, 0);
    assert.equal(fixture.state.triggerClicks, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { mySourcesAvailable: false },
      "enabled",
      "notion-sources-menu-opened-without-row"
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "my sources row not found");
    assert.equal(result.interactionCount, 1);
    assert.equal(result.retryable, false, "a failure after opening the menu must be terminal");
    assert.equal(fixture.state.toggleClicks, 0);
  }

  for (const scenario of [
    { options: { initialState: false, toggleStateReadable: false }, reason: "all sources toggle state is unreadable", label: "unreadable" },
    { options: { initialState: false, ambiguousToggle: true }, reason: "all sources toggle is ambiguous", label: "ambiguous" },
    { options: { initialState: false, toggleAvailable: false }, reason: "all sources toggle not found", label: "missing" }
  ]) {
    const { fixture, result } = await runSourcesFixture(
      scenario.options,
      "enabled",
      `notion-sources-${scenario.label}-toggle`
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, scenario.reason);
    assert.equal(fixture.state.toggleClicks, 0, "an unproven toggle target must never be activated");
    assert.equal(result.retryable, false, "opening the menu makes an uncertain failure terminal");
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, toggleInSeparateRow: true },
      "enabled",
      "notion-sources-unrelated-toggle-row"
    );
    assert.equal(result.ok, false, "a switch in a different visual row must not bind to the All Sources label");
    assert.equal(result.reason, "all sources toggle not found");
    assert.equal(fixture.state.toggleClicks, 0, "an unrelated switch must never be activated");
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, toggleChanges: false },
      "enabled",
      "notion-sources-does-not-settle"
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "main sources indicator did not settle");
    assert.equal(fixture.state.toggleClicks, 1, "an unconfirmed switch must never be replayed");
    assert.equal(result.retryable, false, "post-activation failure must be terminal");
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        sourceIndicatorAvailable: true,
        sourceDisabledIconAvailable: false,
        sourceIndicatorStateSequence: [
          false, false, true, true, false, false, true, true,
          false, false, true, true, false, false, true, true
        ]
      },
      "disabled",
      "notion-sources-unstable-main-indicator"
    );
    assert.equal(result.ok, false);
    assert.equal(fixture.state.triggerClicks, 0, "an unstable current-state proof must fail without opening Settings");
    assert.equal(fixture.state.toggleClicks, 0, "an unstable current-state proof must fail without changing the setting");
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        submenuEscapeCloseDelayMs: 520,
        settingsEscapeIgnored: true,
        triggerIgnoredWhileSubmenuOpen: true
      },
      "enabled",
      "notion-sources-retry-trigger-after-overlay-close"
    );
    assert.equal(
      result.ok,
      true,
      `the exact Settings trigger may be retried only after its owned overlay disappears: ${JSON.stringify(result)}`
    );
    assert.equal(result.menuClosed, true);
    assert.equal(fixture.state.triggerClicks, 3, "the trigger must open once, be ignored once under the overlay, then close Settings once");
    assert.equal(fixture.state.submenuOpen, false);
    assert.equal(fixture.state.settingsOpen, false);
    assert.equal(fixture.state.toggleClicks, 1);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        closeMenusFail: true,
        collapsedAriaWhileOpen: true
      },
      "enabled",
      "notion-sources-collapsed-aria-does-not-hide-open-root"
    );
    assert.equal(
      fixture.nodes.trigger.getAttribute("aria-expanded"),
      "false",
      "the fixture must keep the owner trigger ARIA-collapsed while its owned roots remain open"
    );
    assert.equal(result.ok, false, "collapsed ARIA alone must never attest that a real owned menu closed");
    assert.equal(result.reason, "sources menu did not close");
    assert.equal(result.menuClosed, false);
    assert.equal(fixture.state.settingsOpen, true);
    assert.equal(fixture.state.submenuOpen, true);
    assert.equal(fixture.state.toggleClicks, 1);
    assert.equal(fixture.state.baselineEscapeDispatches, 0);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      {
        initialState: false,
        submenuNestedInSettings: true,
        residualClosedSubmenuPortal: true
      },
      "enabled",
      "notion-sources-closed-ancestor-residual-portal"
    );
    assert.equal(fixture.state.submenuOpen, false, "Escape must logically close the owned submenu");
    assert.equal(fixture.state.settingsOpen, false, "cleanup must close the owned Settings root");
    assert.equal(fixture.state.residualSubmenuPresent, true, "the old portal child must remain mounted for the regression");
    assert.equal(fixture.nodes.submenuPortal.getAttribute("aria-hidden"), "true");
    assert.equal(fixture.nodes.submenuPortal.getAttribute("data-state"), "closed");
    assert.equal(fixture.nodes.submenuPortal.hasAttribute("inert"), true);
    assert.equal(fixture.nodes.submenuPortal.style.opacity, "0");
    assert.ok(
      fixture.nodes.submenu.getBoundingClientRect().width > 0
        && fixture.nodes.submenu.getBoundingClientRect().height > 0,
      "the residual child menu must retain layout even though its ancestor is semantically closed"
    );
    assert.deepEqual(
      fixture.state.submenuEscapeGenerations,
      [],
      "an exact trigger close must not send Escape merely because its closed portal child remains mounted"
    );
    assert.equal(fixture.state.toggleClicks, 1, "cleanup must never replay the source toggle");
    assert.equal(fixture.state.baselineEscapeDispatches, 0);
    assert.equal(
      result.ok,
      true,
      `a residual menu under an aria-hidden, closed, inert, opacity-zero ancestor must not cause a false failure: ${JSON.stringify(result)}`
    );
    assert.equal(result.menuClosed, true);
  }

  {
    const { fixture, result } = await runSourcesFixture(
      { initialState: false, closeMenusFail: true },
      "enabled",
      "notion-sources-menu-remains-open"
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "sources menu did not close");
    assert.equal(result.menuClosed, false);
    assert.equal(fixture.state.toggleClicks, 1);
    assert.equal(fixture.state.settingsOpen, true, "a truly persistent owned Settings root must remain a fail-closed result");
    assert.equal(fixture.state.submenuOpen, true, "a truly persistent owned overlay must remain a fail-closed result");
    assert.equal(fixture.state.baselineEscapeDispatches, 0, "persistent cleanup failure must never target a baseline Settings root");
  }

  {
    const fixture = createSourcesFixture();
    global.document.getElementById = fixture.documentGetElementById;
    const api = createPreferredNotionDeepSeekCapability(fixture.dependencies);
    const result = await api.runPreferredModelApply({
      appId: "NotionAI",
      modelId: "",
      allSourcesState: "sometimes",
      runId: "notion-sources-invalid-state"
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "unknown all sources state");
    assert.equal(result.interactionCount, 0);
  }

  console.log("Notion preferred-model and All Sources desired-state paths: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
