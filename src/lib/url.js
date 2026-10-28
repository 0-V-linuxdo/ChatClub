// URL helpers shared by the workspace and its page tools.

export const isHttpUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname;
  } catch {
    return false;
  }
};

/** URL dialog normalization (02 §3.2). Returns a URL string or null. */
export function normalizeUserUrl(raw) {
  let value = String(raw || "").trim();
  if (!value) return null;
  if (value.startsWith("//")) value = `https:${value}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  return isHttpUrl(value) ? new URL(value).href : null;
}
