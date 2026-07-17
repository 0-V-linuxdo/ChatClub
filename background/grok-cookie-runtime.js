import { GROK_COOKIE_BRIDGE_VERSION } from "../shared/protocol.js";
import {
  chromiumExtensionPartitionKey,
  clearGrokTombstonesForStore,
  cookieStoreIdForTab,
  grokCookieChangeOwnedByBridge,
  isGrokSessionUrl,
  isPartitionedGrokTargetChange,
  isUnpartitionedGrokSourceChange,
  managedGrokPartitionKeys,
  releaseChangedGrokPartition,
  removeAllManagedGrokPartitions,
  removeManagedGrokPartitionsExcept,
  syncGrokSessionCookies
} from "./grok-cookie-bridge.js";

const GROK_FRAME_PREFLIGHT_MAX_AGE_MS = 60 * 1000;

export function createGrokCookieRuntime(api, dependencies = {}) {
  if (!api?.runtime || !api?.webNavigation) throw new TypeError("Grok Cookie runtime requires the extension API");
  if (typeof dependencies.verifiedExtensionPageSender !== "function") {
    throw new TypeError("Grok Cookie runtime requires verifiedExtensionPageSender");
  }
  const verifiedExtensionPageSender = dependencies.verifiedExtensionPageSender;
  const sourceChangeTimers = new Map();
  const sourceChangedAuthNames = new Map();
  const framePreflights = new Map();
  const fallbackReloadCounts = new Map();
  let bridgeChain = Promise.resolve();

  function framePreflightId(value) {
    const id = String(value || "");
    return /^[a-z0-9][a-z0-9._:-]{15,191}$/i.test(id) ? id : "";
  }

  function pruneFramePreflights(now = Date.now()) {
    for (const [id, preflight] of framePreflights) {
      if (now - Number(preflight?.startedAt || 0) > GROK_FRAME_PREFLIGHT_MAX_AGE_MS) framePreflights.delete(id);
    }
  }

  function registerFramePreflight(message = {}, sender = {}) {
    if (!isGrokSessionUrl(message.url)) return "";
    const id = framePreflightId(message.preflightId);
    if (!id) return "";
    const tabId = verifiedExtensionPageSender(sender);
    pruneFramePreflights();
    framePreflights.set(id, {
      tabId,
      url: String(message.url || ""),
      startedAt: Date.now(),
      fallbackMarked: false
    });
    return id;
  }

  function finishFramePreflight(id) {
    if (id) framePreflights.delete(id);
  }

  function markFramePreflightFallback(message = {}, sender = {}) {
    const tabId = verifiedExtensionPageSender(sender);
    const id = framePreflightId(message.preflightId);
    const preflight = id ? framePreflights.get(id) : null;
    if (!preflight || preflight.tabId !== tabId || preflight.url !== String(message.url || "")) return false;
    if (!preflight.fallbackMarked) {
      preflight.fallbackMarked = true;
      framePreflights.set(id, preflight);
      fallbackReloadCounts.set(tabId, Math.min(32, (fallbackReloadCounts.get(tabId) || 0) + 1));
    }
    return true;
  }

  function consumeFallbackReload(tabId) {
    const count = fallbackReloadCounts.get(tabId) || 0;
    if (!count) return false;
    if (count === 1) fallbackReloadCounts.delete(tabId);
    else fallbackReloadCounts.set(tabId, count - 1);
    return true;
  }

  function queue(task) {
    const run = bridgeChain.catch(() => {}).then(task);
    bridgeChain = run.catch(() => {});
    return run;
  }

  function publicResult(result = {}) {
    return {
      supported: result.supported === true,
      changed: result.changed === true,
      created: Math.max(0, Number(result.created) || 0),
      updated: Math.max(0, Number(result.updated) || 0),
      removed: Math.max(0, Number(result.removed) || 0),
      skipped: Math.max(0, Number(result.skipped) || 0)
    };
  }

  async function syncAtPartition(storeId, partitionKey, options = {}) {
    const cleanup = options.authoritative
      ? await removeManagedGrokPartitionsExcept(api, { storeId, partitionKey })
      : { changed: false, removed: 0 };
    const synced = await syncGrokSessionCookies(api, { storeId, partitionKey });
    return publicResult({
      supported: true,
      changed: cleanup.changed || synced.changed,
      created: synced.created,
      updated: synced.updated,
      removed: Number(cleanup.removed || 0) + Number(synced.removed || 0),
      skipped: synced.skipped
    });
  }

  async function prepareSessionCookies(url, sender = {}) {
    const tabId = verifiedExtensionPageSender(sender);
    if (!isGrokSessionUrl(url)) return publicResult();
    const partitionKey = chromiumExtensionPartitionKey(api.runtime);
    if (!partitionKey || !api.cookies?.get || !api.cookies?.set) return publicResult();
    const storeId = await cookieStoreIdForTab(api, tabId);
    return queue(async () => {
      try {
        return await syncAtPartition(storeId, partitionKey);
      } catch {
        try {
          return await syncAtPartition(storeId, { topLevelSite: partitionKey.topLevelSite });
        } catch {
          return publicResult();
        }
      }
    });
  }

  async function verifiedFrameSender(sender = {}) {
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    const senderUrl = String(sender?.url || "");
    const extensionBase = api.runtime.getURL("");
    if (
      (sender?.id && sender.id !== api.runtime.id)
      || !Number.isInteger(tabId)
      || !Number.isInteger(frameId)
      || frameId <= 0
      || !isGrokSessionUrl(senderUrl)
      || !String(sender?.tab?.url || "").startsWith(extensionBase)
    ) throw new Error("Grok Cookie bridge sender is invalid");
    const frame = await api.webNavigation.getFrame({ tabId, frameId });
    if (!frame || frame.parentFrameId !== 0 || String(frame.url || "") !== senderUrl) {
      throw new Error("Grok Cookie bridge frame changed");
    }
    const senderDocumentId = String(sender?.documentId || "");
    const frameDocumentId = String(frame.documentId || "");
    if (senderDocumentId && frameDocumentId && senderDocumentId !== frameDocumentId) {
      throw new Error("Grok Cookie bridge document changed");
    }
    return { tabId, frameId, documentId: senderDocumentId || frameDocumentId };
  }

  async function syncForFrame(sender = {}) {
    const frame = await verifiedFrameSender(sender);
    if (typeof api.cookies?.getPartitionKey !== "function") return queue(() => publicResult());
    const partitionKey = await api.cookies.getPartitionKey({
      tabId: frame.tabId,
      frameId: frame.frameId,
      ...(frame.documentId ? { documentId: frame.documentId } : {})
    });
    const storeId = await cookieStoreIdForTab(api, frame.tabId);
    return queue(() => syncAtPartition(storeId, partitionKey, { authoritative: true }));
  }

  function scheduleSourceCookieSync(changeInfo = {}) {
    const storeId = String(changeInfo.cookie?.storeId || "");
    const timerKey = storeId || "default";
    const changedAuthNames = sourceChangedAuthNames.get(timerKey) || new Set();
    if (!changeInfo.removed && (changeInfo.cookie?.name === "sso" || changeInfo.cookie?.name === "sso-rw")) {
      changedAuthNames.add(changeInfo.cookie.name);
    }
    sourceChangedAuthNames.set(timerKey, changedAuthNames);
    const previous = sourceChangeTimers.get(timerKey);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      sourceChangeTimers.delete(timerKey);
      sourceChangedAuthNames.delete(timerKey);
      queue(async () => {
        await clearGrokTombstonesForStore(api, storeId, [...changedAuthNames]);
        const candidates = await managedGrokPartitionKeys(api, storeId);
        const seen = new Set();
        for (const partitionKey of candidates) {
          const id = JSON.stringify(partitionKey);
          if (seen.has(id)) continue;
          seen.add(id);
          try { await syncAtPartition(storeId, partitionKey); } catch {}
        }
      }).catch(() => {});
    }, 220);
    sourceChangeTimers.set(timerKey, timer);
  }

  function handleCookieChange(changeInfo) {
    if (isUnpartitionedGrokSourceChange(changeInfo)) {
      scheduleSourceCookieSync(changeInfo);
      return;
    }
    if (!isPartitionedGrokTargetChange(changeInfo) || grokCookieChangeOwnedByBridge(changeInfo)) return;
    queue(() => releaseChangedGrokPartition(api, changeInfo)).catch(() => {});
  }

  function handleTabRemoved(tabId) {
    fallbackReloadCounts.delete(tabId);
    for (const [id, preflight] of framePreflights) {
      if (preflight.tabId === tabId) framePreflights.delete(id);
    }
  }

  async function removeAllManagedPartitions() {
    return queue(() => removeAllManagedGrokPartitions(api));
  }

  function requestHandlers(request, dependencies = {}) {
    if (typeof dependencies.updateDnrRules !== "function") {
      throw new TypeError("Grok Cookie request handlers require updateDnrRules");
    }
    return [
      [request.PREPARE_FRAME_LOAD, async (message, sender) => {
        const preflightId = registerFramePreflight(message, sender);
        try {
          const cookieBridge = prepareSessionCookies(message.url, sender).catch(() => publicResult());
          await dependencies.updateDnrRules();
          return { grokCookieBridge: await cookieBridge };
        } finally {
          finishFramePreflight(preflightId);
        }
      }],
      [request.MARK_GROK_FRAME_PREFLIGHT_FALLBACK, (message, sender) => ({
        marked: markFramePreflightFallback(message, sender)
      })],
      [request.SYNC_GROK_SESSION_COOKIES, async (message, sender) => {
        if (message.bridgeVersion !== GROK_COOKIE_BRIDGE_VERSION) throw new Error("Grok Cookie bridge version is stale");
        const result = await syncForFrame(sender);
        const fallbackReload = consumeFallbackReload(sender?.tab?.id);
        return { ...publicResult(result), reloadRequired: result.changed === true || fallbackReload };
      }]
    ];
  }

  return Object.freeze({
    handleCookieChange,
    handleTabRemoved,
    removeAllManagedPartitions,
    requestHandlers,
    verifiedFrameSender
  });
}
