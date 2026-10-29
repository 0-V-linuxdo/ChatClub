// MessageNavigator (page): per-iframe on/off state, the group button and shortcut, re-applying after a
// frame reloads, and the messageNavigation settings section (v2 05 §3, 06 §7).

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { settingsTable, reorderButtonsOn } from "../../lib/settings-table.js";
import { NAVIGATOR_EFFECTS, playEffect } from "../../lib/navigator-effects.js";
import { ADAPTERS, EXTRA_PRESETS, effectiveConfigs, storedConfigs, resolveConfig, validateConfig, frameConfig, clampSummary } from "./model.js";

const CAP = "message-navigator";
const TOP_OFFSET = 64;
const STYLE = String.raw`
.cc-nav-sample { margin-top: 12px; padding: 14px 16px; border-radius: 8px; background: var(--panel-2); border: 1px solid var(--line); line-height: 1.5; }
`;

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const sites = ctx.services.get("sites");
    const workspace = ctx.services.get("workspace");
    const transport = ctx.services.get("frames.transport");
    const frames = ctx.services.get("frames");
    // Without a workspace (the options page) only the settings section is useful; the rest stays off.
    const live = !!(workspace && transport);
    ctx.styles.register("message-navigator", STYLE);

    // ------------------------------------------------------------ configs
    const builtins = () => [...sites.capability("navigator").map(({ data }) => ({ ...data })), ...EXTRA_PRESETS.map((p) => ({ ...p }))];
    const configs = () => effectiveConfigs(builtins(), ctx.settings.messageNavigatorSiteConfigs);
    const saveConfigs = (list) => {
      ctx.settings.messageNavigatorSiteConfigs = storedConfigs(builtins(), list);
    };
    const tabInfo = (tab) => ({ appId: tab?.appId, href: tab ? workspace.currentHrefSync?.(tab.id) ?? tab.href : "" });
    const primary = () => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#10a37f";
    const unwrap = (r) => (r && typeof r === "object" && "result" in r ? r.result : r);

    // ------------------------------------------------------------ per-frame state (05 §3.3)
    const on = new Set(); // frameKeys the user turned the navigator on for
    const send = (frameKey, command, payload = {}, timeoutMs = 2000) =>
      transport.send(frameKey, { capability: CAP, command, payload }, { timeoutMs }).then(unwrap);
    const apply = (tab, enabled) => {
      const { config } = resolveConfig(configs(), tabInfo(tab));
      return send(tab.frameKey, "setMessageNavigator", {
        enabled,
        config: frameConfig(config),
        effectMode: ctx.settings.messageNavigatorEffectMode,
        topOffset: TOP_OFFSET,
        color: primary(),
      }, 6000);
    };
    const refreshButtons = () => workspace.refreshButtons?.();

    const toggle = async (tab) => {
      if (!tab?.frameKey || (frames && !frames.isRegistered(tab.frameKey))) {
        shellUi.toast(t("nav.toast.noFrame"), "warning");
        return;
      }
      const want = !on.has(tab.frameKey);
      if (want) {
        const resolved = resolveConfig(configs(), tabInfo(tab));
        if (resolved.disabled) {
          shellUi.toast(t("nav.toast.disabled"), "warning");
          return;
        }
      }
      let state;
      try {
        state = await apply(tab, want);
      } catch (error) {
        if (want) shellUi.toast(t("nav.toast.failed", { reason: error?.message || String(error) }), "error");
        return;
      }
      if (!want) {
        on.delete(tab.frameKey);
        refreshButtons();
        shellUi.toast(t("nav.toast.off"), "info");
        return;
      }
      if (!state?.supported) {
        await apply(tab, false).catch(() => {});
        shellUi.toast(t("nav.toast.unsupported"), "warning");
        return;
      }
      on.add(tab.frameKey);
      refreshButtons();
      shellUi.toast(state.count ? t("nav.toast.on", { n: state.count }) : t("nav.toast.empty"), state.count ? "success" : "info");
    };

    // A frame that reloads loses its in-page state; put it back (05 §3.3).
    const reapply = ({ frameKey }) => {
      if (!frameKey || !on.has(frameKey)) return;
      const tab = workspace.groups().flatMap((g) => g.tabs).find((tb) => tb.frameKey === frameKey);
      if (!tab) {
        on.delete(frameKey);
        return;
      }
      apply(tab, true).catch(() => {});
    };
    if (live) ctx.events.on("frameRegistered", reapply);
    if (live) ctx.events.on("Workspace:tabLoaded", reapply);
    if (live) ctx.events.on("Workspace:changed", () => {
      const live = new Set(workspace.groups().flatMap((g) => g.tabs.map((tb) => tb.frameKey)));
      for (const key of [...on]) if (!live.has(key)) on.delete(key);
    });
    // Settings changes reach frames that have the navigator on.
    ctx.onDispose(ctx.plugin.settings.use(["messageNavigatorEffectMode", "messageNavigatorSiteConfigs"], () => {
      for (const frameKey of on) reapply({ frameKey });
    }));

    if (live) ctx.contribute("tabGroup.button", {
      id: "messageNavigator",
      icon: "navigator",
      labelKey: "nav.group",
      tipId: "workspace.group.messageNavigator",
      defaultPlacement: "pinned",
      shortcutAction: "toggleMessageNavigator",
      order: 35,
      toggle: true,
      active: (g) => !!g.tab?.frameKey && on.has(g.tab.frameKey),
      disabled: (g) => !g.tab?.frameKey,
      onClick: (g) => toggle(g.contextTab ?? g.tab),
    });
    if (live) ctx.contribute("shortcut.action", {
      id: "toggleMessageNavigator",
      labelKey: "nav.shortcut",
      run: (_match, source) => {
        const group = workspace.currentGroup(source);
        const tab = group ? group.tabs[group.activeIndex] : null;
        if (!tab) {
          shellUi.toast(t("nav.toast.noFrame"), "warning");
          return;
        }
        toggle(tab);
      },
    });

    if (live) ctx.services.provide("messageNavigator", {
      /** Whether an app has an enabled navigator config (TopicTitle asks before reading the opening). */
      supports: (appId) => configs().some((c) => c.enabled !== false && c.appIds?.includes(appId)),
      isOn: (frameKey) => on.has(frameKey),
      toggle,
      configs,
      opening: (tab) => send(tab.frameKey, "getConversationOpening", { config: frameConfig(resolveConfig(configs(), tabInfo(tab)).config) }, 2500),
    });

    // ------------------------------------------------------------ settings section (06 §7)
    const lines = (el) => el.value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const adapterLabel = (id) => (id === "generic" ? t("nav.adapter.generic") : builtins().find((b) => b.id === id || b.adapter === id)?.name ?? id);
    const presetOf = (adapter) => builtins().find((b) => b.id === adapter || b.adapter === adapter);

    const openEditor = (existing, onSaved) => {
      const isNew = !existing;
      const draft = existing ? structuredClone(existing) : { id: `custom-${Date.now().toString(36)}`, name: "", enabled: true, adapter: "generic", appIds: [], hosts: [], pathPrefixes: [], messageSelector: "", userSelector: "", assistantSelector: "", textCleanupSelectors: [], summaryMaxChars: 60, builtIn: false };
      shellUi.openModal(({ onClose }) => {
        const name = ui.textInput({ value: draft.name });
        const appIds = ui.textArea({ value: draft.appIds.join("\n"), rows: 2, mono: true });
        const hosts = ui.textArea({ value: draft.hosts.join("\n"), rows: 2, mono: true });
        const paths = ui.textArea({ value: draft.pathPrefixes.join("\n"), rows: 2, mono: true });
        const message = ui.textInput({ value: draft.messageSelector, mono: true });
        const user = ui.textInput({ value: draft.userSelector, mono: true });
        const assistant = ui.textInput({ value: draft.assistantSelector, mono: true });
        const cleanup = ui.textArea({ value: draft.textCleanupSelectors.join("\n"), rows: 2, mono: true });
        const summary = ui.textInput({ value: String(draft.summaryMaxChars), type: "number" });
        // Picking an adapter fills empty selectors from that adapter's preset.
        const adapter = ui.select({
          value: draft.adapter,
          options: ADAPTERS.map((a) => ({ value: a, label: adapterLabel(a) })),
          onChange: (v) => {
            const p = presetOf(v);
            if (!p) return;
            if (!message.value.trim()) message.value = p.messageSelector ?? "";
            if (!user.value.trim()) user.value = p.userSelector ?? "";
            if (!assistant.value.trim()) assistant.value = p.assistantSelector ?? "";
            if (!cleanup.value.trim()) cleanup.value = [].concat(p.textCleanupSelectors ?? []).join("\n");
          },
        });
        const error = h("div.error", { hidden: true, style: { color: "var(--danger)", fontSize: "13px" } });
        const save = () => {
          const next = {
            ...draft,
            name: name.value.trim(),
            appIds: lines(appIds),
            hosts: lines(hosts),
            pathPrefixes: lines(paths),
            adapter: adapter.value,
            messageSelector: message.value.trim(),
            userSelector: user.value.trim(),
            assistantSelector: assistant.value.trim(),
            textCleanupSelectors: lines(cleanup),
            summaryMaxChars: clampSummary(summary.value),
          };
          const bad = validateConfig(next);
          if (bad) {
            error.textContent = t(bad);
            error.hidden = false;
            return;
          }
          const list = configs();
          const i = list.findIndex((c) => c.id === next.id);
          if (i >= 0) list[i] = next;
          else list.push(next);
          saveConfigs(list);
          shellUi.toast(t("nav.sites.saved"), "success");
          onClose("save");
          onSaved?.();
        };
        const grid = (...kids) => h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" } }, ...kids);
        const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
          grid(ui.field({ label: t("nav.sites.field.name"), control: name }), ui.field({ label: t("nav.sites.field.adapter"), control: adapter })),
          grid(ui.field({ label: t("nav.sites.field.appIds"), control: appIds }), ui.field({ label: t("nav.sites.field.hosts"), control: hosts })),
          ui.field({ label: t("nav.sites.field.paths"), control: paths }),
          ui.field({ label: t("nav.sites.field.message"), control: message }),
          grid(ui.field({ label: t("nav.sites.field.user"), control: user }), ui.field({ label: t("nav.sites.field.assistant"), control: assistant })),
          grid(ui.field({ label: t("nav.sites.field.cleanup"), control: cleanup }), ui.field({ label: t("nav.sites.field.summary"), control: summary })),
          error);
        return shellUi.modalLayout({ title: t(isNew ? "nav.sites.add" : "nav.sites.edit"), icon: "navigator", body, onClose, footer: [ui.button({ label: t("nav.cancel"), onClick: () => onClose("cancel") }), ui.button({ label: t("nav.ok"), variant: "primary", onClick: save })] });
      }, { kind: "editor", size: "wide" });
    };

    const renderEffect = (container) => {
      const sample = h("div.cc-nav-sample", { style: { "--chatclub-nav-color": primary() } }, t("nav.effect.sample"));
      const select = ui.select({
        value: ctx.settings.messageNavigatorEffectMode,
        options: NAVIGATOR_EFFECTS.map((m) => ({ value: m, label: t(`nav.effect.${m}`) })),
        onChange: (v) => {
          ctx.settings.messageNavigatorEffectMode = v;
          playEffect(sample, v);
        },
      });
      const preview = ui.button({ label: t("nav.effect.preview"), icon: "preview", onClick: () => playEffect(sample, ctx.settings.messageNavigatorEffectMode) });
      container.append(ui.card({ title: t("nav.effect.title"), body: h("div", ui.field({ label: t("nav.effect.title"), desc: t("nav.effect.desc"), control: h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, select, preview) }), sample) }));
    };

    const renderSites = (box) => {
      const draw = () => {
        clear(box);
        const list = configs();
        box.append(h("div.cc-section-toolbar", h("span.desc", t("nav.sites.desc")), ui.button({ label: t("nav.sites.add"), icon: "plus", variant: "primary", onClick: () => openEditor(null, draw) })));
        box.append(settingsTable({
          t,
          rows: list,
          moveButtons: reorderButtonsOn(ctx.host),
          onReorder: (ids) => {
            saveConfigs(ids.map((id) => list.find((c) => c.id === id)));
            shellUi.toast(t("nav.sites.orderSaved"), "success");
            draw();
          },
          columns: [
            { label: t("nav.sites.col.name"), width: "minmax(140px, 1fr)", render: (c) => h("div",
              h("strong", c.name),
              h("div", { style: { fontSize: "12px", color: "var(--muted)" } }, t(!c.builtIn ? "nav.sites.custom" : c.overridden ? "nav.sites.overridden" : "nav.sites.builtin"))) },
            { label: t("nav.sites.col.scope"), width: "minmax(160px, 1.4fr)", render: (c) => {
              const text = [c.appIds.join(", "), c.hosts.join(", "), c.pathPrefixes.join(", ")].filter(Boolean).join(" · ");
              return h("span.cell-ellipsis", { attrs: { title: text } }, text);
            } },
            { label: t("nav.sites.col.adapter"), width: "minmax(90px, .7fr)", render: (c) => h("span", adapterLabel(c.adapter)) },
            { label: t("nav.sites.col.enabled"), width: "72px", render: (c) => ui.toggleSwitch({ checked: c.enabled !== false, onChange: (v) => saveConfigs(configs().map((x) => (x.id === c.id ? { ...x, enabled: v } : x))) }) },
          ],
          actions: (c) => [
            ui.iconButton({ icon: "edit", label: t("nav.sites.edit"), tipId: "settings.action.edit", onClick: () => openEditor(c, draw) }),
            c.builtIn && c.overridden ? ui.iconButton({ icon: "reset", label: t("nav.sites.reset"), onClick: () => {
              // Keep the entry's place in the order, drop its changed fields.
              ctx.settings.messageNavigatorSiteConfigs = (ctx.settings.messageNavigatorSiteConfigs ?? []).map((x) => (x.id === c.id ? { id: c.id, builtIn: true } : x));
              shellUi.toast(t("nav.sites.resetDone"), "success");
              draw();
            } }) : null,
            !c.builtIn ? ui.iconButton({ icon: "trash", label: t("nav.sites.delete"), className: "danger", tipId: "settings.action.delete", onClick: async () => {
              if (!(await shellUi.confirm({ title: t("nav.sites.deleteTitle", { name: c.name }), danger: true }))) return;
              saveConfigs(configs().filter((x) => x.id !== c.id));
              shellUi.toast(t("nav.sites.deleted"), "success");
              draw();
            } }) : null,
          ],
        }));
      };
      draw();
    };

    ctx.contribute("settings.section", {
      id: "messageNavigation",
      titleKey: "nav.section.title",
      descKey: "nav.section.desc",
      icon: "navigator",
      order: 50,
      group: "features",
      render(container) {
        renderEffect(container);
        const box = h("div");
        container.append(ui.card({ title: t("nav.sites.title"), body: box }));
        renderSites(box);
      },
    });
  },
};
