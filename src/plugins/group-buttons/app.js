// GroupButtons: the page tools on each column's header and tab menu (02 §3): refresh, home,
// copy link, open in a new tab and the URL dialog, plus the refresh / home shortcuts.

import { h } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { isHttpUrl, normalizeUserUrl } from "../../lib/url.js";

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const workspace = ctx.services.get("workspace");
    if (!workspace) return;

    // ------------------------------------------------------------ URL dialog (02 §3.2)
    const openGoToUrl = async (tabId) => {
      const initial = await workspace.currentHref(tabId);
      shellUi.openModal(({ onClose }) => {
        const input = ui.textInput({ value: initial, placeholder: "https://" });
        input.setAttribute("aria-label", "URL");
        const go = () => {
          const url = normalizeUserUrl(input.value);
          if (!url) {
            input.setAttribute("aria-invalid", "true");
            shellUi.toast(t("workspace.goto.invalid"), "error");
            input.focus();
            return;
          }
          workspace.navigateTab(tabId, url, { replace: true });
          onClose("go");
        };
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !event.isComposing) {
            event.preventDefault();
            go();
          }
        });
        input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
        requestAnimationFrame(() => input.select());
        return shellUi.modalLayout({
          title: t("workspace.goto.title"),
          body: [input],
          footer: [
            h("button.cc-btn.tall", { type: "button", onclick: () => onClose("cancel") }, t("common.cancel")),
            h("button.cc-btn.tall.primary", { type: "button", onclick: go }, t("workspace.goto.go")),
          ],
          onClose,
        });
      }, { key: "workspace-goto", kind: "editor", initialFocus: "input" });
    };

    // ------------------------------------------------------------ buttons (orders match Workspace's own)
    const buttons = [
      {
        id: "refreshPage", icon: "reload", labelKey: "workspace.group.refreshPage", defaultPlacement: "pinned", shortcutAction: "refreshPage", order: 10,
        busy: (g) => !!g.tab?.loading,
        onClick: (g) => g.tab && workspace.refreshTab(g.tab.id),
      },
      {
        id: "reload", icon: "home", labelKey: "workspace.group.reload", defaultPlacement: "menu", shortcutAction: "reloadChat", order: 20,
        onClick: (g) => g.tab && workspace.homeTab(g.tab.id),
      },
      {
        id: "copyLink", icon: "copy", labelKey: "workspace.group.copyLink", defaultPlacement: "menu", order: 40,
        async onClick(g) {
          if (!g.tab) return;
          const href = await workspace.currentHref(g.tab.id);
          try {
            await navigator.clipboard.writeText(href);
            shellUi.toast(t("workspace.linkCopied"), "success");
          } catch {
            shellUi.toast(t("workspace.copyFailed"), "error");
          }
        },
      },
      {
        id: "openInNewTab", icon: "external", labelKey: "workspace.group.openInNewTab", defaultPlacement: "menu", order: 50,
        async onClick(g) {
          if (!g.tab) return;
          const href = await workspace.currentHref(g.tab.id);
          try {
            if (!isHttpUrl(href)) throw new Error("bad url");
            await chrome.tabs.create({ url: href, active: true });
          } catch {
            shellUi.toast(t("workspace.openFailed"), "error");
          }
        },
      },
      {
        id: "goToUrl", icon: "link", labelKey: "workspace.group.goToUrl", defaultPlacement: "menu", order: 60,
        onClick: (g) => g.tab && openGoToUrl(g.tab.id),
      },
    ];
    for (const entry of buttons) ctx.contribute("tabGroup.button", entry);

    // ------------------------------------------------------------ shortcuts
    const activeTabId = (source) => workspace.currentGroup(source)?.activeTabId ?? null;
    ctx.contribute("shortcut.action", {
      id: "refreshPage", labelKey: "workspace.shortcut.refreshPage",
      run: (_m, source) => {
        const id = activeTabId(source);
        if (id) workspace.refreshTab(id);
      },
    });
    ctx.contribute("shortcut.action", {
      id: "reloadChat", labelKey: "workspace.shortcut.reloadChat",
      run: (_m, source) => {
        const id = activeTabId(source);
        if (id) workspace.homeTab(id);
      },
    });
  },
};
