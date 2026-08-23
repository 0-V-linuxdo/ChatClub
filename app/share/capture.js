import { currentExtensionTab, tabsCaptureVisibleTab, tabsCreate } from "../../shared/extension-api.js";
import {
  SHARE_CAPTURE_JPEG_QUALITY,
  SHARE_CAPTURE_MAX_SLICES,
  SHARE_CAPTURE_OVERLAP_PX,
  SHARE_CAPTURE_WAIT_MS,
  SHARE_IMAGE_GAP,
  SHARE_IMAGE_HEADER_HEIGHT,
  composeImageStackLayout,
  shareOutputMaxWidth,
  stitchLayout
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
  const options = { format: "jpeg", quality: 70 };
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

function stitchCanvases(slices, maxWidth, overlapPx = SHARE_CAPTURE_OVERLAP_PX) {
  const layout = stitchLayout({
    slices: slices.map((slice) => ({ width: slice.width, height: slice.height })),
    overlapPx,
    maxWidth
  });
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  layout.sliceDraws.forEach((draw, index) => {
    const slice = slices[index];
    const sourceSkip = slice.height * (draw.skipTop / Math.max(1, draw.height + draw.skipTop));
    ctx.drawImage(
      slice,
      0,
      Math.min(slice.height - 1, Math.round(sourceSkip)),
      slice.width,
      Math.max(1, slice.height - Math.round(sourceSkip)),
      0,
      draw.y,
      layout.width,
      draw.height
    );
  });
  return canvas;
}

function stackCanvases(frames) {
  const layout = composeImageStackLayout({
    frames: frames.map((frame) => ({
      width: frame.canvas.width,
      height: frame.canvas.height,
      header: frame.header
    })),
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
      ctx.fillRect(0, draw.y, layout.width, draw.headerHeight);
      ctx.fillStyle = "#f9fafb";
      ctx.font = `${Math.max(12, Math.round(draw.headerHeight * 0.42))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(frame.header || "", 16, draw.y + draw.headerHeight / 2, layout.width - 32);
    }
    ctx.drawImage(
      frame.canvas,
      0,
      0,
      frame.canvas.width,
      frame.canvas.height,
      0,
      draw.y + draw.headerHeight,
      layout.width,
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
    let done = Boolean(start?.done);
    for (let index = 0; index < SHARE_CAPTURE_MAX_SLICES; index += 1) {
      throwIfAborted(signal);
      onStatus?.(index + 1);
      await sleep(SHARE_CAPTURE_WAIT_MS);
      throwIfAborted(signal);
      const rect = iframeCropRect(iframe);
      const dataUrl = await captureVisibleDataUrl();
      const image = await loadImage(dataUrl);
      slices.push(cropToRect(image, rect));
      if (done || index === SHARE_CAPTURE_MAX_SLICES - 1) break;
      const scrolled = await sendCommand(iframe, "triggerScroll");
      done = Boolean(scrolled?.done);
    }
    if (!slices.length) throw new Error("No screenshot slices were captured");
    return stitchCanvases(slices, shareOutputMaxWidth(iframeCropRect(iframe).width), Number(start?.overlapPx) || SHARE_CAPTURE_OVERLAP_PX);
  } finally {
    if (started) {
      try { await sendCommand(iframe, "captureEnd"); } catch {}
    }
  }
}

export function composeCapturedImages(frames = []) {
  const usable = (Array.isArray(frames) ? frames : []).filter((frame) => frame?.canvas);
  if (!usable.length) throw new Error("No screenshot was captured");
  if (usable.length === 1) return usable[0].canvas;
  return stackCanvases(usable);
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
