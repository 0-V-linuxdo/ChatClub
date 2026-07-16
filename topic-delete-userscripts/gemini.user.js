// ==UserScript==
// @name        ChatClub Delete Site - Gemini
// @namespace   https://chatclub.local/delete-sites
// @version     2026.07.16.1
// @description Delete the current Gemini conversation when ChatClub or the userscript menu requests it.
// @match       https://gemini.google.com/*
// @match       https://*.gemini.google.com/*
// @run-at      document-idle
// @grant       GM_registerMenuCommand
// @grant       unsafeWindow
// ==/UserScript==


(function () {
  "use strict";

  const SITE_ID = "gemini";
  const SITE_NAME = "Gemini";
  const SITE_KEYS = ["gemini","Gemini","Gemini"];
  const VERSION = "2026.07.16.1";
  const REQUEST_EVENT = "chatclub:delete-site:request";
  const VERSIONED_REQUEST_EVENT = REQUEST_EVENT + ":" + VERSION;
  const MENU_COMMAND_EVENT = "chatclub:delete-site:menu-command";
  const VERSIONED_MENU_COMMAND_EVENT = MENU_COMMAND_EVENT + ":" + VERSION;
  const RESULT_EVENT = "chatclub:delete-site:result";
  const PING_EVENT = "chatclub:delete-site:ping";
  const READY_EVENT = "chatclub:delete-site:ready";
  const BRIDGE_SOURCE = "chatclub-delete-sites";
  const GLOBAL_NAME = "ChatClubDeleteSites";
  const rootWindow = typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : window;
  let active = true;
  const handledRequestIds = new Set();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const compact = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  const qsa = (selector, root = document) => {
    try { return Array.from((root || document).querySelectorAll(selector)); } catch { return []; }
  };
  const closest = (node, selector) => {
    try { return node && node.closest ? node.closest(selector) : null; } catch { return null; }
  };
  const rect = (node) => {
    try {
      const box = node && node.getBoundingClientRect && node.getBoundingClientRect();
      return box && Number.isFinite(box.width) && Number.isFinite(box.height) ? box : null;
    } catch { return null; }
  };
  const visible = (node) => {
    const box = rect(node);
    if (!box || box.width <= 0 || box.height <= 0) return false;
    try {
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0;
    } catch { return true; }
  };
  const disabled = (node) => {
    try {
      return Boolean(node.disabled)
        || node.getAttribute("aria-disabled") === "true"
        || node.getAttribute("disabled") != null;
    } catch { return false; }
  };
  const elementText = (node) => normalize([
    node && node.getAttribute && node.getAttribute("aria-label"),
    node && node.getAttribute && node.getAttribute("title"),
    node && node.getAttribute && node.getAttribute("data-testid"),
    node && node.getAttribute && node.getAttribute("data-test-id"),
    node && node.innerText,
    node && node.textContent
  ].filter(Boolean).join(" "));
  const svgText = (node) => normalize(qsa("svg,use,path,circle", node).map((item) => [
    item.tagName,
    item.getAttribute("aria-label"),
    item.getAttribute("data-testid"),
    item.getAttribute("class"),
    item.getAttribute("href"),
    item.getAttribute("xlink:href"),
    item.getAttribute("d")
  ].filter(Boolean).join(" ")).join(" "));
  const clickable = (node) => {
    if (!node || node === document || node === window) return null;
    return closest(node, "button,[role='button'],[role='menuitem'],[role='option'],a[href],[aria-haspopup],[tabindex]:not([tabindex='-1']),[onclick],[class*='button' i],[class*='btn' i]")
      || (node.nodeType === 1 ? node : null);
  };
  const reveal = (node) => {
    try { node && node.scrollIntoView && node.scrollIntoView({ block: "center", inline: "nearest" }); } catch {}
  };
  const pointFor = (node) => {
    const box = rect(node);
    return box ? { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 } : { clientX: 0, clientY: 0 };
  };
  const eventCtor = (name, target) => {
    try {
      const view = target && target.ownerDocument && target.ownerDocument.defaultView;
      return view && typeof view[name] === "function" ? view[name] : window[name];
    } catch { return window[name]; }
  };
  const frameworkEvent = (type, target, point = null, currentTarget = target) => {
    const coords = point || pointFor(target);
    return {
      type,
      target,
      srcElement: target,
      currentTarget,
      nativeEvent: { isTrusted: true, target, srcElement: target, currentTarget, ...coords },
      isTrusted: true,
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: type.includes("down") ? 1 : 0,
      detail: type === "click" ? 1 : 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      defaultPrevented: false,
      cancelBubble: false,
      ...coords,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.cancelBubble = true; },
      stopImmediatePropagation() { this.cancelBubble = true; },
      persist() {},
      isDefaultPrevented() { return Boolean(this.defaultPrevented); },
      isPropagationStopped() { return Boolean(this.cancelBubble); }
    };
  };
  const handlerValues = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(handlerValues);
    if (typeof value === "function" || typeof value.handleEvent === "function") return [value];
    if (Array.isArray(value.value)) return value.value.flatMap(handlerValues);
    if (typeof value.value === "function") return [value.value];
    return [];
  };
  const invokeHandlerValue = (handler, event, target) => {
    try {
      if (typeof handler === "function") {
        handler.call(target, event);
        return true;
      }
      if (handler && typeof handler.handleEvent === "function") {
        handler.handleEvent(event);
        return true;
      }
    } catch {}
    return false;
  };
  const frameworkPropObjects = (node) => {
    const out = [];
    const add = (value) => {
      if (value && typeof value === "object" && !out.includes(value)) out.push(value);
    };
    const addFiber = (fiber) => {
      for (let current = fiber, depth = 0; current && depth < 8; current = current.return, depth += 1) {
        add(current.memoizedProps);
        add(current.pendingProps);
        add(current.elementType?.defaultProps);
        add(current.type?.defaultProps);
      }
    };
    const inspect = (item) => {
      if (!item || typeof item !== "object") return;
      try {
        for (const key of Object.getOwnPropertyNames(item)) {
          let value;
          try { value = item[key]; } catch { value = null; }
          if (/^__reactProps|^__reactEventHandlers/i.test(key)) add(value);
          if (/^__reactFiber/i.test(key)) addFiber(value);
        }
      } catch {}
      try { add(item.__vnode?.props); } catch {}
      try { add(item.__vueParentComponent?.vnode?.props); } catch {}
      try { add(item._vei); } catch {}
    };
    inspect(node);
    inspect(clickable(node));
    inspect(node?.parentElement);
    return out;
  };
  function invokeFrameworkActivation(node, point = null) {
    const target = clickable(node) || node;
    if (!target || disabled(target)) return false;
    const targets = [];
    const seen = new Set();
    const add = (item) => {
      const element = clickable(item) || item;
      if (!element || seen.has(element) || disabled(element)) return;
      seen.add(element);
      targets.push(element);
    };
    const coords = point || pointFor(target);
    const pointTarget = document.elementFromPoint?.(coords.clientX, coords.clientY);
    add(pointTarget);
    add(target);
    add(node);
    for (let parent = target.parentElement, depth = 0; parent && parent !== document.body && depth < 4; parent = parent.parentElement, depth += 1) {
      const box = rect(parent);
      if (!box || box.width > 820 || box.height > 540) break;
      add(parent);
    }
    const eventPlan = [
      ["onPointerDown", "pointerdown"],
      ["onMouseDown", "mousedown"],
      ["onPointerUp", "pointerup"],
      ["onMouseUp", "mouseup"],
      ["onClick", "click"]
    ];
    let called = false;
    for (const item of targets) {
      for (const props of frameworkPropObjects(item)) {
        for (const [name, type] of eventPlan) {
          const event = frameworkEvent(type, item, coords);
          const keys = Object.keys(props).filter((key) => key === name || key.toLowerCase() === name.toLowerCase() || key.startsWith(name));
          for (const key of keys) {
            for (const handler of handlerValues(props[key])) {
              called = invokeHandlerValue(handler, event, item) || called;
            }
          }
        }
      }
    }
    return called;
  }
  function invokeDirectFrameworkActivation(node, point = null) {
    const target = clickable(node) || node;
    if (!target || disabled(target)) return false;
    const targets = [];
    const seen = new Set();
    const add = (item) => {
      const element = clickable(item) || item;
      if (!element || seen.has(element) || disabled(element)) return;
      seen.add(element);
      targets.push(element);
    };
    const coords = point || pointFor(target);
    const pointTarget = document.elementFromPoint?.(coords.clientX, coords.clientY);
    add(pointTarget);
    add(target);
    add(node);
    for (let parent = target.parentElement, depth = 0; parent && parent !== document.body && depth < 5; parent = parent.parentElement, depth += 1) {
      const box = rect(parent);
      if (!box || box.width > 900 || box.height > 620) break;
      add(parent);
    }
    const eventPlan = [
      ["onPointerDown", "pointerdown"],
      ["onMouseDown", "mousedown"],
      ["onPointerUp", "pointerup"],
      ["onMouseUp", "mouseup"],
      ["onClick", "click"]
    ];
    let called = false;
    for (const item of targets) {
      for (const props of frameworkPropObjects(item)) {
        for (const [name, type] of eventPlan) {
          const event = frameworkEvent(type, target, coords, item);
          const keys = Object.keys(props).filter((key) => key === name || key.toLowerCase() === name.toLowerCase() || key.startsWith(name));
          for (const key of keys) {
            for (const handler of handlerValues(props[key])) {
              called = invokeHandlerValue(handler, event, item) || called;
            }
          }
        }
      }
    }
    return called;
  }
  const clickAt = (node, point = null) => {
    const target = clickable(node);
    if (!target || disabled(target)) return false;
    const coords = point || pointFor(target);
    reveal(target);
    try { target.focus && target.focus({ preventScroll: true }); } catch {}
    let ok = invokeFrameworkActivation(target, coords);
    for (const type of ["pointerover", "mouseover", "pointerenter", "mouseenter", "pointermove", "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      try {
        const Ctor = type.startsWith("pointer") ? eventCtor("PointerEvent", target) : eventCtor("MouseEvent", target);
        target.dispatchEvent(new Ctor(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: type.includes("down") ? 1 : 0,
          ...coords
        }));
        ok = true;
      } catch {}
    }
    try { target.click && target.click(); ok = true; } catch {}
    return ok;
  };
  const clickUntil = async (node, getter, options = {}) => {
    const target = clickable(node);
    if (!target || disabled(target)) return null;
    const box = rect(target);
    if (!box || box.width < 2 || box.height < 2) return null;
    if (!options.allowHidden && !visible(target)) return null;
    reveal(target);
    try { target.focus && target.focus({ preventScroll: true }); } catch {}
    const read = () => {
      try { return typeof getter === "function" ? getter() : null; } catch { return null; }
    };
    const initial = read();
    if (initial) return initial;
    const coords = pointFor(target);
    const attempts = [
      () => clickAt(target, coords),
      () => invokeDirectFrameworkActivation(target, coords),
      () => invokeFrameworkActivation(target, coords)
    ];
    for (const attempt of attempts) {
      try { attempt(); } catch {}
      await sleep(Math.max(40, Number(options.settleMs) || 40));
      const value = read();
      if (value) return value;
    }
    return read();
  };
  const keyAt = (node, key = "Enter") => {
    const target = clickable(node) || node;
    if (!target || disabled(target)) return false;
    const isSpace = key === " " || /^space(?:bar)?$/i.test(key);
    const code = isSpace ? "Space" : "Enter";
    const keyValue = isSpace ? " " : "Enter";
    const keyCode = isSpace ? 32 : 13;
    let ok = false;
    try { target.focus && target.focus({ preventScroll: true }); } catch {}
    for (const type of ["keydown", "keypress", "keyup"]) {
      try {
        const Ctor = eventCtor("KeyboardEvent", target);
        target.dispatchEvent(new Ctor(type, {
          key: keyValue,
          code,
          keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true,
          composed: true
        }));
        ok = true;
      } catch {}
    }
    return ok;
  };
  const confirmActivationTargetMatches = (node, expected, root = null) => {
    const candidate = clickable(node) || node;
    const target = clickable(expected) || expected;
    if (!candidate || !visible(candidate) || disabled(candidate)) return false;
    if (matchesLabel(elementText(candidate), CANCEL_LABELS) || confirmRejectButtonMatches(candidate)) return false;
    if (target && (candidate === target || candidate.contains(target) || target.contains(candidate))) return true;
    return confirmButtonMatches(candidate, root);
  };
  const dispatchDirectClick = (node, point = null) => {
    const target = clickable(node) || node;
    if (!target || disabled(target)) return false;
    const coords = point || pointFor(target);
    reveal(target);
    try { target.focus && target.focus({ preventScroll: true }); } catch {}
    let ok = invokeDirectFrameworkActivation(target, coords);
    for (const type of ["pointerover", "mouseover", "pointerenter", "mouseenter", "pointermove", "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      try {
        const Ctor = type.startsWith("pointer") ? eventCtor("PointerEvent", target) : eventCtor("MouseEvent", target);
        target.dispatchEvent(new Ctor(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: type.includes("down") ? 1 : 0,
          ...coords
        }));
        ok = true;
      } catch {}
    }
    try { target.click && target.click(); ok = true; } catch {}
    return ok;
  };
  const activateConfirmButton = (node, root = null) => {
    const target = clickable(node) || node;
    if (!target || disabled(target)) return false;
    const targets = [];
    const seen = new Set();
    const add = (item) => {
      const element = clickable(item) || item;
      if (!element || seen.has(element) || disabled(element)) return;
      if (!confirmActivationTargetMatches(element, target, root)) return;
      seen.add(element);
      targets.push(element);
    };
    const box = rect(target);
    const point = box ? { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 } : null;
    const pointTarget = point ? document.elementFromPoint(point.clientX, point.clientY) : null;
    add(pointTarget);
    add(target);
    add(node);
    for (let parent = target.parentElement, depth = 0; parent && parent !== document.body && depth < 3; parent = parent.parentElement, depth += 1) {
      add(parent);
    }
    let ok = false;
    for (const item of targets) {
      ok = keyAt(item, "Enter") || ok;
      ok = keyAt(item, " ") || ok;
      ok = dispatchDirectClick(item, point) || ok;
    }
    return ok;
  };
  const waitFor = async (getter, timeoutMs = 2500, intervalMs = 100) => {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const value = getter();
      if (value) return value;
      await sleep(intervalMs);
    }
    return getter();
  };
  const matchesLabel = (value, labels, exact = false) => {
    const text = normalize(value);
    const token = compact(text);
    if (!text || !token) return false;
    return labels.some((label) => {
      const raw = normalize(label);
      const wanted = compact(raw);
      if (!wanted) return false;
      if (exact) return token === wanted || (token.includes(wanted) && token.length <= wanted.length + 14);
      return token.includes(wanted) || text.toLowerCase().includes(raw.toLowerCase());
    });
  };
  const MENU_ROOT_SELECTORS = [
    "[role='menu']",
    "[role='listbox']",
    "[role='dialog']",
    "dialog",
    "[data-radix-menu-content]",
    "[data-radix-popper-content-wrapper]",
    "[data-floating-ui-portal]",
    "[data-slot='dropdown-menu-content']",
    "[cmdk-root]",
    "[class*='dropdown' i]",
    "[class*='popover' i]",
    "[class*='popper' i]",
    "[class*='menu' i]"
  ].join(",");
  const CANCEL_LABELS = ["Cancel", "Close", "No", "Keep", "取消", "关闭", "保留"];
  const CONFIRM_LABELS = ["Delete", "Delete chat", "Delete thread", "Delete topic", "Remove", "Confirm", "Confirm delete", "OK", "删除", "删除聊天", "删除话题", "确认", "确认删除", "确定"];
  const CONFIRM_STRICT_LABELS = ["Delete chat", "Delete Chat", "Delete thread", "Delete topic", "Confirm delete", "确认删除", "删除聊天", "删除话题"];
  const CONFIRM_GENERIC_LABELS = ["Delete", "Confirm", "确认", "删除"];
  const CONFIRM_REJECT_PATTERN = /\b(rename|more|options|menu|pin|share|settings|history)\b|重命名|更多|菜单|选项|置顶|分享|设置|历史/i;

  function result(ok, reason = "") {
    return { ok: Boolean(ok), site: SITE_ID, siteId: SITE_ID, scriptId: SITE_ID, version: VERSION, ...(reason ? { reason: String(reason) } : {}) };
  }

  function visibleActionCandidates(root = document) {
    return qsa("button,[role='button'],[role='menuitem'],[role='option'],a[href],[tabindex]:not([tabindex='-1']),li,div,span", root)
      .filter((node) => visible(node) && !disabled(node));
  }
  function visibleConfirmCandidates(root = document) {
    const seen = new Set();
    const out = [];
    const selector = "button,[role='button'],[role='menuitem'],[role='option'],a[href],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i]";
    for (const node of qsa(selector, root)) {
      const target = clickable(node);
      if (!target || seen.has(target) || !visible(target) || disabled(target)) continue;
      const box = rect(target);
      if (!box || box.width < 12 || box.height < 10 || box.width > 760 || box.height > 160) continue;
      const value = elementText(target);
      if (!confirmButtonMatches(target, root) && !cancelButtonMatches(target) && !/confirm|delete|cancel|确认|删除|取消/i.test(value)) continue;
      seen.add(target);
      out.push(target);
    }
    return out;
  }

  function menuRoots(labels) {
    const roots = qsa(MENU_ROOT_SELECTORS, document)
      .filter(visible)
      .filter((node) => {
        const value = elementText(node);
        return matchesLabel(value, labels) || /rename|pin|share|delete|重命名|置顶|分享|删除/i.test(value);
      });
    const addRoot = (node) => {
      if (!node || !visible(node)) return;
      const box = rect(node);
      if (!box || box.width < 48 || box.height < 20 || box.width > 640 || box.height > 720) return;
      if (!roots.some((root) => root === node || root.contains(node) || node.contains(root))) roots.push(node);
    };
    for (const item of visibleActionCandidates(document)) {
      if (!matchesLabel(elementText(item), labels, true)) continue;
      for (let node = item; node && node !== document.body; node = node.parentElement) {
        addRoot(node);
        if (roots.includes(node)) break;
      }
    }
    roots.sort((a, b) => {
      const ar = rect(a);
      const br = rect(b);
      return (br?.right || 0) - (ar?.right || 0) || (ar?.top || 0) - (br?.top || 0);
    });
    return roots;
  }

  function findMenuItem(labels, trigger = null) {
    const triggerBox = rect(trigger);
    const candidates = [];
    const seen = new Set();
    const add = (node, score = 0) => {
      if (!node || seen.has(node) || !visible(node) || disabled(node)) return;
      const value = elementText(node);
      if (!matchesLabel(value, labels)) return;
      if (matchesLabel(value, CANCEL_LABELS)) return;
      const target = clickable(node);
      if (!target || seen.has(target) || !visible(target) || disabled(target)) return;
      const box = rect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 460 || box.height > 120) return;
      if (triggerBox) {
        const near = box.top >= triggerBox.top - 32
          && box.top <= triggerBox.top + 420
          && box.left >= triggerBox.left - 180
          && box.left <= triggerBox.left + 360;
        if (!near) return;
      }
      seen.add(node);
      seen.add(target);
      candidates.push({
        node: target,
        score: score + (matchesLabel(value, labels, true) ? 600 : 0) + (target.matches?.("button,[role='menuitem'],[role='button']") ? 160 : 0),
        top: box.top,
        right: box.right,
        area: box.width * box.height
      });
    };
    for (const root of menuRoots(labels)) {
      for (const node of visibleActionCandidates(root)) add(node, 260);
    }
    if (!candidates.length) {
      for (const node of visibleActionCandidates(document)) add(node, 0);
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top || a.area - b.area);
    return candidates[0]?.node || null;
  }

  function findOpenDeleteMenuItem(labels) {
    return findMenuItem(labels, null);
  }

  async function openTriggerAndClickDelete(trigger, labels, options = {}) {
    if (!trigger || (!visible(trigger) && !options.allowHiddenTrigger)) return false;
    const guard = () => typeof options.guard !== "function" || options.guard() === true;
    if (!guard()) return false;
    const menuReady = () => findMenuItem(labels, trigger) || findOpenDeleteMenuItem(labels);
    if (options.requireFreshMenu && menuReady()) return false;
    if (!menuReady() && !await clickUntil(trigger, menuReady, { allowHidden: options.allowHiddenTrigger, settleMs: 220 })) return false;
    await sleep(120);
    const deadline = Date.now() + Math.max(0, Number(options.timeoutMs) || 3200);
    while (Date.now() <= deadline) {
      const item = findMenuItem(labels, trigger) || findOpenDeleteMenuItem(labels);
      if (item && guard() && clickAt(item)) return true;
      await sleep(100);
    }
    return false;
  }

  function topRightMenuTrigger(labels = [], selectors = []) {
    const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const candidates = [];
    const seen = new Set();
    const selector = [...selectors, "button", "[role='button']", "[aria-haspopup='menu']", "[aria-expanded]"].join(",");
    for (const node of qsa(selector, document)) {
      const target = clickable(node);
      if (!target || seen.has(target) || !visible(target) || disabled(target)) continue;
      if (closest(target, MENU_ROOT_SELECTORS)) continue;
      seen.add(target);
      const box = rect(target);
      if (!box || box.top > 210 || box.right < viewportWidth * 0.42) continue;
      const value = elementText(target);
      const token = compact(value);
      const popup = String(target.getAttribute("aria-haspopup") || "").toLowerCase();
      const svg = svgText(target);
      const hasLabel = matchesLabel(value, labels);
      const menuLike = hasLabel
        || popup === "menu"
        || /more|menu|options|ellipsis|dots|delete|rename|更多|菜单|选项|删除|重命名/.test(token)
        || /ellipsis|more|dots|circle|menu/.test(svg)
        || qsa("circle", target).length >= 2
        || (!token && box.width <= 56 && box.height <= 56);
      if (!menuLike) continue;
      candidates.push({
        node: target,
        score: (hasLabel ? 900 : 0) + (popup === "menu" ? 180 : 0) + (box.right >= viewportWidth * 0.72 ? 120 : 0) + (box.width <= 64 ? 60 : 0),
        right: box.right,
        top: box.top
      });
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top);
    return candidates[0]?.node || null;
  }

  function elementArea(node) {
    const box = rect(node);
    return box ? box.width * box.height : Number.POSITIVE_INFINITY;
  }

  function confirmQuestionMatches(value) {
    const text = normalize(value).toLowerCase();
    const token = compact(value);
    return /are you sure you want to delete(?: this)? chat|are you sure.*delete|this chat can(?:'|’)?t be recovered|this chat cant be recovered|delete this chat|share links from it will be disabled|cannot be undone|can(?:'|’)?t be undone|permanently delete|permanent deletion|确定.*删除|确认.*删除|删除.*不可恢复|无法恢复|不能恢复/i.test(text)
      || /delete.*chat|confirm.*delete|删除.*确认|确认.*删除/.test(token);
  }

  function confirmRootTextMatches(value) {
    const text = normalize(value).toLowerCase();
    const token = compact(value);
    if (confirmQuestionMatches(text)) return true;
    const hasDelete = /delete|remove|删除/.test(text) || /delete|remove|删除/.test(token);
    const hasConfirm = /confirm|确认|确定/.test(text) || /confirm|确认|确定/.test(token);
    const hasCancel = /cancel|取消|keep/.test(text) || /cancel|取消|keep/.test(token);
    const hasRecoverWarning = /recover|recovered|undo|permanent|不可恢复|无法恢复|不能恢复/.test(text) || /recover|recovered|undo|permanent|不可恢复|无法恢复|不能恢复/.test(token);
    return hasCancel && (hasRecoverWarning || (hasDelete && hasConfirm));
  }

  function confirmRejectButtonMatches(node) {
    const value = elementText(node);
    return CONFIRM_REJECT_PATTERN.test(normalize(value).toLowerCase()) || CONFIRM_REJECT_PATTERN.test(compact(value));
  }

  function confirmButtonMatches(node, root = null) {
    const value = elementText(node);
    if (!value || matchesLabel(value, CANCEL_LABELS) || confirmRejectButtonMatches(node)) return false;
    if (matchesLabel(value, CONFIRM_STRICT_LABELS, true)) return true;
    if (matchesLabel(value, CONFIRM_GENERIC_LABELS, true)) return true;
    if (root && confirmRootTextMatches(elementText(root))) return matchesLabel(value, CONFIRM_LABELS);
    return matchesLabel(value, CONFIRM_STRICT_LABELS);
  }

  function cancelButtonMatches(node) {
    return matchesLabel(elementText(node), CANCEL_LABELS);
  }

  function addUniqueRoot(roots, root) {
    if (!root || !visible(root)) return;
    if (!roots.some((item) => item === root || item.contains(root) || root.contains(item))) roots.push(root);
  }

  function deleteQuestionDialogRoots() {
    const roots = [];
    const questions = qsa("div,section,[role='dialog'],[role='alertdialog'],dialog", document)
      .filter((node) => visible(node) && confirmQuestionMatches(elementText(node)))
      .sort((a, b) => elementArea(a) - elementArea(b))
      .slice(0, 24);
    for (const question of questions) {
      for (let node = question, depth = 0; node && node !== document.body && depth < 8; node = node.parentElement, depth += 1) {
        if (!visible(node)) continue;
        const buttons = visibleConfirmCandidates(node);
        if (!buttons.some((button) => confirmButtonMatches(button, node)) || !buttons.some(cancelButtonMatches)) continue;
        addUniqueRoot(roots, node);
        break;
      }
    }
    return roots;
  }

  function deleteButtonPairDialogRoots() {
    const roots = [];
    const seedButtons = visibleConfirmCandidates(document)
      .filter((button) => confirmButtonMatches(button) || cancelButtonMatches(button));
    for (const button of seedButtons) {
      for (let node = button, depth = 0; node && node !== document.body && depth < 9; node = node.parentElement, depth += 1) {
        if (!visible(node) || !confirmRootTextMatches(elementText(node))) continue;
        const buttons = visibleConfirmCandidates(node);
        if (!buttons.some((candidate) => confirmButtonMatches(candidate, node)) || !buttons.some(cancelButtonMatches)) continue;
        addUniqueRoot(roots, node);
        break;
      }
    }
    return roots;
  }

  function deleteConfirmationQuestionVisible() {
    return qsa("div,section,[role='dialog'],[role='alertdialog'],dialog,h1,h2,h3,p,span", document)
      .some((node) => visible(node) && confirmQuestionMatches(elementText(node)));
  }

  function deleteDialogRoots() {
    const roots = qsa("[role='alertdialog'],[role='dialog'],dialog,[aria-modal='true'],[data-radix-dialog-content],[data-state='open'],[class*='modal' i],[class*='dialog' i]", document)
      .filter(visible)
      .filter((node) => confirmRootTextMatches(elementText(node)));
    for (const root of deleteQuestionDialogRoots()) addUniqueRoot(roots, root);
    for (const root of deleteButtonPairDialogRoots()) addUniqueRoot(roots, root);
    roots.sort((a, b) => elementArea(a) - elementArea(b));
    return roots;
  }

  function findDeleteConfirmButtonInfo() {
    const candidates = [];
    const roots = deleteDialogRoots();
    const seen = new Set();
    const add = (node, score = 0) => {
      const target = clickable(node);
      if (!target || seen.has(target) || !visible(target) || disabled(target)) return;
      const root = roots.find((item) => item.contains(target) || item.contains(node)) || null;
      if (!confirmButtonMatches(target, root) && !confirmButtonMatches(node, root)) return;
      if (cancelButtonMatches(target) || cancelButtonMatches(node)) return;
      if (!target || seen.has(target) || !visible(target) || disabled(target)) return;
      const box = rect(target);
      if (!box || box.width < 12 || box.height < 10 || box.width > 760 || box.height > 140) return;
      seen.add(node);
      seen.add(target);
      const value = elementText(target) || elementText(node);
      candidates.push({
        node: target,
        root,
        score: score
          + (matchesLabel(value, CONFIRM_STRICT_LABELS, true) ? 700 : 0)
          + (matchesLabel(value, CONFIRM_GENERIC_LABELS, true) ? 420 : 0)
          + (target.matches?.("button,[role='button']") ? 220 : 0),
        top: box.top,
        right: box.right,
        area: box.width * box.height
      });
    };
    for (const root of roots) {
      for (const node of visibleConfirmCandidates(root)) add(node, 260);
    }
    if (!candidates.length && deleteConfirmationQuestionVisible()) {
      const buttons = visibleConfirmCandidates(document);
      const cancelButtons = buttons.filter(cancelButtonMatches);
      if (cancelButtons.length) {
        for (const node of buttons) {
          const value = elementText(node);
          if (!matchesLabel(value, CONFIRM_GENERIC_LABELS, true) && !matchesLabel(value, CONFIRM_STRICT_LABELS, true)) continue;
          const box = rect(node);
          if (!box) continue;
          const nearCancel = cancelButtons.some((cancel) => {
            const cancelBox = rect(cancel);
            if (!cancelBox) return false;
            return Math.abs((cancelBox.left + cancelBox.right) / 2 - (box.left + box.right) / 2) < 360
              && Math.abs((cancelBox.top + cancelBox.bottom) / 2 - (box.top + box.bottom) / 2) < 220;
          });
          if (nearCancel) add(node, 180);
        }
      }
    }
    if (!candidates.length && deleteConfirmationQuestionVisible()) {
      for (const node of visibleConfirmCandidates(document)) {
        const value = elementText(node);
        if (!matchesLabel(value, CONFIRM_GENERIC_LABELS, true) && !matchesLabel(value, CONFIRM_STRICT_LABELS, true)) continue;
        add(node, 80);
      }
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.top - a.top || a.area - b.area);
    return candidates[0] || null;
  }

  function findDeleteConfirmButton() {
    return findDeleteConfirmButtonInfo()?.node || null;
  }

  function serializableRect(box) {
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

  function trustedDeleteConfirmClick(reason = "delete confirmation requires trusted browser input") {
    const info = findDeleteConfirmButtonInfo();
    const button = info?.node || null;
    const box = rect(button);
    if (!button || !box) return null;
    const frameRect = serializableRect(box);
    return {
      kind: "delete-confirm",
      site: SITE_ID,
      reason: String(reason || ""),
      framePoint: {
        x: Math.round((box.left + box.width / 2) * 100) / 100,
        y: Math.round((box.top + box.height / 2) * 100) / 100
      },
      frameRect
    };
  }

  function resultWithTrustedDeleteConfirm(reason) {
    const value = result(false, reason);
    const trustedClick = trustedDeleteConfirmClick(reason);
    return trustedClick ? { ...value, needsTrustedClick: true, trustedClick } : value;
  }

  function trustedDeleteShortcut(reason = "delete shortcut requires trusted browser input") {
    const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
    return {
      kind: "delete-shortcut",
      site: SITE_ID,
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

  function resultWithTrustedDeleteShortcut(reason) {
    return {
      ...result(false, reason),
      needsTrustedKeySequence: true,
      trustedKeySequence: trustedDeleteShortcut(reason)
    };
  }

  function trustedHoverRightEdge(node, reason = "topic menu trigger requires trusted hover") {
    const box = rect(node);
    if (!node || !box) return null;
    const frameRect = serializableRect(box);
    return {
      kind: "topic-menu-hover",
      site: SITE_ID,
      reason: String(reason || ""),
      framePoint: {
        x: Math.round(Math.max(box.left + 8, box.right - 24) * 100) / 100,
        y: Math.round((box.top + box.height / 2) * 100) / 100
      },
      frameRect,
      hoverSettleMs: 520
    };
  }

  function resultWithTrustedHover(reason, node) {
    const value = result(false, reason);
    const trustedHover = trustedHoverRightEdge(node, reason);
    return trustedHover ? { ...value, needsTrustedHover: true, trustedHover } : value;
  }

  function trustedMenuClickPoint(reason = "topic menu trigger requires trusted browser input", point = {}, frameRect = null) {
    const x = Number(point.x ?? point.clientX);
    const y = Number(point.y ?? point.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      kind: "topic-menu-trigger",
      site: SITE_ID,
      reason: String(reason || ""),
      framePoint: {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100
      },
      ...(frameRect ? { frameRect } : {})
    };
  }

  function trustedMenuClickForElement(node, reason = "topic menu trigger requires trusted browser input") {
    const box = rect(node);
    if (!node || !box) return null;
    return trustedMenuClickPoint(reason, {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2
    }, serializableRect(box));
  }

  function deleteConfirmDialogClosed(root, button) {
    return !findDeleteConfirmButton() && !deleteDialogRoots().length;
  }

  async function clickDeleteConfirmIfPresent(timeoutMs = 4200, guard = null) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    let clickedRoot = null;
    let clicked = null;
    let clickedAt = 0;
    while (Date.now() <= deadline) {
      if (clicked && deleteConfirmDialogClosed(clickedRoot, clicked)) return true;
      const info = findDeleteConfirmButtonInfo();
      const button = info?.node || null;
      if (button && typeof guard === "function" && guard() !== true) return false;
      if (button && (button !== clicked || Date.now() - clickedAt > 900) && activateConfirmButton(button, info.root || null)) {
        clickedRoot = info.root || null;
        clicked = button;
        clickedAt = Date.now();
        await sleep(220);
        if (deleteConfirmDialogClosed(clickedRoot, clicked)) return true;
      }
      await sleep(120);
    }
    return Boolean(clicked && deleteConfirmDialogClosed(clickedRoot, clicked));
  }

  async function clickDeleteConfirmIfAppears(appearTimeoutMs = 1200, closeTimeoutMs = 4200) {
    const deadline = Date.now() + Math.max(0, Number(appearTimeoutMs) || 0);
    while (Date.now() <= deadline) {
      if (findDeleteConfirmButton()) {
        return { appeared: true, confirmed: await clickDeleteConfirmIfPresent(closeTimeoutMs) };
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
    let dispatched = false;
    const targets = [document.activeElement, document.body, document.documentElement, document, window].filter(Boolean);
    const seen = new Set();
    for (const target of targets) {
      if (seen.has(target)) continue;
      seen.add(target);
      for (const type of ["keydown", "keyup"]) {
        try {
          target.dispatchEvent(new KeyboardEvent(type, init));
          dispatched = true;
        } catch {}
      }
    }
    return dispatched;
  }

  function kagiChatIdFromHref(value) {
    const match = String(value || "").match(/\/chat\/([^/?#]+)/i);
    return match ? match[1] : "";
  }

  function kagiCurrentThreadLink(payload = {}) {
    const ids = new Set([
      location.href,
      payload.currentThreadHref,
      payload.currentHref,
      payload.cachedHref,
      payload.href,
      payload.url
    ].map(kagiChatIdFromHref).filter(Boolean));
    const links = qsa("a[href*='/chat/']", document)
      .filter((link) => visible(link) && rect(link));
    if (ids.size) {
      const exact = links.find((link) => ids.has(kagiChatIdFromHref(link.href || link.getAttribute("href"))));
      if (exact) return exact;
    }
    return links
      .filter((link) => {
        const box = rect(link);
        return box && box.left <= 520 && box.width >= 80 && box.height >= 16;
      })
      .sort((a, b) => (rect(a)?.top || 0) - (rect(b)?.top || 0))[0] || links[0] || null;
  }

  function kagiSidebarToggle() {
    return qsa("button,[role='button']", document)
      .filter((node) => {
        if (!visible(node)) return false;
        const box = rect(node);
        if (!box || box.top > 120 || box.left > 120 || box.width > 96 || box.height > 96) return false;
        const bits = elementText(node) + " " + svgText(node);
        return /show sidebar|sidebar|menu|侧边栏|菜单/i.test(bits) || !compact(bits);
      })
      .sort((a, b) => (rect(a)?.left || 0) - (rect(b)?.left || 0))[0] || null;
  }

  async function ensureKagiSidebarOpen(payload = {}) {
    if (kagiCurrentThreadLink(payload)) return true;
    const toggle = kagiSidebarToggle();
    if (toggle && clickAt(toggle)) {
      const link = await waitFor(() => kagiCurrentThreadLink(payload), 1600, 100);
      if (link) return true;
    }
    return Boolean(kagiCurrentThreadLink(payload));
  }

  function kagiCurrentTitleToken() {
    return compact((document.title || "").replace(/\s+-\s*Kagi Assistant\s*$/i, ""));
  }

  function kagiTitleButtons() {
    const titleToken = kagiCurrentTitleToken();
    return qsa("button,[role='button']", document)
      .filter((button) => {
        if (!visible(button)) return false;
        const box = rect(button);
        if (!box || box.top > 130 || box.width < 32 || box.height < 12 || box.height > 72) return false;
        const token = compact(elementText(button));
        if (/newthread|showsidebar|markaspermanent|permanent|kagiproducts|settings|searchthreads|folders|newfolder|copy|edit|regenerate|scroll|发送|设置|新建|搜索/.test(token)) return false;
        return /clicktorename|rename|重命名/.test(token) || (titleToken.length >= 4 && token.includes(titleToken));
      })
      .sort((a, b) => {
        const ar = rect(a);
        const br = rect(b);
        return (ar?.top || 0) - (br?.top || 0) || (ar?.left || 0) - (br?.left || 0);
      });
  }

  function kagiTopThreadMenuTrigger() {
    const titleButtons = kagiTitleButtons();
    const candidates = [];
    const seen = new Set();
    const selector = "button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])";
    const add = (node, titleButton, score = 0) => {
      const target = clickable(node);
      if (!target || seen.has(target) || target === titleButton || disabled(target) || !visible(target)) return;
      const box = rect(target);
      const titleBox = rect(titleButton);
      if (!box || !titleBox || box.top > 130 || box.width < 8 || box.height < 8 || box.width > 96 || box.height > 76) return;
      if (box.top > titleBox.bottom + 14 || box.bottom < titleBox.top - 14) return;
      if (box.left < titleBox.left - 16 || box.left > titleBox.right + 120) return;
      const value = elementText(target);
      const token = compact(value);
      if (/newthread|showsidebar|markaspermanent|permanent|kagiproducts|settings|searchthreads|folders|newfolder|copy|edit|regenerate|scroll|发送|设置|新建|搜索/.test(token)) return;
      const popup = String(target.getAttribute("aria-haspopup") || "").toLowerCase();
      const expanded = target.hasAttribute("aria-expanded");
      const signature = svgText(target).toLowerCase();
      const immediateTitleNeighbor = box.left >= titleBox.right - 8 && box.left <= titleBox.right + 44 && box.width <= 56 && box.height <= 56;
      const menuLike = popup === "menu"
        || popup === "true"
        || expanded
        || /more|menu|options|ellipsis|dots|dropdown|chevron|caret|arrow|down|triangle|更多|菜单|选项/.test(token)
        || /more|ellipsis|dots|dropdown|chevron|caret|arrow|down|triangle/.test(signature)
        || (!token && box.width <= 48)
        || immediateTitleNeighbor;
      if (!menuLike) return;
      seen.add(target);
      candidates.push({
        node: target,
        score: score
          + (popup === "menu" || popup === "true" ? 360 : 0)
          + (expanded ? 120 : 0)
          + (/dropdown|chevron|caret|arrow|down|triangle/.test(signature) ? 260 : 0)
          + (/more|menu|options|更多|菜单|选项/.test(token) ? 180 : 0)
          + (!token && box.width <= 48 ? 180 : 0)
          + Math.max(0, 280 - Math.abs(box.left - titleBox.right) * 4),
        top: box.top,
        left: box.left
      });
    };
    for (const titleButton of titleButtons) {
      for (let scope = titleButton.parentElement, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
        qsa(selector, scope).forEach((node) => add(node, titleButton, 180 - depth * 12));
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.left - b.left);
    return candidates[0]?.node || null;
  }

  function kagiThreadRowFromLink(link) {
    if (!link) return null;
    const linkBox = rect(link);
    let best = link;
    for (let node = link.parentElement, depth = 0; node && node !== document.body && depth < 7; node = node.parentElement, depth += 1) {
      const box = rect(node);
      if (!box || box.width < 120 || box.height < 20 || box.height > 120) continue;
      if (linkBox && (box.top > linkBox.top + 10 || box.bottom < linkBox.bottom - 10)) continue;
      best = node;
      const hasMore = qsa("button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1'])", node)
        .some((item) => item !== link && rect(item));
      if (hasMore) break;
    }
    return best;
  }

  function hoverKagiThreadRow(row) {
    const box = rect(row);
    if (!box) return;
    const point = { clientX: Math.max(box.left + 16, box.right - 28), clientY: box.top + box.height / 2 };
    for (let node = row, depth = 0; node && node !== document.body && depth < 5; node = node.parentElement, depth += 1) {
      for (const type of ["pointerover", "mouseover", "mouseenter", "mousemove", "pointermove"]) {
        try {
          const Ctor = type.startsWith("pointer") ? eventCtor("PointerEvent", node) : eventCtor("MouseEvent", node);
          node.dispatchEvent(new Ctor(type, {
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

  function kagiThreadMoreButton(link) {
    const row = kagiThreadRowFromLink(link);
    if (!row) return null;
    reveal(row);
    hoverKagiThreadRow(row);
    const rowBox = rect(row);
    if (!rowBox) return null;
    const candidates = [];
    const seen = new Set();
    const add = (node, score = 0) => {
      const target = clickable(node);
      if (!target || seen.has(target) || target === link || disabled(target)) return;
      const box = rect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 88 || box.height > 88) return;
      if (box.top > rowBox.bottom + 12 || box.bottom < rowBox.top - 12) return;
      const bits = elementText(target) + " " + svgText(target);
      const token = compact(bits);
      const popup = String(target.getAttribute("aria-haspopup") || "").toLowerCase();
      const moreLike = /moreoptions|more|options|menu|ellipsis|dots|更多|菜单|选项/.test(token)
        || /more|ellipsis|dots|circle/.test(bits.toLowerCase())
        || popup === "menu"
        || qsa("circle", target).length >= 2
        || (!token && box.width <= 48);
      if (!moreLike) return;
      seen.add(target);
      candidates.push({
        node: target,
        score: score
          + (/moreoptions|more|options|menu|更多|菜单|选项/.test(token) ? 300 : 0)
          + (popup === "menu" ? 180 : 0)
          + Math.max(0, 120 - Math.abs(box.right - rowBox.right)),
        right: box.right
      });
    };
    for (let scope = row, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
      qsa("button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1'])", scope).forEach((node) => add(node, 90 - depth * 8));
    }
    for (const offset of [10, 22, 36, 54]) {
      const point = { clientX: Math.max(rowBox.left + 16, rowBox.right - offset), clientY: rowBox.top + rowBox.height / 2 };
      const node = document.elementFromPoint(point.clientX, point.clientY);
      add(node, 170 - offset);
      const pointButton = closest(node, "button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1'])");
      add(pointButton, 190 - offset);
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right);
    return candidates[0]?.node || null;
  }

  async function deleteKagi(payload = {}) {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6200);
      return confirmedExisting ? result(true) : result(false, "delete confirmation did not close");
    }
    if (!dispatchDeleteKeyboardShortcut()) return result(false, "delete shortcut dispatch failed");
    const shortcutConfirm = await clickDeleteConfirmIfAppears(2600, 4200);
    if (shortcutConfirm.confirmed) return result(true);
    if (shortcutConfirm.appeared || deleteDialogRoots().length) {
      return result(false, "delete shortcut opened confirmation but it did not close");
    }
    return result(false, "delete shortcut did not open confirmation");
  }

  async function deleteChatGpt(payload = {}) {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6200);
      return confirmedExisting ? result(true) : resultWithTrustedDeleteConfirm("delete confirmation did not close");
    }
    if (!dispatchDeleteKeyboardShortcut()) {
      return payload?.trustedKeySequenceRetried
        ? result(false, "delete shortcut dispatch failed")
        : resultWithTrustedDeleteShortcut("delete shortcut dispatch failed");
    }
    const shortcutConfirm = await clickDeleteConfirmIfAppears(2600, 4200);
    if (shortcutConfirm.confirmed) return result(true);
    if (shortcutConfirm.appeared || deleteDialogRoots().length) {
      return resultWithTrustedDeleteConfirm("delete shortcut opened confirmation but it did not close");
    }
    return payload?.trustedKeySequenceRetried
      ? result(false, "delete shortcut did not open confirmation")
      : resultWithTrustedDeleteShortcut("delete shortcut did not open confirmation");
  }

  const GEMINI_CONVERSATION_ACTION_SELECTOR = [
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
  const GEMINI_CONVERSATION_MENU_ROOT_SELECTOR = [
    ".cdk-overlay-pane .mat-mdc-menu-panel[role='menu']",
    ".cdk-overlay-pane .mat-menu-panel[role='menu']",
    ".cdk-overlay-pane [role='menu']",
    ".cdk-overlay-pane .mat-mdc-menu-panel",
    ".cdk-overlay-pane .mat-menu-panel",
    ".mat-mdc-menu-panel[role='menu']",
    ".mat-menu-panel[role='menu']",
    ".cdk-overlay-pane"
  ].join(", ");
  const GEMINI_CONVERSATION_MENU_ITEM_SELECTOR = [
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
  const GEMINI_CONVERSATION_MENU_MARKERS = ["Delete", "Rename", "Pin", "Share", "Unpin", "删除", "重命名", "固定", "取消固定", "分享"];
  const GEMINI_SIDEBAR_TOGGLE_SELECTOR = [
    "top-bar-actions button:not([aria-haspopup='menu'])[aria-label*='sidebar' i]",
    "top-bar-actions button:not([aria-haspopup='menu'])[aria-label*='side bar' i]",
    "top-bar-actions button:not([aria-haspopup='menu'])[aria-label*='navigation' i]",
    "top-bar-actions button:not([aria-haspopup='menu'])[aria-label*='侧栏']",
    "top-bar-actions button:not([aria-haspopup='menu'])[aria-label*='侧边栏']",
    "top-bar-actions button:not([aria-haspopup='menu'])[aria-label*='导航']",
    "top-bar-actions button:has(mat-icon[fonticon='menu'])",
    "top-bar-actions button:has(mat-icon[data-mat-icon-name='menu'])",
    "top-bar-actions button:has(mat-icon[fonticon='menu_open'])",
    "top-bar-actions button:has(mat-icon[data-mat-icon-name='menu_open'])",
    "bard-sidenav button:not([aria-haspopup='menu'])[aria-label*='menu' i]",
    "side-navigation-content button:not([aria-haspopup='menu'])[aria-label*='menu' i]",
    "bard-sidenav button:not([aria-haspopup='menu'])[aria-label*='sidebar' i]",
    "side-navigation-content button:not([aria-haspopup='menu'])[aria-label*='sidebar' i]",
    "bard-sidenav button:not([aria-haspopup='menu'])[aria-label*='navigation' i]",
    "side-navigation-content button:not([aria-haspopup='menu'])[aria-label*='navigation' i]",
    "bard-sidenav button:has(mat-icon[fonticon='menu'])",
    "side-navigation-content button:has(mat-icon[fonticon='menu'])",
    "bard-sidenav button:has(mat-icon[data-mat-icon-name='menu'])",
    "side-navigation-content button:has(mat-icon[data-mat-icon-name='menu'])",
    "button[aria-label='Open sidebar']",
    "button[aria-label='Close sidebar']",
    "button[aria-label='Expand sidebar']",
    "button[aria-label='Collapse sidebar']",
    "button:not([aria-haspopup='menu'])[aria-label='Open navigation menu']",
    "button:not([aria-haspopup='menu'])[aria-label='Close navigation menu']"
  ].join(", ");
  const GEMINI_SIDEBAR_ROOT_SELECTOR = "bard-sidenav, side-navigation-content, .sidenav-with-history-container";
  const GEMINI_SIDEBAR_OPEN_SELECTOR = [
    ".sidenav-with-history-container.expanded",
    ".conversation-items-container.side-nav-opened",
    ".conversation-actions-container.side-nav-opened",
    "bard-sidenav[style*='--bard-sidenav-open-width']",
    "bard-sidenav.side-nav-expanded",
    "side-navigation-content.side-nav-expanded",
    "top-bar-actions.side-nav-expanded",
    "side-navigation-content side-nav-action-button.is-expanded",
    "side-navigation-content [data-test-id='new-chat-button'].is-expanded"
  ].join(", ");
  const GEMINI_SIDEBAR_CLOSED_SELECTOR = [
    ".sidenav-with-history-container:not(.expanded)",
    "bard-sidenav[style*='--bard-sidenav-closed-width']"
  ].join(", ");
  const GEMINI_CONVERSATION_LINK_SELECTOR = [
    "a[data-test-id='conversation']",
    "gem-nav-list-item[data-test-id='conversation'] a[href*='/app/']",
    "a[href*='/app/']"
  ].join(", ");
  const GEMINI_CONVERSATION_SEARCH_ROOT_SELECTOR = [
    "conversations-list",
    ".chat-history-list",
    ".chat-history",
    "mat-nav-list[role='navigation']",
    "mat-nav-list.gds-sidenav-list",
    "bard-sidenav",
    "side-navigation-content",
    ".sidenav-with-history-container"
  ].join(", ");
  const GEMINI_CONVERSATION_ROW_CANDIDATE_SELECTOR = [
    "gem-nav-list-item[data-test-id='conversation']",
    "gem-nav-list-item",
    ".conversation-item",
    ".conversation-list-item",
    ".conversation-row",
    ".gem-nav-list-item",
    "[data-test-id='conversation-container']",
    "[data-test-id='conversation-row']",
    "[role='listitem']",
    ".mat-mdc-list-item",
    ".mat-list-item",
    "li"
  ].join(", ");
  const GEMINI_CONVERSATION_ACTION_BUTTON_FAST_SELECTOR = [
    ".hovered-trailing-content gem-icon-button[data-test-id='actions-menu-button'] button",
    ".hovered-trailing-content gem-icon-button[data-test-id='actions-menu-button']",
    "gem-icon-button[data-test-id='actions-menu-button'] button",
    "gem-icon-button[data-test-id='actions-menu-button']",
    "gem-icon-button.gem-conversation-actions-menu-button button",
    "gem-icon-button.gem-conversation-actions-menu-button",
    "button[data-test-id='actions-menu-button']",
    "button[data-test-id='conversation-actions-menu-icon-button']"
  ].join(", ");
  const GEMINI_CONVERSATION_ACTION_BUTTON_SELECTOR = [
    GEMINI_CONVERSATION_ACTION_BUTTON_FAST_SELECTOR,
    "gem-icon-button[data-test-id='conversation-actions-menu-icon-button']",
    "gem-icon-button[data-test-id='conversation-actions-menu-icon-button'] button",
    ".hovered-trailing-content gem-icon-button[data-test-id='actions-menu-button']",
    ".hovered-trailing-content gem-icon-button[data-test-id='actions-menu-button'] button",
    "button[aria-label*='More options' i]",
    "button[aria-label*='更多选项' i]",
    "[role='button'][aria-label*='More options' i]",
    "[role='button'][aria-label*='更多选项' i]",
    "button[aria-haspopup='menu']",
    "[role='button'][aria-haspopup='menu']",
    "button[aria-label*='menu' i]",
    "[role='button'][aria-label*='menu' i]",
    "button:has(mat-icon[fonticon='more_vert'])",
    "button:has(mat-icon[data-mat-icon-name='more_vert'])",
    "button:has(mat-icon[fonticon='more_horiz'])",
    "button:has(mat-icon[data-mat-icon-name='more_horiz'])",
    "button.conversation-actions-menu-button"
  ].join(", ");

  function geminiCollectTextExcludingIcons(node, parts = []) {
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
      for (const child of Array.from(node.childNodes || [])) geminiCollectTextExcludingIcons(child, parts);
    } catch {}
    return parts;
  }

  function geminiUiText(node) {
    if (!node) return "";
    const ariaLabel = node.getAttribute?.("aria-label");
    if (ariaLabel && String(ariaLabel).trim()) return normalize(ariaLabel);
    const title = node.getAttribute?.("title");
    if (title && String(title).trim()) return normalize(title);
    const withoutIcons = normalize(geminiCollectTextExcludingIcons(node, []).join(" "));
    if (withoutIcons) return withoutIcons;
    return normalize(node.textContent || "");
  }

  function geminiJslogId(node) {
    for (let current = node, depth = 0; current && depth < 5; current = current.parentElement, depth += 1) {
      const match = String(current.getAttribute?.("jslog") || "").match(/^\s*([0-9]+)/);
      if (match) return match[1];
    }
    return "";
  }

  function geminiDataTestIds(node) {
    const ids = [];
    const add = (item) => {
      const id = String(item?.getAttribute?.("data-test-id") || "").trim().toLowerCase();
      if (id && !ids.includes(id)) ids.push(id);
    };
    add(node);
    qsa("[data-test-id]", node).forEach(add);
    return ids;
  }

  function geminiMenuItemLooksLikeNotebook(node) {
    const value = normalize([geminiUiText(node), elementText(node), geminiDataTestIds(node).join(" ")].join(" "));
    return /\bnotebook\b/i.test(value) || value.includes("笔记本");
  }

  function geminiMenuMarkerCount(node) {
    const value = normalize([geminiUiText(node), node?.textContent].filter(Boolean).join(" ")).toLowerCase();
    const matched = [];
    for (const marker of GEMINI_CONVERSATION_MENU_MARKERS.map((item) => item.toLowerCase()).sort((a, b) => b.length - a.length)) {
      if (!value.includes(marker) || matched.some((existing) => existing.includes(marker))) continue;
      matched.push(marker);
    }
    return matched.length;
  }

  function geminiConversationMenuRoot(node) {
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
    return geminiMenuMarkerCount(node) > 0;
  }

  function geminiConversationActionButtonExcluded(button) {
    if (!button || !visible(button)) return true;
    if (button.closest?.("bard-sidenav, side-navigation-content, .sidenav-with-history-container, .conversation-items-container, side-nav-action-button")) return true;
    if (button.closest?.("input-area-v2, [data-node-type='input-area'], [contenteditable='true'], .prompt-input, .composer, .prompt-composer")) return true;
    if (button.closest?.("user-query,user-query-content,model-response,message-content,message-actions,response-actions,.message-actions,.response-actions,[data-test-id*='user-query' i],[data-test-id*='model-response' i],[data-test-id*='response' i],[data-test-id*='message' i],[data-test-id*='query' i]")) return true;
    if (button.closest?.(".cdk-overlay-pane .mat-mdc-menu-panel,.cdk-overlay-pane .mat-menu-panel,.cdk-overlay-pane [role='menu'],mat-dialog-container,[role='dialog']")) return true;
    return false;
  }

  function geminiConversationActionButton() {
    const candidates = [];
    for (const button of qsa(GEMINI_CONVERSATION_ACTION_SELECTOR, document)) {
      if (geminiConversationActionButtonExcluded(button)) continue;
      const dataTestId = String(button.getAttribute?.("data-test-id") || "").trim().toLowerCase();
      const ariaLabel = normalize(button.getAttribute?.("aria-label") || "").toLowerCase();
      const title = normalize(button.getAttribute?.("title") || "").toLowerCase();
      const text = geminiUiText(button).toLowerCase();
      const className = String(button.className || "").toLowerCase();
      const inTopBar = Boolean(button.closest?.("top-bar-actions"));
      const explicitlyConversationAction = inTopBar
        || dataTestId === "conversation-actions-menu-icon-button"
        || className.includes("conversation-actions-menu-button")
        || ariaLabel.includes("conversation actions")
        || ariaLabel.includes("open menu for conversation actions")
        || title.includes("conversation actions")
        || text.includes("conversation actions");
      if (!explicitlyConversationAction) continue;
      const box = rect(button);
      let score = 0;
      if (dataTestId === "conversation-actions-menu-icon-button") score += 160;
      if (dataTestId === "actions-menu-button") score += 70;
      if (className.includes("conversation-actions-menu-button")) score += 130;
      if (inTopBar) score += 120;
      if (ariaLabel.includes("conversation actions")) score += 100;
      if (ariaLabel.includes("open menu for conversation actions")) score += 140;
      if (inTopBar && ariaLabel.includes("more options")) score += 40;
      if (title.includes("conversation actions")) score += 60;
      if (text.includes("conversation actions")) score += 70;
      if (inTopBar && /more_vert/i.test(elementText(button))) score += 35;
      if (box && box.top <= Math.max(220, (window.innerHeight || 1) * 0.32)) score += 20;
      if (box && box.left >= (window.innerWidth || 1) * 0.42) score += 20;
      candidates.push({ node: button, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.node || null;
  }

  function geminiSimulateMenuClick(node) {
    const target = clickable(node) || node;
    if (!target || disabled(target)) return false;
    reveal(target);
    try { target.focus?.({ preventScroll: true }); } catch {
      try { target.focus?.(); } catch {}
    }
    const coords = pointFor(target);
    const plans = [
      ["pointerdown", "PointerEvent", { buttons: 1 }],
      ["mousedown", "MouseEvent", { buttons: 1 }],
      ["pointerup", "PointerEvent", { buttons: 0 }],
      ["mouseup", "MouseEvent", { buttons: 0 }],
      ["click", "MouseEvent", { buttons: 0, detail: 1 }]
    ];
    let dispatched = false;
    for (const [type, ctorName, extra] of plans) {
      try {
        const Ctor = eventCtor(ctorName, target);
        target.dispatchEvent(new Ctor(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          ...coords,
          ...extra
        }));
        dispatched = true;
      } catch {}
    }
    if (!dispatched) {
      try { target.click?.(); dispatched = true; } catch {}
    }
    return dispatched;
  }

  function geminiFirstVisible(selector, fallbackToFirst = false) {
    const candidates = qsa(selector, document);
    return candidates.find(visible) || (fallbackToFirst ? candidates[0] || null : null);
  }

  function geminiStringAttr(node, name) {
    try { return String(node?.getAttribute?.(name) || "").trim(); } catch { return ""; }
  }

  function geminiNormalizeConversationPathname(value) {
    try {
      const pathname = new URL(String(value || ""), location.origin).pathname.replace(/\/+$/, "");
      const match = pathname.match(/^\/app\/([^/?#]+)/);
      return match ? "/app/" + match[1] : "";
    } catch { return ""; }
  }

  function geminiCurrentConversationPathname() {
    return geminiNormalizeConversationPathname(location.href);
  }

  function geminiSidebarOpen() {
    const explicitlyOpen = qsa(GEMINI_SIDEBAR_OPEN_SELECTOR, document).some((node) => {
      const box = rect(node);
      return visible(node) || Boolean(box && box.width >= 160);
    });
    if (explicitlyOpen) return true;
    for (const root of qsa(GEMINI_SIDEBAR_ROOT_SELECTOR, document)) {
      const className = String(root.className || "").toLowerCase();
      const state = geminiStringAttr(root, "data-state").toLowerCase();
      const expanded = geminiStringAttr(root, "aria-expanded").toLowerCase();
      if (expanded === "true" || state === "expanded" || state === "open" || /(?:expanded|side-nav-opened|side-nav-expanded)/.test(className)) return true;
      if (expanded === "false" || state === "collapsed" || state === "closed" || /(?:collapsed|side-nav-closed)/.test(className)) return false;
      const box = rect(root);
      if (box && box.width >= 160 && box.right > 0) return true;
      if (box && box.width > 0 && box.width <= 96) return false;
    }
    if (qsa(GEMINI_SIDEBAR_CLOSED_SELECTOR, document).length) return false;
    const toggle = geminiFirstVisible(GEMINI_SIDEBAR_TOGGLE_SELECTOR, true);
    const label = normalize([geminiStringAttr(toggle, "aria-label"), geminiStringAttr(toggle, "title")].join(" ")).toLowerCase();
    if (/(open|expand|show).*(sidebar|side bar|navigation|menu)/.test(label)) return false;
    if (/(close|collapse|hide).*(sidebar|side bar|navigation|menu)/.test(label)) return true;
    if (/(打开|展开|显示).*(侧栏|侧边栏|导航|菜单)/.test(label)) return false;
    if (/(关闭|收起|隐藏).*(侧栏|侧边栏|导航|菜单)/.test(label)) return true;
    return null;
  }

  async function geminiEnsureSidebarOpen() {
    if (geminiSidebarOpen() === true) return true;
    const toggle = geminiFirstVisible(GEMINI_SIDEBAR_TOGGLE_SELECTOR, true);
    if (!toggle || !visible(toggle) || disabled(toggle)) return false;
    geminiSimulateMenuClick(toggle);
    let opened = await waitFor(() => geminiSidebarOpen() === true ? true : null, 1300, 90);
    if (opened) return true;
    if (geminiSidebarOpen() !== true) clickAt(toggle);
    opened = await waitFor(() => geminiSidebarOpen() === true ? true : null, 1300, 90);
    return Boolean(opened || geminiSidebarOpen() === true);
  }

  function geminiMatchesSelector(node, selector) {
    try { return Boolean(node?.matches?.(selector)); } catch { return false; }
  }

  function geminiConversationLinkCount(node) {
    if (!node) return 0;
    try {
      return (node.matches?.(GEMINI_CONVERSATION_LINK_SELECTOR) ? 1 : 0)
        + node.querySelectorAll(GEMINI_CONVERSATION_LINK_SELECTOR).length;
    } catch { return 0; }
  }

  function geminiConversationEntryContainer(link) {
    if (!link) return null;
    const preferred = [
      "gem-nav-list-item[data-test-id='conversation']",
      "gem-nav-list-item",
      ".conversation-item",
      ".conversation-list-item",
      ".conversation-row",
      ".mat-mdc-list-item",
      ".mat-list-item",
      "[role='listitem']"
    ];
    for (const selector of preferred) {
      let candidate = null;
      try { candidate = link.closest?.(selector) || null; } catch {}
      if (!candidate || geminiMatchesSelector(candidate, GEMINI_SIDEBAR_ROOT_SELECTOR)) continue;
      if (geminiConversationLinkCount(candidate) === 1) return candidate;
    }
    let best = null;
    let bestScore = -Infinity;
    for (let node = link, depth = 0; node && node.nodeType === 1 && depth < 12; node = node.parentElement, depth += 1) {
      if (geminiMatchesSelector(node, GEMINI_SIDEBAR_ROOT_SELECTOR)) break;
      const linkCount = geminiConversationLinkCount(node);
      if (!linkCount) continue;
      const box = rect(node);
      let score = linkCount === 1 ? 120 : -Math.min(120, linkCount * 16);
      if (node === link.parentElement) score += 30;
      if (geminiMatchesSelector(node, GEMINI_CONVERSATION_ROW_CANDIDATE_SELECTOR)) score += 45;
      if (box && box.width > 0 && box.height > 0) {
        score += 8;
        if (box.height <= 72) score += 28;
        else if (box.height <= 112) score += 12;
        else score -= 25;
      }
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best || link.parentElement || null;
  }

  function geminiConversationActionHost(node) {
    if (!node || node.nodeType !== 1) return null;
    const selector = [
      "gem-icon-button[data-test-id='actions-menu-button']",
      "gem-icon-button[data-test-id='conversation-actions-menu-icon-button']",
      "gem-icon-button.gem-conversation-actions-menu-button",
      ".gem-conversation-actions-menu-button"
    ].join(", ");
    try {
      if (node.matches?.(selector)) return node;
      return node.closest?.(selector) || null;
    } catch { return null; }
  }

  function geminiConversationMenuClickTarget(node) {
    if (!node || node.nodeType !== 1) return null;
    const role = geminiStringAttr(node, "role").toLowerCase();
    if (String(node.tagName || "").toLowerCase() === "button" || role === "button") return node;
    const host = geminiConversationActionHost(node) || node;
    try { return host.querySelector?.("button, [role='button']") || host; } catch { return host; }
  }

  function geminiConversationMenuButtonScore(button) {
    if (!button || disabled(button) || button.closest?.("mat-dialog-container, [role='dialog'], .cdk-overlay-pane")) return -Infinity;
    const host = geminiConversationActionHost(button);
    if (host && disabled(host)) return -Infinity;
    const value = normalize([
      geminiStringAttr(button, "data-test-id"),
      geminiStringAttr(host, "data-test-id"),
      geminiStringAttr(button, "aria-label"),
      geminiStringAttr(host, "aria-label"),
      geminiStringAttr(button, "title"),
      geminiStringAttr(host, "title"),
      String(button.className || ""),
      String(host?.className || ""),
      elementText(button),
      svgText(button)
    ].filter(Boolean).join(" ")).toLowerCase();
    let score = 0;
    if (value.includes("actions-menu-button")) score += 170;
    if (value.includes("conversation-actions-menu-icon-button")) score += 170;
    if (value.includes("conversation-actions-menu-button")) score += 130;
    if (value.includes("open menu for conversation actions")) score += 150;
    if (value.includes("conversation actions")) score += 120;
    if (value.includes("more options for")) score += 140;
    if (value.includes("more options") || value.includes("更多选项")) score += 115;
    if (value.includes("aria-haspopup menu") || geminiStringAttr(button, "aria-haspopup").toLowerCase() === "menu") score += 80;
    if (/more[_ -]?(vert|horiz)/.test(value)) score += 100;
    if (/\b(delete|rename|pin)\b|删除|重命名|置顶|固定/.test(value)) score -= 80;
    const box = rect(button);
    if (box && box.width > 0 && box.height > 0) {
      score += 8;
      if (box.width <= 64 && box.height <= 64) score += 18;
    }
    return score;
  }

  function geminiConversationMenuButton(container) {
    if (!container) return null;
    const collect = (selector) => {
      const seen = new Set();
      return qsa(selector, container)
        .map(geminiConversationMenuClickTarget)
        .filter((node) => node && !seen.has(node) && seen.add(node))
        .map((node) => ({ node, score: geminiConversationMenuButtonScore(node), shown: visible(node) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => Number(b.shown) - Number(a.shown) || b.score - a.score)[0]?.node || null;
    };
    return collect(GEMINI_CONVERSATION_ACTION_BUTTON_FAST_SELECTOR)
      || collect(GEMINI_CONVERSATION_ACTION_BUTTON_SELECTOR);
  }

  function geminiConversationActionContainers(entry) {
    const containers = [];
    const add = (node) => {
      if (node && !containers.includes(node)) containers.push(node);
    };
    add(entry?.container);
    add(entry?.link);
    const linkBox = rect(entry?.link);
    const linkMidY = linkBox ? linkBox.top + linkBox.height / 2 : null;
    for (let node = entry?.link?.parentElement || null, depth = 0; node && depth < 5; node = node.parentElement, depth += 1) {
      if (geminiMatchesSelector(node, GEMINI_SIDEBAR_ROOT_SELECTOR)) break;
      if (geminiConversationLinkCount(node) !== 1) break;
      const box = rect(node);
      if (box && linkBox) {
        const maxHeight = Math.max(128, linkBox.height * 2.5);
        if (box.height > maxHeight || linkMidY < box.top - 2 || linkMidY > box.bottom + 2) break;
      }
      add(node);
    }
    return containers;
  }

  function geminiRefreshConversationEntryButton(entry) {
    if (!entry) return entry;
    for (const container of geminiConversationActionContainers(entry)) {
      const button = geminiConversationMenuButton(container);
      if (button) return { ...entry, container, button };
    }
    return { ...entry, button: null };
  }

  function geminiRevealConversationEntryActions(entry) {
    if (!entry?.container) return entry;
    let next = geminiRefreshConversationEntryButton(entry);
    if (next.button && visible(next.button)) return next;
    const targets = [];
    const add = (node) => {
      if (node && !targets.includes(node)) targets.push(node);
    };
    geminiConversationActionContainers(next).forEach(add);
    for (const target of targets) {
      try { target.scrollIntoView?.({ block: "nearest", inline: "nearest" }); } catch {}
      const box = rect(target);
      const coords = box ? {
        clientX: Math.max(1, box.right - Math.min(12, Math.max(4, box.width / 6))),
        clientY: Math.max(1, box.top + Math.min(box.height - 4, Math.max(4, box.height / 2)))
      } : { clientX: 1, clientY: 1 };
      for (const type of ["mousemove", "mouseover", "mouseenter", "pointermove", "pointerover", "pointerenter"]) {
        try {
          const Ctor = type.startsWith("pointer") ? eventCtor("PointerEvent", target) : eventCtor("MouseEvent", target);
          target.dispatchEvent(new Ctor(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            ...coords
          }));
        } catch {}
      }
      try { target.focus?.({ preventScroll: true }); } catch {}
    }
    next = geminiRefreshConversationEntryButton(next);
    return next;
  }

  function geminiConversationLinks() {
    const roots = [];
    const seenRoots = new Set();
    const addRoot = (node) => {
      if (!node || seenRoots.has(node)) return;
      seenRoots.add(node);
      roots.push(node);
    };
    qsa(GEMINI_CONVERSATION_SEARCH_ROOT_SELECTOR, document).forEach(addRoot);
    qsa(GEMINI_SIDEBAR_ROOT_SELECTOR, document).forEach(addRoot);
    const links = [];
    const seen = new Set();
    const collect = (root) => {
      for (const link of qsa(GEMINI_CONVERSATION_LINK_SELECTOR, root)) {
        if (!link || seen.has(link) || !link.closest?.(GEMINI_SIDEBAR_ROOT_SELECTOR)) continue;
        seen.add(link);
        links.push(link);
      }
    };
    roots.forEach(collect);
    if (!links.length) collect(document);
    return links;
  }

  function geminiCurrentConversationEntry() {
    const currentPathname = geminiCurrentConversationPathname();
    if (!currentPathname) return { entry: null, reason: "current page is not a saved Gemini conversation", currentPathname };
    const matches = geminiConversationLinks().filter((link) => {
      return geminiNormalizeConversationPathname(link.getAttribute?.("href") || link.href || "") === currentPathname;
    });
    if (!matches.length) return { entry: null, reason: "current conversation row not found", currentPathname };
    const visibleMatches = matches.filter((link) => {
      const container = geminiConversationEntryContainer(link);
      return visible(link) || visible(container);
    });
    const pool = visibleMatches.length ? visibleMatches : matches;
    if (pool.length !== 1) return { entry: null, reason: "current conversation row matched more than once", currentPathname };
    const link = pool[0];
    const container = geminiConversationEntryContainer(link);
    if (!container) return { entry: null, reason: "current conversation row container not found", currentPathname };
    return {
      entry: geminiRefreshConversationEntryButton({ link, container, button: null }),
      reason: "",
      currentPathname
    };
  }

  async function geminiCurrentConversationMenuTarget(timeoutMs = 3600) {
    if (!await geminiEnsureSidebarOpen()) {
      return { entry: null, reason: "Gemini sidebar could not be opened", currentPathname: geminiCurrentConversationPathname() };
    }
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    let last = geminiCurrentConversationEntry();
    let revealedContainer = null;
    let historyReloaded = false;
    while (Date.now() <= deadline) {
      const current = geminiCurrentConversationEntry();
      if (current.entry?.button && visible(current.entry.button)) return current;
      if (current.entry) {
        const next = current.entry.container !== revealedContainer
          ? geminiRevealConversationEntryActions(current.entry)
          : geminiRefreshConversationEntryButton(current.entry);
        revealedContainer = current.entry.container;
        if (next.button && visible(next.button)) return { ...current, entry: next, reason: "" };
      } else if (!historyReloaded) {
        const reload = geminiFirstVisible("[data-test-id='sidenav-error-action-link']");
        if (reload) {
          historyReloaded = true;
          geminiSimulateMenuClick(reload);
        }
      }
      last = current;
      await sleep(180);
    }
    const finalValue = geminiCurrentConversationEntry();
    if (finalValue.entry) {
      const next = geminiRevealConversationEntryActions(finalValue.entry);
      if (next.button && visible(next.button)) return { ...finalValue, entry: next, reason: "" };
    }
    return finalValue.reason ? finalValue : last;
  }

  function geminiConversationMenuRoots(trigger = null) {
    const roots = [];
    const add = (node) => {
      if (node && geminiConversationMenuRoot(node) && !roots.includes(node)) roots.push(node);
    };
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (controlsId) {
      try { add(document.getElementById(controlsId)); } catch {}
    }
    qsa(GEMINI_CONVERSATION_MENU_ROOT_SELECTOR, document).forEach(add);
    return roots;
  }

  function geminiDeleteMenuItemMatches(node) {
    if (!node || !visible(node) || disabled(node) || geminiMenuItemLooksLikeNotebook(node)) return false;
    const uiText = geminiUiText(node);
    if (/\bdelete\b/i.test(uiText) || uiText.includes("删除")) return true;
    if (uiText) return false;
    if (geminiDataTestIds(node).includes("delete-button")) return true;
    return geminiJslogId(node) === "186000";
  }

  function findGeminiDeleteMenuItem(trigger = null) {
    const candidates = [];
    const seen = new Set();
    const roots = geminiConversationMenuRoots(trigger);
    const add = (node, root, extraScore = 0) => {
      if (!node || seen.has(node) || !geminiDeleteMenuItemMatches(node)) return;
      let target = clickable(node) || node;
      if (target === root || geminiMenuMarkerCount(target) > 1) {
        target = closest(node, "button,[role='menuitem'],[role='button'],[mat-menu-item],[data-test-id],[jslog],[tabindex]") || node;
      }
      if (!target || target === root || seen.has(target) || !visible(target) || disabled(target) || geminiMenuMarkerCount(target) > 1 || geminiMenuItemLooksLikeNotebook(target)) return;
      const box = rect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 520 || box.height > 140) return;
      const ids = geminiDataTestIds(target);
      const uiText = geminiUiText(target);
      seen.add(node);
      seen.add(target);
      candidates.push({
        node: target,
        score: extraScore
          + (ids.includes("delete-button") ? 1000 : 0)
          + (geminiJslogId(target) === "186000" ? 800 : 0)
          + (/^(delete|删除)$/i.test(uiText) ? 650 : 0)
          + (target.matches?.("button,[role='menuitem'],[role='button']") ? 180 : 0),
        top: box.top,
        right: box.right
      });
    };
    for (let index = roots.length - 1; index >= 0; index -= 1) {
      const root = roots[index];
      qsa(GEMINI_CONVERSATION_MENU_ITEM_SELECTOR, root).forEach((node) => add(node, root, 240 + index));
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top);
    return candidates[0]?.node || null;
  }

  function resultWithGeminiTrustedMenuClick(reason, node) {
    const value = result(false, reason);
    const trustedMenuClick = trustedMenuClickForElement(node, reason);
    return trustedMenuClick ? { ...value, needsTrustedMenuClick: true, trustedMenuClick } : value;
  }

  async function clickGeminiDeleteMenuItem(trigger) {
    const menuReady = () => findGeminiDeleteMenuItem(trigger);
    let item = menuReady();
    if (!item && trigger) {
      const attempts = [
        () => geminiSimulateMenuClick(trigger),
        () => clickAt(trigger),
        () => invokeDirectFrameworkActivation(trigger, pointFor(trigger)),
        () => invokeFrameworkActivation(trigger, pointFor(trigger))
      ];
      for (const attempt of attempts) {
        try { attempt(); } catch {}
        item = await waitFor(menuReady, 520, 65);
        if (item) break;
      }
    }
    if (!item) return null;
    await sleep(120);
    item = findGeminiDeleteMenuItem(trigger) || item;
    return (geminiSimulateMenuClick(item) || clickAt(item)) ? item : null;
  }

  async function tryGeminiDeleteFromTrigger(trigger) {
    if (!trigger) return null;
    const clickedItem = await clickGeminiDeleteMenuItem(trigger);
    if (!clickedItem) return null;
    const confirmed = await clickDeleteConfirmIfPresent(6500);
    if (confirmed) return result(true);
    if (deleteDialogRoots().length) return resultWithTrustedDeleteConfirm("delete confirmation did not close");
    const stillOpenItem = findGeminiDeleteMenuItem(trigger) || findGeminiDeleteMenuItem();
    if (stillOpenItem) return resultWithGeminiTrustedMenuClick("delete menu item did not open confirmation", stillOpenItem);
    return result(false, "delete confirmation button not found");
  }

  async function deleteGemini(payload = {}) {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6500);
      return confirmedExisting ? result(true) : resultWithTrustedDeleteConfirm("delete confirmation did not close");
    }
    if (payload?.trustedMenuClickRetried) {
      const openItem = await waitFor(() => findGeminiDeleteMenuItem(), 3000, 90);
      if (openItem) {
        geminiSimulateMenuClick(openItem) || clickAt(openItem);
        const confirmedAfterTrustedMenu = await clickDeleteConfirmIfPresent(6500);
        if (confirmedAfterTrustedMenu) return result(true);
        if (deleteDialogRoots().length) return resultWithTrustedDeleteConfirm("delete confirmation did not close");
        const stillOpenItem = findGeminiDeleteMenuItem();
        if (stillOpenItem) return result(false, "trusted delete menu click did not open confirmation");
      }
    }
    const topTrigger = geminiConversationActionButton();
    if (!payload?.trustedMenuClickRetried && topTrigger) {
      const topResult = await tryGeminiDeleteFromTrigger(topTrigger);
      if (topResult) return topResult;
    }

    const sidebarTarget = await geminiCurrentConversationMenuTarget(3600);
    const sidebarTrigger = sidebarTarget?.entry?.button || null;
    if (sidebarTrigger) {
      const sidebarResult = await tryGeminiDeleteFromTrigger(sidebarTrigger);
      if (sidebarResult) return sidebarResult;
      if (!payload?.trustedMenuClickRetried) {
        return resultWithGeminiTrustedMenuClick("sidebar conversation menu did not open", sidebarTrigger);
      }
      return result(false, "trusted sidebar conversation menu click did not open delete menu");
    }
    if (sidebarTarget?.entry && !payload?.trustedHoverRetried) {
      return resultWithTrustedHover(
        "sidebar conversation menu requires trusted hover",
        sidebarTarget.entry.container || sidebarTarget.entry.link
      );
    }

    if (payload?.trustedMenuClickRetried) {
      return result(false, sidebarTarget?.reason || "trusted conversation menu click did not open delete menu");
    }
    if (topTrigger) {
      return resultWithGeminiTrustedMenuClick(sidebarTarget?.reason || "delete menu item not found", topTrigger);
    }
    return result(false, sidebarTarget?.reason || "conversation menu trigger not found");
  }

  async function deleteTopRight(site, deleteLabels, menuLabels, selectors = []) {
    const trigger = topRightMenuTrigger(menuLabels, selectors);
    if (!trigger) return result(false, "conversation menu trigger not found");
    if (!await openTriggerAndClickDelete(trigger, deleteLabels)) return result(false, "delete menu item not found");
    const confirmed = await clickDeleteConfirmIfPresent(5200);
    if (!confirmed) return { ...result(false, "delete confirmation button not found"), site };
    return { ...result(true), site };
  }

  async function deleteNotion() {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6500);
      return confirmedExisting ? result(true) : resultWithTrustedDeleteConfirm("delete confirmation did not close");
    }
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
    const trigger = topRightMenuTrigger(["Delete, rename, and more", "More", "更多", "删除", "重命名"], selectors);
    if (!trigger) return result(false, "conversation menu trigger not found");
    if (!await openTriggerAndClickDelete(trigger, ["Delete", "Delete topic", "删除", "删除话题"])) return result(false, "delete menu item not found");
    const confirmed = await clickDeleteConfirmIfPresent(6500);
    if (!confirmed && deleteDialogRoots().length) return resultWithTrustedDeleteConfirm("delete confirmation did not close");
    if (!confirmed) return resultWithTrustedDeleteConfirm("delete confirmation button not found");
    return result(true);
  }

  function deepSeekChatId(value) {
    const match = String(value || "").match(/\/(?:a\/)?chat\/s\/([^/?#]+)/i);
    return match ? match[1] : "";
  }
  function deepSeekTitleToken(value) {
    const raw = normalize(value).replace(/\s*[-|–]\s*DeepSeek.*$/i, "").replace(/\s*-\s*深度求索.*$/i, "");
    const token = compact(raw);
    return /^(deepseek|deepseekintotheunknown|intotheunknown|newchat|新聊天)$/.test(token) ? "" : token;
  }
  function deepSeekLinks(root = document) {
    return qsa("a[href*='/chat/s/'],a[href*='/a/chat/s/']", root).filter((link) => visible(link) && rect(link));
  }
  function deepSeekSidebarRoot() {
    const links = deepSeekLinks(document).filter((link) => {
      const box = rect(link);
      return box && box.left <= 480 && box.width >= 80 && box.height >= 18 && box.height <= 110;
    });
    if (links.length) {
      const roots = [];
      const add = (node) => {
        if (!node || roots.includes(node)) return;
        const box = rect(node);
        if (!box || box.left > 560 || box.width < 100 || box.width > 620 || box.height < 40) return;
        if (deepSeekLinks(node).length >= 1) roots.push(node);
      };
      for (const link of links.slice(0, 6)) {
        for (let node = link; node && node !== document.body; node = node.parentElement) add(node);
      }
      roots.sort((a, b) => deepSeekLinks(b).length - deepSeekLinks(a).length || (rect(b)?.height || 0) - (rect(a)?.height || 0));
      if (roots[0]) return roots[0];
    }
    return null;
  }
  async function ensureDeepSeekSidebarOpen() {
    if (deepSeekSidebarRoot()) return true;
    const toggles = qsa("button,[role='button']", document)
      .filter((node) => {
        const box = rect(node);
        if (!box || box.top > 96 || box.left > 140 || box.width > 80 || box.height > 80) return false;
        const bits = elementText(node) + " " + svgText(node);
        return /sidebar|menu|panel|sider|侧边栏|菜单|M9\.67269/i.test(bits) || !compact(bits);
      })
      .sort((a, b) => (rect(a)?.left || 0) - (rect(b)?.left || 0));
    for (const toggle of toggles.slice(0, 4)) {
      clickAt(toggle);
      if (await waitFor(deepSeekSidebarRoot, 1800, 120)) return true;
    }
    for (const point of [{ clientX: 22, clientY: 28 }, { clientX: 22, clientY: 48 }, { clientX: 46, clientY: 28 }, { clientX: 46, clientY: 48 }]) {
      const target = document.elementFromPoint(point.clientX, point.clientY);
      if (target && clickAt(target, point) && await waitFor(deepSeekSidebarRoot, 1600, 120)) return true;
    }
    return Boolean(deepSeekSidebarRoot());
  }
  function deepSeekHints(payload = {}) {
    const hrefs = [location.href, payload.currentThreadHref, payload.currentHref, payload.cachedHref, payload.href, payload.url].filter(Boolean);
    return {
      ids: hrefs.map(deepSeekChatId).filter(Boolean),
      titleTokens: [document.title, payload.currentTitle, payload.title].map(deepSeekTitleToken).filter(Boolean)
    };
  }
  function deepSeekCurrentRow(root) {
    if (!root) return null;
    const links = deepSeekLinks(root);
    const currentId = deepSeekChatId(location.href);
    if (!currentId) return null;
    return links.find((link) => deepSeekChatId(link.href || link.getAttribute?.("href")) === currentId) || null;
  }
  function deepSeekVisualRow(row) {
    const rowBox = rect(row);
    if (!row || !rowBox) return row;
    const rowText = compact(elementText(row));
    let best = { node: row, score: 0 };
    for (let node = row, depth = 0; node && node !== document.body && depth < 8; node = node.parentElement, depth += 1) {
      const box = rect(node);
      if (!box || box.left > 560 || box.width < 110 || box.width > 620 || box.height < 28 || box.height > 110) continue;
      if (box.top > rowBox.top + 10 || box.bottom < rowBox.bottom - 10) continue;
      const token = compact(elementText(node));
      if (rowText && token && !token.includes(rowText) && !rowText.includes(token)) continue;
      const className = String(node.className || "");
      const active = /\b(active|selected|current)\b/i.test(className) || String(node.getAttribute?.("aria-current") || "").toLowerCase() === "page";
      const buttons = qsa("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", node).length;
      const score = box.width + (active ? 420 : 0) + Math.min(buttons, 3) * 90 - depth * 12;
      if (score > best.score) best = { node, score };
    }
    return best.node || row;
  }
  function deepSeekRowMenuRightEdge(row, visualRow = row) {
    const rowBox = rect(visualRow) || rect(row);
    if (!rowBox) return 0;
    const roots = [];
    const sidebar = deepSeekSidebarRoot();
    if (sidebar) roots.push(sidebar);
    for (let node = visualRow || row; node && node !== document.body && roots.length < 8; node = node.parentElement) roots.push(node);
    const rights = roots
      .map((node) => rect(node))
      .filter((box) => box
        && box.left <= 560
        && box.width >= 140
        && box.width <= 620
        && box.top <= rowBox.top + 8
        && box.bottom >= rowBox.bottom - 8)
      .map((box) => box.right);
    return Math.max(rowBox.right, ...rights);
  }
  function deepSeekTopicMenuRect(row) {
    const visualRow = deepSeekVisualRow(row);
    const rowBox = rect(visualRow) || rect(row);
    if (!rowBox) return null;
    const right = Math.max(rowBox.right, deepSeekRowMenuRightEdge(row, visualRow));
    return {
      left: rowBox.left,
      top: rowBox.top,
      right,
      bottom: rowBox.bottom,
      width: right - rowBox.left,
      height: rowBox.height
    };
  }
  function deepSeekTrustedMenuClick(row, trigger = null, reason = "topic menu trigger requires trusted browser input") {
    const rowBox = deepSeekTopicMenuRect(row);
    const triggerClick = trustedMenuClickForElement(trigger, reason);
    if (!rowBox) return triggerClick;
    const y = rowBox.top + rowBox.height / 2;
    const points = [18, 28, 38, 48, 60, 76, 96, 118, 142]
      .map((offset) => ({
        x: Math.max(rowBox.left + 16, rowBox.right - offset),
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
        const key = String(point.x) + "," + String(point.y);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const primary = framePoints[0];
    const trustedMenuClick = primary
      ? trustedMenuClickPoint(reason, primary, serializableRect(rowBox))
      : triggerClick;
    return trustedMenuClick ? { ...trustedMenuClick, framePoints, hoverSettleMs: 360 } : null;
  }
  function resultWithDeepSeekTrustedMenuClick(reason, row, trigger = null) {
    const value = result(false, reason);
    const trustedMenuClick = deepSeekTrustedMenuClick(row, trigger, reason);
    return trustedMenuClick ? { ...value, needsTrustedMenuClick: true, trustedMenuClick } : value;
  }
  function deepSeekTrustedKeySequence(row, reason = "topic menu trigger requires keyboard focus") {
    const rowBox = deepSeekTopicMenuRect(row);
    const visualBox = rect(deepSeekVisualRow(row)) || rect(row) || rowBox;
    if (!rowBox || !visualBox) return null;
    const focusX = Math.min(
      rowBox.right - 104,
      Math.max(rowBox.left + 24, visualBox.left + Math.min(180, visualBox.width * 0.42))
    );
    return {
      kind: "topic-menu-keyboard",
      site: SITE_ID,
      reason: String(reason || ""),
      framePoint: {
        x: Math.round(focusX * 100) / 100,
        y: Math.round((rowBox.top + rowBox.height / 2) * 100) / 100
      },
      frameRect: serializableRect(rowBox),
      keys: [
        { key: "Tab", settleMs: 140 },
        { key: "Enter", settleMs: 260 }
      ],
      clickSettleMs: 160,
      keySettleMs: 140,
      settleMs: 460
    };
  }
  function resultWithDeepSeekTrustedKeySequence(reason, row) {
    const value = result(false, reason);
    const trustedKeySequence = deepSeekTrustedKeySequence(row, reason);
    const trustedMenuClick = deepSeekTrustedMenuClick(row, null, reason);
    return {
      ...value,
      ...(trustedKeySequence ? { needsTrustedKeySequence: true, trustedKeySequence } : {}),
      ...(trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {})
    };
  }
  function resultWithDeepSeekTrustedHover(reason, row) {
    const value = result(false, reason);
    const rowBox = deepSeekTopicMenuRect(row);
    const trustedHover = rowBox
      ? {
        kind: "topic-menu-hover",
        site: SITE_ID,
        reason: String(reason || ""),
        framePoint: {
          x: Math.round(Math.max(rowBox.left + 16, rowBox.right - 28) * 100) / 100,
          y: Math.round((rowBox.top + rowBox.height / 2) * 100) / 100
        },
        frameRect: serializableRect(rowBox),
        hoverSettleMs: 520
      }
      : trustedHoverRightEdge(deepSeekVisualRow(row) || row, reason);
    return trustedHover ? { ...value, needsTrustedHover: true, trustedHover } : value;
  }
  function closeDeepSeekTransientMenus() {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
    } catch {}
  }
  function deepSeekHeaderMenuButton(hints = deepSeekHints()) {
    const titleTokens = (hints.titleTokens || []).filter(Boolean);
    if (!titleTokens.length) return null;
    const titleNodes = [];
    const seenTitles = new Set();
    for (const node of qsa("h1,h2,h3,button,[role='button'],div,span", document)) {
      if (!node || seenTitles.has(node) || !visible(node)) continue;
      const box = rect(node);
      if (!box || box.top < 0 || box.top > 190 || box.left < 120 || box.width < 20 || box.height < 14 || box.height > 92) continue;
      if (String(node.href || node.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) continue;
      if (node.closest?.("a[href*='/chat/s/'],a[href*='/a/chat/s/']") || qsa("a[href*='/chat/s/'],a[href*='/a/chat/s/']", node).length) continue;
      const token = compact(elementText(node));
      if (!token || !titleTokens.some((item) => token.includes(item) || item.includes(token))) continue;
      seenTitles.add(node);
      titleNodes.push({ node, box });
    }
    const candidates = [];
    const seenButtons = new Set();
    const addButton = (button, titleBox, extraScore = 0) => {
      const target = clickable(button);
      if (!target || seenButtons.has(target) || disabled(target)) return;
      const box = rect(target);
      if (!box || box.width < 10 || box.height < 10 || box.width > 76 || box.height > 76) return;
      if (box.top > titleBox.bottom + 34 || box.bottom < titleBox.top - 34) return;
      if (box.left < titleBox.left - 72 || box.left > titleBox.right + 260) return;
      if (String(target.href || target.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) return;
      const value = elementText(target);
      const token = compact(value);
      if (/newchat|sidebar|back|close|search|send|deepthink|model|expert|share|copy|新聊天|侧边栏|返回|关闭|搜索|发送|分享|复制/.test(token)) return;
      const signature = compact(svgText(target));
      const iconish = !token || /more|menu|options|ellipsis|dots|circle|kebab|更多|菜单|选项/.test(token + signature) || qsa("circle", target).length >= 2 || box.width <= 44;
      if (!iconish) return;
      seenButtons.add(target);
      candidates.push({
        node: target,
        score: extraScore
          + (box.left >= titleBox.right - 8 ? 520 : 0)
          + (!token ? 180 : 0)
          + (/more|menu|options|ellipsis|dots|更多|菜单|选项/.test(token + signature) ? 360 : 0)
          + (/circle|dots|ellipsis|kebab/.test(signature) ? 180 : 0)
          + Math.max(0, 160 - Math.abs(box.left - titleBox.right)),
        right: box.right,
        left: box.left
      });
    };
    for (const { node, box: titleBox } of titleNodes.slice(0, 8)) {
      for (let scope = node, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
        const scopeBox = rect(scope);
        if (!scopeBox || scopeBox.top > 210 || scopeBox.height > 180 || scopeBox.width > 900) continue;
        qsa("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", scope).forEach((button) => addButton(button, titleBox, 120 - depth * 12));
      }
      qsa("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", document)
        .forEach((button) => addButton(button, titleBox, 0));
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.left - a.left);
    return candidates[0]?.node || null;
  }
  function hoverRow(row) {
    const box = rect(row);
    if (!box) return;
    const point = { clientX: Math.max(box.left + 16, box.right - 28), clientY: box.top + box.height / 2 };
    for (let node = row, depth = 0; node && node !== document.body && depth < 5; node = node.parentElement, depth += 1) {
      for (const type of ["pointerover", "mouseover", "mouseenter", "mousemove", "pointermove"]) {
        try {
          const Ctor = type.startsWith("pointer") ? PointerEvent : MouseEvent;
          node.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, view: window, pointerId: 1, pointerType: "mouse", isPrimary: true, ...point }));
        } catch {}
      }
    }
  }
  function deepSeekMoreButton(row) {
    reveal(row);
    const visualRow = deepSeekVisualRow(row);
    hoverRow(visualRow || row);
    const rowBox = deepSeekTopicMenuRect(row);
    if (!rowBox) return null;
    const candidates = [];
    const seen = new Set();
    const add = (node, score = 0) => {
      const target = clickable(node);
      if (!target || seen.has(target) || target === row || disabled(target)) return;
      const box = rect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 84 || box.height > 84) return;
      if (box.top > rowBox.bottom + 12 || box.bottom < rowBox.top - 12 || box.left < rowBox.right - 120 || box.left > rowBox.right + 80) return;
      const bits = elementText(target) + " " + svgText(target);
      const token = compact(bits);
      if (token && !/more|options|menu|ellipsis|dots|circle|更多|菜单|选项/.test(token)) return;
      if (String(target.href || target.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) return;
      seen.add(target);
      candidates.push({ node: target, score: score + (!token ? 180 : 0) + (/more|options|menu|更多|菜单|选项/.test(token) ? 220 : 0) + Math.max(0, 90 - Math.abs((box.left + box.right) / 2 - (rowBox.right - 28))), right: box.right });
    };
    const iconSelector = "button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i],svg,[class*='more' i],[class*='menu' i],[class*='option' i],[class*='action' i],[class*='ellipsis' i]";
    const scopes = [];
    for (const seed of [visualRow, row]) {
      for (let scope = seed, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
        if (!scopes.includes(scope)) scopes.push(scope);
      }
    }
    for (let index = 0; index < scopes.length; index += 1) {
      qsa(iconSelector, scopes[index]).forEach((node) => add(node, 120 - index * 8));
    }
    for (const offset of [18, 28, 38, 48, 60, 76, 96, 118, 142]) {
      const point = { clientX: Math.max(rowBox.left + 16, rowBox.right - offset), clientY: rowBox.top + rowBox.height / 2 };
      const node = document.elementFromPoint(point.clientX, point.clientY);
      add(node, 180 - offset);
    }
    qsa(iconSelector, document).forEach((node) => add(node, 0));
    candidates.sort((a, b) => b.score - a.score || b.right - a.right);
    return candidates[0]?.node || null;
  }
  let deepSeekPendingTrustedAttempt = null;
  function deepSeekTrustedRetryRequested(payload = {}) {
    return Boolean(payload?.trustedMenuClickRetried || payload?.trustedKeySequenceRetried);
  }
  function deepSeekAttemptIdentity(payload = {}) {
    return { attemptId: normalize(payload?.deleteAttemptId), routeId: deepSeekChatId(location.href) };
  }
  function deepSeekTrustedRetryOwned(payload = {}) {
    const identity = deepSeekAttemptIdentity(payload);
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
  function armDeepSeekTrustedRetry(payload = {}, value = {}) {
    const identity = deepSeekAttemptIdentity(payload);
    if (!identity.attemptId || !identity.routeId) {
      deepSeekPendingTrustedAttempt = null;
      return result(false, (value.reason || "trusted retry required") + "; trusted retry ownership unavailable");
    }
    deepSeekPendingTrustedAttempt = { ...identity, phase: "awaiting-menu-trigger", baseline: "no-delete-ui", expiresAt: Date.now() + 20000 };
    return value;
  }
  async function deleteDeepSeek(payload = {}) {
    const currentRouteId = deepSeekChatId(location.href);
    if (!currentRouteId) return result(false, "stable current conversation route is required");
    const retryRequested = deepSeekTrustedRetryRequested(payload);
    const retryOwned = retryRequested && deepSeekTrustedRetryOwned(payload);
    if (retryRequested && !retryOwned) return result(false, "trusted delete retry does not match the pending attempt and route");
    deepSeekPendingTrustedAttempt = null;
    await ensureDeepSeekSidebarOpen();
    const routeStillCurrent = () => deepSeekChatId(location.href) === currentRouteId;
    if (!routeStillCurrent()) return result(false, "current conversation changed while preparing deletion");
    const hints = deepSeekHints(payload);
    const labels = ["Delete", "删除"];
    if (findDeleteConfirmButton()) return result(false, "unverified delete confirmation is already open");
    if (retryOwned) {
      const deleteItem = await waitFor(() => findOpenDeleteMenuItem(labels), 3200, 90);
      if (deleteItem) {
        if (!routeStillCurrent()) return result(false, "current conversation changed during trusted menu retry");
        if (!clickAt(deleteItem)) return result(false, "explicit Delete action could not be safely activated");
        const confirmedAfterTrustedMenu = await clickDeleteConfirmIfPresent(6500, routeStillCurrent);
        if (!confirmedAfterTrustedMenu) return result(false, "delete confirmation button not found");
        return result(true);
      }
      if (payload?.trustedMenuClickRetried) {
        if (!routeStillCurrent()) return result(false, "current conversation changed during trusted menu retry");
        if (findOpenDeleteMenuItem(labels) || findDeleteConfirmButton()) {
          return result(false, "delete menu state is not clean; trusted retry was not renewed");
        }
        return armDeepSeekTrustedRetry(payload, result(false, "trusted topic menu click did not open"));
      }
    }
    const root = deepSeekSidebarRoot();
    const row = deepSeekCurrentRow(root);
    let rowFailureReason = "current topic row not found";
    let moreButton = null;
    if (row) {
      moreButton = await waitFor(() => deepSeekMoreButton(row), 1800, 100);
      if (moreButton) {
        if (await openTriggerAndClickDelete(moreButton, labels, { timeoutMs: 2800, allowHiddenTrigger: true, requireFreshMenu: true, guard: routeStillCurrent })) {
          const confirmed = await clickDeleteConfirmIfPresent(6500, routeStillCurrent);
          if (!confirmed) return result(false, "delete confirmation button not found");
          return result(true);
        }
        rowFailureReason = "delete menu item not found";
      } else {
        rowFailureReason = "topic menu trigger not found";
      }
      closeDeepSeekTransientMenus();
    }
    if (!routeStillCurrent()) return result(false, "current conversation changed before delete activation");
    const headerButton = deepSeekHeaderMenuButton(hints);
    if (headerButton && await openTriggerAndClickDelete(headerButton, labels, { timeoutMs: 2600, allowHiddenTrigger: true, requireFreshMenu: true, guard: routeStillCurrent })) {
      const confirmedFromHeader = await clickDeleteConfirmIfPresent(6500, routeStillCurrent);
      if (!confirmedFromHeader) return result(false, "delete confirmation button not found");
      return result(true);
    }
    if (headerButton) closeDeepSeekTransientMenus();
    if (!row) return result(false, rowFailureReason);
    const cleanBaseline = await waitFor(() => !findOpenDeleteMenuItem(labels) && !findDeleteConfirmButton(), 700, 70);
    if (!cleanBaseline) return result(false, "delete menu state remained open; trusted retry was not leased");
    return armDeepSeekTrustedRetry(
      payload,
      payload?.trustedKeySequenceRetried
        ? resultWithDeepSeekTrustedMenuClick(rowFailureReason, row, moreButton)
        : resultWithDeepSeekTrustedKeySequence(rowFailureReason, row)
    );
  }

  const runners = {
    gemini: deleteGemini,
    chatgpt: deleteChatGpt,
    kagi: deleteKagi,
    grok: () => deleteTopRight("grok", ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"], ["More", "More actions", "Menu", "Options", "更多", "菜单"]),
    grokMirror: () => deleteTopRight("grokMirror", ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"], ["More", "More actions", "Menu", "Options", "更多", "菜单"]),
    notion: deleteNotion,
    deepseek: deleteDeepSeek
  };

  async function run(payload = {}) {
    const runner = runners[SITE_ID];
    if (!runner) return result(false, "unsupported site");
    try {
      const value = await runner(payload || {});
      return value && typeof value === "object" ? value : result(Boolean(value));
    } catch (error) {
      return result(false, error && error.message ? error.message : String(error));
    }
  }

  async function menuCommand(payload = {}) {
    return run(payload || {});
  }

  function matchesRequestSite(value) {
    const incoming = compact(value);
    return !incoming || SITE_KEYS.some((item) => compact(item) === incoming);
  }

  function matchesRequestScript(detail = {}) {
    const requested = compact(detail.scriptId || detail.script || "");
    return !requested || requested === compact(SITE_ID);
  }

  function matchesRequestedVersion(detail = {}) {
    const requested = String(detail.version || detail.expectedVersion || "").trim();
    return !requested || requested === VERSION;
  }

  function matchesRequestMessageType(type) {
    return type === "request" || type === "request:" + VERSION;
  }

  function matchesMenuCommandMessageType(type) {
    return type === "menu-command" || type === "menu-command:" + VERSION;
  }

  function dispatchResult(id, value) {
    const detail = { id, ...(value && typeof value === "object" ? value : result(Boolean(value))) };
    window.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail }));
    window.postMessage({ source: BRIDGE_SOURCE, type: "result", detail }, "*");
  }

  function dispatchReady(id) {
    const detail = {
      id,
      site: SITE_ID,
      siteId: SITE_ID,
      scriptId: SITE_ID,
      name: SITE_NAME,
      version: VERSION,
      menuCommand: true,
      menuCommandEvent: MENU_COMMAND_EVENT,
      versionedMenuCommandEvent: VERSIONED_MENU_COMMAND_EVENT
    };
    window.dispatchEvent(new CustomEvent(READY_EVENT, { detail }));
    window.postMessage({ source: BRIDGE_SOURCE, type: "ready", detail }, "*");
  }

  function handlePingDetail(detail = {}) {
    if (!active) return;
    if (!matchesRequestSite(detail.site || detail.siteId || detail.name)) return;
    if (!matchesRequestScript(detail)) return;
    if (!matchesRequestedVersion(detail)) return;
    dispatchReady(detail.id || SITE_ID + "-" + Date.now());
  }

  function onPing(event) {
    handlePingDetail(event && event.detail || {});
  }

  async function handleRequestDetail(detail = {}) {
    if (!active) return;
    if (!matchesRequestSite(detail.site || detail.siteId || detail.name)) return;
    if (!matchesRequestScript(detail)) return;
    if (!matchesRequestedVersion(detail)) return;
    const id = detail.id || SITE_ID + "-" + Date.now();
    if (handledRequestIds.has(id)) return;
    handledRequestIds.add(id);
    setTimeout(() => handledRequestIds.delete(id), 60000);
    dispatchResult(id, await run(detail.payload || detail.data || {}));
  }

  async function handleMenuCommandDetail(detail = {}) {
    if (!active) return;
    if (!matchesRequestSite(detail.site || detail.siteId || detail.name)) return;
    if (!matchesRequestScript(detail)) return;
    if (!matchesRequestedVersion(detail)) return;
    const id = detail.id || SITE_ID + "-" + Date.now();
    if (handledRequestIds.has(id)) return;
    handledRequestIds.add(id);
    setTimeout(() => handledRequestIds.delete(id), 60000);
    dispatchResult(id, await menuCommand(detail.payload || detail.data || {}));
  }

  function onRequest(event) {
    handleRequestDetail(event && event.detail || {});
  }

  function onMenuCommand(event) {
    handleMenuCommandDetail(event && event.detail || {});
  }

  function onMessage(event) {
    const message = event.data || {};
    if (message.source !== BRIDGE_SOURCE) return;
    if (message.type === "ping") handlePingDetail(message.detail || {});
    else if (matchesMenuCommandMessageType(message.type)) handleMenuCommandDetail(message.detail || {});
    else if (matchesRequestMessageType(message.type)) handleRequestDetail(message.detail || {});
  }

  function dispose() {
    active = false;
    window.removeEventListener(PING_EVENT, onPing);
    window.removeEventListener(REQUEST_EVENT, onRequest);
    window.removeEventListener(VERSIONED_REQUEST_EVENT, onRequest);
    window.removeEventListener(MENU_COMMAND_EVENT, onMenuCommand);
    window.removeEventListener(VERSIONED_MENU_COMMAND_EVENT, onMenuCommand);
    window.removeEventListener("message", onMessage);
  }

  const registry = rootWindow[GLOBAL_NAME] || {};
  try { registry[SITE_ID] && typeof registry[SITE_ID].dispose === "function" && registry[SITE_ID].dispose(); } catch {}
  registry[SITE_ID] = { run, menuCommand, dispose, id: SITE_ID, site: SITE_ID, siteId: SITE_ID, scriptId: SITE_ID, name: SITE_NAME, version: VERSION, menuCommandSupported: true, pingEvent: PING_EVENT, readyEvent: READY_EVENT, requestEvent: REQUEST_EVENT, versionedRequestEvent: VERSIONED_REQUEST_EVENT, menuCommandEvent: MENU_COMMAND_EVENT, versionedMenuCommandEvent: VERSIONED_MENU_COMMAND_EVENT, resultEvent: RESULT_EVENT };
  rootWindow[GLOBAL_NAME] = registry;
  window.addEventListener(PING_EVENT, onPing);
  window.addEventListener(REQUEST_EVENT, onRequest);
  window.addEventListener(VERSIONED_REQUEST_EVENT, onRequest);
  window.addEventListener(MENU_COMMAND_EVENT, onMenuCommand);
  window.addEventListener(VERSIONED_MENU_COMMAND_EVENT, onMenuCommand);
  window.addEventListener("message", onMessage);

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("ChatClub Delete: " + SITE_NAME, async () => {
      const value = await menuCommand({});
      console.log("[ChatClub Delete] " + SITE_NAME, value);
    });
  }
})();
