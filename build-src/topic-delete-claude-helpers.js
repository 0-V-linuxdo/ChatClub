export const CLAUDE_DELETE_USERSCRIPT_HELPERS = String.raw`
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
  let claudeTrustedMenuTriggerLease = null;
  let claudeTrustedDeleteItemLease = null;

  function claudeConversationIdFromHref(value = location.href) {
    try {
      const url = new URL(String(value || ""), location.origin);
      const host = String(url.hostname || "").toLowerCase();
      if (url.protocol !== "https:" || !(host === "claude.ai" || host.endsWith(".claude.ai"))) return "";
      const match = String(url.pathname || "").match(/^\/chat\/([^/]+)\/?$/);
      if (!match) return "";
      const id = decodeURIComponent(match[1]).trim();
      return id && !/[\/?#]/.test(id) ? id : "";
    } catch {
      return "";
    }
  }

  function claudeDeleteRouteGuard(payload = {}) {
    const expected = payload?.expectedDeleteIdentity;
    const currentId = claudeConversationIdFromHref();
    const expectedId = expected
      ? (String(expected.provider || "").toLowerCase() === "claude" ? String(expected.id || "").trim() : "")
      : currentId;
    return () => Boolean(expectedId) && claudeConversationIdFromHref() === expectedId;
  }

  function claudeDeleteAttemptId(payload = {}) {
    const attemptId = String(payload?.deleteAttemptId || "").trim();
    return attemptId && attemptId.length <= 256 ? attemptId : "";
  }

  function claudeTrustedLeaseMatches(lease, payload, routeStillCurrent) {
    const attemptId = claudeDeleteAttemptId(payload);
    return Boolean(
      lease
      && attemptId
      && lease.attemptId === attemptId
      && lease.routeId === claudeConversationIdFromHref()
      && routeStillCurrent()
    );
  }

  function claudeChatTitleRoot() {
    const roots = qsa(CLAUDE_CHAT_TITLE_ROOT_SELECTOR, document).filter((root) => {
      if (!root?.isConnected || !visible(root)) return false;
      const box = rect(root);
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
    const triggerBox = rect(trigger);
    if (!triggerBox) return false;
    const allowed = new Set([
      wanted,
      wanted + ", rename chat",
      wanted + ", rename conversation",
      wanted + " rename chat",
      wanted + " rename conversation"
    ]);
    return qsa("[aria-label],[title],button,[role='button']", root).some((node) => {
      if (!node || node === trigger || trigger?.contains?.(node) || node.contains?.(trigger)) return false;
      if (!node.isConnected || !visible(node)) return false;
      const box = rect(node);
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
    for (const node of qsa("button[aria-label],[role='button'][aria-label]", root)) {
      const label = String(node.getAttribute?.("aria-label") || "").trim();
      const title = claudeConversationTitleFromMenuLabel(label);
      if (!title) continue;
      const target = clickable(node);
      if (!target || target === root || seen.has(target) || !root.contains?.(target)) continue;
      if (!target.isConnected || !visible(target) || disabled(target)) continue;
      const targetLabel = String(target.getAttribute?.("aria-label") || "").trim();
      const targetTitle = claudeConversationTitleFromMenuLabel(targetLabel);
      if (!targetTitle || normalize(targetTitle).toLowerCase() !== normalize(title).toLowerCase()) continue;
      if (!claudeTitleEvidenceMatches(root, target, title)) continue;
      const box = rect(target);
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
      const box = rect(root);
      if (!box || box.width < 48 || box.height < 20 || box.width > 640 || box.height > 720) return;
      seen.add(root);
      roots.push(root);
    };
    add(claudeLinkedDeleteMenuRoot(trigger));
    qsa(CLAUDE_DELETE_MENU_ROOT_SELECTOR, document).forEach(add);
    return roots.sort((a, b) => elementArea(a) - elementArea(b));
  }

  function claudeDeleteLabelMatchesExact(value) {
    const text = normalize(value);
    if (!text || CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text)) return false;
    return matchesExactLabelRepeats(text, CLAUDE_DELETE_LABELS);
  }

  function claudeDeleteMenuLabelMatchesExact(value) {
    const text = normalize(value);
    if (claudeDeleteLabelMatchesExact(text)) return true;
    if (!text || CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text)) return false;
    return /^(?:delete(?:\s+chat)?|删除(?:聊天)?)\s+d$/i.test(text);
  }

  function claudeDeleteMenuShortcutTokenMatches(value) {
    return CLAUDE_DELETE_MENU_SHORTCUT_TOKENS.has(compact(value));
  }

  function claudeMenuSemanticTokens(target) {
    return [
      target?.getAttribute?.("aria-label"),
      target?.getAttribute?.("title"),
      target?.innerText,
      target?.textContent
    ].map(compact).filter(Boolean);
  }

  function claudeDeleteMenuHasConversationFingerprint(root, deleteItem) {
    const readStateTargets = new Set();
    const conversationActionTargets = new Set();
    for (const node of qsa("[role='menuitem'],[role='option'],button,[role='button']", root)) {
      const target = clickable(node);
      if (!target || target === deleteItem || !root.contains?.(target) || !target.isConnected || !visible(target) || disabled(target)) continue;
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
    if (!semanticValues.length) return false;
    return semanticValues.every(claudeDeleteLabelMatchesExact);
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
    const box = rect(node);
    if (!node || !box) return false;
    let pointTarget = null;
    try { pointTarget = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2); } catch {}
    return Boolean(pointTarget && (pointTarget === node || node.contains?.(pointTarget)));
  }

  function findClaudeDeleteMenuItem(root, trigger = null) {
    if (!root || !root.isConnected || !visible(root)) return null;
    const candidates = [];
    const seen = new Set();
    for (const node of qsa("[role='menuitem'],[role='option'],button,[role='button']", root)) {
      const target = clickable(node);
      if (!target || target === root || target === trigger || seen.has(target) || !root.contains?.(target)) continue;
      if (!target.isConnected || !visible(target) || disabled(target)) continue;
      if (!claudeDeleteMenuTargetLabelMatchesExact(target)) continue;
      const box = rect(target);
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
      if (!existing || elementArea(root) < elementArea(existing.root)) sessionsByItem.set(item, { root, item });
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

  function claudeNewDeleteMenuRoots(trigger, baselineRoots = new Set()) {
    return claudeDeleteMenuRoots(trigger).filter((root) => !baselineRoots.has(root));
  }

  async function openClaudeDeleteMenu(trigger, routeStillCurrent, baselineRoots) {
    if (!routeStillCurrent()) return { state: "route-changed" };
    clickAt(trigger);
    const session = await waitFor(() => {
      if (!routeStillCurrent()) return null;
      return claudeDeleteMenuSession(trigger, baselineRoots);
    }, 2400, 80);
    if (!routeStillCurrent()) return { state: "route-changed" };
    if (!session) {
      return claudeNewDeleteMenuRoots(trigger, baselineRoots).length
        ? { state: "unowned-menu" }
        : { state: "not-open" };
    }
    await sleep(120);
    if (!routeStillCurrent()) return { state: "route-changed" };
    const refreshed = refreshClaudeDeleteMenuSession(session, trigger);
    return refreshed ? { state: "menu", session: refreshed } : { state: "menu-changed" };
  }

  function claudeDeleteConfirmButton(root) {
    if (!root || !root.isConnected || !visible(root)) return null;
    const candidates = [];
    const seen = new Set();
    for (const node of visibleConfirmCandidates(root)) {
      const target = clickable(node);
      if (!target || seen.has(target) || !root.contains?.(target)) continue;
      if (!target.isConnected || !visible(target) || disabled(target)) continue;
      if (!claudeDeleteTargetLabelMatchesExact(target)) continue;
      const box = rect(target);
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
      const text = elementText(root);
      if (CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text) || !CLAUDE_DELETE_CONFIRMATION_PATTERN.test(text)) continue;
      const button = claudeDeleteConfirmButton(root);
      if (!button) continue;
      const existing = ownedByButton.get(button);
      if (!existing || elementArea(root) < elementArea(existing.root)) ownedByButton.set(button, { root, button, baselineRoots });
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
    const text = elementText(root);
    if (CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text) || !CLAUDE_DELETE_CONFIRMATION_PATTERN.test(text)) return false;
    if (claudeDeleteConfirmButton(root) !== button) return false;
    return deleteDialogRoots().some((candidate) => candidate === root);
  }

  function resultWithClaudeTrustedMenuClick(reason, node, kind) {
    const value = result(false, reason);
    const instruction = node && trustedMenuClickForElement(node, reason);
    const trustedMenuClick = instruction ? { ...instruction, kind } : null;
    return trustedMenuClick
      ? { ...value, needsTrustedMenuClick: true, trustedMenuClick }
      : value;
  }

  function resultWithClaudeTrustedConfirm(reason, ownership) {
    const value = result(false, reason);
    const button = ownership?.button || null;
    const box = rect(button);
    if (!button || !box) return value;
    const trustedClick = {
      kind: "delete-confirm",
      site: SITE_ID,
      reason: String(reason || ""),
      framePoint: {
        x: Math.round((box.left + box.width / 2) * 100) / 100,
        y: Math.round((box.top + box.height / 2) * 100) / 100
      },
      frameRect: serializableRect(box)
    };
    return { ...value, needsTrustedClick: true, trustedClick };
  }

  async function finishClaudeDeleteConfirmation(ownership, routeStillCurrent) {
    if (!claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent)) {
      return result(false, "delete confirmation ownership is uncertain");
    }
    const root = ownership.root;
    const button = ownership.button;
    if (!routeStillCurrent()) return result(false, "current conversation changed before delete confirmation");
    activateConfirmButton(button, root);
    const outcome = await waitFor(() => {
      if (!root.isConnected || !visible(root)) return "closed";
      return routeStillCurrent() ? "" : "route-changed";
    }, 5200, 100);
    if (outcome === "closed") return result(true);
    if (outcome === "route-changed" || !routeStillCurrent()) {
      return result(false, "current conversation changed during delete confirmation");
    }
    if (!claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent)) {
      return result(false, "delete confirmation ownership changed");
    }
    return resultWithClaudeTrustedConfirm("delete confirmation did not close", ownership);
  }

  async function waitForClaudeDeleteOutcome(lease, trigger, routeStillCurrent, timeoutMs = 2200) {
    const confirmation = await waitFor(() => {
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

  async function activateClaudeDeleteItem(payload, session, trigger, routeStillCurrent) {
    await sleep(120);
    const refreshed = refreshClaudeDeleteMenuSession(session, trigger);
    if (!refreshed || refreshed.root !== session.root || !routeStillCurrent()) {
      return result(false, routeStillCurrent() ? "owned delete menu item changed before activation" : "current conversation changed before delete activation");
    }
    if (findDeleteConfirmButton() || deleteDialogRoots().length) {
      return result(false, "unverified delete confirmation appeared before delete activation");
    }
    const lease = {
      attemptId: claudeDeleteAttemptId(payload),
      routeId: claudeConversationIdFromHref(),
      menuRoot: refreshed.root,
      item: refreshed.item,
      confirmationBaseline: new Set(deleteDialogRoots())
    };
    claudeTrustedDeleteItemLease = lease;
    clickAt(refreshed.item);
    const outcome = await waitForClaudeDeleteOutcome(lease, trigger, routeStillCurrent);
    if (outcome.state === "confirmation") {
      claudeTrustedDeleteItemLease = null;
      return finishClaudeDeleteConfirmation(outcome.confirmation, routeStillCurrent);
    }
    if (outcome.state === "menu-open") {
      if (claudeTrustedLeaseMatches(lease, payload, routeStillCurrent)) {
        return resultWithClaudeTrustedMenuClick(
          "delete menu item did not open an owned confirmation",
          lease.item,
          "delete-menu-item"
        );
      }
      claudeTrustedDeleteItemLease = null;
      return result(false, "delete menu item did not open an owned confirmation");
    }
    claudeTrustedDeleteItemLease = null;
    if (outcome.state === "route-changed") return result(false, "current conversation changed after delete activation");
    return result(false, "delete menu item outcome is uncertain");
  }

  async function resumeClaudeTrustedMenuTrigger(payload, routeStillCurrent) {
    const lease = claudeTrustedMenuTriggerLease;
    claudeTrustedMenuTriggerLease = null;
    if (!claudeTrustedLeaseMatches(lease, payload, routeStillCurrent)) {
      return result(false, "trusted conversation menu click has no owned activation lease");
    }
    if (claudeConversationMenuTrigger() !== lease.trigger) {
      return result(false, "trusted conversation menu trigger ownership changed");
    }
    const session = await waitFor(() => {
      if (!routeStillCurrent()) return null;
      return claudeDeleteMenuSession(lease.trigger, lease.menuBaseline);
    }, 3200, 90);
    if (!routeStillCurrent()) return result(false, "current conversation changed during trusted conversation menu click");
    if (!session) {
      return claudeNewDeleteMenuRoots(lease.trigger, lease.menuBaseline).length
        ? result(false, "trusted conversation menu click opened an unowned menu")
        : result(false, "trusted conversation menu click did not open an owned menu");
    }
    return activateClaudeDeleteItem(payload, session, lease.trigger, routeStillCurrent);
  }

  async function resumeClaudeTrustedDeleteItem(payload, routeStillCurrent) {
    const lease = claudeTrustedDeleteItemLease;
    claudeTrustedDeleteItemLease = null;
    if (!claudeTrustedLeaseMatches(lease, payload, routeStillCurrent)) {
      return result(false, "trusted delete menu click has no owned activation lease");
    }
    const confirmation = claudeDeleteConfirmationOwnership(lease.confirmationBaseline)
      || await waitFor(() => routeStillCurrent() && claudeDeleteConfirmationOwnership(lease.confirmationBaseline), 3200, 90);
    if (!routeStillCurrent()) return result(false, "current conversation changed during trusted delete menu click");
    if (!confirmation) return result(false, "trusted delete menu click did not open an owned confirmation");
    return finishClaudeDeleteConfirmation(confirmation, routeStillCurrent);
  }

  async function deleteClaude(payload = {}) {
    const routeStillCurrent = claudeDeleteRouteGuard(payload);
    if (!routeStillCurrent()) return result(false, "stable current conversation identity not found");
    if (payload?.trustedMenuClickRetried) return resumeClaudeTrustedDeleteItem(payload, routeStillCurrent);
    if (payload?.trustedMenuTriggerRetried) return resumeClaudeTrustedMenuTrigger(payload, routeStillCurrent);
    claudeTrustedMenuTriggerLease = null;
    claudeTrustedDeleteItemLease = null;
    if (findDeleteConfirmButton() || deleteDialogRoots().length) {
      return result(false, "unverified delete confirmation is already open");
    }
    const trigger = claudeConversationMenuTrigger();
    if (!trigger) return result(false, "conversation menu trigger not found");
    const menuBaseline = new Set(claudeDeleteMenuRoots(trigger));
    const triggerLease = {
      attemptId: claudeDeleteAttemptId(payload),
      routeId: claudeConversationIdFromHref(),
      trigger,
      menuBaseline
    };
    claudeTrustedMenuTriggerLease = triggerLease;
    const opened = await openClaudeDeleteMenu(trigger, routeStillCurrent, menuBaseline);
    if (opened.state === "menu") {
      claudeTrustedMenuTriggerLease = null;
      return activateClaudeDeleteItem(payload, opened.session, trigger, routeStillCurrent);
    }
    if (opened.state === "not-open" || opened.state === "unowned-menu") {
      if (
        claudeTrustedLeaseMatches(triggerLease, payload, routeStillCurrent)
        && claudeConversationMenuTrigger() === trigger
      ) {
        return resultWithClaudeTrustedMenuClick(
          opened.state === "unowned-menu"
            ? "owned delete menu item not found"
            : "conversation menu trigger did not open an owned menu",
          trigger,
          "conversation-menu-trigger"
        );
      }
      claudeTrustedMenuTriggerLease = null;
      return result(false, opened.state === "unowned-menu" ? "owned delete menu item not found" : "conversation menu trigger did not open an owned menu");
    }
    claudeTrustedMenuTriggerLease = null;
    if (opened.state === "route-changed") return result(false, "current conversation changed before delete menu opened");
    return result(false, "owned delete menu item changed before activation");
  }
`;
