import { t } from "../../shared/i18n.js";
import { savePromptSendHistory } from "../../shared/storage-adapter.js";
import { el, toast } from "../../ui/dom.js";
import { createSettingsKit } from "./kit.js";
import { requireSettingsSectionStatePort } from "./section-contract.js";
import {
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";

const PROMPT_HISTORY_GROUPS = Object.freeze([
  Object.freeze({ id: "today", labelKey: "promptHistory.today" }),
  Object.freeze({ id: "yesterday", labelKey: "promptHistory.yesterday" }),
  Object.freeze({ id: "pastWeek", labelKey: "promptHistory.pastWeek" }),
  Object.freeze({ id: "pastMonth", labelKey: "promptHistory.pastMonth" }),
  Object.freeze({ id: "older", labelKey: "promptHistory.older" })
]);
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function timestamp(value) {
  const parsed = value instanceof Date
    ? value.getTime()
    : typeof value === "number" ? value : Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function localCalendarDay(timestampValue) {
  const date = new Date(timestampValue);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MILLISECONDS_PER_DAY;
}

export function promptHistoryGroupId(createdAt, now = Date.now()) {
  const createdTimestamp = timestamp(createdAt);
  const nowTimestamp = timestamp(now);
  if (createdTimestamp === null || nowTimestamp === null) return "older";
  const daysAgo = localCalendarDay(nowTimestamp) - localCalendarDay(createdTimestamp);
  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday";
  if (daysAgo <= 7) return "pastWeek";
  if (daysAgo <= 30) return "pastMonth";
  return "older";
}

export function groupPromptHistory(history = [], now = Date.now()) {
  const grouped = new Map(PROMPT_HISTORY_GROUPS.map(({ id }) => [id, []]));
  for (const item of Array.isArray(history) ? history : []) {
    grouped.get(promptHistoryGroupId(item?.createdAt, now))?.push(item);
  }
  return PROMPT_HISTORY_GROUPS
    .map((group) => ({ ...group, items: grouped.get(group.id) }))
    .filter((group) => group.items.length);
}

export function createPromptHistorySettingsSection(ctx) {
  const controllerName = "Prompt history settings section";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    setPromptImages: "function",
    syncPromptInputNode: "function"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    ["promptHistoryCursor", "promptHistoryDraft", "promptSelection", "promptSendHistory", "promptText"]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const setPromptImages = requireControllerFunction(ctx, controllerName, "setPromptImages");
  const syncPromptInputNode = requireControllerFunction(ctx, controllerName, "syncPromptInputNode");
  const {
    settingsBlock,
    settingsEmptyRow,
    settingsIconAction,
    settingsList,
    settingsPaneToolbar,
    settingsPrimaryAction
  } = createSettingsKit({ svgIcon });

  function items() {
    return Array.isArray(state.promptSendHistory) ? state.promptSendHistory : [];
  }

  function preview(text, limit = 180) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length > limit ? `${value.slice(0, Math.max(0, limit - 3))}...` : value;
  }

  function dateLabel(createdAt) {
    const parsedTimestamp = timestamp(createdAt);
    if (parsedTimestamp === null) return t("promptHistory.unknownTime");
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(parsedTimestamp));
    } catch {
      return new Date(parsedTimestamp).toLocaleString();
    }
  }

  async function save(history, redraw, message) {
    state.promptSendHistory = await savePromptSendHistory(history);
    resetCursor();
    redraw();
    if (message) toast(message, "success");
  }

  function resetCursor() {
    state.promptHistoryCursor = -1;
    state.promptHistoryDraft = "";
  }

  function insert(item) {
    if (!item?.text && !item?.images?.length) return;
    state.promptText = String(item.text || "");
    state.promptSelection = {
      start: state.promptText.length,
      end: state.promptText.length,
      direction: "none"
    };
    resetCursor();
    setPromptImages(item.images || [], { focus: false });
    const inputNode = syncPromptInputNode({ focus: true });
    try { inputNode?.setSelectionRange(state.promptText.length, state.promptText.length, "none"); } catch {}
    toast(t("toast.promptHistoryInserted"), "success");
  }

  async function remove(item, redraw) {
    const images = Array.isArray(item?.images) ? item.images : [];
    const imageLabel = images.length
      ? t("promptHistory.imageCount", { count: images.length, plural: images.length === 1 ? "" : "s" })
      : "";
    const label = preview(item?.text, 80) || imageLabel || t("promptHistory.thisPrompt");
    if (!window.confirm(t("promptHistory.deleteConfirm", { prompt: label }))) return;
    await save(items().filter((entry) => entry.id !== item.id), redraw, t("toast.promptHistoryDeleted"));
  }

  async function clear(redraw) {
    if (!items().length || !window.confirm(t("promptHistory.clearConfirm"))) return;
    await save([], redraw, t("toast.promptHistoryCleared"));
  }

  function row(item, redraw) {
    const textPreview = preview(item.text, 420);
    const images = Array.isArray(item.images) ? item.images : [];
    const imageCountLabel = images.length
      ? t("promptHistory.imageCount", { count: images.length, plural: images.length === 1 ? "" : "s" })
      : "";
    return el("div", { class: "ui-list-row settings-list-row prompt-history-row" },
      el("time", { class: "prompt-history-time", datetime: item.createdAt || "" }, dateLabel(item.createdAt)),
      el("span", { class: "prompt-history-preview", title: item.text || imageCountLabel || "" },
        textPreview || (images.length ? imageCountLabel : t("promptHistory.emptyPrompt")),
        images.length ? el("span", { class: "prompt-history-images" },
          images.slice(0, 4).map((image) => el("img", {
            src: image.dataUrl,
            alt: image.name || "",
            title: image.name || imageCountLabel
          })),
          images.length > 4 ? el("span", { class: "prompt-history-image-more" }, `+${images.length - 4}`) : null
        ) : null
      ),
      el("div", { class: "settings-row-action-group" },
        settingsIconAction(t("promptHistory.insert"), "insert", () => insert(item)),
        settingsIconAction(t("common.delete"), "trash", () => remove(item, redraw), "danger")
      )
    );
  }

  function pane(redraw) {
    const history = items();
    const rows = history.length
      ? groupPromptHistory(history).flatMap((group) => [
        el("div", { class: "prompt-history-group", role: "heading", "aria-level": "5" }, t(group.labelKey)),
        group.items.map((item) => row(item, redraw))
      ])
      : settingsEmptyRow(t("promptHistory.noHistory"));
    return el("div", { class: "settings-pane" },
      settingsBlock(t("promptHistory.title"), t("promptHistory.desc"),
        settingsPaneToolbar(
          t("promptHistory.manage"),
          ...(history.length ? [settingsPrimaryAction(t("promptHistory.clear"), "trash", () => clear(redraw))] : [])
        ),
        settingsList([t("promptHistory.time"), t("promptHistory.prompt"), t("profiles.actions")], rows, "prompt-history-list")
      )
    );
  }

  return Object.freeze({ pane, resetAfterImport: resetCursor });
}
