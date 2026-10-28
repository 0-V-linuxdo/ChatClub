// ComposerFloat: moves the prompt box between the top bar and a floating spot in the center (03 §1.2).

import { h, icon } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { renderSettingsFields } from "../../lib/settings-form.js";

export default {
  start(ctx) {
    const t = ctx.t;
    const shell = ctx.services.get("shell");
    const composer = ctx.services.get("composer");
    if (!composer || shell?.page !== "workspace") return;
    const box = composer.element;
    const { slot, textarea } = composer;

    ctx.contribute("appearance.field", {
      id: "ComposerFloat:placement",
      group: "Appearance:topbar",
      order: 5,
      render(container, gctx) {
        const rows = renderSettingsFields(ctx.host, ctx.plugin, { keys: ["composerPlacement"] });
        if (rows.dispose) gctx.onDispose(rows.dispose);
        container.append(...rows);
      },
    });

    const placement = () => (ctx.settings.composerPlacement === "center" ? "center" : "topbar");
    const pinBtn = ui.iconButton({ icon: "chevronDown", compact: true, label: t("composer.pin.float"), tipId: "composer.pin" });
    const summonBtn = ui.iconButton({ icon: "keyboard", label: t("composer.pin.dock"), tipId: "composer.open" });
    const floatHost = h("div.cc-composer-float", { hidden: true });
    shell.overlayRoot.parentNode?.insertBefore(floatHost, shell.overlayRoot) ?? document.body.append(floatHost);
    ctx.onDispose(composer.addTool(pinBtn));

    const editingTopbar = () => ctx.services.get("topbar")?.isEditing?.() ?? false;
    const refreshPin = () => {
      pinBtn.hidden = editingTopbar();
      const center = placement() === "center";
      pinBtn.replaceChildren(icon(center ? "chevronUp" : "chevronDown", { size: 15 }));
      pinBtn.setAttribute("aria-label", center ? t("composer.pin.dock") : t("composer.pin.float"));
      pinBtn.dataset.tip = pinBtn.getAttribute("aria-label");
    };

    let floating = false;
    const move = (toFloat) => {
      const selStart = textarea.selectionStart;
      const selEnd = textarea.selectionEnd;
      const hadFocus = composer.hasFocus();
      floating = toFloat;
      if (toFloat) {
        floatHost.hidden = false;
        floatHost.style.top = `calc(var(--topbar-h) + 40px + 12px)`;
        floatHost.append(box);
        slot.replaceChildren(summonBtn);
        slot.classList.add("floating");
      } else {
        floatHost.hidden = true;
        slot.replaceChildren(box);
        slot.classList.remove("floating");
      }
      if (hadFocus) {
        textarea.focus({ preventScroll: true });
        try {
          textarea.setSelectionRange(selStart, selEnd);
        } catch {
          // ignore
        }
      }
      composer.setFloating(toFloat);
      refreshPin();
    };
    const summon = () => {
      if (placement() === "center" && !editingTopbar()) move(true);
    };
    const tuckAway = () => {
      if (floating) move(false);
    };

    summonBtn.addEventListener("click", () => {
      move(true);
      composer.focus({ summonFloat: false });
    });
    pinBtn.addEventListener("click", () => {
      const next = placement() === "center" ? "topbar" : "center";
      ctx.settings.composerPlacement = next;
      move(next === "center");
      composer.focus({ summonFloat: false });
    });
    ctx.onDispose(ctx.plugin.settings.use(["composerPlacement"], () => {
      if (placement() === "topbar") tuckAway();
      refreshPin();
    }));
    // Clicking outside the floating composer (including into a chat iframe) tucks it away temporarily.
    const onPointerDown = (event) => {
      if (!floating || box.contains(event.target) || event.target.closest?.(".cc-menu, .cc-modal, .cc-menu-backdrop")) return;
      tuckAway();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    ctx.onDispose(() => document.removeEventListener("pointerdown", onPointerDown, true));
    ctx.events.on("Frames:userClickedFrame", () => tuckAway());
    const onResize = () => {
      if (floating && placement() !== "center") tuckAway();
    };
    window.addEventListener("resize", onResize);
    ctx.onDispose(() => window.removeEventListener("resize", onResize));
    ctx.contribute("composer.keyHandler", {
      id: "ComposerFloat:escape",
      order: 100,
      onKeyDown: (event) => {
        if (event.key !== "Escape" || !floating) return false;
        event.stopPropagation();
        tuckAway();
        textarea.blur();
        return true;
      },
    });
    ctx.events.on("I18n:languageChanged", refreshPin);

    // Off again: the box goes back to the top bar.
    ctx.onDispose(() => {
      if (floating) move(false);
      floatHost.remove();
    });
    ctx.services.provide("composerFloat", { summon, tuckAway, placement, isFloating: () => floating });
    refreshPin();
    if (placement() === "center") queueMicrotask(() => move(true));
  },
};
