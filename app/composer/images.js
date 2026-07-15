const SEND_DEADLINE_MS = 60000;

export function createPromptImageModel({ createId }) {
  if (typeof createId !== "function") throw new TypeError("Prompt image model requires createId");

  function extension(mime) {
    const token = String(mime || "").trim().toLowerCase();
    const known = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
      "image/bmp": "bmp", "image/svg+xml": "svg", "image/avif": "avif"
    };
    if (known[token]) return known[token];
    const tail = token.split("/").pop();
    return tail ? tail.replace(/[^a-z0-9]+/gi, "") || "png" : "png";
  }

  function splitName(name) {
    const raw = String(name || "").trim().replace(/[\\/]+/g, "_");
    if (!raw) return { stem: "", ext: "" };
    const dotIndex = raw.lastIndexOf(".");
    return dotIndex <= 0
      ? { stem: raw, ext: "" }
      : { stem: raw.slice(0, dotIndex) || raw, ext: raw.slice(dotIndex) };
  }

  function defaultName(index = 0, type = "") {
    const ext = extension(type);
    return `prompt-image-${Math.max(0, Number(index) || 0) + 1}${ext ? `.${ext}` : ""}`;
  }

  function claimName(rawName, usedNames, index = 0, type = "") {
    const registry = usedNames instanceof Set ? usedNames : new Set();
    const fallbackName = defaultName(index, type);
    const preferred = String(rawName || "").trim().replace(/[\\/]+/g, "_") || fallbackName;
    if (!registry.has(preferred.toLowerCase())) {
      registry.add(preferred.toLowerCase());
      return preferred;
    }
    const preferredParts = splitName(preferred);
    const fallbackParts = splitName(fallbackName);
    const stem = preferredParts.stem || fallbackParts.stem || "prompt-image";
    const ext = preferredParts.ext || fallbackParts.ext;
    for (let counter = 2; counter < 10000; counter += 1) {
      const candidate = `${stem} (${counter})${ext}`;
      if (!registry.has(candidate.toLowerCase())) {
        registry.add(candidate.toLowerCase());
        return candidate;
      }
    }
    return fallbackName;
  }

  function mimeFromDataUrl(dataUrl) {
    return String(dataUrl || "").match(/^data:([^;,]+)[;,]/i)?.[1]?.toLowerCase() || "";
  }

  function normalizeEntry(value, index = 0, usedNames = new Set()) {
    if (!value || typeof value !== "object") return null;
    const dataUrl = String(value.dataUrl || value.dataURL || "").trim();
    if (!/^data:image\//i.test(dataUrl)) return null;
    const type = String(value.type || "").trim().toLowerCase() || mimeFromDataUrl(dataUrl) || "image/png";
    const lastModified = Number(value.lastModified);
    return {
      id: String(value.id || "").trim() || createId("prompt-image"),
      name: claimName(value.name, usedNames, index, type),
      type,
      size: Math.max(0, Math.round(Number(value.size) || 0)),
      lastModified: Number.isFinite(lastModified) ? lastModified : Date.now(),
      dataUrl
    };
  }

  function normalize(value) {
    const usedNames = new Set();
    return (Array.isArray(value) ? value : [])
      .map((entry, index) => normalizeEntry(entry, index, usedNames))
      .filter(Boolean);
  }

  function hasImages(images) {
    return normalize(images).length > 0;
  }

  function hasContent(text, images) {
    return String(text || "").trim().length > 0 || hasImages(images);
  }

  function timeoutMs(images) {
    return hasImages(images) ? SEND_DEADLINE_MS : 0;
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !String(file.type || "").startsWith("image/")) return reject(new Error("Invalid image file"));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read image file"));
      reader.readAsDataURL(file);
    });
  }

  async function fromFile(file, index = 0) {
    return normalizeEntry({
      id: createId("prompt-image"),
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      dataUrl: await readFile(file)
    }, index);
  }

  function filesFromTransfer(dataTransfer) {
    if (!dataTransfer) return [];
    const files = Array.from(dataTransfer.files || []).filter((file) => file && String(file.type || "").startsWith("image/"));
    if (files.length) return files;
    return Array.from(dataTransfer.items || [])
      .filter((item) => item?.kind === "file" && String(item.type || "").startsWith("image/"))
      .map((item) => item.getAsFile?.())
      .filter(Boolean);
  }

  return Object.freeze({ normalize, normalizeEntry, hasImages, hasContent, timeoutMs, fromFile, filesFromTransfer });
}
