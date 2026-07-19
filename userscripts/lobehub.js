// Built-in Summary userscript: LobeHub (lobehub)
// Source: Mod/assets/chunk-7dbf4e81.js :: SUMMARY_SITE_CONFIG_DEFAULTS
// Config version: 48; global config version: 60
// Hosts: app.lobehub.com, *.lobehub.com
// Path prefixes: /
// Run mode: serial; timeout: 36000
// This is a Simple Chat Hub Summary bridge body, not a standalone browser userscript.

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
