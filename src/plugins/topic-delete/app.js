// TopicDelete (page): entry points, the confirm dialog, the delete session with trusted-input pauses,
// the completion probe, and the topicDeletion settings section (v2 05 §4, 06 §8).

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { settingsTable, reorderButtonsOn } from "../../lib/settings-table.js";
import { topicIdentity, effectiveConfigs, storedConfigs, resolveConfig, validateConfig, scriptKind, failedBeforeDelivery, createCompletionJudge, clampTimeout, PROBE } from "./model.js";

const CAP = "delete";
const COMMAND_TIMEOUT_MS = 47000;
const MAX_TRUSTED_ROUNDS = 3;
// A failed delete is easy to miss while watching the column, so its toast stays longer.
const FAIL_TOAST_MS = 15000;

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const sites = ctx.services.get("sites");
    const workspace = ctx.services.get("workspace");
    const transport = ctx.services.get("frames.transport");
    const frames = ctx.services.get("frames");
    // Without a workspace (the options page) only the settings section is useful; the rest stays off.
    const live = !!(workspace && transport);

    const builtins = () => sites.capability("delete").map(({ data }) => ({ ...data }));
    const configs = () => effectiveConfigs(builtins(), ctx.settings.topicDeleteSiteConfigs);
    const saveConfigs = (list) => {
      ctx.settings.topicDeleteSiteConfigs = storedConfigs(builtins(), list);
    };
    const hrefOf = (tab) => workspace.currentHrefSync?.(tab.id) || tab.href || "";
    const resolveFor = (tab) => (tab ? resolveConfig(configs(), { appId: tab.appId, href: hrefOf(tab) }) : { config: null });
    const appName = (tab) => ctx.services.get("apps")?.get?.(tab.appId)?.name ?? tab.appId;
    const unwrap = (r) => (r && typeof r === "object" && "result" in r ? r.result : r);
    const send = (frameKey, command, payload, timeoutMs) => transport.send(frameKey, { capability: CAP, command, payload }, { timeoutMs }).then(unwrap);
    const report = (tab, reason, extra = {}) => ctx.reportAnomaly({ feature: "topicDeletion", operation: "deleteTopic", appId: tab.appId, appName: appName(tab), host: hrefOf(tab), reason, ...extra });
    const running = new Set();

    const frameConfig = (c) => ({ id: c.id, flow: c.flow, slots: c.slots, trusted: c.trusted, trustedBudget: c.trustedBudget, dialogOptional: !!c.dialogOptional, headerFallback: !!c.headerFallback, activateRepeats: c.activateRepeats, routePattern: c.routePattern, timeoutMs: c.timeoutMs, hasScript: !!c.script });

    /** Sends the first command; retries once only when it provably never reached the frame (rule 1). */
    const startSession = async (tab, payload, timeoutMs) => {
      try {
        return await send(tab.frameKey, "deleteThread", payload, timeoutMs);
      } catch (error) {
        if (!failedBeforeDelivery(error)) throw Object.assign(error instanceof Error ? error : new Error(String(error)), { maybeDelivered: true });
        await new Promise((r) => setTimeout(r, 400));
        return send(tab.frameKey, "deleteThread", payload, timeoutMs);
      }
    };

    const probe = (tab, cfg, identity) => send(tab.frameKey, "getDeleteConfirmState", { identity, config: frameConfig(cfg) }, 2400).catch(() => null);

    const waitForCompletion = async (tab, cfg, identity, listedAtStart) => {
      const judge = createCompletionJudge({ listedAtStart });
      const end = Date.now() + PROBE.totalMs;
      while (Date.now() < end) {
        const sample = await probe(tab, cfg, identity);
        if (judge(sample, Date.now())) return true;
        await new Promise((r) => setTimeout(r, PROBE.intervalMs));
      }
      return false;
    };

    /** Checks a tab can be deleted now; returns { cfg, identity, title } or { skip: toastKey, kind }. */
    const prepare = async (tab) => {
      if (!tab?.frameKey || (frames && !frames.isRegistered(tab.frameKey))) return { skip: "del.toast.noFrame", kind: "warning" };
      if (running.has(tab.id)) return { skip: null };
      const resolved = resolveFor(tab);
      if (!resolved.config) return { skip: resolved.disabled ? "del.toast.siteDisabled" : "del.toast.unsupported", kind: "warning" };
      const cfg = resolved.config;
      const identity = topicIdentity(cfg.id, hrefOf(tab), cfg.routePattern);
      if (!identity) return { skip: "del.toast.skipped.notInTopic", kind: "info" };
      const meta = unwrap(await transport.send(tab.frameKey, { capability: "base", command: "getPageMeta", payload: {} }, { timeoutMs: 1800 }).catch(() => null));
      return { cfg, identity, title: String(meta?.title || "").trim() || t("del.untitled") };
    };

    const deleteTopic = async (tab) => {
      const prep = await prepare(tab);
      if (prep.skip !== undefined) {
        if (prep.skip) shellUi.toast(t(prep.skip), prep.kind);
        return;
      }
      const ok = await shellUi.confirm({ title: t("del.confirm.title"), description: t("del.confirm.body", { app: appName(tab), title: prep.title }), confirmText: t("del.confirm.ok"), danger: true });
      if (ok) await runDelete(tab, prep);
    };

    /** Topbar entry (01 §6.2): the current topic of every displayed column, behind one confirm. */
    const deleteAll = async () => {
      const tabs = (workspace.displayedTargets?.() ?? workspace.activeTargets?.() ?? []).map((x) => ({ id: x.tabId, appId: x.appId, frameKey: x.frameKey }));
      const preps = await Promise.all(tabs.map(async (tab) => ({ tab, prep: await prepare(tab) })));
      const ready = preps.filter((x) => x.prep.skip === undefined);
      if (!ready.length) {
        const first = preps.find((x) => x.prep.skip);
        shellUi.toast(t(first ? first.prep.skip : "del.toast.noFrame"), first?.prep.kind ?? "warning");
        return;
      }
      const list = ready.map(({ tab, prep }) => t("del.confirm.item", { app: appName(tab), title: prep.title })).join("\n");
      const ok = await shellUi.confirm({ title: t("del.confirm.allTitle", { n: ready.length }), description: `${t("del.confirm.allBody")}\n${list}`, confirmText: t("del.confirm.ok"), danger: true });
      if (!ok) return;
      await Promise.all(ready.map(({ tab, prep }) => runDelete(tab, prep)));
    };

    const runDelete = async (tab, { cfg, identity }) => {
      if (topicIdentity(cfg.id, hrefOf(tab), cfg.routePattern)?.id !== identity.id) {
        shellUi.toast(t("del.toast.skipped.changed"), "info");
        return;
      }
      if (running.has(tab.id)) return;
      running.add(tab.id);
      workspace.refreshButtons?.();
      // One toast per column: "deleting…" first, then replaced by the outcome.
      const toastOpts = { id: `topicDelete-${tab.id}` };
      shellUi.toast(t("del.toast.running", { app: appName(tab) }), "loading", toastOpts);
      try {
        const before = await probe(tab, cfg, identity);
        const listedAtStart = !!before?.target?.present;
        let res = await startSession(tab, { config: frameConfig(cfg), identity }, Math.min(COMMAND_TIMEOUT_MS, cfg.timeoutMs + 1000));
        for (let round = 0; res?.status === "needsTrusted" && round < MAX_TRUSTED_ROUNDS; round++) {
          const trusted = ctx.services.get("trustedInput");
          if (!trusted?.available?.()) {
            await send(tab.frameKey, "deleteThread", { token: res.token, action: "cancel" }, 2000).catch(() => {});
            res = { status: "failed", reason: "trusted-input-unavailable" };
            break;
          }
          const verified = await send(tab.frameKey, "deleteThread", { token: res.token, action: "verify" }, 3000);
          if (verified?.status !== "verified") {
            res = verified;
            break;
          }
          if (res.kind === "key") await trusted.keys(tab.frameKey, res.keys);
          else await trusted.click(tab.frameKey, verified.point);
          res = await send(tab.frameKey, "deleteThread", { token: res.token, action: "resume" }, Math.min(COMMAND_TIMEOUT_MS, cfg.timeoutMs + 1000));
        }
        if (res?.status === "skipped") {
          shellUi.toast(t(res.reason === "identity-changed" ? "del.toast.skipped.changed" : "del.toast.skipped.notInTopic"), "info", toastOpts);
          return;
        }
        if (res?.status !== "triggered") {
          const reason = res?.reason || (res?.status === "needsTrusted" ? "too-many-trusted-steps" : "unknown");
          if (res?.status === "needsTrusted") await send(tab.frameKey, "deleteThread", { token: res.token, action: "cancel" }, 2000).catch(() => {});
          shellUi.toast(t("del.toast.failed", { app: appName(tab), reason: t(`del.reason.${reason}`) === `del.reason.${reason}` ? reason : t(`del.reason.${reason}`) }), "error", { ...toastOpts, duration: FAIL_TOAST_MS });
          report(tab, reason);
          return;
        }
        const done = await waitForCompletion(tab, cfg, identity, listedAtStart);
        shellUi.toast(t(done ? "del.toast.done" : "del.toast.triggered"), done ? "success" : "info", toastOpts);
        ctx.events.emit("TopicDelete:finished", { tabId: tab.id, identity, confirmed: done });
      } catch (error) {
        const reason = String(error?.message || error);
        shellUi.toast(t("del.toast.failed", { app: appName(tab), reason }), "error", { ...toastOpts, duration: FAIL_TOAST_MS });
        report(tab, error?.maybeDelivered ? "maybe-delivered" : "send-failed", { message: reason, delivered: error?.maybeDelivered ? null : false });
      } finally {
        running.delete(tab.id);
        workspace.refreshButtons?.();
        ctx.services.get("topbar")?.refresh?.();
      }
    };

    if (live) ctx.contribute("tabGroup.button", {
      id: "deleteThread",
      icon: "trash",
      labelKey: "del.group",
      tipId: "workspace.group.deleteThread",
      defaultPlacement: "pinned",
      shortcutAction: "deleteThread",
      order: 45,
      hidden: (g) => !resolveFor(g.contextTab ?? g.tab).config && !resolveFor(g.contextTab ?? g.tab).disabled,
      busy: (g) => !!g.tab && running.has(g.tab.id),
      disabled: (g) => !g.tab?.frameKey || running.has(g.tab.id),
      onClick: (g) => deleteTopic(g.contextTab ?? g.tab),
    });
    if (live) ctx.contribute("shortcut.action", {
      id: "deleteThread",
      labelKey: "del.shortcut",
      run: (_match, source) => {
        const group = workspace.currentGroup(source);
        const tab = group ? group.tabs[group.activeIndex] : null;
        if (!tab) shellUi.toast(t("del.toast.noFrame"), "warning");
        else deleteTopic(tab);
      },
    });
    if (live) ctx.contribute("topbar.item", {
      id: "deleteThread",
      labelKey: "del.topbar",
      icon: "trash",
      variant: "action",
      danger: true,
      tipId: "topbar.deleteThread",
      disabled: () => running.size > 0 || !(workspace.displayedTargets?.() ?? workspace.activeTargets?.() ?? []).some((x) => resolveFor({ id: x.tabId, appId: x.appId }).config),
      onClick: () => deleteAll(),
    });
    const refreshTopbar = () => ctx.services.get("topbar")?.refresh?.();
    if (live) ctx.events.on("Workspace:changed", refreshTopbar);
    if (live) ctx.events.on("Frames:location", refreshTopbar);
    if (live) ctx.services.provide("topicDelete", { deleteTopic, deleteAll, configs, supports: (tab) => !!resolveFor(tab).config });

    // ------------------------------------------------------------ settings section (06 §8)
    const lines = (el) => el.value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const openEditor = (existing, onSaved) => {
      const isNew = !existing || !!existing.__new;
      const draft = existing ? structuredClone(existing) : { id: `custom-${Date.now().toString(36)}`, name: "", enabled: true, appIds: [], hosts: [], pathPrefixes: [], timeoutMs: 15000, flow: "headerMenu", slots: {}, builtIn: false };
      delete draft.__new;
      shellUi.openModal(({ onClose }) => {
        const name = ui.textInput({ value: draft.name });
        const appIds = ui.textArea({ value: draft.appIds.join("\n"), rows: 2, mono: true });
        const hosts = ui.textArea({ value: draft.hosts.join("\n"), rows: 2, mono: true });
        const paths = ui.textArea({ value: draft.pathPrefixes.join("\n"), rows: 2, mono: true });
        const timeout = ui.textInput({ value: String(Math.round(draft.timeoutMs / 1000)), type: "number" });
        const slotField = (key) => ui.textInput({ value: [].concat(draft.slots?.[key] ?? []).join(", "), mono: true });
        const slotKeys = ["conversationLink", "conversationRow", "menuTrigger", "menuRoot", "deleteCandidate", "dialog", "confirmCandidate"];
        const slotInputs = Object.fromEntries(slotKeys.map((k) => [k, slotField(k)]));
        const script = ui.textArea({ value: draft.script ?? "", rows: 8, mono: true, placeholder: t("del.sites.script.placeholder") });
        const kindLine = h("div", { style: { fontSize: "12px", color: "var(--muted)" } });
        const showKind = () => {
          const kind = scriptKind(script.value);
          kindLine.textContent = kind ? t(`del.sites.script.kind.${kind}`) : t("del.sites.script.none");
        };
        script.addEventListener("input", showKind);
        showKind();
        const copyScript = ui.button({ label: t("del.sites.script.copy"), icon: "copy", tipId: "settings.action.copy", onClick: async () => {
          try {
            await navigator.clipboard.writeText(script.value);
            shellUi.toast(t("del.sites.script.copied"), "success");
          } catch {
            shellUi.toast(t("del.sites.script.copyFailed"), "error");
          }
        } });
        const error = h("div.error", { hidden: true, style: { color: "var(--danger)", fontSize: "13px" } });
        const save = () => {
          const slots = { ...draft.slots };
          for (const k of slotKeys) {
            const v = slotInputs[k].value.split(/,(?![^[]*\])/).map((s) => s.trim()).filter(Boolean);
            if (v.length) slots[k] = v;
            else delete slots[k];
          }
          const next = { ...draft, name: name.value.trim(), appIds: lines(appIds), hosts: lines(hosts), pathPrefixes: lines(paths), timeoutMs: clampTimeout(draft.id, Number(timeout.value) * 1000), slots, script: script.value.trim() ? script.value : undefined };
          const bad = validateConfig(next);
          if (bad) {
            error.textContent = t(bad);
            error.hidden = false;
            return;
          }
          const list = configs();
          const i = list.findIndex((c) => c.id === next.id);
          if (i >= 0) list[i] = next;
          else list.push(next);
          saveConfigs(list);
          if (next.script) ctx.services.get("userScripts")?.ensure();
          shellUi.toast(t("del.sites.saved"), "success");
          onClose("save");
          onSaved?.();
        };
        const grid = (...kids) => h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" } }, ...kids);
        const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
          grid(ui.field({ label: t("del.sites.field.name"), control: name }), ui.field({ label: t("del.sites.field.timeout"), control: timeout })),
          grid(ui.field({ label: t("del.sites.field.appIds"), control: appIds }), ui.field({ label: t("del.sites.field.hosts"), control: hosts })),
          ui.field({ label: t("del.sites.field.paths"), control: paths }),
          h("div", { style: { fontWeight: "600", fontSize: "12px", color: "var(--muted)" } }, t("del.sites.slots")),
          grid(...slotKeys.map((k) => ui.field({ label: k, control: slotInputs[k] }))),
          ui.field({ label: t("del.sites.field.script"), desc: t("del.sites.script.desc"), control: h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, script, h("div", { style: { display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" } }, kindLine, copyScript)) }),
          error);
        return shellUi.modalLayout({ title: t(isNew ? "del.sites.add" : "del.sites.edit"), icon: "trash", body, onClose, footer: [ui.button({ label: t("del.cancel"), onClick: () => onClose("cancel") }), ui.button({ label: t("del.ok"), variant: "primary", onClick: save })] });
      }, { kind: "editor", size: "wide" });
    };

    ctx.contribute("settings.section", {
      id: "topicDeletion",
      titleKey: "del.section.title",
      descKey: "del.section.desc",
      icon: "trash",
      order: 60,
      group: "features",
      render(container) {
        const box = h("div");
        const draw = () => {
          clear(box);
          const list = configs();
          box.append(h("div.cc-section-toolbar", h("span.desc", t("del.sites.desc")), ui.button({ label: t("del.sites.add"), icon: "plus", variant: "primary", onClick: () => openEditor(null, draw) })));
          box.append(settingsTable({
            t,
            rows: list,
            moveButtons: reorderButtonsOn(ctx.host),
            onReorder: (ids) => {
              saveConfigs(ids.map((id) => list.find((c) => c.id === id)));
              shellUi.toast(t("del.sites.orderSaved"), "success");
              draw();
            },
            columns: [
              { label: t("del.sites.col.name"), width: "minmax(140px, 1fr)", render: (c) => h("div", h("strong", c.name), h("div", { style: { fontSize: "12px", color: "var(--muted)" } }, t(!c.builtIn ? "del.sites.custom" : c.overridden ? "del.sites.overridden" : "del.sites.builtin"), c.script ? h("span", { style: { marginLeft: "6px" } }, ui.badge(t(`del.sites.script.badge.${scriptKind(c.script)}`), scriptKind(c.script) === "inline" ? "" : "warning")) : null)) },
              { label: t("del.sites.col.scope"), width: "minmax(160px, 1.4fr)", render: (c) => {
                const text = [c.appIds.join(", "), c.hosts.join(", "), c.pathPrefixes.join(", ")].filter(Boolean).join(" · ");
                return h("span.cell-ellipsis", { attrs: { title: text } }, text);
              } },
              { label: t("del.sites.col.timeout"), width: "80px", render: (c) => h("span", `${Math.round(c.timeoutMs / 1000)} s`) },
              { label: t("del.sites.col.enabled"), width: "72px", render: (c) => ui.toggleSwitch({ checked: c.enabled !== false, onChange: (v) => saveConfigs(configs().map((x) => (x.id === c.id ? { ...x, enabled: v } : x))) }) },
            ],
            actions: (c) => [
              ui.iconButton({ icon: "edit", label: t("del.sites.edit"), tipId: "settings.action.edit", onClick: () => openEditor(c, draw) }),
              ui.iconButton({ icon: "copy", label: t("del.sites.duplicate"), tipId: "settings.action.duplicate", onClick: () => {
                const { overridden, builtIn, ...rest } = c;
                void overridden;
                void builtIn;
                openEditor({ ...structuredClone(rest), id: `custom-${Date.now().toString(36)}`, name: t("del.sites.copyName", { name: c.name }), builtIn: false, __new: true }, draw);
              } }),
              c.builtIn && c.overridden ? ui.iconButton({ icon: "reset", label: t("del.sites.reset"), onClick: () => {
                ctx.settings.topicDeleteSiteConfigs = (ctx.settings.topicDeleteSiteConfigs ?? []).map((x) => (x.id === c.id ? { id: c.id, builtIn: true } : x));
                shellUi.toast(t("del.sites.resetDone"), "success");
                draw();
              } }) : null,
              !c.builtIn ? ui.iconButton({ icon: "trash", label: t("del.sites.delete"), className: "danger", tipId: "settings.action.delete", onClick: async () => {
                if (!(await shellUi.confirm({ title: t("del.sites.deleteTitle", { name: c.name }), danger: true }))) return;
                saveConfigs(configs().filter((x) => x.id !== c.id));
                draw();
              } }) : null,
            ],
          }));
        };
        ctx.services.get("userScripts")?.renderCard(container, { needed: () => configs().some((c) => !!c.script) });
        container.append(ui.card({ title: t("del.sites.title"), body: box }));
        draw();
      },
    });
  },
};
