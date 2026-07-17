export function messageNavigatorCss(rootId, primaryColor = "#1f7a5f") {
  return `
    :root {
      --cc-message-nav-accent: ${primaryColor};
    }
    #${rootId} {
      --cc-message-nav-accent: ${primaryColor};
      --cc-message-nav-bg: color-mix(in srgb, Canvas 92%, transparent);
      --cc-message-nav-text: CanvasText;
      --cc-message-nav-muted: color-mix(in srgb, CanvasText 54%, transparent);
      --cc-message-nav-border: color-mix(in srgb, CanvasText 16%, transparent);
      position: fixed;
      top: 50%;
      right: 14px;
      z-index: 2147483200;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      gap: 8px;
      font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--cc-message-nav-text);
      pointer-events: none;
    }
    #${rootId} * { box-sizing: border-box; }
    .chatclub-message-nav-indicator {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
      padding: 8px 2px;
      pointer-events: auto;
    }
    .chatclub-message-nav-line {
      width: 38px;
      height: 12px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      border: 0;
      background: transparent;
      cursor: pointer;
      transition: opacity 160ms ease;
      opacity: .72;
      padding: 0;
    }
    .chatclub-message-nav-line::before {
      content: "";
      width: 18px;
      height: 3px;
      border-radius: 999px;
      background: color-mix(in srgb, CanvasText 28%, transparent);
      transition: width 160ms ease, background 160ms ease, box-shadow 160ms ease;
    }
    .chatclub-message-nav-line:hover {
      opacity: .92;
    }
    .chatclub-message-nav-line:hover::before {
      background: color-mix(in srgb, CanvasText 42%, transparent);
    }
    .chatclub-message-nav-line.active {
      opacity: 1;
    }
    .chatclub-message-nav-line.active::before {
      width: 34px;
      background: var(--cc-message-nav-accent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--cc-message-nav-accent) 24%, transparent);
    }
    .chatclub-message-nav-menu {
      width: min(18rem, calc(100vw - 68px));
      max-height: min(72vh, 34rem);
      overflow: auto;
      padding: 6px;
      border: 1px solid var(--cc-message-nav-border);
      border-radius: 8px;
      background: var(--cc-message-nav-bg);
      color: var(--cc-message-nav-text);
      box-shadow: 0 18px 48px rgba(0, 0, 0, .18);
      backdrop-filter: blur(18px);
      visibility: hidden;
      opacity: 0;
      transform: translateX(8px) scale(.98);
      pointer-events: none;
      transition: opacity 140ms ease, transform 140ms ease, visibility 0s linear 140ms;
    }
    #${rootId}.chatclub-message-nav-open .chatclub-message-nav-menu,
    #${rootId}:focus-within .chatclub-message-nav-menu {
      visibility: visible;
      opacity: 1;
      transform: translateX(0) scale(1);
      pointer-events: auto;
      transition-delay: 0s;
    }
    .chatclub-message-nav-item {
      width: 100%;
      display: grid;
      grid-template-columns: 26px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      min-height: 38px;
      padding: 8px 10px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font-size: 15px;
      line-height: 1.45;
      text-align: left;
      cursor: pointer;
    }
    .chatclub-message-nav-item:hover,
    .chatclub-message-nav-item.active {
      background: color-mix(in srgb, var(--cc-message-nav-accent) 13%, transparent);
    }
    .chatclub-message-nav-role {
      display: inline-grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: color-mix(in srgb, CanvasText 8%, transparent);
      color: var(--cc-message-nav-muted);
      font-size: 13px;
      font-weight: 700;
    }
    .chatclub-message-nav-item.active .chatclub-message-nav-role {
      background: var(--cc-message-nav-accent);
      color: white;
    }
    .chatclub-message-nav-text {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .chatclub-message-nav-empty {
      padding: 10px 12px;
      color: var(--cc-message-nav-muted);
    }
    .chatclub-message-nav-effect-border {
      outline: 2px solid var(--cc-message-nav-accent, ${primaryColor}) !important;
      outline-offset: 4px !important;
      border-radius: 8px !important;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--cc-message-nav-accent, ${primaryColor}) 16%, transparent) !important;
    }
    .chatclub-message-nav-effect-pulse {
      animation: chatclub-message-nav-pulse 1.35s ease-out 1;
    }
    .chatclub-message-nav-effect-fade {
      animation: chatclub-message-nav-fade 1.35s ease-out 1;
    }
    .chatclub-message-nav-effect-jiggle {
      animation: chatclub-message-nav-jiggle .56s ease-in-out 1;
    }
    @keyframes chatclub-message-nav-pulse {
      0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--cc-message-nav-accent, ${primaryColor}) 42%, transparent); }
      70% { box-shadow: 0 0 0 16px color-mix(in srgb, var(--cc-message-nav-accent, ${primaryColor}) 0%, transparent); }
      100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--cc-message-nav-accent, ${primaryColor}) 0%, transparent); }
    }
    @keyframes chatclub-message-nav-fade {
      0%, 100% { opacity: 1; }
      22% { opacity: .42; }
      44% { opacity: 1; }
      66% { opacity: .58; }
    }
    @keyframes chatclub-message-nav-jiggle {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-5px); }
      40% { transform: translateX(5px); }
      60% { transform: translateX(-3px); }
      80% { transform: translateX(3px); }
    }
    @media (prefers-color-scheme: dark) {
      #${rootId} {
        --cc-message-nav-bg: color-mix(in srgb, #1b1d20 88%, transparent);
        --cc-message-nav-text: #f2f4f5;
        --cc-message-nav-muted: rgba(242, 244, 245, .62);
        --cc-message-nav-border: rgba(255, 255, 255, .14);
      }
    }
  `;
}
