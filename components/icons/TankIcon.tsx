import React from "react";

const TankIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path
      fillRule="evenodd"
      d="M12.75 2.25a.75.75 0 01.75.75v5.25a.75.75 0 01-1.5 0V3.41L4.22 10.94a2.25 2.25 0 00-.82 1.63V21a.75.75 0 00.75.75h13.5a.75.75 0 00.75-.75v-8.43c0-.65-.28-1.26-.74-1.68L13.5 3.41V8.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75z"
      clipRule="evenodd"
    />
    <path d="M4.125 21.375A2.625 2.625 0 011.5 18.75V12.75A2.625 2.625 0 014.125 10.125H5.25v11.25H4.125zM19.875 21.375A2.625 2.625 0 0022.5 18.75V12.75a2.625 2.625 0 00-2.625-2.625H18.75v11.25h1.125z" />
  </svg>
);

export default TankIcon;
