export function createDeleteClaudeCapability(deps = {}) {
  const {
    qsa,
    normalize,
    deleteCompactToken,
    modelRect,
    deleteElementText,
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
  const CLAUDE_DELETE_MENU_ROOT_SELECTOR = [
    "[role='menu']",
    "[role='listbox']",
    "[data-radix-menu-content]",
    "[data-radix-popper-content-wrapper]",
    "[data-floating-ui-portal]",
    "[data-slot='dropdown-menu-content']"
  ].join(",");
  const CLAUDE_DELETE_LABELS = ["Delete chat", "Delete", "删除聊天", "删除"];
  const CLAUDE_DELETE_MENU_SHORTCUT_TOKENS = new Set([
    "deleted",
    "deletechatd",
    "删除d",
    "删除聊天d"
  ]);
  const CLAUDE_WRONG_DELETE_TARGET_PATTERN = /\b(?:delete|remove)\b[^\n]{0,48}\b(?:project|account|workspace)\b|(?:删除|移除)[^\n]{0,24}(?:项目|账户|帐号|账号|工作区)/i;
  const CLAUDE_DELETE_CONFIRMATION_PATTERN = /\bdelete\s+(?:this\s+)?(?:chat|conversation)\b|(?:删除|移除)(?:此|这)?(?:聊天|对话)/i;
  let claudeTrustedDeleteLease = null;

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

  function claudeLinkedDeleteMenuRoot(trigger = null) {
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (!controlsId) return null;
    try { return document.getElementById(controlsId) || null; } catch { return null; }
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
    add(claudeLinkedDeleteMenuRoot(trigger));
    qsa(CLAUDE_DELETE_MENU_ROOT_SELECTOR, document, { all: true }).forEach(add);
    return roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
  }

  function claudeDeleteLabelMatchesExact(value) {
    const text = normalize(value);
    if (!text || CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text)) return false;
    return deleteLabelMatchesExactish(text, CLAUDE_DELETE_LABELS);
  }

  function claudeDeleteMenuLabelMatchesExact(value) {
    const text = normalize(value);
    if (claudeDeleteLabelMatchesExact(text)) return true;
    if (!text || CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text)) return false;
    return /^(?:delete(?:\s+chat)?|删除(?:聊天)?)\s+d$/i.test(text);
  }

  function claudeDeleteMenuShortcutTokenMatches(value) {
    return CLAUDE_DELETE_MENU_SHORTCUT_TOKENS.has(deleteCompactToken(value));
  }

  function claudeMenuSemanticTokens(target) {
    return [
      target?.getAttribute?.("aria-label"),
      target?.getAttribute?.("title"),
      target?.innerText,
      target?.textContent
    ].map(deleteCompactToken).filter(Boolean);
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

  function claudeDeleteTargetLabelMatchesExact(target) {
    if (!target) return false;
    const semanticValues = [
      target.getAttribute?.("aria-label"),
      target.getAttribute?.("title"),
      target.innerText,
      target.textContent
    ].map((value) => String(value || "").trim()).filter(Boolean);
    return Boolean(semanticValues.length) && semanticValues.every(claudeDeleteLabelMatchesExact);
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
      const text = normalize(value);
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

  function refreshClaudeDeleteMenuSession(session, trigger) {
    const root = session?.root || null;
    if (!root || !root.isConnected || !visible(root)) return null;
    if (!claudeDeleteMenuRoots(trigger).includes(root)) return null;
    const item = findClaudeDeleteMenuItem(root, trigger);
    return item ? { root, item } : null;
  }

  function claudeDeleteConfirmButton(root) {
    if (!root || !root.isConnected || !visible(root)) return null;
    const candidates = [];
    const seen = new Set();
    for (const node of qsa("button,[role='button']", root, { all: true })) {
      const target = deleteClickableElement(node);
      if (!target || seen.has(target) || !root.contains?.(target)) continue;
      if (!target.isConnected || !visible(target) || isDisabledElement(target)) continue;
      if (!claudeDeleteTargetLabelMatchesExact(target)) continue;
      const box = modelRect(target);
      if (!box || box.width < 12 || box.height < 10 || box.width > 420 || box.height > 120) continue;
      seen.add(target);
      candidates.push(target);
    }
    return candidates.length === 1 ? candidates[0] : null;
  }

  function claudeDeleteConfirmationOwnership(baselineRoots = new Set()) {
    const ownedByButton = new Map();
    for (const root of deleteDialogRoots()) {
      if (!root || baselineRoots.has(root) || !root.isConnected || !visible(root)) continue;
      const text = deleteElementText(root);
      if (CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text) || !CLAUDE_DELETE_CONFIRMATION_PATTERN.test(text)) continue;
      const button = claudeDeleteConfirmButton(root);
      if (!button) continue;
      const existing = ownedByButton.get(button);
      if (!existing || modelElementArea(root) < modelElementArea(existing.root)) {
        ownedByButton.set(button, { root, button, baselineRoots });
      }
    }
    const ownerships = [...ownedByButton.values()];
    return ownerships.length === 1 ? ownerships[0] : null;
  }

  function claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent) {
    const root = ownership?.root || null;
    const button = ownership?.button || null;
    if (!root || !button || !routeStillCurrent()) return false;
    if (!root.isConnected || !button.isConnected || !visible(root) || !visible(button) || !root.contains?.(button)) return false;
    if (ownership.baselineRoots?.has(root)) return false;
    if (CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(deleteElementText(root))) return false;
    if (!CLAUDE_DELETE_CONFIRMATION_PATTERN.test(deleteElementText(root))) return false;
    if (claudeDeleteConfirmButton(root) !== button) return false;
    return deleteDialogRoots().some((candidate) => candidate === root);
  }

  function claudeTrustedMenuResult(reason, element, kind) {
    const value = deleteResultWithTrustedMenuClick("claude", reason, element);
    return value?.trustedMenuClick
      ? { ...value, trustedMenuClick: { ...value.trustedMenuClick, kind } }
      : value;
  }

  function claudeTrustedConfirmResult(reason, ownership) {
    const box = modelRect(ownership?.button);
    if (!box) return deleteResult(false, "claude", reason);
    const round = (value) => Math.round(Number(value) * 100) / 100;
    return deleteResult(false, "claude", reason, {
      needsTrustedClick: true,
      trustedClick: {
        kind: "delete-confirm",
        site: "claude",
        reason,
        framePoint: { x: round(box.left + box.width / 2), y: round(box.top + box.height / 2) },
        frameRect: {
          left: round(box.left),
          top: round(box.top),
          right: round(box.right),
          bottom: round(box.bottom),
          width: round(box.width),
          height: round(box.height)
        }
      }
    });
  }

  async function finishClaudeDeleteConfirmation(ownership, routeStillCurrent) {
    if (!claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent)) {
      return deleteResult(false, "claude", "delete confirmation ownership is uncertain");
    }
    const root = ownership.root;
    const button = ownership.button;
    if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed before delete confirmation");
    deleteClick(button) || deleteClickLayout(button);
    const closed = await waitForModel(() => !root.isConnected || !visible(root), 5200, 100);
    if (closed) return deleteResult(true, "claude");
    if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed during delete confirmation");
    if (!claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent)) {
      return deleteResult(false, "claude", "delete confirmation ownership changed");
    }
    return claudeTrustedConfirmResult("delete confirmation did not close", ownership);
  }

  async function waitForClaudeDeleteOutcome(lease, trigger, routeStillCurrent, timeoutMs = 2200) {
    const confirmation = await waitForModel(() => {
      if (!routeStillCurrent()) return null;
      return claudeDeleteConfirmationOwnership(lease.confirmationBaseline);
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
      && lease.routeId === claudeConversationIdFromHref()
      && routeStillCurrent()
    );
  }

  async function activateClaudeDeleteMenuItem(session, trigger, data, routeStillCurrent, confirmationBaseline) {
    if (!session || !routeStillCurrent()) return deleteResult(false, "claude", "owned delete menu item changed before activation");
    const lease = {
      phase: "confirmation",
      attemptId: String(data?.deleteAttemptId || ""),
      routeId: claudeConversationIdFromHref(),
      menuRoot: session.root,
      item: session.item,
      confirmationBaseline
    };
    claudeTrustedDeleteLease = lease;
    deleteClick(session.item) || deleteClickLayout(session.item);
    const outcome = await waitForClaudeDeleteOutcome(lease, trigger, routeStillCurrent);
    if (outcome.state === "confirmation") {
      claudeTrustedDeleteLease = null;
      return finishClaudeDeleteConfirmation(outcome.confirmation, routeStillCurrent);
    }
    if (outcome.state === "menu-open") {
      return claudeTrustedMenuResult("delete menu item did not open an owned confirmation", lease.item, "delete-menu-item");
    }
    claudeTrustedDeleteLease = null;
    if (outcome.state === "route-changed") return deleteResult(false, "claude", "current conversation changed after delete activation");
    return deleteResult(false, "claude", "delete menu item outcome is uncertain");
  }

  async function resumeClaudeTrustedMenuTrigger(data, routeStillCurrent) {
    const lease = claudeTrustedDeleteLease;
    claudeTrustedDeleteLease = null;
    if (!claudeLeaseMatches(lease, data, "menu", routeStillCurrent)) {
      return deleteResult(false, "claude", "trusted conversation menu click has no owned activation lease");
    }
    if (!lease.trigger?.isConnected || claudeConversationMenuTrigger() !== lease.trigger) {
      return deleteResult(false, "claude", "trusted conversation menu trigger changed");
    }
    const session = claudeDeleteMenuSession(lease.trigger, lease.menuBaseline)
      || await waitForModel(() => routeStillCurrent() && claudeDeleteMenuSession(lease.trigger, lease.menuBaseline), 3200, 90);
    if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed during trusted conversation menu click");
    if (!session) return deleteResult(false, "claude", "trusted topic menu click did not open");
    return activateClaudeDeleteMenuItem(session, lease.trigger, data, routeStillCurrent, lease.confirmationBaseline);
  }

  async function resumeClaudeTrustedDeleteItem(data, routeStillCurrent) {
    const lease = claudeTrustedDeleteLease;
    claudeTrustedDeleteLease = null;
    if (!claudeLeaseMatches(lease, data, "confirmation", routeStillCurrent)) {
      return deleteResult(false, "claude", "trusted delete menu click has no owned activation lease");
    }
    const confirmation = claudeDeleteConfirmationOwnership(lease.confirmationBaseline)
      || await waitForModel(() => routeStillCurrent() && claudeDeleteConfirmationOwnership(lease.confirmationBaseline), 3200, 90);
    if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed during trusted delete menu click");
    if (!confirmation) return deleteResult(false, "claude", "trusted delete menu click did not open an owned confirmation");
    return finishClaudeDeleteConfirmation(confirmation, routeStillCurrent);
  }

  async function deleteClaudeThread(data = {}) {
    const routeStillCurrent = claudeDeleteRouteGuard(data);
    if (!routeStillCurrent()) return deleteResult(false, "claude", "stable current conversation identity not found");
    if (data?.trustedMenuClickRetried) return resumeClaudeTrustedDeleteItem(data, routeStillCurrent);
    if (data?.trustedMenuTriggerRetried) return resumeClaudeTrustedMenuTrigger(data, routeStillCurrent);
    claudeTrustedDeleteLease = null;
    if (findDeleteConfirmButton() || deleteDialogRoots().length) {
      return deleteResult(false, "claude", "unverified delete confirmation is already open");
    }
    const trigger = claudeConversationMenuTrigger();
    if (!trigger) return deleteResult(false, "claude", "conversation menu trigger not found");
    const menuBaseline = new Set(claudeDeleteMenuRoots(trigger));
    const confirmationBaseline = new Set(deleteDialogRoots());
    if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed before delete menu opened");
    deleteClick(trigger) || deleteClickLayout(trigger);
    const session = await waitForModel(() => routeStillCurrent() && claudeDeleteMenuSession(trigger, menuBaseline), 2400, 80);
    if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed before delete menu opened");
    if (!session) {
      claudeTrustedDeleteLease = {
        phase: "menu",
        attemptId: String(data?.deleteAttemptId || ""),
        routeId: claudeConversationIdFromHref(),
        trigger,
        menuBaseline,
        confirmationBaseline
      };
      return claudeTrustedMenuResult("owned delete menu item not found", trigger, "conversation-menu-trigger");
    }
    await sleep(120);
    const currentSession = refreshClaudeDeleteMenuSession(session, trigger);
    if (!currentSession || !routeStillCurrent()) {
      return deleteResult(false, "claude", routeStillCurrent() ? "owned delete menu item changed before activation" : "current conversation changed before delete activation");
    }
    if (findDeleteConfirmButton() || deleteDialogRoots().length) {
      return deleteResult(false, "claude", "unverified delete confirmation appeared before delete activation");
    }
    return activateClaudeDeleteMenuItem(currentSession, trigger, data, routeStillCurrent, confirmationBaseline);
  }

  return Object.freeze({ deleteClaudeThread });
}
