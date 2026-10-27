import test from "node:test";
import assert from "node:assert/strict";
import { mergeRecord, alignTails, decide, markFrom, nextRetry, frameIdentity, turnsFrom } from "../src/plugins/full-text/model.js";

const fr = (msgs, extra = {}) => ({ appId: "ChatGPT", instanceId: "t1", href: "https://chatgpt.com/c/abc", messages: msgs.map(([role, text]) => ({ role, text })), ...extra });
const fp = (o = {}) => ({ ledgerVersion: 2, conversationKey: "chatgpt:abc", digest: "d2", granularity: "turns", tail: ["u:1", "a:1", "u:2", "a:2"], tailChars: 400, turnCount: 4, hasPair: true, generating: false, generatingSeenAgoMs: null, stableForMs: 30000, viewportAtEnd: true, visible: true, input: { seen: false, idleMs: null, editing: false }, href: "https://chatgpt.com/c/abc", ...o });

test("frame identity: stable href vs instance id", () => {
  assert.equal(frameIdentity({ href: "https://chatgpt.com/c/abc", instanceId: "x" }), "href:https://chatgpt.com/c/abc");
  assert.equal(frameIdentity({ href: "https://chatgpt.com/", instanceId: "x" }), "id:x");
  assert.equal(frameIdentity({ href: "https://www.notion.so/chat", instanceId: "y" }), "id:y");
});

test("merge: superset replaces, marks kept only when text unchanged, mark-only keeps updatedAt", () => {
  const t0 = new Date("2026-01-01T00:00:00Z");
  const a = mergeRecord(null, { workspaceId: "w", frames: [fr([["user", "hello there"], ["assistant", "hi"]], { capture: { digest: "d1" } })] }, t0).record;
  assert.equal(a.frames.length, 1);
  const same = mergeRecord(a, { workspaceId: "w", frames: [fr([["user", "hello there"], ["assistant", "hi"]])] }, new Date("2026-01-02T00:00:00Z"));
  assert.equal(same.changed, false);
  assert.equal(same.record.updatedAt, t0.toISOString());
  assert.equal(same.record.frames[0].capture.digest, "d1");
  const grown = mergeRecord(a, { workspaceId: "w", frames: [fr([["user", "hello there"], ["assistant", "hi"], ["user", "second question"], ["assistant", "ok"]])] });
  assert.equal(grown.changed, true);
  assert.equal(grown.record.frames[0].messages.length, 4);
  assert.equal(grown.record.frames[0].capture, undefined);
  const tail = mergeRecord(grown.record, { workspaceId: "w", frames: [fr([["user", "second question"], ["assistant", "ok, longer answer"]])] });
  assert.equal(tail.record.frames[0].messages.length, 4);
  assert.equal(tail.record.frames[0].messages[3].text, "ok, longer answer");
});

test("tail alignment relations", () => {
  assert.equal(alignTails(["u:1", "a:1"], ["u:1", "a:1"]).relation, "none");
  assert.deepEqual(alignTails(["u:1", "a:1"], ["u:1", "a:1", "u:2", "a:2"]), { relation: "append", firstNew: 2 });
  assert.equal(alignTails(["u:1", "a:1", "u:2", "a:2"], ["u:1", "a:1"]).relation, "behind");
  assert.equal(alignTails(["u:1", "a:1", "u:2", "a:2"], ["u:1", "a:1", "u:2", "a:3"]).relation, "last-changed");
  assert.equal(alignTails(["u:1", "a:1", "u:2", "a:2"], ["u:1", "a:1", "u:9", "a:9"]).relation, "rewound");
  assert.equal(alignTails(["u:1"], ["u:8", "a:8"]).relation, "diverged");
  assert.equal(turnsFrom(["u:1", "a:1", "u:2", "a:2"], 3), 2);
});

test("decide: never copies unchanged, waits for stability, copies growth", () => {
  const mark = markFrom(fp({ digest: "d1", tail: ["u:1", "a:1"], tailChars: 100 }), "idle");
  assert.equal(decide({ fp: fp({ digest: "d1" }), mark }).action, "skip");
  assert.equal(decide({ fp: null }).action, "wait");
  assert.equal(decide({ fp: fp({ conversationKey: null }) }).action, "skip");
  assert.equal(decide({ fp: fp({ generating: true }), mark }).action, "wait");
  assert.equal(decide({ fp: fp({ stableForMs: 1000 }), mark }).action, "wait");
  const d = decide({ fp: fp(), mark });
  assert.equal(d.action, "capture");
  assert.equal(d.turns, 2);
  // behind (scrolled up) is not growth
  assert.equal(decide({ fp: fp({ tail: ["u:1"] }), mark: markFrom(fp({ digest: "d1" }), "idle") }).action, "skip");
  // restored with no record: baseline first
  assert.equal(decide({ fp: fp(), state: { restored: true } }).action, "baseline");
  assert.equal(decide({ fp: fp(), state: {} }).reason, "not-ours");
  assert.equal(decide({ fp: fp(), state: { navigatedHere: true } }).action, "capture");
  // old record without a mark whose last user overlaps → adopt
  const rec = fr([["user", "the last question"], ["assistant", "x"]]);
  assert.equal(decide({ fp: fp({ lastUser: { head: "the last question", tail: "the last question" } }), record: rec }).action, "adopt");
  // rate limit and user editing
  assert.equal(decide({ fp: fp(), mark, rate: { captureTimes: [Date.now() - 1000] } }).reason, "rate-45s");
  assert.equal(decide({ fp: fp({ input: { seen: true, idleMs: 2000, editing: false } }), mark }).reason, "recent-input");
  assert.equal(decide({ fp: fp({ visible: false }), mark }).reason, "hidden");
});

test("retry transitions", () => {
  const now = 1_000_000;
  let e = nextRetry(null, "unmatched", "d", now);
  assert.equal(e.nextAt, now + 300000);
  e = nextRetry(e, "unmatched", "d", now);
  assert.equal(e.nextAt, 0);
  assert.equal(decide({ fp: fp({ digest: "d" }), state: { navigatedHere: true }, retry: e }).reason, "shelved");
  let r = nextRetry(null, "error", "d", now);
  assert.equal(r.nextAt, now + 30000);
  r = nextRetry(r, "same", "d", now);
  assert.equal(r.noiseStreak, 1);
});
