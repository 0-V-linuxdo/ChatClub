// Topic deletion inside a chat iframe (v2 05 §4.3–§4.6). The page starts a session with `deleteThread`;
// when a site ignores synthetic input the session pauses and asks the page for one trusted click or key,
// after re-verifying the target (rule 3). Only menu items that clearly say "delete" are ever clicked (rule 4).
/* @include lib/userscript-bridge.js */
const cc = globalThis.__chatclub;
if (cc && !cc.has("delete")) {
  const DELETE_TEXT = /^(delete|delete chat|delete conversation|delete thread|delete permanently|删除|删除对话|删除聊天|删除会话|永久删除|刪除|削除)$/i;
  const NEAR_MISS = /archive|归档|封存|clear|清空|leave|rename|重命名|share|分享/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sels = (v) => [].concat(v ?? []).filter((s) => typeof s === "string" && s.trim());
  const qsa = (sel, root = document) => {
    const out = [];
    for (const s of sels(sel)) {
      try {
        out.push(...root.querySelectorAll(s));
      } catch {
        // bad selector from settings
      }
    }
    return [...new Set(out)];
  };
  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  // Icon fonts spell their glyph as text (a Material "delete" icon reads "delete"), so icons are left out.
  const ICONS = "mat-icon, .material-icons, .material-symbols-outlined, .material-symbols-rounded, .google-symbols, svg, [aria-hidden='true']";
  const textOf = (el) => {
    if (!el) return "";
    let text = el.innerText || el.textContent || "";
    if (el.querySelector?.(ICONS)) {
      const copy = el.cloneNode(true);
      copy.querySelectorAll(ICONS).forEach((n) => n.remove());
      text = copy.textContent || "";
    }
    return (text || el.getAttribute?.("aria-label") || "").replace(/\s+/g, " ").trim();
  };
  const clearlyDelete = (el) => {
    const text = textOf(el);
    const label = (el.getAttribute("aria-label") || "").trim();
    return (DELETE_TEXT.test(text) || DELETE_TEXT.test(label)) && !NEAR_MISS.test(`${text} ${label}`);
  };
  const waitFor = async (fn, ms, step = 80) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() >= end) return null;
      await sleep(step);
    }
  };

  // ---------------------------------------------------------------- identity (mirrors model.js)
  const ID = "[A-Za-z0-9_-]{6,}";
  const ROUTES = {
    chatgpt: [`^/c/(${ID})`, `^/g/[^/]+/c/(${ID})`],
    claude: [`^/chat/(${ID})`],
    gemini: [`^/app/(${ID})`, `^/u/\\d+/app/(${ID})`],
    kagi: [`^/c/(${ID})`, `^/chat/(${ID})`],
    grok: [`^/c/(${ID})`, `^/chat/(${ID})`],
    grokMirror: [`^/c/(${ID})`, `^/chat/(${ID})`],
    deepseek: [`^/chat/s/(${ID})`, `^/a/chat/s/(${ID})`],
  };
  const identityNow = (cfg) => {
    if (cfg.routePattern) {
      try {
        const m = new RegExp(cfg.routePattern).exec(location.pathname + location.search);
        return m?.[1] ? { site: cfg.id, id: m[1] } : null;
      } catch {
        return null;
      }
    }
    if (cfg.id === "notion") {
      const t = new URLSearchParams(location.search).get("t");
      return /^\/chat\/?$/.test(location.pathname) && t ? { site: cfg.id, id: t } : null;
    }
    for (const re of ROUTES[cfg.id] ?? []) {
      const m = new RegExp(re).exec(location.pathname);
      if (m) return { site: cfg.id, id: m[1] };
    }
    return null;
  };
  const same = (a, b) => !!a && !!b && a.site === b.site && a.id === b.id;

  // ---------------------------------------------------------------- finding things
  const linkFor = (cfg, ident) => qsa(cfg.slots.conversationLink || "a[href]", qsa(cfg.slots.scope)[0] || document).find((a) => {
    const href = a.getAttribute("href") || "";
    return href.includes(ident.id) && visible(a);
  }) ?? null;
  const rowFor = (cfg, ident) => {
    const link = linkFor(cfg, ident);
    if (!link) return null;
    for (const s of sels(cfg.slots.conversationRow)) {
      const row = link.closest(s);
      if (row) return row;
    }
    return link.parentElement;
  };
  const dialog = (cfg) => qsa(cfg.slots.dialog || "[role='dialog'], [role='alertdialog'], dialog[open]").find(visible) ?? null;
  const menu = (cfg) => qsa(cfg.slots.menuRoot || "[role='menu']").filter(visible).pop() ?? null;
  const deleteItem = (cfg) => {
    const root = menu(cfg);
    if (!root) return null;
    const items = qsa(cfg.slots.deleteCandidate || "[role='menuitem'], button, [role='option']", root).filter(visible);
    return items.find(clearlyDelete) ?? null;
  };
  const confirmButton = (cfg) => {
    const root = dialog(cfg);
    if (!root) return null;
    return qsa(cfg.slots.confirmCandidate || "button", root).filter(visible).find(clearlyDelete) ?? null;
  };
  const titleButton = (cfg) => {
    // Claude: the one button whose text is exactly the topic title, with its own menu (aria-controls).
    const title = document.title.replace(/\s+[-–|]\s+Claude\s*$/i, "").trim();
    if (!title) return null;
    const hits = qsa(cfg.slots.menuTrigger || "button[aria-haspopup]").filter((b) => visible(b) && textOf(b) === title);
    return hits.length === 1 ? hits[0] : null;
  };
  const menuTrigger = (cfg, ident) => {
    if (cfg.flow === "titleMenu") return titleButton(cfg);
    if (cfg.flow === "rowMenu") {
      const triggerSel = cfg.slots.menuTrigger || "button[aria-haspopup], [aria-haspopup]";
      const row = rowFor(cfg, ident);
      // Hover-only row buttons (Gemini) can't be clicked; the header menu is used instead.
      const inRow = row ? qsa(triggerSel, row).find((b) => b !== row && visible(b)) : null;
      if (inRow) return inRow;
      // The trigger can sit beside the link rather than inside the row (Gemini): climb while the
      // ancestor still holds only this one conversation, so another topic's button is never picked.
      const link = linkFor(cfg, ident);
      const linkSel = cfg.slots.conversationLink || "a[href]";
      for (let el = link?.parentElement, i = 0; el && el !== document.body && i < 4; el = el.parentElement, i++) {
        if (qsa(linkSel, el).filter((a) => (a.getAttribute("href") || "").length).length > 1) break;
        const near = qsa(triggerSel, el).find((b) => b !== link && !b.contains(link) && visible(b));
        if (near) return near;
      }
      if (!cfg.headerFallback) return null;
    }
    return qsa(cfg.slots.headerMenuTrigger || cfg.slots.menuTrigger, qsa(cfg.slots.headerScope)[0] || document).find(visible) ?? null;
  };

  // ---------------------------------------------------------------- input
  const synthClick = (el) => {
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerover", opts));
    el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerType: "mouse", isPrimary: true, buttons: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown", { ...opts, buttons: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.click();
  };
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const shortcutKeys = () => [{ key: "Backspace", code: "Backspace", keyCode: 8, modifiers: [isMac ? "meta" : "ctrl", "shift"] }];
  const synthShortcut = () => {
    const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    const init = { key: "Backspace", code: "Backspace", keyCode: 8, which: 8, shiftKey: true, metaKey: isMac, ctrlKey: !isMac, bubbles: true, cancelable: true, composed: true };
    target.dispatchEvent(new KeyboardEvent("keydown", init));
    target.dispatchEvent(new KeyboardEvent("keyup", init));
  };
  const centerOf = (el) => {
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
  };

  // ---------------------------------------------------------------- session
  // Steps: open (shortcut or menu) → pick (delete item) → confirm. Each returns a result or "next".
  let session = null;
  const finish = (result) => {
    session = null;
    return result;
  };
  const fail = (reason) => finish({ status: "failed", reason });

  /** Trusted input is allowed for this step? (per-site policy and the session budget) */
  const mayTrust = (s, step) => s.cfg.trusted?.[step] && s.trustedLeft > 0;
  const pauseForTrusted = (s, step, kind, el, keys) => {
    s.trustedLeft -= 1;
    s.pending = { step, kind, el, rect: el ? centerOf(el) : null, keys };
    return { status: "needsTrusted", token: s.token, kind, step, point: s.pending.rect ? { x: s.pending.rect.x, y: s.pending.rect.y } : null, keys: keys ?? null };
  };
  const expectFor = (s, step) => {
    if (step === "open") return () => (s.cfg.flow === "shortcut" ? dialog(s.cfg) : deleteItem(s.cfg));
    if (step === "pick") return () => dialog(s.cfg);
    return () => !confirmButton(s.cfg);
  };

  const run = async (s) => {
    while (s.step) {
      if (!same(identityNow(s.cfg), s.identity)) return finish({ status: "skipped", reason: "identity-changed" });
      if (Date.now() > s.deadline) return fail("timeout");
      const step = s.step;
      const policy = s.cfg.trusted?.[step];
      if (step === "open" && s.cfg.flow === "shortcut") {
        synthShortcut();
        if (await waitFor(expectFor(s, step), 1500)) {
          s.step = "confirm";
          continue;
        }
        if (mayTrust(s, step)) return pauseForTrusted(s, step, "key", null, shortcutKeys());
        return fail("shortcut-ignored");
      }
      if (step === "open") {
        const trigger = await waitFor(() => menuTrigger(s.cfg, s.identity), 2000);
        if (!trigger) return fail("no-menu-trigger");
        if (policy === "always" && s.trustedLeft > 0) return pauseForTrusted(s, step, "click", trigger);
        // Some menus (DeepSeek) open only after repeated activation.
        let opened = null;
        for (let i = 0; i < (s.cfg.activateRepeats || 1) && !opened; i++) {
          synthClick(trigger);
          opened = await waitFor(expectFor(s, step), 1200);
        }
        if (opened) {
          s.step = "pick";
          continue;
        }
        if (mayTrust(s, step)) return pauseForTrusted(s, step, "click", trigger);
        return fail(menu(s.cfg) ? "no-delete-item" : "menu-did-not-open");
      }
      if (step === "pick") {
        const item = deleteItem(s.cfg);
        if (!item) return fail("no-delete-item");
        if (policy === "always" && s.trustedLeft > 0) return pauseForTrusted(s, step, "click", item);
        synthClick(item);
        if (await waitFor(expectFor(s, step), 2000)) {
          s.step = "confirm";
          continue;
        }
        if (s.cfg.dialogOptional) return finish({ status: "triggered", confirmed: false });
        if (mayTrust(s, step)) return pauseForTrusted(s, step, "click", item);
        return fail("no-confirm-dialog");
      }
      if (step === "confirm") {
        const button = await waitFor(() => confirmButton(s.cfg), 1500);
        if (!button) return fail("no-confirm-button");
        if (policy === "always" && s.trustedLeft > 0) return pauseForTrusted(s, step, "click", button);
        synthClick(button);
        if (await waitFor(expectFor(s, step), 1500)) return finish({ status: "triggered", confirmed: true });
        if (mayTrust(s, step)) return pauseForTrusted(s, step, "click", button);
        return fail("confirm-ignored");
      }
      return fail("bad-step");
    }
    return fail("bad-step");
  };

  /** A custom delete script (05 §4.3) runs in the MAIN world; the background fetches it by config id. */
  const runScript = async (s) => {
    const reply = await cc.request("UserScriptsRuntime.executeTopicDeleteUserscript", { configId: s.cfg.id, href: location.href, channel: userscriptChannel(), payload: { identity: s.identity } });
    if (!reply?.ok) return fail(reply?.error || "custom scripts are not available");
    const data = reply.result?.data;
    if (data && typeof data === "object" && data.ok === false) return fail(String(data.reason || data.error || "script-failed"));
    return finish({ status: "triggered", confirmed: data && typeof data === "object" && "confirmed" in data ? !!data.confirmed : true, viaScript: true });
  };

  const NEXT = { open: (s) => (s.cfg.flow === "shortcut" ? "confirm" : "pick"), pick: () => "confirm", confirm: () => null };

  cc.define("delete", {
    deleteThread: async (p = {}) => {
      if (p.token) {
        const s = session;
        if (!s || s.token !== p.token || !s.pending) return { status: "failed", reason: "no-session" };
        if (p.action === "verify") {
          // Checked here, right before the trusted input; after it a successful delete may well leave the topic.
          if (!same(identityNow(s.cfg), s.identity)) return finish({ status: "skipped", reason: "identity-changed" });
          // Rule 3: same element, same place, same topic.
          const { el, rect, kind } = s.pending;
          if (kind === "key") return { status: "verified", point: null };
          if (!el?.isConnected || !visible(el)) return fail("target-moved");
          const now = centerOf(el);
          if (Math.abs(now.x - rect.x) > 2 || Math.abs(now.y - rect.y) > 2 || Math.abs(now.w - rect.w) > 2) {
            s.pending.rect = now;
            return { status: "verified", point: { x: now.x, y: now.y }, moved: true };
          }
          return { status: "verified", point: { x: rect.x, y: rect.y } };
        }
        if (p.action === "resume") {
          const { step } = s.pending;
          s.pending = null;
          if (step === "confirm") {
            return (await waitFor(expectFor(s, step), 1500)) ? finish({ status: "triggered", confirmed: true }) : fail("confirm-ignored");
          }
          if (!(await waitFor(expectFor(s, step), 2000))) {
            if (step === "pick" && s.cfg.dialogOptional) return finish({ status: "triggered", confirmed: false });
            return fail(step === "open" ? (menu(s.cfg) ? "no-delete-item" : "menu-did-not-open") : "no-confirm-dialog");
          }
          s.step = NEXT[step](s);
          return run(s);
        }
        if (p.action === "cancel") return finish({ status: "cancelled" });
        return { status: "failed", reason: "bad-action" };
      }
      const cfg = p.config;
      if (!cfg?.id) return { status: "failed", reason: "no-config" };
      cfg.slots = cfg.slots ?? {};
      const identity = identityNow(cfg);
      if (!identity) return { status: "skipped", reason: "not-in-topic" };
      if (p.identity && !same(identity, p.identity)) return { status: "skipped", reason: "identity-changed" };
      if (session) return { status: "failed", reason: "busy" };
      session = {
        token: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        cfg,
        identity,
        step: "open",
        trustedLeft: Number.isFinite(cfg.trustedBudget) ? cfg.trustedBudget : 1,
        deadline: Date.now() + (Number(cfg.timeoutMs) || 15000) - 1500,
        pending: null,
      };
      try {
        if (cfg.hasScript) return await runScript(session);
        return await run(session);
      } catch (error) {
        return fail(String(error?.message || error));
      }
    },
    getDeleteConfirmState: ({ identity, config } = {}) => {
      const cfg = { slots: {}, ...(config ?? {}) };
      const now = cfg.id ? identityNow(cfg) : null;
      const ident = identity ?? now;
      const listed = ident ? !!linkFor(cfg, ident) : false;
      return {
        version: 1,
        present: !!qsa(cfg.slots.dialog || "[role='dialog'], [role='alertdialog'], dialog[open]").find(visible),
        target: { identity: ident, current: same(now, ident), present: listed },
      };
    },
  });
}
