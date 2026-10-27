// Claude compatibility preload (MAIN world, document_start; v2 05 §6.1). Claude refuses to work when it
// believes it is framed: for 20 s the app state is scanned every 250 ms and any "in an iframe" flag is
// turned off, and `location.ancestorOrigins` reads as an empty list. Inert outside ChatClub iframes.
(() => {
  if (window === window.top || window.__chatclubClaudeCompat) return;
  let params;
  try {
    params = new URLSearchParams(window.name || "");
  } catch {
    return;
  }
  if (!params.has("chatclub_webview") || !/^[0-9a-f]{64}$/.test(params.get("chatclub_frame_binding") || "")) return;
  Object.defineProperty(window, "__chatclubClaudeCompat", { value: true });

  // An empty DOMStringList-like value: length 0, item() → null, contains() → false.
  const emptyList = Object.freeze(Object.create(Object.prototype, {
    length: { value: 0 },
    item: { value: () => null },
    contains: { value: () => false },
    [Symbol.iterator]: { value: function* iterator() {} },
  }));
  try {
    Object.defineProperty(Location.prototype, "ancestorOrigins", { configurable: true, get: () => emptyList });
  } catch {
    // ignore
  }

  const FLAG = /^(is_?)?(in_?)?(i_?frame|embedded|framed)(_?mode)?$/i;
  const ROOTS = ["__NEXT_DATA__", "__remixContext", "__INITIAL_STATE__", "__APP_STATE__", "__PRELOADED_STATE__", "__claude", "__CLAUDE_STATE__"];
  let seen = new WeakSet();
  const clearFlags = (obj, depth) => {
    if (!obj || typeof obj !== "object" || depth > 6 || seen.has(obj)) return;
    seen.add(obj);
    let keys;
    try {
      keys = Object.keys(obj);
    } catch {
      return;
    }
    for (const key of keys.slice(0, 400)) {
      let value;
      try {
        value = obj[key];
      } catch {
        continue;
      }
      if (value === true && FLAG.test(key)) {
        try {
          obj[key] = false;
        } catch {
          // read-only flag
        }
      } else if (value && typeof value === "object") clearFlags(value, depth + 1);
    }
  };
  const scan = () => {
    seen = new WeakSet();
    for (const name of ROOTS) {
      try {
        if (window[name]) clearFlags(window[name], 0);
      } catch {
        // ignore
      }
    }
  };
  const started = Date.now();
  const timer = setInterval(() => {
    scan();
    if (Date.now() - started > 20000) clearInterval(timer);
  }, 250);
  scan();
})();
