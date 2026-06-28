import { t } from "../../shared/i18n.js";
import { normalizePocketCardSize } from "../../shared/storage.js";
import { clear, el, modal, toast } from "../../ui/dom.js";
import { requireControllerContext, requireControllerFunction } from "../controller-context.js";
import { renderMarkdown } from "../summary/markdown.js";
import {
  summaryPreviewPage,
  summaryPreviewStatus,
  summarySourceMeta
} from "../summary/model.js";

const POCKET_PANEL_SIZE_KEY = "chatclub.pocketPanelSize.v1";
const POCKET_PANEL_MIN_WIDTH = 720;
const POCKET_PANEL_MIN_HEIGHT = 420;
const POCKET_PANEL_FULLSCREEN_CLASS = "pocket-history-modal-fullscreen";

export function createPocketController(ctx) {
  const controllerName = "Pocket controller";
  const state = requireControllerContext(ctx, controllerName, "state");
  const createId = requireControllerFunction(ctx, controllerName, "createId");
  const loadPocketHistory = requireControllerFunction(ctx, controllerName, "loadPocketHistory");
  const savePocketHistory = requireControllerFunction(ctx, controllerName, "savePocketHistory");
  const saveOptions = requireControllerFunction(ctx, controllerName, "saveOptions");
  const openableTabUrl = requireControllerFunction(ctx, controllerName, "openableTabUrl");
  const loadPocketEntryInFrame = requireControllerFunction(ctx, controllerName, "loadPocketEntryInFrame");
  const restorePocketBatch = requireControllerFunction(ctx, controllerName, "restorePocketBatch");
  const setFramePointerBlockedForOverlay = requireControllerFunction(ctx, controllerName, "setFramePointerBlockedForOverlay");
  const effectiveFaviconUrl = requireControllerFunction(ctx, controllerName, "effectiveFaviconUrl");
  const compactIconButton = requireControllerFunction(ctx, controllerName, "compactIconButton");
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  let pocketCardSizeSaveTimer = 0;

  const POCKET_CARD_SIZE_LIMITS = Object.freeze({
    width: Object.freeze({ min: 360, max: 760, step: 20 }),
    height: Object.freeze({ min: 420, max: 820, step: 20 })
  });

  function normalizePocketMessage(message = {}) {
    const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : "";
    const text = String(message.text || message.content || "").trim();
    return role && text ? { role, text } : null;
  }

  function workspacePocketMetaByInstanceId() {
    const meta = new Map();
    (state.groups || []).forEach((group, groupIndex) => {
      (group.chatApps || []).forEach((chat, tabIndex) => {
        if (!chat?.instanceId) return;
        meta.set(chat.instanceId, {
          groupId: group.id || "",
          instanceId: chat.instanceId,
          appId: chat.appId || "",
          groupIndex,
          tabIndex
        });
      });
    });
    return meta;
  }

  function pocketNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function pocketSourceContext(page = {}, batch = {}, workspaceMeta = new Map(), order = 0) {
    const instanceId = String(page.instanceId || "");
    const workspace = workspaceMeta.get(instanceId) || {};
    const appId = workspace.appId || page.appId || "";
    const chatUrl = openableTabUrl(page.href || page.url || "");
    const sourceId = page.key || instanceId || [appId || page.siteName || page.name, chatUrl].filter(Boolean).join("\n");
    return {
      batchId: batch.batchId || createId("pocket-batch"),
      batchCreatedAt: batch.batchCreatedAt || new Date().toISOString(),
      sourceId,
      groupId: workspace.groupId || page.groupId || "",
      instanceId,
      appId,
      groupIndex: pocketNumber(workspace.groupIndex, order),
      tabIndex: pocketNumber(workspace.tabIndex, 0)
    };
  }

  function pocketEntriesFromMessages(messages = [], page = {}, meta = {}, context = {}) {
    const chatUrl = openableTabUrl(page.href || page.url || "");
    if (!chatUrl) return [];
    const title = meta.title || page.title || page.pageTitle || chatUrl;
    const appName = meta.brand || page.siteName || page.name || "";
    const logoUrl = meta.logoUrl || effectiveFaviconUrl(chatUrl, page.logoUrl || "");
    const batchId = context.batchId || createId("pocket-batch");
    const batchCreatedAt = context.batchCreatedAt || new Date().toISOString();
    const createdAt = batchCreatedAt;
    const entries = [];
    let userMessage = "";
    for (const rawMessage of messages || []) {
      const message = normalizePocketMessage(rawMessage);
      if (!message) continue;
      if (message.role === "user") {
        userMessage = message.text;
        continue;
      }
      if (message.role === "assistant" && userMessage) {
        entries.push({
          id: createId("pocket"),
          batchId,
          batchCreatedAt,
          sourceId: context.sourceId || context.instanceId || chatUrl,
          chatUrl,
          title,
          appName,
          logoUrl,
          appId: context.appId || "",
          groupId: context.groupId || "",
          instanceId: context.instanceId || "",
          groupIndex: pocketNumber(context.groupIndex, 0),
          tabIndex: pocketNumber(context.tabIndex, 0),
          userMessage,
          assistantMessage: message.text,
          createdAt
        });
        userMessage = "";
      }
    }
    return entries;
  }

  function pocketEntriesFromSummaryPreview(items = state.summaryPreviewItems) {
    const batch = { batchId: createId("pocket-batch"), batchCreatedAt: new Date().toISOString() };
    const workspaceMeta = workspacePocketMetaByInstanceId();
    return (items || []).flatMap((item, order) => {
      if (summaryPreviewStatus(item.status) !== "ok") return [];
      const page = summaryPreviewPage(item);
      const messages = Array.isArray(page.messages) ? page.messages : [];
      if (!messages.length) return [];
      const context = pocketSourceContext(page, batch, workspaceMeta, order);
      return pocketEntriesFromMessages(messages, page, summarySourceMeta(page, { effectiveFaviconUrl }), context);
    });
  }

  function dedupePocketEntries(entries) {
    const seen = new Set();
    return (entries || []).filter((entry) => {
      const key = [entry.batchId || "legacy", entry.chatUrl, entry.userMessage, entry.assistantMessage].join("\n");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 300);
  }

  async function saveSummaryPreviewToPocket() {
    const entries = pocketEntriesFromSummaryPreview();
    if (!entries.length) {
      toast(t("toast.noValidPocketContent"), "error");
      return;
    }
    const stored = await loadPocketHistory();
    state.pocketEntries = await savePocketHistory(dedupePocketEntries([...entries, ...stored]));
    toast(t("toast.pocketSaved", { count: entries.length, plural: entries.length === 1 ? "" : "s" }), "success");
  }

  function formatPocketTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function pocketCardSize() {
    return normalizePocketCardSize(state.options?.pocketCardSize);
  }

  function applyPocketCardSize(host, size = pocketCardSize()) {
    host?.style?.setProperty("--pocket-card-width", `${size.width}px`);
    host?.style?.setProperty("--pocket-card-height", `${size.height}px`);
    return size;
  }

  function schedulePocketCardSizeSave(size) {
    clearTimeout(pocketCardSizeSaveTimer);
    pocketCardSizeSaveTimer = setTimeout(async () => {
      try {
        state.options = await saveOptions({ ...state.options, pocketCardSize: size });
      } catch (error) {
        console.warn("[ChatClub] Failed to save Pocket card size", error);
      }
    }, 180);
  }

  async function savePocketCardSizeNow(size) {
    clearTimeout(pocketCardSizeSaveTimer);
    pocketCardSizeSaveTimer = 0;
    state.options = await saveOptions({ ...state.options, pocketCardSize: size });
  }

  function updatePocketCardSize(host, patch, options = {}) {
    const size = normalizePocketCardSize({ ...pocketCardSize(), ...patch });
    state.options = { ...state.options, pocketCardSize: size };
    applyPocketCardSize(host, size);
    if (options.immediate) {
      savePocketCardSizeNow(size).catch((error) => console.warn("[ChatClub] Failed to save Pocket card size", error));
    } else {
      schedulePocketCardSizeSave(size);
    }
    return size;
  }

  function pocketSizeControl(host, field, label, value) {
    const limit = POCKET_CARD_SIZE_LIMITS[field];
    const output = el("span", { class: "pocket-size-value" }, `${value}px`);
    const slider = el("input", {
      class: "pocket-size-slider",
      type: "range",
      min: limit.min,
      max: limit.max,
      step: limit.step,
      value,
      "aria-label": label,
      oninput: (event) => {
        const next = updatePocketCardSize(host, { [field]: event.currentTarget.value });
        output.textContent = `${next[field]}px`;
      },
      onchange: (event) => {
        const next = updatePocketCardSize(host, { [field]: event.currentTarget.value }, { immediate: true });
        output.textContent = `${next[field]}px`;
      }
    });
    return el("label", { class: "pocket-size-control" },
      el("span", { class: "pocket-size-label" }, label),
      slider,
      output
    );
  }

  function pocketSizeControls(host, size) {
    return el("div", { class: "pocket-size-controls" },
      pocketSizeControl(host, "width", t("pocket.cardWidth"), size.width),
      pocketSizeControl(host, "height", t("pocket.cardHeight"), size.height)
    );
  }

  function pocketPanelMaxWidth() {
    return Math.max(320, window.innerWidth - 32);
  }

  function pocketPanelMaxHeight() {
    return Math.max(280, window.innerHeight - 32);
  }

  function pocketPanelMinWidth() {
    return Math.min(POCKET_PANEL_MIN_WIDTH, pocketPanelMaxWidth());
  }

  function pocketPanelMinHeight() {
    return Math.min(POCKET_PANEL_MIN_HEIGHT, pocketPanelMaxHeight());
  }

  function clampPocketPanelWidth(value) {
    return Math.min(pocketPanelMaxWidth(), Math.max(pocketPanelMinWidth(), value));
  }

  function clampPocketPanelHeight(value) {
    return Math.min(pocketPanelMaxHeight(), Math.max(pocketPanelMinHeight(), value));
  }

  function normalizePocketPanelSize(value) {
    if (!value || typeof value !== "object") return null;
    const width = Number(value.width);
    const height = Number(value.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const normalizedWidth = Math.round(clampPocketPanelWidth(width));
    const normalizedHeight = Math.round(clampPocketPanelHeight(height));
    const normalized = {
      width: normalizedWidth,
      height: normalizedHeight
    };
    const left = Number(value.left);
    const top = Number(value.top);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      normalized.left = Math.round(Math.min(Math.max(8, left), Math.max(8, window.innerWidth - normalizedWidth - 8)));
      normalized.top = Math.round(Math.min(Math.max(8, top), Math.max(8, window.innerHeight - normalizedHeight - 8)));
    }
    return normalized;
  }

  function readPocketPanelSize() {
    try {
      return normalizePocketPanelSize(JSON.parse(localStorage.getItem(POCKET_PANEL_SIZE_KEY) || "null"));
    } catch {}
    return null;
  }

  function capturePocketPanelGeometry(panel) {
    if (!panel) return null;
    if (pocketPanelIsFullscreen(panel)) return null;
    const rect = panel.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return null;
    return normalizePocketPanelSize({
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    });
  }

  function rememberPocketPanelGeometry(panel) {
    const size = capturePocketPanelGeometry(panel);
    if (!size) return;
    try { localStorage.setItem(POCKET_PANEL_SIZE_KEY, JSON.stringify(size)); } catch {}
  }

  function applyPocketPanelSize(panel) {
    const size = readPocketPanelSize();
    if (!panel || !size) return;
    panel.style.setProperty("--pocket-panel-width", `${size.width}px`);
    panel.style.setProperty("--pocket-panel-height", `${size.height}px`);
    panel.style.width = "var(--pocket-panel-width)";
    panel.style.height = "var(--pocket-panel-height)";
    if (Number.isFinite(size.left) && Number.isFinite(size.top)) {
      panel.style.left = `${size.left}px`;
      panel.style.top = `${size.top}px`;
      panel.style.transform = "none";
    }
  }

  function pocketPanelIsFullscreen(panel) {
    return Boolean(panel?.classList?.contains(POCKET_PANEL_FULLSCREEN_CLASS));
  }

  function clearPocketPanelInlineGeometry(panel) {
    if (!panel) return;
    ["width", "height", "left", "top", "transform", "--pocket-panel-width", "--pocket-panel-height"].forEach((property) => {
      panel.style.removeProperty(property);
    });
  }

  function syncPocketFullscreenButton(button, panel) {
    if (!button || !panel) return;
    const fullscreen = pocketPanelIsFullscreen(panel);
    const label = fullscreen ? t("chat.exitFullscreen") : t("chat.fullscreen");
    button.setAttribute("aria-label", label);
    button.setAttribute("data-tooltip", label);
    button.replaceChildren(svgIcon(fullscreen ? "minimize" : "maximize"));
  }

  function togglePocketPanelFullscreen(panel, button) {
    if (!panel) return;
    if (pocketPanelIsFullscreen(panel)) {
      panel.classList.remove(POCKET_PANEL_FULLSCREEN_CLASS);
      applyPocketPanelSize(panel);
    } else {
      rememberPocketPanelGeometry(panel);
      panel.classList.add(POCKET_PANEL_FULLSCREEN_CLASS);
      clearPocketPanelInlineGeometry(panel);
    }
    syncPocketFullscreenButton(button, panel);
  }

  function toggleOpenPocketPanelFullscreen() {
    const panel = document.querySelector(".modal.pocket-history-modal");
    if (!panel) return false;
    const button = panel.querySelector('[data-tooltip-id="pocket.fullscreen"]');
    togglePocketPanelFullscreen(panel, button);
    return true;
  }

  function pocketFullscreenButton(panel) {
    const button = el("button", {
      class: "icon-button tooltip-trigger pocket-window-button",
      type: "button",
      "aria-label": t("chat.fullscreen"),
      "data-tooltip": t("chat.fullscreen"),
      "data-tooltip-id": "pocket.fullscreen",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        togglePocketPanelFullscreen(panel, button);
      }
    }, svgIcon("maximize"));
    return button;
  }

  function installPocketPanelHeaderActions(panel) {
    const header = panel?.querySelector(".modal-header");
    const closeButton = header?.querySelector(".icon-button");
    if (!header || !closeButton) return;
    closeButton.classList.add("pocket-window-button");
    closeButton.replaceChildren(svgIcon("x"));
    header.append(el("div", { class: "pocket-window-actions" },
      pocketFullscreenButton(panel),
      closeButton
    ));
  }

  function setPocketIframePointerBlocked(blocked) {
    setFramePointerBlockedForOverlay(blocked, "pocket");
  }

  function makePocketResizable(panel) {
    let resize = null;
    const handles = panel.querySelectorAll(".pocket-panel-resize-handle");
    for (const handle of handles) {
      handle.addEventListener("pointerdown", (event) => {
        if (pocketPanelIsFullscreen(panel)) return;
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
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
        panel.classList.add("pocket-panel-resizing");
        setPocketIframePointerBlocked(true);
        handle.setPointerCapture?.(event.pointerId);
      });
    }
    const finishResize = () => {
      if (!resize) return;
      rememberPocketPanelGeometry(panel);
      panel.classList.remove("pocket-panel-resizing");
      setPocketIframePointerBlocked(false);
      resize = null;
    };
    panel.addEventListener("pointermove", (event) => {
      if (!resize || pocketPanelIsFullscreen(panel)) return;
      const minWidth = pocketPanelMinWidth();
      const minHeight = pocketPanelMinHeight();
      const dx = event.clientX - resize.x;
      const dy = event.clientY - resize.y;
      if (resize.direction === "left") {
        const maxWidth = Math.min(pocketPanelMaxWidth(), Math.max(minWidth, resize.right - 8));
        const width = Math.min(maxWidth, Math.max(minWidth, resize.width - dx));
        panel.style.left = `${Math.max(8, resize.right - width)}px`;
        panel.style.width = `${width}px`;
      } else if (resize.direction === "right") {
        const maxWidth = Math.min(pocketPanelMaxWidth(), Math.max(minWidth, window.innerWidth - resize.left - 8));
        panel.style.width = `${Math.min(maxWidth, Math.max(minWidth, resize.width + dx))}px`;
      } else if (resize.direction === "bottom") {
        const maxHeight = Math.min(pocketPanelMaxHeight(), Math.max(minHeight, window.innerHeight - resize.top - 8));
        panel.style.height = `${Math.min(maxHeight, Math.max(minHeight, resize.height + dy))}px`;
      }
    });
    panel.addEventListener("pointerup", finishResize);
    panel.addEventListener("pointercancel", finishResize);
  }

  function attachPocketPanelResize(panel) {
    if (!panel) return;
    applyPocketPanelSize(panel);
    panel.append(
      el("div", { class: "pocket-panel-resize-handle pocket-panel-resize-handle-left", dataset: { direction: "left" }, "aria-hidden": "true" }),
      el("div", { class: "pocket-panel-resize-handle pocket-panel-resize-handle-right", dataset: { direction: "right" }, "aria-hidden": "true" }),
      el("div", { class: "pocket-panel-resize-handle pocket-panel-resize-handle-bottom", dataset: { direction: "bottom" }, "aria-hidden": "true" })
    );
    makePocketResizable(panel);
  }

  function pocketSortNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function pocketBatches(entries = []) {
    const batches = [];
    const batchById = new Map();
    (entries || []).forEach((entry, index) => {
      const batchId = entry.batchId || "legacy";
      let batch = batchById.get(batchId);
      if (!batch) {
        batch = {
          id: batchId,
          createdAt: entry.batchCreatedAt || entry.createdAt || "",
          entries: []
        };
        batchById.set(batchId, batch);
        batches.push(batch);
      }
      batch.entries.push({ entry, index });
    });
    return batches.map((batch) => ({
      ...batch,
      entries: batch.entries
        .sort((a, b) =>
          pocketSortNumber(a.entry.groupIndex, 0) - pocketSortNumber(b.entry.groupIndex, 0)
          || pocketSortNumber(a.entry.tabIndex, a.index) - pocketSortNumber(b.entry.tabIndex, b.index)
          || a.index - b.index
        )
        .map((item) => item.entry)
    })).filter((batch) => batch.entries.length);
  }

  function pocketBatchTitle(batch) {
    if (batch.id === "legacy") return t("pocket.legacyBatch");
    const savedAt = formatPocketTime(batch.createdAt);
    return savedAt ? `${t("pocket.batchSaved")} ${savedAt}` : t("pocket.batchSaved");
  }

  function loadPocketEntry(entry) {
    const loaded = loadPocketEntryInFrame(entry);
    if (!loaded) toast(t("toast.pocketLoadFailed"), "error");
    return loaded;
  }

  async function copyPocketMessage(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      toast(t("toast.pocketCopied"), "success");
    } catch (error) {
      console.warn("[ChatClub] Failed to copy Pocket message", error);
      toast(t("toast.copyFailed"), "error");
    }
  }

  async function restorePocketBatchEntries(entries = []) {
    try {
      const restored = await restorePocketBatch(entries);
      toast(restored ? t("toast.pocketRestored") : t("toast.pocketLoadFailed"), restored ? "success" : "error");
    } catch {
      toast(t("toast.pocketLoadFailed"), "error");
    }
  }

  function pocketEntryFavicon(entry) {
    const logoUrl = entry.logoUrl || effectiveFaviconUrl(entry.chatUrl || "");
    if (!logoUrl) return svgIcon("pocket");
    return el("img", {
      class: "pocket-entry-favicon",
      src: logoUrl,
      alt: "",
      loading: "lazy",
      decoding: "async",
      referrerpolicy: "no-referrer",
      onerror: (event) => {
        const image = event.currentTarget;
        if (image.dataset.fallback === "1") {
          image.hidden = true;
          return;
        }
        image.dataset.fallback = "1";
        const fallbackUrl = effectiveFaviconUrl(entry.chatUrl || "");
        if (fallbackUrl && image.src !== fallbackUrl) {
          image.src = fallbackUrl;
          return;
        }
        image.hidden = true;
      }
    });
  }

  function pocketMessageSection(role, text) {
    const assistant = role === "assistant";
    const label = assistant ? t("common.assistant") : t("common.user");
    const copyLabel = assistant ? t("pocket.copyAssistantMessage") : t("pocket.copyUserMessage");
    return el("section", { class: `pocket-message pocket-message-${role}` },
      el("div", { class: "pocket-message-head" },
        el("span", { class: "pocket-message-label" }, label),
        compactIconButton(copyLabel, "copy", (event) => {
          event.preventDefault();
          copyPocketMessage(text);
        }, "pocket-message-copy", copyLabel, "", assistant ? "pocket.copyAssistantMessage" : "pocket.copyUserMessage")
      ),
      assistant
        ? el("div", { class: "pocket-message-body pocket-message-markdown summary-preview-text-markdown" }, renderMarkdown(text))
        : el("p", { class: "pocket-message-body pocket-message-plain" }, text)
    );
  }

  function pocketEntryRow(entry, redraw) {
    return el("article", { class: "ui-card pocket-entry" },
      el("header", { class: "pocket-entry-header" },
        el("div", { class: "pocket-entry-titleblock" },
          el("div", { class: "pocket-entry-title" },
            pocketEntryFavicon(entry),
            el("strong", {}, entry.title || entry.appName || t("pocket.savedChat"))
          ),
          el("button", {
            class: "pocket-entry-url",
            type: "button",
            title: entry.chatUrl,
            onclick: (event) => {
              event.preventDefault();
              loadPocketEntry(entry);
            }
          }, entry.chatUrl)
        ),
        el("div", { class: "pocket-entry-meta" },
          entry.appName ? el("span", { class: "pocket-entry-source" }, entry.appName) : null,
          compactIconButton(t("pocket.openChat"), "insert", (event) => {
            event.preventDefault();
            loadPocketEntry(entry);
          }, "pocket-entry-action", t("pocket.openChat"), "", "pocket.openChat"),
          compactIconButton(t("pocket.deleteItem"), "trash", async () => {
            state.pocketEntries = await savePocketHistory(state.pocketEntries.filter((item) => item.id !== entry.id));
            redraw();
            toast(t("toast.pocketDeleted"), "success");
          }, "pocket-entry-action", t("pocket.deleteItem"), "", "pocket.deleteItem")
        )
      ),
      el("div", { class: "pocket-message-grid" },
        pocketMessageSection("user", entry.userMessage),
        pocketMessageSection("assistant", entry.assistantMessage)
      )
    );
  }

  function pocketBatchRestoreButton(batch) {
    return el("button", {
      class: "button button-secondary pocket-batch-restore",
      type: "button",
      onclick: () => restorePocketBatchEntries(batch.entries)
    },
      svgIcon("insert"),
      el("span", {}, t("pocket.restoreBatch"))
    );
  }

  function pocketBatchSection(batch, redraw) {
    return el("section", { class: "pocket-batch" },
      el("header", { class: "pocket-batch-header" },
        el("div", { class: "pocket-batch-title" },
          svgIcon("pocket"),
          el("strong", {}, pocketBatchTitle(batch))
        ),
        pocketBatchRestoreButton(batch)
      ),
      el("div", { class: "pocket-batch-row" },
        batch.entries.map((entry) => pocketEntryRow(entry, redraw))
      )
    );
  }

  function renderPocketHistory(host, redraw) {
    clear(host);
    const entries = state.pocketEntries || [];
    const batches = pocketBatches(entries);
    const size = applyPocketCardSize(host);
    host.append(
      el("div", { class: "ui-toolbar pocket-history-toolbar" },
        el("p", {}, t("pocket.savedInfo")),
        pocketSizeControls(host, size)
      ),
      batches.length
        ? el("div", { class: "pocket-batch-list" }, batches.map((batch) => pocketBatchSection(batch, redraw)))
        : el("div", { class: "ui-empty-state pocket-empty" },
          svgIcon("pocket"),
          el("strong", {}, t("pocket.emptyTitle")),
          el("span", {}, t("pocket.emptyDesc"))
        )
    );
  }

  function openPocketPanel() {
    const host = el("div", { class: "ui-dialog pocket-history-dialog" });
    const redraw = () => renderPocketHistory(host, redraw);
    loadPocketHistory().then((history) => {
      state.pocketEntries = history;
      redraw();
    }).catch(() => redraw());
    const dialog = modal(t("pocket.title"), host, () => dialog.remove(), true, t("common.close"));
    const panel = dialog.querySelector(".modal");
    panel?.classList.add("pocket-history-modal");
    installPocketPanelHeaderActions(panel);
    attachPocketPanelResize(panel);
    redraw();
  }

  return {
    dedupePocketEntries,
    normalizePocketMessage,
    openPocketPanel,
    pocketEntriesFromMessages,
    pocketEntriesFromSummaryPreview,
    saveSummaryPreviewToPocket,
    toggleOpenPocketPanelFullscreen
  };
}
