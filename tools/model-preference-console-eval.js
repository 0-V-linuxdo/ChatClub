(() => {
  const API_NAME = "ChatClubDeepSeekModeTest";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  const TARGETS = Object.freeze({
    instant: Object.freeze({ id: "instant", label: "Instant", aliases: ["Instant"] }),
    expert: Object.freeze({ id: "expert", label: "Expert", aliases: ["Expert"] }),
    vision: Object.freeze({ id: "vision", label: "Vision", aliases: ["Vision"] })
  });

  function normalize(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function visible(el) {
    if (!el?.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0;
  }

  function text(el) {
    if (!el) return "";
    return normalize([
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("aria-valuetext"),
      el.getAttribute?.("title"),
      el.getAttribute?.("data-testid"),
      el.getAttribute?.("value"),
      el.innerText || el.textContent || "",
      el.value
    ].filter(Boolean).join(" "));
  }

  function token(value) {
    return normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function modeFromText(value) {
    const valueToken = token(value);
    if (!valueToken) return "";
    if (valueToken.includes("instant")) return "instant";
    if (valueToken.includes("expert")) return "expert";
    if (valueToken.includes("vision")) return "vision";
    return "";
  }

  function selected(el) {
    if (!el) return false;
    if (el.checked) return true;
    for (const attr of ["aria-checked", "aria-selected", "aria-current", "data-state", "data-selected", "data-active"]) {
      const value = String(el.getAttribute?.(attr) || "").trim().toLowerCase();
      if (value === "true" || value === "checked" || value === "selected" || value === "active" || value === "page") return true;
    }
    const className = String(el.className || "");
    return /\b(?:active|selected|checked)\b/i.test(className) && !/\b(?:inactive|unselected|unchecked)\b/i.test(className);
  }

  function candidates() {
    const selector = [
      "button",
      "[role='radio']",
      "[role='tab']",
      "[role='button']",
      "input[type='radio']",
      "label",
      "[aria-label]",
      "[data-testid]"
    ].join(", ");
    const seen = new Set();
    return Array.from(document.querySelectorAll(selector))
      .filter((el) => {
        if (!visible(el) || seen.has(el)) return false;
        seen.add(el);
        return Boolean(modeFromText(text(el)));
      });
  }

  function currentMode() {
    const selectedItem = candidates().find((el) => selected(el));
    const selectedId = modeFromText(text(selectedItem));
    if (selectedId) return selectedId;
    const heading = Array.from(document.querySelectorAll("h1,h2,h3,[role='heading']"))
      .map((el) => text(el))
      .find((value) => /start chatting with/i.test(value));
    return modeFromText(heading);
  }

  function click(el) {
    if (!el || !visible(el)) return false;
    try { el.scrollIntoView({ block: "center", inline: "nearest" }); } catch {}
    const rect = el.getBoundingClientRect();
    const x = Math.max(1, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(1, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
    const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0 };
    try { el.click?.(); } catch {}
    for (const type of ["mouseover", "mousemove", "mousedown", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, type.includes("down") ? { ...opts, buttons: 1 } : opts));
    }
    return true;
  }

  async function waitSettled(modeId) {
    const deadline = Date.now() + 2500;
    while (Date.now() <= deadline) {
      if (currentMode() === modeId) return true;
      await sleep(100);
    }
    return currentMode() === modeId;
  }

  async function apply(modeId) {
    if (!TARGETS[modeId]) return { ok: false, appId: "DeepSeek", modelId: modeId, reason: "unknown mode" };
    if (currentMode() === modeId) return { ok: true, appId: "DeepSeek", modelId: modeId, skipped: true };
    const item = candidates().find((el) => modeFromText(text(el)) === modeId);
    if (!item) return { ok: false, appId: "DeepSeek", modelId: modeId, reason: "target mode not found", candidates: candidates().map(text) };
    if (!click(item)) return { ok: false, appId: "DeepSeek", modelId: modeId, reason: "target mode could not be clicked" };
    return (await waitSettled(modeId))
      ? { ok: true, appId: "DeepSeek", modelId: modeId }
      : { ok: false, appId: "DeepSeek", modelId: modeId, reason: "selection did not settle", current: currentMode() };
  }

  function inspect() {
    return {
      appId: "DeepSeek",
      current: currentMode(),
      candidates: candidates().map((el) => ({ text: text(el), selected: selected(el), tag: el.tagName, role: el.getAttribute("role") }))
    };
  }

  window[API_NAME] = Object.freeze({ apply, inspect, targets: TARGETS });
  console.log(`${API_NAME} ready. Try: ${API_NAME}.inspect(); await ${API_NAME}.apply("expert")`);
})();
