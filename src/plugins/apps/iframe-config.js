// Chat iframe attributes: defaults, per-app IframeConfig overrides and validation (v2 06 §5.4).

export const IFRAME_ALLOW = ["microphone", "clipboard-write", "clipboard-read", "geolocation", "display-capture", "camera", "unload", "autoplay", "fullscreen", "shared-storage", "picture-in-picture", "storage-access", "web-share"];
export const IFRAME_SANDBOX = ["allow-scripts", "allow-same-origin", "allow-forms", "allow-popups", "allow-popups-to-escape-sandbox", "allow-top-navigation", "allow-modals", "allow-downloads", "allow-presentation", "allow-storage-access-by-user-activation"];
export const KNOWN_ALLOW = [...IFRAME_ALLOW, "accelerometer", "gyroscope", "magnetometer", "midi", "payment", "usb", "serial", "hid", "bluetooth", "screen-wake-lock", "xr-spatial-tracking", "encrypted-media", "idle-detection", "local-fonts", "window-management", "publickey-credentials-get", "otp-credentials", "compute-pressure"];
export const KNOWN_SANDBOX = [...IFRAME_SANDBOX, "allow-orientation-lock", "allow-pointer-lock", "allow-top-navigation-by-user-activation", "allow-top-navigation-to-custom-protocols"];
export const REFERRER_POLICIES = ["no-referrer", "no-referrer-when-downgrade", "origin", "origin-when-cross-origin", "same-origin", "strict-origin", "strict-origin-when-cross-origin", "unsafe-url"];
export const RISKY_ALLOW = ["camera", "microphone", "display-capture", "clipboard-read", "clipboard-write", "geolocation", "shared-storage", "storage-access", "web-share"];
const PROTECTED = new Set(["allow", "sandbox", "referrerpolicy", "src", "srcdoc", "name", "id", "class", "dataset", "style"]);

export const DEFAULT_ALLOW = IFRAME_ALLOW.map((a) => `${a} *`).join("; ");
export const DEFAULT_SANDBOX = IFRAME_SANDBOX.join(" ");

const splitAllow = (value) => String(value ?? "").split(";").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
const splitSandbox = (value) => String(value ?? "").split(/\s+/).filter(Boolean);

export function hostInApp(app, url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (app.hosts ?? []).some((x) => host === x || host.endsWith(`.${x}`));
  } catch {
    return false;
  }
}

/** The attributes written on a chat iframe for `url`. null = attribute left off. */
export function resolveIframeAttributes(app, url, config) {
  const inApp = hostInApp(app, url);
  const cfg = inApp && config && typeof config === "object" ? config : {};
  let allow = DEFAULT_ALLOW;
  if (cfg.allow?.mode === "visual") allow = (cfg.allow.features ?? []).map((f) => `${f} *`).join("; ");
  else if (cfg.allow?.mode === "raw") allow = String(cfg.allow.value ?? "");
  else if (cfg.allow?.mode === "omit") allow = null;
  let sandbox = app.noSandbox ? null : DEFAULT_SANDBOX;
  if (cfg.sandbox?.mode === "visual") sandbox = (cfg.sandbox.tokens ?? []).join(" ");
  else if (cfg.sandbox?.mode === "raw") sandbox = String(cfg.sandbox.value ?? "");
  else if (cfg.sandbox?.mode === "omit") sandbox = null;
  // Leaving the app's addresses always falls back to the neutral defaults with a sandbox.
  if (!inApp) sandbox = DEFAULT_SANDBOX;
  let referrerPolicy = "no-referrer";
  if (cfg.referrerPolicy?.mode === "value") referrerPolicy = String(cfg.referrerPolicy.value ?? "");
  else if (cfg.referrerPolicy?.mode === "omit") referrerPolicy = null;
  const attributes = Array.isArray(cfg.attributes) ? cfg.attributes.filter((a) => !validateAttribute(a).error) : [];
  return { allow, sandbox, referrerPolicy, attributes: attributes.map((a) => ({ name: String(a.name).toLowerCase(), value: String(a.value ?? "") })) };
}

export function validateAttribute(attr) {
  const name = String(attr?.name ?? "").trim().toLowerCase();
  if (!/^[a-z_:][a-z0-9_.:-]*$/.test(name)) return { error: "invalidName" };
  if (PROTECTED.has(name) || name.startsWith("on") || name.startsWith("data-")) return { error: "protectedName" };
  if (/[\u0000-\u001f\u007f]/.test(String(attr?.value ?? ""))) return { error: "controlChars" };
  return {};
}

/** Errors block saving; warnings (unknown future tokens) do not. */
export function validateIframeConfig(config) {
  const errors = [];
  const warnings = [];
  if (!config || typeof config !== "object") return { errors, warnings };
  const allowIds = config.allow?.mode === "visual" ? config.allow.features ?? [] : config.allow?.mode === "raw" ? splitAllow(config.allow.value) : [];
  for (const f of allowIds) {
    if (!/^[a-z][a-z0-9-]*$/.test(f)) errors.push({ field: "allow", token: f });
    else if (!KNOWN_ALLOW.includes(f)) warnings.push({ field: "allow", token: f });
  }
  const tokens = config.sandbox?.mode === "visual" ? config.sandbox.tokens ?? [] : config.sandbox?.mode === "raw" ? splitSandbox(config.sandbox.value) : [];
  for (const tk of tokens) {
    if (!/^allow-[a-z-]+$/.test(tk)) errors.push({ field: "sandbox", token: tk });
    else if (!KNOWN_SANDBOX.includes(tk)) warnings.push({ field: "sandbox", token: tk });
  }
  if (config.referrerPolicy?.mode === "value" && !REFERRER_POLICIES.includes(config.referrerPolicy.value)) errors.push({ field: "referrerPolicy", token: config.referrerPolicy.value });
  (config.attributes ?? []).forEach((a, i) => {
    const { error } = validateAttribute(a);
    if (error) errors.push({ field: "attributes", index: i, token: a?.name, error });
  });
  return { errors, warnings };
}

/** Risk items newly added by an edit (06 §5.4): ask for a second confirmation when non-empty. */
export function newRisks(app, before, after) {
  const url = app.url;
  const a = resolveIframeAttributes(app, url, before);
  const b = resolveIframeAttributes(app, url, after);
  const risks = [];
  const had = new Set(a.allow === null ? [] : splitAllow(a.allow));
  for (const f of b.allow === null ? [] : splitAllow(b.allow)) {
    if (had.has(f)) continue;
    if (RISKY_ALLOW.includes(f)) risks.push({ kind: "allow", token: f });
    else if (!KNOWN_ALLOW.includes(f)) risks.push({ kind: "unknown", token: f });
  }
  const hadTokens = new Set(a.sandbox === null ? [] : splitSandbox(a.sandbox));
  for (const tk of b.sandbox === null ? [] : splitSandbox(b.sandbox)) if (!hadTokens.has(tk) && !KNOWN_SANDBOX.includes(tk)) risks.push({ kind: "unknown", token: tk });
  if (a.sandbox !== null && b.sandbox === null) risks.push({ kind: "noSandbox" });
  if (a.referrerPolicy !== "unsafe-url" && b.referrerPolicy === "unsafe-url") risks.push({ kind: "unsafeUrl" });
  return risks;
}

/** One-line summary for the permissions list. */
export function summarize(app, config) {
  const attrs = resolveIframeAttributes(app, app.url, config);
  const allowCount = attrs.allow === null ? 0 : splitAllow(attrs.allow).length;
  const sandbox = attrs.sandbox === null ? "removed" : splitSandbox(attrs.sandbox).length ? splitSandbox(attrs.sandbox).length : "strict";
  return { allowCount, allowTotal: IFRAME_ALLOW.length, sandbox, referrer: attrs.referrerPolicy, overridden: !!(config && Object.keys(config).length) };
}
