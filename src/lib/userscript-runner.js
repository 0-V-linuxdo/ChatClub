// MAIN-world runner for custom Summary / topic-delete scripts (v2 04 §1.6, 05 §4.3).
// The background serializes this function with toString() and injects it with userScripts.execute,
// so it must stay self-contained: no imports, no outer variables.
//
// opts: { kind, href, channel, timeoutMs, config, generating, local }
// script: the user's async function (api) => messages | { messages } | result
// Pure DOM helpers run here; the collection helpers (copy, official rules, …) are bridged to the
// ISOLATED content script over `chatclub:us-call:<channel>` / `chatclub:us-reply:<channel>` events.

export function userscriptRunner(opts, script) {
  if (location.href !== opts.href) return { ok: false, error: "address changed" };
  const deadline = Date.now() + Math.max(1000, Number(opts.timeoutMs) || 28500);
  const REF = "data-cc-us-ref";
  let seq = 0;
  const pending = new Map();
  const tag = (el) => {
    let id = el.getAttribute(REF);
    if (!id) {
      id = `r${Date.now().toString(36)}${(seq += 1)}`;
      el.setAttribute(REF, id);
    }
    return { __ccRef: id };
  };
  const encode = (v, depth = 0) => {
    if (depth > 8) return null;
    if (v instanceof Element) return tag(v);
    if (Array.isArray(v)) return v.map((x) => encode(x, depth + 1));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x, depth + 1)]));
    return typeof v === "function" ? undefined : v;
  };
  const decode = (v) => {
    if (Array.isArray(v)) return v.map(decode);
    if (v && typeof v === "object") {
      if (typeof v.__ccRef === "string") return document.querySelector(`[${REF}="${v.__ccRef}"]`);
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
    }
    return v;
  };
  const onReply = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.detail);
    } catch {
      return;
    }
    const p = pending.get(msg?.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(decode(msg.value));
    else p.reject(new Error(msg.error || "bridge call failed"));
  };
  window.addEventListener(`chatclub:us-reply:${opts.channel}`, onReply);
  const call = (method, ...args) =>
    new Promise((resolve, reject) => {
      if (Date.now() > deadline) return reject(new Error("timeout"));
      const id = `c${Date.now().toString(36)}${(seq += 1)}`;
      pending.set(id, { resolve, reject });
      window.dispatchEvent(new CustomEvent(`chatclub:us-call:${opts.channel}`, { detail: JSON.stringify({ id, method, args: encode(args) }) }));
    });

  const qs = (sel, root = document) => {
    try {
      return sel ? (root || document).querySelector(sel) : null;
    } catch {
      return null;
    }
  };
  const qsa = (sel, root = document) => {
    try {
      return sel ? [...(root || document).querySelectorAll(sel)] : [];
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
  const visible = (node) => {
    if (!node?.getBoundingClientRect) return false;
    const r = node.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return false;
    const s = getComputedStyle(node);
    return s.display !== "none" && s.visibility !== "hidden";
  };
  const normalize = (text) =>
    String(text ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/ /g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const text = (node) => {
    if (!node?.cloneNode) return "";
    const clone = node.cloneNode(true);
    for (const el of clone.querySelectorAll?.("button, [role=button], svg, style, script, template, noscript, input, textarea, select, .sr-only, .visually-hidden") ?? []) el.remove();
    return normalize(clone.textContent ?? "");
  };
  const buttonText = (el) =>
    el
      ? [el.textContent, el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("data-testid"), el.getAttribute("data-test-id"), typeof el.className === "string" ? el.className : ""]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .slice(0, 300)
      : "";
  const reveal = (node) => {
    if (!node) return;
    try {
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {
      // ignore
    }
    const r = node.getBoundingClientRect();
    const init = { bubbles: true, composed: true, clientX: r.left + Math.min(20, r.width / 2), clientY: r.top + Math.min(20, r.height / 2), view: window };
    for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointermove", "mousemove"]) {
      node.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, { ...init, pointerType: "mouse" }) : new MouseEvent(type, init));
    }
  };
  const merge = (messages) => {
    const out = [];
    for (const m of messages ?? []) {
      const t = String(m?.text ?? "").trim();
      if (!t) continue;
      const prev = out[out.length - 1];
      if (prev && prev.role === m.role) prev.text = `${prev.text}\n\n${t}`;
      else out.push({ role: m.role, text: t });
    }
    return out;
  };
  const sleep = (ms) =>
    new Promise((resolve, reject) => {
      const wait = Math.max(0, Number(ms) || 0);
      if (Date.now() + wait > deadline) return setTimeout(() => reject(new Error("timeout")), Math.max(0, deadline - Date.now()));
      setTimeout(resolve, wait);
    });
  const generating = () =>
    (opts.generating ?? []).some((s) => {
      const el = qs(s);
      return !!el && (el.tagName !== "BUTTON" || visible(el));
    });
  const click = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mousedown", init));
    el.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mouseup", init));
    el.dispatchEvent(new MouseEvent("click", init));
    return true;
  };
  const waitFor = async (sel, ms = 3000, root = document) => {
    const end = Date.now() + Math.max(0, Number(ms) || 0);
    for (;;) {
      const el = qs(sel, root);
      if (el) return el;
      if (Date.now() >= end) return null;
      await sleep(Math.min(100, end - Date.now()));
    }
  };

  const api = { config: opts.config ?? {}, sleep, normalize, qs, qsa, closest, visible, text, buttonText, reveal, merge };
  if (opts.kind === "delete") Object.assign(api, { payload: opts.payload ?? {}, click, waitFor });
  for (const name of opts.bridged ?? []) api[name] = (...args) => call(name, ...args);
  api.conversationIsGenerating = generating;
  api.extractDeepSeekNativeCopyMessages = api.extractNativeCopyConversation;
  api.extractGrokNativeCopyMessages = api.extractNativeCopyConversation;

  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), Math.max(0, deadline - Date.now()));
  });
  return Promise.race([Promise.resolve().then(() => script(api)), timeout])
    .then((data) => ({ ok: true, data: data === undefined ? null : JSON.parse(JSON.stringify(data)) }))
    .catch((error) => ({ ok: false, error: String(error?.message || error) }))
    .finally(() => {
      clearTimeout(timer);
      window.removeEventListener(`chatclub:us-reply:${opts.channel}`, onReply);
      for (const el of document.querySelectorAll(`[${REF}]`)) el.removeAttribute(REF);
    });
}
