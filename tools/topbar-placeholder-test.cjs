#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const { createTopbarPlaceholderController } = await import(
    pathToFileURL(path.join(root, "app/topbar/placeholder.js")).href
  );

  const state = {
    options: {
      topbarPromptPlaceholderConfig: {
        mode: "refresh",
        order: "sequence",
        intervalSec: 5,
        items: ["One", "Two"],
        state: { index: -1, lastRandom: -1 }
      }
    }
  };
  let saves = 0;
  let renders = 0;
  const controller = createTopbarPlaceholderController({
    state,
    normalizeConfig: (value) => ({ ...value, state: { ...(value.state || {}) } }),
    saveOptions: async (value) => {
      saves += 1;
      return value;
    },
    syncTopbar: () => { renders += 1; },
    translate: (key) => key
  });
  await controller.initialize();
  assert.equal(controller.placeholder(), "One");
  assert.equal(saves, 1);
  await controller.initialize();
  assert.equal(controller.placeholder(), "Two");
  assert.equal(saves, 2);
  await controller.initialize();
  assert.equal(controller.placeholder(), "One");
  assert.equal(saves, 3);
  controller.sync();
  assert.equal(controller.placeholder(), "One");
  assert.equal(renders, 1);
  controller.stop();

  console.log("topbar placeholder controller: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
