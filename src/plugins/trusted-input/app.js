// TrustedInput (page): turns a point inside a chat iframe into page coordinates and asks the
// background to dispatch real input there (v2 05 §4.6).

export default {
  start(ctx) {
    const workspace = ctx.services.get("workspace");
    const tabFor = (frameKey) => workspace?.groups().flatMap((g) => g.tabs).find((tb) => tb.frameKey === frameKey) ?? null;
    const iframeFor = (frameKey) => {
      const tab = tabFor(frameKey);
      return tab ? workspace.iframeOf(tab.id) : null;
    };
    /** Page coordinates of a point given in the iframe's viewport. */
    const toPage = (frameKey, { x, y }) => {
      const iframe = iframeFor(frameKey);
      if (!iframe?.isConnected) throw new Error("the chat iframe is gone");
      const r = iframe.getBoundingClientRect();
      const px = r.left + iframe.clientLeft + x;
      const py = r.top + iframe.clientTop + y;
      if (px < r.left || py < r.top || px > r.right || py > r.bottom) throw new Error("target is outside the visible iframe");
      return { x: Math.round(px), y: Math.round(py) };
    };
    // Trusted input moves the real focus into the frame on purpose: the shell must not take it back.
    const allowFocus = () => ctx.services.get("ui")?.allowFrameFocus?.(3000);
    ctx.services.provide("trustedInput", {
      available: () => ctx.host?.env?.debugger !== false,
      click: (frameKey, pointInFrame) => {
        allowFocus();
        return ctx.background.request("dispatchTrustedClick", toPage(frameKey, pointInFrame));
      },
      move: (frameKey, pointInFrame) => ctx.background.request("dispatchTrustedMouseMove", toPage(frameKey, pointInFrame)),
      keys: (frameKey, keys) => {
        allowFocus();
        iframeFor(frameKey)?.focus();
        return ctx.background.request("dispatchTrustedKeySequence", { keys });
      },
    });
  },
};
