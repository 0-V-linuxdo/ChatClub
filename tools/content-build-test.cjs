#!/usr/bin/env node

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const outputs = [
  "content/content.js",
  "content/preload.js",
  "content/summary-userscripts.js",
  "content/summary-userscripts-main.js",
  "content/message-navigator.js",
  "content/grok-cookie-bridge.js"
];
const entries = outputs.map((file) => file.replace(/^content\//, "content-src/"));
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.devDependencies.esbuild, "0.28.1");
const generator = read("tools/generate-artifacts.cjs");
assert.match(generator, /target: \["chrome120", "firefox136"\]/);
assert.match(generator, /format: "iife"/);
assert.match(generator, /splitting: false/);
assert.match(generator, /minify: false/);
assert.match(generator, /sourcemap: false/);
assert.doesNotMatch(generator, /read\(["']content\//, "generator must never read a generated content output as a template");

for (const entry of entries) assert.ok(fs.existsSync(path.join(root, entry)), `${entry} must exist`);
assert.match(read("content-src/content.js"), /\.\/shared\/summary-runtime\.js/);
assert.match(read("content-src/summary-userscripts-main.js"), /\.\/shared\/summary-runtime\.js/);
assert.equal(
  (read("content-src/content.js").match(/function extractNativeCopyConversation/g) || []).length,
  0,
  "content entry must consume the shared Summary runtime"
);
assert.equal(
  (read("content-src/summary-userscripts-main.js").match(/function extractNativeCopyConversation/g) || []).length,
  0,
  "MAIN Summary entry must consume the shared Summary runtime"
);
assert.match(read("content-src/shared/summary-runtime.js"), /function extractNativeCopyConversation/);

for (const output of outputs) {
  const source = read(output);
  assert.doesNotThrow(() => new vm.Script(source, { filename: output }), `${output} must be a classic script`);
  assert.doesNotMatch(source, /\bimport\s*\(|\beval\s*\(|\bnew\s+Function\s*\(/);
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatclub-clean-rebuild-"));
const first = path.join(temporaryRoot, "first");
const second = path.join(temporaryRoot, "second");
try {
  for (const destination of [first, second]) {
    execFileSync(process.execPath, [
      path.join(root, "tools/generate-artifacts.cjs"),
      "--content-only",
      "--output-root",
      destination
    ], { cwd: root, stdio: "pipe", timeout: 60_000 });
  }
  for (const output of outputs) {
    const committedHash = hash(path.join(root, output));
    assert.equal(hash(path.join(first, output)), committedHash, `${output} clean rebuild drifted from the committed output`);
    assert.equal(hash(path.join(second, output)), committedHash, `${output} repeated clean rebuild was not deterministic`);
  }
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("content clean rebuild and shared runtime: ok");
