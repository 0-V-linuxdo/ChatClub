#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const completion = await import(pathToFileURL(path.join(root, "shared/delete-completion.js")).href);
  const {
    DELETE_COMPLETION_STATE_VERSION,
    deleteCompletionTargetState,
    deleteConversationIdentityFromHref,
    inspectDeleteCompletionState,
    normalizeDeleteFrameHref
  } = completion;

  assert.equal(
    normalizeDeleteFrameHref("HTTPS://Chat.DeepSeek.Com:443/a/../chat/s/thread-1?x=1#turn"),
    "https://chat.deepseek.com/chat/s/thread-1?x=1#turn",
    "the full frame URL must be normalized without discarding query or fragment state"
  );
  assert.equal(normalizeDeleteFrameHref("javascript:alert(1)"), "");

  const routes = [
    ["https://chatgpt.com/c/chat-1", { provider: "chatgpt", id: "chat-1" }],
    ["https://chatgpt.com/g/gpt-1/c/chat-1", { provider: "chatgpt", id: "chat-1" }],
    ["https://gemini.google.com/app/thread-1", { provider: "gemini", id: "thread-1" }],
    ["https://assistant.kagi.com/chat/thread-1", { provider: "kagi", id: "thread-1" }],
    ["https://app.notion.com/chat?t=thread-1", { provider: "notion", id: "thread-1" }],
    ["https://grok.com/c/thread-1", { provider: "grok", id: "thread-1" }],
    ["https://gk.dairoot.cn/chat/thread-1", { provider: "grok", id: "thread-1" }],
    ["https://chat.deepseek.com/a/chat/s/thread-1", { provider: "deepseek", id: "thread-1" }]
  ];
  for (const [href, expected] of routes) {
    assert.deepEqual(deleteConversationIdentityFromHref(href), expected, href);
  }
  for (const href of [
    "https://chatgpt.com/",
    "https://gemini.google.com/app",
    "https://app.notion.com/chat",
    "https://example.test/chat/thread-1",
    "javascript:alert(1)",
    "not a URL"
  ]) {
    assert.equal(deleteConversationIdentityFromHref(href), null, `unsupported route must not invent an identity: ${href}`);
  }

  const expected = { provider: "deepseek", id: "thread-1" };
  assert.deepEqual(
    deleteCompletionTargetState(
      expected,
      "https://chat.deepseek.com/a/chat/s/thread-1",
      ["/a/chat/s/thread-1", "/a/chat/s/thread-2"]
    ),
    { identity: expected, current: true, present: true },
    "the current route and matching conversation link must be reported independently"
  );
  assert.deepEqual(
    deleteCompletionTargetState(
      expected,
      "https://chat.deepseek.com/a/chat/s/thread-2",
      ["/a/chat/s/thread-1"]
    ),
    { identity: expected, current: false, present: true },
    "a removed current route is insufficient while the matching conversation link remains"
  );
  assert.deepEqual(
    deleteCompletionTargetState(
      expected,
      "https://chat.deepseek.com/",
      ["/a/chat/s/thread-2"]
    ),
    { identity: expected, current: false, present: false },
    "completion requires the target to be neither current nor present"
  );
  assert.equal(
    deleteCompletionTargetState(null, "https://chat.deepseek.com/", []),
    null,
    "an unsupported pre-delete route must expose identity as unavailable"
  );

  const complete = {
    version: DELETE_COMPLETION_STATE_VERSION,
    present: false,
    target: { identity: expected, current: false, present: false }
  };
  assert.equal(inspectDeleteCompletionState(complete, expected).complete, true);
  assert.equal(inspectDeleteCompletionState({ ...complete, present: true }, expected).complete, false);
  assert.equal(
    inspectDeleteCompletionState({ ...complete, target: { identity: expected, current: true, present: false } }, expected).complete,
    false
  );
  assert.equal(
    inspectDeleteCompletionState({ ...complete, target: { identity: expected, current: false, present: true } }, expected).complete,
    false
  );
  for (const malformed of [
    null,
    undefined,
    {},
    { version: DELETE_COMPLETION_STATE_VERSION, present: false },
    { version: DELETE_COMPLETION_STATE_VERSION, present: "false", target: null },
    { version: DELETE_COMPLETION_STATE_VERSION, present: false, target: null }
  ]) {
    assert.equal(
      inspectDeleteCompletionState(malformed, expected).valid,
      false,
      "missing or malformed identity-aware state must fail closed"
    );
  }
  assert.deepEqual(
    inspectDeleteCompletionState({ version: DELETE_COMPLETION_STATE_VERSION, present: false, target: null }, null),
    {
      valid: true,
      complete: false,
      dialogPresent: false,
      target: null,
      state: { version: DELETE_COMPLETION_STATE_VERSION, present: false, target: null }
    },
    "identity-unavailable routes may report a valid dialog state but can never prove deletion complete"
  );

  console.log("delete completion identity and strict state contract: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
