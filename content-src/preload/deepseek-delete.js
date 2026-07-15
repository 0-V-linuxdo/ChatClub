export function installDeepSeekDeleteBridge(runtimes, deleteSource) {
  const bridgeVersion = deleteSource.split(":").at(-1);
  const runtimeName = "deepseek-delete-bridge";
  const existing = runtimes.registration(runtimeName);
  if (existing?.version === bridgeVersion) {
    window.__CHATCLUB_DEEPSEEK_DELETE_BRIDGE__ = existing.api;
    return;
  }
  runtimes.invalidate(runtimeName, `replaced by ${bridgeVersion}`);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const compact = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  const all = (selector, root = document) => {
    try { return Array.from(root.querySelectorAll(selector)); } catch { return []; }
  };
  const rectOf = (el) => {
    try {
      if (!el?.getBoundingClientRect) return null;
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width < 2 || rect.height < 2) return null;
      return rect;
    } catch {
      return null;
    }
  };
  const visible = (el) => {
    const rect = rectOf(el);
    if (!rect) return false;
    try {
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    } catch {
      return true;
    }
  };
  const textOf = (el) => normalize([
    el?.getAttribute?.("aria-label"),
    el?.getAttribute?.("title"),
    el?.innerText || el?.textContent || ""
  ].filter(Boolean).join(" "));
  const svgTextOf = (el) => normalize(all("svg,use,path,circle", el).map((item) => [
    item.tagName,
    item.getAttribute("aria-label"),
    item.getAttribute("data-testid"),
    item.getAttribute("class"),
    item.getAttribute("href"),
    item.getAttribute("xlink:href"),
    item.getAttribute("d")
  ].filter(Boolean).join(" ")).join(" "));
  const centerOf = (el) => {
    const rect = rectOf(el);
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 1, y: 1 };
  };
  const currentChatId = () => {
    const match = String(location.href || "").match(/\/(?:a\/)?chat\/s\/([^/?#]+)/i);
    return match?.[1] || "";
  };
  const chatIdFromLink = (link) => {
    const href = String(link?.href || link?.getAttribute?.("href") || "");
    const match = href.match(/\/(?:a\/)?chat\/s\/([^/?#]+)/i);
    return match?.[1] || "";
  };
  const closestClickable = (el) => {
    try {
      return el?.closest?.("button,[role='button'],[role='menuitem'],[role='option'],a[href],[aria-haspopup],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i]") || el || null;
    } catch {
      return el || null;
    }
  };
  const disabled = (el) => {
    if (!el) return true;
    try {
      return el.disabled === true
        || el.getAttribute?.("disabled") != null
        || String(el.getAttribute?.("aria-disabled") || "").toLowerCase() === "true";
    } catch {
      return false;
    }
  };
  const dispatchPointer = (el) => {
    const point = centerOf(el);
    const PointerEventCtor = typeof PointerEvent === "function" ? PointerEvent : null;
    const MouseEventCtor = typeof MouseEvent === "function" ? MouseEvent : null;
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x,
      screenY: point.y,
      button: 0
    };
    let dispatched = false;
    const plans = [
      ["pointerover", PointerEventCtor, { buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }],
      ["mouseover", MouseEventCtor, { buttons: 0, detail: 0 }],
      ["pointermove", PointerEventCtor, { buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }],
      ["mousemove", MouseEventCtor, { buttons: 0, detail: 0 }],
      ["pointerdown", PointerEventCtor, { buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true }],
      ["mousedown", MouseEventCtor, { buttons: 1, detail: 1 }],
      ["pointerup", PointerEventCtor, { buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }],
      ["mouseup", MouseEventCtor, { buttons: 0, detail: 1 }],
      ["click", MouseEventCtor, { buttons: 0, detail: 1 }]
    ];
    for (const [type, Ctor, extra] of plans) {
      try {
        if (typeof Ctor !== "function") continue;
        el.dispatchEvent(new Ctor(type, { ...base, ...extra }));
        dispatched = true;
      } catch {}
    }
    try {
      el.click?.();
      dispatched = true;
    } catch {}
    return dispatched;
  };
  const eventPathFor = (target, currentTarget) => {
    const path = [];
    const add = (node) => {
      if (node && !path.includes(node)) path.push(node);
    };
    add(target);
    for (let node = target; node; node = node.parentNode || node.host || null) add(node);
    add(currentTarget);
    add(document);
    add(window);
    return path;
  };
  const fakeReactEvent = (target, currentTarget, type = "click") => {
    const point = centerOf(target);
    const event = {
      type,
      target,
      srcElement: target,
      currentTarget,
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: type === "mousedown" || type === "pointerdown" ? 1 : 0,
      detail: 1,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x,
      screenY: point.y,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
      stopImmediatePropagation() {},
      isDefaultPrevented() { return this.defaultPrevented; },
      isPropagationStopped() { return false; },
      persist() {},
      composedPath() { return eventPathFor(target, currentTarget); }
    };
    event.nativeEvent = event;
    return event;
  };
  const reactPropBags = (node) => {
    const bags = [];
    const seen = new Set();
    const addBag = (bag) => {
      if (!bag || seen.has(bag)) return;
      seen.add(bag);
      bags.push(bag);
    };
    for (const current of [node, closestClickable(node), node?.parentElement].filter(Boolean)) {
      try { addBag(current); } catch {}
      let names = [];
      try { names = Object.getOwnPropertyNames(current); } catch {}
      for (const name of names) {
        if (!/react|props|fiber/i.test(name)) continue;
        let value = null;
        try { value = current[name]; } catch {}
        addBag(value);
        addBag(value?.memoizedProps);
        addBag(value?.pendingProps);
        for (let fiber = value?.return, depth = 0; fiber && depth < 6; fiber = fiber.return, depth += 1) {
          addBag(fiber.memoizedProps);
          addBag(fiber.pendingProps);
        }
      }
    }
    return bags;
  };
  const invokeReact = (node, handlerNames = ["onClick", "onPointerUp", "onMouseUp", "onPointerDown", "onMouseDown"]) => {
    if (!node || disabled(node)) return false;
    const target = closestClickable(node) || node;
    try { target.focus?.({ preventScroll: true }); } catch {
      try { target.focus?.(); } catch {}
    }
    for (const bag of reactPropBags(target)) {
      for (const handlerName of handlerNames) {
        const handler = bag?.[handlerName];
        if (typeof handler !== "function") continue;
        try {
          const eventType = handlerName.replace(/^on/, "").toLowerCase() || "click";
          handler.call(target, fakeReactEvent(target, target, eventType));
          return true;
        } catch {}
      }
    }
    return false;
  };
  const nativeClick = (node) => {
    if (!node || typeof node.click !== "function") return false;
    try {
      node.click();
      return true;
    } catch {
      return false;
    }
  };
  const activate = (node, handlerNames) => {
    const target = closestClickable(node);
    if (!target || disabled(target)) return false;
    try { target.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    return dispatchPointer(target) || nativeClick(target) || invokeReact(target, handlerNames);
  };
  const activateUntil = async (node, getter, handlerNames, { settleMs = 180 } = {}) => {
    const target = closestClickable(node);
    if (!target || disabled(target)) return null;
    try { target.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    try { target.focus?.({ preventScroll: true }); } catch {
      try { target.focus?.(); } catch {}
    }
    const read = () => {
      try { return typeof getter === "function" ? getter() : null; } catch { return null; }
    };
    const initial = read();
    if (initial) return initial;
    const attempts = [
      () => dispatchPointer(target),
      () => nativeClick(target),
      () => invokeReact(target, handlerNames)
    ];
    for (const attempt of attempts) {
      try { attempt(); } catch {}
      await wait(Math.max(40, Number(settleMs) || 40));
      const value = read();
      if (value) return value;
    }
    return read();
  };
  const waitFor = async (getter, timeoutMs = 3000, intervalMs = 90) => {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const value = getter();
      if (value) return value;
      await wait(Math.max(30, Number(intervalMs) || 30));
    }
    return getter();
  };
  const currentTopicLink = () => {
    const links = all("a[href*='/chat/s/'],a[href*='/a/chat/s/']").filter(visible);
    const id = currentChatId();
    if (id) {
      const exact = links.find((link) => chatIdFromLink(link) === id);
      if (exact) return exact;
    }
    const selected = links.find((link) => {
      const className = String(link.className || "");
      const ariaCurrent = String(link.getAttribute?.("aria-current") || "").toLowerCase();
      return /\b(active|selected|current)\b/i.test(className) || ariaCurrent === "page";
    });
    return selected || links[0] || null;
  };
  const titleTokenFromValue = (value) => {
    const token = compact(normalize(value).replace(/\s*[-|–]\s*DeepSeek.*$/i, "").replace(/\s*-\s*深度求索.*$/i, ""));
    return /^(deepseek|deepseekintotheunknown|intotheunknown|newchat|新聊天)$/.test(token) ? "" : token;
  };
  const currentTitleTokens = () => Array.from(new Set([
    document.title,
    textOf(currentTopicLink())
  ].map(titleTokenFromValue).filter(Boolean)));
  const closeTransientMenus = () => {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
    } catch {}
  };
  const findHeaderMoreButton = () => {
    const titleTokens = currentTitleTokens();
    if (!titleTokens.length) return null;
    const titleNodes = [];
    const seenTitles = new Set();
    for (const node of all("h1,h2,h3,button,[role='button'],div,span")) {
      if (!node || seenTitles.has(node) || !visible(node)) continue;
      const rect = rectOf(node);
      if (!rect || rect.top < 0 || rect.top > 190 || rect.left < 120 || rect.width < 20 || rect.height < 14 || rect.height > 92) continue;
      if (String(node.href || node.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) continue;
      const token = compact(textOf(node));
      if (!token || !titleTokens.some((item) => token.includes(item) || item.includes(token))) continue;
      seenTitles.add(node);
      titleNodes.push({ node, rect });
    }
    const candidates = [];
    const seenButtons = new Set();
    const addButton = (button, titleRect, extraScore = 0) => {
      const target = closestClickable(button);
      if (!target || seenButtons.has(target) || disabled(target)) return;
      const rect = rectOf(target);
      if (!rect || rect.width < 10 || rect.height < 10 || rect.width > 76 || rect.height > 76) return;
      if (rect.top > titleRect.bottom + 34 || rect.bottom < titleRect.top - 34) return;
      if (rect.left < titleRect.left - 72 || rect.left > titleRect.right + 260) return;
      if (String(target.href || target.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) return;
      const token = compact(textOf(target));
      if (/newchat|sidebar|back|close|search|send|deepthink|model|expert|share|copy|新聊天|侧边栏|返回|关闭|搜索|发送|分享|复制/.test(token)) return;
      const signature = compact(svgTextOf(target));
      const iconish = !token || /more|menu|options|ellipsis|dots|circle|kebab|更多|菜单|选项/.test(token + signature) || all("circle", target).length >= 2 || rect.width <= 44;
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
    for (const { node, rect: titleRect } of titleNodes.slice(0, 8)) {
      for (let scope = node, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
        const scopeRect = rectOf(scope);
        if (!scopeRect || scopeRect.top > 210 || scopeRect.height > 180 || scopeRect.width > 900) continue;
        for (const button of all("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1']),[class*='button' i]", scope)) {
          addButton(button, titleRect, 120 - depth * 12);
        }
      }
      for (const button of all("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])")) {
        addButton(button, titleRect, 0);
      }
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.left - a.left);
    return candidates[0]?.element || null;
  };
  const hoverTopic = (link) => {
    try { link.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    for (const target of [link, link?.parentElement, link?.parentElement?.parentElement].filter(Boolean)) {
      const point = centerOf(target);
      const PointerEventCtor = typeof PointerEvent === "function" ? PointerEvent : null;
      const MouseEventCtor = typeof MouseEvent === "function" ? MouseEvent : null;
      for (const type of ["pointerover", "mouseover", "mouseenter", "pointermove", "mousemove"]) {
        try {
          const Ctor = type.startsWith("pointer") ? PointerEventCtor : MouseEventCtor;
          if (typeof Ctor !== "function") continue;
          target.dispatchEvent(new Ctor(type, {
            bubbles: type !== "mouseenter",
            cancelable: true,
            composed: true,
            view: window,
            clientX: point.x,
            clientY: point.y,
            screenX: point.x,
            screenY: point.y,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true
          }));
        } catch {}
      }
    }
  };
  const visualTopicRow = (link) => {
    const linkRect = rectOf(link);
    if (!link || !linkRect) return link;
    const linkToken = compact(textOf(link));
    let best = { element: link, score: linkRect.width };
    for (let node = link; node && node !== document.body; node = node.parentElement) {
      const rect = rectOf(node);
      if (!rect || rect.left > 560 || rect.width < 80 || rect.width > 620 || rect.height < 24 || rect.height > 118) continue;
      if (rect.top > linkRect.top + 14 || rect.bottom < linkRect.bottom - 14) continue;
      const token = compact(textOf(node));
      if (linkToken && token && !token.includes(linkToken) && !linkToken.includes(token)) continue;
      const className = String(node.className || "");
      const active = /\b(active|selected|current)\b/i.test(className) || String(node.getAttribute?.("aria-current") || "").toLowerCase() === "page";
      const score = rect.width + Math.max(0, rect.right - linkRect.right) * 2 + (active ? 500 : 0);
      if (score > best.score) best = { element: node, score };
    }
    return best.element || link;
  };
  const sidebarRootForTopic = (link) => {
    const roots = [];
    const seen = new Set();
    const add = (node, seedRect) => {
      if (!node || seen.has(node)) return;
      seen.add(node);
      const rect = rectOf(node);
      if (!rect || rect.left > 560 || rect.width < 120 || rect.width > 620 || rect.height < 36) return;
      if (seedRect && (rect.top > seedRect.top + 12 || rect.bottom < seedRect.bottom - 12)) return;
      const links = all("a[href*='/chat/s/'],a[href*='/a/chat/s/']", node).filter(visible).length;
      const value = textOf(node);
      const className = String(node.className || "");
      const historyish = /today|yesterday|pinned|new chat|今天|昨天|新聊天|置顶/i.test(value)
        || /scroll|history|sidebar|sider|conversation/i.test(className)
        || links >= 2;
      if (!historyish && links < 1) return;
      roots.push({
        element: node,
        score: Math.min(links, 12) * 120 + rect.width + Math.min(rect.height, 900) * 0.04 - rect.left
      });
    };
    const seedRect = rectOf(link);
    for (const seed of [link, ...all("a[href*='/chat/s/'],a[href*='/a/chat/s/']").filter(visible).slice(0, 5)]) {
      for (let node = seed; node && node !== document.body; node = node.parentElement) add(node, seed === link ? seedRect : null);
    }
    roots.sort((a, b) => b.score - a.score);
    return roots[0]?.element || null;
  };
  const topicMenuRect = (link) => {
    const base = rectOf(visualTopicRow(link)) || rectOf(link);
    if (!base) return null;
    const sidebarRect = rectOf(sidebarRootForTopic(link));
    const right = sidebarRect && sidebarRect.left <= base.left + 36 && sidebarRect.right > base.right + 20
      ? Math.min(sidebarRect.right - 10, Math.max(base.right, sidebarRect.right - 10))
      : base.right;
    return {
      left: base.left,
      top: base.top,
      right,
      bottom: base.bottom,
      width: right - base.left,
      height: base.height
    };
  };
  const findTopicMoreButton = (link) => {
    if (!link) return null;
    hoverTopic(link);
    const visualRow = visualTopicRow(link);
    const linkRect = topicMenuRect(link);
    if (!linkRect) return null;
    const candidates = [];
    const seen = new Set();
    const add = (node, extra = 0) => {
      const target = closestClickable(node);
      if (!target || seen.has(target) || target === link || disabled(target)) return;
      const rect = rectOf(target);
      if (!rect || rect.width < 8 || rect.height < 8 || rect.width > 80 || rect.height > 80) return;
      const overlaps = rect.top < linkRect.bottom + 10 && rect.bottom > linkRect.top - 10;
      const nearRight = rect.left >= linkRect.right - 132 && rect.left <= linkRect.right + 84;
      if (!overlaps || !nearRight) return;
      const value = compact(textOf(target));
      if (value && !/more|menu|options|ellipsis|dots|更多|菜单|选项/.test(value)) return;
      seen.add(target);
      candidates.push({
        element: target,
        score: extra
          + (visible(target) ? 180 : 40)
          + (!value ? 180 : 0)
          + Math.max(0, 100 - Math.abs((rect.left + rect.right) / 2 - (linkRect.right - 28))),
        right: rect.right
      });
    };
    const iconSelector = "button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i],svg,[class*='more' i],[class*='menu' i],[class*='option' i],[class*='action' i],[class*='ellipsis' i]";
    for (const node of all(iconSelector, visualRow)) add(node, 320);
    for (let scope = link, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
      for (const node of all(iconSelector, scope)) {
        add(node, 260 - depth * 18);
      }
    }
    for (const offset of [18, 28, 38, 48, 60, 76, 96, 118, 142]) {
      try {
        const pointTarget = document.elementFromPoint(Math.max(linkRect.left + 16, linkRect.right - offset), linkRect.top + linkRect.height / 2);
        if (pointTarget) add(pointTarget, 180 - offset);
      } catch {}
    }
    for (const node of all(iconSelector)) add(node, 0);
    candidates.sort((a, b) => b.score - a.score || b.right - a.right);
    return candidates[0]?.element || null;
  };
  const menuRoots = () => all([
    "[role='menu']",
    "[role='listbox']",
    "[data-radix-popper-content-wrapper]",
    "[data-floating-ui-portal]",
    "[class*='dropdown' i]",
    "[class*='popover' i]",
    "[class*='menu' i]",
    "body > div"
  ].join(", ")).filter((root) => {
    if (!visible(root)) return false;
    const value = textOf(root);
    const area = (() => {
      const rect = rectOf(root);
      return rect ? rect.width * rect.height : 0;
    })();
    return area < 450000 && /delete|rename|pin|share|删除|重命名|置顶|分享/i.test(value);
  }).sort((a, b) => {
    const ar = rectOf(a);
    const br = rectOf(b);
    return (br?.right || 0) - (ar?.right || 0) || (ar?.top || 0) - (br?.top || 0);
  });
  const isDeleteMenuText = (value) => {
    const token = compact(value);
    return token === "delete" || token === "删除";
  };
  const findDeleteMenuItem = () => {
    const roots = menuRoots();
    const candidates = [];
    for (const root of roots) {
      for (const node of all("button,[role='button'],[role='menuitem'],[tabindex]:not([tabindex='-1']),div", root)) {
        if (!visible(node) || disabled(node)) continue;
        const value = textOf(node);
        if (!isDeleteMenuText(value)) continue;
        const target = closestClickable(node);
        const rect = rectOf(target);
        candidates.push({
          element: target,
          area: rect ? rect.width * rect.height : 0,
          top: rect?.top || 0
        });
      }
    }
    candidates.sort((a, b) => a.area - b.area || a.top - b.top);
    return candidates[0]?.element || null;
  };
  const serializableRect = (rect) => rect ? {
    left: Math.round(Number(rect.left || 0) * 100) / 100,
    top: Math.round(Number(rect.top || 0) * 100) / 100,
    right: Math.round(Number(rect.right || 0) * 100) / 100,
    bottom: Math.round(Number(rect.bottom || 0) * 100) / 100,
    width: Math.round(Number(rect.width || 0) * 100) / 100,
    height: Math.round(Number(rect.height || 0) * 100) / 100
  } : null;
  const trustedMenuClickForTopicLink = (link, reason = "topic menu trigger requires trusted browser input") => {
    const linkRect = topicMenuRect(link);
    if (!linkRect) return null;
    const y = linkRect.top + linkRect.height / 2;
    const points = [18, 28, 38, 48, 60, 76, 96, 118, 142]
      .map((offset) => ({ x: Math.max(linkRect.left + 16, linkRect.right - offset), y }));
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
    const framePoint = framePoints[0];
    if (!framePoint) return null;
    return {
      kind: "topic-menu-trigger",
      site: "deepseek",
      reason,
      framePoint,
      framePoints,
      frameRect: serializableRect(linkRect),
      hoverSettleMs: 360
    };
  };
  const trustedKeySequenceForTopicLink = (link, reason = "topic menu trigger requires keyboard focus") => {
    const rowRect = topicMenuRect(link);
    const visualRect = rectOf(visualTopicRow(link)) || rectOf(link) || rowRect;
    if (!rowRect || !visualRect) return null;
    const focusX = Math.min(
      rowRect.right - 104,
      Math.max(rowRect.left + 24, visualRect.left + Math.min(180, visualRect.width * 0.42))
    );
    return {
      kind: "topic-menu-keyboard",
      site: "deepseek",
      reason,
      framePoint: {
        x: Math.round(focusX * 100) / 100,
        y: Math.round((rowRect.top + rowRect.height / 2) * 100) / 100
      },
      frameRect: serializableRect(rowRect),
      keys: [
        { key: "Tab", settleMs: 140 },
        { key: "Enter", settleMs: 260 }
      ],
      clickSettleMs: 160,
      keySettleMs: 140,
      settleMs: 460
    };
  };
  const trustedHoverForTopicLink = (link, reason = "topic menu trigger requires trusted hover") => {
    const linkRect = topicMenuRect(link);
    if (!linkRect) return null;
    return {
      kind: "topic-menu-hover",
      site: "deepseek",
      reason,
      framePoint: {
        x: Math.round(Math.max(linkRect.left + 16, linkRect.right - 28) * 100) / 100,
        y: Math.round((linkRect.top + linkRect.height / 2) * 100) / 100
      },
      frameRect: serializableRect(linkRect),
      hoverSettleMs: 520
    };
  };
  const resultWithTrustedHover = (reason, link) => {
    const trustedHover = trustedHoverForTopicLink(link, reason);
    return {
      ok: false,
      reason,
      ...(trustedHover ? { needsTrustedHover: true, trustedHover } : {})
    };
  };
  const resultWithTrustedMenuClick = (reason, link) => {
    const trustedMenuClick = trustedMenuClickForTopicLink(link, reason);
    return {
      ok: false,
      reason,
      ...(trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {})
    };
  };
  const resultWithTrustedKeySequence = (reason, link) => {
    const trustedKeySequence = trustedKeySequenceForTopicLink(link, reason);
    const trustedMenuClick = trustedMenuClickForTopicLink(link, reason);
    return {
      ok: false,
      reason,
      ...(trustedKeySequence ? { needsTrustedKeySequence: true, trustedKeySequence } : {}),
      ...(trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {})
    };
  };
  const dialogTextMatches = (value) => {
    const text = String(value || "").toLowerCase();
    const token = compact(value);
    return /are you sure|chat can(?:'|’)?t be recovered|chat cant be recovered|share links from it will be disabled|recover|recovered|confirm|cancel|cannot be undone|permanently|确定|确认|取消|恢复|不可恢复|无法恢复|不能恢复/.test(text)
      || /areyousure|chatcantberecovered|sharelinksfromitwillbedisabled|recover|recovered|confirm|cancel|cannotbeundone|permanently|确定|确认|取消|恢复|不可恢复|无法恢复|不能恢复/.test(token);
  };
  const dialogConfirmContextMatches = (value) => {
    const text = String(value || "").toLowerCase();
    const token = compact(value);
    return /are you sure|chat can(?:'|’)?t be recovered|chat cant be recovered|share links from it will be disabled|recover|recovered|confirm|cannot be undone|permanently|确定|确认|恢复|不可恢复|无法恢复|不能恢复/.test(text)
      || /areyousure|chatcantberecovered|sharelinksfromitwillbedisabled|recover|recovered|confirm|cannotbeundone|permanently|确定|确认|恢复|不可恢复|无法恢复|不能恢复/.test(token);
  };
  const dialogHasCancel = (value) => {
    const text = String(value || "").toLowerCase();
    const token = compact(value);
    return /cancel|取消/.test(text) || /cancel|取消/.test(token);
  };
  const dialogRoots = () => all([
    "[role='alertdialog']",
    "[role='dialog']",
    "[data-radix-dialog-content]",
    "[data-state='open']",
    "[class*='modal' i]",
    "body > div"
  ].join(", ")).filter((root) => {
    if (!visible(root)) return false;
    const rect = rectOf(root);
    const area = rect ? rect.width * rect.height : 0;
    const semantic = (() => {
      try {
        return root.matches?.("[role='alertdialog'],[role='dialog'],[data-radix-dialog-content]") || false;
      } catch {
        return false;
      }
    })();
    if (!semantic && (area < 1200 || area > 380000)) return false;
    return dialogTextMatches(textOf(root));
  })
    .sort((a, b) => {
      const ar = rectOf(a);
      const br = rectOf(b);
      return (ar ? ar.width * ar.height : 0) - (br ? br.width * br.height : 0);
    });
  const isConfirmText = (value) => {
    const token = compact(value);
    if (!token || /cancel|取消|keep|保留/.test(token)) return false;
    return token === "deletechat"
      || token === "delete"
      || token === "confirm"
      || token === "confirmdelete"
      || token === "删除"
      || token === "确认"
      || token === "确认删除"
      || token === "删除聊天";
  };
  const confirmDialogFor = (node) => {
    for (let root = node, depth = 0; root && root !== document.body && depth < 8; root = root.parentElement, depth += 1) {
      if (!visible(root)) continue;
      const rootText = textOf(root);
      if (dialogHasCancel(rootText) && dialogConfirmContextMatches(rootText)) return { element: root, text: rootText };
    }
    return null;
  };
  const findConfirmButtonFast = () => {
    const candidates = [];
    for (const node of all("button,[role='button'],[tabindex]:not([tabindex='-1']),[class*='button' i]")) {
      if (!visible(node) || disabled(node)) continue;
      const value = textOf(node);
      if (!isConfirmText(value)) continue;
      const dialog = confirmDialogFor(node);
      if (!dialog) continue;
      const target = closestClickable(node);
      if (!target || disabled(target)) continue;
      const rect = rectOf(target);
      const token = compact(value);
      candidates.push({
        element: target,
        score: token === "deletechat" || token === "删除聊天" ? 700 : 0,
        area: rect ? rect.width * rect.height : 0,
        right: rect?.right || 0,
        dialogText: dialog.text
      });
    }
    candidates.sort((a, b) => b.score - a.score || a.area - b.area || b.right - a.right);
    return candidates[0]?.element || null;
  };
  const findConfirmButton = () => {
    const fast = findConfirmButtonFast();
    if (fast) return fast;
    const candidates = [];
    for (const root of dialogRoots()) {
      const rootText = textOf(root);
      if (!dialogTextMatches(rootText)) continue;
      for (const node of all("button,[role='button'],[tabindex]:not([tabindex='-1']),[class*='button' i],div", root)) {
        if (!visible(node) || disabled(node)) continue;
        const value = textOf(node);
        if (!isConfirmText(value)) continue;
        const target = closestClickable(node);
        const rect = rectOf(target);
        candidates.push({
          element: target,
          score: compact(value) === "deletechat" || compact(value) === "删除聊天" ? 600 : 0,
          area: rect ? rect.width * rect.height : 0,
          right: rect?.right || 0
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.area - b.area || b.right - a.right);
    return candidates[0]?.element || null;
  };
  const confirmGone = () => !findConfirmButton();
  const clickExistingConfirm = async () => {
    const button = findConfirmButton();
    if (!button) return null;
    if (!activate(button, ["onClick", "onPointerUp", "onMouseUp"])) return { ok: false, reason: "delete confirmation click failed" };
    const closed = await waitFor(confirmGone, 5200, 140);
    return closed ? { ok: true } : { ok: false, reason: "delete confirmation did not close" };
  };
  const deleteThread = async (data = {}) => {
    const existingConfirm = await clickExistingConfirm();
    if (existingConfirm) return existingConfirm;
    const existingDeleteItem = await waitFor(findDeleteMenuItem, (data?.trustedKeySequenceRetried || data?.trustedMenuClickRetried) ? 3400 : 300, 60);
    if (existingDeleteItem && activate(existingDeleteItem, ["onClick", "onPointerUp", "onMouseUp"])) {
      const existingMenuConfirm = await waitFor(findConfirmButton, 4200, 100);
      if (!existingMenuConfirm) return { ok: false, reason: "delete confirmation button not found" };
      if (!activate(existingMenuConfirm, ["onClick", "onPointerUp", "onMouseUp"])) {
        return { ok: false, reason: "delete confirmation click failed" };
      }
      const closed = await waitFor(confirmGone, 6200, 140);
      return closed ? { ok: true } : { ok: false, reason: "delete confirmation did not close" };
    }
    if (data?.trustedMenuClickRetried) return { ok: false, reason: "trusted topic menu click did not open" };
    const headerTrigger = findHeaderMoreButton();
    const openTriggerAndDelete = async (trigger, timeoutMs = 3000) => {
      const deleteItem = await activateUntil(
        trigger,
        findDeleteMenuItem,
        ["onClick", "onPointerUp", "onMouseUp", "onPointerDown", "onMouseDown"],
        { settleMs: 220 }
      ) || await waitFor(findDeleteMenuItem, timeoutMs, 90);
      if (!deleteItem) return null;
      return activate(deleteItem, ["onClick", "onPointerUp", "onMouseUp"]) ? deleteItem : null;
    };
    if (headerTrigger) {
      if (await openTriggerAndDelete(headerTrigger, 2600)) {
        const headerConfirm = await waitFor(findConfirmButton, 4200, 100);
        if (!headerConfirm) return { ok: false, reason: "delete confirmation button not found" };
        if (!activate(headerConfirm, ["onClick", "onPointerUp", "onMouseUp"])) {
          return { ok: false, reason: "delete confirmation click failed" };
        }
        const closed = await waitFor(confirmGone, 6200, 140);
        return closed ? { ok: true } : { ok: false, reason: "delete confirmation did not close" };
      }
      closeTransientMenus();
    }
    const link = currentTopicLink();
    if (!link) return { ok: false, reason: "current topic row not found" };
    const trigger = await waitFor(() => findTopicMoreButton(link), 1800, 80);
    if (!trigger) return data?.trustedMenuClickRetried
      ? { ok: false, reason: "trusted topic menu click did not open" }
      : data?.trustedKeySequenceRetried
        ? resultWithTrustedMenuClick("keyboard topic menu did not open", link)
      : resultWithTrustedKeySequence("topic menu trigger not found", link);
    const deleteItem = await openTriggerAndDelete(trigger, 3000);
    if (!deleteItem) return data?.trustedMenuClickRetried
      ? { ok: false, reason: "trusted topic menu click did not open" }
      : data?.trustedKeySequenceRetried
        ? resultWithTrustedMenuClick("keyboard topic menu did not open", link)
      : resultWithTrustedKeySequence("delete menu item not found", link);
    const confirmButton = await waitFor(findConfirmButton, 4200, 100);
    if (!confirmButton) return { ok: false, reason: "delete confirmation button not found" };
    if (!activate(confirmButton, ["onClick", "onPointerUp", "onMouseUp"])) {
      return { ok: false, reason: "delete confirmation click failed" };
    }
    const closed = await waitFor(confirmGone, 6200, 140);
    return closed ? { ok: true } : { ok: false, reason: "delete confirmation did not close" };
  };

  const messageListener = async (event) => {
    const message = event.data;
    if (message?.source !== deleteSource || message.type !== "request" || message.action !== "deleteThread") return;
    let result;
    try {
      result = await deleteThread(message.data || {});
    } catch (error) {
      result = { ok: false, reason: error?.message || String(error || "delete bridge failed") };
    }
    try {
      window.postMessage({
        source: deleteSource,
        type: "response",
        id: message.id,
        action: "deleteThread",
        site: "deepseek",
        ...result
      }, "*");
    } catch {}
  };
  const api = Object.freeze({ version: bridgeVersion, deleteThread });
  window.__CHATCLUB_DEEPSEEK_DELETE_BRIDGE__ = api;
  window.addEventListener("message", messageListener, true);
  runtimes.register(runtimeName, {
    version: bridgeVersion,
    api,
    dispose() {
      window.removeEventListener("message", messageListener, true);
      if (window.__CHATCLUB_DEEPSEEK_DELETE_BRIDGE__ === api) {
        delete window.__CHATCLUB_DEEPSEEK_DELETE_BRIDGE__;
      }
    }
  });
}
