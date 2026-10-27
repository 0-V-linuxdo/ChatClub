// Conversation collection engine (v2 04 §1.3, §1.7): one global queue for every in-frame collection,
// background copies cancelled before any user-initiated one, and the per-tab collection steps.

import { blankPageReason, findConfig, hasCollector, brandOf, frameConfig } from "./sites.js";
import { appIconUrl } from "../../lib/app-icon.js";

const rid = () => `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createCollector(ctx, { configs }) {
  const t = ctx.t;
  const transport = ctx.services.get("frames.transport");
  const frames = ctx.services.get("frames");
  const workspace = ctx.services.get("workspace");
  const apps = ctx.services.get("apps");

  // ------------------------------------------------------------ global serial lock
  let chain = Promise.resolve();
  let pending = 0;
  const exclusive = (fn) => {
    pending += 1;
    const run = chain.then(fn, fn);
    chain = run.catch(() => {}).finally(() => {
      pending -= 1;
    });
    return run;
  };
  /** Background copiers register here; user-initiated collections cancel them first (04 §1.7). */
  const cancellers = new Set();
  let userHoldUntil = 0;
  const cancelBackground = async () => {
    userHoldUntil = Date.now() + 5000;
    await Promise.all([...cancellers].map((fn) => Promise.resolve().then(fn).catch(() => {})));
  };

  const send = (frameKey, command, payload, timeoutMs) => transport.send(frameKey, { capability: commandCapability(command), command, payload }, { timeoutMs });
  const commandCapability = (command) => ctx.host.commandOwners?.get(command)?.capability ?? "summary";

  const pageMeta = async (frameKey) => {
    try {
      const meta = await send(frameKey, "getPageMeta", {}, 1800);
      if (meta?.href) return meta;
    } catch {
      // fall through
    }
    try {
      const href = await send(frameKey, "getLocationHref", {}, 1200);
      return href ? { href, title: "" } : null;
    } catch {
      return null;
    }
  };

  /** Displayed targets in order, with their tab info (04 §1.2 "active tabs"). */
  const targets = () => workspace.displayedTargets().map((tg, order) => ({ ...tg, order, href: workspace.currentHrefSync(tg.tabId) }));

  const sourceBase = (target, meta, config) => {
    const app = apps.get(target.appId);
    const href = meta?.href || target.href || "";
    const title = meta?.title || app?.name || target.appId;
    return {
      key: target.tabId,
      instanceId: target.tabId,
      tabId: target.tabId,
      groupId: target.groupId,
      appId: target.appId,
      frameKey: target.frameKey,
      order: target.order ?? 0,
      siteId: config?.id ?? "",
      siteName: config?.name ?? app?.name ?? "",
      name: app?.name ?? target.appId,
      brand: brandOf({ siteId: config?.id, siteName: config?.name ?? app?.name, title, href }) || app?.name || target.appId,
      title,
      pageTitle: meta?.title || "",
      href,
      logoUrl: appIconUrl(ctx.host, app, meta?.icon || ""),
    };
  };

  /** 04 §1.3 step 2. Returns null when the address may be collected. */
  const precheck = (href) => {
    if (/^chrome-error:/i.test(href)) return { status: "failed", reason: t("summary.reason.errorPage") };
    const config = findConfig(configs(), href);
    if (!config) return { status: "skipped", reason: t("summary.reason.noConfig") };
    const blank = blankPageReason(href);
    if (blank) return { status: "skipped", reason: t(`summary.reason.${blank}`) };
    return null;
  };

  const ensureCapability = async (frameKey, capability) => {
    if (frames.hasCapability(frameKey, capability)) return true;
    try {
      await frames.reinject(frameKey);
    } catch {
      // ignore
    }
    for (let i = 0; i < 10 && !frames.hasCapability(frameKey, capability); i += 1) await new Promise((r) => setTimeout(r, 100));
    return frames.hasCapability(frameKey, capability);
  };

  /**
   * Collects one tab (04 §1.3). Never throws: failures come back as a source with status/reason.
   * @param {object} target from targets()
   * @param {{ userInitiated?: boolean, idle?: boolean, tailTurns?: number, runId?: string, prompt?: string, configOverride?: object }} [opts]
   */
  const collectTarget = async (target, opts = {}) => {
    const { userInitiated = true, idle = false } = opts;
    if (!target?.frameKey || !frames.isRegistered(target.frameKey)) {
      return { ...sourceBase(target, null, null), status: "failed", reason: t("summary.reason.notLoaded") };
    }
    let meta = await pageMeta(target.frameKey);
    if (!meta) return { ...sourceBase(target, null, null), status: "failed", reason: t("summary.reason.noMeta") };
    const pickConfig = (href) => opts.configOverride ?? findConfig(configs(), href);
    let config = pickConfig(meta.href);
    let early = opts.configOverride ? null : precheck(meta.href);
    if (early) return { ...sourceBase(target, meta, config), ...early };

    if (userInitiated) await cancelBackground();
    else if (Date.now() < userHoldUntil) return { ...sourceBase(target, meta, config), status: "skipped", reason: t("summary.reason.userBusy") };

    return exclusive(async () => {
      if (!userInitiated && Date.now() < userHoldUntil) return { ...sourceBase(target, meta, config), status: "skipped", reason: t("summary.reason.userBusy") };
      const runId = opts.runId ?? rid();
      try {
        if (!(await ensureCapability(target.frameKey, "base"))) return { ...sourceBase(target, meta, config), status: "failed", reason: t("summary.reason.coreFailed") };
        meta = (await pageMeta(target.frameKey)) ?? meta;
        config = pickConfig(meta.href);
        early = opts.configOverride ? null : precheck(meta.href);
        if (early) return { ...sourceBase(target, meta, config), ...early };
        if (!(await ensureCapability(target.frameKey, "summary"))) return { ...sourceBase(target, meta, config), status: "failed", reason: t("summary.reason.runtimeFailed") };
        let state;
        try {
          state = await send(target.frameKey, "getSummaryRuntimeState", {}, 1800);
        } catch (error) {
          return { ...sourceBase(target, meta, config), status: "failed", reason: t("summary.reason.runtimeFailed") + ` (${error?.message || error})` };
        }
        meta = (await pageMeta(target.frameKey)) ?? meta;
        config = pickConfig(meta.href);
        early = opts.configOverride ? null : precheck(meta.href);
        if (early) return { ...sourceBase(target, meta, config), ...early };
        const base = sourceBase(target, meta, config);
        if (!hasCollector(config)) return { ...base, status: "skipped", reason: t("summary.reason.noCollector") };
        let result = null;
        try {
          result = await send(target.frameKey, "collectSummary", {
            config: frameConfig(config),
            expectedDocumentId: state?.documentId,
            expectedHref: meta.href,
            runId,
            idle,
            tailTurns: opts.tailTurns ?? 0,
            prompt: opts.prompt,
          }, Math.min(60000, Number(config.userscriptTimeoutMs) || (idle ? 60000 : 36000)));
        } catch (error) {
          if (config.fallbackMode !== "allowPageText") return { ...base, status: "failed", reason: String(error?.message || error) };
        }
        if (result?.aborted) return { ...base, status: "skipped", reason: t("summary.reason.aborted"), aborted: true, userInterrupted: !!result.userInterrupted, fingerprint: result.fingerprint };
        let messages = result?.messages ?? [];
        if (!messages.length && config.fallbackMode === "allowPageText" && !idle) {
          try {
            const text = await send(target.frameKey, "getPageText", {}, 2500);
            if (String(text || "").trim()) messages = [{ role: "page", text: String(text).trim() }];
          } catch {
            // ignore
          }
        }
        if (!messages.length) {
          const reason = result?.stage === "generating"
            ? t("summary.reason.generating")
            : result?.rawMessageCount
              ? t("summary.reason.noPair", { n: result.rawMessageCount })
              : t("summary.reason.noStructured");
          return { ...base, status: "skipped", reason, stage: result?.stage, officialHits: result?.officialHits, fingerprint: result?.fingerprint };
        }
        return {
          ...base,
          status: "ok",
          messages,
          stage: result?.stage ?? "page",
          officialHits: result?.officialHits ?? null,
          waitMsApplied: result?.waitMsApplied ?? 0,
          fingerprint: result?.fingerprint,
          diagnostic: t("summary.diag.collected", { site: base.brand, n: messages.length }),
        };
      } catch (error) {
        ctx.reportAnomaly?.({ feature: "summary", operation: "collectSource", message: String(error?.message || error) });
        return { ...sourceBase(target, meta, config), status: "failed", reason: String(error?.message || error) };
      }
    });
  };

  /** Collects every displayed tab: started in parallel, executed one by one. */
  const collectAll = async (opts = {}) => {
    const list = targets();
    const sources = await Promise.all(list.map((tg) => collectTarget(tg, opts)));
    return sources;
  };

  /** Whether any displayed tab may be collected (enables the Summary button). */
  const canCollect = () => targets().some((tg) => {
    if (!tg.href) return false;
    const config = findConfig(configs(), tg.href);
    if (!config || !hasCollector(config) || blankPageReason(tg.href)) return false;
    return !workspace.isNewTopicUrl(tg.appId, tg.href);
  });

  return { collectTarget, collectAll, canCollect, targets, exclusive, cancelBackground, cancellers, pageMeta, ensureCapability, isQueued: () => pending > 0, send };
}
