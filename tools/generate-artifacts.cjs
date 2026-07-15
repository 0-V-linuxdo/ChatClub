#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");
const {
  CONTENT_ENTRIES,
  TOPIC_DELETE_OUTPUTS,
  assertGeneratedArtifactInventory
} = require("./generated-artifacts.cjs");

const root = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");
const contentOnly = process.argv.includes("--content-only");
const outputRootFlag = process.argv.indexOf("--output-root");
const contentOutputRoot = outputRootFlag >= 0
  ? path.resolve(process.argv[outputRootFlag + 1] || "")
  : root;
const stale = [];
let generatedCount = 0;

if (outputRootFlag >= 0 && !process.argv[outputRootFlag + 1]) {
  throw new Error("--output-root requires a directory");
}
if (checkOnly && contentOutputRoot !== root) {
  throw new Error("--check and --output-root cannot be combined");
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function expectedFile(relativePath, expected, base = root) {
  const absolutePath = path.join(base, relativePath);
  const actual = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : null;
  if (actual === expected) return;
  if (checkOnly) {
    stale.push(relativePath);
    return;
  }
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, expected);
  generatedCount += 1;
  console.log(`generated ${path.relative(root, absolutePath) || relativePath}`);
}

function summaryBody(relativePath) {
  const source = read(relativePath).replace(/\r\n?/g, "\n");
  const header = source.match(/^(?:\/\/[^\n]*\n)+\s*/);
  if (!header || !/Summary userscript/.test(header[0])) {
    throw new Error(`${relativePath}: missing the built-in Summary userscript header`);
  }
  const body = source.slice(header[0].length).trim();
  if (!body) throw new Error(`${relativePath}: userscript body is empty`);
  return body;
}

function summaryConfigs() {
  const indexPath = "userscripts/index.json";
  const index = JSON.parse(read(indexPath));
  if (!Array.isArray(index.configs) || !index.configs.length) {
    throw new Error(`${indexPath}: configs must be a non-empty array`);
  }
  const ids = new Set();
  const files = new Set();
  const configs = index.configs.map((config) => {
    if (!config || typeof config.id !== "string" || typeof config.userscriptFile !== "string") {
      throw new Error(`${indexPath}: every config needs id and userscriptFile`);
    }
    if (ids.has(config.id)) throw new Error(`${indexPath}: duplicate id ${config.id}`);
    if (files.has(config.userscriptFile)) throw new Error(`${indexPath}: duplicate userscriptFile ${config.userscriptFile}`);
    ids.add(config.id);
    files.add(config.userscriptFile);
    const userscript = summaryBody(path.posix.join("userscripts", config.userscriptFile));
    config.userscriptLength = userscript.length;
    return { ...config, userscript };
  });
  if (!contentOnly && contentOutputRoot === root) {
    expectedFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  }
  return configs;
}

function summaryRegistryModule(configs, runtimeVersion) {
  let output = "export function createSummaryRunnerRegistry() {\n  const scripts = Object.create(null);\n";
  for (const config of configs) {
    output += `  scripts[${JSON.stringify(config.id)}] = async function(api) {\n`;
    output += `${config.userscript}\n`;
    output += "  };\n";
    output += `  scripts[${JSON.stringify(config.userscriptFile)}] = scripts[${JSON.stringify(config.id)}];\n`;
  }
  output += `  Object.defineProperty(scripts, "runtimeVersion", { value: ${JSON.stringify(runtimeVersion)} });\n`;
  output += "  return scripts;\n}\n";
  return output;
}

async function protocolModule() {
  const absolutePath = path.join(root, "shared/protocol.js");
  return import(`${require("node:url").pathToFileURL(absolutePath).href}?generated=${Date.now()}`);
}

async function validateSummaryCatalog(configs) {
  const absolutePath = path.join(root, "shared/summary-sites.js");
  const module = await import(`${require("node:url").pathToFileURL(absolutePath).href}?generated=${Date.now()}`);
  const catalog = module.SUMMARY_SITE_CONFIGS;
  if (!Array.isArray(catalog) || catalog.length !== configs.length) {
    throw new Error("shared/summary-sites.js: lightweight catalog does not match userscripts/index.json");
  }
  for (const expected of configs) {
    const descriptor = catalog.find((item) => item?.id === expected.id);
    if (!descriptor) throw new Error(`shared/summary-sites.js: missing ${expected.id}`);
    if (Object.hasOwn(descriptor, "userscript")) {
      throw new Error(`shared/summary-sites.js: ${expected.id} must not embed a userscript body`);
    }
    for (const field of ["userscriptFile", "userscriptLength", "configVersion"]) {
      if (descriptor[field] !== expected[field]) {
        throw new Error(`shared/summary-sites.js: ${expected.id}.${field} drifted from userscripts/index.json`);
      }
    }
  }
}

async function buildContent(configs, protocol) {
  const registrySource = summaryRegistryModule(configs, protocol.CONTENT_BRIDGE_VERSION);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatclub-content-build-"));
  const registryPlugin = {
    name: "chatclub-summary-registry",
    setup(build) {
      build.onResolve({ filter: /^chatclub:summary-registry$/ }, () => ({
        path: "summary-registry",
        namespace: "chatclub-generated"
      }));
      build.onLoad({ filter: /.*/, namespace: "chatclub-generated" }, () => ({
        contents: registrySource,
        loader: "js",
        resolveDir: root
      }));
    }
  };

  try {
    for (const [outputPath, entryPath] of Object.entries(CONTENT_ENTRIES)) {
      const temporaryOutput = path.join(temporaryRoot, outputPath);
      await esbuild.build({
        absWorkingDir: root,
        entryPoints: [entryPath],
        outfile: temporaryOutput,
        bundle: true,
        format: "iife",
        platform: "browser",
        target: ["chrome120", "firefox136"],
        splitting: false,
        minify: false,
        sourcemap: false,
        charset: "utf8",
        legalComments: "inline",
        plugins: [registryPlugin],
        write: true,
        logLevel: "silent"
      });
      const output = fs.readFileSync(temporaryOutput, "utf8");
      if (/\bimport\s*\(/.test(output)) throw new Error(`${outputPath}: runtime dynamic import is forbidden`);
      if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(output)) throw new Error(`${outputPath}: eval/Function is forbidden`);
      expectedFile(outputPath, output, contentOutputRoot);
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function generateDeleteSites() {
  const modulePath = path.join(root, "shared/topic-delete-userscript-sources.js");
  const protocolSource = read("shared/protocol.js");
  const protocolUrl = `data:text/javascript;base64,${Buffer.from(protocolSource).toString("base64")}`;
  const moduleSource = fs.readFileSync(modulePath, "utf8")
    .replace('from "./protocol.js"', `from ${JSON.stringify(protocolUrl)}`);
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
  const module = await import(moduleUrl);
  const sources = module.TOPIC_DELETE_USERSCRIPT_SOURCES;
  for (const [id, filename] of Object.entries(TOPIC_DELETE_OUTPUTS)) {
    if (typeof sources?.[id] !== "string" || !sources[id]) {
      throw new Error(`shared/topic-delete-userscript-sources.js: missing ${id}`);
    }
    expectedFile(path.posix.join("topic-delete-userscripts", filename), sources[id]);
  }
}

(async () => {
  assertGeneratedArtifactInventory(root);
  const [protocol, configs] = await Promise.all([protocolModule(), Promise.resolve(summaryConfigs())]);
  await validateSummaryCatalog(configs);
  await buildContent(configs, protocol);
  if (!contentOnly && contentOutputRoot === root) await generateDeleteSites();
  if (stale.length) {
    console.error("Generated artifacts are stale:");
    for (const relativePath of stale) console.error(`  - ${relativePath}`);
    console.error("Run `npm run generate` and commit the resulting files.");
    process.exitCode = 1;
    return;
  }
  if (checkOnly || generatedCount === 0) console.log("Generated artifacts are up to date.");
  else console.log(`Generated ${generatedCount} artifact${generatedCount === 1 ? "" : "s"}.`);
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
