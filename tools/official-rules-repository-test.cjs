#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { officialRulesComponentKey } = await import("../shared/official-rules-baseline.js");
  const {
    OFFICIAL_RULES_BLOB_PREFIX,
    createOfficialRulesRepository
  } = await import("../background/official-rules-repository.js");

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

  const storage = new MemoryStorage();
  let now = 1000;
  let attempt = 0;
  const repository = createOfficialRulesRepository({
    storage,
    now: () => now,
    createAttemptId: () => `attempt-${++attempt}`
  });
  const key = officialRulesComponentKey("summary", "chatgpt");
  const packaged = {
    source: "packaged",
    sequence: 0,
    rulesVersion: "packaged",
    catalogHash: "",
    officialTargets: {
      [key]: { feature: "summary", siteId: "chatgpt", revision: 0 }
    },
    createdAt: now
  };
  await repository.initializePackaged(packaged);
  assert.equal((await repository.readState()).active.source, "packaged");

  const hash = (digit) => digit.repeat(64);
  const putCandidateBlobs = async (channelHash, catalogHash, componentHash) => {
    await repository.putBlob({ hash: channelHash, kind: "channel", rawText: `{"channel":"${channelHash[0]}"}`, signatureText: `{"signature":"${channelHash[0]}"}`, keyId: "test" });
    await repository.putBlob({ hash: catalogHash, kind: "catalog", rawText: `{"catalog":"${catalogHash[0]}"}`, signatureText: `{"signature":"${catalogHash[0]}"}`, keyId: "test" });
    await repository.putBlob({ hash: componentHash, kind: "component", rawText: `{"component":"${componentHash[0]}"}`, signatureText: `{"signature":"${componentHash[0]}"}`, keyId: "test" });
  };
  const candidate = (sequence, channelHash, catalogHash, componentHash, componentRevision = sequence, urlSuffix = sequence) => ({
    source: "remote",
    sequence,
    rulesVersion: `rules-${sequence}`,
    keyId: "test",
    channelHash,
    catalogHash,
    officialTargets: {
      [key]: {
        feature: "summary",
        siteId: "chatgpt",
        revision: componentRevision,
        url: `https://github.com/example/${urlSuffix}.json`,
        signatureUrl: `https://github.com/example/${urlSuffix}.json.sig`,
        size: 100,
        sha256: componentHash,
        keyId: "test"
      }
    },
    createdAt: now
  });

  const observationStorage = new MemoryStorage();
  const observationRepository = createOfficialRulesRepository({ storage: observationStorage, now: () => now });
  await observationRepository.initializePackaged(packaged);
  await observationRepository.observeSignedChannel({ sequence: 7, channelHash: hash("d") });
  const observedTargets = candidate(7, hash("d"), hash("e"), hash("f"), 7, "observed").officialTargets;
  await observationRepository.observeSignedCatalog({
    sequence: 7,
    channelHash: hash("d"),
    officialTargets: observedTargets
  });
  const restartedObservationRepository = createOfficialRulesRepository({ storage: observationStorage, now: () => now });
  await assert.rejects(
    restartedObservationRepository.observeSignedChannel({ sequence: 7, channelHash: hash("e") }),
    (error) => error?.code === "SEQUENCE_EQUIVOCATION",
    "a verified channel watermark must survive restart even before candidate staging"
  );
  await assert.rejects(
    restartedObservationRepository.observeSignedCatalog({
      sequence: 8,
      channelHash: hash("8"),
      officialTargets: candidate(8, hash("8"), hash("9"), hash("a"), 7, "equivocated-after-observation").officialTargets
    }),
    (error) => error?.code === "COMPONENT_REVISION_EQUIVOCATION",
    "a signed catalog component watermark must survive restart even when component download never completed"
  );

  await putCandidateBlobs(hash("1"), hash("2"), hash("3"));
  await repository.stageCandidate(candidate(1, hash("1"), hash("2"), hash("3")));
  const first = await repository.beginCandidateApply({ expectedCatalogHash: hash("2") });
  assert.equal(first.journal.phase, "applying");
  assert.equal((await repository.readState()).active.source, "packaged", "active pointer must not move before commit");
  await repository.markRollingBack(first.journal.attemptId, new Error("runtime apply failed"));
  await repository.completeRollback(first.journal.attemptId);
  const rolledBack = await repository.readState();
  assert.equal(rolledBack.journal.phase, "idle");
  assert.equal(rolledBack.active.source, "packaged");
  assert.equal(rolledBack.candidate, null);
  assert.equal(rolledBack.quarantine[0].catalogHash, hash("2"));
  await assert.rejects(
    repository.stageCandidate(candidate(1, hash("1"), hash("2"), hash("3"))),
    (error) => error?.code === "CANDIDATE_QUARANTINED"
  );

  now += 1000;
  await putCandidateBlobs(hash("4"), hash("5"), hash("6"));
  await repository.stageCandidate(candidate(2, hash("4"), hash("5"), hash("6")));
  const second = await repository.beginCandidateApply({ expectedCatalogHash: hash("5") });
  await repository.commitApply(second.journal.attemptId);
  const committed = await repository.readState();
  assert.equal(committed.active.catalogHash, hash("5"));
  assert.equal(committed.previous.source, "packaged");
  assert.equal(committed.activationRevision, 1);

  now += 1000;
  await putCandidateBlobs(hash("7"), hash("8"), hash("9"));
  await repository.stageCandidate(candidate(3, hash("7"), hash("8"), hash("9")));
  const interrupted = await repository.beginCandidateApply({ expectedCatalogHash: hash("8") });
  const restartedRepository = createOfficialRulesRepository({ storage, now: () => now });
  const interruptedState = await restartedRepository.readState();
  assert.equal(interruptedState.journal.phase, "applying", "activation journal must survive background restart");
  assert.equal(interruptedState.active.catalogHash, hash("5"), "journal recovery target remains the declared active snapshot");
  await restartedRepository.completeRecovery(interrupted.journal.attemptId);
  const recovered = await restartedRepository.readState();
  assert.equal(recovered.journal.phase, "idle");
  assert.equal(recovered.active.catalogHash, hash("5"));
  assert.equal(recovered.quarantine.at(-1).catalogHash, hash("8"));

  await putCandidateBlobs(hash("a"), hash("b"), hash("c"));
  await assert.rejects(
    restartedRepository.stageCandidate(candidate(4, hash("a"), hash("b"), hash("c"), 1, "rollback")),
    (error) => error?.code === "COMPONENT_REVISION_ROLLBACK"
  );
  await assert.rejects(
    restartedRepository.stageCandidate(candidate(4, hash("a"), hash("b"), hash("c"), 3, "equivocated-content")),
    (error) => error?.code === "COMPONENT_REVISION_EQUIVOCATION"
  );
  await assert.rejects(
    restartedRepository.stageCandidate(candidate(4, hash("a"), hash("b"), hash("9"), 3, "equivocated-pointer")),
    (error) => error?.code === "COMPONENT_POINTER_EQUIVOCATION"
  );

  await restartedRepository.patchSchedule({ installationJitterMs: 12_345, etag: "stale-reset-etag" });
  await restartedRepository.suppressIncompatible({
    sequence: 4,
    channelHash: hash("a"),
    rulesVersion: "rules-4",
    minExtensionVersion: "2027.1.1.1",
    catalogHash: hash("b"),
    reason: "extension-update-required"
  });

  await restartedRepository.setAutomaticChecksConsent(true, now);
  const beforeActivationAdvance = await restartedRepository.readState();
  const advanced = await restartedRepository.advanceActivationRevision({
    expectedStateRevision: beforeActivationAdvance.revision,
    expectedActivationRevision: beforeActivationAdvance.activationRevision,
    additionalValues: { localOfficialPolicy: { approved: true } }
  });
  assert.equal(advanced.activationRevision, beforeActivationAdvance.activationRevision + 1);
  assert.deepEqual(storage.values.localOfficialPolicy, { approved: true }, "local policy and activation watermark must commit in one storage write");
  const reset = await restartedRepository.resetForFullConfigReset(packaged, {
    resetConfigFixture: { revision: 8 }
  });
  assert.equal(reset.highestSeen.sequence, 4, "full config reset must retain the anti-rollback watermark");
  assert.equal(reset.highestSeen.channelHash, hash("a"));
  assert.deepEqual(
    { revision: reset.componentHighest[key].revision, sha256: reset.componentHighest[key].sha256 },
    { revision: 3, sha256: hash("9") },
    "full config reset must retain the per-component anti-rollback watermark"
  );
  assert.equal(reset.schedule.installationJitterMs, 12_345);
  assert.equal(reset.schedule.etag, "", "full reset must clear the cached channel ETag");
  assert.equal(reset.suppressed, null, "full reset must clear an obsolete extension-update suppression");
  assert.deepEqual(storage.values.resetConfigFixture, { revision: 8 }, "reset state and replacement config values must share one storage write");
  assert.equal(reset.active.source, "packaged");
  assert.equal(reset.candidate, null);
  assert.equal(reset.consent.automaticChecks, false);
  assert.deepEqual(reset.componentPins, {});
  assert.equal(
    Object.keys(storage.values).some((entry) => entry.startsWith(OFFICIAL_RULES_BLOB_PREFIX)),
    true,
    "the atomic reset commit must leave blob cleanup to the post-commit runtime cleanup phase"
  );

  console.log("Official rules content-addressed state, apply journal, rollback, recovery, and reset tests passed.");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
