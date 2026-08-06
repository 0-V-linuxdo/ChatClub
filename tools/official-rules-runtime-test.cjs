#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { createOfficialRulesRuntime } = await import("../background/official-rules-runtime.js");
  const OFFICIAL_RULES_RESET_CLEANUP_KEY = "chatclubOfficialRulesResetCleanupV1";
  const { OFFICIAL_RULES_BLOB_PREFIX, createOfficialRulesRepository } = await import("../background/official-rules-repository.js");
  const { OFFICIAL_RULES_CONFIG_REVISION_KEY } = await import("../background/official-rules-config-repository.js");
  const {
    OFFICIAL_RULES_PACKAGED_COMPONENTS,
    OFFICIAL_RULES_PACKAGED_MATERIALIZED
  } = await import("../shared/official-rules-packaged.js");
  const {
    OFFICIAL_RULES_COMPONENT_KEYS,
    findOfficialRulesBaselineComponent
  } = await import("../shared/official-rules-baseline.js");
  const {
    officialRulesSignatureInput,
    sha256Hex
  } = await import("../background/official-rules-channel.js");
  const { createStrictRuntimeConfigApplier } = await import("../background/runtime-config-application.js");
  const { CONTENT_BUNDLES } = await import("../shared/frame-commands.js");
  const { BACKGROUND_REQUEST_ACTIONS } = await import("../shared/background-requests.js");
  const { inspectImportedConfig } = await import("../shared/storage-config-bundle.js");
  const { SUMMARY_SITE_CONFIGS } = await import("../shared/summary-sites.js");
  const { MESSAGE_NAVIGATOR_SITE_CONFIGS } = await import("../shared/message-navigator-sites.js");
  const { TOPIC_DELETE_SITE_CONFIGS } = await import("../shared/topic-delete-sites.js");
  const { STORAGE_KEYS } = await import("../shared/constants.js");
  const { normalizeShortcutConfig } = await import("../shared/storage-schema.js");
  const { WORKSPACE_SESSION_GENERATION_KEY } = await import("../shared/workspace-session.js");

  function memoryStorage(initial = {}) {
    const values = structuredClone(initial);
    const sets = [];
    return {
      sets,
      values,
      async get(keys) {
        if (keys === null) return structuredClone(values);
        const wanted = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(wanted.filter((key) => Object.hasOwn(values, key)).map((key) => [key, structuredClone(values[key])]));
      },
      async set(patch) {
        sets.push(structuredClone(patch));
        Object.assign(values, structuredClone(patch));
      },
      async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; }
    };
  }

  const integrationCrypto = globalThis.crypto;
  const integrationSigningKey = await integrationCrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const integrationKeyId = "official-rules-runtime-integration-key";
  const integrationKeyring = {
    [integrationKeyId]: {
      algorithm: "ECDSA-P256-SHA256",
      publicKey: integrationSigningKey.publicKey
    }
  };
  const encode = (value) => new TextEncoder().encode(value);

  function remoteComponentSet(revision) {
    return Object.fromEntries(Object.entries(OFFICIAL_RULES_PACKAGED_COMPONENTS).map(([key, component]) => {
      const baseline = findOfficialRulesBaselineComponent(component.feature, component.siteId);
      const hosts = component.feature === "delete"
        ? baseline.packagedExactHosts.slice(0, 1)
        : baseline.trustRoots.slice(0, 1);
      return [key, {
        ...structuredClone(component),
        revision,
        hosts
      }];
    }));
  }

  async function putSignedIntegrationComponent(repository, component, tag) {
    const rawText = JSON.stringify(component);
    const bytes = encode(rawText);
    const signature = new Uint8Array(await integrationCrypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      integrationSigningKey.privateKey,
      officialRulesSignatureInput("component", bytes)
    ));
    const signatureText = JSON.stringify({
      schemaVersion: 1,
      keyId: integrationKeyId,
      algorithm: "ECDSA-P256-SHA256",
      signature: Buffer.from(signature).toString("base64url")
    });
    const hash = await sha256Hex(bytes, integrationCrypto);
    await repository.putBlob({
      hash,
      kind: "component",
      rawText,
      signatureText,
      keyId: integrationKeyId
    });
    return {
      feature: component.feature,
      siteId: component.siteId,
      revision: component.revision,
      sha256: hash,
      size: bytes.byteLength,
      keyId: integrationKeyId,
      url: `https://github.com/0-V-linuxdo/ChatClub-rules/releases/download/${tag}/${component.feature}-${component.siteId}.json`,
      signatureUrl: `https://github.com/0-V-linuxdo/ChatClub-rules/releases/download/${tag}/${component.feature}-${component.siteId}.json.sig.json`
    };
  }

  async function putIntegrationDocument(repository, kind, label) {
    const rawText = JSON.stringify({ kind, label });
    const hash = await sha256Hex(encode(rawText), integrationCrypto);
    await repository.putBlob({
      hash,
      kind,
      rawText,
      signatureText: JSON.stringify({ fixture: true }),
      keyId: integrationKeyId
    });
    return hash;
  }

  async function stageIntegrationCandidate(runtimeValue, sequence, targets) {
    const channelHash = await putIntegrationDocument(runtimeValue.repository, "channel", `channel-${sequence}`);
    const catalogHash = await putIntegrationDocument(runtimeValue.repository, "catalog", `catalog-${sequence}`);
    return runtimeValue.repository.stageCandidate({
      source: "remote",
      sequence,
      rulesVersion: `integration-${sequence}`,
      keyId: integrationKeyId,
      channelHash,
      catalogHash,
      officialTargets: targets,
      createdAt: 1_100_000 + sequence
    });
  }

  function integrationUpdater(componentSets) {
    return {
      async checkForUpdates() { return { status: "not-modified" }; },
      async materializeSnapshot(snapshot, options = {}) {
        if (snapshot?.source === "packaged") return options.resolvePackaged(snapshot);
        const components = componentSets.get(snapshot?.sequence);
        if (!components) throw new Error(`missing integration component set ${snapshot?.sequence}`);
        return {
          snapshot,
          channel: {},
          catalog: { releaseNotes: `integration release ${snapshot.sequence}` },
          components
        };
      }
    };
  }

  async function createIntegrationTargets(repository, components, tag, previous = {}) {
    const targets = { ...previous };
    for (const key of OFFICIAL_RULES_COMPONENT_KEYS) {
      if (targets[key] && targets[key].revision === components[key].revision) continue;
      targets[key] = await putSignedIntegrationComponent(repository, components[key], tag);
    }
    return targets;
  }

  async function applyStagedCandidate(runtimeValue, handlers) {
    const statusValue = await runtimeValue.getStatus();
    return handlers.get(BACKGROUND_REQUEST_ACTIONS.APPLY_OFFICIAL_RULES_UPDATE)({
      expectedRevision: statusValue.revision,
      expectedActivationRevision: statusValue.activationRevision
    });
  }

  function canonicalRegistrations(registrations) {
    return structuredClone(registrations).map((registration) => ({
      ...registration,
      matches: [...(registration.matches || [])].sort(),
      excludeMatches: [...(registration.excludeMatches || [])].sort(),
      js: [...(registration.js || [])],
      css: [...(registration.css || [])]
    })).sort((left, right) => left.id.localeCompare(right.id));
  }

  const summary = {
    ...structuredClone(SUMMARY_SITE_CONFIGS.find(({ id }) => id === "chatgpt")),
    name: "My Summary",
    enabled: false,
    hosts: ["local.summary.example"],
    pathPrefixes: ["/mine"],
    fallbackMode: "allowPageText",
    userscriptRunMode: "serial",
    userscriptTimeoutMs: 23456,
    copyTimeoutMs: 4321,
    userscriptFallbackDelayMs: 987
  };
  const navigator = {
    ...structuredClone(MESSAGE_NAVIGATOR_SITE_CONFIGS.find(({ id }) => id === "chatgpt")),
    configVersion: 1,
    name: "My Navigator",
    enabled: false,
    appIds: ["custom-app"],
    hosts: ["local.navigator.example"],
    pathPrefixes: ["/nav"],
    adapter: "custom-adapter",
    messageSelector: ".mine-message",
    userSelector: ".mine-user",
    assistantSelector: ".mine-assistant",
    textCleanupSelectors: [".mine-cleanup"],
    summaryMaxChars: 91
  };
  const navigatorBeforeChatGpt = structuredClone(
    MESSAGE_NAVIGATOR_SITE_CONFIGS.find(({ id }) => id === "claude")
  );
  const deletion = {
    ...structuredClone(TOPIC_DELETE_SITE_CONFIGS.find(({ id }) => id === "chatgpt")),
    name: "My Delete",
    enabled: false,
    appIds: ["custom-app"],
    hosts: ["local.delete.example"],
    pathPrefixes: ["/delete"],
    userscriptTimeoutMs: 34567
  };
  const customSummary = {
    id: "mine",
    name: "Mine",
    builtIn: false,
    sourceMode: "custom",
    hosts: ["mine.example"],
    customUserscript: "return { messages: [] };"
  };
  const storage = memoryStorage({
    options: {
      scriptConfigSchemaVersion: 3,
      summarySiteConfigs: [summary, customSummary],
      messageNavigatorSiteConfigs: [navigatorBeforeChatGpt, navigator],
      topicDeleteSiteConfigs: [deletion]
    },
    customConfig: []
  });
  const alarmsCreated = [];
  let alarmsCleared = 0;
  let networkChecks = 0;
  const applyCalls = [];
  const fakeUpdater = {
    async checkForUpdates() {
      networkChecks += 1;
      return { status: "candidate", candidate: { catalogHash: "f".repeat(64) } };
    },
    async materializeSnapshot(snapshot, options = {}) {
      if (snapshot?.source === "packaged") return options.resolvePackaged(snapshot);
      throw new Error("unexpected remote materialization");
    }
  };
  const api = {
    storage: { local: storage },
    runtime: { getManifest: () => ({ version: "2026.7.31.1" }) },
    alarms: {
      async create(name, details) { alarmsCreated.push({ name, details }); },
      async clear() { alarmsCleared += 1; return true; }
    }
  };
  let resetGenerationAllocations = 0;
  const runtime = createOfficialRulesRuntime(api, {
    updater: fakeUpdater,
    now: () => 1_000_000,
    random: () => 0.25,
    createResetGeneration: () => `workspace-reset-generation-${++resetGenerationAllocations}`,
    applyConfiguration: async (configuration, context) => {
      applyCalls.push({ configuration: structuredClone(configuration), context: structuredClone(context) });
    }
  });
  await runtime.configurationReady;

  const status = await runtime.getStatus();
  assert.equal(status.mode, "undecided");
  assert.equal(status.consentDecided, false);
  assert.equal(networkChecks, 0, "first-run initialization must not contact the network before consent");
  const summaryStatus = status.components.find(({ componentKey }) => componentKey === "summary/chatgpt");
  assert.equal(summaryStatus.source, "user-override");
  assert.deepEqual(summaryStatus.overrideFields, [
    "copyTimeoutMs", "enabled", "fallbackMode", "hosts", "name", "pathPrefixes",
    "userscriptFallbackDelayMs", "userscriptRunMode", "userscriptTimeoutMs"
  ]);

  const stored = storage.values.options;
  assert.equal(stored.optionsSchemaVersion, 4);
  assert.deepEqual(stored.summarySiteConfigs.map(({ id }) => id), ["mine"]);
  assert.equal(stored.summarySiteConfigs[0].customUserscript, customSummary.customUserscript);
  assert.deepEqual(stored.officialOverrides["summary/chatgpt"], {
    name: "My Summary",
    enabled: false,
    hosts: ["local.summary.example"],
    pathPrefixes: ["/mine"],
    fallbackMode: "allowPageText",
    userscriptRunMode: "serial",
    userscriptTimeoutMs: 23456,
    copyTimeoutMs: 4321,
    userscriptFallbackDelayMs: 987
  });
  assert.deepEqual(stored.officialOverrides["messageNavigator/chatgpt"], {
    name: "My Navigator",
    enabled: false,
    appIds: ["custom-app"],
    hosts: ["local.navigator.example"],
    pathPrefixes: ["/nav"],
    adapter: "custom-adapter",
    messageSelector: ".mine-message",
    userSelector: ".mine-user",
    assistantSelector: ".mine-assistant",
    textCleanupSelectors: [".mine-cleanup"],
    summaryMaxChars: 91
  });
  assert.deepEqual(
    stored.officialOrders.messageNavigator.slice(0, 2),
    ["messageNavigator/claude", "messageNavigator/chatgpt"],
    "legacy built-in ordering must survive v3 to v4 migration"
  );
  assert.deepEqual(stored.officialOverrides["delete/chatgpt"], {
    name: "My Delete",
    enabled: false,
    appIds: ["custom-app"],
    hosts: ["local.delete.example"],
    pathPrefixes: ["/delete"],
    userscriptTimeoutMs: 34567
  });

  const beforeAlarm = await runtime.repository.readState();
  await runtime.repository.setAutomaticChecksConsent(true, 1_000_000, beforeAlarm.revision);
  await runtime.handleAlarm({ name: runtime.alarmName });
  const afterAlarm = await runtime.repository.readState();
  assert.equal(networkChecks, 1);
  assert.equal(afterAlarm.active.source, "packaged");
  assert.equal(afterAlarm.activationRevision, beforeAlarm.activationRevision);
  assert.equal(applyCalls.length, 1, "automatic checks may stage a candidate but must never activate it");
  assert.ok(alarmsCreated.length >= 1);
  assert.equal(OFFICIAL_RULES_PACKAGED_MATERIALIZED.snapshot.source, "packaged");
  const guardedHandlers = new Map(runtime.requestHandlers(BACKGROUND_REQUEST_ACTIONS));
  const guardedNetworkCount = networkChecks;
  await assert.rejects(
    guardedHandlers.get(BACKGROUND_REQUEST_ACTIONS.CHECK_OFFICIAL_RULES_UPDATE)({}),
    (error) => error?.code === "OFFICIAL_RULES_STATE_CONFLICT"
  );
  await assert.rejects(
    guardedHandlers.get(BACKGROUND_REQUEST_ACTIONS.CHECK_OFFICIAL_RULES_UPDATE)({ expectedRevision: 0 }),
    (error) => error?.code === "OFFICIAL_RULES_STATE_CONFLICT"
  );
  assert.equal(networkChecks, guardedNetworkCount, "missing or stale manual check revisions must not start a request");
  const beforeFailedReset = await runtime.getConfigSnapshot();
  const appliesBeforeMissingActivation = applyCalls.length;
  await assert.rejects(
    guardedHandlers.get(BACKGROUND_REQUEST_ACTIONS.PATCH_CONFIG)({
      expectedRevision: beforeFailedReset.revision,
      patch: { options: { language: "en_US" } }
    }),
    (error) => error?.code === "ACTIVATION_REVISION_CONFLICT"
  );
  await assert.rejects(
    guardedHandlers.get(BACKGROUND_REQUEST_ACTIONS.IMPORT_CONFIG)({
      expectedRevision: beforeFailedReset.revision,
      patch: { customConfig: [] }
    }),
    (error) => error?.code === "ACTIVATION_REVISION_CONFLICT"
  );
  await assert.rejects(
    guardedHandlers.get(BACKGROUND_REQUEST_ACTIONS.RESET_CONFIG)({
      expectedRevision: beforeFailedReset.revision
    }),
    (error) => error?.code === "ACTIVATION_REVISION_CONFLICT"
  );
  assert.equal(applyCalls.length, appliesBeforeMissingActivation, "missing activation revisions must fail before runtime preparation");
  const originalStorageSet = storage.set.bind(storage);
  let failAtomicReset = true;
  storage.set = async (patch) => {
    if (failAtomicReset && Object.hasOwn(patch, "chatclubOfficialRulesStateV1") && Object.hasOwn(patch, "options")) {
      failAtomicReset = false;
      throw new Error("fixture atomic reset write failed");
    }
    return originalStorageSet(patch);
  };
  await assert.rejects(
    guardedHandlers.get(BACKGROUND_REQUEST_ACTIONS.RESET_CONFIG)({
      expectedRevision: beforeFailedReset.revision,
      expectedActivationRevision: beforeFailedReset.activationRevision
    }),
    (error) => error?.code === "CONFIG_RESET_FAILED"
  );
  storage.set = originalStorageSet;
  const afterFailedReset = await runtime.getConfigSnapshot();
  assert.equal(afterFailedReset.revision, beforeFailedReset.revision);
  assert.deepEqual(afterFailedReset.storedOptions, beforeFailedReset.storedOptions);
  assert.equal(applyCalls.at(-1).context.phase, "full-reset-restore", "failed atomic reset storage must restore the previous runtime config");

  storage.values.resetCleanupFixture = { stale: true };
  storage.values[`${OFFICIAL_RULES_BLOB_PREFIX}${"a".repeat(64)}`] = { stale: true };
  storage.values[STORAGE_KEYS.promptLibrary] = [{ id: "stale-prompt", title: "Stale", prompt: "stale" }];
  storage.values[STORAGE_KEYS.promptSendHistory] = [{ text: "stale", images: [] }];
  storage.values[STORAGE_KEYS.shortcutConfig] = { stale: true };
  storage.values[STORAGE_KEYS.pocketHistory] = [{ id: "stale-pocket" }];
  let afterResetCalls = 0;
  const afterResetTargets = [];
  const resetHandlers = new Map(runtime.requestHandlers(BACKGROUND_REQUEST_ACTIONS, {
    afterReset: async (_tabId, workspaceSessionGeneration) => {
      afterResetCalls += 1;
      afterResetTargets.push(workspaceSessionGeneration);
      return workspaceSessionGeneration;
    }
  }));
  const beforeSuccessfulReset = await runtime.getConfigSnapshot();
  const clearsBeforeReset = alarmsCleared;
  const successfulReset = await resetHandlers.get(BACKGROUND_REQUEST_ACTIONS.RESET_CONFIG)({
    expectedRevision: beforeSuccessfulReset.revision,
    expectedActivationRevision: beforeSuccessfulReset.activationRevision
  });
  assert.equal(successfulReset.committed, true);
  assert.deepEqual(successfulReset.cleanupWarnings, []);
  assert.equal(successfulReset.workspaceSessionGeneration, "workspace-reset-generation-2");
  assert.equal(afterResetCalls, 1);
  assert.deepEqual(afterResetTargets, ["workspace-reset-generation-2"]);
  assert.ok(alarmsCleared > clearsBeforeReset);
  assert.equal(Object.hasOwn(storage.values, "resetCleanupFixture"), false);
  assert.equal(Object.keys(storage.values).some((key) => key.startsWith(OFFICIAL_RULES_BLOB_PREFIX)), false);
  assert.deepEqual(storage.values[STORAGE_KEYS.promptLibrary], []);
  assert.deepEqual(storage.values[STORAGE_KEYS.promptSendHistory], []);
  assert.deepEqual(storage.values[STORAGE_KEYS.shortcutConfig], normalizeShortcutConfig({}));
  assert.deepEqual(storage.values[STORAGE_KEYS.pocketHistory], []);
  assert.equal(Object.hasOwn(storage.values, OFFICIAL_RULES_RESET_CLEANUP_KEY), false);
  const successfulAtomicReset = storage.sets.findLast((patch) => (
    Object.hasOwn(patch, "chatclubOfficialRulesStateV1")
      && Object.hasOwn(patch, OFFICIAL_RULES_RESET_CLEANUP_KEY)
  ));
  assert.equal(
    successfulAtomicReset[WORKSPACE_SESSION_GENERATION_KEY],
    "workspace-reset-generation-2",
    "the fixed workspace generation must commit atomically with reset state"
  );
  assert.equal(
    successfulAtomicReset[OFFICIAL_RULES_RESET_CLEANUP_KEY].workspaceSessionGeneration,
    successfulAtomicReset[WORKSPACE_SESSION_GENERATION_KEY]
  );
  assert.equal(
    successfulAtomicReset[OFFICIAL_RULES_RESET_CLEANUP_KEY].cleanupKeys.includes(WORKSPACE_SESSION_GENERATION_KEY),
    false,
    "post-commit cleanup must never remove the atomically committed workspace generation"
  );

  storage.values.resetCleanupFailure = { stale: true };
  const originalStorageRemove = storage.remove.bind(storage);
  let cleanupRemoveAttempts = 0;
  storage.remove = async (keys) => {
    if ((Array.isArray(keys) ? keys : [keys]).includes("resetCleanupFailure")) {
      cleanupRemoveAttempts += 1;
      throw new Error("fixture cleanup remove failed");
    }
    return originalStorageRemove(keys);
  };
  const beforeIncompleteCleanup = await runtime.getConfigSnapshot();
  const incompleteReset = await resetHandlers.get(BACKGROUND_REQUEST_ACTIONS.RESET_CONFIG)({
    expectedRevision: beforeIncompleteCleanup.revision,
    expectedActivationRevision: beforeIncompleteCleanup.activationRevision
  });
  assert.equal(incompleteReset.committed, true);
  assert.ok(incompleteReset.cleanupWarnings.some(({ label }) => label === "storage-remove"));
  assert.equal(cleanupRemoveAttempts, 2, "post-reset cleanup must retry once before reporting an incomplete reset");
  assert.equal(Object.hasOwn(storage.values, "resetCleanupFailure"), true, "failed cleanup must never be reported as successful");
  assert.ok(storage.values[OFFICIAL_RULES_RESET_CLEANUP_KEY], "incomplete cleanup must retain a restart marker");
  storage.remove = originalStorageRemove;

  let resumedAfterResetCalls = 0;
  let resumedAfterResetTarget = "";
  const resumedRuntime = createOfficialRulesRuntime(api, {
    updater: fakeUpdater,
    now: () => 1_000_001,
    random: () => 0.25,
    afterReset: async (workspaceSessionGeneration) => {
      resumedAfterResetCalls += 1;
      resumedAfterResetTarget = workspaceSessionGeneration;
      return workspaceSessionGeneration;
    },
    applyConfiguration: async () => {}
  });
  await resumedRuntime.configurationReady;
  assert.equal(Object.hasOwn(storage.values, "resetCleanupFailure"), false);
  assert.equal(Object.hasOwn(storage.values, OFFICIAL_RULES_RESET_CLEANUP_KEY), false);
  assert.equal(resumedAfterResetCalls, 1, "startup must resume the pending post-reset workspace cleanup");
  assert.equal(resumedAfterResetTarget, "workspace-reset-generation-3");
  assert.equal(afterResetTargets.at(-1), resumedAfterResetTarget);
  assert.equal(resetGenerationAllocations, 3, "startup recovery must reuse the committed generation target");

  async function verifyPostCommitCleanupRecovery(faultStep) {
    const faultStorage = memoryStorage({
      options: structuredClone(storage.values.options),
      customConfig: [],
      [OFFICIAL_RULES_CONFIG_REVISION_KEY]: { version: 1, revision: 3, updatedAt: 1 },
      [WORKSPACE_SESSION_GENERATION_KEY]: "workspace-old-generation",
      cleanupFaultFixture: { stale: true },
      [`${OFFICIAL_RULES_BLOB_PREFIX}${"b".repeat(64)}`]: { stale: true }
    });
    const baseRemove = faultStorage.remove.bind(faultStorage);
    const removalCalls = [];
    let faultActive = false;
    let faultAttempts = 0;
    faultStorage.remove = async (keys) => {
      const selected = Array.isArray(keys) ? keys : [keys];
      removalCalls.push([...selected]);
      const targetsFault = faultStep === "storage-remove"
        ? selected.includes("cleanupFaultFixture")
        : faultStep === "cleanup-marker-remove"
          ? selected.includes(OFFICIAL_RULES_RESET_CLEANUP_KEY)
          : false;
      if (faultActive && targetsFault && faultAttempts < 2) {
        faultAttempts += 1;
        throw new Error(`fixture ${faultStep} failed`);
      }
      return baseRemove(keys);
    };
    const faultAlarms = {
      async create() {},
      async clear() {
        if (faultActive && faultStep === "alarm-clear" && faultAttempts < 2) {
          faultAttempts += 1;
          throw new Error("fixture alarm clear failed");
        }
        return true;
      }
    };
    const afterResetTargets = [];
    const fixedGeneration = `workspace-${faultStep}-fixed`;
    let generationAllocations = 0;
    const afterReset = async (workspaceSessionGeneration) => {
      afterResetTargets.push(workspaceSessionGeneration);
      if (faultActive && faultStep === "after-reset" && faultAttempts < 2) {
        faultAttempts += 1;
        throw new Error("fixture after reset failed");
      }
      if (faultActive && faultStep === "after-reset-mismatch" && faultAttempts < 2) {
        faultAttempts += 1;
        return `${workspaceSessionGeneration}-wrong`;
      }
      await faultStorage.set({ [WORKSPACE_SESSION_GENERATION_KEY]: workspaceSessionGeneration });
      return workspaceSessionGeneration;
    };
    const faultApi = {
      storage: { local: faultStorage },
      runtime: { getManifest: () => ({ version: "2026.7.31.1" }) },
      alarms: faultAlarms
    };
    const createFaultRuntime = () => createOfficialRulesRuntime(faultApi, {
      updater: fakeUpdater,
      now: () => 1_000_010,
      random: () => 0.25,
      createResetGeneration: () => {
        generationAllocations += 1;
        return fixedGeneration;
      },
      afterReset,
      applyConfiguration: async () => {}
    });
    const faultRuntime = createFaultRuntime();
    await faultRuntime.configurationReady;
    const before = await faultRuntime.getConfigSnapshot();
    faultActive = true;
    const result = await new Map(faultRuntime.requestHandlers(BACKGROUND_REQUEST_ACTIONS))
      .get(BACKGROUND_REQUEST_ACTIONS.RESET_CONFIG)({
        expectedRevision: before.revision,
        expectedActivationRevision: before.activationRevision
      });
    assert.equal(result.committed, true, `${faultStep} must not turn a committed reset into a request error`);
    const warningLabel = faultStep === "after-reset-mismatch" ? "after-reset" : faultStep;
    assert.ok(result.cleanupWarnings.some(({ label }) => label === warningLabel));
    assert.equal(faultAttempts, 2, `${faultStep} must retry once before returning a warning`);
    assert.ok(faultStorage.values[OFFICIAL_RULES_RESET_CLEANUP_KEY]);
    assert.equal(
      faultStorage.values[WORKSPACE_SESSION_GENERATION_KEY],
      fixedGeneration,
      "the atomic reset must expose the fixed generation before cleanup finishes"
    );
    assert.equal(
      faultStorage.values[OFFICIAL_RULES_RESET_CLEANUP_KEY].cleanupKeys.includes(WORKSPACE_SESSION_GENERATION_KEY),
      false
    );
    faultActive = false;
    const restarted = createFaultRuntime();
    await restarted.configurationReady;
    assert.equal(Object.hasOwn(faultStorage.values, OFFICIAL_RULES_RESET_CLEANUP_KEY), false);
    assert.equal(Object.hasOwn(faultStorage.values, "cleanupFaultFixture"), false);
    assert.equal(
      Object.keys(faultStorage.values).some((key) => key.startsWith(OFFICIAL_RULES_BLOB_PREFIX)),
      false
    );
    assert.deepEqual(faultStorage.values[STORAGE_KEYS.promptLibrary], []);
    assert.deepEqual(faultStorage.values[STORAGE_KEYS.promptSendHistory], []);
    assert.deepEqual(faultStorage.values[STORAGE_KEYS.shortcutConfig], normalizeShortcutConfig({}));
    assert.deepEqual(faultStorage.values[STORAGE_KEYS.pocketHistory], []);
    assert.equal(generationAllocations, 1, "restart cleanup must not allocate a second workspace generation");
    assert.ok(afterResetTargets.length >= 2);
    assert.deepEqual([...new Set(afterResetTargets)], [fixedGeneration]);
    assert.equal(faultStorage.values[WORKSPACE_SESSION_GENERATION_KEY], fixedGeneration);
    assert.deepEqual(
      [...new Set(faultStorage.sets
        .filter((patch) => Object.hasOwn(patch, WORKSPACE_SESSION_GENERATION_KEY))
        .map((patch) => patch[WORKSPACE_SESSION_GENERATION_KEY]))],
      [fixedGeneration],
      "claim/startup observers must never see a randomly regenerated workspace generation"
    );
    assert.equal(
      removalCalls.some((keys) => keys.includes(WORKSPACE_SESSION_GENERATION_KEY)),
      false,
      "neither initial cleanup nor startup recovery may remove the fixed generation"
    );
  }

  for (const faultStep of [
    "storage-remove",
    "alarm-clear",
    "after-reset",
    "after-reset-mismatch",
    "cleanup-marker-remove"
  ]) {
    await verifyPostCommitCleanupRecovery(faultStep);
  }

  const preservedV4 = structuredClone(stored);
  const v4Storage = memoryStorage({
    options: preservedV4,
    customConfig: [],
    [OFFICIAL_RULES_CONFIG_REVISION_KEY]: { version: 1, revision: 7, updatedAt: 999 }
  });
  const v4Runtime = createOfficialRulesRuntime({
    storage: { local: v4Storage },
    runtime: { getManifest: () => ({ version: "2026.7.31.1" }) },
    alarms: { async create() {}, async clear() { return true; } }
  }, {
    updater: fakeUpdater,
    now: () => 1_000_100,
    applyConfiguration: async () => {}
  });
  await v4Runtime.configurationReady;
  assert.deepEqual(v4Storage.values.options, preservedV4, "valid sparse v4 storage must not be normalized as an old effective bundle");
  assert.equal((await v4Runtime.getConfigSnapshot()).revision, 7);
  const maliciousV4 = structuredClone(preservedV4);
  maliciousV4.officialOverrides["delete/chatgpt"] = {
    ...(maliciousV4.officialOverrides["delete/chatgpt"] || {}),
    officialRuleHints: { menuTrigger: [".attacker-controlled"] },
    officialRuleRevision: 999
  };
  const v4Handlers = new Map(v4Runtime.requestHandlers(BACKGROUND_REQUEST_ACTIONS));
  await assert.rejects(
    v4Handlers.get(BACKGROUND_REQUEST_ACTIONS.IMPORT_CONFIG)({
      expectedRevision: 7,
      expectedActivationRevision: (await v4Runtime.getConfigSnapshot()).activationRevision,
      patch: { options: maliciousV4 }
    }),
    (error) => error?.code === "INVALID_CONFIG_REQUEST" && /read-only|unsupported/.test(error.message)
  );
  assert.deepEqual(v4Storage.values.options, preservedV4, "rejected v4 imports must not persist read-only official fields");

  const beforeLegacyImport = await v4Runtime.getConfigSnapshot();
  const inspectedLegacyImport = inspectImportedConfig({
    options: {
      scriptConfigSchemaVersion: 3,
      summarySiteConfigs: [],
      messageNavigatorSiteConfigs: [navigatorBeforeChatGpt, navigator],
      topicDeleteSiteConfigs: []
    }
  });
  assert.equal(inspectedLegacyImport.data.options.messageNavigatorSiteConfigs[1].messageSelector, ".mine-message");
  await v4Handlers.get(BACKGROUND_REQUEST_ACTIONS.IMPORT_CONFIG)({
    expectedRevision: beforeLegacyImport.revision,
    expectedActivationRevision: beforeLegacyImport.activationRevision,
    patch: {
      options: inspectedLegacyImport.data.options
    }
  });
  assert.deepEqual(v4Storage.values.options.officialOverrides["messageNavigator/chatgpt"], {
    name: "My Navigator",
    enabled: false,
    appIds: ["custom-app"],
    hosts: ["local.navigator.example"],
    pathPrefixes: ["/nav"],
    adapter: "custom-adapter",
    messageSelector: ".mine-message",
    userSelector: ".mine-user",
    assistantSelector: ".mine-assistant",
    textCleanupSelectors: [".mine-cleanup"],
    summaryMaxChars: 91
  }, "legacy v3 imports must preserve uncertain built-in fields as sparse overrides");
  assert.deepEqual(
    v4Storage.values.options.officialOrders.messageNavigator.slice(0, 2),
    ["messageNavigator/claude", "messageNavigator/chatgpt"],
    "legacy v3 import ordering must survive v4 projection"
  );

  {
    const remoteStorage = memoryStorage();
    const remoteComponents = Object.fromEntries(Object.entries(OFFICIAL_RULES_PACKAGED_MATERIALIZED.components)
      .map(([key, component]) => [key, { ...structuredClone(component), revision: 1 }]));
    remoteComponents["summary/chatgpt"] = {
      ...remoteComponents["summary/chatgpt"],
      pathPrefixes: ["/remote-only"]
    };
    const remoteUpdater = {
      async checkForUpdates() { return { status: "not-modified" }; },
      async materializeSnapshot(snapshot, options = {}) {
        if (snapshot?.source === "packaged") return options.resolvePackaged(snapshot);
        return {
          snapshot,
          channel: {},
          catalog: { releaseNotes: "remote import migration fixture" },
          components: remoteComponents
        };
      }
    };
    const remoteRuntime = createOfficialRulesRuntime({
      storage: { local: remoteStorage },
      runtime: { getManifest: () => ({ version: "2026.7.31.1" }) },
      alarms: { async create() {}, async clear() { return true; } }
    }, {
      updater: remoteUpdater,
      now: () => 1_000_150,
      applyConfiguration: async () => {}
    });
    await remoteRuntime.configurationReady;
    const remoteHash = (character) => character.repeat(64);
    for (const [kind, character] of [["channel", "d"], ["catalog", "e"], ["component", "f"]]) {
      await remoteRuntime.repository.putBlob({
        hash: remoteHash(character),
        kind,
        rawText: "{}",
        signatureText: "{}",
        keyId: "fixture-key"
      });
    }
    const remoteTargets = Object.fromEntries(Object.entries(remoteComponents).map(([key, component]) => [key, {
      feature: component.feature,
      siteId: component.siteId,
      revision: 1,
      sha256: remoteHash("f"),
      size: 2,
      keyId: "fixture-key",
      url: `https://example.test/${encodeURIComponent(key)}.json`,
      signatureUrl: `https://example.test/${encodeURIComponent(key)}.sig.json`
    }]));
    await remoteRuntime.repository.stageCandidate({
      source: "remote",
      sequence: 1,
      rulesVersion: "remote-import-fixture",
      keyId: "fixture-key",
      channelHash: remoteHash("d"),
      catalogHash: remoteHash("e"),
      officialTargets: remoteTargets,
      createdAt: 1_000_150
    });
    const remoteHandlers = new Map(remoteRuntime.requestHandlers(BACKGROUND_REQUEST_ACTIONS));
    const remoteStatus = await remoteRuntime.getStatus();
    await remoteHandlers.get(BACKGROUND_REQUEST_ACTIONS.APPLY_OFFICIAL_RULES_UPDATE)({
      expectedRevision: remoteStatus.revision,
      expectedActivationRevision: remoteStatus.activationRevision
    });
    const beforeRemoteLegacyImport = await remoteRuntime.getConfigSnapshot();
    assert.ok(
      beforeRemoteLegacyImport.options.summarySiteConfigs
        .find(({ id }) => id === "chatgpt")?.pathPrefixes.includes("/remote-only"),
      "the fixture must activate a remote ChatGPT Summary path before importing v3"
    );
    const languageOnlyLegacy = inspectImportedConfig({ options: { language: "en_US" } });
    await remoteHandlers.get(BACKGROUND_REQUEST_ACTIONS.IMPORT_CONFIG)({
      expectedRevision: beforeRemoteLegacyImport.revision,
      expectedActivationRevision: beforeRemoteLegacyImport.activationRevision,
      patch: { options: languageOnlyLegacy.data.options }
    });
    const afterRemoteLegacyImport = await remoteRuntime.getConfigSnapshot();
    assert.equal(
      Object.hasOwn(afterRemoteLegacyImport.storedOptions.officialOverrides["summary/chatgpt"] || {}, "pathPrefixes"),
      false,
      "a language-only v3 import must not materialize the old packaged path baseline over active remote rules"
    );
    assert.ok(
      afterRemoteLegacyImport.options.summarySiteConfigs
        .find(({ id }) => id === "chatgpt")?.pathPrefixes.includes("/remote-only"),
      "a v3 import must continue following the active remote ChatGPT Summary path"
    );
  }

  let releaseCheck;
  let checkStarted;
  const checkGate = new Promise((resolve) => { releaseCheck = resolve; });
  const startedGate = new Promise((resolve) => { checkStarted = resolve; });
  const transitionEvents = [];
  const concurrentStorage = memoryStorage();
  const concurrentRuntime = createOfficialRulesRuntime({
    storage: { local: concurrentStorage },
    runtime: { getManifest: () => ({ version: "2026.7.31.1" }) },
    alarms: { async create() {}, async clear() { return true; } }
  }, {
    updater: {
      async checkForUpdates() {
        transitionEvents.push("check-start");
        checkStarted();
        await checkGate;
        transitionEvents.push("check-end");
        return { status: "not-modified" };
      },
      async materializeSnapshot(snapshot, options = {}) {
        if (snapshot?.source === "packaged") return options.resolvePackaged(snapshot);
        throw new Error("unexpected remote materialization");
      }
    },
    now: () => 1_000_200,
    applyConfiguration: async (_configuration, context) => {
      transitionEvents.push(`apply:${context.phase}`);
    }
  });
  await concurrentRuntime.configurationReady;
  transitionEvents.length = 0;
  const handlers = new Map(concurrentRuntime.requestHandlers(BACKGROUND_REQUEST_ACTIONS));
  const rulesBefore = await concurrentRuntime.getStatus();
  const configBefore = await concurrentRuntime.getConfigSnapshot();
  const checkPromise = handlers.get(BACKGROUND_REQUEST_ACTIONS.CHECK_OFFICIAL_RULES_UPDATE)({
    expectedRevision: rulesBefore.revision
  });
  await startedGate;
  let patchSettled = false;
  const patchPromise = handlers.get(BACKGROUND_REQUEST_ACTIONS.PATCH_CONFIG)({
    expectedRevision: configBefore.revision,
    expectedActivationRevision: configBefore.activationRevision,
    patch: { options: { language: "en_US" } }
  }).then((value) => {
    patchSettled = true;
    return value;
  }, (error) => {
    patchSettled = true;
    throw error;
  });
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(patchSettled, false, "config mutation must wait behind an in-flight manual rules check");
  releaseCheck();
  await Promise.all([checkPromise, patchPromise]);
  assert.deepEqual(transitionEvents.slice(0, 3), ["check-start", "check-end", "apply:config-prepare"]);

  // If runtime preparation succeeds but the atomic storage commit and compensation both fail,
  // the persisted journal must enter recovery-required and Delete must fail closed until restart recovery.
  const compensationStorage = memoryStorage();
  const compensationApplies = [];
  const compensationRuntime = createOfficialRulesRuntime({
    storage: { local: compensationStorage },
    runtime: { getManifest: () => ({ version: "2026.7.31.1" }) },
    alarms: { async create() {}, async clear() { return true; } }
  }, {
    updater: fakeUpdater,
    now: () => 1_000_250,
    applyConfiguration: async (configuration, context) => {
      if (context.phase === "config-restore") throw new Error("fixture runtime compensation failed");
      compensationApplies.push({ configuration: structuredClone(configuration), context: structuredClone(context) });
    }
  });
  await compensationRuntime.configurationReady;
  const compensationHandlers = new Map(compensationRuntime.requestHandlers(BACKGROUND_REQUEST_ACTIONS));
  const beforeCompensationFailure = await compensationRuntime.getConfigSnapshot();
  const compensationStorageSet = compensationStorage.set.bind(compensationStorage);
  let failConfigCommit = true;
  compensationStorage.set = async (patch) => {
    if (failConfigCommit
      && Object.hasOwn(patch, "chatclubOfficialRulesStateV1")
      && Object.hasOwn(patch, OFFICIAL_RULES_CONFIG_REVISION_KEY)
      && Object.hasOwn(patch, "options")) {
      failConfigCommit = false;
      throw new Error("fixture atomic config commit failed");
    }
    return compensationStorageSet(patch);
  };
  await assert.rejects(
    compensationHandlers.get(BACKGROUND_REQUEST_ACTIONS.PATCH_CONFIG)({
      expectedRevision: beforeCompensationFailure.revision,
      expectedActivationRevision: beforeCompensationFailure.activationRevision,
      patch: { options: { language: "en_US" } }
    }),
    (error) => error?.code === "CONFIG_APPLY_FAILED"
      && /atomic config commit failed/.test(error.details?.causeMessage || "")
      && /runtime compensation failed/.test(error.details?.restoreMessage || "")
  );
  compensationStorage.set = compensationStorageSet;
  const compensationFailureState = await compensationRuntime.repository.readState();
  assert.equal(compensationFailureState.journal.phase, "recovery-required");
  assert.equal(compensationFailureState.journal.operation, "configuration");
  assert.match(compensationFailureState.journal.rollbackError, /runtime compensation failed/);
  assert.equal((await compensationRuntime.getStatus()).phase, "recovery-required");
  assert.ok(
    compensationApplies.at(-1).configuration.options.topicDeleteSiteConfigs.every(({ enabled }) => enabled === false),
    "failed storage commit plus failed compensation must install a fail-closed Delete snapshot"
  );
  await assert.rejects(
    compensationRuntime.assertDestructiveOperationsAllowed(),
    (error) => error?.code === "RECOVERY_REQUIRED"
  );

  const recoveredCompensationApplies = [];
  const recoveredCompensationRuntime = createOfficialRulesRuntime({
    storage: { local: compensationStorage },
    runtime: { getManifest: () => ({ version: "2026.7.31.1" }) },
    alarms: { async create() {}, async clear() { return true; } }
  }, {
    updater: fakeUpdater,
    now: () => 1_000_275,
    applyConfiguration: async (configuration, context) => {
      recoveredCompensationApplies.push({ configuration: structuredClone(configuration), context: structuredClone(context) });
    }
  });
  await recoveredCompensationRuntime.configurationReady;
  assert.ok(recoveredCompensationApplies.some(({ context }) => context.phase === "recovery"));
  assert.equal((await recoveredCompensationRuntime.repository.readState()).journal.phase, "idle");
  assert.equal((await recoveredCompensationRuntime.getStatus()).phase, "ready");
  assert.equal(await recoveredCompensationRuntime.assertDestructiveOperationsAllowed(), true);

  const recoveryStorage = memoryStorage();
  const seededRepository = createOfficialRulesRepository({ storage: recoveryStorage, now: () => 1_000_300 });
  await seededRepository.initializePackaged(OFFICIAL_RULES_PACKAGED_MATERIALIZED.snapshot);
  const seededState = await seededRepository.readState();
  const seededKey = Object.keys(seededState.active.officialTargets)[0];
  await seededRepository.beginComponentPinsApply({
    pins: { [seededKey]: seededState.active.officialTargets[seededKey] },
    expectedActivationRevision: seededState.activationRevision,
    expectedStateRevision: seededState.revision,
    reason: "recovery-fixture",
    id: "recovery-fixture"
  });
  const recoveryApplies = [];
  const recoveryRuntime = createOfficialRulesRuntime({
    storage: { local: recoveryStorage },
    runtime: { getManifest: () => ({ version: "2026.7.31.1" }) },
    alarms: { async create() {}, async clear() { return true; } }
  }, {
    updater: fakeUpdater,
    now: () => 1_000_400,
    applyConfiguration: async (configuration, context) => {
      if (context.phase === "recovery") throw new Error("fixture recovery registration failed");
      recoveryApplies.push({ configuration: structuredClone(configuration), context: structuredClone(context) });
    }
  });
  await recoveryRuntime.configurationReady;
  assert.equal((await recoveryRuntime.getStatus()).phase, "recovery-required");
  assert.ok((await recoveryRuntime.getConfigSnapshot()).options, "configuration reads must remain available during recovery-required");
  assert.ok(
    recoveryApplies.at(-1).configuration.options.topicDeleteSiteConfigs.every(({ enabled }) => enabled === false),
    "startup recovery failure must install a fail-closed Delete configuration"
  );
  await assert.rejects(
    recoveryRuntime.assertDestructiveOperationsAllowed(),
    (error) => error?.code === "RECOVERY_REQUIRED"
  );
  const recoveryHandlers = new Map(recoveryRuntime.requestHandlers(BACKGROUND_REQUEST_ACTIONS));
  const recoveryConfig = await recoveryRuntime.getConfigSnapshot();
  await recoveryHandlers.get(BACKGROUND_REQUEST_ACTIONS.PATCH_CONFIG)({
    expectedRevision: recoveryConfig.revision,
    expectedActivationRevision: recoveryConfig.activationRevision,
    patch: { options: { language: "en_US" } }
  });
  assert.ok(
    recoveryApplies.at(-1).configuration.options.topicDeleteSiteConfigs.every(({ enabled }) => enabled === false),
    "non-destructive config writes must remain fail-closed while recovery is required"
  );
  const beforeRecoveryReset = await recoveryRuntime.getConfigSnapshot();
  await recoveryHandlers.get(BACKGROUND_REQUEST_ACTIONS.RESET_CONFIG)({
    expectedRevision: beforeRecoveryReset.revision,
    expectedActivationRevision: beforeRecoveryReset.activationRevision
  });
  assert.equal((await recoveryRuntime.getStatus()).phase, "ready");
  assert.equal(await recoveryRuntime.assertDestructiveOperationsAllowed(), true);

  const aliasStorage = memoryStorage();
  const aliasKey = "delete/chatgpt";
  const aliasHost = "new.chatgpt.com";
  const aliasComponent = {
    schemaVersion: 1,
    rulesApiVersion: 1,
    feature: "delete",
    siteId: "chatgpt",
    revision: 1,
    status: "active",
    hosts: ["chatgpt.com", aliasHost],
    pathPrefixes: ["/c/"],
    selectors: {
      scope: [], conversationLink: [], conversationRow: [], menuTrigger: [], menuRoot: [],
      deleteCandidate: [], dialog: [], confirmCandidate: [], completionLinks: []
    },
    parameters: { timeoutMs: 15000 }
  };
  const aliasUpdater = {
    async checkForUpdates() { return { status: "not-modified" }; },
    async materializeSnapshot(snapshot, options = {}) {
      if (snapshot?.source === "packaged") return options.resolvePackaged(snapshot);
      return {
        snapshot,
        channel: {},
        catalog: { releaseNotes: "alias fixture" },
        components: { [aliasKey]: aliasComponent }
      };
    }
  };
  const aliasRuntime = createOfficialRulesRuntime({
    storage: { local: aliasStorage },
    runtime: { getManifest: () => ({ version: "2026.7.31.1" }) },
    alarms: { async create() {}, async clear() { return true; } }
  }, {
    updater: aliasUpdater,
    now: () => 1_000_500,
    authorizeOfficialHost: (feature, siteId, host) => ({
      allowed: feature === "delete" && siteId === "chatgpt" && host === aliasHost,
      alias: host === aliasHost,
      host,
      reason: "fixture"
    }),
    applyConfiguration: async () => {}
  });
  await aliasRuntime.configurationReady;
  const hash = (character) => character.repeat(64);
  for (const [kind, character] of [["channel", "a"], ["catalog", "b"], ["component", "c"]]) {
    await aliasRuntime.repository.putBlob({
      hash: hash(character),
      kind,
      rawText: "{}",
      signatureText: "{}",
      keyId: "fixture-key"
    });
  }
  const aliasTarget = {
    feature: "delete",
    siteId: "chatgpt",
    revision: 1,
    sha256: hash("c"),
    size: 2,
    keyId: "fixture-key",
    url: "https://example.test/component.json",
    signatureUrl: "https://example.test/component.sig.json"
  };
  await aliasRuntime.repository.stageCandidate({
    source: "remote",
    sequence: 1,
    rulesVersion: "fixture-1",
    keyId: "fixture-key",
    channelHash: hash("a"),
    catalogHash: hash("b"),
    officialTargets: { [aliasKey]: aliasTarget },
    createdAt: 1_000_500
  });
  const aliasHandlers = new Map(aliasRuntime.requestHandlers(BACKGROUND_REQUEST_ACTIONS));
  let aliasStatus = await aliasRuntime.getStatus();
  assert.equal(aliasStatus.candidate.deleteAliases[0].approved, false);
  await aliasHandlers.get(BACKGROUND_REQUEST_ACTIONS.SET_OFFICIAL_DELETE_ALIAS_APPROVAL)({
    expectedRevision: aliasStatus.revision,
    expectedActivationRevision: aliasStatus.activationRevision,
    componentKey: aliasKey,
    host: aliasHost,
    approved: true
  });
  aliasStatus = await aliasRuntime.getStatus();
  await aliasHandlers.get(BACKGROUND_REQUEST_ACTIONS.APPLY_OFFICIAL_RULES_UPDATE)({
    expectedRevision: aliasStatus.revision,
    expectedActivationRevision: aliasStatus.activationRevision,
    approvedDeleteAliases: [{ componentKey: aliasKey, host: aliasHost }]
  });
  aliasStatus = await aliasRuntime.getStatus();
  assert.equal(aliasStatus.candidate.available, false);
  assert.deepEqual(aliasStatus.candidate.deleteAliases.map(({ host, approved, active }) => ({ host, approved, active })), [
    { host: aliasHost, approved: true, active: true }
  ], "applied aliases must remain visible after the candidate is cleared");
  const activationBeforeRevoke = aliasStatus.activationRevision;
  await aliasHandlers.get(BACKGROUND_REQUEST_ACTIONS.SET_OFFICIAL_DELETE_ALIAS_APPROVAL)({
    expectedRevision: aliasStatus.revision,
    expectedActivationRevision: aliasStatus.activationRevision,
    componentKey: aliasKey,
    host: aliasHost,
    approved: false
  });
  aliasStatus = await aliasRuntime.getStatus();
  assert.equal(aliasStatus.candidate.deleteAliases[0].approved, false);
  assert.equal(aliasStatus.activationRevision, activationBeforeRevoke + 1);
  await aliasHandlers.get(BACKGROUND_REQUEST_ACTIONS.ROLLBACK_LAST_RULES_UPDATE)({
    expectedRevision: aliasStatus.revision,
    expectedActivationRevision: aliasStatus.activationRevision
  });
  aliasStatus = await aliasRuntime.getStatus();
  assert.equal(aliasStatus.canRollbackLast, false, "the last-update rollback action must be consumed once effective pins equal the previous targets");
  await assert.rejects(
    aliasHandlers.get(BACKGROUND_REQUEST_ACTIONS.ROLLBACK_LAST_RULES_UPDATE)({
      expectedRevision: aliasStatus.revision,
      expectedActivationRevision: aliasStatus.activationRevision
    }),
    (error) => error?.code === "OFFICIAL_RULES_APPLY_FAILED"
  );

  const multiChangedKeys = ["summary/chatgpt", "messageNavigator/chatgpt"];
  const multiComponentsV1 = remoteComponentSet(1);
  const multiComponentsV2 = structuredClone(multiComponentsV1);
  for (const key of multiChangedKeys) {
    multiComponentsV2[key] = {
      ...multiComponentsV2[key],
      revision: 2,
      pathPrefixes: [`/integration-v2/${multiComponentsV2[key].siteId}`]
    };
  }
  const multiComponentSets = new Map([
    [1, multiComponentsV1],
    [2, multiComponentsV2]
  ]);
  const multiStorage = memoryStorage();
  const multiApplies = [];
  const multiRuntime = createOfficialRulesRuntime({
    storage: { local: multiStorage },
    runtime: { getManifest: () => ({ version: "2026.7.31.1" }) },
    alarms: { async create() {}, async clear() { return true; } }
  }, {
    updater: integrationUpdater(multiComponentSets),
    keyring: integrationKeyring,
    crypto: integrationCrypto,
    now: () => 1_100_100,
    applyConfiguration: async (configuration, context) => {
      multiApplies.push({ configuration: structuredClone(configuration), context: structuredClone(context) });
    }
  });
  await multiRuntime.configurationReady;
  const multiHandlers = new Map(multiRuntime.requestHandlers(BACKGROUND_REQUEST_ACTIONS));
  const multiTargetsV1 = await createIntegrationTargets(
    multiRuntime.repository,
    multiComponentsV1,
    "integration-multi-v1"
  );
  await stageIntegrationCandidate(multiRuntime, 1, multiTargetsV1);
  await applyStagedCandidate(multiRuntime, multiHandlers);
  const multiTargetsV2 = await createIntegrationTargets(
    multiRuntime.repository,
    multiComponentsV2,
    "integration-multi-v2",
    multiTargetsV1
  );
  await stageIntegrationCandidate(multiRuntime, 2, multiTargetsV2);
  multiApplies.length = 0;
  await applyStagedCandidate(multiRuntime, multiHandlers);
  let multiState = await multiRuntime.repository.readState();
  assert.equal(multiState.active.sequence, 2);
  assert.deepEqual(multiState.lastAppliedChangedKeys, multiChangedKeys);
  assert.deepEqual(
    multiChangedKeys.map((key) => multiState.previousByComponent[key].sha256),
    multiChangedKeys.map((key) => multiTargetsV1[key].sha256)
  );
  assert.equal(multiApplies.length, 1, "a multi-component release must prepare one immutable configuration snapshot");
  assert.equal(multiApplies[0].context.phase, "apply");
  assert.deepEqual(
    [
      multiApplies[0].configuration.options.summarySiteConfigs.find(({ id }) => id === "chatgpt").officialRuleRevision,
      multiApplies[0].configuration.options.messageNavigatorSiteConfigs.find(({ id }) => id === "chatgpt").officialRuleRevision
    ],
    [2, 2]
  );

  const beforeMultiRollback = await multiRuntime.getStatus();
  multiApplies.length = 0;
  await multiHandlers.get(BACKGROUND_REQUEST_ACTIONS.ROLLBACK_LAST_RULES_UPDATE)({
    expectedRevision: beforeMultiRollback.revision,
    expectedActivationRevision: beforeMultiRollback.activationRevision
  });
  multiState = await multiRuntime.repository.readState();
  assert.equal(multiState.active.sequence, 2, "last-update rollback must pin components without lowering the catalog watermark");
  assert.deepEqual(Object.keys(multiState.componentPins).sort(), [...multiChangedKeys].sort());
  assert.deepEqual(
    multiChangedKeys.map((key) => multiState.componentPins[key].sha256),
    multiChangedKeys.map((key) => multiTargetsV1[key].sha256)
  );
  assert.equal(multiApplies.length, 1, "ROLLBACK_LAST must prepare all changed components as one snapshot");
  assert.equal(multiApplies[0].context.phase, "component-apply");
  assert.deepEqual(
    [
      multiApplies[0].configuration.options.summarySiteConfigs.find(({ id }) => id === "chatgpt").officialRuleRevision,
      multiApplies[0].configuration.options.messageNavigatorSiteConfigs.find(({ id }) => id === "chatgpt").officialRuleRevision
    ],
    [1, 1],
    "ROLLBACK_LAST must never expose a configuration with only one component restored"
  );
  const rollbackCommit = multiStorage.sets.findLast((patch) => (
    patch.chatclubOfficialRulesStateV1?.componentPins
      && Object.keys(patch.chatclubOfficialRulesStateV1.componentPins).length === multiChangedKeys.length
  ));
  assert.deepEqual(
    Object.keys(rollbackCommit.chatclubOfficialRulesStateV1.componentPins).sort(),
    [...multiChangedKeys].sort(),
    "both rollback pins must be persisted in one official-rules state write"
  );

  const strictStorage = memoryStorage();
  let registeredScripts = [];
  let failNonCoreRegistration = false;
  let failedRegistrationId = "";
  const strictScripting = {
    async getRegisteredContentScripts() { return structuredClone(registeredScripts); },
    async unregisterContentScripts({ ids }) {
      const removed = new Set(ids || []);
      registeredScripts = registeredScripts.filter(({ id }) => !removed.has(id));
    },
    async registerContentScripts(registrations) {
      if (failNonCoreRegistration && registrations.some((registration) => (
        registration.id === CONTENT_BUNDLES.summaryIsolated.id
          && (registration.matches || []).includes("https://integration.chatgpt.com/*")
      ))) {
        failNonCoreRegistration = false;
        failedRegistrationId = registrations.find((registration) => (
          registration.id === CONTENT_BUNDLES.summaryIsolated.id
          && (registration.matches || []).includes("https://integration.chatgpt.com/*")
        ))?.id || "";
        throw new Error("fixture non-core Summary registration failed");
      }
      const addedIds = new Set(registrations.map(({ id }) => id));
      registeredScripts = [
        ...registeredScripts.filter(({ id }) => !addedIds.has(id)),
        ...structuredClone(registrations)
      ];
    }
  };
  let dynamicRules = [];
  let sessionRules = [];
  let failSessionDnrUpdate = false;
  let failSessionDnrReadAt = 0;
  let sessionDnrReadCount = 0;
  let activeNotionLeaseRules = [];
  const replaceRules = (current, request) => {
    const removed = new Set(request.removeRuleIds || []);
    return [
      ...current.filter(({ id }) => !removed.has(id)),
      ...structuredClone(request.addRules || [])
    ];
  };
  const strictApi = {
    storage: { local: strictStorage },
    runtime: {
      getManifest: () => ({ version: "2026.7.31.1" }),
      getURL: () => "chrome-extension://official-rules-integration/"
    },
    alarms: { async create() {}, async clear() { return true; } },
    scripting: strictScripting,
    declarativeNetRequest: {
      async getDynamicRules() { return structuredClone(dynamicRules); },
      async getSessionRules() {
        sessionDnrReadCount += 1;
        if (sessionDnrReadCount === failSessionDnrReadAt) {
          throw new Error("fixture session DNR read failed");
        }
        return structuredClone(sessionRules);
      },
      async updateDynamicRules(request) { dynamicRules = replaceRules(dynamicRules, request); },
      async updateSessionRules(request) {
        if (failSessionDnrUpdate) {
          failSessionDnrUpdate = false;
          throw new Error("fixture session DNR replacement failed");
        }
        sessionRules = replaceRules(sessionRules, request);
      }
    }
  };
  const strictApplier = createStrictRuntimeConfigApplier(strictApi, {
    notionFramePreflightRuntime: {
      async initialize() { return true; },
      async withDnrMutation(task) { return task(); },
      hasActiveLeases() { return activeNotionLeaseRules.length > 0; },
      sessionRulesWithActiveLeases(rules = []) {
        return [
          ...(Array.isArray(rules) ? rules : []).filter(({ id }) => id < 1_840_000_000 || id > 1_840_065_535),
          ...structuredClone(activeNotionLeaseRules)
        ];
      }
    },
    currentExtensionPageTabIds: async () => [],
    warn: () => {}
  });
  const strictComponentsV1 = remoteComponentSet(1);
  const strictComponentsV2 = structuredClone(strictComponentsV1);
  strictComponentsV2["summary/chatgpt"] = {
    ...strictComponentsV2["summary/chatgpt"],
    revision: 2,
    hosts: [...strictComponentsV2["summary/chatgpt"].hosts, "integration.chatgpt.com"]
  };
  strictComponentsV2["messageNavigator/chatgpt"] = {
    ...strictComponentsV2["messageNavigator/chatgpt"],
    revision: 2,
    hosts: [...strictComponentsV2["messageNavigator/chatgpt"].hosts, "integration.chatgpt.com"]
  };
  const strictComponentSets = new Map([
    [1, strictComponentsV1],
    [2, strictComponentsV2]
  ]);
  const strictApplyEvents = [];
  const strictRuntime = createOfficialRulesRuntime(strictApi, {
    updater: integrationUpdater(strictComponentSets),
    keyring: integrationKeyring,
    crypto: integrationCrypto,
    now: () => 1_100_200,
    applyConfiguration: async (configuration, context) => {
      try {
        const result = await strictApplier.apply(configuration, context);
        strictApplyEvents.push({ phase: context.phase, ok: true });
        return result;
      } catch (error) {
        strictApplyEvents.push({ phase: context.phase, ok: false });
        throw error;
      }
    }
  });
  await strictRuntime.configurationReady;
  const strictHandlers = new Map(strictRuntime.requestHandlers(BACKGROUND_REQUEST_ACTIONS));
  const strictTargetsV1 = await createIntegrationTargets(
    strictRuntime.repository,
    strictComponentsV1,
    "integration-strict-v1"
  );
  await stageIntegrationCandidate(strictRuntime, 1, strictTargetsV1);
  await applyStagedCandidate(strictRuntime, strictHandlers);
  const oldRegistrations = canonicalRegistrations(await strictScripting.getRegisteredContentScripts());
  const strictTargetsV2 = await createIntegrationTargets(
    strictRuntime.repository,
    strictComponentsV2,
    "integration-strict-v2",
    strictTargetsV1
  );
  await stageIntegrationCandidate(strictRuntime, 2, strictTargetsV2);
  strictApplyEvents.length = 0;
  failNonCoreRegistration = true;
  const beforeStrictFailure = await strictRuntime.getStatus();
  const strictWarnings = [];
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => { strictWarnings.push(args); };
  try {
    await assert.rejects(
      strictHandlers.get(BACKGROUND_REQUEST_ACTIONS.APPLY_OFFICIAL_RULES_UPDATE)({
        expectedRevision: beforeStrictFailure.revision,
        expectedActivationRevision: beforeStrictFailure.activationRevision
      }),
      (error) => error?.code === "OFFICIAL_RULES_APPLY_FAILED"
    );
  } finally {
    console.warn = originalConsoleWarn;
  }
  assert.equal(failedRegistrationId, CONTENT_BUNDLES.summaryIsolated.id);
  assert.ok(
    strictWarnings.some(([, failures]) => failures?.some(({ registration, recovered }) => (
      registration.id === CONTENT_BUNDLES.summaryIsolated.id && recovered === true
    ))),
    "the injected non-core failure must be observed and locally restored before the whole preparation is rejected"
  );
  assert.deepEqual(
    strictApplyEvents,
    [{ phase: "apply", ok: false }, { phase: "rollback", ok: true }],
    "the real APPLY path must restore the old runtime snapshot after a non-core preparation failure"
  );
  const strictFailureState = await strictRuntime.repository.readState();
  assert.equal(strictFailureState.active.sequence, 1);
  assert.equal(strictFailureState.journal.phase, "idle");
  assert.equal(strictFailureState.candidate, null);
  assert.equal(strictFailureState.quarantine.at(-1).sequence, 2);
  assert.deepEqual(strictFailureState.componentPins, {});
  assert.deepEqual(
    multiChangedKeys.map((key) => strictFailureState.active.officialTargets[key].sha256),
    multiChangedKeys.map((key) => strictTargetsV1[key].sha256),
    "no component in the failed multi-component delta may become active"
  );
  assert.deepEqual(
    canonicalRegistrations(await strictScripting.getRegisteredContentScripts()),
    oldRegistrations,
    "content registration preparation must restore the exact old managed registration set"
  );

  const activeNotionLease = {
    id: 1_840_000_000,
    priority: 1,
    action: { type: "modifyHeaders", responseHeaders: [] },
    condition: { regexFilter: "notion-lease", resourceTypes: ["xmlhttprequest"] }
  };
  activeNotionLeaseRules = [activeNotionLease];
  sessionRules = [
    ...sessionRules.filter(({ id }) => id !== activeNotionLease.id),
    structuredClone(activeNotionLease)
  ];
  const dynamicBeforeLeaseFailure = structuredClone(dynamicRules);
  failSessionDnrUpdate = true;
  await assert.rejects(
    strictApplier.apply({ options: {}, customConfig: [] }),
    /fixture session DNR replacement failed/,
    "an active Notion lease must prohibit a successful dynamic-rule fallback"
  );
  assert.deepEqual(
    sessionRules.find(({ id }) => id === activeNotionLease.id),
    activeNotionLease,
    "rollback must merge the latest active Notion lease instead of dropping it"
  );
  assert.deepEqual(dynamicRules, dynamicBeforeLeaseFailure);
  activeNotionLeaseRules = [];
  sessionRules = sessionRules.filter(({ id }) => id !== activeNotionLease.id);

  const sessionBeforeReadFailure = structuredClone(sessionRules);
  const dynamicBeforeReadFailure = structuredClone(dynamicRules);
  failSessionDnrReadAt = sessionDnrReadCount + 2;
  await assert.rejects(
    strictApplier.apply({ options: {}, customConfig: [] }),
    /fixture session DNR read failed/,
    "an unknown session-rule state must never be treated as an empty state for dynamic fallback"
  );
  assert.deepEqual(sessionRules, sessionBeforeReadFailure);
  assert.deepEqual(dynamicRules, dynamicBeforeReadFailure);
  failSessionDnrReadAt = 0;

  console.log("Official rules central runtime migration, sparse-v4 preservation, consent, check-only alarm, atomic multi-component rollback, strict registration compensation, and transition serialization tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
