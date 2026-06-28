(() => {
  const API_NAME = "ChatClubPreferredModelTest";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  const normalize = (value) => String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const TARGETS = Object.freeze({
    Gemini: Object.freeze(["pro", "thinking", "extended", "fast"]),
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
    const payload = { ok, appId, modelId, ...(reason ? { reason } : {}), ...extra };
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
      add(clickableAncestor(pointTarget));
      add(pointTarget);
    }
    add(el);
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
    return dispatched;
  }

  function nativeClick(target) {
    if (!target || typeof target.click !== "function") return false;
    try {
      target.click();
      return true;
    } catch {
      return false;
    }
  }

  function clickElement(el) {
    if (!el || !visible(el) || isDisabledElement(el)) return false;
    try { el.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
    const point = centerPoint(el);
    let clicked = false;
    for (const target of activationTargets(el)) {
      try { target.focus?.({ preventScroll: true }); } catch {
        try { target.focus?.(); } catch {}
      }
      clicked = dispatchPointerActivation(target, point || centerPoint(target)) || clicked;
      clicked = nativeClick(target) || clicked;
      if (clicked) return true;
    }
    return clicked;
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

  const GEMINI_MODEL_TARGETS = Object.freeze({
    pro: Object.freeze({ id: "pro", textMatch: ["3.1 Pro", "Pro"] }),
    thinking: Object.freeze({ id: "thinking", textMatch: ["Thinking level", "Thinking"] }),
    extended: Object.freeze({ id: "extended", textMatch: ["Extended thinking", "Extended"] }),
    fast: Object.freeze({ id: "fast", textMatch: ["3 Flash", "3.1 Flash-Lite", "Fast", "Flash"] })
  });

  const GEMINI_MODEL_BUTTON_SELECTORS = Object.freeze([
    "button[aria-label='Open mode picker']",
    "bard-mode-switcher button[aria-label='Open mode picker']",
    "bard-mode-switcher button",
    "button[aria-label*='mode picker' i]",
    "button[aria-label*='model' i]"
  ]);
  const GEMINI_MODEL_MENU_ROOT_SELECTORS = Object.freeze([
    ".cdk-overlay-pane .gds-mode-switch-menu.mat-mdc-menu-panel",
    ".cdk-overlay-pane .mat-mdc-menu-panel[role='menu']",
    ".cdk-overlay-pane .mat-menu-panel[role='menu']",
    ".cdk-overlay-pane [role='menu']",
    ".mat-mdc-menu-panel[role='menu']",
    ".mat-menu-panel[role='menu']"
  ]);
  const GEMINI_MODEL_ITEM_SELECTORS = Object.freeze([
    "button.bard-mode-list-button[role='menuitemradio']",
    "button[role='menuitemradio']",
    "button[role='menuitem']",
    "button[aria-haspopup='menu']",
    "button[mat-menu-item]",
    "button.mat-mdc-menu-item",
    "[role='menuitemradio']",
    "[role='menuitem']"
  ]);

  function inferGeminiModelKey(value) {
    const token = compactText(value);
    if (!token) return "";
    if (/(^|[^a-z0-9])extended\s+thinking([^a-z0-9]|$)/.test(token)) return "extended";
    if (/(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token)) return "extended";
    if (/(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token)) return "pro";
    if (/(^|[^a-z0-9])thinking\s+level([^a-z0-9]|$)/.test(token)) return "thinking";
    if (/(^|[^a-z0-9])3\s*flash([^a-z0-9]|$)/.test(token)) return "fast";
    if (["pro", "thinking", "extended", "fast"].includes(token)) return token;
    if (/(^|[^a-z0-9])pro([^a-z0-9]|$)/.test(token)) return "pro";
    if (/(^|[^a-z0-9])thinking([^a-z0-9]|$)/.test(token)) return "thinking";
    if (/(^|[^a-z0-9])fast([^a-z0-9]|$)/.test(token) || /(^|[^a-z0-9])flash([^a-z0-9]|$)/.test(token)) return "fast";
    return "";
  }

  function currentGeminiModelKey() {
    return inferGeminiModelKey(elementText(firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS)));
  }

  function geminiMenuRoot() {
    return firstVisibleBySelectors(GEMINI_MODEL_MENU_ROOT_SELECTORS, { last: true });
  }

  async function openGeminiMenu() {
    const existing = geminiMenuRoot();
    if (existing) return existing;
    const trigger = await waitFor(() => firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS), 10000, 150);
    if (!trigger) return null;
    if (!clickElement(trigger)) return null;
    await sleep(120);
    return waitFor(geminiMenuRoot, 3000, 120);
  }

  function geminiItems(root) {
    return visibleSelectorElements(GEMINI_MODEL_ITEM_SELECTORS, root).filter((item) => !isDisabledElement(item));
  }

  function findGeminiItem(root, target) {
    for (const needle of target?.textMatch || []) {
      const found = geminiItems(root).find((item) => textIncludes(elementText(item), needle));
      if (found) return found;
    }
    return null;
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

  async function waitGeminiSettled(modelId) {
    const deadline = Date.now() + 2200;
    while (Date.now() <= deadline) {
      const current = currentGeminiModelKey();
      if (current && current === modelId) return true;
      if (modelId === "extended" && !geminiMenuRoot()) return true;
      if (!geminiMenuRoot() && !current) return true;
      await sleep(120);
    }
    const final = currentGeminiModelKey();
    return modelId === "extended" && !geminiMenuRoot() ? true : (final ? final === modelId : !geminiMenuRoot());
  }

  async function applyGemini(modelId) {
    const target = GEMINI_MODEL_TARGETS[modelId];
    if (!target) return result(false, "Gemini", modelId, "unknown model");
    if (currentGeminiModelKey() === modelId) return result(true, "Gemini", modelId, "", { skipped: true });
    let root = await openGeminiMenu();
    if (!root) return result(false, "Gemini", modelId, "model menu not found");
    let item = findGeminiItem(root, target);
    if (!item && modelId === "extended") {
      const thinking = geminiItems(root).find(isGeminiThinkingSubmenuItem);
      if (thinking && clickElement(thinking)) {
        await sleep(160);
        root = geminiMenuRoot() || root;
        item = findGeminiItem(root, target);
      }
    }
    if (!item) return result(false, "Gemini", modelId, "target model item not found");
    if (!clickElement(item)) return result(false, "Gemini", modelId, "target model item could not be clicked");
    return (await waitGeminiSettled(modelId))
      ? result(true, "Gemini", modelId)
      : result(false, "Gemini", modelId, "selection did not settle");
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
    for (const { element: trigger } of grokTriggerCandidates().slice(0, 6)) {
      if (!clickElement(trigger)) continue;
      await sleep(140);
      const root = await waitFor(() => grokMenuRoot(trigger), 900, 90);
      if (root) return root;
      closeFloatingMenu();
      await sleep(80);
    }
    return null;
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

  function findGrokItem(root, modelId) {
    const target = GROK_MODEL_TARGETS[modelId];
    if (!target) return null;
    const matchesTarget = (element) => grokTextLooksLikeTarget(elementText(element), target);
    for (const item of grokItems(root)) {
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
    const item = findGrokItem(root, modelId);
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
    if (!settled) {
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
    let clicked = false;
    const seen = new Set();
    for (const target of targets) {
      if (!target || seen.has(target) || !visible(target) || isDisabledElement(target)) continue;
      seen.add(target);
      try { target.focus?.({ preventScroll: true }); } catch {
        try { target.focus?.(); } catch {}
      }
      clicked = nativeClick(target) || clicked;
      clicked = dispatchDeepSeekMouseClick(target) || clicked;
    }
    return clicked;
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

  async function apply(appIdOrModelId, maybeModelId) {
    const inferredAppId = inferAppId();
    const appId = normalizeAppId(maybeModelId ? appIdOrModelId : inferredAppId);
    const modelId = String(maybeModelId || appIdOrModelId || "").trim();
    if (!appId || !TARGETS[appId]) throw new Error(`Unknown app. Pass one of: ${Object.keys(TARGETS).join(", ")}`);
    if (!TARGETS[appId].includes(modelId)) throw new Error(`Unknown ${appId} model "${modelId}". Valid values: ${TARGETS[appId].join(", ")}`);
    if (appId === "Gemini") return applyGemini(modelId);
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
        triggerText: elementText(trigger),
        menuOpen: Boolean(root),
        menuItems: root ? geminiItems(root).map((item) => elementText(item)).slice(0, 20) : []
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
        menuItems: root ? grokItems(root).map((item) => elementText(item)).slice(0, 20) : []
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
      "  await ChatClubPreferredModelTest.apply('Gemini', 'extended')",
      "  await ChatClubPreferredModelTest.apply('Grok', 'grok43')",
      "  await ChatClubPreferredModelTest.apply('DeepSeek', 'expert')",
      "  await ChatClubPreferredModelTest.apply('NotionAI', 'gpt55')",
      "  ChatClubPreferredModelTest.inspect()"
    ].join("\n");
  }

  window[API_NAME] = Object.freeze({
    apply,
    help,
    inferAppId,
    inspect,
    targets: TARGETS
  });
  console.log(help());
})();
