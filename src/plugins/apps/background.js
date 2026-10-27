// Apps (background): default content-script hosts = every built-in and custom app host.

import { BUILTIN_APPS, mergeApps, allHosts } from "./catalog.js";

export default {
  async start(ctx) {
    let custom = [];
    try {
      custom = (await ctx.storage.get("customConfig")) ?? [];
    } catch {
      custom = [];
    }
    ctx.services.provide("content.defaultHosts", () => allHosts(mergeApps(BUILTIN_APPS, custom)));
    ctx.storage.onChanged?.("customConfig", (value) => {
      custom = value ?? [];
      ctx.host.syncContentPlan?.();
    });
  },
};
