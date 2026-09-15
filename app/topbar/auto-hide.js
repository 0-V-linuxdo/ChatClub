import { normalizeTopbarVisibility } from "../../shared/storage-schema.js";
import { AUTO_HIDE_TOPBAR_CLASS } from "../../ui/dom.js";
import { validateControllerContract } from "../controller-contract.js";

const CHAT_FRAME_POINTER_EVENT = "chatclub:chat-frame-pointer";
const COLLAPSED_CLASS = "topbar-collapsed";
// Marks the mode, not the peek, so hovering the top edge cannot pull the caret into the bar. The name
// comes from `ui/dom.js` because `isInsideAutoHiddenTopbar` there is what the focus guards read; those
// guards live in App domains that cannot import this module.
const MODE_CLASS = AUTO_HIDE_TOPBAR_CLASS;
// The reveal band stays at the absolute top edge, the way Vivaldi had to narrow its own trigger after
// shipping a taller one, so travelling to a chat tab a few pixels below never summons the bar over
// that tab row.
const TOPBAR_REVEAL_ZONE_PX = 3;
// A reveal displaces the workspace, so it waits out an intent window instead of firing on a cursor
// that is only passing through.
const TOPBAR_REVEAL_DWELL_MS = 340;
const TOPBAR_REVEAL_HIDE_GRACE_MS = 420;
const TOPBAR_REVEAL_IDLE_MS = 2000;
// A tooltip proves the pointer is resting on a bar control, but a pointer that jumps straight into a
// chat frame never sends that control a leave event either, so the tooltip can stay open with the
// pointer long gone. It therefore buys one extra idle window instead of holding the bar open.
const IDLE_SOFT_HOLD_LIMIT = 1;

// The top bar costs a permanent 51px strip across the whole window. Auto-hide gives that grid row to
// the chats and lets a peek bring the same bar back in flow, so a revealed bar looks exactly like the
// resting one instead of floating over the tab row it sits above.
//
// Measured in Chromium 149 (Chrome for Testing through playwright@1.61.1, --site-per-process,
// 2026-09-15) with a parent bar above a cross-site frame, which is why the rules below cannot be
// written as CSS `:hover` or a leave listener:
//
// - Pointer leaving the bar through the parent's own pixels: the parent gets `pointermove`, then
//   `pointerout` / `pointerleave` / `mouseout` / `mouseleave`, and `:hover` resets.
// - Pointer moving from the bar straight into the frame in one motion: the parent gets no event at
//   all, and `bar.matches(":hover")` stays true indefinitely.
// - Pointer moving around inside the frame: no parent event, `:hover` still stuck true.
// - Pointer jumping from inside the frame back onto parent pixels: `pointermove` arrives again (with
//   no `mouseenter`, because as far as the browser is concerned the bar was never left).
//
// So a peek arms on a parent `pointermove` in the top band, disarms on a parent `pointermove` below
// the bar, and keeps an idle window as the only guaranteed way back to hidden.
export function createTopbarAutoHideController(dependencies = {}) {
  const { state, persistVisibility, alignSidebar } = validateControllerContract(
    dependencies,
    "Topbar auto-hide",
    {
      state: "object",
      persistVisibility: "function",
      alignSidebar: "function?"
    }
  );

  let peeking = false;
  let listening = false;
  let dwellTimer = 0;
  let hideTimer = 0;
  let idleTimer = 0;
  let softHolds = 0;
  let revealedBarBottom = 0;

  function visibility() {
    return normalizeTopbarVisibility(state.options?.topbarVisibility);
  }

  // Edit mode keeps the bar in flow: its palette is taller than the bar and belongs in the layout.
  function autoHideActive() {
    return visibility() === "auto" && !state.topbarEditMode;
  }

  function topbarNode() {
    return document.querySelector(".topbar");
  }

  // Work the bar must not take away under the user while a peek is timing out. Every one of these ends
  // with a parent event, so the next collapse attempt gets its chance. A draft is deliberately not on
  // this list: it survives the collapse inside the same node, and holding the bar open for a lingering
  // draft would give the strip back to chrome for the rest of the session.
  //
  // A caret is a hard hold, and the collapse can never resolve it by blurring: a focused `.prompt-input`
  // owns the page-caret lease, and `composerCaretIntent` in `ui/dom.js` re-claims it after a `body` blur
  // on purpose, so `active.blur()` here just ping-pongs the caret back into the bar. Measured in
  // Chromium 149 on 2026-09-15: the bar reopened on the very next frame every time. So the caret leaves
  // on the user's terms instead - a click into a chat, ⌘/⌥ elsewhere, Tab out - and the bar collapses
  // then. The initial prompt-focus guard already declines to park that caret in an auto-hidden bar, so
  // a fresh page starts collapsed with the caret nowhere.
  function focusHoldsBar() {
    return Boolean(topbarNode()?.contains(document.activeElement));
  }

  // `aria-expanded="true"` alone is not a menu: the ChatClub Tabs toggle is a two-state disclosure for a
  // panel that is not in this bar, and it stays expanded for as long as the sidebar is open, which held
  // the bar open for the whole session (measured in Chromium 149 on 2026-09-15). Overlay Chrome Contract
  // pairs `aria-haspopup` with `aria-expanded` on a real menu trigger, so require both.
  function menuHoldsBar() {
    const bar = topbarNode();
    if (!bar) return false;
    if (bar.querySelector('[aria-haspopup][aria-expanded="true"], .topbar-settings-anchor, .popover-anchor')) return true;
    return Boolean(document.querySelector(".topbar-settings-popover, .prompt-actions-popover"));
  }

  function holdsWork() {
    return focusHoldsBar() || menuHoldsBar();
  }

  function tooltipHoldsBar() {
    return Boolean(topbarNode()?.querySelector(".tooltip-open"));
  }

  function clearTimer(handle) {
    if (handle) clearTimeout(handle);
    return 0;
  }

  function cancelPending() {
    dwellTimer = clearTimer(dwellTimer);
    hideTimer = clearTimer(hideTimer);
    idleTimer = clearTimer(idleTimer);
  }

  // The single choke point for the geometry, so a peek, a redraw, the Settings select and the shortcut
  // all land on the same two classes.
  function apply() {
    const shell = document.querySelector(".app-shell");
    if (!shell) return;
    const active = autoHideActive();
    const collapsed = active && !peeking;
    const changed = shell.classList.contains(COLLAPSED_CLASS) !== collapsed;
    shell.classList.toggle(MODE_CLASS, active);
    shell.classList.toggle(COLLAPSED_CLASS, collapsed);
    // The ChatClub Tabs sidebar tracks the workspace grid's real top through an inline style it measures
    // once per render, so the row this class collapses has to tell it to measure again. It knows nothing
    // about auto-hide and must not: it simply follows the bar's height, open or closed either way.
    if (changed) alignSidebar?.();
  }

  function collapse() {
    cancelPending();
    if (!peeking) return;
    peeking = false;
    apply();
  }

  // The guaranteed way back to hidden. A pointer that jumped into a chat frame produces no further
  // parent event, so nothing else can prove the peek is over; any parent pointer move inside the
  // revealed bar restarts this window.
  function armIdleCollapse() {
    idleTimer = clearTimer(idleTimer);
    if (!peeking) return;
    idleTimer = setTimeout(() => {
      idleTimer = 0;
      if (!peeking || !autoHideActive()) return;
      if (holdsWork()) {
        armIdleCollapse();
        return;
      }
      if (tooltipHoldsBar() && softHolds < IDLE_SOFT_HOLD_LIMIT) {
        softHolds += 1;
        armIdleCollapse();
        return;
      }
      collapse();
    }, TOPBAR_REVEAL_IDLE_MS);
  }

  function reveal() {
    dwellTimer = clearTimer(dwellTimer);
    hideTimer = clearTimer(hideTimer);
    if (!peeking) {
      peeking = true;
      apply();
    }
    // Sampled once per reveal instead of per pointer move: the bar is a fixed 51px and reading its
    // rect on the hottest event in the page would force layout on every move.
    revealedBarBottom = topbarNode()?.getBoundingClientRect().bottom || 0;
    softHolds = 0;
    armIdleCollapse();
  }

  function scheduleCollapse() {
    if (!peeking || hideTimer) return;
    hideTimer = setTimeout(() => {
      hideTimer = 0;
      if (holdsWork()) {
        armIdleCollapse();
        return;
      }
      collapse();
    }, TOPBAR_REVEAL_HIDE_GRACE_MS);
  }

  // A reveal displaces the workspace, so it waits out the dwell window instead of firing on a cursor
  // that is only travelling to a chat tab a few pixels below.
  function scheduleReveal() {
    if (peeking || dwellTimer) return;
    dwellTimer = setTimeout(() => {
      dwellTimer = 0;
      if (autoHideActive()) reveal();
    }, TOPBAR_REVEAL_DWELL_MS);
  }

  function onPointerMove(event) {
    if (!autoHideActive()) return;
    const y = Number(event?.clientY);
    if (!Number.isFinite(y)) return;
    if (!peeking) {
      if (y <= TOPBAR_REVEAL_ZONE_PX) scheduleReveal();
      else dwellTimer = clearTimer(dwellTimer);
      return;
    }
    if (y <= revealedBarBottom) {
      hideTimer = clearTimer(hideTimer);
      softHolds = 0;
      armIdleCollapse();
      return;
    }
    scheduleCollapse();
  }

  function onFocusIn(event) {
    if (!autoHideActive()) return;
    if (topbarNode()?.contains(event?.target)) reveal();
  }

  // Only a destination outside the bar ends the peek; Tab between two bar controls is still work.
  function onFocusOut(event) {
    if (!autoHideActive() || !peeking) return;
    const bar = topbarNode();
    if (bar && event?.relatedTarget && bar.contains(event.relatedTarget)) return;
    scheduleCollapse();
  }

  // The user chose the site: the child shield reports that trusted pointer because the parent never
  // sees it, and it is the only signal that arrives while the pointer is already inside a frame.
  function onChatFramePointer() {
    if (autoHideActive() && peeking && !holdsWork()) collapse();
  }

  // Nothing listens while the bar rests: pointermove is the hottest event on the page and the default
  // configuration must not pay for a feature it does not use.
  function listen(next) {
    if (next === listening) return;
    listening = next;
    const bind = next ? "addEventListener" : "removeEventListener";
    window[bind]("pointermove", onPointerMove, true);
    window[bind]("focusin", onFocusIn, true);
    window[bind]("focusout", onFocusOut, true);
    document[bind](CHAT_FRAME_POINTER_EVENT, onChatFramePointer);
  }

  // Called from every topbar sync, so a redraw, an options reload, and edit mode all land on the same
  // geometry without a second source of truth.
  function sync() {
    const active = autoHideActive();
    if (!active) {
      cancelPending();
      peeking = false;
    }
    listen(active);
    apply();
  }

  // Explicit intent, so it moves the preference the way the Settings select does. A transient peek never
  // writes it. Turning auto-hide on while the bar holds the caret or a menu starts revealed and collapses
  // on the ordinary idle window, because hiding a focused control is worse than one more peek.
  function toggle() {
    const next = visibility() === "auto" ? "always" : "auto";
    cancelPending();
    if (state.options) state.options = { ...state.options, topbarVisibility: next };
    peeking = next === "auto" && holdsWork();
    listen(next === "auto" && !state.topbarEditMode);
    apply();
    if (peeking) {
      softHolds = 0;
      revealedBarBottom = topbarNode()?.getBoundingClientRect().bottom || 0;
      armIdleCollapse();
    }
    return persistVisibility(next);
  }

  return Object.freeze({
    isCollapsed: () => autoHideActive() && !peeking,
    reveal: () => {
      if (autoHideActive()) reveal();
    },
    sync,
    toggle,
    visibility
  });
}
