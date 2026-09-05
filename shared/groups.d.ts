import type { Role, KeyTier, Group, Player } from "../types";
export const ROLES: Role[];
export const TIERS: KeyTier[];
export function seatPlayers(
  people: Pick<Player, "id" | "roles" | "memberId">[],
  roles: Role[],
): { playerId: string; role: Role }[] | null;
export function planGroups(
  people: (Pick<Player, "id" | "roles" | "memberId"> & { tier: KeyTier })[],
  tier: KeyTier,
): Group[];
