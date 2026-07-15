// The browser-visible Service Worker entry is intentionally listener-only.
// Keep trusted input a top-level static dependency: Chromium extension Service
// Workers do not support dynamic module loading.
import "./trusted-input.js";
import "./runtime.js";
