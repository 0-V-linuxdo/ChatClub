// AppsSettings (page): the "apps" settings section (v2 06 §5): built-in / custom platform tables,
// the custom app editor (also opened from the app picker), icons, and iframe permission overrides.

import { h, clear, icon } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { settingsTable, reorderButtonsOn } from "../../lib/settings-table.js";
import { appIconImg } from "../../lib/app-icon.js";
import { KNOWN_ALLOW, KNOWN_SANDBOX, IFRAME_ALLOW, IFRAME_SANDBOX, REFERRER_POLICIES, resolveIframeAttributes, validateIframeConfig, newRisks, summarize } from "../apps/iframe-config.js";

const ICON_MAX = 65536;
const STRATEGY_ICON = { sequential: "listOrdered", batch: "images", "notion-bridge": "cable" };
const GENERIC_SUBDOMAINS = new Set(["www", "app", "chat", "web", "m", "beta", "ai", "assistant"]);


export default {
  start(ctx) {
    const t = ctx.t;
    const apps = ctx.services.get("apps");
    const shellUi = () => ctx.services.get("ui");
    if (!apps) return;
    const appsStore = () => ctx.host.plugins.Apps?.settings?.store ?? {};

    const strategyCell = (app) => {
      const s = app.imagePasteStrategy ?? "sequential";
      return h("span.cc-apps-strategy", { dataset: { tip: t(`apps.strategy.${s}`) }, attrs: { "aria-label": t(`apps.strategy.${s}`), tabindex: "0" } }, icon(STRATEGY_ICON[s] ?? "listOrdered", { size: 17 }));
    };
    const nameCell = (app) => h("div.cc-apps-name", appIconImg(ctx.host, app), h("strong.cell-ellipsis", app.name));
    const urlCell = (app) => h("span.cc-apps-url", { attrs: { title: app.url } }, app.url);

    // ------------------------------------------------------------ details (read-only, built-ins)
    const openDetail = (app) => {
      shellUi().openModal(({ onClose }) => {
        const row = (k, v) => [h("dt", t(k)), h("dd", v || "—")];
        const body = h("dl.cc-apps-detail",
          row("apps.detail.provider", app.provider),
          row("apps.detail.hosts", (app.hosts ?? []).join(", ")),
          row("apps.detail.input", app.inputSelector || t("apps.detail.builtinImpl")),
          row("apps.detail.send", app.sendSelector || app.sendButtonSelector || t("apps.detail.builtinImpl")),
          row("apps.detail.image", t(`apps.strategy.${app.imagePasteStrategy ?? "sequential"}`)));
        return shellUi().modalLayout({ title: app.name, icon: "apps", body, footer: [ui.button({ label: t("apps.close"), onClick: () => onClose("close") })], onClose });
      }, { kind: "editor" });
    };

    // ------------------------------------------------------------ custom app editor (06 §5.2)
    const nameFromHost = (host) => {
      const parts = host.toLowerCase().split(".").filter(Boolean);
      while (parts.length > 2 && GENERIC_SUBDOMAINS.has(parts[0])) parts.shift();
      const base = parts.length > 1 ? parts[parts.length - 2] : parts[0] ?? host;
      return base.charAt(0).toUpperCase() + base.slice(1);
    };
    const openCustomAppEditor = (existing = null, { onSaved } = {}) => {
      const draft = existing ? { ...existing } : { name: "", url: "", inputSelector: "", sendButtonSelector: "", imagePasteStrategy: "sequential" };
      shellUi().openModal(({ onClose }) => {
        let autoName = !existing;
        const name = ui.textInput({ value: draft.name });
        name.addEventListener("input", () => (autoName = false));
        const url = ui.textInput({ value: draft.url, placeholder: "https://…", mono: true });
        const input = ui.textInput({ value: draft.inputSelector, placeholder: t("apps.field.input.ph"), mono: true });
        const send = ui.textInput({ value: draft.sendButtonSelector, placeholder: t("apps.field.send.ph"), mono: true });
        let strategy = draft.imagePasteStrategy === "batch" ? "batch" : "sequential";
        const strategyCtl = ui.segmented({ value: strategy, options: ["sequential", "batch"].map((v) => ({ value: v, label: t(`apps.strategy.${v}`), icon: STRATEGY_ICON[v] })), onChange: (v) => (strategy = v) });
        const hint = h("div.cc-apps-hint");
        const autofill = () => {
          let parsed;
          try {
            parsed = new URL(url.value.trim());
          } catch {
            return;
          }
          if (!/^https?:$/.test(parsed.protocol)) return;
          const builtin = apps.list().find((a) => a.builtin && a.id !== draft.id && (a.hosts ?? []).some((x) => parsed.hostname === x || parsed.hostname.endsWith(`.${x}`)));
          if (builtin) {
            if (autoName || !name.value.trim()) name.value = builtin.name;
            if (!input.value.trim() && builtin.inputSelector) input.value = builtin.inputSelector;
            if (!send.value.trim() && builtin.sendSelector) send.value = builtin.sendSelector;
            hint.textContent = t("apps.autofill.builtin", { name: builtin.name });
          } else {
            if (autoName || !name.value.trim()) name.value = nameFromHost(parsed.hostname);
            hint.textContent = t("apps.autofill.domain", { host: parsed.hostname });
          }
        };
        url.addEventListener("change", autofill);
        const nameRow = ui.field({ label: t("apps.field.name"), control: name });
        url.style.width = "100%";
        const urlRow = ui.field({ label: t("apps.field.url"), control: h("div", { style: { flex: "1", minWidth: "0", width: "100%" } }, url, hint) });
        const save = async () => {
          const n = name.value.trim();
          const u = url.value.trim();
          let ok = true;
          nameRow.setError(n ? "" : t("apps.error.name"));
          if (!n) ok = false;
          let host = "";
          try {
            const p = new URL(u);
            if (!/^https?:$/.test(p.protocol)) throw new Error("protocol");
            host = p.hostname.replace(/^www\./, "");
            urlRow.setError("");
          } catch {
            urlRow.setError(t("apps.error.url"));
            ok = false;
          }
          if (!ok) return;
          const record = { ...draft, name: n, url: u, provider: draft.provider || "Custom", inputSelector: input.value.trim(), sendButtonSelector: send.value.trim(), imagePasteStrategy: strategy, hosts: [host] };
          if (!record.id) record.id = `custom-app-${crypto.randomUUID().slice(0, 8)}`;
          const list = apps.customList();
          const at = list.findIndex((a) => a.id === record.id);
          if (at >= 0) list[at] = record;
          else list.push(record);
          await apps.saveCustom(list);
          onClose("save");
          onSaved?.(record);
        };
        const body = h("div.cc-apps-wide",
          nameRow,
          urlRow,
          ui.field({ label: t("apps.field.input"), control: input }),
          ui.field({ label: t("apps.field.send"), control: send }),
          ui.field({ label: t("apps.field.image"), control: strategyCtl }));
        const footer = [ui.button({ label: t("apps.cancel"), onClick: () => onClose("cancel") }), ui.button({ label: t("apps.save"), variant: "primary", onClick: save })];
        return shellUi().modalLayout({ title: t(existing ? "apps.editor.editTitle" : "apps.editor.addTitle"), icon: "apps", body, footer, onClose });
      }, { kind: "editor", size: "wide" });
    };

    // ------------------------------------------------------------ icons (06 §5.3)
    const loadImage = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => (img.naturalWidth ? resolve(img) : reject(new Error("empty")));
      img.onerror = () => reject(new Error("load"));
      img.src = src;
    });
    const readFile = (file) => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    /** Scales an image down until its PNG/WebP data URL fits in 64 KB. */
    const toIconDataUrl = async (src) => {
      const img = await loadImage(src);
      for (const size of [128, 96, 64, 48, 32]) {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        for (const type of ["image/png", "image/webp"]) {
          const url = canvas.toDataURL(type, 0.9);
          if (url.length <= ICON_MAX) return url;
        }
      }
      throw new Error("too large");
    };
    const faviconUrl = (app) => {
      try {
        return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(app.url)}&size=64&t=${Date.now()}`;
      } catch {
        return "";
      }
    };
    const openIconEditor = (app, onDone) => {
      shellUi().openModal(({ onClose }) => {
        let value = apps.iconFor(app.id) ?? "";
        const preview = h("div.cc-apps-icon-preview");
        const draw = () => {
          clear(preview);
          if (value) {
            const img = h("img", { attrs: { src: value, alt: "" } });
            img.addEventListener("error", () => img.replaceWith(icon("globe", { className: "fallback" })), { once: true });
            preview.append(img);
          } else preview.append(appIconImg(ctx.host, { ...app, logo: app.logo }));
        };
        const invalid = () => shellUi().toast(t("apps.icon.invalid"), "error");
        const link = ui.textInput({ value: /^https:/i.test(value) ? value : "", placeholder: "https://…/icon.png", mono: true });
        link.addEventListener("change", async () => {
          const v = link.value.trim();
          if (!v) return;
          if (!/^https:\/\//i.test(v)) return invalid();
          try {
            await loadImage(v);
            value = v;
            draw();
          } catch {
            invalid();
          }
        });
        const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico", hidden: true });
        file.addEventListener("change", async () => {
          const f = file.files?.[0];
          file.value = "";
          if (!f) return;
          try {
            const raw = await readFile(f);
            value = f.type === "image/svg+xml" && raw.length <= ICON_MAX ? (await loadImage(raw), raw) : await toIconDataUrl(raw);
            link.value = "";
            draw();
          } catch {
            invalid();
          }
        });
        const refresh = async () => {
          try {
            value = await toIconDataUrl(faviconUrl(app));
            link.value = "";
            draw();
          } catch {
            invalid();
          }
        };
        draw();
        const body = h("div.cc-apps-wide",
          ui.field({ label: t("apps.icon.preview"), control: h("div.cc-apps-row", preview,
            ui.button({ label: t("apps.icon.refresh"), icon: "refreshCw", onClick: refresh }),
            ui.button({ label: t("apps.icon.reset"), icon: "reset", onClick: () => {
              value = "";
              link.value = "";
              draw();
            } })) }),
          ui.field({ label: t("apps.icon.url"), control: link }),
          ui.field({ label: t("apps.icon.upload"), desc: t("apps.icon.uploadDesc"), control: h("div", file, ui.button({ label: t("apps.icon.upload"), icon: "upload", onClick: () => file.click() })) }));
        const footer = [ui.button({ label: t("apps.cancel"), onClick: () => onClose("cancel") }), ui.button({ label: t("apps.save"), variant: "primary", onClick: () => {
          apps.setIcon(app.id, value || null);
          onClose("save");
          onDone?.();
        } })];
        return shellUi().modalLayout({ title: t("apps.icon.title", { name: app.name }), icon: "image", body, footer, onClose });
      }, { kind: "editor" });
    };

    // ------------------------------------------------------------ iframe permissions (06 §5.4)
    const policyText = (app, config) => {
      const s = summarize(app, config);
      const sandbox = s.sandbox === "removed" ? t("apps.iframe.sandboxRemoved") : s.sandbox === "strict" ? t("apps.iframe.sandboxStrict") : t("apps.iframe.sandboxN", { n: s.sandbox });
      return [t("apps.iframe.allowSummary", { n: s.allowCount, total: s.allowTotal }), sandbox, s.referrer === null ? t("apps.iframe.referrerOmit") : `referrer ${s.referrer}`].join(" · ");
    };
    const openIframeEditor = (app, onDone) => {
      const before = apps.iframeConfigFor(app.id) ?? {};
      const draft = structuredClone(before);
      shellUi().openModal(({ onClose }) => {
        const preview = h("div.cc-apps-preview");
        const messages = h("div");
        const update = () => {
          const attrs = resolveIframeAttributes(app, app.url, draft);
          const show = (v) => (v === null ? t("apps.iframe.omitted") : `"${v}"`);
          preview.textContent = [`allow=${show(attrs.allow)}`, `sandbox=${show(attrs.sandbox)}`, `referrerpolicy=${show(attrs.referrerPolicy)}`, ...attrs.attributes.map((a) => (a.value ? `${a.name}="${a.value}"` : a.name))].join("\n");
          const { errors, warnings } = validateIframeConfig(draft);
          clear(messages);
          for (const e of errors) messages.append(h("div.cc-apps-msg.error", t("apps.iframe.error", { field: e.field, token: e.token ?? "" })));
          for (const w of warnings) messages.append(h("div.cc-apps-msg.warning", t("apps.iframe.warning", { field: w.field, token: w.token })));
          return errors.length === 0;
        };
        const listEditor = (key, known, defaults, itemsKey, rawPh, sep) => {
          const box = h("div");
          const mode = () => draft[key]?.mode ?? "inherit";
          const draw = () => {
            clear(box);
            if (mode() === "visual") {
              const picked = new Set(draft[key][itemsKey] ?? []);
              const grid = h("div.cc-apps-checks");
              for (const token of [...new Set([...known, ...picked])]) {
                const cb = h("input", { type: "checkbox", checked: picked.has(token) });
                cb.addEventListener("change", () => {
                  const set = new Set(draft[key][itemsKey] ?? []);
                  if (cb.checked) set.add(token);
                  else set.delete(token);
                  draft[key][itemsKey] = known.filter((x) => set.has(x)).concat([...set].filter((x) => !known.includes(x)));
                  update();
                });
                grid.append(h("label", cb, h("span", token)));
              }
              box.append(grid);
            } else if (mode() === "raw") {
              const ta = ui.textInput({ value: draft[key].value ?? "", placeholder: rawPh, mono: true, onInput: (v) => {
                draft[key].value = v;
                update();
              } });
              box.append(ta);
            }
          };
          const ctl = ui.segmented({ value: mode(), options: ["inherit", "visual", "raw", "omit"].map((v) => ({ value: v, label: t(`apps.iframe.mode.${v}`) })), onChange: (v) => {
            if (v === "inherit") delete draft[key];
            else if (v === "visual") draft[key] = { mode: "visual", [itemsKey]: [...defaults] };
            else if (v === "raw") draft[key] = { mode: "raw", value: key === "allow" ? defaults.map((x) => `${x} *`).join(sep) : defaults.join(sep) };
            else draft[key] = { mode: "omit" };
            draw();
            update();
          } });
          draw();
          return h("div", ctl, box);
        };
        const allowDefaults = IFRAME_ALLOW;
        const sandboxDefaults = app.noSandbox ? [] : IFRAME_SANDBOX;
        const refBox = h("div");
        const drawRef = () => {
          clear(refBox);
          const mode = draft.referrerPolicy?.mode ?? "inherit";
          refBox.append(ui.segmented({ value: mode, options: ["inherit", "value", "omit"].map((v) => ({ value: v, label: t(`apps.iframe.mode.${v}`) })), onChange: (v) => {
            if (v === "inherit") delete draft.referrerPolicy;
            else if (v === "value") draft.referrerPolicy = { mode: "value", value: "no-referrer" };
            else draft.referrerPolicy = { mode: "omit" };
            drawRef();
            update();
          } }));
          if (mode === "value") refBox.append(h("div", { style: { marginTop: "8px" } }, ui.select({ value: draft.referrerPolicy.value, options: REFERRER_POLICIES.map((p) => ({ value: p, label: p })), onChange: (v) => {
            draft.referrerPolicy.value = v;
            update();
          } })));
        };
        drawRef();
        const attrBox = h("div");
        const drawAttrs = () => {
          clear(attrBox);
          (draft.attributes ?? []).forEach((a, i) => {
            attrBox.append(h("div.cc-apps-row", { style: { marginBottom: "6px" } },
              ui.textInput({ value: a.name, placeholder: t("apps.iframe.attrs.name"), mono: true, onInput: (v) => {
                draft.attributes[i].name = v.trim().toLowerCase();
                update();
              } }),
              ui.textInput({ value: a.value, placeholder: t("apps.iframe.attrs.value"), mono: true, onInput: (v) => {
                draft.attributes[i].value = v;
                update();
              } }),
              ui.iconButton({ icon: "trash", compact: true, label: t("apps.delete"), onClick: () => {
                draft.attributes.splice(i, 1);
                if (!draft.attributes.length) delete draft.attributes;
                drawAttrs();
                update();
              } })));
          });
          attrBox.append(ui.button({ label: t("apps.iframe.attrs.add"), icon: "plus", variant: "ghost", onClick: () => {
            draft.attributes = [...(draft.attributes ?? []), { name: "", value: "" }];
            drawAttrs();
          } }));
        };
        drawAttrs();
        update();
        const save = async () => {
          if (draft.attributes) draft.attributes = draft.attributes.filter((a) => a.name);
          if (draft.attributes && !draft.attributes.length) delete draft.attributes;
          if (!update()) return;
          const risks = newRisks(app, before, draft);
          if (risks.length) {
            const lines = risks.map((r) => `· ${t(`apps.iframe.risk.${r.kind}`, { token: r.token ?? "" })}`).join("\n");
            const ok = await shellUi().confirm({ title: t("apps.iframe.risk.title"), description: `${t("apps.iframe.risk.body")}\n${lines}`, confirmText: t("apps.iframe.risk.ok"), tone: "warning" });
            if (!ok) return;
          }
          await apps.setIframeConfig(app.id, draft);
          onClose("save");
          onDone?.();
        };
        const body = h("div",
          h("p.cc-apps-notice", t("apps.iframe.notice")),
          ui.field({ label: "allow", control: listEditor("allow", KNOWN_ALLOW, allowDefaults, "features", t("apps.iframe.allow.raw"), "; ") }),
          ui.field({ label: "sandbox", control: listEditor("sandbox", KNOWN_SANDBOX, sandboxDefaults, "tokens", t("apps.iframe.sandbox.raw"), " ") }),
          ui.field({ label: "referrerpolicy", control: refBox }),
          ui.field({ label: t("apps.iframe.attrs"), desc: t("apps.iframe.attrs.desc"), control: attrBox }),
          messages,
          ui.field({ label: t("apps.iframe.preview"), control: preview }));
        const footer = [ui.button({ label: t("apps.cancel"), onClick: () => onClose("cancel") }), ui.button({ label: t("apps.save"), variant: "primary", onClick: save })];
        return shellUi().modalLayout({ title: t("apps.iframe.editTitle", { name: app.name }), icon: "shield", body, footer, onClose });
      }, { kind: "editor", size: "wide" });
    };

    // ------------------------------------------------------------ section
    ctx.contribute("settings.section", {
      id: "apps",
      titleKey: "apps.section.title",
      descKey: "apps.section.desc",
      icon: "apps",
      order: 20,
      group: "connect",
      render(container, sctx) {
        let tab = sctx.args?.tab === "iframe" ? "iframe" : "manage";
        let source = sctx.args?.source === "custom" ? "custom" : "builtIn";
        const content = h("div");
        const strip = ui.subtabs({ tabs: [{ id: "manage", label: t("apps.tab.manage") }, { id: "iframe", label: t("apps.tab.iframe") }], value: tab, onChange: (id) => {
          tab = id;
          draw();
        } });
        const moveButtons = () => reorderButtonsOn(ctx.host);
        const sourceSwitch = (value, onChange) => ui.segmented({ value, options: [{ value: "builtIn", label: t("apps.src.builtIn") }, { value: "custom", label: t("apps.src.custom") }], onChange });

        const drawManage = () => {
          const all = apps.list();
          const builtins = all.filter((a) => a.builtin);
          const customs = all.filter((a) => !a.builtin);
          const columns = [
            { label: t("apps.col.name"), width: "minmax(140px, 1fr)", render: nameCell },
            { label: t("apps.col.url"), width: "minmax(160px, 1.4fr)", render: urlCell },
            { label: t("apps.col.image"), width: "110px", render: strategyCell },
          ];
          content.append(h("div.cc-apps-switches", sourceSwitch(source, (v) => {
            source = v;
            draw();
          })));
          if (source === "builtIn") {
            content.append(h("div.cc-section-toolbar", h("span.desc", t("apps.builtin.desc"))));
            content.append(settingsTable({ t, rows: builtins, moveButtons: moveButtons(), columns,
              onReorder: (ids) => {
                apps.setBuiltinOrder(ids);
                draw();
              },
              actions: (app) => [
                ui.iconButton({ icon: "eye", label: t("apps.detail"), onClick: () => openDetail(app) }),
                ui.iconButton({ icon: "image", label: t("apps.changeIcon"), onClick: () => openIconEditor(app, draw) }),
              ] }));
          } else {
            content.append(h("div.cc-section-toolbar", h("span.desc", t("apps.custom.desc")), ui.button({ label: t("apps.add"), icon: "plus", variant: "primary", onClick: () => openCustomAppEditor(null) })));
            content.append(settingsTable({ t, rows: customs, moveButtons: moveButtons(), columns, empty: t("apps.customEmpty"),
              onReorder: async (ids) => {
                const list = apps.customList();
                await apps.saveCustom(ids.map((id) => list.find((a) => a.id === id)).filter(Boolean));
              },
              actions: (app) => [
                ui.iconButton({ icon: "edit", label: t("apps.edit"), tipId: "settings.action.edit", onClick: () => openCustomAppEditor(apps.customList().find((a) => a.id === app.id) ?? app) }),
                ui.iconButton({ icon: "image", label: t("apps.changeIcon"), onClick: () => openIconEditor(app, draw) }),
                ui.iconButton({ icon: "trash", label: t("apps.delete"), tipId: "settings.action.delete", className: "danger", onClick: async () => {
                  const ok = await shellUi().confirm({ title: t("apps.deleteTitle", { name: app.name }), description: t("apps.deleteBody"), danger: true });
                  if (!ok) return;
                  await apps.saveCustom(apps.customList().filter((a) => a.id !== app.id));
                  apps.setIcon(app.id, null);
                } }),
              ] }));
          }
        };

        const drawIframe = () => {
          const store = appsStore();
          const current = store.iframePermissionsSource === "custom" ? "custom" : "builtIn";
          content.append(h("p.cc-apps-notice", t("apps.iframe.notice")));
          content.append(h("div.cc-apps-switches", sourceSwitch(current, (v) => {
            store.iframePermissionsSource = v;
            draw();
          })));
          const rows = apps.list().filter((a) => (current === "custom" ? !a.builtin : a.builtin));
          content.append(settingsTable({ t, rows, empty: t("apps.customEmpty"), columns: [
            { label: t("apps.col.name"), width: "minmax(140px, 1fr)", render: nameCell },
            { label: t("apps.iframe.col.source"), width: "90px", render: (a) => h("span", t(a.builtin ? "apps.src.builtIn" : "apps.src.custom")) },
            { label: t("apps.iframe.col.policy"), width: "minmax(200px, 1.6fr)", render: (a) => h("span.cell-ellipsis", { style: { fontSize: "12.5px" } }, policyText(a, apps.iframeConfigFor(a.id))) },
            { label: t("apps.iframe.col.status"), width: "90px", render: (a) => {
              const over = summarize(a, apps.iframeConfigFor(a.id)).overridden;
              return ui.badge(t(over ? "apps.iframe.overridden" : "apps.iframe.default"), over ? "warning" : "muted");
            } },
          ], actions: (a) => [
            ui.iconButton({ icon: "edit", label: t("apps.edit"), tipId: "settings.action.edit", onClick: () => openIframeEditor(a, draw) }),
            ui.iconButton({ icon: "reset", label: t("apps.iframe.reset"), disabled: !summarize(a, apps.iframeConfigFor(a.id)).overridden, onClick: async () => {
              await apps.setIframeConfig(a.id, null);
              draw();
            } }),
          ] }));
        };

        const draw = () => {
          clear(content);
          if (tab === "iframe") drawIframe();
          else drawManage();
        };
        sctx.onDispose(ctx.events.on("Apps:changed", () => draw()));
        draw();
        container.append(strip, content);
      },
    });

    ctx.services.provide("appSettings", {
      openCustomAppEditor: (existing = null, opts) => openCustomAppEditor(existing, opts),
      openIconEditor,
      openIframeEditor,
    });
  },
};
