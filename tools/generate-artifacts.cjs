#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");
const { enforceNodeVersion } = require("./node-version.cjs");
const { assertContainedOutputPath } = require("./repository-files.cjs");
const {
  CONTENT_ENTRIES,
  CONTENT_RUNTIME_VERSION_MODULE,
  FIREFOX_CONTENT_FALLBACK_OUTPUT,
  TOPIC_DELETE_OUTPUTS,
  contentRuntimeBundleSourceStates,
  contentRuntimeBuildRecipeState,
  contentRuntimeImplementationVersion,
  contentRuntimeSourceState,
  contentRuntimeVersionModule,
  assertGeneratedArtifactDirectInputs,
  assertSummaryCatalogMetadata,
  assertTopicDeleteDescriptors,
  assertGeneratedArtifactInventory
} = require("./generated-artifacts.cjs");

enforceNodeVersion({ context: "Artifact generation", strict: true });

const root = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");
const contentOnly = process.argv.includes("--content-only");
const sourceMaps = process.argv.includes("--sourcemap");
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
if (sourceMaps && (checkOnly || contentOutputRoot === root)) {
  throw new Error("--sourcemap is supported only for a non-release --output-root build");
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function expectedFile(relativePath, expected, base = root) {
  const absolutePath = assertContainedOutputPath(base, relativePath);
  const entry = fs.lstatSync(absolutePath, { throwIfNoEntry: false });
  const actual = entry?.isFile() ? fs.readFileSync(absolutePath, "utf8") : null;
  if (actual === expected) return;
  if (checkOnly) {
    stale.push(relativePath);
    return;
  }
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  assertContainedOutputPath(base, relativePath);
  fs.writeFileSync(absolutePath, expected);
  generatedCount += 1;
  console.log(`generated ${path.relative(root, absolutePath) || relativePath}`);
}

function developmentMapSource(source, temporaryOutput) {
  const value = String(source || "").replace(/\\/g, "/");
  if (value.startsWith("chatclub-generated:")) {
    return `virtual/${value.slice("chatclub-generated:".length).replace(/^\/+/, "")}.js`;
  }
  if (value.startsWith("chatclub-runtime-version:")) {
    return value.slice("chatclub-runtime-version:".length).replace(/^\/+/, "");
  }
  const absolute = path.resolve(path.dirname(temporaryOutput), value);
  const relative = path.relative(root, absolute).replace(/\\/g, "/");
  if (!relative || relative.startsWith("../") || path.posix.isAbsolute(relative)) {
    throw new Error(`Development source map contains a source outside the repository: ${value}`);
  }
  return relative;
}

function stableDevelopmentSourceMap(source, temporaryOutput) {
  const map = JSON.parse(source);
  map.sourceRoot = "chatclub:///";
  map.sources = (map.sources || []).map((item) => developmentMapSource(item, temporaryOutput));
  map.file = path.basename(String(map.file || temporaryOutput));
  return `${JSON.stringify(map)}\n`;
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
  assertSummaryCatalogMetadata(configs, module.SUMMARY_SITE_CONFIGS);
}

async function buildContent(configs, protocol) {
  const sourceState = contentRuntimeSourceState(root);
  const bundleSourceStates = contentRuntimeBundleSourceStates(root);
  const buildRecipeState = contentRuntimeBuildRecipeState(root);
  const implementationVersion = contentRuntimeImplementationVersion(
    protocol.CONTENT_BRIDGE_VERSION,
    sourceState.sha256,
    buildRecipeState.sha256
  );
  const runtimeVersionSource = contentRuntimeVersionModule({
    protocolVersion: protocol.CONTENT_BRIDGE_VERSION,
    registryBaseKey: protocol.RUNTIME_REGISTRY_KEY,
    sourceSha256: sourceState.sha256,
    buildRecipeVersion: buildRecipeState.version,
    buildRecipeSha256: buildRecipeState.sha256,
    bundleSourceStates
  });
  expectedFile(CONTENT_RUNTIME_VERSION_MODULE, runtimeVersionSource, contentOutputRoot);
  const registrySource = summaryRegistryModule(configs, implementationVersion);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatclub-content-build-"));
  const registryPlugin = {
    name: "chatclub-generated-content-inputs",
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
      build.onResolve({ filter: /content-runtime-version\.generated\.js$/ }, () => ({
        path: CONTENT_RUNTIME_VERSION_MODULE,
        namespace: "chatclub-runtime-version"
      }));
      build.onLoad({ filter: /.*/, namespace: "chatclub-runtime-version" }, () => ({
        contents: runtimeVersionSource,
        loader: "js",
        resolveDir: root
      }));
    }
  };
  const builtContent = new Map();

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
        sourcemap: sourceMaps ? "linked" : false,
        sourcesContent: sourceMaps,
        charset: "utf8",
        legalComments: "inline",
        plugins: [registryPlugin],
        write: true,
        logLevel: "silent"
      });
      const output = fs.readFileSync(temporaryOutput, "utf8");
      if (/\bimport\s*\(/.test(output)) throw new Error(`${outputPath}: runtime dynamic import is forbidden`);
      if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(output)) throw new Error(`${outputPath}: eval/Function is forbidden`);
      builtContent.set(outputPath, output);
      expectedFile(outputPath, output, contentOutputRoot);
      if (sourceMaps) {
        expectedFile(
          `${outputPath}.map`,
          stableDevelopmentSourceMap(fs.readFileSync(`${temporaryOutput}.map`, "utf8"), temporaryOutput),
          contentOutputRoot
        );
      }
    }
    const fallbackEntries = [];
    for (const outputPath of Object.keys(CONTENT_ENTRIES)) {
      const output = builtContent.get(outputPath)?.replace(/\n?\/\/# sourceMappingURL=[^\n]+\s*$/, "");
      if (!output) throw new Error(`${outputPath}: Firefox fallback source was not built`);
      const transformed = await esbuild.transform(output, {
        loader: "js",
        format: "iife",
        platform: "browser",
        target: ["firefox136"],
        minify: !sourceMaps,
        sourcemap: false,
        charset: "utf8",
        legalComments: sourceMaps ? "inline" : "none",
        logLevel: "silent"
      });
      if (/\bimport\s*\(/.test(transformed.code)) throw new Error(`${outputPath}: Firefox fallback contains dynamic import`);
      if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(transformed.code)) throw new Error(`${outputPath}: Firefox fallback contains eval/Function`);
      const name = `chatclubFirefoxContentFallback${fallbackEntries.length + 1}`;
      const sourceUrl = sourceMaps ? `\n//# sourceURL=chatclub:///${outputPath}?firefox-fallback` : "";
      fallbackEntries.push(`  ${JSON.stringify(outputPath)}: function ${name}() {\n${transformed.code.trim()}${sourceUrl}\n  }`);
    }
    expectedFile(
      FIREFOX_CONTENT_FALLBACK_OUTPUT,
      `// Generated by tools/generate-artifacts.cjs. Do not edit.\nexport const FIREFOX_CONTENT_FALLBACKS = Object.freeze({\n${fallbackEntries.join(",\n")}\n});\n`,
      contentOutputRoot
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function generateDeleteSites() {
  const modulePath = path.join(root, "build-src/topic-delete-userscript-sources.js");
  const descriptorPath = path.join(root, "shared/topic-delete-sites.js");
  const [module, descriptorModule] = await Promise.all([
    import(`${require("node:url").pathToFileURL(modulePath).href}?generated=${Date.now()}`),
    import(`${require("node:url").pathToFileURL(descriptorPath).href}?generated=${Date.now()}`)
  ]);
  const sources = module.TOPIC_DELETE_USERSCRIPT_SOURCES;
  for (const [id, filename] of Object.entries(TOPIC_DELETE_OUTPUTS)) {
    if (typeof sources?.[id] !== "string" || !sources[id]) {
      throw new Error(`build-src/topic-delete-userscript-sources.js: missing ${id}`);
    }
    expectedFile(path.posix.join("topic-delete-userscripts", filename), sources[id]);
  }
  assertTopicDeleteDescriptors(sources, descriptorModule.TOPIC_DELETE_SITE_CONFIGS);
}

(async () => {
  assertGeneratedArtifactDirectInputs(root);
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
