// About section (v2 06 §13): name, one-line pitch, release-timestamp version, official links.

import { h, icon } from "../../lib/dom.js";
import { BUILD } from "../../build-info.js";
import { LINKS } from "./index.js";

const pad = (n) => String(n).padStart(2, "0");
export const versionLabel = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}｜${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const SVG_NS = "http://www.w3.org/2000/svg";
// Simple filled brand marks; other ids fall back to the link icon.
const BRAND_PATHS = {
  github: "M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z",
  telegram: "M22.05 3.4 2.9 10.8c-1.3.52-1.3 1.25-.24 1.58l4.92 1.53 1.88 5.78c.23.63.12.88.78.88.51 0 .73-.23 1.02-.51l2.45-2.38 5.1 3.77c.94.52 1.62.25 1.85-.87l3.35-15.8c.34-1.38-.53-2-1.96-1.38ZM8.9 13.6l9.9-6.25c.5-.3.95-.14.58.19l-8.48 7.65-.33 3.52-1.67-5.11Z",
};
const brandMark = (id) => {
  if (!BRAND_PATHS[id]) return icon("link", { size: 20 });
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", BRAND_PATHS[id]);
  svg.append(path);
  return svg;
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
        const linkCard = (l) => {
          const body = [
            h("span.cc-about-link-icon", brandMark(l.id)),
            h("span.cc-about-link-text", h("strong", t(l.titleKey)), h("span", l.url ? l.url.replace(/^https?:\/\//, "") : t(l.descKey))),
          ];
          if (!l.url) return h("div.cc-about-link", ...body, h("span.cc-about-link-pending", t("about.linkPending")));
          return h("a.cc-about-link", { href: l.url, target: "_blank", rel: "noopener noreferrer", title: t(l.descKey) }, ...body, icon("external", { size: 16 }));
        };
        container.append(h("div.cc-about",
          h("section.cc-about-hero",
            h("img", { src: chrome.runtime.getURL("icons/logo.svg"), alt: "" }),
            h("div.cc-about-hero-text",
              h("div.cc-about-name", "ChatClub"),
              h("div.cc-about-pitch", t("about.pitch")),
              h("span.cc-about-version", `${t("about.version")} ${versionLabel(BUILD?.builtAt ?? Date.now())}${BUILD?.isDev ? " · dev" : ""}`))),
          h("section",
            h("h3.cc-about-links-title", t("about.links")),
            h("div.cc-about-links", ...LINKS.map(linkCard)))));
      },
    });
  },
};
