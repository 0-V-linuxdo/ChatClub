#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const load = (file) => import(`${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}`);

(async () => {
  const model = await load("app/share/model.js");
  const frames = [
    { instanceId: "a", visible: true, name: "ChatGPT" },
    { instanceId: "b", visible: false, name: "Claude" },
    { instanceId: "c", visible: true, name: "Gemini" }
  ];
  assert.deepEqual(
    model.resolveShareTargets({ scope: "current", frames, currentKey: "b" }).map((frame) => frame.instanceId),
    ["b"],
    "current scope uses the focused iframe even when hidden"
  );
  assert.deepEqual(
    model.resolveShareTargets({ scope: "selected", frames, selectedKeys: ["c", "a"] }).map((frame) => frame.instanceId),
    ["a", "c"],
    "selected scope preserves workspace order"
  );
  assert.deepEqual(
    model.resolveShareTargets({ scope: "all", frames }).map((frame) => frame.instanceId),
    ["a", "b", "c"]
  );
  assert.equal(model.shareOutputMaxWidth(400), 430);
  assert.equal(model.shareOutputMaxWidth(900), 1000);
  const text = model.composeShareText([
    { name: "ChatGPT", title: "Thread", href: "https://chatgpt.com/c/1", text: "hello" },
    { name: "Claude", error: "missing" }
  ]);
  assert.match(text, /# ChatGPT · Thread/);
  assert.match(text, /hello/);
  assert.match(text, /---/);
  assert.match(text, /missing/);
  const turns = model.composeShareText([{
    name: "ChatGPT",
    messages: [{ role: "user", text: "hi" }, { role: "assistant", text: "hello there" }]
  }]);
  assert.match(turns, /USER:\nhi/);
  assert.match(turns, /ASSISTANT:\nhello there/);
  assert.equal(model.normalizeShareImageLayout("row"), "row");
  assert.equal(model.normalizeShareImageLayout("other"), "stack");
  assert.match(model.shareFilename("text", new Date("2026-08-23T01:02:03.000Z")), /\.txt$/);
  assert.match(model.shareFilename("image", new Date("2026-08-23T01:02:03.000Z")), /\.jpg$/);
  const layout = model.stitchLayout({
    slices: [{ width: 2000, height: 1000 }, { width: 2000, height: 1000 }],
    overlapPx: 2,
    maxWidth: 1000
  });
  assert.equal(layout.width, 1000);
  assert.equal(layout.sliceDraws.length, 2);
  assert.ok(layout.sliceDraws[1].skipTop > 0);
  const metricLayout = model.stitchLayout({
    slices: [
      { width: 1000, height: 800, scrollY: 0, viewportHeight: 800 },
      { width: 1000, height: 800, scrollY: 50, viewportHeight: 800 }
    ],
    maxWidth: 1000
  });
  assert.equal(metricLayout.sliceDraws[1].sourceSkip, 750);
  assert.equal(metricLayout.sliceDraws[1].height, 50);
  const row = model.composeImageLayout({
    frames: [
      { width: 400, height: 200, header: "A" },
      { width: 300, height: 250, header: "B" }
    ],
    direction: "row"
  });
  assert.equal(row.direction, "row");
  assert.equal(row.draws.length, 2);
  assert.ok(row.draws[1].x > row.draws[0].x);
  assert.equal(row.draws[0].y, 0);
  const stack = model.composeImageLayout({
    frames: [
      { width: 400, height: 200, header: "A" },
      { width: 300, height: 250, header: "B" }
    ]
  });
  assert.equal(stack.direction, "stack");
  assert.ok(stack.draws[1].y > stack.draws[0].y);
  console.log("share model: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
