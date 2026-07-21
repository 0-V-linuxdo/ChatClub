#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n?/g, "\n");

function section(source, start, end, label) {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `${label}: missing start marker`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(endIndex > startIndex, `${label}: missing end marker`);
  return source.slice(startIndex, endIndex);
}

const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
const compact = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");

(async () => {
  const nativeSource = read("content-src/capabilities/delete-common.js");
  const standaloneSource = read("build-src/topic-delete-userscript-engine-core.js");
  const nativeTokenHelpers = section(
    nativeSource,
    "  function deleteTextToken",
    "\n  function deleteElementText",
    "native token helpers"
  );
  const nativeRepeatHelper = section(
    nativeSource,
    "  function deleteLabelMatchesExactish",
    "\n  const DELETE_CLICKABLE_SELECTOR",
    "native repeated-label helper"
  );
  const nativeQuestionHelpers = section(
    nativeSource,
    "  function deleteConfirmQuestionMatches",
    "\n  function deleteQuestionDialogRoots",
    "native confirmation text helpers"
  );
  const native = new Function(
    "normalize",
    `"use strict";\n${nativeTokenHelpers}\n${nativeRepeatHelper}\n${nativeQuestionHelpers}\nreturn { deleteLabelMatchesExactish, deleteConfirmQuestionMatches, deleteConfirmRootTextMatches };`
  )(normalize);

  const liveDialogText = "Delete chat? This will delete prompts and responses from your activity. Cancel Delete";
  assert.equal(native.deleteConfirmQuestionMatches("Delete chat?"), true, "native must recognize Gemini's compact English title");
  assert.equal(native.deleteConfirmQuestionMatches("Delete chat"), false, "native must not treat an ordinary menu label as a confirmation question");
  assert.equal(native.deleteConfirmRootTextMatches(liveDialogText), true, "native must recognize the observed Gemini dialog text");
  assert.equal(native.deleteConfirmQuestionMatches("删除对话？"), true, "native must recognize a localized conversation title");
  assert.equal(native.deleteLabelMatchesExactish("Delete ".repeat(8), ["Delete"]), true, "native must accept any pure Delete repetition");
  assert.equal(native.deleteLabelMatchesExactish("Delete Cancel Delete", ["Delete"]), false, "native must reject mixed repeated labels");

  const repeatHelper = section(
    standaloneSource,
    "  const matchesExactLabelRepeats =",
    "\n  const MENU_ROOT_SELECTORS",
    "standalone repeated-label helper"
  );
  const questionHelpers = section(
    standaloneSource,
    "  function confirmQuestionMatches",
    "\n  function confirmRejectButtonMatches",
    "standalone confirmation text helpers"
  );
  const standalone = new Function(
    "normalize",
    "compact",
    `"use strict";\n${repeatHelper}\n${questionHelpers}\nreturn { matchesExactLabelRepeats, confirmQuestionMatches, confirmRootTextMatches };`
  )(normalize, compact);

  assert.equal(standalone.confirmQuestionMatches("Delete chat?"), true, "standalone must recognize Gemini's compact English title");
  assert.equal(standalone.confirmQuestionMatches("Delete chat"), false, "standalone must not treat an ordinary menu label as a confirmation question");
  assert.equal(standalone.confirmRootTextMatches(liveDialogText), true, "standalone must recognize the observed Gemini dialog text");
  assert.equal(standalone.confirmQuestionMatches("删除对话？"), true, "standalone must recognize a localized conversation title");
  assert.equal(standalone.matchesExactLabelRepeats("Delete ".repeat(8), ["Delete"]), true, "standalone must accept any pure Delete repetition");
  assert.equal(standalone.matchesExactLabelRepeats("Delete Cancel Delete", ["Delete"]), false, "standalone must reject mixed repeated labels");

  const nativeRoots = section(nativeSource, "  function deleteDialogRoots", "\n  function deleteConfirmQuestionMatches", "native dialog roots");
  const standaloneRoots = section(standaloneSource, "  function deleteDialogRoots", "\n  function findDeleteConfirmButtonInfo", "standalone dialog roots");
  for (const [name, source] of Object.entries({ native: nativeRoots, standalone: standaloneRoots })) {
    assert.match(source, /["']dialog["']/, `${name} must recognize native dialog elements`);
    assert.match(source, /\[aria-modal=['"]true['"]\]/, `${name} must recognize aria-modal dialogs`);
    assert.match(source, /mat-dialog-container/, `${name} must recognize Gemini's Angular dialog container`);
    assert.match(source, /\[class\*=.*modal/, `${name} must recognize modal class roots`);
    assert.match(source, /\[class\*=.*dialog/, `${name} must recognize dialog class roots`);
  }

  console.log("Gemini delete confirmation recognition parity: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
