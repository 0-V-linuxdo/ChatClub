import { MESSAGE_NAVIGATOR_ROOT_ID } from "./constants.js";

const normalize = (value) => String(value || "")
  .replace(/\u00a0/g, " ")
  .replace(/\r\n?/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .replace(/[ \t]{2,}/g, " ")
  .trim();

function safeQsa(selector, root = document) {
  try {
    return selector ? Array.from((root || document).querySelectorAll(selector)) : [];
  } catch {
    return [];
  }
}

function safeClosest(element, selector) {
  try {
    return element?.closest?.(selector) || null;
  } catch {
    return null;
  }
}

function safeMatches(element, selector) {
  try {
    return Boolean(element?.matches?.(selector));
  } catch {
    return false;
  }
}

function visible(element) {
  if (!element || element.nodeType !== 1) return false;
  try {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 2 && rect.height > 2 && style.display !== "none" && style.visibility !== "hidden";
  } catch {
    return false;
  }
}

function elementOrder(a, b) {
  try {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
  } catch {
    return 0;
  }
}

function uniqueElements(elements) {
  const out = [];
  for (const element of elements || []) {
    if (!element || out.includes(element)) continue;
    if (out.some((other) => other !== element && other.contains?.(element))) continue;
    for (let index = out.length - 1; index >= 0; index -= 1) {
      if (element.contains?.(out[index])) out.splice(index, 1);
    }
    out.push(element);
  }
  return out.sort(elementOrder);
}

function cloneText(element, cleanupSelectors = []) {
  if (!element) return "";
  let clone;
  try {
    clone = element.cloneNode(true);
  } catch {
    return normalize(element.innerText || element.textContent || "");
  }
  const noisy = [
    "button",
    "svg",
    "header",
    "footer",
    "nav",
    "menu",
    "form",
    "input",
    "textarea",
    "select",
    "[aria-hidden='true']",
    "[hidden]",
    "[role='toolbar']",
    "[data-files]",
    "[data-edit]",
    ".sr-only",
    ".visually-hidden",
    ".selector",
    ".code-buttons",
    ...cleanupSelectors
  ];
  for (const selector of noisy) {
    for (const node of safeQsa(selector, clone)) node.remove();
  }
  return normalize(clone.innerText || clone.textContent || "");
}

function compactText(value, limit = 60) {
  const text = normalize(value).replace(/\s+/g, " ");
  if (!text) return "";
  const max = Math.max(20, Math.min(180, Number(limit) || 60));
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trim()}...` : text;
}

function rawText(element) {
  return normalize(element?.innerText || element?.textContent || "");
}

function metaText(element) {
  return normalize([
    element?.tagName,
    element?.getAttribute?.("id"),
    element?.getAttribute?.("role"),
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("title"),
    element?.getAttribute?.("data-testid"),
    element?.getAttribute?.("data-test-id"),
    element?.getAttribute?.("data-message-author-role"),
    element?.getAttribute?.("data-author"),
    element?.getAttribute?.("data-turn-role"),
    element?.getAttribute?.("data-message-role"),
    element?.getAttribute?.("class")
  ].filter(Boolean).join(" ")).toLowerCase();
}

function fullMetaText(element) {
  return normalize([
    metaText(element),
    element?.getAttribute?.("name"),
    element?.getAttribute?.("value"),
    element?.textContent,
    element?.innerText
  ].filter(Boolean).join(" "));
}

function pageRoot(selector = "main,[role='main']") {
  return safeQsa(selector).filter(visible).find((element) => !safeClosest(element, "nav,aside,header,footer"))
    || safeQsa("main,[role='main']").filter(visible).find((element) => !safeClosest(element, "nav,aside,header,footer"))
    || document.body
    || document.documentElement;
}

function inChromeScope(element) {
  return Boolean(safeClosest(element, [
    `#${MESSAGE_NAVIGATOR_ROOT_ID}`,
    "nav",
    "aside",
    "header",
    "footer",
    "form",
    "input",
    "textarea",
    "select",
    "[contenteditable='true']"
  ].join(",")));
}

function cleanLine(value) {
  return normalize(value)
    .replace(/^[-•]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function referenceOnlyText(value) {
  const text = normalize(value).replace(/\s+/g, " ");
  if (!text) return true;
  if (/^(?:References|Sources|Citations|引用|来源|参考)\b/i.test(text)) return true;
  if (/^\(?\d+\s+total\)?$/i.test(text)) return true;
  if (/^(?:https?:\/\/|[\w.-]+\.[a-z]{2,})(?:\s+\d+%)?$/i.test(text)) return true;
  return false;
}

function controlOnlyText(value) {
  const text = normalize(value).replace(/\s+/g, " ");
  return /^(?:copy|copied|copy message|copy response|copy text|复制|已复制|拷贝|Quick|Default|Prompt|助手|其他|High|Send|Ask anything|Message)$/i.test(text);
}

function usefulTurnText(value, maxLength = 50000) {
  const text = normalize(value);
  if (!text || text.length < 2 || text.length > maxLength) return "";
  if (!/[\w\u4e00-\u9fff]/.test(text)) return "";
  if (controlOnlyText(text) || referenceOnlyText(text)) return "";
  return text;
}
function elementArea(element) {
  try {
    const rect = element.getBoundingClientRect();
    return Math.max(1, rect.width * rect.height);
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function textMatchesNeedle(text, needle) {
  const haystack = cleanLine(text).toLowerCase();
  const rawNeedle = cleanLine(needle).toLowerCase();
  if (!haystack || !rawNeedle) return false;
  const compactNeedle = rawNeedle.length > 96 ? rawNeedle.slice(0, 96).trim() : rawNeedle;
  return haystack.includes(compactNeedle)
    || (haystack.length >= 12 && rawNeedle.includes(haystack));
}

function targetForText(root, config, needles, options = {}) {
  const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
  const selector = options.selector || "article,section,div,p,[role='article'],[data-message-author-role],[data-testid*='message'],[class*='message' i],[class*='bubble' i],[class*='response' i]";
  const wanted = (Array.isArray(needles) ? needles : [needles]).map(cleanLine).filter(Boolean);
  if (!wanted.length) return root;
  const candidates = safeQsa(selector, root)
    .filter((element) => element !== root && visible(element) && !inChromeScope(element))
    .filter((element) => !options.reject?.(element))
    .map((element) => ({ element, text: cloneText(element, cleanupSelectors) }))
    .filter((item) => usefulTurnText(item.text, options.maxLength || 60000))
    .filter((item) => wanted.some((needle) => textMatchesNeedle(item.text, needle)));
  candidates.sort((a, b) => {
    const area = elementArea(a.element) - elementArea(b.element);
    return area || a.text.length - b.text.length || elementOrder(a.element, b.element);
  });
  return candidates[0]?.element || root;
}

export {
  cleanLine,
  cloneText,
  compactText,
  elementArea,
  elementOrder,
  fullMetaText,
  inChromeScope,
  metaText,
  normalize,
  pageRoot,
  rawText,
  referenceOnlyText,
  safeClosest,
  safeMatches,
  safeQsa,
  targetForText,
  uniqueElements,
  usefulTurnText,
  visible
};
