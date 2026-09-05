export enum Role {
  TANK = "Tank",
  HEALER = "Healer",
  DPS = "DPS",
}
export type KeyTier = "2-5" | "6-9" | "10+";
export interface TimeSlot {
  start: number;
  end: number;
}
export type Availability = Record<string, TimeSlot[]>;
export interface PlayerInput {
  name: string;
  roles: Role[];
  timezone: string;
  availability: Availability;
  notes: string;
  discordName: string;
  wowClass: string;
}
export interface Player extends PlayerInput {
  id: string;
  memberId?: string;
  version: number;
  canEdit: boolean;
  isMine: boolean;
}
export interface Match {
  day: string;
  start: number;
  end: number;
  players: Player[];
}
export interface Group {
  id: string;
  tier: KeyTier;
  seats: { playerId: string; role: Role }[];
}
export interface Signup {
  playerId: string;
  tier: KeyTier;
}
export interface CoffeeEvent {
  id: string;
  title: string;
  startsAt: string;
  timezone: string;
  duration: number;
  status: "open" | "locked" | "completed";
  revision: number;
  published: boolean;
  signups: Signup[];
  groups: Group[];
}
export interface Snapshot {
  title: string;
  players: Player[];
  events: CoffeeEvent[];
  isAdmin: boolean;
  adminConfigured: boolean;
}
