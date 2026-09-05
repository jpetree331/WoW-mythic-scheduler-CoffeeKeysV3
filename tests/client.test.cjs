const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTS } = require("./helpers.cjs");
test("F15: transient stream errors preserve automatic reconnection and cleanup closes", () => {
  const before = {
    window: global.window,
    document: global.document,
    EventSource: global.EventSource,
  };
  let stream;
  let statuses = [];
  let refreshes = 0;
  global.window = {
    location: { search: "?board=audit" },
    addEventListener() {},
    removeEventListener() {},
    setInterval() {
      return 0;
    },
  };
  global.document = {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };
  global.EventSource = class {
    constructor() {
      stream = this;
      this.closed = false;
    }
    addEventListener() {}
    close() {
      this.closed = true;
    }
  };
  try {
    const api = loadTS("services/api.ts");
    const stop = api.subscribeToUpdates(
      () => refreshes++,
      (connected) => statuses.push(connected),
    );
    stream.onerror();
    assert.equal(stream.closed, false);
    stream.onopen();
    assert.equal(refreshes, 1);
    assert.deepEqual(statuses, [false, true]);
    stop();
    assert.equal(stream.closed, true);
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
