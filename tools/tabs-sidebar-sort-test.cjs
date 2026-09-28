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
    sortSidebarItems,
    TABS_SIDEBAR_SORT_LABEL_KEYS,
    TABS_SIDEBAR_SORT_MODES
  } = await import(moduleUrl("app/workspace/tabs-sidebar-sort.js"));
  const { groupByDate } = await import(moduleUrl("shared/date-groups.js"));

  assert.deepEqual([...TABS_SIDEBAR_SORT_MODES], ["name", "created", "activity"], "the sort menu offers Name, Date created, Last activity in that order");
  assert.deepEqual({ ...TABS_SIDEBAR_SORT_LABEL_KEYS }, {
    name: "workspace.tabs.sortName",
    created: "workspace.tabs.sortCreated",
    activity: "workspace.tabs.sortActivity"
  });
  assert.equal(normalizeTabsSidebarSortMode("name"), "name");
  assert.equal(normalizeTabsSidebarSortMode("created"), "created");
  assert.equal(normalizeTabsSidebarSortMode("activity"), "activity");
  for (const retired of ["viewed", "edited", "open", "time"]) {
    assert.equal(normalizeTabsSidebarSortMode(retired), "activity", `a saved ${retired} sort must land on Last activity`);
  }
  assert.equal(normalizeTabsSidebarSortMode("nope"), "activity");
  assert.equal(normalizeTabsSidebarSortMode(""), "activity");

  const now = new Date(2026, 7, 8, 12, 0, 0).getTime();
  const daysAgo = (days, hour = 12) => new Date(2026, 7, 8 - days, hour, 0, 0).getTime();
  const tabs = [
    { workspaceId: "page-older", live: false, updatedAt: daysAgo(31), topicTitle: "Older" },
    { workspaceId: "page-today", live: true, updatedAt: daysAgo(0), topicTitle: "Today" },
    { workspaceId: "page-week", live: false, updatedAt: daysAgo(2), topicTitle: "Week" },
    { workspaceId: "page-yesterday", live: true, updatedAt: daysAgo(1), topicTitle: "Yesterday" },
    { workspaceId: "page-month", live: false, detachedAt: daysAgo(8), topicTitle: "Month" }
  ];

  assert.equal(sortSidebarItems(tabs, { mode: "activity", now }).find((item) => item.workspaceId === "page-month")?.detachedAt, daysAgo(8));
  const sorted = sortSidebarItems(tabs, { mode: "time", now });
  assert.deepEqual(sorted.map((item) => item.workspaceId), [
    "page-today",
    "page-yesterday",
    "page-week",
    "page-month",
    "page-older"
  ]);

  const tree = buildSidebarTree({ items: tabs, folders: [], mode: "activity", now });
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

  const stamped = [
    {
      workspaceId: "page-viewed",
      live: true,
      topicTitle: "Viewed",
      viewedAt: daysAgo(0),
      editedAt: daysAgo(8),
      createdAt: daysAgo(31)
    },
    {
      workspaceId: "page-edited",
      live: true,
      topicTitle: "Edited",
      viewedAt: daysAgo(2),
      editedAt: daysAgo(0),
      createdAt: daysAgo(8)
    },
    {
      workspaceId: "page-created",
      live: true,
      topicTitle: "Created",
      viewedAt: daysAgo(8),
      editedAt: daysAgo(2),
      createdAt: daysAgo(0)
    }
  ];
  assert.deepEqual(
    sortSidebarItems(stamped, { mode: "activity", now }).map((item) => item.workspaceId),
    ["page-created", "page-edited", "page-viewed"],
    "each stamped desk was touched today in some way, so Last activity ties and the id breaks it"
  );
  assert.deepEqual(
    sortSidebarItems([
      { workspaceId: "page-a", viewedAt: daysAgo(3), editedAt: daysAgo(1), createdAt: daysAgo(9) },
      { workspaceId: "page-b", viewedAt: daysAgo(2), editedAt: daysAgo(5), createdAt: daysAgo(9) },
      { workspaceId: "page-c", viewedAt: daysAgo(4), editedAt: daysAgo(4), updatedAt: daysAgo(0), createdAt: daysAgo(9) }
    ], { mode: "activity", now }).map((item) => item.workspaceId),
    ["page-c", "page-a", "page-b"],
    "an edit newer than the last view must count as activity"
  );
  assert.deepEqual(
    sortSidebarItems(stamped, { mode: "created", now }).map((item) => item.workspaceId),
    ["page-created", "page-edited", "page-viewed"]
  );
  assert.deepEqual(
    buildSidebarTree({ items: stamped, folders: [], mode: "created", now }).map((node) => node.id),
    ["today", "pastMonth", "older"]
  );
  assert.deepEqual(
    buildSidebarTree({ items: stamped, folders: [], mode: "activity", now }).map((node) => node.id),
    ["today"]
  );
  assert.equal(
    buildSidebarTree({ items: tabs, folders: [], mode: "open", now }).some((node) => node.type === "divider"),
    false,
    "a saved Open first sort must not bring back the open/closed divider"
  );

  const pinnedTree = buildSidebarTree({ items: tabs, folders: [], mode: "created", pinnedOrder: ["page-older"], now });
  assert.equal(pinnedTree[0].id, "pinned");
  assert.deepEqual(pinnedTree[0].items.map((item) => item.workspaceId), ["page-older"]);

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
