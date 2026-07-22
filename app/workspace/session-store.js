import {
  DEFAULT_WORKSPACE_SESSION_GENERATION,
  WORKSPACE_SESSION_GENERATION_KEY,
  WORKSPACE_SESSION_PAGE_KEY,
  WORKSPACE_SESSION_STORAGE_VERSION,
  createWorkspaceSessionId,
  normalizeWorkspaceSessionId,
  workspaceSessionBindingKey,
  workspaceSessionIdFromUrl,
  workspaceSessionMirrorKey,
  workspaceSessionUrl,
  workspaceSessionWorkspaceKey
} from "../../shared/workspace-session.js";

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
  sessionStorage = globalThis.sessionStorage,
  location = globalThis.location,
  history = globalThis.history,
  currentTab = null,
  currentTabId = null,
  claimWorkspaceSession = null,
  commitWorkspaceSession = null,
  storageGet = null,
  storageSet = null,
  storageRemove = null,
  createWorkspaceId = createWorkspaceSessionId,
  now = () => Date.now()
} = {}) {
  const initialWorkspaceId = workspaceSessionIdFromUrl(location?.href);
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

  function readPageValue() {
    try { return sessionStorage?.getItem?.(WORKSPACE_SESSION_PAGE_KEY) ?? null; }
    catch { return null; }
  }

  function removePageValue() {
    try {
      sessionStorage?.removeItem?.(WORKSPACE_SESSION_PAGE_KEY);
      return true;
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

  function installWorkspaceId(value) {
    const workspaceId = normalizeWorkspaceSessionId(value);
    if (!workspaceId) return "";
    resolvedWorkspaceId = workspaceId;
    const href = workspaceSessionUrl(location?.href, workspaceId);
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
    try { return { ok: true, value: await storageGet(key) }; }
    catch { return { ok: false, value: undefined }; }
  }

  async function safeStorageSet(key, value) {
    if (typeof storageSet !== "function") return false;
    try {
      await storageSet(key, value);
      return true;
    } catch {
      return false;
    }
  }

  async function safeStorageRemove(key) {
    if (!key || typeof storageRemove !== "function") return false;
    try {
      await storageRemove(key);
      return true;
    } catch {
      return false;
    }
  }

  function resolveGeneration({ refresh = false } = {}) {
    if (!refresh && resolvedGeneration) return Promise.resolve(resolvedGeneration);
    if (generationRun) return generationRun;
    const run = (async () => {
      const result = await safeStorageGet(WORKSPACE_SESSION_GENERATION_KEY);
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
      let value = null;
      try { value = typeof currentTab === "function" ? await currentTab() : currentTab; }
      catch {}
      let normalized = tabRecord(value);
      if (normalized.tabId === null) {
        try { value = typeof currentTabId === "function" ? await currentTabId() : currentTabId; }
        catch { value = null; }
        normalized = tabRecord(value);
      }
      resolvedTab = normalized;
      tabResolved = true;
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

  function ownerRecord(tab) {
    return {
      tabId: tab?.tabId ?? null,
      windowId: tab?.windowId ?? null,
      index: tab?.index ?? null,
      pinned: tab?.pinned === true
    };
  }

  function stableRecord(workspaceId, generation, snapshot, tab, timestamp) {
    return {
      storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
      generation,
      workspaceId,
      snapshot,
      owner: ownerRecord(tab),
      updatedAt: timestamp,
      detachedAt: null
    };
  }

  function bindingRecord(workspaceId, generation, tab, timestamp) {
    return {
      storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
      generation,
      workspaceId,
      ...ownerRecord(tab),
      updatedAt: timestamp,
      detachedAt: null
    };
  }

  async function claimNakedWorkspace() {
    if (initialWorkspaceId || typeof claimWorkspaceSession !== "function") return null;
    let response;
    try { response = await claimWorkspaceSession({ workspaceId: "" }); }
    catch { return null; }
    if (!plainObject(response) || response.claimed !== true) return null;
    const workspaceId = normalizeWorkspaceSessionId(response.workspaceId);
    if (!workspaceId) return null;
    const generation = generationValue(response.workspaceSessionGeneration);
    if (generation) resolvedGeneration = generation;
    installWorkspaceId(workspaceId);
    const snapshot = snapshotRecord(response.snapshot);
    pendingClaim = {
      workspaceId,
      claimId: String(response.claimId || response.claimToken || "").trim()
    };
    return snapshot ? snapshotWithGeneration(snapshot, resolvedGeneration || DEFAULT_WORKSPACE_SESSION_GENERATION) : null;
  }

  async function load() {
    const pageValue = readPageValue();
    const targetGeneration = await resolveGeneration({ refresh: true });
    const page = envelopeRecord(pageValue, targetGeneration, initialWorkspaceId);
    if (page) {
      const workspaceId = installWorkspaceId(page.workspaceId || initialWorkspaceId || ensureWorkspaceId());
      const snapshot = snapshotWithGeneration(page.snapshot, targetGeneration);
      writePageValue(snapshot, targetGeneration, workspaceId);
      return snapshot;
    }
    if (pageValue !== null) removePageValue();

    const urlWorkspaceId = resolvedWorkspaceId || initialWorkspaceId;
    if (urlWorkspaceId) {
      installWorkspaceId(urlWorkspaceId);
      const stableResult = await safeStorageGet(workspaceSessionWorkspaceKey(urlWorkspaceId));
      const stable = stableResult.ok
        ? envelopeRecord(stableResult.value, targetGeneration, urlWorkspaceId)
        : null;
      if (stable) {
        const snapshot = snapshotWithGeneration(stable.snapshot, targetGeneration);
        writePageValue(snapshot, targetGeneration, urlWorkspaceId);
        return snapshot;
      }
      return null;
    }

    const tab = await resolveCurrentTab();
    if (tab.tabId !== null) {
      const key = workspaceSessionMirrorKey(tab.tabId);
      const legacyResult = await safeStorageGet(key);
      const legacy = legacyResult.ok ? envelopeRecord(legacyResult.value, targetGeneration) : null;
      if (legacy) {
        legacySourceKey = key;
        const workspaceId = ensureWorkspaceId();
        const snapshot = snapshotWithGeneration(legacy.snapshot, targetGeneration);
        writePageValue(snapshot, targetGeneration, workspaceId);
        return snapshot;
      }
    }

    const claimedSnapshot = await claimNakedWorkspace();
    if (resolvedWorkspaceId) {
      if (claimedSnapshot) writePageValue(claimedSnapshot, resolvedGeneration, resolvedWorkspaceId);
      return claimedSnapshot;
    }

    ensureWorkspaceId();
    return null;
  }

  async function clearLegacySource() {
    if (legacySourceKey) await safeStorageRemove(legacySourceKey);
    legacySourceKey = "";
  }

  function save(snapshot) {
    const record = snapshotRecord(snapshot);
    if (!record) return Promise.resolve(false);
    const workspaceId = ensureWorkspaceId();
    const synchronousGeneration = resolvedGeneration || DEFAULT_WORKSPACE_SESSION_GENERATION;
    const synchronousSnapshot = snapshotWithGeneration(record, synchronousGeneration);
    const targetOperation = ++operation;
    writePageValue(synchronousSnapshot, synchronousGeneration, workspaceId);

    return enqueue(async () => {
      if (targetOperation !== operation) return false;
      const generation = await resolveGeneration();
      if (targetOperation !== operation) return false;
      const normalizedSnapshot = snapshotWithGeneration(record, generation);
      writePageValue(normalizedSnapshot, generation, workspaceId);
      const tab = await resolveCurrentTab();
      if (targetOperation !== operation) return false;
      const timestamp = Number(now()) || Date.now();
      const stableSaved = await safeStorageSet(
        workspaceSessionWorkspaceKey(workspaceId),
        stableRecord(workspaceId, generation, normalizedSnapshot, tab, timestamp)
      );
      if (!stableSaved || targetOperation !== operation) return false;
      if (tab.tabId !== null) {
        const bindingSaved = await safeStorageSet(
          workspaceSessionBindingKey(tab.tabId),
          bindingRecord(workspaceId, generation, tab, timestamp)
        );
        if (!bindingSaved || targetOperation !== operation) return false;
      }
      await clearLegacySource();
      if (targetOperation !== operation) return false;
      if (pendingClaim?.workspaceId === workspaceId && typeof commitWorkspaceSession === "function") {
        let response;
        try { response = await commitWorkspaceSession({ workspaceId, claimId: pendingClaim.claimId }); }
        catch { return false; }
        if (targetOperation !== operation) return false;
        if (!plainObject(response) || response.committed !== false) pendingClaim = null;
      }
      return true;
    });
  }

  function clear() {
    const targetOperation = ++operation;
    pendingClaim = null;
    removePageValue();
    return enqueue(async () => {
      if (targetOperation !== operation) return false;
      const workspaceId = resolvedWorkspaceId || initialWorkspaceId;
      const tab = await resolveCurrentTab();
      if (targetOperation !== operation) return false;
      if (workspaceId) await safeStorageRemove(workspaceSessionWorkspaceKey(workspaceId));
      if (tab.tabId !== null) {
        await safeStorageRemove(workspaceSessionBindingKey(tab.tabId));
        await safeStorageRemove(workspaceSessionMirrorKey(tab.tabId));
      }
      if (legacySourceKey) await safeStorageRemove(legacySourceKey);
      legacySourceKey = "";
      return targetOperation === operation;
    });
  }

  async function flush() {
    while (true) {
      const pending = writeChain;
      await pending.catch(() => {});
      if (pending === writeChain) return;
    }
  }

  function generation() {
    return resolvedGeneration || DEFAULT_WORKSPACE_SESSION_GENERATION;
  }

  function workspaceId() {
    return resolvedWorkspaceId || initialWorkspaceId;
  }

  return Object.freeze({ load, save, clear, flush, generation, workspaceId });
}
