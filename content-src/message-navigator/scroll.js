function scrollParent(element) {
  for (let node = element?.parentElement; node && node !== document.body; node = node.parentElement) {
    try {
      const style = getComputedStyle(node);
      if (/(auto|scroll|overlay)/i.test(`${style.overflowY} ${style.overflow}`) && node.scrollHeight > node.clientHeight + 24) return node;
    } catch {}
  }
  return document.scrollingElement || document.documentElement;
}

function scrollerRect(scroller) {
  if (!scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
    return { top: 0, height: window.innerHeight };
  }
  try {
    const rect = scroller.getBoundingClientRect();
    return { top: rect.top, height: rect.height };
  } catch {
    return { top: 0, height: window.innerHeight };
  }
}

function scrollerTop(scroller) {
  if (!scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }
  return scroller.scrollTop;
}

function scrollToTop(scroller, top) {
  if (!scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
    window.scrollTo({ top, behavior: "smooth" });
    return;
  }
  try {
    scroller.scrollTo({ top, behavior: "smooth" });
  } catch {
    scroller.scrollTop = top;
  }
}

function rolePrefix(role) {
  if (role === "user") return "Q";
  if (role === "thinking") return "T";
  return "A";
}

export {
  rolePrefix,
  scrollParent,
  scrollToTop,
  scrollerRect,
  scrollerTop
};
