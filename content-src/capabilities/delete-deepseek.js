export function createDeleteDeepSeekCapability(deps = {}) {
  const {
    qsa,
    visible,
    modelRect,
    deleteElementText,
    modelElementArea,
    firstVisibleBySelectors,
    visibleSelectorElements,
    svgSignature,
    deleteCompactToken,
    modelElementFromPoint,
    deleteClickableElement,
    isDisabledElement,
    dispatchPointerActivation,
    nativeModelClick,
    modelDirectClick,
    waitForModel,
    deleteClick,
    normalize,
    trustedMenuClickForElement,
    trustedMenuClickPoint,
    serializableDeleteRect,
    deleteResult,
    layoutDeleteCandidates,
    modelEventConstructor,
    reveal,
    closest,
    menuRootsWithDelete,
    findOpenDeleteMenuItem,
    deleteActivateUntil,
    sleep,
    findDeleteMenuItem,
    deleteClickLayout,
    findDeleteConfirmButton,
    clickDeleteConfirmIfPresent,
    DEEPSEEK_DELETE_SOURCE
  } = deps;
  function deepSeekChatLinks(root = document) {
    return qsa("a[href*='/chat/s/'],a[href*='/a/chat/s/']", root, { all: true })
      .filter((link) => visible(link) && modelRect(link));
  }

  function deepSeekSidebarRootFromLinks() {
    const links = deepSeekChatLinks(document)
      .filter((link) => {
        const rect = modelRect(link);
        return rect && rect.left <= 470 && rect.width >= 100 && rect.height >= 20 && rect.height <= 96;
      });
    if (!links.length) return null;
    const currentId = deepSeekChatIdFromHref(location.href);
    const current = currentId ? links.find((link) => deepSeekChatIdFromHref(link.href || link.getAttribute?.("href")) === currentId) : null;
    const seeds = current ? [current] : links.slice(0, 4);
    const scoreRoot = (root) => {
      if (!root || !root.isConnected) return null;
      const rect = modelRect(root);
      if (!rect || rect.left > 560 || rect.width < 120 || rect.width > 620 || rect.height < 40) return null;
      const rootLinks = deepSeekChatLinks(root).length;
      if (rootLinks < (current ? 1 : 2)) return null;
      const value = deleteElementText(root);
      const className = String(root.className || "");
      const hasHistoryText = /today|yesterday|pinned|new chat|今天|昨天|新聊天|置顶/i.test(value);
      const looksScrollable = /scroll|history|sidebar|sider/i.test(className);
      if (!hasHistoryText && !looksScrollable && rootLinks < 3) return null;
      return (looksScrollable ? 900 : 0) + Math.min(rootLinks, 12) * 80 + Math.min(rect.height, 900) * 0.02 - rect.left;
    };
    const candidates = [];
    const seen = new Set();
    for (const seed of seeds) {
      for (let node = seed; node && node !== document.body; node = node.parentElement) {
        if (seen.has(node)) continue;
        seen.add(node);
        const score = scoreRoot(node);
        if (score == null) continue;
        candidates.push({ element: node, score, area: modelElementArea(node) });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.area - b.area);
    return candidates[0]?.element || null;
  }

  function deepSeekSidebarRoot() {
    const linkRoot = deepSeekSidebarRootFromLinks();
    if (linkRoot) return linkRoot;
    return null;
  }

  function findDeepSeekSidebarToggle() {
    const direct = firstVisibleBySelectors([
      "button[aria-label*='sidebar' i]",
      "[role='button'][aria-label*='sidebar' i]",
      "button[title*='sidebar' i]",
      "[role='button'][title*='sidebar' i]",
      "button:has(svg path[d*='M9.67269'])",
      "[role='button']:has(svg path[d*='M9.67269'])"
    ]);
    if (direct) return direct;
    const candidates = visibleSelectorElements("button,[role='button']")
      .map((element) => ({ element, rect: modelRect(element), text: deleteElementText(element), svg: svgSignature(element) }))
      .filter((item) => item.rect && item.rect.top <= 90 && item.rect.left <= 130 && item.rect.width >= 20 && item.rect.width <= 64 && item.rect.height >= 20 && item.rect.height <= 64)
      .filter((item) => /sidebar|menu|panel|sider|侧边栏|菜单/i.test(item.text) || /sidebar|panel|menu|M9\.67269/i.test(item.svg));
    candidates.sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
    return candidates[0]?.element || findDeepSeekTopHeaderIconButton(0) || findDeepSeekTopHeaderIconButton(1) || null;
  }

  function findDeepSeekTopHeaderIconButton(indexFromLeft = 0) {
    const buttons = visibleSelectorElements("button,a[href],[role='button'],[onclick],[tabindex]:not([tabindex='-1'])")
      .map((element) => ({ element, rect: modelRect(element), text: deleteElementText(element) }))
      .filter((item) => item.rect && item.rect.top >= 0 && item.rect.top < 90 && item.rect.left >= 0 && item.rect.left < 420)
      .filter((item) => item.rect.width >= 16 && item.rect.width <= 56 && item.rect.height >= 16 && item.rect.height <= 56)
      .filter((item) => !deleteCompactToken(item.text));
    buttons.sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
    return buttons[indexFromLeft]?.element || buttons[0]?.element || null;
  }

  async function clickDeepSeekSidebarToggleByPoint() {
    const points = [
      { x: 22, y: 28 },
      { x: 22, y: 44 },
      { x: 22, y: 60 },
      { x: 46, y: 28 },
      { x: 46, y: 44 },
      { x: 46, y: 60 }
    ];
    for (const point of points) {
      const target = modelElementFromPoint(point);
      const button = deleteClickableElement(target);
      const rect = modelRect(button);
      if (!button || !rect || !visible(button) || isDisabledElement(button)) continue;
      if (rect.top > 96 || rect.left > 110 || rect.width > 80 || rect.height > 80) continue;
      if (!dispatchPointerActivation(button, point) && !nativeModelClick(button) && !modelDirectClick(button)) continue;
      if (await waitForModel(deepSeekSidebarRoot, 1400, 100)) return true;
    }
    return false;
  }

  async function ensureDeepSeekSidebarOpen() {
    if (deepSeekSidebarRoot()) return true;
    const toggle = findDeepSeekSidebarToggle();
    if (toggle && deleteClick(toggle) && await waitForModel(deepSeekSidebarRoot, 3200, 120)) return true;
    return clickDeepSeekSidebarToggleByPoint();
  }

  function deepSeekTitleTokenFromValue(value) {
    const raw = normalize(value || "")
      .replace(/\s*[-|–]\s*DeepSeek.*$/i, "")
      .replace(/\s*-\s*深度求索.*$/i, "");
    const token = deleteCompactToken(raw);
    return /^(deepseek|deepseekintotheunknown|intotheunknown|newchat|新聊天)$/.test(token) ? "" : token;
  }

  function deepSeekChatIdFromHref(value) {
    const match = String(value || "").match(/\/(?:a\/)?chat\/s\/([^/?#]+)/i);
    return match?.[1] || "";
  }

  function deepSeekDeleteHints(data = {}) {
    const titleTokens = new Set([
      document.title,
      data.currentTitle,
      data.title
    ].map(deepSeekTitleTokenFromValue).filter(Boolean));
    return {
      titleTokens: Array.from(titleTokens)
    };
  }

  function findDeepSeekCurrentTopicRow(root) {
    if (!root) return null;
    const links = deepSeekChatLinks(root);
    const currentId = deepSeekChatIdFromHref(location.href);
    if (!currentId) return null;
    return links.find((link) => deepSeekChatIdFromHref(link.href || link.getAttribute?.("href")) === currentId) || null;
  }

  function deepSeekVisualTopicRow(row) {
    const rowRect = modelRect(row);
    if (!row || !rowRect) return row;
    const rowText = deleteCompactToken(deleteElementText(row));
    let best = { element: row, score: 0 };
    for (let node = row, depth = 0; node && node !== document.body && depth < 8; node = node.parentElement, depth += 1) {
      const rect = modelRect(node);
      if (!rect || rect.left > 560 || rect.width < 110 || rect.width > 620 || rect.height < 28 || rect.height > 110) continue;
      if (rect.top > rowRect.top + 10 || rect.bottom < rowRect.bottom - 10) continue;
      const token = deleteCompactToken(deleteElementText(node));
      if (rowText && token && !token.includes(rowText) && !rowText.includes(token)) continue;
      const className = String(node.className || "");
      const active = /\b(active|selected|current)\b/i.test(className) || String(node.getAttribute?.("aria-current") || "").toLowerCase() === "page";
      const buttons = qsa("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", node, { all: true }).length;
      const score = rect.width + (active ? 420 : 0) + Math.min(buttons, 3) * 90 - depth * 12;
      if (score > best.score) best = { element: node, score };
    }
    return best.element || row;
  }

  function deepSeekRowMenuRightEdge(row, visualRow = row) {
    const rowRect = modelRect(visualRow) || modelRect(row);
    if (!rowRect) return rowRect?.right || 0;
    const roots = [];
    const sidebar = deepSeekSidebarRoot();
    if (sidebar) roots.push(sidebar);
    for (let node = visualRow || row; node && node !== document.body && roots.length < 8; node = node.parentElement) roots.push(node);
    const candidates = roots
      .map((element) => ({ element, rect: modelRect(element) }))
      .filter((item) => item.rect
        && item.rect.left <= 560
        && item.rect.width >= 140
        && item.rect.width <= 620
        && item.rect.top <= rowRect.top + 8
        && item.rect.bottom >= rowRect.bottom - 8)
      .map((item) => item.rect.right);
    return Math.max(rowRect.right, ...candidates);
  }

  function deepSeekTopicMenuRect(row) {
    const visualRow = deepSeekVisualTopicRow(row);
    const rowRect = modelRect(visualRow) || modelRect(row);
    if (!rowRect) return null;
    const right = Math.max(rowRect.right, deepSeekRowMenuRightEdge(row, visualRow));
    return {
      left: rowRect.left,
      top: rowRect.top,
      right,
      bottom: rowRect.bottom,
      width: right - rowRect.left,
      height: rowRect.height
    };
  }

  function deepSeekTrustedMenuClick(row, trigger = null, reason = "topic menu trigger requires trusted browser input") {
    const rowRect = deepSeekTopicMenuRect(row);
    const triggerClick = trustedMenuClickForElement(trigger, "deepseek", reason);
    if (!rowRect) return triggerClick;
    const y = rowRect.top + rowRect.height / 2;
    const points = [18, 28, 38, 48, 60, 76, 96, 118, 142]
      .map((offset) => ({
        x: Math.max(rowRect.left + 16, rowRect.right - offset),
        y
      }));
    if (triggerClick?.framePoint) points.push(triggerClick.framePoint);
    const seen = new Set();
    const framePoints = points
      .map((point) => ({
        x: Math.round(Number(point.x) * 100) / 100,
        y: Math.round(Number(point.y) * 100) / 100
      }))
      .filter((point) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
        const key = `${point.x},${point.y}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const primary = framePoints[0];
    const trustedMenuClick = primary
      ? trustedMenuClickPoint("deepseek", reason, primary, serializableDeleteRect(rowRect))
      : triggerClick;
    return trustedMenuClick ? { ...trustedMenuClick, framePoints, hoverSettleMs: 360 } : null;
  }

  function deleteResultWithDeepSeekTrustedMenuClick(reason, row, trigger = null) {
    const trustedMenuClick = deepSeekTrustedMenuClick(row, trigger, reason);
    return deleteResult(false, "deepseek", reason, trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {});
  }

  function deepSeekTrustedKeySequence(row, reason = "topic menu trigger requires keyboard focus") {
    const rowRect = deepSeekTopicMenuRect(row);
    const visualRect = modelRect(deepSeekVisualTopicRow(row)) || modelRect(row) || rowRect;
    if (!rowRect || !visualRect) return null;
    const focusX = Math.min(
      rowRect.right - 104,
      Math.max(rowRect.left + 24, visualRect.left + Math.min(180, visualRect.width * 0.42))
    );
    return {
      kind: "topic-menu-keyboard",
      site: "deepseek",
      reason: String(reason || ""),
      framePoint: {
        x: Math.round(focusX * 100) / 100,
        y: Math.round((rowRect.top + rowRect.height / 2) * 100) / 100
      },
      frameRect: serializableDeleteRect(rowRect),
      keys: [
        { key: "Tab", settleMs: 140 },
        { key: "Enter", settleMs: 260 }
      ],
      clickSettleMs: 160,
      keySettleMs: 140,
      settleMs: 460
    };
  }

  function deleteResultWithDeepSeekTrustedKeySequence(reason, row) {
    const trustedKeySequence = deepSeekTrustedKeySequence(row, reason);
    const trustedMenuClick = deepSeekTrustedMenuClick(row, null, reason);
    return deleteResult(false, "deepseek", reason, {
      ...(trustedKeySequence ? { needsTrustedKeySequence: true, trustedKeySequence } : {}),
      ...(trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {})
    });
  }

  function closeDeepSeekTransientMenus() {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
    } catch {}
  }

  function deepSeekHeaderMenuButton(hints = deepSeekDeleteHints()) {
    const titleTokens = (hints.titleTokens || []).filter(Boolean);
    if (!titleTokens.length) return null;
    const titleNodes = [];
    const seenTitles = new Set();
    for (const element of qsa("h1,h2,h3,button,[role='button'],div,span", document, { all: true })) {
      if (!element || seenTitles.has(element) || !visible(element)) continue;
      const rect = modelRect(element);
      if (!rect || rect.top < 0 || rect.top > 190 || rect.left < 120 || rect.width < 20 || rect.height < 14 || rect.height > 92) continue;
      if (String(element.href || element.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) continue;
      if (element.closest?.("a[href*='/chat/s/'],a[href*='/a/chat/s/']") || qsa("a[href*='/chat/s/'],a[href*='/a/chat/s/']", element, { all: true }).length) continue;
      const token = deleteCompactToken(deleteElementText(element));
      if (!token || !titleTokens.some((item) => token.includes(item) || item.includes(token))) continue;
      seenTitles.add(element);
      titleNodes.push({ element, rect });
    }
    const candidates = [];
    const seenButtons = new Set();
    const addButton = (button, titleRect, extraScore = 0) => {
      const target = deleteClickableElement(button);
      if (!target || seenButtons.has(target) || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 10 || rect.height < 10 || rect.width > 76 || rect.height > 76) return;
      if (rect.top > titleRect.bottom + 34 || rect.bottom < titleRect.top - 34) return;
      if (rect.left < titleRect.left - 72 || rect.left > titleRect.right + 260) return;
      if (String(target.href || target.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) return;
      const value = deleteElementText(target);
      const token = deleteCompactToken(value);
      if (/newchat|sidebar|back|close|search|send|deepthink|model|expert|share|copy|新聊天|侧边栏|返回|关闭|搜索|发送|分享|复制/.test(token)) return;
      const signature = deleteCompactToken(svgSignature(target));
      const iconish = !token || /more|menu|options|ellipsis|dots|circle|kebab|更多|菜单|选项/.test(token + signature) || qsa("circle", target, { all: true }).length >= 2 || rect.width <= 44;
      if (!iconish) return;
      seenButtons.add(target);
      candidates.push({
        element: target,
        score: extraScore
          + (rect.left >= titleRect.right - 8 ? 520 : 0)
          + (!token ? 180 : 0)
          + (/more|menu|options|ellipsis|dots|更多|菜单|选项/.test(token + signature) ? 360 : 0)
          + (/circle|dots|ellipsis|kebab/.test(signature) ? 180 : 0)
          + Math.max(0, 160 - Math.abs(rect.left - titleRect.right)),
        right: rect.right,
        left: rect.left
      });
    };
    for (const { element, rect: titleRect } of titleNodes.slice(0, 8)) {
      for (let scope = element, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
        const scopeRect = modelRect(scope);
        if (!scopeRect || scopeRect.top > 210 || scopeRect.height > 180 || scopeRect.width > 900) continue;
        for (const button of layoutDeleteCandidates(scope, "button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])")) {
          addButton(button, titleRect, 120 - depth * 12);
        }
      }
      for (const button of qsa("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", document, { all: true })) {
        addButton(button, titleRect, 0);
      }
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.left - a.left);
    return candidates[0]?.element || null;
  }

  function hoverDeepSeekTopicRow(row) {
    const rowRect = modelRect(row);
    if (!rowRect) return;
    const point = { clientX: Math.max(rowRect.left + 16, rowRect.right - 24), clientY: rowRect.top + rowRect.height / 2 };
    const targets = [];
    for (let node = row; node && node !== document.body && targets.length < 5; node = node.parentElement) targets.push(node);
    for (const target of targets) {
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

  function deepSeekTopicMoreButton(row) {
    if (!row) return null;
    reveal(row);
    const visualRow = deepSeekVisualTopicRow(row);
    const rowRect = deepSeekTopicMenuRect(row);
    hoverDeepSeekTopicRow(visualRow || row);
    if (!rowRect) return null;
    const candidates = [];
    const seen = new Set();
    const add = (button, source = "", extraScore = 0) => {
      const target = deleteClickableElement(button);
      if (!target || seen.has(target) || target === row || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 10 || rect.height < 10 || rect.width > 72 || rect.height > 72) return;
      const overlaps = rect.top < rowRect.bottom + 10 && rect.bottom > rowRect.top - 10;
      const nearRight = rect.left >= rowRect.right - 120 && rect.left <= rowRect.right + 80;
      if (!overlaps || !nearRight) return;
      const value = deleteElementText(target);
      const compact = deleteCompactToken(value);
      if (compact && !/more|options|menu|ellipsis|dots|更多|菜单|选项/.test(compact)) return;
      if (String(target.href || target.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) return;
      const signature = svgSignature(target);
      const iconish = !compact || /more|options|menu|ellipsis|dots|circle/.test(signature) || qsa("circle", target).length >= 2 || rect.width <= 44;
      if (!iconish) return;
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore
          + (visible(target) ? 140 : 40)
          + (!compact ? 180 : 0)
          + (/more|options|menu|更多|菜单|选项/.test(compact) ? 220 : 0)
          + (/ellipsis|more|dots|circle/.test(signature) ? 120 : 0)
          + Math.max(0, 90 - Math.abs((rect.left + rect.right) / 2 - (rowRect.right - 28))),
        right: rect.right,
        source
      });
    };
    const scopes = [];
    for (const seed of [visualRow, row]) {
      for (let node = seed; node && node !== document.body && scopes.length < 8; node = node.parentElement) {
        if (!scopes.includes(node)) scopes.push(node);
      }
    }
    const iconSelector = "button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i],svg,[class*='more' i],[class*='menu' i],[class*='option' i],[class*='action' i],[class*='ellipsis' i]";
    for (const scope of scopes) {
      for (const button of layoutDeleteCandidates(scope, iconSelector)) add(button, "scope", 80);
    }
    for (const offset of [18, 28, 38, 48, 60, 76, 96, 118, 142]) {
      const point = { x: Math.max(rowRect.left + 16, rowRect.right - offset), y: rowRect.top + rowRect.height / 2 };
      const pointTarget = modelElementFromPoint(point, row);
      if (pointTarget) add(pointTarget, "point", 160 - offset);
      const pointButton = pointTarget && closest(pointTarget, iconSelector);
      if (pointButton) add(pointButton, "point-button", 180 - offset);
    }
    for (const button of qsa(iconSelector, document, { all: true })) add(button, "nearby", 0);
    candidates.sort((a, b) => b.score - a.score || b.right - a.right);
    return candidates[0]?.element || null;
  }

  async function openDeepSeekTriggerAndClickDelete(trigger, labels, { timeoutMs = 3200, allowHiddenTrigger = false, guard = null } = {}) {
    if (!trigger) return false;
    const guarded = () => typeof guard !== "function" || guard() === true;
    if (!guarded()) return false;
    const menuReady = () => menuRootsWithDelete(labels)[0] || findOpenDeleteMenuItem(labels);
    if (menuReady()) return false;
    if (!await deleteActivateUntil(trigger, menuReady, { allowHidden: allowHiddenTrigger, settleMs: 220 })) return false;
    await sleep(140);
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const root = menuRootsWithDelete(labels)[0] || null;
      const item = (root ? findDeleteMenuItem(root, labels) : null) || findOpenDeleteMenuItem(labels);
      if (item && guarded() && (deleteClick(item) || deleteClickLayout(item))) return true;
      await sleep(120);
    }
    return false;
  }

  let deepSeekPendingTrustedAttempt = null;

  function deepSeekTrustedRetryRequested(data = {}) {
    return Boolean(data?.trustedMenuClickRetried || data?.trustedKeySequenceRetried);
  }

  function deepSeekAttemptIdentity(data = {}) {
    return {
      attemptId: normalize(data?.deleteAttemptId),
      routeId: deepSeekChatIdFromHref(location.href)
    };
  }

  function deepSeekTrustedRetryOwned(data = {}) {
    const identity = deepSeekAttemptIdentity(data);
    return Boolean(
      identity.attemptId
      && identity.routeId
      && deepSeekPendingTrustedAttempt?.attemptId === identity.attemptId
      && deepSeekPendingTrustedAttempt?.routeId === identity.routeId
      && deepSeekPendingTrustedAttempt?.phase === "awaiting-menu-trigger"
      && deepSeekPendingTrustedAttempt?.baseline === "no-delete-ui"
      && Number(deepSeekPendingTrustedAttempt?.expiresAt) >= Date.now()
    );
  }

  function armDeepSeekTrustedRetry(data = {}, value = {}) {
    const identity = deepSeekAttemptIdentity(data);
    if (!identity.attemptId || !identity.routeId) {
      deepSeekPendingTrustedAttempt = null;
      return deleteResult(false, "deepseek", `${value.reason || "trusted retry required"}; trusted retry ownership unavailable`);
    }
    deepSeekPendingTrustedAttempt = { ...identity, phase: "awaiting-menu-trigger", baseline: "no-delete-ui", expiresAt: Date.now() + 20000 };
    return value;
  }

  function validateDeepSeekTrustedCoordinates(value = {}) {
    const needsTrusted = value?.needsTrustedHover || value?.needsTrustedMenuClick || value?.needsTrustedKeySequence;
    if (!needsTrusted) return { ok: true, instructions: {} };
    const root = deepSeekSidebarRoot();
    const row = findDeepSeekCurrentTopicRow(root);
    const rowRect = row ? deepSeekTopicMenuRect(row) : null;
    if (!root || !row || !rowRect) {
      return { ok: false, reason: "MAIN trusted-input result has no independently verified current sidebar row" };
    }
    const pointInside = (point) => {
      const x = Number(point?.x);
      const y = Number(point?.y);
      return Number.isFinite(x)
        && Number.isFinite(y)
        && x >= rowRect.left - 8
        && x <= rowRect.right + 8
        && y >= rowRect.top - 8
        && y <= rowRect.bottom + 8;
    };
    const pointInMenuStrip = (point) => pointInside(point) && Number(point?.x) >= rowRect.right - 160;
    const pointInSafeText = (point) => pointInside(point)
      && Number(point?.x) >= rowRect.left + 12
      && Number(point?.x) <= rowRect.right - 80;
    const cleanPoint = (point) => ({
      x: Math.round(Number(point?.x) * 100) / 100,
      y: Math.round(Number(point?.y) * 100) / 100
    });
    const cleanRect = {
      left: Math.round(Number(rowRect.left) * 100) / 100,
      top: Math.round(Number(rowRect.top) * 100) / 100,
      right: Math.round(Number(rowRect.right) * 100) / 100,
      bottom: Math.round(Number(rowRect.bottom) * 100) / 100,
      width: Math.round(Number(rowRect.width || rowRect.right - rowRect.left) * 100) / 100,
      height: Math.round(Number(rowRect.height || rowRect.bottom - rowRect.top) * 100) / 100
    };
    const instructions = {};
    if (value?.needsTrustedHover && !pointInMenuStrip(value?.trustedHover?.framePoint)) {
      return { ok: false, reason: "MAIN trusted hover is outside the independently verified current row" };
    }
    if (value?.needsTrustedHover) {
      instructions.needsTrustedHover = true;
      instructions.trustedHover = {
        kind: "topic-menu-hover",
        site: "deepseek",
        framePoint: cleanPoint(value.trustedHover.framePoint),
        frameRect: cleanRect,
        hoverSettleMs: 520
      };
    }
    if (value?.needsTrustedMenuClick) {
      const click = value?.trustedMenuClick || {};
      const points = Array.isArray(click.framePoints) && click.framePoints.length ? click.framePoints : [click.framePoint];
      if (!points.length || points.length > 12 || points.some((point) => !pointInMenuStrip(point))) {
        return { ok: false, reason: "MAIN trusted menu click is outside the independently verified current row" };
      }
      const cleanPoints = points.map(cleanPoint);
      instructions.needsTrustedMenuClick = true;
      instructions.trustedMenuClick = {
        kind: "topic-menu-trigger",
        site: "deepseek",
        framePoint: cleanPoints[0],
        framePoints: cleanPoints,
        frameRect: cleanRect,
        hoverSettleMs: 360
      };
    }
    if (value?.needsTrustedKeySequence) {
      const sequence = value?.trustedKeySequence || {};
      const keys = Array.isArray(sequence.keys) ? sequence.keys : [];
      const keyName = (entry) => String(typeof entry === "string" ? entry : entry?.key || "").toLowerCase();
      const safeKey = (entry) => {
        const item = typeof entry === "string" ? { key: entry } : entry || {};
        const settleMs = Number(item.settleMs);
        return !item.shiftKey
          && !item.ctrlKey
          && !item.metaKey
          && !item.altKey
          && Number(item.modifiers || 0) === 0
          && Number.isFinite(settleMs)
          && settleMs >= 0
          && settleMs <= 600;
      };
      const boundedSettle = (value, max) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max;
      const safeSequence = keys.length === 2
        && keyName(keys[0]) === "tab"
        && /^(?:enter|return)$/.test(keyName(keys[1]))
        && keys.every(safeKey)
        && boundedSettle(sequence.clickSettleMs, 500)
        && boundedSettle(sequence.keySettleMs, 500)
        && boundedSettle(sequence.settleMs, 1200);
      if (!pointInSafeText(sequence.framePoint) || !safeSequence) {
        return { ok: false, reason: "MAIN trusted key sequence is outside the verified DeepSeek contract" };
      }
      instructions.needsTrustedKeySequence = true;
      instructions.trustedKeySequence = {
        kind: "topic-menu-keyboard",
        site: "deepseek",
        framePoint: cleanPoint(sequence.framePoint),
        frameRect: cleanRect,
        keys: [
          { key: "Tab", settleMs: 140 },
          { key: "Enter", settleMs: 260 }
        ],
        clickSettleMs: 160,
        keySettleMs: 140,
        settleMs: 460
      };
    }
    return { ok: true, row, rowRect, instructions };
  }

  function sanitizeDeepSeekTrustedResult(value = {}, validation = {}) {
    const sanitized = { ...value };
    for (const key of [
      "needsTrustedHover",
      "trustedHover",
      "needsTrustedMenuClick",
      "trustedMenuClick",
      "needsTrustedKeySequence",
      "trustedKeySequence"
    ]) delete sanitized[key];
    return { ...sanitized, ...(validation.instructions || {}) };
  }

  function validateDeepSeekBridgeTrustedResult(bridged = {}, data = {}, currentRouteId = "") {
    const needsTrusted = bridged?.needsTrustedHover || bridged?.needsTrustedMenuClick || bridged?.needsTrustedKeySequence;
    if (!needsTrusted) return { ok: true };
    const attemptId = normalize(data?.deleteAttemptId);
    if (!attemptId || normalize(bridged?.deleteAttemptId) !== attemptId || String(bridged?.routeId || "") !== currentRouteId) {
      return { ok: false, reason: "MAIN trusted-input result does not match the current attempt and route" };
    }
    return validateDeepSeekTrustedCoordinates(bridged);
  }

  function deepSeekBridgeFallbackDisposition(bridged = {}, retryRequested = false) {
    const reason = String(bridged?.reason || "MAIN delete bridge failed");
    const explicitlyPreDelivery = bridged?.delivered === false && bridged?.phase === "pre-delete";
    if (!explicitlyPreDelivery || retryRequested) return { useNativeFallback: false, reason };
    return { useNativeFallback: true, reason };
  }

  async function deleteDeepSeekThread(data = {}) {
    const currentRouteId = deepSeekChatIdFromHref(location.href);
    const attemptId = normalize(data?.deleteAttemptId);
    if (!currentRouteId) return deleteResult(false, "deepseek", "stable current conversation route is required");
    if (!attemptId) return deleteResult(false, "deepseek", "delete attempt identity is required");
    const routeStillCurrent = () => deepSeekChatIdFromHref(location.href) === currentRouteId;
    const retryRequested = deepSeekTrustedRetryRequested(data);
    const nativeRetryOwned = retryRequested && deepSeekTrustedRetryOwned(data);
    if (!retryRequested) deepSeekPendingTrustedAttempt = null;
    if (nativeRetryOwned) deepSeekPendingTrustedAttempt = null;
    await ensureDeepSeekSidebarOpen();
    if (!routeStillCurrent()) {
      return deleteResult(false, "deepseek", "current conversation changed while preparing deletion");
    }
    const labels = ["Delete", "删除"];
    if (findDeleteConfirmButton()) {
      return deleteResult(false, "deepseek", "unverified delete confirmation is already open");
    }
    if (nativeRetryOwned) {
      const deleteItem = await waitForModel(() => findOpenDeleteMenuItem(labels), 3200, 90);
      if (deleteItem) {
        if (!routeStillCurrent()) return deleteResult(false, "deepseek", "current conversation changed during trusted menu retry");
        if (!deleteClick(deleteItem) && !deleteClickLayout(deleteItem)) {
          return deleteResult(false, "deepseek", "explicit Delete action could not be safely activated");
        }
        const confirmedAfterTrustedMenu = await clickDeleteConfirmIfPresent(6500, routeStillCurrent);
        if (!confirmedAfterTrustedMenu) return deleteResult(false, "deepseek", "delete confirmation button not found");
        return deleteResult(true, "deepseek");
      }
      if (data?.trustedMenuClickRetried) {
        if (!routeStillCurrent()) return deleteResult(false, "deepseek", "current conversation changed during trusted menu retry");
        if (findOpenDeleteMenuItem(labels) || findDeleteConfirmButton()) {
          return deleteResult(false, "deepseek", "delete menu state is not clean; trusted retry was not renewed");
        }
        return armDeepSeekTrustedRetry(data, deleteResult(false, "deepseek", "trusted topic menu click did not open"));
      }
    }
    let bridgeReason = "";
    let useNativeFallback = nativeRetryOwned;
    if (!useNativeFallback) {
      const bridged = await requestDeepSeekDeleteBridge(10500, data);
      const trustedValidation = validateDeepSeekBridgeTrustedResult(bridged, data, currentRouteId);
      if (!trustedValidation.ok) return deleteResult(false, "deepseek", trustedValidation.reason);
      const safeBridged = sanitizeDeepSeekTrustedResult(bridged, trustedValidation);
      const hasTrustedBridgeInstruction = Boolean(
        (safeBridged?.needsTrustedHover && safeBridged.trustedHover)
        || (safeBridged?.needsTrustedMenuClick && safeBridged.trustedMenuClick)
        || (safeBridged?.needsTrustedKeySequence && safeBridged.trustedKeySequence)
      );
      if (hasTrustedBridgeInstruction) {
        return deleteResult(false, "deepseek", safeBridged.reason || "topic menu trigger requires trusted browser input", {
          ...(safeBridged?.needsTrustedHover && safeBridged.trustedHover
            ? { needsTrustedHover: true, trustedHover: safeBridged.trustedHover }
            : {}),
          ...(safeBridged?.needsTrustedMenuClick && safeBridged.trustedMenuClick
            ? { needsTrustedMenuClick: true, trustedMenuClick: safeBridged.trustedMenuClick }
            : {}),
          ...(safeBridged?.needsTrustedKeySequence && safeBridged.trustedKeySequence
            ? { needsTrustedKeySequence: true, trustedKeySequence: safeBridged.trustedKeySequence }
            : {})
        });
      }
      if (bridged?.ok) return deleteResult(true, "deepseek");
      const disposition = deepSeekBridgeFallbackDisposition(bridged, retryRequested);
      bridgeReason = disposition.reason;
      if (!disposition.useNativeFallback) return deleteResult(false, "deepseek", bridgeReason);
      useNativeFallback = disposition.useNativeFallback;
    }
    if (!useNativeFallback) return deleteResult(false, "deepseek", bridgeReason || "native fallback is unavailable");
    if (!routeStillCurrent()) {
      return deleteResult(false, "deepseek", "current conversation changed before native delete fallback");
    }
    const root = deepSeekSidebarRoot();
    const hints = deepSeekDeleteHints(data);
    const row = findDeepSeekCurrentTopicRow(root);
    let rowFailureReason = bridgeReason || "current topic row not found";
    let moreButton = null;
    if (row) {
      moreButton = await waitForModel(() => deepSeekTopicMoreButton(row), 1600, 100);
      if (moreButton) {
        if (await openDeepSeekTriggerAndClickDelete(moreButton, labels, { timeoutMs: 2600, allowHiddenTrigger: true, guard: routeStillCurrent })) {
          const confirmed = await clickDeleteConfirmIfPresent(6500, routeStillCurrent);
          if (!confirmed) return deleteResult(false, "deepseek", bridgeReason || "delete confirmation button not found");
          return deleteResult(true, "deepseek");
        }
        rowFailureReason = bridgeReason || "delete menu item not found";
      } else {
        rowFailureReason = bridgeReason || "topic menu trigger not found";
      }
      closeDeepSeekTransientMenus();
    }
    if (!routeStillCurrent()) return deleteResult(false, "deepseek", "current conversation changed before header delete fallback");
    const headerButton = deepSeekHeaderMenuButton(hints);
    if (headerButton && await openDeepSeekTriggerAndClickDelete(headerButton, labels, { timeoutMs: 2600, allowHiddenTrigger: true, guard: routeStillCurrent })) {
      const confirmedFromHeader = await clickDeleteConfirmIfPresent(6500, routeStillCurrent);
      if (!confirmedFromHeader) return deleteResult(false, "deepseek", bridgeReason || "delete confirmation button not found");
      return deleteResult(true, "deepseek");
    }
    if (headerButton) closeDeepSeekTransientMenus();
    if (!row) return deleteResult(false, "deepseek", rowFailureReason);
    const cleanBaseline = await waitForModel(() => !findOpenDeleteMenuItem(labels) && !findDeleteConfirmButton(), 700, 70);
    if (!cleanBaseline) return deleteResult(false, "deepseek", "delete menu state remained open; trusted retry was not leased");
    return armDeepSeekTrustedRetry(
      data,
      data?.trustedKeySequenceRetried
        ? deleteResultWithDeepSeekTrustedMenuClick(rowFailureReason, row, moreButton)
        : deleteResultWithDeepSeekTrustedKeySequence(rowFailureReason, row)
    );
  }

  const TOPIC_DELETE_FALLBACK_CONFIGS = Object.freeze({
    chatgpt: Object.freeze({
      id: "chatgpt",
      name: "ChatGPT",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 15000
    }),
    gemini: Object.freeze({
      id: "gemini",
      name: "Gemini",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 18000
    }),
    kagi: Object.freeze({
      id: "kagi",
      name: "Kagi Assistant",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 15000
    }),
    grok: Object.freeze({
      id: "grok",
      name: "Grok",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 15000
    }),
    grokMirror: Object.freeze({
      id: "grokMirror",
      name: "Grok Mirror",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 15000
    }),
    notion: Object.freeze({
      id: "notion",
      name: "Notion AI",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 15000
    }),
    deepseek: Object.freeze({
      id: "deepseek",
      name: "DeepSeek",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 36000
    })
  });

  function requestDeepSeekDeleteBridge(timeoutMs = 9000, data = {}) {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage, true);
        resolve({ ok: false, delivered: "unknown", phase: "unknown", reason: "bridge timeout" });
      }, Math.max(500, Number(timeoutMs) || 9000));
      function onMessage(event) {
        const message = event.data;
        if (message?.source !== DEEPSEEK_DELETE_SOURCE || message.type !== "response" || message.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        resolve({
          ...message,
          delivered: message?.delivered === true || message?.delivered === false ? message.delivered : "unknown",
          phase: typeof message?.phase === "string" ? message.phase : "unknown"
        });
      }
      window.addEventListener("message", onMessage, true);
      try {
        window.postMessage({ source: DEEPSEEK_DELETE_SOURCE, type: "request", action: "deleteThread", id, data }, "*");
      } catch (error) {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        resolve({ ok: false, delivered: false, phase: "pre-delete", reason: error?.message || String(error || "bridge failed") });
      }
    });
  }
  return Object.freeze({
    deleteDeepSeekThread,
    validateDeepSeekTrustedCoordinates,
    sanitizeDeepSeekTrustedResult,
    TOPIC_DELETE_FALLBACK_CONFIGS
  });
}
