#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const baseline = await import("../shared/official-rules-baseline.js");
  const contract = await import("../shared/official-rules-contract.js");
  const channelRuntime = await import("../background/official-rules-channel.js");
  const repositoryRuntime = await import("../background/official-rules-repository.js");
  const updaterRuntime = await import("../background/official-rules-updater.js");
  const {
    OFFICIAL_RULES_BASELINE_COMPONENTS,
    OFFICIAL_RULES_COMPONENT_KEYS,
    findOfficialRulesBaselineComponent,
    officialRulesComponentKey
  } = baseline;
  const officialRulesTrustRoots = (feature, siteId) => (
    findOfficialRulesBaselineComponent(feature, siteId)?.trustRoots || []
  );
  const {
    OFFICIAL_RULES_LIMITS,
    OFFICIAL_RULES_SELECTOR_SLOTS
  } = contract;
  const OFFICIAL_RULES_RELEASE_PREFIX = "https://github.com/0-V-linuxdo/ChatClub-rules/releases/download/";
  const { officialRulesSignatureInput, sha256Hex } = channelRuntime;
  const { OFFICIAL_RULES_BLOB_PREFIX, createOfficialRulesRepository } = repositoryRuntime;
  const {
    OFFICIAL_RULES_ALARM_NAME,
    createOfficialRulesActivationController,
    createOfficialRulesAlarmController,
    createOfficialRulesFetchUrlPolicy,
    createOfficialRulesTransitionCoordinator,
    createOfficialRulesUpdater
  } = updaterRuntime;

  class MemoryStorage {
    constructor() { this.values = {}; }
    async get(keys) {
      if (keys === null) return structuredClone(this.values);
      const selected = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(selected.filter((key) => Object.hasOwn(this.values, key)).map((key) => [key, structuredClone(this.values[key])]));
    }
    async set(values) { Object.assign(this.values, structuredClone(values)); }
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete this.values[key]; }
  }

  const cryptoApi = globalThis.crypto;
  const keyPair = await cryptoApi.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const keyId = "test-key";
  const keyring = { [keyId]: { algorithm: "ECDSA-P256-SHA256", publicKey: keyPair.publicKey } };
  const encode = (value) => new TextEncoder().encode(value);
  const sign = async (kind, rawText) => {
    const bytes = new Uint8Array(await cryptoApi.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      officialRulesSignatureInput(kind, encode(rawText))
    ));
    return JSON.stringify({ schemaVersion: 1, keyId, algorithm: "ECDSA-P256-SHA256", signature: Buffer.from(bytes).toString("base64url") });
  };
  const releaseUrl = (tag, asset) => `${OFFICIAL_RULES_RELEASE_PREFIX}${tag}/${asset}`;
  const assets = new Map();
  const addSignedAsset = async (kind, tag, assetName, value) => {
    const rawText = JSON.stringify(value);
    const url = releaseUrl(tag, assetName);
    const signatureUrl = `${url}.sig.json`;
    assets.set(url, rawText);
    assets.set(signatureUrl, await sign(kind, rawText));
    return {
      url,
      signatureUrl,
      size: encode(rawText).byteLength,
      sha256: await sha256Hex(encode(rawText), cryptoApi),
      keyId
    };
  };
  const selectors = (feature) => Object.fromEntries(OFFICIAL_RULES_SELECTOR_SLOTS[feature].map((slot) => [slot, []]));
  const componentValue = (entry, revision) => {
    const value = {
      schemaVersion: 1,
      rulesApiVersion: 1,
      feature: entry.feature,
      siteId: entry.siteId,
      revision,
      status: "active",
      hosts: officialRulesTrustRoots(entry.feature, entry.siteId).slice(0, 1),
      pathPrefixes: [],
      selectors: selectors(entry.feature),
      parameters: entry.feature === "summary"
        ? { waitMs: 1000 }
        : entry.feature === "messageNavigator" ? { summaryMaxChars: 60 } : { timeoutMs: 15000 }
    };
    const selector = (slot) => `[data-official-rule='${entry.feature}-${entry.siteId}-${revision}-${slot}']`;
    const requiredSlots = entry.feature === "summary"
      ? ["messageRoot", "userRoot", "assistantRoot"]
      : entry.feature === "messageNavigator"
        ? ["message", "userRole", "assistantRole", "composer"]
        : [OFFICIAL_RULES_SELECTOR_SLOTS[entry.feature][0]];
    for (const slot of requiredSlots) value.selectors[slot] = [selector(slot)];
    return value;
  };
  const componentAsset = async (entry, revision, tag) => ({
    feature: entry.feature,
    siteId: entry.siteId,
    revision,
    ...await addSignedAsset("component", tag, `${entry.feature}-${entry.siteId}-r${revision}.json`, componentValue(entry, revision))
  });
  const metadata = (sequence) => ({
    schemaVersion: 1,
    channel: "stable",
    sequence,
    rulesVersion: `2026.08.01.${sequence}`,
    rulesApiVersion: 1,
    minExtensionVersion: "2026.7.31.1",
    publishedAt: `2026-08-01T00:00:${String(sequence % 60).padStart(2, "0")}Z`
  });

  const pointersV1 = [];
  for (const entry of OFFICIAL_RULES_BASELINE_COMPONENTS) pointersV1.push(await componentAsset(entry, 1, "rules-v1"));
  const buildRelease = async (sequence, pointers, tag, metadataOverrides = {}) => {
    const releaseMetadata = { ...metadata(sequence), ...metadataOverrides };
    const catalog = { ...releaseMetadata, releaseNotes: `release ${sequence}`, components: pointers };
    const catalogRef = await addSignedAsset("catalog", tag, "catalog.json", catalog);
    const channel = { ...releaseMetadata, catalog: catalogRef };
    const rawText = JSON.stringify(channel);
    return { channelRaw: rawText, channelSignature: await sign("channel", rawText), catalogRef };
  };
  const releaseV1 = await buildRelease(1, pointersV1, "rules-v1");
  let currentRelease = releaseV1;
  const changedEntry = OFFICIAL_RULES_BASELINE_COMPONENTS[0];
  const changedKey = officialRulesComponentKey(changedEntry.feature, changedEntry.siteId);
  const changedPointer = await componentAsset(changedEntry, 2, "rules-v2");
  const pointersV2 = pointersV1.map((pointer) => (
    officialRulesComponentKey(pointer.feature, pointer.siteId) === changedKey ? changedPointer : pointer
  ));
  const releaseV2 = await buildRelease(2, pointersV2, "rules-v2");
  const secondChangedEntry = OFFICIAL_RULES_BASELINE_COMPONENTS[1];
  const secondChangedKey = officialRulesComponentKey(secondChangedEntry.feature, secondChangedEntry.siteId);
  const secondChangedPointer = await componentAsset(secondChangedEntry, 2, "rules-v3");
  const pointersV3 = pointersV2.map((pointer) => (
    officialRulesComponentKey(pointer.feature, pointer.siteId) === secondChangedKey ? secondChangedPointer : pointer
  ));
  const releaseV3 = await buildRelease(3, pointersV3, "rules-v3");

  const channelUrl = "https://0-v-linuxdo.github.io/ChatClub-rules/stable/channel.json";
  const channelSignatureUrl = channelUrl.replace(/\/channel\.json$/, "/channel.sig.json");
  const policy = createOfficialRulesFetchUrlPolicy({ channelUrl, channelSignatureUrl });
  assert.equal(policy.allowUrl(channelUrl, "channel-payload"), true);
  assert.equal(policy.allowUrl("https://evil.test/channel.json", "channel-payload"), false);
  assert.equal(policy.allowFinalUrl(channelUrl, "channel-payload", channelUrl), true);
  assert.equal(policy.allowFinalUrl("https://release-assets.githubusercontent.com/github-production-release-asset/file", "component-payload", changedPointer?.url || releaseUrl("rules-v1", "component.json")), true);
  assert.equal(policy.allowFinalUrl("https://objects.githubusercontent.com/release/file", "component-payload", releaseUrl("rules-v1", "component.json")), false);
  assert.equal(policy.allowFinalUrl("https://0-v-linuxdo.github.io/redirected/channel.json", "channel-payload", channelUrl), false);
  assert.throws(
    () => createOfficialRulesFetchUrlPolicy({ channelUrl, channelSignatureUrl: "https://0-v-linuxdo.github.io/ChatClub-rules/stable/other.sig.json" }),
    (error) => error?.code === "INVALID_CHANNEL_URL"
  );

  const fetchCalls = [];
  const fetchMock = async (url, request) => {
    fetchCalls.push({ url, request });
    if (url === channelUrl) return new Response(currentRelease.channelRaw, { status: 200, headers: { ETag: `channel-${JSON.parse(currentRelease.channelRaw).sequence}` } });
    if (url === channelSignatureUrl) return new Response(currentRelease.channelSignature, { status: 200 });
    if (assets.has(url)) return new Response(assets.get(url), { status: 200 });
    return new Response("missing", { status: 404 });
  };
  const packagedSnapshot = (createdAt) => ({
    source: "packaged",
    sequence: 0,
    rulesVersion: "packaged",
    catalogHash: "",
    officialTargets: Object.fromEntries(OFFICIAL_RULES_BASELINE_COMPONENTS.map((entry) => [
      officialRulesComponentKey(entry.feature, entry.siteId),
      { feature: entry.feature, siteId: entry.siteId, revision: 0 }
    ])),
    createdAt
  });
  const storage = new MemoryStorage();
  let now = 10_000;
  let attempt = 0;
  const repository = createOfficialRulesRepository({ storage, now: () => now, createAttemptId: () => `attempt-${++attempt}` });
  await repository.initializePackaged(packagedSnapshot(now));
  const updater = createOfficialRulesUpdater({
    repository,
    channelUrl,
    channelSignatureUrl,
    channelKeyId: keyId,
    channel: "stable",
    keyring,
    crypto: cryptoApi,
    fetch: fetchMock,
    now: () => now,
    isCompatible: () => true
  });

  const firstCheck = await updater.checkForUpdates({ force: true });
  assert.equal(firstCheck.status, "candidate");
  assert.equal(firstCheck.changedComponents.length, OFFICIAL_RULES_COMPONENT_KEYS.length);
  assert.equal(firstCheck.downloadedComponents.length, OFFICIAL_RULES_COMPONENT_KEYS.length);
  const applyPhases = [];
  const coordinator = createOfficialRulesTransitionCoordinator();
  const activation = createOfficialRulesActivationController({
    repository,
    materializeSnapshot: updater.materializeSnapshot,
    transitionCoordinator: coordinator,
    applySnapshot: async (snapshot, context) => {
      applyPhases.push(context.phase);
      assert.equal(Object.keys(snapshot.components).length, OFFICIAL_RULES_COMPONENT_KEYS.length);
    }
  });
  await activation.applyCandidate({ expectedCatalogHash: firstCheck.candidate.catalogHash });
  assert.deepEqual(applyPhases, ["apply"]);
  assert.equal((await repository.readState()).active.sequence, 1);

  currentRelease = releaseV2;
  fetchCalls.length = 0;
  now += 1000;
  const secondCheck = await updater.checkForUpdates({ force: true });
  assert.deepEqual(secondCheck.changedComponents, [changedKey]);
  assert.deepEqual(secondCheck.downloadedComponents, [changedKey]);
  const fetchedComponentPayloads = fetchCalls
    .map(({ url }) => url)
    .filter((url) => /\/releases\/download\/.*\.json$/.test(url)
      && !url.endsWith("catalog.json")
      && !url.endsWith(".sig.json"));
  assert.deepEqual(fetchedComponentPayloads, [changedPointer.url], "only the changed component payload may be downloaded");

  const rollbackPhases = [];
  const failingActivation = createOfficialRulesActivationController({
    repository,
    materializeSnapshot: updater.materializeSnapshot,
    transitionCoordinator: coordinator,
    applySnapshot: async (_snapshot, context) => {
      rollbackPhases.push(context.phase);
      if (context.phase === "apply") throw new Error("synthetic registration failure");
    }
  });
  await assert.rejects(
    failingActivation.applyCandidate({ expectedCatalogHash: secondCheck.candidate.catalogHash }),
    (error) => error?.code === "APPLY_ROLLED_BACK"
  );
  const afterRollback = await repository.readState();
  assert.deepEqual(rollbackPhases, ["apply", "rollback"]);
  assert.equal(afterRollback.active.sequence, 1);
  assert.equal(afterRollback.journal.phase, "idle");
  assert.equal(afterRollback.quarantine.at(-1).catalogHash, secondCheck.candidate.catalogHash);

  const advancingStorage = new MemoryStorage();
  const advancingRepository = createOfficialRulesRepository({ storage: advancingStorage, now: () => now });
  await advancingRepository.initializePackaged(packagedSnapshot(now));
  let advancingRelease = releaseV1;
  const advancingFetchCalls = [];
  const advancingUpdater = createOfficialRulesUpdater({
    repository: advancingRepository,
    channelUrl,
    channelSignatureUrl,
    channelKeyId: keyId,
    channel: "stable",
    keyring,
    crypto: cryptoApi,
    fetch: async (url) => {
      advancingFetchCalls.push(url);
      if (url === channelUrl) return new Response(advancingRelease.channelRaw, { status: 200 });
      if (url === channelSignatureUrl) return new Response(advancingRelease.channelSignature, { status: 200 });
      if (assets.has(url)) return new Response(assets.get(url), { status: 200 });
      return new Response("missing", { status: 404 });
    },
    now: () => now,
    isCompatible: () => true
  });
  const advancingActivation = createOfficialRulesActivationController({
    repository: advancingRepository,
    materializeSnapshot: advancingUpdater.materializeSnapshot,
    applySnapshot: async () => {}
  });
  const advancingV1 = await advancingUpdater.checkForUpdates({ force: true });
  await advancingActivation.applyCandidate({ expectedCatalogHash: advancingV1.candidate.catalogHash });

  advancingRelease = releaseV2;
  advancingFetchCalls.length = 0;
  const stagedV2 = await advancingUpdater.checkForUpdates({ force: true });
  assert.equal(stagedV2.status, "candidate");
  assert.deepEqual(stagedV2.changedComponents, [changedKey]);
  assert.deepEqual(stagedV2.downloadedComponents, [changedKey]);
  assert.equal((await advancingRepository.readState()).candidate.sequence, 2);
  assert.equal(await advancingRepository.hasBlob(changedPointer.sha256), true);

  advancingRelease = releaseV3;
  advancingFetchCalls.length = 0;
  const stagedV3 = await advancingUpdater.checkForUpdates({ force: true });
  assert.equal(stagedV3.status, "candidate");
  assert.deepEqual(
    stagedV3.changedComponents,
    [changedKey, secondChangedKey],
    "a newer candidate must represent the complete active-to-latest component delta"
  );
  assert.deepEqual(
    stagedV3.downloadedComponents,
    [secondChangedKey],
    "a component verified for the superseded candidate must be reused from the content-addressed cache"
  );
  const advancingComponentFetches = advancingFetchCalls.filter((url) => (
    /\/releases\/download\/.*\.json$/.test(url)
      && !url.endsWith("catalog.json")
      && !url.endsWith(".sig.json")
  ));
  assert.deepEqual(advancingComponentFetches, [secondChangedPointer.url]);
  const advancingState = await advancingRepository.readState();
  assert.equal(advancingState.active.sequence, 1);
  assert.equal(advancingState.candidate.sequence, 3);
  assert.equal(advancingState.candidate.officialTargets[changedKey].sha256, changedPointer.sha256);
  assert.equal(advancingState.candidate.officialTargets[secondChangedKey].sha256, secondChangedPointer.sha256);

  advancingStorage.values[`${OFFICIAL_RULES_BLOB_PREFIX}${changedPointer.sha256}`].rawText = JSON.stringify({
    ...JSON.parse(advancingStorage.values[`${OFFICIAL_RULES_BLOB_PREFIX}${changedPointer.sha256}`].rawText),
    revision: 999
  });
  const tamperedApplyPhases = [];
  const tamperGuardedActivation = createOfficialRulesActivationController({
    repository: advancingRepository,
    materializeSnapshot: advancingUpdater.materializeSnapshot,
    applySnapshot: async (_snapshot, context) => { tamperedApplyPhases.push(context.phase); }
  });
  await assert.rejects(
    tamperGuardedActivation.applyCandidate({ expectedCatalogHash: stagedV3.candidate.catalogHash }),
    (error) => error?.code === "APPLY_ROLLED_BACK" && /signature|SHA-256|hash/i.test(error.message)
  );
  const afterTamperedApply = await advancingRepository.readState();
  assert.deepEqual(tamperedApplyPhases, ["rollback"], "tampered candidate bytes must be rejected before runtime preparation");
  assert.equal(afterTamperedApply.active.sequence, 1, "a tampered staged component must never activate");
  assert.equal(afterTamperedApply.candidate, null);
  assert.equal(afterTamperedApply.journal.phase, "idle");
  assert.equal(afterTamperedApply.quarantine.at(-1).catalogHash, stagedV3.candidate.catalogHash);

  const alarmEvents = [];
  const alarms = {
    create(name, info) { alarmEvents.push({ type: "create", name, when: info.when }); },
    clear(name) { alarmEvents.push({ type: "clear", name }); return true; }
  };
  const alarmController = createOfficialRulesAlarmController({
    repository,
    alarms,
    now: () => now,
    random: () => 0.5,
    checkForUpdates: async () => {
      assert.equal(alarmEvents[0]?.type, "create", "next one-shot alarm must be persisted and scheduled before awaiting the network");
      return { status: "not-modified" };
    }
  });
  await alarmController.setConsent(true);
  alarmEvents.length = 0;
  const alarmResult = await alarmController.handleAlarm({ name: OFFICIAL_RULES_ALARM_NAME });
  assert.equal(alarmResult.ok, true);
  assert.ok(alarmEvents.filter(({ type }) => type === "create").length >= 2, "alarm must be scheduled before and after a completed check");
  await alarmController.setConsent(false);
  assert.equal((await repository.readState()).consent.automaticChecks, false);

  const guardedStorage = new MemoryStorage();
  const guardedRepository = createOfficialRulesRepository({ storage: guardedStorage, now: () => now });
  await guardedRepository.initializePackaged(packagedSnapshot(now));
  let compatible = false;
  let servedRelease = await buildRelease(10, pointersV1, "rules-v10", { minExtensionVersion: "2027.1.1.1" });
  const guardedFetchCalls = [];
  const guardedFetch = async (url) => {
    guardedFetchCalls.push(url);
    if (url === channelUrl) return new Response(servedRelease.channelRaw, { status: 200, headers: { ETag: `guarded-${JSON.parse(servedRelease.channelRaw).sequence}` } });
    if (url === channelSignatureUrl) return new Response(servedRelease.channelSignature, { status: 200 });
    if (assets.has(url)) return new Response(assets.get(url), { status: 200 });
    return new Response("missing", { status: 404 });
  };
  const guardedUpdater = createOfficialRulesUpdater({
    repository: guardedRepository,
    channelUrl,
    channelSignatureUrl,
    channelKeyId: keyId,
    channel: "stable",
    keyring,
    crypto: cryptoApi,
    fetch: guardedFetch,
    now: () => now,
    isCompatible: () => compatible
  });
  const suppressed = await guardedUpdater.checkForUpdates({ force: true });
  assert.equal(suppressed.status, "suppressed");
  assert.deepEqual(guardedFetchCalls, [channelUrl, channelSignatureUrl], "an incompatible signed channel must suppress before catalog fetch or parse");
  let guardedState = await guardedRepository.readState();
  assert.equal(guardedState.active.source, "packaged");
  assert.equal(guardedState.candidate, null);
  assert.equal(guardedState.highestSeen.sequence, 10);
  assert.equal(guardedState.suppressed.catalogHash, JSON.parse(servedRelease.channelRaw).catalog.sha256);

  compatible = true;
  guardedFetchCalls.length = 0;
  const reconsidered = await guardedUpdater.checkForUpdates({ force: true });
  assert.equal(reconsidered.status, "candidate");
  guardedState = await guardedRepository.readState();
  assert.equal(guardedState.suppressed, null, "the same signed channel must be reconsidered after the extension becomes compatible");
  const guardedActivation = createOfficialRulesActivationController({
    repository: guardedRepository,
    materializeSnapshot: guardedUpdater.materializeSnapshot,
    applySnapshot: async () => {}
  });
  await guardedActivation.applyCandidate({ expectedCatalogHash: reconsidered.candidate.catalogHash });

  servedRelease = await buildRelease(11, pointersV1, "rules-v11-api2", {
    rulesApiVersion: 2,
    minExtensionVersion: "2026.7.31.1"
  });
  guardedFetchCalls.length = 0;
  const futureApiSuppressed = await guardedUpdater.checkForUpdates({ force: true });
  assert.equal(futureApiSuppressed.status, "suppressed");
  assert.equal(futureApiSuppressed.requiresExtensionUpdate, true);
  assert.equal(futureApiSuppressed.requiresNewerRulesApi, true);
  assert.equal(futureApiSuppressed.rulesApiVersion, 2);
  assert.equal(futureApiSuppressed.supportedRulesApiVersion, 1);
  assert.deepEqual(
    guardedFetchCalls,
    [channelUrl, channelSignatureUrl],
    "a signed future-API channel must persist update-required state before catalog fetch"
  );
  guardedState = await guardedRepository.readState();
  assert.equal(guardedState.highestSeen.sequence, 11);
  assert.equal(guardedState.suppressed.sequence, 11);
  assert.equal(guardedState.suppressed.reason, "extension-update-required");

  const missingPointer = pointersV1.find((pointer) => officialRulesComponentKey(pointer.feature, pointer.siteId) !== changedKey);
  delete guardedStorage.values[`${OFFICIAL_RULES_BLOB_PREFIX}${missingPointer.sha256}`];
  servedRelease = await buildRelease(12, pointersV2, "rules-v12");
  guardedFetchCalls.length = 0;
  await assert.rejects(
    guardedUpdater.checkForUpdates({ force: true }),
    (error) => error?.code === "UNCHANGED_COMPONENT_BLOB_MISSING"
  );
  assert.equal(guardedFetchCalls.includes(missingPointer.url), false, "a missing unchanged blob must never be silently re-downloaded");

  const oversizedPointers = pointersV1.map((pointer, index) => ({
    ...pointer,
    revision: 20,
    size: OFFICIAL_RULES_LIMITS.componentBytes,
    sha256: (index + 1).toString(16).padStart(64, "0"),
    url: releaseUrl("rules-v13", `${pointer.feature}-${pointer.siteId}.json`),
    signatureUrl: releaseUrl("rules-v13", `${pointer.feature}-${pointer.siteId}.json.sig.json`)
  }));
  assert.ok(oversizedPointers.length * OFFICIAL_RULES_LIMITS.componentBytes > OFFICIAL_RULES_LIMITS.releaseComponentBytes);
  servedRelease = await buildRelease(13, oversizedPointers, "rules-v13");
  guardedFetchCalls.length = 0;
  await assert.rejects(
    guardedUpdater.checkForUpdates({ force: true }),
    (error) => error?.code === "RELEASE_COMPONENT_BYTES_EXCEEDED"
  );
  assert.equal(
    guardedFetchCalls.some((url) => url.includes("/rules-oversized/") && !url.endsWith("catalog.json") && !url.endsWith(".sig.json")),
    false,
    "release aggregate size must be rejected before any component download"
  );

  const largeComponentValue = (entry, revision) => {
    const value = componentValue(entry, revision);
    const paddedSelector = (slot, index) => {
      const prefix = `[data-gap-${entry.feature}-${entry.siteId}-${slot}-${index}]`;
      return `${prefix}${`.gap-${index}`.repeat(Math.floor((500 - prefix.length) / (`.gap-${index}`.length)))}`;
    };
    for (const slot of OFFICIAL_RULES_SELECTOR_SLOTS[entry.feature].slice(0, 8)) {
      value.selectors[slot] = Array.from({ length: 8 }, (_, index) => paddedSelector(slot, index));
    }
    return value;
  };
  const gapPointers = [...pointersV1];
  for (let index = 0; index < 18; index += 1) {
    const entry = OFFICIAL_RULES_BASELINE_COMPONENTS[index];
    const tag = `rules-gap-${index + 1}`;
    gapPointers[index] = {
      feature: entry.feature,
      siteId: entry.siteId,
      revision: 2,
      ...await addSignedAsset(
        "component",
        tag,
        `${entry.feature}-${entry.siteId}-r2.json`,
        largeComponentValue(entry, 2)
      )
    };
  }
  assert.ok(
    gapPointers.slice(0, 18).reduce((total, pointer) => total + pointer.size, 0) > OFFICIAL_RULES_LIMITS.releaseComponentBytes,
    "the skipped-release fixture must exceed the per-release byte cap cumulatively"
  );
  assert.ok(gapPointers[17].size <= OFFICIAL_RULES_LIMITS.releaseComponentBytes);
  const gapRelease = await buildRelease(30, gapPointers, "rules-gap-18");
  const gapStorage = new MemoryStorage();
  const gapRepository = createOfficialRulesRepository({ storage: gapStorage, now: () => now });
  await gapRepository.initializePackaged(packagedSnapshot(now));
  const gapUpdater = createOfficialRulesUpdater({
    repository: gapRepository,
    channelUrl,
    channelSignatureUrl,
    channelKeyId: keyId,
    channel: "stable",
    keyring,
    crypto: cryptoApi,
    fetch: async (url) => {
      if (url === channelUrl) return new Response(gapRelease.channelRaw, { status: 200 });
      if (url === channelSignatureUrl) return new Response(gapRelease.channelSignature, { status: 200 });
      if (assets.has(url)) return new Response(assets.get(url), { status: 200 });
      return new Response("missing", { status: 404 });
    },
    now: () => now,
    isCompatible: () => true
  });
  const gapCheck = await gapUpdater.checkForUpdates({ force: true });
  assert.equal(gapCheck.status, "candidate");
  assert.equal(gapCheck.downloadedComponents.length, OFFICIAL_RULES_COMPONENT_KEYS.length);

  const packagedRules = await import("../shared/official-rules-packaged.js");
  const missingKey = "summary/manus";
  assert.equal(OFFICIAL_RULES_COMPONENT_KEYS.includes(missingKey), true);
  const legacyPointers = pointersV1.filter((pointer) => officialRulesComponentKey(pointer.feature, pointer.siteId) !== missingKey);
  assert.equal(legacyPointers.length, OFFICIAL_RULES_COMPONENT_KEYS.length - 1);
  const incompleteRelease = await buildRelease(41, legacyPointers, "rules-legacy-gap");
  const incompleteStorage = new MemoryStorage();
  const incompleteRepository = createOfficialRulesRepository({ storage: incompleteStorage, now: () => now });
  await incompleteRepository.initializePackaged(packagedSnapshot(now));
  const incompleteUpdater = createOfficialRulesUpdater({
    repository: incompleteRepository,
    channelUrl,
    channelSignatureUrl,
    channelKeyId: keyId,
    channel: "stable",
    keyring,
    crypto: cryptoApi,
    fetch: async (url) => {
      if (url === channelUrl) return new Response(incompleteRelease.channelRaw, { status: 200 });
      if (url === channelSignatureUrl) return new Response(incompleteRelease.channelSignature, { status: 200 });
      if (assets.has(url)) return new Response(assets.get(url), { status: 200 });
      return new Response("missing", { status: 404 });
    },
    now: () => now,
    isCompatible: () => true
  });
  await assert.rejects(
    incompleteUpdater.checkForUpdates({ force: true }),
    (error) => error?.code === "CATALOG_COMPONENT_MISSING",
    "a newly fetched catalog must still contain every packaged baseline key"
  );

  const channelHash = await sha256Hex(encode(incompleteRelease.channelRaw), cryptoApi);
  await incompleteRepository.putBlob({
    hash: channelHash,
    kind: "channel",
    rawText: incompleteRelease.channelRaw,
    signatureText: incompleteRelease.channelSignature,
    keyId,
    verifiedAt: now
  });
  await incompleteRepository.putBlob({
    hash: incompleteRelease.catalogRef.sha256,
    kind: "catalog",
    rawText: assets.get(incompleteRelease.catalogRef.url),
    signatureText: assets.get(incompleteRelease.catalogRef.signatureUrl),
    keyId,
    verifiedAt: now
  });
  for (const pointer of legacyPointers) {
    await incompleteRepository.putBlob({
      hash: pointer.sha256,
      kind: "component",
      rawText: assets.get(pointer.url),
      signatureText: assets.get(pointer.signatureUrl),
      keyId,
      verifiedAt: now
    });
  }
  const storedGapSnapshot = {
    source: "remote",
    sequence: 41,
    rulesVersion: metadata(41).rulesVersion,
    keyId,
    channelHash,
    catalogHash: incompleteRelease.catalogRef.sha256,
    officialTargets: Object.fromEntries(legacyPointers.map((pointer) => [
      officialRulesComponentKey(pointer.feature, pointer.siteId),
      pointer
    ])),
    createdAt: now
  };
  const materializedGap = await incompleteUpdater.materializeSnapshot(storedGapSnapshot);
  assert.equal(Object.keys(materializedGap.components).length, OFFICIAL_RULES_COMPONENT_KEYS.length);
  assert.deepEqual(
    materializedGap.components[missingKey],
    packagedRules.OFFICIAL_RULES_PACKAGED_COMPONENTS[missingKey],
    "a stored catalog that predates a packaged site must fill that site from the local baseline"
  );
  assert.equal(materializedGap.components[missingKey].siteId, "manus");

  console.log("Official rules incremental downloads, pre-catalog suppression, cache guardrails, activation rollback, and one-shot alarm tests passed.");
})().catch((error) => {
  console.error(error?.stack || error);
  if (error?.details) console.error(JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
});
