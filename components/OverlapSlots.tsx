import { Role, type Player } from "../types";
import { weeklySeats } from "../services/matchingService";
import { PlayerName } from "./RoleText";

const labels = {
  [Role.TANK]: "Tank",
  [Role.HEALER]: "Heal",
  [Role.DPS]: "DPS",
};

export default function OverlapSlots({ players }: { players: Player[] }) {
  const seats = weeklySeats(players);
  const filled = seats.filter((s) => s.playerId !== null).length;
  const selectedIds = new Set(seats.map((s) => s.playerId));
  const selectedMembers = new Map(
    players
      .filter((p) => selectedIds.has(p.id))
      .map((p) => [p.memberId || p.id, p]),
  );
  const unselected = players.filter((p) => !selectedIds.has(p.id));
  const needs = [Role.TANK, Role.HEALER, Role.DPS].flatMap((role) => {
    const count = seats.filter(
      (s) => s.role === role && s.playerId === null,
    ).length;
    if (!count) return [];
    return [
      role === Role.DPS
        ? `${count} DPS`
        : role === Role.HEALER
          ? "healer"
          : "tank",
    ];
  });
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold">
          Suggested lineup · {filled}/5 filled
        </p>
        <span className={`overlap-status ${filled === 5 ? "is-complete" : ""}`}>
          {filled === 5 ? "✓ Complete group" : `Needs ${needs.join(" + ")}`}
        </span>
      </div>
      <ol className="overlap-slots" aria-label="Suggested five-person group">
        {seats.map((seat, index) => {
          const player = players.find((p) => p.id === seat.playerId);
          const label =
            labels[seat.role] + (seat.role === Role.DPS ? ` ${index - 1}` : "");
          return (
            <li
              key={index}
              className={`overlap-slot ${player ? "is-filled" : "is-open"}`}
              data-role={seat.role}
            >
              <span className="overlap-slot-role">{label}</span>
              <span className="overlap-slot-state">
                {player ? "✓ Filled" : "+ Open"}
              </span>
              <span className="overlap-slot-name">
                {player ? (
                  <PlayerName player={player} role={seat.role} />
                ) : (
                  "Needed"
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {unselected.length > 0 && (
        <ul
          className="mt-3 space-y-2 text-sm text-slate-300"
          aria-label="Other available characters"
        >
          {unselected.map((player) => {
            const selected = selectedMembers.get(player.memberId || player.id);
            return (
              <li key={player.id} className="break-words">
                <PlayerName player={player} />
                {selected ? (
                  <>
                    {" "}
                    — alternate to <PlayerName player={selected} />; same player
                  </>
                ) : (
                  " — available; not in this lineup"
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
