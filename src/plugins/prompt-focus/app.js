// PromptFocus: the caret lease between the composer and chat iframes (v2 03 §2.5).

const LEASE_MS = 180000;
const USER_CLICK_WINDOW_MS = 400;
// The frame's click report travels through the background, so wait a little before taking focus back.
const STEAL_CHECK_MS = 300;

export default {
  start(ctx) {
    const composer = ctx.services.get("composer");
    const transport = ctx.services.get("frames.transport");
    const workspace = ctx.services.get("workspace");
    if (!composer || !workspace) return;

    // The page-side lease: active while the user is working in the composer.
    let leaseUntil = 0;
    let lastFrameClick = 0;
    const active = () => Date.now() < leaseUntil;
    const setFrameLease = (frameKey, until) =>
      transport.send(frameKey, { capability: "base", command: "setLease", payload: { kind: "caret", until } }, { timeoutMs: 1200 }).catch(() => {});
    const grant = (frameKeys) => {
      leaseUntil = Date.now() + LEASE_MS;
      for (const key of frameKeys) setFrameLease(key, leaseUntil);
    };
    const registeredFrames = () => transport.list().filter((f) => f.registered).map((f) => f.frameKey);
    // Any focus on the composer (load, click, shortcut) takes the lease for every loaded frame;
    // frames still loading get it when they register.
    // Typing renews it, so a long draft never outlives the lease.
    let lastGrant = 0;
    const onComposerFocus = () => {
      if (active() && Date.now() - lastGrant < 5000) return;
      lastGrant = Date.now();
      grant(registeredFrames());
    };
    for (const type of ["focusin", "keydown", "pointerdown"]) composer.element.addEventListener(type, onComposerFocus);
    ctx.onDispose(() => {
      for (const type of ["focusin", "keydown", "pointerdown"]) composer.element.removeEventListener(type, onComposerFocus);
    });
    const yieldLease = () => {
      if (!leaseUntil) return;
      leaseUntil = 0;
      for (const target of workspace.activeTargets()) if (target?.registered) setFrameLease(target.frameKey, 0);
    };

    // New iframes start with the lease in their name when the composer holds the caret.
    ctx.contribute("frame.identityParams", {
      id: "PromptFocus:caretLease",
      params: () => (composer.hasFocus() || active() ? { chatclub_caret_lease: String(Date.now() + LEASE_MS) } : {}),
    });

    // After a send the sites tend to grab focus: lease every frame that was sent to.
    ctx.events.on("Composer:accepted", ({ targets }) => {
      if (!composer.hasFocus()) return;
      grant((targets ?? []).map((t) => t.frameKey).filter(Boolean));
    });
    ctx.events.on("frameRegistered", ({ frameKey }) => {
      if (active()) setFrameLease(frameKey, leaseUntil);
    });

    // The user chose a frame: yield at once.
    ctx.events.on("Frames:userClickedFrame", () => {
      lastFrameClick = Date.now();
      yieldLease();
    });

    // A site tried to take focus during the lease: hand it back to the composer.
    ctx.events.on("Frames:focusBlocked", () => {
      if (active()) composer.focus({ summonFloat: false });
    });
    // Focus moved into an iframe without a user click (e.g. the site focused its window).
    // A chat that is still loading has no content script to report a click or refuse focus, so focus
    // it takes is handed back at once; a loaded chat gets a moment for the user's click to arrive.
    const frames = ctx.services.get("frames");
    const onBlur = () => {
      if (!active()) return;
      const check = () => {
        if (!active() || Date.now() - lastFrameClick < USER_CLICK_WINDOW_MS) return;
        if (document.activeElement?.tagName === "IFRAME" && document.hasFocus()) composer.focus({ summonFloat: false });
      };
      setTimeout(() => {
        const el = document.activeElement;
        const key = el?.tagName === "IFRAME" ? frames?.frameKeyOf?.(el) : null;
        if (key && !frames.isRegistered(key)) check();
        else setTimeout(check, STEAL_CHECK_MS);
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    ctx.onDispose(() => window.removeEventListener("blur", onBlur));
    // Clicking into another field on the page ends the lease too. Buttons (new chat, reload, menus)
    // keep it, so a chat they load cannot take the caret from the composer.
    const onPagePointer = (event) => {
      if (!event.isTrusted || event.target.closest?.(".cc-composer")) return;
      if (event.target.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']")) yieldLease();
    };
    document.addEventListener("pointerdown", onPagePointer, true);
    ctx.onDispose(() => document.removeEventListener("pointerdown", onPagePointer, true));

    ctx.contribute("shortcut.action", {
      id: "focusInput",
      labelKey: "promptFocus.shortcut",
      run: () => {
        composer.focus();
        grant(registeredFrames());
      },
    });

    // The page opens with the caret in the composer, unless the user is already somewhere else
    // or the auto-hidden top bar is tucked away (focusing would pull it out).
    const shellEl = ctx.services.get("shell")?.shell;
    setTimeout(() => {
      const elsewhere = document.activeElement && document.activeElement !== document.body;
      const tucked = shellEl?.dataset.topbar === "auto" && shellEl.dataset.topbarShown !== "true";
      if (elsewhere || tucked) return;
      composer.focus({ summonFloat: false });
    }, 0);

    ctx.services.provide("promptFocus", { active, grant, yield: yieldLease });
  },
};
