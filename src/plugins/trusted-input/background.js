// TrustedInput (background): real mouse / key input into the ChatClub tab through chrome.debugger
// (v2 05 §4.6 rule 2, 07 §5.2, §7 rule 8). Attach, dispatch, detach; one session per tab at a time.

const PROTOCOL = "1.3";
const busy = new Map();
const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

const num = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100000;
const point = (p) => p && num(p.x) && num(p.y);
const keyOk = (k) => k && typeof k.key === "string" && k.key.length <= 32 && (k.modifiers == null || (Array.isArray(k.modifiers) && k.modifiers.every((m) => m in MOD)));

function withDebugger(tabId, fn) {
  const prev = busy.get(tabId) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    const target = { tabId };
    await chrome.debugger.attach(target, PROTOCOL);
    try {
      return await fn((method, params) => chrome.debugger.sendCommand(target, method, params));
    } finally {
      await chrome.debugger.detach(target).catch(() => {});
    }
  });
  busy.set(tabId, run);
  return run.finally(() => {
    if (busy.get(tabId) === run) busy.delete(tabId);
  });
}

const tabOf = (sender) => {
  const id = sender?.tab?.id;
  if (typeof id !== "number") throw new Error("trusted input needs a ChatClub tab");
  if (!chrome.debugger?.attach) throw new Error("trusted input is not available in this browser");
  return id;
};

const modifiers = (list = []) => list.reduce((m, k) => m | (MOD[k] ?? 0), 0);

export default {
  handlers: {
    dispatchTrustedClick: {
      sender: "extensionPage",
      validate: (p) => point(p),
      handle: (p, sender) => withDebugger(tabOf(sender), async (send) => {
        const base = { x: p.x, y: p.y, button: "left", clickCount: 1, pointerType: "mouse" };
        await send("Input.dispatchMouseEvent", { ...base, type: "mouseMoved", button: "none" });
        await send("Input.dispatchMouseEvent", { ...base, type: "mousePressed", buttons: 1 });
        await send("Input.dispatchMouseEvent", { ...base, type: "mouseReleased", buttons: 0 });
        return { dispatched: true };
      }),
    },
    dispatchTrustedMouseMove: {
      sender: "extensionPage",
      validate: (p) => point(p),
      handle: (p, sender) => withDebugger(tabOf(sender), async (send) => {
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "none", pointerType: "mouse" });
        return { dispatched: true };
      }),
    },
    dispatchTrustedKeySequence: {
      sender: "extensionPage",
      validate: (p) => p && Array.isArray(p.keys) && p.keys.length > 0 && p.keys.length <= 8 && p.keys.every(keyOk),
      handle: (p, sender) => withDebugger(tabOf(sender), async (send) => {
        for (const k of p.keys) {
          const common = { key: k.key, code: k.code ?? "", windowsVirtualKeyCode: k.keyCode ?? 0, nativeVirtualKeyCode: k.keyCode ?? 0, modifiers: modifiers(k.modifiers) };
          await send("Input.dispatchKeyEvent", { ...common, type: "rawKeyDown" });
          await send("Input.dispatchKeyEvent", { ...common, type: "keyUp" });
        }
        return { dispatched: true };
      }),
    },
  },
};
