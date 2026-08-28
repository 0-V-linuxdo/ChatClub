import { t } from "../../shared/i18n.js";
import { dedupePocketHistory, normalizePocketCardSize, normalizePocketIcon } from "../../shared/storage-schema.js";
import { pocketChromeLabelKey } from "../../shared/topbar.js";
import { clear, el, toast, viewerModal } from "../../ui/dom.js";
import { createViewerWindowChrome } from "../../ui/viewer-window.js";
import { requireControllerContext, requireControllerFunction, validateControllerContract } from "../controller-contract.js";
import { renderMarkdown } from "../summary/markdown.js";
import {
  uniqueChatFaviconSources,
  renderChatFaviconStack
} from "../../ui/favicon.js";
import {
  summaryPreviewPage,
  summaryPreviewStatus,
  summarySourceMeta
} from "../summary/model.js";

const POCKET_PANEL_SIZE_KEY = "chatclub.pocketPanelSize.v1";
const POCKET_ACTIVE_GROUP_KEY = "chatclub.pocketActiveGroupId.v1";
const POCKET_PANEL_MIN_WIDTH = 720;
const POCKET_PANEL_MIN_HEIGHT = 420;
const POCKET_PANEL_FULLSCREEN_CLASS = "pocket-history-modal-fullscreen";
const POCKET_PANEL_FOCUS_CLASS = "pocket-history-modal-focus";
const POCKET_CARD_GAP = 12;

export function createPocketController(ctx) {
  const controllerName = "Pocket controller";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object", createId: "function", loadPocketHistory: "function", savePocketHistory: "function",
    saveOptions: "function", openableTabUrl: "function", loadPocketEntryInFrame: "function",
    restorePocketBatch: "function", setFramePointerBlockedForOverlay: "function",
    effectiveFaviconUrl: "function", compactIconButton: "function", svgIcon: "function",
    syncTopbar: "function?"
  });
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
  const syncTopbar = typeof ctx.syncTopbar === "function" ? ctx.syncTopbar : null;
  let pocketCardSizeSaveTimer = 0;
  let pocketActionsExpanded = false;
  let pocketSidebarCollapsed = false;
  let pocketCurrentRedraw = null;
  const viewerWindow = createViewerWindowChrome({
    fullscreenClass: POCKET_PANEL_FULLSCREEN_CLASS,
    focusClass: POCKET_PANEL_FOCUS_CLASS,
    sizeKey: POCKET_PANEL_SIZE_KEY,
    minWidth: POCKET_PANEL_MIN_WIDTH,
    minHeight: POCKET_PANEL_MIN_HEIGHT,
    widthVar: "--pocket-panel-width",
    heightVar: "--pocket-panel-height",
    buttonClass: "icon-button tooltip-trigger pocket-window-button overlay-window-button",
    t,
    svgIcon,
    onChange: () => pocketCurrentRedraw?.(),
    onPointerBlock: (blocked) => setFramePointerBlockedForOverlay(blocked, "pocket")
  });

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

  function pocketEntriesFromPages(pages = []) {
    const batch = { batchId: createId("pocket-batch"), batchCreatedAt: new Date().toISOString() };
    const workspaceMeta = workspacePocketMetaByInstanceId();
    return (pages || []).flatMap((page, order) => {
      const messages = Array.isArray(page?.messages) ? page.messages : [];
      if (!messages.length) return [];
      const context = pocketSourceContext(page, batch, workspaceMeta, order);
      return pocketEntriesFromMessages(messages, page, summarySourceMeta(page, { effectiveFaviconUrl }), context);
    });
  }

  function pocketPreviewPages(items = state.summaryPreviewItems) {
    return (items || []).flatMap((item) => {
      if (summaryPreviewStatus(item.status) !== "ok") return [];
      const page = summaryPreviewPage(item);
      return Array.isArray(page?.messages) && page.messages.length ? [page] : [];
    });
  }

  function pocketEntriesFromSummaryPreview(items = state.summaryPreviewItems) {
    return pocketEntriesFromPages(pocketPreviewPages(items));
  }

  function dedupePocketEntries(entries) {
    return dedupePocketHistory(entries);
  }

  async function savePagesToPocket(pages = []) {
    const entries = pocketEntriesFromPages(pages);
    if (!entries.length) {
      toast(t("toast.noValidPocketContent"), "error");
      return { saved: false, count: 0 };
    }
    const stored = await loadPocketHistory();
    state.pocketEntries = await savePocketHistory(dedupePocketEntries([...entries, ...stored]));
    toast(t("toast.pocketSaved", { count: entries.length, plural: entries.length === 1 ? "" : "s" }), "success");
    return { saved: true, count: entries.length };
  }

  async function saveSummaryPreviewToPocket() {
    return savePagesToPocket(pocketPreviewPages());
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

  function pocketDisplayIcon() {
    return normalizePocketIcon(state.options?.pocketIcon);
  }

  function pocketChromeLabel() {
    return t(pocketChromeLabelKey(state.options));
  }

  async function cyclePocketIcon() {
    const next = pocketDisplayIcon() === "pocket" ? "star" : "pocket";
    state.options = await saveOptions({ ...state.options, pocketIcon: next });
    syncTopbar?.();
    pocketCurrentRedraw?.();
  }

  function syncPocketClusterWidths(host, size = pocketCardSize()) {
    host?.querySelectorAll?.(".pocket-entry-cluster[data-entry-count]").forEach((cluster) => {
      const count = Math.max(1, Number(cluster.dataset.entryCount) || 1);
      const width = (count * size.width) + ((count - 1) * POCKET_CARD_GAP);
      cluster.style.setProperty("--pocket-cluster-row-width", `${Math.round(width)}px`);
    });
  }

  function applyPocketCardSize(host, size = pocketCardSize()) {
    host?.style?.setProperty("--pocket-card-width", `${size.width}px`);
    host?.style?.setProperty("--pocket-card-height", `${size.height}px`);
    syncPocketClusterWidths(host, size);
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

  function readPocketActiveGroupId() {
    try {
      return String(localStorage.getItem(POCKET_ACTIVE_GROUP_KEY) || "");
    } catch {}
    return "";
  }

  function rememberPocketActiveGroupId(groupId = "") {
    try {
      if (groupId) localStorage.setItem(POCKET_ACTIVE_GROUP_KEY, groupId);
      else localStorage.removeItem(POCKET_ACTIVE_GROUP_KEY);
    } catch {}
  }

  function pocketPanelIsFocusMode(panel) {
    return viewerWindow.isFocusMode(panel);
  }

  function togglePocketPanelFocusMode(panel) {
    viewerWindow.toggleFocusMode(panel);
  }

  function pocketFullscreenButton(panel) {
    return viewerWindow.fullscreenButton(panel);
  }

  function installPocketPanelHeaderActions(panel) {
    const header = panel?.querySelector(".modal-header");
    const closeButton = header?.querySelector(".icon-button");
    const title = header?.querySelector("h2");
    if (!header || !closeButton || !title) return;
    title.before(el("div", { class: "pocket-focus-leftbar", hidden: true }));
    title.before(el("div", { class: "pocket-header-sidebar" },
      el("button", {
        class: "pocket-modal-title-icon tooltip-trigger",
        type: "button",
        "aria-label": t("pocket.switchIcon"),
        "data-tooltip": t("pocket.switchIcon"),
        "data-tooltip-id": "pocket.switchIcon",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          cyclePocketIcon();
        }
      }, svgIcon(pocketDisplayIcon())),
      el("div", { class: "pocket-sidebar-titlebar", hidden: true })
    ));
    closeButton.classList.add("pocket-window-button", "overlay-window-button");
    closeButton.replaceChildren(svgIcon("x"));
    header.append(
      el("div", { class: "pocket-focus-titlebar", hidden: true }),
      el("div", { class: "pocket-window-actions" },
        pocketFullscreenButton(panel),
        closeButton
      )
    );
  }

  function toggleOpenPocketPanelFullscreen() {
    const panel = document.querySelector(".modal.pocket-history-modal");
    if (!panel) return false;
    const button = panel.querySelector('[data-tooltip-id="viewer.fullscreen"]');
    viewerWindow.toggleFullscreen(panel, button);
    return true;
  }

  function attachPocketPanelResize(panel) {
    viewerWindow.attachResize(panel);
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
    return savedAt;
  }

  function resolvePocketActiveBatch(batches = []) {
    if (!batches.length) {
      rememberPocketActiveGroupId("");
      return null;
    }
    const savedGroupId = readPocketActiveGroupId();
    const activeBatch = batches.find((batch) => batch.id === savedGroupId) || batches[0];
    if (activeBatch?.id && activeBatch.id !== savedGroupId) rememberPocketActiveGroupId(activeBatch.id);
    return activeBatch;
  }

  function pocketCompactText(value = "", fallback = "") {
    return String(value || "").replace(/\s+/g, " ").trim() || fallback;
  }

  function pocketBatchQuestion(batch = {}) {
    const firstEntry = (batch.entries || []).find((entry) => pocketCompactText(entry.userMessage));
    return pocketCompactText(firstEntry?.userMessage, pocketBatchTitle(batch));
  }

  function pocketBatchSourceSummary(batch = {}) {
    const names = [];
    for (const entry of batch.entries || []) {
      const name = pocketCompactText(entry.appName || entry.title);
      if (!name || names.includes(name)) continue;
      names.push(name);
    }
    return names.join(" · ");
  }

  function pocketBatchMeta(batch = {}) {
    const count = (batch.entries || []).length;
    const sources = pocketBatchSourceSummary(batch);
    return sources ? t("pocket.groupSources", { count, sources }) : t("pocket.groupCards", { count });
  }

  function pocketUserMessageKey(text = "") {
    return String(text || "").replace(/\r\n?/g, "\n").trim();
  }

  function pocketEntryClusters(entries = []) {
    const entriesByMessage = new Map();
    for (const entry of entries || []) {
      const messageKey = pocketUserMessageKey(entry.userMessage);
      if (!messageKey) continue;
      let messageEntries = entriesByMessage.get(messageKey);
      if (!messageEntries) {
        messageEntries = [];
        entriesByMessage.set(messageKey, messageEntries);
      }
      messageEntries.push(entry);
    }
    const clusters = [];
    const emittedMessages = new Set();
    let looseEntries = [];
    const flushLooseEntries = () => {
      if (!looseEntries.length) return;
      clusters.push({ merged: false, entries: looseEntries });
      looseEntries = [];
    };
    for (const entry of entries || []) {
      const messageKey = pocketUserMessageKey(entry.userMessage);
      const messageEntries = messageKey ? entriesByMessage.get(messageKey) || [] : [];
      if (messageKey && messageEntries.length > 1) {
        if (emittedMessages.has(messageKey)) continue;
        flushLooseEntries();
        emittedMessages.add(messageKey);
        clusters.push({
          key: messageKey,
          userMessage: messageEntries[0]?.userMessage || entry.userMessage,
          entries: messageEntries,
          merged: true
        });
        continue;
      }
      looseEntries.push(entry);
    }
    flushLooseEntries();
    return clusters;
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
    if (!logoUrl) return svgIcon(pocketDisplayIcon());
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

  function pocketEntryRow(entry, redraw, options = {}) {
    const assistantOnly = Boolean(options.assistantOnly);
    return el("article", { class: `ui-card pocket-entry${assistantOnly ? " pocket-entry-assistant-only" : ""}` },
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
        assistantOnly ? null : pocketMessageSection("user", entry.userMessage),
        pocketMessageSection("assistant", entry.assistantMessage)
      )
    );
  }

  function pocketEntryCluster(cluster, redraw) {
    const entryCount = Math.max(1, cluster.entries.length);
    return el("section", {
      class: `pocket-entry-cluster${cluster.merged ? " pocket-entry-cluster-merged" : ""}`,
      dataset: { entryCount }
    },
      cluster.merged
        ? el("div", { class: "pocket-shared-user-message" }, pocketMessageSection("user", cluster.userMessage))
        : null,
      el("div", { class: "pocket-batch-row" },
        cluster.entries.map((entry) => pocketEntryRow(entry, redraw, { assistantOnly: cluster.merged }))
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

  function pocketActionsId(host) {
    const actionsId = host?.dataset?.actionsId || createId("pocket-actions");
    if (host?.dataset) host.dataset.actionsId = actionsId;
    return actionsId;
  }

  function pocketGroupTitleBlock(batch, extraClass = "") {
    return el("div", { class: `pocket-main-title ${extraClass}`.trim() },
      el("strong", {}, pocketBatchQuestion(batch)),
      el("span", {}, pocketBatchTitle(batch))
    );
  }

  function pocketSidebarItem(batch, activeBatch, redraw) {
    const active = batch.id === activeBatch?.id;
    const sourceMeta = pocketBatchMeta(batch);
    const favicons = renderChatFaviconStack(
      uniqueChatFaviconSources(batch.entries || [], (entry) => ({
        href: entry.chatUrl,
        logoUrl: entry.logoUrl,
        appId: entry.appId,
        title: entry.appName || entry.title
      })),
      {
        effectiveFaviconUrl,
        omitTitle: true,
        stackClass: "pocket-group-favicons"
      }
    );
    return el("button", {
      class: `pocket-group-button${active ? " active" : ""}`,
      type: "button",
      "aria-current": active ? "true" : null,
      onclick: () => {
        if (active) return;
        rememberPocketActiveGroupId(batch.id);
        pocketActionsExpanded = false;
        redraw();
      }
    },
      el("span", { class: "pocket-group-head" },
        el("span", { class: "pocket-group-question" }, pocketBatchQuestion(batch))
      ),
      el("span", { class: "pocket-group-foot" },
        favicons,
        el("span", { class: "pocket-group-time" }, pocketBatchTitle(batch)),
        sourceMeta ? el("span", { class: "pocket-group-meta" }, sourceMeta) : null
      )
    );
  }

  function pocketFocusModeButton(host, redraw) {
    const panel = host?.closest?.(".modal.pocket-history-modal");
    const focusMode = pocketPanelIsFocusMode(panel);
    const label = focusMode ? t("pocket.exitFocusMode") : t("pocket.focusMode");
    return el("button", {
      class: "icon-button tooltip-trigger pocket-focus-mode-button",
      type: "button",
      "aria-label": label,
      "aria-pressed": focusMode ? "true" : "false",
      "data-tooltip": label,
      "data-tooltip-id": "pocket.focusMode",
      onclick: (event) => {
        event.preventDefault();
        togglePocketPanelFocusMode(host?.closest?.(".modal.pocket-history-modal"));
        redraw();
      }
    }, svgIcon("focusMode"));
  }

  function pocketExitFocusModeButton(host, redraw) {
    const label = t("pocket.exitFocusMode");
    return el("button", {
      class: "icon-button tooltip-trigger pocket-exit-focus-button",
      type: "button",
      "aria-label": label,
      "data-tooltip": label,
      "data-tooltip-id": "pocket.focusMode",
      onclick: (event) => {
        event.preventDefault();
        togglePocketPanelFocusMode(host?.closest?.(".modal.pocket-history-modal"));
        redraw();
      }
    }, svgIcon("insert"));
  }

  function pocketSidebarCollapseButton(redraw) {
    const collapsed = pocketSidebarCollapsed;
    const label = collapsed ? t("pocket.expandSidebar") : t("pocket.collapseSidebar");
    return el("button", {
      class: `icon-button tooltip-trigger pocket-sidebar-collapse-button ${collapsed ? "pocket-sidebar-collapse-button-expand" : "pocket-sidebar-collapse-button-collapse"}`,
      type: "button",
      "aria-label": label,
      "aria-pressed": collapsed ? "true" : "false",
      "data-tooltip": label,
      "data-tooltip-id": "pocket.sidebar",
      onclick: (event) => {
        event.preventDefault();
        pocketSidebarCollapsed = !pocketSidebarCollapsed;
        redraw();
      }
    }, svgIcon(collapsed ? "sidebarExpand" : "sidebarCollapse"));
  }

  function pocketSidebar(batches, activeBatch, redraw) {
    return el("aside", {
      class: "pocket-sidebar",
      "aria-label": pocketChromeLabel()
    },
      batches.length
        ? el("div", { class: "pocket-sidebar-list", role: "list" },
          batches.map((batch) => el("div", { class: "pocket-sidebar-list-item", role: "listitem" },
            pocketSidebarItem(batch, activeBatch, redraw)
          ))
        )
        : el("div", { class: "pocket-sidebar-empty" }, t("pocket.emptyGroups"))
    );
  }

  function pocketActionsToggle(actionsId, redraw) {
    const label = pocketActionsExpanded ? t("pocket.hideActions") : t("pocket.showActions");
    return el("button", {
      class: "button button-secondary pocket-action-toggle tooltip-trigger",
      type: "button",
      "aria-label": label,
      "aria-controls": actionsId,
      "aria-expanded": pocketActionsExpanded ? "true" : "false",
      "data-tooltip": label,
      "data-tooltip-id": "pocket.actions",
      onclick: (event) => {
        event.preventDefault();
        pocketActionsExpanded = !pocketActionsExpanded;
        redraw();
      }
    },
      svgIcon("menu"),
      el("span", {}, t("pocket.actions"))
    );
  }

  function pocketActionsPanel(host, size) {
    const actionsId = pocketActionsId(host);
    return el("div", {
      id: actionsId,
      class: "pocket-actions-panel",
      hidden: !pocketActionsExpanded
    },
      pocketSizeControls(host, size)
    );
  }

  function pocketActiveGroupHeader(host, size, options = {}) {
    if (!pocketActionsExpanded) return null;
    return el("section", { class: `pocket-active-header${options.focusMode ? " pocket-active-header-focus" : ""}` },
      pocketActionsPanel(host, size)
    );
  }

  function syncPocketSidebarTitlebar(panel, host, redraw) {
    const titlebar = panel?.querySelector(".pocket-sidebar-titlebar");
    if (!titlebar) return;
    clear(titlebar);
    if (pocketPanelIsFocusMode(panel)) {
      titlebar.hidden = true;
      titlebar.setAttribute("hidden", "");
      return;
    }
    titlebar.hidden = false;
    titlebar.removeAttribute("hidden");
    titlebar.append(
      el("strong", {}, pocketChromeLabel()),
      el("div", { class: "pocket-sidebar-titlebar-actions" },
        pocketSidebarCollapseButton(redraw),
        pocketFocusModeButton(host, redraw)
      )
    );
  }

  function syncPocketTitleIcon(panel) {
    const button = panel?.querySelector(".pocket-modal-title-icon");
    if (!button) return;
    button.replaceChildren(svgIcon(pocketDisplayIcon()));
  }

  function syncPocketFocusLeftbar(panel, host, redraw) {
    const titlebar = panel?.querySelector(".pocket-focus-leftbar");
    if (!titlebar) return;
    clear(titlebar);
    if (!pocketPanelIsFocusMode(panel)) {
      titlebar.hidden = true;
      titlebar.setAttribute("hidden", "");
      return;
    }
    titlebar.hidden = false;
    titlebar.removeAttribute("hidden");
    titlebar.append(
      el("span", { class: "pocket-focus-pocket-icon", "aria-hidden": "true" }, svgIcon(pocketDisplayIcon())),
      pocketExitFocusModeButton(host, redraw)
    );
  }

  function syncPocketFocusTitlebar(panel, host, activeBatch, redraw) {
    const titlebar = panel?.querySelector(".pocket-focus-titlebar");
    if (!titlebar) return;
    clear(titlebar);
    if (!activeBatch) {
      titlebar.hidden = true;
      titlebar.setAttribute("hidden", "");
      return;
    }
    const actionsId = pocketActionsId(host);
    const focusMode = pocketPanelIsFocusMode(panel);
    titlebar.hidden = false;
    titlebar.removeAttribute("hidden");
    if (focusMode) {
      titlebar.append(
        pocketGroupTitleBlock(activeBatch, "pocket-focus-title"),
        el("div", { class: "pocket-main-actions pocket-focus-actions" },
          pocketBatchRestoreButton(activeBatch),
          pocketActionsToggle(actionsId, redraw)
        )
      );
      return;
    }
    titlebar.append(
      pocketGroupTitleBlock(activeBatch, "pocket-header-title"),
      el("div", { class: "pocket-main-actions pocket-header-actions" },
        pocketBatchRestoreButton(activeBatch),
        pocketActionsToggle(actionsId, redraw)
      )
    );
  }

  function pocketActiveGroupContent(batch, redraw) {
    return el("div", { class: "pocket-active-content" },
      el("section", { class: "pocket-batch pocket-active-batch" },
        el("div", { class: "pocket-batch-clusters" },
          pocketEntryClusters(batch.entries).map((cluster) => pocketEntryCluster(cluster, redraw))
        )
      )
    );
  }

  function pocketMainPane(host, activeBatch, redraw, size, options = {}) {
    if (!activeBatch) {
      return el("main", { class: "pocket-main pocket-main-empty" },
        el("div", { class: "ui-empty-state pocket-empty" },
          svgIcon(pocketDisplayIcon()),
          el("strong", {}, t("pocket.emptyTitle")),
          el("span", {}, t("pocket.emptyDesc"))
        )
      );
    }
    return el("main", { class: "pocket-main" },
      pocketActiveGroupHeader(host, size, options),
      pocketActiveGroupContent(activeBatch, redraw)
    );
  }

  function renderPocketHistory(host, redraw) {
    clear(host);
    const entries = state.pocketEntries || [];
    const batches = pocketBatches(entries);
    const size = applyPocketCardSize(host);
    const activeBatch = resolvePocketActiveBatch(batches);
    const panel = host.closest?.(".modal.pocket-history-modal");
    const focusMode = pocketPanelIsFocusMode(panel);
    const sidebarCollapsed = !focusMode && pocketSidebarCollapsed;
    panel?.classList?.toggle("pocket-history-modal-sidebar-collapsed", sidebarCollapsed);
    syncPocketTitleIcon(panel);
    syncPocketFocusLeftbar(panel, host, redraw);
    syncPocketSidebarTitlebar(panel, host, redraw);
    syncPocketFocusTitlebar(panel, host, activeBatch, redraw);
    host.append(
      el("div", { class: `pocket-shell${focusMode ? " pocket-shell-focus" : ""}${sidebarCollapsed ? " pocket-shell-sidebar-collapsed" : ""}` },
        focusMode || sidebarCollapsed ? null : pocketSidebar(batches, activeBatch, redraw),
        pocketMainPane(host, activeBatch, redraw, size, { focusMode, sidebarCollapsed })
      )
    );
    syncPocketClusterWidths(host, size);
  }

  function openPocketPanel() {
    pocketActionsExpanded = false;
    const host = el("div", { class: "ui-dialog pocket-history-dialog" });
    const redraw = () => renderPocketHistory(host, redraw);
    pocketCurrentRedraw = redraw;
    loadPocketHistory().then((history) => {
      state.pocketEntries = history;
      redraw();
    }).catch(() => redraw());
    const dialog = viewerModal(pocketChromeLabel(), host, () => {
      if (pocketCurrentRedraw === redraw) pocketCurrentRedraw = null;
      dialog.remove();
    }, true, t("common.close"));
    const panel = dialog.querySelector(".modal");
    panel?.classList.add("pocket-history-modal");
    installPocketPanelHeaderActions(panel);
    attachPocketPanelResize(panel);
    redraw();
  }

  return {
    openPocketPanel,
    pocketEntriesFromSummaryPreview,
    savePagesToPocket,
    saveSummaryPreviewToPocket,
    toggleOpenPocketPanelFullscreen
  };
}
