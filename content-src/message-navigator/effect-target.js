import { MESSAGE_NAVIGATOR_ROOT_ID } from "./constants.js";
import {
  cleanLine,
  cloneText,
  elementArea,
  elementOrder,
  pageRoot,
  safeClosest,
  safeMatches,
  safeQsa,
  uniqueElements,
  usefulTurnText,
  visible
} from "./dom-kernel.js";

const STRICT_MESSAGE_ROOT_SELECTOR = [
  "[data-nsan-owner='nsan']",
  "[data-nsan-article='1']",
  "article[data-testid^='conversation-turn-']",
  "article[data-testid*='conversation-turn']",
  "article[data-turn-id]",
  "article[data-turn]",
  "[data-message-author-role]",
  "ms-chat-turn[id^='turn-']",
  "ms-chat-turn",
  "user-query",
  "model-response",
  ".user-query",
  ".model-response",
  ".chat_bubble[role='article']",
  ".chat_bubble",
  ".ds-message",
  "[data-testid='user-message']",
  "[data-testid='assistant-message']",
  "[class*='ChatMessage_chatMessage']",
  "[data-turn-role]",
  ".chat-turn-container",
  "[role='article']",
  "[role='user']",
  "[role='assistant']"
].join(",");

const LOOSE_MESSAGE_ROOT_SELECTOR = [
  STRICT_MESSAGE_ROOT_SELECTOR,
  "[class*='message' i]",
  "[class*='response' i]",
  "[class*='turn' i]",
  "[class*='bubble' i]"
].join(",");

const USER_EFFECT_BODY_SELECTOR = [
  ".user-message-bubble-color",
  "[class*='user-message-bubble' i]",
  "[class*='rightSideMessageBubble']",
  "[class*='Message_rightSideMessageBubble']",
  "[class*='bubble-color' i]",
  ".user-query-bubble-with-background",
  ".query-text",
  ".query-content",
  ".fbb737a4",
  ".rounded-3xl",
  ".chat_bubble_content",
  "[data-testid='user-message']"
].join(",");

const ASSISTANT_EFFECT_BODY_SELECTOR = [
  "[data-message-part-type='answer'].markdown-container-style",
  ".markdown-container-style",
  ".font-claude-response",
  ".font-claude-response-body",
  ".model-response-text .markdown",
  "message-content .markdown",
  ".turn-content",
  "[class*='turn-content']",
  ".ds-markdown:not(.ds-think-content)",
  ".chat_bubble_content",
  "[class*='Message_messageTextContainer']",
  "[class*='Message_leftSideMessageBubble']",
  ".assistant-message-bubble-color",
  ".markdown.prose",
  ".markdown",
  ".prose"
].join(",");

const MESSAGE_ROLE_MARKER_SELECTOR = [
  "[data-message-author-role]",
  "[data-author]",
  "[data-role]",
  "[data-turn-role]",
  "[data-testid='user-message']",
  "[data-testid='assistant-message']",
  "[role='user']",
  "[role='assistant']",
  "user-query",
  "model-response",
  ".user-query",
  ".model-response",
  ".user-message-bubble-color",
  ".assistant-message-bubble-color",
  "[class*='rightSideMessageBubble']",
  "[class*='leftSideMessageBubble']",
  ".fbb737a4",
  ".ds-markdown"
].join(",");

const COMPOSER_CHROME_SELECTOR = [
  "form",
  "textarea",
  "input:not([type='hidden'])",
  "[contenteditable='true']",
  "[role='textbox']",
  "[aria-label*='Chat with' i]",
  "[aria-label*='Ask anything' i]",
  "textarea[aria-label*='Message' i]",
  "input[aria-label*='Message' i]",
  "[contenteditable='true'][aria-label*='Message' i]",
  "[role='textbox'][aria-label*='Message' i]",
  "[placeholder*='Ask' i]",
  "[placeholder*='Message' i]",
  "[class*='composer' i]",
  "[data-testid*='composer' i]"
].join(",");

function normalizeRoleName(value) {
  const text = String(value || "").toLowerCase();
  if (/\b(user|human|you|query|prompt)\b/.test(text)) return "user";
  if (/\b(assistant|bot|model|response|answer|tool)\b/.test(text)) return "assistant";
  return "";
}

function directMessageRole(element) {
  if (!element || element.nodeType !== 1) return "";
  const attrs = [
    "data-message-author-role",
    "data-author",
    "data-role",
    "data-turn-role",
    "data-testid",
    "aria-label"
  ];
  for (const attr of attrs) {
    const role = normalizeRoleName(element.getAttribute?.(attr));
    if (role) return role;
  }
  const tag = String(element.tagName || "").toLowerCase();
  if (tag === "user-query") return "user";
  if (tag === "model-response") return "assistant";
  const classText = String(element.className || "");
  if (/(^|\s)(user-query|user-message-bubble-color|fbb737a4)(\s|$)|rightSideMessageBubble/i.test(classText)) return "user";
  if (/(^|\s)(model-response|assistant-message-bubble-color|ds-markdown)(\s|$)|leftSideMessageBubble|font-claude-response/i.test(classText)) return "assistant";
  return "";
}

function roleMarkersWithin(element) {
  if (!element || element.nodeType !== 1) return [];
  const markers = [];
  if (safeMatches(element, MESSAGE_ROLE_MARKER_SELECTOR)) markers.push(element);
  markers.push(...safeQsa(MESSAGE_ROLE_MARKER_SELECTOR, element));
  return uniqueElements(markers).filter((node) => visible(node) && !safeClosest(node, `#${MESSAGE_NAVIGATOR_ROOT_ID}`));
}

function containsConflictingRole(element, role) {
  const wanted = role === "user" ? "user" : role ? "assistant" : "";
  if (!wanted) return false;
  return roleMarkersWithin(element).some((node) => {
    const markerRole = directMessageRole(node);
    return markerRole && markerRole !== wanted;
  });
}

function containsComposerChrome(element) {
  if (!element || element.nodeType !== 1) return false;
  const controls = safeQsa(COMPOSER_CHROME_SELECTOR, element)
    .filter((node) => node !== element && visible(node) && !safeClosest(node, `#${MESSAGE_NAVIGATOR_ROOT_ID}`));
  return controls.length > 0;
}

function effectRect(element) {
  try {
    const rect = element?.getBoundingClientRect?.();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch {
    return null;
  }
}

function invalidEffectTarget(element, config = {}) {
  if (!element || element.nodeType !== 1 || !visible(element)) return true;
  if (safeClosest(element, `#${MESSAGE_NAVIGATOR_ROOT_ID}`)) return true;
  if (safeMatches(element, [
    "html",
    "body",
    "main",
    "nav",
    "aside",
    "header",
    "footer",
    "form",
    "button",
    "input",
    "textarea",
    "select",
    "svg",
    "img",
    "canvas",
    "video",
    "menu",
    "[role='toolbar']",
    "[role='menu']",
    "[aria-hidden='true']",
    "[hidden]"
  ].join(","))) return true;
  if (safeClosest(element, [
    "nav",
    "aside",
    "header",
    "footer",
    "form",
    "[role='toolbar']",
    "[role='menu']",
    "[class*='toolbar' i]",
    "[class*='action' i]",
    "[class*='actions' i]",
    "[class*='copy' i]",
    "[data-testid*='action' i]"
  ].join(","))) return true;
  const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
  const hasText = usefulTurnText(cloneText(element, cleanupSelectors), 80000);
  const hasMedia = Boolean(safeQsa("pre,code,blockquote,ul,ol,table,img,video,canvas,svg", element).find(visible));
  return !hasText && !hasMedia;
}

function containsMultipleMessageRoots(element) {
  const roots = safeQsa(STRICT_MESSAGE_ROOT_SELECTOR, element)
    .filter((node) => node !== element && visible(node) && !safeClosest(node, `#${MESSAGE_NAVIGATOR_ROOT_ID}`));
  const directRoots = uniqueElements(roots).filter((node) => !safeQsa(STRICT_MESSAGE_ROOT_SELECTOR, node)
    .some((child) => child !== node && roots.includes(child)));
  return directRoots.length > 1;
}

function blockedEffectBoundary(element, role = "") {
  if (!element || element.nodeType !== 1) return true;
  if (containsConflictingRole(element, role)) return true;
  if (containsMultipleMessageRoots(element)) return true;
  if (containsComposerChrome(element)) return true;
  return false;
}

function effectTargetTooBroad(element) {
  if (!element || safeMatches(element, STRICT_MESSAGE_ROOT_SELECTOR)) return false;
  if (containsMultipleMessageRoots(element)) return true;
  const rect = effectRect(element);
  const root = pageRoot();
  const rootRect = effectRect(root);
  if (!rect || !rootRect) return false;
  return rect.width >= rootRect.width * 0.92 && rect.height >= Math.max(500, rootRect.height * 0.72);
}

function usableEffectTarget(element, config = {}, options = {}) {
  if (invalidEffectTarget(element, config)) return false;
  if (!options.allowBoundaryCrossing && blockedEffectBoundary(element, options.role || "")) return false;
  if (!options.allowBroad && effectTargetTooBroad(element)) return false;
  return true;
}

function effectMatches(root, selector, config = {}, options = {}) {
  const candidates = [];
  if (safeMatches(root, selector)) candidates.push(root);
  candidates.push(...safeQsa(selector, root));
  const seen = new Set();
  const filtered = [];
  for (const element of candidates) {
    if (!element || seen.has(element) || !usableEffectTarget(element, config, options)) continue;
    seen.add(element);
    filtered.push(element);
  }
  if (options.prefer === "last") return filtered[filtered.length - 1] || null;
  filtered.sort((a, b) => {
    const area = elementArea(a) - elementArea(b);
    return options.prefer === "largest" ? -area || elementOrder(a, b) : area || elementOrder(a, b);
  });
  return filtered[0] || null;
}

function closestEffectMatch(seed, selector, config = {}, options = {}) {
  for (let node = seed; node && node !== document.documentElement; node = node.parentElement) {
    if (safeMatches(node, selector) && usableEffectTarget(node, config, options)) return node;
    if (safeMatches(node, "main,body")) break;
  }
  return null;
}

function messageRootForEffect(element, target, config = {}, options = {}) {
  const seeds = [target, element].filter(Boolean);
  for (const seed of seeds) {
    const strict = closestEffectMatch(seed, STRICT_MESSAGE_ROOT_SELECTOR, config, { ...options, allowBroad: true });
    if (strict && !blockedEffectBoundary(strict, options.role || "")) return strict;
  }
  for (const seed of seeds) {
    const loose = closestEffectMatch(seed, LOOSE_MESSAGE_ROOT_SELECTOR, config, options);
    if (loose && !blockedEffectBoundary(loose, options.role || "")) return loose;
  }
  return seeds.find((seed) => usableEffectTarget(seed, config, options)) || element || target || null;
}

function roleRootForEffect(element, target, selector, config = {}, role = "") {
  const options = { allowBroad: true, role };
  for (const seed of [target, element].filter(Boolean)) {
    const closest = closestEffectMatch(seed, selector, config, options);
    if (closest) return closest;
  }
  for (const seed of [element, target].filter(Boolean)) {
    const match = effectMatches(seed, selector, config, { ...options, prefer: "largest" });
    if (match) return match;
  }
  return null;
}

function promoteSafeMessageBlock(seed, config = {}, role = "assistant", options = {}) {
  let best = null;
  const minArea = Math.max(1, options.minArea || elementArea(seed));
  for (let node = seed; node && node !== document.documentElement; node = node.parentElement) {
    if (safeMatches(node, "main,body")) break;
    if (node !== seed && safeMatches(node, options.stopSelector || "")) break;
    if (!usableEffectTarget(node, config, { allowBroad: true, role })) {
      if (best) break;
      continue;
    }
    const area = elementArea(node);
    if (area >= minArea) best = node;
    const parent = node.parentElement;
    if (!parent || blockedEffectBoundary(parent, role) || containsComposerChrome(parent)) break;
    if (options.maxAreaRatio && elementArea(parent) > minArea * options.maxAreaRatio) break;
  }
  return best;
}

function chatGptAssistantEffectBlock(element, target, config = {}) {
  const seed = target || element;
  const block = promoteSafeMessageBlock(seed, config, "assistant", {
    maxAreaRatio: 5,
    stopSelector: "article[data-testid^='conversation-turn-'],article[data-testid*='conversation-turn'],article[data-turn-id],article[data-turn]"
  });
  if (!block || block === seed) return null;
  const hasAnswer = safeQsa(".markdown.prose,.markdown, [data-message-author-role='assistant']", block).some(visible)
    || (seed && block.contains?.(seed));
  const hasAssistantChrome = Array.from(block.querySelectorAll("button,[role='button']")).some((button) => /thought|思考|推理/i.test(cleanLine(button.textContent || button.getAttribute?.("aria-label") || "")));
  const text = usefulTurnText(cloneText(block, config.textCleanupSelectors), 80000);
  return hasAnswer && text && (hasAssistantChrome || text.length > usefulTurnText(cloneText(seed, config.textCleanupSelectors), 80000).length + 12)
    ? block
    : null;
}

function fallbackEffectTarget(element, target, config = {}, role = "assistant") {
  const selector = role === "user" ? USER_EFFECT_BODY_SELECTOR : ASSISTANT_EFFECT_BODY_SELECTOR;
  const prefer = role === "user" ? "" : "largest";
  for (const seed of [target, element].filter(Boolean)) {
    const match = effectMatches(seed, selector, config, { role, prefer });
    if (match) return match;
  }
  return [target, element].filter(Boolean)
    .find((seed) => usableEffectTarget(seed, config, { role, allowBroad: false })) || null;
}

function resolveEffectTarget(item = {}, config = {}, adapter = null) {
  const role = item.role === "user" || item.role === "thinking" ? item.role : "assistant";
  const effectRole = role === "user" ? "user" : "assistant";
  const element = item.element || item.target;
  const target = item.target || element;
  const explicit = item.effectTarget
    || adapter?.effectTarget?.(element, config, { ...item, role, target, effectRole })
    || null;
  if (usableEffectTarget(explicit, config, { allowBroad: true, role: effectRole })) return explicit;
  const root = messageRootForEffect(element, target, config, { allowBroad: role !== "user", role: effectRole });
  if (role === "user") {
    return effectMatches(root || element || target, USER_EFFECT_BODY_SELECTOR, config, { role: effectRole })
      || (usableEffectTarget(target, config, { role: effectRole }) ? target : null)
      || (usableEffectTarget(root, config, { role: effectRole }) ? root : null)
      || fallbackEffectTarget(element, target, config, effectRole);
  }
  const rootUsable = usableEffectTarget(root, config, { allowBroad: true, role: effectRole }) && !effectTargetTooBroad(root);
  return (rootUsable ? root : null)
    || effectMatches(root || element || target, ASSISTANT_EFFECT_BODY_SELECTOR, config, { prefer: "largest", role: effectRole })
    || (usableEffectTarget(target, config, { allowBroad: true, role: effectRole }) ? target : null)
    || fallbackEffectTarget(element, target, config, effectRole);
}

export {
  USER_EFFECT_BODY_SELECTOR,
  chatGptAssistantEffectBlock,
  closestEffectMatch,
  containsComposerChrome,
  effectRect,
  effectMatches,
  fallbackEffectTarget,
  messageRootForEffect,
  resolveEffectTarget,
  roleRootForEffect,
  usableEffectTarget
};
