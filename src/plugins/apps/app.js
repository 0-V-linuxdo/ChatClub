// Apps: the chat app registry used by the workspace, composer and site plugins.

import { BUILTIN_APPS, mergeApps, hostMatches, normalizeCustomConfig } from "./catalog.js";
import { resolveIframeAttributes } from "./iframe-config.js";

const CUSTOM_KEY = "customConfig";

export default {
  async start(ctx) {
    const point = ctx.extensionPoint("chatApp");
    let custom = [];
    let apps = [];
    const rebuild = () => {
      apps = mergeApps(BUILTIN_APPS, custom, ctx.settings.builtinChatAppOrder);
      // Keep the chatApp extension point equal to the catalog so other plugins can subscribe to it.
      const ids = new Set(apps.map((a) => a.id));
      for (const entry of point.sorted()) if (entry.pluginName === "Apps" && !ids.has(entry.id)) point.delete(entry.id);
      apps.forEach((app, order) => ctx.contribute("chatApp", { ...app, order }));
      ctx.events.emit("Apps:changed", { apps });
    };
    const load = async (raw) => {
      custom = normalizeCustomConfig(raw);
      // Records that had no id got one; store it so it stays stable.
      if (Array.isArray(raw) && custom.some((app, i) => raw[i]?.id !== app.id)) await ctx.storage.set(CUSTOM_KEY, custom);
    };
    try {
      await load(await ctx.storage.get(CUSTOM_KEY));
    } catch (error) {
      ctx.logger.warn("Reading custom platforms failed:", error);
    }
    rebuild();
    ctx.storage.onChanged?.(CUSTOM_KEY, async (value) => {
      await load(value);
      rebuild();
    });
    ctx.onDispose(ctx.plugin.settings.use(["builtinChatAppOrder"], rebuild));
    ctx.onDispose(ctx.plugin.settings.use(["builtinChatAppIframeConfigs", "appIcons"], () => ctx.events.emit("Apps:changed", { apps, attributes: true })));

    const get = (id) => apps.find((a) => a.id === id) ?? null;
    const iframeConfigFor = (id) => {
      const app = get(id);
      if (!app) return null;
      return (app.builtin ? ctx.settings.builtinChatAppIframeConfigs?.[id] : app.iframeConfig) ?? null;
    };
    const customList = () => custom.map((app) => ({ ...app }));
    const saveCustom = (list) => ctx.storage.set(CUSTOM_KEY, normalizeCustomConfig(list));

    ctx.contribute("dataTransfer", {
      id: "customConfig",
      labelKey: "apps.transfer",
      check: (data) => {
        const list = Array.isArray(data) ? data : [];
        const valid = normalizeCustomConfig(list).length;
        return { count: valid, warnings: list.length > valid ? [ctx.t("io.warn.invalid", { n: list.length - valid })] : [] };
      },
      export: async () => customList(),
      import: async (data) => saveCustom(normalizeCustomConfig(data)),
      reset: async () => saveCustom([]),
    });

    ctx.services.provide("apps", {
      list: () => apps,
      get,
      byUrl(url) {
        try {
          const { hostname } = new URL(url);
          return apps.find((a) => hostMatches(hostname, a.hosts)) ?? null;
        } catch {
          return null;
        }
      },
      iframeConfigFor,
      iframeAttributes: (id, url) => {
        const app = get(id);
        return app ? resolveIframeAttributes(app, url, iframeConfigFor(id)) : null;
      },
      setIframeConfig: async (id, config) => {
        const app = get(id);
        if (!app) return;
        const empty = !config || !Object.keys(config).length;
        if (app.builtin) {
          const next = { ...(ctx.settings.builtinChatAppIframeConfigs ?? {}) };
          if (empty) delete next[id];
          else next[id] = config;
          ctx.settings.builtinChatAppIframeConfigs = next;
        } else {
          await saveCustom(custom.map((c) => (c.id === id ? (empty ? (({ iframeConfig, ...rest }) => rest)(c) : { ...c, iframeConfig: config }) : c)));
        }
      },
      iconFor: (id) => ctx.settings.appIcons?.[id] ?? null,
      setIcon: (id, icon) => {
        const next = { ...(ctx.settings.appIcons ?? {}) };
        if (icon) next[id] = icon;
        else delete next[id];
        ctx.settings.appIcons = next;
      },
      builtinOrder: () => apps.filter((a) => a.builtin).map((a) => a.id),
      setBuiltinOrder: (ids) => (ctx.settings.builtinChatAppOrder = ids),
      customList,
      saveCustom,
    });
  },
};
