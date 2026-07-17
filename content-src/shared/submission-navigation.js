// eslint-disable-next-line chatclub-realm/no-cross-realm-global -- explicit injectable DOM-global default keeps navigation tests hermetic.
export function createSubmissionNavigationTracker(target = globalThis, now = () => Date.now()) {
  let activeSubmissionNavigation = null;

  const normalize = (value = {}) => {
    const sendId = String(value?.sendId || "").trim();
    if (!sendId) return null;
    const activatedAt = Math.max(0, Number(value?.activatedAt) || now());
    return {
      sendId,
      appId: String(value?.appId || "").trim(),
      initialHref: String(value?.initialHref || target.location?.href || ""),
      activatedAt,
      expiresAt: Math.max(activatedAt + 15000, Number(value?.expiresAt) || 0),
      method: String(value?.method || "submit")
    };
  };

  const mark = (data = {}, method = "submit") => {
    const activatedAt = now();
    const deadlineAt = Math.max(0, Number(data?.deadlineAt) || 0);
    const next = normalize({
      sendId: data?.sendId,
      appId: data?.appId || data?.appName,
      initialHref: target.location?.href || "",
      activatedAt,
      expiresAt: Math.max(
        activatedAt + 15000,
        deadlineAt > activatedAt ? deadlineAt + 15000 : 0
      ),
      method
    });
    if (!next) return null;
    activeSubmissionNavigation = next;
    target.__CHATCLUB_ACTIVE_SUBMISSION_NAVIGATION__ = next;
    return next;
  };

  const clear = () => {
    activeSubmissionNavigation = null;
    delete target.__CHATCLUB_ACTIVE_SUBMISSION_NAVIGATION__;
  };

  const current = (kind = "") => {
    const navigationKind = String(kind || "navigation");
    if (navigationKind === "popstate" || navigationKind === "hashchange") return null;
    const candidate = activeSubmissionNavigation
      || normalize(target.__CHATCLUB_ACTIVE_SUBMISSION_NAVIGATION__ || {});
    if (!candidate || candidate.expiresAt < now()) {
      clear();
      return null;
    }
    activeSubmissionNavigation = candidate;
    return candidate;
  };

  const intentTarget = (value) => {
    const element = value?.nodeType === 1 ? value : value?.parentElement;
    if (!element?.closest) return null;
    const direct = element.closest("a[href], [role='link'], [role='tab']");
    if (direct) return direct;
    const control = element.closest("button, [role='button'], [role='menuitem']");
    if (!control) return null;
    const signal = [
      control.getAttribute?.("aria-label"),
      control.getAttribute?.("title"),
      control.getAttribute?.("data-testid"),
      control.getAttribute?.("data-action"),
      control.innerText || control.textContent || ""
    ].filter(Boolean).join(" ");
    return /\b(?:new\s+chat|new\s+conversation|conversation|thread|history|sidebar)\b|新建(?:聊天|对话|会话)|聊天记录|对话|会话|历史/i.test(signal)
      ? control
      : null;
  };

  const clearForTrustedIntent = (event) => {
    if (!event?.isTrusted || !current("trusted-intent")) return;
    const targetElement = intentTarget(event.target);
    const key = String(event.key || "");
    const keyboardNavigation = event.type === "keydown" && (
      (event.altKey && (key === "ArrowLeft" || key === "ArrowRight"))
      || ((event.metaKey || event.ctrlKey) && (key === "[" || key === "]"))
      || ((key === "Enter" || key === " ") && targetElement)
    );
    if (event.type === "pointerdown" ? targetElement : keyboardNavigation) clear();
  };

  return Object.freeze({
    mark,
    clear,
    current,
    clearForTrustedIntent
  });
}
