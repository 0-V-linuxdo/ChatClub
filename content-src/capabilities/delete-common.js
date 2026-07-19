export function createDeleteCommonCapability(deps = {}) {
  const {
    normalize,
    buttonText,
    modelElementText,
    qsa,
    classText,
    visible,
    isDisabledElement,
    modelRect,
    closest,
    modelClick,
    modelDirectClick,
    modelCenterPoint,
    modelElementFromPoint,
    modelCustomActivationAncestor,
    modelClickableAncestor,
    dispatchPointerActivation,
    nativeModelClick,
    activateElement,
    sleep,
    visibleSelectorElements,
    modelElementArea,
    deleteCompletionTargetState,
    DELETE_COMPLETION_STATE_VERSION,
    modelEventConstructor
  } = deps;
  function deleteResult(ok, site, reason = "", extra = {}) {
    if (!ok && reason) console.warn(`[ChatClub] ${site} delete thread: ${reason}`);
    return { ok, site, ...(reason ? { reason } : {}), ...extra };
  }

  function deleteTextToken(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, " ").trim();
  }

  function deleteCompactToken(value) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  }

  function deleteElementText(el) {
    if (!el) return "";
    return normalize([
      buttonText(el),
      modelElementText(el),
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("title"),
      el.innerText || el.textContent || ""
    ].filter(Boolean).join(" "));
  }

  function svgSignature(node) {
    return normalize([node, ...qsa("svg,title,desc,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", node).slice(0, 80)]
      .map((element) => [
        classText(element),
        element?.getAttribute?.("data-icon"),
        element?.getAttribute?.("aria-label"),
        element?.getAttribute?.("title"),
        element?.getAttribute?.("alt"),
        element?.getAttribute?.("src"),
        element?.getAttribute?.("href"),
        element?.getAttribute?.("xlink:href"),
        element?.getAttribute?.("viewBox"),
        element?.getAttribute?.("d"),
        element?.getAttribute?.("x"),
        element?.getAttribute?.("y"),
        element?.getAttribute?.("width"),
        element?.getAttribute?.("height")
      ].filter(Boolean).join(" "))
      .join(" ")).toLowerCase();
  }

  function deleteLabelMatches(value, labels, { exact = false } = {}) {
    const textValue = deleteTextToken(value);
    const compactValue = deleteCompactToken(value);
    if (!textValue && !compactValue) return false;
    return (labels || []).some((label) => {
      const textLabel = deleteTextToken(label);
      const compactLabel = deleteCompactToken(label);
      if (!textLabel && !compactLabel) return false;
      if (exact) return textValue === textLabel || compactValue === compactLabel;
      return textValue.includes(textLabel) || compactValue.includes(compactLabel);
    });
  }

  function deleteLabelMatchesExactish(value, labels) {
    const textValue = deleteTextToken(value);
    const compactValue = deleteCompactToken(value);
    return (labels || []).some((label) => {
      const textLabel = deleteTextToken(label);
      const compactLabel = deleteCompactToken(label);
      if (!textLabel && !compactLabel) return false;
      return textValue === textLabel
        || compactValue === compactLabel
        || textValue === `${textLabel} ${textLabel}`
        || compactValue === `${compactLabel}${compactLabel}`;
      });
  }

  const DELETE_CLICKABLE_SELECTOR = "button,[role='button'],[role='menuitem'],[role='option'],a[href],[aria-haspopup],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i]";
  const DELETE_CONFIRM_CLICKABLE_SELECTOR = `${DELETE_CLICKABLE_SELECTOR},[class*='button' i],[class*='btn' i]`;
  const DELETE_CONFIRM_CANDIDATE_SELECTOR = `${DELETE_CLICKABLE_SELECTOR},[class*='button' i],[class*='btn' i]`;

  function visibleDeleteCandidates(root = document, selector = DELETE_CLICKABLE_SELECTOR) {
    return qsa(selector, root, { all: true }).filter((element) => visible(element) && !isDisabledElement(element));
  }

  function layoutDeleteCandidates(root = document, selector = DELETE_CLICKABLE_SELECTOR) {
    return qsa(selector, root, { all: true }).filter((element) => {
      if (!element || !element.isConnected || isDisabledElement(element)) return false;
      const rect = modelRect(element);
      if (!rect || rect.width < 2 || rect.height < 2) return false;
      try {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      } catch {
        return true;
      }
    });
  }

  function deleteClickableElement(element) {
    return closest(element, DELETE_CONFIRM_CANDIDATE_SELECTOR) || element;
  }

  function deleteClick(element) {
    const target = deleteClickableElement(element);
    return modelClick(target) || modelDirectClick(target);
  }

  function deleteLayoutActivationTargets(el) {
    const targets = [];
    const seen = new Set();
    const add = (target) => {
      if (!target || seen.has(target) || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 2 || rect.height < 2) return;
      try {
        const style = getComputedStyle(target);
        if (style.display === "none" || style.visibility === "hidden") return;
      } catch {}
      seen.add(target);
      targets.push(target);
    };
    const point = modelCenterPoint(el);
    const pointTarget = modelElementFromPoint(point, el);
    if (pointTarget) {
      add(modelCustomActivationAncestor(pointTarget));
      add(modelClickableAncestor(pointTarget));
      add(pointTarget);
    }
    add(el);
    add(modelCustomActivationAncestor(el));
    add(modelClickableAncestor(el));
    return targets;
  }

  function deleteClickLayout(element) {
    const target = deleteClickableElement(element);
    if (!target || !target.isConnected || isDisabledElement(target)) return false;
    const rect = modelRect(target);
    if (!rect || rect.width < 2 || rect.height < 2) return false;
    try { target.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    let clicked = false;
    for (const item of deleteLayoutActivationTargets(target)) {
      try { item.focus?.({ preventScroll: true }); } catch {
        try { item.focus?.(); } catch {}
      }
      clicked = dispatchPointerActivation(item, modelCenterPoint(item) || modelCenterPoint(target)) || clicked;
      clicked = nativeModelClick(item) || clicked;
      if (clicked) return true;
    }
    return clicked;
  }

  async function deleteActivateUntil(element, getter, { allowHidden = false, settleMs = 180 } = {}) {
    const target = deleteClickableElement(element);
    if (!target || !target.isConnected || isDisabledElement(target)) return null;
    const rect = modelRect(target);
    if (!rect || rect.width < 2 || rect.height < 2) return null;
    if (!allowHidden && !visible(target)) return null;
    try {
      const style = getComputedStyle(target);
      if (style.display === "none" || style.visibility === "hidden") return null;
    } catch {}
    try { target.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    try { target.focus?.({ preventScroll: true }); } catch {
      try { target.focus?.(); } catch {}
    }
    const read = () => {
      try { return typeof getter === "function" ? getter() : null; } catch { return null; }
    };
    const initial = read();
    if (initial) return initial;
    const point = modelCenterPoint(target);
    const attempts = [
      () => dispatchPointerActivation(target, point),
      () => nativeModelClick(target),
      () => activateElement(target),
      () => deleteClickLayout(target)
    ];
    for (const attempt of attempts) {
      try { attempt(); } catch {}
      await sleep(Math.max(40, Number(settleMs) || 40));
      const value = read();
      if (value) return value;
    }
    return read();
  }

  const DELETE_CONFIRM_LABELS = ["Delete chat", "Delete Chat", "Delete thread", "Delete", "Confirm", "Confirm delete", "确认", "确认删除", "删除聊天", "删除话题", "删除"];
  const DELETE_CONFIRM_STRICT_LABELS = ["Delete chat", "Delete Chat", "Delete thread", "Confirm delete", "确认删除", "删除聊天", "删除话题"];
  const DELETE_CONFIRM_GENERIC_LABELS = ["Delete", "Confirm", "确认", "删除"];
  const DELETE_CANCEL_LABELS = ["Cancel", "取消", "Keep", "保留"];
  const DELETE_CONFIRM_REJECT_LABEL_PATTERN = /\b(rename|more|options|menu|pin|share|settings|history)\b|重命名|更多|菜单|选项|置顶|分享|设置|历史/i;

  function deleteConfirmRejectButtonMatches(element) {
    const value = deleteElementText(element);
    return DELETE_CONFIRM_REJECT_LABEL_PATTERN.test(deleteTextToken(value))
      || DELETE_CONFIRM_REJECT_LABEL_PATTERN.test(deleteCompactToken(value));
  }

  function deleteConfirmButtonMatches(element, root = null) {
    const value = deleteElementText(element);
    if (!value || deleteLabelMatches(value, DELETE_CANCEL_LABELS)) return false;
    if (deleteConfirmRejectButtonMatches(element)) return false;
    if (deleteLabelMatchesExactish(value, DELETE_CONFIRM_STRICT_LABELS)) return true;
    if (deleteLabelMatchesExactish(value, DELETE_CONFIRM_GENERIC_LABELS)) return true;
    if (root && deleteConfirmRootTextMatches(deleteElementText(root))) return deleteLabelMatches(value, DELETE_CONFIRM_LABELS);
    return deleteLabelMatches(value, DELETE_CONFIRM_STRICT_LABELS);
  }

  function deleteCancelButtonMatches(element) {
    return deleteLabelMatches(deleteElementText(element), DELETE_CANCEL_LABELS);
  }

  function deleteConfirmActivationElementMatches(element, expected, root = null) {
    const candidate = deleteClickableElement(element);
    const target = deleteClickableElement(expected);
    if (!candidate || !visible(candidate) || isDisabledElement(candidate)) return false;
    if (deleteCancelButtonMatches(candidate) || deleteConfirmRejectButtonMatches(candidate)) return false;
    if (target && (candidate === target || candidate.contains?.(target) || target.contains?.(candidate))) return true;
    return deleteConfirmButtonMatches(candidate, root);
  }

  function deleteDialogRoots() {
    const roots = visibleSelectorElements([
      "[role='alertdialog']",
      "[role='dialog']",
      "[data-radix-dialog-content]",
      "[data-state='open']",
      ".modal",
      ".fixed"
    ]).filter((root) => {
      const value = deleteElementText(root);
      return deleteConfirmRootTextMatches(value);
    });
    for (const root of deleteQuestionDialogRoots()) {
      if (!roots.some((item) => item === root || item.contains?.(root) || root.contains?.(item))) roots.push(root);
    }
    for (const root of deleteButtonPairDialogRoots()) {
      if (!roots.some((item) => item === root || item.contains?.(root) || root.contains?.(item))) roots.push(root);
    }
    roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
    return roots;
  }

  function deleteConfirmQuestionMatches(value) {
    return /are you sure you want to delete(?: this)? chat|are you sure.*delete|this chat can(?:'|’)?t be recovered|this chat cant be recovered|delete this chat|share links from it will be disabled|cannot be undone|can(?:'|’)?t be undone|permanently delete|permanent deletion|确定.*删除|确认.*删除|删除.*不可恢复|无法恢复|不能恢复/i.test(deleteTextToken(value));
  }

  function deleteConfirmRootTextMatches(value) {
    const textValue = deleteTextToken(value);
    const compactValue = deleteCompactToken(value);
    if (deleteConfirmQuestionMatches(textValue)) return true;
    const hasDelete = /delete|删除/.test(textValue) || /delete|删除/.test(compactValue);
    const hasConfirm = /confirm|确认/.test(textValue) || /confirm|确认/.test(compactValue);
    const hasCancel = /cancel|取消/.test(textValue) || /cancel|取消/.test(compactValue);
    const hasRecoverWarning = /recover|recovered|不可恢复|无法恢复|不能恢复/.test(textValue) || /recover|recovered|不可恢复|无法恢复|不能恢复/.test(compactValue);
    return hasCancel && (hasRecoverWarning || (hasDelete && hasConfirm));
  }

  function deleteQuestionDialogRoots() {
    const roots = [];
    const questions = qsa("div,section,[role='dialog'],[role='alertdialog']", document, { all: true })
      .filter((element) => visible(element) && deleteConfirmQuestionMatches(deleteElementText(element)))
      .sort((a, b) => modelElementArea(a) - modelElementArea(b))
      .slice(0, 24);
    for (const question of questions) {
      let node = question;
      for (let depth = 0; node && node !== document.body && depth < 8; depth += 1, node = node.parentElement) {
        if (!visible(node)) continue;
        const buttons = visibleDeleteCandidates(node, DELETE_CONFIRM_CLICKABLE_SELECTOR);
        const hasConfirm = buttons.some((button) => deleteConfirmButtonMatches(button, node));
        const hasCancel = buttons.some(deleteCancelButtonMatches);
        if (!hasConfirm || !hasCancel) continue;
        if (!roots.some((root) => root === node || root.contains?.(node) || node.contains?.(root))) roots.push(node);
        break;
      }
    }
    return roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
  }

  function deleteButtonPairDialogRoots() {
    const roots = [];
    const seedButtons = visibleDeleteCandidates(document, DELETE_CONFIRM_CLICKABLE_SELECTOR)
      .filter((button) => deleteConfirmButtonMatches(button) || deleteCancelButtonMatches(button));
    for (const button of seedButtons) {
      let node = button;
      for (let depth = 0; node && node !== document.body && depth < 9; depth += 1, node = node.parentElement) {
        if (!visible(node)) continue;
        const buttons = visibleDeleteCandidates(node, DELETE_CONFIRM_CLICKABLE_SELECTOR);
        if (!buttons.some((candidate) => deleteConfirmButtonMatches(candidate, node)) || !buttons.some(deleteCancelButtonMatches)) continue;
        if (!deleteConfirmRootTextMatches(deleteElementText(node))) continue;
        if (!roots.some((root) => root === node || root.contains?.(node) || node.contains?.(root))) roots.push(node);
        break;
      }
    }
    return roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
  }

  function findDeleteConfirmButtonInfo() {
    const candidates = [];
    const addCandidate = (element, root = null, extraScore = 0) => {
      const target = deleteClickableElement(element);
      const value = deleteElementText(target) || deleteElementText(element);
      if (!deleteConfirmButtonMatches(target, root) && !deleteConfirmButtonMatches(element, root)) return;
      if (deleteCancelButtonMatches(target) || deleteCancelButtonMatches(element)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 12 || rect.height < 10 || rect.width > 760 || rect.height > 160) return;
      candidates.push({
        element: target,
        root,
        score: extraScore
          + (deleteLabelMatchesExactish(value, DELETE_CONFIRM_STRICT_LABELS) ? 700 : 0)
          + (deleteLabelMatchesExactish(value, DELETE_CONFIRM_GENERIC_LABELS) ? 420 : 0)
          + (target.matches?.("button,[role='button']") ? 220 : 0),
        right: rect.right || rect.left || 0,
        top: rect.top || 0,
        area: rect.width * rect.height
      });
    };
    for (const root of deleteDialogRoots()) {
      for (const element of visibleDeleteCandidates(root, DELETE_CONFIRM_CLICKABLE_SELECTOR)) {
        addCandidate(element, root, 260);
      }
    }
    if (!candidates.length && qsa("div,section,[role='dialog'],[role='alertdialog'],h1,h2,h3,p,span", document, { all: true }).some((element) => visible(element) && deleteConfirmQuestionMatches(deleteElementText(element)))) {
      const buttons = visibleDeleteCandidates(document, DELETE_CONFIRM_CLICKABLE_SELECTOR);
      const cancelButtons = buttons.filter(deleteCancelButtonMatches);
      if (cancelButtons.length) {
        for (const element of buttons) {
          const value = deleteElementText(element);
          if (!deleteLabelMatchesExactish(value, DELETE_CONFIRM_GENERIC_LABELS) && !deleteLabelMatchesExactish(value, DELETE_CONFIRM_STRICT_LABELS)) continue;
          const rect = modelRect(element);
          if (!rect) continue;
          const nearCancel = cancelButtons.some((cancel) => {
            const cancelRect = modelRect(cancel);
            if (!cancelRect) return false;
            return Math.abs((cancelRect.left + cancelRect.right) / 2 - (rect.left + rect.right) / 2) < 360
              && Math.abs((cancelRect.top + cancelRect.bottom) / 2 - (rect.top + rect.bottom) / 2) < 220;
          });
          if (nearCancel) addCandidate(element, null, 180);
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.top - a.top || a.area - b.area);
    return candidates[0] || null;
  }

  function findDeleteConfirmButton() {
    return findDeleteConfirmButtonInfo()?.element || null;
  }

  function serializableDeleteRect(box) {
    if (!box) return null;
    const round = (value) => Math.round(Number(value || 0) * 100) / 100;
    return {
      left: round(box.left),
      top: round(box.top),
      right: round(box.right),
      bottom: round(box.bottom),
      width: round(box.width),
      height: round(box.height)
    };
  }

  function deleteConfirmTrustedClick(site = "topic-delete", reason = "delete confirmation requires trusted browser input") {
    const info = findDeleteConfirmButtonInfo();
    const button = info?.element || null;
    const box = modelRect(button);
    if (!button || !box) return null;
    return {
      kind: "delete-confirm",
      site,
      reason: String(reason || ""),
      framePoint: {
        x: Math.round((box.left + box.width / 2) * 100) / 100,
        y: Math.round((box.top + box.height / 2) * 100) / 100
      },
      frameRect: serializableDeleteRect(box)
    };
  }

  function deleteResultWithTrustedConfirm(site, reason) {
    const trustedClick = deleteConfirmTrustedClick(site, reason);
    return deleteResult(false, site, reason, trustedClick ? { needsTrustedClick: true, trustedClick } : {});
  }

  function trustedDeleteShortcut(site = "topic-delete", reason = "delete shortcut requires trusted browser input") {
    const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
    return {
      kind: "delete-shortcut",
      site,
      reason: String(reason || ""),
      keys: [
        {
          key: "Backspace",
          shiftKey: true,
          metaKey: mac,
          ctrlKey: !mac,
          settleMs: 520
        }
      ],
      keySettleMs: 180,
      settleMs: 900
    };
  }

  function deleteResultWithTrustedDeleteShortcut(site, reason) {
    return deleteResult(false, site, reason, {
      needsTrustedKeySequence: true,
      trustedKeySequence: trustedDeleteShortcut(site, reason)
    });
  }

  function trustedMenuClickPoint(site = "topic-delete", reason = "topic menu trigger requires trusted browser input", point = {}, frameRect = null) {
    const x = Number(point.x ?? point.clientX);
    const y = Number(point.y ?? point.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      kind: "topic-menu-trigger",
      site,
      reason: String(reason || ""),
      framePoint: {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100
      },
      ...(frameRect ? { frameRect } : {})
    };
  }

  function trustedMenuClickForElement(element, site = "topic-delete", reason = "topic menu trigger requires trusted browser input") {
    const box = modelRect(element);
    if (!element || !box) return null;
    return trustedMenuClickPoint(site, reason, {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2
    }, serializableDeleteRect(box));
  }

  function deleteResultWithTrustedMenuClick(site, reason, element) {
    const trustedMenuClick = trustedMenuClickForElement(element, site, reason);
    return deleteResult(false, site, reason, trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {});
  }

  function topicDeleteConfirmState(site = "topic-delete", expectedIdentity = null) {
    const trustedClick = deleteConfirmTrustedClick(site, "delete confirmation is still visible");
    const target = deleteCompletionTargetState(
      expectedIdentity,
      location.href,
      qsa("a[href]", document, { all: true }).map((link) => String(link.href || link.getAttribute?.("href") || ""))
    );
    return {
      version: DELETE_COMPLETION_STATE_VERSION,
      present: Boolean(trustedClick) || deleteDialogRoots().length > 0,
      target,
      trustedClick
    };
  }

  function deleteConfirmDialogClosed() {
    return !findDeleteConfirmButton() && !deleteDialogRoots().length;
  }

  function dispatchDeleteConfirmKey(target, key = "Enter") {
    if (!target) return false;
    const KeyboardEventCtor = modelEventConstructor("KeyboardEvent", target);
    if (typeof KeyboardEventCtor !== "function") return false;
    const isSpace = key === " " || /^space(?:bar)?$/i.test(key);
    const code = isSpace ? "Space" : "Enter";
    const keyValue = isSpace ? " " : "Enter";
    const keyCode = isSpace ? 32 : 13;
    let dispatched = false;
    const init = {
      key: keyValue,
      code,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      composed: true
    };
    for (const type of ["keydown", "keypress", "keyup"]) {
      try {
        target.dispatchEvent(new KeyboardEventCtor(type, init));
        dispatched = true;
      } catch {}
    }
    return dispatched;
  }

  function dispatchDeleteConfirmEnter(target) {
    return dispatchDeleteConfirmKey(target, "Enter") || dispatchDeleteConfirmKey(target, " ");
  }

  function clickDeleteConfirmButton(button, root = null) {
    if (!button || !button.isConnected || isDisabledElement(button)) return false;
    const target = deleteClickableElement(button);
    const point = modelCenterPoint(target) || modelCenterPoint(button);
    const pointTarget = modelElementFromPoint(point, target || button);
    const targets = [];
    const seen = new Set();
    const add = (element) => {
      const candidate = deleteClickableElement(element);
      if (!candidate || seen.has(candidate) || isDisabledElement(candidate)) return;
      if (!deleteConfirmActivationElementMatches(candidate, target, root)) return;
      if (!visible(candidate) && !modelRect(candidate)) return;
      seen.add(candidate);
      targets.push(candidate);
    };
    add(modelClickableAncestor(pointTarget));
    add(modelCustomActivationAncestor(pointTarget));
    add(pointTarget);
    add(target);
    add(button);
    for (let node = target?.parentElement, depth = 0; node && node !== document.body && depth < 3; node = node.parentElement, depth += 1) {
      add(node);
    }
    let clicked = false;
    for (const element of targets) {
      try { element.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
      try { element.focus?.({ preventScroll: true }); } catch {
        try { element.focus?.(); } catch {}
      }
      clicked = dispatchDeleteConfirmEnter(element) || clicked;
      clicked = dispatchPointerActivation(element, modelCenterPoint(element) || point) || clicked;
      clicked = nativeModelClick(element) || clicked;
    }
    try {
      activateElement(target || button);
      clicked = true;
    } catch {}
    return clicked;
  }

  async function clickDeleteConfirmIfPresent(timeoutMs = 4200, guard = null) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    let clickedButton = null;
    let clickedAt = 0;
    while (Date.now() <= deadline) {
      if (clickedButton && deleteConfirmDialogClosed()) return true;
      const info = findDeleteConfirmButtonInfo();
      const button = info?.element || null;
      if (button && typeof guard === "function" && guard() !== true) return false;
      if (button && (button !== clickedButton || Date.now() - clickedAt > 900) && clickDeleteConfirmButton(button, info.root || null)) {
        clickedButton = button;
        clickedAt = Date.now();
        await sleep(220);
        if (deleteConfirmDialogClosed()) return true;
      }
      await sleep(120);
    }
    if (clickedButton && deleteConfirmDialogClosed()) return true;
    return false;
  }

  async function clickDeleteConfirmIfAppears(appearTimeoutMs = 900, closeTimeoutMs = 4200) {
    const deadline = Date.now() + Math.max(0, Number(appearTimeoutMs) || 0);
    while (Date.now() <= deadline) {
      if (findDeleteConfirmButton()) {
        const confirmed = await clickDeleteConfirmIfPresent(closeTimeoutMs);
        return { appeared: true, confirmed };
      }
      await sleep(80);
    }
    return { appeared: false, confirmed: false };
  }

  function dispatchDeleteKeyboardShortcut() {
    const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
    const init = {
      key: "Backspace",
      code: "Backspace",
      keyCode: 8,
      which: 8,
      bubbles: true,
      cancelable: true,
      composed: true,
      shiftKey: true,
      metaKey: mac,
      ctrlKey: !mac,
      altKey: false
    };
    const targets = [document.activeElement, document.body, document.documentElement, document, window].filter(Boolean);
    let dispatched = false;
    const seen = new Set();
    for (const target of targets) {
      if (!target || seen.has(target)) continue;
      seen.add(target);
      const KeyboardEventCtor = modelEventConstructor("KeyboardEvent", target);
      if (typeof KeyboardEventCtor !== "function") continue;
      for (const type of ["keydown", "keyup"]) {
        try {
          target.dispatchEvent(new KeyboardEventCtor(type, init));
          dispatched = true;
        } catch {}
      }
    }
    return dispatched;
  }
  return Object.freeze({
    deleteResult,
    deleteCompactToken,
    deleteElementText,
    svgSignature,
    deleteLabelMatches,
    deleteLabelMatchesExactish,
    visibleDeleteCandidates,
    layoutDeleteCandidates,
    deleteClickableElement,
    deleteClick,
    deleteActivateUntil,
    findDeleteConfirmButton,
    deleteResultWithTrustedConfirm,
    deleteResultWithTrustedDeleteShortcut,
    deleteResultWithTrustedMenuClick,
    topicDeleteConfirmState,
    clickDeleteConfirmIfPresent,
    clickDeleteConfirmIfAppears,
    dispatchDeleteKeyboardShortcut,
    DELETE_CANCEL_LABELS,
    deleteDialogRoots,
    deleteClickLayout,
    serializableDeleteRect,
    trustedMenuClickForElement,
    trustedMenuClickPoint
  });
}
