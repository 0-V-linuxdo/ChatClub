// Base capability: page meta, text, location reports, click/shortcut forwarding.
const cc = globalThis.__chatclub;
if (cc && !cc.has("base")) {
  let lastHref = location.href;
  const reportLocation = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    cc.emit("location", { href: lastHref, title: document.title });
    setTimeout(reportIcon, 1200);
  };
  setInterval(reportLocation, 800);
  window.addEventListener("popstate", reportLocation);
  window.addEventListener("hashchange", reportLocation);

  const iconHref = () => {
    const link = document.querySelector('link[rel~="icon"][href], link[rel="apple-touch-icon"][href]');
    return link ? new URL(link.getAttribute("href"), location.href).href : "";
  };
  // Report the page's declared icon (tab favicon source, 02 §2.2).
  let lastIcon = "";
  const reportIcon = () => {
    let href = "";
    try {
      href = iconHref();
    } catch {
      href = "";
    }
    if (!href || href === lastIcon || !/^https?:/.test(href)) return;
    lastIcon = href;
    cc.emit("favicon", { href });
  };
  setTimeout(reportIcon, 1500);
  window.addEventListener("load", () => setTimeout(reportIcon, 300), { once: true });

  // Messages from the MAIN-world preload (route changes, close requests, blocked focus steals).
  window.addEventListener("chatclub:main", (event) => {
    let data;
    try {
      data = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (data.type === "locationChanged") setTimeout(reportLocation, 0);
    else if (data.type === "closeRequested") cc.emit("closeRequested", {});
    else if (data.type === "focusBlocked") cc.emit("focusBlocked", {});
  });
  // Focus calls from ChatClub's content scripts (this isolated world) are announced to the preload,
  // which otherwise undoes focus that lands during the caret lease.
  for (const proto of [HTMLElement.prototype, SVGElement.prototype]) {
    const original = proto.focus;
    proto.focus = function focus(...args) {
      window.dispatchEvent(new CustomEvent("chatclub:ownFocus"));
      return original.apply(this, args);
    };
  }
  cc.setLease = (kind, until) => window.dispatchEvent(new CustomEvent("chatclub:lease", { detail: JSON.stringify({ kind, until }) }));

  // Tell the page when the user clicks inside the chat (focus rules, auto-hide top bar).
  window.addEventListener("pointerdown", (event) => {
    if (event.isTrusted) cc.emit("userClick", {});
  }, true);
  // Tell the page when the pointer moves into the chat: the page itself gets no event then (auto-hide top bar).
  document.documentElement.addEventListener("pointerenter", (event) => {
    if (event.isTrusted) cc.emit("pointerEnter", {});
  });

  // Forward modifier shortcuts so they work while focus is inside the chat iframe.
  window.addEventListener("keydown", (event) => {
    if (!event.isTrusted || event.isComposing) return;
    if (!(event.altKey || event.ctrlKey || event.metaKey)) return;
    if (/^(Meta|Control|Alt|Shift)/.test(event.key)) return;
    const combos = cc.forwardCombos;
    const combo = [event.metaKey && "Meta", event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.code].filter(Boolean).join("+");
    const digitCombo = combo.replace(/Digit[1-9]$/, "Digit");
    if (combos && !combos.includes(combo) && !combos.includes(digitCombo)) return;
    if (combos) {
      event.preventDefault();
      event.stopPropagation();
    }
    cc.emit("keydown", { code: event.code, key: event.key, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey });
  }, true);


  // ---------------------------------------------------------------- long screenshot (04 §4.4)
  let shot = null;
  const mainScroller = () => {
    const doc = document.scrollingElement || document.documentElement;
    if (doc.scrollHeight - innerHeight > 24) return doc;
    let best = null;
    let score = 0;
    for (const el of document.querySelectorAll("main, section, article, div, [role=log], [role=main]")) {
      const room = el.scrollHeight - el.clientHeight;
      if (room < 48 || !/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) continue;
      const r = el.getBoundingClientRect();
      const area = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      if (room * area > score) {
        score = room * area;
        best = el;
      }
    }
    return best ?? doc;
  };
  const metrics = () => {
    const el = shot.el;
    const isDoc = el === document.scrollingElement || el === document.documentElement;
    const vh = isDoc ? innerHeight : el.clientHeight;
    const y = isDoc ? scrollY : el.scrollTop;
    const maxY = Math.max(0, el.scrollHeight - vh);
    return { viewportWidth: innerWidth, viewportHeight: innerHeight, scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight, scrollX: isDoc ? scrollX : el.scrollLeft, scrollY: y, maxY, devicePixelRatio: devicePixelRatio || 1, overlapPx: 64, done: y >= maxY - 1, scrollerHeight: vh };
  };
  const scrollToY = (y) => {
    const el = shot.el;
    if (el === document.scrollingElement || el === document.documentElement) scrollTo(scrollX, y);
    else el.scrollTop = y;
  };
  const hideStrips = () => {
    const hidden = [];
    const tallMax = Math.max(48, innerHeight * 0.22);
    const wideMax = Math.max(72, innerWidth * 0.28);
    for (const el of document.body?.querySelectorAll("*") ?? []) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9) continue;
      const topOrBottom = (r.top <= 1 || r.bottom >= innerHeight - 1) && r.height <= tallMax;
      const side = (r.left <= 1 || r.right >= innerWidth - 1) && r.width <= wideMax;
      if (!topOrBottom && !side) continue;
      hidden.push([el, el.style.getPropertyValue("visibility"), el.style.getPropertyPriority("visibility")]);
      el.style.setProperty("visibility", "hidden", "important");
    }
    return hidden;
  };
  const endShot = () => {
    if (!shot) return false;
    for (const [el, v, prio] of shot.hidden) {
      if (v) el.style.setProperty("visibility", v, prio);
      else el.style.removeProperty("visibility");
    }
    scrollToY(shot.originY);
    shot = null;
    return true;
  };

  cc.define("base", {
    ping: () => ({ ok: true, href: location.href }),
    captureStart: async () => {
      if (shot) endShot();
      const el = mainScroller();
      shot = { el, originY: 0, hidden: [] };
      shot.originY = metrics().scrollY;
      shot.hidden = hideStrips();
      scrollToY(0);
      await new Promise((r) => requestAnimationFrame(() => r()));
      return metrics();
    },
    triggerScroll: async ({ step } = {}) => {
      if (!shot) throw new Error("capture not started");
      const m = metrics();
      const by = Number(step) > 0 ? Math.min(Number(step), m.scrollerHeight - 64) : m.scrollerHeight - 64;
      scrollToY(Math.min(m.maxY, m.scrollY + Math.max(1, by)));
      await new Promise((r) => requestAnimationFrame(() => r()));
      return metrics();
    },
    captureEnd: () => endShot(),

    getPageMeta: () => ({ href: location.href, title: document.title, icon: iconHref(), readyState: document.readyState }),
    getLocationHref: () => location.href,
    getPageText: ({ maxLength = 200000 } = {}) => (document.body?.innerText || "").slice(0, maxLength),
    navigate: ({ href }) => {
      const url = new URL(href, location.href);
      if (!/^https?:$/.test(url.protocol)) throw new Error("bad url");
      location.replace(url.href);
      return true;
    },
    historyBack: () => {
      history.back();
      return true;
    },
    setLease: ({ kind = "caret", until = 0 }) => {
      cc.setLease(kind, Number(until) || 0);
      return true;
    },
    setForwardCombos: ({ combos }) => {
      cc.forwardCombos = Array.isArray(combos) ? combos : null;
      return true;
    },
  });
}
