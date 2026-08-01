import { STORAGE_KEYS } from "../shared/constants.js";
import {
  OFFICIAL_RULES_COMPONENT_KEYS,
  officialRulesCanonicalExactHost,
  officialRulesComponentKey,
  officialRulesHostAuthorization
} from "../shared/official-rules-baseline.js";
import {
  OFFICIAL_RULES_PACKAGED_COMPONENTS,
  OFFICIAL_RULES_PACKAGED_MATERIALIZED,
  OFFICIAL_RULES_PACKAGED_SNAPSHOT,
  resolvePackagedOfficialRulesSnapshot
} from "../shared/official-rules-packaged.js";
import {
  OFFICIAL_RULE_USER_OVERRIDE_FIELDS,
  inspectOfficialRuleOverrides
} from "../shared/official-rules-user-config.js";
import { migrateLegacyScriptConfig } from "../shared/script-config-migration.js";
import {
  dedupePocketHistory,
  dehydrateOptions,
  normalizeCustomConfig,
  normalizeOptions,
  normalizePromptLibrary,
  normalizePromptSendHistory,
  normalizeShortcutConfig
} from "../shared/storage-schema.js";
import {
  WORKSPACE_SESSION_GENERATION_KEY,
  createWorkspaceSessionGeneration
} from "../shared/workspace-session.js";
import {
  OFFICIAL_RULES_PINNED_KEYS,
  OfficialRulesError,
  verifyOfficialRulesDocument
} from "./official-rules-channel.js";
import {
  OFFICIAL_RULES_CONFIG_REVISION_KEY,
  OFFICIAL_RULE_FEATURE_FIELDS,
  OFFICIAL_RULES_OPTIONS_SCHEMA_VERSION,
  createOfficialRulesConfigRepository,
  createOfficialRulesStorageConfigAdapter,
  mergeOfficialRuleComponents,
  projectEffectiveOptionsToStoredV4
} from "./official-rules-config-repository.js";
import {
  OFFICIAL_RULES_STATE_KEY,
  createOfficialRulesRepository
} from "./official-rules-repository.js";
import {
  OFFICIAL_RULES_ALARM_NAME,
  createOfficialRulesActivationController,
  createOfficialRulesAlarmController,
  createOfficialRulesTransitionCoordinator,
  createOfficialRulesUpdater
} from "./official-rules-updater.js";

const OFFICIAL_DELETE_ALIAS_APPROVALS_KEY = "chatclubOfficialDeleteAliasApprovalsV1";
const OFFICIAL_RULES_RESET_CLEANUP_KEY = "chatclubOfficialRulesResetCleanupV1";
const ALIAS_APPROVALS_VERSION = 1;
const RESET_CLEANUP_VERSION = 1;
const CONFIG_IMPORT_FIELDS = new Set([
  "options", "customConfig", "promptLibrary", "promptSendHistory", "shortcutConfig", "pocketHistory"
]);
const CURRENT_KEY_ID = "chatclub-rules-current-2026-08";
const RECOVERY_KEY_ID = "chatclub-rules-recovery-2026-08";

const FULL_RESET_KEEP_KEYS = new Set([
  OFFICIAL_RULES_STATE_KEY,
  STORAGE_KEYS.options,
  STORAGE_KEYS.customConfig,
  STORAGE_KEYS.promptLibrary,
  STORAGE_KEYS.promptSendHistory,
  STORAGE_KEYS.shortcutConfig,
  STORAGE_KEYS.pocketHistory,
  OFFICIAL_RULES_CONFIG_REVISION_KEY,
  OFFICIAL_DELETE_ALIAS_APPROVALS_KEY,
  OFFICIAL_RULES_RESET_CLEANUP_KEY,
  WORKSPACE_SESSION_GENERATION_KEY
]);

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasVisibleOverrideValue(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (plainObject(value)) return Object.keys(value).length > 0;
  return value !== undefined && value !== null;
}

function externalError(code, message, cause) {
  return new OfficialRulesError(code, message, {
    causeCode: String(cause?.code || ""),
    causeMessage: String(cause?.message || cause || "")
  });
}

function compareExtensionVersions(left, right) {
  const parts = (value) => String(value || "").split(".").map((part) => Number(part) || 0);
  const leftParts = parts(left);
  const rightParts = parts(right);
  for (let index = 0; index < 4; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function pointerEqual(left, right) {
  return valuesEqual(left || null, right || null);
}

function normalizedAliasApprovals(value) {
  const source = plainObject(value) && Number(value.version) === ALIAS_APPROVALS_VERSION ? value.approvals : {};
  const approvals = {};
  for (const [componentKey, hosts] of Object.entries(plainObject(source) ? source : {})) {
    const [feature, siteId, extra] = componentKey.split("/");
    if (feature !== "delete" || !siteId || extra) continue;
    const accepted = [];
    for (const hostValue of Array.isArray(hosts) ? hosts : []) {
      const host = officialRulesCanonicalExactHost(hostValue);
      const authorization = officialRulesHostAuthorization(feature, siteId, host);
      if (authorization.allowed && authorization.alias && !accepted.includes(host)) accepted.push(host);
    }
    if (accepted.length) approvals[componentKey] = accepted.sort();
  }
  return approvals;
}

function configRevisionRecord(value) {
  return plainObject(value) && Number(value.version) === 1 && Number.isSafeInteger(value.revision)
    ? value
    : null;
}

function pendingResetCleanup(value) {
  if (!plainObject(value) || Number(value.version) !== RESET_CLEANUP_VERSION) return null;
  const cleanupKeys = [...new Set((Array.isArray(value.cleanupKeys) ? value.cleanupKeys : [])
    .map((key) => String(key || "").trim())
    .filter((key) => key && !FULL_RESET_KEEP_KEYS.has(key)))];
  const workspaceSessionGeneration = String(value.workspaceSessionGeneration || "").trim();
  if (!workspaceSessionGeneration || workspaceSessionGeneration.length > 256) return null;
  return {
    version: RESET_CLEANUP_VERSION,
    cleanupKeys,
    afterResetRequired: value.afterResetRequired === true,
    workspaceSessionGeneration,
    startedAt: Number.isFinite(Number(value.startedAt)) ? Math.max(0, Number(value.startedAt)) : 0
  };
}

function createPendingResetCleanup(allStored, afterResetRequired, workspaceSessionGeneration, now) {
  return {
    version: RESET_CLEANUP_VERSION,
    cleanupKeys: Object.keys(plainObject(allStored) ? allStored : {})
      .filter((key) => !FULL_RESET_KEEP_KEYS.has(key)),
    afterResetRequired: afterResetRequired === true,
    workspaceSessionGeneration: String(workspaceSessionGeneration || "").trim(),
    startedAt: now
  };
}

function targetRevisionLabel(target) {
  return target?.sha256 ? String(target.revision) : "packaged";
}

function componentFieldDiffs(before, after) {
  const fields = ["status", "hosts", "pathPrefixes", "selectors", "parameters"];
  return fields.filter((field) => !valuesEqual(before?.[field], after?.[field])).map((field) => ({
    field,
    before: clone(before?.[field] ?? null),
    after: clone(after?.[field] ?? null)
  }));
}

function importAdditionalValues(patch = {}) {
  const additionalValues = {};
  const saved = {};
  if (Object.hasOwn(patch, "promptLibrary")) {
    saved.promptLibrary = normalizePromptLibrary(patch.promptLibrary);
    additionalValues[STORAGE_KEYS.promptLibrary] = saved.promptLibrary;
  }
  if (Object.hasOwn(patch, "promptSendHistory")) {
    saved.promptSendHistory = normalizePromptSendHistory(patch.promptSendHistory);
    additionalValues[STORAGE_KEYS.promptSendHistory] = saved.promptSendHistory;
  }
  if (Object.hasOwn(patch, "shortcutConfig")) {
    saved.shortcutConfig = normalizeShortcutConfig(patch.shortcutConfig);
    additionalValues[STORAGE_KEYS.shortcutConfig] = saved.shortcutConfig;
  }
  if (Object.hasOwn(patch, "pocketHistory")) {
    saved.pocketHistory = dedupePocketHistory(patch.pocketHistory);
    additionalValues[STORAGE_KEYS.pocketHistory] = saved.pocketHistory;
  }
  return { additionalValues, saved };
}

function validateStoredV4(value, options = {}) {
  if (!plainObject(value) || value.optionsSchemaVersion !== OFFICIAL_RULES_OPTIONS_SCHEMA_VERSION) {
    throw new OfficialRulesError("INVALID_CONFIG_REQUEST", "Stored options must use schema version 4");
  }
  if (!plainObject(value.officialOrders) || !plainObject(value.officialOverrides)) {
    throw new OfficialRulesError("INVALID_CONFIG_REQUEST", "Stored options v4 requires officialOrders and officialOverrides");
  }
  for (const [feature, field] of Object.entries(OFFICIAL_RULE_FEATURE_FIELDS)) {
    const entries = value[field];
    if (!Array.isArray(entries) || entries.some((entry) => !plainObject(entry) || !(
      entry.builtIn === false
      || entry.sourceMode === "custom"
      || typeof entry.customUserscript === "string"
      || entry.userscriptOverride === true
    ))) {
      throw new OfficialRulesError("INVALID_CONFIG_REQUEST", `Stored options v4 ${field} must contain custom entries only`);
    }
    if (!Array.isArray(value.officialOrders[feature])
      || value.officialOrders[feature].some((token) => typeof token !== "string" || !token)) {
      throw new OfficialRulesError("INVALID_CONFIG_REQUEST", `Stored options v4 officialOrders.${feature} is invalid`);
    }
  }
  const inspectedOverrides = inspectOfficialRuleOverrides(value.officialOverrides);
  if (!inspectedOverrides.valid && options.stripInvalidOverrides !== true) {
    throw new OfficialRulesError("INVALID_CONFIG_REQUEST", inspectedOverrides.errors[0] || "Stored options v4 overrides are invalid");
  }
  return { ...clone(value), officialOverrides: clone(inspectedOverrides.value) };
}

function explicitCustomConfig(value) {
  return plainObject(value) && (
    value.builtIn === false
    || value.sourceMode === "custom"
    || typeof value.customUserscript === "string"
    || value.userscriptOverride === true
  );
}

function legacyOfficialMigrationInput(rawOptions, packagedOptions) {
  const source = plainObject(rawOptions) ? clone(rawOptions) : {};
  for (const [feature, field] of Object.entries(OFFICIAL_RULE_FEATURE_FIELDS)) {
    if (!Array.isArray(source[field])) continue;
    const packagedById = new Map((Array.isArray(packagedOptions[field]) ? packagedOptions[field] : [])
      .filter(plainObject)
      .map((config) => [String(config.id || ""), config]));
    const allowed = OFFICIAL_RULE_USER_OVERRIDE_FIELDS[feature] || [];
    source[field] = source[field].map((raw) => {
      if (!plainObject(raw) || explicitCustomConfig(raw)) return clone(raw);
      const siteId = String(raw.id || "").trim();
      const baseline = packagedById.get(siteId);
      if (!baseline) return clone(raw);
      const candidate = { ...clone(baseline), id: siteId, builtIn: true };
      for (const fieldName of allowed) {
        if (Object.hasOwn(raw, fieldName)) candidate[fieldName] = clone(raw[fieldName]);
      }
      return candidate;
    });
  }
  return source;
}

export function createOfficialRulesRuntime(api, options = {}) {
  if (!api?.storage?.local || !api?.runtime || !api?.alarms) {
    throw new TypeError("Official-rules runtime requires storage, runtime, and alarms APIs");
  }
  if (typeof options.applyConfiguration !== "function") {
    throw new TypeError("Official-rules runtime requires applyConfiguration(configuration, context)");
  }
  const storage = api.storage.local;
  const clock = typeof options.now === "function" ? options.now : Date.now;
  const startupAfterReset = typeof options.afterReset === "function" ? options.afterReset : null;
  const createResetGeneration = typeof options.createResetGeneration === "function"
    ? options.createResetGeneration
    : createWorkspaceSessionGeneration;
  const packagedOptions = normalizeOptions({});
  const keyring = options.keyring || OFFICIAL_RULES_PINNED_KEYS;
  const authorizeOfficialHost = typeof options.authorizeOfficialHost === "function"
    ? options.authorizeOfficialHost
    : officialRulesHostAuthorization;
  const transitionCoordinator = createOfficialRulesTransitionCoordinator();
  const repository = createOfficialRulesRepository({ storage, now: clock });
  const aliasApprovals = new Map();
  let transientPhase = "";
  let recoveryRequired = false;

  const storageAdapter = createOfficialRulesStorageConfigAdapter({
    storage,
    normalizeStoredOptions: (value) => clone(plainObject(value) ? value : {}),
    normalizeCustomConfig
  });

  async function migrateLegacyOptionsToStoredV4(rawOptions) {
    const migrated = await migrateLegacyScriptConfig(rawOptions);
    const migrationInput = legacyOfficialMigrationInput(migrated, packagedOptions);
    const packagedEffective = dehydrateOptions(normalizeOptions(migrationInput));
    return projectEffectiveOptionsToStoredV4(packagedEffective, OFFICIAL_RULES_PACKAGED_MATERIALIZED, {
      packagedOptions,
      previousStoredOptions: {},
      isDeleteAliasApproved: () => false
    });
  }
  const updater = options.updater || createOfficialRulesUpdater({
    repository,
    keyring,
    crypto: options.crypto,
    fetch: options.fetch,
    now: clock,
    isCompatible: (catalog) => compareExtensionVersions(
      api.runtime.getManifest().version,
      catalog.minExtensionVersion
    ) >= 0
  });

  function aliasApproved(componentKey, host) {
    return aliasApprovals.get(componentKey)?.has(host) === true;
  }

  async function loadAliasApprovals() {
    const stored = await storage.get(OFFICIAL_DELETE_ALIAS_APPROVALS_KEY);
    aliasApprovals.clear();
    for (const [key, hosts] of Object.entries(normalizedAliasApprovals(stored?.[OFFICIAL_DELETE_ALIAS_APPROVALS_KEY]))) {
      aliasApprovals.set(key, new Set(hosts));
    }
  }

  function aliasApprovalsRecord() {
    return {
      version: ALIAS_APPROVALS_VERSION,
      approvals: Object.fromEntries([...aliasApprovals].map(([key, hosts]) => [key, [...hosts].sort()])),
      updatedAt: clock()
    };
  }

  async function materializeTarget(target) {
    const key = officialRulesComponentKey(target?.feature, target?.siteId);
    if (!target?.sha256) {
      const component = OFFICIAL_RULES_PACKAGED_COMPONENTS[key];
      if (!component) throw new OfficialRulesError("PACKAGED_COMPONENT_MISSING", `Packaged component ${key} is unavailable`);
      return component;
    }
    const blob = await repository.getBlob(target.sha256);
    if (!blob || blob.kind !== "component") {
      throw new OfficialRulesError("MISSING_BLOB", `Pinned component ${key} is missing from the verified cache`);
    }
    const document = await verifyOfficialRulesDocument({
      kind: "component",
      rawText: blob.rawText,
      signatureText: blob.signatureText,
      keyring,
      crypto: options.crypto,
      expectedHash: target.sha256,
      expectedSize: target.size,
      expectedKeyId: target.keyId
    });
    if (document.value.feature !== target.feature
      || document.value.siteId !== target.siteId
      || document.value.revision !== target.revision) {
      throw new OfficialRulesError("COMPONENT_POINTER_MISMATCH", `Pinned component ${key} does not match its signed pointer`);
    }
    return document.value;
  }

  async function overlayPins(materialized, pins = {}) {
    const components = { ...(materialized?.components || {}) };
    for (const [key, target] of Object.entries(pins || {})) components[key] = await materializeTarget(target);
    return Object.freeze({ ...materialized, components: Object.freeze(components) });
  }

  async function materializeRules(snapshot, materializeOptions = {}) {
    const base = await updater.materializeSnapshot(snapshot, {
      resolvePackaged: resolvePackagedOfficialRulesSnapshot
    });
    const pins = materializeOptions.pins ?? materializeOptions.state?.componentPins ?? {};
    return overlayPins(base, pins);
  }

  async function effectiveConfiguration(materialized, storedOptions, customConfig) {
    const stored = storedOptions ?? await storageAdapter.loadOptions();
    return {
      options: mergeOfficialRuleComponents(stored, materialized, {
        packagedOptions,
        isDeleteAliasApproved: aliasApproved
      }),
      customConfig: customConfig ?? await storageAdapter.loadCustomConfig()
    };
  }

  function deleteFailClosedConfiguration(configuration) {
    const safe = clone(configuration);
    safe.options.topicDeleteSiteConfigs = (safe.options.topicDeleteSiteConfigs || [])
      .map((config) => ({ ...config, enabled: false }));
    return safe;
  }

  async function applyRuntimeConfiguration(configuration, context = {}) {
    const state = await repository.readState();
    const mustFailClosed = recoveryRequired || state.journal.phase === "recovery-required";
    const prepared = mustFailClosed && !new Set(["recovery", "full-reset"]).has(context.phase)
      ? deleteFailClosedConfiguration(configuration)
      : configuration;
    return options.applyConfiguration(prepared, context);
  }

  async function applyMaterialized(materialized, context = {}, pins) {
    const withPins = pins === undefined ? materialized : await overlayPins(materialized, pins);
    const configuration = await effectiveConfiguration(withPins);
    return applyRuntimeConfiguration(configuration, context);
  }

  const activation = createOfficialRulesActivationController({
    repository,
    transitionCoordinator,
    materializeSnapshot: (snapshot) => updater.materializeSnapshot(snapshot, {
      resolvePackaged: resolvePackagedOfficialRulesSnapshot
    }),
    applySnapshot: async (materialized, context) => {
      const state = await repository.readState();
      const pins = context.phase === "apply" && state.journal.operation === "snapshot"
        ? state.journal.toPins
        : context.phase === "rollback" && state.journal.operation === "snapshot"
          ? state.journal.fromPins
          : state.componentPins;
      return applyMaterialized(materialized, context, pins);
    }
  });
  const configRepository = createOfficialRulesConfigRepository({
    officialRulesRepository: repository,
    materializeRules,
    ...storageAdapter,
    packagedOptions,
    normalizeCustomConfig,
    isDeleteAliasApproved: aliasApproved
  });

  async function automaticCheck() {
    const state = await repository.readState();
    if (recoveryRequired || state.journal.phase === "recovery-required") {
      return { status: "recovery-required" };
    }
    return updater.checkForUpdates({ source: "alarm" });
  }

  const alarmController = createOfficialRulesAlarmController({
    repository,
    alarms: api.alarms,
    checkForUpdates: automaticCheck,
    now: clock,
    random: options.random
  });

  async function retryResetCleanupStep(label, task, warnings) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try { return { ok: true, value: await task() }; }
      catch (error) { lastError = error; }
    }
    warnings.push({ label, message: String(lastError?.message || lastError || label) });
    return { ok: false, value: null };
  }

  async function completePendingResetCleanup(marker, resetDependencies = {}) {
    const pending = pendingResetCleanup(marker);
    const warnings = [];
    let workspaceSessionGeneration = "";
    if (!pending) {
      warnings.push({ label: "cleanup-marker", message: "Pending full-reset cleanup marker is invalid" });
      return { pending: true, warnings, workspaceSessionGeneration };
    }
    if (pending.cleanupKeys.length) {
      await retryResetCleanupStep(
        "storage-remove",
        () => storage.remove(pending.cleanupKeys),
        warnings
      );
    }
    await retryResetCleanupStep("alarm-clear", () => alarmController.clear(), warnings);
    if (pending.afterResetRequired) {
      const afterReset = typeof resetDependencies.afterReset === "function"
        ? resetDependencies.afterReset
        : startupAfterReset;
      if (!afterReset) {
        warnings.push({ label: "after-reset", message: "Full-reset workspace cleanup is unavailable" });
      } else {
        const completed = await retryResetCleanupStep(
          "after-reset",
          async () => {
            const confirmed = String(await afterReset(pending.workspaceSessionGeneration) || "").trim();
            if (confirmed !== pending.workspaceSessionGeneration) {
              throw new Error("Full-reset workspace generation was not confirmed");
            }
            return confirmed;
          },
          warnings
        );
        if (completed.ok) workspaceSessionGeneration = String(completed.value || "");
      }
    }
    if (!warnings.length) {
      await retryResetCleanupStep(
        "cleanup-marker-remove",
        () => storage.remove(OFFICIAL_RULES_RESET_CLEANUP_KEY),
        warnings
      );
    }
    return {
      pending: warnings.length > 0,
      warnings,
      workspaceSessionGeneration
    };
  }

  async function resumePendingResetCleanup() {
    const warnings = [];
    const loaded = await retryResetCleanupStep(
      "cleanup-marker-read",
      () => storage.get(OFFICIAL_RULES_RESET_CLEANUP_KEY),
      warnings
    );
    if (!loaded.ok) return { pending: true, warnings, workspaceSessionGeneration: "" };
    const marker = loaded.value?.[OFFICIAL_RULES_RESET_CLEANUP_KEY];
    if (marker === undefined) return { pending: false, warnings: [], workspaceSessionGeneration: "" };
    return completePendingResetCleanup(marker);
  }

  async function migrateStoredConfiguration() {
    const stored = await storage.get([
      STORAGE_KEYS.options,
      STORAGE_KEYS.customConfig,
      OFFICIAL_RULES_CONFIG_REVISION_KEY
    ]);
    const revisionRecord = configRevisionRecord(stored[OFFICIAL_RULES_CONFIG_REVISION_KEY]);
    if (stored[STORAGE_KEYS.options]?.optionsSchemaVersion === OFFICIAL_RULES_OPTIONS_SCHEMA_VERSION && revisionRecord) {
      const canonical = validateStoredV4(stored[STORAGE_KEYS.options], { stripInvalidOverrides: true });
      if (!valuesEqual(canonical, stored[STORAGE_KEYS.options])) {
        await storageAdapter.commitConfig({
          options: canonical,
          customConfig: normalizeCustomConfig(stored[STORAGE_KEYS.customConfig]),
          previousRevision: revisionRecord.revision,
          revision: revisionRecord.revision + 1
        });
      }
      return;
    }
    if (stored[STORAGE_KEYS.options]?.optionsSchemaVersion === OFFICIAL_RULES_OPTIONS_SCHEMA_VERSION) {
      await storageAdapter.commitConfig({
        options: validateStoredV4(stored[STORAGE_KEYS.options]),
        customConfig: normalizeCustomConfig(stored[STORAGE_KEYS.customConfig]),
        previousRevision: revisionRecord?.revision || 0,
        revision: (revisionRecord?.revision || 0) + 1
      });
      return;
    }
    const sparse = await migrateLegacyOptionsToStoredV4(stored[STORAGE_KEYS.options]);
    const previousRevision = revisionRecord?.revision || 0;
    await storageAdapter.commitConfig({
      options: sparse,
      customConfig: normalizeCustomConfig(stored[STORAGE_KEYS.customConfig]),
      previousRevision,
      revision: previousRevision + 1
    });
  }

  async function failClosedDelete() {
    let configuration;
    try {
      const state = await repository.readState();
      configuration = await effectiveConfiguration(await materializeRules(state.active, { state }));
    } catch {
      configuration = { options: clone(packagedOptions), customConfig: [] };
    }
    await options.applyConfiguration(deleteFailClosedConfiguration(configuration), { phase: "recovery-failed-closed" });
  }

  async function initialize() {
    await resumePendingResetCleanup();
    await repository.initializePackaged(OFFICIAL_RULES_PACKAGED_SNAPSHOT);
    await loadAliasApprovals();
    await migrateStoredConfiguration();
    try {
      const recovered = await activation.recover();
      if (!recovered.recovered) {
        const state = await repository.readState();
        await applyMaterialized(await updater.materializeSnapshot(state.active, {
          resolvePackaged: resolvePackagedOfficialRulesSnapshot
        }), { phase: "startup" }, state.componentPins);
      }
    } catch (_error) {
      recoveryRequired = true;
      await failClosedDelete().catch(() => {});
      await alarmController.clear().catch(() => {});
      return configRepository.getConfigSnapshot();
    }
    await alarmController.ensureScheduled();
    return configRepository.getConfigSnapshot();
  }

  const configurationReady = initialize();

  async function getConfigSnapshot() {
    await configurationReady;
    return configRepository.getConfigSnapshot();
  }

  async function previewPatch(current, patch) {
    const state = await repository.readState();
    const materialized = await materializeRules(state.active, { state });
    let storedOptions = current.storedOptions;
    if (Object.hasOwn(patch, "options")) {
      if (patch.optionsMode === "stored") {
        storedOptions = validateStoredV4(patch.replaceOptions === true
          ? patch.options
          : { ...current.storedOptions, ...clone(patch.options) });
      } else {
        const effective = patch.replaceOptions === true
          ? clone(patch.options)
          : { ...current.options, ...clone(patch.options) };
        storedOptions = projectEffectiveOptionsToStoredV4(effective, materialized, {
          packagedOptions,
          previousStoredOptions: current.storedOptions,
          isDeleteAliasApproved: aliasApproved
        });
      }
    }
    const customConfig = Object.hasOwn(patch, "customConfig")
      ? normalizeCustomConfig(patch.customConfig)
      : current.customConfig;
    return effectiveConfiguration(materialized, storedOptions, customConfig);
  }

  function assertConfigRequestRevisions(current, request) {
    if (!Number.isSafeInteger(request.expectedRevision) || current.revision !== request.expectedRevision) {
      throw new OfficialRulesError("CONFIG_REVISION_CONFLICT", `Expected config revision ${request.expectedRevision}, received ${current.revision}`);
    }
    if (!Number.isSafeInteger(request.expectedActivationRevision)
      || current.activationRevision !== request.expectedActivationRevision) {
      throw new OfficialRulesError("ACTIVATION_REVISION_CONFLICT", `Expected activation revision ${request.expectedActivationRevision}, received ${current.activationRevision}`);
    }
  }

  async function enterConfigurationRecovery(journal, applyError, compensationError, options = {}) {
    let persistenceError = options.persistenceError || null;
    try {
      let state = await repository.readState();
      if (state.journal.attemptId === journal.attemptId && state.journal.phase === "applying") {
        await repository.markRollingBack(journal.attemptId, applyError);
        state = await repository.readState();
      }
      if (state.journal.attemptId === journal.attemptId && state.journal.phase !== "recovery-required") {
        await repository.markRecoveryRequired(journal.attemptId, compensationError);
      }
    } catch (error) {
      persistenceError = persistenceError || error;
    }
    recoveryRequired = true;
    let failClosedError = null;
    try { await failClosedDelete(); } catch (error) { failClosedError = error; }
    await alarmController.clear().catch(() => {});
    throw new OfficialRulesError(
      options.code || "CONFIG_APPLY_FAILED",
      options.message || "Configuration persistence failed and the previous runtime configuration could not be restored",
      {
        attemptId: journal.attemptId,
        causeMessage: String(applyError?.message || applyError),
        restoreMessage: String(compensationError?.message || compensationError),
        journalMessage: String(persistenceError?.message || persistenceError || ""),
        failClosedMessage: String(failClosedError?.message || failClosedError || "")
      }
    );
  }

  async function compensateConfigurationApply(journal, current, applyError, options = {}) {
    let journalError = null;
    try {
      await repository.markRollingBack(journal.attemptId, applyError);
    } catch (error) {
      journalError = error;
    }
    try {
      await applyRuntimeConfiguration({ options: current.options, customConfig: current.customConfig }, {
        phase: options.restorePhase || "config-restore",
        attemptId: journal.attemptId
      });
    } catch (restoreError) {
      return enterConfigurationRecovery(journal, applyError, restoreError, {
        ...options,
        persistenceError: journalError
      });
    }
    try {
      if (journalError) await repository.markRollingBack(journal.attemptId, applyError);
      await repository.completeRollback(journal.attemptId, { quarantine: false });
    } catch (completionError) {
      return enterConfigurationRecovery(journal, applyError, completionError, {
        ...options,
        persistenceError: journalError
      });
    }
    throw applyError;
  }

  async function patchConfiguration(request, additionalValues = {}) {
    await configurationReady;
    return transitionCoordinator.run(async () => {
      const current = await configRepository.getConfigSnapshot();
      assertConfigRequestRevisions(current, request);
      const patch = { ...(plainObject(request.patch) ? request.patch : {}), additionalValues };
      const preview = await previewPatch(current, patch);
      const state = await repository.readState();
      const started = state.journal.phase === "idle"
        ? await repository.beginConfigurationApply({
          expectedActivationRevision: request.expectedActivationRevision,
          reason: "config-write"
        })
        : null;
      if (!started && state.journal.phase !== "recovery-required") {
        throw new OfficialRulesError("CONFIG_APPLY_FAILED", "Configuration cannot change during an official-rules transition");
      }
      const journal = started?.journal || state.journal;
      try {
        await applyRuntimeConfiguration(preview, { phase: "config-prepare", attemptId: journal.attemptId });
        return await configRepository.patchConfig({
          expectedRevision: request.expectedRevision,
          expectedActivationRevision: request.expectedActivationRevision,
          patch
        }, started ? {
          commitConfig: async (commitRequest) => {
            const prepared = await storageAdapter.prepareConfigCommit(commitRequest);
            await repository.commitConfigurationApply(journal.attemptId, {
              additionalValues: prepared.values
            });
            return prepared.result;
          }
        } : {});
      } catch (error) {
        const state = await repository.readState().catch(() => null);
        if (started) {
          if (state?.journal?.attemptId !== journal.attemptId) throw error;
          return compensateConfigurationApply(journal, current, error);
        }
        try {
          await applyRuntimeConfiguration({ options: current.options, customConfig: current.customConfig }, {
            phase: "config-restore",
            attemptId: journal.attemptId
          });
        } catch (restoreError) {
          return enterConfigurationRecovery(journal, error, restoreError);
        }
        throw error;
      }
    });
  }

  async function statusSnapshot() {
    await configurationReady;
    const [state, configSnapshot] = await Promise.all([
      repository.readState(),
      configRepository.getConfigSnapshot()
    ]);
    const officialOverrides = plainObject(configSnapshot.storedOptions?.officialOverrides)
      ? configSnapshot.storedOptions.officialOverrides
      : {};
    const active = await materializeRules(state.active, { state });
    const candidate = state.candidate
      ? await updater.materializeSnapshot(state.candidate, { resolvePackaged: resolvePackagedOfficialRulesSnapshot })
      : null;
    const changedComponents = [];
    const components = [];
    for (const key of OFFICIAL_RULES_COMPONENT_KEYS) {
      const activeTarget = state.componentPins[key] || state.active?.officialTargets?.[key];
      const candidateTarget = state.candidate?.officialTargets?.[key];
      const overrideFields = Object.entries(plainObject(officialOverrides[key]) ? officialOverrides[key] : {})
        .filter(([, value]) => hasVisibleOverrideValue(value))
        .map(([field]) => field)
        .sort();
      const changed = Boolean(candidateTarget && !pointerEqual(state.active?.officialTargets?.[key], candidateTarget));
      const fieldDiffs = changed ? componentFieldDiffs(active.components[key], candidate?.components?.[key]) : [];
      if (changed) changedComponents.push({
        componentKey: key,
        currentVersion: targetRevisionLabel(activeTarget),
        candidateVersion: targetRevisionLabel(candidateTarget),
        fieldDiffs
      });
      components.push({
        componentKey: key,
        source: state.componentPins[key]
          ? "rolled-back"
          : overrideFields.length
            ? "user-override"
            : state.active?.source === "remote" ? "official" : "packaged",
        overrideFields,
        activeVersion: targetRevisionLabel(activeTarget),
        packagedVersion: "packaged",
        candidateVersion: candidateTarget ? targetRevisionLabel(candidateTarget) : "",
        changed,
        fieldDiffs,
        canRollback: Boolean(state.previousByComponent[key]
          && !pointerEqual(activeTarget, state.previousByComponent[key])),
        canRestore: Boolean(state.componentPins[key])
      });
    }
    const deleteAliasMap = new Map();
    const collectDeleteAliases = (materialized, source) => {
      for (const [key, component] of Object.entries(materialized?.components || {})) {
        if (component.feature !== "delete") continue;
        for (const host of component.hosts || []) {
          const authorization = authorizeOfficialHost(component.feature, component.siteId, host);
          if (!authorization.allowed || !authorization.alias) continue;
          const aliasKey = `${key}\n${host}`;
          const existing = deleteAliasMap.get(aliasKey);
          deleteAliasMap.set(aliasKey, {
            componentKey: key,
            host,
            approved: aliasApproved(key, host),
            active: existing?.active === true || source === "active",
            candidate: existing?.candidate === true || source === "candidate"
          });
        }
      }
    };
    collectDeleteAliases(active, "active");
    collectDeleteAliases(candidate, "candidate");
    const deleteAliases = [...deleteAliasMap.values()].sort((left, right) => (
      left.componentKey.localeCompare(right.componentKey) || left.host.localeCompare(right.host)
    ));
    const consentDecided = state.consent.decidedAt > 0;
    const phase = transientPhase || (recoveryRequired
      ? "recovery-required"
      : state.journal.phase !== "idle" ? state.journal.phase
      : state.suppressed
        ? "extension-update-required"
        : state.candidate
          ? "candidate"
          : "ready");
    return Object.freeze({
      revision: state.revision,
      activationRevision: state.activationRevision,
      consentDecided,
      mode: consentDecided ? (state.consent.automaticChecks ? "auto" : "manual") : "undecided",
      phase,
      source: state.active?.source || "packaged",
      catalog: state.active?.catalogHash || "packaged",
      version: state.active?.rulesVersion || "packaged",
      sequence: state.active?.sequence || 0,
      keyId: state.active?.keyId || "",
      keyFingerprints: {
        current: keyring[CURRENT_KEY_ID]?.fingerprintSha256 || "",
        recovery: keyring[RECOVERY_KEY_ID]?.fingerprintSha256 || ""
      },
      currentKeyFingerprint: keyring[CURRENT_KEY_ID]?.fingerprintSha256 || "",
      recoveryKeyFingerprint: keyring[RECOVERY_KEY_ID]?.fingerprintSha256 || "",
      lastCheckedAt: state.schedule.lastCheckAt || null,
      lastAppliedAt: state.lastAppliedAt || null,
      canRollbackLast: state.lastAppliedChangedKeys.some((key) => Boolean(
        state.previousByComponent[key]
        && !pointerEqual(
          state.componentPins[key] || state.active?.officialTargets?.[key],
          state.previousByComponent[key]
        )
      )),
      requiresExtensionUpdate: Boolean(state.suppressed),
      suppressed: state.suppressed ? clone(state.suppressed) : null,
      error: state.schedule.lastError || state.journal.rollbackError || state.journal.error || "",
      components,
      candidate: {
        available: Boolean(state.candidate),
        version: state.candidate?.rulesVersion || "",
        sequence: state.candidate?.sequence || 0,
        keyId: state.candidate?.keyId || "",
        releaseNotes: String(candidate?.catalog?.releaseNotes || ""),
        changedComponents,
        deleteAliases
      }
    });
  }

  async function assertStateRevision(expectedRevision) {
    const state = await repository.readState();
    if (!Number.isSafeInteger(expectedRevision) || state.revision !== expectedRevision) {
      throw new OfficialRulesError("OFFICIAL_RULES_STATE_CONFLICT", `Expected official-rules revision ${expectedRevision}, received ${state.revision}`);
    }
    return state;
  }

  function assertRulesOperational(state) {
    if (recoveryRequired || state.journal.phase === "recovery-required") {
      throw new OfficialRulesError(
        "RECOVERY_REQUIRED",
        "Official-rules changes are disabled until recovery is completed or configuration is reset"
      );
    }
    return state;
  }

  async function setMode(request) {
    await configurationReady;
    return transitionCoordinator.run(async () => {
      if (!new Set(["auto", "manual"]).has(request.mode)) {
        throw new OfficialRulesError("INVALID_OFFICIAL_RULES_REQUEST", "Official-rules mode must be auto or manual");
      }
      assertRulesOperational(await assertStateRevision(request.expectedRevision));
      await alarmController.setConsent(request.mode === "auto", request.expectedRevision);
      return statusSnapshot();
    });
  }

  async function checkUpdate(request = {}) {
    await configurationReady;
    return transitionCoordinator.run(async () => {
      assertRulesOperational(await assertStateRevision(request.expectedRevision));
      transientPhase = "checking";
      try {
        const result = await updater.checkForUpdates({ force: true, source: "manual" });
        const completedAt = clock();
        await repository.patchSchedule({ lastCheckAt: completedAt, lastSuccessAt: completedAt, lastError: "" });
        return { result, status: await statusSnapshot() };
      } catch (error) {
        await repository.patchSchedule({ lastCheckAt: clock(), lastError: String(error?.message || error) }).catch(() => {});
        throw externalError("OFFICIAL_RULES_UPDATE_FAILED", "Official-rules update check failed", error);
      } finally {
        transientPhase = "";
      }
    });
  }

  function assertClaimedAliases(values = []) {
    for (const value of Array.isArray(values) ? values : []) {
      const key = String(value?.componentKey || "");
      const host = officialRulesCanonicalExactHost(value?.host);
      if (!host || !aliasApproved(key, host)) {
        throw new OfficialRulesError("INVALID_OFFICIAL_RULES_REQUEST", `Delete alias ${key}/${host || "invalid"} has no local approval`);
      }
    }
  }

  async function applyUpdate(request) {
    await configurationReady;
    const before = assertRulesOperational(await assertStateRevision(request.expectedRevision));
    if (request.expectedActivationRevision !== undefined
      && request.expectedActivationRevision !== before.activationRevision) {
      throw new OfficialRulesError("ACTIVATION_REVISION_CONFLICT", `Expected activation revision ${request.expectedActivationRevision}, received ${before.activationRevision}`);
    }
    assertClaimedAliases(request.approvedDeleteAliases);
    transientPhase = "applying";
    try {
      await activation.applyCandidate({
        expectedCatalogHash: before.candidate?.catalogHash,
        expectedStateRevision: request.expectedRevision,
        reason: "manual-apply"
      });
      return { status: await statusSnapshot(), configSnapshot: await configRepository.getConfigSnapshot() };
    } catch (error) {
      let failedState = await repository.readState().catch(() => null);
      if (failedState?.journal?.phase && failedState.journal.phase !== "idle") {
        if (failedState.journal.phase !== "recovery-required") {
          await repository.markRecoveryRequired(failedState.journal.attemptId, error).catch(() => {});
          failedState = await repository.readState().catch(() => failedState);
        }
        recoveryRequired = true;
        await failClosedDelete().catch(() => {});
        await alarmController.clear().catch(() => {});
      }
      throw externalError("OFFICIAL_RULES_APPLY_FAILED", "Official-rules update could not be applied safely", error);
    } finally {
      transientPhase = "";
    }
  }

  async function applyPins(request, nextPins, reason) {
    return transitionCoordinator.run(async () => {
      const before = assertRulesOperational(await assertStateRevision(request.expectedRevision));
      const expectedActivationRevision = request.expectedActivationRevision ?? before.activationRevision;
      const started = await repository.beginComponentPinsApply({
        pins: nextPins,
        expectedActivationRevision,
        expectedStateRevision: request.expectedRevision,
        reason
      });
      const journal = started.journal;
      try {
        const target = await materializeRules(journal.to, { pins: journal.toPins });
        await applyRuntimeConfiguration(await effectiveConfiguration(target), { phase: "component-apply", attemptId: journal.attemptId });
        await repository.commitComponentPinsApply(journal.attemptId);
        await repository.pruneBlobs().catch(() => {});
        return { status: await statusSnapshot(), configSnapshot: await configRepository.getConfigSnapshot() };
      } catch (applyError) {
        await repository.markRollingBack(journal.attemptId, applyError).catch(() => {});
        try {
          const previous = await materializeRules(journal.from, { pins: journal.fromPins });
          await applyRuntimeConfiguration(await effectiveConfiguration(previous), { phase: "component-rollback", attemptId: journal.attemptId });
          await repository.completeRollback(journal.attemptId, { quarantine: false });
        } catch (rollbackError) {
          await repository.markRecoveryRequired(journal.attemptId, rollbackError).catch(() => {});
          recoveryRequired = true;
          await failClosedDelete().catch(() => {});
          await alarmController.clear().catch(() => {});
        }
        throw externalError("OFFICIAL_RULES_APPLY_FAILED", "Official-rules component transition could not be applied safely", applyError);
      }
    });
  }

  async function rollbackComponent(request) {
    await configurationReady;
    const state = await assertStateRevision(request.expectedRevision);
    const key = String(request.componentKey || "");
    if (!OFFICIAL_RULES_COMPONENT_KEYS.includes(key) || !state.previousByComponent[key]) {
      throw new OfficialRulesError("INVALID_OFFICIAL_RULES_REQUEST", `Official-rules component ${key} has no rollback target`);
    }
    return applyPins(request, { ...state.componentPins, [key]: state.previousByComponent[key] }, "component-rollback");
  }

  async function restoreComponent(request) {
    await configurationReady;
    const state = await assertStateRevision(request.expectedRevision);
    const key = String(request.componentKey || "");
    if (!OFFICIAL_RULES_COMPONENT_KEYS.includes(key) || !state.componentPins[key]) {
      throw new OfficialRulesError("INVALID_OFFICIAL_RULES_REQUEST", `Official-rules component ${key} is not rolled back`);
    }
    const pins = { ...state.componentPins };
    delete pins[key];
    return applyPins(request, pins, "component-restore");
  }

  async function rollbackLast(request) {
    await configurationReady;
    const state = await assertStateRevision(request.expectedRevision);
    const pins = { ...state.componentPins };
    for (const key of state.lastAppliedChangedKeys) {
      if (state.previousByComponent[key]
        && !pointerEqual(state.componentPins[key] || state.active?.officialTargets?.[key], state.previousByComponent[key])) {
        pins[key] = state.previousByComponent[key];
      }
    }
    return applyPins(request, pins, "last-update-rollback");
  }

  async function setDeleteAliasApproval(request) {
    await configurationReady;
    return transitionCoordinator.run(async () => {
      const state = assertRulesOperational(await assertStateRevision(request.expectedRevision));
      if (!Number.isSafeInteger(request.expectedActivationRevision)
        || request.expectedActivationRevision !== state.activationRevision) {
        throw new OfficialRulesError("ACTIVATION_REVISION_CONFLICT", `Expected activation revision ${request.expectedActivationRevision}, received ${state.activationRevision}`);
      }
      const key = String(request.componentKey || "");
      const [feature, siteId, extra] = key.split("/");
      const host = officialRulesCanonicalExactHost(request.host);
      const authorization = authorizeOfficialHost(feature, siteId, host);
      if (feature !== "delete" || !siteId || extra || !authorization.allowed || !authorization.alias) {
        throw new OfficialRulesError("INVALID_OFFICIAL_RULES_REQUEST", "Delete alias approval is outside the packaged safety policy");
      }
      if (request.approved) {
        const snapshots = [state.active, state.candidate].filter(Boolean);
        const materialized = await Promise.all(snapshots.map((snapshot) => materializeRules(snapshot, {
          state: snapshot === state.active ? state : undefined
        })));
        if (!materialized.some((rules) => (rules.components?.[key]?.hosts || []).includes(host))) {
          throw new OfficialRulesError("INVALID_OFFICIAL_RULES_REQUEST", "Delete alias is not present in the signed active or candidate component");
        }
      }
      const previous = new Set(aliasApprovals.get(key) || []);
      const next = new Set(previous);
      if (request.approved) next.add(host); else next.delete(host);
      if (valuesEqual([...previous].sort(), [...next].sort())) {
        return { status: await statusSnapshot(), configSnapshot: await configRepository.getConfigSnapshot() };
      }
      const current = await materializeRules(state.active, { state });
      const previousConfiguration = await effectiveConfiguration(current);
      const started = await repository.beginConfigurationApply({
        expectedStateRevision: request.expectedRevision,
        expectedActivationRevision: request.expectedActivationRevision,
        reason: "delete-alias-approval"
      });
      const journal = started.journal;
      if (next.size) aliasApprovals.set(key, next); else aliasApprovals.delete(key);
      try {
        await applyRuntimeConfiguration(await effectiveConfiguration(current), {
          phase: "delete-alias-approval",
          attemptId: journal.attemptId
        });
        await repository.commitConfigurationApply(journal.attemptId, {
          incrementActivationRevision: true,
          additionalValues: { [OFFICIAL_DELETE_ALIAS_APPROVALS_KEY]: aliasApprovalsRecord() }
        });
      } catch (error) {
        if (previous.size) aliasApprovals.set(key, previous); else aliasApprovals.delete(key);
        try {
          const failedState = await repository.readState();
          if (failedState.journal.attemptId !== journal.attemptId) throw error;
          await compensateConfigurationApply(journal, previousConfiguration, error, {
            message: "Delete alias approval failed and the previous runtime configuration could not be restored",
            restorePhase: "delete-alias-approval-restore"
          });
        } catch (compensatedError) {
          if (compensatedError?.code === "CONFIG_APPLY_FAILED") throw compensatedError;
          throw externalError("CONFIG_APPLY_FAILED", "Delete alias approval could not be applied safely", compensatedError);
        }
      }
      return { status: await statusSnapshot(), configSnapshot: await configRepository.getConfigSnapshot() };
    });
  }

  async function importConfiguration(request) {
    const patch = plainObject(request.patch) ? request.patch : {};
    const unknown = Object.keys(patch).filter((key) => !CONFIG_IMPORT_FIELDS.has(key));
    if (unknown.length) throw new OfficialRulesError("INVALID_CONFIG_REQUEST", `Unknown import fields: ${unknown.join(", ")}`);
    const { additionalValues, saved } = importAdditionalValues(patch);
    const configPatch = {};
    if (Object.hasOwn(patch, "options")) {
      configPatch.replaceOptions = true;
      if (patch.options?.optionsSchemaVersion === OFFICIAL_RULES_OPTIONS_SCHEMA_VERSION) {
        configPatch.options = validateStoredV4(patch.options);
        configPatch.optionsMode = "stored";
      } else {
        configPatch.options = await migrateLegacyOptionsToStoredV4(patch.options);
        configPatch.optionsMode = "stored";
      }
      saved.options = patch.options;
    }
    if (Object.hasOwn(patch, "customConfig")) {
      configPatch.customConfig = patch.customConfig;
      saved.customConfig = normalizeCustomConfig(patch.customConfig);
    }
    const snapshot = await patchConfiguration({ ...request, patch: configPatch }, additionalValues);
    if (Object.hasOwn(patch, "options")) saved.options = snapshot.options;
    return { snapshot, saved };
  }

  async function resetConfiguration(request, resetDependencies = {}) {
    await configurationReady;
    return transitionCoordinator.run(async () => {
      const current = await configRepository.getConfigSnapshot();
      assertConfigRequestRevisions(current, request);
      const resetMaterialized = OFFICIAL_RULES_PACKAGED_MATERIALIZED;
      const resetStored = projectEffectiveOptionsToStoredV4(packagedOptions, resetMaterialized, {
        packagedOptions,
        previousStoredOptions: {},
        isDeleteAliasApproved: () => false
      });
      const resetConfigurationValue = await effectiveConfiguration(resetMaterialized, resetStored, []);
      const state = await repository.readState();
      const started = state.journal.phase === "idle"
        ? await repository.beginConfigurationApply({
          expectedActivationRevision: request.expectedActivationRevision,
          reason: "full-reset"
        })
        : null;
      const afterReset = typeof resetDependencies.afterReset === "function"
        ? resetDependencies.afterReset
        : startupAfterReset;
      let committedState = null;
      let cleanupMarker = null;
      try {
        await resetDependencies.beforeReset?.();
        const allStored = await storage.get(null);
        const workspaceSessionGeneration = String(createResetGeneration() || "").trim();
        if (!workspaceSessionGeneration || workspaceSessionGeneration.length > 256) {
          throw new OfficialRulesError("CONFIG_RESET_FAILED", "Workspace reset generation is unavailable");
        }
        cleanupMarker = createPendingResetCleanup(
          allStored,
          Boolean(afterReset),
          workspaceSessionGeneration,
          clock()
        );
        await applyRuntimeConfiguration(resetConfigurationValue, {
          phase: "full-reset",
          ...(started ? { attemptId: started.journal.attemptId } : {})
        });
        committedState = await repository.resetForFullConfigReset(OFFICIAL_RULES_PACKAGED_SNAPSHOT, {
          [STORAGE_KEYS.options]: resetStored,
          [STORAGE_KEYS.customConfig]: [],
          [STORAGE_KEYS.promptLibrary]: normalizePromptLibrary([]),
          [STORAGE_KEYS.promptSendHistory]: normalizePromptSendHistory([]),
          [STORAGE_KEYS.shortcutConfig]: normalizeShortcutConfig({}),
          [STORAGE_KEYS.pocketHistory]: dedupePocketHistory([]),
          [WORKSPACE_SESSION_GENERATION_KEY]: workspaceSessionGeneration,
          [OFFICIAL_RULES_CONFIG_REVISION_KEY]: { version: 1, revision: current.revision + 1, updatedAt: clock() },
          [OFFICIAL_DELETE_ALIAS_APPROVALS_KEY]: {
            version: ALIAS_APPROVALS_VERSION,
            approvals: {},
            updatedAt: clock()
          },
          [OFFICIAL_RULES_RESET_CLEANUP_KEY]: cleanupMarker
        });
      } catch (error) {
        if (started) {
          const failedState = await repository.readState().catch(() => null);
          if (failedState?.journal?.attemptId === started.journal.attemptId) {
            return compensateConfigurationApply(started.journal, current, error, {
              code: "CONFIG_RESET_FAILED",
              message: "Configuration reset persistence failed and the previous runtime configuration could not be restored",
              restorePhase: "full-reset-restore"
            });
          }
          throw error;
        }
        try {
          await applyRuntimeConfiguration({ options: current.options, customConfig: current.customConfig }, {
            phase: "full-reset-restore"
          });
        } catch (restoreError) {
          if (state.journal.phase !== "idle") {
            return enterConfigurationRecovery(state.journal, error, restoreError, {
              code: "CONFIG_RESET_FAILED",
              message: "Configuration reset persistence failed and the previous runtime configuration could not be restored"
            });
          }
          recoveryRequired = true;
          await failClosedDelete().catch(() => {});
          await alarmController.clear().catch(() => {});
          throw new OfficialRulesError("CONFIG_RESET_FAILED", "Configuration reset persistence failed and runtime restoration also failed", {
            causeMessage: String(error?.message || error),
            restoreMessage: String(restoreError?.message || restoreError)
          });
        }
        throw error;
      }
      recoveryRequired = false;
      aliasApprovals.clear();
      const cleanup = await completePendingResetCleanup(cleanupMarker, { afterReset });
      const snapshot = {
        revision: current.revision + 1,
        activationRevision: committedState.activationRevision,
        activeOfficialRules: clone(committedState.active),
        storedOptions: clone(resetStored),
        options: clone(resetConfigurationValue.options),
        customConfig: []
      };
      return {
        snapshot,
        workspaceSessionGeneration: cleanup.workspaceSessionGeneration,
        committed: true,
        cleanupWarnings: cleanup.warnings
      };
    });
  }

  async function reloadConfiguration(context = {}) {
    await configurationReady;
    return transitionCoordinator.run(async () => {
      const state = await repository.readState();
      const materialized = await materializeRules(state.active, { state });
      return applyRuntimeConfiguration(await effectiveConfiguration(materialized), {
        phase: "reload",
        ...context
      });
    });
  }

  function requestHandlers(ACTION, dependencies = {}) {
    const mapped = (fallbackCode, task) => async (...args) => {
      try { return await task(...args); }
      catch (error) {
        const declared = new Set([
          "CONFIG_REVISION_CONFLICT", "ACTIVATION_REVISION_CONFLICT", "CONFIG_APPLY_FAILED", "CONFIG_RESET_FAILED",
          "INVALID_CONFIG_REQUEST", "OFFICIAL_RULES_STATE_CONFLICT", "INVALID_OFFICIAL_RULES_REQUEST",
          "RECOVERY_REQUIRED"
        ]);
        if (declared.has(error?.code)) throw error;
        throw externalError(fallbackCode, error?.message || fallbackCode, error);
      }
    };
    return [
      [ACTION.GET_CONFIG_SNAPSHOT, async () => ({ snapshot: await getConfigSnapshot() })],
      [ACTION.PATCH_CONFIG, mapped("INVALID_CONFIG_REQUEST", async (message) => ({ snapshot: await patchConfiguration(message) }))],
      [ACTION.IMPORT_CONFIG, mapped("INVALID_CONFIG_REQUEST", (message) => importConfiguration(message))],
      [ACTION.RESET_CONFIG, mapped("CONFIG_RESET_FAILED", (message, _sender, tabId) => resetConfiguration(message, {
        beforeReset: () => dependencies.beforeReset?.(tabId),
        afterReset: typeof dependencies.afterReset === "function"
          ? (workspaceSessionGeneration) => dependencies.afterReset(tabId, workspaceSessionGeneration)
          : undefined
      }))],
      [ACTION.GET_OFFICIAL_RULES_STATUS, async () => ({ status: await statusSnapshot() })],
      [ACTION.SET_OFFICIAL_RULES_MODE, mapped("INVALID_OFFICIAL_RULES_REQUEST", async (message) => ({ status: await setMode(message) }))],
      [ACTION.CHECK_OFFICIAL_RULES_UPDATE, mapped("OFFICIAL_RULES_UPDATE_FAILED", (message) => checkUpdate(message))],
      [ACTION.APPLY_OFFICIAL_RULES_UPDATE, mapped("OFFICIAL_RULES_APPLY_FAILED", (message) => applyUpdate(message))],
      [ACTION.ROLLBACK_OFFICIAL_COMPONENT, mapped("OFFICIAL_RULES_APPLY_FAILED", (message) => rollbackComponent(message))],
      [ACTION.ROLLBACK_LAST_RULES_UPDATE, mapped("OFFICIAL_RULES_APPLY_FAILED", (message) => rollbackLast(message))],
      [ACTION.RESTORE_OFFICIAL_COMPONENT, mapped("OFFICIAL_RULES_APPLY_FAILED", (message) => restoreComponent(message))],
      [ACTION.SET_OFFICIAL_DELETE_ALIAS_APPROVAL, mapped("INVALID_OFFICIAL_RULES_REQUEST", (message) => setDeleteAliasApproval(message))]
    ];
  }

  return Object.freeze({
    configurationReady,
    repository,
    transitionCoordinator,
    requestHandlers,
    getConfigSnapshot,
    getStatus: statusSnapshot,
    reloadConfiguration,
    loadOptions: async () => (await getConfigSnapshot()).options,
    loadCustomConfig: async () => (await getConfigSnapshot()).customConfig,
    assertDestructiveOperationsAllowed: async () => {
      await configurationReady;
      const state = await repository.readState();
      if (recoveryRequired || state.journal.phase === "recovery-required") {
        throw new OfficialRulesError(
          "RECOVERY_REQUIRED",
          "Delete is disabled until official-rules recovery is completed or configuration is reset"
        );
      }
      return true;
    },
    handleAlarm: async (alarm) => {
      await configurationReady;
      return transitionCoordinator.run(async () => {
        const state = await repository.readState();
        return recoveryRequired || state.journal.phase === "recovery-required"
          ? { status: "recovery-required" }
          : alarmController.handleAlarm(alarm);
      });
    },
    handleInstalled: async () => {
      await configurationReady;
      const state = await repository.readState();
      return recoveryRequired || state.journal.phase === "recovery-required"
        ? alarmController.clear()
        : transitionCoordinator.run(() => alarmController.ensureScheduled());
    },
    handleStartup: async () => {
      await configurationReady;
      const state = await repository.readState();
      return recoveryRequired || state.journal.phase === "recovery-required"
        ? alarmController.clear()
        : transitionCoordinator.run(() => alarmController.ensureScheduled());
    },
    alarmName: OFFICIAL_RULES_ALARM_NAME
  });
}
