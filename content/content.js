(() => {
  const SOURCE = "chatclub";
  const COPY_SOURCE = "chatclub-native-copy";
  const PAGE_SUMMARY_SOURCE = "chatclub-summary-userscript";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  function respond(source, id, action, data, error) {
    source?.postMessage({ source: SOURCE, type: "response", id, action, data, error }, "*");
  }

  const DEFAULT_SHORTCUT_CONFIG = {
    sendKeyMode: "enter",
    shortcuts: {
      focusInput: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyK" },
      newChat: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyN" },
      optimizePrompt: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyO" },
      openSummaryPanel: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyS" },
      closeChat: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyW" },
      reloadChat: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyR" },
      enterFullscreen: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyF" },
      insertPrompt: { alt: true, shift: false, cmdOrCtrl: false, codePattern: "Digit" },
      switchLayout: { alt: false, shift: true, cmdOrCtrl: true, codePattern: "Digit" },
      switchPlatformTab: { alt: false, shift: false, cmdOrCtrl: true, codePattern: "Digit" }
    }
  };
  const SHORTCUT_ACTIONS = [
    "focusInput",
    "newChat",
    "optimizePrompt",
    "openSummaryPanel",
    "closeChat",
    "reloadChat",
    "enterFullscreen",
    "insertPrompt",
    "switchLayout",
    "switchPlatformTab"
  ];
  const PATTERN_ACTIONS = new Set(["insertPrompt", "switchLayout", "switchPlatformTab"]);
  let activeShortcutConfig = normalizeShortcutConfig(DEFAULT_SHORTCUT_CONFIG);

  function requestParent(action, data = {}, timeout = 1200) {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage, true);
        reject(new Error("Parent request timed out"));
      }, timeout);
      function onMessage(event) {
        const message = event.data;
        if (message?.source !== SOURCE || message.type !== "response" || message.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        message.error ? reject(new Error(message.error)) : resolve(message.data);
      }
      window.addEventListener("message", onMessage, true);
      window.parent.postMessage({ source: SOURCE, type: "request", action, id, data }, "*");
    });
  }

  function bool(value, fallback = false) {
    return value == null ? fallback : Boolean(value);
  }

  function normalizeShortcutConfig(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    const rawShortcuts = { ...(source.shortcuts || {}) };
    if (rawShortcuts.openSummary && !rawShortcuts.openSummaryPanel) rawShortcuts.openSummaryPanel = rawShortcuts.openSummary;
    const shortcuts = {};
    for (const action of SHORTCUT_ACTIONS) {
      const base = DEFAULT_SHORTCUT_CONFIG.shortcuts[action];
      const item = rawShortcuts[action] || {};
      shortcuts[action] = {
        disabled: Boolean(item.disabled),
        cmdOrCtrl: bool(item.cmdOrCtrl, Boolean(base.cmdOrCtrl)),
        alt: bool(item.alt, Boolean(base.alt)),
        shift: bool(item.shift, Boolean(base.shift))
      };
      if (PATTERN_ACTIONS.has(action)) shortcuts[action].codePattern = "Digit";
      else shortcuts[action].code = String(item.code || base.code || "");
    }
    return { ...DEFAULT_SHORTCUT_CONFIG, ...source, shortcuts };
  }

  function digitMatch(code) {
    return /^Digit([0-9])$/.exec(code || "") || /^Numpad([0-9])$/.exec(code || "");
  }

  function matchShortcut(event, config = activeShortcutConfig) {
    const shortcuts = normalizeShortcutConfig(config).shortcuts;
    const cmdOrCtrl = Boolean(event.metaKey || event.ctrlKey);
    for (const action of SHORTCUT_ACTIONS) {
      const shortcut = shortcuts[action];
      if (!shortcut || shortcut.disabled) continue;
      if (Boolean(shortcut.cmdOrCtrl) !== cmdOrCtrl) continue;
      if (Boolean(shortcut.alt) !== Boolean(event.altKey)) continue;
      if (Boolean(shortcut.shift) !== Boolean(event.shiftKey)) continue;
      if (PATTERN_ACTIONS.has(action)) {
        const match = digitMatch(event.code);
        if (match) return { action, matchObj: { digit: match[1] } };
      } else if (shortcut.code && shortcut.code === event.code) {
        return { action, matchObj: {} };
      }
    }
    return null;
  }

  async function loadShortcutConfig() {
    try {
      const parentConfig = await requestParent("getShortcutConfig", {}, 1400);
      activeShortcutConfig = normalizeShortcutConfig(parentConfig);
      return;
    } catch {}
    try {
      const stored = await chrome.storage.local.get("shortcutConfig");
      activeShortcutConfig = normalizeShortcutConfig(stored.shortcutConfig);
    } catch {}
  }

  function postShortcutTriggered(match) {
    window.parent.postMessage({
      source: SOURCE,
      type: "request",
      action: "shortcutTriggered",
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      data: match
    }, "*");
  }

  function visible(el) {
    if (!el?.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
  }

  function qsa(selector, root = document, options = {}) {
    try {
      const result = Array.from(root.querySelectorAll(selector));
      return options.all === false ? result.slice(0, 1) : result;
    } catch {
      return [];
    }
  }

  function qs(selector, root = document) {
    try { return root.querySelector(selector); } catch { return null; }
  }

  function closest(el, selector) {
    try { return el?.closest?.(selector) || null; } catch { return null; }
  }

  function text(el) {
    if (!el) return "";
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value || "";
    return el.innerText || el.textContent || "";
  }

  function reveal(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      for (const type of ["pointerover", "pointermove", "mouseover", "mousemove"]) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    } catch {}
  }

  function merge(messages) {
    const out = [];
    for (const message of messages || []) {
      const role = String(message?.role || "assistant").toLowerCase();
      const value = cleanCaptured(message?.text || message?.content || "");
      if (!value) continue;
      const previous = out[out.length - 1];
      if (previous && previous.role === role) previous.text = normalize(`${previous.text}\n\n${value}`);
      else out.push({ role, text: value });
    }
    return out;
  }

  function toRegex(value) {
    if (!value) return null;
    if (value instanceof RegExp) return value;
    try { return new RegExp(String(value), "i"); } catch { return null; }
  }

  function compareText(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, "");
  }

  function cleanCaptured(value) {
    return normalize(String(value || "")
      .replace(/Show more\s*Show less/gi, "")
      .replace(/^\s*(Show more|Show less|显示更多|收起)\s*$/gim, ""));
  }

  function pageLogoUrl() {
    const candidates = qsa("link[rel][href]", document)
      .map((link, index) => {
        const rel = normalize(link.getAttribute?.("rel") || "").toLowerCase();
        if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|mask-icon)(\s|$)/.test(rel)) return null;
        const href = link.getAttribute?.("href") || "";
        let url = "";
        try { url = href ? new URL(href, location.href).href : ""; } catch { return null; }
        if (!/^https?:\/\//i.test(url)) return null;
        const sizes = normalize(link.getAttribute?.("sizes") || "");
        const sizeScore = sizes.includes("32") ? 0 : sizes.includes("16") ? 1 : sizes.includes("180") ? 2 : 3;
        const type = normalize(link.getAttribute?.("type") || "").toLowerCase();
        const relScore = rel.includes("apple-touch-icon") ? 4 : rel.includes("mask-icon") ? 5 : rel.includes("icon") ? 0 : 3;
        const typeScore = type.includes("png") || type.includes("x-icon") || type.includes("icon") ? 0 : 1;
        return { url, score: relScore * 100 + sizeScore * 10 + typeScore, index };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || a.index - b.index);
    return candidates[0]?.url || "";
  }

  function pageMeta() {
    return {
      href: location.href,
      title: normalize(document.title || ""),
      logoUrl: pageLogoUrl()
    };
  }

  function copyLooksUseful(value) {
    const next = cleanCaptured(value);
    return Boolean(next
      && next.length >= 2
      && next.length <= 50000
      && !/^(copy|copied|复制|已复制|share|link)$/i.test(next)
      && !/^(https?:\/\/|mailto:|#)[^\s]{1,240}$/i.test(next));
  }

  function hasUserAndAssistant(messages) {
    return Array.isArray(messages)
      && messages.some((item) => item?.role === "user")
      && messages.some((item) => item?.role === "assistant");
  }

  function elementOrder(a, b) {
    try {
      if (a === b) return 0;
      const pos = a.compareDocumentPosition(b);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
    } catch {
      return 0;
    }
  }

  function classText(el) {
    const value = el?.getAttribute?.("class") || el?.className || "";
    return typeof value === "string" ? value : value?.baseVal || "";
  }

  function buttonText(el) {
    if (!el) return "";
    const labelledBy = String(el.getAttribute?.("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => id && document.getElementById(id))
      .filter(Boolean)
      .map((node) => node.innerText || node.textContent || "")
      .join(" ");
    return normalize([
      el.getAttribute?.("aria-label"),
      labelledBy,
      el.getAttribute?.("aria-description"),
      el.getAttribute?.("title"),
      el.getAttribute?.("data-tooltip"),
      el.getAttribute?.("data-testid"),
      el.getAttribute?.("data-test-id"),
      el.innerText || el.textContent || ""
    ].filter(Boolean).join(" "));
  }

  function userscriptMeta(el) {
    if (!el) return "";
    return normalize([
      el.tagName,
      classText(el),
      el.getAttribute?.("role"),
      buttonText(el),
      el.getAttribute?.("data-message-author-role")
    ].filter(Boolean).join(" "));
  }

  function matches(el, selector) {
    try { return Boolean(el?.matches?.(selector)); } catch { return false; }
  }

  function isNativeCopyButton(el) {
    return /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content_copy|copy_all|file_copy/i.test(userscriptMeta(el));
  }

  function svgSignature(el) {
    return normalize([el, ...qsa("svg,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", el).slice(0, 80)]
      .map((node) => [
        classText(node),
        node.getAttribute?.("data-icon"),
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.getAttribute?.("alt"),
        node.getAttribute?.("src"),
        node.getAttribute?.("href"),
        node.getAttribute?.("xlink:href"),
        node.getAttribute?.("viewBox"),
        node.getAttribute?.("d"),
        node.getAttribute?.("width"),
        node.getAttribute?.("height")
      ].filter(Boolean).join(" "))
      .join(" "))
      .toLowerCase();
  }

  function userscriptLooksLikeCopyIcon(el) {
    const signature = svgSignature(el);
    if (!signature) return false;
    if (/copy|clipboard|content_copy|copy_all|file_copy|lucide-copy|tabler-icon-copy|copy[-_ ]?(icon|line|fill)/i.test(signature)) return true;
    const rects = qsa("rect", el).filter((rect) => Number(rect.getAttribute("width") || 0) >= 7 && Number(rect.getAttribute("height") || 0) >= 7);
    return rects.length >= 2;
  }

  function internalTool(el) {
    return Boolean(closest(el, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]"));
  }

  function userscriptButtonOk(el, options = {}) {
    if (!el || internalTool(el)) return false;
    const meta = userscriptMeta(el);
    const exclude = toRegex(options.copyButtonExcludePattern);
    if (exclude?.test(meta)) return false;
    const include = toRegex(options.copyButtonPattern);
    if (include) return include.test(meta) || (options.copyButtonIconFallback !== false && userscriptLooksLikeCopyIcon(el));
    return isNativeCopyButton(el) || (options.copyButtonIconFallback !== false && userscriptLooksLikeCopyIcon(el));
  }

  function userscriptCopyRoots(el, options = {}) {
    const roots = [];
    const add = (node) => {
      if (node?.nodeType === 1 && node !== document.documentElement && !roots.includes(node)) roots.push(node);
    };
    add(el);
    if (options.expanded !== false) {
      for (let node = el, depth = 0; node && node !== document.body && depth < 6; node = node.parentElement, depth += 1) {
        add(node);
        add(node.previousElementSibling);
        add(node.nextElementSibling);
      }
    }
    return roots;
  }

  function userscriptFindCopyButtons(root = document.body, options = {}) {
    let rootRect = null;
    try { rootRect = root?.getBoundingClientRect?.(); } catch {}
    const selector = String(options.copyButtonSelector || "button,[role=button],[role=menuitem]").trim();
    const seen = new Set();
    const scored = [];
    const distanceScore = (candidate) => {
      if (!rootRect?.width || !rootRect?.height || !candidate?.getBoundingClientRect) return 0;
      let rect = null;
      try { rect = candidate.getBoundingClientRect(); } catch {}
      return rect?.width && rect?.height ? Math.abs(rect.top - rootRect.bottom) * 20 + Math.abs(rect.left - rootRect.left) : 0;
    };
    let order = 0;
    const add = (candidate, score) => {
      if (!candidate || seen.has(candidate)) return;
      if (!matches(candidate, selector) && candidate !== root) return;
      seen.add(candidate);
      if (userscriptButtonOk(candidate, options)) scored.push({ button: candidate, score: score + distanceScore(candidate) });
    };
    for (const copyRoot of userscriptCopyRoots(root, options)) {
      for (const candidate of [copyRoot, ...qsa(selector, copyRoot, { all: true })]) add(candidate, order++);
    }
    if (!scored.length && options.expanded !== false && rootRect?.width && rootRect?.height) {
      for (const candidate of qsa(selector, document, { all: true })) {
        if (seen.has(candidate) || internalTool(candidate)) continue;
        let rect = null;
        try { rect = candidate.getBoundingClientRect(); } catch {}
        if (!rect?.width || !rect?.height || rect.bottom < rootRect.top - 260 || rect.top > rootRect.bottom + 520) continue;
        add(candidate, 1000000 + order++);
      }
    }
    return scored.sort((a, b) => a.score - b.score || elementOrder(a.button, b.button)).map((item) => item.button);
  }

  function userscriptFindMenuButtons(root = document.body, options = {}) {
    const selector = String(options.copyMenuButtonSelector || "button[aria-haspopup],button[aria-expanded],[role=button][aria-haspopup],button,[role=button]").trim();
    const include = toRegex(options.copyMenuButtonPattern) || /(more|menu|actions|options|overflow|ellipsis|kebab|three dots|更多|操作|菜单|选项|•••|\.\.\.)/i;
    return qsa(selector, root, { all: true })
      .filter((button) => visible(button) && !internalTool(button) && include.test(userscriptMeta(button)))
      .sort(elementOrder);
  }

  function userscriptOpenCopyButtons(options = {}) {
    const selector = String(options.copyButtonSelector || "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]").trim();
    return qsa(selector, document, { all: true })
      .filter((button) => visible(button) && userscriptButtonOk(button, options))
      .sort(elementOrder);
  }

  function userscriptCloseMenus() {
    try { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true })); } catch {}
  }

  function copyMatches(copied, expected) {
    const copiedText = compareText(copied);
    const expectedText = compareText(expected);
    if (!expectedText) return true;
    if (!copiedText) return false;
    if (copiedText === expectedText || copiedText.includes(expectedText)) return true;
    if (expectedText.includes(copiedText) && copiedText.length >= Math.min(expectedText.length * 0.75, 240)) return true;
    return false;
  }

  function userscriptCopyAccepted(copied, expected, role, options = {}) {
    const value = cleanCaptured(copied);
    if (!copyLooksUseful(value)) return "";
    const exclude = toRegex(options.copyTextExcludePattern);
    if (exclude?.test(value)) return "";
    if (options.matchMode === "anyUseful" || !expected) return value;
    return copyMatches(value, expected) ? value : "";
  }

  function copyBridgeRequest(action, id, data = {}, timeout = 1000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage, true);
        resolve(null);
      }, timeout);
      const onMessage = (event) => {
        const message = event.data;
        if (message?.source === COPY_SOURCE && message.id === id && message.type === "response" && message.action === action) {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage, true);
          resolve(message.data || null);
        }
      };
      window.addEventListener("message", onMessage, true);
      window.postMessage({ source: COPY_SOURCE, type: "request", id, action, data }, "*");
    });
  }

  function parentClipboardRequest(action, id, data = {}, timeout = 700) {
    return new Promise((resolve) => {
      try {
        if (!window.parent || window.parent === window) return resolve(null);
        const timer = setTimeout(() => {
          window.removeEventListener("message", onMessage, true);
          resolve(null);
        }, timeout);
        const onMessage = (event) => {
          const message = event.data;
          if (message?.source === "chatclub-parent-clipboard" && message.type === "response" && message.action === action && message.id === id) {
            clearTimeout(timer);
            window.removeEventListener("message", onMessage, true);
            resolve(message.data || null);
          }
        };
        window.addEventListener("message", onMessage, true);
        window.parent.postMessage({ source: "chatclub-parent-clipboard", type: "request", action, id, data }, "*");
      } catch {
        resolve(null);
      }
    });
  }

  function pageSummaryRequest(config = {}) {
    return new Promise((resolve) => {
      const id = copyId();
      const ackTimeoutMs = Math.max(350, Math.min(1800, Number(config.userscriptFallbackDelayMs) || 900));
      const totalTimeoutMs = Math.max(5000, Math.min(45000, Number(config.userscriptTimeoutMs) || 15000));
      let acked = false;
      let done = false;
      const cleanup = () => {
        clearTimeout(ackTimer);
        clearTimeout(totalTimer);
        window.removeEventListener("message", onMessage, true);
      };
      const finish = (result) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(result);
      };
      const ackTimer = setTimeout(() => {
        if (!acked) finish({ ok: false, missing: true, messages: [], error: "Summary page-world runtime did not acknowledge the request." });
      }, ackTimeoutMs);
      const totalTimer = setTimeout(() => {
        finish({ ok: false, timeout: true, messages: [], error: "Summary page-world runtime timed out." });
      }, totalTimeoutMs);
      const onMessage = (event) => {
        const message = event.data;
        if (event.source !== window || message?.source !== PAGE_SUMMARY_SOURCE || message.id !== id || message.action !== "extract") return;
        if (message.type === "ack") {
          acked = true;
          clearTimeout(ackTimer);
          return;
        }
        if (message.type !== "response") return;
        const data = message.data || {};
        finish({
          ok: Boolean(message.ok),
          messages: Array.isArray(message.messages) ? message.messages : Array.isArray(data.messages) ? data.messages : [],
          rawMessageCount: data.rawMessageCount,
          hasUserAndAssistant: data.hasUserAndAssistant,
          error: message.error || data.error || ""
        });
      };
      window.addEventListener("message", onMessage, true);
      window.postMessage({ source: PAGE_SUMMARY_SOURCE, type: "request", action: "extract", id, data: { config } }, "*");
    });
  }

  async function parentClipboardText(id, timeout = 600) {
    const result = await parentClipboardRequest("read", id, {}, timeout);
    return result?.ok ? normalize(result.text || "") : "";
  }

  function copyId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function isCopyProbeText(value) {
    return /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || ""));
  }

  function activateElement(button) {
    button.focus?.();
    reveal(button);
    const init = { bubbles: true, cancelable: true, view: window };
    try {
      if (window.PointerEvent) {
        button.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 1 }));
        button.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 }));
      }
    } catch {}
    button.dispatchEvent(new MouseEvent("mousedown", init));
    button.dispatchEvent(new MouseEvent("mouseup", init));
    button.dispatchEvent(new MouseEvent("click", init));
    button.click?.();
  }

  async function copy(button, options = {}) {
    if (!button) return "";
    const copyTimeoutMs = Math.max(300, Math.min(10000, Number(options.copyTimeoutMs || options.timeoutMs) || 2600));
    const copyPollMs = Math.max(20, Math.min(150, Number(options.copyPollMs) || 50));
    const copyCaptureGraceMs = Math.max(80, Math.min(800, Number(options.copyCaptureGraceMs) || 240));
    const acceptUnchangedClipboard = Boolean(options.acceptUnchangedClipboard);
    const resetClipboardBeforeCopy = Boolean(options.resetClipboardBeforeCopy);
    const id = copyId();
    let before = "";
    let probe = "";
    let probeWritten = false;
    let captured = "";
    let capturedPriority = 0;
    let capturedAt = 0;
    try { before = normalize(await navigator.clipboard.readText()); } catch {}
    if (!before) before = await parentClipboardText(id, 500);
    if (resetClipboardBeforeCopy) {
      probe = `__sch_copy_probe_${id}__`;
      try {
        await navigator.clipboard.writeText(probe);
        before = probe;
        probeWritten = true;
      } catch {}
      if (!probeWritten) {
        const parentWrite = await parentClipboardRequest("write", id, { text: probe }, 700);
        if (parentWrite?.ok) {
          before = probe;
          probeWritten = true;
        }
      }
    }
    const onCapture = (event) => {
      const message = event.data;
      if (message?.source !== COPY_SOURCE || message.type !== "capture" || message.id !== id) return;
      const value = normalize(message.data?.text || "");
      const priority = Number(message.data?.priority) || 1;
      if (value && !isCopyProbeText(value) && priority >= capturedPriority) {
        captured = value;
        capturedPriority = priority;
        capturedAt = Date.now();
      }
    };
    window.addEventListener("message", onCapture, true);
    try {
      await copyBridgeRequest("install", id, { timeoutMs: copyTimeoutMs }, 900);
      try { activateElement(button); } catch { try { button.click?.(); } catch {} }
      for (let index = 0, max = Math.ceil(copyTimeoutMs / copyPollMs); index < max; index += 1) {
        await sleep(copyPollMs);
        if (captured && (capturedPriority >= 5 || Date.now() - capturedAt >= copyCaptureGraceMs)) break;
        try {
          const current = normalize(await navigator.clipboard.readText());
          if (current && current !== before && current !== probe && !isCopyProbeText(current)) {
            captured = current;
            capturedPriority = Math.max(capturedPriority, 6);
            break;
          }
        } catch {}
        const parentCurrent = await parentClipboardText(id, 250);
        if (parentCurrent && parentCurrent !== before && parentCurrent !== probe && !isCopyProbeText(parentCurrent)) {
          captured = parentCurrent;
          capturedPriority = Math.max(capturedPriority, 6);
          break;
        }
      }
      if (captured && captured !== probe && !isCopyProbeText(captured)) return cleanCaptured(captured);
      try {
        const after = normalize(await navigator.clipboard.readText());
        if (after && after !== before && after !== probe && !isCopyProbeText(after)) return cleanCaptured(after);
        if (after && acceptUnchangedClipboard && !probeWritten && !isCopyProbeText(after)) return cleanCaptured(after);
      } catch {}
      const parentAfter = await parentClipboardText(id, 700);
      if (parentAfter && parentAfter !== before && parentAfter !== probe && !isCopyProbeText(parentAfter)) return cleanCaptured(parentAfter);
      if (parentAfter && acceptUnchangedClipboard && !probeWritten && !isCopyProbeText(parentAfter)) return cleanCaptured(parentAfter);
      return "";
    } finally {
      window.removeEventListener("message", onCapture, true);
      await copyBridgeRequest("restore", id, {}, 900);
    }
  }

  async function copyFirst(buttons, params = {}) {
    const details = params || {};
    const options = details.options || details;
    for (const button of (buttons || []).slice(0, 12)) {
      const value = userscriptCopyAccepted(await copy(button, options), details.expected, details.role, options);
      if (value) return value;
    }
    if (details.scope && options.copyMenu !== false) {
      for (const menuButton of userscriptFindMenuButtons(details.scope, options).slice(0, 8)) {
        userscriptCloseMenus();
        reveal(menuButton);
        try { activateElement(menuButton); } catch {}
        await sleep(180);
        const value = await copyFirst(userscriptOpenCopyButtons(options).filter((button) => button !== menuButton && !menuButton.contains(button)), details);
        userscriptCloseMenus();
        if (value) return value;
      }
    }
    return "";
  }

  function userscriptRole(el, options = {}) {
    const nodes = [el, closest(el, "[data-message-author-role]")].filter(Boolean);
    let value = "";
    const attr = String(options.roleAttribute || "").trim();
    if (attr) {
      for (const node of nodes) value += `${node.getAttribute?.(attr) || ""} `;
    }
    value += nodes.map(userscriptMeta).join(" ");
    const userPattern = toRegex(options.userRolePattern);
    const assistantPattern = toRegex(options.assistantRolePattern);
    if (userPattern?.test(value)) return "user";
    if (assistantPattern?.test(value)) return "assistant";
    const role = String(closest(el, "[data-message-author-role]")?.getAttribute?.("data-message-author-role") || "").toLowerCase();
    return role === "user" || role === "assistant" ? role : null;
  }

  function fallbackRole(index, options = {}) {
    const sequence = options.roleFallbackSequence;
    if (sequence === "userFirst") return index % 2 === 0 ? "user" : "assistant";
    if (sequence === "assistantFirst") return index % 2 === 0 ? "assistant" : "user";
    if (sequence === "userThenAssistant") return index === 0 ? "user" : "assistant";
    if (sequence === "assistantOnly") return "assistant";
    if (sequence === "userOnly") return "user";
    if (Array.isArray(sequence)) return sequence[index % sequence.length] || null;
    return null;
  }

  function pushMessage(out, role, value, seen) {
    const text = cleanCaptured(value);
    if ((role !== "user" && role !== "assistant") || !text) return;
    const compact = compareText(text);
    const key = `${role}|${compact}`;
    if (seen.has(key)) return;
    const existing = out.find((item) => item.role === role && compareText(item.text) && (compareText(item.text).includes(compact) || compact.includes(compareText(item.text))));
    if (existing) {
      if (compact.length > compareText(existing.text).length) existing.text = text;
      seen.add(key);
      return;
    }
    seen.add(key);
    out.push({ role, text });
  }

  async function extractTurns(options = {}) {
    const rootSelector = String(options.rootSelector || "body").trim() || "body";
    const messageSelector = String(options.messageSelector || "").trim();
    if (!messageSelector) return [];
    const roots = qsa(rootSelector, document, { all: true }).filter(visible);
    const searchRoots = roots.length ? roots : [document.body || document.documentElement];
    const turns = [];
    for (const root of searchRoots) {
      for (const turn of qsa(messageSelector, root, { all: true }).filter(visible)) if (!turns.includes(turn)) turns.push(turn);
    }
    const out = [];
    const seen = new Set();
    let roleIndex = 0;
    for (const turn of turns.sort(elementOrder)) {
      let role = userscriptRole(turn, options) || fallbackRole(roleIndex, options);
      if (role !== "user" && role !== "assistant") continue;
      reveal(turn);
      await sleep(80);
      const expected = text(turn);
      const copied = await copyFirst(userscriptFindCopyButtons(turn, options), { expected, role, options, scope: turn });
      if (copied) {
        pushMessage(out, role, copied, seen);
        roleIndex += 1;
      }
    }
    return merge(out);
  }

  async function extractCopySequence(options = {}) {
    const out = [];
    const seen = new Set();
    const rootSelector = String(options.rootSelector || "body").trim() || "body";
    const roots = qsa(rootSelector, document, { all: true }).filter(visible);
    const searchRoots = roots.length ? roots : [document.body || document.documentElement];
    const buttons = [];
    const buttonSet = new Set();
    for (const root of searchRoots) {
      for (const button of userscriptFindCopyButtons(root, { ...options, expanded: false })) {
        if (!buttonSet.has(button)) {
          buttonSet.add(button);
          buttons.push(button);
        }
      }
    }
    buttons.sort(elementOrder);
    let roleIndex = 0;
    const maxButtons = Number(options.maxButtons) || 40;
    const accept = async (button, roleHint) => {
      const role = roleHint || userscriptRole(button, options) || fallbackRole(roleIndex, options);
      if (role !== "user" && role !== "assistant") return false;
      const value = userscriptCopyAccepted(await copy(button, options), "", role, { ...options, matchMode: "anyUseful" });
      if (!value) return false;
      pushMessage(out, role, value, seen);
      roleIndex += 1;
      return true;
    };
    for (const button of buttons.slice(0, maxButtons)) await accept(button);
    if (out.length < 2 && options.copyMenu !== false) {
      for (const root of searchRoots) {
        for (const menuButton of userscriptFindMenuButtons(root, options).slice(0, Math.min(maxButtons, 16))) {
          userscriptCloseMenus();
          reveal(menuButton);
          try { activateElement(menuButton); } catch {}
          await sleep(180);
          const roleHint = userscriptRole(menuButton, options) || fallbackRole(roleIndex, options);
          for (const button of userscriptOpenCopyButtons(options).filter((item) => item !== menuButton && !menuButton.contains(item)).slice(0, 8)) {
            if (await accept(button, roleHint)) break;
          }
          userscriptCloseMenus();
          if (out.length >= 2) break;
        }
      }
    }
    return merge(out);
  }

  function nodeTextForCopy(node) {
    if (!node?.cloneNode) return text(node);
    try {
      const clone = node.cloneNode(true);
      clone.querySelectorAll?.("button,svg,script,style,noscript,input,textarea,select,option,form,nav,aside,footer,header").forEach((el) => el.remove());
      return normalize(clone.innerText || clone.textContent || "");
    } catch {
      return text(node);
    }
  }

  function internalCopyScope(el) {
    return Boolean(closest(el, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]"));
  }

  function copyButtonRole(button, options = {}) {
    const roleNode = closest(button, "[data-message-author-role]");
    const role = String(roleNode?.getAttribute?.("data-message-author-role") || "").toLowerCase();
    if (role === "user" || role === "assistant") return role;
    const label = buttonText(button);
    if (/(response|answer|assistant|回答|答复|回复)/i.test(label)) return "assistant";
    if (/(message|prompt|question|user|提问|消息|问题)/i.test(label)) return "user";
    const userRe = toRegex(options.copyUserContextPattern) || /(you\s+said|user\s+said|human|prompt|question|用户|你说|提问)/i;
    const assistantRe = toRegex(options.copyAssistantContextPattern) || /(assistant\s+said|assistant|answer|response|回答|回复|助手)/i;
    for (let node = button, depth = 0; node && node !== document.body && depth < 7; node = node.parentElement, depth += 1) {
      const context = normalize([
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.innerText || node.textContent || ""
      ].filter(Boolean).join(" "));
      if (!context || context.length > 3500) continue;
      const hasUser = userRe.test(context);
      const hasAssistant = assistantRe.test(context);
      if (hasUser && !hasAssistant) return "user";
      if (hasAssistant && !hasUser) return "assistant";
    }
    return null;
  }

  function conversationCopyButtons(root = document.body) {
    const out = [];
    const seen = new Set();
    const selector = "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]";
    for (const button of qsa(selector, root || document, { all: true })) {
      if (seen.has(button) || closest(button, "nav,header,footer,form") || internalCopyScope(button)) continue;
      const meta = userscriptMeta(button);
      if (/(?:copy\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|upload|voice|submit|model)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交)/i.test(meta)) continue;
      if (!(isNativeCopyButton(button) || userscriptLooksLikeCopyIcon(button))) continue;
      seen.add(button);
      out.push(button);
    }
    return out.sort(elementOrder);
  }

  function nativeCopyDedup(a, b) {
    const left = compareText(a);
    const right = compareText(b);
    return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
  }

  function hoverCopyBadButton(button) {
    const meta = userscriptMeta(button);
    return /(?:copy\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:new chat|new conversation|history|sidebar|toggle sidebar|home page|open notifications|link|share|search|deepthink|send|ask|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|regenerate|upload|voice|submit|model|fullscreen|reload|close)|链接|分享|搜索|深度思考|发送|新聊天|新对话|历史|侧边栏|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交|全屏|刷新|关闭)/i.test(meta);
  }

  function hoverCopyRect(node) {
    try {
      const rect = node?.getBoundingClientRect?.();
      return rect?.width && rect?.height ? rect : null;
    } catch {
      return null;
    }
  }

  function hoverCopySmallIconButton(button) {
    const rect = hoverCopyRect(button);
    if (!rect || rect.width > 72 || rect.height > 72) return false;
    const label = buttonText(button);
    if (label && label.length > 24) return false;
    return Boolean(button.querySelector?.("svg,path,rect,use,img,i,[class]"));
  }

  function hoverCopyCandidateButtons(anchor, options = {}) {
    const found = [];
    const seen = new Set();
    const rootRect = hoverCopyRect(anchor);
    const selector = "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]";
    const add = (button, base) => {
      if (!button || seen.has(button) || internalCopyScope(button) || closest(button, "nav,header,footer,form,input,textarea,select,[contenteditable=true]")) return;
      seen.add(button);
      if (hoverCopyBadButton(button)) return;
      const rect = hoverCopyRect(button);
      if (!rect) return;
      let score = base;
      const copyish = isNativeCopyButton(button) || userscriptLooksLikeCopyIcon(button);
      if (!copyish && !hoverCopySmallIconButton(button)) return;
      if (rootRect) {
        if (rect.bottom < rootRect.top - 220 || rect.top > rootRect.bottom + 420) return;
        score += Math.abs(rect.top - rootRect.bottom) * 12 + Math.abs(rect.left - rootRect.left);
      }
      score += copyish ? 0 : 12000;
      found.push({ button, score });
    };
    for (const button of userscriptFindCopyButtons(anchor, { ...options, expanded: true })) add(button, -20000);
    let order = 0;
    for (const scope of userscriptCopyRoots(anchor, { expanded: true })) {
      for (const button of qsa(selector, scope, { all: true })) add(button, order++);
    }
    if (rootRect) {
      for (const button of qsa(selector, document, { all: true })) {
        const rect = hoverCopyRect(button);
        if (!rect || rect.bottom < rootRect.top - 220 || rect.top > rootRect.bottom + 420) continue;
        add(button, 50000 + order++);
      }
    }
    return found.sort((a, b) => a.score - b.score || elementOrder(a.button, b.button)).map((item) => item.button);
  }

  function hoverCopyAnchorRole(anchor, index) {
    const roleNode = closest(anchor, "[data-message-author-role]");
    const role = String(roleNode?.getAttribute?.("data-message-author-role") || anchor?.getAttribute?.("data-message-author-role") || "").toLowerCase();
    if (role === "user" || role === "assistant") return role;
    const meta = normalize([
      classText(anchor),
      anchor?.getAttribute?.("data-testid"),
      anchor?.getAttribute?.("aria-label")
    ].filter(Boolean).join(" "));
    if (/assistant|answer|response|bot|ai|model|ds-assistant/i.test(meta)) return "assistant";
    if (/user|human|question|query|ds-user/i.test(meta)) return "user";
    return index % 2 === 0 ? "user" : "assistant";
  }

  function hoverCopyAddAnchor(list, node) {
    if (!node || node.nodeType !== 1 || list.includes(node) || closest(node, "nav,header,footer,form,input,textarea,select,[contenteditable=true]")) return;
    const rect = hoverCopyRect(node);
    if (!rect || rect.width < 20 || rect.height < 8) return;
    const value = nodeTextForCopy(node);
    if (!value || value.length < 2 || value.length > 60000) return;
    if (/^(?:copy|copied|edit|share|like|dislike|ask anything|message|send|search)$/i.test(value)) return;
    list.push(node);
  }

  function hoverCopyMessageAnchors(root = document.body) {
    const anchors = [];
    for (const assistant of qsa(".ds-assistant-message-main-content", root || document, { all: true })) {
      const box = closest(assistant, ".ds-message") || assistant;
      let prev = box?.previousElementSibling;
      for (let index = 0; prev && index < 5; prev = prev.previousElementSibling, index += 1) {
        if (nodeTextForCopy(prev)) {
          hoverCopyAddAnchor(anchors, prev);
          break;
        }
      }
      hoverCopyAddAnchor(anchors, assistant);
    }
    for (const selector of ["[data-message-author-role]", "article", "[data-testid*=message]", "[data-testid*=conversation]", "[class*=message]", "[class*=Message]", "[class*=response]", "[class*=Response]", "[class*=prose]", "main section", "main div"]) {
      for (const node of qsa(selector, root || document, { all: true })) hoverCopyAddAnchor(anchors, node);
      if (anchors.length > 120) break;
    }
    const textCache = new Map();
    const cachedText = (node) => {
      if (!textCache.has(node)) textCache.set(node, nodeTextForCopy(node));
      return textCache.get(node) || "";
    };
    const specific = anchors.filter((node) => {
      const value = cachedText(node);
      if (!value) return false;
      return !anchors.some((other) => other !== node && node.contains?.(other) && cachedText(other).length >= Math.min(value.length * 0.55, 500) && hoverCopyRect(other));
    });
    return specific
      .sort((a, b) => {
        const ar = hoverCopyRect(a);
        const br = hoverCopyRect(b);
        return ar && br ? ar.top - br.top || ar.left - br.left : elementOrder(a, b);
      })
      .filter((node, index, list) => !list.slice(0, index).some((prev) => nativeCopyDedup(cachedText(prev), cachedText(node))));
  }

  async function extractHoverNativeCopyConversation(root = document.body) {
    const options = {
      copyButtonSelector: "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]",
      copyButtonPattern: "copy|copied|clipboard|复制|已复制|拷贝",
      copyButtonExcludePattern: "copy\\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|upload|voice|submit|model)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交",
      copyButtonIconFallback: true,
      expanded: true,
      roleFallbackSequence: "userFirst",
      matchMode: "anyUseful",
      resetClipboardBeforeCopy: true,
      acceptUnchangedClipboard: false,
      copyTimeoutMs: 6500,
      copyPollMs: 40,
      copyCaptureGraceMs: 380
    };
    const out = [];
    const seen = new Set();
    let roleIndex = 0;
    for (const anchor of hoverCopyMessageAnchors(root).slice(0, 60)) {
      const role = hoverCopyAnchorRole(anchor, roleIndex);
      const expected = nodeTextForCopy(anchor);
      if (role !== "user" && role !== "assistant") continue;
      reveal(anchor);
      await sleep(180);
      for (const button of hoverCopyCandidateButtons(anchor, options).slice(0, 14)) {
        const copied = await copy(button, options);
        const value = userscriptCopyAccepted(copied, expected, role, options);
        if (value) {
          pushMessage(out, role, value, seen);
          roleIndex += 1;
          break;
        }
        userscriptCloseMenus();
        await sleep(80);
      }
      if (hasUserAndAssistant(out)) break;
    }
    const messages = merge(out);
    return hasUserAndAssistant(messages) ? messages : null;
  }

  async function extractNativeCopyConversation(root = document.body) {
    let buttons = conversationCopyButtons(root || document.body);
    if (buttons.length < 2) {
      const hovered = await extractHoverNativeCopyConversation(root || document.body);
      if (hovered) return hovered;
      buttons = conversationCopyButtons(root || document.body);
    }
    if (buttons.length < 2) return null;
    const seenText = [];
    const items = [];
    const copyOptions = {
      resetClipboardBeforeCopy: true,
      acceptUnchangedClipboard: false,
      copyTimeoutMs: 6000,
      copyPollMs: 40,
      copyCaptureGraceMs: 300
    };
    for (const button of buttons.slice(0, 16)) {
      try { button.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
      reveal(button);
      const copied = cleanCaptured(await copy(button, copyOptions));
      if (!copyLooksUseful(copied) || seenText.some((item) => nativeCopyDedup(item, copied))) continue;
      seenText.push(copied);
      items.push({ role: copyButtonRole(button), text: copied });
    }
    if (items.length < 2) {
      const hovered = await extractHoverNativeCopyConversation(root || document.body);
      return hovered || null;
    }
    let fallback = "user";
    const out = [];
    const seen = new Set();
    for (const item of items) {
      let role = item.role;
      if (role !== "user" && role !== "assistant") role = fallback;
      fallback = role === "user" ? "assistant" : "user";
      pushMessage(out, role, item.text, seen);
    }
    const firstUser = out.findIndex((item) => item.role === "user");
    const messages = merge(firstUser > 0 ? out.slice(firstUser) : out);
    return hasUserAndAssistant(messages) ? messages : null;
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
      target.value = value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function submitCandidates(selector, input) {
    const buttons = [
      ...qsa(selector).filter(visible),
      ...qsa("button,[role='button']").filter(visible).filter((button) => /send|submit|发送|提交/i.test([
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        button.textContent
      ].filter(Boolean).join(" ")))
    ];
    if (!input) return buttons;
    const inputRect = input.getBoundingClientRect();
    return buttons.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return Math.abs(ar.top - inputRect.top) - Math.abs(br.top - inputRect.top);
    });
  }

  async function sendText(data) {
    const input = inputCandidates(data?.inputSelector);
    if (!input) throw new Error("Input element not found");
    await setInputValue(input, data.text || "");
    await sleep(80);
    const submit = submitCandidates(data?.sendButtonSelector, input)[0];
    if (submit) {
      submit.click?.();
      return { sent: true, method: "button" };
    }
    const keyInit = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent("keydown", keyInit));
    input.dispatchEvent(new KeyboardEvent("keyup", keyInit));
    return { sent: true, method: "enter" };
  }

  async function collectSummary(data) {
    const config = data?.config || {};
    if (config.userscriptRunMode !== "serial") {
      const pageResult = await pageSummaryRequest(config);
      const pageMessages = merge(Array.isArray(pageResult?.messages) ? pageResult.messages : []);
      if (hasUserAndAssistant(pageMessages)) {
        return {
          messages: pageMessages,
          rawMessageCount: Number(pageResult.rawMessageCount) || pageMessages.length,
          hasUserAndAssistant: true,
          runner: "page-world"
        };
      }
    }
    const registry = window.__CHATCLUB_SUMMARY_SCRIPTS__ || {};
    const runner = registry[config.id] || registry[config.userscriptFile];
    if (!runner) return { messages: [] };
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
    return {
      messages: hasUserAndAssistant(messages) ? messages : [],
      rawMessageCount: messages.length,
      hasUserAndAssistant: hasUserAndAssistant(messages)
    };
  }

  window.addEventListener("message", async (event) => {
    const message = event.data;
    if (message?.source !== SOURCE || message.type !== "request") return;
    try {
      let data;
      if (message.action === "getLocationHref") data = location.href;
      else if (message.action === "getPageMeta") data = pageMeta();
      else if (message.action === "getPageText") data = normalize(document.body?.innerText || "");
      else if (message.action === "sendText") data = await sendText(message.data || {});
      else if (message.action === "newChatPreprocess") data = { ok: true };
      else if (message.action === "collectSummary") data = await collectSummary(message.data || {});
      else if (message.action === "getShortcutConfig") data = activeShortcutConfig;
      else throw new Error(`Unknown action: ${message.action}`);
      respond(event.source, message.id, message.action, data);
    } catch (error) {
      respond(event.source, message.id, message.action, null, error.message || String(error));
    }
  }, true);

  window.addEventListener("keydown", (event) => {
    const matched = matchShortcut(event);
    if (!matched) return;
    event.preventDefault();
    event.stopPropagation();
    postShortcutTriggered(matched);
  }, true);

  loadShortcutConfig();
  try {
    chrome.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName === "local" && changes.shortcutConfig) {
        activeShortcutConfig = normalizeShortcutConfig(changes.shortcutConfig.newValue);
      }
    });
  } catch {}

  window.parent.postMessage({ source: SOURCE, type: "request", action: "contentReady", id: `${Date.now()}`, data: { href: location.href } }, "*");
})();
