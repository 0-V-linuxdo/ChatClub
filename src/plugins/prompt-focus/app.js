// PromptFocus: the caret lease between the composer and chat iframes (v2 03 §2.5).

const LEASE_MS = 180000;
const USER_CLICK_WINDOW_MS = 400;

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
    const onBlur = () => {
      if (!active()) return;
      setTimeout(() => {
        if (!active() || Date.now() - lastFrameClick < USER_CLICK_WINDOW_MS) return;
        if (document.activeElement?.tagName === "IFRAME" && document.hasFocus()) composer.focus({ summonFloat: false });
      }, 120);
    };
    window.addEventListener("blur", onBlur);
    ctx.onDispose(() => window.removeEventListener("blur", onBlur));
    // Typing or clicking elsewhere on the page ends the lease too.
    const onPagePointer = (event) => {
      if (event.isTrusted && !event.target.closest?.(".cc-composer")) yieldLease();
    };
    document.addEventListener("pointerdown", onPagePointer, true);
    ctx.onDispose(() => document.removeEventListener("pointerdown", onPagePointer, true));

    ctx.contribute("shortcut.action", {
      id: "focusInput",
      labelKey: "promptFocus.shortcut",
      run: () => {
        composer.focus();
        leaseUntil = Date.now() + LEASE_MS;
      },
    });

    ctx.services.provide("promptFocus", { active, grant, yield: yieldLease });
  },
};
