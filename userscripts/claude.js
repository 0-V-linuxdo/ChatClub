// Built-in Summary userscript: Claude (claude)
// Source: Mod/assets/chunk-7dbf4e81.js :: SUMMARY_SITE_CONFIG_DEFAULTS
// Config version: 38; global config version: 68
// Hosts: claude.ai, *.claude.ai
// Path prefixes: /chat, /new
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
const roots = qsa("main,[role=main]", document).filter(layoutVisible);
const root = roots.find(element => !closest(element, "nav,aside,header,footer")) || roots[0] || document;
const roleFromHeading = text => {
  if (/^\s*(?:You said|你说|您说)\s*[:：]/i.test(text)) return "user";
  if (/^\s*(?:Claude responded|Claude replied|Claude said|Claude\s*(?:回复|回答))\s*[:：]/i.test(text)) return "assistant";
  return "";
};
const structured = messages => Array.isArray(messages)
  && messages.some(item => item && item.role === "user")
  && messages.some(item => item && item.role === "assistant");
const cleanLine = value => normalize(value)
  .replace(/^[-•]\s*/, "")
  .replace(/(?:\s*[\u25a0-\u25ff]){2,}\s*$/g, "")
  .replace(/\s+/g, " ")
  .trim();
const compact = value => normalize(value).toLowerCase().replace(/\s+/g, " ").trim();
const useful = value => {
  const text = normalize(value)
    .replace(/^Copied to clipboard\.?$/i, "")
    .replace(/(?:\s*[\u25a0-\u25ff]){2,}\s*$/g, "")
    .trim();
  if (!text || /^(?:copy|copied|复制|已复制)$/i.test(text)) return "";
  if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return "";
  return text;
};
const hasUsefulLength = (role, text) => role === "user" ? text.length >= 2 : text.length >= 8;
const mergeIfStructured = messages => {
  const merged = api.merge(messages || []);
  return structured(merged) ? merged : [];
};

const headings = qsa("h1,h2,h3,h4,[role=heading]", root)
  .filter(layoutVisible)
  .map(element => ({ element, role: roleFromHeading(normalize(element.innerText || element.textContent || "")) }))
  .filter(item => item.role)
  .sort((a, b) => order(a.element, b.element));

const copyPattern = /^\s*(?:copy|copied|复制|已复制)\s*$/i;
const copyWordPattern = /(?:^|\b)(?:copy|copied)(?:\b|$)|复制|已复制/i;
const excludePattern = /copy\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|positive|negative|settings|export|docs|menu|more|retry|edit|regenerate|sidebar)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|重试|编辑/i;
const isInternalTool = button => {
  if (closest(button, "nav,aside,header,footer,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]")) return true;
  return false;
};
const isCopyButton = button => {
  const label = meta(button);
  return layoutVisible(button) && (copyPattern.test(label) || copyWordPattern.test(label)) && !excludePattern.test(label) && !isInternalTool(button);
};
const roleForButton = button => {
  let found = null;
  for (const heading of headings) {
    if (order(heading.element, button) <= 0) found = heading;
    else break;
  }
  return found && found.role || "";
};
const legacyHeadingCopy = async () => {
  if (!headings.length) return [];
  const turns = [];
  const seen = new Set();
  const buttons = qsa("button,[role=button]", root).filter(isCopyButton).sort(order).slice(0, 48);
  for (const button of buttons) {
    const role = roleForButton(button);
    if (role !== "user" && role !== "assistant") continue;
    api.reveal(button);
    await api.sleep(120);
    const text = useful(await api.copy(button, {
      resetClipboardBeforeCopy: true,
      acceptUnchangedClipboard: false,
      copyTimeoutMs: 2400,
      copyPollMs: 50,
      copyCaptureGraceMs: 220
    }));
    if (text) {
      const key = role + "\n" + compact(text);
      if (!seen.has(key)) {
        seen.add(key);
        turns.push({ role, text });
      }
    }
    await api.sleep(80);
  }
  return mergeIfStructured(turns);
};

const stripRolePrefix = (line, role) => {
  if (role === "user") return line.replace(/^\s*(?:You said|你说|您说)\s*[:：]\s*/i, "").trim();
  return line.replace(/^\s*(?:Claude responded|Claude replied|Claude said|Claude\s*(?:回复|回答))\s*[:：]\s*/i, "").trim();
};
const chromeLinePattern = /^(?:Message\s+\d+\s+of\s+\d+|Use the up and down arrow keys to move between messages\.?|Message actions|Claude finished the response|\d{1,2}:\d{2}\s*(?:AM|PM)?|Scroll to bottom|Share|Copy|Copied|Retry|Edit|Read aloud|Give positive feedback|Give negative feedback|Press and hold to record|Use voice mode|Write a message|Model:.*|Sonnet\s+\d+.*|Add files, connectors, and more|Settings|Free plan|Upgrade|Claude can make mistakes.*|搜索|Explain|翻译|\/skill|```code|油猴脚本|Prompt|助手|其他|复制|已复制|重试|编辑|分享|朗读|点赞|点踩)$/i;
const cleanDomText = (raw, role) => {
  const lines = [];
  const seen = new Set();
  for (const rawLine of String(raw || "").split(/\n+/)) {
    let line = cleanLine(rawLine);
    if (!line) continue;
    const markerRole = roleFromHeading(line);
    if (markerRole && markerRole !== role) {
      if (lines.length) break;
      continue;
    }
    if (markerRole === role) line = stripRolePrefix(line, role);
    line = line.replace(/\s*(?:Copy|Retry|Edit|Read aloud|Give positive feedback|Give negative feedback)\s*$/i, "").trim();
    if (!line || chromeLinePattern.test(line)) continue;
    const key = compact(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return normalize(lines.join("\n"));
};
const claudeArticleSelector = '[role="article"][aria-label^="Message "]';
const claudeActionCopySelector = 'button[data-testid="action-bar-copy"][aria-label="Copy"],button[data-testid="action-bar-copy"][title="Copy"]';
const cleanCopiedText = (raw, role) => {
  let text = useful(raw);
  if (!text) return "";
  text = stripRolePrefix(text, role)
    .replace(/[\ue000-\uf8ff]+/g, "")
    .trim();
  return useful(text);
};
const roleFromArticle = article => {
  const text = normalize(article && (article.innerText || article.textContent) || "");
  const explicit = roleFromHeading(text);
  if (explicit) return explicit;
  return "";
};
const claudeArticles = () => qsa(claudeArticleSelector, root)
  .filter(layoutVisible)
  .filter((article, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.contains(article)))
  .sort(order);
const claudeArticleCopyButtons = article => qsa(claudeActionCopySelector, article)
  .filter(layoutVisible)
  .sort(order);
const hasClaudeArticleCopyButtons = () => claudeArticles().some(article => claudeArticleCopyButtons(article).length > 0);
const articleCopyOptions = {
  copyButtonSelector: claudeActionCopySelector,
  copyButtonPattern: "action-bar-copy|copy|copied|clipboard|复制|已复制",
  copyButtonIconFallback: false,
  copyButtonExcludePattern: "copy\\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|positive|negative|settings|export|docs|menu|more|retry|edit|regenerate|sidebar|read aloud|model)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|重试|编辑|朗读|模型",
  copyTextExcludePattern: "^(?:Copy|Copied|复制|已复制)$",
  copyMenu: false,
  resetClipboardBeforeCopy: true,
  acceptUnchangedClipboard: false,
  copyTimeoutMs: 7000,
  copyPollMs: 40,
  copyCaptureGraceMs: 340,
  matchMode: "anyUseful"
};
const messageCopyFromArticles = async () => {
  const articles = claudeArticles();
  if (!articles.length) return [];
  const turns = [];
  const seenText = new Set();
  const debug = [];
  for (const article of articles) {
    const role = roleFromArticle(article);
    if (role !== "user" && role !== "assistant") {
      debug.push({ reason: "role not recognized", label: article.getAttribute("aria-label") || "", text: normalize(article.innerText || article.textContent || "").slice(0, 80) });
      continue;
    }
    const buttons = claudeArticleCopyButtons(article).slice(0, 4);
    if (!buttons.length) {
      debug.push({ role, reason: "copy button not found", label: article.getAttribute("aria-label") || "" });
      continue;
    }
    try { api.reveal(article); } catch (error) {}
    await api.sleep(160);
    for (const button of buttons) {
      try { api.reveal(button); } catch (error) {}
    }
    const copied = cleanCopiedText(await api.copyFirst(buttons, {
      expected: "",
      role,
      scope: article,
      options: articleCopyOptions
    }), role);
    if (!hasUsefulLength(role, copied)) {
      debug.push({ role, reason: "empty copy result", buttonCount: buttons.length, label: article.getAttribute("aria-label") || "" });
      continue;
    }
    const key = role + "\n" + compact(copied);
    if (!seenText.has(key)) {
      seenText.add(key);
      turns.push({ role, text: copied });
    }
    await api.sleep(90);
  }
  const merged = mergeIfStructured(turns);
  if (!structured(merged) && debug.length) console.debug("[Simple Chat Hub] Claude article copy extraction", debug);
  return merged;
};
const messageWrapperCandidate = element => {
  if (!element || element === document || element === document.documentElement || element === document.body) return false;
  const label = normalize([
    element.getAttribute && element.getAttribute("aria-label"),
    element.getAttribute && element.getAttribute("data-testid"),
    element.getAttribute && element.getAttribute("data-test-id"),
    element.getAttribute && element.getAttribute("role"),
    typeof element.className === "string" ? element.className : ""
  ].filter(Boolean).join(" "));
  if (/\bmessage\s+\d+\s+of\s+\d+\b/i.test(label)) return true;
  if (/message|conversation-turn|chat-message|chat_message/i.test(label) && qsa("button,[role=button],[role=toolbar],toolbar", element).length) return true;
  return false;
};
const messageRootFor = element => {
  let best = null;
  for (let node = element && element.parentElement, depth = 0; node && node !== root && depth < 10; node = node.parentElement, depth += 1) {
    if (messageWrapperCandidate(node)) {
      best = node;
      break;
    }
    const text = normalize(node.innerText || node.textContent || "");
    if (!best && text.length >= 8 && text.length <= 20000 && qsa("button,[role=button],[role=toolbar],toolbar", node).length) best = node;
  }
  return best || element.parentElement || element;
};
const rectOf = element => {
  try {
    const rect = element && element.getBoundingClientRect && element.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch (error) {
    return null;
  }
};
const centerY = rect => rect ? (rect.top + rect.bottom) / 2 : 0;
const messageCopyButtonScore = (button, wrapper) => {
  if (!button || !wrapper || !isCopyButton(button)) return Number.POSITIVE_INFINITY;
  const buttonRoot = messageRootFor(button);
  if (buttonRoot && buttonRoot !== wrapper && !wrapper.contains(buttonRoot) && !buttonRoot.contains(wrapper)) return Number.POSITIVE_INFINITY;
  const buttonRect = rectOf(button);
  const wrapperRect = rectOf(wrapper);
  let score = wrapper.contains(button) ? 0 : 5000;
  const label = meta(button);
  if (/^(?:button\s+)?copy$/i.test(label) || /\bcopy\b/i.test(label)) score -= 700;
  if (closest(button, '[role=toolbar],toolbar,[class*="action" i],[class*="toolbar" i]')) score -= 250;
  if (!buttonRect || !wrapperRect) return score + 2000;
  const verticalOverlap = buttonRect.bottom >= wrapperRect.top - 16 && buttonRect.top <= wrapperRect.bottom + 96;
  if (!verticalOverlap) score += 10000;
  score += Math.abs(centerY(buttonRect) - centerY(wrapperRect));
  score += Math.max(0, buttonRect.top - wrapperRect.bottom) / 2;
  score += Math.max(0, wrapperRect.left - buttonRect.right) / 4;
  score += Math.max(0, buttonRect.left - wrapperRect.right) / 4;
  return score;
};
const messageCopyButtonsFor = wrapper => {
  const seen = new Set();
  const buttons = [];
  const add = button => {
    if (!button || seen.has(button)) return;
    seen.add(button);
    const score = messageCopyButtonScore(button, wrapper);
    if (Number.isFinite(score)) buttons.push({ button, score });
  };
  qsa("button,[role=button]", wrapper).forEach(add);
  qsa("button,[role=button]", root).forEach(button => {
    const rect = rectOf(button);
    const wrapperRect = rectOf(wrapper);
    if (!rect || !wrapperRect) return;
    if (rect.bottom < wrapperRect.top - 24 || rect.top > wrapperRect.bottom + 120) return;
    add(button);
  });
  return buttons
    .sort((a, b) => a.score - b.score || order(a.button, b.button))
    .map(item => item.button);
};
const hasClaudeMessageCopyButtons = () => headings.some(heading => {
  const wrapper = messageRootFor(heading.element);
  return messageCopyButtonsFor(wrapper).length > 0;
});
const messageCopyFromHeadings = async () => {
  if (!headings.length) return [];
  const turns = [];
  const seenRoots = new Set();
  const seenText = new Set();
  const copyOptions = {
    resetClipboardBeforeCopy: true,
    acceptUnchangedClipboard: false,
    copyTimeoutMs: 6500,
    copyPollMs: 40,
    copyCaptureGraceMs: 320,
    copyMenu: false,
    matchMode: "anyUseful"
  };
  const debug = [];
  for (const heading of headings) {
    const wrapper = messageRootFor(heading.element);
    if (!wrapper || seenRoots.has(wrapper)) continue;
    seenRoots.add(wrapper);
    const expected = cleanDomText(api.text(wrapper) || wrapper.innerText || wrapper.textContent || "", heading.role);
    const buttons = messageCopyButtonsFor(wrapper).slice(0, 8);
    if (!buttons.length) {
      debug.push({ role: heading.role, reason: "copy button not found", expected: expected.slice(0, 80) });
      continue;
    }
    try { api.reveal(wrapper); } catch (error) {}
    await api.sleep(140);
    for (const button of buttons) {
      try { api.reveal(button); } catch (error) {}
    }
    const copied = useful(await api.copyFirst(buttons, {
      expected,
      role: heading.role,
      scope: wrapper,
      options: copyOptions
    }));
    if (!hasUsefulLength(heading.role, copied)) {
      debug.push({ role: heading.role, reason: "empty copy result", buttonCount: buttons.length, expected: expected.slice(0, 80) });
      continue;
    }
    const key = heading.role + "\n" + compact(copied);
    if (!seenText.has(key)) {
      seenText.add(key);
      turns.push({ role: heading.role, text: copied });
    }
    await api.sleep(90);
  }
  const merged = mergeIfStructured(turns);
  if (!structured(merged) && debug.length) console.debug("[Simple Chat Hub] Claude message copy extraction", debug);
  return merged;
};
const domFromHeadings = () => {
  if (!headings.length) return [];
  const turns = [];
  const seenRoots = new Set();
  for (const heading of headings) {
    const wrapper = messageRootFor(heading.element);
    if (!wrapper || seenRoots.has(wrapper)) continue;
    seenRoots.add(wrapper);
    const text = cleanDomText(api.text(wrapper) || wrapper.innerText || wrapper.textContent || "", heading.role);
    if (hasUsefulLength(heading.role, text)) turns.push({ role: heading.role, text });
  }
  return mergeIfStructured(turns);
};

const splitTextByRoleLabels = () => {
  const raw = normalize(api.text(root) || root.innerText || root.textContent || "");
  if (!raw) return [];
  const blocks = [];
  let current = null;
  for (const rawLine of raw.split(/\n+/)) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const role = roleFromHeading(line);
    if (role) {
      if (current) blocks.push(current);
      current = { role, lines: [stripRolePrefix(line, role)] };
      continue;
    }
    if (!current) continue;
    if (chromeLinePattern.test(line)) continue;
    current.lines.push(line);
  }
  if (current) blocks.push(current);
  const turns = blocks
    .map(block => ({ role: block.role, text: cleanDomText(block.lines.join("\n"), block.role) }))
    .filter(item => hasUsefulLength(item.role, item.text));
  return mergeIfStructured(turns);
};

const articleCopy = await messageCopyFromArticles();
if (structured(articleCopy)) return articleCopy;

const messageCopy = await messageCopyFromHeadings();
if (structured(messageCopy)) return messageCopy;

const legacy = await legacyHeadingCopy();
if (structured(legacy)) return legacy;

if (typeof api.extractNativeCopyConversation === "function") {
  const copied = await api.extractNativeCopyConversation(root);
  if (structured(copied)) return copied;
}

if (hasClaudeArticleCopyButtons() || hasClaudeMessageCopyButtons()) {
  console.debug("[Simple Chat Hub] Claude copy buttons were present, so DOM text fallback was not accepted.");
  return [];
}

const headingDom = domFromHeadings();
if (structured(headingDom)) return headingDom;

return splitTextByRoleLabels();
