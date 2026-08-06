#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "content-src/shared/dom-runtime.js"),
  "utf8"
);

function runDirectClick({ pointerResult = true, nativeResult = true } = {}) {
  const calls = [];
  const context = vm.createContext({
    visible: () => true,
    isDisabledElement: () => false,
    modelCenterPoint: () => ({ x: 10, y: 20 }),
    dispatchPointerActivation: () => {
      calls.push("pointer");
      return pointerResult;
    },
    nativeModelClick: () => {
      calls.push("native");
      return nativeResult;
    }
  });
  vm.runInContext(
    `${functionSource(source, "modelDirectClick")}; globalThis.run = modelDirectClick;`,
    context
  );
  const element = {
    scrollIntoView() {},
    focus() {}
  };
  const result = context.run(element);
  return { result, calls };
}

{
  const outcome = runDirectClick();
  assert.equal(outcome.result, true);
  assert.deepEqual(
    outcome.calls,
    ["pointer", "native"],
    "a successful pointer dispatch must still be followed by the native click"
  );
}

{
  const outcome = runDirectClick({ pointerResult: false, nativeResult: true });
  assert.equal(outcome.result, true);
  assert.deepEqual(outcome.calls, ["pointer", "native"]);
}

console.log("preferred-model DOM activation: ok");
