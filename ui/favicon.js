import { el } from "./dom.js";

const CHAT_FAVICON_STACK_MAX = 4;

function fallbackNetworkFaviconUrls(href) {
  try {
    const page = new URL(String(href || ""));
    if (page.protocol !== "http:" && page.protocol !== "https:") return [];
    const host = page.hostname;
    return [
      `https://icons.duckduckgo.com/ip3/${host}.ico`,
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
    ];
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
    src: initial,
    alt: "",
    title: deps.omitTitle ? "" : (source.title || ""),
    draggable: "false",
    loading: "lazy",
    decoding: "async",
    referrerpolicy: "no-referrer",
    dataset: { faviconIndex: "0" },
    onerror: (event) => {
      const image = event.currentTarget;
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
        image.hidden = true;
        return;
      }
      image.dataset.fallback = "1";
      if (fallbackUrl && image.src !== fallbackUrl) {
        image.src = fallbackUrl;
        return;
      }
      image.hidden = true;
    }
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
