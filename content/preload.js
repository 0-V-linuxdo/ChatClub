(() => {
  const COPY_SOURCE = "chatclub-native-copy";
  const GEMINI_MODEL_PICKER_SOURCE = "chatclub-gemini-model-picker";

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
