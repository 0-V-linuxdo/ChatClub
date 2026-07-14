// Compatibility facade. Pure config behavior is separated from browser I/O so
// tests and non-extension consumers can import storage-schema.js directly.
export * from "./storage-schema.js";
export * from "./storage-adapter.js";
