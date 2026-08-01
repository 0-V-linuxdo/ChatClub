import { createDeleteClaudeCapability } from "./delete-claude.js";

export function createDeleteSitesCapability(deps = {}) {
  const {
    qsa,
    normalize,
    deleteCompactToken,
    modelRect,
    deleteElementText,
    deleteClickableElement,
    isDisabledElement,
    svgSignature,
    visible,
    deleteLabelMatchesExactish,
    deleteLabelMatches,
    DELETE_CANCEL_LABELS,
    matches,
    visibleSelectorElements,
    deleteClickLayout,
    sleep,
    deleteClick,
    closest,
    findDeleteConfirmButton,
    findDeleteConfirmButtonInfo,
    clickDeleteConfirmIfPresent,
    deleteResult,
    dispatchDeleteKeyboardShortcut,
    deleteDialogRoots,
    deleteResultWithTrustedConfirm,
    deleteResultWithTrustedDeleteShortcut,
    visibleDeleteCandidates,
    modelElementArea,
    modelElementFromPoint,
    deleteActivateUntil,
    waitForModel,
    deleteResultWithTrustedMenuClick
  } = deps;
  const { deleteClaudeThread } = createDeleteClaudeCapability(deps);
  const officialHints = (data = {}) => data?.officialRuleHints && typeof data.officialRuleHints === "object"
    ? data.officialRuleHints
    : {};
  const officialSelectors = (data = {}, slot = "") => (Array.isArray(officialHints(data)?.[slot])
    ? officialHints(data)[slot]
    : []).map((selector) => String(selector || "").trim()).filter(Boolean).slice(0, 8);

  const pendingDeleteConfirmationLeases = new Map();
  const deleteAttemptIdentity = (data = {}) => {
    const attemptId = String(data?.deleteAttemptId || "").trim();
    const provider = String(data?.expectedDeleteIdentity?.provider || "").trim().toLowerCase();
    const id = String(data?.expectedDeleteIdentity?.id || "").trim();
    return attemptId && attemptId.length <= 256 && provider && id
      ? { attemptId, provider, id }
      : null;
  };
  const currentDeleteHref = () => {
    try { return String(location.href || ""); } catch { return ""; }
  };
  const deleteAttemptRouteGuard = (data = {}, expectedHref = "") => {
    const identity = deleteAttemptIdentity(data);
    const href = String(expectedHref || currentDeleteHref());
    if (!identity || !href || currentDeleteHref() !== href) return null;
    return () => {
      const current = deleteAttemptIdentity(data);
      return Boolean(
        current
        && current.attemptId === identity.attemptId
        && current.provider === identity.provider
        && current.id === identity.id
        && currentDeleteHref() === href
      );
    };
  };
  const grokDeleteAttemptRouteGuard = (data = {}) => {
    const identity = deleteAttemptIdentity(data);
    let routeId = "";
    try { routeId = new URL(String(location.href || "")).pathname.match(/^\/(?:c|chat)\/([^/?#]+)/i)?.[1] || ""; } catch {}
    if (!identity || identity.provider !== "grok" || !routeId || identity.id !== routeId) return null;
    return deleteAttemptRouteGuard(data);
  };
  const armDeleteConfirmationLease = (site, data, phase, baseline, metadata = {}) => {
    const identity = deleteAttemptIdentity(data);
    const href = currentDeleteHref();
    if (!identity || !href) return false;
    pendingDeleteConfirmationLeases.set(site, {
      ...identity,
      href,
      phase,
      baseline,
      metadata,
      expiresAt: Date.now() + 20000
    });
    return true;
  };
  const consumeDeleteConfirmationLease = (site, data) => {
    const identity = deleteAttemptIdentity(data);
    const lease = pendingDeleteConfirmationLeases.get(site) || null;
    pendingDeleteConfirmationLeases.delete(site);
    return Boolean(
      identity
      && lease
      && lease.attemptId === identity.attemptId
      && lease.provider === identity.provider
      && lease.id === identity.id
      && lease.href === currentDeleteHref()
      && Number(lease.expiresAt) >= Date.now()
    ) ? lease : null;
  };
  const deleteConfirmationAlreadyOpen = (hints = {}) => Boolean(
    findDeleteConfirmButton(hints) || deleteDialogRoots(hints.dialog).length
  );
  const sameDeleteConfirmationRoot = (left, right) => Boolean(
    left
    && right
    && (left === right || left.contains?.(right) || right.contains?.(left))
  );
  const deleteConfirmationOwnership = (baseline = new Set(), hints = {}, attemptGuard = null) => {
    if (typeof attemptGuard === "function" && attemptGuard() !== true) return null;
    const roots = deleteDialogRoots(hints.dialog);
    const info = findDeleteConfirmButtonInfo(hints);
    const button = info?.element || null;
    const root = info?.root || roots
      .find((candidate) => candidate === button || candidate.contains?.(button)) || null;
    if (!button || !root || baseline?.has(root)) return null;
    if ([...(baseline || [])].some((candidate) => sameDeleteConfirmationRoot(candidate, root))) return null;
    if (!button.isConnected || !root.isConnected || !visible(button) || !visible(root) || !root.contains?.(button)) return null;
    if (!roots.some((candidate) => candidate === root)) return null;
    if (roots.some((candidate) => !sameDeleteConfirmationRoot(candidate, root))) return null;
    return { root, button };
  };
  const deleteConfirmationOwnershipIsCurrent = (ownership, hints = {}, attemptGuard = null) => {
    const root = ownership?.root || null;
    const button = ownership?.button || null;
    if (typeof attemptGuard === "function" && attemptGuard() !== true) return false;
    if (!root || !button || !root.isConnected || !button.isConnected || !visible(root) || !visible(button)) return false;
    if (!root.contains?.(button)) return false;
    const roots = deleteDialogRoots(hints.dialog);
    const info = findDeleteConfirmButtonInfo(hints);
    const currentRoot = info?.root || roots
      .find((candidate) => candidate === info?.element || candidate.contains?.(info?.element)) || null;
    return info?.element === button
      && currentRoot === root
      && roots.some((candidate) => candidate === root)
      && roots.every((candidate) => sameDeleteConfirmationRoot(candidate, root));
  };
  const waitForOwnedDeleteConfirmation = (baseline, hints, timeoutMs = 2600, attemptGuard = null) => waitForModel(
    () => deleteConfirmationOwnership(baseline, hints, attemptGuard),
    timeoutMs,
    80
  );
  const deleteConfirmationObservation = (baseline, hints, attemptGuard = null) => {
    const hasConfirmation = deleteConfirmationAlreadyOpen(hints);
    if (!hasConfirmation) return { state: "none", ownership: null };
    const ownership = deleteConfirmationOwnership(baseline, hints, attemptGuard);
    return ownership
      ? { state: "owned", ownership }
      : { state: "unowned", ownership: null };
  };
  async function observeOptionalDeleteConfirmation(baseline, hints, attemptGuard, timeoutMs = 900) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const observation = deleteConfirmationObservation(baseline, hints, attemptGuard);
      if (observation.state !== "none") return observation;
      await sleep(80);
    }
    return deleteConfirmationObservation(baseline, hints, attemptGuard);
  }
  async function finishOwnedDeleteConfirmation(site, ownership, hints, timeoutMs, attemptGuard = null, allowTrustedFallback = true) {
    const guard = () => deleteConfirmationOwnershipIsCurrent(ownership, hints, attemptGuard);
    if (!guard()) return deleteResult(false, site, "delete confirmation ownership is uncertain");
    const confirmed = await clickDeleteConfirmIfPresent(timeoutMs, guard, hints);
    if (confirmed) return deleteResult(true, site);
    if (guard() && allowTrustedFallback) return deleteResultWithTrustedConfirm(site, "delete confirmation did not close", hints);
    if (guard()) return deleteResult(false, site, "delete confirmation did not close");
    return deleteResult(false, site, "delete confirmation ownership changed");
  }

  async function deleteKagiThread(data = {}) {
    const hints = officialHints(data);
    const attemptGuard = deleteAttemptRouteGuard(data);
    pendingDeleteConfirmationLeases.delete("kagi");
    if (!attemptGuard || !attemptGuard()) return deleteResult(false, "kagi", "stable delete attempt and route identity not found");
    if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "kagi", "unverified delete confirmation is already open");
    const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
    const shortcutDispatched = dispatchDeleteKeyboardShortcut();
    if (!shortcutDispatched) return deleteResult(false, "kagi", "delete shortcut dispatch failed");
    if (!attemptGuard()) return deleteResult(false, "kagi", "current conversation changed before delete shortcut");
    const confirmation = await waitForOwnedDeleteConfirmation(confirmationBaseline, hints, 2600, attemptGuard);
    if (!confirmation) return deleteResult(false, "kagi", deleteConfirmationAlreadyOpen(hints)
      ? "delete confirmation ownership is uncertain"
      : "delete shortcut did not open confirmation");
    return finishOwnedDeleteConfirmation("kagi", confirmation, hints, 3600, attemptGuard);
  }

  async function deleteChatGptThread(data = {}) {
    const hints = officialHints(data);
    if (data?.trustedKeySequenceRetried) {
      const lease = consumeDeleteConfirmationLease("chatgpt", data);
      if (!lease || lease.phase !== "shortcut-confirmation") {
        return deleteResult(false, "chatgpt", "trusted delete shortcut does not match the pending attempt");
      }
      const attemptGuard = deleteAttemptRouteGuard(data, lease.href);
      if (!attemptGuard) return deleteResult(false, "chatgpt", "trusted delete shortcut route ownership changed");
      const confirmation = deleteConfirmationOwnership(lease.baseline, hints, attemptGuard)
        || await waitForOwnedDeleteConfirmation(lease.baseline, hints, 2600, attemptGuard);
      if (!confirmation) return deleteResult(false, "chatgpt", deleteConfirmationAlreadyOpen(hints)
        ? "delete confirmation ownership is uncertain"
        : "trusted delete shortcut did not open confirmation");
      return finishOwnedDeleteConfirmation("chatgpt", confirmation, hints, 4200, attemptGuard);
    }
    const attemptGuard = deleteAttemptRouteGuard(data);
    pendingDeleteConfirmationLeases.delete("chatgpt");
    if (!attemptGuard || !attemptGuard()) return deleteResult(false, "chatgpt", "stable delete attempt and route identity not found");
    if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "chatgpt", "unverified delete confirmation is already open");
    const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
    const shortcutDispatched = dispatchDeleteKeyboardShortcut();
    if (shortcutDispatched) {
      const confirmation = await waitForOwnedDeleteConfirmation(confirmationBaseline, hints, 2600, attemptGuard);
      if (confirmation) return finishOwnedDeleteConfirmation("chatgpt", confirmation, hints, 4200, attemptGuard);
      if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "chatgpt", "delete confirmation ownership is uncertain");
    }
    const reason = shortcutDispatched ? "delete shortcut did not open confirmation" : "delete shortcut dispatch failed";
    if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "chatgpt", "delete confirmation ownership is uncertain");
    if (!attemptGuard() || !armDeleteConfirmationLease("chatgpt", data, "shortcut-confirmation", confirmationBaseline)) {
      return deleteResult(false, "chatgpt", `${reason}; trusted retry ownership unavailable`);
    }
    return deleteResultWithTrustedDeleteShortcut("chatgpt", reason);
  }

  const DELETE_MENU_ROOT_SELECTORS = [
    "[role='menu']",
    "[role='listbox']",
    "[role='dialog']",
    "[data-radix-menu-content]",
    "[data-radix-popper-content-wrapper]",
    "[data-floating-ui-portal]",
    "[data-slot='dropdown-menu-content']",
    "[cmdk-root]",
    "[class*='dropdown' i]",
    "[class*='popover' i]",
    "[class*='popper' i]",
    "[class*='menu' i]"
  ];

  function menuRootsWithDelete(labels, candidateSelectors = []) {
    const roots = visibleSelectorElements([...DELETE_MENU_ROOT_SELECTORS, ...candidateSelectors])
      .filter((root) => {
        const value = deleteElementText(root);
        return deleteLabelMatches(value, labels) || /rename|pin|share|重命名|置顶|分享/i.test(value);
      })
      .sort((a, b) => {
        const ar = modelRect(a);
        const br = modelRect(b);
        return (br?.right || 0) - (ar?.right || 0) || (ar?.top || 0) - (br?.top || 0);
      });
    const pushRoot = (root) => {
      if (!root || !visible(root)) return;
      const rect = modelRect(root);
      if (!rect || rect.width < 72 || rect.height < 28 || rect.width > 520 || rect.height > 620) return;
      const value = deleteElementText(root);
      if (!deleteLabelMatches(value, labels) && !/rename|pin|share|重命名|置顶|分享/i.test(value)) return;
      if (!roots.some((item) => item === root || item.contains?.(root) || root.contains?.(item))) roots.push(root);
    };
    for (const item of visibleDeleteCandidates(document)) {
      if (!deleteLabelMatches(deleteElementText(item), labels)) continue;
      for (let node = item; node && node !== document.body; node = node.parentElement) {
        pushRoot(node);
        if (roots.some((root) => root === node)) break;
      }
    }
    roots.sort((a, b) => {
      const ar = modelRect(a);
      const br = modelRect(b);
      return (br?.right || 0) - (ar?.right || 0) || (ar?.top || 0) - (br?.top || 0) || modelElementArea(a) - modelElementArea(b);
    });
    return roots;
  }

  function findDeleteMenuItem(root, labels, candidateSelectors = []) {
    const candidates = [];
    const cancelLabels = ["Cancel", "取消"];
    const seen = new Set();
    const add = (element, { exactOnly = false, extraScore = 0 } = {}) => {
      if (!element || seen.has(element)) return;
      const value = deleteElementText(element);
      if (!deleteLabelMatches(value, labels)) return;
      if (exactOnly && !deleteLabelMatchesExactish(value, labels)) return;
      if (deleteLabelMatches(value, cancelLabels)) return;
      const target = deleteClickableElement(element);
      if (!target || seen.has(target) || !visible(target) || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (exactOnly && (!rect || rect.width < 12 || rect.height < 10 || rect.width > 360 || rect.height > 90)) return;
      seen.add(element);
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore + (deleteLabelMatches(value, labels, { exact: true }) ? 500 : 0),
        top: rect?.top || 0,
        area: rect ? rect.width * rect.height : 0
      });
    };
    for (const element of visibleDeleteCandidates(root)) add(element);
    for (const selector of candidateSelectors) {
      for (const element of qsa(selector, root, { all: true })) add(element, { extraScore: 260 });
    }
    if (!candidates.length) {
      for (const element of qsa("[role='menuitem'],[role='option'],button,[role='button'],li,div,span", root, { all: true })) {
        if (!visible(element) || isDisabledElement(element)) continue;
        add(element, { exactOnly: true, extraScore: 180 });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.area - b.area);
    return candidates[0]?.element || null;
  }

  function findOpenDeleteMenuItem(labels, menuRootSelectors = [], candidateSelectors = []) {
    const candidates = [];
    const seen = new Set();
    const menuRoots = visibleSelectorElements([...DELETE_MENU_ROOT_SELECTORS, ...menuRootSelectors]);
    const add = (element, extraScore = 0) => {
      if (!element || seen.has(element) || !visible(element) || isDisabledElement(element)) return;
      const value = deleteElementText(element);
      if (!deleteLabelMatchesExactish(value, labels)) return;
      if (deleteLabelMatches(value, DELETE_CANCEL_LABELS)) return;
      const target = deleteClickableElement(element);
      if (!target || seen.has(target) || !visible(target) || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 8 || rect.height < 8 || rect.width > 420 || rect.height > 110) return;
      const root = menuRoots.find((item) => item === target || item.contains?.(target));
      seen.add(element);
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore + (root ? 320 : 0) + (matches(target, "[role='menuitem'],[role='option'],button,[role='button']") ? 160 : 0),
        top: rect.top,
        right: rect.right,
        area: rect.width * rect.height
      });
    };
    for (const root of menuRoots) {
      for (const selector of candidateSelectors) {
        for (const element of qsa(selector, root, { all: true })) add(element, 360);
      }
      for (const element of qsa("[role='menuitem'],[role='option'],button,[role='button'],a[href],[tabindex]:not([tabindex='-1']),li,div,span", root, { all: true })) {
        add(element, 220);
      }
    }
    if (!candidates.length) {
      for (const element of qsa("[role='menuitem'],[role='option'],button,[role='button'],a[href],[tabindex]:not([tabindex='-1']),li,div,span", document, { all: true })) {
        add(element, 0);
      }
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top || a.area - b.area);
    return candidates[0]?.element || null;
  }

  async function openTriggerAndClickDelete(trigger, labels, { timeoutMs = 3200, allowHiddenTrigger = false, guard = null, hints = {} } = {}) {
    if (!trigger || (!visible(trigger) && !allowHiddenTrigger)) return false;
    const guarded = () => typeof guard !== "function" || guard() === true;
    if (!guarded()) return false;
    const menuRootSelectors = Array.isArray(hints.menuRoot) ? hints.menuRoot : [];
    const deleteSelectors = Array.isArray(hints.deleteCandidate) ? hints.deleteCandidate : [];
    const existingRoot = menuRootsWithDelete(labels, menuRootSelectors)[0] || null;
    if (!existingRoot && !(allowHiddenTrigger ? deleteClickLayout(trigger) : deleteClick(trigger))) return false;
    await sleep(140);
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const root = menuRootsWithDelete(labels, menuRootSelectors)[0] || existingRoot;
      const item = (root ? findDeleteMenuItem(root, labels, deleteSelectors) : null)
        || findOpenDeleteMenuItem(labels, menuRootSelectors, deleteSelectors);
      if (item && guarded() && (deleteClick(item) || deleteClickLayout(item))) return true;
      await sleep(120);
    }
    return false;
  }

  function topRightMenuTrigger({ labels = [], selectors = [] } = {}) {
    const viewportWidth = Math.max(1, Number(window.innerWidth) || Number(document.documentElement?.clientWidth) || 1);
    const candidates = [];
    const seen = new Set();
    const selector = [
      ...selectors,
      "button",
      "[role='button']",
      "[aria-haspopup='menu']",
      "[aria-expanded]"
    ].join(", ");
    for (const element of qsa(selector, document, { all: true })) {
      const target = deleteClickableElement(element);
      if (!target || seen.has(target) || !visible(target) || isDisabledElement(target)) continue;
      seen.add(target);
      const rect = modelRect(target);
      if (!rect || rect.top > 190 || rect.right < viewportWidth * 0.45) continue;
      if (target.closest?.(DELETE_MENU_ROOT_SELECTORS.join(", "))) continue;
      const value = deleteElementText(target);
      const hasLabel = deleteLabelMatches(value, labels);
      const popup = String(target.getAttribute?.("aria-haspopup") || "").toLowerCase();
      const compact = deleteCompactToken(value);
      const hasMore = /more|menu|options|ellipsis|delete|rename|更多|菜单|选项|删除|重命名/.test(compact);
      const svg = svgSignature(target);
      const hasEllipsisIcon = /ellipsis|more|dots|circle/.test(svg) || (qsa("circle", target).length >= 2);
      if (!hasLabel && !hasMore && popup !== "menu" && !hasEllipsisIcon) continue;
      candidates.push({
        element: target,
        score: (hasLabel ? 900 : 0)
          + (hasMore ? 320 : 0)
          + (popup === "menu" ? 160 : 0)
          + (hasEllipsisIcon ? 140 : 0)
          + (rect.right >= viewportWidth * 0.72 ? 80 : 0)
          + (rect.width <= 64 ? 40 : 0),
        right: rect.right,
        top: rect.top
      });
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top);
    return candidates[0]?.element || null;
  }

  async function deleteGrokThread(data = {}) {
    const hints = officialHints(data);
    const labels = ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"];
    const attemptGuard = grokDeleteAttemptRouteGuard(data);
    if (!attemptGuard || !attemptGuard()) {
      return deleteResult(false, "grok", "stable delete attempt and route identity not found");
    }
    if (deleteConfirmationAlreadyOpen(hints)) {
      return deleteResult(false, "grok", "unverified delete confirmation is already open");
    }
    const trigger = topRightMenuTrigger({
      labels: ["More", "More actions", "Menu", "Options", "更多", "菜单"],
      selectors: officialSelectors(data, "menuTrigger")
    });
    if (!trigger) return deleteResult(false, "grok", "conversation menu trigger not found");
    const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
    if (!attemptGuard()) return deleteResult(false, "grok", "current conversation changed before delete activation");
    const preDeleteGuard = () => attemptGuard() && !deleteConfirmationAlreadyOpen(hints);
    if (!await openTriggerAndClickDelete(trigger, labels, { guard: preDeleteGuard, hints })) {
      if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "grok", "unverified delete confirmation appeared before delete activation");
      return deleteResult(false, "grok", "delete menu item not found");
    }
    const observation = await observeOptionalDeleteConfirmation(confirmationBaseline, hints, attemptGuard, 900);
    if (observation.state === "owned") {
      return finishOwnedDeleteConfirmation("grok", observation.ownership, hints, 5200, attemptGuard, false);
    }
    if (observation.state === "unowned") {
      return deleteResult(false, "grok", "delete confirmation ownership is uncertain");
    }
    return deleteResult(true, "grok");
  }

  const GEMINI_DELETE_CONVERSATION_ACTION_SELECTOR = [
    "top-bar-actions conversation-actions-icon button[data-test-id='conversation-actions-menu-icon-button']",
    "top-bar-actions button[data-test-id='conversation-actions-menu-icon-button']",
    "top-bar-actions button.conversation-actions-menu-button",
    "top-bar-actions button[aria-label*='conversation actions' i]",
    "top-bar-actions button[aria-label*='open menu' i]",
    "button[data-test-id='conversation-actions-menu-icon-button']",
    "button.conversation-actions-menu-button",
    "button[aria-label*='Open menu for conversation actions' i]",
    "button[aria-label*='conversation actions' i]",
    "button[aria-label*='more options' i]",
    "button[data-test-id='actions-menu-button']"
  ].join(", ");
  const GEMINI_DELETE_MENU_ROOT_SELECTOR = [
    ".cdk-overlay-pane .mat-mdc-menu-panel[role='menu']",
    ".cdk-overlay-pane .mat-menu-panel[role='menu']",
    ".cdk-overlay-pane [role='menu']",
    ".cdk-overlay-pane .mat-mdc-menu-panel",
    ".cdk-overlay-pane .mat-menu-panel",
    ".mat-mdc-menu-panel[role='menu']",
    ".mat-menu-panel[role='menu']",
    ".cdk-overlay-pane"
  ].join(", ");
  const GEMINI_DELETE_MENU_ITEM_SELECTOR = [
    "button[mat-menu-item]",
    "button.mat-mdc-menu-item",
    "button[aria-label]",
    "button[jslog]",
    "button[data-test-id]",
    "[role='menuitem']",
    "[role='menuitemradio']",
    "[role='menuitemcheckbox']",
    "[role='button']",
    "[aria-label]",
    "[title]",
    "[jslog]",
    "[data-test-id]",
    "[tabindex]",
    "mat-icon",
    "span",
    "div"
  ].join(", ");
  const GEMINI_DELETE_MENU_MARKERS = ["Delete", "Rename", "Pin", "Share", "Unpin", "删除", "重命名", "固定", "取消固定", "分享"];

  function geminiDeleteCollectTextExcludingIcons(node, parts = []) {
    if (!node) return parts;
    if (node.nodeType === 3) {
      parts.push(node.nodeValue || "");
      return parts;
    }
    if (node.nodeType !== 1) return parts;
    const tagName = String(node.tagName || "").toLowerCase();
    if (tagName === "mat-icon") return parts;
    if (String(node.getAttribute?.("aria-hidden") || "").trim().toLowerCase() === "true") return parts;
    if (node.hasAttribute?.("fonticon") || node.hasAttribute?.("data-mat-icon-name")) return parts;
    try {
      for (const child of Array.from(node.childNodes || [])) geminiDeleteCollectTextExcludingIcons(child, parts);
    } catch {}
    return parts;
  }

  function geminiDeleteUiText(node) {
    if (!node) return "";
    const ariaLabel = node.getAttribute?.("aria-label");
    if (ariaLabel && String(ariaLabel).trim()) return normalize(ariaLabel);
    const title = node.getAttribute?.("title");
    if (title && String(title).trim()) return normalize(title);
    const withoutIcons = normalize(geminiDeleteCollectTextExcludingIcons(node, []).join(" "));
    if (withoutIcons) return withoutIcons;
    return normalize(node.textContent || "");
  }

  function geminiDeleteJslogId(node) {
    for (let current = node, depth = 0; current && depth < 5; current = current.parentElement, depth += 1) {
      const match = String(current.getAttribute?.("jslog") || "").match(/^\s*([0-9]+)/);
      if (match) return match[1];
    }
    return "";
  }

  function geminiDeleteDataTestIds(node) {
    const ids = [];
    const add = (item) => {
      const id = String(item?.getAttribute?.("data-test-id") || "").trim().toLowerCase();
      if (id && !ids.includes(id)) ids.push(id);
    };
    add(node);
    qsa("[data-test-id]", node, { all: true }).forEach(add);
    return ids;
  }

  function geminiDeleteMenuItemLooksLikeNotebook(node) {
    const value = normalize([geminiDeleteUiText(node), deleteElementText(node), geminiDeleteDataTestIds(node).join(" ")].join(" "));
    return /\bnotebook\b/i.test(value) || value.includes("笔记本");
  }

  function geminiDeleteMenuMarkerCount(node) {
    const value = normalize([geminiDeleteUiText(node), node?.textContent].filter(Boolean).join(" ")).toLowerCase();
    const matched = [];
    for (const marker of GEMINI_DELETE_MENU_MARKERS.map((item) => item.toLowerCase()).sort((a, b) => b.length - a.length)) {
      if (!value.includes(marker) || matched.some((existing) => existing.includes(marker))) continue;
      matched.push(marker);
    }
    return matched.length;
  }

  function geminiDeleteConversationMenuRoot(node) {
    if (!node || !visible(node)) return false;
    const tagName = String(node.tagName || "").toLowerCase();
    const role = String(node.getAttribute?.("role") || "").toLowerCase();
    if (tagName === "mat-dialog-container" || role === "dialog") return false;
    const isOverlay = Boolean(node.matches?.(".cdk-overlay-pane"));
    const panel = node.matches?.(".mat-mdc-menu-panel, .mat-menu-panel, [role='menu']")
      ? node
      : node.querySelector?.(".mat-mdc-menu-panel, .mat-menu-panel, [role='menu']");
    if (!panel && !isOverlay) return false;
    if (node.querySelector?.("mat-dialog-container, [role='dialog']")) return false;
    if (node.querySelector?.("button[data-test-id='delete-button'],button[data-test-id='pin-button'],button[data-test-id='rename-button'],button[aria-label*='Delete' i],button[aria-label*='Rename' i],button[aria-label*='Pin' i],button[aria-label*='Share' i]")) return true;
    return geminiDeleteMenuMarkerCount(node) > 0;
  }

  function geminiDeleteConversationActionButtonExcluded(button) {
    if (!button || !visible(button)) return true;
    if (button.closest?.("bard-sidenav, side-navigation-content, .sidenav-with-history-container, .conversation-items-container, side-nav-action-button")) return true;
    if (button.closest?.("input-area-v2, [data-node-type='input-area'], [contenteditable='true'], .prompt-input, .composer, .prompt-composer")) return true;
    if (button.closest?.("user-query,user-query-content,model-response,message-content,message-actions,response-actions,.message-actions,.response-actions,[data-test-id*='user-query' i],[data-test-id*='model-response' i],[data-test-id*='response' i],[data-test-id*='message' i],[data-test-id*='query' i]")) return true;
    if (button.closest?.(".cdk-overlay-pane .mat-mdc-menu-panel,.cdk-overlay-pane .mat-menu-panel,.cdk-overlay-pane [role='menu'],mat-dialog-container,[role='dialog']")) return true;
    return false;
  }

  function geminiDeleteConversationActionButton(data = {}) {
    const candidates = [];
    const selector = [...officialSelectors(data, "menuTrigger"), GEMINI_DELETE_CONVERSATION_ACTION_SELECTOR].join(",");
    for (const button of qsa(selector, document, { all: true })) {
      if (geminiDeleteConversationActionButtonExcluded(button)) continue;
      const dataTestId = String(button.getAttribute?.("data-test-id") || "").trim().toLowerCase();
      const ariaLabel = normalize(button.getAttribute?.("aria-label") || "").toLowerCase();
      const title = normalize(button.getAttribute?.("title") || "").toLowerCase();
      const textValue = geminiDeleteUiText(button).toLowerCase();
      const className = String(button.className || "").toLowerCase();
      const inTopBar = Boolean(button.closest?.("top-bar-actions"));
      const explicitlyConversationAction = inTopBar
        || dataTestId === "conversation-actions-menu-icon-button"
        || className.includes("conversation-actions-menu-button")
        || ariaLabel.includes("conversation actions")
        || ariaLabel.includes("open menu for conversation actions")
        || title.includes("conversation actions")
        || textValue.includes("conversation actions");
      if (!explicitlyConversationAction) continue;
      const box = modelRect(button);
      let score = 0;
      if (dataTestId === "conversation-actions-menu-icon-button") score += 160;
      if (dataTestId === "actions-menu-button") score += 70;
      if (className.includes("conversation-actions-menu-button")) score += 130;
      if (inTopBar) score += 120;
      if (ariaLabel.includes("conversation actions")) score += 100;
      if (ariaLabel.includes("open menu for conversation actions")) score += 140;
      if (inTopBar && ariaLabel.includes("more options")) score += 40;
      if (title.includes("conversation actions")) score += 60;
      if (textValue.includes("conversation actions")) score += 70;
      if (inTopBar && /more_vert/i.test(deleteElementText(button))) score += 35;
      if (box && box.top <= Math.max(220, (window.innerHeight || 1) * 0.32)) score += 20;
      if (box && box.left >= (window.innerWidth || 1) * 0.42) score += 20;
      candidates.push({ element: button, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.element || null;
  }

  function geminiDeleteConversationMenuRoots(trigger = null, data = {}) {
    const roots = [];
    const add = (node) => {
      if (node && geminiDeleteConversationMenuRoot(node) && !roots.includes(node)) roots.push(node);
    };
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (controlsId) {
      try { add(document.getElementById(controlsId)); } catch {}
    }
    const selector = [...officialSelectors(data, "menuRoot"), GEMINI_DELETE_MENU_ROOT_SELECTOR].join(",");
    qsa(selector, document, { all: true }).forEach(add);
    return roots;
  }

  function geminiDeleteMenuItemMatches(node) {
    if (!node || !visible(node) || isDisabledElement(node) || geminiDeleteMenuItemLooksLikeNotebook(node)) return false;
    const uiText = geminiDeleteUiText(node);
    if (/\bdelete\b/i.test(uiText) || uiText.includes("删除")) return true;
    if (uiText) return false;
    if (geminiDeleteDataTestIds(node).includes("delete-button")) return true;
    return geminiDeleteJslogId(node) === "186000";
  }

  function findGeminiDeleteMenuItem(trigger = null, data = {}) {
    const candidates = [];
    const seen = new Set();
    const roots = geminiDeleteConversationMenuRoots(trigger, data);
    const add = (node, root, extraScore = 0) => {
      if (!node || seen.has(node) || !geminiDeleteMenuItemMatches(node)) return;
      let target = deleteClickableElement(node) || node;
      if (target === root || geminiDeleteMenuMarkerCount(target) > 1) {
        target = closest(node, "button,[role='menuitem'],[role='button'],[mat-menu-item],[data-test-id],[jslog],[tabindex]") || node;
      }
      if (!target || target === root || seen.has(target) || !visible(target) || isDisabledElement(target) || geminiDeleteMenuMarkerCount(target) > 1 || geminiDeleteMenuItemLooksLikeNotebook(target)) return;
      const box = modelRect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 520 || box.height > 140) return;
      const ids = geminiDeleteDataTestIds(target);
      const uiText = geminiDeleteUiText(target);
      seen.add(node);
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore
          + (ids.includes("delete-button") ? 1000 : 0)
          + (geminiDeleteJslogId(target) === "186000" ? 800 : 0)
          + (/^(delete|删除)$/i.test(uiText) ? 650 : 0)
          + (target.matches?.("button,[role='menuitem'],[role='button']") ? 180 : 0),
        top: box.top,
        right: box.right
      });
    };
    for (let index = roots.length - 1; index >= 0; index -= 1) {
      const root = roots[index];
      for (const selector of officialSelectors(data, "deleteCandidate")) {
        qsa(selector, root, { all: true }).forEach((node) => add(node, root, 520 + index));
      }
      qsa(GEMINI_DELETE_MENU_ITEM_SELECTOR, root, { all: true }).forEach((node) => add(node, root, 240 + index));
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top);
    return candidates[0]?.element || null;
  }

  async function resolveGeminiDeleteMenuItem(trigger, data = {}) {
    const menuReady = () => findGeminiDeleteMenuItem(trigger, data);
    let item = menuReady();
    if (!item) item = await deleteActivateUntil(trigger, menuReady, { settleMs: 220 });
    if (!item) return null;
    await sleep(120);
    return findGeminiDeleteMenuItem(trigger, data) || item;
  }

  async function activateGeminiDeleteItem(item, data, hints, attemptGuard) {
    if (!item) return deleteResult(false, "gemini", "delete menu item not found");
    if (typeof attemptGuard !== "function" || attemptGuard() !== true) {
      return deleteResult(false, "gemini", "current conversation or delete attempt changed before delete activation");
    }
    if (deleteConfirmationAlreadyOpen(hints)) {
      return deleteResult(false, "gemini", "unverified delete confirmation appeared before delete activation");
    }
    const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
    const activated = deleteClick(item) || deleteClickLayout(item);
    if (activated) {
      const confirmation = await waitForOwnedDeleteConfirmation(confirmationBaseline, hints, 3000, attemptGuard);
      if (confirmation) return finishOwnedDeleteConfirmation("gemini", confirmation, hints, 6500, attemptGuard);
      if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "gemini", "delete confirmation ownership is uncertain");
    }
    if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "gemini", "delete confirmation ownership is uncertain");
    const stillOpenItem = findGeminiDeleteMenuItem(null, data);
    if (!stillOpenItem) return deleteResult(false, "gemini", activated
      ? "delete confirmation button not found"
      : "delete menu item activation failed");
    if (!attemptGuard() || !armDeleteConfirmationLease("gemini", data, "delete-confirmation", confirmationBaseline)) {
      return deleteResult(false, "gemini", "delete menu item requires trusted input; trusted retry ownership unavailable");
    }
    return deleteResultWithTrustedMenuClick("gemini", "delete menu item did not open confirmation", stillOpenItem);
  }

  async function deleteGeminiThread(data = {}) {
    const hints = officialHints(data);
    if (data?.trustedMenuClickRetried) {
      const lease = consumeDeleteConfirmationLease("gemini", data);
      if (!lease) return deleteResult(false, "gemini", "trusted menu click does not match the pending attempt");
      const attemptGuard = deleteAttemptRouteGuard(data, lease.href);
      if (!attemptGuard) return deleteResult(false, "gemini", "trusted menu click route ownership changed");
      if (lease.phase === "delete-confirmation") {
        const confirmation = deleteConfirmationOwnership(lease.baseline, hints, attemptGuard)
          || await waitForOwnedDeleteConfirmation(lease.baseline, hints, 3000, attemptGuard);
        if (!confirmation) return deleteResult(false, "gemini", deleteConfirmationAlreadyOpen(hints)
          ? "delete confirmation ownership is uncertain"
          : "trusted delete menu click did not open confirmation");
        return finishOwnedDeleteConfirmation("gemini", confirmation, hints, 6500, attemptGuard);
      }
      if (lease.phase !== "conversation-menu") {
        return deleteResult(false, "gemini", "trusted menu click phase is invalid");
      }
      if (deleteConfirmationAlreadyOpen(hints)) {
        return deleteResult(false, "gemini", "unverified delete confirmation appeared before delete activation");
      }
      const openItem = await waitForModel(() => findGeminiDeleteMenuItem(null, data), 3000, 90);
      return openItem
        ? activateGeminiDeleteItem(openItem, data, hints, attemptGuard)
        : deleteResult(false, "gemini", "trusted conversation menu click did not open delete menu");
    }
    const attemptGuard = deleteAttemptRouteGuard(data);
    pendingDeleteConfirmationLeases.delete("gemini");
    if (!attemptGuard || !attemptGuard()) return deleteResult(false, "gemini", "stable delete attempt and route identity not found");
    if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "gemini", "unverified delete confirmation is already open");
    const trigger = geminiDeleteConversationActionButton(data);
    if (!trigger) return deleteResult(false, "gemini", "conversation menu trigger not found");
    const item = await resolveGeminiDeleteMenuItem(trigger, data);
    if (item) return activateGeminiDeleteItem(item, data, hints, attemptGuard);
    if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "gemini", "unverified delete confirmation appeared before delete activation");
    if (!attemptGuard() || !armDeleteConfirmationLease("gemini", data, "conversation-menu", new Set(deleteDialogRoots(hints.dialog)))) {
      return deleteResult(false, "gemini", "delete menu item not found; trusted retry ownership unavailable");
    }
    return deleteResultWithTrustedMenuClick("gemini", "delete menu item not found", trigger);
  }

  function findNotionDeleteMenuTrigger(data = {}) {
    const selectors = [
      ...officialSelectors(data, "menuTrigger"),
      "button[aria-label*='Delete, rename, and more' i]",
      "[role='button'][aria-label*='Delete, rename, and more' i]",
      "button[aria-label*='delete, rename' i]",
      "[role='button'][aria-label*='delete, rename' i]",
      "button[aria-label*='删除'][aria-label*='重命名']",
      "[role='button'][aria-label*='删除'][aria-label*='重命名']",
      "button[aria-label*='more' i][aria-haspopup='menu']",
      "[role='button'][aria-label*='more' i][aria-haspopup='menu']"
    ];
    return topRightMenuTrigger({ selectors, labels: ["Delete, rename, and more", "More", "更多", "删除", "重命名"] });
  }

  const NOTION_DELETE_MENU_ROOT_SELECTORS = [
    "[role='menu']",
    "[role='listbox']",
    "[role='dialog']",
    "[data-radix-menu-content]",
    "[data-radix-popper-content-wrapper]",
    "[data-floating-ui-portal]",
    "[data-slot='dropdown-menu-content']",
    "[class*='dropdown' i]",
    "[class*='popover' i]",
    "[class*='popper' i]"
  ];
  const NOTION_DELETE_LABELS = ["Delete", "Delete topic", "删除", "删除话题"];

  function notionDeleteLabelMatchesExact(value) {
    if (deleteLabelMatchesExactish(value, NOTION_DELETE_LABELS)) return true;
    let token = deleteCompactToken(value);
    if (!token) return false;
    const allowed = NOTION_DELETE_LABELS
      .map(deleteCompactToken)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    let parts = 0;
    while (token && parts < 8) {
      const next = allowed.find((label) => token.startsWith(label));
      if (!next) return false;
      token = token.slice(next.length);
      parts += 1;
    }
    return parts > 0 && !token;
  }

  function notionDeleteTargetLabelMatchesExact(target) {
    if (!target) return false;
    const semanticValues = [
      target.getAttribute?.("aria-label"),
      target.getAttribute?.("title"),
      target.innerText,
      target.textContent
    ].map((value) => String(value || "").trim()).filter(Boolean);
    if (semanticValues.length) return semanticValues.every(notionDeleteLabelMatchesExact);
    return notionDeleteLabelMatchesExact(deleteElementText(target));
  }

  function notionDeleteLinkedMenuRoot(trigger = null) {
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (!controlsId) return null;
    try { return document.getElementById(controlsId) || null; } catch { return null; }
  }

  function notionDeleteMenuRoots(trigger = null, data = {}) {
    const roots = [];
    const seen = new Set();
    const confirmationRoots = deleteDialogRoots();
    const add = (root) => {
      if (!root || root === trigger || seen.has(root) || !root.isConnected || !visible(root)) return;
      if (trigger && (root.contains?.(trigger) || trigger.contains?.(root))) return;
      if (confirmationRoots.some((dialog) => dialog === root || dialog.contains?.(root) || root.contains?.(dialog))) return;
      const rect = modelRect(root);
      if (!rect || rect.width < 48 || rect.height < 20 || rect.width > 640 || rect.height > 720) return;
      seen.add(root);
      roots.push(root);
    };
    add(notionDeleteLinkedMenuRoot(trigger));
    visibleSelectorElements([...NOTION_DELETE_MENU_ROOT_SELECTORS, ...officialSelectors(data, "menuRoot")]).forEach(add);
    return roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
  }

  function notionDeleteItemCenterIsTopmost(element) {
    const rect = modelRect(element);
    if (!element || !rect) return false;
    const pointTarget = modelElementFromPoint({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    }, element);
    return Boolean(pointTarget && (pointTarget === element || element.contains?.(pointTarget)));
  }

  function findNotionDeleteMenuItem(root, trigger = null, data = {}) {
    if (!root || !root.isConnected || !visible(root)) return null;
    const candidates = [];
    const seen = new Set();
    const add = (element, extraScore = 0) => {
      if (!element || element === trigger || seen.has(element) || !visible(element) || isDisabledElement(element)) return;
      const target = deleteClickableElement(element);
      if (!target || target === trigger || target === root || seen.has(target) || !root?.contains?.(target)) return;
      if (!visible(target) || isDisabledElement(target)) return;
      if (!notionDeleteTargetLabelMatchesExact(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 8 || rect.height < 8 || rect.width > 520 || rect.height > 120) return;
      if (!notionDeleteItemCenterIsTopmost(target)) return;
      seen.add(element);
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore + (matches(target, "[role='menuitem'],[role='option'],button,[role='button']") ? 240 : 0),
        top: rect.top,
        area: rect.width * rect.height
      });
    };
    for (const selector of officialSelectors(data, "deleteCandidate")) {
      for (const element of qsa(selector, root, { all: true })) add(element, 520);
    }
    for (const element of qsa("[role='menuitem'],[role='option'],button,[role='button'],[tabindex]:not([tabindex='-1']),li,div,span", root, { all: true })) {
      add(element, 320);
    }
    candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.area - b.area);
    return candidates[0]?.element || null;
  }

  function notionDeleteMenuSession(trigger, baselineRoots = new Set(), data = {}) {
    const linkedRoot = notionDeleteLinkedMenuRoot(trigger);
    for (const root of notionDeleteMenuRoots(trigger, data)) {
      if (root !== linkedRoot && baselineRoots.has(root)) continue;
      const item = findNotionDeleteMenuItem(root, trigger, data);
      if (item) return { root, item };
    }
    return null;
  }

  function refreshNotionDeleteMenuSession(session, trigger, data = {}) {
    const root = session?.root || null;
    if (!root || !root.isConnected || !visible(root)) return null;
    if (!notionDeleteMenuRoots(trigger, data).includes(root)) return null;
    const item = findNotionDeleteMenuItem(root, trigger, data);
    return item ? { root, item } : null;
  }

  function notionDeleteConversationId() {
    try {
      const url = new URL(String(location.href || ""));
      const host = url.hostname.toLowerCase();
      if (!(host === "app.notion.com" || host === "notion.so" || host.endsWith(".notion.so"))) return "";
      return /^\/chat\/?$/i.test(url.pathname || "/") ? String(url.searchParams.get("t") || "") : "";
    } catch {
      return "";
    }
  }

  function notionDeleteRouteGuard(data = {}) {
    const expected = data?.expectedDeleteIdentity;
    const expectedId = expected
      ? (expected.provider === "notion" ? String(expected.id || "").trim() : "")
      : notionDeleteConversationId();
    return () => Boolean(expectedId) && notionDeleteConversationId() === expectedId;
  }

  async function openNotionDeleteMenu(trigger, routeStillCurrent, data = {}) {
    const baselineRoots = new Set(notionDeleteMenuRoots(trigger, data));
    if (!routeStillCurrent()) return null;
    const session = await deleteActivateUntil(
      trigger,
      () => routeStillCurrent() && notionDeleteMenuSession(trigger, baselineRoots, data),
      { settleMs: 220 }
    );
    if (!session || !routeStillCurrent()) return null;
    await sleep(120);
    return waitForModel(() => routeStillCurrent() && refreshNotionDeleteMenuSession(session, trigger, data), 1800, 80);
  }

  function notionDeleteConfirmationOwnership(baselineRoots = null, hints = {}) {
    const button = findDeleteConfirmButton(hints);
    if (!button || !button.isConnected || !visible(button)) return null;
    const root = deleteDialogRoots(hints.dialog).find((candidate) => candidate === button || candidate.contains?.(button)) || null;
    if (!root || !root.isConnected || !visible(root) || baselineRoots?.has(root)) return null;
    return { root, button };
  }

  function notionDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent, hints = {}) {
    const root = ownership?.root || null;
    const button = ownership?.button || null;
    if (!root || !button || !routeStillCurrent()) return false;
    if (!root.isConnected || !button.isConnected || !visible(root) || !visible(button) || !root.contains?.(button)) return false;
    if (findDeleteConfirmButton(hints) !== button) return false;
    return deleteDialogRoots(hints.dialog).some((candidate) => candidate === root);
  }

  async function waitForNotionDeleteMenuOutcome(session, trigger, routeStillCurrent, confirmationBaseline, timeoutMs = 1800, data = {}) {
    const hints = officialHints(data);
    const confirmation = await waitForModel(() => {
      if (!routeStillCurrent()) return null;
      return notionDeleteConfirmationOwnership(confirmationBaseline, hints);
    }, timeoutMs, 90);
    if (!routeStillCurrent()) return { state: "route-changed", item: null };
    if (confirmation) return { state: "confirmation", confirmation };
    const currentSession = refreshNotionDeleteMenuSession(session, trigger, data);
    return currentSession ? { state: "menu-open", session: currentSession } : { state: "uncertain" };
  }

  async function finishNotionDeleteConfirmation(ownership, routeStillCurrent, hints = {}) {
    const ownershipGuard = () => notionDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent, hints);
    if (!ownershipGuard()) return deleteResult(false, "notion", "delete confirmation ownership is uncertain");
    const confirmed = await clickDeleteConfirmIfPresent(6500, ownershipGuard, hints);
    if (confirmed) return deleteResult(true, "notion");
    if (!routeStillCurrent()) return deleteResult(false, "notion", "current conversation changed during delete confirmation");
    if (!ownershipGuard()) return deleteResult(false, "notion", "delete confirmation ownership changed");
    return deleteResultWithTrustedConfirm("notion", "delete confirmation did not close");
  }

  async function deleteNotionThread(data = {}) {
    const hints = officialHints(data);
    if (!data?.trustedMenuClickRetried) pendingDeleteConfirmationLeases.delete("notion");
    const routeStillCurrent = notionDeleteRouteGuard(data);
    if (!routeStillCurrent()) {
      return deleteResult(false, "notion", "stable current conversation identity not found");
    }
    if (data?.trustedMenuClickRetried) {
      const lease = consumeDeleteConfirmationLease("notion", data);
      if (!lease || lease.phase !== "delete-confirmation") {
        return deleteResult(false, "notion", "trusted delete menu click does not match the pending attempt");
      }
      const leasedRouteStillCurrent = deleteAttemptRouteGuard(data, lease.href);
      if (!leasedRouteStillCurrent) {
        return deleteResult(false, "notion", "trusted delete menu click route ownership changed");
      }
      if (visible(lease.metadata?.menuRoot) || visible(lease.metadata?.item)) {
        return deleteResult(false, "notion", "trusted delete menu click did not activate the leased Delete item");
      }
      const confirmation = notionDeleteConfirmationOwnership(lease.baseline, hints)
        || await waitForModel(() => leasedRouteStillCurrent() && notionDeleteConfirmationOwnership(lease.baseline, hints), 3000, 90);
      if (!routeStillCurrent()) return deleteResult(false, "notion", "current conversation changed during trusted delete menu click");
      if (confirmation) return finishNotionDeleteConfirmation(confirmation, leasedRouteStillCurrent, hints);
      if (findDeleteConfirmButton(hints) || deleteDialogRoots(hints.dialog).length) {
        return deleteResult(false, "notion", "delete confirmation ownership is uncertain");
      }
      return deleteResult(false, "notion", "trusted delete menu click did not open an owned confirmation");
    }
    if (findDeleteConfirmButton(hints) || deleteDialogRoots(hints.dialog).length) {
      return deleteResult(false, "notion", "unverified delete confirmation is already open");
    }
    const trigger = findNotionDeleteMenuTrigger(data);
    if (!trigger) return deleteResult(false, "notion", "conversation menu trigger not found");
    let session = await openNotionDeleteMenu(trigger, routeStillCurrent, data);
    if (!session) return deleteResult(false, "notion", routeStillCurrent() ? "owned delete menu item not found" : "current conversation changed before delete menu opened");
    await sleep(120);
    session = refreshNotionDeleteMenuSession(session, trigger, data);
    if (!session || !routeStillCurrent()) {
      return deleteResult(false, "notion", routeStillCurrent() ? "owned delete menu item changed before activation" : "current conversation changed before delete activation");
    }
    if (findDeleteConfirmButton(hints) || deleteDialogRoots(hints.dialog).length) {
      return deleteResult(false, "notion", "unverified delete confirmation appeared before delete activation");
    }
    const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
    deleteClick(session.item) || deleteClickLayout(session.item);
    const outcome = await waitForNotionDeleteMenuOutcome(session, trigger, routeStillCurrent, confirmationBaseline, 1800, data);
    if (outcome.state === "confirmation") return finishNotionDeleteConfirmation(outcome.confirmation, routeStillCurrent, hints);
    if (outcome.state === "menu-open") {
      if (
        !routeStillCurrent()
        || !armDeleteConfirmationLease("notion", data, "delete-confirmation", confirmationBaseline, {
          trigger,
          menuRoot: outcome.session.root,
          item: outcome.session.item
        })
      ) {
        return deleteResult(false, "notion", "delete menu item requires trusted input; trusted retry ownership unavailable");
      }
      return deleteResultWithTrustedMenuClick("notion", "delete menu item did not open confirmation", outcome.session.item);
    }
    if (outcome.state === "route-changed") return deleteResult(false, "notion", "current conversation changed after delete activation");
    return deleteResult(false, "notion", "delete menu item outcome is uncertain");
  }

  return Object.freeze({
    deleteKagiThread,
    deleteChatGptThread,
    deleteGrokThread,
    deleteGeminiThread,
    deleteNotionThread,
    deleteClaudeThread,
    menuRootsWithDelete,
    findDeleteMenuItem,
    findOpenDeleteMenuItem
  });
}
