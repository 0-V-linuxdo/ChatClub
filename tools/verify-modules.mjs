#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { build, transform } from "esbuild";
import { init, parse } from "es-module-lexer";

const require = createRequire(import.meta.url);
const {
  packagePlan,
  root: repositoryRoot,
  runtimeModuleEntries,
  PACKAGED_NATIVE_ESM_REACHABILITY_ALLOWLIST
} = require("./package-plan.cjs");
const {
  NATIVE_BROWSER_TARGETS,
  nativeEsmSyntaxRequiresLowering
} = require("./native-esm-syntax.cjs");
const { CONTENT_ENTRIES, GENERATED_ARTIFACT_FILES } = require("./generated-artifacts.cjs");
const { analyzeNamedExportLiveness } = require("./export-liveness.cjs");
const { assertContainedRegularFile } = require("./repository-files.cjs");
const SIZE_ALLOWLIST_FILE = "tools/module-size-allowlist.json";
const EXPORT_LIVENESS_ALLOWLIST_FILE = "tools/export-liveness-allowlist.json";
const NATIVE_ENTRY_BUDGET_FILE = "tools/native-entry-budgets.json";
const CONTENT_SAFE_SHARED_ALLOWLIST_FILE = "tools/content-safe-shared-modules.json";
const DEFAULT_CONTENT_ENTRY_POINTS = Object.freeze([...new Set(Object.values(CONTENT_ENTRIES))].sort());
const DEFAULT_BUILD_ENTRY_POINTS = Object.freeze([
  "build-src/topic-delete-userscript-sources.js"
]);
const REQUIRED_APP_LAZY_BOUNDARIES = Object.freeze([
  "app/pocket/controller.js",
  "app/settings/controller.js",
  "app/summary/controller.js"
]);
const DEFAULT_AUTHOR_ESM_MAX_BYTES = 64 * 1024;
const generatedArtifactFileSet = new Set(GENERATED_ARTIFACT_FILES);
const ignoredDirectories = new Set([".git", ".cache", "build", "dist", "node_modules", "output"]);
const errors = [];
const pinnedToolchain = Object.freeze({
  esbuild: "0.28.1",
  "es-module-lexer": "2.3.1",
  eslint: "9.39.2",
  espree: "10.4.0",
  globals: "16.5.0",
  playwright: "1.61.1",
  "selenium-webdriver": "4.46.0"
});

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function readFixtureConfiguration() {
  // Test-only fixture mode runs this exact verifier against isolated temporary
  // repositories so each fail-closed rule has a real negative regression.
  const fixturePath = argumentValue("--fixture");
  if (!fixturePath) return null;
  const absolutePath = path.resolve(process.cwd(), fixturePath);
  const config = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  const fixtureRoot = path.resolve(path.dirname(absolutePath), config.root || ".");
  const plans = new Map(Object.entries(config.plans || {}).map(([target, plan]) => [
    target,
    Object.freeze({ ...plan, target, files: Object.freeze([...(plan.files || [])]) })
  ]));
  if (!plans.has("chromium") || !plans.has("firefox")) {
    throw new Error("--fixture config must define chromium and firefox package plans");
  }
  return Object.freeze({
    root: fixtureRoot,
    plans,
    contentEntryPoints: Object.freeze([...(config.contentEntryPoints || [])]),
    buildEntryPoints: Object.freeze([...(config.buildEntryPoints || [])]),
    contentSafeSharedModules: Object.freeze([...(config.contentSafeSharedModules || [])]),
    nativeEsmReachabilityAllowlist: Object.freeze({ ...(config.nativeEsmReachabilityAllowlist || {}) }),
    exportLivenessAllowlist: Object.freeze({ ...(config.exportLivenessAllowlist || {}) }),
    testFiles: Object.freeze([...(config.testFiles || [])]),
    verifyExportLiveness: config.verifyExportLiveness !== false,
    nativeEntryBudgets: Object.freeze({ ...(config.nativeEntryBudgets || {}) }),
    verifyNativeEntryBudgets: config.verifyNativeEntryBudgets === true,
    verifyToolchain: config.verifyToolchain === true,
    verifySizes: config.verifySizes === true
  });
}

const fixtureConfiguration = readFixtureConfiguration();
const root = fixtureConfiguration?.root || repositoryRoot;
const verifyToolchain = fixtureConfiguration?.verifyToolchain ?? true;
const verifySizes = fixtureConfiguration?.verifySizes ?? true;
const contentEntryPoints = fixtureConfiguration?.contentEntryPoints || DEFAULT_CONTENT_ENTRY_POINTS;
const buildEntryPoints = fixtureConfiguration?.buildEntryPoints || DEFAULT_BUILD_ENTRY_POINTS;
const nativeEsmReachabilityAllowlist = fixtureConfiguration?.nativeEsmReachabilityAllowlist
  || PACKAGED_NATIVE_ESM_REACHABILITY_ALLOWLIST;
const verifyExportLiveness = fixtureConfiguration?.verifyExportLiveness ?? true;
const verifyNativeEntryBudgets = fixtureConfiguration?.verifyNativeEntryBudgets ?? true;

function fail(message) {
  errors.push(message);
}

function walk(directory = root, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      fail(`${relative}: symbolic links are forbidden in the verified repository tree`);
      continue;
    }
    if (entry.isDirectory()) files.push(...walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function contextFor(file) {
  if (file === "eslint.config.js") return "node-esm-tool";
  if (/^build-src\/.*\.js$/.test(file)) return "node-esm-tool";
  if (/^(?:app|background|shared|ui|content-src)\/.*\.js$/.test(file)) return "browser-esm";
  if (/^content\/.*\.js$/.test(file)) return "classic-content";
  if (/^userscripts\/.*\.js$/.test(file)) return "userscript-body";
  if (/^topic-delete-userscripts\/.*\.js$/.test(file)) return "classic-userscript";
  if (/^tools\/.*\.cjs$/.test(file)) return "cjs-tool";
  if (/^tools\/.*\.mjs$/.test(file)) return "node-esm-tool";
  if (/^tools\/.*\.js$/.test(file)) return "devtools-probe";
  return null;
}

function resolveRelative(owner, specifier) {
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(owner), specifier));
  if (target.startsWith("../") || path.posix.isAbsolute(target)) {
    fail(`${owner}: import escapes the repository: ${specifier}`);
    return null;
  }
  try {
    assertContainedRegularFile(root, target, {
      missingPrefix: `${owner}: missing dependency ${specifier}`,
      symlinkPrefix: `${owner}: dependency is a symbolic link ${specifier}`,
      escapePrefix: `${owner}: dependency escapes repository root ${specifier}`,
      componentPrefix: `${owner}: dependency contains a symbolic link component ${specifier}`
    });
  } catch (error) {
    fail(error.message);
    return null;
  }
  return target;
}

function sourceLayer(file) {
  return file.split("/", 1)[0];
}

function layerAllowed(owner, target) {
  const from = sourceLayer(owner);
  const to = sourceLayer(target);
  const rules = {
    app: new Set(["app", "shared", "ui"]),
    background: new Set(["background", "shared"]),
    "build-src": new Set(["build-src", "shared"]),
    shared: new Set(["shared"]),
    ui: new Set(["ui", "shared"]),
    "content-src": new Set(["content-src", "shared"])
  };
  return rules[from]?.has(to) ?? false;
}

function isVirtualSummaryRegistry(owner, specifier) {
  return specifier === "chatclub:summary-registry"
    && new Set(["content-src/summary-userscripts.js", "content-src/summary-userscripts-main.js"]).has(owner);
}

function detectCycle(graph) {
  const state = new Map();
  const stack = [];
  function visit(file) {
    state.set(file, 1);
    stack.push(file);
    for (const dependency of graph.get(file) || []) {
      if (!graph.has(dependency)) continue;
      if (state.get(dependency) === 1) {
        const index = stack.indexOf(dependency);
        fail(`ESM cycle: ${[...stack.slice(index), dependency].join(" -> ")}`);
      } else if (!state.has(dependency)) visit(dependency);
    }
    stack.pop();
    state.set(file, 2);
  }
  for (const file of graph.keys()) if (!state.has(file)) visit(file);
}

function lineCount(source) {
  return source === "" ? 0 : source.split(/\r?\n/).length;
}

function authoredEsm(file, context) {
  if (context !== "browser-esm" && context !== "node-esm-tool") return false;
  return !(
    file.startsWith("content/")
    || file.startsWith("topic-delete-userscripts/")
    || file.startsWith("userscripts/")
    || generatedArtifactFileSet.has(file)
  );
}

function policyMarker(source, label) {
  let marker = `__CHATCLUB_MODULE_POLICY_${label}__`;
  while (source.includes(marker)) marker += "_";
  return marker;
}

async function enforceBrowserEsmRuntimePolicy(file, source) {
  const markers = Object.freeze({
    require: policyMarker(source, "REQUIRE"),
    eval: policyMarker(source, "EVAL"),
    Function: policyMarker(source, "FUNCTION"),
    importScripts: policyMarker(source, "IMPORT_SCRIPTS"),
    globalThis: policyMarker(source, "GLOBAL_THIS"),
    window: policyMarker(source, "WINDOW"),
    self: policyMarker(source, "SELF")
  });
  const define = {
    require: markers.require,
    eval: markers.eval,
    Function: markers.Function,
    importScripts: markers.importScripts,
    globalThis: markers.globalThis,
    window: markers.window,
    self: markers.self
  };
  const analysis = await build({
    stdin: {
      contents: source,
      sourcefile: file,
      resolveDir: path.dirname(path.join(root, file)),
      loader: "js"
    },
    bundle: false,
    write: false,
    metafile: true,
    logLevel: "silent",
    platform: "browser",
    format: "esm",
    target: "esnext",
    legalComments: "none",
    define
  });
  const output = analysis.outputFiles?.[0]?.text || "";
  const globalMemberUsed = (name) => Object.values({
    globalThis: markers.globalThis,
    window: markers.window,
    self: markers.self
  }).some((marker) => {
    const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escapedMarker}(?:\\?\\.)?(?:\\.${name}\\b|\\[\\s*["']${name}["']\\s*\\])`).test(output);
  });
  const commonJsInput = Object.values(analysis.metafile?.inputs || {}).some((input) => input.format === "cjs");
  const commonJsWarning = (analysis.warnings || []).some((warning) => warning.id === "commonjs-variable-in-esm");
  if (commonJsInput || commonJsWarning) {
    fail(`${file}: free CommonJS module/exports globals are forbidden in browser ESM`);
  }
  if (output.includes(markers.require)) {
    fail(`${file}: free CommonJS require is forbidden in browser ESM`);
  }
  if (output.includes(markers.eval) || globalMemberUsed("eval")) {
    fail(`${file}: eval is forbidden in browser ESM`);
  }
  if (output.includes(markers.Function) || globalMemberUsed("Function")) {
    fail(`${file}: the global Function constructor is forbidden in browser ESM`);
  }
  if (output.includes(markers.importScripts) || globalMemberUsed("importScripts")) {
    fail(`${file}: importScripts is forbidden in browser ESM`);
  }
}

async function grammarCheck(file, context, source, nativeRuntimeModule = false) {
  try {
    if (context === "browser-esm") {
      await enforceBrowserEsmRuntimePolicy(file, source);
      if (nativeRuntimeModule) {
        const result = await nativeEsmSyntaxRequiresLowering(source, file);
        if (result.requiresLowering) {
          fail(`${file}: native ESM syntax requires lowering for ${NATIVE_BROWSER_TARGETS.join("/")}; packaged native modules must execute without transformation`);
        }
      } else {
        await transform(source, { loader: "js", format: "esm", platform: "browser" });
      }
      return;
    }
    if (context === "node-esm-tool") {
      await transform(source, { loader: "js", format: "esm", platform: "node" });
      return;
    }
    if (context === "cjs-tool") {
      new vm.Script(source, { filename: file });
      return;
    }
    if (context === "userscript-body") {
      await transform(`async function __chatclubUserscriptBody(api) {\n${source}\n}`, {
        loader: "js",
        format: "iife",
        platform: "browser",
        target: ["chrome120", "firefox136"]
      });
      return;
    }
    const wrapped = context === "devtools-probe" ? `(async () => {\n${source}\n})()` : source;
    await transform(wrapped, {
      loader: "js",
      format: "iife",
      platform: "browser",
      target: ["chrome120", "firefox136"]
    });
  } catch (error) {
    fail(`${file}: ${context} grammar failed: ${error.errors?.[0]?.text || error.message}`);
  }
}

async function linkEntry(entry) {
  const virtualRegistryPlugin = {
    name: "chatclub-verifier-registry",
    setup(bundle) {
      bundle.onResolve({ filter: /^chatclub:summary-registry$/ }, () => ({
        path: "summary-registry",
        namespace: "chatclub-verifier"
      }));
      bundle.onLoad({ filter: /.*/, namespace: "chatclub-verifier" }, () => ({
        contents: "export function createSummaryRunnerRegistry() { return Object.create(null); }",
        loader: "js"
      }));
    }
  };
  try {
    await build({
      absWorkingDir: root,
      entryPoints: [entry],
      bundle: true,
      write: false,
      logLevel: "silent",
      platform: "browser",
      format: "iife",
      target: ["chrome120", "firefox136"],
      splitting: false,
      minify: false,
      sourcemap: false,
      plugins: [virtualRegistryPlugin]
    });
  } catch (error) {
    for (const detail of error.errors || []) fail(`${entry}: link failed: ${detail.text}`);
    if (!error.errors?.length) fail(`${entry}: link failed: ${error.message}`);
  }
}

async function linkBuildEntry(entry) {
  try {
    await build({
      absWorkingDir: root,
      entryPoints: [entry],
      bundle: true,
      write: false,
      logLevel: "silent",
      platform: "node",
      format: "esm",
      target: ["node22"],
      splitting: false,
      minify: false,
      sourcemap: false
    });
  } catch (error) {
    for (const detail of error.errors || []) fail(`${entry}: build link failed: ${detail.text}`);
    if (!error.errors?.length) fail(`${entry}: build link failed: ${error.message}`);
  }
}

await init;
if (verifyToolchain) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  if (packageJson.type !== "module") fail('package.json must declare "type": "module"');
  for (const [dependency, version] of Object.entries(pinnedToolchain)) {
    if (packageJson.devDependencies?.[dependency] !== version) fail(`package.json must pin ${dependency}@${version} exactly`);
    if (packageLock.packages?.[`node_modules/${dependency}`]?.version !== version) fail(`package-lock.json does not lock ${dependency}@${version}`);
  }
}
const packagePlans = fixtureConfiguration?.plans
  || new Map(["chromium", "firefox"].map((target) => [target, packagePlan(target)]));
const nativeRuntimeModules = new Set(
  [...packagePlans.values()]
    .flatMap((plan) => plan.files)
    .filter((file) => contextFor(file) === "browser-esm")
);
const allFiles = walk().sort();
const javascriptFiles = allFiles.filter((file) => /\.(?:cjs|mjs|js)$/.test(file));
const graph = new Map();
const staticGraph = new Map();
const dynamicDependencies = new Map();
const buildGraph = new Map();
const staticAssets = new Map();
const dynamicImportOwners = new Set();

for (const file of javascriptFiles) {
  const context = contextFor(file);
  if (!context) {
    fail(`${file}: JavaScript file has no declared runtime context`);
    continue;
  }
  const source = fs.readFileSync(path.join(root, file), "utf8");
  await grammarCheck(file, context, source, nativeRuntimeModules.has(file));
  let imports;
  let exports;
  try {
    [imports, exports] = parse(source, file);
  } catch (error) {
    fail(`${file}: es-module-lexer parse failed: ${error.message}`);
    continue;
  }

  if (["classic-content", "classic-userscript", "userscript-body"].includes(context)) {
    const moduleSyntax = imports.filter((item) => item.d !== -2);
    if (moduleSyntax.length || exports.length || imports.some((item) => item.d === -2)) {
      fail(`${file}: ${context} must not contain import, export, or import.meta`);
    }
  }

  if (context === "browser-esm") {
    const dependencies = new Set();
    const staticDependencies = new Set();
    const dynamicTargets = new Set();
    for (const imported of imports) {
      if (imported.d === -2) continue;
      if (imported.d >= 0 && imported.n === undefined) {
        fail(`${file}: computed dynamic import is forbidden`);
        continue;
      }
      const specifier = imported.n;
      if (!specifier) continue;
      const dynamic = imported.d >= 0;
      if (dynamic) dynamicImportOwners.add(file);
      if (isVirtualSummaryRegistry(file, specifier)) continue;
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        fail(`${file}: bare, absolute, or remote browser import is forbidden: ${specifier}`);
        continue;
      }
      const target = resolveRelative(file, specifier);
      if (!target) continue;
      if (!layerAllowed(file, target)) fail(`${file}: illegal ${sourceLayer(file)} -> ${sourceLayer(target)} dependency: ${target}`);
      dependencies.add(target);
      if (dynamic) dynamicTargets.add(target);
      else staticDependencies.add(target);
    }
    graph.set(file, dependencies);
    staticGraph.set(file, staticDependencies);
    dynamicDependencies.set(file, dynamicTargets);

    const assets = new Set();
    const staticAssetPattern = /new\s+URL\(\s*(["'])(\.\.?\/[^"']+)\1\s*,\s*import\.meta\.url\s*\)/g;
    for (const match of source.matchAll(staticAssetPattern)) {
      const target = resolveRelative(file, match[2]);
      if (target) assets.add(target);
    }
    const computedAssetPattern = /new\s+URL\(\s*`([^`]*)\$\{[^}]+\}([^`]*)`\s*,\s*import\.meta\.url\s*\)/g;
    for (const match of source.matchAll(computedAssetPattern)) {
      if (file === "shared/summary-sites.js" && match[1] === "../userscripts/" && match[2] === "") {
        const index = JSON.parse(fs.readFileSync(path.join(root, "userscripts/index.json"), "utf8"));
        for (const descriptor of index.configs || []) {
          const target = resolveRelative(file, `../userscripts/${descriptor.userscriptFile}`);
          if (target) assets.add(target);
        }
      } else if (file === "shared/topic-delete-sites.js" && match[1] === "../" && match[2] === "") {
        for (const asset of allFiles.filter((candidate) => candidate.startsWith("topic-delete-userscripts/") && candidate.endsWith(".user.js"))) {
          assets.add(asset);
        }
      } else {
        fail(`${file}: unclassified computed import.meta asset URL`);
      }
    }
    staticAssets.set(file, assets);
  }

  if (context === "node-esm-tool" && file.startsWith("build-src/")) {
    const dependencies = new Set();
    for (const imported of imports) {
      if (imported.d === -2) continue;
      if (imported.d >= 0 && imported.n === undefined) {
        fail(`${file}: computed dynamic import is forbidden in build ESM`);
        continue;
      }
      const specifier = imported.n;
      if (!specifier) continue;
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        fail(`${file}: bare, absolute, or remote build import is forbidden: ${specifier}`);
        continue;
      }
      const target = resolveRelative(file, specifier);
      if (!target) continue;
      if (!layerAllowed(file, target)) {
        fail(`${file}: illegal ${sourceLayer(file)} -> ${sourceLayer(target)} dependency: ${target}`);
      }
      dependencies.add(target);
    }
    buildGraph.set(file, dependencies);
  }
}

detectCycle(graph);
detectCycle(buildGraph);

function reachableFrom(entries, dependencyGraph = graph) {
  const reachable = new Set();
  function collect(file) {
    if (reachable.has(file)) return;
    reachable.add(file);
    for (const dependency of dependencyGraph.get(file) || []) collect(dependency);
  }
  for (const entry of entries) collect(entry);
  return reachable;
}

function staticReachableFrom(entries) {
  return reachableFrom(entries, staticGraph);
}

function sourceBytes(files) {
  return [...files].reduce(
    (total, file) => total + fs.statSync(path.join(root, file)).size,
    0
  );
}

const serviceWorkerReachable = reachableFrom(["background/service-worker.js"]);
for (const file of serviceWorkerReachable) {
  if (dynamicImportOwners.has(file)) fail(`${file}: dynamic import is forbidden in the Chromium Service Worker reachable graph`);
}

if (verifySizes) {
  let sizeAllowlist = {};
  try {
    sizeAllowlist = JSON.parse(fs.readFileSync(path.join(root, SIZE_ALLOWLIST_FILE), "utf8"));
  } catch (error) {
    fail(`${SIZE_ALLOWLIST_FILE}: invalid size exception allowlist: ${error.message}`);
  }
  const usedSizeExceptions = new Set();
  for (const file of javascriptFiles) {
    const context = contextFor(file);
    if (!authoredEsm(file, context)) continue;
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const count = lineCount(source);
    const byteCount = Buffer.byteLength(source);
    const hardLimit = file === "app/main.js" ? 700 : file === "background/service-worker.js" ? 350 : 1200;
    const exceedsLineLimit = count > hardLimit;
    const exceedsByteLimit = byteCount > DEFAULT_AUTHOR_ESM_MAX_BYTES;
    if (!exceedsLineLimit && !exceedsByteLimit) continue;
    if (exceedsLineLimit && (file === "app/main.js" || file === "background/service-worker.js")) {
      fail(`${file}: ${count} lines exceeds hard entry limit ${hardLimit}`);
      continue;
    }
    const exception = sizeAllowlist[file];
    if (!exception || typeof exception !== "object" || Array.isArray(exception)) {
      const violations = [
        ...(exceedsLineLimit ? [`${count} lines exceeds default limit ${hardLimit}`] : []),
        ...(exceedsByteLimit ? [`${byteCount} bytes exceeds default author ESM limit ${DEFAULT_AUTHOR_ESM_MAX_BYTES}`] : [])
      ];
      fail(`${file}: ${violations.join(" and ")}; a structured size-ratchet exception is required`);
      continue;
    }
    const allowedKeys = new Set(["maxLines", "target", "maxBytes", "targetBytes", "reason"]);
    const unknownKeys = Object.keys(exception).filter((key) => !allowedKeys.has(key));
    if (unknownKeys.length) fail(`${SIZE_ALLOWLIST_FILE}: ${file} has unsupported fields: ${unknownKeys.join(", ")}`);
    const hasLineRatchet = exception.maxLines !== undefined || exception.target !== undefined;
    if (exceedsLineLimit || hasLineRatchet) {
      if (!Number.isSafeInteger(exception.maxLines) || exception.maxLines <= hardLimit) {
        fail(`${SIZE_ALLOWLIST_FILE}: ${file}.maxLines must be an integer above ${hardLimit}`);
      } else if (count > exception.maxLines) {
        fail(`${file}: ${count} lines exceeds ratcheted maximum ${exception.maxLines}`);
      } else if (count < exception.maxLines) {
        fail(`${file}: line count improved to ${count}; lower maxLines from ${exception.maxLines} to preserve the ratchet`);
      }
      if (!Number.isSafeInteger(exception.target) || exception.target <= 0 || exception.target >= exception.maxLines) {
        fail(`${SIZE_ALLOWLIST_FILE}: ${file}.target must be a positive integer below maxLines`);
      }
    }
    if (!Number.isSafeInteger(exception.maxBytes) || exception.maxBytes <= 0) {
      fail(`${SIZE_ALLOWLIST_FILE}: ${file}.maxBytes must be a positive integer`);
    } else if (byteCount > exception.maxBytes) {
      fail(`${file}: ${byteCount} bytes exceeds ratcheted maximum ${exception.maxBytes}`);
    } else if (byteCount < exception.maxBytes) {
      fail(`${file}: byte size improved to ${byteCount}; lower maxBytes from ${exception.maxBytes} to preserve the ratchet`);
    }
    if (
      !Number.isSafeInteger(exception.targetBytes)
      || exception.targetBytes <= 0
      || exception.targetBytes >= exception.maxBytes
    ) {
      fail(`${SIZE_ALLOWLIST_FILE}: ${file}.targetBytes must be a positive integer below maxBytes`);
    }
    if (exceedsByteLimit && Number.isSafeInteger(exception.maxBytes)) {
      if (exception.maxBytes <= DEFAULT_AUTHOR_ESM_MAX_BYTES) {
        fail(
          `${SIZE_ALLOWLIST_FILE}: ${file}.maxBytes must be above the default author ESM limit `
          + `${DEFAULT_AUTHOR_ESM_MAX_BYTES}`
        );
      }
    }
    if (typeof exception.reason !== "string" || exception.reason.trim().length < 32) {
      fail(`${SIZE_ALLOWLIST_FILE}: ${file} has no meaningful reason`);
    }
    usedSizeExceptions.add(file);
  }
  for (const file of Object.keys(sizeAllowlist)) {
    if (!usedSizeExceptions.has(file)) fail(`${SIZE_ALLOWLIST_FILE}: stale size exception for ${file}`);
  }
}

const allowedNativeEsmOrphans = new Map(Object.entries(nativeEsmReachabilityAllowlist));
const usedNativeEsmOrphanAllowlist = new Set();
for (const [file, reason] of allowedNativeEsmOrphans) {
  if (typeof reason !== "string" || reason.trim().length < 32) {
    fail(`native ESM reachability allowlist: ${file} has no meaningful reason`);
  }
}

const linkedEntryPoints = new Set();
const runtimeReachableModules = new Set();
for (const target of ["chromium", "firefox"]) {
  const plan = packagePlans.get(target);
  const packaged = new Set(plan.files);
  for (const file of plan.files.filter((candidate) => graph.has(candidate))) {
    for (const dependency of graph.get(file)) {
      if (!packaged.has(dependency)) fail(`${target} package: ${file} dependency is not packaged: ${dependency}`);
    }
    for (const asset of staticAssets.get(file) || []) {
      if (!packaged.has(asset)) fail(`${target} package: ${file} static import.meta asset is not packaged: ${asset}`);
    }
  }
  const runtimeEntries = runtimeModuleEntries(plan);
  for (const entry of runtimeEntries) {
    if (!packaged.has(entry)) fail(`${target} package: runtime ESM entry is not packaged: ${entry}`);
    if (!graph.has(entry)) fail(`${target} package: runtime ESM entry is not a browser module: ${entry}`);
    linkedEntryPoints.add(entry);
    await linkEntry(entry);
  }
  const reachable = reachableFrom(runtimeEntries.filter((entry) => graph.has(entry)));
  for (const file of reachable) runtimeReachableModules.add(file);
  for (const file of plan.files.filter((candidate) => graph.has(candidate))) {
    if (reachable.has(file)) continue;
    if (allowedNativeEsmOrphans.has(file)) {
      usedNativeEsmOrphanAllowlist.add(file);
      continue;
    }
    fail(`${target} package: native ESM module is unreachable from runtime entries: ${file}`);
  }
}
for (const file of allowedNativeEsmOrphans.keys()) {
  if (!usedNativeEsmOrphanAllowlist.has(file)) {
    fail(`native ESM reachability allowlist contains stale entry: ${file}`);
  }
}
for (const entry of contentEntryPoints) {
  linkedEntryPoints.add(entry);
  await linkEntry(entry);
}
const reachableContentAuthorModules = reachableFrom(
  contentEntryPoints.filter((entry) => graph.has(entry))
);
for (const file of graph.keys()) {
  if (file.startsWith("content-src/") && !reachableContentAuthorModules.has(file)) {
    fail(`content author ESM module is unreachable from declared content entries: ${file}`);
  }
}
let configuredContentSafeSharedModules = fixtureConfiguration?.contentSafeSharedModules;
if (!fixtureConfiguration) {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(root, CONTENT_SAFE_SHARED_ALLOWLIST_FILE), "utf8")
    );
    if (!Array.isArray(parsed)) throw new Error("top-level value must be an array");
    configuredContentSafeSharedModules = parsed;
  } catch (error) {
    fail(`${CONTENT_SAFE_SHARED_ALLOWLIST_FILE}: invalid content-safe shared allowlist: ${error.message}`);
    configuredContentSafeSharedModules = [];
  }
}
const contentSafeSharedModules = new Set(configuredContentSafeSharedModules || []);
if (contentSafeSharedModules.size !== (configuredContentSafeSharedModules || []).length) {
  fail(`${CONTENT_SAFE_SHARED_ALLOWLIST_FILE}: entries must be unique`);
}
if (
  JSON.stringify(configuredContentSafeSharedModules || [])
  !== JSON.stringify([...(configuredContentSafeSharedModules || [])].sort())
) {
  fail(`${CONTENT_SAFE_SHARED_ALLOWLIST_FILE}: entries must be sorted`);
}
for (const file of contentSafeSharedModules) {
  if (typeof file !== "string" || !/^shared\/.+\.js$/.test(file)) {
    fail(`${CONTENT_SAFE_SHARED_ALLOWLIST_FILE}: invalid shared module entry: ${String(file)}`);
  }
}
const reachableContentSharedModules = new Set(
  [...reachableContentAuthorModules].filter((file) => file.startsWith("shared/"))
);
for (const owner of reachableContentAuthorModules) {
  for (const dependency of graph.get(owner) || []) {
    if (!dependency.startsWith("shared/") || contentSafeSharedModules.has(dependency)) continue;
    fail(`${owner}: content-safe shared dependency is not allowlisted: ${dependency}`);
  }
}
for (const file of contentSafeSharedModules) {
  if (!reachableContentSharedModules.has(file)) {
    fail(`${CONTENT_SAFE_SHARED_ALLOWLIST_FILE}: stale content-safe shared module: ${file}`);
  }
}
for (const entry of buildEntryPoints) {
  if (!buildGraph.has(entry)) {
    fail(`declared build ESM entry is missing or unclassified: ${entry}`);
    continue;
  }
  await linkBuildEntry(entry);
}
const reachableBuildAuthorModules = reachableFrom(
  buildEntryPoints.filter((entry) => buildGraph.has(entry)),
  buildGraph
);
for (const file of buildGraph.keys()) {
  if (!reachableBuildAuthorModules.has(file)) {
    fail(`build author ESM module is unreachable from declared build entries: ${file}`);
  }
}
const linkedModules = new Set();
function collectLinked(file) {
  if (linkedModules.has(file)) return;
  linkedModules.add(file);
  for (const dependency of graph.get(file) || []) collectLinked(dependency);
}
for (const entry of linkedEntryPoints) collectLinked(entry);
for (const file of graph.keys()) {
  if (!linkedModules.has(file)) await linkEntry(file);
}

let nativeEntryBudgetStats = null;
if (verifyNativeEntryBudgets) {
  let budgets = fixtureConfiguration?.nativeEntryBudgets;
  if (!budgets) {
    try {
      budgets = JSON.parse(fs.readFileSync(path.join(root, NATIVE_ENTRY_BUDGET_FILE), "utf8"));
    } catch (error) {
      fail(`${NATIVE_ENTRY_BUDGET_FILE}: invalid native-entry budget: ${error.message}`);
      budgets = {};
    }
  }
  if (!budgets || typeof budgets !== "object" || Array.isArray(budgets)) budgets = {};
  const unknownTopLevel = Object.keys(budgets).filter((field) => !new Set([
    "entries",
    "lazyBoundaries"
  ]).has(field));
  if (unknownTopLevel.length) {
    fail(`${NATIVE_ENTRY_BUDGET_FILE}: unsupported top-level fields: ${unknownTopLevel.join(", ")}`);
  }
  const entryBudgets = budgets.entries && typeof budgets.entries === "object" && !Array.isArray(budgets.entries)
    ? budgets.entries
    : {};
  const lazyBudgets = budgets.lazyBoundaries
    && typeof budgets.lazyBoundaries === "object"
    && !Array.isArray(budgets.lazyBoundaries)
    ? budgets.lazyBoundaries
    : {};
  if (!budgets.entries || entryBudgets !== budgets.entries) {
    fail(`${NATIVE_ENTRY_BUDGET_FILE}: entries must be an object`);
  }
  if (!budgets.lazyBoundaries || lazyBudgets !== budgets.lazyBoundaries) {
    fail(`${NATIVE_ENTRY_BUDGET_FILE}: lazyBoundaries must be an object`);
  }

  function enforceFootprint(label, budget, closure, extraFields = []) {
    const allowedFields = new Set([
      ...extraFields,
      "maxFiles",
      "targetFiles",
      "maxSourceBytes",
      "targetSourceBytes",
      "reason"
    ]);
    const unknown = Object.keys(budget).filter((field) => !allowedFields.has(field));
    if (unknown.length) fail(`${NATIVE_ENTRY_BUDGET_FILE}: ${label} has unsupported fields: ${unknown.join(", ")}`);
    const bytes = sourceBytes(closure);
    for (const [field, value] of Object.entries({
      maxFiles: budget.maxFiles,
      targetFiles: budget.targetFiles,
      maxSourceBytes: budget.maxSourceBytes,
      targetSourceBytes: budget.targetSourceBytes
    })) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        fail(`${NATIVE_ENTRY_BUDGET_FILE}: ${label}.${field} must be a positive integer`);
      }
    }
    if (budget.targetFiles >= budget.maxFiles) {
      fail(`${NATIVE_ENTRY_BUDGET_FILE}: ${label}.targetFiles must be below maxFiles`);
    }
    if (budget.targetSourceBytes >= budget.maxSourceBytes) {
      fail(`${NATIVE_ENTRY_BUDGET_FILE}: ${label}.targetSourceBytes must be below maxSourceBytes`);
    }
    if (closure.size > budget.maxFiles) {
      fail(`${label}: static footprint has ${closure.size} files, above budget ${budget.maxFiles}`);
    } else if (closure.size < budget.maxFiles) {
      fail(`${label}: static footprint improved to ${closure.size} files; lower maxFiles from ${budget.maxFiles}`);
    }
    if (bytes > budget.maxSourceBytes) {
      fail(`${label}: static footprint has ${bytes} source bytes, above budget ${budget.maxSourceBytes}`);
    } else if (bytes < budget.maxSourceBytes) {
      fail(`${label}: static footprint improved to ${bytes} source bytes; lower maxSourceBytes from ${budget.maxSourceBytes}`);
    }
    if (typeof budget.reason !== "string" || budget.reason.trim().length < 32) {
      fail(`${NATIVE_ENTRY_BUDGET_FILE}: ${label} has no meaningful reason`);
    }
    return Object.freeze({ files: closure.size, sourceBytes: bytes });
  }

  const requiredEntries = [
    "app/main.js",
    "background/service-worker.js",
    "background/firefox-background.js"
  ];
  const entryStates = {};
  for (const entry of requiredEntries) {
    const budget = entryBudgets[entry];
    if (!budget || typeof budget !== "object" || Array.isArray(budget)) {
      fail(`${NATIVE_ENTRY_BUDGET_FILE}: missing structured entry budget for ${entry}`);
      continue;
    }
    if (!staticGraph.has(entry)) {
      fail(`${NATIVE_ENTRY_BUDGET_FILE}: native entry is missing from the browser ESM graph: ${entry}`);
      continue;
    }
    entryStates[entry] = enforceFootprint(entry, budget, staticReachableFrom([entry]));
  }
  for (const entry of Object.keys(entryBudgets)) {
    if (!requiredEntries.includes(entry)) {
      fail(`${NATIVE_ENTRY_BUDGET_FILE}: stale native entry budget for ${entry}`);
    }
  }

  const appInitialClosure = staticReachableFrom(["app/main.js"]);
  const initialDynamicEdges = new Map();
  for (const owner of appInitialClosure) {
    for (const target of dynamicDependencies.get(owner) || []) {
      if (!initialDynamicEdges.has(target)) initialDynamicEdges.set(target, new Set());
      initialDynamicEdges.get(target).add(owner);
    }
  }
  for (const target of initialDynamicEdges.keys()) {
    if (!REQUIRED_APP_LAZY_BOUNDARIES.includes(target)) {
      fail(`${target}: unbudgeted dynamic boundary from the app initial-static closure`);
    }
  }

  const lazyStates = {};
  for (const target of REQUIRED_APP_LAZY_BOUNDARIES) {
    const budget = lazyBudgets[target];
    if (!budget || typeof budget !== "object" || Array.isArray(budget)) {
      fail(`${NATIVE_ENTRY_BUDGET_FILE}: missing structured lazy-boundary budget for ${target}`);
      continue;
    }
    if (typeof budget.owner !== "string" || !budget.owner) {
      fail(`${NATIVE_ENTRY_BUDGET_FILE}: ${target}.owner must name the dynamic-import owner`);
    } else if (!appInitialClosure.has(budget.owner)) {
      fail(`${target}: lazy-boundary owner is not in the app initial-static closure: ${budget.owner}`);
    }
    if (appInitialClosure.has(target)) {
      fail(`${target}: configured lazy boundary became statically reachable from app/main.js`);
    }
    if (!dynamicDependencies.get(budget.owner)?.has(target)) {
      fail(`${target}: configured lazy boundary is not dynamically imported by ${budget.owner || "its owner"}`);
    }
    if (!staticGraph.has(target)) {
      fail(`${NATIVE_ENTRY_BUDGET_FILE}: lazy-boundary target is missing from the browser ESM graph: ${target}`);
      continue;
    }
    const increment = new Set(
      [...staticReachableFrom([target])].filter((file) => !appInitialClosure.has(file))
    );
    lazyStates[target] = enforceFootprint(target, budget, increment, ["owner"]);
  }
  for (const target of Object.keys(lazyBudgets)) {
    if (!REQUIRED_APP_LAZY_BOUNDARIES.includes(target)) {
      fail(`${NATIVE_ENTRY_BUDGET_FILE}: stale app lazy-boundary budget for ${target}`);
    }
  }
  nativeEntryBudgetStats = Object.freeze({ entries: entryStates, lazyBoundaries: lazyStates });
}

let exportLivenessStats = null;
if (verifyExportLiveness) {
  let exportLivenessAllowlist = fixtureConfiguration?.exportLivenessAllowlist;
  if (!exportLivenessAllowlist) {
    try {
      exportLivenessAllowlist = JSON.parse(
        fs.readFileSync(path.join(root, EXPORT_LIVENESS_ALLOWLIST_FILE), "utf8")
      );
    } catch (error) {
      fail(`${EXPORT_LIVENESS_ALLOWLIST_FILE}: invalid export-liveness allowlist: ${error.message}`);
      exportLivenessAllowlist = {};
    }
  }
  const runtimeConsumerFiles = new Set([
    ...runtimeReachableModules,
    ...reachableContentAuthorModules,
    ...reachableBuildAuthorModules
  ]);
  const moduleFiles = [...new Set([...graph.keys(), ...buildGraph.keys()])].sort();
  const reportFiles = moduleFiles.filter((file) => (
    runtimeConsumerFiles.has(file)
    && authoredEsm(file, contextFor(file))
  ));
  try {
    const liveness = analyzeNamedExportLiveness({
      root,
      moduleFiles,
      reportFiles,
      runtimeConsumerFiles: [...runtimeConsumerFiles],
      toolFiles: allFiles.filter((file) => (
        /^tools\/.*\.(?:cjs|mjs)$/.test(file)
        && !/-test\.cjs$/.test(file)
      )),
      testFiles: fixtureConfiguration?.testFiles
        || allFiles.filter((file) => /^tools\/.*-test\.cjs$/.test(file)),
      allowlist: exportLivenessAllowlist
    });
    exportLivenessStats = liveness.stats;
    for (const error of liveness.errors) fail(error);
  } catch (error) {
    fail(`Named export liveness verification failed: ${error.message}`);
  }
}

if (errors.length) {
  console.error("Module verification failed:");
  for (const error of [...new Set(errors)]) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Module verification passed (${graph.size} browser ESM modules, ${buildGraph.size} build ESM modules, `
    + `${javascriptFiles.length} classified JavaScript files, no cycles`
    + `${exportLivenessStats
      ? `, ${exportLivenessStats.reportedNamedExports} named exports analyzed with ${exportLivenessStats.exceptions} exceptions`
      : ""}`
    + `${nativeEntryBudgetStats
      ? `, ${Object.keys(nativeEntryBudgetStats.entries).length} initial-static entry closures and `
        + `${Object.keys(nativeEntryBudgetStats.lazyBoundaries).length} lazy-boundary increments ratcheted`
      : ""}`
    + `, ${reachableContentSharedModules.size} content-safe shared modules).`
  );
}
