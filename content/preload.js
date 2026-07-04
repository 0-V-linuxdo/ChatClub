(() => {
  const COPY_SOURCE = "chatclub-native-copy";
  const GEMINI_MODEL_PICKER_SOURCE = "chatclub-gemini-model-picker";
  const DEEPSEEK_DELETE_BRIDGE_VERSION = "2026.07.03.30";
  const DEEPSEEK_DELETE_SOURCE = "chatclub-deepseek-delete-thread:2026.07.03.30";

  function installGeminiModelPickerBridge() {
    if (window.__CHATCLUB_GEMINI_MODEL_PICKER_BRIDGE__) return;
    const records = [];
    const originalAddEventListener = EventTarget.prototype.addEventListener;

    const visible = (el) => {
      try {
        const rect = el?.getBoundingClientRect?.();
        if (!rect || rect.width <= 4 || rect.height <= 4) return false;
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
      } catch {
        return false;
      }
    };

    const firstVisible = (selectors) => {
      for (const selector of selectors) {
        try {
          for (const el of document.querySelectorAll(selector)) {
            if (visible(el)) return el;
          }
        } catch {}
      }
      return null;
    };

    const looksLikeGeminiModeTarget = (target) => {
      if (!target || target.nodeType !== 1) return false;
      const tag = String(target.tagName || "").toLowerCase();
      if (tag === "gem-button") return true;
      try {
        return Boolean(target.matches?.(
          "[data-test-id='bard-mode-menu-button'], .gds-mode-switch-button, .gem-button, bard-mode-switcher button, button[aria-label^='Open mode picker' i]"
        ));
      } catch {
        return false;
      }
    };

    const recordListener = (target, listener) => {
      if (!looksLikeGeminiModeTarget(target)) return;
      if (typeof listener !== "function" && typeof listener?.handleEvent !== "function") return;
      records.push({ target, listener });
      while (records.length > 30) records.shift();
    };

    const wrappedAddEventListener = function (type, listener, options) {
      try {
        if (String(type || "").toLowerCase() === "click") recordListener(this, listener);
      } catch {}
      return originalAddEventListener.apply(this, arguments);
    };
    try {
      wrappedAddEventListener.toString = () => originalAddEventListener.toString();
      Object.defineProperty(EventTarget.prototype, "addEventListener", {
        configurable: true,
        writable: true,
        value: wrappedAddEventListener
      });
    } catch {}

    const triggerButton = () => firstVisible([
      "button[aria-label='Open mode picker']",
      "button[aria-label^='Open mode picker' i]",
      "bard-mode-switcher button[aria-label='Open mode picker']",
      "bard-mode-switcher button",
      "button[aria-label*='mode picker' i]",
      "button[aria-label*='model' i]"
    ]);

    const listenerRecordFor = (button) => {
      const host = button?.closest?.("gem-button, [data-test-id='bard-mode-menu-button'], .gds-mode-switch-button") || button;
      for (let index = records.length - 1; index >= 0; index -= 1) {
        const record = records[index];
        const target = record.target;
        if (!target?.isConnected) continue;
        if (target === host || target === button || target.contains?.(button) || host?.contains?.(target)) return record;
      }
      return records.slice().reverse().find((record) => record.target?.isConnected && looksLikeGeminiModeTarget(record.target)) || null;
    };

    const eventPathFor = (button, currentTarget) => {
      const path = [];
      const add = (node) => {
        if (node && !path.includes(node)) path.push(node);
      };
      add(button);
      for (let node = button; node; node = node.parentNode || node.host || null) add(node);
      add(currentTarget);
      add(document);
      add(window);
      return path;
    };

    const modelClickEvent = (button, currentTarget) => {
      const rect = button?.getBoundingClientRect?.();
      const clientX = rect ? rect.left + rect.width / 2 : 1;
      const clientY = rect ? rect.top + rect.height / 2 : 1;
      return {
        type: "click",
        target: button,
        srcElement: button,
        currentTarget,
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        buttons: 0,
        detail: 1,
        clientX,
        clientY,
        screenX: clientX,
        screenY: clientY,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {},
        stopImmediatePropagation() {},
        composedPath() { return eventPathFor(button, currentTarget); }
      };
    };

    const menuOpen = () => firstVisible([
      ".cdk-overlay-pane .gds-mode-switch-menu",
      ".cdk-overlay-pane [role='menu']",
      ".cdk-overlay-pane",
      ".gds-mode-switch-menu",
      "[role='menu']"
    ]);

    const open = () => {
      const existing = menuOpen();
      if (existing) return { ok: true, alreadyOpen: true, records: records.length };
      const button = triggerButton();
      if (!button) return { ok: false, reason: "trigger not found", records: records.length };
      const record = listenerRecordFor(button);
      if (!record) return { ok: false, reason: "trigger listener not captured", records: records.length };
      try {
        button.focus?.({ preventScroll: true });
      } catch {
        try { button.focus?.(); } catch {}
      }
      try {
        const listener = record.listener;
        const event = modelClickEvent(button, record.target || button);
        if (typeof listener === "function") listener.call(record.target || button, event);
        else listener.handleEvent.call(listener, event);
        return { ok: true, records: records.length };
      } catch (error) {
        return { ok: false, reason: error?.message || String(error || "listener failed"), records: records.length };
      }
    };

    window.__CHATCLUB_GEMINI_MODEL_PICKER_BRIDGE__ = { open, records };
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message?.source !== GEMINI_MODEL_PICKER_SOURCE || message.type !== "request" || message.action !== "open") return;
      const result = open();
      try {
        window.postMessage({
          source: GEMINI_MODEL_PICKER_SOURCE,
          type: "response",
          id: message.id,
          action: "open",
          ...result
        }, "*");
      } catch {}
    }, true);
  }

  function installDeepSeekDeleteBridge() {
    if (window.__CHATCLUB_DEEPSEEK_DELETE_BRIDGE__?.version === DEEPSEEK_DELETE_BRIDGE_VERSION) return;

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

    window.__CHATCLUB_DEEPSEEK_DELETE_BRIDGE__ = { version: DEEPSEEK_DELETE_BRIDGE_VERSION, deleteThread };
    window.addEventListener("message", async (event) => {
      const message = event.data;
      if (message?.source !== DEEPSEEK_DELETE_SOURCE || message.type !== "request" || message.action !== "deleteThread") return;
      let result;
      try {
        result = await deleteThread(message.data || {});
      } catch (error) {
        result = { ok: false, reason: error?.message || String(error || "delete bridge failed") };
      }
      try {
        window.postMessage({
          source: DEEPSEEK_DELETE_SOURCE,
          type: "response",
          id: message.id,
          action: "deleteThread",
          site: "deepseek",
          ...result
        }, "*");
      } catch {}
    }, true);
  }

  if (!window.__CHATCLUB_NATIVE_COPY_BRIDGE__) {
    window.__CHATCLUB_NATIVE_COPY_BRIDGE__ = true;
    const captures = new Map();
    let hooksInstalled = false;
    const post = (type, action, data) => {
      try {
        window.postMessage({ source: COPY_SOURCE, type, id: action.id, action: action.action, data }, "*");
      } catch {}
    };
    const activeCaptureId = () => {
      let current = null;
      captures.forEach((_record, id) => { current = id; });
      return current;
    };
    const captureText = (id, text, priority = 1) => {
      const record = captures.get(id);
      const value = String(text || "");
      if (!record || !value) return false;
      if (record.priority > priority) return true;
      record.priority = priority;
      record.text = value;
      post("capture", { id, action: "capture" }, { text: value, priority });
      return true;
    };
    const mimePriority = (type) => {
      const value = String(type || "").toLowerCase();
      if (!value) return 0;
      if (/text\/plain|^text$|plain/.test(value)) return 6;
      if (/text\/html|html/.test(value)) return 2;
      if (value.startsWith("text/")) return /uri|url/.test(value) ? 1 : 4;
      return 0;
    };
    const selectedText = () => {
      try {
        const selection = window.getSelection?.();
        if (selection && String(selection)) return String(selection);
      } catch {}
      try {
        const element = document.activeElement;
        const tag = String(element?.tagName || "").toLowerCase();
        if (tag !== "textarea" && tag !== "input") return "";
        const type = String(element?.getAttribute?.("type") || "").toLowerCase();
        if (tag === "input" && /^(?:button|checkbox|color|file|hidden|image|radio|range|reset|submit|password)$/.test(type)) return "";
        const start = Number(element["selectionStart"]);
        const end = Number(element["selectionEnd"]);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) return String(element["value"] || "").slice(start, end);
      } catch {}
      return "";
    };
    const captureTransfer = (transfer, id) => {
      try {
        const plain = transfer?.getData?.("text/plain") || transfer?.getData?.("text") || transfer?.getData?.("Text") || "";
        if (plain) return captureText(id, plain, 6);
        const html = transfer?.getData?.("text/html") || "";
        if (html) return captureText(id, html, 2);
      } catch {}
      return false;
    };
    const blobText = async (blob) => {
      try {
        if (blob && typeof blob.text === "function") return await blob.text();
        if (blob !== undefined && blob !== null) return String(blob);
      } catch {}
      return "";
    };
    const clipboardItemsText = async (items) => {
      let fallback = "";
      let html = "";
      try {
        for (const item of Array.from(items || [])) {
          if (!item?.types) continue;
          for (const type of Array.from(item.types || [])) {
            const priority = mimePriority(type);
            if (!priority) continue;
            const blob = await item.getType(type);
            const value = await blobText(blob);
            if (!value) continue;
            if (priority >= 6) return value;
            if (priority > 2 && !fallback) fallback = value;
            else if (!html) html = value;
          }
        }
      } catch {}
      return fallback || html;
    };
    const captureClipboardValue = (id, value, handlesItems = false) => {
      if (!id) return false;
      if (handlesItems) {
        clipboardItemsText(value).then((text) => captureText(id, text, 6));
        return true;
      }
      return captureText(id, value, 6);
    };
    const wrapMethod = (target, key, handlesItems = false) => {
      try {
        const original = target?.[key];
        if (typeof original !== "function") return false;
        if (original.__CHATCLUB_NATIVE_COPY_WRAPPED__) return true;
        const wrapped = function (...args) {
          const id = activeCaptureId();
          if (id) {
            captureClipboardValue(id, args[0], handlesItems);
            return Promise.resolve();
          }
          return original.apply(this && this !== window ? this : target, args);
        };
        wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED__ = true;
        Object.defineProperty(target, key, { configurable: true, writable: true, value: wrapped });
        return true;
      } catch {
        return false;
      }
    };
    const wrapDataTransfer = () => {
      try {
        const proto = window.DataTransfer?.prototype;
        const original = proto?.setData;
        if (typeof original !== "function") return false;
        if (original.__CHATCLUB_NATIVE_COPY_WRAPPED__) return true;
        const wrapped = function (...args) {
          const id = activeCaptureId();
          if (id) {
            const priority = mimePriority(args[0]);
            if (priority) captureText(id, args[1], priority);
          }
          return original.apply(this, args);
        };
        wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED__ = true;
        Object.defineProperty(proto, "setData", { configurable: true, writable: true, value: wrapped });
        return true;
      } catch {
        return false;
      }
    };
    const wrapExecCommand = () => {
      try {
        const original = document.execCommand;
        if (typeof original !== "function") return false;
        if (original.__CHATCLUB_NATIVE_COPY_WRAPPED__) return true;
        const wrapped = function (...args) {
          const id = activeCaptureId();
          const command = String(args[0] || "").toLowerCase();
          if (id && command === "copy") {
            const before = selectedText();
            if (before) captureText(id, before, 3);
            let result = false;
            try { result = original.apply(document, args); } catch {}
            const after = selectedText();
            if (after) captureText(id, after, 4);
            return result || Boolean(after || before);
          }
          return original.apply(document, args);
        };
        wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED__ = true;
        Object.defineProperty(document, "execCommand", { configurable: true, writable: true, value: wrapped });
        return true;
      } catch {
        return false;
      }
    };
    const installClipboardHooks = () => {
      try {
        const clipboard = navigator.clipboard;
        const proto = clipboard && Object.getPrototypeOf(clipboard);
        let installed = false;
        for (const target of [clipboard, proto].filter(Boolean)) {
          installed = wrapMethod(target, "writeText", false) || installed;
          installed = wrapMethod(target, "write", true) || installed;
        }
        try {
          if (clipboard) {
            const proxy = new Proxy(clipboard, {
              get(target, key, receiver) {
                if (key === "writeText") {
                  return (text) => {
                    const id = activeCaptureId();
                    if (id) {
                      captureText(id, text, 7);
                      return Promise.resolve();
                    }
                    return Reflect.get(target, key, receiver).call(target, text);
                  };
                }
                if (key === "write") {
                  return (items) => {
                    const id = activeCaptureId();
                    if (id) {
                      clipboardItemsText(items).then((text) => captureText(id, text, 7));
                      return Promise.resolve();
                    }
                    return Reflect.get(target, key, receiver).call(target, items);
                  };
                }
                const value = Reflect.get(target, key, receiver);
                return typeof value === "function" ? value.bind(target) : value;
              }
            });
            for (const target of [navigator, Object.getPrototypeOf(navigator)].filter(Boolean)) {
              try {
                Object.defineProperty(target, "clipboard", { configurable: true, get: () => proxy });
                installed = true;
              } catch {}
            }
          }
        } catch {}
        hooksInstalled = wrapDataTransfer() || hooksInstalled || installed;
        hooksInstalled = wrapExecCommand() || hooksInstalled;
        return hooksInstalled;
      } catch {
        return hooksInstalled;
      }
    };
    const copyEventCapture = (event) => {
      const id = activeCaptureId();
      if (!id) return;
      const selected = selectedText();
      if (selected) captureText(id, selected, 3);
      const sample = () => {
        try {
          captureTransfer(event?.clipboardData, id);
          const current = selectedText();
          if (current) captureText(id, current, 2);
        } catch {}
      };
      sample();
      setTimeout(sample, 0);
      setTimeout(sample, 30);
    };
    installClipboardHooks();
    window.addEventListener("copy", copyEventCapture, true);
    window.addEventListener("copy", copyEventCapture, false);

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message?.source !== COPY_SOURCE || message.type !== "request") return;
      if (message.action === "install") {
        const previous = captures.get(message.id);
        if (previous?.timer) clearTimeout(previous.timer);
        const timeoutMs = Math.max(300, Number(message.data?.timeoutMs || message.timeoutMs || message.timeout || message.data?.timeout) || 5000);
        const timer = setTimeout(() => captures.delete(message.id), timeoutMs);
        installClipboardHooks();
        captures.set(message.id, { text: "", priority: 0, timer });
        post("response", message, { installed: true, hooks: hooksInstalled });
      }
      if (message.action === "restore") {
        const record = captures.get(message.id) || {};
        if (record.timer) clearTimeout(record.timer);
        captures.delete(message.id);
        post("response", message, { text: record.text || "" });
      }
    }, true);
  }

  function installGrokStorageAccessBridge() {
    if (window.__CHATCLUB_GROK_STORAGE_ACCESS_BRIDGE__) return;
    window.__CHATCLUB_GROK_STORAGE_ACCESS_BRIDGE__ = true;

    const RELOAD_KEY = "__chatclub_grok_storage_access_reloaded__";
    const diag = {
      version: "2026-07-02-storage-access",
      href: String(location.href || ""),
      host: String(location.hostname || ""),
      framed: true,
      referrer: "",
      ancestorOrigins: [],
      supported: {
        hasStorageAccess: typeof document.hasStorageAccess === "function",
        requestStorageAccess: typeof document.requestStorageAccess === "function",
        permissionsQuery: !!navigator.permissions?.query
      },
      permissionState: "",
      hasStorageAccess: null,
      status: "starting",
      requested: false,
      requestResult: "",
      requestError: "",
      userGestureArmed: false,
      reloadScheduled: false,
      reloadReason: "",
      updatedAt: new Date().toISOString()
    };
    window.__CHATCLUB_GROK_EMBED_DIAG__ = diag;

    const update = (patch = {}) => {
      Object.assign(diag, patch, {
        href: String(location.href || ""),
        updatedAt: new Date().toISOString()
      });
      try {
        diag.referrer = String(document.referrer || "");
      } catch {}
      try {
        diag.ancestorOrigins = Array.from(location.ancestorOrigins || []);
      } catch {}
      return diag;
    };

    const storageMarker = () => `${location.origin || "grok"}|${location.pathname || "/"}`;

    const readHasStorageAccess = async () => {
      if (typeof document.hasStorageAccess !== "function") {
        update({ hasStorageAccess: null });
        return null;
      }
      try {
        const hasAccess = await document.hasStorageAccess();
        update({ hasStorageAccess: Boolean(hasAccess) });
        return Boolean(hasAccess);
      } catch (error) {
        update({ hasStorageAccess: null, hasStorageAccessError: error?.message || String(error || "hasStorageAccess failed") });
        return null;
      }
    };

    const readPermissionState = async () => {
      if (!navigator.permissions?.query) return "";
      try {
        const permission = await navigator.permissions.query({ name: "storage-access" });
        update({ permissionState: String(permission.state || "") });
        permission.onchange = () => update({ permissionState: String(permission.state || "") });
        return String(permission.state || "");
      } catch (error) {
        update({ permissionState: "", permissionError: error?.message || String(error || "permission query failed") });
        return "";
      }
    };

    const reloadOnce = (reason) => {
      const marker = storageMarker();
      try {
        if (sessionStorage.getItem(RELOAD_KEY) === marker) {
          update({ status: "reload-skipped", reloadReason: reason || "", reloadSkipped: "already reloaded for this page" });
          return;
        }
        sessionStorage.setItem(RELOAD_KEY, marker);
      } catch {}
      update({ status: "reload-scheduled", reloadScheduled: true, reloadReason: reason || "" });
      setTimeout(() => {
        try { location.reload(); } catch {}
      }, 80);
    };

    const requestAccess = async (reason) => {
      if (typeof document.requestStorageAccess !== "function") {
        update({ status: "unsupported", requestError: "document.requestStorageAccess is unavailable" });
        return false;
      }
      update({ status: "requesting", requested: true, requestReason: reason || "" });
      try {
        await document.requestStorageAccess();
        const hasAccess = await readHasStorageAccess();
        update({ status: "granted", requestResult: "granted", requestError: "", hasStorageAccess: hasAccess });
        reloadOnce(reason || "requestStorageAccess");
        return true;
      } catch (error) {
        update({ status: "request-failed", requestResult: "failed", requestError: error?.message || String(error || "requestStorageAccess failed") });
        return false;
      }
    };

    const armUserGesture = (reason) => {
      if (diag.userGestureArmed || typeof document.requestStorageAccess !== "function") return;
      update({ status: "waiting-for-user-gesture", userGestureArmed: true, userGestureReason: reason || "" });
      const cleanup = () => {
        for (const type of ["click", "pointerup", "touchend", "keydown"]) {
          window.removeEventListener(type, handler, true);
        }
      };
      const handler = (event) => {
        if (!event?.isTrusted) return;
        if (event.type === "keydown" && !["Enter", " ", "Spacebar"].includes(event.key)) return;
        cleanup();
        update({ userGestureArmed: false, status: "user-gesture-received", userGestureType: event.type });
        requestAccess("trusted-user-gesture");
      };
      for (const type of ["click", "pointerup", "touchend", "keydown"]) {
        window.addEventListener(type, handler, true);
      }
    };

    const run = async () => {
      update({ status: "checking" });
      const hasAccess = await readHasStorageAccess();
      const permissionState = await readPermissionState();
      if (hasAccess === true) {
        await requestAccess("has-storage-access");
        return;
      }
      if (permissionState === "granted") {
        await requestAccess("permission-granted");
        return;
      }
      armUserGesture(permissionState || "permission-unknown");
    };

    run().catch((error) => update({ status: "failed", requestError: error?.message || String(error || "storage access bridge failed") }));
  }

  const host = String(location.hostname || "").toLowerCase();
  const framed = (() => {
    try { return window.parent !== window; } catch { return true; }
  })();

  if (host === "gemini.google.com" || host.endsWith(".gemini.google.com")) {
    installGeminiModelPickerBridge();
  }

  if (host === "chat.deepseek.com" || host === "deepseek.com" || host.endsWith(".deepseek.com")) {
    installDeepSeekDeleteBridge();
  }

  if (framed && (host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai"))) {
    installGrokStorageAccessBridge();
  }

  if (framed && (host === "claude.ai" || host.endsWith(".claude.ai"))) {
    try {
      if (location.pathname === "/") location.replace(`/new${location.search}${location.hash}`);
      Object.defineProperty(document, "referrer", { get: () => "" });
      const origins = location.ancestorOrigins;
      if (origins && origins.length) {
        Object.defineProperty(location, "ancestorOrigins", { get: () => ({ length: 0, item: () => null }) });
      }
    } catch {}
  }

  if (framed && (host === "app.notion.com" || host.endsWith(".notion.so"))) {
    const NOTION_SEND_BRIDGE_VERSION = "2026.07.04.1";
    if (window.__CHATCLUB_NOTION_SEND_BRIDGE_VERSION__ === NOTION_SEND_BRIDGE_VERSION) return;
    window.__CHATCLUB_NOTION_SEND_BRIDGE_VERSION__ = NOTION_SEND_BRIDGE_VERSION;
    window.__CHATCLUB_NOTION_SUBMIT_BRIDGE__ = true;
    const NOTION_SEND_TEXT_SOURCE = "chatclub-notion-send-text";
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalize = (value) => String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const compact = (value) => normalize(value).toLowerCase().replace(/\s+/g, "");
    const visible = (el) => {
      if (!el?.getBoundingClientRect) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 4 && rect.height > 4 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    };
    const isDisabled = (el) => {
      if (!el) return true;
      if (el.disabled || el.hasAttribute?.("disabled") || el.hasAttribute?.("data-disabled")) return true;
      const ariaDisabled = String(el.getAttribute?.("aria-disabled") || "").trim().toLowerCase();
      if (ariaDisabled === "true") return true;
      try {
        if (typeof el.matches === "function" && el.matches(":disabled")) return true;
      } catch {}
      return false;
    };
    const labelOf = (el) => normalize([
      el?.getAttribute?.("aria-label"),
      el?.getAttribute?.("title"),
      el?.getAttribute?.("data-testid"),
      el?.getAttribute?.("data-test-id"),
      el?.innerText,
      el?.textContent
    ].filter(Boolean).join(" "));
    const editorText = (editor) => editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement
      ? normalize(editor.value)
      : normalize(editor?.innerText || editor?.textContent || "");
    const promptMatches = (actual, expected) => {
      const a = normalize(actual);
      const b = normalize(expected);
      if (!a || !b) return false;
      if (a === b) return true;
      const compactActual = compact(a);
      const compactExpected = compact(b);
      return Boolean(compactActual && compactExpected && compactActual === compactExpected);
    };
    const findEditor = () => Array.from(document.querySelectorAll("div[contenteditable='true'][role='textbox'],div[contenteditable='true'],textarea"))
      .filter(visible)
      .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null;
    const waitFor = async (check, timeoutMs = 2000, intervalMs = 80) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const result = check();
        if (result) return result;
        await wait(intervalMs);
      }
      return check();
    };
    const selectEditorContents = (editor) => {
      if (!editor || editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) return;
      const selection = window.getSelection?.();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection?.removeAllRanges?.();
      selection?.addRange?.(range);
    };
    const dispatchInput = (editor, value, inputType = "insertText") => {
      try {
        editor.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType,
          data: value
        }));
      } catch {}
      try {
        editor.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          cancelable: false,
          composed: true,
          inputType,
          data: value
        }));
      } catch {
        try { editor.dispatchEvent(new Event("input", { bubbles: true, composed: true })); } catch {}
      }
    };
    const setNativeValue = (editor, value) => {
      const prototype = Object.getPrototypeOf(editor);
      const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "value");
      if (descriptor?.set) descriptor.set.call(editor, value);
      else editor.value = value;
    };
    const escapeHtml = (value) => String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const setEditorText = async (editor, value) => {
      editor?.scrollIntoView?.({ block: "center", inline: "nearest" });
      editor?.focus?.();
      await wait(30);
      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
        setNativeValue(editor, value);
        dispatchInput(editor, value);
        return promptMatches(editorText(editor), value);
      }
      selectEditorContents(editor);
      let inserted = false;
      try { inserted = document.execCommand("insertText", false, value); } catch {}
      dispatchInput(editor, value);
      await wait(90);
      if (promptMatches(editorText(editor), value)) return true;
      selectEditorContents(editor);
      try {
        const html = escapeHtml(value).replace(/\n/g, "<br>");
        inserted = document.execCommand("insertHTML", false, html) || inserted;
      } catch {}
      dispatchInput(editor, value);
      await wait(120);
      return promptMatches(editorText(editor), value) || inserted;
    };
    const countPromptOutsideEditor = (editor, value) => {
      const needle = compact(value);
      if (!needle) return 0;
      let text = "";
      try {
        const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (!parent || editor?.contains?.(parent)) continue;
          if (!normalize(node.nodeValue)) continue;
          text += `\n${node.nodeValue}`;
        }
      } catch {}
      const haystack = compact(text);
      if (!haystack || !haystack.includes(needle)) return 0;
      return haystack.split(needle).length - 1;
    };
    const submitButtons = (editor) => {
      const buttons = Array.from(document.querySelectorAll("button,[role='button']")).filter(visible);
      const exact = buttons.filter((button) => /submit\s+ai\s+message/i.test(labelOf(button)));
      const candidates = exact.length ? exact : buttons.filter((button) => /\b(send|submit)\b|发送|提交/i.test(labelOf(button)));
      const editorRect = editor?.getBoundingClientRect?.();
      return candidates.sort((a, b) => {
        if (!editorRect) return 0;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return Math.abs(ar.top - editorRect.top) - Math.abs(br.top - editorRect.top);
      });
    };
    const findEnabledSubmit = (editor) => submitButtons(editor).find((button) => !isDisabled(button)) || null;
    const clickElement = (el) => {
      const rect = el?.getBoundingClientRect?.();
      const base = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 0,
        buttons: 1,
        clientX: rect ? rect.left + rect.width / 2 : 1,
        clientY: rect ? rect.top + rect.height / 2 : 1
      };
      try {
        if (window.PointerEvent) {
          el.dispatchEvent(new PointerEvent("pointerover", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
          el.dispatchEvent(new PointerEvent("pointermove", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
          el.dispatchEvent(new PointerEvent("pointerdown", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
          el.dispatchEvent(new PointerEvent("pointerup", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 }));
        }
      } catch {}
      try {
        for (const type of ["mouseover", "mousemove", "mousedown", "mouseup", "click"]) {
          el.dispatchEvent(new MouseEvent(type, { ...base, buttons: type === "mouseup" || type === "click" ? 0 : 1 }));
        }
      } catch {}
      try { el.click?.(); } catch {}
    };
    const pressEnter = async (editor) => {
      editor?.focus?.();
      const init = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
      for (const type of ["keydown", "keypress", "keyup"]) {
        try { editor?.dispatchEvent(new KeyboardEvent(type, init)); } catch {}
        await wait(45);
      }
    };
    const submitted = (editor, value, beforeOutsideCount) => {
      if (!promptMatches(editorText(editor), value)) return true;
      return countPromptOutsideEditor(editor, value) > beforeOutsideCount;
    };
    const sendNotionText = async (value) => {
      const text = String(value || "").trim();
      if (!text) return { ok: false, sent: false, method: "notion-bridge", reason: "Prompt is empty" };
      const editor = await waitFor(findEditor, 3000, 100);
      if (!editor) return { ok: false, sent: false, method: "notion-bridge", reason: "Notion AI input element not found" };
      const beforeOutsideCount = countPromptOutsideEditor(editor, text);
      const writeStarted = await setEditorText(editor, text);
      const written = writeStarted && await waitFor(() => promptMatches(editorText(editor), text), 2200, 80);
      if (!written) {
        return { ok: false, sent: false, method: "notion-bridge", reason: "Notion AI input did not receive the prompt" };
      }
      const submit = await waitFor(() => findEnabledSubmit(editor), 2600, 100);
      if (!submit) {
        return { ok: false, sent: false, method: "notion-bridge", reason: "Notion AI submit button stayed disabled" };
      }
      clickElement(submit);
      if (await waitFor(() => submitted(editor, text, beforeOutsideCount), 2600, 100)) {
        return { ok: true, sent: true, method: "notion-bridge-button", verified: true };
      }
      await pressEnter(editor);
      if (await waitFor(() => submitted(editor, text, beforeOutsideCount), 2600, 100)) {
        return { ok: true, sent: true, method: "notion-bridge-enter", verified: true };
      }
      return { ok: false, sent: false, method: "notion-bridge", reason: "Notion AI kept the prompt in the composer after submit" };
    };
    window.addEventListener("chatclub:notion-send-text", async (event) => {
      const id = event.detail?.id || "";
      let data;
      try {
        data = await sendNotionText(event.detail?.text || "");
      } catch (error) {
        data = {
          ok: false,
          sent: false,
          method: "notion-bridge",
          reason: error?.message || String(error || "Notion AI send failed")
        };
      }
      window.postMessage({ source: NOTION_SEND_TEXT_SOURCE, type: "response", id, data }, "*");
    }, true);
    window.addEventListener("chatclub:notion-submit", async (event) => {
      const id = event.detail?.id || "";
      const editor = findEditor();
      let ok = false;
      try {
        editor?.focus?.();
        for (const type of ["keydown", "keypress", "keyup"]) {
          editor?.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }));
          await wait(40);
        }
        ok = true;
      } catch {}
      window.postMessage({ source: "chatclub-notion-submit", type: "response", id, ok }, "*");
    }, true);
  }
})();
