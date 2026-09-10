const INITIAL_PROMPT_FOCUS_RESTORE_MS = 50;
// A click inside a site-isolated chat-frame never reaches this document as a pointerdown; the child
// shield reports it (`ui/dom.js` re-dispatches it as this event) 1–40 ms after focus already moved.
const CHAT_FRAME_POINTER_EVENT = "chatclub:chat-frame-pointer";
const CHAT_FRAME_POINTER_REPORT_GRACE_MS = 120;

function promptNode() {
  return document.querySelector(".prompt-input");
}

function isFrameTarget(target) {
  return Boolean(target?.classList?.contains?.("chat-frame") || target?.nodeName === "IFRAME");
}

function isOverlayTarget(target) {
  let node = target;
  while (node) {
    const classes = node.classList;
    if (
      classes?.contains?.("modal")
      || classes?.contains?.("modal-backdrop")
      || classes?.contains?.("workspace-tabs-sidebar-search")
      || classes?.contains?.("workspace-tabs-sidebar-search-input")
    ) {
      return true;
    }
    node = node.parentNode;
  }
  return false;
}

function focusPromptInput(focusInput) {
  try {
    if (typeof focusInput === "function") {
      focusInput(false);
      return;
    }
    promptNode()?.focus?.({ preventScroll: true });
  } catch {}
}

function scheduleTask(callback) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }
  setTimeout(callback, 0);
}

function setPromptFocusLock(enabled) {
  if (enabled) document.documentElement.dataset.p = "1";
  else delete document.documentElement.dataset.p;
}

function createPromptFocusController({ isOptionsPage = false, focusInput } = {}) {
  let pending = !isOptionsPage;
  let restoreScheduled = false;
  let lastFramePointerDownAt = 0;
  let frameFocusSince = 0;
  const isPromptTarget = (target) => {
    const prompt = promptNode();
    return Boolean(prompt && (target === prompt || (target instanceof Node && prompt.contains(target))));
  };
  const release = () => {
    if (!pending) return;
    pending = false;
    setPromptFocusLock(false);
  };
  const recentFramePointer = () => Boolean(lastFramePointerDownAt && Date.now() - lastFramePointerDownAt < 1000);
  // The user chose a chat-frame: the reported click ends the initial lock exactly like a pointerdown
  // on the frame wrap would have.
  const onFramePointerReport = () => {
    if (!pending) return;
    lastFramePointerDownAt = Date.now();
    release();
  };
  // Focus sitting on a chat-frame is either that click (report still in flight) or a steal; wait out
  // the report window once before pulling the caret back.
  const frameFocusAwaitingReport = () => {
    if (!isFrameTarget(document.activeElement)) {
      frameFocusSince = 0;
      return false;
    }
    if (recentFramePointer()) return true;
    if (!frameFocusSince) frameFocusSince = Date.now();
    if (Date.now() - frameFocusSince < CHAT_FRAME_POINTER_REPORT_GRACE_MS) return true;
    // The caller reclaims now; the next frame focus (a later click) gets its own window.
    frameFocusSince = 0;
    return false;
  };
  const onUserInteraction = (event) => {
    if (!pending || event?.isTrusted !== true) return;
    if (
      event.type === "pointerdown"
      && (
        event.target?.classList?.contains?.("chat-frame")
        || event.target?.classList?.contains?.("chat-frame-wrap")
        || event.target?.closest?.(".chat-frame-wrap")
      )
    ) {
      lastFramePointerDownAt = Date.now();
      release();
      return;
    }
    if (isPromptTarget(event.target)) {
      if (event.type === "pointerdown" || (event.type === "keydown" && ["Tab", "Escape"].includes(event.key))) release();
      return;
    }
    if (event.type === "pointerdown" || event.type === "keydown") release();
  };
  const restoreIfNeeded = (force = false) => {
    if (!pending) return;
    const prompt = promptNode();
    if (!prompt?.isConnected || (!force && document.activeElement === prompt)) return;
    if (!force && frameFocusAwaitingReport()) return;
    if (!force && isOverlayTarget(document.activeElement)) return;
    focusPromptInput(focusInput);
  };
  const onFocusChange = (event) => {
    if (!pending || isPromptTarget(event?.target) || isOverlayTarget(event?.target)) return;
    if (isFrameTarget(event?.target) && recentFramePointer()) return;
    if (event?.target === window) return restoreIfNeeded(true);
    scheduleTask(restoreIfNeeded);
  };
  const restore = () => {
    restoreScheduled = false;
    if (!pending) return;
    const prompt = promptNode();
    if (!prompt?.isConnected) {
      setTimeout(restore, INITIAL_PROMPT_FOCUS_RESTORE_MS);
      return;
    }
    restoreIfNeeded();
    restoreScheduled = true;
    setTimeout(restore, INITIAL_PROMPT_FOCUS_RESTORE_MS);
  };
  const scheduleRestore = () => {
    if (!pending || restoreScheduled) return;
    restoreScheduled = true;
    setTimeout(restore, 0);
  };
  const restoreAfterFrameLoad = (event) => {
    if (!pending || !event?.target?.classList?.contains?.("chat-frame")) return;
    if (recentFramePointer()) return;
    const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : setTimeout;
    schedule(() => {
      if (!pending || document.querySelector(".modal")) return;
      const prompt = promptNode();
      const activeElement = document.activeElement;
      if (prompt?.isConnected && (activeElement === event.target || activeElement === document.body || activeElement === document.documentElement)) {
        focusPromptInput(focusInput);
      }
    }, 0);
  };

  if (!isOptionsPage) {
    setPromptFocusLock(true);
    for (const eventName of ["pointerdown", "keydown"]) window.addEventListener(eventName, onUserInteraction, true);
    for (const eventName of ["focus", "focusin"]) window.addEventListener(eventName, onFocusChange, true);
    window.addEventListener("load", restoreAfterFrameLoad, true);
    window.addEventListener(CHAT_FRAME_POINTER_EVENT, onFramePointerReport);
  }

  return Object.freeze({
    focusInitialPromptInput() {
      if (!pending) return;
      setPromptFocusLock(true);
      focusPromptInput(focusInput);
      scheduleRestore();
    }
  });
}

export function installPromptFocusController() {
  const controller = createPromptFocusController({
    isOptionsPage: document.body?.dataset?.chatclubEntry === "options"
  });
  controller.focusInitialPromptInput();
  return controller;
}
