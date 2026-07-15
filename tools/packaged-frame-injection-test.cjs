#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "background/frame-injection.js"), "utf8");
const dataModule = (value) => import(`data:text/javascript;base64,${Buffer.from(value).toString("base64")}`);

function fixture(options = {}) {
  const calls = [];
  const frames = [...(options.frames || [{
    frameId: 9,
    parentFrameId: 0,
    url: "https://chat.example/thread"
  }])];
  const api = {
    runtime: {
      id: "chatclub-test",
      getURL: (file = "") => `moz-extension://chatclub-test/${file}`
    },
    webNavigation: {
      getFrame: async (details) => {
        calls.push({ kind: "getFrame", details });
        return frames.length > 1 ? frames.shift() : frames[0];
      }
    },
    scripting: {
      executeScript: async (details) => {
        calls.push({ kind: "executeScript", details });
        if (options.execute) return options.execute(details);
        return [{ frameId: 9, result: true }];
      }
    }
  };
  const sender = {
    id: "chatclub-test",
    tab: { id: 21, url: "moz-extension://chatclub-test/chatClub.html" },
    frameId: 9,
    url: "https://chat.example/thread",
    ...(options.sender || {})
  };
  return { api, sender, calls };
}

(async () => {
  const {
    documentTargetUnsupported,
    executeVerifiedPackagedFrameFile,
    verifiedCustomUserscriptTarget
  } = await dataModule(source);

  assert.equal(documentTargetUnsupported(new Error('Unexpected property "documentIds"')), true);
  assert.equal(documentTargetUnsupported(new Error("Invalid tabId")), false);

  {
    const { api, sender, calls } = fixture();
    await executeVerifiedPackagedFrameFile(api, sender, "topic-delete-userscripts/chatgpt.user.js");
    const executions = calls.filter((call) => call.kind === "executeScript");
    assert.equal(executions.length, 1);
    assert.deepEqual(executions[0].details.target, { tabId: 21, frameIds: [9] });
    assert.equal(executions[0].details.world, "MAIN");
    await assert.rejects(
      verifiedCustomUserscriptTarget(api, sender),
      /sender document id is unavailable/
    );
  }

  {
    const { api, sender, calls } = fixture({
      frames: [{ frameId: 7, parentFrameId: 0, url: "https://chat.example/thread" }]
    });
    await assert.rejects(
      executeVerifiedPackagedFrameFile(api, sender, "topic-delete-userscripts/chatgpt.user.js"),
      /verified direct child document/
    );
    assert.equal(calls.some((call) => call.kind === "executeScript"), false);
  }

  {
    const documentFrame = {
      frameId: 9,
      parentFrameId: 0,
      documentId: "document-1",
      url: "https://chat.example/thread"
    };
    const { api, sender, calls } = fixture({
      sender: { documentId: "document-1" },
      frames: [documentFrame, { ...documentFrame }],
      execute: async (details) => {
        if (details.target.documentIds) throw new TypeError('Unexpected property "documentIds"');
        return [{ frameId: 9, result: true }];
      }
    });
    await executeVerifiedPackagedFrameFile(api, sender, "topic-delete-userscripts/chatgpt.user.js");
    const executions = calls.filter((call) => call.kind === "executeScript");
    assert.deepEqual(executions.map((call) => call.details.target), [
      { tabId: 21, documentIds: ["document-1"] },
      { tabId: 21, frameIds: [9] }
    ]);
    assert.equal(calls.filter((call) => call.kind === "getFrame").length, 2);
  }

  {
    const { api, sender } = fixture({
      sender: { documentId: "document-2" },
      frames: [{
        frameId: 9,
        parentFrameId: 0,
        documentId: "document-2",
        url: "https://chat.example/thread"
      }]
    });
    assert.deepEqual(await verifiedCustomUserscriptTarget(api, sender), {
      tabId: 21,
      documentIds: ["document-2"]
    });
  }

  {
    const { api, sender, calls } = fixture({
      sender: { documentId: "document-1" },
      frames: [{
        frameId: 9,
        parentFrameId: 0,
        documentId: "document-1",
        url: "https://chat.example/thread"
      }, {
        frameId: 9,
        parentFrameId: 0,
        url: "https://chat.example/other-thread"
      }],
      execute: async (details) => {
        if (details.target.documentIds) throw new TypeError('Unexpected property "documentIds"');
        return [];
      }
    });
    await assert.rejects(
      executeVerifiedPackagedFrameFile(api, sender, "topic-delete-userscripts/chatgpt.user.js"),
      /verified direct child document/
    );
    assert.equal(calls.filter((call) => call.kind === "executeScript").length, 1);
  }

  const runtime = fs.readFileSync(path.join(root, "background/runtime.js"), "utf8");
  assert.match(runtime, /executeCustomSummaryUserscript[\s\S]*?await verifiedCustomUserscriptTarget\(chrome, sender\)/);
  assert.match(runtime, /executeCustomTopicDeleteUserscript[\s\S]*?await verifiedCustomUserscriptTarget\(chrome, sender\)/);

  console.log("verified packaged frame injection fallback: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
