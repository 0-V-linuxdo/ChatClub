const LOOKUP_HOST_PREFIX_RE = /^(api|ai|www|chat)\./i;
export const APP_ICON_DATA_RE = /^data:image\/(?:png|jpeg|jpg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)[;,]/i;
export const APP_ICON_DATA_MAX_CHARS = 65536;
export const FAVICON_QUALITY_BRAND_SVG = "brand-svg";
export const FAVICON_QUALITY_DECLARED_RASTER = "declared-raster";
export const FAVICON_QUALITY_OK_RASTER = "ok-raster";
const GUESSED_FAVICON_PATH_RE = /\/favicon\.(?:ico|svg)$/i;
const SVG_PAINT_RE = /<(?:path|circle|rect|ellipse|polygon|polyline|line|text|use|g)\b/i;
const LETTER_FALLBACK_VIEW_RE = /viewBox=["']0 0 32 32["']/i;
const NEAR_SOLID_RGB_DIST = 28 * 28;
const NEAR_SOLID_RATIO = 0.97;
const NEAR_SOLID_MIN_OPAQUE = 16;

export function networkLookupHosts(hostname) {
  const hosts = [];
  const push = (value) => {
    const host = String(value || "").trim().toLowerCase().replace(/\.$/, "");
    if (host && host.includes(".") && !hosts.includes(host)) hosts.push(host);
  };
  const raw = String(hostname || "").trim().toLowerCase();
  push(raw);
  push(raw.replace(LOOKUP_HOST_PREFIX_RE, ""));
  return hosts;
}

export function isApiLookupHref(href) {
  try {
    const page = new URL(String(href || ""));
    if (page.protocol !== "http:" && page.protocol !== "https:") return false;
    if (/^(api|ai)\./i.test(page.hostname)) return true;
    return /(?:^|\/)(?:v\d+|chat\/completions|responses)(?:\/|$)/i.test(page.pathname);
  } catch {
    return false;
  }
}

export function isNetworkFavicon(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (parsed.hostname === "icons.duckduckgo.com") return true;
    return parsed.hostname === "www.google.com" && parsed.pathname.startsWith("/s2/favicons");
  } catch {
    return false;
  }
}

export function siteFaviconUrls(href) {
  try {
    const page = new URL(String(href || ""));
    if (page.protocol !== "http:" && page.protocol !== "https:") return [];
    const urls = [];
    const push = (value) => {
      if (value && !urls.includes(value)) urls.push(value);
    };
    for (const host of networkLookupHosts(page.hostname)) {
      push(`${page.protocol}//${host}/favicon.svg`);
      push(`${page.protocol}//${host}/favicon.ico`);
    }
    return urls;
  } catch {
    return [];
  }
}

export function networkFaviconUrls(href) {
  try {
    const page = new URL(String(href || ""));
    if (page.protocol !== "http:" && page.protocol !== "https:") return [];
    const urls = [];
    const push = (value) => {
      if (value && !urls.includes(value)) urls.push(value);
    };
    for (const host of networkLookupHosts(page.hostname)) {
      push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
      push(`https://icons.duckduckgo.com/ip3/${host}.ico`);
    }
    return urls;
  } catch {
    return [];
  }
}

function decodeDataSvg(url) {
  const raw = String(url || "").trim();
  const match = raw.match(/^data:image\/svg\+xml(?:;charset=utf-8)?(?:;base64)?,([\s\S]*)$/i);
  if (!match) return "";
  if (/;base64,/i.test(raw.split(",", 1)[0] || "")) {
    try {
      return atob(match[1]);
    } catch {
      return "";
    }
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function isPaintedSvgMarkup(svg) {
  const text = String(svg || "");
  if (!/<svg[\s>]/i.test(text)) return false;
  const inner = text
    .replace(/<svg\b[^>]*>/i, "")
    .replace(/<\/svg>[\s\S]*$/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  return Boolean(inner) && SVG_PAINT_RE.test(inner);
}

export function acceptedDataIcon(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > APP_ICON_DATA_MAX_CHARS || !APP_ICON_DATA_RE.test(raw)) return "";
  if (/image\/svg\+xml/i.test(raw) && !isPaintedSvgMarkup(decodeDataSvg(raw))) return "";
  return raw;
}

export function isLetterFallbackIcon(url) {
  const svg = decodeDataSvg(url);
  if (!svg || !LETTER_FALLBACK_VIEW_RE.test(svg)) return false;
  return /<rect\b/i.test(svg) && /<text\b/i.test(svg) && /font-family="system-ui/i.test(svg);
}

export function looksSvgFavicon(url, type = "") {
  const raw = String(url || "");
  const path = raw.split(/[?#]/, 1)[0].toLowerCase();
  return path.endsWith(".svg")
    || /image\/svg\+xml/i.test(raw)
    || String(type || "").toLowerCase().includes("svg");
}

export function isGuessedFaviconPath(url) {
  try {
    const parsed = new URL(String(url || ""), "https://example.invalid");
    return GUESSED_FAVICON_PATH_RE.test(parsed.pathname);
  } catch {
    return false;
  }
}

function pngSizeAt(view, offset = 0) {
  if (offset + 24 > view.length) return null;
  if (
    view[offset] !== 0x89
    || view[offset + 1] !== 0x50
    || view[offset + 2] !== 0x4e
    || view[offset + 3] !== 0x47
  ) return null;
  const width = ((view[offset + 16] << 24) | (view[offset + 17] << 16) | (view[offset + 18] << 8) | view[offset + 19]) >>> 0;
  const height = ((view[offset + 20] << 24) | (view[offset + 21] << 16) | (view[offset + 22] << 8) | view[offset + 23]) >>> 0;
  if (!width || !height) return null;
  return { width, height };
}

export function rasterPixelSize(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const png = pngSizeAt(view, 0);
  if (png) return png;
  if (view.length >= 22 && view[0] === 0 && view[1] === 0 && view[2] === 1 && view[3] === 0) {
    const count = view[4] | (view[5] << 8);
    let best = null;
    for (let index = 0; index < count; index += 1) {
      const entry = 6 + index * 16;
      if (entry + 16 > view.length) break;
      const offset = view[entry + 12] | (view[entry + 13] << 8) | (view[entry + 14] << 16) | (view[entry + 15] << 24);
      const embedded = pngSizeAt(view, offset);
      if (embedded && (!best || embedded.width * embedded.height > best.width * best.height)) best = embedded;
    }
    if (best) return best;
    const width = view[6] === 0 ? 256 : view[6];
    const height = view[7] === 0 ? 256 : view[7];
    return width && height ? { width, height } : null;
  }
  return null;
}

export function isRejectedGuessedRaster(url, width, height) {
  if (!isGuessedFaviconPath(url)) return false;
  const w = Number(width || 0);
  const h = Number(height || 0);
  if (!w && !h) return false;
  const edge = Math.max(w, h);
  return edge <= 16 || edge >= 512;
}

export function rejectedRasterBytes(url, bytes) {
  const size = rasterPixelSize(bytes);
  if (!size) return false;
  return isRejectedGuessedRaster(url, size.width, size.height);
}

export function isNearSolidRgba(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (view.length < 16 || view.length % 4 !== 0) return false;
  let count = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let index = 0; index < view.length; index += 4) {
    if (view[index + 3] < 16) continue;
    count += 1;
    rSum += view[index];
    gSum += view[index + 1];
    bSum += view[index + 2];
  }
  if (count < NEAR_SOLID_MIN_OPAQUE) return false;
  const rMean = rSum / count;
  const gMean = gSum / count;
  const bMean = bSum / count;
  let close = 0;
  for (let index = 0; index < view.length; index += 4) {
    if (view[index + 3] < 16) continue;
    const dr = view[index] - rMean;
    const dg = view[index + 1] - gMean;
    const db = view[index + 2] - bMean;
    if (dr * dr + dg * dg + db * db <= NEAR_SOLID_RGB_DIST) close += 1;
  }
  return close / count >= NEAR_SOLID_RATIO;
}

export function isFaviconQuality(value) {
  return value === FAVICON_QUALITY_BRAND_SVG
    || value === FAVICON_QUALITY_DECLARED_RASTER
    || value === FAVICON_QUALITY_OK_RASTER;
}

export function classifyFaviconQuality({ url = "", type = "", declared = false, dataUrl = "" } = {}) {
  const raw = String(dataUrl || url || "").trim();
  if (!raw || isNetworkFavicon(raw) || isLetterFallbackIcon(raw)) return "";
  if (acceptedDataIcon(raw) && /image\/svg\+xml/i.test(raw)) return FAVICON_QUALITY_BRAND_SVG;
  if (looksSvgFavicon(url || raw, type) && !APP_ICON_DATA_RE.test(raw)) return FAVICON_QUALITY_BRAND_SVG;
  if (declared === true) return FAVICON_QUALITY_DECLARED_RASTER;
  if (APP_ICON_DATA_RE.test(raw) && !/image\/svg\+xml/i.test(raw)) return FAVICON_QUALITY_OK_RASTER;
  if (!isGuessedFaviconPath(url || raw)) return FAVICON_QUALITY_DECLARED_RASTER;
  return FAVICON_QUALITY_OK_RASTER;
}

export function isImmediateReadyFavicon(url) {
  const raw = String(url || "").trim();
  if (!raw) return false;
  if (isLetterFallbackIcon(raw)) return true;
  return Boolean(acceptedDataIcon(raw));
}

export function faviconColorScheme({ media = "", href = "" } = {}) {
  const mediaText = String(media || "").toLowerCase();
  const path = String(href || "").split(/[?#]/, 1)[0].toLowerCase();
  if (/prefers-color-scheme:\s*dark/.test(mediaText) || /favicon-dark(?:\.[a-z0-9]+)?$/.test(path)) return "dark";
  if (/prefers-color-scheme:\s*light/.test(mediaText) || /favicon-light(?:\.[a-z0-9]+)?$/.test(path)) return "light";
  return "";
}

export function faviconDeclaredSizeScore({ sizes = "", href = "", rel = "" } = {}) {
  if (looksSvgFavicon(href)) return 0;
  const nums = String(sizes || "").toLowerCase().match(/\d+/g)?.map(Number).filter((value) => value > 0) || [];
  let maxSize = nums.length ? Math.max(...nums) : 0;
  if (!maxSize) {
    const file = String(href || "").split(/[?#]/, 1)[0];
    const named = file.match(/(\d{2,3})x\1/i) || file.match(/(?:^|[-_/])(\d{2,3})\.(?:png|ico|jpe?g|webp)$/i);
    if (named) maxSize = Number(named[1]);
  }
  if (maxSize >= 128) return 0;
  if (maxSize >= 64) return 1;
  if (maxSize >= 48) return 2;
  if (maxSize >= 32) return 3;
  if (maxSize === 16) return 6;
  if (/(^|\s)apple-touch-icon(\s|$)/i.test(rel)) return 1;
  return 4;
}

export function peeledHostCore(hostname) {
  const hosts = networkLookupHosts(hostname);
  return hosts[hosts.length - 1] || "";
}

export function faviconCacheKeys(href) {
  try {
    const page = new URL(String(href || ""));
    if (page.protocol !== "http:" && page.protocol !== "https:") return [];
    page.hash = "";
    const keys = [];
    const push = (value) => {
      const key = String(value || "").trim();
      if (key && !keys.includes(key)) keys.push(key);
    };
    if (!isApiLookupHref(page.href)) {
      push(page.href);
      push(`${page.origin}${page.pathname || "/"}`);
    }
    push(page.origin);
    push(`${page.origin}/`);
    push(page.hostname);
    for (const host of networkLookupHosts(page.hostname)) {
      push(`${page.protocol}//${host}`);
      push(`${page.protocol}//${host}/`);
      push(host);
    }
    return keys;
  } catch {
    return [];
  }
}

export function faviconBlobKey(href) {
  try {
    const page = new URL(String(href || ""));
    const host = peeledHostCore(page.hostname);
    return host ? `blob:${host}` : "";
  } catch {
    return "";
  }
}

export function faviconDiscoveryKey(href) {
  try {
    const page = new URL(String(href || ""));
    return peeledHostCore(page.hostname) || page.origin || "";
  } catch {
    return "";
  }
}
