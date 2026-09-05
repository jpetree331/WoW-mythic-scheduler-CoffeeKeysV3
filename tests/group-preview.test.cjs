const test = require("node:test");
const assert = require("node:assert/strict");
const { previewSeats, seatPlayers } = require("../shared/groups.js");
const roles = ["Tank", "Healer", "DPS", "DPS", "DPS"];
const person = (id, roles, memberId) => ({ id, roles, memberId });

test("partial lineup shows tank and one DPS with healer and two DPS open", () => {
  const slots = previewSeats(
    [person("tank", ["Tank"]), person("dps", ["DPS"])],
    roles,
  );
  assert.equal(slots[0].playerId, "tank");
  assert.equal(slots[1].playerId, null);
  assert.equal(slots.filter((s) => s.role === "DPS" && s.playerId).length, 1);
  assert.equal(slots.filter((s) => s.role === "DPS" && !s.playerId).length, 2);
});
test("missing tank does not hide a healer and three available DPS", () => {
  const slots = previewSeats(
    [
      person("heal", ["Healer"]),
      ...[1, 2, 3].map((n) => person(`dps${n}`, ["DPS"])),
    ],
    roles,
  );
  assert.equal(slots[0].playerId, null);
  assert.equal(slots.filter((s) => s.playerId).length, 4);
});
test("flexible roles move to open seats and complete status matches the full-group matcher", () => {
  const people = [
    person("flex", ["Tank", "Healer"]),
    person("tank", ["Tank"]),
    ...[1, 2, 3].map((n) => person(`dps${n}`, ["DPS"])),
  ];
  const slots = previewSeats(people, roles);
  assert.equal(slots[0].playerId, "tank");
  assert.equal(slots[1].playerId, "flex");
  assert.deepEqual(slots, seatPlayers(people, roles));
});
test("partial lineup never duplicates a flexible member or their alts", () => {
  const people = [
    person("a", ["Tank", "DPS"], "same"),
    person("b", ["Healer"], "same"),
    person("c", ["DPS"], "other"),
  ];
  const slots = previewSeats([...people, people[0]], roles);
  const filled = slots.filter((s) => s.playerId);
  assert.equal(filled.length, 2);
  assert.equal(
    new Set(filled.map((s) => people.find((p) => p.id === s.playerId).memberId))
      .size,
    2,
  );
  assert.equal(seatPlayers(people, roles), null);
});
