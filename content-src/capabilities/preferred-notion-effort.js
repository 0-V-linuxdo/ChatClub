import {
  NOTION_EFFORT_TARGETS,
  notionEffortTargetsForModel
} from "../../shared/notion-efforts.js";
import { isModelPreferenceCustomId } from "../../shared/model-preference-selection.js";

export function createPreferredNotionEffortCapability(deps = {}) {
  const {
    modelTargets,
    menuRootSelectors,
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
    isControlNearMainComposer,
    assertPreferredModelRun,
    preferredModelActivate,
    waitForPreferredModel,
    preferredModelSleep,
    dismissPreferredModelMenu,
    preferredModelResult
  } = deps;
  const NOTION_EFFORT_TRIGGER_SELECTORS = Object.freeze([
    '[data-testid="unified-chat-reasoning-effort-button"]',
    '[data-testid*="reasoning-effort" i]',
    '[aria-label*="Change effort" i]',
    '[aria-label*="effort" i]',
    '[aria-label*="推理" i]',
    '[role="button"][data-testid*="effort" i]',
    '[role="button"][aria-label*="effort" i]'
  ]);
  const NOTION_EFFORT_DIRECT_TRIGGER_SELECTORS = Object.freeze([
    '[data-testid="unified-chat-reasoning-effort-button"]'
  ]);
  const NOTION_EFFORT_MENU_ROOT_SELECTORS = menuRootSelectors;
  const NOTION_EFFORT_ITEM_SELECTORS = Object.freeze([
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[role="option"]',
    '[role="button"]',
    '[data-model]',
    '[data-value]',
    "button",
    '[tabindex]:not([tabindex="-1"])'
  ]);
  const NOTION_EFFORT_MENU_OPEN_WAIT_MS = 1800;
  const NOTION_EFFORT_ITEM_READY_WAIT_MS = 700;
  const NOTION_EFFORT_SETTLE_WAIT_MS = 1800;
  const NOTION_EFFORT_MENU_CLOSE_WAIT_MS = 600;
  const notionOwnedEffortMenuRoots = new WeakMap();

  function notionEffortIdFromText(value) {
    const normalized = notionText(value)
      .replace(/\bdefault\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return "";
    const candidates = Object.values(NOTION_EFFORT_TARGETS)
      .flatMap((target) => [target.id, target.label, ...(target.aliases || [])]
        .map((label) => ({ id: target.id, label: notionText(label) })))
      .filter((candidate) => candidate.label)
      .sort((a, b) => b.label.length - a.label.length);
    return candidates.find((candidate) => (
      normalized === candidate.label
      || notionTextKey(normalized) === notionTextKey(candidate.label)
      || normalized.includes(candidate.label)
    ))?.id || "";
  }

  function notionEffortIdFromElement(element) {
    if (!element) return "";
    for (const evidence of notionElementTextEvidence(element)) {
      const effortId = notionEffortIdFromText(evidence);
      if (effortId) return effortId;
    }
    return "";
  }

  function notionElementLooksLikeEffortTarget(element, target) {
    if (!element || !target) return false;
    return notionElementTextEvidence(element).some((evidence) => (
      notionEffortIdFromText(evidence) === target.id
    ));
  }

  function scoreNotionEffortTrigger(element, options = {}) {
    if (!element || !visible(element) || (!options.allowDisabled && isDisabledElement(element))) return -1;
    if (element.closest?.(NOTION_EFFORT_MENU_ROOT_SELECTORS.join(", "))) return -1;
    const dataTestId = String(element.getAttribute?.("data-testid") || "").toLowerCase();
    const ariaLabel = String(element.getAttribute?.("aria-label") || "");
    const title = String(element.getAttribute?.("title") || "");
    const composerRoot = options.composerRoot || null;
    const composerRect = options.composerRect || null;
    const nearMainComposer = isControlNearMainComposer(element, composerRoot, composerRect);
    let semanticScore = 0;
    if (dataTestId === "unified-chat-reasoning-effort-button") semanticScore += 1000;
    if (dataTestId.includes("effort") || dataTestId.includes("reasoning")) semanticScore += 500;
    if (/\beffort\b|推理/i.test(ariaLabel)) semanticScore += 480;
    if (/\beffort\b|推理/i.test(title)) semanticScore += 320;
    if (notionEffortIdFromElement(element)) semanticScore += 280;
    if (semanticScore <= 0) return -1;
    let score = semanticScore;
    if (nearMainComposer) score += 900;
    if (composerRoot && !nearMainComposer) score -= 420;
    return score > 0 ? score : -1;
  }

  function findNotionEffortControl({ allowDisabled = false } = {}) {
    const directCandidates = [...new Set(visibleSelectorElements(NOTION_EFFORT_DIRECT_TRIGGER_SELECTORS))]
      .map((element) => ({
        element,
        score: scoreNotionEffortTrigger(element, { allowDisabled })
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    if (directCandidates.length > 0) {
      return directCandidates.length === 1 ? directCandidates[0].element : null;
    }

    const composerRoot = findNotionComposerRoot();
    if (!composerRoot) return null;
    const composerRect = modelRect(composerRoot);
    const candidates = [...new Set(visibleSelectorElements(NOTION_EFFORT_TRIGGER_SELECTORS))]
      .map((element) => ({
        element,
        score: scoreNotionEffortTrigger(element, { composerRoot, composerRect, allowDisabled }),
        nearMainComposer: isControlNearMainComposer(element, composerRoot, composerRect)
      }))
      .filter((item) => item.nearMainComposer && item.score > 0)
      .sort((a, b) => b.score - a.score);
    return candidates.length === 1 ? candidates[0].element : null;
  }

  function findNotionEffortTrigger() {
    return findNotionEffortControl();
  }

  function scoreNotionEffortMenuRoot(root) {
    if (!root || !visible(root)) return -1;
    const normalized = notionText(modelElementText(root));
    let score = normalized.includes("effort") ? 360 : 0;
    for (const target of Object.values(NOTION_EFFORT_TARGETS)) {
      if (notionElementLooksLikeEffortTarget(root, target)) score += 70;
    }
    return score >= 360 ? score : -1;
  }

  function notionEffortMenuRoots() {
    const roots = [...new Set(visibleSelectorElements(NOTION_EFFORT_MENU_ROOT_SELECTORS))]
      .filter((element) => scoreNotionEffortMenuRoot(element) > 0);
    return roots.filter((root) => !roots.some((candidate) => (
      candidate !== root && root.contains?.(candidate)
    )));
  }

  function notionControlledEffortMenuRoot(trigger) {
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
    return controlled.length === 1 && scoreNotionEffortMenuRoot(controlled[0]) > 0
      ? controlled[0]
      : null;
  }

  function notionEffortMenuRoot(trigger = null) {
    if (!trigger) return null;
    const controlled = notionControlledEffortMenuRoot(trigger);
    if (controlled) return controlled;
    const owned = notionOwnedEffortMenuRoots.get(trigger);
    if (scoreNotionEffortMenuRoot(owned) > 0) return owned;
    notionOwnedEffortMenuRoots.delete(trigger);
    return null;
  }

  async function openNotionEffortMenu(context, trigger) {
    assertPreferredModelRun(context);
    const existing = notionEffortMenuRoot(trigger);
    if (existing) return existing;
    const baselineRoots = new Set(notionEffortMenuRoots());
    if (!trigger || !preferredModelActivate(context, trigger)) return null;
    return waitForPreferredModel(context, () => {
      const controlled = notionControlledEffortMenuRoot(trigger);
      if (controlled) {
        notionOwnedEffortMenuRoots.set(trigger, controlled);
        return controlled;
      }
      const opened = notionEffortMenuRoots().filter((root) => !baselineRoots.has(root));
      if (opened.length !== 1) return null;
      notionOwnedEffortMenuRoots.set(trigger, opened[0]);
      return opened[0];
    }, NOTION_EFFORT_MENU_OPEN_WAIT_MS, 100);
  }

  function notionEffortMenuItemRow(element, root, effortId, options = {}) {
    const allowDisabled = options.allowDisabled === true;
    const target = NOTION_EFFORT_TARGETS[effortId];
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
      if (!notionElementLooksLikeEffortTarget(node, target)) {
        node = node.parentElement || null;
        continue;
      }
      const area = modelElementArea(node);
      if (rootArea > 0 && area >= rootArea * 0.85) break;
      const rect = modelRect(node);
      const tag = String(node.tagName || "").toLowerCase();
      const role = String(node.getAttribute?.("role") || "").toLowerCase();
      const tabIndex = String(node.getAttribute?.("tabindex") || "").trim();
      const roleRowLike = role === "menuitem" || role === "menuitemradio" || role === "option";
      const actionLike = roleRowLike || tag === "button" || role === "button" || (tabIndex && tabIndex !== "-1");
      const rowLike = rect && rootRect
        && rect.height >= 22
        && rect.height <= 88
        && rect.width >= Math.min(100, rootRect.width * 0.35)
        && rect.width <= rootRect.width + 32;
      if (roleRowLike && !bestRoleRow) bestRoleRow = node;
      if (actionLike && !bestAction) bestAction = node;
      if (rowLike) bestRowLike = node;
      node = node.parentElement || null;
    }
    return bestRoleRow || bestAction || bestRowLike || null;
  }

  function scoreNotionEffortItem(element, effortId, options = {}) {
    const allowDisabled = options.allowDisabled === true;
    const target = NOTION_EFFORT_TARGETS[effortId];
    if (!element || !target || !visible(element) || (!allowDisabled && isDisabledElement(element))) {
      return Number.NEGATIVE_INFINITY;
    }
    if (!notionElementLooksLikeEffortTarget(element, target)) return Number.NEGATIVE_INFINITY;
    let score = 880;
    const role = String(element.getAttribute?.("role") || "").toLowerCase();
    const tag = String(element.tagName || "").toLowerCase();
    const tabIndex = String(element.getAttribute?.("tabindex") || "").trim();
    if (role === "menuitem" || role === "menuitemradio" || role === "option") score += 900;
    if (tag === "button" || role === "button") score += 360;
    if (tabIndex && tabIndex !== "-1") score += 120;
    const rect = modelRect(element);
    if (rect && rect.height >= 24 && rect.height <= 72) score += 100;
    return score - Math.min(160, modelElementArea(element) / 6000);
  }

  function notionEffortItemRows(root, effortId, options = {}) {
    if (!root || !NOTION_EFFORT_TARGETS[effortId]) return [];
    const allowDisabled = options.allowDisabled === true;
    const target = NOTION_EFFORT_TARGETS[effortId];
    const seenRows = new Set();
    const rows = [];
    const add = (element) => {
      if (!element || !notionElementLooksLikeEffortTarget(element, target)) return;
      const row = notionEffortMenuItemRow(element, root, effortId, { allowDisabled });
      if (!row || seenRows.has(row) || !root.contains?.(row)) return;
      if (!allowDisabled && isDisabledElement(row)) return;
      if (!Number.isFinite(scoreNotionEffortItem(row, effortId, { allowDisabled }))) return;
      seenRows.add(row);
      rows.push(row);
    };
    for (const element of visibleSelectorElements(NOTION_EFFORT_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "button"], root)) add(element);
    rows.sort((a, b) => (
      scoreNotionEffortItem(b, effortId, { allowDisabled })
      - scoreNotionEffortItem(a, effortId, { allowDisabled })
    ));
    const semanticRows = rows.filter((row) => {
      const role = String(row.getAttribute?.("role") || "").toLowerCase();
      return role === "menuitem" || role === "menuitemradio" || role === "option";
    });
    return semanticRows.length > 0 ? semanticRows : rows;
  }

  function findNotionEffortItem(root, effortId) {
    const rows = notionEffortItemRows(root, effortId);
    return rows.length === 1 ? rows[0] : null;
  }

  async function closeNotionEffortMenu(context, trigger) {
    return dismissPreferredModelMenu(
      context,
      () => notionEffortMenuRoot(trigger),
      NOTION_EFFORT_MENU_CLOSE_WAIT_MS
    );
  }

  async function waitNotionEffortSettled(context, effortId, trigger) {
    const deadline = Date.now() + NOTION_EFFORT_SETTLE_WAIT_MS;
    let targetSamples = 0;
    while (Date.now() <= deadline) {
      assertPreferredModelRun(context);
      if (notionEffortIdFromElement(trigger || findNotionEffortControl()) === effortId) {
        targetSamples += 1;
        if (targetSamples >= 2) return true;
      } else {
        targetSamples = 0;
      }
      await preferredModelSleep(context, 100);
    }
    assertPreferredModelRun(context);
    return notionEffortIdFromElement(trigger || findNotionEffortControl()) === effortId;
  }

  async function applyNotionPreferredEffort(context, modelId, effortId) {
    if (!modelTargets[modelId] && !isModelPreferenceCustomId(modelId)) {
      return preferredModelResult(context, false, "NotionAI", modelId, "unknown model", { effortId });
    }
    if (!notionEffortTargetsForModel(modelId).includes(effortId)) {
      return preferredModelResult(context, false, "NotionAI", modelId, "unknown effort for model", { effortId });
    }
    const trigger = await waitForPreferredModel(context, findNotionEffortTrigger, 2500, 120);
    if (!trigger) {
      await closeNotionEffortMenu(context, null);
      return preferredModelResult(context, false, "NotionAI", modelId, "effort trigger not found", {
        effortId,
        retryable: true
      });
    }
    if (notionEffortIdFromElement(trigger) === effortId) {
      const menuClosed = await closeNotionEffortMenu(context, trigger);
      return preferredModelResult(context, true, "NotionAI", modelId, "", {
        effortId,
        skipped: true,
        menuClosed
      });
    }
    const root = await openNotionEffortMenu(context, trigger);
    if (!root) {
      await closeNotionEffortMenu(context, trigger);
      return preferredModelResult(context, false, "NotionAI", modelId, "effort menu not found", {
        effortId,
        retryable: true
      });
    }
    const item = findNotionEffortItem(root, effortId)
      || await waitForPreferredModel(
        context,
        () => findNotionEffortItem(notionEffortMenuRoot(trigger), effortId),
        NOTION_EFFORT_ITEM_READY_WAIT_MS,
        80
      );
    if (!item) {
      const menuClosed = await closeNotionEffortMenu(context, trigger);
      return preferredModelResult(context, false, "NotionAI", modelId, "target effort item not found", {
        effortId,
        retryable: menuClosed === true,
        retryableBeforeSelection: true,
        selectionActivated: false,
        menuClosed
      });
    }
    const clicked = preferredModelActivate(context, item);
    const settled = clicked ? await waitNotionEffortSettled(context, effortId, trigger) : false;
    const menuClosed = await closeNotionEffortMenu(context, trigger);
    if (!clicked) {
      return preferredModelResult(context, false, "NotionAI", modelId, "target effort item could not be clicked", {
        effortId,
        menuClosed
      });
    }
    return settled
      ? preferredModelResult(context, true, "NotionAI", modelId, "", { effortId, changed: true, menuClosed })
      : preferredModelResult(context, false, "NotionAI", modelId, "effort selection did not settle", {
          effortId,
          fallbackEligible: menuClosed === true,
          selectionActivated: true,
          selectionUnsettled: true,
          menuClosed
        });
  }

  return Object.freeze({
    applyNotionPreferredEffort,
    currentNotionEffortId: () => notionEffortIdFromElement(findNotionEffortControl({ allowDisabled: true })),
    isSupported: (modelId, effortId) => Boolean(
      (modelTargets[modelId] || isModelPreferenceCustomId(modelId))
      && notionEffortTargetsForModel(modelId).includes(effortId)
    )
  });
}
