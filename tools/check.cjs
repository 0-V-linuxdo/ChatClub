#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { enforceNodeVersion } = require("./node-version.cjs");

const root = path.resolve(__dirname, "..");
enforceNodeVersion({ context: "Static verification", strict: true });
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

console.log("JSON syntax checks passed.");

run("node_modules/eslint/bin/eslint.js", ["app", "background", "shared", "ui", "content-src", "build-src", "tools"]);
run("tools/verify-modules.mjs");
run("tools/cjs-export-liveness.cjs");
run("tools/global-runtime-ownership-test.cjs");
run("tools/generate-artifacts.cjs", ["--check"]);
run("tools/verify-version.cjs");
run("tools/verify-manifest.cjs");
