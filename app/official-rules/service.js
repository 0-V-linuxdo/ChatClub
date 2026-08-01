import { BACKGROUND_REQUEST_ACTIONS } from "../../shared/background-requests.js";

const ACTION_NAMES = Object.freeze([
  "GET_OFFICIAL_RULES_STATUS",
  "SET_OFFICIAL_RULES_MODE",
  "CHECK_OFFICIAL_RULES_UPDATE",
  "APPLY_OFFICIAL_RULES_UPDATE",
  "ROLLBACK_OFFICIAL_COMPONENT",
  "ROLLBACK_LAST_RULES_UPDATE",
  "RESTORE_OFFICIAL_COMPONENT",
  "SET_OFFICIAL_DELETE_ALIAS_APPROVAL"
]);

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function resolveActions(overrides = {}) {
  return Object.freeze(Object.fromEntries(ACTION_NAMES.map((name) => {
    const action = overrides[name] || BACKGROUND_REQUEST_ACTIONS[name] || name;
    return [name, action];
  })));
}

function statusFrom(response) {
  const source = record(response);
  if (!source) return null;
  for (const candidate of [source.officialRulesStatus, source.rulesStatus, source.status]) {
    if (record(candidate)) return clone(candidate);
  }
  return ["mode", "phase", "candidate", "components", "canRollbackLast", "lastCheckedAt", "lastAppliedAt"]
    .some((key) => Object.hasOwn(source, key)) ? clone(source) : null;
}

function configSnapshotFrom(response) {
  const source = record(response);
  if (!source) return null;
  for (const candidate of [source.configSnapshot, source.config]) {
    if (record(candidate) && record(candidate.options) && Array.isArray(candidate.customConfig)) return candidate;
  }
  if (record(source.snapshot) && record(source.snapshot.options) && Array.isArray(source.snapshot.customConfig)) return source.snapshot;
  if (record(source.options) && Array.isArray(source.customConfig)) return source;
  return null;
}

function storageChangeSource(options) {
  if (options.storageChanges) return options.storageChanges;
  return globalThis.browser?.storage?.onChanged || globalThis.chrome?.storage?.onChanged || null;
}

export function createOfficialRulesService(options = {}) {
  if (typeof options.request !== "function") throw new TypeError("Official rules service requires request(action, payload).");
  if (
    !options.configService
    || typeof options.configService.load !== "function"
    || typeof options.configService.patchStoredOptions !== "function"
  ) {
    throw new TypeError("Official rules service requires the app config service.");
  }
  const request = options.request;
  const configService = options.configService;
  const actions = resolveActions(options.actions);
  const storageChanges = storageChangeSource(options);
  const listeners = new Set();
  let currentStatus = null;
  let statusInFlight = null;
  let storageRefreshTimer = 0;
  let listeningToStorage = false;

  function emit(status) {
    for (const listener of listeners) {
      try { listener(clone(status)); } catch (error) { console.error("[ChatClub] Official rules listener failed", error); }
    }
  }

  function adoptStatus(response) {
    const status = statusFrom(response);
    if (!status) throw new TypeError("Background did not return official-rules status.");
    const currentRevision = Number(currentStatus?.revision);
    const nextRevision = Number(status.revision);
    const currentActivation = Number(currentStatus?.activationRevision);
    const nextActivation = Number(status.activationRevision);
    if (
      Number.isSafeInteger(currentRevision)
      && Number.isSafeInteger(nextRevision)
      && (
        nextRevision < currentRevision
        || (nextRevision === currentRevision
          && Number.isSafeInteger(currentActivation)
          && Number.isSafeInteger(nextActivation)
          && nextActivation < currentActivation)
      )
    ) return clone(currentStatus);
    currentStatus = status;
    emit(status);
    return clone(status);
  }

  async function snapshot(snapshotOptions = {}) {
    if (currentStatus && snapshotOptions.force !== true) return clone(currentStatus);
    if (statusInFlight) return statusInFlight;
    statusInFlight = request(actions.GET_OFFICIAL_RULES_STATUS, {})
      .then(adoptStatus)
      .finally(() => { statusInFlight = null; });
    return statusInFlight;
  }

  async function invoke(action, payload = {}, invokeOptions = {}) {
    const rulesStatus = await snapshot();
    let response;
    try {
      response = await request(action, {
        expectedRevision: rulesStatus.revision,
        ...(invokeOptions.includeActivation === true
          ? { expectedActivationRevision: rulesStatus.activationRevision }
          : {}),
        ...payload
      });
    } catch (error) {
      if (error?.code === "OFFICIAL_RULES_STATE_CONFLICT" || error?.code === "ACTIVATION_REVISION_CONFLICT") {
        await Promise.allSettled([
          snapshot({ force: true }),
          configService.load({ force: true })
        ]);
      }
      throw error;
    }
    const responseSnapshot = configSnapshotFrom(response);
    if (responseSnapshot) configService.adopt(responseSnapshot);
    else if (invokeOptions.refreshConfig === true) await configService.load({ force: true });
    if (statusFrom(response)) return adoptStatus(response);
    return snapshot({ force: true });
  }

  function onStorageChanged(changes, areaName) {
    if (areaName && areaName !== "local") return;
    const keys = Object.keys(record(changes) || {});
    if (!keys.some((key) => key.startsWith("chatclubOfficialRules"))) return;
    clearTimeout(storageRefreshTimer);
    storageRefreshTimer = setTimeout(() => {
      void configService.load({ force: true }).catch(() => {});
      void snapshot({ force: true }).catch(() => {});
    }, 60);
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

  return Object.freeze({
    actions,
    applyCandidate({ approvedDeleteAliases = [] } = {}) {
      return invoke(actions.APPLY_OFFICIAL_RULES_UPDATE, { approvedDeleteAliases: clone(approvedDeleteAliases) }, {
        includeActivation: true,
        refreshConfig: true
      });
    },
    checkNow() {
      return invoke(actions.CHECK_OFFICIAL_RULES_UPDATE);
    },
    async clearOverride(componentKey) {
      const key = String(componentKey || "").trim();
      if (!/^[^/\s]+\/[^/\s]+$/.test(key)) {
        throw new TypeError("Official-rules component key is invalid.");
      }
      const config = await configService.load({ force: true });
      const overrides = record(config.storedOptions?.officialOverrides)
        ? clone(config.storedOptions.officialOverrides)
        : {};
      if (!Object.hasOwn(overrides, key)) return snapshot();
      delete overrides[key];
      try {
        await configService.patchStoredOptions({ officialOverrides: overrides });
      } catch (error) {
        await snapshot({ force: true }).catch(() => {});
        throw error;
      }
      return snapshot({ force: true });
    },
    restoreComponent(componentKey) {
      return invoke(actions.RESTORE_OFFICIAL_COMPONENT, { componentKey: String(componentKey || "") }, {
        includeActivation: true,
        refreshConfig: true
      });
    },
    rollbackComponent(componentKey) {
      return invoke(actions.ROLLBACK_OFFICIAL_COMPONENT, { componentKey: String(componentKey || "") }, {
        includeActivation: true,
        refreshConfig: true
      });
    },
    rollbackLast() {
      return invoke(actions.ROLLBACK_LAST_RULES_UPDATE, {}, { includeActivation: true, refreshConfig: true });
    },
    setDeleteAliasApproval({ componentKey, host, approved } = {}) {
      return invoke(actions.SET_OFFICIAL_DELETE_ALIAS_APPROVAL, {
        componentKey: String(componentKey || ""),
        host: String(host || ""),
        approved: approved === true
      }, { includeActivation: true, refreshConfig: true });
    },
    setMode(mode) {
      const normalized = mode === "auto" ? "auto" : mode === "manual" ? "manual" : "";
      if (!normalized) return Promise.reject(new TypeError("Official rules mode must be auto or manual."));
      return invoke(actions.SET_OFFICIAL_RULES_MODE, { mode: normalized });
    },
    snapshot,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Official rules listener must be a function.");
      listeners.add(listener);
      installStorageListener();
      if (currentStatus) listener(clone(currentStatus));
      return () => {
        listeners.delete(listener);
        uninstallStorageListener();
      };
    }
  });
}
