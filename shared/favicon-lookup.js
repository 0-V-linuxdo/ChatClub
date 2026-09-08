const LOOKUP_HOST_PREFIX_RE = /^(api|ai|www|chat)\./i;
export const APP_ICON_DATA_RE = /^data:image\/(?:png|jpeg|jpg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)[;,]/i;
export const APP_ICON_DATA_MAX_CHARS = 65536;
const GUESSED_FAVICON_PATH_RE = /\/favicon\.(?:ico|svg)$/i;
const SVG_PAINT_RE = /<(?:path|circle|rect|ellipse|polygon|polyline|line|text|use|g)\b/i;

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

export function isOversizedGuessedRaster(url, width, height) {
  const w = Number(width || 0);
  const h = Number(height || 0);
  return (w >= 512 || h >= 512) && isGuessedFaviconPath(url);
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
