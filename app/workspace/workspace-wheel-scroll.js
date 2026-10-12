// The workspace layout keeps a 280px minimum column width
// (`max(280px, calc(100% / visibleColumns))` in the view controller), so a
// crowded desk overflows `.main-grid` horizontally. That overflow can only be
// reached by dragging the bottom scrollbar: the container cannot scroll
// vertically, so a plain vertical wheel gesture over it did nothing and
// Shift+wheel was the only wheel route. This module translates vertical wheel
// gestures over the grid into horizontal scrolling.
//
// The translation is eased, not linear: wheel deltas accumulate into a target
// offset and a requestAnimationFrame loop approaches it exponentially, so the
// gesture feels like the browser's own smooth scrolling instead of a hard jump
// per wheel notch. Where `requestAnimationFrame` is unavailable the loop runs
// synchronously to completion, which keeps the module deterministic in tests.

const WHEEL_LINE_STEP = 16;
const SMOOTH_SCROLL_EASE = 0.28;
const SMOOTH_SCROLL_SETTLE = 1;
const SMOOTH_SCROLL_DRIFT = 2;

const animationStates = new WeakMap();
const boundGrids = new WeakSet();

function finiteNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function wheelStep(event, viewportWidth) {
  const deltaY = finiteNumber(event?.deltaY);
  const deltaMode = finiteNumber(event?.deltaMode);
  if (deltaMode === 1) return deltaY * WHEEL_LINE_STEP;
  if (deltaMode === 2) return deltaY * viewportWidth;
  return deltaY;
}

function scheduleFrame(callback) {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
  callback();
  return null;
}

function animationState(grid) {
  let state = animationStates.get(grid);
  if (!state) {
    state = { target: null, frame: null, lastWritten: null };
    animationStates.set(grid, state);
  }
  return state;
}

function stopAnimation(state) {
  if (state.frame !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.frame);
  }
  state.frame = null;
  state.target = null;
  state.lastWritten = null;
}

function animationFrame(grid) {
  const state = animationState(grid);
  const maxScrollLeft = Math.max(0, finiteNumber(grid.scrollWidth) - finiteNumber(grid.clientWidth));
  const target = Math.min(maxScrollLeft, Math.max(0, state.target));
  const current = finiteNumber(grid.scrollLeft);
  // A scroll this animation did not write (scrollbar drag, native gesture)
  // wins: stop easing so the animation never fights the user.
  if (state.lastWritten !== null && Math.abs(current - state.lastWritten) > SMOOTH_SCROLL_DRIFT) {
    stopAnimation(state);
    return;
  }
  const remaining = target - current;
  if (Math.abs(remaining) <= SMOOTH_SCROLL_SETTLE) {
    grid.scrollLeft = target;
    stopAnimation(state);
    return;
  }
  const next = current + remaining * SMOOTH_SCROLL_EASE;
  state.lastWritten = next;
  grid.scrollLeft = next;
  state.frame = scheduleFrame(() => animationFrame(grid));
}

function cancelSmoothScroll(grid) {
  const state = animationStates.get(grid);
  if (state) stopAnimation(state);
}

/**
 * Apply one wheel gesture to a horizontal scroll container.
 * Returns the animation target when the gesture was consumed, or null when the
 * event must be left to the browser: no horizontal overflow, the native
 * Shift+wheel gesture, a Ctrl+wheel page zoom, a horizontal-intent gesture, an
 * already-prevented event, or an edge the grid cannot scroll past. A consumed
 * gesture eases toward its target over the following frames.
 */
export function scrollWorkspaceGridOnWheel(grid, event) {
  if (!grid || !event || event.defaultPrevented) return null;
  if (event.shiftKey || event.ctrlKey) {
    cancelSmoothScroll(grid);
    return null;
  }
  const deltaX = Math.abs(finiteNumber(event.deltaX));
  const deltaY = Math.abs(finiteNumber(event.deltaY));
  if (deltaX > deltaY) {
    cancelSmoothScroll(grid);
    return null;
  }
  const clientWidth = finiteNumber(grid.clientWidth);
  const maxScrollLeft = finiteNumber(grid.scrollWidth) - clientWidth;
  if (maxScrollLeft <= 0) return null;
  const step = wheelStep(event, clientWidth);
  if (!step) return null;
  const state = animationState(grid);
  const base = state.target ?? finiteNumber(grid.scrollLeft);
  const nextTarget = Math.min(maxScrollLeft, Math.max(0, base + step));
  // At the requested edge the gesture belongs to the page, not this container.
  if (nextTarget === base) return null;
  state.target = nextTarget;
  if (state.frame === null) animationFrame(grid);
  return nextTarget;
}

/**
 * Bind the wheel-to-horizontal translation to one grid element, at most once
 * per element. The listener is non-passive so a consumed gesture can keep the
 * page from scrolling as well.
 */
export function bindWorkspaceGridWheelScroll(grid) {
  if (!grid || typeof grid.addEventListener !== "function" || boundGrids.has(grid)) return;
  boundGrids.add(grid);
  grid.addEventListener("wheel", (event) => {
    if (scrollWorkspaceGridOnWheel(grid, event) !== null) event.preventDefault();
  }, { passive: false });
}
