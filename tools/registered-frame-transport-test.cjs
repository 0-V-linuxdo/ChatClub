#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const {
    executeInRegisteredFrameWithDocumentFallback,
    sendMessageToRegisteredFrame,
    verifiedRegisteredFrameFallbackTarget
  } = await import(
    pathToFileURL(path.join(root, "background/registered-frame-transport.js")).href
  );
  const context = Object.freeze({ tabId: 21, frameId: 9, documentId: "document-1" });

  {
    const calls = [];
    let fallbackChecks = 0;
    const api = {
      tabs: {
        async sendMessage(...args) {
          calls.push(args);
          throw new Error("The message port closed before a response was received");
        }
      }
    };
    await assert.rejects(
      sendMessageToRegisteredFrame(api, context, { action: "deleteThread" }, async () => {
        fallbackChecks += 1;
        return { tabId: 21, frameId: 9 };
      }),
      /message port closed/
    );
    assert.equal(calls.length, 1, "a possibly delivered Delete command must not be replayed by frameId");
    assert.equal(fallbackChecks, 0);
    assert.deepEqual(calls[0][2], { documentId: "document-1" });
  }

  {
    const calls = [];
    let fallbackChecks = 0;
    const api = {
      tabs: {
        async sendMessage(...args) {
          calls.push(args);
          if (calls.length === 1) throw new TypeError('Unexpected property "documentId"');
          return { success: true, data: { ok: true } };
        }
      }
    };
    const response = await sendMessageToRegisteredFrame(api, context, { action: "getPageMeta" }, async () => {
      fallbackChecks += 1;
      return { tabId: 21, frameId: 9 };
    });
    assert.deepEqual(response, { success: true, data: { ok: true } });
    assert.equal(fallbackChecks, 1);
    assert.deepEqual(calls.map((call) => call[2]), [
      { documentId: "document-1" },
      { frameId: 9 }
    ]);
  }

  {
    let calls = 0;
    const api = {
      tabs: {
        async sendMessage() {
          calls += 1;
          throw new TypeError("Invalid value");
        }
      }
    };
    await assert.rejects(
      sendMessageToRegisteredFrame(api, context, { action: "deleteThread" }, async () => {
        throw new Error("broad invalid-value errors must not reach fallback verification");
      }),
      /Invalid value/
    );
    assert.equal(calls, 1);
  }

  {
    const registered = { ...context, url: "https://chatgpt.com/c/thread-1" };
    const api = {
      webNavigation: {
        async getFrame() {
          return {
            tabId: 21,
            frameId: 9,
            parentFrameId: 0,
            documentId: "document-1",
            url: registered.url
          };
        }
      }
    };
    assert.deepEqual(
      await verifiedRegisteredFrameFallbackTarget(api, registered),
      { tabId: 21, frameId: 9 }
    );
    api.webNavigation.getFrame = async () => ({
      tabId: 21,
      frameId: 9,
      parentFrameId: 0,
      documentId: "document-2",
      url: registered.url
    });
    await assert.rejects(
      verifiedRegisteredFrameFallbackTarget(api, registered),
      (error) => error?.code === "STALE_DOCUMENT" && error?.delivered === false
    );
  }

  {
    const targets = [];
    let fallbackChecks = 0;
    await assert.rejects(
      executeInRegisteredFrameWithDocumentFallback(
        context,
        async (target) => {
          targets.push(target);
          throw new Error("MAIN world execution failed after dispatch");
        },
        async () => {
          fallbackChecks += 1;
          return { tabId: 21, frameId: 9 };
        }
      ),
      /execution failed after dispatch/
    );
    assert.equal(targets.length, 1, "an unknown MAIN-world failure must never downgrade to frameId");
    assert.equal(fallbackChecks, 0);
  }

  {
    const targets = [];
    let fallbackChecks = 0;
    const result = await executeInRegisteredFrameWithDocumentFallback(
      context,
      async (target) => {
        targets.push(target);
        if (targets.length === 1) throw new TypeError('Unexpected property "documentIds"');
        return [{ frameId: 9, documentId: "document-1", result: { ok: true } }];
      },
      async () => {
        fallbackChecks += 1;
        return { tabId: 21, frameId: 9 };
      }
    );
    assert.equal(fallbackChecks, 1);
    assert.deepEqual(targets, [
      { tabId: 21, documentIds: ["document-1"] },
      { tabId: 21, frameIds: [9] }
    ]);
    assert.equal(result[0].result.ok, true);
  }

  console.log("registered frame transport no-replay boundary: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
