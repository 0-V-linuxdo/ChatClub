import {
  APP_ICON_DATA_MAX_CHARS,
  APP_ICON_DATA_RE,
  acceptedDataIcon,
  faviconBlobKey,
  faviconCacheKeys,
  isApiLookupHref,
  isGuessedFaviconPath,
  isNetworkFavicon,
  isOversizedGuessedRaster,
  isPaintedSvgMarkup,
  networkFaviconUrls,
  networkLookupHosts,
  peeledHostCore,
  rasterPixelSize,
  siteFaviconUrls
} from "../../shared/favicon-lookup.js";

const FAVICON_CACHE_KEY = "chatclub.faviconCache.v5";
const FAVICON_CACHE_V4_KEY = "chatclub.faviconCache.v4";
const FAVICON_CACHE_MAX_ENTRIES = 240;
const APP_ICON_RASTER_SIZE = 128;

function acceptedTabFavicon(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (APP_ICON_DATA_RE.test(raw)) return raw.length <= APP_ICON_DATA_MAX_CHARS ? raw : "";
  try {
    const parsed = new URL(raw);
    if (parsed.username || parsed.password) return "";
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    if (isNetworkFavicon(parsed.href)) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function tabMatchScore(page, entry) {
  if (!page || !entry) return -1;
  try {
    const tabPage = new URL(String(entry.href || ""));
    if (tabPage.protocol !== "http:" && tabPage.protocol !== "https:") return -1;
    if (tabPage.origin === page.origin) return 300;
    if (tabPage.hostname === page.hostname) return 200;
    const pageCore = peeledHostCore(page.hostname);
    const tabCore = peeledHostCore(tabPage.hostname);
    if (pageCore && pageCore === tabCore) return 100;
    return -1;
  } catch {
    return -1;
  }
}

function looksSvgIcon(url, type = "") {
  const path = String(url || "").split(/[?#]/, 1)[0].toLowerCase();
  return path.endsWith(".svg") || String(type || "").toLowerCase().includes("svg");
}

function bytesToDataUrl(type, bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < view.length; index += 1) binary += String.fromCharCode(view[index]);
  return `data:${type};base64,${btoa(binary)}`;
}

async function responseBytes(response) {
  if (typeof response?.arrayBuffer !== "function") return null;
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export function createFaviconService(dependencies) {
  const {
    state,
    storageGet,
    storageSet,
    runtimeGetUrl,
    runtimeGetManifest = () => (globalThis.browser || globalThis.chrome)?.runtime?.getManifest?.(),
    inferAppName,
    fetchPage = (...args) => fetch(...args),
    parseHtml = (html) => new DOMParser().parseFromString(html, "text/html")
  } = dependencies;
  const discoveryPromises = new Map();
  const tabFavicons = new Map();
  let persistTimer = 0;
  let tabChangeTimer = 0;
  let tabChangeHandler = null;

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
    if (!page) return "";
    try {
      const extensionUrl = new URL(runtimeGetUrl(""));
      const manifest = runtimeGetManifest();
      if (
        extensionUrl.protocol !== "chrome-extension:"
        || !Array.isArray(manifest?.permissions)
        || !manifest.permissions.includes("favicon")
      ) return "";
      const faviconUrl = new URL(runtimeGetUrl("/_favicon/"));
      faviconUrl.searchParams.set("pageUrl", page.href);
      faviconUrl.searchParams.set("size", "32");
      return faviconUrl.href;
    } catch {
      return "";
    }
  }

  function cacheKeys(href) {
    return faviconCacheKeys(href);
  }

  function siteIcon(href, logoUrl) {
    const data = acceptedDataIcon(logoUrl);
    if (data) return true;
    if (!String(logoUrl || "").trim()) return false;
    const page = pageUrl(href);
    const icon = page && pageUrl(logoUrl, page.href);
    if (!page || !icon || icon.username || icon.password) return false;
    if (page.protocol === "https:" && icon.protocol !== "https:") return false;
    if (isNetworkFavicon(icon.href)) return false;
    return true;
  }

  function normalizeCache(value, { migrate = false } = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      const url = typeof entry === "string" ? entry : entry?.url;
      if (!url || isNetworkFavicon(url)) continue;
      const data = acceptedDataIcon(url);
      if (String(key || "").startsWith("blob:")) {
        if (!data && !(APP_ICON_DATA_RE.test(url) && url.length <= APP_ICON_DATA_MAX_CHARS)) continue;
        next[key] = { url: data || String(url), updatedAt: Number(entry?.updatedAt || 0) || 0 };
        continue;
      }
      if (migrate && isGuessedFaviconPath(url) && !data) continue;
      next[key] = { url: data || String(url), updatedAt: Number(entry?.updatedAt || 0) || 0 };
    }
    return next;
  }

  function overrideUrl(appId) {
    const entry = state.options?.appIcons?.[String(appId || "").trim()];
    const value = String(entry?.value || "").trim();
    if (!value) return "";
    if (entry?.srcType === "data") return APP_ICON_DATA_RE.test(value) ? value : "";
    if (entry?.srcType !== "url") return "";
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
    } catch {
      return "";
    }
  }

  function chooseDeclared(doc, href) {
    const page = pageUrl(href);
    if (!page) return "";
    return Array.from(doc.querySelectorAll("link[rel][href]"))
      .map((link, index) => {
        const rel = String(link.getAttribute("rel") || "").toLowerCase();
        if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|mask-icon)(\s|$)/.test(rel)) return null;
        const rawHref = String(link.getAttribute("href") || "").trim();
        const dataIcon = acceptedDataIcon(rawHref);
        const icon = dataIcon || pageUrl(rawHref, page.href)?.href || "";
        if (!icon || (!dataIcon && !siteIcon(page.href, icon))) return null;
        const sizes = String(link.getAttribute("sizes") || "").toLowerCase();
        const type = String(link.getAttribute("type") || "").toLowerCase();
        const sizeScore = sizes.includes("32") ? 0 : sizes.includes("16") ? 1 : sizes.includes("180") ? 2 : 3;
        const relScore = rel.includes("shortcut icon") ? 0 : rel.includes("icon") ? 1 : rel.includes("apple-touch-icon") ? 3 : 4;
        const typeScore = looksSvgIcon(icon, type) || type.includes("png") || dataIcon
          ? 0
          : (type.includes("x-icon") || type.includes("icon") ? 1 : 2);
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

  function cachedBlob(href) {
    const key = faviconBlobKey(href);
    const url = key && state.faviconCache?.[key]?.url;
    if (!url) return "";
    return acceptedDataIcon(url)
      || (APP_ICON_DATA_RE.test(url) && url.length <= APP_ICON_DATA_MAX_CHARS ? url : "");
  }

  function cachedUrl(href) {
    for (const key of cacheKeys(href)) {
      if (String(key).startsWith("blob:")) continue;
      const url = state.faviconCache?.[key]?.url;
      if (!url || isNetworkFavicon(url)) continue;
      const data = acceptedDataIcon(url);
      if (data) return data;
      if (siteIcon(href, url)) return url;
    }
    return "";
  }

  function cached(href) {
    return cachedBlob(href) || cachedUrl(href);
  }

  function persistSoon() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => storageSet(FAVICON_CACHE_KEY, state.faviconCache).catch(() => {}), 300);
  }

  function notifyTabFaviconChange() {
    if (typeof tabChangeHandler !== "function") return;
    clearTimeout(tabChangeTimer);
    tabChangeTimer = setTimeout(() => {
      try { tabChangeHandler(); } catch {}
    }, 200);
  }

  function forgetTab(tabId) {
    const id = Number(tabId);
    if (!Number.isInteger(id) || !tabFavicons.has(id)) return false;
    tabFavicons.delete(id);
    return true;
  }

  function ingestTab(tab = {}) {
    const id = Number(tab?.id);
    if (!Number.isInteger(id) || id < 0) return false;
    const page = pageUrl(tab?.url);
    const icon = acceptedTabFavicon(tab?.favIconUrl);
    if (!page || !icon) return forgetTab(id);
    const previous = tabFavicons.get(id);
    const next = {
      href: page.href,
      origin: page.origin,
      hostname: page.hostname,
      favIconUrl: icon,
      updatedAt: Date.now(),
      active: tab.active === true
    };
    tabFavicons.set(id, next);
    if (!APP_ICON_DATA_RE.test(icon)) remember(page.href, icon);
    return !previous
      || previous.favIconUrl !== next.favIconUrl
      || previous.href !== next.href
      || previous.active !== next.active;
  }

  function tabUrl(href) {
    const page = pageUrl(href);
    if (!page || !tabFavicons.size) return "";
    let best = null;
    let bestScore = -1;
    for (const entry of tabFavicons.values()) {
      const score = tabMatchScore(page, entry);
      if (score < 0) continue;
      if (
        score > bestScore
        || (score === bestScore && entry.active && !best.active)
        || (score === bestScore && entry.active === best.active && entry.updatedAt > best.updatedAt)
      ) {
        best = entry;
        bestScore = score;
      }
    }
    return best?.favIconUrl || "";
  }

  async function observeTabs(bindings = {}) {
    tabChangeHandler = typeof bindings.onChange === "function" ? bindings.onChange : null;
    const queryTabs = bindings.queryTabs;
    if (typeof queryTabs === "function") {
      try {
        const tabs = await queryTabs({});
        let changed = false;
        for (const tab of Array.isArray(tabs) ? tabs : []) {
          if (ingestTab(tab)) changed = true;
        }
        if (changed) notifyTabFaviconChange();
      } catch {}
    }
    const onUpdated = bindings.onUpdated;
    if (typeof onUpdated?.addListener === "function") {
      onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo?.favIconUrl == null && changeInfo?.url == null && changeInfo?.status !== "complete") return;
        const next = { ...(tab || {}), id: tabId };
        if (changeInfo?.favIconUrl != null) next.favIconUrl = changeInfo.favIconUrl;
        if (changeInfo?.url) next.url = changeInfo.url;
        if (ingestTab(next)) notifyTabFaviconChange();
      });
    }
    const onRemoved = bindings.onRemoved;
    if (typeof onRemoved?.addListener === "function") {
      onRemoved.addListener((tabId) => {
        if (forgetTab(tabId)) notifyTabFaviconChange();
      });
    }
  }

  function rememberBlob(href, dataUrl) {
    const key = faviconBlobKey(href);
    const url = acceptedDataIcon(dataUrl)
      || (APP_ICON_DATA_RE.test(dataUrl) && String(dataUrl).length <= APP_ICON_DATA_MAX_CHARS ? String(dataUrl) : "");
    if (!key || !url) return;
    const updatedAt = Date.now();
    state.faviconCache[key] = { url, updatedAt };
    state.faviconCache = prune(state.faviconCache);
    persistSoon();
  }

  function remember(href, logoUrl) {
    if (!String(logoUrl || "").trim() || isNetworkFavicon(logoUrl)) return;
    const data = acceptedDataIcon(logoUrl);
    if (data) {
      rememberBlob(href, data);
      return;
    }
    const icon = pageUrl(logoUrl, href);
    if (!icon || !siteIcon(href, icon.href)) return;
    const keys = cacheKeys(href);
    if (!keys.length) return;
    const updatedAt = Date.now();
    for (const key of keys) state.faviconCache[key] = { url: icon.href, updatedAt };
    state.faviconCache = prune(state.faviconCache);
    persistSoon();
  }

  async function persistFetchedBlob(href, src) {
    const page = pageUrl(src) || pageUrl(src, href);
    if (!page) return "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetchPage(page.href, { cache: "force-cache", credentials: "omit", signal: controller.signal });
      if (!response?.ok) return "";
      const type = String(response.headers?.get?.("content-type") || "").toLowerCase();
      const bytes = await responseBytes(response);
      if (!bytes || bytes.length < 16) return "";
      const size = rasterPixelSize(bytes);
      if (size && isOversizedGuessedRaster(page.href, size.width, size.height)) return "";
      const asText = new TextDecoder().decode(bytes);
      if (isPaintedSvgMarkup(asText)) {
        const encodedSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(asText)}`;
        if (encodedSvg.length <= APP_ICON_DATA_MAX_CHARS && acceptedDataIcon(encodedSvg)) {
          rememberBlob(href, encodedSvg);
          return encodedSvg;
        }
      }
      if (looksSvgIcon(page.href, type) && !isPaintedSvgMarkup(asText)) return "";
      const fileType = type.startsWith("image/") ? type.replace("image/jpg", "image/jpeg") : "image/png";
      const file = typeof File === "function" ? new File([bytes], "favicon", { type: fileType }) : new Blob([bytes], { type: fileType });
      const encoded = await encodeFile(file);
      if (!encoded) return "";
      if (/image\/svg\+xml/i.test(encoded) && !acceptedDataIcon(encoded)) return "";
      rememberBlob(href, encoded);
      return encoded;
    } catch {
      return "";
    } finally {
      clearTimeout(timer);
    }
  }

  async function rememberDecoded(href, image) {
    if (cachedBlob(href)) return cachedBlob(href);
    const src = typeof image === "string"
      ? String(image || "").trim()
      : String(image?.currentSrc || image?.src || "").trim();
    if (!src || image?.dataset?.fallback === "1" || image?.dataset?.faviconMiss === "1") return "";
    const width = Number(image?.naturalWidth || 0);
    const height = Number(image?.naturalHeight || 0);
    if ((width || height) && isOversizedGuessedRaster(src, width, height)) return "";
    const data = acceptedDataIcon(src);
    if (data) {
      rememberBlob(href, data);
      return data;
    }
    if (isNetworkFavicon(src)) return persistFetchedBlob(href, src);
    if (!siteIcon(href, src)) return "";
    if (!isGuessedFaviconPath(src)) remember(href, src);
    return persistFetchedBlob(href, src);
  }

  async function discover(href) {
    const cachedUrl = cached(href);
    if (cachedUrl) return cachedUrl;
    const page = pageUrl(href);
    if (!page) return "";
    page.hash = "";
    if (discoveryPromises.has(page.origin)) return discoveryPromises.get(page.origin);
    const promise = (async () => {
      try {
      const targets = [];
      const pushTarget = (value) => {
        const next = pageUrl(value);
        if (next && !targets.includes(next.href)) targets.push(next.href);
      };
      if (!isApiLookupHref(page.href)) pushTarget(page.href);
      pushTarget(`${page.origin}/`);
      for (const host of networkLookupHosts(page.hostname)) {
        pushTarget(`${page.protocol}//${host}/`);
      }
      for (const target of targets) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        try {
          const response = await fetchPage(target, { cache: "force-cache", credentials: "omit", signal: controller.signal });
          if (!response.ok) continue;
          const logoUrl = chooseDeclared(parseHtml(await response.text()), target);
          if (logoUrl) {
            remember(page.href, logoUrl);
            return logoUrl;
          }
        } catch {
        } finally {
          clearTimeout(timer);
        }
      }
      for (const icon of siteFaviconUrls(page.href)) {
        if (!siteIcon(page.href, icon)) continue;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        try {
          const response = await fetchPage(icon, { cache: "force-cache", credentials: "omit", signal: controller.signal });
          const type = String(response?.headers?.get?.("content-type") || "").toLowerCase();
          if (!response?.ok) continue;
          const bytes = await responseBytes(response);
          if (bytes) {
            if (bytes.length < 16) continue;
            const size = rasterPixelSize(bytes);
            if (size && isOversizedGuessedRaster(icon, size.width, size.height)) continue;
            if (looksSvgIcon(icon, type) && !isPaintedSvgMarkup(new TextDecoder().decode(bytes))) continue;
          } else if (!type.startsWith("image/")) continue;
          remember(page.href, icon);
          return icon;
        } catch {
        } finally {
          clearTimeout(timer);
        }
      }
      return "";
      } finally {
        discoveryPromises.delete(page.origin);
      }
    })();
    discoveryPromises.set(page.origin, promise);
    return promise;
  }

  function forget(href) {
    const keys = cacheKeys(href);
    const blobKey = faviconBlobKey(href);
    if (!keys.length && !blobKey) return;
    for (const key of keys) delete state.faviconCache[key];
    if (blobKey) delete state.faviconCache[blobKey];
    const page = pageUrl(href);
    if (page) discoveryPromises.delete(page.origin);
    persistSoon();
  }

  async function refresh(href) {
    forget(href);
    return discover(href);
  }

  function candidates(href, declaredLogoUrl = "", options = {}) {
    const urls = [];
    const push = (value) => {
      const url = String(value || "").trim();
      if (url && !urls.includes(url)) urls.push(url);
    };
    push(overrideUrl(options.appId));
    push(acceptedTabFavicon(options.tabFaviconUrl) || tabUrl(href));
    const declared = String(declaredLogoUrl || "").trim();
    const declaredData = acceptedDataIcon(declared);
    if (declaredData) push(declaredData);
    else if (declared && APP_ICON_DATA_RE.test(declared)) push(declared);
    const declaredPage = declared && !declaredData ? pageUrl(declared, href) : null;
    if (declaredPage && siteIcon(href, declaredPage.href)) push(declaredPage.href);
    push(cachedBlob(href));
    push(cachedUrl(href));
    for (const url of siteFaviconUrls(href)) push(url);
    for (const url of networkFaviconUrls(href)) push(url);
    if (!isApiLookupHref(href)) push(browserUrl(href));
    return urls;
  }

  function effective(href, declaredLogoUrl = "", options = {}) {
    return candidates(href, declaredLogoUrl, options)[0] || "";
  }

  function fallback(app) {
    const label = inferAppName(app).replace(/\s+/g, "").slice(0, 2).toUpperCase() || "AI";
    const hue = Array.from(String(app?.id || app?.url || label)).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="hsl(${hue} 48% 36%)"/><text x="16" y="21" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="800" fill="white">${label}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  async function encodeFile(file) {
    if (!file) return "";
    const type = String(file.type || "").toLowerCase().replace("image/jpg", "image/jpeg");
    if (!/^image\/(?:png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)) return "";
    const buffer = await file.arrayBuffer();
    if (type === "image/svg+xml") {
      const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(new TextDecoder().decode(buffer))}`;
      return url.length <= APP_ICON_DATA_MAX_CHARS ? url : "";
    }
    try {
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(file);
        const size = APP_ICON_RASTER_SIZE;
        const canvas = typeof OffscreenCanvas === "function"
          ? new OffscreenCanvas(size, size)
          : Object.assign(document.createElement("canvas"), { width: size, height: size });
        const context = canvas.getContext("2d");
        const scale = Math.min(size / Math.max(bitmap.width, 1), size / Math.max(bitmap.height, 1), 1);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        context.clearRect(0, 0, size, size);
        context.drawImage(bitmap, Math.floor((size - width) / 2), Math.floor((size - height) / 2), width, height);
        bitmap.close?.();
        const blob = canvas.convertToBlob
          ? await canvas.convertToBlob({ type: "image/png" })
          : await new Promise((resolve) => { canvas.toBlob(resolve, "image/png"); });
        if (blob) {
          const png = bytesToDataUrl("image/png", await blob.arrayBuffer());
          if (png.length <= APP_ICON_DATA_MAX_CHARS) return png;
        }
      }
    } catch {}
    const raw = bytesToDataUrl(type, buffer);
    return raw.length <= APP_ICON_DATA_MAX_CHARS ? raw : "";
  }

  async function load() {
    const stored = normalizeCache(await storageGet(FAVICON_CACHE_KEY));
    if (Object.keys(stored).length) {
      state.faviconCache = stored;
      return state.faviconCache;
    }
    const migrated = normalizeCache(await storageGet(FAVICON_CACHE_V4_KEY), { migrate: true });
    state.faviconCache = migrated;
    if (Object.keys(migrated).length) persistSoon();
    return state.faviconCache;
  }

  return Object.freeze({
    load,
    browserUrl,
    discover,
    remember,
    rememberDecoded,
    refresh,
    forget,
    effective,
    candidates,
    overrideUrl,
    tabUrl,
    observeTabs,
    siteUrls: siteFaviconUrls,
    networkUrls: networkFaviconUrls,
    encodeFile,
    app: (app) => effective(app?.url || "", "", { appId: app?.id }),
    fallback
  });
}
