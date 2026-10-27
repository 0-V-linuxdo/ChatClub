// UserScriptsRuntime (page): the permission service and the status card used by the Summary and
// topic-deletion settings (v2 06 §6.1). Running scripts happens in background.js.

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { userscriptsStatus } from "../../lib/userscripts-status.js";

export default {
  start(ctx) {
    const t = ctx.t;
    const status = async () => (await userscriptsStatus()).state;

    /** Must be called from a user gesture (a click handler) before any await. */
    const request = () => {
      try {
        return chrome.permissions.request({ permissions: ["userScripts"] }).catch(() => false);
      } catch {
        return Promise.resolve(false);
      }
    };

    /** Asks for the permission when it is missing; resolves true when scripts can run afterwards. */
    const ensure = async () => {
      let state = await status();
      if (state === "notGranted") {
        await request();
        state = await status();
      }
      return state === "granted";
    };

    const renderCard = (container, { needed = () => false } = {}) => {
      const body = h("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } });
      const draw = async () => {
        const state = await status();
        clear(body);
        const shown = state === "notGranted" && !needed() ? "available" : state;
        const tone = shown === "granted" ? "" : shown === "available" ? "muted" : "warning";
        body.append(ui.badge(t(`us.state.${shown}`).split(/[：:]/)[0], tone), h("span", { style: { flex: "1 1 240px", fontSize: "13px", color: "var(--muted)" } }, t(`us.state.${shown}`)));
        if (state === "notGranted") {
          body.append(ui.button({ label: t("us.request"), tipId: "settings.userscripts.permission", variant: shown === "notGranted" ? "primary" : "", onClick: () => {
            request().then((ok) => {
              if (!ok) ctx.services.get("ui")?.toast?.(t("us.denied"), "error");
              draw();
            });
          } }));
        }
        if (state === "toggleOff") {
          body.append(ui.button({ label: t("us.openDetails"), onClick: () => chrome.tabs?.create?.({ url: `chrome://extensions/?id=${chrome.runtime.id}` }) }));
          body.append(ui.button({ label: t("us.refresh"), onClick: draw }));
        }
      };
      const card = ui.card({ title: t("us.card.title"), body });
      container.append(card);
      draw();
      return { el: card, refresh: draw };
    };

    ctx.services.provide("userScripts", { status, request, ensure, renderCard });
  },
};
