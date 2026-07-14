#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { targetManifest } = require("./manifest-targets.cjs");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "manifest.json");
const errors = [];
const references = new Set();
const ignoredDirectories = new Set([".git", ".cache", "build", "dist", "node_modules", "output"]);

function fail(message) {
  errors.push(message);
}

function addReference(value, owner) {
  if (typeof value !== "string" || !value || /^(?:[a-z]+:|\/\/)/i.test(value)) return;
  const clean = value.split(/[?#]/, 1)[0];
  if (!clean) return;
  if (path.posix.isAbsolute(clean) || clean.split("/").includes("..")) {
    fail(`${owner} contains unsafe path ${value}`);
    return;
  }
  references.add(clean.replace(/^\.\//, ""));
}

function addIconSet(value, owner) {
  if (typeof value === "string") addReference(value, owner);
  else if (value && typeof value === "object") {
    for (const [size, file] of Object.entries(value)) addReference(file, `${owner}.${size}`);
  }
}

function walkFiles(directory, prefix = "") {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) output.push(...walkFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) output.push(relative);
  }
  return output;
}

function globRegex(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`manifest.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (manifest.manifest_version !== 3) fail("manifest_version must be 3");
addIconSet(manifest.icons, "icons");
addIconSet(manifest.action?.default_icon, "action.default_icon");
addReference(manifest.action?.default_popup, "action.default_popup");
addReference(manifest.background?.service_worker, "background.service_worker");
for (const file of manifest.background?.scripts || []) addReference(file, "background.scripts");
addReference(manifest.background?.page, "background.page");
addReference(manifest.options_page, "options_page");
addReference(manifest.options_ui?.page, "options_ui.page");
addReference(manifest.devtools_page, "devtools_page");
addReference(manifest.side_panel?.default_path, "side_panel.default_path");
addReference(manifest.sidebar_action?.default_panel, "sidebar_action.default_panel");
addIconSet(manifest.sidebar_action?.default_icon, "sidebar_action.default_icon");
for (const [key, file] of Object.entries(manifest.chrome_url_overrides || {})) addReference(file, `chrome_url_overrides.${key}`);
for (const script of manifest.content_scripts || []) {
  for (const file of script.js || []) addReference(file, "content_scripts.js");
  for (const file of script.css || []) addReference(file, "content_scripts.css");
}
for (const page of manifest.sandbox?.pages || []) addReference(page, "sandbox.pages");
for (const resource of manifest.declarative_net_request?.rule_resources || []) addReference(resource.path, "declarative_net_request.rule_resources.path");
for (const group of manifest.web_accessible_resources || []) {
  for (const file of group.resources || []) addReference(file, "web_accessible_resources.resources");
}

const allFiles = walkFiles(root);
for (const reference of references) {
  if (/[?*]/.test(reference)) {
    const matches = allFiles.filter((file) => globRegex(reference).test(file));
    if (!matches.length) fail(`manifest wildcard ${reference} matches no files`);
  } else if (!fs.statSync(path.join(root, reference), { throwIfNoEntry: false })?.isFile()) {
    fail(`manifest references missing file ${reference}`);
  }
}

const defaultLocale = manifest.default_locale;
if (defaultLocale) addReference(`_locales/${defaultLocale}/messages.json`, "default_locale");
const localeDirectories = fs.existsSync(path.join(root, "_locales"))
  ? fs.readdirSync(path.join(root, "_locales"), { withFileTypes: true }).filter((entry) => entry.isDirectory())
  : [];
const messageKeys = new Set();
JSON.stringify(manifest).replace(/__MSG_([A-Za-z0-9_@]+)__/g, (_, key) => {
  messageKeys.add(key);
  return _;
});
for (const locale of localeDirectories) {
  const relativePath = `_locales/${locale.name}/messages.json`;
  try {
    const messages = JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
    for (const key of messageKeys) {
      if (!messages[key]?.message) fail(`${relativePath} is missing manifest message ${key}`);
    }
  } catch (error) {
    fail(`${relativePath} is invalid: ${error.message}`);
  }
}

for (const reference of [...references].filter((file) => /\.html?$/i.test(file) && !/[?*]/.test(file))) {
  const html = fs.readFileSync(path.join(root, reference), "utf8");
  const attributePattern = /\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi;
  for (const match of html.matchAll(attributePattern)) addReference(match[2], `${reference} HTML reference`);
}
for (const reference of references) {
  if (!/[?*]/.test(reference) && !fs.statSync(path.join(root, reference), { throwIfNoEntry: false })?.isFile()) {
    fail(`referenced file does not exist: ${reference}`);
  }
}

if (manifest.background?.type === "module" && !manifest.background?.service_worker) {
  fail("background.type=module requires background.service_worker");
}

if ((manifest.permissions || []).includes("userScripts")) fail("userScripts must be optional for Firefox compatibility");
if (!(manifest.optional_permissions || []).includes("userScripts")) fail("optional_permissions must declare userScripts");
if ((manifest.permissions || []).includes("windows")) fail("windows is not a valid cross-browser API permission");
if (manifest.declarative_net_request?.rule_resources?.length === 0) fail("empty DNR rule_resources is invalid in Firefox");

const firefox = targetManifest(manifest, "firefox");
const chromium = targetManifest(manifest, "chromium");
if (!chromium.background?.service_worker || chromium.background?.scripts) fail("Chromium target must use only the service worker entry");
if (firefox.background?.service_worker) fail("Firefox target must use the document background entry only");
if (!firefox.background?.scripts?.includes("background/firefox-background.js")) fail("Firefox target background entry is missing");
for (const permission of ["debugger", "favicon", "windows"]) {
  if ((firefox.permissions || []).includes(permission)) fail(`Firefox target contains Chromium-only permission ${permission}`);
}
if (!firefox.browser_specific_settings?.gecko?.id) fail("Firefox target requires a Gecko add-on id");
if (!(firefox.browser_specific_settings?.gecko?.data_collection_permissions?.required || []).length) {
  fail("Firefox target requires a data collection declaration");
}

if (errors.length) {
  console.error("Manifest verification failed:");
  for (const error of [...new Set(errors)]) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Manifest references are complete (${references.size} paths/patterns checked).`);
}
