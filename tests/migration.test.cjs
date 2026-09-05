const test = require("node:test");
const assert = require("node:assert/strict");
const { createClient } = require("@libsql/client");
const { importV2 } = require("../server/import-v2.cjs");
const { withDb, admin, member, input } = require("./helpers.cjs");
test("V2 import preserves source bytes logically, both days and notes; old keys are invalidated", async () => {
  const source = createClient({ url: ":memory:" });
  await source.execute(
    "CREATE TABLE players(id TEXT PRIMARY KEY, board TEXT, name TEXT, role TEXT, roles TEXT, availability TEXT, timezone TEXT, coffee TEXT, client_id TEXT, notes TEXT, flex_role TEXT, flex_class TEXT)",
  );
  await source.execute({
    sql: "INSERT INTO players VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    args: [
      "legacy",
      "audit",
      "Old character",
      "Tank",
      "['Tank']",
      JSON.stringify({ Monday: [{ start: 1140, end: 1260 }] }),
      "America/New_York",
      JSON.stringify({ attendSat: true, attendSun: true, keyTier: "2-5" }),
      "formerly-public-owner",
      "Original note",
      "Healer",
      "Priest",
    ],
  });
  await source.execute({
    sql: "INSERT INTO players(id,board,name,role,availability) VALUES(?,?,?,?,?)",
    args: ["bad", "audit", "Invalid row", "DPS", '{"Monday":{}}'],
  });
  const before = JSON.stringify(
    (await source.execute("SELECT * FROM players ORDER BY id")).rows,
  );
  try {
    await withDb(async (db) => {
      const report = await importV2(source, db, "2026-09-12");
      assert.equal(report.imported, 1);
      assert.equal(report.quarantined, 1);
      assert.equal(report.events, 2);
      const state = await db.snapshot("audit", member(1));
      assert.equal(state.events.length, 2);
      assert.ok(
        state.events.every(
          (e) =>
            e.signups.length === 1 &&
            e.status === "locked" &&
            e.groups.length === 0,
        ),
      );
      assert.equal(state.players[0].canEdit, false);
      assert.equal(state.players[0].roles[0], "Tank");
      assert.match(state.players[0].notes, /Original note/);
      assert.match(state.players[0].notes, /Legacy flex role: Healer/);
      const repeated = await importV2(source, db, "2026-09-12");
      assert.equal(repeated.skipped, 1);
      assert.equal((await db.snapshot("audit", admin)).players.length, 1);
      assert.equal(
        JSON.stringify(
          (await source.execute("SELECT * FROM players ORDER BY id")).rows,
        ),
        before,
      );
    });
  } finally {
    source.close();
  }
});
test("schema initialization does not modify existing V2 tables", async () => {
  const client = createClient({ url: ":memory:" });
  await client.execute("CREATE TABLE players(id TEXT PRIMARY KEY, note TEXT)");
  await client.execute("INSERT INTO players VALUES('keep','preserve me')");
  await withDb(
    async (db) => {
      await db.savePlayer("audit", null, input(), member(1));
      assert.equal(
        (await client.execute("SELECT note FROM players")).rows[0].note,
        "preserve me",
      );
    },
    { client },
  );
});
