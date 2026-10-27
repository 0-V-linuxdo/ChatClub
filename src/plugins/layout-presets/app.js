// LayoutPresets: saved column templates, the top bar layout menu and switchLayout (v2 02 §6).

import { h, icon, uid } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { DEFAULT_PRESETS } from "./index.js";
import { DEFAULT_LAYOUT_APPS, DEFAULT_LAYOUT_APPS_ZH } from "../apps/catalog.js";

const sameGroups = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** Drops unknown apps and empty columns; keeps at least one preset; fixes the active id (02 §6.1). */
export function normalizePresets(raw, activeId, knownApp) {
  let list = (Array.isArray(raw) ? raw : [])
    .filter((p) => p && typeof p === "object")
    .map((p, i) => ({
      id: typeof p.id === "string" && p.id ? p.id : `layout-${i + 1}`,
      name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : `Layout ${i + 1}`,
      chatAppIdGroups: (Array.isArray(p.chatAppIdGroups) ? p.chatAppIdGroups : [])
        .map((g) => (Array.isArray(g) ? g.filter((id) => typeof id === "string" && knownApp(id)) : []))
        .filter((g) => g.length),
    }));
  const seen = new Set();
  list = list.filter((p) => !seen.has(p.id) && seen.add(p.id));
  if (!list.length) list = JSON.parse(JSON.stringify(DEFAULT_PRESETS)).map((p) => ({ ...p, chatAppIdGroups: p.chatAppIdGroups.filter((g) => g.every(knownApp)) }));
  const active = list.some((p) => p.id === activeId) ? activeId : list[0].id;
  return { list, active };
}

export function presetSummary(preset, appName, emptyLabel) {
  const groups = preset?.chatAppIdGroups ?? [];
  if (!groups.length) return emptyLabel;
  return groups.map((g) => g.map(appName).join("，")).join(" / ");
}

export default {
  start(ctx) {
    const t = ctx.t;
    const apps = ctx.services.get("apps");
    const shellUi = ctx.services.get("ui");
    const known = (id) => !!apps.get(id);
    const appName = (id) => apps.get(id)?.name ?? id;
    const state = () => normalizePresets(ctx.settings.layoutPresets, ctx.settings.activeLayoutPresetId, known);
    const workspace = () => ctx.services.get("workspace");

    const save = (list, active) => {
      ctx.settings.layoutPresets = list;
      ctx.settings.activeLayoutPresetId = active;
    };
    const current = () => {
      const { list, active } = state();
      return list.find((p) => p.id === active) ?? list[0];
    };
    const isTemporary = () => workspace()?.getLayoutInfo?.().type === "temporary";

    const rebuild = (preset) => {
      workspace()?.buildFromAppGroups(preset.chatAppIdGroups, { layout: { type: "preset", presetId: preset.id }, reason: "switchLayout" });
      if (workspace()?.fullscreenGroupId()) workspace().toggleFullscreen(workspace().fullscreenGroupId());
    };

    const switchTo = (id) => {
      const { list, active } = state();
      const preset = list.find((p) => p.id === id);
      if (!preset) return false;
      if (id === active && !isTemporary()) return false;
      save(list, id);
      rebuild(preset);
      return true;
    };

    const add = () => {
      const { list } = state();
      const lang = ctx.services.get("i18n")?.lang ?? "en";
      let groups = (lang === "zh" ? DEFAULT_LAYOUT_APPS_ZH : DEFAULT_LAYOUT_APPS).filter((g) => g.every(known));
      if (groups.length < 3) groups = apps.list().slice(0, 3).map((a) => [a.id]);
      if (!groups.length) {
        shellUi.toast(t("workspace.noApps"), "error");
        return null;
      }
      const preset = { id: uid("layout"), name: t("layout.name", { n: list.length + 1 }), chatAppIdGroups: groups };
      save([...list, preset], preset.id);
      rebuild(preset);
      return preset.id;
    };

    const remove = (id) => {
      const { list, active } = state();
      if (list.length <= 1) return false;
      const next = list.filter((p) => p.id !== id);
      if (id === active) {
        save(next, next[0].id);
        rebuild(next[0]);
      } else save(next, active);
      return true;
    };

    const move = (id, delta) => {
      const { list, active } = state();
      const i = list.findIndex((p) => p.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      save(list, active);
    };

    // Workspace edits write the columns back into the current preset (02 §6.3).
    ctx.events.on("Workspace:changed", ({ structural }) => {
      const ws = workspace();
      if (!structural || !ws?.isBooted()) return;
      const info = ws.getLayoutInfo();
      if (info.type === "temporary") return;
      const { list, active } = state();
      const preset = list.find((p) => p.id === (info.presetId ?? active));
      if (!preset) return;
      const groups = ws.appIdGroups();
      if (sameGroups(preset.chatAppIdGroups, groups)) return;
      preset.chatAppIdGroups = groups;
      save(list, active);
    });

    // Imported settings: rebuild when the current preset changed and differs from the workspace.
    ctx.onDispose(ctx.plugin.settings.use(["layoutPresets", "activeLayoutPresetId"], () => {
      const ws = workspace();
      if (!ws?.isBooted() || isTemporary()) return;
      const preset = current();
      if (!sameGroups(preset.chatAppIdGroups, ws.appIdGroups())) rebuild(preset);
    }));

    // ------------------------------------------------------------ menu (02 §6.2)
    const shortcutHint = (index) => {
      if (index >= 9) return "";
      const label = ctx.services.get("shortcuts")?.labelFor("switchLayout") ?? "";
      return label ? label.replace(/1–9$/, String(index + 1)) : "";
    };
    const openMenu = (anchor) => {
      shellUi.openPopover({
        anchor,
        align: "end",
        className: "cc-layout-menu",
        render: ({ close }) => {
          const box = h("div", { attrs: { role: "menu" } });
          const { list, active } = state();
          const ws = workspace();
          const info = ws?.getLayoutInfo?.() ?? {};
          const showMove = ctx.host.plugins.SettingsUI?.settings?.store?.settingsClickReorderButtonsEnabled;
          if (info.type === "temporary") {
            const groups = ws.appIdGroups();
            const row = h("div.cc-layout-row.current",
              h("button.cc-menu-item", { type: "button", onclick: () => close() },
                h("span.slot", icon("layout", { size: 15 })), h("span.label", info.name || presetSummary({ chatAppIdGroups: groups }, appName, t("layout.empty")))));
            box.append(row, h("div.cc-menu-sep"));
          }
          list.forEach((preset, index) => {
            const isCurrent = preset.id === active && info.type !== "temporary";
            const main = h("button.cc-menu-item", {
              type: "button",
              onclick: () => {
                close();
                switchTo(preset.id);
              },
            }, h("span.label", presetSummary(preset, appName, t("layout.empty"))), h("span.hint", shortcutHint(index)));
            const tools = h("div.tools",
              showMove ? ui.iconButton({ icon: "chevronUp", compact: true, label: t("layout.moveUp"), disabled: index === 0, onClick: () => {
                move(preset.id, -1);
                close();
                openMenu(anchor);
              } }) : null,
              showMove ? ui.iconButton({ icon: "chevronDown", compact: true, label: t("layout.moveDown"), disabled: index === list.length - 1, onClick: () => {
                move(preset.id, 1);
                close();
                openMenu(anchor);
              } }) : null,
              ui.iconButton({ icon: "x", compact: true, label: t("layout.delete"), disabled: list.length <= 1, onClick: () => {
                remove(preset.id);
                close();
                openMenu(anchor);
              } }));
            box.append(h("div.cc-layout-row", { class: isCurrent ? "current" : "", attrs: { "aria-current": isCurrent ? "true" : "false" } }, main, tools));
          });
          box.append(h("div.cc-menu-sep"), h("button.cc-menu-item", { type: "button", onclick: () => {
            close();
            add();
          } }, h("span.slot", icon("plus", { size: 15 })), h("span.label", t("layout.add"))));
          box.addEventListener("keydown", (event) => {
            const items = [...box.querySelectorAll(".cc-menu-item")];
            const i = items.indexOf(document.activeElement);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              items[(i + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
            }
          });
          queueMicrotask(() => box.querySelector(".current .cc-menu-item, .cc-menu-item")?.focus());
          return box;
        },
      });
    };

    ctx.contribute("topbar.item", { id: "layout", labelKey: "layout.button", icon: "layout", hasMenu: true, onClick: ({ anchor }) => openMenu(anchor) });
    ctx.contribute("shortcut.action", {
      id: "switchLayout",
      labelKey: "layout.shortcut.switch",
      run: (match) => {
        const n = Number(match?.digit);
        const preset = state().list[n - 1];
        if (preset) switchTo(preset.id);
      },
    });

    ctx.services.provide("layoutPresets", {
      current,
      list: () => state().list,
      activeId: () => state().active,
      switchTo,
      add,
      remove,
      move,
      has: (id) => state().list.some((p) => p.id === id),
      summary: (preset) => presetSummary(preset, appName, t("layout.empty")),
    });
  },
};
