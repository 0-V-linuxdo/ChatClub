import {
  cloneText,
  compactText,
  elementOrder,
  fullMetaText,
  inChromeScope,
  metaText,
  normalize,
  pageRoot,
  safeMatches,
  safeQsa,
  uniqueElements,
  usefulTurnText,
  visible
} from "./dom-kernel.js";
import { resolveEffectTarget } from "./effect-target.js";

function conversationLooksUseful(items = []) {
  const useful = items.filter((item) => item?.element && item?.text);
  return useful.length >= 2 && useful.some((item) => item.role === "user") && useful.some((item) => item.role === "assistant");
}

function nearestTextAncestor(seed, cleanupSelectors = [], options = {}) {
  const root = options.root || pageRoot();
  const maxDepth = Math.max(3, Math.min(16, Number(options.maxDepth) || 10));
  const maxLength = Math.max(500, Math.min(80000, Number(options.maxLength) || 50000));
  let node = seed;
  for (let depth = 0; node && node !== document.documentElement && depth < maxDepth; depth += 1, node = node.parentElement) {
    if (!visible(node)) continue;
    if (node !== seed && inChromeScope(node)) continue;
    const text = usefulTurnText(cloneText(node, cleanupSelectors), maxLength);
    if (text && node !== seed) return { element: node, text };
    if (node === root || safeMatches(node, "main,[role='main'],body")) break;
  }
  return null;
}

function messageCopyButton(button) {
  const meta = fullMetaText(button);
  return /\bcopy\s+message\b|复制(?:消息|讯息)|拷贝(?:消息|讯息)/i.test(meta);
}

function referenceCopyButton(button) {
  const meta = fullMetaText(button);
  return /\bcopy\s+(?:references?|sources?|citations?)\b|引用|来源|参考|citation|source/i.test(meta);
}

function collectFromCopyButtons(config, options = {}) {
  const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
  const root = pageRoot(options.rootSelector || "main,[role='main']");
  const buttons = safeQsa("button,[role='button']", root)
    .filter((button) => visible(button) && !inChromeScope(button) && messageCopyButton(button) && !referenceCopyButton(button))
    .sort(elementOrder)
    .slice(0, Math.max(4, Math.min(80, Number(options.limit) || 48)));
  const items = [];
  const seen = new Set();
  for (const button of buttons) {
    const ancestor = nearestTextAncestor(button, cleanupSelectors, { root, maxDepth: options.maxDepth || 10 });
    if (!ancestor) continue;
    const role = genericRole(ancestor.element, config) || (items.length % 2 === 0 ? "user" : "assistant");
    const key = `${role}\n${ancestor.text.toLowerCase().replace(/\s+/g, " ").slice(0, 500)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      element: ancestor.element,
      target: ancestor.element,
      role,
      text: compactText(ancestor.text, config.summaryMaxChars)
    });
  }
  return dedupeItems(items);
}

function candidateTextBlocks(root, config, selector, options = {}) {
  const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
  const nodes = uniqueElements(safeQsa(selector, root)
    .filter((element) => visible(element) && !inChromeScope(element))
    .filter((element) => !options.reject?.(element)));
  const items = [];
  const seen = new Set();
  for (const element of nodes) {
    const text = usefulTurnText(cloneText(element, cleanupSelectors), options.maxLength || 50000);
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, " ").slice(0, 500);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ element, target: element, text });
  }
  return items.sort((a, b) => elementOrder(a.element, b.element));
}

function genericRole(element, config = {}) {
  if (config.userSelector && (safeMatches(element, config.userSelector) || safeQsa(config.userSelector, element).length)) return "user";
  if (config.assistantSelector && (safeMatches(element, config.assistantSelector) || safeQsa(config.assistantSelector, element).length)) return "assistant";
  const meta = metaText(element);
  if (/\b(user|human|query|prompt)\b|data-message-author-role=.user/.test(meta)) return "user";
  if (/\b(assistant|bot|model|response|answer)\b|data-message-author-role=.assistant/.test(meta)) return "assistant";
  const label = normalize(element?.innerText || element?.textContent || "").slice(0, 80);
  if (/^(you|you said|你|你说|用户)[:：\s]/i.test(label)) return "user";
  if (/^(assistant|claude|gemini|chatgpt|kagi|poe|助手)[:：\s]/i.test(label)) return "assistant";
  return "";
}

function genericTarget(element) {
  return safeQsa([
    ".markdown",
    ".prose",
    "[class*='markdown' i]",
    "[class*='message' i]",
    "[class*='bubble' i]",
    "[data-message-author-role]",
    "[role='article']"
  ].join(","), element).find(visible) || element;
}
function cleanKey(item) {
  return `${item.role}\n${normalize(item.text).toLowerCase().slice(0, 260)}`;
}

function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.element || !item.text) continue;
    const key = cleanKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function adapterBaseQuery(config) {
  return uniqueElements(safeQsa(config.messageSelector).filter(visible));
}

function adapterBaseItems(config, adapter = {}) {
  const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
  return dedupeItems(adapterBaseQuery(config).map((element) => {
    const role = adapter.role?.(element, config) || genericRole(element, config) || "assistant";
    const target = adapter.target?.(element, config) || genericTarget(element);
    const textSource = adapter.summaryElement?.(element, config) || target || element;
    const rawValue = adapter.text?.(element, config, { role, target, textSource })
      || cloneText(textSource, cleanupSelectors)
      || cloneText(element, cleanupSelectors);
    const effectTarget = resolveEffectTarget({ element, target, role, textSource }, config, adapter);
    return {
      element,
      target,
      effectTarget,
      role,
      text: compactText(rawValue, config.summaryMaxChars)
    };
  }));
}

export {
  adapterBaseItems,
  candidateTextBlocks,
  collectFromCopyButtons,
  conversationLooksUseful,
  dedupeItems,
  genericRole
};
