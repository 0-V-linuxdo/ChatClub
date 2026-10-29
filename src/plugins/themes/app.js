// Themes: online and local CSS themes stored in the kernel metadata namespace (spec v1.2 §9.5, §12.3).

import { h, clear, uid, icon } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { checkThemeUrl, parseThemeMeta, nameFromUrl } from "./model.js";

export default {
  start(ctx) {
    const meta = ctx.host.meta;
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const styleId = (theme) => `theme-${theme.id}`;
    const themes = () => (Array.isArray(meta.themes) ? meta.themes.map((th) => ({ ...th })) : []);
    const saveThemes = (list) => (meta.themes = list);

    const download = async (url) => {
      const result = await ctx.background.request("fetchCss", { url });
      if (!result.ok) throw Object.assign(new Error(t("themes.error.download", { status: result.status })), { code: "download" });
      if (!result.text.trim()) throw Object.assign(new Error(t("themes.error.empty")), { code: "empty" });
      return result.text;
    };

    const isActive = (theme) => meta.themesEnabled !== false && theme.enabled && (theme.kind === "local" || meta.onlineThemesEnabled !== false);

    const cssFor = async (theme) => {
      if (theme.kind === "local") return theme.css ?? "";
      const cached = await ctx.storage.get(`css:${theme.id}`);
      if (cached) return cached;
      const text = await download(theme.url);
      await ctx.storage.set(`css:${theme.id}`, text);
      return text;
    };

    const applyOne = async (theme) => {
      if (!isActive(theme)) {
        ctx.styles.disable(styleId(theme));
        return;
      }
      const css = await cssFor(theme);
      // The user may have turned the theme off while it was downloading.
      const current = themes().find((th) => th.id === theme.id);
      if (!current || !isActive(current)) return;
      ctx.styles.register(styleId(theme), css);
    };

    const applyAll = () =>
      Promise.allSettled(themes().map((theme) => applyOne(theme).catch((error) => ctx.logger.warn(`Theme "${theme.name}" failed to load:`, error.message))));

    const known = new Set();
    const sync = () => {
      const ids = new Set(themes().map((th) => th.id));
      for (const id of known) if (!ids.has(id)) ctx.styles.disable(`theme-${id}`);
      known.clear();
      ids.forEach((id) => known.add(id));
      applyAll();
    };
    sync();
    ctx.onDispose(ctx.host.plugins.Settings.settings.use(["themes", "themesEnabled", "onlineThemesEnabled"], sync));

    const addOnline = async (rawUrl) => {
      const code = checkThemeUrl(rawUrl);
      if (code) throw new Error(t(`themes.error.${code}`));
      const url = new URL(rawUrl.trim()).href;
      if (themes().some((th) => th.url === url)) throw new Error(t("themes.error.duplicate"));
      const css = await download(url);
      const info = parseThemeMeta(css, nameFromUrl(url));
      const theme = { id: uid("th"), kind: "online", url, name: info.name, author: info.author ?? "", description: info.description ?? "", enabled: false, addedAt: Date.now() };
      await ctx.storage.set(`css:${theme.id}`, css);
      saveThemes([...themes(), theme]);
      return theme;
    };

    const saveLocal = (existing, name, css) => {
      if (!name.trim()) throw new Error(t("themes.error.name"));
      const info = parseThemeMeta(css, name.trim());
      const list = themes();
      if (existing) {
        const i = list.findIndex((th) => th.id === existing.id);
        list[i] = { ...list[i], name: name.trim(), css, author: info.author ?? "", description: info.description ?? "" };
        saveThemes(list);
        if (isActive(list[i])) ctx.styles.register(styleId(list[i]), css);
        return list[i];
      }
      const theme = { id: uid("th"), kind: "local", name: name.trim(), css, author: info.author ?? "", description: info.description ?? "", enabled: false, addedAt: Date.now() };
      saveThemes([...list, theme]);
      return theme;
    };

    const editLocal = (existing) => {
      shellUi.openModal(({ onClose }) => {
        const name = ui.textInput({ value: existing?.name ?? "", placeholder: t("themes.localName") });
        const css = ui.textArea({ value: existing?.css ?? "", mono: true, rows: 14 });
        const nameRow = ui.field({ label: t("themes.localName"), control: name });
        const save = h("button.cc-btn.tall.primary", { type: "button" }, t("themes.save"));
        save.addEventListener("click", () => {
          try {
            saveLocal(existing, name.value, css.value);
            onClose("save");
          } catch (error) {
            nameRow.setError(error.message);
          }
        });
        // Live preview of an enabled theme while editing.
        if (existing) css.addEventListener("input", () => isActive(existing) && ctx.styles.register(styleId(existing), css.value));
        return shellUi.modalLayout({
          title: existing ? existing.name : t("themes.addLocal"),
          body: [nameRow, h("div", { style: { marginTop: "12px" } }, css)],
          footer: [h("button.cc-btn.tall", { type: "button", onclick: () => onClose("cancel") }, t("common.cancel")), save],
          onClose,
        });
      }, { key: "theme-editor", kind: "editor", size: "wide" });
    };

    // Its own section next to Plugins, like the Themes tab of Void++.
    ctx.contribute("settings.section", {
      id: "themes",
      titleKey: "themes.card",
      descKey: "plugin.Themes.description",
      icon: "palette",
      order: -990,
      group: "plugins",
      topbarItem: false,
      render(container, gctx) {
        const list = h("div");
        const urlInput = ui.textInput({ placeholder: t("themes.urlPlaceholder") });
        let addRow;
        const addBtn = ui.button({ label: t("themes.add"), icon: "plus", onClick: async () => {
          addBtn.disabled = true;
          try {
            const theme = await addOnline(urlInput.value);
            urlInput.value = "";
            addRow.setError("");
            shellUi.toast(t("themes.added", { name: theme.name }), "success");
          } catch (error) {
            addRow.setError(error.message);
          } finally {
            addBtn.disabled = false;
          }
        } });
        addRow = ui.field({ label: t("themes.addOnline"), control: h("div", { style: { display: "flex", gap: "8px", width: "100%" } }, urlInput, addBtn) });
        const renderList = () => {
          clear(list);
          const all = themes();
          if (!all.length) {
            list.append(ui.emptyState(t("themes.empty")));
            return;
          }
          // Theme cards share the Void++ card layout with plugin cards.
          const grid = h("div.cc-plugins-grid");
          for (const theme of all) {
            const toggle = ui.toggleSwitch({ checked: theme.enabled, label: theme.name, onChange: (on) => {
              saveThemes(themes().map((th) => (th.id === theme.id ? { ...th, enabled: on } : th)));
            } });
            const controls = h("div.controls",
              theme.kind === "local"
                ? ui.iconButton({ icon: "edit", compact: true, size: 14, label: t("themes.edit"), onClick: () => editLocal(theme) })
                : ui.iconButton({ icon: "copy", compact: true, size: 14, label: t("themes.copyUrl"), onClick: () => navigator.clipboard?.writeText(theme.url).then(() => shellUi.toast(t("themes.copied"), "success"), () => {}) }),
              ui.iconButton({ icon: "trash", compact: true, size: 14, label: t("themes.delete"), onClick: () => {
                saveThemes(themes().filter((th) => th.id !== theme.id));
                ctx.styles.disable(styleId(theme));
                ctx.storage.remove(`css:${theme.id}`);
                shellUi.toast(t("themes.deleted", { name: theme.name }), "message");
              } }),
              toggle);
            const desc = theme.description || (theme.kind === "local" ? "" : theme.url);
            grid.append(h("article.cc-plugin-card", { dataset: { theme: theme.id } },
              h("div.body",
                h("div.row", h("div.name", h("span.glyph", icon("palette", { size: 14 })), h("span.title", { dataset: { tip: theme.name } }, theme.name)), controls),
                desc ? h("div.desc", desc) : null),
              h("div.sep"),
              h("div.footer", h("span.hint", icon(theme.kind === "local" ? "folder" : "globe", { size: 12 })), h("span.authors", theme.author || (theme.kind === "local" ? t("themes.local") : " ")))));
          }
          list.append(grid);
        };
        const settingsStore = meta;
        const topRows = [
          ui.field({ label: t("themes.enabled"), control: ui.toggleSwitch({ checked: settingsStore.themesEnabled !== false, onChange: (on) => (settingsStore.themesEnabled = on) }) }),
          ui.field({ label: t("themes.online"), desc: t("themes.online.desc"), control: ui.toggleSwitch({ checked: settingsStore.onlineThemesEnabled !== false, onChange: (on) => (settingsStore.onlineThemesEnabled = on) }) }),
          addRow,
          ui.field({ label: t("themes.addLocal"), control: ui.button({ label: t("themes.addLocal"), icon: "plus", onClick: () => editLocal(null) }) }),
        ];
        container.append(ui.card({ title: t("themes.card"), body: topRows }), ui.card({ title: t("themes.installed"), body: list }));
        renderList();
        gctx.onDispose(ctx.host.plugins.Settings.settings.use(["themes"], renderList));
      },
    });
  },
};
