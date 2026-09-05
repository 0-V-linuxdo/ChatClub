import {
  createPreferredNotionSourcesCapability,
  NOTION_ALL_SOURCES_STATES
} from "./preferred-notion-sources.js";
import { createPreferredNotionEffortCapability } from "./preferred-notion-effort.js";
import { NOTION_MODEL_TARGETS, resolveNotionApplyTarget } from "../../shared/notion-models.js";

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
    preferredModelPointerActivate,
    waitForPreferredModel,
    modelElementArea,
    modelEventConstructor,
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
  let applyNotionModelTargets = NOTION_MODEL_TARGETS;
  function notionModelTargets() {
    return applyNotionModelTargets;
  }

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
    '[role="button"][aria-haspopup="dialog"]',
    '[role="combobox"]',
    "button"
  ]);
  const NOTION_MODEL_DIRECT_TRIGGER_SELECTORS = Object.freeze([
    '[data-testid="agent-chat-model-button"]',
    '[data-testid="unified-chat-model-button"]'
  ]);
  const NOTION_MODEL_TRIGGER_WAIT_MS = 3500;
  const NOTION_MODEL_TRIGGER_HYDRATION_WAIT_MS = 600;
  const NOTION_MODEL_TRIGGER_HYDRATION_SAMPLES = 2;
  const NOTION_MODEL_MENU_OPEN_WAIT_MS = 2200;
  const NOTION_MODEL_ITEM_READY_WAIT_MS = 800;
  const NOTION_MODEL_SETTLE_WAIT_MS = 2200;
  const NOTION_MODEL_MENU_CLOSE_WAIT_MS = 700;
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
  const NOTION_OLDER_MODEL_SECTION_LABELS = Object.freeze([
    "Older models",
    "旧模型",
    "旧版模型"
  ]);
  const notionOwnedMenuRoots = new WeakMap();
  function notionText(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, " ");
  }

  function notionTextKey(value) {
    return notionText(value).replace(/[\s\u200b\u200c\u200d]+/g, "");
  }

  function notionLabels(target) {
    return [target?.id, target?.label, ...(target?.aliases || [])]
      .map(notionText)
      .filter(Boolean);
  }

  function notionTextEvidence(value) {
    const evidence = new Set();
    const add = (candidate) => {
      const normalized = notionText(candidate);
      if (normalized) evidence.add(normalized);
    };
    const raw = String(value || "");
    add(raw);
    for (const line of raw.split(/[\r\n\u2028\u2029]+/)) add(line);
    return [...evidence];
  }

  function notionTextLooksLikeTarget(value, target) {
    if (!target) return false;
    const labels = notionLabels(target);
    const keys = new Set(labels.map(notionTextKey));
    return notionTextEvidence(value).some((candidate) => (
      labels.includes(candidate) || keys.has(notionTextKey(candidate))
    ));
  }

  function notionModelIdsFromEvidence(evidence) {
    const ids = new Set();
    for (const candidate of evidence) {
      const candidateKey = notionTextKey(candidate);
      for (const [id, target] of Object.entries(notionModelTargets())) {
        const labels = notionLabels(target);
        if (labels.includes(candidate) || labels.some((label) => notionTextKey(label) === candidateKey)) {
          ids.add(id);
        }
      }
    }
    return ids;
  }

  function notionElementTextEvidence(element) {
    if (!element) return [];
    const evidence = new Set();
    const add = (value) => {
      for (const candidate of notionTextEvidence(value)) evidence.add(candidate);
    };
    const nodes = [element];
    try { nodes.push(...element.querySelectorAll?.("*") || []); } catch {}
    for (const node of nodes) {
      add(node.getAttribute?.("aria-label"));
      add(node.getAttribute?.("aria-valuetext"));
      add(node.getAttribute?.("title"));
      add(node.getAttribute?.("data-model"));
      add(node.getAttribute?.("data-model-id"));
      add(node.getAttribute?.("data-model-key"));
      add(node.getAttribute?.("data-value"));
      add(node.getAttribute?.("value"));
      add(node.innerText || node.textContent || "");
      add(node.value);
      add(modelElementText(node));
    }
    return [...evidence];
  }

  function notionModelIdsFromElement(element) {
    return notionModelIdsFromEvidence(notionElementTextEvidence(element));
  }

  function notionElementMatchesExactLabels(element, labels) {
    const labelKeys = new Set((labels || []).map(notionTextKey).filter(Boolean));
    if (!element || labelKeys.size === 0) return false;
    return notionElementTextEvidence(element).some((evidence) => labelKeys.has(notionTextKey(evidence)));
  }

  function notionElementLooksLikeTarget(element, target) {
    if (!element || !target) return false;
    return notionElementTextEvidence(element).some((candidate) => notionTextLooksLikeTarget(candidate, target));
  }

  function notionModelIdFromElement(element) {
    const ids = notionModelIdsFromElement(element);
    return ids.size === 1 ? [...ids][0] : "";
  }

  function notionViewportSize() {
    return {
      width: Number(window.innerWidth || document.documentElement?.clientWidth || 0),
      height: Number(window.innerHeight || document.documentElement?.clientHeight || 0)
    };
  }

  function notionResponsiveComposerMinWidth(wideMinimum) {
    const viewportWidth = notionViewportSize().width;
    if (!(viewportWidth > 0)) return wideMinimum;
    // Notion keeps the same bottom composer in narrow split panes, where the
    // iframe itself can be only about 308px wide. Keep the wide-layout guard,
    // but allow a narrow composer only when it still spans most of its viewport.
    return Math.min(wideMinimum, Math.max(216, Math.floor(viewportWidth * 0.7)));
  }

  function isLikelyNotionMainComposerRect(rect) {
    if (
      !rect
      || rect.width < notionResponsiveComposerMinWidth(280)
      || rect.height < 40
      || rect.height > 280
    ) return false;
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
      'input[role="textbox"]',
      '[contenteditable="true"]',
      '[role="textbox"]',
      '[data-placeholder]',
      '[aria-placeholder]',
      "form"
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
        if (
          rect
          && rect.width >= notionResponsiveComposerMinWidth(320)
          && rect.height >= 44
          && rect.height <= 260
        ) {
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
    const dataTestId = String(element.getAttribute?.("data-testid") || "").toLowerCase();
    const ariaLabel = String(element.getAttribute?.("aria-label") || "");
    const title = String(element.getAttribute?.("title") || "");
    const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
    const nearMainComposer = isNotionModelTriggerNearMainComposer(element, options.composerRoot || null, options.composerRect || null);
    let semanticScore = 0;
    if (dataTestId === "agent-chat-model-button" || dataTestId === "unified-chat-model-button") semanticScore += 1000;
    if (dataTestId.includes("model")) semanticScore += 500;
    if (/\bmodel\b|模型/i.test(ariaLabel)) semanticScore += 420;
    if (/\bmodel\b|模型/i.test(title)) semanticScore += 320;
    if (notionModelIdFromElement(element)) semanticScore += 360;
    if (semanticScore <= 0) return -1;
    let score = semanticScore;
    if (nearMainComposer) score += 900;
    if (options.composerRoot && !nearMainComposer) score -= 420;
    if (popup === "menu" || popup === "listbox") score += 80;
    if (notionElementLooksLikeTarget(element, NOTION_MODEL_TARGETS.auto)) score += 80;
    return score > 0 ? score : -1;
  }

  function findNotionModelControl({ allowDisabled = false } = {}) {
    const directCandidates = [...new Set(visibleSelectorElements(NOTION_MODEL_DIRECT_TRIGGER_SELECTORS))]
      .map((element) => ({
        element,
        score: scoreNotionModelTrigger(element, { allowDisabled }),
        bottom: Number(element.getBoundingClientRect?.().bottom || 0)
      }))
      .filter((item) => item.score > 0);
    directCandidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
    if (directCandidates.length > 0) {
      return directCandidates.length === 1 ? directCandidates[0].element : null;
    }

    const composerRoot = findNotionComposerRoot();
    if (!composerRoot) return null;
    const composerRect = modelRect(composerRoot);
    const candidates = [...new Set(visibleSelectorElements(NOTION_MODEL_TRIGGER_SELECTORS))]
      .map((element) => ({
        element,
        score: scoreNotionModelTrigger(element, { composerRoot, composerRect, allowDisabled }),
        nearMainComposer: isNotionModelTriggerNearMainComposer(element, composerRoot, composerRect),
        bottom: Number(element.getBoundingClientRect?.().bottom || 0)
      }))
      .filter((item) => item.nearMainComposer && item.score > 0);
    candidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
    return candidates.length === 1 ? candidates[0].element : null;
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
    if (normalized.includes("for your hardest tasks")) score += 160;
    if (normalized.includes("open models")) score += 80;
    score += Math.min(5, notionModelIdsFromElement(root).size) * 80;
    return score >= 160 ? score : -1;
  }

  function notionModelMenuRoots() {
    const roots = [...new Set(visibleSelectorElements(NOTION_MODEL_MENU_ROOT_SELECTORS))]
      .filter((element) => scoreNotionModelMenuRoot(element) > 0);
    return roots.filter((root) => !roots.some((candidate) => (
      candidate !== root && root.contains?.(candidate)
    )));
  }

  function notionControlledModelMenuRoot(trigger) {
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (!controlsId) return null;
    let controlled = [];
    const escapeId = globalThis.CSS?.escape;
    if (typeof document.querySelectorAll === "function" && typeof escapeId === "function") {
      try {
        controlled = [...document.querySelectorAll(`#${escapeId(controlsId)}`)];
      } catch {}
    } else {
      const element = document.getElementById?.(controlsId);
      if (element) controlled = [element];
    }
    return controlled.length === 1 && scoreNotionModelMenuRoot(controlled[0]) > 0
      ? controlled[0]
      : null;
  }

  function notionModelMenuRoot(trigger = null) {
    if (!trigger) return null;
    const controlled = notionControlledModelMenuRoot(trigger);
    if (controlled) return controlled;
    const owned = notionOwnedMenuRoots.get(trigger);
    if (scoreNotionModelMenuRoot(owned) > 0) return owned;
    notionOwnedMenuRoots.delete(trigger);
    return null;
  }

  async function openNotionModelMenu(context, trigger) {
    assertPreferredModelRun(context);
    const existing = notionModelMenuRoot(trigger);
    if (existing) return existing;
    const baselineRoots = new Set(notionModelMenuRoots());
    if (!trigger || !preferredModelActivate(context, trigger)) return null;
    return waitForPreferredModel(context, () => {
      const controlled = notionControlledModelMenuRoot(trigger);
      if (controlled) {
        notionOwnedMenuRoots.set(trigger, controlled);
        return controlled;
      }
      const opened = notionModelMenuRoots().filter((root) => !baselineRoots.has(root));
      if (opened.length !== 1) return null;
      notionOwnedMenuRoots.set(trigger, opened[0]);
      return opened[0];
    }, NOTION_MODEL_MENU_OPEN_WAIT_MS, 120);
  }

  function notionMenuItemRow(element, root, modelId = "", options = {}) {
    const allowDisabled = options.allowDisabled === true;
    const rootArea = modelElementArea(root);
    const rootRect = modelRect(root);
    let bestRoleRow = null;
    let bestAction = null;
    let bestRowLike = null;
    let node = element;
    while (node && node.nodeType === 1 && node !== root) {
      if (!visible(node)) {
        node = node.parentElement || null;
        continue;
      }
      if (!allowDisabled && isDisabledElement(node)) return null;

      const targetIds = notionModelIdsFromElement(node);
      const area = modelElementArea(node);
      if (rootArea > 0 && area >= rootArea * 0.85) break;
      if (modelId && !targetIds.has(modelId)) {
        node = node.parentElement || null;
        continue;
      }
      if (targetIds.size > 1) {
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
      if (rowLike) bestRowLike = node;
      node = node.parentElement || null;
    }
    return bestRoleRow || bestAction || bestRowLike || null;
  }

  function scoreNotionModelItem(element, modelId, options = {}) {
    const allowDisabled = options.allowDisabled === true;
    if (!element || !visible(element) || (!allowDisabled && isDisabledElement(element))) {
      return Number.NEGATIVE_INFINITY;
    }
    const target = notionModelTargets()[modelId];
    if (!target || !notionElementLooksLikeTarget(element, target)) return Number.NEGATIVE_INFINITY;
    let score = 0;
    const role = String(element.getAttribute?.("role") || "").toLowerCase();
    const tag = String(element.tagName || "").toLowerCase();
    const tabIndex = String(element.getAttribute?.("tabindex") || "").trim();
    const targetCount = notionModelIdsFromElement(element).size;
    if (role === "menuitem" || role === "menuitemradio" || role === "option") score += 900;
    if (tag === "button" || role === "button") score += 360;
    if (tabIndex && tabIndex !== "-1") score += 120;
    if (targetCount === 1) score += 260;
    if (targetCount > 1) score -= 700;
    score += 880;
    const rect = modelRect(element);
    if (rect && rect.height >= 24 && rect.height <= 72) score += 100;
    if (rect && rect.width >= 120) score += 40;
    score -= Math.min(160, modelElementArea(element) / 6000);
    return score;
  }

  function notionModelRowIsDisabled(row, root) {
    for (let node = row; node && node.nodeType === 1 && node !== root; node = node.parentElement || null) {
      if (isDisabledElement(node)) return true;
    }
    return false;
  }

  function notionModelItemRows(root, modelId, options = {}) {
    if (!root || !notionModelTargets()[modelId]) return [];
    const allowDisabled = options.allowDisabled === true;
    const target = notionModelTargets()[modelId];
    const seenRows = new Set();
    const rows = [];
    const add = (element) => {
      if (!element || !notionElementLooksLikeTarget(element, target)) return;
      const row = notionMenuItemRow(element, root, modelId, { allowDisabled });
      if (!row || seenRows.has(row) || !root.contains?.(row)) return;
      if (!allowDisabled && notionModelRowIsDisabled(row, root)) return;
      const targetIds = notionModelIdsFromElement(row);
      if (targetIds.size !== 1 || !targetIds.has(modelId)) return;
      if (!Number.isFinite(scoreNotionModelItem(row, modelId, { allowDisabled }))) return;
      seenRows.add(row);
      rows.push(row);
    };
    for (const element of visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "button"], root)) add(element);
    rows.sort((a, b) => (
      scoreNotionModelItem(b, modelId, { allowDisabled })
      - scoreNotionModelItem(a, modelId, { allowDisabled })
    ));
    // Notion's live picker exposes one semantic `menuitem` row plus several
    // visible div/span wrappers carrying the same label.  Prefer the
    // semantic action rows when they exist so structural text clones cannot
    // turn one selectable model into an ambiguous result.  If a site has no
    // semantic row, retain the bounded structural fallback and its existing
    // fail-closed uniqueness check.
    const semanticRows = rows.filter((row) => {
      const role = String(row.getAttribute?.("role") || "").toLowerCase();
      return role === "menuitem" || role === "menuitemradio" || role === "option";
    });
    return semanticRows.length > 0 ? semanticRows : rows;
  }

  function findNotionModelItem(root, modelId) {
    const rows = notionModelItemRows(root, modelId);
    if (rows.length === 1) return rows[0];
    const groupedPicker = notionText(modelElementText(root)).includes("for your hardest tasks");
    if (groupedPicker && rows.length > 1 && rows.every((row) => (
      notionModelIdsFromElement(row).size === 1
      && notionModelIdsFromElement(row).has(modelId)
    ))) {
      // The updated picker repeats the same model in the curated and provider
      // groups.  They share the same verified model identity, so choose the
      // first DOM-ordered semantic action and still verify the new selection
      // through the trigger after activation.
      return rows[0];
    }
    return null;
  }

  function findNotionExactUnavailableModelItem(root, modelId) {
    const rows = notionModelItemRows(root, modelId, { allowDisabled: true });
    return rows.length === 1 && notionModelRowIsDisabled(rows[0], root) ? rows[0] : null;
  }

  function notionModelSearchRoots(root) {
    const roots = [root, ...notionModelMenuRoots()];
    const seen = new Set();
    return roots.filter((candidate) => {
      if (!candidate || seen.has(candidate) || !visible(candidate)) return false;
      seen.add(candidate);
      return true;
    });
  }

  function findNotionModelItemAcrossRoots(root, modelId) {
    const matches = [];
    const seenItems = new Set();
    for (const candidate of notionModelSearchRoots(root)) {
      const item = findNotionModelItem(candidate, modelId);
      if (!item || seenItems.has(item)) continue;
      seenItems.add(item);
      matches.push({ item, root: candidate });
    }
    return matches.length === 1 ? matches[0] : null;
  }

  function findNotionExactUnavailableModelItemAcrossRoots(root, modelId) {
    const matches = [];
    const seenItems = new Set();
    for (const candidate of notionModelSearchRoots(root)) {
      const item = findNotionExactUnavailableModelItem(candidate, modelId);
      if (!item || seenItems.has(item)) continue;
      seenItems.add(item);
      matches.push({ item, root: candidate });
    }
    return matches.length === 1 ? matches[0] : null;
  }

  function findNotionOlderModelSection(root) {
    const candidates = visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)
      .filter((element) => notionElementMatchesExactLabels(element, NOTION_OLDER_MODEL_SECTION_LABELS));
    return candidates.length === 1 ? candidates[0] : null;
  }

  async function expandNotionOlderModelSection(context, root, modelId) {
    assertPreferredModelRun(context);
    if (findNotionModelItemAcrossRoots(root, modelId)) return true;
    const section = findNotionOlderModelSection(root);
    if (!section) return false;
    const pointerActivate = typeof preferredModelPointerActivate === "function"
      ? preferredModelPointerActivate
      : preferredModelActivate;
    if (!pointerActivate(context, section)) return false;
    return Boolean(await waitForPreferredModel(
      context,
      () => findNotionModelItemAcrossRoots(root, modelId)
        || notionElementMatchesExactLabels(section, NOTION_OLDER_MODEL_SECTION_LABELS)
          && String(section.getAttribute?.("aria-expanded") || "").trim().toLowerCase() === "true",
      NOTION_MODEL_ITEM_READY_WAIT_MS,
      80
    ));
  }

  function notionElementHasSelectedState(element) {
    if (!element) return false;
    for (const attr of ["aria-checked", "aria-selected", "aria-current", "aria-pressed", "data-state", "data-selected", "data-active", "data-checked"]) {
      const value = String(element.getAttribute?.(attr) || "").trim().toLowerCase();
      if (["true", "checked", "selected", "active", "on", "page", "step", "location", "date", "time"].includes(value)) return true;
    }
    const className = String(element.className || "");
    return /\b(?:selected|checked|active)\b/i.test(className)
      && !/\b(?:not[-_\s]?(?:selected|checked|active)|unselected|inactive|unchecked)\b/i.test(className);
  }

  function notionRowHasRightCheckMarker(row) {
    const rowRect = modelRect(row);
    if (!rowRect || rowRect.width <= 0 || rowRect.height <= 0) return false;
    if (/[✓✔]/.test(String(row?.innerText || row?.textContent || ""))) return true;
    for (const marker of visibleSelectorElements([
      "[aria-label]",
      "[data-testid]",
      "[class]",
      "[title]",
      "[data-icon]",
      "[data-icon-name]",
      "svg"
    ], row)) {
      if (notionElementHasSelectedState(marker)) return true;
      const label = [
        marker.getAttribute?.("aria-label"),
        marker.getAttribute?.("data-testid"),
        marker.getAttribute?.("class"),
        marker.getAttribute?.("title"),
        marker.getAttribute?.("data-icon"),
        marker.getAttribute?.("data-icon-name"),
        marker.innerText || marker.textContent || ""
      ].filter(Boolean).join(" ");
      if (/\b(?:not[ -]?selected|unselected|unchecked|not[ -]?checked|inactive)\b/i.test(label)) continue;
      if (/\b(?:check|checked|selected|done)\b|✓|✔/i.test(label)) return true;
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
      "[aria-pressed]",
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
      const targetIds = notionModelIdsFromElement(row);
      if (targetIds.size !== 1) return;
      const id = [...targetIds][0];
      if (!id || !notionRowLooksSelected(row)) return;
      seenRows.add(row);
      rows.push({ element: row, id, score: scoreNotionModelItem(row, id) });
    };
    for (const element of visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "button", "svg"], root)) add(element);
    rows.sort((a, b) => b.score - a.score);
    return rows.length === 1 ? rows[0].id : "";
  }

  function currentNotionModelId(trigger = null) {
    const selected = selectedNotionModelId(notionModelMenuRoot(trigger));
    if (selected) return selected;
    const triggerElement = trigger && visible(trigger) ? trigger : findNotionModelIndicator();
    return notionModelIdFromElement(triggerElement);
  }

  async function closeNotionModelMenu(context, trigger = null) {
    return dismissPreferredModelMenu(context, () => notionModelMenuRoot(trigger), NOTION_MODEL_MENU_CLOSE_WAIT_MS);
  }

  async function waitNotionModelSettled(context, modelId, trigger) {
    const deadline = Date.now() + NOTION_MODEL_SETTLE_WAIT_MS;
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

  async function waitNotionModelItemOrCurrent(context, modelId, trigger) {
    return waitForPreferredModel(context, () => {
      if (currentNotionModelId(trigger) === modelId) return { current: true, item: null };
      const activeRoot = notionModelMenuRoot(trigger);
      const match = findNotionModelItemAcrossRoots(activeRoot, modelId);
      return match ? { current: false, item: match.item } : null;
    }, NOTION_MODEL_ITEM_READY_WAIT_MS, 80);
  }

  function notionTriggerModelId(trigger) {
    return notionModelIdFromElement(trigger);
  }

  async function waitNotionTriggerHydration(context, modelId, trigger, deadlineAt) {
    const initialModelId = notionTriggerModelId(trigger);
    if (initialModelId === modelId) return { current: true, modelId: initialModelId };
    if (initialModelId && initialModelId !== "auto") return { current: false, modelId: initialModelId };

    const timeoutMs = Math.min(
      NOTION_MODEL_TRIGGER_HYDRATION_WAIT_MS,
      Math.max(0, Number(deadlineAt || 0) - Date.now())
    );
    if (timeoutMs <= 0) return { current: false, modelId: initialModelId };

    let targetSamples = 0;
    const readiness = await waitForPreferredModel(context, () => {
      const currentModelId = notionTriggerModelId(trigger);
      if (currentModelId === modelId) {
        targetSamples += 1;
        return targetSamples >= NOTION_MODEL_TRIGGER_HYDRATION_SAMPLES
          ? { current: true, modelId: currentModelId }
          : null;
      }
      targetSamples = 0;
      if (currentModelId && currentModelId !== "auto") {
        return { current: false, modelId: currentModelId };
      }
      return null;
    }, timeoutMs, 80);
    return readiness || { current: false, modelId: notionTriggerModelId(trigger) };
  }

  const notionEffort = createPreferredNotionEffortCapability({
    modelTargets: NOTION_MODEL_TARGETS,
    menuRootSelectors: NOTION_MODEL_MENU_ROOT_SELECTORS,
    notionText,
    notionTextKey,
    notionElementTextEvidence,
    visibleSelectorElements,
    modelElementText,
    modelRect,
    modelElementArea,
    visible,
    isDisabledElement,
    findNotionComposerRoot,
    isControlNearMainComposer: isNotionModelTriggerNearMainComposer,
    assertPreferredModelRun,
    preferredModelActivate,
    waitForPreferredModel,
    preferredModelSleep,
    dismissPreferredModelMenu,
    preferredModelResult
  });

  async function notionUnavailableModelResult(context, modelId, trigger) {
    const menuClosed = await closeNotionModelMenu(context, trigger);
    return preferredModelResult(context, true, "NotionAI", modelId, "", {
      skipped: true,
      unavailable: true,
      fallbackEligible: menuClosed === true,
      selectionActivated: false,
      menuClosed
    });
  }

  async function applyNotionPreferredModel(context, modelId) {
    if (!notionModelTargets()[modelId]) return preferredModelResult(context, false, "NotionAI", modelId, "unknown model");
    if (currentNotionModelId() === modelId) {
      const menuClosed = await closeNotionModelMenu(context);
      return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const triggerDeadlineAt = Date.now() + NOTION_MODEL_TRIGGER_WAIT_MS;
    const trigger = await waitForPreferredModel(context, findNotionModelTrigger, NOTION_MODEL_TRIGGER_WAIT_MS, 150);
    if (!trigger) {
      await closeNotionModelMenu(context);
      return preferredModelResult(context, false, "NotionAI", modelId, "model trigger not found", { retryable: true });
    }
    const triggerReadiness = await waitNotionTriggerHydration(context, modelId, trigger, triggerDeadlineAt);
    if (triggerReadiness.current) {
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
    let immediateMatch = findNotionModelItemAcrossRoots(root, modelId);
    if (!immediateMatch) await expandNotionOlderModelSection(context, root, modelId);
    immediateMatch = immediateMatch || findNotionModelItemAcrossRoots(root, modelId);
    const immediateItem = immediateMatch?.item || null;
    const immediateUnavailableItem = immediateItem
      ? null
      : findNotionExactUnavailableModelItemAcrossRoots(root, modelId)?.item || null;
    if (immediateUnavailableItem) {
      return notionUnavailableModelResult(context, modelId, trigger);
    }
    const readiness = immediateItem
      ? { current: false, item: immediateItem }
      : await waitNotionModelItemOrCurrent(context, modelId, trigger);
    if (readiness?.current) {
      const menuClosed = await closeNotionModelMenu(context, trigger);
      return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const item = readiness?.item || null;
    if (!item) {
      const unavailableItem = findNotionExactUnavailableModelItemAcrossRoots(notionModelMenuRoot(trigger), modelId)?.item || null;
      if (unavailableItem) {
        return notionUnavailableModelResult(context, modelId, trigger);
      }
      const menuClosed = await closeNotionModelMenu(context, trigger);
      if (currentNotionModelId(trigger) === modelId) {
        return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed });
      }
      return preferredModelResult(context, false, "NotionAI", modelId, "target model item not found", {
        retryable: menuClosed === true,
        retryableBeforeSelection: true,
        selectionActivated: false,
        menuClosed
      });
    }
    const clicked = preferredModelActivate(context, item);
    let settled = clicked ? await waitNotionModelSettled(context, modelId, trigger) : false;
    const menuClosed = await closeNotionModelMenu(context, trigger);
    if (!settled && currentNotionModelId(trigger) === modelId) settled = true;
    if (!clicked) return preferredModelResult(context, false, "NotionAI", modelId, "target model item could not be clicked", { menuClosed });
    return settled
      ? preferredModelResult(context, true, "NotionAI", modelId, "", { changed: true, menuClosed })
      : preferredModelResult(context, false, "NotionAI", modelId, "selection did not settle", {
          fallbackEligible: menuClosed === true,
          selectionActivated: true,
          selectionUnsettled: true,
          menuClosed
        });
  }

  const notionSources = createPreferredNotionSourcesCapability({
    normalize,
    modelElementText,
    visibleSelectorElements,
    modelRect,
    visible,
    isDisabledElement,
    assertPreferredModelRun,
    preferredModelActivate,
    preferredModelPointerActivate,
    waitForPreferredModel,
    modelElementArea,
    modelEventConstructor,
    closest,
    preferredModelResult,
    findNotionComposerRoot,
    isNotionControlNearMainComposer: isNotionModelTriggerNearMainComposer
  });

  async function applyNotionPreferencesTransaction(context, modelId, effortId, allSourcesState, sourcesLease) {
    let modelOutcome = null;
    let effortOutcome = null;
    let sourceOutcome = null;
    // Keep a missing Sources control safely retryable before any model click, then
    // traverse the visible Sources UI only once after the model has settled.
    if (modelId && allSourcesState) {
      const sourceTrigger = await notionSources.preflightNotionAllSourcesTrigger(context);
      assertPreferredModelRun(context);
      if (!sourceTrigger) {
        return preferredModelResult(context, false, "NotionAI", modelId, "sources trigger not found", {
          retryable: true,
          allSourcesState
        });
      }
    }
    if (modelId) {
      modelOutcome = await applyNotionPreferredModel(context, modelId);
      if (modelOutcome.ok !== true || modelOutcome.unavailable === true) {
        return modelOutcome;
      }
    }
    if (effortId) {
      effortOutcome = await notionEffort.applyNotionPreferredEffort(context, modelId, effortId);
      if (effortOutcome.ok !== true) return effortOutcome;
    }
    if (allSourcesState) {
      sourceOutcome = await notionSources.applyNotionAllSourcesPreference(
        context,
        modelId,
        allSourcesState,
        sourcesLease
      );
      if (sourceOutcome.ok !== true || !modelId) return sourceOutcome;
    }
    if (!allSourcesState && !effortId) return modelOutcome;
    if (currentNotionModelId() !== modelId) {
      return preferredModelResult(context, false, "NotionAI", modelId, "model changed while applying sources", {
        menuClosed: sourceOutcome?.menuClosed ?? effortOutcome?.menuClosed ?? modelOutcome?.menuClosed,
        effortId,
        allSourcesState
      });
    }
    await preferredModelSleep(context, 120);
    if (currentNotionModelId() !== modelId) {
      return preferredModelResult(context, false, "NotionAI", modelId, "model was not stable after applying sources", {
        menuClosed: sourceOutcome?.menuClosed ?? effortOutcome?.menuClosed ?? modelOutcome?.menuClosed,
        effortId,
        allSourcesState
      });
    }
    if (effortId && notionEffort.currentNotionEffortId() !== effortId) {
      return preferredModelResult(context, false, "NotionAI", modelId, "effort was not stable after applying", {
        menuClosed: sourceOutcome?.menuClosed ?? effortOutcome?.menuClosed ?? modelOutcome?.menuClosed,
        effortId,
        allSourcesState
      });
    }
    const changed = modelOutcome?.changed === true
      || effortOutcome?.changed === true
      || sourceOutcome?.changed === true;
    return preferredModelResult(context, true, "NotionAI", modelId, "", {
      changed,
      skipped: !changed,
      menuClosed: sourceOutcome?.menuClosed ?? effortOutcome?.menuClosed ?? modelOutcome?.menuClosed,
      effortId,
      allSourcesState
    });
  }

  function applyNotionPreferences(context, modelId, effortId, allSourcesState) {
    return notionSources.runNotionPreferenceOperation(
      context,
      (sourcesLease) => applyNotionPreferencesTransaction(context, modelId, effortId, allSourcesState, sourcesLease)
    );
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
    const rawEffortId = String(data.effortId || "").trim();
    const rawAllSourcesState = String(data.allSourcesState || "").trim();
    const allSourcesState = NOTION_ALL_SOURCES_STATES.includes(rawAllSourcesState) ? rawAllSourcesState : "";
    if (!appId) return preferredModelResult(context, true, "unknown", modelId, "", { skipped: true });
    if (appId === "NotionAI") {
      const modelLabel = String(data.modelLabel || "").trim();
      const resolved = resolveNotionApplyTarget(modelId, modelLabel);
      applyNotionModelTargets = resolved.targets;
      try {
        if (rawAllSourcesState && !allSourcesState) {
          return preferredModelResult(context, false, appId, modelId, "unknown all sources state");
        }
        if (rawEffortId && !resolved.id) {
          return preferredModelResult(context, false, appId, modelId, "effort requires a model", { effortId: rawEffortId });
        }
        if (!resolved.id && !allSourcesState) {
          return preferredModelResult(context, true, appId, modelId, "", { skipped: true });
        }
        if ((modelId || modelLabel) && !resolved.known) {
          return preferredModelResult(context, false, appId, modelId, "unknown model");
        }
        const applyId = resolved.known ? resolved.id : "";
        if (rawEffortId && !notionEffort.isSupported(applyId, rawEffortId)) {
          return preferredModelResult(context, false, appId, applyId, "unknown effort for model", { effortId: rawEffortId });
        }
        return await applyNotionPreferences(context, applyId, rawEffortId, allSourcesState);
      } finally {
        applyNotionModelTargets = NOTION_MODEL_TARGETS;
      }
    }
    if (!modelId) return preferredModelResult(context, true, appId, modelId, "", { skipped: true });
    if (appId === "Gemini") return applyGeminiPreferredModel(context, modelId, { thinkingLevel: data.thinkingLevel });
    if (appId === "Grok") return applyGrokPreferredModel(context, modelId);
    if (appId === "DeepSeek") return applyDeepSeekPreferredModel(context, modelId);
    return preferredModelResult(context, true, appId, modelId, "", { skipped: true, unsupported: true });
  }

  async function runPreferredModelApply(data = {}) {
    const runId = String(data.runId || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    abortActivePreferredModelRun("superseded by a newer preferred model run");
    const controller = new AbortController();
    const rawAppId = String(data.appId || "").trim();
    const appId = ({
      "GrokMirror": "Grok",
      "Grok Mirror": "Grok",
      "DeepSeek AI": "DeepSeek",
      "Notion AI": "NotionAI"
    })[rawAppId] || rawAppId || "unknown";
    const hasNotionSourcesPreference = appId === "NotionAI"
      && NOTION_ALL_SOURCES_STATES.includes(String(data.allSourcesState || "").trim());
    const defaultTimeoutMs = hasNotionSourcesPreference ? 43000 : 12000;
    const maximumTimeoutMs = hasNotionSourcesPreference ? 44000 : 14000;
    const timeoutMs = Math.max(1000, Math.min(maximumTimeoutMs, Number(data.timeoutMs) || defaultTimeoutMs));
    const context = {
      runId,
      controller,
      signal: controller.signal,
      deadlineAt: Date.now() + timeoutMs,
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
    const timeout = setTimeout(() => {
      abortActivePreferredModelRun("preferred model apply timed out", runId);
    }, timeoutMs);
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
