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

function chatFrames(iframe) {
  return iframe instanceof HTMLIFrameElement ? [iframe] : [...document.querySelectorAll("iframe.chat-frame")];
}

export function createPageCaretLease({ sendToContentFrame, overlaySearchCaretMode, timeoutMs = 1200 }) {
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

  function writeNameParams(params) {
    if (overlaySearchCaretMode() !== "page") {
      params.delete(PAGE_CARET_NAME_UNTIL);
      params.delete(PAGE_CARET_NAME_TOKEN);
      return;
    }
    const seed = ensureSeed();
    params.set(PAGE_CARET_NAME_UNTIL, String(seed.expiresAt));
    params.set(PAGE_CARET_NAME_TOKEN, seed.token);
  }

  function applyName(frame, page) {
    if (!(frame instanceof HTMLIFrameElement) || !frame.isConnected) return;
    const split = splitFrameName(frame.getAttribute("name") || frame.name || "");
    let params;
    try { params = new URLSearchParams(split.base); } catch { params = new URLSearchParams(); }
    if (page) {
      params.set(PAGE_CARET_NAME_UNTIL, String(expiresAt));
      params.set(PAGE_CARET_NAME_TOKEN, token);
    } else {
      params.delete(PAGE_CARET_NAME_UNTIL);
      params.delete(PAGE_CARET_NAME_TOKEN);
    }
    const next = `${params.toString()}${split.suffix}`;
    try {
      frame.name = next;
      frame.setAttribute("name", next);
    } catch {}
  }

  function stampName(iframe) {
    const page = overlaySearchCaretMode() === "page";
    if (page) ensureSeed();
    for (const frame of chatFrames(iframe)) applyName(frame, page);
  }

  function send(command, iframe, data) {
    for (const frame of chatFrames(iframe)) {
      if (!(frame instanceof HTMLIFrameElement) || !frame.isConnected) continue;
      Promise.resolve(sendToContentFrame(frame, command, data, timeoutMs)).catch(() => {});
    }
  }

  function stopAll() {
    for (const stop of [...running]) stop();
  }

  function adopt(iframe) {
    if (overlaySearchCaretMode() !== "page") return;
    const seed = ensureSeed();
    stampName(iframe);
    send("preparePageCaretLease", iframe, { guardToken: seed.token, expiresAt: seed.expiresAt });
  }

  function refresh(iframe) {
    if (overlaySearchCaretMode() !== "page") return;
    if (!(iframe instanceof HTMLIFrameElement) || !iframe.isConnected) {
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
      if (stopped || overlaySearchCaretMode() !== "page" || !iframe.isConnected) return false;
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
