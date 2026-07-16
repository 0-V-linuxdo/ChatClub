import { currentExtensionTabId, runtimeRequest } from "../../shared/extension-api.js";
import {
  deleteConversationIdentityFromHref,
  inspectDeleteCompletionState,
  normalizeDeleteFrameHref,
  sameDeleteConversationIdentity
} from "../../shared/delete-completion.js";
import { validateControllerContract } from "../controller-contract.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

function createDeleteAttemptId() {
  try {
    const value = typeof globalThis.crypto?.randomUUID === "function"
      ? String(globalThis.crypto.randomUUID() || "")
      : "";
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) return value;
  } catch {}
  try {
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      const bytes = new Uint8Array(24);
      globalThis.crypto.getRandomValues(bytes);
      return `delete-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }
  } catch {}
  throw new Error("Delete failed: secure attempt randomness is unavailable");
}

function trustedAttemptMatches(instruction, expectedAttemptId, expectedDocumentId) {
  const expected = String(expectedAttemptId || "");
  const documentId = String(expectedDocumentId || "");
  return Boolean(
    expected
    && documentId
    && String(instruction?.attemptId || "") === expected
    && String(instruction?.documentId || "") === documentId
  );
}

function boundedTrustedDelay(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(1000, Math.round(number)))
    : Math.max(0, Math.min(1000, Math.round(Number(fallback) || 0)));
}

function trustedClick(result = {}, expectedAttemptId = "", expectedDocumentId = "") {
  const click = result?.trustedClick;
  const point = click?.framePoint || click?.point;
  const x = Number(point?.x);
  const y = Number(point?.y);
  return result?.needsTrustedClick
    && trustedAttemptMatches(click, expectedAttemptId, expectedDocumentId)
    && Number.isFinite(x)
    && Number.isFinite(y)
    ? { ...click, hoverSettleMs: boundedTrustedDelay(click.hoverSettleMs, 80), framePoint: { x, y } }
    : null;
}

function trustedHover(result = {}, expectedAttemptId = "", expectedDocumentId = "") {
  const hover = result?.trustedHover;
  const point = hover?.framePoint || hover?.point;
  const x = Number(point?.x);
  const y = Number(point?.y);
  return result?.needsTrustedHover
    && trustedAttemptMatches(hover, expectedAttemptId, expectedDocumentId)
    && Number.isFinite(x)
    && Number.isFinite(y)
    ? { ...hover, hoverSettleMs: boundedTrustedDelay(hover.hoverSettleMs, 360), framePoint: { x, y } }
    : null;
}

function trustedMenuClick(result = {}, expectedAttemptId = "", expectedDocumentId = "") {
  const click = result?.trustedMenuClick;
  const hasFramePoints = Boolean(click && Object.hasOwn(click, "framePoints"));
  if (hasFramePoints && (!Array.isArray(click.framePoints) || click.framePoints.length < 1 || click.framePoints.length > 12)) return null;
  const rawPoints = hasFramePoints ? click.framePoints : [click?.framePoint || click?.point];
  const seen = new Set();
  const framePoints = rawPoints
    .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
      const key = `${point.x},${point.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return result?.needsTrustedMenuClick
    && trustedAttemptMatches(click, expectedAttemptId, expectedDocumentId)
    && framePoints.length
    ? {
        ...click,
        hoverSettleMs: boundedTrustedDelay(click.hoverSettleMs, 360),
        framePoint: framePoints[0],
        framePoints
      }
    : null;
}

function trustedKeySequence(result = {}, expectedAttemptId = "", expectedDocumentId = "") {
  const sequence = result?.trustedKeySequence;
  if (!result?.needsTrustedKeySequence || !trustedAttemptMatches(sequence, expectedAttemptId, expectedDocumentId)) return null;
  if (!Array.isArray(sequence.keys) || sequence.keys.length < 1 || sequence.keys.length > 12) return null;
  const keys = sequence.keys
    .map((item) => typeof item === "string"
      ? { key: item }
      : {
          key: String(item?.key || ""),
          settleMs: boundedTrustedDelay(item?.settleMs, 0),
          shiftKey: Boolean(item?.shiftKey),
          ctrlKey: Boolean(item?.ctrlKey),
          metaKey: Boolean(item?.metaKey),
          altKey: Boolean(item?.altKey),
          modifiers: Number.isFinite(Number(item?.modifiers)) ? Number(item.modifiers) : undefined
        })
    .filter((item) => /^(tab|enter|return|escape|esc|backspace|delete| |space|spacebar)$/i.test(item.key));
  if (!keys.length) return null;
  const point = sequence.framePoint || sequence.point;
  const x = Number(point?.x);
  const y = Number(point?.y);
  return {
    ...sequence,
    keys,
    clickSettleMs: boundedTrustedDelay(sequence.clickSettleMs, 160),
    keySettleMs: boundedTrustedDelay(sequence.keySettleMs, 80),
    settleMs: boundedTrustedDelay(sequence.settleMs, 360),
    ...(Number.isFinite(x) && Number.isFinite(y) ? { framePoint: { x, y } } : {})
  };
}

const PRE_DELIVERY_DELETE_RECOVERY_CODES = new Set([
  "NOT_REGISTERED",
  "STALE_DOCUMENT",
  "INJECTION_FAILED"
]);

function recoverableBeforeDeleteDelivery(error) {
  return error?.delivered === false
    && PRE_DELIVERY_DELETE_RECOVERY_CODES.has(String(error?.code || ""));
}

function trustedDispatchFailure(error) {
  if (error?.chatClubTrustedDispatchFailed === true) return error;
  const failure = new Error(error?.message || String(error || "trusted input dispatch failed"), { cause: error });
  Object.defineProperty(failure, "chatClubTrustedDispatchFailed", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
  return failure;
}

async function runTrustedDispatch(task) {
  try {
    return await task();
  } catch (error) {
    throw trustedDispatchFailure(error);
  }
}

function frameHrefHints(iframe, payload = {}) {
  return Array.from(new Set([
    payload.currentThreadHref,
    payload.currentHref,
    payload.cachedHref,
    payload.href,
    payload.url,
    iframe?.dataset?.currentThreadHref,
    iframe?.dataset?.currentHref,
    iframe?.src,
    iframe?.getAttribute?.("src")
  ].map((item) => String(item || "").trim()).filter(Boolean)));
}

async function ensureContentBridge(iframe, payload = {}) {
  const tabId = await currentExtensionTabId();
  if (!tabId) return null;
  const expectedFrameId = Number(iframe?.dataset?.browserFrameId);
  const expectedBindingId = String(iframe?.dataset?.frameBindingId || "");
  const secureTarget = /^[a-f0-9]{64}$/i.test(expectedBindingId)
    ? {
        expectedBindingId,
        ...(Number.isSafeInteger(expectedFrameId) && expectedFrameId > 0 ? { expectedFrameId } : {})
      }
    : {};
  try {
    return await runtimeRequest({
      source: "chatclub",
      action: "ensureContentBridge",
      tabId,
      hrefs: frameHrefHints(iframe, payload),
      ...secureTarget
    });
  } catch (error) {
    console.warn("[ChatClub] Failed to ensure iframe content bridge", error);
    return { error: error?.message || String(error) };
  }
}

function framePointOnPage(iframe, framePoint, kind) {
  const rect = iframe?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error(`trusted browser ${kind} failed: iframe is not visible`);
  const x = Math.round((rect.left + (iframe.clientLeft || 0) + framePoint.x) * 100) / 100;
  const y = Math.round((rect.top + (iframe.clientTop || 0) + framePoint.y) * 100) / 100;
  if (x < rect.left - 2 || y < rect.top - 2 || x > rect.right + 2 || y > rect.bottom + 2) {
    throw new Error(`trusted browser ${kind} failed: target coordinates are outside the iframe`);
  }
  return { x, y };
}

function trustedBridgeDocumentId(iframe) {
  return String(iframe?.dataset?.preferredModelDocumentId || "").trim();
}

function trustedFrameIdentity(iframe, expectedOriginDocumentId = "") {
  const expectedFrameId = Number(iframe?.dataset?.browserFrameId);
  const expectedBindingId = String(iframe?.dataset?.frameBindingId || "").trim();
  const expectedBrowserDocumentId = String(iframe?.dataset?.injectedBrowserDocumentId || "").trim();
  const expectedBridgeDocumentId = String(iframe?.dataset?.preferredModelDocumentId || "").trim();
  const expectedFrameHref = String(
    iframe?.dataset?.currentHref
    || iframe?.dataset?.currentThreadHref
    || iframe?.src
    || iframe?.getAttribute?.("src")
    || ""
  ).trim();
  if (
    !Number.isSafeInteger(expectedFrameId)
    || expectedFrameId <= 0
    || !/^[a-f0-9]{64}$/i.test(expectedBindingId)
    || !expectedBrowserDocumentId
    || !expectedBridgeDocumentId
    || (expectedOriginDocumentId && expectedBridgeDocumentId !== expectedOriginDocumentId)
    || !/^https?:\/\//i.test(expectedFrameHref)
  ) {
    throw new Error("trusted browser input failed: secure iframe identity is unavailable");
  }
  return {
    expectedFrameId,
    expectedBindingId,
    expectedBrowserDocumentId,
    expectedBridgeDocumentId,
    expectedFrameHref
  };
}

async function trustedInputTarget(iframe, expectedOriginDocumentId = "") {
  const identity = trustedFrameIdentity(iframe, expectedOriginDocumentId);
  const tabId = await currentExtensionTabId();
  if (!Number.isInteger(tabId) || tabId < 0) {
    throw new Error("trusted browser input failed: extension tab is unavailable");
  }
  return { tabId, ...identity };
}

async function dispatchClick(iframe, click, target) {
  const point = framePointOnPage(iframe, click.framePoint, "click");
  return runtimeRequest({
    source: "chatclub",
    action: "dispatchTrustedClick",
    ...target,
    ...point,
    kind: click.kind || "",
    hoverSettleMs: click.hoverSettleMs,
    reason: click.reason || "delete confirmation"
  });
}

async function dispatchHover(iframe, hover, target) {
  const point = framePointOnPage(iframe, hover.framePoint, "hover");
  return runtimeRequest({
    source: "chatclub",
    action: "dispatchTrustedMouseMove",
    ...target,
    ...point,
    kind: hover.kind || "",
    reason: hover.reason || "topic menu hover"
  });
}

async function dispatchKeySequence(iframe, sequence, beforeDispatch = async () => {}) {
  if (sequence.framePoint) {
    const target = await beforeDispatch();
    await dispatchClick(iframe, {
      kind: sequence.kind || "trusted-key-sequence-focus",
      reason: sequence.reason || "topic menu keyboard focus",
      hoverSettleMs: sequence.clickSettleMs,
      framePoint: sequence.framePoint
    }, target);
    await sleep(Math.max(80, Number(sequence.clickSettleMs) || 160));
  }
  const target = await beforeDispatch();
  return runtimeRequest({
    source: "chatclub",
    action: "dispatchTrustedKeySequence",
    ...target,
    keys: sequence.keys,
    keySettleMs: sequence.keySettleMs,
    kind: sequence.kind || "trusted-key-sequence",
    reason: sequence.reason || "topic menu keyboard sequence"
  });
}

export function createTopicDeleteRuntime(dependencies = {}) {
  const {
    framePort,
    completionTimeoutMs: configuredCompletionTimeoutMs,
    completionPollMs: configuredCompletionPollMs,
    completionStableMs: configuredCompletionStableMs
  } = validateControllerContract(dependencies, "Topic Delete runtime", {
    framePort: "object",
    completionTimeoutMs: "number?",
    completionPollMs: "number?",
    completionStableMs: "number?"
  });
  if (typeof framePort.request !== "function") {
    throw new TypeError("Topic Delete runtime requires framePort.request to be a function.");
  }
  const completionTimeoutMs = Math.max(50, Math.min(15000, Number(configuredCompletionTimeoutMs) || 5200));
  const completionPollMs = Math.max(10, Math.min(1000, Number(configuredCompletionPollMs) || 260));
  const completionStableMs = Math.max(50, Math.min(5000, Number(configuredCompletionStableMs) || 600));
  let trustedInputExecutionTail = Promise.resolve();
  const sendToContentFrame = (iframe, command, data = {}, timeoutMs) => {
    const options = timeoutMs && typeof timeoutMs === "object" ? timeoutMs : { timeoutMs };
    return framePort.request(iframe, command, data, options);
  };

  function withTrustedInputLock(task) {
    const run = trustedInputExecutionTail.catch(() => {}).then(task);
    trustedInputExecutionTail = run.catch(() => {});
    return run;
  }

  async function pingContentBridge(iframe, timeoutMs = 900) {
    try {
      const href = normalizeDeleteFrameHref(await sendToContentFrame(iframe, "getLocationHref", {}, timeoutMs));
      return href ? { ok: true, href } : { ok: false, href: "" };
    } catch {
      return { ok: false, href: "" };
    }
  }

  async function revalidateTrustedTarget(iframe, completion, originDocumentId) {
    try {
      if (!completion?.identity) throw new Error("trusted input requires a stable conversation identity");
      const expectedDocumentId = String(originDocumentId || "").trim();
      if (!expectedDocumentId || trustedBridgeDocumentId(iframe) !== expectedDocumentId) {
        throw new Error("trusted input origin document changed");
      }
      const href = normalizeDeleteFrameHref(await sendToContentFrame(iframe, "getLocationHref", {}, 900));
      const current = deleteConversationIdentityFromHref(href);
      if (!href || !sameDeleteConversationIdentity(completion.identity, current)) {
        throw new Error("trusted input target conversation changed");
      }
      if (trustedBridgeDocumentId(iframe) !== expectedDocumentId) {
        throw new Error("trusted input origin document changed");
      }
      return await trustedInputTarget(iframe, expectedDocumentId);
    } catch (error) {
      throw trustedDispatchFailure(error);
    }
  }

  async function prepareContentBridge(iframe, payload = {}) {
    const existing = await pingContentBridge(iframe, 900);
    if (existing.ok) return existing;
    const installed = await ensureContentBridge(iframe, payload);
    const installError = installed?.error
      || (Array.isArray(installed?.errors) && installed.errors.length ? installed.errors.join("; ") : "");
    const injectedFiles = Array.isArray(installed?.injectedFiles) ? installed.injectedFiles : [];
    const expectedFiles = new Set([
      "content/preload.js",
      "content/grok-cookie-bridge.js",
      "content/message-navigator.js",
      "content/content.js"
    ]);
    const injectedNames = injectedFiles.map((entry) => String(entry || "").split("@")[0]);
    const injectionComplete = Number(installed?.injected) === expectedFiles.size
      && injectedFiles.length === expectedFiles.size
      && new Set(injectedFiles).size === expectedFiles.size
      && injectedNames.every((file) => expectedFiles.has(file))
      && [...expectedFiles].every((file) => injectedNames.includes(file));
    if (installError || !injectionComplete) {
      return {
        ok: false,
        reason: `iframe content bridge injection failed: ${installError || "incomplete injected file inventory"}`,
        installed
      };
    }
    await sleep(180);
    const recovered = await pingContentBridge(iframe, 1400);
    if (recovered.ok) return { ...recovered, installed };
    return {
      ok: false,
      reason: installError
        ? `iframe content bridge did not respond; injection failed: ${installError}`
        : "iframe content bridge did not respond",
      installed
    };
  }

  function captureCompletionIdentity(context, href) {
    const normalizedHref = normalizeDeleteFrameHref(href);
    const current = deleteConversationIdentityFromHref(normalizedHref);
    if (!context.captured) {
      context.captured = true;
      context.href = normalizedHref;
      context.identity = current;
      return { ok: true };
    }
    if (!context.identity) {
      return normalizedHref === context.href
        ? { ok: true }
        : { ok: false, reason: "current frame URL changed before delete retry" };
    }
    if (!current || !sameDeleteConversationIdentity(context.identity, current)) {
      return { ok: false, reason: "current conversation changed before delete retry" };
    }
    return { ok: true };
  }

  async function sendDelete(iframe, payload = {}, config = null, timeoutMs = 15000, completion = {}) {
    const site = config?.id || payload.appId || "topic-delete";
    const ready = await prepareContentBridge(iframe, payload);
    if (!ready.ok) return { ok: false, site, reason: ready.reason };
    const captured = captureCompletionIdentity(completion, ready.href);
    if (!captured.ok) return { ok: false, site, reason: captured.reason };
    if (!completion.identity) {
      return {
        ok: false,
        site,
        manualCompletionRequired: true,
        reason: "delete target has no authenticated stable conversation identity"
      };
    }
    const runtimeConfig = config ? { ...config } : null;
    if (runtimeConfig) {
      const source = String(runtimeConfig.customUserscript || runtimeConfig.userscript || "");
      runtimeConfig.standaloneUserscript = /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(source);
      delete runtimeConfig.userscript;
      delete runtimeConfig.customUserscript;
    }
    const data = { payload, ...(runtimeConfig ? { config: runtimeConfig } : {}) };
    data.deleteAttemptId = completion.attemptId;
    data.expectedDeleteIdentity = completion.identity;
    try {
      return await sendToContentFrame(iframe, "deleteThread", data, timeoutMs + 1000);
    } catch (error) {
      if (!recoverableBeforeDeleteDelivery(error)) throw error;
      const repaired = await prepareContentBridge(iframe, payload);
      if (!repaired.ok) return { ok: false, site, reason: repaired.reason };
      const recaptured = captureCompletionIdentity(completion, repaired.href);
      if (!recaptured.ok) return { ok: false, site, reason: recaptured.reason };
      return sendToContentFrame(iframe, "deleteThread", data, timeoutMs + 1000);
    }
  }

  function confirmState(iframe, site, completion, timeoutMs = 1200) {
    return sendToContentFrame(iframe, "getDeleteConfirmState", {
      site,
      identity: completion?.identity || null
    }, timeoutMs);
  }

async function retryAfterHover(iframe, result, payload, config, timeoutMs, completion) {
  const hover = trustedHover(result, completion?.attemptId, trustedBridgeDocumentId(iframe));
  if (!hover) return result;
  return withTrustedInputLock(async () => {
    const target = await revalidateTrustedTarget(iframe, completion, hover.documentId);
    await runTrustedDispatch(() => dispatchHover(iframe, hover, target));
    await sleep(Math.max(180, Number(hover.hoverSettleMs) || 360));
    return sendDelete(iframe, { ...payload, trustedHoverRetried: true }, config, timeoutMs, completion);
  });
}

async function retryAfterMenuClick(iframe, result, payload, config, timeoutMs, completion) {
  const menuClick = trustedMenuClick(result, completion?.attemptId, trustedBridgeDocumentId(iframe));
  if (!menuClick || payload?.trustedMenuClickRetried) return result;
  return withTrustedInputLock(async () => {
    let lastResult = result;
    for (const framePoint of menuClick.framePoints || [menuClick.framePoint]) {
      const hoverTarget = await revalidateTrustedTarget(iframe, completion, menuClick.documentId);
      await runTrustedDispatch(() => dispatchHover(iframe, {
        kind: menuClick.kind || "topic-menu-trigger",
        reason: menuClick.reason || "topic menu trigger hover",
        framePoint
      }, hoverTarget));
      await sleep(Math.max(180, Number(menuClick.hoverSettleMs) || 360));
      const clickTarget = await revalidateTrustedTarget(iframe, completion, menuClick.documentId);
      await runTrustedDispatch(() => dispatchClick(iframe, { ...menuClick, framePoint }, clickTarget));
      await sleep(360);
      lastResult = await sendDelete(iframe, { ...payload, trustedMenuClickRetried: true }, config, timeoutMs, completion);
      if (lastResult?.ok) return lastResult;
      const reason = String(lastResult?.reason || "");
      if (reason !== "trusted topic menu click did not open") return lastResult;
    }
    return lastResult;
  });
}

async function retryAfterKeySequence(iframe, result, payload, config, timeoutMs, completion) {
  const sequence = trustedKeySequence(result, completion?.attemptId, trustedBridgeDocumentId(iframe));
  if (!sequence || payload?.trustedKeySequenceRetried) return result;
  return withTrustedInputLock(async () => {
    await runTrustedDispatch(() => dispatchKeySequence(
      iframe,
      sequence,
      () => revalidateTrustedTarget(iframe, completion, sequence.documentId)
    ));
    await sleep(Math.max(180, Number(sequence.settleMs) || 360));
    return sendDelete(iframe, { ...payload, trustedKeySequenceRetried: true }, config, timeoutMs, completion);
  });
}

function incompleteCompletionReason(inspection, lastError) {
  if (lastError) {
    return `delete completion could not be verified: ${lastError.message || String(lastError)}`;
  }
  if (inspection?.dialogPresent) return "delete confirmation is still visible";
  const current = inspection?.target?.current === true;
  const present = inspection?.target?.present === true;
  if (current && present) return "delete completion could not be verified: deleted conversation is still current and present";
  if (current) return "delete completion could not be verified: deleted conversation is still current";
  if (present) return "delete completion could not be verified: deleted conversation is still present";
  return "delete completion could not be verified: completion-state probe did not establish removal";
}

async function waitForDeleteCompletion(iframe, site, completion, options = {}) {
  const timeoutMs = Math.max(50, Number(options.timeoutMs) || completionTimeoutMs);
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  let lastInspection = null;
  let lastState = null;
  let completeStreak = 0;
  let completeSince = 0;
  do {
    try {
      const state = await confirmState(iframe, site, completion, 1200);
      const inspection = inspectDeleteCompletionState(state, completion?.identity || null);
      lastState = state;
      if (!inspection.valid) {
        completeStreak = 0;
        completeSince = 0;
        lastInspection = null;
        lastError = new Error(inspection.reason);
      } else {
        lastInspection = inspection;
        lastError = null;
        if (inspection.complete) {
          if (!completeStreak) completeSince = Date.now();
          completeStreak += 1;
          if (completeStreak >= 2 && Date.now() - completeSince >= completionStableMs) {
            return { ok: true, state, inspection };
          }
        } else {
          completeStreak = 0;
          completeSince = 0;
        }
        if (options.stopOnDialog && inspection.dialogPresent) {
          return {
            ok: false,
            state,
            inspection,
            reason: incompleteCompletionReason(inspection, null)
          };
        }
      }
    } catch (error) {
      completeStreak = 0;
      completeSince = 0;
      lastInspection = null;
      lastError = error;
    }
    if (Date.now() >= deadline) break;
    await sleep(completionPollMs);
  } while (Date.now() <= deadline);
  return {
    ok: false,
    state: lastState,
    inspection: lastInspection,
    reason: incompleteCompletionReason(lastInspection, lastError)
  };
}

async function tryTrustedFallback(iframe, result = {}, completion = {}) {
  if (!completion?.identity) {
    return {
      ...result,
      ok: false,
      manualCompletionRequired: true,
      reason: result.reason || "trusted delete confirmation requires a stable conversation identity; complete it manually"
    };
  }
  const click = trustedClick(result, completion.attemptId, trustedBridgeDocumentId(iframe));
  if (!click) return result;
  return withTrustedInputLock(async () => {
    const target = await revalidateTrustedTarget(iframe, completion, click.documentId);
    await runTrustedDispatch(() => dispatchClick(iframe, click, target));
    await sleep(420);
    const verified = await waitForDeleteCompletion(
      iframe,
      result.site || click.site || "topic-delete",
      completion
    );
    return verified.ok
      ? { ok: true, site: result.site || click.site || "topic-delete" }
      : { ...result, ok: false, reason: verified.reason || result.reason || "delete confirmation did not close" };
  });
}

async function settle(iframe, result = {}, completion = {}) {
  if (!result?.ok) {
    return trustedClick(result, completion?.attemptId, trustedBridgeDocumentId(iframe))
      ? tryTrustedFallback(iframe, result, completion)
      : result;
  }
  const verified = await waitForDeleteCompletion(
    iframe,
    result.site || "topic-delete",
    completion,
    { stopOnDialog: true }
  );
  if (verified.ok) return result;
  return {
    ...result,
    ok: false,
    verificationUncertain: true,
    ...(verified.inspection?.dialogPresent ? { manualCompletionRequired: true } : {}),
    reason: verified.reason
  };
}

async function readOnlyCompletionAudit(iframe, site, completion) {
  try {
    const state = await confirmState(iframe, site, completion, 1200);
    return inspectDeleteCompletionState(state, completion?.identity || null);
  } catch {
    return null;
  }
}

async function executeTopicDeleteNow(iframe, payload = {}, config = null, timeoutMs = 15000) {
  const attemptId = createDeleteAttemptId();
  payload = { ...payload, deleteAttemptId: attemptId };
  const completion = { attemptId, captured: false, href: "", identity: null };
  let result;
  try {
    result = await sendDelete(iframe, payload, config, timeoutMs, completion);
    result = await retryAfterHover(iframe, result, payload, config, timeoutMs, completion);
    result = await retryAfterKeySequence(iframe, result, payload, config, timeoutMs, completion);
    result = await retryAfterMenuClick(iframe, result, payload, config, timeoutMs, completion);
  } catch (error) {
    if (!error?.chatClubTrustedDispatchFailed) {
      await readOnlyCompletionAudit(
        iframe,
        config?.id || payload.appId || "topic-delete",
        completion
      );
    }
    throw error;
  }
  result = await settle(iframe, result, completion);
  if (!result?.ok) throw new Error(result?.reason || "Delete failed");
  return result;
}

  function executeTopicDelete(iframe, payload = {}, config = null, timeoutMs = 15000) {
    return executeTopicDeleteNow(iframe, payload, config, timeoutMs);
  }

  return Object.freeze({ executeTopicDelete });
}
