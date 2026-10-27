// Icon sources for an app, in order: user icon → built-in logo → page-declared icon → browser favicon service.

import { h, icon } from "./dom.js";

/** Every icon source for an app, best first (duplicates removed). */
export function appIconUrls(host, app, pageIcon = "") {
  if (!app) return [];
  const out = [host.getService("apps")?.iconFor?.(app.id), app.logo, pageIcon, host.getService("favicons")?.cached?.(app.url)];
  try {
    out.push(`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(app.url)}&size=32`);
  } catch {
    // not in an extension page
  }
  return [...new Set(out.filter(Boolean))];
}

export function appIconUrl(host, app, pageIcon = "") {
  return appIconUrls(host, app, pageIcon)[0] ?? "";
}

/** <img> for an app icon: a source that fails to load gives way to the next one, then to a generic globe. */
export function appIconImg(host, app, { pageIcon, className = "" } = {}) {
  const sources = appIconUrls(host, app, pageIcon);
  const fallback = icon("globe", { className: `fallback ${className}`.trim() });
  if (!sources.length) return fallback;
  let at = 0;
  const img = h("img", { class: className, attrs: { src: sources[0], alt: "", draggable: "false" } });
  const onError = () => {
    at += 1;
    if (at < sources.length) img.setAttribute("src", sources[at]);
    else {
      img.removeEventListener("error", onError);
      img.replaceWith(fallback);
    }
  };
  img.addEventListener("error", onError);
  return img;
}
