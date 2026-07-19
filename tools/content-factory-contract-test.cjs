#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const espree = require("espree");

const root = path.resolve(__dirname, "..");

function parse(file) {
  return espree.parse(fs.readFileSync(path.join(root, file), "utf8"), {
    ecmaVersion: "latest",
    sourceType: "module"
  });
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
    else if (value && typeof value === "object" && typeof value.type === "string") walk(value, visit);
  }
}

function propertyName(property, label) {
  assert.equal(property.type, "Property", `${label} must use explicit object properties, not spread elements`);
  assert.equal(property.computed, false, `${label} must use statically named dependency properties`);
  return property.key.type === "Identifier" ? property.key.name : String(property.key.value || "");
}

function factoryDependencyNames(file, factoryName) {
  let factory = null;
  walk(parse(file), (node) => {
    if (node.type === "FunctionDeclaration" && node.id?.name === factoryName) factory = node;
  });
  assert.ok(factory, `${file} must declare ${factoryName}`);
  let dependencies = null;
  walk(factory.body, (node) => {
    if (
      !dependencies
      && node.type === "VariableDeclarator"
      && node.init?.type === "Identifier"
      && node.init.name === "deps"
      && node.id?.type === "ObjectPattern"
    ) dependencies = node.id;
  });
  assert.ok(dependencies, `${file}#${factoryName} must destructure its dependency contract`);
  const names = dependencies.properties.map((property) => propertyName(property, `${file}#${factoryName}`));
  assert.equal(new Set(names).size, names.length, `${file}#${factoryName} dependency contract must not repeat names`);
  return names.sort();
}

function callDependencyNames(entryFile, factoryName) {
  const calls = [];
  walk(parse(entryFile), (node) => {
    if (node.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === factoryName) {
      calls.push(node);
    }
  });
  assert.equal(calls.length, 1, `${entryFile} must call ${factoryName} exactly once`);
  const argument = calls[0].arguments[0];
  assert.equal(argument?.type, "ObjectExpression", `${entryFile}#${factoryName} must receive an explicit object contract`);
  const names = argument.properties.map((property) => propertyName(property, `${entryFile}#${factoryName}`));
  assert.equal(new Set(names).size, names.length, `${entryFile}#${factoryName} must not repeat dependency properties`);
  return names.sort();
}

function factoryReturnNames(file, factoryName) {
  let factory = null;
  walk(parse(file), (node) => {
    if (node.type === "FunctionDeclaration" && node.id?.name === factoryName) factory = node;
  });
  assert.ok(factory, `${file} must declare ${factoryName}`);
  const returned = factory.body.body.find((node) => node.type === "ReturnStatement")?.argument;
  assert.equal(returned?.type, "CallExpression", `${file}#${factoryName} must return a frozen capability object`);
  assert.equal(returned.callee?.type, "MemberExpression", `${file}#${factoryName} must freeze its capability object`);
  assert.equal(returned.callee.object?.name, "Object", `${file}#${factoryName} must use Object.freeze`);
  assert.equal(returned.callee.property?.name, "freeze", `${file}#${factoryName} must use Object.freeze`);
  const object = returned.arguments[0];
  assert.equal(object?.type, "ObjectExpression", `${file}#${factoryName} must return an explicit capability object`);
  const names = object.properties.map((property) => propertyName(property, `${file}#${factoryName} return`));
  assert.equal(new Set(names).size, names.length, `${file}#${factoryName} return contract must not repeat names`);
  return names.sort();
}

function callResultDemandNames(entryFile, factoryName) {
  const ast = parse(entryFile);
  let binding = "";
  walk(ast, (node) => {
    if (
      node.type === "VariableDeclarator"
      && node.id?.type === "Identifier"
      && node.init?.type === "CallExpression"
      && node.init.callee?.type === "Identifier"
      && node.init.callee.name === factoryName
    ) binding = node.id.name;
  });
  assert.ok(binding, `${entryFile} must bind the result of ${factoryName}`);
  const names = new Set();
  walk(ast, (node) => {
    if (node.type !== "MemberExpression" || node.object?.type !== "Identifier" || node.object.name !== binding) return;
    assert.equal(node.computed, false, `${entryFile} must consume ${binding} through static property names`);
    names.add(node.property.name);
  });
  return [...names].sort();
}

const contracts = [
  ["content-src/content-delete.js", "content-src/shared/dom-runtime.js", "createDomRuntime"],
  ["content-src/content-delete.js", "content-src/capabilities/delete-common.js", "createDeleteCommonCapability"],
  ["content-src/content-delete.js", "content-src/capabilities/delete-sites.js", "createDeleteSitesCapability"],
  ["content-src/content-delete.js", "content-src/capabilities/delete-deepseek.js", "createDeleteDeepSeekCapability"],
  ["content-src/content-delete.js", "content-src/capabilities/delete-runtime.js", "createDeleteRuntimeCapability"],
  ["content-src/content-preferred-model.js", "content-src/capabilities/preferred-common.js", "createPreferredCommonCapability"],
  ["content-src/content-preferred-model.js", "content-src/shared/dom-runtime.js", "createPreferredDomRuntime"],
  ["content-src/content-preferred-model.js", "content-src/capabilities/preferred-gemini.js", "createPreferredGeminiCapability"],
  ["content-src/content-preferred-model.js", "content-src/capabilities/preferred-grok.js", "createPreferredGrokCapability"],
  ["content-src/content-preferred-model.js", "content-src/capabilities/preferred-notion-deepseek.js", "createPreferredNotionDeepSeekCapability"]
];

for (const [entryFile, factoryFile, factoryName] of contracts) {
  assert.deepEqual(
    callDependencyNames(entryFile, factoryName),
    factoryDependencyNames(factoryFile, factoryName),
    `${entryFile} must pass exactly the dependencies consumed by ${factoryFile}#${factoryName}`
  );
  assert.deepEqual(
    factoryReturnNames(factoryFile, factoryName),
    callResultDemandNames(entryFile, factoryName),
    `${factoryFile}#${factoryName} must expose exactly the capability methods consumed by ${entryFile}`
  );
}

console.log(`${contracts.length} content capability factory contracts are exact`);
