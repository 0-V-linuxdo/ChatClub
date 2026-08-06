import { createPreferredNotionSourceIndicator } from "./preferred-notion-source-indicator.js";
export const NOTION_ALL_SOURCES_STATES = Object.freeze(["enabled", "disabled"]);
export function createPreferredNotionSourcesCapability(deps = {}) {
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
    closest,
    preferredModelResult,
    findNotionComposerRoot,
    isNotionControlNearMainComposer
  } = deps;
  const NOTION_SOURCES_DIRECT_TRIGGER_SELECTORS = Object.freeze([
    '[data-testid="unified-chat-mode-menu-button"]',
    '[data-testid="unified-chat-search-scope-button"]'
  ]);
  const NOTION_SOURCES_TRIGGER_SELECTORS = Object.freeze([
    ...NOTION_SOURCES_DIRECT_TRIGGER_SELECTORS,
    'button[aria-label="Settings" i]',
    '[role="button"][aria-label="Settings" i]',
    'button[title="Settings" i]',
    '[role="button"][title="Settings" i]',
    'button[aria-label="设置"]',
    '[role="button"][aria-label="设置"]',
    'button[title="设置"]',
    '[role="button"][title="设置"]'
  ]);
  const NOTION_SOURCES_MENU_ROOT_SELECTORS = Object.freeze([
    '[role="menu"]',
    '[role="listbox"]',
    '[role="dialog"]',
    '[data-radix-menu-content]',
    '[data-radix-popper-content-wrapper]',
    '[data-popper-placement]',
    '[data-floating-ui-focusable]',
    '[data-floating-ui-portal] [role="menu"]',
    '[data-floating-ui-portal] [role="listbox"]'
  ]);
  const NOTION_SOURCES_MENU_ITEM_SELECTORS = Object.freeze([
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="switch"]',
    "button",
    '[tabindex]:not([tabindex="-1"])'
  ]);
  const NOTION_SOURCES_TOGGLE_SELECTORS = Object.freeze([
    '[role="switch"]',
    '[role="checkbox"]',
    '[role="menuitemcheckbox"]',
    'input[type="checkbox"]',
    'button[aria-checked]',
    '[aria-checked]',
    'button[data-state="checked"]',
    'button[data-state="unchecked"]',
    '[data-state="checked"]',
    '[data-state="unchecked"]'
  ]);
  const NOTION_SOURCES_TRIGGER_WAIT_MS = 1700;
  const NOTION_SOURCES_HYDRATION_TRIGGER_WAIT_MS = 3000;
  const NOTION_SOURCES_MENU_OPEN_WAIT_MS = 3000;
  const NOTION_SOURCES_SUBMENU_WAIT_MS = 2300;
  const NOTION_SOURCES_SETTLE_WAIT_MS = 1000;
  const NOTION_SOURCES_MENU_CLOSE_WAIT_MS = 1500;
  const NOTION_SOURCES_STABLE_SAMPLES = 2;
  let notionSourcesOperationTail = Promise.resolve();
  const notionText = (value) => normalize(value).toLowerCase().replace(/\s+/g, " ");
  function activateNotionSourcesElement(context, element, options = {}) {
    const activate = options.pointer === false
      ? preferredModelActivate
      : typeof preferredModelPointerActivate === "function"
      ? preferredModelPointerActivate
      : preferredModelActivate;
    return activate(context, element);
  }
  function preferredModelTimeRemaining(context, requestedMs) {
    const requested = Math.max(0, Number(requestedMs) || 0);
    const deadlineAt = Math.max(0, Number(context?.deadlineAt) || 0);
    return deadlineAt > 0 ? Math.min(requested, Math.max(0, deadlineAt - Date.now())) : requested;
  }
  function waitForPreferredModelWithinDeadline(context, getter, timeoutMs, intervalMs) {
    const remaining = preferredModelTimeRemaining(context, timeoutMs);
    if (remaining <= 0) return Promise.resolve(null);
    return waitForPreferredModel(context, getter, remaining, intervalMs);
  }
  function notionTextLooksLikeMySourcesSeed(value) {
    const textValue = notionText(value);
    return Boolean(textValue && (
      textValue === "my sources" ||
      textValue.startsWith("my sources ") ||
      textValue.includes("我的来源") ||
      textValue.includes("我的资料源") ||
      textValue.includes("我的资源")
    ));
  }
  function notionTextContainsMySources(value) {
    const textValue = notionText(value);
    return Boolean(textValue && (
      textValue.includes("my sources") ||
      textValue.includes("我的来源") ||
      textValue.includes("我的资料源") ||
      textValue.includes("我的资源")
    ));
  }
  function notionTextLooksLikeAllSources(value) {
    const textValue = notionText(value);
    return Boolean(textValue && (
      textValue === "all sources" ||
      textValue === "all sources i can access" ||
      textValue.includes("all sources") ||
      textValue.includes("all sources i can access") ||
      textValue.includes("全部来源") ||
      textValue.includes("所有来源") ||
      textValue.includes("全部资料源") ||
      textValue.includes("所有资料源")
    ));
  }
  function notionTextLooksLikeWebAccess(value) {
    const textValue = notionText(value);
    return Boolean(textValue && (
      textValue.includes("web access") ||
      textValue.includes("internet access") ||
      textValue.includes("联网") ||
      textValue.includes("网络访问")
    ));
  }
  function notionSourcesDisclosureState(element) {
    if (!element) return null;
    const ariaExpanded = String(element.getAttribute?.("aria-expanded") || "").trim().toLowerCase();
    if (ariaExpanded === "true") return true;
    if (ariaExpanded === "false") return false;
    const dataState = String(element.getAttribute?.("data-state") || "").trim().toLowerCase();
    if (dataState === "open") return true;
    if (dataState === "closed") return false;
    return null;
  }

  function notionSourcesPopupIsOpen(root) {
    if (!root || root.isConnected === false || !visible(root)) return false;
    let node = root;
    while (node && node.nodeType === 1) {
      if (
        node.hidden === true
        || node.inert === true
        || node.hasAttribute?.("inert")
        || String(node.getAttribute?.("aria-hidden") || "").trim().toLowerCase() === "true"
        || String(node.getAttribute?.("data-state") || "").trim().toLowerCase() === "closed"
      ) return false;
      let style = null;
      try {
        const view = node.ownerDocument?.defaultView || globalThis;
        style = view?.getComputedStyle?.(node) || null;
      } catch {}
      if (
        style
        && (
          style.display === "none"
          || style.visibility === "hidden"
          || style.visibility === "collapse"
          || Number.parseFloat(style.opacity) === 0
        )
      ) return false;
      node = node.parentElement || null;
    }
    return true;
  }

  function scoreNotionSourcesMenuRoot(root) {
    if (!notionSourcesPopupIsOpen(root)) return -1;
    const textValue = modelElementText(root);
    const normalized = notionText(textValue);
    let score = 0;
    if (notionTextContainsMySources(textValue)) score += 180;
    if (notionTextLooksLikeAllSources(textValue)) score += 220;
    if (notionTextLooksLikeWebAccess(textValue)) score += 240;
    if (normalized.includes("add sources") || normalized.includes("添加来源") || normalized.includes("添加资料源")) score += 180;
    if (normalized.includes("personalize") || normalized.includes("个性化")) score += 60;
    if (normalized.includes("mode") || normalized.includes("模式")) score += 40;
    if (normalized.includes("default") && normalized.includes("ask") && normalized.includes("plan")) score += 220;
    if (normalized.includes("answers only") || normalized.includes("plans first") || normalized.includes("think deeper")) score += 100;
    return score >= 160 ? score : -1;
  }
  function innermostIndependentElements(elements) {
    const unique = [...new Set(elements.filter(Boolean))];
    return unique.filter((element) => !unique.some((other) => (
      other !== element && element.contains?.(other)
    )));
  }
  function notionSourcesMenuRoots() {
    const roots = visibleSelectorElements(NOTION_SOURCES_MENU_ROOT_SELECTORS)
      .map((element) => ({ element, score: scoreNotionSourcesMenuRoot(element), area: modelElementArea(element) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.area - b.area)
      .map((item) => item.element);
    return innermostIndependentElements(roots);
  }

  function findNotionSourcesTrigger() {
    const directCandidates = visibleSelectorElements(NOTION_SOURCES_DIRECT_TRIGGER_SELECTORS)
      .filter((element) => !isDisabledElement(element));
    const composerRoot = findNotionComposerRoot();
    const composerRect = modelRect(composerRoot);
    const rank = (pool) => pool.map((element) => {
      const testId = String(element.getAttribute?.("data-testid") || "").toLowerCase();
      const label = notionText(element.getAttribute?.("aria-label") || "");
      const title = notionText(element.getAttribute?.("title") || "");
      const rect = modelRect(element);
      let score = 0;
      if (testId === "unified-chat-mode-menu-button") score += 500;
      if (testId === "unified-chat-search-scope-button") score += 400;
      if (label === "settings" || label === "设置") score += 300;
      if (title === "settings" || title === "设置") score += 240;
      if (String(element.getAttribute?.("aria-haspopup") || "").toLowerCase() === "dialog") score += 80;
      return { element, score, bottom: Number(rect?.bottom || 0) };
    }).sort((a, b) => b.score - a.score || b.bottom - a.bottom);
    if (directCandidates.length) {
      const scoped = directCandidates.filter((element) => (
        isNotionControlNearMainComposer(element, composerRoot, composerRect)
      ));
      if (!composerRoot || !composerRect || !scoped.length) return null;
      const ranked = rank(scoped);
      if (ranked[0] && (!ranked[1] || ranked[0].score > ranked[1].score)) return ranked[0].element;
      return null;
    }
    if (!composerRoot || !composerRect) return null;
    const scopedFallbacks = visibleSelectorElements(NOTION_SOURCES_TRIGGER_SELECTORS)
      .filter((element) => !isDisabledElement(element))
      .filter((element) => isNotionControlNearMainComposer(element, composerRoot, composerRect));
    const ranked = rank(scopedFallbacks);
    return ranked[0] && ranked[0].score > 0 && (!ranked[1] || ranked[0].score > ranked[1].score)
      ? ranked[0].element
      : null;
  }
  const notionMainSourceIndicator = createPreferredNotionSourceIndicator({ notionText, visibleSelectorElements, modelRect,
    findNotionComposerRoot, isNotionControlNearMainComposer, findNotionSourcesTrigger, waitForPreferredModelWithinDeadline, assertPreferredModelRun });
  function notionRawRect(element) {
    try {
      const rect = element?.getBoundingClientRect?.();
      if (!rect) return null;
      return {
        top: Number(rect.top || 0),
        right: Number(rect.right || 0),
        bottom: Number(rect.bottom || 0),
        left: Number(rect.left || 0),
        width: Math.max(0, Number(rect.width || 0)),
        height: Math.max(0, Number(rect.height || 0))
      };
    } catch {
      return null;
    }
  }

  function notionRawSelectorElements(selectors, root) {
    if (!root?.querySelectorAll) return [];
    const out = [];
    const seen = new Set();
    for (const selector of Array.isArray(selectors) ? selectors : [selectors]) {
      try {
        for (const element of root.querySelectorAll(selector)) {
          if (!seen.has(element)) {
            seen.add(element);
            out.push(element);
          }
        }
      } catch {}
    }
    return out;
  }

  function notionIsSemanticToggle(element) {
    if (!element) return false;
    const role = String(element.getAttribute?.("role") || "").toLowerCase();
    const tag = String(element.tagName || "").toLowerCase();
    const type = String(element.type || element.getAttribute?.("type") || "").toLowerCase();
    return ["switch", "checkbox", "menuitemcheckbox"].includes(role)
      || (tag === "input" && type === "checkbox")
      || element.hasAttribute?.("aria-checked")
      || ["checked", "unchecked"].includes(String(element.getAttribute?.("data-state") || "").toLowerCase());
  }

  function notionToggleIsLaidOut(element) {
    if (!notionIsSemanticToggle(element) || isDisabledElement(element)) return false;
    const rect = notionRawRect(element);
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    let style = null;
    try {
      const view = element.ownerDocument?.defaultView || globalThis;
      style = view?.getComputedStyle?.(element) || null;
    } catch {}
    if (!style) return true;
    return style.display !== "none"
      && style.visibility !== "hidden"
      && style.visibility !== "collapse";
  }

  function notionElementAcceptsPointerInput(element) {
    if (!element) return false;
    let style = null;
    try {
      const view = element.ownerDocument?.defaultView || globalThis;
      style = view?.getComputedStyle?.(element) || null;
    } catch {}
    return !style || style.pointerEvents !== "none";
  }

  function notionToggleIsEligible(element) {
    if (!notionIsSemanticToggle(element) || isDisabledElement(element)) return false;
    if (visible(element)) return true;
    const tag = String(element.tagName || "").toLowerCase();
    const role = String(element.getAttribute?.("role") || "").toLowerCase();
    const type = String(element.type || element.getAttribute?.("type") || "").toLowerCase();
    return tag === "input"
      && (type === "checkbox" || ["switch", "checkbox"].includes(role))
      && notionToggleIsLaidOut(element);
  }

  function notionRectsShareVisualRow(first, second) {
    const firstRect = notionRawRect(first);
    const secondRect = notionRawRect(second);
    if (!firstRect || !secondRect) return false;
    const verticalOverlap = Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top);
    return verticalOverlap >= Math.min(8, Math.min(firstRect.height, secondRect.height) * 0.35);
  }

  function notionSourcesCandidateRow(element, root, predicate) {
    if (!element || !root || typeof predicate !== "function") return null;
    const rootArea = modelElementArea(root);
    const rootRect = modelRect(root);
    let bestToggleOwner = null;
    let bestAction = null;
    let bestRowLike = null;
    let fallback = null;
    let node = element;
    while (node && node.nodeType === 1 && node !== root && root.contains?.(node)) {
      if (!visible(node) || isDisabledElement(node) || !predicate(modelElementText(node))) {
        node = node.parentElement || null;
        continue;
      }
      const area = modelElementArea(node);
      if (rootArea > 0 && area >= rootArea * 0.85) break;
      const role = String(node.getAttribute?.("role") || "").toLowerCase();
      const tag = String(node.tagName || "").toLowerCase();
      const tabIndex = String(node.getAttribute?.("tabindex") || "").trim();
      const actionLike = ["menuitem", "menuitemcheckbox", "switch", "checkbox", "button"].includes(role)
        || tag === "button"
        || (tabIndex && tabIndex !== "-1");
      const rect = modelRect(node);
      const rowLike = rect && rootRect
        && rect.height >= 22
        && rect.height <= 96
        && rect.width >= Math.min(140, rootRect.width * 0.4)
        && rect.width <= rootRect.width + 32;
      const toggle = findNotionAllSourcesToggle(node, element);
      const sameVisualRow = toggle.target && notionRectsShareVisualRow(toggle.target, element);
      if (
        !bestToggleOwner
        && (actionLike || rowLike)
        && (toggle.ambiguous || sameVisualRow)
      ) bestToggleOwner = node;
      if (actionLike && !bestAction) bestAction = node;
      if (rowLike && !bestRowLike) bestRowLike = node;
      if (!fallback) fallback = node;
      node = node.parentElement || null;
    }
    return bestToggleOwner || bestAction || bestRowLike || fallback;
  }

  function findNotionSourcesRows(root, seedPredicate, ancestorPredicate = seedPredicate) {
    if (!root || typeof seedPredicate !== "function" || typeof ancestorPredicate !== "function") return [];
    const rows = new Set();
    const add = (element) => {
      if (!element || !seedPredicate(modelElementText(element))) return;
      const row = notionSourcesCandidateRow(element, root, ancestorPredicate);
      if (row && root.contains?.(row)) rows.add(row);
    };
    for (const element of visibleSelectorElements(NOTION_SOURCES_MENU_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "button", "label"], root)) add(element);
    return [...rows].sort((a, b) => modelElementArea(a) - modelElementArea(b));
  }

  function singleNotionSourcesRow(root, seedPredicate, ancestorPredicate = seedPredicate) {
    const rows = innermostIndependentElements(findNotionSourcesRows(root, seedPredicate, ancestorPredicate));
    return { row: rows.length === 1 ? rows[0] : null, ambiguous: rows.length > 1 };
  }

  function findNotionSourcesMenuRoot(trigger = null, options = {}) {
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (controlsId) {
      const controlled = document.getElementById?.(controlsId) || null;
      if (scoreNotionSourcesMenuRoot(controlled) > 0) return controlled;
    }
    if (options.exactOnly === true) return null;
    const excluded = options.excludeRoots instanceof Set ? options.excludeRoots : null;
    const roots = notionSourcesMenuRoots().filter((root) => !excluded?.has(root));
    return roots.length === 1 ? roots[0] : null;
  }

  function notionAllSourcesBindingBelongsToSettingsRoot(binding, root, lease) {
    const overlay = binding?.overlay || null;
    if (
      !overlay
      || !binding?.row
      || binding?.ambiguous
      || lease?.baselineAllSources?.has(overlay)
      || lease?.settingsRootsBeforeActivation?.has(overlay)
    ) return false;
    return overlay === root || root?.contains?.(overlay) || overlay.contains?.(root);
  }

  function bindDirectNotionAllSources(lease, binding) {
    lease.directAllSources = true;
    lease.allSourcesOverlay = binding.overlay || null;
    lease.allSourcesRow = binding.row || null;
    lease.allSourcesTarget = binding.target || null;
    return binding;
  }

  function findOpenNotionAllSourcesBinding() {
    const overlays = notionSourcesMenuRoots()
      .filter((root) => notionTextLooksLikeAllSources(modelElementText(root)));
    if (overlays.length !== 1) {
      return { overlay: null, row: null, target: null, state: null, ambiguous: overlays.length > 1 };
    }
    const overlay = overlays[0];
    const rowResult = singleNotionSourcesRow(overlay, notionTextLooksLikeAllSources);
    if (!rowResult.row) {
      return { overlay, row: null, target: null, state: null, ambiguous: rowResult.ambiguous };
    }
    const toggleResult = findNotionAllSourcesToggle(rowResult.row);
    if (!toggleResult.target) {
      return {
        overlay,
        row: rowResult.row,
        target: null,
        state: null,
        ambiguous: toggleResult.ambiguous
      };
    }
    return {
      overlay,
      row: rowResult.row,
      target: toggleResult.target,
      state: notionToggleState(toggleResult.target),
      ambiguous: false
    };
  }

  function notionToggleState(element) {
    if (!element) return null;
    const candidates = [...new Set([element, ...visibleSelectorElements([
      'input[type="checkbox"]',
      "[aria-checked]",
      "[data-state]"
    ], element), ...notionRawSelectorElements([
      'input[type="checkbox"]',
      '[role="switch"]',
      '[role="checkbox"]',
      "[aria-checked]",
      "[data-state]"
    ], element)])];
    for (const candidate of candidates) {
      const tag = String(candidate?.tagName || "").toLowerCase();
      const type = String(candidate?.type || candidate?.getAttribute?.("type") || "").toLowerCase();
      const role = String(candidate?.getAttribute?.("role") || "").toLowerCase();
      if (
        tag === "input"
        && (type === "checkbox" || ["switch", "checkbox"].includes(role))
        && typeof candidate.checked === "boolean"
      ) return candidate.checked;
      const ariaChecked = String(candidate?.getAttribute?.("aria-checked") || "").trim().toLowerCase();
      if (ariaChecked === "true") return true;
      if (ariaChecked === "false") return false;
      const dataState = String(candidate?.getAttribute?.("data-state") || "").trim().toLowerCase();
      if (["checked", "on", "open"].includes(dataState)) return true;
      if (["unchecked", "off", "closed"].includes(dataState)) return false;
    }
    return null;
  }

  function notionAllSourcesLabelAnchor(row) {
    if (!row) return null;
    const candidates = [row, ...visibleSelectorElements(["div", "span", "label", "button"], row)]
      .filter((element) => notionTextLooksLikeAllSources(modelElementText(element)))
      .filter((element) => {
        const rect = notionRawRect(element);
        return visible(element) && rect && rect.height > 0 && rect.height <= 56;
      });
    const innermost = innermostIndependentElements(candidates);
    return innermost.length === 1 ? innermost[0] : null;
  }

  function notionToggleActivationTarget(target, row) {
    if (!target || !row) return null;
    if (
      visible(target)
      && !isDisabledElement(target)
      && notionElementAcceptsPointerInput(target)
    ) return target;
    const targetRect = notionRawRect(target);
    if (!targetRect) return null;
    const proxies = [];
    let node = target.parentElement || null;
    while (node && node.nodeType === 1 && node !== row && row.contains?.(node)) {
      const nodeRect = notionRawRect(node);
      const widthLimit = Math.max(targetRect.width + 8, targetRect.width * 1.75);
      const heightLimit = Math.max(targetRect.height + 8, targetRect.height * 1.75);
      const centerDeltaX = nodeRect
        ? Math.abs((nodeRect.left + nodeRect.width / 2) - (targetRect.left + targetRect.width / 2))
        : Number.MAX_SAFE_INTEGER;
      const centerDeltaY = nodeRect
        ? Math.abs((nodeRect.top + nodeRect.height / 2) - (targetRect.top + targetRect.height / 2))
        : Number.MAX_SAFE_INTEGER;
      if (
        visible(node)
        && !isDisabledElement(node)
        && notionElementAcceptsPointerInput(node)
        && nodeRect
        && notionRectsShareVisualRow(node, target)
        && nodeRect.width <= widthLimit
        && nodeRect.height <= heightLimit
        && centerDeltaX <= Math.max(4, targetRect.width * 0.25)
        && centerDeltaY <= Math.max(4, targetRect.height * 0.25)
      ) proxies.push(node);
      node = node.parentElement || null;
    }
    const innermost = innermostIndependentElements(proxies);
    return innermost.length === 1 ? innermost[0] : null;
  }

  function findNotionAllSourcesToggle(row, labelAnchor = null) {
    if (!row) return { target: null, ambiguous: false };
    const candidates = [];
    const role = String(row.getAttribute?.("role") || "").toLowerCase();
    const tag = String(row.tagName || "").toLowerCase();
    const type = String(row.type || row.getAttribute?.("type") || "").toLowerCase();
    if (["switch", "checkbox", "menuitemcheckbox"].includes(role) || (tag === "input" && type === "checkbox")) {
      candidates.push(row);
    }
    candidates.push(...visibleSelectorElements(NOTION_SOURCES_TOGGLE_SELECTORS, row));
    candidates.push(...notionRawSelectorElements(NOTION_SOURCES_TOGGLE_SELECTORS, row));
    const anchor = labelAnchor || notionAllSourcesLabelAnchor(row);
    const unique = [...new Set(candidates)]
      .filter((element) => notionToggleIsEligible(element))
      .filter((element) => anchor && notionRectsShareVisualRow(element, anchor));
    const leaves = unique.filter((element) => !unique.some((other) => (
      other !== element && element.contains?.(other)
    )));
    const target = leaves.length === 1 ? leaves[0] : null;
    return {
      target,
      activationTarget: target ? notionToggleActivationTarget(target, row) : null,
      anchor,
      ambiguous: leaves.length > 1
    };
  }

  function notionSourcesOverlayMatches(expected, current) {
    return Boolean(expected && current && expected === current);
  }

  function createNotionSourcesLease() {
    const baselineRoots = new Set(notionSourcesMenuRoots());
    return {
      baselineRoots,
      baselineAllSources: new Set(
        [...baselineRoots].filter((root) => notionTextLooksLikeAllSources(modelElementText(root)))
      ),
      trigger: null,
      settingsRoot: null,
      settingsRootsBeforeActivation: null,
      settingsActivated: false,
      mySourcesRoot: null,
      mySourcesRow: null,
      mySourcesTarget: null,
      submenuActivated: false,
      directAllSources: false,
      allSourcesRootsBeforeActivation: null,
      allSourcesOverlay: null,
      allSourcesRow: null,
      allSourcesTarget: null,
      unownedMenuDetected: false,
      cleanupEscapedRoots: new Set(),
      cleanupTriggerRootsWithOverlay: new Set(),
      cleanupTriggerSettingsRoots: new Set()
    };
  }

  function connectedVisibleNotionSourcesRoot(root) {
    const currentRoots = notionSourcesMenuRoots();
    return Boolean(
      root
      && root.isConnected !== false
      && notionSourcesPopupIsOpen(root)
      && scoreNotionSourcesMenuRoot(root) > 0
      && currentRoots.some((candidate) => candidate === root || root.contains?.(candidate))
    );
  }

  function resetNotionSourcesCleanupAttempts(lease) {
    lease.cleanupEscapedRoots = new Set();
    lease.cleanupTriggerRootsWithOverlay = new Set();
    lease.cleanupTriggerSettingsRoots = new Set();
  }

  function exactBoundNotionSettingsRoot(lease) {
    const trigger = lease?.trigger || null;
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    const root = controlsId ? document.getElementById?.(controlsId) || null : null;
    return connectedVisibleNotionSourcesRoot(root)
      && !lease?.baselineRoots?.has(root)
      && !lease?.settingsRootsBeforeActivation?.has(root)
      ? root
      : null;
  }

  function resolveOwnedNotionSettingsRoot(lease) {
    if (lease?.settingsRoot) {
      if (connectedVisibleNotionSourcesRoot(lease.settingsRoot)) return lease.settingsRoot;
      const replacement = exactBoundNotionSettingsRoot(lease);
      if (replacement) lease.settingsRoot = replacement;
      return replacement;
    }
    if (!lease?.settingsActivated || !lease.trigger) return null;
    const exact = exactBoundNotionSettingsRoot(lease);
    if (exact) {
      lease.settingsRoot = exact;
      return exact;
    }
    const roots = notionSourcesMenuRoots().filter((root) => (
      !lease.baselineRoots.has(root)
      && !lease.settingsRootsBeforeActivation?.has(root)
    ));
    if (roots.length === 1) lease.settingsRoot = roots[0];
    return roots.length === 1 ? roots[0] : null;
  }

  function exactBoundNotionAllSourcesOverlay(lease) {
    const controlsId = String(
      (lease?.directAllSources
        ? lease?.trigger?.getAttribute?.("aria-controls")
        : lease?.mySourcesTarget?.getAttribute?.("aria-controls"))
      || lease?.mySourcesRow?.getAttribute?.("aria-controls")
      || ""
    ).trim();
    const root = controlsId ? document.getElementById?.(controlsId) || null : null;
    return connectedVisibleNotionSourcesRoot(root)
      && !lease?.baselineAllSources?.has(root)
      && !lease?.allSourcesRootsBeforeActivation?.has(root)
      && notionTextLooksLikeAllSources(modelElementText(root))
      ? root
      : null;
  }

  function resolveOwnedNotionAllSourcesOverlay(lease) {
    if (lease?.allSourcesOverlay) {
      if (
        connectedVisibleNotionSourcesRoot(lease.allSourcesOverlay)
        && !lease.baselineAllSources.has(lease.allSourcesOverlay)
      ) return lease.allSourcesOverlay;
      const replacement = exactBoundNotionAllSourcesOverlay(lease);
      if (replacement) lease.allSourcesOverlay = replacement;
      return replacement;
    }
    if (!lease?.submenuActivated || !lease.mySourcesRoot) return null;
    const exact = exactBoundNotionAllSourcesOverlay(lease);
    if (exact) {
      lease.allSourcesOverlay = exact;
      return exact;
    }
    const overlays = notionSourcesMenuRoots().filter((root) => (
      notionTextLooksLikeAllSources(modelElementText(root))
      && !lease.baselineAllSources.has(root)
      && !lease.allSourcesRootsBeforeActivation?.has(root)
    ));
    if (overlays.length === 1) lease.allSourcesOverlay = overlays[0];
    return overlays.length === 1 ? overlays[0] : null;
  }

  function observeNotionAllSourcesState(binding, options = {}) {
    const allowBindingReplacement = options.allowBindingReplacement === true;
    const overlays = notionSourcesMenuRoots()
      .filter((root) => notionTextLooksLikeAllSources(modelElementText(root)));
    if (overlays.length > 1) return { state: null, reason: "all sources overlay is ambiguous" };
    const overlay = overlays[0] || null;
    if (!overlay) return { state: null, reason: "all sources row not found" };
    if (binding?.overlay && !notionSourcesOverlayMatches(binding.overlay, overlay)) {
      return { state: null, reason: "all sources overlay changed" };
    }
    const rowResult = singleNotionSourcesRow(overlay, notionTextLooksLikeAllSources);
    if (rowResult.ambiguous) return { state: null, reason: "all sources row is ambiguous" };
    if (!rowResult.row) return { state: null, reason: "all sources row not found" };
    if (binding?.row && binding.row !== rowResult.row && !allowBindingReplacement) {
      return { state: null, reason: "all sources row changed" };
    }
    const toggleResult = findNotionAllSourcesToggle(rowResult.row);
    if (toggleResult.ambiguous) return { state: null, reason: "all sources toggle is ambiguous", row: rowResult.row };
    if (!toggleResult.target) return { state: null, reason: "all sources toggle not found", row: rowResult.row };
    if (binding?.target && binding.target !== toggleResult.target && !allowBindingReplacement) {
      return { state: null, reason: "all sources toggle changed", row: rowResult.row };
    }
    if (binding?.anchor && binding.anchor !== toggleResult.anchor && !allowBindingReplacement) {
      return { state: null, reason: "all sources label changed", row: rowResult.row };
    }
    const state = notionToggleState(toggleResult.target);
    const currentOverlays = notionSourcesMenuRoots()
      .filter((root) => notionTextLooksLikeAllSources(modelElementText(root)));
    const currentOverlay = currentOverlays.length === 1 ? currentOverlays[0] : null;
    if (
      !notionSourcesOverlayMatches(overlay, currentOverlay)
      || !notionToggleIsEligible(toggleResult.target)
      || !(currentOverlay === toggleResult.target || currentOverlay?.contains?.(toggleResult.target))
    ) {
      return { state: null, reason: "all sources overlay changed" };
    }
    return {
      state,
      reason: state === null ? "all sources toggle state is unreadable" : "",
      overlay,
      row: rowResult.row,
      target: toggleResult.target,
      activationTarget: toggleResult.activationTarget,
      anchor: toggleResult.anchor,
      rebound: allowBindingReplacement && Boolean(
        binding?.row !== rowResult.row
        || binding?.target !== toggleResult.target
        || binding?.anchor !== toggleResult.anchor
      )
    };
  }
  async function waitNotionAllSourcesStable(context, desiredState, binding, timeoutMs = NOTION_SOURCES_SETTLE_WAIT_MS, options = {}) {
    let samples = 0;
    let currentBinding = binding;
    return await waitForPreferredModelWithinDeadline(context, () => {
      const observation = observeNotionAllSourcesState(currentBinding, options);
      if (observation.state !== desiredState) { samples = 0; return null; }
      if (options.allowBindingReplacement && observation.rebound) currentBinding = { ...currentBinding, ...observation };
      if (++samples < NOTION_SOURCES_STABLE_SAMPLES) return null;
      return true;
    }, timeoutMs, 120);
  }
  async function openNotionSourcesMenu(context, trigger, lease) {
    const existing = findNotionSourcesMenuRoot(trigger, { exactOnly: true });
    lease.trigger = trigger;
    if (existing) { lease.unownedMenuDetected = true; return null; }
    const rootsBeforeActivation = new Set(notionSourcesMenuRoots());
    lease.settingsRootsBeforeActivation = rootsBeforeActivation;
    if (notionSourcesDisclosureState(trigger) === true || rootsBeforeActivation.size > 0) {
      lease.unownedMenuDetected = true; return null;
    }
    resetNotionSourcesCleanupAttempts(lease);
    if (!trigger || !activateNotionSourcesElement(context, trigger)) return null;
    lease.settingsActivated = true;
    const root = await waitForPreferredModelWithinDeadline(
      context,
      () => {
        const exact = findNotionSourcesMenuRoot(trigger, { exactOnly: true });
        if (exact && !rootsBeforeActivation.has(exact)) return exact;
        return findNotionSourcesMenuRoot(trigger, { excludeRoots: rootsBeforeActivation });
      },
      NOTION_SOURCES_MENU_OPEN_WAIT_MS,
      120
    );
    if (root && !rootsBeforeActivation.has(root) && !lease.baselineRoots.has(root)) {
      lease.settingsRoot = root;
    }
    return root;
  }

  function notionMySourcesActivationTargets(row, root) {
    const rect = modelRect(row);
    const targets = [];
    const seen = new Set();
    const add = (target) => {
      if (
        !target
        || seen.has(target)
        || !visible(target)
        || isDisabledElement(target)
        || (target !== row && !row.contains?.(target))
        || (root && target !== root && !root.contains?.(target))
      ) return;
      seen.add(target);
      targets.push(target);
    };
    if (rect && rect.width > 0 && rect.height > 0) {
      for (const ratio of [0.18, 0.52, 0.88]) {
        let pointElement = null;
        try {
          pointElement = document.elementFromPoint?.(
            rect.left + rect.width * ratio,
            rect.top + rect.height * 0.5
          ) || null;
        } catch {}
        add(closest(pointElement, "button, [role='button'], [role='menuitem'], [tabindex]:not([tabindex='-1'])"));
        add(pointElement);
      }
    }
    add(closest(row, "button, [role='button'], [role='menuitem'], [tabindex]:not([tabindex='-1'])"));
    add(row);
    return targets;
  }

  async function activateNotionMySourcesRow(context, row, root, lease) {
    const deadlineAt = Math.min(
      Math.max(0, Number(context?.deadlineAt) || Number.MAX_SAFE_INTEGER),
      Date.now() + NOTION_SOURCES_SUBMENU_WAIT_MS
    );
    const overlaysBeforeActivation = new Set(
      notionSourcesMenuRoots().filter((candidate) => notionTextLooksLikeAllSources(modelElementText(candidate)))
    );
    lease.mySourcesRoot = root;
    lease.mySourcesRow = row;
    lease.allSourcesRootsBeforeActivation = overlaysBeforeActivation;
    const ownedBinding = () => {
      const current = findOpenNotionAllSourcesBinding();
      if (current.overlay && overlaysBeforeActivation.has(current.overlay)) return null;
      return current.row || current.ambiguous ? current : null;
    };
    const target = notionMySourcesActivationTargets(row, root)[0] || null;
    if (!target || !activateNotionSourcesElement(context, target)) return null;
    lease.mySourcesTarget = target;
    lease.submenuActivated = true;
    const result = await waitForPreferredModelWithinDeadline(
      context,
      ownedBinding,
      Math.max(0, deadlineAt - Date.now()),
      120
    );
    if (result) {
      lease.allSourcesOverlay = result.overlay || null;
      lease.allSourcesRow = result.row || null;
      lease.allSourcesTarget = result.target || null;
    }
    return result;
  }

  async function ensureNotionAllSourcesRow(context, lease, triggerWaitMs = NOTION_SOURCES_TRIGGER_WAIT_MS) {
    const trigger = await waitForPreferredModelWithinDeadline(
      context,
      findNotionSourcesTrigger,
      triggerWaitMs,
      120
    );
    if (!trigger) {
      return {
        row: null,
        ambiguous: false,
        reason: "sources trigger not found",
        trigger: null,
        menusOwned: false
      };
    }
    const preexisting = findOpenNotionAllSourcesBinding();
    if (preexisting.overlay || preexisting.ambiguous) {
      return {
        row: null,
        ambiguous: preexisting.ambiguous,
        reason: "unowned all sources overlay is open",
        trigger,
        menusOwned: false
      };
    }
    const root = await openNotionSourcesMenu(context, trigger, lease);
    if (!root) return { row: null, ambiguous: false,
      reason: lease.unownedMenuDetected ? "unowned sources menu is open" : "sources menu not found",
      trigger, menusOwned: false };
    const directAllSources = findOpenNotionAllSourcesBinding();
    if (notionAllSourcesBindingBelongsToSettingsRoot(directAllSources, root, lease)) {
      return { ...bindDirectNotionAllSources(lease, directAllSources), trigger, menusOwned: true };
    }
    if (directAllSources.ambiguous) {
      return { row: null, ambiguous: true, reason: "all sources overlay is ambiguous", trigger, menusOwned: true };
    }
    const mySources = singleNotionSourcesRow(root, notionTextLooksLikeMySourcesSeed, notionTextContainsMySources);
    if (mySources.ambiguous) return { row: null, ambiguous: true, reason: "my sources row is ambiguous", trigger, menusOwned: true };
    if (!mySources.row) return { row: null, ambiguous: false, reason: "my sources row not found", trigger, menusOwned: true };
    const result = await activateNotionMySourcesRow(context, mySources.row, root, lease);
    return result
      ? { ...result, trigger, menusOwned: true }
      : { row: null, ambiguous: false, reason: "my sources row could not be opened", trigger, menusOwned: true };
  }

  function dispatchNotionSourcesEscapeEvent(target) {
    const KeyboardEventCtor = modelEventConstructor?.("KeyboardEvent", target) || null;
    if (!target || typeof KeyboardEventCtor !== "function") return false;
    const options = {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
      composed: true
    };
    let dispatched = false;
    for (const type of ["keydown", "keyup"]) {
      try {
        target.dispatchEvent?.(new KeyboardEventCtor(type, options));
        dispatched = true;
      } catch {}
    }
    return dispatched;
  }

  function dispatchNotionSourcesEscape(root) {
    if (!root || !connectedVisibleNotionSourcesRoot(root)) return false;
    return dispatchNotionSourcesEscapeEvent(notionSourcesEscapeTarget(root));
  }

  function notionSourcesCleanupSleep(ms) {
    return new Promise((resolve) => { setTimeout(resolve, Math.max(0, Number(ms) || 0)); });
  }

  async function waitOwnedNotionSourcesRootClosed(root, deadlineAt, intervalMs) {
    while (Date.now() < deadlineAt) {
      if (!connectedVisibleNotionSourcesRoot(root)) return true;
      await notionSourcesCleanupSleep(Math.min(
        Math.max(20, Number(intervalMs) || 20),
        Math.max(0, deadlineAt - Date.now())
      ));
    }
    return !connectedVisibleNotionSourcesRoot(root);
  }

  function notionSourcesEscapeTarget(root) {
    const activeElement = document.activeElement || null;
    return activeElement && (root === activeElement || root.contains?.(activeElement)) ? activeElement : root;
  }

  function clickOwnedNotionSourcesTrigger(lease, root) {
    const trigger = lease?.trigger || null;
    if (
      !trigger
      || lease?.settingsActivated !== true
      || lease?.settingsRoot !== root
      || !visible(trigger)
      || isDisabledElement(trigger)
      || !connectedVisibleNotionSourcesRoot(root)
      || lease.baselineRoots.has(root)
      || lease.settingsRootsBeforeActivation?.has(root)
      || scoreNotionSourcesMenuRoot(root) <= 0
      || root === trigger
      || root.contains?.(trigger)
      || notionSourcesDisclosureState(trigger) === false
      || typeof trigger.click !== "function"
    ) return false;
    try {
      trigger.click();
      return true;
    } catch {
      return false;
    }
  }

  function notionSourcesLeaseIsClosed(lease) {
    if (resolveOwnedNotionAllSourcesOverlay(lease) || resolveOwnedNotionSettingsRoot(lease)) return false;
    const roots = notionSourcesMenuRoots();
    if (lease?.submenuActivated && roots.some((root) => (
      notionTextLooksLikeAllSources(modelElementText(root))
      && !lease.baselineAllSources.has(root)
      && !lease.allSourcesRootsBeforeActivation?.has(root)
    ))) return false;
    if (lease?.settingsActivated && roots.some((root) => (
      !lease.baselineRoots.has(root)
      && !lease.settingsRootsBeforeActivation?.has(root)
    ))) return false;
    return true;
  }

  async function closeNotionSourcesMenus(context, lease, options = {}) {
    const contextRemaining = preferredModelTimeRemaining(context, NOTION_SOURCES_MENU_CLOSE_WAIT_MS);
    const cleanupBudget = options.forceCleanup === true || context?.signal?.aborted
      ? NOTION_SOURCES_MENU_CLOSE_WAIT_MS
      : contextRemaining;
    const deadlineAt = Date.now() + Math.max(0, cleanupBudget);
    const escapedRoots = lease.cleanupEscapedRoots || (lease.cleanupEscapedRoots = new Set());
    const triggerFallbackRootsWithOverlay = lease.cleanupTriggerRootsWithOverlay
      || (lease.cleanupTriggerRootsWithOverlay = new Set());
    const triggerFallbackSettingsOnlyRoots = lease.cleanupTriggerSettingsRoots
      || (lease.cleanupTriggerSettingsRoots = new Set());
    while (Date.now() < deadlineAt) {
      const overlay = resolveOwnedNotionAllSourcesOverlay(lease);
      if (overlay) {
        const settingsRoot = resolveOwnedNotionSettingsRoot(lease);
        const unexpectedOverlay = notionSourcesMenuRoots().some((root) => (
          notionTextLooksLikeAllSources(modelElementText(root))
          && root !== overlay
          && !lease.baselineAllSources.has(root)
          && !lease.allSourcesRootsBeforeActivation?.has(root)
        ));
        if (
          settingsRoot
          && !unexpectedOverlay
          && !triggerFallbackRootsWithOverlay.has(settingsRoot)
          && clickOwnedNotionSourcesTrigger(lease, settingsRoot)
        ) {
          triggerFallbackRootsWithOverlay.add(settingsRoot);
          await waitOwnedNotionSourcesRootClosed(
            overlay,
            Math.min(deadlineAt, Date.now() + 320),
            40
          );
          if (!connectedVisibleNotionSourcesRoot(overlay)) continue;
        }

        if (!escapedRoots.has(overlay)) {
          escapedRoots.add(overlay);
          dispatchNotionSourcesEscape(overlay);
          await waitOwnedNotionSourcesRootClosed(
            overlay,
            Math.min(deadlineAt, Date.now() + 360),
            40
          );
          if (!connectedVisibleNotionSourcesRoot(overlay)) continue;
        }
        await waitOwnedNotionSourcesRootClosed(
          overlay,
          Math.min(deadlineAt, Date.now() + 60),
          40
        );
        continue;
      }

      const settingsRoot = resolveOwnedNotionSettingsRoot(lease);
      if (settingsRoot) {
        const unexpectedOverlay = notionSourcesMenuRoots().some((root) => (
          notionTextLooksLikeAllSources(modelElementText(root))
          && !lease.baselineAllSources.has(root)
          && !lease.allSourcesRootsBeforeActivation?.has(root)
        ));
        if (
          !unexpectedOverlay
          && !triggerFallbackSettingsOnlyRoots.has(settingsRoot)
          && clickOwnedNotionSourcesTrigger(lease, settingsRoot)
        ) {
          triggerFallbackSettingsOnlyRoots.add(settingsRoot);
          await waitOwnedNotionSourcesRootClosed(
            settingsRoot,
            Math.min(deadlineAt, Date.now() + 320),
            40
          );
          if (!connectedVisibleNotionSourcesRoot(settingsRoot)) continue;
        }

        if (!escapedRoots.has(settingsRoot)) {
          escapedRoots.add(settingsRoot);
          dispatchNotionSourcesEscape(settingsRoot);
          await waitOwnedNotionSourcesRootClosed(
            settingsRoot,
            Math.min(deadlineAt, Date.now() + 360),
            40
          );
          if (!connectedVisibleNotionSourcesRoot(settingsRoot)) continue;
        }
        await waitOwnedNotionSourcesRootClosed(settingsRoot, deadlineAt, 60);
        if (connectedVisibleNotionSourcesRoot(settingsRoot)) break;
        continue;
      }

      if (notionSourcesLeaseIsClosed(lease)) return true;
      await notionSourcesCleanupSleep(Math.min(40, Math.max(0, deadlineAt - Date.now())));
    }
    return notionSourcesLeaseIsClosed(lease);
  }

  const closeNotionSourcesMenusForResult = (context, lease) => closeNotionSourcesMenus(context, lease, { forceCleanup: true });

  const preflightNotionAllSourcesTrigger = (context) => waitForPreferredModelWithinDeadline(context, findNotionSourcesTrigger, NOTION_SOURCES_TRIGGER_WAIT_MS, 120);

  async function applyNotionAllSourcesPreference(context, modelId, allSourcesState, lease) {
    const desiredState = allSourcesState === "enabled";
    const triggerWaitMs = context.interactionCount === 0 ? NOTION_SOURCES_TRIGGER_WAIT_MS : NOTION_SOURCES_HYDRATION_TRIGGER_WAIT_MS;
    const trigger = await waitForPreferredModelWithinDeadline(
      context, findNotionSourcesTrigger, triggerWaitMs, 120);
    if (!trigger) {
      const menuClosed = notionSourcesMenuRoots().length === 0;
      return preferredModelResult(context, false, "NotionAI", modelId, "sources trigger not found", {
        retryable: context.interactionCount === 0, menuClosed, allSourcesState
      });
    }
    if (lease.baselineRoots.size > 0) {
      assertPreferredModelRun(context);
      const reason = lease.baselineAllSources.size > 0 ? "unowned all sources overlay is open" : "unowned sources menu is open";
      return preferredModelResult(context, false, "NotionAI", modelId, reason, {
        retryable: context.interactionCount === 0, menuClosed: false, allSourcesState
      });
    }
    const mainState = await notionMainSourceIndicator.waitNotionMainSourceState(
      context, null, NOTION_SOURCES_SETTLE_WAIT_MS);
    if (!mainState) {
      const observation = notionMainSourceIndicator.observeNotionMainSourceState();
      return preferredModelResult(context, false, "NotionAI", modelId, observation.reason || "sources indicator state is unreadable", {
        retryable: context.interactionCount === 0, menuClosed: true, allSourcesState
      });
    }
    if (mainState.state === desiredState) {
      return preferredModelResult(context, true, "NotionAI", modelId, "", {
        skipped: true, menuClosed: true, allSourcesState
      });
    }
    const opened = await ensureNotionAllSourcesRow(context, lease, NOTION_SOURCES_TRIGGER_WAIT_MS);
    if (!opened.row) {
      const menuClosed = opened.menusOwned === false
        ? notionSourcesMenuRoots().length === 0
        : await closeNotionSourcesMenus(context, lease);
      assertPreferredModelRun(context);
      const reason = opened.reason || (opened.ambiguous ? "all sources overlay is ambiguous" : "all sources row not found");
      return preferredModelResult(context, false, "NotionAI", modelId, reason, {
        retryable: context.interactionCount === 0,
        menuClosed,
        allSourcesState
      });
    }
    const initial = observeNotionAllSourcesState(opened);
    if (initial.state === null) {
      const menuClosed = await closeNotionSourcesMenus(context, lease);
      assertPreferredModelRun(context);
      return preferredModelResult(context, false, "NotionAI", modelId, initial.reason, { menuClosed, allSourcesState });
    }
    const stableInitial = await waitNotionAllSourcesStable(context, initial.state, opened);
    if (!stableInitial) {
      const menuClosed = await closeNotionSourcesMenus(context, lease);
      assertPreferredModelRun(context);
      return preferredModelResult(context, false, "NotionAI", modelId, "all sources state was not stable", {
        menuClosed,
        allSourcesState
      });
    }
    const changed = initial.state !== desiredState;
    if (changed && (!initial.activationTarget || !activateNotionSourcesElement(context, initial.activationTarget, { pointer: false }))) {
      const menuClosed = await closeNotionSourcesMenus(context, lease);
      assertPreferredModelRun(context);
      return preferredModelResult(context, false, "NotionAI", modelId, "all sources toggle could not be clicked", { menuClosed, allSourcesState });
    }
    const stable = changed && await waitNotionAllSourcesStable(context, desiredState, opened, NOTION_SOURCES_SETTLE_WAIT_MS, {
      allowBindingReplacement: true
    });
    const menuClosed = await closeNotionSourcesMenusForResult(context, lease);
    assertPreferredModelRun(context);
    if (!menuClosed) {
      return preferredModelResult(context, false, "NotionAI", modelId, "sources menu did not close", {
        menuClosed,
        allSourcesState
      });
    }
    if (!changed) return preferredModelResult(context, true, "NotionAI", modelId, "", { changed, skipped: true, menuClosed, allSourcesState });
    const settled = await notionMainSourceIndicator.waitNotionMainSourceState(
      context, desiredState, NOTION_SOURCES_SETTLE_WAIT_MS);
    assertPreferredModelRun(context);
    if (settled) return preferredModelResult(context, true, "NotionAI", modelId, "", { changed, menuClosed, allSourcesState });
    const mainProof = notionMainSourceIndicator.observeNotionMainSourceState();
    if (stable && mainProof?.state === desiredState) return preferredModelResult(context, true, "NotionAI", modelId, "", { changed, menuClosed, allSourcesState });
    if (
      stable
      && !desiredState
      && mainState.state === true
      && !mainState.indicator
      && !mainState.proofElement
    ) return preferredModelResult(context, true, "NotionAI", modelId, "", { changed, menuClosed, allSourcesState });
    return preferredModelResult(context, false, "NotionAI", modelId, "main sources indicator did not settle", {
      menuClosed,
      allSourcesState
    });
  }
  async function runNotionPreferenceOperation(context, operation) {
    const previous = notionSourcesOperationTail.catch(() => {});
    let releaseOperation = () => {};
    const operationGate = new Promise((resolve) => { releaseOperation = resolve; });
    notionSourcesOperationTail = previous.then(() => operationGate);
    await previous;
    let lease = null;
    let outcome;
    let operationError = null;
    try {
      assertPreferredModelRun(context);
      lease = createNotionSourcesLease();
      outcome = await operation(lease);
    } catch (error) {
      operationError = error;
    } finally {
      try {
        if (lease) await closeNotionSourcesMenus(context, lease, { forceCleanup: true });
      } catch {}
      releaseOperation();
    }
    if (operationError) throw operationError;
    assertPreferredModelRun(context);
    return outcome;
  }

  return Object.freeze({ applyNotionAllSourcesPreference, preflightNotionAllSourcesTrigger, runNotionPreferenceOperation }); }
