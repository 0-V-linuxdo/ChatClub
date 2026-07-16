#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const EXTENSION_ID = "chatclub-test-extension";
const EXTENSION_URL = `chrome-extension://${EXTENSION_ID}/chatClub.html`;
const TAB_ID = 7;
const FRAME_ID = 11;
const FRAME_BINDING_ID = "a".repeat(64);
const BROWSER_DOCUMENT_ID = "browser-document-1";
const BRIDGE_DOCUMENT_ID = "bridge-document-1";
const FRAME_HREF = "https://chat.deepseek.com/a/chat/s/topic-1";

const sender = Object.freeze({
  id: EXTENSION_ID,
  url: EXTENSION_URL,
  frameId: 0,
  tab: Object.freeze({ id: TAB_ID, url: EXTENSION_URL })
});

function message(overrides = {}) {
  return {
    tabId: TAB_ID,
    expectedFrameId: FRAME_ID,
    expectedBindingId: FRAME_BINDING_ID,
    expectedBrowserDocumentId: BROWSER_DOCUMENT_ID,
    expectedBridgeDocumentId: BRIDGE_DOCUMENT_ID,
    expectedFrameHref: FRAME_HREF,
    x: 200,
    y: 140,
    hoverSettleMs: 0,
    keys: [{ key: "Enter", settleMs: 0 }],
    keySettleMs: 0,
    ...overrides
  };
}

function createApi(options = {}) {
  const expectedBrowserDocumentId = options.expectedBrowserDocumentId || BROWSER_DOCUMENT_ID;
  const legacyDocument = expectedBrowserDocumentId.startsWith("legacy:");
  const state = {
    attached: false,
    detached: false,
    commands: [],
    frameCalls: 0,
    attestationCalls: 0,
    frame: {
      frameId: FRAME_ID,
      parentFrameId: 0,
      documentId: legacyDocument ? "" : expectedBrowserDocumentId,
      url: FRAME_HREF,
      ...(options.frame || {})
    },
    attestation: {
      frameBindingId: FRAME_BINDING_ID,
      bridgeDocumentId: BRIDGE_DOCUMENT_ID,
      legacyDocumentId: legacyDocument ? expectedBrowserDocumentId : `legacy:${"b".repeat(64)}`,
      legacyDocumentValid: true,
      href: FRAME_HREF,
      ...(options.attestation || {})
    }
  };
  const api = {
    runtime: {
      id: EXTENSION_ID,
      getURL: (value = "") => `chrome-extension://${EXTENSION_ID}/${value}`
    },
    webNavigation: {
      async getFrame() {
        state.frameCalls += 1;
        options.onGetFrame?.(state);
        return state.frame ? { ...state.frame } : null;
      }
    },
    scripting: {
      async executeScript(details) {
        state.attestationCalls += 1;
        options.onAttest?.(state, details);
        const target = details?.target || {};
        if (legacyDocument) assert.deepEqual(target.frameIds, [FRAME_ID]);
        else assert.deepEqual(target.documentIds, [expectedBrowserDocumentId]);
        return [{
          frameId: FRAME_ID,
          documentId: state.frame?.documentId || "",
          result: { ...state.attestation }
        }];
      }
    },
    debugger: {
      async attach() {
        state.attached = true;
        options.onAttach?.(state);
      },
      async detach() {
        state.detached = true;
      },
      async sendCommand(_target, command, params) {
        state.commands.push({ command, params });
        options.onCommand?.(state, command, params);
      }
    }
  };
  return { api, state };
}

(async () => {
  const appRuntimeSource = fs.readFileSync(path.join(root, "app/topic-delete/runtime.js"), "utf8");
  for (const field of [
    "expectedFrameId",
    "expectedBindingId",
    "expectedBrowserDocumentId",
    "expectedBridgeDocumentId",
    "expectedFrameHref"
  ]) {
    assert.match(appRuntimeSource, new RegExp(`\\b${field}\\b`), `trusted input requests must carry ${field}`);
  }
  for (const [helper, action] of [
    ["dispatchClick", "dispatchTrustedClick"],
    ["dispatchHover", "dispatchTrustedMouseMove"]
  ]) {
    assert.match(
      appRuntimeSource,
      new RegExp(`async function ${helper}\\([^)]*target[^)]*\\)[\\s\\S]*?action: \\"${action}\\"[\\s\\S]{0,180}\\.\\.\\.target`),
      `${action} must forward the caller's exact revalidated iframe identity snapshot`
    );
  }
  assert.match(
    appRuntimeSource,
    /async function dispatchKeySequence\([^)]*beforeDispatch[^)]*\)[\s\S]*?const target = await beforeDispatch\(\)[\s\S]*?action: "dispatchTrustedKeySequence"[\s\S]{0,180}\.\.\.target/,
    "dispatchTrustedKeySequence must forward a fresh exact identity snapshot"
  );
  assert.match(appRuntimeSource, /trustedBridgeDocumentId\(iframe\) !== expectedDocumentId/);
  assert.match(appRuntimeSource, /return await trustedInputTarget\(iframe, expectedDocumentId\)/);
  assert.match(appRuntimeSource, /String\(instruction\?\.documentId \|\| ""\) === documentId/);

  const moduleUrl = pathToFileURL(path.join(root, "background/trusted-input.js")).href;
  const {
    dispatchTrustedClick,
    dispatchTrustedKeySequence,
    dispatchTrustedMouseMove
  } = await import(moduleUrl);

  {
    const { api, state } = createApi();
    assert.deepEqual(
      await dispatchTrustedClick(api, message(), sender),
      { tabId: TAB_ID, frameId: FRAME_ID, x: 200, y: 140 }
    );
    assert.deepEqual(
      state.commands.map((entry) => entry.params.type),
      ["mouseMoved", "mousePressed", "mouseReleased"]
    );
    assert.equal(state.attached, true);
    assert.equal(state.detached, true);
    assert.ok(state.attestationCalls >= 4, "click identity must be re-attested before each effectful phase");
  }

  {
    const { api, state } = createApi();
    await dispatchTrustedMouseMove(api, message(), sender);
    assert.deepEqual(state.commands.map((entry) => entry.params.type), ["mouseMoved"]);
    assert.ok(state.attestationCalls >= 2, "hover identity must be checked before and after debugger attachment");
  }

  {
    const legacyDocumentId = `legacy:${"d".repeat(64)}`;
    const { api, state } = createApi({ expectedBrowserDocumentId: legacyDocumentId });
    await dispatchTrustedMouseMove(api, message({ expectedBrowserDocumentId: legacyDocumentId }), sender);
    assert.deepEqual(state.commands.map((entry) => entry.params.type), ["mouseMoved"]);
  }

  {
    const legacyDocumentId = `legacy:${"d".repeat(64)}`;
    const { api, state } = createApi({
      expectedBrowserDocumentId: legacyDocumentId,
      attestation: { legacyDocumentValid: false }
    });
    await assert.rejects(
      dispatchTrustedMouseMove(api, message({ expectedBrowserDocumentId: legacyDocumentId }), sender),
      /legacy document attestation changed/i
    );
    assert.equal(state.attached, false);
    assert.equal(state.commands.length, 0);
  }

  {
    const { api, state } = createApi();
    await dispatchTrustedKeySequence(api, message(), sender);
    assert.deepEqual(state.commands.map((entry) => entry.params.type), ["keyDown", "keyUp"]);
    assert.ok(state.attestationCalls >= 3, "key identity must be re-attested before down and up events");
  }

  for (const [label, options, expected] of [
    ["nested frame", { frame: { parentFrameId: 3 } }, /direct child iframe/i],
    ["browser document", { frame: { documentId: "browser-document-2" } }, /document changed/i],
    ["binding", { attestation: { frameBindingId: "c".repeat(64) } }, /attestation changed/i],
    ["bridge document", { attestation: { bridgeDocumentId: "bridge-document-2" } }, /attestation changed/i],
    ["frame URL", { frame: { url: "https://chat.deepseek.com/a/chat/s/topic-2" } }, /target URL changed/i]
  ]) {
    const { api, state } = createApi(options);
    await assert.rejects(dispatchTrustedClick(api, message(), sender), expected, label);
    assert.equal(state.attached, false, `${label} mismatch must fail before debugger attachment`);
    assert.equal(state.commands.length, 0, `${label} mismatch must not dispatch input`);
  }

  {
    const { api, state } = createApi();
    await assert.rejects(
      dispatchTrustedClick(api, message(), { ...sender, id: "different-extension" }),
      /current ChatClub extension page/i
    );
    assert.equal(state.attached, false);
  }

  {
    const { api, state } = createApi({
      onAttach(current) {
        current.frame.documentId = "browser-document-after-navigation";
      }
    });
    await assert.rejects(dispatchTrustedClick(api, message(), sender), /document changed/i);
    assert.equal(state.attached, true, "the test must navigate only after debugger attachment");
    assert.equal(state.detached, true, "a failed post-attach attestation must detach the debugger");
    assert.equal(state.commands.length, 0, "navigation between preflight and execution must suppress all input");
  }

  {
    let navigated = false;
    const { api, state } = createApi({
      onAttest(current) {
        if (!navigated) {
          navigated = true;
          current.frame.documentId = "browser-document-during-attestation";
        }
      }
    });
    await assert.rejects(dispatchTrustedClick(api, message(), sender), /document changed|navigated/i);
    assert.equal(state.attached, false, "navigation during preflight attestation must fail before debugger attachment");
    assert.equal(state.commands.length, 0);
  }

  console.log("trusted input secure frame attestation: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
