import { APP_NAME, APP_VERSION, REPOSITORY_URL, TELEGRAM_CHANNEL_URL } from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import { el } from "../../ui/dom.js";
import { validateControllerContract } from "../controller-contract.js";

export function createAboutSettingsPane(dependencies = {}) {
  const { openTabUrl, svgIcon } = validateControllerContract(dependencies, "About settings pane", {
    openTabUrl: "function",
    svgIcon: "function"
  });

  function linkAction(label, iconName, url) {
    return el("button", {
      class: "settings-config-button about-link-button",
      type: "button",
      onclick: () => openTabUrl(url)
    }, svgIcon(iconName), el("span", {}, label));
  }

  function linkRow({ title, description, handle, action, icon, url }) {
    return el("article", { class: "about-link-row" },
      el("div", { class: "about-link-copy" },
        el("strong", {}, title),
        el("p", {}, description),
        el("code", {}, handle)
      ),
      linkAction(action, icon, url)
    );
  }

  return function aboutPane() {
    return el("div", { class: "settings-pane about-settings-pane" },
      el("section", { class: "settings-manage-card about-product-card" },
        el("div", { class: "about-identity" },
          el("img", { class: "about-logo", src: "icons/logo.svg", alt: "", draggable: "false" }),
          el("div", {}, el("h4", {}, APP_NAME), el("p", {}, t("about.description")))
        ),
        el("div", { class: "about-version-row" },
          el("span", {}, t("about.version")),
          el("code", {}, APP_VERSION)
        )
      ),
      el("section", { class: "settings-manage-card about-links-card" },
        el("div", { class: "settings-manage-title" },
          svgIcon("link"),
          el("div", {},
            el("h4", {}, t("about.officialLinks")),
            el("p", {}, t("about.officialLinksDesc"))
          )
        ),
        el("div", { class: "about-link-list" },
          linkRow({
            title: t("about.telegramChannel"), description: t("about.telegramDesc"),
            handle: "@chatclub_extension", action: t("about.openTelegram"), icon: "send",
            url: TELEGRAM_CHANNEL_URL
          }),
          linkRow({
            title: t("about.githubRepository"), description: t("about.githubDesc"),
            handle: "0-V-linuxdo/ChatClub", action: t("about.openGithub"), icon: "external",
            url: REPOSITORY_URL
          })
        )
      )
    );
  };
}
