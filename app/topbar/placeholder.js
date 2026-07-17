export function pickTopbarPromptPlaceholderIndex(itemCount, config, promptState, advance) {
  if (itemCount <= 0) return -1;
  if (itemCount === 1) {
    promptState.index = 0;
    promptState.lastRandom = 0;
    return 0;
  }

  if (config.order === "random") {
    if (!advance) {
      if (promptState.index >= 0 && promptState.index < itemCount) return promptState.index;
      promptState.index = 0;
      promptState.lastRandom = 0;
      return 0;
    }
    let next = Math.floor(Math.random() * itemCount);
    const previous = promptState.index >= 0 && promptState.index < itemCount ? promptState.index : promptState.lastRandom;
    let guard = 0;
    while (next === previous && guard < 10) {
      next = Math.floor(Math.random() * itemCount);
      guard += 1;
    }
    promptState.index = next;
    promptState.lastRandom = next;
    return next;
  }

  if (!advance) {
    if (promptState.index >= 0 && promptState.index < itemCount) return promptState.index;
    promptState.index = 0;
    return 0;
  }
  const previous = promptState.index >= -1 && promptState.index < itemCount ? promptState.index : -1;
  const next = (previous + 1) % itemCount;
  promptState.index = next;
  return next;
}

export function createTopbarPlaceholderController({ state, normalizeConfig, saveOptions, syncTopbar, translate }) {
  if (!state || typeof state !== "object") throw new TypeError("Topbar placeholder requires state");
  for (const [name, value] of Object.entries({ normalizeConfig, saveOptions, syncTopbar, translate })) {
    if (typeof value !== "function") throw new TypeError(`Topbar placeholder requires ${name}`);
  }

  let value = "";
  let timer = 0;
  let timerKey = "";

  const configValue = () => normalizeConfig(state.options?.topbarPromptPlaceholderConfig);

  function applySelection({ advance = false } = {}) {
    const config = configValue();
    const items = config.items || [];
    if (!items.length) {
      value = "";
      state.options = { ...state.options, topbarPromptPlaceholderConfig: config };
      return { changed: false, config };
    }
    const previousState = JSON.stringify(config.state || {});
    const nextState = { ...(config.state || {}) };
    const index = pickTopbarPromptPlaceholderIndex(items.length, config, nextState, advance);
    const nextConfig = { ...config, state: nextState };
    state.options = { ...state.options, topbarPromptPlaceholderConfig: nextConfig };
    value = items[index] || items[0] || "";
    return { changed: previousState !== JSON.stringify(nextState), config: nextConfig };
  }

  function stopTimer() {
    if (!timer) return;
    clearInterval(timer);
    timer = 0;
    timerKey = "";
  }

  function restartTimer() {
    const config = configValue();
    const items = config.items || [];
    if (config.mode !== "interval" || items.length <= 1) {
      stopTimer();
      return;
    }
    const key = [config.mode, config.order, config.intervalSec, ...items].join("\u0001");
    if (timer && timerKey === key) return;
    stopTimer();
    timerKey = key;
    timer = setInterval(() => {
      applySelection({ advance: true });
      syncTopbar();
    }, Math.max(1, config.intervalSec) * 1000);
  }

  async function initialize() {
    const config = configValue();
    const shouldAdvance = config.mode === "refresh" && (config.items || []).length > 0;
    const result = applySelection({ advance: shouldAdvance });
    if (shouldAdvance && result.changed) {
      state.options = await saveOptions(state.options);
      applySelection({ advance: false });
    }
    restartTimer();
  }

  function sync() {
    applySelection({ advance: false });
    restartTimer();
    syncTopbar();
  }

  return Object.freeze({
    initialize,
    sync,
    stop: stopTimer,
    placeholder: () => value || translate("topbar.promptPlaceholder")
  });
}
