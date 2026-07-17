import {
  cleanLine,
  compactText,
  elementOrder,
  inChromeScope,
  metaText,
  normalize,
  pageRoot,
  rawText,
  referenceOnlyText,
  safeQsa,
  targetForText,
  usefulTurnText,
  visible
} from "../dom-kernel.js";
import {
  adapterBaseItems,
  candidateTextBlocks,
  collectFromCopyButtons,
  conversationLooksUseful,
  dedupeItems,
  genericRole
} from "../collection-kernel.js";
import {
  closestEffectMatch,
  effectMatches,
  messageRootForEffect,
  usableEffectTarget
} from "../effect-target.js";

const kagiModeLinePattern = /^(?:Quick|Expert|Research|Fast|Deep|Creative|Balanced|Precise|Custom|快速|专家|研究)$/i;
const kagiMetaLinePattern = /^(?:\d{1,2}:\d{2}\s*(?:AM|PM)?|Today|Yesterday)$/i;
const kagiChromeLinePattern = /^(?:Kagi Assistant|Kagi products|Settings|Search threads|Thread navigation|Folders|Threads|Add folder|Start organizing your threads\.?|Ask anything\.{0,3}|Message|View message statistics|Copy message|Copied|Send)$/i;
const kagiLikelyPromptPattern = /[?？]$|^(?:任务|需求|要求|目标|提示|为我|帮我|介绍|搜索|请|帮|写|总结|解释|翻译|生成|分析|列出|查找)(?:[:：\s]|$)|^(?:Task|Request|Requirement|Requirements|Goal|Prompt|Draft|Compose|Create|Tell|What|How|Why|Please|Search|Summarize|Explain|Write)\b/i;
function kagiLines(root) {
  const lines = [];
  for (const rawLine of rawText(root).split(/\n+/)) {
    const line = cleanLine(rawLine);
    if (!line || line.length < 2) continue;
    if (kagiChromeLinePattern.test(line) || kagiMetaLinePattern.test(line)) continue;
    if (referenceOnlyText(line)) continue;
    if (!lines.includes(line)) lines.push(line);
  }
  return lines;
}

function kagiPromptFromLines(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^(?:搜索|Search)\s*[:：]/i.test(line)) continue;
    const parts = [line];
    let endIndex = index;
    for (let next = index + 1; next < Math.min(lines.length, index + 5); next += 1) {
      const nextLine = lines[next];
      if (kagiModeLinePattern.test(nextLine) || kagiChromeLinePattern.test(nextLine)) break;
      if (/^(?:Searched with Kagi|Using full content from|Gathered details on)\b/i.test(nextLine)) break;
      parts.push(nextLine);
      endIndex = next;
      if (/[?？]$/.test(nextLine)) break;
    }
    const text = usefulTurnText(parts.join("\n"));
    if (text) return { text, index, endIndex, parts };
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!kagiLikelyPromptPattern.test(line)) continue;
    const previous = lines[index - 1];
    const parts = previous && !kagiModeLinePattern.test(previous) && !kagiChromeLinePattern.test(previous) && previous.length < 80
      ? [previous, line]
      : [line];
    const text = usefulTurnText(parts.join("\n"));
    if (text) return { text, index: Math.max(0, index - (parts.length - 1)), endIndex: index, parts };
  }
  return null;
}

function kagiDomFallbackItems(config) {
  const root = pageRoot("main,[role='main']");
  const lines = kagiLines(root);
  const prompt = kagiPromptFromLines(lines);
  if (!prompt) return [];
  let answerStart = prompt.endIndex + 1;
  while (answerStart < lines.length && (kagiModeLinePattern.test(lines[answerStart]) || kagiChromeLinePattern.test(lines[answerStart]) || kagiMetaLinePattern.test(lines[answerStart]))) {
    answerStart += 1;
  }
  const assistantLines = [];
  for (let index = answerStart; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^References\b/i.test(line) && assistantLines.length) break;
    if (kagiChromeLinePattern.test(line) || kagiMetaLinePattern.test(line)) continue;
    if (kagiModeLinePattern.test(line) && !assistantLines.length) continue;
    if (line === prompt.text || prompt.parts.includes(line)) continue;
    assistantLines.push(line);
    if (assistantLines.length >= 120) break;
  }
  const assistant = usefulTurnText(assistantLines.join("\n"), 60000);
  if (assistant.length < 20) return [];
  const userTarget = targetForText(root, config, [prompt.text, ...prompt.parts], {
    selector: "article,section,div,p,[class*='message' i],[class*='bubble' i],[class*='chat' i]"
  });
  const assistantTarget = targetForText(root, config, assistantLines.slice(0, 3), {
    selector: "article,section,div,p,[role='article'],[class*='message' i],[class*='response' i],[class*='markdown' i]"
  });
  return dedupeItems([
    {
      element: userTarget,
      target: userTarget,
      role: "user",
      text: compactText(prompt.text, config.summaryMaxChars)
    },
    {
      element: assistantTarget,
      target: assistantTarget,
      role: "assistant",
      text: compactText(assistant, config.summaryMaxChars)
    }
  ]);
}

export function createKagiAdapter() {
  const adapter = {
    role(element) {
      const meta = metaText(element);
      if (/\buser\b|human|query/.test(meta)) return "user";
      if (/\bassistant\b|bot|answer/.test(meta)) return "assistant";
      return genericRole(element)
        || (safeQsa(".assistant, [data-role='assistant']", element).length ? "assistant" : "");
    },
    target(element) {
      return safeQsa(
        ".chat_bubble_content, .markdown, [class*='message' i], [role='article']",
        element
      ).find(visible) || element;
    },
    effectTarget(element, config, context = {}) {
      const effectRole = context.effectRole || (context.role === "user" ? "user" : "assistant");
      const root = closestEffectMatch(
        context.target || element,
        ".chat_bubble[role='article'],.chat_bubble,[role='article']",
        config,
        { allowBroad: true, role: effectRole }
      ) || messageRootForEffect(
        element,
        context.target,
        config,
        { allowBroad: true, role: effectRole }
      );
      if (effectRole === "user") {
        return (usableEffectTarget(root, config, { allowBroad: true, role: effectRole }) ? root : null)
          || effectMatches(
            root || element,
            ".chat_bubble_content,.markdown",
            config,
            { role: effectRole, prefer: "largest" }
          )
          || context.target
          || element;
      }
      return (usableEffectTarget(root, config, { allowBroad: true, role: effectRole }) ? root : null)
        || effectMatches(
          root || element,
          ".chat_bubble_content,.markdown",
          config,
          { prefer: "largest", role: effectRole }
        )
        || context.target
        || element;
    },
    collect(config) {
      const fromDom = kagiDomFallbackItems(config);
      if (conversationLooksUseful(fromDom)) return fromDom;
      const fromCopies = collectFromCopyButtons(config, {
        rootSelector: "main,[role='main']",
        maxDepth: 12
      });
      if (conversationLooksUseful(fromCopies)) return fromCopies;
      const base = adapterBaseItems(config, this);
      if (conversationLooksUseful(base)) return base;
      const root = pageRoot("main,[role='main']");
      const blocks = candidateTextBlocks(root, config, [
        ".chat_bubble",
        "[role='article']",
        "[data-message-author-role]",
        "[data-testid*='message']",
        "[class*='message' i]",
        "[class*='response' i]",
        ".markdown"
      ].join(","), { maxLength: 60000 });
      return dedupeItems(blocks.slice(0, 24).map((item, index) => ({
        ...item,
        role: genericRole(item.element, config) || (index % 2 === 0 ? "user" : "assistant"),
        text: compactText(item.text, config.summaryMaxChars)
      })));
    }
  };
  return Object.freeze(adapter);
}
