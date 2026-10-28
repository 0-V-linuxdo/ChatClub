// FrameBridge (page): creates frame identities, routes commands through the background, and turns
// verified frame events into bus events ("frameRegistered", "Frames:<event>").

function randomHex(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async start(ctx) {
    const expected = new Map(); // binding -> { appId, iframe, registered, capabilities:Set, url }
    let myTabId = null;
    try {
      myTabId = (await chrome.tabs.getCurrent())?.id ?? null;
    } catch {
      myTabId = null;
    }

    const onMessage = (message, sender) => {
      if (!message || message.type !== "chatclub.frameEvent") return;
      if (sender.id !== chrome.runtime.id || sender.tab) return; // only from our background
      if (myTabId !== null && message.tabId !== myTabId) return;
      const rec = expected.get(message.binding);
      if (!rec) return;
      const frameKey = message.binding;
      if (message.event === "hello") {
        rec.registered = true;
        // Capabilities announced by this same document before the hello was relayed are kept.
        rec.capabilities = new Set(Array.isArray(message.data?.capabilities) ? message.data.capabilities : []);
        if (message.data?.url) rec.url = message.data.url;
        ctx.events.emit("frameRegistered", { frameKey, appId: rec.appId, url: rec.url });
        pushForwardCombos(frameKey);
        return;
      }
      if (message.event === "capability") {
        rec.capabilities.add(message.data?.capability);
        ctx.events.emit("Frames:capability", { frameKey, appId: rec.appId, capability: message.data?.capability });
        return;
      }
      if (message.event === "location" && message.data?.href) rec.url = message.data.href;
      if (message.event === "keydown") {
        ctx.events.emit("Frames:keydown", { frameKey, event: { ...message.data, isComposing: false, repeat: false } });
        return;
      }
      if (message.event === "userClick") ctx.events.emit("Frames:userClickedFrame", { frameKey, appId: rec.appId });
      ctx.events.emit(`Frames:${message.event}`, { frameKey, appId: rec.appId, ...(message.data ?? {}) });
    };
    chrome.runtime.onMessage.addListener(onMessage);
    ctx.onDispose(() => chrome.runtime.onMessage.removeListener(onMessage));

    /** Injects the bundles of enabled capabilities into an already-loaded frame (no reload needed). */
    const reinject = async (frameKey) => {
      const plan = await ctx.background.request("contentPlan", {});
      for (const entry of plan) {
        if (expected.get(frameKey)?.capabilities?.has(entry.capability)) continue;
        await ctx.background.request("inject", { binding: frameKey, files: entry.js, world: entry.world }).catch(() => {});
      }
    };
    // A frame can load before the background registers a just-enabled plugin's bundle; inject it on first use.
    const ensureCapability = async (frameKey, capability) => {
      const rec = expected.get(frameKey);
      if (!rec?.registered || capability === "base" || rec.capabilities.has(capability)) return;
      await reinject(frameKey).catch(() => {});
      for (let i = 0; i < 15 && !expected.get(frameKey)?.capabilities?.has(capability); i += 1) await new Promise((r) => setTimeout(r, 100));
    };

    const send = async (frameKey, { capability, command, payload }, spec = {}) => {
      if (!expected.has(frameKey)) throw new Error("unknown frame");
      await ensureCapability(frameKey, capability);
      return ctx.background.request("send", { binding: frameKey, capability, command, payload, timeoutMs: spec.timeoutMs });
    };

    const pushForwardCombos = (frameKey) => {
      const shortcuts = ctx.services.get("shortcuts");
      const combos = shortcuts?.activeCombos?.() ?? [];
      send(frameKey, { capability: "base", command: "setForwardCombos", payload: { combos } }, { timeoutMs: 1500 }).catch(() => {});
    };
    ctx.events.on("Shortcuts:changed", () => {
      for (const [key, rec] of expected) if (rec.registered) pushForwardCombos(key);
    });

    const transport = {
      send,
      list: () => [...expected.entries()].map(([frameKey, rec]) => ({ frameKey, appId: rec.appId, url: rec.url, registered: rec.registered, capabilities: [...(rec.capabilities ?? [])] })),
    };
    ctx.services.provide("frames.transport", transport);
    ctx.services.provide("frames", {
      /** Creates an identity for a new chat iframe; returns { frameKey, name }. */
      createIdentity(appId, extraParams = {}) {
        const binding = randomHex(32);
        const contributed = {};
        for (const entry of ctx.extensionPoint("frame.identityParams").sorted()) {
          try {
            Object.assign(contributed, entry.params?.(appId) ?? {});
          } catch (error) {
            ctx.logger.warn(`Identity params "${entry.id}" failed:`, error);
          }
        }
        const params = new URLSearchParams({ chatclub_webview: "", ua: navigator.userAgent, ssc: "1", app: appId, chatclub_frame_binding: binding, ...contributed, ...extraParams });
        expected.set(binding, { appId, iframe: null, registered: false, capabilities: new Set(), url: "" });
        return { frameKey: binding, name: params.toString() };
      },
      attach(frameKey, iframe) {
        const rec = expected.get(frameKey);
        if (rec) rec.iframe = iframe;
      },
      release(frameKey) {
        if (!expected.delete(frameKey)) return;
        ctx.background.request("forget", { binding: frameKey }).catch(() => {});
        ctx.events.emit("frameUnloaded", { frameKey });
      },
      markUnloaded(frameKey) {
        const rec = expected.get(frameKey);
        if (!rec) return;
        rec.registered = false;
        rec.capabilities = new Set();
        ctx.events.emit("frameUnloaded", { frameKey, appId: rec.appId, url: rec.url });
      },
      isRegistered: (frameKey) => !!expected.get(frameKey)?.registered,
      hasCapability: (frameKey, cap) => !!expected.get(frameKey)?.capabilities?.has(cap),
      lastUrl: (frameKey) => expected.get(frameKey)?.url ?? "",
      appIdOf: (frameKey) => expected.get(frameKey)?.appId ?? null,
      prepare: async (url) => {
        const result = await ctx.host.requestBackground("NetRules", "prepareFrame", { url });
        // Grok / Manus: mirror the login cookies into the iframe partition before the first load (05 §6.2).
        if (ctx.host.isPluginEnabled?.("CookieBridge")) await ctx.host.requestBackground("CookieBridge", "cookiePreflight", { url }).catch(() => null);
        return result;
      },
      reinject,
      tabId: () => myTabId,
    });
    ctx.services.provide("frames.reloadAll", () => {
      for (const rec of expected.values()) {
        try {
          if (rec.iframe?.isConnected) rec.iframe.src = rec.url || rec.iframe.src;
        } catch {
          // Cross-origin frames can still be re-pointed via src.
        }
      }
    });
  },
};
