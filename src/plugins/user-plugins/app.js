// UserPlugins: imports user plugin files (local file, URL or pasted code), registers each one as a plugin
// of its own, and runs it in a sandboxed page (sandbox.html). The plugin talks to ChatClub only through
// postMessage calls, and every call is checked against the abilities granted at import time.

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { ICON_PATHS } from "../../lib/icons.generated.js";
import { isHttpUrl, normalizeUserUrl } from "../../lib/url.js";
import { parsePluginFile } from "../../lib/user-plugin-format.js";

const LIST_KEY = "list";
const DATA_KEY = "data";
const START_TIMEOUT_MS = 15000;
const STOP_TIMEOUT_MS = 1000;

/** JSON round trip: everything crossing the sandbox boundary is plain data. */
const plain = (value) => {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
};

export default {
  async start(ctx) {
    const host = ctx.host;
    const t = ctx.t;
    const shellUi = () => ctx.services.get("ui");
    const toast = (message, type) => shellUi()?.toast?.(message, type);
    let records = (await ctx.storage.get(LIST_KEY)) ?? [];
    const registered = new Set();

    const save = async () => {
      await ctx.storage.set(LIST_KEY, records);
      host.meta.dynamicPlugins = records.map((r) => r.name);
    };
    const changed = (detail = {}) => {
      ctx.services.get("i18n")?.invalidate?.();
      host.events.dispatch("pluginsChanged", detail);
    };
    const dataKeyOf = (name) => `plugin:${name}:${DATA_KEY}`;

    // ------------------------------------------------------------ sandbox runtime
    const runtimes = new Map(); // name -> { stop }

    const runPlugin = (record, pctx) => {
      const { name } = record;
      const grants = new Set(record.meta.grants);
      const need = (grant) => {
        if (!grants.has(grant)) throw new Error(t("userPlugins.err.notGranted", { grant }));
      };
      const frame = h("iframe.cc-user-plugin-frame", { attrs: { src: chrome.runtime.getURL("sandbox.html"), "aria-hidden": "true", tabindex: "-1" }, dataset: { plugin: name } });
      const send = (msg) => frame.contentWindow?.postMessage({ chatclubHost: true, ...msg }, "*");
      const invoke = (cb, ...args) => {
        if (cb?.__cb) send({ type: "invoke", cb: cb.__cb, args: plain(args) });
      };
      const owned = new Map(); // "kind:id" -> remover
      let seq = 0;
      const keep = (key, remover) => {
        owned.get(key)?.();
        owned.set(key, remover);
        return key.slice(key.indexOf(":") + 1);
      };
      const drop = (key) => {
        owned.get(key)?.();
        owned.delete(key);
      };
      const iconOf = (value) => (value && ICON_PATHS[value] ? value : record.meta.icon && ICON_PATHS[record.meta.icon] ? record.meta.icon : "plug");
      const services = (id) => {
        const svc = ctx.services.get(id);
        if (!svc) throw new Error(`${id} is not available`);
        return svc;
      };
      // A new button joins the top bar once, before the settings menu; after that the user's layout decides.
      const placeOnce = (itemId) => {
        const placed = (record.placed ??= []);
        const topbar = ctx.services.get("topbar");
        if (placed.includes(itemId) || !topbar) return;
        const layout = topbar.currentLayout();
        if (!layout.includes(itemId)) {
          const at = layout.indexOf("settingsJumpMenu");
          layout.splice(at >= 0 ? at : layout.length, 0, itemId);
          topbar.setLayout(layout);
        }
        placed.push(itemId);
        save();
      };
      const currentTabId = (ws) => ws.currentGroup()?.activeTabId ?? null;
      let data = null;
      const loadData = async () => (data ??= (await pctx.storage.get(DATA_KEY)) ?? {});

      const methods = {
        log: (parts) => pctx.logger.info(...(Array.isArray(parts) ? parts : [parts])),
        notify: (message, type) => toast(`${name}: ${message}`, ["error", "success", "warning"].includes(type) ? type : "message"),
        "storage.get": async (key) => plain((await loadData())[key]),
        "storage.set": async (key, value) => {
          (await loadData())[String(key)] = plain(value);
          await pctx.storage.set(DATA_KEY, data);
        },
        "storage.remove": async (key) => {
          delete (await loadData())[String(key)];
          await pctx.storage.set(DATA_KEY, data);
        },
        "storage.keys": async () => Object.keys(await loadData()),
        "css.add": (cssText) => {
          need("css");
          const id = `css${++seq}`;
          const styleId = `${name}:${id}`;
          host.styles?.register(styleId, String(cssText));
          host.styles?.enable(styleId);
          return keep(`css:${id}`, () => host.styles?.unregister(styleId));
        },
        "css.remove": (id) => drop(`css:${id}`),
        "topbar.addButton": ({ id, label, icon } = {}, cb) => {
          need("ui");
          const local = String(id || `button${++seq}`);
          const itemId = `${name}.${local}`;
          const off = pctx.contribute("topbar.item", { id: itemId, variant: "action", labelKey: String(label || name), icon: iconOf(icon), onClick: () => invoke(cb) });
          placeOnce(itemId);
          return keep(`topbar:${local}`, off);
        },
        "topbar.remove": (id) => drop(`topbar:${id}`),
        "shortcuts.add": ({ id, label } = {}, cb) => {
          need("ui");
          const local = String(id || `shortcut${++seq}`);
          const off = pctx.contribute("shortcut.action", { id: `${name}.${local}`, labelKey: String(label || `${name}: ${local}`), run: () => invoke(cb) });
          return keep(`shortcut:${local}`, off);
        },
        "shortcuts.remove": (id) => drop(`shortcut:${id}`),
        "composer.getText": () => {
          need("composer");
          return services("composer").getDraft().text;
        },
        "composer.setText": (text) => {
          need("composer");
          services("composer").setDraft({ text }, { focus: false });
        },
        "composer.insert": (text) => {
          need("composer");
          services("composer").insertText(text);
        },
        "composer.send": async (text) => {
          need("composer");
          const composer = services("composer");
          await (text === undefined ? composer.send() : composer.send({ text }));
        },
        "workspace.tabs": () => {
          need("workspace");
          const ws = services("workspace");
          return ws.groups().map((g) => ({ groupId: g.id, active: g.tabs[g.activeIndex]?.id ?? null, tabs: g.tabs.map((tab) => ({ tabId: tab.id, appId: tab.appId, url: tab.href })) }));
        },
        "workspace.currentUrl": () => {
          need("workspace");
          const ws = services("workspace");
          const tabId = currentTabId(ws);
          return tabId ? ws.currentHrefSync(tabId) : "";
        },
        "workspace.open": (url, tabId) => {
          need("workspace");
          if (!isHttpUrl(url)) throw new Error(t("userPlugins.url.bad"));
          const ws = services("workspace");
          return ws.navigateTab(tabId ?? currentTabId(ws), url);
        },
        "workspace.refresh": (tabId) => {
          need("workspace");
          const ws = services("workspace");
          return ws.refreshTab(tabId ?? currentTabId(ws));
        },
        "events.on": (event, cb) => {
          need("events");
          const id = `sub${++seq}`;
          return keep(`event:${id}`, pctx.events.on(event, (payload) => invoke(cb, payload)));
        },
        "events.off": (id) => drop(`event:${id}`),
        fetch: async (url, init = {}) => {
          need("network");
          if (!isHttpUrl(url)) throw new Error(t("userPlugins.url.bad"));
          const res = await fetch(url, { method: init.method || "GET", headers: init.headers, body: init.body, credentials: "omit" });
          return { ok: res.ok, status: res.status, statusText: res.statusText, url: res.url, headers: Object.fromEntries(res.headers.entries()), text: await res.text() };
        },
      };

      let settle = null;
      let stopped = null;
      const onMessage = async (event) => {
        if (event.source !== frame.contentWindow) return;
        const msg = event.data;
        if (!msg || msg.chatclubSandbox !== true) return;
        if (msg.type === "ready") {
          send({ type: "init", code: record.code, meta: { ...record.meta, description: { ...record.meta.description }, grants: [...record.meta.grants] } });
        } else if (msg.type === "call") {
          const fn = Object.hasOwn(methods, msg.method) ? methods[msg.method] : null;
          try {
            if (!fn) throw new Error(`Unknown call "${msg.method}"`);
            const value = await fn(...(Array.isArray(msg.args) ? msg.args : []));
            send({ type: "result", id: msg.id, ok: true, value: plain(value) });
          } catch (error) {
            send({ type: "result", id: msg.id, ok: false, error: String(error?.message || error) });
          }
        } else if (msg.type === "started") {
          settle?.(msg.error ? new Error(msg.error) : null);
        } else if (msg.type === "error") {
          pctx.logger.error(msg.error);
          toast(t("userPlugins.runtimeError", { name, error: String(msg.error).split("\n")[0] }), "error");
        } else if (msg.type === "stopped") {
          stopped?.();
        }
      };
      window.addEventListener("message", onMessage);
      pctx.onDispose(() => {
        window.removeEventListener("message", onMessage);
        for (const remover of owned.values()) remover();
        owned.clear();
        frame.remove();
        runtimes.delete(name);
      });
      runtimes.set(name, {
        stop: () =>
          new Promise((resolve) => {
            const timer = setTimeout(resolve, STOP_TIMEOUT_MS);
            stopped = () => {
              clearTimeout(timer);
              resolve();
            };
            send({ type: "stop" });
          }),
      });
      document.body.append(frame);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => settle(new Error(t("userPlugins.err.timeout"))), START_TIMEOUT_MS);
        settle = (error) => {
          settle = null;
          clearTimeout(timer);
          if (!error) return resolve();
          toast(t("userPlugins.startFailed", { name, error: String(error.message).split("\n")[0] }), "error");
          reject(error);
        };
      });
    };

    // ------------------------------------------------------------ registration
    const defFor = (record) => {
      const { meta } = record;
      const key = `plugin.${record.name}.description`;
      return {
        name: record.name,
        description: key,
        authors: [meta.author || t("userPlugins.unknownAuthor")],
        icon: meta.icon && ICON_PATHS[meta.icon] ? meta.icon : "plug",
        tags: [],
        userPlugin: true,
        enabledByDefault: false,
        startAt: "workspaceReady",
        updatedAt: record.updatedAt,
        strings: { zh: { [key]: meta.description.zh || meta.description.en }, en: { [key]: meta.description.en || meta.description.zh } },
        app: {
          start: (pctx) => runPlugin(record, pctx),
          stop: () => runtimes.get(record.name)?.stop(),
        },
      };
    };
    const register = (record) => {
      if (!host.registerPlugin(defFor(record))) return false;
      registered.add(record.name);
      return true;
    };
    const unregister = async (name, opts) => {
      registered.delete(name);
      await host.unregisterPlugin(name, opts);
    };

    for (const record of records) register(record);
    if (records.length) changed();
    // Enabled again after the workspace was ready: start the enabled ones now instead of waiting for the phase.
    if (host.workspaceReadyFired) {
      for (const record of records) if (host.isPluginEnabled(record.name)) host.startPlugin(record.name);
    }
    ctx.onDispose(() => {
      const names = [...registered];
      registered.clear();
      Promise.all(names.map((n) => host.unregisterPlugin(n, { keepData: true }))).then(() => changed());
    });

    // ------------------------------------------------------------ install / update / uninstall
    const install = async (code, meta, source) => {
      const now = Date.now();
      const existing = records.find((r) => r.name === meta.name);
      const record = { name: meta.name, meta, code, source, installedAt: existing?.installedAt ?? now, updatedAt: now };
      if (existing) {
        const wasEnabled = host.isPluginEnabled(meta.name);
        await unregister(meta.name, { keepData: true });
        records = records.map((r) => (r.name === meta.name ? record : r));
        await save();
        register(record);
        if (wasEnabled) await host.startPlugin(meta.name);
        changed({ showTab: "user" });
        toast(t("userPlugins.updated", { name: meta.name }), "success");
        return;
      }
      records = [...records, record];
      await save();
      register(record);
      changed({ added: true, showTab: "user" });
      if (host.isPluginEnabled(meta.name)) await host.startPlugin(meta.name);
      else await host.togglePlugin(meta.name);
      if (host.isStarted(meta.name)) toast(t("userPlugins.installed", { name: meta.name }), "success");
    };

    const uninstall = async (name) => {
      const ok = await shellUi()?.confirm({ title: t("userPlugins.uninstall.title", { name }), description: t("userPlugins.uninstall.desc"), confirmText: t("userPlugins.uninstall.ok") });
      if (!ok) return;
      await unregister(name);
      records = records.filter((r) => r.name !== name);
      await save();
      await host.settings.adapter.remove(dataKeyOf(name));
      for (const key of ["starredPlugins", "pinnedPlugins"]) {
        const list = host.meta[key] ?? [];
        if (list.includes(name)) host.meta[key] = list.filter((n) => n !== name);
      }
      changed();
      toast(t("userPlugins.uninstalled", { name }), "success");
    };

    const exportFile = (name) => {
      const record = records.find((r) => r.name === name);
      if (!record) return;
      const url = URL.createObjectURL(new Blob([record.code], { type: "text/javascript" }));
      const a = h("a", { attrs: { href: url, download: `${name}.js` } });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // ------------------------------------------------------------ import dialog
    const openImport = ({ update = null } = {}) => {
      const current = update ? records.find((r) => r.name === update) : null;
      shellUi()?.openModal(({ onClose }) => {
        let mode = current?.source?.type === "url" ? "url" : current?.source?.type === "paste" ? "paste" : "file";
        let candidate = null; // { code, meta, source }
        const sourceBox = h("div.cc-up-source");
        const preview = h("div.cc-up-preview");
        const installBtn = ui.button({ label: t(current ? "userPlugins.updateBtn" : "userPlugins.install"), variant: "primary", disabled: true, onClick: async () => {
          if (!candidate) return;
          installBtn.disabled = true;
          onClose("install");
          await install(candidate.code, candidate.meta, candidate.source);
        } });

        const showCandidate = (code, source) => {
          clear(preview);
          candidate = null;
          installBtn.disabled = true;
          if (!String(code || "").trim()) {
            preview.append(h("div.muted", t("userPlugins.preview.empty")));
            return;
          }
          const { meta, errors } = parsePluginFile(code);
          const problems = [...errors];
          const existing = meta?.name ? records.find((r) => r.name === meta.name) : null;
          if (meta?.name && host.plugins[meta.name] && !existing) problems.push({ key: "userPlugins.err.builtIn", value: meta.name });
          if (meta) {
            const desc = (ctx.services.get("i18n")?.lang === "en" ? meta.description.en : meta.description.zh) || meta.description.zh || meta.description.en;
            preview.append(
              h("div.title", h("strong", meta.name || "—"), meta.version ? h("span.muted", t("userPlugins.preview.version", { version: meta.version })) : null, meta.author ? h("span.muted", t("userPlugins.preview.author", { author: meta.author })) : null),
              desc ? h("div", desc) : null,
              h("div.muted", t("userPlugins.preview.grants")),
              meta.grants.length
                ? h("ul", meta.grants.map((g) => h("li", h("span.grant", g), t(`userPlugins.grant.${g}`))))
                : h("div", t("userPlugins.preview.noGrants")),
            );
            if (existing && !problems.length) preview.append(h("div.muted", t("userPlugins.preview.replaces", { version: existing.meta.version || "—" })));
          }
          if (problems.length) {
            preview.append(h("ul.error", problems.map((p) => h("li", t(p.key, { value: p.value })))));
            return;
          }
          preview.append(h("div.warning", t("userPlugins.preview.warning")));
          candidate = { code, meta, source };
          installBtn.disabled = false;
        };

        const renderSource = ({ focus = false } = {}) => {
          clear(sourceBox);
          const focusLater = (el) => focus && requestAnimationFrame(() => el.focus({ preventScroll: true }));
          if (mode === "file") {
            const nameLabel = h("span.cc-up-file-name", t("userPlugins.file.none"));
            const input = h("input", { type: "file", accept: ".js,text/javascript,application/javascript", style: { display: "none" } });
            input.addEventListener("change", async () => {
              const file = input.files?.[0];
              if (!file) return;
              nameLabel.textContent = file.name;
              showCandidate(await file.text(), { type: "file", fileName: file.name });
            });
            const pick = ui.button({ label: t("userPlugins.file.pick"), icon: "fileUp", onClick: () => input.click() });
            sourceBox.append(input, h("div.cc-up-row", pick, nameLabel));
            focusLater(pick);
          } else if (mode === "url") {
            const field = ui.textInput({ value: current?.source?.url ?? "", placeholder: t("userPlugins.url.placeholder") });
            field.setAttribute("autofocus", "");
            const status = h("div.muted");
            const fetchBtn = ui.button({ label: t("userPlugins.url.fetch"), icon: "download", onClick: async () => {
              const url = normalizeUserUrl(field.value);
              if (!url) {
                status.textContent = t("userPlugins.url.bad");
                return;
              }
              status.textContent = t("userPlugins.url.fetching");
              fetchBtn.disabled = true;
              try {
                const res = await fetch(url, { cache: "no-store", credentials: "omit" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                status.textContent = "";
                showCandidate(await res.text(), { type: "url", url });
              } catch (error) {
                status.textContent = t("userPlugins.url.failed", { error: String(error?.message || error) });
              } finally {
                fetchBtn.disabled = false;
              }
            } });
            field.addEventListener("keydown", (e) => {
              if (e.key === "Enter" && !e.isComposing) fetchBtn.click();
            });
            sourceBox.append(h("div.cc-up-row", field, fetchBtn), status);
            focusLater(field);
          } else {
            const area = ui.textArea({ value: current?.source?.type === "paste" ? current.code : "", placeholder: t("userPlugins.paste.placeholder"), mono: true, onInput: (v) => showCandidate(v, { type: "paste" }) });
            area.setAttribute("autofocus", "");
            area.spellcheck = false;
            sourceBox.append(area);
            focusLater(area);
            if (area.value) showCandidate(area.value, { type: "paste" });
          }
        };

        const switcher = ui.segmented({ value: mode, options: ["file", "url", "paste"].map((v) => ({ value: v, label: t(`userPlugins.src.${v}`) })), onChange: (v) => {
          mode = v;
          showCandidate("", null);
          renderSource({ focus: true });
        } });
        showCandidate("", null);
        renderSource();
        return shellUi().modalLayout({
          title: current ? t("userPlugins.update.title", { name: current.name }) : t("userPlugins.import.title"),
          icon: "upload",
          body: h("div.cc-up-import", switcher, sourceBox, preview),
          onClose,
          footer: [h("span.spacer"), ui.button({ label: t("userPlugins.cancel"), onClick: () => onClose("cancel") }), installBtn],
        });
      }, { kind: "editor", key: "user-plugins-import" });
    };

    ctx.contribute("plugins.toolbar", { id: "UserPlugins:import", tab: "user", labelKey: "userPlugins.import", hintKey: "userPlugins.import.hint", icon: "upload", onClick: () => openImport() });
    ctx.contribute("plugins.cardAction", { id: "UserPlugins:update", order: 10, icon: "refreshCw", labelKey: "userPlugins.action.update", appliesTo: (p) => registered.has(p.name), onClick: (p) => openImport({ update: p.name }) });
    ctx.contribute("plugins.cardAction", { id: "UserPlugins:export", order: 20, icon: "download", labelKey: "userPlugins.action.export", appliesTo: (p) => registered.has(p.name), onClick: (p) => exportFile(p.name) });
    ctx.contribute("plugins.cardAction", { id: "UserPlugins:uninstall", order: 30, icon: "trash2", labelKey: "userPlugins.action.uninstall", appliesTo: (p) => registered.has(p.name), onClick: (p) => uninstall(p.name) });

    ctx.services.provide("userPlugins", {
      list: () => records.map((r) => ({ name: r.name, meta: plain(r.meta), source: plain(r.source), installedAt: r.installedAt, updatedAt: r.updatedAt })),
      install: async (code, source = { type: "paste" }) => {
        const { meta, errors } = parsePluginFile(code);
        if (errors.length) throw new Error(errors.map((e) => t(e.key, { value: e.value })).join("; "));
        if (host.plugins[meta.name] && !records.some((r) => r.name === meta.name)) throw new Error(t("userPlugins.err.builtIn", { value: meta.name }));
        await install(code, meta, source);
      },
      openImport,
    });
  },
};
