// SendRuntime (ISOLATED world): receives "sendText" and performs it inside the chat page (v2 05 §2).
// Safety rule: once a submission may have happened, never report "not-sent".
const cc = globalThis.__chatclub;
if (cc && !cc.has("send")) {
  const results = new Map(); // sendId -> Promise<result>
  const RESULT_TTL_MS = 5 * 60 * 1000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.01;
  };
  const bottomMost = (list) => list.filter(isVisible).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] ?? null;
  const query = (selector) => {
    if (!selector) return [];
    try {
      return [...document.querySelectorAll(selector)];
    } catch {
      return [];
    }
  };

  // ---------------------------------------------------------------- input (§2.2)
  const findInput = (opts) => {
    const steps = [
      opts.inputSelector,
      "textarea:not([readonly]):not([disabled])",
      '[contenteditable="true"][role="textbox"], [contenteditable="plaintext-only"][role="textbox"]',
      '[contenteditable="true"], [contenteditable="plaintext-only"]',
    ];
    if (!opts.noTextInputFallback) steps.push('input[type="text"]:not([readonly]):not([disabled])');
    for (const selector of steps) {
      const hit = bottomMost(query(selector));
      if (hit) return hit;
    }
    return null;
  };
  const isEditable = (el) => el && (el.isContentEditable || el.getAttribute?.("contenteditable") === "plaintext-only");
  const readInput = (el) => (isEditable(el) ? el.innerText ?? el.textContent ?? "" : el.value ?? "");

  const writeText = async (el, text) => {
    el.focus();
    if (!isEditable(el)) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, text);
      else el.value = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      let ok = false;
      try {
        ok = document.execCommand("insertText", false, text);
      } catch {
        ok = false;
      }
      if (!ok || norm(readInput(el)) !== norm(text)) {
        el.textContent = text;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      }
    }
    await sleep(60);
    return norm(readInput(el)) === norm(text);
  };

  // ---------------------------------------------------------------- images (§2.3)
  const toFile = async (image) => {
    const blob = await (await fetch(image.dataUrl)).blob();
    return new File([blob], image.name || "image.png", { type: image.type || blob.type || "image/png", lastModified: image.lastModified || Date.now() });
  };
  const ATTACHMENT_SELECTOR = [
    '[data-testid*="attachment" i]', '[class*="attachment" i]', '[class*="file-preview" i]', '[class*="thumbnail" i]',
    '[aria-label*="Remove" i]', '[aria-label*="删除"]', '[aria-label*="移除"]', '[aria-label*="附件"]', '[aria-label*="attachment" i]', 'img[src^="blob:"]', 'img[src^="data:"]',
  ].join(", ");
  const inputArea = (input) => {
    let node = input;
    for (let i = 0; i < 6 && node?.parentElement; i += 1) {
      node = node.parentElement;
      if (node.getBoundingClientRect().height > 80 || node.tagName === "FORM") break;
    }
    return node ?? document.body;
  };
  // Attachment chips often sit beside the text box rather than inside its wrapper (Grok): look at the whole
  // composer form when there is one, otherwise two wrapper levels up.
  const attachmentScope = (input) => input.closest?.("form") ?? inputArea(inputArea(input));
  const countAttachments = (input) => attachmentScope(input).querySelectorAll(ATTACHMENT_SELECTOR).length;
  const isUploading = (input) => !!attachmentScope(input).querySelector('[role="progressbar"], progress, [class*="progress" i], [class*="uploading" i], [aria-busy="true"]');

  const waitAttachments = async (input, expected, deadline) => {
    let stableSince = 0;
    while (Date.now() < deadline) {
      const ready = countAttachments(input) >= expected && !isUploading(input);
      if (ready) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= 600) return true;
      } else stableSince = 0;
      await sleep(150);
    }
    return false;
  };

  const pasteFiles = (input, files, text, isolated) => {
    const data = new DataTransfer();
    for (const file of files) data.items.add(file);
    if (text) data.setData("text/plain", text);
    const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: !isolated, cancelable: true });
    if (isolated) {
      // Grok re-handles bubbling pastes and must not see a dataTransfer property (05 §2.3).
      try {
        Object.defineProperty(event, "dataTransfer", { value: undefined });
      } catch {
        // ignore
      }
    }
    input.focus();
    input.dispatchEvent(event);
  };

  // A site prompt raised by the paste itself (Gemini's image-terms consent) holds the upload until the user answers.
  // Pasting again meanwhile queues a duplicate file, so wait for the prompt instead (up to 20 s). Only modal
  // dialogs count: non-modal cookie banners do not hold an upload.
  const siteModalOpen = () => [...document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"], dialog[open], mat-dialog-container')].some((el) => el.getClientRects().length > 0);
  const waitModalClosed = async (deadline) => {
    let waited = false;
    const until = Math.min(deadline, Date.now() + 20000);
    while (siteModalOpen() && Date.now() < until) {
      waited = true;
      await sleep(300);
    }
    return waited;
  };

  const pasteImages = async (input, opts, deadline) => {
    const files = await Promise.all(opts.images.map(toFile));
    const retries = Math.max(1, Number(opts.imageRetries) || 3);
    const base = countAttachments(input);
    const withText = opts.pasteTextWithImages ? opts.text : "";
    if (opts.imagePasteStrategy === "batch") {
      for (let attempt = 0; attempt < retries; attempt += 1) {
        pasteFiles(input, files, withText, opts.isolatedPaste);
        if (await waitAttachments(input, base + files.length, Math.min(deadline, Date.now() + 12000))) return true;
        if (countAttachments(input) > base) return true;
        if (await waitModalClosed(deadline)) {
          if (await waitAttachments(input, base + files.length, Math.min(deadline, Date.now() + 12000))) return true;
          if (countAttachments(input) > base || isUploading(input)) return true;
        }
      }
      return countAttachments(input) > base;
    }
    let have = base;
    for (const file of files) {
      let ok = false;
      for (let attempt = 0; attempt < retries && !ok; attempt += 1) {
        pasteFiles(input, [file], "", opts.isolatedPaste);
        ok = await waitAttachments(input, have + 1, Math.min(deadline, Date.now() + 10000));
        if (!ok && (await waitModalClosed(deadline))) ok = countAttachments(input) > have || (await waitAttachments(input, have + 1, Math.min(deadline, Date.now() + 10000)));
      }
      if (!ok) return false;
      have += 1;
    }
    return true;
  };

  // ---------------------------------------------------------------- submit (§2.4)
  const EXCLUDE = /close|cancel|stop|attach|upload|voice|dictat|microphone|mic\b|record|关闭|取消|停止|附件|上传|语音|录音/i;
  const labelOf = (btn) => norm([btn.getAttribute("aria-label"), btn.getAttribute("title"), btn.getAttribute("data-testid"), btn.textContent].filter(Boolean).join(" "));
  const scoreButton = (btn, input) => {
    const label = labelOf(btn);
    const testid = btn.getAttribute("data-testid") || "";
    if (EXCLUDE.test(label) && testid !== "send-button") return -Infinity;
    let score = 0;
    if (testid === "send-button") score += 900;
    if (/submit ai message|提交\s*ai/i.test(label)) score += 760;
    const text = norm(btn.getAttribute("aria-label") || btn.textContent);
    if (/^(send|发送|submit|提交)$/i.test(text)) score += 700;
    else if (/send|发送|submit|提交/i.test(label)) score += 500;
    if (btn.getAttribute("type") === "submit") score += 420;
    if (score <= 0) return -Infinity;
    const a = btn.getBoundingClientRect();
    const b = input.getBoundingClientRect();
    const dist = Math.hypot((a.left + a.right) / 2 - b.right, (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
    return score + Math.max(0, 300 - dist);
  };
  const findButton = (input, opts) => {
    const explicit = bottomMost(query(opts.sendSelector));
    if (explicit) return explicit;
    const scope = inputArea(inputArea(input)) ?? document;
    const candidates = [...new Set([...scope.querySelectorAll("button, [role='button']"), ...document.querySelectorAll("form button")])].filter(isVisible);
    let best = null;
    let bestScore = -Infinity;
    for (const btn of candidates) {
      const s = scoreButton(btn, input);
      if (s > bestScore) {
        best = btn;
        bestScore = s;
      }
    }
    return bestScore > -Infinity ? best : null;
  };
  const isDisabled = (btn) => btn.disabled || btn.getAttribute("aria-disabled") === "true";
  const pressEnter = (input, opts) => {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const mod = opts.sendKeyMode === "mod-enter";
    const init = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true, metaKey: mod && mac, ctrlKey: mod && !mac };
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", init));
    input.dispatchEvent(new KeyboardEvent("keypress", init));
    input.dispatchEvent(new KeyboardEvent("keyup", init));
  };

  const confirmSubmitted = async (input, text, before, until) => {
    while (Date.now() < until) {
      await sleep(150);
      const current = input.isConnected ? norm(readInput(input)) : "";
      if (!input.isConnected || current === "" || (text && current !== norm(text))) return "cleared";
      if (location.href !== before) return "navigated";
    }
    return null;
  };

  // ---------------------------------------------------------------- Notion bridge (§2.6)
  // The MAIN-world bridge does the work; an "activated" notice means the prompt may have gone out,
  // so a missing answer is reported as unknown rather than not-sent.
  const viaNotionBridge = (opts) => new Promise((resolve) => {
    const hasImages = Array.isArray(opts.images) && opts.images.length > 0;
    const key = `${opts.sendId || Date.now()}:${opts.scope || "text"}`;
    const deadline = Number(opts.deadline) || Date.now() + (hasImages ? 60000 : 10000);
    let activated = false;
    const done = (result) => {
      window.removeEventListener("chatclub:notion-result", onResult);
      window.removeEventListener("chatclub:notion-activated", onActivated);
      clearTimeout(timer);
      if (activated && result.deliveryState === "not-sent") result = { ...result, deliveryState: "unknown", sent: false };
      resolve(result);
    };
    const parse = (event) => {
      try {
        return JSON.parse(event.detail);
      } catch {
        return null;
      }
    };
    const onResult = (event) => {
      const data = parse(event);
      if (data?.key === key && data.result) done(data.result);
    };
    const onActivated = (event) => {
      if (parse(event)?.key === key) activated = true;
    };
    window.addEventListener("chatclub:notion-result", onResult);
    window.addEventListener("chatclub:notion-activated", onActivated);
    const method = hasImages ? "notion-prompt-bridge" : "notion-bridge";
    const timer = setTimeout(() => done({ sent: false, deliveryState: activated ? "unknown" : "not-sent", method, verified: false, submissionNavigation: null, reason: "bridge timed out" }), Math.max(1000, deadline - Date.now() + 500));
    window.dispatchEvent(new CustomEvent("chatclub:notion-send", { detail: JSON.stringify({ key, text: opts.text ?? "", images: hasImages ? opts.images : [], deadline }) }));
  });

  // ---------------------------------------------------------------- main
  const perform = async (opts) => {
    if (opts.imagePasteStrategy === "notion-bridge") return viaNotionBridge(opts);
    const hasImages = Array.isArray(opts.images) && opts.images.length > 0;
    const deadline = Number(opts.deadline) || Date.now() + (hasImages ? 60000 : 10000);
    const result = (deliveryState, extra = {}) => ({ sent: deliveryState === "sent", deliveryState, method: null, verified: false, submissionNavigation: null, reason: "", ...extra });

    let input = findInput(opts);
    const findUntil = Math.min(deadline, Date.now() + 4000);
    while (!input && Date.now() < findUntil) {
      await sleep(200);
      input = findInput(opts);
    }
    if (!input) return result("not-sent", { reason: "input not found" });

    if (hasImages) {
      if (!(await pasteImages(input, opts, deadline))) return result("not-sent", { reason: "images were not attached" });
      input = findInput(opts) ?? input;
    }
    const textAlreadyPasted = hasImages && opts.pasteTextWithImages && opts.text && norm(readInput(input)).includes(norm(opts.text));
    if (opts.text && !textAlreadyPasted) {
      if (!(await writeText(input, opts.text))) return result("not-sent", { reason: "text could not be written" });
    }

    const waitMs = hasImages ? 12000 : 8000;
    const buttonUntil = Math.min(deadline, Date.now() + waitMs);
    let button = findButton(input, opts);
    while ((!button || isDisabled(button)) && Date.now() < buttonUntil) {
      await sleep(150);
      button = findButton(input, opts);
    }
    const before = location.href;
    let method;
    if (button && !isDisabled(button)) {
      method = "click";
      button.click(); // exactly once: double activation makes some sites send twice
    } else {
      method = "enter";
      pressEnter(input, opts);
    }
    // From here on the message may have been submitted: never report "not-sent".
    const confirmed = await confirmSubmitted(input, opts.text, before, Math.min(deadline, Date.now() + 6000));
    if (!confirmed) return result("unknown", { method, reason: "submission was not confirmed" });
    const nav = location.href !== before ? { from: before, to: location.href } : null;
    return result("sent", { method, verified: true, submissionNavigation: nav });
  };

  // Report route changes caused by the first prompt (05 §2.5) even if they happen after the reply.
  cc.define("send", {
    /** Site clean-up before a new chat (02 §9.1): adapters hook in; by default close an open site modal. */
    async newChatPreprocess(payload) {
      if (cc.hasHook("newChatPreprocess")) return { ok: true, results: await cc.runHooks("newChatPreprocess", payload) };
      const modal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"], dialog[open]')].find((el) => el.getClientRects().length);
      if (modal) {
        (document.activeElement || document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
      }
      return { ok: true, closedModal: !!modal };
    },
    sendText(payload) {
      const id = String(payload.sendId || "");
      if (id && results.has(id)) return results.get(id);
      const job = perform(payload).catch((error) => ({ sent: false, deliveryState: "unknown", method: null, verified: false, submissionNavigation: null, reason: String(error?.message || error) }));
      if (id) {
        results.set(id, job);
        setTimeout(() => results.delete(id), RESULT_TTL_MS);
      }
      return job;
    },
  });
}
