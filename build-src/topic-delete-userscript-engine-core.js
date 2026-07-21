export const DELETE_USERSCRIPT_ENGINE_CORE = String.raw`
(function () {
  "use strict";

  const SITE_ID = __CHATCLUB_DELETE_SITE_ID__;
  const SITE_NAME = __CHATCLUB_DELETE_SITE_NAME__;
  const SITE_KEYS = __CHATCLUB_DELETE_SITE_KEYS__;
  const VERSION = __CHATCLUB_DELETE_SITE_VERSION__;
  const REQUEST_EVENT = __CHATCLUB_DELETE_REQUEST_EVENT__;
  const VERSIONED_REQUEST_EVENT = REQUEST_EVENT + ":" + VERSION;
  const MENU_COMMAND_EVENT = __CHATCLUB_DELETE_MENU_COMMAND_EVENT__;
  const VERSIONED_MENU_COMMAND_EVENT = MENU_COMMAND_EVENT + ":" + VERSION;
  const RESULT_EVENT = __CHATCLUB_DELETE_RESULT_EVENT__;
  const PING_EVENT = __CHATCLUB_DELETE_PING_EVENT__;
  const READY_EVENT = __CHATCLUB_DELETE_READY_EVENT__;
  const BRIDGE_SOURCE = __CHATCLUB_DELETE_BRIDGE_SOURCE__;
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
  const matchesExactLabelRepeats = (value, labels) => {
    const token = compact(value);
    if (!token) return false;
    return labels.some((label) => {
      const wanted = compact(label);
      if (!wanted || token.length % wanted.length !== 0) return false;
      for (let offset = 0; offset < token.length; offset += wanted.length) {
        if (token.slice(offset, offset + wanted.length) !== wanted) return false;
      }
      return true;
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
    return /are you sure you want to delete(?: this)? chat|are you sure.*delete|this chat can(?:'|’)?t be recovered|this chat cant be recovered|delete this chat|delete (?:the )?(?:chat|conversation)\s*[?？]|share links from it will be disabled|cannot be undone|can(?:'|’)?t be undone|permanently delete|permanent deletion|删除(?:此|该|这个|本)?(?:聊天|对话|会话|话题)\s*[?？]|确定.*删除|确认.*删除|删除.*不可恢复|无法恢复|不能恢复/i.test(text)
      || /confirmdelete|deleteconfirm|删除确认|确认删除/.test(token);
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
    if (matchesExactLabelRepeats(value, CONFIRM_STRICT_LABELS)) return true;
    if (matchesExactLabelRepeats(value, CONFIRM_GENERIC_LABELS)) return true;
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
    const questions = qsa("div,section,[role='dialog'],[role='alertdialog'],dialog,[aria-modal='true'],mat-dialog-container,[class*='modal' i],[class*='dialog' i]", document)
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
    return qsa("div,section,[role='dialog'],[role='alertdialog'],dialog,[aria-modal='true'],mat-dialog-container,[class*='modal' i],[class*='dialog' i],h1,h2,h3,p,span", document)
      .some((node) => visible(node) && confirmQuestionMatches(elementText(node)));
  }

  function deleteDialogRoots() {
    const roots = qsa("[role='alertdialog'],[role='dialog'],dialog,[aria-modal='true'],mat-dialog-container,[data-radix-dialog-content],[data-state='open'],[class*='modal' i],[class*='dialog' i]", document)
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
          + (matchesExactLabelRepeats(value, CONFIRM_STRICT_LABELS) ? 700 : 0)
          + (matchesExactLabelRepeats(value, CONFIRM_GENERIC_LABELS) ? 420 : 0)
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
          if (!matchesExactLabelRepeats(value, CONFIRM_GENERIC_LABELS) && !matchesExactLabelRepeats(value, CONFIRM_STRICT_LABELS)) continue;
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
        if (!matchesExactLabelRepeats(value, CONFIRM_GENERIC_LABELS) && !matchesExactLabelRepeats(value, CONFIRM_STRICT_LABELS)) continue;
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

`;
