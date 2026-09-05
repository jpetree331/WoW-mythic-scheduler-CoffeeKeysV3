const { DateTime, IANAZone } = require("luxon");
const { ROLES, TIERS } = require("../shared/options.json");
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function check(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
function object(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}
function text(x, label, max, required = false) {
  check(typeof x === "string", `${label} must be text.`);
  const s = x.trim();
  check(
    s.length <= max && (!required || s.length > 0),
    `${label} must be ${required ? "1" : "0"}–${max} characters.`,
  );
  return s;
}
function boardSlug(value = "default") {
  check(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value), "Invalid board link.");
  return value;
}
function availability(input) {
  check(object(input), "Availability must contain weekdays and time slots.");
  const result = {};
  for (const [day, slots] of Object.entries(input)) {
    check(
      DAYS.includes(day) && Array.isArray(slots) && slots.length <= 12,
      "Use valid weekdays and at most 12 slots per day.",
    );
    const normalized = slots
      .map((s) => {
        check(
          object(s) &&
            Number.isInteger(s.start) &&
            Number.isInteger(s.end) &&
            s.start >= 0 &&
            s.end <= 1440 &&
            s.end > s.start,
          "Slots must end after they start in the same day. Split overnight availability across two days.",
        );
        return { start: s.start, end: s.end };
      })
      .sort((a, b) => a.start - b.start);
    const merged = [];
    for (const s of normalized) {
      const last = merged.at(-1);
      if (last && last.end >= s.start) last.end = Math.max(last.end, s.end);
      else merged.push(s);
    }
    if (merged.length) result[day] = merged;
  }
  return result;
}
function player(input) {
  check(object(input), "Invalid character details.");
  check(
    Array.isArray(input.roles) &&
      input.roles.length > 0 &&
      input.roles.length <= 3 &&
      input.roles.every((r) => ROLES.includes(r)),
    "Choose at least one valid role.",
  );
  check(
    typeof input.timezone === "string" && IANAZone.isValidZone(input.timezone),
    "Choose a valid timezone.",
  );
  return {
    name: text(input.name, "Character name", 80, true),
    roles: [...new Set(input.roles)],
    timezone: input.timezone,
    availability: availability(input.availability),
    notes: text(input.notes ?? "", "Notes", 1000),
    discordName: text(input.discordName ?? "", "Discord name", 80),
    wowClass: text(input.wowClass ?? "", "Class", 40),
  };
}
function event(input) {
  check(object(input), "Invalid event.");
  check(
    typeof input.timezone === "string" && IANAZone.isValidZone(input.timezone),
    "Choose a valid timezone.",
  );
  check(
    typeof input.startsAt === "string" &&
      /(?:Z|[+-]\d\d:\d\d)$/.test(input.startsAt),
    "Event time must include a timezone offset.",
  );
  const dt = DateTime.fromISO(input.startsAt, { setZone: true });
  check(
    dt.isValid && dt.toMillis() > Date.now() - 60_000,
    "Choose a future event time.",
  );
  check(
    Number.isInteger(input.duration) &&
      input.duration >= 30 &&
      input.duration <= 720,
    "Duration must be 30–720 minutes.",
  );
  return {
    title: text(input.title, "Event title", 100, true),
    startsAt: dt.toUTC().toISO(),
    timezone: input.timezone,
    duration: input.duration,
  };
}
function revision(value) {
  check(
    Number.isInteger(value) && value >= 0,
    "Refresh this record before saving.",
  );
  return value;
}
function tier(value) {
  check(TIERS.includes(value), "Choose a valid key tier.");
  return value;
}
module.exports = {
  HttpError,
  check,
  object,
  text,
  boardSlug,
  player,
  event,
  revision,
  tier,
  availability,
  DAYS,
};
