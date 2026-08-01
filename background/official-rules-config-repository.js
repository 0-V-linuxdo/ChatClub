import {
  officialRulesComponentKey
} from "../shared/official-rules-baseline.js";
import {
  OFFICIAL_RULE_USER_OVERRIDE_FIELDS,
  canonicalizeOfficialRuleOverrides
} from "../shared/official-rules-user-config.js";
import { OfficialRulesError } from "./official-rules-channel.js";

export const OFFICIAL_RULES_CONFIG_REVISION_KEY = "chatclubOfficialRulesConfigRevisionV1";
const OFFICIAL_RULES_CONFIG_REVISION_VERSION = 1;
export const OFFICIAL_RULES_OPTIONS_SCHEMA_VERSION = 4;

export const OFFICIAL_RULE_FEATURE_FIELDS = Object.freeze({
  summary: "summarySiteConfigs",
  messageNavigator: "messageNavigatorSiteConfigs",
  delete: "topicDeleteSiteConfigs"
});

class ConfigRevisionConflictError extends OfficialRulesError {
  constructor(message, details = {}) {
    super("CONFIG_REVISION_CONFLICT", message, details);
    this.name = "ConfigRevisionConflictError";
  }
}

function fail(code, message, details = {}) {
  throw new OfficialRulesError(code, message, details);
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { fail("INVALID_CONFIG", "ChatClub configuration must be JSON serializable"); }
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function configId(config) {
  return String(config?.id || "").trim();
}

function explicitCustomIntent(config) {
  return config?.builtIn === false
    || config?.sourceMode === "custom"
    || typeof config?.customUserscript === "string"
    || config?.userscriptOverride === true;
}

function stripOfficialRuleDerivedFields(config) {
  const sanitized = clone(config);
  for (const key of Object.keys(sanitized || {})) {
    if (key.startsWith("officialRule")) delete sanitized[key];
  }
  return sanitized;
}

function customOrderToken(feature, id) {
  return `custom/${feature}/${id}`;
}

function isCustomOrderToken(value, feature) {
  return String(value || "").startsWith(`custom/${feature}/`);
}

function selectorUnion(selectors) {
  return (Array.isArray(selectors) ? selectors : []).filter(Boolean).join(",");
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function packagedExactHostCovers(hosts = [], candidate = "") {
  const host = String(candidate || "").trim().toLowerCase();
  return (Array.isArray(hosts) ? hosts : []).some((entry) => (
    !String(entry || "").trim().startsWith("*.")
      && String(entry || "").trim().toLowerCase() === host
  ));
}

function componentOverlay(component, base = {}, options = {}) {
  const selectors = clone(component.selectors || {});
  const parameters = clone(component.parameters || {});
  const key = officialRulesComponentKey(component.feature, component.siteId);
  const packagedExactHosts = component.feature === "delete" && Array.isArray(base.deleteAuthorizedHosts)
    ? base.deleteAuthorizedHosts
    : base.hosts;
  const candidateHosts = component.feature === "delete"
    ? (component.hosts || []).filter((host) => packagedExactHostCovers(packagedExactHosts, host)
      || options.isDeleteAliasApproved?.(key, host) === true)
    : component.hosts || [];
  const officialRuleHttpsHosts = uniqueStrings(candidateHosts.filter((host) => (
    !packagedExactHostCovers(packagedExactHosts, host)
  )));
  const common = {
    id: component.siteId,
    builtIn: true,
    hosts: uniqueStrings(base.hosts || []),
    officialRuleHttpsHosts,
    officialRuleHosts: uniqueStrings(candidateHosts),
    officialRulePathPrefixes: uniqueStrings(component.pathPrefixes || []),
    pathPrefixes: uniqueStrings([...(base.pathPrefixes || []), ...(component.pathPrefixes || [])]),
    officialRuleRevision: component.revision,
    officialRuleStatus: component.status,
    officialRuleHints: selectors,
    officialRuleParameters: parameters
  };
  if (component.feature === "summary") {
    return { ...common, officialRuleWaitMs: parameters.waitMs };
  }
  if (component.feature === "messageNavigator") {
    return {
      ...common,
      officialRuleMessageSelector: selectorUnion(selectors.message),
      officialRuleUserSelector: selectorUnion(selectors.userRole),
      officialRuleAssistantSelector: selectorUnion(selectors.assistantRole),
      officialRuleSummaryMaxChars: parameters.summaryMaxChars
    };
  }
  if (component.feature === "delete") {
    const packagedAuthorizedHosts = uniqueStrings(
      Array.isArray(base.deleteAuthorizedHosts)
        ? base.deleteAuthorizedHosts
        : (base.hosts || []).filter((host) => !String(host || "").trim().startsWith("*."))
    );
    return {
      ...common,
      deleteAuthorizedHosts: uniqueStrings([...packagedAuthorizedHosts, ...candidateHosts]),
      officialRuleTimeoutMs: parameters.timeoutMs
    };
  }
  fail("INVALID_COMPONENT", `Unknown official-rules feature ${component.feature}`);
}

function packagedConfigMaps(packagedOptions = {}) {
  const maps = {};
  for (const [feature, field] of Object.entries(OFFICIAL_RULE_FEATURE_FIELDS)) {
    maps[feature] = new Map((Array.isArray(packagedOptions[field]) ? packagedOptions[field] : [])
      .filter(plainObject)
      .map((config) => [configId(config), clone(config)]));
  }
  return maps;
}

function materializedComponentsByFeature(materializedRules) {
  const result = Object.fromEntries(Object.keys(OFFICIAL_RULE_FEATURE_FIELDS).map((feature) => [feature, new Map()]));
  for (const component of Object.values(materializedRules?.components || {})) {
    if (!component || !result[component.feature]) continue;
    result[component.feature].set(component.siteId, component);
  }
  return result;
}

function normalizedOverrides(storedOptions) {
  return canonicalizeOfficialRuleOverrides(storedOptions?.officialOverrides);
}

function normalizedOrders(storedOptions) {
  return plainObject(storedOptions?.officialOrders) ? storedOptions.officialOrders : {};
}

function effectiveFeatureConfigs(feature, storedOptions, packagedMap, componentMap, options = {}) {
  const field = OFFICIAL_RULE_FEATURE_FIELDS[feature];
  const custom = (Array.isArray(storedOptions[field]) ? storedOptions[field] : [])
    .filter((config) => plainObject(config) && explicitCustomIntent(config))
    .map(stripOfficialRuleDerivedFields);
  const customById = new Map(custom.map((config) => [configId(config), config]));
  const overrides = normalizedOverrides(storedOptions);
  const official = new Map();
  for (const [siteId, component] of componentMap) {
    const base = packagedMap.get(siteId);
    if (!base) fail("PACKAGED_COMPONENT_MISSING", `Packaged ${feature} config ${siteId} is unavailable`);
    const key = officialRulesComponentKey(feature, siteId);
    const override = plainObject(overrides[key]) ? clone(overrides[key]) : {};
    const merged = { ...base, ...componentOverlay(component, base, options), ...override, id: siteId, builtIn: true };
    if (component.status !== "active") merged.enabled = false;
    official.set(key, merged);
  }

  const order = Array.isArray(normalizedOrders(storedOptions)[feature])
    ? normalizedOrders(storedOptions)[feature].map(String)
    : [];
  const output = [];
  const consumedOfficial = new Set();
  const consumedCustom = new Set();
  const append = (token) => {
    if (isCustomOrderToken(token, feature)) {
      const id = token.slice(`custom/${feature}/`.length);
      if (!id || consumedCustom.has(id) || !customById.has(id)) return;
      output.push(customById.get(id));
      consumedCustom.add(id);
      return;
    }
    const config = official.get(token);
    if (!config || consumedOfficial.has(token)) return;
    const collidingCustom = customById.get(config.id);
    if (collidingCustom) {
      if (!consumedCustom.has(config.id)) {
        output.push(collidingCustom);
        consumedCustom.add(config.id);
      }
    } else {
      output.push(config);
    }
    consumedOfficial.add(token);
  };
  order.forEach(append);
  for (const key of official.keys()) append(key);
  for (const config of custom) append(customOrderToken(feature, configId(config)));
  return output;
}

export function mergeOfficialRuleComponents(storedOptions = {}, materializedRules = null, options = {}) {
  const result = clone(plainObject(storedOptions) ? storedOptions : {});
  if (!materializedRules?.components) return result;
  const packagedMaps = packagedConfigMaps(options.packagedOptions || {});
  const components = materializedComponentsByFeature(materializedRules);
  for (const feature of Object.keys(OFFICIAL_RULE_FEATURE_FIELDS)) {
    result[OFFICIAL_RULE_FEATURE_FIELDS[feature]] = effectiveFeatureConfigs(
      feature,
      result,
      packagedMaps[feature],
      components[feature],
      options
    );
  }
  return result;
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sparseOverride(feature, effective, official) {
  const result = {};
  for (const field of OFFICIAL_RULE_USER_OVERRIDE_FIELDS[feature] || []) {
    if (Object.hasOwn(effective, field) && !valuesEqual(effective[field], official[field])) result[field] = clone(effective[field]);
  }
  return result;
}

export function projectEffectiveOptionsToStoredV4(effectiveOptions = {}, materializedRules = null, options = {}) {
  const effective = clone(plainObject(effectiveOptions) ? effectiveOptions : {});
  const previousStored = plainObject(options.previousStoredOptions) ? options.previousStoredOptions : {};
  const packagedMaps = packagedConfigMaps(options.packagedOptions || {});
  const components = materializedComponentsByFeature(materializedRules);
  const stored = { ...effective, optionsSchemaVersion: OFFICIAL_RULES_OPTIONS_SCHEMA_VERSION };
  const officialOrders = {};
  const officialOverrides = clone(normalizedOverrides(previousStored));

  for (const [feature, field] of Object.entries(OFFICIAL_RULE_FEATURE_FIELDS)) {
    const officialEffective = new Map();
    for (const [siteId, component] of components[feature]) {
      const base = packagedMaps[feature].get(siteId);
      if (!base) fail("PACKAGED_COMPONENT_MISSING", `Packaged ${feature} config ${siteId} is unavailable`);
      const config = { ...base, ...componentOverlay(component, base, options), id: siteId, builtIn: true };
      if (component.status !== "active") config.enabled = false;
      officialEffective.set(siteId, config);
    }
    const customEntries = [];
    const order = [];
    for (const config of Array.isArray(effective[field]) ? effective[field] : []) {
      if (!plainObject(config)) continue;
      const id = configId(config);
      if (!id) continue;
      const key = officialRulesComponentKey(feature, id);
      if (explicitCustomIntent(config) || !officialEffective.has(id)) {
        customEntries.push(stripOfficialRuleDerivedFields(config));
        order.push(customOrderToken(feature, id));
        if (officialEffective.has(id)) delete officialOverrides[key];
        continue;
      }
      order.push(key);
      const override = sparseOverride(feature, config, officialEffective.get(id));
      if (Object.keys(override).length) officialOverrides[key] = override;
      else delete officialOverrides[key];
    }
    for (const siteId of officialEffective.keys()) {
      const key = officialRulesComponentKey(feature, siteId);
      if (!order.includes(key) && !customEntries.some((config) => configId(config) === siteId)) order.push(key);
    }
    stored[field] = customEntries;
    officialOrders[feature] = [...new Set(order)];
  }
  stored.officialOrders = officialOrders;
  stored.officialOverrides = officialOverrides;
  return stored;
}

export function createOfficialRulesStorageConfigAdapter(options = {}) {
  const storage = options.storage;
  if (typeof storage?.get !== "function" || typeof storage?.set !== "function") {
    throw new TypeError("Official-rules storage config adapter requires storage.local-compatible get/set methods");
  }
  const optionsKey = String(options.optionsKey || "options");
  const customConfigKey = String(options.customConfigKey || "customConfig");
  const revisionKey = String(options.revisionKey || OFFICIAL_RULES_CONFIG_REVISION_KEY);
  const normalizeStoredOptions = typeof options.normalizeStoredOptions === "function" ? options.normalizeStoredOptions : (value) => clone(plainObject(value) ? value : {});
  const normalizeCustomConfig = typeof options.normalizeCustomConfig === "function" ? options.normalizeCustomConfig : (value) => clone(Array.isArray(value) ? value : []);

  function canonicalStoredOptions(value) {
    const normalized = normalizeStoredOptions(value);
    if (!plainObject(normalized)) return {};
    const canonical = {
      ...normalized,
      officialOverrides: canonicalizeOfficialRuleOverrides(normalized.officialOverrides)
    };
    for (const field of Object.values(OFFICIAL_RULE_FEATURE_FIELDS)) {
      if (Array.isArray(canonical[field])) canonical[field] = canonical[field].map(stripOfficialRuleDerivedFields);
    }
    return canonical;
  }

  async function loadOptions() {
    const stored = await storage.get(optionsKey);
    return canonicalStoredOptions(stored?.[optionsKey]);
  }

  async function loadCustomConfig() {
    const stored = await storage.get(customConfigKey);
    return normalizeCustomConfig(stored?.[customConfigKey]);
  }

  async function readRevision() {
    const stored = await storage.get(revisionKey);
    const record = stored?.[revisionKey];
    return plainObject(record) && Number(record.version) === OFFICIAL_RULES_CONFIG_REVISION_VERSION
      ? nonNegativeInteger(record.revision)
      : 0;
  }

  async function prepareConfigCommit({ options: nextOptions, customConfig, revision, previousRevision, additionalValues = {} }) {
    const current = await readRevision();
    if (current !== previousRevision) {
      throw new ConfigRevisionConflictError(`Expected config revision ${previousRevision}, received ${current}`, {
        expectedRevision: previousRevision,
        actualRevision: current
      });
    }
    const normalizedOptions = canonicalStoredOptions(nextOptions);
    const normalizedCustomConfig = normalizeCustomConfig(customConfig);
    const extras = plainObject(additionalValues) ? clone(additionalValues) : {};
    for (const reserved of [optionsKey, customConfigKey, revisionKey]) delete extras[reserved];
    const values = {
      ...extras,
      [optionsKey]: normalizedOptions,
      [customConfigKey]: normalizedCustomConfig,
      [revisionKey]: { version: OFFICIAL_RULES_CONFIG_REVISION_VERSION, revision, updatedAt: Date.now() }
    };
    return {
      values,
      result: { options: normalizedOptions, customConfig: normalizedCustomConfig, revision }
    };
  }

  async function commitConfig(request) {
    const prepared = await prepareConfigCommit(request);
    await storage.set(prepared.values);
    return prepared.result;
  }

  return Object.freeze({ loadOptions, loadCustomConfig, readRevision, prepareConfigCommit, commitConfig });
}

export function createOfficialRulesConfigRepository(options = {}) {
  const rulesRepository = options.officialRulesRepository;
  const materializeRules = options.materializeRules;
  const defaultLoadOptions = options.loadOptions;
  const defaultLoadCustomConfig = options.loadCustomConfig;
  const readRevision = options.readRevision;
  const commitConfig = options.commitConfig;
  if (!rulesRepository?.readState || typeof materializeRules !== "function") {
    throw new TypeError("Official-rules config repository requires officialRulesRepository and materializeRules");
  }
  if (typeof defaultLoadOptions !== "function" || typeof defaultLoadCustomConfig !== "function" || typeof readRevision !== "function") {
    throw new TypeError("Official-rules config repository requires loadOptions, loadCustomConfig, and readRevision");
  }
  const packagedOptions = options.packagedOptions || {};
  const isDeleteAliasApproved = typeof options.isDeleteAliasApproved === "function"
    ? options.isDeleteAliasApproved
    : () => false;
  const mergeEffectiveOptions = typeof options.mergeEffectiveOptions === "function"
    ? options.mergeEffectiveOptions
    : (stored, rules) => mergeOfficialRuleComponents(stored, rules, { packagedOptions, isDeleteAliasApproved });
  const normalizeCustomConfig = typeof options.normalizeCustomConfig === "function"
    ? options.normalizeCustomConfig
    : (value) => clone(Array.isArray(value) ? value : []);
  const transitionCoordinator = options.transitionCoordinator || null;
  if (transitionCoordinator && typeof transitionCoordinator.run !== "function") {
    throw new TypeError("Official-rules config transition coordinator requires run(task)");
  }
  let writeTail = Promise.resolve();

  async function internalSnapshot(loaders = {}) {
    const loadOptions = typeof loaders.loadOptions === "function" ? loaders.loadOptions : defaultLoadOptions;
    const loadCustomConfig = typeof loaders.loadCustomConfig === "function" ? loaders.loadCustomConfig : defaultLoadCustomConfig;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const before = await rulesRepository.readState();
      const revisionBefore = nonNegativeInteger(await readRevision());
      const [storedOptions, customConfig, materialized] = await Promise.all([
        loadOptions(),
        loadCustomConfig(),
        materializeRules(before.active, { state: before })
      ]);
      const revisionAfter = nonNegativeInteger(await readRevision());
      const after = await rulesRepository.readState();
      if (
        revisionBefore !== revisionAfter
        || before.activationRevision !== after.activationRevision
        || before.active?.catalogHash !== after.active?.catalogHash
        || before.active?.source !== after.active?.source
      ) continue;
      const effectiveOptions = await mergeEffectiveOptions(storedOptions, materialized, {
        active: before.active,
        activationRevision: before.activationRevision
      });
      return {
        revision: revisionAfter,
        activationRevision: before.activationRevision,
        activeOfficialRules: before.active ? clone(before.active) : null,
        storedOptions: clone(storedOptions),
        options: clone(effectiveOptions),
        customConfig: clone(customConfig),
        materialized
      };
    }
    fail("CONFIG_SNAPSHOT_UNSTABLE", "Official-rules activation changed repeatedly while loading configuration");
  }

  async function getConfigSnapshot(loaders = {}) {
    const snapshot = await internalSnapshot(loaders);
    const publicSnapshot = { ...snapshot };
    delete publicSnapshot.materialized;
    return Object.freeze(publicSnapshot);
  }

  function patchConfig(request = {}, operationOptions = {}) {
    const operation = async () => {
      const commit = typeof operationOptions.commitConfig === "function"
        ? operationOptions.commitConfig
        : commitConfig;
      if (typeof commit !== "function") fail("CONFIG_COMMIT_UNAVAILABLE", "Atomic config commit is not configured");
      if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
        fail("INVALID_CONFIG_REVISION", "patchConfig requires a non-negative expectedRevision");
      }
      const patch = plainObject(request.patch) ? request.patch : {};
      const unknown = Object.keys(patch).filter((key) => !["options", "customConfig", "replaceOptions", "optionsMode", "additionalValues"].includes(key));
      if (unknown.length) fail("INVALID_CONFIG_PATCH", `Unknown config patch fields: ${unknown.join(", ")}`);
      const current = await internalSnapshot();
      if (current.revision !== request.expectedRevision) {
        throw new ConfigRevisionConflictError(`Expected config revision ${request.expectedRevision}, received ${current.revision}`, {
          expectedRevision: request.expectedRevision,
          actualRevision: current.revision
        });
      }
      if (!Number.isSafeInteger(request.expectedActivationRevision)
        || request.expectedActivationRevision < 0
        || request.expectedActivationRevision !== current.activationRevision) {
        fail("ACTIVATION_REVISION_CONFLICT", `Expected activation revision ${request.expectedActivationRevision}, received ${current.activationRevision}`);
      }
      let nextStoredOptions = current.storedOptions;
      if (Object.hasOwn(patch, "options")) {
        const input = plainObject(patch.options) ? patch.options : {};
        if (patch.optionsMode === "stored") {
          nextStoredOptions = patch.replaceOptions === true ? clone(input) : { ...current.storedOptions, ...clone(input) };
        } else {
          const nextEffective = patch.replaceOptions === true ? clone(input) : { ...current.options, ...clone(input) };
          nextStoredOptions = projectEffectiveOptionsToStoredV4(nextEffective, current.materialized, {
            packagedOptions,
            isDeleteAliasApproved,
            previousStoredOptions: current.storedOptions
          });
        }
      }
      const nextCustomConfig = Object.hasOwn(patch, "customConfig")
        ? normalizeCustomConfig(patch.customConfig)
        : current.customConfig;
      await commit({
        options: nextStoredOptions,
        customConfig: nextCustomConfig,
        revision: current.revision + 1,
        previousRevision: current.revision,
        activationRevision: current.activationRevision,
        additionalValues: patch.additionalValues
      });
      return getConfigSnapshot();
    };
    const serialized = () => transitionCoordinator ? transitionCoordinator.run(operation) : operation();
    const queued = writeTail.catch(() => {}).then(serialized);
    writeTail = queued.then(() => undefined, () => undefined);
    return queued;
  }

  return Object.freeze({ getConfigSnapshot, patchConfig });
}
