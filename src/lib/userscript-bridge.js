// ISOLATED side of the custom-script bridge (pairs with lib/userscript-runner.js in the MAIN world).
// Content bundles paste this with `@include`, so it must not import anything.

const US_REF = "data-cc-us-ref";

/** A fresh channel name for one script run. */
export function userscriptChannel() {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Answers the runner's bridged calls with `api[method](...args)` until the returned function is called.
 * Elements cross the world boundary as `{ __ccRef }` markers on a data attribute.
 */
export function serveUserscriptBridge(channel, api) {
  let seq = 0;
  const encode = (v, depth = 0) => {
    if (depth > 8) return null;
    if (v instanceof Element) {
      let id = v.getAttribute(US_REF);
      if (!id) {
        id = `i${Date.now().toString(36)}${(seq += 1)}`;
        v.setAttribute(US_REF, id);
      }
      return { __ccRef: id };
    }
    if (Array.isArray(v)) return v.map((x) => encode(x, depth + 1));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x, depth + 1)]));
    return typeof v === "function" ? undefined : v;
  };
  const decode = (v) => {
    if (Array.isArray(v)) return v.map(decode);
    if (v && typeof v === "object") {
      if (typeof v.__ccRef === "string") return document.querySelector(`[${US_REF}="${CSS.escape(v.__ccRef)}"]`);
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
    }
    return v;
  };
  const onCall = async (event) => {
    let req;
    try {
      req = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (!req || typeof req.id !== "string") return;
    let reply;
    try {
      const fn = api[req.method];
      if (typeof fn !== "function") throw new Error(`api.${req.method} is not available`);
      const value = await fn(...(Array.isArray(req.args) ? decode(req.args) : []));
      reply = { id: req.id, ok: true, value: encode(value) };
    } catch (error) {
      reply = { id: req.id, ok: false, error: String(error?.message || error) };
    }
    window.dispatchEvent(new CustomEvent(`chatclub:us-reply:${channel}`, { detail: JSON.stringify(reply) }));
  };
  window.addEventListener(`chatclub:us-call:${channel}`, onCall);
  return () => window.removeEventListener(`chatclub:us-call:${channel}`, onCall);
}
