(() => {
  const API_NAME = "ChatClubPreferredModelTest";
  const GEMINI_MODEL_PICKER_SOURCE = "chatclub-gemini-model-picker:2026.07.13.3";
  const GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE = "data-chatclub-gemini-model-picker-run";
  try { window[API_NAME]?.dispose?.(); } catch {}
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  const normalize = (value) => String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const diagnostics = {
    activationCount: 0,
    activations: [],
    observedClickCount: 0,
    observedClicks: [],
    focusInCount: 0,
    focusOutCount: 0,
    blurCount: 0,
    composing: false,
    focusEvents: []
  };

  function diagnosticElement(element) {
    if (!element || element.nodeType !== 1) return { tag: "", id: "", className: "", text: "" };
    return {
      tag: String(element.tagName || "").toLowerCase(),
      id: String(element.id || ""),
      className: typeof element.className === "string" ? element.className.slice(0, 160) : "",
      text: normalize([
        element.getAttribute?.("aria-label"),
        element.getAttribute?.("title"),
        element.innerText || element.textContent || ""
      ].filter(Boolean).join(" ")).replace(/\s+/g, " ").slice(0, 180)
    };
  }

  function diagnosticActiveElement() {
    const active = document.activeElement;
    return {
      ...diagnosticElement(active),
      selectionStart: Number.isFinite(active?.selectionStart) ? active.selectionStart : null,
      selectionEnd: Number.isFinite(active?.selectionEnd) ? active.selectionEnd : null
    };
  }

  function recordActivation(target, method) {
    diagnostics.activationCount += 1;
    diagnostics.activations.push({
      index: diagnostics.activationCount,
      at: Date.now(),
      method,
      target: diagnosticElement(target),
      activeElement: diagnosticActiveElement()
    });
    while (diagnostics.activations.length > 80) diagnostics.activations.shift();
  }

  const diagnosticListeners = {
    click(event) {
      diagnostics.observedClickCount += 1;
      diagnostics.observedClicks.push({
        index: diagnostics.observedClickCount,
        at: Date.now(),
        trusted: Boolean(event.isTrusted),
        target: diagnosticElement(event.target)
      });
      while (diagnostics.observedClicks.length > 80) diagnostics.observedClicks.shift();
    },
    focusin(event) {
      diagnostics.focusInCount += 1;
      diagnostics.focusEvents.push({ type: "focusin", at: Date.now(), target: diagnosticElement(event.target) });
      while (diagnostics.focusEvents.length > 80) diagnostics.focusEvents.shift();
    },
    focusout(event) {
      diagnostics.focusOutCount += 1;
      diagnostics.focusEvents.push({ type: "focusout", at: Date.now(), target: diagnosticElement(event.target) });
      while (diagnostics.focusEvents.length > 80) diagnostics.focusEvents.shift();
    },
    blur(event) {
      diagnostics.blurCount += 1;
      diagnostics.focusEvents.push({ type: "blur", at: Date.now(), target: diagnosticElement(event.target) });
      while (diagnostics.focusEvents.length > 80) diagnostics.focusEvents.shift();
    },
    compositionstart() { diagnostics.composing = true; },
    compositionend() { diagnostics.composing = false; }
  };

  document.addEventListener("click", diagnosticListeners.click, true);
  document.addEventListener("focusin", diagnosticListeners.focusin, true);
  document.addEventListener("focusout", diagnosticListeners.focusout, true);
  document.addEventListener("blur", diagnosticListeners.blur, true);
  document.addEventListener("compositionstart", diagnosticListeners.compositionstart, true);
  document.addEventListener("compositionend", diagnosticListeners.compositionend, true);

  function diagnosticSnapshot() {
    return {
      activationCount: diagnostics.activationCount,
      activations: diagnostics.activations.slice(),
      observedClickCount: diagnostics.observedClickCount,
      observedClicks: diagnostics.observedClicks.slice(),
      focusInCount: diagnostics.focusInCount,
      focusOutCount: diagnostics.focusOutCount,
      blurCount: diagnostics.blurCount,
      composing: diagnostics.composing,
      activeElement: diagnosticActiveElement(),
      focusEvents: diagnostics.focusEvents.slice()
    };
  }

  function resetDiagnostics() {
    diagnostics.activationCount = 0;
    diagnostics.activations.length = 0;
    diagnostics.observedClickCount = 0;
    diagnostics.observedClicks.length = 0;
    diagnostics.focusInCount = 0;
    diagnostics.focusOutCount = 0;
    diagnostics.blurCount = 0;
    diagnostics.focusEvents.length = 0;
    return diagnosticSnapshot();
  }

  const TARGETS = Object.freeze({
    Gemini: Object.freeze(["pro", "fast", "flash35"]),
    Grok: Object.freeze(["auto", "fast", "expert", "grok43", "heavy"]),
    DeepSeek: Object.freeze(["instant", "expert", "vision"]),
    NotionAI: Object.freeze([
      "auto",
      "sonnet46",
      "opus47",
      "opus48",
      "gemini31pro",
      "gpt52",
      "gpt54",
      "gpt55",
      "grok43",
      "grokBuild01",
      "kimi26",
      "deepseekV4Pro",
      "glm52"
    ])
  });
  const GEMINI_THINKING_LEVELS = Object.freeze(["standard", "extended"]);

  const APP_ALIASES = Object.freeze({
    gemini: "Gemini",
    grok: "Grok",
    grokmirror: "Grok",
    "grok mirror": "Grok",
    deepseek: "DeepSeek",
    "deepseek ai": "DeepSeek",
    notion: "NotionAI",
    notionai: "NotionAI",
    "notion ai": "NotionAI"
  });

  function normalizeAppId(value) {
    const raw = String(value || "").trim();
    if (TARGETS[raw]) return raw;
    return APP_ALIASES[raw.toLowerCase()] || raw;
  }

  function inferAppId() {
    const host = location.hostname.replace(/^www\./, "");
    if (host === "gemini.google.com") return "Gemini";
    if (host === "grok.com" || host.endsWith(".grok.com") || host === "gk.dairoot.cn" || host.endsWith(".gk.dairoot.cn")) return "Grok";
    if (host === "deepseek.com" || host.endsWith(".deepseek.com")) return "DeepSeek";
    if (host === "app.notion.com" || host === "notion.so" || host.endsWith(".notion.so")) return "NotionAI";
    return "";
  }

  function result(ok, appId, modelId, reason = "", extra = {}) {
    const skipped = Boolean(extra.skipped);
    const payload = {
      ok,
      skipped,
      changed: Boolean(ok && !skipped),
      cancelled: false,
      retryable: false,
      reason: String(reason || ""),
      appId,
      modelId,
      ...extra
    };
    if (ok) console.log("[ChatClub model preference test]", payload);
    else console.warn("[ChatClub model preference test]", payload);
    return payload;
  }

  function qsa(selector, root = document) {
    try { return Array.from(root.querySelectorAll(selector)); } catch { return []; }
  }

  function qs(selector, root = document) {
    try { return root.querySelector(selector); } catch { return null; }
  }

  function closest(el, selector) {
    try { return el?.closest?.(selector) || null; } catch { return null; }
  }

  function matchesSelector(el, selector) {
    try { return Boolean(el?.matches?.(selector)); } catch { return false; }
  }

  function visible(el) {
    if (!el?.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
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
      for (const element of qsa(value, root)) {
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

  function elementText(el) {
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

  function compactText(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, " ");
  }

  function alnumToken(value) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function textIncludes(value, needle) {
    const haystack = compactText(value);
    const target = compactText(needle);
    return Boolean(target && (haystack === target || haystack.includes(target)));
  }

  function parseBooleanAttr(value) {
    const token = String(value ?? "").trim().toLowerCase();
    if (token === "true") return true;
    if (token === "false") return false;
    return null;
  }

  function eventView(el = null) {
    try { return el?.ownerDocument?.defaultView || document?.defaultView || window; } catch {}
    try { return window; } catch {}
    return null;
  }

  function eventConstructor(name, el = null) {
    try {
      const view = eventView(el);
      return view?.[name] || window?.[name] || null;
    } catch {
      return null;
    }
  }

  function rectOf(el) {
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

  function elementArea(el) {
    const rect = rectOf(el);
    return rect ? rect.width * rect.height : Number.MAX_SAFE_INTEGER;
  }

  function centerPoint(el) {
    const rect = rectOf(el);
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const viewportWidth = Math.max(1, Number(window.innerWidth) || Number(document.documentElement?.clientWidth) || 1);
    const viewportHeight = Math.max(1, Number(window.innerHeight) || Number(document.documentElement?.clientHeight) || 1);
    return {
      x: Math.min(Math.max(rect.left + rect.width / 2, 1), viewportWidth - 1),
      y: Math.min(Math.max(rect.top + rect.height / 2, 1), viewportHeight - 1)
    };
  }

  function elementFromPoint(point, el = null) {
    if (!point) return null;
    try {
      const doc = el?.ownerDocument || document;
      return doc.elementFromPoint?.(point.x, point.y) || null;
    } catch {
      return null;
    }
  }

  function clickableAncestor(el) {
    return closest(el, "button, a[href], [role='button'], [role='menuitem'], [role='menuitemradio'], [role='option'], [tabindex]:not([tabindex='-1'])");
  }

  function customActivationAncestor(el) {
    return closest(el, "gem-button, .gem-button, .gds-mode-switch-button");
  }

  function activationTargets(el) {
    const targets = [];
    const seen = new Set();
    const add = (target) => {
      if (!target || seen.has(target)) return;
      seen.add(target);
      targets.push(target);
    };
    const point = centerPoint(el);
    const pointTarget = elementFromPoint(point, el);
    if (pointTarget && (pointTarget === el || el.contains?.(pointTarget) || pointTarget.contains?.(el))) {
      add(customActivationAncestor(pointTarget));
      add(clickableAncestor(pointTarget));
      add(pointTarget);
    }
    add(el);
    add(customActivationAncestor(el));
    add(clickableAncestor(el));
    return targets.filter((target) => visible(target) && !isDisabledElement(target));
  }

  function dispatchPointerActivation(target, point) {
    if (!target || !point) return false;
    const PointerEventCtor = eventConstructor("PointerEvent", target);
    const MouseEventCtor = eventConstructor("MouseEvent", target);
    if (typeof PointerEventCtor !== "function" && typeof MouseEventCtor !== "function") return false;
    const clientX = Number(point.x) || 1;
    const clientY = Number(point.y) || 1;
    const view = eventView(target);
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
    if (dispatched) recordActivation(target, "pointer-sequence");
    return dispatched;
  }

  function nativeClick(target) {
    if (!target || typeof target.click !== "function") return false;
    try {
      target.click();
      recordActivation(target, "native-click");
      return true;
    } catch {
      return false;
    }
  }

  function clickElement(el) {
    if (!el || !visible(el) || isDisabledElement(el)) return false;
    try { el.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    const target = activationTargets(el)[0] || el;
    return nativeClick(target) || dispatchPointerActivation(target, centerPoint(target) || centerPoint(el));
  }

  function directClickElement(el) {
    if (!el || !visible(el) || isDisabledElement(el)) return false;
    try { el.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    return nativeClick(el) || dispatchPointerActivation(el, centerPoint(el));
  }

  function devtoolsListenerEvent(target, currentTarget) {
    const point = centerPoint(target) || centerPoint(currentTarget) || { x: 1, y: 1 };
    const path = [];
    const add = (node) => {
      if (node && !path.includes(node)) path.push(node);
    };
    add(target);
    for (let node = target; node; node = node.parentNode || node.host || null) add(node);
    add(currentTarget);
    add(document);
    add(window);
    return {
      type: "click",
      target,
      srcElement: target,
      currentTarget,
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 0,
      detail: 1,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x,
      screenY: point.y,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
      stopImmediatePropagation() {},
      composedPath() { return path; }
    };
  }

  async function openGeminiMenuWithDevtoolsListener(trigger) {
    if (typeof getEventListeners !== "function" || !trigger) return { invoked: false, opened: false };
    const target = customActivationAncestor(trigger) || trigger;
    let listeners = [];
    try { listeners = getEventListeners(target)?.click || []; } catch {}
    for (const record of listeners.slice().reverse()) {
      const listener = record?.listener;
      if (typeof listener !== "function" && typeof listener?.handleEvent !== "function") continue;
      try {
        const event = devtoolsListenerEvent(trigger, target);
        if (typeof listener === "function") listener.call(target, event);
        else listener.handleEvent.call(listener, event);
        recordActivation(trigger, "devtools-listener");
        await sleep(120);
        return { invoked: true, opened: Boolean(geminiMenuRoot()) };
      } catch {
        return { invoked: true, opened: false };
      }
    }
    return { invoked: false, opened: false };
  }

  async function waitFor(getter, timeoutMs = 2500, intervalMs = 120) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const value = getter();
      if (value) return value;
      await sleep(Math.max(30, Number(intervalMs) || 30));
    }
    return getter();
  }

  function requestGeminiMenuBridgeOpen(timeoutMs = 900) {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const runId = `devtools-${id}`;
      const runGeneration = Date.now();
      const runToken = `devtools:${runGeneration}:${runId}`;
      let settled = false;
      let timer = 0;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        try {
          if (document.documentElement?.getAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE) === runToken) {
            document.documentElement.removeAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE);
          }
        } catch {}
        try {
          window.postMessage({
            source: GEMINI_MODEL_PICKER_SOURCE,
            type: "request",
            action: "cancel",
            id: `${id}-cancel`,
            runId,
            runGeneration,
            runToken,
            reason: "DevTools picker probe finished"
          }, "*");
        } catch {}
        resolve(value);
      };
      function onMessage(event) {
        const message = event.data;
        if (
          message?.source !== GEMINI_MODEL_PICKER_SOURCE
          || message.type !== "response"
          || message.id !== id
          || String(message.runId || "") !== runId
          || String(message.runToken || "") !== runToken
        ) return;
        finish(message);
      }
      window.addEventListener("message", onMessage, true);
      try {
        document.documentElement?.setAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE, runToken);
        timer = setTimeout(() => finish({ ok: false, reason: "bridge timeout", runId, runToken }), Math.max(300, Number(timeoutMs) || 900));
        window.postMessage({
          source: GEMINI_MODEL_PICKER_SOURCE,
          type: "request",
          action: "open",
          id,
          runId,
          runGeneration,
          runToken
        }, "*");
      } catch (error) {
        finish({ ok: false, reason: error?.message || String(error || "bridge failed"), runId, runToken });
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
    "gem-mode-menu [role='menu']",
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
    const token = compactText(value);
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
    const token = compactText(value);
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
    const label = String(button.getAttribute?.("aria-label") || elementText(button) || "");
    const keys = geminiModelKeysFromText(label);
    const baseModelId = ["fast", "flash35", "pro"].find((key) => keys.has(key)) || (() => {
      const inferred = inferGeminiModelKey(label);
      return ["fast", "flash35", "pro"].includes(inferred) ? inferred : "";
    })();
    const token = compactText(label);
    const thinkingLevel = baseModelId === "pro"
      ? (keys.has("extended") || /\bextended(?:\s+thinking)?\b/.test(token) ? "extended" : "standard")
      : "";
    return { button, label, baseModelId, thinkingLevel };
  }

  function currentGeminiModelKey() {
    return currentGeminiPickerState().baseModelId;
  }

  function currentGeminiModelHasKey(modelId) {
    if (!modelId) return false;
    const state = currentGeminiPickerState();
    if (modelId === "extended") return state.baseModelId === "pro" && state.thinkingLevel === "extended";
    if (modelId === "thinking") return state.baseModelId === "pro" && state.thinkingLevel === "standard";
    return state.baseModelId === modelId;
  }

  function currentGeminiThinkingLevelKey() {
    const level = currentGeminiPickerState().thinkingLevel;
    return level === "standard" ? "thinking" : level;
  }

  function geminiThinkingLevelModelId(value) {
    const token = String(value || "").trim().toLowerCase();
    if (token === "extended") return "extended";
    if (token === "standard" || token === "thinking") return "thinking";
    return "";
  }

  function scoreGeminiMenuRoot(root) {
    if (!root || !visible(root)) return 0;
    const text = elementText(root);
    const token = compactText(text);
    if (!token) return 0;
    const keys = geminiModelKeysFromText(text);
    let score = keys.size * 80;
    if (token.includes("thinking level")) score += 60;
    if (token.includes("select a model") || token.includes("mode picker")) score += 40;
    if (token.includes("gemini") || token.includes("flash")) score += 15;
    if (matchesSelector(root, "gem-mode-menu, .cdk-overlay-pane, .gds-mode-switch-menu, .mat-mdc-menu-panel, .mat-menu-panel, [role='menu'], [role='listbox']")) score += 25;
    const rect = rectOf(root);
    if (rect) {
      if (rect.height >= 100 && rect.width >= 180) score += 20;
      if (rect.height > window.innerHeight * 0.9 || rect.width > window.innerWidth * 0.9) score -= 120;
    }
    if (keys.size < 2 && !token.includes("thinking level")) score -= 120;
    return score;
  }

  function geminiMenuRootCandidates() {
    const candidates = visibleSelectorElements(GEMINI_MODEL_MENU_ROOT_SELECTORS)
      .map((element, index) => ({ element, index, score: scoreGeminiMenuRoot(element), area: elementArea(element) }))
      .filter((candidate) => candidate.score > 0);
    candidates.sort((a, b) => b.score - a.score || b.area - a.area || b.index - a.index);
    return candidates;
  }

  function geminiMenuRoot() {
    const candidates = geminiMenuRootCandidates();
    return candidates[0]?.element || null;
  }

  function geminiMenuRoots() {
    return geminiMenuRootCandidates().map((candidate) => candidate.element);
  }

  async function openGeminiMenu() {
    const existing = geminiMenuRoot();
    if (existing) return existing;
    const trigger = await waitFor(() => firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS), 10000, 150);
    if (!trigger) return null;
    if (!visible(trigger) || isDisabledElement(trigger)) return null;

    const bridgeResult = await requestGeminiMenuBridgeOpen(1200);
    if (bridgeResult?.ok) {
      if (!bridgeResult.alreadyOpen) recordActivation(trigger, "gemini-picker-bridge");
      return await waitFor(geminiMenuRoot, 1600, 80) || null;
    }

    const listenerResult = await openGeminiMenuWithDevtoolsListener(trigger);
    if (listenerResult.invoked) {
      return listenerResult.opened
        ? geminiMenuRoot()
        : await waitFor(geminiMenuRoot, 1600, 80) || null;
    }

    if (!directClickElement(trigger)) return null;
    return await waitFor(geminiMenuRoot, 1600, 80) || null;
  }

  function geminiItems(root) {
    if (!root) return [];
    const rows = [];
    const seen = new Set();
    const rootArea = Math.max(1, elementArea(root));
    const add = (element) => {
      const row = geminiItemRow(element, root);
      if (!row || seen.has(row) || !visible(row) || isDisabledElement(row)) return;
      if (row === root || elementArea(row) > rootArea * 0.92) return;
      const text = elementText(row);
      if (!compactText(text)) return;
      seen.add(row);
      rows.push(row);
    };
    for (const element of visibleSelectorElements(GEMINI_MODEL_ITEM_SELECTORS, root)) add(element);
    return rows;
  }

  function geminiCompactMenuRows(root) {
    if (!root) return [];
    const realItems = qsa("gem-menu-item", root)
      .filter((item) => visible(item) && !isDisabledElement(item) && compactText(elementText(item)));
    if (realItems.length) return realItems;
    const rows = [];
    const seen = new Set();
    const rootArea = Math.max(1, elementArea(root));
    for (const element of qsa("*", root)) {
      if (!visible(element)) continue;
      let row = element;
      for (let node = element; node && node !== root; node = node.parentElement) {
        const rect = rectOf(node);
        if (!rect) continue;
        const area = rect.width * rect.height;
        if (rect.width > 80 && rect.height >= 30 && rect.height <= 96 && area < rootArea * 0.85) {
          row = node;
          break;
        }
      }
      if (!row || seen.has(row) || row === root || !visible(row) || isDisabledElement(row)) continue;
      const text = elementText(row);
      if (!compactText(text)) continue;
      seen.add(row);
      rows.push(row);
    }
    rows.sort((a, b) => elementArea(a) - elementArea(b));
    return rows;
  }

  function geminiItemRow(element, root) {
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
      const rect = rectOf(node);
      if (!rect || rect.height < 18 || rect.height > 140) continue;
      if (elementArea(node) > elementArea(root) * 0.92) continue;
      if (compactText(elementText(node))) return node;
    }
    return null;
  }

  function geminiTargetMatchesText(modelId, value) {
    const token = compactText(value);
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

  function scoreGeminiItem(item, modelId) {
    const text = elementText(item);
    if (!geminiTargetMatchesText(modelId, text)) return -1;
    const token = compactText(text);
    const keys = geminiModelKeysFromText(text);
    const rect = rectOf(item);
    let score = 100;
    if (keys.size === 1 && keys.has(modelId)) score += 80;
    if (keys.size > 1) score -= 120;
    if (matchesSelector(item, "button, [role='menuitemradio'], [role='menuitem'], [role='option'], [role='button'], mat-list-option")) score += 35;
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

  function findGeminiItem(root, modelId) {
    const candidates = geminiItems(root)
      .map((item, index) => ({ item, index, score: scoreGeminiItem(item, modelId), area: elementArea(item) }))
      .filter((candidate) => candidate.score >= 0);
    candidates.sort((a, b) => b.score - a.score || a.area - b.area || a.index - b.index);
    return candidates[0]?.item || null;
  }

  function findGeminiItemInMenus(modelId) {
    for (const root of geminiMenuRoots()) {
      const item = findGeminiItem(root, modelId);
      if (item) return { root, item };
    }
    return { root: null, item: null };
  }

  function scoreGeminiThinkingLevelRow(row) {
    const token = compactText(elementText(row));
    if (!token || !token.includes("thinking level")) return -1;
    const rect = rectOf(row);
    let score = 100;
    if (matchesSelector(row, "button, [role='menuitemradio'], [role='menuitem'], [role='button'], [aria-haspopup='menu'], [aria-haspopup='true'], [tabindex]:not([tabindex='-1'])")) score += 50;
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
      rows.push({ row, score, area: elementArea(row) });
    };
    for (const row of geminiCompactMenuRows(root)) add(row);
    for (const item of geminiItems(root)) {
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
        const text = elementText(row);
        const token = compactText(text);
        if (!token || token.includes("thinking level")) return false;
        const keys = geminiModelKeysFromText(text);
        if (modelId === "thinking" && keys.has("extended")) return false;
        if (modelId === "extended" && keys.has("thinking")) return false;
        return geminiTargetMatchesText(modelId, text);
      })
      .sort((a, b) => elementArea(a) - elementArea(b))[0] || null;
  }

  function findGeminiThinkingLevelOptionInMenus(modelId) {
    for (const root of geminiMenuRoots()) {
      const item = findGeminiThinkingLevelOption(root, modelId);
      if (item) return { root, item };
    }
    return { root: null, item: null };
  }

  function geminiActualMenuItem(element, root = null) {
    if (!element) return null;
    const item = closest(element, "gem-menu-item, button[role='menuitemradio'], button[role='menuitem'], [role='menuitemradio'], [role='menuitem'], [role='option'], mat-list-option");
    if (!item || (root && !root.contains?.(item))) return null;
    return item;
  }

  function findGeminiExtendedToggle(root) {
    if (!root) return null;
    const seen = new Set();
    for (const candidate of [...qsa("gem-menu-item", root), ...geminiItems(root)]) {
      const item = geminiActualMenuItem(candidate, root) || candidate;
      if (!item || seen.has(item)) continue;
      seen.add(item);
      if (!visible(item) || isDisabledElement(item)) continue;
      const token = compactText(elementText(item));
      if (/\bextended\s+thinking\b/.test(token)) return item;
    }
    return null;
  }

  function findGeminiExtendedToggleInMenus() {
    for (const root of geminiMenuRoots()) {
      const item = findGeminiExtendedToggle(root);
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
      const rect = rectOf(node);
      if (rect && rect.width >= 80 && rect.height >= 26 && rect.height <= 110 && textIncludes(elementText(node), "Thinking level")) add(node);
    }
    return targets;
  }

  function geminiThinkingLevelActivationRow(row, root) {
    if (!row) return null;
    let best = row;
    let bestScore = -1;
    for (let node = row; node && node.nodeType === 1 && node !== root; node = node.parentElement) {
      if (!visible(node) || isDisabledElement(node)) continue;
      const text = elementText(node);
      if (!textIncludes(text, "Thinking level")) continue;
      const rect = rectOf(node);
      if (!rect || rect.width < 80 || rect.height < 24 || rect.height > 126) continue;
      let score = rect.width;
      if (matchesSelector(node, "button, [role='button'], [role='menuitem'], [role='menuitemradio'], [aria-haspopup='menu'], [aria-haspopup='true'], [aria-expanded], [tabindex]:not([tabindex='-1'])")) score += 160;
      if (textIncludes(text, "Standard") || textIncludes(text, "Extended")) score += 60;
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    }
    return best;
  }

  function geminiThinkingLevelDropdownPoint(row) {
    const rect = rectOf(row);
    if (!rect || rect.width <= 0 || rect.height <= 0) return centerPoint(row);
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
    const rect = rectOf(target);
    let score = 0;
    if (target === row) score += 30;
    if (row.contains?.(target)) score += 30;
    if (target.contains?.(row)) score += 10;
    if (matchesSelector(target, "[aria-haspopup='menu'], [aria-haspopup='true'], [aria-expanded], [aria-controls]")) score += 140;
    if (matchesSelector(target, "button, [role='button'], [role='menuitem'], [role='menuitemradio'], [tabindex]:not([tabindex='-1'])")) score += 90;
    if (textIncludes(elementText(target), "Thinking level")) score += 45;
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
    const pointTarget = elementFromPoint(point, activationRow || row);
    add(pointTarget);
    add(clickableAncestor(pointTarget));
    add(customActivationAncestor(pointTarget));
    for (const element of qsa("[aria-haspopup='menu'], [aria-haspopup='true'], [aria-expanded], [aria-controls], button, [role='button'], [role='menuitem'], [role='menuitemradio'], [tabindex]:not([tabindex='-1'])", activationRow || row).slice(0, 12)) {
      add(element);
    }
    add(clickableAncestor(activationRow));
    add(customActivationAncestor(activationRow));
    add(activationRow);
    candidates.sort((a, b) => scoreGeminiThinkingDropdownTarget(b, activationRow, point) - scoreGeminiThinkingDropdownTarget(a, activationRow, point));
    return { targets: candidates, point };
  }

  function clickGeminiThinkingDropdown(row, root) {
    const { targets, point } = geminiThinkingDropdownTargets(row, root);
    const target = targets[0];
    if (!target) return false;
    try { target.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    return nativeClick(target) || dispatchPointerActivation(target, point || centerPoint(target));
  }

  function geminiThinkingLevelHeaderKey(root) {
    const row = findGeminiThinkingLevelRow(root);
    const token = compactText(elementText(row));
    if (!token || !token.includes("thinking level")) return "";
    const after = token.split("thinking level").slice(1).join("thinking level").trim();
    if (/^extended([^a-z0-9]|$)/.test(after)) return "extended";
    if (/^standard([^a-z0-9]|$)/.test(after)) return "thinking";
    return "";
  }

  function geminiThinkingLevelOptionIsSelected(root, modelId) {
    const option = findGeminiThinkingLevelOption(root, modelId);
    if (option && (geminiElementHasSelectedState(option) || textIncludes(elementText(option), "Selected"))) return true;
    return geminiThinkingLevelHeaderKey(root) === modelId;
  }

  function clickGeminiMenuItem(item) {
    return directClickElement(item);
  }

  async function waitGeminiThinkingLevelOption(root, modelId) {
    if (modelId !== "thinking" && modelId !== "extended") return root || null;
    return await waitFor(() => {
      const roots = geminiMenuRoots();
      for (const nextRoot of roots) {
        if (findGeminiThinkingLevelOption(nextRoot, modelId)) return nextRoot;
      }
      return root && findGeminiThinkingLevelOption(root, modelId) ? root : null;
    }, 1500, 80);
  }

  async function expandGeminiThinkingLevel(root, modelId) {
    const roots = [root, ...geminiMenuRoots()].filter(Boolean);
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
    const entry = rows[0];
    if (!entry) return null;
    const clicked = clickGeminiThinkingDropdown(entry.row, entry.root) || (() => {
      const target = geminiThinkingClickTargets(entry.row, entry.root)[0];
      return target ? directClickElement(target) : false;
    })();
    return clicked ? await waitGeminiThinkingLevelOption(entry.root, modelId) : null;
  }

  function isGeminiThinkingSubmenuItem(item) {
    if (!item || !textIncludes(elementText(item), "Thinking")) return false;
    let node = item;
    for (let guard = 0; node && node.nodeType === 1 && guard < 4; guard += 1, node = node.parentElement) {
      const popup = String(node.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
      if (popup === "menu" || popup === "true") return true;
    }
    return textIncludes(elementText(item), "Thinking level");
  }

  function geminiElementHasSelectedState(element) {
    if (!element) return false;
    const realItem = closest(element, "gem-menu-item");
    const candidates = [realItem, element, ...qsa("*", realItem || element).slice(0, 20)].filter(Boolean);
    for (let node = (realItem || element).parentElement, guard = 0; node && guard < 5; node = node.parentElement, guard += 1) {
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
    const selected = geminiItems(root)
      .filter(geminiElementHasSelectedState)
      .map((item) => ({ item, key: geminiModelKeyFromText(elementText(item)), score: elementArea(item) }))
      .filter((entry) => entry.key);
    selected.sort((a, b) => a.score - b.score);
    return selected[0]?.key || "";
  }

  function isGeminiTargetSelected(root, modelId) {
    if (modelId === "thinking" || modelId === "extended") {
      const toggle = findGeminiExtendedToggle(root);
      if (toggle) return geminiElementHasSelectedState(toggle) === (modelId === "extended");
      return geminiThinkingLevelOptionIsSelected(root, modelId);
    }
    const item = findGeminiItem(root, modelId);
    return Boolean(item && geminiElementHasSelectedState(item));
  }

  async function closeGeminiMenu() {
    return closeFloatingMenuAndWait(geminiMenuRoot, 700);
  }

  async function waitGeminiSettled(modelId) {
    const deadline = Date.now() + 2200;
    while (Date.now() <= deadline) {
      if (currentGeminiModelHasKey(modelId)) return true;
      await sleep(120);
    }
    return currentGeminiModelHasKey(modelId);
  }

  async function applyGeminiTarget(modelId) {
    if (modelId === "extended" && currentGeminiThinkingLevelKey() === "extended") {
      return { ok: true, skipped: true };
    }
    if (modelId === "thinking" && currentGeminiThinkingLevelKey() === "thinking") {
      return { ok: true, skipped: true };
    }

    let root = await openGeminiMenu();
    if (!root) return { ok: false, reason: "model menu not found" };

    if (modelId === "thinking" || modelId === "extended") {
      const compactToggle = findGeminiExtendedToggleInMenus();
      if (compactToggle.item) {
        root = compactToggle.root || root;
        const selected = geminiElementHasSelectedState(compactToggle.item);
        const shouldBeSelected = modelId === "extended";
        if (selected === shouldBeSelected) {
          return (await waitGeminiSettled(modelId))
            ? { ok: true, skipped: true }
            : { ok: false, reason: "thinking level did not settle" };
        }
        if (!clickGeminiMenuItem(compactToggle.item)) {
          return { ok: false, reason: "Extended thinking toggle could not be clicked" };
        }
        return (await waitGeminiSettled(modelId))
          ? { ok: true, skipped: false }
          : { ok: false, reason: "selection did not settle" };
      }
    }

    const anyOption = modelId === "thinking" || modelId === "extended"
      ? findGeminiThinkingLevelOptionInMenus(modelId)
      : { root: null, item: null };
    const anyModelItem = findGeminiItemInMenus(modelId);
    let item = modelId === "thinking" || modelId === "extended"
      ? anyOption.item || findGeminiThinkingLevelOption(root, modelId) || anyModelItem.item || findGeminiItem(root, modelId)
      : anyModelItem.item || findGeminiItem(root, modelId);
    if (anyOption.root || anyModelItem.root) root = anyOption.root || anyModelItem.root || root;
    if (isGeminiTargetSelected(root, modelId)) return { ok: true, skipped: true };
    if ((!item || textIncludes(elementText(item), "Thinking level")) && (modelId === "thinking" || modelId === "extended")) {
      root = await expandGeminiThinkingLevel(root, modelId) || geminiMenuRoot() || root;
      const expandedOption = findGeminiThinkingLevelOptionInMenus(modelId);
      item = expandedOption.item || findGeminiThinkingLevelOption(root, modelId) || findGeminiItem(root, modelId);
      if (expandedOption.root) root = expandedOption.root;
      if (isGeminiTargetSelected(root, modelId)) return { ok: true, skipped: true };
    }
    if (!item) {
      await closeGeminiMenu();
      return { ok: false, reason: "target model item not found" };
    }
    if (!clickGeminiMenuItem(item)) {
      await closeGeminiMenu();
      return { ok: false, reason: "target model item could not be clicked" };
    }
    return (await waitGeminiSettled(modelId))
      ? { ok: true, skipped: false }
      : { ok: false, reason: "selection did not settle" };
  }

  async function applyGemini(modelId, options = {}) {
    if (!GEMINI_MODEL_TARGETS[modelId]) return result(false, "Gemini", modelId, "unknown model");
    const thinkingModelId = modelId === "pro" ? geminiThinkingLevelModelId(options.thinkingLevel) : "";
    if (modelId === "pro" && options.thinkingLevel && !thinkingModelId) return result(false, "Gemini", modelId, "unknown thinking level");
    const baseAlreadyApplied = currentGeminiModelHasKey(modelId);
    if (baseAlreadyApplied && !thinkingModelId) {
      return result(true, "Gemini", modelId, "", {
        skipped: true
      });
    }

    let changed = false;
    if (!baseAlreadyApplied) {
      const baseApplied = await applyGeminiTarget(modelId);
      if (!baseApplied.ok) {
        await closeGeminiMenu();
        return result(false, "Gemini", modelId, baseApplied.reason, { targetId: modelId, thinkingLevel: options.thinkingLevel || "" });
      }
      changed = changed || !baseApplied.skipped;
      await closeGeminiMenu();
    }

    if (thinkingModelId) {
      const thinkingApplied = await applyGeminiTarget(thinkingModelId);
      if (!thinkingApplied.ok) {
        await closeGeminiMenu();
        return result(false, "Gemini", modelId, thinkingApplied.reason, { targetId: thinkingModelId, thinkingLevel: options.thinkingLevel || "" });
      }
      changed = changed || !thinkingApplied.skipped;
      await closeGeminiMenu();
    }

    return result(true, "Gemini", modelId, "", {
      ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
      ...(changed ? {} : { skipped: true })
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
      const token = alnumToken(part);
      if (!token) continue;
      for (const alias of target.aliases || []) {
        const aliasToken = alnumToken(alias);
        if (token === aliasToken || token.startsWith(aliasToken) || aliasToken.startsWith(token) || token.includes(aliasToken)) return true;
      }
    }
    return false;
  }

  function countGrokTargets(value) {
    return Object.values(GROK_MODEL_TARGETS)
      .reduce((count, target) => count + (grokTextLooksLikeTarget(value, target) ? 1 : 0), 0);
  }

  function grokMenuItemRow(element, root, matchesSpec = null) {
    const rootArea = elementArea(root);
    const rootRect = rectOf(root);
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
      const textValue = elementText(node);
      const targetCount = countGrokTargets(textValue);
      const area = elementArea(node);
      if (rootArea > 0 && area >= rootArea * 0.85) break;
      if (targetCount > 1) {
        node = node.parentElement || null;
        continue;
      }

      const rect = rectOf(node);
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

  function grokItems(root) {
    if (!root) return [];
    const seen = new Set();
    const candidates = [];
    const add = (element) => {
      if (!element || !visible(element) || isDisabledElement(element)) return;
      const textValue = elementText(element);
      if (!grokModelIdFromText(textValue) && countGrokTargets(textValue) !== 1) return;
      const item = grokMenuItemRow(element, root);
      if (!item || seen.has(item) || !root.contains?.(item) || !visible(item) || isDisabledElement(item)) return;
      const itemText = elementText(item);
      if (!grokModelIdFromText(itemText) || countGrokTargets(itemText) > 1) return;
      seen.add(item);
      candidates.push(item);
    };
    for (const element of visibleSelectorElements(GROK_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "li"], root)) add(element);
    return candidates;
  }

  function grokModelItemText(item) {
    const text = elementText(item);
    return text.split(/\n+/).map((part) => part.trim()).find(Boolean) || text;
  }

  function directText(el) {
    try {
      return normalize(Array.from(el?.childNodes || [])
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || "")
        .join(" "));
    } catch {
      return "";
    }
  }

  function colorChannels(value) {
    const match = String(value || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i);
    if (!match) return null;
    return {
      r: Number(match[1]) || 0,
      g: Number(match[2]) || 0,
      b: Number(match[3]) || 0,
      a: match[4] == null ? 1 : Number(match[4])
    };
  }

  function effectiveOpacity(el, stop = null) {
    let opacity = 1;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      try {
        opacity *= Math.max(0, Math.min(1, Number(getComputedStyle(node).opacity || 1)));
      } catch {}
      if (node === stop) break;
    }
    return opacity;
  }

  function grokLabelElements(item, target) {
    if (!item || !target) return [];
    const aliases = (target.aliases || []).map(alnumToken).filter(Boolean);
    const elements = [item, ...qsa("*", item).slice(0, 80)];
    return elements.filter((element) => {
      const own = alnumToken(directText(element));
      if (!own) return false;
      return aliases.some((alias) => own === alias || own.startsWith(alias) || alias.startsWith(own));
    });
  }

  function grokElementLooksMuted(element, item) {
    if (!element) return false;
    let style = null;
    try { style = getComputedStyle(element); } catch {}
    if (!style) return false;
    const color = colorChannels(style.color);
    const opacity = effectiveOpacity(element, item);
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
    const labels = grokLabelElements(item, target);
    return labels.length > 0 && labels.every((element) => grokElementLooksMuted(element, item));
  }

  function grokTextStartsWithAlias(value, alias) {
    const token = alnumToken(value);
    const aliasToken = alnumToken(alias);
    return Boolean(token && aliasToken && (token === aliasToken || token.startsWith(aliasToken)));
  }

  function grokMenuRootLooksLikeModel(root) {
    if (!root || !visible(root)) return false;
    const rootText = elementText(root);
    const rootSignal = /\b(model|mode|grok)\b|模型|模式/i.test(rootText);
    let targetCount = 0;
    for (const item of grokItems(root)) {
      if (grokModelIdFromText(elementText(item))) targetCount += 1;
      if (targetCount >= 2) return true;
    }
    return Boolean(countGrokTargets(rootText) >= 2 || (grokModelIdFromText(rootText) && (rootSignal || targetCount >= 1)));
  }

  function grokMenuRoot(triggerEl = null) {
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
    const textValue = compactText(value);
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
      elementText(element)
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
        const rect = rectOf(node);
        if (rect && rect.width >= 280 && rect.height >= 40 && rect.height <= 260) best = node;
        node = node.parentElement || null;
      }
      const rect = rectOf(best);
      if (!rect || !isLikelyGrokComposerRect(rect)) continue;
      candidates.push({ element: best, score: rect.bottom + Math.min(260, rect.width) });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.element || null;
  }

  function isGrokTriggerNearComposer(element, composerRoot = null, composerRect = null) {
    if (!element) return false;
    if (composerRoot?.contains?.(element)) return true;
    const rect = rectOf(element);
    if (!rect || !composerRect || !isLikelyGrokComposerRect(composerRect)) return false;
    const inComposerY = rect.top >= composerRect.top - 14 && rect.bottom <= composerRect.bottom + 14;
    const inComposerX = rect.left >= composerRect.left - 14 && rect.right <= composerRect.right + 14;
    const controlSized = rect.width >= 20 && rect.width <= 220 && rect.height >= 18 && rect.height <= 80;
    return inComposerY && inComposerX && controlSized;
  }

  function grokLooksLikeVoiceControl(value) {
    return /\b(voice|dictation|microphone|mic|record(?:ing)?|audio|speech|speak)\b|语音|麦克风|录音|听写/i.test(String(value || ""));
  }

  function grokHasModelSignal(value) {
    const textValue = String(value || "");
    if (/\bmodel\b|模型|模式/i.test(textValue)) return true;
    return /\bmode\b/i.test(textValue) && !/\bvoice\s+mode\b/i.test(textValue);
  }

  function grokTriggerButton(element) {
    if (!element) return null;
    if (matchesSelector(element, GROK_MODEL_TRIGGER_BUTTON_SELECTOR)) return element;
    return closest(element, GROK_MODEL_TRIGGER_BUTTON_SELECTOR) || closest(element, "button, [role='button']") || element;
  }

  function directGrokTriggerBoost(element) {
    if (!element || !visible(element) || isDisabledElement(element)) return 0;
    const rootsSelector = GROK_MODEL_MENU_ROOT_SELECTORS.join(", ");
    if (element.closest?.(rootsSelector)) return 0;
    const textValue = elementText(element);
    const ariaLabel = String(element.getAttribute?.("aria-label") || "").trim();
    const title = String(element.getAttribute?.("title") || "").trim();
    const dataSlot = String(element.getAttribute?.("data-slot") || "").trim();
    const dataTestId = String(element.getAttribute?.("data-testid") || "").trim();
    const searchValue = [textValue, ariaLabel, title, dataSlot, dataTestId].filter(Boolean).join(" ");
    const targetId = grokModelIdFromText(textValue) || grokModelIdFromText(ariaLabel) || grokModelIdFromText(searchValue);
    const modelSelect = /\bmodel\s*select\b/i.test(searchValue);
    const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
    if (grokLooksLikeVoiceControl(searchValue) && !targetId && !modelSelect) return 0;
    if (!targetId && !modelSelect) return 0;
    let score = 650;
    if (modelSelect) score += 520;
    if (targetId) score += 240;
    if (popup === "menu" || popup === "listbox" || popup === "true") score += 120;
    if (dataSlot === "dropdown-menu-trigger") score += 80;
    if (parseBooleanAttr(element.getAttribute?.("aria-expanded")) !== null) score += 30;
    return score;
  }

  function scoreGrokTrigger(element, options = {}) {
    if (!element || !visible(element) || isDisabledElement(element)) return -1;
    const rootsSelector = GROK_MODEL_MENU_ROOT_SELECTORS.join(", ");
    if (element.closest?.(rootsSelector)) return -1;
    const textValue = elementText(element);
    const dataTestId = String(element.getAttribute?.("data-testid") || "");
    const ariaLabel = String(element.getAttribute?.("aria-label") || "").trim();
    const title = String(element.getAttribute?.("title") || "");
    const searchValue = [textValue, dataTestId, ariaLabel, title].filter(Boolean).join(" ");
    const targetId = grokModelIdFromText(textValue) || grokModelIdFromText(searchValue);
    const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
    const nearComposer = isGrokTriggerNearComposer(element, options.composerRoot || null, options.composerRect || null);
    const hasModelSignal = grokHasModelSignal(searchValue);
    const hasGrokSignal = /\bgrok\b/i.test(searchValue);
    const exactModelTrigger = matchesSelector(element, GROK_MODEL_TRIGGER_BUTTON_SELECTOR);
    if (grokLooksLikeVoiceControl(searchValue) && !targetId && !/\bmodel\b|模型|模式/i.test(searchValue)) return -1;
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
    const compact = compactText(textValue);
    const allowIconLikeComposerControl = nearComposer && (popup === "menu" || popup === "listbox" || popup === "true" || compact.length <= 36);
    if (!targetId && !hasModelSignal && !allowIconLikeComposerControl) return -1;
    return score > 0 ? score : -1;
  }

  function grokTriggerCandidates() {
    const composerRoot = findGrokComposerRoot();
    const composerRect = rectOf(composerRoot);
    const seen = new Set();
    const candidates = [];
    const add = (element, boost = 0) => {
      const trigger = grokTriggerButton(element);
      if (!trigger || seen.has(trigger)) return;
      seen.add(trigger);
      const score = scoreGrokTrigger(trigger, { composerRoot, composerRect });
      if (score <= 0 && boost <= 0) return;
      candidates.push({ element: trigger, score: Math.max(0, score) + boost, bottom: Number(trigger.getBoundingClientRect?.().bottom || 0) });
    };
    for (const element of visibleSelectorElements(GROK_MODEL_DIRECT_TRIGGER_SELECTORS)) {
      add(element, directGrokTriggerBoost(grokTriggerButton(element) || element));
    }
    for (const element of visibleSelectorElements(GROK_MODEL_TRIGGER_SELECTORS)) {
      add(element);
    }
    candidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
    return candidates;
  }

  function findGrokTrigger() {
    return grokTriggerCandidates()[0]?.element || null;
  }

  function closeFloatingMenu() {
    const targets = [document.activeElement, document.body, document.documentElement, document, window].filter(Boolean);
    const seen = new Set();
    for (const target of targets) {
      if (!target || seen.has(target)) continue;
      seen.add(target);
      const KeyboardEventCtor = eventConstructor("KeyboardEvent", target);
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

  async function closeFloatingMenuAndWait(getMenuRoot, timeoutMs = 900) {
    const getter = typeof getMenuRoot === "function" ? getMenuRoot : () => null;
    if (!getter()) return true;
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      closeFloatingMenu();
      await sleep(90);
      if (!getter()) return true;
    }
    return !getter();
  }

  async function openGrokMenu() {
    const existing = grokMenuRoot();
    if (existing) return existing;
    const firstTrigger = await waitFor(findGrokTrigger, 10000, 150);
    if (!firstTrigger) return null;
    const trigger = grokTriggerCandidates()[0]?.element || firstTrigger;
    if (!clickElement(trigger)) return null;
    await sleep(140);
    return await waitFor(() => grokMenuRoot(trigger), 1200, 90) || null;
  }

  function currentGrokModelId() {
    const trigger = findGrokTrigger();
    const current = grokModelIdFromText(elementText(trigger));
    if (current) return current;
    const root = grokMenuRoot();
    const selected = grokItems(root).find((item) => {
      const state = String(item.getAttribute?.("data-state") || "").trim().toLowerCase();
      const ariaChecked = String(item.getAttribute?.("aria-checked") || "").trim().toLowerCase();
      const ariaSelected = String(item.getAttribute?.("aria-selected") || "").trim().toLowerCase();
      return state === "checked" || state === "selected" || state === "active" || ariaChecked === "true" || ariaSelected === "true";
    });
    return grokModelIdFromText(elementText(selected));
  }

  function findGrokItem(root, modelId, options = {}) {
    const target = GROK_MODEL_TARGETS[modelId];
    if (!target) return null;
    const matchesTarget = (element) => grokTextLooksLikeTarget(elementText(element), target);
    for (const item of grokItems(root)) {
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

  async function waitGrokSettled(modelId) {
    const deadline = Date.now() + 2000;
    while (Date.now() <= deadline) {
      const current = currentGrokModelId();
      if (current && current === modelId) return true;
      if (!grokMenuRoot() && !current) return true;
      await sleep(120);
    }
    const final = currentGrokModelId();
    return final ? final === modelId : !grokMenuRoot();
  }

  async function applyGrok(modelId) {
    if (!GROK_MODEL_TARGETS[modelId]) return result(false, "Grok", modelId, "unknown model");
    if (currentGrokModelId() === modelId) return result(true, "Grok", modelId, "", { skipped: true });
    const root = await openGrokMenu();
    if (!root) return result(false, "Grok", modelId, "model menu not found");
    const maybeItem = findGrokItem(root, modelId, { includeUnavailable: true });
    if (maybeItem && grokModelItemLooksUnavailable(maybeItem, modelId)) {
      await closeFloatingMenuAndWait(() => grokMenuRoot(), 700);
      return result(true, "Grok", modelId, "", { skipped: true, unavailable: true });
    }
    const item = maybeItem || findGrokItem(root, modelId);
    if (!item) return result(false, "Grok", modelId, "target model item not found");
    if (!clickElement(item)) return result(false, "Grok", modelId, "target model item could not be clicked");
    return (await waitGrokSettled(modelId))
      ? result(true, "Grok", modelId)
      : result(false, "Grok", modelId, "selection did not settle");
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
    return [target?.label, ...(target?.aliases || [])].map(notionText).filter(Boolean);
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
    return Object.values(NOTION_MODEL_TARGETS).reduce((count, target) => count + (notionTextLooksLikeTarget(value, target) ? 1 : 0), 0);
  }

  function isLikelyNotionMainComposerRect(rect) {
    if (!rect || rect.width < 280 || rect.height < 40 || rect.height > 280) return false;
    const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0);
    const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0);
    if (viewportWidth > 0 && rect.right < viewportWidth * 0.35) return false;
    if (viewportHeight > 0 && rect.bottom < viewportHeight * 0.28) return false;
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
      elementText(element)
    ].filter(Boolean).join(" ");
  }

  function findNotionComposerRoot() {
    const selector = ["textarea", '[contenteditable="true"]', '[role="textbox"]', "[data-placeholder]", "[aria-placeholder]", "form", "div"].join(", ");
    const candidates = [];
    const seen = new Set();
    for (const element of visibleSelectorElements(selector)) {
      if (!element || seen.has(element)) continue;
      seen.add(element);
      if (!notionTextLooksLikeComposerPrompt(notionComposerCandidateText(element))) continue;
      let node = element;
      let best = element;
      while (node && node.nodeType === 1 && node !== document.body) {
        const rect = rectOf(node);
        if (rect && rect.width >= 320 && rect.height >= 44 && rect.height <= 260) best = node;
        node = node.parentElement || null;
      }
      const rect = rectOf(best);
      if (!rect || !isLikelyNotionMainComposerRect(rect)) continue;
      candidates.push({ element: best, score: rect.bottom + Math.min(300, rect.width) });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.element || null;
  }

  function isNotionTriggerNearMainComposer(element, composerRoot = null, composerRect = null) {
    if (!element) return false;
    if (composerRoot?.contains?.(element)) return true;
    const rect = rectOf(element);
    if (!rect || !composerRect || !isLikelyNotionMainComposerRect(composerRect)) return false;
    const inComposerY = rect.top >= composerRect.top - 12 && rect.bottom <= composerRect.bottom + 12;
    const inComposerX = rect.left >= composerRect.left - 12 && rect.right <= composerRect.right + 12;
    const controlSized = rect.width >= 24 && rect.width <= 180 && rect.height >= 20 && rect.height <= 76;
    return inComposerY && inComposerX && controlSized;
  }

  function scoreNotionTrigger(element, options = {}) {
    if (!element || !visible(element) || isDisabledElement(element)) return -1;
    if (element.closest?.(NOTION_MODEL_MENU_ROOT_SELECTORS.join(", "))) return -1;
    const textValue = elementText(element);
    const dataTestId = String(element.getAttribute?.("data-testid") || "").toLowerCase();
    const ariaLabel = String(element.getAttribute?.("aria-label") || "");
    const title = String(element.getAttribute?.("title") || "");
    const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
    const nearMainComposer = isNotionTriggerNearMainComposer(element, options.composerRoot || null, options.composerRect || null);
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

  function findNotionTrigger() {
    const composerRoot = findNotionComposerRoot();
    const composerRect = rectOf(composerRoot);
    const candidates = visibleSelectorElements(NOTION_MODEL_TRIGGER_SELECTORS)
      .map((element) => ({ element, score: scoreNotionTrigger(element, { composerRoot, composerRect }), bottom: Number(element.getBoundingClientRect?.().bottom || 0) }))
      .filter((item) => item.score > 0);
    candidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
    return candidates[0]?.element || null;
  }

  function scoreNotionMenuRoot(root) {
    if (!root || !visible(root)) return -1;
    const textValue = elementText(root);
    const normalized = notionText(textValue);
    let score = 0;
    if (normalized.includes("select a model")) score += 160;
    if (normalized.includes("open models")) score += 80;
    score += Math.min(5, countNotionModelTargets(textValue)) * 80;
    return score >= 160 ? score : -1;
  }

  function notionMenuRoot(trigger = null) {
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (controlsId) {
      const controlled = document.getElementById(controlsId);
      if (scoreNotionMenuRoot(controlled) > 0) return controlled;
    }
    const roots = visibleSelectorElements(NOTION_MODEL_MENU_ROOT_SELECTORS)
      .map((element) => ({ element, score: scoreNotionMenuRoot(element) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    return roots[0]?.element || null;
  }

  async function openNotionMenu(trigger) {
    const existing = notionMenuRoot(trigger);
    if (existing) return existing;
    if (!trigger || !clickElement(trigger)) return null;
    await sleep(120);
    return waitFor(() => notionMenuRoot(trigger), 3000, 120);
  }

  function notionMenuItemRow(element, root, matchesSpec = null) {
    const rootArea = elementArea(root);
    const rootRect = rectOf(root);
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
      const textValue = elementText(node);
      const targetCount = countNotionModelTargets(textValue);
      const area = elementArea(node);
      if (rootArea > 0 && area >= rootArea * 0.85) break;
      if (typeof matchesSpec === "function" && !matchesSpec(node)) {
        node = node.parentElement || null;
        continue;
      }
      if (targetCount > 1) {
        node = node.parentElement || null;
        continue;
      }
      const rect = rectOf(node);
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

  function scoreNotionItem(element, modelId) {
    if (!element || !visible(element) || isDisabledElement(element)) return Number.NEGATIVE_INFINITY;
    const textValue = elementText(element);
    const target = NOTION_MODEL_TARGETS[modelId];
    const role = String(element.getAttribute?.("role") || "").toLowerCase();
    const tag = String(element.tagName || "").toLowerCase();
    const tabIndex = String(element.getAttribute?.("tabindex") || "").trim();
    const targetCount = countNotionModelTargets(textValue);
    let score = 0;
    if (role === "menuitem" || role === "menuitemradio" || role === "option") score += 900;
    if (tag === "button" || role === "button") score += 360;
    if (tabIndex && tabIndex !== "-1") score += 120;
    if (targetCount === 1) score += 260;
    if (targetCount > 1) score -= 700;
    if (notionTextLooksLikeTarget(textValue, target)) score += 620;
    if (notionLabels(target).includes(notionText(textValue))) score += 260;
    const rect = rectOf(element);
    if (rect && rect.height >= 24 && rect.height <= 72) score += 100;
    if (rect && rect.width >= 120) score += 40;
    score -= Math.min(160, elementArea(element) / 6000);
    return score;
  }

  function findNotionItem(root, modelId) {
    if (!root || !NOTION_MODEL_TARGETS[modelId]) return null;
    const target = NOTION_MODEL_TARGETS[modelId];
    const matchesSpec = (element) => notionTextLooksLikeTarget(elementText(element), target);
    const seenRows = new Set();
    const rows = [];
    const add = (element) => {
      if (!element || !matchesSpec(element)) return;
      const row = notionMenuItemRow(element, root, matchesSpec);
      if (!row || seenRows.has(row) || !root.contains?.(row)) return;
      if (!matchesSpec(row)) return;
      if (countNotionModelTargets(elementText(row)) > 1) return;
      seenRows.add(row);
      rows.push(row);
    };
    for (const element of visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "button"], root)) add(element);
    rows.sort((a, b) => scoreNotionItem(b, modelId) - scoreNotionItem(a, modelId));
    return rows[0] || null;
  }

  function findNotionPointTarget(element, root, modelId) {
    const target = NOTION_MODEL_TARGETS[modelId];
    const matchesSpec = (candidate) => notionTextLooksLikeTarget(elementText(candidate), target);
    const point = centerPoint(element);
    const pointElement = elementFromPoint(point, element);
    if (!pointElement || !root?.contains?.(pointElement)) return null;
    let node = pointElement;
    while (node && node.nodeType === 1 && node !== root) {
      if (
        visible(node) &&
        !isDisabledElement(node) &&
        matchesSpec(node) &&
        countNotionModelTargets(elementText(node)) <= 1
      ) {
        const row = notionMenuItemRow(node, root, matchesSpec);
        if (row && root.contains?.(row) && matchesSpec(row)) return row;
      }
      node = node.parentElement || null;
    }
    const clickable = clickableAncestor(pointElement);
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
    const rowRect = rectOf(row);
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
      const rect = rectOf(marker);
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
      const textValue = elementText(row);
      if (countNotionModelTargets(textValue) !== 1) return;
      const id = notionModelIdFromText(textValue);
      if (!id || !notionRowLooksSelected(row)) return;
      seenRows.add(row);
      rows.push({ element: row, id, score: scoreNotionItem(row, id) });
    };
    for (const element of visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
    for (const element of visibleSelectorElements(["div", "span", "button", "svg"], root)) add(element);
    rows.sort((a, b) => b.score - a.score);
    return rows[0]?.id || "";
  }

  function currentNotionModelId(trigger = null) {
    const selected = selectedNotionModelId(notionMenuRoot(trigger));
    if (selected) return selected;
    const triggerElement = trigger && visible(trigger) ? trigger : findNotionTrigger();
    return notionModelIdFromText(elementText(triggerElement));
  }

  async function waitNotionReadableCurrent(trigger = null, timeoutMs = 2200) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() <= deadline) {
      const current = currentNotionModelId(trigger);
      if (current) return current;
      await sleep(120);
    }
    return currentNotionModelId(trigger);
  }

  async function closeNotionMenu(trigger = null) {
    const getRoot = () => notionMenuRoot(trigger);
    if (!getRoot()) return true;
    if (await closeFloatingMenuAndWait(getRoot, 900)) return true;
    const activeTrigger = trigger && visible(trigger) ? trigger : findNotionTrigger();
    if (activeTrigger && getRoot() && clickElement(activeTrigger)) {
      await sleep(160);
      if (!getRoot()) return true;
    }
    const composer = findNotionComposerRoot();
    if (composer && getRoot() && clickElement(composer)) {
      await sleep(160);
      if (!getRoot()) return true;
    }
    return closeFloatingMenuAndWait(getRoot, 500);
  }

  async function waitNotionSettled(modelId, trigger) {
    const deadline = Date.now() + 3000;
    while (Date.now() <= deadline) {
      const current = currentNotionModelId(trigger);
      if (current && current === modelId) return true;
      await sleep(120);
    }
    const final = currentNotionModelId(trigger);
    return final === modelId;
  }

  async function applyNotion(modelId) {
    if (!NOTION_MODEL_TARGETS[modelId]) return result(false, "NotionAI", modelId, "unknown model");
    if ((await waitNotionReadableCurrent(null, 1600)) === modelId) {
      const menuClosed = await closeNotionMenu();
      return result(true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const trigger = await waitFor(findNotionTrigger, 10000, 150);
    if (!trigger) {
      await closeNotionMenu();
      return result(false, "NotionAI", modelId, "model trigger not found");
    }
    if ((await waitNotionReadableCurrent(trigger, 2200)) === modelId) {
      const menuClosed = await closeNotionMenu(trigger);
      return result(true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const root = await openNotionMenu(trigger);
    if (!root) {
      await closeNotionMenu(trigger);
      return result(false, "NotionAI", modelId, "model menu not found");
    }
    if (currentNotionModelId(trigger) === modelId) {
      const menuClosed = await closeNotionMenu(trigger);
      return result(true, "NotionAI", modelId, "", { skipped: true, menuClosed });
    }
    const item = findNotionItem(root, modelId);
    if (!item) {
      await closeNotionMenu(trigger);
      return result(false, "NotionAI", modelId, "target model item not found");
    }
    let clicked = clickElement(item);
    let settled = clicked ? await waitNotionSettled(modelId, trigger) : false;
    if (!settled && !clicked) {
      const retryRoot = notionMenuRoot(trigger) || root;
      const pointTarget = retryRoot ? findNotionPointTarget(item, retryRoot, modelId) : null;
      if (pointTarget && pointTarget !== item && clickElement(pointTarget)) {
        clicked = true;
        settled = await waitNotionSettled(modelId, trigger);
      }
    }
    const menuClosed = await closeNotionMenu(trigger);
    if (!settled && currentNotionModelId(trigger) === modelId) settled = true;
    if (!clicked) return result(false, "NotionAI", modelId, "target model item could not be clicked", { menuClosed });
    return settled
      ? result(true, "NotionAI", modelId, "", { menuClosed })
      : result(false, "NotionAI", modelId, "selection did not settle", { menuClosed });
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
    const token = alnumToken(value);
    if (!token) return "";
    if (token.includes("instant")) return "instant";
    if (token.includes("expert")) return "expert";
    if (token.includes("vision")) return "vision";
    return "";
  }

  function deepSeekModeIdCount(value) {
    const token = alnumToken(value);
    if (!token) return 0;
    return ["instant", "expert", "vision"].reduce((count, id) => count + (token.includes(id) ? 1 : 0), 0);
  }

  function deepSeekCandidateText(element) {
    if (!element) return "";
    return [
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("aria-valuetext"),
      element.getAttribute?.("title"),
      element.getAttribute?.("data-testid"),
      element.getAttribute?.("data-value"),
      element.getAttribute?.("value"),
      elementText(element),
      element.value
    ].filter(Boolean).join(" ");
  }

  function deepSeekElementLooksSelected(element) {
    if (!element) return false;
    if (element.checked) return true;
    for (const attr of ["aria-checked", "aria-selected", "aria-current", "aria-pressed", "data-state", "data-selected", "data-active", "data-checked"]) {
      const value = String(element.getAttribute?.(attr) || "").trim().toLowerCase();
      if (value === "true" || value === "checked" || value === "selected" || value === "active" || value === "page" || value === "on") return true;
    }
    const className = String(element.className || "");
    return /\b(?:active|selected|checked)\b/i.test(className) && !/\b(?:inactive|unselected|unchecked)\b/i.test(className);
  }

  function deepSeekClickableElement(element) {
    return closest(element, "button, [role='radio'], [role='tab'], [role='button'], label, input[type='radio']") || element;
  }

  function deepSeekCandidates() {
    const seen = new Set();
    const candidates = [];
    for (const element of visibleSelectorElements(DEEPSEEK_MODE_SELECTORS)) {
      if (!element || !visible(element) || isDisabledElement(element)) continue;
      const textValue = deepSeekCandidateText(element);
      if (!deepSeekModeIdFromText(textValue) || deepSeekModeIdCount(textValue) !== 1) continue;
      const clickable = deepSeekClickableElement(element);
      if (!clickable || seen.has(clickable) || !visible(clickable) || isDisabledElement(clickable)) continue;
      const clickableText = deepSeekCandidateText(clickable);
      if (!deepSeekModeIdFromText(clickableText) || deepSeekModeIdCount(clickableText) !== 1) continue;
      seen.add(clickable);
      candidates.push(clickable);
    }
    candidates.sort((a, b) => {
      const ar = rectOf(a);
      const br = rectOf(b);
      if (ar && br) return ar.top - br.top || ar.left - br.left;
      return 0;
    });
    return candidates;
  }

  function currentDeepSeekModeId() {
    const selected = deepSeekCandidates().find((element) => deepSeekElementLooksSelected(element));
    const selectedId = deepSeekModeIdFromText(deepSeekCandidateText(selected));
    if (selectedId) return selectedId;
    const heading = visibleSelectorElements("h1, h2, h3, [role='heading']")
      .map((element) => elementText(element))
      .find((value) => /start chatting with/i.test(String(value || "")));
    return deepSeekModeIdFromText(heading);
  }

  function findDeepSeekTarget(modeId) {
    if (!DEEPSEEK_MODE_TARGETS[modeId]) return null;
    const matches = deepSeekCandidates()
      .filter((element) => deepSeekModeIdFromText(deepSeekCandidateText(element)) === modeId)
      .map((element) => ({
        element,
        rect: rectOf(element),
        text: deepSeekCandidateText(element)
      }))
      .filter((item) => item.rect && item.rect.width >= 20 && item.rect.height >= 16);
    matches.sort((a, b) => {
      const aExact = alnumToken(a.text) === modeId ? 1 : 0;
      const bExact = alnumToken(b.text) === modeId ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return a.rect.top - b.rect.top || a.rect.left - b.rect.left;
    });
    return matches[0]?.element || null;
  }

  function dispatchDeepSeekMouseClick(target) {
    if (!target) return false;
    const point = centerPoint(target);
    const MouseEventCtor = eventConstructor("MouseEvent", target);
    if (!point || typeof MouseEventCtor !== "function") return false;
    const view = eventView(target);
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
      elementFromPoint(centerPoint(element), element),
      deepSeekClickableElement(element)
    ].filter(Boolean);
    const seen = new Set();
    for (const target of targets) {
      if (!target || seen.has(target) || !visible(target) || isDisabledElement(target)) continue;
      seen.add(target);
      if (nativeClick(target)) return true;
      const clicked = dispatchDeepSeekMouseClick(target);
      if (clicked) {
        recordActivation(target, "deepseek-mouse-sequence");
        return true;
      }
    }
    return false;
  }

  async function waitDeepSeekSettled(modeId) {
    const deadline = Date.now() + 2500;
    while (Date.now() <= deadline) {
      if (currentDeepSeekModeId() === modeId) return true;
      await sleep(100);
    }
    return currentDeepSeekModeId() === modeId;
  }

  async function applyDeepSeek(modelId) {
    if (!DEEPSEEK_MODE_TARGETS[modelId]) return result(false, "DeepSeek", modelId, "unknown mode");
    const current = await waitFor(currentDeepSeekModeId, 10000, 150);
    if (current === modelId) return result(true, "DeepSeek", modelId, "", { skipped: true });
    const target = await waitFor(() => findDeepSeekTarget(modelId), 10000, 150);
    if (!target) {
      return result(false, "DeepSeek", modelId, "target mode not found", {
        candidates: deepSeekCandidates().map((element) => deepSeekCandidateText(element))
      });
    }
    if (!clickDeepSeekMode(target)) return result(false, "DeepSeek", modelId, "target mode could not be clicked");
    return (await waitDeepSeekSettled(modelId))
      ? result(true, "DeepSeek", modelId)
      : result(false, "DeepSeek", modelId, "selection did not settle", { current: currentDeepSeekModeId() });
  }

  async function apply(appIdOrModelId, maybeModelId, maybeOptions = {}) {
    const inferredAppId = inferAppId();
    const appId = normalizeAppId(maybeModelId ? appIdOrModelId : inferredAppId);
    const modelId = String(maybeModelId || appIdOrModelId || "").trim();
    const options = maybeOptions && typeof maybeOptions === "object" ? maybeOptions : {};
    if (!appId || !TARGETS[appId]) throw new Error(`Unknown app. Pass one of: ${Object.keys(TARGETS).join(", ")}`);
    if (!TARGETS[appId].includes(modelId)) throw new Error(`Unknown ${appId} model "${modelId}". Valid values: ${TARGETS[appId].join(", ")}`);
    if (appId === "Gemini") return applyGemini(modelId, options);
    if (appId === "Grok") return applyGrok(modelId);
    if (appId === "DeepSeek") return applyDeepSeek(modelId);
    if (appId === "NotionAI") return applyNotion(modelId);
    return result(false, appId, modelId, "unsupported app");
  }

  function inspect(appId = inferAppId()) {
    const normalizedApp = normalizeAppId(appId);
    if (normalizedApp === "Gemini") {
      const trigger = firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS);
      const root = geminiMenuRoot();
      return {
        appId: normalizedApp,
        current: currentGeminiModelKey(),
        thinkingLevel: currentGeminiPickerState().thinkingLevel,
        triggerText: elementText(trigger),
        menuOpen: Boolean(root),
        extendedToggle: root ? (() => {
          const item = findGeminiExtendedToggle(root);
          return item
            ? { found: true, selected: geminiElementHasSelectedState(item), tag: String(item.tagName || ""), text: elementText(item) }
            : { found: false, selected: false, tag: "", text: "" };
        })() : { found: false, selected: false, tag: "", text: "" },
        menuItems: root ? geminiItems(root).map((item) => ({
          tag: String(item.tagName || ""),
          selected: geminiElementHasSelectedState(item),
          text: elementText(item)
        })).slice(0, 20) : []
      };
    }
    if (normalizedApp === "Grok") {
      const trigger = findGrokTrigger();
      const root = grokMenuRoot(trigger);
      return {
        appId: normalizedApp,
        current: currentGrokModelId(),
        triggerText: elementText(trigger),
        menuOpen: Boolean(root),
        menuItems: root ? grokItems(root).map((item) => {
          const id = grokModelIdFromText(grokModelItemText(item));
          return {
            id,
            text: elementText(item),
            unavailable: Boolean(id && grokModelItemLooksUnavailable(item, id))
          };
        }).slice(0, 20) : []
      };
    }
    if (normalizedApp === "DeepSeek") {
      return {
        appId: normalizedApp,
        current: currentDeepSeekModeId(),
        candidates: deepSeekCandidates().map((element) => ({
          text: elementText(element),
          selected: deepSeekElementLooksSelected(element),
          tag: element.tagName,
          role: element.getAttribute?.("role") || ""
        }))
      };
    }
    if (normalizedApp === "NotionAI") {
      const trigger = findNotionTrigger();
      const root = notionMenuRoot(trigger);
      return {
        appId: normalizedApp,
        current: currentNotionModelId(),
        triggerText: elementText(trigger),
        menuOpen: Boolean(root),
        composerFound: Boolean(findNotionComposerRoot()),
        menuItems: root ? visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root).map((item) => elementText(item)).slice(0, 20) : []
      };
    }
    return { appId: normalizedApp || "", inferredAppId: inferAppId(), supported: false };
  }

  function help() {
    return [
      "ChatClubPreferredModelTest is ready. This is a standalone DOM adapter test; it does not call the ChatClub plugin.",
      "Examples:",
      "  await ChatClubPreferredModelTest.apply('pro')",
      "  await ChatClubPreferredModelTest.apply('Gemini', 'pro', { thinkingLevel: 'extended' })",
      "  await ChatClubPreferredModelTest.apply('Grok', 'grok43')",
      "  await ChatClubPreferredModelTest.apply('DeepSeek', 'expert')",
      "  await ChatClubPreferredModelTest.apply('NotionAI', 'gpt55')",
      "  ChatClubPreferredModelTest.inspect()",
      "  ChatClubPreferredModelTest.diagnostics()",
      "  ChatClubPreferredModelTest.resetDiagnostics()"
    ].join("\n");
  }

  function dispose() {
    document.removeEventListener("click", diagnosticListeners.click, true);
    document.removeEventListener("focusin", diagnosticListeners.focusin, true);
    document.removeEventListener("focusout", diagnosticListeners.focusout, true);
    document.removeEventListener("blur", diagnosticListeners.blur, true);
    document.removeEventListener("compositionstart", diagnosticListeners.compositionstart, true);
    document.removeEventListener("compositionend", diagnosticListeners.compositionend, true);
  }

  window[API_NAME] = Object.freeze({
    apply,
    diagnostics: diagnosticSnapshot,
    dispose,
    help,
    inferAppId,
    inspect,
    resetDiagnostics,
    targets: TARGETS
  });
  console.log(help());
})();
