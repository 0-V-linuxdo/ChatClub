import { t } from "../../shared/i18n.js";
import { BUILTIN_CHAT_APPS } from "../../shared/constants.js";
import { normalizeAppIcons } from "../../shared/storage-schema.js";
import { button, editorModal, el, field, input, toast } from "../../ui/dom.js";
import { renderChatFavicon } from "../../ui/favicon.js";

function faviconDeps(port = {}) {
  return {
    appFaviconUrl: port.app,
    effectiveFaviconUrl: port.effective,
    fallbackFaviconUrl: port.fallback,
    browserFaviconUrl: port.browser,
    networkFaviconUrls: port.networkUrls,
    omitTitle: true
  };
}

function hostHref(value) {
  const raw = String(value || "").trim().replace(/^\*\./, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.split("/")[0]}/`;
}

function settingsSiteIdentity(config = {}, catalog = BUILTIN_CHAT_APPS) {
  const apps = Array.isArray(catalog) ? catalog : [];
  const ids = [config.appId, ...(Array.isArray(config.appIds) ? config.appIds : [])]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  for (const id of ids) {
    const app = apps.find((item) => item.id === id);
    if (app) return { app, appId: app.id, href: app.url || "" };
  }
  const href = hostHref(config.href) || hostHref((config.hosts || [])[0]);
  let host = "";
  try { host = href ? new URL(href).hostname.toLowerCase() : ""; } catch {}
  const app = host
    ? apps.find((item) => (item.hosts || []).some((pattern) => {
      const needle = String(pattern || "").replace(/^\*\./, "").toLowerCase();
      return needle && (host === needle || host.endsWith(`.${needle}`));
    }))
    : null;
  if (app) return { app, appId: app.id, href: app.url || href };
  return { appId: ids[0] || "", href };
}

export function settingsSiteMark(source = {}, faviconPort = {}) {
  const identity = source.app
    ? { app: source.app, appId: source.appId || source.app.id, href: source.href || source.app.url || "" }
    : settingsSiteIdentity(source);
  const app = identity.app;
  const appId = String(identity.appId || app?.id || "").trim();
  const href = String(identity.href || app?.url || "").trim();
  const image = renderChatFavicon({
    app,
    appId,
    href,
    title: ""
  }, { ...faviconDeps(faviconPort), className: "settings-site-icon" })
    || el("span", { class: "settings-site-icon settings-site-icon-empty", "aria-hidden": "true" });
  image.setAttribute?.("aria-hidden", "true");
  return image;
}

export function createAppIconControls({
  state,
  saveOptionsPatch,
  syncWorkspaceDom,
  faviconPort = {}
} = {}) {
  function iconImage(app, className = "settings-site-icon") {
    return renderChatFavicon({
      app,
      appId: app?.id,
      href: app?.url || "",
      title: ""
    }, { ...faviconDeps(faviconPort), className })
      || el("span", { class: `${className} settings-site-icon-empty`, "aria-hidden": "true" });
  }

  function mark(app) {
    return settingsSiteMark({ app }, faviconPort);
  }

  function nameCell(app, name, redraw) {
    const label = t("apps.changeIcon");
    return el("div", { class: "settings-main-cell settings-name-cell" },
      el("button", {
        class: "settings-site-icon-button",
        type: "button",
        "aria-label": label,
        "data-tooltip": label,
        "data-tooltip-id": "settings.apps.changeIcon",
        draggable: "false",
        onpointerdown: (event) => event.stopPropagation(),
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          openEditor(app, redraw);
        }
      }, iconImage(app)),
      el("strong", {}, name)
    );
  }

  function editorField(app, redraw) {
    return el("div", { class: "settings-icon-field" },
      el("span", { class: "settings-icon-field-label" }, t("apps.icon")),
      el("div", { class: "settings-icon-field-row" },
        mark(app),
        button(t("apps.changeIcon"), () => openEditor(app, redraw))
      )
    );
  }

  async function persistIcon(appId, entry, redraw, message) {
    const appIcons = { ...(state.options?.appIcons || {}) };
    if (entry) appIcons[appId] = entry;
    else delete appIcons[appId];
    state.options = await saveOptionsPatch({ appIcons: normalizeAppIcons(appIcons) });
    syncWorkspaceDom?.();
    redraw?.();
    if (message) toast(message, "success");
  }

  function openEditor(app, redraw) {
    const appId = String(app?.id || "").trim();
    if (!appId) return;
    let dialog;
    const close = () => dialog?.remove();
    const preview = el("div", { class: "settings-icon-preview" }, iconImage(app, "settings-site-icon-preview"));
    const urlInput = input(state.options?.appIcons?.[appId]?.srcType === "url" ? state.options.appIcons[appId].value : "", {
      placeholder: t("apps.iconUrlPlaceholder"),
      autocomplete: "url",
      spellcheck: "false"
    });
    const fileInput = el("input", { class: "input", type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico" });
    const refreshPreview = (nextApp = app) => {
      preview.replaceChildren(iconImage(nextApp, "settings-site-icon-preview"));
    };
    const saveEntry = async (entry) => {
      await persistIcon(appId, entry, () => {
        redraw?.();
        refreshPreview({ ...app, id: appId });
      }, t("toast.appIconSaved"));
      close();
    };
    const saveUrl = async () => {
      const value = String(urlInput.value || "").trim();
      if (!value) {
        toast(t("apps.iconInvalid"), "error");
        return;
      }
      const appIcons = normalizeAppIcons({ [appId]: { srcType: "url", value } });
      if (!appIcons[appId]) {
        toast(t("apps.iconInvalid"), "error");
        return;
      }
      await saveEntry(appIcons[appId]);
    };
    const saveUpload = async () => {
      const file = fileInput.files?.[0];
      const value = typeof faviconPort.encodeFile === "function" ? await faviconPort.encodeFile(file) : "";
      if (!value) {
        toast(t("apps.iconInvalid"), "error");
        return;
      }
      await saveEntry({ srcType: "data", value });
    };
    const restore = async () => {
      await persistIcon(appId, null, () => {
        redraw?.();
        refreshPreview(app);
      }, t("toast.appIconRestored"));
      close();
    };
    const refresh = async () => {
      try {
        if (typeof faviconPort.refresh === "function") await faviconPort.refresh(app?.url || "");
        refreshPreview(app);
      } catch {
        toast(t("toast.appIconRefreshFailed"), "error");
      }
    };
    dialog = editorModal(t("apps.iconEditorTitle", { name: app?.name || appId }),
      el("div", { class: "settings-editor-form settings-icon-editor" },
        el("p", { class: "settings-icon-help" }, t("apps.iconHelp")),
        field(t("apps.iconPreview"), preview),
        field(t("apps.iconUrl"), urlInput),
        field(t("apps.iconUpload"), fileInput),
        el("div", { class: "modal-footer" },
          button(t("apps.iconRefresh"), refresh),
          button(t("apps.iconRestore"), restore),
          button(t("common.cancel"), close),
          button(t("common.save"), async () => {
            if (fileInput.files?.[0]) await saveUpload();
            else await saveUrl();
          }, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal", "settings-icon-editor-modal");
  }

  return Object.freeze({ mark, nameCell, editorField, openEditor });
}
