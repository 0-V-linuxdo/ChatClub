// Optimize: streaming prompt rewrite through the selected API, compared side by side (v2 03 §7, 06 §10).

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { normalizeTemplates, activeTemplate, renderTemplateCard, apiChoices, apiService, apiOffNotice } from "../../lib/prompt-templates.js";
import { OPTIMIZE_DEFAULT } from "./index.js";

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const composer = ctx.services.get("composer");
    const api = () => apiService(ctx);
    const legacy = api().takeLegacyAssignment("optimize");
    if (legacy) ctx.settings.optimizeApiProfileId = legacy;

    const selection = () => ({ profileId: ctx.settings.optimizeApiProfileId, model: ctx.settings.optimizeApiModel });
    ctx.contribute("apiConsumer", {
      id: "optimize",
      labelKey: "optimize.consumer",
      order: 10,
      getSelection: selection,
      setSelection: ({ profileId, model }) => {
        ctx.settings.optimizeApiProfileId = profileId;
        ctx.settings.optimizeApiModel = model ?? "";
      },
    });
    const templates = () => normalizeTemplates(ctx.settings.optimizePromptTemplates, OPTIMIZE_DEFAULT);

    const open = () => {
      const original = composer.getDraft().text;
      if (!original.trim()) {
        shellUi.toast(t("optimize.empty"), "warning");
        return null;
      }
      let controller = null;
      let streaming = false;
      return shellUi.openModal(({ onClose }) => {
        const left = ui.textArea({ value: original, rows: 14 });
        left.readOnly = true;
        const right = ui.textArea({ value: "", rows: 14 });
        const status = h("span.meta");
        const modelBadge = ui.badge("");
        const leftCount = h("span.meta", t("optimize.chars", { n: original.length }));
        const rightCount = h("span.meta", t("optimize.chars", { n: 0 }));
        const error = h("div.error", { hidden: true });
        const useBtn = ui.button({ label: t("optimize.use"), variant: "primary", disabled: true, onClick: () => {
          composer.setDraft({ text: right.value, images: composer.getDraft().images }, { focus: true, caret: "end" });
          shellUi.toast(t("optimize.done"), "success");
          close();
        } });
        const retry = ui.iconButton({ icon: "refreshCw", compact: true, label: t("optimize.retry"), onClick: () => run() });
        const refresh = () => {
          rightCount.textContent = t("optimize.chars", { n: right.value.length });
          useBtn.disabled = streaming || !right.value.trim();
          retry.disabled = streaming;
        };
        right.addEventListener("input", refresh);
        const close = () => {
          controller?.abort();
          onClose("close");
        };
        const run = async () => {
          controller?.abort();
          controller = new AbortController();
          const mine = controller;
          right.value = "";
          error.hidden = true;
          streaming = true;
          status.textContent = t("optimize.streaming");
          refresh();
          const { profile, model } = api().resolve(selection());
          modelBadge.textContent = model;
          try {
            if (!profile?.apiKey && /api\.openai\.com/.test(profile?.endpoint ?? "")) throw Object.assign(new Error(t("optimize.noKey")), { code: "NO_KEY" });
            const template = activeTemplate(templates(), ctx.settings.optimizePromptTemplateId);
            await api().chat(selection(), {
              stream: true,
              signal: mine.signal,
              messages: [{ role: "system", content: template.prompt }, { role: "user", content: original }],
              onDelta: (_chunk, full) => {
                if (controller !== mine) return;
                right.value = full;
                refresh();
              },
            });
            if (controller !== mine) return;
            streaming = false;
            status.textContent = t("optimize.ready");
          } catch (err) {
            if (err?.name === "AbortError" || controller !== mine) return;
            streaming = false;
            status.textContent = t("optimize.failed");
            const message = err?.status && !String(err.message || "").replace(/^\d+\s*/, "") ? t("optimize.httpFailed", { status: err.status }) : String(err?.message || err);
            error.textContent = message;
            error.hidden = false;
            shellUi.toast(message, "error");
            // A plugin the user turned off is not an anomaly.
            if (err?.code !== "API_OFF") ctx.reportAnomaly?.({ feature: "optimize", operation: "optimizePrompt", errorName: err?.name, errorCode: err?.code, message });
          }
          refresh();
        };
        queueMicrotask(run);
        const body = h("div",
          h("p", { style: { margin: "0 0 12px", color: "var(--muted)" } }, t("optimize.intro")),
          h("div.cc-optimize",
            h("div.pane", h("div.pane-head", h("span", t("optimize.original")), h("span.grow"), leftCount), left),
            h("div.pane", h("div.pane-head", h("span", t("optimize.result")), status, modelBadge, h("span.grow"), rightCount, retry), right, error)));
        return shellUi.modalLayout({ title: t("optimize.title"), icon: "sparkles", body, onClose: close, footer: [ui.button({ label: t("optimize.keep"), onClick: close }), useBtn] });
      }, { kind: "task", size: "workspace", onClose: () => controller?.abort() });
    };

    ctx.contribute("composer.action", { id: "optimize", icon: "sparkles", labelKey: "optimize.action", order: 20, onClick: () => open() });
    ctx.contribute("shortcut.action", { id: "optimizePrompt", labelKey: "optimize.shortcut", run: () => open() });

    ctx.contribute("settings.section", {
      id: "optimize",
      titleKey: "optimize.section.title",
      descKey: "optimize.section.desc",
      icon: "sparkles",
      order: 80,
      group: "features",
      render(container, sctx) {
        const choices = apiChoices(api());
        const current = `${api().resolve(selection()).profile?.id ?? ""}\n${ctx.settings.optimizeApiModel ?? ""}`;
        const select = ui.select({ value: current, options: choices, onChange: (v) => {
          const [profileId, model] = v.split("\n");
          ctx.settings.optimizeApiProfileId = profileId;
          ctx.settings.optimizeApiModel = model ?? "";
        } });
        const head = h("div.cc-section-toolbar", h("span.desc", t("optimize.card.desc")),
          ui.button({ label: t("optimize.resetPrompt"), onClick: () => {
            ctx.settings.optimizePromptTemplates = templates().map((x) => (x.id === OPTIMIZE_DEFAULT.id ? { ...OPTIMIZE_DEFAULT } : x));
            ctx.settings.optimizePromptTemplateId = OPTIMIZE_DEFAULT.id;
            draw?.();
          } }),
          ui.button({ label: t("templates.manageApi"), variant: "primary", onClick: () => sctx.openSection("profiles") }));
        container.append(ui.card({ title: t("optimize.card"), body: api().off ? apiOffNotice(ctx, sctx) : h("div", head, h("div", { style: { fontWeight: "600", fontSize: "12px", margin: "4px 0 6px" } }, t("templates.api")), select) }));
        const draw = renderTemplateCard(container, {
          host: ctx.host,
          t,
          ui: shellUi,
          builtin: OPTIMIZE_DEFAULT,
          descKey: "optimize.templates.desc",
          templates,
          save: (list) => {
            ctx.settings.optimizePromptTemplates = list;
            draw?.();
          },
          activeId: () => ctx.settings.optimizePromptTemplateId,
          setActive: (id) => (ctx.settings.optimizePromptTemplateId = id),
        });
        void clear;
      },
    });

    ctx.services.provide("optimize", { open });
  },
};
