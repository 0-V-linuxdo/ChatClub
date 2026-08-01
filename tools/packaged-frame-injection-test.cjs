#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "background/frame-injection.js"), "utf8");
const frameInjectionModule = `${pathToFileURL(path.join(root, "background/frame-injection.js")).href}?test=${Date.now()}`;

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
    verifiedCustomUserscriptTarget,
    worldOptionUnsupported
  } = await import(frameInjectionModule);

  assert.match(source, /import \{ frameDocumentUrlsMatch \} from "\.\.\/shared\/chat-frame-config\.js"/);

  assert.equal(documentTargetUnsupported(new Error('Unexpected property "documentIds"')), true);
  assert.equal(documentTargetUnsupported(new Error("Invalid tabId")), false);
  assert.equal(documentTargetUnsupported(new Error("Invalid value")), false);
  assert.equal(worldOptionUnsupported(new Error('Unexpected property "world"')), true);
  assert.equal(worldOptionUnsupported(new Error("MAIN world execution failed after dispatch")), false);
  assert.equal(worldOptionUnsupported(new Error("Unexpected property in script options")), false);

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
    const notionNonce = "ccn-0123456789abcdef0123456789abcdef";
    const navigationUrl = `https://app.notion.com/ai?__chatclub_frame_load_nonce=${notionNonce}`;
    const logicalUrl = "https://app.notion.com/ai";
    const documentFrame = {
      frameId: 9,
      parentFrameId: 0,
      documentId: "notion-document",
      url: navigationUrl
    };
    const { api, sender, calls } = fixture({
      sender: { documentId: "notion-document", url: navigationUrl },
      frames: [documentFrame, { ...documentFrame, url: logicalUrl }],
      execute: async (details) => {
        if (details.target.documentIds) throw new TypeError('Unexpected property "documentIds"');
        return [{ frameId: 9, result: true }];
      }
    });
    await executeVerifiedPackagedFrameFile(api, sender, "topic-delete-userscripts/chatgpt.user.js");
    assert.deepEqual(
      calls.filter((call) => call.kind === "executeScript").map((call) => call.details.target),
      [
        { tabId: 21, documentIds: ["notion-document"] },
        { tabId: 21, frameIds: [9] }
      ]
    );
    assert.equal(calls.filter((call) => call.kind === "getFrame").length, 2);
  }

  for (const documentIds of [
    {},
    { frame: "notion-document" },
    { sender: "notion-document" }
  ]) {
    const notionNonce = "ccn-0123456789abcdef0123456789abcdef";
    const navigationUrl = `https://app.notion.com/ai?__chatclub_frame_load_nonce=${notionNonce}`;
    const { api, sender, calls } = fixture({
      sender: {
        ...(documentIds.sender ? { documentId: documentIds.sender } : {}),
        url: navigationUrl
      },
      frames: [{
        frameId: 9,
        parentFrameId: 0,
        ...(documentIds.frame ? { documentId: documentIds.frame } : {}),
        url: "https://app.notion.com/ai"
      }]
    });
    await assert.rejects(
      executeVerifiedPackagedFrameFile(api, sender, "topic-delete-userscripts/chatgpt.user.js"),
      /verified direct child document/
    );
    assert.equal(calls.some((call) => call.kind === "executeScript"), false);
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
    const notionNonce = "ccn-0123456789abcdef0123456789abcdef";
    const logicalUrl = "https://app.notion.com/ai?mode=chat#thread";
    const navigationUrl = `https://app.notion.com/ai?mode=chat&__chatclub_frame_load_nonce=${notionNonce}#thread`;
    const { api, sender } = fixture({
      sender: { documentId: "notion-document", url: navigationUrl },
      frames: [{
        frameId: 9,
        parentFrameId: 0,
        documentId: "notion-document",
        url: logicalUrl
      }]
    });
    assert.deepEqual(await verifiedCustomUserscriptTarget(api, sender), {
      tabId: 21,
      documentIds: ["notion-document"]
    });
  }

  {
    const notionNonce = "ccn-0123456789abcdef0123456789abcdef";
    const logicalUrl = "https://app.notion.com/ai?mode=chat#thread";
    const navigationUrl = `https://app.notion.com/ai?mode=chat&__chatclub_frame_load_nonce=${notionNonce}#thread`;
    const { api, sender } = fixture({
      sender: { documentId: "notion-document", url: logicalUrl },
      frames: [{
        frameId: 9,
        parentFrameId: 0,
        documentId: "notion-document",
        url: navigationUrl
      }]
    });
    assert.deepEqual(await verifiedCustomUserscriptTarget(api, sender), {
      tabId: 21,
      documentIds: ["notion-document"]
    });
  }

  {
    const firstNonce = "ccn-0123456789abcdef0123456789abcdef";
    const secondNonce = "ccn-fedcba9876543210fedcba9876543210";
    const { api, sender, calls } = fixture({
      sender: {
        documentId: "notion-document",
        url: `https://app.notion.com/ai?__chatclub_frame_load_nonce=${firstNonce}`
      },
      frames: [{
        frameId: 9,
        parentFrameId: 0,
        documentId: "notion-document",
        url: `https://app.notion.com/ai?__chatclub_frame_load_nonce=${secondNonce}`
      }]
    });
    await assert.rejects(
      executeVerifiedPackagedFrameFile(api, sender, "topic-delete-userscripts/chatgpt.user.js"),
      /verified direct child document/
    );
    assert.equal(calls.some((call) => call.kind === "executeScript"), false);
  }

  {
    const notionNonce = "ccn-0123456789abcdef0123456789abcdef";
    const { api, sender, calls } = fixture({
      sender: {
        documentId: "notion-document",
        url: `https://app.notion.com/ai?mode=chat&__chatclub_frame_load_nonce=${notionNonce}`
      },
      frames: [{
        frameId: 9,
        parentFrameId: 0,
        documentId: "notion-document",
        url: "https://app.notion.com/ai?mode=search"
      }]
    });
    await assert.rejects(
      executeVerifiedPackagedFrameFile(api, sender, "topic-delete-userscripts/chatgpt.user.js"),
      /verified direct child document/
    );
    assert.equal(calls.some((call) => call.kind === "executeScript"), false);
  }

  for (const rejectedNonceQuery of [
    "__chatclub_frame_load_nonce=garbage",
    "__chatclub_frame_load_nonce=",
    "__chatclub_frame_load_nonce=ccn-0123456789abcdef0123456789abcdef&__chatclub_frame_load_nonce=ccn-fedcba9876543210fedcba9876543210"
  ]) {
    const { api, sender, calls } = fixture({
      sender: {
        documentId: "notion-document",
        url: `https://app.notion.com/ai?${rejectedNonceQuery}`
      },
      frames: [{
        frameId: 9,
        parentFrameId: 0,
        documentId: "notion-document",
        url: "https://app.notion.com/ai"
      }]
    });
    await assert.rejects(
      executeVerifiedPackagedFrameFile(api, sender, "topic-delete-userscripts/chatgpt.user.js"),
      /verified direct child document/
    );
    assert.equal(calls.some((call) => call.kind === "executeScript"), false);
  }

  {
    const { api, sender, calls } = fixture({
      sender: {
        documentId: "other-document",
        url: "https://chat.example/thread?__chatclub_frame_load_nonce=ccn-0123456789abcdef0123456789abcdef"
      },
      frames: [{
        frameId: 9,
        parentFrameId: 0,
        documentId: "other-document",
        url: "https://chat.example/thread"
      }]
    });
    await assert.rejects(
      executeVerifiedPackagedFrameFile(api, sender, "topic-delete-userscripts/chatgpt.user.js"),
      /verified direct child document/
    );
    assert.equal(calls.some((call) => call.kind === "executeScript"), false);
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

  {
    const notionNonce = "ccn-0123456789abcdef0123456789abcdef";
    const navigationUrl = `https://app.notion.com/ai?__chatclub_frame_load_nonce=${notionNonce}`;
    const documentFrame = {
      frameId: 9,
      parentFrameId: 0,
      documentId: "notion-document",
      url: navigationUrl
    };
    const { api, sender, calls } = fixture({
      sender: { documentId: "notion-document", url: navigationUrl },
      frames: [documentFrame, {
        frameId: 9,
        parentFrameId: 0,
        url: navigationUrl
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

  {
    const firstNonce = "ccn-0123456789abcdef0123456789abcdef";
    const secondNonce = "ccn-fedcba9876543210fedcba9876543210";
    const documentFrame = {
      frameId: 9,
      parentFrameId: 0,
      documentId: "notion-document",
      url: "https://app.notion.com/ai"
    };
    const { api, sender, calls } = fixture({
      sender: {
        documentId: "notion-document",
        url: `https://app.notion.com/ai?__chatclub_frame_load_nonce=${firstNonce}`
      },
      frames: [documentFrame, {
        ...documentFrame,
        url: `https://app.notion.com/ai?__chatclub_frame_load_nonce=${secondNonce}`
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

  const runtime = fs.readFileSync(path.join(root, "background/custom-userscript-runtime.js"), "utf8");
  assert.match(runtime, /executeSummaryUserscript[\s\S]*?await verifiedCustomUserscriptTarget\(api, sender\)/);
  assert.match(runtime, /executeTopicDeleteUserscript[\s\S]*?await verifiedCustomUserscriptTarget\(api, sender\)/);

  console.log("verified packaged frame injection fallback: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
