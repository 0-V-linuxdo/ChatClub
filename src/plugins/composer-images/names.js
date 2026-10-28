// Image names in a draft are unique so sites that dedupe by name keep every image.

/** "a.png" → "a (2).png" when taken; no name → prompt-image-N.ext (03 §3). */
export function uniqueImageName(raw, type, taken, counter) {
  let name = String(raw || "").split(/[\\/]/).pop().trim();
  if (!name) {
    const ext = (String(type || "image/png").split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
    name = `prompt-image-${counter}.${ext}`;
  }
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (${n})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}
