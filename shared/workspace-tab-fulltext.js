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

function stableConversationHref(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol)) return "";
    const path = (url.pathname || "/").replace(/\/+$/, "") || "/";
    const host = url.hostname.toLowerCase();
    if (path === "/" || path === "/ai" || path === "/new") return "";
    if ((host === "gemini.google.com" || host === "bard.google.com") && path === "/app") return "";
    if (
      (host === "app.notion.com" || host === "notion.so" || host.endsWith(".notion.so"))
      && path === "/chat"
      && !url.searchParams.get("t")
    ) {
      return "";
    }
    return url.href;
  } catch {
    return "";
  }
}

function frameIdentityKey(frame = {}) {
  const href = stableConversationHref(frame.href);
  if (href) return `href:${href}`;
  const instanceId = textValue(frame.instanceId);
  if (instanceId) return `id:${instanceId}`;
  const fallbackHref = textValue(frame.href);
  return fallbackHref ? `href:${fallbackHref}` : "";
}

function pairsOverlap(left, right) {
  return fullTextTextsOverlap(left?.userMessage, right?.userMessage);
}

function mergeFrameMessages(existingMessages, incomingMessages) {
  const existing = (Array.isArray(existingMessages) ? existingMessages : [])
    .map((message) => normalizeFullTextMessage(message))
    .filter(Boolean);
  const incoming = (Array.isArray(incomingMessages) ? incomingMessages : [])
    .map((message) => normalizeFullTextMessage(message))
    .filter(Boolean);
  if (!incoming.length) return existing.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
  if (!existing.length) return incoming.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
  const existingPairs = pocketPairsFromMessages(existing);
  const incomingPairs = pocketPairsFromMessages(incoming);
  if (!incomingPairs.length) return existing.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
  if (!existingPairs.length) return incoming.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
  const existingCovered = existingPairs.every((pair) => incomingPairs.some((other) => pairsOverlap(pair, other)));
  if (existingCovered && incomingPairs.length >= existingPairs.length) {
    return incoming.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
  }
  const mergedPairs = existingPairs.map((pair) => {
    const match = incomingPairs.find((other) => pairsOverlap(pair, other));
    if (!match) return pair;
    return {
      userMessage: match.userMessage.length >= pair.userMessage.length ? match.userMessage : pair.userMessage,
      assistantMessage: match.assistantMessage.length >= pair.assistantMessage.length
        ? match.assistantMessage
        : pair.assistantMessage
    };
  });
  for (const incomingPair of incomingPairs) {
    if (!mergedPairs.some((pair) => pairsOverlap(pair, incomingPair))) mergedPairs.push(incomingPair);
  }
  return mergedPairs
    .flatMap((pair) => [
      { role: "user", text: pair.userMessage },
      { role: "assistant", text: pair.assistantMessage }
    ])
    .slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
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
      merged[index] = {
        ...frame,
        messages: mergeFrameMessages(merged[index].messages, frame.messages),
        order: merged[index].order
      };
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
  const turns = [];
  for (const raw of Array.isArray(messages) ? messages : []) {
    const message = normalizeFullTextMessage(raw);
    if (message) turns.push(message);
  }
  if (!turns.length) return false;
  const last = turns[turns.length - 1];
  if (last.role !== "assistant" || !textValue(last.text)) return false;
  let lastUser = null;
  for (let index = turns.length - 2; index >= 0; index -= 1) {
    if (turns[index].role === "user") {
      lastUser = turns[index];
      break;
    }
  }
  return Boolean(lastUser && fullTextTextsOverlap(lastUser.text, prompt));
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
      logoUrl: textValue(page.logoUrl || item.logoUrl),
      messages,
      order: Number.isInteger(item.order) ? item.order : order
    }];
  }).slice(0, WORKSPACE_TAB_FULLTEXT_MAX_FRAMES);
}

export function workspaceTabFullTextFramesEqual(left = [], right = []) {
  const a = (Array.isArray(left) ? left : [])
    .map((frame, order) => normalizeFrame(frame, order))
    .filter(Boolean);
  const b = (Array.isArray(right) ? right : [])
    .map((frame, order) => normalizeFrame(frame, order))
    .filter(Boolean);
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (frameIdentityKey(a[index]) !== frameIdentityKey(b[index])) return false;
    if (textValue(a[index].href) !== textValue(b[index].href)) return false;
    const leftMessages = a[index].messages;
    const rightMessages = b[index].messages;
    if (leftMessages.length !== rightMessages.length) return false;
    for (let messageIndex = 0; messageIndex < leftMessages.length; messageIndex += 1) {
      if (leftMessages[messageIndex].role !== rightMessages[messageIndex].role) return false;
      if (leftMessages[messageIndex].text !== rightMessages[messageIndex].text) return false;
    }
  }
  return true;
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
    logoUrl: textValue(frame.logoUrl),
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

export function uniqueWorkspaceTabFullTextHits(store, query, items = []) {
  const grouped = new Map();
  for (const hit of searchWorkspaceTabFullTextHits(store, query, items)) {
    let entry = grouped.get(hit.workspaceId);
    if (!entry) {
      entry = {
        workspaceId: hit.workspaceId,
        topicTitle: hit.topicTitle,
        live: hit.live === true,
        title: hit.title,
        appNames: []
      };
      grouped.set(hit.workspaceId, entry);
    }
    const appName = textValue(hit.appName);
    if (appName && !entry.appNames.includes(appName)) entry.appNames.push(appName);
  }
  return [...grouped.values()];
}

export function leftoverWorkspaceTabFullTextHits(store, query, items = []) {
  const present = new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => normalizeWorkspaceSessionId(item?.workspaceId))
      .filter(Boolean)
  );
  return uniqueWorkspaceTabFullTextHits(store, query, items)
    .filter((hit) => !present.has(hit.workspaceId));
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
    logoUrl: frame.logoUrl,
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
