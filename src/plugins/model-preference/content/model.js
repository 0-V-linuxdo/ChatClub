// Preferred model inside a chat iframe (v2 05 §5): open the site's model menu, pick the option whose label
// names the target, and read it back. Retries only while nothing was clicked yet (05 §5.4).
const cc = globalThis.__chatclub;
if (cc && !cc.has("preferred-model")) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sels = (v) => [].concat(v ?? []).filter((s) => typeof s === "string" && s.trim()).join(", ");
  const qsa = (sel, root = document) => {
    if (!sel) return [];
    try {
      return [...root.querySelectorAll(sel)];
    } catch {
      return [];
    }
  };
  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s_]+/g, " ").replace(/[^\p{L}\p{N} .-]/gu, "").trim();
  const labelOf = (el) => norm(el?.getAttribute?.("aria-label") || el?.innerText || el?.textContent || "");
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const score = (aliases, text) => {
    const label = norm(text);
    let best = 0;
    for (const a of aliases ?? []) {
      const alias = norm(a);
      if (!alias || !label) continue;
      if (label === alias) best = Math.max(best, 3 + alias.length / 100);
      else if (new RegExp(`(^|[^\\p{L}\\p{N}.])${escapeRe(alias)}($|[^\\p{L}\\p{N}])`, "u").test(label)) best = Math.max(best, 2 + alias.length / 100);
    }
    return best;
  };
  const waitFor = async (fn, ms, step = 80) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() >= end) return null;
      await sleep(step);
    }
  };
  const click = (el) => {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...o, pointerType: "mouse", isPrimary: true, buttons: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown", { ...o, buttons: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { ...o, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mouseup", o));
    el.click();
  };
  const isOn = (el) => {
    const v = el.getAttribute("aria-checked") ?? el.getAttribute("aria-selected") ?? el.getAttribute("aria-pressed") ?? el.getAttribute("data-state");
    if (v === "true" || v === "checked" || v === "on" || v === "active") return true;
    if (el.getAttribute("aria-current") === "true") return true;
    return /\b(selected|is-selected|active|checked)\b/.test(String(el.className || "")) || !!el.querySelector("[aria-checked='true'], [data-state='checked'], input:checked");
  };

  let cancelled = false;

  const trigger = (site) => qsa(sels(site.trigger)).find(visible) ?? null;
  const menu = (site) => qsa(sels(site.menuRoot) || "[role='menu'], [role='listbox']").filter(visible).pop() ?? null;
  const options = (site, root) => qsa(sels(site.option) || "[role='menuitem'], [role='menuitemradio'], [role='option']", root).filter(visible);
  const closeMenu = async (site) => {
    if (!menu(site)) return;
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
    if (await waitFor(() => !menu(site), 500)) return;
    const tr = trigger(site);
    if (tr && menu(site)) click(tr);
    await waitFor(() => !menu(site), 500);
  };
  const openMenu = async (site) => {
    if (menu(site)) return menu(site);
    const tr = trigger(site);
    if (!tr) return null;
    click(tr);
    return waitFor(() => menu(site), 1500);
  };
  const best = (list, aliases) => {
    let hit = null;
    let top = 1.5;
    for (const el of list) {
      const s = score(aliases, el.innerText || el.textContent || el.getAttribute("aria-label"));
      if (s > top) {
        top = s;
        hit = el;
      }
    }
    return hit;
  };
  const readBack = (site, target) => {
    const tr = trigger(site);
    return !!tr && score(target.aliases, labelOf(tr)) >= 2;
  };

  /** One attempt; `interacted` says whether an option was clicked (no retries after that). */
  const attempt = async (site, target) => {
    const tr = trigger(site);
    if (!tr) return { done: false, interacted: false, reason: "no-menu" };
    if (!site.alwaysOpen && readBack(site, target)) return { done: true, status: "already" };
    const root = await openMenu(site);
    if (!root) return { done: false, interacted: false, reason: "menu-did-not-open" };
    const option = best(options(site, root), target.aliases);
    if (!option) {
      await closeMenu(site);
      return { done: false, interacted: false, reason: "not-found", safe: true };
    }
    if (isOn(option)) {
      await closeMenu(site);
      return { done: true, status: "already" };
    }
    if (option.getAttribute("aria-disabled") === "true" || option.hasAttribute("disabled")) {
      await closeMenu(site);
      return { done: true, status: "failed", reason: "unavailable", interacted: false };
    }
    click(option);
    await sleep(site.settleMs ?? 600);
    if (!site.closesOnSelect) await closeMenu(site);
    if (site.readBack && !readBack(site, target)) return { done: true, status: "failed", reason: "rejected", interacted: true };
    return { done: true, status: "switched", interacted: true };
  };

  /** A toggle-like item in the model menu (Gemini thinking level, Notion effort / all sources). */
  const setMenuToggle = async (site, aliases, wantOn) => {
    const root = await openMenu(site);
    if (!root) return "no-menu";
    const item = best(qsa(sels(site.extraOption) || "[role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], [role='option'], [role='switch'], button", root).filter(visible), aliases);
    if (!item) {
      await closeMenu(site);
      return "not-found";
    }
    if (wantOn === undefined ? !isOn(item) : isOn(item) !== wantOn) {
      click(item);
      await sleep(400);
    }
    await closeMenu(site);
    return "ok";
  };

  cc.define("preferred-model", {
    applyPreferredModel: async ({ plan, site, schedule } = {}) => {
      if (!plan?.target || !site) return { status: "failed", reason: "no-plan" };
      cancelled = false;
      const delays = Array.isArray(schedule) && schedule.length ? schedule : [0, 700, 1600, 3200, 5200, 8000, 12000];
      const started = Date.now();
      let last = { reason: "no-menu" };
      let result = null;
      for (let i = 0; i < delays.length && !result; i++) {
        const wait = delays[i] - (Date.now() - started);
        if (wait > 0) await sleep(wait);
        if (cancelled) return { status: "cancelled" };
        const r = await Promise.race([attempt(site, plan.target), sleep(site.attemptTimeoutMs ?? 15000).then(() => ({ done: false, interacted: false, reason: "timeout" }))]);
        if (r.done) result = r;
        else last = r;
      }
      if (!result) return { status: "failed", reason: last.reason, interacted: false };
      if (result.status === "failed") return result;
      // Extras only after the model itself is right.
      const extras = {};
      if (plan.thinking && site.thinking?.[plan.thinking]) extras.thinking = await setMenuToggle(site, site.thinking[plan.thinking], true);
      if (plan.effort && site.efforts) extras.effort = await setMenuToggle(site, site.efforts[plan.effort] ?? [plan.effort], true);
      if (plan.allSources && site.allSources) extras.allSources = await setMenuToggle(site, site.allSources, plan.allSources === "enabled");
      return { ...result, extras, label: labelOf(trigger(site)) };
    },
    cancelPreferredModelApply: () => {
      cancelled = true;
      return true;
    },
  });
}
