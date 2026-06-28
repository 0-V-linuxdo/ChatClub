// Built-in Summary userscript: Grok (grok)
// Source: Mod/assets/chunk-7dbf4e81.js :: SUMMARY_SITE_CONFIG_DEFAULTS
// Config version: 59; global config version: 65
// Hosts: grok.com, *.grok.com, grok.x.ai, *.grok.x.ai
// Path prefixes: (none)
// Run mode: pageWorldFirst; timeout: 36000
// This is a Simple Chat Hub Summary bridge body, not a standalone browser userscript.

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
