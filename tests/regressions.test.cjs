const test = require("node:test");
const assert = require("node:assert/strict");
const { createClient } = require("@libsql/client");
const {
  withDb,
  withServer,
  seed,
  input,
  eventInput,
  admin,
  member,
  loadTS,
} = require("./helpers.cjs");
const { planGroups, seatPlayers } = require("../shared/groups.js");
const { findOverlaps, formatTime, isFullGroup } = loadTS(
  "services/matchingService.ts",
);
const { hashKey, createDatabase } = require("../server/db.cjs");
const v = require("../server/validation.cjs");

test("prototype-named boards do not inherit organizer credentials", () =>
  withServer(async (_, url) => {
    const response = await fetch(`${url}/api/snapshot?board=constructor`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).isAdmin, false);
  }));
test("event mutation requires a revision even when it is omitted by the caller", () =>
  withDb(async (db) => {
    const event = await db.createEvent("audit", eventInput());
    await assert.rejects(db.publish("audit", event.id, { groups: [] }), {
      status: 400,
    });
  }));
test("ambiguous fall clock-change endpoints are skipped rather than overstated", () => {
  const people = [1, 2].map((i) => ({
    id: String(i),
    ...input({ availability: { Sunday: [{ start: 90, end: 150 }] } }),
  }));
  assert.deepEqual(findOverlaps(people, "2026-10-26"), []);
});

test("F01: public snapshots expose neither owner keys nor ownership hashes", () =>
  withDb(async (db) => {
    const p = await db.savePlayer("audit", null, input(), member(1));
    const data = await db.snapshot("audit", member(2));
    assert.equal(data.players[0].canEdit, false);
    assert.equal(data.players[0].isMine, false);
    assert.ok(!JSON.stringify(data).includes(member(1).hash));
    assert.equal(data.players[0].clientId, undefined);
    await assert.rejects(
      db.savePlayer("audit", p.id, { version: 0, notes: "stolen" }, member(2)),
      { status: 403 },
    );
    await assert.rejects(db.deletePlayer("audit", p.id, 0, member(2)), {
      status: 403,
    });
    assert.equal(
      (await db.snapshot("audit", member(1))).players[0].canEdit,
      true,
    );
  }));
test("F02: empty organizer configuration rejects old default passwords", () =>
  withServer(
    async (_, url) => {
      for (const token of ["", "OASISWOWCK"])
        assert.equal(
          (
            await fetch(`${url}/api/admin`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          ).status,
          401,
        );
    },
    { adminToken: "" },
  ));
test("F03: four people with flexible roles cannot fill five seats", () => {
  const people = [["Tank", "Healer"], ["DPS"], ["DPS"], ["DPS"]].map(
    (roles, i) => ({ id: String(i), roles, tier: "2-5" }),
  );
  assert.deepEqual(planGroups(people, "2-5"), []);
});
test("F03: flexible healer plus dedicated tank forms a valid group", () => {
  const people = [["Tank", "Healer"], ["Tank"], ["DPS"], ["DPS"], ["DPS"]].map(
    (roles, i) => ({ id: String(i), roles, tier: "2-5" }),
  );
  const result = planGroups(people, "2-5");
  assert.equal(result.length, 1);
  assert.equal(new Set(result[0].seats.map((s) => s.playerId)).size, 5);
  assert.equal(result[0].seats.find((s) => s.playerId === "0").role, "Healer");
});
test("F03: group planner maximizes complete groups without reuse", () => {
  const people = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    roles: ["Tank", "Healer", "DPS"],
    tier: "2-5",
  }));
  const groups = planGroups(people, "2-5");
  assert.equal(groups.length, 2);
  assert.equal(
    new Set(groups.flatMap((g) => g.seats.map((s) => s.playerId))).size,
    10,
  );
});
test("F04/F13: different dated events retain independent attendance and assignments", () =>
  withDb(async (db) => {
    const { event, players, revision } = await seed(db);
    const groups = planGroups(players, "2-5");
    await db.publish("audit", event.id, { revision, groups });
    const sunday = await db.createEvent("audit", eventInput());
    for (const [i, p] of players.entries())
      await db.signup(
        "audit",
        sunday.id,
        { playerId: p.id, tier: "2-5", revision: i },
        p.actor,
      );
    await db.publish("audit", sunday.id, { revision: 5, groups });
    await db.signup(
      "audit",
      sunday.id,
      { revision: 6, playerId: players[0].id, cancel: true },
      players[0].actor,
    );
    const state = await db.snapshot("audit", admin);
    assert.equal(
      state.events.find((e) => e.id === event.id).groups[0].seats.length,
      5,
    );
    assert.equal(
      state.events.find((e) => e.id === sunday.id).signups.length,
      4,
    );
    assert.equal(state.players[0].availability.Monday.length, 1);
  }));
test("F05: notes-only edit preserves profile and event attendance", () =>
  withDb(async (db) => {
    const { players, event } = await seed(db);
    const p = players[0];
    await db.savePlayer(
      "audit",
      p.id,
      { version: 0, notes: "Updated" },
      p.actor,
    );
    const data = await db.snapshot("audit", p.actor);
    assert.equal(data.events[0].signups.length, 5);
    assert.deepEqual(data.players.find((x) => x.id === p.id).roles, ["Tank"]);
    assert.equal(data.events.find((e) => e.id === event.id).revision, 6);
  }));
test("F05: removing a capability removes only its now-invalid assignment", () =>
  withDb(async (db) => {
    const { players, event, revision } = await seed(db);
    await db.publish("audit", event.id, {
      revision,
      groups: planGroups(players, "2-5"),
    });
    await db.savePlayer(
      "audit",
      players[0].id,
      { version: 0, roles: ["DPS"] },
      players[0].actor,
    );
    const state = await db.snapshot("audit", admin);
    assert.equal(state.events[0].groups[0].seats.length, 4);
    assert.equal(state.events[0].signups.length, 5);
  }));
test("F06: ordinary members can see their event-only character and signup", () =>
  withDb(async (db) => {
    const p = await db.savePlayer(
      "audit",
      null,
      input({ availability: {} }),
      member(1),
    );
    const e = await db.createEvent("audit", eventInput());
    await db.signup(
      "audit",
      e.id,
      { playerId: p.id, tier: "2-5", revision: 0 },
      member(1),
    );
    const state = await db.snapshot("audit", member(1));
    assert.equal(state.players[0].isMine, true);
    assert.equal(state.events[0].signups[0].playerId, p.id);
  }));
test("F07/F21: stale profile edits are rejected rather than overwriting changes", () =>
  withDb(async (db) => {
    const p = await db.savePlayer("audit", null, input(), member(1));
    await db.savePlayer(
      "audit",
      p.id,
      { notes: "first", version: 0 },
      member(1),
    );
    await assert.rejects(
      db.savePlayer("audit", p.id, { notes: "stale", version: 0 }, member(1)),
      { status: 409 },
    );
    assert.equal(
      (await db.snapshot("audit", member(1))).players[0].notes,
      "first",
    );
  }));
test("F08: invalid payloads are rejected and malformed legacy rows cannot crash matching", () => {
  for (const extra of [
    { availability: { Monday: {} } },
    { roles: ["Wizard"] },
    { timezone: "not/a/zone" },
    { availability: { Monday: [{ start: 1200, end: 1100 }] } },
    { name: " " },
  ])
    assert.throws(() => v.player(input(extra)), { status: 400 });
  assert.doesNotThrow(() =>
    findOverlaps([
      { id: "bad", roles: ["DPS"], availability: { Monday: {} } },
      { id: "good", ...input() },
    ]),
  );
});
test("F09: repeated slots never count one player more than once", () => {
  const slot = { start: 1140, end: 1260 };
  const players = [["Tank"], ["Healer"], ["DPS"]].map((roles, i) => ({
    id: String(i),
    ...input({ roles, availability: { Monday: [slot, slot, slot] } }),
  }));
  const matches = findOverlaps(players, "2026-09-07");
  assert.equal(matches[0].players.length, 3);
  assert.equal(isFullGroup(matches[0]), false);
});
test("F10: both DST transition Sundays preserve noon wall-clock availability", () => {
  for (const week of ["2026-03-02", "2026-10-26"]) {
    const p = [1, 2].map((i) => ({
      id: String(i),
      ...input({ availability: { Sunday: [{ start: 720, end: 780 }] } }),
    }));
    const m = findOverlaps(p, week);
    assert.equal(m[0].start, 720);
    assert.equal(m[0].end, 780);
  }
  assert.equal(formatTime(1440), "12:00 AM");
  assert.equal(formatTime(735), "12:15 PM");
});
test("F10: Pacific midnight conversion preserves both day segments", () => {
  const players = [
    {
      id: "a",
      ...input({
        timezone: "America/Los_Angeles",
        availability: { Monday: [{ start: 1200, end: 1320 }] },
      }),
    },
    {
      id: "b",
      ...input({
        availability: {
          Monday: [{ start: 1380, end: 1440 }],
          Tuesday: [{ start: 0, end: 60 }],
        },
      }),
    },
  ];
  assert.deepEqual(
    findOverlaps(players, "2026-09-07").map((m) => [m.day, m.start, m.end]),
    [
      ["Monday", 1380, 1440],
      ["Tuesday", 0, 60],
    ],
  );
});
test("F10: non-half-hour timezone offsets yield exact intervals", () => {
  const p = [
    {
      id: "a",
      ...input({
        timezone: "Asia/Kathmandu",
        availability: { Monday: [{ start: 720, end: 780 }] },
      }),
    },
    {
      id: "b",
      ...input({ availability: { Monday: [{ start: 120, end: 210 }] } }),
    },
  ];
  const m = findOverlaps(p, "2026-09-07");
  assert.deepEqual(
    m.map((x) => [x.start, x.end]),
    [[135, 195]],
  );
});
test("F11: failed group insert rolls back deletion and history together", async () => {
  let fail = false;
  const client = createClient({ url: ":memory:" });
  const wrapped = new Proxy(client, {
    get(target, key) {
      if (key === "transaction")
        return async (...args) => {
          const tx = await target.transaction(...args);
          return new Proxy(tx, {
            get(t, k) {
              if (k === "execute")
                return async (q) => {
                  if (
                    fail &&
                    String(q.sql || q).startsWith("INSERT INTO v3_assignments")
                  )
                    throw new Error("Injected failure");
                  return t.execute(q);
                };
              const value = t[k];
              return typeof value === "function" ? value.bind(t) : value;
            },
          });
        };
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  await withDb(
    async (db) => {
      const { event, players, revision } = await seed(db);
      const groups = planGroups(players, "2-5");
      await db.publish("audit", event.id, { revision, groups });
      fail = true;
      await assert.rejects(
        db.publish("audit", event.id, { revision: 6, groups }),
        /Injected failure/,
      );
      const s = await db.snapshot("audit", admin);
      assert.equal(s.events[0].groups[0].seats.length, 5);
      assert.equal(s.events[0].revision, 6);
    },
    { client: wrapped },
  );
});
test("F12: publishing rejects cross-board players, duplicates, wrong tiers and roles", () =>
  withDb(async (db) => {
    const { event, players, revision } = await seed(db);
    const good = planGroups(players, "2-5");
    const outsider = await db.savePlayer("other", null, input(), member(99));
    for (const change of [
      (g) => (g[0].seats[0].playerId = outsider.id),
      (g) => (g[0].seats[0].playerId = g[0].seats[1].playerId),
      (g) => (g[0].tier = "10+"),
      (g) => (g[0].seats[0].role = "DPS"),
    ]) {
      const bad = structuredClone(good);
      change(bad);
      await assert.rejects(
        db.publish("audit", event.id, { revision, groups: bad }),
        { status: 400 },
      );
    }
    assert.equal(
      (await db.snapshot("audit", admin)).events[0].revision,
      revision,
    );
  }));
test("F12: deleting a character cascades signups and assignments", () =>
  withDb(async (db) => {
    const { event, players, revision } = await seed(db);
    await db.publish("audit", event.id, {
      revision,
      groups: planGroups(players, "2-5"),
    });
    await db.deletePlayer("audit", players[0].id, 0, players[0].actor);
    const s = await db.snapshot("audit", admin);
    assert.equal(s.events[0].signups.length, 4);
    assert.equal(s.events[0].groups[0].seats.length, 4);
  }));
test("F13: archiving preserves all profiles and event signups", () =>
  withDb(async (db) => {
    const { event } = await seed(db);
    await db.setStatus("audit", event.id, "completed", 5);
    const s = await db.snapshot("audit", admin);
    assert.equal(s.players.length, 5);
    assert.equal(s.events[0].signups.length, 5);
    assert.equal(s.events[0].status, "completed");
  }));
test("F14: database errors become HTTP 503 and the server remains alive", () =>
  withServer(
    async (_, url) => {
      assert.equal((await fetch(`${url}/api/health`)).status, 503);
      assert.equal(
        (
          await fetch(`${url}/api/admin`, {
            headers: {
              Authorization: "Bearer audit-only-organizer-secret-123456",
            },
          })
        ).status,
        200,
      );
    },
    {
      db: {
        health: async () => {
          throw new Error("outage");
        },
        close() {},
      },
    },
  ));
test("F14: initialization retries after a transient first failure", async () => {
  const real = createClient({ url: ":memory:" });
  let fail = true;
  const client = new Proxy(real, {
    get(t, k) {
      if (k === "execute")
        return async (q) => {
          if (fail) {
            fail = false;
            throw new Error("first connection failed");
          }
          return t.execute(q);
        };
      if (k === "close") return () => {};
      const value = t[k];
      return typeof value === "function" ? value.bind(t) : value;
    },
  });
  const db = createDatabase({ client });
  await assert.rejects(db.ready(), /first connection/);
  await db.ready();
  await db.health();
  db.close();
  real.close();
});
test("F16: simultaneous signups remain valid and cannot silently overfill groups", () =>
  withDb(async (db) => {
    const event = await db.createEvent("audit", eventInput());
    const people = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        db.savePlayer("audit", null, input(), member(i + 1)),
      ),
    );
    const results = await Promise.allSettled(
      people.map((p, i) =>
        db.signup(
          "audit",
          event.id,
          { playerId: p.id, tier: "2-5", revision: 0 },
          member(i + 1),
        ),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      results.filter((r) => r.status === "rejected" && r.reason.status === 409)
        .length,
      5,
    );
    const state = await db.snapshot("audit", admin);
    assert.equal(state.events[0].signups.length, 1);
    assert.deepEqual(state.events[0].groups, []);
  }));
test("F16/F21: repeated creation requests are idempotent", () =>
  withDb(async (db) => {
    const data = input();
    const [a, b] = await Promise.all([
      db.savePlayer("audit", null, data, member(1)),
      db.savePlayer("audit", null, data, member(1)),
    ]);
    assert.equal(a.id, b.id);
    assert.equal((await db.snapshot("audit", admin)).players.length, 1);
  }));
test("F17: sparse stable group IDs are preserved exactly", () =>
  withDb(async (db) => {
    const { event, players, revision } = await seed(
      db,
      Array.from({ length: 10 }, () => ["Tank", "Healer", "DPS"]),
    );
    const groups = planGroups(players, "2-5");
    groups[0].id = "group-1";
    groups[1].id = "group-3";
    await db.publish("audit", event.id, { revision, groups });
    assert.deepEqual(
      (await db.snapshot("audit", admin)).events[0].groups.map((g) => g.id),
      ["group-1", "group-3"],
    );
  }));
test("one member cannot sign up multiple alts for the same event", () =>
  withDb(async (db) => {
    const a = await db.savePlayer("audit", null, input(), member(1)),
      b = await db.savePlayer("audit", null, input(), member(1)),
      event = await db.createEvent("audit", eventInput());
    await db.signup(
      "audit",
      event.id,
      { playerId: a.id, tier: "2-5", revision: 0 },
      member(1),
    );
    await db.signup(
      "audit",
      event.id,
      { playerId: b.id, tier: "2-5", revision: 1 },
      member(1),
    );
    const s = await db.snapshot("audit", admin);
    assert.equal(s.events[0].signups.length, 1);
    assert.equal(s.events[0].signups[0].playerId, b.id);
  }));
test("claims are board-scoped, single-use and attach a private owner key", () =>
  withDb(async (db) => {
    const p = await db.savePlayer("audit", null, input(), member(1));
    const { code } = await db.createClaim("audit", p.id);
    await assert.rejects(db.claim("other", code, member(2)), { status: 400 });
    await db.claim("audit", code, member(2));
    assert.equal(
      (await db.snapshot("audit", member(2))).players[0].isMine,
      true,
    );
    await assert.rejects(db.claim("audit", code, member(3)), { status: 400 });
  }));
test("F08/F14: actual HTTP malformed bodies return 400, not process failures", () =>
  withServer(async (_, url) => {
    const res = await fetch(`${url}/api/players?board=audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(res.status, 400);
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
    assert.equal((await fetch(`${url}/api/debug/schema`)).status, 404);
  }));
test("private key parsing never accepts V2 identifiers or anon", () => {
  assert.equal(hashKey("anon"), null);
  assert.equal(hashKey("OASISWOWCK"), null);
  assert.notEqual(hashKey("a".repeat(64)), "a".repeat(64));
});
