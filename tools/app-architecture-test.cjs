#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function relative(absolute) {
  return path.relative(root, absolute).replaceAll(path.sep, "/");
}

function appDomain(file) {
  if (new Set(["app/main.js", "app/runtime.js", "app/state.js", "app/controller-contract.js"]).has(file)) return "core";
  return file.split("/")[1] || "core";
}

(async () => {
  const { init, parse } = await import("es-module-lexer");
  await init;
  const files = walk(path.join(root, "app"))
    .filter((file) => file.endsWith(".js"))
    .map(relative)
    .sort();
  const graph = new Map();
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const [imports] = parse(source, file);
    const dependencies = imports
      .map((entry) => entry.n)
      .filter((specifier) => typeof specifier === "string" && specifier.startsWith("."))
      .map((specifier) => path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
    graph.set(file, dependencies);
  }

  const reachable = new Set();
  const pending = ["app/main.js"];
  while (pending.length) {
    const file = pending.pop();
    if (reachable.has(file)) continue;
    reachable.add(file);
    for (const dependency of graph.get(file) || []) {
      if (dependency.startsWith("app/")) pending.push(dependency);
    }
  }
  assert.deepEqual(
    files.filter((file) => !reachable.has(file)),
    [],
    "every packaged App module must be reachable from app/main.js, including literal lazy imports"
  );

  const additionalDomainEdges = Object.freeze({
    pocket: new Set(["summary"]),
    settings: new Set(["prompt-library"])
  });
  for (const [owner, dependencies] of graph) {
    const from = appDomain(owner);
    for (const dependency of dependencies.filter((file) => file.startsWith("app/"))) {
      const to = appDomain(dependency);
      if (from === "core" || to === "core" || from === to || additionalDomainEdges[from]?.has(to)) continue;
      assert.fail(`illegal App domain dependency: ${owner} -> ${dependency}`);
    }
  }

  const runtime = fs.readFileSync(path.join(root, "app/runtime.js"), "utf8");
  for (const statePort of [
    "./composer/state-port.js",
    "./preferred-model/state-port.js",
    "./topbar/state-port.js",
    "./favicon/state-port.js",
    "./settings/state-ports.js"
  ]) {
    assert.match(runtime, new RegExp(`from ["']${statePort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
  }
  assert.ok(runtime.split(/\r?\n/).length < 2800, "App runtime must remain below the post-extraction consolidation ceiling");
  for (const boundary of [
    "app/frame-bridge/controller.js",
    "app/preferred-model/controller.js",
    "app/topbar/editor.js"
  ]) {
    assert.ok(fs.readFileSync(path.join(root, boundary), "utf8").split(/\r?\n/).length > 150, `${boundary} must remain a substantive boundary`);
  }

  console.log(`app architecture domains and reachability: ok (${files.length} reachable modules)`);
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
