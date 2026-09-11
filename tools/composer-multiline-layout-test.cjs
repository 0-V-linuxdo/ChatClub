#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const composer = read("app/composer/controller.js");
const css = read("styles/chatclub.css");
const agents = read("AGENTS.md");
const modelSource = read("app/composer/model.js");

assert.match(modelSource, /const PROMPT_TEXT_EXPANDED_MAX_HEIGHT = 180/);
assert.match(modelSource, /export function promptComposeShouldStack/);
assert.match(css, /--prompt-expanded-max-height:\s*180px/);
assert.match(css, /\.prompt-input\s*\{[\s\S]*?max-height:\s*var\(--prompt-expanded-max-height\)/);
assert.doesNotMatch(css, /\.prompt-input\s*\{[^}]*max-height:\s*360px/);
assert.match(
  css,
  /\.prompt-shell-stacked\.prompt-shell-expanded:not\(\.prompt-shell-search\) \.prompt-input-row\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, auto\) var\(--prompt-collapsed-height\)/
);
assert.match(
  css,
  /\.prompt-shell-stacked\.prompt-shell-expanded:not\(\.prompt-shell-search\) \.textarea\.prompt-input\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?grid-row:\s*1;/
);
assert.match(
  css,
  /\.prompt-shell-stacked\.prompt-shell-expanded:not\(\.prompt-shell-search\) \.prompt-mode-switch,[\s\S]*?\.prompt-send-button,[\s\S]*?\.prompt-send-queue-status \{\s*grid-row:\s*2;/
);
assert.doesNotMatch(
  css,
  /\.prompt-shell-stacked\.prompt-shell-expanded:not\(\.prompt-shell-search\) \.prompt-input-row\s*\{[^}]*grid-template-rows:\s*minmax\(var\(--prompt-collapsed-height\), auto\)/,
  "stacked compose must not keep textarea and chips on one auto track"
);
assert.match(
  css,
  /\.prompt-shell-stacked\.prompt-shell-expanded\.prompt-shell-has-images:not\(\.prompt-shell-search\) \.prompt-input-row\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, auto\) var\(--prompt-collapsed-height\)/
);
assert.match(
  css,
  /\.prompt-shell-stacked\.prompt-shell-expanded\.prompt-shell-has-images:not\(\.prompt-shell-search\) \.textarea\.prompt-input\s*\{[\s\S]*?grid-row:\s*2;/
);
assert.match(
  css,
  /\.prompt-shell-stacked\.prompt-shell-expanded\.prompt-shell-has-images:not\(\.prompt-shell-search\) \.prompt-mode-switch,[\s\S]*?\.prompt-send-button,[\s\S]*?\.prompt-send-queue-status \{\s*grid-row:\s*3;/
);
assert.match(css, /\.prompt-shell-stacked\.prompt-shell-expanded:not\(\.prompt-shell-search\)/);
assert.doesNotMatch(css, /\.prompt-shell-search\.prompt-shell-stacked/);
assert.match(functionSource(composer, "resizeInput"), /measurePromptScrollHeight/);
assert.match(functionSource(composer, "measurePromptScrollHeight"), /height = "auto"/);
assert.doesNotMatch(functionSource(composer, "measurePromptScrollHeight"), /height = "0px"/);
assert.match(functionSource(composer, "resizeInput"), /promptComposeShouldStack/);
assert.match(functionSource(composer, "resizeInput"), /prompt-shell-stacked/);
assert.match(functionSource(composer, "resizeInput"), /canStack/);
assert.doesNotMatch(
  functionSource(composer, "resizeInput"),
  /expanded:\s*grow/,
  "center-host grow must not stack a collapsed 40px pill"
);
assert.match(agents, /prompt-shell-stacked/);
assert.match(agents, /grow with `scrollHeight` downward/);
assert.match(agents, /Empty focused\/expanded compose stays on the collapsed token/);

(async () => {
  const {
    PROMPT_COLLAPSED_HEIGHT,
    promptComposeShouldStack,
    promptInputHeight
  } = await import(pathToFileURL(path.join(root, "app/composer/model.js")).href);

  assert.equal(PROMPT_COLLAPSED_HEIGHT, 40);

  const twoLine = promptInputHeight(56, 900, true, { collapsedHeight: 40, empty: false });
  assert.equal(twoLine.height, 56, "two short lines must hug scrollHeight, not jump to the 180 cap");
  assert.equal(twoLine.overflowY, "hidden");

  const capped = promptInputHeight(240, 900, true, { collapsedHeight: 40, empty: false });
  assert.equal(capped.height, 180);
  assert.equal(capped.overflowY, "auto");

  const emptyExpanded = promptInputHeight(240, 900, true, { collapsedHeight: 40, empty: true });
  assert.equal(emptyExpanded.height, 40);
  assert.equal(emptyExpanded.overflowY, "hidden");

  const collapsedDraft = promptInputHeight(120, 900, false, { collapsedHeight: 38, empty: false });
  assert.equal(collapsedDraft.height, 38);

  assert.equal(promptComposeShouldStack({
    empty: false,
    expanded: true,
    search: false,
    naturalHeight: 56,
    collapsedHeight: 40,
    value: "搜索:\nbricklink上的交易,转账"
  }), true);
  assert.equal(promptComposeShouldStack({
    empty: false,
    expanded: true,
    search: false,
    naturalHeight: 40,
    collapsedHeight: 40,
    value: "hello"
  }), false);
  assert.equal(promptComposeShouldStack({
    empty: false,
    expanded: true,
    search: false,
    naturalHeight: 42,
    collapsedHeight: 40,
    value: "hello"
  }), false, "1-line padding slop must not stack");
  assert.equal(promptComposeShouldStack({
    empty: false,
    expanded: true,
    search: false,
    naturalHeight: 56,
    collapsedHeight: 40,
    value: "a long line that wraps without a newline"
  }), true, "a wrapped second line must stack");
  assert.equal(promptComposeShouldStack({
    empty: true,
    expanded: true,
    search: false,
    naturalHeight: 86,
    collapsedHeight: 40,
    value: ""
  }), false);
  assert.equal(promptComposeShouldStack({
    empty: false,
    expanded: true,
    search: true,
    naturalHeight: 80,
    collapsedHeight: 40,
    value: "query\nstill search"
  }), false);
  assert.equal(promptComposeShouldStack({
    empty: false,
    expanded: false,
    search: false,
    naturalHeight: 80,
    collapsedHeight: 40,
    value: "搜索:\nbricklink上的交易,转账"
  }), false, "collapsed compose must not stack even with a newline draft");

  console.log("composer multiline layout tests passed");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
