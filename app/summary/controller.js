import { summarizeContexts } from "../../shared/api.js";
import { t } from "../../shared/i18n.js";
import { sendToIframe } from "../../shared/post-message.js";
import { storageGet, storageSet } from "../../shared/storage.js";
import { findSummarySiteConfig } from "../../shared/url-match.js";
import { createActionButton } from "../../ui/components.js";
import { el, iconButton, textarea } from "../../ui/dom.js";
import { optionalControllerFunction, optionalControllerObject, requireControllerContext, requireControllerFunction } from "../controller-context.js";
import { renderMarkdown } from "./markdown.js";
import {
  buildSummaryPreviewItem,
  compareSummarySourceItems as compareSummarySourceItemsModel,
  normalizeSummaryPanelSize as normalizeSummaryPanelSizeModel,
  SUMMARY_PANEL_MIN_HEIGHT,
  SUMMARY_PANEL_MIN_WIDTH,
  summaryContextsFromPreviewItems as summaryContextsFromPreviewItemsModel,
  summaryPreviewIndex as summaryPreviewIndexModel,
  summaryPreviewKey as summaryPreviewKeyModel,
  summaryPreviewPage as summaryPreviewPageModel,
  summaryPreviewStatus as summaryPreviewStatusModel,
  summarySourceId as summarySourceIdModel,
  summarySourceKey as summarySourceKeyModel,
  summarySourceMeta as summarySourceMetaModel,
  summarySourceOrder as summarySourceOrderModel
} from "./model.js";

const SUMMARY_PANEL_SIZE_KEY = "chatclub.summaryPanelSize.v4";

/**
 * @typedef {object} SummaryControllerContext
 * @property {any} state
 * @property {(name: string) => SVGElement} svgIcon
 * @property {(label: string, iconName: string, onClick: Function, extraClass?: string, tooltipLabel?: string, tooltipPlacement?: string, tooltipId?: string) => HTMLElement} compactIconButton
 * @property {() => HTMLIFrameElement[]} currentFrames
 * @property {(iframe: HTMLIFrameElement) => any} frameApp
 * @property {(blocked: boolean, namespace?: string) => void} setFramePointerBlockedForOverlay
 * @property {(source: any) => HTMLIFrameElement | null} findFrameForSummarySource
 * @property {(source: any) => boolean} [highlightFrameForSummarySource]
 * @property {(app: any) => string} inferAppName
 * @property {(href: string, declaredLogoUrl?: string) => string} effectiveFaviconUrl
 * @property {(href: string) => Promise<string>} discoverDeclaredFaviconUrl
 * @property {(href: string, logoUrl: string) => void} rememberFaviconUrl
 * @property {(href: string) => string} browserFaviconUrl
 * @property {(action: string, shortcut: any, digitLabel?: string) => string} [formatShortcut]
 * @property {{ save: () => Promise<void>, entries: () => any[] }} [pocketPort]
 */

/**
 * Summary owns its panel lifecycle, collection pipeline, preview rendering, and ask/summarize flow.
 * The workspace is accessed only through explicit frame helpers so UI redraws do not recreate iframes.
 * @param {SummaryControllerContext} ctx
 */
export function createSummaryController(ctx) {
  const controllerName = "Summary controller";
  const state = requireControllerContext(ctx, controllerName, "state");
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const compactIconButton = requireControllerFunction(ctx, controllerName, "compactIconButton");
  const currentFrames = requireControllerFunction(ctx, controllerName, "currentFrames");
  const frameApp = requireControllerFunction(ctx, controllerName, "frameApp");
  const setFramePointerBlockedForOverlay = requireControllerFunction(ctx, controllerName, "setFramePointerBlockedForOverlay");
  const findFrameForSummarySource = requireControllerFunction(ctx, controllerName, "findFrameForSummarySource");
  const highlightFrameForSummarySource = optionalControllerFunction(ctx, "highlightFrameForSummarySource", () => false);
  const inferAppName = requireControllerFunction(ctx, controllerName, "inferAppName");
  const effectiveFaviconUrl = requireControllerFunction(ctx, controllerName, "effectiveFaviconUrl");
  const discoverDeclaredFaviconUrl = requireControllerFunction(ctx, controllerName, "discoverDeclaredFaviconUrl");
  const rememberFaviconUrl = requireControllerFunction(ctx, controllerName, "rememberFaviconUrl");
  const browserFaviconUrl = requireControllerFunction(ctx, controllerName, "browserFaviconUrl");
  const formatShortcutLabel = typeof ctx.formatShortcut === "function" ? ctx.formatShortcut : null;
  const pocketPort = optionalControllerObject(ctx, "pocketPort");
  const saveSummaryPreviewToPocket = typeof pocketPort.save === "function" ? pocketPort.save : async () => {};
  const pocketEntriesFromSummaryPreview = typeof pocketPort.entries === "function" ? pocketPort.entries : () => [];
  let summaryCollectionQueue = Promise.resolve();

  function syncSummaryPanel() {
    const currentPanel = document.querySelector(".summary-panel");
    if (currentPanel && state.summaryOpen) captureSummaryPanelGeometry(currentPanel);
    currentPanel?.remove();
    if (state.summaryOpen) document.body.append(renderSummaryPanel());
  }

  function openSummaryPanel() {
    state.summaryOpen = true;
    syncSummaryPanel();
    collectSummary();
  }

  function summarySourceKey(source) {
    return summarySourceKeyModel(source);
  }
  
  function summarySourceOrder(source) {
    return summarySourceOrderModel(source);
  }
  
  function compareSummarySourceItems(a, b) {
    return compareSummarySourceItemsModel(a, b);
  }
  
  function summaryLogoUrl(href) {
    return effectiveFaviconUrl(href);
  }

  function summaryTabFaviconUrl(instanceId) {
    if (!instanceId) return "";
    for (const image of document.querySelectorAll(".tab[data-instance-id] .tab-favicon")) {
      const tab = image.closest(".tab[data-instance-id]");
      if (tab?.dataset?.instanceId !== instanceId || image.hidden) continue;
      return image.currentSrc || image.src || "";
    }
    return "";
  }

  function summaryFrameLogoUrl(instanceId, href, declaredLogoUrl = "") {
    return summaryTabFaviconUrl(instanceId) || effectiveFaviconUrl(href, declaredLogoUrl) || declaredLogoUrl || "";
  }
  
  function summaryKeySet(name) {
    return new Set(state[name] || []);
  }
  
  function setSummaryKey(name, key, enabled) {
    if (!key) return;
    const set = summaryKeySet(name);
    if (enabled) set.add(key);
    else set.delete(key);
    state[name] = Array.from(set);
  }
  
  function toggleSummaryExpanded(key) {
    const set = summaryKeySet("summaryExpandedKeys");
    if (set.has(key)) set.delete(key);
    else set.add(key);
    state.summaryExpandedKeys = Array.from(set);
    syncSummaryPanel();
  }
  
  function summarySourceId(source = {}) {
    return summarySourceIdModel(source);
  }
  
  function summarySourceMeta(source = {}) {
    return summarySourceMetaModel(source, { effectiveFaviconUrl });
  }

  function googleFaviconUrl(href) {
    try {
      const pageUrl = new URL(String(href || ""), location.href);
      if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") return "";
      const iconUrl = new URL("https://www.google.com/s2/favicons");
      iconUrl.searchParams.set("domain", pageUrl.hostname);
      iconUrl.searchParams.set("sz", "64");
      return iconUrl.href;
    } catch {
      return "";
    }
  }
  
  function renderSummarySourceIcon(meta) {
    const icon = el("div", {
      class: `summary-source-icon summary-preview-source-logo summary-source-icon-${meta.id}`,
      title: `${meta.brand} icon`,
      "aria-label": `${meta.brand} icon`
    });
    const initialLogoUrl = meta.logoUrl || browserFaviconUrl(meta.href) || googleFaviconUrl(meta.href);
    if (initialLogoUrl) {
      icon.append(el("img", {
        class: "summary-source-favicon",
        src: initialLogoUrl,
        alt: "",
        loading: "lazy",
        decoding: "async",
        referrerpolicy: "no-referrer",
        onerror: (event) => {
          const image = event.currentTarget;
          if (image.dataset.browserFallback !== "1") {
            const browserUrl = browserFaviconUrl(meta.href || meta.logoUrl);
            image.dataset.browserFallback = "1";
            if (browserUrl && image.src !== browserUrl) {
              image.src = browserUrl;
              return;
            }
          }
          if (image.dataset.googleFallback !== "1") {
            const googleUrl = googleFaviconUrl(meta.href || meta.logoUrl);
            image.dataset.googleFallback = "1";
            if (googleUrl && image.src !== googleUrl) {
              image.src = googleUrl;
              return;
            }
          }
          image.hidden = true;
        }
      }));
    }
    return icon;
  }
  
  function renderSummaryStatus(title, detail, busy = false, steps = [], activeIndex = 0) {
    return el("div", { class: `summary-status-card ${busy ? "summary-status-card-loading" : ""}` },
      busy ? el("div", { class: "summary-spinner", "aria-hidden": "true" }) : null,
      el("div", { class: "summary-status-copy" },
        el("strong", {}, title),
        detail ? el("span", {}, detail) : null
      ),
      steps?.length ? el("div", { class: "summary-status-steps" },
        steps.map((step, index) => el("div", {
          class: `summary-status-step ${index < activeIndex ? "done" : index === activeIndex ? "active" : "waiting"}`
        },
          el("span", { class: "summary-status-step-dot", "aria-hidden": "true" }),
          el("span", {}, step)
        ))
      ) : null
    );
  }
  
  function summaryPreviewStatus(rawStatus) {
    return summaryPreviewStatusModel(rawStatus);
  }
  
  function summaryPreviewStatusLabel(status) {
    const normalized = summaryPreviewStatus(status);
    if (normalized === "failed") return t("common.failed");
    if (normalized === "skipped") return t("common.skipped");
    return "";
  }
  
  function summaryPreviewPage(item = {}) {
    return summaryPreviewPageModel(item);
  }
  
  function summaryPreviewIndex(source = {}, fallback = {}) {
    return summaryPreviewIndexModel(source, fallback);
  }
  
  function summaryPreviewKey(source = {}, fallback = {}) {
    return summaryPreviewKeyModel(source, fallback);
  }
  
  function summaryPreviewItemFromResult(result = {}, fallback = {}) {
    return buildSummaryPreviewItem(result, fallback, { t, effectiveFaviconUrl });
  }
  
  function summaryContextsFromPreviewItems(items = state.summaryPreviewItems) {
    return summaryContextsFromPreviewItemsModel(items);
  }
  
  function syncSummaryPreviewDerivedState() {
    state.summaryContexts = summaryContextsFromPreviewItems();
    state.summaryDiagnostics = (state.summaryPreviewItems || [])
      .filter((item) => item.status !== "ok")
      .map((item) => ({
        ...item,
        message: item.reason,
        pageTitle: item.title
      }));
  }
  
  function renderSummaryMessages(page) {
    if (!page) return null;
    const messages = page.messages || [];
    if (!messages.length) return null;
    return el("div", { class: "summary-preview-messages" },
      messages.map((message) => el("div", { class: `summary-preview-message summary-preview-message-${message.role || "page"}` },
        el("span", { class: "summary-preview-role" }, message.role === "assistant" ? t("common.assistant") : message.role === "user" ? t("common.user") : t("summaryPanel.pageText")),
        el("div", { class: "summary-preview-text summary-preview-text-markdown" }, renderMarkdown(message.text || ""))
      ))
    );
  }
  
  function renderSummaryExpandedDetail(item) {
    if (item.status === "ok") {
      return el("div", { class: "summary-preview-page-body" },
        renderSummaryMessages(item.page)
      );
    }
    const label = summaryPreviewStatusLabel(item.status);
    return el("div", { class: "summary-preview-page-body" },
      el("div", { class: "summary-preview-message summary-preview-message-status" },
        el("div", { class: "summary-preview-role" }, label),
        el("div", { class: "summary-preview-text summary-preview-status-text" }, item.reason || (item.status === "failed" ? t("summaryPanel.collectionFailed") : t("summaryPanel.pageSkipped")))
      )
    );
  }
  
  function renderSummarySourceCard(item) {
    const key = summarySourceKey(item);
    const page = summaryPreviewPage(item);
    const meta = summarySourceMeta(page);
    const status = summaryPreviewStatus(item.status);
    const statusLabel = summaryPreviewStatusLabel(status);
    const expanded = summaryKeySet("summaryExpandedKeys").has(key);
    const refreshing = summaryKeySet("summaryPreviewRefreshingKeys").has(key);
    const retryButton = compactIconButton(refreshing ? t("summaryPanel.refreshing") : t("summaryPanel.refreshMessages"), "reload", (event) => {
      event.stopPropagation();
      collectSummarySource(item);
    }, `summary-retry-button ${refreshing ? "summary-retry-button-loading" : ""}`, refreshing ? t("summaryPanel.refreshing") : t("summaryPanel.refreshMessages"), "", "summary.source.refresh");
    retryButton.disabled = state.summaryBusy || refreshing;
    retryButton.addEventListener("pointerdown", (event) => event.stopPropagation());
    retryButton.addEventListener("keydown", (event) => event.stopPropagation());
    const href = page.href || item.href || "";
    const showBody = expanded || status !== "ok";
    return el("article", { class: `summary-preview-page summary-preview-page-${status} summary-preview-status-${status} ${expanded ? "summary-preview-page-expanded" : "summary-preview-page-collapsed"}` },
      el("header", {
        class: "summary-preview-page-header",
        role: "button",
        tabindex: "0",
        "aria-expanded": expanded ? "true" : "false",
        title: expanded ? t("summaryPanel.collapsePreview") : t("summaryPanel.expandPreview"),
        onclick: () => toggleSummaryExpanded(key),
        onkeydown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleSummaryExpanded(key);
          }
        }
      },
        el("div", { class: "summary-preview-header-row" },
          el("div", { class: "summary-preview-title" },
            renderSummarySourceIcon(meta),
            el("span", { class: "summary-preview-source-name" }, meta.brand),
            el("span", { class: "summary-preview-separator", "aria-hidden": "true" }),
            el("span", { class: "summary-preview-page-title" }, meta.title),
            status !== "ok" ? el("span", { class: `summary-preview-status-badge summary-preview-status-${status}` }, statusLabel) : null
          ),
          retryButton
        ),
        href ? el("a", {
          class: "summary-preview-url",
          href,
          target: "_blank",
          rel: "noopener noreferrer",
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            highlightFrameForSummarySource(item);
          }
        }, href) : null
      ),
      showBody ? renderSummaryExpandedDetail(item) : null
    );
  }
  
  function renderSummaryPreview() {
    const items = state.summaryPreviewItems || [];
    const content = [];
    if (state.summaryBusy) {
      content.push(renderSummaryStatus(
        t("summaryPanel.collectingTitle"),
        t("summaryPanel.collectingBody"),
        true,
        [t("summaryPanel.findPages"), t("summaryPanel.readMessages"), t("summaryPanel.buildPreview")],
        1
      ));
    }
    if (state.summaryError) {
      content.push(el("div", { class: "summary-panel-notice summary-panel-notice-error" }, state.summaryError));
    } else if (state.summaryNotice) {
      content.push(el("div", { class: "summary-panel-notice" }, state.summaryNotice));
    }
    if (!state.summaryError && !state.summaryNotice && !state.summaryBusy && !items.length) {
      content.push(renderSummaryStatus(t("summaryPanel.readyTitle"), t("summaryPanel.readyBody")));
    }
    content.push(...items.map(renderSummarySourceCard));
    return el("div", { class: "summary-panel-preview" }, content);
  }
  
  function renderSummaryResult() {
    if (state.summaryBusy && state.summaryView === "summary") {
      return el("div", { class: "summary-panel-result" },
        renderSummaryStatus(state.summaryStatus || t("summaryPanel.generatingTitle"), t("summaryPanel.generatingBody"), true)
      );
    }
    if (!state.summaryResult) {
      return el("div", { class: "summary-panel-result" },
        renderSummaryStatus(t("summaryPanel.noSummaryTitle"), t("summaryPanel.noSummaryBody"))
      );
    }
    return el("article", { class: "summary-panel-result" },
      renderMarkdown(state.summaryResult)
    );
  }
  
  function renderSummaryTabs() {
    const setView = (view) => {
      state.summaryView = view;
      syncSummaryPanel();
    };
    return el("div", { class: "summary-panel-tabs", role: "tablist", "aria-label": t("summaryPanel.views") },
      el("button", {
        class: `summary-panel-tab ${state.summaryView === "preview" ? "active" : ""}`,
        role: "tab",
        "aria-selected": state.summaryView === "preview" ? "true" : "false",
        onclick: () => setView("preview")
      }, t("summaryPanel.preview")),
      el("button", {
        class: `summary-panel-tab ${state.summaryView === "summary" ? "active" : ""}`,
        role: "tab",
        "aria-selected": state.summaryView === "summary" ? "true" : "false",
        onclick: () => setView("summary")
      }, t("summaryPanel.summaryTab"))
    );
  }
  
  function summaryActionButton(label, onClick, variant = "secondary", disabled = false, iconName = "", tooltipId = "") {
    const action = createActionButton({
      label,
      icon: iconName ? svgIcon(iconName) : null,
      onClick,
      variant,
      className: `summary-action-button ${iconName ? `summary-action-button-${iconName}` : ""}`.trim(),
      tooltipId
    });
    action.disabled = disabled;
    return action;
  }
  
  function summaryFullscreenLabel() {
    const baseLabel = state.summaryMaximized ? t("summaryPanel.restore") : t("summaryPanel.maximize");
    const shortcut = formatShortcutLabel?.("enterFullscreen", state.shortcutConfig?.shortcuts?.enterFullscreen);
    if (!shortcut || shortcut === "Disabled" || shortcut === "Unassigned") return baseLabel;
    return `${baseLabel} (${shortcut})`;
  }
  
  function toggleSummaryMaximized() {
    state.summaryMaximized = !state.summaryMaximized;
    syncSummaryPanel();
  }
  
  function normalizeSummaryPanelSize(value) {
    return normalizeSummaryPanelSizeModel(value);
  }
  
  function readLegacySummaryPanelSize() {
    try {
      const value = JSON.parse(localStorage.getItem(SUMMARY_PANEL_SIZE_KEY) || "null");
      return normalizeSummaryPanelSize(value);
    } catch {}
    return null;
  }
  
  async function loadSummaryPanelSize() {
    const stored = normalizeSummaryPanelSize(await storageGet(SUMMARY_PANEL_SIZE_KEY));
    const legacy = stored || readLegacySummaryPanelSize();
    if (legacy && !stored) storageSet(SUMMARY_PANEL_SIZE_KEY, legacy).catch(() => {});
    return legacy;
  }
  
  function persistSummaryPanelSize(size) {
    const normalized = normalizeSummaryPanelSize(size);
    if (!normalized) return;
    state.summarySize = normalized;
    try { localStorage.setItem(SUMMARY_PANEL_SIZE_KEY, JSON.stringify(normalized)); } catch {}
    storageSet(SUMMARY_PANEL_SIZE_KEY, normalized).catch(() => {});
  }
  
  function captureSummaryPanelGeometry(panel = document.querySelector(".summary-panel")) {
    if (!panel || panel.classList.contains("summary-panel-maximized") || panel.classList.contains("maximized")) return;
    const rect = panel.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return;
    state.summarySize = normalizeSummaryPanelSize({
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      top: Math.round(rect.top)
    });
  }
  
  function rememberSummaryPanelGeometry(panel = document.querySelector(".summary-panel")) {
    captureSummaryPanelGeometry(panel);
    if (state.summarySize) persistSummaryPanelSize(state.summarySize);
  }
  
  function summaryPanelMaxWidth() {
    return Math.max(SUMMARY_PANEL_MIN_WIDTH, window.innerWidth - 32);
  }
  
  function summaryPanelMaxHeight() {
    return Math.max(SUMMARY_PANEL_MIN_HEIGHT, window.innerHeight - 32);
  }
  
  function summaryPanelSizeStyle() {
    if (state.summaryMaximized) return {};
    const size = state.summarySize || readLegacySummaryPanelSize();
    if (!size) return {};
    state.summarySize = size;
    const width = Math.min(Math.max(SUMMARY_PANEL_MIN_WIDTH, size.width), summaryPanelMaxWidth());
    const height = Math.min(Math.max(SUMMARY_PANEL_MIN_HEIGHT, size.height), summaryPanelMaxHeight());
    const style = {
      width: "var(--summary-panel-width)",
      height: "var(--summary-panel-height)",
      "--summary-panel-width": `${width}px`,
      "--summary-panel-height": `${height}px`
    };
    if (Number.isFinite(size.left) && Number.isFinite(size.top)) {
      style.left = `${Math.min(Math.max(8, size.left), Math.max(8, window.innerWidth - width - 8))}px`;
      style.top = `${Math.min(Math.max(8, size.top), Math.max(8, window.innerHeight - height - 8))}px`;
      style.transform = "none";
    }
    return style;
  }
  
  function renderSummaryPanel() {
    const hasQuestion = Boolean(state.summaryQuestion.trim());
    const runFromInput = async () => {
      if (state.summaryQuestion.trim()) await askSummary();
      else await summarizeSummary();
    };
    const panel = el("section", {
      class: `summary-panel ${state.summaryMaximized ? "summary-panel-maximized maximized" : ""}`,
      style: summaryPanelSizeStyle()
    },
      el("div", { class: "summary-panel-surface" },
        el("header", { class: "summary-panel-header" },
          el("div", { class: "summary-panel-title" },
            svgIcon("summary"),
            el("strong", {}, t("summaryPanel.title"))
          ),
          el("div", { class: "summary-panel-window-actions" },
            iconButton(summaryFullscreenLabel(), svgIcon(state.summaryMaximized ? "minimize" : "maximize"), toggleSummaryMaximized, "summary-window-button", summaryFullscreenLabel(), "", "summary.window.fullscreen"),
            iconButton(t("common.close"), svgIcon("x"), () => {
              state.summaryOpen = false;
              syncSummaryPanel();
            }, "summary-window-button", t("common.close"), "", "summary.window.close")
          )
        ),
        el("div", { class: "summary-panel-query" },
          textarea(state.summaryQuestion, {
            class: "textarea summary-panel-input",
            disabled: state.summaryBusy,
            placeholder: t("summaryPanel.placeholder"),
            oninput: (event) => { state.summaryQuestion = event.target.value; },
            oncompositionstart: () => { state.summaryComposing = true; },
            oncompositionend: () => { state.summaryComposing = false; },
            onkeydown: (event) => {
              if (state.summaryComposing || event.isComposing) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                runFromInput();
              }
            }
          }),
          el("div", { class: "summary-panel-actions" },
            summaryActionButton(t("summaryPanel.pocket"), saveSummaryPreviewToPocket, "secondary", state.summaryBusy || !pocketEntriesFromSummaryPreview().length, "pocket", "summary.action.pocket"),
            summaryActionButton(t("summaryPanel.preview"), collectSummary, "secondary", state.summaryBusy, "preview", "summary.action.preview"),
            summaryActionButton(t("summaryPanel.summarize"), summarizeSummary, "secondary", state.summaryBusy, "summary", "summary.action.summarize"),
            summaryActionButton(t("summaryPanel.ask"), askSummary, "primary", state.summaryBusy || !hasQuestion, "send", "summary.action.ask")
          )
        ),
        renderSummaryTabs(),
        el("main", { class: "summary-panel-content" },
          state.summaryView === "summary" ? renderSummaryResult() : renderSummaryPreview()
        )
      ),
      !state.summaryMaximized ? el("div", { class: "summary-panel-resize-handle summary-panel-resize-handle-left", dataset: { direction: "left" }, "aria-hidden": "true" }) : null,
      !state.summaryMaximized ? el("div", { class: "summary-panel-resize-handle summary-panel-resize-handle-right", dataset: { direction: "right" }, "aria-hidden": "true" }) : null,
      !state.summaryMaximized ? el("div", { class: "summary-panel-resize-handle summary-panel-resize-handle-bottom", dataset: { direction: "bottom" }, "aria-hidden": "true" }) : null
    );
    makeDraggable(panel, ".summary-panel-header");
    makeSummaryResizable(panel);
    return panel;
  }
  
  async function summarizeSummary() {
    state.summaryQuestion = "";
    state.summaryView = "summary";
    await askSummary();
  }
  
  function setIframePointerBlocked(blocked) {
    setFramePointerBlockedForOverlay(blocked, "summary");
  }
  
  function makeDraggable(panel, handleSelector) {
    const handle = panel.querySelector(handleSelector);
    let drag = null;
    const finishDrag = () => {
      if (!drag) return;
      rememberSummaryPanelGeometry(panel);
      setIframePointerBlocked(false);
      drag = null;
    };
    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.width = `${rect.width}px`;
      panel.style.height = `${rect.height}px`;
      panel.style.transform = "none";
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      setIframePointerBlocked(true);
      panel.setPointerCapture?.(event.pointerId);
    });
    panel.addEventListener("pointermove", (event) => {
      if (!drag || state.summaryMaximized) return;
      const rect = panel.getBoundingClientRect();
      const nextLeft = Math.min(Math.max(8, drag.left + event.clientX - drag.x), Math.max(8, window.innerWidth - rect.width - 8));
      const nextTop = Math.min(Math.max(8, drag.top + event.clientY - drag.y), Math.max(8, window.innerHeight - rect.height - 8));
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      panel.style.transform = "none";
      captureSummaryPanelGeometry(panel);
    });
    panel.addEventListener("pointerup", finishDrag);
    panel.addEventListener("pointercancel", finishDrag);
  }
  
  function makeSummaryResizable(panel) {
    let resize = null;
    const handles = panel.querySelectorAll(".summary-panel-resize-handle");
    for (const handle of handles) {
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = panel.getBoundingClientRect();
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.width = `${rect.width}px`;
        panel.style.height = `${rect.height}px`;
        panel.style.transform = "none";
        resize = {
          direction: handle.dataset.direction,
          x: event.clientX,
          y: event.clientY,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        };
        panel.classList.add("summary-panel-resizing");
        setIframePointerBlocked(true);
        handle.setPointerCapture?.(event.pointerId);
      });
    }
    const finishResize = () => {
      if (!resize) return;
      rememberSummaryPanelGeometry(panel);
      panel.classList.remove("summary-panel-resizing");
      setIframePointerBlocked(false);
      resize = null;
    };
    panel.addEventListener("pointermove", (event) => {
      if (!resize || state.summaryMaximized) return;
      const minWidth = SUMMARY_PANEL_MIN_WIDTH;
      const minHeight = SUMMARY_PANEL_MIN_HEIGHT;
      const maxWidth = summaryPanelMaxWidth();
      const maxHeight = summaryPanelMaxHeight();
      const dx = event.clientX - resize.x;
      const dy = event.clientY - resize.y;
      if (resize.direction === "left") {
        const width = Math.min(maxWidth, Math.max(minWidth, resize.width - dx));
        const left = Math.max(8, resize.left + (resize.width - width));
        panel.style.left = `${left}px`;
        panel.style.width = `${width}px`;
      } else if (resize.direction === "right") {
        panel.style.width = `${Math.min(maxWidth, Math.max(minWidth, resize.width + dx))}px`;
      } else if (resize.direction === "bottom") {
        panel.style.height = `${Math.min(maxHeight, Math.max(minHeight, resize.height + dy))}px`;
      }
      captureSummaryPanelGeometry(panel);
    });
    panel.addEventListener("pointerup", finishResize);
    panel.addEventListener("pointercancel", finishResize);
  }
  
  function summaryBlankPageReason(siteConfig, href) {
    let url;
    try { url = new URL(href); } catch { return ""; }
    const host = url.hostname.toLowerCase();
    const path = (url.pathname || "/").replace(/\/+$/, "") || "/";
    const noSearchOrHash = !url.search && !url.hash;
    if (siteConfig?.id === "chatgpt" && (host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com" || host.endsWith(".chat.openai.com")) && path === "/" && noSearchOrHash) {
      return t("summaryPanel.blankChat", { name: "ChatGPT" });
    }
    if (siteConfig?.id === "kagi" && host === "assistant.kagi.com" && path === "/" && noSearchOrHash) {
      return t("summaryPanel.blankChat", { name: "Kagi Assistant" });
    }
    if (siteConfig?.id === "deepseek" && (host === "chat.deepseek.com" || host === "deepseek.com" || host.endsWith(".deepseek.com")) && path === "/" && noSearchOrHash) {
      return t("summaryPanel.blankChat", { name: "DeepSeek" });
    }
    if ((siteConfig?.id === "grok" || siteConfig?.id === "grok-dairoot") && (host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai") || host === "gk.dairoot.cn" || host.endsWith(".gk.dairoot.cn")) && path === "/" && noSearchOrHash) {
      return t("summaryPanel.blankChat", { name: "Grok" });
    }
    if (siteConfig?.id === "lobehub" && (host === "app.lobehub.com" || host.endsWith(".lobehub.com")) && path === "/" && noSearchOrHash) {
      return t("summaryPanel.blankChat", { name: "LobeHub" });
    }
    if (siteConfig?.id === "notion" && (host === "app.notion.com" || host === "notion.so" || host === "www.notion.so" || host.endsWith(".notion.so")) && (path === "/ai" || (path === "/chat" && !url.searchParams.get("t")))) {
      return t("summaryPanel.startPageNoConversation", { name: "Notion AI" });
    }
    if (siteConfig?.id === "claude" && (host === "claude.ai" || host.endsWith(".claude.ai")) && path === "/new" && noSearchOrHash) {
      return t("summaryPanel.startPageNoConversation", { name: "Claude" });
    }
    return "";
  }
  
  async function summaryFrameMeta(iframe, app, order = 0) {
    const name = inferAppName(app);
    const instanceId = iframe.dataset.instanceId || "";
    let href = app.url;
    let pageTitle = "";
    let logoUrl = summaryFrameLogoUrl(instanceId, href);
    try {
      const meta = await sendToIframe(iframe, "getPageMeta", {}, 1800);
      href = meta?.href || href;
      pageTitle = meta?.title || "";
      logoUrl = summaryFrameLogoUrl(instanceId, href, meta?.logoUrl) || logoUrl;
    } catch {
      try { href = await sendToIframe(iframe, "getLocationHref", {}, 1200) || href; } catch {}
      logoUrl = summaryFrameLogoUrl(instanceId, href) || logoUrl;
    }
    const discoveredLogoUrl = await discoverDeclaredFaviconUrl(href);
    logoUrl = summaryTabFaviconUrl(instanceId) || discoveredLogoUrl || logoUrl || summaryLogoUrl(href);
    if (logoUrl) {
      rememberFaviconUrl(href, logoUrl);
      if (app.url && app.url !== href) rememberFaviconUrl(app.url, logoUrl);
    }
    return {
      key: instanceId || `${name}\n${href}`,
      instanceId,
      name,
      title: name,
      pageTitle: pageTitle || name,
      href,
      logoUrl,
      order
    };
  }
  
  async function collectFrameSummary(iframe, index = 0) {
    const app = frameApp(iframe);
    const base = await summaryFrameMeta(iframe, app, index);
    const diagnostic = (status, message, extra = {}) => ({
      ...base,
      ...extra,
      key: base.key,
      status,
      message
    });
  
    if (base.href.startsWith("chrome-error://")) {
      return { diagnostic: diagnostic("error", t("summaryPanel.browserError")) };
    }
    const siteConfig = findSummarySiteConfig(state.options.summarySiteConfigs, base.href);
    if (!siteConfig) {
      return { diagnostic: diagnostic("skipped", t("summaryPanel.noConfigMatched")) };
    }
    const siteFields = { siteId: siteConfig.id, siteName: siteConfig.name };
    const blankReason = summaryBlankPageReason(siteConfig, base.href);
    if (blankReason) {
      return { diagnostic: diagnostic("skipped", blankReason, siteFields) };
    }
  
    try {
      let messages = [];
      let result = null;
      if (siteConfig?.userscript) {
        result = await sendToIframe(iframe, "collectSummary", { config: siteConfig }, siteConfig.userscriptTimeoutMs || 36000);
        messages = result?.messages || result || [];
        if (!messages.length && result?.rawMessageCount) {
          return {
            diagnostic: diagnostic(
              "skipped",
              t("summaryPanel.rawNoTurns", { count: result.rawMessageCount }),
              siteFields
            )
          };
        }
      }
      if ((!messages || !messages.length) && siteConfig?.fallbackMode === "allowPageText") {
        const text = await sendToIframe(iframe, "getPageText", {}, 2500);
        if (text) messages = [{ role: "page", text }];
      }
      const href = result?.href || base.href;
      const contextBase = {
        ...base,
        href,
        pageTitle: result?.title || base.pageTitle,
        logoUrl: summaryFrameLogoUrl(base.instanceId, href, result?.logoUrl || base.logoUrl) || base.logoUrl,
        siteId: siteConfig.id,
        siteName: siteConfig.name
      };
      if (messages?.length) {
        const context = { ...contextBase, messages };
        return {
          context,
          diagnostic: {
            ...contextBase,
            key: base.key,
            status: "success",
            message: t("summaryPanel.collectedMessages", { count: messages.length, name: siteConfig.name || siteConfig.id })
          }
        };
      }
      return {
        diagnostic: diagnostic("skipped", t("summaryPanel.userscriptNoTurns", { name: siteConfig.name || siteConfig.id }), siteFields)
      };
    } catch (error) {
      return { diagnostic: diagnostic("error", error.message || t("summaryPanel.collectionFailed"), siteFields) };
    }
  }
  
  async function withSummaryCollectionLock(task) {
    const run = summaryCollectionQueue.then(task, task);
    summaryCollectionQueue = run.catch(() => {});
    return run;
  }
  
  async function collectSummary() {
    state.summaryOpen = true;
    state.summaryBusy = true;
    state.summaryStatus = t("summaryPanel.collectingTitle");
    state.summaryError = "";
    state.summaryNotice = "";
    state.summaryLoadingPhase = "read";
    state.summaryView = "preview";
    state.summaryPreviewItems = [];
    state.summaryContexts = [];
    state.summaryDiagnostics = [];
    state.summaryExpandedKeys = [];
    state.summaryPreviewRefreshingKeys = [];
    state.summaryResult = "";
    syncSummaryPanel();
    try {
      const frames = currentFrames();
      if (!frames.length) throw new Error(t("summaryPanel.noIframe"));
      const results = await Promise.all(frames.map((iframe, index) =>
        withSummaryCollectionLock(() => collectFrameSummary(iframe, index))
      ));
      state.summaryLoadingPhase = "build";
      state.summaryPreviewItems = results.map((result, index) => summaryPreviewItemFromResult(result, { index, order: index }));
      syncSummaryPreviewDerivedState();
      state.summaryStatus = state.summaryContexts.length ? t("summaryPanel.collectedConversations", { count: state.summaryContexts.length }) : t("summaryPanel.noStructuredContext");
    } catch (error) {
      state.summaryError = error.message || t("summaryPanel.previewFailed");
      state.summaryStatus = t("summaryPanel.previewFailed");
    } finally {
      state.summaryBusy = false;
      state.summaryLoadingPhase = "";
      syncSummaryPreviewDerivedState();
      syncSummaryPanel();
    }
  }
  
  async function collectSummarySource(item) {
    const key = summarySourceKey(item);
    const iframe = findFrameForSummarySource(item);
    if (!iframe) {
      state.summaryPreviewItems = state.summaryPreviewItems.map((entry) => summarySourceKey(entry) === key
        ? { ...entry, status: "failed", reason: t("summaryPanel.iframeMissing"), page: undefined }
        : entry);
      syncSummaryPreviewDerivedState();
      syncSummaryPanel();
      return;
    }
    setSummaryKey("summaryPreviewRefreshingKeys", key, true);
    state.summaryError = "";
    state.summaryNotice = "";
    syncSummaryPanel();
    try {
      const frameIndex = currentFrames().indexOf(iframe);
      const result = await withSummaryCollectionLock(() => collectFrameSummary(iframe, frameIndex >= 0 ? frameIndex : summarySourceOrder(item)));
      const nextItem = summaryPreviewItemFromResult(result, item);
      state.summaryPreviewItems = state.summaryPreviewItems.map((entry) => summarySourceKey(entry) === key ? nextItem : entry);
      syncSummaryPreviewDerivedState();
    } catch (error) {
      state.summaryPreviewItems = state.summaryPreviewItems.map((entry) => summarySourceKey(entry) === key
        ? { ...entry, status: "failed", reason: error.message || t("summaryPanel.refreshFailed"), page: undefined }
        : entry);
      syncSummaryPreviewDerivedState();
    } finally {
      setSummaryKey("summaryPreviewRefreshingKeys", key, false);
      state.summaryStatus = state.summaryContexts.length ? t("summaryPanel.collectedConversations", { count: state.summaryContexts.length }) : t("summaryPanel.noStructuredContext");
      syncSummaryPanel();
    }
  }
  
  async function askSummary() {
    state.summaryView = "summary";
    syncSummaryPreviewDerivedState();
    if (!state.summaryContexts.length) await collectSummary();
    if (!state.summaryContexts.length) {
      state.summaryView = "preview";
      state.summaryNotice = state.summaryError ? "" : t("summaryPanel.noMessages");
      syncSummaryPanel();
      return;
    }
    state.summaryView = "summary";
    state.summaryBusy = true;
    state.summaryStatus = t("summaryPanel.generatingTitle");
    syncSummaryPanel();
    try {
      state.summaryResult = await summarizeContexts(state.options, state.summaryContexts, state.summaryQuestion);
    } catch (error) {
      state.summaryResult = error.message || t("summaryPanel.summaryFailed");
    } finally {
      state.summaryBusy = false;
      state.summaryStatus = "";
      syncSummaryPanel();
    }
  }
  

  return {
    sync: syncSummaryPanel,
    open: openSummaryPanel,
    render: renderSummaryPanel,
    collect: collectSummary,
    collectSource: collectSummarySource,
    ask: askSummary,
    summarize: summarizeSummary,
    toggleMaximized: toggleSummaryMaximized,
    loadPanelSize: loadSummaryPanelSize,
    summarySourceKey,
    summarySourceOrder,
    compareSummarySourceItems,
    summaryPreviewStatus,
    summaryPreviewPage,
    summarySourceMeta,
    summaryContextsFromPreviewItems,
    pocketEntriesFromSummaryPreview
  };
}
