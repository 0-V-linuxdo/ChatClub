export function createDeleteSitesCapability(deps = {}) {
  const {
    qsa,
    visibleInViewport,
    normalize,
    deleteCompactToken,
    modelRect,
    deleteElementText,
    deleteClickableElement,
    isDisabledElement,
    svgSignature,
    layoutDeleteCandidates,
    visible,
    deleteLabelMatchesExactish,
    deleteLabelMatches,
    DELETE_CANCEL_LABELS,
    matches,
    visibleSelectorElements,
    deleteClickLayout,
    sleep,
    deleteClick,
    modelEventConstructor,
    reveal,
    modelRectInViewport,
    modelElementFromPoint,
    closest,
    findDeleteConfirmButton,
    clickDeleteConfirmIfPresent,
    deleteResult,
    dispatchDeleteKeyboardShortcut,
    clickDeleteConfirmIfAppears,
    deleteDialogRoots,
    deleteResultWithTrustedConfirm,
    deleteResultWithTrustedDeleteShortcut,
    visibleDeleteCandidates,
    modelElementArea,
    deleteActivateUntil,
    waitForModel,
    deleteResultWithTrustedMenuClick
  } = deps;
  function kagiChatIdFromHref(value) {
    const match = String(value || "").match(/\/chat\/([^/?#]+)/i);
    return match?.[1] || "";
  }

  function kagiCurrentThreadLink(data = {}) {
    const ids = new Set([
      location.href,
      data.currentThreadHref,
      data.currentHref,
      data.href,
      data.url
    ].map(kagiChatIdFromHref).filter(Boolean));
    const links = qsa("a[href*='/chat/']", document, { all: true })
      .filter((link) => visibleInViewport(link));
    if (!ids.size) return links[0] || null;
    return links.find((link) => ids.has(kagiChatIdFromHref(link.href || link.getAttribute?.("href")))) || null;
  }

  function kagiCurrentTitleToken() {
    const rawTitle = normalize((document.title || "").replace(/\s+-\s*Kagi Assistant\s*$/i, ""));
    return deleteCompactToken(rawTitle);
  }

  function kagiTitleRenameButtons() {
    const titleToken = kagiCurrentTitleToken();
    return qsa("button,[role='button']", document, { all: true })
      .filter((button) => {
        if (!visibleInViewport(button)) return false;
        const rect = modelRect(button);
        if (!rect || rect.top > 120 || rect.width < 32 || rect.height < 12 || rect.height > 64) return false;
        const value = deleteElementText(button);
        const compact = deleteCompactToken(value);
        return /clicktorename|rename|重命名/.test(compact)
          || (titleToken.length >= 4 && compact.includes(titleToken));
      })
      .sort((a, b) => {
        const ar = modelRect(a);
        const br = modelRect(b);
        return (ar?.top || 0) - (br?.top || 0) || (ar?.left || 0) - (br?.left || 0);
      });
  }

  function kagiTopThreadMenuTrigger() {
    const titleButtons = kagiTitleRenameButtons();
    const candidates = [];
    const seen = new Set();
    const selector = [
      "button",
      "[role='button']",
      "[aria-haspopup]",
      "[aria-expanded]",
      "[tabindex]:not([tabindex='-1'])"
    ].join(", ");
    const add = (element, titleButton, extraScore = 0) => {
      const target = deleteClickableElement(element);
      if (!target || seen.has(target) || target === titleButton || isDisabledElement(target)) return;
      if (!visibleInViewport(target)) return;
      const rect = modelRect(target);
      const titleRect = modelRect(titleButton);
      if (!rect || !titleRect || rect.top > 125 || rect.width < 8 || rect.height < 8 || rect.width > 90 || rect.height > 72) return;
      const verticalOverlap = rect.top < titleRect.bottom + 12 && rect.bottom > titleRect.top - 12;
      if (!verticalOverlap) return;
      const value = deleteElementText(target);
      const compact = deleteCompactToken(value);
      if (/newthread|showsidebar|markaspermanent|permanent|kagiproducts|settings|searchthreads|folders|newfolder|copy|edit|regenerate|scroll|发送|设置|新建|搜索/.test(compact)) return;
      const popup = String(target.getAttribute?.("aria-haspopup") || "").toLowerCase();
      const expanded = target.hasAttribute?.("aria-expanded");
      const signature = svgSignature(target);
      const rightGap = Math.abs(rect.left - titleRect.right);
      const immediateTitleNeighbor = rect.left >= titleRect.right - 8
        && rect.left <= titleRect.right + 42
        && rect.width <= 52
        && rect.height <= 52;
      const menuLike = popup === "menu"
        || popup === "true"
        || expanded
        || /more|menu|options|ellipsis|dots|dropdown|chevron|caret|arrow|down|triangle|更多|菜单|选项/.test(compact)
        || /more|ellipsis|dots|dropdown|chevron|caret|arrow|down|triangle/.test(signature)
        || (!compact && rect.width <= 48)
        || immediateTitleNeighbor;
      if (!menuLike) return;
      const closeToTitleRight = rect.left >= titleRect.left - 8 && rect.left <= titleRect.right + 110;
      if (!closeToTitleRight) return;
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore
          + (popup === "menu" || popup === "true" ? 360 : 0)
          + (expanded ? 120 : 0)
          + (/dropdown|chevron|caret|arrow|down|triangle/.test(signature) ? 260 : 0)
          + (/more|menu|options|更多|菜单|选项/.test(compact) ? 180 : 0)
          + (!compact && rect.width <= 48 ? 180 : 0)
          + Math.max(0, 280 - rightGap * 4)
          + Math.max(0, 90 - Math.abs((rect.top + rect.height / 2) - (titleRect.top + titleRect.height / 2))),
        top: rect.top,
        left: rect.left
      });
    };
    for (const titleButton of titleButtons) {
      for (let scope = titleButton.parentElement, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
        for (const element of layoutDeleteCandidates(scope, selector)) add(element, titleButton, 180 - depth * 12);
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.left - b.left);
    return candidates[0]?.element || null;
  }

  function kagiDeleteMenuItem(trigger = null, labels = ["Delete", "Delete thread", "Delete chat", "Remove", "删除"]) {
    const triggerRect = modelRect(trigger);
    const candidates = [];
    const seen = new Set();
    const add = (element, extraScore = 0) => {
      if (!element || seen.has(element) || !visible(element) || isDisabledElement(element)) return;
      const value = deleteElementText(element);
      if (!deleteLabelMatchesExactish(value, labels)) return;
      if (deleteLabelMatches(value, DELETE_CANCEL_LABELS)) return;
      const target = deleteClickableElement(element);
      if (!target || seen.has(target) || !visible(target) || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 24 || rect.height < 14 || rect.width > 360 || rect.height > 96) return;
      if (triggerRect) {
        const nearTrigger = rect.top >= triggerRect.top - 16
          && rect.top <= triggerRect.top + 360
          && rect.left >= triggerRect.left - 80
          && rect.left <= triggerRect.left + 260;
        if (!nearTrigger) return;
      }
      seen.add(element);
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore
          + (matches(target, "[role='menuitem'],[role='option'],button,[role='button']") ? 220 : 0)
          + (deleteLabelMatches(value, labels, { exact: true }) ? 300 : 0)
          + (triggerRect ? Math.max(0, 160 - Math.abs(rect.left - triggerRect.left)) : 0),
        top: rect.top,
        right: rect.right,
        area: rect.width * rect.height
      });
    };
    const selector = "[role='menuitem'],[role='option'],button,[role='button'],a[href],[tabindex]:not([tabindex='-1']),li,div,span";
    for (const root of visibleSelectorElements(DELETE_MENU_ROOT_SELECTORS)) {
      const rect = modelRect(root);
      if (triggerRect) {
        const nearRoot = rect
          && rect.top >= triggerRect.top - 24
          && rect.top <= triggerRect.top + 330
          && rect.left >= triggerRect.left - 120
          && rect.left <= triggerRect.left + 260;
        if (!nearRoot) continue;
      }
      for (const element of qsa(selector, root, { all: true })) add(element, 260);
    }
    if (!candidates.length) {
      for (const element of qsa(selector, document, { all: true })) add(element, 0);
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.top - a.top || a.area - b.area);
    return candidates[0]?.element || null;
  }

  async function openKagiTitleMenuAndClickDelete(trigger, labels) {
    if (!trigger || !deleteClickLayout(trigger)) return false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await sleep(attempt < 2 ? 45 : 75);
      const item = kagiDeleteMenuItem(trigger, labels);
      if (item && (deleteClick(item) || deleteClickLayout(item))) return true;
    }
    return false;
  }

  function hoverKagiThreadRow(row) {
    const rowRect = modelRect(row);
    if (!rowRect) return;
    const point = { clientX: Math.max(rowRect.left + 16, rowRect.right - 28), clientY: rowRect.top + rowRect.height / 2 };
    for (let target = row, depth = 0; target && target !== document.body && depth < 5; target = target.parentElement, depth += 1) {
      for (const type of ["pointerover", "mouseover", "mouseenter", "mousemove", "pointermove"]) {
        try {
          const EventCtor = type.startsWith("pointer") ? modelEventConstructor("PointerEvent", target) : modelEventConstructor("MouseEvent", target);
          target.dispatchEvent(new EventCtor(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            ...point
          }));
        } catch {}
      }
    }
  }

  function kagiThreadRowFromLink(link) {
    if (!link) return null;
    const linkRect = modelRect(link);
    let best = link;
    for (let node = link.parentElement, depth = 0; node && node !== document.body && depth < 6; node = node.parentElement, depth += 1) {
      const rect = modelRect(node);
      if (!rect || rect.width < 120 || rect.height < 20 || rect.height > 96) continue;
      if (linkRect && (rect.top > linkRect.top + 8 || rect.bottom < linkRect.bottom - 8)) continue;
      const hasMoreButton = qsa("button,[role='button'],[aria-haspopup]", node, { all: true })
        .some((item) => item !== link && modelRect(item));
      best = node;
      if (hasMoreButton) break;
    }
    return best;
  }

  function kagiThreadMoreButton(link) {
    const row = kagiThreadRowFromLink(link);
    if (!row) return null;
    reveal(row);
    hoverKagiThreadRow(row);
    const rowRect = modelRect(row);
    if (!modelRectInViewport(rowRect)) return null;
    const candidates = [];
    const seen = new Set();
    const add = (element, extraScore = 0) => {
      const target = deleteClickableElement(element);
      if (!target || seen.has(target) || target === link || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 8 || rect.height < 8 || rect.width > 84 || rect.height > 84) return;
      if (!visibleInViewport(target)) return;
      const overlaps = rect.top < rowRect.bottom + 10 && rect.bottom > rowRect.top - 10;
      if (!overlaps) return;
      const value = deleteElementText(target);
      const compact = deleteCompactToken(value);
      const popup = String(target.getAttribute?.("aria-haspopup") || "").toLowerCase();
      const signature = svgSignature(target);
      const moreLike = /more|options|menu|ellipsis|dots|更多|菜单|选项/.test(compact)
        || /more|ellipsis|dots|circle/.test(signature)
        || popup === "menu"
        || qsa("circle", target).length >= 2
        || (!compact && rect.width <= 48);
      if (!moreLike) return;
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore
          + (visibleInViewport(target) ? 160 : 40)
          + (/moreoptions|more|options|menu|更多|菜单|选项/.test(compact) ? 260 : 0)
          + (popup === "menu" ? 180 : 0)
          + (/more|ellipsis|dots|circle/.test(signature) ? 120 : 0)
          + Math.max(0, 90 - Math.abs(rect.right - rowRect.right)),
        right: rect.right
      });
    };
    for (let scope = row, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
      for (const button of layoutDeleteCandidates(scope, "button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1'])")) add(button, 80 - depth * 8);
    }
    for (const offset of [10, 22, 36, 54]) {
      const point = { x: Math.max(rowRect.left + 24, rowRect.right - offset), y: rowRect.top + rowRect.height / 2 };
      const pointTarget = modelElementFromPoint(point, row);
      if (pointTarget) add(pointTarget, 160 - offset);
      const pointButton = pointTarget && closest(pointTarget, "button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1'])");
      if (pointButton) add(pointButton, 180 - offset);
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right);
    return candidates[0]?.element || null;
  }

  async function deleteKagiThread(data = {}) {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6200);
      return confirmedExisting
        ? deleteResult(true, "kagi")
        : deleteResult(false, "kagi", "delete confirmation did not close");
    }
    const shortcutDispatched = dispatchDeleteKeyboardShortcut();
    if (!shortcutDispatched) return deleteResult(false, "kagi", "delete shortcut dispatch failed");
    const result = await clickDeleteConfirmIfAppears(2600, 3600);
    if (!result.appeared) return deleteResult(false, "kagi", "delete shortcut did not open confirmation");
    if (!result.confirmed && deleteDialogRoots().length) return deleteResult(false, "kagi", "delete confirmation did not close");
    if (!result.confirmed) return deleteResult(false, "kagi", "delete confirmation button not found");
    return deleteResult(true, "kagi");
  }

  async function deleteChatGptThread(data = {}) {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6200);
      return confirmedExisting
        ? deleteResult(true, "chatgpt")
        : deleteResultWithTrustedConfirm("chatgpt", "delete confirmation did not close");
    }
    const shortcutDispatched = dispatchDeleteKeyboardShortcut();
    if (!shortcutDispatched) {
      return data?.trustedKeySequenceRetried
        ? deleteResult(false, "chatgpt", "delete shortcut dispatch failed")
        : deleteResultWithTrustedDeleteShortcut("chatgpt", "delete shortcut dispatch failed");
    }
    const result = await clickDeleteConfirmIfAppears(2600, 4200);
    if (result.confirmed) return deleteResult(true, "chatgpt");
    if (result.appeared || deleteDialogRoots().length) {
      return deleteResultWithTrustedConfirm("chatgpt", "delete shortcut opened confirmation but it did not close");
    }
    return data?.trustedKeySequenceRetried
      ? deleteResult(false, "chatgpt", "delete shortcut did not open confirmation")
      : deleteResultWithTrustedDeleteShortcut("chatgpt", "delete shortcut did not open confirmation");
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

  function menuRootsWithDelete(labels) {
    const roots = visibleSelectorElements(DELETE_MENU_ROOT_SELECTORS)
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

  function findDeleteMenuItem(root, labels) {
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
    if (!candidates.length) {
      for (const element of qsa("[role='menuitem'],[role='option'],button,[role='button'],li,div,span", root, { all: true })) {
        if (!visible(element) || isDisabledElement(element)) continue;
        add(element, { exactOnly: true, extraScore: 180 });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.area - b.area);
    return candidates[0]?.element || null;
  }

  function findOpenDeleteMenuItem(labels) {
    const candidates = [];
    const seen = new Set();
    const menuRoots = visibleSelectorElements(DELETE_MENU_ROOT_SELECTORS);
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

  async function openTriggerAndClickDelete(trigger, labels, { timeoutMs = 3200, allowHiddenTrigger = false } = {}) {
    if (!trigger || (!visible(trigger) && !allowHiddenTrigger)) return false;
    const existingRoot = menuRootsWithDelete(labels)[0] || null;
    if (!existingRoot && !(allowHiddenTrigger ? deleteClickLayout(trigger) : deleteClick(trigger))) return false;
    await sleep(140);
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const root = menuRootsWithDelete(labels)[0] || existingRoot;
      const item = (root ? findDeleteMenuItem(root, labels) : null) || findOpenDeleteMenuItem(labels);
      if (item && (deleteClick(item) || deleteClickLayout(item))) return true;
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

  async function deleteGrokThread() {
    const labels = ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"];
    const trigger = topRightMenuTrigger({ labels: ["More", "More actions", "Menu", "Options", "更多", "菜单"] });
    if (!trigger) return deleteResult(false, "grok", "conversation menu trigger not found");
    if (!await openTriggerAndClickDelete(trigger, labels)) return deleteResult(false, "grok", "delete menu item not found");
    const confirmed = await clickDeleteConfirmIfPresent(5200);
    if (!confirmed && deleteDialogRoots().length) return deleteResult(false, "grok", "delete confirmation did not close");
    if (!confirmed) return deleteResult(false, "grok", "delete confirmation button not found");
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

  function geminiDeleteConversationActionButton() {
    const candidates = [];
    for (const button of qsa(GEMINI_DELETE_CONVERSATION_ACTION_SELECTOR, document, { all: true })) {
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

  function geminiDeleteConversationMenuRoots(trigger = null) {
    const roots = [];
    const add = (node) => {
      if (node && geminiDeleteConversationMenuRoot(node) && !roots.includes(node)) roots.push(node);
    };
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (controlsId) {
      try { add(document.getElementById(controlsId)); } catch {}
    }
    qsa(GEMINI_DELETE_MENU_ROOT_SELECTOR, document, { all: true }).forEach(add);
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

  function findGeminiDeleteMenuItem(trigger = null) {
    const candidates = [];
    const seen = new Set();
    const roots = geminiDeleteConversationMenuRoots(trigger);
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
      qsa(GEMINI_DELETE_MENU_ITEM_SELECTOR, root, { all: true }).forEach((node) => add(node, root, 240 + index));
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top);
    return candidates[0]?.element || null;
  }

  async function clickGeminiDeleteMenuItem(trigger) {
    const menuReady = () => findGeminiDeleteMenuItem(trigger);
    let item = menuReady();
    if (!item) item = await deleteActivateUntil(trigger, menuReady, { settleMs: 220 });
    if (!item) return null;
    await sleep(120);
    item = findGeminiDeleteMenuItem(trigger) || item;
    return (deleteClick(item) || deleteClickLayout(item)) ? item : null;
  }

  async function deleteGeminiThread(data = {}) {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6500);
      return confirmedExisting
        ? deleteResult(true, "gemini")
        : deleteResultWithTrustedConfirm("gemini", "delete confirmation did not close");
    }
    if (data?.trustedMenuClickRetried) {
      const openItem = await waitForModel(() => findGeminiDeleteMenuItem(), 3000, 90);
      if (openItem) {
        deleteClick(openItem) || deleteClickLayout(openItem);
        const confirmedAfterTrustedMenu = await clickDeleteConfirmIfPresent(6500);
        if (confirmedAfterTrustedMenu) return deleteResult(true, "gemini");
        if (deleteDialogRoots().length) return deleteResultWithTrustedConfirm("gemini", "delete confirmation did not close");
        if (findGeminiDeleteMenuItem()) return deleteResult(false, "gemini", "trusted delete menu click did not open confirmation");
      }
      return deleteResult(false, "gemini", "trusted conversation menu click did not open delete menu");
    }
    const trigger = geminiDeleteConversationActionButton();
    if (!trigger) return deleteResult(false, "gemini", "conversation menu trigger not found");
    const clickedItem = await clickGeminiDeleteMenuItem(trigger);
    if (!clickedItem) return deleteResultWithTrustedMenuClick("gemini", "delete menu item not found", trigger);
    const confirmed = await clickDeleteConfirmIfPresent(6500);
    if (confirmed) return deleteResult(true, "gemini");
    if (deleteDialogRoots().length) return deleteResultWithTrustedConfirm("gemini", "delete confirmation did not close");
    const stillOpenItem = findGeminiDeleteMenuItem(trigger);
    if (stillOpenItem) return deleteResultWithTrustedMenuClick("gemini", "delete menu item did not open confirmation", stillOpenItem);
    return deleteResult(false, "gemini", "delete confirmation button not found");
  }

  function findNotionDeleteMenuTrigger() {
    const selectors = [
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

  async function deleteNotionThread() {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6500);
      return confirmedExisting
        ? deleteResult(true, "notion")
        : deleteResultWithTrustedConfirm("notion", "delete confirmation did not close");
    }
    const labels = ["Delete", "Delete topic", "删除", "删除话题"];
    const trigger = findNotionDeleteMenuTrigger();
    if (!trigger) return deleteResult(false, "notion", "conversation menu trigger not found");
    if (!await openTriggerAndClickDelete(trigger, labels)) return deleteResult(false, "notion", "delete menu item not found");
    const confirmed = await clickDeleteConfirmIfPresent(6500);
    if (!confirmed && deleteDialogRoots().length) return deleteResultWithTrustedConfirm("notion", "delete confirmation did not close");
    if (!confirmed) return deleteResultWithTrustedConfirm("notion", "delete confirmation button not found");
    return deleteResult(true, "notion");
  }
  return Object.freeze({
    deleteKagiThread,
    deleteChatGptThread,
    deleteGrokThread,
    deleteGeminiThread,
    deleteNotionThread,
    menuRootsWithDelete,
    findDeleteMenuItem,
    findOpenDeleteMenuItem,
    openTriggerAndClickDelete,
    topRightMenuTrigger,
    findNotionDeleteMenuTrigger
  });
}
