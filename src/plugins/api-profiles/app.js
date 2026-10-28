// ApiProfiles: outbound API providers, their models, and which feature uses which (v2 06 §4).

import { h, clear, icon, uid } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { settingsTable, reorderButtonsOn } from "../../lib/settings-table.js";
import { chatCompletion } from "./client.js";
import { DEFAULT_MODEL, normalizeProfiles, normalizeProfile, resolveModel, resolveProfile } from "./model.js";

export default {
  start(ctx) {
    const t = ctx.t;
    const consumers = ctx.extensionPoint("apiConsumer");
    const profiles = () => normalizeProfiles(ctx.settings.apiProfiles);
    const saveProfiles = (list) => (ctx.settings.apiProfiles = normalizeProfiles(list));

    // ------------------------------------------------------------ service
    const consumerSelection = (consumer) => {
      try {
        return consumer.getSelection?.() ?? {};
      } catch {
        return {};
      }
    };
    /** { profile, model } a consumer (or an explicit selection) actually uses (06 §4.3). */
    const resolve = (selection) => {
      const sel = typeof selection === "string" ? consumerSelection(consumers.get(selection) ?? {}) : selection ?? {};
      const list = profiles();
      const profile = resolveProfile(list, sel.profileId);
      return { profile, model: resolveModel(profile, profile?.id === sel.profileId ? sel.model : "") };
    };
    const chat = async (selection, { messages, stream = false, signal, onDelta } = {}) => {
      const { profile, model } = resolve(selection);
      if (!profile) throw new Error("No API provider");
      const text = await chatCompletion({ endpoint: profile.endpoint, apiKey: profile.apiKey, model, messages, stream, signal, onDelta });
      return { text, model, profileId: profile.id };
    };
    ctx.services.provide("apiProfiles", {
      list: profiles,
      get: (id) => profiles().find((p) => p.id === id) ?? null,
      resolve,
      chat,
      /** A profile created from a feature's legacy fields; the feature adopts it once. */
      takeLegacyAssignment(feature) {
        const assignments = { ...(ctx.settings.legacyAssignments ?? {}) };
        const id = assignments[feature];
        if (!id) return null;
        delete assignments[feature];
        ctx.settings.legacyAssignments = assignments;
        return profiles().some((p) => p.id === id) ? id : null;
      },
      modelOptions: (profileId) => {
        const p = profiles().find((x) => x.id === profileId);
        if (!p) return [];
        return [...p.favoriteModels, ...p.models.filter((m) => !p.favoriteModels.includes(m))];
      },
    });

    // ------------------------------------------------------------ editor
    const openEditor = (existing) => {
      const shellUi = ctx.services.get("ui");
      const draft = existing ? structuredClone(existing) : { id: `profile-${uid("p").slice(2)}`, name: "", endpoint: "", apiKey: "", model: "", models: [], favoriteModels: [] };
      shellUi.openModal(({ onClose }) => {
        const name = ui.textInput({ value: draft.name });
        const endpoint = ui.textInput({ value: draft.endpoint, placeholder: "https://…/v1/chat/completions", mono: true });
        const key = ui.textInput({ value: draft.apiKey, type: "password", mono: true });
        let shown = false;
        const toggle = ui.button({ label: t("profiles.show"), icon: "eye", variant: "ghost", onClick: () => {
          shown = !shown;
          key.type = shown ? "text" : "password";
          toggle.querySelector("span").textContent = t(shown ? "profiles.hide" : "profiles.show");
        } });
        let models = [...draft.models];
        let favorites = [...draft.favoriteModels];
        const modelList = h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
        const renderModels = () => {
          clear(modelList);
          models.forEach((m, i) => {
            const more = ui.iconButton({ icon: "more", compact: true, label: t("profiles.edit"), onClick: () => {
              shellUi.openMenu({ anchor: more, align: "end", items: [
                { label: t("profiles.model.fallback"), icon: "check", disabled: i === 0, onClick: () => {
                  models = [m, ...models.filter((x) => x !== m)];
                  renderModels();
                } },
                { label: t(favorites.includes(m) ? "profiles.model.unfavorite" : "profiles.model.favorite"), icon: favorites.includes(m) ? "starOff" : "star", onClick: () => {
                  favorites = favorites.includes(m) ? favorites.filter((x) => x !== m) : [...favorites, m];
                  renderModels();
                } },
                "separator",
                { label: t("profiles.model.remove"), icon: "trash", danger: true, onClick: () => {
                  models = models.filter((x) => x !== m);
                  favorites = favorites.filter((x) => x !== m);
                  renderModels();
                } },
              ] });
            } });
            modelList.append(h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
              h("span.mono", { style: { flex: "1", fontFamily: "var(--font-mono)" } }, m),
              i === 0 ? ui.badge(t("profiles.model.isFallback")) : null,
              favorites.includes(m) ? icon("star", { size: 14 }) : null,
              more));
          });
          const input = ui.textInput({ placeholder: t("profiles.model.placeholder"), mono: true });
          const add = () => {
            const v = input.value.trim();
            if (!v || models.includes(v)) return;
            models.push(v);
            renderModels();
          };
          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.isComposing) {
              e.preventDefault();
              add();
            }
          });
          modelList.append(h("div", { style: { display: "flex", gap: "8px" } }, input, ui.button({ label: t("profiles.model.add"), icon: "plus", onClick: add })));
        };
        renderModels();
        const endpointRow = ui.field({ label: t("profiles.field.endpoint"), desc: t("profiles.field.endpoint.desc"), control: endpoint });
        const modelsRow = ui.field({ label: t("profiles.field.models"), desc: t("profiles.field.models.desc"), control: modelList });
        const save = () => {
          const ep = endpoint.value.trim();
          let ok = true;
          if (!/^https?:\/\/\S+$/i.test(ep)) {
            endpointRow.setError(t("profiles.error.endpoint"));
            ok = false;
          } else endpointRow.setError("");
          if (!models.length) {
            modelsRow.setError(t("profiles.error.model"));
            ok = false;
          } else modelsRow.setError("");
          if (!ok) return;
          const next = normalizeProfile({ ...draft, name: name.value.trim() || ep, endpoint: ep, apiKey: key.value, model: models[0], models, favoriteModels: favorites });
          const list = profiles();
          const at = list.findIndex((p) => p.id === next.id);
          if (at >= 0) list[at] = next;
          else list.push(next);
          saveProfiles(list);
          onClose("save");
        };
        const body = h("div",
          ui.field({ label: t("profiles.field.name"), control: name }),
          endpointRow,
          ui.field({ label: t("profiles.field.apiKey"), desc: t("profiles.field.apiKey.desc"), control: h("div", { style: { display: "flex", gap: "8px" } }, key, toggle) }),
          modelsRow);
        const footer = [ui.button({ label: t("profiles.cancel"), onClick: () => onClose("cancel") }), ui.button({ label: t("profiles.save"), variant: "primary", onClick: save })];
        return shellUi.modalLayout({ title: t(existing ? "profiles.editTitle" : "profiles.addTitle"), icon: "key", body, footer, onClose });
      }, { kind: "editor", size: "wide" });
    };

    // ------------------------------------------------------------ settings section (06 §4.2)
    ctx.contribute("settings.section", {
      id: "profiles",
      titleKey: "profiles.section.title",
      descKey: "profiles.section.desc",
      icon: "key",
      order: 10,
      group: "connect",
      render(container, sctx) {
        const shellUi = ctx.services.get("ui");
        let tab = sctx.args?.tab ?? "list";
        const content = h("div");
        const strip = ui.subtabs({ tabs: [{ id: "list", label: t("profiles.tab.list") }, { id: "usage", label: t("profiles.tab.usage") }], value: tab, onChange: (id) => {
          tab = id;
          renderTab();
        } });
        const usedBy = (profileId) => consumers.sorted().filter((c) => resolve(c.id).profile?.id === profileId);
        const renderList = () => {
          const list = profiles();
          const table = settingsTable({
            t,
            rows: list,
            moveButtons: reorderButtonsOn(ctx.host),
            onReorder: (ids) => {
              saveProfiles(ids.map((id) => list.find((p) => p.id === id)));
              renderTab();
            },
            columns: [
              { label: t("profiles.col.name"), width: "minmax(120px, 1.1fr)", render: (p) => h("strong.cell-ellipsis", p.name) },
              { label: t("profiles.col.model"), width: "minmax(100px, 1fr)", render: (p) => h("span.cell-ellipsis", p.models.length > 1 ? `${p.model} +${p.models.length - 1}` : p.model) },
              { label: t("profiles.col.usage"), width: "minmax(140px, 1.4fr)", render: (p) => {
                const users = usedBy(p.id);
                return users.length ? h("div", users.map((c) => h("span.cc-chip", t(c.labelKey)))) : h("span", { style: { color: "var(--muted)" } }, t("profiles.unassigned"));
              } },
            ],
            actions: (p) => [
              p.promotionChannel && p.registerUrl ? ui.iconButton({ icon: "external", label: t("profiles.promotion"), tipId: "settings.profiles.promotion", onClick: () => window.open(p.registerUrl, "_blank", "noopener") }) : null,
              ui.iconButton({ icon: "edit", label: t("profiles.edit"), tipId: "settings.action.edit", onClick: () => openEditor(p) }),
              ui.iconButton({ icon: "copy", label: t("profiles.duplicate"), tipId: "settings.action.duplicate", onClick: () => {
                saveProfiles([...profiles(), { ...structuredClone(p), id: `profile-${uid("p").slice(2)}`, name: t("profiles.copyName", { name: p.name }), promotionChannel: false, registerUrl: undefined }]);
                renderTab();
              } }),
              ui.iconButton({ icon: "trash", label: t("profiles.delete"), tipId: "settings.action.delete", className: "danger", onClick: async () => {
                if (profiles().length <= 1) {
                  shellUi.toast(t("profiles.lastOne"), "error");
                  return;
                }
                const ok = await shellUi.confirm({ title: t("profiles.deleteTitle", { name: p.name }), description: t("settings.deleteConfirm"), danger: true });
                if (!ok) return;
                saveProfiles(profiles().filter((x) => x.id !== p.id));
                renderTab();
              } }),
            ],
          });
          content.append(h("div.cc-section-toolbar", h("span.desc", t("profiles.list.desc")), ui.button({ label: t("profiles.add"), icon: "plus", variant: "primary", onClick: () => openEditor(null) })), table);
        };
        const renderUsage = () => {
          const list = profiles();
          const rows = consumers.sorted();
          content.append(h("h3", { style: { margin: "4px 0 10px", fontSize: "14px" } }, t("profiles.usage.outbound")));
          content.append(settingsTable({
            t,
            rows,
            empty: t("profiles.usage.none"),
            columns: [
              { label: t("profiles.usage.feature"), width: "minmax(120px, 1fr)", render: (c) => h("strong", t(c.labelKey)) },
              { label: t("profiles.usage.profile"), width: "minmax(160px, 1.2fr)", render: (c) => {
                const current = resolve(c.id).profile;
                return ui.select({ value: current?.id, options: list.map((p) => ({ value: p.id, label: p.name })), onChange: (v) => {
                  c.setSelection({ profileId: v, model: "" });
                  renderTab();
                } });
              } },
              { label: t("profiles.usage.model"), width: "minmax(160px, 1.2fr)", render: (c) => {
                const sel = consumerSelection(c);
                const { profile } = resolve(c.id);
                const options = [{ value: "", label: t("profiles.usage.fallbackModel", { model: profile?.model ?? DEFAULT_MODEL }) }, ...ctx.services.get("apiProfiles").modelOptions(profile?.id).map((m) => ({ value: m, label: `${profile.favoriteModels.includes(m) ? "★ " : ""}${m}` }))];
                const value = profile?.id === sel.profileId ? sel.model ?? "" : "";
                if (value && !options.some((o) => o.value === value)) options.push({ value, label: value });
                return ui.select({ value, options, onChange: (v) => c.setSelection({ profileId: profile.id, model: v }) });
              } },
            ],
          }));
          const preferred = ctx.services.get("preferredModel");
          content.append(h("h3", { style: { margin: "22px 0 10px", fontSize: "14px" } }, t("profiles.usage.preferred")));
          const summary = preferred?.summaryRows?.() ?? [];
          if (summary.length) {
            content.append(settingsTable({ t, rows: summary, key: (r) => r.appId, columns: [
              { label: t("profiles.usage.feature"), render: (r) => r.appName },
              { label: t("profiles.usage.model"), render: (r) => [r.primary, r.secondary].filter(Boolean).join(" / ") || "—" },
            ] }));
          }
          content.append(h("p", ui.button({ label: t("profiles.usage.preferred.link"), icon: "model", variant: "ghost", onClick: () => sctx.openSection("models") })));
        };
        const renderTab = () => {
          clear(content);
          if (tab === "usage") renderUsage();
          else renderList();
        };
        const off = ctx.plugin.settings.use(["apiProfiles"], () => renderTab());
        sctx.onDispose(off);
        sctx.onDispose(consumers.subscribe(() => renderTab()));
        renderTab();
        container.append(strip, content);
      },
    });
  },
};
