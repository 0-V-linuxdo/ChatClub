function randomHex(cryptoApi, byteLength) {
  const bytes = new Uint8Array(byteLength);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function browserDocumentAttestationState(target, cryptoApi) {
  const key = "__CHATCLUB_BROWSER_DOCUMENT_ATTESTATION_STATE__";
  const pattern = /^legacy:[a-f0-9]{64}$/i;
  const rotate = (state) => {
    state.id = `legacy:${randomHex(cryptoApi, 32)}`;
    state.epoch = Number.isSafeInteger(state.epoch) && state.epoch > 0 && state.epoch < Number.MAX_SAFE_INTEGER
      ? state.epoch + 1
      : 1;
    state.dirty = false;
  };
  let state = target[key];
  if (state) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (
      !descriptor
      || descriptor.configurable
      || descriptor.writable
      || descriptor.value !== state
      || typeof state !== "object"
      || !pattern.test(String(state.id || ""))
      || !Number.isSafeInteger(state.epoch)
      || state.epoch <= 0
      || typeof state.dirty !== "boolean"
      || typeof state.lifecycleInstalled !== "boolean"
    ) throw new Error("Browser document attestation state is invalid");
  } else {
    state = { id: "", epoch: 0, dirty: false, lifecycleInstalled: false };
    rotate(state);
    Object.defineProperty(target, key, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: state
    });
  }
  if (!state.lifecycleInstalled) {
    state.lifecycleInstalled = true;
    target.addEventListener("pagehide", () => { state.dirty = true; }, { capture: true });
    target.addEventListener("pageshow", () => { if (state.dirty) rotate(state); }, { capture: true });
  }
  return { state, rotate };
}

// eslint-disable-next-line chatclub-realm/no-cross-realm-global -- explicit injectable DOM-global default keeps identity tests hermetic.
export function createContentDocumentIdentity(target = globalThis) {
  const cryptoApi = target.crypto || globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new Error("Secure randomness is unavailable");
  const contentDocumentId = target.__CHATCLUB_CONTENT_DOCUMENT_ID__
    || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  target.__CHATCLUB_CONTENT_DOCUMENT_ID__ = contentDocumentId;
  const secureFrameToken = target.__CHATCLUB_SECURE_FRAME_TOKEN__ || randomHex(cryptoApi, 16);
  target.__CHATCLUB_SECURE_FRAME_TOKEN__ = secureFrameToken;

  const attestation = browserDocumentAttestationState(target, cryptoApi);
  const currentBrowserDocumentAttestationId = ({ allowDirty = false } = {}) => {
    const { state, rotate } = attestation;
    if (state.dirty && !allowDirty) rotate(state);
    return String(state.id || "");
  };

  const SearchParams = target.URLSearchParams || globalThis.URLSearchParams;
  const initialFrameBindingId = (() => {
    try {
      const values = new SearchParams(String(target.name || "")).getAll("chatclub_frame_binding");
      return values.length === 1 && /^[a-f0-9]{64}$/i.test(values[0]) ? values[0] : "";
    } catch {
      return "";
    }
  })();
  const currentFrameBindingId = () => {
    const bootstrap = String(target.__CHATCLUB_FRAME_BINDING_ID__ || "");
    if (bootstrap) return /^[a-f0-9]{64}$/i.test(bootstrap) ? bootstrap : "";
    return initialFrameBindingId;
  };

  return Object.freeze({
    contentDocumentId,
    secureFrameToken,
    currentBrowserDocumentAttestationId,
    currentFrameBindingId
  });
}
