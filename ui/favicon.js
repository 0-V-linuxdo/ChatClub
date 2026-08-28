import { el } from "./dom.js";

const CHAT_FAVICON_STACK_MAX = 4;

function chatFaviconSrc(source = {}, deps = {}) {
  const href = String(source.href || source.url || "").trim();
  const logoUrl = String(source.logoUrl || "").trim();
  const app = source.app;
  if (app && typeof deps.appFaviconUrl === "function") {
    const url = String(deps.appFaviconUrl(app) || "").trim();
    if (url) return url;
  }
  if (typeof deps.effectiveFaviconUrl === "function") {
    const url = String(deps.effectiveFaviconUrl(href, logoUrl) || "").trim();
    if (url) return url;
  }
  return logoUrl;
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

function renderChatFavicon(source = {}, deps = {}) {
  const href = String(source.href || source.url || source.app?.url || "").trim();
  const app = source.app;
  const fallbackUrl = app && typeof deps.fallbackFaviconUrl === "function"
    ? String(deps.fallbackFaviconUrl(app) || "").trim()
    : "";
  const initial = chatFaviconSrc(source, deps) || fallbackUrl;
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
    onerror: (event) => {
      const image = event.currentTarget;
      if (image.dataset.browserFallback !== "1") {
        image.dataset.browserFallback = "1";
        const browserUrl = typeof deps.browserFaviconUrl === "function"
          ? String(deps.browserFaviconUrl(href) || "").trim()
          : "";
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
