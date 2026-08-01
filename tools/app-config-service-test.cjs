#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { BACKGROUND_REQUEST_ACTIONS: ACTION } = await import("../shared/background-requests.js");
  const { createAppConfigService } = await import("../app/config-service.js");
  const { createOfficialRulesService } = await import("../app/official-rules/service.js");

  let snapshot = {
    revision: 1,
    activationRevision: 4,
    storedOptions: { themeMode: "light" },
    options: { themeMode: "light" },
    customConfig: []
  };
  let status = {
    revision: 20,
    activationRevision: 4,
    mode: "undecided",
    consentDecided: false,
    phase: "idle"
  };
  const calls = [];
  const storageListeners = new Set();
  const storageChanges = {
    addListener(listener) { storageListeners.add(listener); },
    removeListener(listener) { storageListeners.delete(listener); }
  };

  function conflict(expectedRevision) {
    if (expectedRevision === snapshot.revision) return;
    const error = new Error(`Expected ${expectedRevision}, received ${snapshot.revision}`);
    error.code = "CONFIG_REVISION_CONFLICT";
    throw error;
  }

  function activationConflict(expectedRevision) {
    if (expectedRevision === snapshot.activationRevision) return;
    const error = new Error(`Expected activation ${expectedRevision}, received ${snapshot.activationRevision}`);
    error.code = "ACTIVATION_REVISION_CONFLICT";
    throw error;
  }

  function rulesConflict(expectedRevision) {
    if (expectedRevision === status.revision) return;
    const error = new Error(`Expected official rules ${expectedRevision}, received ${status.revision}`);
    error.code = "OFFICIAL_RULES_STATE_CONFLICT";
    throw error;
  }

  async function request(action, payload = {}) {
    calls.push([action, structuredClone(payload)]);
    if (action === ACTION.GET_CONFIG_SNAPSHOT) return { snapshot: structuredClone(snapshot) };
    if (action === ACTION.PATCH_CONFIG) {
      conflict(payload.expectedRevision);
      activationConflict(payload.expectedActivationRevision);
      const optionsPatch = payload.patch.options;
      if (optionsPatch) {
        if (payload.patch.optionsMode === "stored") {
          snapshot.storedOptions = payload.patch.replaceOptions
            ? structuredClone(optionsPatch)
            : { ...snapshot.storedOptions, ...structuredClone(optionsPatch) };
        } else {
          snapshot.options = payload.patch.replaceOptions
            ? structuredClone(optionsPatch)
            : { ...snapshot.options, ...structuredClone(optionsPatch) };
          snapshot.storedOptions = structuredClone(snapshot.options);
        }
      }
      if (payload.patch.customConfig) snapshot.customConfig = structuredClone(payload.patch.customConfig);
      snapshot.revision += 1;
      return { snapshot: structuredClone(snapshot) };
    }
    if (action === ACTION.IMPORT_CONFIG) {
      conflict(payload.expectedRevision);
      activationConflict(payload.expectedActivationRevision);
      const saved = structuredClone(payload.patch);
      if (payload.patch.options) {
        snapshot.options = structuredClone(payload.patch.options);
        snapshot.storedOptions = structuredClone(payload.patch.options);
      }
      if (payload.patch.customConfig) snapshot.customConfig = structuredClone(payload.patch.customConfig);
      snapshot.revision += 1;
      return { snapshot: structuredClone(snapshot), saved };
    }
    if (action === ACTION.RESET_CONFIG) {
      conflict(payload.expectedRevision);
      activationConflict(payload.expectedActivationRevision);
      snapshot = {
        revision: snapshot.revision + 1,
        activationRevision: snapshot.activationRevision + 1,
        storedOptions: {},
        options: {},
        customConfig: []
      };
      return {
        snapshot: structuredClone(snapshot),
        workspaceSessionGeneration: "workspace-generation-2",
        committed: true,
        cleanupWarnings: [{ label: "alarm-clear", message: "will retry" }]
      };
    }
    if (action === ACTION.GET_OFFICIAL_RULES_STATUS) return { status: structuredClone(status) };
    if (action === ACTION.SET_OFFICIAL_RULES_MODE) {
      rulesConflict(payload.expectedRevision);
      status = { ...status, revision: status.revision + 1, mode: payload.mode, consentDecided: true };
      return { status: structuredClone(status) };
    }
    if (action === ACTION.CHECK_OFFICIAL_RULES_UPDATE) {
      rulesConflict(payload.expectedRevision);
      status = { ...status, revision: status.revision + 1, phase: "ready", lastCheckedAt: 1234 };
      return { status: structuredClone(status), result: { status: "up-to-date" } };
    }
    if ([
      ACTION.APPLY_OFFICIAL_RULES_UPDATE,
      ACTION.ROLLBACK_OFFICIAL_COMPONENT,
      ACTION.ROLLBACK_LAST_RULES_UPDATE,
      ACTION.RESTORE_OFFICIAL_COMPONENT
    ].includes(action)) {
      rulesConflict(payload.expectedRevision);
      assert.equal(payload.expectedActivationRevision, status.activationRevision);
      snapshot.activationRevision += 1;
      status = {
        ...status,
        revision: status.revision + 1,
        activationRevision: snapshot.activationRevision,
        phase: "ready",
        sequence: (status.sequence || 0) + 1
      };
      return { status: structuredClone(status), configSnapshot: structuredClone(snapshot) };
    }
    if (action === ACTION.SET_OFFICIAL_DELETE_ALIAS_APPROVAL) {
      rulesConflict(payload.expectedRevision);
      assert.equal(payload.expectedActivationRevision, status.activationRevision);
      snapshot.activationRevision += 1;
      status = {
        ...status,
        revision: status.revision + 1,
        activationRevision: snapshot.activationRevision
      };
      return { status: structuredClone(status), configSnapshot: structuredClone(snapshot) };
    }
    throw new Error(`Unexpected action ${action}`);
  }

  const configService = createAppConfigService({ request, storageChanges });
  const observedSnapshots = [];
  const stopConfig = configService.subscribe((value) => observedSnapshots.push(value));
  assert.equal(storageListeners.size, 1);
  assert.equal((await configService.load()).revision, 1);

  // A scalar stale write rereads and replays exactly once over the newer scalar state.
  snapshot = {
    ...snapshot,
    revision: 2,
    storedOptions: { ...snapshot.storedOptions, language: "zh_CN" },
    options: { ...snapshot.options, language: "zh_CN" }
  };
  const scalarStart = calls.length;
  const scalarResult = await configService.patchOptions({ themeMode: "dark" });
  assert.equal(scalarResult.revision, 3);
  assert.equal(scalarResult.options.language, "zh_CN");
  assert.equal(scalarResult.options.themeMode, "dark");
  assert.deepEqual(calls.slice(scalarStart).map(([action]) => action), [
    ACTION.PATCH_CONFIG,
    ACTION.GET_CONFIG_SNAPSHOT,
    ACTION.PATCH_CONFIG
  ]);
  assert.deepEqual(calls.slice(scalarStart).filter(([action]) => action === ACTION.PATCH_CONFIG)
    .map(([, payload]) => payload.expectedRevision), [1, 2]);
  assert.deepEqual(calls.slice(scalarStart).filter(([action]) => action === ACTION.PATCH_CONFIG)
    .map(([, payload]) => payload.expectedActivationRevision), [4, 4]);

  // An activation-only conflict also refreshes and replays a scalar patch once, preserving the new baseline fields.
  snapshot = {
    ...snapshot,
    activationRevision: 5,
    options: { ...snapshot.options, officialBaselineMarker: "sequence-2" },
    storedOptions: { ...snapshot.storedOptions, officialBaselineMarker: "sequence-2" }
  };
  status = { ...status, activationRevision: 5 };
  const activationStart = calls.length;
  const activationResult = await configService.patchOptions({ fontSize: 17 });
  assert.equal(activationResult.revision, 4);
  assert.equal(activationResult.activationRevision, 5);
  assert.equal(activationResult.options.officialBaselineMarker, "sequence-2");
  assert.deepEqual(calls.slice(activationStart).map(([action]) => action), [
    ACTION.PATCH_CONFIG,
    ACTION.GET_CONFIG_SNAPSHOT,
    ACTION.PATCH_CONFIG
  ]);
  assert.deepEqual(calls.slice(activationStart).filter(([action]) => action === ACTION.PATCH_CONFIG)
    .map(([, payload]) => payload.expectedActivationRevision), [4, 5]);

  // Ordering/list writes are structural: refresh the cache after an activation conflict, reject, and never replay.
  snapshot = {
    ...snapshot,
    activationRevision: 6,
    options: { ...snapshot.options, modelPreferenceOrder: ["remote"] }
  };
  status = { ...status, activationRevision: 6 };
  const structuralStart = calls.length;
  await assert.rejects(
    configService.patchOptions({ modelPreferenceOrder: ["local"] }),
    (error) => error?.code === "ACTIVATION_REVISION_CONFLICT"
      && error.latestSnapshot?.revision === 4
      && error.latestSnapshot?.activationRevision === 6
  );
  assert.deepEqual(calls.slice(structuralStart).map(([action]) => action), [
    ACTION.PATCH_CONFIG,
    ACTION.GET_CONFIG_SNAPSHOT
  ]);
  assert.deepEqual(configService.current().options.modelPreferenceOrder, ["remote"]);

  // Import is a non-replayed batch and returns the background-normalized values.
  const imported = await configService.importConfig({
    options: { themeMode: "system" },
    customConfig: [{ id: "custom-1" }],
    promptLibrary: [{ id: "prompt-1" }]
  });
  assert.equal(imported.snapshot.revision, 5);
  assert.deepEqual(imported.saved.customConfig, [{ id: "custom-1" }]);
  assert.deepEqual(imported.saved.promptLibrary, [{ id: "prompt-1" }]);

  const officialRules = createOfficialRulesService({ request, configService, storageChanges });
  const observedStatus = [];
  const stopRules = officialRules.subscribe((value) => observedStatus.push(value));
  assert.equal((await officialRules.snapshot()).mode, "undecided");
  assert.equal((await officialRules.setMode("manual")).consentDecided, true);
  await officialRules.checkNow();
  snapshot.storedOptions = {
    ...snapshot.storedOptions,
    optionsSchemaVersion: 4,
    officialOverrides: {
      "summary/chatgpt": { hosts: ["chatgpt.com"] },
      "delete/deepseek": { enabled: false }
    }
  };
  configService.adopt({ snapshot: structuredClone(snapshot) });
  const clearStart = calls.length;
  await officialRules.clearOverride("summary/chatgpt");
  assert.deepEqual(snapshot.storedOptions.officialOverrides, {
    "delete/deepseek": { enabled: false }
  });
  const clearPatch = calls.slice(clearStart).find(([action]) => action === ACTION.PATCH_CONFIG);
  assert.equal(clearPatch[1].patch.optionsMode, "stored");
  assert.equal(Object.hasOwn(clearPatch[1].patch.options.officialOverrides, "summary/chatgpt"), false);
  const activationBefore = configService.current().activationRevision;
  const officialRevisionBeforeApply = status.revision;
  await officialRules.applyCandidate({ approvedDeleteAliases: [{ componentKey: "delete/chatgpt", host: "chatgpt.com" }] });
  assert.equal(configService.current().activationRevision, activationBefore + 1);
  const applyCall = calls.findLast(([action]) => action === ACTION.APPLY_OFFICIAL_RULES_UPDATE);
  assert.equal(applyCall[1].expectedRevision, officialRevisionBeforeApply);
  assert.equal(applyCall[1].expectedActivationRevision, activationBefore);

  const activationBeforeAliasApproval = configService.current().activationRevision;
  const officialRevisionBeforeAliasApproval = status.revision;
  await officialRules.setDeleteAliasApproval({
    componentKey: "delete/chatgpt",
    host: "chat.example.test",
    approved: true
  });
  assert.equal(configService.current().activationRevision, activationBeforeAliasApproval + 1);
  const aliasCall = calls.findLast(([action]) => action === ACTION.SET_OFFICIAL_DELETE_ALIAS_APPROVAL);
  assert.equal(aliasCall[1].expectedRevision, officialRevisionBeforeAliasApproval);
  assert.equal(aliasCall[1].expectedActivationRevision, activationBeforeAliasApproval);

  // Official-rules state has an independent revision. Conflicts refresh state and are never replayed.
  status = { ...status, revision: status.revision + 1 };
  const conflictStart = calls.length;
  await assert.rejects(
    officialRules.rollbackLast(),
    (error) => error?.code === "OFFICIAL_RULES_STATE_CONFLICT"
  );
  assert.equal(calls.slice(conflictStart).filter(([action]) => action === ACTION.ROLLBACK_LAST_RULES_UPDATE).length, 1);
  assert.ok(calls.slice(conflictStart).some(([action]) => action === ACTION.GET_OFFICIAL_RULES_STATUS));
  const newestRulesStatus = await officialRules.snapshot();
  status = { ...status, revision: status.revision - 1, phase: "stale-response" };
  const monotonicRulesStatus = await officialRules.snapshot({ force: true });
  assert.equal(monotonicRulesStatus.revision, newestRulesStatus.revision);
  assert.notEqual(monotonicRulesStatus.phase, "stale-response");

  // Other extension pages applying rules trigger a config refresh even when config revision is unchanged.
  const refreshCount = calls.filter(([action]) => action === ACTION.GET_CONFIG_SNAPSHOT).length;
  snapshot.activationRevision += 1;
  for (const listener of storageListeners) listener({ chatclubOfficialRulesStateV1: { newValue: {} } }, "local");
  await new Promise((resolve) => { setTimeout(resolve, 90); });
  assert.ok(calls.filter(([action]) => action === ACTION.GET_CONFIG_SNAPSHOT).length > refreshCount);
  assert.equal(configService.current().activationRevision, snapshot.activationRevision);
  const monotonicSnapshot = configService.current();
  configService.adopt({ snapshot: { ...monotonicSnapshot, revision: monotonicSnapshot.revision - 1, activationRevision: 0 } });
  assert.deepEqual(configService.current(), monotonicSnapshot, "late config responses must not replace a newer revision");

  const reset = await configService.resetConfig();
  assert.equal(reset.workspaceSessionGeneration, "workspace-generation-2");
  assert.equal(reset.committed, true);
  assert.deepEqual(reset.cleanupWarnings, [{ label: "alarm-clear", message: "will retry" }]);
  assert.equal(reset.snapshot.activationRevision, snapshot.activationRevision);
  assert.ok(observedSnapshots.length >= 5);
  assert.ok(observedStatus.length >= 3);

  stopRules();
  stopConfig();
  assert.equal(storageListeners.size, 0);
  console.log("App config revision, official-rules service, and cross-page activation sync tests passed.");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
