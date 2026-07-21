import { t } from "../../shared/i18n.js";
import { button, confirmationModal, el, toast, viewerModal } from "../../ui/dom.js";
import { createSettingsKit } from "./kit.js";
import { requireSettingsSectionStatePort } from "./section-contract.js";
import {
  createControllerMethodValidator,
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";

const DETAIL_FIELDS = Object.freeze([
  ["id", "functionalAnomalies.field.id"],
  ["schemaVersion", "functionalAnomalies.field.schemaVersion"],
  ["createdAt", "functionalAnomalies.field.createdAt"],
  ["updatedAt", "functionalAnomalies.field.updatedAt"],
  ["count", "functionalAnomalies.field.count"],
  ["severity", "functionalAnomalies.field.severity"],
  ["feature", "functionalAnomalies.field.feature"],
  ["operation", "functionalAnomalies.field.operation"],
  ["appName", "functionalAnomalies.field.appName"],
  ["appId", "functionalAnomalies.field.appId"],
  ["host", "functionalAnomalies.field.host"],
  ["errorName", "functionalAnomalies.field.errorName"],
  ["errorCode", "functionalAnomalies.field.errorCode"],
  ["delivered", "functionalAnomalies.field.delivered"],
  ["reason", "functionalAnomalies.field.reason"],
  ["message", "functionalAnomalies.field.message"],
  ["surface", "functionalAnomalies.field.surface"],
  ["appVersion", "functionalAnomalies.field.appVersion"]
]);

function parsedTimestamp(value) {
  const parsed = typeof value === "number" ? value : Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function timestamp(record) {
  const parsed = parsedTimestamp(record?.updatedAt || record?.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordText(value, fallback = "") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function preview(value, limit = 180) {
  const text = recordText(value);
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
}

export function createFunctionalAnomaliesSettingsSection(ctx) {
  const controllerName = "Functional anomalies settings section";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    functionalAnomalyLog: "object",
    svgIcon: "function"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    ["functionalAnomalyRecords"]
  );
  const functionalAnomalyLog = requireControllerContext(ctx, controllerName, "functionalAnomalyLog");
  createControllerMethodValidator(controllerName, "functional anomaly log")(
    functionalAnomalyLog,
    "dependency",
    ["refresh", "remove", "clear", "snapshot", "subscribe", "exportText"]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const {
    settingsBlock,
    settingsEmptyRow,
    settingsIconAction,
    settingsList,
    settingsPaneToolbar,
    settingsPrimaryAction
  } = createSettingsKit({ svgIcon });
  let renderLivePane = null;

  function records() {
    const current = Array.isArray(state.functionalAnomalyRecords) ? Array.from(state.functionalAnomalyRecords) : [];
    return current.sort((left, right) => timestamp(right) - timestamp(left));
  }

  function dateLabel(value) {
    const parsed = parsedTimestamp(value);
    if (!Number.isFinite(parsed)) return t("functionalAnomalies.unknownTime");
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(parsed));
    } catch {
      return new Date(parsed).toLocaleString();
    }
  }

  function dateTimeValue(value) {
    const parsed = parsedTimestamp(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
  }

  function fieldValue(key, value) {
    if (key === "createdAt" || key === "updatedAt") return dateLabel(value);
    if (key === "delivered" && typeof value === "boolean") {
      return value ? t("functionalAnomalies.yes") : t("functionalAnomalies.no");
    }
    return recordText(value, t("functionalAnomalies.notAvailable"));
  }

  function recordTitle(record) {
    return recordText(record?.feature, t("functionalAnomalies.unknownFeature"));
  }

  function recordOperation(record) {
    return recordText(record?.operation, t("functionalAnomalies.unknownOperation"));
  }

  function recordApp(record) {
    return recordText(record?.appName || record?.appId || record?.host, t("functionalAnomalies.unknownApp"));
  }

  function errorSummary(record) {
    return recordText(
      record?.message || record?.reason || record?.errorCode || record?.errorName,
      t("functionalAnomalies.noMessage")
    );
  }

  async function copyRecords(recordsToCopy, successKey) {
    try {
      const text = functionalAnomalyLog.exportText(recordsToCopy);
      await navigator.clipboard.writeText(String(text || ""));
      toast(t(successKey), "success");
    } catch (error) {
      console.warn("[ChatClub] Failed to copy functional anomaly records", error);
      toast(t("toast.copyFailed"), "error");
    }
  }

  function openDetails(record) {
    let dialog;
    const close = () => dialog?.remove();
    const fields = DETAIL_FIELDS
      .filter(([key]) => record?.[key] !== undefined && record?.[key] !== null && record?.[key] !== "")
      .map(([key, labelKey]) => el("div", { class: "functional-anomaly-detail-row" },
        el("dt", {}, t(labelKey)),
        el("dd", {}, fieldValue(key, record[key]))
      ));
    dialog = viewerModal(
      t("functionalAnomalies.detailTitle"),
      el("div", { class: "functional-anomaly-detail" },
        el("dl", { class: "functional-anomaly-detail-list" }, fields),
        el("p", { class: "functional-anomaly-privacy" }, t("functionalAnomalies.exportPrivacy")),
        el("pre", { class: "functional-anomaly-export-preview" }, functionalAnomalyLog.exportText([record])),
        el("div", { class: "settings-dialog-actions" },
          button(t("functionalAnomalies.copyOne"), () => copyRecords([record], "toast.functionalAnomalyCopied")),
          button(t("common.close"), close, "primary")
        )
      ),
      close,
      true,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("functional-anomaly-detail-modal");
  }

  function openMutationConfirmation({ title, body, confirmLabel, mutate, successKey }) {
    let dialog;
    let applying = false;
    const close = (force = false) => {
      if (applying && force !== true) return;
      dialog?.remove();
    };
    const cancelButton = button(t("common.cancel"), () => close());
    const confirmButton = button(confirmLabel, apply, "danger");
    const setApplying = (value) => {
      applying = value;
      cancelButton.disabled = value;
      confirmButton.disabled = value;
      dialog?.querySelector(".modal-header .icon-button")?.toggleAttribute("disabled", value);
      dialog?.querySelector(".modal")?.setAttribute("aria-busy", String(value));
    };
    async function apply() {
      if (applying) return;
      setApplying(true);
      try {
        await mutate();
        toast(t(successKey), "success");
        close(true);
      } catch (error) {
        setApplying(false);
        toast(error?.message || String(error), "error");
      }
    }
    dialog = confirmationModal(
      title,
      el("div", { class: "functional-anomaly-confirmation" },
        el("p", {}, body),
        el("div", { class: "settings-dialog-actions" }, cancelButton, confirmButton)
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("functional-anomaly-confirmation-modal");
  }

  function removeRecord(record) {
    openMutationConfirmation({
      title: t("functionalAnomalies.deleteTitle"),
      body: t("functionalAnomalies.deleteConfirm", { feature: recordTitle(record), operation: recordOperation(record) }),
      confirmLabel: t("common.delete"),
      mutate: () => functionalAnomalyLog.remove(record.id),
      successKey: "toast.functionalAnomalyDeleted"
    });
  }

  function clearRecords() {
    openMutationConfirmation({
      title: t("functionalAnomalies.clearTitle"),
      body: t("functionalAnomalies.clearConfirm"),
      confirmLabel: t("functionalAnomalies.clear"),
      mutate: () => functionalAnomalyLog.clear(),
      successKey: "toast.functionalAnomaliesCleared"
    });
  }

  function row(record) {
    const count = Math.max(1, Number.parseInt(record?.count, 10) || 1);
    const severity = recordText(record?.severity, "error").toLowerCase();
    return el("div", {
      class: "ui-list-row settings-list-row functional-anomaly-row",
      dataset: { anomalyId: record.id || "" }
    },
    el("time", {
      class: "functional-anomaly-time",
      datetime: dateTimeValue(record.updatedAt || record.createdAt)
    },
      dateLabel(record.updatedAt || record.createdAt)
    ),
    el("div", { class: "functional-anomaly-identity" },
      el("strong", {}, recordTitle(record)),
      el("span", {}, recordOperation(record)),
      el("small", {}, recordApp(record))
    ),
    el("div", { class: "functional-anomaly-summary" },
      el("div", { class: "functional-anomaly-summary-meta" },
        el("span", { class: "functional-anomaly-severity", dataset: { severity } }, severity),
        count > 1 ? el("span", { class: "functional-anomaly-count" }, t("functionalAnomalies.occurrences", { count })) : null
      ),
      el("span", { title: errorSummary(record) }, preview(errorSummary(record), 240))
    ),
    el("div", { class: "settings-row-action-group" },
      settingsIconAction(t("functionalAnomalies.viewDetails"), "preview", () => openDetails(record)),
      settingsIconAction(t("functionalAnomalies.copyOne"), "copy", () => copyRecords([record], "toast.functionalAnomalyCopied")),
      settingsIconAction(t("common.delete"), "trash", () => removeRecord(record), "danger")
    ));
  }

  function pane() {
    const host = el("div", { class: "settings-pane functional-anomalies-settings-pane" });
    const render = () => {
      const current = records();
      const refreshButton = settingsPrimaryAction(t("functionalAnomalies.refresh"), "reload", async () => {
        refreshButton.disabled = true;
        refreshButton.setAttribute("aria-busy", "true");
        try {
          await functionalAnomalyLog.refresh();
          toast(t("toast.functionalAnomaliesRefreshed"), "success");
        } catch (error) {
          toast(error?.message || String(error), "error");
        } finally {
          if (host.isConnected) render();
        }
      });
      const toolbarActions = [refreshButton];
      if (current.length) {
        toolbarActions.push(
          settingsPrimaryAction(
            t("functionalAnomalies.copyAll"),
            "copy",
            () => copyRecords(current, "toast.functionalAnomaliesCopied")
          ),
          settingsPrimaryAction(t("functionalAnomalies.clear"), "trash", clearRecords)
        );
      }
      const rows = current.length
        ? current.map(row)
        : settingsEmptyRow(t("functionalAnomalies.empty"));
      host.replaceChildren(
        settingsBlock(
          t("functionalAnomalies.title"),
          t("functionalAnomalies.desc"),
          settingsPaneToolbar(t("functionalAnomalies.manage"), ...toolbarActions),
          el("div", { class: "functional-anomaly-privacy" },
            svgIcon("alert"),
            el("p", {}, t("functionalAnomalies.privacyNotice"))
          ),
          settingsList([
            t("functionalAnomalies.time"),
            t("functionalAnomalies.feature"),
            t("functionalAnomalies.problem"),
            t("functionalAnomalies.actions")
          ], rows, "functional-anomaly-list")
        )
      );
    };
    renderLivePane = () => {
      if (!host.isConnected) {
        renderLivePane = null;
        return;
      }
      render();
    };
    render();
    return host;
  }

  functionalAnomalyLog.subscribe(() => renderLivePane?.());

  return Object.freeze({ pane });
}
