import { t } from "../../shared/i18n.js";
import { BUILTIN_CHAT_APPS } from "../../shared/constants.js";
import { acceptedDataIcon } from "../../shared/favicon-lookup.js";
import { normalizeAppIcons } from "../../shared/storage-schema.js";
import { button, editorModal, el, iconButton, input, toast } from "../../ui/dom.js";
import { renderChatFavicon } from "../../ui/favicon.js";
import { createSvgIcon } from "../../ui/icons.js";

function faviconDeps(port = {}) {
  return {
    appFaviconUrl: port.app,
    effectiveFaviconUrl: port.effective,
    fallbackFaviconUrl: port.fallback,
    browserFaviconUrl: port.browser || port.browserUrl,
    siteFaviconUrls: port.siteUrls,
    networkFaviconUrls: port.networkUrls,
    candidateFaviconUrls: typeof port.candidates === "function"
      ? (href, logoUrl, options) => port.candidates(href, logoUrl, options)
      : undefined,
    rememberDecodedFavicon: typeof port.rememberDecoded === "function"
      ? (href, image) => port.rememberDecoded(href, image)
      : undefined,
    omitTitle: true,
    loading: "eager",
    keepVisibleOnMiss: true
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

function bindDiscoveredFavicon(image, href, source = {}, faviconPort = {}) {
  if (!href || typeof faviconPort.discover !== "function") return;
  const appId = String(source.appId || "").trim();
  Promise.resolve(faviconPort.discover(href)).then((found) => {
    if (!image || image.dataset?.faviconMiss === "1") return;
    const resolved = acceptedDataIcon(found)
      || (typeof faviconPort.effective === "function"
        ? acceptedDataIcon(faviconPort.effective(href, source.logoUrl, { appId }))
        : "");
    if (!resolved) return;
    if (image.src !== resolved) image.src = resolved;
    image.dataset.faviconReady = "1";
    delete image.dataset.faviconRemote;
  }).catch(() => {});
}

export function settingsSiteMark(source = {}, faviconPort = {}) {
  const skipCatalog = source.skipCatalog === true;
  const identity = !skipCatalog && source.app
    ? { app: source.app, appId: source.appId || source.app.id, href: source.href || source.app.url || "" }
    : settingsSiteIdentity(source, skipCatalog ? [] : BUILTIN_CHAT_APPS);
  const catalogApp = skipCatalog ? null : identity.app;
  const appId = skipCatalog
    ? String(source.appId || "").trim()
    : String(identity.appId || catalogApp?.id || "").trim();
  const href = String(identity.href || source.href || catalogApp?.url || "").trim();
  const fallbackApp = catalogApp || (skipCatalog && (href || appId)
    ? {
      id: appId || href,
      url: href,
      name: String(source.name || source.title || appId || "").trim() || "AI"
    }
    : null);
  const image = renderChatFavicon({
    app: fallbackApp,
    appId,
    href,
    logoUrl: String(source.logoUrl || "").trim(),
    title: ""
  }, { ...faviconDeps(faviconPort), className: "settings-site-icon" })
    || el("span", { class: "settings-site-icon settings-site-icon-empty", "aria-hidden": "true" });
  image.setAttribute?.("aria-hidden", "true");
  bindDiscoveredFavicon(image, href, { appId, logoUrl: source.logoUrl }, faviconPort);
  return image;
}

export function createAppIconControls({
  state,
  saveOptionsPatch,
  syncWorkspaceDom,
  faviconPort = {}
} = {}) {
  function iconImage(app, className = "settings-site-icon") {
    const image = renderChatFavicon({
      app,
      appId: app?.id,
      href: app?.url || "",
      title: ""
    }, { ...faviconDeps(faviconPort), className })
      || el("span", { class: `${className} settings-site-icon-empty`, "aria-hidden": "true" });
    bindDiscoveredFavicon(image, app?.url || "", { appId: app?.id }, faviconPort);
    return image;
  }

  function mark(app) {
    return settingsSiteMark({ app }, faviconPort);
  }

  function markButton(app, redraw) {
    const label = t("apps.changeIcon");
    return el("button", {
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
    }, iconImage(app));
  }

  function markCell(app, redraw) {
    return el("div", { class: "settings-site-mark-cell" }, markButton(app, redraw));
  }

  function nameCell(_app, name) {
    return el("div", { class: "settings-main-cell settings-name-cell" },
      el("strong", {}, name)
    );
  }

  function identityCells(app, name, redraw) {
    return [markCell(app, redraw), nameCell(app, name)];
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
      spellcheck: "false",
      "aria-label": t("apps.iconUrl")
    });
    const fileInput = el("input", {
      class: "settings-file-input",
      type: "file",
      accept: "image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico",
      "aria-label": t("apps.iconUpload")
    });
    const fileName = el("span", { class: "settings-icon-editor-file-name" });
    fileInput.addEventListener("change", () => {
      fileName.textContent = fileInput.files?.[0]?.name || "";
    });
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
        el("div", { class: "settings-icon-editor-layout" },
          el("div", { class: "settings-icon-editor-preview" },
            el("span", { class: "settings-icon-editor-label" }, t("apps.iconPreview")),
            preview
          ),
          el("div", { class: "settings-icon-editor-sources" },
            el("label", { class: "settings-icon-editor-url" },
              el("div", { class: "settings-icon-editor-url-head" },
                el("span", { class: "settings-icon-editor-label" }, t("apps.iconUrl")),
                el("button", {
                  class: "settings-icon-editor-help tooltip-trigger",
                  type: "button",
                  "aria-label": t("apps.iconHelp"),
                  "data-tooltip": t("apps.iconHelp"),
                  "data-tooltip-placement": "top",
                  "data-tooltip-wrap": "true"
                }, createSvgIcon("help"))
              ),
              urlInput
            ),
            el("div", { class: "settings-icon-editor-upload" },
              fileInput,
              button(t("apps.iconUpload"), () => fileInput.click()),
              fileName
            ),
            el("div", { class: "settings-icon-editor-tools" },
              iconButton(t("apps.iconRefresh"), createSvgIcon("refreshCw"), refresh, "settings-icon-editor-tool"),
              iconButton(t("apps.iconRestore"), createSvgIcon("undo2"), restore, "settings-icon-editor-tool")
            )
          )
        ),
        el("div", { class: "modal-footer" },
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

  return Object.freeze({ mark, markCell, nameCell, identityCells, editorField, openEditor });
}
