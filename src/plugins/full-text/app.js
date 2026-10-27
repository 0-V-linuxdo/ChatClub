// FullTextRecorder (page): the fullText service and the idle copy scheduler (v2 04 §5.5–§5.10).

import * as ui from "../../lib/ui.js";
import { conversationKey } from "../../lib/conversation.js";
import { decide, markFrom, nextRetry, frameIdentity, HEARTBEAT_MS, LEDGER_VERSION } from "./model.js";
import { findConfig, frameConfig, hasCollector } from "../summary/sites.js";

const RETRY_KEY = "chatclub.fullTextCaptureState.v1";
const LOG = "[ChatClub FullText]";
const PROMPT_TTL = 45 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  start(ctx) {
    const t = ctx.t;
    const workspace = ctx.services.get("workspace");
    const frames = ctx.services.get("frames");
    const summary = () => ctx.services.get("summary");
    const enabled = () => !!ctx.settings.recordFullText;
    const wsId = () => workspace?.workspaceId?.() ?? null;

    // ------------------------------------------------------------ records (10 s read cache)
    const cache = new Map();
    const readRecord = async (workspaceId, { fresh = false } = {}) => {
      if (!workspaceId) return null;
      const hit = cache.get(workspaceId);
      if (!fresh && hit && Date.now() - hit.at < 10000) return hit.record;
      const { record } = await ctx.background.request("read", { workspaceId });
      cache.set(workspaceId, { record, at: Date.now() });
      return record;
    };

    const toFrame = (s, capture) => ({
      appId: s.appId,
      instanceId: s.instanceId || s.tabId || "",
      href: s.href,
      title: s.title || s.pageTitle || "",
      appName: s.brand || s.siteName || s.name || "",
      logoUrl: s.logoUrl || "",
      messages: (s.messages ?? []).filter((m) => m.role === "user" || m.role === "assistant"),
      ...(capture ? { capture } : {}),
    });

    const persist = async (workspaceId, frameList) => {
      if (!workspaceId || !frameList.length) return { changed: false };
      const res = await ctx.background.request("persist", { workspaceId, topicTitle: workspace.getTopic?.().title ?? "", frames: frameList });
      cache.delete(workspaceId);
      if (res?.changed) ctx.events.emit("FullText:changed", { workspaceId });
      return res ?? { changed: false };
    };

    /** Summary / Pocket results. `mark: "fresh"` stores the ledger they were collected under (04 §5.9). */
    const recordSources = async (sources, { mark } = {}) => {
      if (!enabled()) return { changed: false };
      const list = (sources ?? []).filter((s) => s?.status !== "failed" && s?.messages?.length && conversationKey(s.href));
      const frameList = list.map((s) => toFrame(s, mark && s.fingerprint?.ledgerVersion === LEDGER_VERSION ? markFrom(s.fingerprint, mark) : null));
      return persist(wsId(), frameList);
    };

    const debouncedMarks = new Map(); // workspaceId -> { marks: Map(frameId -> mark), timer }
    const queueMark = (workspaceId, frameId, mark) => {
      let entry = debouncedMarks.get(workspaceId);
      if (!entry) debouncedMarks.set(workspaceId, (entry = { marks: new Map(), timer: null }));
      entry.marks.set(frameId, mark);
      clearTimeout(entry.timer);
      entry.timer = setTimeout(async () => {
        debouncedMarks.delete(workspaceId);
        const marks = [...entry.marks].map(([id, m]) => ({ frameId: id, mark: m }));
        await ctx.background.request("writeMarks", { workspaceId, marks }).catch((error) => ctx.logger.warn("Writing marks failed:", error));
        cache.delete(workspaceId);
      }, 2000);
    };

    // ------------------------------------------------------------ retry state (storage.session)
    let retryState = { v: 1, entries: {} };
    const session = globalThis.chrome?.storage?.session;
    const loadRetry = session ? session.get(RETRY_KEY).then((r) => {
      if (r?.[RETRY_KEY]?.v === 1) retryState = r[RETRY_KEY];
    }).catch(() => {}) : Promise.resolve();
    const saveRetry = () => {
      const all = Object.entries(retryState.entries).sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0)).slice(0, 200);
      retryState = { v: 1, entries: Object.fromEntries(all) };
      session?.set({ [RETRY_KEY]: retryState }).catch(() => {});
    };

    // ------------------------------------------------------------ scheduler
    const watchers = new Map(); // frameKey -> watcher
    const hints = new Map(); // tabId -> { text, at }
    const globalCaptures = [];
    let pausedUntil = 0;
    let running = false;
    let listTimer = null;

    const log = (w, info) => console.info(LOG, info.reason, { relation: info.relation ?? "", turns: info.turns ?? 0, conversationKey: info.key, app: w.target.appId });

    const frameOf = (record, w, fp) => record?.frames?.find((f) => frameIdentity(f) === frameIdentity({ href: fp.href, instanceId: w.target.tabId }))
      ?? record?.frames?.find((f) => conversationKey(f.href) === fp.conversationKey) ?? null;

    const stateFor = (w, fp) => {
      const key = fp.conversationKey;
      if (key && key !== w.lastKey) {
        // A key reached within 10 s of watching (or a reload) is restored; later ones were navigated to here.
        const restored = Date.now() - w.watchStart < 10000;
        w.keyInfo.set(key, { restored: w.keyInfo.get(key)?.restored ?? restored, navigated: !restored });
        w.lastKey = key;
      }
      const hint = hints.get(w.target.tabId);
      const promptHint = hint && Date.now() - hint.at < PROMPT_TTL ? hint.text : "";
      if (promptHint && fp.containsPrompt) w.sentKeys.add(key);
      const info = w.keyInfo.get(key) ?? {};
      return { restored: !!info.restored, navigatedHere: !!info.navigated, sentHere: w.sentKeys.has(key), baseline: w.baselines.get(key) ?? null, promptHint };
    };

    const capture = async (w, fp, plan, retryKey) => {
      const col = summary()?.collector;
      if (!col) return;
      const runId = `ft-${Math.random().toString(36).slice(2, 10)}`;
      const cancel = () => col.send(w.target.frameKey, "cancelSummaryCollection", { runId }, 1500).catch(() => {});
      col.cancellers.add(cancel);
      log(w, { ...plan, key: fp.conversationKey });
      globalCaptures.push(Date.now());
      let outcome = "error";
      let after = fp;
      try {
        const source = await col.collectTarget({ ...w.target, href: fp.href }, { userInitiated: false, idle: true, tailTurns: plan.turns, runId, prompt: stateFor(w, fp).promptHint || undefined });
        if (source.aborted || source.reason === t("summary.reason.userBusy")) outcome = "aborted";
        else if (source.status === "ok") {
          try {
            after = await col.send(w.target.frameKey, "getConversationFingerprint", { waitMs: 5000, since: source.fingerprint?.revision ?? fp.revision }, 8000);
          } catch {
            after = source.fingerprint ?? fp;
          }
          const mark = after?.conversationKey === fp.conversationKey ? markFrom(after, "idle") : markFrom(fp, "idle");
          const res = await persist(w.workspaceId, [toFrame(source, mark)]);
          outcome = res.changed ? "saved" : "same";
        } else if (source.status === "skipped") outcome = "unmatched";
      } catch (error) {
        ctx.logger.warn("Idle copy failed:", error);
      } finally {
        col.cancellers.delete(cancel);
      }
      retryState.entries[retryKey] = nextRetry(retryState.entries[retryKey], outcome, fp.digest);
      saveRetry();
      const recent = globalCaptures.filter((x) => Date.now() - x < 10 * 60 * 1000);
      globalCaptures.splice(0, globalCaptures.length, ...recent);
      if (recent.length > 20) {
        pausedUntil = Date.now() + 10 * 60 * 1000;
        console.warn(LOG, "circuit breaker: too many copies, pausing 10 min");
        ctx.reportAnomaly({ feature: "summary", operation: "fullTextCircuitBreaker", message: `${recent.length} copies in 10 minutes` });
      }
      return after;
    };

    const watch = async (w) => {
      await loadRetry;
      let since;
      let waitMs = 0;
      while (running && watchers.get(w.target.frameKey) === w) {
        const started = Date.now();
        const config = findConfig(summary()?.configs?.() ?? [], workspace.currentHrefSync?.(w.target.tabId) ?? "");
        if (!config || !hasCollector(config)) {
          await sleep(5000);
          continue;
        }
        let fp;
        try {
          if (!(await summary().collector.ensureCapability(w.target.frameKey, "summary"))) throw new Error("no runtime");
          const fc = frameConfig(config);
          const hint = hints.get(w.target.tabId);
          fp = await summary().collector.send(w.target.frameKey, "getConversationFingerprint", {
            prompt: hint && Date.now() - hint.at < PROMPT_TTL ? hint.text : undefined,
            waitMs,
            since,
            hints: fc.officialRuleHints ?? {},
            config: fc,
          }, Math.min(30000, waitMs + 5000));
        } catch {
          since = undefined;
          waitMs = 0;
          await sleep(5000);
          continue;
        }
        if (!running || watchers.get(w.target.frameKey) !== w) break;
        if (fp?.documentId && fp.documentId !== w.documentId) {
          if (w.documentId) w.watchStart = Date.now();
          w.documentId = fp.documentId;
          w.lastKey = null;
        }
        since = fp?.revision;
        const displayed = workspace.displayedTargets().some((tg) => tg.frameKey === w.target.frameKey);
        const view = fp ? { ...fp, visible: fp.visible !== false && displayed && document.visibilityState === "visible" } : fp;
        const state = fp ? stateFor(w, view) : {};
        const record = fp?.conversationKey ? await readRecord(w.workspaceId).catch(() => null) : null;
        const stored = fp?.conversationKey ? frameOf(record, w, fp) : null;
        const mark = stored?.capture ?? null;
        const retryKey = `${w.workspaceId}|${fp?.conversationKey ?? ""}`;
        const retry = retryState.entries[retryKey] ?? null;
        const d = decide({ fp: view, mark, record: stored, state, retry, rate: retry ?? {}, now: Date.now() });
        if (d.action === "capture" && Date.now() < pausedUntil) d.action = "wait";
        if (d.action === "baseline") {
          w.baselines.set(fp.conversationKey, { conversationKey: fp.conversationKey, tail: [...(fp.tail ?? [])], tailChars: fp.tailChars, at: Date.now() });
          waitMs = HEARTBEAT_MS;
        } else if (d.action === "adopt") {
          const frameId = frameIdentity(stored);
          queueMark(w.workspaceId, frameId, markFrom(fp, d.source));
          waitMs = HEARTBEAT_MS;
        } else if (d.action === "capture") {
          const after = await capture(w, fp, d, retryKey);
          since = after?.revision ?? since;
          waitMs = HEARTBEAT_MS;
        } else {
          waitMs = Math.max(1000, Math.min(HEARTBEAT_MS, d.waitMs ?? HEARTBEAT_MS));
          if (d.action === "wait") since = undefined; // re-read after the wait even without a change
        }
        if (d.action === "wait") await sleep(waitMs);
        const elapsed = Date.now() - started;
        if (elapsed < 1000) await sleep(1000 - elapsed);
      }
    };

    const relist = () => {
      if (!running) return;
      const workspaceId = wsId();
      const live = new Set();
      for (const target of workspace.activeTargets?.() ?? []) {
        if (!target.frameKey || !frames.isRegistered(target.frameKey)) continue;
        live.add(target.frameKey);
        const old = watchers.get(target.frameKey);
        if (old && old.workspaceId === workspaceId) {
          old.target = target;
          continue;
        }
        const w = { target, workspaceId, watchStart: Date.now(), documentId: null, lastKey: null, keyInfo: new Map(), sentKeys: new Set(), baselines: new Map() };
        watchers.set(target.frameKey, w);
        watch(w).catch((error) => ctx.logger.warn("Full-text watcher stopped:", error));
      }
      for (const key of [...watchers.keys()]) if (!live.has(key)) watchers.delete(key);
    };

    const startScheduler = () => {
      if (running || !enabled() || !workspace) return;
      running = true;
      relist();
      listTimer = setInterval(relist, 5000);
    };
    const stopScheduler = () => {
      running = false;
      clearInterval(listTimer);
      watchers.clear();
    };

    if (workspace) {
      ctx.onDispose(ctx.events.on("Workspace:ready", () => startScheduler()));
      if (workspace.isBooted?.()) startScheduler();
      ctx.onDispose(ctx.events.on("Composer:accepted", (payload) => {
        for (const tg of payload?.targets ?? []) hints.set(tg.tabId, { text: String(payload.text ?? ""), at: Date.now() });
      }));
    }
    ctx.onDispose(ctx.plugin.settings.use(["recordFullText"], () => (enabled() ? startScheduler() : stopScheduler())));
    ctx.onDispose(stopScheduler);

    // ------------------------------------------------------------ service
    ctx.services.provide("fullText", {
      enabled,
      start: startScheduler,
      renderToggle: () => ui.toggleSwitch({
        checked: enabled(),
        onChange: (on) => {
          ctx.settings.recordFullText = on;
          if (on) startScheduler();
          else stopScheduler();
        },
      }),
      recordSources,
      notePrompt: (text, tabIds = []) => {
        for (const id of tabIds) hints.set(id, { text: String(text ?? ""), at: Date.now() });
      },
      record: (workspaceId) => readRecord(workspaceId, { fresh: true }),
      framesFor: async (workspaceId) => (await readRecord(workspaceId, { fresh: true }).catch(() => null))?.frames ?? [],
      /** Stored frame for a tab when its mark still matches the live ledger (04 §5.9), else null. */
      freshFrame: async (target) => {
        const col = summary()?.collector;
        if (!col || !target?.frameKey) return null;
        const fp = await col.send(target.frameKey, "getConversationFingerprint", {}, 3000).catch(() => null);
        if (!fp?.conversationKey) return null;
        const record = await readRecord(wsId()).catch(() => null);
        const stored = frameOf(record, { target }, fp);
        const m = stored?.capture;
        return m && m.v === fp.ledgerVersion && m.conversationKey === fp.conversationKey && m.digest === fp.digest ? stored : null;
      },
      search: async (query, { workspaceIds } = {}) => (await ctx.background.request("search", { query: String(query ?? ""), workspaceIds })).hits ?? [],
      preview: async (workspaceId) => {
        const record = await readRecord(workspaceId, { fresh: true });
        return (record?.frames ?? []).map((f) => ({ appId: f.appId, appName: f.appName, title: f.title, href: f.href, logoUrl: f.logoUrl, messages: f.messages }));
      },
      deleteWorkspace: async (workspaceId) => {
        cache.delete(workspaceId);
        await ctx.background.request("remove", { workspaceId });
      },
      exportAll: async () => (await ctx.background.request("exportAll", {})).records ?? [],
    });
  },
};
