#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { createNotionAttachmentInspector } = await import("../content-src/preload/notion-attachments.js");
  const scope = { nodeType: 1, parentElement: null };
  globalThis.document = { body: scope };
  const current = { element: null };
  const element = (testId, attributes = {}) => ({
    nodeType: 1,
    tagName: attributes.tagName || "BUTTON",
    parentElement: scope,
    innerText: attributes.innerText || "",
    textContent: attributes.textContent || "",
    getAttribute(name) {
      if (name === "data-testid") return testId;
      return attributes[name] || "";
    }
  });
  const inspector = createNotionAttachmentInspector({
    normalize: (value) => String(value || "").trim(),
    findNotionComposerContainer: () => scope,
    editorScope: () => scope,
    rectOf: () => ({ left: 0, top: 0, width: 40, height: 40 }),
    queryAll: () => [],
    visible: () => true,
    collectOpenShadowElements: () => current.element ? [current.element] : []
  });

  current.element = element("upload-file", { "aria-label": "Upload file" });
  assert.equal(
    inspector.hasNotionUploadInProgress(scope),
    false,
    "a permanent Notion upload control must not be treated as active upload work"
  );

  current.element = element("uploading-file", { "aria-label": "Uploading file" });
  assert.equal(
    inspector.hasNotionUploadInProgress(scope),
    true,
    "an explicit Notion uploading state must remain busy"
  );

  current.element = element("file-progress", { role: "progressbar", "aria-label": "File upload progress" });
  assert.equal(
    inspector.hasNotionUploadInProgress(scope),
    true,
    "an upload progressbar must remain busy"
  );

  console.log("Notion send attachment and upload safety: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
