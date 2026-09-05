import { useState } from "react";
import { DateTime } from "luxon";
import {
  Role,
  type CoffeeEvent,
  type Player,
  type Group,
  type KeyTier,
} from "../types";
import { planGroups, TIERS } from "../shared/groups.js";
import { request } from "../services/api";
import { calendarFile, discordRoster } from "../services/exports";
import { PlayerName, RoleLabels, RoleText } from "./RoleText";
const seats = [Role.TANK, Role.HEALER, Role.DPS, Role.DPS, Role.DPS];

function GroupEditor({
  event,
  players,
  onPublish,
  onCancel,
}: {
  event: CoffeeEvent;
  players: Player[];
  onPublish: (groups: Group[], revision: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [revision] = useState(event.revision);
  const eligible = event.signups.flatMap((s) => {
    const p = players.find((p) => p.id === s.playerId);
    return p ? [{ ...p, tier: s.tier }] : [];
  });
  const propose = () => TIERS.flatMap((t) => planGroups(eligible, t));
  const [groups, setGroups] = useState<Group[]>(() =>
    event.groups.length
      ? event.groups.map((g) => {
          const remaining = [...g.seats];
          return {
            ...g,
            seats: seats.map((role) => {
              const i = remaining.findIndex((s) => s.role === role);
              return i >= 0
                ? remaining.splice(i, 1)[0]
                : { role, playerId: "" };
            }),
          };
        })
      : propose(),
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const used = groups
    .flatMap((g) => g.seats.map((s) => s.playerId))
    .filter(Boolean);
  const stale = revision !== event.revision;
  return (
    <div className="space-y-4 border-t border-slate-600 pt-4 mt-4">
      <h3 className="font-bold text-xl text-amber-300">
        Review group proposal
      </h3>
      <p className="muted">
        Only publishing changes the shared roster. Fill five distinct seats in
        each group. Unselected attendees remain on the waitlist.
      </p>
      {stale && (
        <p role="alert" className="error">
          The event changed while you were editing. Close this proposal and
          reopen it to review the latest signups.
        </p>
      )}
      <fieldset disabled={busy || stale} className="min-w-0 space-y-4">
        <button className="btn" onClick={() => setGroups(propose())}>
          Build new automatic proposal
        </button>
        {TIERS.map((tier) => (
          <div key={tier} className="space-y-3">
            <div className="flex flex-wrap justify-between gap-2 items-center">
              <h4 className="font-semibold">Keys {tier}</h4>
              <button
                className="btn text-sm"
                onClick={() =>
                  setGroups((g) => [
                    ...g,
                    {
                      id: crypto.randomUUID(),
                      tier,
                      seats: seats.map((role) => ({ role, playerId: "" })),
                    },
                  ])
                }
              >
                Add {tier} group
              </button>
            </div>
            {groups
              .filter((g) => g.tier === tier)
              .map((g, gi) => (
                <div
                  key={g.id}
                  className="bg-slate-900/60 p-3 rounded-lg space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p>Group {gi + 1}</p>
                    <button
                      className="btn text-sm"
                      onClick={() =>
                        setGroups((prev) => prev.filter((x) => x.id !== g.id))
                      }
                    >
                      Remove group
                    </button>
                  </div>
                  {g.seats.map((seat, si) => (
                    <div key={si}>
                      <label className="label" htmlFor={`seat-${g.id}-${si}`}>
                        <RoleText role={seat.role}>{seat.role}</RoleText>
                        {seat.role === Role.DPS ? ` ${si - 1}` : ""}
                      </label>
                      <select
                        className="field role-text"
                        data-role={seat.role}
                        id={`seat-${g.id}-${si}`}
                        value={seat.playerId}
                        onChange={(e) =>
                          setGroups((prev) =>
                            prev.map((x) =>
                              x.id === g.id
                                ? {
                                    ...x,
                                    seats: x.seats.map((s, i) =>
                                      si === i
                                        ? { ...s, playerId: e.target.value }
                                        : s,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="">Choose {seat.role}</option>
                        {eligible
                          .filter(
                            (p) =>
                              p.tier === tier &&
                              p.roles.includes(seat.role) &&
                              (!used.includes(p.id) || p.id === seat.playerId),
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        ))}
        <p className="muted">
          {eligible.length - new Set(used).size} attendees will remain waiting.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="btn primary"
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onPublish(groups, revision);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Publishing…" : "Publish reviewed groups"}
        </button>
      </fieldset>
      <button className="btn" disabled={busy} onClick={onCancel}>
        Close proposal
      </button>
    </div>
  );
}

export default function CoffeeKeysPanel({
  event,
  players,
  isAdmin,
  refresh,
  notice,
}: {
  event: CoffeeEvent;
  players: Player[];
  isAdmin: boolean;
  refresh: () => Promise<void>;
  notice: (text: string) => void;
}) {
  const mine = players.filter((p) => p.isMine);
  const selectable = isAdmin ? players : mine;
  const mineSignup = event.signups.find((s) =>
    mine.some((p) => p.id === s.playerId),
  );
  const [playerId, setPlayerId] = useState(mineSignup?.playerId || "");
  const [tier, setTier] = useState<KeyTier>(mineSignup?.tier || "2-5");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false);
  const assigned = new Set(
    event.groups.flatMap((g) => g.seats.map((s) => s.playerId)),
  );
  const start = DateTime.fromISO(event.startsAt);
  const local = start.toLocal();
  const canSignup = event.status === "open" && start.toMillis() > Date.now();
  async function action(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      notice(message);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div>
          <h2 className="text-2xl text-amber-300 font-bold">{event.title}</h2>
          <p className="mt-1 font-semibold">
            {local.toFormat("ccc, LLL d, yyyy · h:mm a ZZZZ")}
          </p>
          <p className="muted">
            {start.setZone(event.timezone).toFormat("h:mm a ZZZZ")} community
            time · {event.duration} minutes · {event.signups.length} signed up
          </p>
        </div>
        <span className="rounded-full bg-slate-700 px-3 py-1 text-sm">
          {event.status === "completed"
            ? "Archived"
            : canSignup
              ? "Signups open"
              : "Signups closed"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <button
          className="btn text-sm"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([calendarFile(event)], { type: "text/calendar" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "coffee-and-keys.ics";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Add to calendar
        </button>
        <button
          className="btn text-sm"
          onClick={() =>
            action(
              () =>
                navigator.clipboard.writeText(discordRoster(event, players)),
              "Roster copied for Discord.",
            )
          }
        >
          Copy Discord roster
        </button>
      </div>
      <div className="mt-5 rounded-lg bg-slate-900/50 p-4">
        <h3 className="font-semibold mb-2">My signup</h3>
        {mineSignup ? (
          <p className="text-slate-300 mb-3">
            <PlayerName
              player={players.find((p) => p.id === mineSignup.playerId)}
              role={
                event.groups
                  .flatMap((g) => g.seats)
                  .find((s) => s.playerId === mineSignup.playerId)?.role
              }
            />{" "}
            · Keys {mineSignup.tier} ·{" "}
            {assigned.has(mineSignup.playerId)
              ? "Assigned below"
              : "Waiting for a group"}
          </p>
        ) : (
          <p className="muted mb-3">
            {mine.length
              ? "Choose one of your characters for this event."
              : "Add your character to sign up."}
          </p>
        )}
        {canSignup && selectable.length > 0 && (
          <form
            className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void action(
                () =>
                  request(`/events/${event.id}/signup`, "PUT", {
                    playerId,
                    tier,
                    revision: event.revision,
                  }),
                "Signup saved. Your place is shown below.",
              );
            }}
          >
            <div>
              <label className="label" htmlFor={`signup-${event.id}`}>
                Character
              </label>
              <select
                required
                disabled={busy}
                className="field"
                id={`signup-${event.id}`}
                value={playerId}
                onChange={(e) => setPlayerId(e.target.value)}
              >
                <option value="">Choose character</option>
                {selectable.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`tier-${event.id}`}>
                Key tier
              </label>
              <select
                className="field"
                disabled={busy}
                id={`tier-${event.id}`}
                value={tier}
                onChange={(e) => setTier(e.target.value as KeyTier)}
              >
                {TIERS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <button disabled={busy} className="btn primary" type="submit">
              {busy ? "Saving…" : mineSignup ? "Update signup" : "Sign up"}
            </button>
          </form>
        )}
        {mineSignup && canSignup && (
          <button
            disabled={busy}
            className="btn mt-3"
            onClick={() =>
              action(
                () =>
                  request(`/events/${event.id}/signup`, "PUT", {
                    playerId: mineSignup.playerId,
                    cancel: true,
                    revision: event.revision,
                  }),
                "Signup canceled for this event only.",
              )
            }
          >
            Cancel my signup
          </button>
        )}
      </div>
      {error && (
        <p className="error mt-3" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5 space-y-4">
        <h3 className="text-lg font-bold">
          {event.published ? "Published groups" : "Groups not published yet"}
        </h3>
        <div className="grid md:grid-cols-2 gap-3">
          {event.groups.map((g, i) => (
            <div className="rounded-lg bg-slate-900/60 p-4" key={g.id}>
              <h4 className="font-semibold text-amber-200">
                Group {i + 1} · Keys {g.tier}{" "}
                {g.seats.length < 5 && "· Needs replacement"}
              </h4>
              <ul className="space-y-2 mt-2">
                {g.seats.map((s) => (
                  <li key={s.playerId}>
                    <RoleText role={s.role}>{s.role}:</RoleText>{" "}
                    <PlayerName
                      player={players.find((p) => p.id === s.playerId)}
                      role={s.role}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {TIERS.map((t) => {
          const waiting = event.signups.filter(
            (s) => s.tier === t && !assigned.has(s.playerId),
          );
          return (
            waiting.length > 0 && (
              <div key={t}>
                <h4 className="font-semibold">
                  Waiting · Keys {t} ({waiting.length})
                </h4>
                <p className="muted">
                  A ready group needs 1 tank, 1 healer and 3 DPS. Flexible roles
                  are considered.
                </p>
                <ul className="flex flex-wrap gap-2 mt-2">
                  {waiting.map((s) => {
                    const p = players.find((p) => p.id === s.playerId);
                    return (
                      <li
                        className="bg-slate-700 rounded px-3 py-2 text-sm"
                        key={s.playerId}
                      >
                        <PlayerName player={p} /> ·{" "}
                        <RoleLabels roles={p?.roles || []} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          );
        })}
      </div>
      {isAdmin && (
        <div className="flex flex-wrap gap-2 mt-5 border-t border-slate-600 pt-4">
          {event.status !== "completed" && (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Review groups
            </button>
          )}
          {(["open", "locked", "completed"] as const)
            .filter((s) => s !== event.status)
            .map((s) => (
              <button
                disabled={busy}
                className="btn"
                key={s}
                onClick={() =>
                  action(
                    () =>
                      request(`/events/${event.id}/status`, "PUT", {
                        status: s,
                        revision: event.revision,
                      }),
                    s === "completed"
                      ? "Event archived. Its records are preserved."
                      : "Event status updated.",
                  )
                }
              >
                {s === "open"
                  ? "Open signups"
                  : s === "locked"
                    ? "Close signups"
                    : "Archive event"}
              </button>
            ))}
        </div>
      )}
      {isAdmin && editing && (
        <GroupEditor
          event={event}
          players={players}
          onCancel={() => setEditing(false)}
          onPublish={async (groups, revision) => {
            await request(`/events/${event.id}/groups`, "PUT", {
              groups,
              revision,
            });
            setEditing(false);
            notice("Reviewed groups published.");
            await refresh();
          }}
        />
      )}
    </section>
  );
}
