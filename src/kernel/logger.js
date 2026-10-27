// Prefixed, colored console logger used by the kernel and by every plugin (ctx.logger).

const BRAND_STYLE = "color:#6d5dfc;font-weight:600";
const LEVELS = ["debug", "info", "warn", "error"];

let sink = null;

export class Logger {
  /** Route all log output somewhere else (tests). Pass null to restore console. */
  static setSink(fn) {
    sink = typeof fn === "function" ? fn : null;
  }

  constructor(name, color = "#8a8f98") {
    this.name = String(name);
    this.color = color;
  }

  _write(level, args) {
    if (sink) {
      sink({ level, name: this.name, args });
      return;
    }
    const out = console[level] || console.log;
    out.call(console, `%c[ChatClub]%c [${this.name}]`, BRAND_STYLE, `color:${this.color};font-weight:600`, ...args);
  }
}

for (const level of LEVELS) {
  Logger.prototype[level] = function (...args) {
    this._write(level, args);
  };
}
