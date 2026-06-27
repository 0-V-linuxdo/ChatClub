// Built-in Summary userscript: Claude (claude)
// Source: Mod/assets/chunk-7dbf4e81.js :: SUMMARY_SITE_CONFIG_DEFAULTS
// Config version: 34; global config version: 60
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
