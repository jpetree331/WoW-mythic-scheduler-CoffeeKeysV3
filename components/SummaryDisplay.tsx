import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { Role, type Player } from "../types";
import {
  findOverlaps,
  formatTime,
  isFullGroup,
} from "../services/matchingService";
import { seatPlayers } from "../shared/groups.js";
export default function SummaryDisplay({ players }: { players: Player[] }) {
  const [week, setWeek] = useState(
    DateTime.now().setZone("America/New_York").startOf("week").toISODate()!,
  );
  const [minimum, setMinimum] = useState(60),
    [fullOnly, setFullOnly] = useState(false);
  const matches = useMemo(
    () =>
      findOverlaps(players, week).filter(
        (m) => m.end - m.start >= minimum && (!fullOnly || isFullGroup(m)),
      ),
    [players, week, minimum, fullOnly],
  );
  return (
    <section className="panel">
      <h2 className="text-xl text-amber-300 font-bold">
        Weekly overlap finder
      </h2>
      <p className="muted mt-2">
        Explore shared availability for the selected week. Times below are
        Eastern; event cards show your local time. These suggestions do not
        reserve players. Slots with ambiguous or nonexistent clock-change
        endpoints are skipped; use a dated event for those times.
      </p>
      <div className="grid sm:grid-cols-3 gap-3 my-5">
        <div>
          <label htmlFor="reference-week" className="label">
            Week containing
          </label>
          <input
            id="reference-week"
            className="field"
            type="date"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="minimum-overlap" className="label">
            Minimum shared time
          </label>
          <select
            id="minimum-overlap"
            className="field"
            value={minimum}
            onChange={(e) => setMinimum(Number(e.target.value))}
          >
            {[30, 60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 self-end py-3">
          <input
            type="checkbox"
            checked={fullOnly}
            onChange={(e) => setFullOnly(e.target.checked)}
          />
          Ready groups only
        </label>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {matches.map((m) => {
          const group = seatPlayers(m.players, [
            Role.TANK,
            Role.HEALER,
            Role.DPS,
            Role.DPS,
            Role.DPS,
          ]);
          return (
            <article
              key={`${m.day}-${m.start}`}
              className="rounded-lg border border-slate-600 p-4"
            >
              <h3 className="font-semibold">
                {m.day} · {formatTime(m.start)}–
                {m.end === 1440 ? "Midnight" : formatTime(m.end)} ET
              </h3>
              <p className="muted mt-1">
                {m.players.length} available characters ·{" "}
                {group ? "A full group is possible" : "More roles needed"}
              </p>
              {group && (
                <ul className="my-2 text-sm">
                  {group.map((s) => (
                    <li key={s.playerId}>
                      {s.role}:{" "}
                      {m.players.find((p) => p.id === s.playerId)?.name}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-sm text-slate-300 mt-2">
                Available: {m.players.map((p) => p.name).join(", ")}
              </p>
            </article>
          );
        })}
      </div>
      {!matches.length && (
        <p className="muted">
          No shared time meets these filters yet. Add weekly availability to
          your character or lower the minimum duration.
        </p>
      )}
    </section>
  );
}
