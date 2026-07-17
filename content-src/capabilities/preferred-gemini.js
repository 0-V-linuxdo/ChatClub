export function createPreferredGeminiCapability(deps = {}) {
  const {
    compactModelText,
    firstVisibleBySelectors,
    modelElementText,
    visible,
    matches,
    modelRect,
    visibleSelectorElements,
    modelElementArea,
    assertPreferredModelRun,
    waitForPreferredModel,
    requestGeminiModelPickerBridgeOpen,
    preferredModelActivate,
    closest,
    isDisabledElement,
    qsa,
    modelTextIncludes,
    parseBooleanAttr,
    armPreferredModelFocusShield,
    modelEventConstructor,
    preferredModelResult
  } = deps;
  const GEMINI_MODEL_TARGETS = Object.freeze({
    pro: Object.freeze({ id: "pro", labels: ["3.1 Pro", "Advanced math and code"] }),
    thinking: Object.freeze({ id: "thinking", labels: ["Standard", "Best for most questions"] }),
    extended: Object.freeze({ id: "extended", labels: ["Extended", "Complex problem solving"] }),
    fast: Object.freeze({ id: "fast", labels: ["3.1 Flash-Lite", "Flash-Lite", "Fastest answers"] }),
    flash35: Object.freeze({ id: "flash35", labels: ["3.5 Flash", "All-around help"] })
  });

  const GEMINI_MODEL_BUTTON_SELECTORS = Object.freeze([
    "button[aria-label='Open mode picker']",
    "button[aria-label^='Open mode picker' i]",
    "bard-mode-switcher button[aria-label='Open mode picker']",
    "bard-mode-switcher button",
    "button[aria-label*='mode picker' i]",
    "button[aria-label*='model' i]"
  ]);

  const GEMINI_MODEL_MENU_ROOT_SELECTORS = Object.freeze([
    "gem-mode-menu",
    ".cdk-overlay-pane",
    ".cdk-overlay-container .cdk-overlay-pane",
    ".cdk-overlay-container [role='menu']",
    ".cdk-overlay-container [role='listbox']",
    ".cdk-overlay-container [role='dialog']",
    ".cdk-overlay-pane .gds-mode-switch-menu.mat-mdc-menu-panel",
    ".cdk-overlay-pane .gds-mode-switch-menu",
    ".cdk-overlay-pane .mat-mdc-menu-panel[role='menu']",
    ".cdk-overlay-pane .mat-mdc-menu-panel",
    ".cdk-overlay-pane .mat-menu-panel[role='menu']",
    ".cdk-overlay-pane .mat-menu-panel",
    ".cdk-overlay-pane [role='menu']",
    ".cdk-overlay-pane [role='listbox']",
    ".gds-mode-switch-menu",
    ".mat-mdc-menu-panel[role='menu']",
    ".mat-mdc-menu-panel",
    ".mat-menu-panel[role='menu']",
    ".mat-menu-panel",
    "[role='menu']",
    "[role='listbox']",
    "[role='dialog']"
  ]);

  const GEMINI_MODEL_ITEM_SELECTORS = Object.freeze([
    "gem-menu-item",
    "button.bard-mode-list-button[role='menuitemradio']",
    ".bard-mode-list-button",
    "button[role='menuitemradio']",
    "button[role='menuitem']",
    "button[role='option']",
    "button[role='button']",
    "button[aria-haspopup='menu']",
    "button[mat-menu-item]",
    "button.mat-mdc-menu-item",
    "[role='menuitemradio']",
    "[role='menuitem']",
    "[role='option']",
    "[role='button']",
    "mat-list-option",
    "mat-selection-list mat-list-option",
    "[tabindex]:not([tabindex='-1'])",
    "button",
    "div",
    "span"
  ]);

  function geminiModelKeysFromText(value) {
    const token = compactModelText(value);
    const keys = new Set();
    if (!token) return keys;
    const hasFlashLite = /(^|[^a-z0-9])flash\s*-?\s*lite([^a-z0-9]|$)/.test(token) ||
      /(^|[^a-z0-9])3\s*\.?\s*1\s*flash\s*-?\s*lite([^a-z0-9]|$)/.test(token) ||
      token.includes("fastest answers");
    if (/(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token) || token.includes("complex problem solving")) keys.add("extended");
    if (/(^|[^a-z0-9])standard([^a-z0-9]|$)/.test(token) || token.includes("best for most questions")) keys.add("thinking");
    if (
      /(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token) ||
      /(^|[^a-z0-9])gemini\s+pro([^a-z0-9]|$)/.test(token) ||
      /(^|[^a-z0-9])pro([^a-z0-9]|$)/.test(token) ||
      token.includes("advanced math and code")
    ) {
      keys.add("pro");
    }
    if (hasFlashLite) {
      keys.add("fast");
    }
    if (
      /(^|[^a-z0-9])3\s*\.?\s*5\s*flash([^a-z0-9]|$)/.test(token) ||
      token.includes("all-around help") ||
      (!hasFlashLite && /(^|[^a-z0-9])flash([^a-z0-9]|$)/.test(token))
    ) {
      keys.add("flash35");
    }
    return keys;
  }

  function geminiModelKeyFromText(value) {
    const keys = Array.from(geminiModelKeysFromText(value));
    return keys.length === 1 ? keys[0] : "";
  }

  function inferGeminiModelKey(value) {
    const token = compactModelText(value);
    if (!token) return "";
    const key = geminiModelKeyFromText(value);
    if (key) return key;
    if (/(^|[^a-z0-9])extended\s+thinking([^a-z0-9]|$)/.test(token)) return "extended";
    if (/(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token)) return "extended";
    if (/(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token)) return "pro";
    if (/(^|[^a-z0-9])gemini\s+pro([^a-z0-9]|$)/.test(token)) return "pro";
    if (/(^|[^a-z0-9])thinking\s+level([^a-z0-9]|$)/.test(token)) return "thinking";
    if (/(^|[^a-z0-9])3\s*\.?\s*5\s*flash([^a-z0-9]|$)/.test(token)) return "flash35";
    if (/(^|[^a-z0-9])3\s*\.?\s*1\s*flash\s*-?\s*lite([^a-z0-9]|$)/.test(token)) return "fast";
    if (["pro", "thinking", "extended", "fast", "flash35"].includes(token)) return token;
    if (/(^|[^a-z0-9])pro([^a-z0-9]|$)/.test(token)) return "pro";
    if (/(^|[^a-z0-9])thinking([^a-z0-9]|$)/.test(token)) return "thinking";
    if (/(^|[^a-z0-9])fast([^a-z0-9]|$)/.test(token)) return "fast";
    if (/(^|[^a-z0-9])flash([^a-z0-9]|$)/.test(token)) return "flash35";
    return "";
  }

  function currentGeminiPickerState() {
    const button = firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS);
    if (!button) return { button: null, label: "", baseModelId: "", thinkingLevel: "" };
    const label = String(button.getAttribute?.("aria-label") || modelElementText(button) || "");
    const keys = geminiModelKeysFromText(label);
    const baseModelId = ["fast", "flash35", "pro"].find((key) => keys.has(key)) || (() => {
      const inferred = inferGeminiModelKey(label);
      return ["fast", "flash35", "pro"].includes(inferred) ? inferred : "";
    })();
    const token = compactModelText(label);
    const thinkingLevel = baseModelId === "pro"
      ? (keys.has("extended") || /\bextended(?:\s+thinking)?\b/.test(token) ? "extended" : "standard")
      : "";
    return { button, label, baseModelId, thinkingLevel };
  }

  function currentGeminiModelKey() {
    return currentGeminiPickerState().baseModelId;
  }

  function currentGeminiModelHasKey(modelId) {
    const state = currentGeminiPickerState();
    if (modelId === "extended") return state.baseModelId === "pro" && state.thinkingLevel === "extended";
    if (modelId === "thinking") return state.baseModelId === "pro" && state.thinkingLevel === "standard";
    return state.baseModelId === modelId;
  }

  function geminiThinkingLevelModelId(value) {
    const token = String(value || "").trim().toLowerCase();
    if (token === "extended") return "extended";
    if (token === "standard" || token === "thinking") return "thinking";
    return "";
  }

  function scoreGeminiModelMenuRoot(root) {
    if (!root || !visible(root)) return 0;
    const text = modelElementText(root);
    const token = compactModelText(text);
    if (!token) return 0;
    const keys = geminiModelKeysFromText(text);
    let score = keys.size * 80;
    if (token.includes("thinking level")) score += 60;
    if (token.includes("select a model") || token.includes("mode picker")) score += 40;
    if (token.includes("gemini") || token.includes("flash")) score += 15;
    if (matches(root, ".cdk-overlay-pane, .gds-mode-switch-menu, .mat-mdc-menu-panel, .mat-menu-panel, [role='menu'], [role='listbox']")) score += 25;
    const rect = modelRect(root);
    if (rect) {
      if (rect.height >= 100 && rect.width >= 180) score += 20;
      if (rect.height > window.innerHeight * 0.9 || rect.width > window.innerWidth * 0.9) score -= 120;
    }
    if (keys.size < 2 && !token.includes("thinking level")) score -= 120;
    return score;
  }

  function geminiModelMenuRootCandidates() {
    const candidates = visibleSelectorElements(GEMINI_MODEL_MENU_ROOT_SELECTORS)
      .map((element, index) => ({
        element,
        index,
        score: scoreGeminiModelMenuRoot(element),
        area: modelElementArea(element)
      }))
      .filter((candidate) => candidate.score > 0);
    candidates.sort((a, b) => b.score - a.score || b.area - a.area || b.index - a.index);
    return candidates;
  }

  function geminiModelMenuRoot() {
    const candidates = geminiModelMenuRootCandidates();
    return candidates[0]?.element || null;
  }

  function geminiModelMenuRoots() {
    return geminiModelMenuRootCandidates().map((candidate) => candidate.element);
  }

  async function openGeminiModelMenu(context) {
    assertPreferredModelRun(context);
    context.geminiMenuFailureTerminal = false;
    const existing = geminiModelMenuRoot();
    if (existing) return existing;
    const trigger = await waitForPreferredModel(context, () => firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS), 10000, 150);
    if (!trigger) return null;
    const bridgeResult = await requestGeminiModelPickerBridgeOpen(context, 1200);
    if (bridgeResult?.cancelled === true || bridgeResult?.stale === true) {
      context.abortKind = "cancel";
      context.abortReason = String(bridgeResult.reason || "Gemini model picker bridge run was cancelled");
      try { context.controller.abort(context.abortReason); } catch { try { context.controller.abort(); } catch {} }
      assertPreferredModelRun(context);
    }
    let root = await waitForPreferredModel(context, geminiModelMenuRoot, 1400, 80);
    if (root) return root;
    if (bridgeResult?.activated === true || bridgeResult?.alreadyOpen === true) {
      context.geminiMenuFailureTerminal = true;
      return null;
    }
    if (String(bridgeResult?.reason || "").toLowerCase().includes("timeout")) {
      context.geminiMenuFailureTerminal = true;
      return null;
    }
    if (!preferredModelActivate(context, trigger)) return null;
    root = await waitForPreferredModel(context, geminiModelMenuRoot, 1400, 80);
    return root || null;
  }

  function geminiModelItemRow(element, root) {
    if (!element || !root || element === root || !root.contains?.(element)) return null;
    const direct = closest(element, [
      "gem-menu-item",
      "button",
      "[role='menuitemradio']",
      "[role='menuitem']",
      "[role='option']",
      "[role='button']",
      "mat-list-option",
      ".bard-mode-list-button",
      ".mat-mdc-menu-item",
      ".mat-menu-item",
      "[tabindex]:not([tabindex='-1'])"
    ].join(", "));
    if (direct && root.contains(direct) && direct !== root) return direct;
    let node = element;
    for (let guard = 0; node && node !== root && guard < 6; guard += 1, node = node.parentElement) {
      const rect = modelRect(node);
      if (!rect || rect.height < 18 || rect.height > 140) continue;
      if (modelElementArea(node) > modelElementArea(root) * 0.92) continue;
      if (compactModelText(modelElementText(node))) return node;
    }
    return null;
  }

  function geminiModelItems(root) {
    if (!root) return [];
    const rows = [];
    const seen = new Set();
    const rootArea = Math.max(1, modelElementArea(root));
    const add = (element) => {
      const row = geminiModelItemRow(element, root);
      if (!row || seen.has(row) || !visible(row) || isDisabledElement(row)) return;
      if (row === root || modelElementArea(row) > rootArea * 0.92) return;
      const text = modelElementText(row);
      if (!compactModelText(text)) return;
      seen.add(row);
      rows.push(row);
    };
    for (const element of visibleSelectorElements(GEMINI_MODEL_ITEM_SELECTORS, root)) add(element);
    return rows;
  }

  function geminiCompactMenuRows(root) {
    if (!root) return [];
    const rows = [];
    const seen = new Set();
    const rootArea = Math.max(1, modelElementArea(root));
    for (const element of qsa("*", root)) {
      if (!visible(element)) continue;
      let row = element;
      for (let node = element; node && node !== root; node = node.parentElement) {
        const rect = modelRect(node);
        if (!rect) continue;
        const area = rect.width * rect.height;
        if (rect.width > 80 && rect.height >= 30 && rect.height <= 96 && area < rootArea * 0.85) {
          row = node;
          break;
        }
      }
      if (!row || seen.has(row) || row === root || !visible(row) || isDisabledElement(row)) continue;
      const text = modelElementText(row);
      if (!compactModelText(text)) continue;
      seen.add(row);
      rows.push(row);
    }
    rows.sort((a, b) => modelElementArea(a) - modelElementArea(b));
    return rows;
  }

  function geminiTargetMatchesText(modelId, value) {
    const token = compactModelText(value);
    if (!token) return false;
    if (modelId === "pro") return /(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token) || token.includes("advanced math and code");
    if (modelId === "thinking") return /(^|[^a-z0-9])standard([^a-z0-9]|$)/.test(token) || token.includes("best for most questions");
    if (modelId === "extended") return /(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token) || token.includes("complex problem solving");
    if (modelId === "fast") {
      return /(^|[^a-z0-9])flash\s*-?\s*lite([^a-z0-9]|$)/.test(token) ||
        /(^|[^a-z0-9])3\s*\.?\s*1\s*flash\s*-?\s*lite([^a-z0-9]|$)/.test(token) ||
        token.includes("fastest answers");
    }
    if (modelId === "flash35") {
      const hasFlashLite = /(^|[^a-z0-9])flash\s*-?\s*lite([^a-z0-9]|$)/.test(token);
      return /(^|[^a-z0-9])3\s*\.?\s*5\s*flash([^a-z0-9]|$)/.test(token) ||
        token.includes("all-around help") ||
        (!hasFlashLite && /(^|[^a-z0-9])flash([^a-z0-9]|$)/.test(token));
    }
    return false;
  }

  function scoreGeminiModelItem(item, modelId) {
    const text = modelElementText(item);
    if (!geminiTargetMatchesText(modelId, text)) return -1;
    const token = compactModelText(text);
    const keys = geminiModelKeysFromText(text);
    const rect = modelRect(item);
    let score = 100;
    if (keys.size === 1 && keys.has(modelId)) score += 80;
    if (keys.size > 1) score -= 120;
    if (matches(item, "button, [role='menuitemradio'], [role='menuitem'], [role='option'], [role='button'], mat-list-option")) score += 35;
    if (modelId === "thinking" && token.includes("thinking level")) score -= 220;
    if (modelId === "extended" && token.includes("thinking level") && !/(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token)) score -= 160;
    if (modelId === "thinking" && /(^|[^a-z0-9])standard([^a-z0-9]|$)/.test(token)) score += 70;
    if (modelId === "extended" && /(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token)) score += 70;
    if (modelId === "fast" && /flash\s*-?\s*lite/.test(token)) score += 70;
    if (modelId === "flash35" && /(^|[^a-z0-9])3\s*\.?\s*5\s*flash([^a-z0-9]|$)/.test(token)) score += 70;
    if (modelId === "pro" && /(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token)) score += 70;
    if (rect) {
      if (rect.height >= 26 && rect.height <= 96) score += 20;
      if (rect.width < 80 || rect.height < 18) score -= 80;
    }
    return score;
  }

  function findGeminiModelItem(root, modelId) {
    const candidates = geminiModelItems(root)
      .map((item, index) => ({
        item,
        index,
        score: scoreGeminiModelItem(item, modelId),
        area: modelElementArea(item)
      }))
      .filter((candidate) => candidate.score >= 0);
    candidates.sort((a, b) => b.score - a.score || a.area - b.area || a.index - b.index);
    return candidates[0]?.item || null;
  }

  function findGeminiModelItemInMenus(modelId) {
    for (const root of geminiModelMenuRoots()) {
      const item = findGeminiModelItem(root, modelId);
      if (item) return { root, item };
    }
    return { root: null, item: null };
  }

  function scoreGeminiThinkingLevelRow(row) {
    const token = compactModelText(modelElementText(row));
    if (!token || !token.includes("thinking level")) return -1;
    const rect = modelRect(row);
    let score = 100;
    if (matches(row, "button, [role='menuitemradio'], [role='menuitem'], [role='button'], [aria-haspopup='menu'], [aria-haspopup='true'], [tabindex]:not([tabindex='-1'])")) score += 50;
    if (token.includes("standard") || token.includes("extended")) score += 30;
    if (rect) {
      if (rect.width >= 120 && rect.height >= 30 && rect.height <= 96) score += 30;
      if (rect.width < 80 || rect.height < 24) score -= 70;
    }
    return score;
  }

  function findGeminiThinkingLevelRows(root) {
    if (!root) return [];
    const seen = new Set();
    const rows = [];
    const add = (row) => {
      if (!row || seen.has(row) || !visible(row) || isDisabledElement(row)) return;
      const score = scoreGeminiThinkingLevelRow(row);
      if (score < 0) return;
      seen.add(row);
      rows.push({ row, score, area: modelElementArea(row) });
    };
    for (const row of geminiCompactMenuRows(root)) add(row);
    for (const item of geminiModelItems(root)) {
      if (isGeminiThinkingSubmenuItem(item)) add(item);
    }
    rows.sort((a, b) => b.score - a.score || b.area - a.area);
    return rows.map((entry) => entry.row);
  }

  function findGeminiThinkingLevelRow(root) {
    return findGeminiThinkingLevelRows(root)[0] || null;
  }

  function findGeminiThinkingLevelOption(root, modelId) {
    if (modelId !== "thinking" && modelId !== "extended") return null;
    const row = geminiCompactMenuRows(root)
      .filter((row) => {
        const text = modelElementText(row);
        const token = compactModelText(text);
        if (!token || token.includes("thinking level")) return false;
        const keys = geminiModelKeysFromText(text);
        if (modelId === "thinking" && keys.has("extended")) return false;
        if (modelId === "extended" && keys.has("thinking")) return false;
        return geminiTargetMatchesText(modelId, text);
      })
      .sort((a, b) => modelElementArea(a) - modelElementArea(b))[0] || null;
    return geminiActualMenuItem(row, root) || row;
  }

  function findGeminiThinkingLevelOptionInMenus(modelId) {
    for (const root of geminiModelMenuRoots()) {
      const item = findGeminiThinkingLevelOption(root, modelId);
      if (item) return { root, item };
    }
    return { root: null, item: null };
  }

  function geminiThinkingLevelHeaderKey(root) {
    const row = findGeminiThinkingLevelRow(root);
    const token = compactModelText(modelElementText(row));
    if (!token || !token.includes("thinking level")) return "";
    const after = token.split("thinking level").slice(1).join("thinking level").trim();
    if (/^extended([^a-z0-9]|$)/.test(after)) return "extended";
    if (/^standard([^a-z0-9]|$)/.test(after)) return "thinking";
    return "";
  }

  function geminiThinkingLevelOptionIsSelected(root, modelId) {
    const option = findGeminiThinkingLevelOption(root, modelId);
    if (option && (geminiElementHasSelectedState(option) || modelTextIncludes(modelElementText(option), "Selected"))) return true;
    return geminiThinkingLevelHeaderKey(root) === modelId;
  }

  function isGeminiThinkingSubmenuItem(item) {
    if (!item || !modelTextIncludes(modelElementText(item), "Thinking")) return false;
    let node = item;
    for (let guard = 0; node && node.nodeType === 1 && guard < 4; guard += 1, node = node.parentElement) {
      const popup = String(node.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
      if (popup === "menu" || popup === "true") return true;
    }
    return modelTextIncludes(modelElementText(item), "Thinking level");
  }

  function geminiActualMenuItem(element, root = null) {
    if (!element) return null;
    const item = element.closest?.("gem-menu-item, button[role='menuitemradio'], button[role='menuitem'], [role='menuitemradio'], [role='menuitem'], [role='option'], mat-list-option") || null;
    if (!item || (root && !root.contains?.(item))) return null;
    return item;
  }

  function findGeminiExtendedThinkingToggle(root) {
    if (!root) return null;
    const candidates = [
      ...qsa("gem-menu-item", root, { all: true }),
      ...geminiModelItems(root)
    ];
    const seen = new Set();
    for (const candidate of candidates) {
      const item = geminiActualMenuItem(candidate, root) || candidate;
      if (!item || seen.has(item) || !visible(item) || isDisabledElement(item)) continue;
      seen.add(item);
      const token = compactModelText(modelElementText(item));
      if (/\bextended\s+thinking\b/.test(token)) return item;
    }
    return null;
  }

  function geminiElementHasSelectedState(element) {
    if (!element) return false;
    const actualItem = geminiActualMenuItem(element);
    const candidates = actualItem && String(actualItem.tagName || "").toLowerCase() === "gem-menu-item"
      ? [actualItem]
      : [element, ...qsa("*", element).slice(0, 20)];
    for (let node = element.parentElement, guard = 0; node && guard < 5; node = node.parentElement, guard += 1) {
      if (String(node.tagName || "").toLowerCase() === "gem-mode-menu") break;
      candidates.push(node);
    }
    for (const node of candidates) {
      if (node.hasAttribute?.("selected") && String(node.getAttribute?.("selected") || "").trim().toLowerCase() !== "false") return true;
      if (node.hasAttribute?.("checked") && String(node.getAttribute?.("checked") || "").trim().toLowerCase() !== "false") return true;
      if (parseBooleanAttr(node.getAttribute?.("aria-checked")) === true) return true;
      if (parseBooleanAttr(node.getAttribute?.("aria-selected")) === true) return true;
      if (parseBooleanAttr(node.getAttribute?.("aria-pressed")) === true) return true;
      const dataState = String(node.getAttribute?.("data-state") || "").trim().toLowerCase();
      if (["checked", "selected", "active"].includes(dataState)) return true;
      const dataSelected = parseBooleanAttr(node.getAttribute?.("data-selected"));
      if (dataSelected === true) return true;
      const className = typeof node.className === "string" ? node.className : String(node.className?.baseVal || "");
      if (/(^|\s)(selected|is-selected|checked|is-checked|active|mdc-list-item--selected|mat-mdc-menu-item-highlighted)(\s|$)/i.test(className)) return true;
    }
    return false;
  }

  function selectedGeminiModelKey(root) {
    if (!root) return "";
    const selected = geminiModelItems(root)
      .filter(geminiElementHasSelectedState)
      .map((item) => ({ item, key: geminiModelKeyFromText(modelElementText(item)), score: modelElementArea(item) }))
      .filter((entry) => entry.key);
    selected.sort((a, b) => a.score - b.score);
    return selected[0]?.key || "";
  }

  function isGeminiTargetSelected(root, modelId) {
    if (modelId === "thinking" || modelId === "extended") return geminiThinkingLevelOptionIsSelected(root, modelId);
    const item = findGeminiModelItem(root, modelId);
    return Boolean(item && geminiElementHasSelectedState(item));
  }

  async function dismissPreferredModelMenu(context, getMenuRoot, timeoutMs = 700) {
    assertPreferredModelRun(context);
    const getter = typeof getMenuRoot === "function" ? getMenuRoot : () => null;
    if (!getter()) return true;
    armPreferredModelFocusShield(context);
    const KeyboardEventCtor = modelEventConstructor("KeyboardEvent", document);
    if (typeof KeyboardEventCtor === "function") {
      try {
        document.dispatchEvent(new KeyboardEventCtor("keydown", {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
          composed: true
        }));
      } catch {}
    }
    return Boolean(await waitForPreferredModel(context, () => !getter(), timeoutMs, 80));
  }

  function geminiPickerMatches(baseModelId, thinkingModelId = "") {
    const state = currentGeminiPickerState();
    if (baseModelId && state.baseModelId !== baseModelId) return false;
    if (thinkingModelId === "extended") return state.baseModelId === "pro" && state.thinkingLevel === "extended";
    if (thinkingModelId === "thinking") return state.baseModelId === "pro" && state.thinkingLevel === "standard";
    return Boolean(state.baseModelId);
  }

  async function waitGeminiPickerSettled(context, baseModelId, thinkingModelId = "") {
    return Boolean(await waitForPreferredModel(
      context,
      () => geminiPickerMatches(baseModelId, thinkingModelId),
      2600,
      100
    ));
  }

  async function applyGeminiBaseModelTarget(context, modelId) {
    assertPreferredModelRun(context);
    if (currentGeminiPickerState().baseModelId === modelId) {
      return preferredModelResult(context, true, "Gemini", modelId, "", { skipped: true });
    }
    const root = await openGeminiModelMenu(context);
    if (!root) return preferredModelResult(context, false, "Gemini", modelId, "model menu not found", {
      retryable: context.geminiMenuFailureTerminal !== true
    });
    if (currentGeminiPickerState().baseModelId === modelId) {
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return preferredModelResult(context, true, "Gemini", modelId, "", { skipped: true, menuClosed });
    }
    const found = findGeminiModelItemInMenus(modelId);
    const foundRoot = found.root || root;
    const item = geminiActualMenuItem(found.item || findGeminiModelItem(foundRoot, modelId), foundRoot) || found.item || findGeminiModelItem(foundRoot, modelId);
    if (!item) {
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return preferredModelResult(context, false, "Gemini", modelId, "target model item not found", { menuClosed });
    }
    if (!preferredModelActivate(context, item)) {
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return preferredModelResult(context, false, "Gemini", modelId, "target model item could not be clicked", { menuClosed });
    }
    const settled = await waitGeminiPickerSettled(context, modelId);
    const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
    return settled
      ? preferredModelResult(context, true, "Gemini", modelId, "", { changed: true, menuClosed })
      : preferredModelResult(context, false, "Gemini", modelId, "selection did not settle", { menuClosed });
  }

  async function applyGeminiThinkingTarget(context, modelId) {
    assertPreferredModelRun(context);
    const desiredLevel = modelId === "extended" ? "extended" : "standard";
    if (geminiPickerMatches("pro", modelId)) {
      return preferredModelResult(context, true, "Gemini", "pro", "", { skipped: true, thinkingLevel: desiredLevel });
    }
    const root = await openGeminiModelMenu(context);
    if (!root) return preferredModelResult(context, false, "Gemini", "pro", "model menu not found", {
      retryable: context.geminiMenuFailureTerminal !== true,
      thinkingLevel: desiredLevel
    });
    if (geminiPickerMatches("pro", modelId)) {
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return preferredModelResult(context, true, "Gemini", "pro", "", { skipped: true, thinkingLevel: desiredLevel, menuClosed });
    }

    const toggle = findGeminiExtendedThinkingToggle(root);
    let item = null;
    if (toggle) {
      const selected = geminiElementHasSelectedState(toggle);
      const shouldBeSelected = modelId === "extended";
      if (selected === shouldBeSelected) {
        const settled = await waitGeminiPickerSettled(context, "pro", modelId);
        const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
        return settled
          ? preferredModelResult(context, true, "Gemini", "pro", "", { skipped: true, thinkingLevel: desiredLevel, menuClosed })
          : preferredModelResult(context, false, "Gemini", "pro", "thinking level did not settle", { thinkingLevel: desiredLevel, menuClosed });
      }
      item = toggle;
    } else {
      const option = findGeminiThinkingLevelOptionInMenus(modelId);
      const optionRoot = option.root || root;
      item = geminiActualMenuItem(option.item || findGeminiThinkingLevelOption(optionRoot, modelId), optionRoot) || option.item || findGeminiThinkingLevelOption(optionRoot, modelId);
      if (item && geminiElementHasSelectedState(item)) {
        const settled = await waitGeminiPickerSettled(context, "pro", modelId);
        const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
        return settled
          ? preferredModelResult(context, true, "Gemini", "pro", "", { skipped: true, thinkingLevel: desiredLevel, menuClosed })
          : preferredModelResult(context, false, "Gemini", "pro", "thinking level did not settle", { thinkingLevel: desiredLevel, menuClosed });
      }
    }

    if (!item) {
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return preferredModelResult(context, false, "Gemini", "pro", "thinking level item not found", { thinkingLevel: desiredLevel, menuClosed });
    }
    if (!preferredModelActivate(context, item)) {
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return preferredModelResult(context, false, "Gemini", "pro", "thinking level item could not be clicked", { thinkingLevel: desiredLevel, menuClosed });
    }
    const settled = await waitGeminiPickerSettled(context, "pro", modelId);
    const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
    return settled
      ? preferredModelResult(context, true, "Gemini", "pro", "", { changed: true, thinkingLevel: desiredLevel, menuClosed })
      : preferredModelResult(context, false, "Gemini", "pro", "selection did not settle", { thinkingLevel: desiredLevel, menuClosed });
  }

  async function applyGeminiPreferredModel(context, modelId, options = {}) {
    if (!GEMINI_MODEL_TARGETS[modelId]) return preferredModelResult(context, false, "Gemini", modelId, "unknown model");
    if (modelId === "thinking" || modelId === "extended") return applyGeminiThinkingTarget(context, modelId);
    const thinkingModelId = modelId === "pro" ? geminiThinkingLevelModelId(options?.thinkingLevel) : "";
    if (modelId === "pro" && options?.thinkingLevel && !thinkingModelId) {
      return preferredModelResult(context, false, "Gemini", modelId, "unknown thinking level");
    }
    if (geminiPickerMatches(modelId, thinkingModelId)) {
      return preferredModelResult(context, true, "Gemini", modelId, "", {
        skipped: true,
        ...(thinkingModelId ? { thinkingLevel: options.thinkingLevel } : {})
      });
    }

    let baseResult = null;
    if (currentGeminiPickerState().baseModelId !== modelId) {
      baseResult = await applyGeminiBaseModelTarget(context, modelId);
      if (!baseResult.ok) return baseResult;
    }
    let thinkingResult = null;
    if (thinkingModelId && !geminiPickerMatches("pro", thinkingModelId)) {
      thinkingResult = await applyGeminiThinkingTarget(context, thinkingModelId);
      if (!thinkingResult.ok) return thinkingResult;
    }
    const changed = Boolean(baseResult?.changed || thinkingResult?.changed);
    return preferredModelResult(context, true, "Gemini", modelId, "", {
      skipped: !changed,
      changed,
      ...(thinkingModelId ? { thinkingLevel: options.thinkingLevel } : {}),
      baseApplied: Boolean(baseResult?.changed),
      thinkingApplied: Boolean(thinkingResult?.changed),
      menuClosed: thinkingResult?.menuClosed ?? baseResult?.menuClosed
    });
  }
  return Object.freeze({
    applyGeminiPreferredModel,
    dismissPreferredModelMenu
  });
}
