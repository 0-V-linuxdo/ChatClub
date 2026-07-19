export function createPreferredNotionDeepSeekCapability(deps = {}) {
  const {
    normalize,
    modelElementText,
    visibleSelectorElements,
    modelRect,
    visible,
    isDisabledElement,
    assertPreferredModelRun,
    preferredModelActivate,
    waitForPreferredModel,
    modelElementArea,
    preferredModelSleep,
    dismissPreferredModelMenu,
    preferredModelResult,
    alnumModelToken,
    closest,
    applyGeminiPreferredModel,
    applyGrokPreferredModel,
    abortActivePreferredModelRun,
    nextPreferredModelBridgeRunSequence,
    preferredModelState,
    publishPreferredModelBridgeRun,
    preferredModelCancelled,
    preferredModelAbortReason,
    releasePreferredModelBridgeRun,
    modelResult
  } = deps;
  const NOTION_MODEL_TARGETS = Object.freeze({
    auto: Object.freeze({ id: "auto", label: "Auto", aliases: ["Automatic"] }),
    sonnet46: Object.freeze({ id: "sonnet46", label: "Claude Sonnet 4.6", aliases: ["Sonnet 4.6"] }),
    opus47: Object.freeze({ id: "opus47", label: "Claude Opus 4.7", aliases: ["Opus 4.7"] }),
    opus48: Object.freeze({ id: "opus48", label: "Claude Opus 4.8", aliases: ["Opus 4.8"] }),
    gemini31pro: Object.freeze({ id: "gemini31pro", label: "Gemini 3.1 Pro", aliases: ["Gemini Pro"] }),
    gpt52: Object.freeze({ id: "gpt52", label: "GPT-5.2", aliases: ["GPT 5.2"] }),
    gpt54: Object.freeze({ id: "gpt54", label: "GPT-5.4", aliases: ["GPT 5.4"] }),
    gpt55: Object.freeze({ id: "gpt55", label: "GPT-5.5", aliases: ["GPT 5.5"] }),
    grok43: Object.freeze({ id: "grok43", label: "Grok 4.3", aliases: ["Grok 43", "grok43"] }),
    grokBuild01: Object.freeze({ id: "grokBuild01", label: "Grok Build 0.1", aliases: ["Grok Build 01", "Grok Build"] }),
    kimi26: Object.freeze({ id: "kimi26", label: "Kimi K2.6", aliases: ["Kimi K2.6"] }),
    deepseekV4Pro: Object.freeze({ id: "deepseekV4Pro", label: "DeepSeek V4 Pro", aliases: ["DeepSeek V4"] }),
    glm52: Object.freeze({ id: "glm52", label: "GLM 5.2", aliases: ["GLM-5.2", "GLM"] })
  });

  const NOTION_MODEL_TRIGGER_SELECTORS = Object.freeze([
    '[data-testid="unified-chat-model-button"]',
    '[data-testid*="model" i]',
    '[aria-label*="model" i]',
    '[aria-label*="模型" i]',
    'button[aria-label*="model" i]',
    'button[aria-label*="模型" i]',
    'button[aria-haspopup="menu"]',
    'button[aria-haspopup="listbox"]',
    '[role="button"][aria-label*="model" i]',
    '[role="button"][aria-label*="模型" i]',
    '[role="button"][aria-haspopup="menu"]',
    '[role="button"][aria-haspopup="listbox"]',
    '[role="combobox"]',
    "button"
  ]);
  const NOTION_MODEL_MENU_ROOT_SELECTORS = Object.freeze([
    '[role="menu"]',
    '[role="listbox"]',
    '[role="dialog"]',
    '[data-radix-menu-content]',
    '[data-radix-popper-content-wrapper]',
    '[data-radix-portal]',
    '[data-floating-ui-portal]',
    '[data-floating-ui-portal] [role="menu"]'
  ]);
  const NOTION_MODEL_MENU_ITEM_SELECTORS = Object.freeze([
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[role="option"]',
    '[role="button"]',
    '[data-model]',
    '[data-value]',
    "button",
    '[tabindex]:not([tabindex="-1"])'
  ]);

  function notionText(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, " ");
  }

  function notionLabels(target) {
    return [target?.label, ...(target?.aliases || [])]
      .map(notionText)
      .filter(Boolean);
  }

  function notionTextLooksLikeTarget(value, target) {
    const textValue = notionText(value);
    if (!textValue || !target) return false;
    if (notionLabels(target).some((label) => textValue === label || textValue.includes(label))) return true;
    if (target.id === "gemini31pro") return textValue.includes("gemini") && textValue.includes("pro");
    if (target.id === "opus48") return textValue.includes("opus") && textValue.includes("4.8");
    if (target.id === "opus47") return textValue.includes("opus") && textValue.includes("4.7");
    if (target.id === "sonnet46") return textValue.includes("sonnet") && textValue.includes("4.6");
    if (target.id === "grok43") return textValue.includes("grok") && textValue.includes("4.3");
    if (target.id === "grokBuild01") return textValue.includes("grok") && textValue.includes("build");
    if (target.id === "deepseekV4Pro") return textValue.includes("deepseek") && textValue.includes("v4");
    if (target.id === "kimi26") return textValue.includes("kimi") && textValue.includes("k2.6");
    if (target.id === "glm52") return textValue.includes("glm") && textValue.includes("5.2");
    return false;
  }

  function notionModelIdFromText(value) {
    for (const [id, target] of Object.entries(NOTION_MODEL_TARGETS)) {
      if (notionTextLooksLikeTarget(value, target)) return id;
    }
    return "";
  }

  function countNotionModelTargets(value) {
    return Object.values(NOTION_MODEL_TARGETS)
      .reduce((count, target) => count + (notionTextLooksLikeTarget(value, target) ? 1 : 0), 0);
  }

  function notionViewportSize() {
    return {
      width: Number(window.innerWidth || document.documentElement?.clientWidth || 0),
      height: Number(window.innerHeight || document.documentElement?.clientHeight || 0)
    };
  }

  function isLikelyNotionMainComposerRect(rect) {
    if (!rect || rect.width < 280 || rect.height < 40 || rect.height > 280) return false;
    const viewport = notionViewportSize();
    if (viewport.width > 0 && rect.right < viewport.width * 0.35) return false;
    if (viewport.height > 0 && rect.bottom < viewport.height * 0.28) return false;
    return true;
  }

  function notionTextLooksLikeComposerPrompt(value) {
    const textValue = notionText(value);
    return Boolean(textValue && (
      textValue.includes("do anything with ai") ||
      textValue.includes("ask anything") ||
      textValue.includes("what can i help") ||
      textValue.includes("what should i help") ||
      textValue.includes("prompt") ||
      textValue.includes("message") ||
      textValue.includes("send a message") ||
      textValue.includes("提问") ||
      textValue.includes("输入") ||
      textValue.includes("问我")
    ));
  }

  function notionComposerCandidateText(element) {
    if (!element) return "";
    return [
      element.getAttribute?.("placeholder"),
      element.getAttribute?.("aria-placeholder"),
      element.getAttribute?.("data-placeholder"),
      modelElementText(element)
    ].filter(Boolean).join(" ");
  }

  function findNotionComposerRoot() {
    const selector = [
      "textarea",
      '[contenteditable="true"]',
      '[role="textbox"]',
      '[data-placeholder]',
      '[aria-placeholder]',
      "form",
      "div"
    ].join(", ");
    const candidates = [];
    const seen = new Set();
    for (const element of visibleSelectorElements(selector)) {
      if (!element || seen.has(element)) continue;
      seen.add(element);
      if (!notionTextLooksLikeComposerPrompt(notionComposerCandidateText(element))) continue;
      let node = element;
      let best = element;
      let bestScore = -1;
      while (node && node.nodeType === 1 && node !== document.body) {
        const rect = modelRect(node);
        if (rect && rect.width >= 320 && rect.height >= 44 && rect.height <= 260) {
          best = node;
        }
        node = node.parentElement || null;
      }
      const rect = modelRect(best);
      if (!rect || !isLikelyNotionMainComposerRect(rect)) continue;
      bestScore = rect.bottom + Math.min(300, rect.width);
      candidates.push({ element: best, score: bestScore });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.element || null;
  }

  function isNotionModelTriggerNearMainComposer(element, composerRoot = null, composerRect = null) {
    if (!element) return false;
    if (composerRoot?.contains?.(element)) return true;
    const rect = modelRect(element);
    if (!rect || !composerRect || !isLikelyNotionMainComposerRect(composerRect)) return false;
    const inComposerY = rect.top >= composerRect.top - 12 && rect.bottom <= composerRect.bottom + 12;
    const inComposerX = rect.left >= composerRect.left - 12 && rect.right <= composerRect.right + 12;
    const controlSized = rect.width >= 24 && rect.width <= 180 && rect.height >= 20 && rect.height <= 76;
    return inComposerY && inComposerX && controlSized;
  }

  function scoreNotionModelTrigger(element, options = {}) {
    if (!element || !visible(element) || (!options.allowDisabled && isDisabledElement(element))) return -1;
    if (element.closest?.(NOTION_MODEL_MENU_ROOT_SELECTORS.join(", "))) return -1;
    const textValue = modelElementText(element);
    const dataTestId = String(element.getAttribute?.("data-testid") || "").toLowerCase();
    const ariaLabel = String(element.getAttribute?.("aria-label") || "");
    const title = String(element.getAttribute?.("title") || "");
    const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
    const nearMainComposer = isNotionModelTriggerNearMainComposer(element, options.composerRoot || null, options.composerRect || null);
    let score = 0;
    if (nearMainComposer) score += 900;
    if (options.composerRoot && !nearMainComposer) score -= 420;
    if (dataTestId === "unified-chat-model-button") score += 1000;
    if (dataTestId.includes("model")) score += 500;
    if (/\bmodel\b|模型/i.test(ariaLabel)) score += 420;
    if (/\bmodel\b|模型/i.test(title)) score += 320;
    if (notionModelIdFromText(textValue)) score += 360;
    if (popup === "menu" || popup === "listbox") score += 80;
    if (notionText(textValue) === "auto" || notionTextLooksLikeTarget(textValue, NOTION_MODEL_TARGETS.auto)) score += 80;
    return score > 0 ? score : -1;
  }

  function findNotionModelControl({ allowDisabled = false } = {}) {
    const composerRoot = findNotionComposerRoot();
    const composerRect = modelRect(composerRoot);
    const candidates = visibleSelectorElements(NOTION_MODEL_TRIGGER_SELECTORS)
      .map((element) => ({
        element,
        score: scoreNotionModelTrigger(element, { composerRoot, composerRect, allowDisabled }),
        bottom: Number(element.getBoundingClientRect?.().bottom || 0)
      }))
      .filter((item) => item.score > 0);
    candidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
    return candidates[0]?.element || null;
  }

  function findNotionModelTrigger() {
    return findNotionModelControl();
  }

  function findNotionModelIndicator() {
    return findNotionModelControl({ allowDisabled: true });
  }

  function scoreNotionModelMenuRoot(root) {
    if (!root || !visible(root)) return -1;
    const textValue = modelElementText(root);
    const normalized = notionText(textValue);
    let score = 0;
    if (normalized.includes("select a model")) score += 160;
    if (normalized.includes("open models")) score += 80;
    score += Math.min(5, countNotionModelTargets(textValue)) * 80;
    return score >= 160 ? score : -1;
  }

  function notionModelMenuRoot(trigger = null) {
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (controlsId) {
      const controlled = document.getElementById(controlsId);
      if (scoreNotionModelMenuRoot(controlled) > 0) return controlled;
    }
    const roots = visibleSelectorElements(NOTION_MODEL_MENU_ROOT_SELECTORS)
      .map((element) => ({ element, score: scoreNotionModelMenuRoot(element) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    return roots[0]?.element || null;
  }

  async function openNotionModelMenu(context, trigger) {
    assertPreferredModelRun(context);
    const existing = notionModelMenuRoot(trigger);
    if (existing) return existing;
    if (!trigger || !preferredModelActivate(context, trigger)) return null;
    return waitForPreferredModel(context, () => notionModelMenuRoot(trigger), 3000, 120);
  }

  function notionMenuItemRow(element, root, matchesSpec = null) {
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

      const textValue = modelElementText(node);
      const targetCount = countNotionModelTargets(textValue);
      const area = modelElementArea(node);
      if (rootArea > 0 && area >= rootArea * 0.85) break;
      if (typeof matchesSpec === "function" && !matchesSpec(node)) {
        node = node.parentElement || null;
        continue;
      }
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
        rect.height <= 88 &&
        rect.width >= Math.min(120, rootRect.width * 0.38) &&
        rect.width <= rootRect.width + 32;

      if (roleRowLike && !bestRoleRow) bestRoleRow = node;
      if (actionLike && !bestAction) bestAction = node;
      if (rowLike && !bestRowLike) bestRowLike = node;
      if (!fallback) fallback = node;
      node = node.parentElement || null;
    }
    return bestRoleRow || bestAction || bestRowLike || fallback || element;
  }

  function scoreNotionModelItem(element, modelId) {
    if (!element || !visible(element) || isDisabledElement(element)) return Number.NEGATIVE_INFINITY;
    const textValue = modelElementText(element);
    const target = NOTION_MODEL_TARGETS[modelId];
    let score = 0;
    const role = String(element.getAttribute?.("role") || "").toLowerCase();
    const tag = String(element.tagName || "").toLowerCase();
    const tabIndex = String(element.getAttribute?.("tabindex") || "").trim();
    const targetCount = countNotionModelTargets(textValue);
    if (role === "menuitem" || role === "menuitemradio" || role === "option") score += 900;
    if (tag === "button" || role === "button") score += 360;
    if (tabIndex && tabIndex !== "-1") score += 120;
    if (targetCount === 1) score += 260;
    if (targetCount > 1) score -= 700;
    if (notionTextLooksLikeTarget(textValue, target)) score += 620;
    const labels = notionLabels(target);
    if (labels.includes(notionText(textValue))) score += 260;
    const rect = modelRect(element);
    if (rect && rect.height >= 24 && rect.height <= 72) score += 100;
    if (rect && rect.width >= 120) score += 40;
    score -= Math.min(160, modelElementArea(element) / 6000);
    return score;
  }

  function findNotionModelItem(root, modelId) {
    if (!root || !NOTION_MODEL_TARGETS[modelId]) return null;
    const target = NOTION_MODEL_TARGETS[modelId];
    const matchesSpec = (element) => notionTextLooksLikeTarget(modelElementText(element), target);
    const seenRows = new Set();
    const rows = [];
    const add = (element) => {
      if (!element || !matchesSpec(element)) return;
      const row = notionMenuItemRow(element, root, matchesSpec);
      if (!row || seenRows.has(row) || !root.contains?.(row)) return;
      if (!matchesSpec(row)) return;
      if (countNotionModelTargets(modelElementText(row)) > 1) return;
      seenRows.add(row);
      rows.push(row);
    };
    for (const element of visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "button"], root)) add(element);
    rows.sort((a, b) => scoreNotionModelItem(b, modelId) - scoreNotionModelItem(a, modelId));
    return rows[0] || null;
  }

  function notionElementHasSelectedState(element) {
    if (!element) return false;
    for (const attr of ["aria-checked", "aria-selected", "aria-current", "data-state", "data-selected", "data-active", "data-checked"]) {
      const value = String(element.getAttribute?.(attr) || "").trim().toLowerCase();
      if (value === "true" || value === "checked" || value === "selected" || value === "active" || value === "page") return true;
    }
    const className = String(element.className || "");
    return /\b(?:selected|checked|active)\b/i.test(className) && !/\b(?:unselected|inactive|unchecked)\b/i.test(className);
  }

  function notionRowHasRightCheckMarker(row) {
    const rowRect = modelRect(row);
    if (!rowRect || rowRect.width <= 0 || rowRect.height <= 0) return false;
    if (/[✓✔]/.test(String(row?.innerText || row?.textContent || ""))) return true;
    for (const marker of visibleSelectorElements([
      "[aria-label*='check' i]",
      "[aria-label*='selected' i]",
      "[data-testid*='check' i]",
      "[class*='check' i]",
      "svg"
    ], row)) {
      if (notionElementHasSelectedState(marker)) return true;
      const label = [
        marker.getAttribute?.("aria-label"),
        marker.getAttribute?.("data-testid"),
        marker.getAttribute?.("class"),
        marker.getAttribute?.("title"),
        marker.innerText || marker.textContent || ""
      ].filter(Boolean).join(" ");
      if (/\b(?:check|checked|selected|done)\b|✓|✔/i.test(label)) return true;
      const rect = modelRect(marker);
      if (!rect || rect.width < 5 || rect.height < 5 || rect.width > 32 || rect.height > 32) continue;
      const nearRight = rect.left >= rowRect.left + rowRect.width * 0.66 && rect.right <= rowRect.right + 10;
      const verticallyInside = rect.top >= rowRect.top - 3 && rect.bottom <= rowRect.bottom + 3;
      if (nearRight && verticallyInside) return true;
    }
    return false;
  }

  function notionRowLooksSelected(row) {
    if (!row) return false;
    if (notionElementHasSelectedState(row)) return true;
    for (const element of visibleSelectorElements([
      "[aria-checked]",
      "[aria-selected]",
      "[aria-current]",
      "[data-state]",
      "[data-selected]",
      "[data-active]",
      "[data-checked]"
    ], row)) {
      if (notionElementHasSelectedState(element)) return true;
    }
    return notionRowHasRightCheckMarker(row);
  }

  function selectedNotionModelId(root) {
    if (!root) return "";
    const seenRows = new Set();
    const rows = [];
    const add = (element) => {
      if (!element) return;
      const row = notionMenuItemRow(element, root);
      if (!row || seenRows.has(row) || !root.contains?.(row)) return;
      const textValue = modelElementText(row);
      if (countNotionModelTargets(textValue) !== 1) return;
      const id = notionModelIdFromText(textValue);
      if (!id || !notionRowLooksSelected(row)) return;
      seenRows.add(row);
      rows.push({ element: row, id, score: scoreNotionModelItem(row, id) });
    };
    for (const element of visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "button", "svg"], root)) add(element);
    rows.sort((a, b) => b.score - a.score);
    return rows[0]?.id || "";
  }

  function currentNotionModelId(trigger = null) {
    const selected = selectedNotionModelId(notionModelMenuRoot(trigger));
    if (selected) return selected;
    const triggerElement = trigger && visible(trigger) ? trigger : findNotionModelIndicator();
    return notionModelIdFromText(modelElementText(triggerElement));
  }

  async function waitNotionReadableCurrentModelId(context, trigger = null, timeoutMs = 2200) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      assertPreferredModelRun(context);
      const current = currentNotionModelId(trigger);
      if (current) return current;
      await preferredModelSleep(context, 120);
    }
    assertPreferredModelRun(context);
    return currentNotionModelId(trigger);
  }

  async function closeNotionModelMenu(context, trigger = null) {
    return dismissPreferredModelMenu(context, () => notionModelMenuRoot(trigger), 900);
  }

  async function waitNotionModelSettled(context, modelId, trigger) {
    const deadline = Date.now() + 3000;
    while (Date.now() <= deadline) {
      assertPreferredModelRun(context);
      const current = currentNotionModelId(trigger);
      if (current && current === modelId) return true;
      await preferredModelSleep(context, 120);
    }
    assertPreferredModelRun(context);
    const final = currentNotionModelId(trigger);
    return final === modelId;
  }

  async function applyNotionPreferredModel(context, modelId) {
    if (!NOTION_MODEL_TARGETS[modelId]) return preferredModelResult(context, false, "NotionAI", modelId, "unknown model");
    if ((await waitNotionReadableCurrentModelId(context, null, 1600)) === modelId) {
      const menuClosed = await closeNotionModelMenu(context);
      return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const trigger = await waitForPreferredModel(context, findNotionModelTrigger, 10000, 150);
    if (!trigger) {
      await closeNotionModelMenu(context);
      return preferredModelResult(context, false, "NotionAI", modelId, "model trigger not found", { retryable: true });
    }
    if ((await waitNotionReadableCurrentModelId(context, trigger, 2200)) === modelId) {
      const menuClosed = await closeNotionModelMenu(context, trigger);
      return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const root = await openNotionModelMenu(context, trigger);
    if (!root) {
      await closeNotionModelMenu(context, trigger);
      return preferredModelResult(context, false, "NotionAI", modelId, "model menu not found", { retryable: true });
    }
    if (currentNotionModelId(trigger) === modelId) {
      const menuClosed = await closeNotionModelMenu(context, trigger);
      return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const item = findNotionModelItem(root, modelId);
    if (!item) {
      const menuClosed = await closeNotionModelMenu(context, trigger);
      return preferredModelResult(context, false, "NotionAI", modelId, "target model item not found", { menuClosed });
    }
    const clicked = preferredModelActivate(context, item);
    let settled = clicked ? await waitNotionModelSettled(context, modelId, trigger) : false;
    const menuClosed = await closeNotionModelMenu(context, trigger);
    if (!settled && currentNotionModelId(trigger) === modelId) settled = true;
    if (!clicked) return preferredModelResult(context, false, "NotionAI", modelId, "target model item could not be clicked", { menuClosed });
    return settled
      ? preferredModelResult(context, true, "NotionAI", modelId, "", { changed: true, menuClosed })
      : preferredModelResult(context, false, "NotionAI", modelId, "selection did not settle", { menuClosed });
  }

  const DEEPSEEK_MODE_TARGETS = Object.freeze({
    instant: Object.freeze({ id: "instant", label: "Instant" }),
    expert: Object.freeze({ id: "expert", label: "Expert" }),
    vision: Object.freeze({ id: "vision", label: "Vision" })
  });
  const DEEPSEEK_MODE_SELECTORS = Object.freeze([
    "button",
    "[role='radio']",
    "[role='tab']",
    "[role='button']",
    "input[type='radio']",
    "label",
    "[aria-label]",
    "[aria-checked]",
    "[aria-selected]",
    "[data-testid]"
  ]);

  function deepSeekModeIdFromText(value) {
    const token = alnumModelToken(value);
    if (!token) return "";
    if (token.includes("instant")) return "instant";
    if (token.includes("expert")) return "expert";
    if (token.includes("vision")) return "vision";
    return "";
  }

  function deepSeekModeIdCount(value) {
    const token = alnumModelToken(value);
    if (!token) return 0;
    return ["instant", "expert", "vision"].reduce((count, id) => count + (token.includes(id) ? 1 : 0), 0);
  }

  function deepSeekModeCandidateText(element) {
    if (!element) return "";
    return [
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("aria-valuetext"),
      element.getAttribute?.("title"),
      element.getAttribute?.("data-testid"),
      element.getAttribute?.("data-value"),
      element.getAttribute?.("value"),
      modelElementText(element),
      element.value
    ].filter(Boolean).join(" ");
  }

  function deepSeekModeElementLooksSelected(element) {
    if (!element) return false;
    if (element.checked) return true;
    for (const attr of ["aria-checked", "aria-selected", "aria-current", "aria-pressed", "data-state", "data-selected", "data-active", "data-checked"]) {
      const value = String(element.getAttribute?.(attr) || "").trim().toLowerCase();
      if (value === "true" || value === "checked" || value === "selected" || value === "active" || value === "page" || value === "on") return true;
    }
    const className = String(element.className || "");
    return /\b(?:active|selected|checked)\b/i.test(className) && !/\b(?:inactive|unselected|unchecked)\b/i.test(className);
  }

  function deepSeekModeClickableElement(element) {
    return closest(element, "button, [role='radio'], [role='tab'], [role='button'], label, input[type='radio']") || element;
  }

  function deepSeekModeCandidates() {
    const seen = new Set();
    const candidates = [];
    for (const element of visibleSelectorElements(DEEPSEEK_MODE_SELECTORS)) {
      if (!element || !visible(element) || isDisabledElement(element)) continue;
      const textValue = deepSeekModeCandidateText(element);
      if (!deepSeekModeIdFromText(textValue) || deepSeekModeIdCount(textValue) !== 1) continue;
      const clickable = deepSeekModeClickableElement(element);
      if (!clickable || seen.has(clickable) || !visible(clickable) || isDisabledElement(clickable)) continue;
      const clickableText = deepSeekModeCandidateText(clickable);
      if (!deepSeekModeIdFromText(clickableText) || deepSeekModeIdCount(clickableText) !== 1) continue;
      seen.add(clickable);
      candidates.push(clickable);
    }
    candidates.sort((a, b) => {
      const ar = modelRect(a);
      const br = modelRect(b);
      if (ar && br) return ar.top - br.top || ar.left - br.left;
      return 0;
    });
    return candidates;
  }

  function currentDeepSeekModeId() {
    const selected = deepSeekModeCandidates().find((element) => deepSeekModeElementLooksSelected(element));
    const selectedId = deepSeekModeIdFromText(deepSeekModeCandidateText(selected));
    if (selectedId) return selectedId;
    const heading = visibleSelectorElements("h1, h2, h3, [role='heading']")
      .map((element) => modelElementText(element))
      .find((value) => /start chatting with/i.test(String(value || "")));
    return deepSeekModeIdFromText(heading);
  }

  function findDeepSeekModeTarget(modeId) {
    if (!DEEPSEEK_MODE_TARGETS[modeId]) return null;
    const matches = deepSeekModeCandidates()
      .filter((element) => deepSeekModeIdFromText(deepSeekModeCandidateText(element)) === modeId)
      .map((element) => ({
        element,
        rect: modelRect(element),
        text: deepSeekModeCandidateText(element)
      }))
      .filter((item) => item.rect && item.rect.width >= 20 && item.rect.height >= 16);
    matches.sort((a, b) => {
      const aExact = alnumModelToken(a.text) === modeId ? 1 : 0;
      const bExact = alnumModelToken(b.text) === modeId ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return a.rect.top - b.rect.top || a.rect.left - b.rect.left;
    });
    return matches[0]?.element || null;
  }

  function clickDeepSeekMode(context, element) {
    const target = deepSeekModeClickableElement(element);
    return preferredModelActivate(context, target);
  }

  async function waitDeepSeekModeSettled(context, modeId) {
    const deadline = Date.now() + 2500;
    while (Date.now() <= deadline) {
      assertPreferredModelRun(context);
      if (currentDeepSeekModeId() === modeId) return true;
      await preferredModelSleep(context, 100);
    }
    assertPreferredModelRun(context);
    return currentDeepSeekModeId() === modeId;
  }

  async function applyDeepSeekPreferredModel(context, modeId) {
    if (!DEEPSEEK_MODE_TARGETS[modeId]) return preferredModelResult(context, false, "DeepSeek", modeId, "unknown mode");
    await waitForPreferredModel(context, () => currentDeepSeekModeId() || (deepSeekModeCandidates().length ? "ready" : ""), 10000, 150);
    const current = currentDeepSeekModeId();
    if (current === modeId) return preferredModelResult(context, true, "DeepSeek", modeId, "", { skipped: true });
    const target = await waitForPreferredModel(context, () => findDeepSeekModeTarget(modeId), 10000, 150);
    if (!target) return preferredModelResult(context, false, "DeepSeek", modeId, "target mode not found", { retryable: true });
    if (!clickDeepSeekMode(context, target)) return preferredModelResult(context, false, "DeepSeek", modeId, "target mode could not be clicked");
    return (await waitDeepSeekModeSettled(context, modeId))
      ? preferredModelResult(context, true, "DeepSeek", modeId, "", { changed: true })
      : preferredModelResult(context, false, "DeepSeek", modeId, "selection did not settle", { current: currentDeepSeekModeId() });
  }

  async function applyPreferredModel(context, data = {}) {
    assertPreferredModelRun(context);
    const rawAppId = String(data.appId || "").trim();
    const appId = ({
      "GrokMirror": "Grok",
      "Grok Mirror": "Grok",
      "DeepSeek AI": "DeepSeek",
      "Notion AI": "NotionAI"
    })[rawAppId] || rawAppId;
    const modelId = String(data.modelId || "").trim();
    if (!appId || !modelId) return preferredModelResult(context, true, appId || "unknown", modelId, "", { skipped: true });
    if (appId === "Gemini") return applyGeminiPreferredModel(context, modelId, { thinkingLevel: data.thinkingLevel });
    if (appId === "Grok") return applyGrokPreferredModel(context, modelId);
    if (appId === "DeepSeek") return applyDeepSeekPreferredModel(context, modelId);
    if (appId === "NotionAI") return applyNotionPreferredModel(context, modelId);
    return preferredModelResult(context, true, appId, modelId, "", { skipped: true, unsupported: true });
  }

  async function runPreferredModelApply(data = {}) {
    const runId = String(data.runId || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    abortActivePreferredModelRun("superseded by a newer preferred model run");
    const controller = new AbortController();
    const context = {
      runId,
      controller,
      signal: controller.signal,
      bridgeGeneration: nextPreferredModelBridgeRunSequence(),
      bridgeToken: "",
      bridgeReleased: false,
      focusShieldGeneration: 0,
      focusShieldValue: "",
      focusShieldReleaseScheduled: false,
      interactionCount: 0,
      abortKind: "",
      abortReason: ""
    };
    preferredModelState.activeRun = context;
    publishPreferredModelBridgeRun(context);
    const timeoutMs = Math.max(1000, Math.min(14000, Number(data.timeoutMs) || 12000));
    const timeout = setTimeout(() => {
      abortActivePreferredModelRun("preferred model apply timed out", runId);
    }, timeoutMs);
    const rawAppId = String(data.appId || "").trim();
    const appId = ({
      "GrokMirror": "Grok",
      "Grok Mirror": "Grok",
      "DeepSeek AI": "DeepSeek",
      "Notion AI": "NotionAI"
    })[rawAppId] || rawAppId || "unknown";
    const modelId = String(data.modelId || "").trim();
    try {
      return await applyPreferredModel(context, data);
    } catch (error) {
      const cancelled = Boolean(error?.preferredModelCancelled || preferredModelCancelled(context));
      if (cancelled) {
        const timedOut = context.abortKind === "timeout";
        return preferredModelResult(context, false, appId, modelId, error?.message || preferredModelAbortReason(context), {
          cancelled: !timedOut,
          retryable: timedOut
        });
      }
      return preferredModelResult(context, false, appId, modelId, error?.message || String(error));
    } finally {
      clearTimeout(timeout);
      releasePreferredModelBridgeRun(context);
      if (preferredModelState.activeRun === context) preferredModelState.activeRun = null;
    }
  }

  function cancelPreferredModelApply(data = {}) {
    const runId = String(data.runId || "");
    const active = preferredModelState.activeRun;
    const appId = String(data.appId || active?.appId || "unknown");
    const modelId = String(data.modelId || active?.modelId || "");
    const reason = String(data.reason || "preferred model apply cancelled");
    const cancelled = abortActivePreferredModelRun(reason, runId);
    return modelResult(true, appId, modelId, cancelled ? reason : "preferred model run is not active", {
      runId,
      skipped: !cancelled,
      cancelled,
      interactionCount: active?.interactionCount || 0
    });
  }
  return Object.freeze({
    runPreferredModelApply,
    cancelPreferredModelApply
  });
}
