// Renders a plugin's visible settings as field rows (spec v1.2 §9.1, §15.4).

import { h, humanizeKey } from "./dom.js";
import * as ui from "./ui.js";
import { isVisibleSetting } from "../kernel/settings.js";

/** Label for a setting: i18n key "setting.<Plugin>.<key>" if present, else humanized key. */
export function settingLabel(host, pluginName, key) {
  const i18nKey = `setting.${pluginName}.${key}`;
  const i18n = host.getService("i18n");
  return i18n?.has(i18nKey) ? i18n.t(i18nKey) : humanizeKey(key);
}

export function renderSettingsFields(host, plugin, { keys, onRestartNeeded } = {}) {
  const defined = plugin.settings;
  if (!defined) return [];
  const t = (k, v) => host.t(k, v);
  const store = defined.store;
  const rows = [];
  const disposers = [];
  for (const key of keys ?? Object.keys(defined.def)) {
    const field = defined.def[key];
    if (!isVisibleSetting(field)) continue;
    let row;
    const write = (value) => {
      const verdict = defined.trySet(key, value);
      row.setError(verdict === true ? "" : t(verdict));
      if (verdict === true && field.restartNeeded) onRestartNeeded?.(key);
      refreshDisabled();
      return verdict === true;
    };
    const control = buildControl(field, store[key], write, t);
    row = ui.field({
      label: settingLabel(host, plugin.name, key),
      desc: field.description ? t(field.description) : null,
      control,
    });
    row.dataset.settingKey = key;
    const refreshDisabled = () => {
      const disabled = defined.isDisabled(key);
      control.querySelectorAll?.("input, select, textarea, button").forEach((el) => (el.disabled = disabled));
      if (control.matches?.("input, select, textarea, button")) control.disabled = disabled;
    };
    refreshDisabled();
    rows.push(row);
  }
  // Re-evaluate disabled() of every row whenever any of this plugin's settings change.
  const refreshAll = () => {
    for (const row of rows) {
      const key = row.dataset.settingKey;
      const disabled = defined.isDisabled(key);
      row.querySelectorAll("input, select, textarea, button").forEach((el) => (el.disabled = disabled));
    }
  };
  disposers.push(defined.use(refreshAll));
  rows.dispose = () => disposers.forEach((fn) => fn());
  return rows;
}

function buildControl(field, value, write, t) {
  switch (field.type) {
    case "boolean":
      return ui.toggleSwitch({ checked: !!value, onChange: (v) => write(v) });
    case "number": {
      const el = ui.textInput({ type: "number", value: value ?? "", placeholder: field.placeholder ? t(field.placeholder) : undefined });
      el.style.width = "10rem";
      el.addEventListener("change", () => {
        if (el.value === "") return;
        if (!write(Number(el.value))) return;
      });
      return el;
    }
    case "select":
      return ui.select({
        value,
        options: field.options.map((o) => ({ label: t(o.label), value: o.value })),
        onChange: (v) => write(v),
      });
    case "slider":
      return ui.sliderRow({ value: value ?? field.default, min: field.min, max: field.max, step: field.step ?? 1, onChange: (v) => write(v) });
    case "component": {
      const box = h("div");
      try {
        const el = field.component({ value, setValue: (v) => write(v), option: field });
        if (el) box.append(el);
      } catch (error) {
        box.append(h("span.cc-field-error", String(error?.message || error)));
      }
      return box;
    }
    case "string":
    default: {
      const opts = { value: value ?? "", placeholder: field.placeholder ? t(field.placeholder) : undefined, onChange: (v) => write(v) };
      return field.multiline ? ui.textArea(opts) : ui.textInput(opts);
    }
  }
}
