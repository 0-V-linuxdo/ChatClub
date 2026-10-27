// OfficialRules (page): keeps the background's rules state, layers the applied components over the built-in site
// data (user overrides stay on top), and renders the "rules" settings section (v2 06 §9.5).

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { settingsTable } from "../../lib/settings-table.js";
import { FEATURES, STATE_KEY, componentKey, effectiveComponent, overlayConfig, pendingDeleteHosts, jwkFingerprint } from "./model.js";

const CAP_TO_FEATURE = Object.fromEntries(Object.entries(FEATURES).map(([feature, spec]) => [spec.capability, feature]));
const OWNERS = {
  summary: { plugin: "Summary", key: "summarySiteConfigs" },
  messageNavigator: { plugin: "MessageNavigator", key: "messageNavigatorSiteConfigs" },
  delete: { plugin: "TopicDelete", key: "topicDeleteSiteConfigs" },
};

export default {
  async start(ctx) {
    const t = ctx.t;
    const sites = ctx.services.get("sites");
    const shellUi = () => ctx.services.get("ui");
    let state = null;
    const listeners = new Set();
    const notify = () => {
      for (const fn of listeners) fn();
    };

    const request = async (name, payload = {}) => {
      try {
        const next = await ctx.background.request(name, payload);
        if (next && typeof next === "object" && "mode" in next) {
          state = next;
          installOverlay();
          notify();
        }
        return next;
      } catch (error) {
        shellUi()?.toast(t("rules.failed", { reason: String(error?.message || error) }), "error");
        return null;
      }
    };
    const refresh = () => request("getOfficialRulesStatus");

    const builtinDeleteHosts = () => (sites?.builtinCapability?.("delete") ?? []).flatMap(({ data }) => data.hosts ?? []);
    const installOverlay = () => {
      if (!sites?.setOverlay) return;
      if (!state?.current) {
        sites.setOverlay(null);
        return;
      }
      const approved = new Set(Object.entries(state.deleteAliases ?? {}).filter(([, v]) => v === "approved").map(([host]) => host));
      sites.setOverlay((capability, data) => {
        const feature = CAP_TO_FEATURE[capability];
        if (!feature || !data?.id) return data;
        return overlayConfig(feature, data, effectiveComponent(state, componentKey(feature, data.id)), { approvedHosts: approved });
      });
    };

    await refresh();
    ctx.storage.onChanged?.(STATE_KEY, () => refresh());
    ctx.events.on("DataTransfer:reset", () => request("resetOfficialRules"));

    // ------------------------------------------------------------ section helpers
    const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString() : t("rules.never"));
    const kv = (rows) => h("div", { style: { display: "grid", gridTemplateColumns: "180px minmax(0, 1fr)", gap: "8px 16px", fontSize: "13px" } },
      rows.flatMap(([k, v]) => [h("span", { style: { color: "var(--muted)" } }, k), h("span", { style: { wordBreak: "break-all" } }, v)]));
    const showValue = (v) => (v === null || v === undefined ? "—" : Array.isArray(v) ? v.join("\n") : typeof v === "object" ? JSON.stringify(v) : String(v));
    const storedOverride = (feature, id) => {
      const owner = OWNERS[feature];
      const list = ctx.host.plugins[owner.plugin]?.settings?.store?.[owner.key];
      const entry = Array.isArray(list) ? list.find((c) => c?.id === id && c.builtIn !== false) : null;
      if (!entry) return [];
      return Object.keys(entry).filter((k) => !["id", "builtIn"].includes(k));
    };
    const clearOverride = (feature, id) => {
      const owner = OWNERS[feature];
      const store = ctx.host.plugins[owner.plugin]?.settings?.store;
      if (!store) return;
      const list = Array.isArray(store[owner.key]) ? store[owner.key] : [];
      store[owner.key] = list.map((c) => (c?.id === id && c.builtIn !== false ? { id, builtIn: true } : c));
    };

    const renderManage = (box, rerender) => {
      const s = state;
      if (!s) return;
      if (s.mode === "undecided") {
        box.append(ui.card({ title: t("rules.undecided.title"), body: h("div",
          h("p", { style: { margin: "0 0 12px", color: "var(--muted)", fontSize: "13px" } }, t("rules.undecided.body")),
          h("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } },
            ui.button({ label: t("rules.undecided.auto"), icon: "refreshCw", variant: "primary", onClick: () => request("setOfficialRulesMode", { mode: "auto" }) }),
            ui.button({ label: t("rules.undecided.manual"), icon: "shield", onClick: () => request("setOfficialRulesMode", { mode: "manual" }) }))) }));
      }
      const statusText = t(`rules.status.${s.status}`) + (s.status === "error" && s.lastError ? ` · ${s.lastError === "notConfigured" ? t("rules.error.notConfigured") : s.lastError}` : "");
      const checking = s.status === "checking";
      box.append(ui.card({ title: t("rules.mode"), body: h("div",
        h("div", { style: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" } },
          s.mode === "undecided"
            ? ui.badge(t("rules.mode.undecided"), "muted")
            : ui.segmented({ value: s.mode, options: [{ value: "auto", label: t("rules.mode.auto") }, { value: "manual", label: t("rules.mode.manual") }], onChange: (mode) => request("setOfficialRulesMode", { mode }) }),
          h("span", { style: { flex: "1" } }),
          ui.button({ label: t("rules.checkNow"), icon: "refreshCw", disabled: checking, onClick: async () => {
            await request("checkOfficialRulesUpdate");
            rerender();
          } })),
        kv([
          [t("rules.status"), statusText],
          [t("rules.lastCheck"), fmtTime(s.lastCheckAt)],
          [t("rules.lastApply"), fmtTime(s.lastAppliedAt)],
          ...(s.mode === "auto" && s.nextCheckAt ? [[t("rules.nextCheck"), fmtTime(s.nextCheckAt)]] : []),
        ])) }));

      const fpCurrent = h("span", "…");
      const fpRecovery = h("span", "…");
      jwkFingerprint(s.keys?.current).then((fp) => (fpCurrent.textContent = fp || t("rules.notSet")));
      jwkFingerprint(s.keys?.recovery).then((fp) => (fpRecovery.textContent = fp || t("rules.notSet")));
      box.append(ui.card({ title: t("rules.catalog"), body: kv([
        [t("rules.channel"), s.channelUrl || t("rules.notSet")],
        [t("rules.version"), s.current?.rulesVersion ?? t("rules.builtinOnly")],
        [t("rules.sequence"), s.current ? String(s.current.sequence) : "—"],
        [t("rules.keyId"), s.current?.keyId ?? "—"],
        [t("rules.fpCurrent"), fpCurrent],
        [t("rules.fpRecovery"), fpRecovery],
        [t("rules.notes"), s.current?.releaseNotes || "—"],
      ]) }));

      const cand = s.candidate;
      const candBody = h("div");
      if (!cand) candBody.append(h("div", { style: { color: "var(--muted)", fontSize: "13px" } }, t("rules.candidate.none")));
      else {
        candBody.append(kv([[t("rules.version"), cand.rulesVersion], [t("rules.sequence"), String(cand.sequence)], [t("rules.notes"), cand.releaseNotes || "—"]]));
        for (const [key, diff] of Object.entries(cand.diffs ?? {})) {
          candBody.append(h("h4", { style: { margin: "16px 0 8px", fontSize: "13px" } }, `${key} · ${t("rules.revision", { n: cand.components[key]?.revision })}`));
          candBody.append(settingsTable({ t, rows: diff.map((d, i) => ({ ...d, id: `${key}:${i}` })), columns: [
            { label: t("rules.diff.field"), width: "minmax(120px, .8fr)", render: (d) => h("code", d.field) },
            { label: t("rules.diff.before"), width: "minmax(0, 1fr)", render: (d) => h("span", { style: { whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: "12px" } }, showValue(d.before)) },
            { label: t("rules.diff.after"), width: "minmax(0, 1fr)", render: (d) => h("span", { style: { whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: "12px" } }, showValue(d.after)) },
          ] }));
        }
        for (const key of cand.removed ?? []) candBody.append(h("div", { style: { marginTop: "8px", fontSize: "13px" } }, t("rules.diff.removed", { key })));
        candBody.append(h("div", { style: { marginTop: "14px" } }, ui.button({ label: t("rules.applyAll"), icon: "check", variant: "primary", onClick: async () => {
          if (await request("applyOfficialRulesUpdate")) shellUi().toast(t("rules.applied"), "success");
        } })));
      }
      box.append(ui.card({ title: t("rules.candidate"), body: candBody }));

      if (s.snapshot) {
        box.append(h("div", { style: { margin: "4px 0 16px" } }, ui.button({ label: t("rules.rollbackLast"), icon: "reset", onClick: async () => {
          const ok = await shellUi().confirm({ title: t("rules.rollbackLast"), description: t("rules.rollbackLast.confirm"), tone: "warning", confirmText: t("rules.rollbackLast") });
          if (ok && (await request("rollbackLastRulesUpdate"))) shellUi().toast(t("rules.rolledBackLast"), "success");
        } })));
      }

      const pending = pendingDeleteHosts(s, builtinDeleteHosts());
      box.append(ui.card({ title: t("rules.aliases"), body: h("div",
        h("p", { style: { margin: "0 0 10px", color: "var(--muted)", fontSize: "13px" } }, t("rules.aliases.desc")),
        pending.length
          ? settingsTable({ t, rows: pending.map((p) => ({ ...p, id: `${p.key}:${p.host}` })), columns: [
            { label: t("rules.site"), width: "minmax(0, 1fr)", render: (p) => h("code", p.host) },
            { label: t("rules.col.feature"), width: "minmax(0, 1fr)", render: (p) => h("span", p.key) },
            { label: t("rules.status"), width: "120px", render: (p) => ui.badge(t(p.approved ? "rules.aliases.approved" : "rules.aliases.pending"), p.approved ? "" : "warning") },
          ], actions: (p) => [p.approved
            ? ui.button({ label: t("rules.aliases.revoke"), onClick: () => request("setOfficialDeleteAliasApproval", { host: p.host, approved: false }) })
            : ui.button({ label: t("rules.aliases.allow"), variant: "primary", onClick: async () => {
              const ok = await shellUi().confirm({ title: t("rules.aliases.confirm", { host: p.host }), description: t("rules.aliases.confirmBody", { key: p.key }), tone: "warning", confirmText: t("rules.aliases.allow") });
              if (ok) request("setOfficialDeleteAliasApproval", { host: p.host, approved: true });
            } })] })
          : h("div", { style: { color: "var(--muted)", fontSize: "13px" } }, t("rules.aliases.none"))) }));
    };

    const renderComponents = (box, rerender) => {
      const s = state ?? {};
      const bySite = new Map();
      for (const [feature, spec] of Object.entries(FEATURES)) {
        for (const { data } of sites?.builtinCapability?.(spec.capability) ?? []) {
          if (!data?.id) continue;
          if (!bySite.has(data.id)) bySite.set(data.id, { id: data.id, name: data.name ?? data.id, rows: [] });
          bySite.get(data.id).rows.push({ feature, data });
        }
      }
      for (const site of bySite.values()) {
        const rows = site.rows.map(({ feature, data }) => {
          const key = componentKey(feature, site.id);
          const official = s.current?.components?.[key] ?? null;
          const effective = state ? effectiveComponent(state, key) : null;
          const candidate = s.candidate?.components?.[key] ?? null;
          const overrides = storedOverride(feature, site.id);
          const rolledBack = !!s.rolledBack?.[key];
          const source = overrides.length ? "override" : rolledBack ? "rolledBack" : effective ? "official" : "builtin";
          return { id: key, key, feature, data, official, effective, candidate, overrides, rolledBack, source };
        });
        const body = h("div");
        body.append(settingsTable({ t, rows, actionsWidth: "300px", columns: [
          { label: t("rules.col.feature"), width: "minmax(110px, 1fr)", render: (r) => h("strong", t(`rules.feature.${r.feature}`)) },
          { label: t("rules.col.current"), width: "80px", render: (r) => h("span", r.effective ? t("rules.revision", { n: r.effective.revision }) : t("rules.builtinOnly")) },
          { label: t("rules.col.builtin"), width: "80px", render: () => h("span", t("rules.builtinOnly")) },
          { label: t("rules.col.candidate"), width: "90px", render: (r) => (r.candidate ? h("span", t("rules.revision", { n: r.candidate.revision }), " ", ui.badge(t("rules.hasUpdate"), "warning")) : h("span", "—")) },
          { label: t("rules.col.source"), width: "minmax(120px, 1fr)", render: (r) => h("div",
            h("span", t(`rules.source.${r.source}`)),
            r.overrides.length ? h("div", { style: { color: "var(--muted)", fontSize: "11.5px" } }, t("rules.overridden", { fields: r.overrides.join(", ") })) : null) },
        ], actions: (r) => [
          r.official && !r.rolledBack ? ui.button({ label: t("rules.rollback"), onClick: () => request("rollbackOfficialComponent", { key: r.key }) }) : null,
          r.rolledBack ? ui.button({ label: t("rules.restore"), onClick: () => request("restoreOfficialComponent", { key: r.key }) }) : null,
          r.overrides.length ? ui.button({ label: t("rules.clearOverride"), onClick: async () => {
            const ok = await shellUi().confirm({ title: t("rules.clearOverride"), description: t("rules.clearOverride.confirm", { name: `${site.name} · ${t(`rules.feature.${r.feature}`)}` }), tone: "warning", confirmText: t("rules.clearOverride") });
            if (!ok) return;
            clearOverride(r.feature, site.id);
            rerender();
          } }) : null,
          r.feature === "summary" && ctx.services.get("summary")?.probe ? ui.button({ label: t("rules.test"), icon: "preview", onClick: async (e) => {
            const svc = ctx.services.get("summary");
            const config = svc.configs().find((c) => c.id === site.id);
            if (!config) return;
            const out = e?.currentTarget?.closest(".cc-card")?.querySelector(".cc-rules-probe");
            if (out) out.textContent = "…";
            const res = await svc.probe(config);
            if (out) out.textContent = svc.describeProbe(res);
          } }) : null,
        ].filter(Boolean) }));
        body.append(h("pre.cc-rules-probe", { style: { whiteSpace: "pre-wrap", fontSize: "12px", color: "var(--muted)", margin: "8px 0 0" } }));
        box.append(ui.card({ title: site.name, body }));
      }
    };

    ctx.contribute("settings.section", {
      id: "rules",
      titleKey: "rules.section.title",
      descKey: "rules.section.desc",
      icon: "fileCog",
      order: 70,
      group: "features",
      render(container, sctx) {
        let tab = sctx.args?.tab === "components" ? "components" : "manage";
        const content = h("div");
        const strip = ui.subtabs({ tabs: [{ id: "manage", label: t("rules.tab.manage") }, { id: "components", label: t("rules.tab.components") }], value: tab, onChange: (id) => {
          tab = id;
          draw();
        } });
        const draw = () => {
          clear(content);
          if (tab === "components") renderComponents(content, draw);
          else renderManage(content, draw);
        };
        listeners.add(draw);
        sctx.onDispose(() => listeners.delete(draw));
        refresh();
        draw();
        container.append(strip, content);
      },
    });

    ctx.services.provide("officialRules", { state: () => state, refresh, request });
  },
};
