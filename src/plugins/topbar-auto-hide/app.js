// TopbarAutoHide: the top bar slides away and comes back when the pointer reaches the top edge (01 §6.4).

export default {
  start(ctx) {
    const shellService = ctx.services.get("shell");
    const ui = ctx.services.get("ui");
    const topbar = ctx.services.get("topbar");
    if (shellService?.page !== "workspace" || !topbar) return;
    const bar = topbar.element;
    const editing = () => shellService.shell.dataset.topbarEditing === "true";
    const shellEl = shellService.shell;
    let shown = false;
    let hideTimer = null;
    let showTimer = null;
    const setShown = (on) => {
      shown = on;
      shellEl.dataset.topbarShown = String(on);
    };
    const keepOpen = () => bar.contains(document.activeElement) || ui.topLayerKind() === "menu" || bar.matches(":hover");
    const scheduleHide = (ms) => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (shellEl.dataset.topbar !== "auto" || editing()) return;
        if (keepOpen()) return scheduleHide(250);
        setShown(false);
      }, ms);
    };
    const onMove = (event) => {
      if (shellEl.dataset.topbar !== "auto" || editing()) return;
      if (event.clientY <= 3) {
        clearTimeout(hideTimer);
        if (!shown && !showTimer) {
          showTimer = setTimeout(() => {
            showTimer = null;
            setShown(true);
          }, 60);
        }
      } else {
        clearTimeout(showTimer);
        showTimer = null;
        const barBottom = bar.getBoundingClientRect().bottom;
        if (shown && event.clientY > barBottom) scheduleHide(250);
      }
    };
    const onLeave = () => {
      if (shellEl.dataset.topbar === "auto" && shown) scheduleHide(900);
    };
    document.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    const onFocusIn = () => {
      if (shellEl.dataset.topbar === "auto" && bar.contains(document.activeElement)) setShown(true);
    };
    bar.addEventListener("focusin", onFocusIn);
    ctx.onDispose(() => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
      delete shellEl.dataset.topbar;
      delete shellEl.dataset.topbarShown;
    });
    const updateAutoHide = () => {
      const auto = !editing();
      shellEl.dataset.topbar = auto ? "auto" : "always";
      if (!auto) setShown(true);
    };
    updateAutoHide();
    // TopbarAPI marks customize mode on the shell; the bar stays visible while customizing.
    const observer = new MutationObserver(updateAutoHide);
    observer.observe(shellEl, { attributes: true, attributeFilter: ["data-topbar-editing"] });
    ctx.onDispose(() => observer.disconnect());
    ctx.events.on("Frames:userClickedFrame", () => {
      if (shellEl.dataset.topbar === "auto" && !keepOpen()) setShown(false);
    });

    const toggleVisibility = () => {
      const next = ctx.settings.topbarVisibility === "auto" ? "always" : "auto";
      ctx.settings.topbarVisibility = next;
      if (next === "auto") ui.toast(t("topbar.autoHideOn"), "info");
    };
  },
};
