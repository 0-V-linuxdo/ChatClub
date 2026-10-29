// User plugin sandbox (UserPlugins): a sandboxed extension page, one per running plugin. The plugin's
// code runs here with `new Function`; everything it can do goes to the app page as a postMessage call
// that the app checks against the plugin's grants. Classic script: the sandbox has an opaque origin.
(() => {
  "use strict";
  const parentWin = window.parent;
  const pending = new Map();
  const callbacks = new Map();
  const stopHandlers = [];
  let seq = 0;

  const post = (msg) => parentWin.postMessage({ chatclubSandbox: true, ...msg }, "*");
  const call = (method, ...args) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      post({ type: "call", id, method, args });
    });
  const callback = (fn) => {
    if (typeof fn !== "function") return null;
    const id = ++seq;
    callbacks.set(id, fn);
    return { __cb: id };
  };
  const describe = (error) => String(error && error.stack ? error.stack : error);

  function buildApi(meta) {
    return Object.freeze({
      meta: Object.freeze({ ...meta }),
      log: (...args) => call("log", args.map((a) => (typeof a === "string" ? a : safeJson(a)))),
      notify: (message, type) => call("notify", String(message), type),
      onStop: (fn) => {
        if (typeof fn === "function") stopHandlers.push(fn);
      },
      storage: Object.freeze({
        get: (key) => call("storage.get", key),
        set: (key, value) => call("storage.set", key, value),
        remove: (key) => call("storage.remove", key),
        keys: () => call("storage.keys"),
      }),
      css: Object.freeze({
        add: (cssText) => call("css.add", String(cssText)),
        remove: (id) => call("css.remove", id),
      }),
      topbar: Object.freeze({
        addButton: ({ id, label, icon, onClick } = {}) => call("topbar.addButton", { id, label, icon }, callback(onClick)),
        remove: (id) => call("topbar.remove", id),
      }),
      shortcuts: Object.freeze({
        add: ({ id, label, run } = {}) => call("shortcuts.add", { id, label }, callback(run)),
        remove: (id) => call("shortcuts.remove", id),
      }),
      composer: Object.freeze({
        getText: () => call("composer.getText"),
        setText: (text) => call("composer.setText", String(text ?? "")),
        insert: (text) => call("composer.insert", String(text ?? "")),
        send: (text) => call("composer.send", text === undefined ? undefined : String(text)),
      }),
      workspace: Object.freeze({
        tabs: () => call("workspace.tabs"),
        currentUrl: () => call("workspace.currentUrl"),
        open: (url, tabId) => call("workspace.open", String(url), tabId),
        refresh: (tabId) => call("workspace.refresh", tabId),
      }),
      on: (event, fn) => {
        const handle = callback(fn);
        const ready = call("events.on", String(event), handle);
        return () => ready.then((subId) => call("events.off", subId)).catch(() => {});
      },
      fetch: (url, init) => call("fetch", String(url), init ? { method: init.method, headers: init.headers, body: typeof init.body === "string" ? init.body : undefined } : undefined),
    });
  }

  function safeJson(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== parentWin) return;
    const msg = event.data;
    if (!msg || msg.chatclubHost !== true) return;
    if (msg.type === "result") {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.value);
      else p.reject(new Error(msg.error || "Call failed"));
    } else if (msg.type === "invoke") {
      const fn = callbacks.get(msg.cb);
      if (!fn) return;
      try {
        await fn(...(msg.args || []));
      } catch (error) {
        post({ type: "error", error: describe(error) });
      }
    } else if (msg.type === "init") {
      try {
        const AsyncFunction = (async () => {}).constructor;
        const run = new AsyncFunction("chatclub", `"use strict";\n${msg.code}\n//# sourceURL=chatclub-user-plugin/${encodeURIComponent(msg.meta.name)}.js`);
        await run(buildApi(msg.meta));
        post({ type: "started" });
      } catch (error) {
        post({ type: "started", error: describe(error) });
      }
    } else if (msg.type === "stop") {
      for (const fn of stopHandlers.splice(0)) {
        try {
          await fn();
        } catch (error) {
          post({ type: "error", error: describe(error) });
        }
      }
      post({ type: "stopped" });
    }
  });

  window.addEventListener("error", (event) => post({ type: "error", error: describe(event.error || event.message) }));
  window.addEventListener("unhandledrejection", (event) => post({ type: "error", error: describe(event.reason) }));
  post({ type: "ready" });
})();
