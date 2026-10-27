// App-context boot sequence (spec §7.1) and the debug global (spec §17).

import { PluginHost } from "./host.js";
import { Logger } from "./logger.js";
import { detectEnvironment } from "./environment.js";
import { createChromeStorageAdapter } from "./storage-adapter.js";

export function createRuntimeMessaging(runtime = globalThis.chrome?.runtime) {
  return {
    async sendRuntime(message) {
      if (!runtime?.sendMessage) throw new Error("chrome.runtime is not available");
      return runtime.sendMessage(message);
    },
  };
}

function defineGlobal(win, host) {
  const api = {
    get plugins() {
      return host.plugins;
    },
    isPluginEnabled: (name) => host.isPluginEnabled(name),
    startPlugin: (name) => host.startPlugin(name),
    stopPlugin: (name) => host.stopPlugin(name),
    togglePlugin: (name) => host.togglePlugin(name),
    get Settings() {
      return host.settings.store;
    },
    get PlainSettings() {
      return host.settings.plain;
    },
    get PlainOptions() {
      return host.settings.optionsPlain;
    },
    events: {
      subscribe: (event, fn) => host.events.subscribe(event, fn),
      dispatch: (event, data) => host.events.dispatch(event, data),
    },
    registerStyle: (id, css) => host.styles?.register(id, css),
    enableStyle: (id) => host.styles?.enable(id) ?? false,
    disableStyle: (id) => host.styles?.disable(id) ?? false,
    unregisterStyle: (id) => host.styles?.unregister(id) ?? false,
    toast: (...args) => host.getService("ui")?.toast(...args) ?? (new Logger("UI").warn("toast() before shell ready; ignored"), null),
    showNotice: (...args) => host.getService("ui")?.showNotice(...args),
    openModal: (...args) => host.getService("ui")?.openModal(...args),
    openPluginSettings: (name) => host.getService("pluginsUI")?.openPluginSettings(name),
    frames: {
      send: (frameKey, command, payload) => host.sendFrameCommand(frameKey, command, payload),
      list: () => host.getService("frames.transport")?.list?.() ?? [],
    },
    extensionPoints: host.extensionPoints,
    statePorts: host.statePorts,
    Logger,
    host,
  };
  Object.defineProperty(win, "ChatClub", { value: Object.freeze(api), writable: false, configurable: true, enumerable: false });
  return api;
}

/**
 * Boots the plugin host in an extension page. Returns the host, or null when another
 * instance already runs in this window (spec §17 / AC-12).
 */
export async function bootApp({
  plugins,
  win = globalThis.window,
  doc = globalThis.document,
  adapter = createChromeStorageAdapter(),
  env = detectEnvironment(),
  messaging = createRuntimeMessaging(),
  isDev = false,
  workspaceReadyFallbackMs,
} = {}) {
  const log = new Logger("Boot", "#6d5dfc");
  if (win && Object.prototype.hasOwnProperty.call(win, "ChatClub")) {
    log.warn("ChatClub is already running in this page; not starting a second instance");
    return null;
  }
  const host = new PluginHost({ context: "app", adapter, env, doc, messaging, isDev });
  if (win) defineGlobal(win, host);

  const step = async (label, fn) => {
    try {
      await fn();
    } catch (error) {
      log.error(`Boot step "${label}" failed:`, error);
    }
  };

  await step("preload", () => host.settings.preloadSync());
  await step("register", () => host.registerPlugins(plugins));
  // Background computes the injection plan from the same definitions; just nudge it.
  await step("content", () => {
    messaging?.sendRuntime({ type: "chatclub.syncContentPlan" })?.catch?.(() => {});
  });
  await step("settings", () => host.initSettings());
  await step("manager", () => host.initPluginManager());
  await step("init", () => host.startPhase("init"));

  let domReadyDone;
  host.domReadyPromise = new Promise((resolve) => (domReadyDone = resolve));
  const runDomReady = () => step("domReady", () => host.startPhase("domReady")).then(domReadyDone);
  if (!doc || doc.readyState !== "loading") await runDomReady();
  else doc.addEventListener("DOMContentLoaded", runDomReady, { once: true });

  const originalFire = host.fireWorkspaceReady.bind(host);
  host.fireWorkspaceReady = async () => {
    await host.domReadyPromise;
    return originalFire();
  };
  host.armWorkspaceReadyFallback(workspaceReadyFallbackMs);

  if (win?.addEventListener) {
    const flush = () => host.settings.flushNow();
    win.addEventListener("pagehide", flush);
    win.addEventListener("beforeunload", flush);
  }
  return host;
}
