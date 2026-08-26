// Built-in Summary userscript: Manus (manus)
// Source: ChatClub built-in Summary collector
// Config version: 4; global config version: 79
// Hosts: manus.im
// Path prefixes: (none)
// Run mode: pageWorldFirst; timeout: 36000
// This is a Simple Chat Hub Summary bridge body, not a standalone browser userscript.

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
const qs = (selector, scope = document) => {
  try { return api.qs(selector, scope || document); } catch (error) { return null; }
};
const closest = (node, selector) => {
  try { return api.closest ? api.closest(node, selector) : node && node.closest && node.closest(selector); } catch (error) { return null; }
};
const rectOf = node => {
  try {
    const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch (error) {
    return null;
  }
};
const visible = node => {
  try {
    const rect = rectOf(node);
    if (!rect) return false;
    const style = getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden";
  } catch (error) {
    try { return Boolean(api.visible && api.visible(node)); } catch { return false; }
  }
};
const order = (a, b) => {
  try {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  } catch (error) {
    return 0;
  }
};
const classText = node => {
  const value = node && node.getAttribute && node.getAttribute("class") || node && node.className;
  return typeof value === "string" ? value : value && value.baseVal || "";
};
const meta = node => normalize([
  node && node.tagName,
  classText(node),
  node && node.getAttribute && node.getAttribute("role"),
  node && node.getAttribute && node.getAttribute("aria-label"),
  node && node.getAttribute && node.getAttribute("title"),
  node && node.getAttribute && node.getAttribute("data-testid"),
  node && node.getAttribute && node.getAttribute("data-test-id"),
  node && node.getAttribute && node.getAttribute("data-tooltip"),
  node && node.innerText,
  node && node.textContent
].filter(Boolean).join(" "));
const svgSignature = node => normalize([
  node,
  ...qsa("svg,title,desc,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", node).slice(0, 80)
].map(el => [
  classText(el),
  el && el.getAttribute && el.getAttribute("data-icon"),
  el && el.getAttribute && el.getAttribute("aria-label"),
  el && el.getAttribute && el.getAttribute("title"),
  el && el.getAttribute && el.getAttribute("alt"),
  el && el.getAttribute && el.getAttribute("d")
].filter(Boolean).join(" ")).join(" ")).toLowerCase();
const actionSignature = node => normalize(`${meta(node)} ${svgSignature(node)}`).toLowerCase();
const structured = messages => Array.isArray(messages)
  && messages.some(item => item.role === "user")
  && messages.some(item => item.role === "assistant");
const useful = value => {
  const text = normalize(value);
  if (!text || text.length < 2 || text.length > 200000) return "";
  if (/^(?:copy|copied|copy link|retry|edit|share|task completed|how was this result|复制|已复制|重试|编辑|分享|任务已完成)$/i.test(text)) return "";
  return text;
};
const chatRoot = () => qs("#manus-chat-box")
  || qs("#manus-agents-chat-view")
  || qs("#manus-home-page-session-content")
  || qs("main,[role=main]")
  || document.body
  || document.documentElement;
const pageChrome = node => Boolean(closest(node, "nav,aside,footer,form,input,textarea,select,[contenteditable=true]"));
const nestedCopyScope = node => Boolean(closest(node, "pre,code,table,kbd,samp,[data-language],[data-code-block],[data-codeblock]"));
const nestedCopy = button => /copy\s*(?:code|table|link|conversation|source|sources|citation|citations|url|address|key|secret|skill)|copy[-_ ]?(?:code|table|link|conversation|source|sources|citation|citations|url)|复制(?:代码|表格|链接|会话|来源|引用|地址)/i.test(actionSignature(button));
const explicitCopy = button => /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝/.test(actionSignature(button));
const looksCopyIcon = button => {
  const text = svgSignature(button);
  if (!text) return false;
  return /copy|clipboard|lucide-copy|tabler-icon-copy|heroicons.*clipboard|mingcute.*copy/.test(text);
};
const canonicalControl = control => {
  if (!control || !visible(control) && !explicitCopy(control) && !looksCopyIcon(control)) return false;
  return !qsa("button,[role=button]", control).some(child => child !== control && (visible(child) || explicitCopy(child) || looksCopyIcon(child)));
};
const messageCopyControl = button => {
  if (!canonicalControl(button) || pageChrome(button) || nestedCopyScope(button) || nestedCopy(button)) return false;
  return explicitCopy(button) || looksCopyIcon(button);
};
const assistantAction = control => /(?:^|\b)(retry|regenerate|task completed|how was this result)(?:\b|$)|重试|重新生成|任务已完成|这个结果/.test(actionSignature(control));
const userAction = control => /(?:^|\b)(edit|pencil)(?:\b|$)|编辑/.test(actionSignature(control))
  && !/credit|credits|computer|skill|connector|member/.test(actionSignature(control));
const actionRow = button => {
  let node = button && button.parentElement;
  for (let i = 0; i < 5 && node && node !== chatRoot(); i += 1) {
    const companions = qsa("button,[role=button]", node).filter(item => (
      item !== button && canonicalControl(item) && (assistantAction(item) || userAction(item))
    ));
    if (companions.length) return node;
    if (/task completed|how was this result|任务已完成|这个结果/.test(actionSignature(node))) return node;
    node = node.parentElement;
  }
  return button && button.parentElement || button;
};
const siblingActions = button => qsa("button,[role=button]", actionRow(button)).filter(item => item !== button);
const messageOwner = button => {
  const eventNode = closest(button, "[data-event-id]");
  if (eventNode && eventNode !== chatRoot()) return eventNode;
  return actionRow(button);
};
const roleOfCopy = button => {
  const owner = messageOwner(button);
  const signature = `${actionSignature(owner)} ${siblingActions(button).map(actionSignature).join(" ")}`;
  if (assistantAction(button) || /task completed|how was this result|任务已完成|这个结果/.test(signature) || siblingActions(button).some(assistantAction)) return "assistant";
  if (userAction(button) || siblingActions(button).some(userAction)) return "user";
  return "";
};
const chromeLine = line => {
  const value = String(line || "").trim();
  if (!value) return true;
  if (/^(?:task completed|how was this result|ask manus(?: anything(?:, no credits charged)?)?|upgrade|share|new task|free plan|started working|working\.{0,3}|pending|queued|retry|edit|copy|copied|manus desktop|references|参考来源|任务已完成|这个结果怎么样|重试|编辑|复制|已复制|新任务)$/i.test(value)) return true;
  if (/^manus(?:\s+\d+(?:\.\d+)?)?$/i.test(value)) return true;
  if (/^告?\s*manus(?:\s+\d+(?:\.\d+)?)?\b/i.test(value) && /\bis free\b/i.test(value)) return true;
  if (/\bis free for a limited time\b/i.test(value)) return true;
  if (/\bno credits charged\b/i.test(value)) return true;
  if (/this one['’]?s on manus/i.test(value)) return true;
  if (/^what can i do for you/i.test(value)) return true;
  return false;
};
const composerLine = line => /^(?:ask manus(?: anything(?:, no credits charged)?)?|manus desktop)$/i.test(line);
const sessionTitleText = () => useful(normalize(document.title || "")
  .replace(/^\s*manus\s*[|–—-]\s*/i, "")
  .replace(/\s*[-|–—]\s*manus\b.*$/i, ""));
const isSessionTitle = value => {
  const title = sessionTitleText();
  const text = useful(value);
  return Boolean(title && text && (text === title || title.startsWith(text) && text.length >= 12));
};
const stripAssistantChrome = value => useful(normalize(String(value || "")
  .replace(/this one['’]?s on manus[^\n]*/ig, " ")
  .replace(/[^\n]*\bno credits charged\b[^\n]*/ig, " ")
  .replace(/[^\n]*\bis free for a limited time\b[^\n]*/ig, " ")));
const looksAssistantPreamble = value => /^(?:收到[，,。 ]|i(?:['’]?ll| will) (?:search|look|check|retrieve|find)|let me (?:search|look|check)|i(?:['’]?m| am) (?:searching|looking))/i.test(String(value || "").trim());
const sanitizeConversation = messages => {
  const cleaned = [];
  for (const message of api.merge(messages || [])) {
    if (message.role === "user") {
      const text = useful(message.text);
      if (text && !chromeLine(text) && !looksAssistantPreamble(text)) cleaned.push({ role: "user", text });
      continue;
    }
    const assistant = stripAssistantChrome(message.text);
    if (assistant) cleaned.push({ role: "assistant", text: assistant });
  }
  return structured(cleaned) ? api.merge(cleaned) : [];
};
const blankNewTask = root => {
  const buttons = qsa("button,[role=button]", root).filter(messageCopyControl);
  if (buttons.length) return false;
  const text = normalize(root && (root.innerText || root.textContent) || "");
  return /ask manus|new task|message your task/i.test(text) && !/task completed|任务已完成/i.test(text) && text.length < 1200;
};
const scrollConversationStart = async root => {
  try {
    let node = root;
    for (let i = 0; i < 8 && node; i += 1) {
      if ((node.scrollHeight || 0) > (node.clientHeight || 0) + 24) {
        node.scrollTop = 0;
        break;
      }
      node = node.parentElement;
    }
    const first = root && (root.firstElementChild || root);
    if (first) api.reveal(first);
  } catch (error) {}
  await api.sleep(160);
};
const copyTurns = async root => {
  const buttons = qsa("button,[role=button]", root).filter(messageCopyControl).sort(order).slice(0, 48);
  const out = [];
  const seenOwners = new Set();
  for (const button of buttons) {
    const owner = messageOwner(button);
    if (seenOwners.has(owner)) continue;
    seenOwners.add(owner);
    api.reveal(owner);
    api.reveal(button);
    await api.sleep(120);
    const text = useful(await api.copy(button, copyOptions));
    if (!text) continue;
    const role = roleOfCopy(button);
    if (role !== "user" && role !== "assistant") continue;
    out.push({ role, text });
    await api.sleep(80);
  }
  return api.merge(out);
};
const chatTextFromEvent = event => {
  if (!event || typeof event !== "object") return "";
  if (Array.isArray(event.contents) && event.contents.length) {
    return useful(event.contents.map(item => {
      if (!item || typeof item !== "object") return "";
      if (item.type === "text" || item.type === "tag") return item.value || "";
      return "";
    }).join(""));
  }
  return useful(event.content || event.question || "");
};
const skipUserEvent = event => /meeting-record|webdev-feature-confirm/.test(String(event && event.extData && event.extData.from || ""));
const isUserChatEvent = event => event && event.type === "chat" && event.sender === "user" && !event.noRender && !event.userCanceled && !skipUserEvent(event);
const isAssistantChatEvent = event => event
  && event.type === "chat"
  && event.sender === "assistant"
  && !event.noRender
  && !event.userCanceled
  && event.deliveryKind !== "opening"
  && event.deliveryKind !== "progress";
const eventsFromState = state => {
  const websocket = state && state.websocket;
  const entities = websocket && websocket.entities;
  if (!entities || typeof entities !== "object") return [];
  const ids = Array.isArray(websocket.ids) ? websocket.ids : Object.keys(entities);
  const out = [];
  for (const id of ids) {
    const row = entities[id];
    const event = row && row.type === "event" ? row.event : row;
    if (event && event.type === "chat") out.push(event);
  }
  return out;
};
const turnsFromEvents = events => {
  const out = [];
  for (const event of events || []) {
    const text = chatTextFromEvent(event);
    if (!text) continue;
    if (isUserChatEvent(event)) out.push({ role: "user", text });
    else if (isAssistantChatEvent(event)) out.push({ role: "assistant", text });
  }
  return api.merge(out);
};
const fiberFrom = node => {
  if (!node) return null;
  try {
    for (const key of Object.keys(node)) {
      if (key.startsWith("__reactFiber") || key.startsWith("__reactInternalInstance") || key.startsWith("__reactContainer")) return node[key];
    }
  } catch (error) {}
  return null;
};
const pageChatTurns = root => {
  const out = [];
  const seenStores = new Set();
  const seenKeys = new Set();
  const pushTurn = item => {
    const key = `${item.role}:${item.text}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    out.push(item);
  };
  const takeStore = store => {
    if (!store || typeof store.getState !== "function" || seenStores.has(store)) return;
    seenStores.add(store);
    try { turnsFromEvents(eventsFromState(store.getState())).forEach(pushTurn); } catch (error) {}
  };
  const takeEvent = event => {
    const text = chatTextFromEvent(event);
    if (!text) return;
    if (isUserChatEvent(event)) pushTurn({ role: "user", text });
    else if (isAssistantChatEvent(event)) pushTurn({ role: "assistant", text });
  };
  let visited = 0;
  const visitFiber = (fiber, depth) => {
    if (!fiber || depth > 90 || visited > 4000) return;
    visited += 1;
    const props = fiber.memoizedProps || fiber.pendingProps || {};
    if (props.store) takeStore(props.store);
    if (fiber.stateNode && fiber.stateNode.store) takeStore(fiber.stateNode.store);
    if (props.event && props.event.type === "chat") takeEvent(props.event);
    else if (props.type === "chat" && props.sender) takeEvent(props);
    visitFiber(fiber.child, depth + 1);
    visitFiber(fiber.sibling, depth);
  };
  visitFiber(fiberFrom(root), 0);
  if (root !== document.body) visitFiber(fiberFrom(document.body), 0);
  return api.merge(out);
};
const looksUserBubble = (node, root) => {
  if (!node || node === root || pageChrome(node) || nestedCopyScope(node)) return false;
  const cls = classText(node).toLowerCase();
  if (/\b(user|question|justify-end|ml-auto|ms-auto|self-end|items-end)\b/.test(cls)) return true;
  const buttons = qsa("button,[role=button]", node);
  if (buttons.some(userAction) && !buttons.some(assistantAction)) return true;
  const rect = rectOf(node);
  const rootRect = rectOf(root);
  return Boolean(rect && rootRect && rect.width > 48 && rect.width < rootRect.width * 0.82 && rect.left - rootRect.left > rootRect.width * 0.28);
};
const userBubbleTurns = root => {
  const out = [];
  const seen = new Set();
  const nodes = qsa("div,article,section,li,p,[data-event-id]", root)
    .filter(node => looksUserBubble(node, root))
    .sort(order)
    .slice(0, 80);
  for (const node of nodes) {
    if (nodes.some(other => other !== node && other.contains && other.contains(node) && looksUserBubble(other, root))) continue;
    const text = useful(node.innerText || node.textContent);
    if (!text || text.length > 8000 || chromeLine(text) || looksAssistantPreamble(text) || seen.has(text)) continue;
    seen.add(text);
    out.push({ role: "user", text });
  }
  return out;
};
const domFallback = (root, copiedAssistant = "") => {
  const raw = normalize(root && (root.innerText || root.textContent) || "");
  if (!raw) return [];
  const lines = [];
  for (const rawLine of raw.split(/\n+/)) {
    const line = normalize(rawLine.replace(/^[-•]\s*/, ""));
    if (!line || line.length < 2) continue;
    if (composerLine(line) && lines.length) break;
    if (chromeLine(line) || isSessionTitle(line)) continue;
    if (!lines.includes(line)) lines.push(line);
  }
  if (lines.length < 2) return [];
  const assistantHint = normalize(copiedAssistant).slice(0, 180);
  let userEnd = lines.findIndex(line => looksAssistantPreamble(line));
  if (userEnd < 0 && assistantHint) {
    const index = lines.findIndex(line => assistantHint.includes(line.slice(0, 80)) || line.includes(assistantHint.slice(0, 80)));
    userEnd = index;
  }
  if (userEnd < 1) return [];
  const user = useful(lines.slice(0, userEnd).join("\n"));
  const assistant = useful(lines.slice(userEnd).join("\n"));
  if (!user || !assistant || user.length < 2 || assistant.length < 8) return [];
  if (user.toLowerCase() === assistant.toLowerCase()) return [];
  if (isSessionTitle(user) || looksAssistantPreamble(user)) return [];
  return api.merge([{ role: "user", text: user }, { role: "assistant", text: assistant }]);
};
const combineTurns = (...groups) => sanitizeConversation(groups.flat().filter(Boolean));

const root = chatRoot();
if (blankNewTask(root)) return [];
await scrollConversationStart(root);
const copied = await copyTurns(root);
const copiedClean = sanitizeConversation(copied);
if (structured(copiedClean)) return copiedClean;
if (typeof api.extractNativeCopyConversation === "function") {
  const native = await api.extractNativeCopyConversation(root);
  const nativeClean = sanitizeConversation(native);
  if (structured(nativeClean)) return nativeClean;
}
const pageTurns = pageChatTurns(root);
const pageClean = sanitizeConversation(pageTurns);
if (structured(pageClean)) return pageClean;
const assistantOnly = copied.find(item => item.role === "assistant")?.text
  || pageTurns.find(item => item.role === "assistant")?.text
  || "";
const userOnly = copied.find(item => item.role === "user")?.text
  || pageTurns.find(item => item.role === "user")?.text
  || userBubbleTurns(root)[0]?.text
  || "";
if (userOnly && assistantOnly) {
  const combined = combineTurns([{ role: "user", text: userOnly }, { role: "assistant", text: assistantOnly }]);
  if (structured(combined)) return combined;
}
if (assistantOnly && !userOnly) {
  const fromBubbles = userBubbleTurns(root);
  const withBubbles = combineTurns(fromBubbles, [{ role: "assistant", text: assistantOnly }]);
  if (structured(withBubbles)) return withBubbles;
  const fallback = sanitizeConversation(domFallback(root, assistantOnly));
  if (structured(fallback)) return fallback;
}
if (userOnly && !assistantOnly) {
  const fallback = sanitizeConversation(domFallback(root));
  if (structured(fallback)) return fallback;
}
return sanitizeConversation(domFallback(root, assistantOnly));
