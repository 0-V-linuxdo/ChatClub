#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function section(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `${label} must remain directly testable`);
  return source.slice(start, end).trim();
}

function link(id, options = {}) {
  const href = `https://chat.deepseek.com/a/chat/s/${id}`;
  return {
    href,
    className: options.className || "",
    getAttribute(name) {
      if (name === "href") return href;
      if (name === "aria-current") return options.ariaCurrent || "";
      return "";
    }
  };
}

function chatId(value) {
  return String(value?.href || value?.getAttribute?.("href") || value || "")
    .match(/\/(?:a\/)?chat\/s\/([^/?#]+)/i)?.[1] || "";
}

const sources = {
  main: read("content-src/preload/deepseek-delete.js"),
  native: read("content-src/capabilities/delete-deepseek.js"),
  nativeRuntime: read("content-src/capabilities/delete-runtime.js"),
  standalone: `${read("build-src/topic-delete-userscript-engine-core.js")}\n${read("build-src/topic-delete-userscript-engine-sites.js")}`,
  runtime: read("app/topic-delete/runtime.js")
};

const resolverSources = {
  main: section(sources.main, "  const currentTopicLink", "\n  let pendingTrustedDeleteAttempt", "MAIN resolver"),
  native: section(sources.native, "  function findDeepSeekCurrentTopicRow", "\n  function deepSeekVisualTopicRow", "native resolver"),
  standalone: section(sources.standalone, "  function deepSeekCurrentRow", "\n  function deepSeekVisualRow", "standalone resolver")
};

for (const [name, source] of Object.entries(resolverSources)) {
  assert.doesNotMatch(source, /links\s*\[\s*0\s*\]|titleMatch|titleTokens|return selected/, `${name} must not guess a row`);
  assert.match(source, /if \(!root\) return null/, `${name} must require a verified sidebar root`);
  assert.match(source, /if \(!(?:id|currentId)\) return null/, `${name} must require a stable route id`);
}
assert.match(sources.main, /const verifiedSidebarRoot = \(\) =>/, "MAIN must independently establish a sidebar root");
assert.doesNotMatch(sources.native, /function deepSeekTopicRows\b/, "native title-scored rows must remain removed");
assert.doesNotMatch(sources.standalone, /function deepSeekRows\b/, "standalone title-scored rows must remain removed");

function mainResolver(links, currentId, sidebarRoot) {
  const factory = new Function(
    "verifiedSidebarRoot",
    "deepSeekTopicLinks",
    "currentChatId",
    "chatIdFromLink",
    `"use strict"; ${resolverSources.main}; return currentTopicLink;`
  );
  return factory(() => sidebarRoot, () => links, () => currentId, chatId)(sidebarRoot);
}

function nativeResolver(links, currentId, sidebarRoot) {
  const factory = new Function(
    "deepSeekChatLinks",
    "deepSeekChatIdFromHref",
    "location",
    `"use strict"; ${resolverSources.native}; return findDeepSeekCurrentTopicRow;`
  );
  return factory(() => links, chatId, { href: currentId ? `https://chat.deepseek.com/a/chat/s/${currentId}` : "https://chat.deepseek.com/" })(sidebarRoot);
}

function standaloneResolver(links, currentId, sidebarRoot) {
  const factory = new Function(
    "deepSeekLinks",
    "deepSeekChatId",
    "location",
    `"use strict"; ${resolverSources.standalone}; return deepSeekCurrentRow;`
  );
  return factory(() => links, chatId, { href: currentId ? `https://chat.deepseek.com/a/chat/s/${currentId}` : "https://chat.deepseek.com/" })(sidebarRoot);
}

for (const [name, resolve] of Object.entries({ main: mainResolver, native: nativeResolver, standalone: standaloneResolver })) {
  const sidebar = {};
  const exact = link("topic-1");
  const selectedWrong = link("topic-2", { ariaCurrent: "page", className: "selected current" });
  assert.equal(resolve([selectedWrong, exact], "topic-1", sidebar), exact, `${name}: exact route row must win`);
  assert.equal(resolve([link("topic-1-extra"), exact], "topic-1", sidebar), exact, `${name}: ids must not use substring matching`);
  assert.equal(resolve([selectedWrong], "topic-1", sidebar), null, `${name}: selected/current cannot replace exact route identity`);
  assert.equal(resolve([exact], "", sidebar), null, `${name}: URL-less selected/current mutation is forbidden`);
  assert.equal(resolve([exact], "topic-1", null), null, `${name}: document-wide fallback is forbidden without a sidebar root`);
}

const deletionSections = {
  main: section(sources.main, "  const deleteThread = async", "\n  const messageListener", "MAIN delete flow"),
  native: section(sources.native, "  async function deleteDeepSeekThread", "\n  const TOPIC_DELETE_FALLBACK_CONFIGS", "native delete flow"),
  standalone: section(sources.standalone, "  async function deleteDeepSeek", "\n\n  const runners", "standalone delete flow")
};

for (const [name, source] of Object.entries(deletionSections)) {
  const rowIndex = Math.max(source.indexOf("currentTopicLink("), source.indexOf("findDeepSeekCurrentTopicRow("), source.indexOf("deepSeekCurrentRow("));
  const headerIndex = Math.max(source.indexOf("findHeaderMoreButton()"), source.indexOf("deepSeekHeaderMenuButton("));
  assert.ok(rowIndex >= 0 && headerIndex > rowIndex, `${name}: row flow must precede header fallback`);
  assert.match(source, /stable current conversation route is required/, `${name}: stable route is mandatory`);
  assert.match(source, /routeStillCurrent/, `${name}: route must be revalidated after waits`);
  assert.match(source, /pendingTrustedDeleteAttempt|deepSeekPendingTrustedAttempt/, `${name}: trusted retry must use an owned lease`);
  assert.match(source, /unverified delete confirmation is already open/, `${name}: retry-entry confirmation must fail closed`);
  assert.match(source, /arm(?:DeepSeek)?TrustedRetry\([\s\S]{0,180}trusted topic menu click did not open/, `${name}: a known pre-delete point miss must lease the next menu point`);
  assert.match(source, /explicit Delete action could not be safely activated/, `${name}: a visible Delete item that fails activation must not renew the lease`);
  assert.match(source, /cleanBaseline/, `${name}: initial trusted instructions require a clean no-menu/no-confirm baseline`);
}

for (const source of [sources.main, sources.native, sources.standalone]) {
  assert.match(source, /phase: "awaiting-menu-trigger"/, "trusted lease must record its phase");
  assert.match(source, /expiresAt: Date\.now\(\) \+ 20000/, "trusted lease must expire");
}
assert.doesNotMatch(deletionSections.main, /clickExistingConfirm/, "MAIN retry must not adopt a pre-existing confirmation");
assert.doesNotMatch(deletionSections.native, /confirmedAfterBridge/, "native must not confirm after an uncertain MAIN result");
assert.match(deletionSections.native, /hasTrustedBridgeInstruction/, "isolated forwarding must preserve a combined MAIN trusted instruction");
assert.match(deletionSections.native, /needsTrustedMenuClick: true[\s\S]*needsTrustedKeySequence: true/, "MAIN menu and key instructions must be forwarded together");

const coordinateSource = section(
  sources.native,
  "  function validateDeepSeekTrustedCoordinates",
  "\n  function validateDeepSeekBridgeTrustedResult",
  "isolated DeepSeek trusted-coordinate validator"
);
const coordinateValidator = new Function(
  "deepSeekSidebarRoot",
  "findDeepSeekCurrentTopicRow",
  "deepSeekTopicMenuRect",
  `"use strict"; ${coordinateSource}; return validateDeepSeekTrustedCoordinates;`
)(() => ({}), () => ({}), () => ({ left: 100, right: 300, top: 50, bottom: 90, width: 200, height: 40 }));

const safeMenuValidation = coordinateValidator({
  needsTrustedMenuClick: true,
  trustedMenuClick: { framePoints: [{ x: 280, y: 70 }], hoverSettleMs: 999999999 }
});
assert.equal(safeMenuValidation.ok, true);
assert.equal(safeMenuValidation.instructions.trustedMenuClick.hoverSettleMs, 360, "untrusted menu timing must be rebuilt canonically");
assert.match(
  coordinateValidator({ needsTrustedMenuClick: true, trustedMenuClick: { framePoints: [{ x: 120, y: 70 }] } }).reason,
  /outside/,
  "forged left-side menu coordinates must be rejected"
);
assert.match(
  coordinateValidator({ needsTrustedMenuClick: true, trustedMenuClick: { framePoints: Array.from({ length: 13 }, () => ({ x: 280, y: 70 })) } }).reason,
  /outside/,
  "oversized point inventories must be rejected"
);
const validKeySequence = {
  framePoint: { x: 160, y: 70 },
  keys: [{ key: "Tab", settleMs: 10 }, { key: "Return", settleMs: 20 }],
  clickSettleMs: 30,
  keySettleMs: 40,
  settleMs: 50
};
const safeKeyValidation = coordinateValidator({ needsTrustedKeySequence: true, trustedKeySequence: validKeySequence });
assert.equal(safeKeyValidation.ok, true);
assert.deepEqual(safeKeyValidation.instructions.trustedKeySequence.keys, [{ key: "Tab", settleMs: 140 }, { key: "Enter", settleMs: 260 }]);
assert.match(coordinateValidator({ needsTrustedKeySequence: true, trustedKeySequence: { ...validKeySequence, framePoint: { x: 285, y: 70 } } }).reason, /contract/);
assert.match(coordinateValidator({ needsTrustedKeySequence: true, trustedKeySequence: { ...validKeySequence, keys: [{ key: "Tab", settleMs: 10 }, { key: "Delete", settleMs: 20 }] } }).reason, /contract/);
assert.match(coordinateValidator({ needsTrustedKeySequence: true, trustedKeySequence: { ...validKeySequence, keys: [{ key: "Tab", settleMs: 10 }, { key: "Tab", settleMs: 10 }, { key: "Enter", settleMs: 20 }] } }).reason, /contract/);
assert.match(coordinateValidator({ needsTrustedKeySequence: true, trustedKeySequence: { ...validKeySequence, keys: [{ key: "Tab", settleMs: 10, metaKey: true }, { key: "Enter", settleMs: 20 }] } }).reason, /contract/);
assert.match(coordinateValidator({ needsTrustedKeySequence: true, trustedKeySequence: { ...validKeySequence, keys: [{ key: "Tab", settleMs: 10, ctrlKey: true }, { key: "Enter", settleMs: 20 }] } }).reason, /contract/);
assert.match(coordinateValidator({ needsTrustedKeySequence: true, trustedKeySequence: { ...validKeySequence, settleMs: 999999999 } }).reason, /contract/);

const bridgeValidatorSource = section(
  sources.native,
  "  function validateDeepSeekBridgeTrustedResult",
  "\n  function deepSeekBridgeFallbackDisposition",
  "isolated MAIN-result validator"
);
const bridgeValidator = new Function(
  "normalize",
  "validateDeepSeekTrustedCoordinates",
  `"use strict"; ${bridgeValidatorSource}; return validateDeepSeekBridgeTrustedResult;`
)((value) => String(value || "").trim(), coordinateValidator);
const trustedBridgeResult = {
  needsTrustedMenuClick: true,
  deleteAttemptId: "attempt-1",
  routeId: "topic-1",
  trustedMenuClick: { framePoints: [{ x: 280, y: 70 }] }
};
assert.equal(bridgeValidator(trustedBridgeResult, { deleteAttemptId: "attempt-1" }, "topic-1").ok, true);
assert.match(bridgeValidator(trustedBridgeResult, { deleteAttemptId: "attempt-2" }, "topic-1").reason, /does not match/);
assert.match(bridgeValidator(trustedBridgeResult, { deleteAttemptId: "attempt-1" }, "topic-2").reason, /does not match/);

const leaseSource = section(
  sources.native,
  "  let deepSeekPendingTrustedAttempt",
  "\n  function validateDeepSeekTrustedCoordinates",
  "native trusted-attempt lease"
);
const leaseLocation = { href: "https://chat.deepseek.com/a/chat/s/topic-1" };
const lease = new Function(
  "normalize",
  "location",
  "deepSeekChatIdFromHref",
  "deleteResult",
  `"use strict"; ${leaseSource}; return {
    arm: armDeepSeekTrustedRetry,
    owned: deepSeekTrustedRetryOwned,
    consume() { deepSeekPendingTrustedAttempt = null; }
  };`
)(
  (value) => String(value || "").trim(),
  leaseLocation,
  chatId,
  (ok, site, reason) => ({ ok, site, reason })
);
lease.arm({ deleteAttemptId: "attempt-1" }, { ok: false, reason: "retry" });
assert.equal(lease.owned({ deleteAttemptId: "attempt-1" }), true, "same attempt and route owns the lease");
assert.equal(lease.owned({ deleteAttemptId: "attempt-2" }), false, "attempt mismatch must fail");
leaseLocation.href = "https://chat.deepseek.com/a/chat/s/topic-2";
assert.equal(lease.owned({ deleteAttemptId: "attempt-1" }), false, "route mismatch must invalidate the lease");
leaseLocation.href = "https://chat.deepseek.com/a/chat/s/topic-1";
lease.consume();
assert.equal(lease.owned({ deleteAttemptId: "attempt-1" }), false, "lease must be single-use");
lease.arm({ deleteAttemptId: "attempt-1" }, { ok: false, reason: "first menu point did not open" });
assert.equal(lease.owned({ deleteAttemptId: "attempt-1" }), true, "a known pre-delete first-point miss may lease the second point");
lease.consume();

const invocationSource = section(
  sources.nativeRuntime,
  "  function validateTopicDeleteInvocation",
  "\n  function bindDeleteTrustedInstructions",
  "content handler target validator"
);
const locationState = { href: "https://chat.deepseek.com/a/chat/s/topic-1" };
const normalizeHref = (value) => {
  try { return new URL(String(value || "")).href; } catch { return ""; }
};
const invocationValidator = new Function(
  "normalize",
  "location",
  "normalizeDeleteFrameHref",
  "deleteConversationIdentityFromHref",
  "sameDeleteConversationIdentity",
  `"use strict"; ${invocationSource}; return validateTopicDeleteInvocation;`
)(
  (value) => String(value || "").trim(),
  locationState,
  normalizeHref,
  (href) => {
    const id = chatId(href);
    return id ? { provider: "deepseek", id } : null;
  },
  (left, right) => Boolean(left && right && left.provider === right.provider && left.id === right.id)
);
const invocation = { deleteAttemptId: "attempt-1", expectedDeleteIdentity: { provider: "deepseek", id: "topic-1" } };
assert.equal(invocationValidator(invocation).ok, true);
assert.match(invocationValidator({ expectedDeleteIdentity: invocation.expectedDeleteIdentity }).reason, /attempt identity/);
assert.match(invocationValidator({ ...invocation, deleteAttemptId: "x".repeat(257) }).reason, /attempt identity/);
assert.match(invocationValidator({ deleteAttemptId: "attempt-1", expectedDeleteHref: locationState.href }).reason, /target identity/);
locationState.href = "https://chat.deepseek.com/a/chat/s/topic-2";
assert.match(invocationValidator(invocation).reason, /changed/, "handler-time SPA navigation must fail before any runner click");

const handlerSource = section(sources.nativeRuntime, "  async function deleteThread(data", "\n  return Object.freeze({", "content delete handler");
assert.ok(handlerSource.indexOf("validateTopicDeleteInvocation(data)") < handlerSource.indexOf("runTopicDeleteUserscript"), "target preflight must precede every runner");
assert.ok(handlerSource.lastIndexOf("validateTopicDeleteInvocation(data)") > handlerSource.indexOf("runTopicDeleteUserscript"), "trusted results must be revalidated after the runner");
assert.ok(handlerSource.indexOf("bindDeleteTrustedInstructions") > handlerSource.lastIndexOf("validateTopicDeleteInvocation(data)"), "trusted instructions may be signed only after post-run validation");

const bridgeRequestSource = section(sources.native, "  function requestDeepSeekDeleteBridge", "\n  return Object.freeze({", "DeepSeek bridge request");
assert.match(bridgeRequestSource, /delivered: "unknown", phase: "unknown", reason: "bridge timeout"/, "bridge timeout is unknown delivery");
assert.match(bridgeRequestSource, /delivered: false, phase: "pre-delete"/, "only a send exception is explicit pre-delivery");
assert.match(bridgeRequestSource, /message\?\.delivered === true \|\| message\?\.delivered === false/, "MAIN delivery status must be preserved, not invented");
assert.match(sources.native, /bridged\?\.delivered === false && bridged\?\.phase === "pre-delete"/, "native fallback requires explicit MAIN pre-delivery status");
assert.match(deletionSections.native, /deepSeekBridgeFallbackDisposition\(bridged, retryRequested\)/, "native delete flow must use the audited fallback disposition");

const dispositionSource = section(
  sources.native,
  "  function deepSeekBridgeFallbackDisposition",
  "\n  async function deleteDeepSeekThread",
  "isolated MAIN fallback disposition"
);
const bridgeDisposition = new Function(`"use strict"; ${dispositionSource}; return deepSeekBridgeFallbackDisposition;`)();
const firstPointMiss = bridgeDisposition({ delivered: false, phase: "pre-delete", reason: "trusted topic menu click did not open" }, true);
assert.deepEqual(firstPointMiss, { useNativeFallback: false, reason: "trusted topic menu click did not open" }, "content must preserve MAIN first-point miss so the app can try point two");
assert.equal(bridgeDisposition({ delivered: false, phase: "pre-delete", reason: "bridge absent" }, false).useNativeFallback, true);
assert.equal(bridgeDisposition({ delivered: "unknown", phase: "unknown", reason: "timeout" }, false).useNativeFallback, false);

assert.match(sources.runtime, /trustedAttemptMatches/, "runtime must reject unsigned trusted instructions");
assert.match(sources.runtime, /reason !== "trusted topic menu click did not open"/, "only the exact clean first-point miss may continue the multi-point loop");
assert.match(sources.nativeRuntime, /bound\[key\] = \{ \.\.\.bound\[key\], attemptId, documentId: contentDocumentId \}/, "isolated content must sign attempt and document identities after validation");

const guardedOpenSource = section(
  sources.standalone,
  "  async function openTriggerAndClickDelete",
  "\n\n  function topRightMenuTrigger",
  "guarded standalone menu activation"
);

(async () => {
  let runnerCalls = 0;
  const guardedHandler = new Function(
    "validateTopicDeleteInvocation",
    "deleteResult",
    "runTopicDeleteUserscript",
    `"use strict"; ${handlerSource}; return deleteThread;`
  )(
    invocationValidator,
    (ok, site, reason, extra = {}) => ({ ok, site, reason, ...extra }),
    async () => { runnerCalls += 1; return { ok: true }; }
  );
  locationState.href = "https://chat.deepseek.com/a/chat/s/topic-2";
  const changedRouteResult = await guardedHandler(invocation);
  assert.equal(changedRouteResult.delivered, false);
  assert.equal(runnerCalls, 0, "handler-time route mismatch must fail before every runner/bridge call");
  locationState.href = "https://chat.deepseek.com/a/chat/s/topic-1";
  const missingAttemptResult = await guardedHandler({ expectedDeleteIdentity: invocation.expectedDeleteIdentity });
  assert.equal(missingAttemptResult.delivered, false);
  assert.equal(runnerCalls, 0, "missing attempt id must fail before every runner/bridge call");
  const malformedAttemptResult = await guardedHandler({ ...invocation, deleteAttemptId: "x".repeat(257) });
  assert.equal(malformedAttemptResult.delivered, false);
  assert.equal(runnerCalls, 0, "malformed attempt id must fail before every runner/bridge call");
  const hrefOnlyResult = await guardedHandler({ deleteAttemptId: "attempt-1", expectedDeleteHref: locationState.href });
  assert.equal(hrefOnlyResult.delivered, false);
  assert.equal(runnerCalls, 0, "URL-only mutation target must fail before every runner/bridge call");

  let menuVisible = false;
  let destructiveClicks = 0;
  let guardCalls = 0;
  const guardedOpen = new Function(
    "visible",
    "findMenuItem",
    "findOpenDeleteMenuItem",
    "clickUntil",
    "sleep",
    "clickAt",
    `"use strict"; ${guardedOpenSource}; return openTriggerAndClickDelete;`
  )(
    () => true,
    () => menuVisible ? {} : null,
    () => menuVisible ? {} : null,
    async () => { menuVisible = true; return {}; },
    async () => {},
    () => { destructiveClicks += 1; return true; }
  );
  const opened = await guardedOpen({}, ["Delete", "删除"], {
    timeoutMs: 1,
    guard() {
      guardCalls += 1;
      return guardCalls === 1;
    }
  });
  assert.equal(opened, false);
  assert.equal(destructiveClicks, 0, "route change after menu wait must cause zero explicit Delete activations");
  assert.match(deletionSections.main, /!routeStillCurrent\(\) \|\| !activate\((?:existingMenuConfirm|confirmButton|headerConfirm)/, "MAIN must revalidate before confirm activation");
  assert.match(deletionSections.native, /clickDeleteConfirmIfPresent\(6500, routeStillCurrent\)/, "native must guard confirm activation");
  assert.match(deletionSections.standalone, /clickDeleteConfirmIfPresent\(6500, routeStillCurrent\)/, "standalone must guard confirm activation");
  console.log("DeepSeek target, delivery, lease, coordinate, and TOCTOU safety: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
