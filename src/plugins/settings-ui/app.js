// SettingsUI: the settings dialog (workspace page) and the options page, built from `settings.section`.

import { h, icon, clear } from "../../lib/dom.js";
import { renderSafely } from "../../kernel/extension-points.js";

export default {
  start(ctx) {
    const ui = ctx.services.get("ui");
    const shell = ctx.services.get("shell");
    const t = ctx.t;
    const sections = ctx.extensionPoint("settings.section");
    // Other plugins may reorder or hide sidebar entries; each layout maps the sorted list to a new one.
    const layouts = ctx.extensionPoint("settings.navLayout");
    const navEntries = () => {
      let list = sections.sorted();
      for (const layout of layouts.sorted()) {
        const next = renderSafely(ctx.logger, "settings.navLayout", layout.id, () => layout.apply(list), null);
        if (Array.isArray(next)) list = next;
      }
      return list;
    };
    let view = null; // { root, nav, main, current, dispose[] , modal }
    let lastSection = null;

    const sectionCtx = (entry, disposers, rerender) => ({
      host: ctx.host,
      ui,
      t,
      section: entry,
      onDispose: (fn) => disposers.push(fn),
      rerender,
      openSection: (id, opts) => open(id, opts),
      services: ctx.host.services,
    });

    const build = (initialId, { page = false, options = {} } = {}) => {
      const nav = h("nav.cc-settings-list", { attrs: { "aria-label": t("settings.title") } });
      const head = h("div.cc-settings-head");
      const body = h("div.cc-settings-body");
      const root = h("div.cc-settings", { class: page ? "page" : "" },
        h("div.cc-settings-nav", h("div.cc-settings-brand", icon("settings", { size: 20 }), h("span.cc-settings-brand-label", t("settings.title"))), nav),
        h("div.cc-settings-main", head, body));
      const state = { root, nav, head, body, current: null, disposers: [], options };

      const renderNav = () => {
        clear(nav);
        let lastGroup;
        for (const entry of navEntries()) {
          if (lastGroup !== undefined && entry.group !== lastGroup) nav.append(h("div.cc-settings-sep"));
          lastGroup = entry.group;
          nav.append(h("button.cc-settings-link", {
            type: "button",
            dataset: { section: entry.id },
            attrs: { "aria-current": entry.id === state.current ? "page" : null },
            onclick: () => show(entry.id),
          }, icon(entry.icon ?? "settings", { size: 15 }), h("span", entry.titleKey ? t(entry.titleKey) : entry.id)));
        }
      };

      const disposeSection = () => {
        for (const fn of state.disposers.splice(0)) {
          try {
            fn();
          } catch (error) {
            ctx.logger.error("Settings section cleanup failed:", error);
          }
        }
      };

      const show = (id, opts = {}) => {
        const list = sections.sorted();
        const entry = sections.get(id) ? { ...sections.get(id), id } : list[0];
        disposeSection();
        clear(head);
        clear(body);
        state.current = entry?.id ?? null;
        lastSection = state.current;
        renderNav();
        const brand = root.querySelector(".cc-settings-brand-label");
        if (brand) brand.textContent = t("settings.title");
        nav.setAttribute("aria-label", t("settings.title"));
        const actions = [];
        if (!page) {
          const maxBtn = h("button.cc-window-btn", { type: "button", "aria-label": t("common.maximize"), dataset: { tip: t("common.maximize") } }, icon("maximize", { size: 15 }));
          maxBtn.addEventListener("click", () => {
            const on = !root.classList.contains("maximized");
            root.classList.toggle("maximized", on);
            maxBtn.replaceChildren(icon(on ? "minimize" : "maximize", { size: 15 }));
          });
          actions.push(maxBtn, h("button.cc-window-btn", { type: "button", "aria-label": t("common.close"), dataset: { tip: t("common.close") }, onclick: () => close() }, icon("x", { size: 16 })));
        }
        if (!entry) {
          head.append(h("div.titles", h("h2", t("settings.title"))), ...actions);
          body.append(h("div.cc-empty", t("settings.empty")));
          return;
        }
        head.append(h("div.titles", h("h2", entry.titleKey ? t(entry.titleKey) : entry.id), entry.descKey ? h("p", t(entry.descKey)) : null), ...actions);
        const rerender = () => show(entry.id, { ...opts, rerender: true });
        renderSafely(ctx.logger, "settings.section", entry.id, () => entry.render(body, { ...sectionCtx(entry, state.disposers, rerender), args: opts.args ?? state.options.args }), () => body.append(h("div.cc-empty", t("settings.sectionFailed"))));
        // A section that opens on a search box (Plugins) gets the caret, once the dialog has placed its own.
        if (!opts.rerender) requestAnimationFrame(() => body.querySelector("[autofocus]")?.focus({ preventScroll: true }));
      };

      state.show = show;
      state.renderNav = renderNav;
      state.dispose = () => disposeSection();
      show(initialId);
      return state;
    };

    const open = (sectionId, opts = {}) => {
      if (shell.page === "options") {
        view?.show(sectionId ?? view.current, opts);
        return;
      }
      if (view) {
        view.show(sectionId ?? view.current, opts);
        return;
      }
      ui.closeMenus();
      view = build(sectionId ?? lastSection, { options: opts });
      const modal = ui.openModal(() => view.root, {
        key: "settings",
        kind: "viewer",
        bare: true,
        onClose: () => {
          view?.dispose();
          view = null;
        },
      });
      view.modal = modal;
    };
    const close = () => view?.modal?.close("api");

    if (shell.page === "options") {
      view = build(new URLSearchParams(location.hash.slice(1)).get("section"), { page: true });
      shell.workspaceSlot.append(view.root);
      ctx.onDispose(() => view?.root.remove());
    }

    // Keep the dialog in sync with section registrations and language changes.
    ctx.onDispose(sections.subscribe(() => {
      if (!view) return;
      if (view.current && !sections.has(view.current)) view.show(null);
      else view.renderNav();
    }));
    ctx.onDispose(layouts.subscribe(() => view?.renderNav()));
    ctx.events.on("I18n:languageChanged", () => view?.show(view.current));
    ctx.onDispose(() => close());

    // Top bar: the gear (SettingsShortcuts adds one item per section).
    ctx.contribute("topbar.item", {
      id: "settings",
      labelKey: "settings.open",
      icon: "settings",
      required: true,
      shortcutAction: "openSettings",
      onClick: () => open(),
    });
    ctx.contribute("shortcut.action", { id: "openSettings", labelKey: "settings.open", run: () => open() });
    ctx.services.provide("settingsUI", {
      open,
      close,
      isOpen: () => !!view,
      currentSection: () => view?.current ?? null,
    });
  },
};
