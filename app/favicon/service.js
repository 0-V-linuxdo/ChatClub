import {
  APP_ICON_DATA_MAX_CHARS,
  APP_ICON_DATA_RE,
  FAVICON_QUALITY_BRAND_SVG,
  FAVICON_QUALITY_DECLARED_RASTER,
  FAVICON_QUALITY_OK_RASTER,
  acceptedDataIcon,
  classifyFaviconQuality,
  faviconBlobKey,
  faviconCacheKeys,
  faviconColorScheme,
  faviconDeclaredSizeScore,
  faviconDiscoveryKey,
  isApiLookupHref,
  isFaviconQuality,
  isGuessedFaviconPath,
  isLetterFallbackIcon,
  isNearSolidRgba,
  isNetworkFavicon,
  isPaintedSvgMarkup,
  isRejectedGuessedRaster,
  looksSvgFavicon,
  networkFaviconUrls,
  networkLookupHosts,
  peeledHostCore,
  rasterPixelSize,
  rejectedRasterBytes,
  siteFaviconUrls
} from "../../shared/favicon-lookup.js";

const FAVICON_CACHE_KEY = "chatclub.faviconCache.v8";
const FAVICON_CACHE_V7_KEY = "chatclub.faviconCache.v7";
const FAVICON_CACHE_V6_KEY = "chatclub.faviconCache.v6";
const FAVICON_CACHE_V5_KEY = "chatclub.faviconCache.v5";
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

function qualityEntry(url, extra = {}) {
  const quality = isFaviconQuality(extra.quality) ? extra.quality : classifyFaviconQuality({
    url,
    type: extra.type,
    declared: extra.declared === true,
    dataUrl: extra.dataUrl || url
  });
  if (!quality) return null;
  return {
    url,
    quality,
    width: Number(extra.width || 0) || 0,
    height: Number(extra.height || 0) || 0,
    source: String(extra.source || "").trim(),
    updatedAt: Number(extra.updatedAt || 0) || 0
  };
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
  const discoveredHosts = new Set();
  const tabFavicons = new Map();
  const hotBlobs = new Map();
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

  function normalizeCache(value, { migrate = false, dropRasterBlobs = false, blobsOnly = false } = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      const url = typeof entry === "string" ? entry : entry?.url;
      if (!url || isNetworkFavicon(url) || isLetterFallbackIcon(url)) continue;
      const data = acceptedDataIcon(url);
      const updatedAt = Number(entry?.updatedAt || 0) || 0;
      if (blobsOnly && !String(key || "").startsWith("blob:")) continue;
      if (String(key || "").startsWith("blob:")) {
        if (dropRasterBlobs) {
          if (!data || !/image\/svg\+xml/i.test(data)) continue;
          const stored = qualityEntry(data, {
            quality: FAVICON_QUALITY_BRAND_SVG,
            source: "legacy",
            updatedAt
          });
          if (stored) next[key] = stored;
          continue;
        }
        if (/image\/svg\+xml/i.test(url) && !data) continue;
        if (!data && !(APP_ICON_DATA_RE.test(url) && url.length <= APP_ICON_DATA_MAX_CHARS)) continue;
        const stored = qualityEntry(data || String(url), {
          quality: entry?.quality,
          width: entry?.width,
          height: entry?.height,
          source: entry?.source,
          declared: entry?.quality === FAVICON_QUALITY_DECLARED_RASTER,
          dataUrl: data || url,
          updatedAt
        });
        if (stored && isFaviconQuality(stored.quality)) next[key] = stored;
        continue;
      }
      if ((migrate || dropRasterBlobs) && isGuessedFaviconPath(url) && !data) continue;
      const stored = qualityEntry(data || String(url), {
        quality: dropRasterBlobs || migrate ? "" : entry?.quality,
        width: entry?.width,
        height: entry?.height,
        source: dropRasterBlobs ? "legacy" : entry?.source,
        declared: !isGuessedFaviconPath(url),
        dataUrl: data,
        updatedAt
      });
      if (stored) next[key] = stored;
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

  function darkPreferred() {
    try {
      return globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches === true;
    } catch {
      return false;
    }
  }

  function chooseDeclared(doc, href) {
    const page = pageUrl(href);
    if (!page) return "";
    const dark = darkPreferred();
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
        const scheme = faviconColorScheme({
          media: link.getAttribute("media"),
          href: icon
        });
        const mediaScore = dark
          ? (scheme === "dark" ? 0 : scheme === "light" ? 2 : 1)
          : (scheme === "light" ? 0 : scheme === "dark" ? 2 : 1);
        const sizeScore = faviconDeclaredSizeScore({ sizes, href: icon, rel });
        const relScore = rel.includes("icon") && !rel.includes("apple-touch-icon") && !rel.includes("mask-icon")
          ? (rel.includes("shortcut icon") ? 1 : 0)
          : rel.includes("apple-touch-icon") ? 2 : 3;
        const typeScore = looksSvgFavicon(icon, type) || dataIcon
          ? 0
          : (type.includes("png") ? 1 : 2);
        return { url: icon, score: mediaScore * 100 + sizeScore * 10 + relScore + typeScore, index };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || a.index - b.index)[0]?.url || "";
  }

  function pruneKeepRank(key, entry) {
    const url = String(entry?.url || "");
    const blob = String(key || "").startsWith("blob:") || APP_ICON_DATA_RE.test(url);
    if (blob) {
      if (entry?.quality === FAVICON_QUALITY_BRAND_SVG) return 0;
      if (entry?.quality === FAVICON_QUALITY_DECLARED_RASTER) return 1;
      return 2;
    }
    return 3;
  }

  function prune(cache) {
    return Object.fromEntries(Object.entries(cache)
      .sort((a, b) => pruneKeepRank(a[0], a[1]) - pruneKeepRank(b[0], b[1])
        || Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
      .slice(0, FAVICON_CACHE_MAX_ENTRIES));
  }

  function blobRecord(href) {
    const key = faviconBlobKey(href);
    return key ? state.faviconCache?.[key] : null;
  }

  function syncHotFromState() {
    hotBlobs.clear();
    for (const [key, entry] of Object.entries(state.faviconCache || {})) {
      if (!String(key).startsWith("blob:")) continue;
      const url = acceptedDataIcon(entry?.url)
        || (APP_ICON_DATA_RE.test(entry?.url) && String(entry.url).length <= APP_ICON_DATA_MAX_CHARS ? entry.url : "");
      if (!url || isLetterFallbackIcon(url) || !isFaviconQuality(entry?.quality)) continue;
      hotBlobs.set(key.slice("blob:".length), {
        url,
        quality: entry.quality,
        width: Number(entry.width || 0) || 0,
        height: Number(entry.height || 0) || 0,
        source: String(entry.source || "").trim(),
        updatedAt: Number(entry.updatedAt || 0) || 0
      });
    }
  }

  function persistableBlobs(cache) {
    return Object.fromEntries(Object.entries(cache || {}).filter(([key, entry]) => (
      String(key).startsWith("blob:")
      && acceptedDataIcon(entry?.url)
      && isFaviconQuality(entry?.quality)
    )));
  }

  function cachedBlob(href, { immediate = false } = {}) {
    const host = faviconBlobKey(href).slice("blob:".length);
    const entry = (host && hotBlobs.get(host)) || blobRecord(href);
    const url = entry?.url;
    if (!url || isLetterFallbackIcon(url)) return "";
    if (immediate && !isFaviconQuality(entry.quality)) return "";
    return acceptedDataIcon(url)
      || (APP_ICON_DATA_RE.test(url) && url.length <= APP_ICON_DATA_MAX_CHARS ? url : "");
  }

  function cachedUrl(href) {
    for (const key of cacheKeys(href)) {
      if (String(key).startsWith("blob:")) continue;
      const entry = state.faviconCache?.[key];
      const url = entry?.url;
      if (!url || isNetworkFavicon(url) || isLetterFallbackIcon(url)) continue;
      const data = acceptedDataIcon(url);
      if (data) return data;
      if (siteIcon(href, url)) return url;
    }
    return "";
  }

  function persistSoon() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const snapshot = persistableBlobs(state.faviconCache);
      storageSet(FAVICON_CACHE_KEY, snapshot).catch(() => {});
    }, 300);
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
    if (APP_ICON_DATA_RE.test(icon)) {
      rememberBlob(page.href, icon, { source: "tab", declared: true });
    } else {
      remember(page.href, icon, { source: "tab", declared: true });
      persistFetchedBlob(page.href, icon, { source: "tab", declared: true }).catch(() => {});
    }
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

  function rememberBlob(href, dataUrl, meta = {}) {
    const key = faviconBlobKey(href);
    const raw = String(dataUrl || "").trim();
    if (!key || !raw || isLetterFallbackIcon(raw)) return;
    const url = acceptedDataIcon(raw)
      || (!/image\/svg\+xml/i.test(raw) && APP_ICON_DATA_RE.test(raw) && raw.length <= APP_ICON_DATA_MAX_CHARS ? raw : "");
    if (!url) return;
    const stored = qualityEntry(url, {
      ...meta,
      dataUrl: url,
      updatedAt: Date.now()
    });
    if (!stored) return;
    state.faviconCache[key] = stored;
    state.faviconCache = prune(state.faviconCache);
    syncHotFromState();
    persistSoon();
  }

  function remember(href, logoUrl, meta = {}) {
    if (!String(logoUrl || "").trim() || isNetworkFavicon(logoUrl) || isLetterFallbackIcon(logoUrl)) return;
    const data = acceptedDataIcon(logoUrl);
    if (data) {
      rememberBlob(href, data, {
        ...meta,
        quality: meta.quality || classifyFaviconQuality({ url: logoUrl, dataUrl: data, declared: true }),
        source: meta.source || "declared"
      });
      return;
    }
    const icon = pageUrl(logoUrl, href);
    if (!icon || !siteIcon(href, icon.href)) return;
    const keys = cacheKeys(href);
    if (!keys.length) return;
    const stored = qualityEntry(icon.href, {
      ...meta,
      declared: meta.declared === true || !isGuessedFaviconPath(icon.href),
      updatedAt: Date.now()
    });
    if (!stored) return;
    for (const key of keys) state.faviconCache[key] = stored;
    state.faviconCache = prune(state.faviconCache);
    persistSoon();
  }

  async function rasterLooksNearSolid(file) {
    try {
      if (typeof createImageBitmap !== "function") return false;
      const bitmap = await createImageBitmap(file);
      const width = Math.max(1, bitmap.width || 0);
      const height = Math.max(1, bitmap.height || 0);
      const canvas = typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement("canvas"), { width, height });
      const context = canvas.getContext("2d");
      if (!context?.getImageData) {
        bitmap.close?.();
        return false;
      }
      context.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      return isNearSolidRgba(context.getImageData(0, 0, width, height).data);
    } catch {
      return false;
    }
  }

  async function persistFetchedBlob(href, src, meta = {}) {
    const page = pageUrl(src) || pageUrl(src, href);
    if (!page || isNetworkFavicon(page.href)) return "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetchPage(page.href, { cache: "force-cache", credentials: "omit", signal: controller.signal });
      if (!response?.ok) return "";
      const type = String(response.headers?.get?.("content-type") || "").toLowerCase();
      const bytes = await responseBytes(response);
      if (!bytes || bytes.length < 16) return "";
      if (rejectedRasterBytes(page.href, bytes)) return "";
      const size = rasterPixelSize(bytes);
      if (size && isRejectedGuessedRaster(page.href, size.width, size.height)) return "";
      const asText = new TextDecoder().decode(bytes);
      if (isPaintedSvgMarkup(asText)) {
        const encodedSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(asText)}`;
        if (encodedSvg.length <= APP_ICON_DATA_MAX_CHARS && acceptedDataIcon(encodedSvg)) {
          rememberBlob(href, encodedSvg, {
            quality: FAVICON_QUALITY_BRAND_SVG,
            source: meta.source || (isGuessedFaviconPath(page.href) ? "guessed-svg" : "declared"),
            width: 0,
            height: 0
          });
          return encodedSvg;
        }
      }
      if (looksSvgFavicon(page.href, type) && !isPaintedSvgMarkup(asText)) return "";
      const fileType = type.startsWith("image/") ? type.replace("image/jpg", "image/jpeg") : "image/png";
      const file = typeof File === "function" ? new File([bytes], "favicon", { type: fileType }) : new Blob([bytes], { type: fileType });
      if (await rasterLooksNearSolid(file)) return "";
      const encoded = await encodeFile(file);
      if (!encoded) return "";
      if (/image\/svg\+xml/i.test(encoded) && !acceptedDataIcon(encoded)) return "";
      if (isLetterFallbackIcon(encoded)) return "";
      const declared = meta.declared === true || !isGuessedFaviconPath(page.href);
      const quality = /image\/svg\+xml/i.test(encoded)
        ? FAVICON_QUALITY_BRAND_SVG
        : (declared ? FAVICON_QUALITY_DECLARED_RASTER : FAVICON_QUALITY_OK_RASTER);
      rememberBlob(href, encoded, {
        quality,
        source: meta.source || (declared ? "declared" : "guessed"),
        width: size?.width || 0,
        height: size?.height || 0
      });
      return encoded;
    } catch {
      return "";
    } finally {
      clearTimeout(timer);
    }
  }

  async function rememberDecoded(href, image) {
    if (image?.dataset?.fallback === "1" || image?.dataset?.faviconMiss === "1") return "";
    const src = typeof image === "string"
      ? String(image || "").trim()
      : String(image?.currentSrc || image?.src || "").trim();
    if (!src || isNetworkFavicon(src) || isLetterFallbackIcon(src)) return "";
    const width = Number(image?.naturalWidth || 0);
    const height = Number(image?.naturalHeight || 0);
    if ((width || height) && isRejectedGuessedRaster(src, width, height)) return "";
    const data = acceptedDataIcon(src);
    if (data) {
      if (isLetterFallbackIcon(data)) return "";
      rememberBlob(href, data, {
        quality: /image\/svg\+xml/i.test(data)
          ? FAVICON_QUALITY_BRAND_SVG
          : classifyFaviconQuality({
            url: src,
            dataUrl: data,
            declared: !isGuessedFaviconPath(src)
          }),
        source: "decoded"
      });
      return data;
    }
    if (!siteIcon(href, src)) return "";
    const declared = !isGuessedFaviconPath(src);
    if (declared) remember(href, src, { source: "decoded", declared: true });
    return persistFetchedBlob(href, src, { declared, source: "decoded" });
  }

  function discoveryHost(href) {
    return faviconDiscoveryKey(href);
  }

  async function materializeIcon(href, logoUrl, meta = {}) {
    const data = acceptedDataIcon(logoUrl);
    if (data) {
      rememberBlob(href, data, {
        ...meta,
        quality: meta.quality || classifyFaviconQuality({ url: logoUrl, dataUrl: data, declared: true }),
        source: meta.source || "declared"
      });
      return data;
    }
    const encoded = await persistFetchedBlob(href, logoUrl, meta);
    if (encoded) return encoded;
    remember(href, logoUrl, meta);
    return logoUrl;
  }

  async function discover(href) {
    const hit = cachedBlob(href);
    if (hit) return hit;
    const page = pageUrl(href);
    if (!page) return "";
    page.hash = "";
    const host = discoveryHost(page.href);
    if (!host) return "";
    if (discoveryPromises.has(host)) return discoveryPromises.get(host);
    if (discoveredHosts.has(host)) return "";
    const promise = (async () => {
      try {
      const targets = [];
      const pushTarget = (value) => {
        const next = pageUrl(value);
        if (next && !targets.includes(next.href)) targets.push(next.href);
      };
      if (!isApiLookupHref(page.href)) pushTarget(page.href);
      pushTarget(`${page.origin}/`);
      for (const hostName of networkLookupHosts(page.hostname)) {
        pushTarget(`${page.protocol}//${hostName}/`);
      }
      for (const target of targets) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        try {
          const response = await fetchPage(target, { cache: "force-cache", credentials: "omit", signal: controller.signal });
          if (!response.ok) continue;
          const logoUrl = chooseDeclared(parseHtml(await response.text()), target);
          if (logoUrl) {
            return materializeIcon(page.href, logoUrl, { source: "declared", declared: true });
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
            if (rejectedRasterBytes(icon, bytes)) continue;
            if (looksSvgFavicon(icon, type) && !isPaintedSvgMarkup(new TextDecoder().decode(bytes))) continue;
          } else if (!type.startsWith("image/")) continue;
          const declared = !isGuessedFaviconPath(icon);
          return materializeIcon(page.href, icon, {
            source: declared ? "declared" : "guessed",
            declared,
            quality: classifyFaviconQuality({ url: icon, type, declared })
          });
        } catch {
        } finally {
          clearTimeout(timer);
        }
      }
      return "";
      } finally {
        discoveredHosts.add(host);
        discoveryPromises.delete(host);
      }
    })();
    discoveryPromises.set(host, promise);
    return promise;
  }

  function forget(href) {
    const keys = cacheKeys(href);
    const blobKey = faviconBlobKey(href);
    const host = discoveryHost(href);
    if (!keys.length && !blobKey && !host) return;
    for (const key of keys) delete state.faviconCache[key];
    if (blobKey) delete state.faviconCache[blobKey];
    const peeled = blobKey.startsWith("blob:") ? blobKey.slice("blob:".length) : "";
    if (peeled) hotBlobs.delete(peeled);
    if (host) {
      discoveredHosts.delete(host);
      discoveryPromises.delete(host);
    }
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
      if (url && !urls.includes(url) && !isLetterFallbackIcon(url)) urls.push(url);
    };
    push(overrideUrl(options.appId));
    push(cachedBlob(href));
    const declared = String(declaredLogoUrl || "").trim();
    const declaredData = acceptedDataIcon(declared);
    if (declaredData) push(declaredData);
    else if (declared && APP_ICON_DATA_RE.test(declared) && !isLetterFallbackIcon(declared)) push(declared);
    const declaredPage = declared && !declaredData ? pageUrl(declared, href) : null;
    if (declaredPage && siteIcon(href, declaredPage.href)) push(declaredPage.href);
    push(acceptedTabFavicon(options.tabFaviconUrl) || tabUrl(href));
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
        const scale = Math.min(size / Math.max(bitmap.width, 1), size / Math.max(bitmap.height, 1));
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
    const stored = normalizeCache(await storageGet(FAVICON_CACHE_KEY), { blobsOnly: true });
    if (Object.keys(stored).length) {
      state.faviconCache = stored;
      syncHotFromState();
      return state.faviconCache;
    }
    const migratedV7 = normalizeCache(await storageGet(FAVICON_CACHE_V7_KEY), { blobsOnly: true });
    if (Object.keys(migratedV7).length) {
      state.faviconCache = migratedV7;
      syncHotFromState();
      persistSoon();
      return state.faviconCache;
    }
    const migratedV6 = normalizeCache(await storageGet(FAVICON_CACHE_V6_KEY), { dropRasterBlobs: true, blobsOnly: true });
    if (Object.keys(migratedV6).length) {
      state.faviconCache = migratedV6;
      syncHotFromState();
      persistSoon();
      return state.faviconCache;
    }
    const migratedV5 = normalizeCache(await storageGet(FAVICON_CACHE_V5_KEY), { dropRasterBlobs: true });
    if (Object.keys(migratedV5).length) {
      state.faviconCache = migratedV5;
      syncHotFromState();
      persistSoon();
      return state.faviconCache;
    }
    const migrated = normalizeCache(await storageGet(FAVICON_CACHE_V4_KEY), { migrate: true });
    state.faviconCache = migrated;
    syncHotFromState();
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
