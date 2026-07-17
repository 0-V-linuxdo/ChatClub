#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { enforceNodeVersion } = require("./node-version.cjs");
const { packagePlan, materializePackagePlan } = require("./package-plan.cjs");

const root = path.resolve(__dirname, "..");
enforceNodeVersion({ context: "Development extension build", strict: true });

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

const target = flagValue("--target") || "chromium";
if (!new Set(["chromium", "firefox"]).has(target)) throw new Error(`Unknown extension target: ${target}`);
const outputName = flagValue("--name") || `dev-extension-${target}`;
if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(outputName)) throw new Error("--name must be a safe output directory name");

const outputDirectory = path.join(root, "output");
const destination = path.join(outputDirectory, outputName);
fs.mkdirSync(outputDirectory, { recursive: true });
fs.rmSync(destination, { recursive: true, force: true });
materializePackagePlan(packagePlan(target), destination);

const generation = spawnSync(process.execPath, [
  "tools/generate-artifacts.cjs",
  "--content-only",
  "--output-root",
  destination,
  "--sourcemap"
], {
  cwd: root,
  stdio: "inherit"
});
if (generation.error) throw generation.error;
if (generation.status !== 0) process.exit(generation.status ?? 1);

console.log(`Development ${target} extension with content source maps: ${path.relative(root, destination)}`);
