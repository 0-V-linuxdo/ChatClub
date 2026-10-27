// Shortcuts settings section (v2 06 §2.4): one list per platform profile, record / disable / restore defaults.

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { comboFromEvent, formatCombo } from "./keys.js";

const STYLE = String.raw`
.cc-sc-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 12px; align-items: center; min-height: 48px; border-bottom: 1px solid var(--line); }
.cc-sc-row:last-child { border-bottom: 0; }
.cc-keycaps { display: inline-flex; gap: 4px; }
.cc-keycap { min-width: 24px; height: 24px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 6px; background: var(--panel-2); font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.cc-keycap.placeholder { color: var(--muted); font-style: italic; }
.cc-sc-row.recording .cc-keycaps { outline: 2px solid var(--primary); outline-offset: 3px; border-radius: 6px; }
.cc-sc-row.off .cc-keycaps { opacity: .45; }
`;

export function registerShortcutSettings(ctx, svc) {
  const t = ctx.t;
  const shellUi = () => ctx.services.get("ui");
  ctx.styles.register("shortcuts-settings", STYLE);

  const caps = (p, actionId, combo) => {
    if (!combo) return h("span.cc-keycaps", h("span.cc-keycap.placeholder", t("shortcuts.none")));
    const mac = p === "mac";
    const parts = combo.split("+");
    const code = parts.pop();
    const mods = parts.map((m) => (mac ? { Meta: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧" }[m] : { Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift", Meta: "Win" }[m]));
    const key = svc.isDigit(actionId) || code === "Digit" ? null : formatCombo(code, mac);
    return h("span.cc-keycaps", ...mods.map((m) => h("span.cc-keycap", m)), key ? h("span.cc-keycap", key) : h("span.cc-keycap.placeholder", t("shortcuts.digit")));
  };

  let stopRecording = null;
  const record = (row, p, entry, redraw) => {
    stopRecording?.();
    row.classList.add("recording");
    const onKey = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") return stop();
      let combo = comboFromEvent(event);
      if (!combo) return; // modifiers alone do not finish recording
      if (p === "windows" && combo.startsWith("Meta+")) return;
      if (svc.isDigit(entry.id)) {
        if (!/Digit[1-9]$/.test(combo)) return;
        combo = combo.replace(/Digit[1-9]$/, "Digit");
      }
      stop();
      const res = await svc.setCombo(p, entry.id, combo);
      if (res?.ok === false) shellUi().toast(t("shortcuts.conflict", { action: labelOf(res.conflict) }), "error");
      redraw();
    };
    const stop = () => {
      window.removeEventListener("keydown", onKey, true);
      row.classList.remove("recording");
      stopRecording = null;
    };
    window.addEventListener("keydown", onKey, true);
    stopRecording = stop;
  };
  const labelOf = (id) => {
    const e = svc.entries().find((x) => x.id === id);
    return e?.labelKey ? t(e.labelKey) : id;
  };

  const renderProfile = (box, p) => {
    const draw = () => {
      clear(box);
      box.append(h("div.cc-section-toolbar",
        h("span.desc", t(p === "mac" ? "shortcuts.profile.mac" : "shortcuts.profile.windows")),
        h("span", { style: { fontSize: "13px", color: "var(--muted)" } }, t("shortcuts.sendKey")),
        ui.segmented({ value: svc.sendKeyModeOf(p), options: [{ value: "enter", label: "Enter" }, { value: "mod-enter", label: p === "mac" ? "⌘ Enter" : "Ctrl+Enter" }], onChange: (v) => svc.setSendKeyMode(p, v) }),
        ui.button({ label: t("shortcuts.reset"), icon: "reset", onClick: async () => {
          if (!(await shellUi().confirm({ title: t("shortcuts.reset.confirm"), danger: false }))) return;
          await svc.resetProfile(p);
          draw();
        } })));
      const list = h("div");
      for (const entry of svc.entries()) {
        const combo = svc.comboOf(p, entry.id);
        const off = svc.isDisabled(p, entry.id);
        const row = h("div.cc-sc-row", { class: off ? "off" : "" });
        row.append(
          h("span", entry.labelKey ? t(entry.labelKey) : entry.id),
          caps(p, entry.id, combo),
          ui.iconButton({ icon: "keyboard", label: t("shortcuts.record"), tipId: "settings.shortcuts.record", onClick: () => record(row, p, entry, draw) }),
          ui.toggleSwitch({ checked: !off, label: t("shortcuts.enabled"), onChange: async (v) => {
            const res = await svc.setDisabled(p, entry.id, !v);
            if (res?.ok === false) shellUi().toast(t("shortcuts.conflict", { action: labelOf(res.conflict) }), "error");
            draw();
          } }));
        list.append(row);
      }
      box.append(list);
    };
    draw();
  };

  ctx.contribute("settings.section", {
    id: "shortcuts",
    titleKey: "shortcuts.section.title",
    descKey: "shortcuts.section.desc",
    icon: "keyboard",
    order: 120,
    group: "prompts",
    render(container) {
      let current = svc.platform;
      const box = h("div");
      const tabs = ui.segmented({ value: current, options: [{ value: "mac", label: "macOS" }, { value: "windows", label: "Windows / Linux" }], onChange: (v) => {
        stopRecording?.();
        current = v;
        renderProfile(box, current);
      } });
      container.append(ui.card({ title: t("shortcuts.section.title"), body: h("div", h("div", { style: { marginBottom: "8px" } }, tabs), h("div", { style: { fontSize: "12px", color: "var(--muted)", marginBottom: "8px" } }, t("shortcuts.help")), box) }));
      renderProfile(box, current);
    },
  });
}
