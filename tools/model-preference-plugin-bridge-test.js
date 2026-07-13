(() => {
  const SOURCE = "chatclub";
  const PREFERRED_MODEL_SOURCE = "chatclub:preferred-model:2026.07.13.2";
  const API_NAME = "ChatClubPreferredModelBridgeTest";
  const activeRuns = new Map();
  const focusProbe = { blurCount: 0, focusCount: 0, composing: false, events: [] };
  const GATE_STATES = new Set(["bootstrapping", "applying", "failed", "ready"]);
  const BLOCKING_GATE_STATES = new Set(["bootstrapping", "applying", "failed"]);

  try { window[API_NAME]?.dispose?.(); } catch {}

  function requestId() {
    return `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function sendToFrame(iframe, action, data = {}, timeout = 20000, source = SOURCE) {
    return new Promise((resolve, reject) => {
      if (!iframe?.contentWindow) {
        reject(new Error("iframe contentWindow not available"));
        return;
      }
      const id = requestId();
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error(`timeout waiting for ${action}`));
      }, timeout);
      function onMessage(event) {
        if (event.source !== iframe.contentWindow) return;
        const message = event.data;
        if (message?.source !== source || message.type !== "response" || message.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        if (message.error) reject(new Error(message.error));
        else resolve(message.data);
      }
      window.addEventListener("message", onMessage);
      iframe.contentWindow.postMessage({ source, type: "request", action, id, data }, "*");
    });
  }

  function preferredModelRunId() {
    return `preferred-model-test-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function promptInput() {
    return document.querySelector(".prompt-input");
  }

  function promptShell() {
    const input = promptInput();
    return input?.closest?.(".prompt-shell") || document.querySelector(".prompt-shell");
  }

  function elementInfo(element) {
    return {
      tag: String(element?.tagName || "").toLowerCase(),
      id: String(element?.id || ""),
      className: typeof element?.className === "string" ? element.className.slice(0, 160) : "",
      ariaLabel: String(element?.getAttribute?.("aria-label") || ""),
      ariaBusy: String(element?.getAttribute?.("aria-busy") || ""),
      ariaDisabled: String(element?.getAttribute?.("aria-disabled") || ""),
      disabled: Boolean(element?.disabled),
      readOnly: Boolean(element?.readOnly),
      valueLength: typeof element?.value === "string" ? element.value.length : null,
      selectionStart: Number.isFinite(element?.selectionStart) ? element.selectionStart : null,
      selectionEnd: Number.isFinite(element?.selectionEnd) ? element.selectionEnd : null,
      selectionDirection: String(element?.selectionDirection || "none")
    };
  }

  function focusSnapshot() {
    const input = promptInput();
    return {
      promptFound: Boolean(input),
      promptFocused: document.activeElement === input,
      composing: focusProbe.composing,
      blurCount: focusProbe.blurCount,
      focusCount: focusProbe.focusCount,
      activeElement: elementInfo(document.activeElement),
      prompt: input ? elementInfo(input) : null,
      promptSelection: input
        ? { start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection || "none" }
        : null,
      recentEvents: focusProbe.events.slice(-20)
    };
  }

  function focusSelectionDiff(before = {}) {
    const after = focusSnapshot();
    const beforeSelection = before?.promptSelection || null;
    const afterSelection = after.promptSelection;
    const bothPromptsFound = before?.promptFound === true && after.promptFound === true;
    return {
      before,
      after,
      blurDelta: after.blurCount - (Number(before?.blurCount) || 0),
      focusDelta: after.focusCount - (Number(before?.focusCount) || 0),
      promptStillFocused: bothPromptsFound
        ? before.promptFocused === true && after.promptFocused === true
        : null,
      valueLengthUnchanged: bothPromptsFound
        ? before?.prompt?.valueLength === after.prompt?.valueLength
        : null,
      selectionUnchanged: beforeSelection && afterSelection
        ? beforeSelection.start === afterSelection.start
          && beforeSelection.end === afterSelection.end
          && beforeSelection.direction === afterSelection.direction
        : null
    };
  }

  function recordFocusEvent(type, event) {
    const input = promptInput();
    if (!input || event.target !== input) return;
    if (type === "blur") focusProbe.blurCount += 1;
    if (type === "focus") focusProbe.focusCount += 1;
    focusProbe.events.push({ type, at: Date.now(), selectionStart: input.selectionStart, selectionEnd: input.selectionEnd });
    while (focusProbe.events.length > 80) focusProbe.events.shift();
  }

  const focusListeners = {
    focus: (event) => recordFocusEvent("focus", event),
    blur: (event) => recordFocusEvent("blur", event),
    compositionstart(event) {
      if (event.target === promptInput()) focusProbe.composing = true;
    },
    compositionend(event) {
      if (event.target === promptInput()) focusProbe.composing = false;
    }
  };
  document.addEventListener("focus", focusListeners.focus, true);
  document.addEventListener("blur", focusListeners.blur, true);
  document.addEventListener("compositionstart", focusListeners.compositionstart, true);
  document.addEventListener("compositionend", focusListeners.compositionend, true);

  function frameInfo(frame, index) {
    return {
      index,
      appId: frame.dataset.appId || "",
      instanceId: frame.dataset.instanceId || "",
      active: frame.classList.contains("active"),
      currentHref: frame.dataset.currentHref || "",
      src: frame.getAttribute("src") || frame.src || ""
    };
  }

  function frames() {
    return Array.from(document.querySelectorAll(".chat-frame"));
  }

  function listFrames() {
    return frames().map(frameInfo);
  }

  function findFrame(appId) {
    const wanted = String(appId || "").trim();
    return frames().find((frame) => frame.dataset.appId === wanted) ||
      frames().find((frame) => frame.dataset.appId?.toLowerCase() === wanted.toLowerCase()) ||
      null;
  }

  function normalizedPreferredModelAppId(appId) {
    return ({
      GrokMirror: "Grok",
      "Grok Mirror": "Grok",
      "DeepSeek AI": "DeepSeek",
      "Notion AI": "NotionAI"
    })[String(appId || "")] || String(appId || "");
  }

  function normalizedGateState(value) {
    const state = String(value || "").trim().toLowerCase();
    return GATE_STATES.has(state) ? state : "";
  }

  function datasetCount(element, key) {
    const raw = element?.dataset?.[key];
    if (raw === undefined || raw === null || raw === "") return null;
    const count = Number(raw);
    return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
  }

  function datasetBoolean(element, keys) {
    for (const key of keys) {
      const raw = element?.dataset?.[key];
      if (raw === undefined) continue;
      const value = String(raw).trim().toLowerCase();
      if (["true", "1", "yes", "required", "configured"].includes(value)) return true;
      if (["false", "0", "no", "none", "unconfigured"].includes(value)) return false;
    }
    return null;
  }

  function commaList(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function inferredGateState(shell, input) {
    const explicit = normalizedGateState(input?.dataset?.modelGateState || shell?.dataset?.modelGateState);
    if (explicit) return explicit;
    if (shell?.classList?.contains("prompt-shell-model-gate-failed")) return "failed";
    if (shell?.classList?.contains("prompt-shell-model-gate-applying")) return "applying";
    if (input && input.readOnly && input.getAttribute("aria-busy") === "true") return "applying";
    if (shell && input) return "ready";
    return "unknown";
  }

  function controlSummary(selector, root = document) {
    const items = Array.from(root?.querySelectorAll?.(selector) || []);
    const details = items.map((item) => ({
      tag: String(item.tagName || "").toLowerCase(),
      className: typeof item.className === "string" ? item.className.slice(0, 160) : "",
      ariaLabel: String(item.getAttribute?.("aria-label") || ""),
      disabled: Boolean(item.disabled),
      ariaDisabled: item.getAttribute?.("aria-disabled") === "true",
      hidden: Boolean(item.hidden)
    }));
    const disabledCount = details.filter((item) => item.disabled || item.ariaDisabled).length;
    return {
      count: details.length,
      disabledCount,
      enabledCount: details.length - disabledCount,
      allDisabled: details.length ? disabledCount === details.length : null,
      items: details
    };
  }

  function modelGateControls() {
    return {
      send: controlSummary(".prompt-send-button"),
      actionTrigger: controlSummary(".prompt-actions-button"),
      actionMenuItems: controlSummary(".prompt-actions-popover button, .prompt-actions-popover [role='button']"),
      imageFileInput: controlSummary(".prompt-image-file-input[type='file']"),
      imageRemove: controlSummary(".prompt-image-remove"),
      clear: controlSummary(".prompt-clear-button")
    };
  }

  function modelGateSnapshot() {
    const shell = promptShell();
    const input = promptInput();
    const status = shell?.querySelector?.(".prompt-model-gate-status") || document.querySelector(".prompt-model-gate-status");
    const statusTextNode = status?.querySelector?.(".prompt-model-gate-status-text") || status;
    const state = inferredGateState(shell, input);
    const pendingCount = datasetCount(shell, "modelGatePendingCount");
    const failedCount = datasetCount(shell, "modelGateFailedCount");
    const failedAppIds = commaList(shell?.dataset?.modelGateFailedAppIds);
    return {
      state,
      blocked: BLOCKING_GATE_STATES.has(state),
      exposedState: normalizedGateState(input?.dataset?.modelGateState || shell?.dataset?.modelGateState) || null,
      counts: {
        pending: pendingCount,
        failed: failedCount
      },
      failedAppIds,
      shell: shell
        ? {
            found: true,
            classes: Array.from(shell.classList),
            dataset: {
              modelGateState: String(shell.dataset.modelGateState || ""),
              modelGatePendingCount: shell.dataset.modelGatePendingCount ?? null,
              modelGateFailedCount: shell.dataset.modelGateFailedCount ?? null,
              modelGateFailedAppIds: String(shell.dataset.modelGateFailedAppIds || "")
            }
          }
        : { found: false, classes: [], dataset: {} },
      prompt: input
        ? {
            found: true,
            readOnly: Boolean(input.readOnly),
            disabled: Boolean(input.disabled),
            ariaBusy: input.getAttribute("aria-busy"),
            ariaDisabled: input.getAttribute("aria-disabled"),
            modelGateState: String(input.dataset.modelGateState || ""),
            focused: document.activeElement === input,
            valueLength: String(input.value || "").length,
            selection: {
              start: input.selectionStart,
              end: input.selectionEnd,
              direction: input.selectionDirection || "none"
            }
          }
        : { found: false },
      status: {
        found: Boolean(status),
        visible: Boolean(status && !status.hidden),
        hidden: Boolean(!status || status.hidden),
        text: String(statusTextNode?.textContent || "").replace(/\s+/g, " ").trim()
      },
      controls: modelGateControls(),
      capturedAt: Date.now()
    };
  }

  function modelGateFrameInfo(frame, index, gate) {
    const appId = String(frame.dataset.appId || "");
    const normalizedAppId = normalizedPreferredModelAppId(appId).toLowerCase();
    const failedAppIds = gate.failedAppIds.map((item) => normalizedPreferredModelAppId(item).toLowerCase());
    const explicitState = normalizedGateState(
      frame.dataset.modelGateState || frame.dataset.preferredModelGateState
    );
    const configuredFlag = datasetBoolean(frame, [
      "modelGateConfigured",
      "preferredModelConfigured",
      "modelGateRequired",
      "preferredModelRequired"
    ]);
    const exposedTarget = String(
      frame.dataset.preferredModelTarget
      || frame.dataset.modelGateTarget
      || frame.dataset.preferredModelKey
      || ""
    );
    const failed = Boolean(normalizedAppId && failedAppIds.includes(normalizedAppId));
    const configured = configuredFlag ?? ((exposedTarget || explicitState || failed) ? true : null);
    let blocking = null;
    if (failed || BLOCKING_GATE_STATES.has(explicitState)) blocking = true;
    else if (explicitState === "ready" || configured === false) blocking = false;
    return {
      ...frameInfo(frame, index),
      configured,
      blocking,
      failed,
      gateState: explicitState || null,
      target: exposedTarget || null,
      domExposure: {
        configured: configuredFlag !== null || Boolean(exposedTarget),
        state: Boolean(explicitState)
      }
    };
  }

  function blockingActiveConfiguredFrames() {
    const gate = modelGateSnapshot();
    const activeFrames = frames().filter((frame) => frame.classList.contains("active"));
    const details = activeFrames.map((frame) => modelGateFrameInfo(frame, frames().indexOf(frame), gate));
    const matchedFailedIds = new Set(
      details.filter((frame) => frame.failed).map((frame) => normalizedPreferredModelAppId(frame.appId).toLowerCase())
    );
    const unmatchedFailedAppIds = gate.failedAppIds.filter(
      (appId) => !matchedFailedIds.has(normalizedPreferredModelAppId(appId).toLowerCase())
    );
    const knownPendingCount = details.filter((frame) => (
      frame.gateState === "applying" || frame.gateState === "bootstrapping"
    )).length;
    const aggregateExposed = gate.counts.pending !== null || gate.counts.failed !== null || gate.failedAppIds.length > 0;
    const perFrameExposed = details.some((frame) => frame.domExposure.configured || frame.domExposure.state);
    return {
      gateState: gate.state,
      exposure: perFrameExposed ? "per-frame" : aggregateExposed ? "aggregate-only" : "none",
      counts: gate.counts,
      failedAppIds: gate.failedAppIds,
      blocking: details.filter((frame) => frame.blocking === true),
      nonBlocking: details.filter((frame) => frame.blocking === false),
      unknown: details.filter((frame) => frame.blocking === null),
      unresolvedPendingCount: gate.counts.pending === null
        ? null
        : Math.max(0, gate.counts.pending - knownPendingCount),
      unmatchedFailedAppIds,
      note: perFrameExposed
        ? "Blocking frames are derived from per-frame DOM data."
        : "Only aggregate gate data is exposed; unknown frames are intentionally not guessed."
    };
  }

  function safeGateBlockProbe() {
    const gate = modelGateSnapshot();
    const controls = gate.controls;
    const inputLocked = gate.prompt.found && gate.prompt.readOnly === true;
    const gateBlocked = gate.blocked;
    const sendBlocked = controls.send.allDisabled === true;
    const actionBlocked = controls.actionTrigger.allDisabled === true;
    const actionMenuItemsBlocked = controls.actionMenuItems.count === 0 || controls.actionMenuItems.allDisabled === true;
    const filePickerBlocked = controls.imageFileInput.allDisabled === true;
    const imageRemoveBlocked = controls.imageRemove.count === 0 || controls.imageRemove.allDisabled === true;
    const clearBlocked = controls.clear.count === 0 || controls.clear.allDisabled === true;
    const capabilities = {
      textEntry: { blocked: inputLocked, evidence: ["textarea.readOnly"] },
      enterSubmit: {
        blocked: gateBlocked && inputLocked && sendBlocked,
        inferred: true,
        evidence: ["gate.blocked", "textarea.readOnly", "sendButton.disabled"]
      },
      sendButton: { blocked: sendBlocked, evidence: ["sendButton.disabled"] },
      paste: {
        blocked: gateBlocked && inputLocked,
        inferred: true,
        evidence: ["gate.blocked", "textarea.readOnly"]
      },
      drop: {
        blocked: gateBlocked && inputLocked,
        inferred: true,
        evidence: ["gate.blocked", "textarea.readOnly"]
      },
      imagePicker: {
        blocked: filePickerBlocked && actionBlocked,
        evidence: ["imageFileInput.disabled", "actionTrigger.disabled"]
      },
      imageRemoval: { blocked: imageRemoveBlocked, evidence: ["imageRemove.disabled-or-absent"] },
      promptActions: {
        blocked: actionBlocked && actionMenuItemsBlocked,
        evidence: ["actionTrigger.disabled", "openActionMenuItems.disabled-or-absent"]
      },
      clearPrompt: { blocked: clearBlocked, evidence: ["clearButton.disabled-or-absent"] }
    };
    const required = [
      "textEntry",
      "enterSubmit",
      "sendButton",
      "paste",
      "drop",
      "imagePicker",
      "imageRemoval",
      "promptActions",
      "clearPrompt"
    ];
    return {
      safe: true,
      eventsDispatched: [],
      filesReadOrUploaded: false,
      method: "DOM attributes only; inferred event paths are never dispatched",
      gate,
      capabilities,
      allBlocked: gateBlocked ? required.every((key) => capabilities[key].blocked === true) : null,
      discrepancies: gateBlocked
        ? required.filter((key) => capabilities[key].blocked !== true)
        : []
    };
  }

  function waitForGate(target = "ready", options = {}) {
    const wanted = normalizedGateState(target);
    if (!wanted || !["ready", "applying", "failed"].includes(wanted)) {
      return Promise.reject(new Error("waitForGate target must be ready, applying, or failed"));
    }
    const timeoutMs = Math.max(100, Number(options?.timeoutMs) || 20000);
    const pollMs = Math.max(25, Number(options?.pollMs) || 100);
    return new Promise((resolve, reject) => {
      let settled = false;
      let observer = null;
      let interval = 0;
      let timeout = 0;
      const cleanup = () => {
        observer?.disconnect?.();
        if (interval) clearInterval(interval);
        if (timeout) clearTimeout(timeout);
      };
      const check = () => {
        if (settled) return;
        const snapshot = modelGateSnapshot();
        if (snapshot.state !== wanted) return;
        settled = true;
        cleanup();
        resolve(snapshot);
      };
      observer = new MutationObserver(check);
      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true
      });
      interval = window.setInterval(check, pollMs);
      timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        const snapshot = modelGateSnapshot();
        const error = new Error(`timeout waiting for model gate ${wanted}; current state: ${snapshot.state}`);
        error.snapshot = snapshot;
        reject(error);
      }, timeoutMs);
      check();
    });
  }

  async function ping(appId) {
    const frame = findFrame(appId);
    if (!frame) return { ok: false, appId, reason: "frame not found", frames: listFrames() };
    const href = await sendToFrame(frame, "getLocationHref", {}, 5000);
    return { ok: true, appId: frame.dataset.appId || appId, href };
  }

  async function apply(appId, modelId, options = {}) {
    const frame = findFrame(appId);
    if (!frame) return { ok: false, appId, modelId, reason: "frame not found", frames: listFrames() };
    const normalizedAppId = normalizedPreferredModelAppId(appId);
    const inputOptions = options && typeof options === "object" ? options : {};
    const runId = String(inputOptions.runId || preferredModelRunId());
    const timeoutMs = Math.max(1000, Number(inputOptions.timeoutMs) || 20000);
    const { runId: ignoredRunId, timeoutMs: ignoredTimeoutMs, ...modelOptions } = inputOptions;
    const previousRunId = activeRuns.get(frame) || "";
    if (previousRunId && previousRunId !== runId) {
      try {
        await sendToFrame(
          frame,
          "cancelPreferredModelApply",
          { runId: previousRunId },
          5000,
          PREFERRED_MODEL_SOURCE
        );
      } catch {}
    }
    const payload = {
      runId,
      appId: normalizedAppId,
      modelId,
      ...modelOptions
    };
    const focusBefore = focusSnapshot();
    activeRuns.set(frame, runId);
    try {
      const result = await sendToFrame(frame, "applyPreferredModel", payload, timeoutMs, PREFERRED_MODEL_SOURCE);
      const focusAfter = focusSnapshot();
      return {
        runId,
        frame: frameInfo(frame, frames().indexOf(frame)),
        focus: {
          before: focusBefore,
          after: focusAfter,
          blurDelta: focusAfter.blurCount - focusBefore.blurCount
        },
        result
      };
    } finally {
      if (activeRuns.get(frame) === runId) activeRuns.delete(frame);
    }
  }

  async function cancel(appId, runId = "") {
    const frame = findFrame(appId);
    if (!frame) return { ok: false, appId, runId, reason: "frame not found", frames: listFrames() };
    const targetRunId = String(runId || activeRuns.get(frame) || "");
    if (!targetRunId) return { ok: true, cancelled: false, appId, runId: "", reason: "no active run" };
    const result = await sendToFrame(
      frame,
      "cancelPreferredModelApply",
      { runId: targetRunId },
      5000,
      PREFERRED_MODEL_SOURCE
    );
    if (activeRuns.get(frame) === targetRunId) activeRuns.delete(frame);
    return { frame: frameInfo(frame, frames().indexOf(frame)), runId: targetRunId, result };
  }

  async function run(plan = [
    ["Gemini", "pro", { thinkingLevel: "standard" }],
    ["Gemini", "pro", { thinkingLevel: "extended" }],
    ["Gemini", "fast"],
    ["Gemini", "flash35"],
    ["GrokMirror", "expert"],
    ["DeepSeek", "expert"],
    ["NotionAI", "gemini31pro"]
  ]) {
    const output = { frames: listFrames(), pings: {}, applies: [] };
    for (const [appId, modelId, options] of plan) {
      try {
        output.pings[appId] = await ping(appId);
      } catch (error) {
        output.pings[appId] = { ok: false, appId, reason: error.message || String(error) };
      }
      try {
        output.applies.push(await apply(appId, modelId, options));
      } catch (error) {
        output.applies.push({ appId, modelId, error: error.message || String(error) });
      }
    }
    console.log("[ChatClub plugin bridge test]", output);
    return output;
  }

  function resetFocusProbe() {
    focusProbe.blurCount = 0;
    focusProbe.focusCount = 0;
    focusProbe.events.length = 0;
    return focusSnapshot();
  }

  function dispose() {
    document.removeEventListener("focus", focusListeners.focus, true);
    document.removeEventListener("blur", focusListeners.blur, true);
    document.removeEventListener("compositionstart", focusListeners.compositionstart, true);
    document.removeEventListener("compositionend", focusListeners.compositionend, true);
  }

  window[API_NAME] = Object.freeze({
    apply,
    blockingFrames: blockingActiveConfiguredFrames,
    cancel,
    compareFocus: focusSelectionDiff,
    dispose,
    focus: focusSnapshot,
    frames: listFrames,
    gate: modelGateSnapshot,
    ping,
    probeGate: safeGateBlockProbe,
    resetFocusProbe,
    run,
    sendToFrame,
    source: PREFERRED_MODEL_SOURCE,
    waitForGate
  });
  console.log(
    `${API_NAME} ready. Gate: ${API_NAME}.gate(); `
    + `await ${API_NAME}.waitForGate("ready"); ${API_NAME}.probeGate()`
  );
})();
