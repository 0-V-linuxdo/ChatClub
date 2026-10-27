// Landing effects of the message navigator (v2 05 §3.2). Shared by the in-frame bundle (via @include)
// and the settings preview, so it must not import anything.

export const NAVIGATOR_EFFECTS = ["none", "border", "pulse", "fade", "jiggle"];

const EFFECT_MS = { border: 1800, pulse: 1350, fade: 1350, jiggle: 560 };
const EFFECT_STYLE_ID = "chatclub-navigator-effects";
const EFFECT_CSS = `
.chatclub-nav-fx-border { outline: 2px solid var(--chatclub-nav-color, #10a37f) !important; outline-offset: 4px !important; border-radius: 6px; transition: outline-color .3s; }
.chatclub-nav-fx-pulse { outline: 2px solid var(--chatclub-nav-color, #10a37f) !important; outline-offset: 4px !important; border-radius: 6px; animation: chatclub-nav-pulse 1.35s ease-in-out 1; }
.chatclub-nav-fx-fade { animation: chatclub-nav-fade 1.35s ease-out 1; border-radius: 6px; }
.chatclub-nav-fx-jiggle { animation: chatclub-nav-jiggle .56s ease-in-out 1; }
@keyframes chatclub-nav-pulse { 0%, 100% { outline-color: transparent; } 25%, 75% { outline-color: var(--chatclub-nav-color, #10a37f); } 50% { outline-color: color-mix(in srgb, var(--chatclub-nav-color, #10a37f) 35%, transparent); } }
@keyframes chatclub-nav-fade { 0% { background-color: color-mix(in srgb, var(--chatclub-nav-color, #10a37f) 22%, transparent); } 100% { background-color: transparent; } }
@keyframes chatclub-nav-jiggle { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-4px); } 40% { transform: translateX(4px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(2px); } }
`;

export function ensureEffectStyles(doc) {
  if (!doc || doc.getElementById(EFFECT_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = EFFECT_STYLE_ID;
  style.textContent = EFFECT_CSS;
  (doc.head || doc.documentElement).append(style);
}

/** Plays one landing effect on `node`; returns the duration in ms (0 for none). */
export function playEffect(node, mode) {
  const ms = EFFECT_MS[mode];
  if (!node || !ms) return 0;
  ensureEffectStyles(node.ownerDocument);
  const cls = `chatclub-nav-fx-${mode}`;
  for (const m of Object.keys(EFFECT_MS)) node.classList.remove(`chatclub-nav-fx-${m}`);
  void node.offsetWidth;
  node.classList.add(cls);
  clearTimeout(node.__chatclubNavFx);
  node.__chatclubNavFx = setTimeout(() => node.classList.remove(cls), ms);
  return ms;
}
