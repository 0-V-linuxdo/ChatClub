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
  console.log("share model: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
