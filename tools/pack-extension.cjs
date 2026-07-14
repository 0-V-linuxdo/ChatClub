#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { targetManifest } = require("./manifest-targets.cjs");

const root = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");
const exactFiles = ["chatClub.html", "manifest.json", "package-info.json"];
const trees = {
  "_locales": new Set([".json"]),
  app: new Set([".js"]),
  background: new Set([".js"]),
  content: new Set([".js"]),
  icons: new Set([".png", ".svg"]),
  shared: new Set([".js"]),
  styles: new Set([".css"]),
  "topic-delete-userscripts": new Set([".js"]),
  ui: new Set([".js"])
};

function collectTree(directory, extensions, prefix = directory) {
  const absolute = path.join(root, directory);
  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Pack allowlist directory is missing: ${directory}`);
  }
  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...collectTree(path.join(directory, entry.name), extensions, relative));
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) files.push(relative);
  }
  return files;
}

function allowlistedFiles() {
  const files = [...exactFiles];
  for (const [directory, extensions] of Object.entries(trees)) {
    files.push(...collectTree(directory, extensions));
  }
  for (const file of files) {
    if (!fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Pack allowlist file is missing: ${file}`);
    }
    if (file === "output" || file.startsWith("output/") || file === "dist" || file.startsWith("dist/")) {
      throw new Error(`Unsafe pack entry: ${file}`);
    }
  }
  return [...new Set(files)].sort();
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files, overrides = new Map()) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file, "utf8");
    const data = overrides.has(file) ? overrides.get(file) : fs.readFileSync(path.join(root, file));
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function outputArgument() {
  const index = process.argv.indexOf("--output");
  if (index < 0) return null;
  if (!process.argv[index + 1]) throw new Error("--output requires a path");
  return path.resolve(process.cwd(), process.argv[index + 1]);
}

function targetArgument() {
  const index = process.argv.indexOf("--target");
  if (index < 0) return "chromium";
  const target = process.argv[index + 1];
  if (!target) throw new Error("--target requires chromium or firefox");
  if (!new Set(["chromium", "firefox"]).has(target)) throw new Error(`Unknown extension target: ${target}`);
  return target;
}

function targetFileAllowed(file, target) {
  if (target === "firefox" && file === "background/trusted-input.js") return false;
  if (target === "chromium" && file === "background/firefox-background.js") return false;
  return true;
}

const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const target = targetArgument();
const files = allowlistedFiles().filter((file) => targetFileAllowed(file, target));
const manifest = targetManifest(sourceManifest, target);
const overrides = new Map([["manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)]]);
const archive = zip(files, overrides);
const secondArchive = zip(files, overrides);
if (!archive.equals(secondArchive)) throw new Error("Deterministic archive verification failed");
const digest = crypto.createHash("sha256").update(archive).digest("hex");

if (checkOnly) {
  const otherTarget = target === "chromium" ? "firefox" : "chromium";
  const otherFiles = allowlistedFiles().filter((file) => targetFileAllowed(file, otherTarget));
  const otherManifest = targetManifest(sourceManifest, otherTarget);
  const otherOverrides = new Map([["manifest.json", Buffer.from(`${JSON.stringify(otherManifest, null, 2)}\n`)]]);
  const otherArchive = zip(otherFiles, otherOverrides);
  const otherSecondArchive = zip(otherFiles, otherOverrides);
  if (!otherArchive.equals(otherSecondArchive)) throw new Error(`${otherTarget} deterministic archive verification failed`);
  const otherDigest = crypto.createHash("sha256").update(otherArchive).digest("hex");
  console.log(`Pack allowlist is deterministic (${target} ${files.length} files sha256 ${digest}; ${otherTarget} ${otherFiles.length} files sha256 ${otherDigest}).`);
} else {
  const suffix = target === "chromium" ? "" : `-${target}`;
  const output = outputArgument() || path.join(root, "dist", `chatclub-${manifest.version}${suffix}.zip`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, archive);
  console.log(`Packed ${files.length} files for ${target} to ${path.relative(root, output)}`);
  console.log(`sha256 ${digest}`);
}
