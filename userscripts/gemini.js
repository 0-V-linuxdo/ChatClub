// Built-in Summary userscript: Gemini (gemini)
// Source: Mod/assets/chunk-7dbf4e81.js :: SUMMARY_SITE_CONFIG_DEFAULTS
// Config version: 32; global config version: 60
// Hosts: gemini.google.com, *.gemini.google.com
// Path prefixes: (none)
// Run mode: default; timeout: 20000
// This is a Simple Chat Hub Summary bridge body, not a standalone browser userscript.

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
