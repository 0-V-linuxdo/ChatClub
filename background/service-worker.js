// The browser-visible Service Worker entry is intentionally listener-only.
// runtime.js owns the complete static listener graph, including trusted input;
// Chromium extension Service Workers do not support dynamic module loading.
//
// Keep the release marker in the module URL. Tabbit can recreate an unpacked
// background context after a browser restart while retaining the old ESM
// module graph for the unchanged URL. Without this marker, the manifest can
// report the new version while the background still serves the previous
// request dispatcher and content-runtime identity.
import "./runtime.js?chatclub-runtime=2026.8.29.7";
