export function createPreferredGrokCapability(deps = {}) {
  const {
    alnumModelToken,
    modelElementArea,
    modelRect,
    visible,
    isDisabledElement,
    modelElementText,
    visibleSelectorElements,
    normalize,
    qsa,
    qs,
    compactModelText,
    matches,
    closest,
    parseBooleanAttr,
    assertPreferredModelRun,
    waitForPreferredModel,
    preferredModelPointerActivate,
    preferredModelSleep,
    preferredModelResult,
    dismissPreferredModelMenu,
    preferredModelActivate
  } = deps;
  const GROK_MODEL_TARGETS = Object.freeze({
    auto: Object.freeze({ id: "auto", aliases: ["auto", "model auto"] }),
    fast: Object.freeze({ id: "fast", aliases: ["fast", "model fast"] }),
    expert: Object.freeze({ id: "expert", aliases: ["expert", "model expert"] }),
    grok43: Object.freeze({ id: "grok43", aliases: ["grok 4.3", "grok43", "grok 4.3 beta", "grok43beta", "model grok 4.3"] }),
    heavy: Object.freeze({ id: "heavy", aliases: ["heavy", "model heavy"] })
  });

  const GROK_MODEL_MENU_ROOT_SELECTORS = Object.freeze([
    "[role='menu']",
    "[role='listbox']",
    "[role='dialog']",
    "[data-radix-menu-content]",
    "[data-radix-popper-content-wrapper]",
    "[data-radix-portal]",
    "[data-floating-ui-portal]",
    "[data-headlessui-portal]"
  ]);
  const GROK_MODEL_MENU_ITEM_SELECTORS = Object.freeze([
    "[role='menuitemradio']",
    "[role='menuitem']",
    "[role='option']",
    "button",
    "[data-radix-collection-item]",
    "[cmdk-item]"
  ]);
  const GROK_MODEL_TRIGGER_BUTTON_SELECTOR = [
    "button[aria-label='Model select']",
    "[role='button'][aria-label='Model select']",
    "button[aria-label*='model' i][aria-haspopup]",
    "[role='button'][aria-label*='model' i][aria-haspopup]",
    "button[data-slot='dropdown-menu-trigger'][aria-label*='model' i]",
    "[data-slot='dropdown-menu-trigger'][aria-label*='model' i]"
  ].join(", ");
  const GROK_MODEL_DIRECT_TRIGGER_SELECTORS = Object.freeze([
    "button",
    "[role='button']",
    "[aria-haspopup='menu']",
    "[aria-haspopup='listbox']",
    "[aria-haspopup='true']",
    "[data-slot='dropdown-menu-trigger']"
  ]);
  const GROK_MODEL_TRIGGER_SELECTORS = Object.freeze([
    "button",
    "[role='button']",
    "[aria-haspopup='menu']",
    "[aria-haspopup='listbox']",
    "[aria-haspopup='true']",
    "button[aria-label='Model select']",
    "[role='button'][aria-label='Model select']",
    "button[aria-label*='model' i][aria-haspopup]",
    "[role='button'][aria-label*='model' i][aria-haspopup]",
    "button[data-slot='dropdown-menu-trigger'][aria-label*='model' i]",
    "[data-slot='dropdown-menu-trigger'][aria-label*='model' i]",
    "[data-testid*='model' i]",
    "[data-testid*='mode' i]",
    "[aria-label*='model' i]",
    "[aria-label*='mode' i]",
    "[aria-label*='模型' i]",
    "[aria-label*='模式' i]",
    "[title*='model' i]",
    "[title*='mode' i]",
    "button[aria-haspopup='menu']",
    "button[aria-haspopup='listbox']",
    "button[aria-haspopup='true']",
    "[role='button'][aria-haspopup='menu']",
    "[role='button'][aria-haspopup='listbox']",
    "[role='button'][aria-haspopup='true']"
  ]);

  function grokModelIdFromText(value) {
    for (const [targetId, target] of Object.entries(GROK_MODEL_TARGETS)) {
      if (grokTextLooksLikeTarget(value, target)) return targetId;
    }
    return "";
  }

  function grokTextLooksLikeTarget(value, target) {
    if (!target) return false;
    const parts = String(value || "")
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const values = parts.length ? parts : [String(value || "")];
    for (const part of values) {
      const token = alnumModelToken(part);
      if (!token) continue;
      for (const alias of target.aliases || []) {
        const aliasToken = alnumModelToken(alias);
        if (token === aliasToken || token.startsWith(aliasToken) || aliasToken.startsWith(token) || token.includes(aliasToken)) return true;
      }
    }
    return false;
  }

  function countGrokModelTargets(value) {
    return Object.values(GROK_MODEL_TARGETS)
      .reduce((count, target) => count + (grokTextLooksLikeTarget(value, target) ? 1 : 0), 0);
  }

  function grokModelMenuItemRow(element, root, matchesSpec = null) {
    const rootArea = modelElementArea(root);
    const rootRect = modelRect(root);
    let bestRoleRow = null;
    let bestAction = null;
    let bestRowLike = null;
    let fallback = null;
    let node = element;
    while (node && node.nodeType === 1 && node !== root) {
      if (!visible(node) || isDisabledElement(node)) {
        node = node.parentElement || null;
        continue;
      }
      if (typeof matchesSpec === "function" && !matchesSpec(node)) {
        node = node.parentElement || null;
        continue;
      }
      const textValue = modelElementText(node);
      const targetCount = countGrokModelTargets(textValue);
      const area = modelElementArea(node);
      if (rootArea > 0 && area >= rootArea * 0.85) break;
      if (targetCount > 1) {
        node = node.parentElement || null;
        continue;
      }

      const rect = modelRect(node);
      const tag = String(node.tagName || "").toLowerCase();
      const role = String(node.getAttribute?.("role") || "").toLowerCase();
      const tabIndex = String(node.getAttribute?.("tabindex") || "").trim();
      const roleRowLike = role === "menuitem" || role === "menuitemradio" || role === "option";
      const actionLike = roleRowLike || tag === "button" || role === "button" || (tabIndex && tabIndex !== "-1");
      const rowLike = rect && rootRect &&
        rect.height >= 22 &&
        rect.height <= 94 &&
        rect.width >= Math.min(120, rootRect.width * 0.36) &&
        rect.width <= rootRect.width + 32;

      if (roleRowLike && !bestRoleRow) bestRoleRow = node;
      if (actionLike && !bestAction) bestAction = node;
      if (rowLike && !bestRowLike) bestRowLike = node;
      if (!fallback) fallback = node;
      node = node.parentElement || null;
    }
    return bestRoleRow || bestAction || bestRowLike || fallback || element;
  }

  function grokItemCandidates(root) {
    if (!root) return [];
    const seen = new Set();
    const candidates = [];
    const add = (element) => {
      if (!element || !visible(element) || isDisabledElement(element)) return;
      const textValue = modelElementText(element);
      if (!grokModelIdFromText(textValue) && countGrokModelTargets(textValue) !== 1) return;
      const item = grokModelMenuItemRow(element, root);
      if (!item || seen.has(item) || !root.contains?.(item) || !visible(item) || isDisabledElement(item)) return;
      const itemText = modelElementText(item);
      if (!grokModelIdFromText(itemText) || countGrokModelTargets(itemText) > 1) return;
      seen.add(item);
      candidates.push(item);
    };
    for (const element of visibleSelectorElements(GROK_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "li"], root)) add(element);
    return candidates;
  }

  function grokModelItemText(item) {
    const text = modelElementText(item);
    return text.split(/\n+/).map((part) => part.trim()).find(Boolean) || text;
  }

  function modelDirectText(element) {
    try {
      return normalize(Array.from(element?.childNodes || [])
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || "")
        .join(" "));
    } catch {
      return "";
    }
  }

  function modelColorChannels(value) {
    const match = String(value || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i);
    if (!match) return null;
    return {
      r: Number(match[1]) || 0,
      g: Number(match[2]) || 0,
      b: Number(match[3]) || 0,
      a: match[4] == null ? 1 : Number(match[4])
    };
  }

  function modelEffectiveOpacity(element, stop = null) {
    let opacity = 1;
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      try {
        opacity *= Math.max(0, Math.min(1, Number(getComputedStyle(node).opacity || 1)));
      } catch {}
      if (node === stop) break;
    }
    return opacity;
  }

  function grokModelLabelElements(item, target) {
    if (!item || !target) return [];
    const aliases = (target.aliases || []).map(alnumModelToken).filter(Boolean);
    const elements = [item, ...qsa("*", item).slice(0, 80)];
    return elements.filter((element) => {
      const own = alnumModelToken(modelDirectText(element));
      if (!own) return false;
      return aliases.some((alias) => own === alias || own.startsWith(alias) || alias.startsWith(own));
    });
  }

  function grokModelElementLooksMuted(element, item) {
    if (!element) return false;
    let style = null;
    try { style = getComputedStyle(element); } catch {}
    if (!style) return false;
    const color = modelColorChannels(style.color);
    const opacity = modelEffectiveOpacity(element, item);
    if (opacity > 0 && opacity < 0.66) return true;
    if (!color) return false;
    const alpha = Number.isFinite(color.a) ? color.a : 1;
    const maxChannel = Math.max(color.r, color.g, color.b);
    return alpha * opacity < 0.72 || maxChannel < 190;
  }

  function grokModelItemLooksUnavailable(item, modelId) {
    const target = GROK_MODEL_TARGETS[modelId] || null;
    if (!item || !target) return false;
    if (isDisabledElement(item)) return true;
    for (let node = item, depth = 0; node && node.nodeType === 1 && depth < 5; node = node.parentElement, depth += 1) {
      if (isDisabledElement(node)) return true;
      const ariaDisabled = String(node.getAttribute?.("aria-disabled") || "").trim().toLowerCase();
      const dataDisabled = String(node.getAttribute?.("data-disabled") || "").trim().toLowerCase();
      const dataState = String(node.getAttribute?.("data-state") || "").trim().toLowerCase();
      const className = typeof node.className === "string" ? node.className : String(node.className?.baseVal || "");
      if (ariaDisabled === "true" || dataDisabled === "true" || dataState === "disabled") return true;
      if (/(^|\s)(disabled|is-disabled|unavailable|locked|is-locked|paywall|requires-upgrade|opacity-50|pointer-events-none)(\s|$)/i.test(className)) return true;
      try {
        const style = getComputedStyle(node);
        if (style.pointerEvents === "none") return true;
        if (Number(style.opacity || 1) > 0 && Number(style.opacity || 1) < 0.55) return true;
      } catch {}
      if (node.getAttribute?.("role") === "menu" || node.getAttribute?.("role") === "listbox") break;
    }
    const labels = grokModelLabelElements(item, target);
    return labels.length > 0 && labels.every((element) => grokModelElementLooksMuted(element, item));
  }

  function grokTextStartsWithAlias(value, alias) {
    const token = alnumModelToken(value);
    const aliasToken = alnumModelToken(alias);
    return Boolean(token && aliasToken && (token === aliasToken || token.startsWith(aliasToken)));
  }

  function grokMenuRootLooksLikeModel(root) {
    if (!root || !visible(root)) return false;
    const rootText = modelElementText(root);
    const rootSignal = /\b(model|mode|grok)\b|模型|模式/i.test(rootText);
    let targetCount = 0;
    for (const item of grokItemCandidates(root)) {
      if (grokModelIdFromText(modelElementText(item))) targetCount += 1;
      if (targetCount >= 2) return true;
    }
    return Boolean(countGrokModelTargets(rootText) >= 2 || (grokModelIdFromText(rootText) && (rootSignal || targetCount >= 1)));
  }

  function grokModelMenuRoot(triggerEl = null) {
    if (triggerEl) {
      const controlsId = String(triggerEl.getAttribute?.("aria-controls") || "").trim();
      if (controlsId) {
        const controlled = document.getElementById(controlsId);
        if (grokMenuRootLooksLikeModel(controlled)) return controlled;
      }
      const triggerId = String(triggerEl.getAttribute?.("id") || "").trim();
      if (triggerId) {
        const escapedTriggerId = triggerId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        for (const selector of GROK_MODEL_MENU_ROOT_SELECTORS) {
          const labelled = qs(`${selector}[aria-labelledby="${escapedTriggerId}"]`);
          if (grokMenuRootLooksLikeModel(labelled)) return labelled;
        }
      }
    }
    const roots = visibleSelectorElements(GROK_MODEL_MENU_ROOT_SELECTORS)
      .filter(grokMenuRootLooksLikeModel)
      .sort((a, b) => Number(a.getBoundingClientRect?.().bottom || 0) - Number(b.getBoundingClientRect?.().bottom || 0));
    return roots[roots.length - 1] || null;
  }

  function grokTextLooksLikeComposerPrompt(value) {
    const textValue = compactModelText(value);
    return Boolean(textValue && (
      textValue.includes("ask anything") ||
      textValue.includes("message grok") ||
      textValue.includes("ask grok") ||
      textValue.includes("what can i help") ||
      textValue.includes("message") ||
      textValue.includes("prompt") ||
      textValue.includes("输入") ||
      textValue.includes("提问") ||
      textValue.includes("问我")
    ));
  }

  function grokComposerCandidateText(element) {
    if (!element) return "";
    return [
      element.getAttribute?.("placeholder"),
      element.getAttribute?.("aria-placeholder"),
      element.getAttribute?.("data-placeholder"),
      modelElementText(element)
    ].filter(Boolean).join(" ");
  }

  function isLikelyGrokComposerRect(rect) {
    if (!rect || rect.width < 260 || rect.height < 36 || rect.height > 260) return false;
    const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0);
    const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0);
    if (viewportWidth > 0 && rect.right < viewportWidth * 0.30) return false;
    if (viewportHeight > 0 && rect.bottom < viewportHeight * 0.35) return false;
    return true;
  }

  function findGrokComposerRoot() {
    const selector = [
      "textarea",
      '[contenteditable="true"]',
      '[role="textbox"]',
      "[data-placeholder]",
      "[aria-placeholder]",
      "form",
      "[data-testid*='composer' i]",
      "[data-testid*='prompt' i]",
      "div"
    ].join(", ");
    const candidates = [];
    const seen = new Set();
    for (const element of visibleSelectorElements(selector)) {
      if (!element || seen.has(element)) continue;
      seen.add(element);
      if (!grokTextLooksLikeComposerPrompt(grokComposerCandidateText(element))) continue;
      let node = element;
      let best = element;
      while (node && node.nodeType === 1 && node !== document.body) {
        const rect = modelRect(node);
        if (rect && rect.width >= 280 && rect.height >= 40 && rect.height <= 260) best = node;
        node = node.parentElement || null;
      }
      const rect = modelRect(best);
      if (!rect || !isLikelyGrokComposerRect(rect)) continue;
      candidates.push({ element: best, score: rect.bottom + Math.min(260, rect.width) });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.element || null;
  }

  function isGrokModelTriggerNearComposer(element, composerRoot = null, composerRect = null) {
    if (!element) return false;
    if (composerRoot?.contains?.(element)) return true;
    const rect = modelRect(element);
    if (!rect || !composerRect || !isLikelyGrokComposerRect(composerRect)) return false;
    const inComposerY = rect.top >= composerRect.top - 14 && rect.bottom <= composerRect.bottom + 14;
    const inComposerX = rect.left >= composerRect.left - 14 && rect.right <= composerRect.right + 14;
    const controlSized = rect.width >= 20 && rect.width <= 220 && rect.height >= 18 && rect.height <= 80;
    return inComposerY && inComposerX && controlSized;
  }

  function grokModelTriggerLooksLikeVoiceControl(value) {
    return /\b(voice|dictation|microphone|mic|record(?:ing)?|audio|speech|speak)\b|语音|麦克风|录音|听写/i.test(String(value || ""));
  }

  function grokModelTriggerHasModelSignal(value) {
    const textValue = String(value || "");
    if (/\bmodel\b|模型|模式/i.test(textValue)) return true;
    return /\bmode\b/i.test(textValue) && !/\bvoice\s+mode\b/i.test(textValue);
  }

  function grokModelTriggerButton(element) {
    if (!element) return null;
    if (matches(element, GROK_MODEL_TRIGGER_BUTTON_SELECTOR)) return element;
    return closest(element, GROK_MODEL_TRIGGER_BUTTON_SELECTOR) || closest(element, "button, [role='button']") || element;
  }

  function directGrokModelTriggerBoost(element) {
    if (!element || !visible(element) || isDisabledElement(element)) return 0;
    const rootsSelector = GROK_MODEL_MENU_ROOT_SELECTORS.join(", ");
    if (element.closest?.(rootsSelector)) return 0;
    const textValue = modelElementText(element);
    const ariaLabel = String(element.getAttribute?.("aria-label") || "").trim();
    const title = String(element.getAttribute?.("title") || "").trim();
    const dataSlot = String(element.getAttribute?.("data-slot") || "").trim();
    const dataTestId = String(element.getAttribute?.("data-testid") || "").trim();
    const searchValue = [textValue, ariaLabel, title, dataSlot, dataTestId].filter(Boolean).join(" ");
    const targetId = grokModelIdFromText(textValue) || grokModelIdFromText(ariaLabel) || grokModelIdFromText(searchValue);
    const modelSelect = /\bmodel\s*select\b/i.test(searchValue);
    const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
    if (grokModelTriggerLooksLikeVoiceControl(searchValue) && !targetId && !modelSelect) return 0;
    if (!targetId && !modelSelect) return 0;
    let score = 650;
    if (modelSelect) score += 520;
    if (targetId) score += 240;
    if (popup === "menu" || popup === "listbox" || popup === "true") score += 120;
    if (dataSlot === "dropdown-menu-trigger") score += 80;
    if (parseBooleanAttr(element.getAttribute?.("aria-expanded")) !== null) score += 30;
    return score;
  }

  function scoreGrokModelTrigger(element, options = {}) {
    if (!element || !visible(element) || isDisabledElement(element)) return -1;
    const rootsSelector = GROK_MODEL_MENU_ROOT_SELECTORS.join(", ");
    if (element.closest?.(rootsSelector)) return -1;
    const textValue = modelElementText(element);
    const dataTestId = String(element.getAttribute?.("data-testid") || "");
    const ariaLabel = String(element.getAttribute?.("aria-label") || "").trim();
    const title = String(element.getAttribute?.("title") || "");
    const searchValue = [textValue, dataTestId, ariaLabel, title].filter(Boolean).join(" ");
    const targetId = grokModelIdFromText(textValue) || grokModelIdFromText(searchValue);
    const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
    const nearComposer = isGrokModelTriggerNearComposer(element, options.composerRoot || null, options.composerRect || null);
    const hasModelSignal = grokModelTriggerHasModelSignal(searchValue);
    const hasGrokSignal = /\bgrok\b/i.test(searchValue);
    const exactModelTrigger = matches(element, GROK_MODEL_TRIGGER_BUTTON_SELECTOR);
    if (grokModelTriggerLooksLikeVoiceControl(searchValue) && !targetId && !/\bmodel\b|模型|模式/i.test(searchValue)) return -1;
    let score = 0;
    if (exactModelTrigger) score += 800;
    if (targetId) score += 500;
    if (nearComposer) score += 360;
    if (hasModelSignal) score += 320;
    if (hasGrokSignal) score += 120;
    if (popup === "menu" || popup === "listbox" || popup === "true") score += 110;
    if (parseBooleanAttr(element.getAttribute?.("aria-expanded")) !== null) score += 20;
    if (parseBooleanAttr(element.getAttribute?.("aria-pressed")) !== null) score += 10;
    if (options.composerRoot && !nearComposer && !targetId && !hasModelSignal) score -= 260;
    const compact = compactModelText(textValue);
    const allowIconLikeComposerControl = nearComposer && (popup === "menu" || popup === "listbox" || popup === "true" || compact.length <= 36);
    if (!targetId && !hasModelSignal && !allowIconLikeComposerControl) return -1;
    return score > 0 ? score : -1;
  }

  function grokModelTriggerCandidates() {
    const composerRoot = findGrokComposerRoot();
    const composerRect = modelRect(composerRoot);
    const seen = new Set();
    const candidates = [];
    const add = (element, boost = 0) => {
      const trigger = grokModelTriggerButton(element);
      if (!trigger || seen.has(trigger)) return;
      seen.add(trigger);
      const score = scoreGrokModelTrigger(trigger, { composerRoot, composerRect });
      if (score <= 0 && boost <= 0) return;
      candidates.push({ element: trigger, score: Math.max(0, score) + boost, bottom: Number(trigger.getBoundingClientRect?.().bottom || 0) });
    };
    for (const element of visibleSelectorElements(GROK_MODEL_DIRECT_TRIGGER_SELECTORS)) {
      add(element, directGrokModelTriggerBoost(grokModelTriggerButton(element) || element));
    }
    for (const element of visibleSelectorElements(GROK_MODEL_TRIGGER_SELECTORS)) {
      add(element);
    }
    candidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
    return candidates;
  }

  function findGrokModelTrigger() {
    return grokModelTriggerCandidates()[0]?.element || null;
  }

  async function openGrokModelMenu(context) {
    assertPreferredModelRun(context);
    const existing = grokModelMenuRoot();
    if (existing) return existing;
    const trigger = await waitForPreferredModel(context, findGrokModelTrigger, 10000, 150);
    if (!trigger || !preferredModelPointerActivate(context, trigger)) return null;
    return await waitForPreferredModel(context, () => grokModelMenuRoot(trigger), 1200, 90) || null;
  }

  function currentGrokModelId() {
    const trigger = findGrokModelTrigger();
    const current = grokModelIdFromText(modelElementText(trigger));
    if (current) return current;
    const root = grokModelMenuRoot();
    if (!root) return "";
    const selected = grokItemCandidates(root).find((item) => {
      const state = String(item.getAttribute?.("data-state") || "").trim().toLowerCase();
      const ariaChecked = String(item.getAttribute?.("aria-checked") || "").trim().toLowerCase();
      const ariaSelected = String(item.getAttribute?.("aria-selected") || "").trim().toLowerCase();
      return state === "checked" || state === "selected" || state === "active" || ariaChecked === "true" || ariaSelected === "true";
    });
    return grokModelIdFromText(modelElementText(selected));
  }

  function findGrokModelItem(root, modelId, options = {}) {
    const target = GROK_MODEL_TARGETS[modelId];
    if (!target) return null;
    const matchesTarget = (element) => grokTextLooksLikeTarget(modelElementText(element), target);
    for (const item of grokItemCandidates(root)) {
      if (!options.includeUnavailable && grokModelItemLooksUnavailable(item, modelId)) continue;
      const itemText = grokModelItemText(item);
      if (grokModelIdFromText(itemText) === modelId) return item;
      if (matchesTarget(item)) return item;
      for (const alias of target.aliases || []) {
        if (grokTextStartsWithAlias(itemText, alias)) return item;
      }
    }
    return null;
  }

  async function waitGrokModelSettled(context, modelId) {
    const deadline = Date.now() + 2000;
    while (Date.now() <= deadline) {
      assertPreferredModelRun(context);
      const current = currentGrokModelId();
      if (current && current === modelId) return true;
      await preferredModelSleep(context, 120);
    }
    assertPreferredModelRun(context);
    const final = currentGrokModelId();
    return final === modelId;
  }

  async function applyGrokPreferredModel(context, modelId) {
    if (!GROK_MODEL_TARGETS[modelId]) return preferredModelResult(context, false, "Grok", modelId, "unknown model");
    assertPreferredModelRun(context);
    if (currentGrokModelId() === modelId) return preferredModelResult(context, true, "Grok", modelId, "", { skipped: true });
    const root = await openGrokModelMenu(context);
    if (!root) return preferredModelResult(context, false, "Grok", modelId, "model menu not found", { retryable: true });
    const maybeItem = findGrokModelItem(root, modelId, { includeUnavailable: true });
    if (maybeItem && grokModelItemLooksUnavailable(maybeItem, modelId)) {
      const menuClosed = await dismissPreferredModelMenu(context, () => grokModelMenuRoot());
      return preferredModelResult(context, true, "Grok", modelId, "", { skipped: true, unavailable: true, menuClosed });
    }
    const item = maybeItem || findGrokModelItem(root, modelId);
    if (!item) {
      const menuClosed = await dismissPreferredModelMenu(context, () => grokModelMenuRoot());
      return preferredModelResult(context, false, "Grok", modelId, "target model item not found", { menuClosed });
    }
    if (!preferredModelActivate(context, item)) {
      const menuClosed = await dismissPreferredModelMenu(context, () => grokModelMenuRoot());
      return preferredModelResult(context, false, "Grok", modelId, "target model item could not be clicked", { menuClosed });
    }
    const settled = await waitGrokModelSettled(context, modelId);
    const menuClosed = await dismissPreferredModelMenu(context, () => grokModelMenuRoot());
    return settled
      ? preferredModelResult(context, true, "Grok", modelId, "", { changed: true, menuClosed })
      : preferredModelResult(context, false, "Grok", modelId, "selection did not settle", { menuClosed });
  }
  return Object.freeze({
    applyGrokPreferredModel
  });
}
