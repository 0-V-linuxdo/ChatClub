// Appearance: applies theme mode and accent color; hosts the Appearance settings section whose
// sub-tabs are filled by `appearance.group` cards and `appearance.field` rows from other plugins.

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { renderSafely } from "../../kernel/extension-points.js";
import { normalizeHexColor, onPrimaryFor, mix, DEFAULT_PRIMARY } from "./color.js";

// The four sub-tabs of 06 §3.
const TABS = ["workspace", "tabGroup", "chatclubTabs", "tips"];

export default {
  start(ctx) {
    const root = document.documentElement;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    root.dataset.themeOwner = "appearance";
    const apply = () => {
      const mode = ctx.settings.themeMode;
      const dark = mode === "dark" || (mode !== "light" && !!media?.matches);
      root.dataset.theme = dark ? "dark" : "light";
      const color = normalizeHexColor(ctx.settings.primaryColor) ?? DEFAULT_PRIMARY;
      if (color === DEFAULT_PRIMARY) {
        for (const prop of ["--primary", "--primary-2", "--on-primary"]) root.style.removeProperty(prop);
        return;
      }
      root.style.setProperty("--primary", color);
      root.style.setProperty("--primary-2", dark ? mix(color, "#020617", 0.22) : mix(color, "#ffffff", 0.14));
      root.style.setProperty("--on-primary", onPrimaryFor(color));
    };
    apply();
    media?.addEventListener?.("change", apply);
    ctx.onDispose(() => media?.removeEventListener?.("change", apply));
    ctx.onDispose(ctx.plugin.settings.use(["themeMode", "primaryColor"], apply));
    ctx.onDispose(() => {
      // Hand the theme back to AppShell, which follows the system while Appearance is off.
      delete root.dataset.themeOwner;
      root.dataset.theme = media?.matches ? "dark" : "light";
      for (const prop of ["--primary", "--primary-2", "--on-primary"]) root.style.removeProperty(prop);
    });

    const t = ctx.t;
    const groups = ctx.extensionPoint("appearance.group");
    // Rows other plugins add to a card: { group: card id, order, render(container, gctx) }.
    const fields = ctx.extensionPoint("appearance.field");

    ctx.contribute("appearance.group", {
      id: "Appearance:general",
      tab: "workspace",
      order: -100,
      titleKey: "appearance.card.general",
      render(container, gctx) {
        const store = ctx.settings;
        const themeRow = ui.field({
          label: t("setting.Appearance.themeMode"),
          control: ui.select({
            value: store.themeMode,
            options: ["system", "light", "dark"].map((v) => ({ value: v, label: t(`appearance.theme.${v}`) })),
            onChange: (v) => (store.themeMode = v),
          }),
        });
        let colorRow;
        const color = ui.colorInput({
          value: normalizeHexColor(store.primaryColor) ?? DEFAULT_PRIMARY,
          onChange: (v) => {
            const normalized = normalizeHexColor(v);
            if (!normalized) {
              colorRow.setError(t("appearance.primary.invalid"));
              return;
            }
            colorRow.setError("");
            store.primaryColor = normalized;
            store.primaryColorCustom = normalized !== DEFAULT_PRIMARY;
            color.setValue(normalized);
          },
        });
        colorRow = ui.field({ label: t("setting.Appearance.primaryColor"), desc: t("appearance.primary.description"), control: color });
        const rows = [themeRow, colorRow];
        container.append(...rows);
        void gctx;
      },
    });

    // Cards whose rows come from other plugins through `appearance.field` (06 §3.1, §3.2).
    ctx.contribute("appearance.group", { id: "Appearance:topbar", tab: "workspace", order: 10, titleKey: "appearance.card.topbar", render() {} });
    ctx.contribute("appearance.group", { id: "Appearance:overlay", tab: "workspace", order: 20, titleKey: "appearance.card.overlay", render() {} });

    ctx.contribute("settings.section", {
      id: "appearance",
      titleKey: "appearance.section.title",
      descKey: "appearance.section.desc",
      icon: "palette",
      order: 0,
      group: "general",
      render(container, sctx) {
        let tab = sctx.args?.tab ?? "workspace";
        const tabs = () => TABS.filter((id) => groups.sorted().some((g) => g.tab === id));
        const content = h("div");
        const strip = h("div");
        const renderStrip = () => {
          clear(strip);
          const available = tabs();
          if (!available.includes(tab)) tab = available[0] ?? "workspace";
          strip.append(ui.subtabs({ tabs: available.map((id) => ({ id, label: t(`appearance.tab.${id}`) })), value: tab, onChange: (id) => {
            tab = id;
            renderContent();
          } }));
        };
        const disposers = [];
        const renderContent = () => {
          for (const fn of disposers.splice(0)) fn();
          clear(content);
          for (const group of groups.sorted().filter((g) => g.tab === tab)) {
            const body = h("div");
            const gctx = { ...sctx, onDispose: (fn) => disposers.push(fn) };
            const ok = renderSafely(ctx.logger, "appearance.group", group.id, () => (group.render(body, gctx), true), false);
            for (const field of fields.sorted().filter((f) => f.group === group.id)) {
              renderSafely(ctx.logger, "appearance.field", field.id, () => field.render(body, gctx));
            }
            if (ok && body.childElementCount) content.append(ui.card({ title: group.titleKey ? t(group.titleKey) : null, body }));
          }
        };
        renderStrip();
        renderContent();
        container.append(strip, content);
        const refresh = () => {
          renderStrip();
          renderContent();
        };
        sctx.onDispose(groups.subscribe(refresh));
        sctx.onDispose(fields.subscribe(refresh));
        sctx.onDispose(() => disposers.splice(0).forEach((fn) => fn()));
      },
    });
  },
};
