import { officialRulesComponentKey } from "../shared/official-rules-baseline.js";
import { OfficialRulesError } from "./official-rules-channel.js";

const OFFICIAL_RULES_STATE_VERSION = 1;
const OFFICIAL_RULES_BLOB_VERSION = 1;
export const OFFICIAL_RULES_STATE_KEY = "chatclubOfficialRulesStateV1";
export const OFFICIAL_RULES_BLOB_PREFIX = "chatclubOfficialRulesBlobV1:";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const JOURNAL_PHASES = new Set(["idle", "applying", "rolling-back", "recovery-required"]);
const SCHEDULE_FIELDS = new Set(["nextCheckAt", "failureCount", "lastCheckAt", "lastSuccessAt", "etag", "lastError", "installationJitterMs"]);

function fail(code, message, details = {}) {
  throw new OfficialRulesError(code, message, details);
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (value === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { fail("INVALID_STATE", "Official-rules state must be JSON serializable"); }
}

function finiteTime(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) fail("INVALID_STATE", `${label} must be a positive integer`);
  return number;
}

function normalizedHash(value, label, optional = false) {
  const hash = String(value || "").trim().toLowerCase();
  if (optional && !hash) return "";
  if (!HASH_PATTERN.test(hash)) fail("INVALID_STATE", `${label} must be a SHA-256 hex digest`);
  return hash;
}

function normalizedText(value, label, options = {}) {
  const text = String(value || "").trim();
  if (!text && options.optional) return "";
  if (!text || text.length > (options.maximum || 2048)) fail("INVALID_STATE", `${label} is invalid`);
  return text;
}

function normalizedTarget(value, label, source) {
  if (!plainObject(value)) fail("INVALID_STATE", `${label} must be an object`);
  const feature = normalizedText(value.feature, `${label}.feature`, { maximum: 32 });
  const siteId = normalizedText(value.siteId, `${label}.siteId`, { maximum: 64 });
  const key = officialRulesComponentKey(feature, siteId);
  if (!key) fail("INVALID_STATE", `${label} has no component identity`);
  const revision = source === "remote"
    ? positiveInteger(value.revision, `${label}.revision`)
    : nonNegativeInteger(value.revision);
  if (source === "packaged") {
    return { feature, siteId, revision, sha256: "", size: 0, keyId: "", url: "", signatureUrl: "" };
  }
  return {
    feature,
    siteId,
    revision,
    sha256: normalizedHash(value.sha256, `${label}.sha256`),
    size: positiveInteger(value.size, `${label}.size`),
    keyId: normalizedText(value.keyId, `${label}.keyId`, { maximum: 64 }),
    url: normalizedText(value.url, `${label}.url`),
    signatureUrl: normalizedText(value.signatureUrl, `${label}.signatureUrl`)
  };
}

function normalizedTargets(value, source) {
  if (!plainObject(value)) fail("INVALID_STATE", "snapshot.officialTargets must be an object");
  const targets = {};
  for (const [storedKey, raw] of Object.entries(value)) {
    const target = normalizedTarget(raw, `snapshot.officialTargets.${storedKey}`, source);
    const key = officialRulesComponentKey(target.feature, target.siteId);
    if (storedKey !== key) fail("INVALID_STATE", `Official-rules target key ${storedKey} does not match ${key}`);
    targets[key] = target;
  }
  return targets;
}

function normalizeOfficialRulesSnapshot(value, options = {}) {
  if (value === null || value === undefined) return null;
  if (!plainObject(value)) fail("INVALID_STATE", "Official-rules snapshot must be an object");
  const source = value.source === "packaged" ? "packaged" : value.source === "remote" ? "remote" : "";
  if (!source) fail("INVALID_STATE", "Official-rules snapshot source is invalid");
  return {
    source,
    sequence: source === "remote" ? positiveInteger(value.sequence, "snapshot.sequence") : nonNegativeInteger(value.sequence),
    rulesVersion: normalizedText(value.rulesVersion, "snapshot.rulesVersion", { optional: source === "packaged", maximum: 64 }),
    keyId: normalizedText(value.keyId, "snapshot.keyId", { optional: source === "packaged", maximum: 64 }),
    channelHash: source === "remote" ? normalizedHash(value.channelHash, "snapshot.channelHash") : "",
    catalogHash: source === "remote"
      ? normalizedHash(value.catalogHash, "snapshot.catalogHash")
      : normalizedHash(value.catalogHash, "snapshot.catalogHash", options.allowEmptyPackagedHash !== false),
    officialTargets: normalizedTargets(value.officialTargets || {}, source),
    createdAt: finiteTime(value.createdAt)
  };
}

function normalizeCandidate(value) {
  const snapshot = normalizeOfficialRulesSnapshot(value);
  if (!snapshot || snapshot.source !== "remote") fail("INVALID_CANDIDATE", "Official-rules candidate must be a remote snapshot");
  return snapshot;
}

function idleJournal() {
  return { phase: "idle" };
}

function normalizeJournal(value) {
  if (!plainObject(value) || !JOURNAL_PHASES.has(value.phase) || value.phase === "idle") return idleJournal();
  const attemptId = String(value.attemptId || "").trim();
  if (!attemptId) return idleJournal();
  return {
    phase: value.phase,
    attemptId,
    reason: String(value.reason || "apply"),
    operation: value.operation === "component-pins"
      ? "component-pins"
      : value.operation === "configuration"
        ? "configuration"
        : "snapshot",
    startedAt: finiteTime(value.startedAt),
    updatedAt: finiteTime(value.updatedAt),
    activationRevisionAtStart: nonNegativeInteger(value.activationRevisionAtStart),
    changedKeys: [...new Set((Array.isArray(value.changedKeys) ? value.changedKeys : [])
      .map((key) => String(key || "").trim()).filter(Boolean))],
    from: normalizeOfficialRulesSnapshot(value.from, { allowEmptyPackagedHash: true }),
    to: normalizeOfficialRulesSnapshot(value.to, { allowEmptyPackagedHash: true }),
    fromPins: normalizedPins(value.fromPins),
    toPins: normalizedPins(value.toPins),
    error: String(value.error || "").slice(0, 1000),
    rollbackError: String(value.rollbackError || "").slice(0, 1000)
  };
}

function normalizeSchedule(value) {
  const source = plainObject(value) ? value : {};
  const jitter = Number(source.installationJitterMs);
  return {
    nextCheckAt: finiteTime(source.nextCheckAt),
    failureCount: Math.min(32, nonNegativeInteger(source.failureCount)),
    lastCheckAt: finiteTime(source.lastCheckAt),
    lastSuccessAt: finiteTime(source.lastSuccessAt),
    etag: String(source.etag || "").slice(0, 512),
    lastError: String(source.lastError || "").slice(0, 1000),
    installationJitterMs: Number.isSafeInteger(jitter) && jitter >= 0 && jitter <= 60 * 60 * 1000 ? jitter : -1
  };
}

function normalizeQuarantine(value) {
  return (Array.isArray(value) ? value : []).map((entry) => {
    if (!plainObject(entry)) return null;
    try {
      return {
        catalogHash: normalizedHash(entry.catalogHash, "quarantine.catalogHash"),
        sequence: positiveInteger(entry.sequence, "quarantine.sequence"),
        reason: String(entry.reason || "apply-failed").slice(0, 500),
        at: finiteTime(entry.at)
      };
    } catch {
      return null;
    }
  }).filter(Boolean).slice(-16);
}

function normalizedPins(value) {
  if (!plainObject(value)) return {};
  const result = {};
  for (const [key, target] of Object.entries(value)) {
    try {
      const normalized = normalizedTarget(target, `componentPins.${key}`, target?.sha256 ? "remote" : "packaged");
      if (officialRulesComponentKey(normalized.feature, normalized.siteId) === key) result[key] = normalized;
    } catch {}
  }
  return result;
}

function normalizedComponentHighest(value) {
  if (!plainObject(value)) return {};
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!plainObject(entry)) continue;
    const revision = nonNegativeInteger(entry.revision, -1);
    if (revision < 1) continue;
    try {
      const sha256 = normalizedHash(entry.sha256, `componentHighest.${key}.sha256`);
      let pointer = null;
      if (plainObject(entry.pointer)) {
        const normalized = normalizedTarget(entry.pointer, `componentHighest.${key}.pointer`, "remote");
        if (officialRulesComponentKey(normalized.feature, normalized.siteId) !== key
          || normalized.revision !== revision
          || normalized.sha256 !== sha256) continue;
        pointer = normalized;
      }
      result[key] = { revision, sha256, ...(pointer ? { pointer } : {}) };
    } catch {}
  }
  return result;
}

function assertObservedChannel(state, sequence, channelHash) {
  if (sequence < state.highestSeen.sequence) {
    fail("STALE_SEQUENCE", `Official-rules sequence ${sequence} is older than ${state.highestSeen.sequence}`);
  }
  if (sequence === state.highestSeen.sequence
    && state.highestSeen.channelHash
    && channelHash !== state.highestSeen.channelHash) {
    fail("SEQUENCE_EQUIVOCATION", `Official-rules sequence ${sequence} was signed with different content`);
  }
}

function observedComponentHighest(state, targets) {
  const next = { ...state.componentHighest };
  for (const [key, target] of Object.entries(targets)) {
    for (const known of [state.active?.officialTargets?.[key], state.candidate?.officialTargets?.[key]]) {
      if (known?.revision === target.revision && JSON.stringify(known) !== JSON.stringify(target)) {
        fail("COMPONENT_POINTER_EQUIVOCATION", `Official-rules component ${key} reused revision ${target.revision} with a different pointer`);
      }
    }
    const highest = next[key];
    if (highest && target.revision < highest.revision) {
      fail("COMPONENT_REVISION_ROLLBACK", `Official-rules component ${key} revision ${target.revision} is older than ${highest.revision}`);
    }
    if (highest && target.revision === highest.revision && target.sha256 !== highest.sha256) {
      fail("COMPONENT_REVISION_EQUIVOCATION", `Official-rules component ${key} revision ${target.revision} has different signed content`);
    }
    if (highest?.pointer && target.revision === highest.revision
      && JSON.stringify(target) !== JSON.stringify(highest.pointer)) {
      fail("COMPONENT_POINTER_EQUIVOCATION", `Official-rules component ${key} reused revision ${target.revision} with a different pointer`);
    }
    next[key] = { revision: target.revision, sha256: target.sha256, pointer: target };
  }
  return next;
}

function normalizedSuppressed(value) {
  if (!plainObject(value)) return null;
  try {
    return {
      sequence: positiveInteger(value.sequence, "suppressed.sequence"),
      rulesVersion: normalizedText(value.rulesVersion, "suppressed.rulesVersion", { maximum: 64 }),
      minExtensionVersion: normalizedText(value.minExtensionVersion, "suppressed.minExtensionVersion", { maximum: 32 }),
      catalogHash: normalizedHash(value.catalogHash, "suppressed.catalogHash"),
      reason: normalizedText(value.reason, "suppressed.reason", { maximum: 500 })
    };
  } catch {
    return null;
  }
}

function normalizeOfficialRulesState(value) {
  const source = plainObject(value) && Number(value.version) === OFFICIAL_RULES_STATE_VERSION ? value : {};
  const highestSource = plainObject(source.highestSeen) ? source.highestSeen : {};
  const highestSequence = nonNegativeInteger(highestSource.sequence);
  let highestChannelHash = "";
  if (highestSequence > 0) {
    try { highestChannelHash = normalizedHash(highestSource.channelHash, "highestSeen.channelHash"); }
    catch { highestChannelHash = ""; }
  }
  return {
    version: OFFICIAL_RULES_STATE_VERSION,
    revision: nonNegativeInteger(source.revision),
    activationRevision: nonNegativeInteger(source.activationRevision),
    lastAppliedAt: finiteTime(source.lastAppliedAt),
    consent: {
      automaticChecks: source.consent?.automaticChecks === true,
      decidedAt: finiteTime(source.consent?.decidedAt)
    },
    schedule: normalizeSchedule(source.schedule),
    highestSeen: { sequence: highestChannelHash ? highestSequence : 0, channelHash: highestChannelHash },
    componentHighest: normalizedComponentHighest(source.componentHighest),
    suppressed: normalizedSuppressed(source.suppressed),
    packaged: normalizeOfficialRulesSnapshot(source.packaged, { allowEmptyPackagedHash: true }),
    active: normalizeOfficialRulesSnapshot(source.active, { allowEmptyPackagedHash: true }),
    previous: normalizeOfficialRulesSnapshot(source.previous, { allowEmptyPackagedHash: true }),
    candidate: source.candidate ? normalizeCandidate(source.candidate) : null,
    componentPins: normalizedPins(source.componentPins),
    previousByComponent: normalizedPins(source.previousByComponent),
    lastAppliedChangedKeys: [...new Set((Array.isArray(source.lastAppliedChangedKeys) ? source.lastAppliedChangedKeys : [])
      .map((key) => String(key || "").trim()).filter(Boolean))],
    journal: normalizeJournal(source.journal),
    quarantine: normalizeQuarantine(source.quarantine)
  };
}

function blobKey(hash) {
  return `${OFFICIAL_RULES_BLOB_PREFIX}${normalizedHash(hash, "blob hash")}`;
}

function normalizedBlob(value, expectedHash = "") {
  if (!plainObject(value) || Number(value.version) !== OFFICIAL_RULES_BLOB_VERSION) return null;
  const hash = normalizedHash(value.hash, "blob.hash");
  if (expectedHash && hash !== normalizedHash(expectedHash, "expected blob hash")) fail("BLOB_HASH_MISMATCH", "Official-rules blob key and record disagree");
  const kind = ["channel", "catalog", "component"].includes(value.kind) ? value.kind : "";
  const rawText = typeof value.rawText === "string" ? value.rawText : "";
  const signatureText = typeof value.signatureText === "string" ? value.signatureText : "";
  const keyId = String(value.keyId || "").trim();
  if (!kind || !rawText || !signatureText || !keyId) fail("INVALID_BLOB", "Official-rules blob is invalid");
  return { version: OFFICIAL_RULES_BLOB_VERSION, hash, kind, rawText, signatureText, keyId, verifiedAt: finiteTime(value.verifiedAt) };
}

function attemptError(value) {
  return String(value?.message || value || "").slice(0, 1000);
}

function defaultAttemptId(clock) {
  const random = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(2))
    : [Math.random() * 0xffffffff, Math.random() * 0xffffffff];
  return `official-rules-${Math.floor(clock()).toString(36)}-${Array.from(random, (value) => Math.floor(value).toString(36)).join("")}`;
}

function referencedHashes(state) {
  const hashes = new Set();
  const add = (snapshot) => {
    if (!snapshot) return;
    for (const hash of [snapshot.channelHash, snapshot.catalogHash, ...Object.values(snapshot.officialTargets || {}).map((target) => target.sha256)]) {
      if (HASH_PATTERN.test(hash)) hashes.add(hash);
    }
  };
  for (const snapshot of [state.packaged, state.active, state.previous, state.candidate, state.journal?.from, state.journal?.to]) add(snapshot);
  if (HASH_PATTERN.test(state.highestSeen?.channelHash)) hashes.add(state.highestSeen.channelHash);
  if (HASH_PATTERN.test(state.suppressed?.catalogHash)) hashes.add(state.suppressed.catalogHash);
  for (const target of Object.values(state.componentPins || {})) if (HASH_PATTERN.test(target.sha256)) hashes.add(target.sha256);
  for (const target of Object.values(state.previousByComponent || {})) if (HASH_PATTERN.test(target.sha256)) hashes.add(target.sha256);
  return hashes;
}

export function createOfficialRulesRepository(options = {}) {
  const storage = options.storage;
  if (typeof storage?.get !== "function" || typeof storage?.set !== "function" || typeof storage?.remove !== "function") {
    throw new TypeError("Official-rules repository requires storage.local-compatible get/set/remove methods");
  }
  const clock = typeof options.now === "function" ? options.now : Date.now;
  const createAttemptId = typeof options.createAttemptId === "function" ? options.createAttemptId : () => defaultAttemptId(clock);
  let writeTail = Promise.resolve();

  async function readState() {
    const stored = await storage.get(OFFICIAL_RULES_STATE_KEY);
    return normalizeOfficialRulesState(stored?.[OFFICIAL_RULES_STATE_KEY]);
  }

  async function writeState(state, additionalValues = {}) {
    const normalized = normalizeOfficialRulesState(state);
    const extras = plainObject(additionalValues) ? clone(additionalValues) : {};
    delete extras[OFFICIAL_RULES_STATE_KEY];
    await storage.set({ ...extras, [OFFICIAL_RULES_STATE_KEY]: normalized });
    return clone(normalized);
  }

  function mutate(mutator, additionalValues = {}) {
    const operation = async () => {
      const current = await readState();
      const next = await mutator(clone(current));
      if (next === null) return clone(current);
      next.version = OFFICIAL_RULES_STATE_VERSION;
      next.revision = current.revision + 1;
      return writeState(next, additionalValues);
    };
    const queued = writeTail.catch(() => {}).then(operation);
    writeTail = queued.then(() => undefined, () => undefined);
    return queued;
  }

  async function putBlob(blob) {
    const normalized = normalizedBlob({
      version: OFFICIAL_RULES_BLOB_VERSION,
      hash: blob?.hash,
      kind: blob?.kind,
      rawText: blob?.rawText,
      signatureText: blob?.signatureText,
      keyId: blob?.keyId,
      verifiedAt: blob?.verifiedAt ?? clock()
    });
    const key = blobKey(normalized.hash);
    const stored = await storage.get(key);
    if (stored?.[key]) {
      const existing = normalizedBlob(stored[key], normalized.hash);
      if (existing.kind !== normalized.kind || existing.rawText !== normalized.rawText || existing.signatureText !== normalized.signatureText) {
        fail("CONTENT_ADDRESS_COLLISION", `Official-rules blob ${normalized.hash} already contains different content`);
      }
      return clone(existing);
    }
    await storage.set({ [key]: normalized });
    const confirmed = await storage.get(key);
    const saved = normalizedBlob(confirmed?.[key], normalized.hash);
    if (!saved || saved.rawText !== normalized.rawText || saved.signatureText !== normalized.signatureText) {
      fail("BLOB_WRITE_FAILED", `Official-rules blob ${normalized.hash} could not be verified after writing`);
    }
    return clone(saved);
  }

  async function getBlob(hash) {
    const normalized = normalizedHash(hash, "blob hash");
    const key = blobKey(normalized);
    const stored = await storage.get(key);
    return stored?.[key] ? clone(normalizedBlob(stored[key], normalized)) : null;
  }

  async function hasBlob(hash) {
    return Boolean(await getBlob(hash));
  }

  async function initializePackaged(snapshot) {
    const packaged = normalizeOfficialRulesSnapshot({ ...snapshot, source: "packaged" }, { allowEmptyPackagedHash: true });
    return mutate((state) => {
      if (JSON.stringify(state.packaged) === JSON.stringify(packaged) && state.active) return null;
      state.packaged = packaged;
      if (!state.active) state.active = packaged;
      return state;
    });
  }

  async function setAutomaticChecksConsent(enabled, decidedAt = clock(), expectedRevision) {
    return mutate((state) => {
      if (expectedRevision !== undefined && state.revision !== expectedRevision) {
        fail("OFFICIAL_RULES_STATE_CONFLICT", `Expected official-rules revision ${expectedRevision}, received ${state.revision}`);
      }
      state.consent = { automaticChecks: enabled === true, decidedAt: finiteTime(decidedAt, clock()) };
      if (!state.consent.automaticChecks) state.schedule.nextCheckAt = 0;
      return state;
    });
  }

  async function patchSchedule(patch = {}) {
    const unknown = Object.keys(patch).filter((key) => !SCHEDULE_FIELDS.has(key));
    if (unknown.length) fail("INVALID_SCHEDULE_PATCH", `Unknown official-rules schedule fields: ${unknown.join(", ")}`);
    return mutate((state) => {
      state.schedule = normalizeSchedule({ ...state.schedule, ...patch });
      return state;
    });
  }

  async function observeSignedChannel({ sequence, channelHash } = {}) {
    const normalizedSequence = positiveInteger(sequence, "observed.sequence");
    const normalizedChannelHash = normalizedHash(channelHash, "observed.channelHash");
    return mutate((state) => {
      assertObservedChannel(state, normalizedSequence, normalizedChannelHash);
      const candidateIsStale = Boolean(state.candidate && state.candidate.sequence < normalizedSequence);
      const suppressionIsSatisfied = Boolean(state.suppressed && state.suppressed.sequence <= normalizedSequence);
      const watermarkChanged = state.highestSeen.sequence !== normalizedSequence
        || state.highestSeen.channelHash !== normalizedChannelHash;
      if (!watermarkChanged && !candidateIsStale && !suppressionIsSatisfied) return null;
      state.highestSeen = { sequence: normalizedSequence, channelHash: normalizedChannelHash };
      if (candidateIsStale) state.candidate = null;
      if (suppressionIsSatisfied) state.suppressed = null;
      return state;
    });
  }

  async function observeSignedCatalog({ sequence, channelHash, officialTargets } = {}) {
    const normalizedSequence = positiveInteger(sequence, "observed.sequence");
    const normalizedChannelHash = normalizedHash(channelHash, "observed.channelHash");
    const targets = normalizedTargets(officialTargets, "remote");
    return mutate((state) => {
      assertObservedChannel(state, normalizedSequence, normalizedChannelHash);
      const nextHighest = observedComponentHighest(state, targets);
      const watermarkChanged = state.highestSeen.sequence !== normalizedSequence
        || state.highestSeen.channelHash !== normalizedChannelHash
        || JSON.stringify(nextHighest) !== JSON.stringify(state.componentHighest);
      if (!watermarkChanged) return null;
      state.highestSeen = { sequence: normalizedSequence, channelHash: normalizedChannelHash };
      state.componentHighest = nextHighest;
      return state;
    });
  }

  async function stageCandidate(candidate) {
    const normalized = normalizeCandidate(candidate);
    const hashes = [normalized.channelHash, normalized.catalogHash, ...Object.values(normalized.officialTargets).map((target) => target.sha256)];
    for (const hash of hashes) if (!await hasBlob(hash)) fail("MISSING_BLOB", `Official-rules candidate references a missing blob: ${hash}`);
    return mutate((state) => {
      if (state.journal.phase !== "idle") fail("TRANSITION_IN_PROGRESS", "Official-rules candidate cannot change during an activation transaction");
      assertObservedChannel(state, normalized.sequence, normalized.channelHash);
      if (state.quarantine.some((entry) => entry.catalogHash === normalized.catalogHash)) {
        fail("CANDIDATE_QUARANTINED", `Official-rules catalog ${normalized.catalogHash} is quarantined`);
      }
      const nextComponentHighest = observedComponentHighest(state, normalized.officialTargets);
      state.highestSeen = { sequence: normalized.sequence, channelHash: normalized.channelHash };
      state.componentHighest = nextComponentHighest;
      if (!state.suppressed || normalized.sequence >= state.suppressed.sequence) state.suppressed = null;
      state.candidate = state.active?.catalogHash === normalized.catalogHash ? null : { ...normalized, createdAt: normalized.createdAt || clock() };
      return state;
    });
  }

  async function suppressIncompatible({ sequence, channelHash, rulesVersion, minExtensionVersion, catalogHash, reason = "extension-update-required" } = {}) {
    const normalizedSequence = positiveInteger(sequence, "suppressed.sequence");
    const normalizedChannelHash = normalizedHash(channelHash, "suppressed.channelHash");
    const suppressed = normalizedSuppressed({ sequence, rulesVersion, minExtensionVersion, catalogHash, reason });
    if (!suppressed) fail("INVALID_SUPPRESSED_RULES", "Suppressed official-rules metadata is invalid");
    return mutate((state) => {
      if (normalizedSequence < state.highestSeen.sequence) {
        fail("STALE_SEQUENCE", `Official-rules sequence ${normalizedSequence} is older than ${state.highestSeen.sequence}`);
      }
      if (normalizedSequence === state.highestSeen.sequence && state.highestSeen.channelHash && normalizedChannelHash !== state.highestSeen.channelHash) {
        fail("SEQUENCE_EQUIVOCATION", `Official-rules sequence ${normalizedSequence} was signed with different content`);
      }
      state.highestSeen = { sequence: normalizedSequence, channelHash: normalizedChannelHash };
      state.suppressed = suppressed;
      if (state.candidate && state.candidate.sequence < normalizedSequence) state.candidate = null;
      return state;
    });
  }

  async function clearCandidate(expectedCatalogHash = "") {
    return mutate((state) => {
      if (state.journal.phase !== "idle") fail("TRANSITION_IN_PROGRESS", "Official-rules candidate cannot be cleared during an activation transaction");
      if (expectedCatalogHash && state.candidate?.catalogHash !== normalizedHash(expectedCatalogHash, "expected candidate hash")) {
        fail("CANDIDATE_CHANGED", "Official-rules candidate changed before it could be cleared");
      }
      state.candidate = null;
      return state;
    });
  }

  async function beginCandidateApply({ expectedCatalogHash = "", expectedStateRevision, reason = "manual-apply", id = "" } = {}) {
    let journal;
    const state = await mutate((current) => {
      if (current.journal.phase !== "idle") fail("TRANSITION_IN_PROGRESS", "An official-rules activation transaction is already running");
      if (expectedStateRevision !== undefined && current.revision !== expectedStateRevision) {
        fail("OFFICIAL_RULES_STATE_CONFLICT", `Expected official-rules revision ${expectedStateRevision}, received ${current.revision}`);
      }
      if (!current.candidate) fail("NO_CANDIDATE", "There is no official-rules candidate to apply");
      if (expectedCatalogHash && current.candidate.catalogHash !== normalizedHash(expectedCatalogHash, "expected candidate hash")) {
        fail("CANDIDATE_CHANGED", "Official-rules candidate changed before apply");
      }
      const nextId = String(id || createAttemptId()).trim();
      if (!nextId) fail("INVALID_ATTEMPT", "Official-rules activation attempt id is empty");
      const changedKeys = [...new Set([
        ...Object.keys(current.active?.officialTargets || {}),
        ...Object.keys(current.candidate?.officialTargets || {})
      ])].filter((key) => JSON.stringify(current.active?.officialTargets?.[key] || null)
        !== JSON.stringify(current.candidate?.officialTargets?.[key] || null));
      journal = {
        phase: "applying",
        operation: "snapshot",
        attemptId: nextId,
        reason: String(reason || "manual-apply"),
        startedAt: clock(),
        updatedAt: clock(),
        activationRevisionAtStart: current.activationRevision,
        changedKeys,
        from: current.active,
        to: current.candidate,
        fromPins: current.componentPins,
        toPins: Object.fromEntries(Object.entries(current.componentPins).filter(([key]) => !changedKeys.includes(key))),
        error: "",
        rollbackError: ""
      };
      current.journal = journal;
      return current;
    });
    return { state, journal: clone(journal) };
  }

  async function beginComponentPinsApply({ pins = {}, expectedActivationRevision, expectedStateRevision, reason = "component-pins", id = "" } = {}) {
    const normalized = normalizedPins(pins);
    let journal;
    const state = await mutate((current) => {
      if (current.journal.phase !== "idle") fail("TRANSITION_IN_PROGRESS", "An official-rules activation transaction is already running");
      if (expectedStateRevision !== undefined && current.revision !== expectedStateRevision) {
        fail("OFFICIAL_RULES_STATE_CONFLICT", `Expected official-rules revision ${expectedStateRevision}, received ${current.revision}`);
      }
      if (!current.active) fail("ACTIVE_RULES_MISSING", "Official-rules active snapshot is unavailable");
      if (!Number.isSafeInteger(expectedActivationRevision) || current.activationRevision !== expectedActivationRevision) {
        fail("ACTIVATION_REVISION_CHANGED", `Expected activation revision ${expectedActivationRevision}, received ${current.activationRevision}`);
      }
      const nextId = String(id || createAttemptId()).trim();
      if (!nextId) fail("INVALID_ATTEMPT", "Official-rules activation attempt id is empty");
      const changedKeys = [...new Set([
        ...Object.keys(current.componentPins),
        ...Object.keys(normalized)
      ])].filter((key) => JSON.stringify(current.componentPins[key] || null) !== JSON.stringify(normalized[key] || null));
      if (!changedKeys.length) fail("COMPONENT_PINS_UNCHANGED", "Official-rules component pins did not change");
      journal = {
        phase: "applying",
        operation: "component-pins",
        attemptId: nextId,
        reason: String(reason || "component-pins"),
        startedAt: clock(),
        updatedAt: clock(),
        activationRevisionAtStart: current.activationRevision,
        changedKeys,
        from: current.active,
        to: current.active,
        fromPins: current.componentPins,
        toPins: normalized,
        error: "",
        rollbackError: ""
      };
      current.journal = journal;
      return current;
    });
    return { state, journal: clone(journal) };
  }

  async function beginConfigurationApply({ expectedActivationRevision, expectedStateRevision, reason = "configuration", id = "" } = {}) {
    let journal;
    const state = await mutate((current) => {
      if (current.journal.phase !== "idle") fail("TRANSITION_IN_PROGRESS", "An official-rules activation transaction is already running");
      if (expectedStateRevision !== undefined && current.revision !== expectedStateRevision) {
        fail("OFFICIAL_RULES_STATE_CONFLICT", `Expected official-rules revision ${expectedStateRevision}, received ${current.revision}`);
      }
      if (!Number.isSafeInteger(expectedActivationRevision) || current.activationRevision !== expectedActivationRevision) {
        fail("ACTIVATION_REVISION_CHANGED", `Expected activation revision ${expectedActivationRevision}, received ${current.activationRevision}`);
      }
      if (!current.active) fail("ACTIVE_RULES_MISSING", "Official-rules active snapshot is unavailable");
      const nextId = String(id || createAttemptId()).trim();
      if (!nextId) fail("INVALID_ATTEMPT", "Official-rules configuration attempt id is empty");
      journal = {
        phase: "applying",
        operation: "configuration",
        attemptId: nextId,
        reason: String(reason || "configuration"),
        startedAt: clock(),
        updatedAt: clock(),
        activationRevisionAtStart: current.activationRevision,
        changedKeys: [],
        from: current.active,
        to: current.active,
        fromPins: current.componentPins,
        toPins: current.componentPins,
        error: "",
        rollbackError: ""
      };
      current.journal = journal;
      return current;
    });
    return { state, journal: clone(journal) };
  }

  async function markRollingBack(attempt, error) {
    return mutate((state) => {
      if (state.journal.phase !== "applying" || state.journal.attemptId !== attempt) fail("ATTEMPT_MISMATCH", "Official-rules activation attempt no longer owns the journal");
      state.journal = { ...state.journal, phase: "rolling-back", updatedAt: clock(), error: attemptError(error) };
      return state;
    });
  }

  async function commitApply(attempt) {
    return mutate((state) => {
      if (state.journal.phase !== "applying" || state.journal.attemptId !== attempt) fail("ATTEMPT_MISMATCH", "Official-rules activation attempt no longer owns the journal");
      if (state.activationRevision !== state.journal.activationRevisionAtStart) fail("ACTIVATION_REVISION_CHANGED", "Official-rules active revision changed during apply");
      const changedKeys = state.journal.changedKeys;
      state.previousByComponent = { ...state.previousByComponent };
      for (const key of changedKeys) {
        const previousTarget = state.journal.from?.officialTargets?.[key];
        if (previousTarget) state.previousByComponent[key] = previousTarget;
        delete state.componentPins[key];
      }
      state.lastAppliedChangedKeys = changedKeys;
      state.previous = state.journal.from;
      state.active = state.journal.to;
      state.lastAppliedAt = clock();
      if (state.candidate?.catalogHash === state.journal.to.catalogHash) state.candidate = null;
      state.activationRevision += 1;
      state.journal = idleJournal();
      return state;
    });
  }

  async function commitComponentPinsApply(attempt) {
    return mutate((state) => {
      if (state.journal.phase !== "applying" || state.journal.operation !== "component-pins" || state.journal.attemptId !== attempt) {
        fail("ATTEMPT_MISMATCH", "Official-rules component-pin attempt no longer owns the journal");
      }
      if (state.activationRevision !== state.journal.activationRevisionAtStart) {
        fail("ACTIVATION_REVISION_CHANGED", "Official-rules active revision changed during component-pin apply");
      }
      state.componentPins = state.journal.toPins;
      state.activationRevision += 1;
      state.journal = idleJournal();
      return state;
    });
  }

  async function commitConfigurationApply(attempt, options = {}) {
    return mutate((state) => {
      if (state.journal.phase !== "applying" || state.journal.operation !== "configuration" || state.journal.attemptId !== attempt) {
        fail("ATTEMPT_MISMATCH", "Official-rules configuration attempt no longer owns the journal");
      }
      if (state.activationRevision !== state.journal.activationRevisionAtStart) {
        fail("ACTIVATION_REVISION_CHANGED", "Official-rules active revision changed during configuration apply");
      }
      if (options.incrementActivationRevision === true) state.activationRevision += 1;
      state.journal = idleJournal();
      return state;
    }, options.additionalValues);
  }

  function appendQuarantine(state, target, reason) {
    if (!target?.catalogHash || target.source !== "remote") return;
    state.quarantine = [
      ...state.quarantine.filter((entry) => entry.catalogHash !== target.catalogHash),
      { catalogHash: target.catalogHash, sequence: target.sequence, reason: String(reason || "apply-failed").slice(0, 500), at: clock() }
    ].slice(-16);
  }

  async function completeRollback(attempt, options = {}) {
    return mutate((state) => {
      if (state.journal.phase !== "rolling-back" || state.journal.attemptId !== attempt) fail("ATTEMPT_MISMATCH", "Official-rules rollback attempt no longer owns the journal");
      const target = state.journal.to;
      if (options.quarantine !== false && state.journal.operation === "snapshot") {
        appendQuarantine(state, target, options.reason || state.journal.error || "apply-failed");
      }
      if (state.candidate?.catalogHash === target.catalogHash) state.candidate = null;
      state.journal = idleJournal();
      return state;
    });
  }

  async function markRecoveryRequired(attempt, error) {
    return mutate((state) => {
      if (state.journal.phase === "idle" || state.journal.attemptId !== attempt) fail("ATTEMPT_MISMATCH", "Official-rules recovery attempt no longer owns the journal");
      state.journal = { ...state.journal, phase: "recovery-required", updatedAt: clock(), rollbackError: attemptError(error) };
      return state;
    });
  }

  async function completeRecovery(attempt, options = {}) {
    return mutate((state) => {
      if (state.journal.phase === "idle" || state.journal.attemptId !== attempt) fail("ATTEMPT_MISMATCH", "Official-rules recovery attempt no longer owns the journal");
      const target = state.journal.to;
      if (options.quarantine !== false && state.journal.operation === "snapshot") {
        appendQuarantine(state, target, options.reason || state.journal.error || state.journal.rollbackError || "recovered-after-interruption");
      }
      if (state.candidate?.catalogHash === target.catalogHash) state.candidate = null;
      state.journal = idleJournal();
      return state;
    });
  }

  async function replaceComponentPins(pins = {}, expectedActivationRevision) {
    const normalized = normalizedPins(pins);
    return mutate((state) => {
      if (state.journal.phase !== "idle") fail("TRANSITION_IN_PROGRESS", "Official-rules pins cannot change during an activation transaction");
      if (!Number.isSafeInteger(expectedActivationRevision) || state.activationRevision !== expectedActivationRevision) {
        fail("ACTIVATION_REVISION_CHANGED", `Expected activation revision ${expectedActivationRevision}, received ${state.activationRevision}`);
      }
      state.componentPins = normalized;
      state.activationRevision += 1;
      return state;
    });
  }

  async function touchRevision(expectedRevision) {
    return mutate((state) => {
      if (expectedRevision !== undefined && state.revision !== expectedRevision) {
        fail("OFFICIAL_RULES_STATE_CONFLICT", `Expected official-rules revision ${expectedRevision}, received ${state.revision}`);
      }
      return state;
    });
  }

  async function advanceActivationRevision({ expectedStateRevision, expectedActivationRevision, additionalValues = {} } = {}) {
    return mutate((state) => {
      if (!Number.isSafeInteger(expectedStateRevision) || state.revision !== expectedStateRevision) {
        fail("OFFICIAL_RULES_STATE_CONFLICT", `Expected official-rules revision ${expectedStateRevision}, received ${state.revision}`);
      }
      if (!Number.isSafeInteger(expectedActivationRevision) || state.activationRevision !== expectedActivationRevision) {
        fail("ACTIVATION_REVISION_CHANGED", `Expected activation revision ${expectedActivationRevision}, received ${state.activationRevision}`);
      }
      if (state.journal.phase !== "idle") fail("TRANSITION_IN_PROGRESS", "Official-rules activation revision cannot change during a transaction");
      state.activationRevision += 1;
      return state;
    }, additionalValues);
  }

  async function resetForFullConfigReset(packagedSnapshot, additionalValues = {}) {
    const packaged = normalizeOfficialRulesSnapshot({ ...packagedSnapshot, source: "packaged" }, { allowEmptyPackagedHash: true });
    return mutate((current) => {
      const reset = normalizeOfficialRulesState({});
      reset.schedule.installationJitterMs = current.schedule.installationJitterMs;
      return {
        ...reset,
        revision: current.revision,
        activationRevision: current.activationRevision + 1,
        highestSeen: current.highestSeen,
        componentHighest: current.componentHighest,
        suppressed: null,
        packaged,
        active: packaged
      };
    }, additionalValues);
  }

  async function pruneBlobs(extraHashes = []) {
    const state = await readState();
    const keep = referencedHashes(state);
    for (const hash of extraHashes) keep.add(normalizedHash(hash, "extra retained blob hash"));
    const all = await storage.get(null);
    const removals = Object.keys(all || {}).filter((key) => key.startsWith(OFFICIAL_RULES_BLOB_PREFIX) && !keep.has(key.slice(OFFICIAL_RULES_BLOB_PREFIX.length)));
    if (removals.length) await storage.remove(removals);
    return removals;
  }

  return Object.freeze({
    readState,
    putBlob,
    getBlob,
    hasBlob,
    initializePackaged,
    setAutomaticChecksConsent,
    patchSchedule,
    observeSignedChannel,
    observeSignedCatalog,
    stageCandidate,
    suppressIncompatible,
    clearCandidate,
    beginCandidateApply,
    beginComponentPinsApply,
    beginConfigurationApply,
    markRollingBack,
    commitApply,
    commitComponentPinsApply,
    commitConfigurationApply,
    completeRollback,
    markRecoveryRequired,
    completeRecovery,
    replaceComponentPins,
    touchRevision,
    advanceActivationRevision,
    resetForFullConfigReset,
    pruneBlobs
  });
}
