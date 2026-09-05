// Built-in Summary userscript: Notion (notion)
// Source: Mod/assets/chunk-7dbf4e81.js :: SUMMARY_SITE_CONFIG_DEFAULTS
// Config version: 73; global config version: 92
// Hosts: app.notion.com, notion.so, www.notion.so, *.notion.so
// Path prefixes: /chat, /ai
// Run mode: default; timeout: default
// This is a Simple Chat Hub Summary bridge body, not a standalone browser userscript.

const normalize = value => api.normalize(String(value || ""));
const qsa = (selector, root = document) => {
  try { return api.qsa(selector, root, { all: true }); } catch (error) { return []; }
};
const closest = (element, selector) => {
  try { return api.closest(element, selector); } catch (error) { return null; }
};
const layoutVisible = element => {
  if (!element) return false;
  try {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 4 && rect.height > 4 && style.display !== "none" && style.visibility !== "hidden";
  } catch (error) {
    return false;
  }
};
const meta = element => normalize([
  element && element.tagName,
  element && element.getAttribute && element.getAttribute("aria-label"),
  element && element.getAttribute && element.getAttribute("title"),
  element && element.getAttribute && element.getAttribute("data-testid"),
  element && element.getAttribute && element.getAttribute("data-test-id"),
  element && typeof element.className === "string" ? element.className : "",
  element && element.textContent
].filter(Boolean).join(" "));
const order = (a, b) => {
  try {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
  } catch (error) {
    return 0;
  }
};
const roots = qsa("#notion-app,main,[role=main]", document).filter(layoutVisible);
const root = roots.find(element => !closest(element, "nav,aside,header,footer")) || roots[0] || document;
const roleOfButton = button => {
  const label = meta(button);
  if (/\bcopy\s+(?:response|answer)\b|复制(?:回复|回答|响应)/i.test(label)) return "assistant";
  if (/\bcopy\s+(?:text|message|prompt)\b|复制(?:文本|消息|提示词|问题)/i.test(label)) return "user";
  return "";
};
const isCopyTurnButton = button => layoutVisible(button) && roleOfButton(button) && !closest(button, "nav,aside,header,footer,form,input,textarea,select,[contenteditable=true],pre,code,kbd,samp,[data-language]");
const useful = value => {
  const text = normalize(value).replace(/^(?:Copied to clipboard|Response copied to clipboard|Right click and copy the link above)\.?$/i, "").trim();
  if (!text || /^(?:copy|copied|copy text|copy response|复制|已复制)$/i.test(text)) return "";
  if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return "";
  return text;
};
const structured = messages => Array.isArray(messages)
  && messages.some(item => item.role === "user")
  && messages.some(item => item.role === "assistant");
const cleanLine = value => normalize(value)
  .replace(/^[-•]\s*/, "")
  .replace(/\s+/g, " ")
  .trim();
const isChromeLine = line => /^(?:Notion AI|\/|history|Delete, rename, and more…?|Give context|Settings|Gemini\s+\d|Do anything with AI\.{0,3}|Ask anything|Response copied to clipboard|Copied to clipboard|Loading\.?)$/i.test(line);
const isComposerLine = line => /^(?:Do anything with AI\.{0,3}|Ask anything|Give context|Settings|Gemini\s+\d|Start voice recording|Submit AI message|Response copied to clipboard|Copied to clipboard)$/i.test(line);
const isMetaLine = line => /^(?:\d+\s*steps?|Today|Yesterday|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?)$/i.test(line);
const isResearchLogLine = line => /^(?:\d+\s*steps?|thought|noodling|contemplating|found\s+\d+\s+results?|searched the web|searching the web|loaded (?:skills tools|data-analysis skill|research skill)|(?:loaded|loading) web page:)/i.test(line);
const trimPromptMeta = line => cleanLine(line)
  .replace(/\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?$/i, "")
  .replace(/\s+(?:Today|Yesterday)$/i, "")
  .trim();
const likelyPrompt = line => /[?？]$|^(?:介绍|搜索|深入搜索|请|帮|写|总结|解释|翻译|生成|分析|列出|查找)/i.test(line) || /^(?:Tell|What|How|Why|Please|Search|Summarize|Explain|Write)\b/i.test(line);
const isPromptBoundaryLine = line => isChromeLine(line) || isMetaLine(line) || isResearchLogLine(line) || isComposerLine(line) || /^\d+\s*steps?$/i.test(line);
const isPromptFieldLine = line => /^(?:要求|需要|目标|补充|约束)(?:[:：\s]|$)/i.test(line) || /^(?:Task|Request|Requirement|Goal|Constraint)\b/i.test(line);
const isAssistantBodyLine = line => /^#{1,6}\s/.test(line) || (line.length > 280 && !likelyPrompt(line));
const joinPromptLines = (lines, start, end) => {
  const parts = [];
  for (let index = start; index < end; index += 1) {
    const part = trimPromptMeta(lines[index]);
    if (part) parts.push(part);
  }
  return normalize(parts.join("\n"));
};
const collectPromptRange = (lines, likelyIndex, stepIndex) => {
  if (stepIndex > 0) {
    let last = stepIndex - 1;
    while (last >= 0 && isPromptBoundaryLine(lines[last])) last -= 1;
    if (last < 0) return { user: "", start: -1, end: 0 };
    let first = last;
    while (first > 0) {
      const previous = lines[first - 1];
      if (isPromptBoundaryLine(previous) || isAssistantBodyLine(previous)) break;
      if (last - (first - 1) >= 8) break;
      first -= 1;
    }
    return { user: joinPromptLines(lines, first, last + 1), start: first, end: last + 1 };
  }
  if (likelyIndex < 0 || likelyIndex >= lines.length - 1) return { user: "", start: -1, end: 0 };
  let last = likelyIndex;
  for (let index = likelyIndex + 1; index < Math.min(lines.length, likelyIndex + 8); index += 1) {
    if (isPromptBoundaryLine(lines[index]) || isAssistantBodyLine(lines[index])) break;
    const previous = lines[index - 1];
    const continuation = /[:：]$/.test(previous)
      || isPromptFieldLine(lines[index])
      || likelyPrompt(lines[index]);
    if (!continuation && last === likelyIndex && !/[:：]$/.test(lines[likelyIndex])) break;
    if (!continuation && last > likelyIndex) break;
    last = index;
    if (isPromptFieldLine(lines[index]) || /[?？]$/.test(lines[index])) break;
  }
  return { user: joinPromptLines(lines, likelyIndex, last + 1), start: likelyIndex, end: last + 1 };
};
const notionDomTextFallback = () => {
  const raw = normalize(api.text(root) || root.innerText || root.textContent || "");
  if (!raw) return [];
  const lines = [];
  for (const rawLine of raw.split(/\n+/)) {
    const line = cleanLine(rawLine);
    if (!line || line.length < 2) continue;
    if (isComposerLine(line) && lines.length) break;
    if (isChromeLine(line)) continue;
    if (!lines.includes(line)) lines.push(line);
  }
  const stepIndex = lines.findIndex(line => /^\d+\s*steps?$/i.test(line));
  const likelyIndex = lines.findIndex((line, index) => index < lines.length - 1 && likelyPrompt(line));
  const collected = collectPromptRange(lines, likelyIndex, stepIndex);
  if (collected.user.length < 2) return [];
  let answerStart = stepIndex >= 0 ? stepIndex + 1 : collected.end;
  while (answerStart < lines.length && isPromptBoundaryLine(lines[answerStart])) answerStart += 1;
  const promptParts = collected.user.split("\n");
  const assistant = normalize(lines.slice(answerStart)
    .filter(line => line !== collected.user && !promptParts.includes(line) && !isChromeLine(line) && !isResearchLogLine(line) && !isMetaLine(line))
    .join("\n"));
  if (assistant.length < 20) return [];
  return [
    { role: "user", content: collected.user },
    { role: "assistant", content: assistant }
  ];
};
if (typeof api.conversationIsGenerating === "function" && api.conversationIsGenerating()) return [];
const generating = typeof api.conversationIsGenerating === "function" && api.conversationIsGenerating();
const idleFullText = api.config && api.config.idleFullText === true;
const turns = [];
const seen = new Set();
const buttons = qsa("button,[role=button]", root).filter(isCopyTurnButton).sort(order);
const copyLimit = idleFullText ? 2 : 8;
const selectedButtons = buttons.length > copyLimit ? buttons.slice(-copyLimit) : buttons;
for (const button of selectedButtons) {
  const role = roleOfButton(button);
  if (role !== "user" && role !== "assistant") continue;
  if (generating && role === "assistant") continue;
  api.reveal(button);
  await api.sleep(120);
  const text = useful(await api.copy(button, {
    resetClipboardBeforeCopy: true,
    acceptUnchangedClipboard: false,
    copyTimeoutMs: 6000,
    copyPollMs: 40,
    copyCaptureGraceMs: 300
  }));
  if (text) {
    const key = role + "\n" + text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      turns.push({ role, content: text });
    }
  }
  await api.sleep(80);
}
const merged = api.merge(turns);
if (structured(merged)) return merged;
if (generating) return [];
if (typeof api.extractNativeCopyConversation === "function") {
  const copied = await api.extractNativeCopyConversation(root);
  if (structured(copied)) return copied;
}
if (typeof api.conversationIsGenerating === "function" && api.conversationIsGenerating()) return [];
return notionDomTextFallback();
