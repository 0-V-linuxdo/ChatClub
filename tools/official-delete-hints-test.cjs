#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const runtime = read("app/topic-delete/runtime.js");
const content = read("content-src/content-delete.js");
const runtimeModule = read("content-src/capabilities/delete-runtime.js");
const common = read("content-src/capabilities/delete-common.js");
const claude = read("content-src/capabilities/delete-claude.js");
const deepSeek = read("content-src/capabilities/delete-deepseek.js");

assert.match(runtime, /officialRuleConfigMatchesHref\(config, ready\.href\)/);
assert.match(runtime, /customDelete[\s\S]*?!customDelete && !deleteConfigAuthorizedForHref\(config, ready\.href\)/);
assert.match(runtime, /snapshotDeleteFrameConfig\([\s\S]*?completion\.officialRuleHints,[\s\S]*?attemptTimeoutMs,[\s\S]*?completion\.officialRuleActive === true/);
assert.match(runtime, /snapshot\.officialRuleHosts = snapshotOfficialDeleteScope/);
assert.match(runtime, /snapshot\.officialRulePathPrefixes = snapshotOfficialDeleteScope/);
assert.match(runtime, /payload: snapshotDeleteFramePayload\(payload\)/);
assert.doesNotMatch(runtime, /const runtimeConfig = config \? \{ \.\.\.config \}/, "frame requests must not spread the effective config");
assert.match(runtime, /officialRuleHints: completion\?\.officialRuleHints \|\| \{\}/);
assert.match(content, /common\.topicDeleteConfirmState\([\s\S]*data\?\.officialRuleHints \|\| \{\}/);
assert.match(runtimeModule, /officialRuleActive = officialRuleConfigMatchesHref\(incomingConfig, String\(location\.href \|\| ""\)\)/);
assert.match(runtimeModule, /!topicDeleteUsesCustomUserscript\(config\)[\s\S]*?!deleteConfigAuthorizedForHref\(config, String\(location\.href \|\| ""\)\)/);

assert.match(common, /qsa\("a\[href\]", document, \{ all: true \}\)/, "packaged link enumeration must remain present");
assert.match(common, /officialHints\?\.completionLinks/, "completion hints may only add link candidates");
assert.match(common, /deleteCompletionTargetState\([\s\S]*expectedIdentity[\s\S]*location\.href/, "completion must remain identity-aware");
assert.match(common, /present: Boolean\(trustedClick\) \|\| deleteDialogRoots\(officialHints\?\.dialog\)/);

assert.match(claude, /claudeConversationTitleFromMenuLabel/, "Claude title identity remains mandatory");
assert.match(claude, /claudeLinkedDeleteMenuRoot\(trigger\)/, "Claude menu remains control-bound");
assert.match(claude, /claudeDeleteMenuHasConversationFingerprint/, "Claude conversation menu fingerprint remains mandatory");
assert.match(claude, /claudeExactActionLabelMatches\(target, "Delete"\)/, "Claude confirmation remains exact-label gated");
assert.match(claude, /officialHints: hints/, "Claude trusted leases must retain their attempt hints");

assert.match(deepSeek, /url\.origin === location\.origin/, "DeepSeek hinted links must remain same-origin");
assert.match(deepSeek, /deepSeekChatIdFromHref\(link\.href[\s\S]*=== currentId/, "DeepSeek row selection remains exact-route based");
assert.match(deepSeek, /candidate === row \|\| candidate\.contains\?\.\(row\)/, "DeepSeek row hints must own the exact route link");
assert.match(deepSeek, /const labels = \["Delete", "删除"\]/, "DeepSeek destructive labels remain packaged");
assert.match(deepSeek, /clickDeleteConfirmIfPresent\(6500, ownershipGuard, hints\)/, "DeepSeek confirm remains bound to the exact action-owned dialog and button");
assert.match(deepSeek, /deepSeekConfirmationOwnershipIsCurrent\(ownership, hints, attemptGuard\)/, "DeepSeek confirm ownership remains attempt-and-route guarded");

(async () => {
  const previousLocation = globalThis.location;
  let nativeCalls = 0;
  try {
    const {
      deleteConversationIdentityFromHref,
      normalizeDeleteFrameHref,
      sameDeleteConversationIdentity
    } = await import("../shared/delete-completion.js");
    const { createDeleteRuntimeCapability } = await import("../content-src/capabilities/delete-runtime.js");
    globalThis.location = new URL("https://new.chatgpt.com/c/topic-1");
    const runtimeCapability = createDeleteRuntimeCapability({
      TOPIC_DELETE_FALLBACK_CONFIGS: {
        chatgpt: {
          id: "chatgpt",
          name: "ChatGPT",
          builtIn: true,
          enabled: true,
          deleteAuthorizedHosts: ["chatgpt.com", "chat.openai.com"],
          userscript: "",
          userscriptTimeoutMs: 5000
        }
      },
      PROTOCOL: {
        TOPIC_DELETE_MENU_COMMAND_EVENT: "menu-command",
        TOPIC_DELETE_RESULT_EVENT: "result",
        TOPIC_DELETE_PING_EVENT: "ping",
        TOPIC_DELETE_READY_EVENT: "ready",
        TOPIC_DELETE_BRIDGE_SOURCE: "bridge"
      },
      normalize: (value) => String(value || "").trim(),
      normalizeDeleteFrameHref,
      deleteConversationIdentityFromHref,
      sameDeleteConversationIdentity,
      contentDocumentId: "fixture-document",
      deleteCompactToken: (value) => String(value || ""),
      deleteResult: (ok, site, reason = "", extra = {}) => ({ ok, site, reason, ...extra }),
      deleteChatGptThread: async () => {
        nativeCalls += 1;
        return { ok: true, site: "chatgpt" };
      },
      validateDeepSeekTrustedCoordinates: () => ({ ok: true }),
      sanitizeDeepSeekTrustedResult: (value) => value
    });
    const invocation = {
      deleteAttemptId: "fixture-attempt",
      expectedDeleteIdentity: { provider: "chatgpt", id: "topic-1" },
      payload: { appId: "ChatGPT" }
    };
    const blocked = await runtimeCapability.deleteThread(invocation);
    assert.equal(blocked.ok, false);
    assert.match(blocked.reason, /host is not authorized/);
    assert.equal(nativeCalls, 0, "omitting config on a wildcard subdomain must not reach a fallback native runner");

    const approved = await runtimeCapability.deleteThread({
      ...invocation,
      config: {
        id: "chatgpt",
        name: "ChatGPT",
        builtIn: true,
        enabled: true,
        sourceMode: "builtIn",
        deleteAuthorizedHosts: ["chatgpt.com", "chat.openai.com", "new.chatgpt.com"],
        userscriptTimeoutMs: 5000
      }
    });
    assert.equal(approved.ok, true);
    assert.equal(nativeCalls, 1, "an explicitly authorized alias may reach the packaged native runner");
  } finally {
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  }
  console.log("official Delete hints remain candidate-only, host-authorized, and attempt-scoped: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
