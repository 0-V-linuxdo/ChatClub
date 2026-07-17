import { MESSAGE_NAVIGATOR_ROOT_ID } from "../constants.js";
import {
  cleanLine,
  cloneText,
  compactText,
  elementArea,
  elementOrder,
  inChromeScope,
  metaText,
  normalize,
  pageRoot,
  rawText,
  safeClosest,
  safeMatches,
  safeQsa,
  usefulTurnText,
  visible
} from "../dom-kernel.js";
import {
  adapterBaseItems,
  conversationLooksUseful,
  dedupeItems,
  genericRole
} from "../collection-kernel.js";
import {
  USER_EFFECT_BODY_SELECTOR,
  containsComposerChrome,
  effectMatches,
  effectRect,
  messageRootForEffect
} from "../effect-target.js";

const grokUiLinePattern = /^(?:Copy|Copied|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|Worked for .*|思考了.*|工作了.*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
function cleanGrokText(value) {
  const lines = normalize(String(value || "").replace(/\r\n?/g, "\n").replace(/Show more\s*Show less/gi, ""))
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !grokUiLinePattern.test(line));
  const text = trimGrokSourceLead(lines).join("\n");
  return usefulTurnText(text);
}

function grokSourceCardLine(line) {
  const text = cleanLine(line);
  if (!text) return true;
  if (/^(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/i.test(text)) return true;
  if (/^(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+[^\u4e00-\u9fff]{0,160}$/i.test(text)) return true;
  if (/^(?:How to|What is|What are|Why|Chrome|Google|Wikipedia|YouTube|GitHub|Stack Overflow)\b/i.test(text) && !/[\u4e00-\u9fff。！？]/.test(text) && text.length <= 160) return true;
  if (/^(?:[\w.-]+\.)+[a-z]{2,}\S+/i.test(text) && !/[\u4e00-\u9fff]/.test(text)) return true;
  return false;
}

function grokAnswerStartLine(line) {
  const text = cleanLine(line);
  if (!text) return false;
  if (/^(?:你好|您好|当然|可以|这个|这里|这是|我(?:是|会|可以|来)|以下|简单来说|总之|结论|Sure\b|Here\b|Absolutely\b|In short\b|The short answer\b|To\b)/i.test(text)) return true;
  if (/[\u4e00-\u9fff]/.test(text) && text.length >= 14 && /[。！？!?.，,]/.test(text)) return true;
  return text.length >= 140 && /[.!?。！？]/.test(text);
}

function trimGrokEmbeddedSourcePrefix(line) {
  return cleanLine(line).replace(/^(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:[^\u4e00-\u9fff\n]{0,220}?)(?=(?:你好|您好|当然|可以|这个|这里|这是|我是|我会|以下|简单来说|总之|结论))/i, "");
}

function trimGrokSourceLead(lines = []) {
  const normalizedLines = lines.map(trimGrokEmbeddedSourcePrefix).map(cleanLine).filter(Boolean);
  const answerIndex = normalizedLines.findIndex(grokAnswerStartLine);
  if (answerIndex > 0 && normalizedLines.slice(0, answerIndex).some(grokSourceCardLine)) {
    return normalizedLines.slice(answerIndex);
  }
  let start = 0;
  while (start < normalizedLines.length - 1 && grokSourceCardLine(normalizedLines[start])) start += 1;
  return normalizedLines.slice(start);
}

function grokTextOf(element, config = {}) {
  const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
  return cleanGrokText(cloneText(element, cleanupSelectors));
}

function grokThoughtLabel(value) {
  const match = normalize(value).match(/(?:\b(?:Thought|Worked)\s+for\s+[^,。\n]{1,32}|(?:思考|工作)了\s*[^,。\n]{1,32})/i);
  return match ? normalize(match[0]) : "";
}

function grokHasProgressMarker(value) {
  return /(?:\b(?:Thought|Worked)\s+for\b|(?:思考|工作)了)/i.test(normalize(value));
}

function grokLooksMessageText(value) {
  const text = cleanGrokText(value);
  if (!text || text.length < 2 || text.length > 45000) return false;
  if (/Simple Chat Hub|Summary Panel|pages checked/i.test(text)) return false;
  return /[A-Za-z0-9\u4e00-\u9fff]/.test(text);
}

function grokCompactKey(value) {
  return normalize(value).toLowerCase()
    .replace(/\[[^\]]+\]\([^)]*\)/g, "$1")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function grokStripUserPromptPrefix(value, expected) {
  const text = cleanGrokText(value);
  const prompt = cleanGrokText(expected);
  const promptKey = grokCompactKey(prompt);
  if (!text || !promptKey) return text;
  if (grokCompactKey(text) === promptKey) return "";
  if (text.toLowerCase().startsWith(prompt.toLowerCase())) {
    const stripped = cleanGrokText(text.slice(prompt.length));
    if (stripped && grokCompactKey(stripped) !== promptKey) return stripped;
  }
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let index = 0;
  let consumed = "";
  while (index < Math.min(lines.length, 4)) {
    consumed = cleanGrokText([consumed, lines[index]].filter(Boolean).join("\n"));
    const consumedKey = grokCompactKey(consumed);
    if (consumedKey && (consumedKey === promptKey || promptKey.includes(consumedKey) || consumedKey.includes(promptKey))) {
      index += 1;
      if (consumedKey === promptKey || consumedKey.includes(promptKey)) break;
      continue;
    }
    break;
  }
  if (index > 0) {
    const stripped = cleanGrokText(lines.slice(index).join("\n"));
    if (stripped && grokCompactKey(stripped) !== promptKey) return stripped;
    if (!stripped) return "";
  }
  return text;
}

function grokLooksLeadingUserPrompt(line, expected = "") {
  const text = normalize(line);
  if (!text || text.length > 280) return false;
  const textKey = grokCompactKey(text);
  const promptKey = grokCompactKey(expected);
  if (promptKey && textKey && (textKey === promptKey || promptKey.includes(textKey) || textKey.includes(promptKey))) return true;
  if (/[?？]\s*$/.test(text)) return true;
  return /^(?:请|帮|为什么|为何|怎么|如何|能否|可以|what|why|how|please|tell|explain|summari[sz]e|can you|could you)\b/i.test(text);
}

function grokStripLeadingUserPromptLine(value, expected = "") {
  const text = cleanGrokText(value);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return text;
  const rest = cleanGrokText(lines.slice(1).join("\n"));
  if (!rest || rest.length < 12 || !grokLooksLeadingUserPrompt(lines[0], expected)) return text;
  return rest;
}

function grokPreviousTextBlock(root, marker, config) {
  const markerRect = (() => {
    try { return marker?.getBoundingClientRect?.() || null; } catch { return null; }
  })();
  const candidates = [];
  for (const node of safeQsa("article,section,div,[role]", root)) {
    if (!visible(node) || node === marker || node.contains?.(marker) || inChromeScope(node)) continue;
    if (elementOrder(node, marker) >= 0) continue;
    const text = grokTextOf(node, config);
    if (!grokLooksMessageText(text) || /(?:Thought|Worked) for|(?:思考|工作)了|Upgrade to SuperGrok|Ask anything/i.test(text)) continue;
    const rect = (() => {
      try { return node.getBoundingClientRect(); } catch { return null; }
    })();
    if (markerRect && rect && rect.bottom > markerRect.top + 80) continue;
    const tooBroad = safeQsa("article,section,div,[role]", node).some((child) => {
      if (child === node || !visible(child)) return false;
      const childText = grokTextOf(child, config);
      return grokLooksMessageText(childText) && childText.length >= Math.min(text.length * 0.65, text.length - 8);
    });
    if (tooBroad && text.length > 300) continue;
    candidates.push({ node, rect, text });
  }
  candidates.sort((a, b) => {
    if (a.rect && b.rect && Math.abs(a.rect.bottom - b.rect.bottom) > 4) return b.rect.bottom - a.rect.bottom;
    return elementArea(a.node) - elementArea(b.node) || elementOrder(a.node, b.node);
  });
  return candidates[0] || null;
}

function grokAssistantNodeForMarker(root, marker, config) {
  let best = marker;
  for (let node = marker; node && node !== root && node !== document.body; node = node.parentElement) {
    if (inChromeScope(node)) continue;
    const raw = rawText(node);
    const text = grokTextOf(node, config);
    if (text.length > 40 && grokHasProgressMarker(raw) && !/Ask anything|Upgrade to SuperGrok|Home page|Notifications/i.test(raw)) {
      best = node;
      if (text.length > 120) break;
    }
  }
  return best;
}

function grokFindProgressMarker(element) {
  const candidates = [element, ...safeQsa("button,[role='button'],span,div", element)]
    .filter((node) => node && visible(node) && !inChromeScope(node) && grokThoughtLabel(rawText(node)));
  candidates.sort((a, b) => elementArea(a) - elementArea(b) || elementOrder(a, b));
  return candidates[0] || null;
}

function grokSafeScrollBlock(node, root, config = {}) {
  if (!node || !visible(node) || node === root || inChromeScope(node)) return false;
  if (safeClosest(node, `#${MESSAGE_NAVIGATOR_ROOT_ID}`)) return false;
  if (safeMatches(node, "html,body,main,[role='main'],nav,aside,header,footer,form,input,textarea,select,svg,img,canvas,video")) return false;
  if (containsComposerChrome(node)) return false;
  return Boolean(usefulTurnText(cloneText(node, config.textCleanupSelectors), 90000)
    || safeQsa("pre,code,blockquote,ul,ol,table", node).find(visible));
}

function grokAssistantScrollTarget(root, marker, assistantNode, config = {}, previousUserNode = null) {
  const markerNode = marker || grokFindProgressMarker(assistantNode);
  const rootRect = effectRect(root);
  const answerRect = effectRect(assistantNode);
  let best = null;
  for (let node = assistantNode; node && node !== document.documentElement; node = node.parentElement) {
    if (safeMatches(node, "main,[role='main'],body")) break;
    if (previousUserNode && node.contains?.(previousUserNode)) break;
    if (!grokSafeScrollBlock(node, root, config)) {
      if (best) break;
      continue;
    }
    const rect = effectRect(node);
    if (!rect) continue;
    const hasAnswer = !assistantNode || node === assistantNode || node.contains?.(assistantNode);
    if (!hasAnswer) continue;
    if (markerNode && !node.contains?.(markerNode)) {
      const markerRect = effectRect(markerNode);
      if (!markerRect || rect.top > markerRect.top + 24) continue;
    }
    if (rootRect && rect.height > Math.max(rootRect.height * 2.4, (answerRect?.height || 0) + 640)) continue;
    best = node;
  }
  return best || markerNode || assistantNode;
}

function grokSimilarText(value, expected) {
  const key = grokCompactKey(value);
  const expectedKey = grokCompactKey(expected);
  if (!key || !expectedKey) return false;
  return key === expectedKey || key.includes(expectedKey) || expectedKey.includes(key);
}

function grokPromoteUserBubble(seed, expectedText, config = {}, rootRect = null) {
  let best = seed;
  for (let node = seed?.parentElement; node && node !== document.documentElement; node = node.parentElement) {
    if (safeMatches(node, "main,[role='main'],body") || inChromeScope(node) || containsComposerChrome(node)) break;
    const text = grokTextOf(node, config);
    if (!grokSimilarText(text, expectedText) || grokHasProgressMarker(text)) break;
    const rect = effectRect(node);
    const bestRect = effectRect(best);
    if (!rect || !bestRect) break;
    if (rootRect && rect.width > rootRect.width * 0.88 && bestRect.width < rootRect.width * 0.82) break;
    if (rect.width - bestRect.width > Math.max(96, bestRect.width * 0.42)) break;
    if (rect.height - bestRect.height > Math.max(80, bestRect.height * 1.4)) break;
    if (elementArea(node) > elementArea(best) * 2.4) break;
    best = node;
  }
  return best;
}

function grokUserBubbleTarget(element, config = {}) {
  const expected = grokTextOf(element, config);
  if (!expected) return null;
  const root = pageRoot("main,[role='main']");
  const rootRect = effectRect(root);
  const selector = "article,section,div,p,span,[role='article'],[class*='message' i],[class*='Message'],[class*='bubble' i],[class*='query' i]";
  const rawCandidates = [];
  const seenCandidates = new Set();
  for (const node of [element, ...safeQsa(selector, element)]) {
    if (!node || seenCandidates.has(node)) continue;
    seenCandidates.add(node);
    rawCandidates.push(node);
  }
  const candidates = rawCandidates
    .filter((node) => visible(node) && !inChromeScope(node) && !containsComposerChrome(node))
    .map((node) => {
      const text = grokTextOf(node, config);
      if (!grokSimilarText(text, expected) || grokHasProgressMarker(text)) return null;
      const promoted = grokPromoteUserBubble(node, expected, config, rootRect);
      const rect = effectRect(promoted);
      if (!rect) return null;
      return {
        element: promoted,
        rect,
        text,
        area: elementArea(promoted),
        widthPenalty: rootRect && rect.width > rootRect.width * 0.86 ? 1 : 0,
        rightGap: rootRect ? Math.abs(rootRect.right - rect.right) : 0,
        lengthDelta: Math.abs(grokCompactKey(text).length - grokCompactKey(expected).length)
      };
    })
    .filter(Boolean);
  const seen = new Set();
  const bubbles = [];
  for (const item of candidates) {
    if (seen.has(item.element)) continue;
    seen.add(item.element);
    bubbles.push(item);
  }
  bubbles.sort((a, b) => {
    return a.widthPenalty - b.widthPenalty
      || a.lengthDelta - b.lengthDelta
      || a.rightGap - b.rightGap
      || a.area - b.area
      || elementOrder(a.element, b.element);
  });
  return bubbles[0]?.element || null;
}

function grokUserScrollTarget(element, config = {}) {
  const bubble = grokUserBubbleTarget(element, config);
  if (bubble) return bubble;
  const root = messageRootForEffect(element, element, config, { allowBroad: true, role: "user" });
  if (root && !safeMatches(root, "main,[role='main'],body")) return root;
  return effectMatches(element, USER_EFFECT_BODY_SELECTOR, config, { role: "user", prefer: "largest" }) || element;
}

function grokAssistantEffectTarget(element, config = {}) {
  return effectMatches(element, ".markdown,[class*='message' i],[class*='response' i],article,[role='article']", config, { prefer: "largest", role: "assistant" })
    || messageRootForEffect(element, element, config, { allowBroad: true, role: "assistant" })
    || element;
}

function grokRole(element) {
  const meta = metaText(element);
  if (/user|human|prompt|query|question/.test(meta)) return "user";
  if (/assistant|response|answer|bot|grok/.test(meta)) return "assistant";
  return genericRole(element);
}

function grokScrollTarget(element, config = {}, role = "") {
  if ((role || grokRole(element)) === "user") return grokUserScrollTarget(element, config);
  const root = pageRoot("main,[role='main']");
  return grokAssistantScrollTarget(root, grokFindProgressMarker(element), element, config);
}

function grokDomItems(config) {
  const root = pageRoot("main,[role='main']");
  const markerSelectors = ["button,[role='button']", "button,div,span,[role='button']", "article,section,div,[role]"];
  let markers = [];
  for (const selector of markerSelectors) {
    const seen = new Set();
    markers = safeQsa(selector, root)
      .filter((node) => visible(node) && !inChromeScope(node) && grokThoughtLabel(rawText(node)))
      .sort(elementOrder)
      .filter((node) => {
        const rect = (() => {
          try { return node.getBoundingClientRect(); } catch { return null; }
        })();
        const key = `${grokThoughtLabel(rawText(node)).toLowerCase()}|${Math.round((rect?.top || 0) / 8)}`;
        if (!key.trim() || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (markers.length) break;
  }
  const items = [];
  const assistantSeen = new Set();
  for (const marker of markers.slice(0, 10)) {
    const assistantNode = grokAssistantNodeForMarker(root, marker, config);
    const user = grokPreviousTextBlock(root, assistantNode, config) || grokPreviousTextBlock(root, marker, config);
    const assistantText = grokStripLeadingUserPromptLine(grokStripUserPromptPrefix(grokTextOf(assistantNode, config), user?.text || ""), user?.text || "");
    const assistantKey = assistantText.toLowerCase().replace(/\s+/g, " ").slice(0, 500);
    if (!assistantText || assistantSeen.has(assistantKey)) continue;
    assistantSeen.add(assistantKey);
    if (user?.node) {
      const userTarget = grokUserScrollTarget(user.node, config);
      items.push({
        element: user.node,
        target: userTarget,
        effectTarget: userTarget,
        role: "user",
        text: compactText(user.text, config.summaryMaxChars)
      });
    }
    const assistantTarget = grokAssistantScrollTarget(root, marker, assistantNode, config, user?.node || null);
    items.push({
      element: assistantNode,
      target: assistantTarget,
      effectTarget: grokAssistantEffectTarget(assistantNode, config),
      role: "assistant",
      text: compactText(assistantText, config.summaryMaxChars)
    });
  }
  return dedupeItems(items);
}

export function createGrokAdapter() {
  const adapter = {
    role(element) {
      return grokRole(element);
    },
    target(element, config = {}) {
      return grokScrollTarget(element, config, grokRole(element)) || element;
    },
    effectTarget(element, config, context = {}) {
      const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
      if (context.role === "user") {
        return grokUserScrollTarget(root || element, config)
          || effectMatches(root || element, USER_EFFECT_BODY_SELECTOR, config)
          || root
          || context.target
          || element;
      }
      return grokAssistantEffectTarget(element, config)
        || root
        || context.target
        || element;
    },
    text(element, config, context = {}) {
      return grokTextOf(context.textSource || context.target || element, config)
        || grokTextOf(element, config);
    },
    collect(config) {
      const fromDom = grokDomItems(config);
      if (conversationLooksUseful(fromDom)) return fromDom;
      const base = adapterBaseItems(config, this);
      return conversationLooksUseful(base) ? base : fromDom;
    }
  };
  return Object.freeze(adapter);
}
