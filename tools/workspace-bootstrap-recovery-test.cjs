#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const load = (file) => import(`${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}-${Math.random()}`);

function manualTimers() {
  const pending = [];
  return {
    setTimer(callback, delay) {
      pending.push({ callback, delay });
      return pending.length;
    },
    nextDelay() {
      return pending[0]?.delay ?? null;
    },
    async runNext() {
      const task = pending.shift();
      if (task) await task.callback();
    },
    count() {
      return pending.length;
    }
  };
}

(async () => {
  const { createWorkspaceBootstrapRecoveryController } = await load(
    "app/workspace/bootstrap-recovery-controller.js"
  );
  const timers = manualTimers();
  const shells = [];
  const bannerShells = [];
  let inventoryRefreshes = 0;
  let loadAttempts = 0;
  let reloads = 0;
  let clock = 0;
  let loadingIds = ["frame-a"];
  let frames = [{ dataset: { instanceId: "frame-a" } }];
  const controller = createWorkspaceBootstrapRecoveryController({
    appRoot: { replaceChildren: (shell) => { shells.push(shell); } },
    clearedTabsController: {
      syncBanner: (shell) => { bannerShells.push(shell); },
      refresh: async () => { inventoryRefreshes += 1; return []; }
    },
    createElement: (tag, attrs, ...children) => ({ tag, attrs, children, isConnected: true }),
    currentFrames: () => frames,
    frameLoadingInstanceIds: () => loadingIds,
    reloadPage: () => { reloads += 1; },
    sessionStore: {
      load: async () => {
        loadAttempts += 1;
        if (loadAttempts === 1) throw new Error("runtime unavailable");
        return { restored: true };
      }
    },
    sleep: async (delay) => {
      clock += delay;
      loadingIds = [];
    },
    setTimer: timers.setTimer,
    now: () => clock
  });

  const shell = controller.renderRuntimeBootstrapFailure(new Error("claim timed out"));
  await Promise.resolve();
  assert.equal(shells.at(-1), shell);
  assert.equal(inventoryRefreshes, 1);
  assert.deepEqual(bannerShells, [shell, shell]);

  controller.scheduleWorkspaceSessionLoadRecovery();
  assert.equal(timers.nextDelay(), 1000);
  await timers.runNext();
  assert.equal(loadAttempts, 1);
  assert.equal(timers.nextDelay(), 3000);
  await timers.runNext();
  assert.equal(loadAttempts, 2);
  assert.equal(reloads, 1);
  assert.equal(timers.count(), 0);

  assert.deepEqual(
    await controller.waitForInitialWorkspaceFrameRestoration(100),
    { timedOut: false, pendingInstanceIds: [] }
  );

  clock = 0;
  loadingIds = ["frame-a"];
  frames = [{ dataset: { instanceId: "frame-a" } }];
  const timeoutController = createWorkspaceBootstrapRecoveryController({
    appRoot: null,
    clearedTabsController: { syncBanner() {}, refresh: async () => [] },
    createElement: () => ({}),
    currentFrames: () => frames,
    frameLoadingInstanceIds: () => loadingIds,
    reloadPage() {},
    sessionStore: { load: async () => null },
    sleep: async (delay) => { clock += delay; },
    now: () => clock
  });
  assert.deepEqual(
    await timeoutController.waitForInitialWorkspaceFrameRestoration(75),
    { timedOut: true, pendingInstanceIds: ["frame-a"] }
  );

  const optionsTimers = manualTimers();
  const optionsController = createWorkspaceBootstrapRecoveryController({
    isOptionsPage: true,
    setTimer: optionsTimers.setTimer
  });
  optionsController.scheduleWorkspaceSessionLoadRecovery();
  assert.equal(optionsTimers.count(), 0, "the Settings surface must not enter workspace recovery reloads");

  console.log("workspace bootstrap recovery controller: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
