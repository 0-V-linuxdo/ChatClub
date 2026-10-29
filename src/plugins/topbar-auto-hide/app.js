// TopbarAutoHide: the top bar slides away and comes back when the pointer reaches the top edge (01 §6.4).

// Some browsers draw a window drag area over the first pixels of the page, so the zone is a bit taller.
const REVEAL_PX = 6;

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
    let catcher = null;
    let hideTimer = null;
    let showTimer = null;
    const setShown = (on) => {
      shown = on;
      shellEl.dataset.topbarShown = String(on);
      placeCatcher();
    };
    const placeCatcher = () => {
      if (!catcher) return;
      catcher.hidden = !shown || shellEl.dataset.topbar !== "auto";
      if (!catcher.hidden) catcher.style.top = `${Math.round(bar.getBoundingClientRect().height)}px`;
    };
    // Hover is tracked by enter/leave: when the pointer goes into a chat iframe, `:hover` can stay
    // stuck on the bar because this page stops getting pointer updates.
    let overBar = false;
    // Only a field being typed in holds the bar open: a button that just got focus back (for example
    // after closing settings) must not keep it shown.
    const typingInBar = () => {
      const el = document.activeElement;
      return !!el && bar.contains(el) && (el.matches("input, textarea, select") || el.isContentEditable);
    };
    const keepOpen = () => typingInBar() || ui.topLayerKind() === "menu" || overBar;
    // A transparent strip just under the shown bar. Moving from the bar into a chat iframe gives this
    // page no pointerleave, so the pointer crossing this strip is what tells us it left.
    catcher = document.createElement("div");
    catcher.className = "cc-topbar-autohide-catcher";
    catcher.addEventListener("pointerenter", () => {
      overBar = false;
      catcher.hidden = true;
      if (shellEl.dataset.topbar === "auto" && shown && !editing()) scheduleHide(250);
    });
    catcher.hidden = true;
    shellEl.append(catcher);
    const scheduleHide = (ms) => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (shellEl.dataset.topbar !== "auto" || editing()) return;
        if (keepOpen()) return scheduleHide(250);
        setShown(false);
      }, ms);
    };
    let lastY = Infinity;
    const onMove = (event) => {
      lastY = event.clientY;
      if (shellEl.dataset.topbar !== "auto" || editing()) return;
      if (event.clientY <= REVEAL_PX) {
        clearTimeout(hideTimer);
        if (!shown && !showTimer) {
          showTimer = setTimeout(() => {
            showTimer = null;
            setShown(true);
            // The pointer may already be on the bar's area, or over a chat iframe where this page gets no more moves.
            if (lastY <= bar.getBoundingClientRect().height) overBar = true;
            scheduleHide(1200);
          }, 60);
        }
      } else {
        // Measured from the height, since the hidden bar sits above the page. A quick move from the
        // edge straight onto where the bar appears keeps the pending reveal, and counts as being on it.
        const barBottom = bar.getBoundingClientRect().height;
        if (event.clientY > barBottom) {
          clearTimeout(showTimer);
          showTimer = null;
          if (shown) scheduleHide(250);
        } else if (shown) {
          overBar = true;
          clearTimeout(hideTimer);
        }
      }
    };
    const onLeave = () => {
      if (shellEl.dataset.topbar === "auto" && shown) scheduleHide(900);
    };
    // Leaving the bar into a chat iframe sends no pointermove or document pointerleave here,
    // so the bar's own pointerleave starts the hide; keepOpen() still holds it for menus and focus.
    const onBarEnter = () => {
      overBar = true;
    };
    const onBarLeave = () => {
      overBar = false;
      if (shellEl.dataset.topbar === "auto" && shown && !editing()) scheduleHide(400);
    };
    document.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    bar.addEventListener("pointerenter", onBarEnter);
    bar.addEventListener("pointerleave", onBarLeave);
    const onFocusIn = () => {
      if (shellEl.dataset.topbar === "auto" && typingInBar()) setShown(true);
    };
    bar.addEventListener("focusin", onFocusIn);
    ctx.onDispose(() => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      bar.removeEventListener("pointerenter", onBarEnter);
      bar.removeEventListener("pointerleave", onBarLeave);
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
      catcher.remove();
      delete shellEl.dataset.topbar;
      delete shellEl.dataset.topbarShown;
    });
    const updateAutoHide = () => {
      const auto = !editing();
      shellEl.dataset.topbar = auto ? "auto" : "always";
      if (!auto) setShown(true);
      else placeCatcher();
    };
    updateAutoHide();
    // TopbarAPI marks customize mode on the shell; the bar stays visible while customizing.
    const observer = new MutationObserver(updateAutoHide);
    observer.observe(shellEl, { attributes: true, attributeFilter: ["data-topbar-editing"] });
    ctx.onDispose(() => observer.disconnect());
    ctx.events.on("Frames:pointerEnter", () => {
      overBar = false;
      if (shellEl.dataset.topbar === "auto" && shown && !editing()) scheduleHide(250);
    });
    ctx.events.on("Frames:userClickedFrame", () => {
      if (shellEl.dataset.topbar === "auto" && !keepOpen()) setShown(false);
    });

    // Lets the composer shortcut bring the bar out before focusing the input inside it.
    ctx.services.provide("topbarAutoHide", {
      isHidden: () => shellEl.dataset.topbar === "auto" && !shown,
      reveal: () => {
        if (shellEl.dataset.topbar !== "auto") return;
        clearTimeout(hideTimer);
        setShown(true);
        scheduleHide(1200);
      },
    });
  },
};
