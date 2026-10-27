// Style registry (spec §12.1). All plugin styles live in one container inside <head>.

const CONTAINER_ID = "chatclub-plugin-styles";

export class StyleRegistry {
  constructor(doc = globalThis.document) {
    this.doc = doc;
    this.styles = new Map(); // id -> { css, enabled }
    this.waiting = false;
  }

  _container() {
    const doc = this.doc;
    if (!doc) return null;
    if (!doc.head) {
      if (!this.waiting) {
        this.waiting = true;
        doc.addEventListener("DOMContentLoaded", () => {
          this.waiting = false;
          this._restoreAll();
        }, { once: true });
      }
      return null;
    }
    let container = doc.getElementById(CONTAINER_ID);
    if (!container || !container.isConnected) {
      container = doc.createElement("div");
      container.id = CONTAINER_ID;
      container.hidden = true;
      doc.head.appendChild(container);
      // A new container means previous <style> nodes are gone; re-create them.
      for (const [id, entry] of this.styles) this._writeNode(container, id, entry);
    }
    return container;
  }

  _restoreAll() {
    this._container();
  }

  _findNode(container, id) {
    for (const node of container.children) {
      if (node.dataset.chatclubStyle === id) return node;
    }
    return null;
  }

  _writeNode(container, id, entry) {
    let node = this._findNode(container, id);
    if (!node) {
      node = this.doc.createElement("style");
      node.dataset.chatclubStyle = id;
      container.appendChild(node);
    }
    if (node.textContent !== entry.css) node.textContent = entry.css;
    node.disabled = !entry.enabled;
    // `disabled` on <style> only takes effect once the sheet exists.
    if (node.sheet) node.sheet.disabled = !entry.enabled;
    return node;
  }

  register(id, css, { enabled = true } = {}) {
    const existing = this.styles.get(id);
    const entry = { css: String(css ?? ""), enabled: existing ? existing.enabled : enabled };
    if (existing && existing.css === entry.css) {
      this._container();
      return;
    }
    this.styles.set(id, entry);
    const container = this._container();
    if (container) this._writeNode(container, id, entry);
  }

  has(id) {
    return this.styles.has(id);
  }

  isEnabled(id) {
    return this.styles.get(id)?.enabled === true;
  }

  _setEnabled(id, enabled) {
    const entry = this.styles.get(id);
    if (!entry) return false;
    entry.enabled = enabled;
    const container = this._container();
    if (container) this._writeNode(container, id, entry);
    return true;
  }

  enable(id) {
    return this._setEnabled(id, true);
  }

  disable(id) {
    return this._setEnabled(id, false);
  }

  unregister(id) {
    if (!this.styles.delete(id)) return false;
    const container = this.doc?.getElementById(CONTAINER_ID);
    const node = container && this._findNode(container, id);
    node?.remove();
    return true;
  }
}
