import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLayout } from "../src/plugins/settings-sidebar/layout.js";

const entries = ["plugins", "themes", "quickCss", "appearance", "data", "about"].map((id) => ({ id }));
const ids = (list) => list.map((e) => e.id);

test("sidebar layout: saved order and hidden entries, Plugins stays first", () => {
  assert.deepEqual(ids(applyLayout(entries, null)), ids(entries));
  const layout = { order: ["about", "appearance", "plugins", "themes"], hidden: ["data", "plugins"] };
  assert.deepEqual(ids(applyLayout(entries, layout)), ["plugins", "about", "quickCss", "appearance", "themes"]);
  assert.deepEqual(ids(applyLayout(entries, layout, { includeHidden: true })), ["plugins", "about", "quickCss", "appearance", "data", "themes"]);
});

test("sidebar layout: sections added later keep their default slot", () => {
  const layout = { order: ["about", "themes"], hidden: [] };
  const more = [...entries.slice(0, 2), { id: "fresh" }, ...entries.slice(2)];
  assert.deepEqual(ids(applyLayout(more, layout)), ["plugins", "about", "fresh", "quickCss", "appearance", "data", "themes"]);
});
