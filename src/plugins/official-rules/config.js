// Release configuration for official rules (v2 06 §9.2). ChatClub 2.0 has not published a rules channel yet:
// the product owner fills in the channel address and the two public keys (JWK, with `kid`) before a release.
// While CHANNEL_URL is empty the extension never goes online for rules and keeps its built-in data.

export const CHANNEL_URL = "";
export const KEYS = {
  current: null,
  recovery: null,
};
