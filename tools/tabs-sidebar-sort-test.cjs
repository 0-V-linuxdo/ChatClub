#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const {
    buildSidebarTree,
    normalizeTabsSidebarSortMode,
    sortSidebarItems
  } = await import(moduleUrl("app/workspace/tabs-sidebar-sort.js"));
  const { groupByDate } = await import(moduleUrl("shared/date-groups.js"));

  assert.equal(normalizeTabsSidebarSortMode("open"), "open");
  assert.equal(normalizeTabsSidebarSortMode("nope"), "time");
  assert.equal(normalizeTabsSidebarSortMode(""), "time");

  const now = new Date(2026, 7, 8, 12, 0, 0).getTime();
  const daysAgo = (days, hour = 12) => new Date(2026, 7, 8 - days, hour, 0, 0).getTime();
  const tabs = [
    { workspaceId: "page-older", live: false, updatedAt: daysAgo(31), topicTitle: "Older" },
    { workspaceId: "page-today", live: true, updatedAt: daysAgo(0), topicTitle: "Today" },
    { workspaceId: "page-week", live: false, updatedAt: daysAgo(2), topicTitle: "Week" },
    { workspaceId: "page-yesterday", live: true, updatedAt: daysAgo(1), topicTitle: "Yesterday" },
    { workspaceId: "page-month", live: false, detachedAt: daysAgo(8), topicTitle: "Month" }
  ];

  assert.equal(sortSidebarItems(tabs, { mode: "time", now }).find((item) => item.workspaceId === "page-month")?.detachedAt, daysAgo(8));
  const sorted = sortSidebarItems(tabs, { mode: "time", now });
  assert.deepEqual(sorted.map((item) => item.workspaceId), [
    "page-today",
    "page-yesterday",
    "page-week",
    "page-month",
    "page-older"
  ]);

  const tree = buildSidebarTree({ items: tabs, folders: [], mode: "time", now });
  assert.deepEqual(
    tree.map((node) => [node.id, (node.items || []).map((item) => item.workspaceId)]),
    [
      ["today", ["page-today"]],
      ["yesterday", ["page-yesterday"]],
      ["pastWeek", ["page-week"]],
      ["pastMonth", ["page-month"]],
      ["older", ["page-older"]]
    ]
  );
  assert.deepEqual(
    groupByDate(tabs, (item) => item.updatedAt ?? item.detachedAt, now, "workspace.tabs").map((group) => group.labelKey),
    [
      "workspace.tabs.today",
      "workspace.tabs.yesterday",
      "workspace.tabs.pastWeek",
      "workspace.tabs.pastMonth",
      "workspace.tabs.older"
    ]
  );

  const open = sortSidebarItems(tabs, { mode: "open", now });
  assert.deepEqual(open.filter((item) => item.live).map((item) => item.workspaceId), [
    "page-today",
    "page-yesterday"
  ]);
  assert.equal(open[0].live, true);
  assert.equal(open.at(-1).live, false);

  const named = sortSidebarItems(tabs, {
    mode: "name",
    getLabel: (item) => item.topicTitle,
    now
  });
  assert.deepEqual(named.map((item) => item.topicTitle), ["Month", "Older", "Today", "Week", "Yesterday"]);

  console.log("tabs sidebar sort: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
