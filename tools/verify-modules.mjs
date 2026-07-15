#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { build, transform } from "esbuild";
import { init, parse } from "es-module-lexer";

const require = createRequire(import.meta.url);
const { packagePlan, root, runtimeModuleEntries } = require("./package-plan.cjs");
const {
  NATIVE_BROWSER_TARGETS,
  nativeEsmSyntaxRequiresLowering
} = require("./native-esm-syntax.cjs");
const SIZE_ALLOWLIST_FILE = "tools/module-size-allowlist.json";
const ignoredDirectories = new Set([".git", ".cache", "build", "dist", "node_modules", "output"]);
const errors = [];
const pinnedToolchain = Object.freeze({
  esbuild: "0.28.1",
  "es-module-lexer": "2.3.1",
  playwright: "1.61.1",
  "selenium-webdriver": "4.46.0"
});

function fail(message) {
  errors.push(message);
}

function walk(directory = root, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function contextFor(file) {
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
  if (!fs.statSync(path.join(root, target), { throwIfNoEntry: false })?.isFile()) {
    fail(`${owner}: missing dependency ${specifier} (${target})`);
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

function generatedOrSpecial(file) {
  return file.startsWith("content/")
    || file.startsWith("topic-delete-userscripts/")
    || file.startsWith("userscripts/")
    || file.startsWith("tools/")
    || file === "shared/i18n.js";
}

async function grammarCheck(file, context, source, nativeRuntimeModule = false) {
  try {
    if (context === "browser-esm") {
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

await init;
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
if (packageJson.type !== "module") fail('package.json must declare "type": "module"');
for (const [dependency, version] of Object.entries(pinnedToolchain)) {
  if (packageJson.devDependencies?.[dependency] !== version) fail(`package.json must pin ${dependency}@${version} exactly`);
  if (packageLock.packages?.[`node_modules/${dependency}`]?.version !== version) fail(`package-lock.json does not lock ${dependency}@${version}`);
}
const packagePlans = new Map(["chromium", "firefox"].map((target) => [target, packagePlan(target)]));
const nativeRuntimeModules = new Set(
  [...packagePlans.values()]
    .flatMap((plan) => plan.files)
    .filter((file) => contextFor(file) === "browser-esm")
);
const allFiles = walk().sort();
const javascriptFiles = allFiles.filter((file) => /\.(?:cjs|mjs|js)$/.test(file));
const graph = new Map();
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
    for (const imported of imports) {
      if (imported.d === -2) continue;
      if (imported.d >= 0 && imported.n === undefined) {
        fail(`${file}: computed dynamic import is forbidden`);
        continue;
      }
      const specifier = imported.n;
      if (!specifier) continue;
      if (imported.d >= 0) dynamicImportOwners.add(file);
      if (isVirtualSummaryRegistry(file, specifier)) continue;
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        fail(`${file}: bare, absolute, or remote browser import is forbidden: ${specifier}`);
        continue;
      }
      const target = resolveRelative(file, specifier);
      if (!target) continue;
      if (!layerAllowed(file, target)) fail(`${file}: illegal ${sourceLayer(file)} -> ${sourceLayer(target)} dependency: ${target}`);
      dependencies.add(target);
    }
    graph.set(file, dependencies);

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
}

detectCycle(graph);

const serviceWorkerReachable = new Set();
function collectReachable(file) {
  if (serviceWorkerReachable.has(file)) return;
  serviceWorkerReachable.add(file);
  for (const dependency of graph.get(file) || []) collectReachable(dependency);
}
collectReachable("background/service-worker.js");
for (const file of serviceWorkerReachable) {
  if (dynamicImportOwners.has(file)) fail(`${file}: dynamic import is forbidden in the Chromium Service Worker reachable graph`);
}

let sizeAllowlist = {};
try {
  sizeAllowlist = JSON.parse(fs.readFileSync(path.join(root, SIZE_ALLOWLIST_FILE), "utf8"));
} catch (error) {
  fail(`${SIZE_ALLOWLIST_FILE}: invalid size exception allowlist: ${error.message}`);
}
const usedSizeExceptions = new Set();
for (const file of javascriptFiles) {
  if (generatedOrSpecial(file)) continue;
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const count = lineCount(source);
  const hardLimit = file === "app/main.js" ? 700 : file === "background/service-worker.js" ? 350 : 1200;
  if (count <= hardLimit) continue;
  if (file === "app/main.js" || file === "background/service-worker.js") {
    fail(`${file}: ${count} lines exceeds hard entry limit ${hardLimit}`);
    continue;
  }
  const reason = sizeAllowlist[file];
  if (typeof reason !== "string" || reason.trim().length < 32) fail(`${file}: ${count} lines requires a specific, reasoned size exception`);
  else usedSizeExceptions.add(file);
}
for (const [file, reason] of Object.entries(sizeAllowlist)) {
  if (typeof reason !== "string" || reason.trim().length < 32) fail(`${SIZE_ALLOWLIST_FILE}: ${file} has no meaningful reason`);
  if (!usedSizeExceptions.has(file)) fail(`${SIZE_ALLOWLIST_FILE}: stale size exception for ${file}`);
}

const linkedEntryPoints = new Set();
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
  for (const entry of runtimeModuleEntries(plan)) {
    linkedEntryPoints.add(entry);
    await linkEntry(entry);
  }
}
for (const entry of [
  "content-src/content.js",
  "content-src/preload.js",
  "content-src/summary-userscripts.js",
  "content-src/summary-userscripts-main.js",
  "content-src/message-navigator.js",
  "content-src/grok-cookie-bridge.js"
]) {
  linkedEntryPoints.add(entry);
  await linkEntry(entry);
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

if (errors.length) {
  console.error("Module verification failed:");
  for (const error of [...new Set(errors)]) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Module verification passed (${graph.size} browser ESM modules, ${javascriptFiles.length} classified JavaScript files, no cycles).`);
}
