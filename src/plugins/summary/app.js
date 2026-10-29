// Summary (page): site configs, the collection engine, the panel, and the Summary settings section (v2 04 §1–§2, 06 §6).

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { normalizeTemplates, activeTemplate, renderTemplateCard, apiChoices, apiService, apiOffNotice } from "../../lib/prompt-templates.js";
import { settingsTable, reorderButtonsOn } from "../../lib/settings-table.js";
import { MARKDOWN_STYLE } from "../../lib/markdown.js";
import { SUMMARY_DEFAULT } from "./index.js";
import { effectiveConfigs, storedConfigs, isCustomEntry } from "./sites.js";
import { createCollector } from "./collect.js";
import { createSummaryPanel, SUMMARY_STYLE } from "./panel.js";

const PROBE_KEY = "chatclub.summaryCollectorLastRun.v1";

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const sites = ctx.services.get("sites");
    const api = () => apiService(ctx);
    const workspace = ctx.services.get("workspace");
    ctx.styles.register("summary", SUMMARY_STYLE + MARKDOWN_STYLE);

    const legacy = api().takeLegacyAssignment("summary");
    if (legacy) ctx.settings.summaryApiProfileId = legacy;
    const selection = () => ({ profileId: ctx.settings.summaryApiProfileId, model: ctx.settings.summaryApiModel });
    ctx.contribute("apiConsumer", {
      id: "summary",
      labelKey: "summary.consumer",
      order: 20,
      getSelection: selection,
      setSelection: ({ profileId, model }) => {
        ctx.settings.summaryApiProfileId = profileId;
        ctx.settings.summaryApiModel = model ?? "";
      },
    });

    const builtins = () => sites.capability("summary").map(({ data }) => ({ ...data }));
    const configs = () => effectiveConfigs(builtins(), ctx.settings.summarySiteConfigs);
    const saveConfigs = (list) => {
      ctx.settings.summarySiteConfigs = storedConfigs(builtins(), list);
    };

    const templates = () => normalizeTemplates(ctx.settings.summaryPromptTemplates, SUMMARY_DEFAULT);
    const collector = createCollector(ctx, { configs });
    const panel = createSummaryPanel(ctx, {
      collector,
      templates,
      activeTemplate: () => activeTemplate(templates(), ctx.settings.summaryPromptTemplateId),
      selection,
    });

    // ------------------------------------------------------------ entry points
    const openPanel = () => {
      if (!collector.canCollect() && !panel.isOpen()) return;
      panel.open();
    };
    ctx.contribute("panel", { id: "summary", open: () => panel.open(), close: () => panel.close(), isOpen: () => panel.isOpen(), escapeCloses: true });
    ctx.contribute("fullscreen.target", { id: "summary", order: 20, isOpen: () => panel.isOpen(), toggle: () => panel.toggleMaximized() });
    ctx.contribute("topbar.item", {
      id: "summary",
      variant: "action",
      labelKey: "summary.topbar",
      icon: "summary",
      tipId: "topbar.summary",
      shortcutAction: "openSummaryPanel",
      disabled: () => !collector.canCollect(),
      onClick: () => openPanel(),
    });
    ctx.contribute("shortcut.action", { id: "openSummaryPanel", labelKey: "summary.shortcut", run: () => openPanel() });
    const refreshTopbar = () => ctx.services.get("topbar")?.refresh?.();
    ctx.events.on("Workspace:changed", refreshTopbar);
    ctx.events.on("Frames:location", refreshTopbar);
    ctx.events.on("frameRegistered", refreshTopbar);

    // ------------------------------------------------------------ settings section
    const probe = async (config) => {
      const group = workspace.currentGroup();
      const target = group ? collector.targets().find((tg) => tg.groupId === group.id) : collector.targets()[0];
      if (!target) return { ok: false, error: "no-frame", text: t("summary.probe.noFrame") };
      const source = await collector.collectTarget(target, { userInitiated: true, configOverride: config });
      const msgs = source.messages ?? [];
      const ok = msgs.some((m) => m.role === "user") && msgs.some((m) => m.role === "assistant");
      const result = {
        ok,
        href: source.href,
        turnCount: msgs.length,
        stage: source.stage ?? "none",
        officialHits: source.officialHits ?? null,
        waitMsApplied: source.waitMsApplied ?? 0,
        error: ok ? null : source.status === "ok" ? "no-pair" : msgs.length ? "no-pair" : source.reason || "empty",
        at: new Date().toISOString(),
        siteId: config.id,
      };
      try {
        localStorage.setItem(PROBE_KEY, JSON.stringify(result));
      } catch {
        // ignore
      }
      return result;
    };
    const describeProbe = (r) => {
      if (!r) return "";
      const lines = [r.ok ? t("summary.probe.ok", { n: r.turnCount }) : String(r.error === "no-frame" ? t("summary.probe.noFrame") : r.error)];
      lines.push(t("summary.probe.stage", { stage: t(`summary.stage.${r.stage}`) }));
      if (r.officialHits) lines.push(t("summary.probe.hits", r.officialHits));
      if (r.waitMsApplied) lines.push(t("summary.probe.wait", { ms: r.waitMsApplied }));
      return lines.join("\n");
    };

    const openEditor = (existing, onSaved) => {
      const isNew = !existing;
      const draft = existing ? structuredClone(existing) : { id: `custom-${Date.now().toString(36)}`, name: "", hosts: [], pathPrefixes: [], enabled: true, builtIn: false, sourceMode: "custom", userscriptRunMode: "serial", fallbackMode: "structuredOnly", customUserscript: "", officialRuleHints: {} };
      shellUi.openModal(({ onClose }) => {
        const name = ui.textInput({ value: draft.name ?? "" });
        const hosts = ui.textArea({ value: (draft.hosts ?? []).join("\n"), rows: 3, mono: true });
        const paths = ui.textArea({ value: (draft.pathPrefixes ?? []).join("\n"), rows: 2, mono: true });
        const runMode = ui.select({ value: draft.userscriptRunMode ?? "serial", options: [{ value: "serial", label: t("summary.sites.runMode.serial") }, { value: "pageWorldFirst", label: t("summary.sites.runMode.pageWorldFirst") }] });
        const fallback = ui.select({ value: draft.fallbackMode ?? "structuredOnly", options: [{ value: "structuredOnly", label: t("summary.sites.fallback.structured") }, { value: "allowPageText", label: t("summary.sites.fallback.pageText") }] });
        const copyTimeout = ui.textInput({ value: String(draft.copyTimeoutMs ?? ""), placeholder: "2600" });
        const scriptTimeout = ui.textInput({ value: String(draft.userscriptTimeoutMs ?? ""), placeholder: "30000" });
        const script = ui.textArea({ value: draft.customUserscript ?? "", rows: 10, mono: true });
        const error = h("div.error", { hidden: true, style: { color: "var(--danger)", fontSize: "13px" } });
        const lines = (el) => el.value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
        const num = (el, min, max) => {
          const n = Number(el.value);
          return el.value.trim() && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : undefined;
        };
        const save = () => {
          const next = { ...draft, name: name.value.trim(), hosts: lines(hosts), pathPrefixes: lines(paths), userscriptRunMode: runMode.value, fallbackMode: fallback.value, copyTimeoutMs: num(copyTimeout, 300, 10000), userscriptTimeoutMs: num(scriptTimeout, 5000, 45000), customUserscript: script.value };
          const custom = !next.builtIn || !!next.customUserscript.trim();
          if (!next.name || !next.hosts.length || (!next.builtIn && !next.customUserscript.trim())) {
            error.textContent = t("summary.sites.required");
            error.hidden = false;
            return;
          }
          if (next.builtIn && next.customUserscript.trim()) next.sourceMode = "custom";
          if (!custom) delete next.customUserscript;
          const list = configs();
          const i = list.findIndex((c) => c.id === next.id);
          if (i >= 0) list[i] = next;
          else list.push(next);
          saveConfigs(list);
          if (next.customUserscript?.trim()) ctx.services.get("userScripts")?.ensure();
          shellUi.toast(t("summary.sites.saved"), "success");
          onClose("save");
          onSaved?.();
        };
        const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
          ui.field({ label: t("summary.sites.field.name"), control: name }),
          ui.field({ label: t("summary.sites.field.hosts"), control: hosts }),
          ui.field({ label: t("summary.sites.field.paths"), control: paths }),
          h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" } },
            ui.field({ label: t("summary.sites.field.runMode"), control: runMode }),
            ui.field({ label: t("summary.sites.field.fallback"), control: fallback }),
            ui.field({ label: t("summary.sites.field.copyTimeout"), control: copyTimeout }),
            ui.field({ label: t("summary.sites.field.scriptTimeout"), control: scriptTimeout })),
          ui.field({ label: t("summary.sites.field.script"), control: script }),
          error);
        return shellUi.modalLayout({ title: t(isNew ? "summary.sites.add" : "summary.sites.edit"), icon: "summary", body, onClose, footer: [ui.button({ label: t("summary.cancel"), onClick: () => onClose("cancel") }), ui.button({ label: t("summary.ok"), variant: "primary", onClick: save })] });
      }, { kind: "editor", size: "wide" });
    };

    const renderScripts = (box) => {
      const draw = () => {
        clear(box);
        let last = null;
        try {
          last = JSON.parse(localStorage.getItem(PROBE_KEY) || "null");
        } catch {
          last = null;
        }
        const probeOut = h("pre.cc-sum-probe", { style: { whiteSpace: "pre-wrap", fontSize: "12px", color: "var(--muted)", margin: "8px 0 0" } }, last ? `${t("summary.probe.last", { time: new Date(last.at).toLocaleString() })}\n${describeProbe(last)}` : "");
        const list = configs();
        ctx.services.get("userScripts")?.renderCard(box, { needed: () => configs().some((c) => !!c.customUserscript?.trim()) });
        box.append(h("div.cc-section-toolbar", h("span.desc"), ui.button({ label: t("summary.sites.add"), icon: "plus", variant: "primary", onClick: () => openEditor(null, draw) })));
        box.append(settingsTable({
          t,
          rows: list,
          moveButtons: reorderButtonsOn(ctx.host),
          onReorder: (ids) => {
            saveConfigs(ids.map((id) => list.find((c) => c.id === id)));
            shellUi.toast(t("summary.sites.orderSaved"), "success");
            draw();
          },
          columns: [
            { label: t("summary.sites.col.name"), width: "minmax(140px, 1.1fr)", render: (c) => h("div",
              h("strong", c.name),
              h("div", { style: { fontSize: "12px", color: "var(--muted)" } },
                !c.builtIn ? t("summary.sites.custom") : c.overridden || isCustomEntry(c) ? t("summary.sites.overridden") : c.userscriptFile ? t("summary.sites.builtin") : t("summary.sites.slots"))) },
            { label: t("summary.sites.col.matcher"), width: "minmax(140px, 1.2fr)", render: (c) => h("span.cell-ellipsis", { attrs: { title: [...(c.hosts ?? []), ...(c.pathPrefixes ?? [])].join("\n") } }, [(c.hosts ?? []).join(", "), (c.pathPrefixes ?? []).join(", ")].filter(Boolean).join(" · ")) },
            { label: t("summary.sites.col.fallback"), width: "minmax(110px, .8fr)", render: (c) => h("span", t(c.fallbackMode === "allowPageText" ? "summary.sites.pageText" : "summary.sites.structured")) },
            { label: t("summary.sites.col.enabled"), width: "72px", render: (c) => ui.toggleSwitch({ checked: c.enabled !== false, onChange: (on) => {
              const next = configs().map((x) => (x.id === c.id ? { ...x, enabled: on } : x));
              saveConfigs(next);
            } }) },
          ],
          actions: (c) => [
            ui.iconButton({ icon: "preview", label: t("summary.sites.probe"), onClick: async () => {
              probeOut.textContent = "…";
              probeOut.textContent = describeProbe(await probe(c));
            } }),
            ui.iconButton({ icon: "edit", label: t("summary.sites.edit"), tipId: "settings.action.edit", onClick: () => openEditor(c, draw) }),
            c.builtIn && (c.overridden || isCustomEntry(c)) ? ui.iconButton({ icon: "reset", label: t("summary.sites.reset"), onClick: () => {
              const stored = (ctx.settings.summarySiteConfigs ?? []).filter((x) => x.id !== c.id);
              ctx.settings.summarySiteConfigs = stored;
              shellUi.toast(t("summary.sites.resetDone"), "success");
              draw();
            } }) : null,
            !c.builtIn ? ui.iconButton({ icon: "trash", label: t("summary.sites.delete"), className: "danger", tipId: "settings.action.delete", onClick: async () => {
              if (!(await shellUi.confirm({ title: t("summary.sites.deleteTitle", { name: c.name }), danger: true }))) return;
              saveConfigs(configs().filter((x) => x.id !== c.id));
              shellUi.toast(t("summary.sites.deleted"), "success");
              draw();
            } }) : null,
          ],
        }));
        box.append(probeOut);
      };
      draw();
    };

    const renderAi = (container, sctx) => {
      const fullTextToggle = ctx.services.get("fullText")?.renderToggle?.();
      const choices = apiChoices(api());
      const current = `${api().resolve(selection()).profile?.id ?? ""}\n${ctx.settings.summaryApiModel ?? ""}`;
      const select = ui.select({ value: current, options: choices, onChange: (v) => {
        const [profileId, model] = v.split("\n");
        ctx.settings.summaryApiProfileId = profileId;
        ctx.settings.summaryApiModel = model ?? "";
      } });
      let draw = null;
      const head = h("div.cc-section-toolbar", h("span.desc", t("summary.card.desc")),
        ui.button({ label: t("summary.resetPrompt"), onClick: () => {
          ctx.settings.summaryPromptTemplates = templates().map((x) => (x.id === SUMMARY_DEFAULT.id ? { ...SUMMARY_DEFAULT } : x));
          ctx.settings.summaryPromptTemplateId = SUMMARY_DEFAULT.id;
          draw?.();
        } }),
        ui.button({ label: t("templates.manageApi"), variant: "primary", onClick: () => sctx.openSection("profiles") }));
      if (fullTextToggle) container.append(ui.card({ title: t("summary.recordFullText"), body: ui.field({ label: t("summary.recordFullText"), desc: t("summary.recordFullText.desc"), control: fullTextToggle }) }));
      container.append(ui.card({ title: t("summary.card"), body: api().off ? apiOffNotice(ctx, sctx) : h("div", head, h("div", { style: { fontWeight: "600", fontSize: "12px", margin: "4px 0 6px" } }, t("templates.api")), select) }));
      draw = renderTemplateCard(container, {
        host: ctx.host,
        t,
        ui: shellUi,
        builtin: SUMMARY_DEFAULT,
        descKey: "summary.templates.desc",
        templates,
        save: (list) => {
          ctx.settings.summaryPromptTemplates = list;
          draw?.();
        },
        activeId: () => ctx.settings.summaryPromptTemplateId,
        setActive: (id) => (ctx.settings.summaryPromptTemplateId = id),
      });
    };

    ctx.contribute("settings.section", {
      id: "summary",
      titleKey: "summary.section.title",
      descKey: "summary.section.desc",
      icon: "summary",
      order: 40,
      group: "features",
      render(container, sctx) {
        const body = h("div");
        let tab = sctx.args?.tab === "scripts" ? "scripts" : "ai";
        const draw = () => {
          clear(body);
          if (tab === "ai") renderAi(body, sctx);
          else renderScripts(body);
        };
        container.append(ui.subtabs({ tabs: [{ id: "ai", label: t("summary.tab.ai") }, { id: "scripts", label: t("summary.tab.scripts") }], value: tab, onChange: (v) => {
          tab = v;
          draw();
        } }), body);
        draw();
      },
    });

    ctx.services.provide("summary", {
      configs,
      probe,
      describeProbe,
      collector,
      collectAll: (opts) => collector.collectAll(opts),
      collectTarget: (target, opts) => collector.collectTarget(target, opts),
      canCollect: () => collector.canCollect(),
      open: () => panel.open(),
      isOpen: () => panel.isOpen(),
      sources: () => panel.sources(),
      refreshPanel: () => panel.refresh(),
    });
  },
};
