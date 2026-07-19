export function siteConfigText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

export function uniqueSiteConfigStrings(value = []) {
  const seen = new Set();
  const output = [];
  for (const item of Array.isArray(value) ? value : []) {
    const normalized = siteConfigText(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

export function boundedSiteConfigNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}
