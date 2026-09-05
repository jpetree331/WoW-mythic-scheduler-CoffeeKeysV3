import { useState } from "react";
import { DateTime } from "luxon";
import { US_TIMEZONES } from "../constants";
export default function EventCreator({
  onCreate,
}: {
  onCreate: (input: {
    title: string;
    startsAt: string;
    timezone: string;
    duration: number;
  }) => Promise<void>;
}) {
  const now = DateTime.now().setZone("America/New_York");
  const next = now
    .plus({ days: (6 - now.weekday + 7) % 7 || 7 })
    .set({ hour: 12, minute: 0 });
  const [title, setTitle] = useState("Coffee & Keys"),
    [date, setDate] = useState(next.toFormat("yyyy-MM-dd'T'HH:mm"));
  const [zone, setZone] = useState("America/New_York"),
    [duration, setDuration] = useState(120);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="panel">
      <summary className="font-semibold cursor-pointer">
        Create a dated event
      </summary>
      <form
        className="space-y-3 mt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const dt = DateTime.fromISO(date, { zone });
            if (!dt.isValid || dt.toFormat("yyyy-MM-dd'T'HH:mm") !== date)
              throw new Error(
                "That local time does not exist because the clocks change. Choose another time.",
              );
            if (dt.getPossibleOffsets().length > 1)
              throw new Error(
                "That local time occurs twice because the clocks change. Choose a time outside the repeated hour.",
              );
            await onCreate({
              title,
              startsAt: dt.toUTC().toISO()!,
              timezone: zone,
              duration,
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="grid sm:grid-cols-2 gap-3 min-w-0">
          <div>
            <label className="label" htmlFor="event-title">
              Event name
            </label>
            <input
              className="field"
              id="event-title"
              value={title}
              maxLength={100}
              required
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="event-date">
              Date & start time
            </label>
            <input
              className="field"
              id="event-date"
              type="datetime-local"
              value={date}
              required
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="event-zone">
              Event timezone
            </label>
            <select
              className="field"
              id="event-zone"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
              {US_TIMEZONES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="event-duration">
              Duration (minutes)
            </label>
            <input
              className="field"
              id="event-duration"
              type="number"
              min={30}
              max={720}
              step={30}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
          {error && (
            <p className="error sm:col-span-2" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary sm:col-span-2" type="submit">
            {busy ? "Creating…" : "Create event"}
          </button>
        </fieldset>
      </form>
    </details>
  );
}
