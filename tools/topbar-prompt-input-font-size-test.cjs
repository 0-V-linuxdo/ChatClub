#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const stylesheetSource = fs.readFileSync(path.join(root, "styles/chatclub.css"), "utf8");

function cssBlocks(source) {
  const blocks = [];
  const contexts = [{ nextHeaderStart: 0 }];
  let quote = "";
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (inComment) {
      if (current === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === quote) quote = "";
      continue;
    }
    if (current === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (current === "\"" || current === "'") {
      quote = current;
      continue;
    }

    const context = contexts[contexts.length - 1];
    if (current === ";") {
      context.nextHeaderStart = index + 1;
      continue;
    }
    if (current === "{") {
      contexts.push({
        header: source.slice(context.nextHeaderStart, index).trim(),
        open: index,
        nextHeaderStart: index + 1
      });
      continue;
    }
    if (current !== "}" || contexts.length === 1) continue;

    const block = contexts.pop();
    blocks.push({ ...block, close: index, body: source.slice(block.open + 1, index) });
    contexts[contexts.length - 1].nextHeaderStart = index + 1;
  }

  assert.equal(contexts.length, 1, "stylesheet blocks must be balanced");
  return blocks;
}

function innermostBlockAt(blocks, index) {
  return blocks
    .filter((block) => block.open < index && index < block.close)
    .sort((left, right) => right.open - left.open)[0];
}

(async () => {
  const {
    DEFAULT_OPTIONS,
    TOPBAR_PROMPT_INPUT_FONT_SIZE_LEGACY_DEFAULT_PX,
    TOPBAR_PROMPT_INPUT_FONT_SIZE_MAX_PX,
    TOPBAR_PROMPT_INPUT_FONT_SIZE_MIGRATION_VERSION,
    TOPBAR_PROMPT_INPUT_FONT_SIZE_MIN_PX
  } = await import("../shared/constants.js");
  const {
    dehydrateOptions,
    normalizeOptions,
    normalizeTopbarPromptInputFontSize
  } = await import("../shared/storage-schema.js");

  assert.equal(TOPBAR_PROMPT_INPUT_FONT_SIZE_LEGACY_DEFAULT_PX, 15);
  assert.equal(TOPBAR_PROMPT_INPUT_FONT_SIZE_MIGRATION_VERSION, 1);
  assert.equal(DEFAULT_OPTIONS.topbarPromptInputFontSize, 16);
  assert.equal(DEFAULT_OPTIONS.topbarPromptInputFontSizeMigrationVersion, 1);
  assert.equal(DEFAULT_OPTIONS.composerPlacement, "topbar");
  assert.equal(TOPBAR_PROMPT_INPUT_FONT_SIZE_MIN_PX, 13);
  assert.equal(TOPBAR_PROMPT_INPUT_FONT_SIZE_MAX_PX, 20);
  assert.match(stylesheetSource, /--topbar-prompt-input-font-size:\s*16px;/, "the stylesheet fallback must match the option default");

  for (const invalid of [undefined, null, true, false, "", "invalid", NaN, Infinity, {}, []]) {
    assert.equal(
      normalizeTopbarPromptInputFontSize(invalid),
      16,
      `${String(invalid)} must fall back to the default input font size`
    );
  }

  assert.equal(normalizeTopbarPromptInputFontSize(12), 13);
  assert.equal(normalizeTopbarPromptInputFontSize(13), 13);
  assert.equal(normalizeTopbarPromptInputFontSize(14.49), 14);
  assert.equal(normalizeTopbarPromptInputFontSize(14.5), 15);
  assert.equal(normalizeTopbarPromptInputFontSize(17.6), 18);
  assert.equal(normalizeTopbarPromptInputFontSize(18), 18);
  assert.equal(normalizeTopbarPromptInputFontSize(19), 19);
  assert.equal(normalizeTopbarPromptInputFontSize(20), 20);
  assert.equal(normalizeTopbarPromptInputFontSize(21), 20);

  assert.equal(normalizeOptions({}).topbarPromptInputFontSize, 16);
  assert.equal(normalizeOptions({ topbarPromptInputFontSize: null }).topbarPromptInputFontSize, 16);
  assert.equal(normalizeOptions({ topbarPromptInputFontSize: 12.6 }).topbarPromptInputFontSize, 13);
  assert.equal(normalizeOptions({ topbarPromptInputFontSize: 17.6 }).topbarPromptInputFontSize, 18);
  assert.equal(normalizeOptions({ topbarPromptInputFontSize: 22 }).topbarPromptInputFontSize, 20);

  // Versioned one-time migration (module-local in storage-schema, exercised
  // through normalizeOptions): a stored untouched 15px default lifts to 16px
  // exactly once; every other stored size, and any 15px chosen after the
  // marker is written, is preserved.
  assert.equal(normalizeOptions({ topbarPromptInputFontSize: "15" }).topbarPromptInputFontSize, 16);
  assert.equal(normalizeOptions({ topbarPromptInputFontSize: 17 }).topbarPromptInputFontSize, 17);
  assert.equal(normalizeOptions({ topbarPromptInputFontSize: undefined, topbarPromptInputFontSizeMigrationVersion: 0 }).topbarPromptInputFontSize, 16);
  const legacyStored = normalizeOptions({ topbarPromptInputFontSize: 15 });
  assert.equal(legacyStored.topbarPromptInputFontSize, 16, "an unmigrated stored 15px default must lift to the new default");
  assert.equal(legacyStored.topbarPromptInputFontSizeMigrationVersion, 1, "the migration marker must be written");
  const legacyCustom = normalizeOptions({ topbarPromptInputFontSize: 14 });
  assert.equal(legacyCustom.topbarPromptInputFontSize, 14, "a customized size must survive the migration");
  assert.equal(legacyCustom.topbarPromptInputFontSizeMigrationVersion, 1);
  const postMigrationChoice = normalizeOptions({ topbarPromptInputFontSize: 15, topbarPromptInputFontSizeMigrationVersion: 1 });
  assert.equal(postMigrationChoice.topbarPromptInputFontSize, 15, "a deliberate 15px after the marker must not be reinterpreted");
  const remigrated = normalizeOptions(JSON.parse(JSON.stringify(dehydrateOptions(legacyStored))));
  assert.equal(remigrated.topbarPromptInputFontSize, 16);
  assert.equal(remigrated.topbarPromptInputFontSizeMigrationVersion, 1);
  const futureMarker = normalizeOptions({ topbarPromptInputFontSize: 15, topbarPromptInputFontSizeMigrationVersion: 7 });
  assert.equal(futureMarker.topbarPromptInputFontSize, 15);
  assert.equal(futureMarker.topbarPromptInputFontSizeMigrationVersion, 7, "a newer marker must never move backwards");

  const persisted = dehydrateOptions({ topbarPromptInputFontSize: 16.4 });
  assert.equal(persisted.topbarPromptInputFontSize, 16);
  const restored = normalizeOptions(JSON.parse(JSON.stringify(persisted)));
  assert.equal(restored.topbarPromptInputFontSize, 16);
  assert.equal(dehydrateOptions({ topbarPromptInputFontSize: false }).topbarPromptInputFontSize, 16);

  const variableConsumer = "var(--topbar-prompt-input-font-size)";
  const blocks = cssBlocks(stylesheetSource);
  const consumerIndexes = [];
  for (let index = stylesheetSource.indexOf(variableConsumer); index >= 0; index = stylesheetSource.indexOf(variableConsumer, index + 1)) {
    consumerIndexes.push(index);
  }
  assert.equal(consumerIndexes.length, 2, "the input font-size variable must have two CSS consumers");
  const consumerHeaders = consumerIndexes.map((index) => innermostBlockAt(blocks, index)?.header);
  assert.deepEqual(
    [...consumerHeaders].sort(),
    [".prompt-input-expanded", ".prompt-shell"],
    "collapsed line-height and expanded font-size must share the input font-size variable"
  );
  const expandedBlock = innermostBlockAt(
    blocks,
    consumerIndexes.find((index) => innermostBlockAt(blocks, index)?.header === ".prompt-input-expanded")
  );
  assert.ok(expandedBlock, "the expanded prompt must consume the custom font-size variable");
  assert.match(
    expandedBlock.body,
    /(?:^|;)\s*font-size\s*:\s*var\(--topbar-prompt-input-font-size\)\s*;/,
    "the expanded prompt textarea must consume the custom font-size variable"
  );
  const shellBlock = innermostBlockAt(
    blocks,
    consumerIndexes.find((index) => innermostBlockAt(blocks, index)?.header === ".prompt-shell")
  );
  assert.ok(shellBlock, "the prompt shell must consume the custom font-size variable");
  assert.match(
    shellBlock.body,
    /(?:^|;)\s*--prompt-collapsed-line\s*:\s*var\(--topbar-prompt-input-font-size\)\s*;/,
    "collapsed single-line height must follow the input font-size variable"
  );

  const collapsedPreviewBlocks = blocks.filter((block) => (
    block.header.split(",").map((selector) => selector.trim()).includes(".prompt-collapsed-preview-text")
  ));
  assert.ok(collapsedPreviewBlocks.length > 0, "the collapsed prompt preview rule must exist");
  for (const block of collapsedPreviewBlocks) {
    assert.doesNotMatch(
      block.body,
      /--topbar-prompt-input-font-size/,
      "the collapsed prompt preview must retain its existing font size"
    );
  }

  const topbarSource = fs.readFileSync(path.join(root, "app/settings/appearance-topbar.js"), "utf8");
  assert.match(
    topbarSource,
    /createAppearanceOverlayInfoButton\([\s\S]*"settings\.appearance\.topbarInputFontSize"/
  );
  assert.doesNotMatch(topbarSource, /appearance-range-help/);

  console.log("topbar prompt input font-size normalization, persistence, and CSS isolation: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
