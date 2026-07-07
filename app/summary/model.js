export const SUMMARY_PANEL_MIN_WIDTH = 420;
export const SUMMARY_PANEL_MIN_HEIGHT = 420;

export function summarySourceKey(source) {
  const title = String(source?.title || source?.pageTitle || "").trim();
  const href = String(source?.href || "").trim();
  return source?.key || source?.instanceId || (title || href ? `${title}\n${href}` : "");
}

export function summarySourceOrder(source) {
  const order = Number(source?.order);
  return Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
}

export function compareSummarySourceItems(a, b) {
  const order = summarySourceOrder(a) - summarySourceOrder(b);
  if (order) return order;
  return summarySourceKey(a).localeCompare(summarySourceKey(b));
}

export function summarySourceId(source = {}) {
  const text = `${source.siteId || ""} ${source.siteName || ""} ${source.name || ""} ${source.title || ""} ${source.href || ""}`.toLowerCase();
  if (text.includes("kagi")) return "kagi";
  if (text.includes("grok") || text.includes("dairoot")) return "grok";
  if (text.includes("notion")) return "notion";
  if (text.includes("chatgpt") || text.includes("openai")) return "chatgpt";
  if (text.includes("claude")) return "claude";
  if (text.includes("gemini")) return "gemini";
  if (text.includes("deepseek")) return "deepseek";
  if (text.includes("lobehub")) return "lobehub";
  if (text.includes("typingmind")) return "typingmind";
  return "generic";
}

export function summarySourceMeta(source = {}, helpers = {}) {
  const effectiveFaviconUrl = helpers.effectiveFaviconUrl || ((href, logoUrl) => logoUrl || href || "");
  const id = summarySourceId(source);
  const labels = {
    kagi: "kagi",
    grok: "grok",
    notion: "NotionAI",
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini",
    deepseek: "DeepSeek",
    lobehub: "LobeHub",
    typingmind: "TypingMind",
    generic: "Source"
  };
  const brand = labels[id] || labels.generic;
  const knownSource = id !== "generic";
  return {
    id,
    brand: knownSource ? brand : source.siteName || source.name || brand,
    title: source.pageTitle || source.title || source.href || brand,
    href: source.href || "",
    logoUrl: source.logoUrl || effectiveFaviconUrl(source.href, source.logoUrl)
  };
}

export function summaryPreviewStatus(rawStatus) {
  if (rawStatus === "failed" || rawStatus === "error") return "failed";
  if (rawStatus === "skipped") return "skipped";
  return "ok";
}

export function summaryPreviewPage(item = {}) {
  return item.status === "ok" && item.page ? item.page : item;
}

export function summaryPreviewIndex(source = {}, fallback = {}) {
  const index = Number(source.index);
  if (Number.isFinite(index)) return index;
  const order = Number(source.order);
  if (Number.isFinite(order)) return order;
  const fallbackIndex = Number(fallback.index ?? fallback.order);
  return Number.isFinite(fallbackIndex) ? fallbackIndex : 0;
}

export function summaryPreviewKey(source = {}, fallback = {}) {
  return summarySourceKey(source) || summarySourceKey(fallback) || `iframe-${summaryPreviewIndex(source, fallback) + 1}`;
}

export function buildSummaryPreviewItem(result = {}, fallback = {}, helpers = {}) {
  const translate = helpers.t || ((key) => key);
  const effectiveFaviconUrl = helpers.effectiveFaviconUrl || ((href, logoUrl) => logoUrl || href || "");
  const context = result.context;
  if (context) {
    const key = summaryPreviewKey(context, fallback);
    const index = summaryPreviewIndex(context, fallback);
    const href = context.href || fallback.href || "";
    const fallbackPageName = translate("summaryPanel.pageLabel", { count: index + 1 });
    const title = context.pageTitle || context.title || fallback.title || href || fallbackPageName;
    const name = context.siteName || context.name || fallback.name || context.title || fallbackPageName;
    const logoUrl = context.logoUrl || fallback.logoUrl || effectiveFaviconUrl(href, context.logoUrl || fallback.logoUrl);
    const page = {
      ...context,
      name,
      title,
      href,
      logoUrl,
      messages: context.messages || []
    };
    return {
      key,
      index,
      order: index,
      instanceId: context.instanceId || fallback.instanceId || "",
      siteId: context.siteId || fallback.siteId || "",
      siteName: context.siteName || fallback.siteName || "",
      name,
      title,
      href,
      logoUrl,
      status: "ok",
      reason: "",
      page
    };
  }
  const diagnostic = result.diagnostic || fallback || {};
  const status = summaryPreviewStatus(diagnostic.status || fallback.status || "skipped");
  const index = summaryPreviewIndex(diagnostic, fallback);
  const href = diagnostic.href || fallback.href || "";
  const fallbackPageName = translate("summaryPanel.pageLabel", { count: index + 1 });
  const title = diagnostic.pageTitle || diagnostic.title || fallback.title || href || fallbackPageName;
  const name = diagnostic.siteName || diagnostic.name || fallback.name || diagnostic.title || fallbackPageName;
  const logoUrl = diagnostic.logoUrl || fallback.logoUrl || effectiveFaviconUrl(href, diagnostic.logoUrl || fallback.logoUrl);
  return {
    ...diagnostic,
    key: summaryPreviewKey(diagnostic, fallback),
    index,
    order: index,
    instanceId: diagnostic.instanceId || fallback.instanceId || "",
    siteId: diagnostic.siteId || fallback.siteId || "",
    siteName: diagnostic.siteName || fallback.siteName || "",
    name,
    title,
    href,
    logoUrl,
    status,
    reason: diagnostic.reason || diagnostic.message || fallback.reason || fallback.message || (status === "failed" ? translate("summaryPanel.collectionFailed") : translate("summaryPanel.pageSkipped")),
    page: undefined
  };
}

export function summaryContextsFromPreviewItems(items = []) {
  return (items || [])
    .filter((item) => item.status === "ok" && item.page && item.page.messages?.length)
    .map((item) => ({
      ...item.page,
      key: item.key,
      instanceId: item.instanceId,
      siteId: item.siteId || item.page.siteId,
      siteName: item.siteName || item.page.siteName,
      title: item.page.title,
      pageTitle: item.page.title,
      href: item.page.href,
      logoUrl: item.page.logoUrl,
      order: item.order ?? item.index
    }));
}

export function normalizeSummaryPanelSize(value) {
  if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height)) return null;
  const size = {
    width: Math.round(value.width),
    height: Math.round(value.height)
  };
  if (Number.isFinite(value.left) && Number.isFinite(value.top)) {
    size.left = Math.round(value.left);
    size.top = Math.round(value.top);
  }
  return size;
}
