const test = require("node:test");
const assert = require("node:assert/strict");
const {
  withDb,
  seed,
  input,
  eventInput,
  member,
  admin,
} = require("./helpers.cjs");
const { planGroups } = require("../shared/groups.js");
const { parameters } = require("../server/postgres.cjs");
const { testDatabase } = require("./database.cjs");
const pgTest = (name, fn) =>
  test(name, { skip: !process.env.TEST_DATABASE_URL }, async () => {
    const db = await testDatabase();
    try {
      return await fn(db);
    } finally {
      await db.close();
    }
  });

test("PostgreSQL binding keeps quoted question marks and all user input separate", () => {
  const value = "'; DROP TABLE v3_players; -- ?";
  assert.deepEqual(
    parameters("SELECT '?' literal, ? value, 'it''s ?' another", [value]),
    {
      text: "SELECT '?' literal, $1 value, 'it''s ?' another",
      values: [value],
    },
  );
  assert.throws(() => parameters("SELECT ?", []), /parameter count/);
});

pgTest(
  "PostgreSQL cold starts serialize schema creation across independent pools",
  async (db) => {
    const other = db.forkTestInstance();
    await Promise.all([other.ready(), db.ready()]);
    assert.equal((await other.snapshot("audit", admin)).players.length, 0);
    const versions = await db.transaction(
      (tx) => tx.execute("SELECT version FROM v3_schema"),
      "read",
    );
    assert.deepEqual(versions.rows, [{ version: 1 }]);
  },
);

pgTest(
  "PostgreSQL independent instances reject stale signup, edit and publication races",
  async (db) => {
    const other = db.forkTestInstance();
    const { event, players, revision } = await seed(db);
    await other.ready();
    const groups = planGroups(players, "2-5");
    const results = await Promise.allSettled([
      db.publish("audit", event.id, { revision, groups }),
      other.signup(
        "audit",
        event.id,
        { playerId: players[0].id, cancel: true, revision },
        players[0].actor,
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      results.filter((r) => r.status === "rejected" && r.reason.status === 409)
        .length,
      1,
    );
    const edits = await Promise.allSettled([
      db.savePlayer(
        "audit",
        players[1].id,
        { notes: "first", version: 0 },
        players[1].actor,
      ),
      other.savePlayer(
        "audit",
        players[1].id,
        { notes: "second", version: 0 },
        players[1].actor,
      ),
    ]);
    assert.equal(edits.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      edits.filter((r) => r.status === "rejected" && r.reason.status === 409)
        .length,
      1,
    );
    const data = input();
    const [a, b] = await Promise.all([
      db.savePlayer("audit", null, data, member(99)),
      other.savePlayer("audit", null, data, member(99)),
    ]);
    assert.equal(a.id, b.id);
  },
);

pgTest(
  "PostgreSQL statement failure rolls back groups, history and revision",
  async (db) => {
    const { event, players, revision } = await seed(db);
    const groups = planGroups(players, "2-5");
    await db.publish("audit", event.id, { revision, groups });
    const history = () =>
      db.transaction(
        (tx) => tx.execute("SELECT count(*) n FROM v3_history"),
        "read",
      );
    const before = (await history()).rows[0].n;
    await db.testPool.query(
      `CREATE FUNCTION ${db.testSchema}.reject_assignment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected insert failure'; END $$`,
    );
    await db.testPool.query(
      `CREATE TRIGGER reject_assignment BEFORE INSERT ON ${db.testSchema}.v3_assignments FOR EACH ROW EXECUTE FUNCTION ${db.testSchema}.reject_assignment()`,
    );
    await assert.rejects(
      db.publish("audit", event.id, { revision: revision + 1, groups }),
      /injected insert failure/,
    );
    const state = await db.snapshot("audit", admin);
    assert.equal(state.events[0].groups[0].seats.length, 5);
    assert.equal(state.events[0].revision, revision + 1);
    assert.equal((await history()).rows[0].n, before);
  },
);

pgTest(
  "PostgreSQL consistent read snapshots survive concurrent commits",
  async (db) => {
    const other = db.forkTestInstance();
    await other.ready();
    await db.transaction(async (tx) => {
      const before = await tx.execute("SELECT count(*) n FROM v3_events");
      await other.createEvent("audit", eventInput());
      const after = await tx.execute("SELECT count(*) n FROM v3_events");
      assert.equal(after.rows[0].n, before.rows[0].n);
    }, "read");
    assert.equal((await db.snapshot("audit", admin)).events.length, 1);
  },
);

pgTest(
  "PostgreSQL rate limits are shared across pools and retain no raw IP",
  async (db) => {
    const other = db.forkTestInstance();
    await other.ready();
    const accepted = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? db : other).consumeRateLimit("192.0.2.1", 5),
      ),
    );
    assert.equal(accepted.filter(Boolean).length, 5);
    assert.equal(await db.consumeRateLimit("192.0.2.2", 5), true);
    const rows = await db.transaction(
      (tx) => tx.execute("SELECT * FROM v3_rate_limits"),
      "read",
    );
    assert.ok(!JSON.stringify(rows.rows).includes("192.0.2."));
  },
);
