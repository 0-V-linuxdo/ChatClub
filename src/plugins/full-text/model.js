// Full-text records and the "when to copy" rules (v2 04 §5.3, §5.5–§5.7). Pure functions, shared by
// the page scheduler and the background store.

import { pairMessages, textsOverlap } from "../../lib/conversation.js";

export const LIMITS = { workspaces: 80, frames: 12, messages: 200, chars: 20000 };
export const LEDGER_VERSION = 2;
export const HEARTBEAT_MS = 25000;

/** Stable identity of a stored frame inside one workspace record. */
export function frameIdentity(frame) {
  let url = null;
  try {
    url = new URL(frame.href);
  } catch {
    url = null;
  }
  if (url) {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const unstable = path === "/" || path === "/ai" || path === "/new"
      || (/(^|\.)gemini\.google\.com$/.test(url.hostname) && path === "/app")
      || (/notion\.(so|com)$/.test(url.hostname) && path === "/chat" && !url.searchParams.get("t"));
    if (!unstable) return `href:${url.href}`;
  }
  if (frame.instanceId) return `id:${frame.instanceId}`;
  return String(frame.href ?? "");
}

export function cleanFrame(frame, order = 0) {
  const messages = (frame?.messages ?? [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && String(m.text ?? "").trim())
    .slice(-LIMITS.messages)
    .map((m) => ({ role: m.role, text: String(m.text).slice(0, LIMITS.chars) }));
  if (!messages.length) return null;
  const out = {
    appId: String(frame.appId ?? ""),
    instanceId: String(frame.instanceId ?? ""),
    href: String(frame.href ?? ""),
    title: String(frame.title ?? ""),
    appName: String(frame.appName ?? ""),
    logoUrl: String(frame.logoUrl ?? ""),
    messages,
    order,
  };
  if (frame.capture && typeof frame.capture === "object") out.capture = { ...frame.capture };
  return out;
}

const sameMessages = (a, b) => a.length === b.length && a.every((m, i) => m.role === b[i].role && m.text === b[i].text);
const longer = (a, b) => (String(b).length > String(a).length ? b : a);

/** Merge of one frame's new text into its stored version (04 §5.3 "写入合并规则"). */
export function mergeFrame(oldFrame, newFrame) {
  const oldPairs = pairMessages(oldFrame.messages);
  const newPairs = pairMessages(newFrame.messages);
  let messages;
  const covered = oldPairs.every((op) => newPairs.some((np) => textsOverlap(op.user, np.user)));
  if (covered && newPairs.length >= oldPairs.length) messages = newFrame.messages;
  else {
    const used = new Set();
    const merged = oldPairs.map((op) => {
      const i = newPairs.findIndex((np, k) => !used.has(k) && textsOverlap(op.user, np.user));
      if (i < 0) return op;
      used.add(i);
      return { user: longer(op.user, newPairs[i].user), assistant: longer(op.assistant, newPairs[i].assistant) };
    });
    newPairs.forEach((np, k) => {
      if (!used.has(k)) merged.push(np);
    });
    messages = merged.flatMap((p) => [{ role: "user", text: p.user }, { role: "assistant", text: p.assistant }]);
  }
  const textSame = sameMessages(messages, oldFrame.messages);
  const out = { ...oldFrame, ...newFrame, messages };
  if (newFrame.capture) out.capture = newFrame.capture;
  else if (textSame && oldFrame.capture) out.capture = oldFrame.capture;
  else delete out.capture;
  return { frame: out, textChanged: !textSame };
}

/**
 * Applies new frames to a workspace record. Returns { record, changed } where `changed` is false when
 * only marks moved (updatedAt then stays as it was).
 */
export function mergeRecord(old, { workspaceId, topicTitle, frames }, now = new Date()) {
  const base = old && Array.isArray(old.frames) ? old : { workspaceId, topicTitle: "", updatedAt: now.toISOString(), frames: [] };
  const list = base.frames.map((f) => ({ ...f }));
  let changed = !old;
  for (const raw of frames ?? []) {
    const nf = cleanFrame(raw);
    if (!nf) continue;
    const id = frameIdentity(nf);
    const i = list.findIndex((f) => frameIdentity(f) === id);
    if (i < 0) {
      list.push(nf);
      changed = true;
    } else {
      const { frame, textChanged } = mergeFrame(list[i], nf);
      list[i] = frame;
      if (textChanged) changed = true;
    }
  }
  const kept = list.slice(-LIMITS.frames).map((f, order) => ({ ...f, order }));
  const record = {
    workspaceId,
    topicTitle: topicTitle ?? base.topicTitle ?? "",
    updatedAt: changed ? now.toISOString() : base.updatedAt,
    frames: kept,
  };
  return { record, changed };
}

// ---------------------------------------------------------------- growth alignment (04 §5.6 step 6)

/**
 * Relation of the current tail to the reference tail: none | behind | append | last-changed | rewound | diverged,
 * plus the index (in the current tail) of the first new entry.
 */
export function alignTails(ref, cur) {
  if (!ref?.length || !cur?.length) return { relation: "diverged", firstNew: 0 };
  const refLast = ref[ref.length - 1];
  if (cur[cur.length - 1] === refLast) return { relation: "none", firstNew: cur.length };
  const j = cur.lastIndexOf(refLast);
  if (j >= 0) {
    let ok = true;
    for (let k = 1; k <= 2; k += 1) {
      if (ref.length - 1 - k < 0 || j - k < 0) break;
      if (ref[ref.length - 1 - k] !== cur[j - k]) ok = false;
    }
    if (ok) return { relation: "append", firstNew: j + 1 };
  }
  const curLast = cur[cur.length - 1];
  const k = ref.lastIndexOf(curLast);
  if (k >= 0 && k < ref.length - 1) return { relation: "behind", firstNew: cur.length };
  if (cur.length >= 2 && ref.length >= 2 && cur[cur.length - 2] === ref[ref.length - 2] && curLast.startsWith("a:")) return { relation: "last-changed", firstNew: cur.length - 1 };
  for (let i = ref.length - 2; i >= 0; i -= 1) {
    const p = cur.lastIndexOf(ref[i]);
    if (p >= 0 && p < cur.length - 1) return { relation: "rewound", firstNew: p + 1 };
  }
  return { relation: "diverged", firstNew: 0 };
}

/** Turns to copy so the slice starts at the user turn that opened the exchange (min 2). */
export function turnsFrom(cur, firstNew) {
  let start = Math.min(firstNew, cur.length - 1);
  while (start > 0 && !cur[start].startsWith("u:")) start -= 1;
  return Math.max(2, cur.length - start);
}

/**
 * The decision of 04 §5.6. Inputs:
 *  fp: fingerprint from the frame; mark: stored mark (or null); record: stored frame (or null);
 *  state: { restored, sentHere, navigatedHere, baseline, promptHint } per frame;
 *  retry: retry entry for (workspace, conversation) or null; now: ms.
 * Returns { action: skip|wait|baseline|adopt|capture, turns?, waitMs?, reason, relation?, source? }.
 */
export function decide({ fp, mark, record, state = {}, retry = null, now = Date.now(), rate = {} }) {
  if (!fp || fp.ledgerVersion !== LEDGER_VERSION) return { action: "wait", waitMs: HEARTBEAT_MS, reason: "no-ledger" };
  if (!fp.conversationKey) return { action: "skip", reason: "no-key" };
  const validMark = mark && mark.v === fp.ledgerVersion && mark.conversationKey === fp.conversationKey ? mark : null;
  if (validMark && validMark.digest === fp.digest) return { action: "skip", reason: "unchanged" };
  if (fp.generating) return { action: "wait", waitMs: HEARTBEAT_MS, reason: "generating" };
  const recentGen = fp.generatingSeenAgoMs !== null && fp.generatingSeenAgoMs !== undefined && fp.generatingSeenAgoMs < 10 * 60 * 1000;
  const needStable = recentGen ? 5000 : 20000;
  if (fp.stableForMs < needStable) return { action: "wait", waitMs: needStable - fp.stableForMs + 50, reason: "settling" };

  const cur = fp.tail ?? [];
  const promptHit = !!(state.promptHint && fp.containsPrompt);
  const growth = (refTail, refAtMs, refTailChars) => {
    if (fp.granularity === "none") return promptHit ? { ok: true, turns: 0, relation: "prompt" } : { ok: false, reason: "no-turns" };
    const { relation, firstNew } = alignTails(refTail, cur);
    if (relation === "none" || relation === "behind") return { ok: false, reason: relation, relation };
    if (fp.granularity === "blocks" && !promptHit) return { ok: false, reason: "blocks-no-prompt", relation };
    const genAfterRef = fp.generatingSeenAgoMs !== null && fp.generatingSeenAgoMs !== undefined && refAtMs && now - fp.generatingSeenAgoMs > refAtMs;
    const newUser = relation === "append" && cur.slice(firstNew).some((e) => e.startsWith("u:"));
    const bigText = Math.abs((fp.tailChars ?? 0) - (refTailChars ?? 0)) >= 64;
    if (!(promptHit || genAfterRef || newUser || bigText)) return { ok: false, reason: "no-evidence", relation };
    if (relation === "append" || relation === "rewound") return { ok: true, turns: turnsFrom(cur, firstNew), relation };
    if (relation === "last-changed") return { ok: true, turns: 2, relation };
    if (fp.viewportAtEnd) return { ok: true, turns: 12, relation };
    return { ok: false, wait: true, reason: "diverged-not-at-end", relation };
  };

  let plan = null;
  if (validMark) {
    const g = growth(validMark.tail, Date.parse(validMark.capturedAt) || 0, validMark.tailChars);
    if (!g.ok) return g.wait ? { action: "wait", waitMs: HEARTBEAT_MS, reason: g.reason, relation: g.relation } : { action: "skip", reason: g.reason, relation: g.relation };
    plan = { turns: validMark.source === "adopted-unverified" && g.turns > 0 ? Math.max(12, g.turns) : g.turns, relation: g.relation, reason: `mark:${g.relation}` };
  } else if (record && pairMessages(record.messages).length) {
    const lastRecordUser = [...record.messages].reverse().find((m) => m.role === "user")?.text ?? "";
    const curUser = fp.lastUser ? `${fp.lastUser.head}` : "";
    if (!curUser || !lastRecordUser || textsOverlap(curUser, lastRecordUser.slice(0, 160)) || textsOverlap(fp.lastUser?.tail ?? "", lastRecordUser.slice(-160))) {
      return { action: "adopt", source: "adopted", reason: "adopt-overlap" };
    }
    if (state.restored) return { action: "adopt", source: "adopted-unverified", reason: "adopt-restored" };
    plan = { turns: 12, relation: "record", reason: "record-mismatch" };
  } else {
    const hasPair = fp.granularity === "turns" ? fp.hasPair : (fp.turnCount >= 2 || promptHit);
    if (!hasPair) return { action: "skip", reason: "no-pair" };
    if (state.restored && !state.sentHere) {
      if (!state.baseline || state.baseline.conversationKey !== fp.conversationKey) return { action: "baseline", reason: "baseline" };
      const g = growth(state.baseline.tail, state.baseline.at, state.baseline.tailChars);
      if (!g.ok) return g.wait ? { action: "wait", waitMs: HEARTBEAT_MS, reason: g.reason } : { action: "skip", reason: g.reason, relation: g.relation };
      plan = { turns: 0, relation: g.relation, reason: "baseline-growth" };
    } else if (state.sentHere || state.navigatedHere) {
      plan = { turns: 0, relation: "first", reason: state.sentHere ? "first-sent" : "first-navigated" };
    } else return { action: "skip", reason: "not-ours" };
  }

  if (retry && retry.digest === fp.digest) {
    if (retry.kind && !retry.nextAt) return { action: "skip", reason: "shelved" };
    if (retry.nextAt && now < retry.nextAt) return { action: "wait", waitMs: retry.nextAt - now, reason: "retry-later" };
    if ((retry.noiseStreak ?? 0) >= 2 && !promptHit && !(plan.relation === "append" && cur.some((e) => e.startsWith("u:")))) return { action: "skip", reason: "strict" };
  }
  const times = (rate.captureTimes ?? []).filter((x) => now - x < 3600 * 1000);
  const last = times.length ? Math.max(...times) : 0;
  if (last && now - last < 45000) return { action: "wait", waitMs: 45000 - (now - last), reason: "rate-45s" };
  if (times.length >= 8) return { action: "wait", waitMs: 3600 * 1000 - (now - Math.min(...times)), reason: "rate-hour" };
  if (fp.input?.editing) return { action: "wait", waitMs: 8000, reason: "editing" };
  if (fp.input?.seen && fp.input.idleMs !== null && fp.input.idleMs < 8000) return { action: "wait", waitMs: 8000 - fp.input.idleMs, reason: "recent-input" };
  if (fp.visible === false) return { action: "wait", waitMs: HEARTBEAT_MS, reason: "hidden" };
  return { action: "capture", turns: plan.turns, relation: plan.relation, reason: plan.reason };
}

/** Mark describing the ledger a text was copied under. */
export function markFrom(fp, source, now = new Date()) {
  return { v: fp.ledgerVersion, conversationKey: fp.conversationKey, granularity: fp.granularity, digest: fp.digest, tail: [...(fp.tail ?? [])], tailChars: fp.tailChars, turnCount: fp.turnCount, capturedAt: now.toISOString(), source };
}

/** Retry-state transition after a copy outcome (04 §5.7). */
export function nextRetry(entry, outcome, digest, now = Date.now()) {
  const e = entry && entry.digest === digest ? { ...entry } : { digest, kind: "", attempts: 0, aborts: 0, nextAt: 0, noiseStreak: entry?.noiseStreak ?? 0, captureTimes: entry?.captureTimes ?? [] };
  e.at = now;
  const pushTime = () => (e.captureTimes = [...(e.captureTimes ?? []), now].slice(-16));
  if (outcome === "saved") Object.assign(e, { kind: "", attempts: 0, aborts: 0, nextAt: 0, noiseStreak: 0 }) && pushTime();
  else if (outcome === "same") {
    Object.assign(e, { kind: "", attempts: 0, nextAt: 0, noiseStreak: (e.noiseStreak ?? 0) + 1 });
    pushTime();
  } else if (outcome === "unmatched") {
    e.attempts += 1;
    e.kind = "unmatched";
    e.nextAt = e.attempts === 1 ? now + 5 * 60 * 1000 : 0;
    pushTime();
  } else if (outcome === "error") {
    e.attempts += 1;
    e.kind = "error";
    e.nextAt = [30000, 120000, 600000][e.attempts - 1] ? now + [30000, 120000, 600000][e.attempts - 1] : 0;
  } else if (outcome === "aborted") {
    e.aborts += 1;
    e.kind = "busy";
    e.nextAt = e.aborts >= 4 ? 0 : now + 15000;
  }
  return e;
}
