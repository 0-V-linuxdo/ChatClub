import { el, iconButton } from "./dom.js";

export function createActionButton({ label, icon, onClick, variant = "secondary", className = "", tooltipLabel = label, tooltipPlacement = "", tooltipId = "" }) {
  return el("button", {
    class: `button button-${variant} action-button tooltip-trigger ${className}`.trim(),
    "aria-label": label,
    "data-tooltip": tooltipLabel,
    "data-tooltip-placement": tooltipPlacement || null,
    "data-tooltip-id": tooltipId || null,
    onclick: onClick
  },
    icon,
    el("span", {}, label)
  );
}

export function createTopIconButton({ label, icon, onClick, className = "", tooltipLabel = label, tooltipPlacement = "", tooltipId = "" }) {
  return iconButton(label, icon, onClick, `top-icon-action ${className}`.trim(), tooltipLabel, tooltipPlacement, tooltipId);
}

export function createCompactIconButton({ label, icon, onClick, className = "", tooltipLabel = label, tooltipPlacement = "", tooltipId = "" }) {
  return iconButton(label, icon, onClick, `compact-icon ${className}`.trim(), tooltipLabel, tooltipPlacement, tooltipId);
}

export function createMenuButton({ label, icon, onClick, variant = "secondary", disabled = false, tooltipLabel = label, tooltipPlacement = "", tooltipId = "" }) {
  let pointerHandled = false;
  const runCommand = (event) => {
    if (event.currentTarget?.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event);
  };
  return el("button", {
    class: `button button-${variant} menu-button tooltip-trigger`,
    type: "button",
    role: "menuitem",
    "aria-label": label,
    "data-tooltip": tooltipLabel,
    "data-tooltip-placement": tooltipPlacement || null,
    "data-tooltip-id": tooltipId || null,
    disabled,
    onpointerdown: (event) => {
      if (event.button !== 0) return;
      pointerHandled = true;
      runCommand(event);
    },
    onclick: (event) => {
      if (pointerHandled) {
        pointerHandled = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      runCommand(event);
    }
  },
    icon,
    el("span", {}, label)
  );
}

export function createSettingsList({ headers = [], rows = [], className = "" }) {
  return el("div", { class: `ui-list settings-list ${className}`.trim() },
    headers?.length ? el("div", { class: "ui-list-header settings-list-header", "aria-hidden": "true" },
      headers.map((header) => el("span", {}, header))
    ) : null,
    rows
  );
}

export function createSettingsIconAction({ label, icon, onClick, className = "", disabled = false, tooltipId = "" }) {
  return el("button", {
    class: `ui-row-action settings-row-icon-action ${className}`.trim(),
    type: "button",
    "aria-label": label,
    "data-tooltip": label,
    "data-tooltip-id": tooltipId || null,
    disabled,
    onclick: onClick
  }, icon);
}

export function createReorderButtons({
  upLabel,
  downLabel,
  upIcon,
  downIcon,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  className = ""
} = {}) {
  const bind = (label, icon, onClick, disabled) => {
    const node = createCompactIconButton({
      label,
      icon,
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (disabled) return;
        onClick?.(event);
      },
      className: "ui-reorder-button"
    });
    node.type = "button";
    node.disabled = Boolean(disabled);
    node.draggable = false;
    node.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    node.addEventListener("dragstart", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    return node;
  };
  return el("div", {
    class: `ui-reorder ${className}`.trim(),
    onpointerdown: (event) => event.stopPropagation()
  },
    bind(upLabel, upIcon, onMoveUp, !canMoveUp),
    bind(downLabel, downIcon, onMoveDown, !canMoveDown)
  );
}
