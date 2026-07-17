#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const {
  CONTENT_ENTRIES,
  CONTENT_RUNTIME_BUNDLE_EXPORT_NAMES
} = require("./generated-artifacts.cjs");

const root = path.resolve(__dirname, "..");
const coreCapabilityOutputs = [
  "content/content.js",
  "content/send.js",
  "content/summary-bridge.js",
  "content/preferred-model.js",
  "content/delete.js"
];
const measuredOutputs = Object.keys(CONTENT_ENTRIES).sort();
const byteBudgets = Object.freeze({
  "content/content.js": 100_000,
  "content/send.js": 85_000,
  "content/summary-bridge.js": 92_000,
  "content/preferred-model.js": 165_000,
  "content/delete.js": 215_000,
  "content/grok-cookie-bridge.js": 50_000,
  "content/message-navigator.js": 140_000,
  "content/preload.js": 210_000,
  "content/summary-userscripts-main.js": 205_000,
  "content/summary-userscripts.js": 152_000
});
const aggregateByteBudget = 630_000;
const allBundlesByteBudget = 1_350_000;

const bundleIdentities = Object.fromEntries(Object.keys(CONTENT_ENTRIES).map((outputPath) => [
  outputPath,
  {
    outputPath,
    entryPath: CONTENT_ENTRIES[outputPath],
    sourceSha256: "s".repeat(64),
    implementationSha256: "i".repeat(64),
    implementationVersion: "size-probe"
  }
]));
const identityModule = [
  'export const CONTENT_RUNTIME_PROTOCOL_VERSION = "size-probe";',
  'export const CONTENT_RUNTIME_BUILD_RECIPE_SHA256 = "r".repeat(64);',
  "export const CONTENT_RUNTIME_BUILD_RECIPE_VERSION = 1;",
  'export const CONTENT_RUNTIME_IMPLEMENTATION_SHA256 = "i".repeat(64);',
  'export const CONTENT_RUNTIME_IMPLEMENTATION_VERSION = "size-probe";',
  'export const CONTENT_RUNTIME_SOURCE_SHA256 = "s".repeat(64);',
  'export const CONTENT_RUNTIME_REGISTRY_KEY = "__CHATCLUB_RUNTIME_REGISTRY_SIZE_PROBE__";',
  `export const CONTENT_RUNTIME_BUNDLE_IDENTITIES = /* @__PURE__ */ Object.freeze(${JSON.stringify(bundleIdentities)});`,
  ...Object.entries(CONTENT_RUNTIME_BUNDLE_EXPORT_NAMES).map(([outputPath, exportName]) => (
    `export const ${exportName} = /* @__PURE__ */ Object.freeze(${JSON.stringify(bundleIdentities[outputPath])});`
  ))
].join("\n");
const identityStubPlugin = {
  name: "content-runtime-identity-size-stub",
  setup(build) {
    build.onResolve({ filter: /content-runtime-version\.generated\.js$/ }, () => ({
      path: "content-runtime-version.generated.js",
      namespace: "identity-size-stub"
    }));
    build.onLoad({ filter: /.*/, namespace: "identity-size-stub" }, () => ({
      contents: identityModule,
      loader: "js"
    }));
  }
};

function summaryBody(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n?/g, "\n");
  const header = source.match(/^(?:\/\/[^\n]*\n)+\s*/);
  assert.ok(header && /Summary userscript/.test(header[0]), `${relativePath} must have a Summary userscript header`);
  return source.slice(header[0].length).trim();
}

const summaryIndex = JSON.parse(fs.readFileSync(path.join(root, "userscripts/index.json"), "utf8"));
const summaryRegistryModule = [
  "export function createSummaryRunnerRegistry() {",
  "  const scripts = Object.create(null);",
  ...summaryIndex.configs.flatMap((config) => [
    `  scripts[${JSON.stringify(config.id)}] = async function(api) {`,
    summaryBody(`userscripts/${config.userscriptFile}`),
    "  };",
    `  scripts[${JSON.stringify(config.userscriptFile)}] = scripts[${JSON.stringify(config.id)}];`
  ]),
  '  Object.defineProperty(scripts, "runtimeVersion", { value: "size-probe" });',
  "  return scripts;",
  "}"
].join("\n");
const summaryRegistryPlugin = {
  name: "summary-registry-size-input",
  setup(build) {
    build.onResolve({ filter: /^chatclub:summary-registry$/ }, () => ({
      path: "summary-registry",
      namespace: "summary-registry-size-input"
    }));
    build.onLoad({ filter: /.*/, namespace: "summary-registry-size-input" }, () => ({
      contents: summaryRegistryModule,
      loader: "js",
      resolveDir: root
    }));
  }
};

(async () => {
  const sizes = {};
  for (const outputPath of measuredOutputs) {
    const result = await esbuild.build({
      absWorkingDir: root,
      entryPoints: [CONTENT_ENTRIES[outputPath]],
      bundle: true,
      format: "iife",
      target: ["chrome120", "firefox136"],
      minify: false,
      sourcemap: false,
      metafile: true,
      write: false,
      logLevel: "silent",
      plugins: [identityStubPlugin, summaryRegistryPlugin]
    });
    assert.equal(result.outputFiles.length, 1);
    const outputBytes = result.outputFiles[0].contents.byteLength;
    const metafileBytes = Object.values(result.metafile.outputs).reduce((sum, output) => sum + output.bytes, 0);
    assert.equal(outputBytes, metafileBytes, `${outputPath} metafile/output byte accounting drifted`);
    sizes[outputPath] = outputBytes;
    assert.ok(
      outputBytes <= byteBudgets[outputPath],
      `${outputPath} exceeded its ${byteBudgets[outputPath]} byte bundle budget: ${outputBytes}`
    );
    if (process.env.CHATCLUB_SHOW_CONTENT_BUNDLE_INPUTS === "1") {
      const inputs = Object.values(result.metafile.outputs)[0]?.inputs || {};
      const largest = Object.entries(inputs)
        .map(([file, value]) => [file, value.bytesInOutput])
        .sort((left, right) => right[1] - left[1])
        .slice(0, 10);
      console.log(`${outputPath} inputs: ${JSON.stringify(largest)}`);
    }
  }
  const aggregateBytes = coreCapabilityOutputs.reduce((sum, outputPath) => sum + sizes[outputPath], 0);
  assert.ok(
    aggregateBytes <= aggregateByteBudget,
    `base + four capability bundles exceeded ${aggregateByteBudget} bytes: ${aggregateBytes}`
  );
  const allBundlesBytes = Object.values(sizes).reduce((sum, value) => sum + value, 0);
  assert.ok(
    allBundlesBytes <= allBundlesByteBudget,
    `all classic content bundles exceeded ${allBundlesByteBudget} bytes: ${allBundlesBytes}`
  );
  console.log(`content runtime bundle sizes (${allBundlesBytes} total bytes): ${JSON.stringify(sizes)}`);
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
