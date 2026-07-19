// Built-in Summary userscript: Grok (grok)
// Source: Mod/assets/chunk-7dbf4e81.js :: SUMMARY_SITE_CONFIG_DEFAULTS
// Config version: 64; global config version: 71
// Hosts: grok.com, *.grok.com, grok.x.ai, *.grok.x.ai
// Path prefixes: (none)
// Run mode: pageWorldFirst; timeout: 36000
// This is a Simple Chat Hub Summary bridge body, not a standalone browser userscript.

const root = api.qs('main,[role="main"]') || document.body || document.documentElement;
const controlSelector = "button,[role=button]";
const copyOptions = {
  resetClipboardBeforeCopy: true,
  acceptUnchangedClipboard: false,
  copyTimeoutMs: 3600,
  copyPollMs: 40,
  copyCaptureGraceMs: 320
};

const normalize = value => api.normalize(String(value || ""));
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
    // Grok keeps historical message actions at opacity: 0 until the turn is
    // hovered. They still have layout and are intentionally revealed before
    // copying, so opacity must not be treated as unavailable here.
    return style.display !== "none" && style.visibility !== "hidden";
  } catch (error) {
    try { return Boolean(api.visible && api.visible(node)); } catch { return false; }
  }
};
const order = (a, b) => {
  try {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  } catch (error) { return 0; }
};
const classText = node => {
  const value = node && node.getAttribute && node.getAttribute("class") || node && node.className;
  return typeof value === "string" ? value : value && value.baseVal || "";
};
const attrRefText = (node, attr) => {
  try {
    return String(node && node.getAttribute && node.getAttribute(attr) || "")
      .split(/\s+/)
      .map(id => id && node.ownerDocument && node.ownerDocument.getElementById(id))
      .filter(Boolean)
      .map(el => el.innerText || el.textContent || "")
      .join(" ");
  } catch (error) { return ""; }
};
const meta = node => normalize([
  node && node.tagName,
  classText(node),
  node && node.getAttribute && node.getAttribute("role"),
  node && node.getAttribute && node.getAttribute("aria-label"),
  attrRefText(node, "aria-labelledby"),
  attrRefText(node, "aria-describedby"),
  node && node.getAttribute && node.getAttribute("aria-description"),
  node && node.getAttribute && node.getAttribute("title"),
  node && node.getAttribute && node.getAttribute("data-tooltip"),
  node && node.getAttribute && node.getAttribute("data-testid"),
  node && node.getAttribute && node.getAttribute("data-test-id"),
  node && node.textContent,
  node && node.innerText
].filter(Boolean).join(" "));
const svgSignature = node => normalize([node, ...qsa("svg,title,desc,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", node).slice(0, 80)].map(el => [
  classText(el),
  el && el.getAttribute && el.getAttribute("data-icon"),
  el && el.getAttribute && el.getAttribute("aria-label"),
  el && el.getAttribute && el.getAttribute("title"),
  el && el.getAttribute && el.getAttribute("alt"),
  el && el.getAttribute && el.getAttribute("src"),
  el && el.getAttribute && el.getAttribute("href"),
  el && el.getAttribute && el.getAttribute("xlink:href"),
  el && el.getAttribute && el.getAttribute("viewBox"),
  el && el.getAttribute && el.getAttribute("d"),
  el && el.textContent
].filter(Boolean).join(" ")).join(" ")).toLowerCase();
const actionSignature = node => normalize(meta(node) + " " + svgSignature(node)).toLowerCase();
const explicitCopy = button => /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content[_-]?copy|copy[_-]?all|file[_-]?copy/i.test(meta(button));
const nestedCopy = button => /copy\s*(?:code|table|link|conversation|source|sources|citation|citations|url)|copy[-_ ]?(?:code|table|link|conversation|source|sources|citation|citations|url)|复制(?:代码|表格|链接|会话|来源|引用)/i.test(meta(button));
const looksCopyIcon = button => {
  const text = svgSignature(button);
  if (!text) return false;
  if (/copy|clipboard|content[_-]?copy|copy[_-]?all|file[_-]?copy|lucide-copy|tabler-icon-copy|heroicons.*clipboard|mingcute.*copy|carbon.*copy/.test(text)) return true;
  if (/0 0 (16|18|20|24) (16|18|20|24)/.test(text) && /(m12\.668\s*10\.667c|m12\.66810\.667c|m13\.998\s*12\.665c|m13\.99812\.665c|m6\.14929\s*4\.02032c|m6\.149294\.02032c|m9\.80164\s*0\.367975c|m9\.801640\.367975c)/.test(text)) return true;
  const rects = qsa("rect", button).filter(rect => Number(rect.getAttribute("width") || 0) >= 7 && Number(rect.getAttribute("height") || 0) >= 7);
  return rects.length >= 2;
};
const editAction = control => /(?:^|[^a-z])(?:edit|edited|pencil|compose|modify|revise|square[-_ ]?pen|pen[-_ ]?line)(?:[^a-z]|$)|编辑|修改/.test(actionSignature(control));
const likeAction = control => {
  const signature = actionSignature(control);
  if (/(?:^|[^a-z])(?:dislike|disliked|thumbs?[-_ ]?down|downvote|negative)(?:[^a-z]|$)|点踩|踩|不喜欢/.test(signature)) return false;
  return /(?:^|[^a-z])(?:like|liked|unlike|thumbs?[-_ ]?up|upvote|positive)(?:[^a-z]|$)|点赞|取消点赞|赞/.test(signature);
};
const canonicalControl = control => {
  if (!control || !visible(control)) return false;
  return !qsa(controlSelector, control).some(child => child !== control && visible(child));
};
const pageChromeControl = control => Boolean(closest(control, "nav,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language],[data-code-block],[data-codeblock]"));
const messageCopyControl = control => {
  if (!canonicalControl(control) || pageChromeControl(control) || nestedCopy(control)) return false;
  return explicitCopy(control) || looksCopyIcon(control);
};
const sameActionRow = (left, right) => {
  const a = rectOf(left);
  const b = rectOf(right);
  if (!a || !b) return false;
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  const minHeight = Math.max(1, Math.min(a.height, b.height));
  const centerGap = Math.abs(a.top + a.height / 2 - b.top - b.height / 2);
  return overlap >= minHeight * 0.45 || centerGap <= Math.max(12, minHeight * 0.45);
};
const classifiedActionContext = (bar, copy, controls) => {
  if (!bar || controls.length < 2 || controls.length > 12) return null;
  const hasEdit = controls.some(control => control !== copy && editAction(control));
  const hasLike = controls.some(control => control !== copy && likeAction(control));
  if (hasEdit === hasLike) return null;
  return { bar, copy, controls, role: hasEdit ? "user" : "assistant" };
};
const actionContext = copy => {
  const exactBar = closest(copy, ".action-buttons,[data-testid*=action-buttons],[data-test-id*=action-buttons]");
  if (exactBar) {
    const exact = classifiedActionContext(exactBar, copy, qsa(controlSelector, exactBar).filter(canonicalControl));
    if (exact) return exact;
  }
  for (let scope = copy && copy.parentElement, depth = 0; scope && depth < 10; scope = scope.parentElement, depth += 1) {
    const controls = qsa(controlSelector, scope)
      .filter(canonicalControl)
      .filter(control => control === copy || sameActionRow(copy, control));
    const classified = classifiedActionContext(scope, copy, controls);
    if (classified) return classified;
    if (scope === root || scope === document.body || scope === document.documentElement) break;
  }
  return null;
};
const compact = value => normalize(value).toLowerCase()
  .replace(/\[[^\]]+\]\([^)]*\)/g, "$1")
  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
const isCopyProbe = value => /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || "")) || /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(normalize(value));
const uiLine = /^(?:Copy|Copied|Copy prompt|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|Worked for .*|思考了.*|工作了.*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
const cleanCopied = value => {
  const lines = normalize(value)
    .replace(/\r\n?/g, "\n")
    .replace(/Show more\s*Show less/gi, "")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !uiLine.test(line));
  return normalize(lines.join("\n"));
};
const useful = value => {
  const text = cleanCopied(value);
  if (isCopyProbe(value) || isCopyProbe(text)) return "";
  if (!text || text.length < 2 || text.length > 50000) return "";
  if (/^(?:copy|copied|复制|已复制|share|link)$/i.test(text)) return "";
  if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return "";
  if (/Simple Chat Hub|Summary Panel|pages checked,|No userscript messages found/i.test(text)) return "";
  return /[A-Za-z0-9\u4e00-\u9fff]/.test(text) ? text : "";
};
const stripUserPromptPrefix = (value, expected) => {
  const text = cleanCopied(value);
  const prompt = cleanCopied(expected);
  const promptKey = compact(prompt);
  if (!text || !promptKey) return text;
  if (compact(text) === promptKey) return "";
  if (text.toLowerCase().startsWith(prompt.toLowerCase())) {
    const stripped = cleanCopied(text.slice(prompt.length));
    if (stripped && compact(stripped) !== promptKey) return stripped;
  }
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  let consumed = "";
  let index = 0;
  while (index < Math.min(lines.length, 4)) {
    consumed = cleanCopied([consumed, lines[index]].filter(Boolean).join("\n"));
    const consumedKey = compact(consumed);
    if (consumedKey && (consumedKey === promptKey || promptKey.includes(consumedKey) || consumedKey.includes(promptKey))) {
      index += 1;
      if (consumedKey === promptKey || consumedKey.includes(promptKey)) break;
      continue;
    }
    break;
  }
  if (index > 0) {
    const stripped = cleanCopied(lines.slice(index).join("\n"));
    if (stripped && compact(stripped) !== promptKey) return stripped;
    if (!stripped) return "";
  }
  return text;
};
const escapeMenus = async () => {
  try { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true })); } catch (error) {}
  await api.sleep(40);
};
const hoverElement = node => {
  if (!node || node.nodeType !== 1) return;
  const rect = rectOf(node);
  const x = rect ? Math.max(rect.left + 4, Math.min(rect.right - 4, rect.left + rect.width / 2)) : 0;
  const y = rect ? Math.max(rect.top + 4, Math.min(rect.bottom - 4, rect.top + rect.height / 2)) : 0;
  const mouse = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
  try {
    if (window.PointerEvent) {
      const pointer = { ...mouse, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 };
      node.dispatchEvent(new PointerEvent("pointerover", pointer));
      node.dispatchEvent(new PointerEvent("pointerenter", pointer));
      node.dispatchEvent(new PointerEvent("pointermove", pointer));
    }
    node.dispatchEvent(new MouseEvent("mouseenter", mouse));
    node.dispatchEvent(new MouseEvent("mouseover", mouse));
    node.dispatchEvent(new MouseEvent("mousemove", mouse));
  } catch (error) {}
};
const revealForCopy = async action => {
  try { api.reveal(action.bar); } catch (error) {}
  for (let node = action.copy; node && node !== root && node !== document.body; node = node.parentElement) hoverElement(node);
  hoverElement(action.copy);
  await api.sleep(140);
  try { api.reveal(action.copy); } catch (error) {}
  hoverElement(action.copy);
};
const messageActions = () => {
  const actions = [];
  const seenBars = new Set();
  for (const copy of qsa(controlSelector, root).filter(messageCopyControl).sort(order)) {
    const action = actionContext(copy);
    if (!action || seenBars.has(action.bar)) continue;
    seenBars.add(action.bar);
    actions.push(action);
  }
  return actions.sort((a, b) => order(a.copy, b.copy));
};
const copyActionText = async (action, lastUser = "") => {
  const attempts = action.role === "assistant" ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt) await api.sleep(140);
    await revealForCopy(action);
    const raw = await api.copy(action.copy, action.role === "assistant" ? copyOptions : { ...copyOptions, copyTimeoutMs: 2200, copyCaptureGraceMs: 220 });
    let text = useful(raw);
    if (action.role === "assistant") {
      text = stripUserPromptPrefix(text, lastUser);
      if (lastUser && compact(text) === compact(lastUser)) text = "";
    }
    if (text && (action.role === "user" ? text.length <= 12000 : text.length >= 2)) return text;
    await escapeMenus();
  }
  return "";
};

const out = [];
let lastUser = "";
for (const action of messageActions().slice(-24)) {
  const text = await copyActionText(action, action.role === "assistant" ? lastUser : "");
  if (!text) continue;
  out.push({ role: action.role, text });
  if (action.role === "user") lastUser = text;
  if (out.length >= 12) break;
  await api.sleep(80);
}
const merged = api.merge(out);
return merged.some(item => item.role === "user") && merged.some(item => item.role === "assistant") ? merged : [];
