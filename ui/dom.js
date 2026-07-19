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

function append(node, children) {
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

export function field(label, inputNode) {
  return el("label", { class: "field" }, el("span", {}, label), inputNode);
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

const MODAL_TYPE_CONFIG = Object.freeze({
  viewer: Object.freeze({ dismissOnBackdrop: true }),
  editor: Object.freeze({ dismissOnBackdrop: false }),
  task: Object.freeze({ dismissOnBackdrop: false }),
  confirmation: Object.freeze({ dismissOnBackdrop: false })
});

export function modal(title, content, onClose, wide = false, closeLabel = "Close", options = {}) {
  const modalType = Object.hasOwn(MODAL_TYPE_CONFIG, options.type) ? options.type : "legacy";
  const dismissOnBackdrop = typeof options.dismissOnBackdrop === "boolean"
    ? options.dismissOnBackdrop
    : modalType === "legacy" || MODAL_TYPE_CONFIG[modalType].dismissOnBackdrop;
  const backdrop = el("div", { class: "modal-backdrop", dataset: { modalType }, onclick: (event) => {
    if (dismissOnBackdrop && event.target === backdrop) onClose();
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

function typedModal(type, title, content, onClose, wide = false, closeLabel = "Close") {
  return modal(title, content, onClose, wide, closeLabel, { type });
}

export function viewerModal(title, content, onClose, wide = false, closeLabel = "Close") {
  return typedModal("viewer", title, content, onClose, wide, closeLabel);
}

export function editorModal(title, content, onClose, wide = false, closeLabel = "Close") {
  return typedModal("editor", title, content, onClose, wide, closeLabel);
}

export function taskModal(title, content, onClose, wide = false, closeLabel = "Close") {
  return typedModal("task", title, content, onClose, wide, closeLabel);
}

export function confirmationModal(title, content, onClose, wide = false, closeLabel = "Close") {
  return typedModal("confirmation", title, content, onClose, wide, closeLabel);
}

export function isDismissalEscape(event) {
  return event?.key === "Escape" && !event.isComposing && event.keyCode !== 229;
}

export function claimTopmostPopoverEscape(event, ownerSelector) {
  if (!isDismissalEscape(event)) return false;
  const popovers = document.querySelectorAll(".popover-menu");
  const topmost = popovers[popovers.length - 1];
  if (!topmost?.matches?.(ownerSelector)) return false;
  event.preventDefault?.();
  event.stopImmediatePropagation?.();
  return true;
}
