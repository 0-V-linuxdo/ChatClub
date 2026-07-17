#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  CONTENT_ENTRIES,
  TOPIC_DELETE_OUTPUT_FILES,
  contentRuntimeBundleIdentities,
  contentRuntimeBundleSourceStates,
  contentRuntimeBuildRecipeState,
  contentRuntimeImplementationSha256,
  contentRuntimeImplementationVersion,
  contentRuntimeSourceState,
  assertGeneratedArtifactInventory
} = require("./generated-artifacts.cjs");
const { packageDigest, packagePlan, root } = require("./package-plan.cjs");

const statePath = path.join(root, "version-state.json");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function appVersion() {
  const match = read("shared/constants.js").match(/export const APP_VERSION\s*=\s*(["'])(.*?)\1\s*;/);
  if (!match) throw new Error("shared/constants.js does not export APP_VERSION");
  return match[2];
}

function contentRuntimeProtocolVersion() {
  const match = read("shared/protocol.js").match(
    /export const CONTENT_BRIDGE_VERSION\s*=\s*(["'])(.*?)\1\s*;/
  );
  if (!match) throw new Error("shared/protocol.js does not export CONTENT_BRIDGE_VERSION");
  return match[2];
}

function contentRuntimeState() {
  const source = contentRuntimeSourceState(root);
  const bundleSources = contentRuntimeBundleSourceStates(root);
  const buildRecipe = contentRuntimeBuildRecipeState(root);
  const protocolVersion = contentRuntimeProtocolVersion();
  const implementationSha256 = contentRuntimeImplementationSha256(
    protocolVersion,
    source.sha256,
    buildRecipe.sha256
  );
  const bundleIdentities = contentRuntimeBundleIdentities(
    protocolVersion,
    bundleSources,
    buildRecipe.sha256
  );
  return {
    sourceSchemaVersion: source.schemaVersion,
    sourceSha256: source.sha256,
    sourceFileCount: source.files.length,
    buildRecipeSchemaVersion: buildRecipe.schemaVersion,
    buildRecipeVersion: buildRecipe.version,
    buildRecipeSha256: buildRecipe.sha256,
    buildRecipeFileCount: buildRecipe.files.length,
    protocolVersion,
    implementationSha256,
    implementationVersion: contentRuntimeImplementationVersion(
      protocolVersion,
      source.sha256,
      buildRecipe.sha256
    ),
    bundles: Object.fromEntries(Object.keys(CONTENT_ENTRIES).sort().map((outputPath) => [
      outputPath,
      {
        entryPath: bundleSources[outputPath].entryPath,
        sourceSha256: bundleSources[outputPath].sourceSha256,
        sourceFileCount: bundleSources[outputPath].files.length,
        virtualInputs: bundleSources[outputPath].virtualInputs,
        implementationSha256: bundleIdentities[outputPath].implementationSha256,
        implementationVersion: bundleIdentities[outputPath].implementationVersion
      }
    ]))
  };
}

function contentRuntimeBindingErrors(state) {
  const errors = [];
  const sourceSha256 = String(state?.sourceSha256 || "");
  const buildRecipeSha256 = String(state?.buildRecipeSha256 || "");
  const protocolVersion = String(state?.protocolVersion || "");
  let expectedSha256 = "";
  let expectedVersion = "";
  try {
    expectedSha256 = contentRuntimeImplementationSha256(
      protocolVersion,
      sourceSha256,
      buildRecipeSha256
    );
    expectedVersion = contentRuntimeImplementationVersion(
      protocolVersion,
      sourceSha256,
      buildRecipeSha256
    );
  } catch (error) {
    errors.push(`content runtime identity binding is invalid: ${error.message}`);
    return errors;
  }
  if (state?.implementationSha256 !== expectedSha256) {
    errors.push("content runtime implementation digest is not bound to protocol, author source, and build recipe");
  }
  if (state?.implementationVersion !== expectedVersion) {
    errors.push("content runtime implementation version is not bound to protocol, author source, and build recipe");
  }
  const bundleStates = state?.bundles && typeof state.bundles === "object" ? state.bundles : {};
  const expectedOutputs = Object.keys(CONTENT_ENTRIES).sort();
  if (JSON.stringify(Object.keys(bundleStates).sort()) !== JSON.stringify(expectedOutputs)) {
    errors.push("content runtime bundle identity inventory is incomplete");
    return errors;
  }
  try {
    const bundleSources = Object.fromEntries(expectedOutputs.map((outputPath) => [
      outputPath,
      {
        outputPath,
        entryPath: bundleStates[outputPath]?.entryPath,
        sourceSha256: bundleStates[outputPath]?.sourceSha256
      }
    ]));
    const expectedBundles = contentRuntimeBundleIdentities(
      protocolVersion,
      bundleSources,
      buildRecipeSha256
    );
    for (const outputPath of expectedOutputs) {
      const bundle = bundleStates[outputPath];
      if (
        bundle?.implementationSha256 !== expectedBundles[outputPath].implementationSha256
        || bundle?.implementationVersion !== expectedBundles[outputPath].implementationVersion
      ) {
        errors.push(`content runtime bundle identity is not bound to its source closure and build recipe: ${outputPath}`);
      }
    }
  } catch (error) {
    errors.push(`content runtime bundle identity binding is invalid: ${error.message}`);
  }
  return errors;
}

function summaryState() {
  const index = JSON.parse(read("userscripts/index.json"));
  const ids = new Set();
  return {
    configVersion: index.summarySiteConfigVersion,
    sites: Object.fromEntries(index.configs.map((config) => {
      if (!config?.id || ids.has(config.id)) {
        throw new Error(`userscripts/index.json: duplicate or missing summary id ${JSON.stringify(config?.id)}`);
      }
      ids.add(config.id);
      const source = read(path.posix.join("userscripts", config.userscriptFile)).replace(/\r\n?/g, "\n");
      return [config.id, {
        file: config.userscriptFile,
        configVersion: config.configVersion,
        sha256: sha256(source)
      }];
    }).sort(([left], [right]) => left.localeCompare(right)))
  };
}

function deleteState() {
  assertGeneratedArtifactInventory(root);
  const files = TOPIC_DELETE_OUTPUT_FILES.map((file) => path.posix.basename(file));
  return Object.fromEntries(files.map((file) => {
    const source = read(path.posix.join("topic-delete-userscripts", file)).replace(/\r\n?/g, "\n");
    const version = source.match(/^\/\/\s*@version\s+([^\s]+)\s*$/m)?.[1];
    if (!version) throw new Error(`${file}: missing @version`);
    return [file, { version, sha256: sha256(source) }];
  }));
}

function versionParts(value) {
  return (String(value || "").match(/\d+/g) || []).map(Number);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

function validNumericManifestVersion(value) {
  const version = String(value || "");
  const parts = version.split(".");
  return /^\d+\.\d+\.\d+\.\d+$/.test(version)
    && parts.every((part) => Number(part) <= 65535 && (part.length === 1 || !part.startsWith("0")));
}

function laterVersion(left, right) {
  return compareVersions(left, right) >= 0 ? left : right;
}

function releaseFloors(current, previous = {}) {
  return {
    appVersion: laterVersion(current.appVersion, previous.appVersion || current.appVersion),
    manifestVersion: laterVersion(current.manifestVersion, previous.manifestVersion || current.manifestVersion),
    summaryConfigVersion: Math.max(current.summary.configVersion, Number(previous.summaryConfigVersion) || 0),
    summarySites: Object.fromEntries(Object.entries(current.summary.sites).map(([id, site]) => [
      id,
      Math.max(site.configVersion, Number(previous.summarySites?.[id]) || 0)
    ])),
    topicDelete: Object.fromEntries(Object.entries(current.topicDelete).map(([file, script]) => [
      file,
      laterVersion(script.version, previous.topicDelete?.[file] || script.version)
    ]))
  };
}

function computeVersionState(previousFloors = {}) {
  const manifest = JSON.parse(read("manifest.json"));
  const version = appVersion();
  const state = {
    schemaVersion: 4,
    appVersion: version,
    manifestVersion: manifest.version,
    payloads: {
      chromium: { appVersion: version, sha256: packageDigest(packagePlan("chromium")) },
      firefox: { appVersion: version, sha256: packageDigest(packagePlan("firefox")) }
    },
    contentRuntime: contentRuntimeState(),
    summary: summaryState(),
    topicDelete: deleteState()
  };
  state.floors = releaseFloors(state, previousFloors);
  return state;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function snapshotWriteErrors(previous, current) {
  const errors = contentRuntimeBindingErrors(current.contentRuntime);
  if (!validNumericManifestVersion(current.manifestVersion)) {
    errors.push("manifest.json version must be exactly four dot-separated integers from 0 to 65535 without leading zeroes");
  }
  if (![1, 2, 3, 4].includes(previous?.schemaVersion)) return errors;
  if (compareVersions(current.appVersion, previous.appVersion) < 0) errors.push("APP_VERSION must not move backwards");
  if (compareVersions(current.manifestVersion, previous.manifestVersion) < 0) errors.push("numeric Manifest version must not move backwards");
  const payloadChanged = ["chromium", "firefox"].some((target) =>
    previous.payloads?.[target]?.sha256 !== current.payloads[target].sha256
  );
  if (payloadChanged && compareVersions(current.appVersion, previous.appVersion) <= 0) {
    errors.push("release payload changed without increasing APP_VERSION");
  }
  if (payloadChanged && compareVersions(current.manifestVersion, previous.manifestVersion) <= 0) {
    errors.push("release payload changed without increasing numeric Manifest version");
  }
  for (const [id, site] of Object.entries(current.summary.sites)) {
    const baseline = previous.summary?.sites?.[id];
    if (baseline && baseline.sha256 !== site.sha256) {
      if (site.configVersion <= baseline.configVersion) errors.push(`Summary ${id} body changed without increasing configVersion`);
      if (current.summary.configVersion <= Number(previous.summary?.configVersion || 0)) {
        errors.push(`Summary ${id} body changed without increasing SUMMARY_SITE_CONFIG_VERSION`);
      }
    }
  }
  for (const [file, script] of Object.entries(current.topicDelete)) {
    const baseline = previous.topicDelete?.[file];
    if (baseline && baseline.sha256 !== script.sha256 && compareVersions(script.version, baseline.version) <= 0) {
      errors.push(`Delete userscript ${file} body changed without increasing @version`);
    }
  }
  return errors;
}

function verifyVersionState() {
  let actual;
  try {
    actual = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (error) {
    return [`version-state.json is missing or invalid: ${error.message}`];
  }
  const expected = computeVersionState(actual.floors);

  const errors = [];
  if (!validNumericManifestVersion(expected.manifestVersion)) {
    errors.push("manifest.json version must be exactly four dot-separated integers from 0 to 65535 without leading zeroes");
  }
  if (compareVersions(expected.appVersion, actual.floors?.appVersion) < 0) errors.push("APP_VERSION must not move backwards");
  if (compareVersions(expected.manifestVersion, actual.floors?.manifestVersion) < 0) errors.push("numeric Manifest version must not move backwards");
  if (expected.summary.configVersion < Number(actual.floors?.summaryConfigVersion || 0)) errors.push("SUMMARY_SITE_CONFIG_VERSION must not move backwards");
  const payloadChanged = ["chromium", "firefox"].some((target) =>
    actual.payloads?.[target]?.sha256 !== expected.payloads[target].sha256
  );
  if (payloadChanged && compareVersions(expected.manifestVersion, actual.manifestVersion) <= 0) {
    errors.push("release payload changed without increasing numeric Manifest version");
  }
  for (const [id, site] of Object.entries(expected.summary.sites)) {
    if (site.configVersion < Number(actual.floors?.summarySites?.[id] || 0)) errors.push(`Summary ${id} configVersion must not move backwards`);
  }
  for (const [file, script] of Object.entries(expected.topicDelete)) {
    if (compareVersions(script.version, actual.floors?.topicDelete?.[file]) < 0) errors.push(`Delete userscript ${file} @version must not move backwards`);
  }
  if (stableJson(actual) === stableJson(expected) && !errors.length) return [];
  if (actual.schemaVersion !== expected.schemaVersion) errors.push("version-state schemaVersion is stale");
  if (actual.appVersion !== expected.appVersion) errors.push("APP_VERSION changed without refreshing version-state");
  if (actual.manifestVersion !== expected.manifestVersion) errors.push("numeric Manifest version changed without refreshing version-state");
  for (const target of ["chromium", "firefox"]) {
    if (actual.payloads?.[target]?.sha256 !== expected.payloads[target].sha256) {
      errors.push(`${target} release payload changed; bump APP_VERSION and refresh version-state`);
    }
    if (actual.payloads?.[target]?.appVersion !== expected.appVersion) {
      errors.push(`${target} payload version does not equal APP_VERSION`);
    }
  }
  errors.push(...contentRuntimeBindingErrors(actual.contentRuntime));
  if (
    actual.contentRuntime?.sourceSchemaVersion !== expected.contentRuntime.sourceSchemaVersion
    || actual.contentRuntime?.sourceSha256 !== expected.contentRuntime.sourceSha256
    || actual.contentRuntime?.sourceFileCount !== expected.contentRuntime.sourceFileCount
    || actual.contentRuntime?.buildRecipeSchemaVersion !== expected.contentRuntime.buildRecipeSchemaVersion
    || actual.contentRuntime?.buildRecipeVersion !== expected.contentRuntime.buildRecipeVersion
    || actual.contentRuntime?.buildRecipeSha256 !== expected.contentRuntime.buildRecipeSha256
    || actual.contentRuntime?.buildRecipeFileCount !== expected.contentRuntime.buildRecipeFileCount
    || actual.contentRuntime?.protocolVersion !== expected.contentRuntime.protocolVersion
    || actual.contentRuntime?.implementationSha256 !== expected.contentRuntime.implementationSha256
    || actual.contentRuntime?.implementationVersion !== expected.contentRuntime.implementationVersion
    || stableJson(actual.contentRuntime?.bundles) !== stableJson(expected.contentRuntime.bundles)
  ) {
    errors.push("content runtime source/build-recipe identity state is stale; regenerate artifacts and refresh version-state");
  }
  if (actual.summary?.configVersion !== expected.summary.configVersion) {
    errors.push("SUMMARY_SITE_CONFIG_VERSION state is stale or regressed");
  }
  for (const [id, site] of Object.entries(expected.summary.sites)) {
    const baseline = actual.summary?.sites?.[id];
    if (baseline?.sha256 !== site.sha256 || baseline?.configVersion !== site.configVersion) {
      errors.push(`Summary ${id} body/config version state changed; bump its configVersion and the global version when semantic`);
    }
  }
  for (const [file, script] of Object.entries(expected.topicDelete)) {
    const baseline = actual.topicDelete?.[file];
    if (baseline?.sha256 !== script.sha256 || baseline?.version !== script.version) {
      errors.push(`Delete userscript ${file} body/version state changed; bump @version when semantic`);
    }
  }
  if (!errors.length) errors.push("version-state.json differs from the canonical deterministic snapshot");
  return errors;
}

if (require.main === module) {
  if (process.argv.includes("--write")) {
    let previous = null;
    let previousFloors = {};
    try {
      previous = JSON.parse(fs.readFileSync(statePath, "utf8"));
      previousFloors = previous.floors || {};
    } catch {}
    const next = computeVersionState(previousFloors);
    const errors = snapshotWriteErrors(previous, next);
    if (errors.length) {
      throw new Error(`Refusing to refresh version-state:\n- ${errors.join("\n- ")}`);
    }
    fs.writeFileSync(statePath, stableJson(next));
    console.log("Updated version-state.json.");
  } else {
    const errors = verifyVersionState();
    if (errors.length) {
      console.error("Version-state verification failed:");
      for (const error of errors) console.error(`  - ${error}`);
      process.exitCode = 1;
    } else {
      console.log("Version-state snapshot is current.");
    }
  }
}

module.exports = {
  compareVersions,
  validNumericManifestVersion,
  snapshotWriteErrors,
  contentRuntimeBindingErrors,
  contentRuntimeState,
  summaryState,
  deleteState,
  computeVersionState,
  verifyVersionState
};
