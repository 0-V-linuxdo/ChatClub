// Preload (MAIN world, document_start): identity-dependent page patches for ChatClub chat iframes
// (v2 07 §3.1–§3.2). Inert unless this is a direct ChatClub iframe carrying a valid binding id.
(() => {
  if (window === window.top || window.__chatclubPreload) return;
  let params;
  try {
    params = new URLSearchParams(window.name || "");
  } catch {
    return;
  }
  if (!params.has("chatclub_webview") || !/^[0-9a-f]{64}$/.test(params.get("chatclub_frame_binding") || "")) return;
  Object.defineProperty(window, "__chatclubPreload", { value: true });

  const toIsolated = (type, detail) => {
    try {
      window.dispatchEvent(new CustomEvent("chatclub:main", { detail: JSON.stringify({ type, ...detail }) }));
    } catch {
      // ignore
    }
  };

  // --- user agent the workspace page uses
  const ua = params.get("ua");
  if (ua) {
    try {
      Object.defineProperty(Navigator.prototype, "userAgent", { get: () => ua, configurable: true });
    } catch {
      // ignore
    }
  }

  // --- cookies written by the site must survive in a partitioned third-party iframe (ssc=1)
  if (params.get("ssc") === "1") {
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    if (desc?.set && desc?.get) {
      Object.defineProperty(Document.prototype, "cookie", {
        configurable: true,
        get() {
          return desc.get.call(this);
        },
        set(value) {
          const parts = String(value).split(";").map((p) => p.trim()).filter(Boolean);
          const kept = parts.filter((p, i) => i === 0 || !/^(samesite|secure|partitioned)(=|$)/i.test(p));
          desc.set.call(this, [...kept, "SameSite=None", "Secure", "Partitioned"].join("; "));
        },
      });
    }
  }

  // --- leases: caret lease (composer keeps focus) and focus guard (preferred model); tokens are read once
  const leases = { caret: 0, guard: 0 };
  const readLease = (key) => {
    const until = Number(params.get(key) || 0);
    return Number.isFinite(until) ? until : 0;
  };
  leases.caret = readLease("chatclub_caret_lease");
  leases.guard = readLease("chatclub_focus_guard");
  if (params.has("chatclub_focus_guard") || params.has("chatclub_focus_guard_token")) {
    params.delete("chatclub_focus_guard");
    params.delete("chatclub_focus_guard_token");
    try {
      window.name = params.toString();
    } catch {
      // ignore
    }
  }
  let lastUserInput = 0;
  const markUser = (event) => {
    if (!event.isTrusted) return;
    lastUserInput = Date.now();
    // The user chose this frame: the caret lease yields immediately.
    if (event.type === "pointerdown") leases.caret = 0;
  };
  window.addEventListener("pointerdown", markUser, true);
  window.addEventListener("keydown", markUser, true);
  const leaseActive = () => Date.now() < Math.max(leases.caret, leases.guard);
  const blocking = () => leaseActive() && Date.now() - lastUserInput > 800;
  // Programmatic focus and select() (which also focuses) are refused during a lease.
  for (const [proto, method] of [[HTMLElement.prototype, "focus"], [SVGElement.prototype, "focus"], [HTMLInputElement.prototype, "select"], [HTMLTextAreaElement.prototype, "select"]]) {
    const original = proto[method];
    if (typeof original !== "function") continue;
    proto[method] = function patched(...args) {
      if (blocking()) {
        toIsolated("focusBlocked", {});
        return undefined;
      }
      return original.apply(this, args);
    };
  }
  // Focus that skips those calls (autofocus, focus moved by the browser) is undone as it lands, during
  // the caret lease only. Our own content scripts announce their focus calls (base.js) and are let through.
  let ownFocusUntil = 0;
  window.addEventListener("chatclub:ownFocus", () => {
    ownFocusUntil = Date.now() + 1500;
  });
  window.addEventListener("focusin", (event) => {
    if (Date.now() >= leases.caret || Date.now() - lastUserInput <= 800 || Date.now() < ownFocusUntil) return;
    try {
      event.target?.blur?.();
    } catch {
      // ignore
    }
    toIsolated("focusBlocked", {});
  }, true);
  window.addEventListener("chatclub:lease", (event) => {
    try {
      const data = JSON.parse(event.detail);
      if (data.kind !== "caret" && data.kind !== "guard") return;
      leases[data.kind] = Number(data.until) || 0;
      // window.name survives reloads and navigations in this frame, so the next document
      // starts with the current caret lease instead of the one from when the frame was created.
      if (data.kind === "caret") {
        params.set("chatclub_caret_lease", String(leases.caret));
        window.name = params.toString();
      }
    } catch {
      // ignore
    }
  });

  // --- route changes are reported right away (history API), not only by polling
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function patched(...args) {
      const result = original.apply(this, args);
      toIsolated("locationChanged", { href: location.href });
      return result;
    };
  }

  // --- window.close(): tell the workspace first, then call the original
  const originalClose = window.close;
  window.close = function close() {
    toIsolated("closeRequested", {});
    return originalClose.call(window);
  };
})();
