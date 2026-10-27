// Sites: the `site.adapter` registry (spec v1.3 §13.3, v2 05 §7). Features ask it which adapter covers an address.

import { hostMatchesList } from "../../lib/conversation.js";

const pathOk = (url, prefixes) => !prefixes?.length || prefixes.some((p) => url.pathname === p || url.pathname.startsWith(p.endsWith("/") ? p : `${p}/`) || url.pathname.startsWith(p));

export default {
  start(ctx) {
    const point = ctx.extensionPoint("site.adapter");
    // Optional data layer between built-in adapter data and user overrides (official rules, 06 §9.4).
    let overlay = null;
    const listeners = new Set();
    const dataOf = (a, feature) => {
      const data = a.capabilities[feature];
      if (!overlay) return data;
      try {
        return overlay(feature, data, a) ?? data;
      } catch (error) {
        ctx.logger.warn("Site data overlay failed:", error);
        return data;
      }
    };
    const api = {
      list: () => point.sorted(),
      byAppId: (appId) => point.sorted().find((a) => a.appId === appId) ?? null,
      /** Feature data of every enabled adapter, e.g. capability("summary") → [{ adapter, data }]. */
      capability: (feature) => point.sorted().filter((a) => a.capabilities?.[feature]).map((a) => ({ adapter: a, data: dataOf(a, feature) })),
      /** Built-in data only, ignoring the overlay. */
      builtinCapability: (feature) => point.sorted().filter((a) => a.capabilities?.[feature]).map((a) => ({ adapter: a, data: a.capabilities[feature] })),
      setOverlay(fn) {
        overlay = typeof fn === "function" ? fn : null;
        for (const l of listeners) l();
      },
      onOverlayChanged(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      /** The adapter whose hosts (and optional path prefixes) cover `href`. */
      forHref(href, feature) {
        let url;
        try {
          url = new URL(href);
        } catch {
          return null;
        }
        for (const a of point.sorted()) {
          if (feature && !a.capabilities?.[feature]) continue;
          const data = feature ? dataOf(a, feature) : a;
          if (hostMatchesList(url.hostname, data.hosts ?? a.hosts ?? []) && pathOk(url, data.pathPrefixes)) return a;
        }
        return null;
      },
      subscribe: (fn) => point.subscribe(fn),
    };
    ctx.services.provide("sites", api);
  },
};
