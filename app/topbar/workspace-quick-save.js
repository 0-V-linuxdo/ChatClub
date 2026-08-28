import { t as defaultT } from "../../shared/i18n.js";
import { normalizePromptSendHistory } from "../../shared/storage-schema.js";
import {
  framesFromSummaryPreviewItems,
  normalizeWorkspaceTabFullTextStore,
  pocketPagesFromPreviewItems,
  pocketPagesFromWorkspaceFullText,
  pocketPairsFromMessages
} from "../../shared/workspace-tab-fulltext.js";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function pairsFromFrames(frames = []) {
  return asList(frames).flatMap((frame) => pocketPairsFromMessages(frame?.messages));
}

function pairsFromPreviewItems(items = []) {
  return pairsFromFrames(framesFromSummaryPreviewItems(items));
}

function pairsFromWorkspaceStore(store, workspaceId) {
  const record = normalizeWorkspaceTabFullTextStore(store)[String(workspaceId || "").trim()];
  return pairsFromFrames(record?.frames);
}

function historyEntriesFromPairs(pairs = []) {
  const createdAt = new Date().toISOString();
  return normalizePromptSendHistory(
    asList(pairs)
      .map((pair) => ({
        text: String(pair?.userMessage || "").trim(),
        images: [],
        createdAt
      }))
      .reverse()
  );
}

function historyText(item) {
  return String(item?.text || "");
}

function incomingHistoryIds(history, incoming) {
  const byText = new Map();
  for (const item of asList(history)) {
    const key = historyText(item);
    if (key && !byText.has(key)) byText.set(key, item.id);
  }
  return asList(incoming).map((entry) => byText.get(historyText(entry))).filter(Boolean);
}

export function createTopbarWorkspaceQuickSave(dependencies = {}) {
  const collectLive = typeof dependencies.collectLive === "function" ? dependencies.collectLive : async () => [];
  const loadFullText = typeof dependencies.loadFullText === "function" ? dependencies.loadFullText : async () => ({});
  const savePagesToPocket = typeof dependencies.savePagesToPocket === "function"
    ? dependencies.savePagesToPocket
    : async () => ({ saved: false, count: 0 });
  const persistFullText = typeof dependencies.persistFullText === "function"
    ? dependencies.persistFullText
    : async () => ({ saved: false });
  const savePromptSendHistory = typeof dependencies.savePromptSendHistory === "function"
    ? dependencies.savePromptSendHistory
    : async (history) => history;
  const getHistory = typeof dependencies.getHistory === "function" ? dependencies.getHistory : () => [];
  const setHistory = typeof dependencies.setHistory === "function" ? dependencies.setHistory : () => {};
  const workspaceId = typeof dependencies.workspaceId === "function" ? dependencies.workspaceId : () => "";
  const topicTitle = typeof dependencies.topicTitle === "function" ? dependencies.topicTitle : () => "";
  const notifyHistory = typeof dependencies.notifyHistory === "function" ? dependencies.notifyHistory : () => {};
  const toast = typeof dependencies.toast === "function" ? dependencies.toast : () => {};
  const t = typeof dependencies.t === "function" ? dependencies.t : defaultT;
  let busy = false;

  function markBusy(event, on) {
    const button = event?.currentTarget;
    if (!button?.setAttribute) return;
    if (on) button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
  }

  async function collectLiveItems() {
    try {
      return asList(await collectLive());
    } catch {
      return [];
    }
  }

  async function loadStore() {
    try {
      return await loadFullText();
    } catch {
      return {};
    }
  }

  async function run(event, task) {
    if (busy) return { saved: false, busy: true };
    busy = true;
    markBusy(event, true);
    try {
      return await task();
    } finally {
      busy = false;
      markBusy(event, false);
    }
  }

  async function saveToPocket(event) {
    return run(event, async () => {
      try {
        const items = await collectLiveItems();
        let pages = pocketPagesFromPreviewItems(items);
        let source = "live";
        if (!pages.length) {
          pages = pocketPagesFromWorkspaceFullText(await loadStore(), workspaceId());
          source = pages.length ? "fulltext" : "empty";
        }
        if (!pages.length) {
          toast(t("toast.workspacePocketEmpty"), "error");
          return { saved: false, count: 0, source };
        }
        const result = await savePagesToPocket(pages);
        return {
          saved: result?.saved === true,
          count: Number(result?.count) || 0,
          source
        };
      } catch (error) {
        console.warn("[ChatClub] Failed to save current workspace to Pocket", error);
        toast(t("toast.noValidPocketContent"), "error");
        return { saved: false, count: 0 };
      }
    });
  }

  async function saveToHistory(event) {
    return run(event, async () => {
      try {
        const items = await collectLiveItems();
        let persisted = { saved: false };
        if (items.length) {
          try {
            persisted = await persistFullText({
              workspaceId: workspaceId(),
              topicTitle: topicTitle(),
              items
            });
          } catch {
            persisted = { saved: false };
          }
        }
        const persistSaved = persisted?.saved === true;
        let pairs = pairsFromPreviewItems(items);
        let source = "live";
        if (!pairs.length) {
          pairs = pairsFromWorkspaceStore(await loadStore(), workspaceId());
          source = pairs.length ? "fulltext" : "empty";
        }
        const incoming = historyEntriesFromPairs(pairs);
        if (!incoming.length) {
          toast(t("toast.workspaceHistoryEmpty"), "error");
          return { saved: false, persisted: persistSaved, count: 0, source };
        }
        const existing = asList(getHistory());
        const existingTexts = new Set(existing.map(historyText).filter(Boolean));
        const added = incoming.filter((entry) => !existingTexts.has(historyText(entry)));
        let savedHistory = existing;
        if (added.length) {
          savedHistory = await savePromptSendHistory(
            normalizePromptSendHistory([...added, ...existing])
          );
        }
        setHistory(savedHistory);
        notifyHistory({
          items,
          incomingIds: incomingHistoryIds(savedHistory, incoming),
          persistSaved
        });
        if (added.length) {
          toast(t("toast.historyWorkspaceSaved", {
            count: added.length,
            plural: added.length === 1 ? "" : "s"
          }), "success");
        } else {
          toast(t("toast.historyWorkspaceRefreshed", {
            count: incoming.length,
            plural: incoming.length === 1 ? "" : "s"
          }), "success");
        }
        return {
          saved: true,
          persisted: persistSaved,
          count: incoming.length,
          added: added.length,
          source
        };
      } catch (error) {
        console.warn("[ChatClub] Failed to save current workspace to History", error);
        toast(t("toast.workspaceHistoryEmpty"), "error");
        return { saved: false, persisted: false, count: 0 };
      }
    });
  }

  return Object.freeze({ saveToPocket, saveToHistory });
}
