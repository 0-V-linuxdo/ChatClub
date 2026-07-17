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
  safeQsa,
  targetForText,
  usefulTurnText,
  visible
} from "../dom-kernel.js";
import {
  adapterBaseItems,
  candidateTextBlocks,
  conversationLooksUseful,
  dedupeItems,
  genericRole
} from "../collection-kernel.js";
import {
  USER_EFFECT_BODY_SELECTOR,
  containsComposerChrome,
  effectMatches,
  messageRootForEffect
} from "../effect-target.js";

const notionChromeLinePattern = /^(?:Notion AI|\/|history|New agent|Share chat|Start new chat|Pin chat|Delete, rename, and more…?|Give context|Settings|Gemini\s+\d|Do anything with AI\.{0,3}|Ask anything|Response copied to clipboard|Copied to clipboard|Loading\.?|Start voice recording|Submit AI message|Thought(?:\s+for\s+.*)?|思考.*)$/i;
const notionMetaLinePattern = /^(?:\d+\s*steps?|\d{1,2}:\d{2}\s*(?:AM|PM)?|Today|Yesterday|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?)$/i;
function notionLikelyPrompt(line) {
  return /[?？]$|^(?:任务|需求|要求|目标|提示|为我|帮我|介绍|搜索|请|帮|写|总结|解释|翻译|生成|分析|列出|查找)(?:[:：\s]|$)|^(?:Task|Request|Requirement|Requirements|Goal|Prompt|Draft|Compose|Create|Tell|What|How|Why|Please|Search|Summarize|Explain|Write)\b/i.test(line);
}

function trimNotionPromptMeta(line) {
  return cleanLine(line)
    .replace(/\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?$/i, "")
    .replace(/\s+(?:Today|Yesterday)$/i, "")
    .trim();
}

function notionLines(root) {
  const lines = [];
  for (const rawLine of rawText(root).split(/\n+/)) {
    const line = cleanLine(rawLine);
    if (!line || line.length < 2) continue;
    if (notionChromeLinePattern.test(line)) continue;
    if (!lines.includes(line)) lines.push(line);
  }
  return lines;
}

function notionChromePollutedText(value) {
  const text = normalize(value);
  if (!text) return false;
  const lines = text.split(/\n+/).map(cleanLine).filter(Boolean);
  if (lines.some((line) => notionChromeLinePattern.test(line))) return true;
  return /\b(?:New agent|Share chat|Start new chat|Pin chat|Delete, rename, and more)\b/i.test(text);
}

function notionPromptFromIndex(lines, index) {
  const seed = trimNotionPromptMeta(lines[index]);
  if (!seed) return null;
  const parts = [seed];
  let startIndex = index;
  for (let previous = index - 1; previous >= Math.max(0, index - 3); previous -= 1) {
    const line = trimNotionPromptMeta(lines[previous]);
    if (!line || notionMetaLinePattern.test(line) || notionChromeLinePattern.test(line)) break;
    if (/^(?:搜索|Search)\s*[:：]/i.test(line)) {
      parts.unshift(line);
      startIndex = previous;
      break;
    }
    if (line.length <= 48 && !/[。.!！?？]$/.test(line) && /[?？]$/.test(seed)) {
      parts.unshift(line);
      startIndex = previous;
      continue;
    }
    break;
  }
  const text = usefulTurnText(parts.join("\n"));
  return text ? { text, parts, startIndex, endIndex: index } : null;
}

function notionPairFromLines(root) {
  const lines = notionLines(root);
  const stepIndex = lines.findIndex((line) => /^\d+\s*steps?$/i.test(line));
  let promptIndex = -1;
  if (stepIndex > 0) {
    for (let index = stepIndex - 1; index >= 0; index -= 1) {
      if (!notionMetaLinePattern.test(lines[index]) && !notionChromeLinePattern.test(lines[index])) {
        promptIndex = index;
        break;
      }
    }
  }
  if (promptIndex < 0) {
    promptIndex = lines.findIndex((line, index) => index < lines.length - 1 && notionLikelyPrompt(line));
  }
  if (promptIndex < 0 || promptIndex >= lines.length - 1) return null;
  const prompt = notionPromptFromIndex(lines, promptIndex);
  if (!prompt) return null;
  let answerStart = stepIndex >= 0 ? stepIndex + 1 : promptIndex + 1;
  while (answerStart < lines.length && (notionChromeLinePattern.test(lines[answerStart]) || notionMetaLinePattern.test(lines[answerStart]))) answerStart += 1;
  const assistant = usefulTurnText(lines.slice(answerStart)
    .filter((line) => line !== lines[promptIndex] && line !== prompt.text && !prompt.parts.includes(line) && !notionChromeLinePattern.test(line))
    .join("\n"));
  return prompt.text.length >= 2 && assistant.length >= 20 ? { user: prompt.text, userParts: prompt.parts, assistant } : null;
}

function notionThoughtFallbackItems(config, root) {
  const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
  const thought = safeQsa("button,[role='button']", root)
    .filter((button) => visible(button) && /^Thought(?:\s+for\s+.*)?$|^思考/i.test(cleanLine(rawText(button))))
    .sort(elementOrder)[0] || null;
  if (!thought) return [];
  const blocks = candidateTextBlocks(root, config, "article,section,div,p,[role='article'],[data-testid*='message'],[class*='message' i],[class*='response' i]", {
    reject: (element) => element.contains?.(thought) || containsComposerChrome(element),
    maxLength: 80000
  });
  const beforeThought = blocks.filter((item) => elementOrder(item.element, thought) < 0);
  const afterThought = blocks.filter((item) => elementOrder(thought, item.element) < 0);
  const userCandidates = beforeThought.filter((item) => {
    const text = trimNotionPromptMeta(item.text);
    if (notionChromePollutedText(text)) return false;
    return text.length >= 8 && (notionLikelyPrompt(text) || /(?:任务|需求|要求|Task|Request|Requirement)/i.test(text));
  }).sort((a, b) => {
    const area = elementArea(a.element) - elementArea(b.element);
    return area || a.text.length - b.text.length || elementOrder(b.element, a.element);
  });
  const user = userCandidates[0] || null;
  const assistant = afterThought.find((item) => {
    const text = usefulTurnText(cloneText(item.element, cleanupSelectors), 80000);
    return text.length >= 20 && !notionChromeLinePattern.test(cleanLine(text));
  });
  if (!user || !assistant) return [];
  return dedupeItems([
    {
      element: user.element,
      target: user.element,
      role: "user",
      text: compactText(trimNotionPromptMeta(user.text), config.summaryMaxChars)
    },
    {
      element: assistant.element,
      target: assistant.element,
      role: "assistant",
      text: compactText(assistant.text, config.summaryMaxChars)
    }
  ]);
}

function notionDomFallbackItems(config) {
  const root = pageRoot("#notion-app,main,[role='main']");
  const thoughtFallback = notionThoughtFallbackItems(config, root);
  if (conversationLooksUseful(thoughtFallback)) return thoughtFallback;
  const pair = notionPairFromLines(root);
  if (!pair) return [];
  const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
  const steps = safeQsa("button,[role='button']", root)
    .filter((button) => visible(button) && /^\d+\s*steps?$/i.test(cleanLine(rawText(button))))
    .sort(elementOrder);
  const stepButton = steps[0] || null;
  const candidates = candidateTextBlocks(root, config, "article,section,div,p,[role='article'],[data-testid*='message']", {
    reject: (element) => stepButton && element.contains?.(stepButton),
    maxLength: 60000
  });
  const beforeStep = stepButton
    ? candidates.filter((item) => elementOrder(item.element, stepButton) < 0)
    : candidates;
  const afterStep = stepButton
    ? candidates.filter((item) => elementOrder(stepButton, item.element) < 0)
    : candidates;
  const promptTarget = beforeStep.reverse().find((item) => {
    const text = trimNotionPromptMeta(item.text);
    return text && !notionChromePollutedText(text) && (text.includes(pair.user) || pair.user.includes(text) || notionLikelyPrompt(text));
  })?.element || targetForText(root, config, [pair.user, ...(pair.userParts || [])], {
    reject: (element) => (stepButton && element.contains?.(stepButton)) || notionChromePollutedText(cloneText(element, cleanupSelectors))
  });
  const assistantTarget = afterStep.find((item) => {
    const text = cleanLine(item.text);
    return text.length >= 20 && (pair.assistant.includes(text) || text.includes(pair.assistant.slice(0, 60)));
  })?.element || targetForText(root, config, pair.assistant.slice(0, 120), {
    reject: (element) => stepButton && element.contains?.(stepButton)
  });
  return dedupeItems([
    {
      element: promptTarget,
      target: promptTarget,
      role: "user",
      text: compactText(pair.user, config.summaryMaxChars)
    },
    {
      element: assistantTarget,
      target: assistantTarget,
      role: "assistant",
      text: compactText(pair.assistant, config.summaryMaxChars)
    }
  ]);
}

export function createNotionAdapter() {
  const adapter = {
    role(element) {
      const meta = metaText(element);
      if (/\buser\b|human|prompt|query/.test(meta)) return "user";
      if (/\bassistant\b|answer|response|notion-ai/.test(meta)) return "assistant";
      return genericRole(element);
    },
    target(element) {
      return safeQsa(".markdown, [class*='message' i], [role='article']", element).find(visible) || element;
    },
    effectTarget(element, config, context = {}) {
      const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
      if (context.role === "user") {
        return effectMatches(root || element, USER_EFFECT_BODY_SELECTOR, config)
          || context.target
          || root
          || element;
      }
      return effectMatches(
        root || element,
        ".markdown,[class*='message' i],[role='article']",
        config,
        { prefer: "largest" }
      ) || root || context.target || element;
    },
    collect(config) {
      const fallback = notionDomFallbackItems(config);
      if (conversationLooksUseful(fallback)) return fallback;
      const base = adapterBaseItems(config, this);
      return conversationLooksUseful(base) ? base : fallback;
    }
  };
  return Object.freeze(adapter);
}
