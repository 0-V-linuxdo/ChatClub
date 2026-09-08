import { el } from "./dom.js";
import {
  isImmediateReadyFavicon,
  isGuessedFaviconPath,
  isRejectedGuessedRaster,
  networkFaviconUrls as sharedNetworkFaviconUrls,
  siteFaviconUrls as sharedSiteFaviconUrls
} from "../shared/favicon-lookup.js";

const CHAT_FAVICON_STACK_MAX = 4;
const EMPTY_FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`;

function pushFaviconUrl(urls, value) {
  const url = String(value || "").trim();
  if (url && !urls.includes(url)) urls.push(url);
  return urls;
}

function listedFaviconUrls(value) {
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
}

function chatFaviconCandidates(source = {}, deps = {}) {
  const href = String(source.href || source.url || source.app?.url || "").trim();
  const logoUrl = String(source.logoUrl || "").trim();
  const app = source.app;
  const appId = source.appId || app?.id;
  if (typeof deps.candidateFaviconUrls === "function") {
    const listed = listedFaviconUrls(deps.candidateFaviconUrls(href, logoUrl, { appId }));
    if (listed.length) {
      const urls = [];
      for (const url of listed) pushFaviconUrl(urls, url);
      return urls;
    }
  }
  const urls = [];
  if (app && typeof deps.appFaviconUrl === "function") pushFaviconUrl(urls, deps.appFaviconUrl(app));
  if (typeof deps.effectiveFaviconUrl === "function") {
    pushFaviconUrl(urls, deps.effectiveFaviconUrl(href, logoUrl, { appId }));
  } else {
    pushFaviconUrl(urls, logoUrl);
  }
  const site = typeof deps.siteFaviconUrls === "function"
    ? listedFaviconUrls(deps.siteFaviconUrls(href))
    : sharedSiteFaviconUrls(href);
  for (const url of site) pushFaviconUrl(urls, url);
  const extra = typeof deps.networkFaviconUrls === "function"
    ? deps.networkFaviconUrls(href)
    : sharedNetworkFaviconUrls(href);
  for (const url of listedFaviconUrls(extra)) pushFaviconUrl(urls, url);
  return urls;
}

function isGenericNetworkFavicon(image) {
  const src = String(image?.currentSrc || image?.src || "");
  const width = Number(image?.naturalWidth || 0);
  const height = Number(image?.naturalHeight || 0);
  if (!src || width <= 0 || height <= 0) return false;
  try {
    const parsed = new URL(src);
    if (parsed.hostname === "icons.duckduckgo.com" && parsed.pathname.startsWith("/ip3/")) {
      return width === 48 && height === 48;
    }
    if (parsed.hostname === "www.google.com" && parsed.pathname.startsWith("/s2/favicons")) {
      const requested = Number(parsed.searchParams.get("sz") || 16);
      return requested >= 32 && width <= 16 && height <= 16;
    }
  } catch {}
  return false;
}

function isDecodedFaviconMiss(image) {
  if (isGenericNetworkFavicon(image)) return true;
  const width = Number(image?.naturalWidth || 0);
  const height = Number(image?.naturalHeight || 0);
  if (width === 1 && height === 1) return true;
  return isRejectedGuessedRaster(image?.currentSrc || image?.src, width, height);
}

function isRemoteFaviconSrc(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function markFaviconReady(image) {
  if (!image || image.dataset.faviconMiss === "1") return;
  image.dataset.faviconReady = "1";
  delete image.dataset.faviconRemote;
}

function syncFaviconRemote(image, src) {
  if (!image) return;
  if (isRemoteFaviconSrc(src)) image.dataset.faviconRemote = "1";
  else delete image.dataset.faviconRemote;
}

function finishFaviconMiss(image, deps = {}) {
  image.dataset.faviconMiss = "1";
  delete image.dataset.faviconReady;
  if (deps.keepVisibleOnMiss) {
    const classes = String(image.className || "").split(/\s+/).filter(Boolean);
    if (!classes.includes("settings-site-icon-empty")) {
      image.className = [...classes, "settings-site-icon-empty"].join(" ");
    }
    image.src = EMPTY_FAVICON;
    return;
  }
  image.hidden = true;
}

function advanceFavicon(image, candidates, href, fallbackUrl, deps = {}) {
  if (!image || image.dataset.faviconMiss === "1") return;
  delete image.dataset.faviconReady;
  let index = Number(image.dataset.faviconIndex || 0) + 1;
  while (index < candidates.length) {
    const next = candidates[index];
    index += 1;
    if (next && image.src !== next) {
      image.dataset.faviconIndex = String(index - 1);
      syncFaviconRemote(image, next);
      image.src = next;
      return;
    }
  }
  if (typeof deps.browserFaviconUrl === "function" && image.dataset.browserFallback !== "1") {
    image.dataset.browserFallback = "1";
    const browserUrl = String(deps.browserFaviconUrl(href) || "").trim();
    if (browserUrl && image.src !== browserUrl) {
      syncFaviconRemote(image, browserUrl);
      image.src = browserUrl;
      return;
    }
  }
  if (image.dataset.fallback === "1") {
    finishFaviconMiss(image, deps);
    return;
  }
  image.dataset.fallback = "1";
  if (fallbackUrl && image.src !== fallbackUrl) {
    syncFaviconRemote(image, fallbackUrl);
    image.src = fallbackUrl;
    return;
  }
  finishFaviconMiss(image, deps);
}

function rememberDecodedSrc(image, href, deps = {}) {
  if (image.dataset.faviconMiss === "1" || image.dataset.fallback === "1") return Promise.resolve("");
  if (typeof deps.rememberDecodedFavicon !== "function" || !href) return Promise.resolve("");
  return Promise.resolve(deps.rememberDecodedFavicon(href, image)).catch(() => "");
}

export function uniqueChatFaviconSources(items = [], resolve) {
  const seen = new Set();
  const sources = [];
  for (const item of Array.isArray(items) ? items : []) {
    const source = typeof resolve === "function" ? resolve(item) : item;
    if (!source || typeof source !== "object") continue;
    const key = String(source.appId || source.app?.id || source.href || source.url || source.logoUrl || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sources.push(source);
  }
  return sources;
}

export function renderChatFavicon(source = {}, deps = {}) {
  const href = String(source.href || source.url || source.app?.url || "").trim();
  const app = source.app;
  const fallbackUrl = app && typeof deps.fallbackFaviconUrl === "function"
    ? String(deps.fallbackFaviconUrl(app) || "").trim()
    : "";
  const candidates = chatFaviconCandidates(source, deps);
  const initial = candidates[0] || fallbackUrl;
  if (!initial) return null;
  const usedFallback = !candidates[0] && Boolean(fallbackUrl);
  const readyNow = usedFallback || isImmediateReadyFavicon(initial);
  const remoteNow = !readyNow && isRemoteFaviconSrc(initial);
  return el("img", {
    class: deps.className || "chat-favicon",
    alt: "",
    title: deps.omitTitle ? "" : (source.title || ""),
    draggable: "false",
    loading: deps.loading || "lazy",
    decoding: "async",
    referrerpolicy: "no-referrer",
    dataset: {
      faviconIndex: "0",
      ...(readyNow ? { faviconReady: "1" } : {}),
      ...(remoteNow ? { faviconRemote: "1" } : {}),
      ...(usedFallback ? { fallback: "1" } : {})
    },
    onload: (event) => {
      const image = event.currentTarget;
      if (isDecodedFaviconMiss(image)) {
        advanceFavicon(image, candidates, href, fallbackUrl, deps);
        return;
      }
      const src = String(image.currentSrc || image.src || "");
      if (isGuessedFaviconPath(src) && typeof deps.rememberDecodedFavicon === "function") {
        return rememberDecodedSrc(image, href, deps).then((accepted) => {
          if (!accepted) {
            advanceFavicon(image, candidates, href, fallbackUrl, deps);
            return;
          }
          markFaviconReady(image);
        });
      }
      markFaviconReady(image);
      if (usedFallback || image.dataset.fallback === "1") return;
      rememberDecodedSrc(image, href, deps);
    },
    onerror: (event) => advanceFavicon(event.currentTarget, candidates, href, fallbackUrl, deps),
    src: initial
  });
}

export function renderChatFaviconStack(sources = [], deps = {}) {
  const icons = (Array.isArray(sources) ? sources : [])
    .map((source) => renderChatFavicon(source, { ...deps, className: "chat-favicon-stack-item" }))
    .filter(Boolean);
  if (!icons.length) return null;
  const visible = icons.slice(0, CHAT_FAVICON_STACK_MAX);
  const extra = icons.length - visible.length;
  return el("span", {
    class: ["chat-favicon-stack", deps.stackClass].filter(Boolean).join(" "),
    "aria-hidden": "true"
  },
    visible,
    extra > 0 ? el("span", { class: "chat-favicon-stack-more" }, `+${extra}`) : null
  );
}
