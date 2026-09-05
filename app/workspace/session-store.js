import {
  DEFAULT_WORKSPACE_SESSION_GENERATION,
  WORKSPACE_SESSION_GENERATION_KEY,
  WORKSPACE_SESSION_OPENING_CLAIM_TIMEOUT_MS,
  WORKSPACE_SESSION_PAGE_KEY,
  createWorkspaceSessionId,
  normalizeWorkspaceSessionId,
  workspaceSessionOpeningClaimIdFromUrl,
  workspaceSessionIdFromUrl,
  workspaceSessionLegacyWorkspaceId,
  workspaceSessionMirrorKey,
  workspaceSessionUrlWithoutOpeningClaim,
  workspaceSessionUrl,
  workspaceSessionWorkspaceKey
} from "../../shared/workspace-session.js";
import { snapshotWithRetainedConversation, workspaceSnapshotIsRememberable } from "../../shared/workspace-tab-memory.js";

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function generationValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveTabId(value) {
  const tabId = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(tabId) && tabId > 0 ? tabId : null;
}

function tabRecord(value) {
  if (typeof value === "number") return { tabId: positiveTabId(value) };
  if (!plainObject(value)) return { tabId: null };
  const tabId = positiveTabId(value.id ?? value.tabId);
  const windowId = Number.isSafeInteger(value.windowId) ? value.windowId : null;
  const index = Number.isSafeInteger(value.index) && value.index >= 0 ? value.index : null;
  return {
    tabId,
    windowId,
    index,
    pinned: value.pinned === true
  };
}

function snapshotRecord(value) {
  if (!plainObject(value)) return null;
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return null;
    const snapshot = JSON.parse(serialized);
    return plainObject(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

function envelopeRecord(value, expectedGeneration = "", expectedWorkspaceId = "") {
  let source = value;
  if (typeof source === "string") {
    try { source = JSON.parse(source); }
    catch { return null; }
  }
  if (!plainObject(source)) return null;
  const generation = generationValue(source.generation);
  if (!generation || (expectedGeneration && generation !== expectedGeneration)) return null;
  const workspaceId = normalizeWorkspaceSessionId(source.workspaceId);
  if (expectedWorkspaceId && workspaceId !== expectedWorkspaceId) return null;
  const snapshot = snapshotRecord(source.snapshot);
  return snapshot ? { generation, workspaceId, snapshot } : null;
}

function snapshotWithGeneration(snapshot, generation) {
  return { ...snapshot, generation };
}

function envelopeJson(generation, workspaceId, snapshot) {
  try { return JSON.stringify({ generation, workspaceId, snapshot }); }
  catch { return ""; }
}

/**
 * Keeps the latest workspace snapshot synchronously in the page session and
 * durably under an opaque workspace id. Browser tab ids remain only as owner
 * metadata and as a one-release legacy migration path.
 */
export function createWorkspaceSessionStore({
  disabled = false,
  sessionStorage = globalThis.sessionStorage,
  location = globalThis.location,
  history = globalThis.history,
  currentTab = null,
  currentTabId = null,
  claimWorkspaceSession = null,
  commitWorkspaceSession = null,
  persistWorkspaceSession = null,
  storageGet = null,
  storageRemove = null,
  createWorkspaceId = createWorkspaceSessionId,
  requestTimeoutMs = 3000,
  openingClaimRequestTimeoutMs = WORKSPACE_SESSION_OPENING_CLAIM_TIMEOUT_MS,
  retryDelaysMs = [500, 1500, 5000, 10_000, 20_000],
  scheduleTimeout = globalThis.setTimeout,
  cancelTimeout = globalThis.clearTimeout
} = {}) {
  const inactive = disabled === true;
  const initialWorkspaceId = inactive ? "" : workspaceSessionIdFromUrl(location?.href);
  const initialOpeningClaimId = inactive ? "" : workspaceSessionOpeningClaimIdFromUrl(location?.href);
  let resolvedWorkspaceId = initialWorkspaceId;
  let resolvedGeneration = "";
  let generationRun = null;
  let resolvedTab = null;
  let tabResolved = false;
  let tabRun = null;
  let legacySourceKey = "";
  let pendingClaim = null;
  let operation = 0;
  let writeChain = Promise.resolve();
  let dirtySnapshot = null;
  let retryTimer = null;
  let retryFailures = 0;
  let lastDurableSnapshot = null;
  const STORAGE_ATTEMPTS = 3;
  const REQUEST_TIMEOUT_MS = Math.max(50, Number(requestTimeoutMs) || 3000);
  const OPENING_CLAIM_REQUEST_TIMEOUT_MS = Math.max(
    REQUEST_TIMEOUT_MS,
    Number(openingClaimRequestTimeoutMs) || WORKSPACE_SESSION_OPENING_CLAIM_TIMEOUT_MS
  );
  const RETRY_DELAYS_MS = (Array.isArray(retryDelaysMs) ? retryDelaysMs : [])
    .map((value) => Math.max(0, Number(value) || 0));

  async function requestWithDeadline(factory, label, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (typeof factory !== "function") throw new TypeError(`${label} is unavailable`);
    if (typeof scheduleTimeout !== "function" || typeof cancelTimeout !== "function") return factory();
    const deadlineMs = Math.max(50, Number(timeoutMs) || REQUEST_TIMEOUT_MS);
    let timeoutId = null;
    try {
      return await Promise.race([
        Promise.resolve().then(factory),
        new Promise((_, reject) => {
          timeoutId = scheduleTimeout(() => reject(new Error(`${label} timed out`)), deadlineMs);
        })
      ]);
    } finally {
      if (timeoutId !== null) cancelTimeout(timeoutId);
    }
  }

  function readPageValue() {
    try { return sessionStorage?.getItem?.(WORKSPACE_SESSION_PAGE_KEY) ?? null; }
    catch { return null; }
  }

  function removePageValue() {
    try {
      if (typeof sessionStorage?.removeItem !== "function" || typeof sessionStorage?.getItem !== "function") {
        return false;
      }
      sessionStorage.removeItem(WORKSPACE_SESSION_PAGE_KEY);
      return sessionStorage.getItem(WORKSPACE_SESSION_PAGE_KEY) === null;
    } catch {
      return false;
    }
  }

  function writePageValue(snapshot, targetGeneration, targetWorkspaceId) {
    const serialized = envelopeJson(targetGeneration, targetWorkspaceId, snapshot);
    if (!serialized) return false;
    try {
      sessionStorage?.setItem?.(WORKSPACE_SESSION_PAGE_KEY, serialized);
      return true;
    } catch {
      return false;
    }
  }

  function installWorkspaceId(value, { removeOpeningClaim = false } = {}) {
    const workspaceId = normalizeWorkspaceSessionId(value);
    if (!workspaceId) return "";
    resolvedWorkspaceId = workspaceId;
    let href = workspaceSessionUrl(location?.href, workspaceId);
    if (removeOpeningClaim) href = workspaceSessionUrlWithoutOpeningClaim(href);
    if (href) {
      try { history?.replaceState?.(history?.state ?? null, "", href); }
      catch {}
    }
    return workspaceId;
  }

  function ensureWorkspaceId() {
    if (resolvedWorkspaceId) return resolvedWorkspaceId;
    let workspaceId = "";
    try { workspaceId = normalizeWorkspaceSessionId(createWorkspaceId()); }
    catch {}
    return installWorkspaceId(workspaceId || createWorkspaceSessionId());
  }

  async function safeStorageGet(key) {
    if (typeof storageGet !== "function") return { ok: false, value: undefined };
    let error = null;
    for (let attempt = 0; attempt < STORAGE_ATTEMPTS; attempt += 1) {
      try {
        return {
          ok: true,
          value: await requestWithDeadline(() => storageGet(key), "Workspace session storage read")
        };
      }
      catch (caught) { error = caught; }
    }
    return { ok: false, value: undefined, error };
  }

  async function safeStorageRemove(key) {
    if (!key || typeof storageRemove !== "function") return false;
    for (let attempt = 0; attempt < STORAGE_ATTEMPTS; attempt += 1) {
      try {
        await storageRemove(key);
        return true;
      } catch {}
    }
    return false;
  }

  function resolveGeneration({ refresh = false } = {}) {
    if (!refresh && resolvedGeneration) return Promise.resolve(resolvedGeneration);
    if (generationRun) return generationRun;
    const run = (async () => {
      const result = await safeStorageGet(WORKSPACE_SESSION_GENERATION_KEY);
      if (!result.ok && typeof storageGet === "function") {
        throw result.error || new Error("Workspace session generation could not be read");
      }
      const generation = generationValue(result.value);
      resolvedGeneration = generation || DEFAULT_WORKSPACE_SESSION_GENERATION;
      return resolvedGeneration;
    })();
    const wrapped = run.finally(() => {
      if (generationRun === wrapped) generationRun = null;
    });
    generationRun = wrapped;
    return wrapped;
  }

  function resolveCurrentTab() {
    if (tabResolved) return Promise.resolve(resolvedTab);
    if (tabRun) return tabRun;
    const run = (async () => {
      let normalized = tabRecord(null);
      let lastError = null;
      for (const [source, label] of [
        [currentTab, "Workspace session current tab query"],
        [currentTabId, "Workspace session current tab id query"]
      ]) {
        if (source === null || source === undefined) continue;
        let value = source;
        try {
          if (typeof source === "function") value = await requestWithDeadline(source, label);
        } catch (error) {
          lastError = error;
          continue;
        }
        normalized = tabRecord(value);
        if (normalized.tabId !== null) break;
      }
      if (normalized.tabId === null && lastError) {
        throw new Error("Workspace session current browser tab could not be resolved", { cause: lastError });
      }
      resolvedTab = normalized;
      tabResolved = normalized.tabId !== null;
      return resolvedTab;
    })();
    tabRun = run.finally(() => { tabRun = null; });
    return tabRun;
  }

  function enqueue(task) {
    const queued = writeChain
      .catch(() => {})
      .then(task)
      .catch(() => false);
    writeChain = queued.then(() => undefined, () => undefined);
    return queued;
  }

  async function claimTokenizedWorkspace() {
    if (!initialWorkspaceId || typeof claimWorkspaceSession !== "function") return null;
    let response;
    try {
      response = await requestWithDeadline(
        () => claimWorkspaceSession({
          workspaceId: initialWorkspaceId,
          ...(initialOpeningClaimId ? { openingClaimId: initialOpeningClaimId } : {})
        }),
        "Workspace session ownership claim",
        initialOpeningClaimId ? OPENING_CLAIM_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS
      );
    }
    catch (error) { throw new Error("Workspace session ownership could not be claimed", { cause: error }); }
    if (!plainObject(response) || response.claimed !== true) {
      throw new Error("Workspace session ownership claim was rejected");
    }
    const returnedWorkspaceId = normalizeWorkspaceSessionId(response.workspaceId);
    if (!returnedWorkspaceId) throw new Error("Workspace session ownership claim returned an invalid id");
    const forked = response.forked === true;
    if (returnedWorkspaceId !== initialWorkspaceId && !forked && response.reboundFromStaleUrl !== true) {
      throw new Error("Workspace session ownership claim returned a mismatched id");
    }
    const generation = generationValue(response.workspaceSessionGeneration);
    if (generation) resolvedGeneration = generation;
    const claimId = String(response.claimId || response.claimToken || "").trim();
    if (response.recovered === true && !claimId) {
      throw new Error("Workspace session ownership claim returned no lease id");
    }
    installWorkspaceId(returnedWorkspaceId, { removeOpeningClaim: Boolean(initialOpeningClaimId) });
    if (claimId) pendingClaim = { workspaceId: returnedWorkspaceId, claimId };
    return {
      forked,
      generation,
      snapshot: snapshotRecord(response.snapshot),
      workspaceId: returnedWorkspaceId
    };
  }

  async function claimNakedWorkspace() {
    if (initialWorkspaceId || typeof claimWorkspaceSession !== "function") return null;
    let response;
    try {
      response = await requestWithDeadline(
        () => claimWorkspaceSession({ workspaceId: "" }),
        "Workspace session recovery claim"
      );
    }
    catch (error) { throw new Error("Workspace session recovery could not be claimed", { cause: error }); }
    if (!plainObject(response) || typeof response.claimed !== "boolean") {
      throw new Error("Workspace session recovery claim returned an invalid response");
    }
    if (response.claimed !== true) return { claimed: false, snapshot: null, workspaceId: "" };
    if (response.forked === true) throw new Error("Workspace session recovery claim unexpectedly forked");
    const workspaceId = normalizeWorkspaceSessionId(response.workspaceId);
    if (!workspaceId) throw new Error("Workspace session recovery claim returned an invalid id");
    const generation = generationValue(response.workspaceSessionGeneration);
    if (generation) resolvedGeneration = generation;
    const snapshot = snapshotRecord(response.snapshot);
    const claimId = String(response.claimId || response.claimToken || "").trim();
    if (response.recovered === true && !claimId) {
      throw new Error("Workspace session recovery claim returned no lease id");
    }
    installWorkspaceId(workspaceId);
    if (claimId) pendingClaim = { workspaceId, claimId };
    return {
      claimed: true,
      snapshot: snapshot ? snapshotWithGeneration(snapshot, resolvedGeneration || DEFAULT_WORKSPACE_SESSION_GENERATION) : null,
      workspaceId
    };
  }

  async function claimLegacyPageWorkspace(workspaceId) {
    if (!workspaceId || typeof claimWorkspaceSession !== "function") return null;
    let response;
    try {
      response = await requestWithDeadline(
        () => claimWorkspaceSession({ workspaceId }),
        "Workspace session legacy ownership claim"
      );
    }
    catch (error) { throw new Error("Workspace session legacy ownership could not be claimed", { cause: error }); }
    if (!plainObject(response) || response.claimed !== true) {
      throw new Error("Workspace session legacy ownership claim was rejected");
    }
    const returnedWorkspaceId = normalizeWorkspaceSessionId(response.workspaceId);
    if (!returnedWorkspaceId) throw new Error("Workspace session legacy ownership claim returned an invalid id");
    if (response.forked === true || returnedWorkspaceId !== workspaceId) {
      throw new Error("Workspace session legacy ownership claim returned a mismatched id");
    }
    const generation = generationValue(response.workspaceSessionGeneration);
    if (generation) resolvedGeneration = generation;
    const claimId = String(response.claimId || response.claimToken || "").trim();
    if (response.recovered === true && !claimId) {
      throw new Error("Workspace session legacy ownership claim returned no lease id");
    }
    if (claimId) pendingClaim = { workspaceId, claimId };
    return { generation, workspaceId };
  }

  async function commitPendingWorkspaceClaim(workspaceId, isCurrent = () => true) {
    if (pendingClaim?.workspaceId !== workspaceId || typeof commitWorkspaceSession !== "function") return true;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!isCurrent()) return false;
      const claim = pendingClaim;
      let response = null;
      try {
        response = await commitWorkspaceSession({ workspaceId, claimId: claim.claimId });
      }
      catch {}
      if (plainObject(response) && response.committed === true) {
        pendingClaim = null;
        return true;
      }
      if (!isCurrent() || attempt > 0 || typeof claimWorkspaceSession !== "function") return false;
      let reclaimed = null;
      try {
        reclaimed = await claimWorkspaceSession({ workspaceId });
      }
      catch { return false; }
      const reclaimedWorkspaceId = normalizeWorkspaceSessionId(reclaimed?.workspaceId);
      if (
        !plainObject(reclaimed)
        || reclaimed.claimed !== true
        || reclaimed.forked === true
        || reclaimedWorkspaceId !== workspaceId
      ) return false;
      const claimId = String(reclaimed.claimId || reclaimed.claimToken || "").trim();
      if (reclaimed.recovered === true && !claimId) return false;
      if (!claimId) {
        pendingClaim = null;
        return true;
      }
      pendingClaim = { workspaceId, claimId };
    }
    return false;
  }

  async function persistWorkspace(workspaceId, snapshot = null, clear = false, isCurrent = () => true) {
    if (typeof persistWorkspaceSession !== "function") return false;
    for (let attempt = 0; attempt < STORAGE_ATTEMPTS; attempt += 1) {
      if (!isCurrent()) return false;
      try {
        const response = await persistWorkspaceSession({ workspaceId, snapshot, clear });
        const returnedWorkspaceId = normalizeWorkspaceSessionId(response?.workspaceId);
        if (
          plainObject(response)
          && response.persisted === true
          && returnedWorkspaceId === workspaceId
          && (!clear || response.cleared === true)
        ) {
          const generation = generationValue(response.workspaceSessionGeneration);
          if (generation) resolvedGeneration = generation;
          return true;
        }
      } catch {}
    }
    return false;
  }

  function cancelDirtyRetry() {
    if (retryTimer !== null && typeof cancelTimeout === "function") cancelTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleDirtyRetry(target) {
    if (target !== dirtySnapshot || retryTimer !== null || !RETRY_DELAYS_MS.length) return;
    const delay = RETRY_DELAYS_MS[Math.min(retryFailures - 1, RETRY_DELAYS_MS.length - 1)];
    retryTimer = scheduleTimeout(() => {
      retryTimer = null;
      const current = dirtySnapshot;
      if (!current) return;
      enqueue(() => persistDirtySnapshot(current));
    }, delay);
    retryTimer?.unref?.();
  }

  function stageDirtyState(workspaceId, snapshot, { clear = false, pageRemoved = false } = {}) {
    cancelDirtyRetry();
    retryFailures = 0;
    const target = { operation: ++operation, workspaceId, snapshot, clear, pageRemoved };
    dirtySnapshot = target;
    return target;
  }

  async function persistDirtySnapshot(target) {
    if (target !== dirtySnapshot || target.operation !== operation) return false;
    let persisted = false;
    try {
      const isCurrent = () => target === dirtySnapshot && target.operation === operation;
      if (target.clear) {
        if (!target.pageRemoved) target.pageRemoved = removePageValue();
        if (!target.pageRemoved || !isCurrent()) return false;
        if (
          target.workspaceId
          && !await persistWorkspace(target.workspaceId, null, true, isCurrent)
        ) return false;
        if (!isCurrent()) return false;
        await clearLegacySource();
        if (!isCurrent()) return false;
        pendingClaim = null;
        persisted = true;
        return true;
      }
      const generation = await resolveGeneration();
      if (target !== dirtySnapshot || target.operation !== operation) return false;
      const normalizedSnapshot = snapshotWithGeneration(target.snapshot, generation);
      writePageValue(normalizedSnapshot, generation, target.workspaceId);
      if (!await persistWorkspace(target.workspaceId, normalizedSnapshot, false, isCurrent)) return false;
      if (target !== dirtySnapshot || target.operation !== operation) return false;
      await clearLegacySource();
      if (target !== dirtySnapshot || target.operation !== operation) return false;
      if (!await commitPendingWorkspaceClaim(target.workspaceId, isCurrent)) return false;
      if (target !== dirtySnapshot || target.operation !== operation) return false;
      persisted = true;
      return true;
    } finally {
      if (target === dirtySnapshot && target.operation === operation) {
        if (persisted) {
          dirtySnapshot = null;
          retryFailures = 0;
          cancelDirtyRetry();
        } else {
          retryFailures += 1;
          scheduleDirtyRetry(target);
        }
      }
    }
  }

  async function persistLoadedPageSnapshot(workspaceId, snapshot) {
    const target = stageDirtyState(workspaceId, snapshotRecord(snapshot));
    if (!target.snapshot || !await enqueue(() => persistDirtySnapshot(target))) {
      throw new Error("Workspace session page snapshot could not be persisted");
    }
    return snapshot;
  }

  async function load() {
    if (inactive) return null;
    const tokenClaim = await claimTokenizedWorkspace();
    const pageValue = readPageValue();
    const targetGeneration = tokenClaim?.generation || await resolveGeneration({ refresh: !resolvedGeneration });
    const page = envelopeRecord(pageValue, targetGeneration, initialWorkspaceId);
    if (page) {
      let workspaceId = tokenClaim?.workspaceId || page.workspaceId || initialWorkspaceId;
      let pageGeneration = targetGeneration;
      if (!workspaceId) {
        const tab = await resolveCurrentTab();
        const legacyWorkspaceId = workspaceSessionLegacyWorkspaceId(tab.tabId);
        if (legacyWorkspaceId) {
          const legacyClaim = await claimLegacyPageWorkspace(legacyWorkspaceId);
          workspaceId = legacyClaim?.workspaceId || legacyWorkspaceId;
          if (legacyClaim?.generation && legacyClaim.generation !== targetGeneration) {
            throw new Error("Workspace session generation changed during legacy migration");
          }
          pageGeneration = legacyClaim?.generation || targetGeneration;
        } else if (typeof claimWorkspaceSession === "function") {
          throw new Error("Workspace session legacy migration requires the current browser tab");
        } else {
          workspaceId = ensureWorkspaceId();
        }
      }
      workspaceId = installWorkspaceId(workspaceId);
      const snapshot = snapshotWithGeneration(
        snapshotWithRetainedConversation(tokenClaim?.snapshot, page.snapshot) || page.snapshot,
        pageGeneration
      );
      lastDurableSnapshot = snapshotRecord(snapshot);
      writePageValue(snapshot, pageGeneration, workspaceId);
      return persistLoadedPageSnapshot(workspaceId, snapshot);
    }
    if (pageValue !== null) removePageValue();

    const urlWorkspaceId = resolvedWorkspaceId || initialWorkspaceId;
    if (urlWorkspaceId) {
      installWorkspaceId(urlWorkspaceId);
      if (tokenClaim?.snapshot) {
        const snapshot = snapshotWithGeneration(tokenClaim.snapshot, targetGeneration);
        lastDurableSnapshot = snapshotRecord(snapshot);
        writePageValue(snapshot, targetGeneration, urlWorkspaceId);
        return snapshot;
      }
      const stableResult = await safeStorageGet(workspaceSessionWorkspaceKey(urlWorkspaceId));
      if (!stableResult.ok && typeof storageGet === "function") {
        throw stableResult.error || new Error("Workspace session snapshot could not be read");
      }
      const stable = stableResult.ok
        ? envelopeRecord(stableResult.value, targetGeneration, urlWorkspaceId)
        : null;
      if (stable) {
        const snapshot = snapshotWithGeneration(stable.snapshot, targetGeneration);
        lastDurableSnapshot = snapshotRecord(snapshot);
        writePageValue(snapshot, targetGeneration, urlWorkspaceId);
        return snapshot;
      }
      return null;
    }

    const nakedClaim = await claimNakedWorkspace();
    if (nakedClaim?.claimed) {
      if (nakedClaim.snapshot) {
        writePageValue(nakedClaim.snapshot, resolvedGeneration, nakedClaim.workspaceId);
        lastDurableSnapshot = snapshotRecord(nakedClaim.snapshot);
        return persistLoadedPageSnapshot(nakedClaim.workspaceId, nakedClaim.snapshot);
      }
      return null;
    }

    const tab = await resolveCurrentTab();
    if (tab.tabId !== null) {
      const key = workspaceSessionMirrorKey(tab.tabId);
      const legacyResult = await safeStorageGet(key);
      if (!legacyResult.ok && typeof storageGet === "function") {
        throw legacyResult.error || new Error("Workspace session legacy snapshot could not be read");
      }
      const legacy = legacyResult.ok ? envelopeRecord(legacyResult.value, targetGeneration) : null;
      if (legacy) {
        legacySourceKey = key;
        const workspaceId = installWorkspaceId(workspaceSessionLegacyWorkspaceId(tab.tabId) || ensureWorkspaceId());
        const snapshot = snapshotWithGeneration(legacy.snapshot, targetGeneration);
        writePageValue(snapshot, targetGeneration, workspaceId);
        lastDurableSnapshot = snapshotRecord(snapshot);
        return persistLoadedPageSnapshot(workspaceId, snapshot);
      }
    }

    ensureWorkspaceId();
    return null;
  }

  async function clearLegacySource() {
    if (legacySourceKey) await safeStorageRemove(legacySourceKey);
    legacySourceKey = "";
  }

  function save(snapshot) {
    if (inactive) return Promise.resolve(true);
    const record = snapshotRecord(snapshot);
    if (!record) return Promise.resolve(false);
    const retained = snapshotRecord(snapshotWithRetainedConversation(lastDurableSnapshot, record)) || record;
    if (workspaceSnapshotIsRememberable(retained)) lastDurableSnapshot = retained;
    const workspaceId = ensureWorkspaceId();
    const synchronousGeneration = resolvedGeneration || DEFAULT_WORKSPACE_SESSION_GENERATION;
    const synchronousSnapshot = snapshotWithGeneration(retained, synchronousGeneration);
    const target = stageDirtyState(workspaceId, retained);
    writePageValue(synchronousSnapshot, synchronousGeneration, workspaceId);
    return enqueue(() => persistDirtySnapshot(target));
  }

  function clear() {
    if (inactive) return Promise.resolve(true);
    lastDurableSnapshot = null;
    const workspaceId = resolvedWorkspaceId || initialWorkspaceId;
    const target = stageDirtyState(workspaceId, null, {
      clear: true,
      pageRemoved: removePageValue()
    });
    return enqueue(() => persistDirtySnapshot(target));
  }

  async function flush() {
    if (inactive) return true;
    while (true) {
      const pending = writeChain;
      await pending.catch(() => {});
      if (pending === writeChain) break;
    }
    const target = dirtySnapshot;
    if (!target) return true;
    cancelDirtyRetry();
    await enqueue(() => persistDirtySnapshot(target));
    while (true) {
      const pending = writeChain;
      await pending.catch(() => {});
      if (pending === writeChain) break;
    }
    return dirtySnapshot === null;
  }

  function generation() {
    return resolvedGeneration || DEFAULT_WORKSPACE_SESSION_GENERATION;
  }

  function workspaceId() {
    if (inactive) return "";
    return resolvedWorkspaceId || initialWorkspaceId;
  }

  function durableSnapshot() {
    if (inactive || !plainObject(lastDurableSnapshot)) return null;
    try {
      return JSON.parse(JSON.stringify(lastDurableSnapshot));
    } catch {
      return null;
    }
  }

  function adopt(workspaceId) {
    if (inactive) return "";
    lastDurableSnapshot = null;
    return installWorkspaceId(workspaceId);
  }

  return Object.freeze({ load, save, clear, flush, generation, workspaceId, adopt, durableSnapshot });
}
