// ButtonTips: hover tips for buttons that carry data-tip, and the Appearance → Button tips page.

import { h, icon } from "../../lib/dom.js";
import * as uiLib from "../../lib/ui.js";
import { TIP_GROUPS } from "./tip-ids.js";

export default {
  start(ctx) {
    const doc = document;
    const tooltip = h("div.cc-tooltip", { attrs: { role: "tooltip" } });
    doc.body.append(tooltip);
    ctx.onDispose(() => tooltip.remove());

    let tipTarget = null;
    // Old tip ids map onto their current names (07 §2).
    const TIP_ALIASES = {
      "pocket.collapseSidebar": "pocket.sidebar",
      "pocket.expandSidebar": "pocket.sidebar",
      "pocket.exitFocusMode": "pocket.focusMode",
      "pocket.fullscreen": "viewer.fullscreen",
      "workspace.tabs.unpin": "workspace.tabs.pin",
      "workspace.tabs.sortTime": "workspace.tabs.sortActivity",
      "workspace.tabs.sortViewed": "workspace.tabs.sortActivity",
      "workspace.tabs.sortEdited": "workspace.tabs.sortActivity",
    };
    {
      const stored = Array.isArray(ctx.settings.tooltipDisabledIds) ? ctx.settings.tooltipDisabledIds : [];
      const mapped = [...new Set(stored.filter((id) => typeof id === "string").map((id) => TIP_ALIASES[id] ?? id))];
      if (mapped.length !== stored.length || mapped.some((id, i) => id !== stored[i])) ctx.settings.tooltipDisabledIds = mapped;
    }
    const disabledTips = () => new Set(ctx.settings.tooltipDisabledIds ?? []);
    // The text each tip id last showed, so the settings list can name and preview it.
    const seenTips = new Map();
    const showTip = (target) => {
      const text = target.dataset.tip;
      if (target.dataset.tipId && text) seenTips.set(target.dataset.tipId, text);
      if (!text || target.disabled && !target.dataset.tipWhenDisabled) return hideTip();
      if (target.dataset.tipId && disabledTips().has(target.dataset.tipId)) return hideTip();
      tipTarget = target;
      tooltip.textContent = text;
      tooltip.classList.add("show");
      const rect = target.getBoundingClientRect();
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      let side = "bottom";
      let top = rect.bottom + 8;
      if (top + th > window.innerHeight - 8) {
        side = "top";
        top = rect.top - th - 8;
      }
      const center = rect.left + rect.width / 2;
      const left = Math.max(8, Math.min(center - tw / 2, window.innerWidth - tw - 8));
      tooltip.dataset.side = side;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.setProperty("--arrow-x", `${Math.max(10, Math.min(tw - 10, center - left))}px`);
    };
    const hideTip = () => {
      tipTarget = null;
      tooltip.classList.remove("show");
    };
    const onOver = (event) => {
      const target = event.target.closest?.("[data-tip]");
      if (target === tipTarget) return;
      if (!target) return hideTip();
      showTip(target);
    };
    const onDownOrScroll = () => hideTip();
    doc.addEventListener("pointerover", onOver);
    doc.addEventListener("pointerdown", onDownOrScroll, true);
    doc.addEventListener("scroll", onDownOrScroll, true);
    doc.addEventListener("focusin", (event) => {
      const target = event.target.closest?.("[data-tip]");
      if (target && target.matches(":focus-visible")) showTip(target);
    });
    doc.addEventListener("focusout", hideTip);
    ctx.onDispose(() => {
      doc.removeEventListener("pointerover", onOver);
      doc.removeEventListener("pointerdown", onDownOrScroll, true);
      doc.removeEventListener("scroll", onDownOrScroll, true);
    });

    // Appearance → Button tips (06 §3.6): one switch per tip id, grouped, with a hover preview.
    ctx.contribute("appearance.group", {
      id: "ButtonTips:tips",
      tab: "tips",
      order: 0,
      titleKey: "appShell.tips.card",
      render(container) {
        for (const el of doc.querySelectorAll("[data-tip-id][data-tip]")) seenTips.set(el.dataset.tipId, el.dataset.tip);
        const off = () => new Set(ctx.settings.tooltipDisabledIds ?? []);
        const setOn = (id, on) => {
          const next = off();
          if (on) next.delete(id);
          else next.add(id);
          ctx.settings.tooltipDisabledIds = [...next];
        };
        const t = ctx.t;
        const allOn = uiLib.button({ label: t("appShell.tips.allOn"), onClick: () => {
          ctx.settings.tooltipDisabledIds = [];
          container.querySelectorAll("input[role='switch']").forEach((i) => (i.checked = true));
        } });
        container.append(h("div.cc-tips-head", h("p.cc-zones-desc", t("appShell.tips.desc")), allOn));
        for (const [group, ids] of Object.entries(TIP_GROUPS)) {
          const rows = ids.map((id) => {
            const text = seenTips.get(id) ?? "";
            const preview = h("button.cc-tips-preview", { type: "button", attrs: { "data-tip": text || id, "aria-label": t("appShell.tips.preview") } }, icon("eye", { size: 14 }));
            return h("div.cc-tips-row",
              uiLib.toggleSwitch({ checked: !off().has(id), label: id, onChange: (v) => setOn(id, v) }),
              h("span.cc-tips-text", text ? h("span", text) : null, h("code", id)),
              preview);
          });
          container.append(h("details.cc-tips-group", { attrs: { open: group === "topbar" ? "" : null } }, h("summary", `${t(`appShell.tips.group.${group}`)} · ${ids.length}`), ...rows));
        }
      },
    });
  },
};
