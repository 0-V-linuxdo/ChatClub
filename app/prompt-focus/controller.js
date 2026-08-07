const INITIAL_PROMPT_FOCUS_RESTORE_MS = 50;

function promptNode() {
  return document.querySelector(".prompt-input");
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
  const isPromptTarget = (target) => {
    const prompt = promptNode();
    return Boolean(prompt && (target === prompt || (target instanceof Node && prompt.contains(target))));
  };
  const release = () => {
    if (!pending) return;
    pending = false;
    setPromptFocusLock(false);
  };
  const onUserInteraction = (event) => {
    if (!pending || event?.isTrusted !== true) return;
    if (event.type === "pointerdown" && event.target?.classList?.contains?.("chat-frame")) {
      lastFramePointerDownAt = Date.now();
      release();
      return;
    }
    if (isPromptTarget(event.target)) {
      if (event.type === "keydown" && ["Tab", "Escape"].includes(event.key)) release();
      return;
    }
    if (event.type === "pointerdown" || event.type === "keydown") release();
  };
  const restoreIfNeeded = (force = false) => {
    if (!pending) return;
    const prompt = promptNode();
    if (!prompt?.isConnected || (!force && document.activeElement === prompt)) return;
    focusPromptInput(focusInput);
  };
  const onFocusChange = (event) => {
    if (!pending || isPromptTarget(event?.target)) return;
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
    if (lastFramePointerDownAt && Date.now() - lastFramePointerDownAt < 1000) return;
    const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : setTimeout;
    schedule(() => {
      if (!pending) return;
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
