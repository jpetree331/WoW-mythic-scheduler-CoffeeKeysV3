import { useEffect, useState } from "react";
import type { Player, PlayerInput } from "../types";
import { Role } from "../types";
import { DAYS_OF_WEEK, US_TIMEZONES, WOW_CLASSES } from "../constants";
import { board } from "../services/api";
import { formatTime } from "../services/matchingService";

export default function AvailabilityForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Player;
  onSave: (
    data: PlayerInput & { version?: number; requestId: string },
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const draftKey = `coffee_v3_draft:${board}:${initial?.id || "new"}`;
  const blank: PlayerInput = {
    name: "",
    roles: [],
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    availability: {},
    notes: "",
    discordName: "",
    wowClass: "",
  };
  const [data, setData] = useState<PlayerInput>(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (draft && draft.version === initial?.version) return draft.data;
    } catch {
      /* ignore corrupt drafts */
    }
    return initial || blank;
  });
  const [requestId] = useState(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (draft?.requestId) return draft.requestId as string;
    } catch {}
    return crypto.randomUUID();
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ data, version: initial?.version, requestId }),
      );
    } catch {}
  }, [data, draftKey, initial?.version, requestId]);
  function change<K extends keyof PlayerInput>(key: K, value: PlayerInput[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }
  const clearDraft = () => {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {}
  };
  return (
    <section className="panel">
      <h2 className="text-xl font-bold text-amber-300 mb-2">
        {initial ? "Edit character & availability" : "Add your character"}
      </h2>
      <p className="muted mb-5">
        Save your character once, then sign up for an event. Weekly availability
        is optional.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await onSave({ ...data, version: initial?.version, requestId });
            clearDraft();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Save failed. Your draft is preserved.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="space-y-4 min-w-0">
          <div>
            <label className="label" htmlFor="character-name">
              Character name
            </label>
            <input
              required
              maxLength={80}
              className="field"
              id="character-name"
              value={data.name}
              onChange={(e) => change("name", e.target.value)}
              placeholder="Name-Realm"
            />
          </div>
          <div>
            <span className="label">Roles you can play</span>
            <div className="flex flex-wrap gap-2">
              {Object.values(Role).map((r) => (
                <button
                  type="button"
                  className={`btn ${data.roles.includes(r) ? "primary" : ""}`}
                  aria-pressed={data.roles.includes(r)}
                  key={r}
                  onClick={() =>
                    change(
                      "roles",
                      data.roles.includes(r)
                        ? data.roles.filter((x) => x !== r)
                        : [...data.roles, r],
                    )
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="character-class">
              Class (optional)
            </label>
            <select
              id="character-class"
              className="field"
              value={data.wowClass}
              onChange={(e) => change("wowClass", e.target.value)}
            >
              <option value="">Choose class</option>
              {WOW_CLASSES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="character-discord">
              Discord name (optional, visible on this board)
            </label>
            <input
              id="character-discord"
              className="field"
              maxLength={80}
              value={data.discordName}
              onChange={(e) => change("discordName", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="character-notes">
              Notes (optional)
            </label>
            <textarea
              id="character-notes"
              className="field"
              maxLength={1000}
              rows={2}
              value={data.notes}
              onChange={(e) => change("notes", e.target.value)}
              placeholder="Learning, relaxed runs, or pushing?"
            />
          </div>
          <div>
            <label className="label" htmlFor="character-timezone">
              Your timezone
            </label>
            <select
              className="field"
              id="character-timezone"
              value={data.timezone}
              onChange={(e) => change("timezone", e.target.value)}
            >
              {!US_TIMEZONES.some((t) => t.id === data.timezone) && (
                <option>{data.timezone}</option>
              )}
              {US_TIMEZONES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <details>
            <summary className="cursor-pointer font-semibold py-2">
              Weekly availability (optional)
            </summary>
            <p className="muted mb-3">
              Times are in your timezone. For overnight availability, add a slot
              on each day. Overlapping slots are combined.
            </p>
            <div className="space-y-4">
              {DAYS_OF_WEEK.map((day) => (
                <div key={day}>
                  <div className="flex justify-between items-center gap-2">
                    <h3>{day}</h3>
                    <button
                      className="btn text-sm"
                      type="button"
                      disabled={(data.availability[day]?.length || 0) >= 12}
                      onClick={() =>
                        change("availability", {
                          ...data.availability,
                          [day]: [
                            ...(data.availability[day] || []),
                            { start: 1140, end: 1260 },
                          ],
                        })
                      }
                    >
                      Add {day} slot
                    </button>
                  </div>
                  {(data.availability[day] || []).map((s, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_1fr_auto] gap-2 mt-2 items-end"
                    >
                      {(["start", "end"] as const).map((part) => (
                        <div key={part}>
                          <label
                            className="label"
                            htmlFor={`${day}-${i}-${part}`}
                          >
                            {part === "start" ? "From" : "Until"}
                          </label>
                          <select
                            className="field"
                            id={`${day}-${i}-${part}`}
                            value={s[part]}
                            onChange={(e) =>
                              change("availability", {
                                ...data.availability,
                                [day]: data.availability[day].map((slot, j) =>
                                  j === i
                                    ? {
                                        ...slot,
                                        [part]: Number(e.target.value),
                                      }
                                    : slot,
                                ),
                              })
                            }
                          >
                            {Array.from(
                              { length: part === "end" ? 49 : 48 },
                              (_, n) => n * 30,
                            ).map((n) => (
                              <option key={n} value={n}>
                                {n === 1440
                                  ? "Midnight (next day)"
                                  : formatTime(n)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                      <button
                        className="btn"
                        type="button"
                        aria-label={`Remove ${day} slot ${i + 1}`}
                        onClick={() =>
                          change("availability", {
                            ...data.availability,
                            [day]: data.availability[day].filter(
                              (_, j) => j !== i,
                            ),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn primary" type="submit">
              {busy ? "Saving…" : "Save character"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                clearDraft();
                onCancel();
              }}
            >
              Discard & close
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
