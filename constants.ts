import { Role } from "./types";

export const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const ROLES = [Role.TANK, Role.HEALER, Role.DPS];

export const TIME_OPTIONS = (() => {
  const options: { label: string; value: number }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const totalMinutes = h * 60 + m;
      const period = h >= 12 ? "PM" : "AM";
      const hour = h % 12 === 0 ? 12 : h % 12;
      const minute = m === 0 ? "00" : "30";
      const label = `${hour}:${minute} ${period}`;
      options.push({ label, value: totalMinutes });
    }
  }
  return options;
})();

// Common US timezones
export const US_TIMEZONES: { id: string; label: string }[] = [
  { id: "America/New_York", label: "Eastern (ET)" },
  { id: "America/Chicago", label: "Central (CT)" },
  { id: "America/Denver", label: "Mountain (MT)" },
  { id: "America/Los_Angeles", label: "Pacific (PT)" },
  { id: "America/Phoenix", label: "Arizona (MST, no DST)" },
  { id: "America/Anchorage", label: "Alaska (AKT)" },
  { id: "Pacific/Honolulu", label: "Hawaii (HST)" },
];

export const WOW_CLASSES = [
  "Death Knight",
  "Demon Hunter",
  "Druid",
  "Evoker",
  "Hunter",
  "Mage",
  "Monk",
  "Paladin",
  "Priest",
  "Rogue",
  "Shaman",
  "Warlock",
  "Warrior",
];
