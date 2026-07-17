import {
  RUNTIME_MIGRATION_STAGE_KEY,
  RUNTIME_REGISTRY_ABI_VERSION,
  RUNTIME_REGISTRY_KEY
} from "../../shared/protocol.js";
import {
  CONTENT_RUNTIME_IMPLEMENTATION_VERSION
} from "../../shared/content-runtime-version.generated.js";

const BROKER_KIND = "ChatClubContentRuntimeBroker";
const BROKER_VERSION = 1;

function validName(name) {
  const value = String(name || "").trim();
  if (!value) throw new TypeError("Runtime name is required");
  return value;
}

function validGeneration(version) {
  const value = String(version || "").trim();
  if (!value) throw new TypeError("Content runtime generation is required");
  return value;
}

function legacyRegistries(target) {
  const registries = [];
  let keys = [];
  try { keys = Object.getOwnPropertyNames(target); } catch {}
  for (const key of keys) {
    if (
      key === RUNTIME_REGISTRY_KEY
      || !/^__CHATCLUB_RUNTIME_REGISTRY_V\d+(?:_SOURCE_[a-f0-9]{64})?__$/i.test(key)
    ) continue;
    let registry = null;
    try { registry = target[key]; } catch {}
    if (!registry || (typeof registry.dispose !== "function" && typeof registry.shutdown !== "function")) continue;
    registries.push(Object.freeze({ key, registry }));
  }
  return registries;
}

function migrationStage(target) {
  let stage = null;
  let descriptor = null;
  try {
    stage = target[RUNTIME_MIGRATION_STAGE_KEY];
    descriptor = Object.getOwnPropertyDescriptor(target, RUNTIME_MIGRATION_STAGE_KEY);
  } catch {}
  if (
    !stage
    || typeof stage !== "object"
    || descriptor?.value !== stage
    || descriptor.writable
    || stage.registryKey !== RUNTIME_REGISTRY_KEY
    || stage.generation !== CONTENT_RUNTIME_IMPLEMENTATION_VERSION
  ) return null;
  return stage;
}

function createBroker({ legacy = [] } = {}) {
  const generations = new Map();
  const retiredGenerations = new Map();
  let stagedLegacyRegistries = [...legacy];
  let activeGenerationVersion = "";
  let brokerShutdownReason = "";

  function assertBrokerRunning() {
    if (brokerShutdownReason) {
      throw new Error(`Content runtime broker is shut down: ${brokerShutdownReason}`);
    }
  }

  function disposeStagedLegacy(reason) {
    const staged = stagedLegacyRegistries;
    stagedLegacyRegistries = [];
    for (const { registry } of staged) {
      try {
        if (typeof registry.dispose === "function") registry.dispose(reason);
        else registry.shutdown(reason);
      } catch {}
    }
  }

  function completeLegacyMigration(generation) {
    disposeStagedLegacy(`migrated to content runtime generation ${generation} through ${RUNTIME_REGISTRY_KEY}`);
  }

  function generationRecord(version, { create = false } = {}) {
    const generation = validGeneration(version);
    const retiredState = retiredGenerations.get(generation);
    if (retiredState) {
      throw new Error(`Content runtime generation ${generation} is ${retiredState}`);
    }
    let record = generations.get(generation) || null;
    if (!record && create) {
      record = {
        version: generation,
        state: "pending",
        entries: new Map(),
        bundles: new Map(),
        facade: null
      };
      record.facade = createGenerationFacade(record);
      generations.set(generation, record);
    }
    return record;
  }

  function assertUsable(record) {
    if (record.state === "aborted" || record.state === "superseded") {
      throw new Error(`Content runtime generation ${record.version} is ${record.state}`);
    }
  }

  function disposeEntry(record, key, reason) {
    const entry = record.entries.get(key);
    if (!entry) return false;
    record.entries.delete(key);
    try { entry.dispose?.(String(reason || "invalidated")); } catch {}
    return true;
  }

  function disposeRecord(record, state, reason) {
    record.state = state;
    for (const key of [...record.entries.keys()]) disposeEntry(record, key, reason);
    record.bundles.clear();
    generations.delete(record.version);
    retiredGenerations.set(record.version, state);
  }

  function activateEntry(entry) {
    if (entry.activated) return;
    entry.activate?.();
    entry.activated = true;
  }

  function descriptorEntry(key, version, descriptor) {
    if (!descriptor || typeof descriptor !== "object" || !("api" in descriptor)) {
      throw new TypeError(`Runtime ${key} requires an api descriptor`);
    }
    return {
      version,
      api: descriptor.api,
      activate: typeof descriptor.activate === "function" ? descriptor.activate : null,
      dispose: typeof descriptor.dispose === "function" ? descriptor.dispose : null,
      activated: false
    };
  }

  function bundleClaim(identity, generation = "") {
    const source = identity?.bundle && typeof identity.bundle === "object" ? identity.bundle : identity;
    const claim = Object.freeze({
      outputPath: String(source?.outputPath || ""),
      entryPath: String(source?.entryPath || ""),
      sourceSha256: String(source?.sourceSha256 || ""),
      implementationSha256: String(source?.implementationSha256 || ""),
      implementationVersion: String(source?.implementationVersion || "")
    });
    if (
      !claim.outputPath
      || !claim.entryPath
      || !/^[a-f0-9]{64}$/i.test(claim.sourceSha256)
      || !/^[a-f0-9]{64}$/i.test(claim.implementationSha256)
      || !claim.implementationVersion
    ) throw new TypeError("Content runtime bundle identity is incomplete");
    const declaredGeneration = String(identity?.implementationVersion || "");
    if (generation && declaredGeneration && declaredGeneration !== generation) {
      throw new Error(`Content runtime bundle ${claim.outputPath} belongs to generation ${declaredGeneration}, expected ${generation}`);
    }
    return claim;
  }

  function registerEntry(record, key, entry) {
    assertUsable(record);
    const previous = record.entries.get(key);
    if (previous?.version === entry.version) return previous.api;

    if (record.state === "active") {
      try {
        activateEntry(entry);
      } catch (error) {
        try { entry.dispose?.(`activation failed: ${error?.message || String(error)}`); } catch {}
        throw error;
      }
    }

    record.entries.set(key, entry);
    if (previous) {
      try { previous.dispose?.(`replaced by ${entry.version}`); } catch {}
    }
    return entry.api;
  }

  function createGenerationFacade(record) {
    return Object.freeze({
      abiVersion: RUNTIME_REGISTRY_ABI_VERSION,
      generationVersion: record.version,
      get state() { return record.state; },
      get isActive() { return record.state === "active"; },
      registerBundle(identity) {
        assertUsable(record);
        const claim = bundleClaim(identity, record.version);
        const previous = record.bundles.get(claim.outputPath);
        if (previous) {
          if (JSON.stringify(previous) !== JSON.stringify(claim)) {
            throw new Error(`Content runtime bundle ${claim.outputPath} was registered with conflicting identities`);
          }
          return previous;
        }
        record.bundles.set(claim.outputPath, claim);
        return claim;
      },
      bundleRegistration(outputPath) {
        assertUsable(record);
        return record.bundles.get(String(outputPath || "")) || null;
      },
      register(name, descriptor = {}) {
        const key = validName(name);
        const version = String(descriptor.version || "");
        if (!version) throw new TypeError(`Runtime ${key} requires a version`);
        if (!("api" in descriptor)) throw new TypeError(`Runtime ${key} requires an api`);
        return registerEntry(record, key, descriptorEntry(key, version, descriptor));
      },
      install(name, version, factory) {
        const key = validName(name);
        const expectedVersion = String(version || "");
        if (!expectedVersion) throw new TypeError(`Runtime ${key} requires a version`);
        assertUsable(record);
        const previous = record.entries.get(key);
        if (previous?.version === expectedVersion) return previous.api;
        if (typeof factory !== "function") throw new TypeError(`Runtime ${key} requires an installer`);
        const descriptor = factory();
        const entry = descriptorEntry(key, expectedVersion, descriptor);
        return registerEntry(record, key, entry);
      },
      require(name, version) {
        assertUsable(record);
        const key = validName(name);
        const entry = record.entries.get(key);
        if (!entry) throw new Error(`Runtime ${key} is not registered in generation ${record.version}`);
        if (version != null && entry.version !== String(version)) {
          throw new Error(`Runtime ${key} version ${entry.version} does not satisfy ${String(version)}`);
        }
        return entry.api;
      },
      registration(name) {
        assertUsable(record);
        const entry = record.entries.get(validName(name));
        return entry ? Object.freeze({ version: entry.version, api: entry.api }) : null;
      },
      invalidate(name, reason = "invalidated") {
        assertUsable(record);
        return disposeEntry(record, validName(name), reason);
      },
      dispose(reason = "generation registry disposed") {
        assertUsable(record);
        for (const key of [...record.entries.keys()]) disposeEntry(record, key, reason);
      },
      beginGeneration(version) {
        return broker.beginGeneration(version);
      },
      activateGeneration(version) {
        return broker.activateGeneration(version);
      },
      prepareGeneration(version, expectedBundles) {
        return broker.prepareGeneration(version, expectedBundles);
      },
      commitGeneration(version) {
        return broker.commitGeneration(version);
      },
      abortGeneration(version, reason) {
        return broker.abortGeneration(version, reason);
      },
      shutdown(reason) {
        return broker.shutdown(reason);
      }
    });
  }

  const broker = Object.freeze({
    kind: BROKER_KIND,
    brokerVersion: BROKER_VERSION,
    abiVersion: RUNTIME_REGISTRY_ABI_VERSION,
    get closed() { return Boolean(brokerShutdownReason); },
    get activeGenerationVersion() { return activeGenerationVersion; },
    beginGeneration(version) {
      assertBrokerRunning();
      const generation = validGeneration(version);
      const retiredState = retiredGenerations.get(generation);
      if (retiredState) throw new Error(`Content runtime generation ${generation} is ${retiredState}`);
      const active = activeGenerationVersion ? generations.get(activeGenerationVersion) : null;
      if (active?.version === generation) return active.facade;
      const existing = generations.get(generation);
      if (existing) {
        assertUsable(existing);
        return existing.facade;
      }
      return generationRecord(generation, { create: true }).facade;
    },
    activateGeneration(version) {
      this.prepareGeneration(version);
      return this.commitGeneration(version);
    },
    prepareGeneration(version, expectedBundles = []) {
      assertBrokerRunning();
      const generation = validGeneration(version);
      const next = generations.get(generation);
      if (!next) throw new Error(`Content runtime generation ${generation} was not begun`);
      assertUsable(next);
      const expected = Array.isArray(expectedBundles) ? expectedBundles.map((identity) => bundleClaim(identity)) : [];
      for (const claim of expected) {
        const registered = next.bundles.get(claim.outputPath);
        if (!registered || JSON.stringify(registered) !== JSON.stringify(claim)) {
          throw new Error(`Content runtime bundle ${claim.outputPath} is missing or has the wrong identity`);
        }
      }
      if (next.state === "active" || next.state === "prepared") return next.facade;
      if (next.state !== "pending") {
        throw new Error(`Content runtime generation ${generation} cannot prepare from ${next.state}`);
      }

      next.state = "prepared";
      return next.facade;
    },
    commitGeneration(version) {
      assertBrokerRunning();
      const generation = validGeneration(version);
      const next = generations.get(generation);
      if (!next) throw new Error(`Content runtime generation ${generation} was not begun`);
      assertUsable(next);
      if (next.state === "active") return next.facade;
      if (next.state !== "prepared") {
        throw new Error(`Content runtime generation ${generation} cannot commit from ${next.state}`);
      }

      try {
        for (const entry of next.entries.values()) activateEntry(entry);
      } catch (error) {
        const reason = `activation failed closed: ${error?.message || String(error)}`;
        activeGenerationVersion = "";
        for (const record of [...generations.values()]) disposeRecord(record, "aborted", reason);
        disposeStagedLegacy(reason);
        throw error;
      }

      const previous = activeGenerationVersion ? generations.get(activeGenerationVersion) : null;
      next.state = "active";
      activeGenerationVersion = generation;
      if (previous && previous !== next) {
        disposeRecord(previous, "superseded", `superseded by content runtime generation ${generation}`);
      }
      for (const candidate of [...generations.values()]) {
        if (candidate !== next && ["pending", "prepared"].includes(candidate.state)) {
          disposeRecord(candidate, "aborted", `superseded by content runtime generation ${generation}`);
        }
      }
      completeLegacyMigration(generation);
      return next.facade;
    },
    abortGeneration(version, reason = "generation installation aborted") {
      assertBrokerRunning();
      const generation = validGeneration(version);
      const record = generations.get(generation);
      if (!record) return false;
      if (record.state === "active") {
        throw new Error(`Active content runtime generation ${generation} cannot be aborted`);
      }
      assertUsable(record);
      disposeRecord(record, "aborted", reason);
      return true;
    },
    shutdown(reason = "content runtime generation activation failed closed") {
      const detail = String(reason || "content runtime generation activation failed closed");
      if (brokerShutdownReason) return 0;
      brokerShutdownReason = detail;
      const records = [...generations.values()];
      activeGenerationVersion = "";
      for (const record of records) {
        disposeRecord(record, "aborted", detail);
      }
      disposeStagedLegacy(detail);
      return records.length;
    },
    dispose(reason = "content runtime broker disposed") {
      return broker.shutdown(reason);
    },
    acquireGeneration(version) {
      assertBrokerRunning();
      const generation = validGeneration(version);
      const retiredState = retiredGenerations.get(generation);
      if (retiredState) throw new Error(`Content runtime generation ${generation} is ${retiredState}`);
      const existing = generations.get(generation);
      if (existing) {
        assertUsable(existing);
        return existing.facade;
      }
      const facade = broker.beginGeneration(generation);
      return broker.activateGeneration(generation) || facade;
    }
  });

  return broker;
}

function isRuntimeBroker(value) {
  return Boolean(
    value
    && value.kind === BROKER_KIND
    && value.brokerVersion === BROKER_VERSION
    && value.abiVersion === RUNTIME_REGISTRY_ABI_VERSION
    && typeof value.acquireGeneration === "function"
    && typeof value.beginGeneration === "function"
    && typeof value.prepareGeneration === "function"
    && typeof value.commitGeneration === "function"
    && typeof value.activateGeneration === "function"
    && typeof value.abortGeneration === "function"
    && typeof value.shutdown === "function"
  );
}

// eslint-disable-next-line chatclub-realm/no-cross-realm-global -- explicit injectable DOM-global default keeps broker tests hermetic.
export function runtimeRegistry(target = globalThis) {
  let broker = target[RUNTIME_REGISTRY_KEY];
  if (broker != null && !isRuntimeBroker(broker)) {
    throw new Error(
      `Runtime broker key ${RUNTIME_REGISTRY_KEY} is occupied by ABI ${String(broker?.abiVersion ?? "unknown")}; `
      + "incrementing RUNTIME_REGISTRY_ABI_VERSION must also produce a new broker key"
    );
  }
  if (!broker) {
    const legacy = legacyRegistries(target);
    broker = createBroker({ legacy });
    Object.defineProperty(target, RUNTIME_REGISTRY_KEY, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: broker
    });
  }
  const stage = migrationStage(target);
  if (stage) {
    try { delete target[RUNTIME_MIGRATION_STAGE_KEY]; } catch {}
    return broker.beginGeneration(CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
  }
  return broker.acquireGeneration(CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
}
