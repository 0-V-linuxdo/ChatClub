import test from "node:test";
import assert from "node:assert/strict";
import { estimateOverlap, refineOverlap, fitScale, outputWidth, composeLayout, shareFileName, shareText, MAX_SIDE } from "../src/plugins/share/stitch.js";

test("overlap estimate and refinement", () => {
  assert.equal(estimateOverlap({ scrollY: 0, viewportHeight: 800, scrollerHeight: 800 }, { scrollY: 736 }, 800, 1), 64);
  assert.equal(estimateOverlap(null, null, 800, 2), 128);
  // rows are their own index offset: prev rows 0..99, cur rows start at 70 → true overlap 30
  const prev = { rows: Array.from({ length: 100 }, (_, i) => i) };
  const cur = { rows: Array.from({ length: 100 }, (_, i) => i + 70) };
  const rowOf = (img, y) => [img.rows[y] ?? -999];
  assert.equal(refineOverlap(24, 12, 100, 100, rowOf, prev, cur), 30);
});

test("limits, widths, layout, names, text", () => {
  assert.ok(fitScale(1000, 40000) * 40000 <= MAX_SIDE);
  assert.equal(fitScale(1000, 2000), 1);
  assert.equal(outputWidth(500), 430);
  assert.equal(outputWidth(700), 1000);
  const v = composeLayout([{ w: 100, h: 50 }, { w: 80, h: 70 }], "vertical");
  assert.deepEqual([v.width, v.height], [100, 44 + 50 + 16 + 44 + 70]);
  const hz = composeLayout([{ w: 100, h: 50 }, { w: 80, h: 70 }], "horizontal");
  assert.deepEqual([hz.width, hz.height], [196, 114]);
  assert.equal(shareFileName("jpg", new Date("2026-10-22T07:08:09.123Z")), "chatclub-share-2026-10-22-07-08-09.jpg");
  assert.equal(shareText([{ name: "A", title: "T", href: "u", messages: [{ role: "user", text: "q" }, { role: "assistant", text: "a" }] }, { name: "B", href: "v", error: "oops" }]),
    "# A · T\nu\n\nUSER:\nq\n\nASSISTANT:\na\n\n---\n\n# B\nv\n\noops");
});
