// Background (service worker) boot: one set of browser listeners registered synchronously at module
// evaluation, dispatched to plugin background parts (spec §14), plus content-script plan sync (§13.2).

import { PluginHost, FEATURE_DISABLED } from "./host.js";
import { Logger } from "./logger.js";
import { detectEnvironment } from "./environment.js";
import { createChromeStorageAdapter } from "./storage-adapter.js";
import { computeContentPlan, planSignature, CONTENT_SCRIPT_PREFIX } from "./content-plan.js";

/** Classifies a runtime message sender. */
export function senderKind(sender, runtimeId, extensionOrigin) {
  if (!sender || sender.id !== runtimeId) return "foreign";
  const url = sender.url || "";
  if (url.startsWith(extensionOrigin)) return "extensionPage";
  if (sender.tab && typeof sender.frameId === "number") return sender.frameId === 0 ? "chatTab" : "chatFrame";
  return "unknown";
}

/**
 * Collects { "<Plugin>.<action>": { plugin, handler } } from background parts, including aliases.
 * Throws when an action is declared twice.
 */
export function collectHandlers(host) {
  const table = new Map();
  for (const name of host.order) {
    const part = host.plugins[name].background;
    if (!part || typeof part !== "object") continue;
    for (const [action, handler] of Object.entries(part.handlers ?? {})) {
      const full = `${name}.${action}`;
      if (table.has(full)) throw new Error(`Background action "${full}" declared twice`);
      table.set(full, { plugin: name, handler });
    }
    for (const [alias, action] of Object.entries(part.aliases ?? {})) {
      const target = table.get(`${name}.${action}`);
      if (target && !table.has(alias)) table.set(alias, target);
    }
  }
  return table;
}

export async function dispatchRequest(host, table, message, sender, kind) {
  const entry = table.get(message?.action);
  if (!entry) return { ok: false, error: `Unknown action "${message?.action}"` };
  if (!host.isPluginEnabled(entry.plugin) || !host.isStarted(entry.plugin)) return { ok: false, error: FEATURE_DISABLED };
  const { handler } = entry;
  const allowed = handler.sender ? [].concat(handler.sender) : ["extensionPage"];
  if (!allowed.includes(kind)) return { ok: false, error: "sender not allowed" };
  try {
    if (handler.validate && handler.validate(message.payload) !== true) return { ok: false, error: "invalid payload" };
    const result = await handler.handle(message.payload, sender, host.backgroundCtx(entry.plugin));
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

export function bootBackground({
  plugins,
  chromeApi = globalThis.chrome,
  adapter = createChromeStorageAdapter(),
  env = detectEnvironment(),
  isDev = false,
} = {}) {
  const log = new Logger("Background", "#6d5dfc");
  const host = new PluginHost({ context: "background", adapter, env, doc: null, isDev });
  host.registerPlugins(plugins);
  host.backgroundCtx = (name) => host._rt(name)?.ctx ?? null;
  const table = collectHandlers(host);
  const runtimeId = chromeApi?.runtime?.id;
  const extensionOrigin = chromeApi?.runtime?.getURL ? chromeApi.runtime.getURL("") : "";

  // Browser events fan out to plugin parts that declare `on.<eventName>`.
  const fanOut = (eventName, ...args) => {
    for (const name of host.order) {
      const fn = host.plugins[name].background?.on?.[eventName];
      if (typeof fn !== "function" || !host.isStarted(name)) continue;
      try {
        const result = fn(...args, host.backgroundCtx(name));
        result?.catch?.((error) => log.error(`${name} ${eventName} handler failed:`, error));
      } catch (error) {
        log.error(`${name} ${eventName} handler failed:`, error);
      }
    }
  };

  let syncChain = Promise.resolve();
  let lastSignature = null;
  const syncContentPlan = () => {
    syncChain = syncChain.then(async () => {
      const scripting = chromeApi?.scripting;
      if (!scripting?.registerContentScripts) return;
      const hostsFn = host.getService("content.defaultHosts");
      const defaultHosts = typeof hostsFn === "function" ? await hostsFn() : [];
      const plan = computeContentPlan(host, { defaultHosts });
      const signature = planSignature(plan);
      if (signature === lastSignature) return;
      try {
        const registered = await scripting.getRegisteredContentScripts();
        const ours = registered.filter((s) => s.id.startsWith(CONTENT_SCRIPT_PREFIX)).map((s) => s.id);
        if (ours.length) await scripting.unregisterContentScripts({ ids: ours });
        if (plan.length) {
          await scripting.registerContentScripts(plan.map(({ id, js, world, runAt, matches, allFrames }) => ({
            id, js, world, runAt, matches, allFrames, persistAcrossSessions: true,
          })));
        }
        lastSignature = signature;
        host.events.dispatch("contentPlanChanged", { plan });
      } catch (error) {
        log.error("Updating content scripts failed:", error);
      }
    });
    return syncChain;
  };
  host.syncContentPlan = syncContentPlan;
  host.currentContentPlan = async () => {
    const hostsFn = host.getService("content.defaultHosts");
    return computeContentPlan(host, { defaultHosts: typeof hostsFn === "function" ? await hostsFn() : [] });
  };

  const ready = (async () => {
    try {
      await host.initSettings();
      host.initPluginManager();
      await host.startPhase("init");
    } catch (error) {
      log.error("Background start-up failed:", error);
    }
    host.events.subscribe("configReloaded", () => syncContentPlan());
    host.events.subscribe("pluginToggle", () => syncContentPlan());
    await syncContentPlan();
  })();
  host.ready = ready;

  // ---- synchronous listener registration (MV3) ----
  chromeApi?.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    if (message.type === "chatclub.syncContentPlan") {
      ready.then(syncContentPlan).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message.type !== "chatclub.request") return false;
    const kind = senderKind(sender, runtimeId, extensionOrigin);
    if (kind === "foreign") return false;
    ready
      .then(() => dispatchRequest(host, table, message, sender, kind))
      .then(sendResponse, (error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });
  chromeApi?.alarms?.onAlarm?.addListener((alarm) => {
    ready.then(() => {
      // Plugins name their alarms "<Plugin>.<name>" or list fixed names in `background.alarms`.
      const owner = host.order.find((name) => host.plugins[name]?.background?.alarms?.includes?.(alarm.name)) ?? alarm.name.split(".")[0];
      const fn = host.plugins[owner]?.background?.onAlarm;
      if (typeof fn === "function" && host.isStarted(owner)) {
        Promise.resolve(fn(alarm, host.backgroundCtx(owner))).catch((error) => log.error(`${owner} alarm failed:`, error));
      }
    });
  });
  const relay = (target, eventName) => target?.addListener?.((...args) => ready.then(() => fanOut(eventName, ...args)));
  relay(chromeApi?.tabs?.onRemoved, "tabRemoved");
  relay(chromeApi?.tabs?.onUpdated, "tabUpdated");
  relay(chromeApi?.webNavigation?.onCommitted, "navigationCommitted");
  relay(chromeApi?.webNavigation?.onCompleted, "navigationCompleted");
  relay(chromeApi?.runtime?.onInstalled, "installed");
  relay(chromeApi?.runtime?.onStartup, "startup");
  relay(chromeApi?.action?.onClicked, "actionClicked");
  relay(chromeApi?.commands?.onCommand, "command");
  relay(chromeApi?.cookies?.onChanged, "cookieChanged");

  return host;
}
