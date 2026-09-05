import { DateTime } from "luxon";
import type { CoffeeEvent, Player } from "../types";
export function discordRoster(event: CoffeeEvent, players: Player[]) {
  const names = new Map(
    players.map((p) => [p.id, p.name.replace(/[\r\n`*_~<>@]/g, "")]),
  );
  return `${event.title.replace(/[\r\n`*_~<>@]/g, "")}\n<t:${Math.floor(Date.parse(event.startsAt) / 1000)}:F> · ${event.duration} minutes\n${event.groups.map((g, i) => `\nGroup ${i + 1} (${g.tier})\n${g.seats.map((s) => `${s.role}: ${names.get(s.playerId) || "Unknown character"}`).join("\n")}`).join("\n")}\n\n${event.signups.length - event.groups.reduce((n, g) => n + g.seats.length, 0)} waiting for a group`;
}
export function calendarFile(event: CoffeeEvent) {
  const escape = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const stamp = (s: string) =>
    DateTime.fromISO(s).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Coffee and Keys//V3//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@coffee-keys`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(DateTime.fromISO(event.startsAt).plus({ minutes: event.duration }).toISO()!)}`,
    `SUMMARY:${escape(event.title)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // RFC 5545 folds at 75 octets, without splitting a UTF-8 character.
  return (
    lines
      .map((line) => {
        let out = "",
          width = 0;
        for (const char of line) {
          const size = new TextEncoder().encode(char).length;
          if (width + size > 75) {
            out += "\r\n ";
            width = 1;
          }
          out += char;
          width += size;
        }
        return out;
      })
      .join("\r\n") + "\r\n"
  );
}
