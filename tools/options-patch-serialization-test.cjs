#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const runtimeSource = fs.readFileSync(path.join(root, "app/runtime.js"), "utf8");
const savePatchSource = functionSource(runtimeSource, "saveOptionsPatch");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function flush() {
  return new Promise((resolve) => { setImmediate(resolve); });
}

(async () => {
  assert.match(runtimeSource, /let optionsPatchWriteTail = Promise\.resolve\(\)/);
  assert.match(runtimeSource, /const pendingOptionsPatches = \[\]/);
  assert.match(savePatchSource, /optionsPatchWriteTail\.catch\(\(\) => \{\}\)\.then\(write\)/);

  const saves = [];
  const context = vm.createContext({
    state: { options: { themeMode: "light", modelPreferenceFailurePolicy: "send-current" } },
    saveOptions(options) {
      const gate = deferred();
      saves.push({ gate, options: structuredClone(options) });
      return gate.promise;
    },
    structuredClone
  });
  vm.runInContext(`
    let optionsPatchWriteTail = Promise.resolve();
    const pendingOptionsPatches = [];
    ${functionSource(runtimeSource, "pendingOptionsPatchOverlay")}
    ${savePatchSource}
    globalThis.savePatch = saveOptionsPatch;
  `, context);

  const first = context.savePatch({ themeMode: "dark" });
  await flush();
  assert.equal(saves.length, 1, "the first patch must begin immediately");
  context.state.options = { ...context.state.options, modelPreferenceFailurePolicy: "skip" };
  const second = context.savePatch({ modelPreferenceFailurePolicy: "skip" });
  await flush();
  assert.equal(saves.length, 1, "a later patch must wait for the in-flight storage write");
  saves[0].gate.resolve(saves[0].options);
  assert.equal((await first).themeMode, "dark");
  for (let attempt = 0; attempt < 10 && saves.length < 2; attempt += 1) await flush();
  assert.equal(saves.length, 2, "the second patch must run after the first settles");
  assert.equal(
    context.state.options.modelPreferenceFailurePolicy,
    "skip",
    "an older save result must not temporarily roll back a newer accepted policy"
  );
  assert.deepEqual(saves[1].options, {
    themeMode: "dark",
    modelPreferenceFailurePolicy: "skip"
  });
  saves[1].gate.resolve(saves[1].options);
  await second;

  const failed = context.savePatch({ themeMode: "system" });
  await flush();
  assert.equal(saves.length, 3);
  const recovered = context.savePatch({ modelPreferenceFailurePolicy: "send-current" });
  saves[2].gate.reject(new Error("temporary storage failure"));
  await assert.rejects(failed, /temporary storage failure/);
  for (let attempt = 0; attempt < 10 && saves.length < 4; attempt += 1) await flush();
  assert.equal(saves.length, 4, "a failed write must not strand later accepted patches");
  saves[3].gate.resolve(saves[3].options);
  assert.equal((await recovered).modelPreferenceFailurePolicy, "send-current");

  console.log("serialized options patches: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
