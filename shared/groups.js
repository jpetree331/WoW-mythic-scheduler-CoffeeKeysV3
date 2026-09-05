import options from "./options.json" with { type: "json" };
const { ROLES, TIERS } = options;
// Augmenting paths move flexible players when another seat needs them.
function previewSeats(input, roles) {
  const people = [...new Map(input.map((p) => [p.id, p])).values()].sort(
    (a, b) => a.roles.length - b.roles.length || a.id.localeCompare(b.id),
  );
  const seats = Array(roles.length).fill(null);
  const personSeat = new Map();
  function fill(seat, visited) {
    for (const p of people) {
      const identity = p.memberId || p.id;
      if (!p.roles.includes(roles[seat]) || visited.has(identity)) continue;
      visited.add(identity);
      const previous = personSeat.get(identity);
      if (previous === undefined || fill(previous, visited)) {
        personSeat.set(identity, seat);
        seats[seat] = p;
        return true;
      }
    }
    return false;
  }
  // Keep trying later roles when a seat is empty, so an incomplete lineup still
  // shows every usable player. Each member can occupy at most one seat.
  for (let i = 0; i < roles.length; i++) fill(i, new Set());
  return seats.map((p, i) => ({ playerId: p?.id ?? null, role: roles[i] }));
}
function seatPlayers(input, roles) {
  const seats = previewSeats(input, roles);
  return seats.every((s) => s.playerId !== null) ? seats : null;
}
function planGroups(people, tier) {
  const eligible = [
    ...new Map(
      people.filter((p) => p.tier === tier).map((p) => [p.id, p]),
    ).values(),
  ];
  for (let count = Math.floor(eligible.length / 5); count > 0; count--) {
    const roles = Array.from({ length: count }, () => [
      "Tank",
      "Healer",
      "DPS",
      "DPS",
      "DPS",
    ]).flat();
    const seats = seatPlayers(eligible, roles);
    if (seats)
      return Array.from({ length: count }, (_, i) => ({
        id: `${tier}-${i + 1}`,
        tier,
        seats: seats.slice(i * 5, i * 5 + 5),
      }));
  }
  return [];
}
export { ROLES, TIERS, previewSeats, seatPlayers, planGroups };
