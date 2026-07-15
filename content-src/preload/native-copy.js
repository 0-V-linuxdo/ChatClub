export function installNativeCopyBridge(runtimes, copySource) {
  const NATIVE_COPY_BRIDGE_VERSION = copySource.split(":").at(-1);
  const runtimeName = "native-copy-bridge";
  const existing = runtimes.registration(runtimeName);
  if (existing?.version === NATIVE_COPY_BRIDGE_VERSION) {
    window.__CHATCLUB_NATIVE_COPY_BRIDGE__ = existing.api;
    window.__CHATCLUB_NATIVE_COPY_BRIDGE_VERSION__ = NATIVE_COPY_BRIDGE_VERSION;
    return;
  }
  runtimes.invalidate(runtimeName, `replaced by ${NATIVE_COPY_BRIDGE_VERSION}`);
  window.__CHATCLUB_NATIVE_COPY_BRIDGE_VERSION__ = NATIVE_COPY_BRIDGE_VERSION;
  const captures = new Map();
  const replacements = [];
  let hooksInstalled = false;
  let clipboardProxyInstalled = false;
  const replaceValue = (target, key, value) => {
    const previous = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, writable: true, value });
    replacements.push({ target, key, previous, value });
  };
  const replaceGetter = (target, key, get) => {
    const previous = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: previous?.enumerable ?? true,
      get
    });
    replacements.push({ target, key, previous, get });
  };
  const restoreReplacements = () => {
    for (const record of replacements.reverse()) {
      try {
        const current = Object.getOwnPropertyDescriptor(record.target, record.key);
        const stillOwned = record.value ? current?.value === record.value : current?.get === record.get;
        if (!stillOwned) continue;
        if (record.previous) Object.defineProperty(record.target, record.key, record.previous);
        else delete record.target[record.key];
      } catch {}
    }
    replacements.length = 0;
  };
  const post = (type, action, data) => {
    try {
      window.postMessage({ source: copySource, type, id: action.id, action: action.action, data }, "*");
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
      if (original.__CHATCLUB_NATIVE_COPY_WRAPPED_VERSION__ === NATIVE_COPY_BRIDGE_VERSION) return true;
      const wrapped = function (...args) {
        const id = activeCaptureId();
        if (id) {
          captureClipboardValue(id, args[0], handlesItems);
          return Promise.resolve();
        }
        return original.apply(this && this !== window ? this : target, args);
      };
      wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED__ = true;
      wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED_VERSION__ = NATIVE_COPY_BRIDGE_VERSION;
      replaceValue(target, key, wrapped);
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
      if (original.__CHATCLUB_NATIVE_COPY_WRAPPED_VERSION__ === NATIVE_COPY_BRIDGE_VERSION) return true;
      const wrapped = function (...args) {
        const id = activeCaptureId();
        if (id) {
          const priority = mimePriority(args[0]);
          if (priority) captureText(id, args[1], priority);
          return undefined;
        }
        return original.apply(this, args);
      };
      wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED__ = true;
      wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED_VERSION__ = NATIVE_COPY_BRIDGE_VERSION;
      replaceValue(proto, "setData", wrapped);
      return true;
    } catch {
      return false;
    }
  };
  const dispatchSyntheticCopyEvent = () => {
    try {
      const init = { bubbles: true, cancelable: true };
      let event = null;
      try {
        const transfer = typeof DataTransfer === "function" ? new DataTransfer() : undefined;
        event = new ClipboardEvent("copy", { ...init, clipboardData: transfer });
      } catch {
        event = new Event("copy", init);
      }
      const target = document.activeElement || document;
      target.dispatchEvent(event);
      return true;
    } catch {
      return false;
    }
  };
  const wrapExecCommand = () => {
    try {
      const original = document.execCommand;
      if (typeof original !== "function") return false;
      if (original.__CHATCLUB_NATIVE_COPY_WRAPPED_VERSION__ === NATIVE_COPY_BRIDGE_VERSION) return true;
      const wrapped = function (...args) {
        const id = activeCaptureId();
        const command = String(args[0] || "").toLowerCase();
        if (id && command === "copy") {
          const before = selectedText();
          if (before) captureText(id, before, 3);
          const result = dispatchSyntheticCopyEvent();
          const after = selectedText();
          if (after) captureText(id, after, 4);
          return result || Boolean(after || before);
        }
        return original.apply(document, args);
      };
      wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED__ = true;
      wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED_VERSION__ = NATIVE_COPY_BRIDGE_VERSION;
      replaceValue(document, "execCommand", wrapped);
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
        if (clipboard && !clipboardProxyInstalled) {
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
              replaceGetter(target, "clipboard", () => proxy);
              installed = true;
              clipboardProxyInstalled = true;
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
    try { event?.preventDefault?.(); } catch {}
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

  const messageListener = (event) => {
    const message = event.data;
    if (message?.source !== copySource || message.type !== "request") return;
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
  };
  window.addEventListener("message", messageListener, true);
  const api = Object.freeze({ version: NATIVE_COPY_BRIDGE_VERSION });
  window.__CHATCLUB_NATIVE_COPY_BRIDGE__ = api;
  runtimes.register(runtimeName, {
    version: NATIVE_COPY_BRIDGE_VERSION,
    api,
    dispose() {
      window.removeEventListener("copy", copyEventCapture, true);
      window.removeEventListener("copy", copyEventCapture, false);
      window.removeEventListener("message", messageListener, true);
      for (const record of captures.values()) {
        if (record?.timer) clearTimeout(record.timer);
      }
      captures.clear();
      restoreReplacements();
      if (window.__CHATCLUB_NATIVE_COPY_BRIDGE__ === api) delete window.__CHATCLUB_NATIVE_COPY_BRIDGE__;
      if (window.__CHATCLUB_NATIVE_COPY_BRIDGE_VERSION__ === NATIVE_COPY_BRIDGE_VERSION) {
        delete window.__CHATCLUB_NATIVE_COPY_BRIDGE_VERSION__;
      }
    }
  });
}
