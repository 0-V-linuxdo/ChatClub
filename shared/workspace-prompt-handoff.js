export const WORKSPACE_PROMPT_HANDOFF_VERSION = 1;
export const WORKSPACE_PROMPT_HANDOFF_TTL_MS = 5 * 60 * 1000;
export const WORKSPACE_PROMPT_HANDOFF_MAX_ENTRIES = 8;
export const WORKSPACE_PROMPT_HANDOFF_ALARM = "chatclub-workspace-prompt-handoff-expiry-v1";
const WORKSPACE_PROMPT_SESSION_THRESHOLD_BYTES = 4 * 1024 * 1024;
export const WORKSPACE_PROMPT_HANDOFF_SETTLED_ACTION = "workspacePromptHandoffSettled";

const PAYLOAD_SESSION_PREFIX = "chatclubWorkspacePromptPayloadV1:";
const PAYLOAD_DATABASE_NAME = "chatclub-workspace-prompt-handoff-v1";
const PAYLOAD_OBJECT_STORE = "payloads";
const PAYLOAD_METADATA_OBJECT_STORE = "payloadMetadata";
const PAYLOAD_DATABASE_VERSION = 2;
const LOCATOR_BACKENDS = new Set(["session", "indexeddb"]);

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionCompletion(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
  });
}

export function normalizeWorkspacePromptHandoffId(value) {
  const handoffId = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{15,191}$/.test(handoffId) ? handoffId : "";
}

export function createWorkspacePromptHandoffId(prefix = "prompt-handoff") {
  const normalizedPrefix = String(prefix || "prompt-handoff").trim().replace(/[^A-Za-z0-9._:-]+/g, "-");
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `${normalizedPrefix}-${uuid}`;
  } catch {}
  return `${normalizedPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizePromptImage(value) {
  if (!plainObject(value)) return null;
  const dataUrl = String(value.dataUrl || value.dataURL || "").trim();
  if (!/^data:image\/[A-Za-z0-9.+-]+(?:;[^,]*)?,/i.test(dataUrl)) return null;
  const type = String(value.type || dataUrl.match(/^data:([^;,]+)/i)?.[1] || "image/png").trim().toLowerCase();
  if (!type.startsWith("image/")) return null;
  const size = finiteInteger(value.size) ?? 0;
  const lastModified = Number(value.lastModified);
  return {
    id: String(value.id || "").trim(),
    name: String(value.name || "").trim().replace(/[\\/]+/g, "_"),
    type,
    size,
    lastModified: Number.isFinite(lastModified) && lastModified >= 0 ? lastModified : 0,
    dataUrl
  };
}

function normalizeAppIdGroups(value) {
  if (!Array.isArray(value)) return null;
  const groups = [];
  for (const group of value) {
    if (!Array.isArray(group) || group.length !== 1) return null;
    const appId = String(group[0] || "").trim();
    if (!appId || appId.length > 191) return null;
    groups.push([appId]);
  }
  return groups;
}

function normalizeWorkspacePromptPayload(value) {
  if (!plainObject(value)) return null;
  const text = String(value.text || "");
  if (!Array.isArray(value.images)) return null;
  const images = value.images.map(normalizePromptImage);
  if (images.some((image) => !image)) return null;
  const appIdGroups = normalizeAppIdGroups(value.appIdGroups);
  if (!appIdGroups || (!text.trim() && !images.length)) return null;
  return { text, images, appIdGroups };
}

function workspacePromptPayloadByteLength(value) {
  const serialized = JSON.stringify(value);
  return new TextEncoder().encode(serialized).byteLength;
}

function workspacePromptPayloadSessionKey(handoffId) {
  const normalized = normalizeWorkspacePromptHandoffId(handoffId);
  if (!normalized) throw new TypeError("Workspace prompt handoff id is invalid");
  return `${PAYLOAD_SESSION_PREFIX}${normalized}`;
}

export function normalizeWorkspacePromptPayloadLocator(value, options = {}) {
  if (!plainObject(value)) return null;
  const allowedFields = new Set([
    "version", "backend", "handoffId", "byteLength", "createdAt", "expiresAt",
    ...(options.allowEnvelope === true ? ["payload"] : [])
  ]);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) return null;
  const handoffId = normalizeWorkspacePromptHandoffId(value.handoffId);
  const backend = String(value.backend || "").trim().toLowerCase();
  const version = finiteInteger(value.version);
  const byteLength = finiteInteger(value.byteLength);
  const createdAt = finiteInteger(value.createdAt);
  const expiresAt = finiteInteger(value.expiresAt);
  if (
    version !== WORKSPACE_PROMPT_HANDOFF_VERSION
    || !handoffId
    || !LOCATOR_BACKENDS.has(backend)
    || byteLength === null
    || byteLength <= 0
    || createdAt === null
    || expiresAt === null
    || expiresAt <= createdAt
    || expiresAt > createdAt + WORKSPACE_PROMPT_HANDOFF_TTL_MS
  ) return null;
  const current = Number(options.now);
  if (Number.isFinite(current) && options.allowExpired !== true && expiresAt <= current) return null;
  return {
    version: WORKSPACE_PROMPT_HANDOFF_VERSION,
    backend,
    handoffId,
    byteLength,
    createdAt,
    expiresAt
  };
}

function payloadMetadata(value = {}) {
  return {
    version: value.version,
    backend: value.backend,
    handoffId: value.handoffId,
    byteLength: value.byteLength,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt
  };
}

function createWorkspacePromptIndexedDbBackend(indexedDbApi = globalThis.indexedDB) {
  let databasePromise = null;

  function database() {
    if (databasePromise) return databasePromise;
    if (!indexedDbApi?.open) return Promise.reject(new Error("IndexedDB is unavailable"));
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDbApi.open(PAYLOAD_DATABASE_NAME, PAYLOAD_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PAYLOAD_OBJECT_STORE)) {
          db.createObjectStore(PAYLOAD_OBJECT_STORE, { keyPath: "handoffId" });
        }
        if (!db.objectStoreNames.contains(PAYLOAD_METADATA_OBJECT_STORE)) {
          const metadataStore = db.createObjectStore(PAYLOAD_METADATA_OBJECT_STORE, { keyPath: "handoffId" });
          const payloadStore = request.transaction.objectStore(PAYLOAD_OBJECT_STORE);
          const cursorRequest = payloadStore.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            metadataStore.put(payloadMetadata(cursor.value));
            cursor.continue();
          };
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Workspace prompt payload database could not be opened"));
      request.onblocked = () => reject(new Error("Workspace prompt payload database is blocked"));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  }

  async function run(mode, storeNames, operation) {
    const db = await database();
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const transaction = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((name) => [name, transaction.objectStore(name)]));
    const completion = mode === "readwrite" ? transactionCompletion(transaction) : null;
    try {
      const value = await operation(stores, transaction);
      if (completion) await completion;
      return value;
    } catch (error) {
      if (completion) await completion.catch(() => {});
      throw error;
    }
  }

  return Object.freeze({
    put: (entry) => run("readwrite", [PAYLOAD_OBJECT_STORE, PAYLOAD_METADATA_OBJECT_STORE], async (stores) => {
      const result = await requestResult(stores[PAYLOAD_OBJECT_STORE].put(entry));
      await requestResult(stores[PAYLOAD_METADATA_OBJECT_STORE].put(payloadMetadata(entry)));
      return result;
    }),
    get: (handoffId) => run("readonly", PAYLOAD_OBJECT_STORE, (stores) => (
      requestResult(stores[PAYLOAD_OBJECT_STORE].get(handoffId))
    )),
    getMetadata: (handoffId) => run("readonly", PAYLOAD_METADATA_OBJECT_STORE, (stores) => (
      requestResult(stores[PAYLOAD_METADATA_OBJECT_STORE].get(handoffId))
    )),
    remove: (handoffId) => run("readwrite", [PAYLOAD_OBJECT_STORE, PAYLOAD_METADATA_OBJECT_STORE], async (stores) => {
      await requestResult(stores[PAYLOAD_OBJECT_STORE].delete(handoffId));
      await requestResult(stores[PAYLOAD_METADATA_OBJECT_STORE].delete(handoffId));
    }),
    listMetadata: () => run("readonly", PAYLOAD_METADATA_OBJECT_STORE, (stores) => (
      requestResult(stores[PAYLOAD_METADATA_OBJECT_STORE].getAll())
    ))
  });
}

export function createWorkspacePromptPayloadStore(api = {}, dependencies = {}) {
  const sessionStorage = dependencies.sessionStorage || api?.storage?.session || null;
  const indexedDbBackend = dependencies.indexedDbBackend
    || createWorkspacePromptIndexedDbBackend(dependencies.indexedDB || globalThis.indexedDB);
  const now = dependencies.now || Date.now;

  function envelope(locator, payload) {
    return { ...locator, payload };
  }

  function matchingStoredLocator(value, locator, current = now(), allowEnvelope = false) {
    if (!plainObject(value)) return null;
    const storedLocator = normalizeWorkspacePromptPayloadLocator(value, { now: current, allowEnvelope });
    if (
      !storedLocator
      || storedLocator.version !== locator.version
      || storedLocator.backend !== locator.backend
      || storedLocator.handoffId !== locator.handoffId
      || storedLocator.byteLength !== locator.byteLength
      || storedLocator.createdAt !== locator.createdAt
      || storedLocator.expiresAt !== locator.expiresAt
    ) return null;
    return storedLocator;
  }

  function storedEnvelope(value, locator, current = now()) {
    const storedLocator = matchingStoredLocator(value, locator, current, true);
    if (!storedLocator) return null;
    const payload = normalizeWorkspacePromptPayload(value.payload);
    if (!payload || workspacePromptPayloadByteLength(payload) !== locator.byteLength) return null;
    return { locator: storedLocator, payload };
  }

  async function put(handoffId, value) {
    const normalizedId = normalizeWorkspacePromptHandoffId(handoffId);
    const payload = normalizeWorkspacePromptPayload(value);
    if (!normalizedId || !payload) throw new TypeError("Workspace prompt handoff payload is invalid");
    const byteLength = workspacePromptPayloadByteLength(payload);
    const createdAt = Math.max(0, Math.floor(Number(now()) || 0));
    const expiresAt = createdAt + WORKSPACE_PROMPT_HANDOFF_TTL_MS;
    const base = {
      version: WORKSPACE_PROMPT_HANDOFF_VERSION,
      handoffId: normalizedId,
      byteLength,
      createdAt,
      expiresAt
    };
    if (byteLength <= WORKSPACE_PROMPT_SESSION_THRESHOLD_BYTES && typeof sessionStorage?.set === "function") {
      const locator = { ...base, backend: "session" };
      try {
        await sessionStorage.set({ [workspacePromptPayloadSessionKey(normalizedId)]: envelope(locator, payload) });
        return locator;
      } catch {}
    }
    const locator = { ...base, backend: "indexeddb" };
    await indexedDbBackend.put(envelope(locator, payload));
    if (typeof sessionStorage?.remove === "function") {
      await sessionStorage.remove(workspacePromptPayloadSessionKey(normalizedId)).catch(() => {});
    }
    return locator;
  }

  async function get(rawLocator, options = {}) {
    const current = Number.isFinite(Number(options.now)) ? Number(options.now) : now();
    const locator = normalizeWorkspacePromptPayloadLocator(rawLocator, { now: current });
    if (!locator) return null;
    let stored = null;
    if (locator.backend === "session") {
      if (typeof sessionStorage?.get !== "function") return null;
      const key = workspacePromptPayloadSessionKey(locator.handoffId);
      const values = await sessionStorage.get(key);
      stored = values?.[key];
    } else {
      stored = await indexedDbBackend.get(locator.handoffId);
    }
    return storedEnvelope(stored, locator, current)?.payload || null;
  }

  async function has(locator) {
    const current = now();
    const normalized = normalizeWorkspacePromptPayloadLocator(locator, { now: current });
    if (!normalized) return false;
    if (normalized.backend === "session") return Boolean(await get(normalized, { now: current }));
    const metadata = await indexedDbBackend.getMetadata(normalized.handoffId);
    return Boolean(matchingStoredLocator(metadata, normalized, current));
  }

  async function remove(rawLocator) {
    const locator = normalizeWorkspacePromptPayloadLocator(rawLocator, { allowExpired: true });
    if (!locator) return false;
    if (locator.backend === "session") {
      if (typeof sessionStorage?.remove !== "function") return false;
      await sessionStorage.remove(workspacePromptPayloadSessionKey(locator.handoffId));
      return true;
    }
    await indexedDbBackend.remove(locator.handoffId);
    return true;
  }

  async function prune(options = {}) {
    const current = Number.isFinite(Number(options.now)) ? Number(options.now) : now();
    const activeIds = options.activeHandoffIds instanceof Set ? options.activeHandoffIds : null;
    const orphanGraceMs = Math.max(0, Number(options.orphanGraceMs) || 0);
    let removed = 0;
    let failed = 0;
    let nextExpiresAt = 0;
    const shouldRemove = (entry) => {
      const locator = normalizeWorkspacePromptPayloadLocator(entry, { allowExpired: true, allowEnvelope: true });
      if (!locator) return { remove: true, locator: null };
      if (locator.expiresAt <= current) return { remove: true, locator };
      if (activeIds && !activeIds.has(locator.handoffId)) {
        const orphanAt = locator.createdAt + orphanGraceMs;
        if (orphanAt <= current) return { remove: true, locator };
        nextExpiresAt = nextExpiresAt ? Math.min(nextExpiresAt, orphanAt) : orphanAt;
      } else {
        nextExpiresAt = nextExpiresAt ? Math.min(nextExpiresAt, locator.expiresAt) : locator.expiresAt;
      }
      return { remove: false, locator };
    };

    if (typeof sessionStorage?.get === "function" && typeof sessionStorage?.remove === "function") {
      let values = {};
      try {
        values = await sessionStorage.get(null);
      } catch {
        failed += 1;
      }
      const removeKeys = [];
      for (const [key, entry] of Object.entries(values || {})) {
        if (!key.startsWith(PAYLOAD_SESSION_PREFIX)) continue;
        const result = shouldRemove(entry);
        if (result.remove) removeKeys.push(key);
      }
      if (removeKeys.length) {
        try {
          await sessionStorage.remove(removeKeys);
          removed += removeKeys.length;
        } catch {
          failed += removeKeys.length;
        }
      }
    }

    let indexedEntries = [];
    try {
      indexedEntries = await indexedDbBackend.listMetadata();
    } catch {
      failed += 1;
    }
    for (const entry of Array.isArray(indexedEntries) ? indexedEntries : []) {
      const result = shouldRemove(entry);
      if (!result.remove) continue;
      const handoffId = entry?.handoffId;
      if (handoffId === undefined || handoffId === null || handoffId === "") {
        failed += 1;
        continue;
      }
      try {
        await indexedDbBackend.remove(handoffId);
        removed += 1;
      } catch {
        failed += 1;
      }
    }
    return { removed, failed, nextExpiresAt };
  }

  return Object.freeze({ get, has, put, prune, remove });
}
