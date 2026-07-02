(() => {
  const COPY_SOURCE = "chatclub-native-copy";
  const GEMINI_MODEL_PICKER_SOURCE = "chatclub-gemini-model-picker";
  const DEEPSEEK_DELETE_SOURCE = "chatclub-deepseek-delete-thread";

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
    if (window.__CHATCLUB_DEEPSEEK_DELETE_BRIDGE__) return;

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
        return el?.closest?.("button,[role='button'],[role='menuitem'],a[href],[tabindex]:not([tabindex='-1']),[class*='button' i]") || el || null;
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
    const activate = (node, handlerNames) => {
      const target = closestClickable(node);
      if (!target || disabled(target)) return false;
      try { target.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
      return invokeReact(target, handlerNames) || dispatchPointer(target);
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
    const findTopicMoreButton = (link) => {
      if (!link) return null;
      hoverTopic(link);
      const linkRect = rectOf(link);
      if (!linkRect) return null;
      const candidates = [];
      const seen = new Set();
      const add = (node, extra = 0) => {
        const target = closestClickable(node);
        if (!target || seen.has(target) || target === link || disabled(target)) return;
        const rect = rectOf(target);
        if (!rect || rect.width > 80 || rect.height > 80) return;
        const overlaps = rect.top < linkRect.bottom + 8 && rect.bottom > linkRect.top - 8;
        const nearRight = rect.left >= linkRect.right - 120 && rect.left <= linkRect.right + 80;
        if (!overlaps || !nearRight) return;
        const value = compact(textOf(target));
        if (value && !/more|menu|options|ellipsis|dots|更多|菜单|选项/.test(value)) return;
        seen.add(target);
        candidates.push({
          element: target,
          score: extra + (visible(target) ? 180 : 40) + (!value ? 180 : 0) + Math.max(0, 100 - Math.abs(rect.right - linkRect.right)),
          right: rect.right
        });
      };
      for (const node of all("button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1']),[class*='button' i]", link)) add(node, 260);
      for (const offset of [8, 18, 30, 44, 64, 88]) {
        try {
          const pointTarget = document.elementFromPoint(Math.max(linkRect.left + 8, linkRect.right - offset), linkRect.top + linkRect.height / 2);
          if (pointTarget) add(pointTarget, 180 - offset);
        } catch {}
      }
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
    const deleteThread = async () => {
      const existingConfirm = await clickExistingConfirm();
      if (existingConfirm) return existingConfirm;
      const link = currentTopicLink();
      if (!link) return { ok: false, reason: "current topic row not found" };
      const trigger = await waitFor(() => findTopicMoreButton(link), 1800, 80);
      if (!trigger) return { ok: false, reason: "topic menu trigger not found" };
      if (!activate(trigger, ["onClick", "onPointerUp", "onMouseUp", "onPointerDown", "onMouseDown"])) {
        return { ok: false, reason: "topic menu trigger click failed" };
      }
      const deleteItem = await waitFor(findDeleteMenuItem, 3000, 90);
      if (!deleteItem) return { ok: false, reason: "delete menu item not found" };
      if (!activate(deleteItem, ["onClick", "onPointerUp", "onMouseUp"])) {
        return { ok: false, reason: "delete menu item click failed" };
      }
      const confirmButton = await waitFor(findConfirmButton, 4200, 100);
      if (!confirmButton) return { ok: false, reason: "delete confirmation button not found" };
      if (!activate(confirmButton, ["onClick", "onPointerUp", "onMouseUp"])) {
        return { ok: false, reason: "delete confirmation click failed" };
      }
      const closed = await waitFor(confirmGone, 6200, 140);
      return closed ? { ok: true } : { ok: false, reason: "delete confirmation did not close" };
    };

    window.__CHATCLUB_DEEPSEEK_DELETE_BRIDGE__ = { deleteThread };
    window.addEventListener("message", async (event) => {
      const message = event.data;
      if (message?.source !== DEEPSEEK_DELETE_SOURCE || message.type !== "request" || message.action !== "deleteThread") return;
      let result;
      try {
        result = await deleteThread();
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
    if (window.__CHATCLUB_NOTION_SUBMIT_BRIDGE__) return;
    window.__CHATCLUB_NOTION_SUBMIT_BRIDGE__ = true;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (el) => {
      if (!el?.getBoundingClientRect) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 4 && rect.height > 4 && style.display !== "none" && style.visibility !== "hidden";
    };
    const findEditor = () => Array.from(document.querySelectorAll("div[contenteditable='true'][role='textbox'],div[contenteditable='true'],textarea"))
      .filter(visible)
      .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null;
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
