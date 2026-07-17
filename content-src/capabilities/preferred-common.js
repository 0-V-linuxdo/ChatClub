export function createPreferredCommonCapability(deps = {}) {
  const {
    contentDocumentId,
    GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE,
    PREFERRED_MODEL_FOCUS_SHIELD_LEASE_MS,
    PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE,
    PREFERRED_MODEL_FOCUS_SHIELD_RELEASE_GRACE_MS,
    GEMINI_MODEL_PICKER_SOURCE,
    contentBridgeIsCurrent,
    sleep,
    isDisabledElement,
    visibleSelectorElements,
    firstVisibleBySelectors,
    modelElementText,
    compactModelText,
    alnumModelToken,
    modelTextIncludes,
    parseBooleanAttr,
    modelRect,
    modelElementArea,
    modelRectInViewport,
    visibleInViewport,
    modelCenterPoint,
    modelElementFromPoint,
    modelClickableAncestor,
    modelCustomActivationAncestor,
    modelActivationTargets,
    modelClick,
    modelDirectClick,
    preferredModelActivate,
    preferredModelPointerActivate
  } = deps;
  let preferredModelBridgeRunSequence = Math.max(
    0,
    Number(window.__CHATCLUB_PREFERRED_MODEL_BRIDGE_RUN_SEQUENCE__) || 0
  );
  const preferredModelState = { activeRun: null };

  function nextPreferredModelBridgeRunSequence() {
    preferredModelBridgeRunSequence += 1;
    window.__CHATCLUB_PREFERRED_MODEL_BRIDGE_RUN_SEQUENCE__ = preferredModelBridgeRunSequence;
    return preferredModelBridgeRunSequence;
  }

  function preferredModelBridgeToken(context) {
    if (!context?.runId || !context?.bridgeGeneration) return "";
    return `${contentDocumentId}:${context.bridgeGeneration}:${context.runId}`;
  }

  function publishPreferredModelBridgeRun(context) {
    if (!context) return "";
    context.bridgeToken = preferredModelBridgeToken(context);
    context.bridgeReleased = false;
    try {
      document.documentElement?.setAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE, context.bridgeToken);
    } catch {}
    return context.bridgeToken;
  }

  function preferredModelFocusShieldValue(context, expiresAt) {
    return JSON.stringify({
      token: String(context?.bridgeToken || ""),
      generation: Math.max(0, Number(context?.focusShieldGeneration) || 0),
      expiresAt: Math.max(0, Number(expiresAt) || 0)
    });
  }

  function armPreferredModelFocusShield(context, leaseMs = PREFERRED_MODEL_FOCUS_SHIELD_LEASE_MS) {
    assertPreferredModelRun(context);
    context.focusShieldGeneration = Math.max(0, Number(context.focusShieldGeneration) || 0) + 1;
    context.focusShieldReleaseScheduled = false;
    const value = preferredModelFocusShieldValue(
      context,
      Date.now() + Math.max(250, Number(leaseMs) || PREFERRED_MODEL_FOCUS_SHIELD_LEASE_MS)
    );
    context.focusShieldValue = value;
    try { document.documentElement?.setAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE, value); } catch {}
    return value;
  }

  function releasePreferredModelFocusShield(context) {
    if (!context?.focusShieldValue || context.focusShieldReleaseScheduled) return;
    context.focusShieldReleaseScheduled = true;
    const generation = context.focusShieldGeneration;
    const afterFrame = (callback) => {
      try {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(callback);
          return;
        }
      } catch {}
      setTimeout(callback, 17);
    };
    afterFrame(() => afterFrame(() => {
      if (context.focusShieldGeneration !== generation || !context.focusShieldReleaseScheduled) return;
      let current = "";
      try { current = String(document.documentElement?.getAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE) || ""); } catch {}
      if (!current || current !== context.focusShieldValue) return;
      const value = preferredModelFocusShieldValue(
        context,
        Date.now() + PREFERRED_MODEL_FOCUS_SHIELD_RELEASE_GRACE_MS
      );
      context.focusShieldValue = value;
      try { document.documentElement?.setAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE, value); } catch {}
      setTimeout(() => {
        if (context.focusShieldGeneration !== generation) return;
        try {
          if (document.documentElement?.getAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE) === value) {
            document.documentElement.removeAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE);
          }
        } catch {}
      }, PREFERRED_MODEL_FOCUS_SHIELD_RELEASE_GRACE_MS + 50);
    }));
  }

  function postGeminiModelPickerBridgeCancel(context, reason = "preferred model apply cancelled") {
    if (!context?.runId || !context?.bridgeToken) return;
    try {
      window.postMessage({
        source: GEMINI_MODEL_PICKER_SOURCE,
        type: "request",
        action: "cancel",
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        runId: context.runId,
        runGeneration: context.bridgeGeneration,
        runToken: context.bridgeToken,
        reason: String(reason || "preferred model apply cancelled")
      }, "*");
    } catch {}
  }

  function releasePreferredModelBridgeRun(context, reason = "preferred model apply finished") {
    releasePreferredModelFocusShield(context);
    if (!context || context.bridgeReleased) return;
    context.bridgeReleased = true;
    try {
      if (document.documentElement?.getAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE) === context.bridgeToken) {
        document.documentElement.removeAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE);
      }
    } catch {}
    postGeminiModelPickerBridgeCancel(context, reason);
  }

  function abortActivePreferredModelRun(reason = "preferred model apply cancelled", runId = "") {
    const active = preferredModelState.activeRun;
    if (!active || (runId && active.runId !== String(runId))) return false;
    active.abortKind = reason === "preferred model apply timed out" ? "timeout" : "cancel";
    active.abortReason = String(reason || "preferred model apply cancelled");
    releasePreferredModelBridgeRun(active, active.abortReason);
    try { active.controller.abort(active.abortReason); } catch { try { active.controller.abort(); } catch {} }
    return true;
  }

  function modelResult(ok, appId, modelId, reason = "", extra = {}) {
    if (!ok && reason) console.warn(`[ChatClub] ${appId} preferred model: ${reason}`);
    const {
      skipped: rawSkipped,
      changed: rawChanged,
      cancelled: rawCancelled,
      retryable: rawRetryable,
      runId: rawRunId,
      interactionCount: rawInteractionCount,
      ...details
    } = extra || {};
    const skipped = Boolean(rawSkipped);
    const cancelled = Boolean(rawCancelled);
    const interactionCount = Math.max(0, Number(rawInteractionCount) || 0);
    return {
      ...details,
      ok: Boolean(ok),
      appId,
      modelId,
      skipped,
      changed: Boolean(rawChanged),
      cancelled,
      retryable: Boolean(rawRetryable) && !cancelled && interactionCount === 0,
      reason: String(reason || ""),
      runId: String(rawRunId || ""),
      interactionCount
    };
  }

  function preferredModelAbortReason(context) {
    if (!context) return "preferred model apply cancelled";
    return String(
      context.abortReason ||
      context.signal?.reason ||
      (contentBridgeIsCurrent() ? "preferred model apply cancelled" : "content bridge superseded")
    );
  }

  function preferredModelCancelled(context) {
    let tokenIsCurrent = false;
    try {
      tokenIsCurrent = Boolean(
        context?.bridgeToken
        && document.documentElement?.getAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE) === context.bridgeToken
      );
    } catch {}
    return !context
      || context.signal?.aborted
      || preferredModelState.activeRun !== context
      || !contentBridgeIsCurrent()
      || !tokenIsCurrent;
  }

  function assertPreferredModelRun(context) {
    if (!preferredModelCancelled(context)) return;
    const error = new Error(preferredModelAbortReason(context));
    error.name = "PreferredModelCancelledError";
    error.preferredModelCancelled = true;
    throw error;
  }

  function preferredModelResult(context, ok, appId, modelId, reason = "", extra = {}) {
    return modelResult(ok, appId, modelId, reason, {
      ...extra,
      runId: context?.runId || extra?.runId || "",
      interactionCount: context?.interactionCount || 0
    });
  }

  function preferredModelSleep(context, ms) {
    assertPreferredModelRun(context);
    return new Promise((resolve) => {
      let timer = null;
      const finish = () => {
        if (timer) clearTimeout(timer);
        try { context.signal.removeEventListener("abort", finish); } catch {}
        resolve();
      };
      timer = setTimeout(finish, Math.max(0, Number(ms) || 0));
      try { context.signal.addEventListener("abort", finish, { once: true }); } catch {}
      if (context.signal.aborted) finish();
    }).then(() => assertPreferredModelRun(context));
  }

  async function waitForPreferredModel(context, getter, timeoutMs = 2500, intervalMs = 120) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      assertPreferredModelRun(context);
      const value = getter();
      if (value) return value;
      await preferredModelSleep(context, Math.max(30, Number(intervalMs) || 30));
    }
    assertPreferredModelRun(context);
    return getter();
  }

  async function waitForModel(getter, timeoutMs = 2500, intervalMs = 120) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const value = getter();
      if (value) return value;
      await sleep(Math.max(30, Number(intervalMs) || 30));
    }
    return getter();
  }

  function requestGeminiModelPickerBridgeOpen(context, timeoutMs = 900) {
    assertPreferredModelRun(context);
    const runId = String(context.runId || "");
    const runToken = String(context.bridgeToken || "");
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        try { context.signal.removeEventListener("abort", onAbort); } catch {}
        resolve(value);
      };
      const timer = setTimeout(() => finish({ ok: false, reason: "bridge timeout" }), Math.max(300, Number(timeoutMs) || 900));
      function onMessage(event) {
        const message = event.data;
        if (
          message?.source !== GEMINI_MODEL_PICKER_SOURCE
          || message.type !== "response"
          || message.action !== "open"
          || message.id !== id
          || String(message.runId || "") !== runId
          || String(message.runToken || "") !== runToken
        ) return;
        finish(message);
      }
      const onAbort = () => finish({ ok: false, cancelled: true, reason: preferredModelAbortReason(context) });
      window.addEventListener("message", onMessage, true);
      try { context.signal.addEventListener("abort", onAbort, { once: true }); } catch {}
      try {
        assertPreferredModelRun(context);
        armPreferredModelFocusShield(context);
        window.postMessage({
          source: GEMINI_MODEL_PICKER_SOURCE,
          type: "request",
          action: "open",
          id,
          runId,
          runGeneration: context.bridgeGeneration,
          runToken
        }, "*");
      } catch (error) {
        finish({ ok: false, reason: error?.message || String(error || "bridge failed") });
      }
    }).then((result) => {
      if (result?.activated === true) context.interactionCount += 1;
      assertPreferredModelRun(context);
      return result;
    });
  }
  return Object.freeze({
    modelResult,
    preferredModelResult,
    preferredModelSleep,
    waitForPreferredModel,
    waitForModel,
    isDisabledElement,
    visibleSelectorElements,
    firstVisibleBySelectors,
    modelElementText,
    compactModelText,
    alnumModelToken,
    modelTextIncludes,
    parseBooleanAttr,
    modelRect,
    modelElementArea,
    modelRectInViewport,
    visibleInViewport,
    modelCenterPoint,
    modelElementFromPoint,
    modelClickableAncestor,
    modelCustomActivationAncestor,
    modelActivationTargets,
    modelClick,
    modelDirectClick,
    preferredModelActivate,
    preferredModelPointerActivate,
    requestGeminiModelPickerBridgeOpen,
    abortActivePreferredModelRun,
    preferredModelState,
    nextPreferredModelBridgeRunSequence,
    publishPreferredModelBridgeRun,
    releasePreferredModelBridgeRun,
    armPreferredModelFocusShield,
    preferredModelCancelled,
    preferredModelAbortReason,
    assertPreferredModelRun
  });
}
