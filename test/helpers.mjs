import { JSDOM } from "jsdom";
import { PluginHost } from "../src/kernel/host.js";
import { Logger } from "../src/kernel/logger.js";
import { createMemoryStorageAdapter } from "../src/kernel/storage-adapter.js";

export function captureLogs() {
  const logs = [];
  Logger.setSink((entry) => logs.push({ ...entry, text: entry.args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ") }));
  return {
    logs,
    has(level, pattern) {
      return logs.some((l) => l.level === level && pattern.test(l.text));
    },
    restore() {
      Logger.setSink(null);
    },
  };
}

export function makeDom() {
  return new JSDOM("<!doctype html><html><head></head><body></body></html>").window;
}

export async function makeHost({ plugins = [], env = { chromium: true, debugger: true }, shared, doc, isDev = true } = {}) {
  const adapter = createMemoryStorageAdapter(shared);
  const host = new PluginHost({ context: "app", adapter, env, doc: doc ?? makeDom().document, isDev });
  host.registerPlugins(plugins);
  await host.initSettings();
  host.initPluginManager();
  return { host, adapter };
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
