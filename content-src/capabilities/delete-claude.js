export function createDeleteClaudeCapability(deps = {}) {
  const {
    qsa,
    normalize,
    deleteCompactToken,
    modelRect,
    deleteClickableElement,
    isDisabledElement,
    visible,
    deleteLabelMatchesExactish,
    deleteClickLayout,
    sleep,
    deleteClick,
    findDeleteConfirmButton,
    deleteResult,
    deleteDialogRoots,
    modelElementArea,
    modelElementFromPoint,
    waitForModel,
    deleteResultWithTrustedMenuClick
  } = deps;
  const CLAUDE_CHAT_TITLE_ROOT_SELECTOR = "[data-testid='chat-title-split']";
  const CLAUDE_DELETE_LABELS = ["Delete chat", "Delete", "删除聊天", "删除"];
  const CLAUDE_DELETE_MENU_SHORTCUT_COMPACT_VALUES = new Set(["DeleteD", "deleteD", "删除D"]);
  const CLAUDE_PRIVATE_USE_PATTERN = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;
  const CLAUDE_ZERO_WIDTH_PATTERN = /[\u200B-\u200F\u2060\uFEFF]/g;
  const CLAUDE_WRONG_DELETE_TARGET_PATTERN = /\b(?:delete|remove)\b[^\n]{0,48}\b(?:project|account|workspace)\b|(?:删除|移除)[^\n]{0,24}(?:项目|账户|帐号|账号|工作区)/i;
  const CLAUDE_DELETE_CONFIRMATION_HEADING = "Delete chat";
  const CLAUDE_DELETE_CONFIRMATION_PROMPT = "Are you sure you want to delete this chat?";
  let claudeTrustedDeleteLease = null;

  function claudeLabelText(value) {
    return normalize(String(value || "")
      .replace(CLAUDE_PRIVATE_USE_PATTERN, " ")
      .replace(CLAUDE_ZERO_WIDTH_PATTERN, " "));
  }

  function claudeConversationIdFromHref(value = location.href) {
    try {
      const url = new URL(String(value || ""), location.origin);
      const host = String(url.hostname || "").toLowerCase();
      if (url.protocol !== "https:" || !(host === "claude.ai" || host.endsWith(".claude.ai"))) return "";
      const match = String(url.pathname || "").match(/^\/chat\/([^/]+)\/?$/);
      if (!match) return "";
      const id = decodeURIComponent(match[1]).trim();
      return id && !/[/?#]/.test(id) ? id : "";
    } catch {
      return "";
    }
  }

  function claudeDeleteRouteGuard(data = {}) {
    const expected = data?.expectedDeleteIdentity;
    const currentId = claudeConversationIdFromHref();
    const expectedId = expected
      ? (String(expected.provider || "").toLowerCase() === "claude" ? String(expected.id || "").trim() : "")
      : currentId;
    return () => Boolean(expectedId) && claudeConversationIdFromHref() === expectedId;
  }

  function claudeChatTitleRoot() {
    const roots = qsa(CLAUDE_CHAT_TITLE_ROOT_SELECTOR, document, { all: true }).filter((root) => {
      if (!root?.isConnected || !visible(root)) return false;
      const box = modelRect(root);
      return Boolean(box && box.width >= 40 && box.height >= 12 && box.height <= 180);
    });
    return roots.length === 1 ? roots[0] : null;
  }

  function claudeConversationTitleFromMenuLabel(value) {
    const match = String(value || "").trim().match(/^More options for\s+(.+)$/i);
    return match ? normalize(match[1]) : "";
  }

  function claudeTitleEvidenceMatches(root, trigger, title) {
    const wanted = normalize(title).toLowerCase();
    if (!wanted) return false;
    const triggerBox = modelRect(trigger);
    if (!triggerBox) return false;
    const allowed = new Set([
      wanted,
      `${wanted}, rename chat`,
      `${wanted}, rename conversation`,
      `${wanted} rename chat`,
      `${wanted} rename conversation`
    ]);
    return qsa("[aria-label],[title],button,[role='button']", root, { all: true }).some((node) => {
      if (!node || node === trigger || trigger?.contains?.(node) || node.contains?.(trigger)) return false;
      if (!node.isConnected || !visible(node)) return false;
      const box = modelRect(node);
      if (!box || box.width < 8 || box.height < 8) return false;
      const verticalOverlap = Math.min(box.bottom, triggerBox.bottom) - Math.max(box.top, triggerBox.top);
      if (verticalOverlap < Math.min(box.height, triggerBox.height) * 0.3) return false;
      const values = [
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.innerText,
        node.textContent
      ].map((value) => normalize(value).toLowerCase()).filter(Boolean);
      return values.some((value) => allowed.has(value));
    });
  }

  function claudeConversationMenuTrigger() {
    const root = claudeChatTitleRoot();
    if (!root) return null;
    const candidates = [];
    const seen = new Set();
    for (const node of qsa("button[aria-label],[role='button'][aria-label]", root, { all: true })) {
      const label = String(node.getAttribute?.("aria-label") || "").trim();
      const title = claudeConversationTitleFromMenuLabel(label);
      if (!title) continue;
      const target = deleteClickableElement(node);
      if (!target || target === root || seen.has(target) || !root.contains?.(target)) continue;
      if (!target.isConnected || !visible(target) || isDisabledElement(target)) continue;
      const targetLabel = String(target.getAttribute?.("aria-label") || "").trim();
      const targetTitle = claudeConversationTitleFromMenuLabel(targetLabel);
      if (!targetTitle || normalize(targetTitle).toLowerCase() !== normalize(title).toLowerCase()) continue;
      if (!claudeTitleEvidenceMatches(root, target, title)) continue;
      const box = modelRect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 120 || box.height > 96) continue;
      seen.add(target);
      candidates.push(target);
    }
    return candidates.length === 1 ? candidates[0] : null;
  }

  function claudeMenuBindingIds(trigger = null) {
    const byAttribute = ["aria-controls", "aria-owns"].map((name) => ({
      name,
      ids: String(trigger?.getAttribute?.(name) || "").trim().split(/\s+/).filter(Boolean)
    }));
    const ids = byAttribute.flatMap((entry) => entry.ids);
    return {
      byAttribute,
      ids,
      key: byAttribute.map((entry) => `${entry.name}:${entry.ids.join(" ")}`).join("|")
    };
  }

  function claudeLinkedDeleteMenuRoot(trigger = null) {
    const binding = claudeMenuBindingIds(trigger);
    if (!binding.ids.length) return null;
    const roots = new Set();
    try {
      for (const id of binding.ids) {
        const root = document.getElementById(id) || null;
        if (!root || String(root.id || "") !== id) return null;
        roots.add(root);
      }
    } catch {
      return null;
    }
    return roots.size === 1 ? [...roots][0] : null;
  }

  function claudeDeleteMenuRoots(trigger = null) {
    const roots = [];
    const seen = new Set();
    const confirmationRoots = deleteDialogRoots();
    const add = (root) => {
      if (!root || root === trigger || seen.has(root) || !root.isConnected || !visible(root)) return;
      if (trigger && (root.contains?.(trigger) || trigger.contains?.(root))) return;
      if (confirmationRoots.some((dialog) => dialog === root || dialog.contains?.(root) || root.contains?.(dialog))) return;
      const box = modelRect(root);
      if (!box || box.width < 48 || box.height < 20 || box.width > 640 || box.height > 720) return;
      seen.add(root);
      roots.push(root);
    };
    // Claude exposes multiple identical conversation menus (for example, title
    // and sidebar-row menus). Only the root explicitly controlled by the unique
    // current-title trigger is an authenticated target for this attempt.
    add(claudeLinkedDeleteMenuRoot(trigger));
    return roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
  }

  function claudeDeleteLabelMatchesExact(value) {
    const text = claudeLabelText(value);
    if (!text || CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text)) return false;
    return deleteLabelMatchesExactish(text, CLAUDE_DELETE_LABELS);
  }

  function claudeDeleteMenuLabelMatchesExact(value) {
    const text = claudeLabelText(value);
    if (claudeDeleteLabelMatchesExact(text)) return true;
    if (!text || CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text)) return false;
    return /^(?:delete(?:\s+chat)?|删除(?:聊天)?)\s+d$/i.test(text);
  }

  function claudeDeleteMenuShortcutTokenMatches(value) {
    const compactValue = claudeLabelText(value).replace(/[^A-Za-z0-9\u4E00-\u9FFF]+/g, "");
    return CLAUDE_DELETE_MENU_SHORTCUT_COMPACT_VALUES.has(compactValue);
  }

  function claudeMenuSemanticTokens(target) {
    return [
      target?.getAttribute?.("aria-label"),
      target?.getAttribute?.("title"),
      target?.innerText,
      target?.textContent
    ].map((value) => deleteCompactToken(claudeLabelText(value))).filter(Boolean);
  }

  function claudeDeleteMenuHasConversationFingerprint(root, deleteItem) {
    const readStateTargets = new Set();
    const conversationActionTargets = new Set();
    for (const node of qsa("[role='menuitem'],[role='option'],button,[role='button']", root, { all: true })) {
      const target = deleteClickableElement(node);
      if (!target || target === deleteItem || !root.contains?.(target) || !target.isConnected || !visible(target) || isDisabledElement(target)) continue;
      for (const token of claudeMenuSemanticTokens(target)) {
        if (/^(?:markasunread|markasread)u?$/.test(token) || /^(?:标记为未读|标记为已读)u?$/.test(token)) {
          readStateTargets.add(target);
        }
        if (/^(?:star|unstar)p?$/.test(token)
          || /^rename(?:chat|conversation)?r?$/.test(token)
          || token === "addtoproject"
          || /^(?:加星|取消加星)p?$/.test(token)
          || /^重命名(?:聊天|对话)?r?$/.test(token)
          || token === "添加到项目") {
          conversationActionTargets.add(target);
        }
      }
    }
    return [...readStateTargets].some((readTarget) => [...conversationActionTargets].some((actionTarget) => actionTarget !== readTarget));
  }

  function claudeDeleteMenuTargetLabelMatchesExact(target) {
    if (!target) return false;
    const semanticValues = [
      target.getAttribute?.("aria-label"),
      target.getAttribute?.("title"),
      target.innerText,
      target.textContent
    ].map((value) => String(value || "").trim()).filter(Boolean);
    if (!semanticValues.length) return false;
    const hasRawShortcutEvidence = semanticValues.some((value) => {
      const text = claudeLabelText(value);
      return Boolean(text)
        && !CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text)
        && /^(?:delete(?:\s+chat)?|删除(?:聊天)?)\s+d$/i.test(text);
    });
    return semanticValues.every((value) => claudeDeleteMenuLabelMatchesExact(value)
      || (hasRawShortcutEvidence && claudeDeleteMenuShortcutTokenMatches(value)));
  }

  function claudeDeleteTargetIsTopmost(node) {
    const box = modelRect(node);
    if (!node || !box) return false;
    const pointTarget = modelElementFromPoint({
      x: box.left + box.width / 2,
      y: box.top + box.height / 2
    }, node);
    return Boolean(pointTarget && (pointTarget === node || node.contains?.(pointTarget)));
  }

  function findClaudeDeleteMenuItem(root, trigger = null) {
    if (!root || !root.isConnected || !visible(root)) return null;
    const candidates = [];
    const seen = new Set();
    for (const node of qsa("[role='menuitem'],[role='option'],button,[role='button']", root, { all: true })) {
      const target = deleteClickableElement(node);
      if (!target || target === root || target === trigger || seen.has(target) || !root.contains?.(target)) continue;
      if (!target.isConnected || !visible(target) || isDisabledElement(target)) continue;
      if (!claudeDeleteMenuTargetLabelMatchesExact(target)) continue;
      const box = modelRect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 520 || box.height > 120) continue;
      if (!claudeDeleteTargetIsTopmost(target)) continue;
      seen.add(target);
      candidates.push(target);
    }
    if (candidates.length !== 1) return null;
    return claudeDeleteMenuHasConversationFingerprint(root, candidates[0]) ? candidates[0] : null;
  }

  function claudeDeleteMenuShortcutTargetMatches(target) {
    if (!claudeDeleteMenuTargetLabelMatchesExact(target)) return false;
    return [
      target?.getAttribute?.("aria-label"),
      target?.getAttribute?.("title"),
      target?.innerText,
      target?.textContent
    ].some((value) => {
      const text = claudeLabelText(value);
      return Boolean(text)
        && !CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text)
        && /^(?:delete(?:\s+chat)?|删除(?:聊天)?)\s+d$/i.test(text);
    });
  }

  function findClaudeDeleteMenuShortcutItem(root, trigger = null) {
    if (!root || !root.isConnected || !visible(root)) return null;
    const candidates = [];
    const seen = new Set();
    for (const node of qsa("[role='menuitem'],[role='option'],button,[role='button']", root, { all: true })) {
      const target = deleteClickableElement(node);
      if (!target || target === root || target === trigger || seen.has(target) || !root.contains?.(target)) continue;
      if (!target.isConnected || !visible(target) || isDisabledElement(target)) continue;
      if (!claudeDeleteMenuShortcutTargetMatches(target)) continue;
      const box = modelRect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 520 || box.height > 120) continue;
      seen.add(target);
      candidates.push(target);
    }
    if (candidates.length !== 1) return null;
    return claudeDeleteMenuHasConversationFingerprint(root, candidates[0]) ? candidates[0] : null;
  }

  function claudeOwnedDeleteMenuRoots(trigger = null) {
    return new Set(
      claudeDeleteMenuRoots(trigger).filter((root) => Boolean(findClaudeDeleteMenuItem(root, trigger)))
    );
  }

  function claudeShortcutDeleteMenuRoots(trigger = null) {
    return new Set(
      claudeDeleteMenuRoots(trigger).filter((root) => Boolean(findClaudeDeleteMenuShortcutItem(root, trigger)))
    );
  }

  function claudeDeleteMenuSession(trigger, baselineRoots = new Set()) {
    const sessionsByItem = new Map();
    for (const root of claudeDeleteMenuRoots(trigger)) {
      if (baselineRoots.has(root)) continue;
      const item = findClaudeDeleteMenuItem(root, trigger);
      if (!item) continue;
      const existing = sessionsByItem.get(item);
      if (!existing || modelElementArea(root) < modelElementArea(existing.root)) sessionsByItem.set(item, { root, item });
    }
    const sessions = [...sessionsByItem.values()];
    return sessions.length === 1 ? sessions[0] : null;
  }

  function claudeDeleteMenuShortcutSession(trigger, baselineRoots = new Set()) {
    const sessionsByItem = new Map();
    for (const root of claudeDeleteMenuRoots(trigger)) {
      if (baselineRoots.has(root)) continue;
      const item = findClaudeDeleteMenuShortcutItem(root, trigger);
      if (!item) continue;
      const existing = sessionsByItem.get(item);
      if (!existing || modelElementArea(root) < modelElementArea(existing.root)) sessionsByItem.set(item, { root, item });
    }
    const sessions = [...sessionsByItem.values()];
    return sessions.length === 1 ? sessions[0] : null;
  }

  function refreshClaudeDeleteMenuSession(session, trigger) {
    const root = session?.root || null;
    if (!root || !root.isConnected || !visible(root)) return null;
    if (!claudeDeleteMenuRoots(trigger).includes(root)) return null;
    const item = findClaudeDeleteMenuItem(root, trigger);
    return item ? { root, item } : null;
  }

  function refreshClaudeDeleteMenuShortcutSession(session, trigger) {
    const root = session?.root || null;
    const expectedItem = session?.item || null;
    if (!root || !expectedItem || !root.isConnected || !visible(root)) return null;
    if (!claudeDeleteMenuRoots(trigger).includes(root)) return null;
    const item = findClaudeDeleteMenuShortcutItem(root, trigger);
    return item && item === expectedItem ? { root, item } : null;
  }

  function claudeExactActionLabelMatches(target, expectedLabel) {
    if (!target) return false;
    const values = [
      target.getAttribute?.("aria-label"),
      target.getAttribute?.("title"),
      target.innerText,
      target.textContent
    ].map(claudeLabelText).filter(Boolean);
    return Boolean(values.length) && values.every((value) => value === expectedLabel);
  }

  function claudeDeleteConfirmationDetails(root) {
    if (!root || !root.isConnected || !visible(root)) return null;
    const headings = qsa("h1,h2,h3,h4,[role='heading']", root, { all: true })
      .filter((node) => node?.isConnected && visible(node))
      .filter((node) => claudeLabelText(node.innerText || node.textContent) === CLAUDE_DELETE_CONFIRMATION_HEADING);
    if (headings.length !== 1) return null;
    const rootText = claudeLabelText(root.innerText || root.textContent);
    if (CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(rootText) || !rootText.includes(CLAUDE_DELETE_CONFIRMATION_PROMPT)) return null;
    const actions = [];
    const seen = new Set();
    for (const node of qsa("button,[role='button']", root, { all: true })) {
      const target = deleteClickableElement(node);
      if (!target || seen.has(target) || !root.contains?.(target)) continue;
      if (!target.isConnected || !visible(target) || isDisabledElement(target)) continue;
      const box = modelRect(target);
      if (!box || box.width < 12 || box.height < 10 || box.width > 420 || box.height > 120) continue;
      seen.add(target);
      actions.push(target);
    }
    const cancelButtons = actions.filter((target) => claudeExactActionLabelMatches(target, "Cancel"));
    const deleteButtons = actions.filter((target) => claudeExactActionLabelMatches(target, "Delete"));
    if (cancelButtons.length !== 1 || deleteButtons.length !== 1 || cancelButtons[0] === deleteButtons[0]) return null;
    return { button: deleteButtons[0], cancelButton: cancelButtons[0] };
  }

  function claudeDeleteConfirmationOwnerships(baselineRoots = new Set()) {
    const ownedByButton = new Map();
    for (const root of deleteDialogRoots()) {
      if (!root || baselineRoots.has(root) || !root.isConnected || !visible(root)) continue;
      const details = claudeDeleteConfirmationDetails(root);
      if (!details) continue;
      const { button, cancelButton } = details;
      const existing = ownedByButton.get(button);
      if (!existing || modelElementArea(root) < modelElementArea(existing.root)) {
        ownedByButton.set(button, { root, button, cancelButton, baselineRoots });
      }
    }
    return [...ownedByButton.values()];
  }

  function claudeLeaseCoreIsCurrent(lease, routeStillCurrent) {
    return Boolean(
      lease?.attemptId
      && claudeTrustedDeleteLease === lease
      && lease.documentRef === document
      && lease.routeId === claudeConversationIdFromHref()
      && Number(lease.expiresAt) >= Date.now()
      && routeStillCurrent()
    );
  }

  function claudeReleaseActiveDeleteLease(lease) {
    if (claudeTrustedDeleteLease !== lease) return;
    claudeDisposeTrustedDeleteKeyObserver(lease);
    claudeTrustedDeleteLease = null;
  }

  function claudeLeaseOriginalMenuClosed(lease, routeStillCurrent) {
    if (!lease?.trigger || !lease?.menuRoot || !lease?.item) return false;
    if (!claudeLeaseCoreIsCurrent(lease, routeStillCurrent)) return false;
    if (claudeConversationMenuTrigger() !== lease.trigger) return false;
    const binding = claudeMenuBindingIds(lease.trigger);
    if (String(lease.trigger.getAttribute?.("aria-expanded") || "").trim().toLowerCase() !== "false") return false;
    if (binding.ids.length) {
      if (binding.key !== lease.menuBindingKey) return false;
      try {
        for (const id of binding.ids) {
          const current = document.getElementById?.(id) || null;
          if (current !== lease.menuRoot) return false;
        }
      } catch {
        return false;
      }
    }
    return !visible(lease.menuRoot) && !visible(lease.item);
  }

  function claudeLeaseObservedTrustedDeleteShortcut(lease) {
    if (lease?.activationKind !== "shortcut") return true;
    const observer = lease.trustedKeyObserver;
    return Boolean(observer?.observed && !observer.invalid && Number(observer.observedAt) >= Number(observer.installedAt));
  }

  function claudeDeleteConfirmationOwnershipForLease(lease, routeStillCurrent) {
    if (!claudeLeaseOriginalMenuClosed(lease, routeStillCurrent)) return null;
    if (!claudeLeaseObservedTrustedDeleteShortcut(lease) || lease.confirmationAmbiguous) return null;
    if (lease.frozenConfirmation) {
      return claudeDeleteConfirmationOwnershipIsCurrent(lease.frozenConfirmation, routeStillCurrent)
        ? lease.frozenConfirmation
        : null;
    }
    const ownerships = claudeDeleteConfirmationOwnerships(lease?.confirmationBaseline);
    if (ownerships.length > 1) {
      lease.confirmationAmbiguous = true;
      return null;
    }
    const ownership = ownerships.length === 1 ? ownerships[0] : null;
    const active = document.activeElement || null;
    if (!ownership || !active || !ownership.root.contains?.(active)) return null;
    const frozen = { ...ownership, lease };
    lease.frozenConfirmation = frozen;
    return frozen;
  }

  function claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent) {
    const root = ownership?.root || null;
    const button = ownership?.button || null;
    const cancelButton = ownership?.cancelButton || null;
    const lease = ownership?.lease || null;
    if (!root || !button || !cancelButton || lease?.frozenConfirmation !== ownership) return false;
    if (!claudeLeaseOriginalMenuClosed(lease, routeStillCurrent)) return false;
    if (!claudeLeaseObservedTrustedDeleteShortcut(lease) || lease.confirmationAmbiguous) return false;
    if (!root.isConnected || !button.isConnected || !cancelButton.isConnected || !visible(root) || !visible(button) || !visible(cancelButton)) return false;
    if (!root.contains?.(button) || !root.contains?.(cancelButton)) return false;
    if (!root.contains?.(document.activeElement || null)) return false;
    if (ownership.baselineRoots?.has(root)) return false;
    const details = claudeDeleteConfirmationDetails(root);
    if (!details || details.button !== button || details.cancelButton !== cancelButton) return false;
    const currentOwnerships = claudeDeleteConfirmationOwnerships(ownership.baselineRoots);
    return currentOwnerships.length === 1
      && currentOwnerships[0].root === root
      && currentOwnerships[0].button === button
      && currentOwnerships[0].cancelButton === cancelButton;
  }

  function claudeDisposeTrustedDeleteKeyObserver(lease) {
    try { lease?.trustedKeyObserver?.dispose?.(); } catch {}
  }

  function claudeInstallTrustedDeleteKeyObserver(lease, routeStillCurrent) {
    if (typeof document.addEventListener !== "function" || typeof document.removeEventListener !== "function") return null;
    const state = {
      installedAt: Date.now(),
      observedAt: 0,
      observed: false,
      invalid: false,
      disposed: false,
      dispose: null
    };
    let listening = false;
    let expiryTimer = null;
    const dispose = () => {
      if (expiryTimer != null) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
      }
      if (listening) {
        listening = false;
        document.removeEventListener("keydown", onKeyDown, true);
      }
      state.disposed = true;
    };
    const onKeyDown = (event) => {
      dispose();
      let path = [];
      try {
        const value = event?.composedPath?.();
        if (Array.isArray(value)) path = value;
      } catch {}
      const target = event?.target || null;
      const exactPath = path.includes(lease.item) && path.includes(lease.menuRoot);
      const exactTarget = Boolean(target && (target === lease.item || lease.item.contains?.(target)));
      const valid = event?.isTrusted === true
        && event.key === "d"
        && event.repeat !== true
        && event.isComposing !== true
        && Number(event.keyCode || 0) !== 229
        && !event.shiftKey
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && exactTarget
        && exactPath
        && claudeTrustedDeleteLease === lease
        && claudeLeaseCoreIsCurrent(lease, routeStillCurrent)
        && claudeConversationMenuTrigger() === lease.trigger
        && claudeLinkedDeleteMenuRoot(lease.trigger) === lease.menuRoot
        && String(lease.trigger.getAttribute?.("aria-expanded") || "").trim().toLowerCase() === "true"
        && document.hasFocus?.()
        && document.activeElement === lease.item
        && Boolean(refreshClaudeDeleteMenuShortcutSession({ root: lease.menuRoot, item: lease.item }, lease.trigger));
      if (!valid) {
        state.invalid = true;
        return;
      }
      state.observed = true;
      state.observedAt = Date.now();
    };
    state.dispose = dispose;
    try {
      document.addEventListener("keydown", onKeyDown, true);
      listening = true;
      expiryTimer = setTimeout(() => {
        state.invalid = true;
        dispose();
      }, Math.max(0, Number(lease.expiresAt) - Date.now()));
      expiryTimer?.unref?.();
      return state;
    } catch {
      dispose();
      return null;
    }
  }

  function claudeHasNewDeleteConfirmation(baselineRoots = new Set()) {
    return deleteDialogRoots().some((root) => !baselineRoots.has(root));
  }

  function claudeTrustedMenuResult(reason, element, kind) {
    const value = deleteResultWithTrustedMenuClick("claude", reason, element);
    return value?.trustedMenuClick
      ? { ...value, trustedMenuClick: { ...value.trustedMenuClick, kind } }
      : value;
  }

  function claudeTrustedDeleteShortcutResult(reason) {
    return deleteResult(false, "claude", reason, {
      needsTrustedKeySequence: true,
      trustedKeySequence: {
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        reason,
        keys: [{ key: "d", settleMs: 420 }],
        keySettleMs: 160,
        settleMs: 520
      }
    });
  }

  function claudeExactConfirmationClick(button, ownershipStillCurrent) {
    if (!button || typeof button.click !== "function") return false;
    try {
      button.focus?.({ preventScroll: true });
    } catch {
      return false;
    }
    if (!document.hasFocus?.() || document.activeElement !== button) return false;
    if (typeof ownershipStillCurrent !== "function" || ownershipStillCurrent() !== true) return false;
    try {
      button.click();
      return true;
    } catch {
      return false;
    }
  }

  async function finishClaudeDeleteConfirmation(ownership, routeStillCurrent) {
    if (!claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent)) {
      return deleteResult(false, "claude", "delete confirmation ownership is uncertain");
    }
    const root = ownership.root;
    const button = ownership.button;
    if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed before delete confirmation");
    if (!claudeExactConfirmationClick(
      button,
      () => claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent)
    )) {
      return deleteResult(false, "claude", "exact delete confirmation click was not accepted");
    }
    const closed = await waitForModel(() => !root.isConnected || !visible(root), 5200, 100);
    if (closed) return deleteResult(true, "claude");
    if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed during delete confirmation");
    if (!claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent)) {
      return deleteResult(false, "claude", "delete confirmation ownership changed");
    }
    return deleteResult(false, "claude", "delete confirmation outcome is uncertain after its one allowed click");
  }

  async function waitForClaudeDeleteOutcome(lease, trigger, routeStillCurrent, timeoutMs = 2200) {
    const confirmation = await waitForModel(() => {
      if (!routeStillCurrent()) return null;
      return claudeDeleteConfirmationOwnershipForLease(lease, routeStillCurrent);
    }, timeoutMs, 90);
    if (!routeStillCurrent()) return { state: "route-changed" };
    if (confirmation) return { state: "confirmation", confirmation };
    const session = refreshClaudeDeleteMenuSession({ root: lease.menuRoot, item: lease.item }, trigger);
    return session && session.item === lease.item
      ? { state: "menu-open", session }
      : { state: "uncertain" };
  }

  function claudeLeaseMatches(lease, data, phase, routeStillCurrent) {
    return Boolean(
      lease
      && lease.phase === phase
      && lease.attemptId
      && lease.attemptId === String(data?.deleteAttemptId || "")
      && lease.documentRef === document
      && lease.routeId === claudeConversationIdFromHref()
      && Number(lease.expiresAt) >= Date.now()
      && routeStillCurrent()
    );
  }

  function leaseClaudeTrustedDeleteShortcut(data, session, routeStillCurrent, confirmationBaseline) {
    const trigger = claudeConversationMenuTrigger();
    const current = refreshClaudeDeleteMenuShortcutSession(session, trigger);
    if (!current || !routeStillCurrent()) {
      return deleteResult(false, "claude", "owned Claude delete shortcut changed before activation");
    }
    if (claudeHasNewDeleteConfirmation(confirmationBaseline)) {
      return deleteResult(false, "claude", "unverified delete confirmation appeared before Delete D activation");
    }
    const menuBinding = claudeMenuBindingIds(trigger);
    if (
      !menuBinding.ids.length
      || claudeLinkedDeleteMenuRoot(trigger) !== current.root
      || String(trigger.getAttribute?.("aria-expanded") || "").trim().toLowerCase() !== "true"
    ) {
      return deleteResult(false, "claude", "owned Claude delete shortcut lost its title-menu binding");
    }
    claudeDisposeTrustedDeleteKeyObserver(claudeTrustedDeleteLease);
    claudeTrustedDeleteLease = {
      phase: "shortcut",
      activationKind: "shortcut",
      attemptId: String(data?.deleteAttemptId || ""),
      routeId: claudeConversationIdFromHref(),
      documentRef: document,
      trigger,
      menuRoot: current.root,
      menuBindingKey: menuBinding.key,
      item: current.item,
      confirmationBaseline,
      expiresAt: Date.now() + 12000
    };
    return claudeTrustedDeleteShortcutResult("owned Claude menu requires its Delete D shortcut");
  }

  function focusClaudeDeleteShortcutLease(lease, routeStillCurrent) {
    if (!lease?.trigger || !lease?.menuRoot || !lease?.item || !routeStillCurrent()) return null;
    if (claudeConversationMenuTrigger() !== lease.trigger) return null;
    if (claudeLinkedDeleteMenuRoot(lease.trigger) !== lease.menuRoot) return null;
    if (claudeMenuBindingIds(lease.trigger).key !== lease.menuBindingKey) return null;
    if (String(lease.trigger.getAttribute?.("aria-expanded") || "").trim().toLowerCase() !== "true") return null;
    const current = refreshClaudeDeleteMenuShortcutSession(
      { root: lease.menuRoot, item: lease.item },
      lease.trigger
    );
    if (!current || current.item !== lease.item) return null;
    try {
      current.item.focus?.({ preventScroll: true });
    } catch {
      return null;
    }
    const focused = refreshClaudeDeleteMenuShortcutSession(current, lease.trigger);
    if (!focused || focused.item !== lease.item || !routeStillCurrent()) return null;
    return document.hasFocus?.() && document.activeElement === focused.item ? focused : null;
  }

  function preflightClaudeTrustedDeleteShortcut(data, routeStillCurrent) {
    const lease = claudeTrustedDeleteLease;
    if (!claudeLeaseMatches(lease, data, "shortcut", routeStillCurrent)) {
      return deleteResult(false, "claude", "trusted Claude Delete D shortcut has no owned activation lease");
    }
    lease.phase = "preflighting";
    claudeDisposeTrustedDeleteKeyObserver(lease);
    if (claudeHasNewDeleteConfirmation(lease.confirmationBaseline)) {
      claudeReleaseActiveDeleteLease(lease);
      return deleteResult(false, "claude", "unverified delete confirmation appeared before trusted Delete D activation");
    }
    const focused = focusClaudeDeleteShortcutLease(lease, routeStillCurrent);
    if (!focused) {
      claudeReleaseActiveDeleteLease(lease);
      return deleteResult(false, "claude", "trusted Claude Delete D shortcut could not establish exact menu focus");
    }
    if (claudeHasNewDeleteConfirmation(lease.confirmationBaseline)) {
      claudeReleaseActiveDeleteLease(lease);
      return deleteResult(false, "claude", "unverified delete confirmation appeared while focusing trusted Delete D activation");
    }
    Object.assign(lease, {
      phase: "confirmation",
      activationKind: "shortcut",
      menuRoot: focused.root,
      item: focused.item,
      frozenConfirmation: null,
      confirmationAmbiguous: false,
      expiresAt: Date.now() + 12000
    });
    const trustedKeyObserver = claudeInstallTrustedDeleteKeyObserver(lease, routeStillCurrent);
    if (!trustedKeyObserver) {
      claudeReleaseActiveDeleteLease(lease);
      return deleteResult(false, "claude", "trusted Claude Delete D observer could not be installed");
    }
    lease.trustedKeyObserver = trustedKeyObserver;
    return claudeTrustedDeleteShortcutResult("owned Claude menu Delete D shortcut is ready");
  }

  async function activateClaudeDeleteMenuItem(session, trigger, data, routeStillCurrent, confirmationBaseline) {
    if (!session || !routeStillCurrent()) return deleteResult(false, "claude", "owned delete menu item changed before activation");
    if (claudeHasNewDeleteConfirmation(confirmationBaseline)) {
      return deleteResult(false, "claude", "unverified delete confirmation appeared before delete activation");
    }
    const menuBinding = claudeMenuBindingIds(trigger);
    if (
      !menuBinding.ids.length
      || claudeLinkedDeleteMenuRoot(trigger) !== session.root
      || String(trigger.getAttribute?.("aria-expanded") || "").trim().toLowerCase() !== "true"
    ) {
      return deleteResult(false, "claude", "owned delete menu lost its title-trigger binding before activation");
    }
    const lease = {
      phase: "confirmation",
      activationKind: "click",
      attemptId: String(data?.deleteAttemptId || ""),
      routeId: claudeConversationIdFromHref(),
      documentRef: document,
      trigger,
      menuRoot: session.root,
      menuBindingKey: menuBinding.key,
      item: session.item,
      confirmationBaseline,
      frozenConfirmation: null,
      confirmationAmbiguous: false,
      expiresAt: Date.now() + 12000
    };
    claudeDisposeTrustedDeleteKeyObserver(claudeTrustedDeleteLease);
    claudeTrustedDeleteLease = lease;
    deleteClick(session.item) || deleteClickLayout(session.item);
    const outcome = await waitForClaudeDeleteOutcome(lease, trigger, routeStillCurrent);
    if (outcome.state === "confirmation") {
      if (claudeTrustedDeleteLease !== lease) {
        return deleteResult(false, "claude", "delete confirmation lease was replaced before finalization");
      }
      lease.phase = "confirming";
      try {
        return await finishClaudeDeleteConfirmation(outcome.confirmation, routeStillCurrent);
      } finally {
        claudeReleaseActiveDeleteLease(lease);
      }
    }
    if (outcome.state === "menu-open") {
      if (claudeTrustedDeleteLease !== lease || lease.phase !== "confirmation") {
        return deleteResult(false, "claude", "delete menu item lease was replaced before trusted retry");
      }
      return claudeTrustedMenuResult("delete menu item did not open an owned confirmation", lease.item, "delete-menu-item");
    }
    claudeReleaseActiveDeleteLease(lease);
    if (outcome.state === "route-changed") return deleteResult(false, "claude", "current conversation changed after delete activation");
    return deleteResult(false, "claude", "delete menu item outcome is uncertain");
  }

  async function resumeClaudeTrustedMenuTrigger(data, routeStillCurrent) {
    const lease = claudeTrustedDeleteLease;
    if (!claudeLeaseMatches(lease, data, "menu", routeStillCurrent)) {
      return deleteResult(false, "claude", "trusted conversation menu click has no owned activation lease");
    }
    if (!lease.trigger?.isConnected || claudeConversationMenuTrigger() !== lease.trigger) {
      return deleteResult(false, "claude", "trusted conversation menu trigger changed");
    }
    lease.phase = "opening-menu";
    try {
      const activation = await waitForModel(() => {
        if (
          claudeTrustedDeleteLease !== lease
          || lease.phase !== "opening-menu"
          || !claudeLeaseCoreIsCurrent(lease, routeStillCurrent)
        ) return null;
        const shortcut = claudeDeleteMenuShortcutSession(lease.trigger, lease.shortcutMenuBaseline);
        if (shortcut) return { kind: "shortcut", session: shortcut };
        const session = claudeDeleteMenuSession(lease.trigger, lease.ownedMenuBaseline);
        return session ? { kind: "item", session } : null;
      }, 3200, 90);
      if (claudeTrustedDeleteLease !== lease) {
        return deleteResult(false, "claude", "trusted conversation menu lease was replaced while opening");
      }
      if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed during trusted conversation menu click");
      if (!activation) return deleteResult(false, "claude", "trusted topic menu click did not open");
      if (activation.kind === "shortcut") {
        return leaseClaudeTrustedDeleteShortcut(data, activation.session, routeStillCurrent, lease.confirmationBaseline);
      }
      return await activateClaudeDeleteMenuItem(activation.session, lease.trigger, data, routeStillCurrent, lease.confirmationBaseline);
    } finally {
      claudeReleaseActiveDeleteLease(lease);
    }
  }

  async function resumeClaudeTrustedDeleteItem(data, routeStillCurrent) {
    const lease = claudeTrustedDeleteLease;
    if (!claudeLeaseMatches(lease, data, "confirmation", routeStillCurrent)) {
      return deleteResult(false, "claude", "trusted delete menu click has no owned activation lease");
    }
    lease.phase = "confirming";
    claudeDisposeTrustedDeleteKeyObserver(lease);
    try {
      if (lease.activationKind === "shortcut" && !claudeLeaseObservedTrustedDeleteShortcut(lease)) {
        return deleteResult(false, "claude", "trusted Claude Delete D keydown was not observed on the owned menu item");
      }
      const confirmation = claudeDeleteConfirmationOwnershipForLease(lease, routeStillCurrent)
        || await waitForModel(() => routeStillCurrent() && claudeDeleteConfirmationOwnershipForLease(lease, routeStillCurrent), 3200, 90);
      if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed during trusted delete menu click");
      if (!confirmation) return deleteResult(false, "claude", "trusted delete menu click did not open an owned confirmation");
      return await finishClaudeDeleteConfirmation(confirmation, routeStillCurrent);
    } finally {
      claudeReleaseActiveDeleteLease(lease);
    }
  }

  async function deleteClaudeThread(data = {}) {
    const routeStillCurrent = claudeDeleteRouteGuard(data);
    if (!routeStillCurrent()) return deleteResult(false, "claude", "stable current conversation identity not found");
    if (data?.trustedKeySequencePreflight) return preflightClaudeTrustedDeleteShortcut(data, routeStillCurrent);
    if (data?.trustedMenuClickRetried || data?.trustedKeySequenceRetried) return resumeClaudeTrustedDeleteItem(data, routeStillCurrent);
    if (data?.trustedMenuTriggerRetried) return resumeClaudeTrustedMenuTrigger(data, routeStillCurrent);
    claudeDisposeTrustedDeleteKeyObserver(claudeTrustedDeleteLease);
    claudeTrustedDeleteLease = null;
    if (findDeleteConfirmButton() || deleteDialogRoots().length) {
      return deleteResult(false, "claude", "unverified delete confirmation is already open");
    }
    const trigger = claudeConversationMenuTrigger();
    if (!trigger) return deleteResult(false, "claude", "conversation menu trigger not found");
    const ownedMenuBaseline = claudeOwnedDeleteMenuRoots(trigger);
    const shortcutMenuBaseline = claudeShortcutDeleteMenuRoots(trigger);
    const confirmationBaseline = new Set(deleteDialogRoots());
    if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed before delete menu opened");
    const openingLease = {
      phase: "opening-menu",
      attemptId: String(data?.deleteAttemptId || ""),
      routeId: claudeConversationIdFromHref(),
      documentRef: document,
      trigger,
      ownedMenuBaseline,
      shortcutMenuBaseline,
      confirmationBaseline,
      expiresAt: Date.now() + 12000
    };
    claudeTrustedDeleteLease = openingLease;
    let retainOpeningLease = false;
    try {
      deleteClick(trigger) || deleteClickLayout(trigger);
      const activation = await waitForModel(() => {
        if (
          claudeTrustedDeleteLease !== openingLease
          || !claudeLeaseMatches(openingLease, data, "opening-menu", routeStillCurrent)
        ) return null;
        const shortcut = claudeDeleteMenuShortcutSession(trigger, shortcutMenuBaseline);
        if (shortcut) return { kind: "shortcut", session: shortcut };
        const session = claudeDeleteMenuSession(trigger, ownedMenuBaseline);
        return session ? { kind: "item", session } : null;
      }, 2400, 80);
      if (claudeTrustedDeleteLease !== openingLease) {
        return deleteResult(false, "claude", "initial conversation menu lease was replaced while opening");
      }
      if (!claudeLeaseMatches(openingLease, data, "opening-menu", routeStillCurrent)) {
        return deleteResult(false, "claude", "current conversation changed before delete menu opened");
      }
      if (!activation) {
        openingLease.phase = "menu";
        openingLease.expiresAt = Date.now() + 12000;
        retainOpeningLease = true;
        return claudeTrustedMenuResult("owned delete menu item not found", trigger, "conversation-menu-trigger");
      }
      if (activation.kind === "shortcut") {
        return leaseClaudeTrustedDeleteShortcut(data, activation.session, routeStillCurrent, confirmationBaseline);
      }
      await sleep(120);
      if (claudeTrustedDeleteLease !== openingLease) {
        return deleteResult(false, "claude", "initial conversation menu lease was replaced before delete activation");
      }
      if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed before delete activation");
      if (!claudeLeaseMatches(openingLease, data, "opening-menu", routeStillCurrent)) {
        return deleteResult(false, "claude", "initial conversation menu lease expired before delete activation");
      }
      const currentSession = refreshClaudeDeleteMenuSession(activation.session, trigger);
      if (!currentSession || !routeStillCurrent()) {
        return deleteResult(false, "claude", routeStillCurrent() ? "owned delete menu item changed before activation" : "current conversation changed before delete activation");
      }
      if (findDeleteConfirmButton() || deleteDialogRoots().length) {
        return deleteResult(false, "claude", "unverified delete confirmation appeared before delete activation");
      }
      return activateClaudeDeleteMenuItem(currentSession, trigger, data, routeStillCurrent, confirmationBaseline);
    } finally {
      if (!retainOpeningLease) claudeReleaseActiveDeleteLease(openingLease);
    }
  }

  return Object.freeze({ deleteClaudeThread });
}
