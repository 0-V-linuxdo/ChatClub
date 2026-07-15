#!/usr/bin/env node

const assert = require("node:assert/strict");
const {
  compareVersions,
  validNumericManifestVersion,
  snapshotWriteErrors
} = require("./version-state.cjs");

function releaseState({
  appVersion,
  manifestVersion,
  chromium = "chromium-a",
  firefox = "firefox-a"
}) {
  return {
    schemaVersion: 1,
    appVersion,
    manifestVersion,
    payloads: {
      chromium: { appVersion, sha256: chromium },
      firefox: { appVersion, sha256: firefox }
    },
    summary: { configVersion: 1, sites: {} },
    topicDelete: {}
  };
}

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

console.log("release version history and same-day sequencing: ok");
