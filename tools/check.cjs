#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const ignoredDirectories = new Set([".git", ".cache", "build", "dist", "node_modules", "output"]);

function filesUnder(directory, relative = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(absolute, childRelative));
    else if (entry.isFile()) files.push(childRelative);
  }
  return files;
}

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const files = filesUnder(root).sort();
for (const file of files.filter((file) => file.endsWith(".json"))) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  } catch (error) {
    console.error(`${file}: invalid JSON: ${error.message}`);
    process.exit(1);
  }
}

const javascriptFiles = files.filter((file) => /\.(?:c?js|mjs)$/.test(file));
for (const file of javascriptFiles) {
  const rawSource = fs.readFileSync(path.join(root, file), "utf8");
  const source = file.startsWith("userscripts/") && file.endsWith(".js")
    ? `async function __chatclubSummaryUserscriptSyntaxCheck(api) {\n${rawSource}\n}\n`
    : rawSource;
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`${file}: syntax check failed`);
    process.stderr.write(result.stderr || result.stdout || "");
    process.exit(result.status ?? 1);
  }
}
console.log(`Syntax and JSON checks passed (${javascriptFiles.length} JavaScript files).`);

const importPattern = /(?:\bimport\s+(?:[^"']*?\s+from\s+)?|\bexport\s+[^"']*?\s+from\s+|\bimport\s*\()\s*["'](\.[^"']+)["']/g;
for (const file of javascriptFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  for (const match of source.matchAll(importPattern)) {
    const target = path.resolve(path.dirname(path.join(root, file)), match[1]);
    if (!fs.statSync(target, { throwIfNoEntry: false })?.isFile()) {
      console.error(`${file}: unresolved relative import ${match[1]}`);
      process.exit(1);
    }
  }
}
console.log("Relative JavaScript imports resolve.");

run("tools/generate-artifacts.cjs", ["--check"]);
run("tools/verify-version.cjs");
run("tools/verify-manifest.cjs");
