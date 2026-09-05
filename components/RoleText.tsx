import { Fragment, type ReactNode } from "react";
import type { Player, Role } from "../types";

export function RoleText({
  role,
  children,
}: {
  role?: Role;
  children: ReactNode;
}) {
  return (
    <span className="role-text" data-role={role}>
      {children}
    </span>
  );
}

export function PlayerName({
  player,
  role,
}: {
  player?: Pick<Player, "name" | "roles">;
  role?: Role;
}) {
  // A flexible character has no single role until assigned to a group.
  const displayRole =
    role ?? (player?.roles.length === 1 ? player.roles[0] : undefined);
  return (
    <RoleText role={displayRole}>
      {player?.name || "Unavailable character"}
    </RoleText>
  );
}

export function RoleLabels({ roles }: { roles: Role[] }) {
  return (
    <>
      {roles.map((role, index) => (
        <Fragment key={role}>
          {index > 0 && " / "}
          <RoleText role={role}>{role}</RoleText>
        </Fragment>
      ))}
    </>
  );
}
