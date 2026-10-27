// ChatClub content runtime (ISOLATED world). Prepended to every isolated capability bundle by the build,
// so each bundle is a self-contained classic script. Safe to evaluate more than once per frame.
(() => {
  if (globalThis.__chatclub) return;
  // Only run inside a ChatClub workspace iframe: never in a top-level tab, never without our marker.
  if (window === window.top) return;
  let params;
  try {
    params = new URLSearchParams(window.name || "");
  } catch {
    return;
  }
  if (!params.has("chatclub_webview")) return;
  const binding = params.get("chatclub_frame_binding") || "";
  if (!/^[0-9a-f]{64}$/.test(binding)) return;

  const runtimeApi = globalThis.chrome?.runtime;
  if (!runtimeApi?.id) return;
  const capabilities = new Map();
  const listeners = new Map();
  const hooks = new Map(); // site adapters register named hooks (e.g. newChatPreprocess)

  const request = (action, payload) =>
    new Promise((resolve) => {
      try {
        runtimeApi.sendMessage({ type: "chatclub.request", action, payload: { binding, ...payload } }, (response) => {
          void runtimeApi.lastError;
          resolve(response);
        });
      } catch {
        resolve(null);
      }
    });

  const api = {
    binding,
    appId: params.get("app") || "",
    params,
    /** Registers the command handlers of one capability. */
    define(capability, commands) {
      capabilities.set(capability, commands || {});
      request("FrameBridge.capabilityReady", { capability, url: location.href });
    },
    has: (capability) => capabilities.has(capability),
    /** Sends an event up to the workspace page (relayed and verified by the background). */
    emit(event, data) {
      return request("FrameBridge.frameEvent", { event, data, url: location.href });
    },
    request,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    fire(event, data) {
      for (const fn of [...(listeners.get(event) ?? [])]) {
        try {
          fn(data);
        } catch (error) {
          console.error("[ChatClub] content listener failed:", error);
        }
      }
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    /** Site adapters plug into generic flows through named hooks. */
    hook(name, fn) {
      if (!hooks.has(name)) hooks.set(name, new Set());
      hooks.get(name).add(fn);
      return () => hooks.get(name)?.delete(fn);
    },
    hasHook: (name) => (hooks.get(name)?.size ?? 0) > 0,
    async runHooks(name, data) {
      const results = [];
      for (const fn of [...(hooks.get(name) ?? [])]) {
        try {
          results.push(await fn(data));
        } catch (error) {
          results.push({ ok: false, error: String(error?.message || error) });
        }
      }
      return results;
    },
  };
  Object.defineProperty(globalThis, "__chatclub", { value: api, configurable: false, enumerable: false, writable: false });

  runtimeApi.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "chatclub.frameCommand") return false;
    // Commands come only from our own background (not from a tab or another extension).
    if (sender.id !== runtimeApi.id || sender.tab) return false;
    if (message.binding !== binding) return false;
    const commands = capabilities.get(message.capability);
    const handler = commands?.[message.command];
    if (typeof handler !== "function") {
      sendResponse({ ok: false, error: `capability "${message.capability}" not loaded` });
      return false;
    }
    Promise.resolve()
      .then(() => handler(message.payload ?? {}, api))
      .then((result) => sendResponse({ ok: true, result }), (error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });

  request("FrameBridge.hello", { url: location.href, title: document.title, appId: params.get("app") || "" });
})();
