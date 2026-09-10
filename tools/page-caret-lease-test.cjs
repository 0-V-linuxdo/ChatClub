#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const preload = read("content-src/preload.js");
const frameCommands = read("shared/frame-commands.js");
const background = read("background/runtime.js");
const frame = read("app/workspace/frame-controller.js");
const lease = read("app/workspace/page-caret-lease.js");
const composer = read("app/composer/controller.js");
const sendRuntime = read("content-src/capabilities/send-runtime.js");
const agents = read("AGENTS.md");
const overlayCaret = read("tools/overlay-caret-lock-test.cjs");

assert.match(preload, /const PAGE_CARET_LEASE_MS = 180000/);
assert.match(preload, /const PAGE_CARET_STORAGE_KEY = "chatclub_page_caret_until"/);
assert.match(preload, /const PAGE_CARET_NAME_UNTIL = "chatclub_page_caret_until"/);
assert.match(preload, /const PAGE_CARET_NAME_TOKEN = "chatclub_page_caret_token"/);
assert.match(preload, /const PAGE_CARET_MESSAGE_SOURCE = "chatclub-page-caret"/);
assert.match(preload, /function consumePageCaretBootstrap\(\)/);
assert.match(preload, /function writePageCaretBootstrap\(/);
assert.match(preload, /const consumedPageCaret = consumePageCaretBootstrap\(\)/);
assert.match(preload, /const pageCaretLeaseActive = \(\) =>/);
assert.match(preload, /preferredModelRunActive\(\) \|\| pageCaretLeaseActive\(\)/);
assert.match(preload, /const adoptPageCaret = \(expiresAt, guardToken = ""\)/);
assert.match(preload, /const releasePageCaret = \(guardToken = ""\)/);
assert.match(preload, /const allowPageCaretFocus = \(callback\)/);
assert.match(preload, /addEventListener\("focusin", onPageCaretFocusIn, true\)/);
assert.match(preload, /markPageCaretTrustedPointer/);
// The parent cannot see a pointerdown routed into this site-isolated frame; every trusted click is
// reported so the composer leaves instead of reclaiming, regardless of lease state.
assert.match(
  preload,
  /postMessage\(\{ source: PAGE_CARET_MESSAGE_SOURCE, action: "pointer" \}/,
  "child shield must report trusted pointerdown to the parent"
);
const trustedPointerSource = preload.slice(
  preload.indexOf("const notifyPageCaretTrustedPointer"),
  preload.indexOf("try { guardedElementFocus.toString")
);
assert.match(trustedPointerSource, /window\.parent !== window/);
assert.match(trustedPointerSource, /pageCaretTrustedAt = Date\.now\(\);\s*notifyPageCaretTrustedPointer\(\);/);
assert.doesNotMatch(trustedPointerSource, /pageCaretLeaseActive\(\)/, "the pointer report must not depend on the lease");
// When the parent reclaimed before the report landed and then hands the frame back, the caret goes
// back onto the element the user's click focused; never onto anything else, never outside 1s.
assert.match(preload, /const restorePageCaretTrustedFocus = \(\) =>/);
assert.match(preload, /window\.addEventListener\("focus", restorePageCaretTrustedFocus\)/);
const restoreSource = preload.slice(
  preload.indexOf("const restorePageCaretTrustedFocus"),
  preload.indexOf("const notifyPageCaretTrustedPointer")
);
assert.match(restoreSource, /if \(!pageCaretTrustedRecently\(\)\) return;/);
assert.match(restoreSource, /active !== document\.body && active !== document\.documentElement\) return;/);
assert.match(restoreSource, /allowPageCaretFocus\(/);
assert.match(preload, /pageCaretTrustedRecently\(\) && target && target !== window && target !== document\) pageCaretTrustedFocus = target;/);
assert.match(preload, /api: Object\.freeze\(\{ prepare, preparePageCaret, adoptPageCaret, releasePageCaret \}\)/);
assert.match(
  preload,
  /postMessage\(\{ source: PAGE_CARET_MESSAGE_SOURCE, action: "stolen" \}/,
  "child autofocus blur must tell the parent to re-pin the prompt browsing context"
);
assert.doesNotMatch(
  preload,
  /data-chatclub-preferred-model-focus-shield[\s\S]{0,80}pageCaretExpiresAt/,
  "page caret lease must not share the preferred-model attribute slot"
);
assert.match(lease, /const PAGE_CARET_NAME_UNTIL = "chatclub_page_caret_until"/);
assert.match(lease, /const PAGE_CARET_NAME_TOKEN = "chatclub_page_caret_token"/);
assert.match(lease, /FOCUS_GUARD_NAME_SUFFIX/);
assert.match(lease, /const PAGE_CARET_REFRESH_RETRY_MS = 150/);
assert.match(lease, /const PAGE_CARET_REFRESH_SETTLE_MS = 2500/);
assert.match(lease, /const PAGE_CARET_REFRESH_MAX_MS = 8000/);
assert.match(lease, /setInterval\(\(\) => \{ if \(!tick\(\)\) stop\(\); \}, PAGE_CARET_REFRESH_RETRY_MS\)/);
assert.match(lease, /send\("preparePageCaretLease"/);
assert.match(lease, /"adoptPageCaretLease"/);
assert.match(lease, /"releasePageCaretLease"/);
assert.match(lease, /overlaySearchCaretMode\(\) === "overlay"/);
assert.match(lease, /overlaySearchCaretComposer/);
assert.match(lease, /function leaseArmed/);
assert.match(lease, /params\.delete\(PAGE_CARET_NAME_UNTIL\)/);
assert.match(lease, /contentWindow/);
assert.match(lease, /onAdopted/);
assert.match(lease, /settlePromise/);
assert.match(lease, /sendToContentFrame\(\s*frame,\s*"preparePageCaretLease"/);

const consumeSource = preload.slice(
  preload.indexOf("function consumePageCaretBootstrap"),
  preload.indexOf("function writePageCaretBootstrap")
);
assert.match(consumeSource, /about:blank/);
assert.match(consumeSource, /href\.startsWith\("about:"\)/);
assert.doesNotMatch(
  consumeSource,
  /params\.delete\(PAGE_CARET_NAME_UNTIL\)/,
  "consume must keep window.name seeds until release"
);
assert.doesNotMatch(
  consumeSource,
  /sessionStorage\.removeItem\(PAGE_CARET_STORAGE_KEY\)/,
  "consume must keep sessionStorage seeds until release"
);
assert.match(preload, /const releasePageCaret = \(message = \{\}\) =>/);
assert.match(
  preload.slice(preload.indexOf("const releasePageCaret = (message"), preload.indexOf("runtimes.register(NAVIGATION_FOCUS_GUARD_RUNTIME")),
  /params\.delete\(PAGE_CARET_NAME_UNTIL\)/,
  "release must strip window.name page-caret seeds"
);
assert.match(preload, /evictPageCaretFocus/);
assert.match(
  preload,
  /querySelectorAll\("\[autofocus\]"\)/,
  "child document_start shield must evict native [autofocus] while the page-caret lease is active"
);
const focusInSource = preload.slice(
  preload.indexOf("const onPageCaretFocusIn"),
  preload.indexOf("const markPageCaretTrustedPointer")
);
assert.doesNotMatch(
  focusInSource,
  /target === document\.body \|\| target === document\.documentElement/,
  "body/html/window focusin must count as stolen under a page-caret lease"
);
assert.match(focusInSource, /notifyPageCaretStolen/);

assert.match(frameCommands, /preparePageCaretLease: command\(\{ timeoutMs: 1200, mutating: true, transport: "main-world", capability: "base" \}\)/);
assert.match(frameCommands, /adoptPageCaretLease: command\(\{ timeoutMs: 1200, mutating: true, transport: "main-world", capability: "base" \}\)/);
assert.match(frameCommands, /releasePageCaretLease: command\(\{ timeoutMs: 1200, mutating: true, transport: "main-world", capability: "base" \}\)/);

assert.match(background, /preparePageCaretLease: Object\.freeze\(\{ method: "preparePageCaret", phase: "prepare" \}\)/);
assert.match(background, /adoptPageCaretLease: Object\.freeze\(\{ method: "adoptPageCaret", phase: "adopt" \}\)/);
assert.match(background, /releasePageCaretLease: Object\.freeze\(\{ method: "releasePageCaret", phase: "release" \}\)/);
assert.match(background, /spec\.method/);

assert.match(frame, /createPageCaretLease/);
assert.match(frame, /setOverlayCaretLeaseHandler/);
assert.match(frame, /overlaySearchCaretMode\(\) === "page"/);
assert.match(frame, /pageCaret\.writeNameParams\(params\)/);
assert.match(frame, /pageCaret\.adopt\(iframe\)/);
assert.match(frame, /pageCaret\.refresh\(iframe\)/);
assert.match(frame, /pinOverlaySearchCaret\(\)/);
assert.doesNotMatch(frame, /FRAME_LOAD_SEARCH_FOCUS|setInterval\(.*150/);
assert.match(frame, /function beginFrameLoading[\s\S]*pageCaret\.adopt\(iframe\)/);
assert.ok(
  frame.indexOf("pageCaret.adopt(iframe)") < frame.indexOf("iframe.src = navigationUrl"),
  "page-caret prepare/stamp must run before the iframe src assignment"
);
assert.match(frame, /function assignFrameSrc[\s\S]*pageCaret\.adopt\(iframe\)[\s\S]*iframe\.src = navigationUrl/);
assert.match(frame, /function setFrameSrcAfterPrepare[\s\S]*pageCaret\.adopt\(iframe\)[\s\S]*iframe\.setAttribute\("src"/);
assert.match(frame, /onAdopted\(\) \{/);

assert.match(composer, /composer: true/);
assert.match(composer, /mode: "overlay"/);
assert.doesNotMatch(composer, /mode: "page"/);
assert.match(composer, /claimPromptCaret\(e\.target\)/);

assert.match(sendRuntime, /target\.focus\?\.\(\)/, "isolated send-runtime must keep native focus; MAIN-world lease does not wrap it");

assert.match(agents, /page-caret lease/);
assert.match(agents, /without waiting for an armed restore generation/);
assert.match(agents, /chatclub_page_caret_until/);
assert.match(agents, /document_start/);
assert.match(agents, /chatclub-page-caret/);
assert.match(overlayCaret, /pin must not report success when focus does not land/);
assert.match(overlayCaret, /a page claim must adopt the child-document caret lease/);
assert.match(overlayCaret, /pin must not report success when document.hasFocus\(\) is false/);
assert.match(overlayCaret, /a child stolen message must re-pin the prompt/);
assert.match(overlayCaret, /pin uses window.focus/);
assert.match(overlayCaret, /a page claim must keep chat-frames inert/);
assert.match(overlayCaret, /a trusted pointer on the frame wrap must leave and un-inert/);
assert.match(agents, /chat-frame-wrap/);

(async () => {
  const { createPageCaretLease } = await import(pathToFileURL(path.join(root, "app/workspace/page-caret-lease.js")).href);
  let mode = "page";
  const sent = [];
  const leaseApi = createPageCaretLease({
    sendToContentFrame(_frame, command, data) {
      sent.push({ command, data });
      return { ok: true, documentToken: "doc-1" };
    },
    overlaySearchCaretMode: () => mode,
    timeoutMs: 20
  });
  const params = new URLSearchParams("chatclub_webview=&app=ChatGPT");
  leaseApi.writeNameParams(params);
  assert.ok(Number(params.get("chatclub_page_caret_until")) > Date.now(), "page mode must stamp a future page-caret until");
  assert.match(String(params.get("chatclub_page_caret_token") || ""), /./);
  assert.equal(params.get("chatclub_webview"), "");
  assert.equal(params.get("chatclub_focus_guard_until"), null);
  mode = "";
  leaseApi.writeNameParams(params);
  assert.ok(params.get("chatclub_page_caret_until"), "an armed lease must keep stamping even when caret mode is empty");
  mode = "overlay";
  leaseApi.writeNameParams(params);
  assert.equal(params.get("chatclub_page_caret_until"), null, "overlay mode must strip page-caret name params");
  assert.equal(params.get("chatclub_page_caret_token"), null);
  sent.length = 0;
  leaseApi.adopt({ isConnected: false });
  assert.equal(sent.length, 0, "overlay mode must not prepare a page-caret lease");

  let composer = false;
  const composerLease = createPageCaretLease({
    sendToContentFrame(_frame, command, data) {
      sent.push({ command, data });
      return { ok: true, documentToken: "doc-composer" };
    },
    overlaySearchCaretMode: () => "overlay",
    overlaySearchCaretComposer: () => composer,
    timeoutMs: 20
  });
  const composerParams = new URLSearchParams("chatclub_webview=&app=ChatGPT");
  composer = false;
  composerLease.writeNameParams(composerParams);
  assert.equal(composerParams.get("chatclub_page_caret_until"), null, "overlay search without composer must still strip page-caret name params");
  composer = true;
  composerLease.writeNameParams(composerParams);
  assert.ok(Number(composerParams.get("chatclub_page_caret_until")) > Date.now(), "composer overlay must stamp a future page-caret until");
  assert.match(String(composerParams.get("chatclub_page_caret_token") || ""), /./);

  class HTMLIFrameElement {}
  globalThis.HTMLIFrameElement = HTMLIFrameElement;
  const frame = new HTMLIFrameElement();
  frame.isConnected = true;
  frame.name = "";
  frame.getAttribute = () => frame.name;
  frame.setAttribute = (_key, value) => { frame.name = value; };
  Object.defineProperty(frame, "contentWindow", { value: { name: "" }, configurable: true });
  sent.length = 0;
  const composerAdopt = await composerLease.adopt(frame);
  assert.equal(composerAdopt.ok, true, "composer overlay must prepare a page-caret lease");
  assert.equal(sent[0]?.command, "preparePageCaretLease");
  assert.match(String(frame.name), /chatclub_page_caret_until=/);
  let resolvePrepare;
  let adopted = 0;
  const pending = [];
  mode = "page";
  const waiting = createPageCaretLease({
    sendToContentFrame(_frame, command, data) {
      pending.push({ command, data });
      if (command === "preparePageCaretLease") {
        return new Promise((resolve) => {
          resolvePrepare = () => {
            resolve({ ok: true, documentToken: "doc-1" });
          };
        });
      }
      return { ok: true, documentToken: "doc-1" };
    },
    overlaySearchCaretMode: () => mode,
    timeoutMs: 80,
    onAdopted() { adopted += 1; }
  });
  let adoptSettled = false;
  const adoptResult = waiting.adopt(frame).then((result) => {
    adoptSettled = true;
    return result;
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 5);
  });
  assert.equal(adoptSettled, false, "adopt must await preparePageCaretLease before resolving");
  assert.equal(pending[0]?.command, "preparePageCaretLease");
  resolvePrepare();
  const result = await adoptResult;
  assert.equal(result.ok, true);
  assert.equal(adopted, 1, "a successful adopt ACK must re-pin through onAdopted");
  assert.match(String(frame.name), /chatclub_page_caret_until=/);
  assert.match(String(frame.contentWindow.name), /chatclub_page_caret_token=/);
  console.log("page caret lease tests passed");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
