// About section (v2 06 §13): name, one-line pitch, release-timestamp version, official links.

import { h } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { BUILD } from "../../build-info.js";
import { LINKS } from "./index.js";

const pad = (n) => String(n).padStart(2, "0");
export const versionLabel = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}｜${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export default {
  start(ctx) {
    const t = ctx.t;
    ctx.contribute("settings.section", {
      id: "about",
      titleKey: "about.section.title",
      descKey: "about.section.desc",
      icon: "info",
      order: 150,
      group: "data",
      render(container) {
        const links = LINKS.map((l) => h("div", { style: { display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--line)" } },
          h("div", { style: { flex: "1" } }, h("strong", t(l.titleKey)), h("div", { style: { fontSize: "12px", color: "var(--muted)" } }, t(l.descKey))),
          l.url ? ui.button({ label: t("about.open"), icon: "external", onClick: () => window.open(l.url, "_blank", "noopener") }) : h("span", { style: { fontSize: "12px", color: "var(--muted)" } }, t("about.linkPending"))));
        container.append(
          ui.card({ title: "ChatClub", body: h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
            h("div", t("about.pitch")),
            h("div", { style: { color: "var(--muted)", fontSize: "13px" } }, `${t("about.version")}：${versionLabel(BUILD?.builtAt ?? Date.now())}${BUILD?.isDev ? " · dev" : ""}`)) }),
          ui.card({ title: t("about.links"), body: h("div", links) }),
        );
      },
    });
  },
};
