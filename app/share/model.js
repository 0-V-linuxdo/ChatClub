export const SHARE_FORMAT_IMAGE = "image";
export const SHARE_FORMAT_TEXT = "text";
export const SHARE_SCOPE_CURRENT = "current";
export const SHARE_SCOPE_SELECTED = "selected";
export const SHARE_SCOPE_ALL = "all";
export const SHARE_IMAGE_LAYOUT_STACK = "stack";
export const SHARE_IMAGE_LAYOUT_ROW = "row";
const SHARE_CAPTURE_DESKTOP_MAX_WIDTH = 1000;
const SHARE_CAPTURE_MOBILE_MAX_WIDTH = 430;
export const SHARE_CAPTURE_JPEG_QUALITY = 0.7;
export const SHARE_CAPTURE_OVERLAP_PX = 64;
export const SHARE_CAPTURE_WAIT_MS = 450;
export const SHARE_CAPTURE_MAX_SLICES = 60;
const SHARE_CANVAS_MAX_DIMENSION = 16384;
const SHARE_CANVAS_MAX_PIXELS = 268435456;
export const SHARE_PANEL_MIN_WIDTH = 420;
export const SHARE_PANEL_MIN_HEIGHT = 420;
export const SHARE_IMAGE_HEADER_HEIGHT = 44;
export const SHARE_IMAGE_GAP = 16;

function shareFrameKey(frame = {}) {
  return String(frame.instanceId || frame.key || "").trim();
}

function finiteNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

export function normalizeShareFormat(value) {
  return value === SHARE_FORMAT_TEXT ? SHARE_FORMAT_TEXT : SHARE_FORMAT_IMAGE;
}

export function normalizeShareScope(value) {
  if (value === SHARE_SCOPE_SELECTED || value === SHARE_SCOPE_ALL) return value;
  return SHARE_SCOPE_CURRENT;
}

export function normalizeShareImageLayout(value) {
  return value === SHARE_IMAGE_LAYOUT_ROW ? SHARE_IMAGE_LAYOUT_ROW : SHARE_IMAGE_LAYOUT_STACK;
}

export function shareOutputMaxWidth(cssWidth) {
  const width = Math.max(0, Number(cssWidth) || 0);
  return width > 0 && width <= 520 ? SHARE_CAPTURE_MOBILE_MAX_WIDTH : SHARE_CAPTURE_DESKTOP_MAX_WIDTH;
}

export function resolveShareTargets({ scope, frames, selectedKeys, currentKey } = {}) {
  const list = Array.isArray(frames) ? frames.filter((frame) => shareFrameKey(frame)) : [];
  const normalizedScope = normalizeShareScope(scope);
  if (normalizedScope === SHARE_SCOPE_ALL) return list;
  if (normalizedScope === SHARE_SCOPE_SELECTED) {
    const selected = new Set((Array.isArray(selectedKeys) ? selectedKeys : []).map((value) => String(value || "")));
    const chosen = list.filter((frame) => selected.has(shareFrameKey(frame)));
    if (chosen.length) return chosen;
    const visible = list.filter((frame) => frame.visible);
    return visible.length ? visible : list.slice(0, 1);
  }
  const current = list.find((frame) => shareFrameKey(frame) === String(currentKey || ""));
  if (current) return [current];
  const visible = list.filter((frame) => frame.visible);
  return visible[0] ? [visible[0]] : list.slice(0, 1);
}

function shareRoleLabel(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "user") return "USER";
  if (value === "assistant") return "ASSISTANT";
  return "PAGE";
}

function composeShareTurns(messages = []) {
  return (Array.isArray(messages) ? messages : []).map((message) => {
    const text = String(message?.text || "").trim();
    if (!text) return "";
    return `${shareRoleLabel(message?.role)}:\n${text}`;
  }).filter(Boolean).join("\n\n");
}

export function composeShareText(sections = []) {
  return (Array.isArray(sections) ? sections : []).map((section) => {
    const header = [section?.name, section?.title].map((value) => String(value || "").trim()).filter(Boolean).join(" · ");
    const href = String(section?.href || "").trim();
    const turns = composeShareTurns(section?.messages);
    const text = turns || String(section?.text || "").trim();
    const lines = [];
    if (header) lines.push(`# ${header}`);
    if (href) lines.push(href);
    if (text) {
      if (lines.length) lines.push("");
      lines.push(text);
    } else if (section?.error) {
      if (lines.length) lines.push("");
      lines.push(String(section.error));
    }
    return lines.join("\n").trim();
  }).filter(Boolean).join("\n\n---\n\n");
}

export function shareFilename(format, now = new Date()) {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return normalizeShareFormat(format) === SHARE_FORMAT_TEXT
    ? `chatclub-share-${stamp}.txt`
    : `chatclub-share-${stamp}.jpg`;
}

export function normalizeSharePanelSize(size = {}, limits = {}) {
  const minWidth = Math.max(1, Number(limits.minWidth) || SHARE_PANEL_MIN_WIDTH);
  const minHeight = Math.max(1, Number(limits.minHeight) || SHARE_PANEL_MIN_HEIGHT);
  const width = Math.max(minWidth, Math.round(Number(size.width) || minWidth));
  const height = Math.max(minHeight, Math.round(Number(size.height) || minHeight));
  const left = Number(size.left);
  const top = Number(size.top);
  return {
    width,
    height,
    ...(Number.isFinite(left) ? { left } : {}),
    ...(Number.isFinite(top) ? { top } : {})
  };
}

export function stitchSkipTop({
  index = 0,
  height,
  prevScrollY,
  scrollY,
  viewportHeight,
  overlapPx = SHARE_CAPTURE_OVERLAP_PX
} = {}) {
  const sourceHeight = Math.max(1, Math.round(Number(height) || 1));
  const maxSkip = Math.max(0, sourceHeight - 1);
  if (index <= 0) return 0;
  const previousY = finiteNumber(prevScrollY);
  const currentY = finiteNumber(scrollY);
  const viewport = finiteNumber(viewportHeight);
  if (previousY != null && currentY != null && viewport && viewport > 0) {
    const overlapCss = Math.max(0, previousY + viewport - currentY);
    return Math.min(maxSkip, Math.max(0, Math.round(overlapCss * (sourceHeight / viewport))));
  }
  return Math.min(maxSkip, Math.max(0, Math.round(Number(overlapPx) || 0)));
}

export function stitchLayout({
  slices = [],
  overlapPx = SHARE_CAPTURE_OVERLAP_PX,
  maxWidth,
  maxDimension = SHARE_CANVAS_MAX_DIMENSION,
  maxPixels = SHARE_CANVAS_MAX_PIXELS
} = {}) {
  const items = (Array.isArray(slices) ? slices : []).map((slice, index, list) => {
    const width = Math.max(1, Math.round(Number(slice.width) || 1));
    const height = Math.max(1, Math.round(Number(slice.height) || 1));
    const skipSource = Number.isFinite(Number(slice.skipTop))
      ? Math.min(height - 1, Math.max(0, Math.round(Number(slice.skipTop))))
      : stitchSkipTop({
        index,
        height,
        prevScrollY: list[index - 1]?.scrollY,
        scrollY: slice.scrollY,
        viewportHeight: slice.viewportHeight || list[index - 1]?.viewportHeight,
        overlapPx
      });
    return { width, height, skipSource };
  });
  if (!items.length) return { width: 0, height: 0, scale: 1, sliceDraws: [] };
  const targetWidth = Math.max(1, Math.round(Number(maxWidth) || items[0].width));
  const scaled = items.map((item) => {
    const ratio = targetWidth / item.width;
    const height = Math.max(1, Math.round(item.height * ratio));
    const skipTop = Math.min(height - 1, Math.max(0, Math.round(item.skipSource * ratio)));
    return {
      width: targetWidth,
      height,
      skipTop,
      sourceSkip: item.skipSource,
      drawHeight: Math.max(1, height - skipTop)
    };
  });
  const totalHeight = scaled.reduce((sum, item) => sum + item.drawHeight, 0);
  let scale = 1;
  if (targetWidth > maxDimension) scale = maxDimension / targetWidth;
  if (totalHeight * scale > maxDimension) scale = Math.min(scale, maxDimension / totalHeight);
  if (targetWidth * totalHeight * scale * scale > maxPixels) {
    scale = Math.min(scale, Math.sqrt(maxPixels / (targetWidth * totalHeight)));
  }
  const width = Math.max(1, Math.round(targetWidth * scale));
  let y = 0;
  const sliceDraws = scaled.map((item) => {
    const drawHeight = Math.max(1, Math.round(item.drawHeight * scale));
    const draw = {
      y,
      height: drawHeight,
      skipTop: Math.round(item.skipTop * scale),
      sourceSkip: item.sourceSkip,
      sourceWidth: item.width,
      sourceHeight: item.height
    };
    y += drawHeight;
    return draw;
  });
  return { width, height: Math.max(1, y), scale, sliceDraws };
}

function scaleComposeLayout(width, totalHeight, raw, maxDimension, maxPixels) {
  let scale = 1;
  if (width > maxDimension) scale = maxDimension / width;
  if (totalHeight * scale > maxDimension) scale = Math.min(scale, maxDimension / totalHeight);
  if (width * totalHeight * scale * scale > maxPixels) {
    scale = Math.min(scale, Math.sqrt(maxPixels / (width * totalHeight)));
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(totalHeight * scale)),
    scale,
    draws: raw.map((item) => ({
      x: Math.round((item.x || 0) * scale),
      y: Math.round(item.y * scale),
      width: Math.round(item.width * scale),
      height: Math.round(item.height * scale),
      headerHeight: Math.round(item.headerHeight * scale),
      header: item.header
    }))
  };
}

export function composeImageLayout({
  frames = [],
  direction = SHARE_IMAGE_LAYOUT_STACK,
  gap = SHARE_IMAGE_GAP,
  headerHeight = SHARE_IMAGE_HEADER_HEIGHT,
  maxDimension = SHARE_CANVAS_MAX_DIMENSION,
  maxPixels = SHARE_CANVAS_MAX_PIXELS
} = {}) {
  const items = (Array.isArray(frames) ? frames : []).map((frame) => ({
    width: Math.max(1, Math.round(Number(frame.width) || 1)),
    height: Math.max(1, Math.round(Number(frame.height) || 1)),
    header: String(frame.header || "").trim()
  }));
  if (!items.length) {
    return { width: 0, height: 0, scale: 1, draws: [], direction: SHARE_IMAGE_LAYOUT_STACK };
  }
  const layout = normalizeShareImageLayout(direction);
  const header = Math.max(0, Math.round(Number(headerHeight) || 0));
  const gapSize = Math.max(0, Math.round(Number(gap) || 0));
  if (layout === SHARE_IMAGE_LAYOUT_ROW) {
    const contentHeight = items.reduce((max, item) => Math.max(max, item.height), 1);
    let x = 0;
    const raw = items.map((item, index) => {
      if (index) x += gapSize;
      const draw = { ...item, x, y: 0, headerHeight: header };
      x += item.width;
      return draw;
    });
    return {
      ...scaleComposeLayout(Math.max(1, x), header + contentHeight, raw, maxDimension, maxPixels),
      direction: layout
    };
  }
  const width = items.reduce((max, item) => Math.max(max, item.width), 1);
  let y = 0;
  const raw = items.map((item, index) => {
    if (index) y += gapSize;
    const draw = { ...item, x: 0, y, headerHeight: header };
    y += header + item.height;
    return draw;
  });
  return { ...scaleComposeLayout(width, y, raw, maxDimension, maxPixels), direction: layout };
}
