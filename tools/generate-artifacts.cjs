#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");
const stale = [];
let generatedCount = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function expectedFile(relativePath, expected) {
  const absolutePath = path.join(root, relativePath);
  const actual = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : null;
  if (actual === expected) return;
  if (checkOnly) {
    stale.push(relativePath);
    return;
  }
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, expected);
  generatedCount += 1;
  console.log(`generated ${relativePath}`);
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

function summaryRegistry(configs, runtimeVersion) {
  let output = "(() => {\n  const scripts = Object.create(null);\n";
  for (const config of configs) {
    output += `  scripts[${JSON.stringify(config.id)}] = async function(api) {\n`;
    output += `${config.userscript}\n`;
    output += "  };\n";
    output += `  scripts[${JSON.stringify(config.userscriptFile)}] = scripts[${JSON.stringify(config.id)}];\n`;
  }
  output += `  window.__CHATCLUB_SUMMARY_SCRIPTS_VERSION__ = ${JSON.stringify(runtimeVersion)};\n`;
  output += "  window.__CHATCLUB_SUMMARY_SCRIPTS__ = scripts;\n})();\n";
  return output;
}

function generateSummary(protocol) {
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

  expectedFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  expectedFile(
    "shared/summary-sites.js",
    `export const SUMMARY_SITE_CONFIGS = ${JSON.stringify(configs, null, 2)};\n`
  );

  const registry = summaryRegistry(configs, protocol.CONTENT_BRIDGE_VERSION);
  expectedFile("content/summary-userscripts.js", registry);

  const mainPath = "content/summary-userscripts-main.js";
  const currentMain = read(mainPath);
  const registryStartMarker = "  const scripts = Object.create(null);\n";
  const registryEndMarker = "  window.__CHATCLUB_SUMMARY_SCRIPTS__ = scripts;\n";
  const registryStart = currentMain.indexOf(registryStartMarker);
  const registryEnd = currentMain.indexOf(registryEndMarker);
  if (registryStart < 0 || registryEnd < registryStart) {
    throw new Error(`${mainPath}: generated registry boundary not found`);
  }
  const runtimeOffset = registryEnd + registryEndMarker.length;
  const generatedRegistryBody = registry.slice("(() => {\n".length, -"})();\n".length);
  const expectedMain = currentMain.slice(0, registryStart) + generatedRegistryBody + currentMain.slice(runtimeOffset);
  return expectedMain;
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
  const outputs = {
    chatgpt: "chatgpt.user.js",
    deepseek: "deepseek.user.js",
    gemini: "gemini.user.js",
    grokMirror: "grok-mirror.user.js",
    grok: "grok.user.js",
    kagi: "kagi.user.js",
    notion: "notion.user.js"
  };
  for (const [id, filename] of Object.entries(outputs)) {
    if (typeof sources?.[id] !== "string" || !sources[id]) {
      throw new Error(`shared/topic-delete-userscript-sources.js: missing ${id}`);
    }
    expectedFile(path.posix.join("topic-delete-userscripts", filename), sources[id]);
  }
}

async function generateProtocol() {
  const moduleSource = read("shared/protocol.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
  const module = await import(moduleUrl);
  const protocol = module.CONTENT_PROTOCOL;
  if (!protocol || typeof protocol !== "object" || !Object.keys(protocol).length) {
    throw new Error("shared/protocol.js: CONTENT_PROTOCOL must be a non-empty object");
  }
  const serialized = JSON.stringify(protocol, null, 2)
    .split("\n")
    .map((line, index) => index === 0 ? line : `  ${line}`)
    .join("\n");
  const bootstrap = `(() => {\n  // Generated from shared/protocol.js. Run \`npm run generate\` after changing\n  // protocol versions; \`npm run verify:generated\` rejects drift.\n  globalThis.__CHATCLUB_PROTOCOL__ = Object.freeze(${serialized});\n})();\n`;
  expectedFile("content/protocol.js", bootstrap);
  return { protocol, serialized, bootstrap };
}

const LEGACY_CONTENT_PROTOCOL_PRELUDE = `(() => {\n  const PROTOCOL = globalThis.__CHATCLUB_PROTOCOL__;\n  if (!PROTOCOL) throw new Error("ChatClub protocol bootstrap is unavailable");\n`;
const EMBEDDED_PROTOCOL_START = "  // <chatclub-generated-protocol>\n";
const EMBEDDED_PROTOCOL_END = "  // </chatclub-generated-protocol>\n";

function embeddedProtocolBlock(serializedProtocol) {
  return `${EMBEDDED_PROTOCOL_START}  const PROTOCOL = Object.freeze(${serializedProtocol});\n${EMBEDDED_PROTOCOL_END}`;
}

function embedProtocol(sourcePath, source, serializedProtocol) {
  const block = embeddedProtocolBlock(serializedProtocol);
  if (source.startsWith(LEGACY_CONTENT_PROTOCOL_PRELUDE)) {
    return `(() => {\n${block}${source.slice(LEGACY_CONTENT_PROTOCOL_PRELUDE.length)}`;
  }
  const start = source.indexOf(EMBEDDED_PROTOCOL_START);
  const secondStart = source.indexOf(EMBEDDED_PROTOCOL_START, start + 1);
  const endStart = source.indexOf(EMBEDDED_PROTOCOL_END, start + EMBEDDED_PROTOCOL_START.length);
  const secondEnd = source.indexOf(EMBEDDED_PROTOCOL_END, endStart + EMBEDDED_PROTOCOL_END.length);
  if (!source.startsWith("(() => {\n") || start < 0 || secondStart !== -1 || endStart < start || secondEnd !== -1) {
    throw new Error(`${sourcePath}: expected exactly one generated protocol block in the runtime IIFE`);
  }
  const end = endStart + EMBEDDED_PROTOCOL_END.length;
  return source.slice(0, start) + block + source.slice(end);
}

function generateEmbeddedProtocolRuntimes(protocol, expectedSummaryMain) {
  const runtimes = [
    ["content/preload.js", read("content/preload.js")],
    ["content/content.js", read("content/content.js")],
    ["content/summary-userscripts-main.js", expectedSummaryMain]
  ];
  for (const [runtimePath, source] of runtimes) {
    expectedFile(runtimePath, embedProtocol(runtimePath, source, protocol.serialized));
  }
}

(async () => {
  const protocol = await generateProtocol();
  const expectedSummaryMain = generateSummary(protocol.protocol);
  generateEmbeddedProtocolRuntimes(protocol, expectedSummaryMain);
  await generateDeleteSites();
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
