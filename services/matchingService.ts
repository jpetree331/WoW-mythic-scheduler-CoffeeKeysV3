import { DateTime } from "luxon";
import { Player, Match, Role } from "../types";
import { DAYS_OF_WEEK } from "../constants";
import { previewSeats } from "../shared/groups.js";

export function findOverlaps(
  players: Player[],
  week = DateTime.now()
    .setZone("America/New_York")
    .startOf("week")
    .toISODate()!,
): Match[] {
  const intervals: Record<
    string,
    { start: number; end: number; player: Player }[]
  > = Object.fromEntries(DAYS_OF_WEEK.map((d) => [d, []]));
  for (const p of players) {
    if (
      !p.availability ||
      typeof p.availability !== "object" ||
      !Array.isArray(p.roles)
    )
      continue;
    const monday = DateTime.fromISO(week, { zone: p.timezone }).startOf("week");
    if (!monday.isValid) continue;
    for (const [day, slots] of Object.entries(p.availability)) {
      const dayIndex = DAYS_OF_WEEK.indexOf(day);
      if (dayIndex < 0 || !Array.isArray(slots)) continue;
      for (const s of slots) {
        if (
          !s ||
          !Number.isInteger(s.start) ||
          !Number.isInteger(s.end) ||
          s.start < 0 ||
          s.end > 1440 ||
          s.end <= s.start
        )
          continue;
        const date = monday.plus({ days: dayIndex });
        const wall = (minute: number, end: boolean) => {
          if (minute === 1440) return date.plus({ days: 1 }).startOf("day");
          const dt = date.set({
            hour: Math.floor(minute / 60),
            minute: minute % 60,
            second: 0,
            millisecond: 0,
          });
          if (dt.hour * 60 + dt.minute !== minute) return null; // nonexistent spring-forward time
          const possible = dt
            .getPossibleOffsets()
            .sort((a, b) => a.toMillis() - b.toMillis());
          // Weekly rules cannot choose between two identical wall-clock times.
          // Skip these endpoints rather than manufacture an extra hour of availability.
          return possible.length === 1 ? possible[0] : null;
        };
        const start = wall(s.start, false),
          end = wall(s.end, true);
        if (!start || !end) continue;
        let cursor = start.setZone("America/New_York");
        const finish = end.setZone("America/New_York");
        if (
          cursor.getPossibleOffsets().length !== 1 ||
          finish.getPossibleOffsets().length !== 1
        )
          continue;
        while (cursor < finish) {
          const nextDay = cursor.plus({ days: 1 }).startOf("day");
          const limit = finish < nextDay ? finish : nextDay;
          const target = DAYS_OF_WEEK[cursor.weekday - 1];
          const a = cursor.hour * 60 + cursor.minute;
          const b = limit.equals(nextDay)
            ? 1440
            : limit.hour * 60 + limit.minute;
          if (b > a) intervals[target].push({ start: a, end: b, player: p });
          cursor = limit;
        }
      }
    }
  }
  const result: Match[] = [];
  for (const day of DAYS_OF_WEEK) {
    const spans = intervals[day];
    const points = [...new Set(spans.flatMap((s) => [s.start, s.end]))].sort(
      (a, b) => a - b,
    );
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i],
        end = points[i + 1];
      const available = [
        ...new Map(
          spans
            .filter((s) => s.start <= start && s.end >= end)
            .map((s) => [s.player.id, s.player]),
        ).values(),
      ].sort((a, b) => a.id.localeCompare(b.id));
      if (available.length < 2) continue;
      const last = result.at(-1);
      if (
        last?.day === day &&
        last.end === start &&
        last.players.map((p) => p.id).join(",") ===
          available.map((p) => p.id).join(",")
      )
        last.end = end;
      else result.push({ day, start, end, players: available });
    }
  }
  return result;
}
export function formatTime(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60),
    m = normalized % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
export const weeklySeats = (players: Player[]) =>
  // An edit key grants access, but does not identify who plays a character.
  // Organizers can manage several people's characters under the same key.
  previewSeats(
    players.map((p) => ({ ...p, memberId: p.id })),
    [Role.TANK, Role.HEALER, Role.DPS, Role.DPS, Role.DPS],
  );
export const isFullGroup = (match: Match) =>
  weeklySeats(match.players).every((seat) => seat.playerId !== null);
