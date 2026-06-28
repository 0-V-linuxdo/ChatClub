(() => {
  const SOURCE = "chatclub";
  const API_NAME = "ChatClubPreferredModelBridgeTest";

  function requestId() {
    return `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function sendToFrame(iframe, action, data = {}, timeout = 20000) {
    return new Promise((resolve, reject) => {
      if (!iframe?.contentWindow) {
        reject(new Error("iframe contentWindow not available"));
        return;
      }
      const id = requestId();
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error(`timeout waiting for ${action}`));
      }, timeout);
      function onMessage(event) {
        if (event.source !== iframe.contentWindow) return;
        const message = event.data;
        if (message?.source !== SOURCE || message.type !== "response" || message.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        if (message.error) reject(new Error(message.error));
        else resolve(message.data);
      }
      window.addEventListener("message", onMessage);
      iframe.contentWindow.postMessage({ source: SOURCE, type: "request", action, id, data }, "*");
    });
  }

  function frameInfo(frame, index) {
    return {
      index,
      appId: frame.dataset.appId || "",
      instanceId: frame.dataset.instanceId || "",
      active: frame.classList.contains("active"),
      currentHref: frame.dataset.currentHref || "",
      src: frame.getAttribute("src") || frame.src || ""
    };
  }

  function frames() {
    return Array.from(document.querySelectorAll(".chat-frame"));
  }

  function listFrames() {
    return frames().map(frameInfo);
  }

  function findFrame(appId) {
    const wanted = String(appId || "").trim();
    return frames().find((frame) => frame.dataset.appId === wanted) ||
      frames().find((frame) => frame.dataset.appId?.toLowerCase() === wanted.toLowerCase()) ||
      null;
  }

  async function ping(appId) {
    const frame = findFrame(appId);
    if (!frame) return { ok: false, appId, reason: "frame not found", frames: listFrames() };
    const href = await sendToFrame(frame, "getLocationHref", {}, 5000);
    return { ok: true, appId: frame.dataset.appId || appId, href };
  }

  async function apply(appId, modelId) {
    const frame = findFrame(appId);
    if (!frame) return { ok: false, appId, modelId, reason: "frame not found", frames: listFrames() };
    const normalizedAppId = appId === "GrokMirror" ? "Grok" : appId;
    const result = await sendToFrame(frame, "applyPreferredModel", { appId: normalizedAppId, modelId }, 20000);
    return { frame: frameInfo(frame, frames().indexOf(frame)), result };
  }

  async function run(plan = [
    ["GrokMirror", "expert"],
    ["NotionAI", "gemini31pro"]
  ]) {
    const output = { frames: listFrames(), pings: {}, applies: [] };
    for (const [appId, modelId] of plan) {
      try {
        output.pings[appId] = await ping(appId);
      } catch (error) {
        output.pings[appId] = { ok: false, appId, reason: error.message || String(error) };
      }
      try {
        output.applies.push(await apply(appId, modelId));
      } catch (error) {
        output.applies.push({ appId, modelId, error: error.message || String(error) });
      }
    }
    console.log("[ChatClub plugin bridge test]", output);
    return output;
  }

  window[API_NAME] = Object.freeze({ apply, frames: listFrames, ping, run, sendToFrame });
  console.log(`${API_NAME} ready. Run: await ${API_NAME}.run()`);
})();
