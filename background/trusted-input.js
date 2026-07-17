const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, Number(ms) || 0)); });

const FRAME_BINDING_PATTERN = /^[a-f0-9]{64}$/i;
const LEGACY_DOCUMENT_PATTERN = /^legacy:[a-f0-9]{64}$/i;
const BRIDGE_DOCUMENT_PATTERN = /^[a-z0-9][a-z0-9._:-]{8,191}$/i;

function normalizedHref(value) {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/i.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function trustedFrameTarget(api, message = {}, sender = {}) {
  const extensionId = String(api.runtime?.id || "");
  const extensionBase = String(api.runtime?.getURL?.("") || "");
  const tabId = message.tabId;
  const senderTabId = sender?.tab?.id;
  const senderFrameId = sender?.frameId == null ? 0 : sender.frameId;
  if (
    !extensionId
    || (sender?.id && sender.id !== extensionId)
    || !extensionBase
    || !String(sender?.url || "").startsWith(extensionBase)
    || !String(sender?.tab?.url || "").startsWith(extensionBase)
    || !Number.isSafeInteger(tabId)
    || tabId < 0
    || !Number.isSafeInteger(senderTabId)
    || senderTabId !== tabId
    || !Number.isSafeInteger(senderFrameId)
    || senderFrameId !== 0
  ) {
    throw new Error("trusted browser input requires the current ChatClub extension page");
  }
  const frameId = message.expectedFrameId;
  const frameBindingId = String(message.expectedBindingId || "").trim();
  const browserDocumentId = String(message.expectedBrowserDocumentId || "").trim();
  const bridgeDocumentId = String(message.expectedBridgeDocumentId || "").trim();
  const href = normalizedHref(message.expectedFrameHref);
  if (
    !Number.isSafeInteger(frameId)
    || frameId <= 0
    || !FRAME_BINDING_PATTERN.test(frameBindingId)
    || !browserDocumentId
    || browserDocumentId.length > 256
    || !BRIDGE_DOCUMENT_PATTERN.test(bridgeDocumentId)
    || !href
  ) {
    throw new Error("trusted browser input secure iframe identity is invalid");
  }
  return {
    tabId,
    frameId,
    frameBindingId,
    browserDocumentId,
    bridgeDocumentId,
    href,
    legacyDocument: LEGACY_DOCUMENT_PATTERN.test(browserDocumentId)
  };
}

async function exactDirectChildFrame(api, target) {
  if (typeof api.webNavigation?.getFrame !== "function") {
    throw new Error("trusted browser input frame verification is unavailable");
  }
  const frame = await api.webNavigation.getFrame({ tabId: target.tabId, frameId: target.frameId });
  if (
    !frame
    || Number(frame.frameId) !== target.frameId
    || Number(frame.parentFrameId) !== 0
    || !/^https?:\/\//i.test(String(frame.url || ""))
  ) {
    throw new Error("trusted browser input target is not the expected direct child iframe");
  }
  const frameHref = normalizedHref(frame.url);
  if (!frameHref || frameHref !== target.href) {
    throw new Error("trusted browser input target URL changed");
  }
  const frameDocumentId = String(frame.documentId || "").trim();
  if (!target.legacyDocument && frameDocumentId !== target.browserDocumentId) {
    throw new Error("trusted browser input target document changed");
  }
  return { href: frameHref, documentId: frameDocumentId };
}

function readTrustedFrameAttestation() {
  const state = globalThis.__CHATCLUB_BROWSER_DOCUMENT_ATTESTATION_STATE__;
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "__CHATCLUB_BROWSER_DOCUMENT_ATTESTATION_STATE__"
  );
  return {
    frameBindingId: String(globalThis.__CHATCLUB_FRAME_BINDING_ID__ || ""),
    bridgeDocumentId: String(globalThis.__CHATCLUB_CONTENT_DOCUMENT_ID__ || ""),
    legacyDocumentId: String(state?.id || ""),
    legacyDocumentValid: Boolean(
      state
      && descriptor
      && descriptor.configurable === false
      && descriptor.writable === false
      && descriptor.value === state
      && /^legacy:[a-f0-9]{64}$/i.test(String(state.id || ""))
      && Number.isSafeInteger(state.epoch)
      && state.epoch > 0
      && state.dirty === false
    ),
    href: String(globalThis.location?.href || "")
  };
}

async function attestTrustedFrame(api, target) {
  if (typeof api.scripting?.executeScript !== "function") {
    throw new Error("trusted browser input document attestation is unavailable");
  }
  const injectionTarget = target.legacyDocument
    ? { tabId: target.tabId, frameIds: [target.frameId] }
    : { tabId: target.tabId, documentIds: [target.browserDocumentId] };
  const results = await api.scripting.executeScript({
    target: injectionTarget,
    world: "ISOLATED",
    func: readTrustedFrameAttestation
  });
  const matching = (Array.isArray(results) ? results : [])
    .filter((entry) => Number(entry?.frameId) === target.frameId);
  if (matching.length !== 1 || Object.hasOwn(matching[0] || {}, "error")) {
    throw new Error("trusted browser input target document could not be attested");
  }
  const entry = matching[0];
  const attestation = entry.result || {};
  if (
    attestation.frameBindingId !== target.frameBindingId
    || attestation.bridgeDocumentId !== target.bridgeDocumentId
    || normalizedHref(attestation.href) !== target.href
  ) {
    throw new Error("trusted browser input target attestation changed");
  }
  if (target.legacyDocument) {
    if (!attestation.legacyDocumentValid || attestation.legacyDocumentId !== target.browserDocumentId) {
      throw new Error("trusted browser input legacy document attestation changed");
    }
  } else if (String(entry.documentId || "").trim() !== target.browserDocumentId) {
    throw new Error("trusted browser input target document changed during attestation");
  }
}

export async function verifyTrustedFrameTarget(api, target) {
  const before = await exactDirectChildFrame(api, target);
  await attestTrustedFrame(api, target);
  const after = await exactDirectChildFrame(api, target);
  if (before.href !== after.href || before.documentId !== after.documentId) {
    throw new Error("trusted browser input target navigated during verification");
  }
  return target;
}

function requireDebugger(api, action) {
  if (!api.debugger?.attach || !api.debugger?.sendCommand) {
    throw new Error(`Trusted browser ${action} is unavailable in this browser; complete the action manually.`);
  }
}

export async function dispatchTrustedClick(api, message = {}, sender = {}) {
  requireDebugger(api, "click");
  const frameTarget = trustedFrameTarget(api, message, sender);
  const x = Number(message.x);
  const y = Number(message.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    throw new Error("Trusted browser click failed: invalid viewport coordinates");
  }
  const target = { tabId: frameTarget.tabId };
  let attached = false;
  try {
    await verifyTrustedFrameTarget(api, frameTarget);
    await api.debugger.attach(target, "1.3");
    attached = true;
    await verifyTrustedFrameTarget(api, frameTarget);
    const base = { x, y, button: "left", clickCount: 1, modifiers: 0 };
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...base, type: "mouseMoved", buttons: 0 });
    const reason = String(message.reason || "");
    const hoverSettleMs = Number.isFinite(Number(message.hoverSettleMs))
      ? Number(message.hoverSettleMs)
      : (/topic menu|menu trigger|hover/i.test(reason) || message.kind === "topic-menu-trigger" ? 260 : 80);
    await sleep(Math.min(700, Math.max(0, hoverSettleMs)));
    await verifyTrustedFrameTarget(api, frameTarget);
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...base, type: "mousePressed", buttons: 1 });
    await sleep(45);
    await verifyTrustedFrameTarget(api, frameTarget);
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...base, type: "mouseReleased", buttons: 0 });
    return { tabId: frameTarget.tabId, frameId: frameTarget.frameId, x, y };
  } catch (error) {
    throw new Error(`Trusted browser click failed: ${error?.message || String(error || "unknown debugger error")}`);
  } finally {
    if (attached) {
      try { await api.debugger.detach(target); } catch {}
    }
  }
}

export async function dispatchTrustedMouseMove(api, message = {}, sender = {}) {
  requireDebugger(api, "hover");
  const frameTarget = trustedFrameTarget(api, message, sender);
  const x = Number(message.x);
  const y = Number(message.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    throw new Error("Trusted browser hover failed: invalid viewport coordinates");
  }
  const target = { tabId: frameTarget.tabId };
  let attached = false;
  try {
    await verifyTrustedFrameTarget(api, frameTarget);
    await api.debugger.attach(target, "1.3");
    attached = true;
    await verifyTrustedFrameTarget(api, frameTarget);
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
      buttons: 0,
      clickCount: 0,
      modifiers: 0
    });
    return { tabId: frameTarget.tabId, frameId: frameTarget.frameId, x, y };
  } catch (error) {
    throw new Error(`Trusted browser hover failed: ${error?.message || String(error || "unknown debugger error")}`);
  } finally {
    if (attached) {
      try { await api.debugger.detach(target); } catch {}
    }
  }
}

function keyModifiers(value = {}) {
  const explicit = Number(value?.modifiers);
  if (Number.isFinite(explicit)) return explicit;
  return (value?.altKey ? 1 : 0)
    | (value?.ctrlKey ? 2 : 0)
    | (value?.metaKey ? 4 : 0)
    | (value?.shiftKey ? 8 : 0);
}

function keyDescriptor(value = {}) {
  const source = typeof value === "string" ? { key: value } : (value || {});
  const key = String(source.key || "");
  const normalized = key.toLowerCase();
  const modifiers = keyModifiers(source);
  const withModifiers = (descriptor) => modifiers ? { ...descriptor, modifiers } : descriptor;
  if (normalized === "tab") return withModifiers({ key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 48 });
  if (normalized === "enter" || normalized === "return") return withModifiers({ key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 36 });
  if (normalized === "escape" || normalized === "esc") return withModifiers({ key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 53 });
  if (normalized === "backspace") return withModifiers({ key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 51 });
  if (normalized === "delete") return withModifiers({ key: "Delete", code: "Delete", windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 117 });
  if (normalized === " " || normalized === "space" || normalized === "spacebar") return withModifiers({ key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 49, text: " ", unmodifiedText: " " });
  return null;
}

export async function dispatchTrustedKeySequence(api, message = {}, sender = {}) {
  requireDebugger(api, "key input");
  const frameTarget = trustedFrameTarget(api, message, sender);
  const keys = (Array.isArray(message.keys) ? message.keys : [])
    .map((item) => ({ descriptor: keyDescriptor(item), settleMs: Number(item?.settleMs) }))
    .filter((item) => item.descriptor);
  if (!keys.length) throw new Error("Trusted browser key sequence failed: no supported keys were provided");
  const target = { tabId: frameTarget.tabId };
  let attached = false;
  try {
    await verifyTrustedFrameTarget(api, frameTarget);
    await api.debugger.attach(target, "1.3");
    attached = true;
    for (const item of keys) {
      const modifiers = Number.isFinite(Number(item.descriptor.modifiers)) ? Number(item.descriptor.modifiers) : 0;
      const event = { ...item.descriptor, modifiers, autoRepeat: false, isKeypad: false };
      await verifyTrustedFrameTarget(api, frameTarget);
      await api.debugger.sendCommand(target, "Input.dispatchKeyEvent", { ...event, type: "keyDown" });
      await sleep(35);
      await verifyTrustedFrameTarget(api, frameTarget);
      await api.debugger.sendCommand(target, "Input.dispatchKeyEvent", { ...event, type: "keyUp" });
      const settleMs = Number.isFinite(item.settleMs) ? item.settleMs : Number(message.keySettleMs);
      await sleep(Math.min(900, Math.max(45, Number.isFinite(settleMs) ? settleMs : 120)));
    }
    return { tabId: frameTarget.tabId, frameId: frameTarget.frameId, keys: keys.map((item) => item.descriptor.key) };
  } catch (error) {
    throw new Error(`Trusted browser key sequence failed: ${error?.message || String(error || "unknown debugger error")}`);
  } finally {
    if (attached) {
      try { await api.debugger.detach(target); } catch {}
    }
  }
}
