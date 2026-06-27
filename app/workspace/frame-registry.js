export function createWorkspaceFrameRegistry({ appById, openableTabUrl }) {
  function currentFrames() {
    return Array.from(document.querySelectorAll(".chat-frame.active"));
  }

  function frameApp(iframe) {
    return appById(iframe.dataset.appId);
  }

  function setFramePointerBlockedForOverlay(blocked, namespace = "overlay") {
    const blockedKey = `${namespace}PointerBlocked`;
    const previousKey = `${namespace}PointerEvents`;
    document.querySelectorAll("iframe").forEach((iframe) => {
      if (blocked) {
        if (iframe.dataset[blockedKey] === "1") return;
        iframe.dataset[blockedKey] = "1";
        iframe.dataset[previousKey] = iframe.style.pointerEvents || "";
        iframe.style.pointerEvents = "none";
        return;
      }
      if (iframe.dataset[blockedKey] !== "1") return;
      iframe.style.pointerEvents = iframe.dataset[previousKey] || "";
      delete iframe.dataset[blockedKey];
      delete iframe.dataset[previousKey];
    });
  }

  function findFrameForSummarySource(source = {}) {
    const instanceId = source.instanceId || "";
    const href = openableTabUrl(source.href || "");
    return Array.from(document.querySelectorAll(".chat-frame")).find((frame) => {
      if (instanceId && frame.dataset.instanceId === instanceId) return true;
      const app = frameApp(frame);
      const candidates = [
        frame.dataset.currentHref,
        frame.src,
        app?.url
      ].map((value) => openableTabUrl(value || ""));
      return Boolean(href && candidates.includes(href));
    }) || null;
  }

  return Object.freeze({
    currentFrames,
    findFrameForSummarySource,
    frameApp,
    setFramePointerBlockedForOverlay
  });
}
