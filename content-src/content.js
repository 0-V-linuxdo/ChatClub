import { CONTENT_PROTOCOL } from "../shared/protocol.js";
import { FRAME_COMMAND_SPECS } from "../shared/frame-commands.js";
import { DEFAULT_SHORTCUT_CONFIG } from "../shared/constants.js";
import {
  KEYBOARD_PLATFORM_MAC,
  detectKeyboardPlatform,
  matchShortcut,
  normalizeKeyboardPlatform,
  normalizeShortcutConfig
} from "../shared/shortcuts.js";
import * as summaryRuntime from "./shared/summary-runtime.js";
import { runtimeRegistry } from "./shared/runtime-registry.js";

export function installContentBridge() {
  const PROTOCOL = CONTENT_PROTOCOL;
  const runtimes = runtimeRegistry(window);
  const {
    sleep,
    normalize,
    visible,
    qsa,
    qs,
    closest,
    text,
    reveal,
    merge,
    toRegex,
    compareText,
    cleanCaptured,
    pageMeta,
    copyLooksUseful,
    hasUserAndAssistant,
    elementOrder,
    classText,
    buttonText,
    userscriptMeta,
    matches,
    userscriptLooksLikeCopyIcon,
    internalTool,
    userscriptButtonOk,
    userscriptCopyRoots,
    userscriptFindCopyButtons,
    userscriptFindMenuButtons,
    userscriptOpenCopyButtons,
    userscriptCloseMenus,
    copyMatches,
    userscriptCopyAccepted,
    pageSummaryRequest,
    pageSummaryRuntimeState,
    copyId,
    activateElement,
    copy,
    copyFirst,
    extractTurns,
    extractCopySequence,
    nodeTextForCopy,
    nativeCopyDedup,
    extractNativeCopyConversation
  } = summaryRuntime;
  const EXTENSION_API = globalThis.browser || globalThis.chrome;
  const EXTENSION_ORIGIN = (() => {
    try {
      return String(EXTENSION_API?.runtime?.getURL?.("") || "").match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i)?.[0] || "";
    } catch {
      return "";
    }
  })();
  const SOURCE = PROTOCOL.GENERIC_POST_MESSAGE_SOURCE;
  const COPY_SOURCE = PROTOCOL.NATIVE_COPY_SOURCE;
  const GEMINI_MODEL_PICKER_SOURCE = PROTOCOL.GEMINI_MODEL_PICKER_SOURCE;
  const MAIN_WORLD_LOCATION_SOURCE = PROTOCOL.MAIN_WORLD_LOCATION_SOURCE;
  const GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE = "data-chatclub-gemini-model-picker-run";
  const PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE = "data-chatclub-preferred-model-focus-shield";
  const PREFERRED_MODEL_FOCUS_SHIELD_LEASE_MS = 5000;
  const PREFERRED_MODEL_FOCUS_SHIELD_RELEASE_GRACE_MS = 400;
  const NOTION_SEND_TEXT_SOURCE = PROTOCOL.NOTION_SEND_TEXT_SOURCE;
  const NOTION_SEND_PROMPT_SOURCE = PROTOCOL.NOTION_SEND_PROMPT_SOURCE;
  const NOTION_SEND_ACTIVATED_EVENT = PROTOCOL.NOTION_SEND_ACTIVATED_EVENT;
  const CONTENT_BRIDGE_VERSION = PROTOCOL.CONTENT_BRIDGE_VERSION;
  const SEND_TEXT_POST_MESSAGE_SOURCE = PROTOCOL.SEND_TEXT_POST_MESSAGE_SOURCE;
  const DELETE_THREAD_POST_MESSAGE_SOURCE = PROTOCOL.DELETE_THREAD_POST_MESSAGE_SOURCE;
  const PREFERRED_MODEL_POST_MESSAGE_SOURCE = PROTOCOL.PREFERRED_MODEL_POST_MESSAGE_SOURCE;
  const SECURE_FRAME_COMMAND_SOURCE = PROTOCOL.SECURE_FRAME_COMMAND_SOURCE;
  const MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE = PROTOCOL.MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE;
  const SUMMARY_POST_MESSAGE_SOURCE = PROTOCOL.SUMMARY_POST_MESSAGE_SOURCE;
  const DEEPSEEK_DELETE_SOURCE = PROTOCOL.DEEPSEEK_DELETE_SOURCE;
  const PAGE_SUMMARY_SOURCE = PROTOCOL.PAGE_SUMMARY_SOURCE;
  const PROMPT_IMAGE_PASTE_STRATEGY_BATCH = "batch";
  let contentDocumentId = window.__CHATCLUB_CONTENT_DOCUMENT_ID__ ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  window.__CHATCLUB_CONTENT_DOCUMENT_ID__ = contentDocumentId;
  const secureFrameToken = window.__CHATCLUB_SECURE_FRAME_TOKEN__ || (() => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  })();
  window.__CHATCLUB_SECURE_FRAME_TOKEN__ = secureFrameToken;
  let contentLocationRevision = Math.max(
    0,
    Number(window.__CHATCLUB_CONTENT_LOCATION_REVISION__) || 0
  );
  let activeSubmissionNavigation = null;
  let preferredModelBridgeRunSequence = Math.max(
    0,
    Number(window.__CHATCLUB_PREFERRED_MODEL_BRIDGE_RUN_SEQUENCE__) || 0
  );
  let activePreferredModelRun = null;

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
    const active = activePreferredModelRun;
    if (!active || (runId && active.runId !== String(runId))) return false;
    active.abortKind = reason === "preferred model apply timed out" ? "timeout" : "cancel";
    active.abortReason = String(reason || "preferred model apply cancelled");
    releasePreferredModelBridgeRun(active, active.abortReason);
    try { active.controller.abort(active.abortReason); } catch { try { active.controller.abort(); } catch {} }
    return true;
  }
  function contentReadyData() {
    return {
      documentId: contentDocumentId,
      bridgeVersion: CONTENT_BRIDGE_VERSION,
      locationRevision: contentLocationRevision,
      href: location.href,
      title: String(document.title || "").replace(/\s+/g, " ").trim()
    };
  }

  function postContentReady() {
    try {
      window.parent.postMessage({
        source: SOURCE,
        type: "request",
        action: "contentReady",
        id: `${Date.now()}`,
        data: contentReadyData()
      }, "*");
    } catch {}
  }

  function announceContentReady() {
    return sendExtensionRuntimeMessage({
      source: SOURCE,
      action: "registerFrameContext",
      bridgeDocumentId: contentDocumentId,
      secureFrameToken,
      bridgeVersion: CONTENT_BRIDGE_VERSION
    }).catch((error) => {
      console.warn("[ChatClub] Secure frame registration failed", error);
    }).finally(postContentReady);
  }

  function postContentUnloading() {
    sendExtensionRuntimeMessage({
      source: SOURCE,
      action: "relayFrameLifecycle",
      lifecycleAction: "contentUnloading",
      bridgeDocumentId: contentDocumentId,
      data: contentReadyData()
    }).catch(() => {});
  }

  function normalizedSubmissionNavigation(value = {}) {
    const sendId = String(value?.sendId || "").trim();
    if (!sendId) return null;
    const activatedAt = Math.max(0, Number(value?.activatedAt) || Date.now());
    return {
      sendId,
      appId: String(value?.appId || "").trim(),
      initialHref: String(value?.initialHref || location.href || ""),
      activatedAt,
      expiresAt: Math.max(activatedAt + 15000, Number(value?.expiresAt) || 0),
      method: String(value?.method || "submit")
    };
  }

  function markSubmissionNavigation(data = {}, method = "submit") {
    const activatedAt = Date.now();
    const deadlineAt = Math.max(0, Number(data?.deadlineAt) || 0);
    const next = normalizedSubmissionNavigation({
      sendId: data?.sendId,
      appId: data?.appId || data?.appName,
      initialHref: location.href,
      activatedAt,
      expiresAt: Math.max(
        activatedAt + 15000,
        deadlineAt > activatedAt ? deadlineAt + 15000 : 0
      ),
      method
    });
    if (!next) return null;
    activeSubmissionNavigation = next;
    window.__CHATCLUB_ACTIVE_SUBMISSION_NAVIGATION__ = next;
    return next;
  }

  function clearSubmissionNavigation() {
    activeSubmissionNavigation = null;
    delete window.__CHATCLUB_ACTIVE_SUBMISSION_NAVIGATION__;
  }

  function submissionNavigationIntentTarget(value) {
    const element = value?.nodeType === 1 ? value : value?.parentElement;
    if (!element?.closest) return null;
    const direct = element.closest("a[href], [role='link'], [role='tab']");
    if (direct) return direct;
    const control = element.closest("button, [role='button'], [role='menuitem']");
    if (!control) return null;
    const signal = [
      control.getAttribute?.("aria-label"),
      control.getAttribute?.("title"),
      control.getAttribute?.("data-testid"),
      control.getAttribute?.("data-action"),
      control.innerText || control.textContent || ""
    ].filter(Boolean).join(" ");
    return /\b(?:new\s+chat|new\s+conversation|conversation|thread|history|sidebar)\b|新建(?:聊天|对话|会话)|聊天记录|对话|会话|历史/i.test(signal)
      ? control
      : null;
  }

  function clearSubmissionNavigationForTrustedIntent(event) {
    if (!event?.isTrusted || !currentSubmissionNavigation("trusted-intent")) return;
    const target = submissionNavigationIntentTarget(event.target);
    const key = String(event.key || "");
    const keyboardNavigation = event.type === "keydown" && (
      (event.altKey && (key === "ArrowLeft" || key === "ArrowRight"))
      || ((event.metaKey || event.ctrlKey) && (key === "[" || key === "]"))
      || ((key === "Enter" || key === " ") && target)
    );
    if (event.type === "pointerdown" ? target : keyboardNavigation) clearSubmissionNavigation();
  }

  function currentSubmissionNavigation(kind = "") {
    const navigationKind = String(kind || "navigation");
    if (navigationKind === "popstate" || navigationKind === "hashchange") return null;
    const candidate = activeSubmissionNavigation
      || normalizedSubmissionNavigation(window.__CHATCLUB_ACTIVE_SUBMISSION_NAVIGATION__ || {});
    if (!candidate || candidate.expiresAt < Date.now()) {
      activeSubmissionNavigation = null;
      delete window.__CHATCLUB_ACTIVE_SUBMISSION_NAVIGATION__;
      return null;
    }
    activeSubmissionNavigation = candidate;
    return candidate;
  }

  function postLocationChanged(data = {}) {
    sendExtensionRuntimeMessage({
      source: SOURCE,
      action: "relayFrameLifecycle",
      lifecycleAction: "locationChanged",
      bridgeDocumentId: contentDocumentId,
      data
    }).catch((error) => console.warn("[ChatClub] Frame lifecycle relay failed", error));
  }

  const hadContentBridge = Boolean(window.__CHATCLUB_CONTENT_BRIDGE_INSTALLED__);
  if (window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ === CONTENT_BRIDGE_VERSION) {
    announceContentReady();
    return;
  }
  try { document.documentElement?.removeAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE); } catch {}
  window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ = CONTENT_BRIDGE_VERSION;
  window.__CHATCLUB_CONTENT_BRIDGE_INSTALLED__ = true;

  function contentBridgeIsCurrent() {
    return window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ === CONTENT_BRIDGE_VERSION;
  }

  try { window.__CHATCLUB_LOCATION_REPORT_CLEANUP__?.(); } catch {}
  let lastReportedHref = String(location.href || "");
  function reportLocationChange(reportedHref = "", force = false, metadata = {}) {
    const href = String(reportedHref || location.href || "");
    if (metadata?.requireCurrentHref && href !== String(location.href || "")) return;
    if (!href || (!force && href === lastReportedHref)) return;
    const previousHref = lastReportedHref;
    lastReportedHref = href;
    abortActivePreferredModelRun("navigation changed");
    contentLocationRevision += 1;
    window.__CHATCLUB_CONTENT_LOCATION_REVISION__ = contentLocationRevision;
    const kind = String(metadata?.kind || "navigation");
    const submission = currentSubmissionNavigation(kind);
    postLocationChanged({
      ...contentReadyData(),
      href,
      previousHref,
      navigation: {
        kind,
        forced: Boolean(force),
        revision: contentLocationRevision,
        at: Math.max(0, Number(metadata?.at) || Date.now()),
        ...(submission ? {
          submission: {
            sendId: submission.sendId,
            appId: submission.appId,
            initialHref: submission.initialHref,
            activatedAt: submission.activatedAt,
            method: submission.method
          }
        } : {})
      }
    });
  }
  const locationReportController = new AbortController();
  const locationReportOptions = { capture: true, signal: locationReportController.signal };
  window.addEventListener("pointerdown", clearSubmissionNavigationForTrustedIntent, locationReportOptions);
  window.addEventListener("keydown", clearSubmissionNavigationForTrustedIntent, locationReportOptions);
  window.addEventListener(NOTION_SEND_ACTIVATED_EVENT, (event) => {
    let detail = event?.detail;
    try {
      if (typeof detail === "string") detail = JSON.parse(detail);
    } catch {
      detail = null;
    }
    if (!detail || typeof detail !== "object") return;
    markSubmissionNavigation(detail, detail.method || "notion-submit");
  }, locationReportOptions);
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message?.source !== MAIN_WORLD_LOCATION_SOURCE || message.type !== "notification" || message.action !== "locationChanged") return;
    reportLocationChange(message.href, message.force === true, {
      kind: message.kind,
      at: message.at,
      requireCurrentHref: true
    });
  }, locationReportOptions);
  window.addEventListener("pagehide", () => {
    abortActivePreferredModelRun("navigation changed");
    clearSubmissionNavigation();
    postContentUnloading();
  }, locationReportOptions);
  window.addEventListener("pageshow", () => announceContentReady(), locationReportOptions);
  const locationReportTimer = setInterval(() => {
    reportLocationChange("", false, { kind: "poll", at: Date.now() });
  }, 800);
  window.__CHATCLUB_LOCATION_REPORT_CLEANUP__ = () => {
    clearInterval(locationReportTimer);
    locationReportController.abort();
  };

  function respond(source, id, action, data, error, responseSource = SOURCE) {
    if (!EXTENSION_ORIGIN) return;
    source?.postMessage({ source: responseSource, type: "response", id, action, data, error }, EXTENSION_ORIGIN);
  }

  const ACTIVE_KEYBOARD_PLATFORM = detectKeyboardPlatform();
  let activeShortcutConfig = normalizeShortcutConfig(DEFAULT_SHORTCUT_CONFIG);

  function eventMatchesKagiNativeDeleteShortcut(event, platform = ACTIVE_KEYBOARD_PLATFORM) {
    if (event.code !== "Backspace" || event.altKey || !event.shiftKey) return false;
    return normalizeKeyboardPlatform(platform) === KEYBOARD_PLATFORM_MAC
      ? Boolean(event.metaKey) && !event.ctrlKey
      : Boolean(event.ctrlKey) && !event.metaKey;
  }

  async function loadShortcutConfig() {
    try {
      const stored = await EXTENSION_API?.storage?.local?.get("shortcutConfig");
      activeShortcutConfig = normalizeShortcutConfig(stored.shortcutConfig);
    } catch {}
  }

  function postShortcutTriggered(match) {
    sendExtensionRuntimeMessage({
      source: SOURCE,
      action: "relayShortcutTriggered",
      bridgeDocumentId: contentDocumentId,
      shortcutAction: String(match?.action || ""),
      matchObj: match?.matchObj || {}
    }).catch((error) => console.warn("[ChatClub] Shortcut relay failed", error));
  }

  function shouldBridgeShortcut(match, event) {
    const action = String(match?.action || "");
    const host = String(location.hostname || "").toLowerCase();
    if (action === "deleteThread" && host === "assistant.kagi.com" && eventMatchesKagiNativeDeleteShortcut(event)) {
      return false;
    }
    return true;
  }


  function inputCandidates(selector) {
    const selectors = [
      selector,
      "textarea",
      "div[contenteditable='true'][role='textbox']",
      "div[contenteditable='true']",
      "input[type='text']"
    ].filter(Boolean);
    for (const sel of selectors) {
      const candidate = qsa(sel).filter(visible).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      if (candidate) return candidate;
    }
    return null;
  }

  async function setInputValue(target, value) {
    target.focus?.();
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      try {
        const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        if (descriptor?.set) descriptor.set.call(target, value);
        else target.value = value;
      } catch {
        target.value = value;
      }
      try {
        const length = String(value || "").length;
        target.setSelectionRange?.(length, length);
      } catch {}
      try {
        target.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, composed: true, inputType: "insertText", data: String(value || "") }));
      } catch {
        target.dispatchEvent(new Event("input", { bubbles: true }));
      }
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function submitButtonLabel(button) {
    return normalize([
      button?.getAttribute?.("aria-label"),
      button?.getAttribute?.("title"),
      button?.getAttribute?.("data-testid"),
      button?.getAttribute?.("data-test-id"),
      button?.getAttribute?.("type"),
      button?.innerText,
      button?.textContent
    ].filter(Boolean).join(" "));
  }

  function submitButtonExcluded(button) {
    const label = submitButtonLabel(button).toLowerCase();
    return /\b(close|cancel|delete|remove|clear|dismiss|stop|attach|upload|file|image|photo)\b|关闭|取消|删除|移除|清空|停止|上传/.test(label);
  }

  function submitButtonScore(button, inputRect = null, explicit = false) {
    const label = submitButtonLabel(button).toLowerCase();
    let score = explicit ? 500 : 0;
    if (button?.matches?.("button[data-testid='send-button']")) score += 900;
    if (/submit\s+ai\s+message/.test(label)) score += 760;
    if (/^(send|发送|提交)$/.test(label)) score += 700;
    if (button?.matches?.("button[type='submit']")) score += 420;
    if (/\b(send|submit)\b|发送|提交/.test(label)) score += 320;
    if (inputRect && button?.getBoundingClientRect) {
      const rect = button.getBoundingClientRect();
      const yDistance = Math.abs((rect.top + rect.bottom) / 2 - (inputRect.top + inputRect.bottom) / 2);
      const rightDelta = rect.left - inputRect.left;
      score += Math.max(0, 240 - yDistance);
      if (rightDelta > 0) score += Math.min(180, rightDelta / 4);
      if (rect.bottom >= inputRect.top - 80 && rect.top <= inputRect.bottom + 120) score += 180;
    }
    return score;
  }

  function submitCandidates(selector, input) {
    const inputRect = input?.getBoundingClientRect?.() || null;
    const explicit = qsa(selector).filter(visible);
    const generic = qsa([
      "button[data-testid='send-button']",
      "button[data-testid*='send' i]",
      "button[data-test-id*='send' i]",
      "button[aria-label*='Send' i]",
      "button[aria-label*='Submit' i]",
      "button[aria-label*='发送' i]",
      "button[aria-label*='提交' i]",
      "button[title*='Send' i]",
      "button[title*='Submit' i]",
      "button[type='submit']",
      "[role='button'][aria-label*='Send' i]",
      "[role='button'][aria-label*='Submit' i]",
      "[role='button'][data-testid*='send' i]",
      "[role='button'][data-test-id*='send' i]"
    ].join(",")).filter(visible);
    const seen = new Set();
    const candidates = [];
    for (const entry of [...explicit.map((button) => [button, true]), ...generic.map((button) => [button, false])]) {
      const [button, isExplicit] = entry;
      if (!button || seen.has(button) || submitButtonExcluded(button)) continue;
      const score = submitButtonScore(button, inputRect, isExplicit);
      if (!isExplicit && score <= 0) continue;
      seen.add(button);
      candidates.push({ button, score });
    }
    return candidates
      .sort((a, b) => b.score - a.score)
      .map((item) => item.button);
  }

  function clickPromptSubmit(button) {
    if (!button) return false;
    try { button.scrollIntoView?.({ block: "nearest", inline: "nearest" }); } catch {}
    try { button.focus?.({ preventScroll: true }); } catch {}
    // Keep one semantic activation: dispatching a synthetic click and then calling click() submits ChatGPT twice.
    if (typeof button.click === "function") {
      try {
        button.click();
        return true;
      } catch {
        return false;
      }
    }
    try {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, view: window }));
      return true;
    } catch {
      return false;
    }
  }

  async function waitForPromptSubmitReady(input, selector = "", deadlineAt = 0, timeoutMs = 10000) {
    const endAt = Math.min(
      Date.now() + Math.max(1000, Number(timeoutMs) || 10000),
      Number(deadlineAt) > Date.now() ? Number(deadlineAt) : Date.now() + Math.max(1000, Number(timeoutMs) || 10000)
    );
    let last = null;
    while (Date.now() < endAt) {
      last = submitCandidates(selector, input);
      const ready = last.find((button) => !isDisabledElement(button));
      if (ready) return ready;
      await sleep(Math.min(140, Math.max(0, endAt - Date.now())));
    }
    last = submitCandidates(selector, input);
    return last.find((button) => !isDisabledElement(button)) || null;
  }

  function inferImageExtension(mime) {
    const value = String(mime || "").trim().toLowerCase();
    if (value === "image/jpeg") return "jpg";
    if (value === "image/png") return "png";
    if (value === "image/webp") return "webp";
    if (value === "image/gif") return "gif";
    if (value === "image/bmp") return "bmp";
    if (value === "image/svg+xml") return "svg";
    if (value === "image/avif") return "avif";
    const tail = value.split("/").pop();
    return tail ? tail.replace(/[^a-z0-9]+/gi, "") || "png" : "png";
  }

  function inferMimeFromDataUrl(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;,]+)[;,]/i);
    return match ? match[1].toLowerCase() : "";
  }

  function promptImageDataUrlToFile(entry = {}, index = 0) {
    const dataUrl = String(entry.dataUrl || entry.dataURL || "").trim();
    if (!/^data:image\//i.test(dataUrl)) return null;
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex < 0) return null;
    const meta = dataUrl.slice(5, commaIndex);
    const payload = dataUrl.slice(commaIndex + 1);
    const type = String(entry.type || "").trim() || inferMimeFromDataUrl(dataUrl) || "image/png";
    const name = String(entry.name || "").trim() || `prompt-image-${index + 1}.${inferImageExtension(type)}`;
    const lastModifiedRaw = Number(entry.lastModified);
    const lastModified = Number.isFinite(lastModifiedRaw) ? lastModifiedRaw : Date.now();
    try {
      let bytes;
      if (/(?:^|;)base64(?:;|$)/i.test(meta)) {
        const binary = atob(payload);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } else {
        bytes = new TextEncoder().encode(decodeURIComponent(payload));
      }
      return new File([bytes], name, { type, lastModified });
    } catch {
      return null;
    }
  }

  function promptImageFilesFromPayload(images = []) {
    return (Array.isArray(images) ? images : [])
      .map((entry, index) => promptImageDataUrlToFile(entry, index))
      .filter((file) => file && String(file.type || "").startsWith("image/"));
  }

  function createPromptDataTransfer({ text = "", files = [] } = {}) {
    if (typeof DataTransfer !== "function") return null;
    try {
      const transfer = new DataTransfer();
      for (const file of files || []) transfer.items.add(file);
      if (text) {
        try { transfer.setData("text/plain", String(text)); } catch {}
      }
      return transfer;
    } catch {
      return null;
    }
  }

  function dispatchPromptTransferEvent(target, type, transfer, options = {}) {
    if (!target || type !== "paste") return false;
    const init = { bubbles: options.bubbles !== false, cancelable: true, composed: true };
    let event = null;
    try {
      if (typeof ClipboardEvent === "function") {
        event = new ClipboardEvent("paste", { ...init, clipboardData: transfer });
      }
    } catch {}
    if (!event) {
      try { event = new Event(type, init); } catch { event = null; }
    }
    if (!event) return false;
    if (transfer) {
      try { Object.defineProperty(event, "clipboardData", { value: transfer, configurable: true }); } catch {}
      if (options.exposeDataTransfer !== false) {
        try { Object.defineProperty(event, "dataTransfer", { value: transfer, configurable: true }); } catch {}
      }
    }
    try {
      target.dispatchEvent(event);
      return true;
    } catch {
      return false;
    }
  }

  function promptComposerScope(input) {
    if (!input) return document.body || document.documentElement || document;
    return input.closest?.("form")
      || input.closest?.("[data-testid*='composer' i],[data-test-id*='composer' i],[class*='composer' i],[class*='input-area' i],[class*='InputArea']")
      || input.parentElement?.parentElement
      || input.parentElement
      || document.body
      || document.documentElement
      || document;
  }

  function grokHost(hostname = location.hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai");
  }

  function isGrokSendTarget(data = {}) {
    const appId = String(data?.appId || "").trim().toLowerCase();
    const appName = String(data?.appName || "").trim().toLowerCase();
    return appId === "grok" || appName === "grok" || grokHost();
  }

  function kagiHost(hostname = location.hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "assistant.kagi.com";
  }

  function isKagiSendTarget(data = {}) {
    const appId = String(data?.appId || "").trim().toLowerCase();
    const appName = String(data?.appName || "").trim().toLowerCase();
    return appId === "kagi" || /\bkagi\b/.test(appName) || kagiHost();
  }

  function geminiHost(hostname = location.hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "gemini.google.com" || host.endsWith(".gemini.google.com");
  }

  function isGeminiSendTarget(data = {}) {
    const appId = String(data?.appId || "").trim().toLowerCase();
    const appName = String(data?.appName || "").trim().toLowerCase();
    return appId === "gemini" || /\bgemini\b/.test(appName) || geminiHost();
  }

  function promptImagePasteStrategy(data = {}) {
    return String(data?.imagePasteStrategy || "").trim().toLowerCase() === PROMPT_IMAGE_PASTE_STRATEGY_BATCH
      ? PROMPT_IMAGE_PASTE_STRATEGY_BATCH
      : "sequential";
  }

  function grokComposerScope(input) {
    if (!input) return promptComposerScope(input);
    let best = null;
    for (let node = input.parentElement, depth = 0; node && node !== document.body && depth < 8; node = node.parentElement, depth += 1) {
      const controls = qsa("button,[role='button']", node).filter(visible);
      const label = controls.map((button) => buttonText(button)).join(" ");
      if (/附件|attach|model|模型|submit|send|提交|发送|voice|听写/i.test(label)) best = node;
      if (/移除此附件|remove\s+(?:this\s+)?attachment/i.test(label)) return node;
    }
    return best || promptComposerScope(input);
  }

  function geminiComposerScope(input) {
    if (!input) return promptComposerScope(input);
    let best = null;
    for (let node = input.parentElement, depth = 0; node && node !== document.body && depth < 10; node = node.parentElement, depth += 1) {
      const controls = qsa("button,[role='button']", node).filter(visible);
      const labels = controls.map((button) => buttonText(button)).join(" ");
      const hasUpload = /upload\s*(?:&|and)?\s*tools|\bupload\b|上传/i.test(labels);
      const hasSend = /send\s*message|\bsend\b|发送|提交/i.test(labels);
      const hasComposerControl = /microphone|mode\s*picker|麦克风|模式/i.test(labels);
      if (hasUpload && hasSend) return node;
      if (hasUpload && hasComposerControl) best = node;
    }
    return best || promptComposerScope(input);
  }

  function attachmentRemoveButton(button) {
    const label = buttonText(button).toLowerCase();
    return /^(?:remove|delete|移除|删除)$|remove\s+(?:this\s+)?(?:attachment|file|image|photo)|delete\s+(?:attachment|file|image|photo)|(?:remove|delete)\s+[^\n]{1,180}\.(?:avif|bmp|gif|jpe?g|png|svg|webp)\b|移除此附件|移除.*(?:附件|文件|图片|照片)|删除.*(?:附件|文件|图片|照片)/i.test(label);
  }

  function geminiAttachmentCloseButton(button) {
    const label = buttonText(button).toLowerCase();
    return /close\s+(?:this\s+)?attachment|关闭(?:此)?附件/i.test(label);
  }

  function geminiAttachmentRows(scope) {
    const controls = qsa("button,[role='button']", scope)
      .filter((button) => visible(button) && (geminiAttachmentCloseButton(button) || attachmentRemoveButton(button)));
    const images = qsa("img[alt='attachment' i],img[aria-label='attachment' i]", scope).filter(visible);
    return controls.length >= images.length ? controls : images;
  }

  function geminiPromptAttachmentSnapshot(input) {
    const scope = geminiComposerScope(input);
    const rows = geminiAttachmentRows(scope);
    const busySelectors = [
      "[aria-busy='true']",
      "[role='progressbar']",
      "progress",
      "mat-progress-spinner",
      "mat-progress-bar"
    ].join(",");
    let busy = false;
    try {
      busy = Array.from(scope.querySelectorAll(busySelectors)).some((node) => visible(node));
      if (!busy) {
        busy = qsa("[aria-label],[title],span,div", scope).some((node) => {
          if (!visible(node)) return false;
          const explicit = normalize([node.getAttribute?.("aria-label"), node.getAttribute?.("title")].filter(Boolean).join(" "));
          const leafText = node.children?.length ? "" : normalize(node.textContent || "");
          return /^(?:loading image|uploading(?: image| file)?|正在加载图片|正在上传)/i.test(explicit || leafText);
        });
      }
    } catch {}
    return {
      count: rows.length,
      busy,
      key: rows.map((node) => {
        const rect = node.getBoundingClientRect?.();
        const image = node.matches?.("img") ? node : node.querySelector?.("img[alt='attachment' i],img[aria-label='attachment' i]");
        return [
          node.tagName,
          buttonText(node),
          image?.getAttribute?.("src") || "",
          rect ? `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}` : ""
        ].join("|");
      }).join("\n")
    };
  }

  function promptAttachmentSnapshot(input, options = {}) {
    if (options.grok) return grokPromptAttachmentSnapshot(input);
    if (options.gemini) return geminiPromptAttachmentSnapshot(input);
    const scope = promptComposerScope(input);
    const selectors = [
      "img[src^='blob:']",
      "img[src^='data:image/']",
      "[data-testid*='attachment' i]",
      "[data-testid*='file' i]",
      "[data-test-id*='attachment' i]",
      "[data-test-id*='file' i]",
      "[aria-label*='remove file' i]",
      "[aria-label*='remove image' i]",
      "[aria-label*='delete file' i]",
      "[aria-label*='delete image' i]",
      "[class*='attachment' i]",
      "[class*='file-preview' i]",
      "[class*='image-preview' i]",
      "mat-chip"
    ].join(",");
    let nodes = [];
    try { nodes = Array.from(scope.querySelectorAll(selectors)); } catch {}
    nodes = nodes.filter((node) => node && node !== input && visible(node));
    const busySelectors = [
      "[aria-busy='true']",
      "[role='progressbar']",
      "progress",
      "mat-progress-spinner",
      "mat-progress-bar",
      "[class*='uploading' i]",
      "[class*='loading' i]"
    ].join(",");
    let busy = false;
    try {
      busy = Array.from(scope.querySelectorAll(busySelectors)).some((node) => visible(node));
    } catch {}
    return {
      count: nodes.length,
      busy,
      key: nodes.map((node) => {
        const rect = node.getBoundingClientRect?.();
        return [
          node.tagName,
          node.getAttribute?.("src") || "",
          node.getAttribute?.("aria-label") || "",
          rect ? `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}` : ""
        ].join("|");
      }).join("\n")
    };
  }

  function grokAttachmentRows(scope) {
    const rows = [];
    const seen = new Set();
    const add = (node) => {
      if (!node || node === scope || seen.has(node) || !visible(node)) return;
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (row === node || row.contains?.(node)) return;
        if (node.contains?.(row)) {
          rows[index] = node;
          seen.add(node);
          return;
        }
      }
      seen.add(node);
      rows.push(node);
    };
    const removeButtons = qsa("button,[role='button']", scope).filter((button) => visible(button) && attachmentRemoveButton(button));
    for (const button of removeButtons) {
      add(button.closest?.("li,[role='listitem'],[data-testid*='attachment' i],[data-test-id*='attachment' i],[class*='attachment' i],[class*='file' i]") || button.parentElement);
    }
    const inputRect = qsa("textarea,[contenteditable='true']", scope).filter(visible).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0]?.getBoundingClientRect?.() || null;
    const tileButtons = qsa("button,[role='button']", scope).filter((button) => {
      if (!visible(button) || attachmentRemoveButton(button)) return false;
      const rect = button.getBoundingClientRect?.();
      if (!rect || rect.width < 18 || rect.height < 18 || rect.width > 96 || rect.height > 96) return false;
      if (inputRect && (rect.bottom < inputRect.top - 140 || rect.top > inputRect.top + 80)) return false;
      if (inputRect && rect.top >= inputRect.top - 8) return false;
      if (!qsa("img,svg,canvas,[role='progressbar'],progress", button).some(visible)) return false;
      const label = buttonText(button).toLowerCase();
      return !/(attach|附件|model|模型|voice|听写|send|submit|发送|提交|plus|\+|add)/i.test(label);
    });
    for (const button of tileButtons) add(button.closest?.("li,[role='listitem'],[data-testid*='attachment' i],[data-test-id*='attachment' i],[class*='attachment' i],[class*='file' i]") || button);
    if (rows.length) return rows;
    for (const list of qsa("[aria-label*='attachment' i],[aria-label*='附件' i],[role='list']", scope).filter(visible)) {
      for (const child of Array.from(list.children || [])) {
        if (qsa("img,button,[role='button']", child).some(visible)) add(child);
      }
    }
    if (rows.length) return rows;
    for (const image of qsa("img[src^='blob:'],img[src^='data:image/']", scope).filter(visible)) {
      add(image.closest?.("[data-testid*='attachment' i],[data-test-id*='attachment' i],[class*='attachment' i],[class*='file' i],li,[role='listitem']") || image.parentElement);
    }
    return rows;
  }

  function grokPromptAttachmentSnapshot(input) {
    const scope = grokComposerScope(input);
    const rows = grokAttachmentRows(scope);
    const busySelectors = [
      "[aria-busy='true']",
      "[role='progressbar']",
      "progress",
      "[class*='uploading' i]",
      "[class*='loading' i]",
      "[class*='pending' i]"
    ].join(",");
    let busy = false;
    try {
      busy = Array.from(scope.querySelectorAll(busySelectors)).some((node) => visible(node));
    } catch {}
    return {
      count: rows.length,
      busy,
      key: rows.map((node) => {
        const rect = node.getBoundingClientRect?.();
        return [
          node.tagName,
          buttonText(node),
          rect ? `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}` : ""
        ].join("|");
      }).join("\n")
    };
  }

  function sendDeadlineAt(data = {}, fallbackMs = 10000) {
    const value = Number(data?.deadlineAt);
    return Number.isFinite(value) && value > Date.now() ? value : Date.now() + Math.max(1000, Number(fallbackMs) || 10000);
  }

  function remainingDeadlineMs(deadlineAt, fallbackMs = 1000) {
    const value = Number(deadlineAt);
    if (!Number.isFinite(value) || value <= 0) return Math.max(0, Number(fallbackMs) || 0);
    return Math.max(0, value - Date.now());
  }

  function deadlineExpired(deadlineAt) {
    return remainingDeadlineMs(deadlineAt, 1) <= 0;
  }

  async function sleepUntilDeadline(ms, deadlineAt) {
    const delay = Math.min(Math.max(0, Number(ms) || 0), remainingDeadlineMs(deadlineAt, ms));
    if (delay <= 0) return false;
    await sleep(delay);
    return !deadlineExpired(deadlineAt);
  }

  async function waitForPromptImagesReady(input, expectedCount, timeoutMs = 45000, deadlineAt = 0, options = {}) {
    const expected = Math.max(1, Number(expectedCount) || 1);
    const start = Date.now();
    let stableSince = 0;
    let lastKey = "";
    let last = promptAttachmentSnapshot(input, options);
    while (Date.now() - start < timeoutMs && !deadlineExpired(deadlineAt)) {
      last = promptAttachmentSnapshot(input, options);
      if (options.exactCount && last.count > expected && !last.busy) {
        return { ok: false, reason: "Image attachment count exceeded expected count", overflow: true, snapshot: last };
      }
      const enough = options.exactCount ? last.count === expected : last.count >= expected;
      const same = last.key === lastKey;
      if (enough && !last.busy) {
        if (!same) stableSince = Date.now();
        if (Date.now() - stableSince >= 550) return { ok: true, snapshot: last };
      } else {
        stableSince = 0;
      }
      lastKey = last.key;
      if (!await sleepUntilDeadline(180, deadlineAt)) break;
    }
    return { ok: false, reason: deadlineExpired(deadlineAt) ? "Send deadline exceeded" : "timeout", snapshot: last };
  }

  function clearPromptAttachments(input, options = {}) {
    const scope = options.grok
      ? grokComposerScope(input)
      : options.gemini
        ? geminiComposerScope(input)
        : promptComposerScope(input);
    const selectors = [
      "button[aria-label*='remove file' i]",
      "button[aria-label*='remove image' i]",
      "button[aria-label*='remove attachment' i]",
      "button[aria-label*='remove this attachment' i]",
      "button[aria-label*='delete file' i]",
      "button[aria-label*='delete image' i]",
      "button[aria-label*='移除此附件' i]",
      "button[aria-label*='移除' i]",
      "button[aria-label*='删除' i]",
      "button[title*='remove' i]",
      "button[title*='delete' i]",
      "button[title*='移除此附件' i]",
      "button[title*='移除' i]",
      "button[title*='删除' i]",
      "button[aria-label*='close attachment' i]",
      "button[title*='close attachment' i]"
    ].join(",");
    let clicked = 0;
    try {
      const candidates = [];
      const seen = new Set();
      const add = (button) => {
        if (!button || seen.has(button)) return;
        seen.add(button);
        candidates.push(button);
      };
      try { Array.from(scope.querySelectorAll(selectors)).forEach(add); } catch {}
      const attachmentAction = (button) => attachmentRemoveButton(button) || (options.gemini && geminiAttachmentCloseButton(button));
      try { Array.from(scope.querySelectorAll("button,[role='button']")).filter(attachmentAction).forEach(add); } catch {}
      for (const button of candidates.filter((item) => visible(item) && attachmentAction(item)).slice(0, 20)) {
        try { button.click?.(); clicked += 1; } catch {}
      }
    } catch {}
    return clicked;
  }

  async function waitForPromptAttachmentsCleared(input, options = {}, timeoutMs = 2500, deadlineAt = 0) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs && !deadlineExpired(deadlineAt)) {
      const snapshot = promptAttachmentSnapshot(input, options);
      if (snapshot.count <= 0 && !snapshot.busy) return true;
      if (!await sleepUntilDeadline(120, deadlineAt)) break;
    }
    return promptAttachmentSnapshot(input, options).count <= 0;
  }

  async function attachPromptImageOnce(file, input) {
    input?.focus?.();
    const transfer = createPromptDataTransfer({ files: [file] });
    if (!transfer) return { ok: false, reason: "DataTransfer unavailable" };
    const target = input || document.activeElement;
    const fired = dispatchPromptTransferEvent(target, "paste", transfer);
    return fired ? { ok: true } : { ok: false, reason: "Paste image insertion was not accepted" };
  }

  async function attachGrokPromptImagesOnce(files, input, textValue = "") {
    input?.focus?.();
    const transfer = createPromptDataTransfer({ files, text: textValue });
    if (!transfer) return { ok: false, reason: "DataTransfer unavailable" };
    const target = input || document.activeElement || grokComposerScope(input);
    const fired = dispatchPromptTransferEvent(target, "paste", transfer, { exposeDataTransfer: false, bubbles: false });
    return fired ? { ok: true } : { ok: false, reason: "Grok image paste was not accepted" };
  }

  async function attachKagiPromptImagesOnce(files, input, textValue = "") {
    input?.focus?.();
    const transfer = createPromptDataTransfer({ files, text: textValue });
    if (!transfer) return { ok: false, reason: "DataTransfer unavailable" };
    const target = input || document.activeElement;
    const fired = dispatchPromptTransferEvent(target, "paste", transfer);
    return fired ? { ok: true } : { ok: false, reason: "Kagi image and text paste was not accepted" };
  }

  async function attachGeminiPromptImagesOnce(files, input, textValue = "") {
    input?.focus?.();
    const transfer = createPromptDataTransfer({ files, text: textValue });
    if (!transfer) return { ok: false, reason: "DataTransfer unavailable" };
    const target = input || document.activeElement;
    const fired = dispatchPromptTransferEvent(target, "paste", transfer);
    return fired ? { ok: true } : { ok: false, reason: "Gemini image and text paste was not accepted" };
  }

  async function attachBatchPromptImagesOnce(files, input) {
    input?.focus?.();
    const transfer = createPromptDataTransfer({ files });
    if (!transfer) return { ok: false, reason: "DataTransfer unavailable" };
    const target = input || document.activeElement;
    const fired = dispatchPromptTransferEvent(target, "paste", transfer);
    return fired ? { ok: true } : { ok: false, reason: "Batch image paste was not accepted" };
  }

  function promptImageSendTimeoutMs(data = {}, fallbackMs = 65000) {
    const hasImages = Array.isArray(data?.images) && data.images.length > 0;
    if (!hasImages) return fallbackMs;
    return 60000;
  }

  async function attachPromptImagesWithRetries(input, files = [], retryCount = 3, inputSelector = "", deadlineAt = 0) {
    const list = Array.from(files || []).filter((file) => file && String(file.type || "").startsWith("image/"));
    if (!list.length) return { ok: true };
    const attempts = Math.max(0, Number(retryCount) || 0) + 1;
    let lastReason = "";
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
      if (attempt > 1) {
        clearPromptAttachments(input);
        if (!await waitForPromptAttachmentsCleared(input, {}, 2500, deadlineAt)) {
          return { ok: false, reason: "Batch attachments could not be cleared before retry" };
        }
        if (!await sleepUntilDeadline(450, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        input = inputCandidates(inputSelector) || input;
      }
      const baseline = promptAttachmentSnapshot(input);
      for (const file of list) {
        if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        const result = await attachPromptImageOnce(file, input);
        if (!result.ok) lastReason = result.reason || "Image insertion failed";
        if (!await sleepUntilDeadline(160, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
      }
      const ready = await waitForPromptImagesReady(input, baseline.count + list.length, Math.min(45000, remainingDeadlineMs(deadlineAt, 45000)), deadlineAt);
      if (ready.ok) return { ok: true, attempts: attempt, snapshot: ready.snapshot };
      lastReason = ready.reason || "Image upload did not become ready";
    }
    return { ok: false, reason: lastReason || "Image upload did not become ready" };
  }

  async function attachBatchPromptImagesWithRetries(input, files = [], retryCount = 3, inputSelector = "", deadlineAt = 0) {
    const list = Array.from(files || []).filter((file) => file && String(file.type || "").startsWith("image/"));
    if (!list.length) return { ok: true };
    const attempts = Math.max(0, Number(retryCount) || 0) + 1;
    let lastReason = "";
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
      if (attempt > 1) {
        clearPromptAttachments(input);
        if (!await sleepUntilDeadline(450, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        input = inputCandidates(inputSelector) || input;
      }
      const baseline = promptAttachmentSnapshot(input);
      const result = await attachBatchPromptImagesOnce(list, input);
      if (!result.ok) lastReason = result.reason || "Batch image insertion failed";
      if (!await sleepUntilDeadline(220, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
      const ready = await waitForPromptImagesReady(input, baseline.count + list.length, Math.min(45000, remainingDeadlineMs(deadlineAt, 45000)), deadlineAt);
      if (ready.ok) return { ok: true, attempts: attempt, snapshot: ready.snapshot };
      lastReason = ready.reason || "Batch image upload did not become ready";
    }
    return { ok: false, reason: lastReason || "Batch image upload did not become ready" };
  }

  async function commitPastedPromptTextEarly(input, textValue = "", inputSelector = "", deadlineAt = 0) {
    const expected = compareText(textValue);
    if (!expected) return { ok: true, input, usedFallback: false };
    if (!await sleepUntilDeadline(80, deadlineAt)) return { ok: false, input, usedFallback: false, reason: "Send deadline exceeded" };
    input = inputCandidates(inputSelector) || input;
    if (compareText(text(input)) === expected) return { ok: true, input, usedFallback: false };
    try {
      await setInputValue(input, textValue);
    } catch (error) {
      return { ok: false, input, usedFallback: true, reason: error?.message || "Prompt text fallback failed" };
    }
    if (!await sleepUntilDeadline(90, deadlineAt)) return { ok: false, input, usedFallback: true, reason: "Send deadline exceeded" };
    input = inputCandidates(inputSelector) || input;
    return {
      ok: compareText(text(input)) === expected,
      input,
      usedFallback: true,
      reason: compareText(text(input)) === expected ? "" : "Prompt text was not committed immediately after paste"
    };
  }

  async function attachGeminiPromptImagesWithRetries(input, files = [], retryCount = 3, inputSelector = "", deadlineAt = 0, textValue = "") {
    const list = Array.from(files || []).filter((file) => file && String(file.type || "").startsWith("image/"));
    if (!list.length) return { ok: true, input };
    const attempts = Math.max(0, Number(retryCount) || 0) + 1;
    let lastReason = "";
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
      if (attempt > 1) {
        clearPromptAttachments(input, { gemini: true });
        if (!await waitForPromptAttachmentsCleared(input, { gemini: true }, 2500, deadlineAt)) {
          return { ok: false, reason: "Gemini attachments could not be cleared before retry" };
        }
        input = inputCandidates(inputSelector) || input;
        if (textValue.trim()) {
          await setInputValue(input, "");
          if (!await sleepUntilDeadline(120, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
          input = inputCandidates(inputSelector) || input;
        }
      }
      const baseline = promptAttachmentSnapshot(input, { gemini: true });
      const result = await attachGeminiPromptImagesOnce(list, input, textValue);
      if (!result.ok) lastReason = result.reason || "Gemini image and text insertion failed";
      const earlyText = await commitPastedPromptTextEarly(input, textValue, inputSelector, deadlineAt);
      input = earlyText.input || input;
      const ready = await waitForPromptImagesReady(
        input,
        baseline.count + list.length,
        Math.min(45000, remainingDeadlineMs(deadlineAt, 45000)),
        deadlineAt,
        { gemini: true, exactCount: true }
      );
      if (ready.ok && earlyText.ok) return { ok: true, attempts: attempt, snapshot: ready.snapshot, input };
      lastReason = ready.overflow
        ? "Gemini attached duplicate image files"
        : !earlyText.ok
          ? earlyText.reason || "Gemini prompt text was not committed immediately after paste"
          : ready.reason || "Gemini image upload did not become ready";
    }
    return { ok: false, reason: lastReason || "Gemini image and text upload did not become ready" };
  }

  async function attachGrokPromptImagesWithRetries(input, files = [], retryCount = 3, inputSelector = "", deadlineAt = 0, textValue = "") {
    const list = Array.from(files || []).filter((file) => file && String(file.type || "").startsWith("image/"));
    if (!list.length) return { ok: true };
    const attempts = Math.min(2, Math.max(0, Number(retryCount) || 0) + 1);
    let lastReason = "";
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
      const existing = promptAttachmentSnapshot(input, { grok: true });
      if (attempt > 1 || existing.count > 0) {
        clearPromptAttachments(input, { grok: true });
        if (!await waitForPromptAttachmentsCleared(input, { grok: true }, 2500, deadlineAt)) {
          return { ok: false, reason: "Grok attachments could not be cleared before retry" };
        }
        input = inputCandidates(inputSelector) || input;
      }
      const baseline = promptAttachmentSnapshot(input, { grok: true });
      const result = await attachGrokPromptImagesOnce(list, input, textValue);
      if (!result.ok) lastReason = result.reason || "Grok image insertion failed";
      if (!await sleepUntilDeadline(220, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
      const ready = await waitForPromptImagesReady(input, baseline.count + list.length, Math.min(45000, remainingDeadlineMs(deadlineAt, 45000)), deadlineAt, { grok: true, exactCount: true });
      if (ready.ok) return { ok: true, attempts: attempt, snapshot: ready.snapshot };
      lastReason = ready.overflow
        ? "Grok attached duplicate image files"
        : ready.reason || "Grok image upload did not become ready";
    }
    return { ok: false, reason: lastReason || "Grok image upload did not become ready" };
  }

  async function attachKagiPromptImagesWithRetries(input, files = [], retryCount = 3, inputSelector = "", deadlineAt = 0, textValue = "") {
    const list = Array.from(files || []).filter((file) => file && String(file.type || "").startsWith("image/"));
    if (!list.length) return { ok: true };
    const attempts = Math.max(0, Number(retryCount) || 0) + 1;
    let lastReason = "";
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
      if (attempt > 1) {
        clearPromptAttachments(input);
        if (!await waitForPromptAttachmentsCleared(input, {}, 2500, deadlineAt)) {
          return { ok: false, reason: "Kagi attachments could not be cleared before retry" };
        }
        input = inputCandidates(inputSelector) || input;
        if (textValue.trim()) {
          await setInputValue(input, "");
          if (!await sleepUntilDeadline(120, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        }
      }
      const baseline = promptAttachmentSnapshot(input);
      const result = await attachKagiPromptImagesOnce(list, input, textValue);
      if (!result.ok) lastReason = result.reason || "Kagi image and text insertion failed";
      if (!await sleepUntilDeadline(220, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
      const ready = await waitForPromptImagesReady(input, baseline.count + list.length, Math.min(45000, remainingDeadlineMs(deadlineAt, 45000)), deadlineAt);
      if (ready.ok) return { ok: true, attempts: attempt, snapshot: ready.snapshot };
      lastReason = ready.reason || "Kagi image upload did not become ready";
    }
    return { ok: false, reason: lastReason || "Kagi image upload did not become ready" };
  }

  function isNotionSendTarget(data = {}) {
    const appId = String(data?.appId || "").trim().toLowerCase();
    const appName = String(data?.appName || "").trim().toLowerCase();
    const host = String(location.hostname || "").toLowerCase();
    return appId === "notionai"
      || /\bnotion\b/.test(appName)
      || host === "app.notion.com"
      || host === "notion.so"
      || host === "www.notion.so"
      || host.endsWith(".notion.so");
  }

  function requestNotionSendPrompt(data = {}, timeoutMs = promptImageSendTimeoutMs(data, 65000)) {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const deadlineAt = sendDeadlineAt(data, timeoutMs);
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage, true);
        resolve({ ok: false, sent: false, method: "notion-prompt-bridge", reason: "Notion AI prompt bridge timed out" });
      }, Math.max(1000, remainingDeadlineMs(deadlineAt, timeoutMs)));
      function finish(result) {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        resolve(result && typeof result === "object" ? result : { ok: false, sent: false, method: "notion-prompt-bridge" });
      }
      function onMessage(event) {
        const message = event.data;
        if (message?.source !== NOTION_SEND_PROMPT_SOURCE || message.type !== "response" || message.id !== id) return;
        finish(message.data || {});
      }
      window.addEventListener("message", onMessage, true);
      try {
        window.dispatchEvent(new CustomEvent("chatclub:notion-send-prompt:2026.07.13.13", {
          detail: {
            id,
            sendId: String(data?.sendId || ""),
            deadlineAt,
            text: String(data?.text || ""),
            images: Array.isArray(data?.images) ? data.images : [],
            imageRetryCount: Math.max(0, Number(data?.imageRetryCount) || 0),
            sendKeyMode: data?.sendKeyMode || "enter"
          }
        }));
      } catch (error) {
        finish({
          ok: false,
          sent: false,
          method: "notion-prompt-bridge",
          reason: error?.message || String(error || "Notion AI prompt send failed")
        });
      }
    });
  }

  function requestNotionSendText(data = {}, timeoutMs = 9000) {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const deadlineAt = sendDeadlineAt(data, timeoutMs);
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage, true);
        resolve({ ok: false, sent: false, method: "notion-bridge", reason: "Notion AI send bridge timed out" });
      }, Math.max(1000, remainingDeadlineMs(deadlineAt, timeoutMs)));
      function finish(result) {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        resolve(result && typeof result === "object" ? result : { ok: false, sent: false, method: "notion-bridge" });
      }
      function onMessage(event) {
        const message = event.data;
        if (message?.source !== NOTION_SEND_TEXT_SOURCE || message.type !== "response" || message.id !== id) return;
        finish(message.data || {});
      }
      window.addEventListener("message", onMessage, true);
      try {
        window.dispatchEvent(new CustomEvent("chatclub:notion-send-text:2026.07.13.13", {
          detail: {
            id,
            sendId: String(data?.sendId || ""),
            deadlineAt,
            text: String(data?.text || ""),
            sendKeyMode: data?.sendKeyMode || "enter"
          }
        }));
      } catch (error) {
        finish({
          ok: false,
          sent: false,
          method: "notion-bridge",
          reason: error?.message || String(error || "Notion AI send bridge failed")
        });
      }
    });
  }

  async function sendNotionText(data = {}) {
    const hasImages = Array.isArray(data?.images) && data.images.length > 0;
    const result = hasImages ? await requestNotionSendPrompt(data) : await requestNotionSendText(data);
    if (result?.ok && result?.sent) {
      return {
        sent: true,
        method: result.method || "notion-bridge",
        verified: result.verified !== false
      };
    }
    return {
      sent: false,
      method: result?.method || "notion-bridge",
      verified: false,
      reason: result?.reason || "Notion AI did not accept the prompt"
    };
  }

  const sendTextRequestCache = window.__CHATCLUB_SEND_TEXT_REQUEST_CACHE__ instanceof Map
    ? window.__CHATCLUB_SEND_TEXT_REQUEST_CACHE__
    : new Map();
  window.__CHATCLUB_SEND_TEXT_REQUEST_CACHE__ = sendTextRequestCache;
  function sendTextRequestKey(data = {}) {
    return String(data?.sendId || "").trim();
  }

  function forgetSendTextRequest(key, record, delayMs) {
    setTimeout(() => {
      if (sendTextRequestCache.get(key) === record) sendTextRequestCache.delete(key);
    }, delayMs);
  }

  async function runSendTextOnce(data, runner) {
    const key = sendTextRequestKey(data);
    if (!key) return runner();
    const existing = sendTextRequestCache.get(key);
    if (existing) return existing.promise;
    const record = { promise: null };
    record.promise = Promise.resolve().then(runner).then((result) => {
      record.promise = Promise.resolve(result);
      forgetSendTextRequest(key, record, 120000);
      return result;
    }, (error) => {
      forgetSendTextRequest(key, record, 30000);
      throw error;
    });
    sendTextRequestCache.set(key, record);
    return record.promise;
  }

  async function sendText(data) {
    return runSendTextOnce(data, () => sendTextUncached(data));
  }

  async function sendTextUncached(data) {
    if (isNotionSendTarget(data)) return sendNotionText(data);
    const grok = isGrokSendTarget(data);
    const kagi = isKagiSendTarget(data);
    const gemini = isGeminiSendTarget(data);
    const deadlineAt = sendDeadlineAt(data, Array.isArray(data?.images) && data.images.length ? 60000 : 10000);
    if (deadlineExpired(deadlineAt)) throw new Error("Send deadline exceeded");
    let input = inputCandidates(data?.inputSelector);
    if (!input) throw new Error("Input element not found");
    const files = promptImageFilesFromPayload(data?.images);
    const textValue = String(data.text || "");
    if (Array.isArray(data?.images) && data.images.length && !files.length) {
      throw new Error("Image payload could not be restored");
    }
    const batch = promptImagePasteStrategy(data) === PROMPT_IMAGE_PASTE_STRATEGY_BATCH;
    const geminiBatch = gemini && batch;
    if (files.length) {
      const attached = grok
        ? await attachGrokPromptImagesWithRetries(input, files, data?.imageRetryCount ?? 3, data?.inputSelector || "", deadlineAt, textValue)
        : kagi
          ? await attachKagiPromptImagesWithRetries(input, files, data?.imageRetryCount ?? 3, data?.inputSelector || "", deadlineAt, textValue)
          : geminiBatch
            ? await attachGeminiPromptImagesWithRetries(input, files, data?.imageRetryCount ?? 3, data?.inputSelector || "", deadlineAt, textValue)
          : batch
            ? await attachBatchPromptImagesWithRetries(input, files, data?.imageRetryCount ?? 3, data?.inputSelector || "", deadlineAt)
            : await attachPromptImagesWithRetries(input, files, data?.imageRetryCount ?? 3, data?.inputSelector || "", deadlineAt);
      if (!attached.ok) throw new Error(attached.reason || "Image insertion failed");
      if (grok || kagi || geminiBatch) input = inputCandidates(data?.inputSelector) || attached.input || input;
    }
    if (deadlineExpired(deadlineAt)) throw new Error("Send deadline exceeded");
    const combinedPaste = files.length > 0 && (grok || kagi || geminiBatch);
    if (textValue.trim() && (!combinedPaste || compareText(text(input)) !== compareText(textValue))) await setInputValue(input, textValue);
    await sleepUntilDeadline(grok ? 320 : 140, deadlineAt);
    const submit = await waitForPromptSubmitReady(input, data?.sendButtonSelector, deadlineAt, files.length ? 12000 : 8000);
    if (submit) {
      if (!contentBridgeIsCurrent()) throw new Error("Send bridge was superseded before submit");
      markSubmissionNavigation(data, "button");
      if (!clickPromptSubmit(submit)) throw new Error("Submit button activation failed");
      return { sent: true, method: "button", verified: false };
    }
    if (files.length) throw new Error("Submit button stayed disabled");
    if (deadlineExpired(deadlineAt)) throw new Error("Send deadline exceeded");
    if (!contentBridgeIsCurrent()) throw new Error("Send bridge was superseded before submit");
    const keyInit = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    markSubmissionNavigation(data, "enter");
    input.dispatchEvent(new KeyboardEvent("keydown", keyInit));
    input.dispatchEvent(new KeyboardEvent("keyup", keyInit));
    return { sent: true, method: "enter", verified: false };
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
      || activePreferredModelRun !== context
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

  function isDisabledElement(el) {
    if (!el) return true;
    if (el.disabled || el.hasAttribute?.("disabled") || el.hasAttribute?.("data-disabled")) return true;
    const ariaDisabled = String(el.getAttribute?.("aria-disabled") || "").trim().toLowerCase();
    if (ariaDisabled === "true") return true;
    const dataState = String(el.getAttribute?.("data-state") || "").trim().toLowerCase();
    if (dataState === "disabled") return true;
    try {
      if (typeof el.matches === "function" && el.matches(":disabled")) return true;
    } catch {}
    const className = typeof el.className === "string" ? el.className : String(el.className?.baseVal || "");
    return className
      .split(/\s+/)
      .some((token) => /^(disabled|is-disabled|is_disabled)$/i.test(token));
  }

  function visibleSelectorElements(selectors, root = document) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    const out = [];
    const seen = new Set();
    for (const selector of list) {
      const value = String(selector || "").trim();
      if (!value) continue;
      for (const element of qsa(value, root, { all: true })) {
        if (seen.has(element) || !visible(element)) continue;
        seen.add(element);
        out.push(element);
      }
    }
    return out;
  }

  function firstVisibleBySelectors(selectors, options = {}) {
    const elements = visibleSelectorElements(selectors, options.root || document);
    return options.last ? elements[elements.length - 1] || null : elements[0] || null;
  }

  function modelElementText(el) {
    if (!el) return "";
    return normalize([
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("aria-valuetext"),
      el.getAttribute?.("title"),
      el.getAttribute?.("data-testid"),
      el.getAttribute?.("data-test-id"),
      el.getAttribute?.("data-value"),
      el.getAttribute?.("value"),
      el.innerText || el.textContent || "",
      el.value
    ].filter(Boolean).join(" "));
  }

  function compactModelText(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, " ");
  }

  function alnumModelToken(value) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function modelTextIncludes(value, needle) {
    const haystack = compactModelText(value);
    const target = compactModelText(needle);
    return Boolean(target && (haystack === target || haystack.includes(target)));
  }

  function parseBooleanAttr(value) {
    const token = String(value ?? "").trim().toLowerCase();
    if (token === "true") return true;
    if (token === "false") return false;
    return null;
  }

  function modelEventView(el = null) {
    try { return el?.ownerDocument?.defaultView || document?.defaultView || window; } catch {}
    try { return window; } catch {}
    return null;
  }

  function modelEventConstructor(name, el = null) {
    try {
      const view = modelEventView(el);
      return view?.[name] || window?.[name] || null;
    } catch {
      return null;
    }
  }

  function modelRect(el) {
    try {
      const rect = el?.getBoundingClientRect?.();
      if (!rect) return null;
      return {
        top: Number(rect.top || 0),
        right: Number(rect.right || 0),
        bottom: Number(rect.bottom || 0),
        left: Number(rect.left || 0),
        width: Math.max(0, Number(rect.width || 0)),
        height: Math.max(0, Number(rect.height || 0))
      };
    } catch {
      return null;
    }
  }

  function modelElementArea(el) {
    const rect = modelRect(el);
    return rect ? rect.width * rect.height : Number.MAX_SAFE_INTEGER;
  }

  function modelRectInViewport(rect, margin = 0) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const viewportWidth = Math.max(1, Number(window.innerWidth) || Number(document.documentElement?.clientWidth) || 1);
    const viewportHeight = Math.max(1, Number(window.innerHeight) || Number(document.documentElement?.clientHeight) || 1);
    return rect.bottom > margin
      && rect.right > margin
      && rect.top < viewportHeight - margin
      && rect.left < viewportWidth - margin;
  }

  function visibleInViewport(el, { hitTest = false } = {}) {
    if (!visible(el)) return false;
    const rect = modelRect(el);
    if (!modelRectInViewport(rect)) return false;
    if (!hitTest) return true;
    const point = modelCenterPoint(el);
    const target = modelElementFromPoint(point, el);
    if (!target) return false;
    return target === el || el.contains?.(target) || target.contains?.(el) || closest(target, DELETE_CLICKABLE_SELECTOR) === el;
  }

  function modelCenterPoint(el) {
    const rect = modelRect(el);
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const viewportWidth = Math.max(1, Number(window.innerWidth) || Number(document.documentElement?.clientWidth) || 1);
    const viewportHeight = Math.max(1, Number(window.innerHeight) || Number(document.documentElement?.clientHeight) || 1);
    return {
      x: Math.min(Math.max(rect.left + rect.width / 2, 1), viewportWidth - 1),
      y: Math.min(Math.max(rect.top + rect.height / 2, 1), viewportHeight - 1)
    };
  }

  function modelElementFromPoint(point, el = null) {
    if (!point) return null;
    try {
      const doc = el?.ownerDocument || document;
      return doc.elementFromPoint?.(point.x, point.y) || null;
    } catch {
      return null;
    }
  }

  function modelClickableAncestor(el) {
    return closest(el, "button, a[href], [role='button'], [role='menuitem'], [role='menuitemradio'], [role='option'], [tabindex]:not([tabindex='-1'])");
  }

  function modelCustomActivationAncestor(el) {
    return closest(el, "gem-button, .gem-button, .gds-mode-switch-button");
  }

  function modelActivationTargets(el) {
    const targets = [];
    const seen = new Set();
    const add = (target) => {
      if (!target || seen.has(target)) return;
      seen.add(target);
      targets.push(target);
    };
    const point = modelCenterPoint(el);
    const pointTarget = modelElementFromPoint(point, el);
    if (pointTarget && (pointTarget === el || el.contains?.(pointTarget) || pointTarget.contains?.(el))) {
      add(modelCustomActivationAncestor(pointTarget));
      add(modelClickableAncestor(pointTarget));
      add(pointTarget);
    }
    add(el);
    add(modelCustomActivationAncestor(el));
    add(modelClickableAncestor(el));
    return targets.filter((target) => visible(target) && !isDisabledElement(target));
  }

  function dispatchPointerActivation(target, point) {
    if (!target || !point) return false;
    const PointerEventCtor = modelEventConstructor("PointerEvent", target);
    const MouseEventCtor = modelEventConstructor("MouseEvent", target);
    if (typeof PointerEventCtor !== "function" && typeof MouseEventCtor !== "function") return false;
    const clientX = Number(point.x) || 1;
    const clientY = Number(point.y) || 1;
    const view = modelEventView(target);
    const common = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: view || null,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      button: 0
    };
    const plans = [
      typeof PointerEventCtor === "function" && { ctor: PointerEventCtor, type: "pointerover", opts: { ...common, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true } },
      typeof MouseEventCtor === "function" && { ctor: MouseEventCtor, type: "mouseover", opts: { ...common, buttons: 0, detail: 0 } },
      typeof PointerEventCtor === "function" && { ctor: PointerEventCtor, type: "pointerenter", opts: { ...common, bubbles: false, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true } },
      typeof MouseEventCtor === "function" && { ctor: MouseEventCtor, type: "mouseenter", opts: { ...common, bubbles: false, buttons: 0, detail: 0 } },
      typeof PointerEventCtor === "function" && { ctor: PointerEventCtor, type: "pointermove", opts: { ...common, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true } },
      typeof MouseEventCtor === "function" && { ctor: MouseEventCtor, type: "mousemove", opts: { ...common, buttons: 0, detail: 0 } },
      typeof PointerEventCtor === "function" && { ctor: PointerEventCtor, type: "pointerdown", opts: { ...common, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true } },
      typeof MouseEventCtor === "function" && { ctor: MouseEventCtor, type: "mousedown", opts: { ...common, buttons: 1, detail: 1 } },
      typeof PointerEventCtor === "function" && { ctor: PointerEventCtor, type: "pointerup", opts: { ...common, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true } },
      typeof MouseEventCtor === "function" && { ctor: MouseEventCtor, type: "mouseup", opts: { ...common, buttons: 0, detail: 1 } },
      typeof MouseEventCtor === "function" && { ctor: MouseEventCtor, type: "click", opts: { ...common, buttons: 0, detail: 1 } }
    ].filter(Boolean);
    let dispatched = false;
    for (const plan of plans) {
      try {
        target.dispatchEvent(new plan.ctor(plan.type, plan.opts));
        dispatched = true;
      } catch {}
    }
    return dispatched;
  }

  function nativeModelClick(target) {
    if (!target || typeof target.click !== "function") return false;
    try {
      target.click();
      return true;
    } catch {
      return false;
    }
  }

  function preferredModelActivate(context, target) {
    assertPreferredModelRun(context);
    if (!target || !visible(target) || isDisabledElement(target) || typeof target.click !== "function") return false;
    armPreferredModelFocusShield(context);
    try { target.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    assertPreferredModelRun(context);
    context.interactionCount += 1;
    return nativeModelClick(target);
  }

  function preferredModelPointerActivate(context, target) {
    assertPreferredModelRun(context);
    if (!target || !visible(target) || isDisabledElement(target)) return false;
    armPreferredModelFocusShield(context);
    assertPreferredModelRun(context);
    context.interactionCount += 1;
    return modelDirectClick(target);
  }

  function modelClick(el) {
    if (!el || !visible(el) || isDisabledElement(el)) return false;
    try { el.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    const point = modelCenterPoint(el);
    let clicked = false;
    for (const target of modelActivationTargets(el)) {
      try { target.focus?.({ preventScroll: true }); } catch {
        try { target.focus?.(); } catch {}
      }
      clicked = dispatchPointerActivation(target, point || modelCenterPoint(target)) || clicked;
      clicked = nativeModelClick(target) || clicked;
      if (clicked) return true;
    }
    try {
      activateElement(el);
      clicked = true;
    } catch {}
    return clicked;
  }

  function modelDirectClick(el) {
    if (!el || !visible(el) || isDisabledElement(el)) return false;
    try { el.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    try { el.focus?.({ preventScroll: true }); } catch {
      try { el.focus?.(); } catch {}
    }
    return dispatchPointerActivation(el, modelCenterPoint(el)) || nativeModelClick(el);
  }

  function deleteResult(ok, site, reason = "", extra = {}) {
    if (!ok && reason) console.warn(`[ChatClub] ${site} delete thread: ${reason}`);
    return { ok, site, ...(reason ? { reason } : {}), ...extra };
  }

  function deleteTextToken(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, " ").trim();
  }

  function deleteCompactToken(value) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  }

  function deleteElementText(el) {
    if (!el) return "";
    return normalize([
      buttonText(el),
      modelElementText(el),
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("title"),
      el.innerText || el.textContent || ""
    ].filter(Boolean).join(" "));
  }

  function deleteLabelMatches(value, labels, { exact = false } = {}) {
    const textValue = deleteTextToken(value);
    const compactValue = deleteCompactToken(value);
    if (!textValue && !compactValue) return false;
    return (labels || []).some((label) => {
      const textLabel = deleteTextToken(label);
      const compactLabel = deleteCompactToken(label);
      if (!textLabel && !compactLabel) return false;
      if (exact) return textValue === textLabel || compactValue === compactLabel;
      return textValue.includes(textLabel) || compactValue.includes(compactLabel);
    });
  }

  function deleteLabelMatchesExactish(value, labels) {
    const textValue = deleteTextToken(value);
    const compactValue = deleteCompactToken(value);
    return (labels || []).some((label) => {
      const textLabel = deleteTextToken(label);
      const compactLabel = deleteCompactToken(label);
      if (!textLabel && !compactLabel) return false;
      return textValue === textLabel
        || compactValue === compactLabel
        || textValue === `${textLabel} ${textLabel}`
        || compactValue === `${compactLabel}${compactLabel}`;
      });
  }

  const DELETE_CLICKABLE_SELECTOR = "button,[role='button'],[role='menuitem'],[role='option'],a[href],[aria-haspopup],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i]";
  const DELETE_CONFIRM_CLICKABLE_SELECTOR = `${DELETE_CLICKABLE_SELECTOR},[class*='button' i],[class*='btn' i]`;
  const DELETE_CONFIRM_CANDIDATE_SELECTOR = `${DELETE_CLICKABLE_SELECTOR},[class*='button' i],[class*='btn' i]`;

  function visibleDeleteCandidates(root = document, selector = DELETE_CLICKABLE_SELECTOR) {
    return qsa(selector, root, { all: true }).filter((element) => visible(element) && !isDisabledElement(element));
  }

  function layoutDeleteCandidates(root = document, selector = DELETE_CLICKABLE_SELECTOR) {
    return qsa(selector, root, { all: true }).filter((element) => {
      if (!element || !element.isConnected || isDisabledElement(element)) return false;
      const rect = modelRect(element);
      if (!rect || rect.width < 2 || rect.height < 2) return false;
      try {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      } catch {
        return true;
      }
    });
  }

  function deleteClickableElement(element) {
    return closest(element, DELETE_CONFIRM_CANDIDATE_SELECTOR) || element;
  }

  function deleteClick(element) {
    const target = deleteClickableElement(element);
    return modelClick(target) || modelDirectClick(target);
  }

  function deleteLayoutActivationTargets(el) {
    const targets = [];
    const seen = new Set();
    const add = (target) => {
      if (!target || seen.has(target) || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 2 || rect.height < 2) return;
      try {
        const style = getComputedStyle(target);
        if (style.display === "none" || style.visibility === "hidden") return;
      } catch {}
      seen.add(target);
      targets.push(target);
    };
    const point = modelCenterPoint(el);
    const pointTarget = modelElementFromPoint(point, el);
    if (pointTarget) {
      add(modelCustomActivationAncestor(pointTarget));
      add(modelClickableAncestor(pointTarget));
      add(pointTarget);
    }
    add(el);
    add(modelCustomActivationAncestor(el));
    add(modelClickableAncestor(el));
    return targets;
  }

  function deleteClickLayout(element) {
    const target = deleteClickableElement(element);
    if (!target || !target.isConnected || isDisabledElement(target)) return false;
    const rect = modelRect(target);
    if (!rect || rect.width < 2 || rect.height < 2) return false;
    try { target.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    let clicked = false;
    for (const item of deleteLayoutActivationTargets(target)) {
      try { item.focus?.({ preventScroll: true }); } catch {
        try { item.focus?.(); } catch {}
      }
      clicked = dispatchPointerActivation(item, modelCenterPoint(item) || modelCenterPoint(target)) || clicked;
      clicked = nativeModelClick(item) || clicked;
      if (clicked) return true;
    }
    return clicked;
  }

  async function deleteActivateUntil(element, getter, { allowHidden = false, settleMs = 180 } = {}) {
    const target = deleteClickableElement(element);
    if (!target || !target.isConnected || isDisabledElement(target)) return null;
    const rect = modelRect(target);
    if (!rect || rect.width < 2 || rect.height < 2) return null;
    if (!allowHidden && !visible(target)) return null;
    try {
      const style = getComputedStyle(target);
      if (style.display === "none" || style.visibility === "hidden") return null;
    } catch {}
    try { target.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    try { target.focus?.({ preventScroll: true }); } catch {
      try { target.focus?.(); } catch {}
    }
    const read = () => {
      try { return typeof getter === "function" ? getter() : null; } catch { return null; }
    };
    const initial = read();
    if (initial) return initial;
    const point = modelCenterPoint(target);
    const attempts = [
      () => dispatchPointerActivation(target, point),
      () => nativeModelClick(target),
      () => activateElement(target),
      () => deleteClickLayout(target)
    ];
    for (const attempt of attempts) {
      try { attempt(); } catch {}
      await sleep(Math.max(40, Number(settleMs) || 40));
      const value = read();
      if (value) return value;
    }
    return read();
  }

  const DELETE_CONFIRM_LABELS = ["Delete chat", "Delete Chat", "Delete thread", "Delete", "Confirm", "Confirm delete", "确认", "确认删除", "删除聊天", "删除话题", "删除"];
  const DELETE_CONFIRM_STRICT_LABELS = ["Delete chat", "Delete Chat", "Delete thread", "Confirm delete", "确认删除", "删除聊天", "删除话题"];
  const DELETE_CONFIRM_GENERIC_LABELS = ["Delete", "Confirm", "确认", "删除"];
  const DELETE_CANCEL_LABELS = ["Cancel", "取消", "Keep", "保留"];
  const DELETE_CONFIRM_REJECT_LABEL_PATTERN = /\b(rename|more|options|menu|pin|share|settings|history)\b|重命名|更多|菜单|选项|置顶|分享|设置|历史/i;

  function deleteConfirmRejectButtonMatches(element) {
    const value = deleteElementText(element);
    return DELETE_CONFIRM_REJECT_LABEL_PATTERN.test(deleteTextToken(value))
      || DELETE_CONFIRM_REJECT_LABEL_PATTERN.test(deleteCompactToken(value));
  }

  function deleteConfirmButtonMatches(element, root = null) {
    const value = deleteElementText(element);
    if (!value || deleteLabelMatches(value, DELETE_CANCEL_LABELS)) return false;
    if (deleteConfirmRejectButtonMatches(element)) return false;
    if (deleteLabelMatchesExactish(value, DELETE_CONFIRM_STRICT_LABELS)) return true;
    if (deleteLabelMatchesExactish(value, DELETE_CONFIRM_GENERIC_LABELS)) return true;
    if (root && deleteConfirmRootTextMatches(deleteElementText(root))) return deleteLabelMatches(value, DELETE_CONFIRM_LABELS);
    return deleteLabelMatches(value, DELETE_CONFIRM_STRICT_LABELS);
  }

  function deleteCancelButtonMatches(element) {
    return deleteLabelMatches(deleteElementText(element), DELETE_CANCEL_LABELS);
  }

  function deleteConfirmActivationElementMatches(element, expected, root = null) {
    const candidate = deleteClickableElement(element);
    const target = deleteClickableElement(expected);
    if (!candidate || !visible(candidate) || isDisabledElement(candidate)) return false;
    if (deleteCancelButtonMatches(candidate) || deleteConfirmRejectButtonMatches(candidate)) return false;
    if (target && (candidate === target || candidate.contains?.(target) || target.contains?.(candidate))) return true;
    return deleteConfirmButtonMatches(candidate, root);
  }

  function deleteDialogRoots() {
    const roots = visibleSelectorElements([
      "[role='alertdialog']",
      "[role='dialog']",
      "[data-radix-dialog-content]",
      "[data-state='open']",
      ".modal",
      ".fixed"
    ]).filter((root) => {
      const value = deleteElementText(root);
      return deleteConfirmRootTextMatches(value);
    });
    for (const root of deleteQuestionDialogRoots()) {
      if (!roots.some((item) => item === root || item.contains?.(root) || root.contains?.(item))) roots.push(root);
    }
    for (const root of deleteButtonPairDialogRoots()) {
      if (!roots.some((item) => item === root || item.contains?.(root) || root.contains?.(item))) roots.push(root);
    }
    roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
    return roots;
  }

  function deleteConfirmQuestionMatches(value) {
    return /are you sure you want to delete(?: this)? chat|are you sure.*delete|this chat can(?:'|’)?t be recovered|this chat cant be recovered|delete this chat|share links from it will be disabled|cannot be undone|can(?:'|’)?t be undone|permanently delete|permanent deletion|确定.*删除|确认.*删除|删除.*不可恢复|无法恢复|不能恢复/i.test(deleteTextToken(value));
  }

  function deleteConfirmRootTextMatches(value) {
    const textValue = deleteTextToken(value);
    const compactValue = deleteCompactToken(value);
    if (deleteConfirmQuestionMatches(textValue)) return true;
    const hasDelete = /delete|删除/.test(textValue) || /delete|删除/.test(compactValue);
    const hasConfirm = /confirm|确认/.test(textValue) || /confirm|确认/.test(compactValue);
    const hasCancel = /cancel|取消/.test(textValue) || /cancel|取消/.test(compactValue);
    const hasRecoverWarning = /recover|recovered|不可恢复|无法恢复|不能恢复/.test(textValue) || /recover|recovered|不可恢复|无法恢复|不能恢复/.test(compactValue);
    return hasCancel && (hasRecoverWarning || (hasDelete && hasConfirm));
  }

  function deleteQuestionDialogRoots() {
    const roots = [];
    const questions = qsa("div,section,[role='dialog'],[role='alertdialog']", document, { all: true })
      .filter((element) => visible(element) && deleteConfirmQuestionMatches(deleteElementText(element)))
      .sort((a, b) => modelElementArea(a) - modelElementArea(b))
      .slice(0, 24);
    for (const question of questions) {
      let node = question;
      for (let depth = 0; node && node !== document.body && depth < 8; depth += 1, node = node.parentElement) {
        if (!visible(node)) continue;
        const buttons = visibleDeleteCandidates(node, DELETE_CONFIRM_CLICKABLE_SELECTOR);
        const hasConfirm = buttons.some((button) => deleteConfirmButtonMatches(button, node));
        const hasCancel = buttons.some(deleteCancelButtonMatches);
        if (!hasConfirm || !hasCancel) continue;
        if (!roots.some((root) => root === node || root.contains?.(node) || node.contains?.(root))) roots.push(node);
        break;
      }
    }
    return roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
  }

  function deleteButtonPairDialogRoots() {
    const roots = [];
    const seedButtons = visibleDeleteCandidates(document, DELETE_CONFIRM_CLICKABLE_SELECTOR)
      .filter((button) => deleteConfirmButtonMatches(button) || deleteCancelButtonMatches(button));
    for (const button of seedButtons) {
      let node = button;
      for (let depth = 0; node && node !== document.body && depth < 9; depth += 1, node = node.parentElement) {
        if (!visible(node)) continue;
        const buttons = visibleDeleteCandidates(node, DELETE_CONFIRM_CLICKABLE_SELECTOR);
        if (!buttons.some((candidate) => deleteConfirmButtonMatches(candidate, node)) || !buttons.some(deleteCancelButtonMatches)) continue;
        if (!deleteConfirmRootTextMatches(deleteElementText(node))) continue;
        if (!roots.some((root) => root === node || root.contains?.(node) || node.contains?.(root))) roots.push(node);
        break;
      }
    }
    return roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
  }

  function findDeleteConfirmButtonInfo() {
    const candidates = [];
    const addCandidate = (element, root = null, extraScore = 0) => {
      const target = deleteClickableElement(element);
      const value = deleteElementText(target) || deleteElementText(element);
      if (!deleteConfirmButtonMatches(target, root) && !deleteConfirmButtonMatches(element, root)) return;
      if (deleteCancelButtonMatches(target) || deleteCancelButtonMatches(element)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 12 || rect.height < 10 || rect.width > 760 || rect.height > 160) return;
      candidates.push({
        element: target,
        root,
        score: extraScore
          + (deleteLabelMatchesExactish(value, DELETE_CONFIRM_STRICT_LABELS) ? 700 : 0)
          + (deleteLabelMatchesExactish(value, DELETE_CONFIRM_GENERIC_LABELS) ? 420 : 0)
          + (target.matches?.("button,[role='button']") ? 220 : 0),
        right: rect.right || rect.left || 0,
        top: rect.top || 0,
        area: rect.width * rect.height
      });
    };
    for (const root of deleteDialogRoots()) {
      for (const element of visibleDeleteCandidates(root, DELETE_CONFIRM_CLICKABLE_SELECTOR)) {
        addCandidate(element, root, 260);
      }
    }
    if (!candidates.length && qsa("div,section,[role='dialog'],[role='alertdialog'],h1,h2,h3,p,span", document, { all: true }).some((element) => visible(element) && deleteConfirmQuestionMatches(deleteElementText(element)))) {
      const buttons = visibleDeleteCandidates(document, DELETE_CONFIRM_CLICKABLE_SELECTOR);
      const cancelButtons = buttons.filter(deleteCancelButtonMatches);
      if (cancelButtons.length) {
        for (const element of buttons) {
          const value = deleteElementText(element);
          if (!deleteLabelMatchesExactish(value, DELETE_CONFIRM_GENERIC_LABELS) && !deleteLabelMatchesExactish(value, DELETE_CONFIRM_STRICT_LABELS)) continue;
          const rect = modelRect(element);
          if (!rect) continue;
          const nearCancel = cancelButtons.some((cancel) => {
            const cancelRect = modelRect(cancel);
            if (!cancelRect) return false;
            return Math.abs((cancelRect.left + cancelRect.right) / 2 - (rect.left + rect.right) / 2) < 360
              && Math.abs((cancelRect.top + cancelRect.bottom) / 2 - (rect.top + rect.bottom) / 2) < 220;
          });
          if (nearCancel) addCandidate(element, null, 180);
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.top - a.top || a.area - b.area);
    return candidates[0] || null;
  }

  function findDeleteConfirmButton() {
    return findDeleteConfirmButtonInfo()?.element || null;
  }

  function serializableDeleteRect(box) {
    if (!box) return null;
    const round = (value) => Math.round(Number(value || 0) * 100) / 100;
    return {
      left: round(box.left),
      top: round(box.top),
      right: round(box.right),
      bottom: round(box.bottom),
      width: round(box.width),
      height: round(box.height)
    };
  }

  function deleteConfirmTrustedClick(site = "topic-delete", reason = "delete confirmation requires trusted browser input") {
    const info = findDeleteConfirmButtonInfo();
    const button = info?.element || null;
    const box = modelRect(button);
    if (!button || !box) return null;
    return {
      kind: "delete-confirm",
      site,
      reason: String(reason || ""),
      framePoint: {
        x: Math.round((box.left + box.width / 2) * 100) / 100,
        y: Math.round((box.top + box.height / 2) * 100) / 100
      },
      frameRect: serializableDeleteRect(box)
    };
  }

  function deleteResultWithTrustedConfirm(site, reason) {
    const trustedClick = deleteConfirmTrustedClick(site, reason);
    return deleteResult(false, site, reason, trustedClick ? { needsTrustedClick: true, trustedClick } : {});
  }

  function trustedDeleteShortcut(site = "topic-delete", reason = "delete shortcut requires trusted browser input") {
    const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
    return {
      kind: "delete-shortcut",
      site,
      reason: String(reason || ""),
      keys: [
        {
          key: "Backspace",
          shiftKey: true,
          metaKey: mac,
          ctrlKey: !mac,
          settleMs: 520
        }
      ],
      keySettleMs: 180,
      settleMs: 900
    };
  }

  function deleteResultWithTrustedDeleteShortcut(site, reason) {
    return deleteResult(false, site, reason, {
      needsTrustedKeySequence: true,
      trustedKeySequence: trustedDeleteShortcut(site, reason)
    });
  }

  function trustedHoverRightEdge(element, site = "topic-delete", reason = "topic menu trigger requires trusted hover") {
    const box = modelRect(element);
    if (!element || !box) return null;
    return {
      kind: "topic-menu-hover",
      site,
      reason: String(reason || ""),
      framePoint: {
        x: Math.round(Math.max(box.left + 8, box.right - 24) * 100) / 100,
        y: Math.round((box.top + box.height / 2) * 100) / 100
      },
      frameRect: serializableDeleteRect(box),
      hoverSettleMs: 520
    };
  }

  function deleteResultWithTrustedHover(site, reason, element) {
    const trustedHover = trustedHoverRightEdge(element, site, reason);
    return deleteResult(false, site, reason, trustedHover ? { needsTrustedHover: true, trustedHover } : {});
  }

  function trustedMenuClickPoint(site = "topic-delete", reason = "topic menu trigger requires trusted browser input", point = {}, frameRect = null) {
    const x = Number(point.x ?? point.clientX);
    const y = Number(point.y ?? point.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      kind: "topic-menu-trigger",
      site,
      reason: String(reason || ""),
      framePoint: {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100
      },
      ...(frameRect ? { frameRect } : {})
    };
  }

  function trustedMenuClickForElement(element, site = "topic-delete", reason = "topic menu trigger requires trusted browser input") {
    const box = modelRect(element);
    if (!element || !box) return null;
    return trustedMenuClickPoint(site, reason, {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2
    }, serializableDeleteRect(box));
  }

  function deleteResultWithTrustedMenuClick(site, reason, element) {
    const trustedMenuClick = trustedMenuClickForElement(element, site, reason);
    return deleteResult(false, site, reason, trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {});
  }

  function topicDeleteConfirmState(site = "topic-delete") {
    const trustedClick = deleteConfirmTrustedClick(site, "delete confirmation is still visible");
    return {
      present: Boolean(trustedClick) || deleteDialogRoots().length > 0,
      trustedClick
    };
  }

  function deleteConfirmDialogClosed(root, button) {
    return !findDeleteConfirmButton() && !deleteDialogRoots().length;
  }

  function dispatchDeleteConfirmKey(target, key = "Enter") {
    if (!target) return false;
    const KeyboardEventCtor = modelEventConstructor("KeyboardEvent", target);
    if (typeof KeyboardEventCtor !== "function") return false;
    const isSpace = key === " " || /^space(?:bar)?$/i.test(key);
    const code = isSpace ? "Space" : "Enter";
    const keyValue = isSpace ? " " : "Enter";
    const keyCode = isSpace ? 32 : 13;
    let dispatched = false;
    const init = {
      key: keyValue,
      code,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      composed: true
    };
    for (const type of ["keydown", "keypress", "keyup"]) {
      try {
        target.dispatchEvent(new KeyboardEventCtor(type, init));
        dispatched = true;
      } catch {}
    }
    return dispatched;
  }

  function dispatchDeleteConfirmEnter(target) {
    return dispatchDeleteConfirmKey(target, "Enter") || dispatchDeleteConfirmKey(target, " ");
  }

  function clickDeleteConfirmButton(button, root = null) {
    if (!button || !button.isConnected || isDisabledElement(button)) return false;
    const target = deleteClickableElement(button);
    const point = modelCenterPoint(target) || modelCenterPoint(button);
    const pointTarget = modelElementFromPoint(point, target || button);
    const targets = [];
    const seen = new Set();
    const add = (element) => {
      const candidate = deleteClickableElement(element);
      if (!candidate || seen.has(candidate) || isDisabledElement(candidate)) return;
      if (!deleteConfirmActivationElementMatches(candidate, target, root)) return;
      if (!visible(candidate) && !modelRect(candidate)) return;
      seen.add(candidate);
      targets.push(candidate);
    };
    add(modelClickableAncestor(pointTarget));
    add(modelCustomActivationAncestor(pointTarget));
    add(pointTarget);
    add(target);
    add(button);
    for (let node = target?.parentElement, depth = 0; node && node !== document.body && depth < 3; node = node.parentElement, depth += 1) {
      add(node);
    }
    let clicked = false;
    for (const element of targets) {
      try { element.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
      try { element.focus?.({ preventScroll: true }); } catch {
        try { element.focus?.(); } catch {}
      }
      clicked = dispatchDeleteConfirmEnter(element) || clicked;
      clicked = dispatchPointerActivation(element, modelCenterPoint(element) || point) || clicked;
      clicked = nativeModelClick(element) || clicked;
    }
    try {
      activateElement(target || button);
      clicked = true;
    } catch {}
    return clicked;
  }

  async function clickDeleteConfirmIfPresent(timeoutMs = 4200) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    let clickedRoot = null;
    let clickedButton = null;
    let clickedAt = 0;
    while (Date.now() <= deadline) {
      if (clickedButton && deleteConfirmDialogClosed(clickedRoot, clickedButton)) return true;
      const info = findDeleteConfirmButtonInfo();
      const button = info?.element || null;
      if (button && (button !== clickedButton || Date.now() - clickedAt > 900) && clickDeleteConfirmButton(button, info.root || null)) {
        clickedRoot = info.root || null;
        clickedButton = button;
        clickedAt = Date.now();
        await sleep(220);
        if (deleteConfirmDialogClosed(clickedRoot, clickedButton)) return true;
      }
      await sleep(120);
    }
    if (clickedButton && deleteConfirmDialogClosed(clickedRoot, clickedButton)) return true;
    return false;
  }

  async function clickDeleteConfirmIfAppears(appearTimeoutMs = 900, closeTimeoutMs = 4200) {
    const deadline = Date.now() + Math.max(0, Number(appearTimeoutMs) || 0);
    while (Date.now() <= deadline) {
      if (findDeleteConfirmButton()) {
        const confirmed = await clickDeleteConfirmIfPresent(closeTimeoutMs);
        return { appeared: true, confirmed };
      }
      await sleep(80);
    }
    return { appeared: false, confirmed: false };
  }

  async function confirmKagiDeleteAfterMenuClick() {
    const result = await clickDeleteConfirmIfAppears(2600, 3200);
    if (result.confirmed) return true;
    if (result.appeared) return !deleteDialogRoots().length;
    return false;
  }

  let suppressShortcutBridgeUntil = 0;

  function dispatchDeleteKeyboardShortcut() {
    const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
    const init = {
      key: "Backspace",
      code: "Backspace",
      keyCode: 8,
      which: 8,
      bubbles: true,
      cancelable: true,
      composed: true,
      shiftKey: true,
      metaKey: mac,
      ctrlKey: !mac,
      altKey: false
    };
    const targets = [document.activeElement, document.body, document.documentElement, document, window].filter(Boolean);
    suppressShortcutBridgeUntil = Date.now() + 500;
    let dispatched = false;
    const seen = new Set();
    for (const target of targets) {
      if (!target || seen.has(target)) continue;
      seen.add(target);
      const KeyboardEventCtor = modelEventConstructor("KeyboardEvent", target);
      if (typeof KeyboardEventCtor !== "function") continue;
      for (const type of ["keydown", "keyup"]) {
        try {
          target.dispatchEvent(new KeyboardEventCtor(type, init));
          dispatched = true;
        } catch {}
      }
    }
    return dispatched;
  }

  function kagiChatIdFromHref(value) {
    const match = String(value || "").match(/\/chat\/([^/?#]+)/i);
    return match?.[1] || "";
  }

  function kagiCurrentThreadLink(data = {}) {
    const ids = new Set([
      location.href,
      data.currentThreadHref,
      data.currentHref,
      data.href,
      data.url
    ].map(kagiChatIdFromHref).filter(Boolean));
    const links = qsa("a[href*='/chat/']", document, { all: true })
      .filter((link) => visibleInViewport(link));
    if (!ids.size) return links[0] || null;
    return links.find((link) => ids.has(kagiChatIdFromHref(link.href || link.getAttribute?.("href")))) || null;
  }

  function kagiCurrentTitleToken() {
    const rawTitle = normalize((document.title || "").replace(/\s+-\s*Kagi Assistant\s*$/i, ""));
    return deleteCompactToken(rawTitle);
  }

  function kagiTitleRenameButtons() {
    const titleToken = kagiCurrentTitleToken();
    return qsa("button,[role='button']", document, { all: true })
      .filter((button) => {
        if (!visibleInViewport(button)) return false;
        const rect = modelRect(button);
        if (!rect || rect.top > 120 || rect.width < 32 || rect.height < 12 || rect.height > 64) return false;
        const value = deleteElementText(button);
        const compact = deleteCompactToken(value);
        return /clicktorename|rename|重命名/.test(compact)
          || (titleToken.length >= 4 && compact.includes(titleToken));
      })
      .sort((a, b) => {
        const ar = modelRect(a);
        const br = modelRect(b);
        return (ar?.top || 0) - (br?.top || 0) || (ar?.left || 0) - (br?.left || 0);
      });
  }

  function kagiTopThreadMenuTrigger() {
    const titleButtons = kagiTitleRenameButtons();
    const candidates = [];
    const seen = new Set();
    const selector = [
      "button",
      "[role='button']",
      "[aria-haspopup]",
      "[aria-expanded]",
      "[tabindex]:not([tabindex='-1'])"
    ].join(", ");
    const add = (element, titleButton, extraScore = 0) => {
      const target = deleteClickableElement(element);
      if (!target || seen.has(target) || target === titleButton || isDisabledElement(target)) return;
      if (!visibleInViewport(target)) return;
      const rect = modelRect(target);
      const titleRect = modelRect(titleButton);
      if (!rect || !titleRect || rect.top > 125 || rect.width < 8 || rect.height < 8 || rect.width > 90 || rect.height > 72) return;
      const verticalOverlap = rect.top < titleRect.bottom + 12 && rect.bottom > titleRect.top - 12;
      if (!verticalOverlap) return;
      const value = deleteElementText(target);
      const compact = deleteCompactToken(value);
      if (/newthread|showsidebar|markaspermanent|permanent|kagiproducts|settings|searchthreads|folders|newfolder|copy|edit|regenerate|scroll|发送|设置|新建|搜索/.test(compact)) return;
      const popup = String(target.getAttribute?.("aria-haspopup") || "").toLowerCase();
      const expanded = target.hasAttribute?.("aria-expanded");
      const signature = svgSignature(target);
      const rightGap = Math.abs(rect.left - titleRect.right);
      const immediateTitleNeighbor = rect.left >= titleRect.right - 8
        && rect.left <= titleRect.right + 42
        && rect.width <= 52
        && rect.height <= 52;
      const menuLike = popup === "menu"
        || popup === "true"
        || expanded
        || /more|menu|options|ellipsis|dots|dropdown|chevron|caret|arrow|down|triangle|更多|菜单|选项/.test(compact)
        || /more|ellipsis|dots|dropdown|chevron|caret|arrow|down|triangle/.test(signature)
        || (!compact && rect.width <= 48)
        || immediateTitleNeighbor;
      if (!menuLike) return;
      const closeToTitleRight = rect.left >= titleRect.left - 8 && rect.left <= titleRect.right + 110;
      if (!closeToTitleRight) return;
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore
          + (popup === "menu" || popup === "true" ? 360 : 0)
          + (expanded ? 120 : 0)
          + (/dropdown|chevron|caret|arrow|down|triangle/.test(signature) ? 260 : 0)
          + (/more|menu|options|更多|菜单|选项/.test(compact) ? 180 : 0)
          + (!compact && rect.width <= 48 ? 180 : 0)
          + Math.max(0, 280 - rightGap * 4)
          + Math.max(0, 90 - Math.abs((rect.top + rect.height / 2) - (titleRect.top + titleRect.height / 2))),
        top: rect.top,
        left: rect.left
      });
    };
    for (const titleButton of titleButtons) {
      for (let scope = titleButton.parentElement, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
        for (const element of layoutDeleteCandidates(scope, selector)) add(element, titleButton, 180 - depth * 12);
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.left - b.left);
    return candidates[0]?.element || null;
  }

  function kagiDeleteMenuItem(trigger = null, labels = ["Delete", "Delete thread", "Delete chat", "Remove", "删除"]) {
    const triggerRect = modelRect(trigger);
    const candidates = [];
    const seen = new Set();
    const add = (element, extraScore = 0) => {
      if (!element || seen.has(element) || !visible(element) || isDisabledElement(element)) return;
      const value = deleteElementText(element);
      if (!deleteLabelMatchesExactish(value, labels)) return;
      if (deleteLabelMatches(value, DELETE_CANCEL_LABELS)) return;
      const target = deleteClickableElement(element);
      if (!target || seen.has(target) || !visible(target) || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 24 || rect.height < 14 || rect.width > 360 || rect.height > 96) return;
      if (triggerRect) {
        const nearTrigger = rect.top >= triggerRect.top - 16
          && rect.top <= triggerRect.top + 360
          && rect.left >= triggerRect.left - 80
          && rect.left <= triggerRect.left + 260;
        if (!nearTrigger) return;
      }
      seen.add(element);
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore
          + (matches(target, "[role='menuitem'],[role='option'],button,[role='button']") ? 220 : 0)
          + (deleteLabelMatches(value, labels, { exact: true }) ? 300 : 0)
          + (triggerRect ? Math.max(0, 160 - Math.abs(rect.left - triggerRect.left)) : 0),
        top: rect.top,
        right: rect.right,
        area: rect.width * rect.height
      });
    };
    const selector = "[role='menuitem'],[role='option'],button,[role='button'],a[href],[tabindex]:not([tabindex='-1']),li,div,span";
    for (const root of visibleSelectorElements(DELETE_MENU_ROOT_SELECTORS)) {
      const rect = modelRect(root);
      if (triggerRect) {
        const nearRoot = rect
          && rect.top >= triggerRect.top - 24
          && rect.top <= triggerRect.top + 330
          && rect.left >= triggerRect.left - 120
          && rect.left <= triggerRect.left + 260;
        if (!nearRoot) continue;
      }
      for (const element of qsa(selector, root, { all: true })) add(element, 260);
    }
    if (!candidates.length) {
      for (const element of qsa(selector, document, { all: true })) add(element, 0);
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.top - a.top || a.area - b.area);
    return candidates[0]?.element || null;
  }

  async function openKagiTitleMenuAndClickDelete(trigger, labels) {
    if (!trigger || !deleteClickLayout(trigger)) return false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await sleep(attempt < 2 ? 45 : 75);
      const item = kagiDeleteMenuItem(trigger, labels);
      if (item && (deleteClick(item) || deleteClickLayout(item))) return true;
    }
    return false;
  }

  function hoverKagiThreadRow(row) {
    const rowRect = modelRect(row);
    if (!rowRect) return;
    const point = { clientX: Math.max(rowRect.left + 16, rowRect.right - 28), clientY: rowRect.top + rowRect.height / 2 };
    for (let target = row, depth = 0; target && target !== document.body && depth < 5; target = target.parentElement, depth += 1) {
      for (const type of ["pointerover", "mouseover", "mouseenter", "mousemove", "pointermove"]) {
        try {
          const EventCtor = type.startsWith("pointer") ? modelEventConstructor("PointerEvent", target) : modelEventConstructor("MouseEvent", target);
          target.dispatchEvent(new EventCtor(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            ...point
          }));
        } catch {}
      }
    }
  }

  function kagiThreadRowFromLink(link) {
    if (!link) return null;
    const linkRect = modelRect(link);
    let best = link;
    for (let node = link.parentElement, depth = 0; node && node !== document.body && depth < 6; node = node.parentElement, depth += 1) {
      const rect = modelRect(node);
      if (!rect || rect.width < 120 || rect.height < 20 || rect.height > 96) continue;
      if (linkRect && (rect.top > linkRect.top + 8 || rect.bottom < linkRect.bottom - 8)) continue;
      const hasMoreButton = qsa("button,[role='button'],[aria-haspopup]", node, { all: true })
        .some((item) => item !== link && modelRect(item));
      best = node;
      if (hasMoreButton) break;
    }
    return best;
  }

  function kagiThreadMoreButton(link) {
    const row = kagiThreadRowFromLink(link);
    if (!row) return null;
    reveal(row);
    hoverKagiThreadRow(row);
    const rowRect = modelRect(row);
    if (!modelRectInViewport(rowRect)) return null;
    const candidates = [];
    const seen = new Set();
    const add = (element, extraScore = 0) => {
      const target = deleteClickableElement(element);
      if (!target || seen.has(target) || target === link || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 8 || rect.height < 8 || rect.width > 84 || rect.height > 84) return;
      if (!visibleInViewport(target)) return;
      const overlaps = rect.top < rowRect.bottom + 10 && rect.bottom > rowRect.top - 10;
      if (!overlaps) return;
      const value = deleteElementText(target);
      const compact = deleteCompactToken(value);
      const popup = String(target.getAttribute?.("aria-haspopup") || "").toLowerCase();
      const signature = svgSignature(target);
      const moreLike = /more|options|menu|ellipsis|dots|更多|菜单|选项/.test(compact)
        || /more|ellipsis|dots|circle/.test(signature)
        || popup === "menu"
        || qsa("circle", target).length >= 2
        || (!compact && rect.width <= 48);
      if (!moreLike) return;
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore
          + (visibleInViewport(target) ? 160 : 40)
          + (/moreoptions|more|options|menu|更多|菜单|选项/.test(compact) ? 260 : 0)
          + (popup === "menu" ? 180 : 0)
          + (/more|ellipsis|dots|circle/.test(signature) ? 120 : 0)
          + Math.max(0, 90 - Math.abs(rect.right - rowRect.right)),
        right: rect.right
      });
    };
    for (let scope = row, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
      for (const button of layoutDeleteCandidates(scope, "button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1'])")) add(button, 80 - depth * 8);
    }
    for (const offset of [10, 22, 36, 54]) {
      const point = { x: Math.max(rowRect.left + 24, rowRect.right - offset), y: rowRect.top + rowRect.height / 2 };
      const pointTarget = modelElementFromPoint(point, row);
      if (pointTarget) add(pointTarget, 160 - offset);
      const pointButton = pointTarget && closest(pointTarget, "button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1'])");
      if (pointButton) add(pointButton, 180 - offset);
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right);
    return candidates[0]?.element || null;
  }

  async function deleteKagiThread(data = {}) {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6200);
      return confirmedExisting
        ? deleteResult(true, "kagi")
        : deleteResult(false, "kagi", "delete confirmation did not close");
    }
    const shortcutDispatched = dispatchDeleteKeyboardShortcut();
    if (!shortcutDispatched) return deleteResult(false, "kagi", "delete shortcut dispatch failed");
    const result = await clickDeleteConfirmIfAppears(2600, 3600);
    if (!result.appeared) return deleteResult(false, "kagi", "delete shortcut did not open confirmation");
    if (!result.confirmed && deleteDialogRoots().length) return deleteResult(false, "kagi", "delete confirmation did not close");
    if (!result.confirmed) return deleteResult(false, "kagi", "delete confirmation button not found");
    return deleteResult(true, "kagi");
  }

  async function deleteChatGptThread(data = {}) {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6200);
      return confirmedExisting
        ? deleteResult(true, "chatgpt")
        : deleteResultWithTrustedConfirm("chatgpt", "delete confirmation did not close");
    }
    const shortcutDispatched = dispatchDeleteKeyboardShortcut();
    if (!shortcutDispatched) {
      return data?.trustedKeySequenceRetried
        ? deleteResult(false, "chatgpt", "delete shortcut dispatch failed")
        : deleteResultWithTrustedDeleteShortcut("chatgpt", "delete shortcut dispatch failed");
    }
    const result = await clickDeleteConfirmIfAppears(2600, 4200);
    if (result.confirmed) return deleteResult(true, "chatgpt");
    if (result.appeared || deleteDialogRoots().length) {
      return deleteResultWithTrustedConfirm("chatgpt", "delete shortcut opened confirmation but it did not close");
    }
    return data?.trustedKeySequenceRetried
      ? deleteResult(false, "chatgpt", "delete shortcut did not open confirmation")
      : deleteResultWithTrustedDeleteShortcut("chatgpt", "delete shortcut did not open confirmation");
  }

  const DELETE_MENU_ROOT_SELECTORS = [
    "[role='menu']",
    "[role='listbox']",
    "[role='dialog']",
    "[data-radix-menu-content]",
    "[data-radix-popper-content-wrapper]",
    "[data-floating-ui-portal]",
    "[data-slot='dropdown-menu-content']",
    "[cmdk-root]",
    "[class*='dropdown' i]",
    "[class*='popover' i]",
    "[class*='popper' i]",
    "[class*='menu' i]"
  ];

  function menuRootsWithDelete(labels) {
    const roots = visibleSelectorElements(DELETE_MENU_ROOT_SELECTORS)
      .filter((root) => {
        const value = deleteElementText(root);
        return deleteLabelMatches(value, labels) || /rename|pin|share|重命名|置顶|分享/i.test(value);
      })
      .sort((a, b) => {
        const ar = modelRect(a);
        const br = modelRect(b);
        return (br?.right || 0) - (ar?.right || 0) || (ar?.top || 0) - (br?.top || 0);
      });
    const pushRoot = (root) => {
      if (!root || !visible(root)) return;
      const rect = modelRect(root);
      if (!rect || rect.width < 72 || rect.height < 28 || rect.width > 520 || rect.height > 620) return;
      const value = deleteElementText(root);
      if (!deleteLabelMatches(value, labels) && !/rename|pin|share|重命名|置顶|分享/i.test(value)) return;
      if (!roots.some((item) => item === root || item.contains?.(root) || root.contains?.(item))) roots.push(root);
    };
    for (const item of visibleDeleteCandidates(document)) {
      if (!deleteLabelMatches(deleteElementText(item), labels)) continue;
      for (let node = item; node && node !== document.body; node = node.parentElement) {
        pushRoot(node);
        if (roots.some((root) => root === node)) break;
      }
    }
    roots.sort((a, b) => {
      const ar = modelRect(a);
      const br = modelRect(b);
      return (br?.right || 0) - (ar?.right || 0) || (ar?.top || 0) - (br?.top || 0) || modelElementArea(a) - modelElementArea(b);
    });
    return roots;
  }

  function findDeleteMenuItem(root, labels) {
    const candidates = [];
    const cancelLabels = ["Cancel", "取消"];
    const seen = new Set();
    const add = (element, { exactOnly = false, extraScore = 0 } = {}) => {
      if (!element || seen.has(element)) return;
      const value = deleteElementText(element);
      if (!deleteLabelMatches(value, labels)) return;
      if (exactOnly && !deleteLabelMatchesExactish(value, labels)) return;
      if (deleteLabelMatches(value, cancelLabels)) return;
      const target = deleteClickableElement(element);
      if (!target || seen.has(target) || !visible(target) || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (exactOnly && (!rect || rect.width < 12 || rect.height < 10 || rect.width > 360 || rect.height > 90)) return;
      seen.add(element);
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore + (deleteLabelMatches(value, labels, { exact: true }) ? 500 : 0),
        top: rect?.top || 0,
        area: rect ? rect.width * rect.height : 0
      });
    };
    for (const element of visibleDeleteCandidates(root)) add(element);
    if (!candidates.length) {
      for (const element of qsa("[role='menuitem'],[role='option'],button,[role='button'],li,div,span", root, { all: true })) {
        if (!visible(element) || isDisabledElement(element)) continue;
        add(element, { exactOnly: true, extraScore: 180 });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.area - b.area);
    return candidates[0]?.element || null;
  }

  function findOpenDeleteMenuItem(labels) {
    const candidates = [];
    const seen = new Set();
    const menuRoots = visibleSelectorElements(DELETE_MENU_ROOT_SELECTORS);
    const add = (element, extraScore = 0) => {
      if (!element || seen.has(element) || !visible(element) || isDisabledElement(element)) return;
      const value = deleteElementText(element);
      if (!deleteLabelMatchesExactish(value, labels)) return;
      if (deleteLabelMatches(value, DELETE_CANCEL_LABELS)) return;
      const target = deleteClickableElement(element);
      if (!target || seen.has(target) || !visible(target) || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 8 || rect.height < 8 || rect.width > 420 || rect.height > 110) return;
      const root = menuRoots.find((item) => item === target || item.contains?.(target));
      seen.add(element);
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore + (root ? 320 : 0) + (matches(target, "[role='menuitem'],[role='option'],button,[role='button']") ? 160 : 0),
        top: rect.top,
        right: rect.right,
        area: rect.width * rect.height
      });
    };
    for (const root of menuRoots) {
      for (const element of qsa("[role='menuitem'],[role='option'],button,[role='button'],a[href],[tabindex]:not([tabindex='-1']),li,div,span", root, { all: true })) {
        add(element, 220);
      }
    }
    if (!candidates.length) {
      for (const element of qsa("[role='menuitem'],[role='option'],button,[role='button'],a[href],[tabindex]:not([tabindex='-1']),li,div,span", document, { all: true })) {
        add(element, 0);
      }
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top || a.area - b.area);
    return candidates[0]?.element || null;
  }

  async function openTriggerAndClickDelete(trigger, labels, { timeoutMs = 3200, allowHiddenTrigger = false } = {}) {
    if (!trigger || (!visible(trigger) && !allowHiddenTrigger)) return false;
    const existingRoot = menuRootsWithDelete(labels)[0] || null;
    if (!existingRoot && !(allowHiddenTrigger ? deleteClickLayout(trigger) : deleteClick(trigger))) return false;
    await sleep(140);
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const root = menuRootsWithDelete(labels)[0] || existingRoot;
      const item = (root ? findDeleteMenuItem(root, labels) : null) || findOpenDeleteMenuItem(labels);
      if (item && (deleteClick(item) || deleteClickLayout(item))) return true;
      await sleep(120);
    }
    return false;
  }

  function topRightMenuTrigger({ labels = [], selectors = [] } = {}) {
    const viewportWidth = Math.max(1, Number(window.innerWidth) || Number(document.documentElement?.clientWidth) || 1);
    const candidates = [];
    const seen = new Set();
    const selector = [
      ...selectors,
      "button",
      "[role='button']",
      "[aria-haspopup='menu']",
      "[aria-expanded]"
    ].join(", ");
    for (const element of qsa(selector, document, { all: true })) {
      const target = deleteClickableElement(element);
      if (!target || seen.has(target) || !visible(target) || isDisabledElement(target)) continue;
      seen.add(target);
      const rect = modelRect(target);
      if (!rect || rect.top > 190 || rect.right < viewportWidth * 0.45) continue;
      if (target.closest?.(DELETE_MENU_ROOT_SELECTORS.join(", "))) continue;
      const value = deleteElementText(target);
      const hasLabel = deleteLabelMatches(value, labels);
      const popup = String(target.getAttribute?.("aria-haspopup") || "").toLowerCase();
      const compact = deleteCompactToken(value);
      const hasMore = /more|menu|options|ellipsis|delete|rename|更多|菜单|选项|删除|重命名/.test(compact);
      const svg = svgSignature(target);
      const hasEllipsisIcon = /ellipsis|more|dots|circle/.test(svg) || (qsa("circle", target).length >= 2);
      if (!hasLabel && !hasMore && popup !== "menu" && !hasEllipsisIcon) continue;
      candidates.push({
        element: target,
        score: (hasLabel ? 900 : 0)
          + (hasMore ? 320 : 0)
          + (popup === "menu" ? 160 : 0)
          + (hasEllipsisIcon ? 140 : 0)
          + (rect.right >= viewportWidth * 0.72 ? 80 : 0)
          + (rect.width <= 64 ? 40 : 0),
        right: rect.right,
        top: rect.top
      });
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top);
    return candidates[0]?.element || null;
  }

  async function deleteGrokThread() {
    const labels = ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"];
    const trigger = topRightMenuTrigger({ labels: ["More", "More actions", "Menu", "Options", "更多", "菜单"] });
    if (!trigger) return deleteResult(false, "grok", "conversation menu trigger not found");
    if (!await openTriggerAndClickDelete(trigger, labels)) return deleteResult(false, "grok", "delete menu item not found");
    const confirmed = await clickDeleteConfirmIfPresent(5200);
    if (!confirmed && deleteDialogRoots().length) return deleteResult(false, "grok", "delete confirmation did not close");
    if (!confirmed) return deleteResult(false, "grok", "delete confirmation button not found");
    return deleteResult(true, "grok");
  }

  const GEMINI_DELETE_CONVERSATION_ACTION_SELECTOR = [
    "top-bar-actions conversation-actions-icon button[data-test-id='conversation-actions-menu-icon-button']",
    "top-bar-actions button[data-test-id='conversation-actions-menu-icon-button']",
    "top-bar-actions button.conversation-actions-menu-button",
    "top-bar-actions button[aria-label*='conversation actions' i]",
    "top-bar-actions button[aria-label*='open menu' i]",
    "button[data-test-id='conversation-actions-menu-icon-button']",
    "button.conversation-actions-menu-button",
    "button[aria-label*='Open menu for conversation actions' i]",
    "button[aria-label*='conversation actions' i]",
    "button[aria-label*='more options' i]",
    "button[data-test-id='actions-menu-button']"
  ].join(", ");
  const GEMINI_DELETE_MENU_ROOT_SELECTOR = [
    ".cdk-overlay-pane .mat-mdc-menu-panel[role='menu']",
    ".cdk-overlay-pane .mat-menu-panel[role='menu']",
    ".cdk-overlay-pane [role='menu']",
    ".cdk-overlay-pane .mat-mdc-menu-panel",
    ".cdk-overlay-pane .mat-menu-panel",
    ".mat-mdc-menu-panel[role='menu']",
    ".mat-menu-panel[role='menu']",
    ".cdk-overlay-pane"
  ].join(", ");
  const GEMINI_DELETE_MENU_ITEM_SELECTOR = [
    "button[mat-menu-item]",
    "button.mat-mdc-menu-item",
    "button[aria-label]",
    "button[jslog]",
    "button[data-test-id]",
    "[role='menuitem']",
    "[role='menuitemradio']",
    "[role='menuitemcheckbox']",
    "[role='button']",
    "[aria-label]",
    "[title]",
    "[jslog]",
    "[data-test-id]",
    "[tabindex]",
    "mat-icon",
    "span",
    "div"
  ].join(", ");
  const GEMINI_DELETE_MENU_MARKERS = ["Delete", "Rename", "Pin", "Share", "Unpin", "删除", "重命名", "固定", "取消固定", "分享"];

  function geminiDeleteCollectTextExcludingIcons(node, parts = []) {
    if (!node) return parts;
    if (node.nodeType === 3) {
      parts.push(node.nodeValue || "");
      return parts;
    }
    if (node.nodeType !== 1) return parts;
    const tagName = String(node.tagName || "").toLowerCase();
    if (tagName === "mat-icon") return parts;
    if (String(node.getAttribute?.("aria-hidden") || "").trim().toLowerCase() === "true") return parts;
    if (node.hasAttribute?.("fonticon") || node.hasAttribute?.("data-mat-icon-name")) return parts;
    try {
      for (const child of Array.from(node.childNodes || [])) geminiDeleteCollectTextExcludingIcons(child, parts);
    } catch {}
    return parts;
  }

  function geminiDeleteUiText(node) {
    if (!node) return "";
    const ariaLabel = node.getAttribute?.("aria-label");
    if (ariaLabel && String(ariaLabel).trim()) return normalize(ariaLabel);
    const title = node.getAttribute?.("title");
    if (title && String(title).trim()) return normalize(title);
    const withoutIcons = normalize(geminiDeleteCollectTextExcludingIcons(node, []).join(" "));
    if (withoutIcons) return withoutIcons;
    return normalize(node.textContent || "");
  }

  function geminiDeleteJslogId(node) {
    for (let current = node, depth = 0; current && depth < 5; current = current.parentElement, depth += 1) {
      const match = String(current.getAttribute?.("jslog") || "").match(/^\s*([0-9]+)/);
      if (match) return match[1];
    }
    return "";
  }

  function geminiDeleteDataTestIds(node) {
    const ids = [];
    const add = (item) => {
      const id = String(item?.getAttribute?.("data-test-id") || "").trim().toLowerCase();
      if (id && !ids.includes(id)) ids.push(id);
    };
    add(node);
    qsa("[data-test-id]", node, { all: true }).forEach(add);
    return ids;
  }

  function geminiDeleteMenuItemLooksLikeNotebook(node) {
    const value = normalize([geminiDeleteUiText(node), deleteElementText(node), geminiDeleteDataTestIds(node).join(" ")].join(" "));
    return /\bnotebook\b/i.test(value) || value.includes("笔记本");
  }

  function geminiDeleteMenuMarkerCount(node) {
    const value = normalize([geminiDeleteUiText(node), node?.textContent].filter(Boolean).join(" ")).toLowerCase();
    const matched = [];
    for (const marker of GEMINI_DELETE_MENU_MARKERS.map((item) => item.toLowerCase()).sort((a, b) => b.length - a.length)) {
      if (!value.includes(marker) || matched.some((existing) => existing.includes(marker))) continue;
      matched.push(marker);
    }
    return matched.length;
  }

  function geminiDeleteConversationMenuRoot(node) {
    if (!node || !visible(node)) return false;
    const tagName = String(node.tagName || "").toLowerCase();
    const role = String(node.getAttribute?.("role") || "").toLowerCase();
    if (tagName === "mat-dialog-container" || role === "dialog") return false;
    const isOverlay = Boolean(node.matches?.(".cdk-overlay-pane"));
    const panel = node.matches?.(".mat-mdc-menu-panel, .mat-menu-panel, [role='menu']")
      ? node
      : node.querySelector?.(".mat-mdc-menu-panel, .mat-menu-panel, [role='menu']");
    if (!panel && !isOverlay) return false;
    if (node.querySelector?.("mat-dialog-container, [role='dialog']")) return false;
    if (node.querySelector?.("button[data-test-id='delete-button'],button[data-test-id='pin-button'],button[data-test-id='rename-button'],button[aria-label*='Delete' i],button[aria-label*='Rename' i],button[aria-label*='Pin' i],button[aria-label*='Share' i]")) return true;
    return geminiDeleteMenuMarkerCount(node) > 0;
  }

  function geminiDeleteConversationActionButtonExcluded(button) {
    if (!button || !visible(button)) return true;
    if (button.closest?.("bard-sidenav, side-navigation-content, .sidenav-with-history-container, .conversation-items-container, side-nav-action-button")) return true;
    if (button.closest?.("input-area-v2, [data-node-type='input-area'], [contenteditable='true'], .prompt-input, .composer, .prompt-composer")) return true;
    if (button.closest?.("user-query,user-query-content,model-response,message-content,message-actions,response-actions,.message-actions,.response-actions,[data-test-id*='user-query' i],[data-test-id*='model-response' i],[data-test-id*='response' i],[data-test-id*='message' i],[data-test-id*='query' i]")) return true;
    if (button.closest?.(".cdk-overlay-pane .mat-mdc-menu-panel,.cdk-overlay-pane .mat-menu-panel,.cdk-overlay-pane [role='menu'],mat-dialog-container,[role='dialog']")) return true;
    return false;
  }

  function geminiDeleteConversationActionButton() {
    const candidates = [];
    for (const button of qsa(GEMINI_DELETE_CONVERSATION_ACTION_SELECTOR, document, { all: true })) {
      if (geminiDeleteConversationActionButtonExcluded(button)) continue;
      const dataTestId = String(button.getAttribute?.("data-test-id") || "").trim().toLowerCase();
      const ariaLabel = normalize(button.getAttribute?.("aria-label") || "").toLowerCase();
      const title = normalize(button.getAttribute?.("title") || "").toLowerCase();
      const textValue = geminiDeleteUiText(button).toLowerCase();
      const className = String(button.className || "").toLowerCase();
      const inTopBar = Boolean(button.closest?.("top-bar-actions"));
      const explicitlyConversationAction = inTopBar
        || dataTestId === "conversation-actions-menu-icon-button"
        || className.includes("conversation-actions-menu-button")
        || ariaLabel.includes("conversation actions")
        || ariaLabel.includes("open menu for conversation actions")
        || title.includes("conversation actions")
        || textValue.includes("conversation actions");
      if (!explicitlyConversationAction) continue;
      const box = modelRect(button);
      let score = 0;
      if (dataTestId === "conversation-actions-menu-icon-button") score += 160;
      if (dataTestId === "actions-menu-button") score += 70;
      if (className.includes("conversation-actions-menu-button")) score += 130;
      if (inTopBar) score += 120;
      if (ariaLabel.includes("conversation actions")) score += 100;
      if (ariaLabel.includes("open menu for conversation actions")) score += 140;
      if (inTopBar && ariaLabel.includes("more options")) score += 40;
      if (title.includes("conversation actions")) score += 60;
      if (textValue.includes("conversation actions")) score += 70;
      if (inTopBar && /more_vert/i.test(deleteElementText(button))) score += 35;
      if (box && box.top <= Math.max(220, (window.innerHeight || 1) * 0.32)) score += 20;
      if (box && box.left >= (window.innerWidth || 1) * 0.42) score += 20;
      candidates.push({ element: button, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.element || null;
  }

  function geminiDeleteConversationMenuRoots(trigger = null) {
    const roots = [];
    const add = (node) => {
      if (node && geminiDeleteConversationMenuRoot(node) && !roots.includes(node)) roots.push(node);
    };
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (controlsId) {
      try { add(document.getElementById(controlsId)); } catch {}
    }
    qsa(GEMINI_DELETE_MENU_ROOT_SELECTOR, document, { all: true }).forEach(add);
    return roots;
  }

  function geminiDeleteMenuItemMatches(node) {
    if (!node || !visible(node) || isDisabledElement(node) || geminiDeleteMenuItemLooksLikeNotebook(node)) return false;
    const uiText = geminiDeleteUiText(node);
    if (/\bdelete\b/i.test(uiText) || uiText.includes("删除")) return true;
    if (uiText) return false;
    if (geminiDeleteDataTestIds(node).includes("delete-button")) return true;
    return geminiDeleteJslogId(node) === "186000";
  }

  function findGeminiDeleteMenuItem(trigger = null) {
    const candidates = [];
    const seen = new Set();
    const roots = geminiDeleteConversationMenuRoots(trigger);
    const add = (node, root, extraScore = 0) => {
      if (!node || seen.has(node) || !geminiDeleteMenuItemMatches(node)) return;
      let target = deleteClickableElement(node) || node;
      if (target === root || geminiDeleteMenuMarkerCount(target) > 1) {
        target = closest(node, "button,[role='menuitem'],[role='button'],[mat-menu-item],[data-test-id],[jslog],[tabindex]") || node;
      }
      if (!target || target === root || seen.has(target) || !visible(target) || isDisabledElement(target) || geminiDeleteMenuMarkerCount(target) > 1 || geminiDeleteMenuItemLooksLikeNotebook(target)) return;
      const box = modelRect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 520 || box.height > 140) return;
      const ids = geminiDeleteDataTestIds(target);
      const uiText = geminiDeleteUiText(target);
      seen.add(node);
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore
          + (ids.includes("delete-button") ? 1000 : 0)
          + (geminiDeleteJslogId(target) === "186000" ? 800 : 0)
          + (/^(delete|删除)$/i.test(uiText) ? 650 : 0)
          + (target.matches?.("button,[role='menuitem'],[role='button']") ? 180 : 0),
        top: box.top,
        right: box.right
      });
    };
    for (let index = roots.length - 1; index >= 0; index -= 1) {
      const root = roots[index];
      qsa(GEMINI_DELETE_MENU_ITEM_SELECTOR, root, { all: true }).forEach((node) => add(node, root, 240 + index));
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top);
    return candidates[0]?.element || null;
  }

  async function clickGeminiDeleteMenuItem(trigger) {
    const menuReady = () => findGeminiDeleteMenuItem(trigger);
    let item = menuReady();
    if (!item) item = await deleteActivateUntil(trigger, menuReady, { settleMs: 220 });
    if (!item) return null;
    await sleep(120);
    item = findGeminiDeleteMenuItem(trigger) || item;
    return (deleteClick(item) || deleteClickLayout(item)) ? item : null;
  }

  async function deleteGeminiThread(data = {}) {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6500);
      return confirmedExisting
        ? deleteResult(true, "gemini")
        : deleteResultWithTrustedConfirm("gemini", "delete confirmation did not close");
    }
    if (data?.trustedMenuClickRetried) {
      const openItem = await waitForModel(() => findGeminiDeleteMenuItem(), 3000, 90);
      if (openItem) {
        deleteClick(openItem) || deleteClickLayout(openItem);
        const confirmedAfterTrustedMenu = await clickDeleteConfirmIfPresent(6500);
        if (confirmedAfterTrustedMenu) return deleteResult(true, "gemini");
        if (deleteDialogRoots().length) return deleteResultWithTrustedConfirm("gemini", "delete confirmation did not close");
        if (findGeminiDeleteMenuItem()) return deleteResult(false, "gemini", "trusted delete menu click did not open confirmation");
      }
      return deleteResult(false, "gemini", "trusted conversation menu click did not open delete menu");
    }
    const trigger = geminiDeleteConversationActionButton();
    if (!trigger) return deleteResult(false, "gemini", "conversation menu trigger not found");
    const clickedItem = await clickGeminiDeleteMenuItem(trigger);
    if (!clickedItem) return deleteResultWithTrustedMenuClick("gemini", "delete menu item not found", trigger);
    const confirmed = await clickDeleteConfirmIfPresent(6500);
    if (confirmed) return deleteResult(true, "gemini");
    if (deleteDialogRoots().length) return deleteResultWithTrustedConfirm("gemini", "delete confirmation did not close");
    const stillOpenItem = findGeminiDeleteMenuItem(trigger);
    if (stillOpenItem) return deleteResultWithTrustedMenuClick("gemini", "delete menu item did not open confirmation", stillOpenItem);
    return deleteResult(false, "gemini", "delete confirmation button not found");
  }

  function findNotionDeleteMenuTrigger() {
    const selectors = [
      "button[aria-label*='Delete, rename, and more' i]",
      "[role='button'][aria-label*='Delete, rename, and more' i]",
      "button[aria-label*='delete, rename' i]",
      "[role='button'][aria-label*='delete, rename' i]",
      "button[aria-label*='删除'][aria-label*='重命名']",
      "[role='button'][aria-label*='删除'][aria-label*='重命名']",
      "button[aria-label*='more' i][aria-haspopup='menu']",
      "[role='button'][aria-label*='more' i][aria-haspopup='menu']"
    ];
    return topRightMenuTrigger({ selectors, labels: ["Delete, rename, and more", "More", "更多", "删除", "重命名"] });
  }

  async function deleteNotionThread() {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6500);
      return confirmedExisting
        ? deleteResult(true, "notion")
        : deleteResultWithTrustedConfirm("notion", "delete confirmation did not close");
    }
    const labels = ["Delete", "Delete topic", "删除", "删除话题"];
    const trigger = findNotionDeleteMenuTrigger();
    if (!trigger) return deleteResult(false, "notion", "conversation menu trigger not found");
    if (!await openTriggerAndClickDelete(trigger, labels)) return deleteResult(false, "notion", "delete menu item not found");
    const confirmed = await clickDeleteConfirmIfPresent(6500);
    if (!confirmed && deleteDialogRoots().length) return deleteResultWithTrustedConfirm("notion", "delete confirmation did not close");
    if (!confirmed) return deleteResultWithTrustedConfirm("notion", "delete confirmation button not found");
    return deleteResult(true, "notion");
  }

  function deepSeekChatLinks(root = document) {
    return qsa("a[href*='/chat/s/'],a[href*='/a/chat/s/']", root, { all: true })
      .filter((link) => visible(link) && modelRect(link));
  }

  function deepSeekSidebarRootFromLinks() {
    const links = deepSeekChatLinks(document)
      .filter((link) => {
        const rect = modelRect(link);
        return rect && rect.left <= 470 && rect.width >= 100 && rect.height >= 20 && rect.height <= 96;
      });
    if (!links.length) return null;
    const currentId = deepSeekChatIdFromHref(location.href);
    const current = currentId ? links.find((link) => deepSeekChatIdFromHref(link.href || link.getAttribute?.("href")).includes(currentId)) : null;
    const seeds = current ? [current] : links.slice(0, 4);
    const scoreRoot = (root) => {
      if (!root || !root.isConnected) return null;
      const rect = modelRect(root);
      if (!rect || rect.left > 560 || rect.width < 120 || rect.width > 620 || rect.height < 40) return null;
      const rootLinks = deepSeekChatLinks(root).length;
      if (rootLinks < (current ? 1 : 2)) return null;
      const value = deleteElementText(root);
      const className = String(root.className || "");
      const hasHistoryText = /today|yesterday|pinned|new chat|今天|昨天|新聊天|置顶/i.test(value);
      const looksScrollable = /scroll|history|sidebar|sider/i.test(className);
      if (!hasHistoryText && !looksScrollable && rootLinks < 3) return null;
      return (looksScrollable ? 900 : 0) + Math.min(rootLinks, 12) * 80 + Math.min(rect.height, 900) * 0.02 - rect.left;
    };
    const candidates = [];
    const seen = new Set();
    for (const seed of seeds) {
      for (let node = seed; node && node !== document.body; node = node.parentElement) {
        if (seen.has(node)) continue;
        seen.add(node);
        const score = scoreRoot(node);
        if (score == null) continue;
        candidates.push({ element: node, score, area: modelElementArea(node) });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.area - b.area);
    return candidates[0]?.element || null;
  }

  function deepSeekSidebarRoot() {
    const linkRoot = deepSeekSidebarRootFromLinks();
    if (linkRoot) return linkRoot;
    return null;
  }

  function findDeepSeekSidebarToggle() {
    const direct = firstVisibleBySelectors([
      "button[aria-label*='sidebar' i]",
      "[role='button'][aria-label*='sidebar' i]",
      "button[title*='sidebar' i]",
      "[role='button'][title*='sidebar' i]",
      "button:has(svg path[d*='M9.67269'])",
      "[role='button']:has(svg path[d*='M9.67269'])"
    ]);
    if (direct) return direct;
    const candidates = visibleSelectorElements("button,[role='button']")
      .map((element) => ({ element, rect: modelRect(element), text: deleteElementText(element), svg: svgSignature(element) }))
      .filter((item) => item.rect && item.rect.top <= 90 && item.rect.left <= 130 && item.rect.width >= 20 && item.rect.width <= 64 && item.rect.height >= 20 && item.rect.height <= 64)
      .filter((item) => /sidebar|menu|panel|sider|侧边栏|菜单/i.test(item.text) || /sidebar|panel|menu|M9\.67269/i.test(item.svg));
    candidates.sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
    return candidates[0]?.element || findDeepSeekTopHeaderIconButton(0) || findDeepSeekTopHeaderIconButton(1) || null;
  }

  function findDeepSeekTopHeaderIconButton(indexFromLeft = 0) {
    const buttons = visibleSelectorElements("button,a[href],[role='button'],[onclick],[tabindex]:not([tabindex='-1'])")
      .map((element) => ({ element, rect: modelRect(element), text: deleteElementText(element) }))
      .filter((item) => item.rect && item.rect.top >= 0 && item.rect.top < 90 && item.rect.left >= 0 && item.rect.left < 420)
      .filter((item) => item.rect.width >= 16 && item.rect.width <= 56 && item.rect.height >= 16 && item.rect.height <= 56)
      .filter((item) => !deleteCompactToken(item.text));
    buttons.sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
    return buttons[indexFromLeft]?.element || buttons[0]?.element || null;
  }

  async function clickDeepSeekSidebarToggleByPoint() {
    const points = [
      { x: 22, y: 28 },
      { x: 22, y: 44 },
      { x: 22, y: 60 },
      { x: 46, y: 28 },
      { x: 46, y: 44 },
      { x: 46, y: 60 }
    ];
    for (const point of points) {
      const target = modelElementFromPoint(point);
      const button = deleteClickableElement(target);
      const rect = modelRect(button);
      if (!button || !rect || !visible(button) || isDisabledElement(button)) continue;
      if (rect.top > 96 || rect.left > 110 || rect.width > 80 || rect.height > 80) continue;
      if (!dispatchPointerActivation(button, point) && !nativeModelClick(button) && !modelDirectClick(button)) continue;
      if (await waitForModel(deepSeekSidebarRoot, 1400, 100)) return true;
    }
    return false;
  }

  async function ensureDeepSeekSidebarOpen() {
    if (deepSeekSidebarRoot()) return true;
    const toggle = findDeepSeekSidebarToggle();
    if (toggle && deleteClick(toggle) && await waitForModel(deepSeekSidebarRoot, 3200, 120)) return true;
    return clickDeepSeekSidebarToggleByPoint();
  }

  function deepSeekTitleTokenFromValue(value) {
    const raw = normalize(value || "")
      .replace(/\s*[-|–]\s*DeepSeek.*$/i, "")
      .replace(/\s*-\s*深度求索.*$/i, "");
    const token = deleteCompactToken(raw);
    return /^(deepseek|deepseekintotheunknown|intotheunknown|newchat|新聊天)$/.test(token) ? "" : token;
  }

  function deepSeekChatIdFromHref(value) {
    const match = String(value || "").match(/\/(?:a\/)?chat\/s\/([^/?#]+)/i);
    return match?.[1] || "";
  }

  function deepSeekDeleteHints(data = {}) {
    const hrefs = [
      location.href,
      data.currentThreadHref,
      data.currentHref,
      data.cachedHref,
      data.href,
      data.url
    ].filter(Boolean);
    const ids = new Set(hrefs.map(deepSeekChatIdFromHref).filter(Boolean));
    const titleTokens = new Set([
      document.title,
      data.currentTitle,
      data.title
    ].map(deepSeekTitleTokenFromValue).filter(Boolean));
    return {
      ids: Array.from(ids),
      titleTokens: Array.from(titleTokens),
      hasTarget: ids.size > 0 || titleTokens.size > 0
    };
  }

  function deepSeekTopicRows(root, hints = deepSeekDeleteHints()) {
    const candidates = [];
    const seen = new Set();
    for (const element of qsa("a,button,[role='button'],li,div", root || document, { all: true })) {
      if (!element || seen.has(element) || !visible(element)) continue;
      const rect = modelRect(element);
      if (!rect || rect.left > 560 || rect.width < 120 || rect.height < 26 || rect.height > 110) continue;
      const value = deleteElementText(element);
      const compact = deleteCompactToken(value);
      if (!compact || compact.length < 2 || compact.length > 120) continue;
      if (/^(today|yesterday|newchat|threads|history|今天|昨天|新聊天|历史)$/.test(compact)) continue;
      if (/rename|pin|share|delete|cancel|搜索|设置|删除|重命名|分享|置顶/i.test(value)) continue;
      const target = deleteClickableElement(element);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      const href = String(element.href || element.getAttribute?.("href") || target.href || target.getAttribute?.("href") || "");
      const hrefToken = deleteCompactToken(href);
      const className = String(target.className || element.className || "");
      const active = /\b(active|selected|current)\b/i.test(className) || String(target.getAttribute?.("aria-current") || "").toLowerCase() === "page";
      const titleMatch = hints.titleTokens?.some((token) => compact.includes(token) || token.includes(compact));
      const urlMatch = hints.ids?.some((id) => href.includes(id) || hrefToken.includes(deleteCompactToken(id)));
      candidates.push({
        element: target,
        score: (urlMatch ? 1100 : 0) + (titleMatch ? 900 : 0) + (active ? 520 : 0) + (rect.top < 180 ? 120 : 0) - rect.top * 0.02,
        rect
      });
    }
    candidates.sort((a, b) => b.score - a.score || a.rect.top - b.rect.top);
    return candidates.filter((item) => item.score >= 500).map((item) => item.element);
  }

  function findDeepSeekCurrentTopicRow(root, hints = deepSeekDeleteHints()) {
    const links = deepSeekChatLinks(root || document);
    const currentId = hints.ids?.[0] || deepSeekChatIdFromHref(location.href);
    if (currentId) {
      const exact = links.find((link) => deepSeekChatIdFromHref(link.href || link.getAttribute?.("href")) === currentId);
      if (exact) return exact;
    }
    const selected = links.find((link) => {
      const className = String(link.className || "");
      const ariaCurrent = String(link.getAttribute?.("aria-current") || "").toLowerCase();
      return /\b(active|selected|current)\b/i.test(className) || ariaCurrent === "page";
    });
    return selected || deepSeekTopicRows(root, hints)[0] || null;
  }

  function deepSeekVisualTopicRow(row) {
    const rowRect = modelRect(row);
    if (!row || !rowRect) return row;
    const rowText = deleteCompactToken(deleteElementText(row));
    let best = { element: row, score: 0 };
    for (let node = row, depth = 0; node && node !== document.body && depth < 8; node = node.parentElement, depth += 1) {
      const rect = modelRect(node);
      if (!rect || rect.left > 560 || rect.width < 110 || rect.width > 620 || rect.height < 28 || rect.height > 110) continue;
      if (rect.top > rowRect.top + 10 || rect.bottom < rowRect.bottom - 10) continue;
      const token = deleteCompactToken(deleteElementText(node));
      if (rowText && token && !token.includes(rowText) && !rowText.includes(token)) continue;
      const className = String(node.className || "");
      const active = /\b(active|selected|current)\b/i.test(className) || String(node.getAttribute?.("aria-current") || "").toLowerCase() === "page";
      const buttons = qsa("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", node, { all: true }).length;
      const score = rect.width + (active ? 420 : 0) + Math.min(buttons, 3) * 90 - depth * 12;
      if (score > best.score) best = { element: node, score };
    }
    return best.element || row;
  }

  function deepSeekRowMenuRightEdge(row, visualRow = row) {
    const rowRect = modelRect(visualRow) || modelRect(row);
    if (!rowRect) return rowRect?.right || 0;
    const roots = [];
    const sidebar = deepSeekSidebarRoot();
    if (sidebar) roots.push(sidebar);
    for (let node = visualRow || row; node && node !== document.body && roots.length < 8; node = node.parentElement) roots.push(node);
    const candidates = roots
      .map((element) => ({ element, rect: modelRect(element) }))
      .filter((item) => item.rect
        && item.rect.left <= 560
        && item.rect.width >= 140
        && item.rect.width <= 620
        && item.rect.top <= rowRect.top + 8
        && item.rect.bottom >= rowRect.bottom - 8)
      .map((item) => item.rect.right);
    return Math.max(rowRect.right, ...candidates);
  }

  function deepSeekTopicMenuRect(row) {
    const visualRow = deepSeekVisualTopicRow(row);
    const rowRect = modelRect(visualRow) || modelRect(row);
    if (!rowRect) return null;
    const right = Math.max(rowRect.right, deepSeekRowMenuRightEdge(row, visualRow));
    return {
      left: rowRect.left,
      top: rowRect.top,
      right,
      bottom: rowRect.bottom,
      width: right - rowRect.left,
      height: rowRect.height
    };
  }

  function deepSeekTrustedMenuClick(row, trigger = null, reason = "topic menu trigger requires trusted browser input") {
    const rowRect = deepSeekTopicMenuRect(row);
    const triggerClick = trustedMenuClickForElement(trigger, "deepseek", reason);
    if (!rowRect) return triggerClick;
    const y = rowRect.top + rowRect.height / 2;
    const points = [18, 28, 38, 48, 60, 76, 96, 118, 142]
      .map((offset) => ({
        x: Math.max(rowRect.left + 16, rowRect.right - offset),
        y
      }));
    if (triggerClick?.framePoint) points.push(triggerClick.framePoint);
    const seen = new Set();
    const framePoints = points
      .map((point) => ({
        x: Math.round(Number(point.x) * 100) / 100,
        y: Math.round(Number(point.y) * 100) / 100
      }))
      .filter((point) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
        const key = `${point.x},${point.y}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const primary = framePoints[0];
    const trustedMenuClick = primary
      ? trustedMenuClickPoint("deepseek", reason, primary, serializableDeleteRect(rowRect))
      : triggerClick;
    return trustedMenuClick ? { ...trustedMenuClick, framePoints, hoverSettleMs: 360 } : null;
  }

  function deleteResultWithDeepSeekTrustedMenuClick(reason, row, trigger = null) {
    const trustedMenuClick = deepSeekTrustedMenuClick(row, trigger, reason);
    return deleteResult(false, "deepseek", reason, trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {});
  }

  function deepSeekTrustedKeySequence(row, reason = "topic menu trigger requires keyboard focus") {
    const rowRect = deepSeekTopicMenuRect(row);
    const visualRect = modelRect(deepSeekVisualTopicRow(row)) || modelRect(row) || rowRect;
    if (!rowRect || !visualRect) return null;
    const focusX = Math.min(
      rowRect.right - 104,
      Math.max(rowRect.left + 24, visualRect.left + Math.min(180, visualRect.width * 0.42))
    );
    return {
      kind: "topic-menu-keyboard",
      site: "deepseek",
      reason: String(reason || ""),
      framePoint: {
        x: Math.round(focusX * 100) / 100,
        y: Math.round((rowRect.top + rowRect.height / 2) * 100) / 100
      },
      frameRect: serializableDeleteRect(rowRect),
      keys: [
        { key: "Tab", settleMs: 140 },
        { key: "Enter", settleMs: 260 }
      ],
      clickSettleMs: 160,
      keySettleMs: 140,
      settleMs: 460
    };
  }

  function deleteResultWithDeepSeekTrustedKeySequence(reason, row) {
    const trustedKeySequence = deepSeekTrustedKeySequence(row, reason);
    const trustedMenuClick = deepSeekTrustedMenuClick(row, null, reason);
    return deleteResult(false, "deepseek", reason, {
      ...(trustedKeySequence ? { needsTrustedKeySequence: true, trustedKeySequence } : {}),
      ...(trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {})
    });
  }

  function deleteResultWithDeepSeekTrustedHover(reason, row) {
    const rowRect = deepSeekTopicMenuRect(row);
    const trustedHover = rowRect
      ? {
        kind: "topic-menu-hover",
        site: "deepseek",
        reason: String(reason || ""),
        framePoint: {
          x: Math.round(Math.max(rowRect.left + 16, rowRect.right - 28) * 100) / 100,
          y: Math.round((rowRect.top + rowRect.height / 2) * 100) / 100
        },
        frameRect: serializableDeleteRect(rowRect),
        hoverSettleMs: 520
      }
      : trustedHoverRightEdge(deepSeekVisualTopicRow(row) || row, "deepseek", reason);
    return deleteResult(false, "deepseek", reason, trustedHover ? { needsTrustedHover: true, trustedHover } : {});
  }

  function closeDeepSeekTransientMenus() {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
    } catch {}
  }

  function deepSeekHeaderMenuButton(hints = deepSeekDeleteHints()) {
    const titleTokens = (hints.titleTokens || []).filter(Boolean);
    if (!titleTokens.length) return null;
    const titleNodes = [];
    const seenTitles = new Set();
    for (const element of qsa("h1,h2,h3,button,[role='button'],div,span", document, { all: true })) {
      if (!element || seenTitles.has(element) || !visible(element)) continue;
      const rect = modelRect(element);
      if (!rect || rect.top < 0 || rect.top > 190 || rect.left < 120 || rect.width < 20 || rect.height < 14 || rect.height > 92) continue;
      if (String(element.href || element.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) continue;
      const token = deleteCompactToken(deleteElementText(element));
      if (!token || !titleTokens.some((item) => token.includes(item) || item.includes(token))) continue;
      seenTitles.add(element);
      titleNodes.push({ element, rect });
    }
    const candidates = [];
    const seenButtons = new Set();
    const addButton = (button, titleRect, extraScore = 0) => {
      const target = deleteClickableElement(button);
      if (!target || seenButtons.has(target) || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 10 || rect.height < 10 || rect.width > 76 || rect.height > 76) return;
      if (rect.top > titleRect.bottom + 34 || rect.bottom < titleRect.top - 34) return;
      if (rect.left < titleRect.left - 72 || rect.left > titleRect.right + 260) return;
      if (String(target.href || target.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) return;
      const value = deleteElementText(target);
      const token = deleteCompactToken(value);
      if (/newchat|sidebar|back|close|search|send|deepthink|model|expert|share|copy|新聊天|侧边栏|返回|关闭|搜索|发送|分享|复制/.test(token)) return;
      const signature = deleteCompactToken(svgSignature(target));
      const iconish = !token || /more|menu|options|ellipsis|dots|circle|kebab|更多|菜单|选项/.test(token + signature) || qsa("circle", target, { all: true }).length >= 2 || rect.width <= 44;
      if (!iconish) return;
      seenButtons.add(target);
      candidates.push({
        element: target,
        score: extraScore
          + (rect.left >= titleRect.right - 8 ? 520 : 0)
          + (!token ? 180 : 0)
          + (/more|menu|options|ellipsis|dots|更多|菜单|选项/.test(token + signature) ? 360 : 0)
          + (/circle|dots|ellipsis|kebab/.test(signature) ? 180 : 0)
          + Math.max(0, 160 - Math.abs(rect.left - titleRect.right)),
        right: rect.right,
        left: rect.left
      });
    };
    for (const { element, rect: titleRect } of titleNodes.slice(0, 8)) {
      for (let scope = element, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
        const scopeRect = modelRect(scope);
        if (!scopeRect || scopeRect.top > 210 || scopeRect.height > 180 || scopeRect.width > 900) continue;
        for (const button of layoutDeleteCandidates(scope, "button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])")) {
          addButton(button, titleRect, 120 - depth * 12);
        }
      }
      for (const button of qsa("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", document, { all: true })) {
        addButton(button, titleRect, 0);
      }
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.left - a.left);
    return candidates[0]?.element || null;
  }

  function hoverDeepSeekTopicRow(row) {
    const rowRect = modelRect(row);
    if (!rowRect) return;
    const point = { clientX: Math.max(rowRect.left + 16, rowRect.right - 24), clientY: rowRect.top + rowRect.height / 2 };
    const targets = [];
    for (let node = row; node && node !== document.body && targets.length < 5; node = node.parentElement) targets.push(node);
    for (const target of targets) {
      for (const type of ["pointerover", "mouseover", "mouseenter", "mousemove", "pointermove"]) {
        try {
          const EventCtor = type.startsWith("pointer") ? modelEventConstructor("PointerEvent", target) : modelEventConstructor("MouseEvent", target);
          target.dispatchEvent(new EventCtor(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            ...point
          }));
        } catch {}
      }
    }
  }

  function deepSeekTopicMoreButton(row) {
    if (!row) return null;
    reveal(row);
    const visualRow = deepSeekVisualTopicRow(row);
    const rowRect = deepSeekTopicMenuRect(row);
    hoverDeepSeekTopicRow(visualRow || row);
    if (!rowRect) return null;
    const candidates = [];
    const seen = new Set();
    const add = (button, source = "", extraScore = 0) => {
      const target = deleteClickableElement(button);
      if (!target || seen.has(target) || target === row || isDisabledElement(target)) return;
      const rect = modelRect(target);
      if (!rect || rect.width < 10 || rect.height < 10 || rect.width > 72 || rect.height > 72) return;
      const overlaps = rect.top < rowRect.bottom + 10 && rect.bottom > rowRect.top - 10;
      const nearRight = rect.left >= rowRect.right - 120 && rect.left <= rowRect.right + 80;
      if (!overlaps || !nearRight) return;
      const value = deleteElementText(target);
      const compact = deleteCompactToken(value);
      if (compact && !/more|options|menu|ellipsis|dots|更多|菜单|选项/.test(compact)) return;
      if (String(target.href || target.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) return;
      const signature = svgSignature(target);
      const iconish = !compact || /more|options|menu|ellipsis|dots|circle/.test(signature) || qsa("circle", target).length >= 2 || rect.width <= 44;
      if (!iconish) return;
      seen.add(target);
      candidates.push({
        element: target,
        score: extraScore
          + (visible(target) ? 140 : 40)
          + (!compact ? 180 : 0)
          + (/more|options|menu|更多|菜单|选项/.test(compact) ? 220 : 0)
          + (/ellipsis|more|dots|circle/.test(signature) ? 120 : 0)
          + Math.max(0, 90 - Math.abs((rect.left + rect.right) / 2 - (rowRect.right - 28))),
        right: rect.right,
        source
      });
    };
    const scopes = [];
    for (const seed of [visualRow, row]) {
      for (let node = seed; node && node !== document.body && scopes.length < 8; node = node.parentElement) {
        if (!scopes.includes(node)) scopes.push(node);
      }
    }
    const iconSelector = "button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i],svg,[class*='more' i],[class*='menu' i],[class*='option' i],[class*='action' i],[class*='ellipsis' i]";
    for (const scope of scopes) {
      for (const button of layoutDeleteCandidates(scope, iconSelector)) add(button, "scope", 80);
    }
    for (const offset of [18, 28, 38, 48, 60, 76, 96, 118, 142]) {
      const point = { x: Math.max(rowRect.left + 16, rowRect.right - offset), y: rowRect.top + rowRect.height / 2 };
      const pointTarget = modelElementFromPoint(point, row);
      if (pointTarget) add(pointTarget, "point", 160 - offset);
      const pointButton = pointTarget && closest(pointTarget, iconSelector);
      if (pointButton) add(pointButton, "point-button", 180 - offset);
    }
    for (const button of qsa(iconSelector, document, { all: true })) add(button, "nearby", 0);
    candidates.sort((a, b) => b.score - a.score || b.right - a.right);
    return candidates[0]?.element || null;
  }

  async function openDeepSeekTriggerAndClickDelete(trigger, labels, { timeoutMs = 3200, allowHiddenTrigger = false } = {}) {
    if (!trigger) return false;
    const menuReady = () => menuRootsWithDelete(labels)[0] || findOpenDeleteMenuItem(labels);
    const existing = menuReady();
    if (!existing && !await deleteActivateUntil(trigger, menuReady, { allowHidden: allowHiddenTrigger, settleMs: 220 })) return false;
    await sleep(140);
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const root = menuRootsWithDelete(labels)[0] || null;
      const item = (root ? findDeleteMenuItem(root, labels) : null) || findOpenDeleteMenuItem(labels);
      if (item && (deleteClick(item) || deleteClickLayout(item))) return true;
      await sleep(120);
    }
    return false;
  }

  async function deleteDeepSeekThread(data = {}) {
    if (!await ensureDeepSeekSidebarOpen()) return deleteResult(false, "deepseek", "sidebar could not be opened");
    const labels = ["Delete", "删除"];
    if (data?.trustedMenuClickRetried || data?.trustedKeySequenceRetried) {
      const deleteItem = await waitForModel(() => findOpenDeleteMenuItem(labels), 3200, 90);
      if (deleteItem && (deleteClick(deleteItem) || deleteClickLayout(deleteItem))) {
        const confirmedAfterTrustedMenu = await clickDeleteConfirmIfPresent(6500);
        if (!confirmedAfterTrustedMenu) return deleteResult(false, "deepseek", "delete confirmation button not found");
        return deleteResult(true, "deepseek");
      }
      if (data?.trustedMenuClickRetried) {
        return deleteResult(false, "deepseek", "trusted topic menu click did not open");
      }
    }
    const bridged = await requestDeepSeekDeleteBridge(10500, data);
    if (bridged?.needsTrustedHover && bridged.trustedHover) {
      return deleteResult(false, "deepseek", bridged.reason || "topic menu trigger requires trusted hover", {
        needsTrustedHover: true,
        trustedHover: bridged.trustedHover
      });
    }
    if (bridged?.needsTrustedMenuClick && bridged.trustedMenuClick) {
      return deleteResult(false, "deepseek", bridged.reason || "topic menu trigger requires trusted browser input", {
        needsTrustedMenuClick: true,
        trustedMenuClick: bridged.trustedMenuClick
      });
    }
    if (bridged?.needsTrustedKeySequence && bridged.trustedKeySequence) {
      return deleteResult(false, "deepseek", bridged.reason || "topic menu trigger requires keyboard focus", {
        needsTrustedKeySequence: true,
        trustedKeySequence: bridged.trustedKeySequence
      });
    }
    if (bridged?.ok) return deleteResult(true, "deepseek");
    const bridgeReason = bridged?.reason || "";
    if (bridgeReason && !/bridge timeout|bridge failed/i.test(bridgeReason)) {
      const confirmedAfterBridge = await clickDeleteConfirmIfPresent(1800);
      if (confirmedAfterBridge) return deleteResult(true, "deepseek");
    }
    const root = deepSeekSidebarRoot();
    const hints = deepSeekDeleteHints(data);
    const headerButton = deepSeekHeaderMenuButton(hints);
    if (headerButton && await openDeepSeekTriggerAndClickDelete(headerButton, labels, { timeoutMs: 2600, allowHiddenTrigger: true })) {
      const confirmedFromHeader = await clickDeleteConfirmIfPresent(6500);
      if (!confirmedFromHeader) return deleteResult(false, "deepseek", bridgeReason || "delete confirmation button not found");
      return deleteResult(true, "deepseek");
    }
    if (headerButton) closeDeepSeekTransientMenus();
    const row = findDeepSeekCurrentTopicRow(root, hints);
    if (!row) return deleteResult(false, "deepseek", bridgeReason || "current topic row not found");
    const moreButton = await waitForModel(() => deepSeekTopicMoreButton(row), 1600, 100);
    if (!moreButton) {
      const reason = bridgeReason || "topic menu trigger not found";
      return data?.trustedMenuClickRetried
        ? deleteResult(false, "deepseek", reason)
        : data?.trustedKeySequenceRetried
          ? deleteResultWithDeepSeekTrustedMenuClick(reason, row)
          : deleteResultWithDeepSeekTrustedKeySequence(reason, row);
    }
    if (!await openDeepSeekTriggerAndClickDelete(moreButton, labels, { timeoutMs: 2600, allowHiddenTrigger: true })) {
      const reason = bridgeReason || "delete menu item not found";
      return data?.trustedMenuClickRetried
        ? deleteResult(false, "deepseek", reason)
        : data?.trustedKeySequenceRetried
          ? deleteResultWithDeepSeekTrustedMenuClick(reason, row, moreButton)
          : deleteResultWithDeepSeekTrustedKeySequence(reason, row);
    }
    const confirmed = await clickDeleteConfirmIfPresent(6500);
    if (!confirmed) return deleteResult(false, "deepseek", bridgeReason || "delete confirmation button not found");
    return deleteResult(true, "deepseek");
  }

  const TOPIC_DELETE_FALLBACK_CONFIGS = Object.freeze({
    chatgpt: Object.freeze({
      id: "chatgpt",
      name: "ChatGPT",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 15000
    }),
    gemini: Object.freeze({
      id: "gemini",
      name: "Gemini",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 18000
    }),
    kagi: Object.freeze({
      id: "kagi",
      name: "Kagi Assistant",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 15000
    }),
    grok: Object.freeze({
      id: "grok",
      name: "Grok",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 15000
    }),
    grokMirror: Object.freeze({
      id: "grokMirror",
      name: "Grok Mirror",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 15000
    }),
    notion: Object.freeze({
      id: "notion",
      name: "Notion AI",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 15000
    }),
    deepseek: Object.freeze({
      id: "deepseek",
      name: "DeepSeek",
      builtIn: true,
      enabled: true,
      userscript: "",
      userscriptTimeoutMs: 36000
    })
  });

  function topicDeleteFallbackConfig(config = {}, payload = {}) {
    const id = String(config?.id || "").trim().toLowerCase();
    const app = `${payload?.appId || ""} ${payload?.appName || ""} ${config?.name || ""}`.toLowerCase();
    const host = String(location.hostname || "").toLowerCase();
    let fallback = null;
    if (id === "chatgpt" || /chatgpt|chat gpt/.test(app) || host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com" || host.endsWith(".chat.openai.com")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.chatgpt;
    else if (id === "gemini" || /gemini/.test(app) || host === "gemini.google.com" || host.endsWith(".gemini.google.com")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.gemini;
    else if (id === "kagi" || /kagi/.test(app) || host === "assistant.kagi.com") fallback = TOPIC_DELETE_FALLBACK_CONFIGS.kagi;
    else if (id === "grokmirror" || /grokmirror|grok mirror/.test(app) || host === "gk.dairoot.cn" || host.endsWith(".gk.dairoot.cn")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.grokMirror;
    else if (id === "grok" || /grok/.test(app) || host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.grok;
    else if (id === "notion" || /notion/.test(app) || host === "app.notion.com" || host === "notion.so" || host === "www.notion.so" || host.endsWith(".notion.so")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.notion;
    else if (id === "deepseek" || /deepseek/.test(app) || host === "chat.deepseek.com" || host === "deepseek.com" || host.endsWith(".deepseek.com")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.deepseek;
    if (!fallback) return null;
    const sourceMode = config?.sourceMode === "custom" || Boolean(config?.customUserscript || config?.userscriptOverride)
      ? "custom"
      : "builtIn";
    const userscript = String(sourceMode === "custom"
      ? config?.customUserscript || config?.userscript || ""
      : fallback.userscript || config?.userscript || "").trim();
    return {
      ...fallback,
      ...config,
      id: config?.id || fallback.id,
      name: config?.name || fallback.name,
      builtIn: config?.builtIn !== false,
      enabled: config?.enabled !== false,
      sourceMode,
      userscript,
      ...(sourceMode === "custom" ? { customUserscript: userscript } : {}),
      userscriptLength: userscript.length,
      userscriptTimeoutMs: Number(config?.userscriptTimeoutMs) || fallback.userscriptTimeoutMs || 15000
    };
  }

  const TOPIC_DELETE_REQUEST_EVENT = PROTOCOL.TOPIC_DELETE_REQUEST_EVENT;
  const TOPIC_DELETE_MENU_COMMAND_EVENT = PROTOCOL.TOPIC_DELETE_MENU_COMMAND_EVENT;
  const TOPIC_DELETE_RESULT_EVENT = PROTOCOL.TOPIC_DELETE_RESULT_EVENT;
  const TOPIC_DELETE_PING_EVENT = PROTOCOL.TOPIC_DELETE_PING_EVENT;
  const TOPIC_DELETE_READY_EVENT = PROTOCOL.TOPIC_DELETE_READY_EVENT;
  const TOPIC_DELETE_BRIDGE_SOURCE = PROTOCOL.TOPIC_DELETE_BRIDGE_SOURCE;
  const TOPIC_DELETE_MENU_COMMAND_UNSUPPORTED_REASON = "userscript does not expose menu command trigger";

  function topicDeleteSiteName(config = {}, payload = {}) {
    return String(config.id || config.name || payload.appId || payload.appName || location.hostname || "topic-delete").trim() || "topic-delete";
  }

  function isStandaloneTopicDeleteUserscript(source = "") {
    return /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(String(source || ""));
  }

  function topicDeleteSiteKeys(config = {}, payload = {}) {
    return [config.id, config.name, payload.appId, payload.appName]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  function topicDeleteScriptId(config = {}) {
    return String(config.scriptId || config.id || "").trim();
  }

  function topicDeleteStandaloneVersion(config = {}) {
    if (config.userscriptVersion) return String(config.userscriptVersion).trim();
    const source = String(config.userscript || "");
    const match = source.match(/^\s*\/\/\s*@version\s+(.+?)\s*$/m);
    return match ? String(match[1] || "").trim() : "";
  }

  function topicDeleteSupportsVersionedRequest(config = {}) {
    if (typeof config.supportsVersionedRequest === "boolean") return config.supportsVersionedRequest;
    const source = String(config.userscript || "");
    return source.includes("VERSIONED_REQUEST_EVENT") && /request:\s*"\s*\+\s*VERSION|request:\s*['"]/.test(source);
  }

  function topicDeleteSupportsVersionedMenuCommand(config = {}) {
    if (typeof config.supportsVersionedMenuCommand === "boolean") return config.supportsVersionedMenuCommand;
    const source = String(config.userscript || "");
    return source.includes("VERSIONED_MENU_COMMAND_EVENT") && /menu-command:\s*"\s*\+\s*VERSION|menu-command:\s*['"]/.test(source);
  }

  function topicDeleteSourceSupportsMenuCommand(config = {}) {
    if (typeof config.supportsMenuCommand === "boolean") return config.supportsMenuCommand;
    const source = String(config.userscript || "");
    return source.includes("MENU_COMMAND_EVENT")
      || source.includes("chatclub:delete-site:menu-command")
      || /\bmenuCommand\b/.test(source);
  }

  function topicDeleteReadyVersion(config = {}) {
    return topicDeleteSupportsVersionedMenuCommand(config) || topicDeleteSupportsVersionedRequest(config)
      ? topicDeleteStandaloneVersion(config)
      : "";
  }

  function topicDeleteVersionMatches(version, expectedVersion = "") {
    const current = String(version || "").trim();
    return !expectedVersion || current === expectedVersion;
  }

  function topicDeleteUsesPackagedDefault(config = {}) {
    return config?.builtIn !== false && config?.sourceMode !== "custom" && !config?.userscriptOverride;
  }

  function topicDeleteReadyMatches(detail = {}, keys = [], expectedVersion = "", expectedScriptId = "") {
    const wanted = keys.map(deleteCompactToken).filter(Boolean);
    const siteMatches = !wanted.length || [detail.site, detail.siteId, detail.name].some((item) => {
      const token = deleteCompactToken(item);
      return token && wanted.includes(token);
    });
    const expectedScript = deleteCompactToken(expectedScriptId);
    const scriptMatches = !expectedScript || [detail.scriptId, detail.script, detail.siteId, detail.site].some((item) => {
      const token = deleteCompactToken(item);
      return token && token === expectedScript;
    });
    return siteMatches && scriptMatches && topicDeleteVersionMatches(detail.version, expectedVersion);
  }

  function topicDeleteDirectStandaloneApi(config = {}, payload = {}, options = {}) {
    const registry = window.ChatClubDeleteSites;
    if (!registry || typeof registry !== "object") return null;
    const wanted = topicDeleteSiteKeys(config, payload).map(deleteCompactToken).filter(Boolean);
    const expectedScriptId = deleteCompactToken(topicDeleteScriptId(config));
    const expectedVersion = topicDeleteStandaloneVersion(config);
    const acceptMatchingVersion = options.acceptMatchingVersion !== false;
    for (const [entryKey, entry] of Object.entries(registry)) {
      if (!entry || (typeof entry.menuCommand !== "function" && typeof entry.run !== "function")) continue;
      const candidates = [entryKey, entry.scriptId, entry.site, entry.siteId, entry.name, entry.id]
        .map(deleteCompactToken)
        .filter(Boolean);
      if (wanted.length && !candidates.some((candidate) => wanted.includes(candidate))) continue;
      if (expectedScriptId && !candidates.includes(expectedScriptId)) continue;
      if (acceptMatchingVersion && topicDeleteVersionMatches(entry.version, expectedVersion)) return entry;
      try { entry.dispose?.(); } catch {}
      try { delete registry[entryKey]; } catch {}
    }
    return null;
  }

  function waitForTopicDeleteUserscriptReady(config = {}, payload = {}, timeoutMs = 450) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const keys = topicDeleteSiteKeys(config, payload);
    const scriptId = topicDeleteScriptId(config);
    const expectedVersion = topicDeleteReadyVersion(config);
    const sourceVersion = topicDeleteStandaloneVersion(config);
    return new Promise((resolve) => {
      let timer = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        window.removeEventListener(TOPIC_DELETE_READY_EVENT, onReady);
        window.removeEventListener("message", onMessage);
      };
      const handleReadyDetail = (detail = {}) => {
        if (detail.id !== id || !topicDeleteReadyMatches(detail, keys, expectedVersion, scriptId)) return;
        cleanup();
        resolve(detail);
      };
      const onReady = (event) => {
        handleReadyDetail(event?.detail || {});
      };
      const onMessage = (event) => {
        const message = event?.data || {};
        if (message.source !== TOPIC_DELETE_BRIDGE_SOURCE || message.type !== "ready") return;
        handleReadyDetail(message.detail || {});
      };
      window.addEventListener(TOPIC_DELETE_READY_EVENT, onReady);
      window.addEventListener("message", onMessage);
      timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, Math.max(80, Number(timeoutMs) || 450));
      const detail = {
        id,
        site: config.id || payload.appId || "",
        siteId: config.id || "",
        scriptId,
        name: config.name || payload.appName || "",
        version: sourceVersion,
        expectedVersion: sourceVersion
      };
      window.dispatchEvent(new CustomEvent(TOPIC_DELETE_PING_EVENT, { detail }));
      window.postMessage({ source: TOPIC_DELETE_BRIDGE_SOURCE, type: "ping", detail }, "*");
    });
  }

  function sendExtensionRuntimeMessage(message) {
    const promiseRuntime = globalThis.browser?.runtime;
    if (promiseRuntime?.sendMessage) return promiseRuntime.sendMessage(message);
    return new Promise((resolve, reject) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        reject(new Error("Extension runtime messaging is unavailable"));
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError) reject(new Error(runtimeError));
        else resolve(response);
      });
    });
  }

  async function installStandaloneTopicDeleteUserscript(config = {}) {
    const installConfig = {
      id: config.id || ""
    };
    const response = await sendExtensionRuntimeMessage({
      source: SOURCE,
      action: "installTopicDeleteUserscript",
      config: installConfig
    });
    if (!response?.success) {
      throw new Error(response?.error || "Delete Site userscript installation failed");
    }
    if (response.runtimeConfig && typeof response.runtimeConfig === "object") {
      Object.assign(config, response.runtimeConfig);
    }
    return response;
  }

  async function ensureStandaloneTopicDeleteUserscript(config = {}, payload = {}, timeoutMs = 15000) {
    const canReuseExisting = topicDeleteUsesPackagedDefault(config);
    if (canReuseExisting) {
      const alreadyDirect = topicDeleteDirectStandaloneApi(config, payload);
      if (alreadyDirect) return { mode: "direct", api: alreadyDirect };
      const alreadyReady = await waitForTopicDeleteUserscriptReady(config, payload, 360);
      if (alreadyReady) return { mode: "event", ready: alreadyReady };
    } else {
      topicDeleteDirectStandaloneApi(config, payload, { acceptMatchingVersion: false });
    }
    const installed = await installStandaloneTopicDeleteUserscript(config);
    const installedDirect = topicDeleteDirectStandaloneApi(config, payload);
    if (installedDirect) return { mode: "direct", api: installedDirect, installed };
    const installedReady = await waitForTopicDeleteUserscriptReady(config, payload, Math.min(1600, Math.max(600, Number(timeoutMs) || 15000)));
    if (installedReady) return { mode: "event", ready: installedReady, installed };
    return { mode: "event", ready: null, installed };
  }

  async function runStandaloneTopicDeleteUserscript(config = {}, payload = {}, timeoutMs = 15000) {
    const site = topicDeleteSiteName(config, payload);
    const readyState = await ensureStandaloneTopicDeleteUserscript(config, payload, timeoutMs);
    if (readyState?.api) {
      if (typeof readyState.api.menuCommand !== "function") {
        return deleteResult(false, site, TOPIC_DELETE_MENU_COMMAND_UNSUPPORTED_REASON);
      }
      try {
        return await readyState.api.menuCommand(payload);
      } catch (error) {
        return deleteResult(false, site, error?.message || String(error));
      }
    }
    if (readyState?.ready && readyState.ready.menuCommand !== true) {
      return deleteResult(false, site, TOPIC_DELETE_MENU_COMMAND_UNSUPPORTED_REASON);
    }
    if (!topicDeleteSourceSupportsMenuCommand(config)) {
      return deleteResult(false, site, TOPIC_DELETE_MENU_COMMAND_UNSUPPORTED_REASON);
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      let timer = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        window.removeEventListener(TOPIC_DELETE_RESULT_EVENT, onResult);
        window.removeEventListener("message", onMessage);
      };
      const handleResultDetail = (detail = {}) => {
        if (detail.id !== id) return;
        cleanup();
        resolve(detail);
      };
      const onResult = (event) => {
        handleResultDetail(event?.detail || {});
      };
      const onMessage = (event) => {
        const message = event?.data || {};
        if (message.source !== TOPIC_DELETE_BRIDGE_SOURCE || message.type !== "result") return;
        handleResultDetail(message.detail || {});
      };
      window.addEventListener(TOPIC_DELETE_RESULT_EVENT, onResult);
      window.addEventListener("message", onMessage);
      timer = setTimeout(() => {
        cleanup();
        resolve(deleteResult(false, site, "userscript menu command timed out"));
      }, Math.max(5000, Math.min(45000, Number(timeoutMs) || 15000)));
      try {
        const expectedVersion = topicDeleteStandaloneVersion(config);
        const useVersionedMenuCommand = topicDeleteSupportsVersionedMenuCommand(config) && expectedVersion;
        const commandEvent = useVersionedMenuCommand ? `${TOPIC_DELETE_MENU_COMMAND_EVENT}:${expectedVersion}` : TOPIC_DELETE_MENU_COMMAND_EVENT;
        const commandType = useVersionedMenuCommand ? `menu-command:${expectedVersion}` : "menu-command";
        const detail = {
          id,
          site: config.id || site,
          siteId: config.id || "",
          scriptId: topicDeleteScriptId(config),
          name: config.name || site,
          version: expectedVersion,
          expectedVersion,
          menuCommand: true,
          payload,
          data: payload
        };
        window.dispatchEvent(new CustomEvent(commandEvent, { detail }));
        window.postMessage({ source: TOPIC_DELETE_BRIDGE_SOURCE, type: commandType, detail }, "*");
      } catch (error) {
        cleanup();
        resolve(deleteResult(false, site, error?.message || String(error)));
      }
    });
  }

  function topicDeleteNativeSiteId(config = {}, payload = {}) {
    const id = String(config?.id || "").trim().toLowerCase();
    const app = `${payload?.appId || ""} ${payload?.appName || ""} ${config?.name || ""}`.toLowerCase();
    const host = String(location.hostname || "").toLowerCase();
    if (id === "chatgpt" || /chatgpt|chat gpt/.test(app) || host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com" || host.endsWith(".chat.openai.com")) return "chatgpt";
    if (id === "gemini" || /gemini/.test(app) || host === "gemini.google.com" || host.endsWith(".gemini.google.com")) return "gemini";
    if (id === "kagi" || /kagi/.test(app) || host === "assistant.kagi.com") return "kagi";
    if (id === "grokmirror" || /grokmirror|grok mirror/.test(app) || host === "gk.dairoot.cn" || host.endsWith(".gk.dairoot.cn")) return "grokMirror";
    if (id === "grok" || /grok/.test(app) || host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai")) return "grok";
    if (id === "notion" || /notion/.test(app) || host === "app.notion.com" || host === "notion.so" || host === "www.notion.so" || host.endsWith(".notion.so")) return "notion";
    if (id === "deepseek" || /deepseek/.test(app) || host === "chat.deepseek.com" || host === "deepseek.com" || host.endsWith(".deepseek.com")) return "deepseek";
    return "";
  }

  function topicDeleteNativeRunner(config = {}, payload = {}) {
    if (config?.builtIn === false) return null;
    const siteId = topicDeleteNativeSiteId(config, payload);
    if (!siteId) return null;
    return async () => {
      if (siteId === "chatgpt") return deleteChatGptThread(payload);
      if (siteId === "gemini") return deleteGeminiThread(payload);
      if (siteId === "kagi") return deleteKagiThread(payload);
      if (siteId === "grokMirror") {
        const result = await deleteGrokThread(payload);
        return { ...result, site: "grokMirror" };
      }
      if (siteId === "grok") return deleteGrokThread(payload);
      if (siteId === "notion") return deleteNotionThread(payload);
      if (siteId === "deepseek") return deleteDeepSeekThread(payload);
      return deleteResult(false, siteId || "topic-delete", "unsupported site");
    };
  }

  function createTopicDeleteApi(config = {}, payload = {}) {
    const api = {
      config,
      data: payload,
      window,
      document,
      location,
      result: deleteResult,
      deleteResult,
      sleep,
      waitFor: waitForModel,
      waitForModel,
      normalize,
      text,
      qsa,
      qs,
      closest,
      visible,
      reveal,
      buttonText,
      modelElementText,
      modelRect,
      modelCenterPoint,
      modelElementFromPoint,
      modelClick,
      modelDirectClick,
      nativeModelClick,
      dispatchPointerActivation,
      isDisabledElement,
      activateElement,
      deleteElementText,
      deleteTextToken,
      deleteCompactToken,
      deleteLabelMatches,
      deleteLabelMatchesExactish,
      visibleDeleteCandidates,
      layoutDeleteCandidates,
      deleteClickableElement,
      deleteClick,
      deleteClickLayout,
      deleteDialogRoots,
      findDeleteConfirmButton,
      clickDeleteConfirmIfPresent,
      clickDeleteConfirmButton,
      dispatchDeleteKeyboardShortcut,
      menuRootsWithDelete,
      findDeleteMenuItem,
      openTriggerAndClickDelete,
      topRightMenuTrigger,
      findNotionDeleteMenuTrigger,
      requestDeepSeekDeleteBridge,
      ensureDeepSeekSidebarOpen,
      deepSeekSidebarRoot,
      deepSeekDeleteHints,
      deepSeekTopicRows,
      deepSeekTopicMoreButton,
      deleteChatGptThread,
      deleteGeminiThread,
      deleteKagiThread,
      deleteGrokThread,
      deleteNotionThread,
      deleteDeepSeekThread
    };
    return Object.freeze(api);
  }

  function normalizeTopicDeleteUserscriptResult(value, config = {}, payload = {}) {
    const site = topicDeleteSiteName(config, payload);
    if (value && typeof value === "object") {
      const ok = Object.prototype.hasOwnProperty.call(value, "ok") ? Boolean(value.ok) : true;
      return {
        ...value,
        ok,
        site: String(value.site || site)
      };
    }
    return deleteResult(Boolean(value), site, value ? "" : "userscript returned false");
  }

  function topicDeleteUsesCustomUserscript(config = {}) {
    return config.builtIn === false || config.sourceMode === "custom" || config.userscriptOverride === true;
  }

  async function executeCustomTopicDeleteUserscript(config = {}, payload = {}) {
    const response = await sendExtensionRuntimeMessage({
      source: SOURCE,
      action: "executeTopicDeleteUserscript",
      configId: String(config.id || ""),
      payload
    });
    if (!response?.success) throw new Error(response?.error || "Custom Delete Site userscript execution failed");
    return response.data || deleteResult(false, topicDeleteSiteName(config, payload), "Custom Delete Site returned no result");
  }

  async function runTopicDeleteUserscript(config = {}, payload = {}) {
    const site = topicDeleteSiteName(config, payload);
    const source = String(config.userscript || "").trim();
    const customMode = topicDeleteUsesCustomUserscript(config);
    const nativeRunner = customMode ? null : topicDeleteNativeRunner(config, payload);
    const standalone = !customMode && !nativeRunner && (config.standaloneUserscript === true || isStandaloneTopicDeleteUserscript(source));
    if (!customMode && !standalone && source) {
      return deleteResult(false, site, "Legacy bridge snippets are unsupported under MV3 CSP; convert this Delete Site to a standalone userscript.");
    }
    if (!customMode && !standalone && !nativeRunner) return deleteResult(false, site, "userscript missing");
    const nativeSiteId = nativeRunner ? topicDeleteNativeSiteId(config, payload) : "";
    const requestedTimeoutMs = Math.max(5000, Math.min(45000, Number(config.userscriptTimeoutMs) || 15000));
    const timeoutMs = nativeSiteId === "deepseek" ? Math.max(requestedTimeoutMs, 36000) : requestedTimeoutMs;
    let timer = null;
    try {
      const timeoutResult = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, site, reason: "userscript timed out" }), timeoutMs);
      });
      const value = await Promise.race([
        customMode
          ? executeCustomTopicDeleteUserscript(config, payload)
          : standalone
          ? runStandaloneTopicDeleteUserscript(config, payload, timeoutMs)
          : nativeRunner
            ? nativeRunner()
            : deleteResult(false, site, "userscript missing"),
        timeoutResult
      ]);
      return normalizeTopicDeleteUserscriptResult(value, config, payload);
    } catch (error) {
      return deleteResult(false, site, error?.message || String(error));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function deleteThread(data = {}) {
    const incomingConfig = data?.config && typeof data.config === "object" ? data.config : null;
    const payload = data?.payload && typeof data.payload === "object" ? data.payload : data;
    if (incomingConfig?.enabled === false) {
      return deleteResult(false, topicDeleteSiteName(incomingConfig, payload), "site disabled");
    }
    const config = incomingConfig
      ? incomingConfig
      : topicDeleteFallbackConfig({}, payload);
    if (!topicDeleteUsesCustomUserscript(config) && config?.standaloneUserscript !== true && !String(config?.userscript || "").trim() && !topicDeleteNativeRunner(config, payload)) {
      return deleteResult(false, topicDeleteSiteName(config || {}, payload), "unsupported site or userscript missing");
    }
    return runTopicDeleteUserscript(config, payload);
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

  function requestDeepSeekDeleteBridge(timeoutMs = 9000, data = {}) {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage, true);
        resolve({ ok: false, reason: "bridge timeout" });
      }, Math.max(500, Number(timeoutMs) || 9000));
      function onMessage(event) {
        const message = event.data;
        if (message?.source !== DEEPSEEK_DELETE_SOURCE || message.type !== "response" || message.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        resolve(message);
      }
      window.addEventListener("message", onMessage, true);
      try {
        window.postMessage({ source: DEEPSEEK_DELETE_SOURCE, type: "request", action: "deleteThread", id, data }, "*");
      } catch (error) {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        resolve({ ok: false, reason: error?.message || String(error || "bridge failed") });
      }
    });
  }

  const GEMINI_MODEL_TARGETS = Object.freeze({
    pro: Object.freeze({ id: "pro", labels: ["3.1 Pro", "Advanced math and code"] }),
    thinking: Object.freeze({ id: "thinking", labels: ["Standard", "Best for most questions"] }),
    extended: Object.freeze({ id: "extended", labels: ["Extended", "Complex problem solving"] }),
    fast: Object.freeze({ id: "fast", labels: ["3.1 Flash-Lite", "Flash-Lite", "Fastest answers"] }),
    flash35: Object.freeze({ id: "flash35", labels: ["3.5 Flash", "All-around help"] })
  });

  const GEMINI_MODEL_BUTTON_SELECTORS = Object.freeze([
    "button[aria-label='Open mode picker']",
    "button[aria-label^='Open mode picker' i]",
    "bard-mode-switcher button[aria-label='Open mode picker']",
    "bard-mode-switcher button",
    "button[aria-label*='mode picker' i]",
    "button[aria-label*='model' i]"
  ]);

  const GEMINI_MODEL_MENU_ROOT_SELECTORS = Object.freeze([
    "gem-mode-menu",
    ".cdk-overlay-pane",
    ".cdk-overlay-container .cdk-overlay-pane",
    ".cdk-overlay-container [role='menu']",
    ".cdk-overlay-container [role='listbox']",
    ".cdk-overlay-container [role='dialog']",
    ".cdk-overlay-pane .gds-mode-switch-menu.mat-mdc-menu-panel",
    ".cdk-overlay-pane .gds-mode-switch-menu",
    ".cdk-overlay-pane .mat-mdc-menu-panel[role='menu']",
    ".cdk-overlay-pane .mat-mdc-menu-panel",
    ".cdk-overlay-pane .mat-menu-panel[role='menu']",
    ".cdk-overlay-pane .mat-menu-panel",
    ".cdk-overlay-pane [role='menu']",
    ".cdk-overlay-pane [role='listbox']",
    ".gds-mode-switch-menu",
    ".mat-mdc-menu-panel[role='menu']",
    ".mat-mdc-menu-panel",
    ".mat-menu-panel[role='menu']",
    ".mat-menu-panel",
    "[role='menu']",
    "[role='listbox']",
    "[role='dialog']"
  ]);

  const GEMINI_MODEL_ITEM_SELECTORS = Object.freeze([
    "gem-menu-item",
    "button.bard-mode-list-button[role='menuitemradio']",
    ".bard-mode-list-button",
    "button[role='menuitemradio']",
    "button[role='menuitem']",
    "button[role='option']",
    "button[role='button']",
    "button[aria-haspopup='menu']",
    "button[mat-menu-item]",
    "button.mat-mdc-menu-item",
    "[role='menuitemradio']",
    "[role='menuitem']",
    "[role='option']",
    "[role='button']",
    "mat-list-option",
    "mat-selection-list mat-list-option",
    "[tabindex]:not([tabindex='-1'])",
    "button",
    "div",
    "span"
  ]);

  function geminiModelKeysFromText(value) {
    const token = compactModelText(value);
    const keys = new Set();
    if (!token) return keys;
    const hasFlashLite = /(^|[^a-z0-9])flash\s*-?\s*lite([^a-z0-9]|$)/.test(token) ||
      /(^|[^a-z0-9])3\s*\.?\s*1\s*flash\s*-?\s*lite([^a-z0-9]|$)/.test(token) ||
      token.includes("fastest answers");
    if (/(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token) || token.includes("complex problem solving")) keys.add("extended");
    if (/(^|[^a-z0-9])standard([^a-z0-9]|$)/.test(token) || token.includes("best for most questions")) keys.add("thinking");
    if (
      /(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token) ||
      /(^|[^a-z0-9])gemini\s+pro([^a-z0-9]|$)/.test(token) ||
      /(^|[^a-z0-9])pro([^a-z0-9]|$)/.test(token) ||
      token.includes("advanced math and code")
    ) {
      keys.add("pro");
    }
    if (hasFlashLite) {
      keys.add("fast");
    }
    if (
      /(^|[^a-z0-9])3\s*\.?\s*5\s*flash([^a-z0-9]|$)/.test(token) ||
      token.includes("all-around help") ||
      (!hasFlashLite && /(^|[^a-z0-9])flash([^a-z0-9]|$)/.test(token))
    ) {
      keys.add("flash35");
    }
    return keys;
  }

  function geminiModelKeyFromText(value) {
    const keys = Array.from(geminiModelKeysFromText(value));
    return keys.length === 1 ? keys[0] : "";
  }

  function inferGeminiModelKey(value) {
    const token = compactModelText(value);
    if (!token) return "";
    const key = geminiModelKeyFromText(value);
    if (key) return key;
    if (/(^|[^a-z0-9])extended\s+thinking([^a-z0-9]|$)/.test(token)) return "extended";
    if (/(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token)) return "extended";
    if (/(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token)) return "pro";
    if (/(^|[^a-z0-9])gemini\s+pro([^a-z0-9]|$)/.test(token)) return "pro";
    if (/(^|[^a-z0-9])thinking\s+level([^a-z0-9]|$)/.test(token)) return "thinking";
    if (/(^|[^a-z0-9])3\s*\.?\s*5\s*flash([^a-z0-9]|$)/.test(token)) return "flash35";
    if (/(^|[^a-z0-9])3\s*\.?\s*1\s*flash\s*-?\s*lite([^a-z0-9]|$)/.test(token)) return "fast";
    if (["pro", "thinking", "extended", "fast", "flash35"].includes(token)) return token;
    if (/(^|[^a-z0-9])pro([^a-z0-9]|$)/.test(token)) return "pro";
    if (/(^|[^a-z0-9])thinking([^a-z0-9]|$)/.test(token)) return "thinking";
    if (/(^|[^a-z0-9])fast([^a-z0-9]|$)/.test(token)) return "fast";
    if (/(^|[^a-z0-9])flash([^a-z0-9]|$)/.test(token)) return "flash35";
    return "";
  }

  function currentGeminiPickerState() {
    const button = firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS);
    if (!button) return { button: null, label: "", baseModelId: "", thinkingLevel: "" };
    const label = String(button.getAttribute?.("aria-label") || modelElementText(button) || "");
    const keys = geminiModelKeysFromText(label);
    const baseModelId = ["fast", "flash35", "pro"].find((key) => keys.has(key)) || (() => {
      const inferred = inferGeminiModelKey(label);
      return ["fast", "flash35", "pro"].includes(inferred) ? inferred : "";
    })();
    const token = compactModelText(label);
    const thinkingLevel = baseModelId === "pro"
      ? (keys.has("extended") || /\bextended(?:\s+thinking)?\b/.test(token) ? "extended" : "standard")
      : "";
    return { button, label, baseModelId, thinkingLevel };
  }

  function currentGeminiModelKey() {
    return currentGeminiPickerState().baseModelId;
  }

  function currentGeminiModelHasKey(modelId) {
    const state = currentGeminiPickerState();
    if (modelId === "extended") return state.baseModelId === "pro" && state.thinkingLevel === "extended";
    if (modelId === "thinking") return state.baseModelId === "pro" && state.thinkingLevel === "standard";
    return state.baseModelId === modelId;
  }

  function geminiThinkingLevelModelId(value) {
    const token = String(value || "").trim().toLowerCase();
    if (token === "extended") return "extended";
    if (token === "standard" || token === "thinking") return "thinking";
    return "";
  }

  function scoreGeminiModelMenuRoot(root) {
    if (!root || !visible(root)) return 0;
    const text = modelElementText(root);
    const token = compactModelText(text);
    if (!token) return 0;
    const keys = geminiModelKeysFromText(text);
    let score = keys.size * 80;
    if (token.includes("thinking level")) score += 60;
    if (token.includes("select a model") || token.includes("mode picker")) score += 40;
    if (token.includes("gemini") || token.includes("flash")) score += 15;
    if (matches(root, ".cdk-overlay-pane, .gds-mode-switch-menu, .mat-mdc-menu-panel, .mat-menu-panel, [role='menu'], [role='listbox']")) score += 25;
    const rect = modelRect(root);
    if (rect) {
      if (rect.height >= 100 && rect.width >= 180) score += 20;
      if (rect.height > window.innerHeight * 0.9 || rect.width > window.innerWidth * 0.9) score -= 120;
    }
    if (keys.size < 2 && !token.includes("thinking level")) score -= 120;
    return score;
  }

  function geminiModelMenuRootCandidates() {
    const candidates = visibleSelectorElements(GEMINI_MODEL_MENU_ROOT_SELECTORS)
      .map((element, index) => ({
        element,
        index,
        score: scoreGeminiModelMenuRoot(element),
        area: modelElementArea(element)
      }))
      .filter((candidate) => candidate.score > 0);
    candidates.sort((a, b) => b.score - a.score || b.area - a.area || b.index - a.index);
    return candidates;
  }

  function geminiModelMenuRoot() {
    const candidates = geminiModelMenuRootCandidates();
    return candidates[0]?.element || null;
  }

  function geminiModelMenuRoots() {
    return geminiModelMenuRootCandidates().map((candidate) => candidate.element);
  }

  async function openGeminiModelMenu(context) {
    assertPreferredModelRun(context);
    context.geminiMenuFailureTerminal = false;
    const existing = geminiModelMenuRoot();
    if (existing) return existing;
    const trigger = await waitForPreferredModel(context, () => firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS), 10000, 150);
    if (!trigger) return null;
    const bridgeResult = await requestGeminiModelPickerBridgeOpen(context, 1200);
    if (bridgeResult?.cancelled === true || bridgeResult?.stale === true) {
      context.abortKind = "cancel";
      context.abortReason = String(bridgeResult.reason || "Gemini model picker bridge run was cancelled");
      try { context.controller.abort(context.abortReason); } catch { try { context.controller.abort(); } catch {} }
      assertPreferredModelRun(context);
    }
    let root = await waitForPreferredModel(context, geminiModelMenuRoot, 1400, 80);
    if (root) return root;
    if (bridgeResult?.activated === true || bridgeResult?.alreadyOpen === true) {
      context.geminiMenuFailureTerminal = true;
      return null;
    }
    if (String(bridgeResult?.reason || "").toLowerCase().includes("timeout")) {
      context.geminiMenuFailureTerminal = true;
      return null;
    }
    if (!preferredModelActivate(context, trigger)) return null;
    root = await waitForPreferredModel(context, geminiModelMenuRoot, 1400, 80);
    return root || null;
  }

  function geminiModelItemRow(element, root) {
    if (!element || !root || element === root || !root.contains?.(element)) return null;
    const direct = closest(element, [
      "gem-menu-item",
      "button",
      "[role='menuitemradio']",
      "[role='menuitem']",
      "[role='option']",
      "[role='button']",
      "mat-list-option",
      ".bard-mode-list-button",
      ".mat-mdc-menu-item",
      ".mat-menu-item",
      "[tabindex]:not([tabindex='-1'])"
    ].join(", "));
    if (direct && root.contains(direct) && direct !== root) return direct;
    let node = element;
    for (let guard = 0; node && node !== root && guard < 6; guard += 1, node = node.parentElement) {
      const rect = modelRect(node);
      if (!rect || rect.height < 18 || rect.height > 140) continue;
      if (modelElementArea(node) > modelElementArea(root) * 0.92) continue;
      if (compactModelText(modelElementText(node))) return node;
    }
    return null;
  }

  function geminiModelItems(root) {
    if (!root) return [];
    const rows = [];
    const seen = new Set();
    const rootArea = Math.max(1, modelElementArea(root));
    const add = (element) => {
      const row = geminiModelItemRow(element, root);
      if (!row || seen.has(row) || !visible(row) || isDisabledElement(row)) return;
      if (row === root || modelElementArea(row) > rootArea * 0.92) return;
      const text = modelElementText(row);
      if (!compactModelText(text)) return;
      seen.add(row);
      rows.push(row);
    };
    for (const element of visibleSelectorElements(GEMINI_MODEL_ITEM_SELECTORS, root)) add(element);
    return rows;
  }

  function geminiCompactMenuRows(root) {
    if (!root) return [];
    const rows = [];
    const seen = new Set();
    const rootArea = Math.max(1, modelElementArea(root));
    for (const element of qsa("*", root)) {
      if (!visible(element)) continue;
      let row = element;
      for (let node = element; node && node !== root; node = node.parentElement) {
        const rect = modelRect(node);
        if (!rect) continue;
        const area = rect.width * rect.height;
        if (rect.width > 80 && rect.height >= 30 && rect.height <= 96 && area < rootArea * 0.85) {
          row = node;
          break;
        }
      }
      if (!row || seen.has(row) || row === root || !visible(row) || isDisabledElement(row)) continue;
      const text = modelElementText(row);
      if (!compactModelText(text)) continue;
      seen.add(row);
      rows.push(row);
    }
    rows.sort((a, b) => modelElementArea(a) - modelElementArea(b));
    return rows;
  }

  function geminiTargetMatchesText(modelId, value) {
    const token = compactModelText(value);
    if (!token) return false;
    if (modelId === "pro") return /(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token) || token.includes("advanced math and code");
    if (modelId === "thinking") return /(^|[^a-z0-9])standard([^a-z0-9]|$)/.test(token) || token.includes("best for most questions");
    if (modelId === "extended") return /(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token) || token.includes("complex problem solving");
    if (modelId === "fast") {
      return /(^|[^a-z0-9])flash\s*-?\s*lite([^a-z0-9]|$)/.test(token) ||
        /(^|[^a-z0-9])3\s*\.?\s*1\s*flash\s*-?\s*lite([^a-z0-9]|$)/.test(token) ||
        token.includes("fastest answers");
    }
    if (modelId === "flash35") {
      const hasFlashLite = /(^|[^a-z0-9])flash\s*-?\s*lite([^a-z0-9]|$)/.test(token);
      return /(^|[^a-z0-9])3\s*\.?\s*5\s*flash([^a-z0-9]|$)/.test(token) ||
        token.includes("all-around help") ||
        (!hasFlashLite && /(^|[^a-z0-9])flash([^a-z0-9]|$)/.test(token));
    }
    return false;
  }

  function scoreGeminiModelItem(item, modelId) {
    const text = modelElementText(item);
    if (!geminiTargetMatchesText(modelId, text)) return -1;
    const token = compactModelText(text);
    const keys = geminiModelKeysFromText(text);
    const rect = modelRect(item);
    let score = 100;
    if (keys.size === 1 && keys.has(modelId)) score += 80;
    if (keys.size > 1) score -= 120;
    if (matches(item, "button, [role='menuitemradio'], [role='menuitem'], [role='option'], [role='button'], mat-list-option")) score += 35;
    if (modelId === "thinking" && token.includes("thinking level")) score -= 220;
    if (modelId === "extended" && token.includes("thinking level") && !/(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token)) score -= 160;
    if (modelId === "thinking" && /(^|[^a-z0-9])standard([^a-z0-9]|$)/.test(token)) score += 70;
    if (modelId === "extended" && /(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token)) score += 70;
    if (modelId === "fast" && /flash\s*-?\s*lite/.test(token)) score += 70;
    if (modelId === "flash35" && /(^|[^a-z0-9])3\s*\.?\s*5\s*flash([^a-z0-9]|$)/.test(token)) score += 70;
    if (modelId === "pro" && /(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token)) score += 70;
    if (rect) {
      if (rect.height >= 26 && rect.height <= 96) score += 20;
      if (rect.width < 80 || rect.height < 18) score -= 80;
    }
    return score;
  }

  function findGeminiModelItem(root, modelId) {
    const candidates = geminiModelItems(root)
      .map((item, index) => ({
        item,
        index,
        score: scoreGeminiModelItem(item, modelId),
        area: modelElementArea(item)
      }))
      .filter((candidate) => candidate.score >= 0);
    candidates.sort((a, b) => b.score - a.score || a.area - b.area || a.index - b.index);
    return candidates[0]?.item || null;
  }

  function findGeminiModelItemInMenus(modelId) {
    for (const root of geminiModelMenuRoots()) {
      const item = findGeminiModelItem(root, modelId);
      if (item) return { root, item };
    }
    return { root: null, item: null };
  }

  function scoreGeminiThinkingLevelRow(row) {
    const token = compactModelText(modelElementText(row));
    if (!token || !token.includes("thinking level")) return -1;
    const rect = modelRect(row);
    let score = 100;
    if (matches(row, "button, [role='menuitemradio'], [role='menuitem'], [role='button'], [aria-haspopup='menu'], [aria-haspopup='true'], [tabindex]:not([tabindex='-1'])")) score += 50;
    if (token.includes("standard") || token.includes("extended")) score += 30;
    if (rect) {
      if (rect.width >= 120 && rect.height >= 30 && rect.height <= 96) score += 30;
      if (rect.width < 80 || rect.height < 24) score -= 70;
    }
    return score;
  }

  function findGeminiThinkingLevelRows(root) {
    if (!root) return [];
    const seen = new Set();
    const rows = [];
    const add = (row) => {
      if (!row || seen.has(row) || !visible(row) || isDisabledElement(row)) return;
      const score = scoreGeminiThinkingLevelRow(row);
      if (score < 0) return;
      seen.add(row);
      rows.push({ row, score, area: modelElementArea(row) });
    };
    for (const row of geminiCompactMenuRows(root)) add(row);
    for (const item of geminiModelItems(root)) {
      if (isGeminiThinkingSubmenuItem(item)) add(item);
    }
    rows.sort((a, b) => b.score - a.score || b.area - a.area);
    return rows.map((entry) => entry.row);
  }

  function findGeminiThinkingLevelRow(root) {
    return findGeminiThinkingLevelRows(root)[0] || null;
  }

  function findGeminiThinkingLevelOption(root, modelId) {
    if (modelId !== "thinking" && modelId !== "extended") return null;
    const row = geminiCompactMenuRows(root)
      .filter((row) => {
        const text = modelElementText(row);
        const token = compactModelText(text);
        if (!token || token.includes("thinking level")) return false;
        const keys = geminiModelKeysFromText(text);
        if (modelId === "thinking" && keys.has("extended")) return false;
        if (modelId === "extended" && keys.has("thinking")) return false;
        return geminiTargetMatchesText(modelId, text);
      })
      .sort((a, b) => modelElementArea(a) - modelElementArea(b))[0] || null;
    return geminiActualMenuItem(row, root) || row;
  }

  function findGeminiThinkingLevelOptionInMenus(modelId) {
    for (const root of geminiModelMenuRoots()) {
      const item = findGeminiThinkingLevelOption(root, modelId);
      if (item) return { root, item };
    }
    return { root: null, item: null };
  }

  function geminiThinkingLevelHeaderKey(root) {
    const row = findGeminiThinkingLevelRow(root);
    const token = compactModelText(modelElementText(row));
    if (!token || !token.includes("thinking level")) return "";
    const after = token.split("thinking level").slice(1).join("thinking level").trim();
    if (/^extended([^a-z0-9]|$)/.test(after)) return "extended";
    if (/^standard([^a-z0-9]|$)/.test(after)) return "thinking";
    return "";
  }

  function geminiThinkingLevelOptionIsSelected(root, modelId) {
    const option = findGeminiThinkingLevelOption(root, modelId);
    if (option && (geminiElementHasSelectedState(option) || modelTextIncludes(modelElementText(option), "Selected"))) return true;
    return geminiThinkingLevelHeaderKey(root) === modelId;
  }

  function isGeminiThinkingSubmenuItem(item) {
    if (!item || !modelTextIncludes(modelElementText(item), "Thinking")) return false;
    let node = item;
    for (let guard = 0; node && node.nodeType === 1 && guard < 4; guard += 1, node = node.parentElement) {
      const popup = String(node.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
      if (popup === "menu" || popup === "true") return true;
    }
    return modelTextIncludes(modelElementText(item), "Thinking level");
  }

  function geminiActualMenuItem(element, root = null) {
    if (!element) return null;
    const item = element.closest?.("gem-menu-item, button[role='menuitemradio'], button[role='menuitem'], [role='menuitemradio'], [role='menuitem'], [role='option'], mat-list-option") || null;
    if (!item || (root && !root.contains?.(item))) return null;
    return item;
  }

  function findGeminiExtendedThinkingToggle(root) {
    if (!root) return null;
    const candidates = [
      ...qsa("gem-menu-item", root, { all: true }),
      ...geminiModelItems(root)
    ];
    const seen = new Set();
    for (const candidate of candidates) {
      const item = geminiActualMenuItem(candidate, root) || candidate;
      if (!item || seen.has(item) || !visible(item) || isDisabledElement(item)) continue;
      seen.add(item);
      const token = compactModelText(modelElementText(item));
      if (/\bextended\s+thinking\b/.test(token)) return item;
    }
    return null;
  }

  function geminiElementHasSelectedState(element) {
    if (!element) return false;
    const actualItem = geminiActualMenuItem(element);
    const candidates = actualItem && String(actualItem.tagName || "").toLowerCase() === "gem-menu-item"
      ? [actualItem]
      : [element, ...qsa("*", element).slice(0, 20)];
    for (let node = element.parentElement, guard = 0; node && guard < 5; node = node.parentElement, guard += 1) {
      if (String(node.tagName || "").toLowerCase() === "gem-mode-menu") break;
      candidates.push(node);
    }
    for (const node of candidates) {
      if (node.hasAttribute?.("selected") && String(node.getAttribute?.("selected") || "").trim().toLowerCase() !== "false") return true;
      if (node.hasAttribute?.("checked") && String(node.getAttribute?.("checked") || "").trim().toLowerCase() !== "false") return true;
      if (parseBooleanAttr(node.getAttribute?.("aria-checked")) === true) return true;
      if (parseBooleanAttr(node.getAttribute?.("aria-selected")) === true) return true;
      if (parseBooleanAttr(node.getAttribute?.("aria-pressed")) === true) return true;
      const dataState = String(node.getAttribute?.("data-state") || "").trim().toLowerCase();
      if (["checked", "selected", "active"].includes(dataState)) return true;
      const dataSelected = parseBooleanAttr(node.getAttribute?.("data-selected"));
      if (dataSelected === true) return true;
      const className = typeof node.className === "string" ? node.className : String(node.className?.baseVal || "");
      if (/(^|\s)(selected|is-selected|checked|is-checked|active|mdc-list-item--selected|mat-mdc-menu-item-highlighted)(\s|$)/i.test(className)) return true;
    }
    return false;
  }

  function selectedGeminiModelKey(root) {
    if (!root) return "";
    const selected = geminiModelItems(root)
      .filter(geminiElementHasSelectedState)
      .map((item) => ({ item, key: geminiModelKeyFromText(modelElementText(item)), score: modelElementArea(item) }))
      .filter((entry) => entry.key);
    selected.sort((a, b) => a.score - b.score);
    return selected[0]?.key || "";
  }

  function isGeminiTargetSelected(root, modelId) {
    if (modelId === "thinking" || modelId === "extended") return geminiThinkingLevelOptionIsSelected(root, modelId);
    const item = findGeminiModelItem(root, modelId);
    return Boolean(item && geminiElementHasSelectedState(item));
  }

  async function dismissPreferredModelMenu(context, getMenuRoot, timeoutMs = 700) {
    assertPreferredModelRun(context);
    const getter = typeof getMenuRoot === "function" ? getMenuRoot : () => null;
    if (!getter()) return true;
    armPreferredModelFocusShield(context);
    const KeyboardEventCtor = modelEventConstructor("KeyboardEvent", document);
    if (typeof KeyboardEventCtor === "function") {
      try {
        document.dispatchEvent(new KeyboardEventCtor("keydown", {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
          composed: true
        }));
      } catch {}
    }
    return Boolean(await waitForPreferredModel(context, () => !getter(), timeoutMs, 80));
  }

  function geminiPickerMatches(baseModelId, thinkingModelId = "") {
    const state = currentGeminiPickerState();
    if (baseModelId && state.baseModelId !== baseModelId) return false;
    if (thinkingModelId === "extended") return state.baseModelId === "pro" && state.thinkingLevel === "extended";
    if (thinkingModelId === "thinking") return state.baseModelId === "pro" && state.thinkingLevel === "standard";
    return Boolean(state.baseModelId);
  }

  async function waitGeminiPickerSettled(context, baseModelId, thinkingModelId = "") {
    return Boolean(await waitForPreferredModel(
      context,
      () => geminiPickerMatches(baseModelId, thinkingModelId),
      2600,
      100
    ));
  }

  async function applyGeminiBaseModelTarget(context, modelId) {
    assertPreferredModelRun(context);
    if (currentGeminiPickerState().baseModelId === modelId) {
      return preferredModelResult(context, true, "Gemini", modelId, "", { skipped: true });
    }
    const root = await openGeminiModelMenu(context);
    if (!root) return preferredModelResult(context, false, "Gemini", modelId, "model menu not found", {
      retryable: context.geminiMenuFailureTerminal !== true
    });
    if (currentGeminiPickerState().baseModelId === modelId) {
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return preferredModelResult(context, true, "Gemini", modelId, "", { skipped: true, menuClosed });
    }
    const found = findGeminiModelItemInMenus(modelId);
    const foundRoot = found.root || root;
    const item = geminiActualMenuItem(found.item || findGeminiModelItem(foundRoot, modelId), foundRoot) || found.item || findGeminiModelItem(foundRoot, modelId);
    if (!item) {
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return preferredModelResult(context, false, "Gemini", modelId, "target model item not found", { menuClosed });
    }
    if (!preferredModelActivate(context, item)) {
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return preferredModelResult(context, false, "Gemini", modelId, "target model item could not be clicked", { menuClosed });
    }
    const settled = await waitGeminiPickerSettled(context, modelId);
    const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
    return settled
      ? preferredModelResult(context, true, "Gemini", modelId, "", { changed: true, menuClosed })
      : preferredModelResult(context, false, "Gemini", modelId, "selection did not settle", { menuClosed });
  }

  async function applyGeminiThinkingTarget(context, modelId) {
    assertPreferredModelRun(context);
    const desiredLevel = modelId === "extended" ? "extended" : "standard";
    if (geminiPickerMatches("pro", modelId)) {
      return preferredModelResult(context, true, "Gemini", "pro", "", { skipped: true, thinkingLevel: desiredLevel });
    }
    const root = await openGeminiModelMenu(context);
    if (!root) return preferredModelResult(context, false, "Gemini", "pro", "model menu not found", {
      retryable: context.geminiMenuFailureTerminal !== true,
      thinkingLevel: desiredLevel
    });
    if (geminiPickerMatches("pro", modelId)) {
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return preferredModelResult(context, true, "Gemini", "pro", "", { skipped: true, thinkingLevel: desiredLevel, menuClosed });
    }

    const toggle = findGeminiExtendedThinkingToggle(root);
    let item = null;
    if (toggle) {
      const selected = geminiElementHasSelectedState(toggle);
      const shouldBeSelected = modelId === "extended";
      if (selected === shouldBeSelected) {
        const settled = await waitGeminiPickerSettled(context, "pro", modelId);
        const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
        return settled
          ? preferredModelResult(context, true, "Gemini", "pro", "", { skipped: true, thinkingLevel: desiredLevel, menuClosed })
          : preferredModelResult(context, false, "Gemini", "pro", "thinking level did not settle", { thinkingLevel: desiredLevel, menuClosed });
      }
      item = toggle;
    } else {
      const option = findGeminiThinkingLevelOptionInMenus(modelId);
      const optionRoot = option.root || root;
      item = geminiActualMenuItem(option.item || findGeminiThinkingLevelOption(optionRoot, modelId), optionRoot) || option.item || findGeminiThinkingLevelOption(optionRoot, modelId);
      if (item && geminiElementHasSelectedState(item)) {
        const settled = await waitGeminiPickerSettled(context, "pro", modelId);
        const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
        return settled
          ? preferredModelResult(context, true, "Gemini", "pro", "", { skipped: true, thinkingLevel: desiredLevel, menuClosed })
          : preferredModelResult(context, false, "Gemini", "pro", "thinking level did not settle", { thinkingLevel: desiredLevel, menuClosed });
      }
    }

    if (!item) {
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return preferredModelResult(context, false, "Gemini", "pro", "thinking level item not found", { thinkingLevel: desiredLevel, menuClosed });
    }
    if (!preferredModelActivate(context, item)) {
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return preferredModelResult(context, false, "Gemini", "pro", "thinking level item could not be clicked", { thinkingLevel: desiredLevel, menuClosed });
    }
    const settled = await waitGeminiPickerSettled(context, "pro", modelId);
    const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
    return settled
      ? preferredModelResult(context, true, "Gemini", "pro", "", { changed: true, thinkingLevel: desiredLevel, menuClosed })
      : preferredModelResult(context, false, "Gemini", "pro", "selection did not settle", { thinkingLevel: desiredLevel, menuClosed });
  }

  async function applyGeminiPreferredModel(context, modelId, options = {}) {
    if (!GEMINI_MODEL_TARGETS[modelId]) return preferredModelResult(context, false, "Gemini", modelId, "unknown model");
    if (modelId === "thinking" || modelId === "extended") return applyGeminiThinkingTarget(context, modelId);
    const thinkingModelId = modelId === "pro" ? geminiThinkingLevelModelId(options?.thinkingLevel) : "";
    if (modelId === "pro" && options?.thinkingLevel && !thinkingModelId) {
      return preferredModelResult(context, false, "Gemini", modelId, "unknown thinking level");
    }
    if (geminiPickerMatches(modelId, thinkingModelId)) {
      return preferredModelResult(context, true, "Gemini", modelId, "", {
        skipped: true,
        ...(thinkingModelId ? { thinkingLevel: options.thinkingLevel } : {})
      });
    }

    let baseResult = null;
    if (currentGeminiPickerState().baseModelId !== modelId) {
      baseResult = await applyGeminiBaseModelTarget(context, modelId);
      if (!baseResult.ok) return baseResult;
    }
    let thinkingResult = null;
    if (thinkingModelId && !geminiPickerMatches("pro", thinkingModelId)) {
      thinkingResult = await applyGeminiThinkingTarget(context, thinkingModelId);
      if (!thinkingResult.ok) return thinkingResult;
    }
    const changed = Boolean(baseResult?.changed || thinkingResult?.changed);
    return preferredModelResult(context, true, "Gemini", modelId, "", {
      skipped: !changed,
      changed,
      ...(thinkingModelId ? { thinkingLevel: options.thinkingLevel } : {}),
      baseApplied: Boolean(baseResult?.changed),
      thinkingApplied: Boolean(thinkingResult?.changed),
      menuClosed: thinkingResult?.menuClosed ?? baseResult?.menuClosed
    });
  }

  const GROK_MODEL_TARGETS = Object.freeze({
    auto: Object.freeze({ id: "auto", aliases: ["auto", "model auto"] }),
    fast: Object.freeze({ id: "fast", aliases: ["fast", "model fast"] }),
    expert: Object.freeze({ id: "expert", aliases: ["expert", "model expert"] }),
    grok43: Object.freeze({ id: "grok43", aliases: ["grok 4.3", "grok43", "grok 4.3 beta", "grok43beta", "model grok 4.3"] }),
    heavy: Object.freeze({ id: "heavy", aliases: ["heavy", "model heavy"] })
  });

  const GROK_MODEL_MENU_ROOT_SELECTORS = Object.freeze([
    "[role='menu']",
    "[role='listbox']",
    "[role='dialog']",
    "[data-radix-menu-content]",
    "[data-radix-popper-content-wrapper]",
    "[data-radix-portal]",
    "[data-floating-ui-portal]",
    "[data-headlessui-portal]"
  ]);
  const GROK_MODEL_MENU_ITEM_SELECTORS = Object.freeze([
    "[role='menuitemradio']",
    "[role='menuitem']",
    "[role='option']",
    "button",
    "[data-radix-collection-item]",
    "[cmdk-item]"
  ]);
  const GROK_MODEL_TRIGGER_BUTTON_SELECTOR = [
    "button[aria-label='Model select']",
    "[role='button'][aria-label='Model select']",
    "button[aria-label*='model' i][aria-haspopup]",
    "[role='button'][aria-label*='model' i][aria-haspopup]",
    "button[data-slot='dropdown-menu-trigger'][aria-label*='model' i]",
    "[data-slot='dropdown-menu-trigger'][aria-label*='model' i]"
  ].join(", ");
  const GROK_MODEL_DIRECT_TRIGGER_SELECTORS = Object.freeze([
    "button",
    "[role='button']",
    "[aria-haspopup='menu']",
    "[aria-haspopup='listbox']",
    "[aria-haspopup='true']",
    "[data-slot='dropdown-menu-trigger']"
  ]);
  const GROK_MODEL_TRIGGER_SELECTORS = Object.freeze([
    "button",
    "[role='button']",
    "[aria-haspopup='menu']",
    "[aria-haspopup='listbox']",
    "[aria-haspopup='true']",
    "button[aria-label='Model select']",
    "[role='button'][aria-label='Model select']",
    "button[aria-label*='model' i][aria-haspopup]",
    "[role='button'][aria-label*='model' i][aria-haspopup]",
    "button[data-slot='dropdown-menu-trigger'][aria-label*='model' i]",
    "[data-slot='dropdown-menu-trigger'][aria-label*='model' i]",
    "[data-testid*='model' i]",
    "[data-testid*='mode' i]",
    "[aria-label*='model' i]",
    "[aria-label*='mode' i]",
    "[aria-label*='模型' i]",
    "[aria-label*='模式' i]",
    "[title*='model' i]",
    "[title*='mode' i]",
    "button[aria-haspopup='menu']",
    "button[aria-haspopup='listbox']",
    "button[aria-haspopup='true']",
    "[role='button'][aria-haspopup='menu']",
    "[role='button'][aria-haspopup='listbox']",
    "[role='button'][aria-haspopup='true']"
  ]);

  function grokModelIdFromText(value) {
    for (const [targetId, target] of Object.entries(GROK_MODEL_TARGETS)) {
      if (grokTextLooksLikeTarget(value, target)) return targetId;
    }
    return "";
  }

  function grokTextLooksLikeTarget(value, target) {
    if (!target) return false;
    const parts = String(value || "")
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const values = parts.length ? parts : [String(value || "")];
    for (const part of values) {
      const token = alnumModelToken(part);
      if (!token) continue;
      for (const alias of target.aliases || []) {
        const aliasToken = alnumModelToken(alias);
        if (token === aliasToken || token.startsWith(aliasToken) || aliasToken.startsWith(token) || token.includes(aliasToken)) return true;
      }
    }
    return false;
  }

  function countGrokModelTargets(value) {
    return Object.values(GROK_MODEL_TARGETS)
      .reduce((count, target) => count + (grokTextLooksLikeTarget(value, target) ? 1 : 0), 0);
  }

  function grokModelMenuItemRow(element, root, matchesSpec = null) {
    const rootArea = modelElementArea(root);
    const rootRect = modelRect(root);
    let bestRoleRow = null;
    let bestAction = null;
    let bestRowLike = null;
    let fallback = null;
    let node = element;
    while (node && node.nodeType === 1 && node !== root) {
      if (!visible(node) || isDisabledElement(node)) {
        node = node.parentElement || null;
        continue;
      }
      if (typeof matchesSpec === "function" && !matchesSpec(node)) {
        node = node.parentElement || null;
        continue;
      }
      const textValue = modelElementText(node);
      const targetCount = countGrokModelTargets(textValue);
      const area = modelElementArea(node);
      if (rootArea > 0 && area >= rootArea * 0.85) break;
      if (targetCount > 1) {
        node = node.parentElement || null;
        continue;
      }

      const rect = modelRect(node);
      const tag = String(node.tagName || "").toLowerCase();
      const role = String(node.getAttribute?.("role") || "").toLowerCase();
      const tabIndex = String(node.getAttribute?.("tabindex") || "").trim();
      const roleRowLike = role === "menuitem" || role === "menuitemradio" || role === "option";
      const actionLike = roleRowLike || tag === "button" || role === "button" || (tabIndex && tabIndex !== "-1");
      const rowLike = rect && rootRect &&
        rect.height >= 22 &&
        rect.height <= 94 &&
        rect.width >= Math.min(120, rootRect.width * 0.36) &&
        rect.width <= rootRect.width + 32;

      if (roleRowLike && !bestRoleRow) bestRoleRow = node;
      if (actionLike && !bestAction) bestAction = node;
      if (rowLike && !bestRowLike) bestRowLike = node;
      if (!fallback) fallback = node;
      node = node.parentElement || null;
    }
    return bestRoleRow || bestAction || bestRowLike || fallback || element;
  }

  function grokItemCandidates(root) {
    if (!root) return [];
    const seen = new Set();
    const candidates = [];
    const add = (element) => {
      if (!element || !visible(element) || isDisabledElement(element)) return;
      const textValue = modelElementText(element);
      if (!grokModelIdFromText(textValue) && countGrokModelTargets(textValue) !== 1) return;
      const item = grokModelMenuItemRow(element, root);
      if (!item || seen.has(item) || !root.contains?.(item) || !visible(item) || isDisabledElement(item)) return;
      const itemText = modelElementText(item);
      if (!grokModelIdFromText(itemText) || countGrokModelTargets(itemText) > 1) return;
      seen.add(item);
      candidates.push(item);
    };
    for (const element of visibleSelectorElements(GROK_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "li"], root)) add(element);
    return candidates;
  }

  function grokModelItemText(item) {
    const text = modelElementText(item);
    return text.split(/\n+/).map((part) => part.trim()).find(Boolean) || text;
  }

  function modelDirectText(element) {
    try {
      return normalize(Array.from(element?.childNodes || [])
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || "")
        .join(" "));
    } catch {
      return "";
    }
  }

  function modelColorChannels(value) {
    const match = String(value || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i);
    if (!match) return null;
    return {
      r: Number(match[1]) || 0,
      g: Number(match[2]) || 0,
      b: Number(match[3]) || 0,
      a: match[4] == null ? 1 : Number(match[4])
    };
  }

  function modelEffectiveOpacity(element, stop = null) {
    let opacity = 1;
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      try {
        opacity *= Math.max(0, Math.min(1, Number(getComputedStyle(node).opacity || 1)));
      } catch {}
      if (node === stop) break;
    }
    return opacity;
  }

  function grokModelLabelElements(item, target) {
    if (!item || !target) return [];
    const aliases = (target.aliases || []).map(alnumModelToken).filter(Boolean);
    const elements = [item, ...qsa("*", item).slice(0, 80)];
    return elements.filter((element) => {
      const own = alnumModelToken(modelDirectText(element));
      if (!own) return false;
      return aliases.some((alias) => own === alias || own.startsWith(alias) || alias.startsWith(own));
    });
  }

  function grokModelElementLooksMuted(element, item) {
    if (!element) return false;
    let style = null;
    try { style = getComputedStyle(element); } catch {}
    if (!style) return false;
    const color = modelColorChannels(style.color);
    const opacity = modelEffectiveOpacity(element, item);
    if (opacity > 0 && opacity < 0.66) return true;
    if (!color) return false;
    const alpha = Number.isFinite(color.a) ? color.a : 1;
    const maxChannel = Math.max(color.r, color.g, color.b);
    return alpha * opacity < 0.72 || maxChannel < 190;
  }

  function grokModelItemLooksUnavailable(item, modelId) {
    const target = GROK_MODEL_TARGETS[modelId] || null;
    if (!item || !target) return false;
    if (isDisabledElement(item)) return true;
    for (let node = item, depth = 0; node && node.nodeType === 1 && depth < 5; node = node.parentElement, depth += 1) {
      if (isDisabledElement(node)) return true;
      const ariaDisabled = String(node.getAttribute?.("aria-disabled") || "").trim().toLowerCase();
      const dataDisabled = String(node.getAttribute?.("data-disabled") || "").trim().toLowerCase();
      const dataState = String(node.getAttribute?.("data-state") || "").trim().toLowerCase();
      const className = typeof node.className === "string" ? node.className : String(node.className?.baseVal || "");
      if (ariaDisabled === "true" || dataDisabled === "true" || dataState === "disabled") return true;
      if (/(^|\s)(disabled|is-disabled|unavailable|locked|is-locked|paywall|requires-upgrade|opacity-50|pointer-events-none)(\s|$)/i.test(className)) return true;
      try {
        const style = getComputedStyle(node);
        if (style.pointerEvents === "none") return true;
        if (Number(style.opacity || 1) > 0 && Number(style.opacity || 1) < 0.55) return true;
      } catch {}
      if (node.getAttribute?.("role") === "menu" || node.getAttribute?.("role") === "listbox") break;
    }
    const labels = grokModelLabelElements(item, target);
    return labels.length > 0 && labels.every((element) => grokModelElementLooksMuted(element, item));
  }

  function grokTextStartsWithAlias(value, alias) {
    const token = alnumModelToken(value);
    const aliasToken = alnumModelToken(alias);
    return Boolean(token && aliasToken && (token === aliasToken || token.startsWith(aliasToken)));
  }

  function grokMenuRootLooksLikeModel(root) {
    if (!root || !visible(root)) return false;
    const rootText = modelElementText(root);
    const rootSignal = /\b(model|mode|grok)\b|模型|模式/i.test(rootText);
    let targetCount = 0;
    for (const item of grokItemCandidates(root)) {
      if (grokModelIdFromText(modelElementText(item))) targetCount += 1;
      if (targetCount >= 2) return true;
    }
    return Boolean(countGrokModelTargets(rootText) >= 2 || (grokModelIdFromText(rootText) && (rootSignal || targetCount >= 1)));
  }

  function grokModelMenuRoot(triggerEl = null) {
    if (triggerEl) {
      const controlsId = String(triggerEl.getAttribute?.("aria-controls") || "").trim();
      if (controlsId) {
        const controlled = document.getElementById(controlsId);
        if (grokMenuRootLooksLikeModel(controlled)) return controlled;
      }
      const triggerId = String(triggerEl.getAttribute?.("id") || "").trim();
      if (triggerId) {
        const escapedTriggerId = triggerId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        for (const selector of GROK_MODEL_MENU_ROOT_SELECTORS) {
          const labelled = qs(`${selector}[aria-labelledby="${escapedTriggerId}"]`);
          if (grokMenuRootLooksLikeModel(labelled)) return labelled;
        }
      }
    }
    const roots = visibleSelectorElements(GROK_MODEL_MENU_ROOT_SELECTORS)
      .filter(grokMenuRootLooksLikeModel)
      .sort((a, b) => Number(a.getBoundingClientRect?.().bottom || 0) - Number(b.getBoundingClientRect?.().bottom || 0));
    return roots[roots.length - 1] || null;
  }

  function grokTextLooksLikeComposerPrompt(value) {
    const textValue = compactModelText(value);
    return Boolean(textValue && (
      textValue.includes("ask anything") ||
      textValue.includes("message grok") ||
      textValue.includes("ask grok") ||
      textValue.includes("what can i help") ||
      textValue.includes("message") ||
      textValue.includes("prompt") ||
      textValue.includes("输入") ||
      textValue.includes("提问") ||
      textValue.includes("问我")
    ));
  }

  function grokComposerCandidateText(element) {
    if (!element) return "";
    return [
      element.getAttribute?.("placeholder"),
      element.getAttribute?.("aria-placeholder"),
      element.getAttribute?.("data-placeholder"),
      modelElementText(element)
    ].filter(Boolean).join(" ");
  }

  function isLikelyGrokComposerRect(rect) {
    if (!rect || rect.width < 260 || rect.height < 36 || rect.height > 260) return false;
    const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0);
    const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0);
    if (viewportWidth > 0 && rect.right < viewportWidth * 0.30) return false;
    if (viewportHeight > 0 && rect.bottom < viewportHeight * 0.35) return false;
    return true;
  }

  function findGrokComposerRoot() {
    const selector = [
      "textarea",
      '[contenteditable="true"]',
      '[role="textbox"]',
      "[data-placeholder]",
      "[aria-placeholder]",
      "form",
      "[data-testid*='composer' i]",
      "[data-testid*='prompt' i]",
      "div"
    ].join(", ");
    const candidates = [];
    const seen = new Set();
    for (const element of visibleSelectorElements(selector)) {
      if (!element || seen.has(element)) continue;
      seen.add(element);
      if (!grokTextLooksLikeComposerPrompt(grokComposerCandidateText(element))) continue;
      let node = element;
      let best = element;
      while (node && node.nodeType === 1 && node !== document.body) {
        const rect = modelRect(node);
        if (rect && rect.width >= 280 && rect.height >= 40 && rect.height <= 260) best = node;
        node = node.parentElement || null;
      }
      const rect = modelRect(best);
      if (!rect || !isLikelyGrokComposerRect(rect)) continue;
      candidates.push({ element: best, score: rect.bottom + Math.min(260, rect.width) });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.element || null;
  }

  function isGrokModelTriggerNearComposer(element, composerRoot = null, composerRect = null) {
    if (!element) return false;
    if (composerRoot?.contains?.(element)) return true;
    const rect = modelRect(element);
    if (!rect || !composerRect || !isLikelyGrokComposerRect(composerRect)) return false;
    const inComposerY = rect.top >= composerRect.top - 14 && rect.bottom <= composerRect.bottom + 14;
    const inComposerX = rect.left >= composerRect.left - 14 && rect.right <= composerRect.right + 14;
    const controlSized = rect.width >= 20 && rect.width <= 220 && rect.height >= 18 && rect.height <= 80;
    return inComposerY && inComposerX && controlSized;
  }

  function grokModelTriggerLooksLikeVoiceControl(value) {
    return /\b(voice|dictation|microphone|mic|record(?:ing)?|audio|speech|speak)\b|语音|麦克风|录音|听写/i.test(String(value || ""));
  }

  function grokModelTriggerHasModelSignal(value) {
    const textValue = String(value || "");
    if (/\bmodel\b|模型|模式/i.test(textValue)) return true;
    return /\bmode\b/i.test(textValue) && !/\bvoice\s+mode\b/i.test(textValue);
  }

  function grokModelTriggerButton(element) {
    if (!element) return null;
    if (matches(element, GROK_MODEL_TRIGGER_BUTTON_SELECTOR)) return element;
    return closest(element, GROK_MODEL_TRIGGER_BUTTON_SELECTOR) || closest(element, "button, [role='button']") || element;
  }

  function directGrokModelTriggerBoost(element) {
    if (!element || !visible(element) || isDisabledElement(element)) return 0;
    const rootsSelector = GROK_MODEL_MENU_ROOT_SELECTORS.join(", ");
    if (element.closest?.(rootsSelector)) return 0;
    const textValue = modelElementText(element);
    const ariaLabel = String(element.getAttribute?.("aria-label") || "").trim();
    const title = String(element.getAttribute?.("title") || "").trim();
    const dataSlot = String(element.getAttribute?.("data-slot") || "").trim();
    const dataTestId = String(element.getAttribute?.("data-testid") || "").trim();
    const searchValue = [textValue, ariaLabel, title, dataSlot, dataTestId].filter(Boolean).join(" ");
    const targetId = grokModelIdFromText(textValue) || grokModelIdFromText(ariaLabel) || grokModelIdFromText(searchValue);
    const modelSelect = /\bmodel\s*select\b/i.test(searchValue);
    const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
    if (grokModelTriggerLooksLikeVoiceControl(searchValue) && !targetId && !modelSelect) return 0;
    if (!targetId && !modelSelect) return 0;
    let score = 650;
    if (modelSelect) score += 520;
    if (targetId) score += 240;
    if (popup === "menu" || popup === "listbox" || popup === "true") score += 120;
    if (dataSlot === "dropdown-menu-trigger") score += 80;
    if (parseBooleanAttr(element.getAttribute?.("aria-expanded")) !== null) score += 30;
    return score;
  }

  function scoreGrokModelTrigger(element, options = {}) {
    if (!element || !visible(element) || isDisabledElement(element)) return -1;
    const rootsSelector = GROK_MODEL_MENU_ROOT_SELECTORS.join(", ");
    if (element.closest?.(rootsSelector)) return -1;
    const textValue = modelElementText(element);
    const dataTestId = String(element.getAttribute?.("data-testid") || "");
    const ariaLabel = String(element.getAttribute?.("aria-label") || "").trim();
    const title = String(element.getAttribute?.("title") || "");
    const searchValue = [textValue, dataTestId, ariaLabel, title].filter(Boolean).join(" ");
    const targetId = grokModelIdFromText(textValue) || grokModelIdFromText(searchValue);
    const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
    const nearComposer = isGrokModelTriggerNearComposer(element, options.composerRoot || null, options.composerRect || null);
    const hasModelSignal = grokModelTriggerHasModelSignal(searchValue);
    const hasGrokSignal = /\bgrok\b/i.test(searchValue);
    const exactModelTrigger = matches(element, GROK_MODEL_TRIGGER_BUTTON_SELECTOR);
    if (grokModelTriggerLooksLikeVoiceControl(searchValue) && !targetId && !/\bmodel\b|模型|模式/i.test(searchValue)) return -1;
    let score = 0;
    if (exactModelTrigger) score += 800;
    if (targetId) score += 500;
    if (nearComposer) score += 360;
    if (hasModelSignal) score += 320;
    if (hasGrokSignal) score += 120;
    if (popup === "menu" || popup === "listbox" || popup === "true") score += 110;
    if (parseBooleanAttr(element.getAttribute?.("aria-expanded")) !== null) score += 20;
    if (parseBooleanAttr(element.getAttribute?.("aria-pressed")) !== null) score += 10;
    if (options.composerRoot && !nearComposer && !targetId && !hasModelSignal) score -= 260;
    const compact = compactModelText(textValue);
    const allowIconLikeComposerControl = nearComposer && (popup === "menu" || popup === "listbox" || popup === "true" || compact.length <= 36);
    if (!targetId && !hasModelSignal && !allowIconLikeComposerControl) return -1;
    return score > 0 ? score : -1;
  }

  function grokModelTriggerCandidates() {
    const composerRoot = findGrokComposerRoot();
    const composerRect = modelRect(composerRoot);
    const seen = new Set();
    const candidates = [];
    const add = (element, boost = 0) => {
      const trigger = grokModelTriggerButton(element);
      if (!trigger || seen.has(trigger)) return;
      seen.add(trigger);
      const score = scoreGrokModelTrigger(trigger, { composerRoot, composerRect });
      if (score <= 0 && boost <= 0) return;
      candidates.push({ element: trigger, score: Math.max(0, score) + boost, bottom: Number(trigger.getBoundingClientRect?.().bottom || 0) });
    };
    for (const element of visibleSelectorElements(GROK_MODEL_DIRECT_TRIGGER_SELECTORS)) {
      add(element, directGrokModelTriggerBoost(grokModelTriggerButton(element) || element));
    }
    for (const element of visibleSelectorElements(GROK_MODEL_TRIGGER_SELECTORS)) {
      add(element);
    }
    candidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
    return candidates;
  }

  function findGrokModelTrigger() {
    return grokModelTriggerCandidates()[0]?.element || null;
  }

  function closeFloatingModelMenu() {
    const targets = [document.activeElement, document.body, document.documentElement, document, window].filter(Boolean);
    const seen = new Set();
    for (const target of targets) {
      if (!target || seen.has(target)) continue;
      seen.add(target);
      const KeyboardEventCtor = modelEventConstructor("KeyboardEvent", target);
      if (typeof KeyboardEventCtor !== "function") continue;
      for (const type of ["keydown", "keyup"]) {
        try {
          target.dispatchEvent(new KeyboardEventCtor(type, {
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
            composed: true
          }));
        } catch {}
      }
    }
  }

  async function closeFloatingModelMenuAndWait(getMenuRoot, timeoutMs = 900) {
    const getter = typeof getMenuRoot === "function" ? getMenuRoot : () => null;
    if (!getter()) return true;
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      closeFloatingModelMenu();
      await sleep(90);
      if (!getter()) return true;
    }
    return !getter();
  }

  async function openGrokModelMenu(context) {
    assertPreferredModelRun(context);
    const existing = grokModelMenuRoot();
    if (existing) return existing;
    const trigger = await waitForPreferredModel(context, findGrokModelTrigger, 10000, 150);
    if (!trigger || !preferredModelPointerActivate(context, trigger)) return null;
    return await waitForPreferredModel(context, () => grokModelMenuRoot(trigger), 1200, 90) || null;
  }

  function currentGrokModelId() {
    const trigger = findGrokModelTrigger();
    const current = grokModelIdFromText(modelElementText(trigger));
    if (current) return current;
    const root = grokModelMenuRoot();
    if (!root) return "";
    const selected = grokItemCandidates(root).find((item) => {
      const state = String(item.getAttribute?.("data-state") || "").trim().toLowerCase();
      const ariaChecked = String(item.getAttribute?.("aria-checked") || "").trim().toLowerCase();
      const ariaSelected = String(item.getAttribute?.("aria-selected") || "").trim().toLowerCase();
      return state === "checked" || state === "selected" || state === "active" || ariaChecked === "true" || ariaSelected === "true";
    });
    return grokModelIdFromText(modelElementText(selected));
  }

  function findGrokModelItem(root, modelId, options = {}) {
    const target = GROK_MODEL_TARGETS[modelId];
    if (!target) return null;
    const matchesTarget = (element) => grokTextLooksLikeTarget(modelElementText(element), target);
    for (const item of grokItemCandidates(root)) {
      if (!options.includeUnavailable && grokModelItemLooksUnavailable(item, modelId)) continue;
      const itemText = grokModelItemText(item);
      if (grokModelIdFromText(itemText) === modelId) return item;
      if (matchesTarget(item)) return item;
      for (const alias of target.aliases || []) {
        if (grokTextStartsWithAlias(itemText, alias)) return item;
      }
    }
    return null;
  }

  async function waitGrokModelSettled(context, modelId) {
    const deadline = Date.now() + 2000;
    while (Date.now() <= deadline) {
      assertPreferredModelRun(context);
      const current = currentGrokModelId();
      if (current && current === modelId) return true;
      await preferredModelSleep(context, 120);
    }
    assertPreferredModelRun(context);
    const final = currentGrokModelId();
    return final === modelId;
  }

  async function applyGrokPreferredModel(context, modelId) {
    if (!GROK_MODEL_TARGETS[modelId]) return preferredModelResult(context, false, "Grok", modelId, "unknown model");
    assertPreferredModelRun(context);
    if (currentGrokModelId() === modelId) return preferredModelResult(context, true, "Grok", modelId, "", { skipped: true });
    const root = await openGrokModelMenu(context);
    if (!root) return preferredModelResult(context, false, "Grok", modelId, "model menu not found", { retryable: true });
    const maybeItem = findGrokModelItem(root, modelId, { includeUnavailable: true });
    if (maybeItem && grokModelItemLooksUnavailable(maybeItem, modelId)) {
      const menuClosed = await dismissPreferredModelMenu(context, () => grokModelMenuRoot());
      return preferredModelResult(context, true, "Grok", modelId, "", { skipped: true, unavailable: true, menuClosed });
    }
    const item = maybeItem || findGrokModelItem(root, modelId);
    if (!item) {
      const menuClosed = await dismissPreferredModelMenu(context, () => grokModelMenuRoot());
      return preferredModelResult(context, false, "Grok", modelId, "target model item not found", { menuClosed });
    }
    if (!preferredModelActivate(context, item)) {
      const menuClosed = await dismissPreferredModelMenu(context, () => grokModelMenuRoot());
      return preferredModelResult(context, false, "Grok", modelId, "target model item could not be clicked", { menuClosed });
    }
    const settled = await waitGrokModelSettled(context, modelId);
    const menuClosed = await dismissPreferredModelMenu(context, () => grokModelMenuRoot());
    return settled
      ? preferredModelResult(context, true, "Grok", modelId, "", { changed: true, menuClosed })
      : preferredModelResult(context, false, "Grok", modelId, "selection did not settle", { menuClosed });
  }

  const NOTION_MODEL_TARGETS = Object.freeze({
    auto: Object.freeze({ id: "auto", label: "Auto", aliases: ["Automatic"] }),
    sonnet46: Object.freeze({ id: "sonnet46", label: "Claude Sonnet 4.6", aliases: ["Sonnet 4.6"] }),
    opus47: Object.freeze({ id: "opus47", label: "Claude Opus 4.7", aliases: ["Opus 4.7"] }),
    opus48: Object.freeze({ id: "opus48", label: "Claude Opus 4.8", aliases: ["Opus 4.8"] }),
    gemini31pro: Object.freeze({ id: "gemini31pro", label: "Gemini 3.1 Pro", aliases: ["Gemini Pro"] }),
    gpt52: Object.freeze({ id: "gpt52", label: "GPT-5.2", aliases: ["GPT 5.2"] }),
    gpt54: Object.freeze({ id: "gpt54", label: "GPT-5.4", aliases: ["GPT 5.4"] }),
    gpt55: Object.freeze({ id: "gpt55", label: "GPT-5.5", aliases: ["GPT 5.5"] }),
    grok43: Object.freeze({ id: "grok43", label: "Grok 4.3", aliases: ["Grok 43", "grok43"] }),
    grokBuild01: Object.freeze({ id: "grokBuild01", label: "Grok Build 0.1", aliases: ["Grok Build 01", "Grok Build"] }),
    kimi26: Object.freeze({ id: "kimi26", label: "Kimi K2.6", aliases: ["Kimi K2.6"] }),
    deepseekV4Pro: Object.freeze({ id: "deepseekV4Pro", label: "DeepSeek V4 Pro", aliases: ["DeepSeek V4"] }),
    glm52: Object.freeze({ id: "glm52", label: "GLM 5.2", aliases: ["GLM-5.2", "GLM"] })
  });

  const NOTION_MODEL_TRIGGER_SELECTORS = Object.freeze([
    '[data-testid="unified-chat-model-button"]',
    '[data-testid*="model" i]',
    '[aria-label*="model" i]',
    '[aria-label*="模型" i]',
    'button[aria-label*="model" i]',
    'button[aria-label*="模型" i]',
    'button[aria-haspopup="menu"]',
    'button[aria-haspopup="listbox"]',
    '[role="button"][aria-label*="model" i]',
    '[role="button"][aria-label*="模型" i]',
    '[role="button"][aria-haspopup="menu"]',
    '[role="button"][aria-haspopup="listbox"]',
    '[role="combobox"]',
    "button"
  ]);
  const NOTION_MODEL_MENU_ROOT_SELECTORS = Object.freeze([
    '[role="menu"]',
    '[role="listbox"]',
    '[role="dialog"]',
    '[data-radix-menu-content]',
    '[data-radix-popper-content-wrapper]',
    '[data-radix-portal]',
    '[data-floating-ui-portal]',
    '[data-floating-ui-portal] [role="menu"]'
  ]);
  const NOTION_MODEL_MENU_ITEM_SELECTORS = Object.freeze([
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[role="option"]',
    '[role="button"]',
    '[data-model]',
    '[data-value]',
    "button",
    '[tabindex]:not([tabindex="-1"])'
  ]);

  function notionText(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, " ");
  }

  function notionLabels(target) {
    return [target?.label, ...(target?.aliases || [])]
      .map(notionText)
      .filter(Boolean);
  }

  function notionTextLooksLikeTarget(value, target) {
    const textValue = notionText(value);
    if (!textValue || !target) return false;
    if (notionLabels(target).some((label) => textValue === label || textValue.includes(label))) return true;
    if (target.id === "gemini31pro") return textValue.includes("gemini") && textValue.includes("pro");
    if (target.id === "opus48") return textValue.includes("opus") && textValue.includes("4.8");
    if (target.id === "opus47") return textValue.includes("opus") && textValue.includes("4.7");
    if (target.id === "sonnet46") return textValue.includes("sonnet") && textValue.includes("4.6");
    if (target.id === "grok43") return textValue.includes("grok") && textValue.includes("4.3");
    if (target.id === "grokBuild01") return textValue.includes("grok") && textValue.includes("build");
    if (target.id === "deepseekV4Pro") return textValue.includes("deepseek") && textValue.includes("v4");
    if (target.id === "kimi26") return textValue.includes("kimi") && textValue.includes("k2.6");
    if (target.id === "glm52") return textValue.includes("glm") && textValue.includes("5.2");
    return false;
  }

  function notionModelIdFromText(value) {
    for (const [id, target] of Object.entries(NOTION_MODEL_TARGETS)) {
      if (notionTextLooksLikeTarget(value, target)) return id;
    }
    return "";
  }

  function countNotionModelTargets(value) {
    return Object.values(NOTION_MODEL_TARGETS)
      .reduce((count, target) => count + (notionTextLooksLikeTarget(value, target) ? 1 : 0), 0);
  }

  function notionViewportSize() {
    return {
      width: Number(window.innerWidth || document.documentElement?.clientWidth || 0),
      height: Number(window.innerHeight || document.documentElement?.clientHeight || 0)
    };
  }

  function isLikelyNotionMainComposerRect(rect) {
    if (!rect || rect.width < 280 || rect.height < 40 || rect.height > 280) return false;
    const viewport = notionViewportSize();
    if (viewport.width > 0 && rect.right < viewport.width * 0.35) return false;
    if (viewport.height > 0 && rect.bottom < viewport.height * 0.28) return false;
    return true;
  }

  function notionTextLooksLikeComposerPrompt(value) {
    const textValue = notionText(value);
    return Boolean(textValue && (
      textValue.includes("do anything with ai") ||
      textValue.includes("ask anything") ||
      textValue.includes("what can i help") ||
      textValue.includes("what should i help") ||
      textValue.includes("prompt") ||
      textValue.includes("message") ||
      textValue.includes("send a message") ||
      textValue.includes("提问") ||
      textValue.includes("输入") ||
      textValue.includes("问我")
    ));
  }

  function notionComposerCandidateText(element) {
    if (!element) return "";
    return [
      element.getAttribute?.("placeholder"),
      element.getAttribute?.("aria-placeholder"),
      element.getAttribute?.("data-placeholder"),
      modelElementText(element)
    ].filter(Boolean).join(" ");
  }

  function findNotionComposerRoot() {
    const selector = [
      "textarea",
      '[contenteditable="true"]',
      '[role="textbox"]',
      '[data-placeholder]',
      '[aria-placeholder]',
      "form",
      "div"
    ].join(", ");
    const candidates = [];
    const seen = new Set();
    for (const element of visibleSelectorElements(selector)) {
      if (!element || seen.has(element)) continue;
      seen.add(element);
      if (!notionTextLooksLikeComposerPrompt(notionComposerCandidateText(element))) continue;
      let node = element;
      let best = element;
      let bestScore = -1;
      while (node && node.nodeType === 1 && node !== document.body) {
        const rect = modelRect(node);
        if (rect && rect.width >= 320 && rect.height >= 44 && rect.height <= 260) {
          best = node;
        }
        node = node.parentElement || null;
      }
      const rect = modelRect(best);
      if (!rect || !isLikelyNotionMainComposerRect(rect)) continue;
      bestScore = rect.bottom + Math.min(300, rect.width);
      candidates.push({ element: best, score: bestScore });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.element || null;
  }

  function isNotionModelTriggerNearMainComposer(element, composerRoot = null, composerRect = null) {
    if (!element) return false;
    if (composerRoot?.contains?.(element)) return true;
    const rect = modelRect(element);
    if (!rect || !composerRect || !isLikelyNotionMainComposerRect(composerRect)) return false;
    const inComposerY = rect.top >= composerRect.top - 12 && rect.bottom <= composerRect.bottom + 12;
    const inComposerX = rect.left >= composerRect.left - 12 && rect.right <= composerRect.right + 12;
    const controlSized = rect.width >= 24 && rect.width <= 180 && rect.height >= 20 && rect.height <= 76;
    return inComposerY && inComposerX && controlSized;
  }

  function scoreNotionModelTrigger(element, options = {}) {
    if (!element || !visible(element) || (!options.allowDisabled && isDisabledElement(element))) return -1;
    if (element.closest?.(NOTION_MODEL_MENU_ROOT_SELECTORS.join(", "))) return -1;
    const textValue = modelElementText(element);
    const dataTestId = String(element.getAttribute?.("data-testid") || "").toLowerCase();
    const ariaLabel = String(element.getAttribute?.("aria-label") || "");
    const title = String(element.getAttribute?.("title") || "");
    const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
    const nearMainComposer = isNotionModelTriggerNearMainComposer(element, options.composerRoot || null, options.composerRect || null);
    let score = 0;
    if (nearMainComposer) score += 900;
    if (options.composerRoot && !nearMainComposer) score -= 420;
    if (dataTestId === "unified-chat-model-button") score += 1000;
    if (dataTestId.includes("model")) score += 500;
    if (/\bmodel\b|模型/i.test(ariaLabel)) score += 420;
    if (/\bmodel\b|模型/i.test(title)) score += 320;
    if (notionModelIdFromText(textValue)) score += 360;
    if (popup === "menu" || popup === "listbox") score += 80;
    if (notionText(textValue) === "auto" || notionTextLooksLikeTarget(textValue, NOTION_MODEL_TARGETS.auto)) score += 80;
    return score > 0 ? score : -1;
  }

  function findNotionModelControl({ allowDisabled = false } = {}) {
    const composerRoot = findNotionComposerRoot();
    const composerRect = modelRect(composerRoot);
    const candidates = visibleSelectorElements(NOTION_MODEL_TRIGGER_SELECTORS)
      .map((element) => ({
        element,
        score: scoreNotionModelTrigger(element, { composerRoot, composerRect, allowDisabled }),
        bottom: Number(element.getBoundingClientRect?.().bottom || 0)
      }))
      .filter((item) => item.score > 0);
    candidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
    return candidates[0]?.element || null;
  }

  function findNotionModelTrigger() {
    return findNotionModelControl();
  }

  function findNotionModelIndicator() {
    return findNotionModelControl({ allowDisabled: true });
  }

  function scoreNotionModelMenuRoot(root) {
    if (!root || !visible(root)) return -1;
    const textValue = modelElementText(root);
    const normalized = notionText(textValue);
    let score = 0;
    if (normalized.includes("select a model")) score += 160;
    if (normalized.includes("open models")) score += 80;
    score += Math.min(5, countNotionModelTargets(textValue)) * 80;
    return score >= 160 ? score : -1;
  }

  function notionModelMenuRoot(trigger = null) {
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (controlsId) {
      const controlled = document.getElementById(controlsId);
      if (scoreNotionModelMenuRoot(controlled) > 0) return controlled;
    }
    const roots = visibleSelectorElements(NOTION_MODEL_MENU_ROOT_SELECTORS)
      .map((element) => ({ element, score: scoreNotionModelMenuRoot(element) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    return roots[0]?.element || null;
  }

  async function openNotionModelMenu(context, trigger) {
    assertPreferredModelRun(context);
    const existing = notionModelMenuRoot(trigger);
    if (existing) return existing;
    if (!trigger || !preferredModelActivate(context, trigger)) return null;
    return waitForPreferredModel(context, () => notionModelMenuRoot(trigger), 3000, 120);
  }

  function notionMenuItemRow(element, root, matchesSpec = null) {
    const rootArea = modelElementArea(root);
    const rootRect = modelRect(root);
    let bestRoleRow = null;
    let bestAction = null;
    let bestRowLike = null;
    let fallback = null;
    let node = element;
    while (node && node.nodeType === 1 && node !== root) {
      if (!visible(node) || isDisabledElement(node)) {
        node = node.parentElement || null;
        continue;
      }

      const textValue = modelElementText(node);
      const targetCount = countNotionModelTargets(textValue);
      const area = modelElementArea(node);
      if (rootArea > 0 && area >= rootArea * 0.85) break;
      if (typeof matchesSpec === "function" && !matchesSpec(node)) {
        node = node.parentElement || null;
        continue;
      }
      if (targetCount > 1) {
        node = node.parentElement || null;
        continue;
      }

      const rect = modelRect(node);
      const tag = String(node.tagName || "").toLowerCase();
      const role = String(node.getAttribute?.("role") || "").toLowerCase();
      const tabIndex = String(node.getAttribute?.("tabindex") || "").trim();
      const roleRowLike = role === "menuitem" || role === "menuitemradio" || role === "option";
      const actionLike = roleRowLike || tag === "button" || role === "button" || (tabIndex && tabIndex !== "-1");
      const rowLike = rect && rootRect &&
        rect.height >= 22 &&
        rect.height <= 88 &&
        rect.width >= Math.min(120, rootRect.width * 0.38) &&
        rect.width <= rootRect.width + 32;

      if (roleRowLike && !bestRoleRow) bestRoleRow = node;
      if (actionLike && !bestAction) bestAction = node;
      if (rowLike && !bestRowLike) bestRowLike = node;
      if (!fallback) fallback = node;
      node = node.parentElement || null;
    }
    return bestRoleRow || bestAction || bestRowLike || fallback || element;
  }

  function scoreNotionModelItem(element, modelId) {
    if (!element || !visible(element) || isDisabledElement(element)) return Number.NEGATIVE_INFINITY;
    const textValue = modelElementText(element);
    const target = NOTION_MODEL_TARGETS[modelId];
    let score = 0;
    const role = String(element.getAttribute?.("role") || "").toLowerCase();
    const tag = String(element.tagName || "").toLowerCase();
    const tabIndex = String(element.getAttribute?.("tabindex") || "").trim();
    const targetCount = countNotionModelTargets(textValue);
    if (role === "menuitem" || role === "menuitemradio" || role === "option") score += 900;
    if (tag === "button" || role === "button") score += 360;
    if (tabIndex && tabIndex !== "-1") score += 120;
    if (targetCount === 1) score += 260;
    if (targetCount > 1) score -= 700;
    if (notionTextLooksLikeTarget(textValue, target)) score += 620;
    const labels = notionLabels(target);
    if (labels.includes(notionText(textValue))) score += 260;
    const rect = modelRect(element);
    if (rect && rect.height >= 24 && rect.height <= 72) score += 100;
    if (rect && rect.width >= 120) score += 40;
    score -= Math.min(160, modelElementArea(element) / 6000);
    return score;
  }

  function findNotionModelItem(root, modelId) {
    if (!root || !NOTION_MODEL_TARGETS[modelId]) return null;
    const target = NOTION_MODEL_TARGETS[modelId];
    const matchesSpec = (element) => notionTextLooksLikeTarget(modelElementText(element), target);
    const seenRows = new Set();
    const rows = [];
    const add = (element) => {
      if (!element || !matchesSpec(element)) return;
      const row = notionMenuItemRow(element, root, matchesSpec);
      if (!row || seenRows.has(row) || !root.contains?.(row)) return;
      if (!matchesSpec(row)) return;
      if (countNotionModelTargets(modelElementText(row)) > 1) return;
      seenRows.add(row);
      rows.push(row);
    };
    for (const element of visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "button"], root)) add(element);
    rows.sort((a, b) => scoreNotionModelItem(b, modelId) - scoreNotionModelItem(a, modelId));
    return rows[0] || null;
  }

  function findNotionModelItemPointTarget(element, root, modelId) {
    const target = NOTION_MODEL_TARGETS[modelId];
    const matchesSpec = (candidate) => notionTextLooksLikeTarget(modelElementText(candidate), target);
    const point = modelCenterPoint(element);
    const pointElement = modelElementFromPoint(point, element);
    if (!pointElement || !root?.contains?.(pointElement)) return null;
    let node = pointElement;
    while (node && node.nodeType === 1 && node !== root) {
      if (
        visible(node) &&
        !isDisabledElement(node) &&
        matchesSpec(node) &&
        countNotionModelTargets(modelElementText(node)) <= 1
      ) {
        const row = notionMenuItemRow(node, root, matchesSpec);
        if (row && root.contains?.(row) && matchesSpec(row)) return row;
      }
      node = node.parentElement || null;
    }
    const clickable = modelClickableAncestor(pointElement);
    return clickable && root.contains?.(clickable) && matchesSpec(clickable)
      ? clickable
      : null;
  }

  function notionElementHasSelectedState(element) {
    if (!element) return false;
    for (const attr of ["aria-checked", "aria-selected", "aria-current", "data-state", "data-selected", "data-active", "data-checked"]) {
      const value = String(element.getAttribute?.(attr) || "").trim().toLowerCase();
      if (value === "true" || value === "checked" || value === "selected" || value === "active" || value === "page") return true;
    }
    const className = String(element.className || "");
    return /\b(?:selected|checked|active)\b/i.test(className) && !/\b(?:unselected|inactive|unchecked)\b/i.test(className);
  }

  function notionRowHasRightCheckMarker(row) {
    const rowRect = modelRect(row);
    if (!rowRect || rowRect.width <= 0 || rowRect.height <= 0) return false;
    if (/[✓✔]/.test(String(row?.innerText || row?.textContent || ""))) return true;
    for (const marker of visibleSelectorElements([
      "[aria-label*='check' i]",
      "[aria-label*='selected' i]",
      "[data-testid*='check' i]",
      "[class*='check' i]",
      "svg"
    ], row)) {
      if (notionElementHasSelectedState(marker)) return true;
      const label = [
        marker.getAttribute?.("aria-label"),
        marker.getAttribute?.("data-testid"),
        marker.getAttribute?.("class"),
        marker.getAttribute?.("title"),
        marker.innerText || marker.textContent || ""
      ].filter(Boolean).join(" ");
      if (/\b(?:check|checked|selected|done)\b|✓|✔/i.test(label)) return true;
      const rect = modelRect(marker);
      if (!rect || rect.width < 5 || rect.height < 5 || rect.width > 32 || rect.height > 32) continue;
      const nearRight = rect.left >= rowRect.left + rowRect.width * 0.66 && rect.right <= rowRect.right + 10;
      const verticallyInside = rect.top >= rowRect.top - 3 && rect.bottom <= rowRect.bottom + 3;
      if (nearRight && verticallyInside) return true;
    }
    return false;
  }

  function notionRowLooksSelected(row) {
    if (!row) return false;
    if (notionElementHasSelectedState(row)) return true;
    for (const element of visibleSelectorElements([
      "[aria-checked]",
      "[aria-selected]",
      "[aria-current]",
      "[data-state]",
      "[data-selected]",
      "[data-active]",
      "[data-checked]"
    ], row)) {
      if (notionElementHasSelectedState(element)) return true;
    }
    return notionRowHasRightCheckMarker(row);
  }

  function selectedNotionModelId(root) {
    if (!root) return "";
    const seenRows = new Set();
    const rows = [];
    const add = (element) => {
      if (!element) return;
      const row = notionMenuItemRow(element, root);
      if (!row || seenRows.has(row) || !root.contains?.(row)) return;
      const textValue = modelElementText(row);
      if (countNotionModelTargets(textValue) !== 1) return;
      const id = notionModelIdFromText(textValue);
      if (!id || !notionRowLooksSelected(row)) return;
      seenRows.add(row);
      rows.push({ element: row, id, score: scoreNotionModelItem(row, id) });
    };
    for (const element of visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "button", "svg"], root)) add(element);
    rows.sort((a, b) => b.score - a.score);
    return rows[0]?.id || "";
  }

  function currentNotionModelId(trigger = null) {
    const selected = selectedNotionModelId(notionModelMenuRoot(trigger));
    if (selected) return selected;
    const triggerElement = trigger && visible(trigger) ? trigger : findNotionModelIndicator();
    return notionModelIdFromText(modelElementText(triggerElement));
  }

  async function waitNotionReadableCurrentModelId(context, trigger = null, timeoutMs = 2200) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      assertPreferredModelRun(context);
      const current = currentNotionModelId(trigger);
      if (current) return current;
      await preferredModelSleep(context, 120);
    }
    assertPreferredModelRun(context);
    return currentNotionModelId(trigger);
  }

  async function closeNotionModelMenu(context, trigger = null) {
    return dismissPreferredModelMenu(context, () => notionModelMenuRoot(trigger), 900);
  }

  async function waitNotionModelSettled(context, modelId, trigger) {
    const deadline = Date.now() + 3000;
    while (Date.now() <= deadline) {
      assertPreferredModelRun(context);
      const current = currentNotionModelId(trigger);
      if (current && current === modelId) return true;
      await preferredModelSleep(context, 120);
    }
    assertPreferredModelRun(context);
    const final = currentNotionModelId(trigger);
    return final === modelId;
  }

  async function applyNotionPreferredModel(context, modelId) {
    if (!NOTION_MODEL_TARGETS[modelId]) return preferredModelResult(context, false, "NotionAI", modelId, "unknown model");
    if ((await waitNotionReadableCurrentModelId(context, null, 1600)) === modelId) {
      const menuClosed = await closeNotionModelMenu(context);
      return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const trigger = await waitForPreferredModel(context, findNotionModelTrigger, 10000, 150);
    if (!trigger) {
      await closeNotionModelMenu(context);
      return preferredModelResult(context, false, "NotionAI", modelId, "model trigger not found", { retryable: true });
    }
    if ((await waitNotionReadableCurrentModelId(context, trigger, 2200)) === modelId) {
      const menuClosed = await closeNotionModelMenu(context, trigger);
      return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const root = await openNotionModelMenu(context, trigger);
    if (!root) {
      await closeNotionModelMenu(context, trigger);
      return preferredModelResult(context, false, "NotionAI", modelId, "model menu not found", { retryable: true });
    }
    if (currentNotionModelId(trigger) === modelId) {
      const menuClosed = await closeNotionModelMenu(context, trigger);
      return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const item = findNotionModelItem(root, modelId);
    if (!item) {
      const menuClosed = await closeNotionModelMenu(context, trigger);
      return preferredModelResult(context, false, "NotionAI", modelId, "target model item not found", { menuClosed });
    }
    const clicked = preferredModelActivate(context, item);
    let settled = clicked ? await waitNotionModelSettled(context, modelId, trigger) : false;
    const menuClosed = await closeNotionModelMenu(context, trigger);
    if (!settled && currentNotionModelId(trigger) === modelId) settled = true;
    if (!clicked) return preferredModelResult(context, false, "NotionAI", modelId, "target model item could not be clicked", { menuClosed });
    return settled
      ? preferredModelResult(context, true, "NotionAI", modelId, "", { changed: true, menuClosed })
      : preferredModelResult(context, false, "NotionAI", modelId, "selection did not settle", { menuClosed });
  }

  const DEEPSEEK_MODE_TARGETS = Object.freeze({
    instant: Object.freeze({ id: "instant", label: "Instant" }),
    expert: Object.freeze({ id: "expert", label: "Expert" }),
    vision: Object.freeze({ id: "vision", label: "Vision" })
  });
  const DEEPSEEK_MODE_SELECTORS = Object.freeze([
    "button",
    "[role='radio']",
    "[role='tab']",
    "[role='button']",
    "input[type='radio']",
    "label",
    "[aria-label]",
    "[aria-checked]",
    "[aria-selected]",
    "[data-testid]"
  ]);

  function deepSeekModeIdFromText(value) {
    const token = alnumModelToken(value);
    if (!token) return "";
    if (token.includes("instant")) return "instant";
    if (token.includes("expert")) return "expert";
    if (token.includes("vision")) return "vision";
    return "";
  }

  function deepSeekModeIdCount(value) {
    const token = alnumModelToken(value);
    if (!token) return 0;
    return ["instant", "expert", "vision"].reduce((count, id) => count + (token.includes(id) ? 1 : 0), 0);
  }

  function deepSeekModeCandidateText(element) {
    if (!element) return "";
    return [
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("aria-valuetext"),
      element.getAttribute?.("title"),
      element.getAttribute?.("data-testid"),
      element.getAttribute?.("data-value"),
      element.getAttribute?.("value"),
      modelElementText(element),
      element.value
    ].filter(Boolean).join(" ");
  }

  function deepSeekModeElementLooksSelected(element) {
    if (!element) return false;
    if (element.checked) return true;
    for (const attr of ["aria-checked", "aria-selected", "aria-current", "aria-pressed", "data-state", "data-selected", "data-active", "data-checked"]) {
      const value = String(element.getAttribute?.(attr) || "").trim().toLowerCase();
      if (value === "true" || value === "checked" || value === "selected" || value === "active" || value === "page" || value === "on") return true;
    }
    const className = String(element.className || "");
    return /\b(?:active|selected|checked)\b/i.test(className) && !/\b(?:inactive|unselected|unchecked)\b/i.test(className);
  }

  function deepSeekModeClickableElement(element) {
    return closest(element, "button, [role='radio'], [role='tab'], [role='button'], label, input[type='radio']") || element;
  }

  function deepSeekModeCandidates() {
    const seen = new Set();
    const candidates = [];
    for (const element of visibleSelectorElements(DEEPSEEK_MODE_SELECTORS)) {
      if (!element || !visible(element) || isDisabledElement(element)) continue;
      const textValue = deepSeekModeCandidateText(element);
      if (!deepSeekModeIdFromText(textValue) || deepSeekModeIdCount(textValue) !== 1) continue;
      const clickable = deepSeekModeClickableElement(element);
      if (!clickable || seen.has(clickable) || !visible(clickable) || isDisabledElement(clickable)) continue;
      const clickableText = deepSeekModeCandidateText(clickable);
      if (!deepSeekModeIdFromText(clickableText) || deepSeekModeIdCount(clickableText) !== 1) continue;
      seen.add(clickable);
      candidates.push(clickable);
    }
    candidates.sort((a, b) => {
      const ar = modelRect(a);
      const br = modelRect(b);
      if (ar && br) return ar.top - br.top || ar.left - br.left;
      return 0;
    });
    return candidates;
  }

  function currentDeepSeekModeId() {
    const selected = deepSeekModeCandidates().find((element) => deepSeekModeElementLooksSelected(element));
    const selectedId = deepSeekModeIdFromText(deepSeekModeCandidateText(selected));
    if (selectedId) return selectedId;
    const heading = visibleSelectorElements("h1, h2, h3, [role='heading']")
      .map((element) => modelElementText(element))
      .find((value) => /start chatting with/i.test(String(value || "")));
    return deepSeekModeIdFromText(heading);
  }

  function findDeepSeekModeTarget(modeId) {
    if (!DEEPSEEK_MODE_TARGETS[modeId]) return null;
    const matches = deepSeekModeCandidates()
      .filter((element) => deepSeekModeIdFromText(deepSeekModeCandidateText(element)) === modeId)
      .map((element) => ({
        element,
        rect: modelRect(element),
        text: deepSeekModeCandidateText(element)
      }))
      .filter((item) => item.rect && item.rect.width >= 20 && item.rect.height >= 16);
    matches.sort((a, b) => {
      const aExact = alnumModelToken(a.text) === modeId ? 1 : 0;
      const bExact = alnumModelToken(b.text) === modeId ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return a.rect.top - b.rect.top || a.rect.left - b.rect.left;
    });
    return matches[0]?.element || null;
  }

  function clickDeepSeekMode(context, element) {
    const target = deepSeekModeClickableElement(element);
    return preferredModelActivate(context, target);
  }

  async function waitDeepSeekModeSettled(context, modeId) {
    const deadline = Date.now() + 2500;
    while (Date.now() <= deadline) {
      assertPreferredModelRun(context);
      if (currentDeepSeekModeId() === modeId) return true;
      await preferredModelSleep(context, 100);
    }
    assertPreferredModelRun(context);
    return currentDeepSeekModeId() === modeId;
  }

  async function applyDeepSeekPreferredModel(context, modeId) {
    if (!DEEPSEEK_MODE_TARGETS[modeId]) return preferredModelResult(context, false, "DeepSeek", modeId, "unknown mode");
    await waitForPreferredModel(context, () => currentDeepSeekModeId() || (deepSeekModeCandidates().length ? "ready" : ""), 10000, 150);
    const current = currentDeepSeekModeId();
    if (current === modeId) return preferredModelResult(context, true, "DeepSeek", modeId, "", { skipped: true });
    const target = await waitForPreferredModel(context, () => findDeepSeekModeTarget(modeId), 10000, 150);
    if (!target) return preferredModelResult(context, false, "DeepSeek", modeId, "target mode not found", { retryable: true });
    if (!clickDeepSeekMode(context, target)) return preferredModelResult(context, false, "DeepSeek", modeId, "target mode could not be clicked");
    return (await waitDeepSeekModeSettled(context, modeId))
      ? preferredModelResult(context, true, "DeepSeek", modeId, "", { changed: true })
      : preferredModelResult(context, false, "DeepSeek", modeId, "selection did not settle", { current: currentDeepSeekModeId() });
  }

  async function applyPreferredModel(context, data = {}) {
    assertPreferredModelRun(context);
    const rawAppId = String(data.appId || "").trim();
    const appId = ({
      "GrokMirror": "Grok",
      "Grok Mirror": "Grok",
      "DeepSeek AI": "DeepSeek",
      "Notion AI": "NotionAI"
    })[rawAppId] || rawAppId;
    const modelId = String(data.modelId || "").trim();
    if (!appId || !modelId) return preferredModelResult(context, true, appId || "unknown", modelId, "", { skipped: true });
    if (appId === "Gemini") return applyGeminiPreferredModel(context, modelId, { thinkingLevel: data.thinkingLevel });
    if (appId === "Grok") return applyGrokPreferredModel(context, modelId);
    if (appId === "DeepSeek") return applyDeepSeekPreferredModel(context, modelId);
    if (appId === "NotionAI") return applyNotionPreferredModel(context, modelId);
    return preferredModelResult(context, true, appId, modelId, "", { skipped: true, unsupported: true });
  }

  async function runPreferredModelApply(data = {}) {
    const runId = String(data.runId || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    abortActivePreferredModelRun("superseded by a newer preferred model run");
    const controller = new AbortController();
    const context = {
      runId,
      controller,
      signal: controller.signal,
      bridgeGeneration: nextPreferredModelBridgeRunSequence(),
      bridgeToken: "",
      bridgeReleased: false,
      focusShieldGeneration: 0,
      focusShieldValue: "",
      focusShieldReleaseScheduled: false,
      interactionCount: 0,
      abortKind: "",
      abortReason: ""
    };
    activePreferredModelRun = context;
    publishPreferredModelBridgeRun(context);
    const timeoutMs = Math.max(1000, Math.min(14000, Number(data.timeoutMs) || 12000));
    const timeout = setTimeout(() => {
      abortActivePreferredModelRun("preferred model apply timed out", runId);
    }, timeoutMs);
    const rawAppId = String(data.appId || "").trim();
    const appId = ({
      "GrokMirror": "Grok",
      "Grok Mirror": "Grok",
      "DeepSeek AI": "DeepSeek",
      "Notion AI": "NotionAI"
    })[rawAppId] || rawAppId || "unknown";
    const modelId = String(data.modelId || "").trim();
    try {
      return await applyPreferredModel(context, data);
    } catch (error) {
      const cancelled = Boolean(error?.preferredModelCancelled || preferredModelCancelled(context));
      if (cancelled) {
        const timedOut = context.abortKind === "timeout";
        return preferredModelResult(context, false, appId, modelId, error?.message || preferredModelAbortReason(context), {
          cancelled: !timedOut,
          retryable: timedOut
        });
      }
      return preferredModelResult(context, false, appId, modelId, error?.message || String(error));
    } finally {
      clearTimeout(timeout);
      releasePreferredModelBridgeRun(context);
      if (activePreferredModelRun === context) activePreferredModelRun = null;
    }
  }

  function cancelPreferredModelApply(data = {}) {
    const runId = String(data.runId || "");
    const active = activePreferredModelRun;
    const appId = String(data.appId || active?.appId || "unknown");
    const modelId = String(data.modelId || active?.modelId || "");
    const reason = String(data.reason || "preferred model apply cancelled");
    const cancelled = abortActivePreferredModelRun(reason, runId);
    return modelResult(true, appId, modelId, cancelled ? reason : "preferred model run is not active", {
      runId,
      skipped: !cancelled,
      cancelled,
      interactionCount: active?.interactionCount || 0
    });
  }

  function shouldUseCustomSummaryUserscript(config, runner) {
    const customMode = config.builtIn === false || config.sourceMode === "custom" || config.userscriptOverride === true;
    return customMode && (!runner || customMode);
  }

  async function executeCustomSummaryUserscript(config = {}) {
    const response = await sendExtensionRuntimeMessage({
      source: SOURCE,
      action: "executeSummaryUserscript",
      configId: String(config.id || "")
    });
    if (!response?.success) {
      throw new Error(response?.error || "Custom Summary userscript execution failed");
    }
    return response.data || { messages: [] };
  }

  function assertSummaryTargetCurrent(data = {}) {
    const expectedDocumentId = String(data?.expectedDocumentId || "");
    if (expectedDocumentId && expectedDocumentId !== contentDocumentId) {
      throw new Error("Summary target document changed before collection");
    }
    const expectedHref = String(data?.expectedHref || "");
    if (expectedHref && expectedHref !== String(location.href || "")) {
      throw new Error("Summary target URL changed during collection");
    }
  }

  function finishSummaryCollection(data, result) {
    assertSummaryTargetCurrent(data);
    return result;
  }

  async function collectSummary(data) {
    assertSummaryTargetCurrent(data);
    const config = data?.config || {};
    let registry = {};
    try { registry = runtimes.require("summary-runners", CONTENT_BRIDGE_VERSION).scripts || {}; } catch {}
    const packagedRunner = registry[config.id] || registry[config.userscriptFile];
    if (shouldUseCustomSummaryUserscript(config, packagedRunner)) {
      const customResult = await executeCustomSummaryUserscript(config);
      const customMessages = merge(Array.isArray(customResult?.messages) ? customResult.messages : []);
      return finishSummaryCollection(data, {
        ...customResult,
        messages: hasUserAndAssistant(customMessages) ? customMessages : [],
        rawMessageCount: Number(customResult?.rawMessageCount) || customMessages.length,
        hasUserAndAssistant: hasUserAndAssistant(customMessages),
        runner: "user-scripts"
      });
    }
    if (config.userscriptRunMode !== "serial") {
      const pageResult = await pageSummaryRequest(config);
      const pageMessages = merge(Array.isArray(pageResult?.messages) ? pageResult.messages : []);
      if (hasUserAndAssistant(pageMessages)) {
        return finishSummaryCollection(data, {
          messages: pageMessages,
          rawMessageCount: Number(pageResult.rawMessageCount) || pageMessages.length,
          hasUserAndAssistant: true,
          runner: "page-world"
        });
      }
    }
    const runner = packagedRunner;
    if (!runner) return finishSummaryCollection(data, { messages: [] });
    const api = {
      config,
      sleep,
      normalize,
      qsa,
      qs,
      closest,
      visible,
      text,
      buttonText,
      reveal,
      merge,
      copy,
      copyFirst,
      extractCopySequence,
      extractNativeCopyConversation,
      extractDeepSeekNativeCopyMessages: extractNativeCopyConversation,
      extractGrokNativeCopyMessages: extractNativeCopyConversation,
      extractTurns,
      findCopyButtons: userscriptFindCopyButtons
    };
    const result = await runner(api);
    const messages = merge(Array.isArray(result) ? result : result?.messages || []);
    return finishSummaryCollection(data, {
      messages: hasUserAndAssistant(messages) ? messages : [],
      rawMessageCount: messages.length,
      hasUserAndAssistant: hasUserAndAssistant(messages)
    });
  }

  function messageNavigatorRuntime() {
    const runtime = window.__CHATCLUB_MESSAGE_NAVIGATOR__;
    if (!runtime || typeof runtime.setEnabled !== "function") {
      throw new Error("Message navigator runtime is unavailable");
    }
    return runtime;
  }

  function setMessageNavigator(data = {}) {
    return messageNavigatorRuntime().setEnabled(data);
  }

  function hideMessageNavigatorMenu() {
    const runtime = messageNavigatorRuntime();
    return typeof runtime.closeMenu === "function" ? runtime.closeMenu() : runtime.state();
  }

  function getMessageNavigatorState() {
    const runtime = window.__CHATCLUB_MESSAGE_NAVIGATOR__;
    return runtime && typeof runtime.state === "function"
      ? runtime.state()
      : { ok: false, enabled: false, messageCount: 0, error: "Message navigator runtime is unavailable" };
  }

  async function getSummaryRuntimeState() {
    const registration = runtimes.registration("summary-runners");
    const registry = registration?.api?.scripts;
    const isolatedVersion = String(registration?.version || "");
    const isolatedReady = Boolean(
      registry
      && typeof registry === "object"
      && Object.keys(registry).length
      && isolatedVersion === CONTENT_BRIDGE_VERSION
    );
    const pageState = await pageSummaryRuntimeState();
    const mainReady = Boolean(
      pageState?.ready
      && pageState.bridgeVersion === CONTENT_BRIDGE_VERSION
    );
    return {
      ready: isolatedReady && mainReady,
      isolatedReady,
      mainReady,
      isolatedVersion,
      mainVersion: String(pageState?.bridgeVersion || ""),
      documentId: contentDocumentId,
      bridgeVersion: CONTENT_BRIDGE_VERSION
    };
  }

  async function handleContentAction(action, data = {}) {
    if (!FRAME_COMMAND_SPECS[action]) throw new Error(`Unknown action: ${action}`);
    if (action === "getLocationHref") return location.href;
    if (action === "getPageMeta") return pageMeta();
    if (action === "getPageText") return normalize(document.body?.innerText || "");
    if (action === "getSummaryRuntimeState") return getSummaryRuntimeState();
    if (action === "sendText") return sendText(data);
    if (action === "newChatPreprocess") return { ok: true };
    if (action === "deleteThread") return deleteThread(data);
    if (action === "getDeleteConfirmState") return topicDeleteConfirmState(data?.site || "topic-delete");
    if (action === "applyPreferredModel") return runPreferredModelApply(data);
    if (action === "cancelPreferredModelApply") return cancelPreferredModelApply(data);
    if (action === "collectSummary") return collectSummary(data);
    if (action === "setMessageNavigator") return setMessageNavigator(data);
    if (action === "hideMessageNavigatorMenu") return hideMessageNavigatorMenu();
    if (action === "getMessageNavigatorState") return getMessageNavigatorState();
    throw new Error(`Unknown action: ${action}`);
  }

  try { window.__CHATCLUB_SECURE_FRAME_RPC_CLEANUP__?.(); } catch {}
  try { delete window.__CHATCLUB_SECURE_FRAME_RPC_CLEANUP__; } catch {}
  const secureFrameCommandListener = (message, sender, sendResponse) => {
    if (
      message?.source !== SECURE_FRAME_COMMAND_SOURCE
      || message.type !== "request"
      || message.bridgeDocumentId !== contentDocumentId
      || message.secureFrameToken !== secureFrameToken
      || sender?.id !== EXTENSION_API?.runtime?.id
    ) return false;
    Promise.resolve(handleContentAction(message.action, message.data || {}))
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    return true;
  };
  EXTENSION_API?.runtime?.onMessage?.addListener?.(secureFrameCommandListener);
  runtimes.register("frame-rpc", {
    version: CONTENT_BRIDGE_VERSION,
    api: Object.freeze({ listener: secureFrameCommandListener }),
    dispose() {
      try { EXTENSION_API?.runtime?.onMessage?.removeListener?.(secureFrameCommandListener); } catch {}
    }
  });

  window.addEventListener("message", async (event) => {
    if (!EXTENSION_ORIGIN || event.source !== window.parent || event.origin !== EXTENSION_ORIGIN) return;
    const message = event.data;
    const versionedDeleteRequest = message?.source === DELETE_THREAD_POST_MESSAGE_SOURCE;
    const versionedSendTextRequest = message?.source === SEND_TEXT_POST_MESSAGE_SOURCE;
    const versionedPreferredModelRequest = message?.source === PREFERRED_MODEL_POST_MESSAGE_SOURCE;
    const versionedNavigatorRequest = message?.source === MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE;
    const versionedSummaryRequest = message?.source === SUMMARY_POST_MESSAGE_SOURCE;
    const genericRequest = message?.source === SOURCE;
    if ((!versionedDeleteRequest && !versionedSendTextRequest && !versionedPreferredModelRequest && !versionedNavigatorRequest && !versionedSummaryRequest && !genericRequest) || message.type !== "request") return;
    if (versionedSendTextRequest && !contentBridgeIsCurrent()) return;
    if (versionedPreferredModelRequest && !contentBridgeIsCurrent()) return;
    if (genericRequest && hadContentBridge) return;
    if (genericRequest && ["applyPreferredModel", "cancelPreferredModelApply"].includes(message.action)) return;
    if (versionedDeleteRequest && message.action !== "deleteThread" && message.action !== "getDeleteConfirmState") return;
    if (versionedSendTextRequest && message.action !== "sendText") return;
    if (versionedPreferredModelRequest && !["applyPreferredModel", "cancelPreferredModelApply"].includes(message.action)) return;
    if (versionedNavigatorRequest && !["setMessageNavigator", "hideMessageNavigatorMenu", "getMessageNavigatorState"].includes(message.action)) return;
    if (versionedSummaryRequest && !["getLocationHref", "getPageMeta", "getPageText", "collectSummary"].includes(message.action)) return;
    const responseSource = versionedDeleteRequest
      ? DELETE_THREAD_POST_MESSAGE_SOURCE
      : versionedSendTextRequest
        ? SEND_TEXT_POST_MESSAGE_SOURCE
        : versionedPreferredModelRequest
          ? PREFERRED_MODEL_POST_MESSAGE_SOURCE
          : versionedNavigatorRequest
            ? MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE
            : versionedSummaryRequest
              ? SUMMARY_POST_MESSAGE_SOURCE
              : SOURCE;
    try {
      const data = await handleContentAction(message.action, message.data || {});
      respond(event.source, message.id, message.action, data, null, responseSource);
    } catch (error) {
      respond(event.source, message.id, message.action, null, error.message || String(error), responseSource);
    }
  }, true);

  try { window.__CHATCLUB_SHORTCUT_BRIDGE_CLEANUP__?.(); } catch {}
  const shortcutBridgeController = new AbortController();
  const shortcutBridgeOptions = { capture: true, signal: shortcutBridgeController.signal };
  window.addEventListener("keydown", (event) => {
    if (!contentBridgeIsCurrent()) return;
    if (!event.isTrusted) return;
    if (Date.now() < suppressShortcutBridgeUntil) return;
    const matched = matchShortcut(event);
    if (!matched) return;
    if (!shouldBridgeShortcut(matched, event)) return;
    event.preventDefault();
    event.stopPropagation();
    postShortcutTriggered(matched);
  }, shortcutBridgeOptions);

  loadShortcutConfig();
  const shortcutStorageChanged = (changes, areaName) => {
    if (!contentBridgeIsCurrent()) return;
    if (areaName === "local" && changes.shortcutConfig) {
      activeShortcutConfig = normalizeShortcutConfig(changes.shortcutConfig.newValue);
    }
  };
  try {
    EXTENSION_API?.storage?.onChanged?.addListener(shortcutStorageChanged);
  } catch {}
  window.__CHATCLUB_SHORTCUT_BRIDGE_CLEANUP__ = () => {
    shortcutBridgeController.abort();
    try { EXTENSION_API?.storage?.onChanged?.removeListener(shortcutStorageChanged); } catch {}
  };

  announceContentReady();
}

installContentBridge();
