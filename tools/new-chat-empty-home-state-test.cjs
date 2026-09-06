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

assert.match(workspace, /function hasNewChatActiveThreads\(\)/, "topbar New Chat availability must assemble on the workspace facade");
assert.match(
  functionSource(workspace, "hasNewChatActiveThreads"),
  /conversationHrefFromLocation\(liveHrefForFrame\(iframe\)\)/,
  "New Chat availability must require a live conversation href"
);
assert.match(
  runtime,
  /createBindOnceControllerPort\("Workspace", \[[\s\S]*?"hasNewChatActiveThreads"[\s\S]*?\]\)/,
  "the topbar workspace port must expose hasNewChatActiveThreads before workspaceController exists"
);
assert.doesNotMatch(
  runtime,
  /canStartNewChat:/,
  "runtime must not put New Chat availability on topbar actions; topbar is constructed first"
);
assert.match(topbar, /canStartNewChat:\s*\(\)\s*=>\s*workspace\.hasNewChatActiveThreads\(\)/);
assert.match(functionSource(topbar, "runMenuItem"), /if \(!workspace\.hasNewChatActiveThreads\(\)\) return;/);
assert.match(
  functionSource(topbarView, "renderItem"),
  /item\.id === "newChat"[\s\S]*button\.disabled = !actions\.canStartNewChat\(\)/,
  "the visible New Chat control must disable when no active pane has a conversation"
);
assert.match(
  functionSource(topbarView, "renderFoldedMenuButton"),
  /item\.id === "newChat" && !actions\.canStartNewChat\(\)/,
  "the folded New Chat menu item must use the same availability as the visible control"
);
assert.match(
  functionSource(topbarView, "syncNewChatState"),
  /\[data-tooltip-id="topbar\.newChat"\][\s\S]*buttonNode\.disabled = disabled/,
  "location changes must refresh mounted New Chat disabled state without replacing the topbar"
);
assert.match(topbar, /syncNewChatState:\s*\(\)\s*=>\s*view\.syncNewChatState\(\)/, "Topbar must expose a light New Chat-state sync");
assert.match(
  functionSource(runtime, "handleWorkspaceFrameLifecycleChange"),
  /event\.type === "location" \|\| event\.type === "workspace-sync"[\s\S]*topbarController\.syncNewChatState\(\)/,
  "frame location and workspace membership must refresh the topbar New Chat control"
);
const newChatOnFrames = functionSource(runtime, "newChatOnFrames");
assert.match(newChatOnFrames, /hasNewChatActiveThreads\(\)/);
assert.ok(
  newChatOnFrames.indexOf("hasNewChatActiveThreads()")
    < newChatOnFrames.indexOf("preserveCurrentWorkspaceForNewChat"),
  "empty desks must not freeze a workspace before New Chat All"
);

console.log("new-chat empty-home state: ok");
