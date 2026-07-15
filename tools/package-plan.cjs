const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { targetManifest } = require("./manifest-targets.cjs");

const root = path.resolve(__dirname, "..");
const exactFiles = Object.freeze(["chatClub.html", "manifest.json", "package-info.json"]);
const trees = Object.freeze({
  "_locales": new Set([".json"]),
  app: new Set([".js"]),
  background: new Set([".js"]),
  content: new Set([".js"]),
  icons: new Set([".png", ".svg"]),
  shared: new Set([".js"]),
  styles: new Set([".css"]),
  "topic-delete-userscripts": new Set([".js"]),
  ui: new Set([".js"]),
  userscripts: new Set([".js", ".json"])
});

function safeRelative(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe package path: ${relativePath}`);
  }
  return normalized;
}

function collectTree(directory, extensions, prefix = directory) {
  const absolute = path.join(root, directory);
  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Pack allowlist directory is missing: ${directory}`);
  }
  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = safeRelative(`${prefix}/${entry.name}`);
    if (entry.isDirectory()) files.push(...collectTree(path.join(directory, entry.name), extensions, relative));
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) files.push(relative);
  }
  return files;
}

function allowlistedFiles() {
  const files = [...exactFiles];
  for (const [directory, extensions] of Object.entries(trees)) files.push(...collectTree(directory, extensions));
  const unique = [...new Set(files.map(safeRelative))].sort();
  for (const file of unique) {
    if (!fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Pack allowlist file is missing: ${file}`);
    }
    if (/^(?:output|dist)(?:\/|$)/.test(file)) throw new Error(`Unsafe pack entry: ${file}`);
  }
  return unique;
}

function targetFileAllowed(file, target) {
  if (file === "shared/topic-delete-userscript-sources.js") return false;
  if (target === "chromium" && file === "background/firefox-background.js") return false;
  return true;
}

function packagePlan(target = "chromium") {
  if (!new Set(["chromium", "firefox"]).has(target)) throw new Error(`Unknown extension target: ${target}`);
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const manifest = targetManifest(sourceManifest, target);
  const files = allowlistedFiles().filter((file) => targetFileAllowed(file, target));
  const overrides = new Map([
    ["manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)]
  ]);
  return Object.freeze({ target, files: Object.freeze(files), manifest: Object.freeze(manifest), overrides });
}

function packageFileBytes(plan, file) {
  return plan.overrides.has(file) ? plan.overrides.get(file) : fs.readFileSync(path.join(root, file));
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
  safeRelative,
  collectTree,
  allowlistedFiles,
  targetFileAllowed,
  packagePlan,
  packageFileBytes,
  packageDigest,
  materializePackagePlan,
  runtimeModuleEntries
};
