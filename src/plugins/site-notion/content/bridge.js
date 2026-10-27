// Notion send bridge (MAIN world, document_start; v2 05 §2.6). Notion's editor ignores input synthesized in
// the isolated world, so the isolated SendRuntime hands the job to this script through window events and
// waits for its answer. Each request key (send id + scope) runs once; results are cached, then dropped.
(() => {
  if (window === window.top || window.__chatclubNotionBridge) return;
  let params;
  try {
    params = new URLSearchParams(window.name || "");
  } catch {
    return;
  }
  if (!params.has("chatclub_webview") || !/^[0-9a-f]{64}$/.test(params.get("chatclub_frame_binding") || "")) return;
  Object.defineProperty(window, "__chatclubNotionBridge", { value: true });

  const REQUEST = "chatclub:notion-send";
  const RESULT = "chatclub:notion-result";
  const ACTIVATED = "chatclub:notion-activated";
  const CACHE_MS = 5 * 60 * 1000;
  const STABLE_MAX_MS = 45000;
  const jobs = new Map();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(detail) }));

  const visible = (el) => {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== "hidden";
  };
  const editor = () => [...document.querySelectorAll('[contenteditable="true"][role="textbox"], [contenteditable="true"]')].filter(visible).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] ?? null;
  const area = (input) => {
    let node = input;
    for (let i = 0; i < 6 && node?.parentElement; i++) {
      node = node.parentElement;
      if (node.getBoundingClientRect().height > 90) break;
    }
    return node ?? document.body;
  };
  const textOf = (el) => norm(el?.innerText ?? el?.textContent ?? "");
  const ATTACH = 'img[src^="blob:"], img[src^="data:"], [class*="attachment" i], [aria-label*="Remove" i], [aria-label*="删除"]';
  const attachments = (input) => area(input).querySelectorAll(ATTACH).length;
  const uploading = (input) => !!area(input).querySelector('[role="progressbar"], [aria-busy="true"], [class*="uploading" i]');

  const selectAll = (el) => {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };
  /** Clears last round's draft and attachments so the new prompt starts clean. */
  const prepare = async (input) => {
    input.click();
    input.focus();
    if (textOf(input)) {
      selectAll(input);
      document.execCommand("delete");
    }
    for (const btn of area(input).querySelectorAll('[aria-label*="Remove" i], [aria-label*="删除"]')) btn.click();
    await sleep(120);
  };
  const writeText = (input, text) => {
    selectAll(input);
    if (!document.execCommand("insertText", false, text)) {
      input.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: text }));
    }
  };
  const toFile = async (img) => {
    const blob = await (await fetch(img.dataUrl)).blob();
    return new File([blob], img.name || "image.png", { type: img.type || blob.type || "image/png" });
  };
  const paste = (input, files, text) => {
    const data = new DataTransfer();
    for (const f of files) data.items.add(f);
    if (text) data.setData("text/plain", text);
    input.focus();
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  };
  const waitStable = async (check, until) => {
    let since = 0;
    while (Date.now() < until) {
      if (check()) {
        if (!since) since = Date.now();
        if (Date.now() - since >= 500) return true;
      } else since = 0;
      await sleep(150);
    }
    return false;
  };
  const sendButton = (input) => {
    const scope = area(area(input));
    const buttons = [...scope.querySelectorAll("button, [role='button']")].filter(visible);
    return buttons.find((b) => /submit|send|发送|提交/i.test(`${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`)) ?? null;
  };
  const enabled = (b) => b && !b.disabled && b.getAttribute("aria-disabled") !== "true";

  const run = async ({ key, text, images = [], deadline }) => {
    const withImages = images.length > 0;
    const method = withImages ? "notion-prompt-bridge" : "notion-bridge";
    const until = Number(deadline) || Date.now() + (withImages ? 60000 : 10000);
    const result = (deliveryState, extra = {}) => ({ sent: deliveryState === "sent", deliveryState, method, verified: deliveryState === "sent", submissionNavigation: null, reason: "", ...extra });
    let input = null;
    while (!input && Date.now() < Math.min(until, Date.now() + 4000)) {
      input = editor();
      if (!input) await sleep(200);
    }
    if (!input) return result("not-sent", { reason: "editor not found" });
    await prepare(input);
    if (withImages) {
      const files = await Promise.all(images.map(toFile));
      const base = attachments(input);
      let attached = false;
      for (let attempt = 0; attempt < 3 && !attached; attempt++) {
        paste(input, files, text);
        attached = await waitStable(() => attachments(input) >= base + files.length, Math.min(until, Date.now() + 8000));
      }
      if (!attached) return result("not-sent", { reason: "images were not attached" });
      // Notion sometimes keeps the images and drops the text: write it separately.
      input = editor() ?? input;
      if (text && !textOf(input).includes(norm(text))) writeText(input, text);
      if (!(await waitStable(() => !uploading(input), Math.min(until, Date.now() + STABLE_MAX_MS)))) return result("not-sent", { reason: "images still uploading" });
    } else if (text) {
      writeText(input, text);
    }
    if (text && !textOf(input).includes(norm(text))) return result("not-sent", { reason: "text could not be written" });
    const ready = await waitStable(() => enabled(sendButton(input)), Math.min(until, Date.now() + STABLE_MAX_MS));
    const before = location.href;
    emit(ACTIVATED, { key });
    const button = sendButton(input);
    if (ready && enabled(button)) button.click();
    else {
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
    }
    // Submitted when the editor is empty and the text shows up outside it.
    while (Date.now() < until) {
      await sleep(200);
      const now = editor();
      const cleared = !now || !textOf(now).includes(norm(text).slice(0, 40));
      const shown = !text || [...document.querySelectorAll("main, [role='main'], body")].some((el) => textOf(el).includes(norm(text).slice(0, 40)));
      if (cleared && shown) return result("sent", { submissionNavigation: location.href !== before ? { from: before, to: location.href } : null });
    }
    return result("unknown", { reason: "submission was not confirmed" });
  };

  window.addEventListener(REQUEST, (event) => {
    let req;
    try {
      req = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (!req?.key) return;
    let job = jobs.get(req.key);
    if (!job) {
      job = run(req).catch((error) => ({ sent: false, deliveryState: "unknown", method: "notion-bridge", verified: false, submissionNavigation: null, reason: String(error?.message || error) }));
      jobs.set(req.key, job);
      setTimeout(() => jobs.delete(req.key), CACHE_MS);
    }
    job.then((result) => emit(RESULT, { key: req.key, result }));
  });
})();
