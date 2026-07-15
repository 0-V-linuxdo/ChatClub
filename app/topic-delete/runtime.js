import { currentExtensionTabId, runtimeRequest } from "../../shared/extension-api.js";
import { validateControllerContract } from "../controller-contract.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

function trustedClick(result = {}) {
  const click = result?.trustedClick;
  const point = click?.framePoint || click?.point;
  const x = Number(point?.x);
  const y = Number(point?.y);
  return result?.needsTrustedClick && click && Number.isFinite(x) && Number.isFinite(y)
    ? { ...click, framePoint: { x, y } }
    : null;
}

function trustedHover(result = {}) {
  const hover = result?.trustedHover;
  const point = hover?.framePoint || hover?.point;
  const x = Number(point?.x);
  const y = Number(point?.y);
  return result?.needsTrustedHover && hover && Number.isFinite(x) && Number.isFinite(y)
    ? { ...hover, framePoint: { x, y } }
    : null;
}

function trustedMenuClick(result = {}) {
  const click = result?.trustedMenuClick;
  const rawPoints = [
    ...(Array.isArray(click?.framePoints) ? click.framePoints : []),
    click?.framePoint,
    click?.point
  ];
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
  return result?.needsTrustedMenuClick && click && framePoints.length
    ? { ...click, framePoint: framePoints[0], framePoints }
    : null;
}

function trustedKeySequence(result = {}) {
  const sequence = result?.trustedKeySequence;
  if (!result?.needsTrustedKeySequence || !sequence) return null;
  const keys = (Array.isArray(sequence.keys) ? sequence.keys : [])
    .map((item) => typeof item === "string"
      ? { key: item }
      : {
          key: String(item?.key || ""),
          settleMs: item?.settleMs,
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
    ...(Number.isFinite(x) && Number.isFinite(y) ? { framePoint: { x, y } } : {})
  };
}

function timeoutError(error, action = "") {
  return String(error?.message || error || "").includes(`Timeout waiting for response: ${action}`);
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

async function dispatchClick(iframe, click) {
  const point = framePointOnPage(iframe, click.framePoint, "click");
  return runtimeRequest({
    source: "chatclub",
    action: "dispatchTrustedClick",
    tabId: await currentExtensionTabId(),
    ...point,
    kind: click.kind || "",
    hoverSettleMs: click.hoverSettleMs,
    reason: click.reason || "delete confirmation"
  });
}

async function dispatchHover(iframe, hover) {
  const point = framePointOnPage(iframe, hover.framePoint, "hover");
  return runtimeRequest({
    source: "chatclub",
    action: "dispatchTrustedMouseMove",
    tabId: await currentExtensionTabId(),
    ...point,
    kind: hover.kind || "",
    reason: hover.reason || "topic menu hover"
  });
}

async function dispatchKeySequence(iframe, sequence) {
  if (sequence.framePoint) {
    await dispatchClick(iframe, {
      kind: sequence.kind || "trusted-key-sequence-focus",
      reason: sequence.reason || "topic menu keyboard focus",
      hoverSettleMs: sequence.clickSettleMs,
      framePoint: sequence.framePoint
    });
    await sleep(Math.max(80, Number(sequence.clickSettleMs) || 160));
  }
  return runtimeRequest({
    source: "chatclub",
    action: "dispatchTrustedKeySequence",
    tabId: await currentExtensionTabId(),
    keys: sequence.keys,
    keySettleMs: sequence.keySettleMs,
    kind: sequence.kind || "trusted-key-sequence",
    reason: sequence.reason || "topic menu keyboard sequence"
  });
}

export function createTopicDeleteRuntime(dependencies = {}) {
  const { framePort } = validateControllerContract(dependencies, "Topic Delete runtime", {
    framePort: "object"
  });
  if (typeof framePort.request !== "function") {
    throw new TypeError("Topic Delete runtime requires framePort.request to be a function.");
  }
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
      await sendToContentFrame(iframe, "getLocationHref", {}, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  async function prepareContentBridge(iframe, payload = {}) {
    if (await pingContentBridge(iframe, 900)) return { ok: true };
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
    if (await pingContentBridge(iframe, 1400)) return { ok: true, installed };
    return {
      ok: false,
      reason: installError
        ? `iframe content bridge did not respond; injection failed: ${installError}`
        : "iframe content bridge did not respond",
      installed
    };
  }

  async function sendDelete(iframe, payload = {}, config = null, timeoutMs = 15000) {
    const site = config?.id || payload.appId || "topic-delete";
    const ready = await prepareContentBridge(iframe, payload);
    if (!ready.ok) return { ok: false, site, reason: ready.reason };
    const runtimeConfig = config ? { ...config } : null;
    if (runtimeConfig) {
      const source = String(runtimeConfig.customUserscript || runtimeConfig.userscript || "");
      runtimeConfig.standaloneUserscript = /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(source);
      delete runtimeConfig.userscript;
      delete runtimeConfig.customUserscript;
    }
    const data = { payload, ...(runtimeConfig ? { config: runtimeConfig } : {}) };
    try {
      return await sendToContentFrame(iframe, "deleteThread", data, timeoutMs + 1000);
    } catch (error) {
      if (!timeoutError(error, "deleteThread")) throw error;
      await ensureContentBridge(iframe, payload);
      await sleep(220);
      return sendToContentFrame(iframe, "deleteThread", data, timeoutMs + 1000);
    }
  }

  function confirmState(iframe, site, timeoutMs = 1200) {
    return sendToContentFrame(iframe, "getDeleteConfirmState", { site }, timeoutMs);
  }

async function retryAfterHover(iframe, result, payload, config, timeoutMs) {
  const hover = trustedHover(result);
  if (!hover) return result;
  return withTrustedInputLock(async () => {
    await dispatchHover(iframe, hover);
    await sleep(Math.max(180, Number(hover.hoverSettleMs) || 360));
    return sendDelete(iframe, { ...payload, trustedHoverRetried: true }, config, timeoutMs);
  });
}

async function retryAfterMenuClick(iframe, result, payload, config, timeoutMs) {
  const menuClick = trustedMenuClick(result);
  if (!menuClick || payload?.trustedMenuClickRetried) return result;
  return withTrustedInputLock(async () => {
    let lastResult = result;
    for (const framePoint of menuClick.framePoints || [menuClick.framePoint]) {
      await dispatchHover(iframe, {
        kind: menuClick.kind || "topic-menu-trigger",
        reason: menuClick.reason || "topic menu trigger hover",
        framePoint
      });
      await sleep(Math.max(180, Number(menuClick.hoverSettleMs) || 360));
      await dispatchClick(iframe, { ...menuClick, framePoint });
      await sleep(360);
      lastResult = await sendDelete(iframe, { ...payload, trustedMenuClickRetried: true }, config, timeoutMs);
      if (lastResult?.ok) return lastResult;
      const reason = String(lastResult?.reason || "");
      if (reason && !/topic menu trigger|delete menu item|menu|trigger/i.test(reason)) return lastResult;
    }
    return lastResult;
  });
}

async function retryAfterKeySequence(iframe, result, payload, config, timeoutMs) {
  const sequence = trustedKeySequence(result);
  if (!sequence || payload?.trustedKeySequenceRetried) return result;
  return withTrustedInputLock(async () => {
    await dispatchKeySequence(iframe, sequence);
    await sleep(Math.max(180, Number(sequence.settleMs) || 360));
    return sendDelete(iframe, { ...payload, trustedKeySequenceRetried: true }, config, timeoutMs);
  });
}

async function waitForConfirmGone(iframe, site, timeoutMs = 5200) {
  const deadline = Date.now() + Math.max(800, Number(timeoutMs) || 5200);
  let lastError = null;
  while (Date.now() <= deadline) {
    try {
      const state = await confirmState(iframe, site, 1200);
      if (!state?.present) return { ok: true };
    } catch (error) {
      lastError = error;
    }
    await sleep(260);
  }
  return {
    ok: false,
    reason: lastError
      ? `trusted browser click sent but verification failed: ${lastError.message || String(lastError)}`
      : "trusted browser click did not close delete confirmation"
  };
}

async function tryTrustedFallback(iframe, result = {}) {
  const click = trustedClick(result);
  if (!click) return result;
  return withTrustedInputLock(async () => {
    await dispatchClick(iframe, click);
    await sleep(420);
    const verified = await waitForConfirmGone(iframe, result.site || click.site || "topic-delete");
    return verified.ok
      ? { ok: true, site: result.site || click.site || "topic-delete" }
      : { ...result, ok: false, reason: verified.reason || result.reason || "delete confirmation did not close" };
  });
}

async function settle(iframe, result = {}) {
  if (!result?.ok) {
    const recovered = await tryTrustedFallback(iframe, result);
    if (recovered?.ok || trustedClick(recovered)) return recovered;
    try {
      const state = await confirmState(iframe, recovered.site || result.site || "topic-delete", 1200);
      if (!state?.present) return recovered;
      return tryTrustedFallback(iframe, {
        ...recovered,
        ok: false,
        reason: recovered.reason || "delete confirmation is still visible",
        ...(state.trustedClick ? { needsTrustedClick: true, trustedClick: state.trustedClick } : {})
      });
    } catch {
      return recovered;
    }
  }
  try {
    const state = await confirmState(iframe, result.site || "topic-delete", 1200);
    if (!state?.present) return result;
    return tryTrustedFallback(iframe, {
      ...result,
      ok: false,
      reason: "delete confirmation is still visible",
      ...(state.trustedClick ? { needsTrustedClick: true, trustedClick: state.trustedClick } : {})
    });
  } catch {
    return result;
  }
}

async function executeTopicDeleteNow(iframe, payload = {}, config = null, timeoutMs = 15000) {
  let result;
  try {
    result = await sendDelete(iframe, payload, config, timeoutMs);
    result = await retryAfterHover(iframe, result, payload, config, timeoutMs);
    result = await retryAfterKeySequence(iframe, result, payload, config, timeoutMs);
    result = await retryAfterMenuClick(iframe, result, payload, config, timeoutMs);
  } catch (error) {
    const recovered = await settle(iframe, {
      ok: false,
      site: config?.id || payload.appId || "topic-delete",
      reason: error?.message || String(error)
    });
    if (recovered?.ok) return recovered;
    throw error;
  }
  result = await settle(iframe, result);
  if (!result?.ok) throw new Error(result?.reason || "Delete failed");
  return result;
}

  function executeTopicDelete(iframe, payload = {}, config = null, timeoutMs = 15000) {
    return executeTopicDeleteNow(iframe, payload, config, timeoutMs);
  }

  return Object.freeze({ executeTopicDelete });
}
