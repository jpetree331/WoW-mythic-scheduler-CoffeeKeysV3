const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTS } = require("./helpers.cjs");
test("visible pages refresh on polling, focus and reconnect without a persistent stream", () => {
  const before = {
    window: global.window,
    document: global.document,
    EventSource: global.EventSource,
  };
  const listeners = new Map();
  let poll;
  let refreshes = 0;
  global.window = {
    location: { search: "?board=audit" },
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
    setInterval(callback, delay) {
      assert.equal(delay, 30000);
      poll = callback;
      return 0;
    },
  };
  global.document = {
    hidden: false,
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
  };
  global.EventSource = class {
    constructor() {
      assert.fail("Polling must not create an EventSource");
    }
  };
  try {
    const api = loadTS("services/api.ts");
    const stop = api.subscribeToUpdates(() => refreshes++);
    poll();
    listeners.get("focus")();
    listeners.get("online")();
    assert.equal(refreshes, 3);
    global.document.hidden = true;
    poll();
    assert.equal(refreshes, 3);
    global.document.hidden = false;
    listeners.get("visibilitychange")();
    assert.equal(refreshes, 4);
    stop();
    assert.equal(listeners.size, 0);
  } finally {
    Object.assign(global, before);
  }
});
test("calendar export is escaped, UTF-8 folded, dated and has a stable UID", () => {
  const { calendarFile } = loadTS("services/exports.ts");
  const event = {
    id: "event-123",
    title: "My keys; " + "é".repeat(90) + "\nInjected",
    startsAt: "2026-09-12T16:00:00Z",
    duration: 120,
  };
  const result = calendarFile(event);
  assert.match(result, /UID:event-123@coffee-keys/);
  assert.match(result, /DTEND:20260912T180000Z/);
  assert.ok(result.includes("\\;"));
  assert.ok(result.includes("\\nInjected"));
  assert.ok(
    result.split("\r\n").every((line) => Buffer.byteLength(line) <= 75),
  );
});
test("weekly role matching never gives two alts of one member separate seats", () => {
  const { seatPlayers } = require("../shared/groups.js");
  const p = [
    { id: "a", memberId: "same", roles: ["Tank"] },
    { id: "b", memberId: "same", roles: ["Healer"] },
    ...["1", "2", "3"].map((id) => ({ id, roles: ["DPS"] })),
  ];
  assert.equal(seatPlayers(p, ["Tank", "Healer", "DPS", "DPS", "DPS"]), null);
});
