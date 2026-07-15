await new Promise((resolve) => {
  const source = "chatclub:preferred-model:2026.07.15.8";
  const iframe = Array.from(document.querySelectorAll("iframe"))
    .find((frame) => /gk\.dairoot/i.test(frame.src || frame.dataset.currentHref || ""));
  const id = `grok-probe-${Date.now()}`;
  const runId = `grok-preferred-model-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), 16000);
  window.addEventListener("message", function onMessage(event) {
    const message = event.data;
    if (event.source !== iframe?.contentWindow) return;
    if (message?.source !== source || message.type !== "response" || message.id !== id) return;
    clearTimeout(timer);
    window.removeEventListener("message", onMessage);
    resolve(message.error ? { ok: false, error: message.error } : message.data);
  });
  iframe?.contentWindow?.postMessage({
    source,
    type: "request",
    action: "applyPreferredModel",
    id,
    data: { runId, appId: "Grok", modelId: "expert" }
  }, "*");
})
