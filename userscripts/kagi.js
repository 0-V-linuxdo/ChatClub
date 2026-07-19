// Built-in Summary userscript: Kagi Assistant (kagi)
// Source: Mod/assets/chunk-7dbf4e81.js :: SUMMARY_SITE_CONFIG_DEFAULTS
// Config version: 65; global config version: 72
// Hosts: assistant.kagi.com
// Path prefixes: (none)
// Run mode: serial; timeout: 32000
// This is a Simple Chat Hub Summary bridge body, not a standalone browser userscript.

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
const messageOwner = button => {
  try {
    return api.closest(button, "article.message-user,article.message-ai,[data-message-author-role],article") || button;
  } catch (error) { return button; }
};
const messageRole = (owner, index) => {
  const explicit = normalize(owner && owner.getAttribute && owner.getAttribute("data-message-author-role")).toLowerCase();
  if (explicit === "user" || explicit === "assistant") return explicit;
  const signature = normalize([
    owner && owner.getAttribute && owner.getAttribute("class"),
    owner && owner.getAttribute && owner.getAttribute("data-testid"),
    owner && owner.getAttribute && owner.getAttribute("aria-label")
  ].filter(Boolean).join(" ")).toLowerCase();
  if (/(?:^|\s)message-user(?:\s|$)|\buser[-_ ]message\b/.test(signature)) return "user";
  if (/(?:^|\s)message-ai(?:\s|$)|\b(?:assistant|ai)[-_ ]message\b/.test(signature)) return "assistant";
  return index % 2 === 0 ? "user" : "assistant";
};
const buttons = qsa("button,[role=button]", root)
  .filter(button => visible(button) && !internalTool(button) && messageCopyButton(button) && !referenceCopyButton(button))
  .sort(order);
const actions = [];
const seenOwners = new Set();
for (const button of buttons) {
  const owner = messageOwner(button);
  if (seenOwners.has(owner)) continue;
  seenOwners.add(owner);
  actions.push({ button, owner });
}
const out = [];
for (const [index, action] of actions.slice(0, 24).entries()) {
  const { button, owner } = action;
  const role = messageRole(owner, index);
  const text = useful(await api.copy(button, {
    resetClipboardBeforeCopy: true,
    acceptUnchangedClipboard: false,
    copyTimeoutMs: 3600,
    copyPollMs: 50,
    copyCaptureGraceMs: 320
  }));
  if (!text) continue;
  out.push({ role, text });
  await api.sleep(80);
}
const merged = api.merge(out);
return merged.some(item => item.role === "user") && merged.some(item => item.role === "assistant") ? merged : [];
