// Composer: the unified input row (v2 03 §1–§3, §8). One textarea that sends to the active tab of
// every column, with per-frame serial send queues, images, search mode and docked/floating placement.
// Library, history, optimize, placeholders and focus keeping plug in through extension points.

import { h, clear, icon, uid } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { createStateStore } from "../../kernel/state-ports.js";
import { renderSettingsFields } from "../../lib/settings-form.js";

const SEND_DEADLINE_MS = 12000;
const SEND_DEADLINE_IMAGES_MS = 60000;
const IMAGE_RETRIES = 3;
const READY_WAIT_MS = 20000;
const DOC_RETRY_ROUNDS = 3;
const MAX_REASON = 160;
const MAX_NAMES = 4;

/** Summary toast text and type after a send finished (03 §2.4). */
export function summarizeResults(results, t) {
  const sent = results.filter((r) => r.status === "sent");
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "failed");
  const names = failed.slice(0, MAX_NAMES).map((r) => r.name).join(", ");
  if (!failed.length && !skipped.length) return { text: t("composer.summary.ok", { count: sent.length }), type: "success" };
  if (!failed.length && skipped.length) {
    if (!sent.length) return { text: t("composer.summary.allSkipped"), type: "error" };
    return { text: t("composer.summary.skipped", { count: sent.length, skipped: skipped.length }), type: "success" };
  }
  if (sent.length) return { text: t("composer.summary.partial", { count: sent.length, names }), type: "error" };
  return { text: t("composer.summary.failed", { names }), type: "error" };
}

export default {
  start(ctx) {
    ctx.contribute("appearance.field", {
      id: "Composer:settings",
      group: "Appearance:topbar",
      order: 10,
      render(container, gctx) {
        const rows = renderSettingsFields(ctx.host, ctx.plugin, { keys: ["topbarPromptInputFontSize"] });
        if (rows.dispose) gctx.onDispose(rows.dispose);
        container.append(...rows);
      },
    });
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const shell = ctx.services.get("shell");
    if (shell.page !== "workspace") {
      ctx.services.provide("composer", null);
      return;
    }
    const workspace = ctx.services.get("workspace");
    const frames = ctx.services.get("frames");
    const transport = ctx.services.get("frames.transport");
    const apps = ctx.services.get("apps");
    const actions = ctx.extensionPoint("composer.action");
    const pipeline = ctx.extensionPoint("composer.sendPipeline");
    const gates = ctx.extensionPoint("composer.targetGate");
    const keyHandlers = ctx.extensionPoint("composer.keyHandler");
    const modes = ctx.extensionPoint("composer.mode");
    const placeholders = ctx.extensionPoint("composer.placeholder");
    const shortcuts = () => ctx.services.get("shortcuts");

    const store = createStateStore({ text: "", imageCount: 0, mode: "compose", placement: "topbar", floating: false, queued: 0, sending: false });
    ctx.state.register("composer", store);

    // ------------------------------------------------------------ DOM
    const textarea = h("textarea", { attrs: { rows: "1", spellcheck: "true", "aria-label": t("composer.placeholder") } });
    const modeCompose = h("button.cc-composer-mode", { type: "button", dataset: { tip: t("composer.mode.compose"), tipId: "composer.mode.compose" }, "aria-label": t("composer.mode.compose") }, icon("split"));
    const modesBox = h("div.cc-composer-modes", { hidden: true });
    const plusBtn = ui.iconButton({ icon: "plus", compact: true, label: t("composer.promptActions"), tipId: "topbar.promptActions", attrs: { "aria-haspopup": "menu" } });
    const clearBtn = ui.iconButton({ icon: "x", compact: true, label: t("composer.clear"), tipId: "topbar.clearPrompt" });
    const statusEl = h("span.cc-composer-status", { hidden: true, dataset: { tipId: "topbar.modelGateStatus" } });
    const queueEl = h("span.cc-composer-queue", { hidden: true });
    const sendBtn = h("button.cc-composer-send", { type: "button", "aria-label": t("composer.send"), dataset: { tip: t("composer.send"), tipId: "topbar.send" } }, icon("send"));
    // Buttons other plugins add after the send button (e.g. ComposerFloat's pin).
    const pluginTools = h("span.cc-composer-plugin-tools");
    const row = h("div.cc-composer-row",
      modesBox,
      plusBtn,
      h("div.cc-composer-text", textarea),
      h("span.cc-composer-tools-gap"),
      clearBtn, statusEl, queueEl, sendBtn, pluginTools);
    const composer = h("div.cc-composer", row);
    composer.dataset.mode = "compose";

    const slot = h("div.cc-composer-slot", composer);

    // ------------------------------------------------------------ state
    let images = [];
    let activeMode = null; // a mode from another plugin (e.g. search) while it owns the text box
    let floating = false; // composer currently shown floating (ComposerFloat moves it)
    let stashedDraft = null; // compose draft while a mode is active
    let draftVersion = 0;
    const statusById = new Map();

    const placement = () => ctx.services.get("composerFloat")?.placement?.() ?? "topbar";
    const isEmpty = () => !textarea.value.trim() && !images.length;
    const setStoreState = () =>
      store.update((s) => {
        s.text = textarea.value;
        s.imageCount = images.length;
        s.mode = activeMode?.id ?? "compose";
        s.placement = placement();
        s.floating = floating;
        s.queued = queuedCount();
      });

    const applyFontSize = () => {
      const size = Math.max(13, Math.min(20, Number(ctx.settings.topbarPromptInputFontSize) || 16));
      composer.style.setProperty("--composer-font", `${size}px`);
    };
    applyFontSize();
    ctx.onDispose(ctx.plugin.settings.use(["topbarPromptInputFontSize"], applyFontSize));

    // ------------------------------------------------------------ placeholder (03 §1.4)
    const placeholderText = () => {
      if (activeMode) return activeMode.placeholder?.() ?? t("composer.placeholder");
      for (const entry of placeholders.sorted()) {
        try {
          const text = entry.text?.();
          if (text) return text;
        } catch (error) {
          ctx.logger.warn(`Placeholder "${entry.id}" failed:`, error);
        }
      }
      return t("composer.placeholder");
    };
    const refreshPlaceholder = () => (textarea.placeholder = placeholderText());
    ctx.onDispose(placeholders.subscribe(refreshPlaceholder));

    // ------------------------------------------------------------ sizing (03 §1.3)
    const maxHeight = () => Math.min(180, Math.max(88, Math.round(window.innerHeight * 0.36)));
    const focusedWithin = () => composer.contains(document.activeElement);
    const layoutDockedExpanded = () => {
      const docked = !floating;
      const expanded = composer.classList.contains("expanded") || !!activeMode;
      if (docked && expanded && slot.isConnected) {
        const r = slot.getBoundingClientRect();
        composer.classList.add("docked-expanded");
        composer.style.left = `${r.left}px`;
        composer.style.top = `${r.top}px`;
        composer.style.width = `${r.width}px`;
      } else {
        composer.classList.remove("docked-expanded");
        composer.style.left = composer.style.top = composer.style.width = "";
      }
    };
    const autosize = () => {
      const expanded = focusedWithin() && (textarea.value.length > 0 || images.length > 0) && !activeMode;
      composer.classList.toggle("expanded", expanded);
      composer.style.setProperty("--composer-max-h", `${maxHeight()}px`);
      textarea.style.height = "38px";
      if (expanded) {
        const needed = textarea.scrollHeight;
        const stacked = textarea.value.includes("\n") || needed > 42;
        composer.classList.toggle("stacked", stacked);
        textarea.style.height = `${Math.min(maxHeight(), Math.max(38, textarea.scrollHeight))}px`;
      } else {
        composer.classList.remove("stacked");
      }
      textarea.title = !expanded && textarea.value ? textarea.value : "";
      layoutDockedExpanded();
      refreshPlaceholder();
    };

    const refreshButtons = () => {
      const moded = !!activeMode;
      renderModes();
      plusBtn.hidden = moded || !actions.sorted().length;
      clearBtn.hidden = moded || isEmpty();
      sendBtn.hidden = moded;
      sendBtn.disabled = isEmpty();
      const n = queuedCount();
      queueEl.hidden = n === 0;
      queueEl.textContent = String(n);
      queueEl.dataset.tip = t("composer.queue", { count: n });
      renderStatus();
    };

    const renderStatus = () => {
      const entries = [...statusById.values()];
      const error = entries.find((s) => s.kind === "error");
      const busy = entries.find((s) => s.kind === "busy");
      const current = error ?? busy;
      clear(statusEl);
      statusEl.hidden = !current;
      if (!current) return;
      statusEl.classList.toggle("error", current.kind === "error");
      statusEl.append(current.kind === "busy" ? ui.spinner() : icon("alert", { size: 14 }), h("span", current.text));
      statusEl.dataset.tip = current.tip ?? current.text;
    };

    const onDraftChanged = () => {
      draftVersion += 1;
      autosize();
      refreshButtons();
      setStoreState();
      ctx.events.emit("Composer:input", { text: textarea.value, imageCount: images.length });
    };

    // ------------------------------------------------------------ images (03 §3)
    // Images are part of the draft; ComposerImages adds the strip, paste, drop and picker. Without it drafts carry none.
    const imagesOn = () => !!ctx.services.get("composerImages");
    const setImages = (next) => {
      images = imagesOn() && Array.isArray(next) ? next.map((img) => ({ ...img, id: img.id ?? uid("img") })) : [];
      onDraftChanged();
    };

    // ------------------------------------------------------------ text helpers
    const setDraft = ({ text = "", images: nextImages } = {}, { focus = true, caret = "end" } = {}) => {
      textarea.value = String(text);
      if (Array.isArray(nextImages)) images = imagesOn() ? nextImages.map((img) => ({ ...img, id: img.id ?? uid("img") })) : [];
      onDraftChanged();
      if (focus) focusInput();
      const pos = caret === "start" ? 0 : textarea.value.length;
      textarea.setSelectionRange(pos, pos);
    };
    const insertText = (text) => {
      if (activeMode) exitMode();
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? start;
      textarea.focus();
      textarea.setRangeText(String(text), start, end, "end");
      onDraftChanged();
    };
    const clearDraft = () => {
      textarea.value = "";
      images = [];
      onDraftChanged();
    };

    // ------------------------------------------------------------ floating (03 §1.2)
    // ComposerFloat moves the element between the top bar and the center and reports it here.
    const setFloating = (on) => {
      floating = !!on;
      autosize();
      refreshButtons();
      setStoreState();
    };
    const topbarHidden = () => shell.shell.dataset.topbar === "auto" && shell.shell.dataset.topbarShown !== "true";
    /** Puts the caret in the composer (summoning it to the center when that is the preference). */
    const focusInput = ({ summonFloat = true } = {}) => {
      if (summonFloat) ctx.services.get("composerFloat")?.summon?.();
      if (!floating && topbarHidden()) return false;
      textarea.focus({ preventScroll: true });
      return true;
    };

    // ------------------------------------------------------------ top bar item
    ctx.contribute("topbar.item", {
      id: "composer",
      labelKey: "composer.send",
      icon: "keyboard",
      grow: false,
      render: () => slot,
    });

    // ------------------------------------------------------------ "+" menu (03 §4)
    const composerCtx = (anchor) => ({ host: ctx.host, ui: shellUi, t, anchor, composer: api, text: textarea.value, isEmpty: isEmpty() });
    plusBtn.addEventListener("click", () => {
      const cctx = composerCtx(plusBtn);
      const items = actions.sorted().map((entry) => ({
        label: t(entry.labelKey ?? entry.id),
        icon: entry.icon ?? "plug",
        hint: entry.shortcutAction ? shortcuts()?.labelFor(entry.shortcutAction) ?? "" : "",
        disabled: typeof entry.disabled === "function" ? !!entry.disabled(cctx) : !!entry.disabled,
        onSelect: () => {
          try {
            const r = entry.onClick?.(cctx);
            r?.catch?.((error) => ctx.logger.error(`Composer action "${entry.id}" failed:`, error));
          } catch (error) {
            ctx.logger.error(`Composer action "${entry.id}" failed:`, error);
          }
        },
      }));
      shellUi.openMenu({ anchor: plusBtn, items, align: "start", className: "cc-composer-menu" });
    });
    ctx.onDispose(actions.subscribe(() => refreshButtons()));

    // ------------------------------------------------------------ send queues (03 §2)
    const queues = new Map(); // frameKey -> { tail, gen, pending }
    const queuedCount = () => [...queues.values()].reduce((n, q) => n + q.pending, 0);
    const queueFor = (frameKey) => {
      if (!queues.has(frameKey)) queues.set(frameKey, { tail: Promise.resolve(), gen: 0, pending: 0 });
      return queues.get(frameKey);
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitReady = async (frameKey, timeoutMs = READY_WAIT_MS) => {
      const until = Date.now() + timeoutMs;
      let reinjected = false;
      while (Date.now() < until) {
        if (frames.isRegistered(frameKey) && frames.hasCapability(frameKey, "send")) return true;
        if (frames.isRegistered(frameKey) && !reinjected && Date.now() > until - timeoutMs + 3000) {
          reinjected = true;
          await frames.reinject(frameKey).catch(() => {});
        }
        await sleep(200);
      }
      return false;
    };

    const clip = (text) => {
      const s = String(text || "").replace(/\s+/g, " ").trim();
      return s.length > MAX_REASON ? `${s.slice(0, MAX_REASON - 1)}…` : s;
    };

    const runGates = async (target, payload) => {
      let warn = null;
      for (const gate of gates.sorted()) {
        try {
          const verdict = await gate.before?.({ ...target, payload });
          if (verdict?.action === "skip") return { action: "skip", message: verdict.message ?? t("composer.skipped") };
          if (verdict?.action === "warn") warn = verdict.message ?? t("composer.usingCurrentModel");
        } catch (error) {
          ctx.logger.warn(`Send gate "${gate.id}" failed:`, error);
        }
      }
      return { action: "continue", warn };
    };

    /** Sends one payload to one frame. Resolves to { status, reason, uncertain }. */
    const sendOne = async (target, payload) => {
      const app = apps.get(target.appId);
      const name = app?.name ?? target.appId;
      const gate = await runGates(target, payload);
      if (gate.action === "skip") {
        workspace.frameToast(target.frameKey, gate.message, { type: "error", duration: 4000 });
        return { status: "skipped", name, reason: gate.message };
      }
      if (gate.warn) workspace.frameToast(target.frameKey, gate.warn, { type: "message", duration: 3000 });

      const hasImages = payload.images.length > 0;
      const deadlineMs = hasImages ? SEND_DEADLINE_IMAGES_MS : SEND_DEADLINE_MS;
      let lastError = "";
      for (let round = 0; round < DOC_RETRY_ROUNDS; round += 1) {
        if (!(await waitReady(target.frameKey))) {
          lastError = t("composer.notReady");
          continue;
        }
        const dismiss = workspace.frameToast(target.frameKey, t("composer.submitting"), { spinner: true, duration: 0 });
        try {
          const result = await transport.send(target.frameKey, {
            capability: "send",
            command: "sendText",
            payload: {
              sendId: payload.sendId,
              deadline: Date.now() + deadlineMs,
              text: payload.text,
              images: payload.images.map(({ name: n, type, size, lastModified, dataUrl }) => ({ name: n, type, size, lastModified, dataUrl })),
              imageRetries: IMAGE_RETRIES,
              imagePasteStrategy: app?.imagePasteStrategy ?? "sequential",
              pasteTextWithImages: !!app?.pasteTextWithImages,
              isolatedPaste: !!app?.isolatedPaste,
              noTextInputFallback: !!app?.noTextInputFallback,
              appId: target.appId,
              appName: name,
              inputSelector: app?.inputSelector ?? "",
              sendSelector: app?.sendSelector ?? "",
              sendKeyMode: sendKeyMode(),
            },
          }, { timeoutMs: deadlineMs + 4000 });
          dismiss();
          if (result?.deliveryState === "sent" || (result?.sent && result?.deliveryState !== "unknown")) {
            workspace.frameToast(target.frameKey, t("composer.submitted"), { type: "success", duration: 1600 });
            return { status: "sent", name, method: result.method, submissionNavigation: result.submissionNavigation ?? null };
          }
          // Only an explicit "not-sent" is certain; anything else may have been delivered.
          const uncertain = result?.deliveryState !== "not-sent";
          const reason = clip(result?.reason || "unknown");
          workspace.frameToast(target.frameKey, t("composer.submitFailed", { reason }) + (uncertain ? t("composer.maybeDelivered") : ""), { type: "error", duration: 5000 });
          return { status: "failed", name, reason, uncertain };
        } catch (error) {
          dismiss();
          const message = String(error?.message || error);
          if (/document changed|not registered|unknown frame/.test(message)) {
            lastError = t("composer.docChanged");
            frames.markUnloaded?.(target.frameKey);
            continue; // the document changed while preparing: try again
          }
          const reason = clip(message);
          const uncertain = /timeout|timed out|no response/i.test(message);
          workspace.frameToast(target.frameKey, t("composer.submitFailed", { reason }) + (uncertain ? t("composer.maybeDelivered") : ""), { type: "error", duration: 5000 });
          return { status: "failed", name, reason, uncertain };
        }
      }
      const reason = clip(lastError || t("composer.notReady"));
      workspace.frameToast(target.frameKey, t("composer.submitFailed", { reason }), { type: "error", duration: 5000 });
      return { status: "failed", name, reason, uncertain: false, beforeSend: true };
    };

    const enqueue = (target, payload) => {
      const queue = queueFor(target.frameKey);
      const gen = queue.gen;
      queue.pending += 1;
      refreshButtons();
      const job = queue.tail.then(async () => {
        if (queue.gen !== gen) {
          return { status: "failed", name: apps.get(target.appId)?.name ?? target.appId, reason: t("composer.queueCleared"), uncertain: false };
        }
        const result = await sendOne(target, payload);
        // An uncertain failure clears whatever is queued behind it (no blind re-sends).
        if (result.status === "failed" && result.uncertain) queue.gen += 1;
        return result;
      }).catch((error) => ({ status: "failed", name: target.appId, reason: clip(error?.message || error), uncertain: true }))
        .finally(() => {
          queue.pending -= 1;
          refreshButtons();
          setStoreState();
        });
      queue.tail = job.then(() => {}, () => {});
      return job;
    };

    let sending = false;
    const send = async ({ text = textarea.value, images: sendImages = images, source = "composer" } = {}) => {
      if (sending) return null;
      if (!String(text).trim() && !sendImages.length) return null;
      sending = true;
      const versionAtSend = draftVersion;
      try {
        let payload = { sendId: uid("send"), text: String(text), images: sendImages.map((x) => ({ ...x })), source, workspaceId: workspace.workspaceId() };
        for (const step of pipeline.sorted()) {
          if (!step.before) continue;
          try {
            const next = await step.before(payload);
            if (next === false) return { aborted: true, by: step.id };
            if (next && typeof next === "object") payload = next;
          } catch (error) {
            ctx.logger.warn(`Send pipeline "${step.id}" failed:`, error);
          }
        }
        const targets = workspace.activeTargets().filter((tg) => tg.frameKey);
        if (!targets.length) {
          shellUi.toast(t("composer.noTargets"), "error");
          return { results: [] };
        }
        const jobs = targets.map((tg) => enqueue(tg, payload));
        // Accepted into the queues: clear the draft (unless edited meanwhile), notify history/title.
        if (source === "composer" && draftVersion === versionAtSend) clearDraft();
        const accepted = { ...payload, targets: targets.map((tg) => ({ ...tg })) };
        ctx.events.emit("Composer:accepted", accepted);
        for (const step of pipeline.sorted()) {
          if (!step.after) continue;
          try {
            const r = step.after({ ...accepted, done: Promise.all(jobs) });
            r?.catch?.((error) => ctx.logger.warn(`Send pipeline "${step.id}" after() failed:`, error));
          } catch (error) {
            ctx.logger.warn(`Send pipeline "${step.id}" after() failed:`, error);
          }
        }
        sending = false;
        const results = await Promise.all(jobs);
        const summary = summarizeResults(results, t);
        shellUi.toast(summary.text, summary.type);
        for (const r of results.filter((x) => x.status === "failed")) {
          ctx.reportAnomaly({ feature: "composer", operation: "sendPrompt", appName: r.name, message: r.reason, uncertain: !!r.uncertain });
        }
        ctx.events.emit("Composer:sendFinished", { sendId: payload.sendId, results });
        return { results };
      } finally {
        sending = false;
      }
    };
    sendBtn.addEventListener("click", () => send());

    // ------------------------------------------------------------ modes (03 §8)
    // A mode (search comes from TabSearch) takes over the text box; the compose draft waits until it ends.
    const renderModes = () => {
      const entries = modes.sorted();
      modesBox.hidden = !entries.length;
      modeCompose.setAttribute("aria-pressed", String(!activeMode));
      const buttons = entries.map((entry) => {
        const label = t(entry.labelKey ?? entry.id);
        const btn = h("button.cc-composer-mode", { type: "button", dataset: { tip: label, tipId: entry.tipId ?? "" }, "aria-label": label, attrs: { "aria-pressed": String(activeMode?.id === entry.id) } }, icon(entry.icon ?? "plug"));
        btn.addEventListener("click", () => entry.enter?.());
        return btn;
      });
      modesBox.replaceChildren(modeCompose, ...buttons);
    };
    const enterMode = (def, text = "") => {
      if (!def?.id) return false;
      if (!activeMode) stashedDraft = { text: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd };
      else if (activeMode !== def) activeMode.onExit?.();
      const same = activeMode === def;
      activeMode = def;
      composer.dataset.mode = def.id;
      textarea.value = same ? text || textarea.value : text;
      focusInput();
      autosize();
      refreshButtons();
      setStoreState();
      def.onEnter?.();
      return true;
    };
    const exitMode = () => {
      if (!activeMode) return;
      const def = activeMode;
      activeMode = null;
      composer.dataset.mode = "compose";
      def.onExit?.();
      textarea.value = stashedDraft?.text ?? "";
      const { start = textarea.value.length, end = start } = stashedDraft ?? {};
      stashedDraft = null;
      autosize();
      refreshButtons();
      setStoreState();
      try {
        textarea.setSelectionRange(start, end);
      } catch {
        // ignore
      }
    };
    modeCompose.addEventListener("click", () => {
      exitMode();
      focusInput();
    });
    ctx.onDispose(modes.subscribe(() => {
      if (activeMode && !modes.has(activeMode.id)) exitMode();
      refreshButtons();
    }));

    // ------------------------------------------------------------ keyboard
    const sendKeyMode = () => shortcuts()?.sendKeyMode?.() ?? "enter";
    const isMac = () => shortcuts()?.isMac?.() ?? /Mac/.test(navigator.platform);
    textarea.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (activeMode) {
        if (activeMode.onKeyDown?.(event)) event.preventDefault();
        return;
      }
      for (const handler of keyHandlers.sorted()) {
        try {
          if (handler.onKeyDown?.(event, composerCtx(textarea))) {
            event.preventDefault();
            return;
          }
        } catch (error) {
          ctx.logger.warn(`Composer key handler "${handler.id}" failed:`, error);
        }
      }
      if (event.key === "Enter") {
        const mod = isMac() ? event.metaKey : event.ctrlKey;
        const wantsSend = sendKeyMode() === "mod-enter" ? mod : !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
        if (wantsSend) {
          event.preventDefault();
          send();
        }
      }
    });
    textarea.addEventListener("input", () => {
      if (activeMode) {
        activeMode.onInput?.(textarea.value);
        autosize();
        return;
      }
      onDraftChanged();
    });
    textarea.addEventListener("focus", () => {
      autosize();
      activeMode?.onFocus?.();
    });
    composer.addEventListener("focusout", (event) => {
      if (composer.contains(event.relatedTarget)) return;
      setTimeout(() => {
        if (focusedWithin()) return;
        if (activeMode && !textarea.value) exitMode();
        autosize();
      }, 0);
    });
    clearBtn.addEventListener("click", () => {
      clearDraft();
      textarea.focus();
    });
    window.addEventListener("resize", () => autosize());

    // ------------------------------------------------------------ service
    const api = {
      element: composer,
      textarea,
      slot,
      getDraft: () => ({ text: activeMode ? stashedDraft?.text ?? "" : textarea.value, images: images.map((x) => ({ ...x })) }),
      setDraft,
      insertText,
      clear: clearDraft,
      isEmpty: () => (activeMode ? !(stashedDraft?.text ?? "").trim() && !images.length : isEmpty()),
      draftVersion: () => draftVersion,
      send,
      images: () => images.map((x) => ({ ...x })),
      setImages,
      focus: focusInput,
      blur: () => textarea.blur(),
      hasFocus: focusedWithin,
      isFloating: () => floating,
      setFloating,
      /** True while the box is a single line (not focused, not expanded). */
      isCollapsed: () => !composer.classList.contains("expanded") && document.activeElement !== textarea,
      /** Adds a button after the send button; returns a remover. */
      addTool: (el) => {
        pluginTools.append(el);
        return () => el.remove();
      },
      mode: () => activeMode?.id ?? "compose",
      enterMode,
      exitMode,
      queuedCount,
      /** Status chip next to the send button (e.g. preferred model preparation). */
      setStatus: (id, status) => {
        if (status) statusById.set(id, status);
        else statusById.delete(id);
        renderStatus();
      },
      refresh: () => {
        refreshButtons();
        refreshPlaceholder();
      },
    };
    ctx.services.provide("composer", api);

    ctx.events.on("I18n:languageChanged", () => {
      refreshButtons();
      refreshPlaceholder();
    });
    refreshButtons();
    autosize();
    setStoreState();
  },
};
