#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const eslintBin = path.join(root, "node_modules/eslint/bin/eslint.js");

function lintSource(filename, source) {
  const result = spawnSync(process.execPath, [eslintBin, "--stdin", "--stdin-filename", filename], {
    cwd: root,
    input: source,
    encoding: "utf8",
    timeout: 30_000
  });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout || ""}${result.stderr || ""}` };
}

(async () => {
  const configuration = (await import(pathToFileURL(path.join(root, "eslint.config.js")).href)).default;
  const realm = (pattern) => configuration.find((entry) => entry.files?.includes(pattern));
  const app = realm("app/**/*.js");
  const background = realm("background/**/*.js");
  const content = realm("content-src/**/*.js");
  const shared = realm("shared/**/*.js");
  const build = realm("build-src/**/*.js");
  for (const [name, entry] of Object.entries({ app, background, content, shared, build })) {
    assert.ok(entry, `${name} ESLint realm is missing`);
    assert.equal(entry.rules?.["no-undef"], "error");
    const unused = entry.rules?.["no-unused-vars"];
    assert.equal(unused?.[0], "error", `${name} must reject unused imports and locals`);
    assert.equal(unused?.[1]?.args, "all");
    assert.equal(unused?.[1]?.argsIgnorePattern, "^_[A-Za-z0-9_$]*$");
    assert.equal(unused?.[1]?.varsIgnorePattern, undefined, `${name} must not hide unused locals behind a pattern`);
    assert.equal(unused?.[1]?.reportUsedIgnorePattern, true);
  }
  assert.ok(Object.hasOwn(app.languageOptions.globals, "window"));
  assert.ok(Object.hasOwn(app.languageOptions.globals, "document"));
  assert.ok(Object.hasOwn(app.languageOptions.globals, "chrome"));
  assert.ok(Object.hasOwn(content.languageOptions.globals, "window"));
  assert.ok(Object.hasOwn(content.languageOptions.globals, "document"));
  assert.ok(Object.hasOwn(content.languageOptions.globals, "chrome"));
  assert.ok(Object.hasOwn(background.languageOptions.globals, "ServiceWorkerGlobalScope"));
  assert.ok(Object.hasOwn(background.languageOptions.globals, "chrome"));
  assert.equal(Object.hasOwn(background.languageOptions.globals, "window"), false);
  assert.equal(Object.hasOwn(background.languageOptions.globals, "document"), false);
  assert.ok(Object.hasOwn(shared.languageOptions.globals, "URL"));
  assert.equal(Object.hasOwn(shared.languageOptions.globals, "window"), false);
  assert.equal(Object.hasOwn(shared.languageOptions.globals, "document"), false);
  assert.ok(Object.hasOwn(shared.languageOptions.globals, "chrome"));
  assert.ok(Object.hasOwn(build.languageOptions.globals, "process"));
  assert.equal(Object.hasOwn(build.languageOptions.globals, "document"), false);
  for (const [name, filename, source, expected] of [
    ["shared globalThis DOM", "shared/__realm_probe__.js", "export const leak = globalThis.document.body;\n", /document is not available/],
    ["shared computed DOM", "shared/__realm_probe__.js", "export const leak = globalThis[\"doc\" + \"ument\"].body;\n", /document is not available/],
    ["shared reflected DOM", "shared/__realm_probe__.js", "export const leak = Reflect.get(globalThis, \"document\").body;\n", /document is not available/],
    ["shared wrapped DOM", "shared/__realm_probe__.js", "export const leak = Object(globalThis).document.body;\n", /document is not available/],
    ["background self DOM", "background/__realm_probe__.js", "export const leak = self.document.body;\n", /document is not available/],
    ["background global alias", "background/__realm_probe__.js", "const realm = globalThis; export const leak = realm.document;\n", /Aliasing the realm global object/],
    ["app worker global", "app/__realm_probe__.js", "export const leak = globalThis.clients;\n", /clients is not available/],
    ["content worker global", "content-src/__realm_probe__.js", "export const leak = self.clients;\n", /clients is not available/],
    ["app Node global", "app/__realm_probe__.js", "export const leak = globalThis.process.env;\n", /process is not available/],
    ["build DOM global", "build-src/__realm_probe__.js", "export const leak = globalThis.document.body;\n", /document is not available/],
    ["unused local", "app/__realm_probe__.js", "const unused = 1; export const value = 2;\n", /unused.*never used/],
    ["unused import", "shared/__realm_probe__.js", 'import { unused } from "./dependency.js"; export const value = 1;\n', /unused.*never used/],
    ["unused interface argument", "content-src/__realm_probe__.js", "export function probe(value) { return 1; }\n", /value.*never used/],
    ["used ignored argument", "background/__realm_probe__.js", "export function probe(_context) { return _context; }\n", /marked as ignored but is used/]
  ]) {
    const result = lintSource(filename, source);
    assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
    assert.match(result.output, expected, `${name} failed for the wrong reason:\n${result.output}`);
  }

  for (const [name, filename, source] of [
    ["shared common global", "shared/__realm_probe__.js", "export const value = globalThis.crypto?.randomUUID?.();\n"],
    ["shared extension global", "shared/__realm_probe__.js", "export const value = globalThis.chrome?.runtime?.id;\n"],
    ["background worker global", "background/__realm_probe__.js", "export const value = globalThis.clients;\n"],
    ["app DOM global", "app/__realm_probe__.js", "export const value = globalThis.document.body;\n"],
    ["build Node global", "build-src/__realm_probe__.js", "export const value = globalThis.process.version;\n"],
    ["explicit unused interface argument", "app/__realm_probe__.js", "export function probe(_context) { return 1; }\n"],
    ["explicit unused caught error", "shared/__realm_probe__.js", "export function probe() { try { return globalThis.crypto.randomUUID(); } catch (_error) { return \"\"; } }\n"]
  ]) {
    const result = lintSource(filename, source);
    assert.equal(result.status, 0, `${name} unexpectedly failed:\n${result.output}`);
  }

  console.log("ESLint runtime realms: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
