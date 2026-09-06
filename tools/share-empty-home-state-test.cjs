#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const runtime = read("app/runtime.js");
const workspace = read("app/workspace/controller.js");
const topbar = read("app/topbar/controller.js");
const topbarView = read("app/topbar/view.js");

assert.match(workspace, /function hasShareableActiveThreads\(\)/, "topbar Share availability must assemble on the workspace facade");
assert.match(
  functionSource(workspace, "hasShareableActiveThreads"),
  /conversationHrefFromLocation\(liveHrefForFrame\(iframe\)\)/,
  "Share availability must require a live conversation href"
);
assert.match(
  runtime,
  /createBindOnceControllerPort\("Workspace", \[[\s\S]*?"hasShareableActiveThreads"[\s\S]*?\]\)/,
  "the topbar workspace port must expose hasShareableActiveThreads before workspaceController exists"
);
assert.doesNotMatch(
  runtime,
  /canOpenShare:/,
  "runtime must not put Share availability on topbar actions; topbar is constructed first"
);
assert.match(topbar, /canOpenShare:\s*\(\)\s*=>\s*workspace\.hasShareableActiveThreads\(\)/);
assert.match(functionSource(topbar, "runMenuItem"), /if \(!workspace\.hasShareableActiveThreads\(\)\) return;/);
assert.match(
  functionSource(topbarView, "renderItem"),
  /item\.id === "share"[\s\S]*button\.disabled = !actions\.canOpenShare\(\)/,
  "the visible Share control must disable when no active pane has a conversation"
);
assert.match(
  functionSource(topbarView, "renderFoldedMenuButton"),
  /item\.id === "share" && !actions\.canOpenShare\(\)/,
  "the folded Share menu item must use the same availability as the visible control"
);
assert.match(
  functionSource(topbarView, "syncShareState"),
  /\[data-tooltip-id="topbar\.share"\][\s\S]*buttonNode\.disabled = disabled/,
  "location changes must refresh mounted Share disabled state without replacing the topbar"
);
assert.match(topbar, /syncShareState:\s*\(\)\s*=>\s*view\.syncShareState\(\)/, "Topbar must expose a light Share-state sync");
assert.match(
  functionSource(runtime, "handleWorkspaceFrameLifecycleChange"),
  /event\.type === "location" \|\| event\.type === "workspace-sync"[\s\S]*topbarController\.syncShareState\(\)/,
  "frame location and workspace membership must refresh the topbar Share control"
);
const openRuntime = functionSource(runtime, "openSharePanel", true);
assert.match(openRuntime, /hasShareableActiveThreads\(\)/);
assert.ok(
  openRuntime.indexOf("hasShareableActiveThreads()") < openRuntime.indexOf("ensureShareController"),
  "empty desks must not open the Share panel"
);

console.log("share empty-home state: ok");
