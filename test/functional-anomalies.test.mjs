import test from "node:test";
import assert from "node:assert/strict";
import { redactText, sanitize, addRecord, MAX_RECORDS, hostOnly } from "../src/plugins/functional-anomalies/model.js";

test("redaction removes secrets, stacks, paths and URL details", () => {
  const s = redactText("Failed at https://chatgpt.com/c/abc?x=1 with Bearer abc.def\n    at foo (chrome-extension://x/y.js:1:2)\napi_key=sk-1234567890abcdef token: zzz /Users/me/file.txt data:image/png;base64,AAAA example.com/private/path");
  assert.ok(!/abc\?x/.test(s), s);
  assert.ok(s.includes("https://chatgpt.com"));
  assert.ok(!s.includes("at foo"));
  assert.ok(!s.includes("sk-1234567890abcdef"));
  assert.ok(!s.includes("zzz"));
  assert.ok(!s.includes("/Users/me"));
  assert.ok(s.includes("[data-url]"));
  assert.ok(s.includes("example.com") && !s.includes("/private/path"));
  assert.equal(redactText("eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl"), "[redacted]");
  assert.equal(hostOnly("https://claude.ai/chat/1"), "claude.ai");
});

test("sanitize clips fields and keeps delivered tri-state", () => {
  const r = sanitize({ feature: "x".repeat(200), operation: "op", delivered: "yes", url: "https://a.b.com/x" });
  assert.equal(r.feature.length, 80);
  assert.equal(r.delivered, null);
  assert.equal(r.host, "a.b.com");
  assert.equal(r.severity, "error");
});

test("same fingerprint merges within 5 minutes; cap at 200", () => {
  let list = [];
  let n = 0;
  const uuid = () => `u${n++}`;
  ({ records: list } = addRecord(list, { feature: "topicDeletion", operation: "deleteTopic", reason: "no-menu" }, { now: 1000, uuid }));
  ({ records: list } = addRecord(list, { feature: "topicDeletion", operation: "deleteTopic", reason: "no-menu" }, { now: 2000, uuid }));
  assert.equal(list.length, 1);
  assert.equal(list[0].count, 2);
  assert.equal(list[0].createdAt, 1000);
  ({ records: list } = addRecord(list, { feature: "topicDeletion", operation: "deleteTopic", reason: "no-menu" }, { now: 2000 + 6 * 60 * 1000, uuid }));
  assert.equal(list.length, 2);
  for (let i = 0; i < 250; i++) ({ records: list } = addRecord(list, { feature: "f", reason: `r${i}` }, { now: 10_000_000 + i, uuid }));
  assert.equal(list.length, MAX_RECORDS);
  assert.equal(list[0].reason, "r249");
});
