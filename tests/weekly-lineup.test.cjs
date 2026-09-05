const test = require("node:test");
const assert = require("node:assert/strict");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { withDb, input, member, loadTS } = require("./helpers.cjs");
const { weeklySeats, findOverlaps, isFullGroup } = loadTS(
  "services/matchingService.ts",
);
const OverlapSlots = loadTS("components/OverlapSlots.tsx").default;

test("weekly cards include tank and DPS created with the same edit key", () =>
  withDb(async (db) => {
    for (const [name, role] of [
      ["Test tank", "Tank"],
      ["Test DPS", "DPS"],
    ]) {
      await db.savePlayer(
        "audit",
        null,
        input({ name, roles: [role] }),
        member(1),
      );
    }
    const { players } = await db.snapshot("audit", member(1));
    assert.equal(players[0].memberId, players[1].memberId);
    const [match] = findOverlaps(players, "2026-08-31");
    const seats = weeklySeats(match.players);
    assert.equal(seats.filter((s) => s.playerId !== null).length, 2);
    assert.equal(seats.filter((s) => s.role === "DPS" && s.playerId).length, 1);
    assert.equal(isFullGroup(match), false);
    const html = renderToStaticMarkup(createElement(OverlapSlots, { players }));
    assert.match(html, /2\/5 filled/);
    assert.match(html, /Needs healer \+ 2 DPS/);
    assert.match(html, /Test tank/);
    assert.match(html, /Test DPS/);
    assert.equal((html.match(/is-filled/g) || []).length, 2);
  }));

test("weekly complete-group filter agrees with cards for shared edit access", () => {
  const players = ["Tank", "Healer", "DPS", "DPS", "DPS"].map((role, i) => ({
    id: String(i),
    memberId: "shared-edit-access",
    roles: [role],
  }));
  assert.equal(isFullGroup({ players }), true);
  assert.equal(weeklySeats(players).filter((s) => s.playerId).length, 5);
});

test("weekly suggestions still give each flexible character only one seat", () => {
  const flexible = {
    id: "flex",
    memberId: "shared",
    roles: ["Tank", "Healer", "DPS"],
  };
  const dps = { id: "dps", memberId: "shared", roles: ["DPS"] };
  const seats = weeklySeats([flexible, flexible, dps]);
  assert.equal(seats.filter((s) => s.playerId === "flex").length, 1);
  assert.equal(seats.filter((s) => s.playerId === "dps").length, 1);
  assert.equal(isFullGroup({ players: [flexible, dps] }), false);
});
