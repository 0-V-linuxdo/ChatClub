// Composer: the unified input row (v2 03 §1–§3, §8). One textarea that sends to the active tab of
// every column, with per-frame serial send queues, images, search mode and docked/floating placement.
// Library, history, optimize, placeholders and focus keeping plug in through extension points.

import { runLegacyMigration } from "../../lib/legacy.js";
import { h, clear, icon, uid } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { createStateStore } from "../../kernel/state-ports.js";

const SEND_DEADLINE_MS = 12000;
const SEND_DEADLINE_IMAGES_MS = 60000;
const IMAGE_RETRIES = 3;
const READY_WAIT_MS = 20000;
const DOC_RETRY_ROUNDS = 3;
const MAX_REASON = 160;
const MAX_NAMES = 4;
const SEARCH_LIMIT = 12;

/** "a.png" → "a (2).png" when taken; no name → prompt-image-N.ext (03 §3). */
export function uniqueImageName(raw, type, taken, counter) {
  let name = String(raw || "").split(/[\\/]/).pop().trim();
  if (!name) {
    const ext = (String(type || "image/png").split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
    name = `prompt-image-${counter}.${ext}`;
  }
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (${n})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

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
    // The old default was 15 px (07 §2).
    runLegacyMigration(ctx, "topbarPromptInputFontSizeMigrationVersion", 1, (s) => {
      if (Number(s.topbarPromptInputFontSize) === 15) s.topbarPromptInputFontSize = 16;
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
    const searchProviders = ctx.extensionPoint("composer.searchProvider");
    const placeholders = ctx.extensionPoint("composer.placeholder");
    const shortcuts = () => ctx.services.get("shortcuts");

    const store = createStateStore({ text: "", imageCount: 0, mode: "compose", placement: "topbar", floating: false, queued: 0, sending: false });
    ctx.state.register("composer", store);

    // ------------------------------------------------------------ DOM
    const textarea = h("textarea", { attrs: { rows: "1", spellcheck: "true", "aria-label": t("composer.placeholder") } });
    const imageStrip = h("div.cc-composer-images", { hidden: true });
    const modeCompose = h("button.cc-composer-mode", { type: "button", dataset: { tip: t("composer.mode.compose"), tipId: "composer.mode.compose" }, "aria-label": t("composer.mode.compose") }, icon("split"));
    const modeSearch = h("button.cc-composer-mode", { type: "button", dataset: { tip: t("composer.mode.search"), tipId: "composer.mode.search" }, "aria-label": t("composer.mode.search") }, icon("search"));
    const plusBtn = ui.iconButton({ icon: "plus", compact: true, label: t("composer.promptActions"), tipId: "topbar.promptActions", attrs: { "aria-haspopup": "menu" } });
    const clearBtn = ui.iconButton({ icon: "x", compact: true, label: t("composer.clear"), tipId: "topbar.clearPrompt" });
    const statusEl = h("span.cc-composer-status", { hidden: true, dataset: { tipId: "topbar.modelGateStatus" } });
    const queueEl = h("span.cc-composer-queue", { hidden: true });
    const sendBtn = h("button.cc-composer-send", { type: "button", "aria-label": t("composer.send"), dataset: { tip: t("composer.send"), tipId: "topbar.send" } }, icon("send"));
    const pinBtn = ui.iconButton({ icon: "chevronDown", compact: true, label: t("composer.pin.float"), tipId: "composer.pin" });
    const searchPanel = h("div.cc-composer-search", { hidden: true, attrs: { role: "listbox" } });
    const row = h("div.cc-composer-row",
      h("div.cc-composer-modes", modeCompose, modeSearch),
      plusBtn,
      h("div.cc-composer-text", textarea),
      h("span.cc-composer-tools-gap"),
      clearBtn, statusEl, queueEl, sendBtn, pinBtn);
    const composer = h("div.cc-composer", imageStrip, row, searchPanel);
    composer.dataset.mode = "compose";

    const slot = h("div.cc-composer-slot", composer);
    const summonBtn = ui.iconButton({ icon: "keyboard", label: t("composer.pin.dock"), tipId: "composer.open" });
    const floatHost = h("div.cc-composer-float", { hidden: true });
    shell.overlayRoot.parentNode?.insertBefore(floatHost, shell.overlayRoot) ?? document.body.append(floatHost);
    ctx.onDispose(() => floatHost.remove());

    // ------------------------------------------------------------ state
    let images = [];
    let imageCounter = 0;
    let mode = "compose";
    let floating = false; // composer currently shown in the floating host
    let stashedDraft = null; // compose draft while in search mode
    let draftVersion = 0;
    const statusById = new Map();

    const placement = () => (ctx.settings.composerPlacement === "center" ? "center" : "topbar");
    const isEmpty = () => !textarea.value.trim() && !images.length;
    const setStoreState = () =>
      store.update((s) => {
        s.text = textarea.value;
        s.imageCount = images.length;
        s.mode = mode;
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
      if (mode === "search") return ctx.services.get("fullText")?.enabled?.() ? t("composer.search.placeholderFull") : t("composer.search.placeholder");
      for (const entry of placeholders.sorted()) {
        try {
          const text = entry.text?.();
          if (text) return text;
        } catch (error) {
          ctx.logger.warn(`Placeholder "${entry.id}" failed:`, error);
        }
      }
      const collapsed = !composer.classList.contains("expanded") && document.activeElement !== textarea;
      return collapsed && searchProviders.sorted().length ? t("composer.placeholder.tabHint") : t("composer.placeholder");
    };
    const refreshPlaceholder = () => (textarea.placeholder = placeholderText());
    ctx.onDispose(placeholders.subscribe(refreshPlaceholder));
    ctx.onDispose(searchProviders.subscribe(refreshPlaceholder));

    // ------------------------------------------------------------ sizing (03 §1.3)
    const maxHeight = () => Math.min(180, Math.max(88, Math.round(window.innerHeight * 0.36)));
    const focusedWithin = () => composer.contains(document.activeElement);
    const layoutDockedExpanded = () => {
      const docked = !floating;
      const expanded = composer.classList.contains("expanded") || mode === "search";
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
      const expanded = focusedWithin() && (textarea.value.length > 0 || images.length > 0) && mode === "compose";
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
      const searching = mode === "search";
      modeCompose.setAttribute("aria-pressed", String(!searching));
      modeSearch.setAttribute("aria-pressed", String(searching));
      plusBtn.hidden = searching || !actions.sorted().length;
      clearBtn.hidden = searching || isEmpty();
      sendBtn.hidden = searching;
      sendBtn.disabled = isEmpty();
      modeSearch.hidden = !searchProviders.sorted().length;
      const editing = ctx.services.get("topbar")?.isEditing?.() ?? false;
      pinBtn.hidden = editing;
      const center = placement() === "center";
      pinBtn.replaceChildren(icon(center ? "chevronUp" : "chevronDown", { size: 15 }));
      pinBtn.setAttribute("aria-label", center ? t("composer.pin.dock") : t("composer.pin.float"));
      pinBtn.dataset.tip = pinBtn.getAttribute("aria-label");
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
    const renderImages = () => {
      clear(imageStrip);
      imageStrip.hidden = !images.length;
      for (const image of images) {
        const remove = h("button", { type: "button", "aria-label": t("composer.removeImage"), dataset: { tip: t("composer.removeImage"), tipId: "topbar.removeImage" } }, icon("x", { size: 11 }));
        remove.addEventListener("mousedown", (e) => e.preventDefault());
        remove.addEventListener("click", () => {
          images = images.filter((x) => x.id !== image.id);
          renderImages();
          onDraftChanged();
        });
        imageStrip.append(h("div.cc-composer-thumb", { dataset: { tip: image.name } }, h("img", { attrs: { src: image.dataUrl, alt: image.name } }), remove));
      }
    };
    const readFile = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    const addImageFiles = async (fileList) => {
      const files = [...(fileList ?? [])].filter((f) => /^image\//.test(f.type));
      if (!files.length) {
        shellUi.toast(t("composer.images.none"), "error");
        return 0;
      }
      let added = 0;
      for (const file of files) {
        try {
          const dataUrl = await readFile(file);
          const taken = new Set(images.map((x) => x.name));
          imageCounter += 1;
          images.push({ id: uid("img"), name: uniqueImageName(file.name, file.type, taken, imageCounter), type: file.type, size: file.size, lastModified: file.lastModified, dataUrl });
          added += 1;
        } catch (error) {
          ctx.logger.warn("Reading an image failed:", error);
          shellUi.toast(t("composer.images.readFailed"), "error");
        }
      }
      if (added) {
        renderImages();
        onDraftChanged();
        shellUi.toast(t("composer.images.added", { count: added, total: images.length }), "success");
      }
      return added;
    };
    const pickImages = () => {
      const input = h("input", { type: "file", attrs: { accept: "image/*", multiple: "" } });
      input.addEventListener("change", () => addImageFiles(input.files));
      input.click();
    };

    textarea.addEventListener("paste", (event) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((f) => /^image\//.test(f.type));
      if (!files.length) return;
      event.preventDefault();
      addImageFiles(files);
    });
    composer.addEventListener("dragover", (event) => {
      if (![...(event.dataTransfer?.types ?? [])].includes("Files")) return;
      event.preventDefault();
      composer.classList.add("drop-hover");
    });
    composer.addEventListener("dragleave", (event) => {
      if (!composer.contains(event.relatedTarget)) composer.classList.remove("drop-hover");
    });
    composer.addEventListener("drop", (event) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      composer.classList.remove("drop-hover");
      addImageFiles(event.dataTransfer.files);
    });

    // ------------------------------------------------------------ text helpers
    const setDraft = ({ text = "", images: nextImages } = {}, { focus = true, caret = "end" } = {}) => {
      textarea.value = String(text);
      if (Array.isArray(nextImages)) {
        images = nextImages.map((img) => ({ ...img, id: img.id ?? uid("img") }));
        renderImages();
      }
      onDraftChanged();
      if (focus) focusInput();
      const pos = caret === "start" ? 0 : textarea.value.length;
      textarea.setSelectionRange(pos, pos);
    };
    const insertText = (text) => {
      if (mode === "search") exitSearch();
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? start;
      textarea.focus();
      textarea.setRangeText(String(text), start, end, "end");
      onDraftChanged();
    };
    const clearDraft = () => {
      textarea.value = "";
      images = [];
      renderImages();
      onDraftChanged();
    };

    // ------------------------------------------------------------ placement (03 §1.2)
    let topbarSlotEl = null; // the element handed to the top bar
    const topbarItem = h("div.cc-composer-host", { style: { display: "contents" } });
    const moveComposer = (toFloat) => {
      const selStart = textarea.selectionStart;
      const selEnd = textarea.selectionEnd;
      const hadFocus = focusedWithin();
      floating = toFloat;
      if (toFloat) {
        floatHost.hidden = false;
        floatHost.style.top = `calc(var(--topbar-h) + 40px + 12px)`;
        floatHost.append(composer);
        slot.replaceChildren(summonBtn);
        slot.classList.add("floating");
      } else {
        floatHost.hidden = true;
        slot.replaceChildren(composer);
        slot.classList.remove("floating");
      }
      if (hadFocus) {
        textarea.focus({ preventScroll: true });
        try {
          textarea.setSelectionRange(selStart, selEnd);
        } catch {
          // ignore
        }
      }
      autosize();
      refreshButtons();
      setStoreState();
    };
    const editingTopbar = () => ctx.services.get("topbar")?.isEditing?.() ?? false;
    const summon = () => {
      if (placement() === "center" && !editingTopbar()) moveComposer(true);
    };
    const tuckAway = () => {
      if (floating) moveComposer(false);
    };
    summonBtn.addEventListener("click", () => {
      moveComposer(true);
      focusInput();
    });
    pinBtn.addEventListener("click", () => {
      const next = placement() === "center" ? "topbar" : "center";
      ctx.settings.composerPlacement = next;
      moveComposer(next === "center");
      focusInput();
    });
    ctx.onDispose(ctx.plugin.settings.use(["composerPlacement"], () => {
      if (placement() === "topbar") tuckAway();
      refreshButtons();
    }));
    // Clicking outside the floating composer (including into a chat iframe) tucks it away temporarily.
    const onPointerDown = (event) => {
      if (!floating || composer.contains(event.target) || event.target.closest?.(".cc-menu, .cc-modal, .cc-menu-backdrop")) return;
      tuckAway();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    ctx.onDispose(() => document.removeEventListener("pointerdown", onPointerDown, true));
    ctx.events.on("Frames:userClickedFrame", () => tuckAway());

    const topbarHidden = () => shell.shell.dataset.topbar === "auto" && shell.shell.dataset.topbarShown !== "true";
    /** Puts the caret in the composer (summoning it to the center when that is the preference). */
    const focusInput = ({ summonFloat = true } = {}) => {
      if (summonFloat) summon();
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
      render: () => {
        topbarSlotEl = slot;
        return slot;
      },
    });
    void topbarItem;
    void topbarSlotEl;

    // ------------------------------------------------------------ "+" menu (03 §4)
    const composerCtx = (anchor) => ({ host: ctx.host, ui: shellUi, t, anchor, composer: api, text: textarea.value, isEmpty: isEmpty() });
    ctx.contribute("composer.action", { id: "addImage", icon: "paperclip", labelKey: "composer.addImage", order: 0, onClick: () => pickImages() });
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

    // ------------------------------------------------------------ search mode (03 §8)
    let searchQuery = "";
    let searchResults = [];
    let searchIndex = 0;
    let searchSeq = 0;
    const highlight = (text, query) => {
      const s = String(text ?? "");
      if (!query) return [s];
      const i = s.toLowerCase().indexOf(query.toLowerCase());
      if (i < 0) return [s];
      return [s.slice(0, i), h("mark", s.slice(i, i + query.length)), s.slice(i + query.length)];
    };
    const formatTime = (ms) => {
      if (!ms) return "";
      const d = new Date(ms);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) return t("composer.search.today");
      return ctx.services.get("i18n")?.formatDate?.(d, { month: "short", day: "numeric" }) ?? d.toLocaleDateString();
    };
    const renderSearch = () => {
      clear(searchPanel);
      searchPanel.style.setProperty("--composer-search-max", `${Math.max(160, window.innerHeight - composer.getBoundingClientRect().top - 120)}px`);
      searchPanel.append(h("div.head", searchQuery ? t("composer.search.count", { count: searchResults.length }) : t("composer.search.recent")));
      if (!searchResults.length) searchPanel.append(h("div.empty", t("composer.search.empty")));
      searchResults.forEach((result, i) => {
        const el = h("button.cc-composer-result", { type: "button", attrs: { role: "option", "aria-selected": String(i === searchIndex) } },
          h("span.icons", (result.icons ?? []).slice(0, 4).map((src) => h("img", { attrs: { src, alt: "" } }))),
          h("span.main", h("span.title", highlight(result.title, searchQuery)), result.snippet ? h("span.snippet", highlight(result.snippet, searchQuery)) : null),
          h("span.meta", h("span", formatTime(result.time)), result.status ? h("span", result.status === "open" ? t("composer.search.open") : t("composer.search.closed")) : null));
        el.addEventListener("mousedown", (e) => e.preventDefault());
        el.addEventListener("click", () => openResult(i));
        searchPanel.append(el);
      });
      const provider = searchProviders.sorted()[0];
      const openWindow = provider?.openWindow ? h("button", { type: "button", onclick: () => {
        const q = searchQuery;
        exitSearch();
        provider.openWindow(q);
      } }, t("composer.search.openWindow")) : null;
      openWindow?.addEventListener("mousedown", (e) => e.preventDefault());
      searchPanel.append(h("div.foot", h("span", t("composer.search.hint")), openWindow));
    };
    const runSearch = async () => {
      const seq = ++searchSeq;
      const query = textarea.value.trim();
      const provider = searchProviders.sorted()[0];
      let results = [];
      try {
        results = provider ? (await provider.search(query, { limit: SEARCH_LIMIT })) ?? [] : [];
      } catch (error) {
        ctx.logger.warn("Search failed:", error);
      }
      if (seq !== searchSeq || mode !== "search") return; // a newer query won
      searchQuery = query;
      searchResults = results.slice(0, SEARCH_LIMIT);
      searchIndex = 0;
      renderSearch();
    };
    const openResult = (i) => {
      const result = searchResults[i];
      if (!result) return;
      exitSearch();
      try {
        result.open?.();
      } catch (error) {
        ctx.logger.error("Opening a search result failed:", error);
      }
    };
    const enterSearch = (query = "") => {
      if (!searchProviders.sorted().length) return false;
      if (mode !== "search") {
        stashedDraft = { text: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd };
        mode = "search";
        composer.dataset.mode = "search";
        composer.classList.add("searching");
        textarea.value = query;
        searchPanel.hidden = false;
      } else textarea.value = query || textarea.value;
      focusInput();
      autosize();
      refreshButtons();
      setStoreState();
      runSearch();
      return true;
    };
    const exitSearch = () => {
      if (mode !== "search") return;
      mode = "compose";
      composer.dataset.mode = "compose";
      composer.classList.remove("searching");
      searchPanel.hidden = true;
      searchSeq += 1;
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
    modeSearch.addEventListener("click", () => enterSearch(""));
    modeCompose.addEventListener("click", () => {
      exitSearch();
      focusInput();
    });

    // ------------------------------------------------------------ keyboard
    const sendKeyMode = () => shortcuts()?.sendKeyMode?.() ?? "enter";
    const isMac = () => shortcuts()?.isMac?.() ?? /Mac/.test(navigator.platform);
    textarea.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (mode === "search") {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (!searchResults.length) return;
          searchIndex = (searchIndex + (event.key === "ArrowDown" ? 1 : -1) + searchResults.length) % searchResults.length;
          renderSearch();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          openResult(searchIndex);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (textarea.value) {
            textarea.value = "";
            runSearch();
          } else exitSearch();
          return;
        }
        if (event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          exitSearch();
        }
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
      if (event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && searchProviders.sorted().length) {
        event.preventDefault();
        enterSearch("");
        return;
      }
      if (event.key === "Escape" && floating) {
        event.preventDefault();
        event.stopPropagation();
        tuckAway();
        textarea.blur();
        return;
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
      if (mode === "search") {
        runSearch();
        autosize();
        return;
      }
      onDraftChanged();
    });
    textarea.addEventListener("focus", () => {
      autosize();
      if (mode === "search") renderSearch();
    });
    composer.addEventListener("focusout", (event) => {
      if (composer.contains(event.relatedTarget)) return;
      setTimeout(() => {
        if (focusedWithin()) return;
        if (mode === "search" && !textarea.value) exitSearch();
        autosize();
      }, 0);
    });
    clearBtn.addEventListener("click", () => {
      clearDraft();
      textarea.focus();
    });
    window.addEventListener("resize", () => {
      autosize();
      if (floating && placement() !== "center") tuckAway();
    });

    // ------------------------------------------------------------ service
    const api = {
      element: composer,
      textarea,
      getDraft: () => ({ text: mode === "search" ? stashedDraft?.text ?? "" : textarea.value, images: images.map((x) => ({ ...x })) }),
      setDraft,
      insertText,
      clear: clearDraft,
      isEmpty: () => (mode === "search" ? !(stashedDraft?.text ?? "").trim() && !images.length : isEmpty()),
      draftVersion: () => draftVersion,
      send,
      addImages: addImageFiles,
      pickImages,
      focus: focusInput,
      blur: () => textarea.blur(),
      hasFocus: focusedWithin,
      isFloating: () => floating,
      tuckAway,
      mode: () => mode,
      enterSearchMode: enterSearch,
      exitSearchMode: exitSearch,
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
    ctx.onDispose(searchProviders.subscribe(() => refreshButtons()));
    refreshButtons();
    autosize();
    setStoreState();
    if (placement() === "center") queueMicrotask(() => moveComposer(true));
  },
};
