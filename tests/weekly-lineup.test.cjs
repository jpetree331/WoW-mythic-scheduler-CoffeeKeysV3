const test = require("node:test");
const assert = require("node:assert/strict");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { withDb, input, member, loadTS } = require("./helpers.cjs");
const { weeklySeats, findOverlaps, isFullGroup } = loadTS(
  "services/matchingService.ts",
);
const OverlapSlots = loadTS("components/OverlapSlots.tsx").default;

test("weekly cards explain why a person's DPS alt cannot fill a second seat", () =>
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
    assert.equal(seats.filter((s) => s.playerId !== null).length, 1);
    assert.equal(seats.filter((s) => s.role === "DPS" && s.playerId).length, 0);
    assert.equal(isFullGroup(match), false);
    const html = renderToStaticMarkup(createElement(OverlapSlots, { players }));
    assert.match(html, /1\/5 filled/);
    assert.match(html, /Needs healer \+ 3 DPS/);
    assert.match(html, /Test tank/);
    assert.match(html, /Test DPS/);
    assert.match(
      html.replace(/<[^>]*>/g, ""),
      /Test DPS — alternate to Test tank; same player/,
    );
    assert.equal((html.match(/is-filled/g) || []).length, 1);
  }));

test("five alts of one person cannot pass the complete-group filter", () => {
  const players = ["Tank", "Healer", "DPS", "DPS", "DPS"].map((role, i) => ({
    id: String(i),
    memberId: "shared-edit-access",
    roles: [role],
  }));
  assert.equal(isFullGroup({ players }), false);
  assert.equal(weeklySeats(players).filter((s) => s.playerId).length, 1);
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
  assert.equal(seats.filter((s) => s.playerId === "dps").length, 0);
  assert.equal(isFullGroup({ players: [flexible, dps] }), false);
});

test("another tank lets the matcher switch to a DPS alt and complete the group", () => {
  const players = [
    { id: "a-tank", name: "Main tank", memberId: "one", roles: ["Tank"] },
    { id: "b-dps", name: "DPS alt", memberId: "one", roles: ["DPS"] },
    { id: "c-tank", name: "Other tank", memberId: "two", roles: ["Tank"] },
    { id: "heal", name: "Healer", memberId: "three", roles: ["Healer"] },
    { id: "dps2", name: "Second DPS", memberId: "four", roles: ["DPS"] },
    { id: "dps3", name: "Third DPS", memberId: "five", roles: ["DPS"] },
  ];
  const seats = weeklySeats(players);
  assert.equal(seats[0].playerId, "c-tank");
  assert.ok(seats.some((s) => s.role === "DPS" && s.playerId === "b-dps"));
  assert.equal(isFullGroup({ players }), true);
  const html = renderToStaticMarkup(createElement(OverlapSlots, { players }));
  assert.match(
    html.replace(/<[^>]*>/g, ""),
    /Main tank — alternate to DPS alt; same player/,
  );
  assert.match(html, /Complete group/);
  // Without the other tank, use the tank main instead of their DPS alt.
  const partial = weeklySeats(players.filter((p) => p.id !== "c-tank"));
  assert.equal(partial[0].playerId, "a-tank");
  assert.equal(partial.filter((s) => s.playerId).length, 4);
});

test("an unselected different person is shown as available, not as an alt", () => {
  const players = ["a", "b", "c", "d"].map((id) => ({
    id,
    name: `DPS ${id}`,
    roles: ["DPS"],
  }));
  const html = renderToStaticMarkup(createElement(OverlapSlots, { players }));
  assert.match(html, /available; not in this lineup/);
  assert.doesNotMatch(html, /same player/);
});
