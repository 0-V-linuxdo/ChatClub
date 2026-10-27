// Appearance: applies theme mode and accent color; hosts the Appearance settings section whose
// sub-tabs are filled by `appearance.group` contributions from other plugins.

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { renderSafely } from "../../kernel/extension-points.js";
import { renderSettingsFields } from "../../lib/settings-form.js";
import { normalizeHexColor, onPrimaryFor, mix, DEFAULT_PRIMARY } from "./color.js";

// The four sub-tabs of 06 §3, then the theme list (QuickCSS and themes).
const TABS = ["workspace", "tabGroup", "chatclubTabs", "tips", "themes"];

export default {
  start(ctx) {
    const root = document.documentElement;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
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
      delete root.dataset.theme;
      for (const prop of ["--primary", "--primary-2", "--on-primary"]) root.style.removeProperty(prop);
    });

    const t = ctx.t;
    const groups = ctx.extensionPoint("appearance.group");

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
        const reorderStore = () => ctx.host.plugins.SettingsUI?.settings?.store;
        const moveRow = ui.field({
          label: t("setting.SettingsUI.settingsClickReorderButtonsEnabled"),
          desc: t("settingsUi.moveButtons.description"),
          control: ui.toggleSwitch({ checked: !!reorderStore()?.settingsClickReorderButtonsEnabled, onChange: (v) => reorderStore() && (reorderStore().settingsClickReorderButtonsEnabled = v) }),
        });
        const rows = [themeRow, colorRow, moveRow];
        const i18n = ctx.host.plugins.I18n;
        if (i18n?.settings) {
          rows.push(ui.field({
            label: t("appearance.language"),
            control: ui.select({
              value: i18n.settings.store.language,
              options: ["system", "zh_CN", "en"].map((v) => ({ value: v, label: t(`i18n.language.${v}`) })),
              onChange: (v) => (i18n.settings.store.language = v),
            }),
          }));
        }
        const workspacePlugin = ctx.host.plugins.Workspace;
        if (workspacePlugin?.settings) rows.push(...renderSettingsFields(ctx.host, workspacePlugin, { keys: ["colMaxCount"] }));
        const pocketStore = ctx.host.plugins.Pocket?.settings?.store;
        if (pocketStore) {
          rows.push(ui.field({
            label: t("appearance.pocketIcon"),
            desc: t("appearance.pocketIcon.desc"),
            control: ui.segmented({
              value: pocketStore.pocketIcon === "pocket" ? "pocket" : "star",
              options: [{ value: "star", label: t("appearance.pocketIcon.star") }, { value: "pocket", label: t("appearance.pocketIcon.pocket") }],
              onChange: (v) => (pocketStore.pocketIcon = v),
            }),
          }));
        }
        container.append(...rows);
        void gctx;
      },
    });

    // Top bar and composer settings that belong to Workspace · General (06 §3.1).
    ctx.contribute("appearance.group", {
      id: "Appearance:topbar",
      tab: "workspace",
      order: 10,
      titleKey: "appearance.card.topbar",
      render(container, gctx) {
        const rows = [];
        for (const [name, keys] of [["TopbarAPI", ["topbarVisibility"]], ["Composer", ["composerPlacement", "topbarPromptInputFontSize"]]]) {
          const plugin = ctx.host.plugins[name];
          if (!plugin?.settings) continue;
          const part = renderSettingsFields(ctx.host, plugin, { keys });
          if (part.dispose) gctx.onDispose(part.dispose);
          rows.push(...part);
        }
        container.append(...rows);
      },
    });

    // Workspace · Overlays (06 §3.2): the loading overlay; the model overlay card comes from ModelPreference.
    ctx.contribute("appearance.group", {
      id: "Appearance:overlay",
      tab: "workspace",
      order: 20,
      titleKey: "appearance.card.overlay",
      render(container) {
        const store = ctx.host.plugins.Workspace?.settings?.store;
        if (!store) return;
        container.append(
          ui.field({ label: t("appearance.loadingOverlay"), desc: t("workspace.overlay.description"), control: ui.toggleSwitch({ checked: store.frameLoadingOverlayEnabled !== false, onChange: (v) => (store.frameLoadingOverlayEnabled = v) }) }),
          ui.field({ label: t("appearance.loadingOverlay.opacity"), control: ui.sliderRow({ value: Number(store.frameLoadingOverlayOpacity ?? 82), min: 0, max: 100, onChange: (v) => (store.frameLoadingOverlayOpacity = v), format: (v) => `${v}%` }) }),
        );
      },
    });

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
            if (ok) content.append(ui.card({ title: group.titleKey ? t(group.titleKey) : null, body }));
          }
        };
        renderStrip();
        renderContent();
        container.append(strip, content);
        sctx.onDispose(groups.subscribe(() => {
          renderStrip();
          renderContent();
        }));
        sctx.onDispose(() => disposers.splice(0).forEach((fn) => fn()));
      },
    });
  },
};
