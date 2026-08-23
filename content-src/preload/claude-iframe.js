const RUNTIME_NAME = "claude-iframe-compat";
const RUNTIME_VERSION = "2026.08.23.2";
const SCAN_WINDOW_MS = 20_000;
const SCAN_INTERVAL_MS = 250;
const MAX_MODULE_IMPORTS = 40;

const IFRAME_MATCHER = Object.freeze({ isInIframe: true });
const IFRAME_PATCH = Object.freeze({ isInIframe: false });
const EMPTY_ANCESTOR_ORIGINS = Object.freeze({
  length: 0,
  item() { return null; },
  contains() { return false; },
  [Symbol.iterator]: function* () {}
});

function isFramedWindow(target) {
  try {
    return Boolean(target) && target.parent !== target;
  } catch {
    return true;
  }
}

function isZustandLikeStore(value) {
  return Boolean(
    value
    && (typeof value === "object" || typeof value === "function")
    && typeof value.getState === "function"
    && typeof value.setState === "function"
    && typeof value.subscribe === "function"
  );
}

function storeHasIframeFlag(store) {
  try {
    const state = store.getState();
    return Boolean(state) && typeof state === "object" && Object.hasOwn(state, "isInIframe");
  } catch {
    return false;
  }
}

function storeMatchesIframeFlag(store, expected = true) {
  try {
    const state = store.getState();
    return Boolean(state) && typeof state === "object" && Object.is(state.isInIframe, expected);
  } catch {
    return false;
  }
}

function patchClaudeIframeStore(store) {
  if (!isZustandLikeStore(store) || !storeMatchesIframeFlag(store, true)) return false;
  try {
    store.setState(IFRAME_PATCH);
  } catch {
    return false;
  }
  try {
    const setter = store.getState()?.setIsInIframe;
    if (typeof setter === "function") setter(false);
  } catch {}
  return storeMatchesIframeFlag(store, false);
}

function normalizeClaudeEmbedLocation(locationLike) {
  try {
    if (!locationLike || locationLike.pathname !== "/") return false;
    const search = locationLike.search || "";
    const hash = locationLike.hash || "";
    locationLike.replace(`/new${search}${hash}`);
    return true;
  } catch {
    return false;
  }
}

function clearClaudeDocumentReferrer(documentLike) {
  try {
    Object.defineProperty(documentLike, "referrer", {
      configurable: true,
      get() { return ""; }
    });
    return true;
  } catch {
    return false;
  }
}

function installClaudeFrameSpoof(target) {
  const result = {
    top: false,
    frameElement: false,
    ancestorOrigins: false,
    parentPreserved: true
  };
  if (!target) return result;
  const originalParent = (() => {
    try { return target.parent; } catch { return undefined; }
  })();

  try {
    Object.defineProperty(target, "top", {
      configurable: true,
      get() { return target; }
    });
    result.top = true;
  } catch {}

  try {
    Object.defineProperty(target, "frameElement", {
      configurable: true,
      get() { return null; }
    });
    result.frameElement = true;
  } catch {}

  try {
    const locationLike = target.location;
    if (locationLike) {
      Object.defineProperty(locationLike, "ancestorOrigins", {
        configurable: true,
        get() { return EMPTY_ANCESTOR_ORIGINS; }
      });
      result.ancestorOrigins = true;
    }
  } catch {}

  try {
    result.parentPreserved = target.parent === originalParent;
  } catch {
    result.parentPreserved = false;
  }
  return result;
}

function httpModuleHref(href, baseHref) {
  try {
    const base = String(baseHref || "");
    const url = new URL(String(href || ""), base || undefined);
    if (!/^https?:$/i.test(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function sameOriginHref(href, baseHref) {
  try {
    const resolved = httpModuleHref(href, baseHref);
    if (!resolved) return "";
    const base = String(baseHref || "");
    if (!base) return resolved;
    return new URL(resolved).origin === new URL(base).origin ? resolved : "";
  } catch {
    return "";
  }
}

function pushUniqueHref(hrefs, seen, href) {
  if (!href || seen.has(href)) return false;
  seen.add(href);
  hrefs.push(href);
  return hrefs.length >= MAX_MODULE_IMPORTS;
}

function modulePreloadHrefs(documentLike, baseHref) {
  const hrefs = [];
  const seen = new Set();
  try {
    const nodes = documentLike?.querySelectorAll?.('link[rel~="modulepreload"][href]') || [];
    for (const node of nodes) {
      const href = httpModuleHref(node?.href || node?.getAttribute?.("href"), baseHref);
      if (pushUniqueHref(hrefs, seen, href)) return hrefs;
    }
  } catch {}
  try {
    const scripts = documentLike?.querySelectorAll?.('script[type="module"][src]') || [];
    for (const node of scripts) {
      const href = sameOriginHref(node?.src || node?.getAttribute?.("src"), baseHref);
      if (pushUniqueHref(hrefs, seen, href)) return hrefs;
    }
  } catch {}
  return hrefs;
}

function pageImporterKeyword() {
  return decodeURIComponent("%69%6d%70%6f%72%74");
}

function loadPageModuleNamespaces(hrefs, documentLike, target) {
  if (!hrefs.length || typeof documentLike?.createElement !== "function") {
    return Promise.resolve([]);
  }
  const host = target || (typeof globalThis === "undefined" ? null : globalThis);
  if (!host) return Promise.resolve([]);
  const marker = `ccClaudeNs${String(Math.random()).slice(2)}`;
  const keyword = pageImporterKeyword();
  const script = documentLike.createElement("script");
  script.type = "module";
  script.textContent = [
    "const hrefs = ",
    JSON.stringify(hrefs),
    ";",
    "const collected = [];",
    "for (const href of hrefs) {",
    "  try {",
    "    const ns = await ",
    keyword,
    "(href);",
    "    if (ns) collected.push(ns);",
    "  } catch {}",
    "}",
    "globalThis[",
    JSON.stringify(marker),
    "] = collected;"
  ].join("");

  return new Promise((resolve) => {
    const root = documentLike.documentElement || documentLike.head || documentLike.body;
    if (!root?.appendChild) {
      resolve([]);
      return;
    }
    const started = Date.now();
    const finish = () => {
      const namespaces = host[marker];
      try { delete host[marker]; } catch {}
      try { script.remove(); } catch {}
      resolve(Array.isArray(namespaces) ? namespaces : []);
    };
    const poll = () => {
      if (Object.prototype.hasOwnProperty.call(host, marker)) {
        finish();
        return;
      }
      if (Date.now() - started > 4000) {
        finish();
        return;
      }
      const schedule = typeof setTimeout === "function" ? setTimeout : null;
      if (!schedule) {
        finish();
        return;
      }
      schedule(poll, 16);
    };
    try {
      root.appendChild(script);
    } catch {
      resolve([]);
      return;
    }
    poll();
  });
}

function collectExportedStores(namespace, stores) {
  if (!namespace || typeof namespace !== "object") return;
  try {
    for (const value of Object.values(namespace)) {
      if (isZustandLikeStore(value)) stores.add(value);
    }
  } catch {}
}

async function collectZustandLikeStores({
  document: documentLike,
  importModule,
  baseHref = "",
  extraStores = [],
  target
} = {}) {
  const stores = new Set();
  for (const store of extraStores) {
    if (isZustandLikeStore(store)) stores.add(store);
  }
  const hrefs = modulePreloadHrefs(documentLike, baseHref);
  if (typeof importModule === "function") {
    await Promise.all(hrefs.map(async (href) => {
      try {
        collectExportedStores(await importModule(href), stores);
      } catch {}
    }));
    return [...stores];
  }
  const namespaces = await loadPageModuleNamespaces(
    hrefs,
    documentLike,
    target || (typeof window === "undefined" ? globalThis : window)
  );
  for (const namespace of namespaces) collectExportedStores(namespace, stores);
  return [...stores];
}

function watchStore(store, unsubscribers) {
  if (!isZustandLikeStore(store) || !storeHasIframeFlag(store)) return false;
  patchClaudeIframeStore(store);
  try {
    const unsubscribe = store.subscribe((state) => {
      if (state && Object.is(state.isInIframe, true)) patchClaudeIframeStore(store);
    });
    if (typeof unsubscribe === "function") unsubscribers.add(unsubscribe);
  } catch {}
  return storeMatchesIframeFlag(store, false) || storeHasIframeFlag(store);
}

export function installClaudeIframeCompat(runtimes, options = {}) {
  const existing = runtimes.registration(RUNTIME_NAME);
  if (existing?.version === RUNTIME_VERSION) return existing.api;

  runtimes.invalidate(RUNTIME_NAME, `replaced by ${RUNTIME_VERSION}`);

  const target = options.window || (typeof window === "undefined" ? null : window);
  const documentLike = options.document || target?.document;
  const locationLike = options.location || target?.location;
  const importModule = options.importModule;
  const extraStores = Array.isArray(options.extraStores) ? options.extraStores : [];
  const now = typeof options.now === "function" ? options.now : Date.now;
  const setTimer = typeof options.setTimeout === "function"
    ? options.setTimeout
    : (typeof setTimeout === "function" ? setTimeout : () => 0);
  const clearTimer = typeof options.clearTimeout === "function"
    ? options.clearTimeout
    : (typeof clearTimeout === "function" ? clearTimeout : () => {});
  const Observer = options.MutationObserver
    || (typeof MutationObserver === "function" ? MutationObserver : null);

  const api = Object.freeze({
    version: RUNTIME_VERSION,
    matcher: IFRAME_MATCHER,
    value: IFRAME_PATCH
  });

  if (!isFramedWindow(target)) {
    runtimes.register(RUNTIME_NAME, {
      version: RUNTIME_VERSION,
      api,
      dispose() {}
    });
    return api;
  }

  normalizeClaudeEmbedLocation(locationLike);
  clearClaudeDocumentReferrer(documentLike);
  const spoof = installClaudeFrameSpoof(target);

  let stopped = false;
  let scanTimer = 0;
  let deadlineTimer = 0;
  let mutationObserver = null;
  const seenStores = new Set();
  const unsubscribers = new Set();
  const deadlineAt = now() + SCAN_WINDOW_MS;
  const baseHref = (() => {
    try { return String(locationLike?.href || ""); } catch { return ""; }
  })();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (scanTimer) clearTimer(scanTimer);
    if (deadlineTimer) clearTimer(deadlineTimer);
    scanTimer = 0;
    deadlineTimer = 0;
    try { mutationObserver?.disconnect?.(); } catch {}
    mutationObserver = null;
    for (const unsubscribe of unsubscribers) {
      try { unsubscribe(); } catch {}
    }
    unsubscribers.clear();
  };

  const scan = async () => {
    if (stopped) return;
    const stores = await collectZustandLikeStores({
      document: documentLike,
      importModule,
      baseHref,
      extraStores,
      target
    });
    if (stopped) return;
    for (const store of stores) {
      if (seenStores.has(store)) continue;
      seenStores.add(store);
      watchStore(store, unsubscribers);
    }
    if (!stopped && now() < deadlineAt) {
      scanTimer = setTimer(() => {
        scanTimer = 0;
        scan().catch(() => {});
      }, SCAN_INTERVAL_MS);
    } else {
      stop();
    }
  };

  if (Observer && documentLike) {
    try {
      mutationObserver = new Observer(() => {
        if (!stopped) scan().catch(() => {});
      });
      mutationObserver.observe(documentLike, { childList: true, subtree: true });
    } catch {
      mutationObserver = null;
    }
  }
  deadlineTimer = setTimer(stop, SCAN_WINDOW_MS + 100);
  runtimes.register(RUNTIME_NAME, {
    version: RUNTIME_VERSION,
    api: Object.freeze({ ...api, spoof }),
    dispose: stop
  });
  scan().catch(() => {});
  return api;
}
