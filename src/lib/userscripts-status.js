// userScripts permission state, shared by the background runtime and the settings cards (v2 06 §6.1).

/** granted | toggleOff | notGranted | unsupported (06 §6.1). */
export async function userscriptsStatus() {
  let granted = false;
  try {
    granted = await chrome.permissions.contains({ permissions: ["userScripts"] });
  } catch {
    return { state: "unsupported" };
  }
  if (!granted) return { state: "notGranted" };
  try {
    await chrome.userScripts.getScripts();
  } catch {
    return { state: "toggleOff" };
  }
  return { state: typeof chrome.userScripts?.execute === "function" ? "granted" : "unsupported" };
}
