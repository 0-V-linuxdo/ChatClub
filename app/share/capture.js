import { currentExtensionTab, tabsCaptureVisibleTab, tabsCreate } from "../../shared/extension-api.js";
import {
  SHARE_CAPTURE_JPEG_QUALITY,
  SHARE_CAPTURE_MAX_SLICES,
  SHARE_CAPTURE_OVERLAP_PX,
  SHARE_CAPTURE_WAIT_MS,
  SHARE_IMAGE_GAP,
  SHARE_IMAGE_HEADER_HEIGHT,
  SHARE_IMAGE_LAYOUT_STACK,
  composeImageLayout,
  normalizeShareImageLayout,
  shareOutputMaxWidth,
  stitchLayout,
  stitchSkipTop
} from "./model.js";

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, Number(ms) || 0)); });

function abortError(message = "Capture stopped") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load captured frame"));
    image.src = src;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode image"));
    }, type, quality);
  });
}

function iframeCropRect(iframe) {
  const rect = iframe.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height)
  };
}

async function captureVisibleDataUrl() {
  const tab = await currentExtensionTab();
  const options = { format: "png" };
  if (Number.isInteger(tab?.windowId)) return tabsCaptureVisibleTab(tab.windowId, options);
  return tabsCaptureVisibleTab(options);
}

function cropToRect(image, rect) {
  const scaleX = image.naturalWidth / Math.max(1, window.innerWidth);
  const scaleY = image.naturalHeight / Math.max(1, window.innerHeight);
  const sx = Math.max(0, Math.round(rect.left * scaleX));
  const sy = Math.max(0, Math.round(rect.top * scaleY));
  const sw = Math.max(1, Math.min(image.naturalWidth - sx, Math.round(rect.width * scaleX)));
  const sh = Math.max(1, Math.min(image.naturalHeight - sy, Math.round(rect.height * scaleY)));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function rowSignature(canvas, y) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  const row = Math.min(canvas.height - 1, Math.max(0, Math.round(y)));
  const { data, width } = ctx.getImageData(0, row, canvas.width, 1);
  let hash = 0;
  const step = Math.max(4, Math.floor(width / 80));
  for (let x = 0; x < width; x += step) {
    const index = x * 4;
    hash = (hash * 33 + data[index] + data[index + 1] + data[index + 2]) | 0;
  }
  return hash;
}

function matchOverlapSkip(previous, next, metricSkip) {
  const maxSkip = Math.max(1, next.height - 1);
  const guess = Math.min(maxSkip, Math.max(0, Math.round(Number(metricSkip) || 0)));
  if (!previous?.getContext || !next?.getContext) return guess;
  try {
    const window = Math.min(80, Math.max(12, Math.floor(next.height * 0.12)));
    const from = Math.max(0, guess - window);
    const to = Math.min(maxSkip, guess + window);
    const sampleCount = 4;
    let best = guess;
    let bestScore = Infinity;
    for (let skip = from; skip <= to; skip += 1) {
      if (skip <= 0) continue;
      let score = 0;
      for (let sample = 0; sample < sampleCount; sample += 1) {
        const offset = Math.floor(((sample + 0.5) / sampleCount) * skip);
        score += Math.abs(
          rowSignature(previous, previous.height - skip + offset) - rowSignature(next, offset)
        );
      }
      if (score < bestScore) {
        bestScore = score;
        best = skip;
      }
    }
    return best;
  } catch {
    return guess;
  }
}

function stitchCanvases(slices, maxWidth, overlapPx = SHARE_CAPTURE_OVERLAP_PX) {
  const prepared = slices.map((slice, index) => {
    const metricSkip = stitchSkipTop({
      index,
      height: slice.canvas.height,
      prevScrollY: slices[index - 1]?.scrollY,
      scrollY: slice.scrollY,
      viewportHeight: slice.viewportHeight || slices[index - 1]?.viewportHeight,
      overlapPx
    });
    const skipTop = index === 0 ? 0 : matchOverlapSkip(slices[index - 1].canvas, slice.canvas, metricSkip);
    return {
      width: slice.canvas.width,
      height: slice.canvas.height,
      skipTop
    };
  });
  const layout = stitchLayout({ slices: prepared, overlapPx, maxWidth });
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  layout.sliceDraws.forEach((draw, index) => {
    const slice = slices[index].canvas;
    const sourceSkip = Math.min(slice.height - 1, Math.max(0, Math.round(draw.sourceSkip || 0)));
    ctx.drawImage(
      slice,
      0,
      sourceSkip,
      slice.width,
      Math.max(1, slice.height - sourceSkip),
      0,
      draw.y,
      layout.width,
      draw.height
    );
  });
  return canvas;
}

function composeCanvases(frames, direction = SHARE_IMAGE_LAYOUT_STACK) {
  const layout = composeImageLayout({
    frames: frames.map((frame) => ({
      width: frame.canvas.width,
      height: frame.canvas.height,
      header: frame.header
    })),
    direction: normalizeShareImageLayout(direction),
    gap: SHARE_IMAGE_GAP,
    headerHeight: SHARE_IMAGE_HEADER_HEIGHT
  });
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  layout.draws.forEach((draw, index) => {
    const frame = frames[index];
    if (draw.headerHeight > 0) {
      ctx.fillStyle = "#111827";
      ctx.fillRect(draw.x, draw.y, draw.width, draw.headerHeight);
      ctx.fillStyle = "#f9fafb";
      ctx.font = `${Math.max(12, Math.round(draw.headerHeight * 0.42))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(frame.header || "", draw.x + 16, draw.y + draw.headerHeight / 2, Math.max(1, draw.width - 32));
    }
    ctx.drawImage(
      frame.canvas,
      0,
      0,
      frame.canvas.width,
      frame.canvas.height,
      draw.x,
      draw.y + draw.headerHeight,
      draw.width,
      draw.height
    );
  });
  return canvas;
}

export async function captureFrameImage({
  iframe,
  sendCommand,
  signal,
  onStatus
} = {}) {
  if (!iframe) throw new Error("Missing iframe");
  iframe.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  let started = false;
  try {
    throwIfAborted(signal);
    const start = await sendCommand(iframe, "captureStart");
    started = true;
    const slices = [];
    let metrics = start || {};
    let done = Boolean(metrics.done);
    for (let index = 0; index < SHARE_CAPTURE_MAX_SLICES; index += 1) {
      throwIfAborted(signal);
      onStatus?.(index + 1);
      await sleep(SHARE_CAPTURE_WAIT_MS);
      throwIfAborted(signal);
      const rect = iframeCropRect(iframe);
      const dataUrl = await captureVisibleDataUrl();
      const image = await loadImage(dataUrl);
      slices.push({
        canvas: cropToRect(image, rect),
        scrollY: Number(metrics.scrollY) || 0,
        viewportHeight: Number(metrics.viewportHeight) || rect.height
      });
      if (done || index === SHARE_CAPTURE_MAX_SLICES - 1) break;
      metrics = await sendCommand(iframe, "triggerScroll") || {};
      done = Boolean(metrics.done);
    }
    if (!slices.length) throw new Error("No screenshot slices were captured");
    return stitchCanvases(
      slices,
      shareOutputMaxWidth(iframeCropRect(iframe).width),
      Number(start?.overlapPx) || SHARE_CAPTURE_OVERLAP_PX
    );
  } finally {
    if (started) {
      try { await sendCommand(iframe, "captureEnd"); } catch {}
    }
  }
}

export function composeCapturedImages(frames = [], { layout } = {}) {
  const usable = (Array.isArray(frames) ? frames : []).filter((frame) => frame?.canvas);
  if (!usable.length) throw new Error("No screenshot was captured");
  if (usable.length === 1) return usable[0].canvas;
  return composeCanvases(usable, layout);
}

export async function canvasToJpegBlob(canvas) {
  return canvasToBlob(canvas, "image/jpeg", SHARE_CAPTURE_JPEG_QUALITY);
}

async function canvasToPngBlob(canvas) {
  return canvasToBlob(canvas, "image/png");
}

export function revokeShareUrl(url) {
  if (url) URL.revokeObjectURL(url);
}

export function blobUrl(blob) {
  return URL.createObjectURL(blob);
}

export function downloadBlob(filename, blob) {
  const url = blobUrl(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openBlobInTab(blob) {
  const url = blobUrl(blob);
  try {
    await tabsCreate({ url });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function copyImageCanvas(canvas) {
  const blob = await canvasToPngBlob(canvas);
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("Clipboard image copy is unavailable");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export async function copyText(text) {
  const value = String(text || "");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  throw new Error("Clipboard text copy is unavailable");
}

export { sleep, throwIfAborted };
