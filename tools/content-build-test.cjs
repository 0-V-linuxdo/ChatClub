#!/usr/bin/env node

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const {
  CONTENT_ENTRIES,
  CONTENT_RUNTIME_BUNDLE_EXPORT_NAMES,
  CONTENT_RUNTIME_VERSION_MODULE,
  FIREFOX_CONTENT_FALLBACK_OUTPUT
} = require("./generated-artifacts.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const outputs = Object.keys(CONTENT_ENTRIES);
const entries = outputs.map((file) => CONTENT_ENTRIES[file]);
const deterministicOutputs = [...outputs, CONTENT_RUNTIME_VERSION_MODULE, FIREFOX_CONTENT_FALLBACK_OUTPUT];
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
assert.match(generator, /FIREFOX_CONTENT_FALLBACK_OUTPUT/);
assert.match(generator, /chatclubFirefoxContentFallback/);
assert.match(generator, /contentRuntimeSourceState\(root\)/);
assert.match(generator, /contentRuntimeBundleSourceStates\(root\)/);
assert.match(generator, /contentRuntimeVersionModule/);

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
const runtimeVersionSource = read(CONTENT_RUNTIME_VERSION_MODULE);
const allowedAttestedBundleIdentities = Object.freeze({
  "content/summary-bridge.js": new Set([
    "content/summary-userscripts-main.js",
    "content/summary-userscripts.js"
  ])
});
const bundleDigests = Object.fromEntries(Object.entries(CONTENT_RUNTIME_BUNDLE_EXPORT_NAMES).map(([
  outputPath,
  exportName
]) => {
  const match = runtimeVersionSource.match(new RegExp(
    `export const ${exportName} = (?:/\\* @__PURE__ \\*/ )?Object\\.freeze\\((\\{[^\\n]+\\})\\);`
  ));
  assert.ok(match, `${exportName} must be generated for ${outputPath}`);
  return [outputPath, JSON.parse(match[1]).implementationSha256];
}));
for (const outputPath of outputs) {
  const source = read(outputPath);
  assert.ok(source.includes(bundleDigests[outputPath]), `${outputPath} must embed its own source-closure identity`);
  for (const [otherOutput, digest] of Object.entries(bundleDigests)) {
    if (
      otherOutput !== outputPath
      && !allowedAttestedBundleIdentities[outputPath]?.has(otherOutput)
    ) {
      assert.equal(
        source.includes(digest),
        false,
        `${outputPath} must not embed the identity of unrelated bundle ${otherOutput}`
      );
    }
  }
}
const firefoxFallbacks = read(FIREFOX_CONTENT_FALLBACK_OUTPUT);
assert.match(firefoxFallbacks, /export const FIREFOX_CONTENT_FALLBACKS = Object\.freeze/);
assert.equal(
  (firefoxFallbacks.match(/function chatclubFirefoxContentFallback/g) || []).length,
  outputs.length,
  "Firefox generated fallback must contain one self-contained function per content bundle"
);
assert.doesNotMatch(firefoxFallbacks, /\bimport\s*\(|\beval\s*\(|\bnew\s+Function\s*\(/);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatclub-clean-rebuild-"));
const first = path.join(temporaryRoot, "first");
const second = path.join(temporaryRoot, "second");
try {
  for (const destination of [first, second]) {
    fs.mkdirSync(destination, { recursive: true });
    execFileSync(process.execPath, [
      path.join(root, "tools/generate-artifacts.cjs"),
      "--content-only",
      "--output-root",
      destination
    ], { cwd: root, stdio: "pipe", timeout: 60_000 });
  }
  for (const output of deterministicOutputs) {
    const committedHash = hash(path.join(root, output));
    assert.equal(hash(path.join(first, output)), committedHash, `${output} clean rebuild drifted from the committed output`);
    assert.equal(hash(path.join(second, output)), committedHash, `${output} repeated clean rebuild was not deterministic`);
  }
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("content clean rebuild and shared runtime: ok");
