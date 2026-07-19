// The browser-visible Service Worker entry is intentionally listener-only.
// runtime.js owns the complete static listener graph, including trusted input;
// Chromium extension Service Workers do not support dynamic module loading.
import "./runtime.js";
