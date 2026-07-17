#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { initSync, parse } = require("es-module-lexer");
const { CONTENT_ENTRIES } = require("./generated-artifacts.cjs");

const root = path.resolve(__dirname, "..");
const inventoryPath = path.join(root, "tools/global-runtime-ownership.json");
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const toRelative = (absolute) => path.relative(root, absolute).replaceAll(path.sep, "/");

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".js") && !entry.name.endsWith(".generated.js")) files.push(absolute);
  }
  return files;
}

async function registeredAuthorEntries() {
  const inventoryModule = await import(pathToFileURL(path.join(root, "shared/frame-commands.js")).href);
  const specs = [
    ...Object.values(inventoryModule.CONTENT_CAPABILITY_BUNDLES).flat(),
    ...Object.values(inventoryModule.CONTENT_ANCILLARY_BUNDLES)
  ];
  assert.equal(new Set(specs.map(({ file }) => file)).size, specs.length, "content capability and ancillary entries must be unique");
  return specs.map(({ file, world }) => {
    const author = CONTENT_ENTRIES[file];
    assert.equal(typeof author, "string", `${file} must be a declared generated content entry`);
    assert.ok(fs.statSync(path.join(root, author), { throwIfNoEntry: false })?.isFile(), `${file} must map to ${author}`);
    return { author, file, realm: world === "MAIN" ? "main" : "isolated" };
  });
}

function relativeImports(absolute) {
  const source = fs.readFileSync(absolute, "utf8");
  const [imports] = parse(source);
  return imports
    .map((entry) => entry.n)
    .filter((specifier) => typeof specifier === "string" && specifier.startsWith("."))
    .map((specifier) => path.resolve(path.dirname(absolute), specifier))
    .filter((candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile());
}

function deriveContentModuleRealms(entries) {
  initSync();
  const realmsByModule = new Map();
  for (const { author, realm } of entries) {
    const stack = [path.join(root, author)];
    const visited = new Set();
    while (stack.length) {
      const absolute = stack.pop();
      if (visited.has(absolute)) continue;
      visited.add(absolute);
      const relative = toRelative(absolute);
      if (!realmsByModule.has(relative)) realmsByModule.set(relative, new Set());
      realmsByModule.get(relative).add(realm);
      stack.push(...relativeImports(absolute));
    }
  }
  return realmsByModule;
}

function sameMembers(actual, expected, message) {
  assert.deepEqual([...new Set(actual)].sort(), [...new Set(expected)].sort(), message);
}

function sourceContainsIdentifier(source, identifier) {
  return new RegExp(`\\b${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(source);
}

async function resolvedContracts(contracts) {
  const moduleCache = new Map();
  const load = async (file) => {
    if (!moduleCache.has(file)) moduleCache.set(file, import(pathToFileURL(path.join(root, file)).href));
    return moduleCache.get(file);
  };
  const resolved = [];
  for (const contract of contracts) {
    let key = contract.key || "";
    const resolvedAliases = [];
    if (contract.keySource) {
      const sourceModule = await load(contract.keySource.module);
      key = sourceModule[contract.keySource.export];
      assert.equal(typeof key, "string", `${contract.keySource.export} must resolve to a global key string`);
      for (const alias of contract.keySource.aliases || []) {
        const aliasModule = await load(alias.module);
        resolvedAliases.push({
          exportName: alias.export,
          sourceExportName: contract.keySource.export,
          value: aliasModule[alias.export]
        });
      }
    }
    resolved.push({ ...contract, key, resolvedAliases });
  }
  return resolved;
}

function runtimeRegistrySourceForGeneration(generation, protocol) {
  const source = fs.readFileSync(path.join(root, "content-src/shared/runtime-registry.js"), "utf8");
  const protocolImport = /import\s*\{[\s\S]*?\}\s*from "\.\.\/\.\.\/shared\/protocol\.js";/;
  const versionImport = /import\s*\{[\s\S]*?CONTENT_RUNTIME_IMPLEMENTATION_VERSION[\s\S]*?\}\s*from "\.\.\/\.\.\/shared\/content-runtime-version\.generated\.js";/;
  assert.match(source, protocolImport);
  assert.match(source, versionImport);
  return source
    .replace(protocolImport, [
      `const RUNTIME_MIGRATION_STAGE_KEY = ${JSON.stringify(protocol.RUNTIME_MIGRATION_STAGE_KEY)};`,
      `const RUNTIME_REGISTRY_ABI_VERSION = ${JSON.stringify(protocol.RUNTIME_REGISTRY_ABI_VERSION)};`,
      `const RUNTIME_REGISTRY_KEY = ${JSON.stringify(protocol.RUNTIME_REGISTRY_KEY)};`
    ].join("\n"))
    .replace(versionImport, `const CONTENT_RUNTIME_IMPLEMENTATION_VERSION = ${JSON.stringify(generation)};`);
}

async function runtimeRegistryForGeneration(generation, protocol) {
  const source = runtimeRegistrySourceForGeneration(generation, protocol);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return (await import(url)).runtimeRegistry;
}

async function verifyGenerationOwnershipBehavior(protocol) {
  const count = Number(inventory.generationBehaviorCount);
  assert.ok(Number.isInteger(count) && count >= 3, "ownership behavior must exercise at least three generations");
  const generations = Array.from({ length: count }, (_, index) => `ownership-generation-${index + 1}`);
  const target = {};
  const legacyKey = `__CHATCLUB_RUNTIME_REGISTRY_V1_SOURCE_${"a".repeat(64)}__`;
  let legacyDisposed = 0;
  Object.defineProperty(target, legacyKey, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      dispose() {
        legacyDisposed += 1;
        delete target[legacyKey];
      }
    })
  });
  Object.defineProperty(target, protocol.RUNTIME_MIGRATION_STAGE_KEY, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      registryKey: protocol.RUNTIME_REGISTRY_KEY,
      generation: generations[0]
    })
  });

  const liveOwners = new Set();
  const disposalCount = new Map();
  const disposalReasons = new Map();
  const registerOwner = (facade, generation, version = generation) => facade.register("ownership-probe", {
    version,
    api: Object.freeze({ generation, version }),
    activate() { liveOwners.add(version); },
    dispose(reason) {
      liveOwners.delete(version);
      disposalCount.set(version, (disposalCount.get(version) || 0) + 1);
      disposalReasons.set(version, String(reason || ""));
    }
  });

  let broker = null;
  let activeFacade = null;
  for (let index = 0; index < generations.length; index += 1) {
    const generation = generations[index];
    if (broker) broker.beginGeneration(generation);
    const runtimeRegistry = await runtimeRegistryForGeneration(generation, protocol);
    const facade = runtimeRegistry(target);
    broker ||= target[protocol.RUNTIME_REGISTRY_KEY];
    assert.equal(target[protocol.RUNTIME_REGISTRY_KEY], broker, "every injected generation must reuse the same broker object");
    if (index === 0) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(target, protocol.RUNTIME_MIGRATION_STAGE_KEY),
        false,
        "the one-shot migration stage must be removed as soon as the new generation acquires the broker"
      );
      assert.equal(legacyDisposed, 0, "legacy ownership must remain active until the staged generation commits");
    }
    registerOwner(facade, generation);
    broker.prepareGeneration(generation);
    broker.commitGeneration(generation);
    activeFacade = facade;
    assert.equal(broker.activeGenerationVersion, generation);
    assert.deepEqual([...liveOwners], [generation], "exactly one generation may own live side effects after commit");
    if (index === 0) assert.equal(legacyDisposed, 1, "committing the migration must dispose the legacy owner once");
    if (index > 0) {
      const previous = generations[index - 1];
      assert.equal(disposalCount.get(previous), 1, `${previous} must be disposed exactly once`);
      assert.match(disposalReasons.get(previous), new RegExp(`superseded by content runtime generation ${generation}$`));
    }
    const brokerGlobals = Object.getOwnPropertyNames(target).filter((key) =>
      /^__CHATCLUB_RUNTIME_REGISTRY_V\d+(?:_SOURCE_[a-f0-9]{64})?__$/i.test(key)
    );
    assert.deepEqual(brokerGlobals, [protocol.RUNTIME_REGISTRY_KEY], "continuous injection must stabilize at one broker global");
  }

  const finalGeneration = generations.at(-1);
  const sameGenerationRegistry = await runtimeRegistryForGeneration(finalGeneration, protocol);
  assert.equal(sameGenerationRegistry(target), activeFacade, "same-generation reinjection must reuse its facade");
  registerOwner(activeFacade, finalGeneration);
  assert.deepEqual([...liveOwners], [finalGeneration], "same-version reinjection must not duplicate the owner");
  assert.equal(disposalCount.get(finalGeneration), undefined);

  assert.equal(activeFacade.invalidate("ownership-probe", "explicit owner cleanup"), true);
  assert.equal(liveOwners.size, 0);
  assert.equal(disposalCount.get(finalGeneration), 1);
  assert.equal(disposalReasons.get(finalGeneration), "explicit owner cleanup");

  const replacementVersion = `${finalGeneration}:replacement`;
  registerOwner(activeFacade, finalGeneration, replacementVersion);
  assert.deepEqual([...liveOwners], [replacementVersion]);
  activeFacade.dispose("owner facade disposed");
  assert.equal(liveOwners.size, 0, "generation facade disposal must release owner side effects");
  assert.equal(disposalCount.get(replacementVersion), 1);
  assert.equal(disposalReasons.get(replacementVersion), "owner facade disposed");

  const abortedGeneration = "ownership-generation-aborted";
  const aborted = broker.beginGeneration(abortedGeneration);
  registerOwner(aborted, abortedGeneration);
  assert.equal(liveOwners.size, 0, "pending owners must not activate before commit");
  assert.equal(broker.abortGeneration(abortedGeneration, "injection aborted"), true);
  assert.equal(disposalCount.get(abortedGeneration), 1, "aborted pending owners must still receive cleanup");
  assert.equal(disposalReasons.get(abortedGeneration), "injection aborted");
  assert.throws(
    () => broker.beginGeneration(abortedGeneration),
    /aborted/,
    "an aborted generation stays poisoned because partially evaluated bundle side effects cannot be proven rolled back"
  );
}

async function verifyStableBrokerAbiMigration(protocol) {
  const target = {};
  const oldBrokerKey = "__CHATCLUB_RUNTIME_REGISTRY_V1__";
  const newBrokerKey = "__CHATCLUB_RUNTIME_REGISTRY_V2__";
  const generation = "ownership-abi-v2-generation";
  let shutdownCount = 0;
  let shutdownReason = "";
  let oldBrokerPoisoned = false;
  const oldBroker = Object.freeze({
    kind: "ChatClubContentRuntimeBroker",
    brokerVersion: 1,
    abiVersion: 1,
    get closed() { return oldBrokerPoisoned; },
    acquireGeneration() {
      if (oldBrokerPoisoned) throw new Error("V1 broker is shut down");
      return Object.freeze({ generationVersion: "ownership-abi-v1-generation" });
    },
    shutdown(reason) {
      shutdownCount += 1;
      shutdownReason = String(reason || "");
      oldBrokerPoisoned = true;
    }
  });
  Object.defineProperty(target, oldBrokerKey, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: oldBroker
  });
  Object.defineProperty(target, protocol.RUNTIME_MIGRATION_STAGE_KEY, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: Object.freeze({ registryKey: newBrokerKey, generation })
  });
  const nextProtocol = {
    ...protocol,
    RUNTIME_REGISTRY_ABI_VERSION: 2,
    RUNTIME_REGISTRY_KEY: newBrokerKey
  };
  const runtimeRegistry = await runtimeRegistryForGeneration(generation, nextProtocol);
  const facade = runtimeRegistry(target);
  facade.register("abi-migration-probe", {
    version: generation,
    api: Object.freeze({ generation })
  });
  const broker = target[newBrokerKey];
  assert.equal(typeof broker.dispose, "function", "stable brokers must expose the legacy cleanup alias");
  broker.prepareGeneration(generation);
  broker.commitGeneration(generation);
  assert.equal(shutdownCount, 1, "V2 commit must retire a V1 stable broker that exposes only shutdown");
  assert.equal(oldBroker.closed, true);
  assert.match(shutdownReason, /migrated to content runtime generation ownership-abi-v2-generation/);
  assert.equal(target[oldBrokerKey], oldBroker, "a non-configurable legacy broker key remains addressable");
  assert.throws(
    () => oldBroker.acquireGeneration("ownership-abi-v1-generation"),
    /shut down/,
    "a stale V1 bundle must not reactivate owners after the V2 commit"
  );
}

(async () => {
  assert.equal(inventory.schemaVersion, 1);
  assert.deepEqual(inventory.browserAuthorRoots, ["app", "background", "shared", "ui", "content-src"]);
  const scannedFiles = inventory.browserAuthorRoots.flatMap((directory) => sourceFiles(path.join(root, directory)));
  const sourceByFile = new Map(scannedFiles.map((absolute) => [toRelative(absolute), fs.readFileSync(absolute, "utf8")]));
  const literalUses = new Map();
  for (const [relative, source] of sourceByFile) {
    for (const match of source.matchAll(/__CHATCLUB_[A-Z0-9_]+__/g)) {
      if (!literalUses.has(match[0])) literalUses.set(match[0], new Set());
      literalUses.get(match[0]).add(relative);
    }
  }

  const contracts = await resolvedContracts(inventory.globals);
  const protocol = await import(pathToFileURL(path.join(root, "shared/protocol.js")).href);
  const keys = contracts.map(({ key }) => key);
  assert.equal(new Set(keys).size, keys.length, "global ownership keys must be unique after dynamic resolution");
  const discoveredKeys = new Set(literalUses.keys());
  for (const contract of contracts.filter(({ keySource }) => keySource)) discoveredKeys.add(contract.key);
  sameMembers(keys, discoveredKeys, "global runtime inventory must exactly cover every browser author-source global");

  const entries = await registeredAuthorEntries();
  const realmsByModule = deriveContentModuleRealms(entries);
  const validRealms = new Set(["isolated", "main", "background"]);
  const validLifecycles = new Set(["navigation", "document", "process"]);
  for (const contract of contracts) {
    assert.match(contract.key, /^__CHATCLUB_[A-Z0-9_]+__$/);
    assert.ok(fs.statSync(path.join(root, contract.owner), { throwIfNoEntry: false })?.isFile(), `${contract.key} owner must exist`);
    const ownerSource = sourceByFile.get(contract.owner) || "";
    if (contract.keySource) {
      assert.ok(
        (contract.referenceIdentifiers || []).some((identifier) => sourceContainsIdentifier(ownerSource, identifier)),
        `${contract.key} owner must reference its dynamic key export`
      );
    } else {
      assert.ok(literalUses.get(contract.key)?.has(contract.owner), `${contract.key} owner must reference the global it owns`);
    }
    assert.ok(contract.realms.length > 0 && contract.realms.every((realm) => validRealms.has(realm)), `${contract.key} has invalid realms`);
    assert.ok(validLifecycles.has(contract.lifecycle), `${contract.key} has an invalid lifecycle`);
    assert.ok(contract.cleanup.length >= 12, `${contract.key} must document cleanup or replacement`);
    assert.ok(contract.trustBoundary.length >= 8, `${contract.key} must document its trust boundary`);

    const evidence = contract.realmEvidence || [contract.owner];
    const derivedRealms = new Set();
    for (const file of evidence) {
      if (file.startsWith("background/")) derivedRealms.add("background");
      else for (const realm of realmsByModule.get(file) || []) derivedRealms.add(realm);
    }
    assert.ok(derivedRealms.size > 0, `${contract.key} realm evidence must be reachable from content registration or background`);
    sameMembers(
      contract.realms,
      derivedRealms,
      `${contract.key} realm must match the world derived from the canonical content capability inventory`
    );
  }

  await verifyGenerationOwnershipBehavior(protocol);
  await verifyStableBrokerAbiMigration(protocol);
  for (const contract of contracts) {
    for (const alias of contract.resolvedAliases) {
      assert.equal(
        alias.value,
        contract.key,
        `${alias.exportName} must alias ${alias.sourceExportName}; registration and author bundles need one broker key`
      );
    }
  }
  console.log(`${contracts.length} global runtime ownership contracts and ${inventory.generationBehaviorCount} generations verified.`);
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
