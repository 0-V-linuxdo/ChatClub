// FunctionalAnomalies (page): the `anomalies` service every feature reports through, and the settings section (v2 06 §12).

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { settingsTable } from "../../lib/settings-table.js";
import { recordText } from "./model.js";

const FLUSH_MS = 400;

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const appVersion = (() => {
      try {
        return chrome.runtime.getManifest().version;
      } catch {
        return "";
      }
    })();
    const surface = /options\.html$/.test(location.pathname) ? "options" : "workspace";

    // Reports are batched so a burst of failures is one storage write.
    let queue = [];
    let timer = 0;
    const flush = () => {
      timer = 0;
      const records = queue.splice(0, 20);
      if (!records.length) return;
      ctx.background.request("recordFunctionalAnomalies", { records }).catch((error) => ctx.logger.warn("Recording anomalies failed:", error?.message || error));
      if (queue.length) timer = setTimeout(flush, FLUSH_MS);
    };
    const report = (record) => {
      if (!record?.feature) return;
      const error = record.error;
      queue.push({
        appVersion,
        surface,
        ...record,
        error: undefined,
        errorName: record.errorName ?? error?.name ?? "",
        errorCode: record.errorCode ?? error?.code ?? "",
        message: record.message ?? error?.message ?? (error ? String(error) : ""),
      });
      if (!timer) timer = setTimeout(flush, FLUSH_MS);
    };
    const list = async () => (await ctx.background.request("listFunctionalAnomalies", {})).records ?? [];
    ctx.services.provide("anomalies", {
      report,
      list,
      remove: (ids) => ctx.background.request("removeFunctionalAnomalies", { ids }),
      clear: () => ctx.background.request("clearFunctionalAnomalies", {}),
    });

    const copy = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        shellUi.toast(t("fa.copied"), "success");
      } catch {
        shellUi.toast(t("fa.copyFailed"), "error");
      }
    };
    const showDetail = (r) => {
      shellUi.openModal(({ onClose }) => {
        const rows = Object.entries(r).map(([k, v]) => h("tr", h("th", { style: { textAlign: "left", padding: "4px 12px 4px 0", color: "var(--muted)", fontWeight: "600", verticalAlign: "top" } }, k), h("td", { style: { padding: "4px 0", whiteSpace: "pre-wrap", wordBreak: "break-word" } }, k.endsWith("At") ? new Date(v).toLocaleString() : String(v ?? ""))));
        return shellUi.modalLayout({ title: t("fa.detail"), icon: "alert", body: h("table", { style: { fontSize: "13px", borderCollapse: "collapse", width: "100%" } }, h("tbody", rows)), onClose, footer: [ui.button({ label: t("fa.copy"), onClick: () => copy(recordText(r)) }), ui.button({ label: t("fa.close"), variant: "primary", onClick: () => onClose("close") })] });
      }, { kind: "editor" });
    };

    ctx.contribute("settings.section", {
      id: "functionalAnomalies",
      titleKey: "fa.section.title",
      descKey: "fa.section.desc",
      icon: "alert",
      order: 140,
      group: "data",
      render(container) {
        const box = h("div");
        const draw = async () => {
          clear(box);
          let records = [];
          try {
            records = await list();
          } catch (error) {
            box.append(ui.emptyState(String(error?.message || error)));
            return;
          }
          box.append(h("div.cc-section-toolbar",
            h("span.desc", t("fa.note")),
            ui.button({ label: t("fa.refresh"), icon: "reload", onClick: draw }),
            ui.button({ label: t("fa.copyAll"), icon: "copy", disabled: !records.length, onClick: () => copy(`${t("fa.copyAll.header")}\n\n${records.map(recordText).join("\n\n")}`) }),
            ui.button({ label: t("fa.clearAll"), icon: "trash", variant: "danger-solid", disabled: !records.length, onClick: async () => {
              if (!(await shellUi.confirm({ title: t("fa.clearAll.confirm"), danger: true }))) return;
              await ctx.background.request("clearFunctionalAnomalies", {});
              draw();
            } })));
          box.append(settingsTable({
            t,
            rows: records,
            empty: t("fa.empty"),
            columns: [
              { label: t("fa.col.time"), width: "minmax(130px, .8fr)", render: (r) => h("span", new Date(r.updatedAt).toLocaleString()) },
              { label: t("fa.col.feature"), width: "minmax(140px, 1fr)", render: (r) => h("div", h("strong", r.feature), h("div", { style: { fontSize: "12px", color: "var(--muted)" } }, [r.operation, r.appName || r.appId].filter(Boolean).join(" · "))) },
              { label: t("fa.col.anomaly"), width: "minmax(200px, 2fr)", render: (r) => h("div",
                h("div.cell-ellipsis", { attrs: { title: r.message || r.reason } }, r.message || r.reason || r.errorName || "—"),
                r.count > 1 ? h("div", { style: { fontSize: "12px", color: "var(--muted)" } }, t("fa.count", { n: r.count })) : null) },
            ],
            actions: (r) => [
              ui.iconButton({ icon: "info", label: t("fa.detail"), onClick: () => showDetail(r) }),
              ui.iconButton({ icon: "copy", label: t("fa.copy"), onClick: () => copy(recordText(r)) }),
              ui.iconButton({ icon: "trash", label: t("fa.delete"), className: "danger", tipId: "settings.action.delete", onClick: async () => {
                await ctx.background.request("removeFunctionalAnomalies", { ids: [r.id] });
                draw();
              } }),
            ],
          }));
        };
        container.append(ui.card({ title: t("fa.section.title"), body: box }));
        draw();
      },
    });
  },
};
