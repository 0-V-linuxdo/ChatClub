(() => {
  const scripts = Object.create(null);
  scripts["chatgpt"] = async function(api) {
const opts = {
  copyButtonSelector: 'button[data-testid="copy-turn-action-button"],button[aria-label="Copy message"],button[aria-label="Copy response"]',
  maxButtons: 80
};
const closest = (node, selector) => {
  try {
    return api.closest(node, selector);
  } catch (error) {
    return null;
  }
};
const turnScope = node => closest(node, 'article,[data-testid^="conversation-turn"],[data-testid*="conversation-turn"]') || node;
const centerY = rect => (rect.top + rect.bottom) / 2;
const visibleRect = node => {
  try {
    const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch (error) {
    return null;
  }
};
const roleLabel = role => role === 'user' ? /^copy message$/i : /^copy response$/i;
const candidateScore = (button, scope, role) => {
  const buttonRect = visibleRect(button);
  const scopeRect = visibleRect(scope);
  if (!buttonRect || !scopeRect) return Number.POSITIVE_INFINITY;
  const aria = String(button.getAttribute('aria-label') || '').trim();
  const testId = String(button.getAttribute('data-testid') || '').trim();
  const correctLabel = roleLabel(role).test(aria);
  const copyTurnButton = testId === 'copy-turn-action-button';
  if (!correctLabel && !copyTurnButton) return Number.POSITIVE_INFINITY;
  const verticalOverlap = buttonRect.bottom >= scopeRect.top - 32 && buttonRect.top <= scopeRect.bottom + 120;
  const horizontalDistance = buttonRect.left < scopeRect.left - 120 || buttonRect.left > scopeRect.right + 180 ? 5000 : 0;
  return (correctLabel ? 0 : 1000) + (verticalOverlap ? 0 : 10000) + horizontalDistance + Math.abs(centerY(buttonRect) - centerY(scopeRect)) + Math.abs(buttonRect.left - scopeRect.left) / 20;
};
const copyForTurn = async (scope, role) => {
  api.reveal(scope);
  await api.sleep(160);
  const buttons = api.qsa(opts.copyButtonSelector, document, { all: true })
    .filter(api.visible)
    .map(button => ({ button, score: candidateScore(button, scope, role) }))
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score)
    .slice(0, opts.maxButtons);
  for (const item of buttons) {
    const copied = await api.copy(item.button);
    const text = api.normalize(copied);
    if (text) return text;
    await api.sleep(80);
  }
  return '';
};
const turns = api.qsa('[data-message-author-role]', document, { all: true })
  .filter(api.visible)
  .map(node => ({ node, role: String(node.getAttribute('data-message-author-role') || '').toLowerCase() }))
  .filter(turn => turn.role === 'user' || turn.role === 'assistant')
  .filter((turn, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.role === turn.role && other.node !== turn.node && other.node.contains && other.node.contains(turn.node)));
const out = [];
for (const turn of turns) {
  const scope = turnScope(turn.node);
  const text = await copyForTurn(scope, turn.role);
  if (text) out.push({ role: turn.role, text });
  await api.sleep(120);
}
const merged = api.merge(out);
return merged.some(message => message.role === 'user') && merged.some(message => message.role === 'assistant') ? merged : [];
  };
  scripts["chatgpt.js"] = scripts["chatgpt"];
  scripts["claude"] = async function(api) {
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
const headings = qsa("h1,h2,h3,h4,[role=heading]", root)
  .filter(layoutVisible)
  .map(element => ({ element, role: roleFromHeading(normalize(element.innerText || element.textContent || "")) }))
  .filter(item => item.role)
  .sort((a, b) => order(a.element, b.element));
if (!headings.length) return [];
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
const useful = value => {
  const text = normalize(value).replace(/^Copied to clipboard\.?$/i, "").trim();
  if (!text || /^(?:copy|copied|复制|已复制)$/i.test(text)) return "";
  if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return "";
  return text;
};
const turns = [];
const seen = new Set();
const buttons = qsa("button,[role=button]", root).filter(isCopyButton).sort(order).slice(0, 48);
for (const button of buttons) {
  const role = roleForButton(button);
  if (role !== "user" && role !== "assistant") continue;
  api.reveal(button);
  await api.sleep(120);
  const text = useful(await api.copy(button, { copyTimeoutMs: 1200, copyPollMs: 50 }));
  if (text) {
    const key = role + "\\n" + text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      turns.push({ role, content: text });
    }
  }
  await api.sleep(80);
}
const merged = api.merge(turns);
return merged.some(item => item.role === "user") && merged.some(item => item.role === "assistant") ? merged : [];
  };
  scripts["claude.js"] = scripts["claude"];
  scripts["gemini"] = async function(api) {
const copyTimeoutMs = Math.max(500, Math.min(3000, Number(api.config && api.config.copyTimeoutMs) || 1400));
const retryCopyTimeoutMs = Math.max(copyTimeoutMs + 400, 1800);
const root = api.qs('main,[role="main"]') || document.body;
const normalize = value => api.normalize(String(value || ''));
const chromeLinePattern = /^(?:Copy prompt|Copy|Copied|Edit|Good response|Bad response|Redo|Show more options|Share|Export|Open menu for conversation actions\.?|Ask Gemini|Microphone|Upload & tools|Send message|Flash(?:[-\s]?Lite)?|Flash|Pro|Experimental|Deep Research|Canvas|Search|Explain|Translate|翻译|搜索|复制|已复制|编辑|重新生成|更多|分享|导出|点赞|点踩)$/i;
const stripLabels = value => String(value || '')
  .replace(/(^|\n)\s*(?:You said|Gemini said)\s+(?=\S)/gi, '$1')
  .replace(/(^|\n)\s*(?:You said|Gemini said)\s*(?=\n|$)/gi, '\n')
  .replace(/(^|\n)\s*(?:Copy prompt|Copy|Copied|Edit|Good response|Bad response|Redo|Show more options)\s*(?=\n|$)/gi, '\n');
const cleanCopiedText = value => normalize(stripLabels(value))
  .split(/\n+/)
  .map(line => line.trim().replace(/^(?:You said|Gemini said)\s+/i, '').trim())
  .filter(line => line && !chromeLinePattern.test(line))
  .join('\n');
const useful = value => {
  const text = cleanCopiedText(value);
  if (!text || text.length < 2 || text.length > 50000) return '';
  if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return '';
  return text;
};
const compact = value => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
const labelOf = node => normalize([
  node && node.getAttribute && node.getAttribute('aria-label'),
  node && node.getAttribute && node.getAttribute('aria-labelledby'),
  node && node.getAttribute && node.getAttribute('data-tooltip'),
  node && node.getAttribute && node.getAttribute('title'),
  node && node.getAttribute && node.getAttribute('data-testid'),
  node && node.textContent,
  node && node.innerText
].filter(Boolean).join(' '));
const rectOf = node => {
  try {
    const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch (error) {
    return null;
  }
};
const centerY = rect => (rect.top + rect.bottom) / 2;
const elementOrder = (a, b) => {
  try {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  } catch (error) {
    return 0;
  }
};
const addUnique = (items, item) => {
  if (item && !items.includes(item)) items.push(item);
};
const closest = (node, selector) => {
  try {
    return api.closest ? api.closest(node, selector) : node && node.closest && node.closest(selector);
  } catch (error) {
    return null;
  }
};
const roleFor = node => {
  const meta = [
    node && node.tagName,
    node && node.getAttribute && node.getAttribute('data-message-author-role'),
    node && node.getAttribute && node.getAttribute('data-test-id'),
    node && node.getAttribute && node.getAttribute('data-testid'),
    node && node.getAttribute && node.getAttribute('class')
  ].filter(Boolean).join(' ').toLowerCase();
  if (/user|query/.test(meta)) return 'user';
  if (/assistant|model|response/.test(meta)) return 'assistant';
  return '';
};
const roleFromHeading = node => {
  const text = normalize(node && node.textContent);
  if (/^you said(?:\b|\s|$)/i.test(text)) return 'user';
  if (/^gemini said(?:\b|\s|$)/i.test(text)) return 'assistant';
  return '';
};
const canonicalTurn = (node, role) => {
  const selector = role === 'user'
    ? 'user-query,.user-query,[data-test-id*="user-query"],[data-testid*="user-query"],[data-message-author-role="user"]'
    : 'model-response,.model-response,[data-test-id*="model-response"],[data-testid*="model-response"],[data-message-author-role="assistant"]';
  return closest(node, selector) || node;
};
const turnSelector = [
  'user-query',
  '.user-query',
  '[data-test-id*="user-query"]',
  '[data-testid*="user-query"]',
  '[data-message-author-role="user"]',
  'model-response',
  '.model-response',
  '[data-test-id*="model-response"]',
  '[data-testid*="model-response"]',
  '[data-message-author-role="assistant"]'
].join(',');
const turnMap = new Map();
for (const node of api.qsa(turnSelector, root, { all: true }).filter(api.visible)) {
  const role = roleFor(node);
  if (role === 'user' || role === 'assistant') turnMap.set(node, { node, role });
}
for (const heading of api.qsa('h1,h2,h3,[role="heading"]', root, { all: true }).filter(api.visible)) {
  const role = roleFromHeading(heading);
  if (role !== 'user' && role !== 'assistant') continue;
  const node = canonicalTurn(heading, role);
  if (!turnMap.has(node)) turnMap.set(node, { node, role });
}
const turns = Array.from(turnMap.values())
  .filter((item, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.node !== item.node && other.node.contains && other.node.contains(item.node) && other.role === item.role))
  .sort((a, b) => elementOrder(a.node, b.node));
const buttonSelector = 'button,[role="button"],[role="menuitem"],[mat-icon-button]';
const userButtonLabel = label => /copy\s*prompt|copy[-_ ]?prompt|复制(?:提示|提问|问题)/i.test(label);
const assistantExcludedLabel = label => /copy\s*(?:prompt|code|table|link|conversation|image|source|sources)|copy[-_ ]?(?:prompt|code|table|link|conversation|image|source|sources)|prompt|code|table|link|conversation|history|image|source|sources|citation|citations|feedback|thumb|like|dislike|settings|export|download|提示|提问|问题|代码|表格|链接|会话|历史|图片|下载|来源|引用/i.test(label);
const assistantButtonLabel = label => !assistantExcludedLabel(label) && (/^(?:copy|copied|复制|已复制|content_copy|copy_all|file_copy)$/i.test(label) || /\b(?:content_copy|copy_all|file_copy)\b/i.test(label));
const roleButtonMatch = (button, role) => {
  const label = labelOf(button);
  return role === 'user' ? userButtonLabel(label) : assistantButtonLabel(label);
};
const turnScopes = turn => {
  const scopes = [];
  addUnique(scopes, turn.node);
  for (let node = turn.node, depth = 0; node && node !== document.body && depth < 5; node = node.parentElement, depth += 1) {
    addUnique(scopes, node);
    addUnique(scopes, node.previousElementSibling);
    addUnique(scopes, node.nextElementSibling);
  }
  return scopes;
};
const revealTurn = async (turn, delay) => {
  for (const scope of turnScopes(turn)) api.reveal(scope);
  await api.sleep(delay);
};
const candidateScore = (button, turn) => {
  const buttonRect = rectOf(button);
  const turnRect = rectOf(turn.node);
  if (!buttonRect || !turnRect || !roleButtonMatch(button, turn.role)) return Number.POSITIVE_INFINITY;
  const verticalOverlap = buttonRect.bottom >= turnRect.top - 96 && buttonRect.top <= turnRect.bottom + 220;
  const horizontalPenalty = buttonRect.left < turnRect.left - 220 || buttonRect.left > turnRect.right + 260 ? 5000 : 0;
  return (verticalOverlap ? 0 : 10000) + horizontalPenalty + Math.abs(centerY(buttonRect) - centerY(turnRect)) + Math.max(0, buttonRect.top - turnRect.bottom) / 2;
};
const collectButtons = async turn => {
  const candidates = [];
  const scan = () => {
    for (const button of api.qsa(buttonSelector, root, { all: true }).filter(api.visible)) {
      if (roleButtonMatch(button, turn.role)) addUnique(candidates, button);
    }
  };
  for (const delay of [80, 180, 280]) {
    await revealTurn(turn, delay);
    scan();
    const scored = candidates
      .map(button => ({ button, score: candidateScore(button, turn) }))
      .filter(item => Number.isFinite(item.score))
      .sort((a, b) => a.score - b.score || elementOrder(a.button, b.button));
    if (scored.length) return scored.slice(0, 3).map(item => item.button);
  }
  return [];
};
const copyFromButtons = async buttons => {
  for (const button of buttons) {
    const text = useful(await api.copy(button, { copyTimeoutMs, copyPollMs: 40 }));
    if (text) return text;
  }
  if (buttons[0]) {
    await api.sleep(180);
    return useful(await api.copy(buttons[0], { copyTimeoutMs: retryCopyTimeoutMs, copyPollMs: 40 }));
  }
  return '';
};
const push = (out, role, value) => {
  const text = useful(value);
  if ((role !== 'user' && role !== 'assistant') || !text) return false;
  const key = role + '|' + compact(text);
  for (let index = 0; index < out.length; index += 1) {
    const existing = out[index];
    if (existing.role !== role) continue;
    const existingKey = role + '|' + compact(existing.text);
    if (existingKey === key || existingKey.includes(key)) return true;
    if (key.includes(existingKey)) {
      out[index] = { role, text };
      return true;
    }
  }
  out.push({ role, text });
  return true;
};
for (const turn of turns) await revealTurn(turn, 40);
await api.sleep(120);
const out = [];
for (const turn of turns) {
  const buttons = await collectButtons(turn);
  push(out, turn.role, await copyFromButtons(buttons));
}
const merged = api.merge(out);
return merged.some(message => message.role === 'user') && merged.some(message => message.role === 'assistant') ? merged : [];
  };
  scripts["gemini.js"] = scripts["gemini"];
  scripts["deepseek"] = async function(api) {
const site = "deepseek";
const root = api.qs('main,[role="main"]') || document.body || document.documentElement;
const copyOptions = {
  resetClipboardBeforeCopy: true,
  acceptUnchangedClipboard: false,
  copyTimeoutMs: 2200,
  copyPollMs: 40,
  copyCaptureGraceMs: 260
};
const normalize = value => api.normalize(String(value || ''));
const isCopyProbe = value => /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || '')) || /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(normalize(value));
const qsa = (selector, scope = document) => {
  try { return api.qsa(selector, scope || document, { all: true }); } catch (error) { return []; }
};
const closest = (node, selector) => {
  try { return api.closest ? api.closest(node, selector) : node && node.closest && node.closest(selector); } catch (error) { return null; }
};
const rectOf = node => {
  try {
    const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch (error) { return null; }
};
const visible = node => {
  try {
    const rect = rectOf(node);
    if (!rect) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
  } catch (error) { return !!(api.visible && api.visible(node)); }
};
const order = (a, b) => {
  try {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  } catch (error) { return 0; }
};
const classText = node => {
  const value = node && node.getAttribute && node.getAttribute('class') || node && node.className;
  return typeof value === 'string' ? value : value && value.baseVal || '';
};
const attrRefText = (node, attr) => {
  try {
    return String(node && node.getAttribute && node.getAttribute(attr) || '')
      .split(/\s+/)
      .map(id => id && node.ownerDocument && node.ownerDocument.getElementById(id))
      .filter(Boolean)
      .map(el => el.innerText || el.textContent || '')
      .join(' ');
  } catch (error) { return ''; }
};
const meta = node => normalize([
  node && node.tagName,
  classText(node),
  node && node.getAttribute && node.getAttribute('role'),
  node && node.getAttribute && node.getAttribute('aria-label'),
  attrRefText(node, 'aria-labelledby'),
  attrRefText(node, 'aria-describedby'),
  node && node.getAttribute && node.getAttribute('aria-description'),
  node && node.getAttribute && node.getAttribute('title'),
  node && node.getAttribute && node.getAttribute('data-tooltip'),
  node && node.getAttribute && node.getAttribute('data-testid'),
  node && node.getAttribute && node.getAttribute('data-test-id'),
  node && node.textContent,
  node && node.innerText
].filter(Boolean).join(' '));
const svgSignature = node => normalize([node, ...qsa('svg,path,rect,line,polyline,polygon,use,img,[data-icon],[class]', node).slice(0, 80)].map(el => [
  classText(el),
  el && el.getAttribute && el.getAttribute('data-icon'),
  el && el.getAttribute && el.getAttribute('aria-label'),
  el && el.getAttribute && el.getAttribute('title'),
  el && el.getAttribute && el.getAttribute('alt'),
  el && el.getAttribute && el.getAttribute('src'),
  el && el.getAttribute && el.getAttribute('href'),
  el && el.getAttribute && el.getAttribute('xlink:href'),
  el && el.getAttribute && el.getAttribute('viewBox'),
  el && el.getAttribute && el.getAttribute('d'),
  el && el.getAttribute && el.getAttribute('x'),
  el && el.getAttribute && el.getAttribute('y'),
  el && el.getAttribute && el.getAttribute('width'),
  el && el.getAttribute && el.getAttribute('height')
].filter(Boolean).join(' ')).join(' ')).toLowerCase();
const explicitCopy = button => /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content_copy|copy_all|file_copy/i.test(meta(button));
const codeOrLinkCopy = button => /copy\s*(?:code|table|link|conversation|source|sources|url)|copy[-_ ]?(?:code|table|link|conversation|source|sources|url)|复制(?:代码|表格|链接|会话|来源|引用)/i.test(meta(button));
const looksCopyIcon = button => {
  const text = svgSignature(button);
  if (!text) return false;
  if (/copy|clipboard|content_copy|copy_all|file_copy|lucide-copy|tabler-icon-copy|copy[-_ ]?(?:icon|line|fill)|heroicons.*clipboard|mingcute.*copy|carbon.*copy/.test(text)) return true;
  if (/64 64 896 896/.test(text) && /m832\s*64h296|m704\s*192h-?512|v688|v704|h512|h496/.test(text) && /v624|h432|h496/.test(text)) return true;
  if (/0 0 (16|18|20) (16|18|20)/.test(text) && /(m12\.668\s*10\.667c|m12\.66810\.667c|m13\.998\s*12\.665c|m13\.99812\.665c|m6\.14929\s*4\.02032c|m6\.149294\.02032c|m9\.80164\s*0\.367975c|m9\.801640\.367975c)/.test(text)) return true;
  if (/0 0 24 24/.test(text) && (/\bm\s*(4|6|7|8|9)\s*(4|6|7|8|9)\b/.test(text) || /\bx\s*=\s*(4|6|7|8|9)\b/.test(text)) && (/\bh\s*(8|9|10|12|14)\b|\bv\s*(8|9|10|12|14)\b|width=(8|9|10|12|14)|height=(8|9|10|12|14)/.test(text))) return true;
  const rects = qsa('rect', button).filter(rect => Number(rect.getAttribute('width') || 0) >= 7 && Number(rect.getAttribute('height') || 0) >= 7);
  return rects.length >= 2;
};
const isSmallIconButton = button => {
  const rect = rectOf(button);
  if (!rect || rect.width < 12 || rect.height < 12 || rect.width > 76 || rect.height > 76) return false;
  const label = normalize(meta(button)).toLowerCase();
  const textOnly = normalize(button && (button.innerText || button.textContent) || '');
  return !!qsa('svg,img,[data-icon]', button).length && textOnly.length <= 32 && !/(send|ask anything|message|search|deepthink|model|attach|upload|voice|home|new chat|sidebar|fullscreen|reload|menu|more)/i.test(label);
};
const hoverCopyVisible = button => {
  if (visible(button)) return true;
  try {
    const style = getComputedStyle(button);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return explicitCopy(button) || looksCopyIcon(button) || !!qsa('svg,img,[data-icon]', button).length;
  } catch (error) { return false; }
};
const badButton = (button, role = '') => {
  if (!button || !visible(button)) return true;
  if (closest(button, 'nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]')) return true;
  const label = meta(button).toLowerCase();
  const blockedAction = /(?:link|share|history|source|sources|citation|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|retry|upload|voice|submit|send|model|attach|new chat|home page|fullscreen|reload|close|edit|delete|search|deepthink|imagine|project|pfp|profile|upgrade)|链接|分享|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|侧边栏|重新生成|上传|语音|提交|发送|编辑|删除|搜索/.test(label);
  if (blockedAction && !explicitCopy(button)) return true;
  if (codeOrLinkCopy(button)) return true;
  if (explicitCopy(button) || looksCopyIcon(button)) return false;
  return blockedAction;
};
const textOf = node => {
  try { return normalize(api.text ? api.text(node) : node && (node.innerText || node.textContent)); } catch (error) { return normalize(node && (node.innerText || node.textContent)); }
};
const uiLine = /^(?:Copy|Copied|Copy prompt|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
const cleanCopied = (value, role) => {
  let text = normalize(value).replace(/\r\n?/g, '\n').replace(/Show more\s*Show less/gi, '');
  const lines = text.split('\n').map(line => line.trim()).filter(line => line && !uiLine.test(line));
  text = normalize(lines.join('\n'));
  if (site === 'deepseek' && role === 'user') {
    const title = normalize((document.title || '').replace(/\s*[-–—|].*$/, ''));
    if (title && text.startsWith(title)) text = normalize(text.slice(title.length));
    text = normalize(text.replace(/^\s*(?:DeepSeek|DSeek|Instant)\b\s*/i, ''));
  }
  return text;
};
const useful = (value, role) => {
  const text = cleanCopied(value, role);
  if (isCopyProbe(value) || isCopyProbe(text)) return '';
  if (!text || text.length < 2 || text.length > 50000) return '';
  if (/^(?:copy|copied|复制|已复制|share|link)$/i.test(text)) return '';
  if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return '';
  if (/Simple Chat Hub|Summary Panel|pages checked,|No userscript messages found/i.test(text)) return '';
  if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(text)) return '';
  return text;
};
const compact = value => normalize(value).toLowerCase()
  .replace(/\[[^\]]+\]\([^)]*\)/g, '$1')
  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
const roughMatch = (copied, expected) => {
  const a = compact(copied);
  const b = compact(expected);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const size = Math.min(90, b.length);
  const parts = [b.slice(0, size), b.slice(Math.max(0, Math.floor(b.length / 2) - Math.floor(size / 2)), Math.floor(b.length / 2) + Math.floor(size / 2)), b.slice(-size)].filter(part => part.length >= 12);
  return parts.filter(part => a.includes(part)).length >= (b.length > 180 ? 2 : 1);
};
const addUnique = (list, item) => { if (item && item.nodeType === 1 && !list.includes(item)) list.push(item); };
const buttonSelector = 'button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]';
const hasVisibleAction = node => qsa(buttonSelector, node).some(visible);
const deepSeekActionScope = node => {
  if (!node || site !== 'deepseek') return node;
  const direct = closest(node, '.ds-message,[class*=ds-message],[data-message-author-role],article,[data-testid*=message],[class*=message],[class*=Message]') || node;
  for (let current = direct, depth = 0; current && current !== root && current !== document.body && depth < 8; current = current.parentElement, depth += 1) {
    if (closest(current, 'nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]')) continue;
    if (looksMessageText(textOf(current)) && hasVisibleAction(current)) return current;
  }
  return direct;
};
const actionScopes = anchor => {
  const scopes = [];
  const add = node => {
    if (!node || node.nodeType !== 1 || node === document.documentElement || node === document.body) return;
    if (closest(node, 'nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]')) return;
    addUnique(scopes, node);
  };
  const base = anchor && (closest(anchor, '[data-message-author-role],article,[data-testid*=message],[data-testid*=conversation],[class*=message],[class*=Message],[class*=response],[class*=Response],.ds-message') || anchor);
  for (let node = base || anchor, depth = 0; node && depth < 9; node = node.parentElement, depth += 1) {
    add(node);
    add(node.previousElementSibling);
    add(node.nextElementSibling);
    const parent = node.parentElement;
    add(parent);
    if (parent) {
      add(parent.previousElementSibling);
      add(parent.nextElementSibling);
    }
  }
  add(anchor);
  return scopes;
};
const candidateButtons = (anchor, role = '') => {
  const anchorRect = rectOf(anchor);
  const items = [];
  const seen = new Set();
  const add = (button, baseScore) => {
    if (!button || seen.has(button) || badButton(button, role)) return;
    if (!button.matches || !button.matches(buttonSelector)) return;
    const rect = rectOf(button);
    if (!rect && role !== 'user') return;
    const copyish = explicitCopy(button) || looksCopyIcon(button);
    const allowSmallIcon = site === 'deepseek' ? !!rect : role !== 'user';
    const smallIcon = allowSmallIcon && isSmallIconButton(button);
    if (!copyish && !smallIcon) return;
    let score = baseScore + (copyish ? 0 : 45000);
    if (!rect) score += 25000;
    if (anchorRect && rect) {
      const far = rect.bottom < anchorRect.top - 260 || rect.top > anchorRect.bottom + 520 || rect.right < anchorRect.left - 220 || rect.left > anchorRect.right + 260;
      if (far) return;
      const vertical = Math.min(Math.abs(rect.top - anchorRect.bottom), Math.abs(rect.bottom - anchorRect.top), Math.abs(rect.top - anchorRect.top));
      score += vertical * 18 + Math.abs(rect.left - anchorRect.left);
      if (rect.top >= anchorRect.top - 24 && rect.top <= anchorRect.bottom + 180) score -= 1200;
    }
    if (explicitCopy(button)) score -= 10000;
    if (looksCopyIcon(button)) score -= 5000;
    seen.add(button);
    items.push({ button, score });
  };
  let index = 0;
  for (const scope of actionScopes(anchor)) {
    if (scope.matches && scope.matches(buttonSelector)) add(scope, index++);
    for (const button of qsa(buttonSelector, scope)) add(button, index++);
  }
  if (anchorRect) {
    for (const button of qsa(buttonSelector, document)) add(button, 90000 + index++);
  }
  return items.sort((a, b) => a.score - b.score || order(a.button, b.button)).map(item => item.button);
};
const escapeMenus = async () => {
  try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })); } catch (error) {}
  await api.sleep(40);
};
const hoverElement = node => {
  if (!node || node.nodeType !== 1) return;
  let rect = rectOf(node);
  const x = rect ? Math.max(rect.left + 4, Math.min(rect.right - 4, rect.left + rect.width / 2)) : 0;
  const y = rect ? Math.max(rect.top + 4, Math.min(rect.bottom - 4, rect.top + rect.height / 2)) : 0;
  const mouse = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
  try {
    if (window.PointerEvent) {
      const pointer = { ...mouse, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 };
      node.dispatchEvent(new PointerEvent('pointerover', pointer));
      node.dispatchEvent(new PointerEvent('pointerenter', pointer));
      node.dispatchEvent(new PointerEvent('pointermove', pointer));
    }
    node.dispatchEvent(new MouseEvent('mouseenter', mouse));
    node.dispatchEvent(new MouseEvent('mouseover', mouse));
    node.dispatchEvent(new MouseEvent('mousemove', mouse));
  } catch (error) {}
};
const hoverTurn = async anchor => {
  try { api.reveal(anchor); } catch (error) {}
  const scopes = actionScopes(anchor).slice(0, 10);
  for (const scope of [anchor, ...scopes]) hoverElement(scope);
  await api.sleep(180);
  for (const scope of [anchor, ...scopes.slice(0, 5)]) hoverElement(scope);
  await api.sleep(120);
};
const copyTurn = async turn => {
  const anchor = turn.actionNode || turn.node;
  try {
    api.reveal(turn.node);
    api.reveal(anchor);
  } catch (error) {}
  if (site === 'deepseek') await api.sleep(80);
  else await hoverTurn(anchor);
  const buttonLimit = site === 'deepseek' ? (turn.role === 'user' ? 6 : 8) : (turn.role === 'user' ? 12 : 10);
  let buttons = candidateButtons(anchor, turn.role).slice(0, buttonLimit);
  if (turn.role === 'user' && !buttons.length && site !== 'deepseek') {
    await hoverTurn(anchor);
    buttons = candidateButtons(anchor, turn.role).slice(0, 12);
  }
  const maxAttempts = site === 'deepseek' ? 1 : (turn.role === 'user' ? 1 : 2);
  const perRoleCopyOptions = site === 'deepseek'
    ? { ...copyOptions, copyTimeoutMs: turn.role === 'user' ? 1000 : 1800, copyCaptureGraceMs: 220 }
    : turn.role === 'user'
    ? { ...copyOptions, copyTimeoutMs: 1200, copyCaptureGraceMs: 180 }
    : { ...copyOptions, copyTimeoutMs: 3200, copyCaptureGraceMs: 260 };
  for (const button of buttons) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt) await api.sleep(120);
      try {
        api.reveal(turn.node);
        api.reveal(anchor);
        if (site !== 'deepseek') {
          hoverElement(anchor);
          hoverElement(button);
        }
        api.reveal(button);
      } catch (error) {}
      const raw = await api.copy(button, perRoleCopyOptions);
      const text = useful(raw, turn.role);
      if (text) {
        const matchesExpected = turn.expected && roughMatch(text, turn.expected);
        if (turn.role === 'user') {
          if (matchesExpected && text.length >= 2 && text.length <= 12000) return text;
        } else {
          if (matchesExpected) return text;
          if (text.length >= 12) return text;
        }
      }
      await escapeMenus();
    }
  }
  return '';
};
const looksMessageText = value => {
  const text = normalize(value);
  if (!text || text.length < 2 || text.length > 45000) return false;
  if (/^(?:Copy|Copied|Share|Like|Dislike|Search|DeepThink|Ask anything|Upgrade to SuperGrok|Cookie Settings)$/i.test(text)) return false;
  if (/Summary Panel|Simple Chat Hub|pages checked/i.test(text)) return false;
  return /[A-Za-z0-9\u4e00-\u9fff]/.test(text);
};
const pushTurn = (turns, role, node, expected = '', actionNode = node) => {
  if ((role !== 'user' && role !== 'assistant') || !node) return;
  const text = normalize(expected || textOf(node));
  if (!looksMessageText(text)) return;
  if (turns.some(item => item.role === role && item.node === node)) return;
  turns.push({ role, node, actionNode: actionNode || node, expected: text });
};
const previousTextBlock = (anchor, marker) => {
  const markerRect = rectOf(marker || anchor);
  const candidates = [];
  for (const node of qsa('article,section,div,[role]', root)) {
    if (!visible(node) || node === anchor || node.contains(anchor) || closest(node, 'nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]')) continue;
    if (order(node, marker || anchor) >= 0) continue;
    const text = textOf(node);
    if (!looksMessageText(text) || /Thought for|Upgrade to SuperGrok|Ask anything/i.test(text)) continue;
    const rect = rectOf(node);
    if (markerRect && rect && rect.bottom > markerRect.top + 80) continue;
    const tooBroad = qsa('article,section,div,[role]', node).some(child => child !== node && looksMessageText(textOf(child)) && textOf(child).length >= Math.min(text.length * 0.65, text.length - 8));
    if (tooBroad && text.length > 300) continue;
    candidates.push({ node, rect, text });
  }
  candidates.sort((a, b) => {
    const ar = a.rect, br = b.rect;
    if (ar && br && Math.abs(ar.bottom - br.bottom) > 4) return br.bottom - ar.bottom;
    return order(a.node, b.node);
  });
  return candidates[0] || null;
};
const findDeepSeekTurns = () => {
  const turns = [];
  const assistants = qsa('.ds-assistant-message-main-content', root).filter(visible).sort(order);
  for (const assistant of assistants) {
    const assistantScope = closest(assistant, '.ds-message') || assistant;
    const container = assistantScope && assistantScope.parentElement || assistantScope;
    let userNode = null;
    for (let prev = container && container.previousElementSibling, count = 0; prev && count < 7; prev = prev.previousElementSibling, count += 1) {
      if (looksMessageText(textOf(prev))) { userNode = prev; break; }
    }
    if (!userNode) {
      const found = previousTextBlock(assistantScope, assistantScope);
      userNode = found && found.node;
    }
    if (userNode) pushTurn(turns, 'user', userNode, '', deepSeekActionScope(userNode));
    pushTurn(turns, 'assistant', assistantScope, textOf(assistant), deepSeekActionScope(assistantScope));
  }
  return turns;
};
const findGrokTurns = () => {
  const turns = [];
  const thoughtNodes = qsa('button,div,span,[role=button]', root)
    .filter(node => visible(node) && /^\s*Thought for\b/i.test(normalize(node.innerText || node.textContent || '')))
    .sort(order);
  const markers = thoughtNodes.length ? thoughtNodes : qsa('article,section,div,[role]', root)
    .filter(node => visible(node) && /\bThought for\b/i.test(textOf(node)))
    .sort(order)
    .slice(0, 3);
  for (const marker of markers.slice(0, 3)) {
    let assistantNode = marker;
    for (let node = marker; node && node !== root && node !== document.body; node = node.parentElement) {
      const text = textOf(node);
      if (text.length > 120 && /\bThought for\b/i.test(text) && !/Ask anything|Upgrade to SuperGrok|Home page|Notifications/i.test(text)) {
        assistantNode = node;
        break;
      }
    }
    let userNode = null;
    for (let prev = assistantNode && assistantNode.previousElementSibling, count = 0; prev && count < 6; prev = prev.previousElementSibling, count += 1) {
      if (looksMessageText(textOf(prev)) && !/Thought for|Upgrade to SuperGrok|Ask anything/i.test(textOf(prev))) { userNode = prev; break; }
    }
    if (!userNode) {
      const found = previousTextBlock(assistantNode, marker);
      userNode = found && found.node;
    }
    if (userNode) pushTurn(turns, 'user', userNode);
    pushTurn(turns, 'assistant', assistantNode);
  }
  if (!turns.length) {
    const nodes = qsa('[data-message-author-role],article,[data-testid*=message],[data-testid*=conversation],[class*=message],[class*=Message],[class*=response],[class*=Response]', root)
      .filter(visible)
      .sort(order);
    for (const node of nodes) {
      const label = meta(node).toLowerCase();
      const role = /assistant|response|answer|bot|grok/.test(label) ? 'assistant' : /user|human|prompt|query|question/.test(label) ? 'user' : '';
      if (role) pushTurn(turns, role, node);
    }
  }
  return turns;
};
const looseCopySequence = async () => {
  const out = [];
  const seen = new Set();
  const buttons = candidateButtons(root).slice(0, 28);
  let index = 0;
  for (const button of buttons) {
    const roleText = meta(button);
    const role = /(assistant|response|answer|回答|回复)/i.test(roleText) ? 'assistant' : /(prompt|question|user|message|提问|用户)/i.test(roleText) ? 'user' : index % 2 === 0 ? 'user' : 'assistant';
    const raw = await api.copy(button, copyOptions);
    const text = useful(raw, role);
    if (!text) continue;
    const key = role + '\n' + compact(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ role, text });
    index += 1;
    if (out.some(item => item.role === 'user') && out.some(item => item.role === 'assistant')) break;
  }
  return api.merge(out);
};
let turns = site === 'deepseek' ? findDeepSeekTurns() : findGrokTurns();
turns = turns.filter((turn, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.role === turn.role && other.node !== turn.node && other.node.contains && other.node.contains(turn.node))).sort((a, b) => order(a.node, b.node));
const turnSeen = new Set();
turns = turns.filter(turn => {
  const key = turn.role + '\n' + compact(turn.expected || textOf(turn.node));
  if (!key.trim() || turnSeen.has(key)) return false;
  turnSeen.add(key);
  return true;
});
const out = [];
const seen = new Set();
for (const turn of turns.slice(-8)) {
  const text = await copyTurn(turn);
  if (!text) continue;
  const key = turn.role + '\n' + compact(text);
  if (seen.has(key)) continue;
  seen.add(key);
  out.push({ role: turn.role, text });
  await api.sleep(100);
}
const merged = api.merge(out);
return merged.some(item => item.role === 'user') && merged.some(item => item.role === 'assistant') ? merged : [];
  };
  scripts["deepseek.js"] = scripts["deepseek"];
  scripts["grok"] = async function(api) {
const site = "grok";
const root = api.qs('main,[role="main"]') || document.body || document.documentElement;
const copyOptions = {
  resetClipboardBeforeCopy: true,
  acceptUnchangedClipboard: false,
  copyTimeoutMs: 2200,
  copyPollMs: 40,
  copyCaptureGraceMs: 260
};
const normalize = value => api.normalize(String(value || ''));
const isCopyProbe = value => /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || '')) || /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(normalize(value));
const qsa = (selector, scope = document) => {
  try { return api.qsa(selector, scope || document, { all: true }); } catch (error) { return []; }
};
const closest = (node, selector) => {
  try { return api.closest ? api.closest(node, selector) : node && node.closest && node.closest(selector); } catch (error) { return null; }
};
const rectOf = node => {
  try {
    const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch (error) { return null; }
};
const visible = node => {
  try {
    const rect = rectOf(node);
    if (!rect) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
  } catch (error) { return !!(api.visible && api.visible(node)); }
};
const order = (a, b) => {
  try {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  } catch (error) { return 0; }
};
const classText = node => {
  const value = node && node.getAttribute && node.getAttribute('class') || node && node.className;
  return typeof value === 'string' ? value : value && value.baseVal || '';
};
const attrRefText = (node, attr) => {
  try {
    return String(node && node.getAttribute && node.getAttribute(attr) || '')
      .split(/\s+/)
      .map(id => id && node.ownerDocument && node.ownerDocument.getElementById(id))
      .filter(Boolean)
      .map(el => el.innerText || el.textContent || '')
      .join(' ');
  } catch (error) { return ''; }
};
const meta = node => normalize([
  node && node.tagName,
  classText(node),
  node && node.getAttribute && node.getAttribute('role'),
  node && node.getAttribute && node.getAttribute('aria-label'),
  attrRefText(node, 'aria-labelledby'),
  attrRefText(node, 'aria-describedby'),
  node && node.getAttribute && node.getAttribute('aria-description'),
  node && node.getAttribute && node.getAttribute('title'),
  node && node.getAttribute && node.getAttribute('data-tooltip'),
  node && node.getAttribute && node.getAttribute('data-testid'),
  node && node.getAttribute && node.getAttribute('data-test-id'),
  node && node.textContent,
  node && node.innerText
].filter(Boolean).join(' '));
const svgSignature = node => normalize([node, ...qsa('svg,path,rect,line,polyline,polygon,use,img,[data-icon],[class]', node).slice(0, 80)].map(el => [
  classText(el),
  el && el.getAttribute && el.getAttribute('data-icon'),
  el && el.getAttribute && el.getAttribute('aria-label'),
  el && el.getAttribute && el.getAttribute('title'),
  el && el.getAttribute && el.getAttribute('alt'),
  el && el.getAttribute && el.getAttribute('src'),
  el && el.getAttribute && el.getAttribute('href'),
  el && el.getAttribute && el.getAttribute('xlink:href'),
  el && el.getAttribute && el.getAttribute('viewBox'),
  el && el.getAttribute && el.getAttribute('d'),
  el && el.getAttribute && el.getAttribute('x'),
  el && el.getAttribute && el.getAttribute('y'),
  el && el.getAttribute && el.getAttribute('width'),
  el && el.getAttribute && el.getAttribute('height')
].filter(Boolean).join(' ')).join(' ')).toLowerCase();
const explicitCopy = button => /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content_copy|copy_all|file_copy/i.test(meta(button));
const codeOrLinkCopy = button => /copy\s*(?:code|table|link|conversation|source|sources|url)|copy[-_ ]?(?:code|table|link|conversation|source|sources|url)|复制(?:代码|表格|链接|会话|来源|引用)/i.test(meta(button));
const looksCopyIcon = button => {
  const text = svgSignature(button);
  if (!text) return false;
  if (/copy|clipboard|content_copy|copy_all|file_copy|lucide-copy|tabler-icon-copy|copy[-_ ]?(?:icon|line|fill)|heroicons.*clipboard|mingcute.*copy|carbon.*copy/.test(text)) return true;
  if (/0 0 (16|18|20) (16|18|20)/.test(text) && /(m12\.668\s*10\.667c|m12\.66810\.667c|m13\.998\s*12\.665c|m13\.99812\.665c|m6\.14929\s*4\.02032c|m6\.149294\.02032c|m9\.80164\s*0\.367975c|m9\.801640\.367975c)/.test(text)) return true;
  if (/0 0 24 24/.test(text) && (/\bm\s*(4|6|7|8|9)\s*(4|6|7|8|9)\b/.test(text) || /\bx\s*=\s*(4|6|7|8|9)\b/.test(text)) && (/\bh\s*(8|9|10|12|14)\b|\bv\s*(8|9|10|12|14)\b|width=(8|9|10|12|14)|height=(8|9|10|12|14)/.test(text))) return true;
  const rects = qsa('rect', button).filter(rect => Number(rect.getAttribute('width') || 0) >= 7 && Number(rect.getAttribute('height') || 0) >= 7);
  return rects.length >= 2;
};
const isSmallIconButton = button => {
  const rect = rectOf(button);
  if (!rect || rect.width < 12 || rect.height < 12 || rect.width > 76 || rect.height > 76) return false;
  const label = normalize(meta(button)).toLowerCase();
  const textOnly = normalize(button && (button.innerText || button.textContent) || '');
  return !!qsa('svg,img,[data-icon]', button).length && textOnly.length <= 32 && !/(send|ask anything|message|search|deepthink|model|attach|upload|voice|home|new chat|sidebar|fullscreen|reload|menu|more)/i.test(label);
};
const hoverCopyVisible = button => {
  if (visible(button)) return true;
  try {
    const style = getComputedStyle(button);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return explicitCopy(button) || looksCopyIcon(button) || !!qsa('svg,img,[data-icon]', button).length;
  } catch (error) { return false; }
};
const badButton = (button, role = '') => {
  if (!button || !(role === 'user' ? hoverCopyVisible(button) : visible(button))) return true;
  if (closest(button, 'nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]')) return true;
  const label = meta(button).toLowerCase();
  const blockedAction = /(?:link|share|history|source|sources|citation|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|retry|upload|voice|submit|send|model|attach|new chat|home page|fullscreen|reload|close|edit|delete|search|deepthink|imagine|project|pfp|profile|upgrade)|链接|分享|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|侧边栏|重新生成|上传|语音|提交|发送|编辑|删除|搜索/.test(label);
  if (blockedAction && !explicitCopy(button)) return true;
  if (codeOrLinkCopy(button)) return true;
  if (explicitCopy(button) || looksCopyIcon(button)) return false;
  return blockedAction;
};
const textOf = node => {
  try { return normalize(api.text ? api.text(node) : node && (node.innerText || node.textContent)); } catch (error) { return normalize(node && (node.innerText || node.textContent)); }
};
const uiLine = /^(?:Copy|Copied|Copy prompt|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
const cleanCopied = (value, role) => {
  let text = normalize(value).replace(/\r\n?/g, '\n').replace(/Show more\s*Show less/gi, '');
  const lines = text.split('\n').map(line => line.trim()).filter(line => line && !uiLine.test(line));
  text = normalize(lines.join('\n'));
  if (site === 'deepseek' && role === 'user') {
    const title = normalize((document.title || '').replace(/\s*[-–—|].*$/, ''));
    if (title && text.startsWith(title)) text = normalize(text.slice(title.length));
    text = normalize(text.replace(/^\s*(?:DeepSeek|DSeek|Instant)\b\s*/i, ''));
  }
  return text;
};
const useful = (value, role) => {
  const text = cleanCopied(value, role);
  if (isCopyProbe(value) || isCopyProbe(text)) return '';
  if (!text || text.length < 2 || text.length > 50000) return '';
  if (/^(?:copy|copied|复制|已复制|share|link)$/i.test(text)) return '';
  if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return '';
  if (/Simple Chat Hub|Summary Panel|pages checked,|No userscript messages found/i.test(text)) return '';
  if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(text)) return '';
  return text;
};
const compact = value => normalize(value).toLowerCase()
  .replace(/\[[^\]]+\]\([^)]*\)/g, '$1')
  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
const roughMatch = (copied, expected) => {
  const a = compact(copied);
  const b = compact(expected);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const size = Math.min(90, b.length);
  const parts = [b.slice(0, size), b.slice(Math.max(0, Math.floor(b.length / 2) - Math.floor(size / 2)), Math.floor(b.length / 2) + Math.floor(size / 2)), b.slice(-size)].filter(part => part.length >= 12);
  return parts.filter(part => a.includes(part)).length >= (b.length > 180 ? 2 : 1);
};
const addUnique = (list, item) => { if (item && item.nodeType === 1 && !list.includes(item)) list.push(item); };
const actionScopes = anchor => {
  const scopes = [];
  const add = node => {
    if (!node || node.nodeType !== 1 || node === document.documentElement || node === document.body) return;
    if (closest(node, 'nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]')) return;
    addUnique(scopes, node);
  };
  const base = anchor && (closest(anchor, '[data-message-author-role],article,[data-testid*=message],[data-testid*=conversation],[class*=message],[class*=Message],[class*=response],[class*=Response],.ds-message') || anchor);
  for (let node = base || anchor, depth = 0; node && depth < 9; node = node.parentElement, depth += 1) {
    add(node);
    add(node.previousElementSibling);
    add(node.nextElementSibling);
    const parent = node.parentElement;
    add(parent);
    if (parent) {
      add(parent.previousElementSibling);
      add(parent.nextElementSibling);
    }
  }
  add(anchor);
  return scopes;
};
const candidateButtons = (anchor, role = '') => {
  const anchorRect = rectOf(anchor);
  const selector = 'button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]';
  const items = [];
  const seen = new Set();
  const add = (button, baseScore) => {
    if (!button || seen.has(button) || badButton(button, role)) return;
    const rect = rectOf(button);
    if (!rect && role !== 'user') return;
    const copyish = explicitCopy(button) || looksCopyIcon(button);
    const allowSmallIcon = role !== 'user';
    const smallIcon = allowSmallIcon && isSmallIconButton(button);
    if (!copyish && !smallIcon) return;
    let score = baseScore + (copyish ? 0 : 45000);
    if (!rect) score += 25000;
    if (anchorRect && rect) {
      const far = rect.bottom < anchorRect.top - 260 || rect.top > anchorRect.bottom + 520 || rect.right < anchorRect.left - 220 || rect.left > anchorRect.right + 260;
      if (far) return;
      const vertical = Math.min(Math.abs(rect.top - anchorRect.bottom), Math.abs(rect.bottom - anchorRect.top), Math.abs(rect.top - anchorRect.top));
      score += vertical * 18 + Math.abs(rect.left - anchorRect.left);
      if (rect.top >= anchorRect.top - 24 && rect.top <= anchorRect.bottom + 180) score -= 1200;
    }
    if (explicitCopy(button)) score -= 10000;
    if (looksCopyIcon(button)) score -= 5000;
    seen.add(button);
    items.push({ button, score });
  };
  let index = 0;
  for (const scope of actionScopes(anchor)) {
    for (const button of [scope, ...qsa(selector, scope)]) add(button, index++);
  }
  if (anchorRect) {
    for (const button of qsa(selector, document)) add(button, 90000 + index++);
  }
  return items.sort((a, b) => a.score - b.score || order(a.button, b.button)).map(item => item.button);
};
const escapeMenus = async () => {
  try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })); } catch (error) {}
  await api.sleep(40);
};
const hoverElement = node => {
  if (!node || node.nodeType !== 1) return;
  let rect = rectOf(node);
  const x = rect ? Math.max(rect.left + 4, Math.min(rect.right - 4, rect.left + rect.width / 2)) : 0;
  const y = rect ? Math.max(rect.top + 4, Math.min(rect.bottom - 4, rect.top + rect.height / 2)) : 0;
  const mouse = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
  try {
    if (window.PointerEvent) {
      const pointer = { ...mouse, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 };
      node.dispatchEvent(new PointerEvent('pointerover', pointer));
      node.dispatchEvent(new PointerEvent('pointerenter', pointer));
      node.dispatchEvent(new PointerEvent('pointermove', pointer));
    }
    node.dispatchEvent(new MouseEvent('mouseenter', mouse));
    node.dispatchEvent(new MouseEvent('mouseover', mouse));
    node.dispatchEvent(new MouseEvent('mousemove', mouse));
  } catch (error) {}
};
const hoverTurn = async anchor => {
  try { api.reveal(anchor); } catch (error) {}
  const scopes = actionScopes(anchor).slice(0, 10);
  for (const scope of [anchor, ...scopes]) hoverElement(scope);
  await api.sleep(180);
  for (const scope of [anchor, ...scopes.slice(0, 5)]) hoverElement(scope);
  await api.sleep(120);
};
const copyTurn = async turn => {
  const anchor = turn.node;
  await hoverTurn(anchor);
  let buttons = candidateButtons(anchor, turn.role).slice(0, turn.role === 'user' ? 12 : 10);
  if (turn.role === 'user' && !buttons.length) {
    await hoverTurn(anchor);
    buttons = candidateButtons(anchor, turn.role).slice(0, 12);
  }
  const maxAttempts = turn.role === 'user' ? 1 : 2;
  const perRoleCopyOptions = turn.role === 'user'
    ? { ...copyOptions, copyTimeoutMs: 1200, copyCaptureGraceMs: 180 }
    : { ...copyOptions, copyTimeoutMs: 3200, copyCaptureGraceMs: 260 };
  for (const button of buttons) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt) await api.sleep(120);
      try { api.reveal(anchor); hoverElement(anchor); hoverElement(button); api.reveal(button); } catch (error) {}
      const raw = await api.copy(button, perRoleCopyOptions);
      const text = useful(raw, turn.role);
      if (text) {
        const matchesExpected = turn.expected && roughMatch(text, turn.expected);
        if (turn.role === 'user') {
          if (matchesExpected && text.length >= 2 && text.length <= 12000) return text;
        } else {
          if (matchesExpected) return text;
          if (text.length >= 12) return text;
        }
      }
      await escapeMenus();
    }
  }
  return '';
};
const looksMessageText = value => {
  const text = normalize(value);
  if (!text || text.length < 2 || text.length > 45000) return false;
  if (/^(?:Copy|Copied|Share|Like|Dislike|Search|DeepThink|Ask anything|Upgrade to SuperGrok|Cookie Settings)$/i.test(text)) return false;
  if (/Summary Panel|Simple Chat Hub|pages checked/i.test(text)) return false;
  return /[A-Za-z0-9\u4e00-\u9fff]/.test(text);
};
const thoughtLabel = value => {
  const match = normalize(value).match(/\bThought for\s+[^,。\n]{1,32}/i);
  return match ? normalize(match[0]) : '';
};
const turnKey = (role, node, expected = '') => role + '\n' + compact(expected || textOf(node));
const pushTurn = (turns, role, node, expected = '') => {
  if ((role !== 'user' && role !== 'assistant') || !node) return;
  const text = normalize(expected || textOf(node));
  if (!looksMessageText(text)) return;
  const key = turnKey(role, node, text);
  if (!key.trim()) return;
  if (turns.some(item => item.role === role && (item.node === node || item.node.contains && item.node.contains(node) || node.contains && node.contains(item.node)))) return;
  if (turns.some(item => turnKey(item.role, item.node, item.expected || '') === key)) return;
  turns.push({ role, node, expected: text });
};
const previousTextBlock = (anchor, marker) => {
  const markerRect = rectOf(marker || anchor);
  const candidates = [];
  for (const node of qsa('article,section,div,[role]', root)) {
    if (!visible(node) || node === anchor || node.contains(anchor) || closest(node, 'nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]')) continue;
    if (order(node, marker || anchor) >= 0) continue;
    const text = textOf(node);
    if (!looksMessageText(text) || /Thought for|Upgrade to SuperGrok|Ask anything/i.test(text)) continue;
    const rect = rectOf(node);
    if (markerRect && rect && rect.bottom > markerRect.top + 80) continue;
    const tooBroad = qsa('article,section,div,[role]', node).some(child => child !== node && looksMessageText(textOf(child)) && textOf(child).length >= Math.min(text.length * 0.65, text.length - 8));
    if (tooBroad && text.length > 300) continue;
    candidates.push({ node, rect, text });
  }
  candidates.sort((a, b) => {
    const ar = a.rect, br = b.rect;
    if (ar && br && Math.abs(ar.bottom - br.bottom) > 4) return br.bottom - ar.bottom;
    return order(a.node, b.node);
  });
  return candidates[0] || null;
};
const findDeepSeekTurns = () => {
  const turns = [];
  const assistants = qsa('.ds-assistant-message-main-content', root).filter(visible).sort(order);
  for (const assistant of assistants) {
    const assistantScope = closest(assistant, '.ds-message') || assistant;
    const container = assistantScope && assistantScope.parentElement || assistantScope;
    let userNode = null;
    for (let prev = container && container.previousElementSibling, count = 0; prev && count < 7; prev = prev.previousElementSibling, count += 1) {
      if (looksMessageText(textOf(prev))) { userNode = prev; break; }
    }
    if (!userNode) {
      const found = previousTextBlock(assistantScope, assistantScope);
      userNode = found && found.node;
    }
    if (userNode) pushTurn(turns, 'user', userNode);
    pushTurn(turns, 'assistant', assistantScope, textOf(assistant));
  }
  return turns;
};
const findGrokTurns = () => {
  const turns = [];
  const uniqueMarkers = nodes => {
    const out = [];
    const seen = new Set();
    for (const node of nodes.sort(order)) {
      const label = thoughtLabel(textOf(node));
      if (!/^Thought for\b/i.test(label)) continue;
      const rect = rectOf(node);
      const key = compact(label) + '|' + Math.round((rect && rect.top || 0) / 8);
      if (!key.trim() || seen.has(key)) continue;
      seen.add(key);
      out.push(node);
    }
    return out;
  };
  let markers = uniqueMarkers(qsa('button,[role=button]', root)
    .filter(node => visible(node) && textOf(node).length <= 120 && /^Thought for\b/i.test(thoughtLabel(textOf(node)))));
  if (!markers.length) {
    markers = uniqueMarkers(qsa('button,div,span,[role=button]', root)
      .filter(node => visible(node) && /\bThought for\b/i.test(textOf(node))));
  }
  if (!markers.length) {
    markers = uniqueMarkers(qsa('article,section,div,[role]', root)
      .filter(node => visible(node) && /\bThought for\b/i.test(textOf(node))));
  }
  const assistantSeen = new Set();
  for (const marker of markers.slice(0, 8)) {
    let assistantNode = marker;
    for (let node = marker; node && node !== root && node !== document.body; node = node.parentElement) {
      const text = textOf(node);
      if (text.length > 120 && /\bThought for\b/i.test(text) && !/Ask anything|Upgrade to SuperGrok|Home page|Notifications/i.test(text)) {
        assistantNode = node;
        break;
      }
    }
    const assistantKey = compact(textOf(assistantNode));
    if (!assistantKey || assistantSeen.has(assistantKey)) continue;
    assistantSeen.add(assistantKey);
    let userNode = null;
    for (let prev = assistantNode && assistantNode.previousElementSibling, count = 0; prev && count < 6; prev = prev.previousElementSibling, count += 1) {
      if (looksMessageText(textOf(prev)) && !/Thought for|Upgrade to SuperGrok|Ask anything/i.test(textOf(prev))) { userNode = prev; break; }
    }
    if (!userNode) {
      const found = previousTextBlock(assistantNode, marker);
      userNode = found && found.node;
    }
    if (userNode) pushTurn(turns, 'user', userNode);
    pushTurn(turns, 'assistant', assistantNode);
  }
  if (!turns.length) {
    const nodes = qsa('[data-message-author-role],article,[data-testid*=message],[data-testid*=conversation],[class*=message],[class*=Message],[class*=response],[class*=Response]', root)
      .filter(visible)
      .sort(order);
    for (const node of nodes) {
      const label = meta(node).toLowerCase();
      const role = /assistant|response|answer|bot|grok/.test(label) ? 'assistant' : /user|human|prompt|query|question/.test(label) ? 'user' : '';
      if (role) pushTurn(turns, role, node);
    }
  }
  return turns;
};
const looseCopySequence = async () => {
  const out = [];
  const seen = new Set();
  const buttons = candidateButtons(root).slice(0, 28);
  let index = 0;
  for (const button of buttons) {
    const roleText = meta(button);
    const role = /(assistant|response|answer|回答|回复)/i.test(roleText) ? 'assistant' : /(prompt|question|user|message|提问|用户)/i.test(roleText) ? 'user' : index % 2 === 0 ? 'user' : 'assistant';
    const raw = await api.copy(button, copyOptions);
    const text = useful(raw, role);
    if (!text) continue;
    const key = role + '\n' + compact(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ role, text });
    index += 1;
    if (out.some(item => item.role === 'user') && out.some(item => item.role === 'assistant')) break;
  }
  return api.merge(out);
};
let turns = site === 'deepseek' ? findDeepSeekTurns() : findGrokTurns();
turns = turns.filter((turn, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.role === turn.role && other.node !== turn.node && other.node.contains && other.node.contains(turn.node))).sort((a, b) => order(a.node, b.node));
const turnSeen = new Set();
turns = turns.filter(turn => {
  const key = turn.role + '\n' + compact(turn.expected || textOf(turn.node));
  if (!key.trim() || turnSeen.has(key)) return false;
  turnSeen.add(key);
  return true;
});
const out = [];
const seen = new Set();
for (const turn of turns.slice(-8)) {
  const text = await copyTurn(turn);
  if (!text) continue;
  const key = turn.role + '\n' + compact(text);
  if (seen.has(key)) continue;
  seen.add(key);
  out.push({ role: turn.role, text });
  await api.sleep(100);
}
const merged = api.merge(out);
return merged.some(item => item.role === 'user') && merged.some(item => item.role === 'assistant') ? merged : [];
  };
  scripts["grok.js"] = scripts["grok"];
  scripts["grok-dairoot"] = async function(api) {
const site = "grok";
const root = api.qs('main,[role="main"]') || document.body || document.documentElement;
const copyOptions = {
  resetClipboardBeforeCopy: true,
  acceptUnchangedClipboard: false,
  copyTimeoutMs: 2200,
  copyPollMs: 40,
  copyCaptureGraceMs: 260
};
const normalize = value => api.normalize(String(value || ''));
const isCopyProbe = value => /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || '')) || /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(normalize(value));
const qsa = (selector, scope = document) => {
  try { return api.qsa(selector, scope || document, { all: true }); } catch (error) { return []; }
};
const closest = (node, selector) => {
  try { return api.closest ? api.closest(node, selector) : node && node.closest && node.closest(selector); } catch (error) { return null; }
};
const rectOf = node => {
  try {
    const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch (error) { return null; }
};
const visible = node => {
  try {
    const rect = rectOf(node);
    if (!rect) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
  } catch (error) { return !!(api.visible && api.visible(node)); }
};
const order = (a, b) => {
  try {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  } catch (error) { return 0; }
};
const classText = node => {
  const value = node && node.getAttribute && node.getAttribute('class') || node && node.className;
  return typeof value === 'string' ? value : value && value.baseVal || '';
};
const attrRefText = (node, attr) => {
  try {
    return String(node && node.getAttribute && node.getAttribute(attr) || '')
      .split(/\s+/)
      .map(id => id && node.ownerDocument && node.ownerDocument.getElementById(id))
      .filter(Boolean)
      .map(el => el.innerText || el.textContent || '')
      .join(' ');
  } catch (error) { return ''; }
};
const meta = node => normalize([
  node && node.tagName,
  classText(node),
  node && node.getAttribute && node.getAttribute('role'),
  node && node.getAttribute && node.getAttribute('aria-label'),
  attrRefText(node, 'aria-labelledby'),
  attrRefText(node, 'aria-describedby'),
  node && node.getAttribute && node.getAttribute('aria-description'),
  node && node.getAttribute && node.getAttribute('title'),
  node && node.getAttribute && node.getAttribute('data-tooltip'),
  node && node.getAttribute && node.getAttribute('data-testid'),
  node && node.getAttribute && node.getAttribute('data-test-id'),
  node && node.textContent,
  node && node.innerText
].filter(Boolean).join(' '));
const svgSignature = node => normalize([node, ...qsa('svg,path,rect,line,polyline,polygon,use,img,[data-icon],[class]', node).slice(0, 80)].map(el => [
  classText(el),
  el && el.getAttribute && el.getAttribute('data-icon'),
  el && el.getAttribute && el.getAttribute('aria-label'),
  el && el.getAttribute && el.getAttribute('title'),
  el && el.getAttribute && el.getAttribute('alt'),
  el && el.getAttribute && el.getAttribute('src'),
  el && el.getAttribute && el.getAttribute('href'),
  el && el.getAttribute && el.getAttribute('xlink:href'),
  el && el.getAttribute && el.getAttribute('viewBox'),
  el && el.getAttribute && el.getAttribute('d'),
  el && el.getAttribute && el.getAttribute('x'),
  el && el.getAttribute && el.getAttribute('y'),
  el && el.getAttribute && el.getAttribute('width'),
  el && el.getAttribute && el.getAttribute('height')
].filter(Boolean).join(' ')).join(' ')).toLowerCase();
const explicitCopy = button => /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content_copy|copy_all|file_copy/i.test(meta(button));
const codeOrLinkCopy = button => /copy\s*(?:code|table|link|conversation|source|sources|url)|copy[-_ ]?(?:code|table|link|conversation|source|sources|url)|复制(?:代码|表格|链接|会话|来源|引用)/i.test(meta(button));
const looksCopyIcon = button => {
  const text = svgSignature(button);
  if (!text) return false;
  if (/copy|clipboard|content_copy|copy_all|file_copy|lucide-copy|tabler-icon-copy|copy[-_ ]?(?:icon|line|fill)|heroicons.*clipboard|mingcute.*copy|carbon.*copy/.test(text)) return true;
  if (/0 0 (16|18|20) (16|18|20)/.test(text) && /(m12\.668\s*10\.667c|m12\.66810\.667c|m13\.998\s*12\.665c|m13\.99812\.665c|m6\.14929\s*4\.02032c|m6\.149294\.02032c|m9\.80164\s*0\.367975c|m9\.801640\.367975c)/.test(text)) return true;
  if (/0 0 24 24/.test(text) && (/\bm\s*(4|6|7|8|9)\s*(4|6|7|8|9)\b/.test(text) || /\bx\s*=\s*(4|6|7|8|9)\b/.test(text)) && (/\bh\s*(8|9|10|12|14)\b|\bv\s*(8|9|10|12|14)\b|width=(8|9|10|12|14)|height=(8|9|10|12|14)/.test(text))) return true;
  const rects = qsa('rect', button).filter(rect => Number(rect.getAttribute('width') || 0) >= 7 && Number(rect.getAttribute('height') || 0) >= 7);
  return rects.length >= 2;
};
const isSmallIconButton = button => {
  const rect = rectOf(button);
  if (!rect || rect.width < 12 || rect.height < 12 || rect.width > 76 || rect.height > 76) return false;
  const label = normalize(meta(button)).toLowerCase();
  const textOnly = normalize(button && (button.innerText || button.textContent) || '');
  return !!qsa('svg,img,[data-icon]', button).length && textOnly.length <= 32 && !/(send|ask anything|message|search|deepthink|model|attach|upload|voice|home|new chat|sidebar|fullscreen|reload|menu|more)/i.test(label);
};
const hoverCopyVisible = button => {
  if (visible(button)) return true;
  try {
    const style = getComputedStyle(button);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return explicitCopy(button) || looksCopyIcon(button) || !!qsa('svg,img,[data-icon]', button).length;
  } catch (error) { return false; }
};
const badButton = (button, role = '') => {
  if (!button || !(role === 'user' ? hoverCopyVisible(button) : visible(button))) return true;
  if (closest(button, 'nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]')) return true;
  const label = meta(button).toLowerCase();
  const blockedAction = /(?:link|share|history|source|sources|citation|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|retry|upload|voice|submit|send|model|attach|new chat|home page|fullscreen|reload|close|edit|delete|search|deepthink|imagine|project|pfp|profile|upgrade)|链接|分享|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|侧边栏|重新生成|上传|语音|提交|发送|编辑|删除|搜索/.test(label);
  if (blockedAction && !explicitCopy(button)) return true;
  if (codeOrLinkCopy(button)) return true;
  if (explicitCopy(button) || looksCopyIcon(button)) return false;
  return blockedAction;
};
const textOf = node => {
  try { return normalize(api.text ? api.text(node) : node && (node.innerText || node.textContent)); } catch (error) { return normalize(node && (node.innerText || node.textContent)); }
};
const uiLine = /^(?:Copy|Copied|Copy prompt|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
const cleanCopied = (value, role) => {
  let text = normalize(value).replace(/\r\n?/g, '\n').replace(/Show more\s*Show less/gi, '');
  const lines = text.split('\n').map(line => line.trim()).filter(line => line && !uiLine.test(line));
  text = normalize(lines.join('\n'));
  if (site === 'deepseek' && role === 'user') {
    const title = normalize((document.title || '').replace(/\s*[-–—|].*$/, ''));
    if (title && text.startsWith(title)) text = normalize(text.slice(title.length));
    text = normalize(text.replace(/^\s*(?:DeepSeek|DSeek|Instant)\b\s*/i, ''));
  }
  return text;
};
const useful = (value, role) => {
  const text = cleanCopied(value, role);
  if (isCopyProbe(value) || isCopyProbe(text)) return '';
  if (!text || text.length < 2 || text.length > 50000) return '';
  if (/^(?:copy|copied|复制|已复制|share|link)$/i.test(text)) return '';
  if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return '';
  if (/Simple Chat Hub|Summary Panel|pages checked,|No userscript messages found/i.test(text)) return '';
  if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(text)) return '';
  return text;
};
const compact = value => normalize(value).toLowerCase()
  .replace(/\[[^\]]+\]\([^)]*\)/g, '$1')
  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
const roughMatch = (copied, expected) => {
  const a = compact(copied);
  const b = compact(expected);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const size = Math.min(90, b.length);
  const parts = [b.slice(0, size), b.slice(Math.max(0, Math.floor(b.length / 2) - Math.floor(size / 2)), Math.floor(b.length / 2) + Math.floor(size / 2)), b.slice(-size)].filter(part => part.length >= 12);
  return parts.filter(part => a.includes(part)).length >= (b.length > 180 ? 2 : 1);
};
const addUnique = (list, item) => { if (item && item.nodeType === 1 && !list.includes(item)) list.push(item); };
const actionScopes = anchor => {
  const scopes = [];
  const add = node => {
    if (!node || node.nodeType !== 1 || node === document.documentElement || node === document.body) return;
    if (closest(node, 'nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]')) return;
    addUnique(scopes, node);
  };
  const base = anchor && (closest(anchor, '[data-message-author-role],article,[data-testid*=message],[data-testid*=conversation],[class*=message],[class*=Message],[class*=response],[class*=Response],.ds-message') || anchor);
  for (let node = base || anchor, depth = 0; node && depth < 9; node = node.parentElement, depth += 1) {
    add(node);
    add(node.previousElementSibling);
    add(node.nextElementSibling);
    const parent = node.parentElement;
    add(parent);
    if (parent) {
      add(parent.previousElementSibling);
      add(parent.nextElementSibling);
    }
  }
  add(anchor);
  return scopes;
};
const candidateButtons = (anchor, role = '') => {
  const anchorRect = rectOf(anchor);
  const selector = 'button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]';
  const items = [];
  const seen = new Set();
  const add = (button, baseScore) => {
    if (!button || seen.has(button) || badButton(button, role)) return;
    const rect = rectOf(button);
    if (!rect && role !== 'user') return;
    const copyish = explicitCopy(button) || looksCopyIcon(button);
    const allowSmallIcon = role !== 'user';
    const smallIcon = allowSmallIcon && isSmallIconButton(button);
    if (!copyish && !smallIcon) return;
    let score = baseScore + (copyish ? 0 : 45000);
    if (!rect) score += 25000;
    if (anchorRect && rect) {
      const far = rect.bottom < anchorRect.top - 260 || rect.top > anchorRect.bottom + 520 || rect.right < anchorRect.left - 220 || rect.left > anchorRect.right + 260;
      if (far) return;
      const vertical = Math.min(Math.abs(rect.top - anchorRect.bottom), Math.abs(rect.bottom - anchorRect.top), Math.abs(rect.top - anchorRect.top));
      score += vertical * 18 + Math.abs(rect.left - anchorRect.left);
      if (rect.top >= anchorRect.top - 24 && rect.top <= anchorRect.bottom + 180) score -= 1200;
    }
    if (explicitCopy(button)) score -= 10000;
    if (looksCopyIcon(button)) score -= 5000;
    seen.add(button);
    items.push({ button, score });
  };
  let index = 0;
  for (const scope of actionScopes(anchor)) {
    for (const button of [scope, ...qsa(selector, scope)]) add(button, index++);
  }
  if (anchorRect) {
    for (const button of qsa(selector, document)) add(button, 90000 + index++);
  }
  return items.sort((a, b) => a.score - b.score || order(a.button, b.button)).map(item => item.button);
};
const escapeMenus = async () => {
  try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })); } catch (error) {}
  await api.sleep(40);
};
const hoverElement = node => {
  if (!node || node.nodeType !== 1) return;
  let rect = rectOf(node);
  const x = rect ? Math.max(rect.left + 4, Math.min(rect.right - 4, rect.left + rect.width / 2)) : 0;
  const y = rect ? Math.max(rect.top + 4, Math.min(rect.bottom - 4, rect.top + rect.height / 2)) : 0;
  const mouse = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
  try {
    if (window.PointerEvent) {
      const pointer = { ...mouse, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 };
      node.dispatchEvent(new PointerEvent('pointerover', pointer));
      node.dispatchEvent(new PointerEvent('pointerenter', pointer));
      node.dispatchEvent(new PointerEvent('pointermove', pointer));
    }
    node.dispatchEvent(new MouseEvent('mouseenter', mouse));
    node.dispatchEvent(new MouseEvent('mouseover', mouse));
    node.dispatchEvent(new MouseEvent('mousemove', mouse));
  } catch (error) {}
};
const hoverTurn = async anchor => {
  try { api.reveal(anchor); } catch (error) {}
  const scopes = actionScopes(anchor).slice(0, 10);
  for (const scope of [anchor, ...scopes]) hoverElement(scope);
  await api.sleep(180);
  for (const scope of [anchor, ...scopes.slice(0, 5)]) hoverElement(scope);
  await api.sleep(120);
};
const copyTurn = async turn => {
  const anchor = turn.node;
  await hoverTurn(anchor);
  let buttons = candidateButtons(anchor, turn.role).slice(0, turn.role === 'user' ? 12 : 10);
  if (turn.role === 'user' && !buttons.length) {
    await hoverTurn(anchor);
    buttons = candidateButtons(anchor, turn.role).slice(0, 12);
  }
  const maxAttempts = turn.role === 'user' ? 1 : 2;
  const perRoleCopyOptions = turn.role === 'user'
    ? { ...copyOptions, copyTimeoutMs: 1200, copyCaptureGraceMs: 180 }
    : { ...copyOptions, copyTimeoutMs: 3200, copyCaptureGraceMs: 260 };
  for (const button of buttons) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt) await api.sleep(120);
      try { api.reveal(anchor); hoverElement(anchor); hoverElement(button); api.reveal(button); } catch (error) {}
      const raw = await api.copy(button, perRoleCopyOptions);
      const text = useful(raw, turn.role);
      if (text) {
        const matchesExpected = turn.expected && roughMatch(text, turn.expected);
        if (turn.role === 'user') {
          if (matchesExpected && text.length >= 2 && text.length <= 12000) return text;
        } else {
          if (matchesExpected) return text;
          if (text.length >= 12) return text;
        }
      }
      await escapeMenus();
    }
  }
  return '';
};
const looksMessageText = value => {
  const text = normalize(value);
  if (!text || text.length < 2 || text.length > 45000) return false;
  if (/^(?:Copy|Copied|Share|Like|Dislike|Search|DeepThink|Ask anything|Upgrade to SuperGrok|Cookie Settings)$/i.test(text)) return false;
  if (/Summary Panel|Simple Chat Hub|pages checked/i.test(text)) return false;
  return /[A-Za-z0-9\u4e00-\u9fff]/.test(text);
};
const thoughtLabel = value => {
  const match = normalize(value).match(/\bThought for\s+[^,。\n]{1,32}/i);
  return match ? normalize(match[0]) : '';
};
const turnKey = (role, node, expected = '') => role + '\n' + compact(expected || textOf(node));
const pushTurn = (turns, role, node, expected = '') => {
  if ((role !== 'user' && role !== 'assistant') || !node) return;
  const text = normalize(expected || textOf(node));
  if (!looksMessageText(text)) return;
  const key = turnKey(role, node, text);
  if (!key.trim()) return;
  if (turns.some(item => item.role === role && (item.node === node || item.node.contains && item.node.contains(node) || node.contains && node.contains(item.node)))) return;
  if (turns.some(item => turnKey(item.role, item.node, item.expected || '') === key)) return;
  turns.push({ role, node, expected: text });
};
const previousTextBlock = (anchor, marker) => {
  const markerRect = rectOf(marker || anchor);
  const candidates = [];
  for (const node of qsa('article,section,div,[role]', root)) {
    if (!visible(node) || node === anchor || node.contains(anchor) || closest(node, 'nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]')) continue;
    if (order(node, marker || anchor) >= 0) continue;
    const text = textOf(node);
    if (!looksMessageText(text) || /Thought for|Upgrade to SuperGrok|Ask anything/i.test(text)) continue;
    const rect = rectOf(node);
    if (markerRect && rect && rect.bottom > markerRect.top + 80) continue;
    const tooBroad = qsa('article,section,div,[role]', node).some(child => child !== node && looksMessageText(textOf(child)) && textOf(child).length >= Math.min(text.length * 0.65, text.length - 8));
    if (tooBroad && text.length > 300) continue;
    candidates.push({ node, rect, text });
  }
  candidates.sort((a, b) => {
    const ar = a.rect, br = b.rect;
    if (ar && br && Math.abs(ar.bottom - br.bottom) > 4) return br.bottom - ar.bottom;
    return order(a.node, b.node);
  });
  return candidates[0] || null;
};
const findDeepSeekTurns = () => {
  const turns = [];
  const assistants = qsa('.ds-assistant-message-main-content', root).filter(visible).sort(order);
  for (const assistant of assistants) {
    const assistantScope = closest(assistant, '.ds-message') || assistant;
    const container = assistantScope && assistantScope.parentElement || assistantScope;
    let userNode = null;
    for (let prev = container && container.previousElementSibling, count = 0; prev && count < 7; prev = prev.previousElementSibling, count += 1) {
      if (looksMessageText(textOf(prev))) { userNode = prev; break; }
    }
    if (!userNode) {
      const found = previousTextBlock(assistantScope, assistantScope);
      userNode = found && found.node;
    }
    if (userNode) pushTurn(turns, 'user', userNode);
    pushTurn(turns, 'assistant', assistantScope, textOf(assistant));
  }
  return turns;
};
const findGrokTurns = () => {
  const turns = [];
  const uniqueMarkers = nodes => {
    const out = [];
    const seen = new Set();
    for (const node of nodes.sort(order)) {
      const label = thoughtLabel(textOf(node));
      if (!/^Thought for\b/i.test(label)) continue;
      const rect = rectOf(node);
      const key = compact(label) + '|' + Math.round((rect && rect.top || 0) / 8);
      if (!key.trim() || seen.has(key)) continue;
      seen.add(key);
      out.push(node);
    }
    return out;
  };
  let markers = uniqueMarkers(qsa('button,[role=button]', root)
    .filter(node => visible(node) && textOf(node).length <= 120 && /^Thought for\b/i.test(thoughtLabel(textOf(node)))));
  if (!markers.length) {
    markers = uniqueMarkers(qsa('button,div,span,[role=button]', root)
      .filter(node => visible(node) && /\bThought for\b/i.test(textOf(node))));
  }
  if (!markers.length) {
    markers = uniqueMarkers(qsa('article,section,div,[role]', root)
      .filter(node => visible(node) && /\bThought for\b/i.test(textOf(node))));
  }
  const assistantSeen = new Set();
  for (const marker of markers.slice(0, 8)) {
    let assistantNode = marker;
    for (let node = marker; node && node !== root && node !== document.body; node = node.parentElement) {
      const text = textOf(node);
      if (text.length > 120 && /\bThought for\b/i.test(text) && !/Ask anything|Upgrade to SuperGrok|Home page|Notifications/i.test(text)) {
        assistantNode = node;
        break;
      }
    }
    const assistantKey = compact(textOf(assistantNode));
    if (!assistantKey || assistantSeen.has(assistantKey)) continue;
    assistantSeen.add(assistantKey);
    let userNode = null;
    for (let prev = assistantNode && assistantNode.previousElementSibling, count = 0; prev && count < 6; prev = prev.previousElementSibling, count += 1) {
      if (looksMessageText(textOf(prev)) && !/Thought for|Upgrade to SuperGrok|Ask anything/i.test(textOf(prev))) { userNode = prev; break; }
    }
    if (!userNode) {
      const found = previousTextBlock(assistantNode, marker);
      userNode = found && found.node;
    }
    if (userNode) pushTurn(turns, 'user', userNode);
    pushTurn(turns, 'assistant', assistantNode);
  }
  if (!turns.length) {
    const nodes = qsa('[data-message-author-role],article,[data-testid*=message],[data-testid*=conversation],[class*=message],[class*=Message],[class*=response],[class*=Response]', root)
      .filter(visible)
      .sort(order);
    for (const node of nodes) {
      const label = meta(node).toLowerCase();
      const role = /assistant|response|answer|bot|grok/.test(label) ? 'assistant' : /user|human|prompt|query|question/.test(label) ? 'user' : '';
      if (role) pushTurn(turns, role, node);
    }
  }
  return turns;
};
const looseCopySequence = async () => {
  const out = [];
  const seen = new Set();
  const buttons = candidateButtons(root).slice(0, 28);
  let index = 0;
  for (const button of buttons) {
    const roleText = meta(button);
    const role = /(assistant|response|answer|回答|回复)/i.test(roleText) ? 'assistant' : /(prompt|question|user|message|提问|用户)/i.test(roleText) ? 'user' : index % 2 === 0 ? 'user' : 'assistant';
    const raw = await api.copy(button, copyOptions);
    const text = useful(raw, role);
    if (!text) continue;
    const key = role + '\n' + compact(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ role, text });
    index += 1;
    if (out.some(item => item.role === 'user') && out.some(item => item.role === 'assistant')) break;
  }
  return api.merge(out);
};
let turns = site === 'deepseek' ? findDeepSeekTurns() : findGrokTurns();
turns = turns.filter((turn, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.role === turn.role && other.node !== turn.node && other.node.contains && other.node.contains(turn.node))).sort((a, b) => order(a.node, b.node));
const turnSeen = new Set();
turns = turns.filter(turn => {
  const key = turn.role + '\n' + compact(turn.expected || textOf(turn.node));
  if (!key.trim() || turnSeen.has(key)) return false;
  turnSeen.add(key);
  return true;
});
const out = [];
const seen = new Set();
for (const turn of turns.slice(-8)) {
  const text = await copyTurn(turn);
  if (!text) continue;
  const key = turn.role + '\n' + compact(text);
  if (seen.has(key)) continue;
  seen.add(key);
  out.push({ role: turn.role, text });
  await api.sleep(100);
}
const merged = api.merge(out);
return merged.some(item => item.role === 'user') && merged.some(item => item.role === 'assistant') ? merged : [];
  };
  scripts["grok-dairoot.js"] = scripts["grok-dairoot"];
  scripts["kagi"] = async function(api) {
const normalize = value => api.normalize(String(value || ""));
const root = api.qs('main,[role="main"]') || document.body || document.documentElement;
const qsa = (selector, scope = document) => {
  try { return api.qsa(selector, scope || document, { all: true }); } catch (error) { return []; }
};
const visible = node => {
  try {
    if (api.visible && !api.visible(node)) return false;
    const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return !!(rect && rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden");
  } catch (error) { return false; }
};
const order = (a, b) => {
  try {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  } catch (error) { return 0; }
};
const meta = node => normalize([
  node && node.tagName,
  node && node.getAttribute && node.getAttribute("aria-label"),
  node && node.getAttribute && node.getAttribute("title"),
  node && node.getAttribute && node.getAttribute("data-testid"),
  node && node.getAttribute && node.getAttribute("data-test-id"),
  node && node.textContent,
  node && node.innerText
].filter(Boolean).join(" "));
const messageCopyButton = button => /\bcopy\s+message\b|复制(?:消息|讯息)|拷贝(?:消息|讯息)/i.test(meta(button));
const referenceCopyButton = button => /\bcopy\s+(?:references?|sources?|citations?)\b|引用|来源|参考|citation|source/i.test(meta(button));
const internalTool = button => {
  try { return !!api.closest(button, 'nav,aside,header,footer,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]'); } catch (error) { return false; }
};
const referenceOnly = value => {
  const text = normalize(value);
  if (/^\s*(?:References|Sources|Citations|引用|来源|参考)\b/i.test(text)) return true;
  if (/^\s*\(?\d+\s+total\)?\s*$/i.test(text)) return true;
  if (/^\s*(?:https?:\/\/|[\w.-]+\.[a-z]{2,})(?:\s+\d+%)?\s*$/i.test(text)) return true;
  return false;
};
const useful = value => {
  const text = normalize(value);
  if (!text || text.length < 2 || text.length > 50000) return "";
  if (/^(?:copy|copied|copy message|复制|已复制|拷贝)$/i.test(text)) return "";
  if (referenceOnly(text)) return "";
  return text;
};
const buttons = qsa("button,[role=button]", root)
  .filter(button => visible(button) && !internalTool(button) && messageCopyButton(button) && !referenceCopyButton(button))
  .sort(order);
const out = [];
const seen = new Set();
for (const button of buttons.slice(0, 24)) {
  const role = out.length % 2 === 0 ? "user" : "assistant";
  const text = useful(await api.copy(button, {
    resetClipboardBeforeCopy: true,
    acceptUnchangedClipboard: false,
    copyTimeoutMs: 3600,
    copyPollMs: 50,
    copyCaptureGraceMs: 320
  }));
  if (!text) continue;
  const key = role + "\n" + text.toLowerCase().replace(/\s+/g, "");
  if (seen.has(key)) continue;
  seen.add(key);
  out.push({ role, text });
  await api.sleep(80);
}
const merged = api.merge(out);
return merged.some(item => item.role === "user") && merged.some(item => item.role === "assistant") ? merged : [];
  };
  scripts["kagi.js"] = scripts["kagi"];
  scripts["notion"] = async function(api) {
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
  };
  scripts["notion.js"] = scripts["notion"];
  scripts["lobehub"] = async function(api) {
const normalizeMeta = value => api.normalize(String(value || ""));
const cleanCopied = value => String(value || "")
  .replace(/\r\n/g, "\n")
  .replace(/\u00a0/g, " ")
  .replace(/[\t ]+\n/g, "\n")
  .replace(/\n[\t ]+/g, "\n")
  .trim();
const qsa = (selector, root = document) => {
  try { return api.qsa(selector, root, { all: true }); } catch (error) { return []; }
};
const closest = (element, selector) => {
  try { return api.closest(element, selector); } catch (error) { return null; }
};
const wrapperSelector = '.message-wrapper[data-message-id],[data-message-id].message-wrapper,[data-message-id]';
const hasAnyWrapper = () => !!document.querySelector(wrapperSelector);
const isBlankNewChatPage = () => {
  if (hasAnyWrapper()) return false;
  let pathname = "/";
  try { pathname = (new URL(location.href).pathname || "/").replace(/\/+$/, "") || "/"; } catch (error) {}
  const homeLike = pathname === "/" || pathname === "/chat" || pathname === "/agent" || /^\/agent\/[^/]+$/.test(pathname);
  const hasComposer = !!document.querySelector('textarea,[contenteditable="true"],[role="textbox"],input[type="text"]');
  const bodyText = normalizeMeta((document.title || "") + "\n" + String(document.body && document.body.innerText || "").slice(0, 2200));
  const blankSignals = /(?:Let.s get started|Start New Topic|Ask, search, or brainstorm|Create your own Bot Channel|Recents|Agents|Home\s*·\s*LobeHub)/i.test(bodyText);
  return hasComposer && (homeLike || blankSignals);
};
for (let wait = 0; wait < 6 && !hasAnyWrapper(); wait += 1) await api.sleep(120);
if (!hasAnyWrapper() && isBlankNewChatPage()) {
  console.debug("[Simple Chat Hub] LobeHub blank new chat page");
  return [];
}
const order = (a, b) => {
  try {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
  } catch (error) {
    return 0;
  }
};
const layoutBox = element => {
  try { return element && element.getBoundingClientRect ? element.getBoundingClientRect() : null; } catch (error) { return null; }
};
const isLaidOut = element => {
  if (!element) return false;
  try {
    const rect = layoutBox(element);
    const style = getComputedStyle(element);
    return !!(rect && rect.width > 2 && rect.height > 2 && style.display !== "none" && style.visibility !== "hidden");
  } catch (error) {
    return false;
  }
};
const actionExists = element => {
  if (!element) return false;
  try {
    if (element.disabled || element.getAttribute("aria-disabled") === "true") return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  } catch (error) {
    return true;
  }
};
const compact = value => cleanCopied(value).toLowerCase().replace(/\s+/g, " ").slice(0, 1600);
const meta = element => normalizeMeta([
  element && element.tagName,
  element && element.getAttribute && element.getAttribute("aria-label"),
  element && element.getAttribute && element.getAttribute("title"),
  element && element.getAttribute && element.getAttribute("data-testid"),
  element && element.getAttribute && element.getAttribute("data-test-id"),
  element && element.getAttribute && element.getAttribute("data-copy"),
  element && element.getAttribute && element.getAttribute("class"),
  element && element.textContent
].filter(Boolean).join(" "));
const iconMeta = element => normalizeMeta([element, ...qsa("svg,use,path,rect,[data-icon],[class]", element).slice(0, 40)].map(node => [
  node && node.getAttribute && node.getAttribute("class"),
  node && node.getAttribute && node.getAttribute("data-icon"),
  node && node.getAttribute && node.getAttribute("aria-label"),
  node && node.getAttribute && node.getAttribute("href"),
  node && node.getAttribute && node.getAttribute("xlink:href"),
  node && node.getAttribute && node.getAttribute("viewBox"),
  node && node.getAttribute && node.getAttribute("d")
].filter(Boolean).join(" ")).join(" "));
const roleOf = wrapper => {
  const attrs = ["data-message-role", "data-role", "data-author", "data-from", "data-sender"]
    .map(name => wrapper.getAttribute && wrapper.getAttribute(name))
    .filter(Boolean)
    .join(" ");
  if (/assistant|bot|model|lobe/i.test(attrs)) return "assistant";
  if (/user|human|me/i.test(attrs)) return "user";
  const className = String(wrapper.getAttribute && wrapper.getAttribute("class") || "");
  if (/(^|[-_\s])(assistant|bot|model)([-_\s]|$)/i.test(className)) return "assistant";
  if (/(^|[-_\s])(user|human)([-_\s]|$)/i.test(className)) return "user";
  if (wrapper.querySelector('img[alt*=\"Lobe\" i],img[alt*=\"assistant\" i],[class*=\"avatar\" i] img[alt*=\"AI\" i]')) return "assistant";
  const text = normalizeMeta(wrapper.innerText || wrapper.textContent || "");
  return /^Lobe AI\b/i.test(text) ? "assistant" : "user";
};
const hover = async element => {
  if (!element) return;
  try { element.scrollIntoView({ block: "center", inline: "nearest" }); } catch (error) { try { api.reveal(element); } catch (ignored) {} }
  try { api.reveal(element); } catch (error) {}
  try {
    const rect = layoutBox(element) || { left: 0, top: 0, width: 0, height: 0 };
    const eventBase = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, view: window };
    for (const target of [element, element.parentElement].filter(Boolean)) {
      if (window.PointerEvent) {
        target.dispatchEvent(new PointerEvent("pointerover", { ...eventBase, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        target.dispatchEvent(new PointerEvent("pointerenter", { ...eventBase, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        target.dispatchEvent(new PointerEvent("pointermove", { ...eventBase, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      }
      for (const type of ["mouseover", "mouseenter", "mousemove"]) target.dispatchEvent(new MouseEvent(type, eventBase));
    }
  } catch (error) {}
  await api.sleep(90);
};
const sameWrapper = (button, wrapper) => {
  const owner = closest(button, wrapperSelector);
  return !owner || owner === wrapper || wrapper.contains(button);
};
const nearWrapper = (button, wrapper) => {
  if (wrapper.contains(button)) return true;
  if (!sameWrapper(button, wrapper)) return false;
  const br = layoutBox(button);
  const wr = layoutBox(wrapper);
  if (!br || !wr || !br.width || !br.height || !wr.width || !wr.height) return false;
  const verticalOverlap = br.bottom >= wr.top - 24 && br.top <= wr.bottom + 60;
  const horizontalNear = br.right >= wr.left - 160 && br.left <= wr.right + 160;
  return verticalOverlap && horizontalNear;
};
const isCopyButton = (button, wrapper) => {
  if (!button || !sameWrapper(button, wrapper) || !actionExists(button)) return false;
  if (closest(button, 'pre,code,table,kbd,samp,a[href],[class*=\"code\" i],[class*=\"table\" i],[data-code-block]')) return false;
  const bits = meta(button) + " " + iconMeta(button);
  if (!/(?:^|\b)(copy|clipboard|content_copy|copy_all|file_copy|lucide-copy|复制|拷贝)(?:\b|$)/i.test(bits)) return false;
  if (/copy-link|copy url|copy source|copy table|copy code|copy permalink|复制链接|复制网址|复制来源|复制表格|复制代码/i.test(bits)) return false;
  return true;
};
const scoreCopyButton = (button, wrapper, role) => {
  if (!nearWrapper(button, wrapper) || !isCopyButton(button, wrapper)) return Infinity;
  let score = wrapper.contains(button) ? 0 : 900;
  const bits = meta(button) + " " + iconMeta(button);
  if (/lucide-copy|content_copy|copy_all|clipboard/i.test(bits)) score -= 160;
  if (closest(button, '[role=toolbar],.message-actions,[class*=\"action\" i],[class*=\"toolbar\" i]')) score -= 80;
  if (!isLaidOut(button)) score += 120;
  const text = normalizeMeta(button.innerText || button.textContent || "");
  if (text.length > 28) score += 120;
  try {
    const br = layoutBox(button);
    const wr = layoutBox(wrapper);
    if (br && wr && br.width && br.height) {
      score += Math.max(0, br.top - wr.bottom) / 4;
      score += Math.abs((br.top + br.bottom) / 2 - (wr.top + wr.bottom) / 2) / 18;
      if (role === "user") score += Math.max(0, wr.right - br.right) / 18;
      else score += Math.max(0, br.left - wr.right) / 24;
    }
  } catch (error) {}
  return score;
};
const candidateScopes = wrapper => {
  const scopes = [];
  const add = node => { if (node && node.nodeType === 1 && !scopes.includes(node)) scopes.push(node); };
  add(wrapper);
  let node = wrapper;
  for (let depth = 0; node && node !== document.body && depth < 3; depth += 1, node = node.parentElement) {
    add(node.parentElement);
    add(node.previousElementSibling);
    add(node.nextElementSibling);
  }
  return scopes.filter(Boolean).slice(0, 8);
};
const findCopyButton = async (wrapper, role) => {
  const selector = 'button,[role=button],[role=menuitem],div[tabindex],span[role=button]';
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await hover(wrapper);
    const seenButtons = new Set();
    const buttons = [];
    for (const scope of candidateScopes(wrapper)) {
      for (const button of qsa(selector, scope)) {
        if (seenButtons.has(button)) continue;
        seenButtons.add(button);
        const score = scoreCopyButton(button, wrapper, role);
        if (Number.isFinite(score)) buttons.push({ button, score });
      }
    }
    buttons.sort((a, b) => a.score - b.score || order(a.button, b.button));
    if (buttons[0]) return buttons[0].button;
    await api.sleep(90);
  }
  return null;
};
const useful = value => {
  const text = cleanCopied(value);
  if (!text || /^(?:copy|copied|copy text|copy response|复制|已复制|拷贝)$/i.test(text)) return "";
  if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return "";
  return text;
};
const collectWrappers = () => qsa(wrapperSelector, document)
  .filter(isLaidOut)
  .filter((element, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.contains(element)))
  .sort(order);
const scrollParent = element => {
  for (let node = element && element.parentElement; node && node !== document.body; node = node.parentElement) {
    try {
      const style = getComputedStyle(node);
      if (/(auto|scroll|overlay)/i.test(style.overflowY || style.overflow || "") && node.scrollHeight > node.clientHeight + 80) return node;
    } catch (error) {}
  }
  return document.scrollingElement || document.documentElement;
};
const getScrollTop = node => node === document.scrollingElement || node === document.documentElement || node === document.body ? window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0 : node.scrollTop;
const getClientHeight = node => node === document.scrollingElement || node === document.documentElement || node === document.body ? window.innerHeight : node.clientHeight;
const getScrollHeight = node => node === document.scrollingElement || node === document.documentElement || node === document.body ? Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) : node.scrollHeight;
const setScrollTop = async (node, top) => {
  try {
    if (node === document.scrollingElement || node === document.documentElement || node === document.body) window.scrollTo(0, top);
    else node.scrollTop = top;
  } catch (error) {}
  await api.sleep(170);
};
const turns = [];
const seen = new Set();
const processed = new Set();
const debug = [];
const pushCopied = (role, content) => {
  const key = role + "\n" + compact(content);
  if (!seen.has(key)) {
    seen.add(key);
    turns.push({ role, content });
  }
};
const processWrapper = async wrapper => {
  const id = wrapper.getAttribute("data-message-id") || "element-" + processed.size;
  if (processed.has(id)) return;
  processed.add(id);
  const role = roleOf(wrapper);
  if (role !== "user" && role !== "assistant") {
    debug.push({ id, role, reason: "role not recognized" });
    return;
  }
  const button = await findCopyButton(wrapper, role);
  if (!button) {
    debug.push({ id, role, reason: "copy button not found" });
    return;
  }
  let copied = "";
  try {
    await hover(wrapper);
    copied = await api.copy(button, { copyTimeoutMs: 6000, copyPollMs: 40, copyCaptureGraceMs: 260, resetClipboardBeforeCopy: true });
  } catch (error) {
    debug.push({ id, role, reason: String(error && error.message || error) });
    return;
  }
  const content = useful(copied);
  if (!content) {
    debug.push({ id, role, reason: "empty copy result" });
    return;
  }
  pushCopied(role, content);
  await api.sleep(60);
};
const processCurrentDom = async () => {
  for (const wrapper of collectWrappers()) await processWrapper(wrapper);
};
const firstWrappers = collectWrappers();
const scroller = scrollParent(firstWrappers[0]);
const savedTop = scroller ? getScrollTop(scroller) : 0;
try {
  if (scroller && getScrollHeight(scroller) > getClientHeight(scroller) + 120) {
    await setScrollTop(scroller, 0);
    let lastTop = -1;
    for (let step = 0; step < 34; step += 1) {
      await processCurrentDom();
      const top = getScrollTop(scroller);
      const maxTop = Math.max(0, getScrollHeight(scroller) - getClientHeight(scroller));
      if (top >= maxTop - 4) break;
      const nextTop = Math.min(maxTop, top + Math.max(320, Math.floor(getClientHeight(scroller) * 0.78)));
      if (Math.abs(nextTop - lastTop) < 3) break;
      lastTop = nextTop;
      await setScrollTop(scroller, nextTop);
    }
    await processCurrentDom();
  } else {
    await processCurrentDom();
  }
} finally {
  if (scroller) await setScrollTop(scroller, savedTop);
}
if (debug.length) console.debug("[Simple Chat Hub] LobeHub copy extraction", debug);
const merged = api.merge(turns);
if (merged.some(item => item.role === "user") && merged.some(item => item.role === "assistant")) return merged;
const nativeConversation = await api.extractNativeCopyConversation(document.body);
return nativeConversation && nativeConversation.length ? nativeConversation : [];
  };
  scripts["lobehub.js"] = scripts["lobehub"];
  scripts["typingmind"] = async function(api) {
const out=[];const seen=new Set;const norm=v=>api.normalize(String(v||''));const qsa=(sel,root=document)=>{try{return api.qsa(sel,root,{all:true})}catch{return[]}};const qs=(sel,root=document)=>{try{return api.qs(sel,root)}catch{return null}};const closest=(el,sel)=>{try{return api.closest(el,sel)}catch{return null}};const laidOut=el=>{if(!el)return false;try{const style=getComputedStyle(el);return style.display!=='none'&&style.visibility!=='hidden'}catch{return true}};const order=(a,b)=>{try{if(a===b)return 0;const pos=a.compareDocumentPosition(b);return pos&Node.DOCUMENT_POSITION_FOLLOWING?-1:pos&Node.DOCUMENT_POSITION_PRECEDING?1:0}catch{return 0}};const wrapperSelector='div[class*="message-index-"][class*="message-id-"]';const roots=[];const addRoot=node=>{const root=closest(node,wrapperSelector)||node;if(root&&!roots.includes(root))roots.push(root)};qsa('[data-element-id="user-message"],[data-element-id="response-block"]',document).forEach(addRoot);qsa(wrapperSelector,document).forEach(root=>{if(qs('[data-element-id="user-message"],[data-element-id="response-block"]',root)&&!roots.includes(root))roots.push(root)});const opts={copyButtonSelector:'[data-element-id="copy-message-button"]',copyButtonPattern:'copy-message-button|clipboard|copy',copyButtonIconFallback:false,copyButtonExcludePattern:'Copy code|Open in CodePen|Regenerate|List some more',copyTextExcludePattern:'^(Copy code|Open in CodePen|Regenerate|List some more)$',copyMenu:false,resetClipboardBeforeCopy:true,acceptUnchangedClipboard:false,copyTimeoutMs:7000,copyPollMs:40,copyCaptureGraceMs:260,matchMode:'anyUseful'};const sameTurn=(button,turn)=>{const owner=closest(button,wrapperSelector);if(owner)return owner===turn||turn.contains(owner)||owner.contains(turn);if(turn.contains(button))return true;try{const br=button.getBoundingClientRect(),tr=turn.getBoundingClientRect();return br.width>=0&&br.height>=0&&tr.width&&tr.height&&br.bottom>=tr.top-48&&br.top<=tr.bottom+96&&br.right>=tr.left-160&&br.left<=tr.right+160}catch{return false}};const isBadButton=button=>closest(button,'pre,code,[data-language],table,kbd,samp')||/Copy code|Open in CodePen|Regenerate|List some more/i.test(norm(button.innerText||button.textContent||''));const findButtons=async turn=>{api.reveal(turn);await api.sleep(220);let buttons=qsa('[data-element-id="copy-message-button"]',turn).filter(laidOut);if(!buttons.length)buttons=qsa('[data-element-id="copy-message-button"]',document).filter(button=>sameTurn(button,turn)&&laidOut(button));return buttons.filter(button=>!isBadButton(button)).sort(order)};for(const turn of roots.sort(order)){const user=qs('[data-element-id="user-message"]',turn);const assistant=qs('[data-element-id="response-block"]',turn);const role=user?'user':assistant?'assistant':'';if(!role)continue;const source=user||assistant;const expected=norm(source.innerText||source.textContent);const buttons=await findButtons(turn);if(!buttons.length)continue;const copied=await api.copyFirst(buttons,{expected,role,scope:turn,options:opts});const clean=norm(copied);if(clean){const key=role+'|'+clean.toLowerCase().replace(/\s+/g,'');if(!seen.has(key)){seen.add(key);out.push({role,text:clean})}}await api.sleep(80)}return api.merge(out);
  };
  scripts["typingmind.js"] = scripts["typingmind"];
  window.__CHATCLUB_SUMMARY_SCRIPTS__ = scripts;
  const SOURCE = "chatclub";
  const COPY_SOURCE = "chatclub-native-copy";
  const PAGE_SUMMARY_SOURCE = "chatclub-summary-userscript";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  function respond(source, id, action, data, error) {
    source?.postMessage({ source: SOURCE, type: "response", id, action, data, error }, "*");
  }

  const DEFAULT_SHORTCUT_CONFIG = {
    sendKeyMode: "enter",
    shortcuts: {
      focusInput: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyK" },
      newChat: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyN" },
      optimizePrompt: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyO" },
      openSummaryPanel: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyS" },
      openPocketPanel: { alt: false, shift: false, cmdOrCtrl: true, code: "KeyP" },
      closeChat: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyW" },
      reloadChat: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyR" },
      enterFullscreen: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyF" },
      insertPrompt: { alt: true, shift: false, cmdOrCtrl: false, codePattern: "Digit" },
      switchLayout: { alt: false, shift: true, cmdOrCtrl: true, codePattern: "Digit" },
      switchPlatformTab: { alt: false, shift: false, cmdOrCtrl: true, codePattern: "Digit" }
    }
  };
  const SHORTCUT_ACTIONS = [
    "focusInput",
    "newChat",
    "optimizePrompt",
    "openSummaryPanel",
    "openPocketPanel",
    "closeChat",
    "reloadChat",
    "enterFullscreen",
    "insertPrompt",
    "switchLayout",
    "switchPlatformTab"
  ];
  const PATTERN_ACTIONS = new Set(["insertPrompt", "switchLayout", "switchPlatformTab"]);
  let activeShortcutConfig = normalizeShortcutConfig(DEFAULT_SHORTCUT_CONFIG);

  function requestParent(action, data = {}, timeout = 1200) {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage, true);
        reject(new Error("Parent request timed out"));
      }, timeout);
      function onMessage(event) {
        const message = event.data;
        if (message?.source !== SOURCE || message.type !== "response" || message.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        message.error ? reject(new Error(message.error)) : resolve(message.data);
      }
      window.addEventListener("message", onMessage, true);
      window.parent.postMessage({ source: SOURCE, type: "request", action, id, data }, "*");
    });
  }

  function bool(value, fallback = false) {
    return value == null ? fallback : Boolean(value);
  }

  function normalizeShortcutConfig(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    const rawShortcuts = { ...(source.shortcuts || {}) };
    if (rawShortcuts.openSummary && !rawShortcuts.openSummaryPanel) rawShortcuts.openSummaryPanel = rawShortcuts.openSummary;
    const shortcuts = {};
    for (const action of SHORTCUT_ACTIONS) {
      const base = DEFAULT_SHORTCUT_CONFIG.shortcuts[action];
      const item = rawShortcuts[action] || {};
      shortcuts[action] = {
        disabled: Boolean(item.disabled),
        cmdOrCtrl: bool(item.cmdOrCtrl, Boolean(base.cmdOrCtrl)),
        alt: bool(item.alt, Boolean(base.alt)),
        shift: bool(item.shift, Boolean(base.shift))
      };
      if (PATTERN_ACTIONS.has(action)) shortcuts[action].codePattern = "Digit";
      else shortcuts[action].code = String(item.code || base.code || "");
    }
    return { ...DEFAULT_SHORTCUT_CONFIG, ...source, shortcuts };
  }

  function digitMatch(code) {
    return /^Digit([0-9])$/.exec(code || "") || /^Numpad([0-9])$/.exec(code || "");
  }

  function matchShortcut(event, config = activeShortcutConfig) {
    const shortcuts = normalizeShortcutConfig(config).shortcuts;
    const cmdOrCtrl = Boolean(event.metaKey || event.ctrlKey);
    for (const action of SHORTCUT_ACTIONS) {
      const shortcut = shortcuts[action];
      if (!shortcut || shortcut.disabled) continue;
      if (Boolean(shortcut.cmdOrCtrl) !== cmdOrCtrl) continue;
      if (Boolean(shortcut.alt) !== Boolean(event.altKey)) continue;
      if (Boolean(shortcut.shift) !== Boolean(event.shiftKey)) continue;
      if (PATTERN_ACTIONS.has(action)) {
        const match = digitMatch(event.code);
        if (match) return { action, matchObj: { digit: match[1] } };
      } else if (shortcut.code && shortcut.code === event.code) {
        return { action, matchObj: {} };
      }
    }
    return null;
  }

  async function loadShortcutConfig() {
    try {
      const parentConfig = await requestParent("getShortcutConfig", {}, 1400);
      activeShortcutConfig = normalizeShortcutConfig(parentConfig);
      return;
    } catch {}
    try {
      const stored = await chrome.storage.local.get("shortcutConfig");
      activeShortcutConfig = normalizeShortcutConfig(stored.shortcutConfig);
    } catch {}
  }

  function postShortcutTriggered(match) {
    window.parent.postMessage({
      source: SOURCE,
      type: "request",
      action: "shortcutTriggered",
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      data: match
    }, "*");
  }

  function visible(el) {
    if (!el?.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
  }

  function qsa(selector, root = document, options = {}) {
    try {
      const result = Array.from(root.querySelectorAll(selector));
      return options.all === false ? result.slice(0, 1) : result;
    } catch {
      return [];
    }
  }

  function qs(selector, root = document) {
    try { return root.querySelector(selector); } catch { return null; }
  }

  function closest(el, selector) {
    try { return el?.closest?.(selector) || null; } catch { return null; }
  }

  function text(el) {
    if (!el) return "";
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value || "";
    return el.innerText || el.textContent || "";
  }

  function reveal(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      for (const type of ["pointerover", "pointermove", "mouseover", "mousemove"]) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    } catch {}
  }

  function merge(messages) {
    const out = [];
    for (const message of messages || []) {
      const role = String(message?.role || "assistant").toLowerCase();
      const value = cleanCaptured(message?.text || message?.content || "");
      if (!value) continue;
      const previous = out[out.length - 1];
      if (previous && previous.role === role) previous.text = normalize(`${previous.text}\n\n${value}`);
      else out.push({ role, text: value });
    }
    return out;
  }

  function toRegex(value) {
    if (!value) return null;
    if (value instanceof RegExp) return value;
    try { return new RegExp(String(value), "i"); } catch { return null; }
  }

  function compareText(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, "");
  }

  function cleanCaptured(value) {
    return normalize(String(value || "")
      .replace(/Show more\s*Show less/gi, "")
      .replace(/^\s*(Show more|Show less|显示更多|收起)\s*$/gim, ""));
  }

  function pageLogoUrl() {
    const candidates = qsa("link[rel][href]", document)
      .map((link, index) => {
        const rel = normalize(link.getAttribute?.("rel") || "").toLowerCase();
        if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|mask-icon)(\s|$)/.test(rel)) return null;
        const href = link.getAttribute?.("href") || "";
        let url = "";
        try { url = href ? new URL(href, location.href).href : ""; } catch { return null; }
        if (!/^https?:\/\//i.test(url)) return null;
        const sizes = normalize(link.getAttribute?.("sizes") || "");
        const sizeScore = sizes.includes("32") ? 0 : sizes.includes("16") ? 1 : sizes.includes("180") ? 2 : 3;
        const type = normalize(link.getAttribute?.("type") || "").toLowerCase();
        const relScore = rel.includes("apple-touch-icon") ? 4 : rel.includes("mask-icon") ? 5 : rel.includes("icon") ? 0 : 3;
        const typeScore = type.includes("png") || type.includes("x-icon") || type.includes("icon") ? 0 : 1;
        return { url, score: relScore * 100 + sizeScore * 10 + typeScore, index };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || a.index - b.index);
    return candidates[0]?.url || "";
  }

  function pageMeta() {
    return {
      href: location.href,
      title: normalize(document.title || ""),
      logoUrl: pageLogoUrl()
    };
  }

  function copyLooksUseful(value) {
    const next = cleanCaptured(value);
    return Boolean(next
      && next.length >= 2
      && next.length <= 50000
      && !/^(copy|copied|复制|已复制|share|link)$/i.test(next)
      && !/^(https?:\/\/|mailto:|#)[^\s]{1,240}$/i.test(next));
  }

  function hasUserAndAssistant(messages) {
    return Array.isArray(messages)
      && messages.some((item) => item?.role === "user")
      && messages.some((item) => item?.role === "assistant");
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

  function classText(el) {
    const value = el?.getAttribute?.("class") || el?.className || "";
    return typeof value === "string" ? value : value?.baseVal || "";
  }

  function buttonText(el) {
    if (!el) return "";
    const labelledBy = String(el.getAttribute?.("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => id && document.getElementById(id))
      .filter(Boolean)
      .map((node) => node.innerText || node.textContent || "")
      .join(" ");
    return normalize([
      el.getAttribute?.("aria-label"),
      labelledBy,
      el.getAttribute?.("aria-description"),
      el.getAttribute?.("title"),
      el.getAttribute?.("data-tooltip"),
      el.getAttribute?.("data-testid"),
      el.getAttribute?.("data-test-id"),
      el.innerText || el.textContent || ""
    ].filter(Boolean).join(" "));
  }

  function userscriptMeta(el) {
    if (!el) return "";
    return normalize([
      el.tagName,
      classText(el),
      el.getAttribute?.("role"),
      buttonText(el),
      el.getAttribute?.("data-message-author-role")
    ].filter(Boolean).join(" "));
  }

  function matches(el, selector) {
    try { return Boolean(el?.matches?.(selector)); } catch { return false; }
  }

  function isNativeCopyButton(el) {
    return /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content_copy|copy_all|file_copy/i.test(userscriptMeta(el));
  }

  function svgSignature(el) {
    return normalize([el, ...qsa("svg,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", el).slice(0, 80)]
      .map((node) => [
        classText(node),
        node.getAttribute?.("data-icon"),
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.getAttribute?.("alt"),
        node.getAttribute?.("src"),
        node.getAttribute?.("href"),
        node.getAttribute?.("xlink:href"),
        node.getAttribute?.("viewBox"),
        node.getAttribute?.("d"),
        node.getAttribute?.("width"),
        node.getAttribute?.("height")
      ].filter(Boolean).join(" "))
      .join(" "))
      .toLowerCase();
  }

  function userscriptLooksLikeCopyIcon(el) {
    const signature = svgSignature(el);
    if (!signature) return false;
    if (/copy|clipboard|content_copy|copy_all|file_copy|lucide-copy|tabler-icon-copy|copy[-_ ]?(icon|line|fill)/i.test(signature)) return true;
    const rects = qsa("rect", el).filter((rect) => Number(rect.getAttribute("width") || 0) >= 7 && Number(rect.getAttribute("height") || 0) >= 7);
    return rects.length >= 2;
  }

  function internalTool(el) {
    return Boolean(closest(el, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]"));
  }

  function userscriptButtonOk(el, options = {}) {
    if (!el || internalTool(el)) return false;
    const meta = userscriptMeta(el);
    const exclude = toRegex(options.copyButtonExcludePattern);
    if (exclude?.test(meta)) return false;
    const include = toRegex(options.copyButtonPattern);
    if (include) return include.test(meta) || (options.copyButtonIconFallback !== false && userscriptLooksLikeCopyIcon(el));
    return isNativeCopyButton(el) || (options.copyButtonIconFallback !== false && userscriptLooksLikeCopyIcon(el));
  }

  function userscriptCopyRoots(el, options = {}) {
    const roots = [];
    const add = (node) => {
      if (node?.nodeType === 1 && node !== document.documentElement && !roots.includes(node)) roots.push(node);
    };
    add(el);
    if (options.expanded !== false) {
      for (let node = el, depth = 0; node && node !== document.body && depth < 6; node = node.parentElement, depth += 1) {
        add(node);
        add(node.previousElementSibling);
        add(node.nextElementSibling);
      }
    }
    return roots;
  }

  function userscriptFindCopyButtons(root = document.body, options = {}) {
    let rootRect = null;
    try { rootRect = root?.getBoundingClientRect?.(); } catch {}
    const selector = String(options.copyButtonSelector || "button,[role=button],[role=menuitem]").trim();
    const seen = new Set();
    const scored = [];
    const distanceScore = (candidate) => {
      if (!rootRect?.width || !rootRect?.height || !candidate?.getBoundingClientRect) return 0;
      let rect = null;
      try { rect = candidate.getBoundingClientRect(); } catch {}
      return rect?.width && rect?.height ? Math.abs(rect.top - rootRect.bottom) * 20 + Math.abs(rect.left - rootRect.left) : 0;
    };
    let order = 0;
    const add = (candidate, score) => {
      if (!candidate || seen.has(candidate)) return;
      if (!matches(candidate, selector) && candidate !== root) return;
      seen.add(candidate);
      if (userscriptButtonOk(candidate, options)) scored.push({ button: candidate, score: score + distanceScore(candidate) });
    };
    for (const copyRoot of userscriptCopyRoots(root, options)) {
      for (const candidate of [copyRoot, ...qsa(selector, copyRoot, { all: true })]) add(candidate, order++);
    }
    if (!scored.length && options.expanded !== false && rootRect?.width && rootRect?.height) {
      for (const candidate of qsa(selector, document, { all: true })) {
        if (seen.has(candidate) || internalTool(candidate)) continue;
        let rect = null;
        try { rect = candidate.getBoundingClientRect(); } catch {}
        if (!rect?.width || !rect?.height || rect.bottom < rootRect.top - 260 || rect.top > rootRect.bottom + 520) continue;
        add(candidate, 1000000 + order++);
      }
    }
    return scored.sort((a, b) => a.score - b.score || elementOrder(a.button, b.button)).map((item) => item.button);
  }

  function userscriptFindMenuButtons(root = document.body, options = {}) {
    const selector = String(options.copyMenuButtonSelector || "button[aria-haspopup],button[aria-expanded],[role=button][aria-haspopup],button,[role=button]").trim();
    const include = toRegex(options.copyMenuButtonPattern) || /(more|menu|actions|options|overflow|ellipsis|kebab|three dots|更多|操作|菜单|选项|•••|\.\.\.)/i;
    return qsa(selector, root, { all: true })
      .filter((button) => visible(button) && !internalTool(button) && include.test(userscriptMeta(button)))
      .sort(elementOrder);
  }

  function userscriptOpenCopyButtons(options = {}) {
    const selector = String(options.copyButtonSelector || "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]").trim();
    return qsa(selector, document, { all: true })
      .filter((button) => visible(button) && userscriptButtonOk(button, options))
      .sort(elementOrder);
  }

  function userscriptCloseMenus() {
    try { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true })); } catch {}
  }

  function copyMatches(copied, expected) {
    const copiedText = compareText(copied);
    const expectedText = compareText(expected);
    if (!expectedText) return true;
    if (!copiedText) return false;
    if (copiedText === expectedText || copiedText.includes(expectedText)) return true;
    if (expectedText.includes(copiedText) && copiedText.length >= Math.min(expectedText.length * 0.75, 240)) return true;
    return false;
  }

  function userscriptCopyAccepted(copied, expected, role, options = {}) {
    const value = cleanCaptured(copied);
    if (!copyLooksUseful(value)) return "";
    const exclude = toRegex(options.copyTextExcludePattern);
    if (exclude?.test(value)) return "";
    if (options.matchMode === "anyUseful" || !expected) return value;
    return copyMatches(value, expected) ? value : "";
  }

  function copyBridgeRequest(action, id, data = {}, timeout = 1000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage, true);
        resolve(null);
      }, timeout);
      const onMessage = (event) => {
        const message = event.data;
        if (message?.source === COPY_SOURCE && message.id === id && message.type === "response" && message.action === action) {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage, true);
          resolve(message.data || null);
        }
      };
      window.addEventListener("message", onMessage, true);
      window.postMessage({ source: COPY_SOURCE, type: "request", id, action, data }, "*");
    });
  }

  function parentClipboardRequest(action, id, data = {}, timeout = 700) {
    return new Promise((resolve) => {
      try {
        if (!window.parent || window.parent === window) return resolve(null);
        const timer = setTimeout(() => {
          window.removeEventListener("message", onMessage, true);
          resolve(null);
        }, timeout);
        const onMessage = (event) => {
          const message = event.data;
          if (message?.source === "chatclub-parent-clipboard" && message.type === "response" && message.action === action && message.id === id) {
            clearTimeout(timer);
            window.removeEventListener("message", onMessage, true);
            resolve(message.data || null);
          }
        };
        window.addEventListener("message", onMessage, true);
        window.parent.postMessage({ source: "chatclub-parent-clipboard", type: "request", action, id, data }, "*");
      } catch {
        resolve(null);
      }
    });
  }

  function pageSummaryRequest(config = {}) {
    return new Promise((resolve) => {
      const id = copyId();
      const ackTimeoutMs = Math.max(350, Math.min(1800, Number(config.userscriptFallbackDelayMs) || 900));
      const totalTimeoutMs = Math.max(5000, Math.min(45000, Number(config.userscriptTimeoutMs) || 15000));
      let acked = false;
      let done = false;
      const cleanup = () => {
        clearTimeout(ackTimer);
        clearTimeout(totalTimer);
        window.removeEventListener("message", onMessage, true);
      };
      const finish = (result) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(result);
      };
      const ackTimer = setTimeout(() => {
        if (!acked) finish({ ok: false, missing: true, messages: [], error: "Summary page-world runtime did not acknowledge the request." });
      }, ackTimeoutMs);
      const totalTimer = setTimeout(() => {
        finish({ ok: false, timeout: true, messages: [], error: "Summary page-world runtime timed out." });
      }, totalTimeoutMs);
      const onMessage = (event) => {
        const message = event.data;
        if (event.source !== window || message?.source !== PAGE_SUMMARY_SOURCE || message.id !== id || message.action !== "extract") return;
        if (message.type === "ack") {
          acked = true;
          clearTimeout(ackTimer);
          return;
        }
        if (message.type !== "response") return;
        const data = message.data || {};
        finish({
          ok: Boolean(message.ok),
          messages: Array.isArray(message.messages) ? message.messages : Array.isArray(data.messages) ? data.messages : [],
          rawMessageCount: data.rawMessageCount,
          hasUserAndAssistant: data.hasUserAndAssistant,
          error: message.error || data.error || ""
        });
      };
      window.addEventListener("message", onMessage, true);
      window.postMessage({ source: PAGE_SUMMARY_SOURCE, type: "request", action: "extract", id, data: { config } }, "*");
    });
  }

  async function parentClipboardText(id, timeout = 600) {
    const result = await parentClipboardRequest("read", id, {}, timeout);
    return result?.ok ? normalize(result.text || "") : "";
  }

  function copyId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function isCopyProbeText(value) {
    return /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || ""));
  }

  function activateElement(button) {
    button.focus?.();
    reveal(button);
    const init = { bubbles: true, cancelable: true, view: window };
    try {
      if (window.PointerEvent) {
        button.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 1 }));
        button.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 }));
      }
    } catch {}
    button.dispatchEvent(new MouseEvent("mousedown", init));
    button.dispatchEvent(new MouseEvent("mouseup", init));
    button.dispatchEvent(new MouseEvent("click", init));
    button.click?.();
  }

  async function copy(button, options = {}) {
    if (!button) return "";
    const copyTimeoutMs = Math.max(300, Math.min(10000, Number(options.copyTimeoutMs || options.timeoutMs) || 2600));
    const copyPollMs = Math.max(20, Math.min(150, Number(options.copyPollMs) || 50));
    const copyCaptureGraceMs = Math.max(80, Math.min(800, Number(options.copyCaptureGraceMs) || 240));
    const acceptUnchangedClipboard = Boolean(options.acceptUnchangedClipboard);
    const resetClipboardBeforeCopy = Boolean(options.resetClipboardBeforeCopy);
    const id = copyId();
    let before = "";
    let probe = "";
    let probeWritten = false;
    let captured = "";
    let capturedPriority = 0;
    let capturedAt = 0;
    try { before = normalize(await navigator.clipboard.readText()); } catch {}
    if (!before) before = await parentClipboardText(id, 500);
    if (resetClipboardBeforeCopy) {
      probe = `__sch_copy_probe_${id}__`;
      try {
        await navigator.clipboard.writeText(probe);
        before = probe;
        probeWritten = true;
      } catch {}
      if (!probeWritten) {
        const parentWrite = await parentClipboardRequest("write", id, { text: probe }, 700);
        if (parentWrite?.ok) {
          before = probe;
          probeWritten = true;
        }
      }
    }
    const onCapture = (event) => {
      const message = event.data;
      if (message?.source !== COPY_SOURCE || message.type !== "capture" || message.id !== id) return;
      const value = normalize(message.data?.text || "");
      const priority = Number(message.data?.priority) || 1;
      if (value && !isCopyProbeText(value) && priority >= capturedPriority) {
        captured = value;
        capturedPriority = priority;
        capturedAt = Date.now();
      }
    };
    window.addEventListener("message", onCapture, true);
    try {
      await copyBridgeRequest("install", id, { timeoutMs: copyTimeoutMs }, 900);
      try { activateElement(button); } catch { try { button.click?.(); } catch {} }
      for (let index = 0, max = Math.ceil(copyTimeoutMs / copyPollMs); index < max; index += 1) {
        await sleep(copyPollMs);
        if (captured && (capturedPriority >= 5 || Date.now() - capturedAt >= copyCaptureGraceMs)) break;
        try {
          const current = normalize(await navigator.clipboard.readText());
          if (current && current !== before && current !== probe && !isCopyProbeText(current)) {
            captured = current;
            capturedPriority = Math.max(capturedPriority, 6);
            break;
          }
        } catch {}
        const parentCurrent = await parentClipboardText(id, 250);
        if (parentCurrent && parentCurrent !== before && parentCurrent !== probe && !isCopyProbeText(parentCurrent)) {
          captured = parentCurrent;
          capturedPriority = Math.max(capturedPriority, 6);
          break;
        }
      }
      if (captured && captured !== probe && !isCopyProbeText(captured)) return cleanCaptured(captured);
      try {
        const after = normalize(await navigator.clipboard.readText());
        if (after && after !== before && after !== probe && !isCopyProbeText(after)) return cleanCaptured(after);
        if (after && acceptUnchangedClipboard && !probeWritten && !isCopyProbeText(after)) return cleanCaptured(after);
      } catch {}
      const parentAfter = await parentClipboardText(id, 700);
      if (parentAfter && parentAfter !== before && parentAfter !== probe && !isCopyProbeText(parentAfter)) return cleanCaptured(parentAfter);
      if (parentAfter && acceptUnchangedClipboard && !probeWritten && !isCopyProbeText(parentAfter)) return cleanCaptured(parentAfter);
      return "";
    } finally {
      window.removeEventListener("message", onCapture, true);
      await copyBridgeRequest("restore", id, {}, 900);
    }
  }

  async function copyFirst(buttons, params = {}) {
    const details = params || {};
    const options = details.options || details;
    for (const button of (buttons || []).slice(0, 12)) {
      const value = userscriptCopyAccepted(await copy(button, options), details.expected, details.role, options);
      if (value) return value;
    }
    if (details.scope && options.copyMenu !== false) {
      for (const menuButton of userscriptFindMenuButtons(details.scope, options).slice(0, 8)) {
        userscriptCloseMenus();
        reveal(menuButton);
        try { activateElement(menuButton); } catch {}
        await sleep(180);
        const value = await copyFirst(userscriptOpenCopyButtons(options).filter((button) => button !== menuButton && !menuButton.contains(button)), details);
        userscriptCloseMenus();
        if (value) return value;
      }
    }
    return "";
  }

  function userscriptRole(el, options = {}) {
    const nodes = [el, closest(el, "[data-message-author-role]")].filter(Boolean);
    let value = "";
    const attr = String(options.roleAttribute || "").trim();
    if (attr) {
      for (const node of nodes) value += `${node.getAttribute?.(attr) || ""} `;
    }
    value += nodes.map(userscriptMeta).join(" ");
    const userPattern = toRegex(options.userRolePattern);
    const assistantPattern = toRegex(options.assistantRolePattern);
    if (userPattern?.test(value)) return "user";
    if (assistantPattern?.test(value)) return "assistant";
    const role = String(closest(el, "[data-message-author-role]")?.getAttribute?.("data-message-author-role") || "").toLowerCase();
    return role === "user" || role === "assistant" ? role : null;
  }

  function fallbackRole(index, options = {}) {
    const sequence = options.roleFallbackSequence;
    if (sequence === "userFirst") return index % 2 === 0 ? "user" : "assistant";
    if (sequence === "assistantFirst") return index % 2 === 0 ? "assistant" : "user";
    if (sequence === "userThenAssistant") return index === 0 ? "user" : "assistant";
    if (sequence === "assistantOnly") return "assistant";
    if (sequence === "userOnly") return "user";
    if (Array.isArray(sequence)) return sequence[index % sequence.length] || null;
    return null;
  }

  function pushMessage(out, role, value, seen) {
    const text = cleanCaptured(value);
    if ((role !== "user" && role !== "assistant") || !text) return;
    const compact = compareText(text);
    const key = `${role}|${compact}`;
    if (seen.has(key)) return;
    const existing = out.find((item) => item.role === role && compareText(item.text) && (compareText(item.text).includes(compact) || compact.includes(compareText(item.text))));
    if (existing) {
      if (compact.length > compareText(existing.text).length) existing.text = text;
      seen.add(key);
      return;
    }
    seen.add(key);
    out.push({ role, text });
  }

  async function extractTurns(options = {}) {
    const rootSelector = String(options.rootSelector || "body").trim() || "body";
    const messageSelector = String(options.messageSelector || "").trim();
    if (!messageSelector) return [];
    const roots = qsa(rootSelector, document, { all: true }).filter(visible);
    const searchRoots = roots.length ? roots : [document.body || document.documentElement];
    const turns = [];
    for (const root of searchRoots) {
      for (const turn of qsa(messageSelector, root, { all: true }).filter(visible)) if (!turns.includes(turn)) turns.push(turn);
    }
    const out = [];
    const seen = new Set();
    let roleIndex = 0;
    for (const turn of turns.sort(elementOrder)) {
      let role = userscriptRole(turn, options) || fallbackRole(roleIndex, options);
      if (role !== "user" && role !== "assistant") continue;
      reveal(turn);
      await sleep(80);
      const expected = text(turn);
      const copied = await copyFirst(userscriptFindCopyButtons(turn, options), { expected, role, options, scope: turn });
      if (copied) {
        pushMessage(out, role, copied, seen);
        roleIndex += 1;
      }
    }
    return merge(out);
  }

  async function extractCopySequence(options = {}) {
    const out = [];
    const seen = new Set();
    const rootSelector = String(options.rootSelector || "body").trim() || "body";
    const roots = qsa(rootSelector, document, { all: true }).filter(visible);
    const searchRoots = roots.length ? roots : [document.body || document.documentElement];
    const buttons = [];
    const buttonSet = new Set();
    for (const root of searchRoots) {
      for (const button of userscriptFindCopyButtons(root, { ...options, expanded: false })) {
        if (!buttonSet.has(button)) {
          buttonSet.add(button);
          buttons.push(button);
        }
      }
    }
    buttons.sort(elementOrder);
    let roleIndex = 0;
    const maxButtons = Number(options.maxButtons) || 40;
    const accept = async (button, roleHint) => {
      const role = roleHint || userscriptRole(button, options) || fallbackRole(roleIndex, options);
      if (role !== "user" && role !== "assistant") return false;
      const value = userscriptCopyAccepted(await copy(button, options), "", role, { ...options, matchMode: "anyUseful" });
      if (!value) return false;
      pushMessage(out, role, value, seen);
      roleIndex += 1;
      return true;
    };
    for (const button of buttons.slice(0, maxButtons)) await accept(button);
    if (out.length < 2 && options.copyMenu !== false) {
      for (const root of searchRoots) {
        for (const menuButton of userscriptFindMenuButtons(root, options).slice(0, Math.min(maxButtons, 16))) {
          userscriptCloseMenus();
          reveal(menuButton);
          try { activateElement(menuButton); } catch {}
          await sleep(180);
          const roleHint = userscriptRole(menuButton, options) || fallbackRole(roleIndex, options);
          for (const button of userscriptOpenCopyButtons(options).filter((item) => item !== menuButton && !menuButton.contains(item)).slice(0, 8)) {
            if (await accept(button, roleHint)) break;
          }
          userscriptCloseMenus();
          if (out.length >= 2) break;
        }
      }
    }
    return merge(out);
  }

  function nodeTextForCopy(node) {
    if (!node?.cloneNode) return text(node);
    try {
      const clone = node.cloneNode(true);
      clone.querySelectorAll?.("button,svg,script,style,noscript,input,textarea,select,option,form,nav,aside,footer,header").forEach((el) => el.remove());
      return normalize(clone.innerText || clone.textContent || "");
    } catch {
      return text(node);
    }
  }

  function internalCopyScope(el) {
    return Boolean(closest(el, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]"));
  }

  function copyButtonRole(button, options = {}) {
    const roleNode = closest(button, "[data-message-author-role]");
    const role = String(roleNode?.getAttribute?.("data-message-author-role") || "").toLowerCase();
    if (role === "user" || role === "assistant") return role;
    const label = buttonText(button);
    if (/(response|answer|assistant|回答|答复|回复)/i.test(label)) return "assistant";
    if (/(message|prompt|question|user|提问|消息|问题)/i.test(label)) return "user";
    const userRe = toRegex(options.copyUserContextPattern) || /(you\s+said|user\s+said|human|prompt|question|用户|你说|提问)/i;
    const assistantRe = toRegex(options.copyAssistantContextPattern) || /(assistant\s+said|assistant|answer|response|回答|回复|助手)/i;
    for (let node = button, depth = 0; node && node !== document.body && depth < 7; node = node.parentElement, depth += 1) {
      const context = normalize([
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.innerText || node.textContent || ""
      ].filter(Boolean).join(" "));
      if (!context || context.length > 3500) continue;
      const hasUser = userRe.test(context);
      const hasAssistant = assistantRe.test(context);
      if (hasUser && !hasAssistant) return "user";
      if (hasAssistant && !hasUser) return "assistant";
    }
    return null;
  }

  function conversationCopyButtons(root = document.body) {
    const out = [];
    const seen = new Set();
    const selector = "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]";
    for (const button of qsa(selector, root || document, { all: true })) {
      if (seen.has(button) || closest(button, "nav,header,footer,form") || internalCopyScope(button)) continue;
      const meta = userscriptMeta(button);
      if (/(?:copy\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|upload|voice|submit|model)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交)/i.test(meta)) continue;
      if (!(isNativeCopyButton(button) || userscriptLooksLikeCopyIcon(button))) continue;
      seen.add(button);
      out.push(button);
    }
    return out.sort(elementOrder);
  }

  function nativeCopyDedup(a, b) {
    const left = compareText(a);
    const right = compareText(b);
    return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
  }

  function hoverCopyBadButton(button) {
    const meta = userscriptMeta(button);
    return /(?:copy\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:new chat|new conversation|history|sidebar|toggle sidebar|home page|open notifications|link|share|search|deepthink|send|ask|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|regenerate|upload|voice|submit|model|fullscreen|reload|close)|链接|分享|搜索|深度思考|发送|新聊天|新对话|历史|侧边栏|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交|全屏|刷新|关闭)/i.test(meta);
  }

  function hoverCopyRect(node) {
    try {
      const rect = node?.getBoundingClientRect?.();
      return rect?.width && rect?.height ? rect : null;
    } catch {
      return null;
    }
  }

  function hoverCopySmallIconButton(button) {
    const rect = hoverCopyRect(button);
    if (!rect || rect.width > 72 || rect.height > 72) return false;
    const label = buttonText(button);
    if (label && label.length > 24) return false;
    return Boolean(button.querySelector?.("svg,path,rect,use,img,i,[class]"));
  }

  function hoverCopyCandidateButtons(anchor, options = {}) {
    const found = [];
    const seen = new Set();
    const rootRect = hoverCopyRect(anchor);
    const selector = "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]";
    const add = (button, base) => {
      if (!button || seen.has(button) || internalCopyScope(button) || closest(button, "nav,header,footer,form,input,textarea,select,[contenteditable=true]")) return;
      seen.add(button);
      if (hoverCopyBadButton(button)) return;
      const rect = hoverCopyRect(button);
      if (!rect) return;
      let score = base;
      const copyish = isNativeCopyButton(button) || userscriptLooksLikeCopyIcon(button);
      if (!copyish && !hoverCopySmallIconButton(button)) return;
      if (rootRect) {
        if (rect.bottom < rootRect.top - 220 || rect.top > rootRect.bottom + 420) return;
        score += Math.abs(rect.top - rootRect.bottom) * 12 + Math.abs(rect.left - rootRect.left);
      }
      score += copyish ? 0 : 12000;
      found.push({ button, score });
    };
    for (const button of userscriptFindCopyButtons(anchor, { ...options, expanded: true })) add(button, -20000);
    let order = 0;
    for (const scope of userscriptCopyRoots(anchor, { expanded: true })) {
      for (const button of qsa(selector, scope, { all: true })) add(button, order++);
    }
    if (rootRect) {
      for (const button of qsa(selector, document, { all: true })) {
        const rect = hoverCopyRect(button);
        if (!rect || rect.bottom < rootRect.top - 220 || rect.top > rootRect.bottom + 420) continue;
        add(button, 50000 + order++);
      }
    }
    return found.sort((a, b) => a.score - b.score || elementOrder(a.button, b.button)).map((item) => item.button);
  }

  function hoverCopyAnchorRole(anchor, index) {
    const roleNode = closest(anchor, "[data-message-author-role]");
    const role = String(roleNode?.getAttribute?.("data-message-author-role") || anchor?.getAttribute?.("data-message-author-role") || "").toLowerCase();
    if (role === "user" || role === "assistant") return role;
    const meta = normalize([
      classText(anchor),
      anchor?.getAttribute?.("data-testid"),
      anchor?.getAttribute?.("aria-label")
    ].filter(Boolean).join(" "));
    if (/assistant|answer|response|bot|ai|model|ds-assistant/i.test(meta)) return "assistant";
    if (/user|human|question|query|ds-user/i.test(meta)) return "user";
    return index % 2 === 0 ? "user" : "assistant";
  }

  function hoverCopyAddAnchor(list, node) {
    if (!node || node.nodeType !== 1 || list.includes(node) || closest(node, "nav,header,footer,form,input,textarea,select,[contenteditable=true]")) return;
    const rect = hoverCopyRect(node);
    if (!rect || rect.width < 20 || rect.height < 8) return;
    const value = nodeTextForCopy(node);
    if (!value || value.length < 2 || value.length > 60000) return;
    if (/^(?:copy|copied|edit|share|like|dislike|ask anything|message|send|search)$/i.test(value)) return;
    list.push(node);
  }

  function hoverCopyMessageAnchors(root = document.body) {
    const anchors = [];
    for (const assistant of qsa(".ds-assistant-message-main-content", root || document, { all: true })) {
      const box = closest(assistant, ".ds-message") || assistant;
      let prev = box?.previousElementSibling;
      for (let index = 0; prev && index < 5; prev = prev.previousElementSibling, index += 1) {
        if (nodeTextForCopy(prev)) {
          hoverCopyAddAnchor(anchors, prev);
          break;
        }
      }
      hoverCopyAddAnchor(anchors, assistant);
    }
    for (const selector of ["[data-message-author-role]", "article", "[data-testid*=message]", "[data-testid*=conversation]", "[class*=message]", "[class*=Message]", "[class*=response]", "[class*=Response]", "[class*=prose]", "main section", "main div"]) {
      for (const node of qsa(selector, root || document, { all: true })) hoverCopyAddAnchor(anchors, node);
      if (anchors.length > 120) break;
    }
    const textCache = new Map();
    const cachedText = (node) => {
      if (!textCache.has(node)) textCache.set(node, nodeTextForCopy(node));
      return textCache.get(node) || "";
    };
    const specific = anchors.filter((node) => {
      const value = cachedText(node);
      if (!value) return false;
      return !anchors.some((other) => other !== node && node.contains?.(other) && cachedText(other).length >= Math.min(value.length * 0.55, 500) && hoverCopyRect(other));
    });
    return specific
      .sort((a, b) => {
        const ar = hoverCopyRect(a);
        const br = hoverCopyRect(b);
        return ar && br ? ar.top - br.top || ar.left - br.left : elementOrder(a, b);
      })
      .filter((node, index, list) => !list.slice(0, index).some((prev) => nativeCopyDedup(cachedText(prev), cachedText(node))));
  }

  async function extractHoverNativeCopyConversation(root = document.body) {
    const options = {
      copyButtonSelector: "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]",
      copyButtonPattern: "copy|copied|clipboard|复制|已复制|拷贝",
      copyButtonExcludePattern: "copy\\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|upload|voice|submit|model)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交",
      copyButtonIconFallback: true,
      expanded: true,
      roleFallbackSequence: "userFirst",
      matchMode: "anyUseful",
      resetClipboardBeforeCopy: true,
      acceptUnchangedClipboard: false,
      copyTimeoutMs: 6500,
      copyPollMs: 40,
      copyCaptureGraceMs: 380
    };
    const out = [];
    const seen = new Set();
    let roleIndex = 0;
    for (const anchor of hoverCopyMessageAnchors(root).slice(0, 60)) {
      const role = hoverCopyAnchorRole(anchor, roleIndex);
      const expected = nodeTextForCopy(anchor);
      if (role !== "user" && role !== "assistant") continue;
      reveal(anchor);
      await sleep(180);
      for (const button of hoverCopyCandidateButtons(anchor, options).slice(0, 14)) {
        const copied = await copy(button, options);
        const value = userscriptCopyAccepted(copied, expected, role, options);
        if (value) {
          pushMessage(out, role, value, seen);
          roleIndex += 1;
          break;
        }
        userscriptCloseMenus();
        await sleep(80);
      }
      if (hasUserAndAssistant(out)) break;
    }
    const messages = merge(out);
    return hasUserAndAssistant(messages) ? messages : null;
  }

  async function extractNativeCopyConversation(root = document.body) {
    let buttons = conversationCopyButtons(root || document.body);
    if (buttons.length < 2) {
      const hovered = await extractHoverNativeCopyConversation(root || document.body);
      if (hovered) return hovered;
      buttons = conversationCopyButtons(root || document.body);
    }
    if (buttons.length < 2) return null;
    const seenText = [];
    const items = [];
    const copyOptions = {
      resetClipboardBeforeCopy: true,
      acceptUnchangedClipboard: false,
      copyTimeoutMs: 6000,
      copyPollMs: 40,
      copyCaptureGraceMs: 300
    };
    for (const button of buttons.slice(0, 16)) {
      try { button.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
      reveal(button);
      const copied = cleanCaptured(await copy(button, copyOptions));
      if (!copyLooksUseful(copied) || seenText.some((item) => nativeCopyDedup(item, copied))) continue;
      seenText.push(copied);
      items.push({ role: copyButtonRole(button), text: copied });
    }
    if (items.length < 2) {
      const hovered = await extractHoverNativeCopyConversation(root || document.body);
      return hovered || null;
    }
    let fallback = "user";
    const out = [];
    const seen = new Set();
    for (const item of items) {
      let role = item.role;
      if (role !== "user" && role !== "assistant") role = fallback;
      fallback = role === "user" ? "assistant" : "user";
      pushMessage(out, role, item.text, seen);
    }
    const firstUser = out.findIndex((item) => item.role === "user");
    const messages = merge(firstUser > 0 ? out.slice(firstUser) : out);
    return hasUserAndAssistant(messages) ? messages : null;
  }

  function inputCandidates(selector) {
    const selectors = [
      selector,
      "textarea",
      "div[contenteditable='true'][role='textbox']",
      "div[contenteditable='true']",
      "input[type='text']"
    ].filter(Boolean);
    for (const sel of selectors) {
      const candidate = qsa(sel).filter(visible).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      if (candidate) return candidate;
    }
    return null;
  }

  async function setInputValue(target, value) {
    target.focus?.();
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.value = value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function submitCandidates(selector, input) {
    const buttons = [
      ...qsa(selector).filter(visible),
      ...qsa("button,[role='button']").filter(visible).filter((button) => /send|submit|发送|提交/i.test([
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        button.textContent
      ].filter(Boolean).join(" ")))
    ];
    if (!input) return buttons;
    const inputRect = input.getBoundingClientRect();
    return buttons.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return Math.abs(ar.top - inputRect.top) - Math.abs(br.top - inputRect.top);
    });
  }

  async function sendText(data) {
    const input = inputCandidates(data?.inputSelector);
    if (!input) throw new Error("Input element not found");
    await setInputValue(input, data.text || "");
    await sleep(80);
    const submit = submitCandidates(data?.sendButtonSelector, input)[0];
    if (submit) {
      submit.click?.();
      return { sent: true, method: "button" };
    }
    const keyInit = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent("keydown", keyInit));
    input.dispatchEvent(new KeyboardEvent("keyup", keyInit));
    return { sent: true, method: "enter" };
  }

  async function collectSummary(data) {
    const config = data?.config || {};
    const registry = window.__CHATCLUB_SUMMARY_SCRIPTS__ || {};
    const runner = registry[config.id] || registry[config.userscriptFile];
    if (!runner) return { messages: [] };
    const api = {
      config,
      sleep,
      normalize,
      qsa,
      qs,
      closest,
      visible,
      text,
      buttonText,
      reveal,
      merge,
      copy,
      copyFirst,
      extractCopySequence,
      extractNativeCopyConversation,
      extractDeepSeekNativeCopyMessages: extractNativeCopyConversation,
      extractGrokNativeCopyMessages: extractNativeCopyConversation,
      extractTurns,
      findCopyButtons: userscriptFindCopyButtons
    };
    const result = await runner(api);
    const messages = merge(Array.isArray(result) ? result : result?.messages || []);
    return {
      messages: hasUserAndAssistant(messages) ? messages : [],
      rawMessageCount: messages.length,
      hasUserAndAssistant: hasUserAndAssistant(messages)
    };
  }


  if (!window.__CHATCLUB_SUMMARY_PAGE_RUNTIME__) {
    window.__CHATCLUB_SUMMARY_PAGE_RUNTIME__ = true;
    window.addEventListener("message", async (event) => {
      const message = event.data;
      if (event.source !== window || message?.source !== PAGE_SUMMARY_SOURCE || message.type !== "request" || message.action !== "extract") return;
      window.postMessage({ source: PAGE_SUMMARY_SOURCE, type: "ack", action: "extract", id: message.id }, "*");
      try {
        const data = await collectSummary(message.data || {});
        window.postMessage({ source: PAGE_SUMMARY_SOURCE, type: "response", action: "extract", id: message.id, ok: true, data, messages: data?.messages || [] }, "*");
      } catch (error) {
        window.postMessage({ source: PAGE_SUMMARY_SOURCE, type: "response", action: "extract", id: message.id, ok: false, error: error?.message || String(error), data: { messages: [] }, messages: [] }, "*");
      }
    }, true);
  }
})();
