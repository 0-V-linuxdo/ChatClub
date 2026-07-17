#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".js") ? [absolute] : [];
  });
}

(async () => {
  const contracts = await import(pathToFileURL(path.join(root, "shared/background-requests.js")).href);
  const contentContracts = await import(pathToFileURL(path.join(root, "shared/content-background-requests.js")).href);
  const actions = contracts.BACKGROUND_REQUEST_ACTIONS;
  for (const request of contentContracts.CONTENT_BACKGROUND_REQUEST_CONTRACTS) {
    assert.equal(contracts.BACKGROUND_REQUEST_SPECS[request.action], request.spec);
    assert.ok(Object.values(actions).includes(request.action));
  }
  const aggregateSource = fs.readFileSync(path.join(root, "shared/background-requests.js"), "utf8");
  for (const request of contentContracts.CONTENT_BACKGROUND_REQUEST_CONTRACTS) {
    assert.equal(
      aggregateSource.includes(JSON.stringify(request.action)),
      false,
      `${request.action} must have one declaration source in shared/content-background-requests.js`
    );
  }
  const helperPath = path.join(root, "content-src/shared/extension-runtime.js");
  const helperSource = fs.readFileSync(helperPath, "utf8");
  assert.match(helperSource, /createBackgroundRequestContractClient\(sendExtensionRuntimeMessage\)/);
  assert.doesNotMatch(helperSource, /background-requests\.js/);
  assert.doesNotMatch(helperSource, /export function sendExtensionRuntimeMessage|export \{[^}]*sendExtensionRuntimeMessage/);

  for (const file of sourceFiles(path.join(root, "content-src"))) {
    if (file === helperPath) continue;
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /\bruntime\?*\.sendMessage\s*\(/,
      `${path.relative(root, file)} must use the typed Content background client`
    );
    for (const action of Object.values(actions)) {
      const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.doesNotMatch(
        source,
        new RegExp(`\\baction\\s*:\\s*["']${escaped}["']`),
        `${path.relative(root, file)} must not bypass the typed client for ${action}`
      );
    }
  }

  const sent = [];
  globalThis.browser = {
    runtime: {
      sendMessage: async (message) => {
        sent.push(message);
        return {
          success: true,
          documentId: "document-1",
          browserDocumentId: "browser-document-1",
          frameId: 9,
          runtimeIdentity: { implementationVersion: "runtime-1" }
        };
      }
    }
  };
  delete globalThis.chrome;
  try {
    const runtimeModule = await import(`${pathToFileURL(helperPath).href}?test=promise-client`);
    assert.equal(Object.hasOwn(runtimeModule, "sendExtensionRuntimeMessage"), false);
    const response = await runtimeModule.requestBackground(contentContracts.REGISTER_FRAME_CONTEXT_REQUEST, {
      bridgeDocumentId: "document-1",
      browserDocumentId: "browser-document-1",
      secureFrameToken: "secure-token",
      frameBindingId: "f".repeat(64),
      bridgeVersion: "bridge-1",
      runtimeIdentity: { implementationVersion: "runtime-1" }
    });
    assert.equal(response.success, true);
    assert.deepEqual(sent, [{
      source: contracts.BACKGROUND_REQUEST_SOURCE,
      action: actions.REGISTER_FRAME_CONTEXT,
      bridgeDocumentId: "document-1",
      browserDocumentId: "browser-document-1",
      secureFrameToken: "secure-token",
      frameBindingId: "f".repeat(64),
      bridgeVersion: "bridge-1",
      runtimeIdentity: { implementationVersion: "runtime-1" }
    }]);
    await assert.rejects(
      () => runtimeModule.requestBackground(contentContracts.SYNC_GROK_SESSION_COOKIES_REQUEST, {
        bridgeVersion: "bridge-1",
        undeclared: true
      }),
      /undeclared field: undeclared/
    );
    assert.equal(sent.length, 1, "invalid payloads must fail before the raw transport");
  } finally {
    delete globalThis.browser;
    delete globalThis.chrome;
  }

  console.log("content background request client: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
