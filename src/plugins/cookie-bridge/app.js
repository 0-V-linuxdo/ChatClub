// CookieBridge (page): Grok iframes reload when their mirrored login changed; Manus never reloads (v2 05 §6.2).

import { STATE_KEY, SITES, siteForHost } from "./model.js";

export default {
  start(ctx) {
    const workspace = ctx.services.get("workspace");
    if (!workspace) return;
    let last = {};
    ctx.storage.get?.(STATE_KEY).then((s) => (last = s?.changedAt ?? {})).catch(() => {});
    ctx.storage.onChanged?.(STATE_KEY, (value) => {
      const changedAt = value?.changedAt ?? {};
      for (const site of SITES) {
        if (!site.reloadOnChange || !changedAt[site.id] || changedAt[site.id] === last[site.id]) continue;
        for (const tab of workspace.groups().flatMap((g) => g.tabs)) {
          let host = "";
          try {
            host = new URL(workspace.currentHrefSync?.(tab.id) || tab.href || "").hostname;
          } catch {
            continue;
          }
          if (siteForHost(host)?.id === site.id) workspace.refreshTab?.(tab.id);
        }
      }
      last = changedAt;
    });
  },
};
