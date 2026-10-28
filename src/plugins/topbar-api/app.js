// TopbarAPI: renders `topbar.item` contributions in the user's layout, the settings jump menu,
// customize mode and auto-hide (spec v2 01 §6.2–§6.4).

import { h, icon, clear } from "../../lib/dom.js";
import { renderSafely, guardCallback } from "../../kernel/extension-points.js";
import { BASE_CATALOG, DEFAULT_LAYOUT, REQUIRED_ITEMS, normalizeLayout, serializeLayout, splitLayout, isFlex, SETTINGS_ITEM_IDS } from "./layout.js";

export default {
  start(ctx) {
    const shellService = ctx.services.get("shell");
    const ui = ctx.services.get("ui");
    if (!shellService || !ui) throw new Error("AppShell is not ready");
    if (shellService.page !== "workspace") return;
    const t = ctx.t;
    const items = ctx.extensionPoint("topbar.item");
    const extraMenu = ctx.extensionPoint("topbar.menu");
    const bar = h("div.cc-topbar", { attrs: { role: "toolbar", "aria-label": "ChatClub" } });
    shellService.topbarSlot.append(bar);
    ctx.onDispose(() => bar.remove());
    const nodes = new Map(); // id -> element (kept so stateful items such as the composer are not rebuilt)
    let editing = null;

    const catalog = () => new Set([...BASE_CATALOG, ...items.sorted().map((e) => e.id)]);
    const currentLayout = () => normalizeLayout(ctx.settings.topbarLayout ?? DEFAULT_LAYOUT, catalog());

    const shortcutLabel = (action) => {
      if (!action) return "";
      try {
        return ctx.services.get("shortcuts")?.labelFor(action) ?? "";
      } catch {
        return "";
      }
    };
    const labelOf = (entry) => {
      const key = typeof entry.labelKey === "function" ? entry.labelKey() : entry.labelKey;
      return key ? t(key) : entry.id;
    };
    const tipFor = (entry) => {
      const label = labelOf(entry);
      const keys = shortcutLabel(entry.shortcutAction);
      return keys ? `${label} (${keys})` : label;
    };
    const itemCtx = (entry, anchor) => ({ host: ctx.host, ui, t, entry, anchor, refresh: () => render() });
    const evaluate = (fn, entry) => {
      if (typeof fn !== "function") return false;
      try {
        return !!fn(itemCtx(entry));
      } catch (error) {
        ctx.logger.error(`topbar item "${entry.id}" state check failed:`, error);
        return false;
      }
    };

    const buildItem = (entry) => {
      if (entry.render) {
        const el = entry.render(itemCtx(entry));
        return el;
      }
      const btn = h(
        "button.cc-topbar-btn",
        {
          type: "button",
          class: [entry.variant === "action" ? "action" : "", entry.danger ? "danger" : ""].join(" "),
          "aria-label": labelOf(entry),
          dataset: { tip: tipFor(entry), tipId: entry.tipId ?? `topbar.${entry.id}`, ...(entry.dataset ?? {}) },
          attrs: entry.hasMenu ? { "aria-haspopup": "menu", "aria-expanded": "false" } : undefined,
        },
        icon(typeof entry.icon === "function" ? entry.icon() : entry.icon ?? "plug"),
      );
      btn.addEventListener("click", guardCallback(ctx.logger, `topbar item "${entry.id}"`, () => entry.onClick?.(itemCtx(entry, btn))));
      if (entry.onContextMenu) {
        btn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          guardCallback(ctx.logger, `topbar item "${entry.id}" context menu`, () => entry.onContextMenu(event, itemCtx(entry, btn)))();
        });
      }
      return btn;
    };

    const refreshState = () => {
      for (const [id, el] of nodes) {
        const entry = items.get(id);
        if (!entry || entry.render) continue;
        const btn = el.querySelector?.("button.cc-topbar-btn") ?? el;
        btn.disabled = evaluate(entry.disabled, entry);
        btn.classList.toggle("active", evaluate(entry.active, entry));
        btn.dataset.tip = tipFor(entry);
        btn.setAttribute("aria-label", labelOf(entry));
        if (typeof entry.icon === "function") {
          const name = entry.icon();
          if (btn.dataset.iconName !== name) {
            btn.dataset.iconName = name;
            btn.querySelector("svg")?.replaceWith(icon(name));
          }
        }
      }
    };

    const render = () => {
      if (editing) return renderEditing();
      const layout = currentLayout();
      const { visible } = splitLayout(layout);
      const wanted = [];
      const fixed = items.get("workspaceTabs");
      if (fixed) wanted.push("workspaceTabs");
      for (const id of visible) {
        if (id === "workspaceTabs") continue;
        if (isFlex(id) || items.has(id)) wanted.push(id);
      }
      for (const [id, el] of nodes) {
        if (!wanted.includes(id) || (!isFlex(id) && nodes.get(id)?._entry !== items.get(id))) {
          el.remove();
          nodes.delete(id);
        }
      }
      const ordered = wanted.map((id) => {
        let el = nodes.get(id);
        if (!el) {
          if (isFlex(id)) el = h("div.cc-topbar-flex", { dataset: { item: id } });
          else {
            const entry = items.get(id);
            const built = renderSafely(ctx.logger, "topbar.item", id, () => buildItem(entry), null);
            if (!built) return null;
            el = h("div.cc-topbar-item", { class: entry.grow ? "grow" : "", dataset: { item: id } }, built);
            el._entry = entry;
          }
          nodes.set(id, el);
        }
        return el;
      }).filter(Boolean);
      ordered.forEach((el, i) => {
        if (bar.children[i] !== el) bar.insertBefore(el, bar.children[i] ?? null);
      });
      refreshState();
    };

    // ---- settings jump menu ----
    const openJumpMenu = (anchor) => {
      const layout = currentLayout();
      const { collapsed } = splitLayout(layout);
      const collapsedEntries = collapsed.filter((id) => !isFlex(id) && items.has(id)).map((id) => items.get(id));
      const toMenuItem = (entry) => ({
        label: labelOf(entry),
        icon: typeof entry.icon === "function" ? entry.icon() : entry.icon,
        hint: shortcutLabel(entry.shortcutAction),
        disabled: evaluate(entry.disabled, entry),
        onSelect: () => guardCallback(ctx.logger, `topbar item "${entry.id}"`, () => entry.onClick?.(itemCtx(entry, anchor)))(),
      });
      const extra = extraMenu.sorted().map((entry) => ({
        label: labelOf(entry),
        icon: entry.icon,
        submenu: entry.submenu ? () => entry.submenu({ host: ctx.host, ui, t }) : undefined,
        onSelect: entry.onSelect ? () => entry.onSelect({ host: ctx.host, ui, t }) : undefined,
      }));
      const shortcuts = SETTINGS_ITEM_IDS.filter((id) => !collapsed.includes(id) && items.has(id)).map((id) => items.get(id));
      const menuItems = [
        { label: t("topbar.customize"), icon: "customizeTopbar", onSelect: () => enterCustomize() },
        ...extra,
        collapsedEntries.length ? "separator" : null,
        ...collapsedEntries.map(toMenuItem),
        shortcuts.length ? "separator" : null,
        ...shortcuts.map(toMenuItem),
      ];
      ui.openMenu({ anchor, items: menuItems, align: "end", className: "wide" });
    };
    ctx.contribute("topbar.item", {
      id: "settingsJumpMenu",
      labelKey: "topbar.settingsJumpMenu",
      icon: "moreTools",
      required: true,
      hasMenu: true,
      shortcutAction: "openSettingsMenu",
      onClick: ({ anchor }) => openJumpMenu(anchor),
    });

    // ---- customize mode (§6.3) ----
    const enterCustomize = () => {
      ui.closeMenus();
      editing = { layout: currentLayout() };
      shellService.shell.dataset.topbarEditing = "true";
      render();
    };
    const exitCustomize = (save) => {
      if (!editing) return;
      if (save) ctx.settings.topbarLayout = serializeLayout(editing.layout);
      editing = null;
      delete shellService.shell.dataset.topbarEditing;
      palette?.remove();
      palette = null;
      bar.classList.remove("editing");
      clear(bar);
      nodes.clear();
      render();
    };
    let palette = null;
    let dragId = null;
    const renderEditing = () => {
      bar.classList.add("editing");
      clear(bar);
      nodes.clear();
      const line = h("div.cc-drop-line");
      const dropIndex = (x) => {
        const cells = [...bar.querySelectorAll(".cc-topbar-item, .cc-topbar-flex")];
        for (let i = 0; i < cells.length; i++) {
          const r = cells[i].getBoundingClientRect();
          if (x < r.left + r.width / 2) return i;
        }
        return cells.length;
      };
      const visibleIds = editing.layout.filter((id) => isFlex(id) || items.has(id) || id === "settingsJumpMenu");
      for (const id of visibleIds) {
        let el;
        if (isFlex(id)) el = h("div.cc-topbar-flex", { dataset: { item: id }, title: t("topbar.flex") });
        else {
          const entry = items.get(id);
          const label = entry ? labelOf(entry) : id;
          const preview = entry?.render ? h("div.cc-topbar-btn.action", icon(entry.icon ?? "keyboard")) : h("div.cc-topbar-btn", icon(typeof entry?.icon === "function" ? entry.icon() : entry?.icon ?? "plug"));
          el = h("div.cc-topbar-item", { dataset: { item: id, tip: label } }, preview);
        }
        el.draggable = true;
        el.addEventListener("dragstart", (event) => {
          dragId = id;
          el.classList.add("dragging");
          event.dataTransfer.setData("text/plain", id);
          event.dataTransfer.effectAllowed = "move";
        });
        el.addEventListener("dragend", () => {
          dragId = null;
          el.classList.remove("dragging");
          line.remove();
          palette?.classList.remove("removing");
        });
        bar.append(el);
      }
      bar.ondragover = (event) => {
        if (!dragId) return;
        event.preventDefault();
        const i = dropIndex(event.clientX);
        const cells = [...bar.querySelectorAll(".cc-topbar-item, .cc-topbar-flex")];
        bar.insertBefore(line, cells[i] ?? null);
      };
      bar.ondragleave = (event) => {
        if (!bar.contains(event.relatedTarget)) line.remove();
      };
      bar.ondrop = (event) => {
        event.preventDefault();
        if (!dragId) return;
        const cells = [...bar.querySelectorAll(".cc-topbar-item, .cc-topbar-flex")].filter((c) => c !== line);
        let i = dropIndex(event.clientX);
        const ids = cells.map((c) => c.dataset.item);
        const visibleOrder = ids.filter((x) => x !== dragId);
        const before = ids.slice(0, i).filter((x) => x !== dragId).length;
        visibleOrder.splice(before, 0, dragId);
        // Rebuild the layout keeping hidden (not-registered) ids at their relative places.
        const hiddenTail = editing.layout.filter((x) => !visibleOrder.includes(x) && !(isFlex(x) || items.has(x) || x === "settingsJumpMenu"));
        const newId = dragId === "flex" ? `flex:${Date.now().toString(36)}` : dragId;
        editing.layout = [...visibleOrder.map((x) => (x === "flex" ? newId : x)), ...hiddenTail];
        line.remove();
        render();
      };
      renderPalette();
    };
    const renderPalette = () => {
      palette?.remove();
      const placed = new Set(editing.layout);
      const candidates = items.sorted().filter((e) => !placed.has(e.id) && e.id !== "workspaceTabs" && !e.hiddenFromPalette);
      const cell = (id, label, iconName) => {
        const c = h("div.cc-palette-cell", { draggable: true, dataset: { item: id }, title: label }, icon(iconName ?? "plug", { size: 24 }), h("span", label));
        c.addEventListener("click", () => {
          const at = editing.layout.indexOf("settingsJumpMenu");
          const newId = id === "flex" ? `flex:${Date.now().toString(36)}` : id;
          editing.layout.splice(at >= 0 ? at : editing.layout.length, 0, newId);
          render();
        });
        c.addEventListener("dragstart", (event) => {
          dragId = id;
          event.dataTransfer.setData("text/plain", id);
        });
        c.addEventListener("dragend", () => (dragId = null));
        return c;
      };
      const grid = h("div.cc-palette-grid", candidates.map((e) => cell(e.id, labelOf(e), typeof e.icon === "function" ? e.icon() : e.icon)), cell("flex", t("topbar.flex"), "space"));
      palette = h(
        "div.cc-topbar-palette",
        h("div.hint", t("topbar.customize.hint")),
        candidates.length ? null : h("div.cc-empty", { style: { minHeight: "72px", marginBottom: "8px" } }, t("topbar.customize.allPlaced")),
        grid,
        h("div.cc-palette-actions",
          h("button.cc-btn.tall", { type: "button", onclick: () => exitCustomize(false) }, t("common.cancel")),
          h("button.cc-btn.tall.primary", { type: "button", onclick: () => exitCustomize(true) }, t("common.save"))),
      );
      palette.addEventListener("dragover", (event) => {
        if (!dragId || !editing.layout.includes(dragId)) return;
        event.preventDefault();
        palette.classList.toggle("removing", !REQUIRED_ITEMS.includes(dragId));
      });
      palette.addEventListener("dragleave", () => palette.classList.remove("removing"));
      palette.addEventListener("drop", (event) => {
        event.preventDefault();
        palette.classList.remove("removing");
        if (!dragId || !editing.layout.includes(dragId)) return;
        if (REQUIRED_ITEMS.includes(dragId) || items.get(dragId)?.required) {
          ui.toast(t("topbar.customize.required"), "warning");
          return;
        }
        editing.layout = editing.layout.filter((x) => x !== dragId);
        render();
      });
      shellService.topbarSlot.append(palette);
    };
    ctx.onDispose(() => palette?.remove());

    // ---- auto-hide (§6.4) lives in the TopbarAutoHide plugin; the shortcut turns that plugin on or off. ----
    const toggleVisibility = async () => {
      const result = await ctx.host.togglePlugin("TopbarAutoHide");
      if (result?.toggled && ctx.host.isPluginEnabled("TopbarAutoHide")) ui.toast(t("topbar.autoHideOn"), "info");
    };

    ctx.contribute("shortcut.action", { id: "toggleTopbar", labelKey: "topbar.visibility.auto", run: () => toggleVisibility() });
    ctx.contribute("shortcut.action", { id: "openSettingsMenu", labelKey: "topbar.settingsJumpMenu", run: () => openJumpMenu(nodes.get("settingsJumpMenu")?.querySelector("button")) });

    // ---- reactivity ----
    ctx.onDispose(items.subscribe(() => render()));
    ctx.onDispose(ctx.plugin.settings.use(["topbarLayout"], () => render()));
    ctx.events.on("I18n:languageChanged", () => {
      clear(bar);
      nodes.clear();
      render();
    });
    ctx.events.on("Shortcuts:changed", () => refreshState());
    ctx.events.on("configReloaded", () => render());
    ctx.services.provide("topbar", {
      refresh: () => refreshState(),
      rerender: () => render(),
      customize: () => enterCustomize(),
      isEditing: () => !!editing,
      element: bar,
      itemElement: (id) => nodes.get(id) ?? null,
      currentLayout,
      setLayout: (layout) => (ctx.settings.topbarLayout = serializeLayout(normalizeLayout(layout, catalog()))),
      toggleVisibility,
    });
    render();
  },
};
