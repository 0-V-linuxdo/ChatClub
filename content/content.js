(() => {
  const SOURCE = "chatclub";
  const COPY_SOURCE = "chatclub-native-copy";
  const GEMINI_MODEL_PICKER_SOURCE = "chatclub-gemini-model-picker";
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
      openPocketPanel: { alt: false, shift: false, cmdOrCtrl: true, code: "KeyP" },
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
    "openPocketPanel",
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

  function modelResult(ok, appId, modelId, reason = "", extra = {}) {
    if (!ok && reason) console.warn(`[ChatClub] ${appId} preferred model: ${reason}`);
    return { ok, appId, modelId, ...(reason ? { reason } : {}), ...extra };
  }

  function isDisabledElement(el) {
    if (!el) return true;
    if (el.disabled || el.hasAttribute?.("disabled") || el.hasAttribute?.("data-disabled")) return true;
    const ariaDisabled = String(el.getAttribute?.("aria-disabled") || "").trim().toLowerCase();
    if (ariaDisabled === "true") return true;
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

  async function waitForModel(getter, timeoutMs = 2500, intervalMs = 120) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const value = getter();
      if (value) return value;
      await sleep(Math.max(30, Number(intervalMs) || 30));
    }
    return getter();
  }

  function requestGeminiModelPickerBridgeOpen(timeoutMs = 900) {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage, true);
        resolve({ ok: false, reason: "bridge timeout" });
      }, Math.max(300, Number(timeoutMs) || 900));
      function onMessage(event) {
        const message = event.data;
        if (message?.source !== GEMINI_MODEL_PICKER_SOURCE || message.type !== "response" || message.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        resolve(message);
      }
      window.addEventListener("message", onMessage, true);
      try {
        window.postMessage({ source: GEMINI_MODEL_PICKER_SOURCE, type: "request", action: "open", id }, "*");
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

  function currentGeminiModelKey() {
    const button = firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS);
    return inferGeminiModelKey(modelElementText(button));
  }

  function currentGeminiModelHasKey(modelId) {
    const button = firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS);
    const text = modelElementText(button);
    return geminiModelKeysFromText(text).has(modelId) || inferGeminiModelKey(text) === modelId;
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

  async function openGeminiModelMenu() {
    const existing = geminiModelMenuRoot();
    if (existing) return existing;
    const trigger = await waitForModel(() => firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS), 10000, 150);
    if (!trigger) return null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!visible(trigger) || isDisabledElement(trigger)) await sleep(180);
      modelClick(trigger);
      let root = await waitForModel(geminiModelMenuRoot, attempt === 0 ? 1400 : 900, 80);
      if (root) return root;
      await requestGeminiModelPickerBridgeOpen(attempt === 0 ? 1200 : 900);
      root = await waitForModel(geminiModelMenuRoot, attempt === 0 ? 1400 : 900, 80);
      if (root) return root;
      await sleep(180);
    }
    return null;
  }

  function geminiModelItemRow(element, root) {
    if (!element || !root || element === root || !root.contains?.(element)) return null;
    const direct = closest(element, [
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
    return geminiCompactMenuRows(root)
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
  }

  function findGeminiThinkingLevelOptionInMenus(modelId) {
    for (const root of geminiModelMenuRoots()) {
      const item = findGeminiThinkingLevelOption(root, modelId);
      if (item) return { root, item };
    }
    return { root: null, item: null };
  }

  function geminiThinkingClickTargets(row, root) {
    const targets = [];
    const seen = new Set();
    const add = (element) => {
      if (!element || seen.has(element) || !visible(element) || isDisabledElement(element)) return;
      if (root && !root.contains?.(element)) return;
      seen.add(element);
      targets.push(element);
    };
    add(row);
    add(closest(row, "button, [role='button'], [role='menuitem'], [role='menuitemradio'], [aria-haspopup='menu'], [aria-haspopup='true'], [tabindex]:not([tabindex='-1'])"));
    for (const element of qsa("button, [role='button'], [role='menuitem'], [role='menuitemradio'], [aria-haspopup='menu'], [aria-haspopup='true'], [tabindex]:not([tabindex='-1'])", row || document).slice(0, 8)) {
      add(element);
    }
    for (let node = row?.parentElement || null, guard = 0; node && node !== root && guard < 4; guard += 1, node = node.parentElement) {
      const rect = modelRect(node);
      if (rect && rect.width >= 80 && rect.height >= 26 && rect.height <= 110 && modelTextIncludes(modelElementText(node), "Thinking level")) add(node);
    }
    return targets;
  }

  function geminiThinkingLevelActivationRow(row, root) {
    if (!row) return null;
    let best = row;
    let bestScore = -1;
    for (let node = row; node && node.nodeType === 1 && node !== root; node = node.parentElement) {
      if (!visible(node) || isDisabledElement(node)) continue;
      const text = modelElementText(node);
      if (!modelTextIncludes(text, "Thinking level")) continue;
      const rect = modelRect(node);
      if (!rect || rect.width < 80 || rect.height < 24 || rect.height > 126) continue;
      let score = rect.width;
      if (matches(node, "button, [role='button'], [role='menuitem'], [role='menuitemradio'], [aria-haspopup='menu'], [aria-haspopup='true'], [aria-expanded], [tabindex]:not([tabindex='-1'])")) score += 160;
      if (modelTextIncludes(text, "Standard") || modelTextIncludes(text, "Extended")) score += 60;
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    }
    return best;
  }

  function geminiThinkingLevelDropdownPoint(row) {
    const rect = modelRect(row);
    if (!rect || rect.width <= 0 || rect.height <= 0) return modelCenterPoint(row);
    const viewportWidth = Math.max(1, Number(window.innerWidth) || Number(document.documentElement?.clientWidth) || 1);
    const viewportHeight = Math.max(1, Number(window.innerHeight) || Number(document.documentElement?.clientHeight) || 1);
    const inset = Math.min(28, Math.max(10, rect.width * 0.16));
    return {
      x: Math.min(Math.max(rect.right - inset, 1), viewportWidth - 1),
      y: Math.min(Math.max(rect.top + rect.height / 2, 1), viewportHeight - 1)
    };
  }

  function scoreGeminiThinkingDropdownTarget(target, row, point) {
    if (!target || !row || !visible(target) || isDisabledElement(target)) return -1;
    const rect = modelRect(target);
    let score = 0;
    if (target === row) score += 30;
    if (row.contains?.(target)) score += 30;
    if (target.contains?.(row)) score += 10;
    if (matches(target, "[aria-haspopup='menu'], [aria-haspopup='true'], [aria-expanded], [aria-controls]")) score += 140;
    if (matches(target, "button, [role='button'], [role='menuitem'], [role='menuitemradio'], [tabindex]:not([tabindex='-1'])")) score += 90;
    if (modelTextIncludes(modelElementText(target), "Thinking level")) score += 45;
    if (rect && point) {
      const targetCenterX = rect.left + rect.width / 2;
      score += Math.max(0, 70 - Math.abs(targetCenterX - point.x));
      if (rect.width >= 18 && rect.height >= 18) score += 20;
    }
    return score;
  }

  function geminiThinkingDropdownTargets(row, root) {
    const activationRow = geminiThinkingLevelActivationRow(row, root);
    const point = geminiThinkingLevelDropdownPoint(activationRow || row);
    const candidates = [];
    const seen = new Set();
    const add = (element) => {
      if (!element || seen.has(element) || !visible(element) || isDisabledElement(element)) return;
      if (root && !root.contains?.(element)) return;
      seen.add(element);
      candidates.push(element);
    };
    const pointTarget = modelElementFromPoint(point, activationRow || row);
    add(pointTarget);
    add(modelClickableAncestor(pointTarget));
    add(modelCustomActivationAncestor(pointTarget));
    for (const element of qsa("[aria-haspopup='menu'], [aria-haspopup='true'], [aria-expanded], [aria-controls], button, [role='button'], [role='menuitem'], [role='menuitemradio'], [tabindex]:not([tabindex='-1'])", activationRow || row).slice(0, 12)) {
      add(element);
    }
    add(modelClickableAncestor(activationRow));
    add(modelCustomActivationAncestor(activationRow));
    add(activationRow);
    candidates.sort((a, b) => scoreGeminiThinkingDropdownTarget(b, activationRow, point) - scoreGeminiThinkingDropdownTarget(a, activationRow, point));
    return { targets: candidates, point };
  }

  function clickGeminiThinkingDropdown(row, root) {
    const { targets, point } = geminiThinkingDropdownTargets(row, root);
    let clicked = false;
    for (const target of targets) {
      try { target.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
      try { target.focus?.({ preventScroll: true }); } catch {
        try { target.focus?.(); } catch {}
      }
      clicked = dispatchPointerActivation(target, point || modelCenterPoint(target)) || clicked;
      clicked = nativeModelClick(target) || clicked;
      if (clicked) return true;
    }
    return clicked;
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

  function clickGeminiMenuItem(item) {
    return modelDirectClick(item) || modelClick(item);
  }

  async function waitGeminiThinkingLevelOption(root, modelId) {
    if (modelId !== "thinking" && modelId !== "extended") return root || null;
    return await waitForModel(() => {
      const visibleRoots = geminiModelMenuRoots();
      for (const nextRoot of visibleRoots) {
        if (findGeminiThinkingLevelOption(nextRoot, modelId)) return nextRoot;
      }
      return root && findGeminiThinkingLevelOption(root, modelId) ? root : null;
    }, 1500, 80);
  }

  async function expandGeminiThinkingLevel(root, modelId) {
    const roots = [root, ...geminiModelMenuRoots()].filter(Boolean);
    const rows = [];
    const seenRows = new Set();
    for (const menuRoot of roots) {
      for (const row of findGeminiThinkingLevelRows(menuRoot)) {
        if (!seenRows.has(row)) {
          seenRows.add(row);
          rows.push({ row, root: menuRoot });
        }
      }
    }
    const triedTargets = new Set();
    for (const entry of rows) {
      if (clickGeminiThinkingDropdown(entry.row, entry.root)) {
        const dropdownRoot = await waitGeminiThinkingLevelOption(entry.root, modelId);
        if (dropdownRoot) return dropdownRoot;
      }
      for (const target of geminiThinkingClickTargets(entry.row, entry.root)) {
        if (triedTargets.has(target)) continue;
        triedTargets.add(target);
        if (modelDirectClick(target)) {
          const directRoot = await waitGeminiThinkingLevelOption(entry.root, modelId);
          if (directRoot) return directRoot;
        }
        if (modelClick(target)) {
          const clickedRoot = await waitGeminiThinkingLevelOption(entry.root, modelId);
          if (clickedRoot) return clickedRoot;
        }
      }
    }
    return null;
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

  function geminiElementHasSelectedState(element) {
    if (!element) return false;
    const candidates = [element, ...qsa("*", element).slice(0, 20)];
    for (const node of candidates) {
      if (parseBooleanAttr(node.getAttribute?.("aria-checked")) === true) return true;
      if (parseBooleanAttr(node.getAttribute?.("aria-selected")) === true) return true;
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

  async function closeGeminiModelMenu() {
    return closeFloatingModelMenuAndWait(geminiModelMenuRoot, 700);
  }

  async function waitGeminiModelSettled(modelId) {
    const deadline = Date.now() + 2200;
    while (Date.now() <= deadline) {
      const root = geminiModelMenuRoot();
      if (root && isGeminiTargetSelected(root, modelId)) return true;
      const current = root ? selectedGeminiModelKey(root) : currentGeminiModelKey();
      if (current && current === modelId) return true;
      if (!root && modelId === "flash35" && currentGeminiModelHasKey("flash35")) return true;
      if (!root && modelId === "extended" && currentGeminiModelHasKey("extended")) return true;
      if (!root && modelId === "thinking" && !currentGeminiModelHasKey("extended")) return true;
      if (!root && !current) return true;
      await sleep(120);
    }
    const final = currentGeminiModelKey();
    if (modelId === "flash35") return currentGeminiModelHasKey("flash35");
    if (modelId === "extended") return currentGeminiModelHasKey("extended");
    if (modelId === "thinking") return !currentGeminiModelHasKey("extended");
    return final ? final === modelId : !geminiModelMenuRoot();
  }

  async function applyGeminiModelTarget(modelId) {
    if (!GEMINI_MODEL_TARGETS[modelId]) return modelResult(false, "Gemini", modelId, "unknown model");
    if ((modelId === "fast" || modelId === "flash35" || modelId === "pro") && currentGeminiModelHasKey(modelId)) {
      return modelResult(true, "Gemini", modelId, "", { skipped: true });
    }

    let root = await openGeminiModelMenu();
    if (!root) return modelResult(false, "Gemini", modelId, "model menu not found");

    const anyOption = modelId === "thinking" || modelId === "extended"
      ? findGeminiThinkingLevelOptionInMenus(modelId)
      : { root: null, item: null };
    const anyModelItem = findGeminiModelItemInMenus(modelId);
    let item = modelId === "thinking" || modelId === "extended"
      ? anyOption.item || findGeminiThinkingLevelOption(root, modelId) || anyModelItem.item || findGeminiModelItem(root, modelId)
      : anyModelItem.item || findGeminiModelItem(root, modelId);
    if (anyOption.root || anyModelItem.root) root = anyOption.root || anyModelItem.root || root;
    if (isGeminiTargetSelected(root, modelId)) {
      const menuClosed = await closeGeminiModelMenu();
      return modelResult(true, "Gemini", modelId, "", { skipped: true, menuClosed });
    }
    if ((!item || modelTextIncludes(modelElementText(item), "Thinking level")) && (modelId === "thinking" || modelId === "extended")) {
      root = await expandGeminiThinkingLevel(root, modelId) || geminiModelMenuRoot() || root;
      const expandedOption = findGeminiThinkingLevelOptionInMenus(modelId);
      item = expandedOption.item || findGeminiThinkingLevelOption(root, modelId) || findGeminiModelItem(root, modelId);
      if (expandedOption.root) root = expandedOption.root;
      if (isGeminiTargetSelected(root, modelId)) {
        const menuClosed = await closeGeminiModelMenu();
        return modelResult(true, "Gemini", modelId, "", { skipped: true, menuClosed });
      }
    }
    if (!item) {
      const menuClosed = await closeGeminiModelMenu();
      return modelResult(false, "Gemini", modelId, "target model item not found", { menuClosed });
    }
    if (!clickGeminiMenuItem(item)) {
      const menuClosed = await closeGeminiModelMenu();
      return modelResult(false, "Gemini", modelId, "target model item could not be clicked", { menuClosed });
    }
    const settled = await waitGeminiModelSettled(modelId);
    const menuClosed = await closeGeminiModelMenu();
    return settled
      ? modelResult(true, "Gemini", modelId, "", { menuClosed })
      : modelResult(false, "Gemini", modelId, "selection did not settle", { menuClosed });
  }

  async function applyGeminiPreferredModel(modelId, options = {}) {
    if (!GEMINI_MODEL_TARGETS[modelId]) return modelResult(false, "Gemini", modelId, "unknown model");
    const thinkingModelId = modelId === "pro" ? geminiThinkingLevelModelId(options?.thinkingLevel) : "";
    const baseAlreadyApplied = currentGeminiModelHasKey(modelId);
    if (baseAlreadyApplied && !thinkingModelId) {
      return modelResult(true, "Gemini", modelId, "", {
        skipped: true
      });
    }

    let baseResult = null;
    if (!baseAlreadyApplied) {
      baseResult = await applyGeminiModelTarget(modelId);
      if (!baseResult?.ok) return baseResult;
    }

    if (thinkingModelId) {
      const thinkingResult = await applyGeminiModelTarget(thinkingModelId);
      if (!thinkingResult?.ok) return thinkingResult;
      return modelResult(true, "Gemini", modelId, "", {
        thinkingLevel: options.thinkingLevel,
        baseApplied: Boolean(baseResult && !baseResult.skipped),
        thinkingApplied: !thinkingResult.skipped,
        menuClosed: thinkingResult.menuClosed,
        skipped: Boolean((!baseResult || baseResult.skipped) && thinkingResult.skipped)
      });
    }

    return modelResult(true, "Gemini", modelId, "", {
      skipped: Boolean(!baseResult || baseResult.skipped),
      ...(thinkingModelId ? { thinkingLevel: options.thinkingLevel } : {}),
      menuClosed: baseResult?.menuClosed
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

  async function openGrokModelMenu() {
    const existing = grokModelMenuRoot();
    if (existing) return existing;
    const firstTrigger = await waitForModel(findGrokModelTrigger, 10000, 150);
    if (!firstTrigger) return null;
    for (const { element: trigger } of grokModelTriggerCandidates().slice(0, 6)) {
      if (!modelClick(trigger)) continue;
      await sleep(140);
      const root = await waitForModel(() => grokModelMenuRoot(trigger), 900, 90);
      if (root) return root;
      closeFloatingModelMenu();
      await sleep(80);
    }
    return null;
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

  async function waitGrokModelSettled(modelId) {
    const deadline = Date.now() + 2000;
    while (Date.now() <= deadline) {
      const current = currentGrokModelId();
      if (current && current === modelId) return true;
      if (!grokModelMenuRoot() && !current) return true;
      await sleep(120);
    }
    const final = currentGrokModelId();
    return final ? final === modelId : !grokModelMenuRoot();
  }

  async function applyGrokPreferredModel(modelId) {
    if (!GROK_MODEL_TARGETS[modelId]) return modelResult(false, "Grok", modelId, "unknown model");
    if (currentGrokModelId() === modelId) return modelResult(true, "Grok", modelId, "", { skipped: true });
    const root = await openGrokModelMenu();
    if (!root) return modelResult(false, "Grok", modelId, "model menu not found");
    const maybeItem = findGrokModelItem(root, modelId, { includeUnavailable: true });
    if (maybeItem && grokModelItemLooksUnavailable(maybeItem, modelId)) {
      await closeFloatingModelMenuAndWait(() => grokModelMenuRoot(), 700);
      return modelResult(true, "Grok", modelId, "", { skipped: true, unavailable: true });
    }
    const item = maybeItem || findGrokModelItem(root, modelId);
    if (!item) return modelResult(false, "Grok", modelId, "target model item not found");
    if (!modelClick(item)) return modelResult(false, "Grok", modelId, "target model item could not be clicked");
    const settled = await waitGrokModelSettled(modelId);
    return settled
      ? modelResult(true, "Grok", modelId)
      : modelResult(false, "Grok", modelId, "selection did not settle");
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
    if (!element || !visible(element) || isDisabledElement(element)) return -1;
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

  function findNotionModelTrigger() {
    const composerRoot = findNotionComposerRoot();
    const composerRect = modelRect(composerRoot);
    const candidates = visibleSelectorElements(NOTION_MODEL_TRIGGER_SELECTORS)
      .map((element) => ({ element, score: scoreNotionModelTrigger(element, { composerRoot, composerRect }), bottom: Number(element.getBoundingClientRect?.().bottom || 0) }))
      .filter((item) => item.score > 0);
    candidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
    return candidates[0]?.element || null;
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

  async function openNotionModelMenu(trigger) {
    const existing = notionModelMenuRoot(trigger);
    if (existing) return existing;
    if (!trigger || !modelClick(trigger)) return null;
    await sleep(120);
    return waitForModel(() => notionModelMenuRoot(trigger), 3000, 120);
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
    const triggerElement = trigger && visible(trigger) ? trigger : findNotionModelTrigger();
    return notionModelIdFromText(modelElementText(triggerElement));
  }

  async function waitNotionReadableCurrentModelId(trigger = null, timeoutMs = 2200) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const current = currentNotionModelId(trigger);
      if (current) return current;
      await sleep(120);
    }
    return currentNotionModelId(trigger);
  }

  async function closeNotionModelMenu(trigger = null) {
    const getRoot = () => notionModelMenuRoot(trigger);
    if (!getRoot()) return true;
    if (await closeFloatingModelMenuAndWait(getRoot, 900)) return true;
    const activeTrigger = trigger && visible(trigger) ? trigger : findNotionModelTrigger();
    if (activeTrigger && getRoot() && modelClick(activeTrigger)) {
      await sleep(160);
      if (!getRoot()) return true;
    }
    const composer = findNotionComposerRoot();
    if (composer && getRoot() && modelClick(composer)) {
      await sleep(160);
      if (!getRoot()) return true;
    }
    return closeFloatingModelMenuAndWait(getRoot, 500);
  }

  async function waitNotionModelSettled(modelId, trigger) {
    const deadline = Date.now() + 3000;
    while (Date.now() <= deadline) {
      const current = currentNotionModelId(trigger);
      if (current && current === modelId) return true;
      await sleep(120);
    }
    const final = currentNotionModelId(trigger);
    return final === modelId;
  }

  async function applyNotionPreferredModel(modelId) {
    if (!NOTION_MODEL_TARGETS[modelId]) return modelResult(false, "NotionAI", modelId, "unknown model");
    if ((await waitNotionReadableCurrentModelId(null, 1600)) === modelId) {
      const menuClosed = await closeNotionModelMenu();
      return modelResult(true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const trigger = await waitForModel(findNotionModelTrigger, 10000, 150);
    if (!trigger) {
      await closeNotionModelMenu();
      return modelResult(false, "NotionAI", modelId, "model trigger not found");
    }
    if ((await waitNotionReadableCurrentModelId(trigger, 2200)) === modelId) {
      const menuClosed = await closeNotionModelMenu(trigger);
      return modelResult(true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const root = await openNotionModelMenu(trigger);
    if (!root) {
      await closeNotionModelMenu(trigger);
      return modelResult(false, "NotionAI", modelId, "model menu not found");
    }
    if (currentNotionModelId(trigger) === modelId) {
      const menuClosed = await closeNotionModelMenu(trigger);
      return modelResult(true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const item = findNotionModelItem(root, modelId);
    if (!item) {
      await closeNotionModelMenu(trigger);
      return modelResult(false, "NotionAI", modelId, "target model item not found");
    }
    let clicked = modelClick(item);
    let settled = clicked ? await waitNotionModelSettled(modelId, trigger) : false;
    if (!settled) {
      const retryRoot = notionModelMenuRoot(trigger) || root;
      const pointTarget = retryRoot ? findNotionModelItemPointTarget(item, retryRoot, modelId) : null;
      if (pointTarget && pointTarget !== item && modelClick(pointTarget)) {
        clicked = true;
        settled = await waitNotionModelSettled(modelId, trigger);
      }
    }
    const menuClosed = await closeNotionModelMenu(trigger);
    if (!settled && currentNotionModelId(trigger) === modelId) settled = true;
    if (!clicked) return modelResult(false, "NotionAI", modelId, "target model item could not be clicked", { menuClosed });
    return settled
      ? modelResult(true, "NotionAI", modelId, "", { menuClosed })
      : modelResult(false, "NotionAI", modelId, "selection did not settle", { menuClosed });
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

  function dispatchDeepSeekMouseClick(target) {
    if (!target) return false;
    const point = modelCenterPoint(target);
    const MouseEventCtor = modelEventConstructor("MouseEvent", target);
    if (!point || typeof MouseEventCtor !== "function") return false;
    const view = modelEventView(target);
    const common = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: view || null,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x,
      screenY: point.y,
      button: 0
    };
    let dispatched = false;
    for (const plan of [
      ["mouseover", { buttons: 0, detail: 0 }],
      ["mousemove", { buttons: 0, detail: 0 }],
      ["mousedown", { buttons: 1, detail: 1 }],
      ["mouseup", { buttons: 0, detail: 1 }],
      ["click", { buttons: 0, detail: 1 }]
    ]) {
      try {
        target.dispatchEvent(new MouseEventCtor(plan[0], { ...common, ...plan[1] }));
        dispatched = true;
      } catch {}
    }
    return dispatched;
  }

  function clickDeepSeekMode(element) {
    if (!element || !visible(element) || isDisabledElement(element)) return false;
    try { element.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    const targets = [
      element,
      modelElementFromPoint(modelCenterPoint(element), element),
      deepSeekModeClickableElement(element)
    ].filter(Boolean);
    let clicked = false;
    const seen = new Set();
    for (const target of targets) {
      if (!target || seen.has(target) || !visible(target) || isDisabledElement(target)) continue;
      seen.add(target);
      try { target.focus?.({ preventScroll: true }); } catch {
        try { target.focus?.(); } catch {}
      }
      clicked = nativeModelClick(target) || clicked;
      clicked = dispatchDeepSeekMouseClick(target) || clicked;
    }
    return clicked;
  }

  async function waitDeepSeekModeSettled(modeId) {
    const deadline = Date.now() + 2500;
    while (Date.now() <= deadline) {
      if (currentDeepSeekModeId() === modeId) return true;
      await sleep(100);
    }
    return currentDeepSeekModeId() === modeId;
  }

  async function applyDeepSeekPreferredModel(modeId) {
    if (!DEEPSEEK_MODE_TARGETS[modeId]) return modelResult(false, "DeepSeek", modeId, "unknown mode");
    const current = await waitForModel(currentDeepSeekModeId, 10000, 150);
    if (current === modeId) return modelResult(true, "DeepSeek", modeId, "", { skipped: true });
    const target = await waitForModel(() => findDeepSeekModeTarget(modeId), 10000, 150);
    if (!target) return modelResult(false, "DeepSeek", modeId, "target mode not found");
    if (!clickDeepSeekMode(target)) return modelResult(false, "DeepSeek", modeId, "target mode could not be clicked");
    return (await waitDeepSeekModeSettled(modeId))
      ? modelResult(true, "DeepSeek", modeId)
      : modelResult(false, "DeepSeek", modeId, "selection did not settle", { current: currentDeepSeekModeId() });
  }

  async function applyPreferredModel(data = {}) {
    const rawAppId = String(data.appId || "").trim();
    const appId = ({
      "GrokMirror": "Grok",
      "Grok Mirror": "Grok",
      "DeepSeek AI": "DeepSeek",
      "Notion AI": "NotionAI"
    })[rawAppId] || rawAppId;
    const modelId = String(data.modelId || "").trim();
    if (!appId || !modelId) return modelResult(true, appId || "unknown", modelId, "", { skipped: true });
    if (appId === "Gemini") return applyGeminiPreferredModel(modelId, { thinkingLevel: data.thinkingLevel });
    if (appId === "Grok") return applyGrokPreferredModel(modelId);
    if (appId === "DeepSeek") return applyDeepSeekPreferredModel(modelId);
    if (appId === "NotionAI") return applyNotionPreferredModel(modelId);
    return modelResult(true, appId, modelId, "", { skipped: true, unsupported: true });
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
      else if (message.action === "applyPreferredModel") data = await applyPreferredModel(message.data || {});
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
