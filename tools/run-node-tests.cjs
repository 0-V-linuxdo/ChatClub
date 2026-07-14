#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const toolsDirectory = path.join(root, "tools");
const tests = fs.readdirSync(toolsDirectory)
  .filter((name) => name.endsWith("-test.js"))
  .filter((name) => fs.readFileSync(path.join(toolsDirectory, name), "utf8").startsWith("#!/usr/bin/env node\n"))
  .sort()
  .map((name) => `tools/${name}`);

if (!tests.length) throw new Error("No Node regression scripts were discovered");

for (const test of tests) {
  console.log(`\n> ${test}`);
  const result = spawnSync(process.execPath, [test], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`\n${tests.length} Node regression scripts passed.`);
