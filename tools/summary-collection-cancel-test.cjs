#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function hasPair(items) {
  return (Array.isArray(items) ? items : []).some((item) => item?.role === "user")
    && (Array.isArray(items) ? items : []).some((item) => item?.role === "assistant");
}

(async () => {
  const previousLocation = globalThis.location;
  globalThis.location = { href: "https://chatgpt.com/c/1" };
  const guard = await import(pathToFileURL(path.join(root, "content-src/shared/summary-collection-guard.js")).href);
  const { createSummaryCapability } = await import(pathToFileURL(path.join(root, "content-src/capabilities/summary-runtime.js")).href);

  const {
    SUMMARY_COLLECTION_ABORTED,
    SummaryCollectionAbortedError,
    abortableSleep,
    beginSummaryCollectionRun,
    cancelSummaryCollectionRuns,
    endSummaryCollectionRun,
    isSummaryCollectionAborted,
    throwIfSummaryCollectionAborted
  } = guard;

  {
    const run = beginSummaryCollectionRun({ runId: "idle-a", idle: true });
    assert.equal(cancelSummaryCollectionRuns("idle-a"), 1);
    assert.equal(run.aborted, true);
    assert.equal(run.reason, "cancelled");
    assert.throws(
      () => throwIfSummaryCollectionAborted(),
      (error) => error instanceof SummaryCollectionAbortedError && error.code === SUMMARY_COLLECTION_ABORTED
    );
    endSummaryCollectionRun(run);
  }

  {
    const idle = beginSummaryCollectionRun({ runId: "idle-b", idle: true });
    const panel = beginSummaryCollectionRun({ runId: "panel-b", idle: false });
    assert.equal(cancelSummaryCollectionRuns("", "cancelled"), 1, "an empty runId must cancel idle scans only");
    assert.equal(idle.aborted, true);
    assert.equal(panel.aborted, false);
    endSummaryCollectionRun(idle);
    endSummaryCollectionRun(panel);
  }

  {
    const run = beginSummaryCollectionRun({ runId: "sleep-c", idle: true });
    let slept = false;
    const waiting = abortableSleep(30_000, (ms) => new Promise((resolve) => {
      slept = true;
      setTimeout(resolve, ms);
    }));
    assert.equal(slept, true);
    cancelSummaryCollectionRuns("sleep-c");
    await assert.rejects(waiting, (error) => isSummaryCollectionAborted(error));
    endSummaryCollectionRun(run);
  }

  {
    let started = false;
    const capability = createSummaryCapability({
      contentDocumentId: "fixture-document",
      conversationIsGenerating: () => false,
      merge: (items) => items,
      hasUserAndAssistant: hasPair,
      inspectOfficialSummaryCollection: () => ({ messages: null, hits: { miss: "no-pair" } }),
      runtimes: {
        require() {
          return {
            scripts: {
              chatgpt: async (api) => {
                started = true;
                await api.sleep(30_000);
                return [{ role: "user", text: "late" }, { role: "assistant", text: "reply" }];
              }
            }
          };
        }
      },
      CONTENT_BRIDGE_VERSION: "fixture",
      sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); })
    });
    const collecting = capability.collectSummary({
      runId: "idle-1",
      config: { id: "chatgpt", builtIn: true, idleFullText: true, userscriptRunMode: "serial" }
    });
    for (let index = 0; index < 20 && !started; index += 1) await Promise.resolve();
    assert.equal(started, true, "idle collect must enter the packaged runner before cancel");
    assert.deepEqual(capability.cancelSummaryCollection({ runId: "idle-1" }), { cancelled: 1 });
    const result = await collecting;
    assert.equal(result.aborted, true);
    assert.equal(result.stage, "aborted");
    assert.deepEqual(result.messages, []);
    assert.equal(result.abortReason, "cancelled");
  }

  {
    const capability = createSummaryCapability({
      contentDocumentId: "fixture-document",
      conversationIsGenerating: () => false,
      merge: (items) => items,
      hasUserAndAssistant: hasPair,
      inspectOfficialSummaryCollection: () => ({ messages: null, hits: { miss: "no-pair" } }),
      runtimes: {
        require() {
          return {
            scripts: {
              chatgpt: async () => [{ role: "user", text: "u" }, { role: "assistant", text: "a" }]
            }
          };
        }
      },
      CONTENT_BRIDGE_VERSION: "fixture",
      sleep: async () => {}
    });
    const idle = beginSummaryCollectionRun({ runId: "idle-d", idle: true });
    assert.deepEqual(capability.cancelSummaryCollection({}), { cancelled: 1 });
    assert.equal(idle.aborted, true);
    endSummaryCollectionRun(idle);
  }

  const summary = read("app/summary/controller.js");
  assert.match(summary, /cancelSummaryCollection/);
  assert.match(summary, /runId: runId \|\| undefined/);
  assert.match(summary, /if \(collectionCancelled\(\)\)/);
  assert.match(summary, /abortIdleCollect\(\)/);
  assert.match(read("content-src/content.js"), /cancelSummaryCollection/);
  assert.match(read("content-src/capabilities/summary-runtime.js"), /cancelSummaryCollectionRuns\(data\?\.runId/);
  assert.match(read("content-src/shared/summary-runtime.js"), /abortableSleep\(copyPollMs, sleep\)/);
  assert.match(read("content-src/shared/summary-runtime.js"), /if \(isSummaryCollectionAborted\(error\)\) throw error/);

  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
  console.log("summary collection cancel: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
