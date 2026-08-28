import { normalizeWorkspaceSessionId } from "./workspace-session.js";

const WORKSPACE_TAB_FULLTEXT_MAX_WORKSPACES = 80;
const WORKSPACE_TAB_FULLTEXT_MAX_FRAMES = 12;
const WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES = 200;
const WORKSPACE_TAB_FULLTEXT_MAX_MESSAGE_CHARS = 20000;

function textValue(value) {
  return String(value || "").trim();
}

const FULLTEXT_OVERLAP_MIN_CHARS = 8;

function normalizeFullTextMatchText(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!text) return "";
  try {
    return text.normalize("NFKC").replace(/\s+/g, " ").trim();
  } catch {
    return text.replace(/\s+/g, " ").trim();
  }
}

export function fullTextTextsOverlap(left, right) {
  const a = normalizeFullTextMatchText(left);
  const b = normalizeFullTextMatchText(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const compactA = a.replace(/\s+/g, "");
  const compactB = b.replace(/\s+/g, "");
  if (compactA === compactB) return true;
  const includes = (short, long) => short.length >= FULLTEXT_OVERLAP_MIN_CHARS && long.includes(short);
  if (a.length <= b.length ? includes(a, b) : includes(b, a)) return true;
  return compactA.length <= compactB.length ? includes(compactA, compactB) : includes(compactB, compactA);
}

function normalizeFullTextQuery(value) {
  return textValue(value).toLowerCase();
}

export function matchesFullTextQuery(query, values = []) {
  const needle = normalizeFullTextQuery(query);
  if (!needle) return true;
  return (Array.isArray(values) ? values : [values]).some((value) => (
    textValue(value).toLowerCase().includes(needle)
  ));
}

function normalizeFullTextMessage(message = {}) {
  const role = message?.role === "assistant" ? "assistant" : message?.role === "user" ? "user" : "";
  const text = clipText(message?.text || message?.content);
  return role && text ? { role, text } : null;
}

export function pocketPairsFromMessages(messages = []) {
  const entries = [];
  let userMessage = "";
  for (const raw of Array.isArray(messages) ? messages : []) {
    const message = normalizeFullTextMessage(raw);
    if (!message) continue;
    if (message.role === "user") {
      userMessage = message.text;
      continue;
    }
    if (message.role === "assistant" && userMessage) {
      entries.push({ userMessage, assistantMessage: message.text });
      userMessage = "";
    }
  }
  return entries;
}

function frameIdentityKey(frame = {}) {
  const instanceId = textValue(frame.instanceId);
  if (instanceId) return `id:${instanceId}`;
  const href = textValue(frame.href);
  return href ? `href:${href}` : "";
}

export function mergeWorkspaceTabFullTextFrames(existing = [], incoming = []) {
  const current = (Array.isArray(existing) ? existing : [])
    .map((frame, order) => normalizeFrame(frame, order))
    .filter(Boolean);
  const next = (Array.isArray(incoming) ? incoming : [])
    .map((frame, order) => normalizeFrame(frame, order))
    .filter(Boolean);
  if (!next.length) return current.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_FRAMES);
  const indexByKey = new Map();
  const merged = current.map((frame, index) => {
    const key = frameIdentityKey(frame);
    if (key) indexByKey.set(key, index);
    return frame;
  });
  for (const frame of next) {
    const key = frameIdentityKey(frame);
    const index = key ? indexByKey.get(key) : undefined;
    if (index != null) {
      merged[index] = { ...frame, order: merged[index].order };
      continue;
    }
    if (key) indexByKey.set(key, merged.length);
    merged.push({ ...frame, order: merged.length });
  }
  return merged
    .map((frame, order) => ({ ...frame, order }))
    .slice(0, WORKSPACE_TAB_FULLTEXT_MAX_FRAMES);
}

export function fullTextMessagesHavePair(messages) {
  return pocketPairsFromMessages(messages).some((pair) => (
    textValue(pair.userMessage) && textValue(pair.assistantMessage)
  ));
}

export function fullTextMessagesMatchPrompt(messages, prompt) {
  if (!normalizeFullTextMatchText(prompt)) return false;
  return pocketPairsFromMessages(messages).some((pair) => (
    Boolean(textValue(pair.assistantMessage)) && fullTextTextsOverlap(pair.userMessage, prompt)
  ));
}

export function framesFromSummaryPreviewItems(items = []) {
  return (Array.isArray(items) ? items : []).flatMap((item, order) => {
    if (item?.status && item.status !== "ok") return [];
    const page = item?.page && typeof item.page === "object" ? item.page : item || {};
    const messages = (Array.isArray(page.messages) ? page.messages : [])
      .map((message) => normalizeFullTextMessage(message))
      .filter(Boolean)
      .slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
    if (!messages.length) return [];
    return [{
      appId: textValue(item.siteId || item.appId || page.siteId),
      instanceId: textValue(item.instanceId || page.instanceId),
      href: textValue(page.href || item.href),
      title: textValue(page.title || item.title || page.pageTitle),
      appName: textValue(item.siteName || item.name || page.siteName || page.name),
      messages,
      order: Number.isInteger(item.order) ? item.order : order
    }];
  }).slice(0, WORKSPACE_TAB_FULLTEXT_MAX_FRAMES);
}

function clipText(value, max = WORKSPACE_TAB_FULLTEXT_MAX_MESSAGE_CHARS) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > max ? text.slice(0, max) : text;
}

function normalizeFrame(frame = {}, order = 0) {
  const messages = (Array.isArray(frame.messages) ? frame.messages : [])
    .map((message) => normalizeFullTextMessage(message))
    .filter(Boolean)
    .slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
  if (!messages.length) return null;
  return {
    appId: textValue(frame.appId),
    instanceId: textValue(frame.instanceId),
    href: textValue(frame.href),
    title: textValue(frame.title),
    appName: textValue(frame.appName),
    messages,
    order: Number.isInteger(frame.order) ? frame.order : order
  };
}

function normalizeWorkspaceTabFullTextRecord(raw = {}) {
  const workspaceId = normalizeWorkspaceSessionId(raw.workspaceId);
  const frames = (Array.isArray(raw.frames) ? raw.frames : [])
    .map((frame, order) => normalizeFrame(frame, order))
    .filter(Boolean)
    .slice(0, WORKSPACE_TAB_FULLTEXT_MAX_FRAMES);
  if (!workspaceId || !frames.length) return null;
  return {
    workspaceId,
    topicTitle: textValue(raw.topicTitle),
    updatedAt: textValue(raw.updatedAt) || new Date().toISOString(),
    frames
  };
}

export function normalizeWorkspaceTabFullTextStore(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const store = {};
  for (const [key, value] of Object.entries(source)) {
    const record = normalizeWorkspaceTabFullTextRecord({ ...value, workspaceId: value?.workspaceId || key });
    if (record) store[record.workspaceId] = record;
  }
  return pruneWorkspaceTabFullTextStore(store);
}

export function pruneWorkspaceTabFullTextStore(store = {}) {
  const records = Object.values(store && typeof store === "object" ? store : {})
    .map((record) => normalizeWorkspaceTabFullTextRecord(record))
    .filter(Boolean)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  return Object.fromEntries(
    records.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_WORKSPACES).map((record) => [record.workspaceId, record])
  );
}

export function upsertWorkspaceTabFullText(store, record) {
  const next = normalizeWorkspaceTabFullTextRecord(record);
  if (!next) return normalizeWorkspaceTabFullTextStore(store);
  return pruneWorkspaceTabFullTextStore({
    ...normalizeWorkspaceTabFullTextStore(store),
    [next.workspaceId]: next
  });
}

export function removeWorkspaceTabFullText(store, workspaceId) {
  const id = normalizeWorkspaceSessionId(workspaceId);
  const current = normalizeWorkspaceTabFullTextStore(store);
  if (!id || !Object.prototype.hasOwnProperty.call(current, id)) return current;
  const next = { ...current };
  delete next[id];
  return next;
}

export function searchWorkspaceTabFullTextHits(store, query, items = []) {
  const needle = normalizeFullTextQuery(query);
  if (!needle) return [];
  const labels = new Map(
    (Array.isArray(items) ? items : []).map((item) => [normalizeWorkspaceSessionId(item.workspaceId), item])
  );
  const hits = [];
  for (const record of Object.values(normalizeWorkspaceTabFullTextStore(store))) {
    const item = labels.get(record.workspaceId);
    for (const frame of record.frames) {
      for (const pair of pocketPairsFromMessages(frame.messages)) {
        if (!matchesFullTextQuery(needle, [pair.userMessage, pair.assistantMessage, frame.title, frame.appName])) {
          continue;
        }
        hits.push({
          workspaceId: record.workspaceId,
          topicTitle: record.topicTitle,
          live: item?.live === true,
          title: item?.topicTitle || record.topicTitle || frame.title || frame.appName,
          appName: frame.appName,
          href: frame.href,
          userMessage: pair.userMessage,
          assistantMessage: pair.assistantMessage
        });
      }
    }
  }
  return hits;
}

export function workspaceIdsMatchingFullText(store, query) {
  return [...new Set(searchWorkspaceTabFullTextHits(store, query).map((hit) => hit.workspaceId))];
}

function frameToPocketPage(frame = {}) {
  const href = textValue(frame.href);
  if (!href || !fullTextMessagesHavePair(frame.messages)) return null;
  return {
    href,
    url: href,
    title: frame.title,
    pageTitle: frame.title,
    siteName: frame.appName,
    name: frame.appName,
    appId: frame.appId,
    instanceId: frame.instanceId,
    messages: frame.messages
  };
}

export function pocketPagesFromWorkspaceFullText(store, workspaceId) {
  const id = normalizeWorkspaceSessionId(workspaceId);
  const record = id ? normalizeWorkspaceTabFullTextStore(store)[id] : null;
  return (record?.frames || []).map((frame) => frameToPocketPage(frame)).filter(Boolean);
}

export function pocketPagesFromPreviewItems(items = []) {
  return framesFromSummaryPreviewItems(items).map((frame) => frameToPocketPage(frame)).filter(Boolean);
}
