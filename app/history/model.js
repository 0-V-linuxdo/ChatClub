import { t } from "../../shared/i18n.js";
import { dateGroupId, groupByDate, timestamp } from "../../shared/date-groups.js";
import {
  framesFromSummaryPreviewItems,
  pocketPairsFromMessages
} from "../../shared/workspace-tab-fulltext.js";

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

export function promptHistoryMessageKey(text = "") {
  return String(text || "").replace(/\r\n?/g, "\n").trim();
}

function compactHistoryText(value) {
  return promptHistoryMessageKey(value).replace(/\s+/g, " ");
}

function promptHistoryPairMatches(pair, item) {
  const needle = compactHistoryText(item?.text);
  const user = compactHistoryText(pair?.userMessage);
  if (!needle || !user) return false;
  return user === needle || user.includes(needle);
}

export function promptHistoryPocketSaved(item, pocketEntries = []) {
  const key = promptHistoryMessageKey(item?.text);
  if (!key) return false;
  return (Array.isArray(pocketEntries) ? pocketEntries : []).some(
    (entry) => promptHistoryMessageKey(entry?.userMessage) === key
  );
}

function matchingFrames(item, frames = []) {
  const key = promptHistoryMessageKey(item?.text);
  if (!key) return [];
  return (Array.isArray(frames) ? frames : []).flatMap((frame) => {
    const matching = pocketPairsFromMessages(frame?.messages).filter(
      (pair) => promptHistoryPairMatches(pair, item)
    );
    if (!matching.length) return [];
    return [{
      ...frame,
      messages: matching.flatMap((pair) => [
        { role: "user", text: pair.userMessage },
        { role: "assistant", text: pair.assistantMessage }
      ])
    }];
  });
}

function framesMatchingPromptHistory(item, store = {}) {
  const records = store && typeof store === "object" && !Array.isArray(store) ? Object.values(store) : [];
  return matchingFrames(item, records.flatMap((record) => (record?.frames || []).map((frame) => ({
    ...frame,
    title: frame.title || record.topicTitle
  }))));
}

function previewItemsMatchingPromptHistory(item, previewItems = []) {
  return matchingFrames(item, framesFromSummaryPreviewItems(previewItems));
}

function frameToPocketPage(frame = {}) {
  return {
    href: frame.href,
    url: frame.href,
    title: frame.title,
    pageTitle: frame.title,
    siteName: frame.appName,
    name: frame.appName,
    appId: frame.appId,
    instanceId: frame.instanceId,
    messages: frame.messages
  };
}

export function promptHistoryPocketPages(item, sources = {}) {
  const pages = [
    ...framesMatchingPromptHistory(item, sources.store),
    ...previewItemsMatchingPromptHistory(item, sources.previewItems)
  ].map(frameToPocketPage);
  const seen = new Set();
  return pages.filter((page) => {
    const key = [page.href, ...(Array.isArray(page.messages) ? page.messages.map((message) => message.text) : [])].join("\n");
    if (!page.href || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
