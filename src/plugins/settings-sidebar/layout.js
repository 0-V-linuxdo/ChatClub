// Pure layout logic: the Plugins entry stays first and visible so the plugin can always be turned off again.

export const PINNED = "plugins";

/** Applies { order, hidden } to the sorted section list; unknown sections keep their default spot. */
export function applyLayout(entries, layout, { includeHidden = false } = {}) {
  const order = Array.isArray(layout?.order) ? layout.order : [];
  const hidden = new Set(Array.isArray(layout?.hidden) ? layout.hidden : []);
  const rank = new Map(order.map((id, i) => [id, i]));
  const pinned = entries.filter((e) => e.id === PINNED);
  const rest = entries
    .filter((e) => e.id !== PINNED)
    .map((e, i) => ({ e, i, r: rank.has(e.id) ? rank.get(e.id) : null }));
  // Ranked entries take the slots in their saved order; new sections slot in by their default position.
  const ranked = rest.filter((x) => x.r !== null).sort((a, b) => a.r - b.r);
  const slots = rest.filter((x) => x.r !== null).map((x) => x.i).sort((a, b) => a - b);
  const placed = new Array(rest.length);
  ranked.forEach((x, k) => (placed[slots[k]] = x.e));
  rest.filter((x) => x.r === null).forEach((x) => (placed[x.i] = x.e));
  const list = [...pinned, ...placed];
  return includeHidden ? list : list.filter((e) => e.id === PINNED || !hidden.has(e.id));
}

export const isDefaultLayout = (layout) => !layout || (!(layout.order?.length) && !(layout.hidden?.length));
