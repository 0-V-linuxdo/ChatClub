const FAVICON_CACHE_KEY = "chatclub.faviconCache.v4";
const FAVICON_CACHE_MAX_ENTRIES = 240;

export function createFaviconService(dependencies) {
  const {
    state,
    storageGet,
    storageSet,
    runtimeGetUrl,
    inferAppName,
    fetchPage = (...args) => fetch(...args),
    parseHtml = (html) => new DOMParser().parseFromString(html, "text/html")
  } = dependencies;
  const discoveryPromises = new Map();
  let persistTimer = 0;

  function pageUrl(value, base = globalThis.location?.href) {
    try {
      const url = new URL(String(value || ""), base);
      return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
      return null;
    }
  }

  function browserUrl(href) {
    const page = pageUrl(href);
    if (!page || !globalThis.chrome?.runtime?.getURL) return "";
    try {
      const faviconUrl = new URL(runtimeGetUrl("/_favicon/"));
      faviconUrl.searchParams.set("pageUrl", page.href);
      faviconUrl.searchParams.set("size", "32");
      return faviconUrl.href;
    } catch {
      return "";
    }
  }

  function cacheKeys(href) {
    const page = pageUrl(href);
    if (!page) return [];
    page.hash = "";
    return [...new Set([
      page.href,
      `${page.origin}${page.pathname || "/"}`,
      page.origin,
      page.hostname
    ].filter(Boolean))];
  }

  function normalizeCache(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      const url = typeof entry === "string" ? entry : entry?.url;
      if (!url) continue;
      next[key] = { url: String(url), updatedAt: Number(entry?.updatedAt || 0) || 0 };
    }
    return next;
  }

  function siteIcon(href, logoUrl) {
    const page = pageUrl(href);
    const icon = page && pageUrl(logoUrl, page.href);
    if (!page || !icon || icon.origin !== page.origin) return false;
    const path = icon.pathname.toLowerCase();
    return path === "/favicon.ico" || path.includes("/favicon") || path.includes("apple-touch-icon") || path.includes("touch-icon");
  }

  function chooseDeclared(doc, href) {
    const page = pageUrl(href);
    if (!page) return "";
    return Array.from(doc.querySelectorAll("link[rel][href]"))
      .map((link, index) => {
        const rel = String(link.getAttribute("rel") || "").toLowerCase();
        if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|mask-icon)(\s|$)/.test(rel)) return null;
        const icon = pageUrl(link.getAttribute("href"), page.href)?.href || "";
        if (!icon || !siteIcon(page.href, icon)) return null;
        const sizes = String(link.getAttribute("sizes") || "").toLowerCase();
        const type = String(link.getAttribute("type") || "").toLowerCase();
        const sizeScore = sizes.includes("32") ? 0 : sizes.includes("16") ? 1 : sizes.includes("180") ? 2 : 3;
        const relScore = rel.includes("shortcut icon") ? 0 : rel.includes("icon") ? 1 : rel.includes("apple-touch-icon") ? 3 : 4;
        const typeScore = type.includes("png") || type.includes("x-icon") || type.includes("icon") ? 0 : 1;
        return { url: icon, score: relScore * 100 + sizeScore * 10 + typeScore, index };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || a.index - b.index)[0]?.url || "";
  }

  function prune(cache) {
    return Object.fromEntries(Object.entries(cache)
      .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
      .slice(0, FAVICON_CACHE_MAX_ENTRIES));
  }

  function cached(href) {
    for (const key of cacheKeys(href)) {
      const url = state.faviconCache?.[key]?.url;
      if (url && siteIcon(href, url)) return url;
    }
    return "";
  }

  function persistSoon() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => storageSet(FAVICON_CACHE_KEY, state.faviconCache).catch(() => {}), 300);
  }

  function remember(href, logoUrl) {
    const icon = pageUrl(logoUrl, href);
    if (!icon || !siteIcon(href, icon.href)) return;
    const keys = cacheKeys(href);
    if (!keys.length) return;
    const updatedAt = Date.now();
    for (const key of keys) state.faviconCache[key] = { url: icon.href, updatedAt };
    state.faviconCache = prune(state.faviconCache);
    persistSoon();
  }

  async function discover(href) {
    const cachedUrl = cached(href);
    if (cachedUrl) return cachedUrl;
    const page = pageUrl(href);
    if (!page) return "";
    page.hash = "";
    if (discoveryPromises.has(page.origin)) return discoveryPromises.get(page.origin);
    const promise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const response = await fetchPage(page.href, { cache: "force-cache", credentials: "omit", signal: controller.signal });
        if (!response.ok) return "";
        const logoUrl = chooseDeclared(parseHtml(await response.text()), page.href);
        if (logoUrl) remember(page.href, logoUrl);
        return logoUrl;
      } catch {
        return "";
      } finally {
        clearTimeout(timer);
        discoveryPromises.delete(page.origin);
      }
    })();
    discoveryPromises.set(page.origin, promise);
    return promise;
  }

  function effective(href, declaredLogoUrl = "") {
    const declared = pageUrl(declaredLogoUrl, href);
    if (declared && siteIcon(href, declared.href)) return declared.href;
    return cached(href) || browserUrl(href);
  }

  function fallback(app) {
    const label = inferAppName(app).replace(/\s+/g, "").slice(0, 2).toUpperCase() || "AI";
    const hue = Array.from(String(app?.id || app?.url || label)).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="hsl(${hue} 48% 36%)"/><text x="16" y="21" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="800" fill="white">${label}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  async function load() {
    state.faviconCache = normalizeCache(await storageGet(FAVICON_CACHE_KEY));
    return state.faviconCache;
  }

  return Object.freeze({
    load,
    browserUrl,
    discover,
    remember,
    effective,
    app: (app) => effective(app?.url || ""),
    fallback
  });
}
