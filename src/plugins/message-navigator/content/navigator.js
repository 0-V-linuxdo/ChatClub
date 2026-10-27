// Message navigator inside a chat iframe (v2 05 §3): a tick rail on the right, a hover menu, jump + landing effect.
const cc = globalThis.__chatclub;
if (cc && !cc.has("message-navigator")) {
  /* @include lib/navigator-effects.js */

  const ROOT_ID = "chatclub-message-navigator";
  const qsa = (sel, root = document) => {
    if (!sel) return [];
    try {
      return [...root.querySelectorAll(sel)];
    } catch {
      return [];
    }
  };
  const joinSel = (v) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : String(v || ""));

  let config = null;
  let enabled = false;
  let effectMode = "border";
  let topOffset = 64;
  let color = "";
  let items = [];
  let currentIndex = -1;
  let host = null;
  let shadow = null;
  let rail = null;
  let menu = null;
  let menuTimer = 0;
  let observer = null;
  let rebuildTimer = 0;
  let lastBuild = 0;

  // ---------------------------------------------------------------- generic adapter (05 §3.1)
  const GENERIC_CANDIDATES = [
    "[data-message-author-role]",
    "[data-testid^='conversation-turn']",
    "[data-message-id]",
    "[data-role='user'], [data-role='assistant']",
    "[class*='message-row']",
    "[class*='chat-message']",
    "[class*='ChatMessage']",
    "[class*='message_']",
    "main article",
  ];
  const genericConfig = () => {
    let best = null;
    for (const sel of GENERIC_CANDIDATES) {
      const n = qsa(sel).filter((el) => el.offsetHeight > 8).length;
      if (n >= 2 && (!best || n > best.n)) best = { sel, n };
    }
    return best ? { id: "generic", messageSelector: best.sel, userSelector: "", assistantSelector: "", textCleanupSelectors: [], summaryMaxChars: 60, generic: true } : null;
  };
  const activeConfig = () => config ?? genericConfig();

  // ---------------------------------------------------------------- messages
  const roleOf = (node, cfg, index, list) => {
    const userSel = joinSel(cfg.userSelector);
    const asstSel = joinSel(cfg.assistantSelector);
    const thinkSel = joinSel(cfg.thinkingSelector);
    const hit = (sel) => {
      if (!sel) return false;
      try {
        return node.matches(sel) || !!node.querySelector(sel) || !!node.closest(sel);
      } catch {
        return false;
      }
    };
    const attrs = `${node.className || ""} ${node.getAttribute("data-message-author-role") || ""} ${node.getAttribute("data-role") || ""} ${node.getAttribute("data-testid") || ""}`.toLowerCase();
    if (thinkSel && (node.matches?.(thinkSel) || node.closest?.(thinkSel))) return "thinking";
    if (/\b(thinking|thought|reasoning)\b/.test(attrs)) return "thinking";
    if (hit(userSel)) return "user";
    if (hit(asstSel)) return "assistant";
    if (/\buser\b|human|query|question|request/.test(attrs)) return "user";
    if (/assistant|\bbot\b|\bai\b|model|response|answer/.test(attrs)) return "assistant";
    // Alignment guess: user bubbles usually sit on the right.
    const r = node.getBoundingClientRect();
    const parent = node.parentElement?.getBoundingClientRect();
    if (parent && r.width < parent.width * 0.85 && r.left - parent.left > parent.right - r.right + 24) return "user";
    const prev = list[index - 1]?.role;
    return prev === "user" ? "assistant" : prev === "assistant" ? "user" : "assistant";
  };
  const summaryOf = (node, cfg) => {
    const clone = node.cloneNode(true);
    for (const sel of [].concat(cfg.textCleanupSelectors ?? [])) for (const el of qsa(sel, clone)) el.remove();
    for (const el of qsa("button, svg, style, script, [aria-hidden='true']", clone)) el.remove();
    // textContent runs block elements together ("4.twoplus two"); pad them first.
    for (const el of qsa("p, li, div, br, pre, h1, h2, h3, h4, h5, h6, td, th, blockquote", clone)) el.append(" ");
    const max = Math.max(20, Math.min(180, Number(cfg.summaryMaxChars) || 60));
    const text = (clone.textContent || "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  };
  const collect = (cfg) => {
    if (!cfg) return [];
    const nodes = qsa(joinSel(cfg.messageSelector)).filter((el) => el.isConnected && !el.closest(`#${ROOT_ID}`));
    const outer = nodes.filter((el) => !nodes.some((o) => o !== el && o.contains(el)));
    const list = [];
    outer.forEach((node, i) => {
      if (!(node.offsetHeight > 0 || node.getClientRects().length)) return;
      const role = roleOf(node, cfg, i, list);
      const summary = summaryOf(node, cfg);
      if (!summary && role !== "thinking") return;
      list.push({ node, role, summary });
    });
    return list;
  };

  // ---------------------------------------------------------------- UI (shadow DOM)
  const STYLE = `
:host { all: initial; }
.root { position: fixed; right: 14px; top: 50%; transform: translateY(-50%); z-index: 2147483200; font: 15px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; --primary: #10a37f; }
.rail { display: flex; flex-direction: column; align-items: flex-end; max-height: 72vh; overflow: hidden; }
.tick { width: 38px; height: 12px; display: flex; align-items: center; justify-content: flex-end; cursor: pointer; border: 0; padding: 0; background: transparent; }
.tick i { display: block; width: 18px; height: 3px; border-radius: 2px; background: rgba(120,120,128,.55); transition: width .15s, background .15s; }
.tick.current i { width: 34px; background: var(--primary); }
.menu { position: absolute; right: 44px; top: 50%; transform: translateY(-50%); width: min(18rem, calc(100vw - 68px)); max-height: min(72vh, 34rem); overflow-y: auto; border-radius: 8px; padding: 6px; box-sizing: border-box;
  background: rgba(255,255,255,.78); color: #111; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); box-shadow: 0 8px 30px rgba(0,0,0,.18); border: 1px solid rgba(0,0,0,.08); display: none; }
.menu.open { display: block; }
.item { display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 8px; border-radius: 6px; cursor: pointer; border: 0; width: 100%; background: transparent; color: inherit; font: inherit; text-align: left; }
.item:hover, .item.current { background: rgba(127,127,127,.16); }
.badge { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: #fff; background: #6b7280; }
.badge.user { background: var(--primary); }
.badge.thinking { background: #a855f7; }
.text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (prefers-color-scheme: dark) { .menu { background: rgba(32,33,35,.78); color: #eee; border-color: rgba(255,255,255,.1); } }
`;
  const ensureUi = () => {
    if (host?.isConnected) return;
    host = document.createElement("div");
    host.id = ROOT_ID;
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    const root = document.createElement("div");
    root.className = "root";
    if (color) root.style.setProperty("--primary", color);
    rail = document.createElement("div");
    rail.className = "rail";
    menu = document.createElement("div");
    menu.className = "menu";
    root.append(rail, menu);
    shadow.append(style, root);
    const open = () => {
      clearTimeout(menuTimer);
      renderMenu();
      menu.classList.add("open");
    };
    const close = () => {
      clearTimeout(menuTimer);
      menuTimer = setTimeout(() => menu.classList.remove("open"), 180);
    };
    rail.addEventListener("mouseenter", open);
    rail.addEventListener("mouseleave", close);
    menu.addEventListener("mouseenter", open);
    menu.addEventListener("mouseleave", close);
    (document.body || document.documentElement).append(host);
  };
  const hideMenu = () => menu?.classList.remove("open");
  const label = (role) => (role === "user" ? "Q" : role === "thinking" ? "T" : "A");
  const renderRail = () => {
    if (!rail) return;
    rail.replaceChildren(...items.map((it, i) => {
      const b = document.createElement("button");
      b.className = `tick${i === currentIndex ? " current" : ""}`;
      b.type = "button";
      b.setAttribute("aria-label", `${label(it.role)} ${it.summary}`);
      b.append(document.createElement("i"));
      b.addEventListener("click", () => jump(i));
      return b;
    }));
  };
  const renderMenu = () => {
    if (!menu) return;
    menu.replaceChildren(...items.map((it, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `item${i === currentIndex ? " current" : ""}`;
      const badge = document.createElement("span");
      badge.className = `badge ${it.role}`;
      badge.textContent = label(it.role);
      const text = document.createElement("span");
      text.className = "text";
      text.textContent = it.summary;
      b.append(badge, text);
      b.addEventListener("click", () => {
        hideMenu();
        jump(i);
      });
      return b;
    }));
  };

  // ---------------------------------------------------------------- scrolling and current item
  const scrollerOf = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll|overlay)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
    }
    return document.scrollingElement || document.documentElement;
  };
  const jump = (i) => {
    const it = items[i];
    if (!it?.node?.isConnected) return;
    const scroller = scrollerOf(it.node);
    const isDoc = scroller === document.scrollingElement || scroller === document.documentElement;
    const top = it.node.getBoundingClientRect().top - (isDoc ? 0 : scroller.getBoundingClientRect().top);
    const target = (isDoc ? scrollY : scroller.scrollTop) + top - topOffset;
    if (isDoc) scrollTo({ top: target, behavior: "smooth" });
    else scroller.scrollTo({ top: target, behavior: "smooth" });
    currentIndex = i;
    renderRail();
    setTimeout(() => playEffect(it.node, effectMode), 420);
  };
  const updateCurrent = () => {
    const line = innerHeight * 0.42;
    let idx = -1;
    items.forEach((it, i) => {
      if (it.node.isConnected && it.node.getBoundingClientRect().top <= line) idx = i;
    });
    if (idx < 0 && items.length) idx = 0;
    if (idx !== currentIndex) {
      currentIndex = idx;
      renderRail();
      if (menu?.classList.contains("open")) renderMenu();
    }
  };

  // ---------------------------------------------------------------- lifecycle
  const rebuild = () => {
    lastBuild = Date.now();
    items = collect(activeConfig());
    if (!enabled) return;
    ensureUi();
    host.style.display = items.length ? "" : "none";
    updateCurrent();
    renderRail();
    if (menu?.classList.contains("open")) renderMenu();
  };
  const scheduleRebuild = () => {
    if (rebuildTimer) return;
    const wait = Math.max(0, 600 - (Date.now() - lastBuild));
    rebuildTimer = setTimeout(() => {
      rebuildTimer = 0;
      rebuild();
    }, wait);
  };
  const onScroll = () => requestAnimationFrame(updateCurrent);
  const onKey = (e) => {
    if (e.key === "Escape") hideMenu();
  };
  const start = () => {
    ensureEffectStyles(document);
    rebuild();
    if (!observer) {
      observer = new MutationObserver((records) => {
        if (records.every((r) => host && (r.target === host || host.contains(r.target)))) return;
        scheduleRebuild();
      });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
    }
    addEventListener("scroll", onScroll, { capture: true, passive: true });
    addEventListener("keydown", onKey, true);
  };
  const stop = () => {
    observer?.disconnect();
    observer = null;
    removeEventListener("scroll", onScroll, { capture: true });
    removeEventListener("keydown", onKey, true);
    host?.remove();
    host = null;
    items = [];
    currentIndex = -1;
  };

  cc.define("message-navigator", {
    setMessageNavigator: ({ enabled: on, config: cfg, effectMode: mode, topOffset: offset, color: tint } = {}) => {
      if (typeof tint === "string" && /^#[0-9a-f]{3,8}$|^rgb/i.test(tint.trim())) {
        color = tint.trim();
        document.documentElement.style.setProperty("--chatclub-nav-color", color);
        shadow?.querySelector(".root")?.style.setProperty("--primary", color);
      }
      if (cfg !== undefined) config = cfg && cfg.messageSelector ? cfg : null;
      if (mode) effectMode = mode;
      if (Number.isFinite(Number(offset))) topOffset = Math.max(30, Math.min(140, Number(offset)));
      const want = !!on;
      if (want && !enabled) {
        enabled = true;
        start();
      } else if (!want && enabled) {
        enabled = false;
        stop();
      } else if (want) rebuild();
      if (!want) items = collect(activeConfig());
      return { enabled, supported: !!activeConfig(), count: items.length };
    },
    hideMessageNavigatorMenu: () => {
      hideMenu();
      return true;
    },
    getMessageNavigatorState: () => {
      if (!enabled) items = collect(activeConfig());
      return { enabled, supported: !!activeConfig(), count: items.length };
    },
    getConversationOpening: ({ config: cfg } = {}) => {
      const list = collect(cfg && cfg.messageSelector ? cfg : activeConfig());
      const first = list.find((x) => x.role === "user");
      if (!first) return { text: "", url: location.href };
      const clone = first.node.cloneNode(true);
      for (const el of qsa("button, svg, style, script", clone)) el.remove();
      return { text: (clone.textContent || "").replace(/\s+/g, " ").trim().slice(0, 2000), url: location.href };
    },
  });
}
