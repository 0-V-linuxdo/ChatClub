// DataTransfer (page): the `dataTransfer` extension point, the options block, export / import / full reset,
// and the io settings section (v2 06 §11).

import { decodeOptions, encodeOptions } from "../../kernel/options-codec.js";
import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { BLOCK_ORDER, fileName, buildExport, parseImport, itemCount, filterOptions, hasCustomScripts } from "./model.js";

/** Checkbox with a visible label. */
const labeled = ({ checked, disabled, label, onChange }) => {
  const box = ui.checkbox({ checked, disabled, label, onChange });
  const el = h("label", { style: { display: "inline-flex", alignItems: "center", gap: "8px", cursor: disabled ? "default" : "pointer", opacity: disabled ? ".6" : "1" } }, box.input, h("span", label));
  el.input = box.input;
  return el;
};

const SENSITIVE = { options: "io.sensitive.options", pocketHistory: "io.sensitive.pocket", workspaceTabs: "io.sensitive.tabs", promptLibrary: "io.sensitive.prompts", promptSendHistory: "io.sensitive.prompts" };

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const point = ctx.extensionPoint("dataTransfer");
    const settings = ctx.host.settings;

    // ------------------------------------------------------------ options block
    const fieldFor = (optionKey) => {
      const owner = settings.optionOwners.get(optionKey);
      if (!owner) return null;
      return settings.defined.get(owner.plugin)?.def?.[owner.key] ?? { type: "custom" };
    };
    const ownerStore = (optionKey) => {
      const owner = settings.optionOwners.get(optionKey);
      const store = owner ? ctx.host.plugins[owner.plugin]?.settings?.store : null;
      return store ? { store, key: owner.key } : null;
    };
    ctx.contribute("dataTransfer", {
      id: "options",
      labelKey: "io.block.options",
      order: 0,
      export: async () => JSON.parse(JSON.stringify(encodeOptions(settings.optionsPlain ?? {}))),
      check: (data) => {
        const { accepted, dropped, invalid } = filterOptions(decodeOptions(data), fieldFor);
        const warnings = [];
        if (invalid) warnings.push(t("io.warn.invalid", { n: 1 }));
        if (dropped) warnings.push(t("io.warn.dropped", { n: dropped }));
        if (hasCustomScripts(accepted)) warnings.push(t("io.warn.scripts"));
        return { count: Object.keys(accepted).length, warnings };
      },
      import: async (data) => {
        const { accepted, dropped } = filterOptions(decodeOptions(data), fieldFor);
        for (const [key, value] of Object.entries(accepted)) {
          const target = ownerStore(key);
          if (target) target.store[target.key] = value;
        }
        await settings.flush?.();
        return { imported: Object.keys(accepted).length, dropped };
      },
      reset: async () => {
        await chrome.storage.local.remove(["options", "pluginSettings"]);
      },
    });

    const blocks = () => point.sorted().sort((a, b) => BLOCK_ORDER.indexOf(a.id) - BLOCK_ORDER.indexOf(b.id));

    // ------------------------------------------------------------ export
    const doExport = async (ids) => {
      const out = {};
      for (const b of blocks()) if (ids.includes(b.id)) out[b.id] = await b.export();
      const blob = new Blob([JSON.stringify(buildExport(out), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = h("a", { href: url, download: fileName() });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      shellUi.toast(t("io.exported"), "success");
    };

    // ------------------------------------------------------------ import
    const openImport = (parsed) => {
      const present = blocks();
      shellUi.openModal(({ onClose }) => {
        const rows = [];
        const picks = new Map();
        const modes = new Map();
        for (const b of present) {
          const has = b.id in parsed.blocks;
          const data = parsed.blocks[b.id];
          const checked = b.check ? b.check(data) : { count: itemCount(data), warnings: [] };
          const warnings = [...(checked.warnings ?? [])];
          if (has && Array.isArray(data) && !data.length) warnings.push(t("io.warn.empty"));
          const box = labeled({ checked: has, disabled: !has, label: t(b.labelKey) });
          picks.set(b.id, () => box.input.checked);
          const status = !has ? t("io.status.missing") : Array.isArray(data) && !data.length ? t("io.status.zero") : t("io.status.items", { n: checked.count ?? itemCount(data) });
          let modeControl = null;
          if (has && b.modes?.length) {
            let value = b.modes[0].value;
            modeControl = ui.segmented({ value, options: b.modes.map((m) => ({ value: m.value, label: t(m.labelKey) })), onChange: (v) => (value = v) });
            modes.set(b.id, () => value);
          }
          rows.push(h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", padding: "10px 0", borderBottom: "1px solid var(--line)" } },
            h("div", { style: { display: "flex", alignItems: "center", gap: "12px", justifyContent: "space-between" } }, box, h("span", { style: { color: "var(--muted)", fontSize: "13px" } }, status)),
            modeControl,
            ...warnings.map((w) => h("div", { style: { color: "var(--warning, #b45309)", fontSize: "12px" } }, w))));
        }
        const run = async () => {
          const chosen = present.filter((b) => picks.get(b.id)?.());
          if (!chosen.length) return;
          onClose("import");
          const report = [];
          for (const b of chosen) {
            try {
              const r = await b.import(parsed.blocks[b.id], modes.get(b.id)?.() ?? "merge");
              report.push(`${t(b.labelKey)} ✓${r?.dropped ? ` (${t("io.warn.dropped", { n: r.dropped })})` : ""}`);
            } catch (error) {
              report.push(`${t(b.labelKey)} ✗ ${String(error?.message || error)}`);
            }
          }
          shellUi.toast(t("io.imported", { list: report.join("；") }), "success", { duration: 6000 });
        };
        return shellUi.modalLayout({ title: t("io.import.title"), icon: "upload", body: h("div", rows), onClose, footer: [ui.button({ label: t("io.cancel"), onClick: () => onClose("cancel") }), ui.button({ label: t("io.import.ok"), variant: "primary", onClick: run })] });
      }, { kind: "editor" });
    };
    const pickFile = () => {
      const input = h("input", { type: "file", accept: "application/json,.json", style: { display: "none" } });
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        const parsed = parseImport(await file.text());
        if (parsed.error) {
          shellUi.toast(t(`io.error.${parsed.error}`), "error");
          return;
        }
        openImport(parsed);
      });
      document.body.append(input);
      input.click();
    };

    // ------------------------------------------------------------ full reset (06 §11.4)
    const fullReset = async () => {
      const ok = await shellUi.confirm({ title: t("io.reset.title"), description: t("io.reset.body"), acknowledge: t("io.reset.ack"), confirmText: t("io.reset.ok"), danger: true });
      if (!ok) return;
      for (const b of blocks()) {
        try {
          await b.reset?.();
        } catch (error) {
          ctx.logger.warn(`Resetting ${b.id} failed:`, error);
        }
      }
      ctx.events.emit("DataTransfer:reset", {});
      shellUi.toast(t("io.reset.done"), "success");
      setTimeout(() => location.reload(), 800);
    };

    ctx.contribute("settings.section", {
      id: "io",
      titleKey: "io.section.title",
      descKey: "io.section.desc",
      icon: "transfer",
      order: 130,
      group: "data",
      render(container) {
        const list = blocks();
        const chosen = new Set(list.map((b) => b.id));
        const notes = h("div", { style: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--warning, #b45309)" } });
        const exportBtn = ui.button({ label: t("io.export"), icon: "download", variant: "primary", onClick: () => doExport([...chosen]) });
        const drawNotes = () => {
          clear(notes);
          const keys = [...new Set([...chosen].map((id) => SENSITIVE[id]).filter(Boolean))];
          if (chosen.has("options")) keys.push("io.sensitive.scripts");
          notes.append(...keys.map((k) => h("div", `⚠ ${t(k)}`)));
          exportBtn.disabled = !chosen.size;
        };
        const checks = h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" } },
          ...list.map((b) => labeled({ checked: true, label: t(b.labelKey), onChange: (v) => {
            if (v) chosen.add(b.id);
            else chosen.delete(b.id);
            drawNotes();
          } })));
        drawNotes();
        container.append(
          ui.card({ title: t("io.export.title"), body: h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } }, checks, notes, h("div", exportBtn)) }),
          ui.card({ title: t("io.import.title"), body: h("div", { style: { display: "flex", gap: "12px", alignItems: "center" } }, h("span.desc", { style: { flex: "1", color: "var(--muted)", fontSize: "13px" } }, t("io.import.desc")), ui.button({ label: t("io.import.pick"), icon: "upload", onClick: pickFile })) }),
          ui.card({ title: t("io.reset.title"), body: h("div", { style: { display: "flex", gap: "12px", alignItems: "center" } }, h("span.desc", { style: { flex: "1", color: "var(--muted)", fontSize: "13px" } }, t("io.reset.desc")), ui.button({ label: t("io.reset.ok"), icon: "trash", variant: "danger-solid", onClick: fullReset })) }),
        );
      },
    });
  },
};
