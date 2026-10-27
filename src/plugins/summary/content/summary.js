// Summary capability (ISOLATED; v2 04 §1.4–§1.7, §5.4): in-page conversation collection through
// official selector slots, site hooks and the copy bridge, plus the conversation ledger.
/* @include lib/conversation.js */
/* @include lib/userscript-bridge.js */

const cc = globalThis.__chatclub;
if (cc && !cc.has("summary")) {
  const DOCUMENT_ID = (() => {
    const buf = new Uint8Array(12);
    crypto.getRandomValues(buf);
    return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
  })();
  const LEDGER_VERSION = 2; // differs from the old ledger (1) on purpose: old marks are adopted, not compared
  const MAX_MESSAGES = 200;
  const MAX_MESSAGE_CHARS = 50 * 1024;
  const MAX_TOTAL_CHARS = 1024 * 1024;
  const COPY_CHANNEL = "chatclub:copybridge:v1";

  class Aborted extends Error {
    constructor() {
      super("aborted");
      this.aborted = true;
    }
  }

  // ------------------------------------------------------------------ safe DOM helpers
  const qs = (sel, root = document) => {
    try {
      return sel ? root.querySelector(sel) : null;
    } catch {
      return null;
    }
  };
  const qsa = (sel, root = document) => {
    try {
      return sel ? [...root.querySelectorAll(sel)] : [];
    } catch {
      return [];
    }
  };
  const closest = (node, sel) => {
    try {
      return node?.closest?.(sel) ?? null;
    } catch {
      return null;
    }
  };
  const matches = (node, sel) => {
    try {
      return !!node?.matches?.(sel);
    } catch {
      return false;
    }
  };
  const list = (value) => (Array.isArray(value) ? value : value ? [value] : []).filter((s) => typeof s === "string" && s.trim());
  const visible = (node) => {
    if (!node?.getBoundingClientRect) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return false;
    const style = getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const byDocumentOrder = (a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

  // ------------------------------------------------------------------ text extraction
  const ALWAYS_SKIP = "button, [role=button], [role=toolbar], [role=menu], [role=menuitem], svg, style, script, template, noscript, input, textarea, select, [contenteditable=''], [contenteditable=true]";
  const SHORT_SKIP = "time, [datetime], relative-time, .sr-only, .visually-hidden, .cdk-visually-hidden, [aria-live], [role=status], [role=alert], [role=progressbar], [role=tooltip], [data-radix-popper-content-wrapper]";
  const NOISE = [
    /^(thought|reasoned|searched|analy[sz]ed|thinking|reasoning)( for)? [\d.]+ ?(s|sec|secs|seconds?|m|min|mins|minutes?)\.?$/i,
    /^(思考|推理|搜索|分析)了? ?[\d.]+ ?(秒|分钟)$/,
    /^(正在)?(思考|推理|生成|写作|搜索)(中)?[.…]*$/,
    /^(thinking|reasoning|generating|writing|searching)[.…]*$/i,
    /^已思考（用时 ?[\d.]+ ?(秒|分钟)）$/,
    /^(刚刚|今天|昨天|已编辑|\d+ ?(分钟|小时|天)前)$/,
    /^(just now|today|yesterday|edited|\d+ ?(minutes?|hours?|days?) ago)$/i,
    /^\d{1,2}:\d{2}( ?[ap]\.?m\.?)?$/i,
  ];
  const isNoise = (s) => s.length <= 80 && NOISE.some((re) => re.test(s.trim()));
  const labelHasCopy = (el) => /copy/i.test(`${el.getAttribute?.("aria-label") ?? ""} ${el.getAttribute?.("title") ?? ""} ${el.getAttribute?.("data-testid") ?? ""}`);

  /** Ledger text: walks child nodes (no innerText, no layout); each element's own text nodes form a segment. */
  const ledgerText = (root, extraSkip = "") => {
    const segments = [];
    const walk = (el, depth) => {
      if (depth > 96) return;
      let own = "";
      for (const child of el.childNodes) {
        if (child.nodeType === 3) own += child.nodeValue;
        else if (child.nodeType === 1) {
          if (own.trim()) {
            segments.push(own.replace(/\s+/g, " ").trim());
            own = "";
          }
          if (matches(child, ALWAYS_SKIP) || labelHasCopy(child) || (extraSkip && matches(child, extraSkip))) continue;
          if (matches(child, SHORT_SKIP) && (child.textContent ?? "").length <= 160) continue;
          walk(child, depth + 1);
        }
      }
      if (own.trim()) segments.push(own.replace(/\s+/g, " ").trim());
    };
    walk(root, 0);
    return segments.filter((s) => !isNoise(s)).join("\n").trim();
  };

  /**
   * Last-resort plain text when the structured readers find nothing (sites that wrap the whole message in a
   * clickable [role=button] bubble, for example): drop controls, hidden labels and cleanup nodes, keep the rest.
   */
  const plainText = (root, extraSkip = "") => {
    const clone = root.cloneNode(true);
    const drop = ["button", "svg", "style", "script", "template", "noscript", "input", "textarea", "select", ".sr-only", ".visually-hidden", ".cdk-visually-hidden", extraSkip].filter(Boolean).join(", ");
    try {
      for (const el of clone.querySelectorAll(drop)) el.remove();
    } catch {
      // ignore bad cleanup selectors
    }
    for (const el of clone.querySelectorAll("p, div, li, br, h1, h2, h3, h4, h5, h6, pre, tr")) el.append("\n");
    return clone.textContent.split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s && !isNoise(s)).join("\n").trim();
  };
  const turnText = (node, role, cleanup) => (role === "user" ? ledgerText(node, cleanup) : markdownOf(node, cleanup)) || plainText(node, cleanup);

  /** Markdown-ish reading of a message for Summary when no copy result is available. */
  const markdownOf = (root, skip = "") => {
    const out = [];
    const inline = (el) => {
      let s = "";
      for (const child of el.childNodes) {
        if (child.nodeType === 3) s += child.nodeValue.replace(/\s+/g, " ");
        else if (child.nodeType === 1) {
          if (matches(child, ALWAYS_SKIP) || (skip && matches(child, skip))) continue;
          const tag = child.tagName.toLowerCase();
          const inner = inline(child);
          if (tag === "br") s += "\n";
          else if (tag === "code") s += `\`${child.textContent}\``;
          else if (tag === "strong" || tag === "b") s += inner.trim() ? `**${inner.trim()}**` : "";
          else if (tag === "em" || tag === "i") s += inner.trim() ? `*${inner.trim()}*` : "";
          else if (tag === "a" && /^https?:/i.test(child.href || "")) s += `[${inner.trim() || child.href}](${child.href})`;
          else if (isBlock(child)) s += `\n${blockText(child)}\n`;
          else s += inner;
        }
      }
      return s;
    };
    const isBlock = (el) => /^(p|div|section|article|h[1-6]|ul|ol|li|pre|blockquote|table|hr|figure|header|footer|main)$/i.test(el.tagName);
    const blockText = (el) => {
      const sub = [];
      walk(el, sub, 0);
      return sub.join("\n\n");
    };
    const walk = (el, acc, depth) => {
      if (depth > 64) return;
      let buffer = "";
      const flush = () => {
        const text = buffer.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
        if (text && !isNoise(text)) acc.push(text);
        buffer = "";
      };
      for (const child of el.childNodes) {
        if (child.nodeType === 3) {
          buffer += child.nodeValue.replace(/\s+/g, " ");
          continue;
        }
        if (child.nodeType !== 1) continue;
        if (matches(child, ALWAYS_SKIP) || (skip && matches(child, skip))) continue;
        if (matches(child, SHORT_SKIP) && (child.textContent ?? "").length <= 160) continue;
        const tag = child.tagName.toLowerCase();
        if (!isBlock(child)) {
          buffer += inline({ childNodes: [child] });
          continue;
        }
        flush();
        if (/^h[1-6]$/.test(tag)) acc.push(`${"#".repeat(Number(tag[1]))} ${inline(child).trim()}`);
        else if (tag === "pre") {
          const code = child.querySelector("code");
          const lang = (code?.className.match(/language-([\w+#.-]+)/) || [])[1] || "";
          acc.push(`\`\`\`${lang}\n${(code ?? child).textContent.replace(/\n$/, "")}\n\`\`\``);
        } else if (tag === "ul" || tag === "ol") {
          const items = [...child.children].filter((li) => li.tagName === "LI");
          acc.push(items.map((li, i) => `${tag === "ol" ? `${i + 1}.` : "-"} ${blockText(li).replace(/\n+/g, " ").trim()}`).join("\n"));
        } else if (tag === "blockquote") acc.push(blockText(child).split("\n").map((l) => `> ${l}`).join("\n"));
        else if (tag === "hr") acc.push("---");
        else if (tag === "table") {
          const rows = [...child.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => inline(c).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim()));
          if (rows.length) {
            const width = Math.max(...rows.map((r) => r.length));
            const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
            acc.push([line(rows[0]), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n"));
          }
        } else walk(child, acc, depth + 1);
      }
      flush();
    };
    walk(root, out, 0);
    return normalizeText(out.join("\n\n"));
  };

  // ------------------------------------------------------------------ turns
  const sticky = new Map(); // slot -> index of the selector that last found something
  const stickyQuery = (slot, root, selectors) => {
    const sels = list(selectors);
    if (!sels.length) return [];
    const order = sticky.has(slot) ? [sticky.get(slot), ...sels.keys()] : [...sels.keys()];
    for (const i of order) {
      const found = qsa(sels[i], root);
      if (found.length) {
        sticky.set(slot, i);
        return found;
      }
    }
    return [];
  };
  const hasSignal = (node, selectors) => list(selectors).some((s) => matches(node, s) || !!qs(s, node));
  const outermost = (nodes) => nodes.filter((n) => !nodes.some((o) => o !== n && o.contains(n)));

  /** Turn nodes with roles: site hook first, then the official slots (sticky). */
  const discoverTurns = (hints = {}, config = {}) => {
    const root = stickyQuery("conversationRoot", document, hints.conversationRoot)[0] ?? document;
    const hits = { root: root === document ? 0 : 1, message: 0, user: 0, assistant: 0, cleanup: 0 };
    let turns = [];
    const messages = stickyQuery("messageRoot", root, hints.messageRoot);
    hits.message = messages.length;
    if (messages.length) {
      turns = outermost(messages).map((node) => {
        let role = "?";
        if (hasSignal(node, hints.userRoleSignal) || hasSignal(node, hints.userRoot)) role = "user";
        else if (hasSignal(node, hints.assistantRoleSignal) || hasSignal(node, hints.assistantRoot)) role = "assistant";
        else if (config.roleFallback === "rest-user") role = "user";
        return { node, role };
      });
    } else {
      const users = stickyQuery("userRoot", root, hints.userRoot).map((node) => ({ node, role: "user" }));
      const assistants = stickyQuery("assistantRoot", root, hints.assistantRoot).map((node) => ({ node, role: "assistant" }));
      const all = [...users, ...assistants];
      const kept = new Set(outermost(all.map((t) => t.node)));
      turns = all.filter((t) => kept.has(t.node)).sort((a, b) => byDocumentOrder(a.node, b.node));
    }
    hits.user = turns.filter((t) => t.role === "user").length;
    hits.assistant = turns.filter((t) => t.role === "assistant").length;
    return { turns, hits };
  };

  const siteTurns = async (hints, config) => {
    if (cc.hasHook("summary.turns")) {
      for (const result of await cc.runHooks("summary.turns", { hints, config })) {
        if (Array.isArray(result) && result.length) return { turns: result.filter((t) => t?.node), hits: { root: 1, message: result.length, user: 0, assistant: 0, cleanup: 0 } };
      }
    }
    return discoverTurns(hints, config);
  };

  // ------------------------------------------------------------------ generating
  const GENERIC_GENERATING = ['button[data-testid="stop-button"]', 'button[aria-label="Stop generating"]', 'button[aria-label="Stop response"]', '[data-is-streaming="true"]'];
  let generatingSelectors = GENERIC_GENERATING;
  const conversationIsGenerating = () => {
    return generatingSelectors.some((s) => {
      const el = qs(s);
      return !!el && (el.tagName !== "BUTTON" || visible(el));
    });
  };

  // ------------------------------------------------------------------ copy
  let copySeq = 0;
  const readClipboard = async () => {
    try {
      return (await navigator.clipboard.readText()) || "";
    } catch {
      return "";
    }
  };
  const dispatchBridge = (detail) => window.dispatchEvent(new CustomEvent(COPY_CHANNEL, { detail: JSON.stringify(detail) }));
  const simulateClick = (el) => {
    const rect = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mousedown", init));
    el.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mouseup", init));
    el.dispatchEvent(new MouseEvent("click", init));
  };
  const reveal = (node) => {
    if (!node) return;
    try {
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {
      // ignore
    }
    const rect = node.getBoundingClientRect();
    const init = { bubbles: true, composed: true, clientX: rect.left + Math.min(20, rect.width / 2), clientY: rect.top + Math.min(20, rect.height / 2), view: window };
    for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointermove", "mousemove"]) {
      node.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, { ...init, pointerType: "mouse" }) : new MouseEvent(type, init));
    }
  };

  /** One copy through the bridge (04 §1.5). Returns cleaned text or "". */
  const copy = async (button, options = {}, run = null) => {
    if (run?.aborted) throw new Aborted();
    if (!button) return "";
    const pollMs = Math.min(150, Math.max(20, Number(options.copyPollMs) || 50));
    const graceMs = Math.min(800, Math.max(80, Number(options.copyCaptureGraceMs) || 240));
    const timeoutMs = Math.min(10000, Math.max(300, Number(options.copyTimeoutMs) || 2600));
    const before = options.resetClipboardBeforeCopy ? "" : await readClipboard();
    const id = `copy-${Date.now().toString(36)}-${(copySeq += 1)}`;
    let best = { text: "", priority: 0, at: 0 };
    const onCaptured = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.detail);
      } catch {
        return;
      }
      if (msg?.id !== id || typeof msg.text !== "string") return;
      if (msg.priority >= best.priority) best = { text: msg.text, priority: msg.priority, at: Date.now() };
    };
    window.addEventListener(`${COPY_CHANNEL}:captured`, onCaptured);
    dispatchBridge({ op: "install", id });
    const started = Date.now();
    try {
      simulateClick(button);
      while (Date.now() - started < timeoutMs) {
        if (run?.aborted) throw new Aborted();
        await cc.sleep(pollMs);
        if (best.priority >= 3) break;
        if (best.priority > 0 && Date.now() - best.at >= graceMs) break;
        if (!best.text) {
          const now = await readClipboard();
          if (now && now !== before) {
            best = { text: now, priority: 3, at: Date.now() };
            break;
          }
        }
      }
    } finally {
      dispatchBridge({ op: "restore", id });
      window.removeEventListener(`${COPY_CHANNEL}:captured`, onCaptured);
    }
    const text = normalizeText(best.text);
    if (!text) return "";
    if (text === normalizeText(before) && !(options.acceptUnchangedClipboard && !options.resetClipboardBeforeCopy)) return "";
    return text;
  };

  const COPY_WORDS = /(copy|复制|拷贝)/i;
  const NOT_COPY = /(copy (code|table|link)|复制(代码|表格|链接|会话|来源)|share|分享|like|dislike|点赞|点踩|good response|bad response|setting|设置|export|导出|more|更多|menu|菜单|upload|上传|voice|语音|submit|提交|model|模型|source|来源|link)/i;
  const describe = (el) => [el.textContent, el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("data-testid"), el.getAttribute("data-test-id"), typeof el.className === "string" ? el.className : "", el.querySelector?.("[data-icon], use")?.getAttribute?.("data-icon") || el.querySelector?.("use")?.getAttribute?.("href") || ""].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 300);
  const buttonText = (el) => describe(el);
  const usable = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden"; // opacity:0 action bars still count
  };
  /** Copy-button candidates inside `root` (04 §1.5 generic rules). */
  const findCopyButtons = (root, options = {}) => {
    const exclude = list(options.exclude);
    const out = [];
    for (const el of qsa('button, [role="button"], [role="menuitem"], [role="menuitemradio"], div[tabindex], span[role="button"]', root)) {
      if (closest(el, "pre, code")) continue;
      if (exclude.some((s) => matches(el, s) || closest(el, s))) continue;
      const d = describe(el);
      if (!COPY_WORDS.test(d) || NOT_COPY.test(d.replace(COPY_WORDS, ""))) continue;
      if (!usable(el)) continue;
      out.push(el);
    }
    return out;
  };

  /** The smallest ancestor (≤ 5 levels) of a turn that still holds no other turn: where its action bar lives. */
  const turnScope = (node, allNodes) => {
    let scope = node;
    for (let i = 0; i < 5; i += 1) {
      const parent = scope.parentElement;
      if (!parent || parent === document.body) break;
      if (allNodes.some((other) => other !== node && parent.contains(other))) break;
      scope = parent;
    }
    return scope;
  };

  const roughlyMatches = (copied, domText) => {
    const strip = (s) => normalizeForCompare(s).replace(/[\s*_#`>|\-[\]()]/g, "").toLowerCase();
    const a = strip(copied);
    const b = strip(domText);
    if (!a || !b) return !!a;
    const probe = b.slice(0, Math.min(24, b.length));
    const probe2 = a.slice(0, Math.min(24, a.length));
    return a.includes(probe) || b.includes(probe2);
  };

  const copyFirst = async (buttons, { options = {}, expected = "", run = null } = {}) => {
    for (const btn of buttons.slice(0, 12)) {
      const text = await copy(btn, options, run);
      if (text && (!expected || roughlyMatches(text, expected))) return text;
    }
    return "";
  };

  // ------------------------------------------------------------------ limits
  const capMessages = (messages) => {
    const merged = mergeAdjacent(messages.filter((m) => m && (m.role === "user" || m.role === "assistant" || m.role === "page")));
    const out = [];
    let total = 0;
    for (const m of merged.slice(-MAX_MESSAGES)) {
      const text = m.text.slice(0, MAX_MESSAGE_CHARS);
      if (total + text.length > MAX_TOTAL_CHARS) break;
      total += text.length;
      out.push({ role: m.role, text });
    }
    return out;
  };
  const hasPair = (messages) => messages.some((m) => m.role === "user") && messages.some((m) => m.role === "assistant");

  // ------------------------------------------------------------------ scroll restore (idle copies)
  const rememberScroll = () => {
    const saved = [];
    const seen = new Set();
    const note = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      saved.push([el, el.scrollTop, el.scrollLeft]);
    };
    note(document.scrollingElement);
    const onScroll = (event) => note(event.target === document ? document.scrollingElement : event.target);
    document.addEventListener("scroll", onScroll, true);
    // Containers are recorded on first scroll, but the value read then is already moved; pre-record likely ones.
    for (const el of qsa("main, [role=main], [role=log], section, div")) {
      if (el.scrollHeight > el.clientHeight + 48 && /(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) note(el);
      if (saved.length > 40) break;
    }
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      for (const [el, top, left] of saved) {
        try {
          el.scrollTop = top;
          el.scrollLeft = left;
        } catch {
          // ignore
        }
      }
    };
  };

  // ------------------------------------------------------------------ official-slot collection
  const collectBySlots = async (config, run, { idle = false, tailTurns = 0 } = {}) => {
    const hints = config.officialRuleHints ?? {};
    const { turns, hits } = await siteTurns(hints, config);
    const cleanup = list(hints.cleanup).concat(list(hints.nestedCodeAction), list(hints.referenceAction)).join(", ");
    if (cleanup) hits.cleanup = qsa(cleanup).length;
    let slice = turns;
    if (tailTurns > 0 && turns.length > tailTurns) {
      let start = turns.length - tailTurns;
      while (start > 0 && turns[start].role !== "user") start -= 1;
      slice = turns.slice(start);
    }
    const nodes = turns.map((t) => t.node);
    const messages = [];
    const copySelectors = list(hints.messageCopy);
    const options = { copyTimeoutMs: config.copyTimeoutMs, copyPollMs: config.copyPollMs, copyCaptureGraceMs: config.copyCaptureGraceMs, resetClipboardBeforeCopy: config.resetClipboardBeforeCopy, acceptUnchangedClipboard: config.acceptUnchangedClipboard };
    const useCopy = config.copyMode !== "dom";
    let copied = 0;
    for (const turn of slice) {
      if (run?.aborted) throw new Aborted();
      if (turn.role !== "user" && turn.role !== "assistant") continue;
      const domText = turnText(turn.node, turn.role, cleanup);
      let text = "";
      if (turn.role === "assistant" && useCopy && !(generating() && turn === slice[slice.length - 1])) {
        const scope = turnScope(turn.node, nodes);
        let buttons = copySelectors.length ? copySelectors.flatMap((s) => qsa(s, scope)).filter((b) => !closest(b, "pre, code")) : [];
        if (!buttons.length) {
          reveal(turn.node);
          await cc.sleep(60);
          buttons = copySelectors.length ? copySelectors.flatMap((s) => qsa(s, scope)) : findCopyButtons(scope, { exclude: list(hints.nestedCodeAction).concat(list(hints.referenceAction)) });
        }
        if (buttons.length) {
          reveal(turn.node);
          text = await copyFirst(buttons, { options, expected: domText, run });
          if (text) copied += 1;
        }
      }
      messages.push({ role: turn.role, text: text || domText });
    }
    return { messages, rawMessageCount: turns.length, hits, copied, idle };
  };
  const generating = () => conversationIsGenerating();

  // ------------------------------------------------------------------ the api object for custom/site scripts
  const makeApi = (config, run) => ({
    config,
    collectOfficialCandidate: async () => {
      const r = await collectBySlots(config, run);
      return r.messages.length ? r.messages : null;
    },
    sleep: async (ms) => {
      const end = Date.now() + Math.max(0, Number(ms) || 0);
      while (Date.now() < end) {
        if (run?.aborted) throw new Aborted();
        await cc.sleep(Math.min(100, end - Date.now()));
      }
    },
    normalize: normalizeText,
    qs,
    qsa,
    closest,
    visible,
    text: (node) => (node ? ledgerText(node) : ""),
    buttonText,
    reveal,
    merge: mergeAdjacent,
    copy: (button, options) => copy(button, { ...config, ...options }, run),
    copyFirst: (buttons, opts = {}) => copyFirst(buttons, { ...opts, options: { ...config, ...(opts.options ?? {}) }, run }),
    findCopyButtons,
    extractTurns: async (opts = {}) => (await collectBySlots({ ...config, copyMode: "dom", officialRuleHints: { ...(config.officialRuleHints ?? {}), ...opts } }, run)).messages,
    extractCopySequence: async (opts = {}) => (await collectBySlots({ ...config, officialRuleHints: { ...(config.officialRuleHints ?? {}), ...opts } }, run)).messages,
    extractNativeCopyConversation: async () => (await collectBySlots(config, run)).messages,
    extractDeepSeekNativeCopyMessages: async () => (await collectBySlots(config, run)).messages,
    extractGrokNativeCopyMessages: async () => (await collectBySlots(config, run)).messages,
    conversationIsGenerating: () => generating(),
  });

  // ------------------------------------------------------------------ collectSummary
  const runs = new Map();
  const collectSummary = async ({ config = {}, expectedDocumentId, expectedHref, runId, idle = false, tailTurns = 0 } = {}) => {
    if (expectedDocumentId && expectedDocumentId !== DOCUMENT_ID) throw new Error("document changed");
    if (expectedHref && expectedHref !== location.href) throw new Error("address changed");
    if (Array.isArray(config.generating) && config.generating.length) generatingSelectors = [...config.generating, ...GENERIC_GENERATING];
    const run = { aborted: false };
    const key = runId || `run-${Date.now()}`;
    runs.set(key, run);
    const restoreScroll = idle ? rememberScroll() : null;
    let userInterrupted = false;
    const onUserInput = (event) => {
      if (event.isTrusted && idle) {
        userInterrupted = true;
        run.aborted = true;
      }
    };
    if (idle) for (const type of ["keydown", "pointerdown", "wheel"]) window.addEventListener(type, onUserInput, true);
    const result = { messages: [], rawMessageCount: 0, stage: "none", officialHits: null, waitMsApplied: 0, documentId: DOCUMENT_ID, href: location.href };
    try {
      if (generating()) {
        result.stage = "generating";
        return result;
      }
      const custom = config.sourceMode === "custom" || config.builtIn === false || !!config.userscriptOverride;
      if (custom) {
        result.stage = "custom";
        const channel = userscriptChannel();
        const { customUserscript, ...visibleConfig } = config;
        void customUserscript;
        const stopBridge = serveUserscriptBridge(channel, makeApi(visibleConfig, run));
        let reply;
        try {
          reply = await cc.request("UserScriptsRuntime.executeSummaryUserscript", { configId: config.id, href: location.href, channel, generating: generatingSelectors });
        } finally {
          stopBridge();
        }
        if (!reply?.ok) throw new Error(reply?.error || "custom scripts are not available");
        const data = reply.result?.data;
        const msgs = (Array.isArray(data) ? data : data?.messages ?? []).map((m) => ({ role: m?.role, text: normalizeText(m?.text ?? m?.content ?? "") }));
        result.rawMessageCount = msgs.length;
        result.messages = capMessages(msgs.filter((m) => m?.role === "user" || m?.role === "assistant"));
        if (!hasPair(result.messages)) result.messages = [];
        return result;
      }
      const hints = config.officialRuleHints ?? {};
      const hasSlots = Object.values(hints).some((v) => list(v).length);
      if (hasSlots) {
        let r = await collectBySlots(config, run, { idle, tailTurns });
        result.officialHits = r.hits;
        const wait = Math.min(60000, Math.max(0, Number(config.officialRuleWaitMs) || 0));
        if (!hasPair(r.messages) && wait > 0 && !idle) {
          await makeApi(config, run).sleep(wait);
          result.waitMsApplied = wait;
          r = await collectBySlots(config, run, { idle, tailTurns });
          result.officialHits = r.hits;
        }
        result.rawMessageCount = r.rawMessageCount;
        const capped = capMessages(r.messages);
        if (hasPair(capped)) {
          result.messages = capped;
          result.stage = "official";
          result.copied = r.copied;
          return result;
        }
      }
      if (cc.hasHook("summary.collect")) {
        for (const out of await cc.runHooks("summary.collect", makeApi(config, run))) {
          const msgs = Array.isArray(out) ? out : out?.messages;
          if (!Array.isArray(msgs)) continue;
          result.rawMessageCount = Math.max(result.rawMessageCount, msgs.length);
          const capped = capMessages(msgs.filter((m) => m?.role === "user" || m?.role === "assistant"));
          if (hasPair(capped)) {
            result.messages = capped;
            result.stage = "isolatedJs";
            return result;
          }
        }
      }
      return result;
    } catch (error) {
      if (error?.aborted || run.aborted) return { ...result, aborted: true, userInterrupted };
      throw error;
    } finally {
      runs.delete(key);
      if (idle) for (const type of ["keydown", "pointerdown", "wheel"]) window.removeEventListener(type, onUserInput, true);
      if (restoreScroll && !userInterrupted) restoreScroll();
    }
  };

  // ------------------------------------------------------------------ ledger (04 §5.4)
  const ledger = {
    hints: null,
    config: {},
    revision: 0,
    digest: "",
    granularity: "none",
    entries: [],
    texts: [],
    conversationKey: null,
    generating: false,
    generatingSeenAt: 0,
    changedAt: Date.now(),
    lastReadAt: 0,
    observer: null,
    timer: 0,
    firstDirtyAt: 0,
    waiters: new Set(),
  };
  const ledgerId = `ledger-${DOCUMENT_ID.slice(0, 8)}`;
  const input = { lastAt: 0, seen: false };
  const onTrustedInput = (event) => {
    if (!event.isTrusted) return;
    input.seen = true;
    input.lastAt = Date.now();
  };
  for (const type of ["keydown", "input", "pointerdown", "paste"]) window.addEventListener(type, onTrustedInput, true);

  const recompute = async () => {
    const hints = ledger.hints;
    let turns = [];
    if (hints) {
      try {
        turns = (await siteTurns(hints, ledger.config)).turns;
      } catch {
        turns = [];
      }
    }
    const cleanup = hints ? list(hints.cleanup).concat(list(hints.nestedCodeAction), list(hints.referenceAction)).join(", ") : "";
    const items = turns.map((t) => {
      const role = t.role === "user" ? "u" : t.role === "assistant" ? "a" : "?";
      const text = normalizeForCompare(ledgerText(t.node, cleanup) || plainText(t.node, cleanup));
      return { role, text, entry: `${role}:${hash64(`${role}\n${text}`)}` };
    }).filter((x) => x.text);
    const roles = new Set(items.map((x) => x.role));
    const granularity = !items.length ? "none" : roles.has("u") && roles.has("a") ? "turns" : "blocks";
    const entries = items.map((x) => x.entry);
    const digest = entries.length ? hash64(`${granularity}\n${entries.join("|")}`) : "";
    const gen = generating();
    if (gen) ledger.generatingSeenAt = Date.now();
    const key = conversationKey(location.href);
    const changed = digest !== ledger.digest || gen !== ledger.generating || key !== ledger.conversationKey;
    ledger.entries = entries;
    ledger.texts = items;
    ledger.granularity = granularity;
    if (changed) {
      ledger.digest = digest;
      ledger.generating = gen;
      ledger.conversationKey = key;
      ledger.revision += 1;
      ledger.changedAt = Date.now();
      for (const wake of [...ledger.waiters]) wake();
    }
  };
  const schedule = () => {
    const now = Date.now();
    if (!ledger.firstDirtyAt) ledger.firstDirtyAt = now;
    clearTimeout(ledger.timer);
    const wait = now - ledger.firstDirtyAt >= 4000 ? 0 : 1200;
    ledger.timer = setTimeout(() => {
      ledger.firstDirtyAt = 0;
      recompute();
    }, wait);
  };
  const ensureObserver = () => {
    if (ledger.observer || !document.body) return;
    ledger.observer = new MutationObserver(schedule);
    ledger.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  };
  setInterval(() => {
    if (ledger.observer && Date.now() - ledger.lastReadAt > 5 * 60 * 1000) {
      ledger.observer.disconnect();
      ledger.observer = null;
    }
    // Route changes without DOM mutations still change the key.
    if (ledger.hints && conversationKey(location.href) !== ledger.conversationKey) schedule();
  }, 2000);

  const fingerprint = (prompt) => {
    const items = ledger.texts;
    const tail = ledger.entries.slice(-12);
    const tailChars = items.slice(-12).reduce((n, x) => n + x.text.length, 0);
    const lastUser = [...items].reverse().find((x) => x.role === "u");
    let viewportAtEnd = true;
    try {
      const el = document.scrollingElement;
      const scrollers = qsa("main, [role=main], [role=log], div").filter((n) => n.scrollHeight > n.clientHeight + 48 && /(auto|scroll|overlay)/.test(getComputedStyle(n).overflowY));
      const target = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? el;
      viewportAtEnd = target.scrollHeight - target.scrollTop - target.clientHeight < 240;
    } catch {
      viewportAtEnd = true;
    }
    const active = document.activeElement;
    const composerFocused = !!active && (active.tagName === "TEXTAREA" || active.isContentEditable);
    const idleMs = input.seen ? Date.now() - input.lastAt : null;
    let containsPrompt = false;
    if (prompt) containsPrompt = items.some((x) => x.role !== "a" && textsOverlap(x.text, prompt));
    return {
      ledgerVersion: LEDGER_VERSION,
      ledgerId,
      documentId: DOCUMENT_ID,
      href: location.href,
      conversationKey: ledger.conversationKey,
      revision: ledger.revision,
      granularity: ledger.granularity,
      turnCount: ledger.entries.length,
      hasPair: ledger.granularity === "turns",
      digest: ledger.digest,
      tail,
      tailChars,
      lastUser: lastUser ? { head: lastUser.text.slice(0, 160), tail: lastUser.text.slice(-160) } : null,
      containsPrompt,
      generating: ledger.generating,
      generatingSeenAgoMs: ledger.generatingSeenAt ? Date.now() - ledger.generatingSeenAt : null,
      stableForMs: Date.now() - ledger.changedAt,
      viewportAtEnd,
      visible: document.visibilityState === "visible",
      input: { seen: input.seen, idleMs, editing: composerFocused && idleMs !== null && idleMs < 30000 },
    };
  };

  const getConversationFingerprint = async ({ prompt, waitMs = 0, since, hints, config } = {}) => {
    ledger.lastReadAt = Date.now();
    const hintsKey = JSON.stringify(hints ?? null);
    if (hints && hintsKey !== ledger.hintsKey) {
      ledger.hints = hints;
      ledger.hintsKey = hintsKey;
      ledger.config = config ?? {};
      if (Array.isArray(config?.generating) && config.generating.length) generatingSelectors = [...config.generating, ...GENERIC_GENERATING];
      await recompute();
    }
    ensureObserver();
    if (since !== undefined && since !== null && Number(since) === ledger.revision && waitMs > 0) {
      await new Promise((resolve) => {
        const done = () => {
          ledger.waiters.delete(done);
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(done, Math.min(Number(waitMs) || 0, 25000));
        ledger.waiters.add(done);
      });
    }
    return fingerprint(prompt);
  };

  cc.define("summary", {
    getSummaryRuntimeState: () => ({ ready: true, documentId: DOCUMENT_ID, href: location.href, ledgerVersion: LEDGER_VERSION }),
    collectSummary: async (payload) => {
      const result = await collectSummary(payload);
      if (payload?.idle) {
        // Report the ledger as it stands after our own hovering and scrolling (04 §5.8).
        await cc.sleep(300);
        await recompute();
        result.fingerprint = fingerprint(payload.prompt);
      }
      return result;
    },
    cancelSummaryCollection: ({ runId } = {}) => {
      if (runId && runs.has(runId)) runs.get(runId).aborted = true;
      else if (!runId) for (const run of runs.values()) run.aborted = true;
      return true;
    },
    getConversationFingerprint,
  });
}
