const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

async function targetTabId(api, message = {}, sender = {}) {
  if (Number.isInteger(message.tabId) && message.tabId >= 0) return message.tabId;
  if (Number.isInteger(sender?.tab?.id) && sender.tab.id >= 0) return sender.tab.id;
  try {
    const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true });
    if (Number.isInteger(tabs?.[0]?.id) && tabs[0].id >= 0) return tabs[0].id;
  } catch {}
  return null;
}

function requireDebugger(api, action) {
  if (!api.debugger?.attach || !api.debugger?.sendCommand) {
    throw new Error(`Trusted browser ${action} is unavailable in this browser; complete the action manually.`);
  }
}

export async function dispatchTrustedClick(api, message = {}, sender = {}) {
  const tabId = await targetTabId(api, message, sender);
  if (typeof tabId !== "number") throw new Error("Trusted browser click failed: target tab is unavailable");
  requireDebugger(api, "click");
  const x = Number(message.x);
  const y = Number(message.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    throw new Error("Trusted browser click failed: invalid viewport coordinates");
  }
  const target = { tabId };
  let attached = false;
  try {
    await api.debugger.attach(target, "1.3");
    attached = true;
    const base = { x, y, button: "left", clickCount: 1, modifiers: 0 };
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...base, type: "mouseMoved", buttons: 0 });
    const reason = String(message.reason || "");
    const hoverSettleMs = Number.isFinite(Number(message.hoverSettleMs))
      ? Number(message.hoverSettleMs)
      : (/topic menu|menu trigger|hover/i.test(reason) || message.kind === "topic-menu-trigger" ? 260 : 80);
    await sleep(Math.min(700, Math.max(0, hoverSettleMs)));
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...base, type: "mousePressed", buttons: 1 });
    await sleep(45);
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...base, type: "mouseReleased", buttons: 0 });
    return { tabId, x, y };
  } catch (error) {
    throw new Error(`Trusted browser click failed: ${error?.message || String(error || "unknown debugger error")}`);
  } finally {
    if (attached) {
      try { await api.debugger.detach(target); } catch {}
    }
  }
}

export async function dispatchTrustedMouseMove(api, message = {}, sender = {}) {
  const tabId = await targetTabId(api, message, sender);
  if (typeof tabId !== "number") throw new Error("Trusted browser hover failed: target tab is unavailable");
  requireDebugger(api, "hover");
  const x = Number(message.x);
  const y = Number(message.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    throw new Error("Trusted browser hover failed: invalid viewport coordinates");
  }
  const target = { tabId };
  let attached = false;
  try {
    await api.debugger.attach(target, "1.3");
    attached = true;
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
      buttons: 0,
      clickCount: 0,
      modifiers: 0
    });
    return { tabId, x, y };
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
  const tabId = await targetTabId(api, message, sender);
  if (typeof tabId !== "number") throw new Error("Trusted browser key sequence failed: target tab is unavailable");
  requireDebugger(api, "key input");
  const keys = (Array.isArray(message.keys) ? message.keys : [])
    .map((item) => ({ descriptor: keyDescriptor(item), settleMs: Number(item?.settleMs) }))
    .filter((item) => item.descriptor);
  if (!keys.length) throw new Error("Trusted browser key sequence failed: no supported keys were provided");
  const target = { tabId };
  let attached = false;
  try {
    await api.debugger.attach(target, "1.3");
    attached = true;
    for (const item of keys) {
      const modifiers = Number.isFinite(Number(item.descriptor.modifiers)) ? Number(item.descriptor.modifiers) : 0;
      const event = { ...item.descriptor, modifiers, autoRepeat: false, isKeypad: false };
      await api.debugger.sendCommand(target, "Input.dispatchKeyEvent", { ...event, type: "keyDown" });
      await sleep(35);
      await api.debugger.sendCommand(target, "Input.dispatchKeyEvent", { ...event, type: "keyUp" });
      const settleMs = Number.isFinite(item.settleMs) ? item.settleMs : Number(message.keySettleMs);
      await sleep(Math.min(900, Math.max(45, Number.isFinite(settleMs) ? settleMs : 120)));
    }
    return { tabId, keys: keys.map((item) => item.descriptor.key) };
  } catch (error) {
    throw new Error(`Trusted browser key sequence failed: ${error?.message || String(error || "unknown debugger error")}`);
  } finally {
    if (attached) {
      try { await api.debugger.detach(target); } catch {}
    }
  }
}
