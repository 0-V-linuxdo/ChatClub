const PAGE_CARET_LEASE_MS = 180000;
const PAGE_CARET_NAME_UNTIL = "chatclub_page_caret_until";
const PAGE_CARET_NAME_TOKEN = "chatclub_page_caret_token";
const PAGE_CARET_REFRESH_RETRY_MS = 150;
const PAGE_CARET_REFRESH_SETTLE_MS = 2500;
const PAGE_CARET_REFRESH_MAX_MS = 8000;
const FOCUS_GUARD_NAME_SUFFIX = /(?:^|&)chatclub_focus_guard_until=\d+(?:&chatclub_focus_guard_token=[^&]+)?$/;

function splitFrameName(raw) {
  const text = String(raw || "");
  const suffix = text.match(FOCUS_GUARD_NAME_SUFFIX);
  return {
    base: suffix ? text.slice(0, suffix.index) : text,
    suffix: suffix ? text.slice(suffix.index) : ""
  };
}

function isHtmlIframe(node) {
  const Ctor = globalThis.HTMLIFrameElement;
  return typeof Ctor === "function" && node instanceof Ctor;
}

function chatFrames(iframe) {
  if (isHtmlIframe(iframe)) return [iframe];
  try { return [...document.querySelectorAll("iframe.chat-frame")]; } catch { return []; }
}

function composeName(raw, page, expiresAt, token) {
  const split = splitFrameName(raw);
  let params;
  try { params = new URLSearchParams(split.base); } catch { params = new URLSearchParams(); }
  if (page && token) {
    params.set(PAGE_CARET_NAME_UNTIL, String(expiresAt));
    params.set(PAGE_CARET_NAME_TOKEN, token);
  } else {
    params.delete(PAGE_CARET_NAME_UNTIL);
    params.delete(PAGE_CARET_NAME_TOKEN);
  }
  return `${params.toString()}${split.suffix}`;
}

function settlePromise(promise, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish({ ok: false, timedOut: true }), Math.max(1, Number(timeoutMs) || 1200));
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        finish(value);
      },
      () => {
        clearTimeout(timer);
        finish({ ok: false });
      }
    );
  });
}

export function createPageCaretLease({ sendToContentFrame, overlaySearchCaretMode, overlaySearchCaretComposer, timeoutMs = 1200, onAdopted }) {
  let token = "";
  let expiresAt = 0;
  const running = new Set();

  function ensureSeed() {
    if (!token) {
      token = globalThis.crypto?.randomUUID?.()
        || `page-caret-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    const now = Date.now();
    if (expiresAt <= now) expiresAt = now + PAGE_CARET_LEASE_MS;
    return { token, expiresAt };
  }

  function leaseArmed() {
    return overlaySearchCaretMode() === "page" || overlaySearchCaretComposer?.() === true;
  }

  function pageArmed() {
    return Boolean(token) && overlaySearchCaretMode() !== "overlay";
  }

  function writeNameParams(params) {
    if (overlaySearchCaretMode() === "overlay" && overlaySearchCaretComposer?.() !== true) {
      params.delete(PAGE_CARET_NAME_UNTIL);
      params.delete(PAGE_CARET_NAME_TOKEN);
      return;
    }
    if (!leaseArmed() && (overlaySearchCaretMode() !== "page" && !token)) {
      params.delete(PAGE_CARET_NAME_UNTIL);
      params.delete(PAGE_CARET_NAME_TOKEN);
      return;
    }
    const seed = ensureSeed();
    params.set(PAGE_CARET_NAME_UNTIL, String(seed.expiresAt));
    params.set(PAGE_CARET_NAME_TOKEN, seed.token);
  }

  function applyName(frame, page) {
    if (!isHtmlIframe(frame) || !frame.isConnected) return;
    const next = composeName(frame.getAttribute("name") || frame.name || "", page, expiresAt, token);
    try {
      frame.name = next;
      frame.setAttribute("name", next);
    } catch {}
    try {
      const win = frame.contentWindow;
      if (win) win.name = next;
    } catch {
      /* cross-origin documents cannot take a parent window.name write */
    }
  }

  function stampName(iframe) {
    const page = leaseArmed() || pageArmed();
    if (page) ensureSeed();
    for (const frame of chatFrames(iframe)) applyName(frame, page);
  }

  function notifyAdopted() {
    try { onAdopted?.(); } catch {}
  }

  function send(command, iframe, data) {
    for (const frame of chatFrames(iframe)) {
      if (!isHtmlIframe(frame) || !frame.isConnected) continue;
      Promise.resolve(sendToContentFrame(frame, command, data, timeoutMs)).catch(() => {});
    }
  }

  function stopAll() {
    for (const stop of [...running]) stop();
  }

  function prepareFrame(frame, seed) {
    applyName(frame, true);
    return settlePromise(
      sendToContentFrame(
        frame,
        "preparePageCaretLease",
        { guardToken: seed.token, expiresAt: seed.expiresAt },
        timeoutMs
      ),
      timeoutMs
    ).then((result) => {
      if (result?.ok === true || result?.documentToken) notifyAdopted();
      return result;
    });
  }

  function adopt(iframe) {
    if (!leaseArmed()) return Promise.resolve({ ok: false });
    const seed = ensureSeed();
    stampName(iframe);
    const frames = chatFrames(iframe).filter((frame) => isHtmlIframe(frame) && frame.isConnected);
    if (!frames.length) return Promise.resolve({ ok: false });
    return Promise.all(frames.map((frame) => prepareFrame(frame, seed).catch(() => ({ ok: false }))))
      .then((results) => results.find((result) => result?.ok === true) || results[0] || { ok: false });
  }

  function refresh(iframe) {
    if (!leaseArmed()) return;
    if (!isHtmlIframe(iframe) || !iframe.isConnected) {
      adopt(iframe);
      return;
    }
    const seed = ensureSeed();
    stampName(iframe);
    const startedAt = Date.now();
    let lastDocumentToken = "";
    let lastAckAt = 0;
    let stopped = false;
    let inFlight = false;
    let retryTimer = 0;
    let timeoutTimer = 0;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (retryTimer) clearInterval(retryTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      running.delete(stop);
    };
    const tick = () => {
      if (stopped || !leaseArmed() || !iframe.isConnected) return false;
      if (Date.now() - startedAt > PAGE_CARET_REFRESH_MAX_MS) return false;
      if (lastAckAt && Date.now() - lastAckAt >= PAGE_CARET_REFRESH_SETTLE_MS) return false;
      if (inFlight) return true;
      inFlight = true;
      Promise.resolve(sendToContentFrame(
        iframe,
        "adoptPageCaretLease",
        { guardToken: seed.token, expiresAt: seed.expiresAt },
        timeoutMs
      )).then((result) => {
        if (stopped) return;
        if (result?.ok === true || result?.documentToken) notifyAdopted();
        const documentToken = String(result?.documentToken || "");
        if (documentToken && documentToken !== lastDocumentToken) {
          lastDocumentToken = documentToken;
          lastAckAt = Date.now();
        }
      }).catch(() => {}).finally(() => { inFlight = false; });
      return true;
    };
    running.add(stop);
    send("preparePageCaretLease", iframe, { guardToken: seed.token, expiresAt: seed.expiresAt });
    tick();
    retryTimer = setInterval(() => { if (!tick()) stop(); }, PAGE_CARET_REFRESH_RETRY_MS);
    timeoutTimer = setTimeout(stop, PAGE_CARET_REFRESH_MAX_MS + PAGE_CARET_REFRESH_RETRY_MS);
  }

  function release() {
    const guardToken = token;
    token = "";
    expiresAt = 0;
    stopAll();
    stampName();
    if (!guardToken) return;
    send("releasePageCaretLease", undefined, { guardToken });
  }

  return {
    writeNameParams,
    stampName,
    adopt,
    refresh,
    release
  };
}
