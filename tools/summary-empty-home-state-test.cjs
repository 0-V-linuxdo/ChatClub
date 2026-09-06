#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const summary = read("app/summary/controller.js");
const runtime = read("app/runtime.js");
const workspace = read("app/workspace/controller.js");
const topbar = read("app/topbar/controller.js");
const topbarView = read("app/topbar/view.js");

assert.match(summary, /function summaryLiveHref\(iframe, app\)/);
assert.match(summary, /iframe\?\.dataset\?\.currentHref/);
assert.doesNotMatch(
  functionSource(summary, "summaryLiveHref"),
  /currentThreadHref/,
  "Summarize availability must use the live frame href, not a remembered conversation route"
);
assert.match(summary, /function summaryHrefIsCollectable\(href\)/);
assert.match(functionSource(summary, "summaryHrefIsCollectable"), /conversationHrefFromLocation\(href\)/);
assert.match(summary, /function hasSummarizableFrames\(\)/);
assert.match(summary, /function canRunSummary\(\)/);
assert.match(
  functionSource(summary, "canRunSummary"),
  /hasSummarizableFrames\(\) \|\| Boolean\(\(state\.summaryContexts \|\| \[\]\)\.length\)/,
  "an already-collected context must keep Summarize available after the desk returns home"
);

const openSource = functionSource(summary, "openSummaryPanel");
assert.match(
  openSource,
  /if \(hasSummarizableFrames\(\)\) collectSummary\(\)/,
  "opening Summary on an empty-home desk must not collect"
);
assert.doesNotMatch(
  openSource,
  /syncSummaryPanel\(\);\s*collectSummary\(\)/,
  "open must not unconditionally collect after showing the panel"
);

const summarizeSource = functionSource(summary, "summarizeSummary", true);
assert.match(summarizeSource, /if \(!canRunSummary\(\)\) return;/);
const askSource = functionSource(summary, "askSummary", true);
assert.match(askSource, /if \(!canRunSummary\(\)\) return;/);

const renderPanel = functionSource(summary, "renderSummaryPanel");
assert.match(renderPanel, /const runnable = canRunSummary\(\)/);
assert.match(
  renderPanel,
  /summaryActionButton\(t\("summaryPanel.summarize"\), summarizeSummary, "secondary", state\.summaryBusy \|\| !runnable/,
  "the panel Summarize button must disable when no pane can be collected"
);
assert.match(
  renderPanel,
  /summaryActionButton\(t\("summaryPanel.ask"\), askSummary, "primary", state\.summaryBusy \|\| !hasQuestion \|\| !runnable/,
  "Ask must stay disabled on empty-home desks even after a question is typed"
);

const renderResult = functionSource(summary, "renderSummaryResult");
assert.match(
  renderResult,
  /canRunSummary\(\) \? t\("summaryPanel.noSummaryBody"\) : t\("summaryPanel.noMessages"\)/,
  "empty-home Summary copy must not tell the user to press a disabled Summarize control"
);

assert.match(summary, /syncSummarizeState:\s*syncSummarizeState/);
assert.match(
  functionSource(summary, "syncSummarizeState"),
  /\.summary-action-button-summary[\s\S]*disabled = state\.summaryBusy \|\| !runnable/,
  "location changes must refresh the mounted Summarize control without replacing the panel"
);

assert.match(
  functionSource(runtime, "handleWorkspaceFrameLifecycleChange"),
  /event\.type === "location" \|\| event\.type === "workspace-sync"[\s\S]*summaryController\?\.syncSummarizeState\?\.\(\)/,
  "frame location and workspace membership must refresh the panel Summarize control"
);

assert.match(
  workspace,
  /function hasSummarizableActiveThreads\(\)/,
  "topbar Summary availability must assemble on the workspace facade"
);
assert.match(
  runtime,
  /createBindOnceControllerPort\("Workspace", \[[\s\S]*?"hasSummarizableActiveThreads"[\s\S]*?\]\)/,
  "the topbar workspace port must expose hasSummarizableActiveThreads before workspaceController exists"
);
assert.doesNotMatch(
  runtime,
  /canOpenSummary:/,
  "runtime must not put Summary availability on topbar actions; topbar is constructed first"
);
assert.match(topbar, /canOpenSummary:\s*\(\)\s*=>\s*workspace\.hasSummarizableActiveThreads\(\)/);
assert.match(functionSource(topbar, "runMenuItem"), /if \(!workspace\.hasSummarizableActiveThreads\(\)\) return;/);
assert.match(
  functionSource(topbarView, "renderItem"),
  /item\.id === "summary"[\s\S]*button\.disabled = !actions\.canOpenSummary\(\)/,
  "the visible Summary control must disable when no active pane has a conversation"
);
assert.match(
  functionSource(topbarView, "renderFoldedMenuButton"),
  /item\.id === "summary" && !actions\.canOpenSummary\(\)/,
  "the folded Summary menu item must use the same availability as the visible control"
);
assert.match(
  functionSource(topbarView, "syncSummaryState"),
  /\[data-tooltip-id="topbar\.summary"\][\s\S]*buttonNode\.disabled = disabled/,
  "location changes must refresh mounted Summary disabled state without replacing the topbar"
);
assert.match(topbar, /syncSummaryState:\s*\(\)\s*=>\s*view\.syncSummaryState\(\)/, "Topbar must expose a light Summary-state sync");
assert.match(
  functionSource(runtime, "handleWorkspaceFrameLifecycleChange"),
  /event\.type === "location" \|\| event\.type === "workspace-sync"[\s\S]*topbarController\.syncSummaryState\(\)/,
  "frame location and workspace membership must refresh the topbar Summary control"
);
const openRuntime = functionSource(runtime, "openSummaryPanel", true);
assert.match(openRuntime, /hasSummarizableActiveThreads\(\)/);
assert.ok(
  openRuntime.indexOf("hasSummarizableActiveThreads()")
    < openRuntime.indexOf("requestFeatureUserScriptsPermission"),
  "empty desks must not request User Scripts permission to open Summary"
);

console.log("summary empty-home Summarize state: ok");
