import { BACKGROUND_REQUEST_ACTIONS } from "../shared/background-requests.js";

const ACTION_NAMES = Object.freeze([
  "GET_CONFIG_SNAPSHOT",
  "PATCH_CONFIG",
  "IMPORT_CONFIG",
  "RESET_CONFIG"
]);

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return value;
}

function resolveActions(overrides = {}) {
  return Object.freeze(Object.fromEntries(ACTION_NAMES.map((name) => {
    const action = overrides[name] || BACKGROUND_REQUEST_ACTIONS[name] || name;
    return [name, action];
  })));
}

function configSnapshotFrom(value) {
  const source = record(value);
  if (!source) return null;
  const candidates = [source.configSnapshot, source.snapshot, source.config, source];
  for (const candidate of candidates) {
    if (!record(candidate) || !record(candidate.options) || !Array.isArray(candidate.customConfig)) continue;
    return {
      ...clone(candidate),
      revision: nonNegativeInteger(candidate.revision, "Config snapshot revision"),
      activationRevision: nonNegativeInteger(candidate.activationRevision ?? 0, "Config snapshot activationRevision"),
      storedOptions: record(candidate.storedOptions) ? clone(candidate.storedOptions) : clone(candidate.options),
      options: clone(candidate.options),
      customConfig: clone(candidate.customConfig)
    };
  }
  return null;
}

function scalarPatch(patch) {
  const entries = Object.entries(record(patch) || {});
  return entries.length > 0 && entries.every(([, value]) => (
    value === null || ["boolean", "number", "string"].includes(typeof value)
  ));
}

function revisionConflict(error) {
  return error?.code === "CONFIG_REVISION_CONFLICT"
    || error?.code === "ACTIVATION_REVISION_CONFLICT";
}

function importedValues(response, patch, snapshot) {
  const source = record(response?.saved) || record(response?.imported) || {};
  const result = clone(source);
  if (Object.hasOwn(patch, "options") && !Object.hasOwn(result, "options")) result.options = clone(snapshot?.options);
  if (Object.hasOwn(patch, "customConfig") && !Object.hasOwn(result, "customConfig")) result.customConfig = clone(snapshot?.customConfig);
  for (const key of ["promptLibrary", "promptSendHistory", "shortcutConfig", "pocketHistory"]) {
    if (Object.hasOwn(patch, key) && !Object.hasOwn(result, key)) result[key] = clone(response?.[key] ?? patch[key]);
  }
  return result;
}

export function createAppConfigService(options = {}) {
  if (typeof options.request !== "function") throw new TypeError("App config service requires request(action, payload).");
  const request = options.request;
  const actions = resolveActions(options.actions);
  const storageChanges = options.storageChanges
    || globalThis.browser?.storage?.onChanged
    || globalThis.chrome?.storage?.onChanged
    || null;
  const listeners = new Set();
  let current = null;
  let readInFlight = null;
  let writeTail = Promise.resolve();
  let storageRefreshTimer = 0;
  let listeningToStorage = false;

  function emit(snapshot) {
    for (const listener of listeners) {
      try { listener(clone(snapshot)); } catch (error) { console.error("[ChatClub] Config snapshot listener failed", error); }
    }
  }

  function adopt(value) {
    const snapshot = configSnapshotFrom(value);
    if (!snapshot) throw new TypeError("Background did not return a valid config snapshot.");
    if (
      current
      && (
        snapshot.revision < current.revision
        || (snapshot.revision === current.revision && snapshot.activationRevision < current.activationRevision)
      )
    ) return clone(current);
    current = snapshot;
    emit(snapshot);
    return clone(snapshot);
  }

  async function load(loadOptions = {}) {
    if (current && loadOptions.force !== true) return clone(current);
    if (readInFlight) return readInFlight;
    readInFlight = request(actions.GET_CONFIG_SNAPSHOT, {}).then(adopt).finally(() => { readInFlight = null; });
    return readInFlight;
  }

  function queued(operation) {
    const pending = writeTail.catch(() => {}).then(operation);
    writeTail = pending.then(() => undefined, () => undefined);
    return pending;
  }

  function onStorageChanged(changes, areaName) {
    if (areaName && areaName !== "local") return;
    if (!Object.keys(record(changes) || {}).some((key) => (
      key.startsWith("chatclubOfficialRulesConfigRevision") || key === "chatclubOfficialRulesStateV1"
    ))) return;
    clearTimeout(storageRefreshTimer);
    storageRefreshTimer = setTimeout(() => { void load({ force: true }).catch(() => {}); }, 40);
  }

  function installStorageListener() {
    if (listeningToStorage || typeof storageChanges?.addListener !== "function") return;
    storageChanges.addListener(onStorageChanged);
    listeningToStorage = true;
  }

  function uninstallStorageListener() {
    if (!listeningToStorage || listeners.size || typeof storageChanges?.removeListener !== "function") return;
    storageChanges.removeListener(onStorageChanged);
    listeningToStorage = false;
  }

  async function mutate(action, payload, mutationOptions = {}) {
    let before = await load();
    const perform = () => request(action, {
      expectedRevision: before.revision,
      expectedActivationRevision: before.activationRevision,
      ...payload
    });
    try {
      return { response: await perform(), replayed: false };
    } catch (error) {
      if (!revisionConflict(error)) throw error;
      const latest = await load({ force: true });
      error.latestSnapshot = clone(latest);
      if (mutationOptions.replayOnce !== true) throw error;
      before = latest;
      return { response: await perform(), replayed: true };
    }
  }

  function patchOptions(patch = {}, patchOptions = {}) {
    const source = record(patch);
    if (!source || !Object.keys(source).length) return load();
    const replayOnce = patchOptions.replayScalar !== false && scalarPatch(source);
    return queued(async () => {
      const { response } = await mutate(actions.PATCH_CONFIG, {
        patch: { options: clone(source) }
      }, { replayOnce });
      return adopt(response);
    });
  }

  function replaceOptions(nextOptions = {}) {
    if (!record(nextOptions)) return Promise.reject(new TypeError("Replacement options must be an object."));
    return queued(async () => {
      const { response } = await mutate(actions.PATCH_CONFIG, {
        patch: { options: clone(nextOptions), replaceOptions: true }
      });
      return adopt(response);
    });
  }

  function patchStoredOptions(patch = {}) {
    const source = record(patch);
    if (!source || !Object.keys(source).length) return load();
    return queued(async () => {
      const { response } = await mutate(actions.PATCH_CONFIG, {
        patch: { options: clone(source), optionsMode: "stored" }
      });
      return adopt(response);
    });
  }

  function replaceCustomConfig(customConfig = []) {
    if (!Array.isArray(customConfig)) return Promise.reject(new TypeError("Custom config must be an array."));
    return queued(async () => {
      const { response } = await mutate(actions.PATCH_CONFIG, {
        patch: { customConfig: clone(customConfig) }
      });
      return adopt(response);
    });
  }

  function importConfig(patch = {}) {
    const source = record(patch);
    if (!source || !Object.keys(source).length) return Promise.reject(new TypeError("Import patch must be a non-empty object."));
    return queued(async () => {
      const { response } = await mutate(actions.IMPORT_CONFIG, { patch: clone(source) });
      const snapshot = adopt(response);
      return { snapshot, saved: importedValues(response, source, snapshot) };
    });
  }

  function resetConfig() {
    return queued(async () => {
      const { response } = await mutate(actions.RESET_CONFIG, {});
      return {
        snapshot: adopt(response),
        workspaceSessionGeneration: String(response?.workspaceSessionGeneration || ""),
        committed: response?.committed === true,
        cleanupWarnings: Array.isArray(response?.cleanupWarnings) ? clone(response.cleanupWarnings) : []
      };
    });
  }

  return Object.freeze({
    actions,
    adopt,
    current: () => clone(current),
    importConfig,
    load,
    patchOptions,
    patchStoredOptions,
    replaceCustomConfig,
    replaceOptions,
    resetConfig,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Config snapshot listener must be a function.");
      listeners.add(listener);
      installStorageListener();
      if (current) listener(clone(current));
      return () => {
        listeners.delete(listener);
        uninstallStorageListener();
      };
    }
  });
}
