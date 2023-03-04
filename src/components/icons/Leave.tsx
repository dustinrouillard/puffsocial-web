import { SVGProps } from "react";

export function Leave(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 20 20"
      {...props}
    >
      <g
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2"
      >
        <path
          stroke-linejoin="round"
          d="m15.667 8l2.083 2.5L15.667 8Zm0 5l2.083-2.5l-2.083 2.5Z"
          clip-rule="evenodd"
        />
        <path d="M16.5 10.5H10m-6-7h9m-9 14h9m0-14v4m0 6v4m-9-14v14" />
      </g>
    </svg>
  );
}
