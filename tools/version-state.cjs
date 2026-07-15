#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
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

function summaryState() {
  const index = JSON.parse(read("userscripts/index.json"));
  return {
    configVersion: index.summarySiteConfigVersion,
    sites: Object.fromEntries(index.configs.map((config) => {
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
  const directory = path.join(root, "topic-delete-userscripts");
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".user.js")).sort();
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
    schemaVersion: 1,
    appVersion: version,
    manifestVersion: manifest.version,
    payloads: {
      chromium: { appVersion: version, sha256: packageDigest(packagePlan("chromium")) },
      firefox: { appVersion: version, sha256: packageDigest(packagePlan("firefox")) }
    },
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
  const errors = [];
  if (!validNumericManifestVersion(current.manifestVersion)) {
    errors.push("manifest.json version must be exactly four dot-separated integers from 0 to 65535 without leading zeroes");
  }
  if (previous?.schemaVersion !== 1) return errors;
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
  computeVersionState,
  verifyVersionState
};
