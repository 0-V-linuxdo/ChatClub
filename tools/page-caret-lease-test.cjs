#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const preload = read("content-src/preload.js");
const frameCommands = read("shared/frame-commands.js");
const background = read("background/runtime.js");
const frame = read("app/workspace/frame-controller.js");
const composer = read("app/composer/controller.js");
const sendRuntime = read("content-src/capabilities/send-runtime.js");
const agents = read("AGENTS.md");
const overlayCaret = read("tools/overlay-caret-lock-test.cjs");

assert.match(preload, /const PAGE_CARET_LEASE_MS = 180000/);
assert.match(preload, /const pageCaretLeaseActive = \(\) =>/);
assert.match(preload, /preferredModelRunActive\(\) \|\| pageCaretLeaseActive\(\)/);
assert.match(preload, /const adoptPageCaret = \(expiresAt, guardToken = ""\)/);
assert.match(preload, /const releasePageCaret = \(guardToken = ""\)/);
assert.match(preload, /const allowPageCaretFocus = \(callback\)/);
assert.match(preload, /addEventListener\("focusin", onPageCaretFocusIn, true\)/);
assert.match(preload, /markPageCaretTrustedPointer/);
assert.match(preload, /api: Object\.freeze\(\{ prepare, adoptPageCaret, releasePageCaret \}\)/);
assert.doesNotMatch(
  preload,
  /data-chatclub-preferred-model-focus-shield[\s\S]{0,80}pageCaretExpiresAt/,
  "page caret lease must not share the preferred-model attribute slot"
);

assert.match(frameCommands, /adoptPageCaretLease: command\(\{ timeoutMs: 1200, mutating: true, transport: "main-world", capability: "base" \}\)/);
assert.match(frameCommands, /releasePageCaretLease: command\(\{ timeoutMs: 1200, mutating: true, transport: "main-world", capability: "base" \}\)/);

assert.match(background, /adoptPageCaretLease: Object\.freeze\(\{ method: "adoptPageCaret", phase: "adopt" \}\)/);
assert.match(background, /releasePageCaretLease: Object\.freeze\(\{ method: "releasePageCaret", phase: "release" \}\)/);
assert.match(background, /spec\.method/);

assert.match(frame, /setOverlayCaretLeaseHandler/);
assert.match(frame, /overlaySearchCaretMode\(\) === "page"/);
assert.match(frame, /sendToContentFrame\(frame, "adoptPageCaretLease"/);
assert.match(frame, /sendToContentFrame\(frame, "releasePageCaretLease"/);
assert.match(frame, /pinOverlaySearchCaret\(\)/);
assert.doesNotMatch(frame, /FRAME_LOAD_SEARCH_FOCUS|setInterval\(.*150/);

assert.match(composer, /mode: "page"/);
assert.match(composer, /claimPromptCaret\(e\.target\)/);

assert.match(sendRuntime, /target\.focus\?\.\(\)/, "isolated send-runtime must keep native focus; MAIN-world lease does not wrap it");

assert.match(agents, /page-caret lease/);
assert.match(agents, /without waiting for an armed restore generation/);
assert.match(overlayCaret, /pin must not report success when focus does not land/);
assert.match(overlayCaret, /a page claim must adopt the child-document caret lease/);

console.log("page caret lease tests passed");
