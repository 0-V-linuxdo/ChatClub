export function installNotionEventListeners(options = {}) {
  const listenerOptions = { capture: true, signal: options.signal };
  window.addEventListener(options.textEvent, async (event) => {
    const id = event.detail?.id || "";
    let data;
    try {
      data = await options.sendText(event.detail || {});
    } catch (error) {
      data = {
        ok: false,
        sent: false,
        method: "notion-bridge",
        reason: error?.message || String(error || "Notion AI send failed")
      };
    }
    window.postMessage({ source: options.textSource, type: "response", id, data }, "*");
  }, listenerOptions);
  window.addEventListener(options.promptEvent, async (event) => {
    const id = event.detail?.id || "";
    let data;
    try {
      data = await options.sendPrompt(event.detail || {});
    } catch (error) {
      data = {
        ok: false,
        sent: false,
        method: "notion-prompt-bridge",
        reason: error?.message || String(error || "Notion AI prompt send failed")
      };
    }
    window.postMessage({ source: options.promptSource, type: "response", id, data }, "*");
  }, listenerOptions);
  window.addEventListener("chatclub:notion-submit", async (event) => {
    const id = event.detail?.id || "";
    const editor = options.findEditor();
    let ok = false;
    try {
      editor?.focus?.();
      for (const type of ["keydown", "keypress", "keyup"]) {
        editor?.dispatchEvent(new KeyboardEvent(type, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true
        }));
        await options.wait(40);
      }
      ok = true;
    } catch {}
    window.postMessage({ source: "chatclub-notion-submit", type: "response", id, ok }, "*");
  }, listenerOptions);
}
