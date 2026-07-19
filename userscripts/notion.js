// Built-in Summary userscript: Notion (notion)
// Source: Mod/assets/chunk-7dbf4e81.js :: SUMMARY_SITE_CONFIG_DEFAULTS
// Config version: 64; global config version: 62
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
const isCopyTurnButton = button => layoutVisible(button) && roleOfButton(button) && !closest(button, "nav,aside,header,footer,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]");
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
const trimPromptMeta = line => cleanLine(line)
  .replace(/\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?$/i, "")
  .replace(/\s+(?:Today|Yesterday)$/i, "")
  .trim();
const likelyPrompt = line => /[?？]$|^(?:介绍|搜索|请|帮|写|总结|解释|翻译|生成|分析|列出|查找|Tell|What|How|Why|Please|Search|Summarize|Explain|Write)\b/i.test(line);
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
  let promptIndex = -1;
  if (stepIndex > 0) {
    for (let index = stepIndex - 1; index >= 0; index -= 1) {
      if (!isMetaLine(lines[index]) && !isChromeLine(lines[index])) {
        promptIndex = index;
        break;
      }
    }
  }
  if (promptIndex < 0) {
    promptIndex = lines.findIndex((line, index) => index < lines.length - 1 && likelyPrompt(line));
  }
  if (promptIndex < 0 || promptIndex >= lines.length - 1) return [];
  const user = trimPromptMeta(lines[promptIndex]);
  let answerStart = stepIndex >= 0 ? stepIndex + 1 : promptIndex + 1;
  while (answerStart < lines.length && isChromeLine(lines[answerStart])) answerStart += 1;
  const assistant = normalize(lines.slice(answerStart)
    .filter(line => line !== lines[promptIndex] && line !== user && !isChromeLine(line))
    .join("\n"));
  if (user.length < 2 || assistant.length < 20) return [];
  return [
    { role: "user", content: user },
    { role: "assistant", content: assistant }
  ];
};
const turns = [];
const seen = new Set();
const buttons = qsa("button,[role=button]", root).filter(isCopyTurnButton).sort(order).slice(0, 48);
for (const button of buttons) {
  const role = roleOfButton(button);
  if (role !== "user" && role !== "assistant") continue;
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
if (typeof api.extractNativeCopyConversation === "function") {
  const copied = await api.extractNativeCopyConversation(root);
  if (structured(copied)) return copied;
}
return notionDomTextFallback();
