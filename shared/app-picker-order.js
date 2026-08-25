export const APP_PICKER_SECTION_IDS = Object.freeze([
  "custom",
  "international",
  "aggregator",
  "chinese"
]);

export const DEFAULT_APP_PICKER_SECTION_ORDER = APP_PICKER_SECTION_IDS;

export const DEFAULT_APP_PICKER_APP_ORDERS = Object.freeze(Object.fromEntries(
  APP_PICKER_SECTION_IDS.map((id) => [id, Object.freeze([])])
));

export const APP_PICKER_INTERNATIONAL_IDS = Object.freeze([
  "ChatGPT", "Claude", "Copilot", "CopilotGH", "Gemini", "Grok", "Meta", "Mistral",
  "Perplexity", "QwenChat", "Zai", "KimiAI", "Dola"
]);

export const APP_PICKER_AGGREGATOR_IDS = Object.freeze([
  "Felo", "Genspark", "Liner", "You", "Poe", "NotionAI", "Kagi", "TypingMind",
  "GrokMirror", "LobeHub"
]);

export const APP_PICKER_CHINESE_IDS = Object.freeze([
  "ChatGLM", "DeepSeek", "DouBao", "YiYan", "Kimi", "LingGuang", "LongCat", "MetaSo",
  "HaiLuo", "NaMiSearch", "Qwen", "SenseChat", "YueWen", "HunYuan"
]);

function textId(value) {
  return String(value || "").trim();
}

function uniqueKnownIds(value, known) {
  const ordered = [];
  for (const item of Array.isArray(value) ? value : []) {
    const id = textId(item);
    if (!id || (known && !known.has(id)) || ordered.includes(id)) continue;
    ordered.push(id);
  }
  return ordered;
}

export function normalizeAppPickerSectionOrder(value = []) {
  const known = new Set(APP_PICKER_SECTION_IDS);
  const ordered = uniqueKnownIds(Array.isArray(value) ? value : DEFAULT_APP_PICKER_SECTION_ORDER, known);
  for (const id of APP_PICKER_SECTION_IDS) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

export function normalizeAppPickerAppOrders(value = {}) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(APP_PICKER_SECTION_IDS.map((section) => [
    section,
    uniqueKnownIds(raw[section])
  ]));
}

export function applyStoredOrder(items = [], storedIds = []) {
  const byId = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const id = textId(item?.id);
    if (!id || byId.has(id)) continue;
    byId.set(id, item);
  }
  const ordered = [];
  const seen = new Set();
  for (const id of Array.isArray(storedIds) ? storedIds : []) {
    const item = byId.get(textId(id));
    if (!item || seen.has(item.id)) continue;
    ordered.push(item);
    seen.add(item.id);
  }
  for (const item of byId.values()) {
    if (seen.has(item.id)) continue;
    ordered.push(item);
    seen.add(item.id);
  }
  return ordered;
}

export function moveOrderedIds(ids, sourceId, targetId, placement) {
  const source = textId(sourceId);
  const target = textId(targetId);
  const list = Array.isArray(ids) ? ids.map(textId).filter(Boolean) : [];
  if (!source || !target || source === target || !list.includes(source) || !list.includes(target)) {
    return list;
  }
  const without = list.filter((id) => id !== source);
  const targetIndex = without.indexOf(target);
  const insertIndex = targetIndex + (placement === "after" ? 1 : 0);
  return [...without.slice(0, insertIndex), source, ...without.slice(insertIndex)];
}
