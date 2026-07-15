import { compact, deadlineExpired, deadlineFromPayload, normalize, remainingDeadlineMs, wait, waitUntilDeadline } from "./notion-utils.js";
import { installNotionEventListeners } from "./notion-events.js";

export function installNotionSendBridge(runtimes, protocol) {
  const runtimeName = "notion-send-bridge";
  const NOTION_SEND_TEXT_SOURCE = protocol.NOTION_SEND_TEXT_SOURCE;
  const NOTION_SEND_PROMPT_SOURCE = protocol.NOTION_SEND_PROMPT_SOURCE;
  const NOTION_SEND_BRIDGE_VERSION = NOTION_SEND_TEXT_SOURCE.split(":").at(-1);
  const existing = runtimes.registration(runtimeName);
  if (existing?.version === NOTION_SEND_BRIDGE_VERSION) {
    window.__CHATCLUB_NOTION_SEND_BRIDGE_VERSION__ = NOTION_SEND_BRIDGE_VERSION;
    window.__CHATCLUB_NOTION_SEND_BRIDGE_CLEANUP__ = existing.api.dispose;
    return;
  }
  runtimes.invalidate(runtimeName, `replaced by ${NOTION_SEND_BRIDGE_VERSION}`);
  try { window.__CHATCLUB_NOTION_SEND_BRIDGE_CLEANUP__?.(); } catch {}
  const notionSendBridgeAbort = new AbortController();
  const notionSendRequestCache = new Map();
  const notionSendRequestTimers = new Set();
  const cleanup = () => {
    try { notionSendBridgeAbort.abort(); } catch {}
    for (const timer of notionSendRequestTimers) clearTimeout(timer);
    notionSendRequestTimers.clear();
    notionSendRequestCache.clear();
  };
  window.__CHATCLUB_NOTION_SEND_BRIDGE_CLEANUP__ = cleanup;
  window.__CHATCLUB_NOTION_SEND_BRIDGE_VERSION__ = NOTION_SEND_BRIDGE_VERSION;
  window.__CHATCLUB_NOTION_SUBMIT_BRIDGE__ = true;
  const NOTION_SEND_TEXT_EVENT = protocol.NOTION_SEND_TEXT_EVENT;
  const NOTION_SEND_PROMPT_EVENT = protocol.NOTION_SEND_PROMPT_EVENT;
  const NOTION_SEND_ACTIVATED_EVENT = protocol.NOTION_SEND_ACTIVATED_EVENT;
  const visible = (el) => {
    if (!el?.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 4 && rect.height > 4 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
  };
  const isDisabled = (el) => {
    if (!el) return true;
    if (el.disabled || el.hasAttribute?.("disabled") || el.hasAttribute?.("data-disabled")) return true;
    const ariaDisabled = String(el.getAttribute?.("aria-disabled") || "").trim().toLowerCase();
    if (ariaDisabled === "true") return true;
    const dataState = String(el.getAttribute?.("data-state") || "").trim().toLowerCase();
    if (dataState === "disabled") return true;
    try {
      if (typeof el.matches === "function" && el.matches(":disabled")) return true;
    } catch {}
    return false;
  };
  const labelOf = (el) => normalize([
    el?.getAttribute?.("aria-label"),
    el?.getAttribute?.("title"),
    el?.getAttribute?.("data-testid"),
    el?.getAttribute?.("data-test-id"),
    el?.innerText,
    el?.textContent
  ].filter(Boolean).join(" "));
  const queryAll = (root, selector) => {
    try { return Array.from(root?.querySelectorAll?.(selector) || []); } catch { return []; }
  };
  const rectOf = (element) => {
    try {
      const rect = element?.getBoundingClientRect?.();
      return rect && rect.width > 0 && rect.height > 0 ? rect : null;
    } catch {
      return null;
    }
  };
  const collectOpenShadowElements = (root, selector) => {
    const out = [];
    const seenElements = new Set();
    const seenRoots = new Set();
    let hostCount = 0;
    const push = (element) => {
      if (!element || seenElements.has(element)) return;
      seenElements.add(element);
      out.push(element);
    };
    const visit = (scope) => {
      if (!scope || seenRoots.has(scope) || hostCount > 1800) return;
      seenRoots.add(scope);
      if (scope.nodeType === 1) {
        try { if (scope.matches?.(selector)) push(scope); } catch {}
      }
      for (const element of queryAll(scope, selector)) push(element);
      for (const host of queryAll(scope, "*")) {
        if (!host?.shadowRoot) continue;
        hostCount += 1;
        if (hostCount > 1800) break;
        visit(host.shadowRoot);
      }
    };
    visit(root || document);
    return out;
  };
  const editorScope = (editor) => editor?.closest?.("form")
    || editor?.closest?.("[class*='composer' i],[class*='input' i],[data-testid*='composer' i]")
    || editor?.parentElement?.parentElement
    || editor?.parentElement
    || document.body;
  const editorText = (editor) => editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement
    ? normalize(editor.value)
    : normalize(editor?.innerText || editor?.textContent || "");
  const promptMatches = (actual, expected) => {
    const a = normalize(actual);
    const b = normalize(expected);
    return Boolean(a && b && a === b);
  };
  const promptWhitespaceCollapsedMatches = (actual, expected) => {
    const a = normalize(actual);
    const b = normalize(expected);
    if (!a || !b || a === b) return false;
    const compactActual = compact(a);
    const compactExpected = compact(b);
    return Boolean(compactActual && compactExpected && compactActual === compactExpected);
  };
  const promptReceiveFailureReason = (editor, value) => {
    return promptWhitespaceCollapsedMatches(editorText(editor), value)
      ? "Notion AI collapsed prompt whitespace/newlines before submit"
      : "Notion AI input did not receive the prompt";
  };
  const promptSubmitFailureReason = (editor, value) => {
    return promptWhitespaceCollapsedMatches(editorText(editor), value)
      ? "Notion AI collapsed prompt whitespace/newlines before submit"
      : "Notion AI kept the prompt in the composer after submit";
  };
  const findEditor = () => Array.from(document.querySelectorAll("div[contenteditable='true'][role='textbox'],div[contenteditable='true'],div[role='textbox'],textarea"))
    .filter(visible)
    .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null;
  const activateEditor = async (editor) => {
    if (!editor) return null;
    try { editor.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    try { editor.click?.(); } catch {}
    try { editor.focus?.({ preventScroll: true }); } catch { try { editor.focus?.(); } catch {} }
    await wait(40);
    return findEditor() || editor;
  };
  const waitFor = async (check, timeoutMs = 2000, intervalMs = 80, deadlineAt = 0) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs && !deadlineExpired(deadlineAt)) {
      const result = check();
      if (result) return result;
      if (!await waitUntilDeadline(intervalMs, deadlineAt)) break;
    }
    return check();
  };
  const selectEditorContents = (editor) => {
    if (!editor || editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) return;
    const selection = window.getSelection?.();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges?.();
    selection?.addRange?.(range);
  };
  const dispatchInput = (editor, value, inputType = "insertText") => {
    try {
      editor.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType,
        data: value
      }));
    } catch {}
    try {
      editor.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        cancelable: false,
        composed: true,
        inputType,
        data: value
      }));
    } catch {
      try { editor.dispatchEvent(new Event("input", { bubbles: true, composed: true })); } catch {}
    }
  };
  const setNativeValue = (editor, value) => {
    const prototype = Object.getPrototypeOf(editor);
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(editor, value);
    else editor.value = value;
  };
  const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const insertEditorHtml = async (editor, value) => {
    selectEditorContents(editor);
    try { document.execCommand("insertHTML", false, escapeHtml(value).replace(/\n/g, "<br>")); } catch {}
    dispatchInput(editor, value, "insertFromPaste");
    await wait(120);
    return promptMatches(editorText(editor), value);
  };
  const insertEditorText = async (editor, value) => {
    selectEditorContents(editor);
    try { document.execCommand("insertText", false, value); } catch {}
    dispatchInput(editor, value);
    await wait(90);
    return promptMatches(editorText(editor), value);
  };
  const setEditorText = async (editor, value) => {
    editor = await activateEditor(editor);
    if (!editor) return false;
    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      setNativeValue(editor, value);
      dispatchInput(editor, value);
      return promptMatches(editorText(editor), value);
    }
    if (/\n/.test(normalize(value)) && await insertEditorHtml(editor, value)) return true;
    if (await insertEditorText(editor, value)) return true;
    if (!/\n/.test(normalize(value)) && await insertEditorHtml(editor, value)) return true;
    return false;
  };
  const liveEditor = async (fallback = null, timeoutMs = 3000, deadlineAt = 0) => await waitFor(findEditor, timeoutMs, 100, deadlineAt) || fallback;
  const clearEditorText = async (editor) => {
    editor = await activateEditor(editor);
    if (!editor) return;
    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      setNativeValue(editor, "");
      dispatchInput(editor, "", "deleteContentBackward");
      await wait(80);
      return;
    }
    try {
      selectEditorContents(editor);
      document.execCommand("delete", false);
    } catch {}
    dispatchInput(editor, "", "deleteContentBackward");
    await wait(100);
  };
  const prepareComposerForRun = async (editor, deadlineAt = 0) => {
    await clearAttachments(editor);
    if (deadlineExpired(deadlineAt)) return null;
    editor = await liveEditor(editor, 3000, deadlineAt);
    await clearEditorText(editor);
    return await liveEditor(editor, 3000, deadlineAt);
  };
  const ensurePromptCommitted = async (editor, text, deadlineAt = 0) => {
    if (!text) return { ok: true, editor: await liveEditor(editor, 2000, deadlineAt) };
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (deadlineExpired(deadlineAt)) break;
      editor = await liveEditor(editor, attempt === 1 ? 3000 : 4000, deadlineAt);
      if (!editor) break;
      const alreadyCommitted = promptMatches(editorText(editor), text);
      const writeStarted = alreadyCommitted || await setEditorText(editor, text);
      const written = writeStarted && await waitFor(() => promptMatches(editorText(editor), text), 2200, 80, deadlineAt);
      if (written) return { ok: true, editor };
      if (!await waitUntilDeadline(140, deadlineAt)) break;
    }
    return {
      ok: false,
      editor,
      reason: deadlineExpired(deadlineAt) ? "Send deadline exceeded" : promptReceiveFailureReason(editor, text)
    };
  };
  const countPromptOutsideEditor = (editor, value) => {
    const needle = compact(value);
    if (!needle) return 0;
    let text = "";
    try {
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || editor?.contains?.(parent)) continue;
        if (!normalize(node.nodeValue)) continue;
        text += `\n${node.nodeValue}`;
      }
    } catch {}
    const haystack = compact(text);
    if (!haystack || !haystack.includes(needle)) return 0;
    return haystack.split(needle).length - 1;
  };
  const isNotionComposerElement = (element, requireVisible = true) => {
    if (!element) return false;
    if (requireVisible && !visible(element)) return false;
    const tag = String(element.tagName || "").toLowerCase();
    const editable = tag === "textarea"
      || tag === "input"
      || String(element.getAttribute?.("contenteditable") || "").toLowerCase() === "true"
      || String(element.getAttribute?.("role") || "").toLowerCase() === "textbox";
    return editable && !isDisabled(element);
  };
  const resolveNotionComposerElement = (element, { requireVisible = true } = {}) => {
    if (isNotionComposerElement(element, requireVisible)) return element;
    try {
      const scoped = element?.querySelector?.("div[contenteditable='true'][role='textbox'],div[contenteditable='true'],textarea,input[role='textbox']");
      if (isNotionComposerElement(scoped, requireVisible)) return scoped;
    } catch {}
    return findEditor();
  };
  const focusNotionComposer = async (deadlineAt = 0) => {
    const composer = await waitFor(findEditor, 4000, 120, deadlineAt);
    if (!composer) return null;
    const activated = await activateEditor(composer);
    await waitUntilDeadline(20, deadlineAt);
    return activated;
  };
  const findNotionComposerContainer = (composerEl) => {
    const composer = resolveNotionComposerElement(composerEl, { requireVisible: false }) || composerEl || null;
    const scopes = [];
    const pushScope = (scope) => {
      if (scope && !scopes.includes(scope)) scopes.push(scope);
    };
    try { pushScope(composer?.closest?.("form") || null); } catch {}
    try { pushScope(composer?.closest?.("[data-testid*='chat' i],[data-testid*='composer' i],[data-testid*='prompt' i],[data-testid*='unified-chat' i]") || null); } catch {}
    try {
      let node = composer?.parentElement || null;
      for (let depth = 0; node && depth < 8; depth += 1) {
        pushScope(node);
        node = node.parentElement || null;
      }
    } catch {}
    pushScope(editorScope(composer));
    pushScope(composer);
    const composerRect = rectOf(composer);
    const ranked = scopes.map((scope, index) => {
      const rect = rectOf(scope);
      if (!rect) return { scope, score: -Infinity };
      if (composerRect) {
        const containsComposer = rect.left <= composerRect.left + 4
          && rect.right >= composerRect.right - 4
          && rect.top <= composerRect.top + 4
          && rect.bottom >= composerRect.bottom - 4;
        if (!containsComposer) return { scope, score: -Infinity };
        if (rect.width + 8 < composerRect.width || rect.height + 8 < composerRect.height) {
          return { scope, score: -Infinity };
        }
      }
      const text = labelOf(scope).toLowerCase();
      let score = 0;
      if (String(scope?.tagName || "").toLowerCase() === "form") score += 220;
      if (text.includes("composer") || text.includes("prompt")) score += 220;
      if (text.includes("unified-chat")) score += 140;
      if (text.includes("do anything with ai")) score += 120;
      if (composer && scope?.contains?.(composer)) score += 100;
      if (queryAll(scope, "button,[role='button']").length > 0) score += 45;
      if (composerRect) {
        const extraHeight = rect.height - composerRect.height;
        score += extraHeight >= 24 ? 140 + Math.min(140, extraHeight) : 35;
      }
      if (rect.width >= 320) score += 60;
      if (rect.height >= 80 && rect.height <= 560) score += 170;
      else if (rect.height > 560) score -= Math.min(700, rect.height - 560);
      return { scope, score: score - index * 3 };
    }).filter((item) => Number.isFinite(item.score)).sort((a, b) => b.score - a.score);
    return ranked[0]?.scope || scopes.find(Boolean) || document.body || document;
  };
  const findNotionSendButtonNearComposer = (composerEl) => {
    const composer = resolveNotionComposerElement(composerEl, { requireVisible: false }) || composerEl || findEditor();
    const composerContainer = findNotionComposerContainer(composer);
    const composerRect = rectOf(composerContainer) || rectOf(composer);
    const scopes = [];
    const push = (scope) => {
      if (scope && !scopes.includes(scope)) scopes.push(scope);
    };
    try { push(composer?.closest?.("form") || null); } catch {}
    push(composerContainer);
    push(document);
    const selector = [
      "button[type='submit']",
      "button[aria-label*='submit ai message' i]",
      "button[title*='submit ai message' i]",
      "button[data-testid*='submit' i]",
      "button[aria-label*='submit' i]",
      "button[aria-label*='send' i]",
      "button[title*='send' i]",
      "button[data-testid*='send' i]",
      "button[aria-label*='发送' i]",
      "[role='button'][aria-label*='submit ai message' i]",
      "[role='button'][aria-label*='submit' i]",
      "[role='button'][aria-label*='send' i]",
      "[role='button'][data-testid*='send' i]"
    ].join(",");
    const seen = new Set();
    const candidates = [];
    const excluded = /\b(close|cancel|delete|remove|clear|dismiss|stop|attach|upload|file|image|photo)\b|关闭|取消|删除|移除|清空|停止|上传/i;
    for (const scope of scopes) {
      for (const button of collectOpenShadowElements(scope, selector)) {
        if (!button || seen.has(button) || !visible(button)) continue;
        seen.add(button);
        const label = labelOf(button);
        if (excluded.test(label)) continue;
        const rect = rectOf(button);
        if (composerRect && rect) {
          const nearY = rect.top >= composerRect.top - 96 && rect.bottom <= composerRect.bottom + 96;
          const nearX = rect.left >= composerRect.left - 160 && rect.right <= composerRect.right + 180;
          if (!nearY || !nearX) continue;
        }
        candidates.push(button);
      }
    }
    candidates.sort((a, b) => {
      const score = (text) => {
        const value = String(text || "").toLowerCase();
        let points = 0;
        if (value === "send" || value === "发送") points += 700;
        if (value.includes("submit ai message")) points += 650;
        if (value.includes("submit")) points += 260;
        if (value.includes("send") || value.includes("发送")) points += 220;
        return points;
      };
      const aScore = score(labelOf(a));
      const bScore = score(labelOf(b));
      if (aScore !== bScore) return bScore - aScore;
      return (rectOf(b)?.right || 0) - (rectOf(a)?.right || 0);
    });
    return candidates[0] || null;
  };
  const isNotionSendButtonDisabled = (button) => {
    if (!button) return true;
    if (isDisabled(button)) return true;
    const dataState = String(button.getAttribute?.("data-state") || "").toLowerCase();
    return dataState === "disabled";
  };
  const notifyNotionSendActivated = (payload = {}, method = "notion-submit") => {
    const sendId = String(payload?.sendId || "").trim();
    if (!sendId) return;
    try {
      window.dispatchEvent(new CustomEvent(NOTION_SEND_ACTIVATED_EVENT, {
        detail: JSON.stringify({
          sendId,
          appId: "NotionAI",
          method,
          activatedAt: Date.now(),
          deadlineAt: Math.max(0, Number(payload?.deadlineAt) || 0)
        })
      }));
    } catch {}
  };
  const sendNotionMessage = async (editor, deadlineAt = 0, payload = {}) => {
    const composer = resolveNotionComposerElement(editor, { requireVisible: true }) || await focusNotionComposer(deadlineAt);
    if (!composer) return { ok: false, method: "notion-bridge", reason: "Notion AI input element not found" };
    const button = findNotionSendButtonNearComposer(composer);
    if (button) {
      if (!isNotionSendButtonDisabled(button)) {
        if (deadlineExpired(deadlineAt)) return { ok: false, method: "notion-bridge", reason: "Send deadline exceeded" };
        notifyNotionSendActivated(payload, "notion-button");
        try {
          if (clickElement(button)) return { ok: true, method: "notion-bridge-button" };
        } catch {}
        try {
          button.click?.();
          return { ok: true, method: "notion-bridge-button" };
        } catch {}
      }
    }
    if (deadlineExpired(deadlineAt)) return { ok: false, method: "notion-bridge", reason: "Send deadline exceeded" };
    notifyNotionSendActivated(payload, "notion-enter");
    await pressEnter(composer);
    return { ok: true, method: "notion-bridge-enter" };
  };
  const clickElement = (el) => {
    const rect = el?.getBoundingClientRect?.();
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: rect ? rect.left + rect.width / 2 : 1,
      clientY: rect ? rect.top + rect.height / 2 : 1
    };
    try {
      el?.scrollIntoView?.({ block: "center", inline: "nearest" });
    } catch {}
    try {
      if (window.PointerEvent) {
        el.dispatchEvent(new PointerEvent("pointerover", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        el.dispatchEvent(new PointerEvent("pointerenter", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        el.dispatchEvent(new PointerEvent("pointermove", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        el.dispatchEvent(new PointerEvent("pointerdown", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        el.dispatchEvent(new PointerEvent("pointerup", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 }));
      }
    } catch {}
    try {
      for (const type of ["mouseover", "mouseenter", "mousemove", "mousedown", "mouseup", "click"]) {
        el.dispatchEvent(new MouseEvent(type, { ...base, buttons: type === "mouseup" || type === "click" ? 0 : 1 }));
      }
    } catch {}
    try { el.click?.(); } catch {}
    return true;
  };
  const pressEnter = async (editor) => {
    editor?.focus?.();
    const init = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
    for (const type of ["keydown", "keypress", "keyup"]) {
      try { editor?.dispatchEvent(new KeyboardEvent(type, init)); } catch {}
      await wait(45);
    }
  };
  const imageExtension = (mime) => {
    const value = String(mime || "").toLowerCase();
    if (value === "image/jpeg") return "jpg";
    if (value === "image/png") return "png";
    if (value === "image/webp") return "webp";
    if (value === "image/gif") return "gif";
    if (value === "image/bmp") return "bmp";
    if (value === "image/svg+xml") return "svg";
    if (value === "image/avif") return "avif";
    return value.split("/").pop()?.replace(/[^a-z0-9]/gi, "") || "png";
  };
  const mimeFromDataUrl = (dataUrl) => String(dataUrl || "").match(/^data:([^;,]+)[;,]/i)?.[1]?.toLowerCase() || "";
  const dataUrlToFile = (entry = {}, index = 0) => {
    const dataUrl = String(entry.dataUrl || entry.dataURL || "").trim();
    if (!/^data:image\//i.test(dataUrl)) return null;
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex < 0) return null;
    const meta = dataUrl.slice(5, commaIndex);
    const payload = dataUrl.slice(commaIndex + 1);
    const type = String(entry.type || "").trim() || mimeFromDataUrl(dataUrl) || "image/png";
    const name = String(entry.name || "").trim() || `prompt-image-${index + 1}.${imageExtension(type)}`;
    try {
      let bytes;
      if (/(?:^|;)base64(?:;|$)/i.test(meta)) {
        const binary = atob(payload);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } else {
        bytes = new TextEncoder().encode(decodeURIComponent(payload));
      }
      return new File([bytes], name, { type, lastModified: Number(entry.lastModified) || Date.now() });
    } catch {
      return null;
    }
  };
  const promptFiles = (images) => (Array.isArray(images) ? images : [])
    .map((entry, index) => dataUrlToFile(entry, index))
    .filter((file) => file && String(file.type || "").startsWith("image/"));
  const createTransfer = (files = [], textValue = "") => {
    try {
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      if (textValue) {
        try { transfer.setData("text/plain", String(textValue)); } catch {}
      }
      return transfer;
    } catch {
      return null;
    }
  };
  const dispatchTransfer = (target, type, transfer) => {
    if (!target || type !== "paste") return false;
    const init = { bubbles: true, cancelable: true, composed: true };
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
    try { Object.defineProperty(event, "clipboardData", { value: transfer, configurable: true }); } catch {}
    try { Object.defineProperty(event, "dataTransfer", { value: transfer, configurable: true }); } catch {}
    try { target.dispatchEvent(event); return true; } catch { return false; }
  };
  const getElementText = (element) => normalize(element?.innerText || element?.textContent || "");
  const getElementSearchText = (element) => normalize([
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("title"),
    element?.getAttribute?.("alt"),
    element?.getAttribute?.("data-testid"),
    element?.getAttribute?.("data-test-id"),
    element?.getAttribute?.("class"),
    element?.innerText,
    element?.textContent
  ].filter(Boolean).join(" "));
  const getNotionAttachmentScope = (editor) => findNotionComposerContainer(editor) || editorScope(editor) || document.body || document;
  const isLikelyNotionAttachmentPreviewElement = (element) => {
    if (!element) return false;
    const dataTestId = String(element.getAttribute?.("data-testid") || element.getAttribute?.("data-test-id") || "").toLowerCase();
    const className = String(element.getAttribute?.("class") || "").toLowerCase();
    return dataTestId.includes("attachment")
      || dataTestId.includes("file-preview")
      || dataTestId.includes("upload-preview")
      || className.includes("attachment")
      || className.includes("file-preview")
      || className.includes("upload-preview")
      || className.includes("image-preview");
  };
  const isLikelyNotionAttachmentImage = (element) => {
    if (!element || String(element.tagName || "").toLowerCase() !== "img") return false;
    const src = String(element.getAttribute?.("src") || "").trim();
    if (!src) return false;
    if (/^blob:|^data:image\//i.test(src)) return true;
    if (!/^(?:https?:)?\/\//i.test(src)) return false;
    const rect = rectOf(element);
    if (!rect) return false;
    const minSide = Math.min(rect.width, rect.height);
    const maxSide = Math.max(rect.width, rect.height);
    if (minSide < 32 || maxSide > 360 || rect.width * rect.height < 1200) return false;
    const label = getElementSearchText(element).toLowerCase();
    if (/\b(?:avatar|favicon|logo|icon)\b/.test(label) && maxSide <= 72) return false;
    return true;
  };
  const isNotionAttachmentActionElement = (element) => {
    if (!element) return false;
    const tag = String(element.tagName || "").toLowerCase();
    const role = String(element.getAttribute?.("role") || "").toLowerCase();
    const isActionElement = tag === "button" || role === "button";
    const haystack = getElementSearchText(element).toLowerCase();
    if (/(?:移除|删除|取消|关闭)/.test(haystack)) return true;
    if (haystack.includes("remove attachment") || haystack.includes("remove file") || haystack.includes("remove image")) return true;
    if (haystack.includes("delete attachment") || haystack.includes("delete file") || haystack.includes("delete image")) return true;
    if (haystack.includes("dismiss attachment") || haystack.includes("dismiss file") || haystack.includes("dismiss image")) return true;
    if (haystack.includes("cancel upload") || haystack.includes("remove upload") || haystack.includes("delete upload")) return true;
    if (!isActionElement) return false;
    return /\b(?:remove|delete|dismiss|cancel|close)\b/.test(haystack)
      && /\b(?:attachment|file|image|upload|preview)\b/.test(haystack);
  };
  const isLikelyNotionAttachmentCard = (element, scope) => {
    if (!element || element === scope || element === document || element === document.body || !visible(element)) return false;
    const images = queryAll(element, "img").filter(isLikelyNotionAttachmentImage);
    if (isLikelyNotionAttachmentPreviewElement(element)) return images.length <= 1;
    const rect = rectOf(element);
    if (!rect || rect.width > 520 || rect.height > 320) return false;
    if (images.length !== 1) return false;
    const actions = queryAll(element, "button,[role='button']").filter(isNotionAttachmentActionElement);
    if (actions.length > 0) return true;
    return Math.min(rect.width, rect.height) >= 36 && Math.max(rect.width, rect.height) <= 380;
  };
  const findNotionAttachmentCardElement = (element, scope) => {
    if (!element) return null;
    let node = element;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 8) {
      if (isLikelyNotionAttachmentCard(node, scope)) return node;
      if (node === scope || node === document.body) break;
      node = node.parentElement;
      depth += 1;
    }
    return isLikelyNotionAttachmentImage(element) ? element : null;
  };
  const isNotionAttachmentMarker = (element) => {
    if (!element || !visible(element)) return false;
    const tag = String(element.tagName || "").toLowerCase();
    if (tag === "img") return isLikelyNotionAttachmentImage(element);
    if (isNotionAttachmentActionElement(element)) return true;
    if (isLikelyNotionAttachmentPreviewElement(element)) return true;
    return false;
  };
  const attachmentSnapshot = (editor) => {
    const scope = getNotionAttachmentScope(editor);
    const selector = [
      "img",
      "img[src^='blob:']",
      "img[src^='data:image/']",
      "[data-testid*='attachment' i]",
      "[data-testid*='file-preview' i]",
      "[data-testid*='upload-preview' i]",
      "[data-test-id*='attachment' i]",
      "[data-test-id*='file-preview' i]",
      "[data-test-id*='upload-preview' i]",
      "[class*='attachment' i]",
      "[class*='file-preview' i]",
      "[class*='upload-preview' i]",
      "[class*='image-preview' i]",
      "button[aria-label*='remove attachment' i]",
      "button[aria-label*='remove file' i]",
      "button[aria-label*='remove image' i]",
      "button[aria-label*='delete attachment' i]",
      "button[aria-label*='delete file' i]",
      "button[aria-label*='delete image' i]",
      "button[aria-label*='dismiss' i]",
      "button[aria-label*='cancel upload' i]",
      "button[aria-label*='close' i]",
      "button[title*='remove attachment' i]",
      "button[title*='remove file' i]",
      "button[title*='remove image' i]",
      "button[title*='delete attachment' i]",
      "button[title*='delete file' i]",
      "button[title*='delete image' i]",
      "button[title*='dismiss' i]",
      "button[title*='cancel upload' i]",
      "button[title*='close' i]",
      "[role='button'][aria-label*='remove attachment' i]",
      "[role='button'][aria-label*='remove file' i]",
      "[role='button'][aria-label*='remove image' i]",
      "[role='button'][aria-label*='delete attachment' i]",
      "[role='button'][aria-label*='delete file' i]",
      "[role='button'][aria-label*='delete image' i]",
      "[role='button'][aria-label*='dismiss' i]",
      "[role='button'][aria-label*='cancel upload' i]",
      "[role='button'][aria-label*='close' i]",
      "button[aria-label*='移除' i]",
      "button[aria-label*='删除' i]",
      "button[aria-label*='取消' i]"
    ].join(",");
    const markers = collectOpenShadowElements(scope, selector).filter(isNotionAttachmentMarker);
    const groups = new Map();
    for (const marker of markers) {
      const card = findNotionAttachmentCardElement(marker, scope);
      const markerTag = String(marker.tagName || "").toLowerCase();
      const markerSrc = markerTag === "img" ? String(marker.getAttribute?.("src") || "").trim() : "";
      const key = card || (markerSrc ? `img:${markerSrc}` : marker);
      const existing = groups.get(key) || {
        root: card || marker,
        elements: [],
        hasImage: false,
        hasRemove: false,
        hasPreview: false
      };
      existing.elements.push(marker);
      if (isLikelyNotionAttachmentImage(marker)) existing.hasImage = true;
      if (isNotionAttachmentActionElement(marker)) existing.hasRemove = true;
      if (isLikelyNotionAttachmentPreviewElement(marker)) existing.hasPreview = true;
      if (card && card !== marker) {
        if (!existing.hasImage && queryAll(card, "img").some(isLikelyNotionAttachmentImage)) existing.hasImage = true;
        if (!existing.hasRemove && queryAll(card, "button,[role='button']").some(isNotionAttachmentActionElement)) existing.hasRemove = true;
        if (!existing.hasPreview && isLikelyNotionAttachmentPreviewElement(card)) existing.hasPreview = true;
      }
      groups.set(key, existing);
    }
    const unique = Array.from(groups.values());
    const imageCount = unique.filter((group) => group.hasImage).length;
    const removeCount = unique.filter((group) => group.hasRemove).length;
    const previewCount = unique.length;
    const attachmentCount = Math.max(imageCount, removeCount, previewCount);
    const fingerprint = unique.slice(0, 12).map((group) => {
      const root = group.root || group.elements[0] || null;
      const image = group.elements.find(isLikelyNotionAttachmentImage)
        || (root ? queryAll(root, "img").find(isLikelyNotionAttachmentImage) : null);
      const rect = rectOf(root);
      return [
        String(root?.tagName || "").toLowerCase(),
        String(root?.getAttribute?.("data-testid") || root?.getAttribute?.("data-test-id") || ""),
        String(root?.getAttribute?.("aria-label") || ""),
        String(image?.getAttribute?.("src") || "").slice(0, 80),
        getElementText(root).slice(0, 80),
        rect ? `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}` : ""
      ].join(":");
    }).join("|");
    return {
      attachmentCount,
      imageCount,
      removeCount,
      previewCount,
      hasAttachment: attachmentCount > 0,
      fingerprint
    };
  };
  const getNotionAttachmentFingerprint = (snapshot) => snapshot
    ? `${snapshot.attachmentCount || 0};${snapshot.imageCount || 0};${snapshot.removeCount || 0};${snapshot.previewCount || 0};${snapshot.fingerprint || ""}`
    : "";
  const hasNotionAttachmentSnapshotChange = (previousSnapshot, nextSnapshot) => {
    const previousCount = Number(previousSnapshot?.attachmentCount || 0);
    const nextCount = Number(nextSnapshot?.attachmentCount || 0);
    if (nextCount > previousCount) return true;
    if (Number(nextSnapshot?.imageCount || 0) > Number(previousSnapshot?.imageCount || 0)) return true;
    if (Number(nextSnapshot?.removeCount || 0) > Number(previousSnapshot?.removeCount || 0)) return true;
    if (Number(nextSnapshot?.previewCount || 0) > Number(previousSnapshot?.previewCount || 0)) return true;
    return nextCount > 0 && getNotionAttachmentFingerprint(nextSnapshot) !== getNotionAttachmentFingerprint(previousSnapshot);
  };
  const hasNotionUploadInProgress = (editor) => {
    const scope = getNotionAttachmentScope(editor);
    const selector = [
      "[aria-busy='true']",
      "[role='progressbar']",
      "progress",
      "[data-testid*='uploading' i]",
      "[data-testid*='upload' i]",
      "[data-test-id*='uploading' i]",
      "[data-test-id*='upload' i]",
      "[class*='uploading' i]",
      "[class*='spinner' i]",
      "[class*='loading' i]"
    ].join(",");
    return collectOpenShadowElements(scope, selector).some((element) => {
      if (!element || !visible(element)) return false;
      if (findNotionAttachmentCardElement(element, scope)) return true;
      if (isLikelyNotionAttachmentPreviewElement(element)) return true;
      const tag = String(element.tagName || "").toLowerCase();
      const role = String(element.getAttribute?.("role") || "").toLowerCase();
      const ariaBusy = String(element.getAttribute?.("aria-busy") || "").toLowerCase() === "true";
      const haystack = getElementSearchText(element).toLowerCase();
      const uploadContext = /\b(?:upload|uploading|attachment|file-preview|upload-preview|file|image|preview)\b/.test(haystack)
        || /上传|附件|图片|图像|文件|预览/.test(haystack);
      if (uploadContext) return true;
      if (!(ariaBusy || role === "progressbar" || tag === "progress")) return false;
      let node = element.parentElement || null;
      for (let depth = 0; node && depth < 4; depth += 1) {
        if (node === scope || node === document.body) break;
        if (findNotionAttachmentCardElement(node, scope) || isLikelyNotionAttachmentPreviewElement(node)) return true;
        const parentHaystack = getElementSearchText(node).toLowerCase();
        if (/\b(?:upload|uploading|attachment|file-preview|upload-preview|file|image|preview)\b/.test(parentHaystack) || /上传|附件|图片|图像|文件|预览/.test(parentHaystack)) return true;
        node = node.parentElement || null;
      }
      return false;
    });
  };
  const waitForStableNotionState = async ({ computeState, isSatisfied, timeoutMs = 45000, settleMs = 600, intervalMs = 160, deadlineAt = 0 }) => {
    const start = Date.now();
    let lastState = computeState();
    let lastKey = "";
    let stableSince = 0;
    while (Date.now() - start < timeoutMs && !deadlineExpired(deadlineAt)) {
      lastState = computeState();
      const key = String(lastState?.stateKey || "");
      if (isSatisfied(lastState)) {
        if (key !== lastKey) {
          stableSince = Date.now();
          lastKey = key;
        } else if (!stableSince) {
          stableSince = Date.now();
        }
        if (Date.now() - stableSince >= settleMs) return { ok: true, state: lastState };
      } else {
        stableSince = 0;
        lastKey = key;
      }
      if (!await waitUntilDeadline(intervalMs, deadlineAt)) break;
    }
    return { ok: false, state: lastState };
  };
  const waitForNotionAttachmentChange = async (editor, previousSnapshot, timeoutMs = 9000, deadlineAt = 0) => {
    const start = Date.now();
    let snapshot = attachmentSnapshot(editor);
    let busy = hasNotionUploadInProgress(editor);
    while (Date.now() - start < timeoutMs && !deadlineExpired(deadlineAt)) {
      snapshot = attachmentSnapshot(editor);
      busy = hasNotionUploadInProgress(editor);
      if (hasNotionAttachmentSnapshotChange(previousSnapshot, snapshot) || busy) {
        return { ok: true, snapshot, busy };
      }
      if (!await waitUntilDeadline(120, deadlineAt)) break;
    }
    return { ok: false, snapshot, busy };
  };
  const getNotionImagesReadyState = (editor, { requireImage = true, minAttachments = 0 } = {}) => {
    const composer = resolveNotionComposerElement(editor, { requireVisible: false }) || findEditor();
    const snapshot = attachmentSnapshot(composer);
    const requiredAttachments = Math.max(0, Number(minAttachments) || 0);
    const attachmentCount = Number(snapshot?.attachmentCount || 0);
    const uploadBusy = requireImage && hasNotionUploadInProgress(composer);
    const hasEnoughAttachments = !requireImage || (attachmentCount > 0 && attachmentCount >= requiredAttachments);
    return {
      composer,
      snapshot,
      attachmentCount,
      requiredAttachments,
      uploadBusy,
      ok: Boolean(composer && hasEnoughAttachments && !uploadBusy),
      stateKey: `${getNotionAttachmentFingerprint(snapshot)};busy=${uploadBusy ? 1 : 0};min=${requiredAttachments}`
    };
  };
  const waitForNotionImagesReady = async (editor, { requireImage = true, minAttachments = 0, timeoutMs = 45000, intervalMs = 160, settleMs = 600, deadlineAt = 0 } = {}) => {
    let composerRef = resolveNotionComposerElement(editor, { requireVisible: true }) || await focusNotionComposer(deadlineAt);
    if (!composerRef) return { ok: false, reason: "no-composer", attachmentCount: 0, uploadBusy: false };
    const observed = await waitForStableNotionState({
      computeState: () => {
        const resolved = resolveNotionComposerElement(composerRef, { requireVisible: false }) || composerRef;
        composerRef = resolved;
        return getNotionImagesReadyState(composerRef, { requireImage, minAttachments });
      },
      isSatisfied: (state) => Boolean(state?.ok),
      timeoutMs,
      intervalMs,
      settleMs,
      deadlineAt
    });
    const state = observed.state || getNotionImagesReadyState(composerRef, { requireImage, minAttachments });
    return {
      ok: Boolean(observed.ok),
      composer: state.composer || composerRef,
      snapshot: state.snapshot || null,
      attachmentCount: Number(state.attachmentCount || 0),
      requiredAttachments: Number(state.requiredAttachments || 0),
      uploadBusy: Boolean(state.uploadBusy),
      reason: observed.ok ? "ok" : (deadlineExpired(deadlineAt) ? "deadline" : "timeout"),
      message: observed.ok ? "" : `Notion images not ready: attachment=${state.attachmentCount || 0}, busy=${state.uploadBusy ? 1 : 0}`
    };
  };
  const getNotionReadyToSendState = (editor, { requireImage = false, minAttachments = 0 } = {}) => {
    const composer = resolveNotionComposerElement(editor, { requireVisible: false }) || findEditor();
    const snapshot = attachmentSnapshot(composer);
    const textLength = editorText(composer).trim().length;
    const sendButton = findNotionSendButtonNearComposer(composer);
    const sendReady = sendButton ? !isNotionSendButtonDisabled(sendButton) : textLength > 0;
    const requiredAttachments = Math.max(0, Number(minAttachments) || 0);
    const attachmentCount = Number(snapshot?.attachmentCount || 0);
    const uploadBusy = requireImage && hasNotionUploadInProgress(composer);
    const hasEnoughAttachments = !requireImage || (attachmentCount > 0 && attachmentCount >= requiredAttachments);
    return {
      composer,
      snapshot,
      sendButton,
      sendReady,
      attachmentCount,
      requiredAttachments,
      uploadBusy,
      textLength,
      ok: Boolean(composer && sendReady && (!requireImage || (hasEnoughAttachments && !uploadBusy))),
      stateKey: `${getNotionAttachmentFingerprint(snapshot)};send=${sendReady ? 1 : 0};busy=${uploadBusy ? 1 : 0};text=${textLength};min=${requiredAttachments}`
    };
  };
  const waitForNotionReadyToSend = async (editor, { requireImage = false, minAttachments = 0, timeoutMs = 45000, intervalMs = 160, settleMs = 600, deadlineAt = 0 } = {}) => {
    let composerRef = resolveNotionComposerElement(editor, { requireVisible: true }) || await focusNotionComposer(deadlineAt);
    if (!composerRef) return { ok: false, reason: "no-composer", sendReady: false };
    const observed = await waitForStableNotionState({
      computeState: () => {
        const resolved = resolveNotionComposerElement(composerRef, { requireVisible: false }) || composerRef;
        composerRef = resolved;
        return getNotionReadyToSendState(composerRef, { requireImage, minAttachments });
      },
      isSatisfied: (state) => Boolean(state?.ok),
      timeoutMs,
      intervalMs,
      settleMs,
      deadlineAt
    });
    const state = observed.state || getNotionReadyToSendState(composerRef, { requireImage, minAttachments });
    return {
      ok: Boolean(observed.ok),
      composer: state.composer || composerRef,
      button: state.sendButton || null,
      snapshot: state.snapshot || null,
      attachmentCount: Number(state.attachmentCount || 0),
      requiredAttachments: Number(state.requiredAttachments || 0),
      uploadBusy: Boolean(state.uploadBusy),
      sendReady: Boolean(state.sendReady),
      reason: observed.ok ? "ok" : (deadlineExpired(deadlineAt) ? "deadline" : "timeout"),
      message: observed.ok ? "" : `Notion composer not ready: attachment=${state.attachmentCount || 0}, text=${state.textLength || 0}, busy=${state.uploadBusy ? 1 : 0}, sendReady=${state.sendReady ? 1 : 0}`
    };
  };
  const attachImagesOnce = async (editor, files, textValue = "") => {
    editor = await activateEditor(editor);
    if (!editor) return false;
    const transfer = createTransfer(files, textValue);
    if (!transfer) return false;
    const fired = dispatchTransfer(editor, "paste", transfer);
    await wait(80);
    return fired;
  };
  const commitPastedTextEarly = async (editor, textValue, deadlineAt = 0) => {
    const expected = normalize(textValue);
    if (!expected) return { editor, committed: true, usedFallback: false };
    if (deadlineExpired(deadlineAt)) return { editor, committed: false, usedFallback: false };
    editor = await liveEditor(editor, 1000, deadlineAt);
    if (!editor) return { editor: null, committed: false, usedFallback: false };
    if (promptMatches(editorText(editor), expected)) return { editor, committed: true, usedFallback: false };
    const committed = await setEditorText(editor, expected);
    editor = await liveEditor(editor, 1000, deadlineAt);
    return {
      editor,
      committed: Boolean(committed && promptMatches(editorText(editor), expected)),
      usedFallback: true
    };
  };
  const clearAttachments = async (editor) => {
    const scope = getNotionAttachmentScope(editor);
    try {
      const selector = [
        "button[aria-label*='remove attachment' i]",
        "button[aria-label*='remove file' i]",
        "button[aria-label*='remove image' i]",
        "button[aria-label*='delete attachment' i]",
        "button[aria-label*='delete file' i]",
        "button[aria-label*='delete image' i]",
        "button[aria-label*='dismiss' i]",
        "button[aria-label*='cancel upload' i]",
        "button[title*='remove attachment' i]",
        "button[title*='remove file' i]",
        "button[title*='remove image' i]",
        "button[title*='delete attachment' i]",
        "button[title*='delete file' i]",
        "button[title*='delete image' i]",
        "button[title*='移除' i]",
        "button[title*='删除' i]",
        "button[aria-label*='移除' i]",
        "button[aria-label*='删除' i]"
      ].join(",");
      const seen = new Set();
      const buttons = collectOpenShadowElements(scope, selector)
        .map((element) => {
          try { return element.closest?.("button,[role='button']") || element; } catch { return element; }
        })
        .filter((element) => {
          if (!element || seen.has(element) || !visible(element) || isDisabled(element)) return false;
          seen.add(element);
          return isNotionAttachmentActionElement(element) || Boolean(findNotionAttachmentCardElement(element, scope));
        })
        .slice(0, 20);
      buttons.forEach(clickElement);
    } catch {}
    await wait(350);
  };
  const attachImagesWithRetries = async (editor, files, retryCount = 3, deadlineAt = 0, textValue = "") => {
    const attempts = Math.max(0, Number(retryCount) || 0) + 1;
    let reason = "";
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
      if (attempt > 1) {
        editor = await prepareComposerForRun(await liveEditor(editor, 3000, deadlineAt), deadlineAt);
        if (!editor) return { ok: false, reason: "Notion AI input element not found before retry" };
      }
      const baseline = attachmentSnapshot(editor);
      const pasteAccepted = await attachImagesOnce(editor, files, textValue);
      if (!pasteAccepted) reason = "Notion AI image and text insertion did not accept paste";
      const earlyText = await commitPastedTextEarly(editor, textValue, deadlineAt);
      editor = earlyText.editor || editor;
      if (textValue && !earlyText.committed) reason = "Notion AI prompt text was not committed immediately after paste";
      const accepted = await waitForNotionAttachmentChange(editor, baseline, Math.min(9000, remainingDeadlineMs(deadlineAt, 9000)), deadlineAt);
      if (!accepted.ok && !accepted.busy) {
        if (pasteAccepted) {
          reason = "Notion AI image and text paste was dispatched but no attachment was detected";
          continue;
        }
        reason = reason || "Notion AI image and text insertion did not accept paste";
        continue;
      }
      const expectedCount = Math.max(Number(baseline.attachmentCount || 0) + files.length, files.length);
      const ready = await waitForNotionImagesReady(editor, {
        requireImage: true,
        minAttachments: expectedCount,
        timeoutMs: Math.min(45000, remainingDeadlineMs(deadlineAt, 45000)),
        intervalMs: 160,
        settleMs: 600,
        deadlineAt
      });
      if (ready.ok) return { ok: true, attempts: attempt, editor };
      reason = ready.message || ready.reason || "Notion AI image upload did not become ready";
    }
    return { ok: false, reason: reason || "Notion AI image and text upload did not become ready" };
  };
  const submitted = (editor, value, beforeOutsideCount) => {
    const currentText = editorText(editor);
    if (promptMatches(currentText, value)) return countPromptOutsideEditor(editor, value) > beforeOutsideCount;
    if (promptWhitespaceCollapsedMatches(currentText, value)) return countPromptOutsideEditor(editor, value) > beforeOutsideCount;
    return true;
  };
  const notionSendRequestKey = (payload = {}, scope = "prompt") => {
    const sendId = String(payload?.sendId || payload?.id || "").trim();
    return sendId ? `${scope}:${sendId}` : "";
  };
  const forgetNotionSendRequest = (key, record, delayMs) => {
    const timer = setTimeout(() => {
      notionSendRequestTimers.delete(timer);
      if (notionSendRequestCache.get(key) === record) notionSendRequestCache.delete(key);
    }, delayMs);
    notionSendRequestTimers.add(timer);
  };
  const runNotionSendOnce = async (payload, scope, runner) => {
    const key = notionSendRequestKey(payload, scope);
    if (!key) return runner();
    const existing = notionSendRequestCache.get(key);
    if (existing) return existing.promise;
    const record = { promise: null };
    record.promise = Promise.resolve().then(runner).then((result) => {
      record.promise = Promise.resolve(result);
      forgetNotionSendRequest(key, record, 120000);
      return result;
    }, (error) => {
      forgetNotionSendRequest(key, record, 30000);
      throw error;
    });
    notionSendRequestCache.set(key, record);
    return record.promise;
  };
  const sendNotionText = async (payload = {}) => {
    const deadlineAt = deadlineFromPayload(payload, 10000);
    const text = String(payload?.text || "").trim();
    if (!text) return { ok: false, sent: false, method: "notion-bridge", reason: "Prompt is empty" };
    if (deadlineExpired(deadlineAt)) return { ok: false, sent: false, method: "notion-bridge", reason: "Send deadline exceeded" };
    const editor = await waitFor(findEditor, 3000, 100, deadlineAt);
    if (!editor) return { ok: false, sent: false, method: "notion-bridge", reason: "Notion AI input element not found" };
    const beforeOutsideCount = countPromptOutsideEditor(editor, text);
    const writeStarted = await setEditorText(editor, text);
    const written = writeStarted && await waitFor(() => promptMatches(editorText(editor), text), 2200, 80, deadlineAt);
    if (!written) {
      return { ok: false, sent: false, method: "notion-bridge", reason: deadlineExpired(deadlineAt) ? "Send deadline exceeded" : promptReceiveFailureReason(editor, text) };
    }
    const readyToSend = await waitForNotionReadyToSend(editor, {
      requireImage: false,
      timeoutMs: Math.min(10000, remainingDeadlineMs(deadlineAt, 10000)),
      intervalMs: 160,
      settleMs: 300,
      deadlineAt
    });
    if (!readyToSend.ok) {
      return { ok: false, sent: false, method: "notion-bridge", reason: readyToSend.message || "Notion AI submit button stayed disabled" };
    }
    const sendEditor = readyToSend.composer || editor;
    const sent = await sendNotionMessage(editor, deadlineAt, payload);
    if (!sent.ok) {
      return { ok: false, sent: false, method: "notion-bridge", reason: sent.reason || "Notion AI submit failed" };
    }
    if (await waitFor(() => submitted(sendEditor, text, beforeOutsideCount), 2600, 100, deadlineAt)) {
      return { ok: true, sent: true, method: sent.method || "notion-bridge-button", verified: true };
    }
    return {
      ok: false,
      sent: false,
      method: "notion-bridge",
      reason: promptSubmitFailureReason(sendEditor, text)
    };
  };
  const sendNotionPrompt = async (payload = {}) => runNotionSendOnce(payload, "prompt", async () => {
    const deadlineAt = deadlineFromPayload(payload, 60000);
    const text = String(payload.text || "").trim();
    const files = promptFiles(payload.images);
    if (!text && !files.length) return { ok: false, sent: false, method: "notion-prompt-bridge", reason: "Prompt is empty" };
    if (Array.isArray(payload.images) && payload.images.length && !files.length) {
      return { ok: false, sent: false, method: "notion-prompt-bridge", reason: "Image payload could not be restored" };
    }
    if (deadlineExpired(deadlineAt)) return { ok: false, sent: false, method: "notion-prompt-bridge", reason: "Send deadline exceeded" };
    let editor = await waitFor(findEditor, 3000, 100, deadlineAt);
    if (!editor) return { ok: false, sent: false, method: "notion-prompt-bridge", reason: "Notion AI input element not found" };
    editor = await prepareComposerForRun(editor, deadlineAt);
    if (!editor) return { ok: false, sent: false, method: "notion-prompt-bridge", reason: "Notion AI input element not found" };
    if (files.length) {
      const attached = await attachImagesWithRetries(editor, files, payload.imageRetryCount ?? 3, deadlineAt, text);
      if (!attached.ok) return { ok: false, sent: false, method: "notion-prompt-bridge", reason: attached.reason || "Image insertion failed" };
      editor = await liveEditor(attached.editor || editor, 4000, deadlineAt);
    }
    if (text) {
      const committedAfterImages = await ensurePromptCommitted(editor, text, deadlineAt);
      if (!committedAfterImages.ok) {
        return { ok: false, sent: false, method: "notion-prompt-bridge", reason: committedAfterImages.reason || promptReceiveFailureReason(committedAfterImages.editor || editor, text) };
      }
      editor = await liveEditor(committedAfterImages.editor, 4000, deadlineAt);
      const committedBeforeSend = await ensurePromptCommitted(editor, text, deadlineAt);
      if (!committedBeforeSend.ok) {
        return { ok: false, sent: false, method: "notion-prompt-bridge", reason: committedBeforeSend.reason || promptReceiveFailureReason(committedBeforeSend.editor || editor, text) };
      }
      editor = await liveEditor(committedBeforeSend.editor, 4000, deadlineAt);
    }
    if (text && !promptMatches(editorText(editor), text)) {
      const committedBeforeClick = await ensurePromptCommitted(editor, text, deadlineAt);
      if (!committedBeforeClick.ok || !promptMatches(editorText(committedBeforeClick.editor || editor), text)) {
        return { ok: false, sent: false, method: "notion-prompt-bridge", reason: committedBeforeClick.reason || promptReceiveFailureReason(committedBeforeClick.editor || editor, text) };
      }
      editor = committedBeforeClick.editor || editor;
    }
    if (deadlineExpired(deadlineAt)) return { ok: false, sent: false, method: "notion-prompt-bridge", reason: "Send deadline exceeded" };
    const readyToSend = await waitForNotionReadyToSend(editor, {
      requireImage: files.length > 0,
      minAttachments: files.length,
      timeoutMs: Math.min(45000, remainingDeadlineMs(deadlineAt, 45000)),
      intervalMs: 160,
      settleMs: 600,
      deadlineAt
    });
    if (!readyToSend.ok) {
      return { ok: false, sent: false, method: "notion-prompt-bridge", reason: readyToSend.message || "Notion AI composer not ready to send" };
    }
    editor = readyToSend.composer || editor;
    const beforeOutsideCount = text ? countPromptOutsideEditor(editor, text) : 0;
    const sent = await sendNotionMessage(editor, deadlineAt, payload);
    if (!sent.ok) {
      return { ok: false, sent: false, method: "notion-prompt-bridge", reason: sent.reason || "Notion AI submit failed" };
    }
    const method = sent.method === "notion-bridge-enter" ? "notion-prompt-bridge-enter" : "notion-prompt-bridge-button";
    if (!text) return { ok: true, sent: true, method, verified: false };
    if (await waitFor(() => submitted(editor, text, beforeOutsideCount), 2600, 100, deadlineAt)) {
      return { ok: true, sent: true, method, verified: true };
    }
    return {
      ok: false,
      sent: false,
      method: "notion-prompt-bridge",
      reason: promptSubmitFailureReason(editor, text)
    };
  });
  installNotionEventListeners({
    signal: notionSendBridgeAbort.signal,
    textEvent: NOTION_SEND_TEXT_EVENT,
    promptEvent: NOTION_SEND_PROMPT_EVENT,
    textSource: NOTION_SEND_TEXT_SOURCE,
    promptSource: NOTION_SEND_PROMPT_SOURCE,
    sendText: (detail) => runNotionSendOnce(detail, "text", () => sendNotionText(detail)),
    sendPrompt: (detail) => sendNotionPrompt(detail),
    findEditor,
    wait
  });
  const api = Object.freeze({ version: NOTION_SEND_BRIDGE_VERSION, dispose: cleanup });
  runtimes.register(runtimeName, {
    version: NOTION_SEND_BRIDGE_VERSION,
    api,
    dispose() {
      cleanup();
      if (window.__CHATCLUB_NOTION_SEND_BRIDGE_CLEANUP__ === cleanup) {
        delete window.__CHATCLUB_NOTION_SEND_BRIDGE_CLEANUP__;
      }
      if (window.__CHATCLUB_NOTION_SEND_BRIDGE_VERSION__ === NOTION_SEND_BRIDGE_VERSION) {
        delete window.__CHATCLUB_NOTION_SEND_BRIDGE_VERSION__;
      }
      delete window.__CHATCLUB_NOTION_SUBMIT_BRIDGE__;
    }
  });
}
