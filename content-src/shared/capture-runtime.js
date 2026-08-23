const CAPTURE_OVERLAP_PX = 2;

function number(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function styleOf(node, win) {
  try {
    return win.getComputedStyle(node);
  } catch {
    return null;
  }
}

function isScrollableOverflow(value) {
  return value === "auto" || value === "scroll" || value === "overlay";
}

export function createCaptureRuntime(targetWindow) {
  if (!targetWindow?.document) throw new TypeError("Capture runtime requires a window");
  let session = null;

  function doc() {
    return targetWindow.document;
  }

  function scrollingElement() {
    const documentRef = doc();
    return documentRef.scrollingElement || documentRef.documentElement || documentRef.body;
  }

  function findScrollRoot() {
    const documentRef = doc();
    const root = scrollingElement();
    const viewportHeight = Math.max(1, Math.floor(number(targetWindow.innerHeight, root?.clientHeight)));
    if (root && number(root.scrollHeight) > viewportHeight + 24) {
      return { type: "window", node: root };
    }
    const viewportWidth = Math.max(1, Math.floor(number(targetWindow.innerWidth, root?.clientWidth)));
    const candidates = documentRef.querySelectorAll("main, section, article, div, [role='log'], [role='main']");
    let best = null;
    let bestScore = 0;
    for (const node of candidates) {
      const style = styleOf(node, targetWindow);
      if (!style || !isScrollableOverflow(style.overflowY)) continue;
      const extra = number(node.scrollHeight) - number(node.clientHeight);
      if (extra < 48) continue;
      const rect = node.getBoundingClientRect?.() || { width: 0, height: 0 };
      const visible = Math.max(0, number(rect.width)) * Math.max(0, number(rect.height));
      const score = extra * Math.min(visible, viewportWidth * viewportHeight);
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best ? { type: "element", node: best } : { type: "window", node: root };
  }

  function metricsFor(root) {
    const node = root?.node || scrollingElement();
    const isWindow = root?.type !== "element";
    const viewportHeight = Math.max(1, Math.floor(isWindow
      ? number(targetWindow.innerHeight, node?.clientHeight)
      : number(node?.clientHeight)));
    const viewportWidth = Math.max(1, Math.floor(isWindow
      ? number(targetWindow.innerWidth, node?.clientWidth)
      : number(node?.clientWidth)));
    const scrollHeight = Math.max(viewportHeight, Math.floor(number(node?.scrollHeight, viewportHeight)));
    const scrollWidth = Math.max(viewportWidth, Math.floor(number(node?.scrollWidth, viewportWidth)));
    const scrollY = Math.max(0, Math.floor(isWindow
      ? number(targetWindow.scrollY, node?.scrollTop)
      : number(node?.scrollTop)));
    const scrollX = Math.max(0, Math.floor(isWindow
      ? number(targetWindow.scrollX, node?.scrollLeft)
      : number(node?.scrollLeft)));
    const maxY = Math.max(0, scrollHeight - viewportHeight);
    return {
      viewportHeight,
      viewportWidth,
      scrollHeight,
      scrollWidth,
      scrollX,
      scrollY,
      maxY,
      devicePixelRatio: number(targetWindow.devicePixelRatio, 1) || 1,
      overlapPx: CAPTURE_OVERLAP_PX,
      done: scrollY >= maxY - 1
    };
  }

  function setScroll(root, x, y) {
    if (root?.type === "element" && root.node) {
      root.node.scrollLeft = x;
      root.node.scrollTop = y;
      return;
    }
    if (typeof targetWindow.scrollTo === "function") {
      targetWindow.scrollTo(x, y);
      return;
    }
    const node = root?.node || scrollingElement();
    if (node) {
      node.scrollLeft = x;
      node.scrollTop = y;
    }
  }

  function hideOverlays() {
    const documentRef = doc();
    const viewportHeight = Math.max(1, Math.floor(number(targetWindow.innerHeight)));
    const viewportWidth = Math.max(1, Math.floor(number(targetWindow.innerWidth)));
    const hidden = [];
    const nodes = documentRef.querySelectorAll("body *");
    for (const node of nodes) {
      const style = styleOf(node, targetWindow);
      if (!style) continue;
      if (style.position !== "fixed" && style.position !== "sticky") continue;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) continue;
      if (rect.height >= viewportHeight * 0.86 && rect.width >= viewportWidth * 0.55) continue;
      hidden.push({ node, visibility: node.style.visibility });
      node.style.setProperty("visibility", "hidden", "important");
    }
    return hidden;
  }

  function restoreOverlays(hidden) {
    for (const item of hidden || []) {
      try {
        if (!item?.node?.style) continue;
        if (item.visibility) item.node.style.visibility = item.visibility;
        else item.node.style.removeProperty("visibility");
      } catch {}
    }
  }

  function captureStart() {
    captureEnd();
    const root = findScrollRoot();
    const current = metricsFor(root);
    session = {
      root,
      scrollX: current.scrollX,
      scrollY: current.scrollY,
      hidden: hideOverlays()
    };
    setScroll(root, 0, 0);
    return metricsFor(root);
  }

  function triggerScroll() {
    if (!session) return { ...metricsFor(findScrollRoot()), done: true };
    const current = metricsFor(session.root);
    const step = Math.max(1, current.viewportHeight - CAPTURE_OVERLAP_PX);
    const nextY = Math.min(current.maxY, current.scrollY + step);
    setScroll(session.root, current.scrollX, nextY);
    return { ...metricsFor(session.root), done: nextY >= current.maxY || nextY === current.scrollY };
  }

  function captureEnd() {
    if (!session) return { restored: false };
    restoreOverlays(session.hidden);
    setScroll(session.root, session.scrollX, session.scrollY);
    session = null;
    return { restored: true };
  }

  return Object.freeze({
    captureStart,
    triggerScroll,
    captureEnd,
    overlapPx: CAPTURE_OVERLAP_PX
  });
}
