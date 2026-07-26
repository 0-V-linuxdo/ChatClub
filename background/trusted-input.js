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

function isClaudeHref(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "claude.ai" || host.endsWith(".claude.ai"));
  } catch {
    return false;
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
    || (frame.frameId != null && Number(frame.frameId) !== target.frameId)
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
  // eslint-disable-next-line chatclub-realm/no-cross-realm-global -- serialized ISOLATED-world attestation must validate Firefox's DOM-global owner.
  const target = globalThis.window || globalThis;
  const document = target.document;
  const state = target.__CHATCLUB_BROWSER_DOCUMENT_ATTESTATION_STATE__;
  const descriptor = Object.getOwnPropertyDescriptor(
    target,
    "__CHATCLUB_BROWSER_DOCUMENT_ATTESTATION_STATE__"
  );
  const claudeDeleteShortcutReady = (() => {
    try {
      const active = document?.activeElement || null;
      if (!active || active === document.body || active === document.documentElement) return false;
      const stripPrivateUse = (value) => String(value || "").replace(
        /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu,
        " "
      );
      const normalize = (value) => stripPrivateUse(value)
        .replace(/[\u200B-\u200F\u2060\uFEFF]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const compact = (value) => normalize(value).toLowerCase().replace(/[\s\u00a0:：·•()（）\[\]{}<>_-]+/g, "");
      const visible = (node) => {
        if (!node?.isConnected) return false;
        const box = node.getBoundingClientRect?.();
        if (!box || box.width < 1 || box.height < 1) return false;
        const style = target.getComputedStyle?.(node);
        return !style || (style.display !== "none" && style.visibility !== "hidden");
      };
      const itemSelector = [
        "[role='menuitem']",
        "[role='menuitemradio']",
        "[role='menuitemcheckbox']",
        "[role='option']",
        "[data-radix-collection-item]",
        "button",
        "[role='button']"
      ].join(",");
      const valuesFor = (node) => [
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.innerText,
        node.textContent
      ].map(normalize).filter(Boolean);
      const wrongDeleteTarget = /\b(?:delete|remove)\b[^\n]{0,48}\b(?:project|account|workspace)\b|(?:删除|移除)[^\n]{0,24}(?:项目|账户|帐号|账号|工作区)/i;
      const exactDeleteLabel = /^(?:delete(?:\s+(?:chat|conversation))?|删除(?:聊天|对话)?)$/i;
      const exactDeleteShortcut = /^(?:delete(?:\s+(?:chat|conversation))?|删除(?:聊天|对话)?)\s+d$/i;
      const compactShortcutWithExplicitD = /^(?:Delete(?:Chat|Conversation)?|delete(?:chat|conversation)?|删除(?:聊天|对话)?)D$/;
      const deleteShortcutMatches = (node) => {
        const values = valuesFor(node);
        const hasRawShortcutEvidence = values.some((value) => exactDeleteShortcut.test(value));
        return values.length > 0
          && hasRawShortcutEvidence
          && values.every((value) => (
            !wrongDeleteTarget.test(value)
            && (
              exactDeleteLabel.test(value)
              || exactDeleteShortcut.test(value)
              || (hasRawShortcutEvidence && compactShortcutWithExplicitD.test(value.replace(/\s+/g, "")))
            )
          ));
      };
      const ownedMenuRootForTrigger = (trigger) => {
        const ids = ["aria-controls", "aria-owns"].flatMap((name) => (
          String(trigger?.getAttribute?.(name) || "").trim().split(/\s+/).filter(Boolean)
        ));
        if (!ids.length) return null;
        const roots = new Set();
        for (const id of ids) {
          const root = document.getElementById?.(id) || null;
          if (!root || String(root.id || "") !== id) return null;
          roots.add(root);
        }
        return roots.size === 1 ? [...roots][0] : null;
      };
      const titleRoots = [...document.querySelectorAll?.("[data-testid='chat-title-split']") || []]
        .filter(visible);
      if (titleRoots.length !== 1) return false;
      const titleTriggers = [...titleRoots[0].querySelectorAll?.("button[aria-label],[role='button'][aria-label]") || []]
        .filter((trigger) => {
          if (!visible(trigger) || trigger.disabled || trigger.getAttribute?.("aria-disabled") === "true") return false;
          if (!/^More options for\s+.+$/i.test(normalize(trigger.getAttribute?.("aria-label")))) return false;
          if (String(trigger.getAttribute?.("aria-expanded") || "").trim().toLowerCase() !== "true") return false;
          const controlled = ownedMenuRootForTrigger(trigger);
          return Boolean(
            controlled
            && visible(controlled)
            && controlled.contains?.(active)
          );
        });
      if (titleTriggers.length !== 1) return false;
      const ownedMenuRoot = ownedMenuRootForTrigger(titleTriggers[0]);
      if (!ownedMenuRoot) return false;
      const roots = [ownedMenuRoot];
      const matchingItems = [];
      const matchingSet = new Set();
      for (const root of roots) {
        for (const node of root.querySelectorAll?.(itemSelector) || []) {
          if (
            matchingSet.has(node)
            || !visible(node)
            || node.disabled
            || node.getAttribute?.("aria-disabled") === "true"
            || !deleteShortcutMatches(node)
          ) continue;
          matchingSet.add(node);
          matchingItems.push(node);
        }
      }
      if (matchingItems.length !== 1 || matchingItems[0] !== active) return false;
      return roots.some((root) => {
        const readStateTargets = new Set();
        const conversationActionTargets = new Set();
        for (const node of root.querySelectorAll?.(itemSelector) || []) {
          if (!visible(node) || node.disabled || node.getAttribute?.("aria-disabled") === "true") continue;
          for (const value of valuesFor(node).map(compact)) {
            if (/^(?:markasunread|markasread)u?$/.test(value) || /^(?:标记为未读|标记为已读)u?$/.test(value)) {
              readStateTargets.add(node);
            }
            if (/^(?:star|unstar)p?$/.test(value)
              || /^rename(?:chat|conversation)?r?$/.test(value)
              || value === "addtoproject"
              || /^(?:加星|取消加星)p?$/.test(value)
              || /^重命名(?:聊天|对话)?r?$/.test(value)
              || value === "添加到项目") {
              conversationActionTargets.add(node);
            }
          }
        }
        return [...readStateTargets].some((readTarget) => (
          [...conversationActionTargets].some((actionTarget) => actionTarget !== readTarget)
        ));
      });
    } catch {
      return false;
    }
  })();
  return {
    frameBindingId: String(target.__CHATCLUB_FRAME_BINDING_ID__ || ""),
    bridgeDocumentId: String(target.__CHATCLUB_CONTENT_DOCUMENT_ID__ || ""),
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
    href: String(target.location?.href || ""),
    documentHasFocus: Boolean(document?.hasFocus?.()),
    claudeDeleteShortcutReady
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
  return attestation;
}

async function verifyTrustedFrameTarget(api, target, options = {}) {
  const before = await exactDirectChildFrame(api, target);
  const attestation = await attestTrustedFrame(api, target);
  if (options.requireDocumentFocus && attestation.documentHasFocus !== true) {
    throw new Error("trusted browser input target document lost keyboard focus");
  }
  if (options.requireClaudeDeleteShortcut && attestation.claudeDeleteShortcutReady !== true) {
    throw new Error("trusted browser input target lost the owned Claude Delete D menu");
  }
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
    const pointer = { x, y, modifiers: 0 };
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      ...pointer,
      type: "mouseMoved",
      button: "none",
      buttons: 0,
      clickCount: 0
    });
    const reason = String(message.reason || "");
    const hoverSettleMs = Number.isFinite(Number(message.hoverSettleMs))
      ? Number(message.hoverSettleMs)
      : (/topic menu|menu trigger|hover/i.test(reason) || message.kind === "topic-menu-trigger" ? 260 : 80);
    await sleep(Math.min(700, Math.max(0, hoverSettleMs)));
    await verifyTrustedFrameTarget(api, frameTarget);
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      ...pointer,
      type: "mousePressed",
      button: "left",
      buttons: 1,
      clickCount: 1
    });
    await sleep(45);
    await verifyTrustedFrameTarget(api, frameTarget);
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      ...pointer,
      type: "mouseReleased",
      button: "left",
      buttons: 0,
      clickCount: 1
    });
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
  if (key === "d") return withModifiers({ key: "d", code: "KeyD", windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 2 });
  return null;
}

export async function dispatchTrustedKeySequence(api, message = {}, sender = {}) {
  requireDebugger(api, "key input");
  const frameTarget = trustedFrameTarget(api, message, sender);
  const rawKeys = Array.isArray(message.keys) ? message.keys : [];
  const claudeDeleteShortcut = String(message.kind || "") === "claude-menu-delete-shortcut"
    && String(message.site || "").toLowerCase() === "claude"
    && rawKeys.length === 1
    && rawKeys[0]
    && typeof rawKeys[0] === "object"
    && rawKeys[0].key === "d"
    && !rawKeys[0].shiftKey
    && !rawKeys[0].ctrlKey
    && !rawKeys[0].metaKey
    && !rawKeys[0].altKey
    && (rawKeys[0].modifiers == null || Number(rawKeys[0].modifiers) === 0);
  const requestsPrintableD = rawKeys.some((item) => String(typeof item === "string" ? item : item?.key || "") === "d")
    || String(message.kind || "") === "claude-menu-delete-shortcut";
  if (requestsPrintableD && !claudeDeleteShortcut) {
    throw new Error("Trusted browser key sequence failed: lowercase d is outside the verified Claude menu contract");
  }
  if (claudeDeleteShortcut && !isClaudeHref(frameTarget.href)) {
    throw new Error("Trusted browser key sequence failed: lowercase d target is not Claude");
  }
  const keys = rawKeys
    .map((item) => ({ descriptor: keyDescriptor(item), settleMs: Number(item?.settleMs) }))
    .filter((item) => item.descriptor);
  if (!keys.length) throw new Error("Trusted browser key sequence failed: no supported keys were provided");
  const target = { tabId: frameTarget.tabId };
  let attached = false;
  try {
    await verifyTrustedFrameTarget(api, frameTarget, {
      requireDocumentFocus: claudeDeleteShortcut,
      requireClaudeDeleteShortcut: claudeDeleteShortcut
    });
    await api.debugger.attach(target, "1.3");
    attached = true;
    for (const item of keys) {
      const modifiers = Number.isFinite(Number(item.descriptor.modifiers)) ? Number(item.descriptor.modifiers) : 0;
      const event = { ...item.descriptor, modifiers, autoRepeat: false, isKeypad: false };
      await verifyTrustedFrameTarget(api, frameTarget, {
        requireDocumentFocus: claudeDeleteShortcut,
        requireClaudeDeleteShortcut: claudeDeleteShortcut
      });
      await api.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        ...event,
        type: claudeDeleteShortcut ? "rawKeyDown" : "keyDown"
      });
      await sleep(35);
      await verifyTrustedFrameTarget(api, frameTarget, { requireDocumentFocus: claudeDeleteShortcut });
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
