import { t } from "../../shared/i18n.js";
import { dateGroupId, groupByDate, timestamp } from "../../shared/date-groups.js";

export function promptHistoryGroupId(createdAt, now = Date.now()) {
  return dateGroupId(createdAt, now);
}

export function groupPromptHistory(history = [], now = Date.now()) {
  return groupByDate(history, (item) => item?.createdAt, now, "promptHistory");
}

export function promptHistoryMatchesSearch(item, query, extraTexts = []) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  const images = Array.isArray(item?.images) ? item.images : [];
  return [item?.text, ...images.map((image) => image?.name), ...extraTexts]
    .some((text) => String(text || "").toLowerCase().includes(needle));
}

export function promptHistoryPreview(text, limit = 180) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > limit ? `${value.slice(0, Math.max(0, limit - 3))}...` : value;
}

export function promptHistoryTimeLabel(createdAt) {
  const parsedTimestamp = timestamp(createdAt);
  if (parsedTimestamp === null) return t("promptHistory.unknownTime");
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(parsedTimestamp));
  } catch {
    return new Date(parsedTimestamp).toLocaleString();
  }
}

export function promptHistoryImageCountLabel(images = []) {
  return images.length
    ? t("promptHistory.imageCount", { count: images.length, plural: images.length === 1 ? "" : "s" })
    : "";
}

function promptHistorySearchExtraTexts(item) {
  const images = Array.isArray(item?.images) ? item.images : [];
  return [
    promptHistoryTimeLabel(item?.createdAt),
    promptHistoryImageCountLabel(images),
    item?.text ? "" : t("promptHistory.emptyPrompt")
  ];
}

export function promptHistoryItemMatchesSearch(item, query) {
  return promptHistoryMatchesSearch(item, query, promptHistorySearchExtraTexts(item));
}
