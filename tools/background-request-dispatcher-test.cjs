#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const contracts = await import(
    pathToFileURL(path.join(root, "shared/background-requests.js")).href
  );
  const dispatcherModule = await import(
    pathToFileURL(path.join(root, "background/request-dispatcher.js")).href
  );
  const {
    BACKGROUND_REQUEST_ACTIONS,
    BACKGROUND_REQUEST_ERROR_CONTRACT,
    BACKGROUND_REQUEST_SPECS,
    BackgroundRequestError,
    assertBackgroundRequestSpecifications,
    backgroundRequestMessage,
    createBackgroundRequestClient
  } = contracts;
  const {
    createBackgroundRequestDispatcher,
    createBackgroundRequestListener
  } = dispatcherModule;

  assert.deepEqual(
    Object.keys(BACKGROUND_REQUEST_SPECS).sort(),
    Object.values(BACKGROUND_REQUEST_ACTIONS).sort(),
    "every named background action must have exactly one contract"
  );
  assert.equal(assertBackgroundRequestSpecifications(), BACKGROUND_REQUEST_SPECS);
  const configAction = BACKGROUND_REQUEST_ACTIONS.GET_CONFIG_INFO;
  assert.throws(
    () => assertBackgroundRequestSpecifications({
      ...BACKGROUND_REQUEST_SPECS,
      [configAction]: Object.freeze({
        ...BACKGROUND_REQUEST_SPECS[configAction],
        senderClass: "direct-child-frame"
      })
    }),
    /sender\/authorizer mismatch/
  );
  assert.throws(
    () => assertBackgroundRequestSpecifications({
      ...BACKGROUND_REQUEST_SPECS,
      [configAction]: Object.freeze({
        ...BACKGROUND_REQUEST_SPECS[configAction],
        mutates: "no"
      })
    }),
    /mutation contract is invalid/
  );
  assert.throws(
    () => assertBackgroundRequestSpecifications({
      ...BACKGROUND_REQUEST_SPECS,
      [configAction]: Object.freeze({
        ...BACKGROUND_REQUEST_SPECS[configAction],
        error: Object.freeze({
          ...BACKGROUND_REQUEST_SPECS[configAction].error,
          codes: Object.freeze(["DUPLICATE", "DUPLICATE"])
        })
      })
    }),
    /error codes.*contains duplicates/
  );
  assert.deepEqual(BACKGROUND_REQUEST_ERROR_CONTRACT.optional, {
    code: "string",
    delivered: "boolean"
  });
  for (const [action, spec] of Object.entries(BACKGROUND_REQUEST_SPECS)) {
    assert.equal(typeof spec.senderClass, "string", `${action} sender class`);
    assert.equal(typeof spec.authorize, "string", `${action} authorization hook`);
    assert.equal(typeof spec.mutates, "boolean", `${action} mutation metadata`);
    assert.ok(spec.payload?.required && spec.payload?.optional, `${action} payload contract`);
    assert.ok(spec.response?.required && spec.response?.optional, `${action} response contract`);
    assert.equal(spec.error?.envelope, BACKGROUND_REQUEST_ERROR_CONTRACT, `${action} error contract`);
  }

  const testError = (codes = []) => Object.freeze({
    envelope: BACKGROUND_REQUEST_ERROR_CONTRACT,
    codes: Object.freeze(codes)
  });
  const testSpecs = Object.freeze({
    read: Object.freeze({
      senderClass: "test-sender",
      authorize: "authorizeTestSender",
      mutates: false,
      payload: Object.freeze({ required: Object.freeze({ value: "number" }), optional: Object.freeze({}) }),
      response: Object.freeze({ required: Object.freeze({ doubled: "number" }), optional: Object.freeze({}) }),
      error: testError()
    }),
    fail: Object.freeze({
      senderClass: "test-sender",
      authorize: "authorizeTestSender",
      mutates: true,
      payload: Object.freeze({ required: Object.freeze({}), optional: Object.freeze({}) }),
      response: Object.freeze({ required: Object.freeze({}), optional: Object.freeze({}) }),
      error: testError(["TIMEOUT"])
    })
  });
  const calls = [];
  const dispatch = createBackgroundRequestDispatcher(
    testSpecs,
    [
      ["read", (message, sender, authorization, spec) => {
        calls.push(["handler", sender.id, authorization.identity, spec.senderClass]);
        return { doubled: message.value * 2 };
      }],
      ["fail", () => {
        const error = new Error("delivery state is uncertain");
        error.code = "TIMEOUT";
        error.delivered = true;
        error.privateDetail = "must not cross the response boundary";
        throw error;
      }]
    ],
    {
      authorizeTestSender(message, sender, spec) {
        calls.push(["authorize", message.action, sender.id, spec.senderClass]);
        if (sender.id !== "allowed") throw new Error("sender denied");
        return { identity: "verified" };
      }
    }
  );

  assert.deepEqual(
    await dispatch({ source: "chatclub", action: "read", value: 4 }, { id: "allowed" }),
    { success: true, doubled: 8 }
  );
  assert.deepEqual(calls, [
    ["authorize", "read", "allowed", "test-sender"],
    ["handler", "allowed", "verified", "test-sender"]
  ]);
  await assert.rejects(() => dispatch({ source: "chatclub", action: "missing" }, { id: "allowed" }), /Unknown action: missing/);
  await assert.rejects(() => dispatch({ source: "other", action: "read", value: 4 }, { id: "allowed" }), /Invalid background request source/);
  await assert.rejects(() => dispatch({ source: "chatclub", action: "read", value: "4" }, { id: "allowed" }), /read\.value must be number/);
  await assert.rejects(() => dispatch({ source: "chatclub", action: "read", value: 4, surprise: true }, { id: "allowed" }), /undeclared field: surprise/);
  await assert.rejects(() => dispatch({ source: "chatclub", action: "read", value: 4 }, { id: "denied" }), /sender denied/);

  assert.throws(
    () => createBackgroundRequestDispatcher(
      { read: testSpecs.read },
      [["read", () => ({ doubled: 1 })], ["read", () => ({ doubled: 2 })]],
      { authorizeTestSender: () => null }
    ),
    /Duplicate background request handler: read/
  );
  assert.throws(
    () => createBackgroundRequestDispatcher(
      { read: testSpecs.read },
      [],
      { authorizeTestSender: () => null }
    ),
    /Missing background request handler: read/
  );

  const listener = createBackgroundRequestListener(dispatch);
  assert.equal(listener({ source: "someone-else", action: "read", value: 2 }, {}, () => {}), false);
  const errorResponse = await new Promise((resolve) => {
    assert.equal(listener({ source: "chatclub", action: "fail" }, { id: "allowed" }, resolve), true);
  });
  assert.deepEqual(errorResponse, {
    success: false,
    error: "delivery state is uncertain",
    code: "TIMEOUT",
    delivered: true
  });
  assert.equal(Object.hasOwn(errorResponse, "privateDetail"), false);

  assert.deepEqual(
    backgroundRequestMessage(BACKGROUND_REQUEST_ACTIONS.GET_CONFIG_INFO),
    { source: "chatclub", action: "getConfigInfo" }
  );
  let mutatingSendCount = 0;
  const requestBackground = createBackgroundRequestClient(async (message) => {
    mutatingSendCount += 1;
    assert.equal(message.action, BACKGROUND_REQUEST_ACTIONS.SEND_FRAME_COMMAND);
    return {
      success: false,
      error: "delivery state is uncertain",
      code: "TIMEOUT",
      delivered: true
    };
  });
  const clientError = await requestBackground(BACKGROUND_REQUEST_ACTIONS.SEND_FRAME_COMMAND, {
    appTabId: 7,
    bridgeDocumentId: "document-1",
    command: "deleteThread"
  }).then(() => null, (error) => error);
  assert.ok(clientError instanceof BackgroundRequestError);
  assert.equal(clientError.code, "TIMEOUT");
  assert.equal(clientError.delivered, true);
  assert.equal(clientError.mutates, true);
  assert.equal(mutatingSendCount, 1, "the shared client must never retry a mutating request");

  const undeclaredCodeClient = createBackgroundRequestClient(async () => ({
    success: false,
    error: "invalid code",
    code: "UNDECLARED",
    delivered: false
  }));
  await assert.rejects(
    () => undeclaredCodeClient(BACKGROUND_REQUEST_ACTIONS.SEND_FRAME_COMMAND, {
      appTabId: 7,
      bridgeDocumentId: "document-1",
      command: "getPageMeta"
    }),
    /undeclared error code: UNDECLARED/
  );

  const runtime = fs.readFileSync(path.join(root, "background/runtime.js"), "utf8");
  assert.match(runtime, /createBackgroundRequestDispatcher\(/);
  assert.match(runtime, /onMessage\.addListener\(createBackgroundRequestListener\(dispatchBackgroundRequest\)\)/);
  assert.doesNotMatch(runtime, /if \(message\.action ===/);

  console.log("background request dispatcher: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
