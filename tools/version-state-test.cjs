#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  CONTENT_ENTRIES,
  TOPIC_DELETE_OUTPUT_FILES,
  contentRuntimeBundleImplementationSha256
} = require("./generated-artifacts.cjs");
const {
  compareVersions,
  contentRuntimeBindingErrors,
  contentRuntimeState,
  validNumericManifestVersion,
  snapshotWriteErrors,
  summaryState,
  deleteState
} = require("./version-state.cjs");

const root = path.resolve(__dirname, "..");
const SOURCE_SHA256 = "a".repeat(64);
const RECIPE_SHA256 = "b".repeat(64);
const IMPLEMENTATION_SHA256 = require("./generated-artifacts.cjs").contentRuntimeImplementationSha256(
  "bridge-v1",
  SOURCE_SHA256,
  RECIPE_SHA256
);
const BUNDLES = Object.fromEntries(Object.entries(CONTENT_ENTRIES).map(([outputPath, entryPath]) => {
  const implementationSha256 = contentRuntimeBundleImplementationSha256(
    "bridge-v1",
    outputPath,
    SOURCE_SHA256,
    RECIPE_SHA256
  );
  return [outputPath, {
    entryPath,
    sourceSha256: SOURCE_SHA256,
    sourceFileCount: 1,
    virtualInputs: [],
    implementationSha256,
    implementationVersion: `bridge-v1+bundle.${implementationSha256}`
  }];
}));

function releaseState({
  appVersion,
  manifestVersion,
  chromium = "chromium-a",
  firefox = "firefox-a"
}) {
  return {
    schemaVersion: 4,
    appVersion,
    manifestVersion,
    payloads: {
      chromium: { appVersion, sha256: chromium },
      firefox: { appVersion, sha256: firefox }
    },
    contentRuntime: {
      sourceSchemaVersion: 1,
      sourceSha256: SOURCE_SHA256,
      sourceFileCount: 1,
      buildRecipeSchemaVersion: 1,
      buildRecipeVersion: `1+recipe.${RECIPE_SHA256}`,
      buildRecipeSha256: RECIPE_SHA256,
      buildRecipeFileCount: 2,
      protocolVersion: "bridge-v1",
      implementationSha256: IMPLEMENTATION_SHA256,
      implementationVersion: `bridge-v1+implementation.${IMPLEMENTATION_SHA256}`,
      bundles: BUNDLES
    },
    summary: { configVersion: 1, sites: {} },
    topicDelete: {}
  };
}

assert.deepEqual(contentRuntimeBindingErrors(releaseState({
  appVersion: "「2026-07-15｜05:09:57」",
  manifestVersion: "2026.7.15.1"
}).contentRuntime), []);
assert.deepEqual(contentRuntimeBindingErrors({
  sourceSha256: SOURCE_SHA256,
  buildRecipeSha256: RECIPE_SHA256,
  protocolVersion: "bridge-v1",
  implementationSha256: "c".repeat(64),
  implementationVersion: "bridge-v1",
  bundles: BUNDLES
}), [
  "content runtime implementation digest is not bound to protocol, author source, and build recipe",
  "content runtime implementation version is not bound to protocol, author source, and build recipe"
]);

assert.equal(compareVersions("2026.7.15.1", "2026.7.15"), 1, "four-part versions must upgrade legacy three-part releases");
assert.equal(compareVersions("2026.7.15.2", "2026.7.15.1"), 1);
assert.equal(compareVersions("2026.7.16.0", "2026.7.15.65535"), 1);
assert.equal(validNumericManifestVersion("2026.7.15"), false);
assert.equal(validNumericManifestVersion("2026.7.15.1"), true);
assert.equal(validNumericManifestVersion("2026.07.15.1"), false);
assert.equal(validNumericManifestVersion("2026.7.15.65536"), false);

const historical = releaseState({
  appVersion: "「2026-07-15｜05:09:57」",
  manifestVersion: "2026.7.15"
});
const sameNumericVersion = releaseState({
  appVersion: "「2026-07-15｜14:01:28」",
  manifestVersion: "2026.7.15",
  chromium: "chromium-b"
});
assert.deepEqual(snapshotWriteErrors(historical, sameNumericVersion), [
  "manifest.json version must be exactly four dot-separated integers from 0 to 65535 without leading zeroes",
  "release payload changed without increasing numeric Manifest version"
]);

const firstSequencedRelease = { ...sameNumericVersion, manifestVersion: "2026.7.15.1" };
assert.deepEqual(snapshotWriteErrors(historical, firstSequencedRelease), []);
const numericOnly = releaseState({
  appVersion: historical.appVersion,
  manifestVersion: "2026.7.15.1",
  firefox: "firefox-b"
});
assert.ok(snapshotWriteErrors(historical, numericOnly).includes(
  "release payload changed without increasing APP_VERSION"
));
const secondSameDayRelease = releaseState({
  appVersion: "「2026-07-15｜19:31:33」",
  manifestVersion: "2026.7.15.2",
  chromium: "chromium-c"
});
assert.deepEqual(snapshotWriteErrors(firstSequencedRelease, secondSameDayRelease), []);

const reusedSequence = { ...secondSameDayRelease, manifestVersion: "2026.7.15.1" };
assert.ok(snapshotWriteErrors(firstSequencedRelease, reusedSequence).includes(
  "release payload changed without increasing numeric Manifest version"
));

const summaryIndex = JSON.parse(fs.readFileSync(path.join(root, "userscripts/index.json"), "utf8"));
const actualSummaryState = summaryState();
assert.equal(actualSummaryState.configVersion, summaryIndex.summarySiteConfigVersion);
assert.deepEqual(
  Object.keys(actualSummaryState.sites).sort(),
  summaryIndex.configs.map((config) => config.id).sort(),
  "version snapshot must track every canonical Summary source"
);

const actualDeleteState = deleteState();
assert.deepEqual(
  Object.keys(actualDeleteState).sort(),
  TOPIC_DELETE_OUTPUT_FILES.map((file) => path.posix.basename(file)).sort(),
  "version snapshot must track exactly the declared Delete userscript outputs"
);

const actualContentRuntimeState = contentRuntimeState();
assert.match(actualContentRuntimeState.sourceSha256, /^[a-f0-9]{64}$/);
assert.equal(
  actualContentRuntimeState.implementationVersion,
  `${actualContentRuntimeState.protocolVersion}+implementation.${actualContentRuntimeState.implementationSha256}`,
  "version-state must derive the content implementation version from protocol, author source, and build recipe"
);
assert.deepEqual(Object.keys(actualContentRuntimeState.bundles), Object.keys(CONTENT_ENTRIES).sort());

console.log("release version history and same-day sequencing: ok");
