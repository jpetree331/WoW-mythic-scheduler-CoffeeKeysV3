import React from "react";
import { Role } from "../types";
import { ROLES } from "../constants";
import TankIcon from "./icons/TankIcon";
import HealerIcon from "./icons/HealerIcon";
import DpsIcon from "./icons/DpsIcon";

interface RoleSelectorProps {
  selectedRoles: Role[];
  onToggleRole: (role: Role) => void;
}

const roleIcons: { [key in Role]: React.ReactNode } = {
  [Role.TANK]: <TankIcon className="w-6 h-6 mr-2" />,
  [Role.HEALER]: <HealerIcon className="w-6 h-6 mr-2" />,
  [Role.DPS]: <DpsIcon className="w-6 h-6 mr-2" />,
};

const roleColors = {
  [Role.TANK]: "border-blue-500 bg-blue-500/20 hover:bg-blue-500/30",
  [Role.HEALER]: "border-green-500 bg-green-500/20 hover:bg-green-500/30",
  [Role.DPS]: "border-red-500 bg-red-500/20 hover:bg-red-500/30",
};

const selectedRoleColors = {
  [Role.TANK]: "border-blue-400 bg-blue-500/40 ring-2 ring-blue-400",
  [Role.HEALER]: "border-green-400 bg-green-500/40 ring-2 ring-green-400",
  [Role.DPS]: "border-red-400 bg-red-500/40 ring-2 ring-red-400",
};

const RoleSelector: React.FC<RoleSelectorProps> = ({
  selectedRoles,
  onToggleRole,
}) => {
  return (
    <div className="grid grid-cols-3 gap-3">
      {ROLES.map((role) => (
        <button
          key={role}
          type="button"
          aria-pressed={selectedRoles.includes(role)}
          onClick={() => onToggleRole(role)}
          className={`flex items-center justify-center p-3 rounded-md border text-base font-semibold transition-all duration-200 
            ${
              selectedRoles.includes(role)
                ? selectedRoleColors[role]
                : `${roleColors[role]} text-gray-300`
            }`}
        >
          {roleIcons[role]}
          {role}
        </button>
      ))}
    </div>
  );
};

export default RoleSelector;
