// Copy bridge (MAIN world, document_start; v2 04 §1.5). While a copy is "installed", every way the page
// writes the clipboard is observed and the text is reported to the isolated world. Writes still happen.
(() => {
  if (window === window.top || window.__chatclubCopyBridge) return;
  let params;
  try {
    params = new URLSearchParams(window.name || "");
  } catch {
    return;
  }
  if (!params.has("chatclub_webview") || !/^[0-9a-f]{64}$/.test(params.get("chatclub_frame_binding") || "")) return;
  Object.defineProperty(window, "__chatclubCopyBridge", { value: true });

  const CHANNEL = "chatclub:copybridge:v1";
  let active = null; // id of the copy in progress

  const priorityOf = (type) => {
    const t = String(type || "text/plain").toLowerCase();
    if (t === "text/plain" || t === "text" || t === "string") return 3;
    if (/uri|url/.test(t)) return 1;
    if (t.startsWith("text/")) return 2;
    return 0;
  };
  const report = (text, type) => {
    if (!active || typeof text !== "string" || !text) return;
    const priority = priorityOf(type);
    if (!priority) return;
    try {
      window.dispatchEvent(new CustomEvent(`${CHANNEL}:captured`, { detail: JSON.stringify({ id: active, text, priority }) }));
    } catch {
      // ignore
    }
  };

  const clip = navigator.clipboard;
  if (clip) {
    const proto = Object.getPrototypeOf(clip);
    const writeText = proto.writeText;
    if (typeof writeText === "function") {
      proto.writeText = function (text) {
        report(String(text), "text/plain");
        return writeText.call(this, text);
      };
    }
    const write = proto.write;
    if (typeof write === "function") {
      proto.write = function (items) {
        if (active) {
          for (const item of items ?? []) {
            for (const type of item?.types ?? []) {
              if (priorityOf(type) === 0) continue;
              Promise.resolve(item.getType(type)).then((blob) => blob?.text?.()).then((text) => report(text, type), () => {});
            }
          }
        }
        return write.call(this, items);
      };
    }
  }
  const setData = DataTransfer.prototype.setData;
  DataTransfer.prototype.setData = function (type, data) {
    report(String(data), type);
    return setData.call(this, type, data);
  };
  const execCommand = Document.prototype.execCommand;
  Document.prototype.execCommand = function (command, ...rest) {
    if (active && String(command).toLowerCase() === "copy") {
      // A selection-based copy: what is selected is what lands in the clipboard.
      try {
        const sel = String(document.getSelection?.() ?? "");
        if (sel) report(sel, "text/plain");
      } catch {
        // ignore
      }
    }
    return execCommand.call(this, command, ...rest);
  };

  window.addEventListener(CHANNEL, (event) => {
    let msg;
    try {
      msg = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (msg?.op === "install" && typeof msg.id === "string") active = msg.id;
    else if (msg?.op === "restore" && msg.id === active) active = null;
  });
})();
