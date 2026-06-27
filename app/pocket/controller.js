import { t } from "../../shared/i18n.js";
import { button, clear, el, modal, toast } from "../../ui/dom.js";
import { requireControllerContext, requireControllerFunction } from "../controller-context.js";
import {
  summaryPreviewPage,
  summaryPreviewStatus,
  summarySourceMeta
} from "../summary/model.js";

export function createPocketController(ctx) {
  const controllerName = "Pocket controller";
  const state = requireControllerContext(ctx, controllerName, "state");
  const createId = requireControllerFunction(ctx, controllerName, "createId");
  const loadPocketHistory = requireControllerFunction(ctx, controllerName, "loadPocketHistory");
  const savePocketHistory = requireControllerFunction(ctx, controllerName, "savePocketHistory");
  const openableTabUrl = requireControllerFunction(ctx, controllerName, "openableTabUrl");
  const openTabUrl = requireControllerFunction(ctx, controllerName, "openTabUrl");
  const effectiveFaviconUrl = requireControllerFunction(ctx, controllerName, "effectiveFaviconUrl");
  const compactIconButton = requireControllerFunction(ctx, controllerName, "compactIconButton");
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");

  function normalizePocketMessage(message = {}) {
    const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : "";
    const text = String(message.text || message.content || "").trim();
    return role && text ? { role, text } : null;
  }

  function pocketEntriesFromMessages(messages = [], page = {}, meta = {}) {
    const chatUrl = openableTabUrl(page.href || page.url || "");
    if (!chatUrl) return [];
    const title = meta.title || page.title || page.pageTitle || chatUrl;
    const appName = meta.brand || page.siteName || page.name || "";
    const createdAt = new Date().toISOString();
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
          chatUrl,
          title,
          appName,
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
    return (items || []).flatMap((item) => {
      if (summaryPreviewStatus(item.status) !== "ok") return [];
      const page = summaryPreviewPage(item);
      const messages = Array.isArray(page.messages) ? page.messages : [];
      if (!messages.length) return [];
      return pocketEntriesFromMessages(messages, page, summarySourceMeta(page, { effectiveFaviconUrl }));
    });
  }

  function dedupePocketEntries(entries) {
    const seen = new Set();
    return (entries || []).filter((entry) => {
      const key = [entry.chatUrl, entry.userMessage, entry.assistantMessage].join("\n");
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

  function pocketEntryRow(entry, redraw) {
    return el("article", { class: "ui-card pocket-entry" },
      el("header", { class: "pocket-entry-header" },
        el("div", { class: "pocket-entry-titleblock" },
          el("div", { class: "pocket-entry-title" },
            svgIcon("pocket"),
            el("strong", {}, entry.title || entry.appName || t("pocket.savedChat"))
          ),
          el("a", {
            class: "pocket-entry-url",
            href: entry.chatUrl,
            target: "_blank",
            rel: "noopener noreferrer"
          }, entry.chatUrl)
        ),
        el("div", { class: "pocket-entry-meta" },
          entry.appName ? el("span", { class: "pocket-entry-source" }, entry.appName) : null,
          entry.createdAt ? el("time", { datetime: entry.createdAt }, formatPocketTime(entry.createdAt)) : null,
          compactIconButton(t("pocket.openChat"), "external", (event) => {
            event.preventDefault();
            openTabUrl(entry.chatUrl) || toast(t("chat.unableToOpenTab"), "error");
          }, "pocket-entry-action"),
          compactIconButton(t("pocket.deleteItem"), "trash", async () => {
            state.pocketEntries = await savePocketHistory(state.pocketEntries.filter((item) => item.id !== entry.id));
            redraw();
            toast(t("toast.pocketDeleted"), "success");
          }, "pocket-entry-action")
        )
      ),
      el("div", { class: "pocket-message-grid" },
        el("section", { class: "pocket-message pocket-message-user" },
          el("span", { class: "pocket-message-label" }, t("common.user")),
          el("p", {}, entry.userMessage)
        ),
        el("section", { class: "pocket-message pocket-message-assistant" },
          el("span", { class: "pocket-message-label" }, t("common.assistant")),
          el("p", {}, entry.assistantMessage)
        )
      )
    );
  }

  function renderPocketHistory(host, redraw) {
    clear(host);
    const entries = state.pocketEntries || [];
    host.append(
      el("div", { class: "ui-toolbar pocket-history-toolbar" },
        el("p", {}, t("pocket.savedInfo")),
        entries.length ? button(t("pocket.clear"), async () => {
          state.pocketEntries = await savePocketHistory([]);
          redraw();
          toast(t("toast.pocketCleared"), "success");
        }) : null
      ),
      entries.length
        ? el("div", { class: "pocket-entry-list" }, entries.map((entry) => pocketEntryRow(entry, redraw)))
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
    dialog.querySelector(".modal")?.classList.add("pocket-history-modal");
    redraw();
  }

  return {
    dedupePocketEntries,
    normalizePocketMessage,
    openPocketPanel,
    pocketEntriesFromMessages,
    pocketEntriesFromSummaryPreview,
    saveSummaryPreviewToPocket
  };
}
