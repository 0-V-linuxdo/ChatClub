#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const { groupPromptHistory, promptHistoryGroupId } = await import(moduleUrl("app/settings/history.js"));
  const now = new Date(2026, 7, 8, 12, 0, 0).getTime();
  const dateDaysAgo = (daysAgo, hour = 12) => new Date(2026, 7, 8 - daysAgo, hour, 0, 0).toISOString();

  assert.equal(promptHistoryGroupId(dateDaysAgo(0, 0), now), "today");
  assert.equal(promptHistoryGroupId(dateDaysAgo(1, 23), now), "yesterday");
  assert.equal(promptHistoryGroupId(dateDaysAgo(2), now), "pastWeek");
  assert.equal(promptHistoryGroupId(dateDaysAgo(7, 0), now), "pastWeek");
  assert.equal(promptHistoryGroupId(dateDaysAgo(8), now), "pastMonth");
  assert.equal(promptHistoryGroupId(dateDaysAgo(30, 0), now), "pastMonth");
  assert.equal(promptHistoryGroupId(dateDaysAgo(31), now), "older");
  assert.equal(promptHistoryGroupId("not-a-date", now), "older");

  const history = [
    { id: "older", createdAt: dateDaysAgo(31) },
    { id: "today", createdAt: dateDaysAgo(0) },
    { id: "week-1", createdAt: dateDaysAgo(2) },
    { id: "yesterday", createdAt: dateDaysAgo(1) },
    { id: "month", createdAt: dateDaysAgo(8) },
    { id: "week-2", createdAt: dateDaysAgo(7) },
    { id: "older-invalid", createdAt: "not-a-date" }
  ];
  assert.deepEqual(
    groupPromptHistory(history, now).map(({ id, items }) => [id, items.map((item) => item.id)]),
    [
      ["today", ["today"]],
      ["yesterday", ["yesterday"]],
      ["pastWeek", ["week-1", "week-2"]],
      ["pastMonth", ["month"]],
      ["older", ["older", "older-invalid"]]
    ],
    "history rows must render in Notion-style date groups while preserving order within each group"
  );

  console.log("prompt history grouping: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
