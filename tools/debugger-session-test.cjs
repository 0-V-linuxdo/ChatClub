#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "background/debugger-session.js"), "utf8");
const dataModule = (body) => import(`data:text/javascript;base64,${Buffer.from(body).toString("base64")}`);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeApi(options = {}) {
  const events = [];
  const commands = [];
  const attachedTabs = new Set(options.externallyAttachedTabs || []);
  const attachedTargets = new Set([
    ...attachedTabs].map((tabId) => `tab:${tabId}`)
  );
  for (const targetId of options.externallyAttachedTargetIds || []) {
    attachedTargets.add(`target:${targetId}`);
  }
  const failedTabs = new Set(options.failedTabs || []);
  const failedTargetIds = new Set(options.failedTargetIds || []);
  const targetKey = (target) => Object.hasOwn(target, "targetId")
    ? `target:${target.targetId}`
    : `tab:${target.tabId}`;

  return {
    events,
    commands,
    attachedTabs,
    debugger: {
      async attach(target, version) {
        events.push({ type: "attach", target: { ...target }, version });
        if (failedTabs.has(target.tabId)) throw new Error(`attach failed for tab ${target.tabId}`);
        if (failedTargetIds.has(target.targetId)) throw new Error(`attach failed for target ${target.targetId}`);
        const key = targetKey(target);
        if (attachedTargets.has(key)) throw new Error(`${key} already has a debugger`);
        attachedTargets.add(key);
        if (Number.isInteger(target.tabId)) attachedTabs.add(target.tabId);
      },
      async sendCommand(target, method, params) {
        assert.equal(attachedTargets.has(targetKey(target)), true, "commands require an attached target");
        const command = { target: { ...target }, method, params: { ...params } };
        commands.push(command);
        events.push({ type: "command", ...command });
        return { commandNumber: commands.length };
      },
      async detach(target) {
        events.push({ type: "detach", target: { ...target } });
        const key = targetKey(target);
        assert.equal(attachedTargets.has(key), true, "only an attached target can be detached");
        attachedTargets.delete(key);
        if (Number.isInteger(target.tabId)) attachedTabs.delete(target.tabId);
      }
    }
  };
}

(async () => {
  const { createDebuggerSessionCoordinator } = await dataModule(source);

  for (const missingMethod of ["attach", "sendCommand", "detach"]) {
    const api = fakeApi();
    delete api.debugger[missingMethod];
    const coordinator = createDebuggerSessionCoordinator(api);
    assert.deepEqual(coordinator, { available: false });
    assert.equal(typeof coordinator.withTabDebugger, "undefined", "Firefox must not receive a throwing debugger dependency");
    assert.equal(typeof coordinator.withDebuggerTarget, "undefined");
  }

  {
    const api = fakeApi();
    const coordinator = createDebuggerSessionCoordinator(api);
    assert.equal(coordinator.available, true);
    const firstEntered = deferred();
    const releaseFirst = deferred();
    const order = [];

    const first = coordinator.withTabDebugger(5, async () => {
      order.push("first:start");
      firstEntered.resolve();
      await releaseFirst.promise;
      order.push("first:end");
      return "first-result";
    });
    await firstEntered.promise;

    const second = coordinator.withTabDebugger(5, async () => {
      order.push("second:start");
      order.push("second:end");
      return "second-result";
    });
    await Promise.resolve();
    assert.equal(
      api.events.filter((event) => event.type === "attach").length,
      1,
      "a second task for the same tab must wait before attaching"
    );
    assert.deepEqual(order, ["first:start"]);

    releaseFirst.resolve();
    assert.deepEqual(await Promise.all([first, second]), ["first-result", "second-result"]);
    assert.deepEqual(order, ["first:start", "first:end", "second:start", "second:end"]);
    assert.deepEqual(
      api.events.filter((event) => event.type === "attach" || event.type === "detach")
        .map((event) => `${event.type}:${event.target.tabId}`),
      ["attach:5", "detach:5", "attach:5", "detach:5"],
      "same-tab tasks must run in FIFO order with non-overlapping debugger ownership"
    );
  }

  {
    const api = fakeApi();
    const coordinator = createDebuggerSessionCoordinator(api);
    const firstEntered = deferred();
    const secondEntered = deferred();
    const release = deferred();
    let activeTasks = 0;
    let maximumActiveTasks = 0;

    const run = (tabId, entered) => coordinator.withTabDebugger(tabId, async () => {
      activeTasks += 1;
      maximumActiveTasks = Math.max(maximumActiveTasks, activeTasks);
      entered.resolve();
      await release.promise;
      activeTasks -= 1;
    });
    const first = run(6, firstEntered);
    const second = run(7, secondEntered);
    await Promise.all([firstEntered.promise, secondEntered.promise]);

    assert.equal(maximumActiveTasks, 2, "different tabs must be allowed to run concurrently");
    assert.deepEqual([...api.attachedTabs].sort((a, b) => a - b), [6, 7]);
    assert.equal(api.events.some((event) => event.type === "detach"), false);

    release.resolve();
    await Promise.all([first, second]);
    assert.deepEqual([...api.attachedTabs], []);
  }

  {
    const api = fakeApi({ failedTabs: [8] });
    const coordinator = createDebuggerSessionCoordinator(api);
    let taskExecuted = false;
    await assert.rejects(
      coordinator.withTabDebugger(8, async () => {
        taskExecuted = true;
      }),
      /attach failed for tab 8/
    );
    assert.equal(taskExecuted, false, "an attach failure must not execute the task");
    assert.equal(
      api.events.some((event) => event.type === "detach"),
      false,
      "an attach failure must not detach a session the coordinator never acquired"
    );
  }

  {
    const api = fakeApi();
    const coordinator = createDebuggerSessionCoordinator(api);
    const taskError = new Error("task failed");
    await assert.rejects(
      coordinator.withTabDebugger(9, async () => {
        throw taskError;
      }),
      (error) => error === taskError
    );
    assert.deepEqual(
      api.events.map((event) => `${event.type}:${event.target.tabId}`),
      ["attach:9", "detach:9"],
      "a task failure must still release the debugger session"
    );
    assert.equal(api.attachedTabs.has(9), false);
  }

  {
    const api = fakeApi({ externallyAttachedTabs: [10] });
    const coordinator = createDebuggerSessionCoordinator(api);
    let taskExecuted = false;
    await assert.rejects(
      coordinator.withTabDebugger(10, async () => {
        taskExecuted = true;
      }),
      /already has a debugger/
    );
    assert.equal(taskExecuted, false);
    assert.equal(api.attachedTabs.has(10), true, "an externally owned session must remain attached");
    assert.equal(
      api.events.some((event) => event.type === "detach"),
      false,
      "the coordinator must only detach sessions it attached itself"
    );
  }

  {
    const api = fakeApi();
    const coordinator = createDebuggerSessionCoordinator(api);
    const results = await coordinator.withTabDebugger(11, async ({ target, sendCommand }) => {
      assert.deepEqual(target, { tabId: 11 });
      return Promise.all([
        sendCommand("Network.enable", { maxTotalBufferSize: 1024 }),
        sendCommand("Runtime.evaluate", { expression: "1 + 1" }, 42),
        sendCommand("Page.reload")
      ]);
    });

    assert.deepEqual(results, [
      { commandNumber: 1 },
      { commandNumber: 2 },
      { commandNumber: 3 }
    ]);
    assert.deepEqual(api.commands, [
      {
        target: { tabId: 11 },
        method: "Network.enable",
        params: { maxTotalBufferSize: 1024 }
      },
      {
        target: { tabId: 11, sessionId: "42" },
        method: "Runtime.evaluate",
        params: { expression: "1 + 1" }
      },
      {
        target: { tabId: 11 },
        method: "Page.reload",
        params: {}
      }
    ], "sessionId commands must be routed through the child debugger target");
    assert.deepEqual(
      api.events.filter((event) => event.type === "attach" || event.type === "detach")
        .map((event) => ({ type: event.type, target: event.target, version: event.version })),
      [
        { type: "attach", target: { tabId: 11 }, version: "1.3" },
        { type: "detach", target: { tabId: 11 }, version: undefined }
      ]
    );
  }

  {
    const api = fakeApi();
    const originalDetach = api.debugger.detach;
    const detachEntered = deferred();
    const releaseDetach = deferred();
    api.debugger.detach = async (target) => {
      if (target.tabId === 12) {
        detachEntered.resolve();
        await releaseDetach.promise;
      }
      return originalDetach(target);
    };

    const coordinator = createDebuggerSessionCoordinator(api);
    let staleSendCommand;
    const first = coordinator.withTabDebugger(12, async ({ sendCommand }) => {
      staleSendCommand = sendCommand;
    });
    await detachEntered.promise;

    await assert.rejects(
      staleSendCommand("Runtime.evaluate", { expression: "stale-before-detach" }),
      /debugger session lease is no longer active/
    );
    assert.equal(
      api.commands.length,
      0,
      "a lease must be invalidated as soon as its task settles, before detach completes"
    );

    const secondEntered = deferred();
    const releaseSecond = deferred();
    let currentSendCommand;
    const second = coordinator.withTabDebugger(12, async ({ sendCommand }) => {
      currentSendCommand = sendCommand;
      secondEntered.resolve();
      await releaseSecond.promise;
    });

    releaseDetach.resolve();
    await secondEntered.promise;
    await assert.rejects(
      staleSendCommand("Runtime.evaluate", { expression: "stale-after-reattach" }),
      /debugger session lease is no longer active/
    );
    assert.equal(
      api.commands.length,
      0,
      "an old lease must not send through the next FIFO task's attached debugger session"
    );

    assert.deepEqual(
      await currentSendCommand("Runtime.evaluate", { expression: "current" }),
      { commandNumber: 1 }
    );
    assert.deepEqual(api.commands, [{
      target: { tabId: 12 },
      method: "Runtime.evaluate",
      params: { expression: "current" }
    }]);

    releaseSecond.resolve();
    await Promise.all([first, second]);
  }

  {
    const api = fakeApi();
    const coordinator = createDebuggerSessionCoordinator(api);
    const result = await coordinator.withDebuggerTarget(
      { targetId: "notion-service-worker-target" },
      async ({ target, sendCommand }) => {
        assert.deepEqual(target, { targetId: "notion-service-worker-target" });
        return sendCommand("Runtime.evaluate", { expression: "1 + 1", returnByValue: true });
      }
    );
    assert.deepEqual(result, { commandNumber: 1 });
    assert.deepEqual(api.commands, [{
      target: { targetId: "notion-service-worker-target" },
      method: "Runtime.evaluate",
      params: { expression: "1 + 1", returnByValue: true }
    }]);
    assert.deepEqual(
      api.events.filter((event) => event.type === "attach" || event.type === "detach")
        .map((event) => ({ type: event.type, target: event.target })),
      [
        { type: "attach", target: { targetId: "notion-service-worker-target" } },
        { type: "detach", target: { targetId: "notion-service-worker-target" } }
      ],
      "a worker-target lease must attach to and detach from only that exact target"
    );
  }

  {
    const api = fakeApi();
    const coordinator = createDebuggerSessionCoordinator(api);
    const firstEntered = deferred();
    const releaseFirst = deferred();
    const order = [];
    const first = coordinator.withDebuggerTarget({ targetId: "shared-worker" }, async () => {
      order.push("first:start");
      firstEntered.resolve();
      await releaseFirst.promise;
      order.push("first:end");
    });
    await firstEntered.promise;
    const second = coordinator.withDebuggerTarget({ targetId: "shared-worker" }, async () => {
      order.push("second:start");
    });
    await Promise.resolve();
    assert.equal(api.events.filter((event) => event.type === "attach").length, 1);
    releaseFirst.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(order, ["first:start", "first:end", "second:start"]);
  }

  {
    const api = fakeApi();
    const coordinator = createDebuggerSessionCoordinator(api);
    const workerEntered = deferred();
    const tabEntered = deferred();
    const release = deferred();
    let active = 0;
    let maximumActive = 0;
    const run = (target, entered) => coordinator.withDebuggerTarget(target, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      entered.resolve();
      await release.promise;
      active -= 1;
    });
    const worker = run({ targetId: "7" }, workerEntered);
    const tab = run({ tabId: 7 }, tabEntered);
    await Promise.all([workerEntered.promise, tabEntered.promise]);
    assert.equal(maximumActive, 2, "tab:7 and target:7 must remain separate debugger lease namespaces");
    release.resolve();
    await Promise.all([worker, tab]);
  }

  for (const options of [
    { failedTargetIds: ["failed-worker"] },
    { externallyAttachedTargetIds: ["failed-worker"] }
  ]) {
    const api = fakeApi(options);
    const coordinator = createDebuggerSessionCoordinator(api);
    let taskExecuted = false;
    await assert.rejects(
      coordinator.withDebuggerTarget({ targetId: "failed-worker" }, async () => {
        taskExecuted = true;
      }),
      /attach failed|already has a debugger/
    );
    assert.equal(taskExecuted, false);
    assert.equal(
      api.events.some((event) => event.type === "detach" && event.target.targetId === "failed-worker"),
      false,
      "a worker attach failure must never detach a session the coordinator did not acquire"
    );
  }

  {
    const coordinator = createDebuggerSessionCoordinator(fakeApi());
    await assert.rejects(
      coordinator.withDebuggerTarget({ tabId: 13, targetId: "mixed" }, async () => {}),
      /target is invalid/
    );
    await assert.rejects(
      coordinator.withDebuggerTarget({ targetId: "" }, async () => {}),
      /target is invalid/
    );
  }

  console.log("Debugger session coordinator: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
