import {
  OFFICIAL_RULES_COMPONENT_KEYS,
  officialRulesComponentKey
} from "../shared/official-rules-baseline.js";
import { OFFICIAL_RULES_PACKAGED_COMPONENTS } from "../shared/official-rules-packaged.js";
import {
  OFFICIAL_RULES_API_VERSION,
  OFFICIAL_RULES_CHANNEL_SIGNATURE_URL,
  OFFICIAL_RULES_CHANNEL_URL,
  OFFICIAL_RULES_LIMITS,
  inspectOfficialRulesReleaseUrl
} from "../shared/official-rules-contract.js";
import {
  OFFICIAL_RULES_PINNED_KEYS,
  OfficialRulesError,
  fetchVerifiedOfficialRulesDocument,
  verifyOfficialRulesDocument
} from "./official-rules-channel.js";

export const OFFICIAL_RULES_ALARM_NAME = "chatclub-official-rules-check";
const OFFICIAL_RULES_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const OFFICIAL_RULES_CHECK_MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;
const OFFICIAL_RULES_PAGES_HOST = "0-v-linuxdo.github.io";

function fail(code, message, details = {}) {
  throw new OfficialRulesError(code, message, details);
}

function normalizedError(error) {
  return String(error?.message || error || "Unknown official-rules error").slice(0, 1000);
}

function channelAssetUrl(value, label) {
  let parsed;
  try { parsed = new URL(value); }
  catch { fail("INVALID_CHANNEL_URL", `${label} is invalid`); }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== OFFICIAL_RULES_PAGES_HOST
    || parsed.port
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) fail("INVALID_CHANNEL_URL", `${label} must be a canonical ChatClub-rules GitHub Pages URL`);
  return parsed.href;
}

export function createOfficialRulesFetchUrlPolicy(options = {}) {
  const channelUrl = channelAssetUrl(options.channelUrl || OFFICIAL_RULES_CHANNEL_URL, "Official-rules channel URL");
  const channelSignatureUrl = channelAssetUrl(options.channelSignatureUrl || OFFICIAL_RULES_CHANNEL_SIGNATURE_URL, "Official-rules channel signature URL");
  const expectedSignatureUrl = channelUrl.replace(/\/channel\.json$/, "/channel.sig.json");
  if (channelSignatureUrl !== expectedSignatureUrl) {
    fail("INVALID_CHANNEL_URL", "Official-rules channel signature URL must be the channel.sig.json sibling");
  }
  return Object.freeze({
    channelUrl,
    channelSignatureUrl,
    allowUrl(url, role = "") {
      if (role === "channel-payload") return url === channelUrl;
      if (role === "channel-signature") return url === channelSignatureUrl;
      const inspected = inspectOfficialRulesReleaseUrl(url);
      if (!inspected.valid) return false;
      return role.endsWith("-signature")
        ? inspected.value.asset.endsWith(".sig.json")
        : inspected.value.asset.endsWith(".json") && !inspected.value.asset.endsWith(".sig.json");
    },
    allowFinalUrl(url, role = "", requestedUrl = "") {
      if (role.startsWith("channel-")) return url === requestedUrl && (url === channelUrl || url === channelSignatureUrl);
      if (url === requestedUrl) return inspectOfficialRulesReleaseUrl(url).valid;
      try {
        const parsed = new URL(url);
        return parsed.protocol === "https:"
          && parsed.hostname === "release-assets.githubusercontent.com"
          && !parsed.port
          && !parsed.username
          && !parsed.password
          && !parsed.hash;
      } catch {
        return false;
      }
    }
  });
}

export function createOfficialRulesTransitionCoordinator() {
  let tail = Promise.resolve();
  return Object.freeze({
    run(task) {
      if (typeof task !== "function") return Promise.reject(new TypeError("Official-rules transition task must be a function"));
      const queued = tail.catch(() => {}).then(task);
      tail = queued.then(() => undefined, () => undefined);
      return queued;
    }
  });
}

function nextOfficialRulesCheckAt(now, options = {}) {
  const failures = Math.max(0, Math.min(16, Number(options.failureCount) || 0));
  const installationJitterMs = Math.max(0, Math.min(60 * 60 * 1000, Number(options.installationJitterMs) || 0));
  const failureDelays = [0, 60 * 60 * 1000, 3 * 60 * 60 * 1000, 12 * 60 * 60 * 1000];
  const delay = failures === 0
    ? OFFICIAL_RULES_CHECK_INTERVAL_MS + installationJitterMs
    : failureDelays[failures] || OFFICIAL_RULES_CHECK_MAX_BACKOFF_MS;
  return Math.floor(Number(now) + delay);
}

function samePointer(left, right) {
  if (!left || !right) return false;
  return ["feature", "siteId", "revision", "url", "signatureUrl", "size", "sha256", "keyId"]
    .every((key) => left[key] === right[key]);
}

function pointerMap(catalog) {
  return Object.fromEntries(catalog.components.map((pointer) => [
    officialRulesComponentKey(pointer.feature, pointer.siteId),
    { ...pointer }
  ]));
}

function assertMetadataMatches(channel, catalog) {
  for (const key of ["channel", "sequence", "rulesVersion", "rulesApiVersion", "minExtensionVersion", "publishedAt"]) {
    if (channel[key] !== catalog[key]) fail("CATALOG_METADATA_MISMATCH", `Channel and catalog disagree on ${key}`);
  }
}

async function cachedDocument(repository, options, hash, kind, expected = {}) {
  const blob = await repository.getBlob(hash);
  if (!blob) return null;
  if (blob.kind !== kind) fail("BLOB_KIND_MISMATCH", `Expected ${kind} blob ${hash}, received ${blob.kind}`);
  return verifyOfficialRulesDocument({
    kind,
    rawText: blob.rawText,
    signatureText: blob.signatureText,
    keyring: options.keyring,
    crypto: options.crypto,
    expectedHash: hash,
    expectedKeyId: expected.keyId,
    expectedSize: expected.size,
    requireCompleteBaseline: options.requireCompleteBaseline
  });
}

async function cacheDocument(repository, document, clock) {
  await repository.putBlob({
    hash: document.rawHash,
    kind: document.kind,
    rawText: document.rawText,
    signatureText: document.signatureText,
    keyId: document.keyId,
    verifiedAt: clock()
  });
  return document;
}

export function createOfficialRulesUpdater(options = {}) {
  const repository = options.repository;
  if (!repository?.readState || !repository?.putBlob || !repository?.stageCandidate
    || !repository?.observeSignedChannel || !repository?.observeSignedCatalog) {
    throw new TypeError("Official-rules updater requires an official-rules repository");
  }
  const urls = createOfficialRulesFetchUrlPolicy(options);
  const channelName = String(options.channel || "stable").trim();
  const keyring = options.keyring || OFFICIAL_RULES_PINNED_KEYS;
  const cryptoApi = options.crypto || globalThis.crypto;
  const fetchFn = options.fetch || globalThis.fetch;
  const clock = typeof options.now === "function" ? options.now : Date.now;
  const isCompatible = typeof options.isCompatible === "function" ? options.isCompatible : () => true;
  let inFlightCheck = null;

  async function fetchReference(reference, kind, verifyOptions = {}) {
    const cached = await cachedDocument(
      repository,
      { keyring, crypto: cryptoApi, ...verifyOptions },
      reference.sha256,
      kind,
      reference
    );
    if (cached) return { document: cached, downloaded: false };
    const fetched = await fetchVerifiedOfficialRulesDocument({
      kind,
      url: reference.url,
      signatureUrl: reference.signatureUrl,
      expectedHash: reference.sha256,
      expectedSize: reference.size,
      expectedKeyId: reference.keyId,
      keyring,
      crypto: cryptoApi,
      fetch: fetchFn,
      allowUrl: urls.allowUrl,
      allowFinalUrl: urls.allowFinalUrl,
      timeoutMs: options.assetTimeoutMs || options.timeoutMs || 20_000,
      ...verifyOptions
    });
    if (fetched.notModified || !fetched.document) fail("UNEXPECTED_NOT_MODIFIED", `Missing uncached ${kind} response`);
    return { document: await cacheDocument(repository, fetched.document, clock), downloaded: true };
  }

  async function performCheck(checkOptions = {}) {
    const before = await repository.readState();
    const channelFetch = await fetchVerifiedOfficialRulesDocument({
      kind: "channel",
      url: urls.channelUrl,
      signatureUrl: urls.channelSignatureUrl,
      keyring,
      crypto: cryptoApi,
      fetch: fetchFn,
      allowUrl: urls.allowUrl,
      allowFinalUrl: urls.allowFinalUrl,
      ...(options.channelKeyId ? { expectedKeyId: options.channelKeyId } : {}),
      ifNoneMatch: checkOptions.force === true || before.suppressed ? "" : before.schedule.etag,
      timeoutMs: options.channelTimeoutMs || options.timeoutMs || 10_000,
      signal: checkOptions.signal
    });
    if (channelFetch.notModified) {
      if (channelFetch.etag && channelFetch.etag !== before.schedule.etag) await repository.patchSchedule({ etag: channelFetch.etag });
      return Object.freeze({ status: "not-modified", changedComponents: Object.freeze([]), downloadedComponents: Object.freeze([]) });
    }
    const channelDocument = await cacheDocument(repository, channelFetch.document, clock);
    const channel = channelDocument.value;
    if (channel.channel !== channelName) fail("CHANNEL_MISMATCH", `Expected channel ${channelName}, received ${channel.channel}`);
    if (channel.sequence < before.highestSeen.sequence) fail("STALE_SEQUENCE", `Official-rules sequence ${channel.sequence} is older than ${before.highestSeen.sequence}`);
    if (channel.sequence === before.highestSeen.sequence && before.highestSeen.channelHash && channelDocument.rawHash !== before.highestSeen.channelHash) {
      fail("SEQUENCE_EQUIVOCATION", `Official-rules sequence ${channel.sequence} has different signed content`);
    }

    const requiresNewerRulesApi = channel.rulesApiVersion > OFFICIAL_RULES_API_VERSION;
    const extensionCompatible = requiresNewerRulesApi ? false : await isCompatible(channel) === true;
    if (!extensionCompatible) {
      const state = await repository.suppressIncompatible({
        sequence: channel.sequence,
        channelHash: channelDocument.rawHash,
        rulesVersion: channel.rulesVersion,
        minExtensionVersion: channel.minExtensionVersion,
        catalogHash: channel.catalog.sha256,
        reason: "extension-update-required"
      });
      if (channelFetch.etag) await repository.patchSchedule({ etag: channelFetch.etag });
      return Object.freeze({
        status: "suppressed",
        requiresExtensionUpdate: true,
        requiresNewerRulesApi,
        rulesApiVersion: channel.rulesApiVersion,
        supportedRulesApiVersion: OFFICIAL_RULES_API_VERSION,
        minExtensionVersion: channel.minExtensionVersion,
        state,
        changedComponents: Object.freeze([]),
        downloadedComponents: Object.freeze([])
      });
    }

    await repository.observeSignedChannel({
      sequence: channel.sequence,
      channelHash: channelDocument.rawHash
    });

    const catalogResult = await fetchReference(channel.catalog, "catalog", { requireCompleteBaseline: false });
    const catalog = catalogResult.document.value;
    assertMetadataMatches(channel, catalog);

    const activeTargets = before.active?.officialTargets || {};
    const targets = pointerMap(catalog);
    await repository.observeSignedCatalog({
      sequence: channel.sequence,
      channelHash: channelDocument.rawHash,
      officialTargets: targets
    });
    for (const key of OFFICIAL_RULES_COMPONENT_KEYS) {
      if (activeTargets[key]?.revision === targets[key]?.revision && !samePointer(activeTargets[key], targets[key])) {
        fail("COMPONENT_POINTER_EQUIVOCATION", `Official-rules component ${key} reused revision ${targets[key].revision} with a different pointer`);
      }
    }
    const changedComponents = OFFICIAL_RULES_COMPONENT_KEYS.filter((key) => !samePointer(activeTargets[key], targets[key]));
    const catalogRelease = inspectOfficialRulesReleaseUrl(channel.catalog.url);
    const releaseComponentBytes = Object.values(targets).reduce((total, pointer) => {
      const location = inspectOfficialRulesReleaseUrl(pointer?.url);
      return location.valid && catalogRelease.valid && location.value.tag === catalogRelease.value.tag
        ? total + Number(pointer.size || 0)
        : total;
    }, 0);
    if (releaseComponentBytes > OFFICIAL_RULES_LIMITS.releaseComponentBytes) {
      fail("RELEASE_COMPONENT_BYTES_EXCEEDED", `Official-rules release component assets total ${releaseComponentBytes} bytes, exceeding ${OFFICIAL_RULES_LIMITS.releaseComponentBytes}`);
    }
    const downloadedComponents = [];
    for (const key of OFFICIAL_RULES_COMPONENT_KEYS) {
      const pointer = targets[key];
      if (!pointer) fail("CATALOG_COMPONENT_MISSING", `Official-rules catalog is missing ${key}`);
      const unchanged = samePointer(activeTargets[key], pointer);
      if (unchanged) {
        if (!await repository.hasBlob(pointer.sha256)) {
          fail("UNCHANGED_COMPONENT_BLOB_MISSING", `Unchanged official-rules component ${key} is missing from the verified cache`);
        }
        continue;
      }
      const componentResult = await fetchReference(pointer, "component");
      const component = componentResult.document.value;
      if (
        component.feature !== pointer.feature
        || component.siteId !== pointer.siteId
        || component.revision !== pointer.revision
      ) fail("COMPONENT_POINTER_MISMATCH", `Official-rules component ${key} does not match its catalog pointer`);
      if (componentResult.downloaded) downloadedComponents.push(key);
    }

    const candidate = {
      source: "remote",
      sequence: channel.sequence,
      rulesVersion: channel.rulesVersion,
      keyId: channelDocument.keyId,
      channelHash: channelDocument.rawHash,
      catalogHash: catalogResult.document.rawHash,
      officialTargets: targets,
      createdAt: clock()
    };
    const state = await repository.stageCandidate(candidate);
    if (channelFetch.etag) await repository.patchSchedule({ etag: channelFetch.etag });
    return Object.freeze({
      status: state.active?.catalogHash === candidate.catalogHash ? "already-active" : "candidate",
      candidate: Object.freeze(candidate),
      changedComponents: Object.freeze(changedComponents),
      downloadedCatalog: catalogResult.downloaded,
      downloadedComponents: Object.freeze(downloadedComponents)
    });
  }

  function checkForUpdates(checkOptions = {}) {
    if (inFlightCheck) return inFlightCheck;
    inFlightCheck = performCheck(checkOptions).finally(() => { inFlightCheck = null; });
    return inFlightCheck;
  }

  async function materializeSnapshot(snapshot, materializeOptions = {}) {
    if (!snapshot) return null;
    if (snapshot.source === "packaged") {
      if (typeof materializeOptions.resolvePackaged !== "function") fail("PACKAGED_RESOLVER_REQUIRED", "A packaged official-rules resolver is required");
      return materializeOptions.resolvePackaged(snapshot);
    }
    const channelDocument = await cachedDocument(repository, { keyring, crypto: cryptoApi }, snapshot.channelHash, "channel");
    if (!channelDocument) fail("MISSING_BLOB", "Official-rules snapshot is missing its channel");
    const channel = channelDocument.value;
    if (channel.sequence !== snapshot.sequence || channel.rulesVersion !== snapshot.rulesVersion) fail("SNAPSHOT_METADATA_MISMATCH", "Official-rules snapshot disagrees with its channel");
    if (channel.catalog.sha256 !== snapshot.catalogHash) fail("SNAPSHOT_CATALOG_MISMATCH", "Official-rules snapshot catalog does not match its channel");
    const catalogDocument = await cachedDocument(
      repository,
      { keyring, crypto: cryptoApi, requireCompleteBaseline: false },
      snapshot.catalogHash,
      "catalog",
      channel.catalog
    );
    if (!catalogDocument) fail("MISSING_BLOB", "Official-rules snapshot is missing its catalog");
    const catalog = catalogDocument.value;
    assertMetadataMatches(channel, catalog);
    const catalogTargets = pointerMap(catalog);
    const components = {};
    for (const key of OFFICIAL_RULES_COMPONENT_KEYS) {
      const pointer = catalogTargets[key];
      const target = snapshot.officialTargets?.[key];
      if (!pointer) {
        const packaged = OFFICIAL_RULES_PACKAGED_COMPONENTS[key];
        if (!packaged) fail("PACKAGED_COMPONENT_MISSING", `Packaged official-rules component ${key} is unavailable`);
        components[key] = packaged;
        continue;
      }
      if (!samePointer(pointer, target)) fail("SNAPSHOT_COMPONENT_MISMATCH", `Official-rules snapshot target ${key} does not match the catalog`);
      const componentDocument = await cachedDocument(repository, { keyring, crypto: cryptoApi }, target.sha256, "component", target);
      if (!componentDocument) fail("MISSING_BLOB", `Official-rules snapshot is missing component ${key}`);
      const component = componentDocument.value;
      if (component.feature !== target.feature || component.siteId !== target.siteId || component.revision !== target.revision) {
        fail("COMPONENT_POINTER_MISMATCH", `Official-rules component ${key} does not match its pointer`);
      }
      components[key] = component;
    }
    return Object.freeze({ snapshot: Object.freeze({ ...snapshot }), channel, catalog, components: Object.freeze(components) });
  }

  return Object.freeze({ checkForUpdates, materializeSnapshot });
}

export function createOfficialRulesActivationController(options = {}) {
  const repository = options.repository;
  const materializeSnapshot = options.materializeSnapshot;
  const applySnapshot = options.applySnapshot;
  if (!repository?.beginCandidateApply || typeof materializeSnapshot !== "function" || typeof applySnapshot !== "function") {
    throw new TypeError("Official-rules activation controller requires repository, materializeSnapshot, and applySnapshot");
  }
  const coordinator = options.transitionCoordinator || createOfficialRulesTransitionCoordinator();
  if (typeof coordinator.run !== "function") throw new TypeError("Official-rules transition coordinator requires run(task)");

  async function applyCandidateInternal(applyOptions = {}) {
    const started = await repository.beginCandidateApply({
      expectedCatalogHash: applyOptions.expectedCatalogHash,
      expectedStateRevision: applyOptions.expectedStateRevision,
      reason: applyOptions.reason || "manual-apply",
      id: applyOptions.attemptId
    });
    const journal = started.journal;
    try {
      const target = await materializeSnapshot(journal.to, applyOptions);
      await applySnapshot(target, { phase: "apply", attemptId: journal.attemptId, from: journal.from, to: journal.to });
      const state = await repository.commitApply(journal.attemptId);
      await repository.pruneBlobs?.().catch(() => {});
      return Object.freeze({ applied: true, rolledBack: false, state });
    } catch (applyError) {
      try {
        await repository.markRollingBack(journal.attemptId, applyError);
      } catch (journalError) {
        fail("APPLY_RECOVERY_REQUIRED", "Official-rules apply failed and rollback could not be journaled", {
          applyError: normalizedError(applyError),
          journalError: normalizedError(journalError),
          attemptId: journal.attemptId
        });
      }
      try {
        const previous = await materializeSnapshot(journal.from, applyOptions);
        await applySnapshot(previous, { phase: "rollback", attemptId: journal.attemptId, from: journal.to, to: journal.from });
        const state = await repository.completeRollback(journal.attemptId, {
          quarantine: applyOptions.quarantine !== false,
          reason: normalizedError(applyError)
        });
        fail("APPLY_ROLLED_BACK", `Official-rules apply failed and was rolled back: ${normalizedError(applyError)}`, {
          attemptId: journal.attemptId,
          state
        });
      } catch (rollbackError) {
        if (rollbackError instanceof OfficialRulesError && rollbackError.code === "APPLY_ROLLED_BACK") throw rollbackError;
        await repository.markRecoveryRequired(journal.attemptId, rollbackError).catch(() => {});
        fail("ROLLBACK_FAILED", "Official-rules apply and rollback both failed", {
          applyError: normalizedError(applyError),
          rollbackError: normalizedError(rollbackError),
          attemptId: journal.attemptId
        });
      }
    }
  }

  async function recoverInternal(recoveryOptions = {}) {
    const state = await repository.readState();
    if (state.journal.phase === "idle") return Object.freeze({ recovered: false, state });
    const journal = state.journal;
    try {
      const active = await materializeSnapshot(state.active, recoveryOptions);
      await applySnapshot(active, { phase: "recovery", attemptId: journal.attemptId, from: journal.to, to: state.active });
      const recoveredState = await repository.completeRecovery(journal.attemptId, {
        quarantine: recoveryOptions.quarantine !== false,
        reason: "recovered-after-interrupted-activation"
      });
      return Object.freeze({ recovered: true, state: recoveredState });
    } catch (error) {
      await repository.markRecoveryRequired(journal.attemptId, error).catch(() => {});
      fail("RECOVERY_FAILED", `Official-rules startup recovery failed: ${normalizedError(error)}`, { attemptId: journal.attemptId });
    }
  }

  return Object.freeze({
    applyCandidate: (applyOptions) => coordinator.run(() => applyCandidateInternal(applyOptions)),
    recover: (recoveryOptions) => coordinator.run(() => recoverInternal(recoveryOptions))
  });
}

export function createOfficialRulesAlarmController(options = {}) {
  const repository = options.repository;
  const alarms = options.alarms;
  const checkForUpdates = options.checkForUpdates;
  if (!repository?.readState || !repository?.patchSchedule || typeof alarms?.create !== "function" || typeof alarms?.clear !== "function") {
    throw new TypeError("Official-rules alarm controller requires repository and alarms APIs");
  }
  if (typeof checkForUpdates !== "function") throw new TypeError("Official-rules alarm controller requires checkForUpdates");
  const alarmName = String(options.alarmName || OFFICIAL_RULES_ALARM_NAME);
  const clock = typeof options.now === "function" ? options.now : Date.now;
  const random = typeof options.random === "function" ? options.random : Math.random;

  function intervalOptions(state, failureCount = state.schedule.failureCount) {
    return { failureCount, installationJitterMs: Math.max(0, state.schedule.installationJitterMs) };
  }

  function retryAfterDelay(error, now) {
    if (Number(error?.details?.status) !== 429) return 0;
    const value = String(error?.details?.retryAfter || "").trim();
    if (!value) return 0;
    const seconds = Number(value);
    const parsed = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
    return Number.isFinite(parsed) ? Math.max(0, Math.min(OFFICIAL_RULES_CHECK_MAX_BACKOFF_MS, parsed)) : 0;
  }

  async function clearAlarm() {
    return Promise.resolve(alarms.clear(alarmName));
  }

  async function scheduleAt(when, failureCount) {
    const target = Math.max(clock() + 1000, Math.floor(Number(when)));
    await repository.patchSchedule({ nextCheckAt: target, failureCount });
    await Promise.resolve(alarms.create(alarmName, { when: target }));
    return target;
  }

  async function ensureScheduled() {
    const state = await repository.readState();
    if (!state.consent.automaticChecks) {
      await clearAlarm();
      return Object.freeze({ scheduled: false, reason: "consent-required" });
    }
    const target = state.schedule.nextCheckAt > clock()
      ? state.schedule.nextCheckAt
      : nextOfficialRulesCheckAt(clock(), intervalOptions(state, 0));
    await scheduleAt(target, state.schedule.failureCount);
    return Object.freeze({ scheduled: true, when: target });
  }

  async function setConsent(enabled, expectedRevision) {
    let state = await repository.setAutomaticChecksConsent(enabled === true, clock(), expectedRevision);
    if (!state.consent.automaticChecks) {
      await clearAlarm();
      return Object.freeze({ enabled: false, scheduled: false });
    }
    if (state.schedule.installationJitterMs < 0) {
      const sample = Math.max(0, Math.min(1, Number(random()) || 0));
      state = await repository.patchSchedule({ installationJitterMs: Math.floor(sample * 60 * 60 * 1000) });
    }
    return Object.freeze({ enabled: true, ...await ensureScheduled() });
  }

  async function handleAlarm(alarm = {}) {
    if (String(alarm.name || "") !== alarmName) return Object.freeze({ handled: false });
    const before = await repository.readState();
    if (!before.consent.automaticChecks) {
      await clearAlarm();
      return Object.freeze({ handled: true, checked: false, reason: "consent-required" });
    }
    const optimisticWhen = nextOfficialRulesCheckAt(clock(), intervalOptions(before, 0));
    await scheduleAt(optimisticWhen, before.schedule.failureCount);
    try {
      const result = await checkForUpdates({ source: "alarm" });
      const completedAt = clock();
      const next = nextOfficialRulesCheckAt(completedAt, intervalOptions(before, 0));
      await repository.patchSchedule({ failureCount: 0, lastCheckAt: completedAt, lastSuccessAt: completedAt, lastError: "", nextCheckAt: next });
      await Promise.resolve(alarms.create(alarmName, { when: next }));
      return Object.freeze({ handled: true, checked: true, ok: true, result, nextCheckAt: next });
    } catch (error) {
      const completedAt = clock();
      const failures = Math.min(16, before.schedule.failureCount + 1);
      const scheduledDelay = nextOfficialRulesCheckAt(completedAt, intervalOptions(before, failures)) - completedAt;
      const next = completedAt + Math.max(scheduledDelay, retryAfterDelay(error, completedAt));
      await repository.patchSchedule({ failureCount: failures, lastCheckAt: completedAt, lastError: normalizedError(error), nextCheckAt: next });
      await Promise.resolve(alarms.create(alarmName, { when: next }));
      return Object.freeze({ handled: true, checked: true, ok: false, error, nextCheckAt: next });
    }
  }

  return Object.freeze({ ensureScheduled, setConsent, handleAlarm, clear: clearAlarm });
}
