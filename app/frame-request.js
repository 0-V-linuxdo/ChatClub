export function createFrameRequest(framePort, label = "Frame") {
  if (typeof framePort?.request !== "function") {
    throw new TypeError(`${String(label || "Frame")} requires framePort.request.`);
  }
  return (iframe, command, data = {}, timeoutOrOptions = {}) => {
    const options = timeoutOrOptions && typeof timeoutOrOptions === "object"
      ? timeoutOrOptions
      : { timeoutMs: timeoutOrOptions };
    return framePort.request(iframe, command, data, options);
  };
}
