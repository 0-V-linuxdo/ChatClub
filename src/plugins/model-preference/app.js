// ModelPreference (page): applies each app's preferred model when its iframe is ready, holds the send gate
// meanwhile, falls back to the secondary model, and renders the "models" settings section (v2 05 §5, 03 §2.3).

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import {
  CATALOGS, SUPPORTED_APPS, SCHEDULES, COMMAND_TIMEOUT_MS, FALLBACK_MEMORY_KEY, SUBMIT_GRACE_MS, POLICIES,
  appKey, planFor, failurePolicy, rememberedFallback, rememberFallback, notionEfforts, labelTarget, resolveTarget,
} from "./model.js";

const CAP = "preferred-model";
const STYLE = String.raw`
.cc-model-overlay { position: absolute; inset: 0; z-index: calc(var(--z-frame-overlay, 20) + 1); display: flex; align-items: center; justify-content: center; cursor: progress; }
.cc-model-overlay::before { content: ""; position: absolute; inset: 0; background: var(--bg); opacity: var(--model-overlay-opacity, .7); }
.cc-model-overlay .bar { position: relative; max-width: min(520px, calc(100% - 32px)); display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px; background: var(--panel); border: 1px solid var(--line); box-shadow: var(--shadow, 0 6px 24px rgba(0,0,0,.12)); font-size: 13px; }
.cc-model-row { display: grid; grid-template-columns: minmax(80px, .5fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, .8fr); gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
.cc-model-row:last-child { border-bottom: 0; }
.cc-model-row .sub { display: flex; gap: 8px; align-items: center; min-width: 0; }
.cc-model-row select, .cc-model-row .cc-select { min-width: 0; width: 100%; }
.cc-model-extra .cc-input { flex: 1 1 200px; max-width: 320px; }
.cc-model-extra select, .cc-model-extra .cc-select { width: auto; }
.cc-model-extra { grid-column: 2 / -1; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 13px; color: var(--muted); }
`;

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const sites = ctx.services.get("sites");
    const workspace = ctx.services.get("workspace");
    const transport = ctx.services.get("frames.transport");
    // Without a workspace (the options page) only the settings section is useful; the rest stays off.
    const live = !!(workspace && transport);
    ctx.styles.register("model-preference", STYLE);
    const s = ctx.settings;

    const siteData = (appId) => sites.byAppId(appId)?.capabilities?.model ?? null;
    const unwrap = (r) => (r && typeof r === "object" && "result" in r ? r.result : r);
    const appName = (appId) => ctx.services.get("apps")?.get?.(appId)?.name ?? appId;
    const tabByFrame = (frameKey) => workspace.tabByFrame?.(frameKey) ?? null;

    // ------------------------------------------------------------ fallback memory (05 §5.5)
    const readMemory = () => {
      try {
        return JSON.parse(sessionStorage.getItem(FALLBACK_MEMORY_KEY) || "{}") || {};
      } catch {
        return {};
      }
    };
    const writeMemory = (m) => {
      try {
        sessionStorage.setItem(FALLBACK_MEMORY_KEY, JSON.stringify(m));
      } catch {
        // ignore
      }
    };

    // ------------------------------------------------------------ overlay + status
    const overlays = new Map();
    const showOverlay = (tabId, text) => {
      hideOverlay(tabId);
      if (s.modelPreferenceSelectionOverlayEnabled === false) return;
      const iframe = workspace.iframeOf(tabId);
      const host = iframe?.parentElement;
      if (!host) return;
      const el = h("div.cc-model-overlay", { style: { "--model-overlay-opacity": String(Math.max(0, Math.min(100, Number(s.modelPreferenceSelectionOverlayOpacity ?? 70))) / 100) } },
        h("div.bar", ui.spinner(), h("span", text)));
      el.hidden = !!iframe.hidden;
      host.append(el);
      overlays.set(tabId, el);
    };
    const hideOverlay = (tabId) => {
      overlays.get(tabId)?.remove();
      overlays.delete(tabId);
    };
    const composer = () => ctx.services.get("composer");
    const pending = new Map(); // frameKey → Promise<result>
    const failures = new Map(); // frameKey → reason text
    const refreshStatus = () => {
      const c = composer();
      if (!c?.setStatus) return;
      if (pending.size) c.setStatus("modelPreference", { kind: "busy", text: t("model.status.preparing") });
      else if (failures.size) {
        const reason = [...failures.values()][0];
        c.setStatus("modelPreference", { kind: "error", text: t("model.status.failed", { reason }), tip: t("model.status.failed", { reason }) });
      } else c.setStatus("modelPreference", null);
    };

    // ------------------------------------------------------------ applying
    const lastSubmit = new Map(); // tabId → time of the last accepted send
    if (live) ctx.events.on("Composer:accepted", ({ targets = [] }) => {
      for (const tg of targets) lastSubmit.set(tg.tabId, Date.now());
    });

    const sendApply = (frameKey, plan, site, schedule) =>
      transport.send(frameKey, { capability: CAP, command: "applyPreferredModel", payload: { plan, site, schedule } }, { timeoutMs: COMMAND_TIMEOUT_MS }).then(unwrap);

    const reasonText = (r) => t(`model.reason.${r}`) === `model.reason.${r}` ? String(r) : t(`model.reason.${r}`);

    const apply = async (frameKey, { schedule = SCHEDULES.immediate } = {}) => {
      const tab = tabByFrame(frameKey);
      if (!tab) return null;
      const app = appKey(tab.appId);
      const site = siteData(tab.appId);
      if (!site || !SUPPORTED_APPS.includes(app)) return null;
      if (Date.now() - (lastSubmit.get(tab.id) ?? 0) < SUBMIT_GRACE_MS) return null;
      const remembered = rememberedFallback(readMemory(), app);
      const plan = planFor(app, s, { useSecondary: remembered });
      if (!plan) return null;
      if (pending.has(frameKey)) return pending.get(frameKey);

      const run = (async () => {
        failures.delete(frameKey);
        const toastKind = plan.usingSecondary ? "secondary" : "primary";
        showOverlay(tab.id, t(`model.overlay.${toastKind}`, { model: plan.target.label }));
        const stopToast = workspace.frameToast(frameKey, t(`model.toast.${toastKind}.switching`, { model: plan.target.label }), { spinner: true, duration: 0 });
        let res;
        try {
          res = await sendApply(frameKey, plan, site, schedule);
          if (res?.status === "failed" && plan.fallback && (!res.interacted || res.reason === "rejected")) {
            // Primary not found / rejected → secondary (05 §5.5), and remember it for 5 minutes.
            writeMemory(rememberFallback(readMemory(), app));
            showOverlay(tab.id, t("model.overlay.secondary", { model: plan.fallback.label }));
            const second = await sendApply(frameKey, { ...plan, target: plan.fallback, fallback: null, thinking: undefined, effort: undefined, usingSecondary: true }, site, SCHEDULES.ready);
            res = { ...second, usedSecondary: true, primaryReason: res.reason };
          }
        } catch (error) {
          res = { status: "failed", reason: String(error?.message || error) };
        } finally {
          stopToast?.();
          hideOverlay(tab.id);
        }
        const kind = res?.usedSecondary || plan.usingSecondary ? "secondary" : "primary";
        const model = (res?.usedSecondary ? plan.fallback : plan.target).label;
        if (res?.status === "switched") workspace.frameToast(frameKey, t(`model.toast.${kind}.switched`, { model }), { type: "success" });
        else if (res?.status === "already") workspace.frameToast(frameKey, t(`model.toast.${kind}.already`, { model }), { type: "success" });
        else if (res?.status !== "cancelled") {
          const reason = reasonText(res?.reason ?? "unknown");
          failures.set(frameKey, reason);
          workspace.frameToast(frameKey, t(`model.toast.${kind}.failed`, { model, reason }), { type: "error", duration: 4000 });
          ctx.reportAnomaly({ feature: "preferredModel", operation: "applyPreferredModel", appId: tab.appId, appName: appName(tab.appId), host: tab.href, reason: res?.reason ?? "unknown", message: `${model}${res?.primaryReason ? ` (primary: ${res.primaryReason})` : ""}` });
        }
        return res;
      })().finally(() => {
        pending.delete(frameKey);
        refreshStatus();
      });
      pending.set(frameKey, run);
      refreshStatus();
      return run;
    };

    if (live) ctx.events.on("frameRegistered", ({ frameKey }) => {
      apply(frameKey, { schedule: SCHEDULES.immediate });
    });
    if (live) ctx.events.on("Workspace:ready", ({ restored }) => {
      if (!restored) return;
      for (const tg of workspace.activeTargets()) if (tg.registered) apply(tg.frameKey, { schedule: SCHEDULES.ready });
    });
    if (live) ctx.events.on("frameUnloaded", ({ frameKey }) => {
      failures.delete(frameKey);
      refreshStatus();
    });

    // Send gate (03 §2.3 step 1): wait for the frame's preparation, then apply the failure policy.
    if (live) ctx.contribute("composer.targetGate", {
      id: "modelPreference",
      order: 10,
      before: async (target) => {
        const job = pending.get(target.frameKey);
        if (!job) return null;
        const res = await Promise.race([job, new Promise((r) => setTimeout(() => r({ status: "failed", reason: "timeout" }), COMMAND_TIMEOUT_MS))]);
        if (!res || res.status === "switched" || res.status === "already" || res.status === "cancelled") return null;
        const policy = failurePolicy(s.modelPreferenceFailurePolicy, s.modelPreferenceFailurePolicies, appKey(target.appId));
        return policy === "skip" ? { action: "skip", message: t("model.gate.skipped") } : { action: "warn", message: t("model.gate.current") };
      },
    });

    if (live) ctx.services.provide("modelPreference", { apply, isApplying: (frameKey) => pending.has(frameKey), catalogs: CATALOGS });

    // ------------------------------------------------------------ appearance: selection overlay (06 §3.2)
    ctx.contribute("appearance.group", {
      id: "ModelPreference:overlay",
      tab: "workspace",
      order: 30,
      titleKey: "model.overlay.card",
      render(container) {
        container.append(
          ui.field({ label: t("model.overlay.enabled"), desc: t("model.overlay.enabled.desc"), control: ui.toggleSwitch({ checked: s.modelPreferenceSelectionOverlayEnabled !== false, onChange: (v) => (s.modelPreferenceSelectionOverlayEnabled = v) }) }),
          ui.field({ label: t("model.overlay.opacity"), control: ui.sliderRow({ value: Number(s.modelPreferenceSelectionOverlayOpacity ?? 70), min: 0, max: 100, enabled: true, onChange: (v) => (s.modelPreferenceSelectionOverlayOpacity = v), format: (v) => `${v}%` }) }),
        );
      },
    });

    // ------------------------------------------------------------ settings section "models"
    const modelOptions = (app, extra) => {
      const opts = [{ value: "", label: t("model.none") }, ...CATALOGS[app].map((m) => ({ value: m.id, label: m.label }))];
      const cur = resolveTarget(app, extra);
      if (cur && !opts.some((o) => o.value === cur.id)) opts.push({ value: cur.id, label: cur.label });
      return opts;
    };
    const valueOf = (v) => (v && typeof v === "object" && v.kind === "label" ? labelTarget(v.label)?.id ?? "" : String(v ?? ""));
    const storeValue = (app, v) => {
      if (app === "NotionAI" && v.startsWith("label:")) return { kind: "label", label: resolveTarget(app, v)?.label ?? v.slice(6) };
      return v;
    };

    const renderApp = (app, redraw) => {
      const primary = ui.select({ value: valueOf(s[app]), options: modelOptions(app, s[app]), onChange: (v) => {
        s[app] = storeValue(app, v);
        redraw();
      } });
      const secondary = ui.select({ value: valueOf(s[`${app}Secondary`]), options: modelOptions(app, s[`${app}Secondary`]), disabled: !s[`${app}SecondaryModelEnabled`], onChange: (v) => (s[`${app}Secondary`] = storeValue(app, v)) });
      const secondaryOn = ui.toggleSwitch({ checked: !!s[`${app}SecondaryModelEnabled`], onChange: (v) => {
        s[`${app}SecondaryModelEnabled`] = v;
        redraw();
      } });
      const policies = s.modelPreferenceFailurePolicies ?? {};
      const policy = ui.select({ value: policies[app] ?? "inherit", options: ["inherit", ...POLICIES].map((p) => ({ value: p, label: t(`model.policy.${p}`) })), onChange: (v) => (s.modelPreferenceFailurePolicies = { ...(s.modelPreferenceFailurePolicies ?? {}), [app]: v }) });
      const extra = h("div.cc-model-extra");
      if (app === "Gemini") {
        extra.append(h("span", t("model.gemini.thinking")), ui.segmented({ value: s.GeminiThinkingLevel === "extended" ? "extended" : "standard", options: [{ value: "standard", label: t("model.gemini.standard") }, { value: "extended", label: t("model.gemini.extended") }], onChange: (v) => (s.GeminiThinkingLevel = v) }), h("span", t("model.gemini.proOnly")));
      }
      if (app === "NotionAI") {
        const id = resolveTarget(app, s.NotionAI)?.id;
        const choices = notionEfforts(id);
        if (choices.length) {
          const efforts = s.NotionAIEfforts ?? {};
          extra.append(h("span", t("model.notion.effort")), ui.select({ value: efforts[id] ?? "", options: [{ value: "", label: t("model.notion.effort.keep") }, ...choices.map((e) => ({ value: e, label: e }))], onChange: (v) => {
            const next = { ...(s.NotionAIEfforts ?? {}) };
            if (v) next[id] = v;
            else delete next[id];
            s.NotionAIEfforts = next;
          } }));
        }
        extra.append(h("span", t("model.notion.allSources")), ui.select({ value: s.NotionAIAllSources ?? "", options: [{ value: "", label: t("model.notion.keep") }, { value: "enabled", label: t("model.notion.on") }, { value: "disabled", label: t("model.notion.off") }], onChange: (v) => (s.NotionAIAllSources = v) }));
        const custom = ui.textInput({ placeholder: t("model.notion.customLabel") });
        extra.append(custom, ui.button({ label: t("model.notion.useLabel"), onClick: () => {
          const target = labelTarget(custom.value);
          if (!target) return;
          s.NotionAI = { kind: "label", label: target.label };
          redraw();
        } }));
      }
      return h("div.cc-model-row",
        h("strong", appName(app === "Grok" ? "Grok" : app)),
        h("div.sub", h("span", { style: { color: "var(--muted)", fontSize: "12px" } }, t("model.primary")), primary),
        h("div.sub", secondaryOn, h("span", { style: { color: "var(--muted)", fontSize: "12px" } }, t("model.secondary")), secondary),
        policy,
        extra.childNodes.length ? extra : null);
    };

    ctx.contribute("settings.section", {
      id: "models",
      titleKey: "model.section.title",
      descKey: "model.section.desc",
      icon: "model",
      order: 30,
      group: "connect",
      render(container) {
        const box = h("div");
        const draw = () => {
          clear(box);
          box.append(ui.field({ label: t("model.policy.global"), desc: t("model.policy.global.desc"), control: ui.select({ value: s.modelPreferenceFailurePolicy ?? "send-current", options: POLICIES.map((p) => ({ value: p, label: t(`model.policy.${p}`) })), onChange: (v) => (s.modelPreferenceFailurePolicy = v) }) }));
          box.append(h("div", ...SUPPORTED_APPS.map((app) => renderApp(app, draw))));
        };
        container.append(ui.card({ title: t("model.section.title"), body: box }));
        draw();
      },
    });
  },
};
