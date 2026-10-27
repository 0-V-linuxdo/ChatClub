// Theme rules (spec v1.2 §12.3).

/** Returns null when valid, otherwise an error code: invalidUrl | notCss. */
export function checkThemeUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return "invalidUrl";
  }
  if (url.protocol !== "https:") return "invalidUrl";
  if (!/\.css$/i.test(url.pathname)) return "notCss";
  return null;
}

/** Reads @name/@author/@description from the leading block comment. */
export function parseThemeMeta(css, fallbackName = "") {
  const meta = {};
  const m = /^\s*\/\*([\s\S]*?)\*\//.exec(String(css ?? ""));
  if (m) {
    for (const key of ["name", "author", "description"]) {
      const r = new RegExp(`@${key}\\s+([^\\n*]+)`).exec(m[1]);
      if (r) meta[key] = r[1].trim();
    }
  }
  if (!meta.name) meta.name = fallbackName;
  return meta;
}

export function nameFromUrl(raw) {
  try {
    const file = decodeURIComponent(new URL(raw).pathname.split("/").pop() || "");
    return file.replace(/\.css$/i, "").replace(/[-_]+/g, " ").trim();
  } catch {
    return "";
  }
}
