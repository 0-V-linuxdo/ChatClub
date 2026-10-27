// Long-screenshot maths for Share (v2 04 §4.4 step 6 and the multi-target composition).

export const MAX_SIDE = 16384;
export const MAX_PIXELS = 268435456;
export const TITLE_H = 44;
export const GAP = 16;
export const BG = "#111827";
export const FG = "#f9fafb";

/** Estimated overlap (device px of the slice) between slice i-1 and slice i from their scroll metrics. */
export function estimateOverlap(prev, cur, sliceHeightPx, scale) {
  if (!prev || !cur || !Number.isFinite(prev.scrollY) || !Number.isFinite(cur.scrollY)) return Math.round(64 * scale);
  const vh = prev.scrollerHeight ?? prev.viewportHeight;
  const css = prev.scrollY + vh - cur.scrollY;
  return Math.max(0, Math.min(sliceHeightPx, Math.round(css * scale)));
}

export const searchRange = (sliceHeightPx) => Math.max(12, Math.min(80, Math.round(sliceHeightPx * 0.12)));

/**
 * Fine-tunes the overlap by comparing sampled rows: the bottom of `prev` against the top of `cur`.
 * rowOf(img, y) returns a numeric feature array for row y. Returns the overlap with the smallest difference.
 */
export function refineOverlap(estimate, range, heightPrev, heightCur, rowOf, prev, cur, samples = 8) {
  let best = estimate;
  let bestScore = Infinity;
  for (let ov = Math.max(1, estimate - range); ov <= Math.min(heightCur - 1, heightPrev - 1, estimate + range); ov += 1) {
    let score = 0;
    for (let k = 0; k < samples; k += 1) {
      const yCur = Math.floor(((k + 0.5) / samples) * ov);
      const yPrev = heightPrev - ov + yCur;
      const a = rowOf(prev, yPrev);
      const b = rowOf(cur, yCur);
      for (let i = 0; i < a.length; i += 1) score += Math.abs(a[i] - b[i]);
    }
    if (score < bestScore || (score === bestScore && Math.abs(ov - estimate) < Math.abs(best - estimate))) {
      bestScore = score;
      best = ov;
    }
  }
  return best;
}

/** Scale factor (≤ 1) keeping a canvas inside the side and pixel limits. */
export function fitScale(width, height) {
  let s = 1;
  if (width * s > MAX_SIDE) s = MAX_SIDE / width;
  if (height * s > MAX_SIDE) s = Math.min(s, MAX_SIDE / height);
  if (width * height * s * s > MAX_PIXELS) s = Math.min(s, Math.sqrt(MAX_PIXELS / (width * height)));
  return s;
}

export const outputWidth = (displayWidthCss) => (displayWidthCss <= 520 ? 430 : 1000);

/** Layout of several long images with title bars: returns { width, height, items: [{ x, y, w, h }] } before fitScale. */
export function composeLayout(sizes, direction) {
  const items = [];
  if (direction === "horizontal") {
    let x = 0;
    const maxH = Math.max(...sizes.map((s) => s.h));
    sizes.forEach((s, i) => {
      items.push({ x, y: 0, w: s.w, h: s.h });
      x += s.w + (i < sizes.length - 1 ? GAP : 0);
    });
    return { width: x, height: TITLE_H + maxH, items };
  }
  let y = 0;
  const maxW = Math.max(...sizes.map((s) => s.w));
  sizes.forEach((s, i) => {
    items.push({ x: 0, y, w: s.w, h: s.h });
    y += TITLE_H + s.h + (i < sizes.length - 1 ? GAP : 0);
  });
  return { width: maxW, height: y, items };
}

/** chatclub-share-YYYY-MM-DD-HH-MM-SS.<ext> in UTC. */
export const shareFileName = (ext, now = new Date()) => `chatclub-share-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;

/** Plain text of text-mode sections (04 §4.5 step 3). */
export function shareText(sections) {
  return sections.map((s) => {
    const lines = [`# ${[s.name, s.title].filter(Boolean).join(" · ")}`, s.href || ""];
    const body = (s.messages ?? []).map((m) => `${m.role === "user" ? "USER" : m.role === "assistant" ? "ASSISTANT" : "PAGE"}:\n${m.text}`).join("\n\n");
    return `${lines.join("\n")}\n\n${body || (s.error ? s.error : "")}`.trimEnd();
  }).join("\n\n---\n\n");
}
