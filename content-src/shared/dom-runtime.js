export function isDisabledElement(el) {
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

export function createDomRuntime(deps = {}) {
  const {
    qsa,
    visible,
    normalize,
    closest,
    DELETE_CLICKABLE_SELECTOR,
    assertPreferredModelRun,
    armPreferredModelFocusShield,
    activateElement
  } = deps;
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
  return Object.freeze({
    isDisabledElement,
    visibleSelectorElements,
    firstVisibleBySelectors,
    modelElementText,
    compactModelText,
    alnumModelToken,
    modelTextIncludes,
    parseBooleanAttr,
    modelEventConstructor,
    modelRect,
    modelElementArea,
    modelRectInViewport,
    visibleInViewport,
    modelCenterPoint,
    modelElementFromPoint,
    modelClickableAncestor,
    modelCustomActivationAncestor,
    modelActivationTargets,
    dispatchPointerActivation,
    nativeModelClick,
    preferredModelActivate,
    preferredModelPointerActivate,
    modelClick,
    modelDirectClick
  });
}
