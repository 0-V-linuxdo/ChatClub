// Element builders for the shared component set (spec v2 01 §5). Styling lives in the AppShell plugin.

import { h, icon } from "./dom.js";

export function button({ label, icon: iconName, variant = "", onClick, tip, tipId, disabled, title, type = "button", className = "" } = {}) {
  const classes = ["cc-btn", ...variant.split(" ").filter(Boolean), className].filter(Boolean).join(" ");
  return h(
    "button",
    {
      type,
      class: classes,
      disabled: !!disabled,
      onclick: onClick,
      title,
      dataset: tip ? { tip, ...(tipId ? { tipId } : {}) } : undefined,
    },
    iconName ? icon(iconName, { size: 15 }) : null,
    label ? h("span", label) : null,
  );
}

export function iconButton({ icon: iconName, label, onClick, tip, tipId, compact = false, disabled, size, className = "", attrs } = {}) {
  return h(
    `button.${compact ? "cc-compact-btn" : "cc-icon-btn"}`,
    {
      type: "button",
      class: className,
      disabled: !!disabled,
      onclick: onClick,
      "aria-label": label,
      dataset: { tip: tip ?? label ?? "", ...(tipId ? { tipId } : {}) },
      attrs,
    },
    icon(iconName, { size: size ?? (compact ? 15 : 16) }),
  );
}

export function spinner() {
  return h("span.cc-spinner", { attrs: { "aria-hidden": "true" } });
}

export function textInput({ value = "", placeholder, onInput, onChange, disabled, mono, type = "text", className = "" } = {}) {
  const el = h("input.cc-input", { type, value: value ?? "", placeholder, disabled: !!disabled, class: `${mono ? "mono" : ""} ${className}` });
  if (onInput) el.addEventListener("input", () => onInput(el.value, el));
  if (onChange) el.addEventListener("change", () => onChange(el.value, el));
  return el;
}

export function textArea({ value = "", placeholder, onInput, onChange, disabled, mono, rows } = {}) {
  const el = h("textarea.cc-textarea", { placeholder, disabled: !!disabled, class: mono ? "mono" : "", rows });
  el.value = value ?? "";
  if (onInput) el.addEventListener("input", () => onInput(el.value, el));
  if (onChange) el.addEventListener("change", () => onChange(el.value, el));
  return el;
}

/** options: [{ label, value }] */
export function select({ value, options, onChange, disabled } = {}) {
  const el = h(
    "select.cc-select",
    { disabled: !!disabled },
    options.map((o) => h("option", { value: String(o.value), selected: String(o.value) === String(value) }, o.label)),
  );
  if (onChange) {
    el.addEventListener("change", () => {
      const picked = options.find((o) => String(o.value) === el.value);
      onChange(picked ? picked.value : el.value, el);
    });
  }
  return el;
}

export function checkbox({ checked, onChange, disabled, label } = {}) {
  const input = h("input", { type: "checkbox", checked: !!checked, disabled: !!disabled, "aria-label": label });
  if (onChange) input.addEventListener("change", () => onChange(input.checked, input));
  const wrap = h("label.cc-check", input);
  wrap.input = input;
  return wrap;
}

export function toggleSwitch({ checked, onChange, disabled, label } = {}) {
  const input = h("input", { type: "checkbox", role: "switch", checked: !!checked, disabled: !!disabled, "aria-label": label });
  if (onChange) input.addEventListener("change", () => onChange(input.checked, input));
  const wrap = h("label.cc-switch", input, h("span"));
  wrap.input = input;
  return wrap;
}

/** options: [{ label, value, icon }] */
export function segmented({ value, options, onChange } = {}) {
  const wrap = h("div.cc-segmented", { role: "group" });
  const render = (current) => {
    wrap.replaceChildren(
      ...options.map((o) =>
        h(
          "button",
          {
            type: "button",
            attrs: { "aria-pressed": String(o.value === current) },
            onclick: () => {
              render(o.value);
              onChange?.(o.value);
            },
          },
          o.icon ? icon(o.icon, { size: 15 }) : null,
          o.label,
        ),
      ),
    );
  };
  render(value);
  return wrap;
}

export function sliderRow({ value, min, max, step = 1, enabled, onToggle, onChange, format = (v) => String(v) } = {}) {
  const out = h("output", format(value));
  const range = h("input", { type: "range", min, max, step, value });
  range.addEventListener("input", () => {
    out.textContent = format(Number(range.value));
  });
  range.addEventListener("change", () => onChange?.(Number(range.value)));
  const parts = [];
  if (onToggle) {
    const box = checkbox({ checked: enabled, onChange: (on) => {
      range.disabled = !on;
      onToggle(on);
    } });
    range.disabled = !enabled;
    parts.push(box);
  }
  return h("div.cc-slider-row", parts, range, out);
}

export function colorInput({ value, onChange } = {}) {
  const picker = h("input", { type: "color", value });
  const text = h("input.cc-input", { type: "text", value, spellcheck: false });
  picker.addEventListener("input", () => {
    text.value = picker.value;
    onChange?.(picker.value);
  });
  text.addEventListener("change", () => {
    onChange?.(text.value);
  });
  const row = h("div.cc-color-row", picker, text);
  row.setValue = (v) => {
    picker.value = v;
    text.value = v;
  };
  return row;
}

export function card({ title, body, className = "" } = {}) {
  return h("section.cc-card", { class: className }, title ? h("div.cc-card-title", title) : null, h("div.cc-card-body", body));
}

/** Two-column settings row: name (+ desc / help) | control. */
export function field({ label, desc, help, control, error } = {}) {
  const name = h("div.cc-field-name", h("span.label", label, help ?? null), desc ? h("span.desc", desc) : null);
  const controlBox = h("div.cc-field-control", control);
  const errorEl = h("div.cc-field-error", { hidden: !error, attrs: { role: "alert" } }, error ?? "");
  controlBox.append(errorEl);
  const row = h("div.cc-field", name, controlBox);
  row.setError = (message) => {
    errorEl.textContent = message || "";
    errorEl.hidden = !message;
  };
  return row;
}

export function emptyState(text) {
  return h("div.cc-empty", text);
}

export function badge(text, tone = "") {
  return h("span.cc-badge", { class: tone }, text);
}

/** Inner tab strip used inside settings sections. tabs: [{ id, label }] */
export function subtabs({ tabs, value, onChange } = {}) {
  const wrap = h("div.cc-subtabs", { attrs: { role: "tablist" } });
  const render = (current) => {
    wrap.replaceChildren(
      ...tabs.map((tab) =>
        h("button", {
          type: "button",
          attrs: { role: "tab", "aria-selected": String(tab.id === current) },
          onclick: () => {
            render(tab.id);
            onChange?.(tab.id);
          },
        }, tab.label),
      ),
    );
  };
  render(value);
  return wrap;
}
