#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "background/grok-cookie-runtime.js"), "utf8");
const probeSource = functionSource(source, "probeMirrorRandomLoginWebSocket");
const endpoint = "wss://gk.dairoot.cn/ws/mgw/";

function probeWithSocket(Socket, overrides = {}) {
  const context = {
    WebSocket: Socket,
    crypto: { randomUUID: () => "12345678-1234-4234-8234-123456789abc" },
    location: { href: "https://gk.dairoot.cn/" },
    Promise,
    clearTimeout,
    setTimeout,
    ...overrides
  };
  context.globalThis = context;
  return vm.runInNewContext(`(${probeSource})`, context);
}

function socketFixture(eventName = "") {
  const instances = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.closeCalls = [];
      this.sendCalls = [];
      instances.push(this);
      if (eventName) queueMicrotask(() => this.emit(eventName));
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    removeEventListener(type, listener) {
      if (this.listeners.get(type) === listener) this.listeners.delete(type);
    }

    emit(type) {
      this.listeners.get(type)?.({ type });
    }

    close(code) {
      this.closeCalls.push(code);
    }

    send(value) {
      this.sendCalls.push(value);
    }
  }
  return { FakeWebSocket, instances };
}

(async () => {
  for (const [eventName, expected] of [
    ["open", "open"],
    ["error", "error"],
    ["close", "close"]
  ]) {
    const fixture = socketFixture(eventName);
    const probe = probeWithSocket(fixture.FakeWebSocket);
    assert.equal(await probe(endpoint, 150), expected);
    assert.equal(fixture.instances.length, 1);
    assert.equal(
      fixture.instances[0].url,
      `${endpoint}?uid=12345678-1234-4234-8234-123456789abc`
    );
    assert.deepEqual(fixture.instances[0].sendCalls, [], "the readiness probe must never send a frame");
    assert.deepEqual(fixture.instances[0].closeCalls, [1000]);
    assert.equal(fixture.instances[0].listeners.size, 0, "every completion path must remove listeners");
  }

  const timeoutFixture = socketFixture();
  assert.equal(await probeWithSocket(timeoutFixture.FakeWebSocket)(endpoint, 100), "timeout");
  assert.deepEqual(timeoutFixture.instances[0].sendCalls, []);
  assert.deepEqual(timeoutFixture.instances[0].closeCalls, [1000]);
  assert.equal(timeoutFixture.instances[0].listeners.size, 0);

  class ThrowingWebSocket {
    constructor() {
      throw new Error("constructor failed");
    }
  }
  assert.equal(await probeWithSocket(ThrowingWebSocket)(endpoint, 150), "unavailable");
  assert.equal(
    await probeWithSocket(socketFixture("open").FakeWebSocket, {
      location: { href: "https://gk.dairoot.cn/admin?a=2" }
    })(endpoint, 150),
    "unavailable"
  );
  assert.equal(
    await probeWithSocket(socketFixture("open").FakeWebSocket)("wss://example.com/ws", 150),
    "unavailable"
  );
  assert.equal(
    await probeWithSocket(socketFixture("open").FakeWebSocket)(endpoint, 99),
    "unavailable"
  );

  console.log("Grok Mirror WebSocket readiness probe: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
