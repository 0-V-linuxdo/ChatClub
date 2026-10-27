// PromptPlaceholder: rotating custom placeholders for the composer (v2 03 §1.4).

import * as ui from "../../lib/ui.js";
import { DEFAULT_CONFIG } from "./index.js";

const MAX_ITEMS = 30;
const MAX_LEN = 100;

export function normalizeConfig(raw) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  const items = (Array.isArray(cfg.items) ? cfg.items : [])
    .map((x) => String(x ?? "").trim().slice(0, MAX_LEN))
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
  const interval = Math.round(Number(cfg.intervalSec));
  return {
    items,
    mode: cfg.mode === "interval" ? "interval" : "refresh",
    order: cfg.order === "random" ? "random" : "sequential",
    intervalSec: Number.isFinite(interval) ? Math.min(3600, Math.max(1, interval)) : DEFAULT_CONFIG.intervalSec,
    state: {
      index: Number.isInteger(cfg.state?.index) ? cfg.state.index : -1,
      lastRandom: Number.isInteger(cfg.state?.lastRandom) ? cfg.state.lastRandom : -1,
    },
  };
}

/** Next index: sequential wraps; random never repeats the previous one when there is a choice. */
export function nextIndex(cfg, random = Math.random) {
  const n = cfg.items.length;
  if (!n) return -1;
  if (cfg.order === "random") {
    if (n === 1) return 0;
    let i = Math.floor(random() * (n - 1));
    if (i >= cfg.state.lastRandom && cfg.state.lastRandom >= 0) i += 1;
    return Math.min(i, n - 1);
  }
  return (cfg.state.index + 1 + n) % n;
}

export default {
  start(ctx) {
    const t = ctx.t;
    const composer = ctx.services.get("composer");
    const config = () => normalizeConfig(ctx.settings.topbarPromptPlaceholderConfig);
    let current = -1;
    let timer = null;

    const advance = () => {
      const cfg = config();
      const index = nextIndex(cfg);
      current = index;
      if (index >= 0) {
        ctx.settings.topbarPromptPlaceholderConfig = { ...cfg, state: { index, lastRandom: cfg.order === "random" ? index : cfg.state.lastRandom } };
      }
      composer?.refresh();
    };
    const schedule = () => {
      clearInterval(timer);
      const cfg = config();
      if (cfg.mode === "interval" && cfg.items.length > 1) timer = setInterval(advance, cfg.intervalSec * 1000);
    };
    ctx.onDispose(() => clearInterval(timer));

    // refresh mode: one step per page open; interval mode: start where it left off, then tick.
    const initial = config();
    if (initial.items.length) {
      if (initial.mode === "refresh") advance();
      else current = Math.min(Math.max(initial.state.index, 0), initial.items.length - 1);
    }
    schedule();
    let lastItems = JSON.stringify(initial.items);
    ctx.onDispose(ctx.plugin.settings.use(["topbarPromptPlaceholderConfig"], () => {
      const cfg = config();
      const items = JSON.stringify(cfg.items);
      if (items !== lastItems) {
        lastItems = items;
        current = cfg.items.length ? Math.min(Math.max(cfg.state.index, 0), cfg.items.length - 1) : -1;
      }
      schedule();
      composer?.refresh();
    }));

    ctx.contribute("composer.placeholder", {
      id: "PromptPlaceholder:custom",
      order: 10,
      text: () => {
        const cfg = config();
        return current >= 0 ? cfg.items[current] ?? null : null;
      },
    });

    ctx.contribute("appearance.group", {
      id: "PromptPlaceholder:settings",
      tab: "workspace",
      order: 15,
      titleKey: "placeholder.card",
      render(container) {
        const cfg = config();
        const save = (patch) => (ctx.settings.topbarPromptPlaceholderConfig = { ...config(), ...patch });
        const items = ui.textArea({
          value: cfg.items.join("\n"),
          rows: 5,
          onChange: (v) => save({ items: String(v).split("\n").map((s) => s.trim()).filter(Boolean).slice(0, MAX_ITEMS).map((s) => s.slice(0, MAX_LEN)) }),
        });
        const interval = ui.textInput({ value: String(cfg.intervalSec), type: "number", onChange: (v) => save({ intervalSec: Number(v) }) });
        const intervalRow = ui.field({ label: t("placeholder.interval"), control: interval });
        intervalRow.hidden = cfg.mode !== "interval";
        container.append(
          ui.field({ label: t("placeholder.items"), desc: t("placeholder.items.desc"), control: items }),
          ui.field({
            label: t("placeholder.mode"),
            control: ui.select({
              value: cfg.mode,
              options: ["refresh", "interval"].map((v) => ({ value: v, label: t(`placeholder.mode.${v}`) })),
              onChange: (v) => {
                save({ mode: v });
                intervalRow.hidden = v !== "interval";
              },
            }),
          }),
          intervalRow,
          ui.field({
            label: t("placeholder.order"),
            control: ui.select({ value: cfg.order, options: ["sequential", "random"].map((v) => ({ value: v, label: t(`placeholder.order.${v}`) })), onChange: (v) => save({ order: v }) }),
          }),
        );
      },
    });
  },
};
