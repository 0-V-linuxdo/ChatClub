export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key === "class") node.className = value || "";
    else if (key === "dataset") {
      for (const [dataKey, dataValue] of Object.entries(value || {})) node.dataset[dataKey] = dataValue;
    } else if (key === "style" && value && typeof value === "object") {
      for (const [styleKey, styleValue] of Object.entries(value)) {
        if (styleValue == null) continue;
        if (styleKey.startsWith("--")) node.style.setProperty(styleKey, String(styleValue));
        else node.style[styleKey] = styleValue;
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      node.setAttribute(key, "");
    } else if (value !== false && value != null) {
      node.setAttribute(key, value);
    }
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function iconButton(label, icon, onClick, extraClass = "", tooltipLabel = label, tooltipPlacement = "", tooltipId = "") {
  return el("button", {
    class: `icon-button tooltip-trigger ${extraClass}`.trim(),
    "aria-label": label,
    "data-tooltip": tooltipLabel,
    "data-tooltip-placement": tooltipPlacement || null,
    "data-tooltip-id": tooltipId || null,
    onclick: onClick
  }, icon);
}

export function button(label, onClick, variant = "secondary") {
  return el("button", { class: `button button-${variant}`, onclick: onClick }, label);
}

export function field(label, input) {
  return el("label", { class: "field" }, el("span", {}, label), input);
}

export function input(value = "", attrs = {}) {
  return el("input", { class: "input", value, ...attrs });
}

export function textarea(value = "", attrs = {}) {
  const node = el("textarea", { class: "textarea", ...attrs });
  node.value = value || "";
  return node;
}

export function select(value, options, attrs = {}) {
  const node = el("select", { class: "select", ...attrs });
  for (const option of options) {
    node.append(el("option", { value: option.value, selected: option.value === value }, option.label));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function toast(message, kind = "info") {
  let host = document.querySelector(".toast-host");
  if (!host) {
    host = el("div", { class: "toast-host" });
    document.body.append(host);
  }
  const item = el("div", { class: `toast toast-${kind}` }, message);
  host.append(item);
  setTimeout(() => item.classList.add("show"), 20);
  setTimeout(() => {
    item.classList.remove("show");
    setTimeout(() => item.remove(), 240);
  }, 3200);
}

export function createFrameToast(iframe, message, kind = "info") {
  const frameWrap = iframe?.closest?.(".chat-frame-wrap");
  if (!frameWrap || !iframe?.isConnected) {
    return Object.freeze({
      update() {},
      dismiss() {},
      remove() {}
    });
  }

  const instanceId = String(iframe.dataset?.instanceId || "");
  for (const existing of frameWrap.querySelectorAll(".frame-submit-toast")) {
    if (String(existing.dataset?.frameInstanceId || "") === instanceId) existing.remove();
  }

  let dismissTimer = 0;
  let removeTimer = 0;
  let showTimer = 0;
  let observer = null;
  const item = el("div", {
    class: `toast frame-submit-toast toast-${kind}`,
    dataset: { frameInstanceId: instanceId },
    role: kind === "error" ? "alert" : "status",
    "aria-live": kind === "error" ? "assertive" : "polite",
    "aria-atomic": "true"
  }, message);

  function clearTimers() {
    if (dismissTimer) clearTimeout(dismissTimer);
    if (removeTimer) clearTimeout(removeTimer);
    if (showTimer) clearTimeout(showTimer);
    dismissTimer = 0;
    removeTimer = 0;
    showTimer = 0;
  }

  function remove() {
    clearTimers();
    observer?.disconnect?.();
    observer = null;
    item.remove();
  }

  function update(nextMessage, nextKind = "info") {
    clearTimers();
    if (!frameWrap.isConnected || !iframe.isConnected || !item.isConnected) {
      remove();
      return;
    }
    item.textContent = String(nextMessage || "");
    item.classList.remove("toast-info", "toast-success", "toast-error");
    item.classList.add(`toast-${nextKind}`);
    item.setAttribute("role", nextKind === "error" ? "alert" : "status");
    item.setAttribute("aria-live", nextKind === "error" ? "assertive" : "polite");
    item.classList.add("show");
  }

  function dismiss(delayMs = 0) {
    if (!item.isConnected) {
      remove();
      return;
    }
    if (dismissTimer) clearTimeout(dismissTimer);
    if (removeTimer) clearTimeout(removeTimer);
    dismissTimer = setTimeout(() => {
      dismissTimer = 0;
      item.classList.remove("show");
      removeTimer = setTimeout(remove, 240);
    }, Math.max(0, Number(delayMs) || 0));
  }

  iframe.insertAdjacentElement("afterend", item);
  showTimer = setTimeout(() => {
    showTimer = 0;
    if (item.isConnected) item.classList.add("show");
  }, 20);

  if (typeof MutationObserver === "function") {
    observer = new MutationObserver(() => {
      if (!iframe.isConnected || !item.isConnected) remove();
    });
    observer.observe(frameWrap, { childList: true });
  }

  return Object.freeze({ update, dismiss, remove });
}

export function modal(title, content, onClose, wide = false, closeLabel = "Close") {
  const backdrop = el("div", { class: "modal-backdrop", onclick: (event) => {
    if (event.target === backdrop) onClose();
  }});
  const panel = el("section", { class: `modal ${wide ? "modal-wide" : ""}` },
    el("header", { class: "modal-header" },
      el("h2", {}, title),
      iconButton(closeLabel, "×", onClose, "", closeLabel, "", "settings.modal.close")
    ),
    el("div", { class: "modal-body" }, content)
  );
  backdrop.append(panel);
  document.body.append(backdrop);
  return backdrop;
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
