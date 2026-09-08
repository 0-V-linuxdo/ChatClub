import { el } from "./dom.js";

const CHAT_FAVICON_STACK_MAX = 4;
const EMPTY_FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`;

function networkLookupHosts(hostname) {
  const hosts = [];
  const push = (value) => {
    const host = String(value || "").trim().toLowerCase().replace(/\.$/, "");
    if (host && host.includes(".") && !hosts.includes(host)) hosts.push(host);
  };
  const raw = String(hostname || "").trim().toLowerCase();
  push(raw);
  push(raw.replace(/^(api|ai|www)\./i, ""));
  return hosts;
}

function fallbackNetworkFaviconUrls(href) {
  try {
    const page = new URL(String(href || ""));
    if (page.protocol !== "http:" && page.protocol !== "https:") return [];
    const urls = [];
    const push = (value) => {
      if (value && !urls.includes(value)) urls.push(value);
    };
    for (const host of networkLookupHosts(page.hostname)) {
      push(`https://icons.duckduckgo.com/ip3/${host}.ico`);
      push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
    }
    return urls;
  } catch {
    return [];
  }
}

function pushFaviconUrl(urls, value) {
  const url = String(value || "").trim();
  if (url && !urls.includes(url)) urls.push(url);
  return urls;
}

function chatFaviconCandidates(source = {}, deps = {}) {
  const href = String(source.href || source.url || source.app?.url || "").trim();
  const logoUrl = String(source.logoUrl || "").trim();
  const app = source.app;
  const appId = source.appId || app?.id;
  const urls = [];
  if (app && typeof deps.appFaviconUrl === "function") pushFaviconUrl(urls, deps.appFaviconUrl(app));
  if (typeof deps.effectiveFaviconUrl === "function") {
    pushFaviconUrl(urls, deps.effectiveFaviconUrl(href, logoUrl, { appId }));
  } else {
    pushFaviconUrl(urls, logoUrl);
  }
  const extra = typeof deps.networkFaviconUrls === "function"
    ? deps.networkFaviconUrls(href)
    : fallbackNetworkFaviconUrls(href);
  for (const url of Array.isArray(extra) ? extra : [extra]) pushFaviconUrl(urls, url);
  return urls;
}

function markFaviconReady(image) {
  if (!image || image.dataset.faviconMiss === "1") return;
  image.dataset.faviconReady = "1";
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
  return el("img", {
    class: deps.className || "chat-favicon",
    alt: "",
    title: deps.omitTitle ? "" : (source.title || ""),
    draggable: "false",
    loading: deps.loading || "lazy",
    decoding: "async",
    referrerpolicy: "no-referrer",
    dataset: { faviconIndex: "0" },
    onload: (event) => markFaviconReady(event.currentTarget),
    onerror: (event) => {
      const image = event.currentTarget;
      if (image.dataset.faviconMiss === "1") return;
      let index = Number(image.dataset.faviconIndex || 0) + 1;
      while (index < candidates.length) {
        const next = candidates[index];
        index += 1;
        if (next && image.src !== next) {
          image.dataset.faviconIndex = String(index - 1);
          image.src = next;
          return;
        }
      }
      if (typeof deps.browserFaviconUrl === "function" && image.dataset.browserFallback !== "1") {
        image.dataset.browserFallback = "1";
        const browserUrl = String(deps.browserFaviconUrl(href) || "").trim();
        if (browserUrl && image.src !== browserUrl) {
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
        image.src = fallbackUrl;
        return;
      }
      finishFaviconMiss(image, deps);
    },
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
