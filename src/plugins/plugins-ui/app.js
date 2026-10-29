// PluginsUI: the "Plugins" settings section, plugin cards, plugin settings dialog and reload prompts (spec v1.2 §15).

import { h, icon, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { TAGS } from "../../kernel/define.js";
import { renderSettingsFields } from "../../lib/settings-form.js";

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/** Pure list logic for one tab (exported for tests). */
export function listForTab(host, tab, { query = "", filter = "all", now = Date.now() } = {}) {
  const meta = host.meta;
  const starred = meta.starredPlugins ?? [];
  const pinned = meta.pinnedPlugins ?? [];
  const visible = host.order.map((n) => host.plugins[n]).filter((p) => !p.hidden);
  const byName = (a, b) => a.name.localeCompare(b.name);
  const pinnedFirst = (list) => [
    ...pinned.map((n) => list.find((p) => p.name === n)).filter(Boolean),
    ...list.filter((p) => !pinned.includes(p.name)).sort(byName),
  ];
  let groups;
  if (tab === "favorites") {
    groups = [starred.map((n) => host.plugins[n]).filter((p) => p && !p.hidden)];
  } else if (tab === "recent") {
    groups = [visible.filter((p) => typeof p.updatedAt === "number" && now - p.updatedAt < RECENT_MS).sort((a, b) => b.updatedAt - a.updatedAt || byName(a, b))];
  } else if (tab === "user") {
    groups = [pinnedFirst(visible.filter((p) => p.userPlugin))];
  } else if (tab === "all") {
    groups = [pinnedFirst(visible.filter((p) => !p.required)), pinnedFirst(visible.filter((p) => p.required))];
  } else {
    groups = [pinnedFirst(visible.filter((p) => p.tags?.includes(tab)))];
  }
  const q = query.trim().toLowerCase();
  const matches = (p) => {
    if (q) {
      const text = `${p.name} ${host.t(p.description)}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    if (filter === "enabled") return host.isPluginEnabled(p.name);
    if (filter === "disabled") return !host.isPluginEnabled(p.name);
    return true;
  };
  return groups.map((g) => g.filter(matches));
}

/** `extraTabs`: tabs that have toolbar actions (the user tab shows its import button even when empty). */
export function tabsFor(host, extraTabs = []) {
  const visible = host.order.map((n) => host.plugins[n]).filter((p) => !p.hidden);
  return ["favorites", "recent", "all", ...(visible.some((p) => p.userPlugin) || extraTabs.includes("user") ? ["user"] : []), ...TAGS.filter((tag) => visible.some((p) => p.tags?.includes(tag)))];
}

export default {
  start(ctx) {
    const host = ctx.host;
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const meta = host.meta;
    const toolbar = ctx.extensionPoint("plugins.toolbar");
    const cardActions = ctx.extensionPoint("plugins.cardAction");

    // ---------------------------------------------------------------- reload prompt (§15.5)
    const reload = {
      initial: null, // name -> enabled when the section opened
      dismissed: false,
      pending: false,
      bannerHost: null,
    };
    const changedReloadPlugins = () => {
      if (!reload.initial) return [];
      return host.order.filter((name) => host.plugins[name].requiresReload && reload.initial.has(name) && reload.initial.get(name) !== host.isPluginEnabled(name));
    };
    const doReload = async (names) => {
      const onlyFrames = names.length > 0 && names.every((n) => host.plugins[n].content?.length && !host.plugins[n].app);
      if (onlyFrames && ctx.services.get("frames.reloadAll")) {
        ctx.services.get("frames.reloadAll")();
        reload.initial = snapshot();
        reload.pending = false;
        renderBanner();
        return;
      }
      ctx.events.emit("AppShell:beforeReload");
      try {
        await ctx.services.get("workspaceSession")?.persistNow?.();
      } catch (error) {
        ctx.logger.warn("Saving the workspace before reload failed:", error);
      }
      await host.settings.flush();
      location.reload();
    };
    const evaluateReload = (forced = false) => {
      const names = changedReloadPlugins();
      if (!forced && names.length === 0) {
        reload.pending = false;
        shellUi.closeModal("plugins-reload");
        renderBanner();
        return;
      }
      reload.pending = true;
      if (reload.dismissed) {
        renderBanner();
        return;
      }
      shellUi.confirm({
        title: t("plugins.reload.title"),
        description: t("plugins.reload.desc"),
        confirmText: t("plugins.reload.now"),
        cancelText: t("plugins.reload.later"),
        tone: "neutral",
      }).then((ok) => {
        if (ok) doReload(changedReloadPlugins());
        else {
          reload.dismissed = true;
          renderBanner();
        }
      });
    };
    const renderBanner = () => {
      const target = reload.bannerHost;
      if (!target) return;
      clear(target);
      if (!reload.pending || !reload.dismissed) return;
      target.append(h("div.cc-plugins-banner", icon("alert", { size: 16 }), h("span", t("plugins.reload.banner")),
        h("button.cc-btn.primary", { type: "button", onclick: () => doReload(changedReloadPlugins()) }, t("plugins.reload.now"))));
    };
    const snapshot = () => new Map(host.order.map((n) => [n, host.isPluginEnabled(n)]));
    ctx.events.on("reloadNeeded", () => evaluateReload(true));

    // ---------------------------------------------------------------- pin / star
    const toggleListMember = (key, name, event) => {
      const list = [...(meta[key] ?? [])];
      const i = list.indexOf(name);
      const on = i < 0;
      if (on) list.unshift(name);
      else list.splice(i, 1);
      meta[key] = list;
      ctx.events.emit(event, { name, [event === "pluginPin" ? "pinned" : "starred"]: on });
    };

    // ---------------------------------------------------------------- plugin settings dialog (§15.4)
    const openPluginSettings = (name, { fromSection = false } = {}) => {
      const plugin = host.plugins[name];
      if (!plugin) return false;
      if (!fromSection) {
        const settingsUI = ctx.services.get("settingsUI");
        settingsUI?.open("plugins", { args: { tab: "all", openPlugin: name } });
        return true;
      }
      shellUi.openModal(({ onClose }) => {
        const keys = host.visibleSettingKeys(name);
        const rows = renderSettingsFields(host, plugin, { onRestartNeeded: () => host.events.dispatch("reloadNeeded", { reason: name }) });
        const body = [
          plugin.authors?.length ? h("div.cc-plugin-dialog-meta", t("plugins.authors", { names: plugin.authors.join(", ") })) : null,
          keys.length ? h("div.cc-plugin-dialog-list", rows) : ui.emptyState(t("plugins.noSettings")),
        ];
        const reset = h("button.cc-btn.danger", { type: "button", disabled: keys.length === 0 }, t("plugins.reset"));
        reset.addEventListener("click", async () => {
          const ok = await shellUi.confirm({ title: t("plugins.reset.title", { name }), description: t("plugins.reset.desc"), confirmText: t("plugins.reset") });
          if (!ok) return;
          plugin.settings.reset();
          rows.dispose?.();
          onClose("reset");
          openPluginSettings(name, { fromSection: true });
        });
        return shellUi.modalLayout({
          title: name,
          subtitle: t(plugin.description),
          body,
          footer: [reset, h("span.spacer"), h("button.cc-btn.tall", { type: "button", onclick: () => onClose("done") }, t("common.close"))],
          onClose,
        });
      }, { key: `plugin-settings:${name}`, kind: "editor", className: "cc-plugin-dialog" });
      return true;
    };

    // ---------------------------------------------------------------- section
    const render = (container, sctx) => {
      reload.initial = snapshot();
      reload.dismissed = false;
      reload.pending = false;
      const state = { tab: sctx.args?.tab ?? "favorites", query: "", filter: "all" };
      const bannerHost = h("div");
      reload.bannerHost = bannerHost;
      const tabsBar = h("div.cc-subtabs.cc-plugins-tabs", { attrs: { role: "tablist" } });
      const search = ui.textInput({ onInput: (v) => {
        state.query = v;
        renderList();
      } });
      const filter = ui.select({
        value: "all",
        options: ["all", "enabled", "disabled"].map((v) => ({ value: v, label: t(`plugins.filter.${v}`) })),
        onChange: (v) => {
          state.filter = v;
          renderList();
        },
      });
      search.setAttribute("autofocus", "");
      filter.classList.add("cc-plugins-filter");
      const list = h("div");
      // Toolbar actions belong to one tab (e.g. Import plugin → User plugins) and sit in a bar
      // above that tab's cards, not in the search row shared by every tab.
      const toolTabs = () => [...new Set(toolbar.sorted().map((a) => a.tab).filter(Boolean))];
      const tabs = () => tabsFor(host, toolTabs());
      const toolbarFor = (tab) => {
        const actions = toolbar.sorted().filter((a) => a.tab === tab);
        if (!actions.length) return null;
        const hintKey = actions.find((a) => a.hintKey)?.hintKey;
        return h("div.cc-section-toolbar.cc-plugins-toolbar",
          h("span.desc", hintKey ? t(hintKey) : ""),
          ...actions.map((a) => ui.button({ label: t(a.labelKey), icon: a.icon, variant: "primary", onClick: () => a.onClick() })));
      };
      container.append(bannerHost, h("div.cc-plugins-top", tabsBar, h("div.cc-plugins-tools", search, filter)), list);

      const renderTabs = () => {
        clear(tabsBar);
        for (const tab of tabs()) {
          const label = ["favorites", "recent", "all", "user"].includes(tab) ? t(`plugins.tab.${tab}`) : t(`plugins.tag.${tab}`);
          tabsBar.append(h("button", { type: "button", attrs: { role: "tab", "aria-selected": String(tab === state.tab) }, onclick: () => {
            state.tab = tab;
            renderTabs();
            renderList();
          } }, label));
        }
      };

      // Card layout follows the Void++ plugin card: icon + name + badges | controls, description,
      // then a hairline and the authors footer.
      const card = (plugin) => {
        const name = plugin.name;
        const enabled = host.isPluginEnabled(name);
        const unmet = host.unmetRequirements(name);
        const dependents = host.dependents(name).filter((n) => host.isPluginEnabled(n));
        const locked = plugin.required || plugin.isDependency;
        const starred = (meta.starredPlugins ?? []).includes(name);
        const pinned = (meta.pinnedPlugins ?? []).includes(name);
        const failed = !plugin.required && host.hasFailed(name);
        const hintIcon = (iconName, tip, cls) => h(`span.hint.${cls}`, { dataset: { tip }, attrs: { tabindex: "0", role: "img", "aria-label": tip } }, icon(iconName, { size: 14 }));
        const badges = [];
        if (failed) badges.push(hintIcon("alert", t("plugins.failed"), "failed-icon"));
        // Plugins kept on by others look like required ones (Void++ dims both and explains why).
        const lockTip = plugin.required ? t("plugins.required") : plugin.isDependency ? t("plugins.dependedBy", { names: (dependents.length ? dependents : host.dependents(name)).join(", ") }) : null;
        if (lockTip) badges.push(hintIcon("circleAlert", lockTip, "required-icon"));
        if (plugin.dev) badges.push(ui.badge(t("plugins.badge.dev"), "muted"));
        if (unmet.length) {
          const b = ui.badge(t("plugins.badge.requires", { req: unmet.join(", ") }), "warning");
          b.dataset.tip = t("plugins.requires.tip", { req: unmet.join(", ") });
          badges.push(b);
        }
        if (host.isNew(name)) badges.push(ui.badge(t("plugins.badge.new")));
        const toggle = ui.toggleSwitch({
          checked: enabled,
          disabled: locked || unmet.length > 0,
          label: t("plugins.toggle", { name }),
          onChange: async () => {
            const result = await host.togglePlugin(name);
            if (result.toggled && result.reloadNeeded) evaluateReload();
            renderList();
          },
        });
        if (lockTip) toggle.dataset.tip = lockTip;
        toggle.dataset.tipWhenDisabled = "1";
        const controls = h("div.controls",
          ui.iconButton({ icon: starred ? "starFilled" : "star", compact: true, size: 14, label: t(starred ? "plugins.unstar" : "plugins.star"), className: starred ? "active" : "", onClick: () => {
            toggleListMember("starredPlugins", name, "pluginStar");
            renderList();
          } }),
          plugin.required ? null : ui.iconButton({ icon: pinned ? "pinOff" : "pin", compact: true, size: 14, label: t(pinned ? "plugins.unpin" : "plugins.pin"), className: pinned ? "active" : "", onClick: () => {
            toggleListMember("pinnedPlugins", name, "pluginPin");
            renderList();
          } }),
          host.visibleSettingKeys(name).length ? ui.iconButton({ icon: "settings", compact: true, size: 14, label: t("plugins.settings"), onClick: () => openPluginSettings(name, { fromSection: true }) }) : null,
          ...cardActions.sorted().filter((a) => a.appliesTo?.(plugin) ?? true).map((a) => ui.iconButton({ icon: a.icon, compact: true, size: 14, label: t(a.labelKey), onClick: () => a.onClick(plugin) })),
          toggle,
        );
        return h("article.cc-plugin-card", { class: [locked ? "required" : "", failed ? "failed" : ""].filter(Boolean).join(" "), dataset: { plugin: name } },
          h("div.body",
            h("div.row", h("div.name", h("span.glyph", icon(plugin.icon ?? "plug", { size: 14 })), h("span.title", { dataset: { tip: name } }, name), badges), controls),
            plugin.description ? h("div.desc", t(plugin.description)) : null),
          h("div.sep"),
          h("div.footer", h("span.authors", plugin.authors?.length ? plugin.authors.join(", ") : " ")),
        );
      };

      const renderList = () => {
        clear(list);
        const groups = listForTab(host, state.tab, { query: state.query, filter: state.filter });
        const total = listForTab(host, state.tab).reduce((n, g) => n + g.length, 0);
        search.placeholder = t("plugins.search", { count: total });
        const count = groups.reduce((n, g) => n + g.length, 0);
        const bar = toolbarFor(state.tab);
        if (bar) list.append(bar);
        if (count === 0) {
          const key = state.query ? "plugins.empty.search" : state.tab === "favorites" ? "plugins.empty.favorites" : state.tab === "recent" ? "plugins.empty.recent" : state.tab === "user" ? "plugins.empty.user" : "plugins.empty.other";
          list.append(ui.emptyState(t(key)));
          return;
        }
        groups.forEach((group, i) => {
          if (!group.length) return;
          if (i > 0) list.append(h("div.cc-plugins-divider", { attrs: { role: "separator", "aria-label": t("plugins.requiredGroup") } }));
          list.append(h("div.cc-plugins-grid", group.map(card)));
        });
      };

      renderTabs();
      renderList();
      renderBanner();
      const offToggle = host.events.subscribe("pluginToggle", () => renderList());
      const offConfig = host.events.subscribe("configReloaded", () => renderList());
      // Plugins added or removed at runtime (user plugins) change the tabs as well as the list.
      const syncTabs = () => {
        if (!tabs().includes(state.tab)) state.tab = "all";
        renderTabs();
        renderList();
      };
      const offChanged = host.events.subscribe("pluginsChanged", (data) => {
        if (data?.showTab && tabs().includes(data.showTab)) state.tab = data.showTab;
        syncTabs();
      });
      const offActions = cardActions.subscribe(() => renderList());
      const offToolbar = toolbar.subscribe(syncTabs);
      sctx.onDispose(() => {
        offToggle();
        offConfig();
        offChanged();
        offActions();
        offToolbar();
        reload.bannerHost = null;
        reload.initial = null;
      });
      if (sctx.args?.openPlugin) queueMicrotask(() => openPluginSettings(sctx.args.openPlugin, { fromSection: true }));
    };

    ctx.contribute("settings.section", {
      id: "plugins",
      titleKey: "plugins.section.title",
      descKey: "plugins.section.desc",
      icon: "plug",
      order: -1000,
      group: "plugins",
      topbarItem: false,
      render,
    });
    ctx.services.provide("pluginsUI", { openPluginSettings: (name) => openPluginSettings(name) });
  },
};
