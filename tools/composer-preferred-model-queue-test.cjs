#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

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
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function waitForGate(gate, signal) {
  if (!signal) return gate.promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    gate.promise.then((value) => {
      cleanup();
      resolve(value);
    }, (error) => {
      cleanup();
      reject(error);
    });
  });
}

function resolveFailurePolicy(options, appId) {
  const override = options.modelPreferenceFailureOverrides?.[appId] || "inherit";
  if (override === "send-current" || override === "skip") return override;
  return options.modelPreferenceFailurePolicy === "skip" ? "skip" : "send-current";
}

function createFakePreferredModelScheduler(createFrameSendQueue, {
  now = () => 0,
  timeoutMs = 12_000
} = {}) {
  const readinessByFrame = new Map();
  const readinessWaiters = new Map();
  const barriersByFrame = new Map();
  const sends = [];
  const skips = [];

  function wakeReadiness(frame) {
    const waiters = readinessWaiters.get(frame);
    if (!waiters) return;
    readinessWaiters.delete(frame);
    for (const waiter of waiters) waiter.resolve();
  }

  function setReadiness(frame, next) {
    readinessByFrame.set(frame, Object.freeze({ ...next }));
    wakeReadiness(frame);
  }

  function notifyReadiness(frame, next) {
    const current = readinessByFrame.get(frame) || {};
    const currentRunId = Number(current.runId) || 0;
    const nextRunId = Number(next.runId) || 0;
    if (nextRunId && currentRunId && nextRunId < currentRunId) {
      wakeReadiness(frame);
      return false;
    }
    setReadiness(frame, { ...current, ...next });
    return true;
  }

  async function waitForReadiness(frame, signal) {
    while (true) {
      const current = readinessByFrame.get(frame) || { state: "unconfigured", runId: 0 };
      if (["unconfigured", "ready", "failed", "detached"].includes(current.state)) return current;
      const waiter = deferred();
      let waiters = readinessWaiters.get(frame);
      if (!waiters) {
        waiters = new Set();
        readinessWaiters.set(frame, waiters);
      }
      waiters.add(waiter);
      try {
        await waitForGate(waiter, signal);
      } finally {
        waiters.delete(waiter);
        if (!waiters.size) readinessWaiters.delete(frame);
      }
    }
  }

  function barrierMap(frame) {
    let barriers = barriersByFrame.get(frame);
    if (!barriers) {
      barriers = new Map();
      barriersByFrame.set(frame, barriers);
    }
    return barriers;
  }

  function blockBarrier(frame, sendId) {
    const gate = deferred();
    barrierMap(frame).set(sendId, gate);
    return gate;
  }

  function releaseBarrier(frame, sendId) {
    const barriers = barriersByFrame.get(frame);
    const gate = barriers?.get(sendId);
    if (!gate) return false;
    barriers.delete(sendId);
    gate.resolve();
    return true;
  }

  const queue = createFrameSendQueue({
    execute: async (frame, job, { signal }) => {
      const readiness = await waitForReadiness(frame, signal);
      if (readiness.state === "detached") {
        throw Object.assign(new Error("frame detached"), {
          code: "STALE_DOCUMENT",
          delivered: false
        });
      }
      if (readiness.state === "failed" && job.failurePolicy === "skip") {
        skips.push({ frame, id: job.id, runId: readiness.runId });
        throw Object.assign(new Error("preferred model failed; frame skipped"), {
          code: "MODEL_PREFERENCE_SKIPPED",
          delivered: false
        });
      }

      const startedAt = now();
      sends.push({
        deadlineAt: startedAt + timeoutMs,
        frame,
        id: job.id,
        modelFallback: readiness.state === "failed",
        runId: readiness.runId,
        startedAt
      });
      const gate = barriersByFrame.get(frame)?.get(job.id);
      if (gate) await waitForGate(gate, signal);
      return job.id;
    }
  });

  return {
    blockBarrier,
    notifyReadiness,
    queue,
    releaseBarrier,
    sends,
    setReadiness,
    skips
  };
}

(async () => {
  const { createFrameSendQueue } = await import(pathToFileURL(
    path.join(root, "app/composer/frame-send-queue.js")
  ).href);
  const { normalizeOptions } = await import(pathToFileURL(
    path.join(root, "shared/storage-schema.js")
  ).href);

  {
    const frameA = {};
    const frameB = {};
    const gates = new Map([
      ["A1", deferred()],
      ["A2", deferred()],
      ["B1", deferred()]
    ]);
    const started = [];
    const queue = createFrameSendQueue({
      execute: async (frame, job) => {
        started.push(`${frame === frameA ? "A" : "B"}:${job.id}`);
        await gates.get(job.id).promise;
        return job.id;
      }
    });

    const a1 = queue.enqueue(frameA, { id: "A1" });
    const a2 = queue.enqueue(frameA, { id: "A2" });
    const b1 = queue.enqueue(frameB, { id: "B1" });
    await flush();
    assert.deepEqual(started, ["A:A1", "B:B1"], "different frames must run while each frame remains FIFO");

    gates.get("B1").resolve();
    assert.equal(await b1, "B1", "an independent frame must finish without waiting for another frame");
    assert.deepEqual(started, ["A:A1", "B:B1"], "the second same-frame job must remain queued");

    gates.get("A1").resolve();
    assert.equal(await a1, "A1");
    await flush();
    assert.deepEqual(started, ["A:A1", "B:B1", "A:A2"], "same-frame jobs must start in enqueue order");
    gates.get("A2").resolve();
    assert.equal(await a2, "A2");
    await flush();
    assert.deepEqual(queue.snapshot(), {
      pendingCount: 0,
      queuedCount: 0,
      runningCount: 0,
      laneCount: 0
    }, "idle lanes must be removed");
  }

  {
    const frame = {};
    const firstGate = deferred();
    const received = [];
    const queue = createFrameSendQueue({
      execute: async (_frame, job) => {
        received.push(job);
        if (job.id === "block") await firstGate.promise;
        return job.id;
      }
    });
    const blocker = queue.enqueue(frame, { id: "block" });
    const source = { id: "snapshot", images: [{ name: "original.png" }], settings: { mode: "current" } };
    const snapshotted = queue.enqueue(frame, source);
    source.id = "mutated";
    source.images[0].name = "mutated.png";
    source.images.push({ name: "extra.png" });
    source.settings.mode = "changed";

    firstGate.resolve();
    await blocker;
    assert.equal(await snapshotted, "snapshot");
    const job = received[1];
    assert.deepEqual(job, {
      id: "snapshot",
      images: [{ name: "original.png" }],
      settings: { mode: "current" }
    }, "enqueue must hand execute an immutable point-in-time job snapshot");
    assert.ok(Object.isFrozen(job));
    assert.ok(Object.isFrozen(job.images));
    assert.ok(Object.isFrozen(job.images[0]));
    assert.ok(Object.isFrozen(job.settings));
  }

  {
    const frame = {};
    const known = Object.assign(new Error("known pre-delivery failure"), { code: "NOT_REGISTERED" });
    const executed = [];
    const queue = createFrameSendQueue({
      execute: async (_frame, job) => {
        executed.push(job.id);
        if (job.id === "known") throw known;
        return job.id;
      },
      isUncertainError: (error) => error.code === "TIMEOUT"
    });

    const failed = queue.enqueue(frame, { id: "known" });
    const continued = queue.enqueue(frame, { id: "later" });
    await assert.rejects(failed, (error) => error === known);
    assert.equal(await continued, "later", "a known rejection must not poison later jobs");
    assert.deepEqual(executed, ["known", "later"]);
  }

  {
    const frame = {};
    const uncertain = Object.assign(new Error("delivery timed out"), { code: "TIMEOUT" });
    const firstGate = deferred();
    const executed = [];
    const queue = createFrameSendQueue({
      execute: async (_frame, job) => {
        executed.push(job.id);
        if (job.id === "uncertain") {
          await firstGate.promise;
          throw uncertain;
        }
        return job.id;
      },
      isUncertainError: (error) => error.code === "TIMEOUT"
    });

    const failed = queue.enqueue(frame, { id: "uncertain" });
    const purgedOne = queue.enqueue(frame, { id: "purged-1" });
    const purgedTwo = queue.enqueue(frame, { id: "purged-2" });
    firstGate.resolve();
    await assert.rejects(failed, (error) => error === uncertain);
    for (const purged of [purgedOne, purgedTwo]) {
      await assert.rejects(purged, (error) => {
        assert.equal(error.code, "FRAME_SEND_QUEUE_PURGED_UNCERTAIN");
        assert.equal(error.cause, uncertain);
        return true;
      });
    }
    assert.deepEqual(executed, ["uncertain"], "uncertain delivery must purge queued work without executing it");
    await flush();
    assert.equal(queue.snapshot().laneCount, 0);
  }

  {
    const frameA = {};
    const frameB = {};
    const activeGate = deferred();
    const states = [];
    const queue = createFrameSendQueue({
      execute: async (_frame, job, { signal }) => {
        if (job.id === "active") {
          await Promise.race([
            activeGate.promise,
            new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => reject(signal.reason), { once: true });
            })
          ]);
        }
        return job.id;
      },
      onStateChange: (state) => states.push(state)
    });

    const active = queue.enqueue(frameA, { id: "active" });
    const queued = queue.enqueue(frameA, { id: "queued" });
    const other = queue.enqueue(frameB, { id: "other" });
    await flush();
    assert.deepEqual(queue.snapshot(), {
      pendingCount: 2,
      queuedCount: 1,
      runningCount: 1,
      laneCount: 1
    }, "the other lane may settle while one frame retains an active and a queued job");
    assert.equal(await other, "other");
    assert.deepEqual(queue.snapshot(frameA), {
      pendingCount: 2,
      queuedCount: 1,
      runningCount: 1,
      laneCount: 1
    });

    assert.equal(queue.cancelFrame(frameA, "frame detached"), 2, "cancellation must report active and queued jobs");
    await assert.rejects(active, (error) => error.code === "FRAME_SEND_QUEUE_CANCELLED");
    await assert.rejects(queued, (error) => error.code === "FRAME_SEND_QUEUE_CANCELLED");
    await flush();
    assert.deepEqual(queue.snapshot(), {
      pendingCount: 0,
      queuedCount: 0,
      runningCount: 0,
      laneCount: 0
    });
    assert.equal(queue.cancelFrame(frameA), 0, "cancelling an idle frame must be a no-op");
    assert.ok(states.some((state) => state.pendingCount === 3 && state.laneCount === 2));
    assert.deepEqual(states.at(-1), queue.snapshot(), "the state callback must observe the final clean snapshot");
  }

  {
    const pendingFrame = {};
    const readyFrame = {};
    const unconfiguredFrame = {};
    const unconfiguredLoadingFrame = {};
    const scheduler = createFakePreferredModelScheduler(createFrameSendQueue);
    scheduler.setReadiness(pendingFrame, { state: "pending", runId: 4, documentId: "pending-doc" });
    scheduler.setReadiness(readyFrame, { state: "ready", runId: 2, documentId: "ready-doc" });
    scheduler.setReadiness(unconfiguredFrame, { state: "unconfigured", runId: 0, documentId: "plain-doc" });
    scheduler.setReadiness(unconfiguredLoadingFrame, { state: "loading", runId: 0, configured: false });

    const pending = scheduler.queue.enqueue(pendingFrame, { id: "pending", failurePolicy: "send-current" });
    const ready = scheduler.queue.enqueue(readyFrame, { id: "ready", failurePolicy: "send-current" });
    const unconfigured = scheduler.queue.enqueue(unconfiguredFrame, {
      id: "unconfigured",
      failurePolicy: "send-current"
    });
    const unconfiguredLoading = scheduler.queue.enqueue(unconfiguredLoadingFrame, {
      id: "unconfigured-loading",
      failurePolicy: "send-current"
    });
    await flush();
    assert.deepEqual(
      new Set(scheduler.sends.map((send) => send.id)),
      new Set(["ready", "unconfigured"]),
      "ready and unconfigured frames must dispatch without waiting for a pending frame"
    );
    assert.equal(await ready, "ready");
    assert.equal(await unconfigured, "unconfigured");
    assert.equal(
      scheduler.sends.some((send) => send.id === "unconfigured-loading"),
      false,
      "an unconfigured frame must still wait while its iframe document is loading"
    );

    scheduler.setReadiness(unconfiguredLoadingFrame, {
      state: "unconfigured",
      runId: 0,
      documentId: "plain-loaded-doc"
    });
    assert.equal(await unconfiguredLoading, "unconfigured-loading");
    assert.equal(scheduler.sends.filter((send) => send.id === "unconfigured-loading").length, 1);

    scheduler.setReadiness(pendingFrame, { state: "ready", runId: 4, documentId: "pending-doc" });
    assert.equal(await pending, "pending");
    assert.equal(scheduler.sends.filter((send) => send.id === "pending").length, 1);
  }

  {
    const apps = ["Gemini", "Grok", "DeepSeek", "NotionAI"];
    const cases = [
      { global: "send-current", override: "inherit", expected: "send" },
      { global: "skip", override: "inherit", expected: "skip" },
      { global: "send-current", override: "send-current", expected: "send" },
      { global: "skip", override: "send-current", expected: "send" },
      { global: "send-current", override: "skip", expected: "skip" },
      { global: "skip", override: "skip", expected: "skip" }
    ];

    for (const [index, policyCase] of cases.entries()) {
      const frame = {};
      const appId = apps[index % apps.length];
      const options = normalizeOptions({
        modelPreferenceFailurePolicy: policyCase.global,
        modelPreferenceFailureOverrides: { [appId]: policyCase.override }
      });
      const scheduler = createFakePreferredModelScheduler(createFrameSendQueue);
      scheduler.setReadiness(frame, { state: "failed", runId: 9, documentId: `${appId}-doc` });
      const result = scheduler.queue.enqueue(frame, {
        id: `failed-${index}`,
        failurePolicy: resolveFailurePolicy(options, appId)
      });

      if (policyCase.expected === "send") {
        assert.equal(await result, `failed-${index}`);
        assert.equal(scheduler.sends.length, 1);
        assert.equal(scheduler.sends[0].modelFallback, true);
        assert.equal(scheduler.skips.length, 0);
      } else {
        await assert.rejects(result, (error) => error.code === "MODEL_PREFERENCE_SKIPPED");
        assert.equal(scheduler.sends.length, 0);
        assert.equal(scheduler.skips.length, 1);
      }
    }
  }

  {
    let clock = 100;
    const frame = {};
    const scheduler = createFakePreferredModelScheduler(createFrameSendQueue, {
      now: () => clock,
      timeoutMs: 12_000
    });
    scheduler.setReadiness(frame, { state: "ready", runId: 1, documentId: "deadline-doc" });
    scheduler.blockBarrier(frame, "S1");
    const first = scheduler.queue.enqueue(frame, { id: "S1", failurePolicy: "send-current" });
    const second = scheduler.queue.enqueue(frame, { id: "S2", failurePolicy: "send-current" });
    await flush();
    assert.equal(scheduler.sends[0].deadlineAt, 12_100);
    assert.equal(scheduler.sends.some((send) => send.id === "S2"), false);

    clock = 20_000;
    assert.equal(scheduler.releaseBarrier(frame, "S1"), true);
    await first;
    assert.equal(await second, "S2");
    assert.equal(
      scheduler.sends.find((send) => send.id === "S2").deadlineAt,
      32_000,
      "send timeout must be computed when a queued job actually dispatches"
    );
  }

  {
    const frame = {};
    const scheduler = createFakePreferredModelScheduler(createFrameSendQueue);
    scheduler.setReadiness(frame, { state: "pending", runId: 7, documentId: "current-doc" });
    const result = scheduler.queue.enqueue(frame, { id: "deduplicated", failurePolicy: "send-current" });
    await flush();

    assert.equal(
      scheduler.notifyReadiness(frame, { state: "ready", runId: 6, documentId: "stale-doc" }),
      false,
      "a stale model run must not replace the current readiness"
    );
    scheduler.notifyReadiness(frame, { state: "pending", runId: 7, documentId: "current-doc" });
    scheduler.notifyReadiness(frame, { state: "pending", runId: 7, documentId: "current-doc" });
    await flush();
    assert.equal(scheduler.sends.length, 0, "stale and duplicate pending notices must not dispatch");

    scheduler.notifyReadiness(frame, { state: "ready", runId: 7, documentId: "current-doc" });
    assert.equal(await result, "deduplicated");
    scheduler.notifyReadiness(frame, { state: "ready", runId: 7, documentId: "current-doc" });
    scheduler.notifyReadiness(frame, { state: "ready", runId: 7, documentId: "current-doc" });
    await flush();
    assert.equal(scheduler.sends.length, 1, "settled readiness must release a queued send at most once");
  }

  {
    const frameA = {};
    const frameB = {};
    const scheduler = createFakePreferredModelScheduler(createFrameSendQueue);
    scheduler.setReadiness(frameA, { state: "ready", runId: 2, documentId: "a-doc" });
    scheduler.setReadiness(frameB, { state: "ready", runId: 3, documentId: "b-doc" });
    scheduler.blockBarrier(frameA, "A1");

    const a1 = scheduler.queue.enqueue(frameA, { id: "A1", failurePolicy: "send-current" });
    const a2 = scheduler.queue.enqueue(frameA, { id: "A2", failurePolicy: "send-current" });
    const b1 = scheduler.queue.enqueue(frameB, { id: "B1", failurePolicy: "send-current" });
    const b2 = scheduler.queue.enqueue(frameB, { id: "B2", failurePolicy: "send-current" });
    assert.deepEqual(await Promise.all([b1, b2]), ["B1", "B2"]);
    assert.equal(
      scheduler.sends.some((send) => send.id === "A2"),
      false,
      "a same-frame navigation barrier must hold the next message"
    );
    assert.deepEqual(
      scheduler.sends.filter((send) => send.frame === frameB).map((send) => send.id),
      ["B1", "B2"],
      "another frame must continue through its own FIFO while the first frame is at a barrier"
    );

    assert.equal(scheduler.releaseBarrier(frameA, "A1"), true);
    assert.equal(await a1, "A1");
    assert.equal(await a2, "A2");
    assert.deepEqual(
      scheduler.sends.filter((send) => send.frame === frameA).map((send) => send.id),
      ["A1", "A2"]
    );
  }

  console.log("Composer per-frame send queue regression tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
