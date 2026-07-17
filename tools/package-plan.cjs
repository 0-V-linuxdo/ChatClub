const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { targetManifest } = require("./manifest-targets.cjs");
const {
  GENERATED_ARTIFACT_FILES,
  assertGeneratedArtifactInventory
} = require("./generated-artifacts.cjs");
const { assertContainedDirectory, assertContainedRegularFile } = require("./repository-files.cjs");

const root = path.resolve(__dirname, "..");
const SUMMARY_USERSCRIPT_FILES = Object.freeze((() => {
  const indexPath = assertContainedRegularFile(root, "userscripts/index.json", {
    missingPrefix: "Summary userscript index is missing",
    symlinkPrefix: "Summary userscript index is a symbolic link",
    escapePrefix: "Summary userscript index escapes package root",
    componentPrefix: "Summary userscript index contains a symbolic link component"
  });
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const files = (Array.isArray(index.configs) ? index.configs : []).map((config) => {
    const filename = String(config?.userscriptFile || "");
    const file = safeRelative(`userscripts/${filename}`);
    if (!/^userscripts\/[a-z0-9][a-z0-9._-]*\.js$/i.test(file)) {
      throw new Error(`Unsafe Summary userscript package path: ${filename}`);
    }
    return file;
  });
  if (!files.length || new Set(files).size !== files.length) {
    throw new Error("Summary userscript package inventory must be non-empty and unique");
  }
  return files.sort();
})());
const exactFiles = Object.freeze([
  "chatClub.html",
  "options.html",
  "manifest.json",
  "package-info.json",
  ...SUMMARY_USERSCRIPT_FILES,
  ...GENERATED_ARTIFACT_FILES
]);
const trees = Object.freeze({
  "_locales": new Set([".json"]),
  app: new Set([".js"]),
  background: new Set([".js"]),
  icons: new Set([".png", ".svg"]),
  shared: new Set([".js"]),
  styles: new Set([".css"]),
  ui: new Set([".js"])
});
const PACKAGED_NATIVE_ESM_REACHABILITY_ALLOWLIST = Object.freeze({});
const SOURCE_ONLY_FILES = new Set([
  "shared/storage.js",
  "build-src/topic-delete-userscript-sources.js",
  "userscripts/index.json"
]);

function safeRelative(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe package path: ${relativePath}`);
  }
  return normalized;
}

function assertPackagedRegularFile(baseRoot, relativePath) {
  const file = safeRelative(relativePath);
  return assertContainedRegularFile(baseRoot, file, {
    missingPrefix: "Pack allowlist file is missing",
    symlinkPrefix: "Unsafe pack entry is a symbolic link",
    escapePrefix: "Unsafe pack entry escapes package root",
    componentPrefix: "Unsafe pack entry contains a symbolic link component"
  });
}

function assertPackagedDirectory(baseRoot, relativePath) {
  return assertContainedDirectory(baseRoot, relativePath, { prefix: "Pack allowlist directory" });
}

function collectTree(directory, extensions, prefix = directory) {
  const absolute = assertPackagedDirectory(root, directory);
  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = safeRelative(`${prefix}/${entry.name}`);
    if (entry.isSymbolicLink()) throw new Error(`Pack allowlist tree contains a symbolic link: ${relative}`);
    if (entry.isDirectory()) files.push(...collectTree(path.join(directory, entry.name), extensions, relative));
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) files.push(relative);
  }
  return files;
}

function allowlistedFiles() {
  assertGeneratedArtifactInventory(root);
  const files = [...exactFiles];
  for (const [directory, extensions] of Object.entries(trees)) files.push(...collectTree(directory, extensions));
  const unique = [...new Set(files.map(safeRelative))].sort();
  for (const file of unique) {
    assertPackagedRegularFile(root, file);
    if (/^(?:output|dist)(?:\/|$)/.test(file)) throw new Error(`Unsafe pack entry: ${file}`);
  }
  return unique;
}

function targetFileAllowed(file, target) {
  if (SOURCE_ONLY_FILES.has(file)) return false;
  if (target === "chromium" && (
    file === "background/firefox-background.js"
    || file === "background/firefox-content-fallback-loader.js"
    || file === "background/firefox-content-fallbacks.generated.js"
  )) return false;
  return true;
}

function packagePlan(target = "chromium") {
  if (!new Set(["chromium", "firefox"]).has(target)) throw new Error(`Unknown extension target: ${target}`);
  const sourceManifest = JSON.parse(fs.readFileSync(assertPackagedRegularFile(root, "manifest.json"), "utf8"));
  const manifest = targetManifest(sourceManifest, target);
  const files = allowlistedFiles().filter((file) => targetFileAllowed(file, target));
  const overrides = new Map([
    ["manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)]
  ]);
  return Object.freeze({ target, files: Object.freeze(files), manifest: Object.freeze(manifest), overrides });
}

function packageFileBytes(plan, file) {
  return plan.overrides.has(file)
    ? plan.overrides.get(file)
    : fs.readFileSync(assertPackagedRegularFile(root, file));
}

function packageDigest(plan) {
  const hash = crypto.createHash("sha256");
  for (const file of plan.files) {
    const data = packageFileBytes(plan, file);
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(data.length));
    hash.update(file).update("\0").update(length).update(data);
  }
  return hash.digest("hex");
}

function materializePackagePlan(plan, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const file of plan.files) {
    const target = path.join(destination, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, packageFileBytes(plan, file));
  }
  return destination;
}

function runtimeModuleEntries(plan) {
  const entries = new Set(["app/main.js"]);
  if (plan.target === "chromium") entries.add(plan.manifest.background.service_worker);
  else for (const file of plan.manifest.background.scripts || []) entries.add(file);
  return [...entries].filter(Boolean).sort();
}

module.exports = {
  root,
  exactFiles,
  trees,
  SUMMARY_USERSCRIPT_FILES,
  PACKAGED_NATIVE_ESM_REACHABILITY_ALLOWLIST,
  safeRelative,
  assertPackagedRegularFile,
  assertPackagedDirectory,
  collectTree,
  allowlistedFiles,
  targetFileAllowed,
  packagePlan,
  packageFileBytes,
  packageDigest,
  materializePackagePlan,
  runtimeModuleEntries
};
