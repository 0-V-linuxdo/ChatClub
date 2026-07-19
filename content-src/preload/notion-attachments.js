export function createNotionAttachmentInspector(deps = {}) {
  const {
    normalize,
    findNotionComposerContainer,
    editorScope,
    rectOf,
    queryAll,
    visible,
    collectOpenShadowElements
  } = deps;
  const getElementText = (element) => normalize(element?.innerText || element?.textContent || "");
  const getElementSearchText = (element) => normalize([
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("title"),
    element?.getAttribute?.("alt"),
    element?.getAttribute?.("data-testid"),
    element?.getAttribute?.("data-test-id"),
    element?.getAttribute?.("class"),
    element?.innerText,
    element?.textContent
  ].filter(Boolean).join(" "));
  const getNotionAttachmentScope = (editor) => findNotionComposerContainer(editor) || editorScope(editor) || document.body || document;
  const isLikelyNotionAttachmentPreviewElement = (element) => {
    if (!element) return false;
    const dataTestId = String(element.getAttribute?.("data-testid") || element.getAttribute?.("data-test-id") || "").toLowerCase();
    const className = String(element.getAttribute?.("class") || "").toLowerCase();
    return dataTestId.includes("attachment")
      || dataTestId.includes("file-preview")
      || dataTestId.includes("upload-preview")
      || className.includes("attachment")
      || className.includes("file-preview")
      || className.includes("upload-preview")
      || className.includes("image-preview");
  };
  const isLikelyNotionAttachmentImage = (element) => {
    if (!element || String(element.tagName || "").toLowerCase() !== "img") return false;
    const src = String(element.getAttribute?.("src") || "").trim();
    if (!src) return false;
    if (/^blob:|^data:image\//i.test(src)) return true;
    if (!/^(?:https?:)?\/\//i.test(src)) return false;
    const rect = rectOf(element);
    if (!rect) return false;
    const minSide = Math.min(rect.width, rect.height);
    const maxSide = Math.max(rect.width, rect.height);
    if (minSide < 32 || maxSide > 360 || rect.width * rect.height < 1200) return false;
    const label = getElementSearchText(element).toLowerCase();
    if (/\b(?:avatar|favicon|logo|icon)\b/.test(label) && maxSide <= 72) return false;
    return true;
  };
  const isNotionAttachmentActionElement = (element) => {
    if (!element) return false;
    const tag = String(element.tagName || "").toLowerCase();
    const role = String(element.getAttribute?.("role") || "").toLowerCase();
    const isActionElement = tag === "button" || role === "button";
    const haystack = getElementSearchText(element).toLowerCase();
    if (/(?:移除|删除|取消|关闭)/.test(haystack)) return true;
    if (haystack.includes("remove attachment") || haystack.includes("remove file") || haystack.includes("remove image")) return true;
    if (haystack.includes("delete attachment") || haystack.includes("delete file") || haystack.includes("delete image")) return true;
    if (haystack.includes("dismiss attachment") || haystack.includes("dismiss file") || haystack.includes("dismiss image")) return true;
    if (haystack.includes("cancel upload") || haystack.includes("remove upload") || haystack.includes("delete upload")) return true;
    if (!isActionElement) return false;
    return /\b(?:remove|delete|dismiss|cancel|close)\b/.test(haystack)
      && /\b(?:attachment|file|image|upload|preview)\b/.test(haystack);
  };
  const isLikelyNotionAttachmentCard = (element, scope) => {
    if (!element || element === scope || element === document || element === document.body || !visible(element)) return false;
    const images = queryAll(element, "img").filter(isLikelyNotionAttachmentImage);
    if (isLikelyNotionAttachmentPreviewElement(element)) return images.length <= 1;
    const rect = rectOf(element);
    if (!rect || rect.width > 520 || rect.height > 320) return false;
    if (images.length !== 1) return false;
    const actions = queryAll(element, "button,[role='button']").filter(isNotionAttachmentActionElement);
    if (actions.length > 0) return true;
    return Math.min(rect.width, rect.height) >= 36 && Math.max(rect.width, rect.height) <= 380;
  };
  const findNotionAttachmentCardElement = (element, scope) => {
    if (!element) return null;
    let node = element;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 8) {
      if (isLikelyNotionAttachmentCard(node, scope)) return node;
      if (node === scope || node === document.body) break;
      node = node.parentElement;
      depth += 1;
    }
    return isLikelyNotionAttachmentImage(element) ? element : null;
  };
  const isNotionAttachmentMarker = (element) => {
    if (!element || !visible(element)) return false;
    const tag = String(element.tagName || "").toLowerCase();
    if (tag === "img") return isLikelyNotionAttachmentImage(element);
    if (isNotionAttachmentActionElement(element)) return true;
    if (isLikelyNotionAttachmentPreviewElement(element)) return true;
    return false;
  };
  const attachmentSnapshot = (editor) => {
    const scope = getNotionAttachmentScope(editor);
    const selector = [
      "img",
      "img[src^='blob:']",
      "img[src^='data:image/']",
      "[data-testid*='attachment' i]",
      "[data-testid*='file-preview' i]",
      "[data-testid*='upload-preview' i]",
      "[data-test-id*='attachment' i]",
      "[data-test-id*='file-preview' i]",
      "[data-test-id*='upload-preview' i]",
      "[class*='attachment' i]",
      "[class*='file-preview' i]",
      "[class*='upload-preview' i]",
      "[class*='image-preview' i]",
      "button[aria-label*='remove attachment' i]",
      "button[aria-label*='remove file' i]",
      "button[aria-label*='remove image' i]",
      "button[aria-label*='delete attachment' i]",
      "button[aria-label*='delete file' i]",
      "button[aria-label*='delete image' i]",
      "button[aria-label*='dismiss' i]",
      "button[aria-label*='cancel upload' i]",
      "button[aria-label*='close' i]",
      "button[title*='remove attachment' i]",
      "button[title*='remove file' i]",
      "button[title*='remove image' i]",
      "button[title*='delete attachment' i]",
      "button[title*='delete file' i]",
      "button[title*='delete image' i]",
      "button[title*='dismiss' i]",
      "button[title*='cancel upload' i]",
      "button[title*='close' i]",
      "[role='button'][aria-label*='remove attachment' i]",
      "[role='button'][aria-label*='remove file' i]",
      "[role='button'][aria-label*='remove image' i]",
      "[role='button'][aria-label*='delete attachment' i]",
      "[role='button'][aria-label*='delete file' i]",
      "[role='button'][aria-label*='delete image' i]",
      "[role='button'][aria-label*='dismiss' i]",
      "[role='button'][aria-label*='cancel upload' i]",
      "[role='button'][aria-label*='close' i]",
      "button[aria-label*='移除' i]",
      "button[aria-label*='删除' i]",
      "button[aria-label*='取消' i]"
    ].join(",");
    const markers = collectOpenShadowElements(scope, selector).filter(isNotionAttachmentMarker);
    const groups = new Map();
    for (const marker of markers) {
      const card = findNotionAttachmentCardElement(marker, scope);
      const markerTag = String(marker.tagName || "").toLowerCase();
      const markerSrc = markerTag === "img" ? String(marker.getAttribute?.("src") || "").trim() : "";
      const key = card || (markerSrc ? `img:${markerSrc}` : marker);
      const existing = groups.get(key) || {
        root: card || marker,
        elements: [],
        hasImage: false,
        hasRemove: false,
        hasPreview: false
      };
      existing.elements.push(marker);
      if (isLikelyNotionAttachmentImage(marker)) existing.hasImage = true;
      if (isNotionAttachmentActionElement(marker)) existing.hasRemove = true;
      if (isLikelyNotionAttachmentPreviewElement(marker)) existing.hasPreview = true;
      if (card && card !== marker) {
        if (!existing.hasImage && queryAll(card, "img").some(isLikelyNotionAttachmentImage)) existing.hasImage = true;
        if (!existing.hasRemove && queryAll(card, "button,[role='button']").some(isNotionAttachmentActionElement)) existing.hasRemove = true;
        if (!existing.hasPreview && isLikelyNotionAttachmentPreviewElement(card)) existing.hasPreview = true;
      }
      groups.set(key, existing);
    }
    const unique = Array.from(groups.values());
    const imageCount = unique.filter((group) => group.hasImage).length;
    const removeCount = unique.filter((group) => group.hasRemove).length;
    const previewCount = unique.length;
    const attachmentCount = Math.max(imageCount, removeCount, previewCount);
    const fingerprint = unique.slice(0, 12).map((group) => {
      const root = group.root || group.elements[0] || null;
      const image = group.elements.find(isLikelyNotionAttachmentImage)
        || (root ? queryAll(root, "img").find(isLikelyNotionAttachmentImage) : null);
      const rect = rectOf(root);
      return [
        String(root?.tagName || "").toLowerCase(),
        String(root?.getAttribute?.("data-testid") || root?.getAttribute?.("data-test-id") || ""),
        String(root?.getAttribute?.("aria-label") || ""),
        String(image?.getAttribute?.("src") || "").slice(0, 80),
        getElementText(root).slice(0, 80),
        rect ? `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}` : ""
      ].join(":");
    }).join("|");
    return {
      attachmentCount,
      imageCount,
      removeCount,
      previewCount,
      fingerprint
    };
  };
  const getNotionAttachmentFingerprint = (snapshot) => snapshot
    ? `${snapshot.attachmentCount || 0};${snapshot.imageCount || 0};${snapshot.removeCount || 0};${snapshot.previewCount || 0};${snapshot.fingerprint || ""}`
    : "";
  const hasNotionAttachmentSnapshotChange = (previousSnapshot, nextSnapshot) => {
    const previousCount = Number(previousSnapshot?.attachmentCount || 0);
    const nextCount = Number(nextSnapshot?.attachmentCount || 0);
    if (nextCount > previousCount) return true;
    if (Number(nextSnapshot?.imageCount || 0) > Number(previousSnapshot?.imageCount || 0)) return true;
    if (Number(nextSnapshot?.removeCount || 0) > Number(previousSnapshot?.removeCount || 0)) return true;
    if (Number(nextSnapshot?.previewCount || 0) > Number(previousSnapshot?.previewCount || 0)) return true;
    return nextCount > 0 && getNotionAttachmentFingerprint(nextSnapshot) !== getNotionAttachmentFingerprint(previousSnapshot);
  };
  const hasNotionUploadInProgress = (editor) => {
    const scope = getNotionAttachmentScope(editor);
    const selector = [
      "[aria-busy='true']",
      "[role='progressbar']",
      "progress",
      "[data-testid*='uploading' i]",
      "[data-testid*='upload' i]",
      "[data-test-id*='uploading' i]",
      "[data-test-id*='upload' i]",
      "[class*='uploading' i]",
      "[class*='spinner' i]",
      "[class*='loading' i]"
    ].join(",");
    return collectOpenShadowElements(scope, selector).some((element) => {
      if (!element || !visible(element)) return false;
      if (findNotionAttachmentCardElement(element, scope)) return true;
      if (isLikelyNotionAttachmentPreviewElement(element)) return true;
      const tag = String(element.tagName || "").toLowerCase();
      const role = String(element.getAttribute?.("role") || "").toLowerCase();
      const ariaBusy = String(element.getAttribute?.("aria-busy") || "").toLowerCase() === "true";
      const haystack = getElementSearchText(element).toLowerCase();
      const uploadContext = /\b(?:upload|uploading|attachment|file-preview|upload-preview|file|image|preview)\b/.test(haystack)
        || /上传|附件|图片|图像|文件|预览/.test(haystack);
      if (uploadContext) return true;
      if (!(ariaBusy || role === "progressbar" || tag === "progress")) return false;
      let node = element.parentElement || null;
      for (let depth = 0; node && depth < 4; depth += 1) {
        if (node === scope || node === document.body) break;
        if (findNotionAttachmentCardElement(node, scope) || isLikelyNotionAttachmentPreviewElement(node)) return true;
        const parentHaystack = getElementSearchText(node).toLowerCase();
        if (/\b(?:upload|uploading|attachment|file-preview|upload-preview|file|image|preview)\b/.test(parentHaystack) || /上传|附件|图片|图像|文件|预览/.test(parentHaystack)) return true;
        node = node.parentElement || null;
      }
      return false;
    });
  };
  return Object.freeze({
    attachmentSnapshot,
    findNotionAttachmentCardElement,
    getNotionAttachmentFingerprint,
    getNotionAttachmentScope,
    hasNotionAttachmentSnapshotChange,
    hasNotionUploadInProgress,
    isNotionAttachmentActionElement
  });
}
