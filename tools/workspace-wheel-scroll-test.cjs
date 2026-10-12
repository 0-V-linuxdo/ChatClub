#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

function createGrid({ scrollWidth = 0, clientWidth = 0, scrollLeft = 0 } = {}) {
  const listeners = new Map();
  const grid = {
    scrollWidth,
    clientWidth,
    scrollLeft,
    prevented: 0,
    addEventListener(type, listener, options) {
      assert.equal(type, "wheel", "the grid binding must only listen for wheel gestures");
      assert.deepEqual(
        options,
        { passive: false },
        "the wheel listener must be non-passive so a consumed gesture can preventDefault"
      );
      listeners.set(type, listener);
    }
  };
  grid.wheel = (event = {}) => {
    const wheelEvent = {
      deltaX: 0,
      deltaY: 0,
      deltaMode: 0,
      shiftKey: false,
      ctrlKey: false,
      defaultPrevented: false,
      preventDefault() {
        grid.prevented += 1;
        wheelEvent.defaultPrevented = true;
      },
      ...event
    };
    listeners.get("wheel")(wheelEvent);
    return wheelEvent;
  };
  return grid;
}

(async () => {
  const { bindWorkspaceGridWheelScroll, scrollWorkspaceGridOnWheel } = await import(
    moduleUrl("app/workspace/workspace-wheel-scroll.js")
  );

  // A vertical wheel gesture over an overflowing grid scrolls it horizontally.
  const scrolling = createGrid({ scrollWidth: 1400, clientWidth: 700, scrollLeft: 0 });
  bindWorkspaceGridWheelScroll(scrolling);
  scrolling.wheel({ deltaY: 120 });
  assert.equal(scrolling.scrollLeft, 120, "wheel-down must scroll the grid to the right");
  assert.equal(scrolling.prevented, 1, "a consumed gesture must prevent the browser default");

  scrolling.wheel({ deltaY: -50 });
  assert.equal(scrolling.scrollLeft, 70, "wheel-up must scroll the grid back to the left");
  assert.equal(scrolling.prevented, 2);

  // Overshoot clamps at the far edge instead of scrolling past the content.
  scrolling.wheel({ deltaY: 4000 });
  assert.equal(scrolling.scrollLeft, 700, "wheel-down must clamp at the maximum scroll offset");
  assert.equal(scrolling.prevented, 3);

  // At an edge the gesture belongs to the page again.
  const edgeEvents = scrolling.prevented;
  scrolling.wheel({ deltaY: 4000 });
  assert.equal(scrolling.scrollLeft, 700, "an edge gesture must not move the grid further");
  assert.equal(scrolling.prevented, edgeEvents, "an edge gesture must not be consumed");
  scrolling.wheel({ deltaY: -4000 });
  assert.equal(scrolling.scrollLeft, 0, "wheel-up must clamp at the start of the content");
  assert.equal(scrolling.prevented, edgeEvents + 1, "the clamp back to the start is itself a consumed gesture");
  const startEdgeEvents = scrolling.prevented;
  scrolling.wheel({ deltaY: -120 });
  assert.equal(scrolling.scrollLeft, 0, "a start-edge gesture must not move the grid further");
  assert.equal(scrolling.prevented, startEdgeEvents, "a start-edge gesture must not be consumed");

  // Line- and page-mode wheels translate into pixel steps.
  const lineGrid = createGrid({ scrollWidth: 2000, clientWidth: 500, scrollLeft: 0 });
  bindWorkspaceGridWheelScroll(lineGrid);
  lineGrid.wheel({ deltaY: 3, deltaMode: 1 });
  assert.equal(lineGrid.scrollLeft, 48, "line-mode wheels must scale by the line step");
  lineGrid.wheel({ deltaY: 1, deltaMode: 2 });
  assert.equal(lineGrid.scrollLeft, 548, "page-mode wheels must scale by the viewport width");

  // Gestures the browser already owns are left alone.
  const untouched = createGrid({ scrollWidth: 1400, clientWidth: 700, scrollLeft: 0 });
  bindWorkspaceGridWheelScroll(untouched);
  untouched.wheel({ deltaY: 120, shiftKey: true });
  assert.equal(untouched.scrollLeft, 0, "Shift+wheel stays the native horizontal gesture");
  untouched.wheel({ deltaY: 120, ctrlKey: true });
  assert.equal(untouched.scrollLeft, 0, "Ctrl+wheel stays the page-zoom gesture");
  untouched.wheel({ deltaX: 120, deltaY: 20 });
  assert.equal(untouched.scrollLeft, 0, "a horizontal-intent gesture stays native");
  untouched.wheel({ deltaY: 0 });
  assert.equal(untouched.scrollLeft, 0, "a zero delta must not consume the gesture");
  assert.equal(untouched.prevented, 0, "none of the native gestures may be consumed");

  // A grid without horizontal overflow never steals the wheel.
  const fitting = createGrid({ scrollWidth: 700, clientWidth: 700, scrollLeft: 0 });
  bindWorkspaceGridWheelScroll(fitting);
  fitting.wheel({ deltaY: 120 });
  assert.equal(fitting.scrollLeft, 0, "a non-overflowing grid must not scroll");
  assert.equal(fitting.prevented, 0, "a non-overflowing grid must not consume the wheel");

  // The binder is idempotent per element, so redraws cannot stack listeners.
  const idempotent = createGrid({ scrollWidth: 1400, clientWidth: 700, scrollLeft: 0 });
  bindWorkspaceGridWheelScroll(idempotent);
  bindWorkspaceGridWheelScroll(idempotent);
  idempotent.wheel({ deltaY: 60 });
  assert.equal(idempotent.scrollLeft, 60, "a re-bound grid must keep exactly one working listener");
  assert.equal(idempotent.prevented, 1, "a re-bound grid must not double-apply one gesture");

  // The scroll is eased over several frames, not a hard linear jump.
  const smooth = createGrid({ scrollWidth: 1400, clientWidth: 700, scrollLeft: 0 });
  const frames = [];
  const previousRaf = global.requestAnimationFrame;
  const previousCaf = global.cancelAnimationFrame;
  global.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  global.cancelAnimationFrame = () => {};
  try {
    bindWorkspaceGridWheelScroll(smooth);
    smooth.wheel({ deltaY: 120 });
    assert.equal(smooth.prevented, 1, "an eased gesture is still consumed");
    assert.ok(
      smooth.scrollLeft > 0 && smooth.scrollLeft < 120,
      "one frame must ease partway toward the target instead of jumping"
    );
    for (let guard = 0; guard < 200 && frames.length; guard += 1) frames.shift()();
    assert.equal(smooth.scrollLeft, 120, "the eased animation must settle exactly on the target");

    // An external scroll (scrollbar drag, native gesture) cancels the easing.
    smooth.wheel({ deltaY: 120 });
    assert.ok(frames.length > 0, "a new gesture must restart the animation");
    smooth.scrollLeft = 0;
    frames.shift()();
    assert.equal(frames.length, 0, "an external scroll must cancel the easing loop");
  } finally {
    if (previousRaf === undefined) delete global.requestAnimationFrame;
    else global.requestAnimationFrame = previousRaf;
    if (previousCaf === undefined) delete global.cancelAnimationFrame;
    else global.cancelAnimationFrame = previousCaf;
  }

  // The pure helper reports null for every gesture it declines.
  assert.equal(scrollWorkspaceGridOnWheel(null, { deltaY: 10 }), null);
  assert.equal(
    scrollWorkspaceGridOnWheel({ scrollWidth: 100, clientWidth: 100, scrollLeft: 0 }, { deltaY: 10 }),
    null
  );

  const view = read("app/workspace/view-controller.js");
  assert.match(
    view,
    /import \{ bindWorkspaceGridWheelScroll \} from "\.\/workspace-wheel-scroll\.js"/,
    "the workspace view controller must own the grid wheel binding"
  );
  assert.match(
    view,
    /function renderWorkspace\(\) \{[\s\S]*?bindWorkspaceGridWheelScroll\(grid\);/,
    "a freshly rendered workspace grid must bind the wheel translation"
  );
  assert.match(
    view,
    /workspaceNode\?\.isConnected \? workspaceNode : document\.querySelector\("\.main-grid"\)\);/,
    "a re-adopted workspace grid must bind the wheel translation too"
  );
  assert.match(
    view,
    /retainWorkspaceNode\(nextWorkspace\);/,
    "a replaced workspace grid must keep the wheel translation on its replacement"
  );

  console.log("workspace wheel scroll: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
