// Firefox/Zen use this document-background entry. A static dependency makes
// listener registration part of module evaluation, so primed events cannot
// arrive before the shared background is ready.
import "./service-worker.js";
