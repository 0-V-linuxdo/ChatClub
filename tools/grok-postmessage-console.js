await new Promise((resolve) => {
  const iframe = Array.from(document.querySelectorAll("iframe"))
    .find((frame) => /gk\.dairoot/i.test(frame.src || frame.dataset.currentHref || ""));
  const id = `grok-probe-${Date.now()}`;
  const timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), 16000);
  window.addEventListener("message", function onMessage(event) {
    const message = event.data;
    if (event.source !== iframe?.contentWindow) return;
    if (message?.source !== "chatclub" || message.type !== "response" || message.id !== id) return;
    clearTimeout(timer);
    window.removeEventListener("message", onMessage);
    resolve(message.error ? { ok: false, error: message.error } : message.data);
  });
  iframe?.contentWindow?.postMessage({
    source: "chatclub",
    type: "request",
    action: "applyPreferredModel",
    id,
    data: { appId: "Grok", modelId: "expert" }
  }, "*");
})
