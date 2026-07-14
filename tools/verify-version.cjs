#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function fail(message) {
  errors.push(message);
}

const constants = read("shared/constants.js");
const appVersionMatch = constants.match(/export const APP_VERSION\s*=\s*(["'])(.*?)\1\s*;/);
const summaryVersionMatch = constants.match(/export const SUMMARY_SITE_CONFIG_VERSION\s*=\s*(\d+)\s*;/);
if (!appVersionMatch) fail("shared/constants.js does not export a string APP_VERSION");
if (!summaryVersionMatch) fail("shared/constants.js does not export SUMMARY_SITE_CONFIG_VERSION");

const appVersion = appVersionMatch?.[2] || "";
const versionMatch = appVersion.match(/^「(\d{4})-(\d{2})-(\d{2})｜(\d{2}):(\d{2}):(\d{2})」$/);
if (!versionMatch) fail("APP_VERSION must use 「YYYY-MM-DD｜HH:MM:SS」 exactly");

const manifest = readJson("manifest.json");
const packageInfo = readJson("package-info.json");
const summaryIndex = readJson("userscripts/index.json");

if (manifest.version_name !== appVersion) fail("manifest.json version_name must equal APP_VERSION");
for (const field of ["version", "versionName", "label"]) {
  if (packageInfo[field] !== appVersion) fail(`package-info.json ${field} must equal APP_VERSION`);
}

const chromeVersion = String(manifest.version || "");
const chromeParts = chromeVersion.split(".");
if (!/^\d+(?:\.\d+){0,3}$/.test(chromeVersion)
  || chromeParts.some((part) => Number(part) > 65535 || (part.length > 1 && part.startsWith("0")))) {
  fail("manifest.json version must be 1-4 dot-separated integers from 0 to 65535 without leading zeroes");
}

if (versionMatch) {
  const [, year, month, day, hour, minute, second] = versionMatch;
  const expectedNumericPrefix = [year, String(Number(month)), String(Number(day))];
  if (chromeParts.slice(0, 3).join(".") !== expectedNumericPrefix.join(".")) {
    fail(`manifest.json version must start with release date ${expectedNumericPrefix.join(".")}`);
  }

  const packagedAt = new Date(packageInfo.packagedAt);
  if (!packageInfo.packagedAt || Number.isNaN(packagedAt.getTime())) {
    fail("package-info.json packagedAt must be a valid ISO timestamp");
  } else {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(packagedAt)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const actual = [parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second];
    const expected = [year, month, day, hour, minute, second];
    if (actual.join(":") !== expected.join(":")) {
      fail("package-info.json packagedAt must represent APP_VERSION time in Asia/Shanghai");
    }
    if (packageInfo.packagedAt !== packagedAt.toISOString()) {
      fail("package-info.json packagedAt must be a canonical ISO UTC timestamp");
    }
    if (packagedAt.getUTCMilliseconds() !== 0) {
      fail("package-info.json packagedAt must align to APP_VERSION whole seconds");
    }
  }
}

if (summaryVersionMatch && summaryIndex.summarySiteConfigVersion !== Number(summaryVersionMatch[1])) {
  fail("userscripts/index.json summarySiteConfigVersion must equal SUMMARY_SITE_CONFIG_VERSION");
}

if (errors.length) {
  console.error("Version verification failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Version metadata is consistent: ${appVersion}`);
}
